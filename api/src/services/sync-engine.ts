import { mkdirSync, existsSync } from 'fs';
import { join, relative, sep } from 'path';
import type { Company, AdnDistribuicaoResponse, TipoDoc, TipoNota } from '../types.js';
import { decodeAndSave, isWithinRange, type DateRange } from './xml-saver.js';
import { NsuIndex, type NsuRecord } from './nsu-index.js';

// Máximo de itens do lote decodificados/gravados em paralelo
const LOTE_CONCURRENCY = 4;
const MAX_CONSECUTIVE_ERRORS = 10;

export interface SyncOptions {
  dateRange?: DateRange;
  startNsu?: number;
  /**
   * Tipos destacados no progresso e no resumo. Default: ambos.
   * O feed do ADN entrega prestados e tomados misturados, então TUDO é sempre
   * gravado — a seleção só decide o que é contado/relatado.
   */
  tipos?: TipoNota[];
}

export interface SyncResult {
  prestados: number;
  tomados: number;
  eventos: number;
  /** Documentos gravados, porém fora do `dateRange` pedido. */
  foraPeriodo: number;
  /**
   * NSUs resolvidos pelo índice local, sem tocar a rede. Contabiliza a origem
   * do documento (disco x rede), não sua relevância: um NSU vindo do índice e
   * fora do período soma em `cache` E em `foraPeriodo`.
   */
  cache: number;
  errors: number;
  lastNsu: number;
}

type FetchFn = (nsu: number, cnpj: string) => Promise<AdnDistribuicaoResponse>;
type LogFn = (message: string) => void;

/** Dados mínimos para classificar um documento — vindo do índice ou do disco. */
type Contavel = Pick<NsuRecord, 'tipo' | 'dhEmi' | 'dhProc'>;

export async function runSync(
  company: Company,
  fetchFn: FetchFn,
  onProgress: LogFn,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const tipos = new Set<TipoDoc>(options.tipos ?? ['prestados', 'tomados']);
  const companyDir = join(company.outputFolder, company.nome);
  mkdirSync(companyDir, { recursive: true });
  const index = NsuIndex.load(companyDir);

  let cursor = options.startNsu !== undefined ? options.startNsu : company.lastNsu + 1;
  let prestados = 0;
  let tomados = 0;
  let eventos = 0;
  let foraPeriodo = 0;
  let cache = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  // lastNsu nunca pode ultrapassar o primeiro NSU que falhou: marcá-lo como
  // processado faria o documento nunca mais ser buscado.
  let firstErrorNsu: number | null = null;

  const conta = (rec: Contavel, fromCache: boolean): void => {
    if (fromCache) cache++;
    if (!isWithinRange(rec, options.dateRange)) {
      foraPeriodo++;
      return;
    }
    if (rec.tipo === 'eventos') eventos++;
    else if (tipos.has(rec.tipo)) {
      if (rec.tipo === 'prestados') prestados++;
      else tomados++;
    }
  };

  /** O registro do índice só vale se o arquivo ainda estiver no disco. */
  const noDisco = (rec: NsuRecord): boolean => existsSync(join(companyDir, rec.arquivo));

  while (true) {
    // 1) Resolve pelo índice, sem rede — o ganho da re-busca por período.
    let cacheRun = 0;
    for (let rec = index.get(cursor); rec && noDisco(rec); rec = index.get(cursor)) {
      conta(rec, true);
      cursor++;
      cacheRun++;
    }
    if (cacheRun > 0) {
      onProgress(`NSU ${cursor - cacheRun}–${cursor - 1} → já baixados (índice), sem rede`);
    }

    // 2) Gap → rede.
    let response: AdnDistribuicaoResponse;
    try {
      response = await fetchFn(cursor, company.cnpj);
      consecutiveErrors = 0;
    } catch (err) {
      errors++;
      consecutiveErrors++;
      firstErrorNsu ??= cursor;
      onProgress(`[ERRO] NSU ${cursor}: ${(err as Error).message}`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        onProgress(`[FATAL] ${MAX_CONSECUTIVE_ERRORS} erros consecutivos — sync abortado.`);
        break;
      }
      cursor++;
      continue;
    }

    if (response.StatusProcessamento === 'NENHUM_DOCUMENTO_LOCALIZADO') {
      // NENHUM num gap abaixo do máximo indexado = NSUs antigos já expirados no
      // servidor. Salta para o próximo NSU conhecido (sempre > cursor, senão o
      // loop repetiria eternamente o mesmo fetch) e volta a resolver do índice.
      const next = index.nextKnownNsu(cursor + 1);
      if (next !== undefined) {
        cursor = next;
        continue;
      }
      break;
    }

    if (response.StatusProcessamento === 'REJEICAO') {
      const msg = response.Erros?.map(e => e.Descricao).join(', ') ?? 'Rejeição sem detalhes';
      onProgress(`[REJEIÇÃO] NSU ${cursor}: ${msg}`);
      break;
    }

    // 3) Grava o lote — itens em batches paralelos.
    const cursorAntes = cursor;
    const itens = response.LoteDFe ?? [];
    for (let i = 0; i < itens.length; i += LOTE_CONCURRENCY) {
      const batch = itens.slice(i, i + LOTE_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(item =>
          decodeAndSave(
            item.ArquivoXml,
            item.NSU,
            company.cnpj,
            company.outputFolder,
            company.nome,
            index
          )
        )
      );

      for (let j = 0; j < batch.length; j++) {
        const nsu = batch[j].NSU;
        const result = results[j];
        if (result.status === 'rejected') {
          errors++;
          firstErrorNsu ??= nsu;
          onProgress(`[ERRO] NSU ${nsu}: ${(result.reason as Error).message}`);
        } else {
          const saved = result.value;
          index.set(nsu, {
            chave: saved.chaveAcesso,
            tipo: saved.tipo,
            dhEmi: saved.dhEmi,
            dhProc: saved.dhProc,
            // Índice guarda caminho relativo com "/" — mesma convenção do xml-saver
            arquivo: relative(companyDir, saved.filePath).split(sep).join('/'),
            eventoTipo: saved.eventoTipo,
          });
          conta(saved, false);
          const rotulo = saved.eventoTipo === 'cancelamento' ? 'cancelamento'
            : saved.eventoTipo === 'substituicao' ? 'substituição'
              : saved.eventoTipo === 'outro' ? 'evento'
                : saved.tipo;
          const sufixo = isWithinRange(saved, options.dateRange) ? 'salvo' : 'salvo (fora do período)';
          onProgress(`NSU ${nsu} → ${rotulo} (${saved.competencia}) ${sufixo}`);
        }
        if (nsu >= cursor) cursor = nsu + 1;
      }
    }
    // Lote vazio (ou só com NSUs abaixo do cursor) não pode travar o loop.
    if (cursor === cursorAntes) cursor++;
  }

  index.save();

  const lastNsu = firstErrorNsu !== null ? Math.min(firstErrorNsu - 1, cursor - 1) : cursor - 1;
  return { prestados, tomados, eventos, foraPeriodo, cache, errors, lastNsu };
}

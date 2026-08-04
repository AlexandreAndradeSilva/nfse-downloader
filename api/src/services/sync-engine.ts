import { mkdirSync } from 'fs';
import { join, relative, sep } from 'path';
import type { Company, AdnDistribuicaoResponse } from '../types.js';
import { decodeAndSave, isWithinRange, type DateRange } from './xml-saver.js';
import { NsuIndex } from './nsu-index.js';

// Máximo de itens do lote processados em paralelo (XML + PDF simultâneos)
const LOTE_CONCURRENCY = 4;

export interface SyncOptions {
  dateRange?: DateRange;
  /** @deprecated PDF saiu do fluxo de sync — gerado sob demanda. Ignorado aqui. */
  gerarPdf?: boolean;
  startNsu?: number;
}

export interface SyncResult {
  prestados: number;
  tomados: number;
  eventos: number;
  pulados: number;
  errors: number;
  lastNsu: number;
}

type FetchFn = (nsu: number, cnpj: string) => Promise<AdnDistribuicaoResponse>;
type LogFn = (message: string) => void;

export async function runSync(
  company: Company,
  fetchFn: FetchFn,
  onProgress: LogFn,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const companyDir = join(company.outputFolder, company.nome);
  mkdirSync(companyDir, { recursive: true });
  const index = NsuIndex.load(companyDir);

  let currentNsu = options.startNsu !== undefined ? options.startNsu : company.lastNsu + 1;
  let prestados = 0;
  let tomados = 0;
  let eventos = 0;
  let pulados = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;

  while (true) {
    let response: AdnDistribuicaoResponse;
    try {
      response = await fetchFn(currentNsu, company.cnpj);
      consecutiveErrors = 0;
    } catch (err) {
      errors++;
      consecutiveErrors++;
      onProgress(`[ERRO] NSU ${currentNsu}: ${(err as Error).message}`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        onProgress(`[FATAL] ${MAX_CONSECUTIVE_ERRORS} erros consecutivos — sync abortado.`);
        break;
      }
      currentNsu++;
      continue;
    }

    if (response.StatusProcessamento === 'NENHUM_DOCUMENTO_LOCALIZADO') break;

    if (response.StatusProcessamento === 'REJEICAO') {
      const msg = response.Erros?.map(e => e.Descricao).join(', ') ?? 'Rejeição sem detalhes';
      onProgress(`[REJEIÇÃO] NSU ${currentNsu}: ${msg}`);
      break;
    }

    const lote = response.LoteDFe ?? [];
    // Processa itens do lote em batches paralelos (decodificação gzip concorrente)
    for (let i = 0; i < lote.length; i += LOTE_CONCURRENCY) {
      const batch = lote.slice(i, i + LOTE_CONCURRENCY);
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
          onProgress(`[ERRO] NSU ${nsu}: ${(result.reason as Error).message}`);
        } else {
          const saved = result.value;
          index.set(nsu, {
            chave: saved.chaveAcesso,
            tipo: saved.tipo,
            dhEmi: saved.dhEmi,
            dhProc: saved.dhProc,
            arquivo: relative(companyDir, saved.filePath).split(sep).join('/'),
            eventoTipo: saved.eventoTipo,
          });

          // O documento sempre é gravado; o período só decide como ele é contado/reportado
          if (!isWithinRange(saved, options.dateRange)) {
            pulados++;
            onProgress(`NSU ${nsu} → salvo (fora do período)`);
          } else if (saved.tipo === 'eventos') {
            eventos++;
            const tipoEvt = saved.eventoTipo === 'cancelamento' ? 'cancelamento'
              : saved.eventoTipo === 'substituicao' ? 'substituição' : 'evento';
            onProgress(`NSU ${nsu} → ${tipoEvt} (${saved.competencia}) salvo`);
          } else {
            if (saved.tipo === 'prestados') prestados++;
            else tomados++;
            onProgress(`NSU ${nsu} → ${saved.tipo} (${saved.competencia}) salvo`);
          }
        }
        if (nsu >= currentNsu) currentNsu = nsu + 1;
      }
    }
  }

  index.save();

  return { prestados, tomados, eventos, pulados, errors, lastNsu: currentNsu - 1 };
}

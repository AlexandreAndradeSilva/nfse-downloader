import type { Company, AdnDistribuicaoResponse } from '../types.js';
import { decodeAndSave, type DateRange } from './xml-saver.js';

// Máximo de itens do lote processados em paralelo (XML + PDF simultâneos)
const LOTE_CONCURRENCY = 4;

export interface SyncOptions {
  dateRange?: DateRange;
  gerarPdf: boolean;
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
  options: SyncOptions = { gerarPdf: false }
): Promise<SyncResult> {
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
    // Processa itens em batches paralelos — cada item pode baixar XML + PDF ao mesmo tempo
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
            options.dateRange,
            options.gerarPdf
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
          if (saved === null) {
            pulados++;
            onProgress(`NSU ${nsu} → fora do período, pulado`);
          } else if (saved.tipo === 'eventos') {
            eventos++;
            const tipoEvt = saved.eventoTipo === 'cancelamento' ? 'cancelamento'
              : saved.eventoTipo === 'substituicao' ? 'substituição' : 'evento';
            onProgress(`NSU ${nsu} → ${tipoEvt} (${saved.competencia}) salvo`);
          } else {
            if (saved.tipo === 'prestados') prestados++;
            else tomados++;
            const pdfNote = options.gerarPdf ? ' + PDF' : '';
            onProgress(`NSU ${nsu} → ${saved.tipo} (${saved.competencia}) salvo${pdfNote}`);
          }
        }
        if (nsu >= currentNsu) currentNsu = nsu + 1;
      }
    }
  }

  return { prestados, tomados, eventos, pulados, errors, lastNsu: currentNsu - 1 };
}

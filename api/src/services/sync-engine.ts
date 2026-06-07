import type { Company, AdnDistribuicaoResponse } from '../types.js';
import { decodeAndSave, type DateRange } from './xml-saver.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// Delay entre chamadas à API ADN para evitar rate limiting (429)
const DELAY_ENTRE_REQUESTS_MS = 400;

export interface SyncOptions {
  dateRange?: DateRange;
  gerarPdf: boolean;
}

export interface SyncResult {
  prestados: number;
  tomados: number;
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
  let currentNsu = company.lastNsu + 1;
  let prestados = 0;
  let tomados = 0;
  let pulados = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  while (true) {
    await sleep(DELAY_ENTRE_REQUESTS_MS);

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
    for (const item of lote) {
      const nsu = item.NSU;
      try {
        const saved = await decodeAndSave(
          item.ArquivoXml,
          nsu,
          company.cnpj,
          company.outputFolder,
          company.nome,
          options.dateRange,
          options.gerarPdf
        );
        if (saved === null) {
          pulados++;
          onProgress(`NSU ${nsu} → fora do período, pulado`);
        } else {
          if (saved.tipo === 'prestados') prestados++;
          else tomados++;
          const pdfNote = options.gerarPdf ? ' + PDF' : '';
          onProgress(`NSU ${nsu} → ${saved.tipo} (${saved.competencia}) salvo${pdfNote}`);
        }
        if (nsu >= currentNsu) currentNsu = nsu + 1;
      } catch (err) {
        errors++;
        onProgress(`[ERRO] NSU ${nsu}: ${(err as Error).message}`);
        currentNsu = nsu + 1;
      }
    }
  }

  return { prestados, tomados, pulados, errors, lastNsu: currentNsu - 1 };
}

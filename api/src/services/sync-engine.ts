import type { Company, AdnDistribuicaoResponse } from '../types.js';
import { decodeAndSave } from './xml-saver.js';

export interface SyncResult {
  prestados: number;
  tomados: number;
  errors: number;
  lastNsu: number;
}

type FetchFn = (nsu: number, cnpj: string) => Promise<AdnDistribuicaoResponse>;
type LogFn = (message: string) => void;

export async function runSync(
  company: Company,
  fetchFn: FetchFn,
  onProgress: LogFn
): Promise<SyncResult> {
  let currentNsu = company.lastNsu + 1;
  let prestados = 0;
  let tomados = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

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

    if (response.StatusProcessamento === 'NENHUM_DOCUMENTO_LOCALIZADO') {
      break;
    }

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
          company.nome
        );
        if (saved.tipo === 'prestados') prestados++;
        else tomados++;
        onProgress(`NSU ${nsu} → ${saved.tipo} (${saved.competencia}) salvo`);
        if (nsu >= currentNsu) currentNsu = nsu + 1;
      } catch (err) {
        errors++;
        onProgress(`[ERRO] NSU ${nsu}: ${(err as Error).message}`);
        currentNsu = nsu + 1;
      }
    }
  }

  return { prestados, tomados, errors, lastNsu: currentNsu - 1 };
}

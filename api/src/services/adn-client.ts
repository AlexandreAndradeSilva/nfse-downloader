import https from 'https';
import { readFileSync } from 'fs';
import fetch from 'node-fetch';
import type { AdnDistribuicaoResponse } from '../types.js';

export interface AdnClientOptions {
  baseUrl: string;
  pfxPath: string;
  pfxPassword: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const agentCache = new Map<string, https.Agent>();

function getCachedAgent(pfxPath: string, pfxPassword: string): https.Agent {
  const key = `${pfxPath}::${pfxPassword}`;
  if (!agentCache.has(key)) {
    const pfx = readFileSync(pfxPath);
    agentCache.set(key, new https.Agent({ pfx, passphrase: pfxPassword, rejectUnauthorized: true, keepAlive: true }));
  }
  return agentCache.get(key)!;
}

export async function fetchDFeLote(
  opts: AdnClientOptions,
  nsu: number,
  cnpj: string
): Promise<AdnDistribuicaoResponse> {
  const agent = getCachedAgent(opts.pfxPath, opts.pfxPassword);
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  const url = `${opts.baseUrl}/DFe/${nsu}?cnpjConsulta=${cnpjLimpo}&lote=true`;

  // Retry automático para 429 Too Many Requests (espera progressiva)
  const delays = [3000, 8000, 15000]; // 3s, 8s, 15s
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      await sleep(delays[attempt - 1]);
    }

    const res = await fetch(url, {
      agent,
      headers: { Accept: 'application/json' },
    });

    if (res.status === 429) {
      lastError = new Error(`ADN 429: rate limit atingido (tentativa ${attempt + 1})`);
      continue; // tenta novamente após o delay
    }

    // HTTP 404 do ADN = NENHUM_DOCUMENTO_LOCALIZADO (resposta válida, não erro)
    if (res.status === 404) {
      return {
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null,
        Alertas: null,
        Erros: null,
      };
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ADN ${res.status}: ${body}`);
    }

    return res.json() as Promise<AdnDistribuicaoResponse>;
  }

  throw lastError ?? new Error('ADN: falha após múltiplas tentativas');
}

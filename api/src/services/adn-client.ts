import https from 'https';
import { readFileSync } from 'fs';
import fetch from 'node-fetch';
import type { AdnDistribuicaoResponse } from '../types.js';

export interface AdnClientOptions {
  baseUrl: string;
  pfxPath: string;
  pfxPassword: string;
}

let sleepFn: (ms: number) => Promise<void> = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Permite injetar um sleep instantâneo (ou instrumentado) nos testes. */
export function __setSleepForTests(fn: (ms: number) => Promise<void>): void {
  sleepFn = fn;
}

const agentCache = new Map<string, https.Agent>();

function getCachedAgent(pfxPath: string, pfxPassword: string): https.Agent | undefined {
  if (!pfxPath) return undefined; // testes: sem certificado, sem agent
  const key = `${pfxPath}::${pfxPassword}`;
  if (!agentCache.has(key)) {
    const pfx = readFileSync(pfxPath);
    agentCache.set(key, new https.Agent({ pfx, passphrase: pfxPassword, rejectUnauthorized: true, keepAlive: true }));
  }
  return agentCache.get(key)!;
}

// Escada de retry padrão quando o servidor não manda Retry-After.
const RETRY_LADDER_MS = [3000, 8000, 15000];
const JITTER_FACTOR = 0.3; // até +30%

function withJitter(ms: number): number {
  return ms * (1 + Math.random() * JITTER_FACTOR);
}

/**
 * Interpreta o header Retry-After: número de segundos ou data HTTP (RFC 7231).
 * Retorna null se ausente ou não reconhecível — chamador cai na escada padrão.
 */
function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());

  return null;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503;
}

export async function fetchDFeLote(
  opts: AdnClientOptions,
  nsu: number,
  cnpj: string,
  fetchImpl: typeof fetch = fetch
): Promise<AdnDistribuicaoResponse> {
  const agent = getCachedAgent(opts.pfxPath, opts.pfxPassword);
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  const url = `${opts.baseUrl}/DFe/${nsu}?cnpjConsulta=${cnpjLimpo}&lote=true`;

  // Retry automático para 429 (rate limit) e 503 (indisponibilidade temporária).
  // Usa Retry-After do servidor quando presente, senão a escada progressiva com jitter.
  const MAX_ATTEMPTS = RETRY_LADDER_MS.length + 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetchImpl(url, {
      agent,
      headers: { Accept: 'application/json' },
    });

    if (isRetryableStatus(res.status)) {
      lastError = new Error(`ADN ${res.status}: indisponível/rate limit (tentativa ${attempt + 1})`);
      const hasMoreAttempts = attempt < MAX_ATTEMPTS - 1;
      if (hasMoreAttempts) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
        const baseDelayMs = retryAfterMs ?? RETRY_LADDER_MS[attempt];
        await sleepFn(withJitter(baseDelayMs));
      }
      continue; // tenta novamente
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

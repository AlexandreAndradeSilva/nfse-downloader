import https from 'https';
import { readFileSync } from 'fs';
import nodeFetch from 'node-fetch';

const DANFSE_BASE_URL = 'https://adn.nfse.gov.br/danfse';
const TIMEOUT_MS = 5000;
const MAX_FALHAS_CONSECUTIVAS = 3;

let falhasConsecutivas = 0;
let breakerAberto = false;

export function resetDanfseBreaker(): void {
  falhasConsecutivas = 0;
  breakerAberto = false;
}

export function isDanfseBreakerOpen(): boolean {
  return breakerAberto;
}

const agentCache = new Map<string, https.Agent>();

function getCachedAgent(pfxPath: string, pfxPassword: string): https.Agent | undefined {
  if (!pfxPath) return undefined; // testes: sem certificado, sem agent
  const key = `${pfxPath}::${pfxPassword}`;
  if (!agentCache.has(key)) {
    agentCache.set(key, new https.Agent({
      pfx: readFileSync(pfxPath),
      passphrase: pfxPassword,
      rejectUnauthorized: true,
      keepAlive: true,
    }));
  }
  return agentCache.get(key);
}

/**
 * Interface mínima do que esta função usa de uma implementação de fetch.
 * `node-fetch` v3 satisfaz esse contrato; testes podem injetar um mock
 * sem precisar reimplementar o `Response` inteiro do node-fetch.
 */
export interface MinimalFetch {
  (url: string, init?: {
    agent?: https.Agent;
    headers?: Record<string, string>;
    signal?: unknown;
  }): Promise<{
    ok: boolean;
    status: number;
    arrayBuffer(): Promise<ArrayBuffer>;
    text(): Promise<string>;
  }>;
}

/**
 * Baixa o DANFSe oficial do ADN NFS-e (mTLS com certificado do contribuinte).
 *
 * Uma tentativa por chamada, timeout curto. Após MAX_FALHAS_CONSECUTIVAS falhas
 * consecutivas, o breaker abre e as chamadas seguintes retornam null sem tocar
 * a rede — o chamador cai no gerador local. Um sucesso reabilita (zera o contador).
 *
 * Retorna null em qualquer falha (nunca lança) — o PDF oficial é um bônus, não
 * um requisito: quem chama trata null como "gerar localmente".
 */
export async function downloadDanfsePdf(
  chaveAcesso: string,
  pfxPath: string,
  pfxPassword: string,
  fetchImpl: MinimalFetch = nodeFetch as unknown as MinimalFetch,
): Promise<Buffer | null> {
  if (breakerAberto) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${DANFSE_BASE_URL}/${chaveAcesso}`, {
      agent: getCachedAgent(pfxPath, pfxPassword),
      headers: { Accept: 'application/pdf' },
      signal: controller.signal,
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      falhasConsecutivas = 0;
      return buf;
    }
    registrarFalha(`HTTP ${res.status}`);
    return null;
  } catch (err) {
    registrarFalha((err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function registrarFalha(motivo: string): void {
  falhasConsecutivas++;
  if (falhasConsecutivas >= MAX_FALHAS_CONSECUTIVAS && !breakerAberto) {
    breakerAberto = true;
    console.warn(`[DANFSe] ADN indisponível (${motivo}) após ${MAX_FALHAS_CONSECUTIVAS} tentativas — usando gerador local no restante desta execução.`);
  }
}

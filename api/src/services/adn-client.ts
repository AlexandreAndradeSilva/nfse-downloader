import https from 'https';
import { readFileSync } from 'fs';
import fetch from 'node-fetch';
import type { AdnDistribuicaoResponse } from '../types.js';

export interface AdnClientOptions {
  baseUrl: string;
  pfxPath: string;
  pfxPassword: string;
}

export async function fetchDFeLote(
  opts: AdnClientOptions,
  nsu: number,
  cnpj: string
): Promise<AdnDistribuicaoResponse> {
  const pfx = readFileSync(opts.pfxPath);
  const agent = new https.Agent({
    pfx,
    passphrase: opts.pfxPassword,
    rejectUnauthorized: true,
  });

  const url = `${opts.baseUrl}/DFe/${nsu}?cnpjConsulta=${cnpj}&lote=true`;

  const res = await fetch(url, {
    agent,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ADN ${res.status}: ${body}`);
  }

  return res.json() as Promise<AdnDistribuicaoResponse>;
}

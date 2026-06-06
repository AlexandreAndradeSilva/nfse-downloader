import { describe, it, expect, vi, afterEach } from 'vitest';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { runSync } from '../src/services/sync-engine.js';
import type { AdnDistribuicaoResponse, Company } from '../src/types.js';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const OUTPUT = join(process.cwd(), 'test-sync-output');

async function makeXmlB64(cnpjPrestador: string, nsu: number): Promise<string> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe><infNFSe>
  <chNFSe>2106${String(nsu).padStart(20,'0')}</chNFSe>
  <dCompet>2026-06-10</dCompet>
  <prestador><CNPJ>${cnpjPrestador}</CNPJ></prestador>
  <tomador><CNPJ>98765432000199</CNPJ></tomador>
</infNFSe></NFSe>`;
  return (await gzip(Buffer.from(xml, 'utf-8'))).toString('base64');
}

const company: Company = {
  cnpj: '12345678000100',
  nome: 'Empresa Sync Teste',
  pfxPath: '/fake/cert.pfx',
  pfxPassword: 'pass',
  outputFolder: OUTPUT,
  baseUrl: 'https://fake.adn',
  ambiente: 'HOMOLOGACAO',
  lastNsu: 100,
  lastSync: null,
};

afterEach(() => {
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true });
});

describe('sync-engine', () => {
  it('salva documentos e retorna resumo correto', async () => {
    const xmlB64 = await makeXmlB64('12345678000100', 101);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS',
        LoteDFe: [{ NsuDFe: '101', XmlBase64GZip: xmlB64 }],
        Alertas: null,
        Erros: null,
      } satisfies AdnDistribuicaoResponse)
      .mockResolvedValueOnce({
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null,
        Alertas: null,
        Erros: null,
      } satisfies AdnDistribuicaoResponse);

    const events: string[] = [];
    const result = await runSync(company, mockFetch, (msg) => events.push(msg));

    expect(result.prestados).toBe(1);
    expect(result.tomados).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.lastNsu).toBe(101);
    expect(events.some(e => e.includes('NSU 101'))).toBe(true);
  });

  it('conta erro mas continua o loop quando um NSU falha', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null,
        Alertas: null,
        Erros: null,
      } satisfies AdnDistribuicaoResponse);

    const result = await runSync(company, mockFetch, () => {});
    expect(result.errors).toBe(1);
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import zlib from 'zlib';
import { promisify } from 'util';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { decodeAndSave } from '../src/services/xml-saver.js';

const gzip = promisify(zlib.gzip);

const prestadoXml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe>
  <infNFSe>
    <chNFSe>21060000000012345600001</chNFSe>
    <dCompet>2026-06-10</dCompet>
    <prestador><CNPJ>12345678000100</CNPJ></prestador>
    <tomador><CNPJ>98765432000199</CNPJ></tomador>
  </infNFSe>
</NFSe>`;

const tomadoXml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe>
  <infNFSe>
    <chNFSe>21060000000099999900001</chNFSe>
    <dCompet>2026-06-20</dCompet>
    <prestador><CNPJ>98765432000199</CNPJ></prestador>
    <tomador><CNPJ>12345678000100</CNPJ></tomador>
  </infNFSe>
</NFSe>`;

const OUTPUT = join(process.cwd(), 'test-output');

afterEach(() => {
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true });
});

async function toBase64GZip(xml: string): Promise<string> {
  const buf = await gzip(Buffer.from(xml, 'utf-8'));
  return buf.toString('base64');
}

describe('xml-saver', () => {
  it('classifica como prestado quando emitente == cnpj da empresa', async () => {
    const b64 = await toBase64GZip(prestadoXml);
    const result = await decodeAndSave(b64, 1501, '12345678000100', OUTPUT, 'Empresa Teste');
    expect(result.tipo).toBe('prestados');
    expect(result.competencia).toBe('062026');
    expect(existsSync(result.filePath)).toBe(true);
  });

  it('classifica como tomado quando emitente != cnpj da empresa', async () => {
    const b64 = await toBase64GZip(tomadoXml);
    const result = await decodeAndSave(b64, 1502, '12345678000100', OUTPUT, 'Empresa Teste');
    expect(result.tipo).toBe('tomados');
    expect(result.competencia).toBe('062026');
  });

  it('não sobrescreve arquivo existente', async () => {
    const b64 = await toBase64GZip(prestadoXml);
    const r1 = await decodeAndSave(b64, 1501, '12345678000100', OUTPUT, 'Empresa Teste');
    const { statSync } = await import('fs');
    const mtime1 = statSync(r1.filePath).mtimeMs;
    await new Promise(r => setTimeout(r, 10));
    await decodeAndSave(b64, 1501, '12345678000100', OUTPUT, 'Empresa Teste');
    const mtime2 = statSync(r1.filePath).mtimeMs;
    expect(mtime1).toBe(mtime2);
  });
});

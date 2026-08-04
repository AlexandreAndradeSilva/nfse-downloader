import { describe, it, expect, afterEach } from 'vitest';
import zlib from 'zlib';
import { promisify } from 'util';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { decodeAndSave } from '../src/services/xml-saver.js';

const gzip = promisify(zlib.gzip);

function makeXml(cnpjPrestador: string, dCompet: string, dhEmi: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS21060000000012345600001">
    <xLocEmi>SAO PAULO</xLocEmi><xLocPrestacao>SAO PAULO</xLocPrestacao>
    <nNFSe>1</nNFSe><cLocIncid>3550308</cLocIncid><xLocIncid>SAO PAULO</xLocIncid>
    <xTribNac>Serviço</xTribNac><xTribMun>Serviço</xTribMun>
    <emit>
      <CNPJ>${cnpjPrestador}</CNPJ><IM>123</IM><xNome>Empresa Prestadora</xNome>
      <enderNac><xLgr>RUA A</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>01001000</CEP></enderNac>
    </emit>
    <valores><vBC>100</vBC><vLiq>100</vLiq></valores>
    <DPS versao="1.00">
      <infDPS Id="DPS1">
        <dhEmi>${dhEmi}</dhEmi><serie>1</serie><nDPS>1</nDPS><dCompet>${dCompet}</dCompet>
        <prest><CNPJ>${cnpjPrestador}</CNPJ><regTrib><opSimpNac>3</opSimpNac></regTrib></prest>
        <toma><CNPJ>98765432000199</CNPJ><xNome>Empresa Tomadora</xNome>
          <end><endNac><cMun>3550308</cMun><CEP>01001000</CEP></endNac><xLgr>RUA B</xLgr><nro>2</nro><xBairro>Centro</xBairro></end>
        </toma>
        <serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest>
          <cServ><cTribNac>010100</cTribNac><cTribMun>001</cTribMun><xDescServ>Serviço de teste</xDescServ></cServ>
        </serv>
        <valores><vServPrest><vServ>100</vServ></vServPrest>
          <trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>2</tpRetISSQN></tribMun></trib>
        </valores>
      </infDPS>
    </DPS>
  </infNFSe>
</NFSe>`;
}

async function toBase64GZip(xml: string): Promise<string> {
  const buf = await gzip(Buffer.from(xml, 'utf-8'));
  return buf.toString('base64');
}

const OUTPUT = join(process.cwd(), 'test-output');
const CNPJ = '12345678000100';

afterEach(() => {
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true });
});

describe('xml-saver', () => {
  it('classifica como prestado quando emitente == cnpj da empresa', async () => {
    const b64 = await toBase64GZip(makeXml(CNPJ, '2026-06-10', '2026-06-10T10:00:00-03:00'));
    const result = await decodeAndSave(b64, 1501, CNPJ, OUTPUT, 'Empresa Teste');
    expect(result?.tipo).toBe('prestados');
    expect(result?.competencia).toBe('062026');
    expect(existsSync(result!.filePath)).toBe(true);
    // Nome do arquivo segue o padrão "NFS {nNFSe}.xml" (o XML de teste tem <nNFSe>1</nNFSe>)
    expect(existsSync(join(OUTPUT, 'Empresa Teste', '062026', 'prestados', 'NFS 1.xml'))).toBe(true);
  });

  it('classifica como tomado quando emitente != cnpj da empresa', async () => {
    const b64 = await toBase64GZip(makeXml('98765432000199', '2026-06-20', '2026-06-20T10:00:00-03:00'));
    const result = await decodeAndSave(b64, 1502, CNPJ, OUTPUT, 'Empresa Teste');
    expect(result?.tipo).toBe('tomados');
  });

  it('não sobrescreve arquivo existente', async () => {
    const b64 = await toBase64GZip(makeXml(CNPJ, '2026-06-10', '2026-06-10T10:00:00-03:00'));
    const r1 = await decodeAndSave(b64, 1501, CNPJ, OUTPUT, 'Empresa Teste');
    const { statSync } = await import('fs');
    const mtime1 = statSync(r1!.filePath).mtimeMs;
    await new Promise(r => setTimeout(r, 10));
    await decodeAndSave(b64, 1501, CNPJ, OUTPUT, 'Empresa Teste');
    expect(statSync(r1!.filePath).mtimeMs).toBe(mtime1);
  });

  it('retorna null quando data está fora do range', async () => {
    const b64 = await toBase64GZip(makeXml(CNPJ, '2026-06-10', '2026-06-10T10:00:00-03:00'));
    const result = await decodeAndSave(b64, 1503, CNPJ, OUTPUT, 'Empresa Teste', {
      dataInicio: new Date('2026-07-01'),
      dataFim: new Date('2026-07-31'),
    });
    expect(result).toBeNull();
    expect(existsSync(join(OUTPUT, 'Empresa Teste'))).toBe(false);
  });

  it('salva quando data está dentro do range', async () => {
    const b64 = await toBase64GZip(makeXml(CNPJ, '2026-06-10', '2026-06-10T10:00:00-03:00'));
    const result = await decodeAndSave(b64, 1504, CNPJ, OUTPUT, 'Empresa Teste', {
      dataInicio: new Date('2026-06-01'),
      dataFim: new Date('2026-06-30'),
    });
    expect(result).not.toBeNull();
    expect(result?.tipo).toBe('prestados');
  });
});

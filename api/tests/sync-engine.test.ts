import { describe, it, expect, vi, afterEach } from 'vitest';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { runSync } from '../src/services/sync-engine.js';
import type { AdnDistribuicaoResponse, Company } from '../src/types.js';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const OUTPUT = join(process.cwd(), 'test-sync-output');

async function makeXmlB64(cnpjPrestador: string, nsu: number, dCompet = '2026-06-10'): Promise<string> {
  const dhEmi = `${dCompet}T10:00:00-03:00`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS2106${String(nsu).padStart(20,'0')}">
    <xLocEmi>SAO PAULO</xLocEmi><xLocPrestacao>SAO PAULO</xLocPrestacao>
    <nNFSe>${nsu}</nNFSe><xLocIncid>SAO PAULO</xLocIncid>
    <xTribNac>Serviço</xTribNac><xTribMun>Serviço</xTribMun>
    <emit><CNPJ>${cnpjPrestador}</CNPJ><IM>1</IM><xNome>Emit</xNome>
      <enderNac><xLgr>R</xLgr><nro>1</nro><xBairro>B</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>01001000</CEP></enderNac>
    </emit>
    <valores><vBC>100</vBC><vLiq>100</vLiq></valores>
    <DPS versao="1.00"><infDPS Id="DPS${nsu}">
      <dhEmi>${dhEmi}</dhEmi><serie>1</serie><nDPS>${nsu}</nDPS><dCompet>${dCompet}</dCompet>
      <prest><CNPJ>${cnpjPrestador}</CNPJ><regTrib><opSimpNac>3</opSimpNac></regTrib></prest>
      <toma><CNPJ>98765432000199</CNPJ><xNome>Toma</xNome>
        <end><endNac><cMun>3550308</cMun><CEP>01001000</CEP></endNac><xLgr>R2</xLgr><nro>2</nro><xBairro>B2</xBairro></end>
      </toma>
      <serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest>
        <cServ><cTribNac>010100</cTribNac><cTribMun>001</cTribMun><xDescServ>Serviço ${nsu}</xDescServ></cServ>
      </serv>
      <valores><vServPrest><vServ>100</vServ></vServPrest>
        <trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>2</tpRetISSQN></tribMun></trib>
      </valores>
    </infDPS></DPS>
  </infNFSe>
</NFSe>`;
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
        LoteDFe: [{ NSU: 101, ChaveAcesso: '101', TipoDocumento: 'NFSE', ArquivoXml: xmlB64 }],
        Alertas: null, Erros: null,
      } satisfies AdnDistribuicaoResponse)
      .mockResolvedValueOnce({
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null, Alertas: null, Erros: null,
      } satisfies AdnDistribuicaoResponse);

    const events: string[] = [];
    const result = await runSync(company, mockFetch, (msg) => events.push(msg), { gerarPdf: false });

    expect(result.prestados).toBe(1);
    expect(result.tomados).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.lastNsu).toBe(101);
    expect(events.some(e => e.includes('NSU 101'))).toBe(true);
  });

  it('conta pulados quando nota está fora do período', async () => {
    const xmlB64 = await makeXmlB64('12345678000100', 102, '2026-05-10');
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS',
        LoteDFe: [{ NSU: 102, ChaveAcesso: '102', TipoDocumento: 'NFSE', ArquivoXml: xmlB64 }],
        Alertas: null, Erros: null,
      } satisfies AdnDistribuicaoResponse)
      .mockResolvedValueOnce({
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null, Alertas: null, Erros: null,
      } satisfies AdnDistribuicaoResponse);

    const result = await runSync(company, mockFetch, () => {}, {
      gerarPdf: false,
      dateRange: { dataInicio: new Date('2026-06-01'), dataFim: new Date('2026-06-30') },
    });
    expect(result.pulados).toBe(1);
    expect(result.prestados).toBe(0);
  });

  it('conta erro mas continua o loop quando um NSU falha', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null, Alertas: null, Erros: null,
      } satisfies AdnDistribuicaoResponse);

    const result = await runSync(company, mockFetch, () => {}, { gerarPdf: false });
    expect(result.errors).toBe(1);
  });
});

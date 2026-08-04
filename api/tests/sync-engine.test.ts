import { describe, it, expect, vi, afterEach } from 'vitest';
import { rmSync, existsSync, unlinkSync, readFileSync } from 'fs';
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

/** Resposta com documentos — ChaveAcesso/TipoDocumento não são usados pelo engine. */
function lote(itens: Array<{ NSU: number; ArquivoXml: string }>): AdnDistribuicaoResponse {
  return {
    StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS',
    LoteDFe: itens.map(i => ({ NSU: i.NSU, ChaveAcesso: '', TipoDocumento: 'NFSE', ArquivoXml: i.ArquivoXml })),
    Alertas: null,
    Erros: null,
  };
}

function nenhum(): AdnDistribuicaoResponse {
  return { StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO', LoteDFe: null, Alertas: null, Erros: null };
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

const JUNHO_2026 = {
  dataInicio: new Date('2026-06-01T00:00:00-03:00'),
  dataFim: new Date('2026-06-30T23:59:59-03:00'),
};

afterEach(() => {
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true });
});

describe('sync-engine', () => {
  it('salva documentos e retorna resumo correto', async () => {
    const xmlB64 = await makeXmlB64('12345678000100', 101);
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(lote([{ NSU: 101, ArquivoXml: xmlB64 }]))
      .mockResolvedValueOnce(nenhum());

    const events: string[] = [];
    const result = await runSync(company, mockFetch, (msg) => events.push(msg), {});

    expect(result.prestados).toBe(1);
    expect(result.tomados).toBe(0);
    expect(result.eventos).toBe(0);
    expect(result.cache).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.lastNsu).toBe(101);
    expect(events.some(e => e.includes('NSU 101'))).toBe(true);

    // índice guarda caminho relativo com "/" (mesma convenção do xml-saver),
    // senão a idempotência quebra entre execuções/plataformas
    const idx = JSON.parse(readFileSync(join(OUTPUT, company.nome, '.nfse-index.json'), 'utf-8'));
    expect(idx.nsus['101'].arquivo).toBe('062026/prestados/NFS 101.xml');
    expect(idx.nsus['101'].tipo).toBe('prestados');
  });

  it('conta foraPeriodo quando nota está fora do período', async () => {
    const xmlB64 = await makeXmlB64('12345678000100', 102, '2026-05-10');
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(lote([{ NSU: 102, ArquivoXml: xmlB64 }]))
      .mockResolvedValueOnce(nenhum());

    const result = await runSync(company, mockFetch, () => {}, { dateRange: JUNHO_2026 });

    expect(result.foraPeriodo).toBe(1);
    expect(result.prestados).toBe(0);
    // fora do período ainda assim é gravado no disco
    expect(existsSync(join(OUTPUT, company.nome, '052026', 'prestados', 'NFS 102.xml'))).toBe(true);
  });

  it('conta erro mas continua o loop quando um NSU falha', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(nenhum());

    const result = await runSync(company, mockFetch, () => {}, {});
    expect(result.errors).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('lastNsu não avança sobre NSU com erro', async () => {
    const xmlB64 = await makeXmlB64('12345678000100', 102);
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(lote([{ NSU: 102, ArquivoXml: xmlB64 }]))
      .mockResolvedValueOnce(nenhum());

    const result = await runSync(company, mockFetch, () => {}, {});

    expect(result.errors).toBe(1);
    expect(result.prestados).toBe(1);
    expect(result.lastNsu).toBe(100); // primeiro erro foi no 101 → não avança
  });

  it('lastNsu não avança sobre item do lote que falhou ao gravar', async () => {
    const bom = await makeXmlB64('12345678000100', 302);
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(lote([
        { NSU: 301, ArquivoXml: 'ISSO-NAO-EH-GZIP' },
        { NSU: 302, ArquivoXml: bom },
      ]))
      .mockResolvedValueOnce(nenhum());

    const result = await runSync({ ...company, lastNsu: 300 }, mockFetch, () => {}, {});

    expect(result.errors).toBe(1);
    expect(result.prestados).toBe(1);
    expect(result.lastNsu).toBe(300); // 301 falhou → lastNsu não pode passar dele
  });

  it('re-busca por período usa índice e não chama a rede para NSUs conhecidos', async () => {
    const xmlB64 = await makeXmlB64('12345678000100', 101, '2026-06-10');
    const first = vi.fn()
      .mockResolvedValueOnce(lote([{ NSU: 101, ArquivoXml: xmlB64 }]))
      .mockResolvedValueOnce(nenhum());
    await runSync(company, first, () => {}, {});

    const second = vi.fn().mockResolvedValue(nenhum());
    const result = await runSync({ ...company, lastNsu: 0 }, second, () => {}, {
      startNsu: 1,
      dateRange: JUNHO_2026,
    });

    expect(result.cache).toBe(1);
    expect(result.prestados).toBe(1);
    // NSU 1 (gap expirado) → NENHUM → pula para o 101 via índice; depois confirma o fim em 102
    expect(second).toHaveBeenCalledWith(102, company.cnpj);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('item resolvido pelo índice fora do período conta em cache e foraPeriodo', async () => {
    const xmlB64 = await makeXmlB64('12345678000100', 101, '2026-05-10');
    const first = vi.fn()
      .mockResolvedValueOnce(lote([{ NSU: 101, ArquivoXml: xmlB64 }]))
      .mockResolvedValueOnce(nenhum());
    await runSync(company, first, () => {}, {});

    const second = vi.fn().mockResolvedValue(nenhum());
    const result = await runSync({ ...company, lastNsu: 0 }, second, () => {}, {
      startNsu: 1,
      dateRange: JUNHO_2026,
    });

    expect(result.cache).toBe(1);
    expect(result.foraPeriodo).toBe(1);
    expect(result.prestados).toBe(0);
  });

  it('não trava quando o índice aponta para arquivo removido do disco', async () => {
    const xmlB64 = await makeXmlB64('12345678000100', 101);
    const first = vi.fn()
      .mockResolvedValueOnce(lote([{ NSU: 101, ArquivoXml: xmlB64 }]))
      .mockResolvedValueOnce(nenhum());
    await runSync(company, first, () => {}, {});

    unlinkSync(join(OUTPUT, company.nome, '062026', 'prestados', 'NFS 101.xml'));

    // Servidor já expirou tudo: NSU 1 e NSU 101 respondem NENHUM.
    // O mock estoura depois de poucas chamadas para que uma regressão de
    // progresso do cursor falhe rápido em vez de travar a suíte (o loop seria
    // 100% microtasks e nem o timeout do vitest dispararia).
    const second = vi.fn(async (nsu: number) => {
      if (second.mock.calls.length > 4) throw new Error(`cursor travado no NSU ${nsu}`);
      return nenhum();
    });
    const result = await runSync({ ...company, lastNsu: 0 }, second, () => {}, { startNsu: 1 });

    expect(result.cache).toBe(0);          // arquivo sumiu → não conta como cache
    expect(second).toHaveBeenCalledTimes(2); // NSU 1 e NSU 101 — sem repetir o mesmo NSU
    expect(second).toHaveBeenNthCalledWith(2, 101, company.cnpj);
  });

  it('lote vazio não trava o cursor', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(lote([]))
      .mockResolvedValue(nenhum());

    const result = await runSync(company, mockFetch, () => {}, {});

    expect(mockFetch).toHaveBeenNthCalledWith(2, 102, company.cnpj);
    expect(result.errors).toBe(0);
  });

  it('tipos=[prestados] destaca só prestados mas salva tomados', async () => {
    const prestado = await makeXmlB64(company.cnpj, 201);
    const tomado = await makeXmlB64('99999999000191', 202);
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(lote([
        { NSU: 201, ArquivoXml: prestado },
        { NSU: 202, ArquivoXml: tomado },
      ]))
      .mockResolvedValueOnce(nenhum());

    const result = await runSync({ ...company, lastNsu: 200 }, mockFetch, () => {}, { tipos: ['prestados'] });

    expect(result.prestados).toBe(1);
    expect(result.tomados).toBe(0); // não destacado
    // mas salvo no disco mesmo assim
    expect(existsSync(join(OUTPUT, company.nome, '062026', 'tomados', 'NFS 202.xml'))).toBe(true);
  });

  it('tipos=[tomados] destaca só tomados mas salva prestados', async () => {
    const prestado = await makeXmlB64(company.cnpj, 201);
    const tomado = await makeXmlB64('99999999000191', 202);
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(lote([
        { NSU: 201, ArquivoXml: prestado },
        { NSU: 202, ArquivoXml: tomado },
      ]))
      .mockResolvedValueOnce(nenhum());

    const result = await runSync({ ...company, lastNsu: 200 }, mockFetch, () => {}, { tipos: ['tomados'] });

    expect(result.tomados).toBe(1);
    expect(result.prestados).toBe(0);
    expect(existsSync(join(OUTPUT, company.nome, '062026', 'prestados', 'NFS 201.xml'))).toBe(true);
  });
});

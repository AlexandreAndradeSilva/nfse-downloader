import { describe, it, expect, afterEach } from 'vitest';
import zlib from 'zlib';
import { promisify } from 'util';
import { rmSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { NsuIndex } from '../src/services/nsu-index.js';
import { decodeAndSave, importRawXml, isWithinRange } from '../src/services/xml-saver.js';

const gzip = promisify(zlib.gzip);

const OUTPUT = join(process.cwd(), 'test-output');
const EMPRESA = 'Empresa Teste';
const CNPJ = '12345678000100';
const OUTRO_CNPJ = '98765432000199';
const OUTRO_CNPJ2 = '11222333000181';

// Chaves de acesso NFS-e têm 50 dígitos; os 8 finais são usados como desempate de nome
const CH1 = ('352607123456780001' + '0'.repeat(50)).slice(0, 42) + '11111111';
const CH2 = ('352607987654320001' + '0'.repeat(50)).slice(0, 42) + '22222222';

function companyDir(): string {
  return join(OUTPUT, EMPRESA);
}

function newIndex(): NsuIndex {
  return NsuIndex.load(companyDir());
}

interface XmlOpts {
  cnpj: string;
  nNFSe?: string;
  chave: string;
  dhEmi?: string;
  dhProc?: string;
}

function makeXml({ cnpj, nNFSe = '1', chave, dhEmi = '2026-07-10T10:00:00-03:00', dhProc }: XmlOpts): string {
  const dCompet = dhEmi.slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS${chave}">
    <xLocEmi>SAO PAULO</xLocEmi><xLocPrestacao>SAO PAULO</xLocPrestacao>
    ${nNFSe ? `<nNFSe>${nNFSe}</nNFSe>` : ''}<cLocIncid>3550308</cLocIncid><xLocIncid>SAO PAULO</xLocIncid>
    ${dhProc ? `<dhProc>${dhProc}</dhProc>` : ''}
    <xTribNac>Serviço</xTribNac><xTribMun>Serviço</xTribMun>
    <emit>
      <CNPJ>${cnpj}</CNPJ><IM>123</IM><xNome>Empresa Prestadora</xNome>
      <enderNac><xLgr>RUA A</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>01001000</CEP></enderNac>
    </emit>
    <valores><vBC>100</vBC><vLiq>100</vLiq></valores>
    <DPS versao="1.00">
      <infDPS Id="DPS1">
        <dhEmi>${dhEmi}</dhEmi><serie>1</serie><nDPS>1</nDPS><dCompet>${dCompet}</dCompet>
        <prest><CNPJ>${cnpj}</CNPJ><regTrib><opSimpNac>3</opSimpNac></regTrib></prest>
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

function makeEventoSubstXml({ chNFSe, nDFSe, dhEvento }: { chNFSe: string; nDFSe: string; dhEvento: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infEvento Id="EVT${chNFSe}110115001">
    <chNFSe>${chNFSe}</chNFSe>
    <nDFSe>${nDFSe}</nDFSe>
    <dhEvento>${dhEvento}</dhEvento>
    <e110115>
      <cMotivo>01</cMotivo>
      <xMotivo>Emissao de NFS-e substituta</xMotivo>
    </e110115>
  </infEvento>
</evento>`;
}

function makeEventoCancXml({ chNFSe, nDFSe, dhCanc }: { chNFSe: string; nDFSe: string; dhCanc: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infEvento Id="EVT${chNFSe}101101001">
    <chNFSe>${chNFSe}</chNFSe>
    <nDFSe>${nDFSe}</nDFSe>
    <dhCanc>${dhCanc}</dhCanc>
    <e101101>
      <cMotivo>01</cMotivo>
      <xMotivo>Cancelamento de NFS-e</xMotivo>
    </e101101>
  </infEvento>
</evento>`;
}

async function gz(xml: string): Promise<string> {
  return (await gzip(Buffer.from(xml, 'utf-8'))).toString('base64');
}

afterEach(() => {
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true });
});

describe('xml-saver', () => {
  it('classifica como prestado quando emitente == cnpj da empresa', async () => {
    const idx = newIndex();
    const b64 = await gz(makeXml({ cnpj: CNPJ, nNFSe: '1', chave: CH1 }));
    const result = await decodeAndSave(b64, 1501, CNPJ, OUTPUT, EMPRESA, idx);
    expect(result.tipo).toBe('prestados');
    expect(result.competencia).toBe('072026');
    expect(existsSync(result.filePath)).toBe(true);
    expect(existsSync(join(companyDir(), '072026', 'prestados', 'NFS 1.xml'))).toBe(true);
  });

  it('classifica como tomado quando emitente != cnpj da empresa', async () => {
    const idx = newIndex();
    const b64 = await gz(makeXml({ cnpj: OUTRO_CNPJ, nNFSe: '1', chave: CH1 }));
    const result = await decodeAndSave(b64, 1502, CNPJ, OUTPUT, EMPRESA, idx);
    expect(result.tipo).toBe('tomados');
  });

  it('não reescreve arquivo já existente da mesma nota (índice novo, disco antigo)', async () => {
    const b64 = await gz(makeXml({ cnpj: CNPJ, nNFSe: '1', chave: CH1 }));
    const r1 = await decodeAndSave(b64, 1501, CNPJ, OUTPUT, EMPRESA, newIndex());
    const mtime1 = statSync(r1.filePath).mtimeMs;
    await new Promise(r => setTimeout(r, 10));
    // índice zerado → tem que reconhecer a nota pelo conteúdo do arquivo em disco
    const r2 = await decodeAndSave(b64, 1501, CNPJ, OUTPUT, EMPRESA, newIndex());
    expect(r2.filePath).toBe(r1.filePath);
    expect(statSync(r1.filePath).mtimeMs).toBe(mtime1);
  });

  it('mesma chave duas vezes → um único arquivo (idempotente)', async () => {
    const idx = newIndex();
    const b64 = await gz(makeXml({ cnpj: CNPJ, nNFSe: '5', chave: CH1 }));
    await decodeAndSave(b64, 1, CNPJ, OUTPUT, EMPRESA, idx);
    await decodeAndSave(b64, 1, CNPJ, OUTPUT, EMPRESA, idx);
    const files = readdirSync(join(companyDir(), '072026', 'prestados'));
    expect(files).toEqual(['NFS 5.xml']);
  });

  it('chaves diferentes com mesmo nNFSe → sufixo com final da chave', async () => {
    const idx = newIndex();
    await decodeAndSave(await gz(makeXml({ cnpj: OUTRO_CNPJ, nNFSe: '1', chave: CH1 })), 1, CNPJ, OUTPUT, EMPRESA, idx);
    await decodeAndSave(await gz(makeXml({ cnpj: OUTRO_CNPJ2, nNFSe: '1', chave: CH2 })), 2, CNPJ, OUTPUT, EMPRESA, idx);
    const files = readdirSync(join(companyDir(), '072026', 'tomados')).sort();
    expect(files).toEqual([`NFS 1 (${CH2.slice(-8)}).xml`, 'NFS 1.xml'].sort());
  });

  it('colisão de nNFSe é resolvida mesmo sem índice (lendo a chave do disco)', async () => {
    await decodeAndSave(await gz(makeXml({ cnpj: OUTRO_CNPJ, nNFSe: '1', chave: CH1 })), 1, CNPJ, OUTPUT, EMPRESA, newIndex());
    await decodeAndSave(await gz(makeXml({ cnpj: OUTRO_CNPJ2, nNFSe: '1', chave: CH2 })), 2, CNPJ, OUTPUT, EMPRESA, newIndex());
    const files = readdirSync(join(companyDir(), '072026', 'tomados'));
    expect(files).toHaveLength(2);
  });

  it('nota sem nNFSe é salva mesmo assim (nunca descartada)', async () => {
    const idx = newIndex();
    const info = await decodeAndSave(await gz(makeXml({ cnpj: CNPJ, nNFSe: '', chave: CH1 })), 77, CNPJ, OUTPUT, EMPRESA, idx);
    expect(existsSync(info.filePath)).toBe(true);
    expect(readdirSync(join(companyDir(), '072026', 'prestados'))).toHaveLength(1);
  });

  it('registra o arquivo no índice por chave de acesso', async () => {
    const idx = newIndex();
    const info = await decodeAndSave(await gz(makeXml({ cnpj: CNPJ, nNFSe: '5', chave: CH1 })), 1, CNPJ, OUTPUT, EMPRESA, idx);
    const rel = idx.fileForChave(CH1);
    expect(rel).toBeDefined();
    expect(existsSync(join(companyDir(), rel!))).toBe(true);
    expect(info.chaveAcesso).toBe(CH1);
  });

  it('retorna dhEmi e dhProc extraídos do XML', async () => {
    const idx = newIndex();
    const info = await decodeAndSave(
      await gz(makeXml({ cnpj: CNPJ, nNFSe: '2', chave: CH1, dhEmi: '2026-05-10T08:00:00-03:00', dhProc: '2026-07-02T09:30:00-03:00' })),
      3, CNPJ, OUTPUT, EMPRESA, idx,
    );
    expect(info.dhEmi).toContain('2026-05-10');
    expect(info.dhProc).toContain('2026-07-02');
  });

  it('nota sem data alguma não é descartada', async () => {
    const idx = newIndex();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS${CH1}"><nNFSe>3</nNFSe>
    <emit><CNPJ>${CNPJ}</CNPJ><xNome>Sem Data</xNome></emit>
  </infNFSe>
</NFSe>`;
    const info = await decodeAndSave(await gz(xml), 9, CNPJ, OUTPUT, EMPRESA, idx);
    expect(info.dhEmi).toBeNull();
    expect(info.dhProc).toBeNull();
    expect(existsSync(info.filePath)).toBe(true);
  });
});

describe('isWithinRange', () => {
  const julho = {
    dataInicio: new Date('2026-07-01T00:00:00-03:00'),
    dataFim: new Date('2026-07-31T23:59:59-03:00'),
  };

  it('dhEmi fora mas dhProc dentro → true', () => {
    expect(isWithinRange(
      { dhEmi: '2026-05-01T10:00:00-03:00', dhProc: '2026-07-05T10:00:00-03:00' },
      julho,
    )).toBe(true);
  });

  it('dhEmi dentro e dhProc fora → true', () => {
    expect(isWithinRange(
      { dhEmi: '2026-07-15T10:00:00-03:00', dhProc: '2026-09-01T10:00:00-03:00' },
      julho,
    )).toBe(true);
  });

  it('ambas fora → false', () => {
    expect(isWithinRange(
      { dhEmi: '2026-05-01T10:00:00-03:00', dhProc: '2026-06-01T10:00:00-03:00' },
      julho,
    )).toBe(false);
  });

  it('sem nenhuma data → true', () => {
    expect(isWithinRange({ dhEmi: null, dhProc: null }, { dataInicio: new Date() })).toBe(true);
  });

  it('sem range → true', () => {
    expect(isWithinRange({ dhEmi: '2020-01-01T00:00:00-03:00', dhProc: null })).toBe(true);
  });

  it('data inválida é ignorada e não derruba a nota', () => {
    expect(isWithinRange({ dhEmi: 'lixo', dhProc: null }, julho)).toBe(true);
  });
});

describe('xml-saver — eventos', () => {
  it('evento de substituição move a nota original para substituidas/', async () => {
    const idx = newIndex();
    await decodeAndSave(await gz(makeXml({ cnpj: CNPJ, nNFSe: '9', chave: CH1 })), 1, CNPJ, OUTPUT, EMPRESA, idx);
    const evtXml = makeEventoSubstXml({ chNFSe: CH1, nDFSe: '9', dhEvento: '2026-07-20T12:00:00-03:00' });
    const info = await decodeAndSave(await gz(evtXml), 2, CNPJ, OUTPUT, EMPRESA, idx);
    expect(info.tipo).toBe('eventos');
    expect(info.eventoTipo).toBe('substituicao');
    expect(info.dhProc).toContain('2026-07-20');
    expect(existsSync(join(companyDir(), '072026', 'substituidas', 'NFS 9.xml'))).toBe(true);
    expect(existsSync(join(companyDir(), '072026', 'prestados', 'NFS 9.xml'))).toBe(false);
  });

  it('evento de cancelamento move a nota original para canceladas/', async () => {
    const idx = newIndex();
    await decodeAndSave(await gz(makeXml({ cnpj: CNPJ, nNFSe: '9', chave: CH1 })), 1, CNPJ, OUTPUT, EMPRESA, idx);
    const evtXml = makeEventoCancXml({ chNFSe: CH1, nDFSe: '9', dhCanc: '2026-07-20T12:00:00-03:00' });
    const info = await decodeAndSave(await gz(evtXml), 2, CNPJ, OUTPUT, EMPRESA, idx);
    expect(info.eventoTipo).toBe('cancelamento');
    expect(existsSync(join(companyDir(), '072026', 'canceladas', 'NFS 9.xml'))).toBe(true);
    expect(existsSync(join(companyDir(), '072026', 'prestados', 'NFS 9.xml'))).toBe(false);
  });

  it('evento atualiza o índice da nota original em vez de sobrescrevê-lo', async () => {
    const idx = newIndex();
    await decodeAndSave(await gz(makeXml({ cnpj: CNPJ, nNFSe: '9', chave: CH1 })), 1, CNPJ, OUTPUT, EMPRESA, idx);
    const evtXml = makeEventoSubstXml({ chNFSe: CH1, nDFSe: '9', dhEvento: '2026-07-20T12:00:00-03:00' });
    await decodeAndSave(await gz(evtXml), 2, CNPJ, OUTPUT, EMPRESA, idx);
    const rel = idx.fileForChave(CH1);
    expect(rel).toBeDefined();
    expect(rel).toContain('substituidas');
    expect(existsSync(join(companyDir(), rel!))).toBe(true);
  });

  it('nota re-baixada depois do cancelamento não volta para prestados/', async () => {
    const idx = newIndex();
    const nota = await gz(makeXml({ cnpj: CNPJ, nNFSe: '9', chave: CH1 }));
    await decodeAndSave(nota, 1, CNPJ, OUTPUT, EMPRESA, idx);
    await decodeAndSave(await gz(makeEventoCancXml({ chNFSe: CH1, nDFSe: '9', dhCanc: '2026-07-20T12:00:00-03:00' })), 2, CNPJ, OUTPUT, EMPRESA, idx);
    const info = await decodeAndSave(nota, 1, CNPJ, OUTPUT, EMPRESA, idx);
    expect(info.filePath).toContain('canceladas');
    expect(existsSync(join(companyDir(), '072026', 'prestados', 'NFS 9.xml'))).toBe(false);
  });

  it('evento sem a nota original em disco não quebra o fluxo', async () => {
    const idx = newIndex();
    const evtXml = makeEventoCancXml({ chNFSe: CH2, nDFSe: '42', dhCanc: '2026-07-20T12:00:00-03:00' });
    const info = await decodeAndSave(await gz(evtXml), 5, CNPJ, OUTPUT, EMPRESA, idx);
    expect(info.tipo).toBe('eventos');
    expect(existsSync(info.filePath)).toBe(true);
  });
});

describe('importRawXml', () => {
  it('salva, registra no índice e respeita colisão por chave', async () => {
    const idx = newIndex();
    const i1 = await importRawXml(makeXml({ cnpj: OUTRO_CNPJ, nNFSe: '1', chave: CH1 }), CNPJ, OUTPUT, EMPRESA, idx);
    const i2 = await importRawXml(makeXml({ cnpj: OUTRO_CNPJ2, nNFSe: '1', chave: CH2 }), CNPJ, OUTPUT, EMPRESA, idx);
    expect(i1?.tipo).toBe('tomados');
    expect(i2?.filePath).not.toBe(i1?.filePath);
    expect(readdirSync(join(companyDir(), '072026', 'tomados'))).toHaveLength(2);
    expect(idx.fileForChave(CH2)).toBeDefined();
  });

  it('retorna null para XML que não é NFS-e', async () => {
    const idx = newIndex();
    const info = await importRawXml('<qualquer><coisa/></qualquer>', CNPJ, OUTPUT, EMPRESA, idx);
    expect(info).toBeNull();
  });
});

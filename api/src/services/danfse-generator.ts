import puppeteer from 'puppeteer';
import { XMLParser } from 'fast-xml-parser';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildDanfseHtml, type DanfseData } from './danfse-template.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_B64_PATH = join(__dirname, '../assets/nfse-logo.b64');

function loadLogoDataUrl(): string | undefined {
  if (existsSync(LOGO_B64_PATH)) {
    const b64 = readFileSync(LOGO_B64_PATH, 'ascii').trim();
    return `data:image/png;base64,${b64}`;
  }
  return undefined;
}

const LOGO_DATA_URL = loadLogoDataUrl();

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

function s(v: unknown): string {
  return v?.toString().trim() ?? '';
}

function fmtDate(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function calcISSQN(vBC: string, pAliq: string): string {
  const bc = parseFloat(vBC);
  const aliq = parseFloat(pAliq);
  if (isNaN(bc) || isNaN(aliq)) return '-';
  return (bc * aliq / 100).toFixed(2);
}

function fmtCompetencia(dCompet: string): string {
  if (!dCompet) return '-';
  const [year, month] = dCompet.split('-');
  return `${month}/${year}`;
}

function extractDanfseData(xmlStr: string): DanfseData {
  const parsed = parser.parse(xmlStr);
  const inf = parsed?.NFSe?.infNFSe ?? {};
  const dps = inf?.DPS?.infDPS ?? {};
  const prest = dps?.prest ?? {};
  const toma = dps?.toma ?? {};
  const serv = dps?.serv ?? {};
  const cServ = serv?.cServ ?? {};
  const locPrest = serv?.locPrest ?? {};
  const valoresDps = dps?.valores ?? {};
  const trib = valoresDps?.trib ?? {};
  const tribMun = (trib as Record<string, unknown>)?.tribMun ?? {} as Record<string, unknown>;
  const tribFed = (trib as Record<string, unknown>)?.tribFed ?? {} as Record<string, unknown>;
  const piscofins = (tribFed as Record<string, unknown>)?.piscofins ?? {} as Record<string, unknown>;
  const totTrib = ((trib as Record<string, unknown>)?.totTrib as Record<string, unknown>)?.vTotTrib ?? {} as Record<string, unknown>;
  const vServPrest = valoresDps?.vServPrest ?? {};
  const valoresNfse = inf?.valores ?? {};
  const emit = inf?.emit ?? {};
  const enderNac = emit?.enderNac ?? {};
  const tomaEnd = toma?.end ?? {};
  const tomaEndNac = tomaEnd?.endNac ?? {};

  const idAttr = s(inf?.['@_Id'] ?? '');
  const chaveAcesso = idAttr.startsWith('NFS') ? idAttr.slice(3) : idAttr;

  const emitEndereco = [s(enderNac.xLgr), s(enderNac.nro), s(enderNac.xBairro)]
    .filter(Boolean).join(', ');
  const tomaEndereco = [s(tomaEnd.xLgr), s(tomaEnd.nro), s(tomaEnd.xBairro)]
    .filter(Boolean).join(', ');

  return {
    chaveAcesso: chaveAcesso || (s(valoresNfse.xOutInf).match(/\d{50}/)?.[0] ?? '-'),
    numeroNFSe: s(inf.nNFSe),
    competencia: fmtCompetencia(s(dps.dCompet)),
    dhEmissao: fmtDate(s(dps.dhEmi) || s(inf.dhProc)),
    numeroDPS: s(dps.nDPS),
    serieDPS: s(dps.serie),
    emitCnpj: s(emit.CNPJ),
    emitIm: s(emit.IM),
    emitTelefone: s(emit.fone),
    emitNome: s(emit.xNome),
    emitEmail: s(emit.email),
    emitEndereco,
    emitMunicipio: s(inf.xLocEmi) || s(enderNac.cMun),
    emitCep: s(enderNac.CEP),
    emitSimplesNac: s(prest?.regTrib?.opSimpNac),
    tomaCnpj: s(toma.CNPJ),
    tomaNome: s(toma.xNome),
    tomaEndereco,
    tomaMunicipio: s(tomaEndNac.cMun),
    tomaCep: s(tomaEndNac.CEP),
    tomaTelefone: s(toma.fone),
    tomaEmail: s(toma.email),
    cTribNac: s(cServ.cTribNac),
    xTribNac: s(inf.xTribNac),
    cTribMun: s(cServ.cTribMun),
    xTribMun: s(inf.xTribMun),
    xDescServ: s(cServ.xDescServ),
    xLocPrestacao: s(inf.xLocPrestacao) || s(locPrest.cLocPrestacao),
    tribISSQN: s(tribMun.tribISSQN),
    tpRetISSQN: s(tribMun.tpRetISSQN),
    vBC: s(valoresNfse.vBC),
    pISSQN: s(tribMun.pAliq),
    vISSQN: calcISSQN(s(valoresNfse.vBC), s(tribMun.pAliq)),
    // Tributação federal
    vPIS: s(piscofins.vPis),
    vCOFINS: s(piscofins.vCofins),
    cstPisCofins: s(piscofins.CST),
    vCSLL: s(tribFed.vRetCSLL),
    vCP: s(tribFed.vCP),
    vIRRF: s(tribFed.vIRRF),
    // Totais aproximados
    vTotTribFed: s(totTrib.vTotTribFed),
    vTotTribEst: s(totTrib.vTotTribEst),
    vTotTribMun: s(totTrib.vTotTribMun),
    vServico: s(vServPrest.vServ),
    vLiq: s(valoresNfse.vLiq),
    xMunicipioIncid: s(inf.xLocIncid) || s(inf.xLocEmi),
  };
}

export async function generateDanfse(xmlStr: string): Promise<Buffer> {
  const data = extractDanfseData(xmlStr);
  const html = buildDanfseHtml(data, LOGO_DATA_URL);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

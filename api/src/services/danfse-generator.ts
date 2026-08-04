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

function buildEndereco(xLgr: string, nro: string, xCpl: string, xBairro: string): string {
  return [xLgr, nro, xCpl, xBairro].map(s).filter(Boolean).join(', ');
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
  const infoCompl = serv?.infoCompl ?? {};
  const valoresDps = dps?.valores ?? {};
  const trib = valoresDps?.trib ?? {};
  const tribMun = trib?.tribMun ?? {};
  const tribFed = trib?.tribFed ?? {};
  const piscofins = tribFed?.piscofins ?? {};
  const totTrib = trib?.totTrib?.vTotTrib ?? {};
  const vServPrest = valoresDps?.vServPrest ?? {};
  const valoresNfse = inf?.valores ?? {};
  // Emitente — campos em inf.emit e dps.prest
  const emit = inf?.emit ?? {};
  const enderNac = emit?.enderNac ?? {};
  // Tomador — atenção: end.xLgr/nro/xCpl/xBairro ficam em end (não em end.endNac)
  const tomaEnd = toma?.end ?? {};
  const tomaEndNac = tomaEnd?.endNac ?? {};

  const idAttr = s(inf?.['@_Id'] ?? '');
  const chaveAcesso = idAttr.startsWith('NFS') ? idAttr.slice(3) : idAttr;

  // Endereço emitente
  const emitEndereco = buildEndereco(s(enderNac.xLgr), s(enderNac.nro), s(enderNac.xCpl), s(enderNac.xBairro));
  const emitMunicipio = s(inf.xLocEmi) || s(enderNac.cMun);
  const emitUF = s(enderNac.UF);

  // Endereço tomador — xLgr/nro/xCpl/xBairro são filhos diretos de end
  const tomaEndereco = buildEndereco(s(tomaEnd.xLgr), s(tomaEnd.nro), s(tomaEnd.xCpl), s(tomaEnd.xBairro));
  const tomaMunicipio = s(tomaEndNac.cMun);
  const tomaCep = s(tomaEndNac.CEP);
  const tomaUF = s(tomaEndNac.UF) || s(tomaEnd.endNac?.UF ?? '');

  // Inscrição Municipal — prest tem IM mais confiável que emit
  const emitIm = s(prest?.IM ?? emit?.IM ?? '');

  const regEspTrib: Record<string, string> = {
    '0': 'Nenhum', '1': 'Microempresa Municipal', '2': 'Estimativa',
    '3': 'Sociedade de Profissionais', '4': 'Cooperativa',
    '5': 'Microempresário Individual', '6': 'Microempresário e Empresa de Pequeno Porte',
  };

  return {
    chaveAcesso: chaveAcesso || (s(valoresNfse.xOutInf).match(/\d{44,50}/)?.[0] ?? '-'),
    numeroNFSe: s(inf.nNFSe),
    competencia: fmtCompetencia(s(dps.dCompet)),
    dhEmissao: fmtDate(s(inf.dhProc) || s(dps.dhEmi)),
    dhEmissaoDps: fmtDate(s(dps.dhEmi)),
    numeroDPS: s(dps.nDPS),
    serieDPS: s(dps.serie),
    // Emitente
    emitCnpj: s(emit.CNPJ),
    emitIm,
    emitTelefone: s(emit.fone || prest.fone),
    emitNome: s(emit.xNome),
    emitEmail: s(emit.email || prest.email),
    emitEndereco,
    emitMunicipio,
    emitUF,
    emitCep: s(enderNac.CEP),
    emitSimplesNac: s(prest?.regTrib?.opSimpNac ?? ''),
    emitRegEspTrib: regEspTrib[s(prest?.regTrib?.regEspTrib ?? '')] ?? '',
    // Tomador
    tomaCnpj: s(toma.CNPJ || toma.CPF),
    tomaIm: s(toma?.IM ?? ''),
    tomaNome: s(toma.xNome),
    tomaEndereco,
    tomaMunicipio,
    tomaUF,
    tomaCep,
    tomaTelefone: s(toma.fone),
    tomaEmail: s(toma.email),
    // Serviço
    cTribNac: s(cServ.cTribNac),
    xTribNac: s(inf.xTribNac),
    cTribMun: s(cServ.cTribMun),
    xTribMun: s(inf.xTribMun),
    xDescServ: s(cServ.xDescServ),
    cNBS: s(cServ.cNBS),
    xLocPrestacao: s(inf.xLocPrestacao) || s(locPrest.cLocPrestacao),
    xLocEmi: s(inf.xLocEmi),
    xMunicipioIncid: s(inf.xLocIncid) || s(inf.xLocEmi),
    xInfComp: s(infoCompl.xInfComp),
    // Tributação ISSQN
    tribISSQN: s(tribMun.tribISSQN),
    tpRetISSQN: s(tribMun.tpRetISSQN),
    vBC: s(valoresNfse.vBC),
    pAliqAplic: s(valoresNfse.pAliqAplic),
    pISSQN: s(tribMun.pAliq),
    vISSQN: calcISSQN(s(valoresNfse.vBC), s(tribMun.pAliq)),
    // Tributação Federal
    vPIS: s(piscofins.vPis),
    vCOFINS: s(piscofins.vCofins),
    tpRetPisCofins: s(piscofins.tpRetPisCofins),
    vCSLL: s(tribFed.vRetCSLL),
    vCP: s(tribFed.vRetCP),
    vIRRF: s(tribFed.vIRRF),
    // Totais aproximados
    vTotTribFed: s(totTrib.vTotTribFed),
    vTotTribEst: s(totTrib.vTotTribEst),
    vTotTribMun: s(totTrib.vTotTribMun),
    // Valores
    vServico: s(vServPrest.vServ) || s(valoresNfse.vBC),
    vLiq: s(valoresNfse.vLiq),
    vISSQNNfse: s(valoresNfse.vISSQN),
  };
}

export async function generateDanfse(xmlStr: string, cancelada = false): Promise<Buffer> {
  const data = extractDanfseData(xmlStr);
  const html = buildDanfseHtml(data, LOGO_DATA_URL, cancelada);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 });
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

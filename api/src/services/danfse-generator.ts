import puppeteer, { type Browser } from 'puppeteer';
import QRCode from 'qrcode';
import { XMLParser } from 'fast-xml-parser';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildDanfseHtml, type DanfseData, type DanfseStamp } from './danfse-template.js';

export type { DanfseStamp };

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

/**
 * Lê o valor de uma tag direto do XML cru.
 * O fast-xml-parser converte números longos (chave de acesso de 50 dígitos) para
 * float e perde os últimos dígitos — a regex preserva o valor exato.
 */
function tag(xml: string, nome: string): string {
  return xml.match(new RegExp(`<${nome}[^>]*>([^<]+)</${nome}>`))?.[1]?.trim() ?? '';
}

function fmtDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** dCompet vem como AAAA-MM-DD; a espec exige DD/MM/AAAA. */
function fmtCompetencia(dCompet: string): string {
  if (!dCompet) return '';
  const m = dCompet.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return dCompet;
  return `${m[3] ?? '01'}/${m[2]}/${m[1]}`;
}

function buildEndereco(xLgr: string, nro: string, xCpl: string, xBairro: string): string {
  return [xLgr, nro, xCpl, xBairro].map(s).filter(Boolean).join(', ');
}

/** Soma dois valores monetários do XML; devolve '' se ambos ausentes. */
function somaValores(a: unknown, b: unknown): string {
  const na = parseFloat(s(a));
  const nb = parseFloat(s(b));
  if (isNaN(na) && isNaN(nb)) return '';
  return String((isNaN(na) ? 0 : na) + (isNaN(nb) ? 0 : nb));
}

const REG_ESP_TRIB: Record<string, string> = {
  '0': 'Nenhum', '1': 'Microempresa Municipal', '2': 'Estimativa',
  '3': 'Sociedade de Profissionais', '4': 'Cooperativa',
  '5': 'Microempresário Individual', '6': 'Microempresário e Empresa de Pequeno Porte',
};

export function extractDanfseData(xmlStr: string): DanfseData {
  const parsed = parser.parse(xmlStr);
  const inf = parsed?.NFSe?.infNFSe ?? {};
  const dps = inf?.DPS?.infDPS ?? {};
  const prest = dps?.prest ?? {};
  const toma = dps?.toma ?? {};
  const interm = dps?.interm ?? {};
  const serv = dps?.serv ?? {};
  const cServ = serv?.cServ ?? {};
  const locPrest = serv?.locPrest ?? {};
  const infoCompl = serv?.infoCompl ?? {};
  const valoresDps = dps?.valores ?? {};
  const trib = valoresDps?.trib ?? {};
  const tribMun = trib?.tribMun ?? {};
  const tribFed = trib?.tribFed ?? {};
  const piscofins = tribFed?.piscofins ?? {};
  const exigSusp = tribMun?.exigSusp ?? {};
  const totTrib = trib?.totTrib?.vTotTrib ?? {};
  const vServPrest = valoresDps?.vServPrest ?? {};
  const vDescCondIncond = valoresDps?.vDescCondIncond ?? {};
  const valoresNfse = inf?.valores ?? {};
  const emit = inf?.emit ?? {};
  const enderNac = emit?.enderNac ?? {};
  const tomaEnd = toma?.end ?? {};
  const tomaEndNac = tomaEnd?.endNac ?? {};
  // Blocos da reforma tributária — presentes só em NFS-e sob vigência do IBS/CBS
  const ibsCbsDps = dps?.IBSCBS ?? {};
  const ibsCbsInf = inf?.IBSCBS ?? {};
  const dest = ibsCbsDps?.dest ?? {};

  // Chave de acesso: atributo Id sem o prefixo "NFS" (espec, seção 2.1.1).
  // Lida do XML cru para não perder dígitos na conversão numérica do parser.
  const idAttr = xmlStr.match(/<infNFSe[^>]*\bId="([^"]+)"/)?.[1]
    ?? s(inf?.['@_Id'] ?? '');
  const chaveAcesso = idAttr.startsWith('NFS') ? idAttr.slice(3) : idAttr;

  // vRetIRRF é o nome correto no schema nacional; vIRRF é fallback legado.
  const vIRRF = s(tribFed.vRetIRRF) || s(tribFed.vIRRF);

  return {
    chaveAcesso: chaveAcesso || tag(xmlStr, 'chNFSe'),
    numeroNFSe: s(inf.nNFSe) || tag(xmlStr, 'nNFSe'),
    competencia: fmtCompetencia(s(dps.dCompet)),
    dhEmissao: fmtDateTime(tag(xmlStr, 'dhProc') || tag(xmlStr, 'dhEmi')),
    dhEmissaoDps: fmtDateTime(tag(xmlStr, 'dhEmi')),
    numeroDPS: s(dps.nDPS),
    serieDPS: s(dps.serie),
    ambGer: s(inf.ambGer),
    tpAmb: s(dps.tpAmb) || s(inf.tpAmb),
    tpEmit: s(dps.tpEmit),
    cStat: s(inf.xStat ?? '') || s(inf.cStat ?? ''),
    finNFSe: s(dps?.IBSCBS?.finNFSe ?? ''),

    // Prestador / Fornecedor
    emitCnpj: tag(xmlStr, 'CNPJ') || s(emit.CNPJ),
    emitIm: s(prest?.IM ?? emit?.IM ?? ''),
    emitTelefone: s(emit.fone || prest.fone),
    emitNome: s(emit.xNome),
    emitEmail: s(emit.email || prest.email),
    emitEndereco: buildEndereco(s(enderNac.xLgr), s(enderNac.nro), s(enderNac.xCpl), s(enderNac.xBairro)),
    emitMunicipio: s(inf.xLocEmi) || s(enderNac.cMun),
    emitUF: s(enderNac.UF),
    emitCep: s(enderNac.CEP),
    emitCMun: s(enderNac.cMun),
    emitSimplesNac: s(prest?.regTrib?.opSimpNac ?? ''),
    emitRegApTribSN: s(prest?.regTrib?.regApTribSN ?? ''),
    emitRegEspTrib: REG_ESP_TRIB[s(prest?.regTrib?.regEspTrib ?? '')] ?? '',

    // Tomador / Adquirente
    tomaCnpj: s(toma.CNPJ || toma.CPF),
    tomaIm: s(toma?.IM ?? ''),
    tomaNome: s(toma.xNome),
    tomaEndereco: buildEndereco(s(tomaEnd.xLgr), s(tomaEnd.nro), s(tomaEnd.xCpl), s(tomaEnd.xBairro)),
    tomaMunicipio: s(tomaEndNac.cMun),
    tomaUF: s(tomaEndNac.UF) || s(tomaEnd?.endNac?.UF ?? ''),
    tomaCep: s(tomaEndNac.CEP),
    tomaCMun: s(tomaEndNac.cMun),
    tomaTelefone: s(toma.fone),
    tomaEmail: s(toma.email),

    // Destinatário da operação (reforma tributária)
    destCnpj: s(dest.CNPJ || dest.CPF || ''),
    destNome: s(dest.xNome ?? ''),
    destTelefone: s(dest.fone ?? ''),

    // Intermediário
    intermCnpj: s(interm.CNPJ || interm.CPF || ''),
    intermIm: s(interm?.IM ?? ''),
    intermNome: s(interm.xNome ?? ''),
    intermTelefone: s(interm.fone ?? ''),

    // Serviço prestado
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

    // Tributação municipal (ISSQN)
    tribISSQN: s(tribMun.tribISSQN),
    tpRetISSQN: s(tribMun.tpRetISSQN),
    tpImunidade: s(tribMun.tpImunidade ?? ''),
    tpSuspensao: s(exigSusp.tpSusp ?? ''),
    nProcessoSusp: s(exigSusp.nProcesso ?? ''),
    tpBM: s(valoresNfse.tpBM ?? ''),
    vBM: s(tribMun?.BM?.vCalcBM ?? tribMun?.BM?.vRedBCBM ?? ''),
    vDR: s(valoresNfse.vDR ?? ''),
    vBC: s(valoresNfse.vBC),
    pAliqAplic: s(valoresNfse.pAliqAplic) || s(tribMun.pAliq),
    // vISSQN vem calculado na NFS-e; é a fonte autoritativa
    vISSQN: s(valoresNfse.vISSQN),

    // Tributação federal (exceto CBS)
    vIRRF,
    vCP: s(tribFed.vRetCP),
    vCSLL: s(tribFed.vRetCSLL),
    vPIS: s(piscofins.vPis),
    vCOFINS: s(piscofins.vCofins),
    tpRetPisCofins: s(piscofins.tpRetPisCofins),

    // Valor total
    vServico: s(vServPrest.vServ) || s(valoresNfse.vBC),
    vDescIncond: s(vDescCondIncond.vDescIncond ?? ''),
    vDescCond: s(vDescCondIncond.vDescCond ?? ''),
    vTotalRet: s(valoresNfse.vTotalRet ?? ''),
    vLiq: s(valoresNfse.vLiq),

    // Tributação IBS/CBS (reforma tributária; ausente em NFS-e anteriores à vigência)
    cstIbsCbs: s(ibsCbsDps?.valores?.trib?.gIBSCBS?.CST ?? ''),
    cClassTrib: s(ibsCbsDps?.valores?.trib?.gIBSCBS?.cClassTrib ?? ''),
    xLocalidadeIncid: s(ibsCbsInf?.xLocalidadeIncid ?? ''),
    vExclusoesBC: s(ibsCbsInf?.valores?.vExclusoesBC ?? ''),
    vBCIbsCbs: s(ibsCbsInf?.valores?.vBC ?? ''),
    pAliqEfetMun: s(ibsCbsInf?.valores?.mun?.pAliqEfetMun ?? ''),
    vIBSMun: s(ibsCbsInf?.totCIBS?.gIBS?.gIBSMunTot?.vIBSMun ?? ''),
    pAliqEfetUF: s(ibsCbsInf?.valores?.uf?.pAliqEfetUF ?? ''),
    vIBSUF: s(ibsCbsInf?.totCIBS?.gIBS?.gIBSUFTot?.vIBSUF ?? ''),
    vIBSTot: s(ibsCbsInf?.totCIBS?.gIBS?.vIBSTot ?? ''),
    pCBS: s(ibsCbsInf?.valores?.fed?.pCBS ?? ''),
    pAliqEfetCBS: s(ibsCbsInf?.valores?.fed?.pAliqEfetCBS ?? ''),
    vCBS: s(ibsCbsInf?.totCIBS?.gCBS?.vCBS ?? ''),
    vIbsCbsTot: somaValores(ibsCbsInf?.totCIBS?.gIBS?.vIBSTot, ibsCbsInf?.totCIBS?.gCBS?.vCBS),
    vTotNF: s(ibsCbsInf?.totCIBS?.vTotNF ?? ''),

    // Totais aproximados de tributos
    vTotTribFed: s(totTrib.vTotTribFed),
    vTotTribEst: s(totTrib.vTotTribEst),
    vTotTribMun: s(totTrib.vTotTribMun),
  };
}

/**
 * URL de consulta pública embutida no QR Code.
 * A NT 008 posiciona o QR Code no formulário (bloco "QUADRO DO QR CODE") mas o texto
 * recuperável da espec não fixa a URL; usamos o portal nacional de consulta com a
 * chave de acesso, que é o destino esperado pelo contribuinte.
 */
const CONSULTA_URL = (chave: string) =>
  `https://www.nfse.gov.br/consultapublica?tpc=1&chave=${chave}`;

async function buildQrDataUrl(chave: string): Promise<string | undefined> {
  if (!chave) return undefined;
  try {
    return await QRCode.toDataURL(CONSULTA_URL(chave), { margin: 0, width: 160 });
  } catch {
    return undefined; // QR é complementar — não impede a emissão do DANFSe
  }
}

// ─── Browser compartilhado ───────────────────────────────────────────────────
// Um Chromium por processo, com N abas em paralelo, em vez de um browser por nota
// (o modelo anterior custava ~200MB e 1-2s de startup por PDF).

let browserP: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
const IDLE_MS = 60_000;

async function getBrowser(): Promise<Browser> {
  if (!browserP) {
    browserP = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { void closeDanfseBrowser(); }, IDLE_MS);
  idleTimer.unref();
  return browserP;
}

/** Fecha o Chromium compartilhado (idle, shutdown do servidor ou fim dos testes). */
export async function closeDanfseBrowser(): Promise<void> {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const pending = browserP;
  if (!pending) return;
  browserP = null;
  const b = await pending.catch(() => null);
  await b?.close().catch(() => { /* já encerrado */ });
}

export async function generateDanfse(xmlStr: string, stamp?: DanfseStamp): Promise<Buffer> {
  const data = extractDanfseData(xmlStr);
  const qrDataUrl = await buildQrDataUrl(data.chaveAcesso);
  const html = buildDanfseHtml(data, LOGO_DATA_URL, stamp, qrDataUrl);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => { /* aba já fechada */ });
  }
}

import puppeteer, { type Browser } from 'puppeteer';
import QRCode from 'qrcode';
import { XMLParser } from 'fast-xml-parser';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildDanfseHtml, type DanfseData, type DanfseStamp } from './danfse-template.js';

export type { DanfseStamp };

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '../assets');

function loadLogoDataUrl(): string | undefined {
  const p = join(ASSETS_DIR, 'nfse-logo.b64');
  if (!existsSync(p)) return undefined;
  return `data:image/png;base64,${readFileSync(p, 'ascii').trim()}`;
}

/** Código IBGE (7 dígitos) → "Município - UF". Usado onde o XML só traz o código. */
function loadMunicipios(): Record<string, string> {
  const p = join(ASSETS_DIR, 'municipios-ibge.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, string>;
  } catch {
    return {};
  }
}

const LOGO_DATA_URL = loadLogoDataUrl();
const MUNICIPIOS = loadMunicipios();

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

/** dCompet vem como AAAA-MM-DD; o DANFSe exibe DD/MM/AAAA. */
function fmtData(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * O parser converte campos numéricos e descarta zeros à esquerda (CEP 01400-000
 * chega como 1400000). Restaura o comprimento antes de formatar.
 */
function fmtCnpjCpf(v: string): string {
  const dig = String(v ?? '').replace(/\D/g, '');
  if (!dig) return '';
  // >= 12 dígitos só pode ser CNPJ (14); abaixo disso, CPF (11)
  const pad = dig.length >= 12 ? dig.padStart(14, '0') : dig.padStart(11, '0');
  if (pad.length === 14) return pad.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return pad.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

function fmtCep(v: string): string {
  const dig = String(v ?? '').replace(/\D/g, '');
  if (!dig) return '';
  return dig.padStart(8, '0').replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

/** Valor monetário no formato do DANFSe: "R$ 1.234,56". Vazio se não houver valor. */
function moeda(v: unknown): string {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  if (isNaN(n)) return '';
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percentual(v: unknown): string {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

/** cTribNac "170901" → "17.09.01"; restaura o zero à esquerda comido pelo parser. */
function fmtCodTrib(v: string): string {
  const dig = String(v ?? '').replace(/\D/g, '');
  if (!dig || dig.length > 6) return String(v ?? '');
  const p = dig.padStart(6, '0');
  return `${p.slice(0, 2)}.${p.slice(2, 4)}.${p.slice(4, 6)}`;
}

/** Resolve o código IBGE para "Município - UF"; devolve o código se desconhecido. */
function municipio(cMun: string): string {
  const c = String(cMun ?? '').replace(/\D/g, '');
  if (!c) return '';
  return MUNICIPIOS[c] ?? c;
}

function endereco(...partes: unknown[]): string {
  return partes.map(s).filter(Boolean).join(', ');
}

/** Soma dois valores monetários; devolve '' se nenhum estiver presente. */
function soma(a: unknown, b: unknown): string {
  const na = parseFloat(s(a));
  const nb = parseFloat(s(b));
  if (isNaN(na) && isNaN(nb)) return '';
  return moeda(String((isNaN(na) ? 0 : na) + (isNaN(nb) ? 0 : nb)));
}

/** Junta dois percentuais no formato "x% / y%" usado nos campos combinados. */
function juntaPerc(a: unknown, b: unknown): string {
  const pa = percentual(a);
  const pb = percentual(b);
  if (!pa && !pb) return '';
  return `${pa || '-'} / ${pb || '-'}`;
}

const REG_ESP_TRIB: Record<string, string> = {
  '0': 'Nenhum', '1': 'Microempresa Municipal', '2': 'Estimativa',
  '3': 'Sociedade de Profissionais', '4': 'Cooperativa',
  '5': 'Microempresário Individual', '6': 'Microempresário e Empresa de Pequeno Porte',
};
const OP_SIMPLES: Record<string, string> = {
  '1': 'Não optante', '2': 'Optante - MEI', '3': 'Optante - ME/EPP',
};
const REG_AP_TRIB_SN: Record<string, string> = {
  '1': 'Regime de apuração dos tributos federais e municipal pelo SN',
  '2': 'Regime de apuração dos tributos federais pelo SN e ISSQN por fora do SN',
  '3': 'Regime de apuração dos tributos federais e municipal por fora do SN',
};
const TRIB_ISSQN: Record<string, string> = {
  '1': 'Operação Tributável', '2': 'Exportação de Serviço',
  '3': 'Não Incidência', '4': 'Imunidade',
};
const TP_RET_ISSQN: Record<string, string> = {
  '1': 'Não Retido', '2': 'Retido pelo Tomador', '3': 'Retido pelo Intermediário',
};
const TP_EMIT: Record<string, string> = {
  '1': 'Prestador do Serviço', '2': 'Tomador do Serviço', '3': 'Intermediário do Serviço',
};

function desc(codigo: unknown, mapa: Record<string, string>): string {
  const c = s(codigo);
  return c ? (mapa[c] ?? c) : '';
}

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
  // Blocos da reforma tributária — ausentes em NFS-e anteriores à vigência
  const ibsCbsInf = inf?.IBSCBS ?? {};
  const valIbsCbs = ibsCbsInf?.valores ?? {};
  const totCIBS = ibsCbsInf?.totCIBS ?? {};
  const gIBSCBS = dps?.IBSCBS?.valores?.trib?.gIBSCBS ?? {};

  // Chave de acesso: atributo Id sem o prefixo "NFS", lido do XML cru para
  // não perder dígitos na conversão numérica do parser.
  const idAttr = xmlStr.match(/<infNFSe[^>]*\bId="([^"]+)"/)?.[1] ?? s(inf?.['@_Id'] ?? '');
  const chaveAcesso = idAttr.startsWith('NFS') ? idAttr.slice(3) : idAttr;

  // vRetIRRF é o nome no schema nacional; vIRRF é fallback legado
  const vIRRF = s(tribFed.vRetIRRF) || s(tribFed.vIRRF);
  const vCP = s(tribFed.vRetCP);
  const vCSLL = s(tribFed.vRetCSLL);

  // Total das retenções federais: soma do que foi efetivamente retido
  const totalRetFed = [vIRRF, vCP, vCSLL]
    .map(v => parseFloat(v || '0'))
    .filter(n => !isNaN(n))
    .reduce((a, b) => a + b, 0);

  const municipioEmit = municipio(s(enderNac.cMun)) || s(inf.xLocEmi);
  const municipioToma = municipio(s(tomaEndNac.cMun));

  return {
    chaveAcesso: chaveAcesso || tag(xmlStr, 'chNFSe'),
    numeroNFSe: s(inf.nNFSe) || tag(xmlStr, 'nNFSe'),
    competencia: fmtData(s(dps.dCompet)),
    dhEmissao: fmtDateTime(tag(xmlStr, 'dhProc') || tag(xmlStr, 'dhEmi')),
    dhEmissaoDps: fmtDateTime(tag(xmlStr, 'dhEmi')),
    numeroDPS: s(dps.nDPS),
    serieDPS: s(dps.serie),
    tpEmit: desc(dps.tpEmit, TP_EMIT),

    // Emitente / prestador
    emitCnpj: fmtCnpjCpf(tag(xmlStr, 'CNPJ') || s(emit.CNPJ)),
    emitIm: s(prest?.IM ?? emit?.IM ?? ''),
    emitTelefone: s(emit.fone || prest.fone),
    emitNome: s(emit.xNome),
    emitEmail: s(emit.email || prest.email),
    emitEndereco: endereco(enderNac.xLgr, enderNac.nro, enderNac.xCpl, enderNac.xBairro),
    emitMunicipio: municipioEmit,
    emitCep: fmtCep(s(enderNac.CEP)),
    emitSimplesNac: desc(prest?.regTrib?.opSimpNac, OP_SIMPLES),
    emitRegApTribSN: desc(prest?.regTrib?.regApTribSN, REG_AP_TRIB_SN),
    emitRegEspTrib: desc(prest?.regTrib?.regEspTrib, REG_ESP_TRIB),

    // Tomador
    tomaCnpj: fmtCnpjCpf(s(toma.CNPJ || toma.CPF)),
    tomaIm: s(toma?.IM ?? ''),
    tomaTelefone: s(toma.fone),
    tomaNome: s(toma.xNome),
    tomaEmail: s(toma.email),
    tomaEndereco: endereco(tomaEnd.xLgr, tomaEnd.nro, tomaEnd.xCpl, tomaEnd.xBairro),
    tomaMunicipio: municipioToma,
    tomaCep: fmtCep(s(tomaEndNac.CEP)),

    // Intermediário
    intermCnpj: fmtCnpjCpf(s(interm.CNPJ || interm.CPF || '')),
    intermIm: s(interm?.IM ?? ''),
    intermTelefone: s(interm.fone ?? ''),
    intermNome: s(interm.xNome ?? ''),

    // Serviço prestado
    cTribNac: fmtCodTrib(s(cServ.cTribNac)),
    xTribNac: s(inf.xTribNac),
    cTribMun: s(cServ.cTribMun),
    xTribMun: s(inf.xTribMun),
    // Prefere o código IBGE: traz "Município - UF"; xLocPrestacao vem sem a UF
    xLocPrestacao: municipio(s(locPrest.cLocPrestacao)) || s(inf.xLocPrestacao),
    xPaisPrestacao: s(locPrest.cPaisPrestacao ?? ''),
    xDescServ: s(cServ.xDescServ),

    // Tributação municipal
    tribISSQN: desc(tribMun.tribISSQN, TRIB_ISSQN),
    xPaisResult: s(tribMun.cPaisResult ?? ''),
    xMunicipioIncid: s(inf.xLocIncid) || municipio(s(inf.cLocIncid ?? '')),
    tpImunidade: s(tribMun.tpImunidade ?? ''),
    tpSuspensao: exigSusp?.tpSusp ? 'Sim' : 'Não',
    nProcessoSusp: s(exigSusp.nProcesso ?? ''),
    tpBM: s(valoresNfse.tpBM ?? ''),
    vServico: moeda(vServPrest.vServ ?? valoresNfse.vBC),
    vDescIncond: moeda(vDescCondIncond.vDescIncond),
    vDR: moeda(valoresNfse.vDR),
    vCalcBM: moeda(tribMun?.BM?.vCalcBM),
    vBC: moeda(valoresNfse.vBC),
    pAliqAplic: percentual(valoresNfse.pAliqAplic ?? tribMun.pAliq),
    tpRetISSQN: desc(tribMun.tpRetISSQN, TP_RET_ISSQN),
    vISSQN: moeda(valoresNfse.vISSQN),

    // Tributação federal
    vIRRF: moeda(vIRRF),
    vCP: moeda(vCP),
    vCSLL: moeda(vCSLL),
    xDescricaoRetFed: s(tribFed.xDescRet ?? ''),
    vPIS: moeda(piscofins.vPis),
    vCOFINS: moeda(piscofins.vCofins),

    // Tributação IBS / CBS — presente só em NFS-e sob vigência da reforma
    cstIbsCbs: s(gIBSCBS.CST ?? ''),
    cClassTrib: s(gIBSCBS.cClassTrib ?? ''),
    cIndOp: s(ibsCbsInf.cIndOp ?? ''),
    cLocalidadeIncid: s(ibsCbsInf.cLocalidadeIncid ?? ''),
    xLocalidadeIncid: s(ibsCbsInf.xLocalidadeIncid ?? '')
      || municipio(s(ibsCbsInf.cLocalidadeIncid ?? '')),
    vExclusoesBC: moeda(valIbsCbs.vExclusoesBC),
    vBCIbsCbs: moeda(valIbsCbs.vBC),
    pRedAliqIbsCbs: juntaPerc(valIbsCbs?.fed?.pRedAliqUF ?? valIbsCbs?.fed?.pRedAliqMun, valIbsCbs?.fed?.pRedAliqCBS),
    pIbsUfMun: juntaPerc(valIbsCbs?.uf?.pIBSUF, valIbsCbs?.mun?.pIBSMun),
    pAliqEfetMun: percentual(valIbsCbs?.mun?.pAliqEfetMun),
    vIBSMun: moeda(totCIBS?.gIBS?.gIBSMunTot?.vIBSMun),
    pAliqEfetUF: percentual(valIbsCbs?.uf?.pAliqEfetUF),
    vIBSUF: moeda(totCIBS?.gIBS?.gIBSUFTot?.vIBSUF),
    vIBSTot: moeda(totCIBS?.gIBS?.vIBSTot),
    pCBS: percentual(valIbsCbs?.fed?.pCBS),
    pAliqEfetCBS: percentual(valIbsCbs?.fed?.pAliqEfetCBS),
    vCBS: moeda(totCIBS?.gCBS?.vCBS),

    // Valor total
    vDescCond: moeda(vDescCondIncond.vDescCond),
    vISSQNRetido: s(tribMun.tpRetISSQN) === '1' ? '' : moeda(valoresNfse.vISSQN),
    vTotalRetFed: totalRetFed > 0 ? moeda(String(totalRetFed)) : '',
    vPisCofinsDebito: moeda(piscofins.vPisCofinsDebito),
    vLiq: moeda(valoresNfse.vLiq),
    vIbsCbsTot: soma(totCIBS?.gIBS?.vIBSTot, totCIBS?.gCBS?.vCBS),
    vTotNF: moeda(totCIBS?.vTotNF),

    // Totais aproximados dos tributos
    vTotTribFed: moeda(totTrib.vTotTribFed),
    vTotTribEst: moeda(totTrib.vTotTribEst),
    vTotTribMun: moeda(totTrib.vTotTribMun),

    // Informações complementares
    xInfComp: s(infoCompl.xInfComp),
    cNBS: s(cServ.cNBS),
  };
}

/**
 * URL de consulta pública embutida no QR Code — o mesmo destino indicado no
 * DANFSe oficial ("consulta da chave de acesso no portal nacional da NFS-e").
 */
const CONSULTA_URL = (chave: string) =>
  `https://www.nfse.gov.br/consultapublica?tpc=1&chave=${chave}`;

async function buildQrDataUrl(chave: string): Promise<string | undefined> {
  if (!chave) return undefined;
  try {
    return await QRCode.toDataURL(CONSULTA_URL(chave), { margin: 0, width: 220 });
  } catch {
    return undefined; // QR é complementar — não impede a emissão do DANFSe
  }
}

// ─── Browser compartilhado ───────────────────────────────────────────────────
// Um Chromium por processo, com N abas em paralelo, em vez de um browser por nota.

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

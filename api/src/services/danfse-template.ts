/**
 * Template do DANFSe conforme o layout oficial da NT 008/2026 v1.02 (SE/CGNFS-e).
 *
 * A especificação (docs/referencias/nt-008-danfse-v1.02.pdf) define, para cada campo,
 * a posição em centímetros relativa à margem, na ordem: altura, largura, esquerda, topo.
 * Este arquivo transcreve essa tabela em posicionamento absoluto CSS em `cm`, o que
 * mapeia 1:1 com o formulário oficial quando impresso em A4.
 *
 * Grade da espec: colunas em 0,30 / 5,41 / 10,51 / 15,62 cm, cada uma com 5,09 cm de
 * largura (spans de 10,19 e 20,40 cm cobrem duas e quatro colunas).
 *
 * Campos codificados são exibidos como "código - descrição" para preservar
 * auditabilidade: se a descrição divergir da tabela oficial, o código original
 * continua legível no documento.
 */

export interface DanfseData {
  chaveAcesso: string;
  numeroNFSe: string;
  competencia: string;
  dhEmissao: string;
  dhEmissaoDps: string;
  numeroDPS: string;
  serieDPS: string;
  ambGer: string;
  tpAmb: string;
  tpEmit: string;
  cStat: string;
  finNFSe: string;
  // Prestador / Fornecedor
  emitCnpj: string;
  emitIm: string;
  emitTelefone: string;
  emitNome: string;
  emitEmail: string;
  emitEndereco: string;
  emitMunicipio: string;
  emitUF: string;
  emitCep: string;
  emitCMun: string;
  emitSimplesNac: string;
  emitRegApTribSN: string;
  emitRegEspTrib: string;
  // Tomador / Adquirente
  tomaCnpj: string;
  tomaIm: string;
  tomaNome: string;
  tomaEndereco: string;
  tomaMunicipio: string;
  tomaUF: string;
  tomaCep: string;
  tomaCMun: string;
  tomaTelefone: string;
  tomaEmail: string;
  // Destinatário da operação (reforma tributária — IBSCBS/dest)
  destCnpj: string;
  destNome: string;
  destTelefone: string;
  // Intermediário
  intermCnpj: string;
  intermIm: string;
  intermNome: string;
  intermTelefone: string;
  // Serviço prestado
  cTribNac: string;
  xTribNac: string;
  cTribMun: string;
  xTribMun: string;
  xDescServ: string;
  cNBS: string;
  xLocPrestacao: string;
  xLocEmi: string;
  xMunicipioIncid: string;
  xInfComp: string;
  // Tributação municipal (ISSQN)
  tribISSQN: string;
  tpRetISSQN: string;
  tpImunidade: string;
  tpSuspensao: string;
  nProcessoSusp: string;
  tpBM: string;
  vBM: string;
  vDR: string;
  vBC: string;
  pAliqAplic: string;
  vISSQN: string;
  // Tributação federal (exceto CBS)
  vIRRF: string;
  vCP: string;
  vCSLL: string;
  vPIS: string;
  vCOFINS: string;
  tpRetPisCofins: string;
  // Valor total
  vServico: string;
  vDescIncond: string;
  vDescCond: string;
  vTotalRet: string;
  vLiq: string;
  // Tributação IBS/CBS (reforma tributária)
  cstIbsCbs: string;
  cClassTrib: string;
  xLocalidadeIncid: string;
  vExclusoesBC: string;
  vBCIbsCbs: string;
  pAliqEfetMun: string;
  vIBSMun: string;
  pAliqEfetUF: string;
  vIBSUF: string;
  vIBSTot: string;
  pCBS: string;
  pAliqEfetCBS: string;
  vCBS: string;
  vIbsCbsTot: string;
  vTotNF: string;
  // Totais aproximados de tributos (compõem informações complementares)
  vTotTribFed: string;
  vTotTribEst: string;
  vTotTribMun: string;
}

export type DanfseStamp = 'CANCELADA' | 'SUBSTITUIDA' | undefined;

/** Escapa texto para inserção segura no HTML. */
function esc(v: string): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Trunca com reticências, conforme exigido pela espec para vários campos. */
function trunc(v: string, max: number): string {
  const t = String(v ?? '').trim();
  return t.length > max ? t.slice(0, max - 3) + '...' : t;
}

function fmtCnpjCpf(v: string): string {
  const dig = String(v ?? '').replace(/\D/g, '');
  if (dig.length === 14) return dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (dig.length === 11) return dig.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return String(v ?? '');
}

function fmtCep(v: string): string {
  const dig = String(v ?? '').replace(/\D/g, '');
  return dig.length === 8 ? dig.replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2-$3') : String(v ?? '');
}

function fmtMoeda(v: string): string {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPerc(v: string): string {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + '%';
}

/** Formata a chave de acesso de 50 dígitos em grupos de 4 para leitura. */
function fmtChave(v: string): string {
  const dig = String(v ?? '').replace(/\D/g, '');
  return dig.length >= 44 ? dig.replace(/(\d{4})(?=\d)/g, '$1 ').trim() : String(v ?? '');
}

/**
 * Exibe campo codificado como "código - descrição".
 * Mantém o código visível para auditoria quando a descrição não é conhecida.
 */
function cod(valor: string, mapa: Record<string, string>): string {
  const c = String(valor ?? '').trim();
  if (!c) return '';
  const desc = mapa[c];
  return desc ? `${c} - ${desc}` : c;
}

const MAP_AMB_GER: Record<string, string> = {
  '1': 'Prefeitura', '2': 'Sistema Nacional NFS-e',
};
const MAP_TP_AMB: Record<string, string> = {
  '1': 'Produção', '2': 'Homologação',
};
const MAP_TP_EMIT: Record<string, string> = {
  '1': 'Prestador', '2': 'Tomador', '3': 'Intermediário',
};
const MAP_SIMPLES: Record<string, string> = {
  '1': 'Não Optante', '2': 'Optante - MEI', '3': 'Optante - ME/EPP',
};
const MAP_TRIB_ISSQN: Record<string, string> = {
  '1': 'Operação tributável', '2': 'Exportação de serviço', '3': 'Não Incidência', '4': 'Imunidade',
};
// Mesmos rótulos usados em routes/reports.ts (herdados do build de produção)
const MAP_TP_RET_ISSQN: Record<string, string> = {
  '1': 'Não Retido', '2': 'Retido pelo Tomador', '3': 'Não Incide ISSQN',
};
const MAP_TP_RET_PISCOFINS: Record<string, string> = {
  '0': 'Não Retidos', '1': 'Retidos', '2': 'Não Retidos',
  '3': 'PIS/COFINS/CSLL Retidos', '4': 'PIS/COFINS Retidos, CSLL Não',
  '5': 'PIS Retido', '6': 'COFINS Retido', '7': 'COFINS e CSLL Retidos',
  '8': 'CSLL Retido', '9': 'PIS e CSLL Retidos',
};

interface CellOpts {
  center?: boolean;
  big?: boolean;      // conteúdo em fonte maior (chave de acesso, valor líquido)
  noBorder?: boolean;
  block?: boolean;    // célula de título de bloco (sombreada)
  wrap?: boolean;     // permite múltiplas linhas
  tight?: boolean;    // linhas de altura reduzida (0,24–0,40 cm)
}

/** Emite uma célula posicionada em cm conforme a tabela da NT 008. */
function cell(
  esq: number, sup: number, larg: number, alt: number,
  label: string, valor: string, opts: CellOpts = {},
): string {
  const cls = [
    'c',
    opts.block ? 'blk' : '',
    opts.center ? 'ctr' : '',
    opts.big ? 'big' : '',
    opts.noBorder ? 'nb' : '',
    opts.wrap ? 'wrap' : '',
    opts.tight ? 'tight' : '',
  ].filter(Boolean).join(' ');
  const style = `left:${esq}cm;top:${sup}cm;width:${larg}cm;height:${alt}cm`;
  const lbl = label ? `<div class="l">${esc(label)}</div>` : '';
  return `<div class="${cls}" style="${style}">${lbl}<div class="v">${esc(valor)}</div></div>`;
}

export function buildDanfseHtml(
  d: DanfseData,
  logoDataUrl?: string,
  stamp?: DanfseStamp,
  qrDataUrl?: string,
): string {
  const parts: string[] = [];

  // ─── CABEÇALHO (esq 0,30 / sup 0,30 / 20,40 × 1,16) ───────────────────────
  parts.push('<div class="box" style="left:0.30cm;top:0.30cm;width:20.40cm;height:1.16cm"></div>');
  if (logoDataUrl) {
    parts.push(`<img class="logo" src="${logoDataUrl}" style="left:0.49cm;top:0.44cm;width:4.00cm;height:0.85cm" alt="NFS-e">`);
  }
  parts.push(
    '<div class="c ctr nb" style="left:5.41cm;top:0.30cm;width:10.19cm;height:1.16cm">' +
    '<div class="titulo">DANFSe</div>' +
    '<div class="subtitulo">Documento Auxiliar da NFS-e</div></div>',
  );
  parts.push(cell(15.62, 0.30, 5.09, 0.64, '', `Município: ${trunc([d.xLocEmi || d.emitMunicipio, d.emitUF].filter(Boolean).join(' / '), 37)}`, { center: true, noBorder: true }));
  parts.push(cell(15.62, 0.97, 5.09, 0.25, '', `Ambiente gerador: ${cod(d.ambGer, MAP_AMB_GER)}`, { center: true, noBorder: true, tight: true }));
  parts.push(cell(15.62, 1.22, 5.09, 0.24, '', `Tipo de ambiente: ${cod(d.tpAmb, MAP_TP_AMB)}`, { center: true, noBorder: true, tight: true }));

  // ─── DADOS DA NFS-e (0,30 / 1,48 / 20,40 × 2,84) ──────────────────────────
  parts.push('<div class="box" style="left:0.30cm;top:1.48cm;width:20.40cm;height:2.84cm"></div>');
  parts.push(cell(0.30, 1.48, 15.30, 0.77, 'CHAVE DE ACESSO DA NFS-E', fmtChave(d.chaveAcesso), { big: true, noBorder: true }));
  parts.push(cell(0.30, 2.27, 5.09, 0.67, 'NÚMERO DA NFS-e', d.numeroNFSe, { noBorder: true }));
  parts.push(cell(5.41, 2.27, 5.09, 0.67, 'COMPETÊNCIA DA NFS-e', d.competencia, { noBorder: true }));
  parts.push(cell(10.51, 2.27, 5.09, 0.67, 'DATA E HORA DA EMISSÃO DA NFS-E', d.dhEmissao, { noBorder: true }));
  parts.push(cell(0.30, 2.96, 5.09, 0.67, 'NÚMERO DA DPS', d.numeroDPS, { noBorder: true }));
  parts.push(cell(5.41, 2.96, 5.09, 0.67, 'SÉRIE DA DPS', d.serieDPS, { noBorder: true }));
  parts.push(cell(10.51, 2.96, 5.09, 0.67, 'DATA E HORA DA EMISSÃO DA DPS', d.dhEmissaoDps, { noBorder: true }));
  parts.push(cell(0.30, 3.65, 5.09, 0.67, 'EMITENTE DA NFS-E', cod(d.tpEmit, MAP_TP_EMIT), { noBorder: true }));
  parts.push(cell(5.41, 3.65, 5.09, 0.67, 'SITUAÇÃO DA NFS-E', trunc(d.cStat, 40), { noBorder: true }));
  parts.push(cell(10.51, 3.65, 5.09, 0.67, 'FINALIDADE', trunc(d.finNFSe, 40), { noBorder: true }));
  if (qrDataUrl) {
    parts.push(`<img class="qr" src="${qrDataUrl}" style="left:17.48cm;top:1.67cm;width:1.52cm;height:1.52cm" alt="QR Code">`);
  }
  parts.push(cell(15.80, 3.36, 4.72, 0.68, '', 'Consulte pelo QR Code ou em nfse.gov.br', { center: true, noBorder: true }));

  // ─── PRESTADOR / FORNECEDOR (sup 4,34) ────────────────────────────────────
  parts.push(cell(0.30, 4.34, 5.09, 0.63, '', 'PRESTADOR / FORNECEDOR', { block: true }));
  parts.push(cell(5.41, 4.34, 5.09, 0.63, 'CNPJ / CPF / NIF', fmtCnpjCpf(d.emitCnpj)));
  parts.push(cell(10.51, 4.34, 5.09, 0.63, 'INDICADOR MUNICIPAL (INSCRIÇÃO)', d.emitIm));
  parts.push(cell(15.62, 4.34, 5.09, 0.63, 'TELEFONE', d.emitTelefone));
  parts.push(cell(0.30, 4.98, 10.19, 0.63, 'NOME / NOME EMPRESARIAL', trunc(d.emitNome, 80)));
  parts.push(cell(10.51, 4.98, 5.09, 0.63, 'MUNICÍPIO / SIGLA UF', trunc([d.emitMunicipio, d.emitUF].filter(Boolean).join(' / '), 37)));
  parts.push(cell(15.62, 4.98, 5.09, 0.63, 'CÓDIGO IBGE / CEP', [d.emitCMun, fmtCep(d.emitCep)].filter(Boolean).join(' / ')));
  parts.push(cell(0.30, 5.62, 10.19, 0.63, 'ENDEREÇO', trunc(d.emitEndereco, 80)));
  parts.push(cell(10.51, 5.62, 10.19, 0.63, 'E-MAIL', trunc(d.emitEmail, 80)));
  parts.push(cell(0.30, 6.28, 5.09, 0.63, 'SIMPLES NACIONAL NA COMPETÊNCIA', trunc(cod(d.emitSimplesNac, MAP_SIMPLES), 40)));
  parts.push(cell(5.41, 6.28, 5.09, 0.63, 'REGIME ESPECIAL DE TRIBUTAÇÃO', trunc(d.emitRegEspTrib, 37)));
  parts.push(cell(10.51, 6.28, 10.19, 0.63, 'REGIME DE APURAÇÃO TRIBUTÁRIA PELO SN', trunc(d.emitRegApTribSN, 80)));

  // ─── TOMADOR / ADQUIRENTE (sup 6,92) ──────────────────────────────────────
  parts.push(cell(0.30, 6.92, 5.09, 0.63, '', 'TOMADOR / ADQUIRENTE', { block: true }));
  parts.push(cell(5.41, 6.92, 5.09, 0.63, 'CNPJ / CPF / NIF', fmtCnpjCpf(d.tomaCnpj)));
  parts.push(cell(10.51, 6.92, 5.09, 0.63, 'INDICADOR MUNICIPAL (INSCRIÇÃO)', d.tomaIm));
  parts.push(cell(15.62, 6.92, 5.09, 0.63, 'TELEFONE', d.tomaTelefone));
  parts.push(cell(0.30, 7.56, 10.19, 0.63, 'NOME / NOME EMPRESARIAL', trunc(d.tomaNome, 80)));
  parts.push(cell(10.51, 7.56, 5.09, 0.63, 'MUNICÍPIO / SIGLA UF', trunc([d.tomaMunicipio, d.tomaUF].filter(Boolean).join(' / '), 37)));
  parts.push(cell(15.62, 7.56, 5.09, 0.63, 'CÓDIGO IBGE / CEP', [d.tomaCMun, fmtCep(d.tomaCep)].filter(Boolean).join(' / ')));
  parts.push(cell(0.30, 8.22, 10.19, 0.63, 'ENDEREÇO', trunc(d.tomaEndereco, 80)));
  parts.push(cell(10.51, 8.22, 10.19, 0.63, 'E-MAIL', trunc(d.tomaEmail, 80)));

  // ─── DESTINATÁRIO DA OPERAÇÃO (sup 8,86) ──────────────────────────────────
  // Dados da reforma tributária (IBSCBS/dest). Quando o destinatário é o próprio
  // tomador, a espec permite suprimir os campos — o quadro permanece, vazio.
  parts.push(cell(0.30, 8.86, 5.09, 0.63, '', 'DESTINATÁRIO DA OPERAÇÃO', { block: true }));
  parts.push(cell(5.41, 8.86, 5.09, 0.63, 'CNPJ / CPF / NIF', fmtCnpjCpf(d.destCnpj)));
  parts.push(cell(10.51, 8.86, 5.09, 0.63, '', ''));
  parts.push(cell(15.62, 8.86, 5.09, 0.63, 'TELEFONE', d.destTelefone));
  parts.push(cell(0.30, 9.50, 10.19, 0.63, 'NOME / NOME EMPRESARIAL', trunc(d.destNome, 80)));
  parts.push(cell(10.51, 9.50, 5.09, 0.63, 'MUNICÍPIO / SIGLA UF', ''));
  parts.push(cell(15.62, 9.50, 5.09, 0.63, 'CÓDIGO IBGE / CEP', ''));
  parts.push(cell(0.30, 10.16, 10.19, 0.63, 'ENDEREÇO', ''));
  parts.push(cell(10.51, 10.16, 10.19, 0.63, 'E-MAIL', ''));

  // ─── INTERMEDIÁRIO DA OPERAÇÃO (sup 10,80) ────────────────────────────────
  parts.push(cell(0.30, 10.80, 5.09, 0.63, '', 'INTERMEDIÁRIO DA OPERAÇÃO', { block: true }));
  parts.push(cell(5.41, 10.80, 5.09, 0.63, 'CNPJ / CPF / NIF', fmtCnpjCpf(d.intermCnpj)));
  parts.push(cell(10.51, 10.80, 5.09, 0.63, 'INDICADOR MUNICIPAL (INSCRIÇÃO)', d.intermIm));
  parts.push(cell(15.62, 10.80, 5.09, 0.63, 'TELEFONE', d.intermTelefone));
  parts.push(cell(0.30, 11.44, 10.19, 0.63, 'NOME / NOME EMPRESARIAL', trunc(d.intermNome, 80)));
  parts.push(cell(10.51, 11.44, 5.09, 0.63, 'MUNICÍPIO / SIGLA UF', ''));
  parts.push(cell(15.62, 11.44, 5.09, 0.63, 'CÓDIGO IBGE / CEP', ''));
  parts.push(cell(0.30, 12.09, 10.19, 0.63, 'ENDEREÇO', ''));
  parts.push(cell(10.51, 12.09, 10.19, 0.63, 'E-MAIL', ''));

  // ─── SERVIÇO PRESTADO (sup 12,74) ─────────────────────────────────────────
  parts.push(cell(0.30, 12.74, 5.09, 0.63, '', 'SERVIÇO PRESTADO', { block: true }));
  parts.push(cell(5.41, 12.74, 5.09, 0.63, 'CÓD. TRIBUTAÇÃO NACIONAL / MUNICIPAL', [d.cTribNac, d.cTribMun].filter(Boolean).join(' / ')));
  parts.push(cell(10.51, 12.74, 5.09, 0.63, 'CÓDIGO DA NBS', d.cNBS));
  parts.push(cell(15.62, 12.74, 5.09, 0.63, 'LOCAL DA PRESTAÇÃO', trunc(d.xLocPrestacao, 37)));
  parts.push(cell(0.30, 13.39, 20.40, 0.40, 'TRIBUTAÇÃO NACIONAL / MUNICIPAL', trunc([d.xTribNac, d.xTribMun].filter(Boolean).join(' / '), 170), { tight: true }));
  parts.push(cell(0.30, 13.79, 20.40, 0.63, 'DESCRIÇÃO DO SERVIÇO', trunc(d.xDescServ, 300), { wrap: true }));

  // ─── TRIBUTAÇÃO MUNICIPAL — ISSQN (sup 14,43) ─────────────────────────────
  parts.push(cell(0.30, 14.43, 5.09, 0.63, '', 'TRIBUTAÇÃO MUNICIPAL (ISSQN)', { block: true }));
  parts.push(cell(5.41, 14.43, 5.09, 0.63, 'TRIBUTAÇÃO DO ISSQN', trunc(cod(d.tribISSQN, MAP_TRIB_ISSQN), 40)));
  parts.push(cell(10.51, 14.43, 10.19, 0.63, 'MUNICÍPIO DE INCIDÊNCIA DO ISSQN', trunc(d.xMunicipioIncid, 80)));
  parts.push(cell(0.30, 15.08, 5.09, 0.63, 'REGIME ESPECIAL DE TRIBUTAÇÃO', trunc(d.emitRegEspTrib, 37)));
  parts.push(cell(5.41, 15.08, 5.09, 0.63, 'TIPO DE IMUNIDADE DO ISSQN', trunc(d.tpImunidade, 37)));
  parts.push(cell(10.51, 15.08, 5.09, 0.63, 'SUSPENSÃO DA EXIGIBILIDADE', trunc(d.tpSuspensao, 37)));
  parts.push(cell(15.62, 15.08, 5.09, 0.63, 'Nº DO PROCESSO DE SUSPENSÃO', trunc(d.nProcessoSusp, 30)));
  parts.push(cell(0.30, 15.73, 5.09, 0.63, 'BENEFÍCIO MUNICIPAL', d.tpBM));
  parts.push(cell(5.41, 15.73, 5.09, 0.63, 'VALOR DO BENEFÍCIO MUNICIPAL', fmtMoeda(d.vBM)));
  parts.push(cell(10.51, 15.73, 5.09, 0.63, 'DEDUÇÕES / REDUÇÕES', fmtMoeda(d.vDR)));
  parts.push(cell(15.62, 15.73, 5.09, 0.63, 'DESCONTO INCONDICIONADO', fmtMoeda(d.vDescIncond)));
  parts.push(cell(0.30, 16.37, 5.09, 0.63, 'BC ISSQN', fmtMoeda(d.vBC)));
  parts.push(cell(5.41, 16.37, 5.09, 0.63, 'ALÍQUOTA APLICADA', fmtPerc(d.pAliqAplic)));
  parts.push(cell(10.51, 16.37, 5.09, 0.63, 'RETENÇÃO DO ISSQN', trunc(cod(d.tpRetISSQN, MAP_TP_RET_ISSQN), 25)));
  parts.push(cell(15.62, 16.37, 5.09, 0.63, 'ISSQN APURADO', fmtMoeda(d.vISSQN)));

  // ─── TRIBUTAÇÃO FEDERAL (sup 17,02) ───────────────────────────────────────
  parts.push(cell(0.30, 17.02, 5.09, 0.63, '', 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)', { block: true }));
  parts.push(cell(5.41, 17.02, 5.09, 0.63, 'IRRF - RETIDO', fmtMoeda(d.vIRRF)));
  parts.push(cell(10.51, 17.02, 5.09, 0.63, 'CONTRIB. PREVIDENCIÁRIA - RETIDA', fmtMoeda(d.vCP)));
  parts.push(cell(15.62, 17.02, 5.09, 0.63, 'CONTRIB. SOCIAIS - RETIDAS (CSLL)', fmtMoeda(d.vCSLL)));
  parts.push(cell(0.30, 17.67, 5.09, 0.63, 'PIS - RETENÇÃO PRÓPRIA', fmtMoeda(d.vPIS)));
  parts.push(cell(5.41, 17.67, 5.09, 0.63, 'COFINS - RETENÇÃO PRÓPRIA', fmtMoeda(d.vCOFINS)));
  parts.push(cell(10.51, 17.67, 10.19, 0.63, 'RETENÇÃO DE PIS/COFINS/CSLL', trunc(cod(d.tpRetPisCofins, MAP_TP_RET_PISCOFINS), 35)));

  // ─── TRIBUTAÇÃO IBS / CBS (sup 18,32) ─────────────────────────────────────
  // Bloco da reforma tributária. NFS-e emitidas antes da vigência do IBS/CBS não
  // trazem esses dados: o quadro é impresso vazio, como no formulário oficial.
  parts.push(cell(0.30, 18.32, 5.09, 0.63, '', 'TRIBUTAÇÃO IBS / CBS', { block: true }));
  parts.push(cell(5.41, 18.32, 5.09, 0.63, 'CST / CLASSIFICAÇÃO TRIBUTÁRIA', [d.cstIbsCbs, d.cClassTrib].filter(Boolean).join(' / ')));
  parts.push(cell(10.51, 18.32, 10.19, 0.63, 'LOCALIDADE DE INCIDÊNCIA', trunc(d.xLocalidadeIncid, 80)));
  parts.push(cell(0.30, 18.96, 5.09, 0.63, 'EXCLUSÕES DA BASE DE CÁLCULO', fmtMoeda(d.vExclusoesBC)));
  parts.push(cell(5.41, 18.96, 5.09, 0.63, 'BASE DE CÁLCULO APÓS EXCLUSÕES', fmtMoeda(d.vBCIbsCbs)));
  parts.push(cell(10.51, 18.96, 5.09, 0.63, 'REDUÇÕES DE ALÍQUOTA', ''));
  parts.push(cell(15.62, 18.96, 5.09, 0.63, 'ALÍQUOTAS IBS UF / MUNICIPAL', ''));
  parts.push(cell(0.30, 19.61, 5.09, 0.63, 'ALÍQ. EFETIVA MUNICIPAL - IBS', fmtPerc(d.pAliqEfetMun)));
  parts.push(cell(5.41, 19.61, 5.09, 0.63, 'VALOR APURADO MUNICIPAL - IBS', fmtMoeda(d.vIBSMun)));
  parts.push(cell(10.51, 19.61, 5.09, 0.63, 'ALÍQ. EFETIVA ESTADUAL - IBS', fmtPerc(d.pAliqEfetUF)));
  parts.push(cell(15.62, 19.61, 5.09, 0.63, 'VALOR APURADO ESTADUAL - IBS', fmtMoeda(d.vIBSUF)));
  parts.push(cell(0.30, 20.26, 5.09, 0.63, 'VALOR TOTAL APURADO - IBS', fmtMoeda(d.vIBSTot)));
  parts.push(cell(5.41, 20.26, 5.09, 0.63, 'ALÍQUOTA - CBS', fmtPerc(d.pCBS)));
  parts.push(cell(10.51, 20.26, 5.09, 0.63, 'ALÍQUOTA EFETIVA - CBS', fmtPerc(d.pAliqEfetCBS)));
  parts.push(cell(15.62, 20.26, 5.09, 0.63, 'VALOR TOTAL APURADO - CBS', fmtMoeda(d.vCBS)));

  // ─── VALOR TOTAL DA NFS-E (sup 20,90) ─────────────────────────────────────
  parts.push(cell(0.30, 20.90, 5.09, 0.67, '', 'VALOR TOTAL DA NFS-E', { block: true }));
  parts.push(cell(5.41, 20.90, 5.09, 0.67, 'VALOR DA OPERAÇÃO / SERVIÇO', fmtMoeda(d.vServico)));
  parts.push(cell(10.51, 20.90, 5.09, 0.67, 'DESCONTO INCONDICIONADO', fmtMoeda(d.vDescIncond)));
  parts.push(cell(15.62, 20.90, 5.09, 0.67, 'DESCONTO CONDICIONADO', fmtMoeda(d.vDescCond)));
  parts.push(cell(0.30, 21.59, 5.09, 0.67, 'TOTAL DAS RETENÇÕES (ISSQN / FEDERAIS)', fmtMoeda(d.vTotalRet)));
  parts.push(cell(5.41, 21.59, 5.09, 0.67, 'VALOR LÍQUIDO DA NFS-e', fmtMoeda(d.vLiq), { big: true }));
  parts.push(cell(10.51, 21.59, 5.09, 0.67, 'TOTAL DO IBS/CBS', fmtMoeda(d.vIbsCbsTot)));
  parts.push(cell(15.62, 21.59, 5.09, 0.67, 'VALOR LÍQUIDO + IBS/CBS', fmtMoeda(d.vTotNF)));

  // ─── INFORMAÇÕES COMPLEMENTARES (sup 22,27) ───────────────────────────────
  const totTrib = [
    d.vTotTribFed ? `Federais: R$ ${fmtMoeda(d.vTotTribFed)}` : '',
    d.vTotTribEst ? `Estaduais: R$ ${fmtMoeda(d.vTotTribEst)}` : '',
    d.vTotTribMun ? `Municipais: R$ ${fmtMoeda(d.vTotTribMun)}` : '',
  ].filter(Boolean).join(' | ');
  const infoCompl = [
    d.xInfComp,
    totTrib ? `Valor aproximado dos tributos — ${totTrib}` : '',
  ].filter(Boolean).join('   ');
  parts.push(cell(0.30, 22.27, 20.40, 0.40, '', 'INFORMAÇÕES COMPLEMENTARES', { block: true }));
  parts.push(cell(0.30, 22.67, 20.40, 5.00, '', trunc(infoCompl, 2000), { wrap: true }));

  const stampHtml = stamp
    ? `<div class="stamp ${stamp === 'CANCELADA' ? 'canc' : 'subst'}">${stamp === 'CANCELADA' ? 'CANCELADA' : 'SUBSTITUÍDA'}</div>`
    : '';

  return `<meta charset="utf-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; width: 21cm; height: 29.7cm; position: relative;
    font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .box { position: absolute; border: 0.4pt solid #000; }
  .c {
    position: absolute; border: 0.4pt solid #000;
    padding: 0.03cm 0.07cm; overflow: hidden;
    display: flex; flex-direction: column; justify-content: flex-start;
  }
  .c.nb { border: none; }
  .c.ctr { align-items: center; justify-content: center; text-align: center; }
  .c.blk { background: #e6e6e6; justify-content: center; }
  .c .l { font-size: 4.6pt; line-height: 1.05; letter-spacing: 0.1pt; color: #333; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c .v { font-size: 7pt; line-height: 1.15; margin-top: 0.04cm; }
  .c.tight { padding: 0.01cm 0.06cm; }
  .c.tight .l { font-size: 4pt; }
  .c.tight .v { font-size: 5.6pt; line-height: 1.05; margin-top: 0.01cm; }
  .c:not(.wrap) .v { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c.wrap .v { white-space: pre-wrap; word-break: break-word; }
  .c.blk .v { font-size: 6.4pt; font-weight: bold; text-transform: uppercase; margin: 0; white-space: normal; }
  .c.big .v { font-size: 9pt; font-weight: bold; letter-spacing: 0.2pt; }
  .logo, .qr { position: absolute; object-fit: contain; }
  .qr { border: 0.4pt solid #000; }
  .titulo { font-size: 15pt; font-weight: bold; letter-spacing: 1pt; }
  .subtitulo { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.4pt; }
  .stamp {
    position: absolute; top: 12cm; left: 0; width: 21cm;
    text-align: center; font-size: 62pt; font-weight: bold;
    transform: rotate(-28deg); opacity: 0.16; letter-spacing: 4pt;
  }
  .stamp.canc { color: #c00; }
  .stamp.subst { color: #b45309; }
</style>
${stampHtml}
${parts.join('\n')}
`;
}

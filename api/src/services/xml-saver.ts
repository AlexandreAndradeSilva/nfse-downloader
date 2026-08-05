import zlib from 'zlib';
import { promisify } from 'util';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, renameSync, unlinkSync } from 'fs';
import { join, dirname, basename, relative, sep } from 'path';
import { XMLParser } from 'fast-xml-parser';
import type { NsuIndex } from './nsu-index.js';
import type { TipoDoc, TipoNota, EventoTipo } from '../types.js';

const gunzip = promisify(zlib.gunzip);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

export interface DateRange {
  dataInicio?: Date;
  dataFim?: Date;
}

export interface SavedXmlInfo {
  nsu: number;
  tipo: TipoDoc;
  competencia: string;
  filePath: string;
  chaveAcesso: string;
  dhEmi: string | null;   // ISO cru do XML (dps.dhEmi) — null quando ausente
  dhProc: string | null;  // ISO cru do XML (infNFSe.dhProc; dhCanc/dhEvento p/ eventos)
  eventoTipo?: EventoTipo;
  /** false quando o documento ficou fora do período e nada foi gravado em disco. */
  salvo: boolean;
}

// Extrai um campo de tag XML usando regex — evita perda de precisão numérica do parser
function extractTagValue(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
  return m?.[1]?.trim() ?? '';
}

function asObject(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? v as Record<string, unknown> : {};
}

/**
 * Decodifica (base64+gzip), classifica e grava o documento.
 *
 * Com `dateRange`, uma NFS-e fora do período não é gravada — o filtro do
 * usuário decide o que vai para o disco.
 *
 * Eventos são sempre gravados, mesmo fora do período: é o evento que define a
 * situação da nota, e descartá-lo faria uma nota cancelada aparecer como ativa.
 */
export async function decodeAndSave(
  xmlBase64Gzip: string,
  nsu: number,
  cnpjEmpresa: string,
  outputFolder: string,
  nomeEmpresa: string,
  index: NsuIndex,
  dateRange?: DateRange,
): Promise<SavedXmlInfo> {
  const buffer = Buffer.from(xmlBase64Gzip, 'base64');
  const decompressed = await gunzip(buffer);
  const xmlStr = decompressed.toString('utf-8');

  const parsed = asObject(parser.parse(xmlStr));

  // Detecta tipo pelo elemento raiz:
  // NFS-e → tem <NFSe> na raiz
  // evento → qualquer outro elemento raiz (evento, eCanc, eSubst, retEvento…)
  if (!parsed.NFSe) {
    return saveEvento(xmlStr, parsed, nsu, outputFolder, nomeEmpresa, index);
  }

  return saveNfse(xmlStr, parsed, nsu, cnpjEmpresa, outputFolder, nomeEmpresa, index, dateRange);
}

/** true se dhEmi OU dhProc cair no range; sem nenhuma data válida → true (não perder nota). */
export function isWithinRange(
  info: { dhEmi: string | null; dhProc: string | null },
  range?: DateRange,
): boolean {
  if (!range || (!range.dataInicio && !range.dataFim)) return true;

  const datas = [info.dhEmi, info.dhProc]
    .filter((v): v is string => !!v)
    .map(v => new Date(v))
    .filter(d => !isNaN(d.getTime()));

  // Nota sem data alguma (ou com datas ilegíveis) nunca é descartada pelo filtro
  if (datas.length === 0) return true;

  return datas.some(d =>
    (!range.dataInicio || d >= range.dataInicio) &&
    (!range.dataFim || d <= range.dataFim));
}

// --- NFS-e -----------------------------------------------------------------

function saveNfse(
  xmlStr: string,
  parsed: Record<string, unknown>,
  nsu: number,
  cnpjEmpresa: string,
  outputFolder: string,
  nomeEmpresa: string,
  index: NsuIndex,
  dateRange?: DateRange,
): SavedXmlInfo {
  const infNFSe = asObject(asObject(parsed.NFSe).infNFSe);

  const chaveAcesso: string = (() => {
    const str = String(infNFSe['@_Id'] ?? '');
    return str.startsWith('NFS') ? str.slice(3) : (str || String(nsu));
  })();

  const competencia = extractCompetencia(infNFSe);
  // Strings ISO cruas do XML — o parser converteria datas/números e perderia precisão
  const dhEmi = extractTagValue(xmlStr, 'dhEmi') || null;
  const dhProc = extractTagValue(xmlStr, 'dhProc') || null;

  // XML parser converte CNPJ com zero à esquerda para número (perde o 0)
  // padStart(14, '0') normaliza ambos antes de comparar
  const cnpjPrestador = String(asObject(infNFSe.emit).CNPJ ?? '').replace(/\D/g, '').padStart(14, '0');
  const cnpjEmp = cnpjEmpresa.replace(/\D/g, '').padStart(14, '0');
  const tipo: TipoNota = cnpjPrestador === cnpjEmp ? 'prestados' : 'tomados';

  const companyDir = join(outputFolder, nomeEmpresa);

  // Idempotência: a nota já foi gravada antes (inclusive se depois foi movida
  // para canceladas/ ou substituidas/) → não regrava nem duplica.
  const jaGravado = index.fileForChave(chaveAcesso);
  if (jaGravado) {
    const abs = join(companyDir, jaGravado);
    if (existsSync(abs)) {
      return { nsu, tipo, competencia, filePath: abs, chaveAcesso, dhEmi, dhProc, salvo: true };
    }
  }

  // Fora do período pedido: nada vai para o disco.
  if (!isWithinRange({ dhEmi, dhProc }, dateRange)) {
    return { nsu, tipo, competencia, filePath: '', chaveAcesso, dhEmi, dhProc, salvo: false };
  }

  const dir = join(companyDir, competencia, tipo);
  mkdirSync(dir, { recursive: true });

  const xmlPath = resolveXmlPath(dir, fileBaseName(xmlStr, chaveAcesso, nsu), chaveAcesso);
  if (!existsSync(xmlPath)) {
    writeFileSync(xmlPath, xmlStr, 'utf-8');
  }
  index.registerFile(chaveAcesso, toIndexPath(companyDir, xmlPath));

  return { nsu, tipo, competencia, filePath: xmlPath, chaveAcesso, dhEmi, dhProc, salvo: true };
}

/**
 * Nome base do arquivo: "NFS {nNFSe}" — padrão legível humano.
 * Sem nNFSe, usa o final da chave de acesso (estável entre execuções) e,
 * em último caso, o NSU.
 */
function fileBaseName(xmlStr: string, chaveAcesso: string, nsu: number): string {
  const nNFSe = extractTagValue(xmlStr, 'nNFSe') || extractTagValue(xmlStr, 'nDFSe');
  if (nNFSe) return `NFS ${nNFSe}`;
  if (chaveAcesso) return `NFS ${chaveAcesso.slice(-9)}`;
  return `NFS ${String(nsu).padStart(9, '0')}`;
}

/**
 * Resolve o caminho final do XML sem nunca sobrescrever nota de outra chave.
 * Notas de prestadores diferentes colidem o tempo todo em tomados/ (cada
 * prestador numera a partir do 1), então o desempate usa o final da chave.
 */
function resolveXmlPath(dir: string, base: string, chaveAcesso: string): string {
  const primeiro = join(dir, `${base}.xml`);
  if (!existsSync(primeiro) || arquivoTemChave(primeiro, chaveAcesso)) return primeiro;

  const sufixo = chaveAcesso.slice(-8) || 'dup';
  let candidato = join(dir, `${base} (${sufixo}).xml`);
  // Desempate extra (chaves com os mesmos 8 dígitos finais) — nunca perder a nota
  for (let i = 2; existsSync(candidato) && !arquivoTemChave(candidato, chaveAcesso); i++) {
    candidato = join(dir, `${base} (${sufixo}-${i}).xml`);
  }
  return candidato;
}

/** Confere se o XML em disco é exatamente a nota da chave informada. */
function arquivoTemChave(path: string, chaveAcesso: string): boolean {
  if (!chaveAcesso) return false;
  try {
    return chaveIdRegex(chaveAcesso).test(readFileSync(path, 'utf-8'));
  } catch {
    return false;
  }
}

function chaveIdRegex(chaveAcesso: string): RegExp {
  const escapada = chaveAcesso.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`Id=["']NFS${escapada}["']`);
}

/** Caminho relativo à pasta da empresa, sempre com "/" — formato do índice. */
function toIndexPath(companyDir: string, absPath: string): string {
  return relative(companyDir, absPath).split(sep).join('/');
}

// --- Eventos ---------------------------------------------------------------

function saveEvento(
  xmlStr: string,
  parsed: Record<string, unknown>,
  nsu: number,
  outputFolder: string,
  nomeEmpresa: string,
  index: NsuIndex,
): SavedXmlInfo {
  // Usa regex no XML bruto para evitar perda de precisão em chaves numéricas longas
  // que o fast-xml-parser converte para float e perde os últimos dígitos.
  const chNFSe = extractTagValue(xmlStr, 'chNFSe') || extractTagValue(xmlStr, 'chNFSeAnulada');
  // nDFSe é o número da nota no formato do portal ADN; nNFSe é alternativo
  const nNFSe = extractTagValue(xmlStr, 'nDFSe') || extractTagValue(xmlStr, 'nNFSe');
  const dhEvento = extractTagValue(xmlStr, 'dhCanc')
    || extractTagValue(xmlStr, 'dhEvento')
    || extractTagValue(xmlStr, 'dhSubst');

  const eventoTipo = detectEventoTipo(xmlStr, parsed);

  const dataEvento = dhEvento ? new Date(dhEvento) : null;
  const now = new Date();
  const competencia = (dataEvento && !isNaN(dataEvento.getTime()))
    ? `${String(dataEvento.getMonth() + 1).padStart(2, '0')}${dataEvento.getFullYear()}`
    : `${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;

  const subpasta = eventoTipo === 'cancelamento' ? 'canceladas'
    : eventoTipo === 'substituicao' ? 'substituicoes'
      : 'outros';

  const dir = join(outputFolder, nomeEmpresa, 'eventos', subpasta);
  mkdirSync(dir, { recursive: true });

  // Nome do arquivo: {numeroNota}-canc.xml — usa número legível da nota, não NSU
  const suffix = eventoTipo === 'cancelamento' ? 'canc' : eventoTipo === 'substituicao' ? 'subst' : 'evento';
  const fileBase = nNFSe ? `${nNFSe}-${suffix}` : `${String(nsu).padStart(9, '0')}-${suffix}`;
  const xmlPath = join(dir, `${fileBase}.xml`);

  if (!existsSync(xmlPath)) {
    writeFileSync(xmlPath, xmlStr, 'utf-8');
  }

  // O evento NÃO é registrado por chave no índice: a chave dele aponta para a
  // nota original, e sobrescrever esse mapeamento perderia o arquivo da nota.
  if (chNFSe && (eventoTipo === 'cancelamento' || eventoTipo === 'substituicao')) {
    const destino = eventoTipo === 'cancelamento' ? 'canceladas' : 'substituidas';
    moveNotaOriginal(chNFSe, outputFolder, nomeEmpresa, destino, index);
  }

  return {
    nsu,
    tipo: 'eventos',
    competencia: subpasta,
    filePath: xmlPath,
    chaveAcesso: chNFSe || String(nsu),
    dhEmi: null,
    dhProc: dhEvento || null,
    eventoTipo,
    salvo: true,
  };
}

/**
 * Determina tipo do evento. O portal ADN usa <evento> como raiz com elementos
 * filhos que identificam o tipo: <e101101> = cancelamento, <e110115> = substituição.
 * Também suporta formatos legados <eCanc>/<eSubst>.
 */
function detectEventoTipo(xmlStr: string, parsed: Record<string, unknown>): EventoTipo {
  const rootKey = Object.keys(parsed).find(k => !k.startsWith('?') && !k.startsWith('@')) ?? '';
  if (rootKey === 'eCanc' || parsed.eCanc) return 'cancelamento';
  if (rootKey === 'eSubst' || parsed.eSubst) return 'substituicao';
  if (
    xmlStr.includes('<e101101>') ||
    xmlStr.includes('Cancelamento de NFS-e') ||
    xmlStr.includes('cancelamento de NFS-e')
  ) return 'cancelamento';
  if (xmlStr.includes('<e110115>') || xmlStr.includes('Substitui')) return 'substituicao';

  // Última tentativa: código numérico no atributo Id do infEvento
  const idEvt = xmlStr.match(/Id="EVT[^"]*?(\d{6})\d{3}"/)?.[1] ?? '';
  if (idEvt === '101101' || idEvt === '110111') return 'cancelamento';
  if (idEvt === '110115') return 'substituicao';
  return 'outro';
}

/**
 * Move a nota original de tomados/ ou prestados/ para MMYYYY/canceladas/ ou
 * MMYYYY/substituidas/ e atualiza o índice. O PDF antigo é descartado — o
 * carimbo correto é aplicado quando o usuário pedir os PDFs.
 */
function moveNotaOriginal(
  chNFSe: string,
  outputFolder: string,
  nomeEmpresa: string,
  destino: 'canceladas' | 'substituidas',
  index: NsuIndex,
): void {
  const companyDir = join(outputFolder, nomeEmpresa);
  const rel = index.fileForChave(chNFSe);
  const src = rel ? join(companyDir, rel) : findXmlByChaveOnDisk(companyDir, chNFSe);
  if (!src || !existsSync(src)) return;

  const periodDir = dirname(dirname(src));            // .../MMYYYY
  const destDir = join(periodDir, destino);
  if (dirname(src) === destDir) return;               // já está no destino

  mkdirSync(destDir, { recursive: true });
  const dst = join(destDir, basename(src));
  if (!existsSync(dst)) {
    try {
      renameSync(src, dst);
    } catch {
      return; // arquivo em uso — mantém o índice apontando para o original
    }
  }
  index.moveFile(chNFSe, toIndexPath(companyDir, dst));

  const pdfSrc = src.replace(/\.xml$/, '.pdf');
  if (existsSync(pdfSrc)) {
    try { unlinkSync(pdfSrc); } catch { /* regenerado pelo botão de PDFs */ }
  }
}

/** Fallback para pastas anteriores ao índice: varre o disco procurando a chave. */
function findXmlByChaveOnDisk(companyDir: string, chNFSe: string): string | null {
  if (!existsSync(companyDir) || !chNFSe) return null;
  const idRegex = chaveIdRegex(chNFSe);

  for (const period of safeReaddir(companyDir)) {
    if (period === 'eventos') continue;
    const periodDir = join(companyDir, period);
    for (const tipo of ['tomados', 'prestados'] as const) {
      const tipoDir = join(periodDir, tipo);
      if (!existsSync(tipoDir)) continue;
      for (const file of safeReaddir(tipoDir)) {
        if (!file.endsWith('.xml')) continue;
        const src = join(tipoDir, file);
        try {
          if (idRegex.test(readFileSync(src, 'utf-8'))) return src;
        } catch { /* arquivo ilegível — segue procurando */ }
      }
    }
  }
  return null;
}

function safeReaddir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function extractCompetencia(infNFSe: Record<string, unknown>): string {
  const dps = asObject(asObject(infNFSe.DPS).infDPS);
  // Prioridade: dhEmi (data de emissão) > dhProc (data de processamento) > dCompet (competência do serviço)
  // Nota: dCompet pode ser mês anterior à emissão (serviço prestado em maio, emitido em junho)
  const raw = String(dps.dhEmi ?? infNFSe.dhProc ?? dps.dCompet ?? new Date().toISOString());
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[2]}${match[1]}`;
  return `${String(new Date().getMonth() + 1).padStart(2, '0')}${new Date().getFullYear()}`;
}

/**
 * Importa um XML de NFS-e já decodificado diretamente para a pasta da empresa.
 * Útil para notas baixadas manualmente do portal que não vieram via sync automático.
 * O índice é responsabilidade do chamador (carregar e salvar) — mesma regra do
 * `decodeAndSave`, para que uma importação em lote não releia o índice a cada nota.
 */
export async function importRawXml(
  xmlStr: string,
  cnpjEmpresa: string,
  outputFolder: string,
  nomeEmpresa: string,
  index: NsuIndex,
): Promise<SavedXmlInfo | null> {
  const parsed = asObject(parser.parse(xmlStr));
  if (!parsed.NFSe) return null;

  return saveNfse(xmlStr, parsed, 0, cnpjEmpresa, outputFolder, nomeEmpresa, index);
}

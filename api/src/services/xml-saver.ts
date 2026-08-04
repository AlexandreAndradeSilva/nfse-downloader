import zlib from 'zlib';
import { promisify } from 'util';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { generateDanfse } from './danfse-generator.js';
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
  eventoTipo?: EventoTipo;
}

// Extrai um campo de tag XML usando regex — evita perda de precisão numérica do parser
function extractTagValue(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
  return m?.[1]?.trim() ?? '';
}

export async function decodeAndSave(
  xmlBase64Gzip: string,
  nsu: number,
  cnpjEmpresa: string,
  outputFolder: string,
  nomeEmpresa: string,
  dateRange?: DateRange,
  gerarPdf = false
): Promise<SavedXmlInfo | null> {
  const buffer = Buffer.from(xmlBase64Gzip, 'base64');
  const decompressed = await gunzip(buffer);
  const xmlStr = decompressed.toString('utf-8');

  const parsed = parser.parse(xmlStr);

  // Detecta tipo pelo elemento raiz:
  // NFS-e → tem <NFSe> na raiz
  // evento → qualquer outro elemento raiz (eCanc, eSubst, retEvento…)
  if (!parsed?.NFSe) {
    return decodeAndSaveEvento(xmlStr, parsed, nsu, outputFolder, nomeEmpresa, dateRange);
  }

  // --- NFS-e normal ---
  const infNFSe = parsed?.NFSe?.infNFSe ?? {};
  const dps = infNFSe?.DPS?.infDPS ?? {};

  const chaveAcesso: string = (() => {
    const idAttr = infNFSe?.['@_Id'] ?? '';
    const str = String(idAttr);
    return str.startsWith('NFS') ? str.slice(3) : (str || String(nsu));
  })();

  const competencia = extractCompetencia(infNFSe);
  const dataEmissao = extractDataEmissao(dps, infNFSe);

  if (dateRange) {
    // Se filtro ativo mas não conseguimos extrair a data → pula (filtro estrito)
    if (!dataEmissao) return null;
    if (dateRange.dataInicio && dataEmissao < dateRange.dataInicio) return null;
    if (dateRange.dataFim && dataEmissao > dateRange.dataFim) return null;
  }

  // XML parser converte CNPJ com zero à esquerda para número (perde o 0)
  // padStart(14, '0') normaliza ambos antes de comparar
  const cnpjPrestador = String(infNFSe?.emit?.CNPJ ?? '').replace(/\D/g, '').padStart(14, '0');
  const cnpjEmp = cnpjEmpresa.replace(/\D/g, '').padStart(14, '0');
  const tipo: TipoNota = cnpjPrestador === cnpjEmp ? 'prestados' : 'tomados';

  const dir = join(outputFolder, nomeEmpresa, competencia, tipo);
  mkdirSync(dir, { recursive: true });

  // Nome do arquivo: "NFS {nNFSe}.xml" — padrão legível humano
  // Colisão (arquivo já existe): usa "NFS 0{nNFSe}.xml"
  // Fallback (sem nNFSe): NSU zero-padded
  const nNFSe = extractTagValue(xmlStr, 'nNFSe') || extractTagValue(xmlStr, 'nDFSe');
  let base = nNFSe ? `NFS ${nNFSe}` : String(nsu).padStart(9, '0');
  let xmlPath = join(dir, `${base}.xml`);
  if (existsSync(xmlPath) && nNFSe) {
    base = `NFS 0${nNFSe}`;
    xmlPath = join(dir, `${base}.xml`);
  }

  if (!existsSync(xmlPath)) {
    writeFileSync(xmlPath, xmlStr, 'utf-8');
  }

  if (gerarPdf) {
    const pdfPath = join(dir, `${base}.pdf`);
    const localMarker = join(dir, `${base}.local`);
    if (!existsSync(pdfPath)) {
      let pdfBuf: Buffer | null = null;
      try {
        pdfBuf = await generateDanfse(xmlStr);
      } catch (err) {
        console.warn(`[AVISO] PDF não gerado para NSU ${nsu}: ${(err as Error).message}`);
      }
      if (pdfBuf) {
        writeFileSync(pdfPath, pdfBuf);
        // Marca PDFs gerados localmente para que "PDFs Oficiais" os identifique
        writeFileSync(localMarker, '');
      }
    }
  }

  return { nsu, tipo, competencia, filePath: xmlPath, chaveAcesso };
}

async function decodeAndSaveEvento(
  xmlStr: string,
  parsed: Record<string, unknown>,
  nsu: number,
  outputFolder: string,
  nomeEmpresa: string,
  dateRange?: DateRange
): Promise<SavedXmlInfo | null> {
  let eventoTipo: EventoTipo = 'outro';

  // Usa regex no XML bruto para evitar perda de precisão em chaves numéricas de 44 dígitos
  // que o fast-xml-parser converte para float e perde os últimos dígitos.
  const chNFSe = extractTagValue(xmlStr, 'chNFSe') || extractTagValue(xmlStr, 'chNFSeAnulada');
  // nDFSe é o número da nota no formato do portal ADN; nNFSe é alternativo
  const nNFSe = extractTagValue(xmlStr, 'nDFSe') || extractTagValue(xmlStr, 'nNFSe');
  const dhEvento = extractTagValue(xmlStr, 'dhCanc')
    || extractTagValue(xmlStr, 'dhEvento')
    || extractTagValue(xmlStr, 'dhSubst');

  // Determina tipo do evento. O portal ADN usa <evento> como raiz com elementos
  // filhos que identificam o tipo: <e101101> = cancelamento, <e110115> = substituição.
  // Também suporta formatos legados <eCanc>/<eSubst>.
  const rootKey = Object.keys(parsed).find(k => !k.startsWith('?') && !k.startsWith('@')) ?? '';
  if (rootKey === 'eCanc' || parsed?.eCanc) {
    eventoTipo = 'cancelamento';
  } else if (rootKey === 'eSubst' || parsed?.eSubst) {
    eventoTipo = 'substituicao';
  } else if (
    xmlStr.includes('<e101101>') ||
    xmlStr.includes('Cancelamento de NFS-e') ||
    xmlStr.includes('cancelamento de NFS-e')
  ) {
    eventoTipo = 'cancelamento';
  } else if (xmlStr.includes('<e110115>') || xmlStr.includes('Substitui')) {
    eventoTipo = 'substituicao';
  } else {
    // Última tentativa: código numérico no atributo Id do infEvento
    const idEvt = xmlStr.match(/Id="EVT[^"]*?(\d{6})\d{3}"/)?.[1] ?? '';
    if (idEvt === '101101' || idEvt === '110111') eventoTipo = 'cancelamento';
    else if (idEvt === '110115') eventoTipo = 'substituicao';
  }

  const dataEvento = dhEvento ? new Date(dhEvento) : null;
  if (dateRange && dataEvento && !isNaN(dataEvento.getTime())) {
    if (dateRange.dataInicio && dataEvento < dateRange.dataInicio) return null;
    if (dateRange.dataFim && dataEvento > dateRange.dataFim) return null;
  }

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

  // Se é cancelamento e temos a chave, move a nota original para a pasta canceladas/
  if (eventoTipo === 'cancelamento' && chNFSe) {
    await moveCancelledNote(chNFSe, outputFolder, nomeEmpresa);
  }

  return { nsu, tipo: 'eventos', competencia: subpasta, filePath: xmlPath, chaveAcesso: chNFSe || String(nsu), eventoTipo };
}

/**
 * Move a nota cancelada de tomados/ ou prestados/ para MMYYYY/canceladas/
 * e regenera o PDF com carimbo de CANCELADA.
 */
async function moveCancelledNote(chNFSe: string, outputFolder: string, nomeEmpresa: string): Promise<void> {
  const companyDir = join(outputFolder, nomeEmpresa);
  if (!existsSync(companyDir)) return;

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
          const xmlChk = readFileSync(src, 'utf-8');
          if (!xmlChk.includes(chNFSe)) continue;
        } catch {
          continue;
        }

        const canceladasDir = join(periodDir, 'canceladas');
        mkdirSync(canceladasDir, { recursive: true });
        const dst = join(canceladasDir, file);
        if (!existsSync(dst)) {
          try {
            renameSync(src, dst);
          } catch { /* arquivo em uso? ignora */ }
        }

        // Remove PDF antigo e regenera com carimbo CANCELADA
        const pdfSrc = src.replace(/\.xml$/, '.pdf');
        const pdfDst = dst.replace(/\.xml$/, '.pdf');
        if (existsSync(pdfSrc)) {
          try {
            unlinkSync(pdfSrc);
          } catch { /* ignora */ }
        }
        if (!existsSync(pdfDst)) {
          try {
            const xmlContent = readFileSync(dst, 'utf-8');
            const pdfBuf = await generateDanfse(xmlContent, true);
            const localMarker = pdfDst.replace(/\.pdf$/, '.local');
            writeFileSync(pdfDst, pdfBuf);
            writeFileSync(localMarker, '');
          } catch { /* PDF opcional — ignora falha */ }
        }
      }
    }
  }
}

function safeReaddir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function extractDataEmissao(dps: Record<string, unknown>, infNFSe: Record<string, unknown>): Date | null {
  // Tenta dhEmi (data/hora da emissão), depois dhProc, depois dCompet (fallback)
  const candidates = [
    dps?.dhEmi,
    infNFSe?.dhProc,
    dps?.dCompet,     // formato YYYY-MM-DD — mais simples, sem fuso horário
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const d = new Date(String(raw));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function extractCompetencia(infNFSe: Record<string, unknown>): string {
  const dps = (infNFSe?.DPS as Record<string, unknown>)?.infDPS as Record<string, unknown>;
  // Prioridade: dhEmi (data de emissão) > dhProc (data de processamento) > dCompet (competência do serviço)
  // Nota: dCompet pode ser mês anterior à emissão (serviço prestado em maio, emitido em junho)
  const raw = String(dps?.dhEmi ?? infNFSe?.dhProc ?? dps?.dCompet ?? new Date().toISOString());
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[2]}${match[1]}`;
  return `${String(new Date().getMonth() + 1).padStart(2, '0')}${new Date().getFullYear()}`;
}

/**
 * Importa um XML de NFS-e já decodificado diretamente para a pasta da empresa.
 * Útil para notas baixadas manualmente do portal que não vieram via sync automático.
 */
export async function importRawXml(
  xmlStr: string,
  cnpjEmpresa: string,
  outputFolder: string,
  nomeEmpresa: string,
  gerarPdf = false
): Promise<SavedXmlInfo | null> {
  const parsed = parser.parse(xmlStr);
  if (!parsed?.NFSe) return null;

  const infNFSe = parsed?.NFSe?.infNFSe ?? {};
  const dps = infNFSe?.DPS?.infDPS ?? {};

  const chaveAcesso: string = (() => {
    const idAttr = String(infNFSe?.['@_Id'] ?? '');
    return idAttr.startsWith('NFS') ? idAttr.slice(3) : (idAttr || '');
  })();

  const competencia = extractCompetencia(infNFSe);
  const dataEmissao = extractDataEmissao(dps, infNFSe);
  void dataEmissao; // sem filtro de data na importação manual

  const emit = infNFSe?.emit ?? {};
  const cnpjPrestador = String(emit.CNPJ ?? '').replace(/\D/g, '').padStart(14, '0');
  const cnpjEmp = cnpjEmpresa.replace(/\D/g, '').padStart(14, '0');
  const tipo: TipoNota = cnpjPrestador === cnpjEmp ? 'prestados' : 'tomados';

  const dir = join(outputFolder, nomeEmpresa, competencia, tipo);
  mkdirSync(dir, { recursive: true });

  const nNFSe = extractTagValue(xmlStr, 'nNFSe') || extractTagValue(xmlStr, 'nDFSe');
  let base = nNFSe ? `NFS ${nNFSe}` : (chaveAcesso ? chaveAcesso.slice(-9) : String(Date.now()));
  let xmlPath = join(dir, `${base}.xml`);
  if (existsSync(xmlPath) && nNFSe) {
    base = `NFS 0${nNFSe}`;
    xmlPath = join(dir, `${base}.xml`);
  }

  writeFileSync(xmlPath, xmlStr, 'utf-8');

  if (gerarPdf) {
    const pdfPath = join(dir, `${base}.pdf`);
    if (!existsSync(pdfPath)) {
      try {
        const pdfBuf = await generateDanfse(xmlStr);
        writeFileSync(pdfPath, pdfBuf);
      } catch { /* PDF opcional */ }
    }
  }

  return { nsu: 0, tipo, competencia, filePath: xmlPath, chaveAcesso };
}

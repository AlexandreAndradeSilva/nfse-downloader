import zlib from 'zlib';
import { promisify } from 'util';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { generateDanfse } from './danfse-generator.js';

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
  tipo: 'prestados' | 'tomados';
  competencia: string;
  filePath: string;
  chaveAcesso: string;
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
  const tipo: 'prestados' | 'tomados' = cnpjPrestador === cnpjEmp ? 'prestados' : 'tomados';

  const dir = join(outputFolder, nomeEmpresa, competencia, tipo);
  mkdirSync(dir, { recursive: true });

  const base = `${String(nsu).padStart(9, '0')}-${chaveAcesso}`;
  const xmlPath = join(dir, `${base}.xml`);

  if (!existsSync(xmlPath)) {
    writeFileSync(xmlPath, xmlStr, 'utf-8');
  }

  if (gerarPdf) {
    const pdfPath = join(dir, `${base}.pdf`);
    if (!existsSync(pdfPath)) {
      try {
        const pdfBuf = await generateDanfse(xmlStr);
        writeFileSync(pdfPath, pdfBuf);
      } catch (err) {
        console.warn(`[AVISO] PDF não gerado para NSU ${nsu}: ${(err as Error).message}`);
      }
    }
  }

  return { nsu, tipo, competencia, filePath: xmlPath, chaveAcesso };
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

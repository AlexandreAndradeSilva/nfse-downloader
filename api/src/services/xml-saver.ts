import zlib from 'zlib';
import { promisify } from 'util';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

const gunzip = promisify(zlib.gunzip);
const parser = new XMLParser({ ignoreAttributes: false });

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
  nomeEmpresa: string
): Promise<SavedXmlInfo> {
  const buffer = Buffer.from(xmlBase64Gzip, 'base64');
  const decompressed = await gunzip(buffer);
  const xmlStr = decompressed.toString('utf-8');

  const parsed = parser.parse(xmlStr);
  const infNFSe = parsed?.NFSe?.infNFSe ?? parsed?.nfse?.infNFSe ?? {};

  const chaveAcesso: string = infNFSe.chNFSe ?? infNFSe.chaveAcesso ?? String(nsu);
  const competencia = extractCompetencia(infNFSe);
  const cnpjPrestador: string = String(infNFSe.prestador?.CNPJ ?? infNFSe.prestador?.cnpj ?? '');
  const tipo: 'prestados' | 'tomados' =
    cnpjPrestador.replace(/\D/g, '') === cnpjEmpresa.replace(/\D/g, '')
      ? 'prestados'
      : 'tomados';

  const dir = join(outputFolder, nomeEmpresa, competencia, tipo);
  mkdirSync(dir, { recursive: true });

  const fileName = `${String(nsu).padStart(9, '0')}-${chaveAcesso}.xml`;
  const filePath = join(dir, fileName);

  if (!existsSync(filePath)) {
    writeFileSync(filePath, xmlStr, 'utf-8');
  }

  return { nsu, tipo, competencia, filePath, chaveAcesso };
}

function extractCompetencia(infNFSe: Record<string, unknown>): string {
  const raw =
    (infNFSe.dCompet as string) ??
    (infNFSe.competencia as string) ??
    (infNFSe.dtEmissao as string) ??
    new Date().toISOString();
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[2]}${match[1]}`;
  return `${String(new Date().getMonth() + 1).padStart(2, '0')}${new Date().getFullYear()}`;
}

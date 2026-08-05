import { existsSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';

/**
 * Convenções de layout da pasta de uma competência.
 *
 * Antes de "Juntar PDF":
 *   072026/tomados/NFS 123.xml
 *   072026/tomados/NFS 123.pdf
 *
 * Depois:
 *   072026/tomados/NFS TOMADOS JUNTO.pdf   ← consolidado
 *   072026/tomados/NFS 123.pdf             ← individuais preservados
 *   072026/tomados/XML NFS/NFS 123.xml     ← XMLs recolhidos
 *
 * Os XMLs mudam de lugar, então tudo que os varre precisa passar por aqui.
 */

/** Subpasta onde os XMLs ficam depois de "Juntar PDF". */
export const PASTA_XML = 'XML NFS';

/** Nome do PDF consolidado de um tipo de nota. */
export function nomeConsolidado(tipo: string): string {
  return `NFS ${tipo.toUpperCase()} JUNTO.pdf`;
}

/** true quando o arquivo é um consolidado gerado por "Juntar PDF". */
export function ehConsolidado(nomeArquivo: string): boolean {
  return /^NFS .+ JUNTO\.pdf$/i.test(nomeArquivo);
}

function lerDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir); } catch { return []; }
}

/**
 * Lista os XMLs de uma pasta de tipo (tomados/prestados/canceladas/…),
 * cobrindo tanto o layout original quanto os XMLs já recolhidos em "XML NFS".
 * Devolve caminhos absolutos.
 */
export function listarXmls(tipoDir: string): string[] {
  const arquivos: string[] = [];

  for (const nome of lerDir(tipoDir)) {
    if (nome.toLowerCase().endsWith('.xml')) arquivos.push(join(tipoDir, nome));
  }

  const subpasta = join(tipoDir, PASTA_XML);
  for (const nome of lerDir(subpasta)) {
    if (nome.toLowerCase().endsWith('.xml')) arquivos.push(join(subpasta, nome));
  }

  return arquivos;
}

/**
 * Caminho do PDF correspondente a um XML.
 * O PDF fica sempre na pasta do tipo, mesmo quando o XML já foi recolhido.
 */
export function pdfDoXml(xmlPath: string): string {
  const pasta = dirname(xmlPath);
  const destino = basename(pasta) === PASTA_XML ? dirname(pasta) : pasta;
  return join(destino, basename(xmlPath).replace(/\.xml$/i, '.pdf'));
}

/** Lista os PDFs individuais de uma pasta de tipo, ignorando o consolidado. */
export function listarPdfsIndividuais(tipoDir: string): string[] {
  return lerDir(tipoDir)
    .filter(n => n.toLowerCase().endsWith('.pdf') && !ehConsolidado(n))
    .map(n => join(tipoDir, n));
}

/** Subpastas de competência de uma empresa (MMAAAA), ignorando `eventos`. */
export function listarCompetencias(companyDir: string): string[] {
  return lerDir(companyDir).filter(nome => {
    if (nome === 'eventos' || nome.startsWith('.')) return false;
    try { return statSync(join(companyDir, nome)).isDirectory(); } catch { return false; }
  });
}

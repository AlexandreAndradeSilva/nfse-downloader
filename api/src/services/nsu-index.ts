import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join } from 'path';
import type { TipoDoc, EventoTipo } from '../types.js';

export interface NsuRecord {
  chave: string;
  tipo: TipoDoc;
  dhEmi: string | null;   // ISO — data de emissão (dps.dhEmi)
  dhProc: string | null;  // ISO — geração/processamento (infNFSe.dhProc; dhEvento p/ eventos)
  arquivo: string;        // caminho relativo à pasta da empresa
  eventoTipo?: EventoTipo;
}

interface IndexFile {
  version: 1;
  nsus: Record<string, NsuRecord>;
}

const INDEX_NAME = '.nfse-index.json';

/**
 * Índice NSU→documento por empresa. Permite:
 * - pular NSUs já baixados em re-buscas por período (sem rede);
 * - localizar a nota original por chave (cancelamento/substituição) em O(1);
 * - idempotência de gravação (chave → arquivo já existente).
 */
export class NsuIndex {
  private nsus = new Map<number, NsuRecord>();
  private byChave = new Map<string, number>();
  private files = new Map<string, string>(); // chave → arquivo (inclui notas sem NSU conhecido)

  private constructor(private companyDir: string) {}

  static load(companyDir: string): NsuIndex {
    const idx = new NsuIndex(companyDir);
    const path = join(companyDir, INDEX_NAME);
    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, 'utf-8')) as IndexFile | null;
        for (const [nsuStr, rec] of Object.entries(data?.nsus ?? {})) {
          const nsu = Number(nsuStr);
          if (!Number.isInteger(nsu)) continue; // chave inesperada no JSON → ignora entrada
          idx.set(nsu, rec);
        }
      } catch { /* corrompido → começa vazio; será reconstruído pelo uso */ }
    }
    return idx;
  }

  has(nsu: number): boolean { return this.nsus.has(nsu); }
  get(nsu: number): NsuRecord | undefined { return this.nsus.get(nsu); }

  set(nsu: number, rec: NsuRecord): void {
    this.nsus.set(nsu, rec);
    // A `chave` de um evento é a da NOTA que ele afeta, não a de um artefato próprio.
    // Indexá-la faria o evento sequestrar as buscas por chave da nota original.
    if (rec.tipo !== 'eventos') {
      this.byChave.set(rec.chave, nsu);
      this.files.set(rec.chave, rec.arquivo);
    }
  }

  findByChave(chave: string): { nsu: number; rec: NsuRecord } | undefined {
    const nsu = this.byChave.get(chave);
    if (nsu === undefined) return undefined;
    const rec = this.nsus.get(nsu);
    if (rec === undefined) return undefined; // defensivo: mapas devem ficar em sincronia via set()
    return { nsu, rec };
  }

  /** Registra arquivo por chave sem NSU (usado por importRawXml e rebuild do disco). */
  registerFile(chave: string, arquivo: string): void { this.files.set(chave, arquivo); }
  fileForChave(chave: string): string | undefined { return this.files.get(chave); }

  /** Atualiza o caminho após mover a nota (cancelada/substituída). */
  moveFile(chave: string, novoArquivo: string): void {
    this.files.set(chave, novoArquivo);
    const nsu = this.byChave.get(chave);
    if (nsu === undefined) return;
    const rec = this.nsus.get(nsu);
    if (rec) rec.arquivo = novoArquivo;
  }

  maxNsu(): number {
    let max = 0;
    for (const nsu of this.nsus.keys()) if (nsu > max) max = nsu;
    return max;
  }

  /** Menor NSU indexado >= cursor (para pular buracos que o servidor já expirou). */
  nextKnownNsu(cursor: number): number | undefined {
    let best: number | undefined;
    for (const nsu of this.nsus.keys()) {
      if (nsu >= cursor && (best === undefined || nsu < best)) best = nsu;
    }
    return best;
  }

  save(): void {
    const data: IndexFile = { version: 1, nsus: {} };
    for (const [nsu, rec] of this.nsus) data.nsus[String(nsu)] = rec;
    const path = join(this.companyDir, INDEX_NAME);
    const tmp = path + '.tmp';
    writeFileSync(tmp, JSON.stringify(data), 'utf-8');
    renameSync(tmp, path); // gravação atômica
  }
}

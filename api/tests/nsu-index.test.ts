import { describe, it, expect, afterEach } from 'vitest';
import { rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { NsuIndex } from '../src/services/nsu-index.js';

const DIR = join(process.cwd(), 'test-index-output');

afterEach(() => { if (existsSync(DIR)) rmSync(DIR, { recursive: true }); });

describe('NsuIndex', () => {
  it('persiste e recarrega registros', () => {
    mkdirSync(DIR, { recursive: true });
    const idx = NsuIndex.load(DIR);
    idx.set(1, { chave: 'A'.repeat(50), tipo: 'prestados', dhEmi: '2026-07-01T10:00:00-03:00', dhProc: null, arquivo: '072026/prestados/NFS 1.xml' });
    idx.save();
    const idx2 = NsuIndex.load(DIR);
    expect(idx2.has(1)).toBe(true);
    expect(idx2.get(1)!.chave).toBe('A'.repeat(50));
    expect(idx2.maxNsu()).toBe(1);
  });

  it('arquivo corrompido → índice vazio sem lançar', () => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, '.nfse-index.json'), '{corrompido', 'utf-8');
    const idx = NsuIndex.load(DIR);
    expect(idx.maxNsu()).toBe(0);
  });

  it('findByChave localiza nsu e registro', () => {
    mkdirSync(DIR, { recursive: true });
    const idx = NsuIndex.load(DIR);
    idx.set(7, { chave: 'X'.repeat(50), tipo: 'tomados', dhEmi: null, dhProc: '2026-07-02T09:00:00-03:00', arquivo: '072026/tomados/NFS 9.xml' });
    const hit = idx.findByChave('X'.repeat(50));
    expect(hit?.nsu).toBe(7);
    expect(hit?.rec.arquivo).toContain('NFS 9');
  });

  it('nextKnownNsu retorna o menor NSU indexado >= cursor', () => {
    mkdirSync(DIR, { recursive: true });
    const idx = NsuIndex.load(DIR);
    const rec = { chave: 'C'.repeat(50), tipo: 'prestados' as const, dhEmi: null, dhProc: null, arquivo: 'a.xml' };
    idx.set(5, rec); idx.set(12, { ...rec, chave: 'D'.repeat(50) });
    expect(idx.nextKnownNsu(1)).toBe(5);
    expect(idx.nextKnownNsu(6)).toBe(12);
    expect(idx.nextKnownNsu(13)).toBeUndefined();
  });

  it('registerFile + fileForChave evitam duplicar arquivo por chave', () => {
    mkdirSync(DIR, { recursive: true });
    const idx = NsuIndex.load(DIR);
    idx.registerFile('K'.repeat(50), '072026/tomados/NFS 1.xml');
    expect(idx.fileForChave('K'.repeat(50))).toBe('072026/tomados/NFS 1.xml');
    expect(idx.fileForChave('Z'.repeat(50))).toBeUndefined();
  });
});

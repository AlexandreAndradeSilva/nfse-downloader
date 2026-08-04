import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { fixMojibakePath, mergeMove } from '../src/services/startup-migration.js';

const TMP = join(process.cwd(), 'test-migration');

afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true }); });

describe('fixMojibakePath', () => {
  it('troca U+FFFD por Á quando a pasta corrigida existe', () => {
    const bom = join(TMP, 'Área de Trabalho', 'nfs');
    mkdirSync(bom, { recursive: true });
    expect(fixMojibakePath(join(TMP, '�rea de Trabalho', 'nfs'))).toBe(bom);
  });

  it('aceita que o diretório final ainda não exista, desde que o pai exista', () => {
    mkdirSync(join(TMP, 'Área de Trabalho'), { recursive: true });
    const corrigido = fixMojibakePath(join(TMP, '�rea de Trabalho', 'ainda-nao-criada'));
    expect(corrigido).toBe(join(TMP, 'Área de Trabalho', 'ainda-nao-criada'));
  });

  it('mantém o caminho quando não há U+FFFD', () => {
    const p = join(TMP, 'sem-problema');
    expect(fixMojibakePath(p)).toBe(p);
  });

  it('mantém o caminho quando nenhuma correção existe no disco', () => {
    const p = join(TMP, 'inexistente', '�rea', 'nfs');
    expect(fixMojibakePath(p)).toBe(p);
  });
});

describe('mergeMove', () => {
  it('move arquivos sem sobrescrever os já existentes no destino', () => {
    const src = join(TMP, 'src');
    const dst = join(TMP, 'dst');
    mkdirSync(join(src, 'sub'), { recursive: true });
    mkdirSync(join(dst, 'sub'), { recursive: true });
    writeFileSync(join(src, 'sub', 'a.xml'), 'origem');
    writeFileSync(join(dst, 'sub', 'a.xml'), 'destino-preservado');
    writeFileSync(join(src, 'sub', 'b.xml'), 'b');

    mergeMove(src, dst);

    expect(readFileSync(join(dst, 'sub', 'a.xml'), 'utf-8')).toBe('destino-preservado');
    expect(existsSync(join(dst, 'sub', 'b.xml'))).toBe(true);
    expect(existsSync(join(src, 'sub', 'b.xml'))).toBe(false);
  });

  it('remove a árvore de origem quando ela esvazia', () => {
    const src = join(TMP, 'src');
    const dst = join(TMP, 'dst');
    mkdirSync(join(src, 'p', 'q'), { recursive: true });
    writeFileSync(join(src, 'p', 'q', 'x.xml'), 'x');

    mergeMove(src, dst);

    expect(existsSync(join(dst, 'p', 'q', 'x.xml'))).toBe(true);
    expect(existsSync(src)).toBe(false);
  });

  it('cria o destino quando ele não existe', () => {
    const src = join(TMP, 'src');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'a.xml'), 'a');

    mergeMove(src, join(TMP, 'novo'));

    expect(readFileSync(join(TMP, 'novo', 'a.xml'), 'utf-8')).toBe('a');
  });

  it('não faz nada quando a origem não existe', () => {
    expect(() => mergeMove(join(TMP, 'nada'), join(TMP, 'dst'))).not.toThrow();
    expect(existsSync(join(TMP, 'dst'))).toBe(false);
  });
});

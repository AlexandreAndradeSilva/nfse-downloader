import { describe, it, expect } from 'vitest';
import { parseTiposParam } from '../src/routes/sync.js';

describe('parseTiposParam', () => {
  it('default (sem query) → ambos os tipos', () => {
    expect(parseTiposParam(undefined)).toEqual(['prestados', 'tomados']);
  });

  it('um único tipo válido', () => {
    expect(parseTiposParam('prestados')).toEqual(['prestados']);
    expect(parseTiposParam('tomados')).toEqual(['tomados']);
  });

  it('ambos os tipos explícitos', () => {
    expect(parseTiposParam('prestados,tomados')).toEqual(['prestados', 'tomados']);
  });

  it('valor inválido cai no default (evita resumo zerado)', () => {
    expect(parseTiposParam('xyz')).toEqual(['prestados', 'tomados']);
  });

  it('string vazia cai no default', () => {
    expect(parseTiposParam('')).toEqual(['prestados', 'tomados']);
  });

  it('mistura válido + inválido filtra o inválido', () => {
    expect(parseTiposParam('prestados,xyz')).toEqual(['prestados']);
  });

  it('espaços em branco são ignorados', () => {
    expect(parseTiposParam(' prestados , tomados ')).toEqual(['prestados', 'tomados']);
  });
});

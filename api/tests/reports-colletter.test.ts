import { describe, it, expect } from 'vitest';
import { colLetter } from '../src/routes/reports.js';

describe('colLetter', () => {
  it('mapeia as 26 primeiras colunas para A–Z', () => {
    expect(colLetter(1)).toBe('A');
    expect(colLetter(26)).toBe('Z');
  });

  it('passa de Z para AA em vez de gerar caractere inválido', () => {
    // String.fromCharCode(64 + 27) devolvia '[', quebrando o autoFilter do Excel
    expect(colLetter(27)).toBe('AA');
    expect(colLetter(28)).toBe('AB');
    expect(colLetter(52)).toBe('AZ');
    expect(colLetter(53)).toBe('BA');
  });

  it('cobre o número real de colunas do relatório sem caractere fora de A–Z', () => {
    for (let n = 1; n <= 60; n++) {
      expect(colLetter(n)).toMatch(/^[A-Z]+$/);
    }
  });
});

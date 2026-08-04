import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { buildEventIndex } from '../src/services/xml-reader.js';

const OUTPUT = join(process.cwd(), 'test-event-index');
const EMPRESA = 'Empresa Teste';
const CH_CANC = '1'.repeat(50);
const CH_SUBST = '2'.repeat(50);

function escreveEvento(sub: string, nome: string, xml: string): void {
  const dir = join(OUTPUT, EMPRESA, 'eventos', sub);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, nome), xml, 'utf-8');
}

afterEach(() => { if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true }); });

describe('buildEventIndex', () => {
  it('separa chaves canceladas de substituídas', () => {
    escreveEvento('canceladas', '1-canc.xml',
      `<evento><e101101><chNFSe>${CH_CANC}</chNFSe></e101101></evento>`);
    escreveEvento('substituicoes', '2-subst.xml',
      `<evento><e110115><chNFSe>${CH_SUBST}</chNFSe></e110115></evento>`);

    const idx = buildEventIndex(OUTPUT, EMPRESA);
    expect(idx.canceladas.has(CH_CANC)).toBe(true);
    expect(idx.substituidas.has(CH_SUBST)).toBe(true);
    expect(idx.canceladas.has(CH_SUBST)).toBe(false);
    expect(idx.substituidas.has(CH_CANC)).toBe(false);
  });

  it('classifica pelo conteúdo, não pelo nome da subpasta', () => {
    // Evento de substituição arquivado na pasta errada por versão anterior
    escreveEvento('outros', 'x.xml',
      `<evento><e110115><chNFSe>${CH_SUBST}</chNFSe></e110115></evento>`);
    const idx = buildEventIndex(OUTPUT, EMPRESA);
    expect(idx.substituidas.has(CH_SUBST)).toBe(true);
  });

  it('reconhece chSubstda como chave da nota substituída', () => {
    escreveEvento('substituicoes', 's.xml',
      `<evento><e110115><chSubstda>${CH_SUBST}</chSubstda></e110115></evento>`);
    expect(buildEventIndex(OUTPUT, EMPRESA).substituidas.has(CH_SUBST)).toBe(true);
  });

  it('cancelamento tem precedência quando a nota tem os dois eventos', () => {
    escreveEvento('substituicoes', 'a.xml',
      `<evento><e110115><chNFSe>${CH_CANC}</chNFSe></e110115></evento>`);
    escreveEvento('canceladas', 'b.xml',
      `<evento><e101101><chNFSe>${CH_CANC}</chNFSe></e101101></evento>`);
    const idx = buildEventIndex(OUTPUT, EMPRESA);
    expect(idx.canceladas.has(CH_CANC)).toBe(true);
    expect(idx.substituidas.has(CH_CANC)).toBe(false);
  });

  it('pasta de eventos inexistente devolve índice vazio', () => {
    const idx = buildEventIndex(OUTPUT, 'Empresa Sem Nada');
    expect(idx.canceladas.size).toBe(0);
    expect(idx.substituidas.size).toBe(0);
  });
});

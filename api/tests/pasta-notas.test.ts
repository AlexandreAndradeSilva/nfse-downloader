import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  PASTA_XML, ehConsolidado, listarPdfsIndividuais, listarXmls, nomeConsolidado, pdfDoXml,
} from '../src/services/pasta-notas.js';

const TMP = join(process.cwd(), 'test-pasta-notas');
const TIPO_DIR = join(TMP, '072026', 'tomados');

function criar(caminho: string, conteudo = 'x'): void {
  mkdirSync(join(caminho, '..'), { recursive: true });
  writeFileSync(caminho, conteudo, 'utf-8');
}

afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true }); });

describe('nomeConsolidado', () => {
  it('usa o tipo em caixa alta', () => {
    expect(nomeConsolidado('tomados')).toBe('NFS TOMADOS JUNTO.pdf');
    expect(nomeConsolidado('prestados')).toBe('NFS PRESTADOS JUNTO.pdf');
  });
});

describe('ehConsolidado', () => {
  it('reconhece o consolidado e ignora notas individuais', () => {
    expect(ehConsolidado('NFS TOMADOS JUNTO.pdf')).toBe(true);
    expect(ehConsolidado('NFS PRESTADOS JUNTO.pdf')).toBe(true);
    expect(ehConsolidado('NFS 123.pdf')).toBe(false);
    expect(ehConsolidado('NFS JUNTO 1.pdf')).toBe(false);
  });
});

describe('listarXmls', () => {
  it('encontra XMLs no layout original', () => {
    criar(join(TIPO_DIR, 'NFS 1.xml'));
    criar(join(TIPO_DIR, 'NFS 2.xml'));
    expect(listarXmls(TIPO_DIR)).toHaveLength(2);
  });

  it('encontra XMLs já recolhidos para "XML NFS"', () => {
    criar(join(TIPO_DIR, PASTA_XML, 'NFS 1.xml'));
    criar(join(TIPO_DIR, PASTA_XML, 'NFS 2.xml'));
    const achados = listarXmls(TIPO_DIR);
    expect(achados).toHaveLength(2);
    expect(achados[0]).toContain(PASTA_XML);
  });

  it('cobre os dois layouts ao mesmo tempo', () => {
    criar(join(TIPO_DIR, 'NFS 1.xml'));
    criar(join(TIPO_DIR, PASTA_XML, 'NFS 2.xml'));
    expect(listarXmls(TIPO_DIR)).toHaveLength(2);
  });

  it('pasta inexistente devolve lista vazia', () => {
    expect(listarXmls(join(TMP, 'nao-existe'))).toEqual([]);
  });
});

describe('pdfDoXml', () => {
  it('mantém o PDF ao lado do XML no layout original', () => {
    expect(pdfDoXml(join(TIPO_DIR, 'NFS 1.xml'))).toBe(join(TIPO_DIR, 'NFS 1.pdf'));
  });

  it('coloca o PDF fora de "XML NFS" quando o XML foi recolhido', () => {
    expect(pdfDoXml(join(TIPO_DIR, PASTA_XML, 'NFS 1.xml'))).toBe(join(TIPO_DIR, 'NFS 1.pdf'));
  });
});

describe('listarPdfsIndividuais', () => {
  it('ignora o consolidado para não juntá-lo consigo mesmo', () => {
    criar(join(TIPO_DIR, 'NFS 1.pdf'));
    criar(join(TIPO_DIR, 'NFS 2.pdf'));
    criar(join(TIPO_DIR, nomeConsolidado('tomados')));
    const pdfs = listarPdfsIndividuais(TIPO_DIR);
    expect(pdfs).toHaveLength(2);
    expect(pdfs.some(p => p.includes('JUNTO'))).toBe(false);
  });
});

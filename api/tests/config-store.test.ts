import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  readConfig,
  upsertCompany,
  removeCompany,
  getCompany,
  updateLastNsu,
} from '../src/config-store.js';
import type { Company } from '../src/types.js';

const CONFIG_PATH = join(process.cwd(), 'config.json');

const mockCompany: Company = {
  cnpj: '12345678000100',
  nome: 'Empresa Teste',
  pfxPath: '/certs/teste.pfx',
  pfxPassword: 'senha',
  outputFolder: '/output',
  baseUrl: 'https://api.example.com/adn',
  ambiente: 'HOMOLOGACAO',
  lastNsu: 0,
  lastSync: null,
};

beforeEach(() => {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
});

afterEach(() => {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
});

describe('config-store', () => {
  it('cria config padrão se não existir', () => {
    const config = readConfig();
    expect(config.companies).toEqual([]);
  });

  it('upsert insere nova empresa', () => {
    upsertCompany(mockCompany);
    const found = getCompany('12345678000100');
    expect(found?.nome).toBe('Empresa Teste');
  });

  it('upsert atualiza empresa existente', () => {
    upsertCompany(mockCompany);
    upsertCompany({ ...mockCompany, nome: 'Nome Atualizado' });
    const config = readConfig();
    expect(config.companies).toHaveLength(1);
    expect(config.companies[0].nome).toBe('Nome Atualizado');
  });

  it('removeCompany remove pelo cnpj', () => {
    upsertCompany(mockCompany);
    removeCompany('12345678000100');
    expect(getCompany('12345678000100')).toBeUndefined();
  });

  it('updateLastNsu atualiza nsu e lastSync', () => {
    upsertCompany(mockCompany);
    updateLastNsu('12345678000100', 999);
    const company = getCompany('12345678000100');
    expect(company?.lastNsu).toBe(999);
    expect(company?.lastSync).not.toBeNull();
  });
});

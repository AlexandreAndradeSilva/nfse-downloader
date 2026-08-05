import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Config, Company } from './types.js';
import { fixMojibakePath } from './services/startup-migration.js';

/**
 * Caminho do config.json, resolvido a partir da localização deste módulo.
 *
 * Antes vinha de `process.cwd()`, o que fazia o arquivo depender de onde o
 * processo foi iniciado: subir o servidor de outra pasta criava um config
 * vazio e "sumia" com as empresas cadastradas.
 *
 * Em produção este módulo fica em <api>/dist/ e em desenvolvimento em
 * <api>/src/ — em ambos, o config está um nível acima.
 */
const CONFIG_PATH = process.env.NFSE_CONFIG_PATH
  ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'config.json');

const DEFAULT_CONFIG: Config = { companies: [] };

export function readConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    writeConfig(DEFAULT_CONFIG);
    return structuredClone(DEFAULT_CONFIG);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Config;
}

/**
 * Grava a configuração normalizando `outputFolder`.
 *
 * A interface reenvia a empresa inteira ao salvar; se o caminho tiver chegado
 * lá com U+FFFD (mojibake de acentos), sem esta normalização ele volta para o
 * disco e as notas passam a ser gravadas numa pasta fantasma. Corrigir só no
 * boot não basta: qualquer gravação seguinte reintroduzia o problema.
 */
export function writeConfig(config: Config): void {
  const normalizado: Config = {
    ...config,
    companies: config.companies.map(c => ({ ...c, outputFolder: fixMojibakePath(c.outputFolder) })),
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(normalizado, null, 2), 'utf-8');
}

export function getCompany(cnpj: string): Company | undefined {
  return readConfig().companies.find(c => c.cnpj === cnpj);
}

export function upsertCompany(company: Company): void {
  const config = readConfig();
  const idx = config.companies.findIndex(c => c.cnpj === company.cnpj);
  if (idx >= 0) config.companies[idx] = company;
  else config.companies.push(company);
  writeConfig(config);
}

export function removeCompany(cnpj: string): void {
  const config = readConfig();
  config.companies = config.companies.filter(c => c.cnpj !== cnpj);
  writeConfig(config);
}

export function updateLastNsu(cnpj: string, nsu: number): void {
  const config = readConfig();
  const company = config.companies.find(c => c.cnpj === cnpj);
  if (company) {
    company.lastNsu = nsu;
    company.lastSync = new Date().toISOString();
    writeConfig(config);
  }
}

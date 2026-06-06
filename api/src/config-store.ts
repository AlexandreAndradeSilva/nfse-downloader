import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Config, Company } from './types.js';

const CONFIG_PATH = join(process.cwd(), 'config.json');
const DEFAULT_CONFIG: Config = { companies: [] };

export function readConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    writeConfig(DEFAULT_CONFIG);
    return structuredClone(DEFAULT_CONFIG);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Config;
}

export function writeConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
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

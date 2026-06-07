import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

export interface FinancialTotals {
  count: number;
  totalServico: number;
  issRetido: number;
  pisCofins: number;
  liquido: number;
}

export interface CompanyStats {
  tomados: FinancialTotals;
  prestados: FinancialTotals;
}

const ZERO: FinancialTotals = { count: 0, totalServico: 0, issRetido: 0, pisCofins: 0, liquido: 0 };

export function readCompanyStats(outputFolder: string, nomeEmpresa: string): CompanyStats {
  const companyDir = join(outputFolder, nomeEmpresa);
  if (!existsSync(companyDir)) return { tomados: { ...ZERO }, prestados: { ...ZERO } };

  const tomados = { ...ZERO };
  const prestados = { ...ZERO };

  for (const period of safeDirRead(companyDir)) {
    const periodDir = join(companyDir, period);
    for (const tipo of ['tomados', 'prestados'] as const) {
      const tipoDir = join(periodDir, tipo);
      const target = tipo === 'tomados' ? tomados : prestados;
      for (const file of safeDirRead(tipoDir)) {
        if (!file.endsWith('.xml')) continue;
        try {
          const xml = readFileSync(join(tipoDir, file), 'utf-8');
          accumulateFromXml(xml, target);
        } catch { /* arquivo corrompido — pula */ }
      }
    }
  }

  return { tomados, prestados };
}

function safeDirRead(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir); } catch { return []; }
}

function accumulateFromXml(xml: string, target: FinancialTotals): void {
  const parsed = parser.parse(xml);
  const inf = parsed?.NFSe?.infNFSe ?? {};
  const dps = inf?.DPS?.infDPS ?? {};
  const valoresNfse = inf?.valores ?? {};
  const valoresDps = dps?.valores ?? {};
  const tribMun = valoresDps?.trib?.tribMun ?? {};
  const piscofins = valoresDps?.trib?.tribFed?.piscofins ?? {};
  const vServPrest = valoresDps?.vServPrest ?? {};

  const vServ = n(vServPrest.vServ ?? valoresNfse.vBC);
  const vLiq = n(valoresNfse.vLiq);
  const pAliq = n(tribMun.pAliq);
  const vBC = n(valoresNfse.vBC);
  const tpRet = String(tribMun.tpRetISSQN ?? '');
  const vPis = n(piscofins.vPis);
  const vCofins = n(piscofins.vCofins);

  // ISS Retido: tpRetISSQN=2 significa Retido pelo Tomador
  const iss = tpRet === '2' ? round(vBC * pAliq / 100) : 0;

  target.count += 1;
  target.totalServico += vServ;
  target.issRetido += iss;
  target.pisCofins += round(vPis + vCofins);
  target.liquido += vLiq || (vServ - iss - vPis - vCofins);
}

function n(v: unknown): number {
  const num = parseFloat(String(v ?? '0'));
  return isNaN(num) ? 0 : num;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

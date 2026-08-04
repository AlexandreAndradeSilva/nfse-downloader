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
  inss: number;
  irpf: number;
  csll: number;
  pisCofins: number;
  liquido: number;
}

export interface CompanyStats {
  tomados: FinancialTotals;
  prestados: FinancialTotals;
  eventos: number;
}

const ZERO: FinancialTotals = { count: 0, totalServico: 0, issRetido: 0, inss: 0, irpf: 0, csll: 0, pisCofins: 0, liquido: 0 };

export function readCompanyStats(outputFolder: string, nomeEmpresa: string): CompanyStats {
  const companyDir = join(outputFolder, nomeEmpresa);
  if (!existsSync(companyDir)) return { tomados: { ...ZERO }, prestados: { ...ZERO }, eventos: 0 };

  const tomados = { ...ZERO };
  const prestados = { ...ZERO };
  let eventos = 0;

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

  // Conta eventos na pasta dedicada: NomeEmpresa/eventos/{canceladas,substituicoes,outros}
  const eventosDir = join(companyDir, 'eventos');
  for (const sub of safeDirRead(eventosDir)) {
    eventos += safeDirRead(join(eventosDir, sub)).filter(f => f.endsWith('.xml')).length;
  }

  return { tomados, prestados, eventos };
}

/**
 * Retorna o conjunto de chaves de NFS-e que foram canceladas.
 * Varre TODAS as subpastas de NomeEmpresa/eventos/ e detecta cancelamentos
 * pelo conteúdo XML (tag <chNFSe> + indicador de cancelamento), sem depender
 * do nome da subpasta — garante compatibilidade com eventos mal-classificados.
 */
export function buildCancelledIndex(outputFolder: string, nomeEmpresa: string): Set<string> {
  const eventosDir = join(outputFolder, nomeEmpresa, 'eventos');
  const chaves = new Set<string>();

  for (const sub of safeDirRead(eventosDir)) {
    const subDir = join(eventosDir, sub);
    for (const file of safeDirRead(subDir)) {
      if (!file.endsWith('.xml')) continue;
      try {
        const xml = readFileSync(join(subDir, file), 'utf-8');
        // Só processa se for evento de cancelamento
        const isCanc = xml.includes('<e101101>') ||
          xml.includes('Cancelamento de NFS-e') ||
          xml.includes('cancelamento de NFS-e') ||
          (xml.includes('<eCanc>') || xml.includes('<eCanc '));
        if (!isCanc) continue;

        const chNFSe = xml.match(/<chNFSe[^>]*>(\d+)<\/chNFSe>/)?.[1]
          ?? xml.match(/<chNFSeAnulada[^>]*>(\d+)<\/chNFSeAnulada>/)?.[1];
        if (chNFSe) chaves.add(chNFSe);
      } catch { /* arquivo corrompido — pula */ }
    }
  }

  return chaves;
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
  const tribFed = valoresDps?.trib?.tribFed ?? {};
  const piscofins = tribFed?.piscofins ?? {};
  const vServPrest = valoresDps?.vServPrest ?? {};

  const vServ = n(vServPrest.vServ ?? valoresNfse.vBC);
  const vLiq = n(valoresNfse.vLiq);
  // pAliq pode estar em tribMun ou no nível da NFS-e (pAliqAplic)
  const pAliq = n(tribMun.pAliq || valoresNfse.pAliqAplic);
  const vBC = n(valoresNfse.vBC);
  const tpRet = String(tribMun.tpRetISSQN ?? '');
  const vPis = n(piscofins.vPis);
  const vCofins = n(piscofins.vCofins);
  const vInss = n(tribFed.vRetCP);
  // vRetIRRF é o nome correto no schema NFS-e nacional; vIRRF como fallback
  const vIrpf = n(tribFed.vRetIRRF || tribFed.vIRRF);
  const vCsll = n(tribFed.vRetCSLL);

  // vISSQN já vem calculado na NFS-e; usa cálculo como fallback
  const issQnNfse = n(valoresNfse.vISSQN);
  const iss = tpRet === '2'
    ? (issQnNfse || round(vBC * pAliq / 100))
    : 0;

  target.count += 1;
  target.totalServico += vServ;
  target.issRetido += iss;
  target.inss += round(vInss);
  target.irpf += round(vIrpf);
  target.csll += round(vCsll);
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

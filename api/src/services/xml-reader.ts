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

export interface EventIndex {
  canceladas: Set<string>;
  substituidas: Set<string>;
}

/**
 * Indexa as chaves de NFS-e afetadas por eventos, separadas por tipo.
 * Varre TODAS as subpastas de NomeEmpresa/eventos/ e classifica pelo conteúdo do
 * XML, sem depender do nome da subpasta — garante compatibilidade com eventos
 * mal-classificados por versões anteriores.
 */
export function buildEventIndex(outputFolder: string, nomeEmpresa: string): EventIndex {
  const eventosDir = join(outputFolder, nomeEmpresa, 'eventos');
  const idx: EventIndex = { canceladas: new Set(), substituidas: new Set() };

  for (const sub of safeDirRead(eventosDir)) {
    const subDir = join(eventosDir, sub);
    for (const file of safeDirRead(subDir)) {
      if (!file.endsWith('.xml')) continue;
      try {
        const xml = readFileSync(join(subDir, file), 'utf-8');

        const chNFSe = xml.match(/<chNFSe[^>]*>(\d+)<\/chNFSe>/)?.[1]
          ?? xml.match(/<chNFSeAnulada[^>]*>(\d+)<\/chNFSeAnulada>/)?.[1]
          ?? xml.match(/<chSubstda[^>]*>(\d+)<\/chSubstda>/)?.[1];
        if (!chNFSe) continue;

        const isCanc = xml.includes('<e101101>') ||
          xml.includes('Cancelamento de NFS-e') ||
          xml.includes('cancelamento de NFS-e') ||
          xml.includes('<eCanc>') || xml.includes('<eCanc ');
        const isSubst = xml.includes('<e110115>') ||
          xml.includes('<eSubst>') || xml.includes('<eSubst ') ||
          xml.includes('Substitui');

        if (isCanc) idx.canceladas.add(chNFSe);
        else if (isSubst) idx.substituidas.add(chNFSe);
      } catch { /* arquivo corrompido — pula */ }
    }
  }

  // Cancelamento tem precedência sobre substituição: uma nota cancelada permanece
  // cancelada mesmo que também tenha sido alvo de um evento de substituição, e a
  // ordem de leitura dos arquivos não pode decidir a situação final.
  for (const chave of idx.canceladas) idx.substituidas.delete(chave);

  return idx;
}

/** @deprecated Use `buildEventIndex`, que também identifica notas substituídas. */
export function buildCancelledIndex(outputFolder: string, nomeEmpresa: string): Set<string> {
  return buildEventIndex(outputFolder, nomeEmpresa).canceladas;
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

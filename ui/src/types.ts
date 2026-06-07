export interface Company {
  cnpj: string;
  nome: string;
  pfxPath: string;
  pfxPassword: string;
  outputFolder: string;
  baseUrl: string;
  ambiente: 'PRODUCAO' | 'HOMOLOGACAO';
  lastNsu: number;
  lastSync: string | null;
}

export interface SyncProgress {
  type: 'progress' | 'done' | 'error';
  message: string;
  prestados?: number;
  tomados?: number;
  errors?: number;
  lastNsu?: number;
}

export interface FinancialTotals {
  count: number;
  totalServico: number;
  issRetido: number;
  pisCofins: number;
  liquido: number;
}

export interface StatsResult {
  tomados: FinancialTotals;
  prestados: FinancialTotals;
}

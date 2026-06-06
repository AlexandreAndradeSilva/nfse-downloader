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

export interface Config {
  companies: Company[];
}

export interface AdnNsuItem {
  // ATENÇÃO: nomes de campos a confirmar contra resposta real da API ADN
  NsuDFe: string;
  XmlBase64GZip: string;
}

export interface AdnDistribuicaoResponse {
  StatusProcessamento: 'REJEICAO' | 'NENHUM_DOCUMENTO_LOCALIZADO' | 'DOCUMENTOS_LOCALIZADOS';
  LoteDFe: AdnNsuItem[] | null;
  Alertas: Array<{ Codigo: string | null; Descricao: string | null }> | null;
  Erros: Array<{ Codigo: string | null; Descricao: string | null }> | null;
}

export interface SyncProgress {
  type: 'progress' | 'done' | 'error';
  message: string;
  nsu?: number;
  prestados?: number;
  tomados?: number;
  errors?: number;
}

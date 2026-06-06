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

// URLs confirmadas em 2026-06-06 via debug contra API real:
// Produção:          https://adn.nfse.gov.br/contribuintes
// Produção Restrita: https://adn.producaorestrita.nfse.gov.br/contribuintes
// Endpoint: GET {baseUrl}/DFe/{NSU}?cnpjConsulta={cnpj}&lote=true
export interface AdnNsuItem {
  NSU: number;
  ChaveAcesso: string;
  TipoDocumento: string;
  ArquivoXml: string;
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

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

// URLs confirmadas em 2026-06-06 via gov.br/nfse:
// Produção:          https://adn.nfse.gov.br/adn
// Produção Restrita: https://adn.producaorestrita.nfse.gov.br/adn
// Endpoint: GET {baseUrl}/DFe/{NSU}?cnpjConsulta={cnpj}&lote=true
// ATENÇÃO: nomes dos campos NsuDFe e XmlBase64GZip a confirmar contra resposta real
export interface AdnNsuItem {
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

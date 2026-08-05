import type { Company, SyncProgress, StatsResult } from '../types';
import type { SyncOptions } from '../components/SyncModal';

export type { Company };
export type { SyncOptions };

import { API_BASE as API } from './api-base';

export interface CertInfo {
  thumbprint: string;
  cnpj: string;
  nome: string;
  validoAte: string;
  pfxPath?: string;
}

export async function scanCertificates(): Promise<CertInfo[]> {
  const res = await fetch(`${API}/api/certificates/scan`);
  if (!res.ok) throw new Error('Erro ao escanear certificados');
  return res.json();
}

export async function browseFolder(): Promise<string | null> {
  const res = await fetch(`${API}/api/certificates/browse-folder`);
  if (res.status === 204) return null;
  if (!res.ok) throw new Error('Erro ao abrir seletor de pasta');
  const data = await res.json() as { path: string };
  return data.path;
}

export async function listCompanies(): Promise<Company[]> {
  const res = await fetch(`${API}/api/companies`);
  if (!res.ok) throw new Error('Erro ao listar empresas');
  return res.json();
}

export async function createCompany(data: Omit<Company, 'lastSync'>): Promise<Company> {
  const res = await fetch(`${API}/api/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return res.json();
}

export async function updateCompany(cnpj: string, data: Partial<Company>): Promise<Company> {
  const res = await fetch(`${API}/api/companies/${cnpj}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar empresa');
  return res.json();
}

export async function deleteCompany(cnpj: string): Promise<void> {
  await fetch(`${API}/api/companies/${cnpj}`, { method: 'DELETE' });
}

export type Situacao = 'ativa' | 'cancelada' | 'substituida';

export interface NoteItem {
  numeroNFSe: string;
  cnpj: string;
  nome: string;
  dataEmissao: string;
  valorServico: number;
  periodo: string;
  cancelada?: boolean;
  situacao?: Situacao;
}

export interface GeneratePdfsOptions {
  dataInicio: string;
  dataFim: string;
  tipo: 'todos' | 'prestados' | 'tomados';
  incluirEncerradas: boolean;   // canceladas e substituídas, com carimbo
}

/** Dispara a geração de DANFSe no backend e acompanha o progresso por SSE. */
export function startGeneratePdfs(
  cnpj: string,
  opts: GeneratePdfsOptions,
  onEvent: (event: SyncProgress) => void,
  onClose: () => void,
): EventSource {
  const params = new URLSearchParams();
  if (opts.dataInicio) params.set('dataInicio', opts.dataInicio);
  if (opts.dataFim) params.set('dataFim', opts.dataFim);
  params.set('tipo', opts.tipo);
  params.set('incluirEncerradas', String(opts.incluirEncerradas));
  const es = new EventSource(`${API}/api/notes/${cnpj}/gerar-pdfs?${params.toString()}`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data as string) as SyncProgress;
    onEvent(data);
    if (data.type === 'done' || data.type === 'error') { es.close(); onClose(); }
  };
  es.onerror = () => { es.close(); onClose(); };
  return es;
}

export interface NotesPage {
  items: NoteItem[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export async function fetchNotes(
  cnpj: string,
  tipo: 'tomados' | 'prestados',
  page = 1
): Promise<NotesPage> {
  const res = await fetch(`${API}/api/notes/${cnpj}?tipo=${tipo}&page=${page}&limit=10`);
  if (!res.ok) throw new Error('Erro ao buscar notas');
  return res.json();
}

export async function fetchStats(cnpj: string): Promise<StatsResult> {
  const res = await fetch(`${API}/api/stats/${cnpj}`);
  if (!res.ok) throw new Error('Erro ao buscar estatísticas');
  return res.json();
}

export function startSync(
  cnpj: string,
  opts: SyncOptions,
  onEvent: (event: SyncProgress) => void,
  onClose: () => void
): EventSource {
  const params = new URLSearchParams();
  if (opts.dataInicio) params.set('dataInicio', opts.dataInicio);
  if (opts.dataFim) params.set('dataFim', opts.dataFim);
  const tipos = [opts.prestados && 'prestados', opts.tomados && 'tomados'].filter(Boolean).join(',');
  params.set('tipos', tipos || 'prestados,tomados');
  const qs = params.toString();
  const es = new EventSource(`${API}/api/sync/${cnpj}${qs ? '?' + qs : ''}`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data as string) as SyncProgress;
    onEvent(data);
    if (data.type === 'done' || data.type === 'error') {
      es.close();
      onClose();
    }
  };
  es.onerror = () => { es.close(); onClose(); };
  return es;
}

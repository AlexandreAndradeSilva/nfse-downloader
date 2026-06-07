import type { Company, SyncProgress, StatsResult } from '../types';
import type { SyncOptions } from '../components/SyncModal';

export type { Company };
export type { SyncOptions };

export interface CertInfo {
  thumbprint: string;
  cnpj: string;
  nome: string;
  validoAte: string;
  pfxPath?: string;
}

export async function scanCertificates(): Promise<CertInfo[]> {
  const res = await fetch('/api/certificates/scan');
  if (!res.ok) throw new Error('Erro ao escanear certificados');
  return res.json();
}

export async function browseFolder(): Promise<string | null> {
  const res = await fetch('/api/certificates/browse-folder');
  if (res.status === 204) return null;
  if (!res.ok) throw new Error('Erro ao abrir seletor de pasta');
  const data = await res.json() as { path: string };
  return data.path;
}

export async function listCompanies(): Promise<Company[]> {
  const res = await fetch('/api/companies');
  if (!res.ok) throw new Error('Erro ao listar empresas');
  return res.json();
}

export async function createCompany(data: Omit<Company, 'lastSync'>): Promise<Company> {
  const res = await fetch('/api/companies', {
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
  const res = await fetch(`/api/companies/${cnpj}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar empresa');
  return res.json();
}

export async function deleteCompany(cnpj: string): Promise<void> {
  await fetch(`/api/companies/${cnpj}`, { method: 'DELETE' });
}

export interface NoteItem {
  numeroNFSe: string;
  cnpj: string;
  nome: string;
  dataEmissao: string;
  valorServico: number;
  periodo: string;
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
  const res = await fetch(`/api/notes/${cnpj}?tipo=${tipo}&page=${page}&limit=10`);
  if (!res.ok) throw new Error('Erro ao buscar notas');
  return res.json();
}

export async function fetchStats(cnpj: string): Promise<StatsResult> {
  const res = await fetch(`/api/stats/${cnpj}`);
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
  if (opts.gerarPdf) params.set('gerarPdf', 'true');
  const qs = params.toString();
  const es = new EventSource(`/api/sync/${cnpj}${qs ? '?' + qs : ''}`);
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

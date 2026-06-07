import { useState, useEffect, useCallback, useRef } from 'react';
import { CompanyCard } from '../components/CompanyCard';
import { AddCompanyModal } from '../components/AddCompanyModal';
import { SyncLogPanel, type LogEntry } from '../components/SyncLogPanel';
import { SyncModal, type SyncOptions } from '../components/SyncModal';
import { CertificateSyncModal, type CertSyncParams } from '../components/CertificateSyncModal';
import { listCompanies, createCompany, updateCompany, deleteCompany, startSync } from '../lib/api';
import type { Company } from '../types';

const BASE_URL = 'https://adn.nfse.gov.br/contribuintes';

export function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [syncModalCnpj, setSyncModalCnpj] = useState<string | null>(null);
  const logIdRef = useRef(0);

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'progress') => {
    logIdRef.current += 1;
    const id = logIdRef.current;
    setLogs(prev => [...prev.slice(-200), { id, text, type }]);
  }, []);

  const load = useCallback(async () => {
    const data = await listCompanies();
    setCompanies(data);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const runSync = (cnpj: string, opts: SyncOptions) => {
    setSyncing(prev => ({ ...prev, [cnpj]: true }));
    setLogs([]);
    startSync(
      cnpj,
      opts,
      (event) => addLog(event.message, event.type),
      () => {
        setSyncing(prev => ({ ...prev, [cnpj]: false }));
        load();
      }
    );
  };

  const handleSyncStart = (opts: SyncOptions) => {
    const cnpj = syncModalCnpj!;
    setSyncModalCnpj(null);
    runSync(cnpj, opts);
  };

  // Fluxo rápido via seletor de certificado Windows
  const handleCertSync = async (params: CertSyncParams) => {
    setCertModalOpen(false);
    try {
      const existing = companies.find(c => c.cnpj === params.cnpj);
      const companyData: Omit<Company, 'lastSync'> = {
        cnpj: params.cnpj,
        nome: params.nome,
        pfxPath: params.tempPfxPath,      // arquivo temp exportado pelo Windows
        pfxPassword: params.tempPassword,  // senha gerada automaticamente
        outputFolder: params.outputFolder,
        baseUrl: BASE_URL,
        ambiente: 'PRODUCAO',
        lastNsu: existing?.lastNsu ?? 0,
      };
      if (existing) {
        await updateCompany(params.cnpj, companyData);
      } else {
        await createCompany(companyData);
      }
      await load();
    } catch (e) {
      addLog(`[ERRO] Não foi possível salvar a empresa: ${(e as Error).message}`, 'error');
      return;
    }
    runSync(params.cnpj, {
      dataInicio: params.dataInicio,
      dataFim: params.dataFim,
      gerarPdf: params.gerarPdf,
    });
  };

  const handleSave = async (data: Omit<Company, 'lastSync'>) => {
    if (editingCompany) {
      await updateCompany(data.cnpj, data);
    } else {
      await createCompany(data);
    }
    setAddModalOpen(false);
    setEditingCompany(null);
    await load();
  };

  const handleDelete = async (cnpj: string) => {
    if (!confirm('Remover esta empresa?')) return;
    await deleteCompany(cnpj);
    await load();
  };

  const syncingCompany = companies.find(c => c.cnpj === syncModalCnpj);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">NFS-e Downloader</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setCertModalOpen(true)}
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            🔍 Buscar Notas
          </button>
          <button
            onClick={() => { setEditingCompany(null); setAddModalOpen(true); }}
            className="px-4 py-2 rounded border border-gray-300 text-sm font-medium hover:bg-gray-50"
          >
            + Cadastro manual
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {companies.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">Clique em <strong>Buscar Notas</strong> para começar.</p>
            <p className="text-sm">O sistema detecta automaticamente os certificados instalados no Windows.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map(c => (
              <CompanyCard
                key={c.cnpj}
                company={c}
                syncing={!!syncing[c.cnpj]}
                onSync={(cnpj) => setSyncModalCnpj(cnpj)}
                onEdit={(company) => { setEditingCompany(company); setAddModalOpen(true); }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-2">Log de Sincronização</h2>
          <SyncLogPanel logs={logs} />
        </div>
      </main>

      <CertificateSyncModal
        open={certModalOpen}
        onClose={() => setCertModalOpen(false)}
        onSync={handleCertSync}
      />

      <AddCompanyModal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setEditingCompany(null); }}
        onSave={handleSave}
        initial={editingCompany}
      />

      <SyncModal
        open={syncModalCnpj !== null}
        companyName={syncingCompany?.nome ?? ''}
        onClose={() => setSyncModalCnpj(null)}
        onSync={handleSyncStart}
      />
    </div>
  );
}

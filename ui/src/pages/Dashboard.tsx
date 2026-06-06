import { useState, useEffect, useCallback, useRef } from 'react';
import { CompanyCard } from '../components/CompanyCard';
import { AddCompanyModal } from '../components/AddCompanyModal';
import { SyncLogPanel, type LogEntry } from '../components/SyncLogPanel';
import { listCompanies, createCompany, updateCompany, deleteCompany, startSync } from '../lib/api';
import type { Company } from '../types';

export function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
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

  const handleSync = (cnpj: string) => {
    setSyncing(prev => ({ ...prev, [cnpj]: true }));
    setLogs([]);
    startSync(
      cnpj,
      (event) => addLog(event.message, event.type),
      () => {
        setSyncing(prev => ({ ...prev, [cnpj]: false }));
        load();
      }
    );
  };

  const handleSave = async (data: Omit<Company, 'lastSync'>) => {
    if (editingCompany) {
      await updateCompany(data.cnpj, data);
    } else {
      await createCompany(data);
    }
    setModalOpen(false);
    setEditingCompany(null);
    await load();
  };

  const handleDelete = async (cnpj: string) => {
    if (!confirm('Remover esta empresa?')) return;
    await deleteCompany(cnpj);
    await load();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">NFS-e Downloader</h1>
        <button
          onClick={() => { setEditingCompany(null); setModalOpen(true); }}
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          + Empresa
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        {companies.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            Nenhuma empresa cadastrada. Clique em "+ Empresa" para começar.
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map(c => (
              <CompanyCard
                key={c.cnpj}
                company={c}
                syncing={!!syncing[c.cnpj]}
                onSync={handleSync}
                onEdit={(company) => { setEditingCompany(company); setModalOpen(true); }}
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

      <AddCompanyModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingCompany(null); }}
        onSave={handleSave}
        initial={editingCompany}
      />
    </div>
  );
}

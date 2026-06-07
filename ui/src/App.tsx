import { useState, useEffect, useCallback } from 'react';
import { TopNav } from './components/TopNav';
import { Dashboard } from './pages/Dashboard';
import { Empresas } from './pages/Empresas';
import { AddCompanyModal } from './components/AddCompanyModal';
import { SyncModal, type SyncOptions } from './components/SyncModal';
import { CertificateSyncModal, type CertSyncParams } from './components/CertificateSyncModal';
import { listCompanies, createCompany, updateCompany, startSync } from './lib/api';
import type { Company } from './types';
import './index.css';

const BASE_URL = 'https://adn.nfse.gov.br/contribuintes';

type Page = 'dashboard' | 'empresas';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [syncModalCnpj, setSyncModalCnpj] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  // CNPJ da empresa que está sendo (ou foi) sincronizada — controla qual empresa o Dashboard exibe
  const [activeCnpj, setActiveCnpj] = useState<string | null>(null);
  // Incrementado após cada sync para forçar recarregamento das stats
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const data = await listCompanies();
    setCompanies(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSync = useCallback((cnpj: string, opts: SyncOptions) => {
    setSyncing(prev => ({ ...prev, [cnpj]: true }));
    setActiveCnpj(cnpj);        // Dashboard muda imediatamente para esta empresa
    setPage('dashboard');        // Volta para o dashboard ao iniciar sync
    startSync(
      cnpj,
      opts,
      () => {},
      () => {
        setSyncing(prev => ({ ...prev, [cnpj]: false }));
        setStatsRefreshKey(k => k + 1); // força recarregamento das stats
        load();
      }
    );
  }, [load]);

  const handleSyncStart = (opts: SyncOptions) => {
    const cnpj = syncModalCnpj!;
    setSyncModalCnpj(null);
    runSync(cnpj, opts);
  };

  const handleCertSync = async (params: CertSyncParams) => {
    setCertModalOpen(false);
    try {
      const existing = companies.find(c => c.cnpj === params.cnpj);
      const data: Omit<Company, 'lastSync'> = {
        cnpj: params.cnpj,
        nome: params.nome,
        pfxPath: params.tempPfxPath,
        pfxPassword: params.tempPassword,
        outputFolder: params.outputFolder,
        baseUrl: BASE_URL,
        ambiente: 'PRODUCAO',
        lastNsu: existing?.lastNsu ?? 0,
      };
      if (existing) await updateCompany(params.cnpj, data);
      else await createCompany(data);
      await load();
    } catch { return; }
    runSync(params.cnpj, {
      dataInicio: params.dataInicio,
      dataFim: params.dataFim,
      gerarPdf: params.gerarPdf,
    });
  };

  const handleSave = async (data: Omit<Company, 'lastSync'>) => {
    if (editingCompany) await updateCompany(data.cnpj, data);
    else await createCompany(data);
    setAddModalOpen(false);
    setEditingCompany(null);
    await load();
  };

  const syncingCompany = companies.find(c => c.cnpj === syncModalCnpj);

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <TopNav
        page={page}
        onPageChange={setPage}
        onBuscarNotas={() => setCertModalOpen(true)}
      />

      {/* Ambas as páginas ficam montadas — display:none evita o reset de estado ao trocar de aba */}
      <div style={{ display: page === 'dashboard' ? 'contents' : 'none' }}>
        <Dashboard
          companies={companies}
          activeCnpj={activeCnpj}
          refreshKey={statsRefreshKey}
          syncing={syncing}
        />
      </div>
      <div style={{ display: page === 'empresas' ? 'contents' : 'none' }}>
        <Empresas
          companies={companies}
          syncing={syncing}
          onSync={cnpj => setSyncModalCnpj(cnpj)}
          onRefresh={load}
          onAddManual={() => { setEditingCompany(null); setAddModalOpen(true); }}
        />
      </div>

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

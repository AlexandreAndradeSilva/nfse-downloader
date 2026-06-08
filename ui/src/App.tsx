import { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import { LoginScreen } from './components/LoginScreen';
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

// Componente principal do app — só renderizado após login
function AppContent() {
  const [page, setPage] = useState<Page>('dashboard');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [syncModalCnpj, setSyncModalCnpj] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [activeCnpj, setActiveCnpj] = useState<string | null>(null);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);

  const load = useCallback(async () => {
    const data = await listCompanies();
    setCompanies(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSync = useCallback((cnpj: string, opts: SyncOptions) => {
    setSyncing(prev => ({ ...prev, [cnpj]: true }));
    setActiveCnpj(cnpj);
    setPage('dashboard');
    startSync(cnpj, opts, () => {}, () => {
      setSyncing(prev => ({ ...prev, [cnpj]: false }));
      setStatsRefreshKey(k => k + 1);
      load();
    });
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
        cnpj: params.cnpj, nome: params.nome,
        pfxPath: params.tempPfxPath, pfxPassword: params.tempPassword,
        outputFolder: params.outputFolder, baseUrl: BASE_URL,
        ambiente: 'PRODUCAO', lastNsu: existing?.lastNsu ?? 0,
      };
      if (existing) await updateCompany(params.cnpj, data);
      else await createCompany(data);
      await load();
    } catch { return; }
    runSync(params.cnpj, { dataInicio: params.dataInicio, dataFim: params.dataFim, gerarPdf: params.gerarPdf });
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
      <TopNav page={page} onPageChange={setPage} onBuscarNotas={() => setCertModalOpen(true)} />

      <div style={{ display: page === 'dashboard' ? 'contents' : 'none' }}>
        <Dashboard companies={companies} activeCnpj={activeCnpj} refreshKey={statsRefreshKey} syncing={syncing} />
      </div>
      <div style={{ display: page === 'empresas' ? 'contents' : 'none' }}>
        <Empresas
          companies={companies} syncing={syncing}
          onSync={cnpj => setSyncModalCnpj(cnpj)}
          onRefresh={load}
          onAddManual={() => { setEditingCompany(null); setAddModalOpen(true); }}
        />
      </div>

      <CertificateSyncModal open={certModalOpen} onClose={() => setCertModalOpen(false)} onSync={handleCertSync} />
      <AddCompanyModal open={addModalOpen} onClose={() => { setAddModalOpen(false); setEditingCompany(null); }} onSave={handleSave} initial={editingCompany} />
      <SyncModal open={syncModalCnpj !== null} companyName={syncingCompany?.nome ?? ''} onClose={() => setSyncModalCnpj(null)} onSync={handleSyncStart} />

      <footer style={{ textAlign:'center', padding:'16px 24px', fontSize:12, color:'rgba(255,255,255,.25)', borderTop:'1px solid rgba(255,255,255,.06)', background:'rgba(0,0,0,.2)', marginTop:'auto' }}>
        ©2026 NFS-e Downloader — Feito por Alexandre V. A. Silva
      </footer>
    </div>
  );
}

// Wrapper de autenticação — todos os hooks antes de qualquer return condicional
export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (user === undefined) return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1e1b4b 0%,#0f0e1a 50%)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:40, height:40, border:'3px solid rgba(99,102,241,.3)', borderTopColor:'#6366f1', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
    </div>
  );

  if (user === null) return <LoginScreen />;

  return <AppContent />;
}

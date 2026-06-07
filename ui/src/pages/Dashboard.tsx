import { useState, useEffect, useCallback } from 'react';
import { fetchStats } from '../lib/api';
import type { Company, StatsResult } from '../types';

interface Props {
  companies: Company[];
  activeCnpj?: string | null;
  refreshKey?: number;
  syncing?: Record<string, boolean>;
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleDateString('pt-BR') + ' ' +
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtCnpj(v: string) {
  return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function Dashboard({ companies, activeCnpj, refreshKey, syncing }: Props) {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Empresa ativa: prioridade para a que está sendo sincronizada,
  // senão a mais recentemente sincronizada
  const activeCompany: Company | null = companies.length > 0
    ? (companies.find(c => c.cnpj === activeCnpj) ??
       [...companies].sort((a, b) => (b.lastSync ?? '').localeCompare(a.lastSync ?? ''))[0])
    : null;

  const downloadExcel = (tipo: 'tomados' | 'prestados') => {
    if (!activeCompany) return;
    const url = `/api/reports/${activeCompany.cnpj}/excel?tipo=${tipo}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.click();
  };

  const loadStats = useCallback(async () => {
    if (!activeCompany) { setStats(null); return; }
    setStatsLoading(true);
    try {
      const s = await fetchStats(activeCompany.cnpj);
      setStats(s);
    } catch { setStats(null); }
    finally { setStatsLoading(false); }
  }, [activeCompany?.cnpj, refreshKey]); // refreshKey força reload após sync

  useEffect(() => { loadStats(); }, [loadStats]);

  const breakdown = (tipo: 'tomados' | 'prestados') => [
    { k: 'ISS Retido',    v: stats?.[tipo].issRetido ?? 0 },
    { k: 'PIS/COFINS',    v: stats?.[tipo].pisCofins ?? 0 },
    { k: 'Valor Líquido', v: stats?.[tipo].liquido ?? 0 },
  ];

  return (
    <div style={{
      padding: '32px 28px', flex: 1,
      background: 'linear-gradient(160deg,#1e1b4b 0%,#0f0e1a 40%)',
      minHeight: 'calc(100vh - 56px)',
    }}>
      {companies.length === 0 ? (
        <div style={{ textAlign:'center', padding:'100px 24px', color:'rgba(255,255,255,.3)' }}>
          <div style={{ fontSize:56, marginBottom:20 }}>📄</div>
          <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8, color:'rgba(255,255,255,.6)' }}>
            Nenhuma empresa cadastrada
          </h2>
          <p style={{ fontSize:14 }}>Clique em <strong style={{color:'#a5b4fc'}}>Buscar Notas</strong> para começar.</p>
        </div>
      ) : (
        <>
          {/* Linha 1: Empresa + Contadores */}
          <div style={{ display:'grid', gridTemplateColumns:'1.7fr 1fr 1fr', gap:18, marginBottom:18 }}>

            {/* Card Empresa */}
            <div style={{
              background:'rgba(99,102,241,.1)', border:'1px solid rgba(99,102,241,.25)',
              borderRadius:16, padding:24, display:'flex', flexDirection:'column', gap:8,
              position:'relative', overflow:'hidden',
            }}>
              <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, background:'radial-gradient(circle,rgba(99,102,241,.2),transparent 70%)', borderRadius:'50%' }} />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:10, letterSpacing:'1.5px', color:'rgba(255,255,255,.35)', textTransform:'uppercase' }}>Empresa Ativa</div>
                {activeCompany && syncing?.[activeCompany.cnpj] && (
                  <div style={{
                    display:'flex', alignItems:'center', gap:5,
                    background:'rgba(251,191,36,.15)', border:'1px solid rgba(251,191,36,.3)',
                    borderRadius:20, padding:'2px 10px', fontSize:10, color:'#fbbf24',
                  }}>
                    <span style={{ animation:'spin 1s linear infinite', display:'inline-block' }}>⟳</span>
                    Sincronizando...
                  </div>
                )}
              </div>
              <div style={{ fontSize:16, fontWeight:700, color:'white', lineHeight:1.3 }}>{activeCompany?.nome}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.4)' }}>
                {activeCompany ? fmtCnpj(activeCompany.cnpj) : ''} · Produção
              </div>
              <div style={{ display:'flex', gap:16, marginTop:6 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>
                  Último sync: <strong style={{color:'rgba(255,255,255,.75)',fontWeight:600}}>{fmtDate(activeCompany?.lastSync ?? null)}</strong>
                </div>
              </div>
              <div style={{
                display:'inline-flex', alignItems:'center', gap:5,
                background:'rgba(99,102,241,.2)', border:'1px solid rgba(99,102,241,.3)',
                borderRadius:20, padding:'4px 12px', fontSize:11, color:'#a5b4fc',
                width:'fit-content', marginTop:4,
              }}>
                📌 NSU atual: {activeCompany?.lastNsu ?? 0}
              </div>
            </div>

            {/* Card Tomadas */}
            <div style={{
              background:'rgba(99,102,241,.12)', border:'1px solid rgba(99,102,241,.2)',
              borderRadius:16, padding:24, display:'flex', flexDirection:'column', justifyContent:'space-between',
              position:'relative', overflow:'hidden',
            }}>
              <div style={{ position:'absolute', bottom:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,.15),transparent 70%)' }} />
              <div style={{ fontSize:10, letterSpacing:'1.5px', color:'rgba(255,255,255,.35)', textTransform:'uppercase' }}>Notas Tomadas</div>
              <div style={{ fontSize:56, fontWeight:900, color:'#a5b4fc', lineHeight:1, margin:'10px 0 4px' }}>
                {stats?.tomados.count ?? '—'}
              </div>
              <div>
                <div style={{ height:3, borderRadius:2, background:'linear-gradient(90deg,#6366f1,transparent)', marginTop:8 }} />
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:6 }}>Serviços recebidos</div>
              </div>
            </div>

            {/* Card Prestadas */}
            <div style={{
              background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.18)',
              borderRadius:16, padding:24, display:'flex', flexDirection:'column', justifyContent:'space-between',
              position:'relative', overflow:'hidden',
            }}>
              <div style={{ position:'absolute', bottom:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'radial-gradient(circle,rgba(34,197,94,.12),transparent 70%)' }} />
              <div style={{ fontSize:10, letterSpacing:'1.5px', color:'rgba(255,255,255,.35)', textTransform:'uppercase' }}>Notas Prestadas</div>
              <div style={{ fontSize:56, fontWeight:900, color:'#86efac', lineHeight:1, margin:'10px 0 4px' }}>
                {stats?.prestados.count ?? '—'}
              </div>
              <div>
                <div style={{ height:3, borderRadius:2, background:'linear-gradient(90deg,#22c55e,transparent)', marginTop:8 }} />
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:6 }}>Serviços emitidos</div>
              </div>
            </div>
          </div>

          {/* Linha 2: Valores financeiros com botão Excel */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>

            {/* Coluna Tomados */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{
                background:'linear-gradient(135deg,rgba(99,102,241,.18),rgba(139,92,246,.12))',
                border:'1px solid rgba(99,102,241,.3)',
                borderRadius:16, padding:'26px 28px',
                display:'flex', alignItems:'center', gap:20,
                position:'relative', overflow:'hidden',
              }}>
                <div style={{ position:'absolute', right:-40, top:-40, width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,.12),transparent 70%)' }} />
                <div style={{ width:52, height:52, borderRadius:14, background:'rgba(99,102,241,.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>📥</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, letterSpacing:'1.2px', color:'rgba(255,255,255,.4)', textTransform:'uppercase', marginBottom:6 }}>Total Serviços Tomados</div>
                  <div style={{ fontSize:32, fontWeight:900, color:'#c4b5fd', lineHeight:1 }}>
                    {statsLoading ? '...' : fmtBRL(stats?.tomados.totalServico ?? 0)}
                  </div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:5 }}>
                    {stats?.tomados.count ?? 0} notas · todos os períodos
                  </div>
                </div>
                <div style={{ width:1, height:48, borderRadius:1, background:'rgba(99,102,241,.3)', flexShrink:0 }} />
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {breakdown('tomados').map(row => (
                    <div key={row.k} style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'center' }}>
                      <span style={{ fontSize:10, color:'rgba(255,255,255,.35)', whiteSpace:'nowrap' }}>{row.k}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.6)' }}>{fmtBRL(row.v)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => downloadExcel('tomados')}
                style={{
                  background: 'rgba(99,102,241,.15)', border: '1px solid rgba(99,102,241,.3)',
                  color: '#a5b4fc', padding: '11px 18px', borderRadius: 10,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  width: '100%', transition: '.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,.25)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,.15)')}
              >
                📊 Gerar Relatório Excel — Tomados
              </button>
            </div>

            {/* Coluna Prestados */}
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{
                background:'linear-gradient(135deg,rgba(34,197,94,.12),rgba(16,185,129,.08))',
                border:'1px solid rgba(34,197,94,.25)',
                borderRadius:16, padding:'26px 28px',
                display:'flex', alignItems:'center', gap:20,
                position:'relative', overflow:'hidden',
              }}>
                <div style={{ position:'absolute', right:-40, top:-40, width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle,rgba(34,197,94,.1),transparent 70%)' }} />
                <div style={{ width:52, height:52, borderRadius:14, background:'rgba(34,197,94,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>📤</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, letterSpacing:'1.2px', color:'rgba(255,255,255,.4)', textTransform:'uppercase', marginBottom:6 }}>Total Serviços Prestados</div>
                  <div style={{ fontSize:32, fontWeight:900, color:'#86efac', lineHeight:1 }}>
                    {statsLoading ? '...' : fmtBRL(stats?.prestados.totalServico ?? 0)}
                  </div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:5 }}>
                    {stats?.prestados.count ?? 0} notas · todos os períodos
                  </div>
                </div>
                <div style={{ width:1, height:48, borderRadius:1, background:'rgba(34,197,94,.25)', flexShrink:0 }} />
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {breakdown('prestados').map(row => (
                    <div key={row.k} style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'center' }}>
                      <span style={{ fontSize:10, color:'rgba(255,255,255,.35)', whiteSpace:'nowrap' }}>{row.k}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.6)' }}>{fmtBRL(row.v)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => downloadExcel('prestados')}
                style={{
                  background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.28)',
                  color: '#86efac', padding: '11px 18px', borderRadius: 10,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  width: '100%', transition: '.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,197,94,.22)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(34,197,94,.12)')}
              >
                📊 Gerar Relatório Excel — Prestados
              </button>
            </div>

          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { fetchStats, fetchNotes } from '../lib/api';
import type { Company, StatsResult } from '../types';
import type { NoteItem, NotesPage } from '../lib/api';

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
  const [activeTab, setActiveTab] = useState<'tomados' | 'prestados'>('tomados');
  const [notesPage, setNotesPage] = useState<NotesPage | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

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
  }, [activeCompany?.cnpj, refreshKey]);

  const loadNotes = useCallback(async (page: number) => {
    if (!activeCompany) { setNotesPage(null); return; }
    setNotesLoading(true);
    try {
      const p = await fetchNotes(activeCompany.cnpj, activeTab, page);
      setNotesPage(p);
      setCurrentPage(page);
    } catch { setNotesPage(null); }
    finally { setNotesLoading(false); }
  }, [activeCompany?.cnpj, activeTab, refreshKey]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { setCurrentPage(1); loadNotes(1); }, [loadNotes]);

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

            {/* Card Tomadas — clicável */}
            <div
              onClick={() => setActiveTab('tomados')}
              style={{
                background: activeTab === 'tomados' ? 'rgba(99,102,241,.22)' : 'rgba(99,102,241,.10)',
                border: activeTab === 'tomados' ? '2px solid rgba(99,102,241,.7)' : '1px solid rgba(99,102,241,.2)',
                borderRadius:16, padding:24, display:'flex', flexDirection:'column', justifyContent:'space-between',
                position:'relative', overflow:'hidden', cursor:'pointer', transition:'.2s',
              }}
            >
              <div style={{ position:'absolute', bottom:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,.15),transparent 70%)' }} />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:10, letterSpacing:'1.5px', color:'rgba(255,255,255,.5)', textTransform:'uppercase' }}>Notas Tomadas</div>
                {activeTab === 'tomados' && <div style={{ fontSize:9, color:'#a5b4fc', background:'rgba(99,102,241,.2)', padding:'2px 8px', borderRadius:10 }}>● ativo</div>}
              </div>
              <div style={{ fontSize:56, fontWeight:900, color:'#a5b4fc', lineHeight:1, margin:'10px 0 4px' }}>
                {stats?.tomados.count ?? '—'}
              </div>
              <div>
                <div style={{ height:3, borderRadius:2, background:'linear-gradient(90deg,#6366f1,transparent)', marginTop:8 }} />
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:6 }}>Serviços recebidos</div>
              </div>
            </div>

            {/* Card Prestadas — clicável */}
            <div
              onClick={() => setActiveTab('prestados')}
              style={{
                background: activeTab === 'prestados' ? 'rgba(34,197,94,.16)' : 'rgba(34,197,94,.07)',
                border: activeTab === 'prestados' ? '2px solid rgba(34,197,94,.6)' : '1px solid rgba(34,197,94,.18)',
                borderRadius:16, padding:24, display:'flex', flexDirection:'column', justifyContent:'space-between',
                position:'relative', overflow:'hidden', cursor:'pointer', transition:'.2s',
              }}
            >
              <div style={{ position:'absolute', bottom:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'radial-gradient(circle,rgba(34,197,94,.12),transparent 70%)' }} />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:10, letterSpacing:'1.5px', color:'rgba(255,255,255,.5)', textTransform:'uppercase' }}>Notas Prestadas</div>
                {activeTab === 'prestados' && <div style={{ fontSize:9, color:'#86efac', background:'rgba(34,197,94,.15)', padding:'2px 8px', borderRadius:10 }}>● ativo</div>}
              </div>
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

          {/* Tabela de notas */}
          <div style={{
            marginTop: 18,
            background: 'rgba(255,255,255,.03)',
            border: '1px solid rgba(255,255,255,.08)',
            borderRadius: 16,
            overflow: 'hidden',
          }}>
            {/* Cabeçalho da tabela */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '130px 1fr 130px 130px',
              padding: '12px 20px',
              background: 'rgba(255,255,255,.05)',
              borderBottom: '1px solid rgba(255,255,255,.07)',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.8px',
              color: activeTab === 'tomados' ? '#a5b4fc' : '#86efac',
              textTransform: 'uppercase',
            }}>
              <div>Nº NFS-e</div>
              <div>{activeTab === 'tomados' ? 'Emitida por' : 'Emitida para'}</div>
              <div style={{ textAlign:'center' }}>Data Emissão</div>
              <div style={{ textAlign:'right' }}>Preço Serviço</div>
            </div>

            {/* Linhas */}
            {notesLoading ? (
              <div style={{ padding:32, textAlign:'center', color:'rgba(255,255,255,.25)', fontSize:13 }}>
                Carregando...
              </div>
            ) : !notesPage || notesPage.items.length === 0 ? (
              <div style={{ padding:32, textAlign:'center', color:'rgba(255,255,255,.2)', fontSize:13 }}>
                Nenhuma nota encontrada
              </div>
            ) : (
              notesPage.items.map((note, i) => (
                <div
                  key={`${note.numeroNFSe}-${i}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '130px 1fr 130px 130px',
                    padding: '13px 20px',
                    borderBottom: i < notesPage.items.length - 1 ? '1px solid rgba(255,255,255,.04)' : 'none',
                    fontSize: 14,
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)',
                    transition: '.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)')}
                >
                  <div style={{
                    color: activeTab === 'tomados' ? '#a5b4fc' : '#86efac',
                    fontWeight: 600, fontFamily: 'monospace', fontSize: 13,
                  }}>
                    {note.numeroNFSe || '-'}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{
                        fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4,
                        background: activeTab === 'tomados' ? 'rgba(99,102,241,.25)' : 'rgba(34,197,94,.2)',
                        color: activeTab === 'tomados' ? '#a5b4fc' : '#86efac',
                        flexShrink: 0,
                      }}>
                        {activeTab === 'tomados' ? 'T' : 'P'}
                      </span>
                      <span style={{ color:'rgba(255,255,255,.7)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {note.cnpj} - {note.nome}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign:'center', color:'rgba(255,255,255,.5)', fontFamily:'monospace', fontSize:13 }}>
                    {note.dataEmissao}
                  </div>
                  <div style={{ textAlign:'right', fontWeight:600, color:'rgba(255,255,255,.8)' }}>
                    {note.valorServico.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })}
                  </div>
                </div>
              ))
            )}

            {/* Paginação */}
            {notesPage && notesPage.totalPages > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px',
                borderTop: '1px solid rgba(255,255,255,.07)',
                fontSize: 12, color: 'rgba(255,255,255,.4)',
              }}>
                <span>Total de {notesPage.total} registros</span>
                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                  <button
                    onClick={() => loadNotes(1)}
                    disabled={currentPage === 1}
                    style={{ ...paginBtn, opacity: currentPage === 1 ? 0.3 : 1 }}
                  >«</button>
                  <button
                    onClick={() => loadNotes(currentPage - 1)}
                    disabled={currentPage === 1}
                    style={{ ...paginBtn, opacity: currentPage === 1 ? 0.3 : 1 }}
                  >‹</button>
                  {Array.from({ length: Math.min(5, notesPage.totalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(currentPage - 2, notesPage.totalPages - 4));
                    const p = start + i;
                    if (p > notesPage.totalPages) return null;
                    return (
                      <button
                        key={p}
                        onClick={() => loadNotes(p)}
                        style={{
                          ...paginBtn,
                          background: p === currentPage ? 'rgba(99,102,241,.4)' : 'transparent',
                          color: p === currentPage ? 'white' : 'rgba(255,255,255,.5)',
                          fontWeight: p === currentPage ? 700 : 400,
                        }}
                      >{p}</button>
                    );
                  })}
                  <button
                    onClick={() => loadNotes(currentPage + 1)}
                    disabled={currentPage === notesPage.totalPages}
                    style={{ ...paginBtn, opacity: currentPage === notesPage.totalPages ? 0.3 : 1 }}
                  >›</button>
                  <button
                    onClick={() => loadNotes(notesPage.totalPages)}
                    disabled={currentPage === notesPage.totalPages}
                    style={{ ...paginBtn, opacity: currentPage === notesPage.totalPages ? 0.3 : 1 }}
                  >»</button>
                </div>
              </div>
            )}
            {notesPage && notesPage.totalPages <= 1 && notesPage.total > 0 && (
              <div style={{ padding:'10px 20px', borderTop:'1px solid rgba(255,255,255,.07)', fontSize:12, color:'rgba(255,255,255,.3)', textAlign:'right' }}>
                Total de {notesPage.total} {notesPage.total === 1 ? 'registro' : 'registros'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const paginBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,.1)',
  color: 'rgba(255,255,255,.6)',
  width: 28, height: 28,
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0,
};

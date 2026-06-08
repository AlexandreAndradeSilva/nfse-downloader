import { useCallback } from 'react';
import type { Company } from '../types';
import { deleteCompany } from '../lib/api';
import { IconBuilding, IconPlay, IconEdit, IconX, IconRefresh } from '../components/Icons';

interface Props {
  companies: Company[];
  syncing: Record<string, boolean>;
  onSync: (cnpj: string) => void;
  onRefresh: () => void;
  onAddManual: () => void;
}

function fmtCnpj(v: string) {
  return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function fmtDate(iso: string | null) {
  if (!iso) return 'Nunca sincronizado';
  return new Date(iso).toLocaleDateString('pt-BR') + ' ' +
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function avatarColor(nome: string): string {
  const colors = [
    'linear-gradient(135deg,#6366f1,#8b5cf6)',
    'linear-gradient(135deg,#0891b2,#0e7490)',
    'linear-gradient(135deg,#d97706,#b45309)',
    'linear-gradient(135deg,#16a34a,#15803d)',
    'linear-gradient(135deg,#dc2626,#b91c1c)',
  ];
  const idx = nome.charCodeAt(0) % colors.length;
  return colors[idx];
}

export function Empresas({ companies, syncing, onSync, onRefresh, onAddManual }: Props) {
  const handleDelete = useCallback(async (cnpj: string, nome: string) => {
    if (!confirm(`Remover ${nome}?`)) return;
    await deleteCompany(cnpj);
    onRefresh();
  }, [onRefresh]);

  return (
    <div style={{
      padding: '32px 28px',
      flex: 1,
      background: 'linear-gradient(160deg,#1e1b4b 0%,#0f0e1a 40%)',
      minHeight: 'calc(100vh - 56px)',
    }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800 }}>Empresas</h1>
          <p style={{ fontSize:13, color:'rgba(255,255,255,.4)', marginTop:4 }}>
            Gerencie as empresas cadastradas para sincronização
          </p>
        </div>
        <button
          onClick={onAddManual}
          style={{
            background: 'rgba(255,255,255,.07)',
            border: '1px solid rgba(255,255,255,.1)',
            color: 'rgba(255,255,255,.8)',
            padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          + Cadastro manual
        </button>
      </div>

      {companies.length === 0 ? (
        <div style={{ textAlign:'center', padding:'80px 24px', color:'rgba(255,255,255,.3)' }}>
          <div style={{ marginBottom:16, color:'rgba(255,255,255,.2)' }}><IconBuilding size={48} /></div>
          <div style={{ fontSize:16, fontWeight:600, marginBottom:8 }}>Nenhuma empresa cadastrada</div>
          <div style={{ fontSize:13 }}>Clique em "Buscar Notas" para começar.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {companies.map(c => (
            <div
              key={c.cnpj}
              style={{
                background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.07)',
                borderRadius: 16, padding: '20px 24px',
                display: 'flex', alignItems: 'center', gap: 18,
                transition: '.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,.07)';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(99,102,241,.35)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,.04)';
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,.07)';
              }}
            >
              <div style={{
                width: 46, height: 46,
                background: avatarColor(c.nome),
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 900, flexShrink: 0,
              }}>
                {c.nome.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {c.nome}
                </div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', marginTop:3 }}>
                  {fmtCnpj(c.cnpj)} · {fmtDate(c.lastSync)} · NSU: {c.lastNsu}
                </div>
              </div>

              <div style={{ display:'flex', gap:12 }}>
                {[
                  { label:'Tomados', color:'#a5b4fc' },
                  { label:'Prestados', color:'#86efac' },
                ].map(s => (
                  <div key={s.label} style={{
                    display:'flex', flexDirection:'column', alignItems:'center',
                    background:'rgba(255,255,255,.05)', borderRadius:10,
                    padding:'8px 16px', minWidth:64,
                  }}>
                    <div style={{ fontSize:18, fontWeight:800, color:s.color, lineHeight:1 }}>—</div>
                    <div style={{ fontSize:9, color:'rgba(255,255,255,.3)', textTransform:'uppercase', letterSpacing:1, marginTop:2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                <button
                  onClick={() => onSync(c.cnpj)}
                  disabled={!!syncing[c.cnpj]}
                  style={{
                    background: syncing[c.cnpj] ? 'rgba(99,102,241,.4)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    border: 'none', color: 'white',
                    padding: '9px 18px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                    cursor: syncing[c.cnpj] ? 'not-allowed' : 'pointer',
                    boxShadow: syncing[c.cnpj] ? 'none' : '0 3px 10px rgba(99,102,241,.3)',
                  }}
                >
                  {syncing[c.cnpj]
                    ? <><span style={{animation:'spin 1s linear infinite',display:'inline-flex'}}><IconRefresh size={13}/></span> Sync...</>
                    : <><IconPlay size={13}/> Sync</>}
                </button>
                <button
                  onClick={onAddManual}
                  style={{
                    background: 'rgba(255,255,255,.06)',
                    border: '1px solid rgba(255,255,255,.1)',
                    color: 'rgba(255,255,255,.7)',
                    padding: '9px 15px', borderRadius: 9, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(c.cnpj, c.nome)}
                  style={{
                    background: 'rgba(239,68,68,.08)',
                    border: '1px solid rgba(239,68,68,.18)',
                    color: '#f87171',
                    padding: '9px 12px', borderRadius: 9, fontSize: 12, cursor: 'pointer',
                  }}
                >
                  <IconX size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

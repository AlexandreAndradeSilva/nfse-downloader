import React from 'react';
import { supabase } from '../lib/supabase';
import { IconDashboard, IconBuilding, IconSearch, IconLogout } from './Icons';

type Page = 'dashboard' | 'empresas';

interface Props {
  page: Page;
  onPageChange: (p: Page) => void;
  onBuscarNotas: () => void;
  onGerarPdfs: () => void;
}

export function TopNav({ page, onPageChange, onBuscarNotas, onGerarPdfs }: Props) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const tabs: { id: Page; label: string; Icon: () => React.ReactElement }[] = [
    { id: 'dashboard', label: 'Dashboard', Icon: () => <IconDashboard size={15} /> },
    { id: 'empresas',  label: 'Empresas',  Icon: () => <IconBuilding  size={15} /> },
  ];

  return (
    <nav style={{
      background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,.08)',
      padding: '0 28px', display: 'flex', alignItems: 'center',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      {/* Brand */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 0', marginRight:32 }}>
        <div style={{
          width:32, height:32,
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:16, fontWeight:900,
        }}>N</div>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:'white' }}>NFS-e Downloader</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,.4)' }}>Portal Nacional</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', alignItems:'stretch', gap:2, flex:1 }}>
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onPageChange(id)}
            style={{
              padding: '0 20px', height: 56,
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 13, fontWeight: 500,
              color: page === id ? 'white' : 'rgba(255,255,255,.5)',
              background: 'none', border: 'none',
              borderBottom: page === id ? '2px solid #6366f1' : '2px solid transparent',
              cursor: 'pointer', transition: 'color .15s', whiteSpace: 'nowrap',
            }}
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginLeft:'auto' }}>
        <button
          onClick={onGerarPdfs}
          style={{
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.12)',
            color: 'rgba(255,255,255,.85)',
            padding: '9px 16px', borderRadius: 9,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          Gerar PDFs
        </button>

        <button
          onClick={onBuscarNotas}
          style={{
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            border: 'none', color: 'white',
            padding: '9px 20px', borderRadius: 9,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(99,102,241,.4)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <IconSearch size={15} />
          Buscar Notas
        </button>

        <button
          onClick={handleLogout}
          title="Sair"
          style={{
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.1)',
            color: 'rgba(255,255,255,.6)',
            padding: '8px 12px', borderRadius: 9,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, transition: '.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget.style.background = 'rgba(239,68,68,.15)');
            (e.currentTarget.style.color = '#f87171');
            (e.currentTarget.style.borderColor = 'rgba(239,68,68,.3)');
          }}
          onMouseLeave={e => {
            (e.currentTarget.style.background = 'rgba(255,255,255,.06)');
            (e.currentTarget.style.color = 'rgba(255,255,255,.6)');
            (e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)');
          }}
        >
          <IconLogout size={15} />
          Sair
        </button>
      </div>
    </nav>
  );
}

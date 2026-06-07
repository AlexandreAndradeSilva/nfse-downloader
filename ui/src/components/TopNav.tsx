type Page = 'dashboard' | 'empresas';

interface Props {
  page: Page;
  onPageChange: (p: Page) => void;
  onBuscarNotas: () => void;
}

export function TopNav({ page, onPageChange, onBuscarNotas }: Props) {
  return (
    <nav style={{
      background: 'rgba(0,0,0,.5)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255,255,255,.08)',
      padding: '0 28px',
      display: 'flex',
      alignItems: 'center',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
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

      <div style={{ display:'flex', alignItems:'stretch', gap:2, flex:1 }}>
        {([
          { id: 'dashboard' as Page, label: 'Dashboard', icon: '▣' },
          { id: 'empresas'  as Page, label: 'Empresas',  icon: '⌂' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => onPageChange(tab.id)}
            style={{
              padding: '0 20px', height: 56,
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 13, fontWeight: 500,
              color: page === tab.id ? 'white' : 'rgba(255,255,255,.5)',
              background: 'none', border: 'none',
              borderBottom: page === tab.id ? '2px solid #6366f1' : '2px solid transparent',
              cursor: 'pointer', transition: 'color .15s', whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize:12 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <button
        onClick={onBuscarNotas}
        style={{
          marginLeft: 'auto',
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          border: 'none', color: 'white',
          padding: '9px 20px', borderRadius: 9,
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(99,102,241,.4)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}
      >
        🔍 Buscar Notas
      </button>
    </nav>
  );
}

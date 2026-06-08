// Ícones SVG minimalistas — substitui todos os emojis do app
const props = (extra?: object) => ({
  width: 18, height: 18, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  ...extra,
});

export const IconSearch = (p?: { size?: number; color?: string }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18, stroke: p?.color??'currentColor' })}>
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

export const IconDashboard = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
  </svg>
);

export const IconBuilding = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

export const IconDownload = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

export const IconUpload = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

export const IconBarChart = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
);

export const IconPin = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

export const IconFile = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

export const IconRefresh = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

export const IconPlay = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);

export const IconFolder = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

export const IconLock = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

export const IconLogout = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

export const IconUser = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

export const IconEdit = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

export const IconX = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export const IconCheck = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

export const IconAlert = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??18, height: p?.size??18 })}>
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

export const IconSync = (p?: { size?: number }) => (
  <svg {...props({ width: p?.size??16, height: p?.size??16 })}>
    <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
    <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
  </svg>
);

export const IconChevronLeft = () => (
  <svg {...props()}><polyline points="15 18 9 12 15 6"/></svg>
);
export const IconChevronRight = () => (
  <svg {...props()}><polyline points="9 18 15 12 9 6"/></svg>
);
export const IconChevronsLeft = () => (
  <svg {...props()}><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
);
export const IconChevronsRight = () => (
  <svg {...props()}><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
);

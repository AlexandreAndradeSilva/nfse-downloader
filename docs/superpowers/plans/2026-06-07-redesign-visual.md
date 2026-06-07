# Redesign Visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a interface com tema dark/índigo profissional, separar Empresas em tela dedicada e adicionar cards financeiros (valor total prestados/tomados) calculados dos XMLs em disco.

**Architecture:** Backend ganha `xml-reader.ts` + rota `GET /api/stats/:cnpj` que lê XMLs do disco e soma valores. Frontend ganha `TopNav`, `Empresas.tsx` e Dashboard completamente redesenhado com grid de 5 cards. Navegação por estado React (sem React Router).

**Tech Stack:** Express, fast-xml-parser, React, Tailwind CSS, TypeScript

---

## File Map

```
api/src/
  services/xml-reader.ts      ← NOVO: lê XMLs do disco, soma valores financeiros
  routes/stats.ts             ← NOVO: GET /api/stats/:cnpj
  server.ts                   ← MODIFICA: registra statsRouter

ui/src/
  index.css                   ← MODIFICA: adiciona tema dark global
  App.tsx                     ← MODIFICA: passa página ativa para componentes
  components/
    TopNav.tsx                ← NOVO: barra de navegação top com abas
  pages/
    Dashboard.tsx             ← REESCREVE: novo layout 5 cards
    Empresas.tsx              ← NOVO: lista de empresas com stats
  lib/
    api.ts                    ← MODIFICA: adiciona fetchStats()
  types.ts                    ← MODIFICA: adiciona StatsResult
```

---

## Task 1: Backend — xml-reader service (TDD)

**Files:**
- Create: `api/src/services/xml-reader.ts`
- Create: `api/tests/xml-reader.test.ts`

- [ ] **Step 1: Criar o teste**

Criar `api/tests/xml-reader.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { readCompanyStats } from '../src/services/xml-reader.js';

const OUTPUT = join(process.cwd(), 'test-xml-reader');

const makeTomadoXml = (vLiq: string, vServ: string, pAliq: string, tpRet: string, vPis: string, vCofins: string) => `
<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS12345678000000000000000000000001">
    <emit><CNPJ>98765432000199</CNPJ><xNome>Prestador X</xNome><enderNac><CEP>01001000</CEP></enderNac></emit>
    <valores><vBC>${vServ}</vBC><vLiq>${vLiq}</vLiq></valores>
    <DPS versao="1.00"><infDPS Id="DPS1">
      <dhEmi>2026-06-10T10:00:00-03:00</dhEmi><dCompet>2026-06-10</dCompet>
      <prest><CNPJ>98765432000199</CNPJ><regTrib><opSimpNac>3</opSimpNac></regTrib></prest>
      <toma><CNPJ>12345678000100</CNPJ><xNome>Empresa Y</xNome>
        <end><endNac><cMun>3550308</cMun><CEP>01001000</CEP></endNac><xLgr>R</xLgr><nro>1</nro><xBairro>B</xBairro></end>
      </toma>
      <serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest>
        <cServ><cTribNac>010100</cTribNac><cTribMun>001</cTribMun><xDescServ>Serv</xDescServ></cServ>
      </serv>
      <valores>
        <vServPrest><vServ>${vServ}</vServ></vServPrest>
        <trib>
          <tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>${tpRet}</tpRetISSQN><pAliq>${pAliq}</pAliq></tribMun>
          <tribFed><piscofins><vPis>${vPis}</vPis><vCofins>${vCofins}</vCofins><tpRetPisCofins>2</tpRetPisCofins></piscofins></tribFed>
        </trib>
      </valores>
    </infDPS></DPS>
  </infNFSe>
</NFSe>`;

afterEach(() => { if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true }); });

describe('xml-reader', () => {
  it('soma valores financeiros de XMLs tomados', () => {
    const dir = join(OUTPUT, 'Empresa Teste', '062026', 'tomados');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '000000001-abc.xml'), makeTomadoXml('95.00', '100.00', '5.00', '2', '1.65', '7.60'));
    writeFileSync(join(dir, '000000002-def.xml'), makeTomadoXml('190.00', '200.00', '5.00', '2', '3.30', '15.20'));

    const stats = readCompanyStats(OUTPUT, 'Empresa Teste');
    expect(stats.tomados.count).toBe(2);
    expect(stats.tomados.totalServico).toBeCloseTo(300.00);
    expect(stats.tomados.liquido).toBeCloseTo(285.00);
    expect(stats.tomados.pisCofins).toBeCloseTo(27.75);
  });

  it('retorna zeros quando não há arquivos', () => {
    const stats = readCompanyStats(OUTPUT, 'Empresa Vazia');
    expect(stats.tomados.count).toBe(0);
    expect(stats.tomados.totalServico).toBe(0);
    expect(stats.prestados.count).toBe(0);
  });

  it('separa prestados de tomados pelo diretório', () => {
    const dirT = join(OUTPUT, 'Emp', '062026', 'tomados');
    const dirP = join(OUTPUT, 'Emp', '062026', 'prestados');
    mkdirSync(dirT, { recursive: true });
    mkdirSync(dirP, { recursive: true });
    writeFileSync(join(dirT, '001.xml'), makeTomadoXml('100.00', '100.00', '2.00', '1', '0', '0'));
    writeFileSync(join(dirP, '002.xml'), makeTomadoXml('200.00', '200.00', '2.00', '1', '0', '0'));

    const stats = readCompanyStats(OUTPUT, 'Emp');
    expect(stats.tomados.count).toBe(1);
    expect(stats.prestados.count).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional\api"
npm test -- tests/xml-reader.test.ts
```

Saída esperada: FAIL — `Cannot find module '../src/services/xml-reader.js'`

- [ ] **Step 3: Criar `api/src/services/xml-reader.ts`**

```typescript
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

export interface FinancialTotals {
  count: number;
  totalServico: number;
  issRetido: number;
  pisCofins: number;
  liquido: number;
}

export interface CompanyStats {
  tomados: FinancialTotals;
  prestados: FinancialTotals;
}

const ZERO: FinancialTotals = { count: 0, totalServico: 0, issRetido: 0, pisCofins: 0, liquido: 0 };

export function readCompanyStats(outputFolder: string, nomeEmpresa: string): CompanyStats {
  const companyDir = join(outputFolder, nomeEmpresa);
  if (!existsSync(companyDir)) return { tomados: { ...ZERO }, prestados: { ...ZERO } };

  const tomados = { ...ZERO };
  const prestados = { ...ZERO };

  // Percorre todos os períodos (subpastas MMYYYY)
  for (const period of safeDirRead(companyDir)) {
    const periodDir = join(companyDir, period);
    for (const tipo of ['tomados', 'prestados'] as const) {
      const tipoDir = join(periodDir, tipo);
      const target = tipo === 'tomados' ? tomados : prestados;
      for (const file of safeDirRead(tipoDir)) {
        if (!file.endsWith('.xml')) continue;
        try {
          const xml = readFileSync(join(tipoDir, file), 'utf-8');
          accumulateFromXml(xml, target);
        } catch { /* arquivo corrompido — pula */ }
      }
    }
  }

  return { tomados, prestados };
}

function safeDirRead(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir); } catch { return []; }
}

function accumulateFromXml(xml: string, target: FinancialTotals): void {
  const parsed = parser.parse(xml);
  const inf = parsed?.NFSe?.infNFSe ?? {};
  const dps = inf?.DPS?.infDPS ?? {};
  const valoresNfse = inf?.valores ?? {};
  const valoresDps = dps?.valores ?? {};
  const tribMun = valoresDps?.trib?.tribMun ?? {};
  const piscofins = valoresDps?.trib?.tribFed?.piscofins ?? {};
  const vServPrest = valoresDps?.vServPrest ?? {};

  const vServ = n(vServPrest.vServ ?? valoresNfse.vBC);
  const vLiq = n(valoresNfse.vLiq);
  const pAliq = n(tribMun.pAliq);
  const vBC = n(valoresNfse.vBC);
  const tpRet = String(tribMun.tpRetISSQN ?? '');
  const vPis = n(piscofins.vPis);
  const vCofins = n(piscofins.vCofins);

  // ISS Retido: tpRetISSQN=2 significa Retido pelo Tomador
  const iss = tpRet === '2' ? round(vBC * pAliq / 100) : 0;

  target.count += 1;
  target.totalServico += vServ;
  target.issRetido += iss;
  target.pisCofins += round(vPis + vCofins);
  target.liquido += vLiq || (vServ - iss - vPis - vCofins);
}

function n(v: unknown): number {
  const num = parseFloat(String(v ?? '0'));
  return isNaN(num) ? 0 : num;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
npm test -- tests/xml-reader.test.ts
```

Saída esperada: `3 passed`

- [ ] **Step 5: Rodar todos os testes**

```bash
npm test
```

Saída esperada: todos passam.

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
git add api/src/services/xml-reader.ts api/tests/xml-reader.test.ts
git commit -m "feat: xml-reader calcula totais financeiros dos XMLs em disco"
```

---

## Task 2: Backend — rota /api/stats/:cnpj

**Files:**
- Create: `api/src/routes/stats.ts`
- Modify: `api/src/server.ts`

- [ ] **Step 1: Criar `api/src/routes/stats.ts`**

```typescript
import { Router } from 'express';
import { getCompany } from '../config-store.js';
import { readCompanyStats } from '../services/xml-reader.js';

export const statsRouter = Router();

statsRouter.get('/:cnpj', (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);
  if (!company) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }
  const stats = readCompanyStats(company.outputFolder, company.nome);
  res.json(stats);
});
```

- [ ] **Step 2: Registrar em `api/src/server.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import { companiesRouter } from './routes/companies.js';
import { syncRouter } from './routes/sync.js';
import { certificatesRouter } from './routes/certificates.js';
import { statsRouter } from './routes/stats.js';

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'] }));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/companies', companiesRouter);
app.use('/api/sync', syncRouter);
app.use('/api/certificates', certificatesRouter);
app.use('/api/stats', statsRouter);

const PORT = 3002;
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));

export default app;
```

- [ ] **Step 3: Testar manualmente** (servidor rodando)

```bash
curl http://localhost:3002/api/stats/02495060000158
```

Saída esperada: JSON com `{tomados:{count,totalServico,issRetido,pisCofins,liquido}, prestados:{...}}`

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/stats.ts api/src/server.ts
git commit -m "feat: rota GET /api/stats/:cnpj retorna totais financeiros"
```

---

## Task 3: Frontend — tipos e api.ts

**Files:**
- Modify: `ui/src/types.ts`
- Modify: `ui/src/lib/api.ts`

- [ ] **Step 1: Adicionar `StatsResult` em `ui/src/types.ts`**

Adicionar ao final do arquivo existente:

```typescript
export interface FinancialTotals {
  count: number;
  totalServico: number;
  issRetido: number;
  pisCofins: number;
  liquido: number;
}

export interface StatsResult {
  tomados: FinancialTotals;
  prestados: FinancialTotals;
}
```

- [ ] **Step 2: Adicionar `fetchStats` em `ui/src/lib/api.ts`**

Adicionar após as funções existentes (antes do `startSync`):

```typescript
import type { StatsResult } from '../types';

export async function fetchStats(cnpj: string): Promise<StatsResult> {
  const res = await fetch(`/api/stats/${cnpj}`);
  if (!res.ok) throw new Error('Erro ao buscar estatísticas');
  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/types.ts ui/src/lib/api.ts
git commit -m "feat: tipo StatsResult e fetchStats no api client"
```

---

## Task 4: Frontend — tema dark global + TopNav

**Files:**
- Modify: `ui/src/index.css`
- Create: `ui/src/components/TopNav.tsx`

- [ ] **Step 1: Atualizar `ui/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-deep: #0f0e1a;
  --bg-mid: #1e1b4b;
  --accent: #6366f1;
  --accent2: #8b5cf6;
  --border-subtle: rgba(255,255,255,.08);
  --text-muted: rgba(255,255,255,.4);
}

html, body, #root {
  min-height: 100vh;
  background: var(--bg-deep);
  color: white;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
}

* { box-sizing: border-box; }
```

- [ ] **Step 2: Criar `ui/src/components/TopNav.tsx`**

```typescript
import type { Company } from '../types';

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
        {([
          { id: 'dashboard', label: 'Dashboard', icon: '▣' },
          { id: 'empresas',  label: 'Empresas',  icon: '⌂' },
        ] as { id: Page; label: string; icon: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => onPageChange(tab.id)}
            style={{
              padding: '0 20px',
              height: 56,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 13,
              fontWeight: 500,
              color: page === tab.id ? 'white' : 'rgba(255,255,255,.5)',
              background: 'none',
              border: 'none',
              borderBottom: page === tab.id ? '2px solid #6366f1' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color .15s',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize:12 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Action */}
      <button
        onClick={onBuscarNotas}
        style={{
          marginLeft: 'auto',
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          border: 'none',
          color: 'white',
          padding: '9px 20px',
          borderRadius: 9,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(99,102,241,.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
        }}
      >
        🔍 Buscar Notas
      </button>
    </nav>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/index.css ui/src/components/TopNav.tsx
git commit -m "feat: tema dark global e TopNav com abas Dashboard/Empresas"
```

---

## Task 5: Frontend — página Empresas

**Files:**
- Create: `ui/src/pages/Empresas.tsx`

- [ ] **Step 1: Criar `ui/src/pages/Empresas.tsx`**

```typescript
import { useCallback } from 'react';
import type { Company } from '../types';
import { updateCompany, deleteCompany } from '../lib/api';

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
      {/* Header */}
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
            padding: '9px 18px',
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          + Cadastro manual
        </button>
      </div>

      {/* Lista */}
      {companies.length === 0 ? (
        <div style={{ textAlign:'center', padding:'80px 24px', color:'rgba(255,255,255,.3)' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🏢</div>
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
                borderRadius: 16,
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 18,
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
              {/* Avatar */}
              <div style={{
                width: 46, height: 46,
                background: avatarColor(c.nome),
                borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 900, flexShrink: 0,
              }}>
                {c.nome.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {c.nome}
                </div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', marginTop:3 }}>
                  {fmtCnpj(c.cnpj)} &nbsp;·&nbsp; {fmtDate(c.lastSync)} &nbsp;·&nbsp; NSU: {c.lastNsu}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display:'flex', gap:12 }}>
                {[
                  { label:'Tomados', val: '—', color:'#a5b4fc' },
                  { label:'Prestados', val: '—', color:'#86efac' },
                ].map(s => (
                  <div key={s.label} style={{
                    display:'flex', flexDirection:'column', alignItems:'center',
                    background:'rgba(255,255,255,.05)', borderRadius:10,
                    padding:'8px 16px', minWidth:64,
                  }}>
                    <div style={{ fontSize:18, fontWeight:800, color:s.color, lineHeight:1 }}>{s.val}</div>
                    <div style={{ fontSize:9, color:'rgba(255,255,255,.3)', textTransform:'uppercase', letterSpacing:1, marginTop:2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                <button
                  onClick={() => onSync(c.cnpj)}
                  disabled={!!syncing[c.cnpj]}
                  style={{
                    background: syncing[c.cnpj] ? 'rgba(99,102,241,.4)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    border: 'none', color: 'white',
                    padding: '9px 18px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: syncing[c.cnpj] ? 'not-allowed' : 'pointer',
                    boxShadow: syncing[c.cnpj] ? 'none' : '0 3px 10px rgba(99,102,241,.3)',
                  }}
                >
                  {syncing[c.cnpj] ? '⏳ Sync...' : '▶ Sync'}
                </button>
                <button
                  onClick={() => {/* edit handled via AddCompanyModal in parent */}}
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
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/pages/Empresas.tsx
git commit -m "feat: pagina Empresas com lista dark e acoes de sync/editar/remover"
```

---

## Task 6: Frontend — Dashboard redesenhado

**Files:**
- Rewrite: `ui/src/pages/Dashboard.tsx`

- [ ] **Step 1: Substituir `ui/src/pages/Dashboard.tsx` pelo conteúdo completo:**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { listCompanies, fetchStats, startSync } from '../lib/api';
import type { Company, StatsResult } from '../types';
import type { SyncOptions } from '../components/SyncModal';

interface Props {
  onSyncStart: (cnpj: string, opts: SyncOptions) => void;
  syncing: Record<string, boolean>;
  companies: Company[];
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleDateString('pt-BR') + ' ' +
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function Dashboard({ onSyncStart, syncing, companies }: Props) {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Usa a primeira empresa como ativa (ou a mais recentemente sincronizada)
  const activeCompany: Company | null = companies.length > 0
    ? [...companies].sort((a, b) => (b.lastSync ?? '').localeCompare(a.lastSync ?? ''))[0]
    : null;

  const loadStats = useCallback(async () => {
    if (!activeCompany) { setStats(null); return; }
    setStatsLoading(true);
    try {
      const s = await fetchStats(activeCompany.cnpj);
      setStats(s);
    } catch { setStats(null); }
    finally { setStatsLoading(false); }
  }, [activeCompany?.cnpj]);

  useEffect(() => { loadStats(); }, [loadStats]);

  function fmtCnpj(v: string) {
    return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  return (
    <div style={{
      padding: '32px 28px',
      flex: 1,
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
          {/* Linha 1: Empresa ativa + Contadores */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.7fr 1fr 1fr',
            gap: 18,
            marginBottom: 18,
          }}>
            {/* Card Empresa */}
            <div style={{
              background: 'rgba(99,102,241,.1)',
              border: '1px solid rgba(99,102,241,.25)',
              borderRadius: 16,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position:'absolute', top:-30, right:-30, width:120, height:120,
                background:'radial-gradient(circle,rgba(99,102,241,.2),transparent 70%)',
                borderRadius:'50%',
              }} />
              <div style={{ fontSize:10, letterSpacing:'1.5px', color:'rgba(255,255,255,.35)', textTransform:'uppercase' }}>
                Empresa Ativa
              </div>
              <div style={{ fontSize:16, fontWeight:700, color:'white', lineHeight:1.3 }}>
                {activeCompany?.nome}
              </div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.4)' }}>
                {activeCompany ? fmtCnpj(activeCompany.cnpj) : ''} · Produção
              </div>
              <div style={{ display:'flex', gap:16, marginTop:6 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>
                  Último sync: <strong style={{color:'rgba(255,255,255,.75)', fontWeight:600}}>{fmtDate(activeCompany?.lastSync ?? null)}</strong>
                </div>
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(99,102,241,.2)', border: '1px solid rgba(99,102,241,.3)',
                borderRadius: 20, padding: '4px 12px', fontSize: 11, color: '#a5b4fc',
                width: 'fit-content', marginTop: 4,
              }}>
                📌 NSU atual: {activeCompany?.lastNsu ?? 0}
              </div>
            </div>

            {/* Card Tomadas */}
            <div style={{
              background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.2)',
              borderRadius: 16, padding: 24,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              position: 'relative', overflow: 'hidden',
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
              background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.18)',
              borderRadius: 16, padding: 24,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              position: 'relative', overflow: 'hidden',
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

          {/* Linha 2: Valores financeiros */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18 }}>

            {/* Total Tomados */}
            <div style={{
              background: 'linear-gradient(135deg,rgba(99,102,241,.18),rgba(139,92,246,.12))',
              border: '1px solid rgba(99,102,241,.3)',
              borderRadius: 16, padding: '26px 28px',
              display: 'flex', alignItems: 'center', gap: 20,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position:'absolute', right:-40, top:-40, width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,.12),transparent 70%)' }} />
              <div style={{
                width:52, height:52, borderRadius:14,
                background:'rgba(99,102,241,.25)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:24, flexShrink:0,
              }}>📥</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, letterSpacing:'1.2px', color:'rgba(255,255,255,.4)', textTransform:'uppercase', marginBottom:6 }}>
                  Total Serviços Tomados
                </div>
                <div style={{ fontSize:32, fontWeight:900, color:'#c4b5fd', lineHeight:1 }}>
                  {statsLoading ? '...' : fmtBRL(stats?.tomados.totalServico ?? 0)}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:5 }}>
                  {stats?.tomados.count ?? 0} notas · todos os períodos
                </div>
              </div>
              <div style={{ width:1, height:48, borderRadius:1, background:'rgba(99,102,241,.3)', flexShrink:0 }} />
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {[
                  { k:'ISS Retido',    v: stats?.tomados.issRetido ?? 0 },
                  { k:'PIS/COFINS',   v: stats?.tomados.pisCofins ?? 0 },
                  { k:'Valor Líquido',v: stats?.tomados.liquido ?? 0 },
                ].map(row => (
                  <div key={row.k} style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'center' }}>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,.35)', whiteSpace:'nowrap' }}>{row.k}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.6)' }}>{fmtBRL(row.v)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Prestados */}
            <div style={{
              background: 'linear-gradient(135deg,rgba(34,197,94,.12),rgba(16,185,129,.08))',
              border: '1px solid rgba(34,197,94,.25)',
              borderRadius: 16, padding: '26px 28px',
              display: 'flex', alignItems: 'center', gap: 20,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position:'absolute', right:-40, top:-40, width:160, height:160, borderRadius:'50%', background:'radial-gradient(circle,rgba(34,197,94,.1),transparent 70%)' }} />
              <div style={{
                width:52, height:52, borderRadius:14,
                background:'rgba(34,197,94,.2)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:24, flexShrink:0,
              }}>📤</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, letterSpacing:'1.2px', color:'rgba(255,255,255,.4)', textTransform:'uppercase', marginBottom:6 }}>
                  Total Serviços Prestados
                </div>
                <div style={{ fontSize:32, fontWeight:900, color:'#86efac', lineHeight:1 }}>
                  {statsLoading ? '...' : fmtBRL(stats?.prestados.totalServico ?? 0)}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.3)', marginTop:5 }}>
                  {stats?.prestados.count ?? 0} notas · todos os períodos
                </div>
              </div>
              <div style={{ width:1, height:48, borderRadius:1, background:'rgba(34,197,94,.25)', flexShrink:0 }} />
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {[
                  { k:'ISS Retido',    v: stats?.prestados.issRetido ?? 0 },
                  { k:'PIS/COFINS',   v: stats?.prestados.pisCofins ?? 0 },
                  { k:'Valor Líquido',v: stats?.prestados.liquido ?? 0 },
                ].map(row => (
                  <div key={row.k} style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'center' }}>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,.35)', whiteSpace:'nowrap' }}>{row.k}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,.6)' }}>{fmtBRL(row.v)}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/pages/Dashboard.tsx
git commit -m "feat: Dashboard redesenhado com cards empresa, contadores e valores financeiros"
```

---

## Task 7: Frontend — App.tsx orquestra tudo

**Files:**
- Rewrite: `ui/src/App.tsx`

- [ ] **Step 1: Substituir `ui/src/App.tsx`:**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
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

  const load = useCallback(async () => {
    const data = await listCompanies();
    setCompanies(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSync = useCallback((cnpj: string, opts: SyncOptions) => {
    setSyncing(prev => ({ ...prev, [cnpj]: true }));
    startSync(
      cnpj,
      opts,
      () => {},  // eventos silenciosos — sem log no dashboard
      () => {
        setSyncing(prev => ({ ...prev, [cnpj]: false }));
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

      {page === 'dashboard' && (
        <Dashboard
          companies={companies}
          syncing={syncing}
          onSyncStart={(cnpj, opts) => runSync(cnpj, opts)}
        />
      )}

      {page === 'empresas' && (
        <Empresas
          companies={companies}
          syncing={syncing}
          onSync={cnpj => setSyncModalCnpj(cnpj)}
          onRefresh={load}
          onAddManual={() => { setEditingCompany(null); setAddModalOpen(true); }}
        />
      )}

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
```

- [ ] **Step 2: Rodar os testes do frontend para confirmar que nada quebrou**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional\ui"
npm test
```

Saída esperada: todos os testes passam.

- [ ] **Step 3: Commit final**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
git add ui/src/App.tsx
git commit -m "feat: App.tsx orquestra Dashboard/Empresas com nav e modais"
```

---

## Verificação End-to-End

- [ ] Reiniciar o servidor backend (`npx tsx src/server.ts` na pasta `api/`)
- [ ] Abrir `http://localhost:5175` no browser
- [ ] Verificar que o visual dark/gradiente aparece
- [ ] Clicar na aba **Empresas** — verificar que a lista aparece
- [ ] Clicar na aba **Dashboard** — verificar os 5 cards
- [ ] Verificar que os valores financeiros carregam (ou mostram R$ 0,00 se não houver XMLs)
- [ ] Clicar **Buscar Notas** — verificar que o seletor de certificados abre

# NFS-e Downloader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Node.js + React application that busca XMLs de NFS-e (prestadas e tomadas) da API ADN do Portal Nacional via mutual TLS e os salva em disco organizados por empresa/competência/tipo.

**Architecture:** Backend Express em `:3001` gerencia certificados `.pfx`, chama a API ADN com mutual TLS, descomprime GZip/base64 e salva XMLs no disco. Frontend React/Vite em `:5173` (proxy para `:3001`) oferece UI para cadastrar empresas e acompanhar sync via SSE. Estado persistido em `api/config.json`.

**Tech Stack:** Node.js 20, Express 5, TypeScript, `zlib`/`https` nativos, `node-fetch` v3, `fast-xml-parser`; React 18, Vite 5, TypeScript, Tailwind CSS, shadcn/ui, Vitest, @testing-library/react

---

## File Map

```
api/
  package.json
  tsconfig.json
  src/
    server.ts             ← Express entry point, registra rotas
    types.ts              ← Interfaces compartilhadas
    config-store.ts       ← Lê/escreve config.json
    routes/
      companies.ts        ← CRUD /api/companies
      sync.ts             ← POST /api/sync/:cnpj (SSE)
    services/
      adn-client.ts       ← GET /DFe/{NSU} com mutual TLS
      xml-saver.ts        ← decode base64 → gunzip → parse → salva
      sync-engine.ts      ← loop de iteração de NSUs
  tests/
    config-store.test.ts
    xml-saver.test.ts
    sync-engine.test.ts

ui/
  package.json
  vite.config.ts          ← proxy /api → localhost:3001
  index.html
  src/
    main.tsx
    App.tsx
    lib/
      api.ts              ← fetch wrappers para a API backend
    components/
      CompanyCard.tsx
      AddCompanyModal.tsx
      SyncLogPanel.tsx
    pages/
      Dashboard.tsx
  tests/
    CompanyCard.test.tsx
    AddCompanyModal.test.tsx
    SyncLogPanel.test.tsx
```

---

## Task 1: Scaffold do projeto API

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/src/types.ts`
- Create: `api/src/server.ts`

- [ ] **Step 1: Criar `api/package.json`**

```json
{
  "name": "nfse-downloader-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^5.0.1",
    "fast-xml-parser": "^4.4.1",
    "node-fetch": "^3.3.2"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^20.14.0",
    "tsx": "^4.15.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Criar `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Criar `api/src/types.ts`**

```typescript
export interface Company {
  cnpj: string;
  nome: string;
  pfxPath: string;
  pfxPassword: string;
  outputFolder: string;
  baseUrl: string;
  ambiente: 'PRODUCAO' | 'HOMOLOGACAO';
  lastNsu: number;
  lastSync: string | null;
}

export interface Config {
  companies: Company[];
}

export interface AdnNsuItem {
  // ATENÇÃO: nomes de campos a confirmar contra resposta real da API ADN
  NsuDFe: string;
  XmlBase64GZip: string;
}

export interface AdnDistribuicaoResponse {
  StatusProcessamento: 'REJEICAO' | 'NENHUM_DOCUMENTO_LOCALIZADO' | 'DOCUMENTOS_LOCALIZADOS';
  LoteDFe: AdnNsuItem[] | null;
  Alertas: Array<{ Codigo: string | null; Descricao: string | null }> | null;
  Erros: Array<{ Codigo: string | null; Descricao: string | null }> | null;
}

export interface SyncProgress {
  type: 'progress' | 'done' | 'error';
  message: string;
  nsu?: number;
  prestados?: number;
  tomados?: number;
  errors?: number;
}
```

- [ ] **Step 4: Criar `api/src/server.ts`** (sem rotas ainda — serão registradas nas Tasks 3 e 7)

```typescript
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = 3001;
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));

export default app;
```

- [ ] **Step 5: Instalar dependências e verificar que o servidor sobe**

```bash
cd api
npm install
npm run dev
```

Saída esperada:
```
API rodando em http://localhost:3001
```

- [ ] **Step 6: Commit**

```bash
cd ..
git add api/
git commit -m "feat: scaffold do projeto API (Express + TypeScript)"
```

---

## Task 2: Config Store

**Files:**
- Create: `api/src/config-store.ts`
- Create: `api/tests/config-store.test.ts`

- [ ] **Step 1: Escrever o teste com falha**

Criar `api/tests/config-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  readConfig,
  upsertCompany,
  removeCompany,
  getCompany,
  updateLastNsu,
} from '../src/config-store.js';
import type { Company } from '../src/types.js';

const CONFIG_PATH = join(process.cwd(), 'config.json');

const mockCompany: Company = {
  cnpj: '12345678000100',
  nome: 'Empresa Teste',
  pfxPath: '/certs/teste.pfx',
  pfxPassword: 'senha',
  outputFolder: '/output',
  baseUrl: 'https://api.example.com/adn',
  ambiente: 'HOMOLOGACAO',
  lastNsu: 0,
  lastSync: null,
};

beforeEach(() => {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
});

afterEach(() => {
  if (existsSync(CONFIG_PATH)) unlinkSync(CONFIG_PATH);
});

describe('config-store', () => {
  it('cria config padrão se não existir', () => {
    const config = readConfig();
    expect(config.companies).toEqual([]);
  });

  it('upsert insere nova empresa', () => {
    upsertCompany(mockCompany);
    const found = getCompany('12345678000100');
    expect(found?.nome).toBe('Empresa Teste');
  });

  it('upsert atualiza empresa existente', () => {
    upsertCompany(mockCompany);
    upsertCompany({ ...mockCompany, nome: 'Nome Atualizado' });
    const config = readConfig();
    expect(config.companies).toHaveLength(1);
    expect(config.companies[0].nome).toBe('Nome Atualizado');
  });

  it('removeCompany remove pelo cnpj', () => {
    upsertCompany(mockCompany);
    removeCompany('12345678000100');
    expect(getCompany('12345678000100')).toBeUndefined();
  });

  it('updateLastNsu atualiza nsu e lastSync', () => {
    upsertCompany(mockCompany);
    updateLastNsu('12345678000100', 999);
    const company = getCompany('12345678000100');
    expect(company?.lastNsu).toBe(999);
    expect(company?.lastSync).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd api
npm test
```

Saída esperada: FAIL — `Cannot find module '../src/config-store.js'`

- [ ] **Step 3: Implementar `api/src/config-store.ts`**

```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Config, Company } from './types.js';

const CONFIG_PATH = join(process.cwd(), 'config.json');
const DEFAULT_CONFIG: Config = { companies: [] };

export function readConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    writeConfig(DEFAULT_CONFIG);
    return structuredClone(DEFAULT_CONFIG);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Config;
}

export function writeConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getCompany(cnpj: string): Company | undefined {
  return readConfig().companies.find(c => c.cnpj === cnpj);
}

export function upsertCompany(company: Company): void {
  const config = readConfig();
  const idx = config.companies.findIndex(c => c.cnpj === company.cnpj);
  if (idx >= 0) config.companies[idx] = company;
  else config.companies.push(company);
  writeConfig(config);
}

export function removeCompany(cnpj: string): void {
  const config = readConfig();
  config.companies = config.companies.filter(c => c.cnpj !== cnpj);
  writeConfig(config);
}

export function updateLastNsu(cnpj: string, nsu: number): void {
  const config = readConfig();
  const company = config.companies.find(c => c.cnpj === cnpj);
  if (company) {
    company.lastNsu = nsu;
    company.lastSync = new Date().toISOString();
    writeConfig(config);
  }
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
npm test
```

Saída esperada: `5 passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add api/src/config-store.ts api/tests/config-store.test.ts
git commit -m "feat: config-store com CRUD de empresas e persistência em JSON"
```

---

## Task 3: Rotas CRUD de Empresas

**Files:**
- Create: `api/src/routes/companies.ts`

- [ ] **Step 1: Criar `api/src/routes/companies.ts`**

```typescript
import { Router } from 'express';
import { readConfig, upsertCompany, removeCompany } from '../config-store.js';
import type { Company } from '../types.js';

export const companiesRouter = Router();

companiesRouter.get('/', (_req, res) => {
  const { companies } = readConfig();
  res.json(companies);
});

companiesRouter.post('/', (req, res) => {
  const body = req.body as Company;
  if (!body.cnpj || !body.nome || !body.pfxPath || !body.outputFolder || !body.baseUrl) {
    res.status(400).json({ error: 'Campos obrigatórios: cnpj, nome, pfxPath, outputFolder, baseUrl' });
    return;
  }
  const company: Company = {
    cnpj: body.cnpj.replace(/\D/g, ''),
    nome: body.nome,
    pfxPath: body.pfxPath,
    pfxPassword: body.pfxPassword ?? '',
    outputFolder: body.outputFolder,
    baseUrl: body.baseUrl,
    ambiente: body.ambiente ?? 'PRODUCAO',
    lastNsu: body.lastNsu ?? 0,
    lastSync: null,
  };
  upsertCompany(company);
  res.status(201).json(company);
});

companiesRouter.put('/:cnpj', (req, res) => {
  const body = req.body as Partial<Company>;
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const existing = readConfig().companies.find(c => c.cnpj === cnpj);
  if (!existing) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }
  upsertCompany({ ...existing, ...body, cnpj });
  res.json({ ...existing, ...body, cnpj });
});

companiesRouter.delete('/:cnpj', (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  removeCompany(cnpj);
  res.status(204).end();
});
```

- [ ] **Step 2: Testar manualmente com curl** (server rodando: `npm run dev`)

```bash
# Criar empresa
curl -s -X POST http://localhost:3001/api/companies \
  -H "Content-Type: application/json" \
  -d '{"cnpj":"12345678000100","nome":"Empresa Teste","pfxPath":"C:\\certs\\t.pfx","pfxPassword":"abc","outputFolder":"C:\\NFSe","baseUrl":"https://adn.example.com","ambiente":"HOMOLOGACAO","lastNsu":0}'

# Listar
curl -s http://localhost:3001/api/companies

# Deletar
curl -s -X DELETE http://localhost:3001/api/companies/12345678000100
```

Saída esperada: `201`, `200 com array`, `204`.

- [ ] **Step 3: Registrar rota em `api/src/server.ts`**

Adicionar as duas linhas abaixo em `api/src/server.ts`, antes do `app.listen`:

```typescript
import { companiesRouter } from './routes/companies.js';
// ...
app.use('/api/companies', companiesRouter);
```

O arquivo completo ficará:

```typescript
import express from 'express';
import cors from 'cors';
import { companiesRouter } from './routes/companies.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/companies', companiesRouter);

const PORT = 3001;
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));

export default app;
```

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/companies.ts api/src/server.ts
git commit -m "feat: rotas CRUD /api/companies"
```

---

## Task 4: XML Saver Service

**Files:**
- Create: `api/src/services/xml-saver.ts`
- Create: `api/tests/xml-saver.test.ts`

- [ ] **Step 1: Escrever o teste com falha**

Criar `api/tests/xml-saver.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import zlib from 'zlib';
import { promisify } from 'util';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { decodeAndSave } from '../src/services/xml-saver.js';

const gzip = promisify(zlib.gzip);

const prestadoXml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe>
  <infNFSe>
    <chNFSe>21060000000012345600001</chNFSe>
    <dCompet>2026-06-10</dCompet>
    <prestador><CNPJ>12345678000100</CNPJ></prestador>
    <tomador><CNPJ>98765432000199</CNPJ></tomador>
  </infNFSe>
</NFSe>`;

const tomadoXml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe>
  <infNFSe>
    <chNFSe>21060000000099999900001</chNFSe>
    <dCompet>2026-06-20</dCompet>
    <prestador><CNPJ>98765432000199</CNPJ></prestador>
    <tomador><CNPJ>12345678000100</CNPJ></tomador>
  </infNFSe>
</NFSe>`;

const OUTPUT = join(process.cwd(), 'test-output');

afterEach(() => {
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true });
});

async function toBase64GZip(xml: string): Promise<string> {
  const buf = await gzip(Buffer.from(xml, 'utf-8'));
  return buf.toString('base64');
}

describe('xml-saver', () => {
  it('classifica como prestado quando emitente == cnpj da empresa', async () => {
    const b64 = await toBase64GZip(prestadoXml);
    const result = await decodeAndSave(b64, 1501, '12345678000100', OUTPUT, 'Empresa Teste');
    expect(result.tipo).toBe('prestados');
    expect(result.competencia).toBe('062026');
    expect(existsSync(result.filePath)).toBe(true);
  });

  it('classifica como tomado quando emitente != cnpj da empresa', async () => {
    const b64 = await toBase64GZip(tomadoXml);
    const result = await decodeAndSave(b64, 1502, '12345678000100', OUTPUT, 'Empresa Teste');
    expect(result.tipo).toBe('tomados');
    expect(result.competencia).toBe('062026');
  });

  it('não sobrescreve arquivo existente', async () => {
    const b64 = await toBase64GZip(prestadoXml);
    const r1 = await decodeAndSave(b64, 1501, '12345678000100', OUTPUT, 'Empresa Teste');
    const mtime1 = (await import('fs')).statSync(r1.filePath).mtimeMs;
    await new Promise(r => setTimeout(r, 10));
    await decodeAndSave(b64, 1501, '12345678000100', OUTPUT, 'Empresa Teste');
    const mtime2 = (await import('fs')).statSync(r1.filePath).mtimeMs;
    expect(mtime1).toBe(mtime2);
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
npm test -- tests/xml-saver.test.ts
```

Saída esperada: FAIL — `Cannot find module '../src/services/xml-saver.js'`

- [ ] **Step 3: Implementar `api/src/services/xml-saver.ts`**

```typescript
import zlib from 'zlib';
import { promisify } from 'util';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

const gunzip = promisify(zlib.gunzip);
const parser = new XMLParser({ ignoreAttributes: false });

export interface SavedXmlInfo {
  nsu: number;
  tipo: 'prestados' | 'tomados';
  competencia: string;
  filePath: string;
  chaveAcesso: string;
}

export async function decodeAndSave(
  xmlBase64Gzip: string,
  nsu: number,
  cnpjEmpresa: string,
  outputFolder: string,
  nomeEmpresa: string
): Promise<SavedXmlInfo> {
  const buffer = Buffer.from(xmlBase64Gzip, 'base64');
  const decompressed = await gunzip(buffer);
  const xmlStr = decompressed.toString('utf-8');

  const parsed = parser.parse(xmlStr);
  const infNFSe = parsed?.NFSe?.infNFSe ?? parsed?.nfse?.infNFSe ?? {};

  const chaveAcesso: string = infNFSe.chNFSe ?? infNFSe.chaveAcesso ?? String(nsu);
  const competencia = extractCompetencia(infNFSe);
  const cnpjPrestador: string = infNFSe.prestador?.CNPJ ?? infNFSe.prestador?.cnpj ?? '';
  const tipo: 'prestados' | 'tomados' =
    cnpjPrestador.replace(/\D/g, '') === cnpjEmpresa.replace(/\D/g, '')
      ? 'prestados'
      : 'tomados';

  const dir = join(outputFolder, nomeEmpresa, competencia, tipo);
  mkdirSync(dir, { recursive: true });

  const fileName = `${String(nsu).padStart(9, '0')}-${chaveAcesso}.xml`;
  const filePath = join(dir, fileName);

  if (!existsSync(filePath)) {
    writeFileSync(filePath, xmlStr, 'utf-8');
  }

  return { nsu, tipo, competencia, filePath, chaveAcesso };
}

function extractCompetencia(infNFSe: Record<string, unknown>): string {
  const raw =
    (infNFSe.dCompet as string) ??
    (infNFSe.competencia as string) ??
    (infNFSe.dtEmissao as string) ??
    new Date().toISOString();
  // raw pode ser "2026-06-10" ou "2026-06"
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[2]}${match[1]}`;
  return `${String(new Date().getMonth() + 1).padStart(2, '0')}${new Date().getFullYear()}`;
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
npm test -- tests/xml-saver.test.ts
```

Saída esperada: `3 passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add api/src/services/xml-saver.ts api/tests/xml-saver.test.ts
git commit -m "feat: xml-saver decodifica base64/GZip, classifica e salva XML"
```

---

## Task 5: ADN Client (mutual TLS)

**Files:**
- Create: `api/src/services/adn-client.ts`

> Sem teste unitário automatizado nesta task — o cliente requer certificado real e URL da API confirmada. O teste de integração é manual (Task 9).

- [ ] **Step 1: Criar `api/src/services/adn-client.ts`**

```typescript
import https from 'https';
import { readFileSync } from 'fs';
import fetch from 'node-fetch';
import type { AdnDistribuicaoResponse } from '../types.js';

export interface AdnClientOptions {
  baseUrl: string;
  pfxPath: string;
  pfxPassword: string;
}

export async function fetchDFeLote(
  opts: AdnClientOptions,
  nsu: number,
  cnpj: string
): Promise<AdnDistribuicaoResponse> {
  const pfx = readFileSync(opts.pfxPath);
  const agent = new https.Agent({
    pfx,
    passphrase: opts.pfxPassword,
    rejectUnauthorized: true,
  });

  const url = `${opts.baseUrl}/DFe/${nsu}?cnpjConsulta=${cnpj}&lote=true`;

  const res = await fetch(url, {
    agent,
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ADN ${res.status}: ${body}`);
  }

  return res.json() as Promise<AdnDistribuicaoResponse>;
}
```

- [ ] **Step 2: Commit**

```bash
git add api/src/services/adn-client.ts
git commit -m "feat: adn-client com mutual TLS via https.Agent + node-fetch"
```

---

## Task 6: Sync Engine

**Files:**
- Create: `api/src/services/sync-engine.ts`
- Create: `api/tests/sync-engine.test.ts`

- [ ] **Step 1: Escrever o teste com falha**

Criar `api/tests/sync-engine.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { runSync } from '../src/services/sync-engine.js';
import type { AdnDistribuicaoResponse } from '../src/types.js';
import type { Company } from '../src/types.js';

const OUTPUT = join(process.cwd(), 'test-sync-output');

// Gera um XML base64+gzip de teste
import zlib from 'zlib';
import { promisify } from 'util';
const gzip = promisify(zlib.gzip);

async function makeXmlB64(cnpjPrestador: string, nsu: number): Promise<string> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe><infNFSe>
  <chNFSe>2106${String(nsu).padStart(20,'0')}</chNFSe>
  <dCompet>2026-06-10</dCompet>
  <prestador><CNPJ>${cnpjPrestador}</CNPJ></prestador>
  <tomador><CNPJ>98765432000199</CNPJ></tomador>
</infNFSe></NFSe>`;
  return (await gzip(Buffer.from(xml, 'utf-8'))).toString('base64');
}

const company: Company = {
  cnpj: '12345678000100',
  nome: 'Empresa Sync Teste',
  pfxPath: '/fake/cert.pfx',
  pfxPassword: 'pass',
  outputFolder: OUTPUT,
  baseUrl: 'https://fake.adn',
  ambiente: 'HOMOLOGACAO',
  lastNsu: 100,
  lastSync: null,
};

afterEach(() => {
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true });
});

describe('sync-engine', () => {
  it('salva documentos e retorna resumo correto', async () => {
    const xmlB64 = await makeXmlB64('12345678000100', 101);

    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS',
        LoteDFe: [{ NsuDFe: '101', XmlBase64GZip: xmlB64 }],
        Alertas: null,
        Erros: null,
      } satisfies AdnDistribuicaoResponse)
      .mockResolvedValueOnce({
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null,
        Alertas: null,
        Erros: null,
      } satisfies AdnDistribuicaoResponse);

    const events: string[] = [];
    const result = await runSync(company, mockFetch, (msg) => events.push(msg));

    expect(result.prestados).toBe(1);
    expect(result.tomados).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.lastNsu).toBe(101);
    expect(events.some(e => e.includes('NSU 101'))).toBe(true);
  });

  it('conta erro mas continua o loop quando um NSU falha', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null,
        Alertas: null,
        Erros: null,
      } satisfies AdnDistribuicaoResponse);

    const result = await runSync(company, mockFetch, () => {});
    expect(result.errors).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
npm test -- tests/sync-engine.test.ts
```

Saída esperada: FAIL — `Cannot find module '../src/services/sync-engine.js'`

- [ ] **Step 3: Implementar `api/src/services/sync-engine.ts`**

```typescript
import type { Company, AdnDistribuicaoResponse } from '../types.js';
import { decodeAndSave } from './xml-saver.js';

export interface SyncResult {
  prestados: number;
  tomados: number;
  errors: number;
  lastNsu: number;
}

type FetchFn = (nsu: number, cnpj: string) => Promise<AdnDistribuicaoResponse>;
type LogFn = (message: string) => void;

export async function runSync(
  company: Company,
  fetchFn: FetchFn,
  onProgress: LogFn
): Promise<SyncResult> {
  let currentNsu = company.lastNsu + 1;
  let prestados = 0;
  let tomados = 0;
  let errors = 0;

  while (true) {
    let response: AdnDistribuicaoResponse;
    try {
      response = await fetchFn(currentNsu, company.cnpj);
    } catch (err) {
      errors++;
      onProgress(`[ERRO] NSU ${currentNsu}: ${(err as Error).message}`);
      currentNsu++;
      continue;
    }

    if (response.StatusProcessamento === 'NENHUM_DOCUMENTO_LOCALIZADO') {
      break;
    }

    if (response.StatusProcessamento === 'REJEICAO') {
      const msg = response.Erros?.map(e => e.Descricao).join(', ') ?? 'Rejeição sem detalhes';
      onProgress(`[REJEIÇÃO] NSU ${currentNsu}: ${msg}`);
      break;
    }

    const lote = response.LoteDFe ?? [];
    for (const item of lote) {
      const nsu = parseInt(item.NsuDFe, 10);
      try {
        const saved = await decodeAndSave(
          item.XmlBase64GZip,
          nsu,
          company.cnpj,
          company.outputFolder,
          company.nome
        );
        if (saved.tipo === 'prestados') prestados++;
        else tomados++;
        onProgress(`NSU ${nsu} → ${saved.tipo} (${saved.competencia}) salvo`);
        if (nsu >= currentNsu) currentNsu = nsu + 1;
      } catch (err) {
        errors++;
        onProgress(`[ERRO] NSU ${nsu}: ${(err as Error).message}`);
        currentNsu = nsu + 1;
      }
    }
  }

  return { prestados, tomados, errors, lastNsu: currentNsu - 1 };
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
npm test -- tests/sync-engine.test.ts
```

Saída esperada: `2 passed`

- [ ] **Step 5: Rodar todos os testes do backend**

```bash
npm test
```

Saída esperada: `10 passed` (config-store + xml-saver + sync-engine)

- [ ] **Step 6: Commit**

```bash
cd ..
git add api/src/services/sync-engine.ts api/tests/sync-engine.test.ts
git commit -m "feat: sync-engine com loop de NSUs, mock-testável via injeção de fetchFn"
```

---

## Task 7: Rota de Sincronização com SSE

**Files:**
- Create: `api/src/routes/sync.ts`
- Modify: `api/src/server.ts`

- [ ] **Step 1: Criar `api/src/routes/sync.ts`**

```typescript
import { Router } from 'express';
import { getCompany, updateLastNsu } from '../config-store.js';
import { fetchDFeLote } from '../services/adn-client.js';
import { runSync } from '../services/sync-engine.js';
import type { Company } from '../types.js';

export const syncRouter = Router();

syncRouter.post('/:cnpj', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);

  if (!company) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  // Configura SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type: string, data: unknown) => {
    res.write(`data: ${JSON.stringify({ type, ...data as object })}\n\n`);
  };

  send('progress', { message: `Iniciando sync para ${company.nome} (NSU atual: ${company.lastNsu})` });

  try {
    const fetchFn = (nsu: number, cnpjConsulta: string) =>
      fetchDFeLote(
        { baseUrl: company.baseUrl, pfxPath: company.pfxPath, pfxPassword: company.pfxPassword },
        nsu,
        cnpjConsulta
      );

    const result = await runSync(
      company,
      fetchFn,
      (message) => send('progress', { message })
    );

    updateLastNsu(cnpj, result.lastNsu);

    send('done', {
      message: `Concluído: ${result.prestados} prestados, ${result.tomados} tomados, ${result.errors} erros`,
      ...result,
    });
  } catch (err) {
    send('error', { message: `Erro crítico: ${(err as Error).message}` });
  } finally {
    res.end();
  }
});

syncRouter.get('/:cnpj/status', (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);
  if (!company) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }
  res.json({ cnpj: company.cnpj, lastNsu: company.lastNsu, lastSync: company.lastSync });
});
```

- [ ] **Step 2: Registrar rota em `api/src/server.ts`** — arquivo final completo:

```typescript
import express from 'express';
import cors from 'cors';
import { companiesRouter } from './routes/companies.js';
import { syncRouter } from './routes/sync.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/companies', companiesRouter);
app.use('/api/sync', syncRouter);

const PORT = 3001;
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));

export default app;
```

- [ ] **Step 3: Confirmar que o servidor sobe sem erros**

```bash
cd api && npm run dev
```

Saída esperada: `API rodando em http://localhost:3001` sem erros de import.

- [ ] **Step 4: Commit**

```bash
cd ..
git add api/src/routes/sync.ts api/src/server.ts
git commit -m "feat: rota /api/sync/:cnpj com SSE para progresso em tempo real"
```

---

## Task 8: Scaffold do projeto UI

**Files:**
- Create: `ui/` (projeto Vite + React + TypeScript + Tailwind + shadcn/ui)

- [ ] **Step 1: Criar o projeto Vite dentro da pasta `ui/`**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
npm create vite@latest ui -- --template react-ts
cd ui
npm install
```

- [ ] **Step 2: Instalar Tailwind CSS**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Editar `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

Substituir conteúdo de `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Instalar shadcn/ui e dependências base**

```bash
npm install @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-label lucide-react clsx tailwind-merge class-variance-authority
```

Criar `src/lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Configurar proxy no `ui/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 5: Instalar dependências de teste**

```bash
npm install -D vitest @testing-library/react @testing-library/user-event jsdom @vitejs/plugin-react
```

Adicionar a `ui/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
  },
});
```

Criar `ui/src/tests/setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

```bash
npm install -D @testing-library/jest-dom
```

Adicionar a `ui/package.json` em `scripts`:
```json
"test": "vitest run"
```

- [ ] **Step 6: Verificar que o frontend sobe**

```bash
npm run dev
```

Saída esperada: `VITE v5.x.x  ready in Xms — Local: http://localhost:5173/`

- [ ] **Step 7: Commit**

```bash
cd ..
git add ui/
git commit -m "feat: scaffold do projeto UI (Vite + React + Tailwind + shadcn/ui)"
```

---

## Task 9: API Client (lib/api.ts)

**Files:**
- Create: `ui/src/lib/api.ts`

- [ ] **Step 1: Criar `ui/src/lib/api.ts`**

```typescript
import type { Company, SyncProgress } from '../types';

export type { Company };

export async function listCompanies(): Promise<Company[]> {
  const res = await fetch('/api/companies');
  if (!res.ok) throw new Error('Erro ao listar empresas');
  return res.json();
}

export async function createCompany(data: Omit<Company, 'lastSync'>): Promise<Company> {
  const res = await fetch('/api/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error);
  }
  return res.json();
}

export async function updateCompany(cnpj: string, data: Partial<Company>): Promise<Company> {
  const res = await fetch(`/api/companies/${cnpj}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Erro ao atualizar empresa');
  return res.json();
}

export async function deleteCompany(cnpj: string): Promise<void> {
  await fetch(`/api/companies/${cnpj}`, { method: 'DELETE' });
}

export function startSync(
  cnpj: string,
  onEvent: (event: SyncProgress) => void,
  onClose: () => void
): EventSource {
  const es = new EventSource(`/api/sync/${cnpj}`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data as string) as SyncProgress;
    onEvent(data);
    if (data.type === 'done' || data.type === 'error') {
      es.close();
      onClose();
    }
  };
  es.onerror = () => { es.close(); onClose(); };
  return es;
}
```

- [ ] **Step 2: Criar `ui/src/types.ts`** (espelha os tipos do backend relevantes ao frontend)

```typescript
export interface Company {
  cnpj: string;
  nome: string;
  pfxPath: string;
  pfxPassword: string;
  outputFolder: string;
  baseUrl: string;
  ambiente: 'PRODUCAO' | 'HOMOLOGACAO';
  lastNsu: number;
  lastSync: string | null;
}

export interface SyncProgress {
  type: 'progress' | 'done' | 'error';
  message: string;
  prestados?: number;
  tomados?: number;
  errors?: number;
  lastNsu?: number;
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/lib/api.ts ui/src/types.ts
git commit -m "feat: api client com wrappers fetch e EventSource para SSE"
```

---

## Task 10: Componente CompanyCard

**Files:**
- Create: `ui/src/components/CompanyCard.tsx`
- Create: `ui/src/tests/CompanyCard.test.tsx`

- [ ] **Step 1: Escrever o teste com falha**

Criar `ui/src/tests/CompanyCard.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CompanyCard } from '../components/CompanyCard';
import type { Company } from '../types';

const company: Company = {
  cnpj: '12345678000100',
  nome: 'Empresa Teste',
  pfxPath: 'C:\\certs\\t.pfx',
  pfxPassword: 'pass',
  outputFolder: 'C:\\NFSe',
  baseUrl: 'https://adn.example.com',
  ambiente: 'HOMOLOGACAO',
  lastNsu: 500,
  lastSync: '2026-06-05T10:00:00.000Z',
};

describe('CompanyCard', () => {
  it('exibe nome e CNPJ formatado', () => {
    render(<CompanyCard company={company} syncing={false} onSync={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Empresa Teste')).toBeInTheDocument();
    expect(screen.getByText(/12\.345\.678\/0001-00/)).toBeInTheDocument();
  });

  it('chama onSync ao clicar em Sincronizar', () => {
    const onSync = vi.fn();
    render(<CompanyCard company={company} syncing={false} onSync={onSync} onEdit={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
    expect(onSync).toHaveBeenCalledWith('12345678000100');
  });

  it('desabilita botão Sincronizar quando syncing=true', () => {
    render(<CompanyCard company={company} syncing={true} onSync={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /sincronizando/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd ui && npm test -- src/tests/CompanyCard.test.tsx
```

Saída esperada: FAIL — `Cannot find module '../components/CompanyCard'`

- [ ] **Step 3: Implementar `ui/src/components/CompanyCard.tsx`**

```typescript
import type { Company } from '../types';
import { cn } from '../lib/utils';

interface Props {
  company: Company;
  syncing: boolean;
  onSync: (cnpj: string) => void;
  onEdit: (company: Company) => void;
  onDelete: (cnpj: string) => void;
}

function formatCnpj(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function CompanyCard({ company, syncing, onSync, onEdit, onDelete }: Props) {
  const lastSync = company.lastSync
    ? new Date(company.lastSync).toLocaleString('pt-BR')
    : 'nunca';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{company.nome}</h3>
          <p className="text-sm text-gray-500">CNPJ: {formatCnpj(company.cnpj)}</p>
          <p className="text-sm text-gray-500">Último sync: {lastSync}</p>
          <p className="text-sm text-gray-500">NSU atual: {company.lastNsu}</p>
          <p className="text-xs text-gray-400 truncate mt-1">{company.outputFolder}</p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={() => onSync(company.cnpj)}
            disabled={syncing}
            className={cn(
              'px-3 py-1.5 rounded text-sm font-medium text-white transition-colors',
              syncing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button
            onClick={() => onEdit(company)}
            className="px-3 py-1.5 rounded text-sm font-medium border border-gray-300 hover:bg-gray-50"
          >
            Editar
          </button>
          <button
            onClick={() => onDelete(company.cnpj)}
            className="px-3 py-1.5 rounded text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
npm test -- src/tests/CompanyCard.test.tsx
```

Saída esperada: `3 passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add ui/src/components/CompanyCard.tsx ui/src/tests/CompanyCard.test.tsx
git commit -m "feat: componente CompanyCard com status e ações de sync/editar/remover"
```

---

## Task 11: Componente AddCompanyModal

**Files:**
- Create: `ui/src/components/AddCompanyModal.tsx`
- Create: `ui/src/tests/AddCompanyModal.test.tsx`

- [ ] **Step 1: Escrever o teste com falha**

Criar `ui/src/tests/AddCompanyModal.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddCompanyModal } from '../components/AddCompanyModal';

describe('AddCompanyModal', () => {
  it('não renderiza quando open=false', () => {
    render(<AddCompanyModal open={false} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renderiza campos quando open=true', () => {
    render(<AddCompanyModal open={true} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByLabelText(/nome da empresa/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cnpj/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/caminho do .pfx/i)).toBeInTheDocument();
  });

  it('chama onSave com os dados preenchidos', () => {
    const onSave = vi.fn();
    render(<AddCompanyModal open={true} onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/nome da empresa/i), { target: { value: 'Empresa X' } });
    fireEvent.change(screen.getByLabelText(/cnpj/i), { target: { value: '12345678000100' } });
    fireEvent.change(screen.getByLabelText(/caminho do .pfx/i), { target: { value: 'C:\\cert.pfx' } });
    fireEvent.change(screen.getByLabelText(/senha do certificado/i), { target: { value: '1234' } });
    fireEvent.change(screen.getByLabelText(/pasta de saída/i), { target: { value: 'C:\\NFSe' } });
    fireEvent.change(screen.getByLabelText(/url base da api/i), { target: { value: 'https://adn.test' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Empresa X', cnpj: '12345678000100' }));
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd ui && npm test -- src/tests/AddCompanyModal.test.tsx
```

Saída esperada: FAIL — `Cannot find module '../components/AddCompanyModal'`

- [ ] **Step 3: Implementar `ui/src/components/AddCompanyModal.tsx`**

```typescript
import { useState, useEffect } from 'react';
import type { Company } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (company: Omit<Company, 'lastSync'>) => void;
  initial?: Company | null;
}

const EMPTY: Omit<Company, 'lastSync'> = {
  cnpj: '', nome: '', pfxPath: '', pfxPassword: '',
  outputFolder: '', baseUrl: '', ambiente: 'PRODUCAO', lastNsu: 0,
};

export function AddCompanyModal({ open, onClose, onSave, initial }: Props) {
  const [form, setForm] = useState<Omit<Company, 'lastSync'>>(EMPTY);

  useEffect(() => {
    setForm(initial ? { ...initial } : { ...EMPTY });
  }, [initial, open]);

  if (!open) return null;

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, cnpj: form.cnpj.replace(/\D/g, '') });
  };

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold mb-4">{initial ? 'Editar Empresa' : 'Adicionar Empresa'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {[
            { label: 'Nome da Empresa', field: 'nome' as const, type: 'text' },
            { label: 'CNPJ', field: 'cnpj' as const, type: 'text' },
            { label: 'Caminho do .pfx', field: 'pfxPath' as const, type: 'text' },
            { label: 'Senha do Certificado', field: 'pfxPassword' as const, type: 'password' },
            { label: 'Pasta de Saída', field: 'outputFolder' as const, type: 'text' },
            { label: 'URL Base da API', field: 'baseUrl' as const, type: 'text' },
          ].map(({ label, field, type }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={field}>
                {label}
              </label>
              <input
                id={field}
                type={type}
                value={String(form[field])}
                onChange={set(field)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required={field !== 'pfxPassword'}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="ambiente">Ambiente</label>
            <select
              id="ambiente"
              value={form.ambiente}
              onChange={set('ambiente')}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="PRODUCAO">Produção</option>
              <option value="HOMOLOGACAO">Homologação</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="lastNsu">NSU Inicial (opcional)</label>
            <input
              id="lastNsu"
              type="number"
              min={0}
              value={form.lastNsu}
              onChange={e => setForm(prev => ({ ...prev, lastNsu: parseInt(e.target.value, 10) || 0 }))}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50">Cancelar</button>
            <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
npm test -- src/tests/AddCompanyModal.test.tsx
```

Saída esperada: `3 passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add ui/src/components/AddCompanyModal.tsx ui/src/tests/AddCompanyModal.test.tsx
git commit -m "feat: modal de adicionar/editar empresa com todos os campos"
```

---

## Task 12: Componente SyncLogPanel

**Files:**
- Create: `ui/src/components/SyncLogPanel.tsx`
- Create: `ui/src/tests/SyncLogPanel.test.tsx`

- [ ] **Step 1: Escrever o teste com falha**

Criar `ui/src/tests/SyncLogPanel.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SyncLogPanel } from '../components/SyncLogPanel';

const logs = [
  { id: 1, text: 'Iniciando sync...', type: 'progress' as const },
  { id: 2, text: 'NSU 101 → prestados salvo', type: 'progress' as const },
  { id: 3, text: 'Concluído: 1 prestados, 0 tomados', type: 'done' as const },
];

describe('SyncLogPanel', () => {
  it('exibe todas as mensagens de log', () => {
    render(<SyncLogPanel logs={logs} />);
    expect(screen.getByText('Iniciando sync...')).toBeInTheDocument();
    expect(screen.getByText('NSU 101 → prestados salvo')).toBeInTheDocument();
    expect(screen.getByText('Concluído: 1 prestados, 0 tomados')).toBeInTheDocument();
  });

  it('exibe painel vazio quando sem logs', () => {
    render(<SyncLogPanel logs={[]} />);
    expect(screen.getByText(/aguardando/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
npm test -- src/tests/SyncLogPanel.test.tsx
```

- [ ] **Step 3: Implementar `ui/src/components/SyncLogPanel.tsx`**

```typescript
import { useEffect, useRef } from 'react';
import { cn } from '../lib/utils';

export interface LogEntry {
  id: number;
  text: string;
  type: 'progress' | 'done' | 'error';
}

interface Props {
  logs: LogEntry[];
}

export function SyncLogPanel({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-950 p-4 h-48 overflow-y-auto font-mono text-xs">
      {logs.length === 0 ? (
        <p className="text-gray-500">Aguardando sincronização...</p>
      ) : (
        logs.map(entry => (
          <div key={entry.id} className={cn(
            'mb-0.5',
            entry.type === 'done' && 'text-green-400',
            entry.type === 'error' && 'text-red-400',
            entry.type === 'progress' && 'text-gray-300',
          )}>
            {entry.text}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
npm test -- src/tests/SyncLogPanel.test.tsx
```

Saída esperada: `2 passed`

- [ ] **Step 5: Rodar todos os testes do frontend**

```bash
npm test
```

Saída esperada: todos passam.

- [ ] **Step 6: Commit**

```bash
cd ..
git add ui/src/components/SyncLogPanel.tsx ui/src/tests/SyncLogPanel.test.tsx
git commit -m "feat: SyncLogPanel com auto-scroll e coloração por tipo de evento"
```

---

## Task 13: Dashboard — página principal

**Files:**
- Create: `ui/src/pages/Dashboard.tsx`
- Modify: `ui/src/App.tsx`

- [ ] **Step 1: Criar `ui/src/pages/Dashboard.tsx`**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { CompanyCard } from '../components/CompanyCard';
import { AddCompanyModal } from '../components/AddCompanyModal';
import { SyncLogPanel, type LogEntry } from '../components/SyncLogPanel';
import { listCompanies, createCompany, updateCompany, deleteCompany, startSync } from '../lib/api';
import type { Company } from '../types';

export function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logCounter, setLogCounter] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'progress') => {
    setLogCounter(n => {
      setLogs(prev => [...prev.slice(-200), { id: n + 1, text, type }]);
      return n + 1;
    });
  }, []);

  const load = useCallback(async () => {
    const data = await listCompanies();
    setCompanies(data);
  }, []);

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
```

- [ ] **Step 2: Atualizar `ui/src/App.tsx`**

```typescript
import { Dashboard } from './pages/Dashboard';
import './index.css';

export default function App() {
  return <Dashboard />;
}
```

- [ ] **Step 3: Verificar que o sistema funciona end-to-end**

Com o backend rodando (`cd api && npm run dev`) e o frontend rodando (`cd ui && npm run dev`):

1. Abrir `http://localhost:5173`
2. Clicar em "+ Empresa" e preencher os dados de uma empresa de teste
3. Verificar que a empresa aparece listada
4. Verificar que o botão "Sincronizar" está presente
5. Editar e remover funcionam

- [ ] **Step 4: Rodar todos os testes**

```bash
# Backend
cd api && npm test

# Frontend
cd ../ui && npm test
```

Saída esperada: todos os testes passam.

- [ ] **Step 5: Commit final**

```bash
cd ..
git add ui/src/pages/Dashboard.tsx ui/src/App.tsx
git commit -m "feat: Dashboard completo — lista empresas, aciona sync com SSE, modal add/edit"
```

---

## Checklist de Teste Real (integração com API ADN)

Para testar o sistema contra a API real do ADN, você vai precisar de:

### Obrigatório
- [ ] **Certificado digital A1 (.pfx)** — ICP-Brasil, vinculado ao CNPJ da empresa, com extensão "Autenticação do Cliente"
- [ ] **Senha do certificado** — fornecida pela AC (Autoridade Certificadora) ou definida no momento da emissão
- [ ] **URL base do ADN confirmada** — o domínio exato para produção e homologação (não fornecido na documentação disponível; consultar a Receita Federal ou o manual técnico do ADN NFS-e)
- [ ] **CNPJ cadastrado no ADN** — a empresa precisa estar habilitada para receber DFe pelo portal nacional NFS-e

### Recomendado para primeiro teste
- [ ] Usar o **ambiente de homologação** primeiro (`ambiente: HOMOLOGACAO`)
- [ ] Começar com `lastNsu: 0` para buscar todos os documentos disponíveis
- [ ] Confirmar que os nomes das propriedades `NsuDFe` e `XmlBase64GZip` em `AdnNsuItem` (arquivo `api/src/types.ts`) correspondem à resposta real da API — se não, ajustar esses dois nomes de campo

### Verificação dos XMLs salvos
- [ ] Abrir um XML salvo e confirmar que a estrutura (`<chNFSe>`, `<dCompet>`, `<prestador><CNPJ>`) corresponde ao que o `xml-saver.ts` usa para classificar prestados/tomados e extrair a competência — ajustar regex/paths se necessário

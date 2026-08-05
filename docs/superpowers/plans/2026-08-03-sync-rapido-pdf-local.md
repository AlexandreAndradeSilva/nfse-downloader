# Sync Rápido XML + DANFSe Local NT 008 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync de NFS-e baixa só XMLs (rápido, com seleção prestados/tomados e índice NSU local); PDFs DANFSe gerados sob demanda, localmente, no layout oficial NT 008/2026; evento de substituição tratado como cancelamento; correção da pasta mojibake.

**Architecture:** Monorepo `api/` (Express + TS, porta 3002) + `ui/` (React/Vite, vira extensão Chrome). Fase 0 retro-porta o compilado de produção (`c:\nfs\api\dist\*.js` — fonte da verdade, legível) para `api/src`. Fases seguintes implementam as features no fonte com TDD. Deploy final copia builds para `c:\nfs`.

**Tech Stack:** Node 20+, Express 5, fast-xml-parser, Puppeteer (instância única + pool de páginas), `qrcode` (novo), ExcelJS, pdf-lib, React 18, Vite, vitest.

**Spec:** `docs/superpowers/specs/2026-08-03-sync-rapido-pdf-local-design.md`

**Convenções deste plano:**
- Todos os caminhos são relativos à raiz do repo (`c:\nfs\repo`), salvo `c:\nfs\...` (instalação de produção).
- "Portar de dist" = ler o arquivo JS indicado em `c:\nfs\api\dist\` e traduzi-lo para TypeScript idiomático do projeto (tipos explícitos, imports `.js`, `strict` habilitado). O JS compilado é limpo (saída de tsc) — a tradução é mecânica.
- Rodar testes da API: `cd api && npm test` (vitest). UI: `cd ui && npm test`.
- Commits sempre com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Fase 0 — Retro-port do compilado (base honesta)

### Task 1: Preparar dependências e tipos

**Files:**
- Modify: `api/package.json`
- Modify: `api/src/types.ts`

- [ ] **Step 1: Instalar dependências novas da API**

```bash
cd api
npm install exceljs@^4.4.0 pdf-lib@^1.17.1 qrcode@^1.5.4
npm install -D @types/qrcode@^1.5.5
```

(`exceljs`/`pdf-lib` já existem em produção mas não no `package.json` do repo — conferir e adicionar se ausentes.)

- [ ] **Step 2: Estender `api/src/types.ts`**

Adicionar ao final (manter o conteúdo atual):

```ts
export type TipoNota = 'prestados' | 'tomados';
export type TipoDoc = TipoNota | 'eventos';
export type EventoTipo = 'cancelamento' | 'substituicao' | 'outro';
export type Situacao = 'ativa' | 'cancelada' | 'substituida';
```

- [ ] **Step 3: Compilar para garantir que nada quebrou**

Run: `cd api && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add api/package.json api/package-lock.json api/src/types.ts
git commit -m "chore(api): deps exceljs/pdf-lib/qrcode e tipos compartilhados"
```

### Task 2: Retro-port dos services

**Files:**
- Modify: `api/src/services/adn-client.ts` ← portar de `c:\nfs\api\dist\services\adn-client.js`
- Modify: `api/src/services/xml-reader.ts` ← portar de `c:\nfs\api\dist\services\xml-reader.js`
- Modify: `api/src/services/cert-scanner.ts` ← portar de `c:\nfs\api\dist\services\cert-scanner.js`
- Modify: `api/src/services/danfse-generator.ts` ← portar de `c:\nfs\api\dist\services\danfse-generator.js`
- Modify: `api/src/services/danfse-template.ts` ← portar de `c:\nfs\api\dist\services\danfse-template.js`
- Modify: `api/src/config-store.ts` ← portar de `c:\nfs\api\dist\config-store.js`
- Copy: `c:\nfs\api\dist\assets\nfse-logo.b64` → `api/src/assets/nfse-logo.b64` (conferir se já existe no repo)

**Portar `danfse-downloader.js` COM circuit breaker** (ver Task 2b). O endpoint `https://adn.nfse.gov.br/danfse/{chave}` é o DANFSe oficial do ADN NFS-e e permanece no código; hoje responde 503 consistentemente (NT 008/2026 descontinuou a API de geração do DANFSe), por isso a tentativa precisa ser barata e desligar-se sozinha. Onde o dist chama `downloadDanfsePdf(...)` dentro do fluxo de **sync**, remover (PDF sai do sync — Task 6); a tentativa oficial passa a viver só no fluxo de geração de PDFs (Task 11).

- [ ] **Step 1: Portar `adn-client.ts`** — o dist adiciona cache de `https.Agent` com `keepAlive` (função `getCachedAgent`). Manter a assinatura `fetchDFeLote(opts, nsu, cnpj)` e o `cnpjLimpo = cnpj.replace(/\D/g, '')`.

- [ ] **Step 2: Portar `xml-reader.ts`** — o dist adiciona `buildCancelledIndex(outputFolder, nomeEmpresa): Set<string>` e a contagem de `eventos` em `readCompanyStats`. Tipar retorno como `Set<string>`.

- [ ] **Step 3: Portar `cert-scanner.ts`** — o dist adiciona `pickCertificateFromStore()`, `exportCertByThumbprint()`, `openFolderDialog()` e a exportação TripleDES para `%APPDATA%\nfse-downloader\certs`. Portar integralmente.

- [ ] **Step 4: Portar `danfse-generator.ts` + `danfse-template.ts`** — o dist adiciona o parâmetro `cancelada` (carimbo), o logo base64 e campos extras em `extractDanfseData` (emitSimplesNac, regEspTrib, vCP etc.). Portar fielmente por enquanto (o layout NT 008 entra na Task 10).

- [ ] **Step 5: Portar `config-store.ts`** — diffs mínimos (conferir `removeCompany`, `updateLastNsu`).

- [ ] **Step 6: Compilar e rodar testes existentes**

Run: `cd api && npx tsc --noEmit && npm test`
Expected: `config-store.test.ts`, `xml-reader.test.ts` e `danfse-generator.test.ts` podem falhar se as assinaturas mudaram — ajustar os testes ao comportamento portado (ex.: `generateDanfse(xml, cancelada?)`). `xml-saver`/`sync-engine` ainda não mudaram nesta task.

- [ ] **Step 7: Commit**

```bash
git add api/src api/tests
git commit -m "feat(api): retro-port dos services do build de producao (sem API DANFSe morta)"
```

### Task 2b: `danfse-downloader` com circuit breaker

**Files:**
- Modify: `api/src/services/danfse-downloader.ts` ← portar de `c:\nfs\api\dist\services\danfse-downloader.js`
- Test: `api/tests/danfse-downloader.test.ts` (novo)

Comportamento medido em 03/08/2026 com certificado real: `GET https://adn.nfse.gov.br/danfse/{chave}` → HTTP 503 `No server is available to handle this request` em 100% das tentativas, enquanto `sefin.nfse.gov.br/sefinnacional/nfse/{chave}` (mesmo mTLS) responde 200. A rota oficial fica no código, mas **não pode custar 52 s por nota**.

- [ ] **Step 1: Testes (falhando)**

```ts
// api/tests/danfse-downloader.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadDanfsePdf, resetDanfseBreaker, isDanfseBreakerOpen } from '../src/services/danfse-downloader.js';

const CHAVE = '5'.repeat(50);
beforeEach(() => resetDanfseBreaker());

it('retorna o PDF quando o ADN responde 200', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4 conteudo').buffer,
  });
  const buf = await downloadDanfsePdf(CHAVE, '', '', fetchImpl as never);
  expect(buf!.subarray(0, 4).toString('latin1')).toBe('%PDF');
});

it('uma única tentativa por chamada (sem escada de retries)', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '' });
  const buf = await downloadDanfsePdf(CHAVE, '', '', fetchImpl as never);
  expect(buf).toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('abre o breaker após 3 falhas consecutivas e para de chamar a rede', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => '' });
  for (let i = 0; i < 3; i++) await downloadDanfsePdf(CHAVE, '', '', fetchImpl as never);
  expect(isDanfseBreakerOpen()).toBe(true);
  await downloadDanfsePdf(CHAVE, '', '', fetchImpl as never);
  expect(fetchImpl).toHaveBeenCalledTimes(3);   // 4ª chamada não foi à rede
});

it('sucesso zera o contador de falhas', async () => {
  const fail = { ok: false, status: 503, text: async () => '' };
  const okRes = { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4').buffer };
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(fail).mockResolvedValueOnce(fail)
    .mockResolvedValueOnce(okRes).mockResolvedValueOnce(fail);
  for (let i = 0; i < 4; i++) await downloadDanfsePdf(CHAVE, '', '', fetchImpl as never);
  expect(isDanfseBreakerOpen()).toBe(false);    // sucesso no meio resetou
});
```

- [ ] **Step 2: Ver falhar** — `cd api && npx vitest run tests/danfse-downloader.test.ts`

- [ ] **Step 3: Implementar**

```ts
// api/src/services/danfse-downloader.ts
import https from 'https';
import { readFileSync } from 'fs';
import nodeFetch from 'node-fetch';

const DANFSE_BASE_URL = 'https://adn.nfse.gov.br/danfse';
const TIMEOUT_MS = 5000;
const MAX_FALHAS_CONSECUTIVAS = 3;

let falhasConsecutivas = 0;
let breakerAberto = false;

export function resetDanfseBreaker(): void { falhasConsecutivas = 0; breakerAberto = false; }
export function isDanfseBreakerOpen(): boolean { return breakerAberto; }

const agentCache = new Map<string, https.Agent>();
function getCachedAgent(pfxPath: string, pfxPassword: string): https.Agent | undefined {
  if (!pfxPath) return undefined;                      // testes
  const key = `${pfxPath}::${pfxPassword}`;
  if (!agentCache.has(key)) {
    agentCache.set(key, new https.Agent({
      pfx: readFileSync(pfxPath), passphrase: pfxPassword,
      rejectUnauthorized: true, keepAlive: true,
    }));
  }
  return agentCache.get(key);
}

/**
 * Baixa o DANFSe oficial do ADN NFS-e (mTLS com certificado do contribuinte).
 *
 * Uma tentativa por chamada, timeout curto. Após MAX_FALHAS_CONSECUTIVAS falhas,
 * o breaker abre e as chamadas seguintes retornam null sem tocar a rede — o chamador
 * cai no gerador local. Um sucesso reabilita.
 *
 * Retorna null em qualquer falha (nunca lança) — o PDF oficial é um bônus, não um requisito.
 */
export async function downloadDanfsePdf(
  chaveAcesso: string,
  pfxPath: string,
  pfxPassword: string,
  fetchImpl: typeof nodeFetch = nodeFetch,
): Promise<Buffer | null> {
  if (breakerAberto) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${DANFSE_BASE_URL}/${chaveAcesso}`, {
      agent: getCachedAgent(pfxPath, pfxPassword),
      headers: { Accept: 'application/pdf' },
      signal: controller.signal as never,
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      falhasConsecutivas = 0;
      return buf;
    }
    registrarFalha(`HTTP ${res.status}`);
    return null;
  } catch (err) {
    registrarFalha((err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function registrarFalha(motivo: string): void {
  falhasConsecutivas++;
  if (falhasConsecutivas >= MAX_FALHAS_CONSECUTIVAS && !breakerAberto) {
    breakerAberto = true;
    console.warn(`[DANFSe] ADN indisponível (${motivo}) após ${MAX_FALHAS_CONSECUTIVAS} tentativas — usando gerador local no restante desta execução.`);
  }
}
```

- [ ] **Step 4: Ver passar** — `npx vitest run tests/danfse-downloader.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/danfse-downloader.ts api/tests/danfse-downloader.test.ts
git commit -m "feat(api): DANFSe oficial do ADN com circuit breaker e timeout curto"
```

### Task 3: Retro-port de xml-saver + sync-engine (comportamento de produção)

**Files:**
- Modify: `api/src/services/xml-saver.ts` ← portar de `c:\nfs\api\dist\services\xml-saver.js`
- Modify: `api/src/services/sync-engine.ts` ← portar de `c:\nfs\api\dist\services\sync-engine.js`
- Test: `api/tests/xml-saver.test.ts`, `api/tests/sync-engine.test.ts`

- [ ] **Step 1: Portar `xml-saver.ts`** integral: nomes `NFS {nNFSe}.xml`, eventos (`decodeAndSaveEvento`, `moveCancelledNote`), `importRawXml`, `extractTagValue`. **Excluir**: parâmetro `pfxInfo` e chamadas a `downloadDanfsePdf` (gerar PDF só via `generateDanfse` quando `gerarPdf=true` — este parâmetro ainda existe nesta fase e morre na Task 6).

- [ ] **Step 2: Portar `sync-engine.ts`** integral: `LOTE_CONCURRENCY=4` com `Promise.allSettled`, contadores `eventos`, `MAX_CONSECUTIVE_ERRORS=10`, `options.startNsu`. Excluir `pfxInfo`.

- [ ] **Step 3: Atualizar os testes existentes ao novo comportamento**

Em `api/tests/xml-saver.test.ts`, os asserts de nome de arquivo mudam do padrão `{nsu}-{chave}.xml` para `NFS {nNFSe}.xml`:

```ts
// antes: expect(existsSync(join(OUTPUT, 'Empresa', '062026', 'prestados', '000000101-....xml')))
// depois (o XML de teste tem <nNFSe>1</nNFSe>):
expect(existsSync(join(OUTPUT, 'Empresa Teste', '062026', 'prestados', 'NFS 1.xml'))).toBe(true);
```

Em `api/tests/sync-engine.test.ts`, `result.lastNsu` e contadores não mudam; adicionar `eventos: 0` onde o resumo é conferido, se aplicável.

- [ ] **Step 4: Rodar testes**

Run: `cd api && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src api/tests
git commit -m "feat(api): retro-port xml-saver (eventos, import) e sync-engine (lotes paralelos)"
```

### Task 4: Retro-port das rotas + server

**Files:**
- Modify: `api/src/routes/sync.ts` ← portar de `c:\nfs\api\dist\routes\sync.js` (resolvePfxPath, startNsu=1 com filtro, preservação do lastNsu)
- Modify: `api/src/routes/notes.ts` ← portar de `c:\nfs\api\dist\routes\notes.js` (listagem com canceladas + `POST /import`; **NÃO portar** `GET /regenerar-pdfs` — será substituída pela `gerar-pdfs` na Task 11)
- Modify: `api/src/routes/reports.ts` ← portar de `c:\nfs\api\dist\routes\reports.js` (situação, colunas, pdf-merged, pdf-merge-inplace)
- Modify: `api/src/routes/certificates.ts` ← portar de `c:\nfs\api\dist\routes\certificates.js`
- Modify: `api/src/server.ts` ← portar de `c:\nfs\api\dist\server.js` (body parsers text/xml e raw)

- [ ] **Step 1: Portar as 5 rotas** conforme mapeamento acima.
- [ ] **Step 2: Compilar e testar**

Run: `cd api && npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add api/src
git commit -m "feat(api): retro-port rotas sync/notes/reports/certificates e server"
```

---

## Fase 1 — Features do backend

### Task 5: Índice NSU local (`nsu-index.ts`)

**Files:**
- Create: `api/src/services/nsu-index.ts`
- Test: `api/tests/nsu-index.test.ts`

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
// api/tests/nsu-index.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { NsuIndex } from '../src/services/nsu-index.js';

const DIR = join(process.cwd(), 'test-index-output');

afterEach(() => { if (existsSync(DIR)) rmSync(DIR, { recursive: true }); });

describe('NsuIndex', () => {
  it('persiste e recarrega registros', () => {
    mkdirSync(DIR, { recursive: true });
    const idx = NsuIndex.load(DIR);
    idx.set(1, { chave: 'A'.repeat(50), tipo: 'prestados', dhEmi: '2026-07-01T10:00:00-03:00', dhProc: null, arquivo: '072026/prestados/NFS 1.xml' });
    idx.save();
    const idx2 = NsuIndex.load(DIR);
    expect(idx2.has(1)).toBe(true);
    expect(idx2.get(1)!.chave).toBe('A'.repeat(50));
    expect(idx2.maxNsu()).toBe(1);
  });

  it('arquivo corrompido → índice vazio sem lançar', () => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, '.nfse-index.json'), '{corrompido', 'utf-8');
    const idx = NsuIndex.load(DIR);
    expect(idx.maxNsu()).toBe(0);
  });

  it('findByChave localiza nsu e registro', () => {
    mkdirSync(DIR, { recursive: true });
    const idx = NsuIndex.load(DIR);
    idx.set(7, { chave: 'X'.repeat(50), tipo: 'tomados', dhEmi: null, dhProc: '2026-07-02T09:00:00-03:00', arquivo: '072026/tomados/NFS 9.xml' });
    const hit = idx.findByChave('X'.repeat(50));
    expect(hit?.nsu).toBe(7);
    expect(hit?.rec.arquivo).toContain('NFS 9');
  });

  it('nextKnownNsu retorna o menor NSU indexado >= cursor', () => {
    mkdirSync(DIR, { recursive: true });
    const idx = NsuIndex.load(DIR);
    const rec = { chave: 'C'.repeat(50), tipo: 'prestados' as const, dhEmi: null, dhProc: null, arquivo: 'a.xml' };
    idx.set(5, rec); idx.set(12, { ...rec, chave: 'D'.repeat(50) });
    expect(idx.nextKnownNsu(1)).toBe(5);
    expect(idx.nextKnownNsu(6)).toBe(12);
    expect(idx.nextKnownNsu(13)).toBeUndefined();
  });

  it('registerFile + fileForChave evitam duplicar arquivo por chave', () => {
    mkdirSync(DIR, { recursive: true });
    const idx = NsuIndex.load(DIR);
    idx.registerFile('K'.repeat(50), '072026/tomados/NFS 1.xml');
    expect(idx.fileForChave('K'.repeat(50))).toBe('072026/tomados/NFS 1.xml');
    expect(idx.fileForChave('Z'.repeat(50))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run tests/nsu-index.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// api/src/services/nsu-index.ts
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { join } from 'path';
import type { TipoDoc, EventoTipo } from '../types.js';

export interface NsuRecord {
  chave: string;
  tipo: TipoDoc;
  dhEmi: string | null;   // ISO — data de emissão (dps.dhEmi)
  dhProc: string | null;  // ISO — geração/processamento (infNFSe.dhProc; dhEvento p/ eventos)
  arquivo: string;        // caminho relativo à pasta da empresa
  eventoTipo?: EventoTipo;
}

interface IndexFile {
  version: 1;
  nsus: Record<string, NsuRecord>;
}

const INDEX_NAME = '.nfse-index.json';

/**
 * Índice NSU→documento por empresa. Permite:
 * - pular NSUs já baixados em re-buscas por período (sem rede);
 * - localizar a nota original por chave (cancelamento/substituição) em O(1);
 * - idempotência de gravação (chave → arquivo já existente).
 */
export class NsuIndex {
  private nsus = new Map<number, NsuRecord>();
  private byChave = new Map<string, number>();
  private files = new Map<string, string>(); // chave → arquivo (inclui notas sem NSU conhecido)

  private constructor(private companyDir: string) {}

  static load(companyDir: string): NsuIndex {
    const idx = new NsuIndex(companyDir);
    const path = join(companyDir, INDEX_NAME);
    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, 'utf-8')) as IndexFile;
        for (const [nsuStr, rec] of Object.entries(data.nsus ?? {})) {
          idx.set(Number(nsuStr), rec);
        }
      } catch { /* corrompido → começa vazio; será reconstruído pelo uso */ }
    }
    return idx;
  }

  has(nsu: number): boolean { return this.nsus.has(nsu); }
  get(nsu: number): NsuRecord | undefined { return this.nsus.get(nsu); }

  set(nsu: number, rec: NsuRecord): void {
    this.nsus.set(nsu, rec);
    this.byChave.set(rec.chave, nsu);
    if (rec.tipo !== 'eventos') this.files.set(rec.chave, rec.arquivo);
  }

  findByChave(chave: string): { nsu: number; rec: NsuRecord } | undefined {
    const nsu = this.byChave.get(chave);
    if (nsu === undefined) return undefined;
    return { nsu, rec: this.nsus.get(nsu)! };
  }

  /** Registra arquivo por chave sem NSU (usado por importRawXml e rebuild do disco). */
  registerFile(chave: string, arquivo: string): void { this.files.set(chave, arquivo); }
  fileForChave(chave: string): string | undefined { return this.files.get(chave); }
  /** Atualiza o caminho após mover a nota (cancelada/substituída). */
  moveFile(chave: string, novoArquivo: string): void {
    this.files.set(chave, novoArquivo);
    const nsu = this.byChave.get(chave);
    if (nsu !== undefined) this.nsus.get(nsu)!.arquivo = novoArquivo;
  }

  maxNsu(): number {
    let max = 0;
    for (const nsu of this.nsus.keys()) if (nsu > max) max = nsu;
    return max;
  }

  /** Menor NSU indexado >= cursor (para pular buracos que o servidor já expirou). */
  nextKnownNsu(cursor: number): number | undefined {
    let best: number | undefined;
    for (const nsu of this.nsus.keys()) {
      if (nsu >= cursor && (best === undefined || nsu < best)) best = nsu;
    }
    return best;
  }

  save(): void {
    const data: IndexFile = { version: 1, nsus: {} };
    for (const [nsu, rec] of this.nsus) data.nsus[String(nsu)] = rec;
    const path = join(this.companyDir, INDEX_NAME);
    const tmp = path + '.tmp';
    writeFileSync(tmp, JSON.stringify(data), 'utf-8');
    renameSync(tmp, path); // gravação atômica
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd api && npx vitest run tests/nsu-index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/nsu-index.ts api/tests/nsu-index.test.ts
git commit -m "feat(api): indice NSU local por empresa (.nfse-index.json)"
```

### Task 6: Rework do `xml-saver` — XML-only, colisão segura, substituição

**Files:**
- Modify: `api/src/services/xml-saver.ts`
- Test: `api/tests/xml-saver.test.ts`

Assinatura final (remove `dateRange` e `gerarPdf` — período agora é decidido pelo sync-engine; PDF sai do fluxo de sync):

```ts
export interface SavedXmlInfo {
  nsu: number;
  tipo: TipoDoc;
  competencia: string;
  filePath: string;
  chaveAcesso: string;
  dhEmi: string | null;
  dhProc: string | null;
  eventoTipo?: EventoTipo;
}

export async function decodeAndSave(
  xmlBase64Gzip: string,
  nsu: number,
  cnpjEmpresa: string,
  outputFolder: string,
  nomeEmpresa: string,
  index: NsuIndex,
): Promise<SavedXmlInfo>;

export interface DateRange { dataInicio?: Date; dataFim?: Date; }

/** true se dhEmi OU dhProc cair no range; sem nenhuma data → true (não perder nota). */
export function isWithinRange(
  info: { dhEmi: string | null; dhProc: string | null },
  range?: DateRange,
): boolean;
```

- [ ] **Step 1: Escrever os testes novos (falhando)** — substituir o arquivo de teste atual mantendo o helper `makeXml` (parametrizar `nNFSe` e chave no `Id`):

```ts
// principais casos em api/tests/xml-saver.test.ts.
// Helpers do arquivo (adaptar o makeXml existente):
//   makeXml({ cnpj, nNFSe, chave, dhEmi? })  → XML NFS-e com Id="NFS{chave}", <nNFSe> e dhEmi
//     (default dhEmi: '2026-07-10T10:00:00-03:00' → competência 072026)
//   makeEventoSubstXml({ chNFSe, nDFSe, dhEvento }) → raiz <evento> com filho <e110115>
//   gz(xml) = gzip+base64;  companyDir() = join(OUTPUT, EMPRESA)
//   Constantes: CNPJ = '12345678000100' (empresa), OUTRO_CNPJ/OUTRO_CNPJ2 = terceiros,
//   CH1/CH2 = chaves de 50 dígitos distintas, EMPRESA = 'Empresa Teste', OUTPUT = pasta temp.
import { NsuIndex } from '../src/services/nsu-index.js';
import { decodeAndSave, isWithinRange } from '../src/services/xml-saver.js';

it('mesma chave duas vezes → um único arquivo (idempotente)', async () => {
  const idx = NsuIndex.load(companyDir());
  const b64 = await gz(makeXml({ cnpj: CNPJ, nNFSe: '5', chave: CH1 }));
  await decodeAndSave(b64, 1, CNPJ, OUTPUT, EMPRESA, idx);
  await decodeAndSave(b64, 1, CNPJ, OUTPUT, EMPRESA, idx);
  const files = readdirSync(join(companyDir(), '072026', 'prestados'));
  expect(files).toEqual(['NFS 5.xml']);
});

it('chaves diferentes com mesmo nNFSe → sufixo com final da chave', async () => {
  const idx = NsuIndex.load(companyDir());
  await decodeAndSave(await gz(makeXml({ cnpj: OUTRO_CNPJ, nNFSe: '1', chave: CH1 })), 1, CNPJ, OUTPUT, EMPRESA, idx);
  await decodeAndSave(await gz(makeXml({ cnpj: OUTRO_CNPJ2, nNFSe: '1', chave: CH2 })), 2, CNPJ, OUTPUT, EMPRESA, idx);
  const files = readdirSync(join(companyDir(), '072026', 'tomados')).sort();
  expect(files).toEqual([`NFS 1 (${CH2.slice(-8)}).xml`, 'NFS 1.xml'].sort());
});

it('retorna dhEmi e dhProc extraídos do XML', async () => {
  const idx = NsuIndex.load(companyDir());
  const info = await decodeAndSave(await gz(makeXml({ cnpj: CNPJ, nNFSe: '2', chave: CH1, dhEmi: '2026-05-10T08:00:00-03:00' })), 3, CNPJ, OUTPUT, EMPRESA, idx);
  expect(info.dhEmi).toContain('2026-05-10');
});

it('isWithinRange: dhEmi fora mas dhProc dentro → true', () => {
  expect(isWithinRange(
    { dhEmi: '2026-05-01T10:00:00-03:00', dhProc: '2026-07-05T10:00:00-03:00' },
    { dataInicio: new Date('2026-07-01T00:00:00-03:00'), dataFim: new Date('2026-07-31T23:59:59-03:00') },
  )).toBe(true);
});

it('isWithinRange: sem nenhuma data → true', () => {
  expect(isWithinRange({ dhEmi: null, dhProc: null }, { dataInicio: new Date() })).toBe(true);
});

it('evento de substituição move a nota original para substituidas/', async () => {
  const idx = NsuIndex.load(companyDir());
  await decodeAndSave(await gz(makeXml({ cnpj: CNPJ, nNFSe: '9', chave: CH1 })), 1, CNPJ, OUTPUT, EMPRESA, idx);
  const evtXml = makeEventoSubstXml({ chNFSe: CH1, nDFSe: '9', dhEvento: '2026-07-20T12:00:00-03:00' });
  const info = await decodeAndSave(await gz(evtXml), 2, CNPJ, OUTPUT, EMPRESA, idx);
  expect(info.tipo).toBe('eventos');
  expect(info.eventoTipo).toBe('substituicao');
  expect(existsSync(join(companyDir(), '072026', 'substituidas', 'NFS 9.xml'))).toBe(true);
  expect(existsSync(join(companyDir(), '072026', 'prestados', 'NFS 9.xml'))).toBe(false);
});
```

Adicionar helper `makeEventoSubstXml` no teste (raiz `<evento>` com filho `<e110115>`, tags `<chNFSe>`, `<nDFSe>`, `<dhEvento>`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd api && npx vitest run tests/xml-saver.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o rework** sobre o código portado na Task 3:

1. Remover parâmetros `dateRange`/`gerarPdf` e TODO o bloco de geração de PDF de `decodeAndSave` (PDF sai do sync).
2. Sempre salvar; nunca retornar `null`. Extrair e retornar `dhEmi` (de `dps.dhEmi`) e `dhProc` (de `infNFSe.dhProc`) como strings ISO cruas (via `extractTagValue` para não perder precisão).
3. Nome do arquivo: `NFS {nNFSe}.xml`. Antes de gravar: `const existente = index.fileForChave(chaveAcesso)` → se existir e o arquivo estiver no disco, retornar info apontando para ele (idempotente). Se o caminho `NFS {n}.xml` já existir com OUTRA chave, usar `NFS {n} ({chave.slice(-8)}).xml`.
4. Após gravar: `index.registerFile(chaveAcesso, relativo)`.
5. Eventos: manter detecção portada (e101101/e110115/eCanc/eSubst). `dhProc` do evento = `dhCanc || dhEvento || dhSubst`. Cancelamento → `moveNotaOriginal(chave, 'canceladas')`; substituição → `moveNotaOriginal(chave, 'substituidas')`.
6. Substituir `moveCancelledNote` (varredura O(n) por substring) por:

```ts
async function moveNotaOriginal(
  chNFSe: string, outputFolder: string, nomeEmpresa: string,
  destino: 'canceladas' | 'substituidas', index: NsuIndex,
): Promise<void> {
  const rel = index.fileForChave(chNFSe);
  const companyDir = join(outputFolder, nomeEmpresa);
  const src = rel ? join(companyDir, rel) : findXmlByChaveOnDisk(companyDir, chNFSe); // fallback p/ disco sem índice
  if (!src || !existsSync(src)) return;
  const periodDir = dirname(dirname(src));           // .../MMYYYY
  const destDir = join(periodDir, destino);
  mkdirSync(destDir, { recursive: true });
  const dst = join(destDir, basename(src));
  if (!existsSync(dst)) { try { renameSync(src, dst); } catch { return; } }
  index.moveFile(chNFSe, relative(companyDir, dst));
  const pdfSrc = src.replace(/\.xml$/, '.pdf');
  if (existsSync(pdfSrc)) { try { unlinkSync(pdfSrc); } catch { /* regenerado pelo botão PDFs */ } }
}
```

`findXmlByChaveOnDisk` = a varredura antiga (mantida como fallback), mas casando por regex `Id="NFS{chave}"`, não substring solta.

7. `importRawXml`: adotar mesma regra de colisão e `index.registerFile`.

- [ ] **Step 4: Rodar testes**

Run: `cd api && npx vitest run tests/xml-saver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/xml-saver.ts api/tests/xml-saver.test.ts
git commit -m "feat(api): xml-saver XML-only, colisao por chave, evento de substituicao"
```

### Task 7: Rework do `sync-engine` — tipos, índice, lastNsu seguro

**Files:**
- Modify: `api/src/services/sync-engine.ts`
- Test: `api/tests/sync-engine.test.ts`

Assinatura final:

```ts
export interface SyncOptions {
  dateRange?: DateRange;
  startNsu?: number;
  tipos?: TipoNota[];        // default ['prestados','tomados'] — afeta contagem/relato, não gravação
}
export interface SyncResult {
  prestados: number; tomados: number; eventos: number;
  foraPeriodo: number;       // salvos mas fora do range (substitui "pulados")
  cache: number;             // resolvidos pelo índice, sem rede
  errors: number; lastNsu: number;
}
```

- [ ] **Step 1: Escrever/atualizar testes (falhando)**

```ts
// casos novos em api/tests/sync-engine.test.ts:

it('lastNsu não avança sobre NSU com erro', async () => {
  // fetch: NSU 101 falha SEMPRE (mock rejeita), NSU 102 ok, depois NENHUM
  const xmlB64 = await makeXmlB64('12345678000100', 102);
  const mockFetch = vi.fn()
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValueOnce(lote([{ NSU: 102, ArquivoXml: xmlB64 }]))
    .mockResolvedValueOnce(nenhum());
  const result = await runSync(company, mockFetch, () => {}, {});
  expect(result.errors).toBe(1);
  expect(result.lastNsu).toBe(100); // primeiro erro foi no 101 → não avança
});

it('re-busca por período usa índice e não chama a rede para NSUs conhecidos', async () => {
  // 1ª rodada baixa NSU 101; 2ª rodada com startNsu=1: fetch só é chamado a partir do gap
  const xmlB64 = await makeXmlB64('12345678000100', 101, '2026-06-10');
  const first = vi.fn()
    .mockResolvedValueOnce(lote([{ NSU: 101, ArquivoXml: xmlB64 }]))
    .mockResolvedValueOnce(nenhum());
  await runSync(company, first, () => {}, {});
  const second = vi.fn().mockResolvedValue(nenhum());
  const result = await runSync({ ...company, lastNsu: 0 }, second, () => {}, {
    startNsu: 1,
    dateRange: { dataInicio: new Date('2026-06-01T00:00:00-03:00'), dataFim: new Date('2026-06-30T23:59:59-03:00') },
  });
  expect(result.cache).toBe(1);
  expect(result.prestados).toBe(1);
  // NSU 1 (gap expirado) → NENHUM → pula para o 101 via índice; depois confirma o fim em 102
  expect(second).toHaveBeenCalledWith(102, company.cnpj);
  expect(second).toHaveBeenCalledTimes(2);
});

it('tipos=[prestados] destaca só prestados mas salva tomados', async () => {
  const prestado = await makeXmlB64(company.cnpj, 201);
  const tomado = await makeXmlB64('99999999000191', 202);
  const mockFetch = vi.fn()
    .mockResolvedValueOnce(lote([{ NSU: 201, ArquivoXml: prestado }, { NSU: 202, ArquivoXml: tomado }]))
    .mockResolvedValueOnce(nenhum());
  const result = await runSync({ ...company, lastNsu: 200 }, mockFetch, () => {}, { tipos: ['prestados'] });
  expect(result.prestados).toBe(1);
  expect(result.tomados).toBe(0);       // não destacado
  // mas salvo no disco mesmo assim (makeXmlB64 usa nsu como nNFSe e dCompet 2026-06-10):
  expect(existsSync(join(OUTPUT, company.nome, '062026', 'tomados', 'NFS 202.xml'))).toBe(true);
});
```

(Helpers `lote(items)` / `nenhum()` retornando `AdnDistribuicaoResponse` completos; itens com `ChaveAcesso: ''` e `TipoDocumento: 'NFSE'`.)

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/sync-engine.test.ts`.

- [ ] **Step 3: Implementar** — substituir o loop por:

```ts
export async function runSync(company, fetchFn, onProgress, options: SyncOptions = {}): Promise<SyncResult> {
  const tipos = new Set(options.tipos ?? ['prestados', 'tomados']);
  const companyDir = join(company.outputFolder, company.nome);
  mkdirSync(companyDir, { recursive: true });
  const index = NsuIndex.load(companyDir);

  let cursor = options.startNsu !== undefined ? options.startNsu : company.lastNsu + 1;
  let prestados = 0, tomados = 0, eventos = 0, foraPeriodo = 0, cache = 0, errors = 0;
  let consecutiveErrors = 0, firstErrorNsu: number | null = null;
  const MAX_CONSECUTIVE_ERRORS = 10;

  const conta = (rec: { tipo: TipoDoc; dhEmi: string | null; dhProc: string | null }, fromCache: boolean) => {
    if (!isWithinRange(rec, options.dateRange)) { foraPeriodo++; return; }
    if (rec.tipo === 'eventos') eventos++;
    else if (tipos.has(rec.tipo)) { rec.tipo === 'prestados' ? prestados++ : tomados++; }
    if (fromCache) cache++;
  };

  while (true) {
    // 1) resolve do índice sem rede (só faz sentido em re-scan por período)
    let cacheRun = 0;
    while (index.has(cursor) && existsSync(join(companyDir, index.get(cursor)!.arquivo))) {
      conta(index.get(cursor)!, true);
      cursor++; cacheRun++;
    }
    if (cacheRun > 0) onProgress(`NSU ${cursor - cacheRun}–${cursor - 1} → já baixados (índice), sem rede`);

    // 2) gap → rede
    let response: AdnDistribuicaoResponse;
    try {
      response = await fetchFn(cursor, company.cnpj);
      consecutiveErrors = 0;
    } catch (err) {
      errors++; consecutiveErrors++;
      firstErrorNsu ??= cursor;
      onProgress(`[ERRO] NSU ${cursor}: ${(err as Error).message}`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        onProgress(`[FATAL] ${MAX_CONSECUTIVE_ERRORS} erros consecutivos — sync abortado.`);
        break;
      }
      cursor++; continue;
    }
    if (response.StatusProcessamento === 'NENHUM_DOCUMENTO_LOCALIZADO') {
      // NENHUM num gap abaixo do máximo indexado = NSUs antigos expirados no servidor.
      // Pula para o próximo NSU conhecido e continua resolvendo do índice.
      const next = index.nextKnownNsu(cursor);
      if (next !== undefined) { cursor = next; continue; }
      break;
    }
    if (response.StatusProcessamento === 'REJEICAO') {
      onProgress(`[REJEIÇÃO] NSU ${cursor}: ${response.Erros?.map(e => e.Descricao).join(', ') ?? 'sem detalhes'}`);
      break;
    }

    const loteItens = response.LoteDFe ?? [];
    for (let i = 0; i < loteItens.length; i += LOTE_CONCURRENCY) {
      const batch = loteItens.slice(i, i + LOTE_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(item =>
        decodeAndSave(item.ArquivoXml, item.NSU, company.cnpj, company.outputFolder, company.nome, index)));
      for (let j = 0; j < batch.length; j++) {
        const nsu = batch[j].NSU;
        const r = results[j];
        if (r.status === 'rejected') {
          errors++; firstErrorNsu ??= nsu;
          onProgress(`[ERRO] NSU ${nsu}: ${(r.reason as Error).message}`);
        } else {
          const info = r.value;
          index.set(nsu, { chave: info.chaveAcesso, tipo: info.tipo, dhEmi: info.dhEmi, dhProc: info.dhProc, arquivo: relative(companyDir, info.filePath), eventoTipo: info.eventoTipo });
          conta(info, false);
          const dentro = isWithinRange(info, options.dateRange);
          onProgress(`NSU ${nsu} → ${info.eventoTipo ?? info.tipo} (${info.competencia})${dentro ? ' salvo' : ' salvo (fora do período)'}`);
        }
        if (nsu >= cursor) cursor = nsu + 1;
      }
    }
  }

  index.save();
  const lastNsu = firstErrorNsu !== null ? Math.min(firstErrorNsu - 1, cursor - 1) : cursor - 1;
  return { prestados, tomados, eventos, foraPeriodo, cache, errors, lastNsu };
}
```

(Manter `LOTE_CONCURRENCY = 4`. Imports: `relative`, `dirname` de `path`; `NsuIndex`; `isWithinRange`.)

- [ ] **Step 4: Rodar testes** — `cd api && npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/sync-engine.ts api/tests/sync-engine.test.ts
git commit -m "feat(api): sync XML-only com indice NSU, tipos selecionados e lastNsu seguro"
```

### Task 8: `adn-client` — Retry-After + jitter

**Files:**
- Modify: `api/src/services/adn-client.ts`
- Test: `api/tests/adn-client.test.ts` (novo)

- [ ] **Step 1: Testes (falhando)** — para testabilidade, `fetchDFeLote` ganha 4º parâmetro opcional `fetchImpl` (default `fetch` do node-fetch):

```ts
// api/tests/adn-client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { fetchDFeLote, __setSleepForTests } from '../src/services/adn-client.js';

const opts = { baseUrl: 'https://fake', pfxPath: '', pfxPassword: '' };
// pfxPath vazio → getCachedAgent deve ser pulado quando pfxPath === '' (agent undefined em teste)

it('respeita Retry-After em 429 e depois retorna ok', async () => {
  const sleeps: number[] = [];
  __setSleepForTests(async (ms) => { sleeps.push(ms); });
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce({ status: 429, ok: false, headers: { get: (h: string) => h === 'retry-after' ? '7' : null } })
    .mockResolvedValueOnce({ status: 200, ok: true, headers: { get: () => null }, json: async () => ({ StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', LoteDFe: [], Alertas: null, Erros: null }) });
  const res = await fetchDFeLote(opts, 1, '11111111000111', fetchImpl as never);
  expect(res.StatusProcessamento).toBe('DOCUMENTOS_LOCALIZADOS');
  expect(sleeps[0]).toBeGreaterThanOrEqual(7000);   // Retry-After: 7s
  expect(sleeps[0]).toBeLessThanOrEqual(7000 * 1.3); // + jitter máx 30%
});

it('404 → NENHUM_DOCUMENTO_LOCALIZADO', async () => {
  const fetchImpl = vi.fn().mockResolvedValueOnce({ status: 404, ok: false, headers: { get: () => null } });
  const res = await fetchDFeLote(opts, 1, '11111111000111', fetchImpl as never);
  expect(res.StatusProcessamento).toBe('NENHUM_DOCUMENTO_LOCALIZADO');
});
```

- [ ] **Step 2: Ver falhar** — `npx vitest run tests/adn-client.test.ts`.

- [ ] **Step 3: Implementar**: no loop de retry existente (portado na Task 2):
  - tratar `429` **e** `503` como retryáveis;
  - delay = `Retry-After` (segundos→ms) se presente, senão a escada `[3000, 8000, 15000]`; aplicar jitter `* (1 + Math.random() * 0.3)`;
  - `let sleepFn = sleep; export function __setSleepForTests(fn) { sleepFn = fn; }`;
  - parâmetro `fetchImpl: typeof fetch = fetch`; quando `opts.pfxPath` for vazio, não criar agent (testes).

- [ ] **Step 4: Ver passar** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/adn-client.ts api/tests/adn-client.test.ts
git commit -m "feat(api): retry do feed com Retry-After e jitter"
```

### Task 9: Rota `sync` — parâmetro `tipos` + novo resumo

**Files:**
- Modify: `api/src/routes/sync.ts`

- [ ] **Step 1: Alterar a rota** (sobre a versão portada na Task 4):
  - ler `tipos` da query: `const tiposParam = String(req.query.tipos ?? 'prestados,tomados').split(',').filter(t => t === 'prestados' || t === 'tomados') as TipoNota[];`
  - remover `gerarPdf` da query e das `options`;
  - `options = { tipos: tiposParam, startNsu: comFiltroData ? 1 : undefined, dateRange: ... }` (datas com `-03:00` como hoje);
  - resumo final:

```ts
const rotulo = tiposParam.length === 1 ? (tiposParam[0] === 'prestados' ? 'prestados' : 'tomados') : 'prestados e tomados';
const msgFinal = semNovos && !comFiltroData
  ? `Nenhuma nota nova desde a última sincronização (NSU atual: ${nsuParaSalvar})`
  : `Concluído (${rotulo}): ${result.prestados} prestados, ${result.tomados} tomados, ${result.eventos} eventos` +
    `${result.cache ? `, ${result.cache} do cache` : ''}${result.foraPeriodo ? `, ${result.foraPeriodo} fora do período` : ''}, ${result.errors} erros`;
```

  - preservação do lastNsu com filtro: `comFiltroData ? Math.max(company.lastNsu, result.lastNsu) : result.lastNsu` (igual dist).

- [ ] **Step 2: Compilar e testar** — `npx tsc --noEmit && npm test` → PASS.

- [ ] **Step 3: Commit**

```bash
git add api/src/routes/sync.ts
git commit -m "feat(api): rota sync com selecao de tipos e resumo com cache/fora-periodo"
```

### Task 10: DANFSe local — pool Puppeteer + layout NT 008 + QR

**Files:**
- Modify: `api/src/services/danfse-generator.ts`
- Modify: `api/src/services/danfse-template.ts`
- Create: `docs/referencias/nt-008-danfse-v1.02.pdf` (download)
- Test: `api/tests/danfse-generator.test.ts`

- [ ] **Step 1: Baixar a espec oficial**

```bash
mkdir -p docs/referencias
curl -L -o docs/referencias/nt-008-danfse-v1.02.pdf "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260505.pdf"
```

Ler o PDF (tool Read, por páginas) antes de escrever o template — ele define seções, ordem dos blocos e o conteúdo do QR Code. **O layout do template DEVE seguir o documento**, não a memória.

- [ ] **Step 2: Browser singleton + pool no generator**

```ts
// api/src/services/danfse-generator.ts — substituir launch-por-nota por:
import puppeteer, { type Browser } from 'puppeteer';

let browserP: Promise<Browser> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
const IDLE_MS = 60_000;

async function getBrowser(): Promise<Browser> {
  if (!browserP) {
    browserP = puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { void closeDanfseBrowser(); }, IDLE_MS);
  idleTimer.unref();
  return browserP;
}

export async function closeDanfseBrowser(): Promise<void> {
  if (!browserP) return;
  const b = await browserP.catch(() => null);
  browserP = null;
  await b?.close().catch(() => {});
}

export type DanfseStamp = 'CANCELADA' | 'SUBSTITUIDA' | undefined;

export async function generateDanfse(xmlStr: string, stamp?: DanfseStamp): Promise<Buffer> {
  const data = extractDanfseData(xmlStr);
  const qrDataUrl = await buildQrDataUrl(data.chaveAcesso);   // Step 3
  const html = buildDanfseHtml(data, LOGO_DATA_URL, stamp, qrDataUrl);
  const browser = await getBrowser();
  const page = await browser.newPage();  // pool natural: N chamadas paralelas = N abas
  try {
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
```

Compat: chamadas antigas `generateDanfse(xml, true)` viram `generateDanfse(xml, 'CANCELADA')`.

- [ ] **Step 3: QR Code**

```ts
import QRCode from 'qrcode';
// URL de consulta pública conforme NT 008 (CONFERIR no PDF baixado na Step 1 e ajustar se divergir):
const CONSULTA_URL = (chave: string) => `https://www.nfse.gov.br/consultapublica?tpc=1&chave=${chave}`;
async function buildQrDataUrl(chave: string): Promise<string> {
  return QRCode.toDataURL(CONSULTA_URL(chave), { margin: 0, width: 96 });
}
```

- [ ] **Step 4: Template NT 008** — reescrever `buildDanfseHtml(data, logoDataUrl, stamp, qrDataUrl)` seguindo a espec lida na Step 1. Estrutura mínima exigida (mapear campos já existentes em `extractDanfseData`):
  - Cabeçalho: logo NFS-e, título "DANFSe — Documento Auxiliar da NFS-e", chave de acesso (50 díg.), QR Code, nº da NFS-e, competência, datas de emissão da DPS e de processamento;
  - Bloco Emitente (CNPJ, IM, nome, endereço, município/UF/CEP, e-mail/fone, Simples Nacional/regime);
  - Bloco Tomador (CNPJ/CPF, IM, nome, endereço, contato);
  - Bloco Serviço (cTribNac/descrição, cTribMun, NBS, descrição do serviço, local de prestação/incidência, infos complementares);
  - Bloco Tributação (ISSQN: BC, alíquota, valor, retenção; federais: PIS, COFINS, IRRF (`vRetIRRF` com fallback `vIRRF` — **corrigir o bug atual que lê só `vIRRF`**), CSLL, CP/INSS; total aproximado de tributos);
  - Bloco Valores (valor do serviço, descontos se houver, valor líquido);
  - Carimbo diagonal semitransparente "CANCELADA" (vermelho) ou "SUBSTITUÍDA" (âmbar) quando `stamp` presente;
  - Rodapé com data/hora de geração.

- [ ] **Step 5: Atualizar teste**

```ts
// api/tests/danfse-generator.test.ts — ajustar/garantir:
import { afterAll, describe, it, expect } from 'vitest';
import { generateDanfse, closeDanfseBrowser } from '../src/services/danfse-generator.js';

afterAll(async () => { await closeDanfseBrowser(); });

it('gera PDF válido (%PDF) a partir de XML NFS-e', async () => {
  const pdf = await generateDanfse(XML_TESTE);
  expect(pdf.subarray(0, 5).toString('latin1')).toContain('%PDF');
}, 60_000);

it('duas gerações em paralelo reutilizam o mesmo browser', async () => {
  const [a, b] = await Promise.all([generateDanfse(XML_TESTE), generateDanfse(XML_TESTE)]);
  expect(a.length).toBeGreaterThan(1000);
  expect(b.length).toBeGreaterThan(1000);
}, 60_000);
```

- [ ] **Step 6: Rodar** — `npx vitest run tests/danfse-generator.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/services/danfse-generator.ts api/src/services/danfse-template.ts api/tests/danfse-generator.test.ts docs/referencias
git commit -m "feat(api): DANFSe local layout NT 008/2026 com QR, carimbos e pool Puppeteer"
```

### Task 11: Rotas `notes` (gerar-pdfs, situação) e `reports` (SUBSTITUÍDA)

**Files:**
- Modify: `api/src/routes/notes.ts`
- Modify: `api/src/routes/reports.ts`
- Modify: `api/src/services/xml-reader.ts`

- [ ] **Step 1: `buildEventIndex` em `xml-reader.ts`** (substitui `buildCancelledIndex`):

```ts
export interface EventIndex { canceladas: Set<string>; substituidas: Set<string>; }

export function buildEventIndex(outputFolder: string, nomeEmpresa: string): EventIndex {
  const eventosDir = join(outputFolder, nomeEmpresa, 'eventos');
  const idx: EventIndex = { canceladas: new Set(), substituidas: new Set() };
  for (const sub of safeDirRead(eventosDir)) {
    for (const file of safeDirRead(join(eventosDir, sub))) {
      if (!file.endsWith('.xml')) continue;
      try {
        const xml = readFileSync(join(eventosDir, sub, file), 'utf-8');
        const chave = xml.match(/<chNFSe[^>]*>(\d+)<\/chNFSe>/)?.[1]
          ?? xml.match(/<chNFSeAnulada[^>]*>(\d+)<\/chNFSeAnulada>/)?.[1];
        if (!chave) continue;
        const isCanc = /<e101101>|<eCanc[\s>]|[Cc]ancelamento de NFS-e/.test(xml);
        const isSubst = /<e110115>|<eSubst[\s>]|Substitui/.test(xml);
        if (isCanc) idx.canceladas.add(chave);
        else if (isSubst) idx.substituidas.add(chave);
      } catch { /* pula */ }
    }
  }
  return idx;
}
```

Manter `buildCancelledIndex` como wrapper (`return buildEventIndex(...).canceladas`) até as rotas migrarem, depois remover.

- [ ] **Step 2: `notes.ts` — listagem com situação**: no `GET /:cnpj`, usar `buildEventIndex`; incluir também a pasta `substituidas/` de cada período (mesma lógica das `canceladas/`); cada item ganha `situacao: 'ativa' | 'cancelada' | 'substituida'` (mantendo `cancelada: boolean` por compat).

- [ ] **Step 3: `notes.ts` — nova rota `GET /:cnpj/gerar-pdfs`** (SSE; remove de vez a antiga `regenerar-pdfs` que não foi portada):

```ts
// Query: dataInicio?, dataFim? (YYYY-MM-DD), tipo? = todos|prestados|tomados, incluirEncerradas? = 'true' (canceladas+substituidas)
notesRouter.get('/:cnpj/gerar-pdfs', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);
  if (!company) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

  const tipoFiltro = String(req.query.tipo ?? 'todos');
  const incluirEncerradas = req.query.incluirEncerradas !== 'false';
  const dataInicio = String(req.query.dataInicio ?? '');
  const dataFim = String(req.query.dataFim ?? '');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (type: string, data: object) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  const companyDir = join(company.outputFolder, company.nome);
  type Job = { xmlPath: string; pdfPath: string; stamp?: DanfseStamp };
  const jobs: Job[] = [];
  const subDirs: Array<{ nome: string; stamp?: DanfseStamp }> = [
    { nome: 'prestados' }, { nome: 'tomados' },
    ...(incluirEncerradas ? [{ nome: 'canceladas', stamp: 'CANCELADA' as const }, { nome: 'substituidas', stamp: 'SUBSTITUIDA' as const }] : []),
  ];
  for (const period of safeDirRead(companyDir)) {
    if (period === 'eventos') continue;
    for (const { nome, stamp } of subDirs) {
      if (!stamp && tipoFiltro !== 'todos' && tipoFiltro !== nome) continue;
      const dir = join(companyDir, period, nome);
      for (const file of safeDirRead(dir)) {
        if (!file.endsWith('.xml')) continue;
        const xmlPath = join(dir, file);
        const pdfPath = xmlPath.replace(/\.xml$/, '.pdf');
        if (existsSync(pdfPath)) continue;   // já tem PDF
        if (dataInicio || dataFim) {         // filtro por dhEmi OU dhProc, igual ao sync
          const xml = readFileSync(xmlPath, 'utf-8');
          const dhEmi = xml.match(/<dhEmi[^>]*>([^<]+)<\/dhEmi>/)?.[1] ?? null;
          const dhProc = xml.match(/<dhProc[^>]*>([^<]+)<\/dhProc>/)?.[1] ?? null;
          const range = {
            dataInicio: dataInicio ? new Date(dataInicio + 'T00:00:00-03:00') : undefined,
            dataFim: dataFim ? new Date(dataFim + 'T23:59:59-03:00') : undefined,
          };
          if (!isWithinRange({ dhEmi, dhProc }, range)) continue;
        }
        jobs.push({ xmlPath, pdfPath, stamp });
      }
    }
  }

  send('progress', { message: `${jobs.length} PDFs a gerar.` });
  resetDanfseBreaker();   // nova execução → nova chance para o ADN oficial
  const temCert = Boolean(company.pfxPath && company.pfxPassword);
  let oficiais = 0, locais = 0, erros = 0;
  const CONCURRENCY = 4;
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(async ({ xmlPath, pdfPath, stamp }) => {
      try {
        const xmlStr = readFileSync(xmlPath, 'utf-8');
        // 1) tenta o DANFSe oficial do ADN (barato: 1 tentativa, breaker desliga após 3 falhas)
        const chave = xmlStr.match(/Id="NFS([^"]{44,})"/)?.[1] ?? '';
        let pdf: Buffer | null = null;
        if (temCert && chave.length >= 44 && !stamp) {   // canceladas/substituídas precisam do carimbo local
          pdf = await downloadDanfsePdf(chave, company.pfxPath, company.pfxPassword);
          if (pdf) oficiais++;
        }
        // 2) fallback: gerador local no layout NT 008
        if (!pdf) { pdf = await generateDanfse(xmlStr, stamp); locais++; }
        writeFileSync(pdfPath, pdf);
      } catch { erros++; }
    }));
    send('progress', { message: `${Math.min(i + CONCURRENCY, jobs.length)}/${jobs.length} gerados...` });
  }
  const nota = isDanfseBreakerOpen() ? ' (ADN oficial indisponível nesta execução)' : '';
  send('done', {
    message: `Concluído: ${oficiais} oficiais do ADN, ${locais} gerados localmente, ${erros} erros${nota}`,
    oficiais, locais, erros,
  });
  res.end();
});
```

(Imports: `isWithinRange` de `xml-saver.js`; `generateDanfse`, `DanfseStamp` de `danfse-generator.js`; `downloadDanfsePdf`, `resetDanfseBreaker`, `isDanfseBreakerOpen` de `danfse-downloader.js`.)

- [ ] **Step 4: `reports.ts`**: trocar `buildCancelledIndex` por `buildEventIndex`; varrer também `substituidas/` (mesma lógica das canceladas); `situacao` = `'SUBSTITUÍDA'` com estilo âmbar:

```ts
if (row.substituida) {
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  r.font = { color: { argb: 'FF92400E' }, italic: true };
}
```

E corrigir o autofilter para >26 colunas:

```ts
function colLetter(n: number): string {  // 1→A, 27→AA
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
sheet.autoFilter = { from: 'A1', to: `${colLetter(colsFilter ? colsFilter.size : EXCEL_ALL_COLS.length)}${filteredRows.length + 1}` };
```

- [ ] **Step 5: Compilar e testar** — `npx tsc --noEmit && npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src
git commit -m "feat(api): rota gerar-pdfs local, situacao SUBSTITUIDA e autofilter corrigido"
```

### Task 12: Migração one-shot no boot (pasta mojibake + limpeza)

**Files:**
- Create: `api/src/services/startup-migration.ts`
- Modify: `api/src/server.ts`
- Test: `api/tests/startup-migration.test.ts`

- [ ] **Step 1: Testes (falhando)**

```ts
// api/tests/startup-migration.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { fixMojibakePath, mergeMove } from '../src/services/startup-migration.js';

const TMP = join(process.cwd(), 'test-migration');
afterEach(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true }); });

it('fixMojibakePath troca U+FFFD por Á quando a pasta corrigida existe', () => {
  const bom = join(TMP, 'Área de Trabalho', 'nfs');
  mkdirSync(bom, { recursive: true });
  const ruim = join(TMP, '\uFFFDrea de Trabalho', 'nfs');
  expect(fixMojibakePath(ruim)).toBe(bom);
});

it('fixMojibakePath mantém o caminho se não há correção possível', () => {
  const p = join(TMP, 'sem-problema');
  expect(fixMojibakePath(p)).toBe(p);
});

it('mergeMove move arquivos sem sobrescrever existentes', () => {
  const src = join(TMP, 'src'); const dst = join(TMP, 'dst');
  mkdirSync(join(src, 'sub'), { recursive: true }); mkdirSync(join(dst, 'sub'), { recursive: true });
  writeFileSync(join(src, 'sub', 'a.xml'), 'novo');
  writeFileSync(join(dst, 'sub', 'a.xml'), 'existente');   // não deve ser sobrescrito
  writeFileSync(join(src, 'sub', 'b.xml'), 'b');
  mergeMove(src, dst);
  expect(readFileSync(join(dst, 'sub', 'a.xml'), 'utf-8')).toBe('existente');
  expect(existsSync(join(dst, 'sub', 'b.xml'))).toBe(true);
  expect(existsSync(join(src, 'sub', 'b.xml'))).toBe(false);
});
```

- [ ] **Step 2: Ver falhar** — `npx vitest run tests/startup-migration.test.ts`.

- [ ] **Step 3: Implementar**

```ts
// api/src/services/startup-migration.ts
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { join, dirname } from 'path';
import { readConfig, writeConfig } from '../config-store.js';

/** Corrige U+FFFD (mojibake de "Á" etc.) num caminho, se a versão corrigida existir no disco. */
export function fixMojibakePath(p: string): string {
  if (!p.includes('\uFFFD')) return p;
  for (const ch of ['Á', 'Ã', 'É', 'Í', 'Ó', 'Ú', 'Ç']) {
    const candidate = p.replace(/\uFFFD/g, ch);
    // basta o diretório-pai corrigido existir (a subpasta final pode ainda não existir)
    if (existsSync(candidate) || existsSync(dirname(candidate))) return candidate;
  }
  return p;
}

/** Move recursivamente src → dst sem sobrescrever; remove diretórios de src que esvaziarem. */
export function mergeMove(src: string, dst: string): void {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry); const d = join(dst, entry);
    if (statSync(s).isDirectory()) { mergeMove(s, d); }
    else if (!existsSync(d)) { try { renameSync(s, d); } catch { /* em uso — deixa */ } }
    else { try { unlinkSync(s); } catch { /* duplicado que não pôde ser removido */ } }
  }
  try { rmdirSync(src); } catch { /* não-vazia */ }
}

function removeLocalMarkers(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) removeLocalMarkers(p);
    else if (entry.endsWith('.local')) { try { unlinkSync(p); } catch { /* ignora */ } }
  }
}

export function runStartupMigration(): void {
  const config = readConfig();
  let changed = false;
  for (const company of config.companies) {
    const fixed = fixMojibakePath(company.outputFolder);
    if (fixed !== company.outputFolder) {
      mergeMove(join(company.outputFolder), join(fixed));   // move a árvore fantasma inteira
      console.log(`[migração] outputFolder corrigido: ${company.outputFolder} → ${fixed}`);
      company.outputFolder = fixed;
      changed = true;
    }
    removeLocalMarkers(join(company.outputFolder, company.nome));
  }
  if (changed) writeConfig(config);
}
```

Em `api/src/server.ts`, antes do `app.listen`:

```ts
import { runStartupMigration } from './services/startup-migration.js';
try { runStartupMigration(); } catch (err) { console.warn('[migração] falhou (seguindo):', (err as Error).message); }
```

- [ ] **Step 4: Ver passar** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/startup-migration.ts api/src/server.ts api/tests/startup-migration.test.ts
git commit -m "feat(api): migracao one-shot de pasta mojibake e limpeza de marcadores .local"
```

---

## Fase 2 — UI

### Task 13: Modais de busca — checkboxes de tipo, sem gerarPdf

**Files:**
- Modify: `ui/src/components/SyncModal.tsx`
- Modify: `ui/src/components/CertificateSyncModal.tsx`
- Modify: `ui/src/lib/api.ts`
- Modify: `ui/src/App.tsx`
- Test: `ui/src/tests/SyncModal.test.tsx`

- [ ] **Step 1: Atualizar teste (falhando)** — substituir os casos de `gerarPdf`:

```tsx
it('exibe checkboxes de prestados e tomados marcados por padrão', () => {
  render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={vi.fn()} />);
  expect(screen.getByLabelText(/prestados/i)).toBeChecked();
  expect(screen.getByLabelText(/tomados/i)).toBeChecked();
  expect(screen.queryByLabelText(/gerar pdf/i)).not.toBeInTheDocument();
});

it('chama onSync com tipos selecionados', () => {
  const onSync = vi.fn();
  render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={onSync} />);
  fireEvent.click(screen.getByLabelText(/tomados/i));   // desmarca tomados
  fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
  expect(onSync).toHaveBeenCalledWith(expect.objectContaining({ prestados: true, tomados: false }));
});

it('exige ao menos um tipo marcado', () => {
  const onSync = vi.fn();
  render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={onSync} />);
  fireEvent.click(screen.getByLabelText(/prestados/i));
  fireEvent.click(screen.getByLabelText(/tomados/i));
  fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
  expect(onSync).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Ver falhar** — `cd ui && npx vitest run src/tests/SyncModal.test.tsx`.

- [ ] **Step 3: Implementar**

`SyncModal.tsx` — nova interface e campos:

```tsx
export interface SyncOptions {
  dataInicio: string;
  dataFim: string;
  prestados: boolean;
  tomados: boolean;
}
```

Substituir o bloco do checkbox `gerarPdf` por:

```tsx
<fieldset className="space-y-2">
  <legend className="block text-sm font-medium text-gray-700 mb-1">Tipos de nota</legend>
  <div className="flex items-center gap-4">
    <label htmlFor="tipoPrestados" className="flex items-center gap-2 text-sm font-medium text-gray-700">
      <input id="tipoPrestados" type="checkbox" checked={prestados}
        onChange={e => setPrestados(e.target.checked)} className="w-4 h-4" />
      Prestados
    </label>
    <label htmlFor="tipoTomados" className="flex items-center gap-2 text-sm font-medium text-gray-700">
      <input id="tipoTomados" type="checkbox" checked={tomados}
        onChange={e => setTomados(e.target.checked)} className="w-4 h-4" />
      Tomados
    </label>
  </div>
</fieldset>
```

`handleSubmit` valida `if (!prestados && !tomados) return;` e envia `{ dataInicio, dataFim, prestados, tomados }`.

`CertificateSyncModal.tsx`: mesmas mudanças (`CertSyncParams` troca `gerarPdf: boolean` por `prestados: boolean; tomados: boolean`; mesmo fieldset; mesma validação).

`lib/api.ts` — `startSync`:

```ts
const params = new URLSearchParams();
if (opts.dataInicio) params.set('dataInicio', opts.dataInicio);
if (opts.dataFim) params.set('dataFim', opts.dataFim);
const tipos = [opts.prestados && 'prestados', opts.tomados && 'tomados'].filter(Boolean).join(',');
params.set('tipos', tipos || 'prestados,tomados');
```

`App.tsx` — `handleCertSync` repassa `{ dataInicio, dataFim, prestados: params.prestados, tomados: params.tomados }`.

- [ ] **Step 4: Rodar testes UI** — `cd ui && npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src
git commit -m "feat(ui): selecao prestados/tomados na busca; remove PDF do fluxo de sync"
```

### Task 14: Botão e modal "Gerar PDFs"

**Files:**
- Create: `ui/src/components/GeneratePdfsModal.tsx`
- Modify: `ui/src/components/TopNav.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/lib/api.ts`

- [ ] **Step 1: `lib/api.ts` — cliente SSE de geração:**

```ts
export interface GeneratePdfsOptions {
  dataInicio: string;
  dataFim: string;
  tipo: 'todos' | 'prestados' | 'tomados';
  incluirEncerradas: boolean;   // canceladas + substituídas
}

export function startGeneratePdfs(
  cnpj: string,
  opts: GeneratePdfsOptions,
  onEvent: (event: SyncProgress) => void,
  onClose: () => void,
): EventSource {
  const params = new URLSearchParams();
  if (opts.dataInicio) params.set('dataInicio', opts.dataInicio);
  if (opts.dataFim) params.set('dataFim', opts.dataFim);
  params.set('tipo', opts.tipo);
  params.set('incluirEncerradas', String(opts.incluirEncerradas));
  const es = new EventSource(`${API}/api/notes/${cnpj}/gerar-pdfs?${params.toString()}`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data as string) as SyncProgress;
    onEvent(data);
    if (data.type === 'done' || data.type === 'error') { es.close(); onClose(); }
  };
  es.onerror = () => { es.close(); onClose(); };
  return es;
}
```

- [ ] **Step 2: `GeneratePdfsModal.tsx`** (novo, segue o padrão visual do `SyncModal`):

```tsx
import { useState } from 'react';
import type { Company } from '../types';
import { startGeneratePdfs, type GeneratePdfsOptions } from '../lib/api';

interface Props {
  open: boolean;
  companies: Company[];
  defaultCnpj: string | null;
  onClose: () => void;
}

export function GeneratePdfsModal({ open, companies, defaultCnpj, onClose }: Props) {
  const [cnpj, setCnpj] = useState<string>(defaultCnpj ?? companies[0]?.cnpj ?? '');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [tipo, setTipo] = useState<GeneratePdfsOptions['tipo']>('todos');
  const [incluirEncerradas, setIncluirEncerradas] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  if (!open) return null;

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cnpj) return;
    setRunning(true);
    setLog([]);
    startGeneratePdfs(cnpj, { dataInicio, dataFim, tipo, incluirEncerradas },
      ev => setLog(prev => [...prev.slice(-100), ev.message]),
      () => setRunning(false));
  };

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold mb-4 text-gray-900">Gerar PDFs (DANFSe)</h2>
        <form onSubmit={handleStart} className="space-y-4">
          <div>
            <label htmlFor="pdfEmpresa" className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
            <select id="pdfEmpresa" value={cnpj} onChange={e => setCnpj(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white">
              {companies.map(c => <option key={c.cnpj} value={c.cnpj}>{c.nome}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pdfDataInicio" className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
              <input id="pdfDataInicio" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900" />
            </div>
            <div>
              <label htmlFor="pdfDataFim" className="block text-sm font-medium text-gray-700 mb-1">Data fim</label>
              <input id="pdfDataFim" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900" />
            </div>
          </div>
          <div>
            <label htmlFor="pdfTipo" className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select id="pdfTipo" value={tipo} onChange={e => setTipo(e.target.value as GeneratePdfsOptions['tipo'])}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-900 bg-white">
              <option value="todos">Prestados e tomados</option>
              <option value="prestados">Só prestados</option>
              <option value="tomados">Só tomados</option>
            </select>
          </div>
          <label htmlFor="pdfEncerradas" className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input id="pdfEncerradas" type="checkbox" checked={incluirEncerradas}
              onChange={e => setIncluirEncerradas(e.target.checked)} className="w-4 h-4" />
            Incluir canceladas e substituídas (com carimbo)
          </label>
          <p className="text-xs text-gray-400">Deixe as datas em branco para gerar PDFs de todas as notas sem PDF.</p>
          {log.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded p-2 text-xs text-gray-600 max-h-32 overflow-y-auto font-mono">
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={running}
              className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
              Fechar
            </button>
            <button type="submit" disabled={running || !cnpj}
              className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
              {running ? 'Gerando…' : 'Gerar PDFs'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Botão no `TopNav.tsx`** — nova prop `onGerarPdfs: () => void`; antes do botão "Buscar Notas", inserir:

```tsx
<button
  onClick={onGerarPdfs}
  style={{
    background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
    color: 'rgba(255,255,255,.85)', padding: '9px 16px', borderRadius: 9,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 8,
  }}
>
  Gerar PDFs
</button>
```

- [ ] **Step 4: `App.tsx`** — estado `const [pdfModalOpen, setPdfModalOpen] = useState(false);`, prop `onGerarPdfs={() => setPdfModalOpen(true)}` no `TopNav`, e render:

```tsx
<GeneratePdfsModal open={pdfModalOpen} companies={companies} defaultCnpj={activeCnpj} onClose={() => setPdfModalOpen(false)} />
```

- [ ] **Step 5: Build da UI** — `cd ui && npx tsc -b && npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/src
git commit -m "feat(ui): modal Gerar PDFs (DANFSe local) com progresso SSE"
```

### Task 15: Badge SUBSTITUÍDA/CANCELADA na tabela de notas

**Files:**
- Modify: `ui/src/lib/api.ts` (tipo `NoteItem`)
- Modify: `ui/src/pages/Dashboard.tsx`

- [ ] **Step 1: `NoteItem` ganha situação**

```ts
export interface NoteItem {
  numeroNFSe: string;
  cnpj: string;
  nome: string;
  dataEmissao: string;
  valorServico: number;
  periodo: string;
  cancelada?: boolean;
  situacao?: 'ativa' | 'cancelada' | 'substituida';
}
```

- [ ] **Step 2: Badge no Dashboard** — localizar em `ui/src/pages/Dashboard.tsx` a célula da tabela de notas que renderiza `numeroNFSe` (buscar por `numeroNFSe` no arquivo) e acrescentar ao lado:

```tsx
{note.situacao === 'cancelada' && (
  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#f87171',
    background: 'rgba(239,68,68,.15)', padding: '2px 6px', borderRadius: 4 }}>CANCELADA</span>
)}
{note.situacao === 'substituida' && (
  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#fbbf24',
    background: 'rgba(251,191,36,.15)', padding: '2px 6px', borderRadius: 4 }}>SUBSTITUÍDA</span>
)}
```

- [ ] **Step 3: Build + testes** — `cd ui && npx tsc -b && npm test` → PASS.

- [ ] **Step 4: Commit**

```bash
git add ui/src
git commit -m "feat(ui): badges CANCELADA/SUBSTITUIDA na tabela de notas"
```

---

## Fase 3 — Build, deploy e PR

### Task 16: Build completo e deploy em `c:\nfs`

- [ ] **Step 1: Extrair config Supabase do bundle atual** (valores embutidos no build de produção):

```bash
# URL (já confirmada): https://tneziinemoynndtngtur.supabase.co
grep -oE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+' c:/nfs/extensao/assets/index-CQuZclY0.js | head -1
```

Conferir os nomes das vars em `ui/src/lib/supabase.ts` e criar `ui/.env`:

```
VITE_SUPABASE_URL=https://tneziinemoynndtngtur.supabase.co
VITE_SUPABASE_ANON_KEY=<valor extraído acima>
```

(`.env` já está no `.gitignore` da UI — conferir; não commitar a chave.)

- [ ] **Step 2: Build API e UI**

```bash
cd api && npm ci && npm run build && npm test
cd ../ui && npm ci && npm run build
```

Expected: builds sem erro, testes PASS. Saídas: `api/dist/`, `ui/dist/`.

- [ ] **Step 3: Copiar assets da API** — garantir `api/dist/assets/nfse-logo.b64` (o tsc não copia assets):

```bash
mkdir -p api/dist/assets && cp api/src/assets/nfse-logo.b64 api/dist/assets/
```

- [ ] **Step 4: Deploy em produção local** (PowerShell):

```powershell
# backup
Copy-Item -Recurse c:\nfs\api\dist c:\nfs\api\dist.bak-20260803 -Force
# API: dist + manifests de deps
Remove-Item -Recurse -Force c:\nfs\api\dist
Copy-Item -Recurse c:\nfs\repo\api\dist c:\nfs\api\dist
Copy-Item c:\nfs\repo\api\package.json, c:\nfs\repo\api\package-lock.json c:\nfs\api\
# deps novas (qrcode) na instalação de produção
cd c:\nfs\api; npm install --omit=dev
# UI → extensão (preserva manifest.json, background.js e ícones)
Remove-Item -Recurse -Force c:\nfs\extensao\assets
Copy-Item -Recurse c:\nfs\repo\ui\dist\assets c:\nfs\extensao\assets
Copy-Item c:\nfs\repo\ui\dist\index.html c:\nfs\extensao\index.html
```

**Importante:** NÃO tocar em `c:\nfs\api\config.json` (dados reais do usuário).

- [ ] **Step 5: Reiniciar o backend** — o VBS da tarefa agendada relança sozinho:

```powershell
$pid3002 = (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1
if ($pid3002) { Stop-Process -Id $pid3002 -Force }
Start-Sleep 6
Invoke-RestMethod http://localhost:3002/health   # esperado: ok True
```

- [ ] **Step 6: Verificações pós-deploy**
  1. `Invoke-RestMethod http://localhost:3002/api/companies` → RAAVON com `outputFolder` corrigido (`Área` sem U+FFFD);
  2. Conferir no Explorer que as notas foram movidas da pasta fantasma para `...\OneDrive\Área de Trabalho\nfs\`;
  3. Pedir ao usuário para recarregar a extensão em `chrome://extensions` e validar: modal Buscar Notas com checkboxes; botão Gerar PDFs; um PDF gerado abre e mostra o layout NT 008 com QR.

- [ ] **Step 7: Commit final de ajustes** (se a validação exigir correções, commitá-las nesta branch).

### Task 17: Pull Request

- [ ] **Step 1: Push e PR**

```bash
cd c:/nfs/repo
git push -u origin feat/sync-rapido-pdf-local
gh pr create --base master --title "Sync rápido XML-only + DANFSe local NT 008/2026" --body "$(cat <<'EOF'
## Resumo
- Retro-port do build de produção para o fonte (base honesta)
- Busca de notas: só XMLs, seleção prestados/tomados, índice NSU local (re-buscas por período sem re-download)
- PDFs DANFSe gerados localmente no layout oficial NT 008/2026 (API do governo foi descontinuada em 03/08/2026) com QR Code e pool Puppeteer
- Evento de substituição tratado como cancelamento (pasta substituidas/, carimbo, relatórios)
- Correções: colisão de nomes de arquivo, lastNsu seguro, pasta mojibake (Área de Trabalho), autofilter Excel >26 colunas

## Testes
- vitest API e UI passando; validação manual do fluxo completo na instalação local

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Informar o usuário** — link do PR e instruções de recarga da extensão.

---

## Cobertura do spec (self-review)

| Spec | Task |
|---|---|
| 3.1 Buscar Notas (tipos, XML-only, período dhEmi/dhProc, sem-data salva) | 6, 7, 9, 13 |
| 3.2 Índice NSU, colisão, lastNsu, Retry-After | 5, 6, 7, 8 |
| 3.3 Gerar PDFs NT 008 + pool + carimbos + QR | 10, 11, 14 |
| DANFSe oficial do ADN com circuit breaker (emenda pós-design) | 2b, 11 |
| 3.4 Substituição (mover, carimbo, relatórios, índice) | 6, 10, 11, 15 |
| 3.5 Migração mojibake + `.local` | 12 |
| 3.6 Estrutura de pastas | 6 (substituidas/), 12 |
| Retro-port | 1–4 |
| Entrega/PR | 16, 17 |

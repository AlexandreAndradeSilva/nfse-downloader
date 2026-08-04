# Design — Sync rápido de XMLs + PDFs DANFSe locais (NT 008/2026)

**Data:** 2026-08-03
**Status:** aprovado pelo usuário (conversa de design)
**Branch:** `feat/sync-rapido-pdf-local`

## 1. Contexto e diagnóstico

- O app é uma extensão Chrome (React/Vite) + API Express local na porta 3002 que baixa NFS-e
  do Portal Nacional (ADN) via mTLS com certificado A1 e salva XML/PDF em pastas por
  empresa/competência.
- **O fonte no GitHub está atrasado**: o compilado em produção (`c:\nfs\api\dist` e o bundle
  da extensão, de 14–16/jun) contém recursos nunca commitados — tratamento de eventos,
  importação manual de XML, rota `regenerar-pdfs`, botão "PDFs Oficiais". O primeiro passo é
  retro-portar o compilado para o TypeScript/React do repo.
- **A API oficial de DANFSe foi descontinuada em 03/08/2026** (NT 008/2026). Diagnóstico
  feito com o certificado real: `adn.nfse.gov.br/danfse/*` → 503 (rota nunca existiu no
  Swagger do ADN); `sefin.nfse.gov.br/sefinnacional/danfse/*` → 501 em todas as notas;
  `sefinnacional/nfse/{chave}` → 200 (mTLS ok). Todo sistema emissor deve, a partir de
  agora, gerar o próprio DANFSe no layout padronizado "DANFSe 2.0" (NT 008/2026 v1.02).
- **Bug de encoding**: `config.json` tem `outputFolder` com U+FFFD (`�rea de Trabalho`).
  Existem duas pastas no OneDrive — a real (`Área de Trabalho`) e uma fantasma — e todas as
  notas estão indo para a fantasma.
- **Perda silenciosa de notas**: colisão de nome (`NFS 1.xml` de prestadores distintos em
  `tomados/`) descarta a terceira nota em diante sem aviso.
- **`lastNsu` inseguro**: erro de rede num NSU faz `currentNsu++` e o NSU falho nunca mais é
  buscado.

## 2. Requisitos (decisões do usuário)

1. Busca de notas muito mais rápida.
2. "Buscar Notas" com seleção de **Prestados / Tomados** (checkboxes, ambos marcados por
   padrão). Decisão: **salvar sempre os dois tipos** no disco (vêm juntos na resposta do
   ADN); a seleção controla o que o progresso/resumo destaca.
3. Sync baixa **somente XMLs**; PDFs são gerados depois, sob demanda, pelo botão de PDFs.
4. PDFs: **geração local no layout oficial NT 008/2026** (decisão explícita; a alternativa
   de tentar a API do governo foi descartada — API desligada).
5. Filtro de período **exato**: baixa toda nota cuja **data de emissão (`dhEmi`) OU
   geração/processamento (`dhProc`)** caia no período, mesmo com competência antiga.
   Eventos usam a data do evento (`dhCanc`/`dhSubst`/`dhEvento`).
6. **Evento de substituição de notas** (e110115/eSubst) com tratamento completo, espelhando
   o cancelamento.

## 3. Design

### 3.1 Fluxo "Buscar Notas"

- `SyncModal` e `CertificateSyncModal` ganham checkboxes ☑ Prestados ☑ Tomados e perdem o
  checkbox "Gerar PDF junto com XML".
- Rota `GET /api/sync/:cnpj` ganha `tipos=prestados,tomados` (default: ambos).
- O sync percorre o feed ADN por NSU e salva todos os XMLs (prestados, tomados e eventos).
  O SSE de progresso e o resumo final destacam apenas os tipos selecionados.
- Filtro de período: nota entra se `dhEmi` OU `dhProc` estiver no range
  (`[dataInicio 00:00, dataFim 23:59:59]` em horário de Brasília). Nota sem nenhuma data:
  **salva mesmo assim** (hoje é descartada em silêncio).

### 3.2 Velocidade

- **Índice local por empresa** — `<outputFolder>/<EMPRESA>/.nfse-index.json`:
  `{ nsu: { chave, dhEmi, dhProc, tipo, arquivo, evento? } }` + `maxNsu`.
  - Busca incremental (sem datas): continua do `lastNsu` como hoje.
  - Busca por período: consulta o índice e **só busca no ADN os NSUs faltantes** (buracos e
    acima do `maxNsu`). Notas já indexadas são resolvidas direto do disco. Repetir uma busca
    de período passa de minutos para segundos.
  - Índice ausente/corrompido → reconstruído varrendo os XMLs do disco.
- **Colisão de nomes**: `NFS {nNFSe}.xml`; em colisão real (arquivo existente com chave
  diferente), grava `NFS {nNFSe} ({8 últimos dígitos da chave}).xml`. Mesma chave = mesmo
  arquivo (idempotente, não regrava). Nada é descartado.
- **`lastNsu` seguro**: ao final, `lastNsu = (primeiro NSU com erro − 1)` se houve erro;
  caso contrário, o último NSU processado. Com filtro de data, preserva o maior valor já
  alcançado (comportamento atual mantido).
- **Retry 429/503 do feed**: respeita header `Retry-After` quando presente; backoff com
  jitter (±30%); máximo 4 tentativas.

### 3.3 Botão "Gerar PDFs" (substitui "PDFs Oficiais")

- Novo `GeneratePdfsModal`: período (datas), tipo (todos/prestados/tomados) e incluir
  canceladas/substituídas (default: sim).
- Rota `GET /api/notes/:cnpj/gerar-pdfs` (SSE; substitui `regenerar-pdfs`): para cada XML do
  filtro sem PDF correspondente, tenta o DANFSe oficial do ADN e cai no gerador local.
  Marcadores `.local` deixam de existir (migração os apaga).
- **Emenda pós-design (03/08/2026):** o endpoint oficial `https://adn.nfse.gov.br/danfse/{chave}`
  permanece no código, mas atrás de um **circuit breaker**: 1 tentativa por nota, timeout 5 s,
  e após 3 falhas consecutivas a tentativa é desligada pelo resto da execução (custo total
  ~15 s em vez de 52 s por nota). Medição em 03/08/2026 com o certificado real: 503
  `No server is available` em 100% das tentativas, enquanto `sefinnacional/nfse/{chave}`
  responde 200 com o mesmo mTLS — a rota `/danfse` está fora, não a conectividade. Se o
  serviço voltar, o PDF oficial volta a ser usado sem mudança de código. Notas canceladas e
  substituídas usam sempre o gerador local (precisam do carimbo).
- **Template NT 008/2026 v1.02 (DANFSe 2.0)**: novo `danfse-template.ts` seguindo a espec
  oficial (baixada como referência em `docs/referencias/`), incluindo QR Code de consulta
  pública (lib `qrcode`) e carimbo diagonal CANCELADA/SUBSTITUÍDA quando aplicável.
- **Motor**: instância única de Chromium (singleton com lazy-launch e shutdown por
  inatividade) com pool de 4 páginas em paralelo — em vez de 1 browser por nota (~10x mais
  rápido, memória estável).

### 3.4 Evento de substituição (novo)

Espelha o tratamento de cancelamento:

- Sync detecta e110115/eSubst (já detectava), salva o evento em `eventos/substituicoes/`.
- **Novo**: extrai a chave da nota substituída (`chNFSe`/`chSubstda`) e move a nota original
  de `MMYYYY/{tipo}/` para `MMYYYY/substituidas/`; PDF é regenerado com carimbo
  **SUBSTITUÍDA**. A nota substituta chega pelo feed como NFS-e normal e é salva normalmente.
- `buildCancelledIndex` vira `buildEventIndex` → `{ canceladas: Set<chave>,
  substituidas: Set<chave> }`; listagem de notas e relatórios ganham situação
  **SUBSTITUÍDA** (Excel: linha âmbar, coluna Situação).
- Localização da nota original usa o índice NSU (chave → arquivo) em vez de varrer todos os
  XMLs (o `moveCancelledNote` atual é O(eventos × notas) e casa por substring — passa a usar
  o índice também).

### 3.5 Correções embutidas

- **Migração one-shot no boot da API**:
  1. Normaliza `outputFolder` no config (U+FFFD → `Á` quando a pasta real existir).
  2. Move o conteúdo da pasta fantasma para a real (merge, sem sobrescrever; remove a
     fantasma se esvaziar).
  3. Apaga marcadores `.local` órfãos.
  4. Constrói o índice NSU inicial a partir dos XMLs existentes.
- Fora de escopo (próximo pacote): itens de segurança (senha do PFX em claro, CORS `*`,
  bind 0.0.0.0), instalador.

### 3.6 Estrutura de pastas resultante

```
<outputFolder>/<EMPRESA>/
  MMYYYY/prestados/   NFS 123.xml + NFS 123.pdf
  MMYYYY/tomados/     NFS 1 (26078835).xml …
  MMYYYY/canceladas/   (notas canceladas movidas, PDF carimbado)
  MMYYYY/substituidas/ (notas substituídas movidas, PDF carimbado)  ← novo
  eventos/canceladas|substituicoes|outros/*.xml
  .nfse-index.json
```

## 4. Componentes alterados

| Camada | Arquivo | Mudança |
|---|---|---|
| API | `services/sync-engine.ts` | XML-only, tipos, índice, lastNsu seguro |
| API | `services/nsu-index.ts` | **novo** — índice NSU por empresa |
| API | `services/xml-saver.ts` | colisão c/ chave, substituição, sem PDF inline |
| API | `services/adn-client.ts` | Retry-After + jitter |
| API | `services/danfse-generator.ts` | browser singleton + pool de páginas |
| API | `services/danfse-template.ts` | layout NT 008/2026 + QR + carimbos |
| API | `services/danfse-downloader.ts` | **removido** (API do governo morta) |
| API | `routes/sync.ts` | param `tipos`, resumo por tipo |
| API | `routes/notes.ts` | rota `gerar-pdfs`, situação substituída |
| API | `routes/reports.ts` | situação SUBSTITUÍDA, índice de eventos |
| API | `config-store.ts` / boot | migração one-shot |
| UI | `SyncModal` / `CertificateSyncModal` | checkboxes tipos, remove gerarPdf |
| UI | `GeneratePdfsModal` | **novo** — período/tipo/incluídas + SSE |
| UI | `TopNav` / `Dashboard` | botão "Gerar PDFs" (rename), badge SUBSTITUÍDA |

## 5. Tratamento de erros

- Sync aborta após 10 erros consecutivos (mantido); NSUs com erro não avançam `lastNsu`.
- Geração de PDF: falha em uma nota não interrompe o lote (contabilizada no resumo SSE).
- Índice corrompido/ausente: reconstrução automática a partir do disco.
- Migração de pastas: erro em um arquivo não bloqueia o boot (loga e segue).

## 6. Testes (vitest, `api/tests`)

- xml-saver: colisão de nomes (mesma chave = idempotente; chave diferente = sufixo),
  filtro `dhEmi`/`dhProc`, nota sem data é salva.
- sync-engine: `lastNsu` com erro no meio do range; contagem por tipo selecionado.
- nsu-index: gaps, reconstrução do disco, upsert.
- substituição: evento move nota + regenera PDF + índice de eventos.
- reports: situação SUBSTITUÍDA/CANCELADA no Excel.
- UI: SyncModal com checkboxes (testes existentes atualizados).

## 7. Entrega

1. Commit 1: retro-port do compilado (`dist` + bundle) para o fonte — base honesta.
2. Commits seguintes: features/correções acima, com testes.
3. PR `feat/sync-rapido-pdf-local` → `master` (base do repo).
4. Build API (`tsc`) + UI (`vite build`, com Supabase extraído do bundle atual para `.env`)
   e atualização de `c:\nfs` (api/dist + extensao/). Usuário recarrega a extensão.

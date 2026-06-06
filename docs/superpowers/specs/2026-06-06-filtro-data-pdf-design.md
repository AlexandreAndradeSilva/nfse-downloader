# Filtro de Data + Geração de PDF (DANFSE) — Design Specification

**Data:** 2026-06-06
**Status:** Aprovado

---

## Objetivo

Adicionar ao NFS-e Downloader duas funcionalidades:
1. **Filtro de período por data de emissão** — escolhido a cada sync via modal
2. **Geração de DANFSE em PDF** — gerado localmente a partir do XML, salvo junto com o XML

---

## Decisões de Arquitetura

- **Filtro de datas:** Opção A — baixa todos os NSUs até `NENHUM_DOCUMENTO_LOCALIZADO`, salva apenas os que estão dentro do período. NSU avança normalmente para documentos fora do range (datas não seguem ordem de NSU no ADN).
- **PDF:** Geração local via `puppeteer` (headless Chrome) + HTML template. O DANFSE API da Receita Federal retorna 502/404 — serviço indisponível.
- **Template:** HTML/CSS fiel ao layout oficial do DANFSe v1.0 com todas as seções: cabeçalho, emitente, tomador, serviço, tributação municipal/federal, valores.

---

## Arquivos Alterados / Criados

```
api/src/
  services/
    danfse-generator.ts   ← NOVO: parseia XML → HTML → PDF Buffer via puppeteer
    danfse-template.ts    ← NOVO: template HTML/CSS do DANFSE layout
    xml-saver.ts          ← MODIFICA: recebe dateRange, filtra por data, chama danfse-generator
    sync-engine.ts        ← MODIFICA: recebe e passa dateRange para xml-saver
  routes/
    sync.ts               ← MODIFICA: lê query params dataInicio/dataFim

ui/src/
  components/
    SyncModal.tsx         ← NOVO: modal com campos data início/fim + checkbox PDF
  pages/
    Dashboard.tsx         ← MODIFICA: "Sincronizar" abre SyncModal em vez de sync direto
  lib/
    api.ts                ← MODIFICA: startSync recebe dataInicio, dataFim, gerarPdf
```

---

## Interface do Usuário

**Modal de Sincronização** (aparece ao clicar "Sincronizar"):
```
┌─ Sincronizar: Empresa X ──────────────┐
│ Data início:  [2026-01-01]            │
│ Data fim:     [2026-06-30]            │
│ ☑ Gerar PDF junto com XML            │
│              [Cancelar]  [Sincronizar] │
└────────────────────────────────────────┘
```

- Datas pré-preenchidas: início = 1º do mês atual, fim = hoje
- Checkbox "Gerar PDF" marcado por padrão
- Datas opcionais: se ambas vazias, baixa tudo sem filtro

---

## Backend — Filtro de Datas

### `sync.ts` — query params
```
GET /api/sync/:cnpj?dataInicio=2026-01-01&dataFim=2026-06-30&gerarPdf=true
```

### `sync-engine.ts` — interface
```typescript
export interface SyncOptions {
  dataInicio?: Date;
  dataFim?: Date;
  gerarPdf: boolean;
}

export async function runSync(
  company: Company,
  fetchFn: FetchFn,
  onProgress: LogFn,
  options: SyncOptions
): Promise<SyncResult>
```

### `xml-saver.ts` — filtro
```typescript
// Extrai dataEmissao do XML (tenta dhEmissao, dCompet, dtEmissao)
// Se fora do range: retorna null (não salva arquivo)
// Se dentro do range: salva XML e, se gerarPdf=true, salva PDF
```

`decodeAndSave` retorna `SavedXmlInfo | null` — `null` significa "fora do período, pulado".

---

## Backend — Geração do DANFSE

### `danfse-generator.ts`
```typescript
export async function generateDanfse(xmlStr: string): Promise<Buffer>
```
- Parseia o XML com `fast-xml-parser`
- Preenche o template HTML com os campos extraídos
- Lança `puppeteer` em modo headless
- Retorna o Buffer do PDF

### Campos mapeados do XML NFS-e Nacional

| Seção DANFSE | Caminho no XML |
|---|---|
| Chave de Acesso | `infNFSe.chNFSe` |
| Número NFS-e | `infNFSe.nNFSe` |
| Competência | `infNFSe.dCompet` |
| Data/Hora Emissão | `infNFSe.dhEmissao` |
| Emitente CNPJ | `infNFSe.prestador.CNPJ` |
| Emitente IM | `infNFSe.prestador.IM` |
| Emitente Nome | `infNFSe.prestador.xNome` |
| Emitente Endereço | `infNFSe.prestador.endereco.*` |
| Tomador CNPJ/CPF | `infNFSe.tomador.CNPJ` ou `infNFSe.tomador.CPF` |
| Tomador Nome | `infNFSe.tomador.xNome` |
| Tomador Endereço | `infNFSe.tomador.endereco.*` |
| Serviço Cód. Nacional | `infNFSe.servico.cTribNac` |
| Serviço Cód. Municipal | `infNFSe.servico.cTribMun` |
| Serviço Descrição | `infNFSe.servico.xDescServ` |
| Local Prestação | `infNFSe.servico.cLocPrestacao` |
| Valor Serviço | `infNFSe.valores.vServico` |
| Desconto | `infNFSe.valores.vDescIncond` |
| BC ISSQN | `infNFSe.valores.vBC` |
| Alíquota ISSQN | `infNFSe.valores.pISSQN` |
| Valor ISSQN | `infNFSe.valores.vISSQN` |
| Retenção ISSQN | `infNFSe.valores.xSitTribISSQN` |
| IRRF | `infNFSe.valores.vIRRF` |
| PIS | `infNFSe.valores.vPIS` |
| COFINS | `infNFSe.valores.vCOFINS` |
| CSLL | `infNFSe.valores.vCSLL` |
| CP | `infNFSe.valores.vCP` |
| Valor Líquido | `infNFSe.valores.vLiq` |

### `danfse-template.ts`
Exporta função `buildDanfseHtml(data: DanfseData): string` que retorna HTML completo com:
- Layout A4, orientação retrato
- Cabeçalho: logo NFS-e (SVG inline), título "DANFSe v1.0", nome município
- Seções com bordas, grid de colunas igual ao modelo oficial
- Campos em branco quando não disponíveis no XML (não lança erro)

### Salvamento
```
{outputFolder}/{nomeEmpresa}/{MMYYYY}/prestados/000001-CHAVE.xml
{outputFolder}/{nomeEmpresa}/{MMYYYY}/prestados/000001-CHAVE.pdf  ← novo
```

---

## Tratamento de Erros

- **Falha no PDF**: loga `[AVISO] NSU X: PDF não gerado — {erro}` mas salva o XML normalmente e continua o sync
- **Nota fora do período**: loga `NSU X → fora do período (dataEmissao), pulado`
- **dataEmissao não encontrada no XML**: trata como dentro do período (salva)
- **puppeteer não instalado**: erro claro na inicialização do servidor

---

## Dependências Novas

```json
"puppeteer": "^22.0.0"
```

> `puppeteer` baixa o Chromium automaticamente (~170MB) no primeiro `npm install`. Esse download ocorre uma única vez.

---

## Fora do Escopo (v1)

- QR Code no DANFSE (requer biblioteca separada)
- Logo da prefeitura municipal (não disponível via API)
- Geração retroativa de PDFs para XMLs já baixados
- Personalização do template pelo usuário

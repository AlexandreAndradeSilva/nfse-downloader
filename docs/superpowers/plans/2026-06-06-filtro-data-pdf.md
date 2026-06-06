# Filtro de Data + Geração de DANFSE PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar filtro de período por data de emissão ao sync e geração automática do DANFSE em PDF (layout fiel ao oficial) junto com cada XML baixado.

**Architecture:** Backend: `danfse-template.ts` gera HTML, `danfse-generator.ts` converte para PDF via puppeteer, `xml-saver.ts` recebe `SyncOptions` com dateRange e chama o gerador. Frontend: novo `SyncModal.tsx` coleta datas e opção de PDF antes de iniciar o EventSource.

**Tech Stack:** puppeteer ^22, fast-xml-parser (já instalado), React (já instalado), Vitest + Testing Library

---

## File Map

```
api/src/services/
  danfse-template.ts     ← NOVO: buildDanfseHtml(data) → string HTML
  danfse-generator.ts    ← NOVO: generateDanfse(xmlStr) → Buffer PDF
  xml-saver.ts           ← MODIFICA: adiciona dateRange filter + gerarPdf
  sync-engine.ts         ← MODIFICA: adiciona SyncOptions, passa para decodeAndSave

api/src/routes/
  sync.ts                ← MODIFICA: lê query params dataInicio/dataFim/gerarPdf

ui/src/components/
  SyncModal.tsx          ← NOVO: modal com campos data + checkbox PDF

ui/src/lib/
  api.ts                 ← MODIFICA: startSync recebe SyncOptions

ui/src/pages/
  Dashboard.tsx          ← MODIFICA: Sincronizar abre SyncModal
  
ui/src/tests/
  SyncModal.test.tsx     ← NOVO: testes do modal
```

---

## XML Field Mapping (confirmado contra XML real)

Path raiz: `parsed.NFSe.infNFSe`

| Campo DANFSE | Path no XML | Exemplo |
|---|---|---|
| Chave de Acesso | `@_Id` (remove "NFS" do início) | `31062001...` |
| Número NFS-e | `nNFSe` | `2300000000025` |
| Competência | `DPS.infDPS.dCompet` | `2023-04-13` |
| Data/Hora Emissão | `DPS.infDPS.dhEmi` | `2023-04-13T10:12:22-03:00` |
| Número DPS | `DPS.infDPS.nDPS` | `2300000000025` |
| Série DPS | `DPS.infDPS.serie` | `75000` |
| Emitente CNPJ | `emit.CNPJ` | `19068927000191` |
| Emitente IM | `emit.IM` | `12283260010` |
| Emitente Nome | `emit.xNome` | `DATABRAND...` |
| Emitente Telefone | `emit.fone` | `3136560689` |
| Emitente Email | `emit.email` | `contato@...` |
| Emitente Logradouro | `emit.enderNac.xLgr` | `RUA FICUS` |
| Emitente Número | `emit.enderNac.nro` | `117` |
| Emitente Bairro | `emit.enderNac.xBairro` | `Inconfidência` |
| Emitente Município | `xLocEmi` | `BELO HORIZONTE` |
| Emitente UF | `emit.enderNac.UF` | `MG` |
| Emitente CEP | `emit.enderNac.CEP` | `30820220` |
| Simples Nacional | `DPS.infDPS.prest.regTrib.opSimpNac` | `3` (1=SN,3=não) |
| Tomador CNPJ | `DPS.infDPS.toma.CNPJ` | `02495060000158` |
| Tomador Nome | `DPS.infDPS.toma.xNome` | `IMPRINT...` |
| Tomador Logradouro | `DPS.infDPS.toma.end.xLgr` | `RUA GOIÁS` |
| Tomador Número | `DPS.infDPS.toma.end.nro` | `618` |
| Tomador Bairro | `DPS.infDPS.toma.end.xBairro` | `PIEDADE` |
| Tomador CEP | `DPS.infDPS.toma.end.endNac.CEP` | `20756121` |
| Tomador Telefone | `DPS.infDPS.toma.fone` | `21999899107` |
| Tomador Email | `DPS.infDPS.toma.email` | `andre@...` |
| Cód. Trib. Nacional | `DPS.infDPS.serv.cServ.cTribNac` | `140201` |
| Desc. Trib. Nacional | `xTribNac` | `Assistência técnica.` |
| Cód. Trib. Municipal | `DPS.infDPS.serv.cServ.cTribMun` | `001` |
| Desc. Trib. Municipal | `xTribMun` | `Assistência técnica` |
| Descrição Serviço | `DPS.infDPS.serv.cServ.xDescServ` | `SERVIÇO DE PRÉ-IMPRESSÃO...` |
| Local Prestação | `xLocPrestacao` | `BELO HORIZONTE` |
| Tributação ISSQN | `DPS.infDPS.valores.trib.tribMun.tribISSQN` | `1` |
| Retenção ISSQN | `DPS.infDPS.valores.trib.tribMun.tpRetISSQN` | `1` (1=Retido) |
| BC ISSQN | `valores.vBC` | `2866.67` |
| Valor Líquido | `valores.vLiq` | `2866.67` |
| Valor Serviço | `DPS.infDPS.valores.vServPrest.vServ` | `2866.67` |

---

## Task 1: Instalar puppeteer

**Files:**
- Modify: `api/package.json`

- [ ] **Step 1: Instalar puppeteer**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional\api"
npm install puppeteer
```

Aguardar o download do Chromium (~170MB). Saída esperada no final:
```
added X packages
```

- [ ] **Step 2: Verificar que o puppeteer abre o browser**

```bash
node --input-type=module << 'EOF'
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true });
const p = await b.newPage();
await p.setContent('<h1>ok</h1>');
const pdf = await p.pdf({ format: 'A4' });
await b.close();
console.log('PDF gerado:', pdf.length, 'bytes');
EOF
```

Saída esperada: `PDF gerado: XXXXX bytes` (número positivo)

- [ ] **Step 3: Commit**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
git add api/package.json api/package-lock.json
git commit -m "chore: instala puppeteer para geração de DANFSE PDF"
```

---

## Task 2: DANFSE Template (`danfse-template.ts`)

**Files:**
- Create: `api/src/services/danfse-template.ts`

- [ ] **Step 1: Criar `api/src/services/danfse-template.ts`**

```typescript
export interface DanfseData {
  chaveAcesso: string;
  numeroNFSe: string;
  competencia: string;
  dhEmissao: string;
  numeroDPS: string;
  serieDPS: string;
  // Emitente
  emitCnpj: string;
  emitIm: string;
  emitTelefone: string;
  emitNome: string;
  emitEmail: string;
  emitEndereco: string;
  emitMunicipio: string;
  emitCep: string;
  emitSimplesNac: string;
  // Tomador
  tomaCnpj: string;
  tomaNome: string;
  tomaEndereco: string;
  tomaMunicipio: string;
  tomaCep: string;
  tomaTelefone: string;
  tomaEmail: string;
  // Serviço
  cTribNac: string;
  xTribNac: string;
  cTribMun: string;
  xTribMun: string;
  xDescServ: string;
  xLocPrestacao: string;
  // Tributação
  tribISSQN: string;
  tpRetISSQN: string;
  vBC: string;
  pISSQN: string;
  vISSQN: string;
  // Valores
  vServico: string;
  vLiq: string;
  xMunicipioIncid: string;
}

function fmt(v: string | undefined | null): string {
  return v?.toString().trim() || '-';
}

function fmtCnpj(v: string): string {
  const d = v.replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return v;
}

function fmtCep(v: string): string {
  const d = v.replace(/\D/g, '');
  return d.length === 8 ? d.replace(/^(\d{5})(\d{3})$/, '$1-$2') : v;
}

function fmtMoeda(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n)) return '-';
  return `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function fmtFone(v: string): string {
  const d = v.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return v;
}

export function buildDanfseHtml(d: DanfseData): string {
  const retISSQN = d.tpRetISSQN === '1' ? 'Retido' : 'Não Retido';
  const simpNac = d.emitSimplesNac === '1' ? 'Simples Nacional' : d.emitSimplesNac === '2' ? 'Simples Nacional - Excesso' : 'Não optante';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color: #000; background: #fff; }
  .page { width: 210mm; padding: 4mm 6mm; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #555; padding: 2px 4px; vertical-align: top; }
  .lbl { font-size: 6pt; color: #444; display: block; margin-bottom: 1px; }
  .val { font-size: 7.5pt; font-weight: bold; }
  .sec { background: #1a1a2e; color: #fff; font-weight: bold; font-size: 7pt;
         padding: 3px 6px; letter-spacing: 0.5px; }
  .sec-light { background: #e8e8e8; font-weight: bold; font-size: 7pt; padding: 2px 6px; }
  .hdr-center { text-align: center; padding: 4px; }
  .hdr-logo { font-size: 14pt; font-weight: 900; color: #1565c0; padding: 6px; }
  .hdr-title { font-size: 11pt; font-weight: bold; }
  .hdr-sub { font-size: 8pt; }
  .chave { font-family: monospace; font-size: 8pt; word-break: break-all; }
  .banner { text-align: center; font-size: 7pt; font-style: italic;
            border: 1px solid #555; padding: 2px; background: #f5f5f5; }
  .info-complementar { min-height: 20mm; border: 1px solid #555; padding: 3px; }
  .no-border-top { border-top: none; }
  .noborder { border: none; }
</style>
</head>
<body>
<div class="page">

<!-- CABEÇALHO -->
<table style="margin-bottom:1mm">
  <tr>
    <td style="width:15%; border:1px solid #555; text-align:center; padding:4px">
      <div class="hdr-logo">NFS<span style="color:#e53935">e</span></div>
      <div style="font-size:6pt; color:#555">Nota Fiscal de<br>Serviço Eletrônica</div>
    </td>
    <td style="border:1px solid #555" class="hdr-center">
      <div class="hdr-title">DANFSe v1.0</div>
      <div class="hdr-sub">Documento Auxiliar da NFS-e</div>
    </td>
    <td style="width:25%; border:1px solid #555; text-align:center; padding:4px; font-size:7pt; font-weight:bold">
      ${fmt(d.xMunicipioIncid)}
    </td>
  </tr>
</table>

<!-- CHAVE DE ACESSO -->
<table style="margin-bottom:1mm">
  <tr>
    <td>
      <span class="lbl">Chave de Acesso da NFS-e</span>
      <span class="val chave">${fmt(d.chaveAcesso)}</span>
    </td>
  </tr>
</table>

<!-- NÚMERO / COMPETÊNCIA / EMISSÃO -->
<table style="margin-bottom:0">
  <tr>
    <td style="width:20%">
      <span class="lbl">Número da NFS-e</span>
      <span class="val">${fmt(d.numeroNFSe)}</span>
    </td>
    <td style="width:20%">
      <span class="lbl">Competência da NFS-e</span>
      <span class="val">${fmt(d.competencia)}</span>
    </td>
    <td style="width:35%">
      <span class="lbl">Data e Hora da emissão da NFS-e</span>
      <span class="val">${fmt(d.dhEmissao)}</span>
    </td>
    <td style="width:25%; font-size:6pt; color:#555; font-style:italic" rowspan="2">
      A autenticidade desta NFS-e pode ser verificada pela leitura do QR Code ou pela consulta da chave de acesso no portal nacional da NFS-e.
    </td>
  </tr>
  <tr>
    <td>
      <span class="lbl">Número da DPS</span>
      <span class="val">${fmt(d.numeroDPS)}</span>
    </td>
    <td>
      <span class="lbl">Série da DPS</span>
      <span class="val">${fmt(d.serieDPS)}</span>
    </td>
    <td>
      <span class="lbl">Data e Hora da emissão da DPS</span>
      <span class="val">${fmt(d.dhEmissao)}</span>
    </td>
  </tr>
</table>

<!-- EMITENTE -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">EMITENTE DA NFS-e / Prestador do Serviço</td></tr>
  <tr>
    <td style="width:35%">
      <span class="lbl">CNPJ / CPF / NIF</span>
      <span class="val">${fmtCnpj(d.emitCnpj)}</span>
    </td>
    <td style="width:35%">
      <span class="lbl">Inscrição Municipal</span>
      <span class="val">${fmt(d.emitIm)}</span>
    </td>
    <td style="width:30%">
      <span class="lbl">Telefone</span>
      <span class="val">${fmtFone(d.emitTelefone)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="lbl">Nome / Nome Empresarial</span>
      <span class="val">${fmt(d.emitNome)}</span>
    </td>
    <td>
      <span class="lbl">E-mail</span>
      <span class="val">${fmt(d.emitEmail)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="lbl">Endereço</span>
      <span class="val">${fmt(d.emitEndereco)}</span>
    </td>
    <td>
      <span class="lbl">Município</span>
      <span class="val">${fmt(d.emitMunicipio)}</span>
    </td>
  </tr>
  <tr>
    <td style="width:50%">
      <span class="lbl">Simples Nacional na Data da Competência</span>
      <span class="val">${simpNac}</span>
    </td>
    <td colspan="2">
      <span class="lbl">Regime de Apuração Tributária pelo SN</span>
      <span class="val">-</span>
    </td>
  </tr>
</table>

<!-- TOMADOR -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">TOMADOR DO SERVIÇO</td></tr>
  <tr>
    <td style="width:35%">
      <span class="lbl">CNPJ / CPF / NIF</span>
      <span class="val">${fmtCnpj(d.tomaCnpj)}</span>
    </td>
    <td style="width:35%">
      <span class="lbl">Inscrição Municipal</span>
      <span class="val">-</span>
    </td>
    <td style="width:30%">
      <span class="lbl">Telefone</span>
      <span class="val">${fmtFone(d.tomaTelefone)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="lbl">Nome / Nome Empresarial</span>
      <span class="val">${fmt(d.tomaNome)}</span>
    </td>
    <td>
      <span class="lbl">E-mail</span>
      <span class="val">${fmt(d.tomaEmail)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="lbl">Endereço</span>
      <span class="val">${fmt(d.tomaEndereco)}</span>
    </td>
    <td>
      <span class="lbl">Município / CEP</span>
      <span class="val">${fmt(d.tomaMunicipio)} — ${fmtCep(d.tomaCep)}</span>
    </td>
  </tr>
</table>

<!-- INTERMEDIARIO -->
<div class="banner" style="margin:1mm 0">INTERMEDIARIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-e</div>

<!-- SERVIÇO PRESTADO -->
<table style="margin-bottom:0">
  <tr><td colspan="4" class="sec">SERVIÇO PRESTADO</td></tr>
  <tr>
    <td style="width:30%">
      <span class="lbl">Código de Tributação Nacional</span>
      <span class="val">${fmt(d.cTribNac)} - ${fmt(d.xTribNac)}</span>
    </td>
    <td style="width:30%">
      <span class="lbl">Código de Tributação Municipal</span>
      <span class="val">${fmt(d.cTribMun)} - ${fmt(d.xTribMun)}</span>
    </td>
    <td style="width:20%">
      <span class="lbl">Local da Prestação</span>
      <span class="val">${fmt(d.xLocPrestacao)}</span>
    </td>
    <td style="width:20%">
      <span class="lbl">País da Prestação</span>
      <span class="val">-</span>
    </td>
  </tr>
  <tr>
    <td colspan="4">
      <span class="lbl">Descrição do Serviço</span>
      <span class="val">${fmt(d.xDescServ)}</span>
    </td>
  </tr>
</table>

<!-- TRIBUTAÇÃO MUNICIPAL -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">TRIBUTAÇÃO MUNICIPAL</td></tr>
  <tr>
    <td style="width:25%">
      <span class="lbl">Tributação do ISSQN</span>
      <span class="val">${d.tribISSQN === '1' ? 'Tributável' : fmt(d.tribISSQN)}</span>
    </td>
    <td style="width:25%">
      <span class="lbl">País Resultado da Prestação do Serviço</span>
      <span class="val">-</span>
    </td>
    <td style="width:25%">
      <span class="lbl">Município de Incidência do ISSQN</span>
      <span class="val">${fmt(d.xMunicipioIncid)}</span>
    </td>
    <td style="width:25%">
      <span class="lbl">Regime Especial de Tributação</span>
      <span class="val">Nenhum</span>
    </td>
  </tr>
  <tr>
    <td><span class="lbl">Tipo de Imunidade</span><span class="val">-</span></td>
    <td><span class="lbl">Suspensão da Exigibilidade do ISSQN</span><span class="val">-</span></td>
    <td><span class="lbl">Número Processo Suspensão</span><span class="val">-</span></td>
    <td><span class="lbl">Benefício Municipal</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td><span class="lbl">Valor do Serviço</span><span class="val">${fmtMoeda(d.vServico)}</span></td>
    <td><span class="lbl">Desconto Incondicionado</span><span class="val">-</span></td>
    <td><span class="lbl">Total Deduções/Reduções</span><span class="val">-</span></td>
    <td><span class="lbl">Cálculo do BM</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td><span class="lbl">BC ISSQN</span><span class="val">${fmtMoeda(d.vBC)}</span></td>
    <td><span class="lbl">Alíquota Aplicada</span><span class="val">${fmt(d.pISSQN)}</span></td>
    <td><span class="lbl">Retenção do ISSQN</span><span class="val">${retISSQN}</span></td>
    <td><span class="lbl">ISSQN Apurado</span><span class="val">${fmtMoeda(d.vISSQN)}</span></td>
  </tr>
</table>

<!-- TRIBUTAÇÃO FEDERAL -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">TRIBUTAÇÃO FEDERAL</td></tr>
  <tr>
    <td style="width:25%"><span class="lbl">IRRF</span><span class="val">-</span></td>
    <td style="width:25%"><span class="lbl">CP</span><span class="val">-</span></td>
    <td style="width:25%"><span class="lbl">CSLL</span><span class="val">-</span></td>
    <td style="width:25%"></td>
  </tr>
  <tr>
    <td><span class="lbl">PIS</span><span class="val">-</span></td>
    <td><span class="lbl">COFINS</span><span class="val">-</span></td>
    <td><span class="lbl">Retenção do PIS/COFINS</span><span class="val">-</span></td>
    <td><span class="lbl"><strong>TOTAL TRIBUTAÇÃO FEDERAL</strong></span><span class="val">-</span></td>
  </tr>
</table>

<!-- VALOR TOTAL DA NFS-E -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="4" class="sec">VALOR TOTAL DA NFS-E</td></tr>
  <tr>
    <td style="width:25%"><span class="lbl">Valor do Serviço</span><span class="val">${fmtMoeda(d.vServico)}</span></td>
    <td style="width:25%"><span class="lbl">Desconto Condicionado</span><span class="val">R$</span></td>
    <td style="width:25%"><span class="lbl">Desconto Incondicionado</span><span class="val">R$</span></td>
    <td style="width:25%"><span class="lbl">ISSQN Retido</span><span class="val">-</span></td>
  </tr>
  <tr>
    <td><span class="lbl">IRRF, CP, CSLL - Retidos</span><span class="val">R$ 0,00</span></td>
    <td><span class="lbl">PIS/COFINS Retidos</span><span class="val">-</span></td>
    <td></td>
    <td style="background:#fffde7">
      <span class="lbl"><strong>Valor Líquido da NFS-e</strong></span>
      <span class="val" style="font-size:10pt">${fmtMoeda(d.vLiq)}</span>
    </td>
  </tr>
</table>

<!-- TOTAIS TRIBUTOS -->
<table style="margin-top:1mm; margin-bottom:0">
  <tr><td colspan="3" class="sec-light">TOTAIS APROXIMADOS DOS TRIBUTOS</td></tr>
  <tr>
    <td style="width:33%; text-align:center"><span class="lbl">Federais</span><span class="val">-</span></td>
    <td style="width:33%; text-align:center"><span class="lbl">Estaduais</span><span class="val">-</span></td>
    <td style="width:34%; text-align:center"><span class="lbl">Municipais</span><span class="val">-</span></td>
  </tr>
</table>

<!-- INFORMAÇÕES COMPLEMENTARES -->
<table style="margin-top:1mm">
  <tr><td class="sec-light">INFORMAÇÕES COMPLEMENTARES</td></tr>
  <tr><td class="info-complementar" style="font-size:7pt; color:#333">
    Chave: ${fmt(d.chaveAcesso)}
  </td></tr>
</table>

</div>
</body>
</html>`;
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
git add api/src/services/danfse-template.ts
git commit -m "feat: template HTML do DANFSE v1.0 fiel ao layout oficial"
```

---

## Task 3: DANFSE Generator (`danfse-generator.ts`)

**Files:**
- Create: `api/src/services/danfse-generator.ts`
- Create: `api/tests/danfse-generator.test.ts`

- [ ] **Step 1: Escrever o teste com falha**

Criar `api/tests/danfse-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { promisify } from 'util';
import { generateDanfse } from '../src/services/danfse-generator.js';

const gzip = promisify(zlib.gzip);

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS31062001219068927000191230000000002523049575199774">
    <xLocEmi>BELO HORIZONTE</xLocEmi>
    <xLocPrestacao>BELO HORIZONTE</xLocPrestacao>
    <nNFSe>2300000000025</nNFSe>
    <cLocIncid>3106200</cLocIncid>
    <xLocIncid>BELO HORIZONTE</xLocIncid>
    <xTribNac>Assistência técnica.</xTribNac>
    <xTribMun>Assistência técnica</xTribMun>
    <dhProc>2023-04-13T10:12:22-03:00</dhProc>
    <emit>
      <CNPJ>19068927000191</CNPJ>
      <IM>12283260010</IM>
      <xNome>DATABRAND COMERCIO E SERVICOS LTDA</xNome>
      <enderNac><xLgr>RUA FICUS</xLgr><nro>117</nro><xBairro>Inconfidência</xBairro><cMun>3106200</cMun><UF>MG</UF><CEP>30820220</CEP></enderNac>
      <fone>3136560689</fone>
      <email>contato@databrand.com.br</email>
    </emit>
    <valores><vBC>2866.67</vBC><vLiq>2866.67</vLiq></valores>
    <DPS versao="1.00">
      <infDPS Id="DPS1">
        <dhEmi>2023-04-13T10:12:22-03:00</dhEmi>
        <serie>75000</serie>
        <nDPS>2300000000025</nDPS>
        <dCompet>2023-04-13</dCompet>
        <prest>
          <CNPJ>19068927000191</CNPJ>
          <regTrib><opSimpNac>3</opSimpNac></regTrib>
        </prest>
        <toma>
          <CNPJ>02495060000158</CNPJ>
          <xNome>IMPRINT 2001 LTDA</xNome>
          <end><endNac><cMun>3304557</cMun><CEP>20756121</CEP></endNac><xLgr>RUA GOIÁS</xLgr><nro>618</nro><xBairro>PIEDADE</xBairro></end>
          <fone>21999899107</fone>
          <email>andre@aerographic.com.br</email>
        </toma>
        <serv>
          <locPrest><cLocPrestacao>3106200</cLocPrestacao></locPrest>
          <cServ><cTribNac>140201</cTribNac><cTribMun>001</cTribMun><xDescServ>SERVIÇO DE PRÉ-IMPRESSÃO</xDescServ></cServ>
        </serv>
        <valores>
          <vServPrest><vServ>2866.67</vServ></vServPrest>
          <trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun></trib>
        </valores>
      </infDPS>
    </DPS>
  </infNFSe>
</NFSe>`;

describe('danfse-generator', () => {
  it('gera um Buffer PDF não vazio a partir de XML válido', async () => {
    const pdf = await generateDanfse(sampleXml);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    // PDFs começam com %PDF
    expect(pdf.slice(0, 4).toString()).toBe('%PDF');
  }, 30000); // timeout de 30s para puppeteer

  it('não lança erro com XML sem todos os campos', async () => {
    const minimalXml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS123"><nNFSe>1</nNFSe><emit><CNPJ>00000000000000</CNPJ></emit><valores><vBC>0</vBC><vLiq>0</vLiq></valores></infNFSe>
</NFSe>`;
    await expect(generateDanfse(minimalXml)).resolves.toBeDefined();
  }, 30000);
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd api
npm test -- tests/danfse-generator.test.ts
```

Saída esperada: FAIL — `Cannot find module '../src/services/danfse-generator.js'`

- [ ] **Step 3: Criar `api/src/services/danfse-generator.ts`**

```typescript
import puppeteer from 'puppeteer';
import { XMLParser } from 'fast-xml-parser';
import { buildDanfseHtml, type DanfseData } from './danfse-template.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

function s(v: unknown): string {
  return v?.toString().trim() ?? '';
}

function fmtDate(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtCompetencia(dCompet: string): string {
  if (!dCompet) return '-';
  const [year, month] = dCompet.split('-');
  return `${month}/${year}`;
}

function extractDanfseData(xmlStr: string): DanfseData {
  const parsed = parser.parse(xmlStr);
  const inf = parsed?.NFSe?.infNFSe ?? {};
  const dps = inf?.DPS?.infDPS ?? {};
  const prest = dps?.prest ?? {};
  const toma = dps?.toma ?? {};
  const serv = dps?.serv ?? {};
  const cServ = serv?.cServ ?? {};
  const locPrest = serv?.locPrest ?? {};
  const valoresDps = dps?.valores ?? {};
  const tribMun = valoresDps?.trib?.tribMun ?? {};
  const vServPrest = valoresDps?.vServPrest ?? {};
  const valoresNfse = inf?.valores ?? {};
  const emit = inf?.emit ?? {};
  const enderNac = emit?.enderNac ?? {};
  const tomaEnd = toma?.end ?? {};
  const tomaEndNac = tomaEnd?.endNac ?? {};

  // Chave: remove prefixo "NFS" do atributo Id
  const idAttr = s(inf?.['@_Id'] ?? '');
  const chaveAcesso = idAttr.startsWith('NFS') ? idAttr.slice(3) : idAttr;

  const emitEndereco = [s(enderNac.xLgr), s(enderNac.nro), s(enderNac.xBairro)]
    .filter(Boolean).join(', ');
  const emitMunicipio = s(inf.xLocEmi) || s(emit?.enderNac?.cMun);
  const emitCep = s(enderNac.CEP);

  const tomaEndereco = [s(tomaEnd.xLgr), s(tomaEnd.nro), s(tomaEnd.xBairro)]
    .filter(Boolean).join(', ');
  const tomaMunicipio = s(tomaEndNac.cMun);
  const tomaCep = s(tomaEndNac.CEP);

  return {
    chaveAcesso: chaveAcesso || s(valoresNfse.xOutInf).match(/\d{50}/)?.[0] ?? '-',
    numeroNFSe: s(inf.nNFSe),
    competencia: fmtCompetencia(s(dps.dCompet)),
    dhEmissao: fmtDate(s(dps.dhEmi) || s(inf.dhProc)),
    numeroDPS: s(dps.nDPS),
    serieDPS: s(dps.serie),
    emitCnpj: s(emit.CNPJ),
    emitIm: s(emit.IM),
    emitTelefone: s(emit.fone),
    emitNome: s(emit.xNome),
    emitEmail: s(emit.email),
    emitEndereco,
    emitMunicipio,
    emitCep,
    emitSimplesNac: s(prest?.regTrib?.opSimpNac),
    tomaCnpj: s(toma.CNPJ),
    tomaNome: s(toma.xNome),
    tomaEndereco,
    tomaMunicipio,
    tomaCep,
    tomaTelefone: s(toma.fone),
    tomaEmail: s(toma.email),
    cTribNac: s(cServ.cTribNac),
    xTribNac: s(inf.xTribNac),
    cTribMun: s(cServ.cTribMun),
    xTribMun: s(inf.xTribMun),
    xDescServ: s(cServ.xDescServ),
    xLocPrestacao: s(inf.xLocPrestacao) || s(locPrest.cLocPrestacao),
    tribISSQN: s(tribMun.tribISSQN),
    tpRetISSQN: s(tribMun.tpRetISSQN),
    vBC: s(valoresNfse.vBC),
    pISSQN: '-',
    vISSQN: '-',
    vServico: s(vServPrest.vServ),
    vLiq: s(valoresNfse.vLiq),
    xMunicipioIncid: s(inf.xLocIncid) || s(inf.xLocEmi),
  };
}

export async function generateDanfse(xmlStr: string): Promise<Buffer> {
  const data = extractDanfseData(xmlStr);
  const html = buildDanfseHtml(data);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
npm test -- tests/danfse-generator.test.ts
```

Saída esperada: `2 passed` (pode demorar ~10s na primeira vez)

- [ ] **Step 5: Rodar todos os testes**

```bash
npm test
```

Saída esperada: todos passam (10 anteriores + 2 novos = 12 passed)

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
git add api/src/services/danfse-generator.ts api/tests/danfse-generator.test.ts
git commit -m "feat: danfse-generator gera PDF A4 via puppeteer com dados do XML"
```

---

## Task 4: Modificar `xml-saver.ts` — filtro de data + PDF

**Files:**
- Modify: `api/src/services/xml-saver.ts`
- Modify: `api/tests/xml-saver.test.ts`

- [ ] **Step 1: Atualizar testes em `api/tests/xml-saver.test.ts`**

Substituir o conteúdo completo do arquivo:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import zlib from 'zlib';
import { promisify } from 'util';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { decodeAndSave } from '../src/services/xml-saver.js';

const gzip = promisify(zlib.gzip);

function makeXml(cnpjPrestador: string, dCompet: string, dhEmi: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS21060000000012345600001">
    <xLocEmi>SAO PAULO</xLocEmi><xLocPrestacao>SAO PAULO</xLocPrestacao>
    <nNFSe>1</nNFSe><cLocIncid>3550308</cLocIncid><xLocIncid>SAO PAULO</xLocIncid>
    <xTribNac>Serviço</xTribNac><xTribMun>Serviço</xTribMun>
    <emit>
      <CNPJ>${cnpjPrestador}</CNPJ><IM>123</IM><xNome>Empresa Prestadora</xNome>
      <enderNac><xLgr>RUA A</xLgr><nro>1</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>01001000</CEP></enderNac>
    </emit>
    <valores><vBC>100</vBC><vLiq>100</vLiq></valores>
    <DPS versao="1.00">
      <infDPS Id="DPS1">
        <dhEmi>${dhEmi}</dhEmi><serie>1</serie><nDPS>1</nDPS><dCompet>${dCompet}</dCompet>
        <prest><CNPJ>${cnpjPrestador}</CNPJ><regTrib><opSimpNac>3</opSimpNac></regTrib></prest>
        <toma><CNPJ>98765432000199</CNPJ><xNome>Empresa Tomadora</xNome>
          <end><endNac><cMun>3550308</cMun><CEP>01001000</CEP></endNac><xLgr>RUA B</xLgr><nro>2</nro><xBairro>Centro</xBairro></end>
        </toma>
        <serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest>
          <cServ><cTribNac>010100</cTribNac><cTribMun>001</cTribMun><xDescServ>Serviço de teste</xDescServ></cServ>
        </serv>
        <valores><vServPrest><vServ>100</vServ></vServPrest>
          <trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>2</tpRetISSQN></tribMun></trib>
        </valores>
      </infDPS>
    </DPS>
  </infNFSe>
</NFSe>`;
}

async function toBase64GZip(xml: string): Promise<string> {
  const buf = await gzip(Buffer.from(xml, 'utf-8'));
  return buf.toString('base64');
}

const OUTPUT = join(process.cwd(), 'test-output');
const CNPJ = '12345678000100';

afterEach(() => {
  if (existsSync(OUTPUT)) rmSync(OUTPUT, { recursive: true });
});

describe('xml-saver', () => {
  it('classifica como prestado quando emitente == cnpj da empresa', async () => {
    const b64 = await toBase64GZip(makeXml(CNPJ, '2026-06-10', '2026-06-10T10:00:00-03:00'));
    const result = await decodeAndSave(b64, 1501, CNPJ, OUTPUT, 'Empresa Teste');
    expect(result?.tipo).toBe('prestados');
    expect(result?.competencia).toBe('062026');
    expect(existsSync(result!.filePath)).toBe(true);
  });

  it('classifica como tomado quando emitente != cnpj da empresa', async () => {
    const b64 = await toBase64GZip(makeXml('98765432000199', '2026-06-20', '2026-06-20T10:00:00-03:00'));
    const result = await decodeAndSave(b64, 1502, CNPJ, OUTPUT, 'Empresa Teste');
    expect(result?.tipo).toBe('tomados');
  });

  it('não sobrescreve arquivo existente', async () => {
    const b64 = await toBase64GZip(makeXml(CNPJ, '2026-06-10', '2026-06-10T10:00:00-03:00'));
    const r1 = await decodeAndSave(b64, 1501, CNPJ, OUTPUT, 'Empresa Teste');
    const { statSync } = await import('fs');
    const mtime1 = statSync(r1!.filePath).mtimeMs;
    await new Promise(r => setTimeout(r, 10));
    await decodeAndSave(b64, 1501, CNPJ, OUTPUT, 'Empresa Teste');
    expect(statSync(r1!.filePath).mtimeMs).toBe(mtime1);
  });

  it('retorna null quando data está fora do range', async () => {
    const b64 = await toBase64GZip(makeXml(CNPJ, '2026-06-10', '2026-06-10T10:00:00-03:00'));
    const result = await decodeAndSave(b64, 1503, CNPJ, OUTPUT, 'Empresa Teste', {
      dataInicio: new Date('2026-07-01'),
      dataFim: new Date('2026-07-31'),
    });
    expect(result).toBeNull();
    // Nenhum arquivo deve ter sido criado
    expect(existsSync(join(OUTPUT, 'Empresa Teste'))).toBe(false);
  });

  it('salva quando data está dentro do range', async () => {
    const b64 = await toBase64GZip(makeXml(CNPJ, '2026-06-10', '2026-06-10T10:00:00-03:00'));
    const result = await decodeAndSave(b64, 1504, CNPJ, OUTPUT, 'Empresa Teste', {
      dataInicio: new Date('2026-06-01'),
      dataFim: new Date('2026-06-30'),
    });
    expect(result).not.toBeNull();
    expect(result?.tipo).toBe('prestados');
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd api
npm test -- tests/xml-saver.test.ts
```

Saída esperada: FAIL — novos testes falham (interface de `decodeAndSave` ainda não aceita dateRange)

- [ ] **Step 3: Atualizar `api/src/services/xml-saver.ts`**

```typescript
import zlib from 'zlib';
import { promisify } from 'util';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { generateDanfse } from './danfse-generator.js';

const gunzip = promisify(zlib.gunzip);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

export interface DateRange {
  dataInicio?: Date;
  dataFim?: Date;
}

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
  nomeEmpresa: string,
  dateRange?: DateRange,
  gerarPdf = false
): Promise<SavedXmlInfo | null> {
  const buffer = Buffer.from(xmlBase64Gzip, 'base64');
  const decompressed = await gunzip(buffer);
  const xmlStr = decompressed.toString('utf-8');

  const parsed = parser.parse(xmlStr);
  const infNFSe = parsed?.NFSe?.infNFSe ?? {};
  const dps = infNFSe?.DPS?.infDPS ?? {};

  const chaveAcesso: string = (() => {
    const idAttr = infNFSe?.['@_Id'] ?? '';
    return idAttr.startsWith('NFS') ? idAttr.slice(3) : String(idAttr || nsu);
  })();

  const competencia = extractCompetencia(infNFSe);
  const dataEmissao = extractDataEmissao(dps, infNFSe);

  // Filtro de data (Opção A: pula se fora do range, sem parar o loop)
  if (dateRange && dataEmissao) {
    if (dateRange.dataInicio && dataEmissao < dateRange.dataInicio) return null;
    if (dateRange.dataFim && dataEmissao > dateRange.dataFim) return null;
  }

  const cnpjPrestador: string = String(infNFSe?.emit?.CNPJ ?? '');
  const tipo: 'prestados' | 'tomados' =
    cnpjPrestador.replace(/\D/g, '') === cnpjEmpresa.replace(/\D/g, '')
      ? 'prestados'
      : 'tomados';

  const dir = join(outputFolder, nomeEmpresa, competencia, tipo);
  mkdirSync(dir, { recursive: true });

  const base = String(nsu).padStart(9, '0') + '-' + chaveAcesso;
  const xmlPath = join(dir, `${base}.xml`);

  if (!existsSync(xmlPath)) {
    writeFileSync(xmlPath, xmlStr, 'utf-8');
  }

  if (gerarPdf) {
    const pdfPath = join(dir, `${base}.pdf`);
    if (!existsSync(pdfPath)) {
      try {
        const pdfBuf = await generateDanfse(xmlStr);
        writeFileSync(pdfPath, pdfBuf);
      } catch (err) {
        // Loga aviso mas não aborta — o XML já foi salvo
        console.warn(`[AVISO] PDF não gerado para NSU ${nsu}: ${(err as Error).message}`);
      }
    }
  }

  return { nsu, tipo, competencia, filePath: xmlPath, chaveAcesso };
}

function extractDataEmissao(dps: Record<string, unknown>, infNFSe: Record<string, unknown>): Date | null {
  const raw = String(dps?.dhEmi ?? infNFSe?.dhProc ?? '');
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function extractCompetencia(infNFSe: Record<string, unknown>): string {
  const dps = (infNFSe?.DPS as Record<string, unknown>)?.infDPS as Record<string, unknown>;
  const raw = String(dps?.dCompet ?? infNFSe?.dCompet ?? infNFSe?.dtEmissao ?? new Date().toISOString());
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[2]}${match[1]}`;
  return `${String(new Date().getMonth() + 1).padStart(2, '0')}${new Date().getFullYear()}`;
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
npm test -- tests/xml-saver.test.ts
```

Saída esperada: `5 passed`

- [ ] **Step 5: Rodar todos os testes**

```bash
npm test
```

Saída esperada: 14 passed (10 anteriores + 2 danfse + 2 novos xml-saver)

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
git add api/src/services/xml-saver.ts api/tests/xml-saver.test.ts
git commit -m "feat: xml-saver filtra por data de emissão e gera PDF via danfse-generator"
```

---

## Task 5: Modificar `sync-engine.ts` — SyncOptions

**Files:**
- Modify: `api/src/services/sync-engine.ts`
- Modify: `api/tests/sync-engine.test.ts`

- [ ] **Step 1: Atualizar `api/src/services/sync-engine.ts`** (arquivo completo):

```typescript
import type { Company, AdnDistribuicaoResponse } from '../types.js';
import { decodeAndSave, type DateRange } from './xml-saver.js';

export interface SyncOptions {
  dateRange?: DateRange;
  gerarPdf: boolean;
}

export interface SyncResult {
  prestados: number;
  tomados: number;
  pulados: number;
  errors: number;
  lastNsu: number;
}

type FetchFn = (nsu: number, cnpj: string) => Promise<AdnDistribuicaoResponse>;
type LogFn = (message: string) => void;

export async function runSync(
  company: Company,
  fetchFn: FetchFn,
  onProgress: LogFn,
  options: SyncOptions = { gerarPdf: false }
): Promise<SyncResult> {
  let currentNsu = company.lastNsu + 1;
  let prestados = 0;
  let tomados = 0;
  let pulados = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;

  while (true) {
    let response: AdnDistribuicaoResponse;
    try {
      response = await fetchFn(currentNsu, company.cnpj);
      consecutiveErrors = 0;
    } catch (err) {
      errors++;
      consecutiveErrors++;
      onProgress(`[ERRO] NSU ${currentNsu}: ${(err as Error).message}`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        onProgress(`[FATAL] ${MAX_CONSECUTIVE_ERRORS} erros consecutivos — sync abortado.`);
        break;
      }
      currentNsu++;
      continue;
    }

    if (response.StatusProcessamento === 'NENHUM_DOCUMENTO_LOCALIZADO') break;

    if (response.StatusProcessamento === 'REJEICAO') {
      const msg = response.Erros?.map(e => e.Descricao).join(', ') ?? 'Rejeição sem detalhes';
      onProgress(`[REJEIÇÃO] NSU ${currentNsu}: ${msg}`);
      break;
    }

    const lote = response.LoteDFe ?? [];
    for (const item of lote) {
      const nsu = item.NSU;
      try {
        const saved = await decodeAndSave(
          item.ArquivoXml,
          nsu,
          company.cnpj,
          company.outputFolder,
          company.nome,
          options.dateRange,
          options.gerarPdf
        );
        if (saved === null) {
          pulados++;
          onProgress(`NSU ${nsu} → fora do período, pulado`);
        } else {
          if (saved.tipo === 'prestados') prestados++;
          else tomados++;
          const pdfNote = options.gerarPdf ? ' + PDF' : '';
          onProgress(`NSU ${nsu} → ${saved.tipo} (${saved.competencia}) salvo${pdfNote}`);
        }
        if (nsu >= currentNsu) currentNsu = nsu + 1;
      } catch (err) {
        errors++;
        onProgress(`[ERRO] NSU ${nsu}: ${(err as Error).message}`);
        currentNsu = nsu + 1;
      }
    }
  }

  return { prestados, tomados, pulados, errors, lastNsu: currentNsu - 1 };
}
```

- [ ] **Step 2: Atualizar testes em `api/tests/sync-engine.test.ts`**

Substituir o conteúdo:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { runSync } from '../src/services/sync-engine.js';
import type { AdnDistribuicaoResponse, Company } from '../src/types.js';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const OUTPUT = join(process.cwd(), 'test-sync-output');

async function makeXmlB64(cnpjPrestador: string, nsu: number, dCompet = '2026-06-10'): Promise<string> {
  const dhEmi = `${dCompet}T10:00:00-03:00`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS2106${String(nsu).padStart(20,'0')}">
    <xLocEmi>SAO PAULO</xLocEmi><xLocPrestacao>SAO PAULO</xLocPrestacao>
    <nNFSe>${nsu}</nNFSe><xLocIncid>SAO PAULO</xLocIncid>
    <xTribNac>Serviço</xTribNac><xTribMun>Serviço</xTribMun>
    <emit><CNPJ>${cnpjPrestador}</CNPJ><IM>1</IM><xNome>Emit</xNome>
      <enderNac><xLgr>R</xLgr><nro>1</nro><xBairro>B</xBairro><cMun>3550308</cMun><UF>SP</UF><CEP>01001000</CEP></enderNac>
    </emit>
    <valores><vBC>100</vBC><vLiq>100</vLiq></valores>
    <DPS versao="1.00"><infDPS Id="DPS${nsu}">
      <dhEmi>${dhEmi}</dhEmi><serie>1</serie><nDPS>${nsu}</nDPS><dCompet>${dCompet}</dCompet>
      <prest><CNPJ>${cnpjPrestador}</CNPJ><regTrib><opSimpNac>3</opSimpNac></regTrib></prest>
      <toma><CNPJ>98765432000199</CNPJ><xNome>Toma</xNome>
        <end><endNac><cMun>3550308</cMun><CEP>01001000</CEP></endNac><xLgr>R2</xLgr><nro>2</nro><xBairro>B2</xBairro></end>
      </toma>
      <serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest>
        <cServ><cTribNac>010100</cTribNac><cTribMun>001</cTribMun><xDescServ>Serviço ${nsu}</xDescServ></cServ>
      </serv>
      <valores><vServPrest><vServ>100</vServ></vServPrest>
        <trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>2</tpRetISSQN></tribMun></trib>
      </valores>
    </infDPS></DPS>
  </infNFSe>
</NFSe>`;
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
        LoteDFe: [{ NSU: 101, ChaveAcesso: '101', TipoDocumento: 'NFSE', ArquivoXml: xmlB64 }],
        Alertas: null, Erros: null,
      } satisfies AdnDistribuicaoResponse)
      .mockResolvedValueOnce({
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null, Alertas: null, Erros: null,
      } satisfies AdnDistribuicaoResponse);

    const events: string[] = [];
    const result = await runSync(company, mockFetch, (msg) => events.push(msg), { gerarPdf: false });

    expect(result.prestados).toBe(1);
    expect(result.tomados).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.lastNsu).toBe(101);
    expect(events.some(e => e.includes('NSU 101'))).toBe(true);
  });

  it('conta pulados quando nota está fora do período', async () => {
    const xmlB64 = await makeXmlB64('12345678000100', 102, '2026-05-10');
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS',
        LoteDFe: [{ NSU: 102, ChaveAcesso: '102', TipoDocumento: 'NFSE', ArquivoXml: xmlB64 }],
        Alertas: null, Erros: null,
      } satisfies AdnDistribuicaoResponse)
      .mockResolvedValueOnce({
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null, Alertas: null, Erros: null,
      } satisfies AdnDistribuicaoResponse);

    const result = await runSync(company, mockFetch, () => {}, {
      gerarPdf: false,
      dateRange: { dataInicio: new Date('2026-06-01'), dataFim: new Date('2026-06-30') },
    });
    expect(result.pulados).toBe(1);
    expect(result.prestados).toBe(0);
  });

  it('conta erro mas continua o loop quando um NSU falha', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO',
        LoteDFe: null, Alertas: null, Erros: null,
      } satisfies AdnDistribuicaoResponse);

    const result = await runSync(company, mockFetch, () => {}, { gerarPdf: false });
    expect(result.errors).toBe(1);
  });
});
```

- [ ] **Step 3: Rodar testes**

```bash
cd api && npm test
```

Saída esperada: 16 passed

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
git add api/src/services/sync-engine.ts api/tests/sync-engine.test.ts
git commit -m "feat: sync-engine aceita SyncOptions com dateRange e gerarPdf"
```

---

## Task 6: Modificar `sync.ts` — query params

**Files:**
- Modify: `api/src/routes/sync.ts`

- [ ] **Step 1: Atualizar `api/src/routes/sync.ts`** (arquivo completo):

```typescript
import { existsSync, statSync } from 'fs';
import { Router } from 'express';
import { getCompany, updateLastNsu } from '../config-store.js';
import { fetchDFeLote } from '../services/adn-client.js';
import { runSync, type SyncOptions } from '../services/sync-engine.js';

export const syncRouter = Router();

syncRouter.get('/:cnpj', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);

  if (!company) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  if (!existsSync(company.pfxPath)) {
    res.status(400).json({ error: `Certificado não encontrado: ${company.pfxPath}` });
    return;
  }
  if (statSync(company.pfxPath).isDirectory()) {
    res.status(400).json({ error: `O caminho informado é uma pasta, não um arquivo .pfx: ${company.pfxPath}` });
    return;
  }

  // Lê parâmetros opcionais
  const { dataInicio, dataFim, gerarPdf } = req.query as Record<string, string>;
  const options: SyncOptions = {
    gerarPdf: gerarPdf === 'true',
    dateRange: (dataInicio || dataFim) ? {
      dataInicio: dataInicio ? new Date(dataInicio) : undefined,
      dataFim: dataFim ? new Date(dataFim + 'T23:59:59') : undefined,
    } : undefined,
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type: string, data: unknown) => {
    res.write(`data: ${JSON.stringify({ type, ...data as object })}\n\n`);
  };

  const filtroMsg = options.dateRange
    ? ` | Período: ${dataInicio ?? '...'} → ${dataFim ?? '...'}`
    : ' | Sem filtro de data';
  send('progress', { message: `Iniciando sync para ${company.nome} (NSU: ${company.lastNsu})${filtroMsg}` });

  try {
    const fetchFn = (nsu: number, cnpjConsulta: string) =>
      fetchDFeLote(
        { baseUrl: company.baseUrl, pfxPath: company.pfxPath, pfxPassword: company.pfxPassword },
        nsu, cnpjConsulta
      );

    const result = await runSync(company, fetchFn, (message) => send('progress', { message }), options);
    updateLastNsu(cnpj, result.lastNsu);

    send('done', {
      message: `Concluído: ${result.prestados} prestados, ${result.tomados} tomados, ${result.pulados} pulados, ${result.errors} erros`,
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

- [ ] **Step 2: Commit**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
git add api/src/routes/sync.ts
git commit -m "feat: sync route aceita query params dataInicio, dataFim e gerarPdf"
```

---

## Task 7: Componente `SyncModal.tsx` (frontend, TDD)

**Files:**
- Create: `ui/src/components/SyncModal.tsx`
- Create: `ui/src/tests/SyncModal.test.tsx`

- [ ] **Step 1: Criar `ui/src/tests/SyncModal.test.tsx`**

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SyncModal } from '../components/SyncModal';

describe('SyncModal', () => {
  it('não renderiza quando open=false', () => {
    render(<SyncModal open={false} companyName="Empresa X" onClose={vi.fn()} onSync={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('exibe nome da empresa e campos de data', () => {
    render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={vi.fn()} />);
    expect(screen.getByText(/Sincronizar: Empresa X/)).toBeInTheDocument();
    expect(screen.getByLabelText(/data início/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/data fim/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gerar pdf/i)).toBeInTheDocument();
  });

  it('chama onSync com os valores preenchidos', () => {
    const onSync = vi.fn();
    render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={onSync} />);
    fireEvent.change(screen.getByLabelText(/data início/i), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText(/data fim/i), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
    expect(onSync).toHaveBeenCalledWith({
      dataInicio: '2026-01-01',
      dataFim: '2026-06-30',
      gerarPdf: true,
    });
  });

  it('permite sincronizar sem datas (baixa tudo)', () => {
    const onSync = vi.fn();
    render(<SyncModal open={true} companyName="Empresa X" onClose={vi.fn()} onSync={onSync} />);
    fireEvent.click(screen.getByRole('button', { name: /sincronizar/i }));
    expect(onSync).toHaveBeenCalledWith(expect.objectContaining({
      dataInicio: '',
      dataFim: '',
    }));
  });
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd ui && npm test -- src/tests/SyncModal.test.tsx
```

Saída esperada: FAIL — `Cannot find module '../components/SyncModal'`

- [ ] **Step 3: Criar `ui/src/components/SyncModal.tsx`**

```typescript
import { useState } from 'react';

export interface SyncOptions {
  dataInicio: string;
  dataFim: string;
  gerarPdf: boolean;
}

interface Props {
  open: boolean;
  companyName: string;
  onClose: () => void;
  onSync: (opts: SyncOptions) => void;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function SyncModal({ open, companyName, onClose, onSync }: Props) {
  const [dataInicio, setDataInicio] = useState(firstOfMonth);
  const [dataFim, setDataFim] = useState(today);
  const [gerarPdf, setGerarPdf] = useState(true);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSync({ dataInicio, dataFim, gerarPdf });
  };

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold mb-4">Sincronizar: {companyName}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="dataInicio" className="block text-sm font-medium text-gray-700 mb-1">
              Data início
            </label>
            <input
              id="dataInicio"
              type="date"
              value={dataInicio}
              onChange={e => setDataInicio(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="dataFim" className="block text-sm font-medium text-gray-700 mb-1">
              Data fim
            </label>
            <input
              id="dataFim"
              type="date"
              value={dataFim}
              onChange={e => setDataFim(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="gerarPdf"
              type="checkbox"
              checked={gerarPdf}
              onChange={e => setGerarPdf(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="gerarPdf" className="text-sm font-medium text-gray-700">
              Gerar PDF junto com XML
            </label>
          </div>
          <p className="text-xs text-gray-400">
            Deixe as datas em branco para baixar todos os documentos disponíveis.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit"
              className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">
              Sincronizar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar testes para confirmar que passam**

```bash
npm test -- src/tests/SyncModal.test.tsx
```

Saída esperada: `4 passed`

- [ ] **Step 5: Rodar todos os testes do frontend**

```bash
npm test
```

Saída esperada: 12 passed (8 anteriores + 4 SyncModal)

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
git add ui/src/components/SyncModal.tsx ui/src/tests/SyncModal.test.tsx
git commit -m "feat: SyncModal com campos de data e checkbox de PDF"
```

---

## Task 8: Atualizar `api.ts` e `Dashboard.tsx`

**Files:**
- Modify: `ui/src/lib/api.ts`
- Modify: `ui/src/pages/Dashboard.tsx`

- [ ] **Step 1: Atualizar `ui/src/lib/api.ts`**

Substituir a função `startSync`:

```typescript
import type { Company, SyncProgress } from '../types';
import type { SyncOptions } from '../components/SyncModal';

export type { Company };
export type { SyncOptions };

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
  opts: SyncOptions,
  onEvent: (event: SyncProgress) => void,
  onClose: () => void
): EventSource {
  const params = new URLSearchParams();
  if (opts.dataInicio) params.set('dataInicio', opts.dataInicio);
  if (opts.dataFim) params.set('dataFim', opts.dataFim);
  if (opts.gerarPdf) params.set('gerarPdf', 'true');
  const qs = params.toString();
  const es = new EventSource(`/api/sync/${cnpj}${qs ? '?' + qs : ''}`);
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

- [ ] **Step 2: Atualizar `ui/src/pages/Dashboard.tsx`**

Substituir o conteúdo completo:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { CompanyCard } from '../components/CompanyCard';
import { AddCompanyModal } from '../components/AddCompanyModal';
import { SyncLogPanel, type LogEntry } from '../components/SyncLogPanel';
import { SyncModal, type SyncOptions } from '../components/SyncModal';
import { listCompanies, createCompany, updateCompany, deleteCompany, startSync } from '../lib/api';
import type { Company } from '../types';

export function Dashboard() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [syncModalCnpj, setSyncModalCnpj] = useState<string | null>(null);
  const logIdRef = useRef(0);

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'progress') => {
    logIdRef.current += 1;
    const id = logIdRef.current;
    setLogs(prev => [...prev.slice(-200), { id, text, type }]);
  }, []);

  const load = useCallback(async () => {
    const data = await listCompanies();
    setCompanies(data);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const handleSyncStart = (opts: SyncOptions) => {
    const cnpj = syncModalCnpj!;
    setSyncModalCnpj(null);
    setSyncing(prev => ({ ...prev, [cnpj]: true }));
    setLogs([]);
    startSync(
      cnpj,
      opts,
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

  const syncingCompany = companies.find(c => c.cnpj === syncModalCnpj);

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
                onSync={(cnpj) => setSyncModalCnpj(cnpj)}
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

- [ ] **Step 3: Rodar todos os testes do frontend**

```bash
cd ui && npm test
```

Saída esperada: 12 passed (todos os testes anteriores continuam passando)

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\rafae\OneDrive\Área de Trabalho\nfs nacional"
git add ui/src/lib/api.ts ui/src/pages/Dashboard.tsx
git commit -m "feat: Dashboard usa SyncModal para coletar datas e opção de PDF"
```

---

## Verificação End-to-End

- [ ] Reiniciar o servidor backend (`npx tsx src/server.ts` na pasta `api/`)
- [ ] Abrir `http://localhost:5175` no browser
- [ ] Clicar "Sincronizar" → confirmar que o `SyncModal` abre com datas pré-preenchidas
- [ ] Preencher um período (ex: 01/06/2026 a 30/06/2026) e marcar "Gerar PDF"
- [ ] Confirmar no log que aparece `+ PDF` nas notas salvas
- [ ] Verificar que arquivos `.pdf` foram criados na pasta `imprint/062026/tomados/`
- [ ] Testar sem datas → confirmar que baixa tudo sem filtro

---

## Notas Importantes

1. **Puppeteer e Chrome sandbox no Windows:** se o PDF falhar com erro de sandbox, o `--no-sandbox` já está configurado na função `generateDanfse`.

2. **Ajuste de campos do template:** os campos de ISSQN apurado, alíquota, totais de tributos federais e municipais ficam como "-" porque esses dados não estão presentes no XML de exemplo (são calculados pela prefeitura). O layout visual ainda fiel ao oficial.

3. **Performance:** a geração de PDF com puppeteer demora ~1-3 segundos por nota. Para syncs grandes (400+ notas), isso pode levar vários minutos. O log mostrará o progresso em tempo real.

4. **URL de homologação:** `https://adn.producaorestrita.nfse.gov.br/contribuintes` (mesmo path `/contribuintes`, domínio diferente).

# Redesign Visual — NFS-e Downloader

**Data:** 2026-06-07
**Status:** Aprovado

---

## Objetivo

Redesenhar a interface do NFS-e Downloader com visual profissional dark/gradiente, separando a gestão de empresas em tela dedicada e transformando o Dashboard em um painel de métricas com contadores e resumo financeiro.

---

## Decisões de Design

- **Paleta:** Dark com gradiente índigo/roxo (`#1e1b4b → #0f0e1a`), accent `#6366f1 / #8b5cf6`
- **Navegação:** Top nav com duas abas — Dashboard e Empresas
- **Sem log visível:** O log de sincronização não aparece no dashboard (fica apenas no modal durante o processo)
- **Valores financeiros:** Calculados em tempo real lendo os XMLs já baixados em disco

---

## Estrutura de Páginas

### Top Nav (fixo em todas as telas)
- Logo + título "NFS-e Downloader" / "Portal Nacional"
- Abas: Dashboard | Empresas
- Botão "🔍 Buscar Notas" (abre CertificateSyncModal)

### Dashboard
**Linha 1 — 3 cards (grid 1.7fr 1fr 1fr):**
- Card Empresa Ativa: nome, CNPJ, último sync, pasta, NSU atual
- Card Notas Tomadas: contador grande + barra gradiente
- Card Notas Prestadas: contador grande + barra gradiente

**Linha 2 — 2 cards financeiros (grid 1fr 1fr):**
- Card "Total Serviços Tomados": valor total (`vLiq` somado), ISS retido, PIS/COFINS, Valor Líquido
- Card "Total Serviços Prestados": mesmos campos

### Empresas (tela separada)
- Cabeçalho: título + botão "+ Cadastro manual"
- Lista de cards por empresa: avatar com inicial, nome, CNPJ, último sync, NSU, contadores Tomados/Prestados, botões Sync / Editar / Remover

---

## Cálculo dos Valores Financeiros

**Novo endpoint:** `GET /api/stats/:cnpj?periodo=062026`

Backend lê os XMLs das pastas `prestados/` e `tomados/` da empresa (filtrando pelo período se informado), parseia com `fast-xml-parser` e soma:

| Campo DANFSE | Path no XML |
|---|---|
| Valor do Serviço | `DPS.infDPS.valores.vServPrest.vServ` |
| Valor Líquido | `NFSe.infNFSe.valores.vLiq` |
| ISS Retido | calculado: `vBC × pAliq / 100` quando `tpRetISSQN=2` |
| PIS | `DPS.infDPS.valores.trib.tribFed.piscofins.vPis` |
| COFINS | `DPS.infDPS.valores.trib.tribFed.piscofins.vCofins` |

Retorna `{ tomados: { total, issRetido, pisCofins, liquido, count }, prestados: { ... } }`

---

## Arquivos a Criar / Modificar

```
ui/src/
  pages/
    Dashboard.tsx      ← REESCREVER — novo layout visual
    Empresas.tsx       ← CRIAR — tela de empresas separada
  components/
    TopNav.tsx         ← CRIAR — navegação top com abas
  lib/
    api.ts             ← MODIFICAR — adicionar fetchStats()

api/src/
  routes/
    stats.ts           ← CRIAR — GET /api/stats/:cnpj
  services/
    xml-reader.ts      ← CRIAR — lê XMLs do disco e soma valores
  server.ts            ← MODIFICAR — registra statsRouter
```

---

## Componentes Removidos

- `SyncLogPanel.tsx` — não aparece mais no dashboard (mantido apenas dentro do modal de sync)
- Log de sincronização — visível apenas durante o processo no modal

---

## Fora do Escopo

- Gráficos de evolução temporal
- Filtro de período no dashboard (mostra período atual do último sync)
- Exportação de relatório financeiro

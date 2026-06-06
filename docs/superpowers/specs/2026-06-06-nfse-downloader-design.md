# NFS-e Downloader — Design Specification

**Data:** 2026-06-06
**Projeto:** nfs nacional
**Status:** Aprovado

---

## Objetivo

Sistema separado (não vinculado ao SpedCompiler) para buscar XMLs de Notas Fiscais de Serviços Eletrônicas (NFS-e) — prestadas e tomadas — diretamente da API do ADN (Ambiente de Distribuição Nacional) do Portal Nacional NFS-e, e salvá-los organizados em disco.

---

## Decisões de Arquitetura

- **Runtime:** Node.js + Express (backend) + React + Vite (frontend)
- **Comunicação:** dois projetos separados; Vite roda em `:5173` com proxy para Express em `:3001`
- **Progresso em tempo real:** Server-Sent Events (SSE)
- **Persistência:** arquivo `config.json` local (sem banco de dados)
- **Certificado digital:** arquivo `.pfx` lido do disco pelo backend; nunca sai da máquina do usuário
- **Autenticação na API ADN:** Mutual TLS via `https.Agent` do Node.js

---

## Estrutura de Pastas do Projeto

```
nfs nacional/
├── api/                        ← Backend Node.js + Express + TypeScript
│   ├── src/
│   │   ├── server.ts
│   │   ├── routes/
│   │   │   ├── companies.ts
│   │   │   └── sync.ts
│   │   ├── services/
│   │   │   ├── adn-client.ts
│   │   │   ├── xml-saver.ts
│   │   │   └── sync-engine.ts
│   │   └── config-store.ts
│   ├── config.json             ← Criado automaticamente na primeira execução
│   ├── public/                 ← Build do React (produção)
│   └── package.json
│
├── ui/                         ← Frontend React + Vite + Tailwind + shadcn/ui
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   └── Dashboard.tsx
│   │   └── components/
│   │       ├── CompanyCard.tsx
│   │       ├── AddCompanyModal.tsx
│   │       └── SyncLogPanel.tsx
│   └── package.json
│
└── docs/
    └── superpowers/specs/
        └── 2026-06-06-nfse-downloader-design.md
```

---

## Organização dos Arquivos no Disco

Cada XML baixado é salvo em:

```
{outputFolder}\{nomeEmpresa}\{MMYYYY}\prestados\{NSU}-{chaveAcesso}.xml
{outputFolder}\{nomeEmpresa}\{MMYYYY}\tomados\{NSU}-{chaveAcesso}.xml
```

**Exemplos:**
```
C:\NFSe\Empresa X Ltda\062026\prestados\001501-21060000000012345600001.xml
C:\NFSe\Empresa X Ltda\062026\tomados\001502-21060000000098765600001.xml
```

- `MMYYYY` é extraído da tag `<dtEmissao>` ou `<competencia>` do XML.
- Prestado/tomado é determinado comparando o CNPJ emitente do XML com o CNPJ da empresa.
- Se o arquivo já existe, é pulado (sem sobrescrever).

---

## Modelo de Dados (`config.json`)

```json
{
  "companies": [
    {
      "cnpj": "12345678000100",
      "nome": "Empresa X Ltda",
      "pfxPath": "C:\\Certificados\\empresa-x.pfx",
      "pfxPassword": "senha123",
      "outputFolder": "C:\\NFSe",
      "ambiente": "PRODUCAO",
      "lastNsu": 1500,
      "lastSync": "2026-06-05T14:32:00.000Z"
    }
  ]
}
```

> `lastNsu` é único por empresa. O ADN retorna tanto prestados quanto tomados no mesmo lote — a distinção é feita pelo conteúdo do XML, não por endpoints separados.

---

## API Backend (Express)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/companies` | Lista empresas cadastradas |
| `POST` | `/api/companies` | Cadastra nova empresa |
| `PUT` | `/api/companies/:cnpj` | Edita empresa |
| `DELETE` | `/api/companies/:cnpj` | Remove empresa |
| `POST` | `/api/sync/:cnpj` | Inicia sync (resposta via SSE) |
| `GET` | `/api/sync/:cnpj/status` | Último resultado da sync |

---

## API ADN Utilizada

**Base URL produção:** `https://nfse.receita.fazenda.gov.br/adn`
**Base URL homologação:** `https://hom-nfse.receita.fazenda.gov.br/adn`

| Endpoint | Uso |
|----------|-----|
| `GET /DFe/{NSU}?cnpjConsulta={cnpj}&lote=true` | Busca lote de documentos a partir do NSU |

> O endpoint `/NFSe/{ChaveAcesso}/Eventos` (eventos por chave de acesso) está fora do escopo desta versão.

---

## Fluxo de Sincronização

1. Frontend envia `POST /api/sync/:cnpj` e abre conexão SSE.
2. Backend lê o `.pfx` do disco e cria `https.Agent` com mutual TLS.
3. Busca `GET /DFe/{lastNsu+1}?cnpjConsulta={cnpj}&lote=true`.
4. Para cada documento no lote:
   - Decodifica base64 → descomprime GZip → obtém XML.
   - Extrai competência e CNPJ emitente do XML.
   - Determina `prestados/` ou `tomados/`.
   - Salva o arquivo no caminho correto.
   - Atualiza `lastNsu` no `config.json`.
   - Emite evento SSE para o frontend.
5. Repete com o maior NSU recebido até obter `NENHUM_DOCUMENTO_LOCALIZADO`.
6. Emite evento SSE final com resumo (total prestados, total tomados, erros).
7. Fecha conexão SSE.

**Tratamento de erros:** erros de um NSU individual são logados via SSE mas não interrompem o loop.

---

## Interface Visual

**Dashboard (tela única):**
- Cabeçalho com nome do sistema e botão "+ Empresa"
- Lista de cards de empresas com:
  - Nome, CNPJ, último sync, NSU atual, pasta de saída
  - Botões: Editar, Sincronizar
  - Indicador de status (nunca sincronizado / sincronizado em X / sincronizando...)
- Painel de log em tempo real na parte inferior (SSE)

**Modal Adicionar/Editar Empresa:**
- Nome da empresa (texto)
- CNPJ (texto com máscara)
- Caminho do `.pfx` (texto)
- Senha do certificado (password)
- Pasta de saída (texto)
- Ambiente: Produção / Homologação (select)
- NSU inicial (número, opcional — default: 0)

---

## Tecnologias

| Camada | Stack |
|--------|-------|
| Backend | Node.js 20+, Express 5, TypeScript |
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
| Comunicação | REST + SSE (Server-Sent Events) |
| TLS | `https.Agent` nativo do Node.js com `pfx` + `passphrase` |
| Descompressão | `zlib` nativo do Node.js |

---

## Fora do Escopo (v1)

- Envio/recepção de NFS-e (POST /DFe da API de Recepção)
- Busca de eventos por chave de acesso
- Autenticação de usuários no sistema
- Armazenamento em banco de dados
- Deploy em servidor remoto
- Geração de SPED ou relatórios a partir dos XMLs baixados

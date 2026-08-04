import { Router } from 'express';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { getCompany } from '../config-store.js';
import type { Situacao } from '../types.js';
import { buildEventIndex } from '../services/xml-reader.js';
import { importRawXml, isWithinRange } from '../services/xml-saver.js';
import { NsuIndex } from '../services/nsu-index.js';
import { generateDanfse, type DanfseStamp } from '../services/danfse-generator.js';
import { downloadDanfsePdf, resetDanfseBreaker, isDanfseBreakerOpen } from '../services/danfse-downloader.js';

export const notesRouter = Router();

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

function s(v: unknown): string { return v?.toString().trim() ?? ''; }
function n(v: unknown): number {
  const num = parseFloat(String(v ?? '0'));
  return isNaN(num) ? 0 : num;
}
function safeDirRead(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir); } catch { return []; }
}

function fmtDateBR(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR'); // DD/MM/AAAA
}

export interface NoteItem {
  numeroNFSe: string;
  cnpj: string;       // cnpj da outra parte (prestador p/ tomados; tomador p/ prestados)
  nome: string;
  dataEmissao: string; // DD/MM/AAAA
  valorServico: number;
  periodo: string;
  cancelada: boolean;  // mantido por compatibilidade com a UI anterior
  situacao: Situacao;
}

interface ParsedNote extends NoteItem {
  chaveAcesso: string;
}

function parseNote(xml: string, tipo: 'tomados' | 'prestados'): ParsedNote | null {
  try {
    const parsed = parser.parse(xml);
    const inf = parsed?.NFSe?.infNFSe ?? {};
    const dps = inf?.DPS?.infDPS ?? {};
    const emit = inf?.emit ?? {};
    const toma = dps?.toma ?? {};
    const vServPrest = dps?.valores?.vServPrest ?? {};
    const valoresNfse = inf?.valores ?? {};

    // Extrai chaveAcesso do atributo Id (para cruzar com cancelamentos)
    const idAttr = String(inf?.['@_Id'] ?? '');
    const chaveAcesso = idAttr.startsWith('NFS') ? idAttr.slice(3) : idAttr;

    const dataEmissao = fmtDateBR(s(dps.dhEmi || inf.dhProc));
    const valorServico = n(vServPrest.vServ || valoresNfse.vBC);

    if (tipo === 'tomados') {
      // Emitida por: o prestador
      return {
        numeroNFSe: s(inf.nNFSe),
        cnpj: s(emit.CNPJ).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
        nome: s(emit.xNome),
        dataEmissao,
        valorServico,
        periodo: s(dps.dCompet),
        cancelada: false,
        situacao: 'ativa',
        chaveAcesso,
      };
    } else {
      // Emitida para: o tomador
      return {
        numeroNFSe: s(inf.nNFSe),
        cnpj: s(toma.CNPJ).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
        nome: s(toma.xNome),
        dataEmissao,
        valorServico,
        periodo: s(dps.dCompet),
        cancelada: false,
        situacao: 'ativa',
        chaveAcesso,
      };
    }
  } catch { return null; }
}

// GET /api/notes/:cnpj?tipo=tomados|prestados&page=1&limit=10
notesRouter.get('/:cnpj', (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const tipo = (req.query.tipo as string) === 'prestados' ? 'prestados' : 'tomados';
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10)));

  const company = getCompany(cnpj);
  if (!company) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

  const companyDir = join(company.outputFolder, company.nome);
  // Índice de eventos: chaves de notas canceladas e substituídas
  const eventos = buildEventIndex(company.outputFolder, company.nome);
  const allNotes: NoteItem[] = [];
  const cnpjEmp = cnpj.replace(/\D/g, '').padStart(14, '0');

  const push = (note: ParsedNote, situacao: Situacao) => {
    note.situacao = situacao;
    note.cancelada = situacao === 'cancelada';
    const { chaveAcesso: _ch, ...noteItem } = note;
    void _ch;
    allNotes.push(noteItem);
  };

  for (const period of safeDirRead(companyDir)) {
    // Ignora a pasta "eventos" (não é um período)
    if (period === 'eventos') continue;

    const periodDir = join(companyDir, period);

    // Notas ativas
    const tipoDir = join(periodDir, tipo);
    for (const file of safeDirRead(tipoDir)) {
      if (!file.endsWith('.xml')) continue;
      try {
        const xml = readFileSync(join(tipoDir, file), 'utf-8');
        const note = parseNote(xml, tipo);
        if (!note) continue;
        const situacao: Situacao = eventos.canceladas.has(note.chaveAcesso) ? 'cancelada'
          : eventos.substituidas.has(note.chaveAcesso) ? 'substituida'
          : 'ativa';
        push(note, situacao);
      } catch { /* pula */ }
    }

    // Notas encerradas por evento, já movidas para as subpastas dedicadas
    for (const [sub, situacao] of [['canceladas', 'cancelada'], ['substituidas', 'substituida']] as const) {
      for (const file of safeDirRead(join(periodDir, sub))) {
        if (!file.endsWith('.xml')) continue;
        try {
          const xml = readFileSync(join(periodDir, sub, file), 'utf-8');
          // O tipo é detectado pelo CNPJ do emitente: a subpasta não o distingue
          const parsedXml = parser.parse(xml);
          const emitCnpj = String(parsedXml?.NFSe?.infNFSe?.emit?.CNPJ ?? '').replace(/\D/g, '').padStart(14, '0');
          const tipoDetect = emitCnpj === cnpjEmp ? 'prestados' : 'tomados';
          if (tipoDetect !== tipo) continue;

          const note = parseNote(xml, tipo);
          if (note) push(note, situacao);
        } catch { /* pula */ }
      }
    }
  }

  // Ordena por data decrescente (mais recente primeiro)
  allNotes.sort((a, b) => {
    const da = a.dataEmissao.split('/').reverse().join('-');
    const db = b.dataEmissao.split('/').reverse().join('-');
    return db.localeCompare(da);
  });

  const total = allNotes.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const items = allNotes.slice((page - 1) * limit, page * limit);

  res.json({ items, total, page, totalPages, limit });
});

// GET /api/notes/:cnpj/gerar-pdfs — SSE: gera o DANFSe dos XMLs que ainda não têm PDF
// Query: dataInicio?, dataFim? (YYYY-MM-DD), tipo? = todos|prestados|tomados,
//        incluirEncerradas? = 'false' para pular canceladas/substituídas
notesRouter.get('/:cnpj/gerar-pdfs', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);
  if (!company) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

  const tipoFiltro = String(req.query.tipo ?? 'todos');
  const incluirEncerradas = req.query.incluirEncerradas !== 'false';
  const dataInicio = String(req.query.dataInicio ?? '');
  const dataFim = String(req.query.dataFim ?? '');
  const range = (dataInicio || dataFim) ? {
    dataInicio: dataInicio ? new Date(dataInicio + 'T00:00:00-03:00') : undefined,
    dataFim: dataFim ? new Date(dataFim + 'T23:59:59-03:00') : undefined,
  } : undefined;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (type: string, data: object) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  interface PdfJob { xmlPath: string; pdfPath: string; stamp?: DanfseStamp }
  const companyDir = join(company.outputFolder, company.nome);
  const subPastas: Array<{ nome: string; stamp?: DanfseStamp }> = [
    { nome: 'prestados' },
    { nome: 'tomados' },
    ...(incluirEncerradas
      ? [{ nome: 'canceladas', stamp: 'CANCELADA' as const }, { nome: 'substituidas', stamp: 'SUBSTITUIDA' as const }]
      : []),
  ];

  const jobs: PdfJob[] = [];
  for (const period of safeDirRead(companyDir)) {
    if (period === 'eventos') continue;
    for (const { nome, stamp } of subPastas) {
      // O filtro de tipo não se aplica às encerradas: a subpasta não distingue tipo
      if (!stamp && tipoFiltro !== 'todos' && tipoFiltro !== nome) continue;
      const dir = join(companyDir, period, nome);
      for (const file of safeDirRead(dir)) {
        if (!file.endsWith('.xml')) continue;
        const xmlPath = join(dir, file);
        const pdfPath = xmlPath.replace(/\.xml$/, '.pdf');
        if (existsSync(pdfPath)) continue; // já tem PDF
        if (range) {
          try {
            const xml = readFileSync(xmlPath, 'utf-8');
            const dhEmi = xml.match(/<dhEmi[^>]*>([^<]+)<\/dhEmi>/)?.[1] ?? null;
            const dhProc = xml.match(/<dhProc[^>]*>([^<]+)<\/dhProc>/)?.[1] ?? null;
            if (!isWithinRange({ dhEmi, dhProc }, range)) continue;
          } catch { continue; }
        }
        jobs.push({ xmlPath, pdfPath, stamp });
      }
    }
  }

  send('progress', { message: `${jobs.length} nota(s) sem PDF para gerar.` });
  if (jobs.length === 0) {
    send('done', { message: 'Todas as notas do filtro já têm PDF.', oficiais: 0, locais: 0, erros: 0 });
    res.end();
    return;
  }

  // Nova execução → nova chance para o DANFSe oficial do ADN
  resetDanfseBreaker();
  const temCert = Boolean(company.pfxPath && company.pfxPassword);
  let oficiais = 0, locais = 0, erros = 0;
  const CONCURRENCY = 4;

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    await Promise.allSettled(batch.map(async ({ xmlPath, pdfPath, stamp }) => {
      try {
        const xmlStr = readFileSync(xmlPath, 'utf-8');
        let pdf: Buffer | null = null;

        // 1) DANFSe oficial do ADN — barato: 1 tentativa, breaker desliga após 3 falhas.
        //    Notas encerradas precisam do carimbo, então vão direto ao gerador local.
        if (temCert && !stamp) {
          const chave = xmlStr.match(/Id="NFS([^"]{44,})"/)?.[1] ?? '';
          if (chave.length >= 44) {
            pdf = await downloadDanfsePdf(chave, company.pfxPath, company.pfxPassword);
            if (pdf) oficiais++;
          }
        }
        // 2) Gerador local no layout NT 008/2026
        if (!pdf) { pdf = await generateDanfse(xmlStr, stamp); locais++; }

        writeFileSync(pdfPath, pdf);
      } catch { erros++; }
    }));
    send('progress', { message: `${Math.min(i + CONCURRENCY, jobs.length)}/${jobs.length} gerados...` });
  }

  const nota = isDanfseBreakerOpen() ? ' (DANFSe oficial do ADN indisponível nesta execução)' : '';
  send('done', {
    message: `Concluído: ${oficiais} oficial(is) do ADN, ${locais} gerado(s) localmente, ${erros} erro(s)${nota}`,
    oficiais, locais, erros,
  });
  res.end();
});

// POST /api/notes/:cnpj/import — importa XML de NFS-e manualmente (corpo: text/xml ou application/xml)
notesRouter.post('/:cnpj/import', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);
  if (!company) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

  let xmlStr: string;
  if (typeof req.body === 'string' && req.body.trim().startsWith('<')) {
    xmlStr = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    xmlStr = req.body.toString('utf-8');
  } else {
    res.status(400).json({ error: 'Corpo da requisição deve ser o XML da NFS-e (Content-Type: text/xml)' });
    return;
  }

  try {
    const companyDir = join(company.outputFolder, company.nome);
    mkdirSync(companyDir, { recursive: true });
    const index = NsuIndex.load(companyDir);

    const saved = await importRawXml(xmlStr, company.cnpj, company.outputFolder, company.nome, index);
    if (!saved) {
      res.status(422).json({ error: 'XML não reconhecido como NFS-e válida' });
      return;
    }
    index.save();
    res.json({ ok: true, tipo: saved.tipo, competencia: saved.competencia, filePath: saved.filePath });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

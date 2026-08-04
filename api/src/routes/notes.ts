import { Router } from 'express';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { getCompany } from '../config-store.js';
import { buildCancelledIndex } from '../services/xml-reader.js';
import { importRawXml } from '../services/xml-saver.js';

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
  cancelada: boolean;
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
  // Índice de notas canceladas (chaves extraídas dos nomes dos arquivos em eventos/canceladas/)
  const cancelledChaves = buildCancelledIndex(company.outputFolder, company.nome);
  const allNotes: NoteItem[] = [];

  for (const period of safeDirRead(companyDir)) {
    // Ignora a pasta "eventos" (não é um período)
    if (period === 'eventos') continue;

    const periodDir = join(companyDir, period);

    // Notas normais (ativas)
    const tipoDir = join(periodDir, tipo);
    for (const file of safeDirRead(tipoDir)) {
      if (!file.endsWith('.xml')) continue;
      try {
        const xml = readFileSync(join(tipoDir, file), 'utf-8');
        const note = parseNote(xml, tipo);
        if (note) {
          note.cancelada = cancelledChaves.has(note.chaveAcesso);
          const { chaveAcesso: _ch, ...noteItem } = note;
          void _ch;
          allNotes.push(noteItem);
        }
      } catch { /* pula */ }
    }

    // Notas canceladas (movidas para canceladas/)
    const canceladasDir = join(periodDir, 'canceladas');
    const cnpjEmp = cnpj.replace(/\D/g, '').padStart(14, '0');
    for (const file of safeDirRead(canceladasDir)) {
      if (!file.endsWith('.xml')) continue;
      try {
        const xml = readFileSync(join(canceladasDir, file), 'utf-8');
        // Detecta tipo a partir do CNPJ do prestador comparado com a empresa
        const parsedXml = parser.parse(xml);
        const emitCnpj = String(parsedXml?.NFSe?.infNFSe?.emit?.CNPJ ?? '').replace(/\D/g, '').padStart(14, '0');
        const tipoDetect = emitCnpj === cnpjEmp ? 'prestados' : 'tomados';
        if (tipoDetect !== tipo) continue;

        const note = parseNote(xml, tipo);
        if (note) {
          note.cancelada = true;
          const { chaveAcesso: _ch, ...noteItem } = note;
          void _ch;
          allNotes.push(noteItem);
        }
      } catch { /* pula */ }
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

// POST /api/notes/:cnpj/import — importa XML de NFS-e manualmente (corpo: text/xml ou application/xml)
notesRouter.post('/:cnpj/import', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);
  if (!company) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

  const gerarPdf = req.query.gerarPdf === 'true';

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
    const saved = await importRawXml(xmlStr, company.cnpj, company.outputFolder, company.nome, gerarPdf);
    if (!saved) {
      res.status(422).json({ error: 'XML não reconhecido como NFS-e válida' });
      return;
    }
    res.json({ ok: true, tipo: saved.tipo, competencia: saved.competencia, filePath: saved.filePath });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

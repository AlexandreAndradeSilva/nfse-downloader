import { Router } from 'express';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { getCompany } from '../config-store.js';

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
}

function parseNote(xml: string, tipo: 'tomados' | 'prestados'): NoteItem | null {
  try {
    const parsed = parser.parse(xml);
    const inf = parsed?.NFSe?.infNFSe ?? {};
    const dps = inf?.DPS?.infDPS ?? {};
    const emit = inf?.emit ?? {};
    const toma = dps?.toma ?? {};
    const vServPrest = dps?.valores?.vServPrest ?? {};
    const valoresNfse = inf?.valores ?? {};

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
  const allNotes: NoteItem[] = [];

  for (const period of safeDirRead(companyDir)) {
    const tipoDir = join(companyDir, period, tipo);
    for (const file of safeDirRead(tipoDir)) {
      if (!file.endsWith('.xml')) continue;
      try {
        const xml = readFileSync(join(tipoDir, file), 'utf-8');
        const note = parseNote(xml, tipo);
        if (note) allNotes.push(note);
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

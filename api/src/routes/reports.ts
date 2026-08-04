import { Router } from 'express';
import { readdirSync, readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { XMLParser } from 'fast-xml-parser';
import { PDFDocument } from 'pdf-lib';
import { getCompany } from '../config-store.js';
import { buildEventIndex, type EventIndex } from '../services/xml-reader.js';
import type { Situacao } from '../types.js';

export const reportsRouter = Router();

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

function fmtDateBR(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function n(v: unknown): number {
  const num = parseFloat(String(v ?? '0'));
  return isNaN(num) ? 0 : num;
}
function s(v: unknown): string {
  return v?.toString().trim() ?? '';
}
/**
 * Converte índice de coluna (1-based) em letra do Excel: 1→A, 26→Z, 27→AA.
 * `String.fromCharCode(64 + n)` quebrava acima de 26 colunas (produzia '[').
 */
export function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    s = String.fromCharCode(65 + resto) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function safeDirRead(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir); } catch { return []; }
}

interface NoteRow {
  tipo: string;
  situacao: Situacao;
  periodo: string;
  numeroNFSe: string;
  chaveAcesso: string;
  dataEmissao: string;
  dataEmissaoRaw: string;
  competencia: string;
  prestadorCnpj: string;
  prestadorNome: string;
  tomadorCnpj: string;
  tomadorNome: string;
  descricaoServico: string;
  codTribNac: string;
  codTribMun: string;
  localPrestacao: string;
  valorServico: number;
  bcISSQN: number;
  aliquotaISSQN: number;
  issRetido: string;
  valorISSQN: number;
  vInss: number;
  vIrpf: number;
  vCsll: number;
  vPis: number;
  vCofins: number;
  retPisCofins: string;
  valorLiquido: number;
}

function parseXmlToRow(xmlStr: string, tipo: string, periodo: string, eventos?: EventIndex): NoteRow | null {
  try {
    const parsed = parser.parse(xmlStr);
    const inf = parsed?.NFSe?.infNFSe ?? {};
    const dps = inf?.DPS?.infDPS ?? {};
    const emit = inf?.emit ?? {};
    const toma = dps?.toma ?? {};
    const cServ = dps?.serv?.cServ ?? {};
    const locPrest = dps?.serv?.locPrest ?? {};
    const valoresNfse = inf?.valores ?? {};
    const valoresDps = dps?.valores ?? {};
    const tribMun = valoresDps?.trib?.tribMun ?? {};
    const tribFed = valoresDps?.trib?.tribFed ?? {};
    const piscofins = tribFed?.piscofins ?? {};
    const vServPrest = valoresDps?.vServPrest ?? {};

    const idAttr = s(inf?.['@_Id'] ?? '');
    const chaveAcesso = idAttr.startsWith('NFS') ? idAttr.slice(3) : idAttr;

    const tpRet = s(tribMun.tpRetISSQN);
    const tpRetPis = s(piscofins.tpRetPisCofins);
    // pAliq pode estar em tribMun ou no nível da NFS-e (pAliqAplic)
    const pAliq = n(tribMun.pAliq || valoresNfse.pAliqAplic);
    const vBC = n(valoresNfse.vBC);
    // vISSQN já vem calculado na NFS-e; usa cálculo como fallback
    const issQnNfse = n(valoresNfse.vISSQN);
    const issRetidoVal = issQnNfse || (tpRet === '2' ? Math.round(vBC * pAliq / 100 * 100) / 100 : 0);

    const TP_RET_ISSQN: Record<string, string> = {
      '1': 'Não Retido', '2': 'Retido pelo Tomador', '3': 'Não Incide ISSQN',
    };
    const TP_RET_PIS: Record<string, string> = {
      '0': 'Não Retidos', '1': 'Retidos', '2': 'Não Retidos',
      '3': 'PIS/COFINS/CSLL Retidos', '4': 'PIS/COFINS Retidos, CSLL Não', '5': 'PIS Retido',
      '6': 'COFINS Retido', '7': 'COFINS e CSLL Retidos', '8': 'CSLL Retido', '9': 'PIS e CSLL Retidos',
    };

    const rawDate = s(dps.dhEmi || inf.dhProc);

    return {
      tipo: tipo === 'tomados' ? 'Tomado' : 'Prestado',
      situacao: eventos?.canceladas.has(chaveAcesso) ? 'cancelada'
        : eventos?.substituidas.has(chaveAcesso) ? 'substituida' : 'ativa',
      periodo,
      numeroNFSe: s(inf.nNFSe),
      chaveAcesso,
      dataEmissao: fmtDateBR(rawDate),
      dataEmissaoRaw: rawDate,
      competencia: s(dps.dCompet),
      prestadorCnpj: s(emit.CNPJ).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
      prestadorNome: s(emit.xNome),
      tomadorCnpj: s(toma.CNPJ).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
      tomadorNome: s(toma.xNome),
      descricaoServico: s(cServ.xDescServ),
      codTribNac: s(cServ.cTribNac),
      codTribMun: s(cServ.cTribMun),
      localPrestacao: s(inf.xLocPrestacao || locPrest.cLocPrestacao),
      valorServico: n(vServPrest.vServ || valoresNfse.vBC),
      bcISSQN: vBC,
      aliquotaISSQN: pAliq,
      issRetido: (TP_RET_ISSQN[tpRet] ?? tpRet) || '-',
      valorISSQN: issRetidoVal,
      vInss: n(tribFed.vRetCP),
      vIrpf: n(tribFed.vRetIRRF || tribFed.vIRRF),
      vCsll: n(tribFed.vRetCSLL),
      vPis: n(piscofins.vPis),
      vCofins: n(piscofins.vCofins),
      retPisCofins: (TP_RET_PIS[tpRetPis] ?? tpRetPis) || '-',
      valorLiquido: n(valoresNfse.vLiq),
    };
  } catch {
    return null;
  }
}

const EXCEL_ALL_COLS: Partial<ExcelJS.Column>[] = [
  { header: 'Tipo', key: 'tipo', width: 10 },
  { header: 'Situação', key: 'situacao', width: 14 },
  { header: 'Período', key: 'periodo', width: 10 },
  { header: 'Nº NFS-e', key: 'numeroNFSe', width: 18 },
  { header: 'Chave de Acesso', key: 'chaveAcesso', width: 52 },
  { header: 'Data Emissão', key: 'dataEmissao', width: 22 },
  { header: 'Competência', key: 'competencia', width: 14 },
  { header: 'Prestador CNPJ', key: 'prestadorCnpj', width: 20 },
  { header: 'Prestador Nome', key: 'prestadorNome', width: 40 },
  { header: 'Tomador CNPJ', key: 'tomadorCnpj', width: 20 },
  { header: 'Tomador Nome', key: 'tomadorNome', width: 40 },
  { header: 'Descrição Serviço', key: 'descricaoServico', width: 50 },
  { header: 'Cód. Trib. Nac.', key: 'codTribNac', width: 14 },
  { header: 'Cód. Trib. Mun.', key: 'codTribMun', width: 14 },
  { header: 'Local Prestação', key: 'localPrestacao', width: 20 },
  { header: 'Valor Serviço', key: 'valorServico', width: 14, style: { numFmt: 'R$ #,##0.00' } },
  { header: 'BC ISSQN', key: 'bcISSQN', width: 14, style: { numFmt: 'R$ #,##0.00' } },
  { header: 'Alíq. ISSQN (%)', key: 'aliquotaISSQN', width: 14, style: { numFmt: '0.00' } },
  { header: 'ISS Retido', key: 'issRetido', width: 20 },
  { header: 'Valor ISS', key: 'valorISSQN', width: 14, style: { numFmt: 'R$ #,##0.00' } },
  { header: 'INSS (Prev.)', key: 'vInss', width: 14, style: { numFmt: 'R$ #,##0.00' } },
  { header: 'IRPF', key: 'vIrpf', width: 12, style: { numFmt: 'R$ #,##0.00' } },
  { header: 'CSLL', key: 'vCsll', width: 12, style: { numFmt: 'R$ #,##0.00' } },
  { header: 'PIS', key: 'vPis', width: 12, style: { numFmt: 'R$ #,##0.00' } },
  { header: 'COFINS', key: 'vCofins', width: 12, style: { numFmt: 'R$ #,##0.00' } },
  { header: 'Ret. PIS/COFINS', key: 'retPisCofins', width: 24 },
  { header: 'Valor Líquido', key: 'valorLiquido', width: 14, style: { numFmt: 'R$ #,##0.00' } },
];

// GET /api/reports/:cnpj/excel?tipo=tomados|prestados|todos&dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD&colunas=col1,col2,...
reportsRouter.get('/:cnpj/excel', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const tipoFiltro = (req.query.tipo as string) ?? 'todos';
  const dataInicio = (req.query.dataInicio as string) ?? '';
  const dataFim = (req.query.dataFim as string) ?? '';
  const colunasParam = (req.query.colunas as string) ?? '';
  const company = getCompany(cnpj);

  if (!company) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  const companyDir = join(company.outputFolder, company.nome);
  const eventos = buildEventIndex(company.outputFolder, company.nome);
  const rows: NoteRow[] = [];

  for (const period of safeDirRead(companyDir)) {
    if (period === 'eventos') continue; // pasta de eventos não é período
    const periodDir = join(companyDir, period);
    for (const tipo of ['tomados', 'prestados'] as const) {
      if (tipoFiltro !== 'todos' && tipoFiltro !== tipo) continue;
      // Notas ativas
      const tipoDir = join(periodDir, tipo);
      for (const file of safeDirRead(tipoDir)) {
        if (!file.endsWith('.xml')) continue;
        try {
          const xml = readFileSync(join(tipoDir, file), 'utf-8');
          const row = parseXmlToRow(xml, tipo, period, eventos);
          if (row) rows.push(row);
        } catch { /* pula */ }
      }
    }

    // Notas encerradas por evento, já movidas para as subpastas dedicadas
    const cnpjEmp = cnpj.replace(/\D/g, '').padStart(14, '0');
    for (const [sub, situacao] of [['canceladas', 'cancelada'], ['substituidas', 'substituida']] as const) {
      for (const file of safeDirRead(join(periodDir, sub))) {
        if (!file.endsWith('.xml')) continue;
        try {
          const xml = readFileSync(join(periodDir, sub, file), 'utf-8');
          const parsed = parser.parse(xml);
          const inf = parsed?.NFSe?.infNFSe ?? {};
          const emit = inf?.emit ?? {};
          const cnpjEmit = String(emit?.CNPJ ?? '').replace(/\D/g, '').padStart(14, '0');
          const tipoDetect = cnpjEmit === cnpjEmp ? 'prestados' : 'tomados';
          if (tipoFiltro !== 'todos' && tipoFiltro !== tipoDetect) continue;

          const row = parseXmlToRow(xml, tipoDetect, period, undefined);
          if (row) {
            row.situacao = situacao;
            rows.push(row);
          }
        } catch { /* pula */ }
      }
    }
  }

  // Filtro por período (data de emissão)
  const filteredRows = (dataInicio || dataFim)
    ? rows.filter(row => {
      const d = row.dataEmissaoRaw ? row.dataEmissaoRaw.substring(0, 10) : '';
      if (!d) return true;
      if (dataInicio && d < dataInicio) return false;
      if (dataFim && d > dataFim) return false;
      return true;
    })
    : rows;

  // Ordena por data de emissão
  filteredRows.sort((a, b) => (a.dataEmissaoRaw || a.dataEmissao).localeCompare(b.dataEmissaoRaw || b.dataEmissao));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NFS-e Downloader';
  const sheet = workbook.addWorksheet('NFS-e', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Filtra colunas conforme seleção do usuário
  const colsFilter = colunasParam ? new Set(colunasParam.split(',').map(c => c.trim())) : null;
  sheet.columns = colsFilter
    ? EXCEL_ALL_COLS.filter(c => colsFilter.has(c.key as string))
    : EXCEL_ALL_COLS;

  // Cabeçalho estilizado
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3F51B5' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 28;

  const ROTULO_SITUACAO: Record<Situacao, string> = {
    ativa: 'Ativa', cancelada: 'CANCELADA', substituida: 'SUBSTITUÍDA',
  };

  filteredRows.forEach((row, i) => {
    const r = sheet.addRow({ ...row, situacao: ROTULO_SITUACAO[row.situacao] });
    if (row.situacao === 'cancelada') {
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E8' } };
      r.font = { color: { argb: 'FF9B1C1C' }, italic: true };
      if (!colsFilter || colsFilter.has('situacao')) r.getCell('situacao').font = { bold: true, color: { argb: 'FFDC2626' } };
    } else if (row.situacao === 'substituida') {
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
      r.font = { color: { argb: 'FF92400E' }, italic: true };
      if (!colsFilter || colsFilter.has('situacao')) r.getCell('situacao').font = { bold: true, color: { argb: 'FFB45309' } };
    } else {
      r.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: i % 2 === 0 ? 'FFF5F5F5' : 'FFFFFFFF' },
      };
      if (!colsFilter || colsFilter.has('tipo')) r.getCell('tipo').font = { bold: true, color: { argb: row.tipo === 'Tomado' ? 'FF5C35CC' : 'FF1A7A3D' } };
      if (!colsFilter || colsFilter.has('situacao')) r.getCell('situacao').font = { color: { argb: 'FF16A34A' } };
    }
  });

  sheet.autoFilter = {
    from: 'A1',
    to: `${colLetter(colsFilter ? colsFilter.size : EXCEL_ALL_COLS.length)}${filteredRows.length + 1}`,
  };

  const fileName = `NFSe_${company.nome.replace(/\s+/g, '_')}_${tipoFiltro}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  await workbook.xlsx.write(res);
  res.end();
});

interface PdfMergeEntry {
  date: string;
  path: string;
  cancelada: boolean;
}

// GET /api/reports/:cnpj/pdf-merged?tipo=tomados|prestados|todos&canceladas=incluir|excluir|somente&dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
reportsRouter.get('/:cnpj/pdf-merged', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const tipoFiltro = (req.query.tipo as string) ?? 'todos';
  const canceladasOpt = (req.query.canceladas as string) ?? 'incluir';
  const dataInicioPdf = (req.query.dataInicio as string) ?? '';
  const dataFimPdf = (req.query.dataFim as string) ?? '';
  const company = getCompany(cnpj);

  if (!company) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  const companyDir = join(company.outputFolder, company.nome);
  const eventos = buildEventIndex(company.outputFolder, company.nome);
  const entries: PdfMergeEntry[] = [];

  for (const period of safeDirRead(companyDir)) {
    if (period === 'eventos') continue;
    const periodDir = join(companyDir, period);
    for (const tipo of ['tomados', 'prestados'] as const) {
      if (tipoFiltro !== 'todos' && tipoFiltro !== tipo) continue;
      const tipoDir = join(periodDir, tipo);
      for (const file of safeDirRead(tipoDir)) {
        if (!file.endsWith('.pdf')) continue;
        const xmlFile = join(tipoDir, file.replace(/\.pdf$/, '.xml'));
        let date = period;
        let chave = '';
        if (existsSync(xmlFile)) {
          try {
            const xml = readFileSync(xmlFile, 'utf-8');
            const p = parser.parse(xml);
            const inf = p?.NFSe?.infNFSe ?? {};
            const dps = inf?.DPS?.infDPS ?? {};
            date = String(dps?.dhEmi ?? inf?.dhProc ?? period);
            const idAttr = String(inf?.['@_Id'] ?? '');
            chave = idAttr.startsWith('NFS') ? idAttr.slice(3) : idAttr;
          } catch { /* usa period como fallback */ }
        }
        const cancelada = eventos.canceladas.has(chave) || eventos.substituidas.has(chave);
        if (canceladasOpt === 'excluir' && cancelada) continue;
        if (canceladasOpt === 'somente' && !cancelada) continue;
        entries.push({ date, path: join(tipoDir, file), cancelada });
      }
    }

    // Notas encerradas por evento, nas subpastas dedicadas
    for (const sub of ['canceladas', 'substituidas'] as const) {
      const subDir = join(periodDir, sub);
      for (const file of safeDirRead(subDir)) {
        if (!file.endsWith('.pdf')) continue;
        if (canceladasOpt === 'excluir') continue;
        const xmlFile = join(subDir, file.replace(/\.pdf$/, '.xml'));
        let date = period;
        if (existsSync(xmlFile)) {
          try {
            const xml = readFileSync(xmlFile, 'utf-8');
            const p = parser.parse(xml);
            const inf = p?.NFSe?.infNFSe ?? {};
            const dps = inf?.DPS?.infDPS ?? {};
            date = String(dps?.dhEmi ?? inf?.dhProc ?? period);
          } catch { /* usa period */ }
        }
        entries.push({ date, path: join(subDir, file), cancelada: true });
      }
    }
  }

  // Filtro por período (data de emissão)
  const filteredEntries = (dataInicioPdf || dataFimPdf)
    ? entries.filter(entry => {
      const d = entry.date.substring(0, 10);
      if (dataInicioPdf && d < dataInicioPdf) return false;
      if (dataFimPdf && d > dataFimPdf) return false;
      return true;
    })
    : entries;

  if (filteredEntries.length === 0) {
    res.status(404).json({ error: 'Nenhum PDF encontrado para o período informado.' });
    return;
  }

  // Ordena por data crescente
  filteredEntries.sort((a, b) => a.date.localeCompare(b.date));

  // Merge usando pdf-lib
  const mergedPdf = await PDFDocument.create();
  for (const entry of filteredEntries) {
    try {
      const pdfBytes = readFileSync(entry.path);
      const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
      pages.forEach(p => mergedPdf.addPage(p));
    } catch { /* PDF corrompido — pula */ }
  }

  const mergedBytes = await mergedPdf.save();
  const fileName = `NFSe_${company.nome.replace(/\s+/g, '_')}_consolidado.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('X-Total-Pages', String(filteredEntries.length));
  res.send(Buffer.from(mergedBytes));
});

interface PdfInplaceEntry {
  date: string;
  path: string;
}

// POST /api/reports/:cnpj/pdf-merge-inplace — salva consolidado dentro de cada pasta de origem
reportsRouter.post('/:cnpj/pdf-merge-inplace', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);

  if (!company) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  const companyDir = join(company.outputFolder, company.nome);
  const nomeBase = company.nome.replace(/\s+/g, '_');
  const results: Array<{ period: string; tipo: string; count: number; fileName: string }> = [];

  for (const period of safeDirRead(companyDir)) {
    if (period === 'eventos') continue;
    for (const tipo of ['tomados', 'prestados'] as const) {
      const tipoDir = join(companyDir, period, tipo);
      const consolidatedName = `NFSe_${nomeBase}_${tipo}_consolidado.pdf`;
      const entries: PdfInplaceEntry[] = [];

      for (const file of safeDirRead(tipoDir)) {
        if (!file.endsWith('.pdf') || file === consolidatedName) continue;
        const xmlFile = join(tipoDir, file.replace(/\.pdf$/, '.xml'));
        let date = period;
        if (existsSync(xmlFile)) {
          try {
            const xml = readFileSync(xmlFile, 'utf-8');
            const p = parser.parse(xml);
            const inf = p?.NFSe?.infNFSe ?? {};
            const dps = inf?.DPS?.infDPS ?? {};
            date = String(dps?.dhEmi ?? inf?.dhProc ?? period);
          } catch { /* usa period */ }
        }
        entries.push({ date, path: join(tipoDir, file) });
      }

      if (entries.length === 0) continue;
      entries.sort((a, b) => a.date.localeCompare(b.date));

      const mergedPdf = await PDFDocument.create();
      const merged: string[] = [];
      for (const entry of entries) {
        try {
          const pdfBytes = readFileSync(entry.path);
          const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
          const pages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
          pages.forEach(p => mergedPdf.addPage(p));
          merged.push(entry.path);
        } catch { /* PDF corrompido — pula */ }
      }

      const mergedBytes = await mergedPdf.save();
      const outPath = join(tipoDir, consolidatedName);
      writeFileSync(outPath, Buffer.from(mergedBytes));

      for (const filePath of merged) {
        try { unlinkSync(filePath); } catch { /* ignora erro ao deletar */ }
      }

      results.push({ period, tipo, count: merged.length, fileName: consolidatedName });
    }
  }

  if (results.length === 0) {
    res.status(404).json({ error: 'Nenhum PDF encontrado para consolidar.' });
    return;
  }

  res.json({ success: true, results });
});

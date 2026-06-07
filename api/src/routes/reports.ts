import { Router } from 'express';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { XMLParser } from 'fast-xml-parser';
import { getCompany } from '../config-store.js';

export const reportsRouter = Router();

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

function n(v: unknown): number {
  const num = parseFloat(String(v ?? '0'));
  return isNaN(num) ? 0 : num;
}
function s(v: unknown): string {
  return v?.toString().trim() ?? '';
}
function safeDirRead(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir); } catch { return []; }
}

interface NoteRow {
  tipo: string;
  periodo: string;
  numeroNFSe: string;
  chaveAcesso: string;
  dataEmissao: string;
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
  vPis: number;
  vCofins: number;
  retPisCofins: string;
  valorLiquido: number;
}

function parseXmlToRow(xmlStr: string, tipo: string, periodo: string): NoteRow | null {
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
    const piscofins = valoresDps?.trib?.tribFed?.piscofins ?? {};
    const vServPrest = valoresDps?.vServPrest ?? {};

    const idAttr = s(inf?.['@_Id'] ?? '');
    const chaveAcesso = idAttr.startsWith('NFS') ? idAttr.slice(3) : idAttr;

    const tpRet = s(tribMun.tpRetISSQN);
    const tpRetPis = s(piscofins.tpRetPisCofins);
    const pAliq = n(tribMun.pAliq);
    const vBC = n(valoresNfse.vBC);
    const issRetidoVal = tpRet === '2' ? Math.round(vBC * pAliq / 100 * 100) / 100 : 0;

    const TP_RET_ISSQN: Record<string, string> = {
      '1': 'Não Retido', '2': 'Retido pelo Tomador', '3': 'Não Incide ISSQN',
    };
    const TP_RET_PIS: Record<string, string> = {
      '0': 'Não Retidos', '1': 'Retidos', '2': 'Não Retidos',
      '3': 'PIS/COFINS/CSLL Retidos', '4': 'PIS/COFINS Retidos, CSLL Não', '5': 'PIS Retido',
      '6': 'COFINS Retido', '7': 'COFINS e CSLL Retidos', '8': 'CSLL Retido', '9': 'PIS e CSLL Retidos',
    };

    return {
      tipo: tipo === 'tomados' ? 'Tomado' : 'Prestado',
      periodo,
      numeroNFSe: s(inf.nNFSe),
      chaveAcesso,
      dataEmissao: s(dps.dhEmi || inf.dhProc),
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
      vPis: n(piscofins.vPis),
      vCofins: n(piscofins.vCofins),
      retPisCofins: (TP_RET_PIS[tpRetPis] ?? tpRetPis) || '-',
      valorLiquido: n(valoresNfse.vLiq),
    };
  } catch {
    return null;
  }
}

// GET /api/reports/:cnpj/excel?tipo=tomados|prestados|todos
reportsRouter.get('/:cnpj/excel', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const tipoFiltro = (req.query.tipo as string) ?? 'todos';
  const company = getCompany(cnpj);

  if (!company) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  const companyDir = join(company.outputFolder, company.nome);
  const rows: NoteRow[] = [];

  for (const period of safeDirRead(companyDir)) {
    const periodDir = join(companyDir, period);
    for (const tipo of ['tomados', 'prestados'] as const) {
      if (tipoFiltro !== 'todos' && tipoFiltro !== tipo) continue;
      const tipoDir = join(periodDir, tipo);
      for (const file of safeDirRead(tipoDir)) {
        if (!file.endsWith('.xml')) continue;
        try {
          const xml = readFileSync(join(tipoDir, file), 'utf-8');
          const row = parseXmlToRow(xml, tipo, period);
          if (row) rows.push(row);
        } catch { /* pula */ }
      }
    }
  }

  // Ordena por data de emissão
  rows.sort((a, b) => a.dataEmissao.localeCompare(b.dataEmissao));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NFS-e Downloader';
  const sheet = workbook.addWorksheet('NFS-e', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Tipo',             key: 'tipo',            width: 10 },
    { header: 'Período',          key: 'periodo',         width: 10 },
    { header: 'Nº NFS-e',         key: 'numeroNFSe',      width: 18 },
    { header: 'Chave de Acesso',  key: 'chaveAcesso',     width: 52 },
    { header: 'Data Emissão',     key: 'dataEmissao',     width: 22 },
    { header: 'Competência',      key: 'competencia',     width: 14 },
    { header: 'Prestador CNPJ',   key: 'prestadorCnpj',   width: 20 },
    { header: 'Prestador Nome',   key: 'prestadorNome',   width: 40 },
    { header: 'Tomador CNPJ',     key: 'tomadorCnpj',     width: 20 },
    { header: 'Tomador Nome',     key: 'tomadorNome',     width: 40 },
    { header: 'Descrição Serviço',key: 'descricaoServico',width: 50 },
    { header: 'Cód. Trib. Nac.',  key: 'codTribNac',      width: 14 },
    { header: 'Cód. Trib. Mun.',  key: 'codTribMun',      width: 14 },
    { header: 'Local Prestação',  key: 'localPrestacao',  width: 20 },
    { header: 'Valor Serviço',    key: 'valorServico',    width: 14, style: { numFmt: 'R$ #,##0.00' } },
    { header: 'BC ISSQN',         key: 'bcISSQN',         width: 14, style: { numFmt: 'R$ #,##0.00' } },
    { header: 'Alíq. ISSQN (%)',  key: 'aliquotaISSQN',   width: 14, style: { numFmt: '0.00' } },
    { header: 'ISS Retido',       key: 'issRetido',       width: 20 },
    { header: 'Valor ISS',        key: 'valorISSQN',      width: 14, style: { numFmt: 'R$ #,##0.00' } },
    { header: 'PIS',              key: 'vPis',            width: 12, style: { numFmt: 'R$ #,##0.00' } },
    { header: 'COFINS',           key: 'vCofins',         width: 12, style: { numFmt: 'R$ #,##0.00' } },
    { header: 'Ret. PIS/COFINS',  key: 'retPisCofins',    width: 24 },
    { header: 'Valor Líquido',    key: 'valorLiquido',    width: 14, style: { numFmt: 'R$ #,##0.00' } },
  ];

  // Cabeçalho estilizado
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3F51B5' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 28;

  rows.forEach((row, i) => {
    const r = sheet.addRow(row);
    r.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: i % 2 === 0 ? 'FFF5F5F5' : 'FFFFFFFF' },
    };
    // Colorir tomados/prestados
    const tipoCell = r.getCell('tipo');
    tipoCell.font = {
      bold: true,
      color: { argb: row.tipo === 'Tomado' ? 'FF5C35CC' : 'FF1A7A3D' },
    };
  });

  sheet.autoFilter = { from: 'A1', to: `W${rows.length + 1}` };

  const fileName = `NFSe_${company.nome.replace(/\s+/g, '_')}_${tipoFiltro}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  await workbook.xlsx.write(res);
  res.end();
});

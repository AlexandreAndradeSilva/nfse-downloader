import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { Router } from 'express';
import { getCompany, updateLastNsu, upsertCompany } from '../config-store.js';
import { fetchDFeLote } from '../services/adn-client.js';
import { runSync, type SyncOptions } from '../services/sync-engine.js';
import type { TipoNota } from '../types.js';

export const syncRouter = Router();

const TIPOS_VALIDOS: TipoNota[] = ['prestados', 'tomados'];

/**
 * Normaliza o parâmetro `tipos` da query (`?tipos=prestados,tomados`): filtra
 * valores desconhecidos e cai no default (ambos) quando o resultado fica
 * vazio — sem isso, `?tipos=xyz` zeraria silenciosamente o resumo do sync.
 */
export function parseTiposParam(raw: unknown): TipoNota[] {
  const parsed = String(raw ?? 'prestados,tomados')
    .split(',')
    .map(t => t.trim())
    .filter((t): t is TipoNota => t === 'prestados' || t === 'tomados');
  return parsed.length > 0 ? parsed : TIPOS_VALIDOS;
}

// Resolve o caminho do .pfx: se for pasta, encontra o maior .pfx dentro dela (compat tem 9k+)
function resolvePfxPath(pfxPath: string): string {
  if (!existsSync(pfxPath)) return pfxPath;
  if (!statSync(pfxPath).isDirectory()) return pfxPath;

  const files = readdirSync(pfxPath)
    .filter(f => f.toLowerCase().endsWith('.pfx'))
    .map(f => ({ name: f, path: join(pfxPath, f), size: statSync(join(pfxPath, f)).size }))
    .sort((a, b) => b.size - a.size); // maior primeiro = arquivo compat (TripleDES)

  if (files.length === 0) return pfxPath; // retorna pasta para manter erro original
  return files[0].path;
}

syncRouter.get('/:cnpj', async (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);

  if (!company) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }

  // Auto-resolve: se pfxPath for pasta, encontra o .pfx correto e salva no config
  const resolvedPfx = resolvePfxPath(company.pfxPath);
  if (resolvedPfx !== company.pfxPath) {
    upsertCompany({ ...company, pfxPath: resolvedPfx });
    company.pfxPath = resolvedPfx;
  }

  if (!existsSync(company.pfxPath)) {
    res.status(400).json({ error: `Certificado não encontrado: ${company.pfxPath}` });
    return;
  }
  if (statSync(company.pfxPath).isDirectory()) {
    res.status(400).json({ error: `Nenhum arquivo .pfx encontrado em: ${company.pfxPath}` });
    return;
  }

  const { dataInicio, dataFim } = req.query as Record<string, string>;
  const comFiltroData = !!(dataInicio || dataFim);
  const tiposParam = parseTiposParam(req.query.tipos);
  const options: SyncOptions = {
    tipos: tiposParam,
    // Com filtro de data: re-scan desde o NSU 1 para encontrar documentos antigos do período.
    // Sem filtro: incremental a partir do último NSU processado.
    startNsu: comFiltroData ? 1 : undefined,
    dateRange: comFiltroData ? {
      dataInicio: dataInicio ? new Date(dataInicio + 'T00:00:00-03:00') : undefined,
      dataFim: dataFim ? new Date(dataFim + 'T23:59:59-03:00') : undefined,
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
    ? ` | Período: ${dataInicio ?? '...'} → ${dataFim ?? '...'} | NSU atual: ${company.lastNsu}`
    : ` | NSU atual: ${company.lastNsu}`;
  send('progress', { message: `Iniciando sync para ${company.nome}${filtroMsg}` });

  try {
    const fetchFn = (nsu: number, cnpjConsulta: string) =>
      fetchDFeLote(
        { baseUrl: company.baseUrl, pfxPath: company.pfxPath, pfxPassword: company.pfxPassword },
        nsu, cnpjConsulta
      );

    const result = await runSync(company, fetchFn, (message) => send('progress', { message }), options);

    // Sync com filtro de data faz re-scan desde NSU 1: preserva o lastNsu já alcançado
    // para não regredir o progresso incremental.
    const nsuParaSalvar = comFiltroData
      ? Math.max(company.lastNsu, result.lastNsu)
      : result.lastNsu;
    updateLastNsu(cnpj, nsuParaSalvar);

    const semNovos = result.prestados + result.tomados + result.eventos === 0 && result.errors === 0;
    const rotulo = tiposParam.length === 1
      ? (tiposParam[0] === 'prestados' ? 'prestados' : 'tomados')
      : 'prestados e tomados';
    const msgFinal = semNovos && !comFiltroData
      ? `Nenhuma nota nova desde a última sincronização (NSU atual: ${nsuParaSalvar})`
      : `Concluído (${rotulo}): ${result.prestados} prestados, ${result.tomados} tomados, ${result.eventos} eventos` +
        `${result.cache ? `, ${result.cache} do cache` : ''}${result.foraPeriodo ? `, ${result.foraPeriodo} fora do período` : ''}, ${result.errors} erros`;

    send('done', { message: msgFinal, ...result });
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

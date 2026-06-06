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

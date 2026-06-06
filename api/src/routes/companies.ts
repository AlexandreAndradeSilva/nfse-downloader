import { Router } from 'express';
import { readConfig, upsertCompany, removeCompany } from '../config-store.js';
import type { Company } from '../types.js';

export const companiesRouter = Router();

companiesRouter.get('/', (_req, res) => {
  const { companies } = readConfig();
  res.json(companies);
});

companiesRouter.post('/', (req, res) => {
  const body = req.body as Company;
  if (!body.cnpj || !body.nome || !body.pfxPath || !body.outputFolder || !body.baseUrl) {
    res.status(400).json({ error: 'Campos obrigatórios: cnpj, nome, pfxPath, outputFolder, baseUrl' });
    return;
  }
  const company: Company = {
    cnpj: body.cnpj.replace(/\D/g, ''),
    nome: body.nome,
    pfxPath: body.pfxPath,
    pfxPassword: body.pfxPassword ?? '',
    outputFolder: body.outputFolder,
    baseUrl: body.baseUrl,
    ambiente: body.ambiente ?? 'PRODUCAO',
    lastNsu: body.lastNsu ?? 0,
    lastSync: null,
  };
  upsertCompany(company);
  res.status(201).json(company);
});

companiesRouter.put('/:cnpj', (req, res) => {
  const body = req.body as Partial<Company>;
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const existing = readConfig().companies.find(c => c.cnpj === cnpj);
  if (!existing) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }
  upsertCompany({ ...existing, ...body, cnpj });
  res.json({ ...existing, ...body, cnpj });
});

companiesRouter.delete('/:cnpj', (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  removeCompany(cnpj);
  res.status(204).end();
});

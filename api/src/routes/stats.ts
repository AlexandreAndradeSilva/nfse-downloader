import { Router } from 'express';
import { getCompany } from '../config-store.js';
import { readCompanyStats } from '../services/xml-reader.js';

export const statsRouter = Router();

statsRouter.get('/:cnpj', (req, res) => {
  const cnpj = req.params.cnpj.replace(/\D/g, '');
  const company = getCompany(cnpj);
  if (!company) {
    res.status(404).json({ error: 'Empresa não encontrada' });
    return;
  }
  const stats = readCompanyStats(company.outputFolder, company.nome);
  res.json(stats);
});

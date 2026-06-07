import { Router } from 'express';
import { scanWindowsCerts, openFolderDialog } from '../services/cert-scanner.js';

export const certificatesRouter = Router();

certificatesRouter.get('/scan', async (_req, res) => {
  const certs = await scanWindowsCerts();
  res.json(certs);
});

certificatesRouter.get('/browse-folder', async (_req, res) => {
  const path = await openFolderDialog();
  if (!path) {
    res.status(204).end();
    return;
  }
  res.json({ path });
});

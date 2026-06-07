import { Router } from 'express';
import { pickCertificateFromStore, scanWindowsCerts, openFolderDialog } from '../services/cert-scanner.js';

export const certificatesRouter = Router();

// Abre o seletor nativo do Windows e retorna o certificado selecionado
certificatesRouter.get('/pick', async (_req, res) => {
  try {
    const cert = await pickCertificateFromStore();
    if (!cert) {
      res.status(204).end(); // usuário cancelou
      return;
    }
    res.json(cert);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Lista certificados sem seleção (mantido para compatibilidade)
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

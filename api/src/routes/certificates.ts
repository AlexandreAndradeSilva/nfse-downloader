import { Router } from 'express';
import { join } from 'path';
import { pickCertificateFromStore, scanWindowsCerts, openFolderDialog, exportCertByThumbprint } from '../services/cert-scanner.js';

export const certificatesRouter = Router();

// Abre o seletor nativo do Windows e retorna o certificado selecionado
certificatesRouter.get('/pick', async (_req, res) => {
  try {
    const cert = await pickCertificateFromStore();
    if (!cert) {
      res.status(204).end(); // usuário cancelou
      return;
    }
    // Sugere pasta padrão para salvar as notas
    const userProfile = process.env.USERPROFILE ?? process.env.HOME ?? '';
    const defaultOutputFolder = join(userProfile, 'Documents', 'NFSe');
    res.json({ ...cert, defaultOutputFolder });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Exporta certificado por thumbprint (usado pela lista filtrável)
certificatesRouter.get('/export/:thumbprint', async (req, res) => {
  try {
    const cert = await exportCertByThumbprint(req.params.thumbprint);
    if (!cert) {
      res.status(404).json({ error: 'Certificado não encontrado no repositório Windows.' });
      return;
    }
    const userProfile = process.env.USERPROFILE ?? process.env.HOME ?? '';
    const defaultOutputFolder = join(userProfile, 'Documents', 'NFSe');
    res.json({ ...cert, defaultOutputFolder });
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

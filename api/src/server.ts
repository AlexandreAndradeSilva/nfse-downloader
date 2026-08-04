import express from 'express';
import cors from 'cors';
import { companiesRouter } from './routes/companies.js';
import { syncRouter } from './routes/sync.js';
import { certificatesRouter } from './routes/certificates.js';
import { statsRouter } from './routes/stats.js';
import { reportsRouter } from './routes/reports.js';
import { notesRouter } from './routes/notes.js';
import { runStartupMigration } from './services/startup-migration.js';
import { closeDanfseBrowser } from './services/danfse-generator.js';

// Migração one-shot de estado deixado por versões anteriores. Nunca deve
// impedir o servidor de subir — falha aqui é registrada e ignorada.
try {
  runStartupMigration();
} catch (err) {
  console.warn('[migração] falhou (seguindo):', (err as Error).message);
}

const app = express();

// Permite qualquer origem — necessário para acesso via tunnel (ngrok/cloudflare)
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.text({ type: ['text/xml', 'application/xml'], limit: '10mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/companies', companiesRouter);
app.use('/api/sync', syncRouter);
app.use('/api/certificates', certificatesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notes', notesRouter);

const PORT = 3002;
const server = app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));

// O Chromium do gerador de DANFSe é compartilhado e mantém o processo vivo;
// fecha explicitamente para o encerramento não travar.
for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinal, () => {
    void closeDanfseBrowser().finally(() => server.close(() => process.exit(0)));
  });
}

export default app;

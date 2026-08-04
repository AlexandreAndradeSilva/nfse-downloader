import express from 'express';
import cors from 'cors';
import { companiesRouter } from './routes/companies.js';
import { syncRouter } from './routes/sync.js';
import { certificatesRouter } from './routes/certificates.js';
import { statsRouter } from './routes/stats.js';
import { reportsRouter } from './routes/reports.js';
import { notesRouter } from './routes/notes.js';

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
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));

export default app;

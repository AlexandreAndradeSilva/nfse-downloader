import express from 'express';
import cors from 'cors';
import { companiesRouter } from './routes/companies.js';
import { syncRouter } from './routes/sync.js';
import { certificatesRouter } from './routes/certificates.js';
import { statsRouter } from './routes/stats.js';
import { reportsRouter } from './routes/reports.js';
import { notesRouter } from './routes/notes.js';

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'] }));
app.use(express.json());
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

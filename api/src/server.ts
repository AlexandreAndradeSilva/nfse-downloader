import express from 'express';
import cors from 'cors';
import { companiesRouter } from './routes/companies.js';
import { syncRouter } from './routes/sync.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/companies', companiesRouter);
app.use('/api/sync', syncRouter);

const PORT = 3001;
app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));

export default app;

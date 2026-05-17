import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';

import authRoutes from './routes/auth.js';
import attrRoutes from './routes/attributions.js';
import refRoutes  from './routes/referentiels.js';
import pilotRoutes from './routes/pilotage.js';
import exportRoutes from './routes/exports.js';
import planningRoutes from './routes/planning.js';
import usersRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('tiny'));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/auth',         authRoutes);
app.use('/api/attributions', attrRoutes);
app.use('/api/ref',          refRoutes);
app.use('/api/pilotage',     pilotRoutes);
app.use('/api/exports',      exportRoutes);
app.use('/api/planning',     planningRoutes);
app.use('/api/users',        usersRoutes);
app.use('/api/admin',        adminRoutes);

// Erreurs
app.use((err, req, res, next) => {
  console.error('[ERR]', err);
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Backend Attributions IIP sur http://localhost:${PORT}`));

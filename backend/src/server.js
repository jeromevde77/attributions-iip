import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import db from './db/index.js';
import authRoutes from './routes/auth.js';
import attrRoutes from './routes/attributions.js';
import refRoutes  from './routes/referentiels.js';
import pilotRoutes from './routes/pilotage.js';
import exportRoutes from './routes/exports.js';
import planningRoutes from './routes/planning.js';
import usersRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Migrations légères : CREATE TABLE IF NOT EXISTS + ADD COLUMN si absent.
// Ces opérations sont idempotentes — peuvent être exécutées à chaque démarrage.
// ---------------------------------------------------------------------------
try {
  // 1. Créer la table activite_type si elle n'existe pas
  db.exec(`
    CREATE TABLE IF NOT EXISTS activite_type (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      libelle TEXT NOT NULL UNIQUE,
      ordre   INTEGER DEFAULT 0
    );
  `);
  const count = db.prepare('SELECT COUNT(*) AS n FROM activite_type').get().n;
  if (count === 0) {
    db.exec(`
      INSERT INTO activite_type (id, libelle, ordre) VALUES
        (1, 'Théorie',                1),
        (2, 'Exercices',              2),
        (3, 'Travaux pratiques (TP)', 3),
        (4, 'Laboratoire',            4),
        (5, 'Stage',                  5),
        (6, 'Séminaire',              6),
        (7, 'TFE',                    7);
    `);
    console.log('[migration] Table activite_type initialisée');
  }

  // 2. Ajouter la colonne attribution.activite_id si elle n'existe pas
  const cols = db.prepare("PRAGMA table_info(attribution)").all();
  if (!cols.find(c => c.name === 'activite_id')) {
    db.exec(`ALTER TABLE attribution ADD COLUMN activite_id INTEGER REFERENCES activite_type(id);`);
    console.log('[migration] Colonne attribution.activite_id ajoutée');
  }
} catch (e) {
  console.warn('[migration] Erreur :', e.message);
}

// Recréer les VIEW à chaque démarrage pour qu'elles soient à jour
// quand le schéma évolue (sans nécessiter un init-db complet).
try {
  const schema = readFileSync(resolve(__dirname, 'db/schema.sql'), 'utf8');
  // Extraire et exécuter uniquement les blocs DROP VIEW + CREATE VIEW
  const viewBlocks = schema.match(/DROP VIEW[\s\S]*?CREATE VIEW[\s\S]*?;(?=\s*(DROP|CREATE TRIGGER|--|$))/g);
  if (viewBlocks) {
    for (const block of viewBlocks) {
      try {
        db.exec(block);
      } catch (e) {
        console.warn(`[views] Erreur lors de la recréation d'une vue : ${e.message}`);
      }
    }
    console.log(`[views] ${viewBlocks.length} vue(s) recréée(s)`);
  }
} catch (e) {
  console.warn('[views] Impossible de recréer les vues :', e.message);
}

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

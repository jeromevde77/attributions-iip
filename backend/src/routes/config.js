import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// GET /api/config — retourne toutes les clés (admin seulement)
r.get('/', authRequired, roleRequired('admin'), (req, res) => {
  const rows = db.prepare('SELECT cle, valeur, description FROM lucie_config ORDER BY cle').all();
  const result = {};
  for (const row of rows) result[row.cle] = { valeur: row.valeur, description: row.description };
  res.json(result);
});

// GET /api/config/:cle — lecture publique (pour charger l'intro dans l'entretien)
r.get('/:cle', authRequired, (req, res) => {
  const row = db.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(req.params.cle);
  if (!row) return res.status(404).json({ error: 'Clé introuvable' });
  res.json({ valeur: row.valeur });
});

// PUT /api/config/:cle — mise à jour (admin seulement)
r.put('/:cle', authRequired, roleRequired('admin'), (req, res) => {
  const { valeur } = req.body;
  if (valeur == null) return res.status(400).json({ error: 'valeur requise' });
  db.prepare('INSERT OR REPLACE INTO lucie_config (cle, valeur, description) VALUES (?, ?, COALESCE((SELECT description FROM lucie_config WHERE cle = ?), ?))')
    .run(req.params.cle, valeur, req.params.cle, '');
  res.json({ ok: true });
});

export default r;

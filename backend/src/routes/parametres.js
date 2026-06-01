/**
 * parametres.js — CRUD pour la table parametre
 * Les paramètres sont des clés-valeurs configurables depuis l'UI Configuration.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// Helper : lire un paramètre avec fallback
export function getParam(cle, fallback = null) {
  try {
    const row = db.prepare('SELECT valeur FROM parametre WHERE cle = ?').get(cle);
    return row ? row.valeur : fallback;
  } catch { return fallback; }
}
export function getParamNum(cle, fallback = 0) {
  return parseFloat(getParam(cle, String(fallback))) || fallback;
}

// GET /parametres — tous les paramètres, groupés
r.get('/', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM parametre ORDER BY groupe, cle').all();
  // Grouper par groupe
  const grouped = {};
  for (const p of rows) {
    const g = p.groupe || 'autre';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(p);
  }
  res.json(grouped);
});

// GET /parametres/:cle
r.get('/:cle', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM parametre WHERE cle = ?').get(req.params.cle);
  if (!row) return res.status(404).json({ error: 'Paramètre introuvable' });
  res.json(row);
});

// PATCH /parametres/:cle — modifier la valeur
r.patch('/:cle', authRequired, roleRequired('admin'), (req, res) => {
  const { valeur } = req.body;
  if (valeur === undefined || valeur === null)
    return res.status(400).json({ error: 'valeur requis' });
  const row = db.prepare('SELECT cle FROM parametre WHERE cle = ?').get(req.params.cle);
  if (!row) return res.status(404).json({ error: 'Paramètre introuvable' });
  db.prepare('UPDATE parametre SET valeur = ? WHERE cle = ?').run(String(valeur), req.params.cle);
  res.json({ ok: true });
});

// PUT /parametres/bulk — modifier plusieurs paramètres d'un coup
// body: { 'planning.ev1_heures': '2', 'etab.nom': 'Mon école', ... }
r.put('/bulk', authRequired, roleRequired('admin'), (req, res) => {
  const updates = req.body;
  if (typeof updates !== 'object' || Array.isArray(updates))
    return res.status(400).json({ error: 'body doit être un objet { cle: valeur }' });
  const update = db.transaction(() => {
    for (const [cle, valeur] of Object.entries(updates)) {
      db.prepare('UPDATE parametre SET valeur = ? WHERE cle = ?').run(String(valeur), cle);
    }
  });
  update();
  res.json({ ok: true, updated: Object.keys(updates).length });
});

export default r;

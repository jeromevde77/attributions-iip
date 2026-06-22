/**
 * aa.js — Routes des Acquis d'Apprentissage (AA)
 * Consultation, création, modification et suppression des AA liés aux UE.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();
r.use(authRequired);

// ── Liste des AA d'une UE ────────────────────────────────────────────────────
// GET /api/aa?ue_num=246
r.get('/', (req, res) => {
  const { ue_num } = req.query;
  let sql = 'SELECT aa.*, u.ue_nom, u.section FROM aa LEFT JOIN ue u ON u.ue_num = aa.ue_num WHERE 1=1';
  const args = [];
  if (ue_num) { sql += ' AND aa.ue_num = ?'; args.push(ue_num); }
  sql += ' ORDER BY aa.ue_num, aa.aa_num';
  res.json(db.prepare(sql).all(...args));
});

// ── Détail d'un AA ───────────────────────────────────────────────────────────
r.get('/:code', (req, res) => {
  const aa = db.prepare('SELECT * FROM aa WHERE aa_code = ?').get(req.params.code);
  if (!aa) return res.status(404).json({ error: 'AA introuvable' });
  res.json(aa);
});

// ── Créer un AA ──────────────────────────────────────────────────────────────
r.post('/', (req, res) => {
  const { aa_code, aa_num, ue_num, cours_code, description } = req.body;
  if (!aa_code || !ue_num || !description) return res.status(400).json({ error: 'aa_code, ue_num et description requis' });
  try {
    db.prepare('INSERT INTO aa (aa_code, aa_num, ue_num, cours_code, description) VALUES (?, ?, ?, ?, ?)')
      .run(aa_code, aa_num || null, ue_num, cours_code || null, description);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ce code AA existe déjà' });
    throw e;
  }
});

// ── Modifier un AA ───────────────────────────────────────────────────────────
r.patch('/:code', (req, res) => {
  const { description, cours_code } = req.body;
  const existing = db.prepare('SELECT aa_code FROM aa WHERE aa_code = ?').get(req.params.code);
  if (!existing) return res.status(404).json({ error: 'AA introuvable' });
  db.prepare('UPDATE aa SET description = COALESCE(?, description), cours_code = ? WHERE aa_code = ?')
    .run(description ?? null, cours_code ?? null, req.params.code);
  res.json({ ok: true });
});

// ── Supprimer un AA ──────────────────────────────────────────────────────────
r.delete('/:code', (req, res) => {
  db.prepare('DELETE FROM aa WHERE aa_code = ?').run(req.params.code);
  res.json({ ok: true });
});

export default r;

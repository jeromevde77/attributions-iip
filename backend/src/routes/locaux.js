/**
 * locaux.js — Gestion des locaux (salles) et de leur liaison aux cours.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// GET /locaux — liste de tous les locaux
r.get('/', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM local WHERE actif = 1 ORDER BY nom').all();
  res.json(rows);
});

// POST /locaux — créer un local
r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nom, type, places, equipements } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  try {
    const info = db.prepare('INSERT INTO local (nom, type, places, equipements) VALUES (?,?,?,?)')
      .run(nom, type || null, places || null, equipements || null);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ce local existe déjà' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /locaux/:id — modifier un local
r.patch('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const allowed = ['nom', 'type', 'places', 'equipements', 'actif'];
  const updates = [], params = { id: req.params.id };
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
  db.prepare(`UPDATE local SET ${updates.join(', ')} WHERE id = @id`).run(params);
  res.json({ ok: true });
});

// DELETE /locaux/:id — désactiver un local (soft delete)
r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('UPDATE local SET actif = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Liaison cours ↔ local ────────────────────────────────────────────────────

// GET /locaux/cours/:code?annee=&section= — locaux assignés à un cours
r.get('/cours/:code', authRequired, (req, res) => {
  const { annee, section } = req.query;
  const rows = db.prepare(`
    SELECT l.* FROM cours_local cl
    JOIN local l ON l.id = cl.local_id
    WHERE cl.cours_code = ? AND cl.annee_scolaire = ? AND (cl.section = ? OR cl.section IS NULL)
    ORDER BY l.nom
  `).all(req.params.code, annee, section || null);
  res.json(rows);
});

// PUT /locaux/cours/:code — définir les locaux d'un cours (remplace)
r.put('/cours/:code', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, section, local_ids } = req.body;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM cours_local WHERE cours_code = ? AND annee_scolaire = ? AND (section = ? OR (section IS NULL AND ? IS NULL))')
      .run(req.params.code, annee, section || null, section || null);
    const ins = db.prepare('INSERT OR IGNORE INTO cours_local (cours_code, annee_scolaire, section, local_id) VALUES (?,?,?,?)');
    for (const lid of (local_ids || [])) ins.run(req.params.code, annee, section || null, lid);
  });
  tx();
  res.json({ ok: true });
});

export default r;

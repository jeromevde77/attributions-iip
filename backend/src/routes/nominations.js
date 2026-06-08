/**
 * nominations.js — Engagement à titre définitif (ETD) et remise au travail (RT).
 * Le code FWB du dossier pédagogique est la clé métier unique de la nomination.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// ─── Nominations d'un prof ────────────────────────────────────────────────────

// GET /nominations/prof/:id — nominations définitives d'un prof
r.get('/prof/:id', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT n.*, u.ue_nom, u.ue_code_fwb
    FROM nomination_definitive n
    LEFT JOIN ue u ON u.ue_num = n.ue_num
    WHERE n.professeur_id = ? AND n.actif = 1
    GROUP BY n.id
    ORDER BY n.code_fwb
  `).all(req.params.id);
  res.json(rows);
});

// POST /nominations — créer une nomination
r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { professeur_id, code_fwb, ue_num, cours_code, cours_libre, periodes, type_charge, notes } = req.body;
  if (!professeur_id) return res.status(400).json({ error: 'professeur_id requis' });
  // Une nomination est valide soit avec un code FWB + UE, soit en mode "UE absente" (cours_libre)
  const codeFinal = code_fwb || 'INCONNU';
  if (!ue_num && !cours_libre) return res.status(400).json({ error: 'UE ou nom de cours requis' });
  const info = db.prepare(`
    INSERT INTO nomination_definitive (professeur_id, code_fwb, ue_num, cours_code, cours_libre, periodes, type_charge, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(professeur_id, codeFinal, ue_num || null, cours_code || null, cours_libre || null, periodes || 0, type_charge || null, notes || null);
  db.prepare(`UPDATE professeur SET statut_nomination = 'definitif' WHERE id = ? AND (statut_nomination IS NULL OR statut_nomination != 'definitif')`).run(professeur_id);
  res.json({ id: info.lastInsertRowid });
});

// PATCH /nominations/:id
r.patch('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const allowed = ['code_fwb', 'ue_num', 'cours_code', 'cours_libre', 'periodes', 'type_charge', 'actif', 'notes'];
  const updates = [], params = { id: req.params.id };
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
  db.prepare(`UPDATE nomination_definitive SET ${updates.join(', ')} WHERE id = @id`).run(params);
  res.json({ ok: true });
});

// DELETE /nominations/:id
r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('UPDATE nomination_definitive SET actif = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Verrous : attributions verrouillées par une nomination ───────────────────
// GET /nominations/verrous?annee= — liste les attributions verrouillées (prof définitif sur son cours)
// Une attribution est verrouillée si le prof a une nomination active sur le même cours.
r.get('/verrous', authRequired, (req, res) => {
  const { annee } = req.query;
  const rows = db.prepare(`
    SELECT a.id AS attribution_id, a.professeur_id, a.code_cours, a.ue_num,
           n.id AS nomination_id, n.code_fwb, n.periodes AS periodes_nommees, n.type_charge
    FROM attribution a
    JOIN nomination_definitive n
      ON n.professeur_id = a.professeur_id
     AND n.actif = 1
     AND (n.cours_code = a.code_cours OR (n.cours_code IS NULL AND n.ue_num = a.ue_num))
    WHERE a.annee_scolaire = ?
  `).all(annee);
  res.json(rows);
});

// ─── Remise au travail ────────────────────────────────────────────────────────

// GET /nominations/rt/prof/:id
r.get('/rt/prof/:id', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT rt.*, u.ue_nom FROM remise_travail rt
    LEFT JOIN ue u ON u.ue_num = rt.ue_num
    WHERE rt.professeur_id = ? ORDER BY rt.id DESC
  `).all(req.params.id);
  res.json(rows);
});

// POST /nominations/rt — créer une remise au travail (RT ≥ charge perdue : vérif côté appelant)
r.post('/rt', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nomination_id, professeur_id, charge_perdue, ue_num, cours_code, periodes, annee_scolaire, notes } = req.body;
  if (!professeur_id) return res.status(400).json({ error: 'professeur_id requis' });
  const info = db.prepare(`
    INSERT INTO remise_travail (nomination_id, professeur_id, charge_perdue, ue_num, cours_code, periodes, annee_scolaire, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(nomination_id || null, professeur_id, charge_perdue || 0, ue_num || null, cours_code || null, periodes || 0, annee_scolaire || null, notes || null);
  res.json({ id: info.lastInsertRowid });
});

// DELETE /nominations/rt/:id
r.delete('/rt/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM remise_travail WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default r;

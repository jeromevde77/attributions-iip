/**
 * aa.js — Routes des Acquis d'Apprentissage (AA)
 * Consultation, création, modification et suppression des AA liés aux UE.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

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

// ── Acquis d'une UE + cours disponibles pour le rattachement ────────────────
// GET /api/aa/ue/246?annee=2026-2027
r.get('/ue/:ueNum', (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee
    || db.prepare("SELECT code FROM annee_scolaire WHERE active = 1 LIMIT 1").get()?.code;

  const acquis = db.prepare(`
    SELECT a.*, c.cours_nom
      FROM aa a
      LEFT JOIN cours c ON c.cours_code = a.cours_code AND c.annee_scolaire = ?
     WHERE a.ue_num = ?
     ORDER BY a.aa_num, a.aa_code
  `).all(annee, ueNum);

  const cours = db.prepare(`
    SELECT cours_code, cours_nom, ct_pp, cours_per
      FROM cours WHERE ue_num = ? AND annee_scolaire = ?
     ORDER BY cours_code
  `).all(ueNum, annee);

  res.json({
    ue_num: ueNum, annee, acquis, cours,
    non_rattaches: acquis.filter(a => !a.cours_code).length,
  });
});

// ── Détail d'un AA ───────────────────────────────────────────────────────────
r.get('/:code', (req, res) => {
  const aa = db.prepare('SELECT * FROM aa WHERE aa_code = ?').get(req.params.code);
  if (!aa) return res.status(404).json({ error: 'AA introuvable' });
  res.json(aa);
});

// ── Créer un AA ──────────────────────────────────────────────────────────────
r.post('/', roleRequired('admin'), (req, res) => {
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
// Le rattachement d'un acquis à un cours est du travail pédagogique courant
// (admin ou éditeur) ; la modification du libellé touche au référentiel légal
// issu du dossier pédagogique et reste réservée à l'administrateur.
r.patch('/:code', roleRequired('admin', 'editeur'), (req, res) => {
  const existing = db.prepare('SELECT * FROM aa WHERE aa_code = ?').get(req.params.code);
  if (!existing) return res.status(404).json({ error: 'AA introuvable' });

  const champs = [], vals = [];
  // cours_code : seule l'absence de la clé laisse la valeur inchangée ;
  // une valeur nulle explicite détache l'acquis du cours.
  if ('cours_code' in req.body) {
    champs.push('cours_code = ?');
    vals.push(req.body.cours_code || null);
  }
  if ('description' in req.body) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Le libellé d'un acquis provient du dossier pédagogique : modification réservée à l'administrateur" });
    }
    if (!req.body.description) return res.status(400).json({ error: 'description vide' });
    champs.push('description = ?');
    vals.push(req.body.description);
  }
  if (!champs.length) return res.status(400).json({ error: 'rien à modifier' });

  vals.push(req.params.code);
  db.prepare(`UPDATE aa SET ${champs.join(', ')} WHERE aa_code = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM aa WHERE aa_code = ?').get(req.params.code));
});

// ── Supprimer un AA ──────────────────────────────────────────────────────────
r.delete('/:code', roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM aa WHERE aa_code = ?').run(req.params.code);
  res.json({ ok: true });
});

export default r;

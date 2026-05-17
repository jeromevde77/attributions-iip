/**
 * Vue planning hebdomadaire : pour chaque attribution, les 43 semaines avec leurs heures.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// GET /api/planning?prof_id=…&section=…
r.get('/', authRequired, (req, res) => {
  const { prof_id, section } = req.query;
  const where = [];
  const params = {};
  if (prof_id) { where.push('a.professeur_id = @prof_id'); params.prof_id = prof_id; }
  if (section) { where.push('a.section = @section');       params.section = section; }

  const attrs = db.prepare(`
    SELECT a.id, a.section, a.ue_num, u.ue_nom, a.code_cours, c.cours_nom,
           a.type_cours, a.code, a.quadrimestre_attribue,
           p.nom || ' ' || p.prenom AS professeur,
           a.periodes_attribuees, a.charge_en_heures
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num
    LEFT JOIN cours c ON c.cours_code = a.code_cours
    LEFT JOIN professeur p ON p.id = a.professeur_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.section, a.ue_num, a.code_cours
  `).all(params);

  // Récupérer les heures par semaine pour chaque attribution
  const planning = db.prepare('SELECT attribution_id, semaine, heures FROM planning_hebdo').all();
  const byAttr = new Map();
  for (const p of planning) {
    if (!byAttr.has(p.attribution_id)) byAttr.set(p.attribution_id, {});
    byAttr.get(p.attribution_id)[p.semaine] = p.heures;
  }

  for (const a of attrs) {
    const semaines = byAttr.get(a.id) || {};
    a.semaines = semaines;
    a.total_place = Object.values(semaines).reduce((s, h) => s + h, 0);
    a.solde = (a.charge_en_heures || 0) - a.total_place;
  }
  res.json(attrs);
});

// PATCH /api/planning/:attributionId/:semaine
r.patch('/:attributionId/:semaine', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { attributionId, semaine } = req.params;
  const { heures } = req.body;
  if (heures == null || heures < 0) {
    return res.status(400).json({ error: 'Heures invalides' });
  }
  if (Number(heures) === 0) {
    db.prepare('DELETE FROM planning_hebdo WHERE attribution_id = ? AND semaine = ?').run(attributionId, semaine);
  } else {
    db.prepare(`
      INSERT INTO planning_hebdo (attribution_id, semaine, heures)
      VALUES (?, ?, ?)
      ON CONFLICT(attribution_id, semaine) DO UPDATE SET heures = excluded.heures
    `).run(attributionId, semaine, Number(heures));
  }
  res.json({ ok: true });
});

export default r;

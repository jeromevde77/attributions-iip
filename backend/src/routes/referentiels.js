import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();

r.get('/sections', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM section ORDER BY code').all());
});

r.get('/ue', authRequired, (req, res) => {
  const { section } = req.query;
  let sql = 'SELECT * FROM ue';
  const params = [];
  if (section) { sql += ' WHERE section = ?'; params.push(section); }
  sql += ' ORDER BY ue_num';
  res.json(db.prepare(sql).all(...params));
});

r.get('/ue/:num', authRequired, (req, res) => {
  const ue = db.prepare('SELECT * FROM ue WHERE ue_num = ?').get(req.params.num);
  if (!ue) return res.status(404).json({ error: 'UE introuvable' });
  const cours = db.prepare('SELECT * FROM cours WHERE ue_num = ?').all(req.params.num);
  const aa = db.prepare('SELECT * FROM aa WHERE ue_num = ?').all(req.params.num);
  res.json({ ...ue, cours, aa });
});

r.get('/cours', authRequired, (req, res) => {
  const { ue_num, section } = req.query;
  let sql = 'SELECT * FROM cours WHERE 1=1';
  const params = [];
  if (ue_num)  { sql += ' AND ue_num = ?'; params.push(ue_num); }
  if (section) { sql += ' AND section = ?'; params.push(section); }
  sql += ' ORDER BY cours_code';
  res.json(db.prepare(sql).all(...params));
});

/**
 * Pour la création en masse d'attributions :
 * retourne pour une section, toutes les UE avec leurs cours et le statut
 * "déjà couvert" (= au moins une attribution existe pour ce cours dans cette section).
 */
r.get('/sections/:section/ue-cours', authRequired, (req, res) => {
  const { section } = req.params;
  const ues = db.prepare(`
    SELECT DISTINCT u.ue_num, u.ue_nom, u.ue_niv AS bloc
    FROM cours c
    LEFT JOIN ue u ON u.ue_num = c.ue_num
    WHERE c.section = ?
    ORDER BY u.ue_niv, u.ue_num
  `).all(section);

  const cours = db.prepare(`
    SELECT c.cours_code, c.cours_nom, c.ue_num, c.ct_pp AS type_cours,
           c.quadrimestre_cours, c.cours_per,
           (SELECT COUNT(*) FROM attribution a
            WHERE a.section = ? AND a.code_cours = c.cours_code) AS nb_attributions
    FROM cours c
    WHERE c.section = ?
    ORDER BY c.cours_code
  `).all(section, section);

  // Grouper les cours par UE
  const byUE = {};
  for (const c of cours) {
    if (!byUE[c.ue_num]) byUE[c.ue_num] = [];
    byUE[c.ue_num].push(c);
  }
  for (const u of ues) {
    u.cours = byUE[u.ue_num] || [];
    u.cours_total = u.cours.length;
    u.cours_couverts = u.cours.filter(c => c.nb_attributions > 0).length;
    u.cours_manquants = u.cours_total - u.cours_couverts;
  }
  res.json(ues);
});

r.get('/professeurs', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM v_professeur_total ORDER BY nom, prenom').all());
});

r.get('/professeurs/:id', authRequired, (req, res) => {
  const p = db.prepare('SELECT * FROM v_professeur_total WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Professeur introuvable' });
  const attrs = db.prepare(`
    SELECT * FROM v_attribution_complete
    WHERE professeur_id = ? ORDER BY section, ue_num
  `).all(req.params.id);
  res.json({ ...p, attributions: attrs });
});

r.get('/locaux', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM local ORDER BY nom').all());
});

r.get('/parametres', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM parametre_financier').all());
});

r.get('/types-encadrement', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM type_encadrement').all());
});

r.get('/activites', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM activite_type ORDER BY ordre, libelle').all());
});

export default r;

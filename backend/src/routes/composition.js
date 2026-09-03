// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Composition déclarée d'une section
//
// La table ue_section existait depuis l'origine mais restait vide faute
// d'écran : « quelles UE appartiennent à quelle section » se déduisait des
// attributions. Elle devient ici la composition déclarée — le programme de la
// section au sens du dossier pédagogique — distincte de ce qu'on organise
// réellement une année donnée.
//
// Une UE peut appartenir à plusieurs sections : le lien est un rattachement,
// jamais une duplication.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

/**
 * GET /api/composition/section/:code?annee=2026-2027
 * La composition de la section + les UE encore disponibles, avec leurs
 * rattachements existants (badge « aussi en … ») et l'état d'organisation.
 */
r.get('/section/:code', authRequired, (req, res) => {
  const code = req.params.code;
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const section = db.prepare('SELECT code, libelle FROM section WHERE code = ?').get(code);
  if (!section) return res.status(404).json({ error: 'section introuvable' });

  // Rattachements de toutes les UE de l'année (pour les badges de partage)
  const liens = db.prepare(
    'SELECT ue_num, section_code FROM ue_section WHERE annee_scolaire = ?'
  ).all(annee);
  const sectionsParUE = new Map();
  for (const l of liens) {
    if (!sectionsParUE.has(l.ue_num)) sectionsParUE.set(l.ue_num, []);
    sectionsParUE.get(l.ue_num).push(l.section_code);
  }

  // Nombre d'organisations déjà posées cette année, par UE de cette section
  const orgas = db.prepare(`
    SELECT ue_num, COUNT(*) n FROM organisation_ue
     WHERE annee_scolaire = ? AND section = ? GROUP BY ue_num
  `).all(annee, code);
  const orgasParUE = new Map(orgas.map(o => [o.ue_num, o.n]));

  const toutes = db.prepare(`
    -- ue_per_total n'existe pas : les périodes destinées à l'étudiant sont
    -- dans ue_per_etudiants. La requête échouait dès qu'elle était atteinte.
    SELECT ue_num, ue_nom, ue_per_etudiants AS ue_per_total, ue_niv
      FROM ue WHERE annee_scolaire = ? ORDER BY ue_num
  `).all(annee);

  const dansSection = new Set(
    liens.filter(l => l.section_code === code).map(l => l.ue_num)
  );

  const enrichir = u => ({
    ...u,
    autres_sections: (sectionsParUE.get(u.ue_num) || []).filter(s => s !== code),
    nb_organisations: orgasParUE.get(u.ue_num) || 0,
  });

  res.json({
    section, annee,
    composition: toutes.filter(u => dansSection.has(u.ue_num)).map(enrichir),
    disponibles: toutes.filter(u => !dansSection.has(u.ue_num)).map(enrichir),
  });
});

/**
 * PUT /api/composition/section/:code
 * Remplace la composition (transactionnel). Référentiel → administrateur.
 * Corps : { annee, ue_nums: [246, 248, …] }
 */
r.put('/section/:code', authRequired, roleRequired('admin'), (req, res) => {
  const code = req.params.code;
  const { annee, ue_nums } = req.body;
  if (!annee || !Array.isArray(ue_nums)) {
    return res.status(400).json({ error: 'annee et ue_nums (tableau) requis' });
  }
  if (!db.prepare('SELECT 1 FROM section WHERE code = ?').get(code)) {
    return res.status(404).json({ error: 'section introuvable' });
  }

  // N'accepter que des UE existantes pour cette année
  const valides = new Set(db.prepare(
    'SELECT ue_num FROM ue WHERE annee_scolaire = ?'
  ).all(annee).map(u => u.ue_num));
  const propres = [...new Set(ue_nums.map(Number))].filter(n => valides.has(n));

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM ue_section WHERE section_code = ? AND annee_scolaire = ?')
      .run(code, annee);
    const ins = db.prepare(
      'INSERT INTO ue_section (ue_num, section_code, annee_scolaire) VALUES (?,?,?)'
    );
    for (const n of propres) ins.run(n, code, annee);
  });
  tx();

  res.json({ ok: true, section: code, annee, nb_ue: propres.length,
             ignorees: ue_nums.length - propres.length });
});

/**
 * POST /api/composition/section/:code/preremplir
 * Propose la composition depuis la réalité des attributions de l'année —
 * la source de vérité historique. N'écrase rien : ajoute ce qui manque.
 */
r.post('/section/:code/preremplir', authRequired, roleRequired('admin'), (req, res) => {
  const code = req.params.code;
  const annee = req.body.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const constatees = db.prepare(`
    SELECT DISTINCT ue_num FROM attribution
     WHERE annee_scolaire = ? AND section = ?
  `).all(annee, code).map(u => u.ue_num);

  const ins = db.prepare(`
    INSERT INTO ue_section (ue_num, section_code, annee_scolaire)
    VALUES (?,?,?) ON CONFLICT DO NOTHING
  `);
  let ajoutees = 0;
  for (const n of constatees) if (ins.run(n, code, annee).changes) ajoutees++;

  res.json({ ok: true, constatees: constatees.length, ajoutees });
});

export default r;

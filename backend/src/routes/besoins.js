// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Besoins en personnel et offres d'emploi
//
// Ordre imposé : pas de besoin → pas d'offre → pas de candidature.
//   · le BESOIN est calculé (attributions « à désigner »), jamais saisi ;
//   · l'OFFRE est créée depuis un besoin, une par cours ;
//   · la PUBLICATION ouvre seule le recrutement.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';

const r = Router();
const peutEcrire = roleRequired('admin', 'editeur');

/** Identifiants des fiches « à désigner » (marqueur explicite + filet de sécurité). */
function idsADesigner() {
  return db.prepare(`
    SELECT id FROM professeur
     WHERE est_a_designer = 1
        OR UPPER(nom) LIKE '%SIGN%'
        OR UPPER(prenom) LIKE '%SIGN%'
        OR UPPER(COALESCE(nom,'') || ' ' || COALESCE(prenom,'')) LIKE '%DESIGN%'
  `).all().map(p => p.id);
}

// ═══ BESOINS ════════════════════════════════════════════════════════════════

/**
 * GET /api/besoins?annee=2026-2027&section=TIM&ue_num=246
 *
 * Un besoin = les attributions non pourvues d'un même cours, regroupées par
 * année / section / UE / cours / quadrimestre. Rien n'est stocké : réattribuer
 * un cours à un professeur fait disparaître le besoin de lui-même.
 */
r.get('/', authRequired, (req, res) => {
  const { annee, section, ue_num } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const aDesigner = idsADesigner();
  if (!aDesigner.length) {
    return res.json({ annee, total: 0, total_periodes: 0, besoins: [],
      message: "Aucune fiche « à désigner » n'est définie dans la base." });
  }

  const where = ['a.annee_scolaire = ?', `a.professeur_id IN (${aDesigner.map(() => '?').join(',')})`];
  const params = [annee, ...aDesigner];
  if (section) { where.push('a.section = ?'); params.push(section); }
  if (ue_num)  { where.push('a.ue_num = ?');  params.push(Number(ue_num)); }

  // Cloisonnement par sections des rôles restreints
  const sections = getUserSections(req.user);
  if (Array.isArray(sections)) {
    if (!sections.length) return res.json({ annee, total: 0, total_periodes: 0, besoins: [] });
    where.push(`a.section IN (${sections.map(() => '?').join(',')})`);
    params.push(...sections);
  }

  const besoins = db.prepare(`
    SELECT a.section, a.ue_num, a.code_cours, a.quadrimestre_attribue AS quadrimestre,
           a.type_cours,
           u.ue_nom, c.cours_nom,
           COUNT(*)                                                   AS nb_groupes,
           ROUND(SUM(COALESCE(a.total_attribue_professeur, 0)), 2)    AS total_periodes,
           ROUND(AVG(COALESCE(a.total_attribue_professeur, 0)), 2)    AS periodes_par_groupe,
           GROUP_CONCAT(DISTINCT a.code)                              AS groupes,
           (SELECT COUNT(*) FROM recrutement_poste p
             WHERE p.annee_scolaire = a.annee_scolaire
               AND p.code_cours = a.code_cours
               AND p.section    = a.section
               AND p.statut NOT IN ('close', 'annule'))               AS offres_existantes
      FROM attribution a
      LEFT JOIN ue    u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
      LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
     WHERE ${where.join(' AND ')}
     GROUP BY a.section, a.ue_num, a.code_cours, a.quadrimestre_attribue
     ORDER BY a.section, a.ue_num, a.code_cours
  `).all(...params);

  res.json({
    annee,
    total: besoins.length,
    total_periodes: Math.round(besoins.reduce((s, b) => s + (b.total_periodes || 0), 0) * 100) / 100,
    sans_offre: besoins.filter(b => !b.offres_existantes).length,
    besoins,
  });
});

/** Titres du référentiel visés par un cours, pour préremplir une offre. */
r.get('/titres-cours/:coursCode', authRequired, (req, res) => {
  const lignes = db.prepare(`
    SELECT ct.id, ct.portee, t.id AS titre_id, t.code, t.libelle, t.niveau, t.categorie
      FROM cours_titre ct JOIN titre t ON t.id = ct.titre_id
     WHERE ct.cours_code = ? AND t.actif = 1
     ORDER BY CASE ct.portee WHEN 'requis' THEN 1 WHEN 'suffisant' THEN 2 ELSE 3 END, t.libelle
  `).all(req.params.coursCode);
  res.json({ cours_code: req.params.coursCode, titres: lignes });
});

// ═══ OFFRES ═════════════════════════════════════════════════════════════════

/**
 * POST /api/besoins/offre
 * Crée l'offre à partir d'un besoin. Les acquis d'apprentissage rattachés au
 * cours et les titres visés sont repris automatiquement.
 */
r.post('/offre', authRequired, peutEcrire, (req, res) => {
  const { annee, section, ue_num, code_cours, quadrimestre, type_cours,
          periodes_cours, nb_groupes, total_periodes, nb_postes,
          intitule, description, profil, competences, horaire_indicatif,
          titres_extra, date_limite } = req.body;

  if (!annee || !code_cours) {
    return res.status(400).json({ error: 'annee et code_cours requis' });
  }

  const cours = db.prepare(
    'SELECT cours_nom FROM cours WHERE cours_code = ? AND annee_scolaire = ?'
  ).get(code_cours, annee);
  const ue = ue_num ? db.prepare(
    'SELECT ue_nom FROM ue WHERE ue_num = ? AND annee_scolaire = ? LIMIT 1'
  ).get(Number(ue_num), annee) : null;

  const titreOffre = intitule
    || `${cours?.cours_nom || code_cours}${section ? ' — ' + section : ''}`;

  const info = db.prepare(`
    INSERT INTO recrutement_poste
      (intitule, section, ue_num, code_cours, quadrimestre, type_cours,
       periodes_cours, nb_groupes, total_periodes, nb_postes,
       description, profil, competences, horaire_indicatif,
       titres_extra, date_limite, statut, annee_scolaire, cree_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'brouillon', ?, ?)
  `).run(
    titreOffre, section || null, ue_num ? String(ue_num) : null, code_cours,
    quadrimestre || null, type_cours || null,
    periodes_cours ?? null, nb_groupes ?? null, total_periodes ?? null,
    nb_postes ?? (nb_groupes || 1),
    description || null, profil || null, competences || null,
    horaire_indicatif || null,
    titres_extra ? JSON.stringify(titres_extra) : null,
    date_limite || null, annee,
    req.user.nom || req.user.email || `#${req.user.id}`
  );

  res.json(detailOffre(Number(info.lastInsertRowid)));
});

/** Détail d'une offre, avec ses acquis d'apprentissage et ses titres. */
function detailOffre(id) {
  const offre = db.prepare('SELECT * FROM recrutement_poste WHERE id = ?').get(id);
  if (!offre) return null;

  // Acquis d'apprentissage rattachés au cours (rattachement fait dans la fiche UE)
  const acquis = offre.code_cours ? db.prepare(`
    SELECT aa_code, aa_num, description FROM aa
     WHERE cours_code = ? ORDER BY aa_num
  `).all(offre.code_cours) : [];

  // Titres visés : ceux du référentiel + ceux cochés en plus sur l'offre
  const duReferentiel = offre.code_cours ? db.prepare(`
    SELECT t.id, t.code, t.libelle, t.niveau, ct.portee
      FROM cours_titre ct JOIN titre t ON t.id = ct.titre_id
     WHERE ct.cours_code = ? AND t.actif = 1
     ORDER BY CASE ct.portee WHEN 'requis' THEN 1 WHEN 'suffisant' THEN 2 ELSE 3 END, t.libelle
  `).all(offre.code_cours) : [];

  let extra = [];
  try {
    const ids = JSON.parse(offre.titres_extra || '[]');
    if (ids.length) {
      extra = db.prepare(
        `SELECT id, code, libelle, niveau, 'ajoute' AS portee FROM titre WHERE id IN (${ids.map(() => '?').join(',')})`
      ).all(...ids);
    }
  } catch { /* JSON invalide : on ignore */ }

  return { ...offre, acquis, titres: [...duReferentiel, ...extra] };
}

r.get('/offre/:id', authRequired, (req, res) => {
  const o = detailOffre(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'offre introuvable' });
  res.json(o);
});

r.get('/offres', authRequired, (req, res) => {
  const { annee, statut } = req.query;
  const where = [], params = [];
  if (annee)  { where.push('annee_scolaire = ?'); params.push(annee); }
  if (statut) { where.push('statut = ?');         params.push(statut); }
  const sql = `SELECT * FROM recrutement_poste
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY cree_le DESC`;
  res.json(db.prepare(sql).all(...params));
});

r.patch('/offre/:id', authRequired, peutEcrire, (req, res) => {
  const permis = ['intitule', 'description', 'profil', 'competences',
                  'horaire_indicatif', 'periodes_cours', 'nb_groupes',
                  'total_periodes', 'nb_postes', 'date_limite', 'quadrimestre',
                  'canal_publication', 'statut'];
  const champs = [], vals = [];
  for (const k of permis) {
    if (req.body[k] !== undefined) { champs.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (req.body.titres_extra !== undefined) {
    champs.push('titres_extra = ?');
    vals.push(JSON.stringify(req.body.titres_extra || []));
  }
  if (!champs.length) return res.status(400).json({ error: 'rien à modifier' });
  vals.push(Number(req.params.id));
  db.prepare(`UPDATE recrutement_poste SET ${champs.join(', ')} WHERE id = ?`).run(...vals);
  res.json(detailOffre(Number(req.params.id)));
});

/**
 * POST /api/besoins/offre/:id/publier
 * Verrou de la chaîne : tant qu'une offre n'est pas publiée, aucune candidature
 * ne devrait s'y rattacher.
 */
r.post('/offre/:id/publier', authRequired, peutEcrire, (req, res) => {
  const id = Number(req.params.id);
  const offre = db.prepare('SELECT * FROM recrutement_poste WHERE id = ?').get(id);
  if (!offre) return res.status(404).json({ error: 'offre introuvable' });
  if (offre.statut === 'publiee') {
    return res.status(409).json({ error: 'offre déjà publiée' });
  }
  if (!offre.code_cours) {
    return res.status(400).json({ error: 'une offre doit viser un cours' });
  }

  db.prepare(`
    UPDATE recrutement_poste
       SET statut = 'publiee', date_publication = ?, canal_publication = ?, publie_par = ?
     WHERE id = ?
  `).run(
    req.body.date_publication || new Date().toISOString().slice(0, 10),
    req.body.canal_publication || null,
    req.user.nom || req.user.email || `#${req.user.id}`,
    id
  );
  res.json(detailOffre(id));
});

// ═══ RÉFÉRENTIEL DES TITRES (légal → administrateur) ════════════════════════

r.get('/titres', authRequired, (req, res) => {
  res.json(db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM cours_titre ct WHERE ct.titre_id = t.id) AS nb_cours
      FROM titre t WHERE t.actif = 1 ORDER BY t.categorie, t.libelle
  `).all());
});

r.post('/titres', authRequired, roleRequired('admin'), (req, res) => {
  const { code, libelle, niveau, categorie } = req.body;
  if (!code || !libelle) return res.status(400).json({ error: 'code et libelle requis' });
  try {
    const i = db.prepare(
      'INSERT INTO titre (code, libelle, niveau, categorie) VALUES (?,?,?,?)'
    ).run(code, libelle, niveau || null, categorie || null);
    res.json(db.prepare('SELECT * FROM titre WHERE id = ?').get(Number(i.lastInsertRowid)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'ce code existe déjà' });
    res.status(500).json({ error: e.message });
  }
});

/** Rattacher / détacher un titre d'un cours (référentiel légal → admin). */
r.post('/titres-cours', authRequired, roleRequired('admin'), (req, res) => {
  const { cours_code, titre_id, portee } = req.body;
  if (!cours_code || !titre_id) return res.status(400).json({ error: 'cours_code et titre_id requis' });
  if (portee && !['requis', 'suffisant', 'penurie'].includes(portee)) {
    return res.status(400).json({ error: 'portée invalide' });
  }
  try {
    db.prepare(`
      INSERT INTO cours_titre (cours_code, titre_id, portee) VALUES (?,?,?)
      ON CONFLICT(cours_code, titre_id) DO UPDATE SET portee = excluded.portee
    `).run(cours_code, Number(titre_id), portee || 'requis');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/titres-cours/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM cours_titre WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default r;

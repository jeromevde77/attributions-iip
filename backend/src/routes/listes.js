// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Listes paramétrables
//
// Principe : l'appelant choisit QUOI il veut voir (l'entité), SELON QUEL critère
// (les filtres) et COMMENT (le regroupement). Les champs autorisés sont décrits
// dans une liste blanche : aucune portion de SQL ne provient de la requête HTTP.
//
// Presque tout se relie par `attribution`, qui porte à la fois le professeur,
// l'UE, le cours, la section et l'année : « les professeurs d'une section » et
// « les professeurs d'une UE » sont donc la même requête, à critère près.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';

const r = Router();

// ── Liste blanche des filtres, par entité ───────────────────────────────────
// clé → { colonne SQL, type }
const FILTRES = {
  professeurs: {
    section:   { sql: 'a.section',                 type: 'texte' },
    ue_num:    { sql: 'a.ue_num',                  type: 'nombre' },
    quadri:    { sql: 'a.quadrimestre_attribue',   type: 'texte' },
    statut:    { sql: 'p.statut',                  type: 'texte' },
    capaes:    { sql: 'p.capaes',                  type: 'texte' },
    type_cours:{ sql: 'a.type_cours',              type: 'texte' },
    contrat:   { sql: 'a.contrat_mdp',             type: 'texte' },
  },
};

/**
 * GET /api/listes/professeurs
 *   ?annee=2026-2027&section=TIM&ue_num=246&statut=MDP
 *   &cours=aucun|colonne|colonnes        (détail des cours donnés)
 *   &par_section=1                        (une ligne par section, sinon une par prof)
 *
 * Règle retenue avec Jérôme : un professeur qui donne plusieurs cours dans la
 * même section n'apparaît qu'UNE fois. Le détail de ses cours peut être ajouté
 * soit dans une colonne unique, soit déplié en autant de colonnes que
 * nécessaire.
 */
r.get('/professeurs', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const cours = ['aucun', 'colonne', 'colonnes'].includes(req.query.cours)
    ? req.query.cours : 'aucun';
  const parSection = req.query.par_section === '1';

  // Filtres : uniquement ceux de la liste blanche
  const where = ['a.annee_scolaire = ?'];
  const params = [annee];
  const filtresAppliques = {};
  for (const [cle, def] of Object.entries(FILTRES.professeurs)) {
    const v = req.query[cle];
    if (v === undefined || v === '') continue;
    where.push(`${def.sql} = ?`);
    params.push(def.type === 'nombre' ? Number(v) : v);
    filtresAppliques[cle] = v;
  }

  // Cloisonnement par sections pour les rôles restreints
  const sections = getUserSections(req.user);
  if (Array.isArray(sections) && sections.length) {
    where.push(`a.section IN (${sections.map(() => '?').join(',')})`);
    params.push(...sections);
  } else if (Array.isArray(sections) && !sections.length) {
    return res.json({ annee, lignes: [], colonnes_cours: 0, total: 0,
                      filtres: filtresAppliques,
                      message: 'Aucune section autorisée pour ce compte' });
  }

  // Une ligne = un professeur (× section si demandé).
  // total_attribue_professeur = périodes + autonomie : ne jamais sommer les
  // seules périodes attribuées, l'autonomie représente une part significative.
  const cle = parSection ? 'p.id, a.section' : 'p.id';
  const lignes = db.prepare(`
    SELECT p.id                              AS professeur_id,
           p.nom, p.prenom, p.statut,
           p.adresse_mail, p.mail_prive, p.matricule, p.capaes,
           ${parSection ? 'a.section' : "GROUP_CONCAT(DISTINCT a.section)"} AS section,
           COUNT(DISTINCT a.ue_num)          AS nb_ue,
           COUNT(DISTINCT a.code_cours)      AS nb_cours,
           ROUND(SUM(COALESCE(a.total_attribue_professeur, 0)), 2) AS total_periodes
      FROM attribution a
      JOIN professeur  p ON p.id = a.professeur_id
     WHERE ${where.join(' AND ')}
     GROUP BY ${cle}
     ORDER BY ${parSection ? 'a.section, ' : ''} p.nom, p.prenom
  `).all(...params);

  // Détail des cours donnés
  let colonnesCours = 0;
  if (cours !== 'aucun' && lignes.length) {
    const detail = db.prepare(`
      SELECT a.professeur_id, a.section, a.ue_num, a.code_cours,
             c.cours_nom, a.type_cours,
             ROUND(SUM(COALESCE(a.total_attribue_professeur, 0)), 2) AS periodes
        FROM attribution a
        JOIN professeur p ON p.id = a.professeur_id
        LEFT JOIN cours c ON c.cours_code = a.code_cours
                         AND c.annee_scolaire = a.annee_scolaire
       WHERE ${where.join(' AND ')}
       GROUP BY a.professeur_id, ${parSection ? 'a.section,' : ''} a.ue_num, a.code_cours
       ORDER BY a.ue_num, a.code_cours
    `).all(...params);

    const parProf = new Map();
    for (const d of detail) {
      const k = parSection ? `${d.professeur_id}|${d.section}` : String(d.professeur_id);
      if (!parProf.has(k)) parProf.set(k, []);
      parProf.get(k).push({
        ue_num: d.ue_num, code: d.code_cours,
        nom: d.cours_nom || d.code_cours || `UE ${d.ue_num}`,
        type: d.type_cours, periodes: d.periodes,
      });
    }

    for (const l of lignes) {
      const k = parSection ? `${l.professeur_id}|${l.section}` : String(l.professeur_id);
      const liste = parProf.get(k) || [];
      if (cours === 'colonne') {
        l.cours = liste.map(c => `${c.nom} (${c.periodes} p.)`).join(' · ');
      } else {
        // Déplié : autant de colonnes que le professeur le plus chargé
        liste.forEach((c, i) => { l[`cours_${i + 1}`] = `${c.nom} (${c.periodes} p.)`; });
        colonnesCours = Math.max(colonnesCours, liste.length);
      }
      l._cours = liste;
    }
  }

  res.json({
    annee, total: lignes.length, filtres: filtresAppliques,
    par_section: parSection, mode_cours: cours,
    colonnes_cours: colonnesCours,
    lignes,
  });
});

/**
 * GET /api/listes/options?annee=2026-2027
 * Valeurs disponibles pour alimenter les sélecteurs de filtres.
 */
r.get('/options', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const sections = getUserSections(req.user);
  const restreint = Array.isArray(sections) && sections.length;

  const col = (sql, params = []) => db.prepare(sql).all(...params)
    .map(o => Object.values(o)[0]).filter(v => v !== null && v !== '');

  res.json({
    sections: restreint ? sections : col(
      'SELECT DISTINCT section FROM attribution WHERE annee_scolaire = ? AND section IS NOT NULL ORDER BY section', [annee]),
    ues: db.prepare(`
      SELECT DISTINCT a.ue_num, u.ue_nom
        FROM attribution a
        LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
       WHERE a.annee_scolaire = ? ORDER BY a.ue_num`).all(annee),
    statuts: col(
      'SELECT DISTINCT statut FROM professeur WHERE statut IS NOT NULL ORDER BY statut'),
    quadris: col(
      'SELECT DISTINCT quadrimestre_attribue FROM attribution WHERE annee_scolaire = ? ORDER BY quadrimestre_attribue', [annee]),
    types_cours: col(
      'SELECT DISTINCT type_cours FROM attribution WHERE annee_scolaire = ? ORDER BY type_cours', [annee]),
  });
});

export default r;

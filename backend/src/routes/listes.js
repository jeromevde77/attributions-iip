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
import { niveauEtudiant, sectionRattachement } from './etudiants.js';
import { POURCENTAGE_DISPENSE } from '../lib/valorisation.js';
import { anneeDeTravail } from '../helpers/annee.js';

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
/**
 * GET /api/listes/etudiants — LE PRINCIPE DE JÉRÔME (25 septembre 2026) :
 * l'ENTITÉ fait les lignes (des étudiants), les CRITÈRES la réduisent —
 * section, UE, cours, primo, niveau. Et L'ANNÉE FAIT LA LISTE : les
 * étudiants d'une année sont ceux qui y sont inscrits (ou, pour une section
 * sans critère d'unité, ses rattachés encore sans PAE) — 2024-2025 et
 * 2026-2027 ne montrent pas les mêmes noms.
 *
 * LES DISPENSÉS SE DISENT, EN DESSOUS : sur une liste par UE ou par cours,
 * celui qui a déjà l'unité n'est pas dans la liste des présents — il paraît
 * après, avec sa provenance : « report 2024-2025 (13/20) » (réussite d'une
 * année antérieure) ou « VA (10/20) » (valorisation de l'année).
 */
r.get('/etudiants', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const { section, cours_code } = req.query;
  const primo = req.query.primo === '1';
  const fNiveau = String(req.query.niveau_etu || '');

  const perim = getUserSections(req.user);
  if (section && perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }

  // Le cours désigne son unité ; sinon l'unité vient du critère.
  let ueNum = Number(req.query.ue_num) || null;
  let groupeDuCours = null;
  if (cours_code) {
    const c = db.prepare(
      'SELECT ue_num FROM cours WHERE cours_code = ? ORDER BY (annee_scolaire = ?) DESC LIMIT 1')
      .get(cours_code, annee);
    if (c?.ue_num) ueNum = c.ue_num;
    groupeDuCours = db.prepare(`
      SELECT etudiant_id, num_organisation, groupe_code FROM etudiant_cours_groupe
      WHERE annee_scolaire = ? AND cours_code = ?`).all(annee, cours_code);
  }
  const grpPar = new Map((groupeDuCours || []).map(g =>
    [g.etudiant_id, `Org ${g.num_organisation ?? '?'}${g.groupe_code ? ` · Gr. ${g.groupe_code}` : ''}`]));

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '');

  // ── La base : les étudiants DE L'ANNÉE ────────────────────────────────────
  let base;
  if (ueNum) {
    base = db.prepare(`
      SELECT e.id, e.nom, e.prenom, e.id_ecampus, e.email_ecole, i.resultat, i.points
      FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND i.ue_num = ? AND e.actif = 1
      ORDER BY e.nom, e.prenom`).all(annee, ueNum)
      .map(x => ({ ...x, statut: 'Inscrit' }));
  } else {
    base = db.prepare(`
      SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus, e.email_ecole
      FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND e.actif = 1
      ORDER BY e.nom, e.prenom`).all(annee)
      .map(x => ({ ...x, statut: 'Inscrit' }));
    if (section) {
      // Les rattachés de la section encore sans PAE cette année : ils sont
      // « de l'année » aussi — susceptibles d'en avoir un.
      const dedans = new Set(base.map(x => x.id));
      for (const e of db.prepare(
        'SELECT id, nom, prenom, id_ecampus, email_ecole FROM etudiant WHERE actif = 1').all()) {
        if (dedans.has(e.id)) continue;
        const rat = sectionRattachement(e.id, annee);
        if (rat.section && norm(rat.section) === norm(section)) {
          base.push({ ...e, statut: 'Sans PAE', resultat: null, points: null });
        }
      }
    }
  }

  // Enrichir : section, niveau, primo — et filtrer.
  const anciens = new Set([
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire < ?')
      .all(annee).map(x => x.etudiant_id),
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_valorisation WHERE annee_scolaire < ?')
      .all(annee).map(x => x.etudiant_id),
  ]);
  const enrichir = (x) => {
    const rat = sectionRattachement(x.id, annee);
    return {
      ...x, section: rat.section || '',
      niveau: niveauEtudiant(x.id, annee).niveau || '',
      primo: anciens.has(x.id) ? '' : 'Oui',
      matricule: x.id_ecampus || '',
      groupe: grpPar.get(x.id) || '',
    };
  };
  const garder = (x) =>
    (!section || norm(x.section) === norm(section))
    && (!primo || x.primo === 'Oui')
    && (!fNiveau || (fNiveau === 'aucun' ? !x.niveau : x.niveau === fNiveau))
    && (!perim || !x.section || perim.some(s => norm(s) === norm(x.section)));

  let lignes = base.map(enrichir).filter(garder);

  // ── Les dispensés, en dessous — seulement quand la liste vise une unité ──
  if (ueNum) {
    const nonDisp = [];
    const dispenses = [];
    // VA de l'année sur l'unité (décision non refusée) : 10/20 conventionnels.
    const noteVA = `${Math.round(20 * (POURCENTAGE_DISPENSE / 100))}/20`;
    const vas = new Set(db.prepare(`
      SELECT etudiant_id FROM etudiant_valorisation
      WHERE annee_scolaire = ? AND ue_num = ?
        AND COALESCE(decision,'accordee') <> 'refusee'`).all(annee, ueNum)
      .map(x => x.etudiant_id));
    // Report : la réussite d'une année ANTÉRIEURE, avec sa note et son année.
    const reports = new Map();
    for (const x of db.prepare(`
      SELECT etudiant_id, annee_scolaire, points FROM etudiant_inscription
      WHERE ue_num = ? AND annee_scolaire < ? AND resultat = 'reussi'
      ORDER BY annee_scolaire DESC`).all(ueNum, annee)) {
      if (!reports.has(x.etudiant_id)) reports.set(x.etudiant_id, x);
    }
    for (const x of lignes) {
      if (vas.has(x.id)) {
        dispenses.push({ ...x, statut: `Dispensé — VA (${noteVA})`, resultat: '', points: null });
      } else if (reports.has(x.id)) {
        const r0 = reports.get(x.id);
        dispenses.push({ ...x,
          statut: `Dispensé — report ${r0.annee_scolaire}${r0.points != null ? ` (${r0.points}/20)` : ''}`,
          resultat: '', points: null });
      } else nonDisp.push(x);
    }
    // Ceux qui ont l'unité par VA ou report SANS y être inscrits cette année :
    // ils appartiennent aussi à la liste des dispensés, s'ils sont de l'année.
    const presents = new Set(db.prepare(
      'SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire = ?')
      .all(annee).map(x => x.etudiant_id));
    const dejaListes = new Set([...nonDisp, ...dispenses].map(x => x.id));
    for (const [eid, quoi] of [...vas].map(v => [v, 'va'])
      .concat([...reports.keys()].map(k => [k, 'report']))) {
      if (dejaListes.has(eid) || !presents.has(eid)) continue;
      const e = db.prepare(
        'SELECT id, nom, prenom, id_ecampus, email_ecole FROM etudiant WHERE id = ? AND actif = 1').get(eid);
      if (!e) continue;
      const x = enrichir({ ...e, resultat: null, points: null });
      if (!garder(x)) continue;
      dejaListes.add(eid);
      const r0 = reports.get(eid);
      dispenses.push({ ...x,
        statut: quoi === 'va' ? `Dispensé — VA (${noteVA})`
          : `Dispensé — report ${r0.annee_scolaire}${r0.points != null ? ` (${r0.points}/20)` : ''}` });
    }
    dispenses.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    lignes = [...nonDisp, ...dispenses];
  }

  res.json({ annee, lignes });
});

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

// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Module Étudiants : base étudiants, inscriptions, résultats et PAE
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { LOGO_IIP_JPEG } from '../services/assets/logo_iip_jpeg.js';
import { piedBalisage, piedStyles, reglesDePage, envelopperDocument } from '../lib/document.js';

import db from '../db/index.js';
import { piedDocument } from './parametres.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { construireGraphe, niveauxEffectifs } from './capitalisation.js';
import { structureUE, calculerNoteUE, coursValidesAnterieurs } from './acquis.js';
import { calculerDI, calculerDIS } from './droitInscription.js';

const r = Router();

// Intitulé, niveau et section d'une UE, indépendamment de l'année.
// Le référentiel est dupliqué par année scolaire ; cette vue en donne une
// lecture pérenne : le millésime de l'année demandée s'il existe, sinon le
// plus récent connu. Sans quoi les années antérieures au premier référentiel
// affichent des UE sans nom.
const UE_REF = `(
  SELECT ue_num,
         (SELECT ue_nom  FROM ue x WHERE x.ue_num = u0.ue_num AND x.ue_nom  IS NOT NULL ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_nom,
         (SELECT ue_niv  FROM ue x WHERE x.ue_num = u0.ue_num AND x.ue_niv  IS NOT NULL ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_niv,
         (SELECT section FROM ue x WHERE x.ue_num = u0.ue_num AND x.section IS NOT NULL ORDER BY x.annee_scolaire DESC LIMIT 1) AS section,
         (SELECT ue_quad FROM ue x WHERE x.ue_num = u0.ue_num ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_quad,
         -- Les crédits manquaient à cette sous-requête : la fiche affichait
         -- donc un tiret sur chaque ligne, et les demander faisait échouer la
         -- requête entière.
         (SELECT ects FROM ue x WHERE x.ue_num = u0.ue_num AND x.ects IS NOT NULL ORDER BY x.annee_scolaire DESC LIMIT 1) AS ects
  FROM ue u0 GROUP BY ue_num
)`;

/**
 * Niveau d'un étudiant, déduit des UE à son programme.
 *
 *   toutes de BA1  → « BA1 »        (idem BA2)
 *   toutes de BA3  → « Diplômant »  (il ne lui reste que l'année terminale)
 *   mélangées      → « Parcours »   (il reprend des UE de plusieurs années)
 *
 * Le niveau retenu est celui de la section (ue_niveau_section), le même que
 * dans le schéma de capitalisation — et non la valeur brute du référentiel.
 */
export function niveauEtudiant(etudId, annee) {
  let lignes = db.prepare(`
    SELECT DISTINCT ue_num FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ?
  `).all(etudId, annee);

  // Sans programme pour l'année demandée, on se rabat sur la dernière connue
  let anneeRetenue = annee;
  if (!lignes.length) {
    const derniere = db.prepare(`
      SELECT MAX(annee_scolaire) AS a FROM etudiant_inscription WHERE etudiant_id = ?
    `).get(etudId)?.a;
    if (!derniere) return { niveau: null, libelle: null, detail: {} };
    anneeRetenue = derniere;
    lignes = db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ?
    `).all(etudId, derniere);
  }
  if (!lignes.length) return { niveau: null, libelle: null, detail: {} };

  const { sections } = sectionsDeLEtudiant(etudId, null);
  const niveaux = sections.length ? niveauxEffectifs(sections, anneeRetenue) : {};

  const detail = {};
  for (const l of lignes) {
    const n = (niveaux[l.ue_num] || '').toUpperCase();
    if (!n) continue;
    detail[n] = (detail[n] || 0) + 1;
  }
  const presents = Object.keys(detail);
  if (!presents.length) return { niveau: null, libelle: null, detail };

  if (presents.length === 1) {
    const seul = presents[0];
    return {
      niveau: seul,
      libelle: seul === 'BA3' ? 'Diplômant' : seul,
      detail, annee: anneeRetenue,
    };
  }
  return { niveau: 'MIXTE', libelle: 'Parcours', detail, annee: anneeRetenue };
}

export function migrerEtudiants(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      id_ecampus     TEXT UNIQUE,
      nom            TEXT NOT NULL,
      prenom         TEXT NOT NULL,
      date_naissance TEXT,
      email_ecole    TEXT,
      email_perso    TEXT,
      num_national   TEXT,
      gsm            TEXT,
      adresse        TEXT,
      localite       TEXT,
      cp             TEXT,
      titre          TEXT,
      actif          INTEGER NOT NULL DEFAULT 1,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_etudiant_nom ON etudiant(nom, prenom);

    CREATE TABLE IF NOT EXISTS etudiant_inscription (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      groupe         TEXT,
      statut         TEXT DEFAULT 'inscrit',
      resultat       TEXT,
        -- Les TROIS décisions de première session, distinguées par la circulaire
        -- sanction des études : 'reussi', 'ajourne' — qui ouvre une seconde
        -- session sur des acquis précis — et 'refuse', qui ne l'ouvre pas.
        -- 'absent' et NULL complètent le tableau.
      mention        TEXT,        -- A, B, C, D, E
      points         REAL,
      cree_le        TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, annee_scolaire, ue_num)
    );
    CREATE INDEX IF NOT EXISTS idx_inscription_etud
      ON etudiant_inscription(etudiant_id, annee_scolaire);
    `);
    console.log('[migration] Tables etudiant + etudiant_inscription créées');

    // Pièces du dossier individuel de l'apprenant (circulaire n° 9764 du 13/07/2026)
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_piece (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id  INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      type_piece   TEXT NOT NULL,
      statut       TEXT NOT NULL DEFAULT 'manquant',   -- manquant | recu | na
      commentaire  TEXT,
      maj_le       TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, type_piece)
    );`);

    // Colonnes réglementaires sur l'inscription (fiche d'inscription/reçu)
    const addCol = (t, def) => { try { dbx.exec('ALTER TABLE ' + t + ' ADD COLUMN ' + def); } catch {} };
    addCol('etudiant_inscription', "date_inscription TEXT");
    addCol('etudiant_inscription', "admission_type TEXT"); // 'titre' | 'test' | null
    addCol('etudiant_inscription', "dispense_complete INTEGER NOT NULL DEFAULT 0");
    addCol('etudiant_inscription', "codiplomation_ch INTEGER NOT NULL DEFAULT 0");
    addCol('etudiant_inscription', "di_specifique REAL");
    addCol('etudiant_inscription', "ects REAL");
    addCol('etudiant_inscription', "derogation INTEGER NOT NULL DEFAULT 0");
    console.log('[migration] etudiant_piece + colonnes fiche inscription');

    // Correspondance entre les codes d'UE d'eCampus (TINFO, PDPS, 901…) et les
    // numéros d'UE de Lucie. Établie une fois, elle vaut pour tous les imports
    // suivants — la liste d'eCampus ne porte pas le ue_num.
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS ue_code_externe (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      code     TEXT NOT NULL UNIQUE,
      ue_num   INTEGER NOT NULL,
      libelle  TEXT,
      maj_le   TEXT DEFAULT (datetime('now'))
    );`);

    // Valorisation des acquis — AGCF 13-12-2024 (art. 3 partielle, art. 4 complète)
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_valorisation (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      type           TEXT NOT NULL CHECK (type IN ('complete','partielle','admission')),
      cible          TEXT CHECK (cible IN ('aa','cours') OR cible IS NULL),
      cible_detail   TEXT,          -- codes AA ou codes cours dispensés (séparés par virgule)
      pourcentage    REAL,          -- note attribuée (pratique : 50 par défaut)
      decision_ce_date TEXT,        -- date de la décision du Conseil des études
      commentaire    TEXT,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_valo_etud ON etudiant_valorisation(etudiant_id);
    `);
    console.log('[migration] etudiant_valorisation créée');

    // Notes détaillées par cours et par acquis d'apprentissage
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_note_detail (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER NOT NULL,
      type           TEXT NOT NULL CHECK (type IN ('cours','aa')),
      code           TEXT NOT NULL,
      points         REAL,
      va             INTEGER NOT NULL DEFAULT 0,
      commentaire    TEXT,
      UNIQUE(etudiant_id, annee_scolaire, ue_num, type, code)
    );
    CREATE INDEX IF NOT EXISTS idx_note_detail
      ON etudiant_note_detail(etudiant_id, annee_scolaire, ue_num);
    `);
    console.log('[migration] etudiant_note_detail créée');
  } catch (e) { console.error('[migration] etudiants :', e.message); }
}

// Les 5 pièces réglementaires (circulaire dossiers apprenants EA)
export const PIECES_APPRENANT = [
  { type: 'identite',          libelle: "Copie du document d'identité" },
  { type: 'titre_cpr',         libelle: 'Titre correspondant aux capacités préalables requises (ou valorisation des acquis)' },
  { type: 'fiche_inscription', libelle: "Fiche d'inscription / reçu" },
  { type: 'decision_ce',       libelle: 'Décision favorable du Conseil des études (réinscription UE déjà réussie)' },
  { type: 'exoneration_di',    libelle: "Documents d'exonération du droit d'inscription" },
];

// Sections d'un étudiant, pondérées par le nombre d'UE inscrites.
// Certaines UE sont partagées entre sections : une seule UE commune ne doit
// pas faire entrer tout le catalogue d'une autre section. On ne retient donc
// que la (ou les) section(s) dominante(s).
/**
 * Périmètre de l'utilisateur. Sans cloisonnement, un coordinateur voyait les
 * étudiants de tout l'établissement — le panneau d'accès affichait ses
 * sections sans que rien ne les fasse respecter.
 */
function perimetre(req) {
  return getUserSections(req.user);      // null = toutes
}

function sectionAutoriseeReq(req, section) {
  const p = perimetre(req);
  return p === null ? true : (section ? p.includes(section) : false);
}

function sectionsDeLEtudiant(etudId, forcee) {
  if (forcee) return { sections: [forcee], scores: [] };
  // La section d'une UE ne dépend pas de l'année : joindre sur l'année de
  // l'inscription excluait tout ce que le référentiel ne couvre pas. Sur la
  // base de production, qui ne remonte qu'à 2025-2026, 306 étudiants sur 576
  // se retrouvaient sans section — et donc sans PAE possible.
  //
  // On prend la section connue pour cette UE, la plus récente d'abord, comme
  // le fait UE_REF ailleurs dans ce fichier.
  // Une jointure plutôt qu'une sous-requête corrélée : SQLite ne fait pas
  // remonter l'alias « i » à l'intérieur d'une table dérivée, et la requête
  // échouait à chaque appel — donc la liste entière.
  //
  // La préférence pour l'année de l'inscription se traduit ici par un tri sur
  // la table jointe, et DISTINCT garde une seule section par UE.
  // Deux requêtes simples plutôt qu'une corrélée : SQLite n'accepte pas de
  // référence à un alias extérieur depuis une sous-requête placée dans une
  // table dérivée, ni depuis son ORDER BY. La règle de préférence — l'année de
  // l'inscription d'abord, la plus récente ensuite — se calcule donc ici.
  const inscriptions = db.prepare(
    'SELECT DISTINCT ue_num, annee_scolaire FROM etudiant_inscription WHERE etudiant_id = ?'
  ).all(etudId);

  const sectionsParUe = {};
  if (inscriptions.length) {
    const nums = [...new Set(inscriptions.map(x => x.ue_num))];
    for (const l of db.prepare(`
      SELECT ue_num, annee_scolaire, section FROM ue
      WHERE ue_num IN (${nums.map(() => '?').join(',')}) AND section IS NOT NULL
    `).all(...nums)) {
      (sectionsParUe[l.ue_num] = sectionsParUe[l.ue_num] || []).push(l);
    }
  }

  const parSection = {};
  for (const ins of inscriptions) {
    const candidats = sectionsParUe[ins.ue_num] || [];
    if (!candidats.length) continue;
    const exact = candidats.find(x => x.annee_scolaire === ins.annee_scolaire);
    const retenue = exact
      || [...candidats].sort((a, b) =>
           String(b.annee_scolaire).localeCompare(String(a.annee_scolaire)))[0];
    (parSection[retenue.section] = parSection[retenue.section] || new Set()).add(ins.ue_num);
  }

  const scores = Object.entries(parSection)
    .map(([section, ues]) => ({ section, n: ues.size }))
    .sort((a, b) => b.n - a.n);
  if (!scores.length) return { sections: [], scores };
  const max = scores[0].n;
  // Seuil : une section n'est retenue que si elle couvre au moins 60 % des UE
  // de la section dominante (une UE partagée isolée reste sous le seuil).
  const sections = scores.filter(s => s.n >= Math.max(2, max * 0.6)).map(s => s.section);
  return { sections: sections.length ? sections : [scores[0].section], scores };
}

// ── Liste des étudiants ───────────────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  const { section, q } = req.query;
  const autorisees = perimetre(req);
  if (section && !sectionAutoriseeReq(req, section)) {
    return res.status(403).json({ error: 'Section hors de votre périmètre' });
  }

  // Tous les étudiants actifs, avec leurs inscriptions toutes années confondues.
  // La section affichée vient des UE de leurs inscriptions (dernière année connue).
  let sql = `
    SELECT e.id, e.nom, e.prenom, e.email_ecole, e.id_ecampus,
           GROUP_CONCAT(DISTINCT u.section) AS sections,
           COUNT(DISTINCT i.ue_num) AS nb_ue,
           MAX(i.annee_scolaire) AS derniere_annee
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE e.actif = 1
  `;
  const params = [];

  if (section) { sql += ` AND u.section = ?`; params.push(section); }
  else if (autorisees) {
    // Hors filtre explicite, la liste se borne au périmètre de la personne.
    sql += ` AND u.section IN (${autorisees.map(() => '?').join(',') || "''"})`;
    params.push(...autorisees);
  }
  if (q) {
    sql += ` AND (e.nom LIKE ? OR e.prenom LIKE ? OR e.id_ecampus LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ` GROUP BY e.id ORDER BY e.nom, e.prenom`;

  const anneeActive = anneeDeTravail(req);
  const rows = db.prepare(sql).all(...params);

  // Les PAE confirmés de l'année : une seule requête plutôt qu'une par ligne.
  const confirmes = new Set(db.prepare(
    'SELECT etudiant_id FROM etudiant_pae WHERE annee_scolaire = ? AND confirme_le IS NOT NULL'
  ).all(anneeActive).map(x => x.etudiant_id));

  res.json(rows.map(r0 => {
    const n = niveauEtudiant(r0.id, anneeActive);
    const rat = sectionRattachement(r0.id, anneeActive);
    return {
      ...r0, niveau: n.niveau, niveau_libelle: n.libelle,
      // Tant que le programme n'est pas confirmé, il n'est qu'une proposition.
      pae_confirme: confirmes.has(r0.id),
      section_rattachement: rat.section,
      section_deduite: rat.deduite,
    };
  }));
});

// ── Rapport croisé : étudiants × UE d'une section, pour une année ────────────
r.get('/rapport', authRequired, (req, res) => {
  const { section, annee } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requises' });

  const anneeActive = anneeDeTravail(req);

  // UE de la section (référentiel de l'année demandée, sinon année active), BA1→BA3
  let ues = db.prepare(`
    SELECT DISTINCT ue_num, ue_nom, ue_niv FROM ue
    WHERE annee_scolaire = ? AND section = ?
    ORDER BY CASE UPPER(COALESCE(ue_niv,'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END, ue_num
  `).all(annee, section);
  if (!ues.length) ues = db.prepare(`
    SELECT DISTINCT ue_num, ue_nom, ue_niv FROM ue
    WHERE annee_scolaire = ? AND section = ?
    ORDER BY CASE UPPER(COALESCE(ue_niv,'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END, ue_num
  `).all(anneeActive, section);
  const ueNums = new Set(ues.map(u => u.ue_num));

  // Étudiants avec inscriptions ou VA cette année dans ces UE
  const inscriptions = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, i.resultat, i.points, e.nom, e.prenom, e.id_ecampus
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ?
  `).all(annee).filter(i => ueNums.has(i.ue_num));
  const vas = db.prepare(`
    SELECT v.etudiant_id, v.ue_num, v.pourcentage, e.nom, e.prenom, e.id_ecampus
    FROM etudiant_valorisation v
    JOIN etudiant e ON e.id = v.etudiant_id
    WHERE v.annee_scolaire = ? AND v.type = 'complete'
  `).all(annee).filter(v => ueNums.has(v.ue_num));

  // Regrouper par étudiant
  const etudiants = new Map();
  const cle = r0 => r0.etudiant_id;
  for (const i of inscriptions) {
    if (!etudiants.has(cle(i))) etudiants.set(cle(i), { nom: i.nom, prenom: i.prenom, id_ecampus: i.id_ecampus, cells: {} });
    // « R » désignait aussi bien l'ajournement que le refus, deux décisions que
    // la circulaire distingue. L'ajournement prend « Aj ».
    const marque = i.resultat === 'reussi' ? 'C'
      : i.resultat === 'ajourne' ? 'Aj'
      : i.resultat === 'refuse' ? 'R'
      : i.resultat === 'absent' ? 'A' : '•';
    etudiants.get(cle(i)).cells[i.ue_num] = { m: marque, pts: i.points };
  }
  for (const v of vas) {
    if (!etudiants.has(cle(v))) etudiants.set(cle(v), { nom: v.nom, prenom: v.prenom, id_ecampus: v.id_ecampus, cells: {} });
    etudiants.get(cle(v)).cells[v.ue_num] = { m: 'VA', pts: v.pourcentage };
  }
  const lignes = [...etudiants.values()].sort((a, b) =>
    (a.nom || '').localeCompare(b.nom || '') || (a.prenom || '').localeCompare(b.prenom || ''));

  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const cellHtml = c0 => {
    if (!c0) return '<td></td>';
    const cls = c0.m === 'C' ? 'c' : c0.m === 'R' ? 'r' : c0.m === 'A' ? 'a' : c0.m === 'VA' ? 'va' : 'i';
    const titre = c0.pts != null ? ' title="' + c0.pts + ' %"' : '';
    return '<td class="' + cls + '"' + titre + '>' + c0.m + '</td>';
  };

  const enTetes = ues.map(u =>
    '<th class="ue" title="' + esc(u.ue_nom || '') + '">' + u.ue_num + '<span class="niv">' + esc(u.ue_niv || '') + '</span></th>').join('');
  const corps = lignes.map((l, i) => '<tr>' +
    '<td class="num">' + (i + 1) + '</td>' +
    '<td class="nom">' + esc(l.nom) + ' ' + esc(l.prenom) + '<span class="mat">' + esc(l.id_ecampus || '') + '</span></td>' +
    ues.map(u => cellHtml(l.cells[u.ue_num])).join('') + '</tr>').join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Parcours ${esc(section)} — ${esc(annee)}</title>
<style>
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1B2B4B; margin: 24px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .meta { color: #64748b; margin-bottom: 12px; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: center; }
  th { background: #f1f5f9; font-size: 10px; }
  th.ue .niv { display: block; font-weight: normal; color: #94a3b8; font-size: 8.5px; }
  td.num { color: #94a3b8; width: 24px; }
  td.nom { text-align: left; white-space: nowrap; font-weight: 500; }
  td.nom .mat { display: block; color: #94a3b8; font-weight: normal; font-size: 9px; }
  td.c  { background: #d1fae5; color: #065f46; font-weight: 700; }
  td.r  { background: #fee2e2; color: #991b1b; font-weight: 700; }
  td.a  { background: #fef3c7; color: #92400e; font-weight: 700; }
  td.va { background: #ede9fe; color: #5b21b6; font-weight: 700; }
  td.i  { color: #64748b; }
  .legende { margin-top: 10px; font-size: 10px; color: #64748b; }
  @media print { body { margin: 0; } }

  /* PAYSAGE : une colonne par UE, la matrice ne tient pas en portrait.
     L'orientation se déclare ICI et nulle part ailleurs — un second @page
     déclaré plus bas l'emporterait, ce qui est précisément ce qui ramenait ce
     rapport en portrait. */
  ${reglesDePage({ haut: 12, cote: 10, orientation })}

  /* Pied de page commun, ancré en bas de CHAQUE page — dernière comprise.
     Un pied placé dans le flux, ou en table-footer-group, flotte au milieu
     d'une dernière page à moitié vide. */
  ${piedStyles()}
</style></head><body>
<h1>Parcours des étudiants — ${esc(section)}</h1>
<div class="meta">Année académique ${esc(annee)} · ${lignes.length} étudiant(s) · ${ues.length} UE · imprimé le ${new Date().toLocaleDateString('fr-BE')}</div>
<table>
  <thead><tr><th></th><th style="text-align:left">Étudiant</th>${enTetes}</tr></thead>
  <tbody>${corps || '<tr><td colspan="' + (ues.length + 2) + '" style="color:#94a3b8">Aucune donnée pour ces critères</td></tr>'}</tbody>
</table>
<div class="legende"><b>C</b> réussite · <b>R</b> refusé · <b>A</b> absent · <b>VA</b> valorisation des acquis · <b>•</b> inscrit (non délibéré) · survolez une case pour les points</div>

${piedBalisage(LOGO_IIP_JPEG)}
</body></html>`;

  res.json({ html, nom: 'parcours_' + section + '_' + annee + '.html' });
});

// ── Codes d'UE externes : correspondance avec les numéros de Lucie ─────────
// eCampus désigne les UE par un code court (TINFO, PDPS, 901). La liste ne
// porte pas le ue_num : on rapproche donc les intitulés, une fois pour toutes.
const sansAccent = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[’']/g, "'")
  .replace(/^[a-zàéèêç\s]+\s*:\s*/i, '')     // « Psychomotricité : … »
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function ressemblance(a, b) {
  const A = sansAccent(a), B = sansAccent(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.startsWith(B) || B.startsWith(A)) return 0.92;
  const motsA = new Set(A.split(' ').filter(m => m.length > 3));
  const motsB = new Set(B.split(' ').filter(m => m.length > 3));
  if (!motsA.size || !motsB.size) return 0;
  let communs = 0;
  for (const m of motsA) if (motsB.has(m)) communs++;
  return communs / Math.max(motsA.size, motsB.size);
}

r.post('/codes-externes/resoudre', authRequired, (req, res) => {
  const { codes, section } = req.body;
  if (!Array.isArray(codes)) return res.status(400).json({ error: 'codes requis' });

  const anneeRef = anneeDeTravail(req);
  const ues = db.prepare(`
    SELECT DISTINCT ue_num, MIN(ue_nom) AS ue_nom, MIN(section) AS section FROM ue
    ${section ? 'WHERE section = ?' : ''}
    GROUP BY ue_num ORDER BY ue_num
  `).all(...(section ? [section] : []));

  const memorises = {};
  for (const m of db.prepare('SELECT code, ue_num FROM ue_code_externe').all()) {
    memorises[m.code] = m.ue_num;
  }

  const resultats = codes.map(({ code, libelle }) => {
    const cd = String(code || '').trim();
    if (memorises[cd] != null) {
      const u = ues.find(x => x.ue_num === memorises[cd]);
      return { code: cd, libelle, ue_num: memorises[cd], ue_nom: u?.ue_nom || null,
               origine: 'memorise', score: 1 };
    }
    let meilleur = null, score = 0;
    for (const u of ues) {
      const s = ressemblance(libelle, u.ue_nom);
      if (s > score) { score = s; meilleur = u; }
    }
    return score >= 0.6
      ? { code: cd, libelle, ue_num: meilleur.ue_num, ue_nom: meilleur.ue_nom,
          origine: 'suggere', score: Math.round(score * 100) / 100 }
      : { code: cd, libelle, ue_num: null, ue_nom: null, origine: null, score: 0 };
  });

  res.json({ resultats, ues });
});

r.put('/codes-externes', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { correspondances } = req.body;
  if (!Array.isArray(correspondances)) return res.status(400).json({ error: 'correspondances requises' });
  const up = db.prepare(`
    INSERT INTO ue_code_externe (code, ue_num, libelle, maj_le)
    VALUES (?,?,?, datetime('now'))
    ON CONFLICT(code) DO UPDATE SET ue_num = excluded.ue_num, maj_le = datetime('now')
  `);
  let n = 0;
  db.transaction(() => {
    for (const m of correspondances) {
      if (!m.code || m.ue_num == null) continue;
      up.run(String(m.code).trim(), Number(m.ue_num), m.libelle || null); n++;
    }
  })();
  res.json({ ok: true, enregistrees: n });
});

// ── Import d'une liste eCampus : signalétique, inscriptions et groupes ─────
r.post('/import-liste', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, etudiants, inscriptions } = req.body;
  if (!annee || !Array.isArray(etudiants)) {
    return res.status(400).json({ error: 'annee et etudiants requis' });
  }

  const upEtud = db.prepare(`
    INSERT INTO etudiant (id_ecampus, nom, prenom, email_ecole, email_perso,
      date_naissance, num_national, gsm, adresse, localite, cp, titre,
      lieu_naissance)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id_ecampus) DO UPDATE SET
      nom = excluded.nom, prenom = excluded.prenom,
      email_ecole   = COALESCE(excluded.email_ecole,   etudiant.email_ecole),
      email_perso   = COALESCE(excluded.email_perso,   etudiant.email_perso),
      date_naissance= COALESCE(excluded.date_naissance,etudiant.date_naissance),
      num_national  = COALESCE(excluded.num_national,  etudiant.num_national),
      gsm           = COALESCE(excluded.gsm,           etudiant.gsm),
      adresse       = COALESCE(excluded.adresse,       etudiant.adresse),
      localite      = COALESCE(excluded.localite,      etudiant.localite),
      cp            = COALESCE(excluded.cp,            etudiant.cp),
      titre         = COALESCE(excluded.titre,         etudiant.titre),
      -- Les classeurs eCampus portent LieuNais, mais l'import ne le reprenait
      -- pas : la donnée existait dans vos fichiers et n'entrait jamais en base,
      -- d'où le lieu de naissance vide sur les attestations.
      lieu_naissance= COALESCE(excluded.lieu_naissance, etudiant.lieu_naissance)
  `);
  const trouver = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ?');
  const upInsc = db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, groupe, date_inscription)
    VALUES (?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      groupe = COALESCE(excluded.groupe, etudiant_inscription.groupe)
  `);

  const dateJour = new Date().toISOString().slice(0, 10);
  let nEtud = 0, nInsc = 0, sansCode = 0;

  db.transaction(() => {
    for (const e of etudiants) {
      upEtud.run(String(e.id_ecampus || '').trim(), e.nom || '', e.prenom || '',
        e.email_ecole || null, e.email_perso || null, e.date_naissance || null,
        e.num_national || null, e.gsm || null, e.adresse || null,
        e.localite || null, e.cp || null, e.titre || null,
        e.lieu_naissance || null);
      nEtud++;
    }
    for (const i of (inscriptions || [])) {
      if (i.ue_num == null) { sansCode++; continue; }
      const e = trouver.get(String(i.id_ecampus || '').trim());
      if (!e) { sansCode++; continue; }
      upInsc.run(e.id, annee, Number(i.ue_num), i.groupe || null, dateJour);
      nInsc++;
    }
  })();

  res.json({ ok: true, annee, etudiants: nEtud, inscriptions: nInsc, ignorees: sansCode });
});

// ── Rapport de PAE : données pour l'aperçu et pour l'export Excel ──────────
// Un seul jeu de données sert les deux sorties, pour qu'elles ne divergent pas.
r.get('/rapport-pae', authRequired, (req, res) => {
  // Paysage par défaut : une colonne par UE, la matrice ne tient pas en
  // portrait. Le portrait reste possible pour une section à peu d'unités.
  const orientation = req.query.orientation === 'portrait' ? 'portrait' : 'paysage';
  const { section, annee, niveau, ue_num, granularite = 'ue' } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requises' });

  const anneeRef = anneeDeTravail(req) || annee;
  const niveaux = niveauxEffectifs([section], annee);

  let ues = db.prepare(`
    SELECT DISTINCT ue_num, MIN(ue_nom) AS ue_nom, MAX(COALESCE(ects,0)) AS ects,
           MAX(COALESCE(is_epreuve_integree,0)) AS is_epreuve_integree
    FROM ue
    WHERE section = ? AND annee_scolaire IN (?, ?)
    GROUP BY ue_num
  `).all(section, annee, anneeRef);

  if (ue_num) ues = ues.filter(u => u.ue_num === Number(ue_num));
  else if (niveau) ues = ues.filter(u => (niveaux[u.ue_num] || '') === String(niveau).toUpperCase());
  if (!ues.length) return res.json({ ues: [], colonnes: [], etudiants: [] });

  const rang = v => { const m = /^BA(\d+)$/.exec((v || '').toUpperCase()); return m ? Number(m[1]) : 9; };
  ues.sort((a, b) => rang(niveaux[a.ue_num]) - rang(niveaux[b.ue_num]) || a.ue_num - b.ue_num);
  for (const u of ues) u.ue_niv = niveaux[u.ue_num] || null;
  const listeUe = ues.map(u => u.ue_num).join(',');

  // Colonnes : les UE, ou les cours qui les composent
  let colonnes;
  if (granularite === 'cours') {
    const cours = db.prepare(`
      SELECT DISTINCT cours_code, MIN(cours_nom) AS cours_nom, ue_num FROM cours
      WHERE ue_num IN (${listeUe}) AND cours_code IS NOT NULL
      GROUP BY cours_code
    `).all();
    colonnes = ues.flatMap(u => {
      const siens = cours.filter(c0 => c0.ue_num === u.ue_num)
        .sort((a, b) => String(a.cours_code).localeCompare(String(b.cours_code), 'fr', { numeric: true }));
      // Une UE sans cours au référentiel garde une colonne à son numéro
      return siens.length
        ? siens.map(c0 => ({ code: String(c0.cours_code), libelle: c0.cours_nom || '', ue_num: u.ue_num, ue_niv: u.ue_niv }))
        : [{ code: String(u.ue_num), libelle: u.ue_nom || '', ue_num: u.ue_num, ue_niv: u.ue_niv }];
    });
  } else {
    colonnes = ues.map(u => ({
      code: String(u.ue_num), libelle: u.ue_nom || '', ue_num: u.ue_num, ue_niv: u.ue_niv,
    }));
  }

  const etudiants = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus, e.email_ecole
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    WHERE e.actif = 1 AND i.ue_num IN (${listeUe})
    ORDER BY e.nom, e.prenom
  `).all();
  if (!etudiants.length) return res.json({ ues, colonnes, etudiants: [] });

  const ids = etudiants.map(e => e.id).join(',');

  // Toutes les inscriptions, pour connaître l'année de validation
  const insc = db.prepare(`
    SELECT etudiant_id, ue_num, annee_scolaire, resultat, points FROM etudiant_inscription
    WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe})
  `).all();
  const vas = db.prepare(`
    SELECT etudiant_id, ue_num, annee_scolaire FROM etudiant_valorisation
    WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe}) AND type = 'complete'
  `).all();
  let resCours = [];
  try {
    resCours = db.prepare(`
      SELECT etudiant_id, cours_code, annee_scolaire, statut, faveur, note
      FROM etudiant_resultat_cours WHERE etudiant_id IN (${ids})
    `).all();
  } catch { /* table absente */ }

  const parEtud = {};
  for (const e of etudiants) parEtud[e.id] = { ue: {}, cours: {}, courant: {}, points_courant: {} };

  for (const i of insc) {
    const p = parEtud[i.etudiant_id]; if (!p) continue;
    if (i.annee_scolaire === annee) {
      p.courant[i.ue_num] = i.resultat || 'inscrit';
      // La cote reste en base, mais elle ne se COMMUNIQUE pas lorsque le seuil
      // de réussite n'est pas atteint : les documents portent « NA ». La
      // transmettre ici reviendrait à la faire figurer sur un rapport remis à
      // l'étudiant.
      if (i.points != null) {
        (p.points_courant = p.points_courant || {})[i.ue_num] =
          ['reussi', 'va'].includes(i.resultat) ? i.points : 'NA';
      }
    }
    if (i.resultat === 'reussi') {
      const prec = p.ue[i.ue_num];
      if (!prec || i.annee_scolaire < prec.annee) {
        p.ue[i.ue_num] = { annee: i.annee_scolaire, mode: 'reussi', points: i.points };
      }
    }
  }
  for (const v of vas) {
    const p = parEtud[v.etudiant_id]; if (!p) continue;
    if (!p.ue[v.ue_num]) p.ue[v.ue_num] = { annee: v.annee_scolaire, mode: 'va' };
  }
  for (const rc of resCours) {
    const p = parEtud[rc.etudiant_id]; if (!p) continue;
    const prec = p.cours[rc.cours_code];
    if (!prec || rc.annee_scolaire > prec.annee) {
      p.cours[rc.cours_code] = { annee: rc.annee_scolaire, statut: rc.statut,
                                 faveur: rc.faveur, note: rc.note };
    }
  }

  const ectsDe = Object.fromEntries(ues.map(u => [u.ue_num, Number(u.ects || 0)]));
  const epreuves = ues.filter(u => u.is_epreuve_integree).map(u => u.ue_num);

  const lignes = etudiants.map(e => {
    const p = parEtud[e.id];
    const acquises = Object.keys(p.ue).map(Number);
    const ects = acquises.reduce((s, n) => s + (ectsDe[n] || 0), 0);
    // Diplômable : tout est acquis sauf l'épreuve intégrée
    const restantes = ues.filter(u => !p.ue[u.ue_num]).map(u => u.ue_num);
    const diplomable = epreuves.length > 0
      && restantes.length > 0
      && restantes.every(n => epreuves.includes(n));
    const echecs = Object.values(p.courant)
      .filter(r0 => r0 === 'ajourne' || r0 === 'refuse').length;
    return {
      ...e, niveau: niveauEtudiant(e.id, annee).libelle || null, ...p,
      acquises: acquises.length, total_ue: ues.length,
      ects, ects_total: ues.reduce((s, u) => s + Number(u.ects || 0), 0),
      diplomable, echecs,
    };
  });

  // Taux de réussite par colonne — désigne les UE qui font barrage
  const taux = {};
  for (const col of colonnes) {
    let acquis = 0, concernes = 0;
    for (const e of lignes) {
      const a = e.ue[col.ue_num];
      const c0 = e.courant[col.ue_num];
      if (!a && !c0) continue;
      concernes++;
      if (a) acquis++;
    }
    taux[col.code] = concernes ? Math.round((acquis / concernes) * 100) : null;
  }

  res.json({
    section, annee, granularite, ues, colonnes, taux,
    etudiants: lignes,
  });
});

// ── Synthèse par année : étudiants × années scolaires ──────────────────────
// Vue de cohorte. Chaque case résume une année — UE tentées, réussies,
// refusées — plutôt que d'en détailler les UE : le détail est à un clic, dans
// la vue de délibération. C'est ce qui la garde lisible sur cinq ou six
// colonnes là où une matrice complète en compterait cinquante.
r.get('/synthese', authRequired, (req, res) => {
  const { section } = req.query;
  if (!section) return res.status(400).json({ error: 'section requise' });

  const anneeRef = anneeDeTravail(req);
  const ues = db.prepare(`
    SELECT DISTINCT ue_num FROM ue WHERE section = ?
  `).all(section).map(u => u.ue_num);
  if (!ues.length) return res.json({ annees: [], etudiants: [] });
  const listeUe = ues.join(',');

  const etudiants = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    WHERE e.actif = 1 AND i.ue_num IN (${listeUe})
    ORDER BY e.nom, e.prenom
  `).all();
  if (!etudiants.length) return res.json({ annees: [], etudiants: [] });

  const ids = etudiants.map(e => e.id).join(',');
  const lignes = db.prepare(`
    SELECT etudiant_id, annee_scolaire, resultat, points
    FROM etudiant_inscription
    WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe})
  `).all();
  let vas = [];
  try {
    vas = db.prepare(`
      SELECT etudiant_id, annee_scolaire FROM etudiant_valorisation
      WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe}) AND type = 'complete'
    `).all();
  } catch { /* table absente */ }

  const annees = [...new Set([...lignes.map(l => l.annee_scolaire), anneeRef].filter(Boolean))].sort();

  const par = {};
  for (const e of etudiants) par[e.id] = {};
  const case0 = () => ({ tentees: 0, reussies: 0, refusees: 0, absentes: 0, en_cours: 0, va: 0, somme: 0, notees: 0 });

  for (const l of lignes) {
    const p = par[l.etudiant_id]; if (!p) continue;
    const k = (p[l.annee_scolaire] = p[l.annee_scolaire] || case0());
    k.tentees++;
    if (l.resultat === 'reussi') k.reussies++;
    else if (l.resultat === 'ajourne') k.refusees++;
    else if (l.resultat === 'absent') k.absentes++;
    else k.en_cours++;
    if (l.points != null) { k.somme += Number(l.points); k.notees++; }
  }
  for (const v of vas) {
    const p = par[v.etudiant_id]; if (!p) continue;
    const k = (p[v.annee_scolaire] = p[v.annee_scolaire] || case0());
    k.va++; k.tentees++; k.reussies++;
  }

  res.json({
    section, annee_active: anneeRef, annees,
    etudiants: etudiants.map(e => {
      const cases = par[e.id];
      for (const k of Object.values(cases)) {
        k.moyenne = k.notees ? Math.round((k.somme / k.notees) * 10) / 10 : null;
        delete k.somme; delete k.notees;
      }
      const total = Object.values(cases).reduce((s, k) => s + k.tentees, 0);
      const acquis = Object.values(cases).reduce((s, k) => s + k.reussies, 0);
      return { ...e, cases, total, acquis };
    }),
  });
});

// ── Rapport de PAE au format Excel ─────────────────────────────────────────
// Construit côté serveur avec ExcelJS, seul à savoir mettre en forme les
// cellules. La disposition reste celle du classeur de la coordination —
// intitulés en ligne 1, codes en ligne 2 — pour rester réimportable.
// ── Export complet d'une section, réimportable ─────────────────────────────
// Deux feuilles. « Étudiants » porte le signalétique ; « Résultats » porte une
// LIGNE PAR RÉSULTAT — étudiant, année, unité, session, décision, note.
//
// Le format est pensé pour le RETOUR : les colonnes portent les noms que
// l'importateur sur mesure reconnaît, et le numéro national sert de clé.
r.get('/export-section', authRequired, async (req, res) => {
  const { section, annee } = req.query;
  if (!section) return res.status(400).json({ error: 'section requise' });

  const perim = getUserSections(req.user);
  if (perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'section hors de votre périmètre' });
  }

  const ues = db.prepare(
    'SELECT DISTINCT ue_num FROM ue WHERE section = ?').all(section).map(u => u.ue_num);
  if (!ues.length) return res.status(404).json({ error: 'aucune unité pour cette section' });
  const ph = ues.map(() => '?').join(',');

  const clauseAnnee = annee ? ' AND i.annee_scolaire = ?' : '';
  const params = [...ues, ...(annee ? [annee] : [])];

  const lignes = db.prepare(`
    SELECT e.id, e.id_ecampus, e.num_national, e.nom, e.prenom, e.titre,
           e.date_naissance, e.lieu_naissance, e.nationalite,
           e.adresse, e.cp, e.localite, e.gsm, e.email_ecole, e.email_perso,
           i.annee_scolaire, i.ue_num, i.resultat, i.resultat_s1, i.resultat_s2,
           i.points, i.mention, i.groupe,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_nom IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.ue_num IN (${ph})${clauseAnnee}
    ORDER BY e.nom, e.prenom, i.annee_scolaire DESC, i.ue_num
  `).all(...params);

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lucie — Institut Ilya Prigogine';
  wb.created = new Date();

  // ── Feuille 1 : les étudiants, une ligne chacun ──────────────────────────
  const fe = wb.addWorksheet('Étudiants');
  fe.columns = [
    { header: 'num_national', key: 'num_national', width: 18 },
    { header: 'id_ecampus', key: 'id_ecampus', width: 12 },
    { header: 'nom', key: 'nom', width: 22 },
    { header: 'prenom', key: 'prenom', width: 18 },
    { header: 'titre', key: 'titre', width: 10 },
    { header: 'date_naissance', key: 'date_naissance', width: 14 },
    { header: 'lieu_naissance', key: 'lieu_naissance', width: 18 },
    { header: 'nationalite', key: 'nationalite', width: 14 },
    { header: 'adresse', key: 'adresse', width: 30 },
    { header: 'cp', key: 'cp', width: 8 },
    { header: 'localite', key: 'localite', width: 18 },
    { header: 'gsm', key: 'gsm', width: 15 },
    { header: 'email_ecole', key: 'email_ecole', width: 30 },
    { header: 'email_perso', key: 'email_perso', width: 30 },
  ];
  const vus = new Set();
  for (const l of lignes) {
    if (vus.has(l.id)) continue;
    vus.add(l.id);
    fe.addRow(l);
  }

  // ── Feuille 2 : un résultat par ligne ────────────────────────────────────
  const fr = wb.addWorksheet('Résultats');
  fr.columns = [
    { header: 'num_national', key: 'num_national', width: 18 },
    { header: 'nom', key: 'nom', width: 22 },
    { header: 'prenom', key: 'prenom', width: 18 },
    { header: 'annee_scolaire', key: 'annee_scolaire', width: 14 },
    { header: 'ue_num', key: 'ue_num', width: 9 },
    { header: 'ue_nom', key: 'ue_nom', width: 40 },
    { header: 'session', key: 'session', width: 10 },
    { header: 'decision', key: 'decision', width: 11 },
    { header: 'points', key: 'points', width: 8 },
    { header: 'resultat_s1', key: 'resultat_s1', width: 12 },
    { header: 'resultat_s2', key: 'resultat_s2', width: 12 },
    { header: 'mention', key: 'mention', width: 14 },
    { header: 'groupe', key: 'groupe', width: 8 },
  ];

  // La lettre de délibération : C capitalisé, Aj ajourné, R refusé, A absent.
  const lettre = r0 => r0 === 'reussi' ? 'C' : r0 === 'ajourne' ? 'Aj'
    : r0 === 'refuse' ? 'R' : r0 === 'absent' ? 'A' : '';

  for (const l of lignes) {
    // La session d'où vient la décision. Ni l'une ni l'autre : « finale » —
    // c'est le cas de tout ce qui précède la distinction des sessions.
    const session = l.resultat_s2 ? 'S2' : l.resultat_s1 ? 'S1' : 'finale';
    fr.addRow({
      ...l,
      session,
      decision: lettre(l.resultat),
      resultat_s1: lettre(l.resultat_s1),
      resultat_s2: lettre(l.resultat_s2),
    });
  }

  for (const f0 of [fe, fr]) {
    f0.getRow(1).font = { bold: true };
    f0.getRow(1).fill = { type: 'pattern', pattern: 'solid',
                          fgColor: { argb: 'FF1B2B4B' } };
    f0.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    f0.views = [{ state: 'frozen', ySplit: 1 }];
    f0.autoFilter = { from: { row: 1, column: 1 },
                      to: { row: 1, column: f0.columns.length } };
  }

  // ── Feuille 3 : ce que les colonnes veulent dire ─────────────────────────
  const fl = wb.addWorksheet('Légende');
  fl.columns = [{ header: 'Colonne', key: 'c', width: 18 },
                { header: 'Signification', key: 's', width: 80 }];
  for (const [k, v] of [
    ['num_national', "Clé de rapprochement à la réimportation. Le matricule change chaque rentrée, pas lui."],
    ['session', "S1, S2, ou « finale » lorsque la décision ne distingue pas les sessions."],
    ['decision', "C capitalisé · Aj ajourné · R refusé · A absent. C'est la décision qui fait foi."],
    ['resultat_s1', "Résultat de la première session, s'il a été encodé."],
    ['resultat_s2', "Résultat de la seconde session. Il prime sur la première."],
    ['points', 'Note sur 20.'],
  ]) fl.addRow({ c: k, s: v });
  fl.getRow(1).font = { bold: true };

  const nom = `Export_${String(section).replace(/[^A-Za-z0-9]+/g, '_')}`
    + (annee ? `_${annee}` : '') + '.xlsx';
  res.setHeader('Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  await wb.xlsx.write(res);
  res.end();
});

r.post('/rapport-pae/excel', authRequired, async (req, res) => {
  const { section, annee, colonnes, etudiants, taux, options = {} } = req.body;
  if (!section || !annee || !Array.isArray(colonnes) || !Array.isArray(etudiants)) {
    return res.status(400).json({ error: 'données du rapport requises' });
  }

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lucie — Institut Ilya Prigogine';
  wb.created = new Date();

  const MARINE = 'FF1B2B4B', TURQ = 'FF00AACC';
  const NIV = { BA1: 'FFF97316', BA2: 'FF60A5FA', BA3: 'FF1E3A8A' };
  const teinte = {
    ok:   { fill: 'FFD1FAE5', police: 'FF065F46' },
    ko:   { fill: 'FFFEE2E2', police: 'FF991B1B' },
    va:   { fill: 'FFEDE9FE', police: 'FF5B21B6' },
    ins:  { fill: 'FFE0F2FE', police: 'FF075985' },
    abs:  { fill: 'FFF1F5F9', police: 'FF64748B' },
  };
  const classe = v => {
    if (!v) return null;
    const b = String(v).replace('*', '');
    // Une note se juge au seuil de 10/20 — sans quoi un 7 s'afficherait en vert.
    if (/^\d+([.,]\d+)?$/.test(b)) return Number(b.replace(',', '.')) >= 10 ? 'ok' : 'ko';
    if (/^\d\d-\d\d$/.test(b) || b === 'C' || b === '✓') return 'ok';
    if (b.startsWith('VA')) return 'va';
    if (b === 'R') return 'ko';
    if (b === 'A') return 'abs';
    if (b === 'NA') return 'ko';   // cote non communiquée : seuil non atteint
    if (b === 'x') return 'ins';
    return null;
  };

  const ws = wb.addWorksheet('TOUS', {
    views: [{ state: 'frozen', xSplit: 5, ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const tetesFixes = ['Id_Etud', 'Email Perso', 'EmailEcole', 'NomEtud', 'PréEtud',
                      '', 'inscription', 'Classe', 'Niveau'];
  const synth = options.synthese ? ['Acquis', 'ECTS', 'Situation'] : [];

  // Ligne 1 — intitulés ; ligne 2 — codes, dans la forme attendue à la relecture
  ws.addRow([...tetesFixes.map(() => ''), ...colonnes.map(c0 => c0.libelle || ''), ...synth.map(() => '')]);
  ws.addRow([...tetesFixes, ...colonnes.map(c0 => c0.code),
             ...synth, "Commentaire(s) du Conseil des Etudes"]);

  const l1 = ws.getRow(1), l2 = ws.getRow(2);
  l1.height = 46; l2.height = 20;
  l1.eachCell({ includeEmpty: true }, (cell, i) => {
    if (i <= tetesFixes.length) return;
    cell.alignment = { vertical: 'bottom', horizontal: 'left', wrapText: true, textRotation: 60 };
    cell.font = { size: 7.5, color: { argb: 'FF64748B' } };
  });
  l2.eachCell({ includeEmpty: true }, (cell, i) => {
    const col = colonnes[i - tetesFixes.length - 1];
    const couleur = col ? (NIV[(col.ue_niv || '').toUpperCase()] || 'FF94A3B8') : MARINE;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: couleur } };
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: MARINE } } };
  });

  // Étudiants
  for (const e of etudiants) {
    const cells = colonnes.map(c0 => e.valeurs[c0.code] ?? '');
    const s = options.synthese
      ? [`${e.acquises}/${e.total_ue}`, e.ects_total ? `${e.ects}/${e.ects_total}` : e.ects,
         e.diplomable ? 'diplômable' : (e.echecs ? `${e.echecs} échec(s)` : '')]
      : [];
    const r0 = ws.addRow([
      e.id_ecampus || '', '', e.email_ecole || '', e.nom || '', e.prenom || '',
      '', '', '', e.niveau || '', ...cells, ...s, '',
    ]);
    r0.height = 17;
    r0.eachCell({ includeEmpty: true }, (cell, i) => {
      cell.border = { top: { style: 'hair', color: { argb: 'FFE2E8F0' } },
                      bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
      if (i <= 5) { cell.font = { size: 9.5 }; return; }
      cell.alignment = { horizontal: 'center' };
      cell.font = { size: 9 };
      const idx = i - tetesFixes.length - 1;
      if (idx >= 0 && idx < colonnes.length) {
        const t = teinte[classe(cell.value)];
        if (t) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: t.fill } };
          cell.font = { size: 9, bold: true, color: { argb: t.police } };
        }
        if (String(cell.value || '').includes('*')) cell.font = { ...cell.font, italic: true };
      } else if (idx >= colonnes.length) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  }

  // Taux de réussite par UE
  if (options.tauxUE && taux) {
    const r0 = ws.addRow(['', '', '', 'Taux de réussite', '', '', '', '', '',
      ...colonnes.map(c0 => (taux[c0.code] == null ? '' : taux[c0.code] / 100)), ...synth.map(() => '')]);
    r0.height = 19;
    r0.eachCell({ includeEmpty: true }, (cell, i) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.font = { bold: true, size: 9, color: { argb: 'FF475569' } };
      cell.border = { top: { style: 'medium', color: { argb: MARINE } } };
      const idx = i - tetesFixes.length - 1;
      if (idx >= 0 && idx < colonnes.length && typeof cell.value === 'number') {
        cell.numFmt = '0 %';
        cell.alignment = { horizontal: 'center' };
        cell.font = { bold: true, size: 9,
          color: { argb: cell.value >= 0.75 ? 'FF047857' : cell.value >= 0.5 ? 'FF92400E' : 'FFB91C1C' } };
      }
    });
  }

  // Largeurs posées colonne par colonne : affecter ws.columns après avoir
  // ajouté des lignes désaligne le tableau dans ExcelJS.
  const largeurs = [11, 20, 28, 20, 15, 5, 10, 8, 11,
    ...colonnes.map(() => 7), ...synth.map(() => 12), 46];
  largeurs.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: ws.rowCount, column: tetesFixes.length + colonnes.length + synth.length },
  };

  // Second onglet : ce que le tableau montre, et la légende
  const info = wb.addWorksheet('Informations');
  info.getColumn(1).width = 26;
  info.getColumn(2).width = 74;
  const lignes = [
    ['Section', section],
    ['Année', annee],
    ['Contenu des cases', options.libelleContenu || ''],
    ['Colonnes', options.granularite === 'cours' ? 'Une par cours' : 'Une par UE'],
    ['Étudiants retenus', options.libelleFiltre || 'Tous'],
    ['Édité le', new Date().toLocaleString('fr-BE')],
    ['', ''],
    ['Légende', 'C ou une année : acquise · VA : valorisation · R : refusé · A : absent · x : inscrit, non délibéré'],
    ['', 'Une valeur en italique suivie d\u2019un astérisque est reprise de l\u2019unité d\u2019enseignement, faute de résultat encodé par cours.'],
    ['', 'Les couleurs d\u2019en-tête suivent l\u2019année d\u2019études : BA1 orange, BA2 bleu clair, BA3 bleu marine.'],
    ['', ''],
    ['Réimport', 'Ce classeur garde la forme attendue par « Importer le classeur PAE » : il peut être complété à la main puis relu par Lucie.'],
  ];
  for (const [a, b] of lignes) {
    const r0 = info.addRow([a, b]);
    r0.getCell(1).font = { bold: true, size: 10, color: { argb: MARINE } };
    r0.getCell(2).font = { size: 10 };
    r0.getCell(2).alignment = { wrapText: true, vertical: 'top' };
  }
  info.getRow(1).getCell(1).font = { bold: true, size: 12, color: { argb: MARINE } };

  const buffer = await wb.xlsx.writeBuffer();
  const nom = `PAE_${section}_${annee}.xlsx`.replace(/[^\w.\-]/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.send(Buffer.from(buffer));
});

// ── Matrice d'encodage rapide : étudiants × UE, pour une année ──────────────
// L'année est portée par l'écran, pas par la cellule : on encode une année
// entière d'un coup. Les acquis des AUTRES années sont tout de même renvoyés,
// pour que l'on voie d'un coup d'œil ce qui est déjà fait et quand.
// ── Sessions et cohérence des décisions ────────────────────────────────────
// La circulaire distingue deux sessions. La règle, telle que l'IIP l'applique :
//
//   session 1 réussie ................. réussi
//   session 1 échouée, présenté ....... ajourné, l'étudiant va en session 2
//   session 1 non présenté ............ REFUS, définitif
//   session 2 réussie ................. réussi
//   session 2 échouée ou non présenté . REFUS
//
// resultat_s1 et resultat_s2 gardent le détail ; « resultat » reste la décision
// QUI FAIT FOI — celle de session 2 si elle existe, celle de session 1 sinon.
// Les documents la lisent sans rien changer.
(function migrerSessions() {
  try {
    const cols = db.prepare('PRAGMA table_info(etudiant_inscription)').all().map(c => c.name);
    if (!cols.includes('resultat_s1')) {
      db.exec('ALTER TABLE etudiant_inscription ADD COLUMN resultat_s1 TEXT');
      console.log('[migration] etudiant_inscription.resultat_s1 ajoutée');
    }
    if (!cols.includes('resultat_s2')) {
      db.exec('ALTER TABLE etudiant_inscription ADD COLUMN resultat_s2 TEXT');
    }
    // Les NOTES de chaque session, à côté de leur décision. « points » reste
    // la note qui fait foi, comme « resultat » reste la décision qui fait foi.
    if (!cols.includes('points_s1')) {
      db.exec('ALTER TABLE etudiant_inscription ADD COLUMN points_s1 REAL');
      console.log('[migration] points_s1 / points_s2 ajoutées');
    }
    if (!cols.includes('points_s2')) {
      db.exec('ALTER TABLE etudiant_inscription ADD COLUMN points_s2 REAL');
    }
  } catch (e) { console.error('[migration] sessions :', e.message); }
})();

/** La décision qui fait foi, déduite des deux sessions. */
export function decisionFinale(s1, s2) {
  if (s2 === 'reussi') return 'reussi';
  if (s2 === 'echec' || s2 === 'absent') return 'refuse';
  if (s1 === 'reussi') return 'reussi';
  if (s1 === 'absent') return 'refuse';      // non présenté en S1 : définitif
  if (s1 === 'echec') return 'ajourne';      // va en seconde session
  if (s1 === 'refuse') return 'refuse';
  return null;
}

// ── Contrôle de cohérence : notes en échec, décision absente ────────────────
// 61 notes sous 10 en Psychomotricité sans décision d'échec correspondante :
// les notes sont encodées, la délibération ne les suit pas. Lucie ne décide
// pas à la place du Conseil, mais elle doit le signaler.
// ── Rattachement et confirmation du PAE ────────────────────────────────────
// Trois axes, comme vous les décrivez : les DONNÉES de l'étudiant, son
// INSCRIPTION au programme, ses RÉSULTATS. Le rattachement à une section est le
// point de départ du deuxième : jusqu'ici la section se déduisait des
// inscriptions, ce qui inverse l'ordre naturel — on choisit d'abord la section,
// on inscrit ensuite.
(function migrerParcours() {
  try {
    const cols = db.prepare('PRAGMA table_info(etudiant)').all().map(c => c.name);
    if (!cols.includes('section_rattachement')) {
      db.exec('ALTER TABLE etudiant ADD COLUMN section_rattachement TEXT');
      console.log('[migration] etudiant.section_rattachement ajoutée');
    }
    // La confirmation porte sur un COUPLE étudiant × année : un même étudiant
    // confirme son programme chaque année, ce n'est pas un état permanent.
    db.exec(`
      CREATE TABLE IF NOT EXISTS etudiant_pae (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        etudiant_id    INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        confirme_le    TEXT,
        confirme_par   TEXT,
        UNIQUE(etudiant_id, annee_scolaire)
      )`);
  } catch (e) { console.error('[migration] parcours :', e.message); }
})();

/**
 * La section de rattachement, avec DÉDUCTION EN SECOURS.
 *
 * Le rattachement explicite fait foi. À défaut — les étudiants déjà en base
 * n'en ont pas — on retombe sur la section la plus représentée dans ses
 * inscriptions, comme avant.
 */
export function sectionRattachement(etudId, annee = null) {
  const e = db.prepare('SELECT section_rattachement FROM etudiant WHERE id = ?').get(etudId);
  if (e?.section_rattachement) return { section: e.section_rattachement, deduite: false };

  const lignes = db.prepare(`
    SELECT (SELECT section FROM ue u WHERE u.ue_num = i.ue_num AND u.section IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS section
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ?${annee ? ' AND i.annee_scolaire = ?' : ''}
  `).all(...(annee ? [etudId, annee] : [etudId])).map(x => x.section).filter(Boolean);

  if (!lignes.length) return { section: null, deduite: true };
  const compte = {};
  for (const s of lignes) compte[s] = (compte[s] || 0) + 1;
  const section = Object.entries(compte).sort((a, b) => b[1] - a[1])[0][0];
  return { section, deduite: true };
}

// ── Confirmer le programme d'un étudiant ───────────────────────────────────
// Tant que le PAE n'est pas confirmé, il n'est qu'une PROPOSITION. La
// confirmation le fige et fait passer l'étudiant en « inscrit ».
r.post('/:id/pae/confirmer', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'),
       (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ues } = req.body || {};
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const dateJour = new Date().toISOString().slice(0, 10);
  const qui = req.user?.email || req.user?.nom_complet || null;

  const ins = db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, date_inscription)
    VALUES (?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO NOTHING`);

  let ajoutees = 0;
  db.transaction(() => {
    // Les unités transmises sont celles que l'écran affiche APRÈS ajustement :
    // on inscrit ce qui a été retenu, pas la proposition brute.
    for (const n of (Array.isArray(ues) ? ues : []).map(Number).filter(Boolean)) {
      const r0 = ins.run(etudId, annee, n, dateJour);
      if (r0.changes) ajoutees++;
    }
    db.prepare(`
      INSERT INTO etudiant_pae (etudiant_id, annee_scolaire, confirme_le, confirme_par)
      VALUES (?,?, datetime('now'), ?)
      ON CONFLICT(etudiant_id, annee_scolaire) DO UPDATE SET
        confirme_le = datetime('now'), confirme_par = excluded.confirme_par
    `).run(etudId, annee, qui);
  })();

  res.json({ ok: true, ajoutees, confirme: true });
});

r.delete('/:id/pae/confirmer', authRequired,
         roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  // On retire la confirmation SANS toucher aux inscriptions : les supprimer
  // effacerait des résultats éventuels.
  db.prepare('DELETE FROM etudiant_pae WHERE etudiant_id = ? AND annee_scolaire = ?')
    .run(Number(req.params.id), annee);
  res.json({ ok: true, confirme: false });
});

// ── Import d'un classeur de suivi ──────────────────────────────────────────
// Les classeurs portent les DEUX sessions, les notes par acquis et la
// MOTIVATION des décisions — ce que Lucie ne savait pas importer. Chaque ligne
// alimente trois tables : l'inscription pour la décision et sa session,
// etudiant_note_detail pour les acquis, decision_motivation pour le motif.
r.post('/import-suivi', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { annee, lignes, simulation } = req.body || {};
  if (!annee || !Array.isArray(lignes)) {
    return res.status(400).json({ error: 'annee et lignes requises' });
  }

  // Rapprochement par MATRICULE : c'est ce que portent les classeurs. Il change
  // d'une rentrée à l'autre, mais ces fichiers sont annuels — le matricule y
  // est donc fiable, contrairement à un import pluriannuel.
  const parMatricule = {};
  for (const e of db.prepare('SELECT id, id_ecampus, nom, prenom FROM etudiant').all()) {
    const k = String(e.id_ecampus || '').trim();
    if (k) parMatricule[k] = e;
  }

  // Les PONDÉRATIONS du classeur : elles manquent au référentiel de Lucie,
  // alors que vos fichiers les portent. Sans elles, la note d'unité se calcule
  // à la moyenne simple, ce qui est faux dès qu'un acquis pèse 60 %.
  const insPondCours = db.prepare(`
    INSERT INTO cours_ponderation (ue_num, cours_code, poids, maj_le)
    VALUES (?,?,?, datetime('now'))
    ON CONFLICT(ue_num, cours_code) DO UPDATE SET
      poids = excluded.poids, maj_le = excluded.maj_le`);

  const insPond = db.prepare(`
    INSERT INTO aa_ponderation (ue_num, cours_code, aa_code, poids, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    -- La contrainte de la table porte sur (cours_code, aa_code), SANS ue_num :
    -- l'avoir supposée à trois colonnes faisait échouer tout l'import.
    ON CONFLICT(cours_code, aa_code) DO UPDATE SET
      poids = excluded.poids, maj_le = excluded.maj_le`);

  const rapport = { retrouves: 0, resultats: 0, notes: 0, motivations: 0,
                    ponderations: 0,
                    ecrases: 0, inconnus: [] };
  const vusEtud = new Set();
  const ponderationsFaites = new Set();
  rapport.aa_sans_cours = new Set();

  const insInsc = db.prepare(`
    INSERT INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, resultat, resultat_s1, resultat_s2,
       points, date_inscription)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat    = excluded.resultat,
      resultat_s1 = COALESCE(excluded.resultat_s1, etudiant_inscription.resultat_s1),
      resultat_s2 = COALESCE(excluded.resultat_s2, etudiant_inscription.resultat_s2),
      points      = COALESCE(excluded.points, etudiant_inscription.points)`);

  const lireInsc = db.prepare(`
    SELECT resultat, points FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);

  const insNote = db.prepare(`
    INSERT INTO etudiant_note_detail
      (etudiant_id, annee_scolaire, ue_num, type, code, points)
    VALUES (?,?,?, 'aa', ?, ?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
      points = excluded.points`);

  const insMotif = db.prepare(`
    INSERT INTO decision_motivation
      (etudiant_id, annee_scolaire, ue_num, aa_code, motif, maj_le, maj_par)
    VALUES (?,?,?,?,?, datetime('now'), ?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, aa_code) DO UPDATE SET
      motif = excluded.motif, maj_le = excluded.maj_le`);

  const dateJour = new Date().toISOString().slice(0, 10);
  const qui = req.user?.email || req.user?.nom_complet || null;

  const appliquer = db.transaction(() => {
    for (const l of lignes) {
      const e = parMatricule[String(l.matricule || '').trim()];
      if (!e) {
        rapport.inconnus.push({ matricule: l.matricule, nom: l.nom, prenom: l.prenom });
        continue;
      }
      if (!vusEtud.has(e.id)) { vusEtud.add(e.id); rapport.retrouves++; }

      const ueNum = Number(l.ue_num);
      if (!Number.isFinite(ueNum)) continue;

      // Un résultat déjà en base sera REMPLACÉ : on le compte pour l'annoncer.
      const avant = lireInsc.get(e.id, annee, ueNum);
      if (avant?.resultat && avant.resultat !== l.decision) rapport.ecrases++;

      if (l.decision) {
        // La session d'où vient la décision, telle que le classeur la dit.
        const s1 = l.session === 's1' ? l.decision : null;
        const s2 = l.session === 's2' ? (l.decision === 'reussi' ? 'reussi' : 'echec') : null;
        if (!simulation) {
          insInsc.run(e.id, annee, ueNum, l.decision, s1, s2,
                      l.points ?? null, dateJour);
        }
        rapport.resultats++;
      }

      // Le cours de chaque acquis : le calcul de la note d'UE cherche les
      // notes sous la clé « cours|acquis », les pondérations étant propres au
      // cours. Une note sans cours resterait invisible au calcul.
      const coursDe = {};
      for (const r0 of db.prepare(
        'SELECT aa_code, cours_code FROM aa WHERE ue_num = ?').all(ueNum)) {
        if (r0.cours_code) coursDe[r0.aa_code] = r0.cours_code;
      }

      for (const [bloc, notes] of [['s1', l.notes_s1], ['s2', l.notes_s2]]) {
        for (const [aa, note] of Object.entries(notes || {})) {
          // Le code porte la session : sans cela, la seconde écraserait la
          // première et l'on perdrait le détail de la délibération.
          // Deux écritures : la SESSION pour la feuille de délibération, et le
          // COURS pour le calcul de la note d'unité. Les deux sont utiles et ne
          // se remplacent pas.
          if (!simulation) insNote.run(e.id, annee, ueNum, `${bloc}|${aa}`, note);
          const cc = coursDe[aa];
          if (cc && bloc === 's2' || (cc && bloc === 's1' && !l.notes_s2?.[aa])) {
            // La note qui FAIT FOI : la seconde session si elle existe.
            if (!simulation) insNote.run(e.id, annee, ueNum, `${cc}|${aa}`, note);
          }
          rapport.notes++;
        }
      }

      // Les pondérations sont propres à l'UNITÉ, non à l'étudiant : on ne les
      // écrit qu'une fois par unité rencontrée.
      // La RÉPARTITION de l'onglet dédié fait foi jusqu'en 2025-2026 : elle
      // donne le poids de chaque cours et le poids de chaque acquis DANS
      // chaque cours, un même acquis pouvant figurer dans plusieurs. À partir
      // de 2026-2027, les périodes du dossier pédagogique prennent le relais
      // et ces tables restent vides.
      if (l.repartition && !ponderationsFaites.has(ueNum)) {
        ponderationsFaites.add(ueNum);
        for (const [cc, p] of Object.entries(l.repartition.cours || {})) {
          if (p == null || p === 0) continue;
          if (!simulation) insPondCours.run(ueNum, cc, p);
          rapport.ponderations++;
        }
        for (const [aa, parCours] of Object.entries(l.repartition.acquis || {})) {
          for (const [cc, p] of Object.entries(parCours)) {
            if (p == null || p === 0) continue;
            if (!simulation) insPond.run(ueNum, cc, aa, p);
            rapport.ponderations++;
          }
        }
        continue;
      }

      if (l.ponderations && !ponderationsFaites.has(ueNum)) {
        ponderationsFaites.add(ueNum);
        for (const [aa, p] of Object.entries(l.ponderations)) {
          if (p?.poids_aa == null) continue;
          // La pondération est stockée PAR COURS : sans le cours, le calcul
          // de la note d'UE ne la retrouve pas. Un acquis sans cours rattaché
          // est signalé plutôt qu'écrit sous une clé vide.
          const cc = db.prepare(
            'SELECT cours_code FROM aa WHERE ue_num = ? AND aa_code = ? LIMIT 1'
          ).get(ueNum, aa)?.cours_code;
          if (!cc) { rapport.aa_sans_cours.add(aa); continue; }
          if (!simulation) insPond.run(ueNum, cc, aa, p.poids_aa);
          rapport.ponderations++;
        }
      }

      // La justification du classeur devient la motivation de la décision.
      if (l.justification && (l.decision === 'refuse' || l.decision === 'ajourne')) {
        if (!simulation) {
          insMotif.run(e.id, annee, ueNum, '_ue', l.justification, qui);
        }
        rapport.motivations++;
      }
    }
    if (simulation) throw new Error('SIMULATION');
  });

  try { appliquer(); } catch (e) {
    if (e.message !== 'SIMULATION') {
      console.error('[import-suivi]', e);
      return res.status(500).json({ error: e.message });
    }
  }

  res.json({
    ok: true, simulation: !!simulation,
    lignes_lues: lignes.length,
    retrouves: rapport.retrouves,
    resultats: rapport.resultats,
    notes: rapport.notes,
    motivations: rapport.motivations,
    ponderations: rapport.ponderations,
    aa_sans_cours: [...rapport.aa_sans_cours],
    ecrases: rapport.ecrases,
    inconnus: rapport.inconnus.slice(0, 20),
    nb_inconnus: rapport.inconnus.length,
  });
});

// ── Fiche pédagogique de parcours ──────────────────────────────────────────
// Le document qu'on remet à l'étudiant après délibération : où il en est, ce
// qu'il peut suivre, ce qui lui reste. Aucune notion financière — c'est une
// pièce PÉDAGOGIQUE, non un décompte de droits d'inscription.
r.get('/:id/fiche-parcours', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.query.annee || anneeDeTravail(req);

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const { section } = sectionRattachement(etudId, annee);
  if (!section) {
    return res.status(400).json({
      error: "Aucune section pour cet étudiant : le schéma de capitalisation "
           + 'ne peut pas être construit.',
    });
  }

  // Tout ce que l'étudiant a acquis, TOUTES ANNÉES : une unité réussie ne se
  // reperd pas.
  const acquis = new Map();
  for (const l of db.prepare(`
    SELECT ue_num, resultat, points, annee_scolaire FROM etudiant_inscription
    WHERE etudiant_id = ? ORDER BY annee_scolaire
  `).all(etudId)) {
    if (l.resultat === 'reussi') {
      acquis.set(l.ue_num, { points: l.points, annee: l.annee_scolaire, mode: 'reussi' });
    }
  }
  for (const v of db.prepare(`
    SELECT ue_num, pourcentage, annee_scolaire FROM etudiant_valorisation
    WHERE etudiant_id = ? AND type = 'complete'
  `).all(etudId)) {
    if (!acquis.has(v.ue_num)) {
      acquis.set(v.ue_num, { points: v.pourcentage, annee: v.annee_scolaire, mode: 'va' });
    }
  }

  const inscrites = new Set(db.prepare(`
    SELECT ue_num FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ?
  `).all(etudId, annee).map(x => x.ue_num));

  // Le graphe, avec la situation de l'étudiant superposée. Une unité est
  // ACCESSIBLE si tous ses prérequis sont acquis ; sinon elle est hors
  // d'atteinte pour l'instant.
  const graphe = construireGraphe({
    sections: [section], annee,
    etat: (ueNum) => {
      if (acquis.has(ueNum)) {
        const a = acquis.get(ueNum);
        return { statut: 'acquis', points: a.points, annee_acquis: a.annee, mode: a.mode };
      }
      return { statut: 'a_evaluer', inscrite: inscrites.has(ueNum) };
    },
  });

  // L'accessibilité se calcule APRÈS coup : elle dépend des prérequis, que le
  // graphe vient d'établir.
  for (const n of graphe.nodes) {
    if (n.statut === 'acquis') continue;
    const bloquants = (n.prerequis || []).filter(p => !acquis.has(p));
    n.statut = bloquants.length ? 'bloque' : 'accessible';
    n.bloquants = bloquants;
  }

  // Les unités réussies, avec leur note — la partie basse du document.
  const reussies = [...acquis.entries()]
    .map(([ue_num, a]) => {
      const u = graphe.nodes.find(n => n.ue_num === ue_num);
      return {
        ue_num, ue_nom: u?.ue_nom || `UE ${ue_num}`, ue_niv: u?.ue_niv || '',
        points: a.points, annee: a.annee, mode: a.mode,
      };
    })
    .sort((a, b) => String(a.annee).localeCompare(String(b.annee)) || a.ue_num - b.ue_num);

  res.json({
    etudiant: { id: e.id, nom: e.nom, prenom: e.prenom, id_ecampus: e.id_ecampus },
    section, annee, graphe, reussies,
    compte: {
      acquis: acquis.size,
      accessibles: graphe.nodes.filter(n => n.statut === 'accessible').length,
      bloquees: graphe.nodes.filter(n => n.statut === 'bloque').length,
      inscrites: inscrites.size,
      total: graphe.nodes.length,
    },
  });
});

// ── Le document imprimable ─────────────────────────────────────────────────
// Paysage, une page A4. Le schéma en haut, les unités réussies en bas.
r.get('/:id/fiche-parcours/document', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const etudId = Number(req.params.id);

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const { section } = sectionRattachement(etudId, annee);
  if (!section) return res.status(400).json({ error: 'aucune section pour cet étudiant' });

  // On réutilise le calcul de la route de données, sans le dupliquer.
  const acquis = new Map();
  for (const l of db.prepare(`
    SELECT ue_num, resultat, points, annee_scolaire FROM etudiant_inscription
    WHERE etudiant_id = ? ORDER BY annee_scolaire`).all(etudId)) {
    if (l.resultat === 'reussi') {
      acquis.set(l.ue_num, { points: l.points, annee: l.annee_scolaire, mode: 'reussi' });
    }
  }
  for (const v of db.prepare(`
    SELECT ue_num, pourcentage, annee_scolaire FROM etudiant_valorisation
    WHERE etudiant_id = ? AND type = 'complete'`).all(etudId)) {
    if (!acquis.has(v.ue_num)) {
      acquis.set(v.ue_num, { points: v.pourcentage, annee: v.annee_scolaire, mode: 'va' });
    }
  }
  const inscrites = new Set(db.prepare(`
    SELECT ue_num FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ?`).all(etudId, annee).map(x => x.ue_num));

  const graphe = construireGraphe({
    sections: [section], annee,
    etat: n => acquis.has(n)
      ? { statut: 'acquis' }
      : { statut: 'a_evaluer', inscrite: inscrites.has(n) },
  });
  for (const n of graphe.nodes) {
    if (n.statut === 'acquis') continue;
    const bl = (n.prerequis || []).filter(p => !acquis.has(p));
    n.statut = bl.length ? 'bloque' : 'accessible';
  }

  const esc2 = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Les unités rangées par colonne du graphe : c'est la lecture du parcours.
  const parColonne = {};
  for (const n of graphe.nodes) (parColonne[n.couche] ||= []).push(n);
  const colonnes = Object.keys(parColonne).map(Number).sort((a, b) => a - b);

  const libColonne = i => {
    const c0 = (graphe.colonnes || []).find(x => x.index === i);
    return c0?.groupe || c0?.label || '';
  };

  // Le schéma en SVG, comme à l'écran : un flux CSS n'a pas de coordonnées, et
  // sans coordonnées on ne peut pas tracer les flèches de prérequis. Or ce sont
  // elles qui font lire le parcours — sans elles on voit des colonnes, pas des
  // dépendances.
  const L = 108, H = 34, GX = 44, GY = 7, PAD = 4, TETE = 16;
  const couches = {};
  for (const n of graphe.nodes) (couches[n.couche] ||= []).push(n);
  const nums = Object.keys(couches).map(Number).sort((a, b) => a - b);

  const pos = {};
  const colonnesX = {};
  let lignesMax = 0;
  nums.forEach((cn, ci) => {
    const x = PAD + ci * (L + GX);
    colonnesX[cn] = x;
    couches[cn].forEach((n, ri) => { pos[n.ue_num] = { x, y: PAD + TETE + ri * (H + GY) }; });
    lignesMax = Math.max(lignesMax, couches[cn].length);
  });
  const largeur = PAD * 2 + nums.length * L + Math.max(0, nums.length - 1) * GX;
  const hauteur = PAD * 2 + TETE + lignesMax * (H + GY);

  const COULEUR = {
    acquis:     { fond: '#D1FAE5', trait: '#34D399', texte: '#065F46' },
    accessible: { fond: '#DBEAFE', trait: '#60A5FA', texte: '#1E3A8A' },
    bloque:     { fond: '#F1F5F9', trait: '#CBD5E1', texte: '#64748B' },
  };

  const fleches = (graphe.edges || []).map(e2 => {
    const a = pos[e2.from], b = pos[e2.to];
    if (!a || !b) return '';
    const x1 = a.x + L, y1 = a.y + H / 2;
    const x2 = b.x - 3, y2 = b.y + H / 2;
    // Une courbe plutôt qu'une droite : les liens se croisent moins et se
    // suivent mieux à l'œil.
    const dx = Math.max(14, (x2 - x1) / 2);
    return `<path d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"
      fill="none" stroke="${e2.type === 'legal' ? '#94A3B8' : '#C9A84C'}"
      stroke-width="${e2.type === 'legal' ? 0.8 : 0.7}"
      stroke-dasharray="${e2.type === 'legal' ? '' : '2,1.5'}"
      marker-end="url(#fl)" />`;
  }).join('');

  const titres = nums.map(cn => {
    const c0 = (graphe.colonnes || []).find(x => x.index === cn);
    const lib = c0?.groupe || c0?.label || couches[cn][0]?.ue_niv || '';
    return lib ? `<text x="${colonnesX[cn] + L / 2}" y="${PAD + 9}"
      text-anchor="middle" font-size="7" font-weight="700"
      fill="#475569">${esc2(lib)}</text>` : '';
  }).join('');

  const boites = graphe.nodes.map(n => {
    const p = pos[n.ue_num];
    const co = COULEUR[n.statut] || COULEUR.bloque;
    // Le nom, coupé sur deux lignes : les intitulés d'UE sont longs.
    const mots = String(n.ue_nom || '').split(/\s+/);
    const l1 = [], l2 = [];
    for (const m of mots) {
      if (l1.join(' ').length + m.length <= 24) l1.push(m);
      else if (l2.join(' ').length + m.length <= 24) l2.push(m);
    }
    return `
    <g>
      <rect x="${p.x}" y="${p.y}" width="${L}" height="${H}" rx="2.5"
        fill="${co.fond}" stroke="${n.inscrite ? '#C9A84C' : co.trait}"
        stroke-width="${n.inscrite ? 1.6 : 0.6}" />
      <text x="${p.x + 4}" y="${p.y + 9}" font-size="7.5" font-weight="700"
        fill="${co.texte}">${n.ue_num}${n.epreuve_integree ? ' · EI' : ''}</text>
      <text x="${p.x + 4}" y="${p.y + 18}" font-size="6" fill="${co.texte}">${esc2(l1.join(' '))}</text>
      <text x="${p.x + 4}" y="${p.y + 25}" font-size="6" fill="${co.texte}">${esc2(l2.join(' '))}${
        mots.length > l1.length + l2.length ? '…' : ''}</text>
      ${n.determinante ? `
      <!-- UE déterminante : la pastille est CENTRÉE sur l'angle supérieur
           droit, donc à cheval sur le bord — elle déborde autant qu'elle
           mord dedans, comme un cachet posé sur le coin. -->
      <circle cx="${p.x + L}" cy="${p.y}" r="4.5" fill="#047857"
        stroke="#fff" stroke-width="0.7" />
      <text x="${p.x + L}" y="${p.y + 2.2}" text-anchor="middle"
        font-size="5.5" font-weight="700" fill="#fff">D</text>` : ''}
    </g>`;
  }).join('');

  const schema = `
  <svg viewBox="0 0 ${largeur} ${hauteur}" class="schema"
       xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="fl" markerWidth="6" markerHeight="6" refX="5" refY="2"
        orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L5,2 L0,4 z" fill="#94A3B8" />
      </marker>
    </defs>
    ${titres}
    ${fleches}
    ${boites}
  </svg>`;

  const reussies = [...acquis.entries()]
    .map(([ue, a]) => ({ ue, ...a,
      nom: graphe.nodes.find(n => n.ue_num === ue)?.ue_nom || `UE ${ue}` }))
    .sort((a, b) => String(a.annee).localeCompare(String(b.annee)) || a.ue - b.ue);

  const corps = `
<div class="fp">
  <div class="entete">
    <div>
      <div class="nom-etud">${esc2((e.nom || '').toUpperCase())} ${esc2(e.prenom || '')}</div>
      <div class="sous">${esc2(section)} · année ${esc2(annee)}${
        e.id_ecampus ? ` · matricule ${esc2(e.id_ecampus)}` : ''}</div>
    </div>
    <div class="titre">Parcours de formation</div>
  </div>

  <div class="legende">
    <span><i class="p acquis"></i> acquise</span>
    <span><i class="p accessible"></i> accessible</span>
    <span><i class="p bloque"></i> prérequis manquants</span>
    <span><i class="p inscrite"></i> inscrite cette année</span>
  </div>

  ${schema}

  <div class="bas">
    <div class="bas-titre">Unités d'enseignement acquises
      <span class="cpt">${reussies.length}</span></div>
    ${reussies.length ? `<table class="acquises">
      <tr><th>UE</th><th>Intitulé</th><th>Année</th><th>Note</th></tr>
      ${reussies.map(u => `<tr>
        <td>${u.ue}</td>
        <td>${esc2(u.nom)}</td>
        <td>${esc2(u.annee || '')}</td>
        <td class="n">${u.mode === 'va' ? 'Valorisation'
          : (u.points != null ? u.points + '/20' : '—')}</td>
      </tr>`).join('')}
    </table>` : '<div class="vide">Aucune unité acquise à ce jour.</div>'}
  </div>
</div>`;

  const html = envelopperDocument({
    html: corps, titre: '', orientation: 'paysage',
    margeHaut: 10, margeCote: 10, logo: LOGO_IIP_JPEG,
    styles: `
.fp{font-size:8pt;color:#1B2B4B}
.entete{display:flex;justify-content:space-between;align-items:flex-end;
  border-bottom:1pt solid #C9A84C;padding-bottom:1.5mm;margin-bottom:2mm}
.entete .nom-etud{font-size:13pt;font-weight:700}
.entete .sous{font-size:8.5pt;color:#475569}
.entete .titre{font-size:10pt;font-weight:700;letter-spacing:.4pt;color:#475569}

.legende{display:flex;gap:6mm;font-size:7pt;color:#475569;margin-bottom:2mm}
.legende i.p{display:inline-block;width:3mm;height:3mm;border-radius:.6mm;
  margin-right:1mm;vertical-align:-.3mm;border:.4pt solid rgba(0,0,0,.15)}

/* Les couleurs demandées : vert acquis, bleu accessible, gris hors d'atteinte.
   L'inscription se marque par un liseré, non par une couleur — une unité
   inscrite reste accessible ou bloquée. */
.p.acquis,.ue.acquis{background:#D1FAE5;border-color:#6EE7B7}
.p.accessible,.ue.accessible{background:#DBEAFE;border-color:#93C5FD}
.p.bloque,.ue.bloque{background:#F1F5F9;border-color:#CBD5E1;color:#64748B}
.p.inscrite{background:#fff;border:1.2pt solid #C9A84C}

/* Le schéma est un SVG : il porte ses propres couleurs. */
.schema{width:100%;height:auto;max-height:105mm;display:block;margin:1mm 0 2mm}

.bas{margin-top:3mm;border-top:.5pt solid #cbd5e1;padding-top:1.5mm}
.bas-titre{font-size:8.5pt;font-weight:700;margin-bottom:1mm}
.bas-titre .cpt{background:#1B2B4B;color:#fff;border-radius:2mm;
  padding:.2mm 1.6mm;font-size:7pt;margin-left:1.5mm}
table.acquises{width:100%;border-collapse:collapse;font-size:7pt}
table.acquises th{background:#f1f5f9;text-align:left;font-size:6.5pt;
  text-transform:uppercase;letter-spacing:.2pt;color:#475569;
  padding:.8mm 1.2mm;border:.4pt solid #cbd5e1}
table.acquises td{padding:.7mm 1.2mm;border:.4pt solid #e2e8f0}
table.acquises td.n{text-align:right;white-space:nowrap;font-weight:600}
.vide{font-size:7.5pt;color:#94a3b8;font-style:italic}`,
  });

  res.json({ html, nom: `Parcours_${e.nom}_${e.prenom}_${annee}` });
});

r.get('/coherence-resultats', authRequired, (req, res) => {
  const { annee, section } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const params = [annee];
  let clauseSection = '';
  if (section) {
    clauseSection = ` AND i.ue_num IN (SELECT ue_num FROM ue WHERE section = ?)`;
    params.push(section);
  }

  const lignes = db.prepare(`
    SELECT i.etudiant_id, i.ue_num, i.resultat, i.points,
           e.nom, e.prenom
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.points IS NOT NULL AND i.points < 10
      ${clauseSection}
    ORDER BY e.nom, i.ue_num
  `).all(...params);

  // Une note sous le seuil avec une décision de réussite, ou sans décision.
  const incoherents = lignes.filter(l =>
    l.resultat === 'reussi' || l.resultat == null);

  res.json({
    annee, section: section || null,
    notes_sous_seuil: lignes.length,
    incoherents: incoherents.slice(0, 200).map(l => ({
      etudiant_id: l.etudiant_id, nom: l.nom, prenom: l.prenom,
      ue_num: l.ue_num, points: l.points, resultat: l.resultat,
    })),
    nb_incoherents: incoherents.length,
    etudiants_concernes: new Set(incoherents.map(l => l.etudiant_id)).size,
  });
});

r.get('/matrice', authRequired, (req, res) => {
  const { annee, section } = req.query;
  if (!annee || !section) return res.status(400).json({ error: 'annee et section requises' });

  const anneeRef = anneeDeTravail(req) || annee;

  const ues = db.prepare(`
    SELECT DISTINCT ue_num, MIN(ue_nom) AS ue_nom,
           -- Le niveau propre à l'UE, tous millésimes confondus : il sert de
           -- recours quand niveauxEffectifs n'en trouve pas.
           MIN(NULLIF(ue_niv, '')) AS ue_niv_propre
    FROM ue
    WHERE section = ? AND annee_scolaire IN (?, ?)
    GROUP BY ue_num
  `).all(section, annee, anneeRef);
  if (!ues.length) return res.json({ ues: [], etudiants: [] });

  const niveaux = niveauxEffectifs([section], annee);
  const rang = v => { const m = /^BA(\d+)$/.exec((v || '').toUpperCase()); return m ? Number(m[1]) : 9; };

  // niveauxEffectifs ne lit le niveau que pour l'ANNÉE ACTIVE : une UE
  // présente uniquement dans l'année consultée n'en recevait aucun et se
  // retrouvait reléguée en fin de tableau, d'où un classement apparemment
  // aléatoire. On retombe sur le niveau porté par l'UE elle-même.
  for (const u of ues) {
    u.ue_niv = niveaux[u.ue_num] || (u.ue_niv_propre || '').toUpperCase() || null;
    delete u.ue_niv_propre;
  }
  ues.sort((a, b) => rang(a.ue_niv) - rang(b.ue_niv) || a.ue_num - b.ue_num);

  const listeUe = ues.map(u => u.ue_num).join(',');

  // Étudiants : ceux qui ont une inscription dans la section, toutes années
  const etudiants = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    WHERE e.actif = 1 AND i.ue_num IN (${listeUe})
    ORDER BY e.nom, e.prenom
  `).all();
  if (!etudiants.length) return res.json({ ues, etudiants: [] });

  const ids = etudiants.map(e => e.id).join(',');

  const inscriptions = db.prepare(`
    SELECT etudiant_id, ue_num, annee_scolaire, resultat, points
    FROM etudiant_inscription
    WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe})
  `).all();
  const vas = db.prepare(`
    SELECT etudiant_id, ue_num, annee_scolaire FROM etudiant_valorisation
    WHERE etudiant_id IN (${ids}) AND ue_num IN (${listeUe}) AND type = 'complete'
  `).all();

  const parEtud = {};
  for (const e of etudiants) parEtud[e.id] = { cellules: {}, anterieurs: {} };

  for (const i of inscriptions) {
    const p = parEtud[i.etudiant_id];
    if (!p) continue;
    if (i.annee_scolaire === annee) {
      p.cellules[i.ue_num] = { resultat: i.resultat, points: i.points };
    } else if (i.resultat) {
      const prec = p.anterieurs[i.ue_num];
      // On retient l'acquis le plus favorable, sinon la trace la plus récente
      if (!prec || (i.resultat === 'reussi' && prec.resultat !== 'reussi')
          || (i.resultat === prec.resultat && i.annee_scolaire > prec.annee)) {
        p.anterieurs[i.ue_num] = { annee: i.annee_scolaire, resultat: i.resultat, points: i.points };
      }
    }
  }
  for (const v of vas) {
    const p = parEtud[v.etudiant_id];
    if (!p) continue;
    if (v.annee_scolaire !== annee) {
      p.anterieurs[v.ue_num] = { annee: v.annee_scolaire, resultat: 'va' };
    }
  }

  res.json({
    annee, section, ues,
    etudiants: etudiants.map(e => ({ ...e, ...parEtud[e.id] })),
  });
});

// ── Encodage direct des notes ──────────────────────────────────────────────
// La matrice ne retient que le résultat ; ici on saisit la NOTE, dont le
// résultat se déduit. L'année est choisie librement, pour rattraper un
// millésime antérieur sans changer d'écran.
r.get('/encodage-direct', authRequired, (req, res) => {
  const { annee, section, ue_num } = req.query;
  if (!annee || !section) return res.status(400).json({ error: 'annee et section requises' });

  const perim = getUserSections(req.user);
  if (perim && !perim.includes(section)) {
    return res.status(403).json({ error: 'section hors de votre périmètre' });
  }

  // Les UE de la section pour l'année, telles que le référentiel les décrit.
  const ues = db.prepare(`
    SELECT DISTINCT ue_num, ue_nom, ue_niv, ects
    FROM ue WHERE section = ? AND annee_scolaire = ?
    ORDER BY ue_niv, ue_num
  `).all(section, annee);

  // Les étudiants inscrits dans la section cette année-là. On part des
  // inscriptions réelles, le rattachement par section n'étant pas fiable.
  const filtreUe = ue_num ? 'AND i.ue_num = ?' : '';
  const params = [section, annee, annee];
  if (ue_num) params.push(Number(ue_num));

  const etudiants = db.prepare(`
    SELECT DISTINCT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id
    WHERE i.ue_num IN (SELECT ue_num FROM ue WHERE section = ? AND annee_scolaire = ?)
      AND i.annee_scolaire = ? ${filtreUe}
    ORDER BY e.nom, e.prenom
  `).all(...params);

  // Ce qui est déjà encodé, pour ne pas faire ressaisir.
  // Les résultats se chargent pour les MÊMES unités que les colonnes.
  // Auparavant les colonnes étaient bâties sur deux millésimes — l'année
  // consultée et l'année de référence — mais les résultats n'étaient lus que
  // pour l'année consultée : une unité absente de ce millésime affichait une
  // colonne VIDE alors que le résultat existait, et l'encodage direct
  // contredisait la grille de parcours.
  const existant = {};
  for (const l of db.prepare(`
    SELECT etudiant_id, ue_num, resultat, resultat_s1, resultat_s2,
           points, points_s1, points_s2
    FROM etudiant_inscription
    WHERE annee_scolaire = ?
      AND ue_num IN (${ues.map(() => '?').join(',')})
  `).all(annee, ...ues.map(u => u.ue_num))) {
    existant[`${l.etudiant_id}|${l.ue_num}`] = {
      resultat: l.resultat, points: l.points,
      s1: l.resultat_s1 || null, s2: l.resultat_s2 || null,
      p1: l.points_s1 ?? null, p2: l.points_s2 ?? null,
    };
  }

  // Les VALORISATIONS complètes. La grille de parcours les affiche et elles y
  // masquent l'inscription ; cet écran les ignorait, si bien que les deux ne
  // disaient pas la même chose du même étudiant.
  for (const v of db.prepare(`
    SELECT etudiant_id, ue_num, pourcentage FROM etudiant_valorisation
    WHERE annee_scolaire = ? AND type = 'complete'
      AND ue_num IN (${ues.map(() => '?').join(',')})
  `).all(annee, ...ues.map(u => u.ue_num))) {
    const cle = `${v.etudiant_id}|${v.ue_num}`;
    const insc = existant[cle];
    existant[cle] = {
      resultat: 'va', points: v.pourcentage,
      // Une valorisation ET un résultat encodé sur la même unité, c'est une
      // contradiction : on la signale plutôt que d'en taire une des deux.
      conflit: insc?.resultat ? insc.resultat : null,
    };
  }

  res.json({ ues, etudiants, existant });
});

// ── Composition des PAE en lot ──────────────────────────────────────────────
// Composer un programme annuel étudiant par étudiant est intenable sur une
// promotion entière : on inscrit ou on retire les mêmes unités pour tous les
// étudiants retenus, en une fois.
r.post('/pae-lot', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { annee, etudiants, ues, action, simulation } = req.body || {};
  if (!annee || !Array.isArray(etudiants) || !Array.isArray(ues)) {
    return res.status(400).json({ error: 'annee, etudiants et ues requis' });
  }
  if (!['inscrire', 'retirer'].includes(action)) {
    return res.status(400).json({ error: 'action inconnue' });
  }
  if (!etudiants.length || !ues.length) {
    return res.status(400).json({ error: 'sélection vide' });
  }

  const perim = getUserSections(req.user);
  const dateJour = new Date().toISOString().slice(0, 10);

  // Le périmètre s'applique aux UNITÉS : une coordination ne compose pas les
  // programmes d'une autre section.
  const sectionsUe = {};
  for (const u of db.prepare(`
    SELECT ue_num, MIN(section) AS section FROM ue
    WHERE ue_num IN (${ues.map(() => '?').join(',')}) AND section IS NOT NULL
    GROUP BY ue_num`).all(...ues.map(Number))) {
    sectionsUe[u.ue_num] = u.section;
  }
  const horsPerimetre = perim
    ? ues.filter(n => sectionsUe[n] && !perim.includes(sectionsUe[n]))
    : [];
  if (horsPerimetre.length) {
    return res.status(403).json({
      error: `${horsPerimetre.length} unité(s) hors de votre périmètre : `
           + horsPerimetre.join(', '),
    });
  }

  const rapport = { inscrits: 0, deja: 0, retires: 0, absents: 0, proteges: [] };

  const dejaLa = db.prepare(`
    SELECT resultat FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);

  const ins = db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, date_inscription)
    VALUES (?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO NOTHING`);

  const del = db.prepare(`
    DELETE FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);

  const noms = Object.fromEntries(db.prepare(`
    SELECT id, nom, prenom FROM etudiant
    WHERE id IN (${etudiants.map(() => '?').join(',')})`).all(...etudiants.map(Number))
    .map(e => [e.id, `${e.nom} ${e.prenom}`]));

  const appliquer = db.transaction(() => {
    for (const etudId of etudiants.map(Number)) {
      for (const ueNum of ues.map(Number)) {
        const existant = dejaLa.get(etudId, annee, ueNum);

        if (action === 'inscrire') {
          if (existant) { rapport.deja++; continue; }
          ins.run(etudId, annee, ueNum, dateJour);
          rapport.inscrits++;
        } else {
          if (!existant) { rapport.absents++; continue; }
          // Un résultat encodé ne se supprime pas à la légère : ce serait
          // effacer une décision du Conseil des études.
          if (existant.resultat) {
            rapport.proteges.push({ etudiant: noms[etudId] || etudId, ue_num: ueNum,
                                    resultat: existant.resultat });
            continue;
          }
          del.run(etudId, annee, ueNum);
          rapport.retires++;
        }
      }
    }
    if (simulation) throw new Error('SIMULATION');
  });

  try { appliquer(); } catch (e) {
    if (e.message !== 'SIMULATION') {
      console.error('[pae-lot]', e);
      return res.status(500).json({ error: e.message });
    }
  }

  res.json({
    ok: true, simulation: !!simulation, action,
    ...rapport,
    proteges: rapport.proteges.slice(0, 40),
    nb_proteges: rapport.proteges.length,
  });
});

r.post('/encodage-direct', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { annee, entrees } = req.body || {};
  if (!annee || !Array.isArray(entrees)) {
    return res.status(400).json({ error: 'annee et entrees requises' });
  }

  const dateJour = new Date().toISOString().slice(0, 10);
  const ins = db.prepare(`
    INSERT INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, resultat, points, date_inscription)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = excluded.resultat, points = excluded.points
  `);

  let n = 0;
  const refuses = [];
  db.transaction(() => {
    for (const e of entrees) {
      let points = null;
      if (e.points != null && e.points !== '') {
        points = Number(String(e.points).replace(',', '.'));
        if (!Number.isFinite(points) || points < 0 || points > 20) {
          refuses.push({ etudiant_id: e.etudiant_id, ue_num: e.ue_num, valeur: e.points });
          continue;
        }
      }
      // Le résultat suit la note quand il n'est pas imposé : le seuil de
      // réussite est de 10 sur 20 (RDE, art. 44).
      const resultat = e.resultat
        || (points == null ? null : (points >= 10 ? 'reussi' : 'ajourne'));

      ins.run(Number(e.etudiant_id), annee, Number(e.ue_num), resultat, points, dateJour);
      n++;
    }
  })();

  res.json({ ok: true, enregistres: n, refuses, nb_refuses: refuses.length });
});

// ── Enregistrement par lots depuis la matrice ──────────────────────────────
// Marquer un résultat vaut inscription : la ligne est créée si besoin.
// Effacer un résultat vide la case sans supprimer l'inscription.
r.post('/matrice', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, changements } = req.body;
  if (!annee || !Array.isArray(changements)) {
    return res.status(400).json({ error: 'annee et changements requis' });
  }
  // « refuse » manquait : l'écran ne pouvait donc pas enregistrer une décision
  // de refus, pourtant distincte de l'ajournement dans toute l'application.
  const RES = ['reussi', 'ajourne', 'refuse', 'absent'];
  const dateJour = new Date().toISOString().slice(0, 10);

  // Ce qu'une session accepte. La session 2 ne connaît que la réussite et
  // l'échec : un ajournement n'y a pas de sens, il n'y a pas de troisième tour.
  const RES_S1 = ['reussi', 'echec', 'absent'];
  const RES_S2 = ['reussi', 'echec', 'absent'];

  const ins = db.prepare(`
    INSERT INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, resultat, resultat_s1, resultat_s2,
       points, points_s1, points_s2, date_inscription)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat    = excluded.resultat,
      resultat_s1 = COALESCE(excluded.resultat_s1, etudiant_inscription.resultat_s1),
      resultat_s2 = COALESCE(excluded.resultat_s2, etudiant_inscription.resultat_s2),
      points      = COALESCE(excluded.points,      etudiant_inscription.points),
      points_s1   = COALESCE(excluded.points_s1,   etudiant_inscription.points_s1),
      points_s2   = COALESCE(excluded.points_s2,   etudiant_inscription.points_s2)
  `);

  const lire = db.prepare(`
    SELECT resultat_s1, resultat_s2, points_s1, points_s2 FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);

  /** Une note : hors bornes ou illisible, elle ne vaut RIEN, pas zéro. */
  const note = v => {
    if (v == null || v === '') return null;
    const x = Number(String(v).replace(',', '.'));
    return Number.isFinite(x) && x >= 0 && x <= 20 ? x : null;
  };

  let n = 0;
  db.transaction(() => {
    for (const ch of changements) {
      const session = ch.session === 2 ? 2 : ch.session === 1 ? 1 : null;

      if (!session) {
        // Saisie directe de la décision, sans session : on la respecte telle
        // quelle. C'est le cas des reprises et des corrections du Conseil.
        const r0 = ch.resultat && RES.includes(ch.resultat) ? ch.resultat : null;
        ins.run(Number(ch.etudiant_id), annee, Number(ch.ue_num), r0, null, null,
                note(ch.points), null, null, dateJour);
        n++; continue;
      }

      const permis = session === 1 ? RES_S1 : RES_S2;
      const val = ch.resultat && permis.includes(ch.resultat) ? ch.resultat : null;

      const actuel = lire.get(Number(ch.etudiant_id), annee, Number(ch.ue_num)) || {};
      const s1 = session === 1 ? val : (actuel.resultat_s1 ?? null);
      const s2 = session === 2 ? val : (actuel.resultat_s2 ?? null);

      // La décision se DÉDUIT des deux sessions, sauf si le Conseil l'impose.
      const decision = ch.decision_imposee && RES.includes(ch.decision_imposee)
        ? ch.decision_imposee
        : decisionFinale(s1, s2);

      // La note de la session, et celle qui FAIT FOI : la seconde si elle
      // existe, la première sinon — même règle que pour la décision.
      const p = note(ch.points);
      const p1 = session === 1 ? p : (actuel.points_s1 ?? null);
      const p2 = session === 2 ? p : (actuel.points_s2 ?? null);
      const pFoi = p2 ?? p1;

      ins.run(Number(ch.etudiant_id), annee, Number(ch.ue_num), decision,
              session === 1 ? val : null, session === 2 ? val : null,
              pFoi, session === 1 ? p : null, session === 2 ? p : null, dateJour);
      n++;
    }
  })();

  res.json({ ok: true, enregistres: n });
});

// ── Périmètre disponible pour la purge : UE et cours d'une section ──────────
r.get('/purge/perimetre', authRequired, (req, res) => {
  const { section, annee } = req.query;
  const anneeRef = anneeDeTravail(req) || annee;

  const annees = db.prepare(
    'SELECT DISTINCT annee_scolaire FROM etudiant_inscription ORDER BY annee_scolaire DESC'
  ).all().map(r0 => r0.annee_scolaire);

  let ues = [], cours = [];
  if (section) {
    ues = db.prepare(`
      SELECT DISTINCT ue_num, MIN(ue_nom) AS ue_nom FROM ue
      WHERE section = ? AND annee_scolaire IN (?, ?)
      GROUP BY ue_num ORDER BY ue_num
    `).all(section, annee || anneeRef, anneeRef);
    if (ues.length) {
      cours = db.prepare(`
        SELECT DISTINCT cours_code, MIN(cours_nom) AS cours_nom, ue_num FROM cours
        WHERE ue_num IN (${ues.map(u => u.ue_num).join(',')})
        GROUP BY cours_code ORDER BY cours_code
      `).all();
    }
  }
  res.json({ annees, ues, cours });
});

// ── Étudiants concernés, pour une sélection fine ───────────────────────────
r.get('/purge/etudiants', authRequired, (req, res) => {
  const { annee, section, ue_num } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  let ues = null;
  if (ue_num) ues = [Number(ue_num)];
  else if (section) {
    const anneeRef = anneeDeTravail(req) || annee;
    ues = db.prepare(`
      SELECT DISTINCT ue_num FROM ue WHERE section = ? AND annee_scolaire IN (?, ?)
    `).all(section, annee, anneeRef).map(r0 => r0.ue_num);
  }

  const clause = ues && ues.length ? `AND i.ue_num IN (${ues.join(',')})` : '';
  const rows = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus,
           COUNT(DISTINCT i.ue_num) AS nb_ue,
           SUM(CASE WHEN i.resultat IS NOT NULL THEN 1 ELSE 0 END) AS nb_resultats
    FROM etudiant e
    JOIN etudiant_inscription i ON i.etudiant_id = e.id AND i.annee_scolaire = ?
    WHERE 1=1 ${clause}
    GROUP BY e.id ORDER BY e.nom, e.prenom
  `).all(annee);
  res.json(rows);
});

// ── Purge sélective : section, UE ou cours, sur tout ou partie des étudiants
// Appelée d'abord en simulation pour annoncer ce qui sera touché, puis pour
// de bon. Rien n'est supprimé sans que le compte ait été montré.
r.post('/purge', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const {
    annee, section, ue_num, cours_code,
    etudiant_ids,                 // null ou [] = tous les étudiants concernés
    portee = 'resultats',         // resultats | inscriptions
    simulation = true,
  } = req.body;

  if (!annee) return res.status(400).json({ error: 'annee requise' });

  // UE visées : une seule, ou toutes celles de la section, ou aucune limite
  let ues = null;
  if (ue_num) ues = [Number(ue_num)];
  else if (section) {
    const anneeRef = anneeDeTravail(req) || annee;
    ues = db.prepare(`
      SELECT DISTINCT ue_num FROM ue WHERE section = ? AND annee_scolaire IN (?, ?)
    `).all(section, annee, anneeRef).map(r0 => r0.ue_num);
    if (!ues.length) return res.json({ ok: true, simulation, rien: true, message: 'Aucune UE pour cette section.' });
  }

  // Cours visé : restreint aux résultats de cours et aux notes d'acquis
  const cc = cours_code ? String(cours_code).trim() : null;
  if (cc && !ues) {
    const ue = db.prepare('SELECT ue_num FROM cours WHERE cours_code = ? LIMIT 1').get(cc)?.ue_num;
    if (ue != null) ues = [ue];
  }

  const etudiants = Array.isArray(etudiant_ids) && etudiant_ids.length
    ? etudiant_ids.map(Number) : null;

  // Construction des clauses communes
  const cond = (colUe = 'ue_num', colEtud = 'etudiant_id') => {
    const parts = ['annee_scolaire = @annee'];
    const p = { annee };
    if (ues) { parts.push(`${colUe} IN (${ues.join(',')})`); }
    if (etudiants) { parts.push(`${colEtud} IN (${etudiants.join(',')})`); }
    return { where: parts.join(' AND '), p };
  };

  const compter = (table, extra = '') => {
    const { where, p } = cond();
    try {
      return db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}${extra}`).get(p).n;
    } catch { return 0; }
  };

  const clauseCours = cc ? ` AND cours_code = '${cc.replace(/'/g, "''")}'` : '';

  const compte = {
    resultats_cours: compter('etudiant_resultat_cours', clauseCours),
    notes_aa: compter('etudiant_note_detail', clauseCours),
    reports: compter('etudiant_report_note', clauseCours),
    // Les inscriptions et valorisations sont à la maille de l'UE : un filtre
    // par cours ne les concerne pas.
    inscriptions: cc ? 0 : compter('etudiant_inscription'),
    inscriptions_avec_resultat: cc ? 0 : compter('etudiant_inscription', ' AND resultat IS NOT NULL'),
    valorisations: cc ? 0 : compter('etudiant_valorisation'),
  };

  if (simulation) {
    return res.json({
      ok: true, simulation: true, annee, section: section || null,
      ue_num: ue_num || null, cours_code: cc, portee,
      etudiants: etudiants ? etudiants.length : 'tous',
      compte,
    });
  }

  const supprime = {};
  db.transaction(() => {
    const { where, p } = cond();
    const exec = (sql) => { try { return db.prepare(sql).run(p).changes; } catch { return 0; } };

    supprime.resultats_cours = exec(`DELETE FROM etudiant_resultat_cours WHERE ${where}${clauseCours}`);
    supprime.notes_aa       = exec(`DELETE FROM etudiant_note_detail   WHERE ${where}${clauseCours}`);
    supprime.reports        = exec(`DELETE FROM etudiant_report_note   WHERE ${where}${clauseCours}`);

    if (!cc) {
      if (portee === 'inscriptions') {
        supprime.inscriptions  = exec(`DELETE FROM etudiant_inscription   WHERE ${where}`);
        supprime.valorisations = exec(`DELETE FROM etudiant_valorisation  WHERE ${where}`);
      } else {
        supprime.inscriptions_videes = exec(
          `UPDATE etudiant_inscription SET resultat = NULL, points = NULL WHERE ${where}`);
      }
    }
  })();

  res.json({ ok: true, simulation: false, annee, portee, supprime });
});

// ── Fiche étudiant avec inscriptions ─────────────────────────────────────────
r.get('/:id', authRequired, (req, res) => {
  const etudiant = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(Number(req.params.id));
  if (!etudiant) return res.status(404).json({ error: 'étudiant introuvable' });

  // Toutes les inscriptions, toutes années — le front groupe par année.
  const inscriptions = db.prepare(`
    SELECT i.*, u.ue_nom, u.ue_niv, u.ue_quad, u.section
    FROM etudiant_inscription i
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE i.etudiant_id = ?
    ORDER BY i.annee_scolaire DESC, u.section, i.ue_num
  `).all(etudiant.id);

  const anneeAct = anneeDeTravail(req);
  // Un étudiant hors périmètre ne doit pas être consultable par son seul
  // identifiant : masquer la liste sans protéger la fiche ne protège rien.
  const { sections: secEtud } = sectionsDeLEtudiant(etudiant.id, null);
  const autoriseesFiche = perimetre(req);
  if (autoriseesFiche && secEtud.length && !secEtud.some(s => autoriseesFiche.includes(s))) {
    return res.status(403).json({ error: 'Cet étudiant est hors de votre périmètre' });
  }

  res.json({ ...etudiant, inscriptions, niveau: niveauEtudiant(etudiant.id, anneeAct) });
});

// ── Encoder un résultat ───────────────────────────────────────────────────────
r.patch('/inscription/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { resultat, mention, points } = req.body;
  // Les trois décisions de première session, plus l'absence. « refuse » manquait :
  // le serveur aurait rejeté une décision que la circulaire prévoit.
  const RESULTATS = ['reussi', 'ajourne', 'refuse', 'absent', null];
  if (resultat !== undefined && !RESULTATS.includes(resultat)) {
    return res.status(400).json({ error: 'resultat invalide' });
  }

  // La cote est CONSERVÉE quel que soit le résultat : l'établissement doit la
  // connaître — pour la seconde session, pour un recours, pour la délibération.
  // Ce que la circulaire écarte, c'est sa COMMUNICATION : lorsque le seuil
  // n'est pas atteint, les documents remis à l'étudiant portent « NA » et non
  // un nombre. L'effacer aurait fait perdre une information nécessaire.
  db.prepare(`
    UPDATE etudiant_inscription SET resultat = ?, mention = ?, points = ? WHERE id = ?
  `).run(resultat ?? null, mention ?? null, points ?? null, Number(req.params.id));

  res.json({ ok: true });
});

// ── Générer le PAE pour une année ─────────────────────────────────────────────
// Logique : UEs organisées cette année dont les prérequis sont satisfaits
// (l'étudiant les a réussies l'année précédente ou elles n'ont pas de prérequis)
r.get('/:id/pae', authRequired, (req, res) => {
  const profId = Number(req.params.id);
  const annee = req.query.annee;
  const anneePrecedente = req.query.annee_precedente;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const etudiant = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(profId);
  if (!etudiant) return res.status(404).json({ error: 'étudiant introuvable' });

  // UEs réussies explicitement (toutes années — un résultat encodé n'expire pas)
  const reussiesExplicites = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND resultat = 'reussi'
    `).all(profId).map(r => r.ue_num)
  );

  // UEs déjà inscrites pour l'année du PAE (état courant)
  const dejaInscritesAnnee = new Set(
    db.prepare(`
      SELECT ue_num FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ?
    `).all(profId, annee).map(r => r.ue_num)
  );

  // UEs déjà suivies (toutes années confondues)
  const dejaSuivies = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ?
    `).all(profId).map(r => r.ue_num)
  );

  // VA en dispense complète : l'UE est acquise (AGCF art. 4)
  const vaCompletes = new Set(
    db.prepare(`
      SELECT DISTINCT ue_num FROM etudiant_valorisation
      WHERE etudiant_id = ? AND type = 'complete'
    `).all(profId).map(r => r.ue_num)
  );

  // Acquis = réussites explicites ∪ VA complètes.
  // (L'inférence par prérequis n'est plus un acquis automatique : elle est
  //  devenue une suggestion visuelle dans la grille de parcours, où le
  //  secrétariat encode explicitement l'historique.)
  const reussies = new Set([...reussiesExplicites, ...vaCompletes]);

  // Sections de l'étudiant (dominantes) — override possible via ?section=
  const { sections: sectionsEtudiant, scores: sectionsScores } =
    sectionsDeLEtudiant(profId, req.query.section);

  // Carte des UE de la ou des sections : déterminantes et épreuve intégrée.
  // L'épreuve ne se présente qu'une fois tout le reste acquis — ou lorsqu'il
  // ne subsiste que les déterminantes, présentées la même année.
  const carteUE = sectionsEtudiant.length
    ? db.prepare(`
        SELECT DISTINCT ue_num, MAX(COALESCE(is_epreuve_integree, 0)) AS epreuve
        FROM ue WHERE section IN (${sectionsEtudiant.map(() => '?').join(',')})
        GROUP BY ue_num
      `).all(...sectionsEtudiant)
    : [];
  const estEpreuve = {};
  for (const u of carteUE) estEpreuve[u.ue_num] = !!u.epreuve;

  // Année d'études de chaque UE, au sens de la section
  const nivCarte = sectionsEtudiant.length ? niveauxEffectifs(sectionsEtudiant, annee) : {};
  const rangDe = v => {
    const m = /^BA(\d+)$/.exec(String(v || '').toUpperCase());
    return m ? Number(m[1]) : 9;
  };

  // Graphe complet des prérequis, pour le contrôle transitif
  // Deux natures : le prérequis LÉGAL bloque, l'INTERNE avertit seulement.
  // Les mêler priverait un étudiant d'une UE qu'il a le droit de suivre.
  const prereqTous = {}, prereqInternes = {};
  for (const p of db.prepare(
    "SELECT ue_num, prerequis_num, COALESCE(type,'legal') AS type, motif FROM ue_prerequis"
  ).all()) {
    if (p.type === 'interne') {
      (prereqInternes[p.ue_num] = prereqInternes[p.ue_num] || []).push(
        { ue: p.prerequis_num, motif: p.motif });
    } else {
      (prereqTous[p.ue_num] = prereqTous[p.ue_num] || []).push(p.prerequis_num);
    }
  }

  // UEs organisées cette année dans ces sections — UNE ligne par UE
  // (une UE peut avoir plusieurs organisations : on ne la propose qu'une fois)
  let organisees = [];
  if (sectionsEtudiant.length) {
    const placeholders = sectionsEtudiant.map(() => '?').join(',');
    organisees = db.prepare(`
      SELECT o.ue_num,
             MIN(o.section) AS section,
             MIN(o.num_organisation) AS num_organisation,
             MIN(o.date_debut) AS date_debut,
             MAX(o.date_fin) AS date_fin,
             MIN(u.ue_nom) AS ue_nom,
             MIN(u.ue_niv) AS ue_niv,
             MIN(u.ue_quad) AS ue_quad
      FROM organisation_ue o
      LEFT JOIN ue u ON u.ue_num = o.ue_num AND u.annee_scolaire = ?
                    AND u.section = o.section
      WHERE o.annee_scolaire = ? AND o.section IN (${placeholders})
      GROUP BY o.ue_num
      ORDER BY
        CASE UPPER(COALESCE(MIN(u.ue_niv),'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END,
        o.ue_num
    `).all(annee, annee, ...sectionsEtudiant);
  }

  // Pour chaque UE organisée, vérifier les prérequis
  const pae = [];
  for (const ue of organisees) {
    const prerequis = db.prepare(`
      SELECT p.prerequis_num AS ue_num_requis, u.ue_nom
      FROM ue_prerequis p
      LEFT JOIN ue u ON u.ue_num = p.prerequis_num AND u.annee_scolaire = ?
      WHERE p.ue_num = ?
    `).all(annee, ue.ue_num);

    const prerequis_ok = prerequis.every(p => reussies.has(p.ue_num_requis));
    const deja_reussie = reussies.has(ue.ue_num);

    // Chaîne COMPLÈTE des prérequis manquants. S'inscrire à la 256 suppose la
    // 255, laquelle suppose la 254 : ne contrôler que le lien direct laissait
    // passer une inscription impossible.
    const chaineManquante = (() => {
      const manquants = new Set(), vus = new Set(), pile = [ue.ue_num];
      while (pile.length) {
        const n = pile.pop();
        if (vus.has(n)) continue;
        vus.add(n);
        for (const p of (prereqTous[n] || [])) {
          if (reussies.has(p)) continue;
          manquants.add(p); pile.push(p);
        }
      }
      return [...manquants].sort((a, b) => a - b);
    })();

    // Sous réserve : les prérequis manquants sont organisés la même année
    // ET du même niveau que l'UE (cas type : épreuve intégrée et ses
    // déterminantes). Un prérequis manquant de niveau inférieur bloque.
    const prereqManquants = prerequis.filter(p => !reussies.has(p.ue_num_requis));
    const organiseesSet = new Set(organisees.map(o => o.ue_num));
    const nivDeUe = (organisees.find(o => o.ue_num === ue.ue_num)?.ue_niv || ue.ue_niv || '').toUpperCase();
    const nivMap = {};
    for (const o of organisees) nivMap[o.ue_num] = (o.ue_niv || '').toUpperCase();
    const sous_reserve = !prerequis_ok && prereqManquants.length > 0 &&
      prereqManquants.every(p => organiseesSet.has(p.ue_num_requis) &&
                                 nivMap[p.ue_num_requis] === nivDeUe);

    // L'épreuve intégrée sanctionne la section : elle ne s'ouvre que si tout
    // le reste est acquis, ou s'il ne reste que les UE déterminantes, elles
    // aussi au programme de l'année. Toute autre inscription relève de la
    // dérogation, ajoutée à la main.
    let epreuveEtat = null, epreuveRestantes = null;
    if (estEpreuve[ue.ue_num]) {
      // L'épreuve ne s'ouvre que si TOUTES les UE des années inférieures sont
      // acquises. À défaut, elle ne se propose pas — elle s'ajoute à la main,
      // sur décision du Conseil des études.
      const rangEpreuve = rangDe(nivCarte[ue.ue_num]);
      epreuveRestantes = carteUE
        .filter(x => x.ue_num !== ue.ue_num
                  && rangDe(nivCarte[x.ue_num]) < rangEpreuve
                  && !reussies.has(x.ue_num))
        .map(x => x.ue_num).sort((a, b) => a - b);
      epreuveEtat = epreuveRestantes.length ? 'fermee' : 'ouverte';
    }

    pae.push({
      ...ue,
      prerequis,
      prerequis_ok,
      epreuve_integree: !!estEpreuve[ue.ue_num],
      epreuve_etat: epreuveEtat,
      epreuve_restantes: epreuveRestantes,
      deja_reussie,
      va_complete: vaCompletes.has(ue.ue_num),
      deja_suivie: dejaSuivies.has(ue.ue_num),
      inscrite: dejaInscritesAnnee.has(ue.ue_num),
      accessible: estEpreuve[ue.ue_num]
        ? (epreuveEtat === 'ouverte' && !deja_reussie)
        : (prerequis_ok && !deja_reussie),
      sous_reserve: estEpreuve[ue.ue_num] ? false : (sous_reserve && !deja_reussie),
      prereq_manquants: prereqManquants.map(p => p.ue_num_requis),
      prereq_chaine: chaineManquante,
      // Recommandations non satisfaites : l'UE reste accessible, mais l'écran
      // le signale pour que la décision soit prise en connaissance de cause.
      avertissements: (prereqInternes[ue.ue_num] || [])
        .filter(x => !reussies.has(x.ue))
        .map(x => ({ ue_num: x.ue, motif: x.motif })),
      // Circulaire 9764 : la réinscription dans une UE déjà réussie est possible
      // avec décision favorable du Conseil des études (pièce au dossier).
      reinscriptible_ce: prerequis_ok && deja_reussie,
    });
  }

  // ── Proposition de PAE : point fixe intra-niveau (même règle que PAE auto) ──
  // Les UE accessibles d'abord, puis celles débloquées par ces inscriptions
  // à condition d'être du MÊME niveau (épreuve intégrée et ses déterminantes).
  const nivParUe = {};
  for (const u of pae) nivParUe[u.ue_num] = (u.ue_niv || '').toUpperCase();
  const proposees = new Set();
  let stableProp = false;
  while (!stableProp) {
    stableProp = true;
    for (const u of pae) {
      if (u.deja_reussie || proposees.has(u.ue_num)) continue;
      // L'épreuve intégrée ne suit pas le jeu des prérequis : elle relève de
      // sa propre règle, déjà tranchée plus haut.
      if (u.epreuve_integree) {
        if (u.epreuve_etat === 'ouverte') { proposees.add(u.ue_num); stableProp = false; }
        continue;
      }
      const manquants = u.prereq_manquants || [];
      const ok = manquants.every(p => proposees.has(p) && nivParUe[p] === nivParUe[u.ue_num]);
      if (ok) { proposees.add(u.ue_num); stableProp = false; }
    }
  }
  for (const u of pae) {
    u.propose = proposees.has(u.ue_num);
    u.propose_sous_reserve = u.propose && (u.prereq_manquants || []).length > 0;
  }

  // Niveau de rattachement de chaque UE, tel que défini pour la section
  const nivEffectifs = sectionsEtudiant.length
    ? niveauxEffectifs(sectionsEtudiant, annee) : {};
  for (const u of pae) u.ue_niv = nivEffectifs[u.ue_num] || u.ue_niv || null;

  // L'état de confirmation : l'écran doit savoir si le programme est figé ou
  // n'est encore qu'une proposition.
  const confirmation = db.prepare(
    'SELECT confirme_le, confirme_par FROM etudiant_pae WHERE etudiant_id = ? AND annee_scolaire = ?'
  ).get(profId, annee);

  res.json({
    etudiant,
    annee,
    pae_confirme: !!confirmation?.confirme_le,
    pae_confirme_le: confirmation?.confirme_le || null,
    pae_confirme_par: confirmation?.confirme_par || null,
    annee_precedente: anneePrecedente,
    sections: sectionsEtudiant,
    sections_scores: sectionsScores,
    niveau: niveauEtudiant(profId, annee),
    pae,
    proposition: pae.filter(u => u.propose).map(u => u.ue_num),
    accessibles: pae.filter(u => u.accessible).length,
    reference: 'PAE — Plan Annuel de l\'Étudiant. Basé sur les prérequis de la section et les UE organisées.'
  });
});

// ── Valider le PAE : synchroniser les inscriptions de l'année ────────────────
// Reçoit la liste retenue par le secrétariat. Insère les manquantes, retire
// celles décochées qui n'ont PAS de résultat encodé (jamais destructif).
r.post('/:id/pae-valider', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_nums, derogations, forcer } = req.body;
  if (!annee || !Array.isArray(ue_nums)) {
    return res.status(400).json({ error: 'annee et ue_nums requis' });
  }
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const retenues = new Set(ue_nums.map(Number));
  const derog = new Set((derogations || []).map(Number));
  const dateInsc = new Date().toISOString().slice(0, 10);

  const existantes = db.prepare(
    'SELECT ue_num, resultat FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?'
  ).all(etudId, annee);

  const ins = db.prepare(`
    INSERT OR IGNORE INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, date_inscription, derogation)
    VALUES (?,?,?,?,?)
  `);
  // Par défaut, une inscription portant un résultat n'est jamais retirée
  // silencieusement. Avec « forcer », elle l'est — et ses notes avec elle.
  const del = forcer
    ? db.prepare('DELETE FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?')
    : db.prepare(`
        DELETE FROM etudiant_inscription
        WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND resultat IS NULL
      `);

  let ajoutees = 0, retirees = 0, conservees = 0;
  const tx = db.transaction(() => {
    for (const ue of retenues) {
      if (ins.run(etudId, annee, ue, dateInsc, derog.has(ue) ? 1 : 0).changes) ajoutees++;
    }
    for (const ex of existantes) {
      if (retenues.has(ex.ue_num)) continue;
      if (ex.resultat != null && !forcer) { conservees++; continue; }
      if (del.run(etudId, annee, ex.ue_num).changes) {
        retirees++;
        db.prepare('DELETE FROM etudiant_note_detail WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?')
          .run(etudId, annee, ex.ue_num);
      }
    }
  });
  tx();

  res.json({ ok: true, annee, ajoutees, retirees, conservees, total: retenues.size });
});

// ── PAE auto : inscrire d'un clic tout ce que l'étudiant peut avoir ──────────
// Point fixe : accessibles directes, puis celles débloquées par ces
// inscriptions (sous réserve — cas épreuve intégrée), jusqu'à stabilité.
r.post('/:id/pae-auto', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.body.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  // Acquis : réussites encodées + VA complètes
  const acquis = new Set([
    ...db.prepare("SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND resultat = 'reussi'").all(etudId).map(r => r.ue_num),
    ...db.prepare("SELECT DISTINCT ue_num FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete'").all(etudId).map(r => r.ue_num),
  ]);

  // Sections de l'étudiant
  const { sections } = sectionsDeLEtudiant(etudId, req.body.section);
  if (!sections.length) return res.status(400).json({ error: 'sections de l\'étudiant inconnues' });

  // UE organisées cette année dans ces sections, non acquises
  const ph = sections.map(() => '?').join(',');
  const candidates = db.prepare(`
    SELECT DISTINCT o.ue_num FROM organisation_ue o
    WHERE o.annee_scolaire = ? AND o.section IN (${ph})
  `).all(annee, ...sections).map(r => r.ue_num).filter(u => !acquis.has(u));

  // Prérequis
  const prereqs = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all();
  const prereqDe = {};
  for (const p of prereqs) (prereqDe[p.ue_num] = prereqDe[p.ue_num] || []).push(p.prerequis_num);

  // Niveaux (BA1/BA2/BA3) — le « sous réserve » ne vaut qu'ENTRE UE DU MÊME
  // NIVEAU (épreuve intégrée et ses déterminantes). Une UE dont le prérequis
  // manquant est d'un niveau inférieur n'est pas inscriptible : il faut
  // d'abord réussir ce prérequis (cas UE de BA1 ratée → la suite attend).
  const anneeRefNiv = anneeDeTravail(req) || annee;
  const nivRows = db.prepare('SELECT DISTINCT ue_num, ue_niv FROM ue WHERE annee_scolaire = ?').all(anneeRefNiv);
  const nivDe = {};
  for (const n of nivRows) nivDe[n.ue_num] = (n.ue_niv || '').toUpperCase();

  // Point fixe intra-niveau : la cascade inter-niveaux est bloquée
  const inscrites = new Set();
  const sousReserve = {};
  let stable = false;
  while (!stable) {
    stable = true;
    for (const ue of candidates) {
      if (inscrites.has(ue)) continue;
      const manquants = (prereqDe[ue] || []).filter(p => !acquis.has(p));
      const ok = manquants.every(p => inscrites.has(p) && nivDe[p] === nivDe[ue]);
      if (ok) {
        inscrites.add(ue);
        if (manquants.length) sousReserve[ue] = manquants;
        stable = false;
      }
    }
  }

  // Insertion (sans écraser un éventuel résultat déjà encodé cette année)
  const dateInsc = new Date().toISOString().slice(0, 10);
  const ins = db.prepare(`
    INSERT OR IGNORE INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, date_inscription)
    VALUES (?,?,?,?)
  `);
  let creees = 0;
  const tx = db.transaction(() => {
    for (const ue of inscrites) {
      if (ins.run(etudId, annee, ue, dateInsc).changes) creees++;
    }
  });
  tx();

  res.json({
    ok: true, annee, creees,
    inscrites: [...inscrites].sort((a, b) => a - b),
    sous_reserve: Object.fromEntries(Object.entries(sousReserve)),
  });
});

// ── Import du classeur de PAE (résultats par cours + PAE de l'année suivante)
// Le frontend a déjà résolu la légende : il envoie des entrées normalisées.
r.post('/import-pae', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee_resultats, annee_pae, resultats, pae, commentaires } = req.body;
  if (!annee_resultats || !Array.isArray(resultats)) {
    return res.status(400).json({ error: 'annee_resultats et resultats requis' });
  }

  // cours_code → ue_num, depuis le référentiel (toutes années confondues)
  const ueDeCours = {};
  for (const x of db.prepare('SELECT DISTINCT cours_code, ue_num FROM cours WHERE cours_code IS NOT NULL').all()) {
    ueDeCours[String(x.cours_code).trim()] = x.ue_num;
  }

  const trouver = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ?');
  const insRes = db.prepare(`
    INSERT INTO etudiant_resultat_cours
      (etudiant_id, annee_scolaire, ue_num, cours_code, statut, note, faveur)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, cours_code) DO UPDATE SET
      statut = excluded.statut, note = excluded.note,
      faveur = excluded.faveur, ue_num = excluded.ue_num
  `);
  const insInsc = db.prepare(`
    INSERT OR IGNORE INTO etudiant_inscription
      (etudiant_id, annee_scolaire, ue_num, date_inscription)
    VALUES (?,?,?,?)
  `);
  const insCom = db.prepare(`
    INSERT INTO etudiant_commentaire_ce (etudiant_id, annee_scolaire, texte, maj_le)
    VALUES (?,?,?, datetime('now'))
    ON CONFLICT(etudiant_id, annee_scolaire) DO UPDATE SET
      texte = excluded.texte, maj_le = datetime('now')
  `);

  const inconnus = new Set(), coursInconnus = new Set();
  let nRes = 0, nPae = 0, nCom = 0, nUE = 0;
  const dateJour = new Date().toISOString().slice(0, 10);

  // Réussite d'une UE : tous ses cours connus doivent être réussis, valorisés
  // ou reportés. Un seul refus ou non-présenté suffit à la faire échouer.
  const parEtudiantUE = {};

  db.transaction(() => {
    for (const l of resultats) {
      const e = trouver.get(String(l.id_ecampus || '').trim());
      if (!e) { inconnus.add(l.id_ecampus); continue; }
      const cc = String(l.cours_code || '').trim();
      const ue = ueDeCours[cc] ?? null;
      if (ue == null) coursInconnus.add(cc);
      insRes.run(e.id, annee_resultats, ue, cc, l.statut,
                 l.note != null ? Number(l.note) : null, l.faveur ? 1 : 0);
      nRes++;
      if (ue != null) {
        const cle = e.id + '|' + ue;
        (parEtudiantUE[cle] = parEtudiantUE[cle] || []).push(l.statut);
      }
    }

    // Inscription à l'UE pour l'année des résultats, avec son issue
    for (const [cle, statuts] of Object.entries(parEtudiantUE)) {
      const [eid, ue] = cle.split('|').map(Number);
      const acquis = s => ['reussi', 'va', 'report'].includes(s);
      const resultat = statuts.every(acquis) ? 'reussi'
        : statuts.some(s => s === 'non_presente') && !statuts.some(s => s === 'refuse') ? 'absent'
        : 'ajourne';
      insInsc.run(eid, annee_resultats, ue, dateJour);
      db.prepare(`
        UPDATE etudiant_inscription SET resultat = ?
        WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? AND resultat IS NULL
      `).run(resultat, eid, annee_resultats, ue);
      nUE++;
    }

    // PAE de l'année suivante : inscriptions non délibérées
    if (annee_pae && Array.isArray(pae)) {
      const vues = new Set();
      for (const l of pae) {
        const e = trouver.get(String(l.id_ecampus || '').trim());
        if (!e) { inconnus.add(l.id_ecampus); continue; }
        const ue = ueDeCours[String(l.cours_code || '').trim()];
        if (ue == null) continue;
        const cle = e.id + '|' + ue;
        if (vues.has(cle)) continue;            // une inscription par UE
        vues.add(cle);
        if (insInsc.run(e.id, annee_pae, ue, dateJour).changes) nPae++;
      }
    }

    for (const cm of (commentaires || [])) {
      const e = trouver.get(String(cm.id_ecampus || '').trim());
      if (!e || !cm.texte) continue;
      insCom.run(e.id, annee_resultats, String(cm.texte).trim());
      nCom++;
    }
  })();

  res.json({
    ok: true,
    resultats_cours: nRes, ue_deduites: nUE, pae_creees: nPae, commentaires: nCom,
    matricules_inconnus: [...inconnus].slice(0, 25),
    cours_inconnus: [...coursInconnus].slice(0, 25),
  });
});

// ── Import des résultats depuis le classeur de suivi (.xlsm) ─────────────────
// Le frontend lit les onglets par UE et envoie { annee, resultats: [...] }.
r.post('/import-resultats', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, resultats } = req.body;
  if (!annee || !Array.isArray(resultats)) {
    return res.status(400).json({ error: 'annee et resultats requis' });
  }

  const findEtud = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ?');
  const upsert = db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, resultat, points)
    VALUES (?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = excluded.resultat,
      points = COALESCE(excluded.points, points)
  `);

  let maj = 0, inconnus = [];
  const tx = db.transaction(() => {
    for (const r0 of resultats) {
      const e = findEtud.get(String(r0.id_ecampus || '').trim());
      if (!e) { inconnus.push(r0.id_ecampus); continue; }
      const resultat = ['reussi','ajourne','absent'].includes(r0.resultat) ? r0.resultat : null;
      const points = r0.points != null && !isNaN(Number(r0.points)) ? Number(r0.points) : null;
      upsert.run(e.id, annee, Number(r0.ue_num), resultat, points);
      maj++;
    }
  });
  tx();

  res.json({ ok: true, maj, inconnus: [...new Set(inconnus)].slice(0, 20) });
});

// ── Schéma de capitalisation d'un étudiant ──────────────────────────────────
// Le graphe (nœuds, arêtes, colonnes) est construit par le module
// capitalisation, qui fait autorité sur l'année d'études de chaque UE.
// On n'y superpose ici que l'état de l'étudiant.
r.get('/:id/capitalisation', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const { sections } = sectionsDeLEtudiant(etudId, req.query.section);
  if (!sections.length) return res.json({ nodes: [], edges: [], colonnes: [], sections: [] });

  const acquis = new Set([
    ...db.prepare("SELECT DISTINCT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND resultat = 'reussi'").all(etudId).map(r0 => r0.ue_num),
    ...db.prepare("SELECT DISTINCT ue_num FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete'").all(etudId).map(r0 => r0.ue_num),
  ]);
  const inscrites = new Set(
    db.prepare('SELECT ue_num FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ?')
      .all(etudId, annee).map(r0 => r0.ue_num));
  const ph = sections.map(() => '?').join(',');
  const organisees = new Set(
    db.prepare(`SELECT DISTINCT ue_num FROM organisation_ue WHERE annee_scolaire = ? AND section IN (${ph})`)
      .all(annee, ...sections).map(r0 => r0.ue_num));

  // Graphe brut, pour disposer des prérequis et des niveaux effectifs
  const base = construireGraphe({ sections, annee });
  const prereqDe = Object.fromEntries(base.nodes.map(n => [n.ue_num, n.prerequis]));
  const niv = niveauxEffectifs(sections, annee);

  // Proposition : point fixe intra-niveau (même règle que le PAE)
  const proposees = new Set();
  const sousReserve = new Set();
  let stable = false;
  while (!stable) {
    stable = true;
    for (const n0 of base.nodes) {
      const n = n0.ue_num;
      if (acquis.has(n) || proposees.has(n) || !organisees.has(n)) continue;
      const manquants = (prereqDe[n] || []).filter(p => !acquis.has(p));
      if (manquants.every(p => proposees.has(p) && niv[p] === niv[n])) {
        proposees.add(n);
        if (manquants.length) sousReserve.add(n);
        stable = false;
      }
    }
  }

  const g = construireGraphe({
    sections, annee,
    etat: n => ({
      statut: acquis.has(n) ? 'acquise'
        : sousReserve.has(n) ? 'sous_reserve'
        : proposees.has(n) ? 'accessible'
        : 'bloquee',
      inscrite: inscrites.has(n),
      organisee: organisees.has(n),
      prereq_manquants: (prereqDe[n] || []).filter(p => !acquis.has(p)),
    }),
  });

  res.json({ ...g, sections, annee });
});

// ── Purge d'une année pour un étudiant ──────────────────────────────────────
// Deux portées : « resultats » vide les notes en gardant les inscriptions,
// « tout » supprime les inscriptions de l'année et ce qui s'y rattache.
r.delete('/:id/annee/:annee', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.params.annee;
  const portee = req.query.portee === 'tout' ? 'tout' : 'resultats';

  const e = db.prepare('SELECT id FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const avant = db.prepare(
    'SELECT COUNT(*) AS n FROM etudiant_inscription WHERE etudiant_id=? AND annee_scolaire=?'
  ).get(etudId, annee).n;

  let notes = 0, inscriptions = 0, valorisations = 0;
  db.transaction(() => {
    notes = db.prepare(
      'DELETE FROM etudiant_note_detail WHERE etudiant_id=? AND annee_scolaire=?'
    ).run(etudId, annee).changes;

    try {
      db.prepare('DELETE FROM etudiant_report_note WHERE etudiant_id=? AND annee_scolaire=?')
        .run(etudId, annee);
    } catch { /* table absente */ }

    if (portee === 'tout') {
      inscriptions = db.prepare(
        'DELETE FROM etudiant_inscription WHERE etudiant_id=? AND annee_scolaire=?'
      ).run(etudId, annee).changes;
      valorisations = db.prepare(
        'DELETE FROM etudiant_valorisation WHERE etudiant_id=? AND annee_scolaire=?'
      ).run(etudId, annee).changes;
    } else {
      db.prepare(`
        UPDATE etudiant_inscription SET resultat = NULL, points = NULL
        WHERE etudiant_id=? AND annee_scolaire=?
      `).run(etudId, annee);
    }
  })();

  res.json({ ok: true, annee, portee, avant, inscriptions, notes, valorisations });
});

// ── Grille de parcours : UE (lignes, BA1→BA3) × années (colonnes) ────────────
r.get('/:id/grille', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  // Sections de l'étudiant (dominantes) — paramètre ?section= prioritaire
  const { sections, scores: sectionsScores } = sectionsDeLEtudiant(etudId, req.query.section);

  // Année active pour le référentiel UE
  const anneeActive = anneeDeTravail(req);

  // Les UE de la section (référentiel année active), triées BA1→BA3 puis numéro
  let ues = [];
  if (sections.length) {
    const ph = sections.map(() => '?').join(',');
    ues = db.prepare(`
      SELECT DISTINCT ue_num, ue_nom, ue_niv, section FROM ue
      WHERE annee_scolaire = ? AND section IN (${ph})
      ORDER BY
        CASE UPPER(COALESCE(ue_niv,'')) WHEN 'BA1' THEN 1 WHEN 'BA2' THEN 2 WHEN 'BA3' THEN 3 ELSE 4 END,
        ue_num
    `).all(anneeActive, ...sections);
  }

  // Une UE à laquelle l'étudiant est inscrit mais qui ne figure pas au
  // référentiel de sa section — autre section, ou millésime disparu — doit
  // tout de même apparaître : sans quoi elle serait invisible.
  const connues = new Set(ues.map(u => u.ue_num));
  const orphelines = db.prepare(`
    SELECT DISTINCT i.ue_num,
           (SELECT ue_nom  FROM ue x WHERE x.ue_num = i.ue_num ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_nom,
           (SELECT ue_niv  FROM ue x WHERE x.ue_num = i.ue_num ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_niv,
           (SELECT section FROM ue x WHERE x.ue_num = i.ue_num ORDER BY x.annee_scolaire DESC LIMIT 1) AS section
    FROM etudiant_inscription i WHERE i.etudiant_id = ?
  `).all(etudId).filter(u => !connues.has(u.ue_num));
  for (const o of orphelines) {
    // « Hors référentiel » ne doit désigner que ce qui l'est vraiment : une UE
    // d'une AUTRE section, ou dont la section est inconnue. Une unité de la
    // section de l'étudiant, simplement absente du millésime actif ou écartée
    // parce que sa section n'a pas atteint le seuil de dominance, appartient
    // bien à son programme — l'afficher comme étrangère induisait en erreur.
    const memeSection = o.section && sections.includes(o.section);
    ues.push({
      ...o,
      ue_nom: o.ue_nom || `UE ${o.ue_num}`,
      hors_referentiel: !memeSection,
      hors_millesime: memeSection,
    });
  }

  // Prérequis par UE
  const prereqs = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all();
  const prereqDe = {};
  for (const p of prereqs) {
    (prereqDe[p.ue_num] = prereqDe[p.ue_num] || []).push(p.prerequis_num);
  }

  // Cellules : inscriptions + VA complètes
  const inscriptions = db.prepare(
    'SELECT * FROM etudiant_inscription WHERE etudiant_id = ?').all(etudId);
  const vas = db.prepare(
    "SELECT * FROM etudiant_valorisation WHERE etudiant_id = ? AND type = 'complete'").all(etudId);

  const cellules = {};
  for (const i of inscriptions) {
    (cellules[i.annee_scolaire] = cellules[i.annee_scolaire] || {})[i.ue_num] = {
      kind: i.resultat || 'inscrit', points: i.points, derogation: !!i.derogation, id: i.id,
    };
  }
  for (const v of vas) {
    (cellules[v.annee_scolaire] = cellules[v.annee_scolaire] || {})[v.ue_num] = {
      kind: 'va', points: v.pourcentage, derogation: false, vid: v.id,
    };
  }

  // Années : celles des données + année active, triées
  const annees = [...new Set([...Object.keys(cellules), anneeActive].filter(Boolean))].sort();

  // Acquis explicites (réussite ou VA, toutes années)
  const acquis = new Set();
  for (const [, parUe] of Object.entries(cellules)) {
    for (const [ueNum, cell] of Object.entries(parUe)) {
      if (cell.kind === 'reussi' || cell.kind === 'va') acquis.add(Number(ueNum));
    }
  }

  // Suggestion (inférence) : prérequis transitifs des UE inscrites — aide à l'encodage
  const inscritesToutes = new Set(inscriptions.map(i => i.ue_num));
  const suggerees = new Set();
  const pile = [...inscritesToutes];
  const prereqMap = new Map(Object.entries(prereqDe).map(([k, v]) => [Number(k), v]));
  while (pile.length) {
    const ue = pile.pop();
    for (const pr of (prereqMap.get(ue) || [])) {
      if (!suggerees.has(pr)) { suggerees.add(pr); pile.push(pr); }
    }
  }

  // Cellules avec notes détaillées (pour l'indicateur visuel)
  const detailSet = db.prepare(`
    SELECT DISTINCT annee_scolaire, ue_num FROM etudiant_note_detail WHERE etudiant_id = ?
  `).all(etudId).map(d => d.annee_scolaire + ':' + d.ue_num);

  res.json({
    etudiant: { id: e.id, nom: e.nom, prenom: e.prenom },
    sections, sections_scores: sectionsScores, annees, anneeActive, detail: detailSet,
    ues: ues.map(u => ({
      ...u,
      prerequis: prereqDe[u.ue_num] || [],
      hors_referentiel: !!u.hors_referentiel,
      hors_millesime: !!u.hors_millesime,
      // Verrou TRANSITIF : la chaîne entière doit être acquise. Exiger la 255
      // pour la 256 ne suffit pas si la 255 exige elle-même la 254.
      prereq_chaine: (() => {
        const m = new Set(), vus = new Set(), pile = [u.ue_num];
        while (pile.length) {
          const n = pile.pop();
          if (vus.has(n)) continue;
          vus.add(n);
          for (const p of (prereqDe[n] || [])) {
            if (acquis.has(p)) continue;
            m.add(p); pile.push(p);
          }
        }
        return [...m].sort((a, b) => a - b);
      })(),
      deverrouillee: (prereqDe[u.ue_num] || []).every(p => acquis.has(p)),
      acquise: acquis.has(u.ue_num),
      suggeree: suggerees.has(u.ue_num) && !acquis.has(u.ue_num),
    })),
    cellules,
  });
});

// ── Écrire une cellule de la grille ──────────────────────────────────────────
r.put('/:id/grille', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_num, kind, points, derogation } = req.body;
  if (!annee || !ue_num || !kind) {
    return res.status(400).json({ error: 'annee, ue_num et kind requis' });
  }
  const KINDS = ['inscrit', 'reussi', 'ajourne', 'absent', 'va',
                 'effacer_resultat', 'effacer'];
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind invalide' });

  const ueN = Number(ue_num);

  // Toujours nettoyer les deux sources pour cette cellule
  const delInsc = () => db.prepare(
    'DELETE FROM etudiant_inscription WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?'
  ).run(etudId, annee, ueN);
  const delVa = () => db.prepare(
    "DELETE FROM etudiant_valorisation WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? AND type='complete'"
  ).run(etudId, annee, ueN);

  // Effacer le seul résultat : l'inscription demeure, ses notes disparaissent.
  if (kind === 'effacer_resultat') {
    db.prepare(`
      UPDATE etudiant_inscription SET resultat = NULL, points = NULL
      WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?
    `).run(etudId, annee, ueN);
    db.prepare(`
      DELETE FROM etudiant_note_detail
      WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?
    `).run(etudId, annee, ueN);
    return res.json({ ok: true });
  }

  // Supprimer l'inscription : la ligne et tout ce qui s'y rattache.
  if (kind === 'effacer') {
    delInsc(); delVa();
    db.prepare('DELETE FROM etudiant_note_detail WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?')
      .run(etudId, annee, ueN);
    try {
      db.prepare('DELETE FROM etudiant_report_note WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=?')
        .run(etudId, annee, ueN);
    } catch { /* table absente sur une base non migrée */ }
    return res.json({ ok: true });
  }

  if (kind === 'va') {
    delInsc(); delVa();
    db.prepare(`
      INSERT INTO etudiant_valorisation
        (etudiant_id, annee_scolaire, ue_num, type, pourcentage)
      VALUES (?,?,?,'complete',?)
    `).run(etudId, annee, ueN, points != null ? Number(points) : 10);
    // 10/20 : équivalent de la note de 50 % conseillée par la circulaire 9447
    // pour une valorisation, exprimée dans l'échelle sur 20 de l'établissement.
    return res.json({ ok: true });
  }

  // inscrit / reussi / ajourne / absent → etudiant_inscription
  delVa();
  db.prepare(`
    INSERT INTO etudiant_inscription (etudiant_id, annee_scolaire, ue_num, resultat, points, derogation)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num) DO UPDATE SET
      resultat = excluded.resultat, points = excluded.points, derogation = excluded.derogation
  `).run(etudId, annee, ueN, kind === 'inscrit' ? null : kind,
         points != null ? Number(points) : null, derogation ? 1 : 0);
  res.json({ ok: true });
});

// ── Détail des notes par AA (cellule UE × année) ─────────────────────────────
// La note de l'UE se calcule à partir des acquis d'apprentissage : chacun pèse
// par sa pondération dans son cours et par les périodes de ce cours. Un AA
// présent dans deux cours y est coté séparément.
r.get('/:id/grille/detail', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_num } = req.query;
  if (!annee || !ue_num) return res.status(400).json({ error: 'annee et ue_num requis' });
  const ueN = Number(ue_num);

  const structure = structureUE(ueN, annee);

  const lignes = db.prepare(`
    SELECT type, code, cours_code, points, va, non_evalue
    FROM etudiant_note_detail
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).all(etudId, annee, ueN);

  // Clé de note d'AA : cours|aa ; les anciennes lignes sans cours_code sont
  // rattachées au premier cours qui contient cet AA.
  const notes = {};
  // Les notes PAR SESSION. L'import des classeurs de suivi préfixe le code par
  // « s1| » ou « s2| » : sans les séparer ici, la seconde session écrasait la
  // première et l'on perdait le détail de la délibération.
  const sessions = { s1: {}, s2: {} };

  for (const l of lignes) {
    if (l.type !== 'aa') continue;
    const parts = String(l.code).split('|');
    // Trois formes coexistent : « aa », « cours|aa », et « s1|aa » depuis
    // l'import des classeurs.
    const session = /^s[12]$/.test(parts[0]) ? parts[0] : null;
    const brut = parts.length > 1 ? parts[parts.length - 1] : l.code;
    const cc = l.cours_code
      || structure.find(c => c.aas.some(a => a.aa_code === brut))?.cours_code;
    if (!cc) continue;
    const valeur = { points: l.points, va: l.va, non_evalue: l.non_evalue };
    if (session) sessions[session][cc + '|' + brut] = valeur;
    // Le calcul de l'UE s'appuie sur la note qui FAIT FOI : la seconde session
    // si elle existe, la première sinon.
    if (!session || session === 's2' || !notes[cc + '|' + brut]) {
      notes[cc + '|' + brut] = valeur;
    }
  }

  const reportsActifs = db.prepare(`
    SELECT cours_code, note, annee_origine FROM etudiant_report_note
    WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ?
  `).all(etudId, ueN, annee);
  const reports = Object.fromEntries(reportsActifs.map(r0 => [r0.cours_code, r0.note]));

  const dejaReportes = new Set(reportsActifs.map(r0 => r0.cours_code));
  const candidats = coursValidesAnterieurs(etudId, ueN, annee)
    .filter(c0 => !dejaReportes.has(c0.cours_code));

  const calcul = calculerNoteUE(ueN, annee, notes, reports);

  // La décision de chaque session, et la motivation si le Conseil en a donné une.
  const insc = db.prepare(`
    SELECT resultat, resultat_s1, resultat_s2, points FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).get(etudId, annee, ueN) || {};

  const motivation = db.prepare(`
    SELECT motif FROM decision_motivation
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND aa_code = '_ue'
  `).get(etudId, annee, ueN)?.motif || null;

  res.json({
    structure, notes, calcul, reports: reportsActifs, candidats_report: candidats,
    sessions,
    decision: {
      finale: insc.resultat || null,
      s1: insc.resultat_s1 || null,
      s2: insc.resultat_s2 || null,
      points: insc.points ?? null,
      motivation,
    },
  });
});

r.put('/:id/grille/detail', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const etudId = Number(req.params.id);
  const { annee, ue_num, cours_code, code, points, va, non_evalue } = req.body;
  if (!annee || !ue_num || !code || !cours_code) {
    return res.status(400).json({ error: 'annee, ue_num, cours_code et code requis' });
  }
  const ueN = Number(ue_num);

  // La clé unique historique porte sur (type, code) : un même AA présent dans
  // deux cours entrerait en collision. On la lève en préfixant le code par le
  // cours, tout en conservant cours_code dans sa colonne pour la lecture.
  const cleUnique = cours_code + '|' + code;
  const rienASauver = (points == null || points === '') && !va && !non_evalue;

  if (rienASauver) {
    db.prepare(`
      DELETE FROM etudiant_note_detail
      WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? AND type='aa' AND code=?
    `).run(etudId, annee, ueN, cleUnique);
  } else {
    db.prepare(`
      INSERT INTO etudiant_note_detail
        (etudiant_id, annee_scolaire, ue_num, type, code, cours_code, points, va, non_evalue)
      VALUES (?,?,?, 'aa', ?,?,?,?,?)
      ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
        points = excluded.points, va = excluded.va,
        non_evalue = excluded.non_evalue, cours_code = excluded.cours_code
    `).run(etudId, annee, ueN, cleUnique, cours_code,
           points != null && points !== '' ? Number(points) : (va ? 10 : null),
           va ? 1 : 0, non_evalue ? 1 : 0);
  }

  // Recalcul immédiat, pour que l'écran affiche la note à jour
  const structure = structureUE(ueN, annee);
  const notes = {};
  for (const l of db.prepare(`
    SELECT code, cours_code, points, va, non_evalue FROM etudiant_note_detail
    WHERE etudiant_id=? AND annee_scolaire=? AND ue_num=? AND type='aa'
  `).all(etudId, annee, ueN)) {
    const brut = String(l.code).includes('|') ? String(l.code).split('|')[1] : l.code;
    const cc = l.cours_code
      || structure.find(c => c.aas.some(a => a.aa_code === brut))?.cours_code;
    if (cc) notes[cc + '|' + brut] = { points: l.points, va: l.va, non_evalue: l.non_evalue };
  }

  const reports = Object.fromEntries(db.prepare(`
    SELECT cours_code, note FROM etudiant_report_note
    WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ?
  `).all(etudId, ueN, annee).map(r0 => [r0.cours_code, r0.note]));

  res.json({ ok: true, calcul: calculerNoteUE(ueN, annee, notes, reports) });
});

// ── Valorisation des acquis (VA/VAE) — AGCF 13-12-2024 ──────────────────────
r.get('/:id/valorisations', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT v.*, u.ue_nom, u.section
    FROM etudiant_valorisation v
    LEFT JOIN ${UE_REF} u ON u.ue_num = v.ue_num
    WHERE v.etudiant_id = ?
    ORDER BY v.annee_scolaire DESC, v.ue_num
  `).all(Number(req.params.id));
  res.json(rows);
});

r.post('/:id/valorisations', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee_scolaire, ue_num, type, cible, cible_detail, pourcentage,
          decision_ce_date, commentaire } = req.body;
  if (!annee_scolaire || !ue_num || !type) {
    return res.status(400).json({ error: 'annee_scolaire, ue_num et type requis' });
  }
  if (!['complete','partielle','admission'].includes(type)) {
    return res.status(400).json({ error: 'type invalide' });
  }
  if (type === 'partielle' && !['aa','cours'].includes(cible)) {
    return res.status(400).json({ error: 'dispense partielle : cible aa ou cours requise' });
  }
  db.prepare(`
    INSERT INTO etudiant_valorisation
      (etudiant_id, annee_scolaire, ue_num, type, cible, cible_detail,
       pourcentage, decision_ce_date, commentaire)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(Number(req.params.id), annee_scolaire, Number(ue_num), type,
         type === 'partielle' ? cible : null,
         type === 'partielle' ? (cible_detail || null) : null,
         pourcentage != null ? Number(pourcentage) : (type !== 'admission' ? 50 : null),
         decision_ce_date || null, commentaire || null);
  res.json({ ok: true });
});

r.delete('/valorisations/:vid', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM etudiant_valorisation WHERE id = ?').run(Number(req.params.vid));
  res.json({ ok: true });
});

// Cibles disponibles pour une dispense partielle : les cours et AA d'une UE
r.get('/ue/:ueNum/composantes', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee;
  const cours = db.prepare(`
    SELECT cours_code, cours_nom FROM cours
    WHERE ue_num = ? ${annee ? 'AND annee_scolaire = ?' : ''}
    ORDER BY cours_code
  `).all(...(annee ? [ueNum, annee] : [ueNum]));
  const aas = db.prepare(`
    SELECT aa_code, aa_num, cours_code, description FROM aa
    WHERE ue_num = ? ORDER BY aa_num
  `).all(ueNum);
  res.json({ cours, aas });
});

// ── Dossier individuel : les 5 pièces réglementaires ─────────────────────────
r.get('/:id/pieces', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const existantes = db.prepare(
    'SELECT type_piece, statut, commentaire, maj_le FROM etudiant_piece WHERE etudiant_id = ?'
  ).all(etudId);
  const map = Object.fromEntries(existantes.map(p => [p.type_piece, p]));
  res.json(PIECES_APPRENANT.map(p => ({
    ...p,
    statut: map[p.type]?.statut || 'manquant',
    commentaire: map[p.type]?.commentaire || null,
    maj_le: map[p.type]?.maj_le || null,
  })));
});

r.put('/:id/pieces/:type', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { statut, commentaire } = req.body;
  if (!['manquant', 'recu', 'na'].includes(statut)) {
    return res.status(400).json({ error: 'statut invalide (manquant|recu|na)' });
  }
  if (!PIECES_APPRENANT.some(p => p.type === req.params.type)) {
    return res.status(400).json({ error: 'type de pièce inconnu' });
  }
  db.prepare(`
    INSERT INTO etudiant_piece (etudiant_id, type_piece, statut, commentaire, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(etudiant_id, type_piece) DO UPDATE SET
      statut = excluded.statut, commentaire = excluded.commentaire, maj_le = datetime('now')
  `).run(Number(req.params.id), req.params.type, statut, commentaire || null);
  res.json({ ok: true });
});

// ── Fiche d'inscription / reçu (HTML imprimable, contenu circulaire 9764) ────
// Structure : acquis antérieurs EN HAUT (réussites + VA), puis les UE de
// l'inscription de l'année avec mentions réglementaires et sous réserve.
r.get('/:id/fiche-inscription', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const etab = (() => {
    try {
      return db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'etablissement_nom'").get()?.valeur
        || 'Institut Ilya Prigogine';
    } catch { return 'Institut Ilya Prigogine'; }
  })();

  // 1. Acquis antérieurs : réussites encodées + VA complètes
  const reussites = db.prepare(`
    SELECT i.annee_scolaire, i.ue_num, i.points, u.ue_nom, 'reussi' AS kind
    FROM etudiant_inscription i
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE i.etudiant_id = ? AND i.annee_scolaire < ? AND i.resultat = 'reussi'
  `).all(etudId, annee);
  const vasAcq = db.prepare(`
    SELECT v.annee_scolaire, v.ue_num, v.pourcentage AS points, u.ue_nom, 'va' AS kind
    FROM etudiant_valorisation v
    LEFT JOIN ${UE_REF} u ON u.ue_num = v.ue_num
    WHERE v.etudiant_id = ? AND v.type = 'complete'
  `).all(etudId);
  const acquisRows = [...reussites, ...vasAcq].sort((a, b) =>
    String(a.annee_scolaire || '').localeCompare(String(b.annee_scolaire || '')) || a.ue_num - b.ue_num);
  const acquisSet = new Set(acquisRows.map(a => a.ue_num));

  // Historique complet exigé : ajournés / absents antérieurs
  const autres = db.prepare(`
    SELECT i.annee_scolaire, i.ue_num, i.resultat, u.ue_nom
    FROM etudiant_inscription i
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE i.etudiant_id = ? AND i.annee_scolaire < ? AND i.resultat IN ('ajourne','absent')
    ORDER BY i.annee_scolaire, i.ue_num
  `).all(etudId, annee);

  // 2. UE de l'inscription de l'année
  const inscriptions = db.prepare(`
    -- Les ECTS viennent du RÉFÉRENTIEL : etudiant_inscription n'en porte pas.
    -- La colonne figurait sur la fiche sans être alimentée, faute d'être
    -- sélectionnée ici.
    SELECT i.*, u.ue_nom, u.section, u.ects AS ects
    FROM etudiant_inscription i
    LEFT JOIN ${UE_REF} u ON u.ue_num = i.ue_num
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    ORDER BY u.section, i.ue_num
  `).all(etudId, annee);

  // Sous réserve : prérequis non acquis mais inscrits la même année
  const prereqs = db.prepare('SELECT ue_num, prerequis_num FROM ue_prerequis').all();
  const prereqDe = {};
  for (const p of prereqs) (prereqDe[p.ue_num] = prereqDe[p.ue_num] || []).push(p.prerequis_num);
  const inscritesAnnee = new Set(inscriptions.map(i => i.ue_num));

  // Niveau effectif : celui défini pour la section, comme dans le schéma de
  // capitalisation — non la valeur brute du référentiel.
  const sectionsEtud = [...new Set(inscriptions.map(i => i.section).filter(Boolean))];
  const nivDe2 = sectionsEtud.length ? niveauxEffectifs(sectionsEtud, annee) : {};
  const anneeRefNiv2 = anneeDeTravail(req) || annee;
  for (const n of db.prepare('SELECT DISTINCT ue_num, ue_niv FROM ue WHERE annee_scolaire = ?').all(anneeRefNiv2)) {
    if (!nivDe2[n.ue_num]) nivDe2[n.ue_num] = (n.ue_niv || '').toUpperCase();
  }

  // Chaîne COMPLÈTE des prérequis manquants d'une UE — l'exigence est
  // transitive : la 256 exige la 255, laquelle exige la 254.
  const chaineDe = ueNum => {
    const m = new Set(), vus = new Set(), pile = [ueNum];
    while (pile.length) {
      const n = pile.pop();
      if (vus.has(n)) continue;
      vus.add(n);
      for (const p of (prereqDe[n] || [])) {
        if (acquisSet.has(p)) continue;
        m.add(p); pile.push(p);
      }
    }
    return [...m].sort((a, b) => a - b);
  };

  // Le « sous réserve » ne vaut qu'entre UE de MÊME NIVEAU inscrites la même
  // année — l'épreuve intégrée et ses déterminantes. Un prérequis d'une année
  // antérieure non acquis rend l'inscription impossible, non conditionnelle.
  // Carte des UE de la section : déterminantes et épreuve intégrée
  const carteFiche = sectionsEtud.length
    ? db.prepare(`
        SELECT DISTINCT ue_num, MAX(COALESCE(is_epreuve_integree, 0)) AS epreuve
        FROM ue WHERE section IN (${sectionsEtud.map(() => '?').join(',')})
        GROUP BY ue_num
      `).all(...sectionsEtud)
    : [];
  const epreuveF = {};
  for (const u of carteFiche) epreuveF[u.ue_num] = !!u.epreuve;
  const rangF = v => {
    const m = /^BA(\d+)$/.exec(String(v || '').toUpperCase());
    return m ? Number(m[1]) : 9;
  };

  const situationDe = ueNum => {
    // L'épreuve intégrée sanctionne la section : elle ne s'ouvre que si tout
    // le reste est acquis, ou s'il ne subsiste que les UE déterminantes,
    // présentées la même année.
    if (epreuveF[ueNum]) {
      // Elle ne s'ouvre que si toutes les UE des années inférieures sont
      // acquises. Sinon, seule une décision du Conseil des études la justifie.
      const rangE = rangF(nivDe2[ueNum]);
      const restantes = carteFiche
        .filter(x => x.ue_num !== ueNum
                  && rangF(nivDe2[x.ue_num]) < rangE
                  && !acquisSet.has(x.ue_num))
        .map(x => x.ue_num).sort((a, b) => a - b);
      return restantes.length
        ? { etat: 'impossible', chaine: restantes, epreuve: true }
        : { etat: 'ok' };
    }
    const chaine = chaineDe(ueNum);
    if (!chaine.length) return { etat: 'ok' };
    const niv = (nivDe2[ueNum] || '').toUpperCase();
    const conditionnelle = chaine.every(p =>
      inscritesAnnee.has(p) && (nivDe2[p] || '').toUpperCase() === niv);
    return conditionnelle
      ? { etat: 'sous_reserve', chaine }
      : { etat: 'impossible', chaine };
  };

  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;');

  // Le parcours antérieur se lit par ANNÉE ACADÉMIQUE : c'est ainsi qu'on
  // raisonne un cursus. Auparavant les acquis formaient un bloc et les ajournés
  // un second, si bien que la même année revenait à deux endroits du tableau.
  const parcoursAnterieur = (() => {
    const tout = [
      ...acquisRows.map(a => ({
        annee: a.annee_scolaire || '—', ue_num: a.ue_num, ue_nom: a.ue_nom,
        mode: a.kind === 'va' ? '<b>Valorisation des acquis</b>' : 'Réussite',
        points: a.points, acquis: true,
      })),
      ...autres.map(h => ({
        annee: h.annee_scolaire || '—', ue_num: h.ue_num, ue_nom: h.ue_nom,
        // Le libellé d'origine : ajourné = refusé, tout autre cas = absent.
        mode: h.resultat === 'ajourne' ? 'Refusé' : 'Absent',
        points: null, acquis: false,
      })),
    ];

    // Millésime décroissant : le plus récent d'abord, c'est ce qu'on consulte.
    const annees = [...new Set(tout.map(x => x.annee))]
      .sort((a, b) => String(b).localeCompare(String(a)));

    return annees.map(an => {
      const lignes = tout.filter(x => x.annee === an)
        .sort((a, b) => a.ue_num - b.ue_num);
      const nbAcquis = lignes.filter(x => x.acquis).length;
      return `
    <tr class="annee-groupe">
      <td colspan="4"><b>${esc(an)}</b>
        <span style="color:#64748b;font-weight:400"> — ${lignes.length} unité(s),
        ${nbAcquis} acquise(s)</span></td>
    </tr>` + lignes.map(x => `
    <tr>
      <td>${x.ue_num}</td>
      <td>${esc(x.ue_nom || '')}</td>
      <td>${x.mode}</td>
      <td style="text-align:right;white-space:nowrap">${
        x.points != null ? x.points + ' / 20' : '—'}</td>
    </tr>`).join('');
    }).join('');
  })();

  // Dates d'organisation : l'étudiant doit savoir quand son UE commence et se
  // termine — ces dates commandent aussi son délai de paiement.
  const datesOrg = Object.fromEntries(db.prepare(`
    SELECT ue_num, MIN(date_debut) AS date_debut, MAX(date_fin) AS date_fin
    FROM organisation_ue WHERE annee_scolaire = ? GROUP BY ue_num
  `).all(annee).map(o => [o.ue_num, o]));

  // Droit d'inscription, calculé sur le programme de l'année
  const di = calculerDI(etudId, annee);
  const dis = calculerDIS(etudId, annee);
  const eur = n => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
  const parUe = Object.fromEntries((di?.detail || []).map(d => [d.ue_num, d]));

  // Deux lignes par UE : l'intitulé sur toute la largeur, les valeurs dessous.
  // Dix colonnes sur une seule ligne écrasaient l'intitulé, qui est pourtant ce
  // que l'étudiant lit en premier. La légende reste écrite UNE fois en tête :
  // la répéter à chaque UE aurait triplé la hauteur du tableau pour une
  // information constante.
  const lignesInsc = inscriptions.map(i => {
    const sit = situationDe(i.ue_num);
    const sr = sit.etat === 'sous_reserve' ? sit.chaine : null;
    const d = parUe[i.ue_num];
    // Réinscription à une UE déjà acquise : la circulaire l'admet sur décision
    // du Conseil des études, mais c'est le plus souvent le vestige d'un
    // programme calculé avant l'encodage des résultats. On le signale.
    const dejaAcquise = acquisRows.find(a => a.ue_num === i.ue_num);

    const alerte = sit.etat === 'impossible'
      ? (sit.epreuve
          ? ' <b style="color:#B91C1C">— épreuve intégrée : ' + sit.chaine.length
            + ' unité(s) des années antérieures non acquise(s)</b>'
          : ' <b style="color:#B91C1C">— exige la réussite de l\u2019UE ' + sit.chaine.join(', ') + '</b>')
      : '';

    const dates = (() => {
      const o = datesOrg[i.ue_num];
      if (!o?.date_debut && !o?.date_fin) return ['—', ''];
      const j = v => v ? String(v).slice(0, 10).split('-').reverse().join('/') : '…';
      return [j(o.date_debut), j(o.date_fin)];
    })();

    return `
    <tr class="ue-titre">
      <td colspan="7">
        <span class="ue-num">${i.ue_num}</span>
        <b>${esc(i.ue_nom || '')}</b>${i.codiplomation_ch ? ' <b>(CH)</b>' : ''}${
        sr ? ' <i>(sous réserve de la réussite de l\u2019UE ' + sr.join(', ') + ')</i>' : ''}${
        dejaAcquise ? ' <b style="color:#B45309">— déjà acquise en '
          + esc(dejaAcquise.annee_scolaire || '') + '</b>' : ''}${alerte}
      </td>
    </tr>
    <tr class="ue-valeurs">
      <td>${esc(i.date_inscription || '')}</td>
      <td>${i.admission_type === 'titre' ? 'Titre' : i.admission_type === 'test' ? 'Test' : '—'}</td>
      <td>${d?.dispensee ? 'Dispense complète' : (i.dispense_complete ? 'Dispense complète' : '—')}</td>
      <td style="text-align:center;white-space:nowrap">${dates[0]}${dates[1] ? ' <span style="color:#94a3b8">→ ' + dates[1] + '</span>' : ''}</td>
      <td style="text-align:right;white-space:nowrap">${d ? d.periodes_brutes : '—'}${
        d?.porte_forfait ? ' <span style="color:#C9A84C" title="Cette UE porte le forfait annuel">◆</span>' : ''}</td>
      <td style="text-align:right;white-space:nowrap">${d && !d.dispensee ? eur(d.montant) : '—'}</td>
      <td style="text-align:right">${i.ects != null ? i.ects : '—'}</td>
    </tr>`;
  }).join('');

  // Pied du tableau : forfait, puis total
  const piedDI = di && di.detail.length ? `
    <tr class="tot">
      <td colspan="4" style="text-align:right">Forfait annuel${di.ue_forfait ? ` — porté par l'UE ${di.ue_forfait} ◆` : ''}</td>
      <td style="text-align:right">—</td>
      <td style="text-align:right">${eur(di.forfait)}</td><td></td>
    </tr>
    <tr class="tot">
      <td colspan="4" style="text-align:right"><b>Droit d'inscription — total</b></td>
      <td style="text-align:right"><b>${di.periodes.total}</b></td>
      <td style="text-align:right"><b>${di.exonere ? '0,00 € (exonéré)' : eur(di.montant_arrondi)}</b></td>
      <td style="text-align:right"><b>${(() => {
        // Le total des crédits : c'est le chiffre que l'étudiant retient.
        const t = inscriptions.reduce((s, x) => s + (Number(x.ects) || 0), 0);
        return t || '—';
      })()}</b></td></tr>
    ${di.plafond_atteint ? `<tr><td colspan="7" style="font-size:10px;color:#64748b">
      Plafond de ${di.bareme.plafond_periodes} périodes atteint : ${di.retenues.secondaire + di.retenues.superieur}
      période(s) facturée(s) sur ${di.periodes.total}, le secondaire étant compté en premier.</td></tr>` : ''}
    ${di.exonere ? `<tr><td colspan="7" style="font-size:10px;color:#065f46">
      Exonération du droit d'inscription${di.motif ? ' — motif enregistré' : ''}.</td></tr>` : ''}
    ${dis && dis.soumis ? `<tr class="tot"><td colspan="5" style="text-align:right">
      Droit d'inscription spécifique (${dis.periodes_hebdo} pér./sem.)</td>
      <td style="text-align:right"><b>${eur(dis.montant_du)}</b></td><td></td></tr>` : ''}
  ` : '';

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>Fiche d'inscription — ${esc(e.nom)} ${esc(e.prenom)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1B2B4B; margin: 32px; }
  h1 { font-size: 17px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 18px 0 6px; }
  .etab { font-size: 13px; font-weight: 600; }
  .meta { color: #556; margin-bottom: 14px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 7px; text-align: left; }
  th { background: #f1f5f9; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  tr.tot td { background: #f8fafc; font-size: 11px; }
  .alerte { background: #FEF3C7; border: 1px solid #FCD34D; color: #92400E;
            padding: 7px 10px; border-radius: 6px; font-size: 11px; margin: 10px 0; }
  .alerte.grave { background: #FEE2E2; border-color: #FCA5A5; color: #991B1B; }
  .sig { margin-top: 34px; display: flex; gap: 60px; }
  .sig div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 11px; }
  .engagement { margin-top: 20px; padding: 10px 12px; border: 1px solid #cbd5e1;
                border-radius: 6px; background: #f8fafc; font-size: 10.5px; line-height: 1.5; }
  .engagement p { margin: 0 0 6px; }
  .engagement p:last-child { margin-bottom: 0; }
  .engagement .rgpd { font-size: 9.5px; color: #475569; border-top: 1px solid #cbd5e1;
                      padding-top: 6px; }
  .sig .mention { display: block; font-size: 9px; color: #94a3b8; font-style: italic; }
  /* Sans largeurs explicites, le navigateur donnait autant de place aux
     colonnes vides qu'aux intitulés, qui s'écrasaient sur six lignes. */
  table.ues { table-layout: fixed; }
  /* Sept colonnes désormais : l'intitulé occupe sa propre ligne au-dessus. */
  table.ues th:nth-child(1), table.ues td:nth-child(1) { width: 15%; }
  table.ues th:nth-child(2), table.ues td:nth-child(2) { width: 12%; }
  table.ues th:nth-child(3), table.ues td:nth-child(3) { width: 17%; }
  table.ues th:nth-child(4), table.ues td:nth-child(4) { width: 22%; }
  table.ues th:nth-child(5), table.ues td:nth-child(5) { width: 11%; }
  table.ues th:nth-child(6), table.ues td:nth-child(6) { width: 15%; }
  table.ues th:nth-child(7), table.ues td:nth-child(7) { width: 8%; }
  table.ues td { word-wrap: break-word; }

  /* Deux niveaux de ligne : l'intitulé porte le filet supérieur, les valeurs
     s'y rattachent sans se séparer d'elles à la pagination. */
  table.ues tr.ue-titre td {
    border-top: 0.6pt solid #94a3b8; border-bottom: 0;
    padding-top: 1.8mm; padding-bottom: 0.4mm; font-size: 9pt;
  }
  table.ues tr.ue-titre .ue-num {
    display: inline-block; min-width: 9mm; margin-right: 1.5mm;
    padding: 0.2mm 1.2mm; border-radius: 1mm;
    background: #1B2B4B; color: #fff; font-size: 7.5pt; text-align: center;
  }
  table.ues tr.ue-valeurs td {
    border-top: 0; padding-top: 0.4mm; padding-bottom: 1.8mm;
    font-size: 8.5pt; color: #334155;
  }
  /* Le couple intitulé + valeurs ne doit pas se scinder d'une page à l'autre. */
  table.ues tr.ue-titre { break-after: avoid; page-break-after: avoid; }
  table.ues tr.ue-valeurs { break-before: avoid; page-break-before: avoid; }

  .section-insc { margin: 0 0 2mm; font-size: 9pt; color: #334155; }

  /* Le rang d'année ouvre chaque groupe du parcours antérieur. */
  tr.annee-groupe td {
    background: #f1f5f9; border-top: 0.6pt solid #94a3b8;
    padding-top: 1.4mm; padding-bottom: 1.4mm; font-size: 9pt;
  }
  tr.annee-groupe { break-after: avoid; page-break-after: avoid; }

  /* « 10 / 20 » se cassait en deux lignes. */
  .nowrap, td.num { white-space: nowrap; }

  /* Un bloc de signature coupé en deux pages n'a aucune valeur. */
  .engagement, .sig { break-inside: avoid; page-break-inside: avoid; }
  .engagement { break-before: auto; }

  .footer { margin-top: 22px; font-size: 10px; color: #64748b; }
  /* Marge basse à zéro : elle s'ajouterait au flux et pousserait une page
     blanche. La réserve du pied est déjà faite par @page. */
  @media print { body { margin: 12mm 12mm 0; } }

  /* La marge basse réserve la hauteur du pied : sans elle, le texte passerait
     dessous en fin de page. */
  ${reglesDePage({ haut: 14, cote: 14 })}

  /* Pied de page commun, ancré en bas de CHAQUE page — dernière comprise.
     Un pied placé dans le flux, ou en table-footer-group, flotte au milieu
     d'une dernière page à moitié vide. */
  ${piedStyles()}
</style></head><body>
<div class="etab">${esc(etab)} — Enseignement pour Adultes</div>
<h1>Fiche d'inscription / reçu — ${esc(annee)}</h1>
<div class="meta">
  ${esc(e.titre || '')} <b>${esc(e.nom)} ${esc(e.prenom)}</b>
  ${e.date_naissance ? ' · né(e) le ' + esc(e.date_naissance) : ''}
  ${e.num_national ? ' · RN ' + esc(e.num_national) : ''}<br>
  ${esc([e.adresse, e.cp, e.localite].filter(Boolean).join(', '))}
  ${e.email_ecole ? ' · ' + esc(e.email_ecole) : ''}
</div>

${acquisRows.length || autres.length ? `
<h2>Parcours antérieur au sein de l'établissement</h2>
<table>
  <thead><tr><th>UE</th><th>Intitulé</th><th>Mode d'acquisition</th>
    <th style="text-align:right">Note</th></tr></thead>
  <tbody>${parcoursAnterieur}</tbody>
</table>` : ''}

${(() => {
  const dejaVues = inscriptions.filter(i => acquisRows.some(a => a.ue_num === i.ue_num));
  const impossibles = inscriptions
    .map(i => ({ i, s: situationDe(i.ue_num) }))
    .filter(x => x.s.etat === 'impossible');
  let html = '';
  if (impossibles.length) {
    html += `<div class="alerte grave">
      <b>${impossibles.length} inscription(s) impossible(s)</b> : les prérequis ne sont pas acquis.
      ${impossibles.map(x => x.s.epreuve
          ? 'UE ' + x.i.ue_num + ' — épreuve intégrée, ' + x.s.chaine.length + ' unité(s) non acquise(s)'
          : 'UE ' + x.i.ue_num + ' exige ' + x.s.chaine.join(', ')).join(' · ')}.
      Une inscription conditionnelle ne vaut qu'entre unités d'une même année d'études, inscrites
      ensemble ; l'épreuve intégrée, elle, ne s'ouvre que si toutes les unités des années
      antérieures sont acquises — à défaut, seule une décision du Conseil des études la justifie. Retirez-les depuis l'onglet PAE avant de remettre ce document — elles gonflent
      également le droit d'inscription.
    </div>`;
  }
  if (dejaVues.length) {
    html += `<div class="alerte">
      <b>${dejaVues.length} unité(s) d'enseignement déjà acquise(s)</b> figurent à cette inscription
      (UE ${dejaVues.map(i => i.ue_num).join(', ')}). Une réinscription suppose une décision favorable
      du Conseil des études.
    </div>`;
  }
  return html;
})()}

<h2>Unités d'enseignement — inscription ${esc(annee)}</h2>
${(() => {
  // La section appartient à l'en-tête : on inscrit DANS une section, elle ne
  // varie pas d'une ligne à l'autre. Sauf pour l'étudiant inscrit dans
  // plusieurs, cas qui existe et qu'il faut alors énoncer.
  const secs = [...new Set(inscriptions.map(i => i.section).filter(Boolean))];
  if (!secs.length) return '';
  return `<p class="section-insc">${secs.length > 1 ? 'Sections' : 'Section'} :
    <b>${secs.map(esc).join(' · ')}</b></p>`;
})()}
<table class="ues">
  <thead><tr>
    <th>Date d'inscription</th><th>Admission</th><th>Valorisation</th>
    <th style="text-align:center">Dates</th><th style="text-align:right">Périodes</th>
    <th style="text-align:right">Droit d'inscription</th><th style="text-align:right">ECTS</th>
  </tr></thead>
  <tbody>${lignesInsc ? lignesInsc + piedDI : '<tr><td colspan="7" style="text-align:center;color:#94a3b8">Aucune UE inscrite pour cette année — encodez les inscriptions dans la grille de parcours</td></tr>'}</tbody>
</table>

<!-- Engagement de l'étudiant. L'article 39 du règlement des études n'admet
     comme signature qu'un tracé manuscrit ou un procédé électronique
     authentifié : le document doit être signé, non approuvé par courriel. -->
<div class="engagement">
  <p>
    Je soussigné(e) <b>${esc([e.titre, e.prenom, e.nom].filter(Boolean).join(' '))}</b>
    confirme mon inscription aux <b>${inscriptions.length}</b> unité(s) d'enseignement
    reprises ci-dessus, et signe pour chacune d'elles.
  </p>
  <p>
    Je reconnais avoir pris connaissance du règlement des études et du règlement d'ordre
    intérieur, et m'engage à les respecter, ainsi qu'à m'acquitter du droit d'inscription
    dans les délais prévus.
  </p>
  <p class="rgpd">
    <b>Protection des données.</b> Conformément au Règlement général sur la protection des
    données, les informations recueillies servent uniquement à la gestion du dossier
    administratif, à des fins pédagogiques et statistiques, et à leur transmission à la
    Fédération Wallonie-Bruxelles dans le cadre du financement de l'enseignement. Elles ne
    sont communiquées à aucun tiers, hormis la Fédération dans le cadre de ses missions
    légales. Vous pouvez accéder aux données vous concernant et en demander la correction
    auprès du secrétariat. <i>Règlement des études, article 108.</i>
  </p>
</div>

<div class="sig">
  <div>
    Signature de l'apprenant
    <span class="mention">précédée de la mention « lu et approuvé »</span>
  </div>
  <div>Pour l'établissement</div>
</div>
<div class="footer">
  Mention « CH » : UE suivie dans le cadre d'un programme d'études en codiplômation.
  « Sous réserve » : l'accès effectif dépend de la réussite de l'UE prérequise organisée la même année.
  Document imprimé le ${new Date().toLocaleDateString('fr-BE')} — ${esc(etab)}.
</div>

${piedBalisage(LOGO_IIP_JPEG)}
</body></html>`;

  res.json({ html, nom: 'fiche_inscription_' + (e.nom || 'etudiant') + '_' + annee + '.html' });
});

// ── Ajouter un étudiant manuellement ─────────────────────────────────────────
// ── Modification du signalétique ────────────────────────────────────────────
// Rien ne permettait de corriger une adresse ou d'ajouter un lieu de naissance :
// on pouvait créer un étudiant, jamais le rectifier.
const CHAMPS_ETUDIANT = ['id_ecampus', 'nom', 'prenom', 'titre', 'date_naissance',
  'lieu_naissance', 'nationalite', 'num_national', 'email_ecole', 'email_perso',
  'gsm', 'adresse', 'cp', 'localite', 'actif'];

r.patch('/:id', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint',
        'editeur', 'secretariat'), (req, res) => {
  const etudId = Number(req.params.id);
  const avant = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!avant) return res.status(404).json({ error: 'étudiant introuvable' });

  const presents = CHAMPS_ETUDIANT.filter(k => k in (req.body || {}));
  if (!presents.length) return res.json({ ok: true, inchange: true });

  // Le numéro national identifie la personne : un doublon rendrait tout
  // rapprochement d'historique impossible.
  if (presents.includes('num_national') && req.body.num_national) {
    const norm = String(req.body.num_national).replace(/[^0-9]/g, '');
    const autre = db.prepare(`
      SELECT id, nom, prenom FROM etudiant
      WHERE id <> ? AND REPLACE(REPLACE(REPLACE(COALESCE(num_national,''),'.',''),'-',''),' ','') = ?
    `).get(etudId, norm);
    if (autre) {
      return res.status(400).json({
        error: `Ce numéro national est déjà celui de ${autre.nom} ${autre.prenom}. `
             + `Deux dossiers ne peuvent pas le partager.`,
      });
    }
  }

  db.prepare(`UPDATE etudiant SET ${presents.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
    .run(...presents.map(k => req.body[k] ?? null), etudId);

  res.json({ ok: true, modifies: presents });
});

// ── Complément de dossier par numéro national ───────────────────────────────
// Les listes officielles portent des données que Lucie n'a pas — lieu de
// naissance, adresse à jour. Le rapprochement se fait sur le numéro national,
// seul identifiant stable : eCampus réattribue les matricules chaque rentrée.
r.post('/completer', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint',
       'editeur', 'secretariat'), (req, res) => {
  const { lignes, simulation } = req.body || {};
  if (!Array.isArray(lignes)) return res.status(400).json({ error: 'lignes requises' });

  const norm = v => String(v || '').replace(/[^0-9]/g, '');
  const parRN = {};
  for (const e of db.prepare('SELECT id, nom, prenom, num_national FROM etudiant').all()) {
    const n = norm(e.num_national);
    if (n) parRN[n] = e;
  }

  const COMPLETABLES = ['lieu_naissance', 'nationalite', 'date_naissance', 'adresse',
                        'cp', 'localite', 'gsm', 'email_perso', 'email_ecole',
                        'titre', 'id_ecampus'];

  const rapport = { retrouves: 0, inconnus: [], modifications: [], champs: {} };

  const appliquer = db.transaction(() => {
    for (const l of lignes) {
      const n = norm(l.num_national);
      if (!n) continue;
      const e = parRN[n];
      if (!e) { rapport.inconnus.push({ num_national: l.num_national, nom: l.nom }); continue; }
      rapport.retrouves++;

      const actuel = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(e.id);
      const maj = {};
      for (const k of COMPLETABLES) {
        const v = l[k];
        if (v == null || String(v).trim() === '') continue;
        // On COMPLÈTE : une valeur déjà présente n'est pas écrasée, sauf
        // demande explicite. Une liste importée n'est pas plus fiable que ce
        // qu'un secrétariat a corrigé à la main.
        if (actuel[k] != null && String(actuel[k]).trim() !== '' && !l.__ecraser) continue;
        maj[k] = String(v).trim();
        rapport.champs[k] = (rapport.champs[k] || 0) + 1;
      }
      if (!Object.keys(maj).length) continue;

      rapport.modifications.push({
        id: e.id, nom: actuel.nom, prenom: actuel.prenom, champs: Object.keys(maj),
      });
      if (!simulation) {
        db.prepare(`UPDATE etudiant SET ${Object.keys(maj).map(k => `${k} = ?`).join(', ')}
                    WHERE id = ?`).run(...Object.values(maj), e.id);
      }
    }
    if (simulation) throw new Error('SIMULATION');
  });

  try { appliquer(); } catch (e) {
    if (e.message !== 'SIMULATION') return res.status(500).json({ error: e.message });
  }

  res.json({
    ok: true, simulation: !!simulation,
    lignes_lues: lignes.length,
    ...rapport,
    inconnus: rapport.inconnus.slice(0, 30),
    nb_inconnus: rapport.inconnus.length,
  });
});

r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nom, prenom, annee, ue_nums, ...rest } = req.body;
  if (!nom || !prenom) return res.status(400).json({ error: 'nom et prenom requis' });

  const info = db.prepare(`
    INSERT INTO etudiant (nom, prenom, email_ecole, email_perso, date_naissance,
                         num_national, gsm, adresse, localite, cp, titre)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(nom, prenom, rest.email_ecole||null, rest.email_perso||null,
         rest.date_naissance||null, rest.num_national||null, rest.gsm||null,
         rest.adresse||null, rest.localite||null, rest.cp||null, rest.titre||null);

  const id = Number(info.lastInsertRowid);

  // Inscriptions initiales
  if (annee && Array.isArray(ue_nums)) {
    const ins = db.prepare(
      'INSERT OR IGNORE INTO etudiant_inscription (etudiant_id,annee_scolaire,ue_num) VALUES (?,?,?)'
    );
    for (const n of ue_nums) ins.run(id, annee, Number(n));
  }

  res.json({ ok: true, id });
});

// ── Import depuis le fichier eCampus Excel ───────────────────────────────────
// Le frontend lit le fichier XLS/XLSX avec SheetJS et envoie les données en JSON.
// La colonne Code_UE contient directement le ue_num Lucie.
r.post('/import-excel', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  const { annee, etudiants: etudiantsData, inscriptions: inscriptionsData } = req.body;
  if (!annee || !Array.isArray(etudiantsData)) {
    return res.status(400).json({ error: 'annee et etudiants requis' });
  }

  try {
    const insEtud = db.prepare(`
      INSERT INTO etudiant (id_ecampus,nom,prenom,email_ecole,email_perso,
        date_naissance,num_national,gsm,adresse,localite,cp,titre)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id_ecampus) DO UPDATE SET
        nom=excluded.nom, prenom=excluded.prenom,
        email_ecole=excluded.email_ecole, email_perso=excluded.email_perso
    `);
    const insInsc = db.prepare(`
      INSERT OR IGNORE INTO etudiant_inscription (etudiant_id,annee_scolaire,ue_num,groupe)
      SELECT id,?,?,? FROM etudiant WHERE id_ecampus=? LIMIT 1
    `);

    let etudiants_crees=0, inscriptions_creees=0;
    const tx = db.transaction(() => {
      for (const e of etudiantsData) {
        const r = insEtud.run(e.id_ecampus||null, e.nom||'', e.prenom||'',
          e.email_ecole||null, e.email_perso||null, e.date_naissance||null,
          e.num_national||null, e.gsm||null, e.adresse||null,
          e.localite||null, e.cp||null, e.titre||null);
        if (r.changes) etudiants_crees++;
      }
      for (const i of inscriptionsData) {
        if (!i.ue_num || isNaN(Number(i.ue_num))) continue;
        const r = insInsc.run(annee, Number(i.ue_num), i.groupe||null, i.id_ecampus);
        if (r.changes) inscriptions_creees++;
      }
    });
    tx();

    res.json({ ok:true, etudiants: etudiantsData.length, etudiants_crees,
               inscriptions: inscriptionsData.length, inscriptions_creees, annee });
  } catch(e) {
    console.error('Import étudiants:', e);
    res.status(500).json({ error: e.message });
  }
});


export default r;

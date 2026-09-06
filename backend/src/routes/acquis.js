// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Acquis d'apprentissage : pondérations et calcul de la note d'UE
//
// En enseignement pour adultes, la note d'une UE se détermine à partir des
// acquis d'apprentissage, pas des cours pris globalement. Chaque AA porte deux
// poids :
//
//   · sa pondération DANS son cours (0 à 100 ; la somme fait 100 par cours) ;
//   · le poids de son cours, égal aux périodes prévues au dossier pédagogique,
//     part d'autonomie exclue.
//
//   note UE (%) =  Σ ( note_AA × pondération_AA × périodes_cours )
//                 ─────────────────────────────────────────────────
//                  Σ ( 100     × pondération_AA × périodes_cours )
//
// Un même AA peut figurer dans deux cours : il compte alors deux fois, avec la
// pondération et les périodes propres à chaque cours. Sa note est donc stockée
// PAR COURS, jamais globalement.
//
// Un AA non évalué (dispense accordée, activité non organisée) sort du
// numérateur ET du dénominateur : il ne pénalise pas l'étudiant.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { anneeDeTravail, anneeActiveEnBase } from '../helpers/annee.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { envelopperDocument } from '../lib/document.js';
import { SIGNATURE_SOHET, SCEAU_IIP } from '../services/assets/signature_sohet.js';
import { identiteEtablissement } from './config.js';

const r = Router();

export function migrerAA(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS aa_ponderation (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ue_num      INTEGER NOT NULL,
      cours_code  TEXT NOT NULL,
      aa_code     TEXT NOT NULL,
      poids       REAL NOT NULL DEFAULT 0,
      maj_le      TEXT DEFAULT (datetime('now')),
      UNIQUE(cours_code, aa_code)
    );
    CREATE INDEX IF NOT EXISTS idx_aa_pond_ue ON aa_ponderation(ue_num);

    -- Résultat par COURS, tel que délibéré par le Conseil des études.
    -- La faveur est une réussite accordée par le jury : elle se trace, car
    -- elle ne s'accorde pas deux fois au même étudiant.
    CREATE TABLE IF NOT EXISTS etudiant_resultat_cours (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL,
      ue_num         INTEGER,
      cours_code     TEXT NOT NULL,
      statut         TEXT NOT NULL,        -- reussi | refuse | non_presente | va | vp
      note           REAL,                 -- sur 20, quand elle est connue
      faveur         INTEGER NOT NULL DEFAULT 0,
      commentaire    TEXT,
      cree_le        TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, annee_scolaire, cours_code)
    );
    CREATE INDEX IF NOT EXISTS idx_res_cours_etud
      ON etudiant_resultat_cours(etudiant_id, annee_scolaire);

    -- Commentaire du Conseil des études, par étudiant et par année.
    CREATE TABLE IF NOT EXISTS etudiant_commentaire_ce (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL,
      texte          TEXT,
      maj_le         TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, annee_scolaire)
    );

    CREATE TABLE IF NOT EXISTS etudiant_report_note (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL,        -- année où le report s'applique
      ue_num         INTEGER NOT NULL,
      cours_code     TEXT NOT NULL,
      note           REAL NOT NULL,        -- note reportée, sur 20
      annee_origine  TEXT,                 -- année où le cours a été validé
      decision_ce    TEXT,
      cree_le        TEXT DEFAULT (datetime('now')),
      UNIQUE(etudiant_id, annee_scolaire, ue_num, cours_code)
    );

    CREATE TABLE IF NOT EXISTS cours_ponderation (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ue_num      INTEGER NOT NULL,
      cours_code  TEXT NOT NULL,
      poids       REAL NOT NULL DEFAULT 0,
      maj_le      TEXT DEFAULT (datetime('now')),
      UNIQUE(ue_num, cours_code)
    );
    `);

    // La note d'un AA se rattache au cours dans lequel il est évalué.
    const cols = dbx.prepare('PRAGMA table_info(etudiant_note_detail)').all().map(c => c.name);
    if (!cols.includes('cours_code')) {
      dbx.exec('ALTER TABLE etudiant_note_detail ADD COLUMN cours_code TEXT');
      console.log('[migration] etudiant_note_detail.cours_code ajoutée');
    }
    if (!cols.includes('non_evalue')) {
      dbx.exec('ALTER TABLE etudiant_note_detail ADD COLUMN non_evalue INTEGER NOT NULL DEFAULT 0');
      console.log('[migration] etudiant_note_detail.non_evalue ajoutée');
    }
    console.log('[migration] aa_ponderation créée');
  } catch (e) { console.error('[migration] aa :', e.message); }
}

// Le poids d'un cours dans son UE est un pourcentage explicite : les poids
// des cours d'une UE totalisent 100. Il découle des périodes du dossier
// pédagogique, mais reste saisi — l'arrondi retenu par le Conseil des études
// n'est pas toujours celui d'un calcul (42 / 31 / 27, par exemple).

/**
 * Structure d'évaluation d'une UE : ses cours, leurs AA, les pondérations et
 * les périodes. Sert au calcul comme à l'écran de paramétrage.
 */
export function structureUE(ueNum, annee) {
  const anneeRef = annee
    || anneeActiveEnBase();

  let cours = db.prepare(`
    SELECT cours_code, cours_nom, cours_per FROM cours
    WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_code
  `).all(ueNum, anneeRef);
  if (!cours.length) {
    cours = db.prepare(`
      SELECT cours_code, MIN(cours_nom) AS cours_nom, MAX(cours_per) AS cours_per
      FROM cours WHERE ue_num = ? GROUP BY cours_code ORDER BY cours_code
    `).all(ueNum);
  }

  const aas = db.prepare(
    'SELECT aa_code, aa_num, cours_code, description FROM aa WHERE ue_num = ? ORDER BY aa_num'
  ).all(ueNum);

  const pond = {};
  for (const p of db.prepare('SELECT cours_code, aa_code, poids FROM aa_ponderation WHERE ue_num = ?').all(ueNum)) {
    pond[p.cours_code + '|' + p.aa_code] = Number(p.poids);
  }
  // Le poids d'un cours dans son UE se DÉDUIT de ses périodes, part
  // d'autonomie exclue : poids = périodes du cours ÷ périodes de l'UE.
  // Il n'est jamais saisi. Les décimales sont conservées pour le calcul ;
  // seul l'affichage arrondit à l'unité.
  const totalPeriodes = cours.reduce((s, x) => s + Number(x.cours_per || 0), 0);
  const poidsCours = {};
  for (const x of cours) {
    poidsCours[x.cours_code] = totalPeriodes
      ? (Number(x.cours_per || 0) / totalPeriodes) * 100
      : null;
  }

  // La pondération EXPLICITE l'emporte, quand elle existe. Les classeurs de
  // suivi la portent pour 2024-2025 et 2025-2026 : elle ne coïncide pas avec
  // la répartition des périodes — l'UE 248 pèse 47/31/22 alors que ses cours
  // n'ont pas ce rapport de périodes. À partir de 2026-2027, les périodes du
  // dossier pédagogique font foi, et cette table reste vide.
  try {
    for (const p of db.prepare(
      'SELECT cours_code, poids FROM cours_ponderation WHERE ue_num = ?').all(ueNum)) {
      if (p.poids != null) poidsCours[p.cours_code] = Number(p.poids);
    }
  } catch { /* table absente : on s'en tient aux périodes */ }

  return cours.map(c => {
    const siens = aas.filter(a => a.cours_code === c.cours_code).map(a => ({
      ...a, poids: pond[c.cours_code + '|' + a.aa_code] ?? null,
    }));
    const somme = siens.reduce((s, a) => s + (a.poids || 0), 0);
    return {
      ...c,
      periodes: Number(c.cours_per || 0),
      poids_cours: poidsCours[c.cours_code] ?? null,
      poids_cours_affiche: poidsCours[c.cours_code] != null
        ? Math.round(poidsCours[c.cours_code]) : null,
      aas: siens,
      somme_poids: Math.round(somme * 100) / 100,
      complet: siens.length > 0 && Math.abs(somme - 100) < 0.01,
    };
  });
}

/**
 * Note d'une UE pour un étudiant, calculée depuis ses notes d'AA.
 * notes : { 'cours_code|aa_code': { points, non_evalue } }
 */
export function calculerNoteUE(ueNum, annee, notes, reports = {}) {
  const structure = structureUE(ueNum, annee);
  let numerateur = 0, maximum = 0;
  let evalues = 0, attendus = 0;

  for (const c of structure) {
    const pc = c.poids_cours;
    if (!pc) continue;                              // poids du cours non encodé

    // Report de note : le cours a été validé lors d'une session antérieure
    // alors que l'UE échouait. Sa note est reprise telle quelle et ses acquis
    // ne sont pas réévalués.
    const rn = reports[c.cours_code];
    if (rn != null) {
      attendus++; evalues++;
      numerateur += Number(rn) * pc;
      maximum    += 20 * pc;
      continue;
    }

    for (const a of c.aas) {
      if (!a.poids) continue;                       // pondération de l'AA non encodée
      attendus++;
      const n = notes[c.cours_code + '|' + a.aa_code];
      if (!n || n.non_evalue || n.points == null || n.points === '') continue;
      evalues++;
      const facteur = a.poids * pc;                 // pondération dans le cours × poids du cours
      numerateur += Number(n.points) * facteur;
      maximum    += 20 * facteur;                   // les acquis sont cotés sur 20
    }
  }

  if (!maximum) return { sur20: null, sur20_exact: null, pourcentage: null, evalues, attendus, complet: false };
  // Le calcul garde toutes ses décimales ; l'affichage arrondit à l'unité.
  const exact = (numerateur / maximum) * 20;
  return {
    sur20: Math.round(exact),
    sur20_exact: Math.round(exact * 1000) / 1000,
    pourcentage: Math.round(exact * 5),
    evalues, attendus,
    complet: evalues === attendus && attendus > 0,
  };
}

// Note d'un cours pour un étudiant — utile à l'affichage et aux dispenses.
export function calculerNoteCours(cours, notes) {
  let num = 0, max = 0, evalues = 0;
  for (const a of cours.aas) {
    if (!a.poids) continue;
    const n = notes[cours.cours_code + '|' + a.aa_code];
    if (!n || n.non_evalue || n.points == null || n.points === '') continue;
    evalues++;
    num += Number(n.points) * a.poids;
    max += 20 * a.poids;
  }
  if (!max) return { sur20: null, sur20_exact: null, evalues };
  const exact = (num / max) * 20;
  return { sur20: Math.round(exact), sur20_exact: Math.round(exact * 1000) / 1000, evalues };
}

/**
 * Notes de cours d'un étudiant pour une UE, année par année.
 * Sert à repérer les cours validés dans une UE non réussie : ce sont eux qui
 * ouvrent droit à un report de note.
 */
export function coursValidesAnterieurs(etudId, ueNum, anneeCible) {
  const lignes = db.prepare(`
    SELECT annee_scolaire, code, cours_code, points, non_evalue
    FROM etudiant_note_detail
    WHERE etudiant_id = ? AND ue_num = ? AND type = 'aa' AND annee_scolaire < ?
  `).all(etudId, ueNum, anneeCible);
  if (!lignes.length) return [];

  // Résultat de l'UE par année : un report ne se justifie que si l'UE a échoué
  const resultats = {};
  for (const i of db.prepare(`
    SELECT annee_scolaire, resultat FROM etudiant_inscription
    WHERE etudiant_id = ? AND ue_num = ?
  `).all(etudId, ueNum)) {
    resultats[i.annee_scolaire] = i.resultat;
  }

  const parAnnee = {};
  for (const l of lignes) (parAnnee[l.annee_scolaire] = parAnnee[l.annee_scolaire] || []).push(l);

  const candidats = [];
  for (const [an, lg] of Object.entries(parAnnee)) {
    if (resultats[an] === 'reussi') continue;          // UE réussie : rien à reporter
    const structure = structureUE(ueNum, an);
    const notes = {};
    for (const l of lg) {
      const brut = String(l.code).includes('|') ? String(l.code).split('|')[1] : l.code;
      const cc = l.cours_code
        || structure.find(c => c.aas.some(a => a.aa_code === brut))?.cours_code;
      if (cc) notes[cc + '|' + brut] = { points: l.points, non_evalue: l.non_evalue };
    }
    for (const co of structure) {
      const n = calculerNoteCours(co, notes);
      if (n.sur20_exact != null && n.sur20_exact >= 10) {
        candidats.push({
          annee_origine: an, cours_code: co.cours_code, cours_nom: co.cours_nom,
          note: n.sur20_exact, note_affichee: n.sur20,
        });
      }
    }
  }
  // La session la plus récente prime pour un même cours
  const parCours = {};
  for (const c0 of candidats.sort((a, b) => a.annee_origine.localeCompare(b.annee_origine))) {
    parCours[c0.cours_code] = c0;
  }
  return Object.values(parCours);
}

// ── Motivation d'une décision d'ajournement ou de refus ────────────────────
// Annexes 8 et 9 de la circulaire « Sanction des études ». Ce ne sont pas des
// attestations mais des MOTIVATIONS : leur cœur est un tableau où chaque acquis
// non maîtrisé reçoit sa justification. Le décret l'exige, et une décision non
// motivée est attaquable.
//
// L'ÉCHEC SE DÉDUIT des notes : les acquis sont encodés un à un, inutile de les
// faire cocher. Seul le motif reste à écrire.
(function migrer() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS decision_motivation (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        etudiant_id    INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        ue_num         INTEGER NOT NULL,
        aa_code        TEXT    NOT NULL,
        motif          TEXT,
        maj_le         TEXT DEFAULT CURRENT_TIMESTAMP,
        maj_par        TEXT,
        UNIQUE(etudiant_id, annee_scolaire, ue_num, aa_code)
      )`);
  } catch (e) { console.error('[motivation] migration', e.message); }
})();

/**
 * Les acquis d'une UE pour un étudiant, avec leur note et leur motif.
 *
 * Le seuil de maîtrise est celui du RDE : 10/20 (art. 78). Un acquis non évalué
 * est signalé comme tel — c'est différent d'un échec, et le confondre serait
 * motiver un refus sur une absence d'évaluation.
 */
r.get('/motivation/:etudId/:ueNum', authRequired, (req, res) => {
  const etudId = Number(req.params.etudId);
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const insc = db.prepare(`
    SELECT resultat, points FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).get(etudId, annee, ueNum);

  const notes = {};
  for (const l of db.prepare(`
    SELECT code, points, non_evalue FROM etudiant_note_detail
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa'
  `).all(etudId, annee, ueNum)) {
    const brut = String(l.code).includes('|') ? String(l.code).split('|')[1] : l.code;
    notes[brut] = { points: l.points, non_evalue: l.non_evalue };
  }

  const motifs = Object.fromEntries(db.prepare(`
    SELECT aa_code, motif FROM decision_motivation
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).all(etudId, annee, ueNum).map(m => [m.aa_code, m.motif]));

  const SEUIL = 10;   // RDE, art. 78
  const acquis = structureUE(ueNum, annee).flatMap(co =>
    (co.aas || []).map(a => {
      const n = notes[a.aa_code];
      const evalue = n && !n.non_evalue && n.points != null;
      return {
        aa_code: a.aa_code, description: a.description,
        cours_code: co.cours_code, cours_nom: co.cours_nom,
        note: evalue ? n.points : null,
        non_evalue: !evalue,
        // Non maîtrisé : évalué et sous le seuil. Une absence d'évaluation
        // n'est PAS un échec.
        non_maitrise: evalue && n.points < SEUIL,
        motif: motifs[a.aa_code] || '',
      };
    }));

  res.json({
    annee, ue_num: ueNum, seuil: SEUIL,
    resultat: insc?.resultat || null,
    points: insc?.points ?? null,
    acquis,
    nb_non_maitrises: acquis.filter(a => a.non_maitrise).length,
    nb_non_evalues: acquis.filter(a => a.non_evalue).length,
    // Sans motif, la décision est attaquable : on le dit.
    sans_motif: acquis.filter(a => a.non_maitrise && !a.motif).length,
  });
});

r.put('/motivation', authRequired, roleRequired('admin', 'directeur',
      'directeur_adjoint', 'editeur'), (req, res) => {
  const { etudiant_id, annee_scolaire, ue_num, motifs } = req.body || {};
  if (!etudiant_id || !annee_scolaire || !ue_num || typeof motifs !== 'object') {
    return res.status(400).json({ error: 'étudiant, année, unité et motifs requis' });
  }
  const st = db.prepare(`
    INSERT INTO decision_motivation
      (etudiant_id, annee_scolaire, ue_num, aa_code, motif, maj_le, maj_par)
    VALUES (?,?,?,?,?, datetime('now'), ?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, aa_code) DO UPDATE SET
      motif = excluded.motif, maj_le = excluded.maj_le, maj_par = excluded.maj_par`);
  const qui = req.user?.email || req.user?.nom || null;

  db.transaction(() => {
    for (const [aa, motif] of Object.entries(motifs)) {
      st.run(etudiant_id, annee_scolaire, Number(ue_num), aa,
             String(motif || '').trim() || null, qui);
    }
  })();

  res.json({ ok: true, enregistres: Object.keys(motifs).length });
});

// ── Feuille de délibération d'une unité ────────────────────────────────────
// L'encodage rapide présente les UNITÉS en colonnes ; cette feuille présente
// les ACQUIS d'une seule unité, pour tous ses étudiants. C'est la vue du
// Conseil des études au moment de délibérer.
r.get('/feuille/:ueNum', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee;
  const session = req.query.session === '2' ? 2 : req.query.session === '1' ? 1 : null;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const perim = getUserSections(req.user);
  const ue = db.prepare(`
    SELECT ue_nom, section, ue_per_etudiants, ue_aut FROM ue
    WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(ueNum, annee) || {};
  if (perim && ue.section && !perim.includes(ue.section)) {
    return res.status(403).json({ error: 'unité hors de votre périmètre' });
  }

  const structure = structureUE(ueNum, annee);

  // Les acquis se prennent DIRECTEMENT dans la table, non à travers les cours.
  // structureUE les rattache par cours_code : un acquis sans cours renseigné
  // n'apparaissait sous aucun et disparaissait de la feuille — la pondération
  // et le rattachement sont des raffinements, l'acquis existe sans eux.
  const pondere = {};
  for (const co of structure) {
    for (const a of (co.aas || [])) {
      pondere[a.aa_code] = { poids: a.poids ?? null,
                             cours_code: co.cours_code, cours_nom: co.cours_nom };
    }
  }

  const acquis = db.prepare(`
    SELECT aa_code, aa_num, description, cours_code FROM aa
    WHERE ue_num = ? ORDER BY aa_num, aa_code
  `).all(ueNum).map(a => ({
    aa_code: a.aa_code,
    description: a.description,
    cours_code: pondere[a.aa_code]?.cours_code || a.cours_code || null,
    cours_nom: pondere[a.aa_code]?.cours_nom || null,
    poids: pondere[a.aa_code]?.poids ?? null,
  }));

  const etudiants = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus,
           i.resultat, i.resultat_s1, i.resultat_s2,
           i.points, i.points_s1, i.points_s2
    FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ?
    ORDER BY e.nom, e.prenom
  `).all(annee, ueNum);

  // Les notes par acquis, séparées par session. Le code porte « s1| » ou
  // « s2| » depuis l'import ; sans ce préfixe, la note vaut pour la session
  // qui fait foi.
  const notes = {};
  for (const l of db.prepare(`
    SELECT etudiant_id, code, points FROM etudiant_note_detail
    WHERE annee_scolaire = ? AND ue_num = ? AND type = 'aa'
  `).all(annee, ueNum)) {
    const parts = String(l.code).split('|');
    const sess = /^s[12]$/.test(parts[0]) ? parts[0] : null;
    const brut = parts.length > 1 ? parts[parts.length - 1] : l.code;
    ((notes[l.etudiant_id] ||= {})[sess || 'foi'] ||= {})[brut] = l.points;
  }

  // Les COURS de l'unité, avec leur poids et les acquis qui les composent.
  // Un même acquis peut peser dans plusieurs cours : la note par cours est
  // donc calculée cours par cours, non acquis par acquis.
  const cours = structure.map(co => ({
    cours_code: co.cours_code,
    cours_nom: co.cours_nom,
    poids: co.poids_cours ?? null,
    poids_affiche: co.poids_cours_affiche ?? null,
    periodes: co.periodes ?? null,
    acquis: (co.aas || [])
      .filter(a => a.poids)
      .map(a => ({ aa_code: a.aa_code, poids: a.poids })),
  })).filter(co => co.acquis.length);

  res.json({
    ue_num: ueNum, ue_nom: ue.ue_nom || `UE ${ueNum}`, section: ue.section || null,
    cours,
    annee, session,
    acquis,
    // Ce qui manque au référentiel, pour le dire à l'écran plutôt que de
    // laisser croire à une absence d'acquis.
    sans_ponderation: acquis.filter(a => a.poids == null).length,
    sans_cours: acquis.filter(a => !a.cours_code).length,
    etudiants: etudiants.map(e => ({
      id: e.id, nom: e.nom, prenom: e.prenom, matricule: e.id_ecampus,
      resultat: e.resultat, resultat_s1: e.resultat_s1, resultat_s2: e.resultat_s2,
      points: e.points, points_s1: e.points_s1, points_s2: e.points_s2,
      notes: notes[e.id] || {},
    })),
  });
});

// ── Enregistrer une note d'acquis ──────────────────────────────────────────
r.put('/feuille/note', authRequired,
      roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { etudiant_id, annee_scolaire, ue_num, aa_code, session, points,
          cours_code } = req.body || {};
  if (!etudiant_id || !annee_scolaire || !ue_num || !aa_code) {
    return res.status(400).json({ error: 'étudiant, année, unité et acquis requis' });
  }

  // Une note hors bornes ne vaut RIEN, pas zéro.
  const n = points == null || points === '' ? null
    : Number(String(points).replace(',', '.'));
  const note = (n != null && Number.isFinite(n) && n >= 0 && n <= 20) ? n : null;
  if (points != null && points !== '' && note == null) {
    return res.status(400).json({ error: 'note attendue entre 0 et 20' });
  }

  // Le code porte la SESSION puis le COURS : sans la session, la seconde
  // écraserait la première ; sans le cours, un acquis évalué dans deux cours
  // n'aurait qu'une note pour les deux, et la note de chaque cours serait
  // fausse. Les trois formes cohabitent — « aa », « cours|aa »,
  // « s1|cours|aa » — et la lecture prend la plus précise.
  const prefixe = session === 1 || session === 2 ? `s${session}|` : '';
  const code = prefixe + (cours_code ? `${cours_code}|${aa_code}` : aa_code);

  if (note == null) {
    db.prepare(`DELETE FROM etudiant_note_detail
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa' AND code = ?`)
      .run(etudiant_id, annee_scolaire, Number(ue_num), code);
  } else {
    db.prepare(`
      INSERT INTO etudiant_note_detail
        (etudiant_id, annee_scolaire, ue_num, type, code, points)
      VALUES (?,?,?, 'aa', ?, ?)
      ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
        points = excluded.points
    `).run(etudiant_id, annee_scolaire, Number(ue_num), code, note);
  }

  res.json({ ok: true });
});

/**
 * Poser la DÉCISION d'une unité, depuis la feuille de délibération.
 *
 * La route existante exige l'identifiant technique de l'inscription ; ici on
 * désigne la ligne par ce que le Conseil connaît — un étudiant, une année, une
 * unité. La cote est CONSERVÉE quel que soit le résultat : l'établissement doit
 * la connaître pour la seconde session, pour un recours, pour la délibération.
 * Ce que la circulaire écarte, c'est sa communication, pas son existence.
 */
r.put('/decision', authRequired,
      roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { etudiant_id, annee_scolaire, ue_num, resultat, points, mention } = req.body || {};
  if (!etudiant_id || !annee_scolaire || !ue_num) {
    return res.status(400).json({ error: 'étudiant, année et unité requis' });
  }
  const RESULTATS = ['reussi', 'ajourne', 'refuse', 'absent', null];
  if (resultat !== undefined && !RESULTATS.includes(resultat)) {
    return res.status(400).json({ error: 'resultat invalide' });
  }

  const insc = db.prepare(`
    SELECT id FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).get(Number(etudiant_id), annee_scolaire, Number(ue_num));
  if (!insc) {
    return res.status(404).json({
      error: "Cet étudiant n'est pas inscrit à cette unité pour cette année : "
           + 'la décision se pose sur une inscription.',
    });
  }

  const n = points == null || points === '' ? null
    : Number(String(points).replace(',', '.'));
  const note = (n != null && Number.isFinite(n) && n >= 0 && n <= 20) ? n : null;
  if (points != null && points !== '' && note == null) {
    return res.status(400).json({ error: 'note attendue entre 0 et 20' });
  }

  db.prepare(`
    UPDATE etudiant_inscription SET resultat = ?, points = ?, mention = ?
    WHERE id = ?
  `).run(resultat ?? null, note, mention ?? null, insc.id);

  res.json({ ok: true });
});

// ── Les unités en échec d'un étudiant ──────────────────────────────────────
// Route dédiée : la route /pae ne remonte pas les résultats, et deviner sa
// structure m'a déjà valu une erreur.
r.get('/echecs/:etudId', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const lignes = db.prepare(`
    SELECT i.ue_num, i.resultat,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_nom IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
      AND i.resultat IN ('refuse', 'ajourne')
    ORDER BY i.ue_num
  `).all(Number(req.params.etudId), annee);

  res.json({ annee, unites: lignes });
});

// ── Le document réglementaire ──────────────────────────────────────────────
// Annexe 8 (ajournement) ou 9 (refus), selon la décision encodée. La forme est
// imposée par la circulaire : on la suit, sans habillage.
r.get('/motivation/:etudId/:ueNum/document', authRequired, (req, res) => {
  const etudId = Number(req.params.etudId);
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });

  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};
  const ident = identiteEtablissement();
  const insc = db.prepare(`
    SELECT resultat FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).get(etudId, annee, ueNum);

  const estRefus = insc?.resultat === 'refuse';

  const ue = db.prepare(`
    -- Le nombre de périodes destiné à l'étudiant : la colonne s'appelle
    -- ue_per_etudiants, non ue_periodes.
    SELECT ue_nom, ue_code_fwb, ue_per_etudiants FROM ue
    WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(ueNum, annee) || {};

  // Les acquis non maîtrisés et leur motivation.
  const notes = {};
  for (const l of db.prepare(`
    SELECT code, points, non_evalue FROM etudiant_note_detail
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa'
  `).all(etudId, annee, ueNum)) {
    const brut = String(l.code).includes('|') ? String(l.code).split('|')[1] : l.code;
    notes[brut] = l;
  }
  const motifs = Object.fromEntries(db.prepare(`
    SELECT aa_code, motif FROM decision_motivation
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).all(etudId, annee, ueNum).map(m => [m.aa_code, m.motif]));

  const lignes = structureUE(ueNum, annee).flatMap(co => (co.aas || []).map(a => {
    const n = notes[a.aa_code];
    const evalue = n && !n.non_evalue && n.points != null;
    return evalue && n.points < 10
      ? { code: a.aa_code, description: a.description || co.cours_nom,
          motif: motifs[a.aa_code] || '' }
      : null;
  })).filter(Boolean);

  if (!lignes.length) {
    return res.status(400).json({
      error: "Aucun acquis en échec pour cette unité : une motivation de refus "
           + "n'a pas lieu d'être. Vérifiez la décision encodée.",
    });
  }

  const esc2 = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const jour = d => d ? String(d).slice(0, 10).split('-').reverse().join('-') : '……………';
  const [a1, a2] = String(annee).split('-');

  const corps = `
<div class="mot">
  <p class="cf">COMMUNAUTÉ FRANÇAISE DE BELGIQUE<br>
    ENSEIGNEMENT DE PROMOTION SOCIALE</p>
  <p class="an">ANNÉE SCOLAIRE / ANNÉE ACADÉMIQUE : ${esc2(a1)} / ${esc2(a2)}</p>

  <p class="etab"><b>${esc2(ident.nom || 'Institut Ilya Prigogine')}</b><br>
    Adresse : ${esc2(ident.adresse || '')}<br>
    Numéro de matricule : ${esc2(ident.matricule || '……………')}<br>
    Numéro FASE : ${esc2(ident.fase || '……………')}</p>

  <h1>MOTIVATION D'UNE DÉCISION ${estRefus ? 'DE REFUS' : "D'AJOURNEMENT"}</h1>

  <p>Nous, soussignés, Président-e et Membres du Conseil des études / Jury d'épreuve
    intégrée constitué par le Pouvoir organisateur de l'établissement précité en vue de
    la délivrance de l'attestation de réussite de l'unité d'enseignement :</p>

  <table class="ue">
    <tr><th>Intitulé de l'unité d'enseignement</th><th>Nombre de périodes</th>
        <th>Numéro de code</th></tr>
    <tr><td>${esc2(ue.ue_nom || '')}</td>
        <td>${ue.ue_per_etudiants || '……………'}</td>
        <td>${esc2(ue.ue_code_fwb || ueNum)}</td></tr>
  </table>

  <p>Attestons que :</p>
  <p class="etud"><b>${esc2((e.nom || '').toUpperCase())} ${esc2(e.prenom || '')}</b> (H/F/X)<br>
    Né-e à ${esc2(e.lieu_naissance) || '……………………'},
    le ${jour(e.date_naissance)},</p>

  <p>Ne maîtrise pas les acquis d'apprentissage suivants, soit :</p>

  <table class="aa">
    <tr><th style="width:45%">ACQUIS D'APPRENTISSAGE</th>
        <th>${estRefus ? 'MOTIVATION' : 'JUSTIFICATION'}</th></tr>
    ${lignes.map(l => `<tr>
      <td>${esc2(l.description)}</td>
      <td>${esc2(l.motif) || '……………………………………'}</td>
    </tr>`).join('')}
  </table>

  ${estRefus ? `
  <p class="champ">Base légale de la décision :<br>
    ${esc2(etab.base_legale_refus
      || "Arrêté du Gouvernement de la Communauté française du 2 septembre 2015 "
       + "relatif à la sanction des études ; règlement des études de l'établissement.")}</p>
  <p class="champ">Voies de recours interne :<br>
    ${esc2(etab.voies_recours
      || "Conformément au règlement des études, un recours interne peut être "
       + "introduit auprès de la direction dans les délais qu'il prévoit.")}</p>
  <p class="champ">Remarques particulières :<br>……………………………………………………………</p>
  ` : `
  <p class="champ">L'étudiant-e doit représenter les acquis d'apprentissage suivants :<br>
    ${lignes.map(l => esc2(l.description)).join(' ; ')}</p>
  <p class="champ">En date du ……………… à ……H……, au local ………,
    à ……………………………… (adresse)</p>
  <p class="champ">Remarques :<br>……………………………………………………………………</p>
  `}

  <div class="cloture">
    <div>Le Conseil des études,<br>Le Jury d'épreuve intégrée,</div>
    <div class="sceau"></div>
    <div class="sig">
      <div>Fait à ${esc2(ident.ville || 'Anderlecht')},<br>
        le ${jour(new Date().toISOString())}</div>
      <div class="paraphe"></div>
      <div class="nom">Le Directeur,<br><b>${esc2(ident.directeur || 'Charles SOHET')}</b></div>
    </div>
  </div>
</div>`;

  const html = envelopperDocument({
    html: corps, titre: '', avecPied: false, margeHaut: 15, margeCote: 18,
    styles: `
:root{--paraphe:url("${SIGNATURE_SOHET}");--sceau:url("${SCEAU_IIP}")}
.mot{font-size:10pt;line-height:1.35;color:#000}
.mot p{margin:0 0 2.5mm}
.mot .cf{text-align:center;font-weight:700;font-size:10.5pt}
.mot .an{text-align:center;font-size:9.5pt;margin-bottom:4mm}
.mot .etab{font-size:9.5pt;margin-bottom:4mm}
/* Le titre en rouge : la décision doit se distinguer au premier regard d'une
   attestation de réussite, dont la forme est très proche. */
.mot h1{font-size:12pt;font-weight:700;text-align:center;color:#B91C1C;
  margin:0 0 4mm;letter-spacing:.3pt}
.mot table{width:100%;border-collapse:collapse;margin:2mm 0 3mm}
.mot table th,.mot table td{border:.5pt solid #000;padding:1.5mm 2mm;
  font-size:9.5pt;vertical-align:top;text-align:left}
.mot table th{font-size:8.5pt;font-weight:700;background:#f1f5f9}
.mot .etud{margin:2mm 0 3mm}
.mot .champ{margin-top:3mm;font-size:9.5pt}
.mot .cloture{display:flex;justify-content:space-between;align-items:flex-end;
  gap:8mm;margin-top:8mm;font-size:9.5pt;page-break-inside:avoid}
.mot .cloture .sceau{width:24mm;height:24mm;background-image:var(--sceau);
  background-repeat:no-repeat;background-position:center bottom;background-size:contain}
.mot .sig{text-align:center}
.mot .sig .paraphe{width:44mm;height:16mm;margin:1mm auto -1mm;
  background-image:var(--paraphe);background-repeat:no-repeat;
  background-position:center bottom;background-size:contain}
.mot .sig .nom{border-top:.4pt solid #94a3b8;padding-top:1mm}`,
  });

  res.json({ html, nom: `Motivation_${estRefus ? 'refus' : 'ajournement'}_UE${ueNum}` });
});

// ── Tous les cours suivis par un étudiant, toutes UE confondues ────────────
// La dispense partielle exigeait de connaître le numéro d'UE et de le taper
// avant de voir quoi que ce soit. On liste ici tous les cours des unités
// auxquelles l'étudiant est inscrit, avec la note déjà connue quand il y en a
// une : il n'y a plus qu'à choisir.
r.get('/cours-etudiant/:etudId', authRequired, (req, res) => {
  const etudId = Number(req.params.etudId);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const inscriptions = db.prepare(`
    SELECT i.ue_num, i.resultat,
           (SELECT ue_nom FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_nom IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_nom,
           (SELECT ue_niv FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_niv IS NOT NULL
             ORDER BY u.annee_scolaire DESC LIMIT 1) AS ue_niv
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    ORDER BY i.ue_num
  `).all(etudId, annee);

  // Les notes des ANNÉES ANTÉRIEURES, tous cours confondus : c'est d'elles que
  // vient un report.
  const anterieures = {};
  for (const l of db.prepare(`
    SELECT ue_num, code, cours_code, points, annee_scolaire
    FROM etudiant_note_detail
    WHERE etudiant_id = ? AND type = 'aa' AND annee_scolaire < ?
    ORDER BY annee_scolaire
  `).all(etudId, annee)) {
    const brut = String(l.code).includes('|') ? String(l.code).split('|')[1] : l.code;
    const cc = l.cours_code;
    if (cc) anterieures[l.ue_num + '|' + cc] = { points: l.points, annee: l.annee_scolaire };
    anterieures[l.ue_num + '||' + brut] = { points: l.points, annee: l.annee_scolaire };
  }

  const dejaReportes = new Set(db.prepare(`
    SELECT ue_num, cours_code FROM etudiant_report_note
    WHERE etudiant_id = ? AND annee_scolaire = ?
  `).all(etudId, annee).map(x => x.ue_num + '|' + x.cours_code));

  const rang = v => { const m = /^BA(\d+)$/.exec((v || '').toUpperCase()); return m ? Number(m[1]) : 9; };

  const unites = inscriptions.map(i => {
    const structure = structureUE(i.ue_num, annee);
    return {
      ue_num: i.ue_num, ue_nom: i.ue_nom, ue_niv: i.ue_niv, resultat: i.resultat,
      cours: structure.map(co => {
        const ant = anterieures[i.ue_num + '|' + co.cours_code];
        return {
          cours_code: co.cours_code, cours_nom: co.cours_nom, periodes: co.cours_per,
          note_anterieure: ant?.points ?? null,
          annee_anterieure: ant?.annee ?? null,
          deja_reporte: dejaReportes.has(i.ue_num + '|' + co.cours_code),
          aas: (co.aas || []).map(a => ({ aa_code: a.aa_code, description: a.description })),
        };
      }),
    };
  }).sort((a, b) => rang(a.ue_niv) - rang(b.ue_niv) || a.ue_num - b.ue_num);

  res.json({
    annee, unites,
    nb_cours: unites.reduce((n, u) => n + u.cours.length, 0),
  });
});

// ── Toutes les notes d'un étudiant dans une UE, pour une année donnée ──────
// Le report se décidait à l'aveugle : il fallait connaître les notes de tête et
// les ressaisir. On expose ici TOUTES les notes de l'année source, reportables
// ou non — c'est en les voyant qu'on décide.
r.get('/notes-anterieures/:etudId/:ueNum', authRequired, (req, res) => {
  const etudId = Number(req.params.etudId);
  const ueNum = Number(req.params.ueNum);
  const { annee_source } = req.query;

  // Les années où cet étudiant a des notes dans cette UE.
  const annees = db.prepare(`
    SELECT DISTINCT annee_scolaire FROM etudiant_note_detail
    WHERE etudiant_id = ? AND ue_num = ? AND type = 'aa'
    ORDER BY annee_scolaire DESC
  `).all(etudId, ueNum).map(r0 => r0.annee_scolaire);

  if (!annees.length) return res.json({ annees: [], cours: [], resultat_ue: null });

  const an = annee_source && annees.includes(annee_source) ? annee_source : annees[0];

  const lignes = db.prepare(`
    SELECT code, cours_code, points, non_evalue FROM etudiant_note_detail
    WHERE etudiant_id = ? AND ue_num = ? AND type = 'aa' AND annee_scolaire = ?
  `).all(etudId, ueNum, an);

  const structure = structureUE(ueNum, an);
  const notes = {};
  for (const l of lignes) {
    const brut = String(l.code).includes('|') ? String(l.code).split('|')[1] : l.code;
    const cc = l.cours_code
      || structure.find(c0 => c0.aas.some(a => a.aa_code === brut))?.cours_code;
    if (cc) notes[cc + '|' + brut] = { points: l.points, non_evalue: l.non_evalue };
  }

  // Tous les cours de l'UE, avec ou sans note : l'absence de note est une
  // information, elle dit qu'il n'y a rien à reporter.
  const cours = structure.map(co => {
    const n = calculerNoteCours(co, notes);
    return {
      cours_code: co.cours_code, cours_nom: co.cours_nom,
      note: n.sur20_exact, note_affichee: n.sur20,
      annee_origine: an,
    };
  });

  const insc = db.prepare(`
    SELECT resultat, points FROM etudiant_inscription
    WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ?
  `).get(etudId, ueNum, an);

  // Déjà reportés vers l'année cible : on ne les propose pas deux fois.
  const dejaReportes = req.query.annee_cible
    ? db.prepare(`
        SELECT cours_code FROM etudiant_report_note
        WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ?
      `).all(etudId, ueNum, req.query.annee_cible).map(x => x.cours_code)
    : [];

  res.json({
    annees, annee_source: an, cours,
    resultat_ue: insc?.resultat || null,
    points_ue: insc?.points ?? null,
    deja_reportes: dejaReportes,
  });
});

// ── Reports de note d'un étudiant pour une UE et une année ─────────────────
r.get('/reports/:etudId/:ueNum', authRequired, (req, res) => {
  const { etudId, ueNum } = req.params;
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const actifs = db.prepare(`
    SELECT cours_code, note, annee_origine, decision_ce FROM etudiant_report_note
    WHERE etudiant_id = ? AND ue_num = ? AND annee_scolaire = ?
  `).all(Number(etudId), Number(ueNum), annee);

  const dejaReportes = new Set(actifs.map(a => a.cours_code));
  const candidats = coursValidesAnterieurs(Number(etudId), Number(ueNum), annee)
    .filter(c0 => !dejaReportes.has(c0.cours_code));

  res.json({ actifs, candidats });
});

r.put('/reports', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { etudiant_id, annee_scolaire, ue_num, cours_code, note, annee_origine, decision_ce } = req.body;
  if (!etudiant_id || !annee_scolaire || !ue_num || !cours_code || note == null) {
    return res.status(400).json({ error: 'etudiant_id, annee_scolaire, ue_num, cours_code et note requis' });
  }
  db.prepare(`
    INSERT INTO etudiant_report_note
      (etudiant_id, annee_scolaire, ue_num, cours_code, note, annee_origine, decision_ce)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, cours_code) DO UPDATE SET
      note = excluded.note, annee_origine = excluded.annee_origine,
      decision_ce = excluded.decision_ce
  `).run(Number(etudiant_id), annee_scolaire, Number(ue_num), cours_code,
         Number(note), annee_origine || null, decision_ce || null);
  res.json({ ok: true });
});

r.delete('/reports/:etudId/:ueNum/:coursCode', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  db.prepare(`
    DELETE FROM etudiant_report_note
    WHERE etudiant_id = ? AND ue_num = ? AND cours_code = ? AND annee_scolaire = ?
  `).run(Number(req.params.etudId), Number(req.params.ueNum), req.params.coursCode, annee);
  res.json({ ok: true });
});

// ── Structure d'évaluation d'une UE ─────────────────────────────────────────
/**
 * Les LIENS cours ↔ acquis d'une unité, pour les paramétrer.
 *
 * structureUE ne remonte que les acquis DÉJÀ rattachés à un cours : elle sert
 * au calcul, pas au paramétrage. Ici on veut l'inverse — tous les acquis de
 * l'unité, tous ses cours, et l'état des liens — pour pouvoir en créer.
 *
 * Le lien EST la pondération : un acquis est évalué dans un cours dès qu'il y
 * porte un poids, et cesser de l'y évaluer, c'est retirer ce poids.
 */
r.get('/ue/:ueNum/liens', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);

  let cours = db.prepare(`
    SELECT cours_code, cours_nom, cours_per FROM cours
    WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_code
  `).all(ueNum, annee);
  if (!cours.length) {
    cours = db.prepare(`
      SELECT cours_code, MIN(cours_nom) AS cours_nom, MAX(cours_per) AS cours_per
      FROM cours WHERE ue_num = ? GROUP BY cours_code ORDER BY cours_code
    `).all(ueNum);
  }

  const acquis = db.prepare(`
    SELECT aa_code, aa_num, description, cours_code AS cours_referentiel
    FROM aa WHERE ue_num = ? ORDER BY aa_num, aa_code
  `).all(ueNum);

  const liens = db.prepare(
    'SELECT cours_code, aa_code, poids FROM aa_ponderation WHERE ue_num = ?').all(ueNum);

  const ue = db.prepare(`
    SELECT ue_nom, section FROM ue WHERE ue_num = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(ueNum, annee) || {};

  // Ce qui empêche la saisie par cours de fonctionner, dit explicitement.
  const lies = new Set(liens.map(l => l.aa_code));
  const sommes = {};
  for (const l of liens) sommes[l.cours_code] = (sommes[l.cours_code] || 0) + Number(l.poids || 0);

  res.json({
    ue_num: ueNum, ue_nom: ue.ue_nom || null, section: ue.section || null, annee,
    cours, acquis, liens,
    epreuve_integree: estEpreuveIntegree(ueNum, annee),
    sommes,
    acquis_sans_cours: acquis.filter(a => !lies.has(a.aa_code)).map(a => a.aa_code),
    cours_incomplets: cours
      .filter(c => { const s = sommes[c.cours_code]; return s != null && Math.abs(s - 10) > 0.001 && Math.abs(s - 100) > 0.01; })
      .map(c => c.cours_code),
    pret: cours.length > 0 && acquis.length > 0
      && acquis.every(a => lies.has(a.aa_code))
      && cours.every(c => {
        const s = sommes[c.cours_code];
        return s != null && (Math.abs(s - 10) < 0.001 || Math.abs(s - 100) < 0.01);
      }),
  });
});

r.get('/ue/:ueNum/structure', authRequired, (req, res) => {
  const cours = structureUE(Number(req.params.ueNum), req.query.annee);
  const sommeCours = cours.reduce((s, c) => s + (c.poids_cours || 0), 0);   // 100 si les périodes sont renseignées
  res.json({
    ue_num: Number(req.params.ueNum),
    cours,
    somme_poids_cours: Math.round(sommeCours * 100) / 100,
    poids_cours_complet: cours.length > 0 && Math.abs(sommeCours - 100) < 0.01,
    pret: cours.length > 0 && cours.every(c => c.complet) && Math.abs(sommeCours - 100) < 0.01,
  });
});

// ── Enregistrer les pondérations d'un cours ─────────────────────────────────
r.put('/ponderations', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { ue_num, cours_code, ponderations } = req.body;
  if (!ue_num || !cours_code || !Array.isArray(ponderations)) {
    return res.status(400).json({ error: 'ue_num, cours_code et ponderations requis' });
  }
  // Un poids ABSENT ou NUL délie l'acquis du cours : c'est par cette table que
  // le lien existe, et sans effacement on ne pouvait jamais le défaire.
  const gardes = ponderations.filter(p => Number(p.poids) > 0);
  const somme = gardes.reduce((s, p) => s + Number(p.poids || 0), 0);

  // PARITÉ : tous les acquis du cours pèsent pareil. Trois acquis, un tiers
  // chacun — ce qui ne se répartit pas en dix points entiers. Comme seul le
  // RAPPORT entre les poids entre dans le calcul, un poids de 1 partout dit
  // exactement cela, et la somme n'a alors pas à valoir dix.
  if (req.body.parite) {
    const del = db.prepare('DELETE FROM aa_ponderation WHERE cours_code = ? AND aa_code = ?');
    const up = db.prepare(`
      INSERT INTO aa_ponderation (ue_num, cours_code, aa_code, poids, maj_le)
      VALUES (?,?,?,1, datetime('now'))
      ON CONFLICT(cours_code, aa_code) DO UPDATE SET
        poids = 1, ue_num = excluded.ue_num, maj_le = datetime('now')`);
    db.transaction(() => {
      for (const p of ponderations) {
        if (Number(p.poids) > 0) up.run(Number(ue_num), cours_code, p.aa_code);
        else del.run(cours_code, p.aa_code);
      }
    })();
    return res.json({ ok: true, cours_code, parite: true, nb: gardes.length });
  }

  // DEUX barèmes coexistent, et seul le RAPPORT entre les poids entre dans le
  // calcul — 3 sur 10 pèse comme 30 sur 100. Le barème sur 10, en entiers, est
  // celui qu'on encode désormais ; celui sur 100 vient des classeurs de suivi
  // et reste valide tel quel.
  const sur10 = Math.abs(somme - 10) < 0.001;
  const sur100 = Math.abs(somme - 100) < 0.01;
  if (gardes.length && !sur10 && !sur100) {
    return res.status(400).json({
      error: `La somme des pondérations de ce cours vaut ${Math.round(somme * 100) / 100}.`
           + ' Elle doit valoir 10 — dix points à répartir entre les acquis du cours.',
    });
  }
  if (sur10 && gardes.some(p => !Number.isInteger(Number(p.poids)))) {
    return res.status(400).json({
      error: 'Sur un barème de 10, les poids sont des nombres entiers de 1 à 10.',
    });
  }

  const up = db.prepare(`
    INSERT INTO aa_ponderation (ue_num, cours_code, aa_code, poids, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(cours_code, aa_code) DO UPDATE SET
      poids = excluded.poids, ue_num = excluded.ue_num, maj_le = datetime('now')
  `);
  const del = db.prepare('DELETE FROM aa_ponderation WHERE cours_code = ? AND aa_code = ?');
  db.transaction(() => {
    for (const p of ponderations) {
      if (Number(p.poids) > 0) up.run(Number(ue_num), cours_code, p.aa_code, Number(p.poids));
      else del.run(cours_code, p.aa_code);
    }
  })();
  res.json({ ok: true, cours_code, somme: Math.round(somme * 100) / 100,
             bareme: sur10 ? 10 : 100 });
});

// ── Répartition égale, pour amorcer ─────────────────────────────────────────
r.post('/ponderations/repartir', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { ue_num, cours_code } = req.body;
  if (!ue_num || !cours_code) return res.status(400).json({ error: 'ue_num et cours_code requis' });

  const aas = db.prepare(
    'SELECT aa_code FROM aa WHERE ue_num = ? AND cours_code = ? ORDER BY aa_num'
  ).all(Number(ue_num), cours_code);
  if (!aas.length) return res.status(400).json({ error: 'Aucun AA rattaché à ce cours' });

  // Réparti à parts égales ; le reliquat va au premier pour que le total fasse 100
  const base = Math.floor((100 / aas.length) * 100) / 100;
  const poids = aas.map(() => base);
  poids[0] = Math.round((100 - base * (aas.length - 1)) * 100) / 100;

  const up = db.prepare(`
    INSERT INTO aa_ponderation (ue_num, cours_code, aa_code, poids, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(cours_code, aa_code) DO UPDATE SET
      poids = excluded.poids, maj_le = datetime('now')
  `);
  db.transaction(() => {
    aas.forEach((a, i) => up.run(Number(ue_num), cours_code, a.aa_code, poids[i]));
  })();
  res.json({ ok: true, reparti: aas.length });
});

// ── UE d'une section, avec l'état de leur paramétrage ───────────────────────
r.get('/sections/:section/ues', authRequired, (req, res) => {
  const annee = req.query.annee
    || anneeDeTravail(req);

  const ues = db.prepare(`
    SELECT DISTINCT ue_num, MIN(ue_nom) AS ue_nom, MIN(ue_niv) AS ue_niv
    FROM ue WHERE section = ? AND annee_scolaire = ?
    GROUP BY ue_num ORDER BY ue_num
  `).all(req.params.section, annee);

  res.json(ues.map(u => {
    const st = structureUE(u.ue_num, annee);
    const nbAA = st.reduce((s, c) => s + c.aas.length, 0);
    const sommeC = st.reduce((s, c) => s + (c.poids_cours || 0), 0);
    return {
      ...u,
      nb_cours: st.length,
      nb_aa: nbAA,
      pret: st.length > 0 && st.every(c => c.complet) && Math.abs(sommeC - 100) < 0.01,
      cours_incomplets: st.filter(c => !c.complet).map(c => c.cours_code),
      somme_poids_cours: Math.round(sommeC * 100) / 100,
    };
  }));
});

/**
 * Bilan de parcours d'un étudiant — ce qui entoure la décision.
 *
 * Le Conseil ne délibère pas une unité dans le vide : il délibère un ÉTUDIANT
 * à propos d'une unité. Cette route rassemble ce qui manque à la feuille pour
 * juger — le parcours antérieur, la moyenne de l'année, les crédits acquis.
 *
 * Elle ne recalcule PAS les notes de l'unité en cours : la feuille les tient
 * déjà, et deux calculs parallèles finissent toujours par diverger.
 */
r.get('/parcours-bilan/:etudId', authRequired, (req, res) => {
  const etudId = Number(req.params.etudId);
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const etud = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!etud) return res.status(404).json({ error: 'étudiant introuvable' });

  // Toutes les inscriptions, tous millésimes : le parcours ne se lit pas
  // année par année. Le référentiel retenu est celui de l'année d'inscription,
  // à défaut le plus récent — un intitulé ou un nombre d'ECTS peut changer.
  // Le référentiel se rapproche EN JAVASCRIPT, non par sous-requête : SQLite
  // n'admet pas de référence à l'alias externe (« i ») dans le ORDER BY d'une
  // sous-requête, et l'erreur ne se voit qu'à l'exécution — « no such column:
  // i.annee_scolaire ». Le code de attestations.js le signalait déjà.
  const brutes = db.prepare(`
    SELECT ue_num, annee_scolaire, resultat, points
    FROM etudiant_inscription WHERE etudiant_id = ?
    ORDER BY annee_scolaire, ue_num
  `).all(etudId);

  const refs = db.prepare(`
    SELECT ue_num, annee_scolaire, ue_nom, ue_niv, ects, ue_per_etudiants, section
    FROM ue ORDER BY annee_scolaire DESC
  `).all();
  const refsParUe = {};
  for (const r0 of refs) (refsParUe[r0.ue_num] = refsParUe[r0.ue_num] || []).push(r0);

  // Millésime de l'inscription d'abord, sinon le plus récent : un intitulé ou
  // un nombre d'ECTS peut changer d'une année à l'autre.
  const refDe = (ueNum, an) => {
    const l = refsParUe[ueNum] || [];
    return l.find(x => x.annee_scolaire === an) || l[0] || {};
  };

  const inscriptions = brutes.map(i => {
    const r0 = refDe(i.ue_num, i.annee_scolaire);
    const sec = (refsParUe[i.ue_num] || []).find(x => x.section)?.section || null;
    return {
      ...i, ue_nom: r0.ue_nom || null, ue_niv: r0.ue_niv || null,
      ects: r0.ects ?? null, periodes: r0.ue_per_etudiants ?? null, section: sec,
    };
  });

  // Les valorisations valent acquisition : les ignorer sous-estimerait les
  // crédits d'un étudiant qui a fait valoir un parcours antérieur.
  const valorisations = db.prepare(`
    SELECT ue_num, annee_scolaire, pourcentage
    FROM etudiant_valorisation WHERE etudiant_id = ?
  `).all(etudId).map(v => ({ ...v, ects: refDe(v.ue_num, v.annee_scolaire).ects ?? null }));

  const cetteAnnee = inscriptions.filter(i => i.annee_scolaire === annee);
  const anterieures = inscriptions.filter(i => i.annee_scolaire !== annee);

  // MOYENNE de l'année, pondérée par les PÉRIODES ÉTUDIANT du dossier
  // pédagogique : une unité de 600 périodes pèse trois fois une de 200. Une
  // unité sans note ne compte ni au numérateur ni au dénominateur — elle n'est
  // pas un zéro, elle n'est pas encore jugée.
  let num = 0, den = 0;
  for (const i of cetteAnnee) {
    if (i.points == null) continue;
    const p = Number(i.periodes) || 0;
    if (!p) continue;
    num += Number(i.points) * p; den += p;
  }
  const moyenne = den ? Math.round((num / den) * 100) / 100 : null;
  const sansPonderation = cetteAnnee.filter(i => i.points != null && !Number(i.periodes)).length;

  // CRÉDITS. Le total de la section se somme au référentiel : il n'existe
  // aucun total stocké. S'il ne tombe pas rond, c'est le référentiel qui est
  // incomplet — on renvoie le nombre pour que l'écran puisse le dire.
  const section = cetteAnnee.find(i => i.section)?.section
    || inscriptions.find(i => i.section)?.section || null;
  const totalSection = section
    ? db.prepare(`
        SELECT SUM(ects) AS t FROM (
          SELECT ue_num, MAX(ects) AS ects FROM ue
          WHERE section = ? AND ects IS NOT NULL GROUP BY ue_num)
      `).get(section)?.t || 0
    : 0;

  const acquisesUe = new Set();
  let ectsAcquis = 0;
  for (const i of inscriptions) {
    if (i.resultat === 'reussi' && !acquisesUe.has(i.ue_num)) {
      acquisesUe.add(i.ue_num); ectsAcquis += Number(i.ects) || 0;
    }
  }
  for (const v of valorisations) {
    if (!acquisesUe.has(v.ue_num)) {
      acquisesUe.add(v.ue_num); ectsAcquis += Number(v.ects) || 0;
    }
  }
  // Au PROGRAMME de l'année : les unités inscrites que l'étudiant n'a pas
  // encore acquises. Une unité déjà réussie n'y figure pas.
  const ectsProgramme = cetteAnnee
    .filter(i => i.resultat !== 'reussi')
    .reduce((s, i) => s + (Number(i.ects) || 0), 0);

  res.json({
    etudiant: {
      id: etud.id, nom: etud.nom, prenom: etud.prenom, titre: etud.titre,
      id_ecampus: etud.id_ecampus, date_naissance: etud.date_naissance,
      email_ecole: etud.email_ecole, section,
    },
    annee,
    cette_annee: cetteAnnee,
    anterieures,
    valorisations,
    moyenne, moyenne_sans_ponderation: sansPonderation,
    ects: {
      acquis: ectsAcquis,
      programme: ectsProgramme,
      total_section: totalSection,
      restant: Math.max(0, totalSection - ectsAcquis - ectsProgramme),
      section,
    },
  });
});

/**
 * Le PLAN DE SÉANCE : les sections, leurs unités, et où en est la délibération.
 *
 * On atteignait la feuille par un clic non annoncé sur un en-tête de colonne,
 * dans l'écran de saisie rapide — on arrivait au sens par l'accessoire. Cette
 * route donne la porte d'entrée : d'abord les sections, puis leurs unités, avec
 * ce qui reste à faire sur chacune.
 */
r.get('/deliberation/plan', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const perim = getUserSections(req.user);

  // Une unité entre au plan dès qu'un étudiant y est inscrit cette année :
  // c'est l'inscription qui appelle une délibération, pas le référentiel.
  const lignes = db.prepare(`
    SELECT i.ue_num, i.etudiant_id, i.resultat
    FROM etudiant_inscription i WHERE i.annee_scolaire = ?
  `).all(annee);

  const refs = db.prepare(`
    SELECT ue_num, annee_scolaire, ue_nom, ue_niv, section
    FROM ue ORDER BY annee_scolaire DESC
  `).all();
  const refDe = {};
  for (const r0 of refs) if (!refDe[r0.ue_num] || r0.annee_scolaire === annee) refDe[r0.ue_num] = r0;

  // Les motivations déjà écrites, pour dire ce qui manque sans le deviner.
  const motives = new Set(db.prepare(`
    SELECT ue_num, etudiant_id FROM decision_motivation
    WHERE annee_scolaire = ? AND motif IS NOT NULL AND TRIM(motif) <> ''
  `).all(annee).map(m => `${m.ue_num}|${m.etudiant_id}`));

  const parUe = {};
  for (const l of lignes) {
    const u = (parUe[l.ue_num] = parUe[l.ue_num] || {
      ue_num: l.ue_num, inscrits: 0, decides: 0, echecs: 0, echecs_non_motives: 0,
    });
    u.inscrits++;
    if (l.resultat) u.decides++;
    if (l.resultat === 'ajourne' || l.resultat === 'refuse') {
      u.echecs++;
      if (!motives.has(`${l.ue_num}|${l.etudiant_id}`)) u.echecs_non_motives++;
    }
  }

  const sections = {};
  for (const u of Object.values(parUe)) {
    const r0 = refDe[u.ue_num] || {};
    const sec = r0.section || '—';
    if (perim && r0.section && !perim.includes(r0.section)) continue;
    (sections[sec] = sections[sec] || { section: sec, ues: [] }).ues.push({
      ...u, ue_nom: r0.ue_nom || null, ue_niv: r0.ue_niv || null,
    });
  }

  const resultat = Object.values(sections).map(s => {
    s.ues.sort((a, b) => a.ue_num - b.ue_num);
    return {
      ...s,
      nb_ues: s.ues.length,
      inscrits: s.ues.reduce((n, u) => n + u.inscrits, 0),
      a_delibierer: s.ues.filter(u => u.decides < u.inscrits).length,
      non_motives: s.ues.reduce((n, u) => n + u.echecs_non_motives, 0),
    };
  }).sort((a, b) => a.section.localeCompare(b.section));

  res.json({ annee, sections: resultat });
});

// ═══════════════════════════════════════════════════════════════════════════
// DÉLIBÉRATION D'UNE UNITÉ POUR UN ÉTUDIANT
// ═══════════════════════════════════════════════════════════════════════════

(function migrerAjustements() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS deliberation_ajustement (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        etudiant_id    INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        ue_num         INTEGER NOT NULL,
        portee         TEXT    NOT NULL CHECK (portee IN ('aa','cours')),
        code           TEXT    NOT NULL,
        action         TEXT    NOT NULL CHECK (action IN ('faveur','ajourne')),
        maj_le         TEXT DEFAULT CURRENT_TIMESTAMP,
        maj_par        TEXT,
        UNIQUE(etudiant_id, annee_scolaire, ue_num, portee, code)
      );
      CREATE INDEX IF NOT EXISTS idx_delib_ajust
        ON deliberation_ajustement(etudiant_id, annee_scolaire, ue_num);
    `);
    // LA FAVEUR SE POSE SUR L'UNITÉ, désormais, et non plus sur un acquis ou
    // un cours : c'est l'unité que le Conseil lève, et le décret fixe seul ce
    // qu'il advient du reste. La portée 'ue' doit donc être admise — la
    // contrainte CHECK d'origine ne la connaît pas, et SQLite ne sait pas la
    // modifier : on recrée la table en conservant les ajustements posés.
    const ddl = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='deliberation_ajustement'"
    ).get()?.sql || '';
    if (!ddl.includes("'ue'")) {
      // BEGIN/COMMIT écrits à la main dans un exec laissent la transaction
      // OUVERTE si une instruction échoue — et une vue invalide ailleurs dans
      // la base suffit à faire échouer n'importe quel DDL. On passe donc par
      // db.transaction(), qui annule proprement.
      db.transaction(() => db.exec(`
        CREATE TABLE deliberation_ajustement_v2 (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          etudiant_id    INTEGER NOT NULL,
          annee_scolaire TEXT    NOT NULL,
          ue_num         INTEGER NOT NULL,
          portee         TEXT    NOT NULL CHECK (portee IN ('aa','cours','ue')),
          code           TEXT    NOT NULL,
          action         TEXT    NOT NULL CHECK (action IN ('faveur','ajourne')),
          maj_le         TEXT DEFAULT CURRENT_TIMESTAMP,
          maj_par        TEXT,
          UNIQUE(etudiant_id, annee_scolaire, ue_num, portee, code)
        );
        INSERT INTO deliberation_ajustement_v2
          (id, etudiant_id, annee_scolaire, ue_num, portee, code, action, maj_le, maj_par)
          SELECT id, etudiant_id, annee_scolaire, ue_num, portee, code, action, maj_le, maj_par
          FROM deliberation_ajustement;
        DROP TABLE deliberation_ajustement;
        ALTER TABLE deliberation_ajustement_v2 RENAME TO deliberation_ajustement;
        CREATE INDEX IF NOT EXISTS idx_delib_ajust
          ON deliberation_ajustement(etudiant_id, annee_scolaire, ue_num);
      `))();
    }
  } catch (e) { console.error('[migration] deliberation_ajustement :', e.message); }
})();

const SEUIL_UE = 10;   // RDE, art. 78

/**
 * L'ÉPREUVE INTÉGRÉE D'UNITÉ.
 *
 * Les professeurs d'une unité peuvent décider d'une épreuve commune : on
 * n'évalue plus cours par cours, mais l'unité entière, acquis par acquis. La
 * note de l'unité se calcule alors sur ces seuls acquis, et CHAQUE COURS de
 * l'unité reçoit cette note — elle est la même pour tous, puisque l'épreuve
 * l'était.
 *
 * Les liens cours↔acquis restent utiles : ils disent qui enseigne quoi, et
 * portent les pondérations qui servent encore à peser les acquis entre eux.
 */
(function migrerEpreuveIntegree() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ue_epreuve_integree (
        ue_num         INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        actif          INTEGER NOT NULL DEFAULT 1,
        maj_le         TEXT DEFAULT CURRENT_TIMESTAMP,
        maj_par        TEXT,
        PRIMARY KEY (ue_num, annee_scolaire)
      );
    `);
  } catch (e) { console.error('[migration] ue_epreuve_integree :', e.message); }
})();

export function estEpreuveIntegree(ueNum, annee) {
  try {
    const l = db.prepare(
      'SELECT actif FROM ue_epreuve_integree WHERE ue_num = ? AND annee_scolaire = ?'
    ).get(Number(ueNum), annee);
    return !!(l && l.actif);
  } catch { return false; }
}

/**
 * Les cours qu'une personne a le droit d'encoder.
 *
 * Un professeur n'encode que SES cours : lui montrer ceux de ses collègues,
 * c'est l'inviter à écraser leurs notes. Le lien passe par ses attributions —
 * il n'y en a pas d'autre. La direction, elle, voit tout ; c'est elle qui
 * délibère.
 *
 * Renvoie null quand il n'y a rien à restreindre, un Set sinon.
 */
export function coursAutorises(user, annee) {
  if (!user) return new Set();
  if (user.role !== 'professeur') return null;   // direction, secrétariat : tout
  const u = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(user.id);
  // Un compte professeur non rattaché à une fiche du personnel n'a aucun
  // cours : mieux vaut ne rien lui montrer que de tout lui ouvrir.
  if (!u?.professeur_id) return new Set();
  const rows = db.prepare(`
    SELECT DISTINCT code_cours FROM attribution
    WHERE professeur_id = ? AND annee_scolaire = ? AND code_cours IS NOT NULL
  `).all(u.professeur_id, annee);
  return new Set(rows.map(r => r.code_cours));
}

/**
 * Le calcul de délibération d'une unité, pour un étudiant.
 *
 * TROIS NIVEAUX, dans cet ordre de lecture :
 *  1. l'ACQUIS au global — un acquis peut être évalué dans plusieurs cours ;
 *     sa note globale est la moyenne de ses évaluations, pondérée par le poids
 *     qu'il a DANS CHAQUE cours ;
 *  2. le COURS — moyenne de ses acquis, pondérée par leur poids dans ce cours ;
 *  3. l'UNITÉ — Σ(note × poids_aa × poids_cours) ÷ Σ(20 × poids_aa × poids_cours),
 *     ramenée sur 20. Un acquis non évalué SORT du dénominateur : il ne vaut
 *     pas zéro.
 *
 * DEUX AJUSTEMENTS que le Conseil peut poser :
 *
 *  - FAVEUR. Le décret du 16 avril 1991 ne permet au Conseil des études ni de
 *    sanctionner la réussite d'un étudiant qui ne maîtrise pas TOUS ses acquis,
 *    ni d'attribuer plus de 10/20 lorsque l'un d'eux ne l'est pas. Lever un
 *    acquis en échec est donc déjà une faveur considérable, et la note qui en
 *    résulte ne peut être que le seuil : l'acquis forcé vaut 10, le cours qui
 *    le porte vaut 10, et l'unité vaut 10. Ce n'est pas un plafond appliqué
 *    après un calcul — c'est la note elle-même, et le calcul ne s'applique
 *    plus à ces éléments.
 *
 *  - AJOURNEMENT : l'élément passe à NA et sort du calcul. Un cours ajourné
 *    emporte tous ses acquis. Et l'unité elle-même devient NA : tant qu'un
 *    élément est à représenter, elle n'a pas de note.
 */
export function delibererUE(etudId, ueNum, annee) {
  const structure = structureUE(ueNum, annee);
  const integree = estEpreuveIntegree(ueNum, annee);

  // Les couples (cours, acquis) et leur poids. La table de pondération fait
  // foi : c'est elle, et non la colonne cours_code de l'acquis, qui permet
  // qu'un même acquis soit évalué dans plusieurs cours.
  const paires = [];
  const pondRows = db.prepare(
    'SELECT cours_code, aa_code, poids FROM aa_ponderation WHERE ue_num = ?').all(ueNum);
  if (pondRows.length) {
    for (const p of pondRows) {
      paires.push({ cours_code: p.cours_code, aa_code: p.aa_code, poids: Number(p.poids) || 0 });
    }
  } else {
    // Sans pondération explicite, les acquis d'un cours pèsent également : la
    // moyenne reste juste, seule la finesse manque.
    for (const c of structure) {
      for (const a of (c.aas || [])) {
        paires.push({ cours_code: c.cours_code, aa_code: a.aa_code, poids: 1 });
      }
    }
  }

  const descr = {};
  for (const c of structure) for (const a of (c.aas || [])) descr[a.aa_code] = a.description;

  // La justification s'écrit au niveau de l'ACQUIS non acquis : c'est de lui
  // qu'on doit rendre compte, et c'est lui que reprend l'annexe 8 ou 9.
  const motifs = Object.fromEntries(db.prepare(`
    SELECT aa_code, motif FROM decision_motivation
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).all(etudId, annee, ueNum).map(m => [m.aa_code, m.motif]));

  // Les notes. Le code porte le cours quand la saisie s'est faite cours par
  // cours ; il ne porte que l'acquis quand elle vient du classeur consolidé.
  // Les deux formes cohabitent, et la plus précise l'emporte.
  const brutes = db.prepare(`
    SELECT code, points FROM etudiant_note_detail
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa'
  `).all(etudId, annee, ueNum);
  const parCoursAA = {}, parAA = {};
  for (const l of brutes) {
    let parts = String(l.code).split('|');
    if (/^s[12]$/.test(parts[0])) parts = parts.slice(1);   // la session, mise de côté
    if (parts.length === 2) parCoursAA[`${parts[0]}|${parts[1]}`] = l.points;
    else parAA[parts[0]] = l.points;
  }
  const noteDe = (cours, aa) => {
    const v = parCoursAA[`${cours}|${aa}`];
    return v != null ? Number(v) : (parAA[aa] != null ? Number(parAA[aa]) : null);
  };

  const ajust = {};
  for (const a of db.prepare(`
    SELECT portee, code, action FROM deliberation_ajustement
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).all(etudId, annee, ueNum)) ajust[`${a.portee}|${a.code}`] = a.action;

  const coursAjourne = c => ajust[`cours|${c}`] === 'ajourne';
  const coursFaveur = c => ajust[`cours|${c}`] === 'faveur';
  const aaAjourne = a => ajust[`aa|${a}`] === 'ajourne';
  const aaFaveur = a => ajust[`aa|${a}`] === 'faveur';
  // La faveur se pose sur l'UNITÉ : c'est elle que le Conseil lève. Les
  // faveurs d'acquis ou de cours posées avant ce changement restent honorées.
  const ueFaveur = ajust['ue|*'] === 'faveur';

  // ── 1. L'ACQUIS au global ────────────────────────────────────────────────
  const codesAA = [...new Set(paires.map(p => p.aa_code))];
  const acquis = codesAA.map(code => {
    const evals = paires.filter(p => p.aa_code === code).map(p => ({
      cours_code: p.cours_code, poids: p.poids,
      note: noteDe(p.cours_code, code),
      ajourne: coursAjourne(p.cours_code),
    }));
    const na = aaAjourne(code) || evals.every(e => e.ajourne);
    let note = null;
    if (!na && integree) {
      // Épreuve commune : l'acquis a UNE note, celle de l'unité — pas une par
      // cours. On lit donc la note posée sans cours.
      note = parAA[code] != null ? Number(parAA[code]) : null;
    } else if (!na) {
      let num = 0, den = 0;
      for (const e of evals) {
        if (e.ajourne || e.note == null) continue;
        num += e.note * (e.poids || 0); den += (e.poids || 0);
      }
      note = den ? Math.round((num / den) * 100) / 100 : null;
    }
    const forcee = aaFaveur(code) || (ueFaveur && !na && note != null && note < SEUIL_UE);
    const affichee = na ? null : (forcee ? SEUIL_UE : note);
    return {
      aa_code: code, description: descr[code] || null,
      evaluations: evals, note_calculee: note, note: affichee,
      na, faveur: forcee, motif: motifs[code] || '',
      ajourne_directement: aaAjourne(code),
      echec: !na && affichee != null && affichee < SEUIL_UE,
    };
  });
  const noteAA = {};
  for (const a of acquis) noteAA[a.aa_code] = a;

  // ── 2. Le COURS ──────────────────────────────────────────────────────────
  const cours = structure.map(c => {
    const siennes = paires.filter(p => p.cours_code === c.cours_code);
    // Ajourner un ACQUIS ajourne les cours qui l'évaluent : cet acquis n'y est
    // pas maîtrisé, et le cours est donc lui aussi à représenter.
    const aas_ajournes = siennes.filter(p => aaAjourne(p.aa_code)).map(p => p.aa_code);
    const na = coursAjourne(c.cours_code) || aas_ajournes.length > 0;
    let note = null;
    if (!na && !integree) {
      let num = 0, den = 0;
      for (const p of siennes) {
        if (aaAjourne(p.aa_code)) continue;
        // La note du cours se calcule sur SES évaluations, non sur la note
        // globale de l'acquis : c'est ce cours-ci qu'on juge.
        const v = noteDe(c.cours_code, p.aa_code);
        if (v == null) continue;
        num += v * (p.poids || 0); den += (p.poids || 0);
      }
      note = den ? Math.round((num / den) * 100) / 100 : null;
    }
    // Un cours dont UN acquis a été levé en faveur vaut le seuil, et rien de
    // plus : le Conseil ne peut aller au-delà quand un acquis n'est pas
    // maîtrisé. La faveur du cours lui-même produit le même effet.
    const forcee = coursFaveur(c.cours_code) || siennes.some(p => aaFaveur(p.aa_code))
      || (ueFaveur && !na && note != null && note < SEUIL_UE);
    const affichee = na ? null : (forcee ? SEUIL_UE : note);
    return {
      cours_code: c.cours_code, cours_nom: c.cours_nom,
      poids_cours: c.poids_cours, poids_cours_affiche: c.poids_cours_affiche,
      aas: siennes.map(p => p.aa_code),
      note_calculee: note, note: affichee, na, faveur: forcee,
      faveur_directe: coursFaveur(c.cours_code),
      ajourne_directement: coursAjourne(c.cours_code), aas_ajournes,
      echec: !na && affichee != null && affichee < SEUIL_UE,
    };
  });
  const coursDe = {};
  for (const c of cours) coursDe[c.cours_code] = c;

  // ── 3. L'UNITÉ ───────────────────────────────────────────────────────────
  const ajourne = cours.some(c => c.na) || acquis.some(a => a.na);
  const faveur = ueFaveur || cours.some(c => c.faveur) || acquis.some(a => a.faveur);

  let noteUE = null;
  if (!ajourne) {
    if (faveur) {
      // Dès qu'une faveur a été accordée, l'unité vaut le seuil. Le décret
      // interdit d'aller au-delà quand un acquis n'est pas maîtrisé : il n'y a
      // donc rien à calculer.
      noteUE = SEUIL_UE;
    } else if (integree) {
      // Épreuve commune : l'unité se calcule sur ses acquis, pesés entre eux
      // par la somme de leurs poids — le cours ne s'interpose plus.
      const poidsAA = {};
      for (const p of paires) poidsAA[p.aa_code] = (poidsAA[p.aa_code] || 0) + (p.poids || 0);
      let num = 0, den = 0;
      for (const a of acquis) {
        if (a.na || a.note == null) continue;
        const w = poidsAA[a.aa_code] || 1;
        num += a.note * w; den += 20 * w;
      }
      noteUE = den ? Math.round((num / den) * 20 * 100) / 100 : null;
    } else {
      let num = 0, den = 0;
      for (const p of paires) {
        const c = coursDe[p.cours_code];
        const pc = c?.poids_cours;
        if (pc == null) continue;
        const v = noteDe(p.cours_code, p.aa_code);
        if (v == null) continue;                     // non évalué : hors dénominateur
        num += v * (p.poids || 0) * pc;
        den += 20 * (p.poids || 0) * pc;
      }
      noteUE = den ? Math.round((num / den) * 20 * 100) / 100 : null;
    }
  }

  // Épreuve commune : chaque cours reçoit la note de l'unité. Elle a été la
  // même pour tous — il n'y a pas de note propre à un cours à en tirer.
  if (integree && !ajourne) {
    for (const c of cours) {
      if (c.na) continue;
      c.note_calculee = noteUE;
      c.note = c.faveur || faveur ? SEUIL_UE : noteUE;
      c.echec = c.note != null && c.note < SEUIL_UE;
    }
  }

  return {
    ue_num: ueNum, annee, seuil: SEUIL_UE, epreuve_integree: integree,
    acquis, cours,
    ue: {
      note: ajourne ? null : noteUE,
      na: ajourne, faveur, faveur_ue: ueFaveur,
      echec: !ajourne && noteUE != null && noteUE < SEUIL_UE,
      a_representer: cours.filter(c => c.na).map(c => c.cours_code),
      // Ce qu'il faut représenter, cours par cours et acquis par acquis :
      // c'est ce que l'annexe 8 doit énoncer à l'étudiant.
      a_representer_detail: cours.filter(c => c.na).map(c => ({
        cours_code: c.cours_code, cours_nom: c.cours_nom, aas: c.aas,
      })),
      // La réussite de plein droit : tous les acquis et tous les cours au
      // seuil, sans qu'aucune faveur ni aucun ajournement n'ait été nécessaire.
      // Ce que la délibération DIT — la décision reste au Conseil, mais elle
      // se déduit du calcul et n'a pas à être ressaisie dans l'écran voisin.
      decision_proposee: ajourne ? 'ajourne'
        : noteUE == null ? null
        : noteUE >= SEUIL_UE ? 'reussi' : 'refuse',
      // Un échec non motivé rend la décision attaquable : on nomme ce qui
      // manque plutôt que de laisser passer.
      motifs_manquants: acquis
        .filter(a => (a.na || (a.note != null && a.note < SEUIL_UE)) && !a.motif)
        .map(a => a.aa_code),
      de_plein_droit: !ajourne && !faveur
        && acquis.length > 0 && cours.length > 0
        && acquis.every(a => a.note != null && a.note >= SEUIL_UE)
        && cours.every(c => c.note != null && c.note >= SEUIL_UE),
    },
  };
}

/**
 * L'AIDE À LA DÉCISION.
 *
 * CHAQUE UNITÉ SE JUGE POUR ELLE-MÊME. La faveur s'apprécie donc sur l'unité
 * en question : ce qu'il manque pour ramener au seuil les acquis en échec, et
 * sur combien de cours cela se répartit. Deux points au plus, sur un ou deux
 * cours — au-delà, ce n'est plus une faveur, c'est une dispense.
 *
 * Deux ÉCLAIRAGES viennent ensuite, qui ne conditionnent rien :
 *
 *  — la MOYENNE de l'année. Elle dit si l'échec est un accident de parcours ou
 *    la règle. Elle n'ouvre ni ne ferme la faveur : un bon étudiant peut avoir
 *    manqué cette unité-ci pour de bon, un étudiant en difficulté peut la
 *    mériter.
 *  — les FAVEURS DÉJÀ ACCORDÉES cette année, dans les autres unités. Sans
 *    cela, le Conseil fait cadeau sur cadeau sans le savoir : chaque unité
 *    délibérée séparément, chacune de bonne foi, et l'étudiant sort avec trois
 *    unités levées. C'est l'information qui manquait le plus.
 *
 * Rien de tout ceci n'est une règle de droit — le décret ne fixe aucun barème.
 * C'est la pratique du Conseil, écrite pour être appliquée à tous de la même
 * façon. La faveur reste à un clic, et c'est le Conseil qui décide.
 */
const FAVEUR_POINTS_MAX = 2;     // points que la faveur peut combler
const FAVEUR_COURS_MAX = 2;      // cours sur lesquels elle peut se répartir

export function aideDecision(d, moyenne, faveursAilleurs = []) {
  const manquants = d.acquis.filter(a => !a.na && a.note != null && a.note < SEUIL_UE);
  const cout = Math.round(manquants.reduce((s, a) => s + (SEUIL_UE - a.note), 0) * 100) / 100;
  const coursTouches = [...new Set(manquants.flatMap(a =>
    (a.evaluations || []).filter(v => v.note != null && v.note < SEUIL_UE)
      .map(v => v.cours_code)))];

  const dansLaLimite = cout > 0 && cout <= FAVEUR_POINTS_MAX
    && coursTouches.length <= FAVEUR_COURS_MAX;

  return {
    moyenne_annee: moyenne,
    faveur_cout: cout,
    faveur_cours: coursTouches,
    faveur_acquis: manquants.map(a => ({ aa_code: a.aa_code, manque:
      Math.round((SEUIL_UE - a.note) * 100) / 100 })),
    faveur_eligible: dansLaLimite,
    faveur_bareme: { points_max: FAVEUR_POINTS_MAX, cours_max: FAVEUR_COURS_MAX },
    faveur_motif: cout === 0 ? null
      : coursTouches.length > FAVEUR_COURS_MAX
        ? `${coursTouches.length} cours concernés — au-delà de ${FAVEUR_COURS_MAX}`
      : cout > FAVEUR_POINTS_MAX
        ? `il manque ${String(cout).replace('.', ',')} points — au-delà de ${FAVEUR_POINTS_MAX}`
      : null,
    // Ce que le Conseil a déjà accordé ailleurs, cette année.
    faveurs_ailleurs: faveursAilleurs,
  };
}

/**
 * La feuille de saisie D'UN COURS — ce que le professeur remplit.
 *
 * L'écran existant présente les acquis d'une unité, consolidés : c'est la vue
 * du Conseil. Le professeur, lui, ne connaît que SON cours et les acquis qu'il
 * y évalue. Lui demander de saisir dans la grille de l'unité, c'est lui montrer
 * les acquis de ses collègues et lui faire écraser leurs notes.
 *
 * La note est écrite sous « cours|acquis » : un acquis évalué dans deux cours
 * a donc deux notes, et chaque cours a la sienne.
 */
r.get('/cours/:coursCode/feuille', authRequired, (req, res) => {
  const coursCode = req.params.coursCode;
  const annee = req.query.annee || anneeDeTravail(req);
  const session = req.query.session === '2' ? 2 : 1;

  const co = db.prepare(`
    SELECT cours_code, cours_nom, ue_num, section FROM cours
    WHERE cours_code = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(coursCode, annee);
  if (!co) return res.status(404).json({ error: 'cours introuvable' });

  const perim = getUserSections(req.user);
  if (perim && co.section && !perim.includes(co.section)) {
    return res.status(403).json({ error: 'cours hors de votre périmètre' });
  }
  // Un professeur n'encode que les cours qui lui sont attribués : la grille
  // d'un collègue n'est pas la sienne, et l'ouvrir serait pouvoir l'écraser.
  const permis = coursAutorises(req.user, annee);
  if (permis && !permis.has(coursCode)) {
    return res.status(403).json({ error: "Ce cours ne vous est pas attribué cette année." });
  }

  // Les acquis ÉVALUÉS DANS CE COURS. La table de pondération fait foi ; à
  // défaut, ceux que le référentiel rattache au cours.
  let acquis = db.prepare(`
    SELECT p.aa_code, p.poids, a.description
    FROM aa_ponderation p
    LEFT JOIN aa a ON a.aa_code = p.aa_code AND a.ue_num = p.ue_num
    WHERE p.ue_num = ? AND p.cours_code = ? ORDER BY p.aa_code
  `).all(co.ue_num, coursCode);
  if (!acquis.length) {
    acquis = db.prepare(`
      SELECT aa_code, NULL AS poids, description FROM aa
      WHERE ue_num = ? AND cours_code = ? ORDER BY aa_num, aa_code
    `).all(co.ue_num, coursCode);
  }

  const etudiants = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ?
    ORDER BY e.nom, e.prenom
  `).all(annee, co.ue_num);

  const prefixe = `s${session}|`;
  const notes = {};
  for (const l of db.prepare(`
    SELECT etudiant_id, code, points FROM etudiant_note_detail
    WHERE annee_scolaire = ? AND ue_num = ? AND type = 'aa'
  `).all(annee, co.ue_num)) {
    const s = String(l.code);
    const avecSession = `${prefixe}${coursCode}|`;
    const sansSession = `${coursCode}|`;
    if (s.startsWith(avecSession)) {
      // La note de CE cours pour CETTE session : la plus précise, elle gagne.
      (notes[l.etudiant_id] ||= {})[s.slice(avecSession.length)] = l.points;
    } else if (session === 1 && s.startsWith(sansSession)) {
      // Écrite avant que les sessions ne soient distinguées : elle vaut pour
      // la première, et ne recouvre pas une note explicite.
      const aa = s.slice(sansSession.length);
      const e = (notes[l.etudiant_id] ||= {});
      if (e[aa] == null) e[aa] = l.points;
    }
  }

  res.json({
    cours: co, annee, session, acquis, etudiants, notes,
    // L'épreuve est commune à l'unité : ce n'est pas ici qu'on encode.
    epreuve_integree: estEpreuveIntegree(co.ue_num, annee),
    // Sans acquis rattaché, la saisie par cours n'a rien à montrer : mieux
    // vaut le dire que d'afficher une grille vide.
    sans_acquis: !acquis.length,
    sans_ponderation: acquis.length > 0 && acquis.every(a => a.poids == null),
  });
});

/** L'unité est-elle évaluée par une épreuve commune ? */
r.get('/ue/:ueNum/epreuve-integree', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  res.json({ ue_num: Number(req.params.ueNum), annee,
             actif: estEpreuveIntegree(req.params.ueNum, annee) });
});

r.put('/ue/:ueNum/epreuve-integree', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.body?.annee || req.query.annee || anneeDeTravail(req);
  const actif = req.body?.actif ? 1 : 0;
  db.prepare(`
    INSERT INTO ue_epreuve_integree (ue_num, annee_scolaire, actif, maj_le, maj_par)
    VALUES (?,?,?, datetime('now'), ?)
    ON CONFLICT(ue_num, annee_scolaire) DO UPDATE SET
      actif = excluded.actif, maj_le = datetime('now'), maj_par = excluded.maj_par
  `).run(ueNum, annee, actif, req.user?.email || null);
  res.json({ ok: true, ue_num: ueNum, annee, actif: !!actif });
});

/** Les cours d'une unité, pour choisir lequel encoder. */
r.get('/ue/:ueNum/cours', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const ueNum = Number(req.params.ueNum);
  // Un professeur n'encode que ses propres cours.
  const permis = coursAutorises(req.user, annee);
  const st = structureUE(ueNum, annee)
    .filter(c => !permis || permis.has(c.cours_code));
  res.json(st.map(c => ({
    cours_code: c.cours_code, cours_nom: c.cours_nom,
    poids_cours_affiche: c.poids_cours_affiche ?? null,
    nb_acquis: (c.aas || []).length,
  })));
});

/**
 * La feuille de délibération d'une UNITÉ : tous ses étudiants, calculés.
 *
 * Le calcul par étudiant existe (delibererUE) ; il manquait la vue d'ensemble,
 * celle sur laquelle le Conseil siège. On y lit, pour chacun : les acquis AU
 * GLOBAL — non par cours —, puis la note de chaque cours, puis celle de
 * l'unité.
 */
r.get('/deliberation/ue/:ueNum', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);

  const ue = db.prepare(`
    SELECT ue_nom, section FROM ue WHERE ue_num = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(ueNum, annee) || {};
  const perim = getUserSections(req.user);
  if (perim && ue.section && !perim.includes(ue.section)) {
    return res.status(403).json({ error: 'unité hors de votre périmètre' });
  }

  const etudiants = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus, i.resultat, i.points
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ?
    ORDER BY e.nom, e.prenom
  `).all(annee, ueNum);

  // LA MOYENNE DE L'ANNÉE, pour tous ces étudiants d'un coup. Elle sert
  // l'aide à la décision : un étudiant qui tient une bonne moyenne générale
  // n'est pas dans la situation de celui qui échoue partout, et le Conseil
  // apprécie autrement le point qui lui manque ici.
  //
  // Définition identique à celle du bilan de parcours : pondérée par les
  // périodes étudiant du dossier pédagogique, les unités sans note exclues.
  const perUE = Object.fromEntries(db.prepare(`
    SELECT ue_num, MAX(ue_per_etudiants) AS per FROM ue GROUP BY ue_num
  `).all().map(r => [r.ue_num, r.per]));
  const moyennes = {};
  {
    const acc = {};
    for (const i of db.prepare(`
      SELECT etudiant_id, ue_num, points FROM etudiant_inscription
      WHERE annee_scolaire = ? AND points IS NOT NULL
    `).all(annee)) {
      const p = Number(perUE[i.ue_num]) || 0;
      if (!p) continue;
      const a = (acc[i.etudiant_id] ||= { num: 0, den: 0 });
      a.num += Number(i.points) * p; a.den += p;
    }
    for (const [id, a] of Object.entries(acc)) {
      moyennes[id] = a.den ? Math.round((a.num / a.den) * 100) / 100 : null;
    }
  }

  // LES FAVEURS DÉJÀ ACCORDÉES cette année, dans les AUTRES unités. Sans
  // cela, chaque unité se délibère de bonne foi et l'étudiant ressort avec
  // trois unités levées que personne n'a vues ensemble.
  const dejaFaveur = {};
  for (const l of db.prepare(`
    SELECT DISTINCT a.etudiant_id, a.ue_num
    FROM deliberation_ajustement a
    WHERE a.annee_scolaire = ? AND a.action = 'faveur' AND a.ue_num <> ?
  `).all(annee, ueNum)) {
    (dejaFaveur[l.etudiant_id] ||= []).push(l.ue_num);
  }
  // Une unité levée en faveur puis décidée « réussie » à exactement le seuil
  // reste une faveur : on la nomme telle quelle.
  const nomUE = Object.fromEntries(db.prepare(
    'SELECT ue_num, MAX(ue_nom) AS n FROM ue GROUP BY ue_num').all().map(r => [r.ue_num, r.n]));

  const lignes = etudiants.map(e => {
    const d = delibererUE(e.id, ueNum, annee);
    const ailleurs = (dejaFaveur[e.id] || []).sort((a, b) => a - b)
      .map(n => ({ ue_num: n, ue_nom: nomUE[n] || null }));
    return { ...e, ...d,
      parcours: parcoursDeLAnnee(e.id, annee),
      ue: { ...d.ue, ...aideDecision(d, moyennes[e.id] ?? null, ailleurs) } };
  });

  // Les colonnes se prennent sur la première ligne calculée : la structure de
  // l'unité est la même pour tous, seules les notes changent.
  const modele = lignes[0] || delibererUE(0, ueNum, annee);

  res.json({
    ue_num: ueNum, ue_nom: ue.ue_nom || `UE ${ueNum}`, section: ue.section || null,
    annee, seuil: SEUIL_UE, epreuve_integree: estEpreuveIntegree(ueNum, annee),
    colonnes_acquis: modele.acquis.map(a => ({ aa_code: a.aa_code, description: a.description })),
    colonnes_cours: modele.cours.map(c => ({
      cours_code: c.cours_code, cours_nom: c.cours_nom,
      poids_cours_affiche: c.poids_cours_affiche ?? null,
    })),
    etudiants: lignes,
    // Ce qui empêcherait la feuille d'avoir un sens, dit franchement.
    sans_structure: !modele.cours.length || !modele.acquis.length,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LA SÉANCE DU CONSEIL DES ÉTUDES
//
// Une délibération est une SÉANCE : elle s'ouvre par la composition du Conseil
// et les présences, elle se clôt par la date de visite des copies. Ces deux
// bornes ne sont pas de l'administration : la composition fonde la validité de
// la décision, et la visite des copies est un droit de l'étudiant. Les laisser
// hors de l'outil, c'était les laisser à la mémoire de celui qui préside.
// ═══════════════════════════════════════════════════════════════════════════

(function migrerSeance() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS deliberation_seance (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        ue_num         INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        date_seance    TEXT,
        visite_date    TEXT,
        visite_heure   TEXT,
        visite_local   TEXT,
        cloturee       INTEGER NOT NULL DEFAULT 0,
        maj_le         TEXT DEFAULT CURRENT_TIMESTAMP,
        maj_par        TEXT,
        UNIQUE(ue_num, annee_scolaire)
      );
      CREATE TABLE IF NOT EXISTS deliberation_presence (
        seance_id      INTEGER NOT NULL,
        cle            TEXT    NOT NULL,
        nom            TEXT    NOT NULL,
        qualite        TEXT,
        present        INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (seance_id, cle)
      );
    `);
  } catch (e) { console.error('[migration] deliberation_seance :', e.message); }
})();

/**
 * La composition du Conseil pour une unité.
 *
 * Y siègent de droit tous les professeurs qui y ont des heures — c'est
 * l'attribution qui le dit, il n'y a pas d'autre source —, la coordination de
 * la section au titre du suivi pédagogique, et la direction ou son
 * représentant. On ne coche que la présence : la composition, elle, se déduit.
 */
function membresDuConseil(ueNum, annee) {
  const membres = [];

  for (const p of db.prepare(`
    SELECT DISTINCT p.id, p.nom, p.prenom
    FROM attribution a JOIN professeur p ON p.id = a.professeur_id
    WHERE a.ue_num = ? AND a.annee_scolaire = ? AND a.professeur_id IS NOT NULL
    ORDER BY p.nom, p.prenom
  `).all(ueNum, annee)) {
    // Les cours qu'il porte dans CETTE unité : c'est à ce titre qu'il siège.
    const cours = db.prepare(`
      SELECT DISTINCT code_cours FROM attribution
      WHERE professeur_id = ? AND ue_num = ? AND annee_scolaire = ?
        AND code_cours IS NOT NULL ORDER BY code_cours
    `).all(p.id, ueNum, annee).map(c => c.code_cours);
    membres.push({
      cle: `prof:${p.id}`, nom: `${p.nom} ${p.prenom}`,
      qualite: cours.length ? `Professeur · ${cours.join(', ')}` : 'Professeur',
      role: 'professeur',
    });
  }

  const ue = db.prepare(`
    SELECT section FROM ue WHERE ue_num = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(ueNum, annee) || {};
  if (ue.section) {
    const sec = db.prepare('SELECT responsable FROM section WHERE code = ?').get(ue.section);
    membres.push({
      cle: 'coordination', nom: sec?.responsable || `Coordination ${ue.section}`,
      qualite: 'Coordination de section · suivi pédagogique', role: 'coordination',
    });
  }

  let directeur = null;
  try { directeur = identiteEtablissement()?.directeur || null; } catch { /* défaut ci-dessous */ }
  membres.push({
    cle: 'direction', nom: directeur || 'Direction',
    qualite: 'Direction ou son représentant', role: 'direction',
  });

  return membres;
}

r.get('/deliberation/ue/:ueNum/seance', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);

  const seance = db.prepare(
    'SELECT * FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ?'
  ).get(ueNum, annee) || null;

  const poses = seance ? Object.fromEntries(db.prepare(
    'SELECT cle, present, nom, qualite FROM deliberation_presence WHERE seance_id = ?'
  ).all(seance.id).map(l => [l.cle, l])) : {};

  // Les membres se recalculent à chaque ouverture : une attribution a pu
  // changer depuis la dernière séance, et la liste doit le refléter.
  const membres = membresDuConseil(ueNum, annee).map(m => ({
    ...m,
    nom: poses[m.cle]?.nom || m.nom,
    present: poses[m.cle] ? !!poses[m.cle].present : true,
  }));
  // Un membre ajouté à la main lors d'une séance précédente y reste.
  for (const [cle, l] of Object.entries(poses)) {
    if (!membres.some(m => m.cle === cle)) {
      membres.push({ cle, nom: l.nom, qualite: l.qualite, role: 'ajoute', present: !!l.present });
    }
  }

  res.json({ ue_num: ueNum, annee, seance, membres });
});

r.put('/deliberation/ue/:ueNum/seance', authRequired,
      roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.body?.annee || anneeDeTravail(req);
  const { membres, date_seance, visite_date, visite_heure, visite_local, cloturee } = req.body || {};

  db.transaction(() => {
    db.prepare(`
      INSERT INTO deliberation_seance
        (ue_num, annee_scolaire, date_seance, visite_date, visite_heure, visite_local,
         cloturee, maj_le, maj_par)
      VALUES (?,?,?,?,?,?,?, datetime('now'), ?)
      ON CONFLICT(ue_num, annee_scolaire) DO UPDATE SET
        date_seance  = COALESCE(excluded.date_seance,  deliberation_seance.date_seance),
        visite_date  = COALESCE(excluded.visite_date,  deliberation_seance.visite_date),
        visite_heure = COALESCE(excluded.visite_heure, deliberation_seance.visite_heure),
        visite_local = COALESCE(excluded.visite_local, deliberation_seance.visite_local),
        cloturee     = MAX(excluded.cloturee, deliberation_seance.cloturee),
        maj_le = datetime('now'), maj_par = excluded.maj_par
    `).run(ueNum, annee, date_seance || null, visite_date || null, visite_heure || null,
           visite_local || null, cloturee ? 1 : 0, req.user?.email || null);

    if (Array.isArray(membres)) {
      const s = db.prepare(
        'SELECT id FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ?'
      ).get(ueNum, annee);
      const up = db.prepare(`
        INSERT INTO deliberation_presence (seance_id, cle, nom, qualite, present)
        VALUES (?,?,?,?,?)
        ON CONFLICT(seance_id, cle) DO UPDATE SET
          nom = excluded.nom, qualite = excluded.qualite, present = excluded.present`);
      for (const m of membres) {
        if (!m?.cle || !m?.nom) continue;
        up.run(s.id, m.cle, m.nom, m.qualite || null, m.present ? 1 : 0);
      }
    }
  })();

  const seance = db.prepare(
    'SELECT * FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ?'
  ).get(ueNum, annee);
  res.json({ ok: true, seance });
});

/**
 * ANNULER UNE DÉLIBÉRATION — revenir à ce qui a été encodé.
 *
 * CE QUI EST EFFACÉ : les décisions portées sur les inscriptions (résultat,
 * cote, mention), les ajustements du Conseil (faveurs et ajournements), et la
 * clôture de la séance avec sa date de visite des copies.
 *
 * CE QUI EST GARDÉ : les NOTES ENCODÉES — c'est le travail des professeurs, il
 * n'a pas à disparaître parce que le Conseil recommence. Les motivations
 * d'échec aussi : elles sont écrites à la main, elles resserviront, et elles ne
 * s'affichent que sur un acquis en échec. Les présences aussi : le Conseil est
 * le même.
 *
 * Un étudiant peut être annulé seul, quand c'est son dossier qu'on a manqué.
 */
r.delete('/deliberation/ue/:ueNum', authRequired,
         roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);
  const etudId = req.query.etudiant_id ? Number(req.query.etudiant_id) : null;

  const perim = getUserSections(req.user);
  const ue = db.prepare(`
    SELECT section FROM ue WHERE ue_num = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(ueNum, annee) || {};
  if (perim && ue.section && !perim.includes(ue.section)) {
    return res.status(403).json({ error: 'unité hors de votre périmètre' });
  }

  let decisions = 0, ajustements = 0;
  db.transaction(() => {
    const cond = etudId ? ' AND etudiant_id = ?' : '';
    const args = etudId ? [annee, ueNum, etudId] : [annee, ueNum];

    decisions = db.prepare(`
      UPDATE etudiant_inscription SET resultat = NULL, points = NULL, mention = NULL
      WHERE annee_scolaire = ? AND ue_num = ?${cond}
        AND (resultat IS NOT NULL OR points IS NOT NULL OR mention IS NOT NULL)
    `).run(...args).changes;

    ajustements = db.prepare(`
      DELETE FROM deliberation_ajustement
      WHERE annee_scolaire = ? AND ue_num = ?${cond}
    `).run(...args).changes;

    // La séance ne se rouvre que si l'on annule l'unité entière.
    if (!etudId) {
      db.prepare(`
        UPDATE deliberation_seance
        SET cloturee = 0, visite_date = NULL, visite_heure = NULL, visite_local = NULL,
            maj_le = datetime('now'), maj_par = ?
        WHERE ue_num = ? AND annee_scolaire = ?
      `).run(req.user?.email || null, ueNum, annee);
    }
  })();

  res.json({ ok: true, ue_num: ueNum, annee, etudiant_id: etudId,
             decisions_effacees: decisions, ajustements_effaces: ajustements });
});

/**
 * LE PROCÈS-VERBAL DE DÉLIBÉRATION.
 *
 * Circulaire « Sanction des études », annexe 3 pour une unité ordinaire,
 * annexe 5 pour une unité « épreuve intégrée » — le Conseil des études y
 * devient Jury d'épreuve intégrée, et c'est la seule différence de fond.
 *
 * Le modèle est repris tel quel : ses colonnes (seuil de réussite, total des
 * points en %, décision finale), sa formule d'ouverture, ses mentions de pied.
 * Le pourcentage n'est porté qu'en cas de réussite, comme la note 1 du modèle
 * l'impose — un échec ne se chiffre pas dans un procès-verbal.
 */
r.get('/deliberation/ue/:ueNum/pv', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);
  const session = req.query.session === '2' ? 2 : 1;

  const ue = db.prepare(`
    SELECT ue_nom, section, ue_per_etudiants, ue_code_fwb, ue_niv, ue_niveau
    FROM ue WHERE ue_num = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(ueNum, annee) || {};
  const integree = estEpreuveIntegree(ueNum, annee);
  const sec = ue.section
    ? db.prepare('SELECT libelle, niveau, code_fwb FROM section WHERE code = ?').get(ue.section)
    : null;

  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};
  // L'identité vient d'une table de configuration : si elle manque, le PV doit
  // sortir quand même, avec des blancs, plutôt que de tomber en 500.
  let ident = {};
  try { ident = identiteEtablissement() || {}; } catch { ident = {}; }

  const seance = db.prepare(
    'SELECT * FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ?'
  ).get(ueNum, annee) || {};
  const presents = seance.id ? db.prepare(
    'SELECT nom, qualite FROM deliberation_presence WHERE seance_id = ? AND present = 1'
  ).all(seance.id) : [];

  // Le lieu de naissance est ajouté par une migration des attestations, non
  // par le schéma de base : on le demande s'il existe, et le procès-verbal
  // sort sans lui sinon plutôt que de tomber.
  const aLieu = db.prepare("PRAGMA table_info(etudiant)").all()
    .some(c => c.name === 'lieu_naissance');
  const etudiants = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.date_naissance,
           ${aLieu ? 'e.lieu_naissance' : 'NULL AS lieu_naissance'},
           i.resultat, i.points
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ?
    ORDER BY e.nom, e.prenom
  `).all(annee, ueNum);

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const jour = d => {
    if (!d) return '';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
  };
  const LIB = { reussi: 'Réussite', ajourne: 'Ajournement', refuse: 'Refus', absent: 'Absence' };

  const lignes = etudiants.map(e => {
    // « A ne compléter qu'en cas de Réussite » : le pourcentage ne figure au
    // procès-verbal que lorsque l'unité est réussie.
    const pct = e.resultat === 'reussi' && e.points != null
      ? `${Math.round(Number(e.points) * 5)} %` : '';
    return `<tr>
      <td>${esc(`${e.nom} ${e.prenom}`)}</td>
      <td>${esc([e.lieu_naissance, jour(e.date_naissance)].filter(Boolean).join(', '))}</td>
      <td class="c">50 %</td>
      <td class="c">${pct}</td>
      <td class="c">${esc(LIB[e.resultat] || '')}</td>
    </tr>`;
  }).join('');

  const conseil = integree ? "Jury d'épreuve intégrée" : 'Conseil des études';

  const corps = `
    <div class="entete">
      <div>COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
      <div>ENSEIGNEMENT DE PROMOTION SOCIALE</div>
      <div>ANNÉE SCOLAIRE / ANNÉE ACADÉMIQUE : ${esc(annee)}</div>
      <div>${/sup|bach|bes|master/i.test(ue.ue_niv || sec?.niveau || '')
        ? 'ENSEIGNEMENT SUPÉRIEUR' : 'ENSEIGNEMENT SECONDAIRE'}</div>
    </div>

    <div class="etab">
      <div class="nom">${esc(ident.nom || etab.etab_nom || '')}</div>
      <div>Adresse : ${esc(ident.adresse || etab.adresse || '')}</div>
      <div>Numéro de matricule : ${esc(ident.matricule || etab.num_ecot || '')}</div>
      <div>Numéro FASE : ${esc(ident.fase || etab.num_fase || '')}</div>
      <div>Date de délibération de la ${session}<sup>${session === 1 ? 're' : 'e'}</sup> session :
        ${esc(jour(seance.date_seance) || '……………')}</div>
    </div>

    <h1 class="titre">PROCÈS-VERBAL DE DÉLIBÉRATION D'UNE UNITÉ D'ENSEIGNEMENT${
      integree ? '<br><span class="ei">« ÉPREUVE INTÉGRÉE »</span>' : ''}</h1>

    <p class="formule">
      Nous, soussignés, Président-e et Membres du ${esc(conseil)} constitué par le
      Pouvoir organisateur de l'établissement précité en vue de la délivrance de
      l'attestation de réussite de l'unité d'enseignement :
    </p>

    <table class="ue">
      <tr>
        <th>Intitulé de l'unité d'enseignement</th>
        <th>Nombre de périodes</th>
        <th>Numéro de code</th>
      </tr>
      <tr>
        <td>${esc(ue.ue_nom || `UE ${ueNum}`)}</td>
        <td class="c">${esc(ue.ue_per_etudiants ?? '')}</td>
        <td class="c">${esc(ue.ue_code_fwb || '')}</td>
      </tr>
    </table>
    ${integree ? `
    <p class="formule">
      de la section : ${esc(sec?.libelle || ue.section || '')}<br>
      Section approuvée par le Gouvernement sous le numéro de code :
      ${esc(sec?.code_fwb || '……………………')}
    </p>` : ''}

    <p class="formule">Après en avoir délibéré, avons pris les décisions suivantes :</p>

    <table class="decisions">
      <thead>
        <tr>
          <th>Nom, prénom et initiales des autres prénoms</th>
          <th>Lieu et date de naissance<br><span class="pt">(Pays si pas la Belgique)</span></th>
          <th>Seuil de réussite</th>
          <th>Total des points en %<sup>1</sup></th>
          <th>Décision finale</th>
        </tr>
      </thead>
      <tbody>${lignes || '<tr><td colspan="5" class="c">—</td></tr>'}</tbody>
    </table>
    <p class="note"><sup>1</sup> À ne compléter qu'en cas de « Réussite ».</p>

    <p class="formule">Le présent procès-verbal comporte …… pages.</p>
    <p class="formule">Le ${esc(conseil)} a délibéré le
      ${esc(jour(seance.date_seance) || '……………')}.</p>
    <p class="formule">Les résultats sont communiqués conformément au ROI de
      l'établissement le ${esc(jour(seance.visite_date) || '……………')}${
      seance.visite_heure ? ` à ${esc(seance.visite_heure)}` : ''}${
      seance.visite_local ? `, ${esc(seance.visite_local)}` : ''}.</p>

    <div class="signatures">
      <div class="membres">
        <div class="lab">Le ${esc(conseil)},</div>
        ${presents.length
          ? presents.map(m => `<div class="m">${esc(m.nom)}
              <span class="q">${esc(m.qualite || '')}</span></div>`).join('')
          : '<div class="m vide">Les présences n\'ont pas été enregistrées.</div>'}
      </div>
      <div class="sceau">
        <div class="lab">Sceau de l'établissement</div>
        <img src="${SCEAU_IIP}" alt="">
      </div>
      <div class="direction">
        <div class="lab">Fait en un exemplaire,<br>
          à ${esc(ident.ville || 'Bruxelles')},<br>
          le ${esc(jour(seance.date_seance) || '……………')}</div>
        <img src="${SIGNATURE_SOHET}" alt="">
        <div class="nom">${esc(ident.directeur || '')}</div>
        <div class="q">Le Directeur</div>
      </div>
    </div>`;

  const html = envelopperDocument({
    html: corps, titre: `PV de délibération — UE ${ueNum}`,
    styles: `
      .entete { text-align: center; font-size: 9pt; line-height: 1.45;
                text-transform: uppercase; letter-spacing: .2pt; }
      .etab { margin: 4mm 0 2mm; font-size: 9.5pt; line-height: 1.5; }
      .etab .nom { font-weight: bold; text-transform: uppercase; }
      h1.titre { text-align: center; font-size: 12.5pt; margin: 5mm 0 3mm;
                 text-transform: uppercase; letter-spacing: .3pt; }
      h1.titre .ei { font-size: 11pt; }
      .formule { font-size: 9.5pt; line-height: 1.5; margin: 2mm 0; }
      table.ue td, table.ue th { font-size: 9.5pt; }
      table.decisions { font-size: 9pt; }
      table.decisions th { background: #f1f5f9; font-weight: bold; text-align: left; }
      table.decisions td { height: 8mm; }
      .c { text-align: center; }
      .pt { font-weight: normal; font-size: 8pt; }
      .note { font-size: 8pt; color: #475569; margin: 1mm 0 4mm; }
      .signatures { display: flex; gap: 8mm; margin-top: 8mm;
                    page-break-inside: avoid; }
      .signatures > div { flex: 1; font-size: 9pt; }
      .signatures .lab { font-weight: bold; margin-bottom: 2mm; }
      .signatures .m { margin-bottom: 1.2mm; }
      .signatures .m .q { display: block; font-size: 7.5pt; color: #64748b; }
      .signatures .m.vide { color: #94a3b8; font-style: italic; }
      .signatures .sceau { text-align: center; }
      .signatures img { max-height: 22mm; }
      .signatures .direction { text-align: center; }
      .signatures .direction .nom { font-weight: bold; }
      .signatures .direction .q { font-size: 8pt; color: #475569; }
    `,
  });

  res.json({
    html,
    nom: `PV_deliberation_UE${ueNum}_${String(annee).replace(/\W/g, '')}.html`,
    annexe: integree ? 5 : 3,
    etudiants: etudiants.length,
    // Ce qui manque au procès-verbal se dit : il est signé, il doit être juste.
    manques: [
      !seance.date_seance && 'la date de délibération',
      !presents.length && 'les présences du Conseil',
      !seance.visite_date && 'la date de communication des résultats',
      !ue.ue_code_fwb && "le numéro de code de l'unité",
      ue.ue_per_etudiants == null && "le nombre de périodes de l'unité",
      etudiants.some(e => !e.resultat) && 'des décisions non enregistrées',
    ].filter(Boolean),
  });
});

/**
 * LA DÉLIBÉRATION AUTOMATIQUE DES RÉUSSITES DE PLEIN DROIT.
 *
 * Un étudiant qui a tous ses acquis au seuil ET tous ses cours au seuil réussit
 * de plein droit : le Conseil n'a rien à apprécier, et lui faire ouvrir cent
 * fiches pour cliquer cent fois « réussi » n'ajoute aucune garantie. Il ne
 * reste alors au Conseil que les cas qui le méritent.
 *
 * GET liste les concernés ; POST enregistre leur décision. Rien d'autre n'est
 * automatisé : un échec, une faveur, un ajournement restent des décisions.
 */
r.get('/deliberation/ue/:ueNum/plein-droit', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);
  const etudiants = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus, i.resultat
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ? ORDER BY e.nom, e.prenom
  `).all(annee, ueNum);

  const lignes = etudiants.map(e => {
    const d = delibererUE(e.id, ueNum, annee);
    return { ...e, note: d.ue.note, de_plein_droit: d.ue.de_plein_droit,
             deja_decide: !!e.resultat };
  });
  res.json({
    ue_num: ueNum, annee,
    reussites: lignes.filter(l => l.de_plein_droit),
    a_deliberer: lignes.filter(l => !l.de_plein_droit),
  });
});

r.post('/deliberation/ue/:ueNum/plein-droit', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.body?.annee || anneeDeTravail(req);
  // On n'enregistre que ce que le serveur a lui-même reconnu : une liste
  // fournie par le client ne fait pas foi pour une décision.
  const ids = Array.isArray(req.body?.etudiants) ? req.body.etudiants.map(Number) : null;

  const inscrits = db.prepare(`
    SELECT id, etudiant_id, resultat FROM etudiant_inscription
    WHERE annee_scolaire = ? AND ue_num = ?
  `).all(annee, ueNum);

  const maj = db.prepare('UPDATE etudiant_inscription SET resultat = ?, points = ? WHERE id = ?');
  const faits = [];
  db.transaction(() => {
    for (const i of inscrits) {
      if (ids && !ids.includes(i.etudiant_id)) continue;
      const d = delibererUE(i.etudiant_id, ueNum, annee);
      if (!d.ue.de_plein_droit) continue;
      maj.run('reussi', d.ue.note, i.id);
      faits.push({ etudiant_id: i.etudiant_id, note: d.ue.note });
    }
  })();
  res.json({ ok: true, enregistres: faits.length, etudiants: faits });
});

r.get('/deliberation/:etudId/:ueNum', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  try {
    res.json(delibererUE(Number(req.params.etudId), Number(req.params.ueNum), annee));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Poser ou retirer un ajustement. `action: null` retire. */
r.put('/deliberation/ajustement', authRequired,
      roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { etudiant_id, annee_scolaire, ue_num, portee, code, action } = req.body || {};
  if (!etudiant_id || !annee_scolaire || !ue_num || !portee || !code) {
    return res.status(400).json({ error: 'étudiant, année, unité, portée et code requis' });
  }
  if (!['aa', 'cours', 'ue'].includes(portee)) return res.status(400).json({ error: 'portée invalide' });
  if (action != null && !['faveur', 'ajourne'].includes(action)) {
    return res.status(400).json({ error: 'action invalide' });
  }
  if (action == null) {
    db.prepare(`DELETE FROM deliberation_ajustement
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND portee = ? AND code = ?`)
      .run(Number(etudiant_id), annee_scolaire, Number(ue_num), portee, code);
  } else {
    db.prepare(`
      INSERT INTO deliberation_ajustement
        (etudiant_id, annee_scolaire, ue_num, portee, code, action, maj_par)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(etudiant_id, annee_scolaire, ue_num, portee, code)
      DO UPDATE SET action = excluded.action, maj_le = CURRENT_TIMESTAMP, maj_par = excluded.maj_par
    `).run(Number(etudiant_id), annee_scolaire, Number(ue_num), portee, code, action,
           req.user?.email || null);
  }
  // On renvoie l'étudiant recalculé AVEC son aide à la décision : sans elle,
  // poser un ajustement faisait disparaître de l'écran le coût de la faveur et
  // les faveurs déjà accordées ailleurs — au moment précis où l'on décide.
  res.json(avecAide(Number(etudiant_id), Number(ue_num), annee_scolaire));
});

/**
 * LE PARCOURS DE L'ANNÉE d'un étudiant : ses autres unités, leur décision, et
 * celles qui ont été levées en faveur.
 *
 * C'est ce qui manquait à l'écran de délibération pour se suffire à lui-même :
 * on jugeait une unité sans voir les autres, et il fallait ouvrir une seconde
 * fenêtre pour savoir de qui l'on parlait.
 */
export function parcoursDeLAnnee(etudId, annee) {
  const faveurs = new Set(db.prepare(`
    SELECT DISTINCT ue_num FROM deliberation_ajustement
    WHERE etudiant_id = ? AND annee_scolaire = ? AND action = 'faveur'
  `).all(etudId, annee).map(r => r.ue_num));

  return db.prepare(`
    SELECT i.ue_num, i.resultat, i.points,
           (SELECT MAX(ue_nom) FROM ue WHERE ue_num = i.ue_num) AS ue_nom,
           (SELECT MAX(ue_per_etudiants) FROM ue WHERE ue_num = i.ue_num) AS periodes,
           (SELECT MAX(ects) FROM ue WHERE ue_num = i.ue_num) AS ects
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    ORDER BY i.ue_num
  `).all(etudId, annee).map(u => ({ ...u, faveur: faveurs.has(u.ue_num) }));
}

/** Un étudiant délibéré, augmenté de son aide à la décision. */
export function avecAide(etudId, ueNum, annee) {
  const d = delibererUE(etudId, ueNum, annee);

  // La moyenne de l'année, pondérée par les périodes étudiant — même
  // définition que le bilan de parcours.
  let num = 0, den = 0;
  for (const i of db.prepare(`
    SELECT ue_num, points FROM etudiant_inscription
    WHERE etudiant_id = ? AND annee_scolaire = ? AND points IS NOT NULL
  `).all(etudId, annee)) {
    const p = Number(db.prepare(
      'SELECT MAX(ue_per_etudiants) AS p FROM ue WHERE ue_num = ?').get(i.ue_num)?.p) || 0;
    if (!p) continue;
    num += Number(i.points) * p; den += p;
  }
  const moyenne = den ? Math.round((num / den) * 100) / 100 : null;

  const ailleurs = db.prepare(`
    SELECT DISTINCT a.ue_num, (SELECT MAX(ue_nom) FROM ue WHERE ue_num = a.ue_num) AS ue_nom
    FROM deliberation_ajustement a
    WHERE a.etudiant_id = ? AND a.annee_scolaire = ? AND a.action = 'faveur'
      AND a.ue_num <> ?
    ORDER BY a.ue_num
  `).all(etudId, annee, ueNum);

  return { ...d, parcours: parcoursDeLAnnee(etudId, annee),
           ue: { ...d.ue, ...aideDecision(d, moyenne, ailleurs) } };
}

export default r;

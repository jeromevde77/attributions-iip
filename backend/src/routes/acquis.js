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
import { authRequired, roleRequired } from '../middleware/auth.js';
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
  const somme = ponderations.reduce((s, p) => s + Number(p.poids || 0), 0);
  if (ponderations.length && Math.abs(somme - 100) > 0.01) {
    return res.status(400).json({
      error: `La somme des pondérations de ce cours vaut ${Math.round(somme * 100) / 100} au lieu de 100.`,
    });
  }

  const up = db.prepare(`
    INSERT INTO aa_ponderation (ue_num, cours_code, aa_code, poids, maj_le)
    VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(cours_code, aa_code) DO UPDATE SET
      poids = excluded.poids, ue_num = excluded.ue_num, maj_le = datetime('now')
  `);
  db.transaction(() => {
    for (const p of ponderations) {
      up.run(Number(ue_num), cours_code, p.aa_code, Number(p.poids || 0));
    }
  })();
  res.json({ ok: true, cours_code, somme: Math.round(somme * 100) / 100 });
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

export default r;

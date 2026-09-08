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
import { SIGNATURE_SOHET, SCEAU_IIP } from '../services/assets/signature_sohet.js';
import { identiteEtablissement } from './config.js';
// Les trois pièces de la délibération — attestation de réussite, motivation
// d'ajournement ou de refus, procès-verbal — partagent une seule mise en page.
// Le contenu légal diffère ; la charte, non.
import { envelopper, unitesReussies, pageAttestation } from './attestations.js';

const r = Router();

export function migrerSessions(dbx) {
  // Chaque migration dans son propre try : groupées, la première qui échoue
  // emportait les suivantes, et la table des résultats n'était jamais créée.
  try {
    // Les ajustements : une colonne, et l'unicité qui s'y adapte.
    const ddl = dbx.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='deliberation_ajustement'"
    ).get()?.sql || '';
    if (ddl && !ddl.includes('session')) {
      // On RECONSTRUIT la table : l'unicité d'origine porte sur
      // (étudiant, année, unité, portée, code) et interdit donc au même cours
      // d'être ajourné en deux sessions. Une contrainte UNIQUE de déclaration
      // ne se laisse pas défaire par un DROP INDEX.
      dbx.transaction(() => dbx.exec(`
        CREATE TABLE deliberation_ajustement_v3 (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          etudiant_id    INTEGER NOT NULL,
          annee_scolaire TEXT    NOT NULL,
          ue_num         INTEGER NOT NULL,
          session        INTEGER NOT NULL DEFAULT 1,
          portee         TEXT    NOT NULL CHECK (portee IN ('aa','cours','ue')),
          code           TEXT    NOT NULL,
          action         TEXT    NOT NULL CHECK (action IN ('faveur','ajourne')),
          maj_le         TEXT DEFAULT CURRENT_TIMESTAMP,
          maj_par        TEXT,
          UNIQUE(etudiant_id, annee_scolaire, ue_num, session, portee, code)
        );
        INSERT INTO deliberation_ajustement_v3
          (id, etudiant_id, annee_scolaire, ue_num, session, portee, code, action, maj_le, maj_par)
          SELECT id, etudiant_id, annee_scolaire, ue_num, 1, portee, code, action, maj_le, maj_par
          FROM deliberation_ajustement;
        DROP TABLE deliberation_ajustement;
        ALTER TABLE deliberation_ajustement_v3 RENAME TO deliberation_ajustement;
        CREATE INDEX IF NOT EXISTS idx_delib_ajust
          ON deliberation_ajustement(etudiant_id, annee_scolaire, ue_num);
      `))();
      console.log('[migration] deliberation_ajustement : session ajoutée');
    }
  } catch (e) { console.error('[migration] ajustement.session :', e.message); }

  try {
    // La séance : une par session.
    const ddlS = dbx.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='deliberation_seance'"
    ).get()?.sql || '';
    if (ddlS && !/session\s+INTEGER/.test(ddlS)) {
      // RECONSTRUCTION, non ALTER : l'unicité déclarée sur (unité, année)
      // interdit deux séances la même année, donc une séance de seconde
      // session. Une contrainte UNIQUE de déclaration ne se défait pas par un
      // DROP INDEX ; il faut refaire la table.
      //
      // Les colonnes ajoutées après coup (visite, session2…) sont reprises
      // telles qu'elles existent : on lit la liste réelle plutôt que de la
      // supposer, un ALTER ayant pu passer sur certaines bases et pas sur
      // d'autres.
      const cols = dbx.prepare('PRAGMA table_info(deliberation_seance)').all()
        .map(c => c.name).filter(n => n !== 'id' && n !== 'session');
      const liste = cols.join(', ');
      dbx.transaction(() => {
        dbx.exec(`
          CREATE TABLE deliberation_seance_v2 (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            ue_num         INTEGER NOT NULL,
            annee_scolaire TEXT    NOT NULL,
            session        INTEGER NOT NULL DEFAULT 1,
            date_seance    TEXT,
            heure_seance   TEXT,
            visite_date    TEXT,
            visite_heure   TEXT,
            visite_local   TEXT,
            session2_date  TEXT,
            session2_heure TEXT,
            session2_local TEXT,
            session2_adresse TEXT,
            cloturee       INTEGER NOT NULL DEFAULT 0,
            maj_le         TEXT DEFAULT CURRENT_TIMESTAMP,
            maj_par        TEXT,
            UNIQUE(ue_num, annee_scolaire, session)
          );`);
        dbx.exec(`INSERT INTO deliberation_seance_v2 (id, session, ${liste})
                  SELECT id, 1, ${liste} FROM deliberation_seance;`);
        dbx.exec(`DROP TABLE deliberation_seance;
          ALTER TABLE deliberation_seance_v2 RENAME TO deliberation_seance;`);
      })();
      console.log('[migration] deliberation_seance : session ajoutée');
    }
  } catch (e) { console.error('[migration] seance.session :', e.message); }

  try {
    // L'HEURE DE LA SÉANCE. La date était posée en douce au moment de clore —
    // celle du jour, sans que personne puisse la corriger. Le PV porte pourtant
    // la date ET l'heure de la délibération : elles se notent maintenant à
    // l'ouverture, et se changent tant que la séance n'est pas close.
    const cols = dbx.prepare('PRAGMA table_info(deliberation_seance)').all().map(c => c.name);
    if (cols.length && !cols.includes('heure_seance')) {
      dbx.exec('ALTER TABLE deliberation_seance ADD COLUMN heure_seance TEXT');
      console.log('[migration] deliberation_seance : heure_seance ajoutée');
    }
  } catch (e) { console.error('[migration] seance.heure :', e.message); }

  try {
    // Le résultat de chaque session, conservé à côté du résultat final.
    dbx.exec(`
      CREATE TABLE IF NOT EXISTS deliberation_resultat (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        etudiant_id    INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        ue_num         INTEGER NOT NULL,
        session        INTEGER NOT NULL DEFAULT 1,
        resultat       TEXT,
        points         REAL,
        mention        TEXT,
        decide_le      TEXT DEFAULT CURRENT_TIMESTAMP,
        decide_par     TEXT,
        UNIQUE(etudiant_id, annee_scolaire, ue_num, session)
      );
      CREATE INDEX IF NOT EXISTS idx_delib_res_ue
        ON deliberation_resultat(ue_num, annee_scolaire, session);
    `);

    // Les décisions déjà prises sont celles de la première session : on les y
    // recopie, sans quoi l'écran croirait qu'aucune séance n'a eu lieu et
    // proposerait de délibérer une première session déjà faite.
    const n = dbx.prepare("SELECT COUNT(*) AS n FROM deliberation_resultat WHERE session = 1").get().n;
    if (!n) {
      const faits = dbx.prepare(`
        INSERT INTO deliberation_resultat
          (etudiant_id, annee_scolaire, ue_num, session, resultat, points, mention, decide_par)
        SELECT etudiant_id, annee_scolaire, ue_num, 1, resultat, points, mention, 'reprise'
        FROM etudiant_inscription WHERE resultat IS NOT NULL AND resultat != ''
      `).run().changes;
      if (faits) console.log(`[migration] ${faits} décision(s) reprises en session 1`);
    }
  } catch (e) { console.error('[migration] deliberation_resultat :', e.message); }
}

export function migrerAA(dbx) {
  // NP ET PP : DEUX FAÇONS DE VALOIR ZÉRO, QUI NE DISENT PAS LA MÊME CHOSE.
  //
  //   — NP, note de présence : l'étudiant s'est présenté et n'a rien produit
  //     qui vaille un point. Il garde l'accès à la seconde session.
  //   — PP, pas présenté : il ne s'est pas présenté à l'épreuve. Justifiée,
  //     l'absence donne un ajournement ; non justifiée, un refus.
  //   — 0 tout court : il a remis une copie, et elle ne vaut aucun point.
  //
  // Les trois pèsent zéro dans la moyenne — c'est la RAISON qui diffère, et
  // c'est elle qui oriente la décision du Conseil. Une note ne pouvait pas la
  // porter : il fallait une mention à côté.
  try { dbx.exec('ALTER TABLE etudiant_note_detail ADD COLUMN mention TEXT'); }
  catch { /* déjà là */ }
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

  // La session comme dimension : après migrerEtudiants, qui crée
  // etudiant_inscription — c'est de là que les décisions déjà prises sont
  // reprises en première session.
  migrerSessions(dbx);
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

  // LE LIEN COURS ↔ ACQUIS VIENT DE aa_ponderation, non de la colonne
  // aa.cours_code du référentiel.
  //
  // C'était l'erreur de fond. Le schéma de paramétrage écrit ses liens dans
  // aa_ponderation ; cette fonction, elle, lisait la colonne du référentiel,
  // qui ne rattache un acquis qu'à UN cours et n'est presque jamais remplie.
  // Résultat : on reliait les acquis aux cours et rien n'en tenait compte —
  // « aucun acquis rattaché à ce cours », des colonnes vides à la
  // délibération, des acquis sans intitulé. La colonne du référentiel reste
  // un REPLI, pour les unités jamais paramétrées.
  const pond = {};
  const parCours = {};
  for (const p of db.prepare(
    'SELECT cours_code, aa_code, poids FROM aa_ponderation WHERE ue_num = ?').all(ueNum)) {
    pond[p.cours_code + '|' + p.aa_code] = Number(p.poids);
    (parCours[p.cours_code] = parCours[p.cours_code] || []).push(p.aa_code);
  }
  const aaParCode = Object.fromEntries(aas.map(a => [a.aa_code, a]));
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
    const lies = parCours[c.cours_code];
    const siens = (lies && lies.length
      // Les acquis que le paramétrage a reliés à ce cours.
      ? lies.map(code => aaParCode[code] || { aa_code: code, description: null })
      // Repli : ceux que le référentiel y rattache.
      : aas.filter(a => a.cours_code === c.cours_code)
    ).map(a => ({ ...a, poids: pond[c.cours_code + '|' + a.aa_code] ?? null }));
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

  // LES ACQUIS VIENNENT DE LA DÉLIBÉRATION, non d'une seconde lecture des
  // notes. Cet écran en faisait une à lui : il découpait « s1|C1|AA1 » sur le
  // premier séparateur et lisait donc « C1 » comme code d'acquis — aucune note
  // ne correspondait, et il ignorait faveurs et ajournements. Deux calculs pour
  // la même unité, c'est un de trop : celui du Conseil fait foi.
  const d = delibererUE(etudId, ueNum, annee);

  const motifs = Object.fromEntries(db.prepare(`
    SELECT aa_code, motif FROM decision_motivation
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).all(etudId, annee, ueNum).map(m => [m.aa_code, m.motif]));

  const SEUIL = SEUIL_UE;   // RDE, art. 78
  const coursDe = {};
  for (const c of d.cours) for (const code of (c.aas || [])) {
    (coursDe[code] = coursDe[code] || []).push(c);
  }

  const acquis = d.acquis.map(a => {
    const cs = coursDe[a.aa_code] || [];
    return {
      aa_code: a.aa_code, description: a.description,
      cours_code: cs.map(c => c.cours_code).join(', ') || null,
      cours_nom: cs.map(c => c.cours_nom).filter(Boolean).join(', ') || null,
      note: a.na ? null : a.note,
      na: a.na, faveur: a.faveur,
      non_evalue: !a.na && a.note == null,
      // Non maîtrisé : sous le seuil, OU ajourné — dans les deux cas il faut
      // en rendre compte. Une faveur, elle, l'a levé : elle ne se motive pas
      // comme un échec.
      non_maitrise: !a.faveur && (a.na || (a.note != null && a.note < SEUIL)),
      motif: motifs[a.aa_code] || '',
    };
  });

  res.json({
    annee, ue_num: ueNum, seuil: SEUIL,
    resultat: insc?.resultat || null,
    points: insc?.points ?? null,
    // Ce que la délibération dit de l'unité : la cote ne se ressaisit pas ici.
    note_deliberee: d.ue.na ? null : d.ue.note,
    decision_proposee: d.ue.decision_proposee,
    ue_na: d.ue.na, ue_faveur: d.ue.faveur,
    a_representer: d.ue.a_representer_detail || [],
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
          cours_code, mention } = req.body || {};
  if (!etudiant_id || !annee_scolaire || !ue_num || !aa_code) {
    return res.status(400).json({ error: 'étudiant, année, unité et acquis requis' });
  }
  if (mention != null && !['NP', 'PP'].includes(mention)) {
    return res.status(400).json({ error: 'mention attendue : NP ou PP' });
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

  // Une mention vaut zéro : NP et PP ne sont pas des notes, mais elles
  // comptent comme telles dans la moyenne.
  const valeur = mention ? 0 : note;

  if (valeur == null) {
    db.prepare(`DELETE FROM etudiant_note_detail
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa' AND code = ?`)
      .run(etudiant_id, annee_scolaire, Number(ue_num), code);
  } else {
    db.prepare(`
      INSERT INTO etudiant_note_detail
        (etudiant_id, annee_scolaire, ue_num, type, code, points, mention)
      VALUES (?,?,?, 'aa', ?, ?, ?)
      ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
        points = excluded.points, mention = excluded.mention
    `).run(etudiant_id, annee_scolaire, Number(ue_num), code, valeur, mention || null);
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

  // La décision se range DEUX fois. Dans deliberation_resultat, sous sa
  // session : c'est la trace de ce que le Conseil a décidé ce jour-là, et
  // celle de juin doit survivre à celle de septembre. Et dans l'inscription,
  // qui porte le RÉSULTAT FINAL — celui que lisent le parcours, les crédits et
  // les attestations. La seconde session s'ajoute et l'emporte.
  const ses = Number(req.body?.session) === 2 ? 2 : 1;

  // ON N'ENREGISTRE PAS UNE SECONDE SESSION QUI N'A PAS EU LIEU. Tant que la
  // séance de juin n'est pas close, la décision appartient à la première
  // session — et l'y ranger par erreur transforme des ajournements en refus
  // (art. 69 §2). Le client peut se tromper de session ; le serveur, non.
  if (ses === 2) {
    const s1Close = !!(db.prepare(`
      SELECT cloturee FROM deliberation_seance
      WHERE ue_num = ? AND annee_scolaire = ? AND session = 1
    `).get(Number(ue_num), annee_scolaire)?.cloturee);
    if (!s1Close) {
      return res.status(409).json({
        error: 'seconde session non ouverte',
        detail: "La séance de première session n'est pas clôturée : la décision "
              + 'ne peut pas être enregistrée en seconde session.',
      });
    }
  }

  db.transaction(() => {
    db.prepare(`
      INSERT INTO deliberation_resultat
        (etudiant_id, annee_scolaire, ue_num, session, resultat, points, mention, decide_par)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(etudiant_id, annee_scolaire, ue_num, session) DO UPDATE SET
        resultat = excluded.resultat, points = excluded.points,
        mention = excluded.mention, decide_le = CURRENT_TIMESTAMP,
        decide_par = excluded.decide_par
    `).run(Number(etudiant_id), annee_scolaire, Number(ue_num), ses,
      resultat ?? null, note, mention ?? null, req.user?.email || null);

    // LE RÉSULTAT FINAL EST CELUI DE LA SESSION LA PLUS AVANCÉE.
    //
    // On ne recopie donc pas aveuglément ce qu'on vient d'écrire : revenir sur
    // la première session pour corriger une erreur ne doit pas effacer la
    // seconde, qui l'emporte. On relit la décision la plus haute et c'est elle
    // qui va au dossier.
    const fin = db.prepare(`
      SELECT resultat, points, mention FROM deliberation_resultat
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
        AND resultat IS NOT NULL AND resultat != ''
      ORDER BY session DESC LIMIT 1
    `).get(Number(etudiant_id), annee_scolaire, Number(ue_num)) || {};

    db.prepare(`
      UPDATE etudiant_inscription SET resultat = ?, points = ?, mention = ?
      WHERE id = ?
    `).run(fin.resultat ?? null, fin.points ?? null, fin.mention ?? null, insc.id);
  })();

  res.json({ ok: true, session: ses });
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
/**
 * LE DOCUMENT DE MOTIVATION — annexe 8 (ajournement) ou 9 (refus).
 *
 * Extrait de sa route pour être produit aussi EN LOT : le secrétariat n'imprime
 * pas les notifications une par une.
 */
export function documentMotivation(etudId, ueNum, annee) {

  const e = db.prepare('SELECT * FROM etudiant WHERE id = ?').get(etudId);
  if (!e) return { erreur: 'étudiant introuvable', code: 404 };

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

  // LES ACQUIS VIENNENT DE LA DÉLIBÉRATION. Cette fonction relisait les notes
  // pour son compte et découpait « s1|C1|AA1 » sur le premier séparateur : elle
  // cherchait donc une note sous le code « C1 », n'en trouvait aucune, et
  // concluait qu'aucun acquis n'était en échec — la notification ne sortait
  // jamais. Elle ignorait de surcroît les ajournements posés par le Conseil.
  const d = delibererUE(etudId, ueNum, annee);
  const motifs = Object.fromEntries(db.prepare(`
    SELECT aa_code, motif FROM decision_motivation
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
  `).all(etudId, annee, ueNum).map(m => [m.aa_code, m.motif]));

  // Ce dont il faut rendre compte : l'acquis sous le seuil, celui que le
  // Conseil a ajourné, et ceux d'un COURS ajourné — c'est de leur maîtrise
  // qu'il faut parler, même si la note prise ailleurs les sauvait.
  // Celui qu'une faveur a levé, non — il est acquis.
  const enCause = new Set(d.acquis
    .filter(a => a.na || (a.note != null && a.note < SEUIL_UE)).map(a => a.aa_code));
  for (const c of d.cours) if (c.na) for (const code of (c.aas || [])) enCause.add(code);

  const lignes = d.acquis
    .filter(a => !a.faveur && enCause.has(a.aa_code))
    .map(a => ({ code: a.aa_code, description: a.description || '',
                 motif: motifs[a.aa_code] || '' }));

  if (!lignes.length) {
    return { code: 400,
      erreur: "Aucun acquis en échec ni ajourné pour cette unité : la "
            + "notification n'a pas lieu d'être. Vérifiez la décision encodée." };
  }

  const esc2 = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const jour = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '……………';
  const genre = /^(mme|madame|mlle|mademoiselle|m\.?me)\b/i.test((e.titre || '').trim())
    ? 'F' : 'H';

  // LES COURS À REPRÉSENTER. Un acquis se représente DANS un cours : c'est le
  // cours que l'étudiant vient repasser, et c'est donc lui qu'il faut nommer.
  const coursDe = {};
  for (const c of d.cours) for (const code of (c.aas || [])) {
    (coursDe[code] = coursDe[code] || []).push(c);
  }
  const aRepresenter = [];
  for (const l of lignes) {
    for (const c of (coursDe[l.code] || [])) {
      let e0 = aRepresenter.find(x => x.cours_code === c.cours_code);
      if (!e0) aRepresenter.push(e0 = { cours_code: c.cours_code, cours_nom: c.cours_nom, aas: [] });
      e0.aas.push(l.code);
    }
  }

  const regles = reglesAjournement();

  // La seconde session, telle que la séance l'a fixée — et cours par cours
  // quand les professeurs ne repassent pas le même jour.
  // Les dates de seconde session ont été fixées à la CLÔTURE DE LA PREMIÈRE :
  // c'est cette séance-là qu'on lit, quelle que soit celle qu'on délibère.
  const seance = db.prepare(
    'SELECT * FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ? AND session = 1'
  ).get(ueNum, annee) || {};
  const s2 = Object.fromEntries(db.prepare(
    'SELECT * FROM deliberation_session2 WHERE ue_num = ? AND annee_scolaire = ?'
  ).all(ueNum, annee).map(l => [l.cours_code, l]));
  // Ce qui n'est pas fixé pour un cours retombe sur la date de l'unité.
  const quand = (code) => {
    const l = s2[code] || {};
    return {
      date: l.s2_date || seance.session2_date || null,
      heure: l.s2_heure || seance.session2_heure || null,
      local: l.s2_local || seance.session2_local || null,
      adresse: l.s2_adresse || seance.session2_adresse || ident.adresse || '',
    };
  };

  const corps = `
<div class="attestation piece">
  <div class="entete">
    <div class="cf">COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
    <div class="epa">ENSEIGNEMENT POUR ADULTES</div>
    <div class="annee">Année scolaire / académique ${esc2(String(annee).replace('-', '/'))}</div>
  </div>

  <div class="etab">
    <div>
      <div class="nom">${esc2(ident.nom || 'Institut Ilya Prigogine')}</div>
      <div>${esc2(ident.adresse || '')}</div>
    </div>
    <div class="ident">
      Matricule ${esc2(ident.matricule || etab.num_ecot || '……………')}<br>
      FASE ${esc2(ident.fase || etab.num_fase || '……………')}
    </div>
  </div>

  <!-- Le cartouche : cette pièce N'EST PAS une attestation de réussite, et
       cela doit se voir avant même d'être lu. -->
  <div class="decision ${estRefus ? 'refus' : 'ajourne'}">
    <div class="quoi">MOTIVATION D'UNE DÉCISION ${estRefus ? 'DE REFUS' : "D'AJOURNEMENT"}</div>
    <div class="sous">${estRefus
      ? "Annexe 9 — circulaire « Sanction des études »"
      : "Annexe 8 — circulaire « Sanction des études »"}</div>
  </div>

  <h2>${esc2((ue.ue_nom || `UE ${ueNum}`).toUpperCase())}</h2>
  <div class="filet"></div>

  <div class="carac">
    <div class="large">Code approuvé par le Gouvernement :
      ${ue.ue_code_fwb ? `<b>${esc2(ue.ue_code_fwb)}</b>`
                       : '<span class="manque">à compléter au référentiel</span>'}</div>
    <div>${ue.ue_per_etudiants
      ? `<b>${ue.ue_per_etudiants}</b> périodes`
      : '<span class="manque">périodes à compléter</span>'}</div>
    <div>Unité n<sup>o</sup> <b>${ueNum}</b></div>
  </div>

  <p class="corps">
    Nous, soussignés, Président-e et Membres du Conseil des études constitué par le
    Pouvoir organisateur de l'établissement précité en vue de la délivrance de
    l'attestation de réussite de l'unité d'enseignement susvisée, attestons que
  </p>

  <div class="etudiant">
    <div class="nom">${esc2((e.nom || '').toUpperCase())} ${esc2(e.prenom || '')}</div>
    <div class="naissance">
      Né${genre === 'F' ? 'e' : ''} à ${esc2(e.lieu_naissance) || '………'},
      le ${jour(e.date_naissance)}
    </div>
  </div>

  <p class="corps">ne maîtrise pas les acquis d'apprentissage suivants :</p>

  <table class="doc">
    <thead><tr>
      <th style="width:42%">Acquis d'apprentissage</th>
      <th>${estRefus ? 'Motivation' : 'Justification'}</th>
    </tr></thead>
    <tbody>
      ${lignes.map(l => `<tr>
        <td>${l.description
          ? `${esc2(l.description)}<br><span class="ref">${esc2(l.code)}</span>`
          : `<span class="code">${esc2(l.code)}</span>`}</td>
        <td>${l.motif ? esc2(l.motif)
          : '<span class="vide">motivation à compléter</span>'}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  ${estRefus ? `
  <!-- LES VOIES DE RECOURS, avec leurs fondements. Le décret ouvre le recours
       contre les seules décisions de REFUS (art. 123ter, § 1er) ; le règlement
       des études en fixe les modalités (art. 87 à 91). Les délais sont ceux du
       décret, non ceux qu'on croit se rappeler. -->
  ${etab.voies_recours ? `
  <div class="info">
    <div class="titre">Voies de recours</div>
    <div class="ligne">${esc2(etab.voies_recours)}</div>
  </div>` : `
  <div class="info recours">
    <div class="titre">Base légale et voies de recours</div>
    <div class="ligne"><b>Base légale de la décision.</b> ${esc2(etab.base_legale_refus
      || "Décret du 16 avril 1991 organisant l'enseignement pour adultes, articles 52, 53 "
       + "et 58 ; arrêté du Gouvernement de la Communauté française du 2 septembre 2015 "
       + "relatif à la sanction des études ; règlement des études de l'Institut, "
       + "articles 44 et 78.")}</div>
    <div class="ligne"><b>Recours interne.</b> Tout étudiant peut introduire un recours
      écrit contre une décision de refus ; <b>à peine d'irrecevabilité</b>, il mentionne
      les irrégularités précises qui le motivent. La plainte est adressée à la Direction
      par pli recommandé ou remise contre accusé de réception, <b>au plus tard le
      4<sup>e</sup> jour calendrier suivant la publication des résultats</b>. La
      procédure ne peut excéder <b>7 jours calendrier</b> hors congés scolaires,
      envoi recommandé de la décision motivée compris.
      <span class="ref2">Décret du 16 avril 1991, art. 123<i>ter</i> ·
        Règlement des études, art. 87 à 89.</span></div>
    <div class="ligne"><b>Recours externe.</b> Le recours interne doit être épuisé au
      préalable. Le recours s'introduit par pli recommandé auprès de l'Administration,
      copie à la Direction, dans les <b>7 jours calendrier</b> à compter du troisième
      jour ouvrable suivant l'envoi de la décision interne — y joints la présente
      motivation et la décision prise sur recours interne, ou à défaut le récépissé de
      celui-ci. Adresse : Direction générale du Service général de l'Enseignement tout au
      long de la vie, rue Adolphe Lavallée 1, 1080 Bruxelles. La Commission de recours
      notifie sa décision motivée par recommandé dans les <b>30 jours calendrier</b> hors
      congés scolaires, et au plus tard le 31 août pour les recours introduits entre le
      1<sup>er</sup> juin et le 7 juillet.
      <span class="ref2">Décret du 16 avril 1991, art. 123<i>ter</i> et 123<i>quater</i> ·
        Règlement des études, art. 90 et 91.</span></div>
  </div>`}
  ` : `
  ${regles.portee === 'aa' && regles.session2 === 'unique' ? `
  <p class="corps">Les acquis d'apprentissage ci-dessus seront à représenter en
    <b>une épreuve unique</b> par acquis, quels que soient les cours dans
    lesquels ils ont été évalués.</p>
  <table class="doc">
    <thead><tr>
      <th style="width:60%">Acquis à représenter</th>
      <th>Évalué dans</th>
    </tr></thead>
    <tbody>
      ${lignes.map(l => `<tr>
        <td>${esc2(l.description || l.code)}<br><span class="ref">${esc2(l.code)}</span></td>
        <td>${esc2((coursDe[l.code] || []).map(c => c.cours_code).join(', ')) || '—'}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  ` : `
  <p class="corps">${regles.portee === 'aa'
    ? `Les acquis d'apprentissage ci-dessus seront à représenter dans chacun des
       cours où ils sont évalués :`
    : `Les acquis d'apprentissage ci-dessus seront donc à représenter dans les
       cours suivants, qui sont à représenter dans leur entièreté :`}</p>
  <table class="doc">
    <thead><tr>
      <th style="width:26%">Cours à représenter</th>
      <th style="width:40%">Acquis d'apprentissage concernés</th>
      <th>Seconde session</th>
    </tr></thead>
    <tbody>
      ${aRepresenter.length ? aRepresenter.map(c => {
        const q = quand(c.cours_code);
        return `<tr>
        <td><span class="code">${esc2(c.cours_code)}</span>${
          c.cours_nom ? `<br><span class="ref">${esc2(c.cours_nom)}</span>` : ''}</td>
        <td>${c.aas.map(code => {
          const a = d.acquis.find(x => x.aa_code === code);
          return a?.description
            ? `${esc2(a.description)} <span class="ref">${esc2(code)}</span>`
            : `<span class="code">${esc2(code)}</span>`;
        }).join('<br>')}</td>
        <td>${q.date
          ? `<b>${jour(q.date)}</b>${q.heure ? ` à ${esc2(q.heure)}` : ''}`
            + `${q.local ? `<br>local ${esc2(q.local)}` : ''}`
          : '<span class="vide">date à fixer</span>'}</td>
      </tr>`; }).join('')
      : `<tr><td colspan="3" class="vide">Aucun cours n'est rattaché à ces acquis
           au référentiel : la répartition est à compléter.</td></tr>`}
    </tbody>
  </table>
  `}

  ${regles.portee === 'aa' && regles.session2 === 'unique' ? `
  <div class="info orange">
    <div class="titre">Seconde session</div>
    <div class="ligne">Le ${seance.session2_date ? `<b>${jour(seance.session2_date)}</b>` : '………………'}
      à ${seance.session2_heure ? `<b>${esc2(seance.session2_heure)}</b>` : '……h……'},
      local ${seance.session2_local ? `<b>${esc2(seance.session2_local)}</b>` : '…………'}</div>
    <div class="ligne">${esc2(seance.session2_adresse || ident.adresse || '')}</div>
  </div>`
  // Quand chaque cours a sa date, le tableau la porte déjà : un bloc de plus
  // pour redire « voir le tableau » ne fait que pousser la signature à la
  // page suivante. Seule l'adresse reste à dire, en une ligne.
  : `<p class="champ" style="font-size:8pt;color:#475569">
       Les épreuves se tiennent à
       ${esc2(seance.session2_adresse || ident.adresse || '……………')}.</p>`}
  `}

  ${estRefus ? '' : `
  <div class="info">
    <div class="titre">Voies de recours</div>
    <div class="ligne">Une décision d'ajournement <b>ne fait pas l'objet d'un recours</b> :
      elle doit être motivée, et elle l'est ci-dessus. Seule une décision de refus ouvre
      les recours interne et externe.</div>
    <div class="ligne" style="color:#475569">
      Règlement des études, art. 87, § 2.</div>
  </div>`}

  <div class="info">
    <div class="titre">Consultation de la copie</div>
    <div class="ligne">Le ${seance.visite_date ? `<b>${jour(seance.visite_date)}</b>` : '………………'}
      à ${seance.visite_heure ? `<b>${esc2(seance.visite_heure)}</b>` : '……h……'},
      local ${seance.visite_local ? `<b>${esc2(seance.visite_local)}</b>` : '…………'}</div>
  </div>

  <div class="cloture">
    <div class="sceau"></div>
    <div class="paraphe"></div>
    <div class="lieu">Fait à ${esc2(ident.ville || 'Anderlecht')},
      le ${jour(seance.date_seance || new Date().toISOString())}</div>
    <div class="legende">
      <div class="qualite">Pour le Conseil des études,<br>le Directeur</div>
      <div class="nom">${esc2(ident.directeur || 'Charles SOHET')}</div>
    </div>
  </div>
</div>`;

  const html = envelopper(corps,
    `Motivation ${estRefus ? 'de refus' : "d'ajournement"} — UE ${ueNum}`);

  return { html, corps,
           nom: `Motivation_${estRefus ? 'refus' : 'ajournement'}_UE${ueNum}`,
           estRefus };
}

r.get('/motivation/:etudId/:ueNum/document', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const d = documentMotivation(Number(req.params.etudId), Number(req.params.ueNum), annee);
  if (d.erreur) return res.status(d.code || 400).json({ error: d.erreur });
  res.json({ html: d.html, nom: d.nom });
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
  // AU DEMI-POINT. Les dix points ne se répartissent pas toujours en entiers :
  // un classeur qui comptait sur cent donne 45 → 4,5, et trois acquis dans un
  // cours ne se partagent pas dix en nombres ronds. Le quart de point, lui,
  // n'apporte plus rien qu'une fausse précision.
  if (sur10 && gardes.some(p => Math.abs(Number(p.poids) * 2 - Math.round(Number(p.poids) * 2)) > 1e-9)) {
    return res.status(400).json({
      error: 'Sur un barème de 10, les poids se posent au demi-point (0,5 · 1 · 1,5 …).',
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
    // La session que l'unité attend : le bouton n'a pas à être choisi à la
    // main, il se déduit de ce qui a déjà été décidé.
    const ses = sessionDeLUE(u.ue_num, annee);
    (sections[sec] = sections[sec] || { section: sec, ues: [] }).ues.push({
      ...u, ue_nom: r0.ue_nom || null, ue_niv: r0.ue_niv || null,
      session: ses.session,
      s1_complete: ses.s1.complete,
      s1_ajournes: ses.s1.ajournes,
      s2_decides: ses.s2.decides,
      seconde_possible: ses.seconde_possible,
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

/**
 * LA SESSION DEVIENT UNE DIMENSION.
 *
 * Jusqu'ici, une unité se délibérait UNE fois : une séance, un jeu
 * d'ajustements, un résultat. La seconde session n'avait donc nulle part où se
 * ranger — l'y écrire aurait écrasé la première, et l'on aurait perdu la trace
 * de ce que le Conseil avait décidé en juin, qui est précisément ce qui
 * justifie la seconde session.
 *
 * La session s'ajoute donc partout où une décision se pose : à la séance, aux
 * ajustements, et au résultat. Tout ce qui existe est de la première session.
 *
 * Le résultat de chaque session est conservé à part ; celui de l'inscription
 * reste le RÉSULTAT FINAL — celui que lisent le parcours, les crédits et les
 * attestations. La seconde session s'ajoute et l'emporte.
 */


const SEUIL_UE = 10;   // RDE, art. 78

/**
 * LA RÈGLE D'AJOURNEMENT DE L'ÉTABLISSEMENT.
 *
 * Deux établissements ne délibèrent pas de la même façon, et le décret ne
 * tranche pas. Deux choix, donc, posés une fois pour toutes aux paramètres :
 *
 *  — PORTÉE. « par cours » : ce qu'on ajourne, c'est un cours, et TOUS ses
 *    acquis sont à représenter avec lui — y compris ceux qu'un autre cours
 *    évalue aussi. « par acquis » : on ajourne l'acquis seul ; le cours n'est
 *    pas emporté, et l'étudiant ne repasse que ce qui n'est pas maîtrisé.
 *
 *  — SECONDE SESSION, en portée « par acquis » seulement : l'acquis se
 *    représente en UN examen, ou dans CHACUN des cours où il est évalué.
 *
 * Le repli est « par cours » : c'est la pratique la plus répandue, et celle
 * que l'application appliquait sans le dire.
 */
export function reglesAjournement() {
  const defaut = { portee: 'cours', session2: 'par_cours' };
  try {
    const row = db.prepare(
      "SELECT valeur FROM lucie_config WHERE cle = 'deliberation_ajournement'").get();
    if (!row) return defaut;
    const v = JSON.parse(row.valeur);
    return {
      portee: v.portee === 'aa' ? 'aa' : 'cours',
      session2: v.session2 === 'unique' ? 'unique' : 'par_cours',
    };
  } catch { return defaut; }
}

/**
 * La coordination de section délibère-t-elle, ou siège-t-elle en avis ?
 *
 * Voir membresDuConseil : le texte ne la fait membre que des réunions de suivi
 * pédagogique, sauf si elle occupe la fonction de conseiller à la formation.
 * Le défaut suit le texte ; l'établissement peut en décider autrement, et le
 * procès-verbal en portera la trace.
 */
export function coordinationDelibere() {
  try {
    const row = db.prepare(
      "SELECT valeur FROM lucie_config WHERE cle = 'deliberation_quorum'").get();
    return row ? JSON.parse(row.valeur)?.coordination_delibere === true : false;
  } catch { return false; }
}

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
/**
 * @param {number} session  1 = la première session seule ; 2 = la seconde, qui
 *   REPREND les notes de la première pour les cours non représentés et les
 *   remplace pour ceux qui l'ont été. C'est ainsi que le résultat de seconde
 *   session est final : il s'ajoute, il n'efface pas.
 */
export function delibererUE(etudId, ueNum, annee, session = 1) {
  const structure = structureUE(ueNum, annee);
  const integree = estEpreuveIntegree(ueNum, annee);
  const regles = reglesAjournement();

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

  // Les intitulés viennent de la table des acquis de l'UNITÉ, non de la
  // structure : un acquis évalué par aucun cours doit garder son nom, et un
  // acquis relié par le seul paramétrage n'était nommé nulle part.
  const descr = Object.fromEntries(db.prepare(
    'SELECT aa_code, description FROM aa WHERE ue_num = ?').all(ueNum)
    .map(a => [a.aa_code, a.description]));
  for (const c of structure) for (const a of (c.aas || [])) {
    if (a.description) descr[a.aa_code] = a.description;
  }

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
    SELECT code, points, mention FROM etudiant_note_detail
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa'
  `).all(etudId, annee, ueNum);
  //
  // LA SESSION COMPTE. En première session, on ne lit que les notes de la
  // première — une note de seconde session ne doit pas rétroagir sur ce que le
  // Conseil a décidé en juin. En seconde, la note de seconde session l'emporte
  // quand elle existe, et celle de la première subsiste pour les cours qui
  // n'étaient pas à représenter : c'est ce qui fait que la seconde session
  // s'AJOUTE au lieu d'effacer.
  const parCoursAA = {}, parAA = {}, mentionDe = {};
  const rang = { '': 0, s1: 1, s2: 2 };
  const meilleur = {};
  for (const l of brutes) {
    let parts = String(l.code).split('|');
    const ses = /^s[12]$/.test(parts[0]) ? parts[0] : '';
    if (ses) parts = parts.slice(1);
    if (ses === 's2' && session < 2) continue;          // pas encore délibérée
    const cle = parts.length === 2 ? `${parts[0]}|${parts[1]}` : parts[0];
    // À clé égale, la note la plus récemment sessionnée gagne ; une note sans
    // préfixe, écrite avant qu'on ne distingue les sessions, vaut pour la
    // première et ne recouvre jamais une note explicite.
    if (meilleur[cle] != null && meilleur[cle] > rang[ses]) continue;
    meilleur[cle] = rang[ses];
    if (parts.length === 2) {
      parCoursAA[cle] = l.points;
      mentionDe[cle] = l.mention || null;
    } else {
      parAA[cle] = l.points;
      mentionDe[cle] = l.mention || null;
    }
  }
  const noteDe = (cours, aa) => {
    const v = parCoursAA[`${cours}|${aa}`];
    return v != null ? Number(v) : (parAA[aa] != null ? Number(parAA[aa]) : null);
  };
  // NP ou PP : la raison du zéro, qui suit la note jusqu'à la feuille.
  const mentionAA = (cours, aa) => mentionDe[`${cours}|${aa}`] || mentionDe[aa] || null;

  // Les ajustements sont ceux de LA session délibérée : ce que le Conseil a
  // ajourné en juin ne pèse plus sur la décision de septembre, il en est la
  // cause. Les ajournements de première session restent lus à part, pour
  // savoir quels cours sont à représenter.
  const ajust = {};
  for (const a of db.prepare(`
    SELECT portee, code, action FROM deliberation_ajustement
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND session = ?
  `).all(etudId, annee, ueNum, session)) ajust[`${a.portee}|${a.code}`] = a.action;

  // Ce que la première session a laissé à représenter — vide en session 1.
  const coursARepresenter = session < 2 ? new Set() : new Set(db.prepare(`
    SELECT code FROM deliberation_ajustement
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
      AND session = 1 AND portee = 'cours' AND action = 'ajourne'
  `).all(etudId, annee, ueNum).map(x => x.code));

  const coursAjourne = c => ajust[`cours|${c}`] === 'ajourne';
  const coursFaveur = c => ajust[`cours|${c}`] === 'faveur';
  const aaAjourne = a => ajust[`aa|${a}`] === 'ajourne';
  const aaFaveur = a => ajust[`aa|${a}`] === 'faveur';
  // La faveur se pose aux TROIS niveaux : sur l'acquis, sur le cours, sur
  // l'unité. Elle avait été ramenée à la seule unité — à tort : le règlement
  // ne connaît pas la compensation (art. 77 §1, 78 §2), et ce que le Conseil
  // lève, c'est L'ACQUIS qui manque. Poser la faveur là où l'échec se trouve
  // est le seul geste qui laisse au procès-verbal la trace de ce qui a été
  // accordé, et à qui. À tous les niveaux, l'effet est le même : l'élément
  // vaut exactement le seuil, jamais davantage.
  const ueFaveur = ajust['ue|*'] === 'faveur';

  // ── 1. L'ACQUIS au global ────────────────────────────────────────────────
  const codesAA = [...new Set(paires.map(p => p.aa_code))];
  const acquis = codesAA.map(code => {
    const evals = paires.filter(p => p.aa_code === code).map(p => ({
      cours_code: p.cours_code, poids: p.poids,
      note: noteDe(p.cours_code, code),
      mention: mentionAA(p.cours_code, code),
      ajourne: coursAjourne(p.cours_code),
    }));
    // En portée « par cours », un cours ajourné emporte tous ses acquis — même
    // ceux qu'un autre cours évalue aussi : c'est le cours qu'on représente.
    // En portée « par acquis », l'acquis ne tombe que si TOUTES ses
    // évaluations tombent.
    const na = aaAjourne(code)
      || (evals.length > 0 && (regles.portee === 'cours'
        ? evals.some(e => e.ajourne)
        : evals.every(e => e.ajourne)));
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
      // La faveur POSÉE SUR CET ACQUIS, distincte de celle qu'il hérite de
      // l'unité : c'est elle que le bouton retire, et elle seule.
      faveur_directe: aaFaveur(code),
      // La mention de l'acquis : celle de ses évaluations quand elles
      // s'accordent, sinon rien — deux cours peuvent ne pas dire la même chose.
      mention: (() => {
        const m = [...new Set(evals.map(e => e.mention).filter(Boolean))];
        return m.length === 1 && evals.every(e => e.mention) ? m[0] : null;
      })(),
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
    // En portée « par acquis », l'étudiant ne représente QUE l'acquis : le
    // cours n'est pas ajourné avec lui.
    const na = coursAjourne(c.cours_code)
      || (regles.portee === 'cours' && aas_ajournes.length > 0);
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
      // L'épreuve du cours n'a pas été présentée, ou l'a été sans rien
      // produire : la mention vaut pour tous ses acquis.
      mention: (() => {
        const m = siennes.map(p => mentionAA(c.cours_code, p.aa_code));
        return m.length && m.every(x => x && x === m[0]) ? m[0] : null;
      })(),
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
    ue_num: ueNum, annee, session, seuil: SEUIL_UE, epreuve_integree: integree,
    regles_ajournement: regles,
    // En seconde session, l'écran doit savoir quels cours étaient à
    // représenter : les autres gardent la note de juin et ne se réencodent
    // pas.
    cours_a_representer: [...coursARepresenter],
    acquis,
    cours: cours.map(c => ({ ...c,
      represente: session < 2 ? null : coursARepresenter.has(c.cours_code) })),
    ue: {
      note: ajourne ? null : noteUE,
      na: ajourne, faveur, faveur_ue: ueFaveur,
      echec: !ajourne && noteUE != null && noteUE < SEUIL_UE,
      a_representer: regles.portee === 'cours'
        ? cours.filter(c => c.na).map(c => c.cours_code)
        : acquis.filter(a => a.na).map(a => a.aa_code),
      // Ce qu'il faut représenter, cours par cours et acquis par acquis :
      // c'est ce que l'annexe 8 doit énoncer à l'étudiant.
      a_representer_detail: cours.filter(c => c.na).map(c => ({
        cours_code: c.cours_code, cours_nom: c.cours_nom, aas: c.aas,
      })),
      // La réussite de plein droit : tous les acquis et tous les cours au
      // seuil, sans qu'aucune faveur ni aucun ajournement n'ait été nécessaire.
      // Ce que la délibération DIT — la décision reste au Conseil, mais elle
      // se déduit du calcul et n'a pas à être ressaisie dans l'écran voisin.
      // Ce que la délibération DIT. Un « pas présenté » non justifié appelle
      // un refus, un « note de présence » un ajournement : la règle vient de la
      // circulaire, mais c'est le Conseil qui apprécie la justification — on
      // propose, on n'impose pas.
      // TOUS LES ACQUIS, OU AUCUNE RÉUSSITE.
      //
      // La proposition se lisait sur la moyenne de l'unité : un acquis à 4
      // se laissait rattraper par les autres et l'écran annonçait « réussi ».
      // Le règlement ne le permet pas — l'attestation va « à l'étudiant qui
      // maîtrise TOUS les acquis d'apprentissage » et « si un ou plusieurs
      // acquis ne sont pas acquis, l'attestation n'est pas délivrée »
      // (RGE art. 77 §1 et 78 §2 ; décret du 16/04/1991, art. 58).
      //
      // Le Conseil garde la main, et c'est bien le sujet : il dispose pour
      // cela de la FAVEUR, qui porte l'acquis manquant au seuil et laisse au
      // procès-verbal la trace de ce qui a été accordé. Ce que la moyenne
      // faisait, elle le faisait en silence — le Conseil compensait sans
      // savoir qu'il compensait.
      // L'ÉCHEC N'A PAS LE MÊME NOM SELON LA SESSION. En première, un acquis
      // non maîtrisé s'ajourne — l'étudiant le représente (RGE art. 79 §1).
      // En seconde, il n'y a plus rien à représenter : « l'étudiant qui échoue
      // en seconde session est refusé » (art. 69 §2).
      decision_proposee: ajourne ? 'ajourne'
        : cours.some(c => c.mention === 'PP') ? 'refuse'
        : cours.some(c => c.mention === 'NP') ? (session >= 2 ? 'refuse' : 'ajourne')
        : noteUE == null ? null
        : (acquis.some(a => !a.na && a.note != null && a.note < SEUIL_UE)
           || cours.some(c => !c.na && c.note != null && c.note < SEUIL_UE)
           || noteUE < SEUIL_UE) ? (session >= 2 ? 'refuse' : 'ajourne')
        : 'reussi',
      // Ce qui empêche la réussite, nommé : c'est de cela que la motivation
      // doit rendre compte, et c'est ce que la faveur lèverait.
      acquis_en_defaut: acquis
        .filter(a => !a.na && !a.faveur && a.note != null && a.note < SEUIL_UE)
        .map(a => a.aa_code),
      // Les épreuves non présentées, pour que le Conseil les voie.
      mentions: cours.filter(c => c.mention)
        .map(c => ({ cours_code: c.cours_code, mention: c.mention })),
      // Un échec non motivé rend la décision attaquable : on nomme ce qui
      // manque plutôt que de laisser passer.
      //
      // AJOURNER UN COURS OBLIGE À MOTIVER SES ACQUIS. En portée « par
      // acquis », un cours ajourné ne rendait ses acquis NA que s'ils
      // n'étaient évalués nulle part ailleurs : on ajournait donc un cours
      // sans avoir rien à justifier. C'est pourtant une décision défavorable
      // comme une autre, et l'annexe 8 doit dire de quoi elle procède.
      motifs_manquants: (() => {
        const aRendreCompte = new Set(acquis
          .filter(a => a.na || (a.note != null && a.note < SEUIL_UE))
          .map(a => a.aa_code));
        for (const c of cours) {
          if (c.na) for (const code of (c.aas || [])) aRendreCompte.add(code);
        }
        return acquis.filter(a => aRendreCompte.has(a.aa_code) && !a.motif)
          .map(a => a.aa_code);
      })(),
      de_plein_droit: !ajourne && !faveur && !cours.some(c => c.mention)
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
  const mentions = {};
  for (const l of db.prepare(`
    SELECT etudiant_id, code, points, mention FROM etudiant_note_detail
    WHERE annee_scolaire = ? AND ue_num = ? AND type = 'aa'
  `).all(annee, co.ue_num)) {
    const s = String(l.code);
    const avecSession = `${prefixe}${coursCode}|`;
    const sansSession = `${coursCode}|`;
    if (s.startsWith(avecSession)) {
      // La note de CE cours pour CETTE session : la plus précise, elle gagne.
      (notes[l.etudiant_id] ||= {})[s.slice(avecSession.length)] = l.points;
      if (l.mention) mentions[l.etudiant_id] = l.mention;
    } else if (session === 1 && s.startsWith(sansSession)) {
      // Écrite avant que les sessions ne soient distinguées : elle vaut pour
      // la première, et ne recouvre pas une note explicite.
      const aa = s.slice(sansSession.length);
      const e = (notes[l.etudiant_id] ||= {});
      if (e[aa] == null) e[aa] = l.points;
    }
  }

  res.json({
    cours: co, annee, session, acquis, etudiants, notes, mentions,
    // L'épreuve est commune à l'unité : ce n'est pas ici qu'on encode.
    epreuve_integree: estEpreuveIntegree(co.ue_num, annee),
    // Sans acquis rattaché, la saisie par cours n'a rien à montrer : mieux
    // vaut le dire que d'afficher une grille vide.
    sans_acquis: !acquis.length,
    sans_ponderation: acquis.length > 0 && acquis.every(a => a.poids == null),
  });
});

/**
 * IMPORTER LES NOTES D'UNE UNITÉ DEPUIS UN CLASSEUR DE SUIVI.
 *
 * Les classeurs de suivi tiennent une note par acquis, pour l'unité entière.
 * Lucie, elle, range une note par acquis DANS un cours : un même acquis évalué
 * dans deux cours a deux notes, et c'est ce que la délibération consolide.
 *
 * La conversion n'a rien d'arbitraire — la pondération dit déjà quels cours
 * évaluent quel acquis. La note d'un acquis est donc écrite dans CHACUN des
 * cours qui l'évaluent, et un acquis que la pondération ne rattache à aucun
 * cours est signalé plutôt qu'écrit dans le vide.
 *
 * Rien n'est écrit en SIMULATION : on rend, ligne par ligne, ce qui serait
 * fait, pour qu'on le lise avant de s'engager.
 */
r.post('/ue/:ueNum/notes/importer', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const { annee, session, lignes, simulation = true, arrondi = true,
    bareme = 20 } = req.body || {};
  // Les classeurs cotent tantôt sur vingt, tantôt sur cent : on ramène.
  const diviseur = Number(bareme) === 100 ? 5 : 1;
  const an = annee || anneeDeTravail(req);
  const ses = Number(session) === 2 ? 2 : 1;
  if (!Array.isArray(lignes) || !lignes.length) {
    return res.status(400).json({ error: 'aucune ligne à importer' });
  }

  const ue = db.prepare('SELECT ue_num, ue_nom, section FROM ue WHERE ue_num = ? AND annee_scolaire = ?')
    .get(ueNum, an);
  if (!ue) return res.status(404).json({ error: `L'unité ${ueNum} n'existe pas en ${an}` });

  const perim = getUserSections(req.user);
  if (perim && ue.section && !perim.includes(ue.section)) {
    return res.status(403).json({ error: 'unité hors de votre périmètre' });
  }

  // Quels cours évaluent quel acquis — la pondération fait foi.
  const coursDeAA = {};
  for (const l of db.prepare(
    'SELECT cours_code, aa_code FROM aa_ponderation WHERE ue_num = ?').all(ueNum)) {
    (coursDeAA[String(l.aa_code).trim().toUpperCase()] ||= []).push(l.cours_code);
  }
  const acquisConnus = new Set(db.prepare('SELECT aa_code FROM aa WHERE ue_num = ?')
    .all(ueNum).map(a => String(a.aa_code).trim().toUpperCase()));

  // Les étudiants inscrits à l'unité cette année : on n'importe une note que
  // pour eux. Une note pour un non-inscrit serait invisible partout.
  const inscrits = new Set(db.prepare(
    'SELECT etudiant_id FROM etudiant_inscription WHERE annee_scolaire = ? AND ue_num = ?')
    .all(an, ueNum).map(x => x.etudiant_id));

  const parMatricule = db.prepare(`
    SELECT etudiant_id AS id FROM etudiant_matricule WHERE id_ecampus = ?`);
  const parIdEcampus = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ? LIMIT 1');
  const clean = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');

  function trouver(l) {
    const mat = String(l.matricule || '').trim();
    if (mat) {
      const a = parMatricule.get(mat) || parIdEcampus.get(mat);
      if (a) return { id: a.id, methode: 'matricule' };
    }
    const nom = clean(l.nom), prenom = clean(l.prenom);
    if (nom && prenom) {
      const e = db.prepare(`
        SELECT e.id, e.nom, e.prenom FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
        WHERE i.annee_scolaire = ? AND i.ue_num = ?
      `).all(an, ueNum).filter(x => clean(x.nom) === nom && clean(x.prenom).startsWith(prenom.slice(0, 6)));
      if (e.length === 1) return { id: e[0].id, methode: 'identite' };
    }
    return null;
  }

  const ecrire = db.prepare(`
    INSERT INTO etudiant_note_detail (etudiant_id, annee_scolaire, ue_num, type, code, cours_code, points)
    VALUES (?,?,?, 'aa', ?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
      points = excluded.points, cours_code = excluded.cours_code, mention = NULL
  `);

  const rapport = {
    simulation, session: ses, annee: an, ue_num: ueNum,
    total: { etudiants: 0, rapproches: 0, inconnus: 0, non_inscrits: 0, notes: 0 },
    acquis_inconnus: [], acquis_sans_cours: [], inconnus: [], detail: [],
  };
  const vus = new Set();

  const executer = () => {
    for (const l of lignes) {
      rapport.total.etudiants++;
      const t = trouver(l);
      if (!t) {
        rapport.total.inconnus++;
        if (rapport.inconnus.length < 20) {
          rapport.inconnus.push(`${l.matricule || '?'} ${l.nom || ''} ${l.prenom || ''}`.trim());
        }
        continue;
      }
      if (!inscrits.has(t.id)) {
        rapport.total.non_inscrits++;
        if (rapport.inconnus.length < 20) {
          rapport.inconnus.push(`${l.nom || ''} ${l.prenom || ''} (non inscrit à l'UE)`.trim());
        }
        continue;
      }
      rapport.total.rapproches++;

      // Deux formes de notes coexistent, parce que deux classeurs coexistent.
      //
      // Le classeur de suivi tient UNE note par acquis, pour l'unité : la
      // pondération dit alors quels cours l'évaluent, et la note va dans
      // chacun. Un classeur monté à la main, lui, tient une colonne par
      // COUPLE cours-acquis — c'est plus précis, et cela seul permet de coter
      // différemment un même acquis dans deux cours.
      const posees0 = Array.isArray(l.notes)
        ? l.notes.map(x => ({ cours: x.cours_code ? [x.cours_code] : null,
          code: String(x.aa_code || '').trim().toUpperCase(), val: x.valeur }))
        : Object.entries(l.notes || {}).map(([c, v]) => ({
          cours: null, code: String(c).trim().toUpperCase(), val: v }));

      let posees = 0;
      for (const x of posees0) {
        if (x.val === '' || x.val == null) continue;
        const n = Number(String(x.val).replace(',', '.')) / diviseur;
        if (!Number.isFinite(n) || n < 0 || n > 20) continue;
        const points = arrondi ? Math.round(n) : Math.round(n * 100) / 100;

        if (!acquisConnus.has(x.code)) {
          if (!vus.has('i' + x.code)) { vus.add('i' + x.code); rapport.acquis_inconnus.push(x.code); }
          continue;
        }
        const cours = x.cours || coursDeAA[x.code] || [];
        if (!cours.length) {
          if (!vus.has('c' + x.code)) { vus.add('c' + x.code); rapport.acquis_sans_cours.push(x.code); }
          continue;
        }
        for (const cc of cours) {
          if (!simulation) ecrire.run(t.id, an, ueNum, `s${ses}|${cc}|${x.code}`, cc, points);
          posees++;
        }
      }
      rapport.total.notes += posees;
      if (rapport.detail.length < 8) {
        rapport.detail.push({
          etudiant: `${l.nom || ''} ${l.prenom || ''}`.trim(), methode: t.methode, notes: posees,
        });
      }
    }
  };

  if (simulation) executer(); else db.transaction(executer)();
  res.json(rapport);
});

/**
 * LA FEUILLE DE TOUTE L'UNITÉ.
 *
 * Le professeur encode SON cours : lui montrer les acquis de ses collègues
 * serait le mettre en position d'écraser leurs notes. Mais la direction et le
 * secrétariat, eux, encodent souvent pour toute une unité — un paquet de copies
 * remis en bloc, une session rattrapée, une reprise après coup. Ouvrir et
 * refermer six grilles de cours pour les mêmes étudiants n'a alors aucun sens :
 * on perd la vue d'ensemble et l'on ressaisit six fois le même nom.
 *
 * Cette feuille rend donc l'unité entière — chaque cours avec ses acquis, tous
 * les étudiants inscrits, toutes les notes — en une seule lecture. L'écriture,
 * elle, passe par les mêmes routes que la saisie par cours : une note reste une
 * note de cours, et rien du modèle ne change.
 *
 * Elle est réservée à ceux qui ont déjà tous les droits sur toutes les grilles.
 * Un professeur n'y a pas accès : sa feuille à lui est celle de son cours.
 */
r.get('/ue/:ueNum/feuille', authRequired,
      roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);
  const session = req.query.session === '2' ? 2 : 1;

  const ue = db.prepare('SELECT ue_num, ue_nom, section FROM ue WHERE ue_num = ? AND annee_scolaire = ?')
    .get(ueNum, annee);
  if (!ue) return res.status(404).json({ error: `L'unité ${ueNum} n'existe pas en ${annee}` });

  const perim = getUserSections(req.user);
  if (perim && ue.section && !perim.includes(ue.section)) {
    return res.status(403).json({ error: 'unité hors de votre périmètre' });
  }

  const tousCours = db.prepare(`
    SELECT cours_code, cours_nom, cours_per FROM cours
    WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_num, cours_code
  `).all(ueNum, annee);

  // Le lien acquis ↔ cours vient de la pondération : c'est la somme des acquis
  // qui fait le cours. À défaut, le rattachement du référentiel.
  const pond = db.prepare(`
    SELECT p.cours_code, p.aa_code, p.poids, a.description
    FROM aa_ponderation p LEFT JOIN aa a ON a.aa_code = p.aa_code AND a.ue_num = p.ue_num
    WHERE p.ue_num = ? ORDER BY p.aa_code
  `).all(ueNum);
  const parCours = {};
  for (const x of pond) (parCours[x.cours_code] ||= []).push(x);

  const cours = tousCours.map(c => ({
    ...c,
    acquis: parCours[c.cours_code] || db.prepare(`
      SELECT aa_code, NULL AS poids, description FROM aa
      WHERE ue_num = ? AND cours_code = ? ORDER BY aa_num, aa_code
    `).all(ueNum, c.cours_code),
  }));

  const etudiants = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ?
    ORDER BY e.nom, e.prenom
  `).all(annee, ueNum);

  // Les notes sont rangées par « cours|acquis » : un même acquis coté dans deux
  // cours a deux notes, et chacune appartient à son cours. La note portant la
  // session l'emporte sur celle qui n'en porte pas — écrite avant qu'on ne les
  // distingue, celle-ci vaut pour la première session sans jamais la recouvrir.
  const notes = {};
  const mentions = {};
  const prefixe = `s${session}|`;
  for (const l of db.prepare(`
    SELECT etudiant_id, code, points, mention FROM etudiant_note_detail
    WHERE annee_scolaire = ? AND ue_num = ? AND type = 'aa'
  `).all(annee, ueNum)) {
    const code = String(l.code);
    const avecSession = code.startsWith(prefixe);
    if (!avecSession && (session === 2 || code.startsWith('s2|') || code.startsWith('s1|'))) continue;
    const reste = avecSession ? code.slice(prefixe.length) : code;
    const sep = reste.indexOf('|');
    if (sep < 0) continue;                       // note d'acquis sans cours
    const cle = reste;                           // « cours|acquis »
    const e = (notes[l.etudiant_id] ||= {});
    if (avecSession || e[cle] == null) e[cle] = l.points;
    if (l.mention && avecSession) {
      (mentions[l.etudiant_id] ||= {})[reste.slice(0, sep)] = l.mention;
    }
  }

  res.json({
    ue, annee, session, cours, etudiants, notes, mentions,
    epreuve_integree: estEpreuveIntegree(ueNum, annee),
    sans_acquis: cours.every(c => !c.acquis.length),
  });
});

/**
 * IMPORTER LES ACQUIS D'UN COURS DEPUIS UN CLASSEUR.
 *
 * Les acquis se saisissaient un à un, puis se reliaient à la flèche. Quand ils
 * existent déjà dans un tableur — et ils y sont toujours, c'est de là que vient
 * le dossier pédagogique —, autant les lire.
 *
 * L'import fait DEUX choses d'un coup, parce qu'elles n'ont pas de sens
 * séparées : il crée l'acquis dans l'unité s'il n'y est pas, et il le relie à
 * ce cours avec son poids. Un acquis déjà présent voit son intitulé complété,
 * jamais écrasé par du vide.
 *
 * En SIMULATION, rien n'est écrit : on rend ce qui serait fait, ligne par
 * ligne, pour qu'on puisse le lire avant de s'engager.
 */
r.post('/cours/:coursCode/acquis/importer', authRequired,
       roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const coursCode = req.params.coursCode;
  const { annee, lignes, simulation, remplacer } = req.body || {};
  if (!Array.isArray(lignes) || !lignes.length) {
    return res.status(400).json({ error: 'aucune ligne à importer' });
  }
  const an = annee || anneeDeTravail(req);

  const co = db.prepare(`
    SELECT cours_code, cours_nom, ue_num FROM cours WHERE cours_code = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(coursCode, an);
  if (!co) return res.status(404).json({ error: 'cours introuvable' });

  const existants = Object.fromEntries(db.prepare(
    'SELECT aa_code, description, aa_num FROM aa WHERE ue_num = ?').all(co.ue_num)
    .map(a => [String(a.aa_code).trim().toUpperCase(), a]));
  const liens = Object.fromEntries(db.prepare(
    'SELECT aa_code, poids FROM aa_ponderation WHERE ue_num = ? AND cours_code = ?')
    .all(co.ue_num, coursCode).map(l => [String(l.aa_code).trim().toUpperCase(), l.poids]));

  const rapport = [];
  const vus = new Set();
  let numSuivant = Math.max(0, ...Object.values(existants).map(a => Number(a.aa_num) || 0));

  for (const [i, l] of lignes.entries()) {
    const code = String(l.aa_code ?? '').trim();
    if (!code) { rapport.push({ ligne: i + 1, etat: 'ignoree',
      quoi: "pas de code d'acquis" }); continue; }
    const cle = code.toUpperCase();
    if (vus.has(cle)) { rapport.push({ ligne: i + 1, aa_code: code, etat: 'ignoree',
      quoi: 'déjà vu dans ce fichier' }); continue; }
    vus.add(cle);

    const desc = l.description == null ? null : String(l.description).trim() || null;
    const poidsBrut = l.poids == null || l.poids === '' ? null
      : Number(String(l.poids).replace(',', '.'));
    if (poidsBrut != null && (!Number.isFinite(poidsBrut) || poidsBrut < 0)) {
      rapport.push({ ligne: i + 1, aa_code: code, etat: 'refusee',
        quoi: `poids illisible : « ${l.poids} »` });
      continue;
    }
    // Sans poids, le lien naît à 1 : il existe, il reste à le peser.
    const poids = poidsBrut == null ? 1 : poidsBrut;

    const dejaLa = existants[cle];
    const dejaLie = liens[cle] != null;
    const actes = [];
    if (!dejaLa) actes.push('acquis créé dans l’unité');
    else if (desc && !dejaLa.description) actes.push('intitulé complété');
    if (!dejaLie) actes.push(`relié à ${coursCode} au poids ${poids}`);
    else if (Number(liens[cle]) !== poids) actes.push(`poids ${liens[cle]} → ${poids}`);

    rapport.push({ ligne: i + 1, aa_code: code, description: desc, poids,
      etat: actes.length ? (dejaLa && dejaLie ? 'modifiee' : 'creee') : 'inchangee',
      quoi: actes.join(' · ') || 'rien à faire' });

    if (simulation) continue;

    if (!dejaLa) {
      db.prepare(`INSERT INTO aa (aa_code, ue_num, aa_num, description, cours_code)
        VALUES (?,?,?,?,NULL)`).run(code, co.ue_num, ++numSuivant, desc);
      existants[cle] = { aa_code: code, description: desc, aa_num: numSuivant };
    } else if (desc && !dejaLa.description) {
      // On complète un intitulé absent ; on n'écrase jamais celui qui existe.
      db.prepare('UPDATE aa SET description = ? WHERE ue_num = ? AND aa_code = ?')
        .run(desc, co.ue_num, dejaLa.aa_code);
    }

    db.prepare(`
      INSERT INTO aa_ponderation (ue_num, cours_code, aa_code, poids, maj_le)
      VALUES (?,?,?,?, datetime('now'))
      ON CONFLICT(cours_code, aa_code) DO UPDATE SET
        poids = excluded.poids, ue_num = excluded.ue_num, maj_le = datetime('now')
    `).run(co.ue_num, coursCode, existants[cle].aa_code, poids);
  }

  // « Remplacer » délie ce que le fichier ne mentionne pas — sans jamais
  // supprimer l'acquis lui-même : un autre cours peut l'évaluer.
  let delies = [];
  if (remplacer) {
    delies = Object.keys(liens).filter(c => !vus.has(c));
    if (!simulation) {
      const del = db.prepare(
        'DELETE FROM aa_ponderation WHERE cours_code = ? AND aa_code = ?');
      for (const c of delies) {
        const vrai = Object.values(existants).find(a =>
          String(a.aa_code).toUpperCase() === c);
        del.run(coursCode, vrai ? vrai.aa_code : c);
      }
    }
  }

  const compte = (e) => rapport.filter(r0 => r0.etat === e).length;
  res.json({
    simulation: !!simulation, cours: co, annee: an, rapport,
    delies,
    resume: { creees: compte('creee'), modifiees: compte('modifiee'),
              inchangees: compte('inchangee'), ignorees: compte('ignoree'),
              refusees: compte('refusee'), deliees: delies.length },
  });
});

/**
 * NP OU PP SUR TOUTE L'ÉPREUVE D'UN COURS.
 *
 * L'étudiant ne s'est pas présenté, ou s'est présenté sans rien produire :
 * cela ne vise pas un acquis, cela vise l'épreuve. Tous les acquis que ce
 * cours évalue passent donc à zéro, avec la mention qui dit pourquoi.
 */
r.put('/cours/:coursCode/epreuve', authRequired,
      roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const coursCode = req.params.coursCode;
  const { etudiant_id, annee_scolaire, session, mention } = req.body || {};
  if (!etudiant_id || !annee_scolaire) {
    return res.status(400).json({ error: 'étudiant et année requis' });
  }
  if (mention != null && !['NP', 'PP'].includes(mention)) {
    return res.status(400).json({ error: 'mention attendue : NP, PP, ou rien pour effacer' });
  }

  const co = db.prepare(`
    SELECT cours_code, ue_num, section FROM cours WHERE cours_code = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(coursCode, annee_scolaire);
  if (!co) return res.status(404).json({ error: 'cours introuvable' });

  const permis = coursAutorises(req.user, annee_scolaire);
  if (permis && !permis.has(coursCode)) {
    return res.status(403).json({ error: "Ce cours ne vous est pas attribué cette année." });
  }

  // Les acquis que CE cours évalue.
  let acquis = db.prepare(
    'SELECT aa_code FROM aa_ponderation WHERE ue_num = ? AND cours_code = ?'
  ).all(co.ue_num, coursCode).map(a => a.aa_code);
  if (!acquis.length) {
    acquis = db.prepare('SELECT aa_code FROM aa WHERE ue_num = ? AND cours_code = ?')
      .all(co.ue_num, coursCode).map(a => a.aa_code);
  }
  if (!acquis.length) {
    return res.status(400).json({
      error: "Aucun acquis n'est rattaché à ce cours : il n'y a rien à coter." });
  }

  const prefixe = session === 1 || session === 2 ? `s${session}|` : 's1|';
  const poser = db.prepare(`
    INSERT INTO etudiant_note_detail
      (etudiant_id, annee_scolaire, ue_num, type, code, points, mention)
    VALUES (?,?,?, 'aa', ?, 0, ?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
      points = 0, mention = excluded.mention`);
  const effacer = db.prepare(`DELETE FROM etudiant_note_detail
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa' AND code = ?`);

  db.transaction(() => {
    for (const aa of acquis) {
      const code = `${prefixe}${coursCode}|${aa}`;
      if (mention) poser.run(etudiant_id, annee_scolaire, co.ue_num, code, mention);
      else effacer.run(etudiant_id, annee_scolaire, co.ue_num, code);
    }
  })();

  res.json({ ok: true, cours_code: coursCode, mention: mention || null,
             acquis: acquis.length });
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
/**
 * QUELLE SESSION RESTE-T-IL À DÉLIBÉRER ?
 *
 * On ne le demande pas : on le déduit. Tant que la première session n'a pas
 * été décidée pour tout le monde, c'est elle. Sans ajourné, il n'y a pas de
 * seconde session, et le bouton n'a pas à en proposer une.
 *
 * MAIS LA SECONDE NE S'OUVRE PAS À LA DERNIÈRE DÉCISION ENCODÉE : elle
 * s'ouvre à la CLÔTURE de la séance de juin. La règle précédente basculait
 * l'unité en session 2 à l'instant où le dernier ajournement était noté —
 * si bien que le Conseil, en rouvrant sa propre feuille, se voyait proposer
 * des refus (art. 69 §2 : l'ajourné qui échoue EN SECONDE session est
 * refusé) pour les étudiants qu'il venait d'ajourner en première, et les
 * notifications sortaient en annexe 9 au lieu de l'annexe 8.
 *
 * Tant que la séance de première session n'est pas close, on peut encore
 * revenir sur une décision : c'est toujours la première session.
 */
export function sessionDeLUE(ueNum, annee) {
  const inscrits = db.prepare(
    'SELECT COUNT(*) AS n FROM etudiant_inscription WHERE annee_scolaire = ? AND ue_num = ?')
    .get(annee, ueNum).n;
  const parSession = {};
  for (const l of db.prepare(`
    SELECT session, COUNT(*) AS n,
           SUM(CASE WHEN resultat = 'ajourne' THEN 1 ELSE 0 END) AS ajournes
    FROM deliberation_resultat
    WHERE ue_num = ? AND annee_scolaire = ? AND resultat IS NOT NULL
    GROUP BY session
  `).all(ueNum, annee)) parSession[l.session] = l;

  const s1 = parSession[1] || { n: 0, ajournes: 0 };
  const s2 = parSession[2] || { n: 0, ajournes: 0 };
  const s1Faite = inscrits > 0 && s1.n >= inscrits;

  // La séance de première session est-elle close ? C'est elle qui fait passer
  // l'unité en seconde session, non le simple encodage des décisions.
  const s1Close = !!(db.prepare(`
    SELECT cloturee FROM deliberation_seance
    WHERE ue_num = ? AND annee_scolaire = ? AND session = 1
  `).get(ueNum, annee)?.cloturee);

  const secondeOuverte = s1Faite && s1.ajournes > 0 && s1Close;

  return {
    session: secondeOuverte ? 2 : 1,
    inscrits,
    s1: { decides: s1.n, ajournes: s1.ajournes, complete: s1Faite, cloturee: s1Close },
    s2: { decides: s2.n },
    // Sans ajourné en première session, la seconde n'a pas lieu d'être ; sans
    // clôture, elle n'est pas encore ouverte.
    seconde_possible: secondeOuverte,
    // Ce qui manque pour l'ouvrir, à dire à l'écran plutôt qu'à deviner.
    seconde_attend: s1Faite && s1.ajournes > 0 && !s1Close
      ? 'la clôture de la séance de première session' : null,
  };
}

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

  // La session : celle qu'on demande, ou celle qui reste à faire.
  const etat = sessionDeLUE(ueNum, annee);
  const session = req.query.session ? (Number(req.query.session) === 2 ? 2 : 1) : etat.session;

  // EN SECONDE SESSION, SEULS LES AJOURNÉS. Les autres ont fini : les faire
  // défiler à nouveau, c'est risquer de rouvrir ce qui était clos.
  const etudiants = session < 2
    ? db.prepare(`
      SELECT e.id, e.nom, e.prenom, e.id_ecampus, i.resultat, i.points
      FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND i.ue_num = ?
      ORDER BY e.nom, e.prenom
    `).all(annee, ueNum)
    : db.prepare(`
      SELECT e.id, e.nom, e.prenom, e.id_ecampus,
             r2.resultat, r2.points,
             r1.resultat AS resultat_s1, r1.points AS points_s1
      FROM deliberation_resultat r1
      JOIN etudiant e ON e.id = r1.etudiant_id
      LEFT JOIN deliberation_resultat r2
        ON r2.etudiant_id = r1.etudiant_id AND r2.annee_scolaire = r1.annee_scolaire
       AND r2.ue_num = r1.ue_num AND r2.session = 2
      WHERE r1.annee_scolaire = ? AND r1.ue_num = ? AND r1.session = 1
        AND r1.resultat = 'ajourne'
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
    const d = delibererUE(e.id, ueNum, annee, session);
    const ailleurs = (dejaFaveur[e.id] || []).sort((a, b) => a - b)
      .map(n => ({ ue_num: n, ue_nom: nomUE[n] || null }));
    return { ...e, ...d,
      parcours: parcoursDeLAnnee(e.id, annee),
      ue: { ...d.ue, ...aideDecision(d, moyennes[e.id] ?? null, ailleurs) } };
  });

  // Les colonnes se prennent sur la première ligne calculée : la structure de
  // l'unité est la même pour tous, seules les notes changent.
  const modele = lignes[0] || delibererUE(0, ueNum, annee, session);

  res.json({
    ue_num: ueNum, ue_nom: ue.ue_nom || `UE ${ueNum}`, section: ue.section || null,
    annee, session, etat_sessions: etat,
    seuil: SEUIL_UE, epreuve_integree: estEpreuveIntegree(ueNum, annee),
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
        heure_seance   TEXT,
        visite_date    TEXT,
        visite_heure   TEXT,
        visite_local   TEXT,
        cloturee       INTEGER NOT NULL DEFAULT 0,
        maj_le         TEXT DEFAULT CURRENT_TIMESTAMP,
        maj_par        TEXT,
        UNIQUE(ue_num, annee_scolaire)
      );
      -- LA SECONDE SESSION SE TIENT COURS PAR COURS. Deux professeurs ne
      -- repassent pas leurs épreuves le même jour, et une date unique pour
      -- l'unité obligeait le secrétariat à corriger chaque notification à la
      -- main. Ce qui manque ici retombe sur la date de la séance.
      CREATE TABLE IF NOT EXISTS deliberation_session2 (
        ue_num         INTEGER NOT NULL,
        annee_scolaire TEXT    NOT NULL,
        cours_code     TEXT    NOT NULL,
        s2_date        TEXT,
        s2_heure       TEXT,
        s2_local       TEXT,
        s2_adresse     TEXT,
        PRIMARY KEY (ue_num, annee_scolaire, cours_code)
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
    // LA SECONDE SESSION se notifie avec l'ajournement : sans sa date, son
    // heure et son local, l'annexe 8 part avec des pointillés que le
    // secrétariat remplit à la main, cent fois.
    for (const col of ['session2_date TEXT', 'session2_heure TEXT',
                       'session2_local TEXT', 'session2_adresse TEXT']) {
      try { db.exec(`ALTER TABLE deliberation_seance ADD COLUMN ${col}`); } catch { /* déjà là */ }
    }
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
      role: 'professeur', voix: 'deliberative',
    });
  }

  const ue = db.prepare(`
    SELECT section FROM ue WHERE ue_num = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(ueNum, annee) || {};
  if (ue.section) {
    const sec = db.prepare('SELECT responsable FROM section WHERE code = ?').get(ue.section);
    // LA COORDINATION SIÈGE, MAIS DE QUELLE VOIX ?
    //
    // Le texte est étroit : « lorsqu'un membre du personnel est chargé du suivi
    // social et pédagogique d'un groupe particulier, il participe aux réunions
    // du CDE RELATIVES AU SUIVI PÉDAGOGIQUE » (RGE art. 22 al. 2 ; décret
    // art. 52 al. 2, qui renvoie au seul art. 53, 2°). La sanction des études
    // est le 3° : la coordination n'y est donc pas membre de plein droit.
    //
    // Mais si l'établissement a ouvert la fonction de CONSEILLER À LA
    // FORMATION, l'article 91/3 §2 le fait participer au conseil des études
    // sans restreindre aux réunions de suivi. Le statut dépend donc de la
    // fonction réellement occupée, que Lucie ne peut pas deviner : d'où un
    // réglage, dont le défaut suit le texte le plus étroit.
    membres.push({
      cle: 'coordination', nom: sec?.responsable || `Coordination ${ue.section}`,
      qualite: 'Coordination de section · suivi pédagogique', role: 'coordination',
      voix: coordinationDelibere() ? 'deliberative' : 'consultative',
    });
  }

  let directeur = null;
  try { directeur = identiteEtablissement()?.directeur || null; } catch { /* défaut ci-dessous */ }
  membres.push({
    cle: 'direction', nom: directeur || 'Direction',
    qualite: 'Direction ou son représentant', role: 'direction',
    voix: 'deliberative',
  });

  return membres;
}

/**
 * LE QUORUM DES DEUX TIERS.
 *
 * « Pour délibérer valablement, au moins deux tiers des membres du CDE ou du
 * Jury d'EI doivent être présents » (RGE art. 25 §1).
 *
 * Il se calcule sur les seules voix délibératives : compter au dénominateur
 * quelqu'un qui n'est pas membre pour cette réunion-là durcirait le quorum
 * sans raison, et le compter au numérateur validerait une séance qui ne l'est
 * pas. Les deux tiers s'arrondissent VERS LE HAUT — deux tiers de 4 font 2,67,
 * et l'on ne délibère pas à 2,67 : il en faut 3.
 */
function etatQuorum(membres, presences) {
  const votants = membres.filter(m => (m.voix || 'deliberative') === 'deliberative');
  const presents = votants.filter(m => presences[m.cle]);
  const requis = Math.ceil((votants.length * 2) / 3);
  return {
    membres: votants.length,
    presents: presents.length,
    requis,
    atteint: votants.length > 0 && presents.length >= requis,
    // Les voix consultatives se comptent à part : elles figurent au procès-
    // verbal, elles ne font pas le quorum.
    consultatifs_presents: membres.filter(
      m => m.voix === 'consultative' && presences[m.cle]).length,
  };
}

r.get('/deliberation/ue/:ueNum/seance', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);
  // Chaque session a SA séance : ses présences, sa date, sa visite des copies.
  // Le procès-verbal de septembre ne peut pas porter le Conseil de juin.
  const session = Number(req.query.session) === 2 ? 2 : 1;

  const seance = db.prepare(
    'SELECT * FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ? AND session = ?'
  ).get(ueNum, annee, session) || null;

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
      membres.push({ cle, nom: l.nom, qualite: l.qualite, role: 'ajoute',
                     voix: 'deliberative', present: !!l.present });
    }
  }

  // Les cours de l'unité, avec la date de seconde session propre à chacun.
  const parCours = Object.fromEntries(db.prepare(`
    SELECT * FROM deliberation_session2 WHERE ue_num = ? AND annee_scolaire = ?
  `).all(ueNum, annee).map(l => [l.cours_code, l]));

  const session2 = structureUE(ueNum, annee).map(c => {
    const l = parCours[c.cours_code] || {};
    return {
      cours_code: c.cours_code, cours_nom: c.cours_nom,
      date: l.s2_date || null, heure: l.s2_heure || null,
      local: l.s2_local || null, adresse: l.s2_adresse || null,
    };
  });

  const quorum = etatQuorum(membres,
    Object.fromEntries(membres.map(m => [m.cle, m.present])));

  res.json({ ue_num: ueNum, annee, session, seance, membres, session2, quorum });
});

r.put('/deliberation/ue/:ueNum/seance', authRequired,
      roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.body?.annee || anneeDeTravail(req);
  const session = Number(req.body?.session) === 2 ? 2 : 1;
  const { membres, date_seance, heure_seance, visite_date, visite_heure, visite_local, cloturee,
          session2_date, session2_heure, session2_local, session2_adresse,
          session2_cours } = req.body || {};

  // LA DATE ET L'HEURE SE CORRIGENT TANT QUE LA SÉANCE EST OUVERTE — après,
  // elles sont dans le procès-verbal signé et ne se retouchent plus : il faut
  // annuler la délibération, ce qui rouvre la séance et se voit.
  if ((date_seance || heure_seance) && !cloturee) {
    const close = !!(db.prepare(`
      SELECT cloturee FROM deliberation_seance
      WHERE ue_num = ? AND annee_scolaire = ? AND session = ?
    `).get(ueNum, annee, session)?.cloturee);
    if (close) {
      return res.status(409).json({
        error: 'séance close',
        detail: 'La séance est clôturée : sa date et son heure figurent au '
              + 'procès-verbal. Annulez la délibération pour les corriger.',
      });
    }
  }

  // LE QUORUM SE VÉRIFIE À LA CLÔTURE, ET NULLE PART AILLEURS.
  //
  // Tant que la séance est ouverte, le Conseil s'installe : on coche les
  // présences, on attend un retardataire. C'est la clôture qui arrête l'acte,
  // et c'est donc elle qui doit constater que les deux tiers y étaient
  // (RGE art. 25 §1). Une délibération close sous le quorum est une
  // délibération attaquable ; mieux vaut un refus ici qu'un recours en août.
  if (cloturee) {
    const membres = membresDuConseil(ueNum, annee);
    const posees = Array.isArray(membres) && Array.isArray(req.body?.membres)
      ? Object.fromEntries(req.body.membres.map(m => [m.cle, !!m.present]))
      : null;
    // À défaut de présences transmises, on lit celles déjà enregistrées.
    let presences = posees;
    if (!presences) {
      const s = db.prepare(`SELECT id FROM deliberation_seance
        WHERE ue_num = ? AND annee_scolaire = ? AND session = ?`).get(ueNum, annee, session);
      presences = s ? Object.fromEntries(db.prepare(
        'SELECT cle, present FROM deliberation_presence WHERE seance_id = ?'
      ).all(s.id).map(l => [l.cle, !!l.present])) : {};
    }
    // Un membre ajouté à la main siège aussi : il compte.
    const tous = [...membres];
    for (const cle of Object.keys(presences)) {
      if (!tous.some(m => m.cle === cle)) tous.push({ cle, voix: 'deliberative' });
    }
    const q = etatQuorum(tous, presences);
    if (!q.atteint) {
      return res.status(409).json({
        error: `Quorum non atteint : ${q.presents} membre(s) présent(s) sur `
             + `${q.membres} à voix délibérative, il en faut ${q.requis} `
             + `(deux tiers, RGE art. 25 §1). La séance reste ouverte.`,
        quorum: q,
      });
    }
  }

  db.transaction(() => {
    db.prepare(`
      INSERT INTO deliberation_seance
        (ue_num, annee_scolaire, session, date_seance, heure_seance,
         visite_date, visite_heure, visite_local,
         session2_date, session2_heure, session2_local, session2_adresse,
         cloturee, maj_le, maj_par)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'), ?)
      ON CONFLICT(ue_num, annee_scolaire, session) DO UPDATE SET
        date_seance      = COALESCE(excluded.date_seance,      deliberation_seance.date_seance),
        heure_seance     = COALESCE(excluded.heure_seance,     deliberation_seance.heure_seance),
        visite_date      = COALESCE(excluded.visite_date,      deliberation_seance.visite_date),
        visite_heure     = COALESCE(excluded.visite_heure,     deliberation_seance.visite_heure),
        visite_local     = COALESCE(excluded.visite_local,     deliberation_seance.visite_local),
        session2_date    = COALESCE(excluded.session2_date,    deliberation_seance.session2_date),
        session2_heure   = COALESCE(excluded.session2_heure,   deliberation_seance.session2_heure),
        session2_local   = COALESCE(excluded.session2_local,   deliberation_seance.session2_local),
        session2_adresse = COALESCE(excluded.session2_adresse, deliberation_seance.session2_adresse),
        cloturee     = MAX(excluded.cloturee, deliberation_seance.cloturee),
        maj_le = datetime('now'), maj_par = excluded.maj_par
    `).run(ueNum, annee, session, date_seance || null, heure_seance || null,
      visite_date || null, visite_heure || null,
           visite_local || null, session2_date || null, session2_heure || null,
           session2_local || null, session2_adresse || null,
           cloturee ? 1 : 0, req.user?.email || null);

    // Une date de seconde session par cours.
    if (Array.isArray(session2_cours)) {
      const up = db.prepare(`
        INSERT INTO deliberation_session2
          (ue_num, annee_scolaire, cours_code, s2_date, s2_heure, s2_local, s2_adresse)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(ue_num, annee_scolaire, cours_code) DO UPDATE SET
          s2_date = excluded.s2_date, s2_heure = excluded.s2_heure,
          s2_local = excluded.s2_local, s2_adresse = excluded.s2_adresse`);
      for (const c of session2_cours) {
        if (!c?.cours_code) continue;
        up.run(ueNum, annee, c.cours_code, c.date || null, c.heure || null,
               c.local || null, c.adresse || null);
      }
    }

    if (Array.isArray(membres)) {
      const s = db.prepare(
        'SELECT id FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ? AND session = ?'
      ).get(ueNum, annee, session);
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
    'SELECT * FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ? AND session = ?'
  ).get(ueNum, annee, session);
  res.json({ ok: true, session, seance });
});

/**
 * LES DOCUMENTS D'UNE DÉLIBÉRATION — ce que le secrétariat doit sortir.
 *
 * Une séance close produit trois piles : les attestations de réussite, les
 * notifications d'ajournement (annexe 8) et celles de refus (annexe 9). Elles
 * s'imprimaient jusqu'ici étudiant par étudiant, depuis sa fiche.
 *
 * GET compte ; POST assemble tout en UN document, chaque pièce sur sa page.
 */
r.get('/deliberation/ue/:ueNum/documents', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.query.annee || anneeDeTravail(req);

  const etudiants = db.prepare(`
    SELECT e.id, e.nom, e.prenom, i.resultat, i.points
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ?
    ORDER BY e.nom, e.prenom
  `).all(annee, ueNum);

  const par = r0 => etudiants.filter(e => e.resultat === r0);
  const seance = db.prepare(
    'SELECT cloturee, visite_date FROM deliberation_seance'
    + ' WHERE ue_num = ? AND annee_scolaire = ? AND session = ?'
  ).get(ueNum, annee, Number(req.query.session) === 2 ? 2 : sessionDeLUE(ueNum, annee).session) || {};

  // Les listes d'ajournés : une par cours, qu'il y ait des ajournés ou non.
  const nbCours = db.prepare(
    'SELECT COUNT(*) AS n FROM cours WHERE ue_num = ? AND annee_scolaire = ?')
    .get(ueNum, annee).n;

  res.json({
    ue_num: ueNum, annee,
    reussites: par('reussi'), ajournements: par('ajourne'), refus: par('refuse'),
    absents: par('absent'),
    nb_cours: nbCours,
    sans_decision: etudiants.filter(e => !e.resultat),
    cloturee: !!seance.cloturee, visite_date: seance.visite_date || null,
  });
});

const STYLE_LISTES = `<style>
  .titre-liste { font-size: 13pt; font-weight: 700; color:#1B2B4B; margin: 5mm 0 0.5mm; }
  .sous-liste { font-size: 9pt; color:#5b6577; margin-bottom: 3mm; }
  .neant { font-size: 11pt; font-style: italic; color:#7a8699; text-align:center;
           padding: 8mm 0; border: 0.25mm dashed #cbd2dd; border-radius: 2mm; }
  .signature-liste { margin-top: 12mm; font-size: 9pt; }
  .signature-liste .ligne-sign { margin-top: 10mm; border-top: 0.25mm solid #94a3b8;
                                 width: 60mm; padding-top: 1mm; }
</style>`;

/**
 * LES LISTES D'AJOURNÉS, COURS PAR COURS.
 *
 * Le procès-verbal dit l'unité ; le professeur, lui, a besoin de savoir qui il
 * réinterroge dans SON cours. On tirait cette liste à la main du PV, en
 * recopiant les noms — et c'est là que l'on oublie quelqu'un.
 *
 * Une liste par cours, dans l'ordre des cours de l'unité, chacune sur sa page.
 * Un cours sans ajourné n'est PAS omis : il porte la mention « Néant ». Une
 * liste absente laisse croire qu'on l'a oubliée ; une liste vide dit que le
 * cours n'a personne à revoir, et c'est une information.
 */
export function documentAjournesParCours(ueNum, annee, session = 1) {
  const ident = identiteEtablissement();
  const ue = db.prepare(`
    SELECT ue_nom, ue_niv FROM ue WHERE ue_num = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(ueNum, annee) || {};
  const cours = db.prepare(`
    SELECT cours_code, cours_nom FROM cours
    WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_num, cours_code
  `).all(ueNum, annee);

  // Les ajournés de la session : ceux dont le Conseil a arrêté « ajourné »,
  // et pour chacun les cours qu'il doit représenter.
  const ajournes = db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus
    FROM deliberation_resultat r JOIN etudiant e ON e.id = r.etudiant_id
    WHERE r.ue_num = ? AND r.annee_scolaire = ? AND r.session = ? AND r.resultat = 'ajourne'
    ORDER BY e.nom, e.prenom
  `).all(ueNum, annee, session);

  const parCours = {};
  for (const e of ajournes) {
    const d = delibererUE(e.id, ueNum, annee, session);
    for (const c of d.cours) {
      if (!c.na) continue;
      (parCours[c.cours_code] ||= []).push({
        ...e,
        aas: (c.aas || []).map(a => (typeof a === 'string' ? a : a.aa_code)),
      });
    }
  }

  const esc0 = t => String(t ?? '').replace(/[&<>"]/g,
    x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));

  const pages = cours.map(c => {
    const liste = parCours[c.cours_code] || [];
    const corps = liste.length ? `
      <table class="doc">
        <tr><th style="width:8mm">N°</th><th>Étudiant</th><th style="width:26mm">Matricule</th>
            <th>Acquis à représenter</th></tr>
        ${liste.map((e, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc0(e.nom)} ${esc0(e.prenom)}</td>
          <td>${esc0(e.id_ecampus || '')}</td>
          <td>${esc0((e.aas || []).join(', ')) || '—'}</td>
        </tr>`).join('')}
      </table>
      <p class="fin">${liste.length} étudiant(s) à représenter dans ce cours.</p>`
      : '<p class="neant">Néant — aucun étudiant n’est à représenter dans ce cours.</p>';

    return `<div class="attestation">
      <div class="entete">
        <div class="nom">${esc0(ident.nom || 'INSTITUT ILYA PRIGOGINE')}</div>
        <div class="sous">Liste des étudiants ajournés — ${session === 2 ? 'seconde' : 'première'} session</div>
      </div>
      <div class="titre-liste">${esc0(c.cours_nom || c.cours_code)}</div>
      <div class="sous-liste">Cours ${esc0(c.cours_code)} · UE ${ueNum}
        ${ue.ue_nom ? `— ${esc0(ue.ue_nom)}` : ''} · ${esc0(annee)}</div>
      ${corps}
      <div class="signature-liste">
        <div>Le président du Conseil des études</div>
        <div class="ligne-sign">${esc0(ident.directeur || '')}</div>
      </div>
    </div>`;
  });

  return {
    corps: pages.join(''),
    // Le style se donne À PART : inséré dans le flux, il s'intercalait entre
    // deux pièces et cassait le saut de page qui les sépare.
    style: STYLE_LISTES,
    nb_listes: pages.length,
    nb_ajournes: ajournes.length,
    sans_cours: !cours.length,
  };
}



r.post('/deliberation/ue/:ueNum/documents', authRequired, (req, res) => {
  const ueNum = Number(req.params.ueNum);
  const annee = req.body?.annee || anneeDeTravail(req);
  const veut = {
    reussite: req.body?.reussite !== false,
    ajournement: req.body?.ajournement !== false,
    refus: req.body?.refus !== false,
    pv: req.body?.pv === true,
    listes: req.body?.listes === true,
  };

  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};
  let ident = {};
  try { ident = identiteEtablissement() || {}; } catch { ident = {}; }

  const etudiants = db.prepare(`
    SELECT e.*, i.resultat
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ?
    ORDER BY e.nom, e.prenom
  `).all(annee, ueNum);

  const pages = [];
  // Les styles propres à certaines pièces se rassemblent EN TÊTE du document :
  // au milieu, un <style> sépare deux pièces sœurs et désamorce leur saut de
  // page — la liste des ajournés se retrouvait alors sur la page de signature
  // de la dernière notification.
  const styles = [];
  const manques = [];
  let nbR = 0, nbA = 0, nbX = 0, nbPV = 0;

  // LE PROCÈS-VERBAL EN TÊTE : c'est la pièce du Conseil, les notifications
  // sont ce qu'on en tire. Il suit la même charte, il s'imprime avec elles.
  if (veut.pv) {
    const d = documentPV(ueNum, annee, req.body?.session === 2 ? 2 : 1);
    pages.push(d.corps);
    nbPV = 1;
    for (const m of (d.manques || [])) manques.push(`Procès-verbal : ${m}`);
  }

  for (const e of etudiants) {
    if (e.resultat === 'reussi' && veut.reussite) {
      // L'attestation ne porte que CETTE unité : c'est cette séance qu'on
      // notifie, non tout le parcours de l'étudiant.
      const u = unitesReussies(e.id, annee).find(x => Number(x.ue_num) === ueNum);
      if (!u) { manques.push(`${e.nom} ${e.prenom} : unité non réussie au dossier`); continue; }
      pages.push(pageAttestation(e, u, annee, etab, req.body?.date_document || null, ident));
      if (u.manques?.length) manques.push(`${e.nom} ${e.prenom} : ${u.manques.join(', ')}`);
      nbR++;
    } else if ((e.resultat === 'ajourne' && veut.ajournement)
            || (e.resultat === 'refuse' && veut.refus)) {
      const d = documentMotivation(e.id, ueNum, annee);
      if (d.erreur) { manques.push(`${e.nom} ${e.prenom} : ${d.erreur}`); continue; }
      // On reprend le CORPS, non le document entier : les pièces s'enchaînent
      // dans une seule enveloppe, chacune sur sa page.
      pages.push(d.corps);
      if (e.resultat === 'ajourne') nbA++; else nbX++;
    }
  }

  // Les listes d'ajournés viennent APRÈS les notifications : le secrétariat
  // envoie les unes aux étudiants et remet les autres aux professeurs.
  let nbL = 0;
  if (veut.listes) {
    const l = documentAjournesParCours(ueNum, annee, req.body?.session === 2 ? 2 : 1);
    if (l.sans_cours) manques.push("Listes : aucun cours n'est encodé pour cette unité");
    else { styles.push(l.style || ''); pages.push(l.corps); nbL = l.nb_listes; }
  }

  if (!pages.length) {
    return res.status(400).json({
      error: 'Aucun document à produire : les décisions ne sont pas encore '
           + 'enregistrées, ou aucune ne correspond aux pièces demandées.',
      manques,
    });
  }

  res.json({
    html: envelopper(styles.join('') + pages.join(''),
                     `Documents de délibération — UE ${ueNum}`),
    nom: `Documents_UE${ueNum}_${String(annee).replace(/\W/g, '')}.html`,
    reussites: nbR, ajournements: nbA, refus: nbX, pv: nbPV, listes: nbL,
    pieces: pages.length, manques,
  });
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

    // LA TRACE PAR SESSION S'EFFACE AUSSI. Elle ne l'était pas : on vidait le
    // résultat de l'inscription en laissant dans deliberation_resultat la
    // décision qu'on venait d'annuler. Comme le dossier reprend ensuite « la
    // session la plus avancée », un refus effacé revenait de lui-même dès la
    // décision suivante — et l'annulation ne servait à rien.
    db.prepare(`
      DELETE FROM deliberation_resultat
      WHERE annee_scolaire = ? AND ue_num = ?${cond}
    `).run(...args);

    ajustements = db.prepare(`
      DELETE FROM deliberation_ajustement
      WHERE annee_scolaire = ? AND ue_num = ?${cond}
    `).run(...args).changes;

    // La séance ne se rouvre que si l'on annule l'unité entière.
    if (!etudId) {
      db.prepare(`
        UPDATE deliberation_seance
        SET cloturee = 0, visite_date = NULL, visite_heure = NULL, visite_local = NULL,
            session2_date = NULL, session2_heure = NULL, session2_local = NULL,
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
/**
 * Le procès-verbal, en fonction : le centre d'impression l'enchaîne avec les
 * attestations et les notifications, dans un seul document à imprimer.
 */
export function documentPV(ueNum, annee, session = 1) {

  const ue = db.prepare(`
    SELECT ue_nom, section, ue_per_etudiants, ue_code_fwb, ue_niv, ue_niveau
    FROM ue WHERE ue_num = ?
    ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1
  `).get(ueNum, annee) || {};
  const integree = estEpreuveIntegree(ueNum, annee);
  const regles = reglesAjournement();
  const sec = ue.section
    ? db.prepare('SELECT libelle, niveau, code_fwb FROM section WHERE code = ?').get(ue.section)
    : null;

  const etab = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};
  // L'identité vient d'une table de configuration : si elle manque, le PV doit
  // sortir quand même, avec des blancs, plutôt que de tomber en 500.
  let ident = {};
  try { ident = identiteEtablissement() || {}; } catch { ident = {}; }

  // La séance de CETTE session : présences, date, visite des copies. Le
  // procès-verbal de septembre ne peut pas porter le Conseil de juin.
  const seance = db.prepare(
    'SELECT * FROM deliberation_seance WHERE ue_num = ? AND annee_scolaire = ? AND session = ?'
  ).get(ueNum, annee, session) || {};
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
<div class="attestation piece">
  <div class="entete">
    <div class="cf">COMMUNAUTÉ FRANÇAISE DE BELGIQUE</div>
    <div class="epa">ENSEIGNEMENT POUR ADULTES</div>
    <div class="annee">Année scolaire / académique ${esc(String(annee).replace('-', '/'))}
      · ${/sup|bach|bes|master/i.test(ue.ue_niveau || ue.ue_niv || sec?.niveau || '')
        ? 'Enseignement supérieur' : 'Enseignement secondaire'}</div>
  </div>

  <div class="etab">
    <div>
      <div class="nom">${esc(ident.nom || etab.etab_nom || '')}</div>
      <div>${esc(ident.adresse || etab.adresse || '')}</div>
    </div>
    <div class="ident">
      Matricule ${esc(ident.matricule || etab.num_ecot || '……………')}<br>
      FASE ${esc(ident.fase || etab.num_fase || '……………')}
    </div>
  </div>

  <h1>PROCÈS-VERBAL DE DÉLIBÉRATION D'UNE UNITÉ D'ENSEIGNEMENT${
    integree ? ' « ÉPREUVE INTÉGRÉE »' : ''}</h1>
  <h2>${esc((ue.ue_nom || `UE ${ueNum}`).toUpperCase())}</h2>
  <div class="filet"></div>

  <div class="carac">
    <div class="large">Code approuvé par le Gouvernement :
      ${ue.ue_code_fwb ? `<b>${esc(ue.ue_code_fwb)}</b>`
                       : '<span class="manque">à compléter au référentiel</span>'}</div>
    <div>${ue.ue_per_etudiants ? `<b>${ue.ue_per_etudiants}</b> périodes`
                               : '<span class="manque">périodes à compléter</span>'}</div>
    <div>${session}<sup>${session === 1 ? 're' : 'e'}</sup> session ·
      délibérée le <b>${esc(jour(seance.date_seance) || '……………')}</b>${
      seance.heure_seance ? ` à ${esc(seance.heure_seance)}` : ''}</div>
    ${integree ? `<div class="large">Section : ${esc(sec?.libelle || ue.section || '')}
      ${sec?.code_fwb ? `· code ${esc(sec.code_fwb)}` : ''}</div>` : ''}
  </div>

  <p class="corps">
    Nous, soussignés, Président-e et Membres du ${esc(conseil)} constitué par le
    Pouvoir organisateur de l'établissement précité en vue de la délivrance de
    l'attestation de réussite de l'unité d'enseignement susvisée, après en avoir
    délibéré, avons pris les décisions suivantes :
  </p>

  <table class="doc">
    <thead><tr>
      <th style="width:34%">Nom, prénom et initiales des autres prénoms</th>
      <th style="width:26%">Lieu et date de naissance<br>(pays si pas la Belgique)</th>
      <th style="width:13%">Seuil de réussite</th>
      <th style="width:13%">Total des points en %<sup>1</sup></th>
      <th>Décision finale</th>
    </tr></thead>
    <tbody>${lignes || '<tr><td colspan="5" class="c vide">Aucun étudiant inscrit.</td></tr>'}</tbody>
  </table>
  <p class="champ" style="font-size:7.5pt;color:#64748b">
    <sup>1</sup> À ne compléter qu'en cas de « Réussite ».</p>

  <div class="info">
    <div class="titre">Le ${esc(conseil)}</div>
    ${presents.length
      ? `<div class="membres">${presents.map(m => `<div class="m">
          <b>${esc(m.nom)}</b><br><span>${esc(m.qualite || '')}</span></div>`).join('')}</div>`
      : '<div class="ligne vide">Les présences n\'ont pas été enregistrées.</div>'}
  </div>

  <div class="info">
    <div class="ligne">Le présent procès-verbal comporte …… page(s).</div>
    <div class="ligne">Le ${esc(conseil)} a délibéré le
      <b>${esc(jour(seance.date_seance) || '……………')}</b>${
      seance.heure_seance ? ` à <b>${esc(seance.heure_seance)}</b>` : ''}.</div>
    <div class="ligne">Les résultats sont communiqués conformément au ROI de
      l'établissement le <b>${esc(jour(seance.visite_date) || '……………')}</b>${
      seance.visite_heure ? ` à ${esc(seance.visite_heure)}` : ''}${
      seance.visite_local ? `, local ${esc(seance.visite_local)}` : ''}.</div>
    ${seance.session2_date ? `<div class="ligne">Seconde session le
      <b>${esc(jour(seance.session2_date))}</b>${
      seance.session2_heure ? ` à ${esc(seance.session2_heure)}` : ''}${
      seance.session2_local ? `, local ${esc(seance.session2_local)}` : ''}.</div>` : ''}
  </div>

  <div class="cloture">
    <div class="sceau"></div>
    <div class="paraphe"></div>
    <div class="lieu">Fait en un exemplaire à ${esc(ident.ville || 'Anderlecht')},
      le ${esc(jour(seance.date_seance) || '……………')}</div>
    <div class="legende">
      <div class="qualite">Pour le ${esc(conseil)},<br>le Directeur</div>
      <div class="nom">${esc(ident.directeur || 'Charles SOHET')}</div>
    </div>
  </div>
</div>`;

  const html = envelopper(corps, `PV de délibération — UE ${ueNum}`);

  return {
    html, corps,
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
  };
}

r.get('/deliberation/ue/:ueNum/pv', authRequired, (req, res) => {
  const d = documentPV(Number(req.params.ueNum),
    req.query.annee || anneeDeTravail(req),
    req.query.session === '2' ? 2 : 1);
  res.json(d);
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
  const etat = sessionDeLUE(ueNum, annee);
  const session = req.query.session ? (Number(req.query.session) === 2 ? 2 : 1) : etat.session;

  // En seconde session, seuls les ajournés reviennent : les réussites de plein
  // droit se cherchent parmi eux, non parmi ceux qui ont déjà fini.
  const etudiants = session < 2
    ? db.prepare(`
      SELECT e.id, e.nom, e.prenom, e.id_ecampus, i.resultat
      FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND i.ue_num = ? ORDER BY e.nom, e.prenom
    `).all(annee, ueNum)
    : db.prepare(`
      SELECT e.id, e.nom, e.prenom, e.id_ecampus, r2.resultat
      FROM deliberation_resultat r1 JOIN etudiant e ON e.id = r1.etudiant_id
      LEFT JOIN deliberation_resultat r2
        ON r2.etudiant_id = r1.etudiant_id AND r2.annee_scolaire = r1.annee_scolaire
       AND r2.ue_num = r1.ue_num AND r2.session = 2
      WHERE r1.annee_scolaire = ? AND r1.ue_num = ? AND r1.session = 1
        AND r1.resultat = 'ajourne'
      ORDER BY e.nom, e.prenom
    `).all(annee, ueNum);

  const lignes = etudiants.map(e => {
    const d = delibererUE(e.id, ueNum, annee, session);
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
/**
 * AJOURNER — OU RELEVER — TOUS LES COURS D'UN COUP.
 *
 * Une unité ratée l'est rarement à moitié : quand le Conseil ajourne, il
 * ajourne souvent tout, et quand il refuse, tous les cours tombent. Le faire
 * tuile par tuile sur six cours, pour quarante étudiants, c'est deux cent
 * quarante clics et autant d'occasions d'en oublier un.
 *
 * Un seul appel, une seule transaction, un seul recalcul : l'étudiant revient
 * cohérent plutôt que reconstruit à mesure des allers-retours.
 */
r.put('/deliberation/ajustement/lot', authRequired,
      roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { etudiant_id, annee_scolaire, ue_num, portee = 'cours', codes, action } = req.body || {};
  const ses = Number(req.body?.session) === 2 ? 2 : 1;
  if (!etudiant_id || !annee_scolaire || !ue_num || !Array.isArray(codes) || !codes.length) {
    return res.status(400).json({ error: 'étudiant, année, unité et codes requis' });
  }
  if (!['aa', 'cours'].includes(portee)) return res.status(400).json({ error: 'portée invalide' });
  if (action != null && !['faveur', 'ajourne'].includes(action)) {
    return res.status(400).json({ error: 'action invalide' });
  }

  const oter = db.prepare(`DELETE FROM deliberation_ajustement
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND session = ?
      AND portee = ? AND code = ?`);
  const poser = db.prepare(`
    INSERT INTO deliberation_ajustement
      (etudiant_id, annee_scolaire, ue_num, session, portee, code, action, maj_par)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, session, portee, code)
    DO UPDATE SET action = excluded.action, maj_le = CURRENT_TIMESTAMP, maj_par = excluded.maj_par
  `);

  db.transaction(() => {
    for (const code of codes) {
      if (action == null) {
        oter.run(Number(etudiant_id), annee_scolaire, Number(ue_num), ses, portee, code);
      } else {
        poser.run(Number(etudiant_id), annee_scolaire, Number(ue_num), ses, portee, code, action,
          req.user?.email || null);
      }
    }
  })();

  res.json(avecAide(Number(etudiant_id), Number(ue_num), annee_scolaire, ses));
});

r.put('/deliberation/ajustement', authRequired,
      roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur'), (req, res) => {
  const { etudiant_id, annee_scolaire, ue_num, portee, code, action } = req.body || {};
  const ses = Number(req.body?.session) === 2 ? 2 : 1;
  if (!etudiant_id || !annee_scolaire || !ue_num || !portee || !code) {
    return res.status(400).json({ error: 'étudiant, année, unité, portée et code requis' });
  }
  if (!['aa', 'cours', 'ue'].includes(portee)) return res.status(400).json({ error: 'portée invalide' });
  if (action != null && !['faveur', 'ajourne'].includes(action)) {
    return res.status(400).json({ error: 'action invalide' });
  }
  if (action == null) {
    db.prepare(`DELETE FROM deliberation_ajustement
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND session = ?
        AND portee = ? AND code = ?`)
      .run(Number(etudiant_id), annee_scolaire, Number(ue_num), ses, portee, code);
  } else {
    db.prepare(`
      INSERT INTO deliberation_ajustement
        (etudiant_id, annee_scolaire, ue_num, session, portee, code, action, maj_par)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(etudiant_id, annee_scolaire, ue_num, session, portee, code)
      DO UPDATE SET action = excluded.action, maj_le = CURRENT_TIMESTAMP, maj_par = excluded.maj_par
    `).run(Number(etudiant_id), annee_scolaire, Number(ue_num), ses, portee, code, action,
           req.user?.email || null);
  }
  // On renvoie l'étudiant recalculé AVEC son aide à la décision : sans elle,
  // poser un ajustement faisait disparaître de l'écran le coût de la faveur et
  // les faveurs déjà accordées ailleurs — au moment précis où l'on décide.
  res.json(avecAide(Number(etudiant_id), Number(ue_num), annee_scolaire, ses));
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
export function avecAide(etudId, ueNum, annee, session = 1) {
  const d = delibererUE(etudId, ueNum, annee, session);

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

// ─────────────────────────────────────────────────────────────────────────────
// Lucie — RECOURS ET DISCIPLINE, sur le RDE 2026-2027
//
// Refonte demandée par Charles le 3 octobre 2026 : « recours et disciplinaire
// n'ont plus du tout été vus depuis des mois. Pas de liens avec les étudiants,
// ni les membres des UE… c'était du bricolage. Revoir sur base du RDE, avec la
// section, le cours, le nom de l'étudiant, les liens avec les membres du jury. »
//
// DEUX CIRCUITS, ET PAS UN DE PLUS (choix de Charles le même jour) :
//   - le RECOURS académique (art. 87-91) contre un REFUS du CDE ;
//   - la procédure DISCIPLINAIRE (art. 115-119), dont la FRAUDE (art. 72-75)
//     est une nature : même frise, avec en plus les acquis visés et la
//     sanction académique (ajournement en 1re session, refus en 2e ou en cas
//     de récidive — art. 75 §1).
//
// Comme la valorisation (lib/valorisation.js) :
//   - L'ÉTAT SE DÉDUIT DES TRACES, il ne se déclare pas ;
//   - chaque étape porte le nom de celui qui l'a posée et la date (celui qui
//     clique est celui qui signe) ;
//   - le journal est en ajout seul : corriger une étape, c'est en poser une
//     nouvelle, la précédente reste lisible.
//
// LES DÉLAIS SONT CEUX DU RDE, CALCULÉS AVEC LE CALENDRIER DE L'ÉCHÉANCIER
// (services/echeancier_dates.js) : jours calendrier, jours calendrier hors
// congés scolaires, jours ouvrables (le samedi l'est, le dimanche et les
// fériés non). Trois définitions différentes coexistaient dans l'ancien code.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';
import {
  ajouterJours, ajouterJoursOuvrables, ajouterJoursHorsConges, chargerPeriodesConges,
} from '../services/echeancier_dates.js';

export const TYPES = ['recours', 'disciplinaire'];
export const NATURES = ['fraude', 'comportement'];

/** Art. 72 — ce qui constitue une fraude. */
export const TYPES_FRAUDE = [
  ['documents', 'Documents non autorisés (notes, syllabus…)'],
  ['objets', 'Objets non autorisés (GSM, montre, lunettes connectées…)'],
  ['plagiat', 'Plagiat ou non-citation des sources'],
  ['ia', "Utilisation d'une IA non autorisée"],
  ['alteration', "Altération volontaire de résultats d'investigation"],
  ['merites', 'Amélioration excessive ou inappropriée de mérites scientifiques'],
];

/** Art. 115 — le catalogue des sanctions (liste non exhaustive). */
export const SANCTIONS = [
  ['rappel', "Rappel à l'ordre verbal ou écrit", '115, 1°'],
  ['renvoi_provisoire', 'Renvoi provisoire des activités (5 jours ouvrables au plus)', '115, 2°'],
  ['eloignement', "Éloignement provisoire à titre de mesure d'ordre", '115, 3°'],
  ['renvoi_definitif', "Renvoi définitif de l'établissement", '115, 4°'],
  ['annulation_points', "Annulation des points de l'évaluation pour fraude (seconde session possible)", '115, 5°'],
  ['refus_ue', "Refus aux autres évaluations de l'UE en cas de fraude", '115, 6°'],
];

/** Ce qu'un recours peut viser : un REFUS (art. 87 §1). */
export const est_recourable = resultat => resultat === 'refuse';

/**
 * LES ÉTAPES, DANS L'ORDRE DU CIRCUIT. `decision` : réservée au geste
 * « procedures.decider ». `si` : l'étape n'existe que dans ce cas.
 */
export const ETAPES = {
  recours: [
    { cle: 'plainte',      label: 'Plainte reçue',        art: '88 §1-2' },
    { cle: 'recevabilite', label: 'Recevabilité',          art: '88 §3-4', decision: true },
    { cle: 'cde',          label: 'CDE restreint',         art: '89 §1',   si: d => recevable(d) },
    { cle: 'decision',     label: 'Décision motivée',      art: '89 §2',   decision: true, si: d => recevable(d) },
    { cle: 'envoi',        label: 'Envoi recommandé',      art: '89 §3' },
    { cle: 'externe',      label: 'Recours externe',       art: '90-91',   facultatif: true },
  ],
  disciplinaire: [
    { cle: 'faits',        label: 'Faits établis',         art: '115 bis' },
    { cle: 'convocation',  label: 'Convocation',           art: '115 quater' },
    { cle: 'audition',     label: 'Audition et PV',        art: '115 quinquies' },
    { cle: 'avis',         label: 'Avis du CDE',           art: '75 · 115 sexies', si: d => d.nature === 'fraude' || renvoiDefinitif(d) },
    { cle: 'decision',     label: 'Décision motivée',      art: '75 §2 · 118', decision: true },
    { cle: 'notification', label: 'Notification',          art: '119' },
    { cle: 'recours_po',   label: 'Recours au PO',         art: '119 bis', facultatif: true, si: d => renvoiDefinitif(d) },
  ],
};

function recevable(d) {
  const r = d.etapes?.recevabilite;
  return !r || r.recevable !== false;
}
function renvoiDefinitif(d) {
  return d.etapes?.convocation?.sanction_envisagee === 'renvoi_definitif'
    || d.etapes?.decision?.sanction === 'renvoi_definitif';
}

// ── Migration ────────────────────────────────────────────────────────────────
let pretes = false;
export function migrerProcedures(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS proc_dossier (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      type             TEXT NOT NULL CHECK (type IN ('recours','disciplinaire')),
      nature           TEXT,                    -- disciplinaire : fraude | comportement
      etudiant_id      INTEGER NOT NULL REFERENCES etudiant(id),
      annee_scolaire   TEXT NOT NULL,
      section          TEXT,                    -- celle de l'UE ; de l'étudiant hors cursus
      ue_num           INTEGER,
      session          INTEGER,
      num_organisation INTEGER,
      objet            TEXT,
      issue            TEXT,                    -- se déduit, gardée pour le registre
      dossier_lie_id   INTEGER REFERENCES proc_dossier(id),
      cree_le          TEXT DEFAULT (datetime('now')),
      cree_par_id      INTEGER,
      cree_par_nom     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_proc_dossier_etud ON proc_dossier(etudiant_id, annee_scolaire);
    -- Les acquis VISÉS : par l'épreuve fraudée (art. 75 §1), ou par le recours.
    CREATE TABLE IF NOT EXISTS proc_acquis (
      dossier_id INTEGER NOT NULL REFERENCES proc_dossier(id) ON DELETE CASCADE,
      cours_code TEXT,
      aa_code    TEXT NOT NULL,
      PRIMARY KEY (dossier_id, aa_code)
    );
    -- Les personnes : président et membres du CDE restreint, membre du
    -- personnel qui assiste la Direction, personne qui assiste l'étudiant,
    -- rapporteur des faits. Choisies dans le personnel, jamais tapées.
    CREATE TABLE IF NOT EXISTS proc_membre (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      dossier_id INTEGER NOT NULL REFERENCES proc_dossier(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,                 -- president | membre | redacteur | rapporteur
      cle        TEXT,                          -- p:<professeur> | u:<utilisateur>
      nom        TEXT NOT NULL,
      present    INTEGER NOT NULL DEFAULT 1
    );
    -- LE JOURNAL, EN AJOUT SEUL. La dernière ligne d'une étape fait foi ;
    -- les précédentes restent, et disent qui a corrigé quoi.
    CREATE TABLE IF NOT EXISTS proc_etape (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      dossier_id INTEGER NOT NULL REFERENCES proc_dossier(id) ON DELETE CASCADE,
      etape      TEXT NOT NULL,
      donnees    TEXT,                          -- JSON ; null = étape retirée
      le         TEXT DEFAULT (datetime('now')),
      par_id     INTEGER,
      par_nom    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_proc_etape ON proc_etape(dossier_id, etape, id);
    CREATE TABLE IF NOT EXISTS proc_piece (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      dossier_id INTEGER NOT NULL REFERENCES proc_dossier(id) ON DELETE CASCADE,
      categorie  TEXT,
      nom        TEXT NOT NULL,
      chemin     TEXT NOT NULL,
      taille     INTEGER,
      le         TEXT DEFAULT (datetime('now')),
      par_nom    TEXT
    );
  `);
  pretes = true;
}
const pret = () => { if (!pretes) migrerProcedures(); };

// ── Lecture ─────────────────────────────────────────────────────────────────
/** Le dossier complet : ses étapes (dernière valeur), membres, acquis, pièces. */
export function lireDossier(id) {
  pret();
  const d = db.prepare('SELECT * FROM proc_dossier WHERE id = ?').get(Number(id));
  if (!d) return null;
  const e = db.prepare(`SELECT nom, prenom, id_ecampus, titre, adresse, cp, localite, email_ecole,
    section_rattachement FROM etudiant WHERE id = ?`).get(d.etudiant_id) || {};
  d.etudiant = { id: d.etudiant_id, ...e };
  const lignes = db.prepare('SELECT * FROM proc_etape WHERE dossier_id = ? ORDER BY id').all(d.id);
  d.etapes = {}; d.traces = {};
  for (const l of lignes) {
    d.etapes[l.etape] = l.donnees ? JSON.parse(l.donnees) : undefined;
    d.traces[l.etape] = l.donnees ? { le: l.le, par: l.par_nom } : undefined;
  }
  d.journal = lignes.map(l => ({ etape: l.etape, le: l.le, par: l.par_nom, retiree: !l.donnees }));
  d.membres = db.prepare('SELECT * FROM proc_membre WHERE dossier_id = ? ORDER BY id').all(d.id);
  d.acquis = db.prepare('SELECT cours_code, aa_code FROM proc_acquis WHERE dossier_id = ?').all(d.id);
  d.pieces = db.prepare('SELECT id, categorie, nom, taille, le, par_nom FROM proc_piece WHERE dossier_id = ? ORDER BY id').all(d.id);
  if (d.ue_num) {
    d.ue_nom = db.prepare(`SELECT ue_nom FROM ue WHERE ue_num = ?
      ORDER BY (annee_scolaire = ?) DESC LIMIT 1`).get(d.ue_num, d.annee_scolaire)?.ue_nom || null;
    d.publie_le = publicationDe(d);
  }
  d.recidive = d.type === 'disciplinaire' && d.nature === 'fraude' ? recidiveDe(d) : [];
  d.circuit = circuit(d);
  d.echeances = echeances(d);
  return d;
}

/** La date de publication des résultats de la séance concernée. */
export function publicationDe(d) {
  try {
    return db.prepare(`SELECT publie_le FROM deliberation_seance
      WHERE ue_num = ? AND annee_scolaire = ? AND session = ?
      ORDER BY (num_organisation = ?) DESC, publie_le DESC LIMIT 1`)
      .get(d.ue_num, d.annee_scolaire, d.session || 1, d.num_organisation || 0)?.publie_le || null;
  } catch { return null; }
}

/** LA RÉCIDIVE SE LIT, ELLE NE SE DÉCLARE PAS (art. 75 §1) : les dossiers de
 *  fraude antérieurs du même étudiant, décidés. */
export function recidiveDe(d) {
  return db.prepare(`SELECT pd.id, pd.annee_scolaire, pd.ue_num FROM proc_dossier pd
    WHERE pd.etudiant_id = ? AND pd.nature = 'fraude' AND pd.id <> ? AND pd.id < ?
      AND EXISTS (SELECT 1 FROM proc_etape e WHERE e.dossier_id = pd.id AND e.etape = 'decision' AND e.donnees IS NOT NULL)`)
    .all(d.etudiant_id, d.id, d.id);
}

/** L'avancement : chaque étape applicable, faite ou non, et l'étape courante. */
export function circuit(d) {
  const etapes = (ETAPES[d.type] || []).filter(e => !e.si || e.si(d));
  const liste = etapes.map(e => ({ ...e, si: undefined, faite: !!d.etapes?.[e.cle], trace: d.traces?.[e.cle] || null }));
  const courante = liste.find(e => !e.faite && !e.facultatif)?.cle || null;
  return { etapes: liste, courante, clos: !courante };
}

// ── Les délais du RDE ────────────────────────────────────────────────────────
function enConge(annee) {
  try { return chargerPeriodesConges(db, annee); } catch { return () => false; }
}
/** Les échéances calculées, chacune avec son article. null = pas encore calculable. */
export function echeances(d) {
  const E = [];
  const conges = enConge(d.annee_scolaire);
  const et = d.etapes || {};
  if (d.type === 'recours') {
    const pub = d.publie_le;
    if (pub) {
      E.push({ cle: 'plainte', label: 'Plainte reçue au plus tard', date: ajouterJours(pub, 4), art: '88 §1',
        tenue: et.plainte?.recue_le || null });
      E.push({ cle: 'decision', label: 'Décision motivée envoyée au plus tard', date: ajouterJoursHorsConges(pub, 7, conges),
        art: '89 §3 (7 jours calendrier hors congés)', tenue: et.envoi?.envoye_le || null });
    }
    if (et.envoi?.envoye_le) {
      const depart = ajouterJoursOuvrables(et.envoi.envoye_le, 3);
      E.push({ cle: 'externe', label: 'Recours externe possible jusqu’au', date: ajouterJours(depart, 7), art: '90 §2',
        tenue: et.externe?.introduit_le || null, information: true });
    }
    if (et.externe?.introduit_le) {
      E.push({ cle: 'commission', label: 'Décision de la Commission au plus tard', date: ajouterJoursHorsConges(et.externe.introduit_le, 30, conges),
        art: '91', tenue: et.externe?.decision_le || null, information: true });
    }
  } else {
    const c = et.convocation;
    if (c?.envoyee_le && c?.sanction_envisagee === 'renvoi_definitif') {
      E.push({ cle: 'audition', label: 'Audition au plus tôt', date: ajouterJoursOuvrables(c.envoyee_le, 8),
        art: '115 quater (8 jours ouvrables)', tenue: c.audition_le || null, plancher: true });
    }
    if (et.avis?.demande_le) {
      E.push({ cle: 'avis', label: 'Avis du CDE attendu au plus tard', date: ajouterJours(et.avis.demande_le, 8),
        art: '115 sexies', tenue: et.avis?.rendu_le || null });
    }
    if (et.notification?.envoyee_le && renvoiDefinitif(d)) {
      E.push({ cle: 'recours_po', label: 'Recours au PO possible jusqu’au', date: ajouterJoursOuvrables(et.notification.envoyee_le, 4),
        art: '119 bis', tenue: et.recours_po?.introduit_le || null, information: true });
      if (et.recours_po?.introduit_le) {
        E.push({ cle: 'po', label: 'Décision du PO au plus tard', date: ajouterJoursHorsConges(et.recours_po.introduit_le, 21, conges),
          art: '119 bis', tenue: et.recours_po?.decision_le || null, information: true });
      }
    }
    const ec = et.ecartement;
    if (ec?.du) {
      E.push({ cle: 'ecartement', label: 'Écartement provisoire au plus tard jusqu’au', date: ajouterJoursOuvrables(ec.du, 15),
        art: '115 septies', tenue: ec.au || null, information: true });
    }
  }
  // Respectée, dépassée, ou encore ouverte.
  for (const x of E) {
    x.etat = x.tenue ? (x.plancher ? (x.tenue >= x.date ? 'tenue' : 'trop_tot') : (x.tenue <= x.date ? 'tenue' : 'hors_delai'))
      : 'ouverte';
  }
  return E;
}

// ── Contrôles d'une étape ────────────────────────────────────────────────────
/** Ce qui manque pour poser une étape. Rend [] si elle peut s'écrire. */
export function verifierEtape(d, etape, v = {}) {
  const def = (ETAPES[d.type] || []).find(e => e.cle === etape) || (etape === 'ecartement' && d.type === 'disciplinaire' ? { cle: 'ecartement' } : null);
  if (!def) return ['Étape inconnue pour ce dossier.'];
  const m = [];
  const req = (k, lib) => { if (v[k] == null || v[k] === '') m.push(lib); };
  // L'ORDRE DU CIRCUIT : on ne décide pas d'une plainte non reçue.
  const ordre = (ETAPES[d.type] || []).map(e => e.cle);
  const i = ordre.indexOf(etape);
  for (const prec of ordre.slice(0, Math.max(0, i))) {
    const p = (ETAPES[d.type] || []).find(e => e.cle === prec);
    if (p.facultatif || (p.si && !p.si(d))) continue;
    if (!d.etapes?.[prec]) { m.push(`l'étape « ${p.label} » d'abord`); break; }
  }
  if (d.type === 'recours') {
    if (etape === 'plainte') { req('recue_le', 'la date de réception'); req('mode', 'le mode de remise'); req('griefs', 'les irrégularités invoquées'); }
    if (etape === 'recevabilite') {
      if (typeof v.recevable !== 'boolean') m.push('recevable ou non');
      if (v.recevable === false && !String(v.motif || '').trim()) m.push("le motif précis de l'irrecevabilité (art. 88 §4)");
    }
    if (etape === 'cde') {
      req('date', 'la date de réunion');
      const pres = (d.membres || []).filter(x => x.present && (x.role === 'president' || x.role === 'membre'));
      if (!pres.some(x => x.role === 'president')) m.push('un président présent');
      if (pres.filter(x => x.role === 'membre').length < 2) m.push('au moins deux membres présents (art. 89 §1)');
    }
    if (etape === 'decision') {
      if (!['accueilli', 'rejete'].includes(v.issue)) m.push('accueilli ou rejeté');
      if (!String(v.motivation || '').trim()) m.push('la motivation, grief par grief (art. 89 §2)');
    }
    if (etape === 'envoi') req('envoye_le', "la date d'envoi recommandé");
    if (etape === 'externe') req('introduit_le', "la date d'introduction");
  } else {
    if (etape === 'faits') {
      req('date', 'la date des faits'); req('description', 'la description des faits');
      if (d.nature === 'fraude') {
        if (!['epreuve', 'correction'].includes(v.moment)) m.push('pendant l’épreuve ou à la correction');
        if (!TYPES_FRAUDE.some(t => t[0] === v.type_fraude)) m.push('le type de fraude (art. 72)');
        if (!(d.acquis || []).length) m.push("les acquis visés par l'épreuve (art. 75 §1)");
      }
      if (!(d.membres || []).some(x => x.role === 'rapporteur')) m.push('la personne qui a constaté les faits');
    }
    if (etape === 'convocation') {
      req('envoyee_le', "la date d'envoi"); req('mode', 'le mode de remise'); req('audition_le', "la date de l'audition");
      req('lieu', "le lieu de l'audition");
      if (!SANCTIONS.some(s => s[0] === v.sanction_envisagee)) m.push('la sanction envisagée (art. 115 quater)');
      if (v.sanction_envisagee === 'renvoi_definitif' && v.envoyee_le && v.audition_le
          && v.audition_le < ajouterJoursOuvrables(v.envoyee_le, 8)) {
        m.push(`une audition au plus tôt le ${ajouterJoursOuvrables(v.envoyee_le, 8)} : huit jours ouvrables pour un renvoi définitif`);
      }
    }
    if (etape === 'audition') {
      req('tenue_le', "la date de l'audition");
      if (typeof v.etudiant_present !== 'boolean') m.push("présent ou non");
      if (!['signe', 'refus_constate', 'absent'].includes(v.pv)) m.push('le PV signé, ou le refus constaté par deux membres du personnel');
      if (!(d.membres || []).some(x => x.role === 'redacteur')) m.push('le membre du personnel qui rédige le PV (art. 115 quinquies)');
    }
    if (etape === 'avis') { req('rendu_le', "la date de l'avis"); req('avis', "l'avis du CDE"); }
    if (etape === 'decision') {
      if (!SANCTIONS.some(s => s[0] === v.sanction)) m.push('la sanction (art. 115)');
      if (!String(v.motivation || '').trim()) m.push('la motivation : faits, dispositions, gravité (art. 119)');
      if (d.nature === 'fraude' && !['ajourne', 'refuse'].includes(v.academique)) {
        m.push('la sanction académique : ajourné sur les acquis visés, ou refusé (art. 75 §1)');
      }
    }
    if (etape === 'notification') { req('envoyee_le', "la date d'envoi"); req('mode', 'le mode de remise'); }
    if (etape === 'recours_po') req('introduit_le', "la date d'introduction");
    if (etape === 'ecartement') { req('du', 'le premier jour'); req('au', 'le dernier jour'); }
  }
  return m;
}

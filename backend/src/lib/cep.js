// ─────────────────────────────────────────────────────────────────────────────
// LE CONGÉ-ÉDUCATION PAYÉ (Charles, 29 septembre 2026).
//
// Deux pièces, que l'étudiant remet à son employeur et sur lesquelles celui-ci
// se fait rembourser :
//
//   · l'ATTESTATION D'INSCRIPTION RÉGULIÈRE — au plus tard le 31 octobre, ou
//     dans les 15 jours d'une inscription tardive ;
//   · l'ATTESTATION D'ASSIDUITÉ — par UE et par PÉRIODE DE TROIS MOIS à compter
//     du début de l'UE (enseignement modulaire : c'est la règle de Bruxelles
//     Économie et Emploi, pas le trimestre du calendrier).
//
// Cadre : loi de redressement du 22 janvier 1985 ; arrêté du Gouvernement de la
// Région de Bruxelles-Capitale du 29 juin 2023. Plus de 10 % d'absences
// INJUSTIFIÉES sur une attestation suspend le droit six mois.
//
// LA RÉGION QUI COMPTE EST CELLE DU LIEU DE TRAVAIL, PAS CELLE DE L'ÉCOLE. La
// Flandre (Vlaams opleidingsverlof) ne connaît pas l'attestation trimestrielle :
// l'école y encode les présences sur la plateforme de l'autorité flamande. Ces
// pièces ne servent donc qu'à Bruxelles et en Wallonie, et le serveur le dit.
//
// TOUT SE LIT DE L'HORAIRE (le module Horaires, en heures) et des PRÉSENCES
// encodées séance par séance dans Mes cours. Rien ne se saisit en total : un
// total tapé à la main ne se vérifie pas, une séance se vérifie.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';
import { joursFeries } from '../routes/horaire.js';

export const REGIONS = { bruxelles: 'Bruxelles-Capitale', wallonie: 'Wallonie', flandre: 'Flandre' };

/* LES STATUTS D'UNE PRÉSENCE. « Non concerné » sert aux sous-groupes : un
   étudiant du groupe 2 n'est pas absent du labo du groupe 1. */
export const STATUTS_PRESENCE = {
  present: 'Présent',
  absent: 'Absent',
  justifie: 'Absence justifiée',
  non_concerne: 'Non concerné',
};

/* LES SEULS MOTIFS QUI JUSTIFIENT UNE ABSENCE au sens du congé-éducation
   (Bruxelles Économie et Emploi). Une liste fermée : un motif libre finirait
   par justifier ce que la réglementation ne justifie pas, et c'est l'employeur
   qui en paierait le prix au contrôle. */
export const MOTIFS_JUSTIFIES = {
  medical: 'Certificat médical (le travailleur ou un membre de sa famille)',
  greve: 'Grève des transports publics ou des enseignants',
  fermeture: "Fermeture de l'établissement",
  intemperies: 'Intempéries hivernales graves',
  professionnel: "Motif professionnel attesté par l'employeur",
  petit_chomage: 'Petit chômage (circonstance familiale)',
};

/* CE QUI N'EST PAS UNE HEURE DE COURS au sens du CEP — le formulaire le dit :
   « déduction des heures : activité de développement professionnel, stage,
   épreuve intégrée ». Reconnu à l'intitulé du cours ou de la séance. */
const HORS_CEP = /\bstages?\b|épreuve intégrée|epreuve integree|développement professionnel|developpement professionnel/i;

export function migrerCep(base = db) {
  base.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_cep (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      region TEXT NOT NULL DEFAULT 'bruxelles' CHECK (region IN ('bruxelles','wallonie','flandre')),
      employeur TEXT,
      pose_par TEXT, pose_le TEXT DEFAULT (datetime('now')),
      modifie_par TEXT, modifie_le TEXT,
      UNIQUE (etudiant_id, annee_scolaire));
    CREATE TABLE IF NOT EXISTS presence (
      seance_id INTEGER NOT NULL REFERENCES horaire_seance(id) ON DELETE CASCADE,
      etudiant_id INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
      statut TEXT NOT NULL CHECK (statut IN ('present','absent','justifie','non_concerne')),
      motif TEXT,
      encode_par TEXT, encode_le TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (seance_id, etudiant_id));
    CREATE INDEX IF NOT EXISTS idx_presence_etudiant ON presence(etudiant_id);
    /* EN AJOUT SEUL : une présence corrigée après qu'une attestation est partie
       doit se voir. Aucune route ne modifie ni n'efface ce journal. */
    CREATE TABLE IF NOT EXISTS presence_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seance_id INTEGER, etudiant_id INTEGER,
      avant TEXT, apres TEXT, motif TEXT,
      par TEXT, le TEXT DEFAULT (datetime('now')));
  `);
}

const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
export const minutesDe = s => (Number(s.minutes) > 0 ? Number(s.minutes)
  : Math.max(0, hm(s.heure_fin) - hm(s.heure_debut)));
const iso = d => d.toISOString().slice(0, 10);
function plusMois(dateIso, n) {
  const d = new Date(dateIso + 'T12:00:00Z');
  const jour = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  return iso(d);
}
const veille = dateIso => { const d = new Date(dateIso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return iso(d); };

/** Le statut CEP d'un étudiant pour l'année, ou null. */
export function cepDe(etudId, annee) {
  try {
    return db.prepare('SELECT * FROM etudiant_cep WHERE etudiant_id = ? AND annee_scolaire = ?')
      .get(Number(etudId), annee) || null;
  } catch { return null; }
}

/** Les cours d'une unité pour l'année (code → { nom, stage }). */
function coursDeUE(ueNum, annee) {
  const m = new Map();
  for (const c of db.prepare(`SELECT cours_code, cours_nom, COALESCE(is_stage, 0) AS is_stage FROM cours
      WHERE ue_num = ? AND cours_code IS NOT NULL ORDER BY (annee_scolaire = ?) DESC`).all(ueNum, annee)) {
    if (!m.has(c.cours_code)) m.set(c.cours_code, { nom: c.cours_nom || '', stage: !!c.is_stage });
  }
  return m;
}

/* L'ÉPREUVE INTÉGRÉE sort du CEP : la ligne annuelle l'emporte quand elle
   existe, la case du référentiel à défaut — deux sources, lues ensemble. */
function estEpreuveIntegree(ueNum, annee, caseRef) {
  try {
    const r = db.prepare('SELECT actif FROM ue_epreuve_integree WHERE ue_num = ? AND annee_scolaire = ?').get(ueNum, annee);
    if (r) return Number(r.actif) === 1;
  } catch { /* table absente */ }
  return Number(caseRef) === 1;
}

/* LES HEURES DISPENSÉES : une valorisation accordée — l'unité entière si elle
   est complète, ses cours si elle est partielle par cours (une dispense par
   acquis ne se traduit pas en heures : le cours reste suivi) — et les cours
   reportés d'office d'une année précédente. */
function dispenses(etudId, ueNum, annee) {
  const cours = new Set();
  let complete = false;
  try {
    for (const v of db.prepare(`SELECT type, cible, cible_detail FROM etudiant_valorisation
        WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
          AND COALESCE(decision, 'accordee') = 'accordee' AND decision_le IS NOT NULL`).all(etudId, annee, ueNum)) {
      if (v.type === 'complete') complete = true;
      else if (v.cible === 'cours') String(v.cible_detail || '').split(/[,;\s]+/).filter(Boolean).forEach(c => cours.add(c));
    }
  } catch { /* table absente */ }
  try {
    for (const r of db.prepare(`SELECT cours_code FROM etudiant_report_note
        WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND statut = 'accorde' AND cours_code IS NOT NULL`)
      .all(etudId, annee, ueNum)) cours.add(r.cours_code);
  } catch { /* table absente */ }
  return { complete, cours };
}

/**
 * Les séances d'une unité QUI CONCERNENT l'étudiant, avec leur sort.
 *
 * Deux sous-groupes d'un même cours au même moment sont UNE heure pour
 * l'étudiant : on garde celle où il a une présence encodée, sinon la première.
 * Une séance « non concerné » sort du compte.
 */
export function seancesEtudiant(etudId, ueNum, annee) {
  const cours = coursDeUE(ueNum, annee);
  const codes = [...cours.keys()];
  const ph = codes.map(() => '?').join(',');
  const brutes = db.prepare(`SELECT s.id, s.date, s.heure_debut, s.heure_fin, s.minutes, s.cours_code,
        s.matiere, s.sous_groupe, COALESCE(s.annule, 0) AS annule,
        p.statut, p.motif
      FROM horaire_seance s
      LEFT JOIN presence p ON p.seance_id = s.id AND p.etudiant_id = ?
      WHERE s.annee_scolaire = ? AND (s.ue_num = ?${codes.length ? ` OR s.cours_code IN (${ph})` : ''})
      ORDER BY s.date, s.heure_debut`).all(etudId, annee, ueNum, ...codes);
  /* UN SEUL SOUS-GROUPE PAR COURS (2 octobre 2026). Les TP se donnent en
     sous-groupes 1, 2, 3 à des moments différents : sans répartition encodée,
     l'étudiant se voyait compter les trois — trois fois ses heures. On garde,
     par cours, le sous-groupe où il a une présence ; à défaut, le premier :
     le volume horaire est alors juste, même si le groupe exact ne l'est pas. */
  const sgDe = new Map();          // cours → { tous: Set, presence: Set }
  for (const s of brutes) {
    if (s.sous_groupe == null || s.sous_groupe === '') continue;
    const k = s.cours_code || s.matiere;
    if (!sgDe.has(k)) sgDe.set(k, { tous: new Set(), presence: new Set() });
    sgDe.get(k).tous.add(String(s.sous_groupe));
    if (s.statut && s.statut !== 'non_concerne') sgDe.get(k).presence.add(String(s.sous_groupe));
  }
  const tri = l => [...l].sort((x, y) => x.localeCompare(y, 'fr', { numeric: true }));
  for (const [k, v] of sgDe) sgDe.set(k, { sg: tri(v.presence.size ? v.presence : v.tous)[0] });
  const garde = s => s.sous_groupe == null || s.sous_groupe === ''
    || sgDe.get(s.cours_code || s.matiere)?.sg === String(s.sous_groupe);
  const parCle = new Map();
  for (const s of brutes.filter(garde)) {
    const cle = `${s.cours_code || s.matiere}|${s.date}|${s.heure_debut}`;
    const deja = parCle.get(cle);
    if (!deja || (!deja.statut && s.statut)) parCle.set(cle, s);
  }
  const disp = dispenses(etudId, ueNum, annee);
  const ins = db.prepare(`SELECT MIN(date_inscription) AS d FROM etudiant_inscription
      WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`).get(etudId, annee, ueNum)?.d || null;
  const out = [];
  for (const s of parCle.values()) {
    const c = cours.get(s.cours_code);
    const intitule = c?.nom || s.matiere || '';
    if (c?.stage || HORS_CEP.test(intitule) || HORS_CEP.test(s.matiere || '')) continue;
    if (s.statut === 'non_concerne') continue;
    out.push({
      ...s, intitule, min: minutesDe(s),
      dispense: disp.complete || disp.cours.has(s.cours_code),
      tardive: !!(ins && s.date < String(ins).slice(0, 10)),
    });
  }
  return { seances: out.sort((a, b) => (a.date + a.heure_debut).localeCompare(b.date + b.heure_debut)),
           inscription: ins ? String(ins).slice(0, 10) : null, dispense_complete: disp.complete };
}

/** Additionne un lot de séances selon les lignes du formulaire (en minutes). */
function bilan(liste, aujourdhui) {
  const b = { theorique: 0, donnees: 0, presence: 0, justifiees: 0, injustifiees: 0,
              dispense: 0, tardive: 0, non_encodees: [] };
  for (const s of liste) {
    b.theorique += s.min;
    // « EFFECTIVEMENT DONNÉES » : ce que l'école a tenu, jusqu'à aujourd'hui —
    // qu'un étudiant en soit dispensé ne retire rien à la séance.
    if (!s.annule && s.date <= aujourdhui) b.donnees += s.min;
    if (s.dispense) { b.dispense += s.min; continue; }
    if (s.tardive) { b.tardive += s.min; continue; }
    if (s.annule || s.date > aujourdhui) continue;
    if (s.statut === 'present') b.presence += s.min;
    else if (s.statut === 'justifie') b.justifiees += s.min;
    else if (s.statut === 'absent') b.injustifiees += s.min;
    else b.non_encodees.push(s);
  }
  // LE SEUIL DE 10 % se lit sur les heures que l'étudiant devait suivre.
  const base = b.presence + b.justifiees + b.injustifiees;
  b.taux_injustifie = base ? b.injustifiees / base : 0;
  return b;
}

/** Les périodes de trois mois d'une unité, à compter de sa première séance. */
export function periodesDe(seances) {
  if (!seances.length) return [];
  const debut = seances[0].date, fin = seances[seances.length - 1].date;
  const out = [];
  for (let d = debut, n = 1; d <= fin && n <= 12; n++) {
    const suivante = plusMois(debut, 3 * n);
    out.push({ num: n, du: d, au: veille(suivante) });
    d = suivante;
  }
  return out;
}

/** L'horaire récapitulatif : pour chaque jour, la première heure et la dernière. */
function horaireParJour(seances) {
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const m = {};
  for (const s of seances) {
    const j = JOURS[new Date(s.date + 'T12:00:00Z').getUTCDay()];
    const x = (m[j] ||= { de: s.heure_debut, a: s.heure_fin });
    if (s.heure_debut < x.de) x.de = s.heure_debut;
    if (s.heure_fin > x.a) x.a = s.heure_fin;
  }
  return m;
}

/* L'HORAIRE DÉTAILLÉ EN ANNEXE, lu comme le fait eCampus : une ligne par
   créneau (jour, début, fin) et par suite de semaines consécutives — dix
   jeudis de 8 h à 12 h 15 font une ligne, pas dix. */
function horaireDetaille(seances) {
  const parCreneau = new Map();
  for (const s of seances) {
    if (s.annule) continue;
    const j = new Date(s.date + 'T12:00:00Z').getUTCDay();
    const cle = `${j}|${s.heure_debut}|${s.heure_fin}`;
    (parCreneau.get(cle) || parCreneau.set(cle, []).get(cle)).push(s.date);
  }
  const lignes = [];
  for (const [cle, dates] of parCreneau) {
    const [j, de, a] = cle.split('|');
    const tri = [...new Set(dates)].sort();
    let du = tri[0], prec = tri[0];
    const pousser = () => lignes.push({ du, au: prec, jour: Number(j), de, a });
    for (const d of tri.slice(1)) {
      const ecart = (new Date(d) - new Date(prec)) / 86400000;
      if (ecart > 7) { pousser(); du = d; }
      prec = d;
    }
    pousser();
  }
  return lignes.sort((x, y) => (x.du + x.jour + x.de).localeCompare(y.du + y.jour + y.de));
}

/* LES CONGÉS DE L'ANNÉE, lus du calendrier (Planification) et des jours fériés
   calculés : les vacances par suite de semaines, les fériés un par un. */
export function congesDe(annee) {
  const vacances = [];
  try {
    let cour = null;
    for (const w of db.prepare(`SELECT date_debut, date_fin, label FROM annee_calendrier
        WHERE annee_scolaire = ? AND type = 'vacances' ORDER BY date_debut`).all(annee)) {
      // Deux semaines qui se suivent (le lundi après le vendredi) et portent le
      // même nom sont UN congé : Noël sur deux semaines s'écrit une fois.
      const ecart = cour ? (new Date(w.date_debut) - new Date(cour.au)) / 86400000 : 99;
      if (cour && ecart <= 3 && (cour.label === (w.label || 'Vacances'))) cour.au = w.date_fin;
      else { cour = { du: w.date_debut, au: w.date_fin, label: w.label || 'Vacances' }; vacances.push(cour); }
    }
  } catch { /* calendrier absent */ }
  const [a1, a2] = String(annee).split('-').map(Number);
  const debut = `${a1}-09-01`, fin = `${a2}-08-31`;
  const feries = [];
  for (const an of [a1, a2]) {
    for (const [d, l] of joursFeries(an)) if (d >= debut && d <= fin) feries.push({ date: d, label: l });
  }
  feries.sort((x, y) => x.date.localeCompare(y.date));
  return { vacances, feries };
}

/**
 * Tout ce qu'une attestation CEP porte pour UNE unité.
 * `jusquau` borne l'assiduité : les séances futures ne se comptent pas.
 */
export function dossierCepUE(etudId, ueNum, annee, jusquau = new Date().toISOString().slice(0, 10)) {
  const { seances, inscription, dispense_complete } = seancesEtudiant(etudId, ueNum, annee);
  const periodes = periodesDe(seances).map(p => ({
    ...p,
    commencee: p.du <= jusquau,
    terminee: p.au < jusquau,
    ...bilan(seances.filter(s => s.date >= p.du && s.date <= p.au), jusquau),
  }));
  const total = bilan(seances, '9999-12-31');
  return {
    ue_num: ueNum, inscription, dispense_complete,
    debut: seances[0]?.date || null, fin: seances[seances.length - 1]?.date || null,
    // (a) (b) (c) (d) du formulaire, en minutes
    a: total.theorique, b: total.dispense, c: total.theorique - total.dispense, d: total.tardive,
    horaire: horaireParJour(seances.filter(s => !s.annule)),
    detail: horaireDetaille(seances),
    periodes, nb_seances: seances.length,
  };
}

/** Les unités de l'année d'un étudiant (programme inscrit). */
export function unitesInscrites(etudId, annee) {
  return db.prepare(`SELECT DISTINCT i.ue_num,
      (SELECT u.ue_nom FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_nom IS NOT NULL
        ORDER BY (u.annee_scolaire = ?) DESC, u.annee_scolaire DESC LIMIT 1) AS ue_nom,
      (SELECT u.ue_niveau FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_niveau IS NOT NULL
        ORDER BY (u.annee_scolaire = ?) DESC, u.annee_scolaire DESC LIMIT 1) AS ue_niveau,
      (SELECT u.ue_code_fwb FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_code_fwb IS NOT NULL
        ORDER BY (u.annee_scolaire = ?) DESC, u.annee_scolaire DESC LIMIT 1) AS code_fwb,
      (SELECT MAX(COALESCE(u.is_epreuve_integree, 0)) FROM ue u WHERE u.ue_num = i.ue_num AND u.annee_scolaire = ?) AS ei_case
    FROM etudiant_inscription i
    WHERE i.etudiant_id = ? AND i.annee_scolaire = ?
    ORDER BY i.ue_num`).all(annee, annee, annee, annee, Number(etudId), annee)
    .map(u => ({ ...u, epreuve_integree: estEpreuveIntegree(u.ue_num, annee, u.ei_case) }));
}

export const heures = min => {
  const h = Math.round((min / 60) * 100) / 100;
  return String(h).replace('.', ',');
};

/**
 * ÉCRIRE DES PRÉSENCES — la seule porte, pour Mes cours comme pour le
 * secrétariat. Chaque changement laisse sa ligne au journal ; une absence
 * justifiée exige un motif de la liste fermée.
 * `lignes` : [{ seance_id, etudiant_id, statut, motif }]. Rend { ecrites } ou
 * { erreur }.
 */
export function ecrirePresences(lignes, par) {
  for (const l of lignes) {
    if (!STATUTS_PRESENCE[l.statut] && l.statut !== null) return { erreur: `statut inconnu : ${l.statut}` };
    if (l.statut === 'justifie' && !MOTIFS_JUSTIFIES[l.motif]) {
      return { erreur: "Une absence justifiée demande son motif — seuls ceux que reconnaît le congé-éducation payé." };
    }
  }
  const lire = db.prepare('SELECT statut, motif FROM presence WHERE seance_id = ? AND etudiant_id = ?');
  const poser = db.prepare(`INSERT INTO presence (seance_id, etudiant_id, statut, motif, encode_par, encode_le)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT (seance_id, etudiant_id) DO UPDATE SET statut = excluded.statut, motif = excluded.motif,
        encode_par = excluded.encode_par, encode_le = excluded.encode_le`);
  const effacer = db.prepare('DELETE FROM presence WHERE seance_id = ? AND etudiant_id = ?');
  const journal = db.prepare(`INSERT INTO presence_journal (seance_id, etudiant_id, avant, apres, motif, par)
      VALUES (?, ?, ?, ?, ?, ?)`);
  let ecrites = 0;
  db.transaction(() => {
    for (const l of lignes) {
      const avant = lire.get(l.seance_id, l.etudiant_id);
      const motif = l.statut === 'justifie' ? l.motif : null;
      if ((avant?.statut || null) === (l.statut || null) && (avant?.motif || null) === motif) continue;
      if (l.statut) poser.run(l.seance_id, l.etudiant_id, l.statut, motif, par);
      else effacer.run(l.seance_id, l.etudiant_id);
      journal.run(l.seance_id, l.etudiant_id, avant?.statut || null, l.statut || null, motif, par);
      ecrites++;
    }
  })();
  return { ecrites };
}

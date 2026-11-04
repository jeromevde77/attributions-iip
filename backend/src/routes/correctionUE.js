/* CORRIGER UNE UE — ANNÉES REPRISES (3.5.118, Charles, 4 novembre 2026 : « de manière temporaire, un moyen rapide de changer
 * la note de l'UE d'un étudiant, de mettre refus, la note réussite… On est toujours dans les corrections de l'import 22-23,
 * 23-24, 24-25 et 25-26, et mon secrétariat veut cela par UE avec année : tous les résultats dans une UE, par AA, cours et UE,
 * avec un simple clic pour changer la décision » ; tranché : secrétariat et direction, années reprises seulement ; les deux
 * sessions si elles existent, seule la décision finale compte).
 *
 * OUTIL TEMPORAIRE : à retirer quand les corrections des imports seront finies.
 *
 * Rien n'est recalculé ici : la lecture est celle de la délibération (`delibererUE`), les écritures sont celles de la feuille
 * (une note par cours et par acquis, sous sa session) et de la grille du parcours (la décision sur l'inscription, la faveur
 * comme un ajustement de l'unité). Seule différence : le verrou des séances closes est levé pour CHAQUE écriture
 * (`avecNoteForcee`), et seulement avant l'année où Lucie a commencé (`ANNEE_CIRCUIT_VA`). Le journal des modifications garde
 * l'ancienne valeur, la nouvelle et l'auteur. */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { delibererUE, CODE_EPREUVE_UE } from './acquis.js';
import { avecNoteForcee } from '../lib/gardeNotes.js';
import { ANNEE_CIRCUIT_VA } from '../lib/valorisation.js';

const r = Router();
/* Direction et secrétariat, PAR LE RÔLE : `roleRequired('admin')` laisse lire un rôle au plafond « Configuration » (3.5.030),
   ce qui n'a rien à voir ici. */
const ROLES = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];
const PEUT = (req, res, next) => (ROLES.includes(req.user?.role) ? next()
  : res.status(403).json({ error: 'Réservé à la direction et au secrétariat.' }));
const DECISIONS = ['reussi', 'ajourne', 'refuse', 'faveur', null];

function anneeReprise(annee) {
  return /^\d{4}-\d{4}$/.test(String(annee || '')) && String(annee) < ANNEE_CIRCUIT_VA;
}
const refusAnnee = annee => `Cet outil ne corrige que les années reprises (avant ${ANNEE_CIRCUIT_VA}) : ${annee || '?'} se corrige dans la délibération.`;

function aSeconde(ueNum, annee) {
  return !!db.prepare(`SELECT 1 FROM etudiant_note_detail WHERE ue_num = ? AND annee_scolaire = ? AND code LIKE 's2|%' LIMIT 1`)
    .get(ueNum, annee)
    || !!db.prepare(`SELECT 1 FROM etudiant_inscription WHERE ue_num = ? AND annee_scolaire = ?
      AND (resultat_s2 IS NOT NULL OR points_s2 IS NOT NULL) LIMIT 1`).get(ueNum, annee);
}
function aFaveur(etudId, annee, ueNum) {
  try {
    return !!db.prepare(`SELECT 1 FROM deliberation_ajustement WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
      AND portee = 'ue' AND action = 'faveur'`).get(etudId, annee, ueNum);
  } catch { return false; }
}

/** Une ligne : l'étudiant, sa décision finale, et la lecture de la délibération pour la session demandée. */
function ligne(e, ueNum, annee, session) {
  let d = null;
  try { d = delibererUE(e.id, ueNum, annee, session); } catch { d = null; }
  const notes = {};
  for (const a of d?.acquis || []) {
    for (const ev of a.evaluations || []) notes[`${ev.cours_code}|${a.aa_code}`] = { note: ev.note ?? null, mention: ev.mention || null };
  }
  const cours = {};
  for (const c of d?.cours || []) cours[c.cours_code] = { note: c.note ?? null, mention: c.mention || null };
  const acquis = {};
  for (const a of d?.acquis || []) acquis[a.aa_code] = { note: a.note ?? null, mention: a.mention || null };
  return {
    id: e.id, nom: e.nom, prenom: e.prenom, matricule: e.id_ecampus || null,
    resultat: e.resultat || null, points: e.points ?? null,
    resultat_s1: e.resultat_s1 || null, resultat_s2: e.resultat_s2 || null,
    faveur: aFaveur(e.id, annee, ueNum),
    notes, cours, acquis,
    note_ue: d?.ue?.note ?? null, proposee: d?.ue?.decision_proposee || null,
  };
}
function inscrits(ueNum, annee, etudId = null) {
  return db.prepare(`SELECT e.id, e.nom, e.prenom, e.id_ecampus, i.resultat, i.points, i.resultat_s1, i.resultat_s2
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.ue_num = ? AND i.annee_scolaire = ? ${etudId ? 'AND e.id = ?' : ''}
    ORDER BY e.nom COLLATE NOCASE, e.prenom COLLATE NOCASE`).all(ueNum, annee, ...(etudId ? [etudId] : []));
}

/** Les années reprises qui portent des inscriptions, et les UE d'une année. */
r.get('/choix', authRequired, PEUT, (req, res) => {
  const annees = db.prepare(`SELECT DISTINCT annee_scolaire a FROM etudiant_inscription WHERE annee_scolaire < ? ORDER BY 1 DESC`)
    .all(ANNEE_CIRCUIT_VA).map(x => x.a);
  const annee = String(req.query.annee || annees[0] || '');
  const ues = annee ? db.prepare(`SELECT i.ue_num, COUNT(*) n,
      (SELECT u.ue_nom FROM ue u WHERE u.ue_num = i.ue_num AND u.ue_nom IS NOT NULL ORDER BY (u.annee_scolaire = ?) DESC LIMIT 1) ue_nom,
      (SELECT u.section FROM ue u WHERE u.ue_num = i.ue_num AND u.section IS NOT NULL ORDER BY (u.annee_scolaire = ?) DESC LIMIT 1) section
    FROM etudiant_inscription i WHERE i.annee_scolaire = ? GROUP BY i.ue_num ORDER BY i.ue_num`).all(annee, annee, annee) : [];
  res.json({ annees, annee, ues });
});

r.get('/', authRequired, PEUT, (req, res) => {
  const ueNum = Number(req.query.ue), annee = String(req.query.annee || '');
  if (!ueNum) return res.status(400).json({ error: 'ue requise' });
  if (!anneeReprise(annee)) return res.status(400).json({ error: refusAnnee(annee) });
  const sessions = aSeconde(ueNum, annee) ? [1, 2] : [1];
  const session = sessions.includes(Number(req.query.session)) ? Number(req.query.session) : 1;
  const liste = inscrits(ueNum, annee, Number(req.query.etudiant) || null);
  const lignes = liste.map(e => ligne(e, ueNum, annee, session));
  // La structure (cours et leurs acquis) se lit du calcul : la même que la délibération.
  let structure = [];
  try {
    const d = liste.length ? delibererUE(liste[0].id, ueNum, annee, session) : null;
    const parCours = new Map((d?.cours || []).map(c => [c.cours_code, { cours_code: c.cours_code, cours_nom: c.cours_nom, aas: [] }]));
    for (const a of d?.acquis || []) {
      for (const ev of a.evaluations || []) {
        // L'ÉPREUVE D'UNITÉ (« __ue__ ») : les acquis évalués sur l'unité entière (épreuve intégrée, évaluation unique).
        if (!parCours.has(ev.cours_code)) parCours.set(ev.cours_code, { cours_code: ev.cours_code,
          cours_nom: ev.cours_code === CODE_EPREUVE_UE ? 'Épreuve de l’unité' : ev.cours_code, aas: [], epreuve: ev.cours_code === CODE_EPREUVE_UE });
        parCours.get(ev.cours_code).aas.push(a.aa_code);
      }
    }
    structure = [...parCours.values()].filter(c => c.aas.length || !c.epreuve);
  } catch { structure = []; }
  const ue_nom = db.prepare(`SELECT ue_nom FROM ue WHERE ue_num = ? AND ue_nom IS NOT NULL ORDER BY (annee_scolaire = ?) DESC LIMIT 1`)
    .get(ueNum, annee)?.ue_nom || '';
  res.json({ ue_num: ueNum, ue_nom, annee, sessions, session, structure, etudiants: lignes });
});

/** Une note d'acquis dans un cours, sous sa session : la forme que la délibération lit d'abord (« s1|cours|aa »). */
r.put('/note', authRequired, PEUT, (req, res) => {
  const { etudiant_id, annee, ue_num, cours_code, aa_code } = req.body || {};
  const session = Number(req.body?.session) === 2 ? 2 : 1;
  if (!etudiant_id || !ue_num || !cours_code || !aa_code) return res.status(400).json({ error: 'étudiant, unité, cours et acquis requis' });
  if (!anneeReprise(annee)) return res.status(400).json({ error: refusAnnee(annee) });
  const brut = String(req.body?.valeur ?? '').trim().toUpperCase().replace(',', '.');
  const mention = ['NP', 'PP'].includes(brut) ? brut : null;
  const n = brut === '' || mention ? null : Number(brut);
  if (!mention && brut !== '' && !(Number.isFinite(n) && n >= 0 && n <= 20)) {
    return res.status(400).json({ error: 'Une note entre 0 et 20, NP, PP — ou vide pour effacer.' });
  }
  // L'épreuve d'unité s'écrit SANS cours (« s1|AA… ») : la forme que le calcul lit (3.5.097, `/feuille/note`).
  const code = cours_code === CODE_EPREUVE_UE ? `s${session}|${aa_code}` : `s${session}|${cours_code}|${aa_code}`;
  avecNoteForcee(etudiant_id, annee, ue_num, () => {
    if (brut === '') {
      db.prepare(`DELETE FROM etudiant_note_detail WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND type = 'aa' AND code = ?`)
        .run(Number(etudiant_id), annee, Number(ue_num), code);
    } else {
      db.prepare(`INSERT INTO etudiant_note_detail (etudiant_id, annee_scolaire, ue_num, type, code, points, mention)
        VALUES (?,?,?, 'aa', ?, ?, ?)
        ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET points = excluded.points, mention = excluded.mention`)
        .run(Number(etudiant_id), annee, Number(ue_num), code, mention ? 0 : n, mention);
    }
  });
  const e = inscrits(Number(ue_num), annee, Number(etudiant_id))[0];
  res.json({ ok: true, etudiant: e ? ligne(e, Number(ue_num), annee, session) : null });
});

/** La décision finale d'un clic (réussi, ajourné, refusé, faveur, vide), et la note de l'unité. */
r.put('/decision', authRequired, PEUT, (req, res) => {
  const { etudiant_id, annee, ue_num } = req.body || {};
  const etudId = Number(etudiant_id), ueN = Number(ue_num);
  const session = Number(req.body?.session) === 2 ? 2 : 1;
  if (!etudId || !ueN) return res.status(400).json({ error: 'étudiant et unité requis' });
  if (!anneeReprise(annee)) return res.status(400).json({ error: refusAnnee(annee) });
  const insc = db.prepare('SELECT id, points FROM etudiant_inscription WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?').get(etudId, annee, ueN);
  if (!insc) return res.status(404).json({ error: "Pas d'inscription à cette unité pour cette année." });
  const aDecision = 'decision' in (req.body || {});
  const decision = req.body?.decision ?? null;
  if (aDecision && !DECISIONS.includes(decision)) return res.status(400).json({ error: 'décision invalide' });
  let points;
  if ('points' in (req.body || {})) {
    const b = String(req.body.points ?? '').trim().replace(',', '.');
    points = b === '' ? null : Number(b);
    if (points != null && !(Number.isFinite(points) && points >= 0 && points <= 20)) return res.status(400).json({ error: 'note de l’unité entre 0 et 20' });
  }
  const par = req.user?.nom || req.user?.email || null;
  const retirerFaveur = () => {
    try { db.prepare(`DELETE FROM deliberation_ajustement WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ? AND portee = 'ue' AND action = 'faveur'`).run(etudId, annee, ueN); } catch { /* table absente */ }
  };
  avecNoteForcee(etudId, annee, ueN, () => db.transaction(() => {
    if (aDecision) {
      if (decision === 'faveur') {
        // Comme la grille du parcours : l'unité vaut 10, réussie, et la faveur est un ajustement de l'unité, au nom de qui clique.
        db.prepare(`UPDATE etudiant_inscription SET resultat = 'reussi', points = 10 WHERE id = ?`).run(insc.id);
        retirerFaveur();
        try {
          db.prepare(`INSERT INTO deliberation_ajustement (etudiant_id, annee_scolaire, ue_num, session, portee, code, action, maj_par)
            VALUES (?,?,?,?,'ue','*','faveur',?)`).run(etudId, annee, ueN, session, par);
        } catch { /* table absente */ }
      } else {
        retirerFaveur();
        db.prepare('UPDATE etudiant_inscription SET resultat = ? WHERE id = ?').run(decision, insc.id);
      }
    }
    if (points !== undefined && !(aDecision && decision === 'faveur')) {
      db.prepare('UPDATE etudiant_inscription SET points = ? WHERE id = ?').run(points, insc.id);
    }
  })());
  const e = inscrits(ueN, annee, etudId)[0];
  res.json({ ok: true, etudiant: e ? ligne(e, ueN, annee, session) : null });
});

export default r;

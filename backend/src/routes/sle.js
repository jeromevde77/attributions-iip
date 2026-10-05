/**
 * LE DOSSIER « SÉJOUR LIMITÉ AUX ÉTUDES » D'UN ÉTUDIANT, PAR ANNÉE (3.1.60,
 * Charles, 5 octobre 2026 : « compléter les annexes une à une me semble
 * compliqué ; un onglet SLE dans la fiche, qui n'existe QUE si l'étudiant est
 * en SLE, et le motif proposé par Lucie »).
 *
 * Ce que les annexes 1 et 2 demandent et que Lucie ne peut pas déduire — la
 * situation quand elle n'est pas définitive, la mobilité, les raisons d'un
 * programme sous 54 crédits, les conditions d'admission, le motif et l'avis de
 * l'annexe 2 — se saisit UNE fois, dans la fiche, et se garde. Les pièces
 * (routes/annexe1.js, routes/annexe2.js) le lisent quand on ne leur passe rien :
 * le lot d'Éditions part ainsi complet, sans formulaire pièce par pièce.
 *
 * LE MOTIF DE L'ANNEXE 2 SE PROPOSE, à partir des résultats de l'année : les
 * unités inscrites et non acquises, avec leur décision. C'est un constat, pas
 * une appréciation ; il reste modifiable, et ce qui est enregistré l'emporte.
 */
import express from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = express.Router();
export const ROLES_ANNEXES = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'];
const CHAMPS = ['situation', 'echange_du', 'echange_au', 'date_ultime', 'mobilite', 'mobilite_mois',
  'raisons', 'conditions', 'motif_a2', 'avis_a2'];

export function migrerSLE(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS etudiant_sle (
    etudiant_id    INTEGER NOT NULL REFERENCES etudiant(id) ON DELETE CASCADE,
    annee_scolaire TEXT NOT NULL,
    situation      TEXT,
    echange_du     TEXT, echange_au TEXT, date_ultime TEXT,
    mobilite       INTEGER NOT NULL DEFAULT 0,
    mobilite_mois  TEXT,
    raisons        TEXT,
    conditions     TEXT,
    motif_a2       TEXT,
    avis_a2        TEXT,
    maj_le         TEXT NOT NULL DEFAULT (datetime('now')),
    maj_par        TEXT,
    PRIMARY KEY (etudiant_id, annee_scolaire)
  )`);
}

/** Ce qui est enregistré pour un étudiant et une année, ou null. */
export function sleEnregistre(etudiantId, annee) {
  try {
    return db.prepare('SELECT * FROM etudiant_sle WHERE etudiant_id = ? AND annee_scolaire = ?').get(etudiantId, annee) || null;
  } catch { return null; }
}

const LIBELLE_RESULTAT = { refuse: 'refusée', ajourne: 'ajournée', absent: 'absent(e) à l’évaluation', abandon: 'abandon' };

/** Le motif proposé pour l'annexe 2 : les unités de l'année non acquises, et leur décision. */
export function motifPropose(etudiantId, annee) {
  const l = db.prepare(`SELECT i.ue_num, i.resultat,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = i.ue_num ORDER BY (u.annee_scolaire = ?) DESC, u.annee_scolaire DESC LIMIT 1) AS nom
    FROM etudiant_inscription i WHERE i.etudiant_id = ? AND i.annee_scolaire = ? ORDER BY i.ue_num`).all(annee, etudiantId, annee);
  if (!l.length) return null;
  const acquis = x => ['reussi', 'valorise', 'capitalise'].includes(x);
  const non = l.filter(x => !acquis(x.resultat));
  if (!non.length) return 'Sans objet : tous les crédits inscrits ont été obtenus.';
  const sansDecision = non.filter(x => !x.resultat);
  if (sansDecision.length === non.length) return null;   // l'année n'est pas délibérée : rien à constater
  const morceaux = non.map(x => `UE ${x.ue_num}${x.nom ? ` (${x.nom})` : ''} : ${x.resultat ? (LIBELLE_RESULTAT[x.resultat] || x.resultat) : 'pas encore délibérée'}`);
  return `N'a pas acquis ${non.length > 1 ? 'les unités suivantes' : "l'unité suivante"} — ${morceaux.join(' ; ')}.`;
}

r.get('/:etudiantId', authRequired, (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'année requise' });
  const id = Number(req.params.etudiantId);
  const e = db.prepare('SELECT id, sejour_limite_etudes FROM etudiant WHERE id = ?').get(id);
  if (!e) return res.status(404).json({ error: 'étudiant introuvable' });
  res.json({ annee, sle: !!e.sejour_limite_etudes, enregistre: sleEnregistre(id, annee),
    propositions: { motif_a2: motifPropose(id, annee) }, peut_ecrire: ROLES_ANNEXES.includes(req.user?.role) });
});

r.put('/:etudiantId', authRequired, roleRequired(...ROLES_ANNEXES), (req, res) => {
  const id = Number(req.params.etudiantId);
  const b = req.body || {};
  const annee = String(b.annee || '');
  if (!/^\d{4}-\d{4}$/.test(annee)) return res.status(400).json({ error: 'année requise' });
  if (!db.prepare('SELECT 1 FROM etudiant WHERE id = ?').get(id)) return res.status(404).json({ error: 'étudiant introuvable' });
  const v = Object.fromEntries(CHAMPS.map(k => [k, k === 'mobilite' ? (b.mobilite === true || b.mobilite === 'oui' ? 1 : 0)
    : (b[k] == null || String(b[k]).trim() === '' ? null : String(b[k]).trim().slice(0, 2000))]));
  const par = req.user?.nom || req.user?.email || null;
  db.prepare(`INSERT INTO etudiant_sle (etudiant_id, annee_scolaire, ${CHAMPS.join(', ')}, maj_le, maj_par)
      VALUES (?, ?, ${CHAMPS.map(() => '?').join(', ')}, datetime('now'), ?)
      ON CONFLICT(etudiant_id, annee_scolaire) DO UPDATE SET ${CHAMPS.map(k => `${k} = excluded.${k}`).join(', ')},
        maj_le = excluded.maj_le, maj_par = excluded.maj_par`)
    .run(id, annee, ...CHAMPS.map(k => v[k]), par);
  res.json({ ok: true, enregistre: sleEnregistre(id, annee) });
});

export default r;

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { PEUT_INSTRUIRE } from '../lib/valorisation.js';

/**
 * MES COURS — la porte du professeur (25 septembre 2026).
 *
 * Un professeur qui se connecte trouve SES cours de l'année — tels que les
 * attributions les lui donnent — et, pour chacun, LA LISTE DE SES ÉTUDIANTS :
 * ceux de ses groupes quand la répartition existe, tous les inscrits de
 * l'unité sinon.
 *
 * IL PROPOSE, IL N'ÉCRIT PAS AU DOSSIER. La règle de la maison — la
 * coordination encode, la direction valide — ne change pas : la note saisie
 * ici est une PROPOSITION (`note_proposee`), que la coordination reprend
 * dans l'encodage officiel. C'est aussi ce qui permet d'ouvrir cette porte
 * sans toucher aux plafonds de rôles.
 *
 * La porte est SANS MODULE (carteModules) : chaque route vérifie elle-même
 * que le cours appartient au professeur connecté — comme « demandes », ce
 * qui appartient à chacun ne se ferme pas à celui qu'il concerne.
 */
const r = Router();

(function migrerNotesProposees() {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS note_proposee (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL,
      cours_code     TEXT NOT NULL,
      note           REAL,
      propose_par    TEXT,
      propose_le     TEXT,
      UNIQUE(etudiant_id, annee_scolaire, cours_code)
    )`);
  } catch (e) { console.error('[migration] note_proposee :', e.message); }
})();

// Le dossier professeur du compte connecté — sans lui, pas de porte.
function profDe(req) {
  try {
    return db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?')
      .get(req.user?.id)?.professeur_id || null;
  } catch { return null; }
}

// Les lignes d'attribution du professeur pour l'année : cours, organisation,
// lettre de groupe — c'est à ce titre qu'il voit et propose.
function attributionsDe(profId, annee) {
  return db.prepare(`
    SELECT DISTINCT a.code_cours, a.ue_num,
           COALESCE(a.num_organisation, 1) AS org, a.code AS groupe,
           (SELECT c.cours_nom FROM cours c WHERE c.cours_code = a.code_cours
             ORDER BY (c.annee_scolaire = ?) DESC LIMIT 1) AS cours_nom,
           (SELECT x.ue_nom FROM ue x WHERE x.ue_num = a.ue_num AND x.ue_nom IS NOT NULL
             ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_nom
    FROM attribution a
    WHERE a.professeur_id = ? AND a.annee_scolaire = ? AND a.code_cours IS NOT NULL
    ORDER BY a.ue_num, a.code_cours, org, groupe
  `).all(annee, profId, annee);
}

/* Les étudiants du professeur pour UN cours : ceux de ses groupes quand la
 * répartition du cours existe, tous les inscrits de l'unité sinon. */
function etudiantsDuCours(profId, coursCode, annee) {
  const miennes = attributionsDe(profId, annee).filter(a => a.code_cours === coursCode);
  if (!miennes.length) return null;   // pas son cours
  const ueNum = miennes[0].ue_num;

  const repartis = db.prepare(`
    SELECT g.etudiant_id, g.num_organisation, g.groupe_code,
           e.nom, e.prenom, e.id_ecampus
    FROM etudiant_cours_groupe g JOIN etudiant e ON e.id = g.etudiant_id
    WHERE g.annee_scolaire = ? AND g.cours_code = ? AND e.actif = 1
    ORDER BY e.nom, e.prenom
  `).all(annee, coursCode);

  let etudiants;
  if (repartis.length) {
    const mienne = (org, grp) => miennes.some(a =>
      a.org === (org ?? 1) && String(a.groupe || '') === String(grp || ''));
    etudiants = repartis
      .filter(x => mienne(x.num_organisation, x.groupe_code))
      .map(x => ({ id: x.etudiant_id, nom: x.nom, prenom: x.prenom,
        id_ecampus: x.id_ecampus,
        groupe: `Org ${x.num_organisation ?? 1}${x.groupe_code ? ` · Gr. ${x.groupe_code}` : ''}` }));
  } else {
    etudiants = db.prepare(`
      SELECT e.id, e.nom, e.prenom, e.id_ecampus
      FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND i.ue_num = ? AND e.actif = 1
      ORDER BY e.nom, e.prenom
    `).all(annee, ueNum).map(x => ({ ...x, groupe: '' }));
  }
  return { miennes, ueNum, etudiants, repartition: repartis.length > 0 };
}

// ── Mes cours de l'année ─────────────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const profId = profDe(req);
  if (!profId) {
    return res.status(403).json({ error: "Ce compte n'est lié à aucun dossier professeur." });
  }
  const attrs = attributionsDe(profId, annee);
  const parCours = new Map();
  for (const a of attrs) {
    const c = parCours.get(a.code_cours) || {
      cours_code: a.code_cours, cours_nom: a.cours_nom, ue_num: a.ue_num,
      ue_nom: a.ue_nom, groupes: [],
    };
    c.groupes.push(`Org ${a.org}${a.groupe ? ` · Gr. ${a.groupe}` : ''}`);
    parCours.set(a.code_cours, c);
  }
  const cours = [...parCours.values()].map(c => {
    const d = etudiantsDuCours(profId, c.cours_code, annee);
    return { ...c, nb_etudiants: d ? d.etudiants.length : 0,
      repartition: d ? d.repartition : false };
  });
  res.json({ annee, cours });
});

// ── La feuille d'un cours : mes étudiants et mes propositions ────────────────
r.get('/:coursCode/etudiants', authRequired, (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const profId = profDe(req);
  if (!profId) return res.status(403).json({ error: "Ce compte n'est lié à aucun dossier professeur." });
  const d = etudiantsDuCours(profId, req.params.coursCode, annee);
  if (!d) return res.status(403).json({ error: "Ce cours n'est pas dans vos attributions." });

  const props = new Map(db.prepare(`
    SELECT etudiant_id, note FROM note_proposee
    WHERE annee_scolaire = ? AND cours_code = ?`).all(annee, req.params.coursCode)
    .map(x => [x.etudiant_id, x.note]));

  res.json({
    annee, cours_code: req.params.coursCode, ue_num: d.ueNum,
    repartition: d.repartition,
    etudiants: d.etudiants.map(e => ({ ...e, note: props.get(e.id) ?? null })),
  });
});

// ── Proposer ses notes — rien n'entre au dossier ─────────────────────────────
r.post('/:coursCode/notes', authRequired, (req, res) => {
  const annee = String(req.body?.annee || anneeDeTravail(req));
  const profId = profDe(req);
  if (!profId) return res.status(403).json({ error: "Ce compte n'est lié à aucun dossier professeur." });
  const d = etudiantsDuCours(profId, req.params.coursCode, annee);
  if (!d) return res.status(403).json({ error: "Ce cours n'est pas dans vos attributions." });

  const permis = new Set(d.etudiants.map(e => e.id));
  const notes = (Array.isArray(req.body?.notes) ? req.body.notes : [])
    .map(x => ({ etudiant_id: Number(x?.etudiant_id),
      note: x?.note == null || x.note === '' ? null : Number(String(x.note).replace(',', '.')) }))
    .filter(x => permis.has(x.etudiant_id)
      && (x.note === null || (Number.isFinite(x.note) && x.note >= 0 && x.note <= 20)));
  if (!notes.length) return res.status(400).json({ error: 'Aucune note valable.' });

  const poser = db.prepare(`
    INSERT INTO note_proposee (etudiant_id, annee_scolaire, cours_code, note, propose_par, propose_le)
    VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(etudiant_id, annee_scolaire, cours_code) DO UPDATE SET
      note = excluded.note, propose_par = excluded.propose_par, propose_le = datetime('now')`);
  const oter = db.prepare(
    'DELETE FROM note_proposee WHERE etudiant_id = ? AND annee_scolaire = ? AND cours_code = ?');
  let n = 0;
  db.transaction(() => {
    for (const x of notes) {
      if (x.note === null) { n += oter.run(x.etudiant_id, annee, req.params.coursCode).changes; }
      else { poser.run(x.etudiant_id, annee, req.params.coursCode, x.note, req.user?.email || null); n++; }
    }
  })();
  res.json({ ok: true, proposees: n });
});

// ── Ce que la coordination reprend dans l'encodage officiel ──────────────────
r.get('/:coursCode/propositions', authRequired, roleRequired(...PEUT_INSTRUIRE), (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const lignes = db.prepare(`
    SELECT p.etudiant_id, p.note, p.propose_par, p.propose_le, e.nom, e.prenom
    FROM note_proposee p JOIN etudiant e ON e.id = p.etudiant_id
    WHERE p.annee_scolaire = ? AND p.cours_code = ?
    ORDER BY e.nom, e.prenom`).all(annee, req.params.coursCode);
  res.json({ annee, cours_code: req.params.coursCode, propositions: lignes });
});

export default r;

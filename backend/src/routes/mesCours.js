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
    /* LA PROPOSITION SE FAIT PAR ACQUIS D'APPRENTISSAGE (Jérôme, 29 septembre
     * 2026 : « tu n'as pas pris en compte les AA — tu fais encoder une note
     * par cours »). C'est la règle de la maison : l'évaluation est par AA, la
     * feuille officielle note par AA. aa_code entre donc dans la clé ;
     * '' (vide) reste la note de cours, pour les cours sans AA rattachés. */
    db.exec(`CREATE TABLE IF NOT EXISTS note_proposee (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id    INTEGER NOT NULL,
      annee_scolaire TEXT NOT NULL,
      cours_code     TEXT NOT NULL,
      aa_code        TEXT NOT NULL DEFAULT '',
      note           REAL,
      propose_par    TEXT,
      propose_le     TEXT,
      UNIQUE(etudiant_id, annee_scolaire, cours_code, aa_code)
    )`);
    const cols = db.prepare('PRAGMA table_info(note_proposee)').all().map(c => c.name);
    if (!cols.includes('aa_code')) {
      // Table d'avant la 2.12.150 : on la rebâtit, les notes de cours
      // existantes deviennent des lignes aa_code '' — rien ne se perd.
      db.exec(`
        ALTER TABLE note_proposee RENAME TO note_proposee_v1;
        CREATE TABLE note_proposee (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          etudiant_id    INTEGER NOT NULL,
          annee_scolaire TEXT NOT NULL,
          cours_code     TEXT NOT NULL,
          aa_code        TEXT NOT NULL DEFAULT '',
          note           REAL,
          propose_par    TEXT,
          propose_le     TEXT,
          UNIQUE(etudiant_id, annee_scolaire, cours_code, aa_code)
        );
        INSERT INTO note_proposee (etudiant_id, annee_scolaire, cours_code, aa_code,
                                   note, propose_par, propose_le)
          SELECT etudiant_id, annee_scolaire, cours_code, '', note, propose_par, propose_le
          FROM note_proposee_v1;
        DROP TABLE note_proposee_v1;
      `);
      console.log('[migration] note_proposee : passage par acquis (aa_code)');
    }
  } catch (e) { console.error('[migration] note_proposee :', e.message); }
})();

/* Les acquis évalués par CE cours — la pondération seule en tient le compte,
 * comme pour la DUE. Sans lignes de pondération : repli sur le rattachement
 * direct aa.cours_code, puis, à défaut, la note de cours. */
function acquisDuCours(coursCode, ueNum) {
  try {
    const lies = db.prepare(`
      SELECT p.aa_code, COALESCE(a.description, '') AS description,
             COALESCE(a.aa_num, 999) AS aa_num
      FROM aa_ponderation p LEFT JOIN aa a ON a.aa_code = p.aa_code
      WHERE p.ue_num = ? AND p.cours_code = ?
      ORDER BY aa_num, p.aa_code`).all(ueNum, coursCode);
    if (lies.length) return lies.map(x => ({ aa_code: x.aa_code, description: x.description }));
    return db.prepare(`
      SELECT aa_code, COALESCE(description, '') AS description
      FROM aa WHERE ue_num = ? AND cours_code = ?
      ORDER BY aa_num, aa_code`).all(ueNum, coursCode);
  } catch { return []; }
}

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
           COALESCE(a.activite_id, 0) AS activite_id,
           (SELECT t.libelle FROM activite_type t WHERE t.id = a.activite_id) AS activite_libelle,
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

  /* PAR ACTIVITÉ. Un professeur porte une ou plusieurs lignes d'attribution
   * — « labo, groupe 3 », « théorie » — et chacune désigne ses étudiants :
   * ceux que la répartition a placés dans CE groupe de CETTE activité ; et
   * si l'activité n'est pas répartie (la théorie, suivie par tous), tous les
   * inscrits de l'unité. On réunit, sans doublon. */
  const repartis = db.prepare(`
    SELECT g.etudiant_id, g.num_organisation, g.groupe_code, COALESCE(g.activite_id, 0) AS activite_id,
           e.nom, e.prenom, e.id_ecampus
    FROM etudiant_cours_groupe g JOIN etudiant e ON e.id = g.etudiant_id
    WHERE g.annee_scolaire = ? AND g.cours_code = ? AND e.actif = 1
    ORDER BY e.nom, e.prenom
  `).all(annee, coursCode);
  const inscrits = () => db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ? AND e.actif = 1
    ORDER BY e.nom, e.prenom
  `).all(annee, ueNum);

  const parId = new Map();
  let repartition = false;
  for (const a of miennes) {
    const deLActivite = repartis.filter(x => x.activite_id === a.activite_id);
    const prefixe = a.activite_libelle ? `${a.activite_libelle} · ` : '';
    let lot;
    if (deLActivite.length) {
      repartition = true;
      lot = deLActivite
        .filter(x => (x.num_organisation ?? 1) === a.org && String(x.groupe_code || '') === String(a.groupe || ''))
        .map(x => ({ id: x.etudiant_id, nom: x.nom, prenom: x.prenom, id_ecampus: x.id_ecampus,
          groupe: `${prefixe}Org ${x.num_organisation ?? 1}${x.groupe_code ? ` · Gr. ${x.groupe_code}` : ''}` }));
    } else {
      lot = inscrits().map(x => ({ ...x, groupe: a.activite_libelle ? `${a.activite_libelle} · tous` : '' }));
    }
    for (const e of lot) {
      const deja = parId.get(e.id);
      if (!deja) parId.set(e.id, e);
      else if (e.groupe && !deja.groupe.split(' + ').includes(e.groupe)) {
        deja.groupe = deja.groupe ? `${deja.groupe} + ${e.groupe}` : e.groupe;
      }
    }
  }
  const etudiants = [...parId.values()].sort((x, y) =>
    `${x.nom} ${x.prenom}`.localeCompare(`${y.nom} ${y.prenom}`, 'fr'));
  return { miennes, ueNum, etudiants, repartition };
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
    c.groupes.push(`${a.activite_libelle ? `${a.activite_libelle} · ` : ''}Org ${a.org}${a.groupe ? ` · Gr. ${a.groupe}` : ''}`);
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

  const acquis = acquisDuCours(req.params.coursCode, d.ueNum);
  const props = {};
  for (const x of db.prepare(`
    SELECT etudiant_id, aa_code, note FROM note_proposee
    WHERE annee_scolaire = ? AND cours_code = ?`).all(annee, req.params.coursCode)) {
    (props[x.etudiant_id] ||= {})[x.aa_code || ''] = x.note;
  }

  res.json({
    annee, cours_code: req.params.coursCode, ue_num: d.ueNum,
    repartition: d.repartition,
    // La feuille du professeur note PAR ACQUIS ; sans AA rattachés au cours,
    // elle retombe sur une note de cours (clé '').
    acquis,
    etudiants: d.etudiants.map(e => ({ ...e,
      notes: props[e.id] || {}, note: (props[e.id] || {})[''] ?? null })),
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
  // Les acquis admis pour ce cours — plus la clé '' (note de cours).
  const aaPermis = new Set(['', ...acquisDuCours(req.params.coursCode, d.ueNum).map(a => a.aa_code)]);
  const notes = (Array.isArray(req.body?.notes) ? req.body.notes : [])
    .map(x => ({ etudiant_id: Number(x?.etudiant_id),
      aa_code: String(x?.aa_code ?? ''),
      note: x?.note == null || x.note === '' ? null : Number(String(x.note).replace(',', '.')) }))
    .filter(x => permis.has(x.etudiant_id) && aaPermis.has(x.aa_code)
      && (x.note === null || (Number.isFinite(x.note) && x.note >= 0 && x.note <= 20)));
  if (!notes.length) return res.status(400).json({ error: 'Aucune note valable.' });

  const poser = db.prepare(`
    INSERT INTO note_proposee (etudiant_id, annee_scolaire, cours_code, aa_code, note, propose_par, propose_le)
    VALUES (?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(etudiant_id, annee_scolaire, cours_code, aa_code) DO UPDATE SET
      note = excluded.note, propose_par = excluded.propose_par, propose_le = datetime('now')`);
  const oter = db.prepare(
    'DELETE FROM note_proposee WHERE etudiant_id = ? AND annee_scolaire = ? AND cours_code = ? AND aa_code = ?');
  let n = 0;
  db.transaction(() => {
    for (const x of notes) {
      if (x.note === null) { n += oter.run(x.etudiant_id, annee, req.params.coursCode, x.aa_code).changes; }
      else { poser.run(x.etudiant_id, annee, req.params.coursCode, x.aa_code, x.note, req.user?.email || null); n++; }
    }
  })();
  res.json({ ok: true, proposees: n });
});

// ── Ce que la coordination reprend dans l'encodage officiel ──────────────────
r.get('/:coursCode/propositions', authRequired, roleRequired(...PEUT_INSTRUIRE), (req, res) => {
  const annee = req.query.annee || anneeDeTravail(req);
  const lignes = db.prepare(`
    SELECT p.etudiant_id, p.aa_code, p.note, p.propose_par, p.propose_le, e.nom, e.prenom
    FROM note_proposee p JOIN etudiant e ON e.id = p.etudiant_id
    WHERE p.annee_scolaire = ? AND p.cours_code = ?
    ORDER BY e.nom, e.prenom, p.aa_code`).all(annee, req.params.coursCode);
  res.json({ annee, cours_code: req.params.coursCode, propositions: lignes });
});

export default r;

// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Travail de fin d'études (Charles, 15 octobre 2026 : « dans le dossier
// étudiant, comme pour les stages, prévoir une partie TFE ; il faut pouvoir
// encoder le titre »).
//
// Le TFE d'un étudiant : une année, une unité (l'épreuve intégrée, le plus
// souvent), un TITRE, un promoteur choisi dans le personnel, les dates de dépôt
// et de défense. Le titre est la seule valeur obligatoire : c'est lui qu'on
// demande. Un étudiant peut en avoir plusieurs (une reprise d'une année sur
// l'autre) : une ligne par année.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';

const r = Router();
const ECRITURE = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'];

export function migrerTfe(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS tfe (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id     INTEGER NOT NULL,
      annee_scolaire  TEXT NOT NULL,
      ue_num          INTEGER,
      titre           TEXT NOT NULL,
      promoteur_id    INTEGER,
      date_depot      TEXT,
      date_defense    TEXT,
      remarques       TEXT,
      cree_par        TEXT,
      maj_par         TEXT,
      maj_le          TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tfe_etudiant ON tfe(etudiant_id, annee_scolaire);
    `);
  } catch (e) { console.error('[migration] tfe :', e.message); }
}

// La coordination ne voit et n'écrit que les étudiants de ses sections.
function permis(req, etudId) {
  const perim = getUserSections(req.user);
  if (!perim) return true;
  const e = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(etudId);
  if (e?.s && perim.includes(e.s)) return true;
  const secs = db.prepare(`SELECT DISTINCT u.section FROM etudiant_inscription i JOIN ue u ON u.ue_num = i.ue_num
    AND u.annee_scolaire = i.annee_scolaire WHERE i.etudiant_id = ?`).all(etudId).map(x => x.section);
  return secs.some(s => perim.includes(s));
}
const auteur = req => req.user?.nom || req.user?.email || null;
const propre = v => (v == null || String(v).trim() === '' ? null : String(v).trim());

r.get('/etudiant/:id', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  if (!permis(req, etudId)) return res.status(404).json({ error: 'Étudiant introuvable' });
  res.json(db.prepare(`
    SELECT t.*,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = t.ue_num ORDER BY (u.annee_scolaire = t.annee_scolaire) DESC, u.annee_scolaire DESC LIMIT 1) AS ue_nom,
      (SELECT UPPER(p.nom) || ' ' || COALESCE(p.prenom, '') FROM professeur p WHERE p.id = t.promoteur_id) AS promoteur
    FROM tfe t WHERE t.etudiant_id = ? ORDER BY t.annee_scolaire DESC, t.id DESC`).all(etudId));
});

function valeurs(b) {
  return {
    annee_scolaire: propre(b.annee_scolaire), ue_num: b.ue_num ? Number(b.ue_num) : null, titre: propre(b.titre),
    promoteur_id: b.promoteur_id ? Number(b.promoteur_id) : null,
    date_depot: propre(b.date_depot), date_defense: propre(b.date_defense), remarques: propre(b.remarques),
  };
}

r.post('/', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const etudId = Number(req.body.etudiant_id);
  if (!etudId || !permis(req, etudId)) return res.status(404).json({ error: 'Étudiant introuvable' });
  const v = valeurs(req.body);
  if (!v.titre) return res.status(400).json({ error: 'Le titre du TFE est obligatoire.' });
  if (!v.annee_scolaire) return res.status(400).json({ error: "L'année est obligatoire." });
  const id = db.prepare(`INSERT INTO tfe (etudiant_id, annee_scolaire, ue_num, titre, promoteur_id, date_depot, date_defense, remarques, cree_par, maj_par)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(etudId, v.annee_scolaire, v.ue_num, v.titre, v.promoteur_id, v.date_depot, v.date_defense, v.remarques, auteur(req), auteur(req)).lastInsertRowid;
  res.json({ id });
});

r.put('/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const t = db.prepare('SELECT * FROM tfe WHERE id = ?').get(Number(req.params.id));
  if (!t || !permis(req, t.etudiant_id)) return res.status(404).json({ error: 'TFE introuvable' });
  const v = valeurs({ ...t, ...req.body });
  if (!v.titre) return res.status(400).json({ error: 'Le titre du TFE est obligatoire.' });
  db.prepare(`UPDATE tfe SET annee_scolaire = ?, ue_num = ?, titre = ?, promoteur_id = ?, date_depot = ?, date_defense = ?, remarques = ?,
    maj_par = ?, maj_le = datetime('now') WHERE id = ?`)
    .run(v.annee_scolaire || t.annee_scolaire, v.ue_num, v.titre, v.promoteur_id, v.date_depot, v.date_defense, v.remarques, auteur(req), t.id);
  res.json({ ok: true });
});

r.delete('/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const t = db.prepare('SELECT * FROM tfe WHERE id = ?').get(Number(req.params.id));
  if (!t || !permis(req, t.etudiant_id)) return res.status(404).json({ error: 'TFE introuvable' });
  db.prepare('DELETE FROM tfe WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

export default r;

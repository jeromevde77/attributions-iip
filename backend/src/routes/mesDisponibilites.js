// ─────────────────────────────────────────────────────────────────────────────
// MES DISPONIBILITÉS (3.5.224, Charles, 8 novembre 2026 : ce qui manquait à l'espace enseignant — « voir son agenda de
// disponibilités et proposer un changement, que le secrétariat valide »).
//
// L'agenda d'un enseignant (planning_contrainte, type « prof ») reste saisi par le secrétariat, la coordination et la direction
// (règle du 10 octobre 2026). Le professeur le LIT et PROPOSE : une proposition par quadrimestre en attente au plus (une nouvelle
// remplace la précédente), qui ne touche à rien tant qu'on ne l'applique pas. Le secrétariat la voit dans la fiche de
// l'enseignant (onglet des disponibilités) et l'applique ou la refuse avec un mot ; le professeur en est prévenu.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { baseEcole, toutesContraintes, ecrireContraintes } from '../lib/simulationHoraire.js';

const r = Router();

export function migrerDisposPropositions(dbx = db) {
  dbx.exec(`CREATE TABLE IF NOT EXISTS dispo_proposition (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    professeur_id  INTEGER NOT NULL,
    quadrimestre   TEXT NOT NULL,              -- Q1 | Q2
    cases          TEXT NOT NULL,              -- JSON [{ jour, debut, valeur }] — 0 rouge, 2 orange (le vert ne s'écrit pas)
    remarque       TEXT,
    statut         TEXT NOT NULL DEFAULT 'en_attente',   -- en_attente | appliquee | refusee | retiree
    propose_par    INTEGER,
    propose_le     TEXT DEFAULT (datetime('now')),
    decide_par     TEXT,
    decide_le      TEXT,
    motif          TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_dispo_prop ON dispo_proposition(professeur_id, statut);`);
}
try { migrerDisposPropositions(); } catch (e) { console.error('[migration] dispo_proposition :', e.message); }

const profDuCompte = id => db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(id)?.professeur_id || null;
const nomProf = id => { const p = db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(id); return p ? `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim() : `n° ${id}`; };
const lire = p => ({ ...p, cases: (() => { try { return JSON.parse(p.cases); } catch { return []; } })() });
function prevenir({ titre, corps, lien, userId = null, role = null, par }) {
  try {
    db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cible_role, cree_par) VALUES ('disponibilites', ?, ?, ?, ?, ?, ?)`)
      .run(titre, corps, lien, userId, role, par);
  } catch { /* la notification ne bloque pas la proposition */ }
}
function nettoyer(cases, base) {
  const ok = new Set(base.map(c => `${c.jour}|${c.debut}`));
  return (Array.isArray(cases) ? cases : [])
    .map(c => ({ jour: Number(c.jour), debut: String(c.debut || ''), valeur: Number(c.valeur) }))
    .filter(c => (c.valeur === 0 || c.valeur === 2) && ok.has(`${c.jour}|${c.debut}`));
}

// GET /api/mes-disponibilites — son agenda (base de l'école + ses cases) et ses propositions récentes.
r.get('/', authRequired, (req, res) => {
  const prof = profDuCompte(req.user.id);
  if (!prof) return res.json({ relie: false });
  const props = db.prepare(`SELECT * FROM dispo_proposition WHERE professeur_id = ? ORDER BY id DESC LIMIT 6`).all(prof).map(lire);
  res.json({ relie: true, professeur_id: prof, base: baseEcole(),
    cases: toutesContraintes().filter(c => c.type === 'prof' && c.cible === String(prof)), propositions: props });
});

// POST /api/mes-disponibilites { quadrimestre, cases, remarque } — propose ; remplace sa proposition en attente du même quadrimestre.
r.post('/', authRequired, (req, res) => {
  const prof = profDuCompte(req.user.id);
  if (!prof) return res.status(409).json({ error: 'Votre compte n’est relié à aucune fiche d’enseignant : demandez-le au secrétariat.' });
  const { quadrimestre, remarque } = req.body || {};
  if (!['Q1', 'Q2'].includes(quadrimestre)) return res.status(400).json({ error: 'Quadrimestre : Q1 ou Q2.' });
  const cases = nettoyer(req.body?.cases, baseEcole());
  const texte = String(remarque || '').trim().slice(0, 1000) || null;
  const id = db.transaction(() => {
    db.prepare(`UPDATE dispo_proposition SET statut = 'retiree', decide_le = datetime('now'), decide_par = 'remplacée par une nouvelle proposition'
      WHERE professeur_id = ? AND quadrimestre = ? AND statut = 'en_attente'`).run(prof, quadrimestre);
    return Number(db.prepare(`INSERT INTO dispo_proposition (professeur_id, quadrimestre, cases, remarque, propose_par) VALUES (?,?,?,?,?)`)
      .run(prof, quadrimestre, JSON.stringify(cases), texte, req.user.id).lastInsertRowid);
  })();
  prevenir({ titre: `Disponibilités proposées — ${nomProf(prof)} (${quadrimestre})`,
    corps: texte ? `« ${texte.slice(0, 200)} »` : 'À appliquer ou refuser dans sa fiche, onglet des disponibilités.',
    lien: '/professeurs', role: 'secretariat', par: req.user.nom || req.user.email });
  res.json({ ok: true, id });
});

// DELETE /api/mes-disponibilites/:id — retirer sa proposition tant qu'elle attend.
r.delete('/:id(\\d+)', authRequired, (req, res) => {
  const prof = profDuCompte(req.user.id);
  const n = db.prepare(`UPDATE dispo_proposition SET statut = 'retiree', decide_le = datetime('now'), decide_par = 'retirée par son auteur'
    WHERE id = ? AND professeur_id = ? AND statut = 'en_attente'`).run(Number(req.params.id), prof || -1).changes;
  if (!n) return res.status(404).json({ error: 'Proposition introuvable ou déjà traitée.' });
  res.json({ ok: true });
});

// ── Côté école : la fiche de l'enseignant ───────────────────────────────────
const SAISISSENT = roleRequired('admin', 'editeur', 'coordination');

// GET /api/mes-disponibilites/propositions?prof_id= — les propositions en attente (d'un enseignant, ou de tous).
r.get('/propositions', authRequired, SAISISSENT, (req, res) => {
  const p = Number(req.query.prof_id) || null;
  const lignes = db.prepare(`SELECT * FROM dispo_proposition WHERE statut = 'en_attente' ${p ? 'AND professeur_id = ?' : ''} ORDER BY id`)
    .all(...(p ? [p] : [])).map(lire).map(x => ({ ...x, nom: nomProf(x.professeur_id) }));
  res.json(lignes);
});

function trancher(req, res, appliquer) {
  const p = db.prepare(`SELECT * FROM dispo_proposition WHERE id = ?`).get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Proposition introuvable.' });
  if (p.statut !== 'en_attente') return res.status(409).json({ error: 'Proposition déjà traitée.' });
  const motif = String(req.body?.motif || '').trim() || null;
  if (!appliquer && !motif) return res.status(400).json({ error: 'Un mot pour dire pourquoi.' });
  const par = req.user.nom || req.user.email;
  db.transaction(() => {
    if (appliquer) ecrireContraintes('prof', String(p.professeur_id), p.quadrimestre, lire(p).cases, req.user.email || null);
    db.prepare(`UPDATE dispo_proposition SET statut = ?, decide_par = ?, decide_le = datetime('now'), motif = ? WHERE id = ?`)
      .run(appliquer ? 'appliquee' : 'refusee', par, motif, p.id);
  })();
  const compte = db.prepare(`SELECT id FROM utilisateur WHERE professeur_id = ? ORDER BY id LIMIT 1`).get(p.professeur_id)?.id || p.propose_par;
  prevenir({ titre: appliquer ? `Vos disponibilités (${p.quadrimestre}) ont été appliquées` : `Vos disponibilités (${p.quadrimestre}) n’ont pas été retenues`,
    corps: motif ? `« ${motif.slice(0, 200)} » — ${par}` : `Par ${par}.`, lien: '/agenda', userId: compte, par });
  res.json({ ok: true });
}
r.post('/propositions/:id(\\d+)/appliquer', authRequired, SAISISSENT, (req, res) => trancher(req, res, true));
r.post('/propositions/:id(\\d+)/refuser', authRequired, SAISISSENT, (req, res) => trancher(req, res, false));

export default r;

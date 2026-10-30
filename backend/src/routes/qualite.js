// ─────────────────────────────────────────────────────────────────────────────
// Lucie — La démarche qualité : le PLAN D'ACTION (3.1.442, Charles, 28 octobre 2026 :
// « plan d'action » d'abord).
//
// L'AEQES ne lit pas un document, elle lit deux ans de traces : « ce qui n'est pas consigné en
// 2026-2027 ne sera pas récupérable en 2028 » (docs/contexte/qualite-aeqes.html). La pièce
// maîtresse du dossier est un plan d'action priorisé, avec indicateurs : action, responsable,
// priorité, échéance, indicateur — et, à l'évaluation continue, son ÉTAT DE RÉALISATION, action
// par action, avec ses preuves.
//
// La table `action` existait depuis l'échéancier, jamais remplie ni lue : elle devient ce
// registre. Ce qu'elle n'avait pas s'y ajoute — critère du référentiel, périmètre (institution
// ou section), indicateur et cible, origine. Le SUIVI s'écrit en AJOUT SEUL (`action_suivi`) :
// « où en est-on » se lit dans la suite des points d'étape, qui et quand — un avancement qu'on
// réécrit ne prouve rien. Une action ne se supprime pas : elle s'abandonne, avec un motif.
//
// Écrire : direction, secrétariat (comme éditeur), administrateur ; la coordination pour les
// actions de SES sections. Lire : tout le personnel administratif.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';

const r = Router();

/* Les trois critères du référentiel institutionnel AEQES (2026-2027), et le programmatique. */
export const CRITERES = [
  { cle: 'strategie', libelle: 'Stratégie, gouvernance et démarche qualité' },
  { cle: 'programmes', libelle: 'Pilotage des programmes' },
  { cle: 'formation', libelle: 'Formation et parcours de l’étudiant' },
];
export const STATUTS = ['a_faire', 'en_cours', 'fait', 'abandonne'];
const PRIORITES = ['haute', 'normale', 'basse'];

export function migrerQualite(dbx = db) {
  const cols = new Set(dbx.prepare('PRAGMA table_info(action)').all().map(c => c.name));
  if (!cols.size) return;
  for (const [c, t] of [['critere', 'TEXT'], ['perimetre', "TEXT NOT NULL DEFAULT 'institution'"], ['section', 'TEXT'],
    ['indicateur', 'TEXT'], ['cible', 'TEXT'], ['origine', 'TEXT'], ['demarche', "TEXT NOT NULL DEFAULT 'qualite'"],
    ['avancement', 'INTEGER NOT NULL DEFAULT 0'], ['motif_abandon', 'TEXT'], ['maj_par', 'TEXT'], ['maj_le', 'TEXT']]) {
    if (!cols.has(c)) dbx.exec(`ALTER TABLE action ADD COLUMN ${c} ${t}`);
  }
  dbx.exec(`CREATE TABLE IF NOT EXISTS action_suivi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER NOT NULL REFERENCES action(id),
    le TEXT NOT NULL DEFAULT (datetime('now')),
    par TEXT, par_id INTEGER,
    avancement INTEGER, statut TEXT,
    texte TEXT NOT NULL)`);
}
try { migrerQualite(); } catch (e) { console.error('[migration] qualité :', e.message); }

const ECRIVAINS = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'];
const qui = req => req.user?.nom || req.user?.nom_complet || req.user?.email || null;
/** La coordination n'écrit que pour ses sections ; une action d'institution reste à la direction. */
function peutEcrire(req, a) {
  const secs = getUserSections(req.user);
  if (secs === null) return true;
  return a.perimetre === 'section' && !!a.section && secs.includes(a.section);
}
function verifier(b) {
  if (!String(b.titre || '').trim()) return 'L’action a un intitulé.';
  if (b.critere && !CRITERES.some(c => c.cle === b.critere)) return 'Critère inconnu.';
  if (b.priorite && !PRIORITES.includes(b.priorite)) return 'Priorité inconnue.';
  if (b.perimetre === 'section' && !String(b.section || '').trim()) return 'Une action de section nomme sa section.';
  if (b.date_due && !/^\d{4}-\d{2}-\d{2}$/.test(b.date_due)) return 'Échéance attendue au format AAAA-MM-JJ.';
  return null;
}

r.get('/referentiel', authRequired, (req, res) => {
  const responsables = db.prepare(`SELECT id, COALESCE(nom_complet, email) AS nom, role FROM utilisateur
    WHERE COALESCE(actif, 1) = 1 AND role <> 'professeur' ORDER BY nom`).all();
  let sections = [];
  try { sections = db.prepare('SELECT code, libelle FROM section ORDER BY code').all(); } catch { /* */ }
  res.json({ criteres: CRITERES, statuts: STATUTS, priorites: PRIORITES, responsables, sections });
});

r.get('/actions', authRequired, roleRequired(...ECRIVAINS), (req, res) => {
  const lignes = db.prepare(`SELECT a.*, COALESCE(u.nom_complet, u.email) AS responsable_nom,
      (SELECT COUNT(*) FROM action_suivi s WHERE s.action_id = a.id) AS nb_suivis,
      (SELECT s.le FROM action_suivi s WHERE s.action_id = a.id ORDER BY s.id DESC LIMIT 1) AS dernier_suivi
    FROM action a LEFT JOIN utilisateur u ON u.id = a.responsable_user_id
    WHERE a.demarche = 'qualite'
    ORDER BY CASE a.statut WHEN 'en_cours' THEN 0 WHEN 'a_faire' THEN 1 WHEN 'fait' THEN 2 ELSE 3 END,
      CASE a.priorite WHEN 'haute' THEN 0 WHEN 'normale' THEN 1 ELSE 2 END, COALESCE(a.date_due, '9999'), a.id`).all();
  const auj = new Date().toISOString().slice(0, 10);
  res.json(lignes.map(a => ({ ...a, en_retard: !!a.date_due && a.date_due < auj && !['fait', 'abandonne'].includes(a.statut),
    modifiable: peutEcrire(req, a) })));
});

r.get('/actions/:id/suivi', authRequired, roleRequired(...ECRIVAINS), (req, res) => {
  res.json(db.prepare('SELECT * FROM action_suivi WHERE action_id = ? ORDER BY id').all(Number(req.params.id)));
});

r.post('/actions', authRequired, roleRequired(...ECRIVAINS), (req, res) => {
  const b = req.body || {};
  const souci = verifier(b); if (souci) return res.status(400).json({ error: souci });
  const a = { perimetre: b.perimetre === 'section' ? 'section' : 'institution', section: b.perimetre === 'section' ? b.section : null };
  if (!peutEcrire(req, a)) return res.status(403).json({ error: 'La coordination pose les actions de ses sections ; une action d’institution reste à la direction.' });
  const id = db.prepare(`INSERT INTO action (titre, description, responsable_user_id, responsable_libre, date_due, statut, priorite,
      source_type, annee_scolaire, cree_par, critere, perimetre, section, indicateur, cible, origine, demarche, maj_par, maj_le)
    VALUES (?,?,?,?,?, 'a_faire', ?, 'libre', ?, ?, ?, ?, ?, ?, ?, ?, 'qualite', ?, datetime('now'))`)
    .run(String(b.titre).trim(), b.description || null, b.responsable_user_id || null, b.responsable_libre || null, b.date_due || null,
      b.priorite || 'normale', b.annee_scolaire || anneeDeTravail(req), qui(req), b.critere || null, a.perimetre, a.section,
      b.indicateur || null, b.cible || null, b.origine || null, qui(req)).lastInsertRowid;
  db.prepare(`INSERT INTO action_suivi (action_id, par, par_id, avancement, statut, texte) VALUES (?,?,?,0,'a_faire','Action ouverte.')`)
    .run(id, qui(req), req.user?.id ?? null);
  res.status(201).json({ ok: true, id: Number(id) });
});

/* CORRIGER LA DESCRIPTION D'UNE ACTION (intitulé, responsable, échéance…) — l'avancement et le
   statut, eux, ne se posent que par un point de suivi : c'est lui qui laisse la trace. */
r.put('/actions/:id', authRequired, roleRequired(...ECRIVAINS), (req, res) => {
  const a = db.prepare(`SELECT * FROM action WHERE id = ? AND demarche = 'qualite'`).get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Action introuvable.' });
  if (!peutEcrire(req, a)) return res.status(403).json({ error: 'Action hors de votre périmètre.' });
  const b = { ...a, ...req.body };
  const souci = verifier(b); if (souci) return res.status(400).json({ error: souci });
  const per = b.perimetre === 'section' ? 'section' : 'institution';
  if (!peutEcrire(req, { perimetre: per, section: per === 'section' ? b.section : null })) return res.status(403).json({ error: 'Action hors de votre périmètre.' });
  db.prepare(`UPDATE action SET titre = ?, description = ?, responsable_user_id = ?, responsable_libre = ?, date_due = ?, priorite = ?,
      critere = ?, perimetre = ?, section = ?, indicateur = ?, cible = ?, origine = ?, maj_par = ?, maj_le = datetime('now') WHERE id = ?`)
    .run(String(b.titre).trim(), b.description || null, b.responsable_user_id || null, b.responsable_libre || null, b.date_due || null,
      b.priorite || 'normale', b.critere || null, per, per === 'section' ? b.section : null, b.indicateur || null, b.cible || null,
      b.origine || null, qui(req), a.id);
  res.json({ ok: true });
});

/* UN POINT DE SUIVI : ce qui a été fait, l'avancement, le statut — en ajout seul. Abandonner
   se motive ; « fait » porte l'avancement à 100. */
r.post('/actions/:id/suivi', authRequired, roleRequired(...ECRIVAINS), (req, res) => {
  const a = db.prepare(`SELECT * FROM action WHERE id = ? AND demarche = 'qualite'`).get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Action introuvable.' });
  if (!peutEcrire(req, a)) return res.status(403).json({ error: 'Action hors de votre périmètre.' });
  const texte = String(req.body?.texte || '').trim();
  if (texte.length < 3) return res.status(400).json({ error: 'Un point de suivi dit ce qui a été fait ou constaté.' });
  const statut = STATUTS.includes(req.body?.statut) ? req.body.statut : (a.statut === 'a_faire' ? 'en_cours' : a.statut);
  let av = req.body?.avancement == null || req.body.avancement === '' ? a.avancement : Math.round(Number(req.body.avancement));
  if (!Number.isFinite(av) || av < 0 || av > 100) return res.status(400).json({ error: 'Avancement attendu entre 0 et 100 %.' });
  if (statut === 'fait') av = 100;
  db.transaction(() => {
    db.prepare('INSERT INTO action_suivi (action_id, par, par_id, avancement, statut, texte) VALUES (?,?,?,?,?,?)')
      .run(a.id, qui(req), req.user?.id ?? null, av, statut, texte);
    db.prepare(`UPDATE action SET statut = ?, avancement = ?, fait_le = ?, motif_abandon = ?, maj_par = ?, maj_le = datetime('now') WHERE id = ?`)
      .run(statut, av, statut === 'fait' ? new Date().toISOString().slice(0, 10) : null, statut === 'abandonne' ? texte : null, qui(req), a.id);
  })();
  res.json({ ok: true, statut, avancement: av });
});

export default r;

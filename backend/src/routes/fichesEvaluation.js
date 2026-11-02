// ─────────────────────────────────────────────────────────────────────────────
// LES FICHES D'ÉVALUATION — TFE ET STAGES (3.5.079, Charles, 2 novembre 2026 : « cette fiche doit être paramétrable en
// ligne par la coordination TFE ou cursus ou la personne en charge des TFE ; de même pour les stages » ; tranché : la
// coordination de la section ET un ou plusieurs responsables désignés ; dans Organisation → TFE / Stages, face « Fiches » ;
// pour un stage, autant de fiches que le dispositif en demande — lieu de stage, superviseur…).
//
// Une FICHE = une évaluation « par acquis » du carnet du cours qui la porte (ex. 264.2 pour l'épreuve intégrée) : son nom,
// qui la remplit, quand, et ses CRITÈRES — un acquis, son poids, et ce qu'on y regarde (la consigne lue par qui note).
// Enregistrer la fiche écrit l'évaluation du carnet ; la note suit donc le chemin habituel (carnet → feuille de notes →
// délibération) et rien ne change au calcul. Une fiche qui porte déjà des notes ne se supprime pas et ne perd pas un acquis
// noté (règles du carnet).
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { estEpreuveIntegree } from './acquis.js';
import { acquisDuCours } from './mesCours.js';
import { migrerCarnet } from '../lib/carnet.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
export const REMPLI_PAR = {
  tfe: { promoteur: 'Le promoteur', copromoteur: 'Le copromoteur', lecteur: 'Le lecteur', president: 'Le président du jury', jury: 'Le jury, de commun accord (encodé par le promoteur)' },
  stage: { superviseur: 'Le professeur de stage (superviseur)', maitre_stage: 'Le maître de stage (lieu de stage)', etudiant: 'L’étudiant (auto-évaluation)' },
};

export function migrerFiches(dbx = db) {
  migrerCarnet(dbx);
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS fiche_responsable (id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL,
      domaine TEXT NOT NULL CHECK (domaine IN ('tfe','stage')), utilisateur_id INTEGER NOT NULL, pose_par TEXT, pose_le TEXT DEFAULT (datetime('now')),
      UNIQUE (section, domaine, utilisateur_id));
    CREATE TABLE IF NOT EXISTS fiche_modele (id INTEGER PRIMARY KEY AUTOINCREMENT, annee_scolaire TEXT NOT NULL,
      domaine TEXT NOT NULL CHECK (domaine IN ('tfe','stage')), ue_num INTEGER NOT NULL, cours_code TEXT NOT NULL,
      intitule TEXT NOT NULL, rempli_par TEXT NOT NULL, moment TEXT, sur REAL NOT NULL DEFAULT 20, poids REAL NOT NULL DEFAULT 1,
      ordre INTEGER NOT NULL DEFAULT 0, evaluation_id INTEGER, cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')), modifie_par TEXT, modifie_le TEXT);
    CREATE INDEX IF NOT EXISTS idx_fiche_modele ON fiche_modele(annee_scolaire, domaine, ue_num);
    CREATE TABLE IF NOT EXISTS fiche_critere (fiche_id INTEGER NOT NULL, aa_code TEXT NOT NULL, poids REAL NOT NULL DEFAULT 1,
      consigne TEXT, ordre INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (fiche_id, aa_code));
  `);
}

const qui = req => req.user?.email || req.user?.nom || null;
const nomUE = ue => db.prepare('SELECT ue_nom, section FROM ue WHERE ue_num = ? ORDER BY annee_scolaire DESC LIMIT 1').get(ue) || {};

/** Les UE du domaine pour l'année : l'épreuve intégrée (TFE) ou les UE qui ont un cours de stage. */
function uesDuDomaine(domaine, annee) {
  if (domaine === 'tfe') {
    return db.prepare('SELECT DISTINCT ue_num, section FROM ue WHERE annee_scolaire = ?').all(annee).filter(u => estEpreuveIntegree(u.ue_num, annee));
  }
  return db.prepare(`SELECT DISTINCT u.ue_num, u.section FROM ue u WHERE u.annee_scolaire = ?
    AND EXISTS (SELECT 1 FROM cours c WHERE c.ue_num = u.ue_num AND COALESCE(c.is_stage, 0) = 1)`).all(annee);
}
const responsablesDe = (section, domaine) => db.prepare(`SELECT r.utilisateur_id, lucie_nom_compte(u.nom_complet, u.email) AS nom FROM fiche_responsable r
  JOIN utilisateur u ON u.id = r.utilisateur_id WHERE r.section = ? AND r.domaine = ? ORDER BY nom`).all(section, domaine);

/** Qui règle les fiches d'une section : la direction, la coordination de la section, les responsables désignés. */
export function peutRegler(user, section, domaine) {
  if (DIRECTION.includes(user?.role)) return true;
  if (user?.role === 'coordination') { const p = getUserSections(user); if (!p || p.includes(section)) return true; }
  return !!db.prepare('SELECT 1 FROM fiche_responsable WHERE section = ? AND domaine = ? AND utilisateur_id = ?').get(section, domaine, user?.id);
}
const peutDesigner = (user, section) => DIRECTION.includes(user?.role)
  || (user?.role === 'coordination' && (() => { const p = getUserSections(user); return !p || p.includes(section); })());

function lireFiches(annee, domaine, ues) {
  const nums = ues.map(u => u.ue_num);
  if (!nums.length) return [];
  const fiches = db.prepare(`SELECT * FROM fiche_modele WHERE annee_scolaire = ? AND domaine = ? AND ue_num IN (${nums.map(() => '?').join(',')})
    ORDER BY ue_num, ordre, id`).all(annee, domaine, ...nums);
  const crit = db.prepare('SELECT aa_code, poids, consigne FROM fiche_critere WHERE fiche_id = ? ORDER BY ordre, aa_code');
  const notees = db.prepare('SELECT COUNT(*) n FROM carnet_note WHERE evaluation_id = ?');
  return fiches.map(f => ({ ...f, criteres: crit.all(f.id), notees: f.evaluation_id ? notees.get(f.evaluation_id).n : 0 }));
}

r.get('/', authRequired, (req, res) => {
  const annee = String(req.query.annee || ''), domaine = req.query.domaine === 'stage' ? 'stage' : 'tfe';
  if (!annee) return res.status(400).json({ error: 'année requise' });
  const toutes = uesDuDomaine(domaine, annee);
  const ues = toutes.filter(u => peutRegler(req.user, u.section, domaine) || DIRECTION.includes(req.user?.role));
  const sections = [...new Set(ues.map(u => u.section).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  res.json({
    annee, domaine, rempli_par: REMPLI_PAR[domaine],
    ues: ues.map(u => ({ ue_num: u.ue_num, section: u.section, ue_nom: nomUE(u.ue_num).ue_nom || '',
      cours: db.prepare(`SELECT cours_code, cours_nom FROM cours WHERE ue_num = ? AND annee_scolaire = ? ORDER BY cours_code`).all(u.ue_num, annee)
        .map(c => ({ ...c, acquis: acquisDuCours(c.cours_code, u.ue_num, annee) })) })),
    fiches: lireFiches(annee, domaine, ues),
    sections: sections.map(s => ({ section: s, responsables: responsablesDe(s, domaine), peut_designer: peutDesigner(req.user, s) })),
    comptes: sections.some(s => peutDesigner(req.user, s))
      ? db.prepare(`SELECT id, lucie_nom_compte(nom_complet, email) AS nom, role FROM utilisateur WHERE COALESCE(actif, 1) = 1 ORDER BY nom`).all() : [],
  });
});

/** Les responsables d'une section pour le domaine : on renvoie la liste entière. */
r.put('/responsables', authRequired, (req, res) => {
  const { section, domaine, ids } = req.body || {};
  if (!section || !['tfe', 'stage'].includes(domaine) || !Array.isArray(ids)) return res.status(400).json({ error: 'section, domaine et ids requis' });
  if (!peutDesigner(req.user, section)) return res.status(403).json({ error: 'La direction ou la coordination de la section désigne les responsables.' });
  db.transaction(() => {
    db.prepare('DELETE FROM fiche_responsable WHERE section = ? AND domaine = ?').run(section, domaine);
    const ins = db.prepare('INSERT OR IGNORE INTO fiche_responsable (section, domaine, utilisateur_id, pose_par) VALUES (?,?,?,?)');
    for (const id of ids.map(Number).filter(Boolean)) ins.run(section, domaine, id, qui(req));
  })();
  res.json({ ok: true });
});

/** Une fiche proposée par l'écran, vérifiée contre l'UE et les acquis du cours qui la porte. */
function lireFiche(b, annee, domaine) {
  const ue = Number(b?.ue_num);
  const u = uesDuDomaine(domaine, annee).find(x => x.ue_num === ue);
  if (!u) return { erreur: domaine === 'tfe' ? 'Cette UE n’est pas une épreuve intégrée cette année.' : 'Cette UE n’a pas de cours de stage cette année.' };
  const cours = String(b?.cours_code || '');
  if (!db.prepare('SELECT 1 FROM cours WHERE cours_code = ? AND ue_num = ? AND annee_scolaire = ?').get(cours, ue, annee)) return { erreur: 'Choisissez le cours qui porte la note.' };
  const intitule = String(b?.intitule || '').trim();
  if (!intitule || intitule.length > 80) return { erreur: 'Une fiche se nomme (« Écrit », « Oral », « Fiche du lieu de stage »…), 80 caractères au plus.' };
  if (!REMPLI_PAR[domaine][b?.rempli_par]) return { erreur: 'Dites qui remplit la fiche.' };
  const sur = Number(String(b?.sur ?? 20).replace(',', '.'));
  if (!(sur > 0 && sur <= 100)) return { erreur: 'Le maximum est un nombre entre 1 et 100.' };
  const poids = Number(String(b?.poids ?? 1).replace(',', '.'));
  if (!(poids >= 0 && poids <= 100)) return { erreur: 'Le poids est un nombre entre 0 et 100.' };
  const codes = new Set(acquisDuCours(cours, ue, annee).map(a => a.aa_code));
  const criteres = (Array.isArray(b?.criteres) ? b.criteres : []).map((c, i) => ({ aa_code: String(c?.aa_code || ''),
    poids: Number(String(c?.poids ?? 1).replace(',', '.')), consigne: String(c?.consigne || '').trim().slice(0, 500) || null, ordre: i }));
  if (!criteres.length) return { erreur: 'Une fiche évalue au moins un acquis.' };
  const etr = criteres.filter(c => !codes.has(c.aa_code));
  if (etr.length) return { erreur: `Acquis inconnu(s) pour le cours ${cours} : ${etr.map(c => c.aa_code).join(', ')}.` };
  if (criteres.some(c => !(c.poids > 0 && c.poids <= 100))) return { erreur: 'Le poids d’un acquis est un nombre positif.' };
  return { ue, section: u.section, cours, intitule, rempli_par: b.rempli_par, moment: String(b?.moment || '').trim().slice(0, 120) || null, sur, poids, criteres };
}

/** La fiche et son évaluation du carnet, écrites ensemble. */
function ecrireCarnet(f, annee, nom, ancienne = null) {
  const lien = db.prepare('INSERT INTO carnet_evaluation_aa (evaluation_id, aa_code, poids) VALUES (?,?,?)');
  let evId = ancienne?.evaluation_id && db.prepare('SELECT id FROM carnet_evaluation WHERE id = ?').get(ancienne.evaluation_id)?.id;
  if (evId) {
    db.prepare(`UPDATE carnet_evaluation SET cours_code = ?, ue_num = ?, intitule = ?, sur = ?, poids = ?, par_acquis = 1, modifie_par = ?, modifie_le = datetime('now') WHERE id = ?`)
      .run(f.cours, f.ue, f.intitule, f.sur, f.poids, nom, evId);
    db.prepare('DELETE FROM carnet_evaluation_aa WHERE evaluation_id = ?').run(evId);
  } else {
    const ordre = (db.prepare('SELECT MAX(ordre) m FROM carnet_evaluation WHERE annee_scolaire = ? AND cours_code = ?').get(annee, f.cours)?.m ?? 0) + 1;
    evId = db.prepare(`INSERT INTO carnet_evaluation (annee_scolaire, cours_code, ue_num, intitule, sur, poids, session, ordre, cree_par, par_acquis)
      VALUES (?,?,?,?,?,?,1,?,?,1)`).run(annee, f.cours, f.ue, f.intitule, f.sur, f.poids, ordre, nom).lastInsertRowid;
  }
  for (const c of f.criteres) lien.run(evId, c.aa_code, c.poids);
  return evId;
}

r.post('/fiche', authRequired, (req, res) => {
  const annee = String(req.body?.annee || ''), domaine = req.body?.domaine === 'stage' ? 'stage' : 'tfe';
  const f = lireFiche(req.body, annee, domaine);
  if (f.erreur) return res.status(400).json({ error: f.erreur });
  if (!peutRegler(req.user, f.section, domaine)) return res.status(403).json({ error: 'La coordination de la section ou un responsable désigné règle ces fiches.' });
  const id = db.transaction(() => {
    const evId = ecrireCarnet(f, annee, qui(req));
    const ordre = (db.prepare('SELECT MAX(ordre) m FROM fiche_modele WHERE annee_scolaire = ? AND domaine = ? AND ue_num = ?').get(annee, domaine, f.ue)?.m ?? 0) + 1;
    const nid = db.prepare(`INSERT INTO fiche_modele (annee_scolaire, domaine, ue_num, cours_code, intitule, rempli_par, moment, sur, poids, ordre, evaluation_id, cree_par)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(annee, domaine, f.ue, f.cours, f.intitule, f.rempli_par, f.moment, f.sur, f.poids, ordre, evId, qui(req)).lastInsertRowid;
    const ic = db.prepare('INSERT INTO fiche_critere (fiche_id, aa_code, poids, consigne, ordre) VALUES (?,?,?,?,?)');
    for (const c of f.criteres) ic.run(nid, c.aa_code, c.poids, c.consigne, c.ordre);
    return nid;
  })();
  res.json({ ok: true, id });
});

r.put('/fiche/:id', authRequired, (req, res) => {
  const a = db.prepare('SELECT * FROM fiche_modele WHERE id = ?').get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Fiche introuvable.' });
  const f = lireFiche({ ...req.body, ue_num: a.ue_num }, a.annee_scolaire, a.domaine);
  if (f.erreur) return res.status(400).json({ error: f.erreur });
  if (!peutRegler(req.user, f.section, a.domaine)) return res.status(403).json({ error: 'La coordination de la section ou un responsable désigné règle ces fiches.' });
  if (a.evaluation_id) {
    // Les règles du carnet : un acquis déjà noté ne se retire pas ; le maximum ne descend pas sous une note donnée ; une fiche
    // notée ne change pas de cours.
    const garde = new Set(f.criteres.map(c => c.aa_code));
    const orph = db.prepare('SELECT DISTINCT aa_code FROM carnet_note_aa WHERE evaluation_id = ?').all(a.evaluation_id).filter(x => !garde.has(x.aa_code));
    if (orph.length) return res.status(409).json({ error: `Des notes existent pour ${orph.map(x => x.aa_code).join(', ')} : on ne retire pas ces acquis.` });
    const trop = db.prepare('SELECT COUNT(*) n FROM carnet_note_aa WHERE evaluation_id = ? AND points > ?').get(a.evaluation_id, f.sur).n;
    if (trop) return res.status(409).json({ error: `${trop} note(s) dépassent ${f.sur} : le maximum ne descend pas sous elles.` });
    if (f.cours !== a.cours_code && db.prepare('SELECT COUNT(*) n FROM carnet_note WHERE evaluation_id = ?').get(a.evaluation_id).n) {
      return res.status(409).json({ error: 'Cette fiche porte déjà des notes : elle ne change pas de cours.' });
    }
  }
  db.transaction(() => {
    const evId = ecrireCarnet(f, a.annee_scolaire, qui(req), a);
    db.prepare(`UPDATE fiche_modele SET cours_code = ?, intitule = ?, rempli_par = ?, moment = ?, sur = ?, poids = ?, evaluation_id = ?,
      modifie_par = ?, modifie_le = datetime('now') WHERE id = ?`).run(f.cours, f.intitule, f.rempli_par, f.moment, f.sur, f.poids, evId, qui(req), a.id);
    db.prepare('DELETE FROM fiche_critere WHERE fiche_id = ?').run(a.id);
    const ic = db.prepare('INSERT INTO fiche_critere (fiche_id, aa_code, poids, consigne, ordre) VALUES (?,?,?,?,?)');
    for (const c of f.criteres) ic.run(a.id, c.aa_code, c.poids, c.consigne, c.ordre);
  })();
  res.json({ ok: true });
});

r.delete('/fiche/:id', authRequired, (req, res) => {
  const a = db.prepare('SELECT * FROM fiche_modele WHERE id = ?').get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Fiche introuvable.' });
  if (!peutRegler(req.user, nomUE(a.ue_num).section, a.domaine)) return res.status(403).json({ error: 'La coordination de la section ou un responsable désigné règle ces fiches.' });
  if (a.evaluation_id && db.prepare('SELECT COUNT(*) n FROM carnet_note WHERE evaluation_id = ?').get(a.evaluation_id).n) {
    return res.status(409).json({ error: 'Cette fiche porte déjà des notes : elle ne se supprime pas.' });
  }
  db.transaction(() => {
    if (a.evaluation_id) {
      db.prepare('DELETE FROM carnet_evaluation_aa WHERE evaluation_id = ?').run(a.evaluation_id);
      db.prepare('DELETE FROM carnet_evaluation WHERE id = ?').run(a.evaluation_id);
    }
    db.prepare('DELETE FROM fiche_critere WHERE fiche_id = ?').run(a.id);
    db.prepare('DELETE FROM fiche_modele WHERE id = ?').run(a.id);
  })();
  res.json({ ok: true });
});

export default r;

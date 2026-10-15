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
    -- LE JURY (3.1.378) : promoteur, copromoteur, lecteur, auditeur, président. Une personne du
    -- personnel quand Lucie la reconnaît ; sinon le nom tel que le fichier l'écrit, à rattacher.
    CREATE TABLE IF NOT EXISTS tfe_membre (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tfe_id        INTEGER NOT NULL,
      role          TEXT NOT NULL,
      professeur_id INTEGER,
      nom_libre     TEXT,
      ordre         INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tfe_membre ON tfe_membre(tfe_id);
    `);
    for (const c of ['heure_defense TEXT', 'section TEXT', 'origine TEXT']) { try { dbx.exec(`ALTER TABLE tfe ADD COLUMN ${c}`); } catch { /* déjà là */ } }
    // Le promoteur de 3.1.366 rejoint le jury.
    try {
      dbx.exec(`INSERT INTO tfe_membre (tfe_id, role, professeur_id)
        SELECT t.id, 'promoteur', t.promoteur_id FROM tfe t WHERE t.promoteur_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM tfe_membre m WHERE m.tfe_id = t.id AND m.role = 'promoteur')`);
    } catch { /* */ }
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

export const ROLES_JURY = ['promoteur', 'copromoteur', 'lecteur', 'auditeur', 'president'];
// Préparée à l'usage : la table naît à la migration, après le chargement de ce module.
const membresDe = { all: id => db.prepare(`SELECT m.role, m.professeur_id, m.nom_libre,
    (SELECT UPPER(p.nom) || ' ' || COALESCE(p.prenom, '') FROM professeur p WHERE p.id = m.professeur_id) AS nom
  FROM tfe_membre m WHERE m.tfe_id = ? ORDER BY m.ordre, m.id`).all(id) };
function poserMembres(tfeId, membres) {
  db.prepare('DELETE FROM tfe_membre WHERE tfe_id = ?').run(tfeId);
  const ins = db.prepare('INSERT INTO tfe_membre (tfe_id, role, professeur_id, nom_libre, ordre) VALUES (?,?,?,?,?)');
  (membres || []).forEach((m, i) => {
    if (!ROLES_JURY.includes(m.role) || (!m.professeur_id && !String(m.nom_libre || '').trim())) return;
    ins.run(tfeId, m.role, m.professeur_id ? Number(m.professeur_id) : null, m.professeur_id ? null : String(m.nom_libre).trim(), i);
  });
  const promo = (membres || []).find(m => m.role === 'promoteur' && m.professeur_id);
  db.prepare('UPDATE tfe SET promoteur_id = ? WHERE id = ?').run(promo ? Number(promo.professeur_id) : null, tfeId);
}

r.get('/etudiant/:id', authRequired, (req, res) => {
  const etudId = Number(req.params.id);
  if (!permis(req, etudId)) return res.status(404).json({ error: 'Étudiant introuvable' });
  const liste = db.prepare(`
    SELECT t.*,
      (SELECT ue_nom FROM ue u WHERE u.ue_num = t.ue_num ORDER BY (u.annee_scolaire = t.annee_scolaire) DESC, u.annee_scolaire DESC LIMIT 1) AS ue_nom,
      (SELECT UPPER(p.nom) || ' ' || COALESCE(p.prenom, '') FROM professeur p WHERE p.id = t.promoteur_id) AS promoteur
    FROM tfe t WHERE t.etudiant_id = ? ORDER BY t.annee_scolaire DESC, t.id DESC`).all(etudId);
  for (const t of liste) t.membres = membresDe.all(t.id);
  res.json(liste);
});

function valeurs(b) {
  return {
    annee_scolaire: propre(b.annee_scolaire), ue_num: b.ue_num ? Number(b.ue_num) : null, titre: propre(b.titre),
    promoteur_id: b.promoteur_id ? Number(b.promoteur_id) : null,
    date_depot: propre(b.date_depot), date_defense: propre(b.date_defense), remarques: propre(b.remarques),
    heure_defense: propre(b.heure_defense),
  };
}

r.post('/', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const etudId = Number(req.body.etudiant_id);
  if (!etudId || !permis(req, etudId)) return res.status(404).json({ error: 'Étudiant introuvable' });
  const v = valeurs(req.body);
  if (!v.titre) return res.status(400).json({ error: 'Le titre du TFE est obligatoire.' });
  if (!v.annee_scolaire) return res.status(400).json({ error: "L'année est obligatoire." });
  const id = db.prepare(`INSERT INTO tfe (etudiant_id, annee_scolaire, ue_num, titre, promoteur_id, date_depot, date_defense, heure_defense, remarques, cree_par, maj_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(etudId, v.annee_scolaire, v.ue_num, v.titre, v.promoteur_id, v.date_depot, v.date_defense, v.heure_defense, v.remarques, auteur(req), auteur(req)).lastInsertRowid;
  if (Array.isArray(req.body.membres)) poserMembres(id, req.body.membres);
  res.json({ id });
});

r.put('/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const t = db.prepare('SELECT * FROM tfe WHERE id = ?').get(Number(req.params.id));
  if (!t || !permis(req, t.etudiant_id)) return res.status(404).json({ error: 'TFE introuvable' });
  const v = valeurs({ ...t, ...req.body });
  if (!v.titre) return res.status(400).json({ error: 'Le titre du TFE est obligatoire.' });
  db.prepare(`UPDATE tfe SET annee_scolaire = ?, ue_num = ?, titre = ?, promoteur_id = ?, date_depot = ?, date_defense = ?, heure_defense = ?, remarques = ?,
    maj_par = ?, maj_le = datetime('now') WHERE id = ?`)
    .run(v.annee_scolaire || t.annee_scolaire, v.ue_num, v.titre, v.promoteur_id, v.date_depot, v.date_defense, v.heure_defense, v.remarques, auteur(req), t.id);
  if (Array.isArray(req.body.membres)) poserMembres(t.id, req.body.membres);
  res.json({ ok: true });
});

r.delete('/:id', authRequired, roleRequired(...ECRITURE), (req, res) => {
  const t = db.prepare('SELECT * FROM tfe WHERE id = ?').get(Number(req.params.id));
  if (!t || !permis(req, t.etudiant_id)) return res.status(404).json({ error: 'TFE introuvable' });
  db.prepare('DELETE FROM tfe_membre WHERE tfe_id = ?').run(t.id);
  db.prepare('DELETE FROM tfe WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

/* L'IMPORT DES TFE (3.1.378, Charles, 15 octobre 2026 : « je souhaite importer des données de TFE » —
 * une liste TIM nom + titre, un tableau d'optométrie avec promoteur, les plannings de défense de
 * psychomotricité avec tout le jury). L'écran lit le fichier et remet des lignes ; le serveur retrouve
 * l'étudiant (nom, puis prénom ou son initiale), le jury dans le personnel (nom, ou initiales :
 * « AVdH », « LR »), et pose ou complète le TFE de l'année. Un nom de jury non reconnu reste en texte,
 * signalé. Simulation d'abord ; rien n'est écrasé par un vide. */
const norme = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const TITRES_CIVILS = /^(m|mr|mme|mlle|mrs|monsieur|madame|dr|pr)$/;
export function trouverProf(texte, profs) {
  const brut = String(texte || '').trim();
  if (!brut || /^x+$/i.test(brut)) return { libre: null };
  const mots = norme(brut).split(' ').filter(w => w && !TITRES_CIVILS.test(w));
  const s = ` ${mots.join(' ')} `;
  if (!mots.length) return { libre: brut };
  // Le nom de famille entier, et le prénom ou son initiale s'il est donné.
  let c = profs.filter(p => p.n && s.includes(` ${p.n} `));
  if (c.length > 1) {
    const reste = mots.filter(w => !c[0].n.split(' ').includes(w));
    const parPrenom = c.filter(p => reste.some(w => p.p && (p.p === w || p.p.startsWith(w) || p.p[0] === w[0])));
    if (parPrenom.length) c = parPrenom;
  } else if (c.length === 1) {
    const reste = mots.filter(w => !c[0].n.split(' ').includes(w));
    if (reste.length && c[0].p && !reste.some(w => c[0].p.startsWith(w) || w.startsWith(c[0].p) || c[0].p[0] === w[0])) c = [];
  }
  // Les initiales seules (« AVdH », « LR ») : un mot de 2 à 5 lettres.
  // « Vander Heyden » pour « VAN DER HEYDEN » : le nom sans ses espaces.
  if (!c.length) { const colle = mots.join(''); c = profs.filter(p => p.n.length >= 5 && colle.includes(p.n.replace(/ /g, ''))); }
  const sigle = mots.length === 1 ? mots[0] : mots.every(w => w.length <= 3) ? mots.join('') : '';   // « AVdH », « A VdH », « LR »
  if (!c.length && /^[a-z]{2,5}$/.test(sigle)) c = profs.filter(p => p.i === sigle);
  return c.length === 1 ? { id: c[0].id, nom: c[0].affiche } : { libre: brut, ambigu: c.length > 1 };
}
export function trouverEtudiant(l, etus) {
  let nom = norme(l.nom), prenom = norme(l.prenom);
  if (!prenom) {
    // « ABDELLAOUI Kenza » : les mots en capitales sont le nom ; « Golfinopoulos N » : l'initiale suit.
    const mots = String(l.nom || '').trim().split(/\s+/);
    const caps = mots.filter(w => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
    if (caps.length && caps.length < mots.length) { nom = norme(caps.join(' ')); prenom = norme(mots.filter(w => !caps.includes(w)).join(' ')); }
    else if (mots.length > 1 && /^[A-Za-zÀ-ÿ]\.?$/.test(mots.at(-1))) { nom = norme(mots.slice(0, -1).join(' ')); prenom = norme(mots.at(-1)); }
  }
  if (!nom) return { erreur: 'nom absent' };
  let c = etus.filter(e => e.n === nom);
  if (!c.length) c = etus.filter(e => e.n.startsWith(nom + ' ') || nom.startsWith(e.n + ' ') || e.n.replace(/ /g, '') === nom.replace(/ /g, ''));
  if (prenom && c.length > 1) {
    const p1 = prenom.split(' ')[0];
    const f = c.filter(e => e.p === prenom || e.p.startsWith(p1) || (p1.length === 1 && e.p[0] === p1));
    if (f.length) c = f;
  } else if (prenom && c.length === 1) {
    const p1 = prenom.split(' ')[0];
    if (!(c[0].p === prenom || c[0].p.startsWith(p1) || p1.startsWith(c[0].p.split(' ')[0]) || (p1.length === 1 && c[0].p[0] === p1))) c = [];
  }
  if (c.length > 1 && l.section) { const ns = norme(l.section); const f = c.filter(e => norme(e.s).startsWith(ns)); if (f.length) c = f; }
  if (c.length > 1) { const f = c.filter(e => e.actif); if (f.length === 1) c = f; }
  if (c.length === 1) return { id: c[0].id, nom: c[0].affiche };
  return { erreur: c.length ? `${c.length} étudiants possibles` : 'étudiant introuvable' };
}

r.post('/import', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'), (req, res) => {
  const { annee, lignes, simulation = true, section = null, origine = null } = req.body || {};
  if (!annee || !Array.isArray(lignes) || !lignes.length) return res.status(400).json({ error: 'année et lignes requises' });
  const profs = db.prepare('SELECT id, nom, prenom FROM professeur WHERE COALESCE(est_a_designer, 0) = 0').all().map(p => ({
    id: p.id, n: norme(p.nom), p: norme(p.prenom), affiche: `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim(),
    i: norme(`${p.prenom || ''} ${p.nom || ''}`).split(' ').filter(Boolean).map(w => w[0]).join(''),
  }));
  const etus = db.prepare(`SELECT e.id, e.nom, e.prenom, e.section_rattachement s,
      EXISTS (SELECT 1 FROM etudiant_inscription i WHERE i.etudiant_id = e.id AND i.annee_scolaire = ?) AS actif
    FROM etudiant e WHERE COALESCE(e.sortie_statut, '') <> 'archive'`).all(annee)
    .map(e => ({ ...e, n: norme(e.nom), p: norme(e.prenom), affiche: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim() }));
  const perim = getUserSections(req.user);
  const rapport = { simulation: !!simulation, crees: 0, completes: 0, inchanges: 0, ignores: [], jury_libre: [], details: [] };
  const ecrire = db.transaction(() => {
    lignes.forEach((l, k) => {
      const titre = propre(l.titre);
      const e = trouverEtudiant({ ...l, section: l.section || section }, etus);
      if (!e.id) { rapport.ignores.push({ ligne: k + 1, nom: [l.nom, l.prenom].filter(Boolean).join(' '), raison: e.erreur }); return; }
      if (perim && !permis(req, e.id)) { rapport.ignores.push({ ligne: k + 1, nom: e.nom, raison: 'hors de votre périmètre' }); return; }
      const membres = [];
      for (const role of ROLES_JURY) {
        for (const morceau of String(l[role] || '').split(/\s*[;/]\s*|\s+et\s+/).filter(x => x.trim())) {
          const m = trouverProf(morceau, profs);
          if (m.id) membres.push({ role, professeur_id: m.id, affiche: m.nom });
          else if (m.libre) { membres.push({ role, nom_libre: m.libre, affiche: `« ${m.libre} »` }); rapport.jury_libre.push({ nom: e.nom, role, texte: m.libre, ambigu: !!m.ambigu }); }
        }
      }
      const anneeL = propre(l.annee) && /^\d{4}-\d{4}$/.test(String(l.annee).trim()) ? String(l.annee).trim() : annee;
      const ex = db.prepare('SELECT * FROM tfe WHERE etudiant_id = ? AND annee_scolaire = ? ORDER BY id LIMIT 1').get(e.id, anneeL);
      const d = { nom: e.nom, annee: anneeL, titre: titre || ex?.titre || null, jury: membres.map(m => `${m.role} ${m.affiche}`).join(' · ') };
      if (!ex) {
        if (!titre) { rapport.ignores.push({ ligne: k + 1, nom: e.nom, raison: 'sans titre' }); return; }
        rapport.crees++; rapport.details.push({ ...d, action: 'créé' });
        if (simulation) return;
        const id = db.prepare(`INSERT INTO tfe (etudiant_id, annee_scolaire, titre, date_defense, heure_defense, section, origine, cree_par, maj_par)
          VALUES (?,?,?,?,?,?,?,?,?)`).run(e.id, anneeL, titre, propre(l.date_defense), propre(l.heure), etus.find(x => x.id === e.id)?.s || section, origine, auteur(req), auteur(req)).lastInsertRowid;
        if (membres.length) poserMembres(id, membres);
        return;
      }
      // Compléter sans écraser : un champ vide du fichier ne vide rien ; le jury s'ajoute rôle par rôle.
      const deja = membresDe.all(ex.id);
      const rolesNouveaux = new Set(membres.map(m => m.role));
      const fusion = [...deja.filter(m => !rolesNouveaux.has(m.role)), ...membres];
      const change = (titre && titre !== ex.titre) || (propre(l.date_defense) && propre(l.date_defense) !== ex.date_defense)
        || (propre(l.heure) && propre(l.heure) !== ex.heure_defense) || membres.length;
      if (!change) { rapport.inchanges++; rapport.details.push({ ...d, action: 'inchangé' }); return; }
      rapport.completes++; rapport.details.push({ ...d, action: 'complété' });
      if (simulation) return;
      db.prepare(`UPDATE tfe SET titre = COALESCE(?, titre), date_defense = COALESCE(?, date_defense), heure_defense = COALESCE(?, heure_defense),
        maj_par = ?, maj_le = datetime('now') WHERE id = ?`).run(titre, propre(l.date_defense), propre(l.heure), auteur(req), ex.id);
      if (membres.length) poserMembres(ex.id, fusion);
    });
  });
  ecrire();
  res.json(rapport);
});

export default r;

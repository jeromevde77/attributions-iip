/**
 * suiviEtudiant.js — LE DOSSIER DE SUIVI DE L'ÉTUDIANT.
 *
 * Demandé par Jérôme (29 septembre 2026) : « pouvoir prendre des notes et des
 * informations dans le dossier de l'étudiant. Comme pour les enseignants.
 * Évidemment, c'est confidentiel […] Seuls ses enseignants, la coordination
 * et la direction sont au courant. Des notes de suivi, des rapports, des
 * documents… un vrai dossier. »
 *
 * LA CONFIDENTIALITÉ NE SE POSE PAS PAR MODULE, ELLE SE POSE PAR ÉTUDIANT :
 * un compte qui lit « étudiants » (une consultation, un secrétariat) ne doit
 * PAS lire ces notes. La porte est donc SANS module — comme « mes-cours » —
 * et CHAQUE route vérifie elle-même le lien avec l'étudiant :
 *
 *   - la direction (admin, directeur, directeur adjoint) ;
 *   - la coordination dont le périmètre couvre la section de l'étudiant ;
 *   - SES enseignants : une attribution dans une UE où il est inscrit.
 *
 * Personne d'autre — et la route le refuse, elle ne se contente pas de
 * cacher un onglet.
 *
 * CE QUI S'ÉCRIT RESTE SIGNÉ ET DATÉ. L'effacement appartient à l'auteur de
 * la note ou à la direction : une note de suivi engage celui qui l'écrit.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections, NIVEAU_DIRECTION } from '../middleware/auth.js';
import { sectionRattachement } from './etudiants.js';
import multer from 'multer';
import { mkdirSync } from 'fs';
import { join, resolve } from 'path';

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const r = Router();

export function migrerSuiviEtudiant(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS etudiant_suivi (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      etudiant_id   INTEGER NOT NULL,
      type          TEXT NOT NULL DEFAULT 'note',   -- note | rapport | document
      titre         TEXT,
      texte         TEXT,
      fichier       TEXT,                           -- chemin sur disque (documents)
      nom_fichier   TEXT,                           -- nom d'origine, pour le téléchargement
      cree_par      TEXT,
      cree_par_id   INTEGER,
      cree_par_role TEXT,
      cree_le       TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_suivi_etud ON etudiant_suivi(etudiant_id);
    `);
  } catch (e) { console.error('[migration] etudiant_suivi :', e.message); }
}

/* QUI VOIT LE DOSSIER DE CET ÉTUDIANT — la règle, écrite une fois. */
function peutVoirSuivi(user, etudId) {
  if (!user) return false;
  if (NIVEAU_DIRECTION.includes(user.role)) return true;

  // La coordination : sa section couvre celle de l'étudiant.
  if (user.role === 'coordination') {
    const perim = getUserSections(user);            // null = toutes
    if (perim === null) return true;
    const { section } = sectionRattachement(etudId) || {};
    if (section && perim.includes(section)) return true;
    // À défaut de rattachement posé, ses inscriptions font foi.
    const marks = perim.map(() => '?').join(',');
    if (perim.length && db.prepare(`
      SELECT 1 FROM etudiant_inscription i
      JOIN ue u ON u.ue_num = i.ue_num AND u.annee_scolaire = i.annee_scolaire
      WHERE i.etudiant_id = ? AND u.section IN (${marks}) LIMIT 1
    `).get(etudId, ...perim)) return true;
    return false;
  }

  // Un enseignant : une attribution dans une UE où l'étudiant est inscrit.
  const profId = db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?')
    .get(user.id)?.professeur_id || null;
  if (profId) {
    return !!db.prepare(`
      SELECT 1 FROM attribution a
      JOIN etudiant_inscription i
        ON i.ue_num = a.ue_num AND i.annee_scolaire = a.annee_scolaire
      WHERE a.professeur_id = ? AND i.etudiant_id = ? LIMIT 1
    `).get(profId, etudId);
  }
  return false;
}

function garde(req, res, next) {
  const etudId = parseInt(req.params.etudiantId ?? req._suiviEtudId, 10);
  if (!Number.isFinite(etudId)) return res.status(400).json({ error: 'étudiant requis' });
  if (!peutVoirSuivi(req.user, etudId)) {
    return res.status(403).json({
      error: 'Dossier confidentiel : réservé aux enseignants de cet étudiant, '
           + 'à la coordination de sa section et à la direction.',
    });
  }
  req._suiviEtudId = etudId;
  next();
}

// Pièces : rangées par étudiant, comme les recours par personne.
const stockage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = join(DATA_DIR, 'suivi-etudiants', String(req._suiviEtudId));
    mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    cb(null, `${ts}_${file.originalname.replace(/[^\w\s.\-()]/g, '_')}`);
  },
});
const upload = multer({ storage: stockage, limits: { fileSize: 20 * 1024 * 1024 } });

// ── Lire le dossier ──────────────────────────────────────────────────────────
r.get('/:etudiantId', authRequired, garde, (req, res) => {
  migrerSuiviEtudiant(db);
  const notes = db.prepare(`
    SELECT id, type, titre, texte, nom_fichier, cree_par, cree_par_role, cree_le,
           cree_par_id
    FROM etudiant_suivi WHERE etudiant_id = ? ORDER BY cree_le DESC, id DESC
  `).all(req._suiviEtudId);
  res.json({
    notes: notes.map(n => ({
      ...n,
      // L'effacement appartient à l'auteur ou à la direction — l'écran le sait
      // sans deviner.
      effacable: NIVEAU_DIRECTION.includes(req.user.role) || n.cree_par_id === req.user.id,
    })),
  });
});

// ── Écrire une note ou un rapport ────────────────────────────────────────────
r.post('/:etudiantId', authRequired, garde, (req, res) => {
  migrerSuiviEtudiant(db);
  const type = ['note', 'rapport'].includes(req.body?.type) ? req.body.type : 'note';
  const texte = String(req.body?.texte || '').trim();
  const titre = String(req.body?.titre || '').trim() || null;
  if (!texte) return res.status(400).json({ error: 'La note est vide.' });
  const info = db.prepare(`
    INSERT INTO etudiant_suivi (etudiant_id, type, titre, texte, cree_par, cree_par_id, cree_par_role)
    VALUES (?,?,?,?,?,?,?)
  `).run(req._suiviEtudId, type, titre, texte,
         req.user.nom || req.user.email || null, req.user.id || null, req.user.role || null);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// ── Joindre un document ──────────────────────────────────────────────────────
r.post('/:etudiantId/document', authRequired, garde, upload.single('fichier'), (req, res) => {
  migrerSuiviEtudiant(db);
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  const info = db.prepare(`
    INSERT INTO etudiant_suivi (etudiant_id, type, titre, fichier, nom_fichier,
                                cree_par, cree_par_id, cree_par_role)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(req._suiviEtudId, 'document',
         String(req.body?.titre || '').trim() || req.file.originalname,
         req.file.path, req.file.originalname,
         req.user.nom || req.user.email || null, req.user.id || null, req.user.role || null);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// ── Télécharger une pièce — la garde se rejoue sur l'étudiant de la pièce ────
r.get('/piece/:id', authRequired, (req, res) => {
  const n = db.prepare('SELECT * FROM etudiant_suivi WHERE id = ?').get(req.params.id);
  if (!n || !n.fichier) return res.status(404).json({ error: 'Pièce introuvable.' });
  req._suiviEtudId = n.etudiant_id;
  if (!peutVoirSuivi(req.user, n.etudiant_id)) {
    return res.status(403).json({ error: 'Dossier confidentiel.' });
  }
  // Le chemin vient de la base, pas de l'URL — mais on le borne quand même.
  const chemin = resolve(n.fichier);
  if (!chemin.startsWith(resolve(join(DATA_DIR, 'suivi-etudiants')))) {
    return res.status(404).json({ error: 'Pièce introuvable.' });
  }
  res.download(chemin, n.nom_fichier || 'document');
});

// ── Effacer : l'auteur, ou la direction ──────────────────────────────────────
r.delete('/:etudiantId/:id', authRequired, garde, (req, res) => {
  const n = db.prepare('SELECT * FROM etudiant_suivi WHERE id = ? AND etudiant_id = ?')
    .get(req.params.id, req._suiviEtudId);
  if (!n) return res.status(404).json({ error: 'Note introuvable.' });
  if (!NIVEAU_DIRECTION.includes(req.user.role) && n.cree_par_id !== req.user.id) {
    return res.status(403).json({ error: "Seuls l'auteur de la note et la direction peuvent l'effacer." });
  }
  db.prepare('DELETE FROM etudiant_suivi WHERE id = ?').run(n.id);
  res.json({ ok: true });
});

export default r;

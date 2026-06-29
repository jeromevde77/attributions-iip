import { Router } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();
const DATA_DIR = process.env.DATA_DIR || '/app/data';

db.exec(`CREATE TABLE IF NOT EXISTS procedure_fichier (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  procedure_id INTEGER NOT NULL REFERENCES procedure_archive(id) ON DELETE CASCADE,
  categorie TEXT, nom TEXT, chemin TEXT, taille INTEGER,
  cree_par TEXT, cree_le TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pf_proc ON procedure_fichier(procedure_id);`);

function peutEcrire(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  try {
    const row = db.prepare('SELECT permissions_json FROM utilisateur WHERE id = ?').get(user.id);
    const pj = row && row.permissions_json ? JSON.parse(row.permissions_json) : {};
    return !!(pj.listes && pj.listes.ecrire);
  } catch { return false; }
}
const ecritureRequise = (req, res, next) =>
  peutEcrire(req.user) ? next() : res.status(403).json({ error: 'Écriture réservée (permission Listes requise)' });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = join(DATA_DIR, 'disciplinaire', String(req.params.id));
    try { mkdirSync(dir, { recursive: true }); } catch {}
    cb(null, dir);
  },
  filename(req, file, cb) { cb(null, Date.now() + '_' + file.originalname.replace(/[^\w.\-]+/g, '_')); },
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// Upsert d'un dossier (auto-save)
r.post('/save', authRequired, ecritureRequise, (req, res) => {
  const { id, annee, etudiant, section, payload, statut } = req.body;
  if (id) {
    const ex = db.prepare("SELECT id FROM procedure_archive WHERE id = ? AND type = 'disciplinaire'").get(id);
    if (!ex) return res.status(404).json({ error: 'Dossier introuvable' });
    db.prepare(`UPDATE procedure_archive SET etudiant=?, section=?, annee_scolaire=?, payload_json=?, statut=COALESCE(?,statut), modifie_le=datetime('now') WHERE id=?`)
      .run(etudiant || null, section || null, annee || null, JSON.stringify(payload || {}), statut || null, id);
    return res.json({ id });
  }
  const ins = db.prepare(`INSERT INTO procedure_archive (type, statut, etudiant, section, annee_scolaire, payload_json, cree_par)
    VALUES ('disciplinaire', ?, ?, ?, ?, ?, ?)`)
    .run(statut || 'en_cours', etudiant || null, section || null, annee || null, JSON.stringify(payload || {}), req.user && req.user.email || null);
  res.json({ id: ins.lastInsertRowid });
});

r.get('/cases', authRequired, (req, res) => {
  res.json(db.prepare("SELECT id, etudiant, section, annee_scolaire, statut, cree_le, modifie_le FROM procedure_archive WHERE type='disciplinaire' ORDER BY modifie_le DESC").all());
});

r.get('/cases/:id', authRequired, (req, res) => {
  const c = db.prepare("SELECT * FROM procedure_archive WHERE id=? AND type='disciplinaire'").get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Introuvable' });
  const fichiers = db.prepare('SELECT id, categorie, nom, taille, cree_le FROM procedure_fichier WHERE procedure_id=? ORDER BY cree_le DESC').all(c.id);
  res.json({ ...c, payload: c.payload_json ? JSON.parse(c.payload_json) : {}, fichiers });
});

r.delete('/cases/:id', authRequired, ecritureRequise, (req, res) => {
  const c = db.prepare("SELECT id FROM procedure_archive WHERE id=? AND type='disciplinaire'").get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Introuvable' });
  for (const f of db.prepare('SELECT chemin FROM procedure_fichier WHERE procedure_id=?').all(c.id)) { try { unlinkSync(f.chemin); } catch {} }
  db.prepare('DELETE FROM procedure_fichier WHERE procedure_id=?').run(c.id);
  db.prepare('DELETE FROM procedure_archive WHERE id=?').run(c.id);
  res.json({ ok: true });
});

r.post('/cases/:id/fichiers', authRequired, ecritureRequise, upload.single('fichier'), (req, res) => {
  const c = db.prepare("SELECT id FROM procedure_archive WHERE id=? AND type='disciplinaire'").get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Dossier introuvable' });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
  const ins = db.prepare('INSERT INTO procedure_fichier (procedure_id, categorie, nom, chemin, taille, cree_par) VALUES (?,?,?,?,?,?)')
    .run(c.id, req.body.categorie || 'document', req.file.originalname, req.file.path, req.file.size, req.user && req.user.email || null);
  res.json({ id: ins.lastInsertRowid, nom: req.file.originalname, taille: req.file.size, categorie: req.body.categorie || 'document' });
});

r.get('/fichiers/:fid/download', authRequired, (req, res) => {
  const f = db.prepare('SELECT * FROM procedure_fichier WHERE id=?').get(req.params.fid);
  if (!f || !existsSync(f.chemin)) return res.status(404).json({ error: 'Fichier introuvable' });
  res.download(f.chemin, f.nom);
});

r.delete('/fichiers/:fid', authRequired, ecritureRequise, (req, res) => {
  const f = db.prepare('SELECT * FROM procedure_fichier WHERE id=?').get(req.params.fid);
  if (!f) return res.status(404).json({ error: 'Introuvable' });
  try { unlinkSync(f.chemin); } catch {}
  db.prepare('DELETE FROM procedure_fichier WHERE id=?').run(f.id);
  res.json({ ok: true });
});

export default r;

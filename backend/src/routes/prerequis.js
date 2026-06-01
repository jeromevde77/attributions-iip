/**
 * prerequis.js — Gestion des prérequis entre UE et disponibilités des profs
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// ─── PRÉREQUIS UE ─────────────────────────────────────────────────────────────

// GET /prerequis/ue?section=&annee=
r.get('/ue', authRequired, (req, res) => {
  const { section, annee } = req.query;
  let sql = 'SELECT * FROM ue_prerequis WHERE 1=1';
  const params = [];
  if (section) { sql += ' AND (section = ? OR section IS NULL)'; params.push(section); }
  if (annee)   { sql += ' AND (annee_scolaire = ? OR annee_scolaire IS NULL)'; params.push(annee); }
  sql += ' ORDER BY ue_num, prerequis_num';
  res.json(db.prepare(sql).all(...params));
});

// POST /prerequis/ue — ajouter un prérequis
r.post('/ue', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { ue_num, prerequis_num, section, annee_scolaire } = req.body;
  if (!ue_num || !prerequis_num) return res.status(400).json({ error: 'ue_num et prerequis_num requis' });
  if (ue_num === prerequis_num) return res.status(400).json({ error: 'Une UE ne peut pas être son propre prérequis' });
  try {
    const info = db.prepare(`
      INSERT OR IGNORE INTO ue_prerequis (ue_num, prerequis_num, section, annee_scolaire)
      VALUES (?,?,?,?)
    `).run(ue_num, prerequis_num, section || null, annee_scolaire || null);
    res.json({ ok: true, created: info.changes > 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /prerequis/ue/:id
r.delete('/ue/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const row = db.prepare('SELECT id FROM ue_prerequis WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Prérequis introuvable' });
  db.prepare('DELETE FROM ue_prerequis WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// GET /prerequis/ue/:ue_num/graphe?section= — retourne les prérequis directs + transitifs
r.get('/ue/:ue_num/graphe', authRequired, (req, res) => {
  const { section } = req.query;
  const ueNum = Number(req.params.ue_num);
  // Tous les prérequis pour cette section
  const tous = db.prepare(`
    SELECT ue_num, prerequis_num FROM ue_prerequis
    WHERE (section = ? OR section IS NULL)
  `).all(section || '');
  // Tri topologique simple pour trouver tous les ancêtres de ue_num
  const graph = {};
  for (const { ue_num, prerequis_num } of tous) {
    if (!graph[ue_num]) graph[ue_num] = [];
    graph[ue_num].push(prerequis_num);
  }
  function ancetres(num, visited = new Set()) {
    if (visited.has(num)) return visited;
    visited.add(num);
    for (const p of (graph[num] || [])) ancetres(p, visited);
    return visited;
  }
  const anc = ancetres(ueNum);
  anc.delete(ueNum);
  res.json({ ue_num: ueNum, prerequis_transitifs: [...anc] });
});

// ─── CRÉNEAUX ────────────────────────────────────────────────────────────────

r.get('/creneaux', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM creneau ORDER BY ordre').all());
});

// ─── DISPONIBILITÉS PROFS ────────────────────────────────────────────────────

// GET /prerequis/disponibilites/:prof_id
r.get('/disponibilites/:prof_id', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT pd.*, c.heure_debut, c.heure_fin, c.label AS creneau_label, c.ordre
    FROM prof_disponibilite pd
    JOIN creneau c ON c.id = pd.creneau_id
    WHERE pd.professeur_id = ?
    ORDER BY pd.quadrimestre, pd.jour, c.ordre
  `).all(req.params.prof_id);
  res.json(rows);
});

// PUT /prerequis/disponibilites/:prof_id — remplace toutes les dispos d'un prof/quadrimestre
r.put('/disponibilites/:prof_id', authRequired, (req, res) => {
  const { quadrimestre, dispos } = req.body;
  // dispos = [{ jour: 1, creneau_id: 1, disponible: 1 }, ...]
  if (!quadrimestre || !Array.isArray(dispos))
    return res.status(400).json({ error: 'quadrimestre et dispos[] requis' });
  const profId = Number(req.params.prof_id);
  const upsert = db.transaction(() => {
    db.prepare('DELETE FROM prof_disponibilite WHERE professeur_id = ? AND quadrimestre = ?').run(profId, quadrimestre);
    const ins = db.prepare(`INSERT INTO prof_disponibilite (professeur_id, quadrimestre, jour, creneau_id, disponible) VALUES (?,?,?,?,?)`);
    for (const d of dispos) {
      if (d.disponible) ins.run(profId, quadrimestre, d.jour, d.creneau_id, 1);
    }
  });
  upsert();
  res.json({ ok: true });
});

// GET /prerequis/disponibilites — toutes les dispos (pour le planificateur)
r.get('/disponibilites', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT pd.professeur_id, pd.quadrimestre, pd.jour, pd.creneau_id, pd.disponible,
           p.nom, p.prenom, c.heure_debut, c.heure_fin, c.ordre
    FROM prof_disponibilite pd
    JOIN professeur p ON p.id = pd.professeur_id
    JOIN creneau c ON c.id = pd.creneau_id
    ORDER BY p.nom, pd.quadrimestre, pd.jour, c.ordre
  `).all();
  res.json(rows);
});

export default r;

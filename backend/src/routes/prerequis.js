/**
 * prerequis.js — Gestion des prérequis entre UE et disponibilités des profs
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { AGENDA_HEURES } from '../lib/simulationHoraire.js';

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
// Le graphe des prérequis est du référentiel : sa modification est réservée
// aux administrateurs, un éditeur ne pouvant l'altérer par inadvertance.
r.post('/ue', authRequired, roleRequired('admin'), (req, res) => {
  const { ue_num, prerequis_num, section, annee_scolaire , type, motif } = req.body;
  if (!ue_num || !prerequis_num) return res.status(400).json({ error: 'ue_num et prerequis_num requis' });
  if (ue_num === prerequis_num) return res.status(400).json({ error: 'Une UE ne peut pas être son propre prérequis' });

  // Détection de cycle : si l'UE candidate au rôle de prérequis dépend déjà,
  // directement ou non, de celle qu'on veut conditionner, le lien rendrait les
  // deux UE inaccessibles à jamais.
  // Seuls les liens LÉGAUX peuvent former un cycle bloquant : un lien interne
  // avertit sans interdire, il ne rend donc jamais une UE inaccessible.
  const liens = db.prepare(
    "SELECT ue_num, prerequis_num FROM ue_prerequis WHERE COALESCE(type,'legal') = 'legal'"
  ).all();
  const parents = {};
  for (const l of liens) (parents[l.ue_num] = parents[l.ue_num] || []).push(l.prerequis_num);
  const remonte = (depart) => {
    const vus = new Set(), pile = [depart];
    while (pile.length) {
      const n = pile.pop();
      if (vus.has(n)) continue;
      vus.add(n);
      for (const p of (parents[n] || [])) pile.push(p);
    }
    return vus;
  };
  if (remonte(Number(prerequis_num)).has(Number(ue_num))) {
    return res.status(400).json({
      error: `Lien refusé : l'UE ${prerequis_num} dépend déjà de l'UE ${ue_num}. `
           + `Ce lien formerait un cycle, rendant les deux unités inaccessibles.`,
    });
  }

  try {
    const nature = type === 'interne' ? 'interne' : 'legal';
    const info = db.prepare(`
      INSERT OR IGNORE INTO ue_prerequis (ue_num, prerequis_num, section, annee_scolaire, type, motif)
      VALUES (?,?,?,?,?,?)
    `).run(ue_num, prerequis_num, section || null, annee_scolaire || null, nature, motif || null);
    res.json({ ok: true, created: info.changes > 0, type: nature });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /prerequis/ue/:id
r.delete('/ue/:id', authRequired, roleRequired('admin'), (req, res) => {
  const row = db.prepare('SELECT id FROM ue_prerequis WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Prérequis introuvable' });
  db.prepare('DELETE FROM ue_prerequis WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// DELETE /prerequis/ue — suppression par paire, le schéma ne connaissant
// que les deux extrémités du lien
r.delete('/ue', authRequired, roleRequired('admin'), (req, res) => {
  const ue = Number(req.query.ue_num), pre = Number(req.query.prerequis_num);
  if (!ue || !pre) return res.status(400).json({ error: 'ue_num et prerequis_num requis' });
  const info = db.prepare(
    'DELETE FROM ue_prerequis WHERE ue_num = ? AND prerequis_num = ?'
  ).run(ue, pre);
  res.json({ ok: true, supprimes: info.changes });
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

// GET /prerequis/disponibilites/:prof_id — l'agenda de l'enseignant, commun à toutes les sections
r.get('/disponibilites/:prof_id', authRequired, (req, res) => {
  const rows = db.prepare('SELECT quadrimestre, jour, heure, valeur FROM prof_agenda WHERE professeur_id = ?').all(req.params.prof_id);
  res.json({ heures: AGENDA_HEURES, cases: rows });
});

// PUT /prerequis/disponibilites/:prof_id — remplace l'agenda d'un quadrimestre.
// Saisi par le secrétariat, la coordination ou la direction (Charles, 10 octobre 2026) — pas par chacun.
r.put('/disponibilites/:prof_id', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const { quadrimestre, cases } = req.body || {};
  if (!['Q1', 'Q2'].includes(quadrimestre) || !Array.isArray(cases))
    return res.status(400).json({ error: 'quadrimestre (Q1 ou Q2) et cases[] requis' });
  const profId = Number(req.params.prof_id);
  db.transaction(() => {
    db.prepare('DELETE FROM prof_agenda WHERE professeur_id = ? AND quadrimestre = ?').run(profId, quadrimestre);
    const ins = db.prepare('INSERT OR REPLACE INTO prof_agenda (professeur_id, quadrimestre, jour, heure, valeur) VALUES (?,?,?,?,?)');
    // Le vert n'a pas besoin de ligne : seules l'orange et le rouge s'écrivent.
    for (const c of cases) {
      const v = Number(c.valeur), j = Number(c.jour);
      if (j >= 1 && j <= 6 && AGENDA_HEURES.includes(c.heure) && (v === 0 || v === 2)) ins.run(profId, quadrimestre, j, c.heure, v);
    }
  })();
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

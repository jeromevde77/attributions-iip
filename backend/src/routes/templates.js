import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// ─── CRUD templates ────────────────────────────────────────────────────────

r.get('/', authRequired, (req, res) => {
  res.json(db.prepare(`SELECT id, nom, description, entites, cree_par, cree_le, modifie_le
    FROM document_template ORDER BY modifie_le DESC`).all());
});

r.get('/:id', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM document_template WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template introuvable' });
  res.json(t);
});

r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nom, description, contenu, entites } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  const info = db.prepare(`INSERT INTO document_template (nom, description, contenu, entites, cree_par)
    VALUES (?,?,?,?,?)`).run(nom, description||null, contenu||'', JSON.stringify(entites||[]),
    req.user?.email || req.user?.identifiant || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

r.patch('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nom, description, contenu, entites } = req.body;
  const t = db.prepare('SELECT 1 FROM document_template WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template introuvable' });
  const updates = []; const params = {};
  if (nom       !== undefined) { updates.push('nom = @nom');             params.nom = nom; }
  if (description!==undefined) { updates.push('description = @desc');   params.desc = description; }
  if (contenu   !== undefined) { updates.push('contenu = @contenu');     params.contenu = contenu; }
  if (entites   !== undefined) { updates.push('entites = @entites');     params.entites = JSON.stringify(entites); }
  if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
  updates.push("modifie_le = datetime('now')");
  db.prepare(`UPDATE document_template SET ${updates.join(', ')} WHERE id = @id`)
    .run({ ...params, id: req.params.id });
  res.json({ ok: true });
});

r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM document_template WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Génération : remplace les champs par les vraies données ────────────────
r.post('/:id/generer', authRequired, async (req, res) => {
  const t = db.prepare('SELECT * FROM document_template WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template introuvable' });

  const { prof_id, ue_num, annee } = req.body;
  const vars = {};

  // Établissement
  const etab = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {};
  Object.entries(etab).forEach(([k,v]) => { vars[`etab.${k}`] = v ?? ''; });

  // Professeur
  if (prof_id) {
    const p = db.prepare('SELECT * FROM professeur WHERE id = ?').get(prof_id) || {};
    Object.entries(p).forEach(([k,v]) => { vars[`prof.${k}`] = v ?? ''; });
    vars['prof.lieu_naissance'] = [p.lieu_naissance_ville, p.lieu_naissance_pays].filter(Boolean).join(', ');
    vars['prof.domicile'] = [p.adresse_rue, [p.code_postal, p.commune].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }

  // UE
  if (ue_num && annee) {
    const u = db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee) || {};
    Object.entries(u).forEach(([k,v]) => { vars[`ue.${k}`] = v ?? ''; });
  }

  // Système
  const now = new Date();
  vars['sys.date'] = now.toLocaleDateString('fr-BE');
  vars['sys.annee'] = annee || '';
  vars['sys.date_iso'] = now.toISOString().split('T')[0];

  // Substitution dans le HTML
  let html = t.contenu;
  for (const [key, val] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, String(val));
  }
  // Champs non résolus → placeholder vide
  html = html.replace(/\{\{[^}]+\}\}/g, '<span style="background:#fff3cd;padding:0 2px">___</span>');

  res.json({ html, nom: t.nom });
});

export default r;

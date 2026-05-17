import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

r.get('/', authRequired, roleRequired('admin'), (req, res) => {
  res.json(db.prepare(`
    SELECT id, email, nom_complet, role, actif, created_at, last_login_at
    FROM utilisateur ORDER BY nom_complet
  `).all());
});

r.post('/', authRequired, roleRequired('admin'), (req, res) => {
  const { email, password, nom_complet, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  if (!['admin', 'editeur', 'consultation'].includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO utilisateur (email, password_hash, nom_complet, role, actif)
      VALUES (?, ?, ?, ?, 1)
    `).run(email, hash, nom_complet || email, role);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Email déjà utilisé' });
    throw e;
  }
});

r.patch('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const { nom_complet, role, actif, password } = req.body || {};
  const updates = [];
  const params = { id: req.params.id };
  if (nom_complet !== undefined) { updates.push('nom_complet = @nom_complet'); params.nom_complet = nom_complet; }
  if (role !== undefined) {
    if (!['admin', 'editeur', 'consultation'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
    updates.push('role = @role'); params.role = role;
  }
  if (actif !== undefined) { updates.push('actif = @actif'); params.actif = actif ? 1 : 0; }
  if (password) {
    updates.push('password_hash = @hash');
    params.hash = bcrypt.hashSync(password, 10);
  }
  if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
  db.prepare(`UPDATE utilisateur SET ${updates.join(', ')} WHERE id = @id`).run(params);
  res.json({ ok: true });
});

r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Impossible de supprimer son propre compte' });
  }
  db.prepare('DELETE FROM utilisateur WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default r;

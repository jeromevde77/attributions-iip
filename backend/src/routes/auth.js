import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { signToken, authRequired } from '../middleware/auth.js';

const r = Router();

r.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = db.prepare('SELECT * FROM utilisateur WHERE email = ? AND actif = 1').get(email);
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

  db.prepare('UPDATE utilisateur SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  const token = signToken(user);
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, nom: user.nom_complet } });
});

r.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

export default r;

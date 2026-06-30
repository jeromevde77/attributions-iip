import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/index.js';
import { signToken, authRequired, peutValiderAttributions } from '../middleware/auth.js';

const r = Router();

// ── Route demo-login (DEMO_MODE uniquement) ───────────────────────────────────
r.post('/demo-login', (req, res) => {
  if (process.env.DEMO_MODE !== 'true')
    return res.status(403).json({ error: 'Mode démo non activé' });

  const secret = process.env.JWT_SECRET || 'change-me';
  const token = jwt.sign(
    { id: 9999, email: 'demo@lucie-app.be', role: 'admin', nom: 'Visiteur Démo', is_demo: true },
    secret, { expiresIn: '24h' }
  );
  res.json({
    token,
    user: { id: 9999, email: 'demo@lucie-app.be', role: 'admin', nom: 'Visiteur Démo', is_demo: true },
  });
});

r.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = db.prepare('SELECT * FROM utilisateur WHERE email = ? AND actif = 1').get(email);
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });

  db.prepare('UPDATE utilisateur SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
  const token = signToken(user);
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, nom: user.nom_complet,
    acces_recrutement: user.acces_recrutement ? 1 : 0, peut_valider: peutValiderAttributions(user) } });
});

r.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

export default r;

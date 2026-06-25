import jwt from 'jsonwebtoken';

const DEMO_USER = {
  id: 9999,
  email: 'demo@lucie-app.be',
  nom_complet: 'Visiteur Démo',
  role: 'admin',
  actif: 1,
  is_demo: true,
};

/**
 * En mode DEMO_MODE=true :
 * - GET /api/auth/me retourne l'utilisateur démo
 * - Toutes les routes authRequired acceptent automatiquement un token démo
 * - Les routes d'écriture (POST/PATCH/PUT/DELETE) sont interceptées et retournent
 *   une réponse fictive sans toucher à la DB — sauf reset
 */
export function demoAutoLogin(req, res, next) {
  if (process.env.DEMO_MODE !== 'true') return next();
  // Injecter l'utilisateur démo dans req
  req.user = DEMO_USER;
  next();
}

export function demoTokenMiddleware(req, res, next) {
  if (process.env.DEMO_MODE !== 'true') return next();
  // Accepter n'importe quel token ou absence de token
  req.user = req.user || DEMO_USER;
  next();
}

export function demoWriteGuard(req, res, next) {
  if (process.env.DEMO_MODE !== 'true') return next();
  const method = req.method.toUpperCase();
  // Laisser passer les lectures
  if (method === 'GET') return next();
  // Laisser passer le reset si prévu
  if (req.path.includes('/demo-reset')) return next();
  // Simuler un succès pour toutes les écritures sans toucher à la DB
  return res.json({ ok: true, demo: true, message: 'Mode démo — modification non persistée' });
}

export function generateDemoToken(secret) {
  return jwt.sign({ id: DEMO_USER.id, role: 'admin', is_demo: true }, secret, { expiresIn: '24h' });
}

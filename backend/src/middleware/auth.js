import jwt from 'jsonwebtoken';
import db from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-prod';

export function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

export function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }
    next();
  };
}

/**
 * Retourne la liste des codes de sections autorisés pour un utilisateur.
 * - admin / editeur : null (= toutes les sections, pas de restriction)
 * - coordination : tableau des sections autorisées (peut être vide)
 */
export function getUserSections(user) {
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'editeur') return null; // pas de restriction
  const rows = db.prepare('SELECT section_code FROM utilisateur_section WHERE utilisateur_id = ?').all(user.id);
  return rows.map(r => r.section_code);
}

/**
 * Middleware : attache req.allowedSections (null = toutes, [] ou liste = restreint).
 * À utiliser sur les routes d'attributions pour le filtrage par périmètre.
 */
export function withSectionScope(req, res, next) {
  req.allowedSections = getUserSections(req.user);
  next();
}

/**
 * Vérifie qu'une section donnée est dans le périmètre de l'utilisateur.
 * Renvoie true si autorisé (admin/editeur toujours true).
 */
export function canAccessSection(user, section) {
  const allowed = getUserSections(user);
  if (allowed === null) return true;        // admin/editeur
  return allowed.includes(section);
}

export function peutValiderAttributions(user) {
  if (!user) return 0;
  if (user.role === 'admin') return 1;
  try {
    const pj = user.permissions_json ? JSON.parse(user.permissions_json) : {};
    return pj?.attributions?.valider ? 1 : 0;
  } catch { return 0; }
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, nom: user.nom_complet,
      acces_recrutement: user.acces_recrutement ? 1 : 0,
      peut_valider: peutValiderAttributions(user) },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

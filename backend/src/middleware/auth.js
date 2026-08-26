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
    // Mode aperçu ("voir comme") : token en lecture seule
    if (req.user.preview && req.method !== 'GET') {
      return res.status(403).json({ error: 'Mode aperçu (voir comme) — lecture seule. Revenez à votre compte pour modifier.' });
    }
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
 * - admin : null (accès illimité)
 * - tous les autres rôles : filtré par utilisateur_section SI des sections
 *   y sont configurées, sinon null (accès à toutes les sections).
 *
 * Cette règle est role-agnostique : qu'un utilisateur soit stocké comme
 * 'editeur' ou 'coordination' n'a pas d'importance — seule la présence
 * de lignes dans utilisateur_section détermine le périmètre.
 */
export function getUserSections(user) {
  if (!user) return [];
  if (user.role === 'admin') return null; // admin : toujours sans restriction
  const rows = db.prepare('SELECT section_code FROM utilisateur_section WHERE utilisateur_id = ?').all(user.id);
  if (rows.length === 0) return null; // pas de sections configurées → accès à tout
  return rows.map(r => r.section_code); // sections configurées → filtrage appliqué
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

// 'coordination' est un alias historique d''editeur'. Le contrôle des droits
// (roleRequired) ne connaît que 'admin', 'editeur' et 'consultation' : sans
// cette normalisation, un utilisateur resté en 'coordination' perdrait
// silencieusement tout droit d'écriture. On normalise donc à la source, à la
// fabrication du jeton, quel que soit ce que porte la base.
export function normaliserRole(role) {
  return role === 'coordination' ? 'editeur' : role;
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: normaliserRole(user.role), nom: user.nom_complet,
      acces_recrutement: user.acces_recrutement ? 1 : 0,
      peut_valider: peutValiderAttributions(user) },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function signPreviewToken(target, admin) {
  return jwt.sign(
    { id: target.id, email: target.email, role: normaliserRole(target.role), nom: target.nom_complet,
      acces_recrutement: target.acces_recrutement ? 1 : 0,
      peut_valider: peutValiderAttributions(target),
      preview: true, imp_by: admin?.id || null, imp_by_nom: admin?.nom || null },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

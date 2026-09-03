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
    const role = req.user.role;
    if (roles.includes(role)) return next();

    // 'secretariat' est le nom actuel de ce que les routes appellent encore
    // 'editeur' : même niveau d'écriture, sans les référentiels.
    if (NIVEAU_DIRECTION.includes(role) && (roles.includes('admin') || roles.includes('editeur'))) return next();
    if (role === 'secretariat' && roles.includes('editeur')) return next();

    // Un coordinateur n'écrit jamais directement : ses modifications passent
    // par une demande. Les écrans qui savent la déposer le font eux-mêmes ;
    // les autres doivent le dire clairement plutôt que d'opposer un refus sec.
    if (role === 'coordination' && (roles.includes('editeur') || roles.includes('admin'))) {
      return res.status(403).json({
        error: "Cet écran ne sait pas encore transmettre vos modifications pour validation. "
             + "Signalez-le à la direction, qui les encodera.",
        validation_requise: true,
      });
    }

    return res.status(403).json({ error: 'Permissions insuffisantes' });
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
  if (NIVEAU_DIRECTION.includes(user.role)) return null;   // direction : sans restriction
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

/**
 * Interdit l'accès à un professeur hors du périmètre de la personne.
 *
 * CE MIDDLEWARE ÉTAIT IMPORTÉ TRENTE-DEUX FOIS ET N'EXISTAIT PAS. Un import
 * nommé absent vaut `undefined` ; Express l'ignore alors en silence, si bien
 * que toutes ces routes se croyaient protégées sans l'être. Une coordination
 * accédait donc aux dossiers de tout le personnel de l'Institut.
 *
 * Le rattachement d'un professeur à une section passe par ses ATTRIBUTIONS :
 * il n'existe pas de lien direct. Un professeur sans aucune attribution
 * n'appartient à aucune section — il reste alors réservé à la direction, ce
 * qui est le choix prudent pour des données de personnel.
 *
 * L'identifiant est cherché dans les endroits où les routes le placent :
 * :id, :profId, :professeur_id, puis le corps de la requête.
 */
/**
 * Ce professeur est-il dans le périmètre de la personne ?
 *
 * Version en FONCTION, pour filtrer une liste ou tester un cas particulier là
 * où un middleware ne convient pas. Elle était appelée dans dossierAdmin.js
 * sans exister : « undefined(...) » lève une TypeError et la route tombait.
 */
export function professeurDansPerimetre(user, profId) {
  const perim = getUserSections(user);
  if (perim === null) return true;            // direction
  if (!perim.length) return false;
  const id = Number(profId);
  if (!Number.isFinite(id)) return false;
  const ph = perim.map(() => '?').join(',');
  return !!db.prepare(`
    SELECT 1 FROM attribution
    WHERE professeur_id = ? AND section IN (${ph}) LIMIT 1
  `).get(id, ...perim);
}

export function exigerPerimetreProfesseur(req, res, next) {
  const perim = getUserSections(req.user);
  if (perim === null) return next();          // direction : sans restriction

  const brut = req.params?.id ?? req.params?.profId ?? req.params?.professeur_id
    ?? req.body?.professeur_id ?? req.query?.professeur_id;
  const profId = Number(brut);
  if (!Number.isFinite(profId)) {
    return res.status(400).json({ error: 'professeur non identifié' });
  }

  if (!perim.length) {
    return res.status(403).json({
      error: 'Aucune section ne vous est attribuée : les dossiers du personnel '
           + 'ne vous sont pas accessibles.',
    });
  }

  if (!professeurDansPerimetre(req.user, profId)) {
    // On ne dit pas si le professeur existe : ce serait déjà une information.
    return res.status(403).json({
      error: "Ce membre du personnel n'enseigne pas dans vos sections.",
    });
  }
  next();
}

export function peutValiderAttributions(user) {
  if (!user) return 0;
  if (user.role === 'admin') return 1;
  try {
    const pj = user.permissions_json ? JSON.parse(user.permissions_json) : {};
    return pj?.attributions?.valider ? 1 : 0;
  } catch { return 0; }
}

// 'coordination' était converti en 'editeur' à la fabrication du jeton, du
// temps où le contrôle des droits ne connaissait que trois rôles. Ce repli
// donnait à un coordinateur les pleins pouvoirs d'écriture et empêchait tout
// circuit de validation de se déclencher. Les rôles sont désormais distincts
// et gérés par le module des permissions ; seul le nom historique 'editeur'
// reste toléré, comme synonyme de secrétariat en écriture.
const ROLES_CONNUS = ['admin', 'directeur', 'directeur_adjoint', 'secretariat',
                      'editeur', 'coordination', 'professeur', 'consultation'];

// Directeur et directeur adjoint ont les droits d'un administrateur : la
// distinction sert à savoir qui a tranché, non à hiérarchiser.
const NIVEAU_DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];

export function normaliserRole(role) {
  return ROLES_CONNUS.includes(role) ? role : 'consultation';
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: normaliserRole(user.role), nom: user.nom_complet,
      acces_recrutement: user.acces_recrutement ? 1 : 0,
      permissions_json: user.permissions_json || null,
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

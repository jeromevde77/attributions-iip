import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-prod';

// La portée du jeton délivré ENTRE le mot de passe et le code à six chiffres.
// Écrite une fois, lue à la fabrication comme au contrôle : deux littéraux
// « mfa_pending » auraient fini par diverger d'une lettre, et le contrôle
// n'aurait plus rien contrôlé.
const SCOPE_MFA = 'mfa_pending';

export function authRequired(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);

    // LE JETON INTERMÉDIAIRE DU SECOND FACTEUR N'OUVRE AUCUNE ROUTE MÉTIER.
    //
    // C'est ICI que tient tout le dispositif, et nulle part ailleurs. Un jeton
    // délivré après le mot de passe mais avant le code est un jeton à moitié
    // authentifié : s'il passait cette porte, le second facteur ne serait
    // qu'un écran de plus à fermer. Le contrôle est posé sur la porte commune
    // plutôt que sur chaque route — trente-trois routes d'attribution nous ont
    // appris ce que coûte un filtre qu'il faut penser à poser.
    if (req.user.scope === SCOPE_MFA) {
      return res.status(401).json({
        error: 'Authentification incomplète : le code à six chiffres est attendu.',
        mfa_requis: true,
      });
    }

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
 * Les codes de sections autorisés, ou `null` quand il n'y a aucune restriction.
 *
 * RIEN N'EST ACCORDÉ QUI N'AIT ÉTÉ ATTRIBUÉ.
 *
 * L'absence de rattachement rendait `null`, c'est-à-dire TOUTES les sections :
 * un compte qu'on oubliait de rattacher — et aucun ne l'était — lisait tout
 * l'Institut. Un défaut permissif ne se voit jamais, parce que rien ne
 * manque : on n'a pas l'idée de vérifier des données qui s'affichent.
 *
 * « Toutes » se dit désormais, par `utilisateur.perimetre_toutes`, et couvre
 * les sections à venir ; l'absence de tout est donc l'absence d'accès.
 *
 * La règle reste indifférente au rôle — sauf la direction, qui répare les
 * erreurs de paramétrage et ne peut donc pas s'enfermer dehors.
 */
export function getUserSections(user) {
  if (!user) return [];
  if (NIVEAU_DIRECTION.includes(user.role)) return null;   // direction : sans restriction
  // Le jeton porte le rôle, pas le périmètre : on relit la ligne, sans quoi un
  // périmètre modifié n'aurait d'effet qu'à la reconnexion — trente jours.
  const u = db.prepare('SELECT perimetre_toutes FROM utilisateur WHERE id = ?').get(user.id);
  if (u?.perimetre_toutes) return null;                    // « toutes », explicitement
  const rows = db.prepare('SELECT section_code FROM utilisateur_section WHERE utilisateur_id = ?').all(user.id);
  return rows.map(r => r.section_code);                    // [] = aucune section, donc rien
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
 * LA CLAUSE DU PÉRIMÈTRE S'ÉCRIT UNE FOIS, ET C'EST TOUT LE PROPOS.
 *
 * Trois états, et le troisième n'existait pas avant qu'on ferme le défaut :
 *   null  → aucune restriction : pas de clause du tout
 *   [...] → ces sections-là
 *   []    → AUCUNE section, donc aucune ligne
 *
 * Chaque appelant improvisait le sien, et les trois façons de se tromper se
 * trouvaient toutes dans le dépôt :
 *   `if (perim)` puis `IN (${perim.map(...)})` — une liste vide produit
 *   « IN () », que SQLite refuse : la route tombe en 500.
 *   `if (perim.length)` — la clause n'est pas posée, donc TOUT est rendu.
 *   `sections?.length ? filtre : ''` — le même fail-open, écrit autrement.
 *
 * Les deux derniers sont les pires : ils ne se voient pas. Une liste complète
 * se lit « cette personne a bien accès », et l'on décide là-dessus.
 *
 * @returns {{ sql: string, params: string[] }} — `sql` vaut '' quand il n'y a
 *   rien à filtrer ; il s'ajoute sinon à un WHERE avec un AND.
 */
export function clauseSections(sections, colonne) {
  if (sections === null || sections === undefined) return { sql: '', params: [] };
  if (!sections.length) return { sql: '1 = 0', params: [] };
  return {
    sql: `${colonne} IN (${sections.map(() => '?').join(',')})`,
    params: [...sections],
  };
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
export const NIVEAU_DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];

/**
 * Middleware : réservé au niveau direction.
 *
 * `roleRequired('admin')` aurait fermé la porte au directeur et à son adjoint,
 * qui en ont pourtant les droits partout ailleurs — ils seraient passés par le
 * repli de roleRequired, ce qui marche mais dit le contraire de ce qu'on veut
 * exprimer. Quand une décision appartient à la DIRECTION et non à
 * l'administrateur technique, c'est ce middleware-ci qui le dit.
 */
export function niveauDirection(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
  if (!NIVEAU_DIRECTION.includes(req.user.role)) {
    return res.status(403).json({ error: 'Réservé à la direction.' });
  }
  next();
}

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

/**
 * LE JETON INTERMÉDIAIRE : cinq minutes, une seule portée, aucun droit.
 *
 * Il ne porte ni rôle, ni permissions, ni périmètre — uniquement de quoi
 * savoir QUI est en train de finir de se connecter. Recopier le rôle « pour
 * que le front l'affiche » aurait suffi à en faire un jeton utilisable : ce
 * qu'un jeton porte finit toujours par être lu quelque part.
 *
 * Cinq minutes, parce que c'est le temps de prendre son téléphone, pas celui
 * d'aller déjeuner en laissant la moitié d'une session ouverte.
 */
export function signPendingToken(user) {
  // `jti` — un identifiant propre à CE laissez-passer. Il sert à compter les
  // essais de code qui s'y rattachent : sans lui, deux jetons délivrés dans la
  // même seconde au même compte se confondraient, et le compteur porterait sur
  // les deux à la fois.
  return jwt.sign({ id: user.id, email: user.email, scope: SCOPE_MFA, jti: crypto.randomUUID() },
                  JWT_SECRET, { expiresIn: '5m' });
}

/** Relit un jeton intermédiaire. Rend null pour tout ce qui n'en est pas un. */
export function verifyPendingToken(token) {
  try {
    const p = jwt.verify(String(token || ''), JWT_SECRET);
    return p?.scope === SCOPE_MFA ? p : null;
  } catch { return null; }
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

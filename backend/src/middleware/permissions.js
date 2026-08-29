// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Permissions par module
//
// Jusqu'ici, les cases cochées dans « Accès Lucie » ne faisaient que masquer
// des onglets : qui connaissait l'adresse d'une route écrivait malgré une
// permission refusée. Ce module les rend contraignantes côté serveur.
//
// Cinq rôles, chacun avec un sens propre :
//
//   directeur          — décide de tout, tranche les demandes de validation
//   directeur_adjoint  — mêmes droits, même pouvoir de validation
//   admin              — compte technique, sans fiche : prestataire extérieur
//   secretariat        — lit partout, ÉCRIT sur les étudiants, produit les documents
//   coordination       — encode pour ses sections, sous validation d'un directeur
//   professeur         — ses propres données et ses attributions, rien d'autre
//   consultation       — lecture seule
//
// Le rôle pose un plancher et un plafond ; les cases affinent à l'intérieur.
// Une case ne peut jamais accorder plus que le rôle ne le permet.
// ─────────────────────────────────────────────────────────────────────────────

export const MODULES = [
  'etudiants', 'attributions', 'personnel', 'organisation', 'planification',
  'communication', 'listes', 'procedures', 'pilotage', 'budget', 'recrutement',
];

// Ce que chaque rôle autorise AU MIEUX, avant affinage par les cases.
// 'demande' signifie : l'écriture est acceptée mais passe en validation.
const PLAFOND = {
  admin: { lire: () => true, ecrire: () => 'direct' },

  secretariat: {
    lire: () => true,
    // Le secrétariat encode les étudiants — c'est son métier, et cela
    // n'engage que de la donnée administrative — et produit les documents.
    ecrire: m => (['etudiants', 'communication', 'listes', 'procedures'].includes(m)
      ? 'direct' : false),
  },

  coordination: {
    lire: () => true,
    // Tout ce qu'un coordinateur encode passe par la direction.
    ecrire: m => (['recrutement'].includes(m) ? false : 'demande'),
  },

  professeur: {
    // Ses propres données, et rien d'autre : le cloisonnement à sa personne
    // est appliqué par les routes elles-mêmes, pas ici.
    lire: m => ['attributions', 'personnel', 'planification'].includes(m),
    ecrire: () => false,
  },

  consultation: { lire: () => true, ecrire: () => false },
};

// La direction et son adjoint ont les mêmes droits : ce sont deux personnes,
// non deux niveaux. La distinction sert à savoir QUI a tranché.
PLAFOND.directeur = PLAFOND.admin;
PLAFOND.directeur_adjoint = PLAFOND.admin;

// 'editeur' est l'ancien nom, conservé le temps que les comptes migrent.
PLAFOND.editeur = { lire: () => true, ecrire: () => 'direct' };

/** Qui peut trancher une demande de validation. */
export const ROLES_VALIDATION = ['admin', 'directeur', 'directeur_adjoint'];
export function peutValider(user) {
  return ROLES_VALIDATION.includes(user?.role);
}

function permissions(user) {
  try {
    return user?.permissions_json
      ? (typeof user.permissions_json === 'string'
          ? JSON.parse(user.permissions_json) : user.permissions_json)
      : {};
  } catch { return {}; }
}

/**
 * Que peut cet utilisateur sur ce module ?
 * @returns {false|'direct'|'demande'} pour une écriture, {boolean} pour une lecture
 */
export function peut(user, module, action = 'lire') {
  if (!user) return false;
  const plafond = PLAFOND[user.role] || PLAFOND.consultation;

  if (action === 'lire') {
    if (!plafond.lire(module)) return false;
    // Sans cases enregistrées, le rôle fait foi : ne rien cocher ne doit pas
    // revenir à tout fermer, sous peine de bloquer les comptes existants.
    const p = permissions(user)[module];
    if (!p) return true;
    return p.lire !== false || p.ecrire === true;
  }

  const max = plafond.ecrire(module);
  if (!max) return false;
  const p = permissions(user)[module];
  if (p && p.ecrire === false) return false;      // case explicitement retirée
  return max;
}

/**
 * Middleware. Refuse la requête si la permission manque ; sinon pose
 * req.ecriture = 'direct' | 'demande', que la route consultera pour savoir
 * si elle applique ou si elle dépose une demande.
 */
export function exigePermission(module, action = 'lire') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    const droit = peut(req.user, module, action);
    if (!droit) {
      return res.status(403).json({
        error: `Vous n'avez pas le droit ${action === 'lire' ? 'de consulter' : 'de modifier'} ce module.`,
      });
    }
    if (action === 'ecrire') req.ecriture = droit;
    next();
  };
}

/** Vue d'ensemble des droits, pour que l'interface n'affiche que l'utile. */
export function droitsDe(user) {
  const d = {};
  for (const m of MODULES) {
    d[m] = { lire: !!peut(user, m, 'lire'), ecrire: peut(user, m, 'ecrire') };
  }
  return d;
}

export default { peut, exigePermission, droitsDe, MODULES };

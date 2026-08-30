import db from '../db/index.js';
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
  'communication', 'listes', 'procedures', 'pilotage', 'repartition', 'budget',
  'recrutement',
];

// Ce que chaque rôle autorise AU MIEUX, avant affinage par les cases.
//
// Ces plafonds étaient codés en dur : chaque changement d'avis sur ce qu'un
// secrétariat ou une coordination peut faire demandait une intervention sur le
// code. Ils vivent maintenant en base, modifiables par la direction depuis
// Configuration → Rôles.
//
// Les valeurs ci-dessous ne servent plus qu'à AMORCER la table à la première
// exécution, et de repli si elle devenait illisible.
const PLAFOND_INITIAL = {
  admin:             () => 'ecrit',
  directeur:         () => 'ecrit',
  directeur_adjoint: () => 'ecrit',
  editeur:           () => 'ecrit',
  secretariat:  m => (['etudiants', 'communication', 'listes', 'procedures'].includes(m)
    ? 'ecrit' : 'lit'),
  coordination: m => (['recrutement', 'repartition'].includes(m) ? 'rien' : 'validation'),
  professeur:   m => (['attributions', 'personnel', 'planification'].includes(m) ? 'lit' : 'rien'),
  consultation: () => 'lit',
};

export const ROLES = Object.keys(PLAFOND_INITIAL);
export const NIVEAUX = ['rien', 'lit', 'ecrit', 'validation'];

export function migrerPlafonds(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS role_plafond (
      role    TEXT NOT NULL,
      module  TEXT NOT NULL,
      niveau  TEXT NOT NULL DEFAULT 'rien',   -- rien | lit | ecrit | validation
      maj_le  TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (role, module)
    );`);
    const ins = dbx.prepare(
      'INSERT OR IGNORE INTO role_plafond (role, module, niveau) VALUES (?,?,?)');
    let n = 0;
    for (const [role, fn] of Object.entries(PLAFOND_INITIAL)) {
      for (const m of MODULES) { ins.run(role, m, fn(m)); n++; }
    }
    console.log(`[migration] role_plafond : ${n} combinaison(s) vérifiée(s)`);
  } catch (e) { console.error('[migration] plafonds :', e.message); }
}

// Cache : la table est lue à chaque requête sinon, pour une donnée qui change
// quelques fois par an. Il s'invalide dès qu'un plafond est modifié.
let cachePlafonds = null;
export function invaliderPlafonds() { cachePlafonds = null; }

function plafonds() {
  if (cachePlafonds) return cachePlafonds;
  try {
    const rows = db.prepare('SELECT role, module, niveau FROM role_plafond').all();
    if (!rows.length) return null;
    const par = {};
    for (const r0 of rows) (par[r0.role] = par[r0.role] || {})[r0.module] = r0.niveau;
    cachePlafonds = par;
    return par;
  } catch { return null; }
}

/** Niveau maximal de ce rôle sur ce module : 'rien' | 'lit' | 'ecrit' | 'validation'. */
function plafondDe(role, module) {
  const table = plafonds();
  if (table && table[role] && table[role][module]) return table[role][module];
  const fn = PLAFOND_INITIAL[role] || PLAFOND_INITIAL.consultation;
  return fn(module);
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
  const niveau = plafondDe(user.role, module);
  if (niveau === 'rien') return false;

  if (action === 'lire') {
    // Sans cases enregistrées, le rôle fait foi : ne rien cocher ne doit pas
    // revenir à tout fermer, sous peine de bloquer les comptes existants.
    const p = permissions(user)[module];
    if (!p) return true;
    return p.lire !== false || p.ecrire === true;
  }

  if (niveau === 'lit') return false;
  const p = permissions(user)[module];
  if (p && p.ecrire === false) return false;      // case explicitement retirée
  return niveau === 'validation' ? 'demande' : 'direct';
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

/** Qui peut trancher une demande de validation. */
export const ROLES_VALIDATION = ['admin', 'directeur', 'directeur_adjoint'];
export function peutValider(user) {
  return ROLES_VALIDATION.includes(user?.role);
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

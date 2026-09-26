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
//   professeur         — ses attributions, ses groupes, ses propositions de
//                        notes (« Mes cours ») : son périmètre n'est pas une
//                        section, ce sont SES attributions et la répartition
//                        qui lui donne ses étudiants
//   consultation       — lecture seule
//
// À CES RÔLES DE LA MAISON s'ajoutent les RÔLES DÉFINIS (table role_defini),
// créés par la direction depuis Configuration → Rôles — conseiller qualité,
// conseiller inclusif, conseiller pédagogique et social, et ceux d'après. Un
// rôle défini n'a AUCUN pouvoir spécial : il ne vaut que par ses plafonds de
// modules, réglés écran par écran, et par le périmètre de sections posé sur
// chaque fiche. Ce qui exige la direction reste à la direction.
//
// Le rôle pose un plancher et un plafond ; les cases affinent à l'intérieur.
// Une case ne peut jamais accorder plus que le rôle ne le permet.
// ─────────────────────────────────────────────────────────────────────────────

/*
 * PILOTAGE SE LIT, DOTATION S'ENGAGE.
 *
 * Tant que la dotation vivait dans « pilotage », ouvrir le reporting à une
 * coordination lui ouvrait la dotation : la règle de la maison — elle
 * consulte, elle propose, elle n'engage pas — n'était pas exprimable. Ce
 * module-ci est la ligne qui manquait.
 *
 * « communication » disparaît avec son axe : ses listes sont des pièces du
 * centre d'impression, et un module qui ne garde plus rien est un cadenas sur
 * une porte qu'on a murée.
 */
export const MODULES = [
  'etudiants', 'attributions', 'personnel', 'organisation', 'planification',
  'listes', 'procedures', 'pilotage', 'dotation', 'repartition', 'budget',
  'recrutement', 'amenagements',
];

/* LES DROITS PAR ÉCRAN, ACCORDÉS À UNE PERSONNE (2.12.207, Charles, 26
 * septembre 2026 : « j'ai besoin de définir parfois les rôles sur des écrans ;
 * par exemple, Audrey Perez doit pouvoir créer des aménagements raisonnables »).
 * Pour ces modules, le rôle ne suffit pas à écrire : il faut que la case
 * « écrire » soit COCHÉE sur la fiche de la personne (Accès Lucie). Le
 * plafond du rôle reste la borne ; l'octroi, lui, est nominatif — sans quoi
 * cocher le rôle ouvrirait l'écran à toutes les coordinations d'un coup.
 * Les rôles qui écrivaient déjà sur ces écrans gardent leur droit. */
export const MODULES_SUR_OCTROI = ['amenagements'];
const ECRIVENT_D_OFFICE = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'];

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
  secretariat:  m => (['etudiants', 'listes', 'procedures', 'amenagements'].includes(m)
    ? 'ecrit' : 'lit'),
  // La coordination consulte le reporting, prépare un budget, et n'engage ni
  // la dotation ni la répartition des périodes.
  coordination: m => (['recrutement', 'repartition', 'dotation'].includes(m)
    ? 'rien' : m === 'pilotage' ? 'lit'
    : m === 'amenagements' ? 'ecrit'      // sur octroi nominatif — voir MODULES_SUR_OCTROI
    : 'validation'),
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

    /* LES RÔLES DÉFINIS — la liste des rôles cesse d'être une constante du
     * code. La direction en crée depuis Configuration → Rôles ; chacun ne
     * vaut que par ses plafonds. Les trois conseillers demandés par Jérôme
     * (29 septembre 2026) sont amorcés ici, TOUT À « rien » : c'est la
     * direction qui ouvre, écran par écran — un rôle amorcé ouvert serait un
     * défaut permissif de plus. */
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS role_defini (
      code    TEXT PRIMARY KEY,
      libelle TEXT NOT NULL,
      cree_le TEXT DEFAULT (datetime('now'))
    );`);
    const insR = dbx.prepare('INSERT OR IGNORE INTO role_defini (code, libelle) VALUES (?,?)');
    for (const [code, libelle] of [
      ['conseiller_qualite', 'Conseiller qualité'],
      ['conseiller_inclusif', 'Conseiller inclusif'],
      ['conseiller_pedagogique_social', 'Conseiller pédagogique et social'],
    ]) {
      insR.run(code, libelle);
      for (const m of MODULES) ins.run(code, m, 'rien');
    }
  } catch (e) { console.error('[migration] plafonds :', e.message); }
}

// Cache : la table est lue à chaque requête sinon, pour une donnée qui change
// quelques fois par an. Il s'invalide dès qu'un plafond est modifié.
let cachePlafonds = null;
let cacheRoles = null;
export function invaliderPlafonds() { cachePlafonds = null; cacheRoles = null; }

/** Rôles de la maison + rôles définis par la direction. */
export function rolesConnus() {
  if (cacheRoles) return cacheRoles;
  let definis = [];
  try { definis = db.prepare('SELECT code, libelle FROM role_defini ORDER BY libelle').all(); }
  catch { definis = []; }
  cacheRoles = {
    codes: [...ROLES, ...definis.map(d => d.code)],
    libelles: Object.fromEntries(definis.map(d => [d.code, d.libelle])),
    definis: definis.map(d => d.code),
  };
  return cacheRoles;
}

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
  /* Le repli ne vaut que pour les rôles de la maison. Un rôle défini sans
   * ligne lisible — ou un rôle inconnu — ne reçoit RIEN : le repli
   * « consultation » d'avant aurait ouvert toute la lecture à un rôle que
   * personne n'a paramétré, le défaut permissif exactement. */
  const fn = PLAFOND_INITIAL[role];
  return fn ? fn(module) : 'rien';
}

function permissions(user) {
  try {
    return user?.permissions_json
      ? (typeof user.permissions_json === 'string'
          ? JSON.parse(user.permissions_json) : user.permissions_json)
      : {};
  } catch { return {}; }
}

/* LE JETON A TRENTE JOURS ; LES CASES CHANGENT AUJOURD'HUI. Le rôle et les
 * permissions se relisent en base à chaque décision — exactement comme
 * getUserSections le fait pour le périmètre, et pour la même raison : un
 * accès retiré le matin doit s'appliquer à la requête suivante, pas à la
 * reconnexion dans trente jours. C'est ce décalage qui laissait un compte
 * « étudiants seulement » lire le personnel et l'organisation avec son
 * ancien jeton. À défaut de ligne lisible, le jeton fait foi. */
function fraicheur(user) {
  try {
    if (user?.id) {
      const row = db.prepare(
        'SELECT role, permissions_json FROM utilisateur WHERE id = ?').get(user.id);
      if (row) {
        let p = {};
        try { p = row.permissions_json ? JSON.parse(row.permissions_json) : {}; } catch { p = {}; }
        return { role: row.role || user.role, permissions: p };
      }
    }
  } catch { /* base illisible : le jeton fait foi */ }
  return { role: user?.role, permissions: permissions(user) };
}

/**
 * Que peut cet utilisateur sur ce module ?
 * @returns {false|'direct'|'demande'} pour une écriture, {boolean} pour une lecture
 */
export function peut(user, module, action = 'lire') {
  if (!user) return false;
  const frais = fraicheur(user);
  const niveau = plafondDe(frais.role, module);
  if (niveau === 'rien') return false;

  if (action === 'lire') {
    // Sans cases enregistrées, le rôle fait foi : ne rien cocher ne doit pas
    // revenir à tout fermer, sous peine de bloquer les comptes existants.
    const p = frais.permissions[module];
    if (!p) return true;
    return p.lire !== false || p.ecrire === true;
  }

  if (niveau === 'lit') return false;
  const p = frais.permissions[module];
  if (p && p.ecrire === false) return false;      // case explicitement retirée
  if (MODULES_SUR_OCTROI.includes(module) && !ECRIVENT_D_OFFICE.includes(frais.role)
      && p?.ecrire !== true) return false;        // pas d'octroi nominatif
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

// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES GESTES : qui peut faire quoi, au-delà du module
//
// Demandé par Charles le 3 octobre 2026 : « je veux pouvoir voir plus loin que
// simplement organisation, horaire etc… il faut les gestes ». Choix tranché :
// les VOIR d'abord, tels que le code les applique aujourd'hui — pas les régler.
//
// LA LISTE DES RÔLES VIENT DES CONSTANTES RÉELLES, JAMAIS D'UNE COPIE. Là où une
// route nomme ses rôles par une constante (PEUT_VALIDER, PEUT_COMPOSER_PAE…),
// on l'IMPORTE : le jour où la constante change, cet écran change avec elle.
// Là où la route écrit sa liste en ligne (`roleRequired('admin', 'editeur')`),
// on la recopie et `source` dit où la relire — c'est la seule copie, et elle
// est nommée.
//
// Deux façons de garder une porte, et elles ne se valent pas :
//   - `garde` : `roleRequired(...)`, avec ses équivalences (la direction passe
//     où 'admin' ou 'editeur' est nommé ; le secrétariat où 'editeur' l'est ;
//     la coordination y reçoit « validation requise », donc « par demande ») ;
//   - `liste` : `LISTE.includes(req.user.role)`, sans aucune équivalence.
// Se tromper de mode, c'est afficher un droit que le serveur refuse.
//
// Ce catalogue ne décide RIEN : aucune route ne le lit pour autoriser. Il
// décrit. S'y ajoute la grille des modules (plafonds), qui filtre en amont.
// ─────────────────────────────────────────────────────────────────────────────

import { PEUT_VALIDER, PEUT_DEVALIDER, PEUT_INSTRUIRE } from './valorisation.js';
import { DIRECTION } from './circuitAR.js';
import { PEUT_FORCER_REINSCRIPTION, PEUT_COMPOSER_PAE, PEUT_REPORTER } from '../routes/etudiants.js';
import { PEUT_ENVOYER } from '../routes/envois.js';
import { PEUT_PUBLIER } from '../routes/documentation.js';
import { ROLES_AMENAGEMENT } from '../routes/amenagements.js';
import { NIVEAU_DIRECTION } from '../middleware/auth.js';

/** Les groupes, dans l'ordre du travail. `plafond` : le module de la grille
 *  dont le plafond s'applique en amont (null : hors grille des modules). */
export const GROUPES = [
  { cle: 'etudiants',     label: 'Étudiants — dossier et PAE', plafond: 'etudiants' },
  { cle: 'valorisation',  label: 'Valorisation',               plafond: 'etudiants' },
  { cle: 'deliberation',  label: 'Délibération',               plafond: 'etudiants' },
  { cle: 'diplomes',      label: 'Diplômes et titres',         plafond: 'etudiants' },
  { cle: 'amenagements',  label: 'Aménagements raisonnables',  plafond: 'amenagements' },
  { cle: 'attributions',  label: 'Attributions',               plafond: 'attributions' },
  { cle: 'personnel',     label: 'Personnel',                  plafond: 'personnel' },
  { cle: 'envois',        label: 'Impression & envois',        plafond: 'listes' },
  { cle: 'documentation', label: 'Documentation',              plafond: null },
  { cle: 'configuration', label: 'Configuration',              plafond: null },
];

const PROF_ATTRIBUE = "s'il est chargé du cours (attribution de l'année)";

/**
 * Le catalogue. `roles` : la liste telle que la porte la lit ; '*' = aucune
 * garde de rôle. `mode` : 'garde' (roleRequired) ou 'liste' (includes exact).
 * `conditions` : { role | '*': texte } — le geste passe SOUS CONDITION pour ce
 * rôle (périmètre, case de fiche, personne nommée). `demande` : rôles pour
 * lesquels la porte s'ouvre mais l'écriture repart « à valider ».
 */
export const GESTES = [
  // ── Étudiants ──────────────────────────────────────────────────────────────
  { module: 'etudiants', cle: 'creer', label: 'Créer un étudiant',
    roles: ['admin', 'editeur'], mode: 'garde', source: 'routes/etudiants.js POST /' },
  { module: 'etudiants', cle: 'identite', label: "Modifier l'identité (fiche)",
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'], mode: 'garde',
    source: 'routes/etudiants.js PATCH /:id' },
  { module: 'etudiants', cle: 'supprimer', label: 'Supprimer un étudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'secretariat'], mode: 'garde',
    source: 'routes/etudiants.js DELETE /:id' },
  { module: 'etudiants', cle: 'pae_composer', label: 'Composer, modifier, confirmer le PAE',
    roles: PEUT_COMPOSER_PAE, mode: 'garde',
    conditions: { coordination: 'dans les sections de son périmètre' },
    source: 'routes/etudiants.js PEUT_COMPOSER_PAE — POST /pae-modifier, POST /:id/pae/confirmer' },
  { module: 'etudiants', cle: 'pae_valider', label: 'Valider le PAE (revue, un à un ou en lot)',
    roles: PEUT_COMPOSER_PAE, mode: 'garde',
    conditions: { coordination: 'dans les sections de son périmètre' },
    source: 'routes/etudiants.js PEUT_COMPOSER_PAE — POST /:id/pae-valider, POST /pae-valider-lot' },
  { module: 'etudiants', cle: 'pae_revu', label: 'Marquer un PAE « revu »',
    roles: '*', mode: 'garde',
    conditions: { coordination: 'dans les sections de son périmètre' },
    source: 'routes/etudiants.js PUT /:id/revue-pae/revu (aucune garde de rôle : périmètre seul)' },
  { module: 'etudiants', cle: 'reinscription', label: 'Forcer une réinscription à une UE réussie',
    roles: PEUT_FORCER_REINSCRIPTION, mode: 'garde',
    source: 'routes/etudiants.js PEUT_FORCER_REINSCRIPTION — POST /pae-forcer-reinscription' },
  { module: 'etudiants', cle: 'reports', label: 'Accorder ou retirer un report de notes',
    roles: PEUT_REPORTER, mode: 'garde',
    source: 'routes/etudiants.js PEUT_REPORTER — PUT/DELETE /:id/revue-pae/report' },
  { module: 'etudiants', cle: 'promotion', label: "Promouvoir vers l'année suivante",
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'], mode: 'garde',
    source: 'routes/etudiants.js POST /pae-promotion' },
  { module: 'etudiants', cle: 'purge', label: 'Purger résultats et inscriptions',
    roles: ['admin', 'editeur'], mode: 'garde', source: 'routes/etudiants.js POST /purge' },
  { module: 'etudiants', cle: 'fusion', label: 'Fusionner deux dossiers (doublons)',
    roles: ['admin', 'directeur', 'directeur_adjoint'], mode: 'garde',
    source: 'routes/doublonsEtudiants.js POST /fusionner, /fusionner-lot' },
  { module: 'etudiants', cle: 'import', label: 'Importer (eCampus, PAE, résultats)',
    roles: ['admin', 'editeur'], mode: 'garde',
    source: 'routes/etudiants.js POST /import-excel, /import-pae, /import-resultats' },

  // ── Valorisation ───────────────────────────────────────────────────────────
  { module: 'valorisation', cle: 'instruire', label: 'Instruire (demande, recevabilité, décision)',
    roles: PEUT_INSTRUIRE, mode: 'garde',
    source: 'lib/valorisation.js PEUT_INSTRUIRE — routes/etudiants.js /valorisations/…' },
  { module: 'valorisation', cle: 'avis', label: "Rendre l'avis pédagogique",
    roles: [...PEUT_INSTRUIRE, 'professeur'], mode: 'garde',
    conditions: { professeur: PROF_ATTRIBUE },
    source: 'routes/etudiants.js PUT /valorisations/:vid/avis (PEUT_INSTRUIRE + professeur)' },
  { module: 'valorisation', cle: 'valider', label: 'Valider un dossier (étape 6 bis)',
    roles: PEUT_VALIDER, mode: 'liste',
    source: 'lib/valorisation.js PEUT_VALIDER — PUT /valorisations/:vid/validation' },
  { module: 'valorisation', cle: 'devalider', label: 'Dévalider (motif écrit)',
    roles: PEUT_DEVALIDER, mode: 'liste',
    source: 'lib/valorisation.js PEUT_DEVALIDER — PUT /valorisations/:vid/devalidation' },

  // ── Délibération ───────────────────────────────────────────────────────────
  { module: 'deliberation', cle: 'proposer', label: 'Proposer des notes (Mes cours)',
    roles: [], mode: 'garde',
    conditions: { coordination: 'dans les sections de son périmètre', '*': PROF_ATTRIBUE },
    source: 'routes/mesCours.js POST /:coursCode/notes (accès au cours, pas au rôle)' },
  { module: 'deliberation', cle: 'encoder', label: 'Encoder une note (feuille de délibération)',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'], mode: 'garde',
    source: 'routes/acquis.js PUT /feuille/note' },
  { module: 'deliberation', cle: 'importer', label: 'Importer les notes du classeur',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'], mode: 'garde',
    source: 'routes/acquis.js POST /ue/:ueNum/notes/importer' },
  { module: 'deliberation', cle: 'seance', label: 'Tenir et clôturer une séance',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'], mode: 'garde',
    source: 'routes/acquis.js PUT /deliberation/ue/:ueNum/seance' },
  { module: 'deliberation', cle: 'faveur', label: 'Octroyer une faveur, ajourner',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'], mode: 'garde',
    source: 'routes/acquis.js PUT /deliberation/ajustement' },
  { module: 'deliberation', cle: 'rouvrir', label: 'Rouvrir une séance close (motif écrit)',
    roles: ['admin', 'directeur', 'directeur_adjoint'], mode: 'garde',
    source: 'routes/acquis.js POST /deliberation/ue/:ueNum/rouvrir' },
  { module: 'deliberation', cle: 'regles', label: 'Régler la délibération (base de seconde session…)',
    roles: ['admin', 'directeur', 'directeur_adjoint'], mode: 'garde',
    source: 'routes/acquis.js PUT /deliberation/regles' },

  // ── Diplômes ───────────────────────────────────────────────────────────────
  { module: 'diplomes', cle: 'produire', label: 'Produire diplômes, attestations, PV de section',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'], mode: 'garde',
    source: 'routes/diplomes.js POST /pieces, /document, /pv-section' },

  // ── Aménagements ───────────────────────────────────────────────────────────
  { module: 'amenagements', cle: 'instruire', label: 'Ouvrir et compléter un dossier',
    roles: ROLES_AMENAGEMENT, mode: 'liste', condEcriture: 'amenagements',
    conditions: { '*': '« Aménagements » coché en écriture sur sa fiche' },
    source: 'routes/amenagements.js ROLES_AMENAGEMENT ou droit « amenagements » — peutAmenager' },
  { module: 'amenagements', cle: 'valider_a', label: 'Valider la demande (volet A)',
    roles: ROLES_AMENAGEMENT, mode: 'liste', condEcriture: 'amenagements',
    conditions: { '*': '« Aménagements » coché en écriture sur sa fiche' },
    source: 'routes/amenagements.js PUT /dossier/:id/valider-a' },
  { module: 'amenagements', cle: 'valider_b', label: 'Valider le rapport (volet B)',
    roles: DIRECTION, mode: 'liste', condEcriture: 'amenagements',
    conditions: { '*': 'seulement la personne de référence nommée au dossier' },
    source: 'routes/amenagements.js PUT /dossier/:id/valider-b — DIRECTION (lib/circuitAR.js) ou estPersonneReference' },
  { module: 'amenagements', cle: 'decider', label: 'Encoder la décision du Conseil',
    roles: ROLES_AMENAGEMENT, mode: 'liste', condEcriture: 'amenagements',
    conditions: { '*': '« Aménagements » coché en écriture sur sa fiche' },
    source: 'routes/amenagements.js PUT /dossier/:id (statut, cde_*) — après le volet B' },

  // ── Attributions ───────────────────────────────────────────────────────────
  { module: 'attributions', cle: 'modifier', label: 'Créer ou modifier une attribution',
    roles: ['admin', 'editeur', 'coordination'], mode: 'garde',
    demande: { coordination: "l'attribution repasse « à valider »" },
    source: 'routes/attributions.js POST /, PATCH /:id' },
  { module: 'attributions', cle: 'supprimer', label: 'Supprimer une attribution',
    roles: ['admin', 'coordination'], mode: 'garde',
    conditions: { coordination: 'dans les sections de son périmètre' },
    source: 'routes/attributions.js DELETE /:id' },
  { module: 'attributions', cle: 'valider', label: 'Valider une attribution',
    roles: ['admin'], mode: 'liste',
    conditions: { '*': '« valider » coché sur sa fiche (Attributions)' },
    source: 'routes/attributions.js PATCH /:id/valider — admin ou peutValiderAttributions' },
  { module: 'attributions', cle: 'demandes', label: 'Trancher les demandes de modification',
    roles: ['admin', 'directeur', 'directeur_adjoint'], mode: 'garde',
    source: 'routes/demandes.js POST /:id/valider, /:id/refuser' },

  // ── Personnel ──────────────────────────────────────────────────────────────
  { module: 'personnel', cle: 'fiche', label: 'Créer ou modifier une fiche du personnel',
    roles: ['admin', 'editeur'], mode: 'garde',
    source: 'routes/referentiels.js POST /professeurs, PATCH /professeurs/:id' },
  { module: 'personnel', cle: 'supprimer', label: 'Supprimer une fiche du personnel',
    roles: ['admin'], mode: 'garde', source: 'routes/referentiels.js DELETE /professeurs/:id' },
  { module: 'personnel', cle: 'contrats', label: 'Produire les contrats',
    roles: ['admin', 'editeur'], mode: 'garde', source: 'routes/contrats.js POST /apercu, /lot' },
  { module: 'personnel', cle: 'dossiers_rh', label: 'Tenir les dossiers RH',
    roles: ['admin'], mode: 'garde', source: 'routes/dossiersRh.js' },

  // ── Envois ─────────────────────────────────────────────────────────────────
  { module: 'envois', cle: 'envoyer', label: 'Envoyer des pièces par courriel',
    roles: PEUT_ENVOYER, mode: 'garde', source: 'routes/envois.js PEUT_ENVOYER — POST /' },

  // ── Documentation ──────────────────────────────────────────────────────────
  { module: 'documentation', cle: 'publier', label: 'Publier, corriger, retirer un texte',
    roles: PEUT_PUBLIER, mode: 'garde',
    source: 'routes/documentation.js PEUT_PUBLIER — POST /, POST /:cle/versions' },
  { module: 'documentation', cle: 'registre', label: 'Lire le registre des confirmations',
    roles: PEUT_PUBLIER, mode: 'garde', source: 'routes/documentation.js GET /:cle/registre' },

  // ── Configuration ──────────────────────────────────────────────────────────
  { module: 'configuration', cle: 'comptes', label: 'Gérer les comptes et leurs droits',
    roles: ['admin'], mode: 'garde', source: 'routes/users.js POST /, PATCH /:id, PUT /:id/permissions' },
  { module: 'configuration', cle: 'plafonds', label: 'Régler les plafonds, créer un rôle',
    roles: ['admin', 'directeur', 'directeur_adjoint'], mode: 'garde',
    source: 'routes/profilsAcces.js PUT /plafonds, POST /roles' },
  { module: 'configuration', cle: 'couleurs', label: 'Régler les couleurs',
    roles: ['admin', 'directeur', 'directeur_adjoint'], mode: 'garde', source: 'routes/config.js PUT /couleurs' },
  { module: 'configuration', cle: 'parametres', label: 'Modifier les paramètres et la configuration',
    roles: ['admin'], mode: 'garde', source: 'routes/config.js PUT /:cle, routes/parametres.js' },
];

/**
 * Ce que `roleRequired(...roles)` répond à ce rôle — exactement
 * (middleware/auth.js) : 'oui' | 'demande' | 'non'.
 */
export function peut(role, roles) {
  if (roles.includes(role)) return 'oui';
  if (NIVEAU_DIRECTION.includes(role) && (roles.includes('admin') || roles.includes('editeur'))) return 'oui';
  if (role === 'secretariat' && roles.includes('editeur')) return 'oui';
  if (role === 'coordination' && (roles.includes('editeur') || roles.includes('admin'))) return 'demande';
  return 'non';
}

/**
 * Le verdict d'un geste pour un rôle : { v: 'oui'|'demande'|'condition'|'non', note }.
 * La condition ne s'ajoute qu'à ce que la porte refuserait sinon, ou qu'elle
 * ouvre sous réserve (périmètre) : elle ne retire jamais un « oui » franc
 * d'un rôle qu'aucune condition ne nomme.
 */
export function verdict(g, role, plafond = () => null) {
  let v;
  if (g.roles === '*') v = 'oui';
  else if (g.mode === 'liste') v = g.roles.includes(role) ? 'oui' : 'non';
  else v = peut(role, g.roles);

  const nommee = g.conditions?.[role];
  const generale = g.conditions?.['*'];
  if (v === 'oui' && g.demande?.[role]) return { v: 'demande', note: g.demande[role] };
  if (v === 'oui' && nommee) return { v: 'condition', note: nommee };
  if (v === 'demande') return { v, note: 'refusé avec « validation requise » — à demander à la direction' };
  if (v === 'non' && (nommee || generale)) {
    // Une case de fiche n'ouvre rien au-delà du plafond du rôle : là où le
    // module est fermé en écriture, la condition ne peut pas être remplie.
    if (!nommee && g.condEcriture && !['ecrit', null].includes(plafond(role, g.condEcriture))) {
      return { v: 'non', note: `le plafond du rôle ne permet pas d'écrire (${g.condEcriture})` };
    }
    return { v: 'condition', note: nommee || generale };
  }
  return { v, note: null };
}

/** Le tableau complet pour une liste de rôles. `plafond(role, module)` rend
 *  le niveau réglé, ou null s'il n'est pas connu. */
export function tableauGestes(roles, plafond) {
  return {
    groupes: GROUPES,
    gestes: GESTES.map(g => ({
      module: g.module, cle: g.cle, label: g.label, source: g.source, mode: g.mode,
      verdicts: Object.fromEntries(roles.map(r => [r, verdict(g, r, plafond)])),
    })),
  };
}

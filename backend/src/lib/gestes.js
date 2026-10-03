// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES GESTES : qui peut faire quoi, au-delà du module
//
// Demandé par Charles le 3 octobre 2026 : « je veux pouvoir voir plus loin que
// simplement organisation, horaire etc… il faut les gestes ». Puis, le même
// jour : « je ne sais pas changer les autorisations de gestes alors que je
// suis le directeur ». Le catalogue a d'abord DÉCRIT ; il DÉCIDE désormais.
//
// UNE PORTE PAR GESTE, ET ELLE LIT CE CATALOGUE. Chaque route cataloguée garde
// sa porte par `gesteRequis('<module>.<clé>')` (ou `gesteAutorise(req, …)` là
// où le contrôle s'écrit dans la route). Le DÉFAUT est la liste écrite ici —
// exactement celle que portait la route avant, avec les mêmes équivalences ;
// la direction peut régler un rôle geste par geste (`geste_reglage`), et
// chaque réglage s'écrit au journal (`geste_journal`, en ajout seul).
//
// Les listes que les routes nommaient par une constante (PEUT_COMPOSER_PAE,
// PEUT_ENVOYER…) vivent ICI : la route les lisait, la route lit désormais le
// geste. Celles de lib/valorisation.js et lib/circuitAR.js restent où elles
// sont (d'autres écrans les emploient) et sont importées.
//
// Deux façons de garder une porte, et elles ne se valent pas :
//   - `garde` : la sémantique de `roleRequired(...)`, avec ses équivalences (la
//     direction passe où 'admin' ou 'editeur' est nommé ; le secrétariat où
//     'editeur' l'est ; la coordination y reçoit « validation requise », donc
//     « par demande ») ;
//   - `liste` : `LISTE.includes(req.user.role)`, sans aucune équivalence.
//
// LA DIRECTION NE SE RETIRE JAMAIS (Charles, 3 octobre 2026) : sur les gestes
// de Configuration et sur tout geste de validation ou de décision (`verrou`),
// admin, directeur et directeur adjoint gardent le défaut — le serveur refuse
// de les régler, et ignorerait un réglage qui se serait glissé en base.
//
// La porte ne remplace que la part du RÔLE. Les conditions (périmètre, case de
// fiche, personne de référence) restent contrôlées dans la route.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';
import { PEUT_VALIDER, PEUT_DEVALIDER, PEUT_INSTRUIRE } from './valorisation.js';
import { DIRECTION } from './circuitAR.js';
import { NIVEAU_DIRECTION } from '../middleware/auth.js';

/* ── Les listes que les routes nommaient par une constante ─────────────────
 * Déplacées ici depuis les routes (un import en sens inverse ferait une
 * boucle : la route lit le catalogue, le catalogue lisait la route). */

/* LA COORDINATION COMPOSE, CONFIRME ET VALIDE LES PAE DE SES SECTIONS (Charles,
   2 octobre 2026). Exception explicite à « un coordinateur n'écrit jamais
   directement » — le périmètre se pose sur chaque porte (routes/etudiants.js). */
export const PEUT_COMPOSER_PAE = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'];
/* Reports de notes de la revue (routes/etudiants.js). */
export const PEUT_REPORTER = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'coordination'];
/* Forcer la réinscription à une UE réussie (routes/etudiants.js). */
export const PEUT_FORCER_REINSCRIPTION = ['admin', 'directeur', 'directeur_adjoint',
                                          'coordination', 'editeur'];
/* QUI PEUT ENVOYER (routes/envois.js). Une impression se jette ; un courriel
 * parti ne revient pas. */
export const PEUT_ENVOYER = ['admin', 'directeur', 'directeur_adjoint', 'secretariat'];
/* QUI DÉPOSE ET PUBLIE le corpus (routes/documentation.js) — la direction
 * (Charles, 20 septembre 2026). */
export const PEUT_PUBLIER = ['admin', 'directeur', 'directeur_adjoint'];
/* QUI ÉCRIT UN AMÉNAGEMENT d'office (routes/amenagements.js) ; s'y ajoute la
 * case « Aménagements » cochée en écriture sur la fiche. */
export const ROLES_AMENAGEMENT = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'];
/* LES CONVENTIONS (routes/conventions.js) — Charles, 3 octobre 2026 : le
 * registre se lit et se prépare par la direction, le secrétariat et la
 * coordination (dans ses sections) ; enseignants et étudiants n'y ont pas
 * accès, et c'est le serveur qui le refuse. Signer reste l'affaire d'une
 * personne, le signataire de l'établissement (estSignataire). */
export const CONVENTIONS_REGISTRE = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur', 'coordination'];

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
  { cle: 'conventions',   label: 'Conventions',                plafond: null },
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
    source: 'routes/etudiants.js POST /pae-modifier, POST /:id/pae/confirmer' },
  { module: 'etudiants', verrou: true, cle: 'pae_valider', label: 'Valider le PAE (revue, un à un ou en lot)',
    roles: PEUT_COMPOSER_PAE, mode: 'garde',
    conditions: { coordination: 'dans les sections de son périmètre' },
    source: 'routes/etudiants.js POST /:id/pae-valider, POST /pae-valider-lot' },
  /* RÉGLABLE DEPUIS LE 3 OCTOBRE 2026 (Charles : « je dois pouvoir tout
     paramétrer dans cette fenêtre »). La route n'avait aucune porte de rôle ;
     elle en a une, ouverte à tous par défaut — exactement ce qu'elle faisait. */
  { module: 'etudiants', cle: 'pae_revu', label: 'Marquer un PAE « revu »',
    roles: '*', mode: 'garde',
    conditions: { coordination: 'dans les sections de son périmètre' },
    source: 'routes/etudiants.js PUT /:id/revue-pae/revu (périmètre contrôlé dans la route)' },
  { module: 'etudiants', cle: 'reinscription', label: 'Forcer une réinscription à une UE réussie',
    roles: PEUT_FORCER_REINSCRIPTION, mode: 'garde',
    source: 'routes/etudiants.js POST /pae-forcer-reinscription, /pae-nettoyer-reussies' },
  { module: 'etudiants', verrou: true, cle: 'reports', label: 'Accorder ou retirer un report de notes, une VA d’UE sans dossier',
    roles: PEUT_REPORTER, mode: 'garde',
    source: 'routes/etudiants.js PUT/DELETE /:id/revue-pae/report, PUT /:id/revue-pae/va-ue' },
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
  { module: 'valorisation', verrou: true, cle: 'instruire', label: 'Instruire (demande, recevabilité, décision)',
    roles: PEUT_INSTRUIRE, mode: 'garde',
    source: 'routes/etudiants.js /valorisations/… (matrice, demande, recevabilité, décision, lots, création, suppression), routes/attestations.js /valorisation/ue/:ueNum/seance, /documents' },
  { module: 'valorisation', cle: 'avis', label: "Rendre l'avis pédagogique",
    roles: [...PEUT_INSTRUIRE, 'professeur'], mode: 'garde',
    conditions: { professeur: PROF_ATTRIBUE },
    source: 'routes/etudiants.js PUT /valorisations/:vid/avis, /:vid/test, POST /valorisations/lot/avis' },
  { module: 'valorisation', verrou: true, cle: 'valider', label: 'Valider un dossier (étape 6 bis)',
    roles: PEUT_VALIDER, mode: 'liste',
    source: 'routes/etudiants.js PUT /valorisations/:vid/validation, POST /valorisations/lot/validation' },
  { module: 'valorisation', verrou: true, cle: 'devalider', label: 'Dévalider, supprimer un dossier décidé (motif écrit)',
    roles: PEUT_DEVALIDER, mode: 'liste',
    source: 'routes/etudiants.js DELETE /valorisations/:vid/validation ; suppression d’un dossier décidé' },

  // ── Délibération ───────────────────────────────────────────────────────────
  { module: 'deliberation', reglable: false, cle: 'proposer', label: 'Proposer des notes (Mes cours)',
    roles: [], mode: 'garde',
    conditions: { coordination: 'dans les sections de son périmètre', '*': PROF_ATTRIBUE },
    source: 'routes/mesCours.js POST /:coursCode/notes (accès au cours, pas au rôle)' },
  { module: 'deliberation', cle: 'encoder', label: 'Encoder une note (feuille de délibération)',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'], mode: 'garde',
    source: 'routes/acquis.js PUT /feuille/note' },
  { module: 'deliberation', cle: 'importer', label: 'Importer les notes du classeur',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'], mode: 'garde',
    source: 'routes/acquis.js POST /ue/:ueNum/notes/importer' },
  { module: 'deliberation', verrou: true, cle: 'seance', label: 'Tenir et clôturer une séance',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'], mode: 'garde',
    source: 'routes/acquis.js PUT /deliberation/ue/:ueNum/seance' },
  { module: 'deliberation', verrou: true, cle: 'faveur', label: 'Octroyer une faveur, ajourner',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'], mode: 'garde',
    source: 'routes/acquis.js PUT /deliberation/ajustement' },
  { module: 'deliberation', verrou: true, cle: 'rouvrir', label: 'Rouvrir une séance close (motif écrit)',
    roles: ['admin', 'directeur', 'directeur_adjoint'], mode: 'garde',
    source: 'routes/acquis.js POST /deliberation/ue/:ueNum/rouvrir' },
  { module: 'deliberation', verrou: true, cle: 'regles', label: 'Régler la délibération (base de seconde session…)',
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
    source: 'routes/amenagements.js — peutAmenager (rôle, ou case « amenagements » de la fiche)' },
  { module: 'amenagements', verrou: true, cle: 'valider_a', label: 'Valider la demande (volet A)',
    roles: ROLES_AMENAGEMENT, mode: 'liste', condEcriture: 'amenagements',
    conditions: { '*': '« Aménagements » coché en écriture sur sa fiche' },
    source: 'routes/amenagements.js PUT/DELETE /dossier/:id/valider-a' },
  { module: 'amenagements', verrou: true, cle: 'valider_b', label: 'Valider le rapport (volet B)',
    roles: DIRECTION, mode: 'liste', condEcriture: 'amenagements',
    conditions: { '*': 'seulement la personne de référence nommée au dossier' },
    source: 'routes/amenagements.js PUT/DELETE /dossier/:id/valider-b — rôle, ou personne de référence' },
  { module: 'amenagements', verrou: true, cle: 'decider', label: 'Encoder la décision du Conseil',
    roles: ROLES_AMENAGEMENT, mode: 'liste', condEcriture: 'amenagements',
    conditions: { '*': '« Aménagements » coché en écriture sur sa fiche' },
    source: 'routes/amenagements.js PUT /dossier/:id (statut décidé, cde_date, cde_motivation)' },

  // ── Attributions ───────────────────────────────────────────────────────────
  { module: 'attributions', cle: 'modifier', label: 'Créer ou modifier une attribution',
    roles: ['admin', 'editeur', 'coordination'], mode: 'garde',
    demande: { coordination: "l'attribution repasse « à valider »" },
    source: 'routes/attributions.js POST /, PATCH /:id' },
  { module: 'attributions', cle: 'supprimer', label: 'Supprimer une attribution',
    roles: ['admin', 'coordination'], mode: 'garde',
    conditions: { coordination: 'dans les sections de son périmètre' },
    source: 'routes/attributions.js DELETE /:id' },
  { module: 'attributions', verrou: true, cle: 'valider', label: 'Valider une attribution',
    roles: ['admin'], mode: 'liste',
    conditions: { '*': '« valider » coché sur sa fiche (Attributions)' },
    source: 'routes/attributions.js PATCH /:id/valider — rôle, ou case « valider » de la fiche' },
  { module: 'attributions', verrou: true, cle: 'demandes', label: 'Trancher les demandes de modification',
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
    roles: ['admin'], mode: 'garde', source: 'routes/dossiersRh.js (toutes les routes)' },

  // ── Envois ─────────────────────────────────────────────────────────────────
  { module: 'envois', cle: 'envoyer', label: 'Envoyer des pièces par courriel',
    roles: PEUT_ENVOYER, mode: 'garde', source: 'routes/envois.js POST /, GET /journal, GET /:id/copie' },

  // ── Documentation ──────────────────────────────────────────────────────────
  { module: 'documentation', verrou: true, cle: 'publier', label: 'Publier, corriger, retirer un texte',
    roles: PEUT_PUBLIER, mode: 'garde',
    source: 'routes/documentation.js POST /, /importer, /:cle/versions, /:cle/retirer, PATCH /:cle, PUT /:cle/destinataires' },
  { module: 'documentation', verrou: true, cle: 'registre', label: 'Lire le registre des confirmations',
    roles: PEUT_PUBLIER, mode: 'garde', source: 'routes/documentation.js GET /:cle/registre' },

  // ── Conventions ────────────────────────────────────────────────────────────
  { module: 'conventions', cle: 'lire', label: 'Lire le registre des conventions',
    roles: CONVENTIONS_REGISTRE, mode: 'liste',
    conditions: { coordination: 'dans les sections de son périmètre' },
    source: 'routes/conventions.js GET /, /modeles, /partenaires, /:id/journal, /:id/fichier' },
  { module: 'conventions', cle: 'preparer', label: 'Préparer : composer, déposer, contresigné, supprimer avant signature',
    roles: CONVENTIONS_REGISTRE, mode: 'liste',
    conditions: { coordination: 'dans les sections de son périmètre' },
    source: 'routes/conventions.js POST /, /apercu, /composer, /:id/contresigne, DELETE /:id' },
  { module: 'conventions', verrou: true, cle: 'modeles', label: 'Publier une version d’un modèle de convention',
    roles: PEUT_PUBLIER, mode: 'garde', source: 'routes/conventions.js POST /modeles/:famille' },
  { module: 'conventions', reglable: false, cle: 'signer', label: 'Signer (griffe du signataire)',
    roles: ['admin', 'directeur'], mode: 'liste',
    conditions: { admin: "s'il est le signataire réglé dans Configuration, depuis son compte",
                  directeur: "s'il est le signataire réglé dans Configuration, depuis son compte" },
    source: 'routes/conventions.js POST /signer (estSignataire : une personne, pas un rôle)' },
  { module: 'conventions', verrou: true, cle: 'retirer', label: 'Retirer une convention signée (motif écrit)',
    roles: NIVEAU_DIRECTION, mode: 'liste', reglable: false,
    source: 'routes/conventions.js POST /:id/retirer (roleRequired, non réglable)' },

  // ── Configuration ──────────────────────────────────────────────────────────
  { module: 'configuration', verrou: true, cle: 'comptes', label: 'Gérer les comptes et leurs droits',
    roles: ['admin'], mode: 'garde', source: 'routes/users.js POST /, PATCH /:id, DELETE /:id, PUT /:id/permissions, POST /:id/lien-mot-de-passe' },
  { module: 'configuration', verrou: true, cle: 'plafonds', label: 'Régler les plafonds, créer un rôle',
    roles: ['admin', 'directeur', 'directeur_adjoint'], mode: 'garde',
    source: 'routes/profilsAcces.js PUT /plafonds, POST /roles, DELETE /roles/:code' },
  { module: 'configuration', verrou: true, cle: 'couleurs', label: 'Régler les couleurs',
    roles: ['admin', 'directeur', 'directeur_adjoint'], mode: 'garde', source: 'routes/config.js PUT /couleurs' },
  { module: 'configuration', verrou: true, cle: 'parametres', label: 'Modifier les paramètres et la configuration',
    roles: ['admin'], mode: 'garde', source: 'routes/config.js PUT /:cle, routes/parametres.js PATCH /:cle, PUT /bulk' },
];

/** La clé complète d'un geste : `<module>.<clé>` (« supprimer » existe dans
 *  trois modules). */
export const cleDe = g => `${g.module}.${g.cle}`;
const PAR_CLE = new Map(GESTES.map(g => [cleDe(g), g]));
export const VALEURS_REGLAGE = ['oui', 'non', 'demande'];

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

/** Ce que la porte écrite dans le code répond à ce rôle, sans réglage :
 *  'oui' | 'demande' | 'non'. La part du RÔLE seulement. */
export function verdictDefaut(g, role) {
  if (g.roles === '*') return 'oui';
  if (g.mode === 'liste') return g.roles.includes(role) ? 'oui' : 'non';
  return peut(role, g.roles);
}

/** Une case que la direction ne peut pas se retirer. */
export const estVerrouille = (g, role) => !!g.verrou && NIVEAU_DIRECTION.includes(role);
/** Une case qui se règle : le geste a une porte de rôle, et la case n'est pas
 *  verrouillée. */
export const estReglable = (g, role) => g.reglable !== false && !estVerrouille(g, role);

// ── Les réglages : en base, lus une fois, oubliés à chaque écriture ────────
export function migrerGestes(dbx = db) {
  try {
    dbx.exec(`
      CREATE TABLE IF NOT EXISTS geste_reglage (
        geste_cle TEXT NOT NULL,
        role      TEXT NOT NULL,
        verdict   TEXT NOT NULL CHECK (verdict IN ('oui','non','demande')),
        maj_le    TEXT NOT NULL DEFAULT (datetime('now')),
        maj_par   INTEGER,
        PRIMARY KEY (geste_cle, role)
      );
      CREATE TABLE IF NOT EXISTS geste_journal (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        horodatage  TEXT NOT NULL DEFAULT (datetime('now')),
        geste_cle   TEXT NOT NULL,
        role        TEXT NOT NULL,
        avant       TEXT NOT NULL,
        apres       TEXT NOT NULL,
        acteur_id   INTEGER,
        acteur_nom  TEXT
      );
      -- LE JOURNAL EST EN AJOUT SEUL : une trace qu'on peut corriger ne prouve rien.
      CREATE TRIGGER IF NOT EXISTS geste_journal_sans_modif BEFORE UPDATE ON geste_journal
        BEGIN SELECT RAISE(ABORT, 'geste_journal : ajout seul'); END;
      CREATE TRIGGER IF NOT EXISTS geste_journal_sans_effacement BEFORE DELETE ON geste_journal
        BEGIN SELECT RAISE(ABORT, 'geste_journal : ajout seul'); END;
    `);
    tablesPretes = true;
  } catch (e) { console.error('[migration] gestes :', e.message); }
}

let tablesPretes = false;
let cache = null;                       // Map `${cle}|${role}` → verdict
export function oublierReglages() { cache = null; }

function reglages() {
  if (cache) return cache;
  if (!tablesPretes) migrerGestes(db);
  const m = new Map();
  try {
    for (const l of db.prepare('SELECT geste_cle, role, verdict FROM geste_reglage').all()) {
      m.set(`${l.geste_cle}|${l.role}`, l.verdict);
    }
  } catch { /* table absente : aucun réglage */ }
  cache = m;
  return m;
}

/** Le réglage posé par la direction, ou null (le défaut s'applique). Une case
 *  verrouillée ou non réglable n'a jamais de réglage, même si la base en
 *  portait un. */
export function reglageDe(g, role) {
  if (!estReglable(g, role)) return null;
  const v = reglages().get(`${cleDe(g)}|${role}`);
  return VALEURS_REGLAGE.includes(v) ? v : null;
}

function geste(cle) {
  const g = PAR_CLE.get(cle);
  if (!g) throw new Error(`Geste inconnu du catalogue : ${cle}`);
  return g;
}

/** Ce que la porte répond à ce rôle : le réglage s'il y en a un, sinon le
 *  défaut du code. 'oui' | 'demande' | 'non'. */
export function verdictEffectif(cle, role) {
  const g = geste(cle);
  return reglageDe(g, role) ?? verdictDefaut(g, role);
}

/** Pour les contrôles écrits dans la route : `gesteAutorise(req, cle) === 'oui'`. */
export function gesteAutorise(reqOuUser, cle) {
  const role = (reqOuUser?.user ?? reqOuUser)?.role;
  if (!role) return 'non';
  return verdictEffectif(cle, role);
}

/**
 * LA PORTE. Remplace `roleRequired(...)` sur une route cataloguée, avec les
 * mêmes réponses : 401 sans identité, 403 « validation requise » pour ce qui
 * passe par une demande, 403 « Permissions insuffisantes » sinon. La clé est
 * vérifiée au chargement : une faute de frappe arrête le serveur au démarrage
 * plutôt que d'ouvrir ou de fermer une porte en silence.
 */
export function gesteRequis(cle) {
  geste(cle);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    const v = verdictEffectif(cle, req.user.role);
    if (v === 'oui') return next();
    if (v === 'demande') {
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
 * Le verdict MONTRÉ d'un geste pour un rôle : { v: 'oui'|'demande'|'condition'|'non', note }.
 * `base` : ce que la porte répond (réglage ou défaut). La condition ne s'ajoute
 * qu'à ce que la porte refuserait sinon, ou qu'elle ouvre sous réserve
 * (périmètre) : elle ne retire jamais un « oui » franc d'un rôle qu'aucune
 * condition ne nomme. Un rôle RÉGLÉ à « non » perd sa condition nommée (elle
 * précisait un « oui ») ; la condition générale demeure — case de fiche,
 * personne de référence : un autre chemin que le rôle.
 */
export function verdict(g, role, plafond = () => null, base = verdictDefaut(g, role), regle = false) {
  let v = base;
  const nommee = regle && v === 'non' ? null : g.conditions?.[role];
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
 *  le niveau réglé, ou null s'il n'est pas connu. Chaque case porte ce qui
 *  est montré (`v`, `note`), le défaut du code, le réglage, et si elle est
 *  verrouillée ou réglable. */
export function tableauGestes(roles, plafond) {
  return {
    groupes: GROUPES,
    gestes: GESTES.map(g => ({
      module: g.module, cle: g.cle, id: cleDe(g), label: g.label, source: g.source, mode: g.mode,
      reglable: g.reglable !== false, verrou: !!g.verrou,
      verdicts: Object.fromEntries(roles.map(r => {
        const defaut = verdictDefaut(g, r);
        const reglage = reglageDe(g, r);
        const montre = verdict(g, r, plafond, reglage ?? defaut, reglage != null);
        const montreDefaut = reglage != null ? verdict(g, r, plafond, defaut).v : montre.v;
        return [r, { ...montre, defaut, defaut_montre: montreDefaut, reglage,
                     verrouille: estVerrouille(g, r), reglable: estReglable(g, r) }];
      })),
    })),
  };
}

/** Écrire (ou retirer, `verdict` null) le réglage d'une case, et sa ligne de
 *  journal, ensemble. Rend { avant, apres } ou lève une erreur { status }. */
export function reglerGeste(cle, role, nouveau, acteur) {
  const g = PAR_CLE.get(cle);
  const err = (status, message) => Object.assign(new Error(message), { status });
  if (!g) throw err(404, 'Geste inconnu.');
  if (g.reglable === false) throw err(400, "Ce geste n'a pas de porte de rôle : il dépend du cours ou du périmètre.");
  if (estVerrouille(g, role)) {
    throw err(400, 'Réservé à la direction — ne se retire pas : la direction garde les gestes de '
      + 'configuration, de validation et de décision.');
  }
  if (nouveau != null && !VALEURS_REGLAGE.includes(nouveau)) throw err(400, 'Verdict inconnu.');
  if (nouveau === 'demande' && role !== 'coordination') {
    throw err(400, '« Par demande » ne vaut que pour la coordination.');
  }
  if (!tablesPretes) migrerGestes(db);
  const defaut = verdictDefaut(g, role);
  if (nouveau === defaut) nouveau = null;                // régler au défaut, c'est revenir au défaut
  const ancien = reglageDe(g, role);
  const dire = v => (v == null ? `défaut:${defaut}` : v);
  if ((ancien ?? null) === (nouveau ?? null)) return { avant: dire(ancien), apres: dire(nouveau), inchange: true };

  db.transaction(() => {
    if (nouveau == null) db.prepare('DELETE FROM geste_reglage WHERE geste_cle = ? AND role = ?').run(cle, role);
    else db.prepare(`INSERT INTO geste_reglage (geste_cle, role, verdict, maj_le, maj_par)
                     VALUES (?,?,?, datetime('now'), ?)
                     ON CONFLICT(geste_cle, role) DO UPDATE SET verdict = excluded.verdict,
                       maj_le = excluded.maj_le, maj_par = excluded.maj_par`)
      .run(cle, role, nouveau, acteur?.id ?? null);
    db.prepare(`INSERT INTO geste_journal (geste_cle, role, avant, apres, acteur_id, acteur_nom)
                VALUES (?,?,?,?,?,?)`)
      .run(cle, role, dire(ancien), dire(nouveau), acteur?.id ?? null, acteur?.nom ?? null);
  })();
  oublierReglages();
  return { avant: dire(ancien), apres: dire(nouveau) };
}

/** Les dernières lignes du journal, avec le libellé du geste. */
export function journalGestes(limite = 200) {
  if (!tablesPretes) migrerGestes(db);
  try {
    return db.prepare('SELECT * FROM geste_journal ORDER BY id DESC LIMIT ?').all(limite)
      .map(l => {
        const g = PAR_CLE.get(l.geste_cle);
        return { ...l, geste_label: g?.label || l.geste_cle,
                 module: g?.module || null };
      });
  } catch { return []; }
}

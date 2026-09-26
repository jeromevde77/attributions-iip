// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Quelle porte appartient à quel module
//
// `exigePermission` existait, documenté, complet… et appelé ZÉRO fois sur les
// soixante-treize fichiers de routes. Les cases d'« Accès Lucie » ne masquaient
// donc que des onglets : qui connaissait l'adresse d'une route écrivait malgré
// une permission refusée. L'en-tête du module affirmait pourtant le contraire.
//
// LE CONTRÔLE SE POSE AU MONTAGE, PAS ROUTE PAR ROUTE. Trente-trois routes
// d'attribution nous ont appris ce que coûte un filtre qu'il faut penser à
// poser : une seule le portait. Une porte commune se garde une fois ; une
// porte par route se garde soixante-treize fois, et se rate soixante-douze.
//
// L'action se DÉDUIT de la méthode : lire pour GET et HEAD, écrire pour le
// reste. Une règle qui se déduit ne s'oublie pas sur la route qu'on ajoutera
// l'an prochain.
// ─────────────────────────────────────────────────────────────────────────────

/*
 * CE QUI N'A PAS DE MODULE, ET POURQUOI — la liste est aussi importante que
 * l'autre, car une porte oubliée ici serait une porte sans serrure.
 *
 * Trois raisons, et trois seulement :
 *
 *   1. LA PORTE D'ENTRÉE elle-même. Exiger une permission pour s'authentifier
 *      ou pour finir son second facteur fermerait la maison à clé de
 *      l'intérieur.
 *
 *   2. L'ADMINISTRATION DE L'OUTIL, déjà réservée par `roleRequired('admin')`
 *      ou `niveauDirection`. Y ajouter un module créerait une seconde serrure
 *      sur la même porte — et le jour où un plafond est mal réglé, plus
 *      personne ne pourrait entrer le corriger. C'est précisément pour cela
 *      que la direction reste figée en écriture.
 *
 *   3. CE QUI APPARTIENT À CHACUN : son compte, ce qu'il propose, ce qu'on lui
 *      demande de valider, la documentation qui s'impose à tous. Un module
 *      les fermerait à ceux-là mêmes qu'ils concernent.
 */
export const SANS_MODULE = {
  auth:            'la porte d’entrée',
  mfa:             'le second facteur, qui EST l’authentification',
  users:           'administration de l’outil — roleRequired(admin)',
  admin:           'administration de l’outil — roleRequired(admin)',
  sauvegardes:     'administration de l’outil — roleRequired(admin)',
  'profils-acces': 'administration de l’outil — c’est l’écran des droits lui-même',
  parametres:      'administration de l’outil',
  config:          'administration de l’outil',
  etablissement:   'administration de l’outil',
  templates:       'administration de l’outil',
  documentation:   'les textes qui s’imposent à tous',
  suggestions:     'proposer une amélioration, depuis n’importe quel écran',
  demandes:        'le circuit de validation lui-même : le demandeur y accède par nature',
  'mes-cours':     'ce que le professeur propose pour SES cours — chaque route vérifie l’appartenance',
  'suivi-etudiant': 'le dossier confidentiel d’un étudiant — chaque route vérifie le lien (ses enseignants, sa coordination, la direction)',
  due:             'le descriptif d’UE : ses TITULAIRES l’écrivent (rôle professeur sans module « etudiants ») — chaque route juge périmètre de section et attributions',
  historique:      'journal transverse, filtré en son sein selon ce qu’on peut lire',
  audit:           'qui a fait quoi — déjà réservé à la direction par `niveauDirection`',
};

/*
 * LA CARTE. Une entrée par montage, dans l'ordre de `server.js`.
 *
 * Les cas discutables sont commentés plutôt que tranchés en silence : c'est ce
 * que le mode CONSTAT sert à vérifier avant de fermer quoi que ce soit.
 */
export const CARTE = {
  attributions:            'attributions',
  ref:                     'organisation',   // référentiels : sections, UE, cours
  pilotage:                'pilotage',
  exports:                 'pilotage',
  planning:                'planification',
  planification:           'planification',
  'planification-ia':      'planification',
  horaire:                 'planification',
  locaux:                  'planification',
  sequence:                'planification',
  calendrier:              'organisation',
  annees:                  'organisation',
  annuel:                  'organisation',
  rentree:                 'organisation',
  aa:                      'organisation',   // acquis d'apprentissage : référentiel
  prerequis:               'organisation',

  // ── L'étudiant et son parcours ──────────────────────────────────────────
  etudiants:               'etudiants',
  acquis:                  'etudiants',      // notes, délibération, valorisation
  capitalisation:          'etudiants',
  diplomes:                'etudiants',
  attestations:            'etudiants',
  annexe2:                 'etudiants',
  // Un module à part depuis 2.12.207 : l'écriture s'y accorde à la personne.
  amenagements:            'amenagements',
  stages:                  'etudiants',
  'droit-inscription':     'etudiants',
  'frais-scolarite':       'etudiants',
  'stats-deliberation':    'etudiants',
  'doublons-etudiants':    'etudiants',
  'import-suivi':          'etudiants',
  'import-historique':     'etudiants',
  'import-sur-mesure':     'etudiants',
  perimetre:               'etudiants',      // les unités d'un périmètre de délibération
  apercu:                  'etudiants',

  // ── Le personnel ────────────────────────────────────────────────────────
  dossier:                 'personnel',      // dossier administratif
  'dossiers-rh':           'personnel',
  composition:             'personnel',
  classement:              'personnel',
  'anciennete-service':    'personnel',
  contrats:                'personnel',
  nominations:             'personnel',
  ea12:                    'personnel',
  dcpp:                    'personnel',
  // UN DOSSIER DISCIPLINAIRE EST UNE PROCÉDURE D'ÉTUDIANT, PAS UNE AFFAIRE
  // DE PERSONNEL (21 septembre 2026). Rangé sous « personnel », il était
  // fermé en écriture au secrétariat et ouvert en LECTURE aux enseignants.
  disciplinaire:           'procedures',
  grille:                  'personnel',      // grille d'entretien
  assistants:              'personnel',
  'analyse-cv':            'recrutement',   // lecture d'un CV de candidat

  // ── Les pièces qui sortent ──────────────────────────────────────────────
  listes:                  'listes',
  impression:              'listes',
  envois:                  'listes',
  rapports:                'pilotage',
  procedures:              'procedures',

  // ── Ce qui engage l'établissement ───────────────────────────────────────
  budget:                  'budget',
  repartition:             'repartition',
  recrutement:             'recrutement',
  besoins:                 'recrutement',    // les besoins ouvrent les postes

  // ── Le travail d'équipe ─────────────────────────────────────────────────
  // L'échéancier et les réunions portent la démarche qualité, et le CLAUDE.md
  // est explicite : un seul registre, deux lentilles. Ils relèvent des
  // PROCÉDURES, faute d'un module « qualité » qui n'existe pas — à revoir le
  // jour où il existera, plutôt que d'en inventer un ici.
  echeancier:              'procedures',
  reunions:                'procedures',
};

/**
 * UNE ÉCRITURE QUI N'EN EST PAS UNE.
 *
 * L'action se déduit de la méthode, ce qui est juste partout sauf là où un
 * POST sert à PRODUIRE : imprimer une pièce, calculer un rapport, simuler un
 * import. Le corps de la requête y porte des paramètres, pas une modification.
 *
 * Sans cette liste, un compte en lecture seule perdrait le droit d'imprimer —
 * et l'on chercherait pourquoi le secrétariat ne sort plus ses listes.
 */
const LECTURES_EN_POST = [
  /^\/api\/impression\//,
  /^\/api\/rapports\/[^/]+\/(xlsx|pdf)$/,
  /^\/api\/exports\//,
  /^\/api\/apercu\//,
  /\/simuler$/,            // toute simulation : elle n'écrit rien, c'est son objet
  /\/previsualiser$/,
];

/** Lire ou écrire ? La méthode décide, sauf pour ce qui ne fait que produire. */
export function actionDe(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return 'lire';
  const chemin = req.originalUrl.split('?')[0];
  if (LECTURES_EN_POST.some(re => re.test(chemin))) return 'lire';
  return 'ecrire';
}

/*
 * PILOTAGE SE LIT, DOTATION S'ENGAGE — ET CE N'EST PAS LE MÊME CADENAS.
 *
 * Le montage ne suffit pas toujours : la dotation vit sous `/api/pilotage/`,
 * si bien qu'un garde posé sur le seul préfixe aurait ouvert la dotation à
 * toute coordination ayant le reporting. C'est très exactement ce que la
 * séparation des deux modules a été créée pour empêcher — « elle consulte,
 * elle propose, elle n'engage pas » serait redevenu inexprimable, et cette
 * fois sans que personne s'en aperçoive, puisqu'un module existait.
 *
 * Les affinements se lisent AVANT la carte des préfixes. Ils restent rares à
 * dessein : une exception par route ramènerait le filtre qu'il faut penser à
 * poser. Celle-ci existe parce que deux modules partagent une porte.
 */
const AFFINEMENTS = [
  { motif: /^\/api\/pilotage\/dotation/, module: 'dotation' },
];

/**
 * Le module d'une requête : l'affinement s'il y en a un, sinon le préfixe de
 * montage — ou null quand la porte n'a délibérément pas de module.
 */
export function moduleDe(prefixe, chemin = '') {
  const fin = AFFINEMENTS.find(a => a.motif.test(chemin));
  if (fin) return fin.module;
  return CARTE[prefixe] || null;
}

/**
 * documents.js — Catalogue des documents que Lucie sait produire.
 *
 * Dix points d'impression s'étaient dispersés dans l'application, chacun avec
 * sa fenêtre, son aperçu et son enveloppe. Cette dispersion nous a coûté
 * plusieurs régressions : une correction de mise en page n'atteignait qu'un
 * document sur dix.
 *
 * Le catalogue est DÉCLARATIF : un document s'y décrit, il n'a plus besoin de
 * son propre écran. Le centre d'impression lit cette liste et construit
 * l'interface à partir d'elle.
 */
import db from '../db/index.js';

/**
 * Le centre d'impression des ÉTUDIANTS : le contrat de travail n'y figure pas,
 * il relève du personnel et a son propre écran.
 *
 * Chaque document déclare :
 *  - cle          identifiant stable
 *  - libelle      ce que l'utilisateur lit
 *  - portee       'etudiant' | 'professeur' | 'section' | 'etablissement'
 *  - lot          true si plusieurs pièces peuvent être tirées d'un coup
 *  - route        où le produire, et par quelle méthode
 *  - parametres   ce que l'écran doit demander avant de produire
 *  - roles        qui peut le produire ; null = tout le monde
 *  - nomFichier   comment nommer la pièce séparée
 *  - destinataires  À QUI LA PIÈCE S'ENVOIE, et ce n'est pas un choix :
 *        'etudiant'   — la personne nommée sur la pièce
 *        'professeur' — le professeur concerné
 *        'conseil'    — la composition du Conseil de la séance, la boîte de
 *                       service des examens, et la direction adjointe
 *        null         — pièce qui ne s'envoie pas
 *
 *    Laisser choisir le destinataire à l'écran, c'est rouvrir la porte à
 *    l'erreur que la règle referme : une attestation part à l'étudiant qu'elle
 *    nomme, pas à celui qu'on a sélectionné juste avant.
 */
export const DOCUMENTS = [
  {
    cle: 'attestation_reussite',
    libelle: "Attestation de réussite d'unité",
    description: "Une attestation par unité d'enseignement réussie.",
    portee: 'etudiant', lot: true, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/attestations/etudiant/:id/document' },
    routeLot: { methode: 'POST', chemin: '/api/attestations/lot' },
    parametres: ['annee', 'section', 'ue'],
    nomFichier: '{nom}_{prenom}_UE{ue}_{annee}',
    destinataires: 'etudiant',
    roles: null,
  },
  {
    cle: 'motivation_decision',
    libelle: "Motivation d'une décision (refus / ajournement)",
    description: "Annexes 8 et 9 — pour les unités en échec, jamais de points.",
    portee: 'etudiant', lot: true, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/acquis/motivation/:id/:ue/document' },
    parametres: ['annee', 'section', 'ue'],
    nomFichier: 'Motivation_UE{ue}_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'],
  },
  {
    cle: 'bulletin',
    libelle: 'Bulletin de parcours',
    description: "Toutes les unités, année après année, cotes sur 20 (NA sous 10), et le schéma de capitalisation en annexe.",
    portee: 'etudiant', lot: true, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/etudiants/:id/bulletin/document' },
    parametres: ['annee'],
    nomFichier: 'Bulletin_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'],
  },
  {
    cle: 'annexe1',
    libelle: 'Visa ou titre de séjour étudiant (annexe 1)',
    description: "Formulaire standard de l'Office des Étrangers (AM du 28 mars 2022, art. 99 AR du 8 octobre 1981).",
    portee: 'etudiant', lot: true, groupe: 'Étudiants',
    // En nombre : POST /api/etudiants/pieces-dossier-lot, étudiants en SLE seulement.
    route: { methode: 'POST', chemin: '/api/annexe1/document' },
    parametres: ['annee', 'situation', 'raisons'],
    nomFichier: 'Annexe1_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  {
    cle: 'annexe2',
    libelle: 'Attestation du progrès des études (annexe 2)',
    description: "Formulaire de l'Office des Étrangers. Réclame la nationalité.",
    portee: 'etudiant', lot: true, groupe: 'Étudiants',
    route: { methode: 'POST', chemin: '/api/annexe2/document' },
    parametres: ['annee', 'motif', 'avis'],
    nomFichier: 'Annexe2_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  {
    cle: 'fiche_inscription',
    libelle: "Fiche d'inscription / reçu",
    description: "Récapitulatif du PAE, droits d'inscription et engagement signé.",
    portee: 'etudiant', lot: true, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/etudiants/:id/fiche-inscription' },
    parametres: ['annee'],
    nomFichier: 'Inscription_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: null,
  },
  {
    cle: 'frais_scolarite',
    libelle: 'Frais de scolarité',
    description: "Document distinct de la fiche : l'administration n'en connaît pas.",
    portee: 'etudiant', lot: true, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/frais-scolarite/etudiant/:id/document' },
    parametres: ['annee'],
    nomFichier: 'Frais_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  {
    cle: 'valorisation_ue',
    libelle: 'Valorisation des acquis — PV et attestations',
    description: "Annexe 4 (procès-verbal) et annexe 15 / 14 (attestations de "
      + "réussite par valorisation). Pièce d'UNITÉ : elle porte tous les "
      + "étudiants valorisés dans l'unité cette année-là.",
    // Une portée d'UNITÉ, et non d'étudiant : le procès-verbal ne se découpe
    // pas par personne. Elle se déclare ici pour que le catalogue reste la
    // seule porte, même quand la pièce s'ouvre depuis la fiche d'un étudiant.
    portee: 'unite', lot: false, groupe: 'Unités',
    route: { methode: 'POST', chemin: '/api/attestations/valorisation/ue/:ueNum/documents' },
    parametres: ['annee', 'ue'],
    nomFichier: 'Valorisation_UE{ue}_{annee}',
    destinataires: 'conseil',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  /* LA NOTIFICATION DES DÉCISIONS DE VA, PAR ÉTUDIANT (7 octobre 2026) :
     toutes ses demandes de l'année dont la décision est validée, et la
     motivation DU CONSEIL. Composition : lib/pieceNotificationVA.js. */
  {
    cle: 'valorisation_notification',
    libelle: 'Valorisation des acquis — notification des décisions',
    description: "Lettre de la direction à l'étudiant : chaque unité demandée, la décision du Conseil, sa motivation ; mention de l'absence de recours.",
    portee: 'etudiant', lot: false, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/etudiants/:id/valorisations/notification' },
    parametres: ['annee'],
    nomFichier: 'VA_Notification_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  /* LE SCHÉMA DE CAPITALISATION D'UNE SECTION (5 octobre 2026), A4 paysage :
     Éditions → Organisation → Schémas de capitalisation, ou Structure. Le
     dessin vient de l'écran, la mise en page de l'enveloppe commune. */
  {
    cle: 'schema_capitalisation',
    libelle: 'Schéma de capitalisation',
    description: "Les unités d'une section par bloc, et leurs prérequis — A4 paysage, avec légende.",
    portee: 'section', lot: false, groupe: 'Organisation',
    route: { methode: 'POST', chemin: '/api/capitalisation/document' },
    parametres: ['annee', 'section'],
    nomFichier: 'Schema_capitalisation_{section}_{annee}',
    destinataires: null,
    roles: null,
  },
  /* LES PIÈCES D'UN DOSSIER D'AMÉNAGEMENTS RAISONNABLES (décret du 30 juin
     2016). Elles se produisent depuis le dossier — fiche de l'étudiant, onglet
     Aménagements —, qui est leur porte ; elles se déclarent ici pour que le
     catalogue reste la liste complète de ce qui sort de Lucie. Composition :
     lib/piecesAmenagement.js. Les rôles d'écriture du module ; une personne
     à qui la direction a accordé le module le peut aussi (fiche d'accès). */
  {
    cle: 'amenagement_formulaire',
    libelle: "Aménagements raisonnables — demande (cadres A et B)",
    description: "Le formulaire recomposé depuis le dossier. Pièce confidentielle.",
    portee: 'etudiant', lot: false, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/amenagements/dossier/:dossier/piece/formulaire' },
    parametres: ['annee'],
    nomFichier: 'AR_Demande_{nom}_{prenom}_{annee}',
    destinataires: null,
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  {
    cle: 'amenagement_decision',
    libelle: "Aménagements raisonnables — décision du Conseil des études",
    description: "Décision motivée (art. 6 § 2) : mesures accordées, refusées et leurs motifs.",
    portee: 'etudiant', lot: false, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/amenagements/dossier/:dossier/piece/decision' },
    parametres: ['annee'],
    nomFichier: 'AR_Decision_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  {
    cle: 'amenagement_notification',
    libelle: "Aménagements raisonnables — notification de la décision",
    description: "La lettre de la direction, suivie de la décision, avec les voies de recours.",
    portee: 'etudiant', lot: false, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/amenagements/dossier/:dossier/piece/notification' },
    parametres: ['annee'],
    nomFichier: 'AR_Notification_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  {
    cle: 'amenagement_mesures',
    libelle: "Aménagements raisonnables — fiche « mesures » (chargés de cours)",
    description: "Les seules mesures retenues, jamais la nature de la situation (art. 5).",
    portee: 'etudiant', lot: false, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/amenagements/dossier/:dossier/piece/mesures' },
    parametres: ['annee'],
    nomFichier: 'AR_Mesures_{nom}_{prenom}_{annee}',
    destinataires: 'professeur',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  /* LE CONGÉ-ÉDUCATION PAYÉ (29 septembre 2026). Une page par unité, suivie de
     son horaire détaillé ; l'assiduité ne sort pas tant qu'une séance passée
     n'a pas ses présences. Composition : lib/piecesCep.js. Porte : la fiche de
     l'étudiant, bloc « Congé-éducation payé ». */
  {
    cle: 'cep_inscription',
    libelle: "Congé-éducation payé — attestation d'inscription régulière",
    description: "À remettre à l'employeur au plus tard le 31 octobre, ou dans les 15 jours d'une inscription tardive.",
    portee: 'etudiant', lot: false, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/cep/etudiant/:id/piece/inscription' },
    parametres: ['annee'],
    nomFichier: 'CEP_Inscription_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  {
    cle: 'cep_assiduite',
    libelle: "Congé-éducation payé — attestation d'assiduité",
    description: "Par unité et par période de trois mois à compter du début de l'unité ; lue des présences encodées.",
    portee: 'etudiant', lot: false, groupe: 'Étudiants',
    route: { methode: 'GET', chemin: '/api/cep/etudiant/:id/piece/assiduite' },
    parametres: ['annee'],
    nomFichier: 'CEP_Assiduite_{nom}_{prenom}_{annee}',
    destinataires: 'etudiant',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
];

/** Le catalogue taillé au périmètre de la personne. */
export function documentsPour(user) {
  const role = user?.role;
  return DOCUMENTS.filter(d => !d.roles || d.roles.includes(role))
    .map(({ route, routeLot, routePdf, ...reste }) => ({
      ...reste,
      // Le chemin est exposé pour permettre au centre d'assembler un DOSSIER —
      // plusieurs documents pour plusieurs étudiants. Il reste une route
      // normale, soumise aux mêmes contrôles d'accès.
      route,
      // Les chemins ne sortent pas : l'écran passe par le centre, qui seul
      // décide où appeler. Sans quoi on recréerait la dispersion.
      lotPossible: !!routeLot,
    }));
}

/** Retrouve la déclaration complète, chemins compris — usage serveur. */
export function documentParCle(cle) {
  return DOCUMENTS.find(d => d.cle === cle) || null;
}

/**
 * Les valeurs proposées pour un paramètre. L'écran ne connaît pas la base :
 * il demande au centre ce qu'il peut offrir.
 */
export function valeursParametre(nom, filtres = {}) {
  switch (nom) {
    case 'annee':
      return db.prepare(`
        SELECT DISTINCT annee_scolaire AS valeur FROM etudiant_inscription
        ORDER BY annee_scolaire DESC
      `).all().map(r => ({ valeur: r.valeur, libelle: r.valeur }));

    case 'section':
      return db.prepare('SELECT code AS valeur, libelle FROM section ORDER BY code')
        .all().map(r => ({ valeur: r.valeur, libelle: r.libelle || r.valeur }));

    case 'ue': {
      const params = [];
      let where = 'ue_num IS NOT NULL';
      if (filtres.section) { where += ' AND section = ?'; params.push(filtres.section); }
      return db.prepare(`
        SELECT DISTINCT ue_num AS valeur, ue_nom AS libelle FROM ue
        WHERE ${where} ORDER BY ue_num
      `).all(...params);
    }

    default:
      return [];
  }
}

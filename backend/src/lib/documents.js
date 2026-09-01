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
 * Chaque document déclare :
 *  - cle          identifiant stable
 *  - libelle      ce que l'utilisateur lit
 *  - portee       'etudiant' | 'professeur' | 'section' | 'etablissement'
 *  - lot          true si plusieurs pièces peuvent être tirées d'un coup
 *  - route        où le produire, et par quelle méthode
 *  - parametres   ce que l'écran doit demander avant de produire
 *  - roles        qui peut le produire ; null = tout le monde
 *  - nomFichier   comment nommer la pièce séparée
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
    roles: null,
  },
  {
    cle: 'annexe2',
    libelle: 'Attestation du progrès des études (annexe 2)',
    description: "Formulaire de l'Office des Étrangers. Réclame la nationalité.",
    portee: 'etudiant', lot: false, groupe: 'Étudiants',
    route: { methode: 'POST', chemin: '/api/annexe2/document' },
    parametres: ['annee', 'motif', 'avis'],
    nomFichier: 'Annexe2_{nom}_{prenom}_{annee}',
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
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat'],
  },
  {
    cle: 'contrat',
    libelle: 'Contrat de travail',
    description: 'Contrat du membre du personnel, selon le modèle paramétré.',
    portee: 'professeur', lot: false, groupe: 'Personnel',
    route: { methode: 'POST', chemin: '/api/contrats/apercu' },
    routePdf: { methode: 'POST', chemin: '/api/contrats/pdf' },
    parametres: ['annee', 'professeur'],
    nomFichier: 'Contrat_{nom}_{prenom}_{annee}',
    roles: ['admin', 'directeur', 'directeur_adjoint', 'editeur'],
  },
];

/** Le catalogue taillé au périmètre de la personne. */
export function documentsPour(user) {
  const role = user?.role;
  return DOCUMENTS.filter(d => !d.roles || d.roles.includes(role))
    .map(({ route, routeLot, routePdf, ...reste }) => ({
      ...reste,
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

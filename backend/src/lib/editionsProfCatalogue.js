/**
 * LE CATALOGUE DE « MES ÉDITIONS » (3.5.340, Charles, 11 novembre 2026 : « un centre Éditions pour les profs : listes
 * d'étudiants, résultats de leurs cours, étudiants en seconde session, dispensés, présences, statistiques… réfléchis à ce dont
 * un prof du supérieur a besoin »).
 *
 * Données seules — aucune dépendance : le catalogue général des pièces (`lib/documents.js`) et le compositeur
 * (`lib/editionsProf.js`) lisent la même liste. Une pièce = un cours choisi par l'enseignant ; la règle d'accès est celle de
 * Mes cours (`accesCours`). `tableur` : la pièce sort aussi en Excel ; `paysage` : A4 paysage ; `session` : la pièce se
 * demande pour la 1re ou la 2e session.
 */
export const FAMILLES_EDITIONS_PROF = [
  { k: 'examens', libelle: 'Mes examens' },
  { k: 'resultats', libelle: 'Mes résultats' },
  { k: 'statistiques', libelle: 'Mes statistiques' },
  { k: 'etudiants', libelle: 'Mes étudiants et présences' },
];

export const CATALOGUE_EDITIONS_PROF = [
  { id: 'emargement', famille: 'examens', libelle: "Feuille d'émargement d'examen",
    aide: 'Une page par passage (date, heure, local, partie) : nom, matricule, signature, remarque. Les dispensés n’y sont pas.',
    tableur: true, paysage: false, session: true },
  { id: 'grille-cotation', famille: 'examens', libelle: 'Grille de cotation vierge',
    aide: 'Vos étudiants × les acquis du cours, avec leur poids dans le cours, et la note du cours à remplir.',
    tableur: true, paysage: true, session: false },
  { id: 'seconde-session', famille: 'examens', libelle: 'Étudiants en seconde session',
    aide: 'Les ajournés qui représentent votre cours, leurs acquis à représenter, et la date de l’examen de seconde session.',
    tableur: true, paysage: false, session: false },
  { id: 'dispenses', famille: 'examens', libelle: 'Étudiants dispensés',
    aide: 'Valorisation (unité, cours, acquis) et reports de notes : pour chacun, ce qui ne lui est pas demandé dans votre cours.',
    tableur: true, paysage: false, session: false },

  { id: 'releve', famille: 'resultats', libelle: 'Relevé de notes du cours',
    aide: 'Par étudiant : la note de chaque acquis, la note du cours (indicative), PP · NP · CM, et le justificatif sous 10.',
    tableur: true, paysage: true, session: true },
  { id: 'resultats', famille: 'resultats', libelle: 'Résultats après délibération',
    aide: 'La décision de l’unité (réussi, ajourné, refusé, faveur) et la note d’unité, pour les étudiants dont la séance est close.',
    tableur: true, paysage: false, session: false },

  { id: 'statistiques', famille: 'statistiques', libelle: 'Statistiques du cours',
    aide: 'Répartition des notes, moyenne, médiane, taux de réussite ; les acquis qui font échouer ; présence et réussite ; années précédentes et groupes.',
    tableur: true, paysage: false, session: true },

  { id: 'appel', famille: 'etudiants', libelle: "Liste d'appel par groupe",
    aide: 'Une page par groupe, six séances à cocher (les dates des prochaines séances quand l’horaire les connaît).',
    tableur: false, paysage: true, session: false },
  { id: 'adresses', famille: 'etudiants', libelle: "Adresses d'école",
    aide: 'NOM Prénom, matricule, adresse d’école et groupe.',
    tableur: true, paysage: false, session: false },
  { id: 'amenagements', famille: 'etudiants', libelle: 'Étudiants avec aménagement raisonnable',
    aide: 'Les seules mesures accordées pour cette unité — rien d’autre du dossier (secret professionnel).',
    tableur: false, paysage: false, session: false },
  { id: 'presences', famille: 'etudiants', libelle: 'Récapitulatif des présences',
    aide: 'Par étudiant : heures dues, présentes, justifiées, injustifiées, taux — signalés au-delà des seuils de l’école.',
    tableur: true, paysage: true, session: false },
  { id: 'fiche', famille: 'etudiants', libelle: 'Fiche du cours',
    aide: 'L’unité, les périodes, l’autonomie, l’évaluation, les acquis et leur poids, le programme du dossier pédagogique.',
    tableur: false, paysage: false, session: false },
  { id: 'horaire', famille: 'etudiants', libelle: "Mon horaire de l'année",
    aide: 'Toutes vos séances de l’année, mois par mois, avec vos dates d’examens et de délibérations.',
    tableur: true, paysage: false, session: false, sansCours: true },
];

export const pieceEditionProf = id => CATALOGUE_EDITIONS_PROF.find(p => p.id === id) || null;

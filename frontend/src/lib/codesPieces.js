// ─────────────────────────────────────────────────────────────────────────────
// LES CODES DES PIÈCES ÉTUDIANTES (3.5.376, Charles, 12 novembre 2026 : « numéroter les types de documents étudiants, ils deviennent
// nombreux ; et peut-être des codes couleurs » ; tranché : par famille — R-01, I-01… — ; à l'écran, sur la pièce imprimée, et une
// liste de référence ; un filet discret par famille, jamais une couleur d'état).
// DEUX COPIES, UNE TABLE : celle-ci (écrans) et backend/src/lib/codesPieces.js (pièces, liste imprimable). Qui change l'une change
// l'autre. Un code ne se réattribue jamais : une pièce retirée garde le sien, une pièce nouvelle prend le suivant de sa famille.
// ─────────────────────────────────────────────────────────────────────────────
export const FAMILLES = [
  { k: 'R', nom: 'Résultats', couleur: '#19537E' },
  { k: 'I', nom: 'Inscription', couleur: '#05B7E6' },
  { k: 'A', nom: 'Office des Étrangers', couleur: '#F9B619' },
  { k: 'C', nom: 'Congé-éducation payé', couleur: '#64748B' },
  { k: 'V', nom: 'Valorisation des acquis', couleur: '#0F766E' },
  { k: 'M', nom: 'Aménagements raisonnables', couleur: '#7C6F5B' },
  // 3.5.693 (Charles, 24 novembre 2026 : « toutes les pièces ne sont pas numérotées » ; tranché : tout numéroter). Les familles des
  // listes d'Éditions (L, P, O, G — numérotées depuis 3.5.651) et la famille D portent aussi les pièces qui ne sont pas des listes.
  { k: 'D', nom: 'Délibération, recours et Conseil', couleur: '#8B5E3C' },
  { k: 'L', nom: 'Listes d’étudiants', couleur: '#3E9BD0' },
  { k: 'P', nom: 'Personnel', couleur: '#16406A' },
  { k: 'O', nom: 'Organisation et équipe', couleur: '#5B7FA6' },
  { k: 'G', nom: 'Gestion', couleur: '#94A3B8' },
];

/** code, clé du catalogue (lib/documents.js), nom, usage — et les clés que les écrans emploient pour la même pièce. */
export const PIECES = [
  { code: 'R-01', cle: 'attestation_reussite', nom: 'Attestation de réussite d’unité', usage: 'Une par unité réussie ; signée, cachetée, QR d’authenticité.', alias: ['reussite', 'att', 'att-toutes'] },
  { code: 'R-02', cle: 'motivation_ajournement', nom: 'Motivation d’une décision d’ajournement', usage: 'Acquis par acquis, avec les cours à représenter (annexe 8).', alias: ['ajournement'] },
  { code: 'R-03', cle: 'motivation_refus', nom: 'Motivation d’une décision de refus', usage: 'Acquis par acquis, voies de recours (annexe 9).', alias: ['refus', 'motivation_decision', 'motivation'] },
  { code: 'R-04', cle: 'bulletin', nom: 'Bulletin de parcours', usage: 'Toutes les unités, année après année, et le schéma.', alias: [] },
  { code: 'R-05', cle: 'parcours', nom: 'Parcours de formation', usage: 'Schéma de capitalisation et unités acquises (paysage).', alias: [] },
  { code: 'R-06', cle: 'attestation_stage', nom: 'Attestation de stages', usage: 'Les stages effectués : lieux, périodes, heures, face au minimum de la section.', alias: ['stages', 'att_stage'] },
  { code: 'I-01', cle: 'fiche_inscription', nom: 'Fiche d’inscription / reçu', usage: 'PAE, droits d’inscription, engagement signé.', alias: ['fiche'] },
  { code: 'I-02', cle: 'attestation_inscription', nom: 'Attestation d’inscription', usage: 'Mutuelle, CPAS, employeur… : dates, congés, bloc, crédits.', alias: ['att_inscription', 'att-ins'] },
  { code: 'I-03', cle: 'attestation_allocations', nom: 'Attestation d’inscription — allocations familiales', usage: 'Pour la caisse d’allocations familiales.', alias: ['att_allocations', 'att-af'] },
  { code: 'I-04', cle: 'frais_scolarite', nom: 'Frais de scolarité', usage: 'Ce qui est dû, versé, et le QR de paiement.', alias: ['frais'] },
  { code: 'I-05', cle: 'pae', nom: 'Programme annuel de l’étudiant (PAE)', usage: 'Les unités de l’année et leurs crédits.', alias: [] },
  { code: 'I-06', cle: 'attestation_stib', nom: 'Attestation de fréquentation scolaire — STIB', usage: 'Pour l’abonnement scolaire STIB (moins de 25 ans, selon l’horaire).', alias: ['stib'] },
  { code: 'A-01', cle: 'annexe1', nom: 'Visa ou titre de séjour étudiant (annexe 1)', usage: 'Ressortissant d’un pays tiers, séjour limité aux études.', alias: [] },
  { code: 'A-02', cle: 'annexe2', nom: 'Progrès des études (annexe 2)', usage: 'Crédits de l’année et progression, pour l’Office des Étrangers.', alias: [] },
  { code: 'C-01', cle: 'cep_inscription', nom: 'Congé-éducation — attestation d’inscription régulière', usage: 'À l’employeur, au plus tard le 31 octobre.', alias: ['cep-i'] },
  { code: 'C-02', cle: 'cep_assiduite', nom: 'Congé-éducation — attestation d’assiduité', usage: 'Par période de trois mois, d’après les présences.', alias: ['cep-a'] },
  { code: 'C-03', cle: 'cep_seconde_session', nom: 'Congé-éducation — attestation de seconde session', usage: 'Unités ajournées et dates de seconde session.', alias: ['cep-s'] },
  { code: 'V-01', cle: 'valorisation_notification', nom: 'Valorisation — notification des décisions', usage: 'À l’étudiant, après la séance de valorisation.', alias: [] },
  { code: 'V-02', cle: 'valorisation_ue', nom: 'Valorisation — PV et attestations', usage: 'Annexe 4 et attestations de réussite par valorisation.', alias: [] },
  { code: 'M-01', cle: 'amenagement_formulaire', nom: 'Aménagements — demande (cadres A et B)', usage: 'Le formulaire de la demande.', alias: [] },
  { code: 'M-02', cle: 'amenagement_decision', nom: 'Aménagements — décision du Conseil des études', usage: 'Décision motivée.', alias: [] },
  { code: 'M-03', cle: 'amenagement_notification', nom: 'Aménagements — notification de la décision', usage: 'Lettre et décision, une enveloppe.', alias: [] },
  { code: 'M-04', cle: 'amenagement_mesures', nom: 'Aménagements — fiche « mesures »', usage: 'Aux chargés de cours : les seules mesures accordées.', alias: [] },
  { code: 'R-07', cle: 'diplome_diplome', nom: 'Diplôme', usage: 'Le titre de la section, signé à la main.', alias: ['diplome'] },
  { code: 'R-08', cle: 'diplome_attestation', nom: 'Attestation de réussite de section', usage: 'La section réussie, sa note finale et sa mention.', alias: [] },
  { code: 'R-09', cle: 'diplome_provisoire', nom: 'Attestation provisoire de réussite', usage: 'En attendant le diplôme.', alias: [] },
  { code: 'M-05', cle: 'amenagement_accuse', nom: 'Aménagements — accusé de réception de la demande', usage: 'À l’étudiant, avant la décision, avec le formulaire.', alias: [] },
  { code: 'D-01', cle: 'delib_pv', nom: 'Procès-verbal de délibération', usage: 'Annexes 3 et 5 : la séance, les présences, les décisions.', alias: ['pv', 'pv_anonyme'] },
  { code: 'D-02', cle: 'delib_conseil', nom: 'Composition du Conseil des études', usage: 'Annexe 2.', alias: ['conseil'] },
  { code: 'D-03', cle: 'delib_grille', nom: 'Grille de délibération', usage: 'Les cotes de travail du Conseil, acquis par acquis.', alias: ['grille'] },
  { code: 'D-04', cle: 'delib_ajustements', nom: 'Ajustements du Conseil', usage: 'Faveurs et corrections, avec leur auteur.', alias: ['ajustements'] },
  { code: 'D-05', cle: 'delib_motivations', nom: 'Motivations du Conseil', usage: 'Acquis par acquis, pour toute l’unité.', alias: ['motivations'] },
  { code: 'D-06', cle: 'delib_listes', nom: 'Listes des ajournés, cours par cours', usage: 'Ce que chaque ajourné représente.', alias: ['listes'] },
  { code: 'D-07', cle: 'liste_diplomes', nom: 'Liste des diplômés', usage: 'Le formulaire de la Fédération.', alias: [] },
  { code: 'D-08', cle: 'pv_section', nom: 'Procès-verbal de section', usage: 'Le jury de section et ses décisions.', alias: [] },
  { code: 'D-09', cle: 'procedure_accuse_reception', nom: 'Recours — accusé de réception d’une plainte', usage: 'À l’étudiant qui introduit un recours.', alias: [] },
  { code: 'D-10', cle: 'procedure_irrecevabilite', nom: 'Recours — décision d’irrecevabilité', usage: 'Plainte hors délai ou incomplète, motivée.', alias: [] },
  { code: 'D-11', cle: 'procedure_decision_recours', nom: 'Recours — décision motivée', usage: 'La décision sur recours interne.', alias: [] },
  { code: 'D-12', cle: 'procedure_convocation', nom: 'Discipline — convocation à une audition', usage: 'À l’étudiant concerné.', alias: [] },
  { code: 'D-13', cle: 'procedure_pv_audition', nom: 'Discipline — procès-verbal d’audition', usage: 'Ce qui a été dit, signé.', alias: [] },
  { code: 'D-14', cle: 'procedure_decision_disciplinaire', nom: 'Discipline — décision motivée', usage: 'La décision et la sanction.', alias: [] },
  { code: 'L-21', cle: 'coordonnees_etudiants', nom: 'Coordonnées des étudiants', usage: 'Adresses, téléphones, courriels.', alias: [] },
  { code: 'L-22', cle: 'parcours_section', nom: 'Parcours des étudiants — section × unités', usage: 'Une ligne par étudiant, une colonne par unité.', alias: [] },
  { code: 'L-23', cle: 'inscrits_grille', nom: 'Inscrits par unité — la grille', usage: 'Étudiants × unités de la section.', alias: [] },
  { code: 'L-24', cle: 'inscrits_unites', nom: 'Inscrits par unité — la liste', usage: 'Une liste par unité.', alias: [] },
  { code: 'P-21', cle: 'contrat_cc', nom: 'Contrat de travail — chargé de cours', usage: 'Le contrat de l’année.', alias: [] },
  { code: 'P-22', cle: 'contrat_expert_superieur', nom: 'Contrat d’expert — supérieur', usage: 'Le contrat de l’année.', alias: [] },
  { code: 'P-23', cle: 'contrat_expert_secondaire', nom: 'Contrat d’expert — secondaire', usage: 'Le contrat de l’année.', alias: [] },
  { code: 'P-24', cle: 'fiche_attributions', nom: 'Fiche d’attributions', usage: 'Ce qui est confié à un enseignant, cours par cours.', alias: [] },
  { code: 'P-25', cle: 'fiche_signaletique', nom: 'Fiche signalétique officielle', usage: 'Le formulaire de la Fédération, rempli.', alias: [] },
  { code: 'P-26', cle: 'ea12', nom: 'EA12 — document 12', usage: 'Les prestations, mois par mois.', alias: [] },
  { code: 'P-27', cle: 'coordonnees_personnel', nom: 'Coordonnées du personnel', usage: 'Adresses, téléphones, courriels.', alias: [] },
  { code: 'P-28', cle: 'offre', nom: 'Offre d’emploi', usage: 'L’appel à candidatures.', alias: [] },
  { code: 'P-29', cle: 'annexe_ppc', nom: 'Disponibilités et pertes partielles de charge', usage: 'L’annexe de la circulaire.', alias: ['ppc'] },
  { code: 'O-31', cle: 'due', nom: 'Descriptif d’unité (DUE)', usage: 'L’unité de l’année : acquis, évaluation, programme.', alias: [] },
  { code: 'O-32', cle: 'listes_cours', nom: 'Listes d’un cours', usage: 'Une feuille par groupe.', alias: [] },
  { code: 'O-33', cle: 'convention_cadre_stage', nom: 'Convention-cadre de stage', usage: 'Avec un lieu de stage.', alias: [] },
  { code: 'O-34', cle: 'convention_partenariat', nom: 'Partenariat pédagogique', usage: 'Avec un partenaire.', alias: [] },
  { code: 'O-35', cle: 'convention_etablissements', nom: 'Convention entre établissements', usage: 'Avec un autre établissement.', alias: [] },
  { code: 'O-36', cle: 'modele_libre', nom: 'Modèle de l’éditeur', usage: 'Un modèle écrit dans Configuration.', alias: [] },
  { code: 'O-37', cle: 'reunion_pv', nom: 'Procès-verbal de réunion', usage: 'Ce qui a été dit et décidé.', alias: [] },
  { code: 'O-38', cle: 'reunion_pv_integral', nom: 'Procès-verbal de réunion — intégral', usage: 'Avec la partie confidentielle.', alias: [] },
  { code: 'O-39', cle: 'taches', nom: 'Feuille des tâches', usage: 'Qui fait quoi, pour quand.', alias: [] },
  { code: 'O-40', cle: 'rapport_mensuel', nom: 'Rapport d’activité mensuel', usage: 'Le mois de l’équipe.', alias: [] },
  { code: 'P-A1bis', cle: 'formulaire_A1bis', nom: 'A1 bis — EA12 supérieur (Doc12)', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A1ter', cle: 'formulaire_A1ter', nom: 'A1 ter — EA12 expert', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A2', cle: 'formulaire_A2', nom: 'A2 — Déclaration de cumul interne', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A3', cle: 'formulaire_A3', nom: 'A3 — Fiche signalétique', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A4', cle: 'formulaire_A4', nom: 'A4 — Prestation de serment', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A5', cle: 'formulaire_A5', nom: 'A5 — Services antérieurs', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A5bis', cle: 'formulaire_A5bis', nom: 'A5 bis — Services antérieurs, secteur privé', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A6', cle: 'formulaire_A6', nom: 'A6 — Admissibilité des services rendus', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A7', cle: 'formulaire_A7', nom: 'A7 — Allocation de foyer', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A8', cle: 'formulaire_A8', nom: 'A8 — Précompte professionnel', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A9', cle: 'formulaire_A9', nom: 'A9 — Dérogation linguistique', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A10', cle: 'formulaire_A10', nom: 'A10 — Pécule jeune diplômé', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A11', cle: 'formulaire_A11', nom: 'A11 — Fin de disponibilité maladie en été', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A12', cle: 'formulaire_A12', nom: 'A12 — Accident du travail (temporaire)', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A13', cle: 'formulaire_A13', nom: 'A13 — Accident hors service (A)', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A13bis', cle: 'formulaire_A13bis', nom: 'A13 bis — Accident hors service (B)', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A14', cle: 'formulaire_A14', nom: 'A14 — Relevé mensuel des ANRJ', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A15', cle: 'formulaire_A15', nom: 'A15 — Relevé des absences pour grève', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A16', cle: 'formulaire_A16', nom: 'A16 — Dérogation limite d’âge / pensionné', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A17', cle: 'formulaire_A17', nom: 'A17 — Frais funéraires', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A18', cle: 'formulaire_A18', nom: 'A18 — Autorisation de cumul', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A19', cle: 'formulaire_A19', nom: 'A19 — Assimilation à titre suffisant', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A20', cle: 'formulaire_A20', nom: 'A20 — PV d’ETD, affectation, mutation', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A21', cle: 'formulaire_A21', nom: 'A21 — PV d’engagement définitif du directeur', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A24', cle: 'formulaire_A24', nom: 'A24 — PV d’ETD, personnel administratif', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A25', cle: 'formulaire_A25', nom: 'A25 — Changement d’affectation, mutation', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A26', cle: 'formulaire_A26', nom: 'A26 — PV d’ETD, fonction de recrutement', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A26bis', cle: 'formulaire_A26bis', nom: 'A26 bis — Fiche récapitulative d’ETD', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A27', cle: 'formulaire_A27', nom: 'A27 — Prestations mensuelles de l’expert', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A28', cle: 'formulaire_A28', nom: 'A28 — Dérogation au profit d’un expert', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A29', cle: 'formulaire_A29', nom: 'A29 — Expérience utile (supérieur)', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A30', cle: 'formulaire_A30', nom: 'A30 — Expérience utile, cours et activités', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A31', cle: 'formulaire_A31', nom: 'A31 — Expérience utile, attestation salarié', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A32', cle: 'formulaire_A32', nom: 'A32 — Expérience utile, indépendant', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A33', cle: 'formulaire_A33', nom: 'A33 — Expérience utile, valorisation', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
  { code: 'P-A34', cle: 'formulaire_A34', nom: 'A34 — Dépassement du tiers (art. 77)', usage: 'Formulaire de la circulaire 9760 : le code reprend son numéro d’annexe.', alias: [] },
];


/* LES LISTES D'ÉDITIONS (3.5.651 → 3.5.654) : un code par liste, d'après le catalogue complet des familles — le même pour tous. Écrit
   UNE fois ici (3.5.693) : Éditions et la galerie des pièces le lisent. Une liste nouvelle s'ajoute en fin de sa famille. */
export const PREFIXE_LISTE = { etudiants: 'L', personnel: 'P', organisation: 'O', gestion: 'G' };
export const FAMILLES_RAPPORTS = {
  etudiants: [
    ['Qui est inscrit ?', ['inscrits-par-ue', 'listes-par-ue', 'organisation-effectifs', 'mouvements-annee', 'registre-matricule', 'pae-a-regulariser', 'pae-hors-regle']],
    ['Qui est présent ?', ['grille-presences']],
    ['Qui passe quel examen ?', []],
    ['Quels résultats ?', ['resultats-section', 'seconde-session']],
    ['Qui a besoin de quoi ?', ['dossiers-incomplets']],
    ['Qui contacter ?', []],
  ],
  personnel: [
    ['Le personnel', ['personnel-liste', 'personnel-par-section', 'personnel-temporaires', 'statistiques-personnel']],
    ['La charge', ['personnel-attributions', 'personnel-charge', 'personnel-encadrement']],
    ['Les absences', ['registre-absences']],
  ],
  organisation: [
    ['Le programme', ['referentiel-ue', 'referentiel-cours', 'referentiel-poids-ue', 'grille-section', 'referentiel-acquis', 'repartition-acquis']],
    ['Qui enseigne', ['referentiel-profs-ue', 'referentiel-ue-sans-attribution']],
    ['L’année : examens et délibérations', ['canevas-examens', 'evaluations-manquantes', 'organisation-seances']],
    ['Les lieux', ['organisation-locaux']],
    ['Les dates des UE', ['dates-ue']],   // 3.5.686 — famille propre, en dernier : les codes des autres listes ne bougent pas
    ['Les cours à désigner', ['cours-a-designer']],   // 3.5.752 — famille propre, en dernier : les codes des autres listes ne bougent pas
  ],
  gestion: [
    ['La charge et la dotation', ['dotation-felsi', 'etp', 'iip-helb-annees']],
    ['Les chiffres', ['chiffres-cles', 'cout-formations']],
  ],
};
/** Les codes d'un domaine : les familles d'abord, puis ce que le catalogue porte en plus (`extras` : ids), le schéma, la liste sur mesure. */
export function codesListes(domaine, extras = []) {
  const m = {}; let n = 0; const px = PREFIXE_LISTE[domaine] || 'X';
  for (const [, ids] of FAMILLES_RAPPORTS[domaine] || []) for (const id of ids) m[id] = `${px}-${String(++n).padStart(2, '0')}`;
  for (const id of extras) if (!m[id]) m[id] = `${px}-${String(++n).padStart(2, '0')}`;
  if (domaine === 'organisation') m.schemas = `${px}-${String(++n).padStart(2, '0')}`;
  m.composer = `${px}-${String(Math.max(10, n + 1)).padStart(2, '0')}`;
  return m;
}
const CODES_LISTES = Object.assign({}, ...Object.keys(PREFIXE_LISTE).map(d => { const m = codesListes(d); delete m.composer; delete m.schemas; return m; }));
/** Le code d'une liste d'Éditions, d'après son id de rapport (« dates-ue » → O-16). */
export const codeListe = id => CODES_LISTES[id] || null;

const parCle = new Map(PIECES.flatMap(p => [[p.cle, p], ...p.alias.map(a => [a, p])]));
export const pieceDe = cle => parCle.get(cle)
  || (String(cle || '').startsWith('rapport_') && codeListe(String(cle).slice(8)) ? { code: codeListe(String(cle).slice(8)), cle } : null)
  || (codeListe(cle) ? { code: codeListe(cle), cle } : null);
export const familleDe = code => FAMILLES.find(f => f.k === String(code || '')[0]) || null;


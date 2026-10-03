/**
 * LES ENDROITS DE LUCIE — ce que la recherche propose (Charles, 3 octobre
 * 2026 : « un champ rechercher qui propose les endroits où aller ; par exemple
 * PAE, et il me liste les liens… comme dans Word »).
 *
 * Une destination : { label, axe, chemin, outil?, mots }.
 *   chemin — l'adresse ; outil — la clé d'un outil du rail Étudiants, posée
 *   dans sessionStorage (« lucie.outil ») que l'écran ouvre à son arrivée.
 *   mots — les synonymes : on cherche avec ses mots, pas avec ceux du menu.
 * Un endroit ajouté à Lucie s'ajoute ici, sinon il ne se trouve pas.
 */
export const DESTINATIONS = [
  // Accueil
  { label: 'Ce qui m’attend', axe: 'Accueil', chemin: '/accueil', mots: 'tableau de bord taches a faire accueil' },
  { label: 'Échéancier', axe: 'Accueil', chemin: '/echeancier', mots: 'echeances calendrier obligations delais dates' },
  { label: 'Suivi d’équipe — échéances et tâches', axe: 'Accueil', chemin: '/accueil?onglet=suivi', mots: 'reunions taches confier equipe suivi' },
  // Étudiants
  { label: 'Inscriptions & PAE — liste des étudiants', axe: 'Étudiants', chemin: '/etudiants', mots: 'pae programme annuel inscription liste etudiants fiche' },
  { label: 'Revue des PAE — parcourir et valider', axe: 'Étudiants', chemin: '/etudiants', outil: 'revue-pae', mots: 'pae valider revue parcourir programme annuel' },
  { label: 'Composer les PAE', axe: 'Étudiants', chemin: '/etudiants', outil: 'passage', mots: 'pae composer passage annee suivante promotion valider en groupe' },
  { label: 'Reports de notes', axe: 'Étudiants', chemin: '/etudiants', outil: 'reports', mots: 'report notes dispense rp pae' },
  { label: 'Créer un étudiant', axe: 'Étudiants', chemin: '/etudiants', outil: 'nouvel-etudiant', mots: 'inscrire nouvel etudiant ajouter creer' },
  { label: 'Contrôler les dossiers (doublons, nationalités…)', axe: 'Étudiants', chemin: '/etudiants', outil: 'controles-dossiers', mots: 'doublons fusion dedoubles nationalites decisions sans inscription controle' },
  { label: 'Diplômes et titres', axe: 'Étudiants', chemin: '/etudiants', outil: 'diplomation', mots: 'diplome titre attestation provisoire epreuve integree mention' },
  { label: 'Valorisation des acquis (VA / VAE)', axe: 'Étudiants', chemin: '/etudiants?onglet=valorisation', mots: 'va vae valorisation dispense admission acquis recevabilite avis conseil' },
  { label: 'Aménagements raisonnables', axe: 'Étudiants', chemin: '/etudiants?onglet=amenagements', mots: 'amenagement raisonnable handicap besoins specifiques ar dys' },
  { label: 'Délibération', axe: 'Étudiants', chemin: '/etudiants?onglet=deliberation', mots: 'deliberation notes jury conseil seance pv proces verbal faveur ajournement refus' },
  { label: 'Procédures (recours, fraude, disciplinaire)', axe: 'Étudiants', chemin: '/etudiants?onglet=procedures', mots: 'recours fraude disciplinaire procedure plainte' },
  { label: 'Présences', axe: 'Étudiants', chemin: '/etudiants?onglet=presences', mots: 'presences absences assiduite cep conge education' },
  // Personnel
  { label: 'Personnel — liste des membres', axe: 'Personnel', chemin: '/professeurs', mots: 'personnel professeurs enseignants membres fiche contrat' },
  { label: 'Besoins & offres', axe: 'Personnel', chemin: '/besoins', mots: 'besoins offres emploi vacants' },
  { label: 'Classement & prioritaires', axe: 'Personnel', chemin: '/classement', mots: 'classement prioritaires anciennete' },
  { label: 'Recrutement', axe: 'Personnel', chemin: '/recrutement', mots: 'recrutement candidats entretien' },
  { label: 'Mes cours', axe: 'Personnel', chemin: '/mes-cours', mots: 'mes cours notes encoder avis presences' },
  // Organisation
  { label: 'Attributions', axe: 'Organisation', chemin: '/organisation', mots: 'attributions cours professeurs charge periodes groupes' },
  { label: 'Planification et dates des UE', axe: 'Organisation', chemin: '/organisation?onglet=planifier', mots: 'planification dates ue sessions calendrier grille organisation' },
  { label: 'Rentrée', axe: 'Organisation', chemin: '/organisation?onglet=rentree', mots: 'rentree' },
  { label: 'Répartition des étudiants dans les cours', axe: 'Organisation', chemin: '/organisation?onglet=repartition', mots: 'repartition groupes etudiants cours' },
  { label: 'Schéma de capitalisation', axe: 'Organisation', chemin: '/organisation?onglet=structure', mots: 'schema capitalisation prerequis structure section' },
  { label: 'Pondérations', axe: 'Organisation', chemin: '/organisation?onglet=ponderations', mots: 'ponderations poids acquis cours' },
  { label: 'Descriptifs d’UE', axe: 'Organisation', chemin: '/organisation?onglet=due', mots: 'due descriptif unite enseignement' },
  { label: 'Horaires', axe: 'Organisation', chemin: '/organisation?onglet=horaire-semaine', mots: 'horaire semaine hyperplanning locaux seances' },
  { label: 'Effectifs et postes PNCC', axe: 'Organisation', chemin: '/organisation?onglet=effectifs', mots: 'effectifs statistiques pncc postes' },
  // Gestion
  { label: 'Gestion — dotation, ETP, budget', axe: 'Gestion', chemin: '/gestion', mots: 'gestion dotation etp budget charge rapport efficience' },
  // Documentation
  { label: 'Documentation et circulaires', axe: 'Documentation', chemin: '/documentation', mots: 'documentation aide circulaire reglement rde mode emploi' },
  // Configuration
  { label: 'Identité de l’établissement', axe: 'Configuration', chemin: '/configuration?onglet=etablissement', mots: 'etablissement identite adresse ecot fase directeur signataire' },
  { label: 'Années et calendrier', axe: 'Configuration', chemin: '/configuration?onglet=annees', mots: 'annees annee scolaire calendrier sessions' },
  { label: 'Unités et cours (référentiel)', axe: 'Configuration', chemin: '/configuration?onglet=referentiel-annee', mots: 'referentiel unites ue cours sections dossier pedagogique' },
  { label: 'Prérequis d’UE', axe: 'Configuration', chemin: '/configuration?onglet=ref-prerequis', mots: 'prerequis' },
  { label: 'Règles de délibération', axe: 'Configuration', chemin: '/configuration?onglet=ref-deliberation', mots: 'regles deliberation seuil ajournement seconde session' },
  { label: 'Procédures et délais', axe: 'Configuration', chemin: '/configuration?onglet=procedures', mots: 'procedures delais motifs va catalogue amenagements recours' },
  { label: 'Modèles de pièces', axe: 'Configuration', chemin: '/configuration?onglet=editeur', mots: 'modeles pieces editeur template document' },
  { label: 'Pièces officielles (contrat, attestation, diplôme)', axe: 'Configuration', chemin: '/configuration?onglet=contrat', mots: 'contrat attestation diplome recrutement modele' },
  { label: 'Courriels', axe: 'Configuration', chemin: '/configuration?onglet=courriels', mots: 'courriels email smtp envoi signature' },
  { label: 'Rôles et accès', axe: 'Configuration', chemin: '/configuration?onglet=roles', mots: 'roles acces droits gestes permissions utilisateurs comptes' },
  { label: 'Thèmes et couleurs', axe: 'Configuration', chemin: '/configuration?onglet=couleurs', mots: 'couleurs theme apparence' },
  { label: 'Sauvegardes', axe: 'Configuration', chemin: '/configuration?onglet=sauvegardes', mots: 'sauvegarde backup' },
  { label: 'Registre des envois', axe: 'Configuration', chemin: '/configuration?onglet=registre-envois', mots: 'envois registre courriels partis' },
];

export const plat = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Les destinations qui répondent à la saisie, les meilleures d'abord. */
export function chercherDestinations(q) {
  const mots = plat(q).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  return DESTINATIONS.map(d => {
    const titre = plat(d.label), tout = `${titre} ${plat(d.axe)} ${d.mots}`;
    if (!mots.every(m => tout.includes(m))) return null;
    const score = mots.reduce((s, m) => s + (titre.startsWith(m) ? 3 : titre.includes(m) ? 2 : 1), 0);
    return { ...d, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12);
}

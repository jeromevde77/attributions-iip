// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LA GALERIE : un exemple de CHAQUE pièce que Lucie sait sortir
//
// (Charles, 7 octobre 2026 : « il me faut dans Configuration un exemple de TOUS
// les documents que Lucie sait sortir. TOUS. Avec choix UE, étudiant, etc. »)
//
// L'aperçu de Configuration ne montrait que sept pièces, alors que Lucie en
// produit une soixantaine, depuis une vingtaine d'écrans. Une pièce qu'on ne
// voit qu'en la produisant pour de vrai s'ajuste à l'aveugle.
//
// LA GALERIE NE RÉÉCRIT AUCUNE PIÈCE. Chaque entrée dit quelle route la produit
// déjà, et avec quoi : l'écran appelle cette route-là, avec les choix faits
// (étudiant, unité, section…). Ce qu'on voit est donc exactement ce qui sort —
// un second composeur, « pour l'aperçu », finirait par différer du vrai.
//
// RIEN N'Y ÉCRIT. Les routes retenues ont été relues une à une (inventaire du
// 7 octobre 2026) : celles qui écrivent en produisant — composer une
// convention, sortir l'EA12 en Word, la fiche signalétique archivée, le PV de
// l'ancien module des procédures — sont remplacées par leur variante de
// lecture (`/apercu`, `/imprimer`, `?apercu=1`), ou ne figurent pas.
//
// Une entrée :
//   params   ce que l'écran propose de choisir : annee, section, ue, etudiant,
//            session, professeur, et les dossiers (amenagement, procedure,
//            reunion, offre, ea12, template, lieu, cours, mois)
//   exemple  quel exemple de la base pré-remplit ces choix
//   appel    { methode, chemin, query, corps } — « {etudiant} » est remplacé par
//            la valeur choisie ; une valeur vide retire la clé
//   format   'json' (champ `champ`, html par défaut) · 'texte' · 'pdf'
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { RAPPORTS } from '../routes/rapports.js';
import { ANNEXES } from '../services/formulairesFWB.js';
import { FAMILLES } from './modelesConvention.js';
import { TYPES_PIECE } from './piecesAmenagement.js';
import { TYPES_PIECE_CEP } from './piecesCep.js';
import { PIECES as PIECES_PROC } from './piecesProcedures.js';
import { dossierDiplomation } from '../routes/diplomes.js';
import { modelesDeLaGalerie } from './modelesPieces.js';
import { SPECIMENS } from './specimens.js';

const DOMAINES_RAPPORT = { etudiants: 'Étudiants', personnel: 'Personnel', organisation: 'Organisation', gestion: 'Gestion' };

/** Les pièces de délibération d'une unité, une à une (centre des documents de l'UE). */
const PIECES_DELIB = [
  ['pv', 'Procès-verbal de délibération (annexes 3 · 5)'],
  ['conseil', 'Composition du Conseil des études (annexe 2)'],
  ['grille', 'Grille de délibération'],
  ['ajustements', 'Ajustements du Conseil (faveurs, corrections)'],
  ['motivations', 'Motivations du Conseil, acquis par acquis'],
  ['listes', "Listes des ajournés, cours par cours"],
  ['reussite', "Attestations de réussite de l'unité"],
  ['ajournement', "Motivations d'ajournement (annexe 8)"],
  ['refus', 'Motivations de refus (annexe 9)'],
];

/** Pièces composées dans le navigateur : elles se montrent là où on les produit. */
const A_L_ECRAN = [
  ['Personnel', "Feuilles d'attributions (sélection)", '/personnel'],
  ['Personnel', "Fiche d'attributions HELB et fiche globale", '/personnel'],
  ['Organisation', "Rapport d'attributions", '/attributions'],
  ['Organisation', 'Grille de section (fenêtre de la grille)', '/organisation'],
  ['Organisation', 'Documents 2 et 3 (dotation)', '/organisation'],
  ['Étudiants', 'Rapport PAE (fenêtre du PAE)', '/etudiants'],
  ['Étudiants', 'Schéma de capitalisation (le dessin vient de l’écran)', '/etudiants'],
  ['Personnel', "Recrutement : grille d'entretien, comparatif, fiche candidat, rapport d'entretiens", '/recrutement'],
  ['Étudiants', 'Listes du générateur (colonnes au choix)', '/listes'],
];

function entrees() {
  const L = [];
  const E = (o) => L.push({ format: 'json', champ: 'html', ...o,
    // La pièce a-t-elle un modèle qu'on peut corriger ? (lib/modelesPieces.js)
    modeles: modelesDeLaGalerie(o.id),
    // Un dossier factice complet, quand la base n'en a pas (lib/specimens.js).
    specimen: SPECIMENS.has(o.id) });

  // ── ÉTUDIANTS ──────────────────────────────────────────────────────────────
  E({ id: 'attestation_reussite', domaine: 'Étudiants', libelle: "Attestation de réussite d'unité (annexes 10 à 13, 17, 18)",
    params: ['annee', 'etudiant', 'ue'], exemple: 'etu_reussite',
    appel: { methode: 'GET', chemin: '/api/attestations/etudiant/{etudiant}/document', query: { annee: '{annee}', ue: '{ue}' } } });
  E({ id: 'bulletin', domaine: 'Étudiants', libelle: 'Bulletin de parcours', params: ['annee', 'etudiant'], exemple: 'etudiant',
    appel: { methode: 'GET', chemin: '/api/etudiants/{etudiant}/bulletin/document', query: { annee: '{annee}' } } });
  E({ id: 'fiche_parcours', domaine: 'Étudiants', libelle: 'Fiche de parcours', params: ['annee', 'etudiant'], exemple: 'etudiant',
    appel: { methode: 'GET', chemin: '/api/etudiants/{etudiant}/fiche-parcours/document', query: { annee: '{annee}' } } });
  E({ id: 'revue_pae', domaine: 'Étudiants', libelle: 'PAE détaillé (revue du PAE)', params: ['annee', 'etudiant'], exemple: 'etudiant',
    appel: { methode: 'POST', chemin: '/api/etudiants/revue-pae/document', corps: { annee: '{annee}', ids: ['{etudiant}'] } } });
  E({ id: 'fiche_inscription', domaine: 'Étudiants', libelle: "Fiche d'inscription", params: ['annee', 'etudiant'], exemple: 'etudiant',
    appel: { methode: 'GET', chemin: '/api/etudiants/{etudiant}/fiche-inscription', query: { annee: '{annee}' } } });
  E({ id: 'frais', domaine: 'Étudiants', libelle: 'Frais de scolarité (droit d’inscription et frais)', params: ['annee', 'etudiant'], exemple: 'etudiant',
    appel: { methode: 'GET', chemin: '/api/frais-scolarite/etudiant/{etudiant}/document', query: { annee: '{annee}' } } });
  E({ id: 'annexe1', domaine: 'Étudiants', libelle: 'Annexe 1 — visa ou titre de séjour étudiant', params: ['annee', 'etudiant'], exemple: 'etudiant',
    appel: { methode: 'POST', chemin: '/api/annexe1/document', corps: { etudiant_id: '{etudiant}', annee: '{annee}' } } });
  E({ id: 'annexe2', domaine: 'Étudiants', libelle: 'Annexe 2 — progrès des études', params: ['annee', 'etudiant'], exemple: 'etudiant',
    appel: { methode: 'POST', chemin: '/api/annexe2/document', corps: { etudiant_id: '{etudiant}', annee: '{annee}' } } });
  for (const [t, lib] of Object.entries(TYPES_PIECE_CEP)) {
    E({ id: `cep_${t}`, domaine: 'Étudiants', libelle: lib, params: ['annee', 'etudiant', 'ue'], exemple: 'etu_cep',
      note: "Seul un étudiant marqué « congé-éducation payé » pour l'année (onglet de sa fiche) a ces pièces.",
      appel: { methode: 'GET', chemin: `/api/cep/etudiant/{etudiant}/piece/${t}`, query: { annee: '{annee}', ue: '{ue}' } } });
  }
  for (const [t, lib] of Object.entries(TYPES_PIECE)) {
    E({ id: `amenagement_${t}`, domaine: 'Étudiants', libelle: `Aménagement raisonnable — ${lib}`, params: ['amenagement'], exemple: 'amenagement',
      appel: { methode: 'GET', chemin: `/api/amenagements/dossier/{amenagement}/piece/${t}` } });
  }
  for (const [t, def] of Object.entries(PIECES_PROC)) {
    E({ id: `procedure_${t}`, domaine: 'Étudiants', libelle: `Procédure — ${def.titre || t}`, params: ['procedure'], exemple: 'procedure',
      appel: { methode: 'GET', chemin: `/api/procedures/dossiers/{procedure}/document/${t}` } });
  }
  E({ id: 'coordonnees_etudiants', domaine: 'Étudiants', libelle: 'Liste de coordonnées — étudiants', params: ['etudiant'], exemple: 'etudiant',
    appel: { methode: 'POST', chemin: '/api/etudiants/coordonnees', corps: { ids: ['{etudiant}'] } } });
  E({ id: 'parcours_section', domaine: 'Étudiants', libelle: 'Parcours des étudiants — section × unités', params: ['annee', 'section'], exemple: 'section',
    appel: { methode: 'GET', chemin: '/api/etudiants/rapport', query: { annee: '{annee}', section: '{section}' } } });
  E({ id: 'inscrits_grille', domaine: 'Étudiants', libelle: 'Inscrits par unité — la grille', params: ['annee', 'section'], exemple: 'section',
    appel: { methode: 'POST', chemin: '/api/rapports/inscrits-grille', corps: { annee: '{annee}', section: '{section}' } } });
  E({ id: 'inscrits_unites', domaine: 'Étudiants', libelle: 'Inscrits par unité — la liste', params: ['annee', 'section'], exemple: 'section',
    appel: { methode: 'POST', chemin: '/api/rapports/inscrits-unites', corps: { annee: '{annee}', section: '{section}' } } });

  // ── DÉLIBÉRATION ───────────────────────────────────────────────────────────
  E({ id: 'motivation_decision', domaine: 'Délibération', libelle: "Motivation d'une décision — un étudiant (annexes 8 · 9)",
    params: ['annee', 'etudiant', 'ue', 'session'], exemple: 'etu_echec',
    appel: { methode: 'GET', chemin: '/api/acquis/motivation/{etudiant}/{ue}/document', query: { annee: '{annee}', session: '{session}' } } });
  for (const [cle, lib] of PIECES_DELIB) {
    const flags = { reussite: false, ajournement: false, refus: false };
    E({ id: `delib_${cle}`, domaine: 'Délibération', libelle: lib, params: ['annee', 'ue', 'session'],
      exemple: cle === 'ajournement' ? 'ue_ajourne' : cle === 'refus' ? 'ue_refus' : 'ue_deliberee',
      appel: { methode: 'POST', chemin: '/api/acquis/deliberation/ue/{ue}/documents',
        corps: { annee: '{annee}', session: '{session}', ...flags, [cle]: true } } });
  }

  // ── VALORISATION ───────────────────────────────────────────────────────────
  E({ id: 'va_pv', domaine: 'Valorisation', libelle: "PV de valorisation d'une unité et ses attestations (annexes 4, 14, 15)",
    params: ['annee', 'ue'], exemple: 'ue_va',
    appel: { methode: 'POST', chemin: '/api/attestations/valorisation/ue/{ue}/documents', corps: { annee: '{annee}' } } });
  E({ id: 'va_notification', domaine: 'Valorisation', libelle: 'Notification des décisions de valorisation — un étudiant',
    params: ['annee', 'etudiant'], exemple: 'etu_va',
    appel: { methode: 'GET', chemin: '/api/etudiants/{etudiant}/valorisations/notification', query: { annee: '{annee}' } } });
  for (const [id, lib] of [['attestation-reussite', 'unité ordinaire'], ['attestation-stage', 'stage'],
    ['attestation-ei', 'épreuve intégrée'], ['attestation-valorisation', 'valorisation des acquis']]) {
    E({ id: `specimen_${id}`, domaine: 'Valorisation', libelle: `Spécimen — attestation de réussite, ${lib}`, params: ['annee', 'niveau'], exemple: null,
      appel: { methode: 'GET', chemin: `/api/apercu/${id}`, query: { annee: '{annee}', niveau: '{niveau}' } } });
  }

  // ── DIPLÔMES ───────────────────────────────────────────────────────────────
  for (const [p, lib] of [['diplome', 'Diplôme'], ['attestation', 'Attestation de réussite de section'], ['provisoire', 'Attestation provisoire']]) {
    E({ id: `diplome_${p}`, domaine: 'Diplômes', libelle: lib, params: ['annee', 'section', 'etudiant'], exemple: 'diplome',
      note: "Sans président du jury connu pour la section, l'aperçu laisse la place « à désigner » ; à la production, il est demandé.",
      appel: { methode: 'POST', chemin: '/api/diplomes/pieces', corps: { annee: '{annee}', section: '{section}', etudiants: ['{etudiant}'], pieces: [p], apercu: true } },
      champ: p === 'diplome' ? 'diplomes_lot' : 'html' });
  }
  E({ id: 'liste_diplomes', domaine: 'Diplômes', libelle: 'Liste des diplômés (formulaire FWB)', params: ['annee', 'section', 'etudiant'], exemple: 'diplome',
    appel: { methode: 'POST', chemin: '/api/diplomes/document', corps: { annee: '{annee}', section: '{section}', etudiants: ['{etudiant}'] } } });
  E({ id: 'pv_section', domaine: 'Diplômes', libelle: 'Procès-verbal de section', params: ['annee', 'section', 'etudiant', 'session'], exemple: 'diplome',
    appel: { methode: 'POST', chemin: '/api/diplomes/pv-section', corps: { annee: '{annee}', section: '{section}', etudiants: ['{etudiant}'], session: '{session}' } } });

  // ── PERSONNEL ──────────────────────────────────────────────────────────────
  E({ id: 'contrat_cc', domaine: 'Personnel', libelle: 'Contrat de travail — chargé de cours', params: ['annee', 'professeur'], exemple: 'professeur',
    appel: { methode: 'POST', chemin: '/api/contrats/apercu', corps: { prof_id: '{professeur}', annee: '{annee}' } } });
  for (const niv of ['superieur', 'secondaire']) {
    E({ id: `contrat_expert_${niv}`, domaine: 'Personnel', libelle: `Contrat d'expert — ${niv === 'superieur' ? 'supérieur' : 'secondaire'}`,
      params: ['annee', 'professeur'], exemple: niv === 'superieur' ? 'expert_SUP' : 'expert_DS',
      appel: { methode: 'POST', chemin: '/api/contrats/expert/apercu', corps: { prof_id: '{professeur}', annee: '{annee}', niveau: niv } } });
  }
  E({ id: 'fiche_attributions', domaine: 'Personnel', libelle: "Fiche d'attributions (IIP)", params: ['annee', 'professeur'], exemple: 'professeur',
    appel: { methode: 'GET', chemin: '/api/ref/professeurs/{professeur}/fiche-attributions/document', query: { annee: '{annee}' } } });
  E({ id: 'fiche_signaletique', domaine: 'Personnel', libelle: 'Fiche signalétique officielle (PDF)', params: ['professeur'], exemple: 'professeur', format: 'pdf',
    appel: { methode: 'GET', chemin: '/api/ref/professeurs/{professeur}/fiche-pdf', query: { apercu: '1' } } });
  E({ id: 'ea12', domaine: 'Personnel', libelle: 'EA12 — document 12', params: ['ea12'], exemple: 'ea12', format: 'texte',
    appel: { methode: 'GET', chemin: '/api/ea12/{ea12}/imprimer' } });
  for (const a of ANNEXES) {
    if (a.usage !== 'membre') continue;
    E({ id: `formulaire_${a.cle}`, domaine: 'Personnel — formulaires FWB', libelle: a.titre, params: a.mois ? ['annee', 'professeur', 'mois'] : ['annee', 'professeur'],
      exemple: 'professeur', format: 'pdf',
      note: 'Formulaire officiel rempli (Word converti en PDF) ; ce qui manque dans Lucie est nommé.',
      appel: { methode: 'GET', chemin: `/api/formulaires/${a.cle}`, query: { professeur_id: '{professeur}', annee: '{annee}', mois: '{mois_num}', format: 'pdf' } } });
  }
  E({ id: 'coordonnees_personnel', domaine: 'Personnel', libelle: 'Liste de coordonnées — personnel', params: ['professeur'], exemple: 'professeur',
    appel: { methode: 'POST', chemin: '/api/ref/professeurs/coordonnees', corps: { ids: ['{professeur}'] } } });
  E({ id: 'offre', domaine: 'Personnel', libelle: "Offre d'emploi", params: ['offre'], exemple: 'offre',
    appel: { methode: 'GET', chemin: '/api/besoins/offre/{offre}/document' } });

  // ── ORGANISATION ───────────────────────────────────────────────────────────
  E({ id: 'due', domaine: 'Organisation', libelle: "Descriptif d'unité (DUE)", params: ['annee', 'ue'], exemple: 'ue',
    appel: { methode: 'GET', chemin: '/api/due/{ue}/document', query: { annee: '{annee}' } } });
  E({ id: 'listes_cours', domaine: 'Organisation', libelle: "Listes d'un cours (Mes cours, une feuille par groupe)", params: ['annee', 'cours'], exemple: 'cours',
    appel: { methode: 'GET', chemin: '/api/mes-cours/{cours}/listes', query: { annee: '{annee}', format: 'html' } } });
  for (const [f, def] of Object.entries(FAMILLES)) {
    if (!def.modele) continue;
    E({ id: `convention_${f}`, domaine: 'Organisation', libelle: def.libelle,
      exemple: 'lieu', note: 'Composée sans être enregistrée : le registre des conventions ne bouge pas.',
      params: f === 'cadre_stage' ? ['annee', 'section', 'lieu'] : ['annee', 'section', 'ue', 'cours', 'professeur'],
      appel: { methode: 'POST', chemin: '/api/conventions/apercu', corps: { famille: f, annee_scolaire: '{annee}', lieu_id: '{lieu}',
        periode_debut: '{debut}', periode_fin: '{fin}',
        partenaire: { nom: 'PARTENAIRE SPÉCIMEN', sigle: 'SPÉCIMEN', adresse: 'Rue de l’Exemple 1, 1000 Bruxelles', representant: 'Camille SPÉCIMEN', fonction: 'Direction' },
        donnees: { cursus: ['{section}'], ue_num: '{ue}', objet: 'Objet d’exemple — à remplacer par celui du partenariat',
          cours: ['{cours}'], enseignant_id: '{professeur}', seances: ['{debut}', '{fin}'],
          horaires: 'De 9 h à 12 h', organisation: 'Organisation d’exemple', locaux: 'Locaux du partenaire' } } } });
  }
  E({ id: 'modele_libre', domaine: 'Organisation', libelle: "Modèle de l'éditeur (Configuration → Écrire un modèle)", params: ['template', 'annee', 'professeur', 'ue', 'section'],
    exemple: 'template',
    appel: { methode: 'POST', chemin: '/api/templates/{template}/generer', corps: { prof_id: '{professeur}', ue_num: '{ue}', section: '{section}', annee: '{annee}' } } });

  // ── SUIVI D'ÉQUIPE ─────────────────────────────────────────────────────────
  E({ id: 'reunion_pv', domaine: "Suivi d'équipe", libelle: 'Procès-verbal de réunion', params: ['reunion'], exemple: 'reunion',
    appel: { methode: 'POST', chemin: '/api/reunions/{reunion}/document', corps: {} } });
  E({ id: 'reunion_pv_integral', domaine: "Suivi d'équipe", libelle: 'Procès-verbal de réunion — intégral (avec le confidentiel)', params: ['reunion'], exemple: 'reunion',
    appel: { methode: 'POST', chemin: '/api/reunions/{reunion}/document', corps: { version: 'integrale' } } });
  E({ id: 'taches', domaine: "Suivi d'équipe", libelle: 'Feuille des tâches', params: ['annee'], exemple: null,
    appel: { methode: 'POST', chemin: '/api/reunions/taches/document', corps: { annee: '{annee}' } } });
  E({ id: 'rapport_mensuel', domaine: "Suivi d'équipe", libelle: "Rapport d'activité mensuel", params: ['mois'], exemple: null,
    appel: { methode: 'POST', chemin: '/api/reunions/rapport-mensuel', corps: { mois: '{mois}' } } });

  // ── LES RAPPORTS DU CATALOGUE (Éditions) ───────────────────────────────────
  for (const R of RAPPORTS) {
    const ps = ['annee', 'section', 'session'].filter(k => R.params.includes(k));
    if (R.params.includes('portee') || R.params.includes('etudiants')) continue;   // portée choisie à l'écran
    E({ id: `rapport_${R.id}`, domaine: `Éditions — ${DOMAINES_RAPPORT[R.domaine] || 'Autres'}`, libelle: R.libelle, params: ps, exemple: null,
      appel: { methode: 'POST', chemin: `/api/rapports/${R.id}/document`, corps: { annee: '{annee}', section: '{section}', session: '{session}' } } });
  }
  return L;
}

/** LES EXEMPLES : ce que la base offre de plus parlant pour chaque pièce. */
export function exemples(annee) {
  const un = (sql, ...a) => { try { return db.prepare(sql).get(...a) || null; } catch { return null; } };
  const tous = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };
  const nomE = id => un("SELECT id, nom, prenom, id_ecampus, section_rattachement AS section FROM etudiant WHERE id = ?", id);
  const X = {};
  const etu = un(`SELECT i.etudiant_id id FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND COALESCE(e.sortie_statut,'') <> 'archive' GROUP BY i.etudiant_id
      ORDER BY SUM(i.resultat IS NOT NULL) DESC, COUNT(*) DESC LIMIT 1`, annee);
  if (etu) X.etudiant = { etudiant: nomE(etu.id), annee };
  const r = un(`SELECT etudiant_id, ue_num, annee_scolaire FROM etudiant_inscription WHERE resultat = 'reussi'
      ORDER BY annee_scolaire DESC, etudiant_id LIMIT 1`);
  if (r) X.etu_reussite = { etudiant: nomE(r.etudiant_id), ue: r.ue_num, annee: r.annee_scolaire };
  // Un échec DÉLIBÉRÉ, sur une séance close : la motivation lit les acquis en défaut.
  const ec = un(`SELECT i.etudiant_id, i.ue_num, i.annee_scolaire, i.resultat, s.session FROM etudiant_inscription i
      JOIN deliberation_seance s ON s.ue_num = i.ue_num AND s.annee_scolaire = i.annee_scolaire AND s.cloturee = 1 AND COALESCE(s.reprise,0) = 0
      WHERE i.resultat IN ('ajourne','refuse') AND (s.session = 2) = (i.resultat = 'refuse')
      ORDER BY i.annee_scolaire DESC, i.etudiant_id LIMIT 1`)
    || un(`SELECT etudiant_id, ue_num, annee_scolaire, resultat FROM etudiant_inscription WHERE resultat IN ('ajourne','refuse')
      ORDER BY annee_scolaire DESC, etudiant_id LIMIT 1`);
  if (ec) X.etu_echec = { etudiant: nomE(ec.etudiant_id), ue: ec.ue_num, annee: ec.annee_scolaire, session: ec.session || (ec.resultat === 'refuse' ? 2 : 1) };
  // Une séance close, et qui a des décisions des trois sortes si possible.
  const s = un(`SELECT s.ue_num, s.annee_scolaire, s.session FROM deliberation_seance s
      JOIN etudiant_inscription i ON i.ue_num = s.ue_num AND i.annee_scolaire = s.annee_scolaire
      WHERE COALESCE(s.reprise,0) = 0 AND s.cloturee = 1 AND i.resultat IS NOT NULL
      GROUP BY s.id ORDER BY COUNT(DISTINCT i.resultat) DESC, s.annee_scolaire DESC, s.id DESC LIMIT 1`)
    || un(`SELECT ue_num, annee_scolaire, session FROM deliberation_seance WHERE COALESCE(reprise,0) = 0
      ORDER BY cloturee DESC, annee_scolaire DESC, id DESC LIMIT 1`);
  if (s) X.ue_deliberee = { ue: s.ue_num, annee: s.annee_scolaire, session: s.session };
  // Une décision VALIDÉE par la direction : avant, ni PV ni notification ne sortent.
  const va = un(`SELECT etudiant_id, ue_num, annee_scolaire FROM etudiant_valorisation WHERE valide_le IS NOT NULL
      ORDER BY annee_scolaire DESC, id DESC LIMIT 1`)
    || un(`SELECT etudiant_id, ue_num, annee_scolaire FROM etudiant_valorisation WHERE decision_le IS NOT NULL
      ORDER BY annee_scolaire DESC, id DESC LIMIT 1`);
  if (va) { X.ue_va = { ue: va.ue_num, annee: va.annee_scolaire }; X.etu_va = { etudiant: nomE(va.etudiant_id), annee: va.annee_scolaire }; }
  // UN DIPLÔMABLE, tel que le centre de diplomation le calcule (dossierDiplomation) :
  // cette année, sinon la précédente.
  const precedente = String(annee).replace(/^(\d{4})-(\d{4})$/, (_, a, b) => `${a - 1}-${b - 1}`);
  cherche: for (const an of [annee, precedente]) {
    for (const { section } of tous('SELECT DISTINCT section FROM ue WHERE annee_scolaire = ? AND section IS NOT NULL', an)) {
      let d = null; try { d = dossierDiplomation(section, an); } catch { d = null; }
      const x = d?.diplomables?.[0];
      if (x) { X.diplome = { etudiant: nomE(x.id), annee: an, section, session: 1 }; break cherche; }
    }
  }
  const cep = un('SELECT etudiant_id, annee_scolaire FROM etudiant_cep ORDER BY (annee_scolaire = ?) DESC, id DESC LIMIT 1', annee);
  if (cep) X.etu_cep = { etudiant: nomE(cep.etudiant_id), annee: cep.annee_scolaire };
  const sec = un(`SELECT section FROM ue WHERE annee_scolaire = ? AND section IS NOT NULL GROUP BY section ORDER BY COUNT(*) DESC LIMIT 1`, annee);
  if (sec) X.section = { section: sec.section, annee };
  const ue = un(`SELECT ue_num FROM etudiant_inscription WHERE annee_scolaire = ? GROUP BY ue_num ORDER BY COUNT(*) DESC LIMIT 1`, annee);
  if (ue) X.ue = { ue: ue.ue_num, annee };
  const pr = un(`SELECT a.professeur_id id FROM attribution a JOIN professeur p ON p.id = a.professeur_id
      WHERE a.annee_scolaire = ? AND COALESCE(p.statut,'') <> 'EXP' GROUP BY a.professeur_id ORDER BY SUM(a.periodes_attribuees) DESC LIMIT 1`, annee);
  if (pr) X.professeur = { professeur: pr.id, annee };
  for (const niv of ['SUP', 'DS']) {
    const ex = un(`SELECT v.professeur_id id FROM v_attribution_complete v
        WHERE v.annee_scolaire = ? AND v.statut_mdp = 'EXP' AND v.niveau = ? GROUP BY v.professeur_id LIMIT 1`, annee, niv);
    if (ex) X[`expert_${niv}`] = { professeur: ex.id, annee };
  }
  for (const [cle, res, ses] of [['ue_ajourne', 'ajourne', 1], ['ue_refus', 'refuse', 2]]) {
    const u = un(`SELECT i.ue_num, i.annee_scolaire FROM etudiant_inscription i JOIN deliberation_seance s ON s.ue_num = i.ue_num
        AND s.annee_scolaire = i.annee_scolaire AND s.session = ? AND s.cloturee = 1 WHERE i.resultat = ?
        GROUP BY i.ue_num, i.annee_scolaire ORDER BY i.annee_scolaire DESC LIMIT 1`, ses, res);
    if (u) X[cle] = { ue: u.ue_num, annee: u.annee_scolaire, session: ses };
  }
  const co = un(`SELECT code_cours FROM attribution WHERE annee_scolaire = ? AND code_cours IS NOT NULL GROUP BY code_cours
      ORDER BY SUM(periodes_attribuees) DESC LIMIT 1`, annee);
  if (co) X.cours = { cours: co.code_cours, annee };
  for (const [cle, sql] of [
    ['amenagement', 'SELECT id FROM amenagement_dossier ORDER BY id DESC LIMIT 1'],
    ['procedure', 'SELECT id FROM proc_dossier ORDER BY id DESC LIMIT 1'],
    ['reunion', 'SELECT id FROM reunion ORDER BY date_seance DESC, id DESC LIMIT 1'],
    ['offre', 'SELECT id FROM recrutement_poste ORDER BY id DESC LIMIT 1'],
    ['ea12', 'SELECT id FROM ea12 ORDER BY modifie_le DESC, id DESC LIMIT 1'],
    ['template', 'SELECT id FROM document_template ORDER BY modifie_le DESC LIMIT 1'],
    ['lieu', 'SELECT id FROM stage_lieu WHERE COALESCE(actif,1) = 1 ORDER BY id LIMIT 1'],
  ]) { const x = un(sql); if (x) X[cle] = { [cle]: x.id, annee }; }
  const a0 = String(annee).slice(0, 4), a1 = String(annee).slice(5, 9);
  if (X.lieu) Object.assign(X.lieu, { debut: `${a0}-09-15`, fin: `${a1}-06-30`, section: X.section?.section, ue: X.ue?.ue });
  if (X.template && X.professeur) Object.assign(X.template, { professeur: X.professeur.professeur, section: X.section?.section, ue: X.ue?.ue });
  return X;
}

/** Les listes des dossiers à choisir (les autres choix ont leurs propres champs). */
export function choix(annee) {
  const tous = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } };
  return {
    annees: tous('SELECT DISTINCT annee_scolaire v FROM etudiant_inscription ORDER BY 1 DESC').map(x => x.v),
    sections: tous('SELECT DISTINCT section v FROM ue WHERE section IS NOT NULL ORDER BY 1').map(x => x.v),
    professeur: tous(`SELECT p.id v, upper(p.nom) || ' ' || COALESCE(p.prenom,'') || CASE WHEN p.statut = 'EXP' THEN ' (expert)' ELSE '' END l
      FROM professeur p WHERE EXISTS (SELECT 1 FROM attribution a WHERE a.professeur_id = p.id AND a.annee_scolaire = ?) ORDER BY p.nom, p.prenom`, annee),
    cours: tous(`SELECT a.code_cours v, a.code_cours || ' — ' || COALESCE(MIN(c.cours_nom), '') l FROM attribution a
      LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
      WHERE a.annee_scolaire = ? AND a.code_cours IS NOT NULL GROUP BY a.code_cours ORDER BY a.code_cours`, annee),
    amenagement: tous(`SELECT d.id v, upper(e.nom) || ' ' || COALESCE(e.prenom,'') || ' · ' || d.annee_scolaire || ' · ' || d.statut l
      FROM amenagement_dossier d JOIN etudiant e ON e.id = d.etudiant_id ORDER BY d.id DESC LIMIT 300`),
    procedure: tous(`SELECT d.id v, upper(e.nom) || ' ' || COALESCE(e.prenom,'') || ' · ' || d.type || COALESCE(' (' || d.nature || ')', '') || ' · ' || d.annee_scolaire l
      FROM proc_dossier d JOIN etudiant e ON e.id = d.etudiant_id ORDER BY d.id DESC LIMIT 300`),
    reunion: tous(`SELECT id v, COALESCE(date_seance,'') || ' — ' || COALESCE(titre,'') l FROM reunion ORDER BY date_seance DESC, id DESC LIMIT 300`),
    offre: tous(`SELECT id v, COALESCE(intitule, cours_nom, 'Offre ' || id) || COALESCE(' · ' || section, '') l FROM recrutement_poste ORDER BY id DESC LIMIT 300`),
    ea12: tous(`SELECT x.id v, upper(p.nom) || ' ' || COALESCE(p.prenom,'') || ' · ' || x.annee_scolaire l FROM ea12 x
      JOIN professeur p ON p.id = x.professeur_id ORDER BY x.annee_scolaire DESC, p.nom LIMIT 300`),
    template: tous('SELECT id v, nom l FROM document_template ORDER BY nom'),
    lieu: tous(`SELECT id v, nom || COALESCE(' — ' || service, '') l FROM stage_lieu WHERE COALESCE(actif,1) = 1 ORDER BY nom LIMIT 400`),
  };
}

export function galerie() {
  return { documents: entrees(), a_l_ecran: A_L_ECRAN.map(([domaine, libelle, ecran]) => ({ domaine, libelle, ecran })) };
}

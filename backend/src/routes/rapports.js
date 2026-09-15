/**
 * LES RAPPORTS — ce que Lucie sait dire d'elle-même, en tableur.
 *
 * Pilotage calculait sans jamais rien produire : ni ETP, ni dotation, ni
 * résultats ne pouvaient sortir de l'écran. Or ces chiffres servent DEHORS —
 * dotation, Conseil de perfectionnement, inspection, comptabilité — et le
 * secrétariat les recopiait à la main dans un classeur.
 *
 * LE TABLEUR PLUTÔT QUE LA PAGE MISE EN PAGE. Un rapport de pilotage se retrie,
 * se recoupe, se transmet à quelqu'un qui le retravaillera. Un document figé
 * obligerait à ressaisir. Les pièces réglementaires, elles, restent du ressort
 * des annexes — ce module ne produit AUCUNE pièce officielle.
 *
 * Chaque rapport déclare ses colonnes et sa requête : ajouter un rapport, c'est
 * ajouter une entrée, non un écran.
 */
import { Router } from 'express';
import ExcelJS from 'exceljs';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { envelopperDocument } from '../lib/document.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { decisionDeSession } from './acquis.js';

const r = Router();

/** Un ETP vaut 800 périodes en charge théorique ; le cours technique compte double. */
const COLS = (l) => l.map(([cle, entete, largeur = 16]) => ({ cle, entete, largeur }));

/**
 * LE CATALOGUE.
 *
 * « domaine » range le rapport dans son onglet ; « params » dit ce que l'écran
 * doit demander avant de le produire. Un rapport qui réclame une section ne
 * doit pas pouvoir se lancer sans elle.
 */
const STYLE_RAPPORT = `
        /* LE TABLEAU D'UN RAPPORT SE LIT, IL NE SE QUADRILLE PAS.
           Chaque cellule portait son filet : une grille de tableur posée sur
           une feuille administrative, où l'œil suit les traits au lieu de
           suivre les chiffres. On garde UN filet sous l'en-tête et UN filet
           fin entre les lignes — le reste est du blanc, qui sépare aussi bien.
           Les nombres passent en chiffres de largeur fixe : c'est ce qui rend
           une colonne comparable d'un coup d'œil. */
        h1 { font-size: 14pt; letter-spacing: -.2pt; }
        .sous { color:#64748b; font-size:9pt; margin:0 0 6mm; }
        .ref  { color:#94a3b8; font-size:8pt; margin-top:5mm; }
        h3 { font-size: 10pt; margin: 7mm 0 1mm; letter-spacing: -.1pt; }
        h3 .sous { display:inline; font-size:9pt; margin:0; }
        table { margin: 0 0 2mm; }
        th, td { border: 0; padding: 1.6mm 2mm; font-size: 8.5pt;
                 border-bottom: 0.3pt solid #e2e8f0; }
        th { background: transparent; color:#64748b; font-size: 7.5pt;
             border-bottom: 0.8pt solid #cbd5e1; }
        td { font-variant-numeric: tabular-nums; }
        tr.repere td { background: transparent; font-weight: 600; color:#1B2B4B;
                       padding-top: 3mm; border-bottom: 0.6pt solid #cbd5e1; }
        tbody tr:last-child td { border-bottom: 0; }`;

export const RAPPORTS = [
  // ── PILOTAGE ────────────────────────────────────────────────────────────
  {
    id: 'etp-section', domaine: 'pilotage', params: ['annee'],
    libelle: 'ETP et périodes par section',
    aide: "Périodes attribuées, réparties entre référents, et l'équivalent temps plein correspondant.",
    colonnes: COLS([['section', 'Section', 28], ['bloc', 'Bloc', 10],
      ['periodes_att', 'Périodes attribuées'], ['iip', 'dont IIP'], ['helb', 'dont HELB'],
      ['etp', 'ETP', 10], ['cout_dotation', 'Coût dotation']]),
    lignes: (p) => db.prepare(`
      SELECT section, bloc,
        ROUND(SUM(total_attribue_professeur), 2) AS periodes_att,
        ROUND(SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END), 2) AS iip,
        ROUND(SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END), 2) AS helb,
        ROUND(SUM(total_attribue_professeur) / 800.0, 3) AS etp,
        ROUND(SUM(cout_dotation), 2) AS cout_dotation
      FROM v_attribution_complete WHERE annee_scolaire = ?
      GROUP BY section, bloc ORDER BY section, bloc`).all(p.annee),
  },
  {
    id: 'etp-ue', domaine: 'pilotage', params: ['annee'],
    libelle: 'Périodes et ETP par unité',
    aide: "Le détail unité par unité, pour repérer ce qui pèse.",
    colonnes: COLS([['section', 'Section', 24], ['ue_num', 'UE', 8],
      ['ue_nom', 'Intitulé', 44], ['periodes_att', 'Périodes attribuées'],
      ['etp', 'ETP', 10], ['organisees', 'Périodes organisées']]),
    lignes: (p) => db.prepare(`
      SELECT section, ue_num, ue_nom,
        ROUND(SUM(total_attribue_professeur), 2) AS periodes_att,
        ROUND(SUM(total_attribue_professeur) / 800.0, 3) AS etp,
        ROUND(SUM(total_periodes_organisees), 2) AS organisees
      FROM v_attribution_complete WHERE annee_scolaire = ?
      GROUP BY section, ue_num, ue_nom ORDER BY section, ue_num`).all(p.annee),
  },
  {
    id: 'etp-etablissement', domaine: 'pilotage', params: ['annee'],
    libelle: "ETP par établissement référent",
    aide: "La répartition entre l'Institut et la Haute École.",
    colonnes: COLS([['contrat_mdp', 'Référent', 18],
      ['periodes_att', 'Périodes attribuées'], ['etp', 'ETP', 10],
      ['professeurs', 'Professeurs'], ['cout_dotation', 'Coût dotation']]),
    lignes: (p) => db.prepare(`
      SELECT COALESCE(contrat_mdp, '(non renseigné)') AS contrat_mdp,
        ROUND(SUM(total_attribue_professeur), 2) AS periodes_att,
        ROUND(SUM(total_attribue_professeur) / 800.0, 3) AS etp,
        COUNT(DISTINCT professeur) AS professeurs,
        ROUND(SUM(cout_dotation), 2) AS cout_dotation
      FROM v_attribution_complete WHERE annee_scolaire = ?
      GROUP BY contrat_mdp ORDER BY periodes_att DESC`).all(p.annee),
  },
  {
    id: 'resultats-section', domaine: 'pilotage', params: ['annee', 'session'],
    libelle: 'Résultats de délibération par unité',
    aide: "Réussites, ajournements et refus POUR LA SESSION CHOISIE — non l'état de l'année.",
    colonnes: COLS([['section', 'Section', 24], ['ue_num', 'UE', 8],
      ['ue_nom', 'Intitulé', 40], ['inscrits', 'Inscrits'],
      ['reussi', 'Réussites'], ['ajourne', 'Ajournements'], ['refuse', 'Refus'],
      ['sans', 'Sans décision'], ['taux', 'Taux de réussite', 16]]),
    lignes: (p) => {
      const ues = db.prepare(`SELECT ue_num, ue_nom, section FROM ue
        WHERE annee_scolaire = ? ORDER BY section, ue_num`).all(p.annee);
      return ues.map(u => {
        const inscrits = db.prepare(`SELECT etudiant_id FROM etudiant_inscription
          WHERE annee_scolaire = ? AND ue_num = ?`).all(p.annee, u.ue_num);
        const c = { reussi: 0, ajourne: 0, refuse: 0, sans: 0 };
        for (const i of inscrits) {
          const d = decisionDeSession(i.etudiant_id, u.ue_num, p.annee, p.session);
          if (d.resultat === 'reussi') c.reussi++;
          else if (d.resultat === 'ajourne') c.ajourne++;
          else if (d.resultat === 'refuse') c.refuse++;
          else c.sans++;
        }
        const decides = c.reussi + c.ajourne + c.refuse;
        return {
          ...u, inscrits: inscrits.length, ...c,
          // Le taux se calcule sur les DÉLIBÉRÉS : rapporté aux inscrits, il
          // ferait passer pour des échecs ceux que la séance n'a pas jugés.
          taux: decides ? Math.round((c.reussi / decides) * 1000) / 10 : null,
        };
      }).filter(l => l.inscrits > 0);
    },
  },
  {
    id: 'dotation-emploi', domaine: 'pilotage', params: ['annee'],
    libelle: "Emploi de la dotation par section",
    aide: "Ce qui est organisé, ce qui est attribué, et l'écart entre les deux.",
    colonnes: COLS([['section', 'Section', 28],
      ['organisees', 'Périodes organisées'], ['attribuees', 'Périodes attribuées'],
      ['ecart', 'Écart'], ['cout_dotation', 'Coût dotation'], ['cout_helb', 'Coût HELB']]),
    lignes: (p) => db.prepare(`
      SELECT section,
        ROUND(SUM(total_periodes_organisees), 2) AS organisees,
        ROUND(SUM(total_attribue_professeur), 2) AS attribuees,
        ROUND(SUM(total_periodes_organisees) - SUM(total_attribue_professeur), 2) AS ecart,
        ROUND(SUM(cout_dotation), 2) AS cout_dotation,
        ROUND(SUM(cout_helb), 2) AS cout_helb
      FROM v_attribution_complete WHERE annee_scolaire = ?
      GROUP BY section ORDER BY section`).all(p.annee),
  },

  // ── PERSONNEL ───────────────────────────────────────────────────────────
  {
    id: 'personnel-liste', domaine: 'personnel', params: ['annee'],
    libelle: 'Membres du personnel et leur charge',
    aide: "Statut, contrat, charge totale et ETP, toutes sections confondues.",
    colonnes: COLS([['nom', 'Nom', 22], ['prenom', 'Prénom', 18],
      ['statut', 'Statut', 12], ['contrat_mdp', 'Référent', 12],
      ['sections', 'Sections', 30], ['periodes', 'Périodes'], ['etp', 'ETP', 10],
      ['adresse_mail', 'Adresse électronique', 32]]),
    lignes: (p) => db.prepare(`
      SELECT pr.nom, pr.prenom, pr.statut, pr.adresse_mail,
        v.contrat_mdp,
        GROUP_CONCAT(DISTINCT v.section) AS sections,
        ROUND(SUM(v.total_attribue_professeur), 2) AS periodes,
        ROUND(SUM(v.total_attribue_professeur) / 800.0, 3) AS etp
      FROM v_attribution_complete v
      JOIN professeur pr ON pr.nom_prenom = v.professeur
      WHERE v.annee_scolaire = ?
      GROUP BY pr.id ORDER BY pr.nom, pr.prenom`).all(p.annee),
  },
  {
    id: 'personnel-temporaires', domaine: 'personnel', params: ['annee'],
    libelle: 'Temporaires et ancienneté',
    aide: "Les membres du personnel non définitifs, avec leur ancienneté de service.",
    colonnes: COLS([['nom', 'Nom', 22], ['prenom', 'Prénom', 18],
      ['statut', 'Statut', 12],
      ['annees_service', 'Années de service', 18],
      ['premiere_annee', 'Première année', 16],
      ['periodes_service', 'Périodes de service cumulées', 26],
      ['periodes', 'Périodes cette année'],
      ['adresse_mail', 'Adresse électronique', 32]]),
    lignes: (p) => {
      const l = db.prepare(`
        SELECT pr.id, pr.nom, pr.prenom, pr.statut, pr.adresse_mail,
          ROUND(SUM(v.total_attribue_professeur), 2) AS periodes
        FROM professeur pr
        LEFT JOIN v_attribution_complete v
          ON v.professeur = pr.nom_prenom AND v.annee_scolaire = ?
        WHERE UPPER(COALESCE(pr.statut, '')) <> 'MDP'
        GROUP BY pr.id ORDER BY pr.nom, pr.prenom`).all(p.annee);
      /**
       * L'ANCIENNETÉ SE COMPTE EN SERVICES, NON EN JOURS.
       *
       * « anciennete_service » ne porte pas de durée : elle enregistre les
       * périodes prestées par cours et par année scolaire. On rend donc le
       * nombre d'années où un service a été enregistré et le cumul des
       * périodes — ce que la table sait réellement dire. Convertir en jours
       * supposerait une règle de valorisation que ce module n'a pas à
       * inventer : elle relève du statut, non d'un rapport.
       */
      return l.map(x => {
        let a2 = { n: null, debut: null, per: null };
        try {
          a2 = db.prepare(`SELECT COUNT(DISTINCT annee_scolaire) AS n,
              MIN(annee_scolaire) AS debut, SUM(periodes) AS per
            FROM anciennete_service WHERE professeur_id = ?`).get(x.id) || a2;
        } catch { /* table absente : les colonnes restent vides */ }
        return {
          ...x,
          annees_service: a2.n || null,
          premiere_annee: a2.debut || null,
          periodes_service: a2.per || null,
          periodes: x.periodes,
        };
      });
    },
  },
  {
    id: 'personnel-attributions', domaine: 'personnel', params: ['annee'],
    libelle: 'Attributions par professeur',
    aide: "Le détail ligne à ligne : quelle unité, quel cours, combien de périodes.",
    colonnes: COLS([['professeur', 'Professeur', 26], ['section', 'Section', 22],
      ['ue_num', 'UE', 8], ['ue_nom', 'Unité', 36], ['code_cours', 'Cours', 12],
      ['nom_cours', 'Intitulé du cours', 36],
      ['total_attribue_professeur', 'Périodes'], ['contrat_mdp', 'Référent', 12]]),
    lignes: (p) => db.prepare(`
      SELECT professeur, section, ue_num, ue_nom, code_cours, nom_cours,
        ROUND(total_attribue_professeur, 2) AS total_attribue_professeur, contrat_mdp
      FROM v_attribution_complete WHERE annee_scolaire = ?
      ORDER BY professeur, section, ue_num, code_cours`).all(p.annee),
  },

  /*
   * ── CE QUI VIENT DU CONSTRUCTEUR DE LISTES ────────────────────────────
   *
   * Ces modèles existaient depuis longtemps, dans un écran à part : « profs
   * par section », « synthèse de charge », « UE sans attribution ». En
   * supprimant l'axe qui les portait, on a écrit qu'ils étaient « dans le
   * centre d'impression » — ils n'y avaient jamais été portés, et ils sont
   * restés un an derrière une porte fermée.
   *
   * Ils y sont maintenant, et ils y gagnent : aperçu avant téléchargement,
   * tableur ET pièce imprimable dans l'enveloppe de la maison, le tout sans
   * un écran de plus. LE CATALOGUE EST LA SEULE PORTE.
   */
  {
    id: 'personnel-par-section', domaine: 'personnel', params: ['annee', 'section'],
    libelle: 'Professeurs par section',
    aide: "Qui enseigne dans un cursus, sur combien d'unités, pour combien de périodes.",
    colonnes: COLS([['section', 'Section', 26], ['nom', 'Nom', 22],
      ['prenom', 'Prénom', 18], ['statut', 'Statut', 12],
      ['nb_ue', 'Unités', 10], ['nb_cours', 'Cours', 10],
      ['periodes', 'Périodes'], ['etp', 'ETP', 10],
      ['adresse_mail', 'Adresse électronique', 32]]),
    lignes: (p) => db.prepare(`
      SELECT v.section, pr.nom, pr.prenom, pr.statut, pr.adresse_mail,
        COUNT(DISTINCT v.ue_num) AS nb_ue,
        COUNT(DISTINCT v.code_cours) AS nb_cours,
        ROUND(SUM(v.total_attribue_professeur), 2) AS periodes,
        ROUND(SUM(v.total_attribue_professeur) / 800.0, 3) AS etp
      FROM v_attribution_complete v
      JOIN professeur pr ON pr.nom_prenom = v.professeur
      WHERE v.annee_scolaire = ? AND (? IS NULL OR v.section = ?)
      GROUP BY v.section, pr.id
      ORDER BY v.section, pr.nom, pr.prenom`).all(p.annee, p.section, p.section),
  },
  {
    id: 'personnel-charge', domaine: 'personnel', params: ['annee', 'section'],
    libelle: 'Synthèse de charge par professeur',
    aide: "Une ligne par professeur et par section : nombre de cours, périodes et heures.",
    colonnes: COLS([['professeur', 'Professeur', 26], ['section', 'Section', 26],
      ['nb_cours', 'Cours', 10], ['periodes', 'Périodes'],
      ['heures', 'Heures', 12], ['etp', 'ETP', 10]]),
    // LA PÉRIODE FAIT CINQUANTE MINUTES : les heures se déduisent, elles ne se
    // saisissent pas — et c'est en heures que se lit un contrat.
    lignes: (p) => db.prepare(`
      SELECT professeur, section,
        COUNT(DISTINCT code_cours) AS nb_cours,
        ROUND(SUM(total_attribue_professeur), 2) AS periodes,
        ROUND(SUM(total_attribue_professeur) * 50.0 / 60.0, 1) AS heures,
        ROUND(SUM(total_attribue_professeur) / 800.0, 3) AS etp
      FROM v_attribution_complete
      WHERE annee_scolaire = ? AND professeur IS NOT NULL
        AND (? IS NULL OR section = ?)
      GROUP BY professeur, section
      ORDER BY section, professeur`).all(p.annee, p.section, p.section),
  },
  {
    id: 'personnel-encadrement', domaine: 'personnel', params: ['annee', 'section'],
    libelle: 'Encadrements — TFE, stages, épreuves',
    aide: "Ce qui s'attribue hors cours : accompagnement, supervision, jurys.",
    colonnes: COLS([['section', 'Section', 26], ['professeur', 'Professeur', 26],
      ['nom_cours', 'Encadrement', 34], ['ue_num', 'UE', 8],
      ['ue_nom', 'Unité', 34], ['periodes', 'Périodes']]),
    lignes: (p) => db.prepare(`
      SELECT section, professeur, nom_cours, ue_num, ue_nom,
        ROUND(SUM(total_attribue_professeur), 2) AS periodes
      FROM v_attribution_complete
      WHERE annee_scolaire = ? AND professeur IS NOT NULL
        AND COALESCE(coordination_encadrement, '') <> ''
        AND (? IS NULL OR section = ?)
      GROUP BY section, professeur, nom_cours, ue_num, ue_nom
      ORDER BY section, professeur, ue_num`).all(p.annee, p.section, p.section),
  },

  // ── RÉFÉRENTIELS ────────────────────────────────────────────────────────
  {
    id: 'referentiel-ue', domaine: 'referentiels', params: ['annee'],
    libelle: 'Unités d’enseignement du référentiel',
    aide: "Code approuvé, niveau, périodes, déterminante, épreuve intégrée.",
    colonnes: COLS([['section', 'Section', 26], ['ue_num', 'UE', 8],
      ['ue_nom', 'Intitulé', 44], ['ue_code_fwb', 'Code approuvé', 18],
      ['ue_niv', 'Niveau', 10], ['ue_det', 'Déterminante', 14],
      ['is_epreuve_integree', 'Épreuve intégrée', 16], ['ects', 'ECTS', 8]]),
    lignes: (p) => db.prepare(`
      SELECT section, ue_num, ue_nom, ue_code_fwb, ue_niv,
        CASE WHEN ue_det = 'x' THEN 'oui' ELSE '' END AS ue_det,
        CASE WHEN COALESCE(is_epreuve_integree,0) = 1 THEN 'oui' ELSE '' END AS is_epreuve_integree,
        ects
      FROM ue WHERE annee_scolaire = ? ORDER BY section, ue_num`).all(p.annee),
  },
  {
    id: 'referentiel-cours', domaine: 'referentiels', params: ['annee'],
    libelle: 'Grille de cours',
    aide: "Les cours de chaque unité, avec leurs périodes.",
    colonnes: COLS([['section', 'Section', 24], ['ue_num', 'UE', 8],
      ['ue_nom', 'Unité', 36], ['cours_code', 'Cours', 12],
      ['cours_nom', 'Intitulé', 40], ['cours_per', 'Périodes']]),
    lignes: (p) => db.prepare(`
      SELECT u.section, c.ue_num, u.ue_nom, c.cours_code, c.cours_nom, c.cours_per
      FROM cours c LEFT JOIN ue u ON u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire
      WHERE c.annee_scolaire = ? ORDER BY u.section, c.ue_num, c.cours_code`).all(p.annee),
  },
  {
    id: 'referentiel-acquis', domaine: 'referentiels', params: [],
    libelle: 'Acquis d’apprentissage',
    aide: "Les acquis de chaque unité, tels qu'ils figurent aux attestations.",
    colonnes: COLS([['ue_num', 'UE', 8], ['aa_code', 'Acquis', 14],
      ['description', 'Énoncé', 90]]),
    // La table « aa » ne porte PAS d'année : les acquis sont rattachés à
    // l'unité, non à un millésime. Filtrer sur l'année aurait échoué en
    // silence — ou plutôt bruyamment, ce qui vaut mieux.
    lignes: () => db.prepare(`
      SELECT ue_num, aa_code, description FROM aa
      ORDER BY ue_num, aa_code`).all(),
  },

  {
    id: 'referentiel-ue-sans-attribution', domaine: 'referentiels', params: ['annee', 'section'],
    libelle: 'Unités sans attribution',
    aide: "Ce qui est organisé mais que personne ne donne — à vérifier avant la rentrée.",
    colonnes: COLS([['section', 'Section', 26], ['ue_num', 'UE', 8],
      ['ue_nom', 'Intitulé', 44], ['ue_quad', 'Quadri', 10], ['ects', 'ECTS', 8]]),
    lignes: (p) => db.prepare(`
      SELECT u.section, u.ue_num, u.ue_nom, u.ue_quad, u.ects
      FROM ue u
      WHERE u.annee_scolaire = ? AND (? IS NULL OR u.section = ?)
        AND NOT EXISTS (SELECT 1 FROM v_attribution_complete v
                         WHERE v.annee_scolaire = u.annee_scolaire
                           AND v.ue_num = u.ue_num AND v.professeur IS NOT NULL)
      ORDER BY u.section, u.ue_num`).all(p.annee, p.section, p.section),
  },

  // ── ORGANISATION ────────────────────────────────────────────────────────
  {
    id: 'organisation-seances', domaine: 'organisation', params: ['annee'],
    libelle: 'Calendrier des délibérations',
    aide: "Dates de séance, visite des copies et seconde session, unité par unité.",
    colonnes: COLS([['section', 'Section', 24], ['ue_num', 'UE', 8],
      ['ue_nom', 'Unité', 36], ['session', 'Session', 10],
      ['date_seance', 'Délibération', 14], ['heure_seance', 'Heure', 10],
      ['visite_date', 'Visite des copies', 16], ['cloturee', 'Close', 10]]),
    lignes: (p) => db.prepare(`
      SELECT u.section, s.ue_num, u.ue_nom, s.session, s.date_seance, s.heure_seance,
        s.visite_date, CASE WHEN s.cloturee = 1 THEN 'oui' ELSE '' END AS cloturee
      FROM deliberation_seance s
      LEFT JOIN ue u ON u.ue_num = s.ue_num AND u.annee_scolaire = s.annee_scolaire
      WHERE s.annee_scolaire = ?
      ORDER BY u.section, s.ue_num, s.session`).all(p.annee),
  },
  {
    id: 'organisation-locaux', domaine: 'organisation', params: [],
    libelle: 'Locaux de l’Institut',
    aide: "Type, capacité et équipements.",
    colonnes: COLS([['nom', 'Local', 18], ['type', 'Type', 26],
      ['places', 'Places'], ['equipements', 'Équipements', 44],
      ['actif', 'En service', 12]]),
    /**
     * DEUX DÉFINITIONS DE « local » COHABITENT dans le dépôt : celle du schéma
     * d'origine (« equipement », « micro », « son ») et celle des fondations
     * locaux (« equipements », « actif »). La base réelle porte la seconde,
     * mais une instance ancienne peut porter la première : on lit ce qui
     * existe plutôt que de supposer.
     */
    lignes: () => {
      const cols = new Set(db.prepare('PRAGMA table_info(local)').all().map(c => c.name));
      const eq = cols.has('equipements') ? 'equipements'
        : cols.has('equipement') ? 'equipement' : "''";
      const actif = cols.has('actif') ? "CASE WHEN actif = 1 THEN 'oui' ELSE 'non' END"
        : "'oui'";
      return db.prepare(`SELECT nom, type, places, ${eq} AS equipements,
        ${actif} AS actif FROM local ORDER BY type, nom`).all();
    },
  },
];

r.get('/catalogue', authRequired, (req, res) => {
  res.json({
    rapports: RAPPORTS.map(({ id, domaine, libelle, aide, params, colonnes }) => ({
      id, domaine, libelle, aide, params, colonnes: colonnes.length,
    })),
  });
});

/** Un aperçu à l'écran avant de télécharger : on voit ce qu'on emporte. */
r.post('/:id/apercu', authRequired, (req, res) => {
  const def = RAPPORTS.find(x => x.id === req.params.id);
  if (!def) return res.status(404).json({ error: 'rapport inconnu' });
  try {
    const p = parametres(req, def);
    const lignes = def.lignes(p);
    res.json({
      id: def.id, libelle: def.libelle, parametres: p,
      colonnes: def.colonnes, nb: lignes.length, lignes: lignes.slice(0, 50),
      tronque: lignes.length > 50,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/*
 * LE MÊME RAPPORT, MAIS IMPRIMABLE.
 *
 * Un rapport ne sortait qu'en tableur. Or un tableur ne se dépose pas dans un
 * dossier, ne s'annexe pas à un courrier et ne se présente pas au Conseil : il
 * se rouvre, et il s'édite. Pour tout ce qui doit être MONTRÉ plutôt que
 * retravaillé, il manquait la pièce — et donc, en pratique, la fonction.
 *
 * C'est la même enveloppe que toutes les pièces administratives de Lucie
 * (lib/document.js) : A4, marges de 18 mm, en-tête de l'établissement, pied
 * numéroté. On n'en écrit pas une dixième.
 */
r.post('/:id/document', authRequired, (req, res) => {
  const def = RAPPORTS.find(x => x.id === req.params.id);
  if (!def) return res.status(404).json({ error: 'rapport inconnu' });
  try {
    const p = parametres(req, def);
    const lignes = def.lignes(p);
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

    // Les colonnes de nombres s'alignent à droite : une colonne de chiffres
    // cadrée à gauche ne se compare pas d'un coup d'oeil, et c'est pour la
    // comparer qu'on l'imprime.
    const nombre = c => lignes.some(l => typeof l[c.cle] === 'number');
    const corps = `
      <h1>${esc(def.libelle)}</h1>
      <p class="sous">${esc(def.aide || '')}</p>
      <table>
        <thead><tr>${def.colonnes.map(c =>
          `<th${nombre(c) ? ' style="text-align:right"' : ''}>${esc(c.entete)}</th>`).join('')}</tr></thead>
        <tbody>${lignes.map(l => `<tr>${def.colonnes.map(c =>
          `<td${nombre(c) ? ' style="text-align:right"' : ''}>${esc(l[c.cle])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      <p class="ref">${lignes.length} ligne(s)${
        p.annee ? ` · année ${esc(p.annee)}` : ''}${
        p.session ? ` · session ${esc(p.session)}` : ''}</p>`;

    res.json({
      html: envelopperDocument({
        html: corps,
        titre: def.libelle,
        // Un rapport large se lit en paysage : douze colonnes sur une A4
        // portrait deviennent illisibles, et on les imprime pour les lire.
        orientation: def.colonnes.length > 6 ? 'paysage' : 'portrait',
        styles: STYLE_RAPPORT,
      }),
      nom: `${def.id}-${p.annee || ''}.html`,
      titre: def.libelle,
      nb: lignes.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/:id/xlsx', authRequired, async (req, res) => {
  const def = RAPPORTS.find(x => x.id === req.params.id);
  if (!def) return res.status(404).json({ error: 'rapport inconnu' });
  try {
    const p = parametres(req, def);
    const lignes = def.lignes(p);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Lucie — Institut Ilya Prigogine';
    wb.created = new Date();
    const ws = wb.addWorksheet(def.libelle.slice(0, 30));

    // Un en-tête qui dit CE QU'ON REGARDE : un tableur sans son périmètre ni sa
    // date circule et devient faux sans que personne s'en aperçoive.
    ws.addRow([def.libelle]).font = { bold: true, size: 14 };
    ws.addRow([`${p.annee || ''}${p.session ? ` · session ${p.session}` : ''}`
      + ` · extrait le ${new Date().toLocaleDateString('fr-BE')}`]).font =
      { italic: true, color: { argb: 'FF64748B' } };
    ws.addRow([]);

    const entetes = ws.addRow(def.colonnes.map(c => c.entete));
    entetes.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    entetes.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2B4B' } };
      c.alignment = { vertical: 'middle', wrapText: true };
    });
    ws.columns.forEach((c, i) => { c.width = def.colonnes[i]?.largeur || 16; });

    for (const l of lignes) ws.addRow(def.colonnes.map(c => l[c.cle] ?? ''));
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + lignes.length, column: def.colonnes.length },
    };

    const buf = await wb.xlsx.writeBuffer();
    const nom = `${def.id}_${String(p.annee || '').replace(/\W/g, '')}.xlsx`;
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.send(Buffer.from(buf));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Les paramètres attendus, avec le périmètre de l'utilisateur toujours appliqué. */
function parametres(req, def) {
  const p = {};
  if (def.params.includes('annee')) p.annee = req.body?.annee || anneeDeTravail(req);
  if (def.params.includes('session')) p.session = Number(req.body?.session) === 2 ? 2 : 1;
  // LA SECTION EST UN FILTRE, PAS UNE OBLIGATION. Vide, le rapport porte sur
  // tout l'établissement — c'est le cas du Conseil et de la dotation ; choisie,
  // il ne parle que d'un cursus — c'est le cas d'une coordination.
  if (def.params.includes('section')) p.section = req.body?.section || null;
  p.perimetre = getUserSections(req.user);
  return p;
}

export default r;

/**
 * UN DOCUMENT GROUPÉ, DANS L'ENVELOPPE DE LA MAISON.
 *
 * Le pilotage écrivait son rapport lui-même, dans le navigateur : sa propre
 * page A4, ses propres marges de 14 mm, un en-tête de tableau en aplat marine,
 * des lignes de regroupement indigo, une rayure une ligne sur deux — et pas de
 * pied de page. C'était la dixième enveloppe, celle qu'on s'était promis de ne
 * pas écrire, et la seule à ne pas porter l'identité de l'établissement.
 *
 * Elle disparaît au profit de celle-ci : l'écran envoie ce qu'il veut MONTRER —
 * des groupes, des colonnes, des lignes —, jamais du balisage, et le serveur
 * l'habille comme toutes les autres pièces. La couleur y devient inutile : un
 * filet suffit à séparer, et le seul contraste est celui de l'en-tête.
 */
r.post('/document-groupe', authRequired, (req, res) => {
  const b = req.body || {};
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const groupes = Array.isArray(b.groupes) ? b.groupes : [];
  const colonnes = Array.isArray(b.colonnes) ? b.colonnes : [];
  if (!colonnes.length) return res.status(400).json({ error: 'colonnes requises' });

  const cell = (c, v, tag = 'td') =>
    `<${tag}${c.num ? ' style="text-align:right"' : ''}>${esc(v)}</${tag}>`;

  const corps = `
    <h1>${esc(b.titre || 'Rapport')}</h1>
    ${b.sous ? `<p class="sous">${esc(b.sous)}</p>` : ''}
    ${groupes.map(g => `
      <h3>${esc(g.titre || '')}${g.sous ? ` <span class="sous">— ${esc(g.sous)}</span>` : ''}</h3>
      <table>
        <thead><tr>${colonnes.map(c => cell(c, c.entete, 'th')).join('')}</tr></thead>
        <tbody>${(g.lignes || []).map(l => l.__repere
          ? `<tr class="repere"><td colspan="${colonnes.length}">${esc(l.__repere)}</td></tr>`
          : `<tr>${colonnes.map(c => cell(c, l[c.cle])).join('')}</tr>`).join('')}</tbody>
      </table>`).join('')}`;

  res.json({
    html: envelopperDocument({
      html: corps,
      titre: b.titre || 'Rapport',
      // L'écran choisit le sens quand il en propose le choix ; à défaut, un
      // tableau large se lit en paysage.
      orientation: b.orientation === 'paysage' || b.orientation === 'portrait'
        ? b.orientation : (colonnes.length > 6 ? 'paysage' : 'portrait'),
      styles: STYLE_RAPPORT,
    }),
    titre: b.titre || 'Rapport',
  });
});

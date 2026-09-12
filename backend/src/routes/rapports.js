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
  p.perimetre = getUserSections(req.user);
  return p;
}

export default r;

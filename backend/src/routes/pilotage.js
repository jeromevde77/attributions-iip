/**
 * Reproduit Tableau_pilotage (Tableau8, Tableau3, Tableau11, Tableau18)
 * via des GROUP BY SQL au lieu de SUMIFS Excel.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();

/**
 * Tableau8 / 26-27 : agrégation par Section × Niveau (bloc)
 * Colonnes : Périodes att, IIP, HELB, Per B, Q1, Q2, Q1/Q2, S-D, J-J
 */
r.get('/section-niveau', authRequired, (req, res) => {
  const sql = `
    SELECT
      section,
      bloc,
      SUM(total_attribue_professeur)                                                AS periodes_att,
      SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END)   AS iip,
      SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END)   AS helb,
      SUM(cout_dotation)                                                            AS per_b,
      SUM(CASE WHEN quadri_pour_tous_prevu='Q1'    THEN cout_dotation ELSE 0 END)   AS q1,
      SUM(CASE WHEN quadri_pour_tous_prevu='Q2'    THEN cout_dotation ELSE 0 END)   AS q2,
      SUM(CASE WHEN quadri_pour_tous_prevu='Q1/Q2' THEN cout_dotation ELSE 0 END)   AS q1q2,
      SUM(cout_dotation_q1)                                                         AS sd,
      SUM(cout_dotation_q2)                                                         AS jj
    FROM v_attribution_complete
    GROUP BY section, bloc
    ORDER BY section, bloc
  `;
  res.json(db.prepare(sql).all());
});

/**
 * Tableau11 : par section + statut (CC / EXP)
 */
r.get('/section-statut', authRequired, (req, res) => {
  const sql = `
    SELECT
      section,
      SUM(CASE WHEN contrat='CC'  THEN total_attribue_professeur ELSE 0 END) AS cc,
      SUM(CASE WHEN contrat='EXP' THEN total_attribue_professeur ELSE 0 END) AS exp,
      SUM(total_attribue_professeur) AS total
    FROM v_attribution_complete
    GROUP BY section
    ORDER BY section
  `;
  res.json(db.prepare(sql).all());
});

/**
 * Tableau18 : la grosse vue par section × niveau avec ETP, coordinations
 */
r.get('/section-detail', authRequired, (req, res) => {
  const sql = `
    SELECT
      section,
      bloc,
      SUM(total_attribue_professeur)                                                              AS periodes_att,
      SUM(CASE WHEN contrat_mdp='IIP' THEN total_attribue_professeur ELSE 0 END)                  AS iip,
      SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END) AS ct,
      SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END) AS pp,
      (SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END) / 800.0
       + SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END) / 1000.0) AS etp_iip,
      SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END)                 AS helb,
      SUM(CASE WHEN contrat_mdp='HELB' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END) AS ct_helb,
      SUM(CASE WHEN contrat_mdp='HELB' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END) AS pp_helb,
      (SUM(CASE WHEN contrat_mdp='HELB' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END) / 800.0
       + SUM(CASE WHEN contrat_mdp='HELB' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END) / 1000.0) AS etp_helb,
      SUM(CASE WHEN coordination_encadrement='COCUR'  THEN total_attribue_professeur ELSE 0 END) AS cocur,
      SUM(CASE WHEN coordination_encadrement='COSTA'  THEN total_attribue_professeur ELSE 0 END) AS costa,
      SUM(CASE WHEN coordination_encadrement='COTFE'  THEN total_attribue_professeur ELSE 0 END) AS cotfe,
      SUM(CASE WHEN coordination_encadrement='COPEDA' THEN total_attribue_professeur ELSE 0 END) AS copeda,
      SUM(CASE WHEN coordination_encadrement='COQUAL' THEN total_attribue_professeur ELSE 0 END) AS coqual,
      SUM(CASE WHEN coordination_encadrement='COINCL' THEN total_attribue_professeur ELSE 0 END) AS coincl,
      SUM(CASE WHEN coordination_encadrement='CREF'   THEN total_attribue_professeur ELSE 0 END) AS cref,
      SUM(CASE WHEN coordination_encadrement='EI'     THEN total_attribue_professeur ELSE 0 END) AS ei,
      SUM(CASE WHEN coordination_encadrement='ES'     THEN total_attribue_professeur ELSE 0 END) AS es
    FROM v_attribution_complete
    GROUP BY section, bloc
    ORDER BY section, bloc
  `;
  res.json(db.prepare(sql).all());
});

/**
 * Totaux globaux (KPIs en haut du dashboard)
 */
r.get('/totaux', authRequired, (req, res) => {
  const k = db.prepare(`
    SELECT
      COUNT(*)                                       AS nb_attributions,
      COUNT(DISTINCT professeur_id)                  AS nb_professeurs,
      COUNT(DISTINCT ue_num)                         AS nb_ue,
      ROUND(SUM(total_attribue_professeur), 2)       AS total_periodes,
      ROUND(SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END), 2) AS total_iip,
      ROUND(SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END), 2) AS total_helb,
      ROUND(SUM(cout_dotation), 2)                   AS cout_dotation_total
    FROM v_attribution_complete
  `).get();
  const dispo = db.prepare(`
    SELECT valeur_num FROM parametre_financier WHERE cle = 'PERIODES_DISPO_25'
  `).get();
  k.periodes_disponibles = dispo?.valeur_num ?? null;
  k.solde = k.periodes_disponibles ? (k.periodes_disponibles - (k.total_iip ?? 0)) : null;
  res.json(k);
});

export default r;

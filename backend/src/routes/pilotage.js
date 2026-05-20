import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();

// Helper : retourne le WHERE annee_scolaire et les params
function anneeFilter(req) {
  const annee = req.query.annee || '2025-2026';
  return { where: 'annee_scolaire = @annee', params: { annee } };
}

r.get('/section-niveau', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  res.json(db.prepare(`
    SELECT
      section, bloc,
      SUM(total_attribue_professeur)                                              AS periodes_att,
      SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END) AS iip,
      SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END) AS helb,
      SUM(cout_dotation)                                                          AS per_b,
      SUM(cout_dotation_q1)                                                       AS sd,
      SUM(cout_dotation_q2)                                                       AS jj
    FROM v_attribution_complete WHERE ${where}
    GROUP BY section, bloc ORDER BY section, bloc
  `).all(params));
});

r.get('/section-statut', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  res.json(db.prepare(`
    SELECT
      section,
      SUM(CASE WHEN contrat='CC'  THEN total_attribue_professeur ELSE 0 END) AS cc,
      SUM(CASE WHEN contrat='EXP' THEN total_attribue_professeur ELSE 0 END) AS exp,
      SUM(total_attribue_professeur) AS total
    FROM v_attribution_complete WHERE ${where}
    GROUP BY section ORDER BY section
  `).all(params));
});

r.get('/section-detail', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  res.json(db.prepare(`
    SELECT
      section, bloc,
      SUM(total_attribue_professeur)                                                              AS periodes_att,
      SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END)                AS iip,
      SUM(CASE WHEN contrat_mdp='IIP'  AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END) AS ct,
      SUM(CASE WHEN contrat_mdp='IIP'  AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END) AS pp,
      (SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END) / 800.0
       + SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END) / 1000.0) AS etp_iip,
      SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END)                AS helb,
      (SUM(CASE WHEN contrat_mdp='HELB' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END) / 800.0
       + SUM(CASE WHEN contrat_mdp='HELB' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END) / 1000.0) AS etp_helb
    FROM v_attribution_complete WHERE ${where}
    GROUP BY section, bloc ORDER BY section, bloc
  `).all(params));
});

r.get('/totaux', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  const k = db.prepare(`
    SELECT
      COUNT(*)                                       AS nb_attributions,
      COUNT(DISTINCT professeur_id)                  AS nb_professeurs,
      COUNT(DISTINCT ue_num)                         AS nb_ue,
      COUNT(DISTINCT section)                        AS nb_sections,
      ROUND(SUM(total_attribue_professeur), 2)       AS total_periodes,
      ROUND(SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END), 2) AS total_iip,
      ROUND(SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END), 2) AS total_helb,
      ROUND(SUM(cout_dotation), 2)                   AS cout_dotation_total,
      ROUND(SUM(cout_dotation_q1), 2)                AS cout_sd,
      ROUND(SUM(cout_dotation_q2), 2)                AS cout_jj
    FROM v_attribution_complete WHERE ${where}
  `).get(params);
  const dispo = db.prepare(`SELECT valeur_num FROM parametre_financier WHERE cle = 'PERIODES_DISPO_25'`).get();
  k.periodes_disponibles = dispo?.valeur_num ?? null;
  k.solde = k.periodes_disponibles ? (k.periodes_disponibles - (k.total_iip ?? 0)) : null;
  res.json(k);
});

export default r;

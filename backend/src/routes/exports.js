/**
 * Génère :
 *   - L'export DOC2/3 (vue par UE pour la FWB)
 *   - L'export par professeur (équivalent feuille Attributions_profs)
 *   - L'export Excel complet
 */
import { Router } from 'express';
import ExcelJS from 'exceljs';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();

// DOC2/3 : agrégation par UE (TOTAL DOC2 = somme des périodes ; cours / autonomie séparés)
r.get('/doc2-3', authRequired, (req, res) => {
  const annee = req.query.annee || '2025-2026';
  const sql = `
    SELECT
      u.ue_num, u.ue_nom, u.ue_code_fwb, u.section, u.ue_niveau,
      u.ue_niv AS bloc,
      u.ue_per_cours  AS per_cours_doc2,
      u.ue_aut        AS per_auto_doc2,
      u.ue_tot_prf    AS total_doc2,
      COALESCE(SUM(a.periodes_attribuees), 0)        AS per_cours_dp,
      COALESCE(SUM(a.autonomie_attribuee), 0)        AS per_auto_dp,
      COALESCE(SUM(a.total_attribue_professeur), 0)  AS total_dp
    FROM ue u
    LEFT JOIN attribution a ON a.ue_num = u.ue_num AND a.annee_scolaire = ?
    GROUP BY u.ue_num
    ORDER BY u.section, u.ue_num
  `;
  res.json(db.prepare(sql).all(annee));
});

// Vue Attributions_profs : par prof (mêmes colonnes que la feuille Excel R11+)
r.get('/professeurs', authRequired, (req, res) => {
  const sql = `
    SELECT
      p.id AS prof_id,
      p.nom || ' ' || p.prenom AS nom_mdp,
      v.section, v.contrat, v.ue_num, v.nom_cours,
      v.contrat AS statut,
      v.quadri_pour_tous_prevu AS q,
      v.organisation AS orga,
      v.code AS gr,
      v.periodes_attribuees   AS per,
      v.autonomie_attribuee   AS aut,
      v.total_attribue_professeur AS tot_per,
      v.charge_en_heures      AS hrs,
      v.type_cours            AS type,
      v.contrat_mdp
    FROM professeur p
    LEFT JOIN v_attribution_complete v ON v.professeur_id = p.id
    ORDER BY p.nom, p.prenom, v.section, v.ue_num
  `;
  res.json(db.prepare(sql).all());
});

// Export Excel complet (= reconstitution des feuilles principales)
r.get('/excel', authRequired, async (req, res) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Application Attributions IIP';
  wb.created = new Date();

  // Feuille Attributions
  const wsA = wb.addWorksheet('Attributions');
  const attrs = db.prepare('SELECT * FROM v_attribution_complete').all();
  if (attrs.length) {
    wsA.columns = Object.keys(attrs[0]).map(k => ({ header: k, key: k, width: 18 }));
    wsA.addRows(attrs);
    wsA.getRow(1).font = { bold: true };
    wsA.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6B400' } };
  }

  // Feuille Pilotage
  const wsP = wb.addWorksheet('Pilotage');
  const pilot = db.prepare(`
    SELECT section, bloc,
      SUM(total_attribue_professeur) AS periodes_att,
      SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END) AS iip,
      SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END) AS helb,
      SUM(cout_dotation) AS per_b
    FROM v_attribution_complete GROUP BY section, bloc ORDER BY section, bloc
  `).all();
  if (pilot.length) {
    wsP.columns = Object.keys(pilot[0]).map(k => ({ header: k, key: k, width: 16 }));
    wsP.addRows(pilot);
    wsP.getRow(1).font = { bold: true };
  }

  // Feuille Professeurs
  const wsProf = wb.addWorksheet('Professeurs');
  const profs = db.prepare('SELECT * FROM v_professeur_total ORDER BY nom, prenom').all();
  if (profs.length) {
    wsProf.columns = Object.keys(profs[0]).map(k => ({ header: k, key: k, width: 22 }));
    wsProf.addRows(profs);
    wsProf.getRow(1).font = { bold: true };
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="attributions-${new Date().toISOString().slice(0,10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

export default r;

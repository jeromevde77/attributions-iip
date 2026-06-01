import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// ── Expressions SQL réutilisables ────────────────────────────────────────────
// pot_code effectif : colonne explicite ou auto-détecté depuis ue_code_fwb
const POT = `COALESCE(u.pot_code,
  CASE WHEN u.ue_code_fwb LIKE '980302%' THEN 'QUAL'
       WHEN u.ue_code_fwb LIKE '980301%' THEN 'CF'
       WHEN u.ue_code_fwb LIKE '980303%' THEN 'INCL'
       ELSE 'organique' END)`;

// Coût dotation Q1 (périodes B pondérées, IIP uniquement)
const CQ1 = `CASE WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1' THEN
       CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5
            WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25
            ELSE 0 END
     WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1/Q2' THEN
       CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5*0.4
            WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25*0.4
            ELSE 0 END
     ELSE 0 END`;

// Coût dotation Q2
const CQ2 = `CASE WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q2' THEN
       CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5
            WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25
            ELSE 0 END
     WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1/Q2' THEN
       CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur*1.5*0.6
            WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur*1.25*0.6
            ELSE 0 END
     ELSE 0 END`;

// ── Helper année civile ───────────────────────────────────────────────────────
function anneesCivile(y) {
  return {
    q2: `${y - 1}-${y}`,     // Jan-Jun → Q2 de l'année scolaire précédente
    q1: `${y}-${y + 1}`,     // Sep-Déc → Q1 de l'année scolaire suivante
  };
}

// Calcule usage par pot pour une liste d'années civiles depuis la DB
function computeUsageDB(anneesCiviles) {
  if (!anneesCiviles.length) return {};
  const anneesScolaires = new Set();
  for (const y of anneesCiviles) {
    const { q2, q1 } = anneesCivile(y);
    anneesScolaires.add(q2);
    anneesScolaires.add(q1);
  }
  const inClause = [...anneesScolaires].map(a => `'${a}'`).join(',');
  const rows = db.prepare(`
    SELECT
      a.annee_scolaire,
      ${POT} AS pot,
      ROUND(SUM(${CQ1}), 2) AS q1,
      ROUND(SUM(${CQ2}), 2) AS q2
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.annee_scolaire IN (${inClause}) AND a.contrat_mdp = 'IIP'
    GROUP BY a.annee_scolaire, pot
  `).all();
  // { annee_scolaire → { pot → { q1, q2 } } }
  const byAnnee = {};
  for (const row of rows) {
    if (!byAnnee[row.annee_scolaire]) byAnnee[row.annee_scolaire] = {};
    byAnnee[row.annee_scolaire][row.pot] = { q1: row.q1 || 0, q2: row.q2 || 0 };
  }
  return byAnnee;
}

// Calcul usage d'un pot pour une année civile depuis usageDB
function usagePot(usageDB, y, potKey) {
  const { q2, q1 } = anneesCivile(y);
  const q2val = usageDB[q2]?.[potKey] || { q1: 0, q2: 0 };
  const q1val = usageDB[q1]?.[potKey] || { q1: 0, q2: 0 };
  return Math.round((q2val.q2 + q1val.q1) * 100) / 100;
}

// ── Routes existantes (par année scolaire) ───────────────────────────────────
function anneeFilter(req) {
  const annee = req.query.annee || '2025-2026';
  return { where: 'annee_scolaire = @annee', params: { annee } };
}

r.get('/section-niveau', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  res.json(db.prepare(`
    SELECT section, bloc,
      SUM(total_attribue_professeur) AS periodes_att,
      SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END) AS iip,
      SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END) AS helb,
      SUM(cout_dotation)   AS per_b,
      SUM(cout_dotation_q1) AS sd,
      SUM(cout_dotation_q2) AS jj
    FROM v_attribution_complete WHERE ${where}
    GROUP BY section, bloc ORDER BY section, bloc
  `).all(params));
});

r.get('/section-statut', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  res.json(db.prepare(`
    SELECT section,
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
    SELECT section, bloc,
      SUM(total_attribue_professeur) AS periodes_att,
      SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END) AS iip,
      SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END) AS ct,
      SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END) AS pp,
      (SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END)/800.0
       + SUM(CASE WHEN contrat_mdp='IIP' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END)/1000.0) AS etp_iip,
      SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END) AS helb,
      (SUM(CASE WHEN contrat_mdp='HELB' AND type_cours='CT' THEN total_attribue_professeur ELSE 0 END)/800.0
       + SUM(CASE WHEN contrat_mdp='HELB' AND type_cours='PP' THEN total_attribue_professeur ELSE 0 END)/1000.0) AS etp_helb
    FROM v_attribution_complete WHERE ${where}
    GROUP BY section, bloc ORDER BY section, bloc
  `).all(params));
});

r.get('/totaux', authRequired, (req, res) => {
  const { where, params } = anneeFilter(req);
  const k = db.prepare(`
    SELECT
      COUNT(*)                               AS nb_attributions,
      COUNT(DISTINCT professeur_id)          AS nb_professeurs,
      COUNT(DISTINCT ue_num)                 AS nb_ue,
      COUNT(DISTINCT section)                AS nb_sections,
      ROUND(SUM(total_attribue_professeur),2) AS total_periodes,
      ROUND(SUM(CASE WHEN contrat_mdp='IIP'  THEN total_attribue_professeur ELSE 0 END),2) AS total_iip,
      ROUND(SUM(CASE WHEN contrat_mdp='HELB' THEN total_attribue_professeur ELSE 0 END),2) AS total_helb,
      ROUND(SUM(cout_dotation),2)            AS cout_dotation_total,
      ROUND(SUM(cout_dotation_q1),2)         AS cout_sd,
      ROUND(SUM(cout_dotation_q2),2)         AS cout_jj
    FROM v_attribution_complete WHERE ${where}
  `).get(params);
  // Dotation : préférer dotation_civile si disponible, fallback parametre_financier
  const annee = params.annee;
  const ySuffix = annee ? annee.split('-')[1]?.slice(-2) : '25';
  const dc = db.prepare(`SELECT dotation_organique FROM dotation_civile WHERE annee_civile = ?`).get(2000 + parseInt(ySuffix));
  const dispo = dc?.dotation_organique ?? db.prepare(`SELECT valeur_num FROM parametre_financier WHERE cle = 'PERIODES_DISPO_${ySuffix}'`).get()?.valeur_num ?? null;
  k.periodes_disponibles = dispo;
  k.solde = dispo ? (dispo - (k.total_iip ?? 0)) : null;
  res.json(k);
});

// ── Nouvelles routes : pilotage par ANNÉE CIVILE ──────────────────────────────

// GET /civil — résumé de toutes les années civiles (organique + enveloppes)
r.get('/civil', authRequired, (req, res) => {
  const years = db.prepare('SELECT * FROM dotation_civile ORDER BY annee_civile').all();
  if (!years.length) return res.json([]);

  const toCompute = years.filter(y => y.usage_historique_organique == null).map(y => y.annee_civile);
  const usageDB = toCompute.length ? computeUsageDB(toCompute) : {};
  const enveloppes = db.prepare('SELECT * FROM enveloppe_externe ORDER BY code, annee_civile').all();

  const result = years.map(yr => {
    const y = yr.annee_civile;
    const orgUsage = yr.usage_historique_organique != null
      ? yr.usage_historique_organique
      : usagePot(usageDB, y, 'organique');

    const envYear = enveloppes.filter(e => e.annee_civile === y).map(e => {
      const usage = e.usage_historique != null
        ? e.usage_historique
        : usagePot(usageDB, y, e.code);
      return {
        ...e,
        usage,
        solde: Math.round((e.periodes_b - usage) * 100) / 100,
        pct: e.periodes_b ? Math.round((usage / e.periodes_b) * 1000) / 10 : null,
      };
    });

    return {
      annee_civile: y,
      dotation_organique: yr.dotation_organique,
      usage_organique: orgUsage,
      solde_organique: Math.round((yr.dotation_organique - orgUsage) * 100) / 100,
      pct_organique: yr.dotation_organique ? Math.round((orgUsage / yr.dotation_organique) * 1000) / 10 : null,
      source: yr.usage_historique_organique != null ? 'historique' : 'calcule',
      notes: yr.notes,
      enveloppes: envYear,
    };
  });

  res.json(result);
});

// GET /civil/:annee — détail par section pour une année civile
r.get('/civil/:annee', authRequired, (req, res) => {
  const y = parseInt(req.params.annee);
  if (!y || y < 2000) return res.status(400).json({ error: 'Année civile invalide' });
  const { q2, q1 } = anneesCivile(y);

  // Vérifier si année dans la DB
  const dc = db.prepare('SELECT * FROM dotation_civile WHERE annee_civile = ?').get(y);
  if (!dc) return res.status(404).json({ error: 'Année civile non configurée' });

  // Si données historiques : retourner ce qu'on a
  if (dc.usage_historique_organique != null) {
    return res.json({
      annee_civile: y, source: 'historique',
      dotation_organique: dc.dotation_organique,
      usage_organique: dc.usage_historique_organique,
      sections: [],
    });
  }

  const inClause = `'${q2}', '${q1}'`;
  const sections = db.prepare(`
    SELECT
      a.section,
      ${POT} AS pot,
      ROUND(SUM(CASE WHEN a.annee_scolaire='${q2}' THEN ${CQ2} ELSE 0 END) +
            SUM(CASE WHEN a.annee_scolaire='${q1}' THEN ${CQ1} ELSE 0 END), 2) AS usage
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.annee_scolaire IN (${inClause}) AND a.contrat_mdp = 'IIP'
    GROUP BY a.section, pot
    ORDER BY a.section, pot
  `).all();

  res.json({ annee_civile: y, source: 'calcule', dotation_organique: dc.dotation_organique, sections });
});

// PUT /dotation-civile/:annee — créer ou mettre à jour une année civile
r.put('/dotation-civile/:annee', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const y = parseInt(req.params.annee);
  if (!y || y < 2000 || y > 2100) return res.status(400).json({ error: 'Année civile invalide' });
  const { dotation_organique, usage_historique_organique, notes, periodes_eleves,
          pep_reference, pep_annee_utilisee, pep_calculee, dotation_utilisable } = req.body;
  if (dotation_organique == null) return res.status(400).json({ error: 'dotation_organique requis' });
  db.prepare(`
    INSERT INTO dotation_civile (annee_civile, dotation_organique, usage_historique_organique, notes,
      periodes_eleves, pep_reference, pep_annee_utilisee, pep_calculee, dotation_utilisable)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(annee_civile) DO UPDATE SET
      dotation_organique            = excluded.dotation_organique,
      usage_historique_organique    = excluded.usage_historique_organique,
      notes                         = excluded.notes,
      periodes_eleves               = excluded.periodes_eleves,
      pep_reference                 = excluded.pep_reference,
      pep_annee_utilisee            = excluded.pep_annee_utilisee,
      pep_calculee                  = excluded.pep_calculee,
      dotation_utilisable           = excluded.dotation_utilisable
  `).run(y, dotation_organique, usage_historique_organique ?? null, notes ?? null,
         periodes_eleves ?? null, pep_reference ?? null, pep_annee_utilisee ?? null,
         pep_calculee ?? null, dotation_utilisable ?? null);
  res.json({ ok: true });
});

// DELETE /dotation-civile/:annee — supprimer une année civile (et ses enveloppes)
r.delete('/dotation-civile/:annee', authRequired, roleRequired('admin'), (req, res) => {
  const y = parseInt(req.params.annee);
  db.prepare('DELETE FROM enveloppe_externe WHERE annee_civile = ?').run(y);
  db.prepare('DELETE FROM dotation_civile WHERE annee_civile = ?').run(y);
  res.json({ ok: true });
});

// GET /enveloppes — liste des enveloppes
r.get('/enveloppes', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM enveloppe_externe ORDER BY annee_civile, code').all());
});

// POST /enveloppes — créer une enveloppe
r.post('/enveloppes', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { code, label, annee_civile, periodes_b, usage_historique, notes } = req.body;
  if (!code || !annee_civile || periodes_b == null) return res.status(400).json({ error: 'code, annee_civile et periodes_b requis' });
  try {
    const info = db.prepare(`
      INSERT INTO enveloppe_externe (code, label, annee_civile, periodes_b, usage_historique, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code.toUpperCase(), label || code, parseInt(annee_civile), periodes_b, usage_historique ?? null, notes ?? null);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Enveloppe déjà existante pour ce code et cette année' });
    throw e;
  }
});

// PUT /enveloppes/:id — modifier une enveloppe
r.put('/enveloppes/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { label, periodes_b, usage_historique, notes } = req.body;
  const result = db.prepare(`
    UPDATE enveloppe_externe SET
      label = COALESCE(@label, label),
      periodes_b = COALESCE(@periodes_b, periodes_b),
      usage_historique = @usage_historique,
      notes = @notes
    WHERE id = @id
  `).run({ id: req.params.id, label: label ?? null, periodes_b: periodes_b ?? null, usage_historique: usage_historique ?? null, notes: notes ?? null });
  if (!result.changes) return res.status(404).json({ error: 'Enveloppe introuvable' });
  res.json({ ok: true });
});

// DELETE /enveloppes/:id
r.delete('/enveloppes/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM enveloppe_externe WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /ue-pot — liste des UEs avec leur pot_code (pour configuration)
r.get('/ue-pot', authRequired, (req, res) => {
  const annee = req.query.annee || '2025-2026';
  res.json(db.prepare(`
    SELECT ue_num, ue_nom, ue_code_fwb, pot_code,
      COALESCE(pot_code,
        CASE WHEN ue_code_fwb LIKE '980302%' THEN 'QUAL'
             WHEN ue_code_fwb LIKE '980301%' THEN 'CF'
             WHEN ue_code_fwb LIKE '980303%' THEN 'INCL'
        END) AS pot_effectif
    FROM ue
    WHERE annee_scolaire = ?
      AND (pot_code IS NOT NULL
        OR ue_code_fwb LIKE '9803%'
        OR ue_nom LIKE '%Qualit%' OR ue_nom LIKE '%Conseiller%' OR ue_nom LIKE '%inclusif%' OR ue_nom LIKE '%Inclusif%')
    ORDER BY ue_nom
  `).all(annee));
});

// PATCH /ue-pot — assigner un pot_code à une UE
r.patch('/ue-pot', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { ue_num, annee_scolaire, pot_code } = req.body;
  if (!ue_num || !annee_scolaire) return res.status(400).json({ error: 'ue_num et annee_scolaire requis' });
  const result = db.prepare('UPDATE ue SET pot_code = ? WHERE ue_num = ? AND annee_scolaire = ?').run(pot_code || null, ue_num, annee_scolaire);
  if (!result.changes) return res.status(404).json({ error: 'UE introuvable' });
  res.json({ ok: true });
});

export default r;

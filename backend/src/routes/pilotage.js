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

// Usage d'une enveloppe externe pour une année civile :
// L'enveloppe correspond à l'année scolaire YYYY-1 → YYYY (ex: civile 2026 = scolaire 2025-2026)
// On prend la totalité des périodes B pondérées de cette année scolaire pour ce pot
function usageEnveloppe(anneeCivile) {
  const annee_scolaire = `${anneeCivile - 1}-${anneeCivile}`;
  return db.prepare(`
    SELECT ${POT} AS pot,
      ROUND(SUM(
        CASE WHEN u.ue_niveau='SUP' THEN a.total_attribue_professeur * 1.5
             WHEN u.ue_niveau='DS'  THEN a.total_attribue_professeur * 1.25
             ELSE a.total_attribue_professeur END
      ), 2) AS periodes_b
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.annee_scolaire = ? AND a.contrat_mdp = 'IIP'
      AND ${POT} NOT IN ('organique')
    GROUP BY pot
  `).all(annee_scolaire).reduce((acc, r) => { acc[r.pot] = r.periodes_b || 0; return acc; }, {});
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

  // Pré-calculer l'usage pondéré des enveloppes par année civile
  const usageEnvByAnnee = {};
  for (const y of toCompute) {
    usageEnvByAnnee[y] = usageEnveloppe(y);
  }

  const result = years.map(yr => {
    const y = yr.annee_civile;

    const envYear = enveloppes.filter(e => e.annee_civile === y).map(e => {
      const usage = e.usage_historique != null
        ? e.usage_historique
        : (usageEnvByAnnee[y]?.[e.code] ?? 0);
      // Enveloppe illimitée : ne déborde jamais sur l'organique
      const dot = e.illimite ? 0 : Math.max(0, Math.round((usage - e.periodes_b) * 100) / 100);
      return {
        ...e,
        usage,
        dot,  // dépassement à imputer sur l'organique (0 si illimitée)
        illimite: !!e.illimite,
        solde: e.illimite ? null : Math.round((e.periodes_b - usage) * 100) / 100,
        pct: e.illimite ? null : (e.periodes_b ? Math.round((usage / e.periodes_b) * 1000) / 10 : null),
      };
    });

    // Organique = usage direct sur UEs organiques + dépassements DOT des enveloppes
    const orgUsageDirect = yr.usage_historique_organique != null
      ? yr.usage_historique_organique
      : usagePot(usageDB, y, 'organique');
    const dotTotal = envYear.reduce((s, e) => s + (e.dot || 0), 0);
    const orgUsage = Math.round((orgUsageDirect + dotTotal) * 100) / 100;

    return {
      annee_civile: y,
      dotation_organique: yr.dotation_organique,
      usage_organique: orgUsage,
      usage_organique_direct: orgUsageDirect,
      dot_total: Math.round(dotTotal * 100) / 100,
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
  const annee   = req.query.annee    || '2025-2026';
  const section = req.query.section  || null;
  const tous    = req.query.tous === '1';

  let sql = `
    SELECT ue_num, ue_nom, section, ue_code_fwb, pot_code,
      COALESCE(pot_code,
        CASE WHEN ue_code_fwb LIKE '980302%' THEN 'QUAL'
             WHEN ue_code_fwb LIKE '980301%' THEN 'CF'
             WHEN ue_code_fwb LIKE '980303%' THEN 'INCL'
             ELSE 'organique' END) AS pot_effectif
    FROM ue WHERE annee_scolaire = ?`;
  const params = [annee];
  if (section) { sql += ' AND section = ?'; params.push(section); }
  if (!tous) sql += ` AND (pot_code IS NOT NULL OR ue_code_fwb LIKE '9803%'
      OR ue_nom LIKE '%Qualit%' OR ue_nom LIKE '%Conseiller%'
      OR ue_nom LIKE '%inclusif%' OR ue_nom LIKE '%Inclusif%')`;
  sql += ' ORDER BY section, ue_nom';
  res.json(db.prepare(sql).all(...params));
});
// PATCH /ue-pot — assigner un pot_code à une UE
r.patch('/ue-pot', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { ue_num, annee_scolaire, pot_code } = req.body;
  if (!ue_num || !annee_scolaire) return res.status(400).json({ error: 'ue_num et annee_scolaire requis' });
  const result = db.prepare('UPDATE ue SET pot_code = ? WHERE ue_num = ? AND annee_scolaire = ?').run(pot_code || null, ue_num, annee_scolaire);
  if (!result.changes) return res.status(404).json({ error: 'UE introuvable' });
  res.json({ ok: true });
});

// GET /pilotage/efficience?annee= — encadrement par section et UE
// Deux ratios (élevé = performant) : étudiants/période payée, et étudiants/ETP.
// Agrégation : Σ(étudiants) ÷ Σ(périodes) et Σ(étudiants) ÷ Σ(ETP) à chaque maille.
r.get('/efficience', authRequired, (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  // IIP : périodes + ETP (CT/800 + PP/1000) par section/UE
  const lignesIIP = db.prepare(`
    SELECT v.section, v.ue_num,
      u.ue_nom, u.nb_etudiants,
      SUM(v.total_attribue_professeur) AS periodes,
      (SUM(CASE WHEN v.type_cours='CT' THEN v.total_attribue_professeur ELSE 0 END)/800.0
       + SUM(CASE WHEN v.type_cours='PP' THEN v.total_attribue_professeur ELSE 0 END)/1000.0) AS etp
    FROM v_attribution_complete v
    LEFT JOIN ue u ON u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire
    WHERE v.annee_scolaire = ? AND COALESCE(v.contrat_mdp,'IIP')='IIP'
    GROUP BY v.section, v.ue_num, u.ue_nom, u.nb_etudiants
    ORDER BY v.section, v.ue_num
  `).all(annee);

  // HELB : ETP par statut (MA/PI: TH 480, TP 750 ; MFP: 750 ; COORD: 1400)
  // diviseur appliqué par ligne selon le statut HELB du prof et la nature TH/TP.
  const lignesHELB = db.prepare(`
    SELECT v.section, v.ue_num,
      v.charge_en_heures AS heures,
      COALESCE(p.statut_helb,'') AS statut,
      COALESCE(v.helb_nature,'CT') AS nature
    FROM v_attribution_complete v
    LEFT JOIN professeur p ON p.id = v.professeur_id
    WHERE v.annee_scolaire = ? AND v.contrat_mdp='HELB'
  `).all(annee);

  // Diviseur HELB
  const divHelb = (statut, nature) => {
    if (statut === 'COORD') return 1400;
    if (statut === 'MFP') return 750;
    return nature === 'TP' ? 750 : 480; // MA, PI, ou défaut
  };
  // ETP HELB agrégé par section + par UE
  const helbSec = {}, helbUE = {};
  for (const l of lignesHELB) {
    const e = (l.heures || 0) / divHelb(l.statut, l.nature);
    helbSec[l.section] = (helbSec[l.section] || 0) + e;
    const k = `${l.section}|${l.ue_num}`;
    helbUE[k] = (helbUE[k] || 0) + e;
  }

  const r1 = x => Math.round(x * 10) / 10;
  const r2 = x => Math.round(x * 100) / 100;

  const sections = {};
  for (const l of lignesIIP) {
    if ((l.periodes || 0) <= 0 && !(helbUE[`${l.section}|${l.ue_num}`])) continue;
    const s = (sections[l.section] ||= { section: l.section, etp: 0, periodes: 0, etudiants: 0, ues_sans_effectif: 0, ues: [] });
    const etpHelbUE = helbUE[`${l.section}|${l.ue_num}`] || 0;
    const etpUE = (l.etp || 0) + etpHelbUE;
    s.etp += etpUE;
    s.periodes += l.periodes || 0;
    if (l.nb_etudiants != null) s.etudiants += l.nb_etudiants; else if (l.periodes > 0) s.ues_sans_effectif++;
    s.ues.push({
      ue_num: l.ue_num, ue_nom: l.ue_nom, nb_etudiants: l.nb_etudiants,
      periodes: r1(l.periodes || 0),
      etp: Math.round(etpUE * 10000) / 10000,
      etud_par_periode: (l.nb_etudiants != null && l.periodes > 0) ? r2(l.nb_etudiants / l.periodes) : null,
      etud_par_etp: (l.nb_etudiants != null && etpUE > 0) ? r1(l.nb_etudiants / etpUE) : null,
    });
  }
  // Ajouter l'ETP HELB des sections qui n'ont pas de ligne IIP correspondante
  for (const sec of Object.keys(helbSec)) {
    if (!sections[sec]) sections[sec] = { section: sec, etp: helbSec[sec], periodes: 0, etudiants: 0, ues_sans_effectif: 0, ues: [] };
  }

  const out = Object.values(sections).map(s => ({
    section: s.section,
    etp: Math.round(s.etp * 10000) / 10000,
    periodes: r1(s.periodes),
    etudiants: s.etudiants,
    etud_par_periode: s.periodes > 0 ? r2(s.etudiants / s.periodes) : null,
    etud_par_etp: s.etp > 0 ? r1(s.etudiants / s.etp) : null,
    ues_sans_effectif: s.ues_sans_effectif,
    ues: s.ues,
  }));

  const tEtp = out.reduce((a, s) => a + s.etp, 0);
  const tPer = out.reduce((a, s) => a + s.periodes, 0);
  const tEtu = out.reduce((a, s) => a + s.etudiants, 0);
  res.json({
    annee, sections: out,
    total: {
      etp: Math.round(tEtp * 10000) / 10000,
      periodes: r1(tPer),
      etudiants: tEtu,
      etud_par_periode: tPer > 0 ? r2(tEtu / tPer) : null,
      etud_par_etp: tEtp > 0 ? r1(tEtu / tEtp) : null,
    },
  });
});

// GET /etp?annee= — Répartition ETP par section et UE (IIP et HELB), tout en CT/800 + PP/1000 sur les périodes
r.get('/etp', authRequired, (req, res) => {
  const { annee } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  // IIP : périodes CT et PP par section/UE (autonomie incluse dans total_attribue_professeur)
  const lignesIIP = db.prepare(`
    SELECT v.section, v.ue_num, u.ue_nom,
      SUM(CASE WHEN v.type_cours='CT' THEN v.total_attribue_professeur ELSE 0 END) AS per_ct,
      SUM(CASE WHEN v.type_cours='PP' THEN v.total_attribue_professeur ELSE 0 END) AS per_pp,
      SUM(CASE WHEN v.type_cours NOT IN ('CT','PP') THEN v.total_attribue_professeur ELSE 0 END) AS per_autre
    FROM v_attribution_complete v
    LEFT JOIN ue u ON u.ue_num = v.ue_num AND u.annee_scolaire = v.annee_scolaire
    WHERE v.annee_scolaire = ? AND COALESCE(v.contrat_mdp,'IIP')='IIP'
    GROUP BY v.section, v.ue_num, u.ue_nom
    ORDER BY v.section, v.ue_num
  `).all(annee);

  // HELB : MÊME logique que IIP — périodes CT/800 + PP/1000 (tout est déjà en périodes).
  // Le TH/TP (480/750) n'est qu'un affichage de saisie, pas une base de calcul ETP.
  const lignesHELB = db.prepare(`
    SELECT v.section, v.ue_num,
      SUM(CASE WHEN v.type_cours='CT' THEN v.total_attribue_professeur ELSE 0 END) AS per_ct,
      SUM(CASE WHEN v.type_cours='PP' THEN v.total_attribue_professeur ELSE 0 END) AS per_pp,
      SUM(CASE WHEN v.type_cours NOT IN ('CT','PP') THEN v.total_attribue_professeur ELSE 0 END) AS per_autre
    FROM v_attribution_complete v
    WHERE v.annee_scolaire = ? AND v.contrat_mdp='HELB'
    GROUP BY v.section, v.ue_num
  `).all(annee);
  const helbUE = {};
  for (const l of lignesHELB) {
    const e = (l.per_ct || 0) / 800 + (l.per_pp || 0) / 1000 + (l.per_autre || 0) / 800;
    helbUE[`${l.section}|${l.ue_num}`] = e;
  }

  const r4 = x => Math.round(x * 10000) / 10000;
  const sections = {};
  for (const l of lignesIIP) {
    const etpCt = (l.per_ct || 0) / 800;
    const etpPp = (l.per_pp || 0) / 1000;
    const etpAutre = (l.per_autre || 0) / 800; // fallback CT pour types inconnus
    const etpIip = etpCt + etpPp + etpAutre;
    const etpHelb = helbUE[`${l.section}|${l.ue_num}`] || 0;
    if (etpIip <= 0 && etpHelb <= 0) continue;
    const s = (sections[l.section] ||= { section: l.section, etp_iip: 0, etp_helb: 0, etp_ct: 0, etp_pp: 0, ues: [] });
    s.etp_iip += etpIip; s.etp_helb += etpHelb; s.etp_ct += etpCt + etpAutre; s.etp_pp += etpPp;
    s.ues.push({
      ue_num: l.ue_num, ue_nom: l.ue_nom,
      etp_ct: r4(etpCt + etpAutre), etp_pp: r4(etpPp),
      etp_iip: r4(etpIip), etp_helb: r4(etpHelb), etp_total: r4(etpIip + etpHelb),
    });
  }
  // Sections HELB sans ligne IIP
  for (const k of Object.keys(helbUE)) {
    const [sec, ueNum] = k.split('|');
    if (sections[sec] && sections[sec].ues.some(u => String(u.ue_num) === ueNum)) continue;
    const e = helbUE[k];
    if (e <= 0) continue;
    const s = (sections[sec] ||= { section: sec, etp_iip: 0, etp_helb: 0, etp_ct: 0, etp_pp: 0, ues: [] });
    s.etp_helb += e;
    s.ues.push({ ue_num: Number(ueNum), ue_nom: null, etp_ct: 0, etp_pp: 0, etp_iip: 0, etp_helb: r4(e), etp_total: r4(e) });
  }

  const out = Object.values(sections)
    .map(s => ({
      section: s.section,
      etp_ct: r4(s.etp_ct), etp_pp: r4(s.etp_pp),
      etp_iip: r4(s.etp_iip), etp_helb: r4(s.etp_helb), etp_total: r4(s.etp_iip + s.etp_helb),
      ues: s.ues.sort((a, b) => String(a.ue_num).localeCompare(String(b.ue_num), 'fr', { numeric: true })),
    }))
    .sort((a, b) => a.section.localeCompare(b.section, 'fr'));

  const total = out.reduce((a, s) => ({
    etp_ct: a.etp_ct + s.etp_ct, etp_pp: a.etp_pp + s.etp_pp,
    etp_iip: a.etp_iip + s.etp_iip, etp_helb: a.etp_helb + s.etp_helb, etp_total: a.etp_total + s.etp_total,
  }), { etp_ct: 0, etp_pp: 0, etp_iip: 0, etp_helb: 0, etp_total: 0 });
  for (const k of Object.keys(total)) total[k] = r4(total[k]);

  res.json({ annee, sections: out, total });
});

export default r;

// GET /dotation-ue?section=&annee=&mode=scolaire|civile
// Tableau de détail du coût en dotation par UE
r.get('/dotation-ue', authRequired, (req, res) => {
  const { section, annee, mode = 'scolaire' } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requis' });

  let anneeQ1, anneeQ2;
  if (mode === 'civile') {
    const y = parseInt(annee);
    anneeQ2 = `${y - 1}-${y}`;   // Jan-Jun : Q2 année scolaire précédente
    anneeQ1 = `${y}-${y + 1}`;   // Sep-Déc : Q1 année scolaire suivante
  } else {
    anneeQ1 = annee;
    anneeQ2 = annee;
  }

  // Toutes les UE de la section (référentiel)
  const ues = db.prepare(`
    SELECT u.ue_num, u.ue_nom, u.ue_niv, u.ue_niveau, u.ue_quad, u.pot_code,
      COALESCE(u.pot_code,
        CASE WHEN u.ue_code_fwb LIKE '980302%' THEN 'QUAL'
             WHEN u.ue_code_fwb LIKE '980301%' THEN 'CF'
             WHEN u.ue_code_fwb LIKE '980303%' THEN 'INCL'
             ELSE 'organique' END) AS pot
    FROM ue u
    WHERE u.section = ? AND u.annee_scolaire = ?
    ORDER BY u.ue_num
  `).all(section, mode === 'civile' ? anneeQ1 : annee);

  // Coûts Q1 par UE
  const costsQ1 = db.prepare(`
    SELECT a.ue_num,
      ROUND(SUM(${CQ1}), 2) AS cout_q1
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.section = ? AND a.annee_scolaire = ? AND a.contrat_mdp = 'IIP'
    GROUP BY a.ue_num
  `).all(section, anneeQ1).reduce((m, r) => { m[r.ue_num] = r.cout_q1; return m; }, {});

  // Coûts Q2 par UE
  const costsQ2 = db.prepare(`
    SELECT a.ue_num,
      ROUND(SUM(${CQ2}), 2) AS cout_q2
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.section = ? AND a.annee_scolaire = ? AND a.contrat_mdp = 'IIP'
    GROUP BY a.ue_num
  `).all(section, anneeQ2).reduce((m, r) => { m[r.ue_num] = r.cout_q2; return m; }, {});

  const lignes = ues.map(u => {
    const q1 = costsQ1[u.ue_num] || 0;
    const q2 = costsQ2[u.ue_num] || 0;
    return { ...u, cout_q1: q1, cout_q2: q2, cout_total: Math.round((q1 + q2) * 100) / 100 };
  });

  const total_q1 = Math.round(lignes.reduce((s, l) => s + l.cout_q1, 0) * 100) / 100;
  const total_q2 = Math.round(lignes.reduce((s, l) => s + l.cout_q2, 0) * 100) / 100;
  const total    = Math.round((total_q1 + total_q2) * 100) / 100;

  res.json({ section, annee, mode, lignes, total_q1, total_q2, total });
});

// GET /dotation-comparaison?annee1=2025-2026&annee2=2026-2027
// Tableau comparatif toutes sections × UE pour deux années scolaires
r.get('/dotation-comparaison', authRequired, (req, res) => {
  const { annee1, annee2 } = req.query;
  if (!annee1 || !annee2) return res.status(400).json({ error: 'annee1 et annee2 requis' });

  const potFilter = req.query.pot || null;
  const isHelb = potFilter === 'HELB';
  const isTout = potFilter === 'TOUT';
  const pondere = req.query.pondere !== '0'; // true par défaut, false = brut
  const mode = req.query.mode === 'civil' ? 'civil' : 'scolaire';

  // Coûts bruts Q1/Q2 (sans pondération) — total_attribue_professeur = périodes + autonomie
  const RQ1 = `CASE WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad) IN ('Q1','Q1/Q2')
    THEN a.total_attribue_professeur * CASE WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1/Q2' THEN 0.4 ELSE 1 END
    ELSE 0 END`;
  const RQ2 = `CASE WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad) IN ('Q2','Q1/Q2')
    THEN a.total_attribue_professeur * CASE WHEN COALESCE(a.quadrimestre_attribue, u.ue_quad)='Q1/Q2' THEN 0.6 ELSE 1 END
    ELSE 0 END`;

  function getCoutsAnnee(annee) {
    if (isTout) {
      const q1iip = pondere ? CQ1 : RQ1;
      const q2iip = pondere ? CQ2 : RQ2;
      const sql = `
        SELECT a.section, a.ue_num,
          ROUND(SUM(CASE WHEN a.contrat_mdp='IIP' THEN (${q1iip}) ELSE (${RQ1}) END), 2) AS q1,
          ROUND(SUM(CASE WHEN a.contrat_mdp='IIP' THEN (${q2iip}) ELSE (${RQ2}) END), 2) AS q2
        FROM attribution a
        LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
        WHERE a.annee_scolaire = ?
        GROUP BY a.section, a.ue_num`;
      return db.prepare(sql).all(annee).reduce((m, r) => {
        if (!m[r.section]) m[r.section] = {};
        m[r.section][r.ue_num] = { q1: r.q1 || 0, q2: r.q2 || 0 };
        return m;
      }, {});
    }

    const q1expr = pondere && !isHelb ? CQ1 : RQ1;
    const q2expr = pondere && !isHelb ? CQ2 : RQ2;
    let sql = `
      SELECT a.section, a.ue_num,
        ROUND(SUM(${q1expr}), 2) AS q1,
        ROUND(SUM(${q2expr}), 2) AS q2
      FROM attribution a
      LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
      WHERE a.annee_scolaire = ? AND a.contrat_mdp = ?`;
    const params = [annee, isHelb ? 'HELB' : 'IIP'];
    if (!isHelb && potFilter) {
      sql += ` AND ${POT} = ?`;
      params.push(potFilter);
    }
    sql += ` GROUP BY a.section, a.ue_num`;
    return db.prepare(sql).all(...params).reduce((m, r) => {
      if (!m[r.section]) m[r.section] = {};
      m[r.section][r.ue_num] = { q1: r.q1 || 0, q2: r.q2 || 0 };
      return m;
    }, {});
  }

  // En mode civil : année civile Y = Q2 de (Y-1)-(Y) + Q1 de (Y)-(Y+1)
  function getCouts(annee) {
    if (mode === 'scolaire') return getCoutsAnnee(annee);
    // annee est ici une année civile (ex: "2026")
    const y = parseInt(annee);
    const scoPrec = `${y-1}-${y}`;     // fournit le Q2
    const scoSuiv = `${y}-${y+1}`;     // fournit le Q1
    const cPrec = getCoutsAnnee(scoPrec);
    const cSuiv = getCoutsAnnee(scoSuiv);
    const merged = {};
    // Q2 vient de l'année scolaire précédente
    for (const [sec, ues] of Object.entries(cPrec)) {
      for (const [ue, v] of Object.entries(ues)) {
        merged[sec] ??= {};
        merged[sec][ue] = { q1: 0, q2: v.q2 || 0 };
      }
    }
    // Q1 vient de l'année scolaire suivante
    for (const [sec, ues] of Object.entries(cSuiv)) {
      for (const [ue, v] of Object.entries(ues)) {
        merged[sec] ??= {};
        merged[sec][ue] ??= { q1: 0, q2: 0 };
        merged[sec][ue].q1 = v.q1 || 0;
      }
    }
    return merged;
  }

  const couts1 = getCouts(annee1);
  const couts2 = getCouts(annee2);

  // Années scolaires effectives pour récupérer les métadonnées des UE
  // En civil : pour annéeY on regarde (Y-1)-(Y) et (Y)-(Y+1) → on prend la plus récente
  const scoFor = (a) => mode === 'civil' ? `${parseInt(a)}-${parseInt(a)+1}` : a;
  const sco1 = scoFor(annee1);
  const sco2 = scoFor(annee2);

  // Toutes les UE des deux années — une seule ligne par (section, ue_num)
  // Priorité à annee2 pour les métadonnées, fallback sur annee1.
  // On part des ATTRIBUTIONS réelles (source de vérité : quelle section utilise quelle UE,
  // y compris les UE partagées comme l'UE 95 utilisée par SAR mais déclarée sous RESTART),
  // et on récupère les métadonnées de l'UE par jointure sur ue_num+année SANS critère de section.
  const ues = db.prepare(`
    SELECT a.section, a.ue_num,
      COALESCE(MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_nom END),
               MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_nom END)) AS ue_nom,
      COALESCE(MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_niv END),
               MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_niv END)) AS ue_niv,
      COALESCE(MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_niveau END),
               MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_niveau END)) AS ue_niveau,
      COALESCE(MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_quad END),
               MAX(CASE WHEN u.annee_scolaire = ? THEN u.ue_quad END)) AS ue_quad,
      MAX(COALESCE(u.pot_code,
        CASE WHEN u.ue_code_fwb LIKE '980302%' THEN 'QUAL'
             WHEN u.ue_code_fwb LIKE '980301%' THEN 'CF'
             WHEN u.ue_code_fwb LIKE '980303%' THEN 'INCL'
             ELSE 'organique' END)) AS pot
    FROM attribution a
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.annee_scolaire IN (?, ?)
    GROUP BY a.section, a.ue_num
    ORDER BY a.section, a.ue_num
  `).all(sco2, sco1, sco2, sco1, sco2, sco1, sco2, sco1, sco1, sco2);

  // Grouper par section
  const sections = {};
  for (const u of ues) {
    if (!sections[u.section]) sections[u.section] = { section: u.section, ues: [], tot1: {q1:0,q2:0}, tot2: {q1:0,q2:0} };
    const c1 = couts1[u.section]?.[u.ue_num] || { q1: 0, q2: 0 };
    const c2 = couts2[u.section]?.[u.ue_num] || { q1: 0, q2: 0 };
    const t1 = Math.round((c1.q1 + c1.q2) * 100) / 100;
    const t2 = Math.round((c2.q1 + c2.q2) * 100) / 100;
    sections[u.section].ues.push({ ...u, c1, c2, t1, t2, delta: Math.round((t2 - t1) * 100) / 100 });
    sections[u.section].tot1.q1 = Math.round((sections[u.section].tot1.q1 + c1.q1) * 100) / 100;
    sections[u.section].tot1.q2 = Math.round((sections[u.section].tot1.q2 + c1.q2) * 100) / 100;
    sections[u.section].tot2.q1 = Math.round((sections[u.section].tot2.q1 + c2.q1) * 100) / 100;
    sections[u.section].tot2.q2 = Math.round((sections[u.section].tot2.q2 + c2.q2) * 100) / 100;
  }

  const result = Object.values(sections).map(s => {
    const tot1 = Math.round((s.tot1.q1 + s.tot1.q2) * 100) / 100;
    const tot2 = Math.round((s.tot2.q1 + s.tot2.q2) * 100) / 100;
    return { ...s, tot1_total: tot1, tot2_total: tot2, delta: Math.round((tot2 - tot1) * 100) / 100 };
  }).sort((a, b) => a.section.localeCompare(b.section));

  res.json({ annee1, annee2, sections: result });
});

// ── Badges EXT / DOT par pot_code ────────────────────────────────────────────
// GET /ext-dot?annee=2026-2027
// Retourne pour chaque pot_code cofinancé :
//   - plafond EXT (pér. B depuis enveloppe_externe)
//   - total pér. B attribué
//   - part EXT (dans le plafond) et part DOT (au-delà)
//   - liste des attributions avec leur badge EXT ou DOT
r.get('/ext-dot', authRequired, (req, res) => {
  const annee = req.query.annee || db.prepare("SELECT code FROM annee_scolaire WHERE active=1 LIMIT 1").get()?.code || '2026-2027';
  const anneeCivile = 2000 + parseInt(annee.split('-')[1]?.slice(-2) || '27');

  const POTS_EXT = ['QUAL', 'CF', 'INCL', 'AESI'];

  // Plafonds EXT par pot_code — fallback sur l'année civile précédente si absente
  // Enveloppe « illimitée » (ex. AeSI) → tout reste EXT (jamais DOT)
  const plafonds = {};
  const illimite = {};
  for (const pot of POTS_EXT) {
    const env = db.prepare("SELECT periodes_b, illimite FROM enveloppe_externe WHERE code=? AND annee_civile=?").get(pot, anneeCivile)
              || db.prepare("SELECT periodes_b, illimite FROM enveloppe_externe WHERE code=? AND annee_civile=?").get(pot, anneeCivile - 1);
    if (env?.illimite) { illimite[pot] = true; plafonds[pot] = Infinity; }
    else plafonds[pot] = env?.periodes_b ?? 0;
  }

  // Toutes les attributions sur des UEs à enveloppe externe
  const attrs = db.prepare(`
    SELECT a.id, a.ue_num, a.section, a.code_cours, a.professeur_id,
           p.nom || ' ' || p.prenom AS prof_nom,
           a.periodes_attribuees, a.autonomie_attribuee,
           a.type_cours, a.num_groupe, a.code AS groupe_code,
           u.pot_code, u.ue_niveau,
           ROUND(
             (a.periodes_attribuees + a.autonomie_attribuee) *
             CASE WHEN u.ue_niveau='SUP' THEN 1.5
                  WHEN u.ue_niveau='DS'  THEN 1.25
                  ELSE 1.0 END
           , 2) AS cout_b
    FROM attribution a
    JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    LEFT JOIN professeur p ON p.id = a.professeur_id
    WHERE a.annee_scolaire = ?
      AND u.pot_code IN (${POTS_EXT.map(()=>'?').join(',')})
      AND (a.type_cours IS NULL OR a.type_cours != 'Z')
      AND (a.coordination_encadrement IS NULL OR a.coordination_encadrement NOT IN ('95','96','97','98','99'))
    ORDER BY u.pot_code, a.ue_num, a.id
  `).all(annee, ...POTS_EXT);

  // Répartir EXT/DOT par pot_code en consommant le plafond séquentiellement
  const consomme = {};
  const result = [];
  for (const a of attrs) {
    const pot = a.pot_code;
    if (!consomme[pot]) consomme[pot] = 0;
    const plafond = plafonds[pot] || 0;
    const cout = a.cout_b || 0;
    const restePlafond = Math.max(0, plafond - consomme[pot]);

    let badge, ext_b, dot_b;
    if (cout <= restePlafond) {
      badge = 'EXT'; ext_b = cout; dot_b = 0;
    } else if (consomme[pot] >= plafond) {
      badge = 'DOT'; ext_b = 0; dot_b = cout;
    } else {
      // Ligne mixte : partiellement EXT, partiellement DOT
      ext_b = restePlafond; dot_b = cout - restePlafond;
      badge = 'EXT+DOT';
    }
    consomme[pot] += cout;
    result.push({ ...a, badge, ext_b: Math.round(ext_b*100)/100, dot_b: Math.round(dot_b*100)/100 });
  }

  // Résumé par pot_code
  const resume = {};
  for (const pot of POTS_EXT) {
    const ill = illimite[pot];
    resume[pot] = {
      plafond: ill ? null : plafonds[pot],
      illimite: !!ill,
      consomme: Math.round((consomme[pot]||0)*100)/100,
      dot: ill ? 0 : Math.round(Math.max(0, (consomme[pot]||0) - plafonds[pot])*100)/100,
    };
  }

  const plafondsOut = {};
  for (const pot of POTS_EXT) plafondsOut[pot] = illimite[pot] ? null : plafonds[pot];

  res.json({ annee, anneeCivile, plafonds: plafondsOut, resume, attrs: result });
});

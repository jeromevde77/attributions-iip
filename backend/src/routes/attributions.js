import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { saveSnapshot } from '../helpers/snapshot.js';

const r = Router();

// Liste avec filtres : ?section=...&prof_id=...&contrat=...&ue=...&q=...
r.get('/', authRequired, (req, res) => {
  const { section, prof_id, contrat, ue, ue_num, q, type_cours, annee } = req.query;
  const where = [];
  const params = {};
  const anneeVal = annee || '2025-2026';
  where.push('a.annee_scolaire = @annee'); params.annee = anneeVal;
  if (section)   { where.push('section = @section');         params.section = section; }
  if (prof_id)   { where.push('professeur_id = @prof_id');   params.prof_id = prof_id; }
  if (contrat)   { where.push('contrat_mdp = @contrat');     params.contrat = contrat; }
  if (ue || ue_num) { where.push('ue_num = @ue');            params.ue = ue || ue_num; }
  if (type_cours){ where.push('type_cours = @type_cours');   params.type_cours = type_cours; }
  if (q) {
    where.push('(ue_nom LIKE @q OR nom_cours LIKE @q OR professeur LIKE @q)');
    params.q = `%${q}%`;
  }
  const sql = `
    SELECT a.*,
           COALESCE(co.conforme, 1) AS cours_conforme,
           co.total_attribue       AS cours_total_attribue,
           co.cours_per            AS cours_per,
           co.multiple_attendu     AS cours_multiple_attendu
    FROM v_attribution_complete a
    LEFT JOIN v_cours_conformite co
      ON co.section = a.section AND co.code_cours = a.code_cours
     AND co.annee_scolaire = a.annee_scolaire
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.section, a.bloc, a.ue_num, a.code_cours
    LIMIT 1000
  `;
  res.json(db.prepare(sql).all(params));
});

// Conformité par cours (utile pour récap rapide)
r.get('/conformite', authRequired, (req, res) => {
  const { section, only_non_conforme, annee } = req.query;
  const where = ['annee_scolaire = @annee'];
  const params = { annee: annee || '2025-2026' };
  if (section) { where.push('section = @section'); params.section = section; }
  if (only_non_conforme === '1') where.push('conforme = 0');
  res.json(db.prepare(`
    SELECT * FROM v_cours_conformite
    WHERE ${where.join(' AND ')}
    ORDER BY conforme ASC, section, code_cours
  `).all(params));
});

// Toutes les attributions d'un cours (un cours = section + code_cours)
// Utilisé par la modale d'édition multi-lignes
r.get('/by-cours', authRequired, (req, res) => {
  const { section, code_cours, annee } = req.query;
  if (!section || !code_cours) {
    return res.status(400).json({ error: 'section et code_cours requis' });
  }
  const anneeVal = annee || '2025-2026';
  const rows = db.prepare(`
    SELECT * FROM v_attribution_complete
    WHERE section = ? AND code_cours = ? AND annee_scolaire = ?
    ORDER BY code, activite_id
  `).all(section, code_cours, anneeVal);

  // Récupérer le cours_per et calculer la conformité (pour cette année)
  const conf = db.prepare(`
    SELECT * FROM v_cours_conformite WHERE section = ? AND code_cours = ? AND annee_scolaire = ?
  `).get(section, code_cours, anneeVal);

  res.json({
    attributions: rows,
    conformite: conf || null
  });
});

// Détail
r.get('/:id', authRequired, (req, res) => {
  const row = db.prepare('SELECT * FROM v_attribution_complete WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Attribution introuvable' });
  res.json(row);
});

// Création
r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const a = req.body || {};
  const stmt = db.prepare(`
    INSERT INTO attribution
      (section, etablissement_referent, contrat_mdp, organisation,
       ue_num, num_organisation, quadrimestre_attribue,
       code_cours, type_cours, type_cours_helb, code, nb_groupes,
       split_groupe, num_split, num_groupe, activite_id,
       professeur_id, cours_ept_ad, coordination_encadrement,
       modification_attribution, commentaire, commentaire_2,
       per_etudiant_total_dp, periodes_attribuees, autonomie_attribuee,
       annee_scolaire, created_by, updated_by)
    VALUES (@section, @etablissement_referent, @contrat_mdp, @organisation,
            @ue_num, @num_organisation, @quadrimestre_attribue,
            @code_cours, @type_cours, @type_cours_helb, @code, @nb_groupes,
            @split_groupe, @num_split, @num_groupe, @activite_id,
            @professeur_id, @cours_ept_ad, @coordination_encadrement,
            @modification_attribution, @commentaire, @commentaire_2,
            @per_etudiant_total_dp, @periodes_attribuees, @autonomie_attribuee,
            @annee_scolaire, @uid, @uid)
  `);
  const result = stmt.run({
    section: a.section ?? null,
    etablissement_referent: a.etablissement_referent ?? null,
    contrat_mdp: a.contrat_mdp ?? null,
    organisation: a.organisation ?? null,
    ue_num: a.ue_num,
    num_organisation: a.num_organisation ?? 1,
    quadrimestre_attribue: a.quadrimestre_attribue ?? null,
    code_cours: a.code_cours ?? null,
    type_cours: a.type_cours ?? null,
    type_cours_helb: a.type_cours_helb ?? null,
    code: a.code ?? null,
    nb_groupes: a.nb_groupes ?? 1,
    split_groupe: a.split_groupe ?? 'N',
    num_split: a.num_split ?? null,
    num_groupe: a.num_groupe ?? null,
    activite_id: a.activite_id ?? null,
    professeur_id: a.professeur_id ?? null,
    cours_ept_ad: a.cours_ept_ad ?? null,
    coordination_encadrement: a.coordination_encadrement ?? null,
    modification_attribution: a.modification_attribution ?? null,
    commentaire: a.commentaire ?? null,
    commentaire_2: a.commentaire_2 ?? null,
    per_etudiant_total_dp: a.per_etudiant_total_dp ?? null,
    periodes_attribuees: a.periodes_attribuees ?? 0,
    autonomie_attribuee: a.autonomie_attribuee ?? 0,
    annee_scolaire: a.annee_scolaire ?? '2025-2026',
    uid: req.user.id
  });
  db.prepare(`INSERT INTO modification_log (attribution_id, utilisateur_id, action) VALUES (?,?,?)`).run(
    result.lastInsertRowid, req.user.id, 'create'
  );
  saveSnapshot(result.lastInsertRowid, 'create', req.user);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Update (PATCH partiel)
r.patch('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const allowed = [
    'section','etablissement_referent','contrat_mdp','organisation','ue_num',
    'num_organisation','quadrimestre_attribue','code_cours','type_cours',
    'type_cours_helb','code','nb_groupes','split_groupe','num_split','num_groupe',
    'activite_id',
    'professeur_id','cours_ept_ad','coordination_encadrement',
    'modification_attribution','commentaire','commentaire_2',
    'per_etudiant_total_dp','periodes_attribuees','autonomie_attribuee'
  ];
  const updates = [];
  const params = { id: req.params.id, uid: req.user.id };
  for (const k of allowed) {
    if (k in req.body) {
      updates.push(`${k} = @${k}`);
      params[k] = req.body[k];
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  updates.push('updated_by = @uid');

  // Snapshot AVANT modification
  saveSnapshot(Number(req.params.id), 'update', req.user);

  const result = db.prepare(`UPDATE attribution SET ${updates.join(', ')} WHERE id = @id`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Attribution introuvable' });

  db.prepare(`INSERT INTO modification_log (attribution_id, utilisateur_id, action) VALUES (?,?,?)`).run(
    req.params.id, req.user.id, 'update'
  );
  res.json({ ok: true });
});

// Modifier le statut d'un professeur depuis la grille d'attributions
r.patch('/professeur/:id/statut', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { statut } = req.body || {};
  if (!['CC', 'EXP', null, ''].includes(statut)) {
    return res.status(400).json({ error: 'Statut doit être CC, EXP ou vide' });
  }
  const result = db.prepare('UPDATE professeur SET statut = ? WHERE id = ?').run(statut || null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Professeur introuvable' });
  res.json({ ok: true });
});

// Suppression
r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  // Snapshot AVANT suppression
  saveSnapshot(Number(req.params.id), 'delete', req.user);
  db.prepare('DELETE FROM planning_hebdo WHERE attribution_id = ?').run(req.params.id);
  const result = db.prepare('DELETE FROM attribution WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Attribution introuvable' });
  res.json({ ok: true });
});

// =========================================================
// SUPPRESSION EN MASSE — admin only
// =========================================================

// Suppression par liste d'IDs (cases à cocher dans l'UI)
r.post('/bulk-delete', authRequired, roleRequired('admin'), (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Liste d\'IDs requise' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM planning_hebdo WHERE attribution_id IN (${placeholders})`).run(...ids);
    const result = db.prepare(`DELETE FROM attribution WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const deleted = tx();
  res.json({ deleted });
});

// Compter ce qui serait supprimé selon les filtres (pour l'aperçu)
r.post('/bulk-delete-preview', authRequired, roleRequired('admin'), (req, res) => {
  const { section, professeur_id, contrat } = req.body || {};
  const where = [];
  const params = [];
  if (section)       { where.push('section = ?');        params.push(section); }
  if (professeur_id) { where.push('professeur_id = ?');  params.push(Number(professeur_id)); }
  if (contrat)       { where.push('contrat_mdp = ?');    params.push(contrat); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const row = db.prepare(`SELECT COUNT(*) AS n FROM attribution ${whereClause}`).get(...params);
  res.json({ count: row.n });
});

// Suppression par filtres (= filtres actifs de la grille, ou aucun = TOUT)
r.post('/bulk-delete-filtered', authRequired, roleRequired('admin'), (req, res) => {
  const { confirm, section, professeur_id, contrat } = req.body || {};
  if (confirm !== 'OUI-SUPPRIMER') {
    return res.status(400).json({ error: 'Confirmation requise (confirm = "OUI-SUPPRIMER")' });
  }
  const where = [];
  const params = [];
  if (section)       { where.push('section = ?');        params.push(section); }
  if (professeur_id) { where.push('professeur_id = ?');  params.push(Number(professeur_id)); }
  if (contrat)       { where.push('contrat_mdp = ?');    params.push(contrat); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const tx = db.transaction(() => {
    const ids = db.prepare(`SELECT id FROM attribution ${whereClause}`).all(...params).map(r => r.id);
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM planning_hebdo WHERE attribution_id IN (${placeholders})`).run(...ids);
    const result = db.prepare(`DELETE FROM attribution WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const deleted = tx();
  res.json({ deleted });
});

/**
 * Création en masse d'attributions à partir d'une sélection d'UE d'une section.
 * Pour chaque cours des UE sélectionnées :
 *   - si aucune attribution n'existe (section + code_cours), créer une attribution
 *     squelette avec les infos issues de BD_UE_COURS (type_cours, quadrimestre)
 *   - sinon, sauter (idempotent)
 *
 * Body : { section: "TIM", ue_nums: [250, 251, ...] }
 */
r.post('/bulk-create-from-section', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { section, ue_nums } = req.body || {};
  if (!section || !Array.isArray(ue_nums) || ue_nums.length === 0) {
    return res.status(400).json({ error: 'section et ue_nums (tableau non vide) requis' });
  }

  const placeholders = ue_nums.map(() => '?').join(',');
  // Récupérer tous les cours des UE sélectionnées pour cette section
  const coursList = db.prepare(`
    SELECT cours_code, ue_num, ct_pp, quadrimestre_cours
    FROM cours
    WHERE section = ? AND ue_num IN (${placeholders})
    ORDER BY cours_code
  `).all(section, ...ue_nums);

  // Pour chaque cours, vérifier s'il a déjà une attribution dans cette section
  const checkStmt = db.prepare(
    'SELECT COUNT(*) AS n FROM attribution WHERE section = ? AND code_cours = ?'
  );
  const insertStmt = db.prepare(`
    INSERT INTO attribution
      (section, ue_num, code_cours, type_cours, quadrimestre_attribue,
       contrat_mdp, etablissement_referent, organisation,
       num_organisation, code, nb_groupes, split_groupe,
       periodes_attribuees, autonomie_attribuee, annee_scolaire)
    VALUES (?, ?, ?, ?, ?, NULL, 'IIP', 'x', 1, 'A', 1, 'N', 0, 0, '2025-2026')
  `);

  let created = 0;
  let skipped = 0;
  const tx = db.transaction(() => {
    for (const c of coursList) {
      const exists = checkStmt.get(section, c.cours_code).n;
      if (exists > 0) { skipped++; continue; }
      insertStmt.run(
        section, c.ue_num, c.cours_code,
        c.ct_pp, c.quadrimestre_cours
      );
      created++;
    }
  });
  tx();

  res.json({ created, skipped, total: coursList.length });
});

export default r;

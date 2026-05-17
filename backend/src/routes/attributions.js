import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// Liste avec filtres : ?section=...&prof_id=...&contrat=...&ue=...&q=...
r.get('/', authRequired, (req, res) => {
  const { section, prof_id, contrat, ue, q, type_cours } = req.query;
  const where = [];
  const params = {};
  if (section)   { where.push('section = @section');         params.section = section; }
  if (prof_id)   { where.push('professeur_id = @prof_id');   params.prof_id = prof_id; }
  if (contrat)   { where.push('contrat_mdp = @contrat');     params.contrat = contrat; }
  if (ue)        { where.push('ue_num = @ue');               params.ue = ue; }
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
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY a.section, a.bloc, a.ue_num, a.code_cours
    LIMIT 1000
  `;
  res.json(db.prepare(sql).all(params));
});

// Conformité par cours (utile pour récap rapide)
r.get('/conformite', authRequired, (req, res) => {
  const { section, only_non_conforme } = req.query;
  const where = [];
  const params = {};
  if (section) { where.push('section = @section'); params.section = section; }
  if (only_non_conforme === '1') where.push('conforme = 0');
  res.json(db.prepare(`
    SELECT * FROM v_cours_conformite
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY conforme ASC, section, code_cours
  `).all(params));
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
       split_groupe, num_split, num_groupe,
       professeur_id, cours_ept_ad, coordination_encadrement,
       modification_attribution, commentaire, commentaire_2,
       per_etudiant_total_dp, periodes_attribuees, autonomie_attribuee,
       annee_scolaire, created_by, updated_by)
    VALUES (@section, @etablissement_referent, @contrat_mdp, @organisation,
            @ue_num, @num_organisation, @quadrimestre_attribue,
            @code_cours, @type_cours, @type_cours_helb, @code, @nb_groupes,
            @split_groupe, @num_split, @num_groupe,
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
  res.status(201).json({ id: result.lastInsertRowid });
});

// Update (PATCH partiel)
r.patch('/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const allowed = [
    'section','etablissement_referent','contrat_mdp','organisation','ue_num',
    'num_organisation','quadrimestre_attribue','code_cours','type_cours',
    'type_cours_helb','code','nb_groupes','split_groupe','num_split','num_groupe',
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

  const result = db.prepare(`UPDATE attribution SET ${updates.join(', ')} WHERE id = @id`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Attribution introuvable' });

  db.prepare(`INSERT INTO modification_log (attribution_id, utilisateur_id, action) VALUES (?,?,?)`).run(
    req.params.id, req.user.id, 'update'
  );
  res.json({ ok: true });
});

// Suppression
r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM attribution WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Attribution introuvable' });
  res.json({ ok: true });
});

export default r;

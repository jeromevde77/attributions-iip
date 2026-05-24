import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// Liste des années disponibles
r.get('/', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM annee_scolaire ORDER BY code DESC').all());
});

// Créer une nouvelle année scolaire
r.post('/', authRequired, roleRequired('admin'), (req, res) => {
  const { code, libelle, source } = req.body;
  // source = null (vide) ou '2025-2026' (copier depuis cette année)
  if (!code || !/^\d{4}-\d{4}$/.test(code)) {
    return res.status(400).json({ error: 'Code invalide (format attendu: AAAA-AAAA)' });
  }
  const exists = db.prepare('SELECT 1 FROM annee_scolaire WHERE code = ?').get(code);
  if (exists) return res.status(409).json({ error: 'Cette année existe déjà' });

  db.transaction(() => {
    db.prepare(`INSERT INTO annee_scolaire (code, libelle, active) VALUES (?, ?, 0)`)
      .run(code, libelle || `Année ${code}`);

    if (source) {
      // Copier la structure académique (UE + cours) de l'année source
      db.prepare(`
        INSERT INTO ue (ue_num, annee_scolaire, ue_nom, ue_code_fwb, section, ue_tc, ue_det,
          ue_niv, ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau, ue_quad, et_ref, ects, ue_prerequise)
        SELECT ue_num, ?, ue_nom, ue_code_fwb, section, ue_tc, ue_det,
          ue_niv, ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau, ue_quad, et_ref, ects, ue_prerequise
        FROM ue WHERE annee_scolaire = ?
      `).run(code, source);

      db.prepare(`
        INSERT INTO cours (cours_code, annee_scolaire, cours_num, cours_nom, ct_pp, section,
          ue_num, quadrimestre_cours, cours_per, cours_total, ue_autonomie, ue_per_total, ue_niveau, enc_cours, heures)
        SELECT cours_code, ?, cours_num, cours_nom, ct_pp, section,
          ue_num, quadrimestre_cours, cours_per, cours_total, ue_autonomie, ue_per_total, ue_niveau, enc_cours, heures
        FROM cours WHERE annee_scolaire = ?
      `).run(code, source);

      // Copier les attributions de l'année source vers la nouvelle année
      const copied = db.prepare(`
        INSERT INTO attribution (
          section, ue_num, code_cours, contrat_mdp, quadrimestre_attribue,
          code, activite_id, num_organisation, type_cours, type_cours_helb, annee_scolaire,
          periodes_attribuees, autonomie_attribuee
        )
        SELECT
          section, ue_num, code_cours, contrat_mdp, quadrimestre_attribue,
          code, activite_id, num_organisation, type_cours, type_cours_helb, ?,
          periodes_attribuees, autonomie_attribuee
        FROM attribution
        WHERE annee_scolaire = ?
      `).run(code, source);
      return copied.changes;
    }
    return 0;
  })();

  const copied = source
    ? db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE annee_scolaire = ?').get(code).n
    : 0;

  res.json({ ok: true, code, copied });
});

// Supprimer une année (admin, avec confirmation)
r.delete('/:code', authRequired, roleRequired('admin'), (req, res) => {
  const { code } = req.params;
  if (code === '2025-2026') return res.status(403).json({ error: 'Impossible de supprimer l\'année de base' });
  const nb = db.prepare('DELETE FROM attribution WHERE annee_scolaire = ?').run(code).changes;
  db.prepare('DELETE FROM annee_scolaire WHERE code = ?').run(code);
  res.json({ ok: true, deleted: nb });
});

// Comparer les UE entre une année source et la cible :
// liste les UE de la source (groupées par section) avec un drapeau "déjà dans la cible"
r.get('/import-preview', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { source, cible } = req.query;
  if (!source || !cible) return res.status(400).json({ error: 'source et cible requis' });

  const ues = db.prepare('SELECT ue_num, ue_nom, section, ue_niv FROM ue WHERE annee_scolaire = ? ORDER BY section, ue_num').all(source);
  const cibleUes = new Set(db.prepare('SELECT ue_num FROM ue WHERE annee_scolaire = ?').all(cible).map(r => r.ue_num));
  const coursCount = db.prepare('SELECT ue_num, COUNT(*) AS n FROM cours WHERE annee_scolaire = ? GROUP BY ue_num').all(source);
  const coursMap = Object.fromEntries(coursCount.map(r => [r.ue_num, r.n]));

  // Grouper par section
  const sections = {};
  for (const ue of ues) {
    const sec = ue.section || '(sans section)';
    (sections[sec] ||= []).push({
      ...ue,
      nb_cours: coursMap[ue.ue_num] || 0,
      deja_presente: cibleUes.has(ue.ue_num)
    });
  }
  res.json(Object.entries(sections).map(([section, ues]) => ({ section, ues })));
});

// Importer une sélection d'UE (+ leurs cours) depuis une année source vers une cible
r.post('/import-ues', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { source, cible, ue_nums, avec_attributions } = req.body;
  if (!source || !cible || !Array.isArray(ue_nums) || ue_nums.length === 0) {
    return res.status(400).json({ error: 'source, cible et ue_nums (tableau non vide) requis' });
  }

  const copyUE = db.prepare(`
    INSERT OR IGNORE INTO ue (ue_num, annee_scolaire, ue_nom, ue_code_fwb, section, ue_tc, ue_det,
      ue_niv, ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau, ue_quad, et_ref, ects, ue_prerequise)
    SELECT ue_num, @cible, ue_nom, ue_code_fwb, section, ue_tc, ue_det,
      ue_niv, ue_per_etudiants, ue_per_cours, ue_aut, ue_tot_prf, ue_niveau, ue_quad, et_ref, ects, ue_prerequise
    FROM ue WHERE ue_num = @ue AND annee_scolaire = @source
  `);
  const copyCours = db.prepare(`
    INSERT OR IGNORE INTO cours (cours_code, annee_scolaire, cours_num, cours_nom, ct_pp, section,
      ue_num, quadrimestre_cours, cours_per, cours_total, ue_autonomie, ue_per_total, ue_niveau, enc_cours, heures)
    SELECT cours_code, @cible, cours_num, cours_nom, ct_pp, section,
      ue_num, quadrimestre_cours, cours_per, cours_total, ue_autonomie, ue_per_total, ue_niveau, enc_cours, heures
    FROM cours WHERE ue_num = @ue AND annee_scolaire = @source
  `);
  const copyAttr = db.prepare(`
    INSERT INTO attribution
      (section, ue_num, code_cours, contrat_mdp, quadrimestre_attribue, code, activite_id,
       num_organisation, type_cours, type_cours_helb, annee_scolaire, periodes_attribuees, autonomie_attribuee)
    SELECT section, ue_num, code_cours, contrat_mdp, quadrimestre_attribue, code, activite_id,
       num_organisation, type_cours, type_cours_helb, @cible, periodes_attribuees, autonomie_attribuee
    FROM attribution WHERE ue_num = @ue AND annee_scolaire = @source
  `);

  let nUe = 0, nCours = 0, nAttr = 0;
  const tx = db.transaction(() => {
    for (const ue of ue_nums) {
      const params = { ue, source, cible };
      nUe += copyUE.run(params).changes;
      nCours += copyCours.run(params).changes;
      if (avec_attributions) nAttr += copyAttr.run(params).changes;
    }
  });
  tx();

  res.json({ ues: nUe, cours: nCours, attributions: nAttr });
});

export default r;

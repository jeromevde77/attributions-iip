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

export default r;

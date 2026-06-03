/**
 * sequence.js — Séquencement des cours dans les UE
 * Permet de définir l'ordre et les délais entre groupes d'une même UE.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// GET /sequence?section=&annee=
// Retourne tous les séquencements avec infos groupes
r.get('/', authRequired, (req, res) => {
  const { section, annee } = req.query;
  if (!section || !annee) return res.status(400).json({ error: 'section et annee requis' });

  const rows = db.prepare(`
    SELECT cs.*, g.ue_num, g.nom AS groupe_nom, g.heures_attribuees,
           g.activite_id, at.libelle AS activite_nom, u.ue_nom
    FROM cours_sequence cs
    JOIN groupe g ON g.id = cs.groupe_id
    LEFT JOIN activite_type at ON at.id = g.activite_id
    LEFT JOIN ue u ON u.ue_num = g.ue_num AND u.annee_scolaire = cs.annee_scolaire
    WHERE cs.section = ? AND cs.annee_scolaire = ?
    ORDER BY cs.ue_num, cs.rang, cs.id
  `).all(section, annee);

  // Grouper par UE
  const parUE = {};
  for (const row of rows) {
    if (!parUE[row.ue_num]) parUE[row.ue_num] = { ue_num: row.ue_num, ue_nom: row.ue_nom, rangs: {} };
    const rang = row.rang;
    if (!parUE[row.ue_num].rangs[rang]) {
      parUE[row.ue_num].rangs[rang] = { rang, delai_avant: row.delai_avant, groupes: [] };
    }
    parUE[row.ue_num].rangs[rang].groupes.push(row);
  }

  res.json(Object.values(parUE));
});

// PUT /sequence — sauvegarder le séquencement complet d'une UE
// body: { section, annee_scolaire, ue_num, rangs: [{ rang, delai_avant, groupe_ids: [] }] }
r.put('/', authRequired, roleRequired('admin', 'editeur', 'coordination'), (req, res) => {
  const { section, annee_scolaire, ue_num, rangs } = req.body;
  if (!section || !annee_scolaire || !ue_num || !Array.isArray(rangs))
    return res.status(400).json({ error: 'section, annee_scolaire, ue_num et rangs requis' });

  const tx = db.transaction(() => {
    // Supprimer l'ancien séquencement de cette UE
    db.prepare(`
      DELETE FROM cours_sequence WHERE section = ? AND annee_scolaire = ? AND ue_num = ?
    `).run(section, annee_scolaire, ue_num);

    // Réinsérer
    const ins = db.prepare(`
      INSERT INTO cours_sequence (section, annee_scolaire, ue_num, groupe_id, rang, delai_avant)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const rangObj of rangs) {
      for (const groupe_id of (rangObj.groupe_ids || [])) {
        ins.run(section, annee_scolaire, ue_num, groupe_id, rangObj.rang, rangObj.delai_avant || 0);
      }
    }
  });
  tx();
  res.json({ ok: true });
});

// DELETE /sequence/:section/:annee/:ue_num — supprimer le séquencement d'une UE
r.delete('/:section/:annee/:ue_num', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  db.prepare(`
    DELETE FROM cours_sequence WHERE section = ? AND annee_scolaire = ? AND ue_num = ?
  `).run(req.params.section, req.params.annee, req.params.ue_num);
  res.json({ ok: true });
});

export default r;

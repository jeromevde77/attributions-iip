// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Calculateur d'ancienneté de service
// Base légale : art. 29ter (D. 19-12-2002, promotion sociale)
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { calculerAnciennete } from '../services/anciennete.js';

const r = Router();

export function migrerAncienneteService(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS anciennete_service (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id  INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
      annee_scolaire TEXT NOT NULL,
      cours_code     TEXT NOT NULL,
      cours_nom      TEXT,
      type_cours     TEXT NOT NULL CHECK (type_cours IN ('CT','PP')),
      periodes       INTEGER NOT NULL DEFAULT 0,
      notes          TEXT,
      cree_le        TEXT DEFAULT (datetime('now')),
      UNIQUE(professeur_id, annee_scolaire, cours_code)
    );
    CREATE INDEX IF NOT EXISTS idx_anc_svc_prof
      ON anciennete_service(professeur_id, annee_scolaire);
    `);
    console.log('[migration] Table anciennete_service créée');
  } catch (e) { console.error('[migration] anciennete_service :', e.message); }
}

/**
 * GET /:profId — calcul complet, toutes années
 * Renvoie les services enregistrés + le calcul par année + les totaux.
 */
r.get('/:profId', authRequired, (req, res) => {
  const profId = Number(req.params.profId);
  const services = db.prepare(`
    SELECT * FROM anciennete_service
     WHERE professeur_id = ?
     ORDER BY annee_scolaire, cours_code
  `).all(profId);

  const { par_annee, total_cours, total_po } = calculerAnciennete(services);

  res.json({
    professeur_id: profId, services,
    calcul: { par_annee, total_cours, total_po },
    reference: "Art. 29ter (D. 19-12-2002) — CT : charge complète 800 p/an ; PP : 1000 p/an ; seuil 40 p ; ≥ 50 % → 360 j, < 50 % → 180 j ; PO plafonné à 360 j/an (art. 29bis §3)",
  });
});

/**
 * POST /:profId/preremplir
 * Importe les attributions IIP de l'année demandée comme services de départ.
 * N'écrase pas les lignes existantes.
 */
r.post('/:profId/preremplir', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const profId = Number(req.params.profId);
  const annee = req.body.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const attribs = db.prepare(`
    SELECT a.code_cours, a.periodes_attribuees,
           c.cours_nom, c.ct_pp AS type_cours
      FROM attribution a
      LEFT JOIN cours c ON c.cours_code = a.code_cours
                       AND c.annee_scolaire = a.annee_scolaire
     WHERE a.professeur_id = ? AND a.annee_scolaire = ?
       AND COALESCE(a.periodes_attribuees, 0) > 0
  `).all(profId, annee);

  const ins = db.prepare(`
    INSERT INTO anciennete_service
      (professeur_id, annee_scolaire, cours_code, cours_nom, type_cours, periodes, notes)
    VALUES (?,?,?,?,?,?, 'pré-rempli depuis les attributions — à vérifier')
    ON CONFLICT(professeur_id, annee_scolaire, cours_code) DO NOTHING
  `);
  let ajoutes = 0;
  for (const a of attribs) {
    const type = (a.type_cours || 'CT').toUpperCase() === 'PP' ? 'PP' : 'CT';
    if (ins.run(profId, annee, a.code_cours, a.cours_nom || null, type,
                Math.round(a.periodes_attribuees || 0)).changes) ajoutes++;
  }
  res.json({ ok: true, ajoutes, annee });
});

/** PUT /:profId — ajouter ou mettre à jour un service */
r.put('/:profId', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const profId = Number(req.params.profId);
  const { annee_scolaire, cours_code, cours_nom, type_cours, periodes, notes } = req.body;
  if (!annee_scolaire || !cours_code || !type_cours) {
    return res.status(400).json({ error: 'annee_scolaire, cours_code et type_cours requis' });
  }
  if (!['CT', 'PP'].includes(String(type_cours).toUpperCase())) {
    return res.status(400).json({ error: 'type_cours doit être CT ou PP' });
  }
  db.prepare(`
    INSERT INTO anciennete_service
      (professeur_id, annee_scolaire, cours_code, cours_nom, type_cours, periodes, notes)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(professeur_id, annee_scolaire, cours_code) DO UPDATE SET
      cours_nom  = COALESCE(excluded.cours_nom, cours_nom),
      type_cours = excluded.type_cours,
      periodes   = excluded.periodes,
      notes      = excluded.notes
  `).run(profId, annee_scolaire, cours_code, cours_nom || null,
         String(type_cours).toUpperCase(), Number(periodes) || 0, notes || null);
  res.json({ ok: true });
});

/** DELETE /service/:id — supprimer un service (admin seul) */
r.delete('/service/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM anciennete_service WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

/**
 * POST /:profId/synchroniser
 * Pousse les totaux calculés vers anciennete_fonction et report_anc_po.
 * Réservé à l'administrateur — acte de référence, pas de calcul automatique.
 */
r.post('/:profId/synchroniser', authRequired, roleRequired('admin'), (req, res) => {
  const profId = Number(req.params.profId);
  const services = db.prepare(
    'SELECT * FROM anciennete_service WHERE professeur_id = ?'
  ).all(profId);

  const { total_cours, total_po } = calculerAnciennete(services);

  // Mettre à jour anciennete_fonction (classement art. 34)
  const ins = db.prepare(`
    INSERT INTO anciennete_fonction (professeur_id, fonction, jours, notes, maj_le)
    VALUES (?,?,?, 'synchronisé depuis le calculateur d''ancienneté', datetime('now'))
    ON CONFLICT(professeur_id, fonction) DO UPDATE SET
      jours  = excluded.jours,
      notes  = excluded.notes,
      maj_le = datetime('now')
  `);
  for (const tc of total_cours) {
    ins.run(profId, tc.cours_code, tc.jours);
  }

  // Mettre à jour report_anc_po
  db.prepare('UPDATE professeur SET report_anc_po = ? WHERE id = ?')
    .run(total_po, profId);

  res.json({ ok: true, total_po, total_cours: total_cours.length });
});

export default r;

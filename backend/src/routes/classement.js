// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Classement d'ancienneté (art. 34) et registre des prioritaires
//         (art. 34ter) — Statut du libre subventionné, 01/02/1993
//
// Art. 34 § 1er (texte vérifié dans le statut) : au sein d'un même PO, pour
// chaque fonction, sont classés les temporaires et les définitifs à temps
// partiel (ces derniers sur demande écrite avant le 15 avril), qu'ils soient
// en service ou non. Groupes :
//   · groupe 1 : à partir de 721 jours d'ancienneté ;
//   · groupe 2 : de 360 à 720 jours, répartis sur deux années au moins au
//     sein du pouvoir organisateur.
//
// Art. 34ter § 1er : les candidats à une priorité posent leur candidature pour
// le 29 mai au plus tard, par recommandé ou par voie électronique, auprès du
// président du PO (copie à la Commission centrale de gestion des emplois),
// en mentionnant fonction(s) et établissement(s).
//
// Lucie stocke l'ancienneté PAR FONCTION (l'exigence du statut) ; le
// pré-remplissage propose l'ancienneté PO déjà en base (report_anc_po) comme
// point de départ à ajuster, jamais comme vérité.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { migrerClassement, calculerGroupe, estRecevable } from '../services/classement.js';
export { migrerClassement };

const r = Router();



// ── Fonctions connues (référentiel du recrutement + celles déjà classées) ───
r.get('/fonctions', authRequired, (req, res) => {
  const duRecrutement = db.prepare(
    'SELECT libelle FROM recrutement_fonction ORDER BY ordre, libelle'
  ).all().map(f => f.libelle);
  const duClassement = db.prepare(
    'SELECT DISTINCT fonction FROM anciennete_fonction ORDER BY fonction'
  ).all().map(f => f.fonction);
  res.json([...new Set([...duRecrutement, ...duClassement])]);
});

// ── Classement d'une fonction ───────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  const fonction = req.query.fonction;
  if (!fonction) return res.status(400).json({ error: 'fonction requise' });

  const lignes = db.prepare(`
    SELECT a.*, p.nom, p.prenom, p.statut AS statut_fiche, p.report_anc_po
      FROM anciennete_fonction a
      JOIN professeur p ON p.id = a.professeur_id
     WHERE a.fonction = ?
  `).all(fonction);

  const classees = lignes.map(l => {
    // Un définitif à temps partiel n'est classé que sur demande écrite (15/04)
    const exclu_tp = l.statut_mdp === 'definitif_tp' && !l.demande_tp_le;
    const groupe = exclu_tp ? null : calculerGroupe(l.jours, !!l.sur_deux_annees);
    return { ...l, groupe, exclu_tp };
  });

  // Tri : groupe 1 puis 2 puis hors groupes ; dans chaque groupe, jours
  // décroissants, puis nom (le statut ne fixe pas de départage plus fin :
  // à ancienneté égale, la décision reste au PO)
  classees.sort((a, b) =>
    (a.groupe ?? 9) - (b.groupe ?? 9) || b.jours - a.jours
    || (a.nom || '').localeCompare(b.nom || ''));

  res.json({
    fonction,
    groupe1: classees.filter(l => l.groupe === 1),
    groupe2: classees.filter(l => l.groupe === 2),
    hors_groupes: classees.filter(l => l.groupe === null),
    reference: "Statut LS 01/02/1993, art. 34 § 1er — groupe 1 : ≥ 721 jours ; groupe 2 : 360 à 720 jours sur deux années au moins",
  });
});

// ── Saisie de l'ancienneté (référentiel de carrière → administrateur) ───────
r.put('/anciennete', authRequired, roleRequired('admin'), (req, res) => {
  const { professeur_id, fonction, jours, sur_deux_annees,
          statut_mdp, demande_tp_le, notes } = req.body;
  if (!professeur_id || !fonction) {
    return res.status(400).json({ error: 'professeur_id et fonction requis' });
  }
  if (jours != null && (Number(jours) < 0 || !Number.isFinite(Number(jours)))) {
    return res.status(400).json({ error: 'jours invalide' });
  }
  db.prepare(`
    INSERT INTO anciennete_fonction
      (professeur_id, fonction, jours, sur_deux_annees, statut_mdp, demande_tp_le, notes, maj_le)
    VALUES (?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(professeur_id, fonction) DO UPDATE SET
      jours           = COALESCE(excluded.jours, jours),
      sur_deux_annees = COALESCE(excluded.sur_deux_annees, sur_deux_annees),
      statut_mdp      = COALESCE(excluded.statut_mdp, statut_mdp),
      demande_tp_le   = excluded.demande_tp_le,
      notes           = COALESCE(excluded.notes, notes),
      maj_le          = datetime('now')
  `).run(Number(professeur_id), fonction, jours ?? 0, sur_deux_annees ? 1 : 0,
         statut_mdp || null, demande_tp_le || null, notes || null);
  res.json({ ok: true });
});

r.delete('/anciennete/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM anciennete_fonction WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

/**
 * POST /preremplir { fonction }
 * Inscrit au classement de la fonction tous les membres du personnel non
 * fictifs qui n'y figurent pas, avec l'ancienneté PO (report_anc_po) comme
 * point de départ. N'écrase jamais une ligne existante.
 */
r.post('/preremplir', authRequired, roleRequired('admin'), (req, res) => {
  const fonction = req.body.fonction;
  if (!fonction) return res.status(400).json({ error: 'fonction requise' });

  const profs = db.prepare(`
    SELECT id, COALESCE(report_anc_po, 0) AS jours FROM professeur
     WHERE COALESCE(est_a_designer, 0) = 0
       AND UPPER(COALESCE(nom,'')) NOT LIKE '%SIGN%'
  `).all();

  const ins = db.prepare(`
    INSERT INTO anciennete_fonction (professeur_id, fonction, jours, sur_deux_annees, notes)
    VALUES (?,?,?,?, 'pré-rempli depuis l''ancienneté PO — à vérifier par fonction')
    ON CONFLICT(professeur_id, fonction) DO NOTHING
  `);
  let ajoutes = 0;
  for (const p of profs) {
    if (ins.run(p.id, fonction, p.jours, p.jours >= 360 ? 1 : 0).changes) ajoutes++;
  }
  res.json({ ok: true, ajoutes, note: "L'ancienneté PO est un point de départ : le statut classe par fonction." });
});

// ── Registre des candidatures prioritaires (art. 34ter) ─────────────────────
r.get('/prioritaires', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  const lignes = db.prepare(`
    SELECT c.*, p.nom AS prof_nom, p.prenom AS prof_prenom
      FROM candidature_prioritaire c
      LEFT JOIN professeur p ON p.id = c.professeur_id
     WHERE c.annee_scolaire = ?
     ORDER BY c.date_reception
  `).all(annee).map(c => ({ ...c, recevable: estRecevable(annee, c.date_reception) }));
  res.json({
    annee, total: lignes.length,
    hors_delai: lignes.filter(l => !l.recevable).length,
    date_limite: `${String(annee).slice(0, 4)}-05-29`,
    candidatures: lignes,
  });
});

r.post('/prioritaires', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee_scolaire, professeur_id, nom, prenom, fonctions,
          etablissements, voie, date_reception, notes } = req.body;
  if (!annee_scolaire || !fonctions || !date_reception) {
    return res.status(400).json({ error: 'annee_scolaire, fonctions et date_reception requis' });
  }
  if (!professeur_id && !nom) {
    return res.status(400).json({ error: 'candidat interne (professeur_id) ou externe (nom) requis' });
  }
  if (voie && !['recommandee', 'electronique'].includes(voie)) {
    return res.status(400).json({ error: 'voie invalide (recommandee ou electronique)' });
  }
  const info = db.prepare(`
    INSERT INTO candidature_prioritaire
      (annee_scolaire, professeur_id, nom, prenom, fonctions, etablissements,
       voie, date_reception, notes, cree_par)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(annee_scolaire, professeur_id || null, nom || null, prenom || null,
         fonctions, etablissements || null, voie || 'recommandee',
         date_reception, notes || null,
         req.user.nom || req.user.email || `#${req.user.id}`);
  const c = db.prepare('SELECT * FROM candidature_prioritaire WHERE id = ?')
              .get(Number(info.lastInsertRowid));
  res.json({ ...c, recevable: estRecevable(annee_scolaire, date_reception) });
});

r.delete('/prioritaires/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM candidature_prioritaire WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

export default r;

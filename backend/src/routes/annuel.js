// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Paramétrage annuel
//
// Distinct du RÉFÉRENTIEL LÉGAL (routes/referentiels.js, admin seul) : ici on
// trouve ce qui se rejoue chaque rentrée — dates réelles des UE, instanciation
// de l'échéancier. Modifiable par admin et editeur, avec trace.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { calculerDates, chargerPeriodesConges, anneeDebutDe, diffJours }
  from '../services/echeancier_dates.js';
import { instancier, recalculerStatuts } from '../services/echeancier.js';

const r = Router();

// ── GET /annuel/dates-ue?annee=&section=&sansDates= ─────────────────────────
// Toutes les organisations d'UE de l'année, avec leurs dates et l'état de
// complétude. Sert à la saisie groupée.
r.get('/dates-ue', authRequired, (req, res) => {
  const { annee, section, sansDates } = req.query;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const params = [annee, annee];
  let sql = `
    SELECT o.id, o.ue_num, o.section, o.num_organisation,
           o.date_debut, o.date_fin, o.nb_semaines,
           u.ue_nom, u.ue_niv, u.ue_quad, u.is_epreuve_integree,
           (SELECT COUNT(*) FROM attribution a
             WHERE a.ue_num = o.ue_num AND a.annee_scolaire = o.annee_scolaire
               AND a.section = o.section) AS nb_attributions
    FROM organisation_ue o
    LEFT JOIN ue u ON u.ue_num = o.ue_num AND u.annee_scolaire = ?
                  AND (u.section = o.section OR u.section IS NULL)
    WHERE o.annee_scolaire = ?`;

  if (section) { sql += ' AND o.section = ?'; params.push(section); }
  if (sansDates === '1') sql += ' AND (o.date_debut IS NULL OR o.date_fin IS NULL)';
  sql += ' ORDER BY o.section, o.ue_num, o.num_organisation';

  const lignes = db.prepare(sql).all(...params);

  const total = lignes.length;
  const datees = lignes.filter(l => l.date_debut && l.date_fin).length;

  res.json({
    annee, total, datees, manquantes: total - datees,
    sections: [...new Set(lignes.map(l => l.section).filter(Boolean))].sort(),
    lignes,
  });
});

// ── PUT /annuel/dates-ue ────────────────────────────────────────────────────
// Enregistrement groupé : [{ id, date_debut, date_fin, nb_semaines }, …]
r.put('/dates-ue', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { lignes } = req.body;
  if (!Array.isArray(lignes)) return res.status(400).json({ error: 'lignes requises' });

  const maj = db.prepare(`
    UPDATE organisation_ue
       SET date_debut = ?, date_fin = ?, nb_semaines = ?
     WHERE id = ?
  `);

  const erreurs = [];
  let modifiees = 0;

  const tx = db.transaction((items) => {
    for (const l of items) {
      const id = Number(l.id);
      if (!id) continue;
      const d = l.date_debut || null;
      const f = l.date_fin || null;
      // Cohérence : la fin ne peut précéder le début
      if (d && f && f < d) {
        erreurs.push({ id, message: 'la date de fin précède la date de début' });
        continue;
      }
      // nb_semaines : recalculé si absent
      let sem = l.nb_semaines != null && l.nb_semaines !== ''
        ? Number(l.nb_semaines) : null;
      if (sem == null && d && f) sem = Math.max(1, Math.round(diffJours(d, f) / 7));
      const info = maj.run(d, f, sem, id);
      modifiees += info.changes;
    }
  });

  try { tx(lignes); }
  catch (e) { return res.status(500).json({ error: e.message }); }

  res.json({ ok: true, modifiees, erreurs });
});

// ── POST /annuel/dates-ue/initialiser ────────────────────────────────────────
// Crée une ligne dans organisation_ue pour chaque UE attribuée cette année
// qui n'en a pas encore. Elles apparaissent en « Sans dates » — l'utilisateur
// pose ensuite les dates via le planificateur. C'est le chaînon entre les
// attributions et l'échéancier.
r.post('/dates-ue/initialiser', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee } = req.body;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  // Toutes les UE avec attributions cette année — en respectant chaque
  // num_organisation présent (une UE peut être organisée plusieurs fois)
  const attribuees = db.prepare(`
    SELECT DISTINCT ue_num, section, COALESCE(num_organisation, 1) AS num_organisation
    FROM attribution
    WHERE annee_scolaire = ?
    ORDER BY section, ue_num, num_organisation
  `).all(annee);

  const exists = db.prepare(`
    SELECT 1 FROM organisation_ue
    WHERE annee_scolaire = ? AND ue_num = ? AND section = ? AND num_organisation = ?
  `);
  const ins = db.prepare(`
    INSERT INTO organisation_ue (ue_num, section, annee_scolaire, num_organisation)
    VALUES (?, ?, ?, ?)
  `);

  let creees = 0;
  for (const a of attribuees) {
    if (!exists.get(annee, a.ue_num, a.section, a.num_organisation)) {
      ins.run(a.ue_num, a.section, annee, a.num_organisation);
      creees++;
    }
  }

  res.json({ ok: true, creees, total: attribuees.length,
    message: creees > 0
      ? `${creees} organisation(s) créée(s) sans dates — placez-les sur la ligne du temps.`
      : 'Toutes les UE ont déjà une organisation.' });
});

// ── POST /annuel/dates-ue/reprendre ─────────────────────────────────────────
// Pré-remplit les dates manquantes depuis l'année précédente, décalées d'un an
// (au jour de semaine équivalent : décalage de 364 jours = 52 semaines pile).
r.post('/dates-ue/reprendre', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, ecraser = false } = req.body;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const deb = anneeDebutDe(annee);
  const anneePrec = `${deb - 1}-${deb}`;

  const precedentes = db.prepare(`
    SELECT ue_num, section, num_organisation, date_debut, date_fin, nb_semaines
    FROM organisation_ue
    WHERE annee_scolaire = ? AND date_debut IS NOT NULL AND date_fin IS NOT NULL
  `).all(anneePrec);

  if (!precedentes.length) {
    return res.json({ ok: true, appliquees: 0,
      message: `Aucune date trouvée pour ${anneePrec}` });
  }

  const decale = (iso) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 364);   // 52 semaines : même jour de semaine
    return d.toISOString().slice(0, 10);
  };

  const cible = db.prepare(`
    SELECT id, date_debut, date_fin FROM organisation_ue
    WHERE annee_scolaire = ? AND ue_num = ? AND section = ? AND num_organisation = ?
  `);
  const maj = db.prepare(
    'UPDATE organisation_ue SET date_debut=?, date_fin=?, nb_semaines=? WHERE id=?'
  );

  let appliquees = 0;
  const tx = db.transaction(() => {
    for (const p of precedentes) {
      const c = cible.get(annee, p.ue_num, p.section, p.num_organisation);
      if (!c) continue;
      if (!ecraser && c.date_debut && c.date_fin) continue;   // déjà daté
      maj.run(decale(p.date_debut), decale(p.date_fin), p.nb_semaines, c.id);
      appliquees++;
    }
  });
  tx();

  res.json({ ok: true, appliquees, source: anneePrec,
    message: `${appliquees} organisation(s) pré-remplie(s) depuis ${anneePrec}. À vérifier avant validation.` });
});

// ── GET /annuel/dates-ue/:id/jalons ─────────────────────────────────────────
// Aperçu des échéances qui seront générées pour cette organisation d'UE.
r.get('/dates-ue/:id/jalons', authRequired, (req, res) => {
  const org = db.prepare('SELECT * FROM organisation_ue WHERE id = ?')
    .get(Number(req.params.id));
  if (!org) return res.status(404).json({ error: 'organisation introuvable' });
  if (!org.date_debut || !org.date_fin) return res.json({ jalons: [] });

  const annee = org.annee_scolaire;
  const estEnConge = chargerPeriodesConges(db, annee);
  const ctx = {
    anneeScolaire: annee, anneeDebut: anneeDebutDe(annee), estEnConge,
    ancres: { ue_debut: org.date_debut, ue_fin: org.date_fin },
  };

  const types = db.prepare(`
    SELECT * FROM echeance_type
    WHERE actif = 1 AND (regle_date LIKE 'rel:ue_debut%' OR regle_date LIKE 'rel:ue_fin%')
    ORDER BY id
  `).all();

  const estEI = db.prepare(`
    SELECT is_epreuve_integree FROM ue WHERE ue_num = ? AND annee_scolaire = ?
  `).get(org.ue_num, annee)?.is_epreuve_integree;

  const jalons = [];
  for (const t of types) {
    if (t.filtre_source === 'epreuve_integree' && !estEI) continue;
    for (const d of calculerDates(t.regle_date, ctx)) {
      jalons.push({
        code: t.code, libelle: t.libelle, date_due: d.date_due,
        base_legale: t.base_legale, responsable: t.responsable_defaut,
      });
    }
  }
  jalons.sort((a, b) => a.date_due.localeCompare(b.date_due));
  res.json({ organisation: org, jalons });
});

// ── POST /annuel/echeancier/instancier ──────────────────────────────────────
// Régénère les échéances de l'année après modification des dates.
r.post('/echeancier/instancier', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee } = req.body;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  try {
    const stats = instancier(db, annee);
    const statuts = recalculerStatuts(db);
    res.json({ ok: true, ...stats, ...statuts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default r;

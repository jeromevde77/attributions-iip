// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Ouverture d'une année scolaire
//
// Chaque rentrée apporte une circulaire, parfois un décret modificatif, et son
// lot d'échéances propres à l'établissement (portes ouvertes, délibérations,
// sorties). Deux mécaniques distinctes :
//
//  · VEILLE RÉGLEMENTAIRE — les échéances légales sont décrites une fois pour
//    toutes dans echeance_type (règle de date + base légale). Si le décret et
//    la circulaire n'ont pas changé, on les reconduit telles quelles ; sinon on
//    liste les types à revoir avant d'instancier.
//
//  · REPORT DES ÉVÉNEMENTS D'ÉTABLISSEMENT — ceux-là ne sont pas déductibles
//    d'un texte : on recopie ceux de l'an dernier, décalés d'un an, à ajuster.
//
// Aucune table nouvelle : on réutilise echeance_type, echeance et
// evenement_etablissement.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

export function migrerRentree(dbx) {
  try {
    const cols = dbx.prepare('PRAGMA table_info(echeance_type)').all().map(c => c.name);
    if (!cols.includes('revue_annee')) {
      dbx.exec('ALTER TABLE echeance_type ADD COLUMN revue_annee TEXT');
      console.log('[migration] echeance_type.revue_annee ajoutée');
    }
  } catch (e) { console.error('[migration] rentree :', e.message); }
}

// ── État de la veille réglementaire pour une année ──────────────────────────
r.get('/veille', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const types = db.prepare(`
    SELECT id, code, libelle, zone, categorie, base_legale, regle_date, revue_annee
    FROM echeance_type WHERE actif = 1 ORDER BY zone, libelle
  `).all();

  const revus = types.filter(t => t.revue_annee === annee);
  const aRevoir = types.filter(t => t.revue_annee !== annee);

  res.json({
    annee,
    total: types.length,
    revus: revus.length,
    a_revoir: aRevoir.map(t => ({
      id: t.id, code: t.code, libelle: t.libelle, zone: t.zone,
      base_legale: t.base_legale, regle_date: t.regle_date,
      derniere_revue: t.revue_annee || null,
    })),
    confirme: types.length > 0 && aRevoir.length === 0,
  });
});

// ── Confirmer la veille ─────────────────────────────────────────────────────
// sans_changement = true  → tous les types actifs sont reconduits tels quels.
// sinon, seuls les types explicitement listés sont marqués comme revus, les
// autres restent signalés tant qu'ils n'ont pas été ajustés.
r.post('/veille', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, sans_changement, types_confirmes } = req.body;
  if (!annee) return res.status(400).json({ error: 'annee requise' });

  const maj = db.prepare('UPDATE echeance_type SET revue_annee = ? WHERE id = ?');
  let n = 0;
  db.transaction(() => {
    if (sans_changement) {
      for (const t of db.prepare('SELECT id FROM echeance_type WHERE actif = 1').all()) {
        maj.run(annee, t.id); n++;
      }
    } else {
      for (const id of (types_confirmes || [])) { maj.run(annee, Number(id)); n++; }
    }
  })();

  res.json({ ok: true, annee, confirmes: n });
});

// ── Événements d'établissement : ce qui existe déjà pour l'année ────────────
r.get('/evenements', authRequired, (req, res) => {
  const annee = req.query.annee;
  if (!annee) return res.status(400).json({ error: 'annee requise' });
  res.json(db.prepare(`
    SELECT id, type, titre, date_debut, date_fin, lieu, annee_scolaire
    FROM evenement_etablissement WHERE annee_scolaire = ?
    ORDER BY date_debut
  `).all(annee));
});

// ── Reporter les événements de l'an dernier ────────────────────────────────
// Décalage de 364 jours (52 semaines) plutôt qu'un an calendaire : une porte
// ouverte qui tombait un samedi reste un samedi. Les dates restent à ajuster.
r.post('/reporter-evenements', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, annee_source } = req.body;
  if (!annee || !annee_source) {
    return res.status(400).json({ error: 'annee et annee_source requises' });
  }

  const decaler = (iso) => {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return null;
    d.setDate(d.getDate() + 364);
    return d.toISOString().slice(0, 10);
  };

  const source = db.prepare(`
    SELECT * FROM evenement_etablissement WHERE annee_scolaire = ? ORDER BY date_debut
  `).all(annee_source);

  const existe = db.prepare(`
    SELECT 1 FROM evenement_etablissement
    WHERE annee_scolaire = ? AND titre = ? AND type = ?
  `);
  const ins = db.prepare(`
    INSERT INTO evenement_etablissement
      (type, titre, date_debut, date_fin, heure_debut, heure_fin, lieu,
       description, annee_scolaire, responsable_user_id, cree_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);

  let reportes = 0, ignores = 0;
  db.transaction(() => {
    for (const e of source) {
      if (existe.get(annee, e.titre, e.type)) { ignores++; continue; }
      const debut = decaler(e.date_debut);
      if (!debut) { ignores++; continue; }
      ins.run(e.type, e.titre, debut, decaler(e.date_fin), e.heure_debut, e.heure_fin,
              e.lieu, e.description, annee, e.responsable_user_id,
              (req.user?.email || 'report automatique'));
      reportes++;
    }
  })();

  res.json({ ok: true, annee, annee_source, reportes, ignores, source: source.length });
});

export default r;

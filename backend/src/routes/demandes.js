// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Demandes de modification
//
// Un coordinateur encode pour sa section — attributions, dates d'UE — mais sa
// saisie ne prend PAS effet immédiatement : elle devient une demande, qu'un
// administrateur valide ou refuse. Le principe est que la donnée officielle
// reste juste tant que la décision n'est pas prise ; valider après coup ne
// répare rien, la dotation ayant déjà été calculée sur une valeur non arbitrée.
//
// Le mécanisme est générique : un type, une cible, une charge utile JSON, et
// une fonction d'application propre à chaque type.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';

const r = Router();

export function migrerDemandes(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS demande_modification (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      type           TEXT NOT NULL,        -- attribution | date_ue | …
      operation      TEXT NOT NULL,        -- creer | modifier | supprimer
      cible_id       TEXT,                 -- identifiant de l'objet visé
      section        TEXT,
      annee_scolaire TEXT,
      libelle        TEXT NOT NULL,        -- ce que la demande fait, en clair
      avant          TEXT,                 -- état actuel, en JSON
      apres          TEXT NOT NULL,        -- état demandé, en JSON
      statut         TEXT NOT NULL DEFAULT 'en_attente',   -- en_attente | validee | refusee
      auteur_id      INTEGER,
      auteur_nom     TEXT,
      decideur_id    INTEGER,
      decideur_nom   TEXT,
      motif_refus    TEXT,
      cree_le        TEXT DEFAULT (datetime('now')),
      decide_le      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_demande_statut ON demande_modification(statut, section);
    `);
    console.log('[migration] demande_modification créée');
  } catch (e) { console.error('[migration] demandes :', e.message); }
}

/**
 * Une saisie doit-elle passer par une demande ?
 * Seuls les coordinateurs y sont soumis ; admin et éditeurs écrivent
 * directement. Renvoie false si la section n'est pas dans leur périmètre —
 * dans ce cas c'est un refus pur et simple, traité par l'appelant.
 */
export function exigeValidation(user) {
  return user?.role === 'coordination';
}

export function sectionAutorisee(user, section) {
  const s = getUserSections(user);
  return s === null ? true : (section ? s.includes(section) : false);
}

/** Dépose une demande et renvoie la réponse à retourner au client. */
export function deposerDemande({ type, operation, cible_id, section, annee_scolaire,
                                 libelle, avant, apres, user }) {
  const info = db.prepare(`
    INSERT INTO demande_modification
      (type, operation, cible_id, section, annee_scolaire, libelle, avant, apres,
       auteur_id, auteur_nom)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(type, operation, cible_id != null ? String(cible_id) : null,
         section || null, annee_scolaire || null, libelle,
         avant ? JSON.stringify(avant) : null, JSON.stringify(apres),
         user?.id ?? null, user?.nom || user?.email || null);
  return {
    ok: true, en_attente: true, demande_id: Number(info.lastInsertRowid),
    message: "Votre modification a été transmise pour validation. Elle ne prendra "
           + "effet qu'après accord de la direction.",
  };
}

// ── Application d'une demande validée ──────────────────────────────────────
// Chaque type sait se poser dans les tables réelles.
const APPLICATEURS = {
  date_ue: (d) => {
    const a = JSON.parse(d.apres);
    db.prepare(`
      UPDATE organisation_ue SET date_debut = ?, date_fin = ?
      WHERE id = ?
    `).run(a.date_debut || null, a.date_fin || null, Number(d.cible_id));
    return 'Dates mises à jour.';
  },

  attribution: (d) => {
    const a = JSON.parse(d.apres);
    if (d.operation === 'supprimer') {
      db.prepare('DELETE FROM attribution WHERE id = ?').run(Number(d.cible_id));
      return 'Attribution supprimée.';
    }
    const champs = Object.keys(a).filter(k => k !== 'id');
    if (!champs.length) return 'Rien à appliquer.';
    if (d.operation === 'creer') {
      db.prepare(`INSERT INTO attribution (${champs.join(',')})
                  VALUES (${champs.map(() => '?').join(',')})`)
        .run(...champs.map(k => a[k]));
      return 'Attribution créée.';
    }
    db.prepare(`UPDATE attribution SET ${champs.map(k => k + ' = ?').join(', ')} WHERE id = ?`)
      .run(...champs.map(k => a[k]), Number(d.cible_id));
    return 'Attribution mise à jour.';
  },
};

// ── Consultation ───────────────────────────────────────────────────────────
r.get('/', authRequired, (req, res) => {
  const statut = req.query.statut || 'en_attente';
  const sections = getUserSections(req.user);

  let sql = 'SELECT * FROM demande_modification WHERE statut = ?';
  const params = [statut];
  // Un coordinateur ne voit que ses propres demandes
  if (sections) {
    sql += ` AND (auteur_id = ? OR section IN (${sections.map(() => '?').join(',') || "''"}))`;
    params.push(req.user.id, ...sections);
  }
  sql += ' ORDER BY cree_le DESC LIMIT 200';

  const lignes = db.prepare(sql).all(...params).map(d => ({
    ...d,
    avant: d.avant ? JSON.parse(d.avant) : null,
    apres: JSON.parse(d.apres),
  }));

  res.json({
    statut, demandes: lignes,
    en_attente: db.prepare(
      "SELECT COUNT(*) n FROM demande_modification WHERE statut = 'en_attente'"
    ).get().n,
  });
});

// ── Décision ───────────────────────────────────────────────────────────────
// Réservée aux administrateurs : c'est le sens même du circuit.
r.post('/:id/valider', authRequired, roleRequired('admin'), (req, res) => {
  const d = db.prepare('SELECT * FROM demande_modification WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'demande introuvable' });
  if (d.statut !== 'en_attente') return res.status(400).json({ error: 'Demande déjà tranchée' });

  const appliquer = APPLICATEURS[d.type];
  if (!appliquer) return res.status(400).json({ error: `Type « ${d.type} » non pris en charge` });

  let resultat;
  try {
    db.transaction(() => {
      resultat = appliquer(d);
      db.prepare(`
        UPDATE demande_modification SET statut = 'validee', decideur_id = ?,
          decideur_nom = ?, decide_le = datetime('now') WHERE id = ?
      `).run(req.user.id, req.user.nom || req.user.email, d.id);
    })();
  } catch (e) {
    return res.status(500).json({ error: "L'application a échoué : " + e.message });
  }
  res.json({ ok: true, message: resultat });
});

r.post('/:id/refuser', authRequired, roleRequired('admin'), (req, res) => {
  const d = db.prepare('SELECT * FROM demande_modification WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'demande introuvable' });
  if (d.statut !== 'en_attente') return res.status(400).json({ error: 'Demande déjà tranchée' });

  db.prepare(`
    UPDATE demande_modification SET statut = 'refusee', decideur_id = ?, decideur_nom = ?,
      motif_refus = ?, decide_le = datetime('now') WHERE id = ?
  `).run(req.user.id, req.user.nom || req.user.email, req.body?.motif || null, d.id);
  res.json({ ok: true });
});

// Retrait par son auteur, tant que rien n'est décidé
r.delete('/:id', authRequired, (req, res) => {
  const d = db.prepare('SELECT * FROM demande_modification WHERE id = ?').get(Number(req.params.id));
  if (!d) return res.status(404).json({ error: 'demande introuvable' });
  if (d.statut !== 'en_attente') return res.status(400).json({ error: 'Demande déjà tranchée' });
  if (req.user.role !== 'admin' && d.auteur_id !== req.user.id) {
    return res.status(403).json({ error: 'Seul son auteur peut retirer cette demande' });
  }
  db.prepare('DELETE FROM demande_modification WHERE id = ?').run(d.id);
  res.json({ ok: true });
});

export default r;

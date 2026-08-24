// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Classement d'ancienneté : migration et règles pures (art. 34 / 34ter)
// Séparé des routes pour être testable sans serveur.
// ─────────────────────────────────────────────────────────────────────────────

export function migrerClassement(dbx) {
  try {
    dbx.exec(`
    CREATE TABLE IF NOT EXISTS anciennete_fonction (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id    INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
      fonction         TEXT NOT NULL,
      jours            INTEGER NOT NULL DEFAULT 0,   -- jours d'ancienneté dans la fonction au sein du PO
      sur_deux_annees  INTEGER NOT NULL DEFAULT 0,   -- condition du groupe 2
      statut_mdp       TEXT,                          -- temporaire | definitif_tp | definitif
      demande_tp_le    TEXT,                          -- définitif temps partiel : demande écrite (avant 15/04)
      notes            TEXT,
      maj_le           TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_anc_fonction
      ON anciennete_fonction(professeur_id, fonction);

    CREATE TABLE IF NOT EXISTS candidature_prioritaire (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_scolaire TEXT NOT NULL,                  -- rentrée visée (ex. 2026-2027)
      professeur_id  INTEGER REFERENCES professeur(id) ON DELETE SET NULL,
      nom            TEXT, prenom TEXT,               -- candidat externe au PO
      fonctions      TEXT NOT NULL,
      etablissements TEXT,
      voie           TEXT NOT NULL DEFAULT 'recommandee',  -- recommandee | electronique
      date_reception TEXT NOT NULL,
      notes          TEXT,
      cree_par       TEXT,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_prior_annee
      ON candidature_prioritaire(annee_scolaire, date_reception);
    `);
    console.log('[migration] Tables classement/prioritaires créées');
  } catch (e) { console.error('[migration] classement :', e.message); }
}


/** Groupe au sens de l'art. 34 § 1er, alinéa 2. */
export function calculerGroupe(jours, surDeuxAnnees) {
  if (jours >= 721) return 1;
  if (jours >= 360 && jours <= 720 && surDeuxAnnees) return 2;
  return null;   // hors groupes
}

/** Recevabilité 34ter : reçue au plus tard le 29 mai précédant la rentrée. */
export function estRecevable(anneeScolaire, dateReception) {
  const a = Number(String(anneeScolaire).slice(0, 4));
  return !!dateReception && dateReception <= `${a}-05-29`;
}

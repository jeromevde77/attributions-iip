// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Journal du dossier d'un membre du personnel
//
// Fil chronologique de remarques datées, complété à la lecture par les
// événements déjà en base (entretiens, absences, pièces, engagement) —
// ceux-ci ne sont jamais recopiés ici : une seule vérité par donnée.
//
// Les remarques sont volontairement inaltérables (pas de modification après
// coup) : sur un dossier de personnel, un fil réécrivable a posteriori perd
// toute valeur probante. Seule la suppression par l'administrateur existe.
// ─────────────────────────────────────────────────────────────────────────────

export function migrerJournalPersonnel(db) {
  try {
    db.exec(`
    CREATE TABLE IF NOT EXISTS journal_personnel (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      professeur_id  INTEGER NOT NULL REFERENCES professeur(id) ON DELETE CASCADE,
      contenu        TEXT NOT NULL,
      confidentiel   INTEGER NOT NULL DEFAULT 0,
      auteur         TEXT,
      auteur_user_id INTEGER,
      cree_le        TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_journal_prof
      ON journal_personnel(professeur_id, cree_le DESC);
    `);
    console.log('[migration] Table journal_personnel créée');
  } catch (e) { console.error('[migration] journal_personnel :', e.message); }
}

export default migrerJournalPersonnel;

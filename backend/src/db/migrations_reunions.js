// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Réunions d'équipe et tâches de suivi
//
// POURQUOI CE N'EST PAS L'ÉCHÉANCIER.
//
// L'échéancier porte les obligations de l'établissement : elles ont une base
// légale, une date imposée, et elles se répètent chaque année — on les
// INSTANCIE à partir d'un référentiel. Une tâche de réunion n'a rien de tout
// cela : elle naît d'une phrase prononcée un lundi matin, elle est confiée à
// quelqu'un, elle se fait ou elle se reporte, et personne ne la reverra
// l'année suivante. Les mêmes colonnes ne veulent pas dire la même chose.
//
// Ce qui les relie, en revanche, c'est la personne : « ce qui m'attend »
// rassemble les deux — mes échéances et mes tâches — et c'est l'affaire de
// l'écran, pas de la table.
//
// LA RÉUNION EST L'OBJET, LA TÂCHE EN EST LA TRACE. On tient une séance, on y
// décide des choses, et ces choses ont un responsable et une date. Séparer les
// deux revient à tenir la liste des tâches d'un côté et le procès-verbal de
// l'autre : trois semaines plus tard, plus personne ne sait quelle réunion a
// décidé quoi. Une tâche connaît donc la réunion qui l'a créée — et une tâche
// sans réunion reste possible, car tout ne se décide pas en séance.
// ─────────────────────────────────────────────────────────────────────────────

export function migrerReunions(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reunion (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_scolaire  TEXT NOT NULL,
      titre           TEXT NOT NULL,
      -- « secretariat », « equipe », « coordination », « autre » : ce n'est pas
      -- un droit d'accès, c'est un classement — on cherche « les réunions de
      -- secrétariat », pas « les réunions numéro 12 ».
      genre           TEXT NOT NULL DEFAULT 'secretariat',
      date_seance     TEXT NOT NULL,            -- YYYY-MM-DD
      heure_seance    TEXT,                     -- HH:MM
      lieu            TEXT,
      ordre_du_jour   TEXT,                     -- une ligne par point
      notes           TEXT,                     -- ce qui s'est dit
      -- « preparee » tant qu'on l'écrit, « tenue » une fois la séance passée.
      statut          TEXT NOT NULL DEFAULT 'preparee',
      cree_le         TEXT DEFAULT (datetime('now')),
      cree_par        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reunion_annee ON reunion(annee_scolaire, date_seance);

    CREATE TABLE IF NOT EXISTS reunion_participant (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      reunion_id  INTEGER NOT NULL REFERENCES reunion(id) ON DELETE CASCADE,
      user_id       INTEGER REFERENCES utilisateur(id),
      -- TOUT LE MONDE N'A PAS DE COMPTE LUCIE. Le personnel a une fiche ; le
      -- compte, lui, ne sert qu'à se connecter. Convoquer quelqu'un à une
      -- réunion n'a rien à voir avec le fait qu'il puisse ouvrir l'application.
      professeur_id INTEGER REFERENCES professeur(id),
      nom         TEXT NOT NULL,
      present     INTEGER NOT NULL DEFAULT 1,
      excuse      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_reunion_part ON reunion_participant(reunion_id);

    CREATE TABLE IF NOT EXISTS tache (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_scolaire      TEXT NOT NULL,
      titre               TEXT NOT NULL,
      detail              TEXT,
      -- UNE PERSONNE OU UN RÔLE, jamais un champ de texte libre : « voir avec
      -- le secrétariat » n'engage personne, et trois mois plus tard la tâche
      -- est toujours là.
      responsable_user_id INTEGER REFERENCES utilisateur(id),
      -- Même raison : on confie une action à une PERSONNE, qu'elle ait un
      -- compte ou non. Sans cela, la moitié de l'équipe était inassignable.
      responsable_professeur_id INTEGER REFERENCES professeur(id),
      responsable_role    TEXT,
      echeance            TEXT,                 -- YYYY-MM-DD, facultative
      -- a_faire | en_cours | fait | abandonnee
      statut              TEXT NOT NULL DEFAULT 'a_faire',
      priorite            INTEGER NOT NULL DEFAULT 1,   -- 0 basse, 1 normale, 2 haute
      reunion_id          INTEGER REFERENCES reunion(id) ON DELETE SET NULL,
      -- La réunion où l'on en a reparlé : c'est ce qui fait un SUIVI et non une
      -- liste. Une tâche décidée le 2 et revue le 16 porte les deux dates.
      revue_reunion_id    INTEGER REFERENCES reunion(id) ON DELETE SET NULL,
      commentaire         TEXT,
      fait_le             TEXT,
      fait_par            TEXT,
      cree_le             TEXT DEFAULT (datetime('now')),
      cree_par            TEXT,
      maj_le              TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tache_annee   ON tache(annee_scolaire, statut);
    CREATE INDEX IF NOT EXISTS idx_tache_resp    ON tache(responsable_user_id, statut);
    CREATE INDEX IF NOT EXISTS idx_tache_reunion ON tache(reunion_id);
  `);

  // Migration additive : les colonnes du personnel ont été ajoutées après la
  // première version des tables. Ajouter une colonne à une table existante ne
  // se fait pas dans le CREATE — il faut le dire, et supporter qu'elle soit
  // déjà là.
  for (const [table, colonne, decl] of [
    ['reunion_participant', 'professeur_id', 'INTEGER REFERENCES professeur(id)'],
    ['tache', 'responsable_professeur_id', 'INTEGER REFERENCES professeur(id)'],
    // UNE ACTION PEUT SERVIR UNE OBLIGATION. « Rassembler les titres d'accès »
    // n'est pas une idée de réunion : c'est le travail qu'exige une échéance de
    // la circulaire. Les relier, c'est pouvoir dire devant un contrôle QUI a
    // fait quoi pour tenir l'obligation, et dans l'autre sens montrer, sur
    // l'échéance, le travail qui l'a préparée.
    ['tache', 'echeance_id', 'INTEGER REFERENCES echeance(id)'],
  ]) {
    const colonnes = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!colonnes.includes(colonne)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${decl}`);
    }
  }
}

export default migrerReunions;

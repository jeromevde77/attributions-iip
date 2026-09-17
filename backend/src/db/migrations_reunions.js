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

    -- UNE RÉUNION PEUT PORTER SUR PLUSIEURS UNITÉS. « On revoit 281 et 283 » :
    -- une colonne ne suffit pas, et les écrire dans le titre revient à ne pas
    -- pouvoir les retrouver. Une table de liens, donc — vide la plupart du
    -- temps, ce qui est le cas normal.
    CREATE TABLE IF NOT EXISTS reunion_ue (
      reunion_id INTEGER NOT NULL REFERENCES reunion(id) ON DELETE CASCADE,
      ue_num     INTEGER NOT NULL,
      PRIMARY KEY (reunion_id, ue_num)
    );

    -- UN POINT DE L'ORDRE DU JOUR EST UN OBJET, PAS UNE LIGNE DE TEXTE.
    --
    -- L'ordre du jour tenait dans un champ libre et les notes dans un autre :
    -- deux blocs qui ne se répondaient pas. Relire trois semaines plus tard
    -- demandait de reconstituer soi-même quelle remarque allait avec quel
    -- point — et une décision notée au milieu d'un pavé ne se retrouve pas.
    --
    -- Chaque point porte donc son intitulé, ce qui s'y est dit, et les actions
    -- qui en sortent. Le procès-verbal s'écrit alors tout seul, dans l'ordre
    -- de la séance.
    CREATE TABLE IF NOT EXISTS reunion_point (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      reunion_id INTEGER NOT NULL REFERENCES reunion(id) ON DELETE CASCADE,
      ordre      INTEGER NOT NULL DEFAULT 0,
      intitule   TEXT NOT NULL DEFAULT '',
      notes      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reunion_point ON reunion_point(reunion_id, ordre);

    -- ON NE CONFIE PAS TOUJOURS UNE ACTION À UNE SEULE PERSONNE.
    --
    -- « Florian et Natacha préparent les dossiers » se notait jusqu'ici en
    -- choisissant l'un des deux — l'autre ne voyait rien sur son tableau de
    -- bord, et le jour du contrôle la tâche paraissait reposer sur une seule
    -- tête. Les colonnes responsable_* de la table tache restent : elles portent le
    -- PREMIER nommé, celui qui répond de l'action, et tout ce qui lit déjà la
    -- table continue de fonctionner. Cette table-ci porte l'équipage complet.
    CREATE TABLE IF NOT EXISTS tache_personne (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tache_id      INTEGER NOT NULL REFERENCES tache(id) ON DELETE CASCADE,
      user_id       INTEGER REFERENCES utilisateur(id),
      professeur_id INTEGER REFERENCES professeur(id),
      role          TEXT,
      rang          INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tache_personne ON tache_personne(tache_id, rang);
  `);

  // UNE TÂCHE QUI ARRIVE DOIT SE VOIR ARRIVER.
  //
  // Confiée un vendredi soir, elle se noyait le lundi parmi les six autres :
  // rien ne distinguait celle qu'on n'avait jamais lue de celles qu'on traîne
  // depuis trois semaines. « Récente » ne suffit pas — une tâche de vendredi
  // n'est plus récente le lundi, et elle resterait signalée après dix lectures.
  // Ce qui compte est : CETTE PERSONNE l'a-t-elle déjà vue ? La marque suit
  // donc la personne, pas le navigateur — signalée sur son portable, elle ne
  // l'est plus sur son poste.
  try {
    const cols = db.prepare('PRAGMA table_info(tache_personne)').all();
    if (cols.length && !cols.some(c => c.name === 'vu_le')) {
      db.exec('ALTER TABLE tache_personne ADD COLUMN vu_le TEXT');
    }
  } catch (e) { console.error('[migration] tache_personne.vu_le :', e.message); }

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
    // QUI CONVOQUE SUIT. Une action confiée en réunion regarde trois personnes :
    // celle qui la fait, la direction, et CELUI QUI A CONVOQUÉ — c'est lui qui
    // rouvrira le point à la séance suivante. Sans organisateur nommé, la tâche
    // n'apparaissait que chez son responsable, et le suivi reposait sur la
    // mémoire de celui qui présidait.
    ['reunion', 'organisateur_user_id', 'INTEGER REFERENCES utilisateur(id)'],
    ['reunion', 'organisateur_professeur_id', 'INTEGER REFERENCES professeur(id)'],
    // CE DONT LA RÉUNION PARLE. Une coordination de section ne parle pas de
    // tout l'institut, et une réunion d'UE encore moins : la portée se pose une
    // fois, en tête de séance, au lieu d'être répétée dans chaque intitulé.
    ['reunion', 'section', 'TEXT'],
    // LA PROCHAINE SÉANCE SE FIXE À LA FIN DE CELLE-CI, quand tout le monde est
    // là — pas trois semaines plus tard par courriels croisés. Les trois seules
    // choses à savoir : quand, où, et qui est attendu. Elles s'affichent
    // ensuite sur le tableau de bord de chacun d'eux.
    ['reunion', 'prochaine_date', 'TEXT'],
    ['reunion', 'prochaine_heure', 'TEXT'],
    ['reunion', 'prochain_lieu', 'TEXT'],
    ['reunion', 'prochaine_qui', 'TEXT'],
    // UNE ACTION NAÎT D'UN POINT PRÉCIS. Sans ce lien, le procès-verbal met
    // toutes les décisions en bloc à la fin, et l'on ne sait plus laquelle
    // répondait à quelle discussion.
    ['tache', 'point_id', 'INTEGER REFERENCES reunion_point(id)'],
  ]) {
    const colonnes = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!colonnes.includes(colonne)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${decl}`);
    }
  }

  // ── REPRISE DE L'EXISTANT ──────────────────────────────────────────────
  //
  // Les réunions déjà encodées portent leur ordre du jour dans un champ libre,
  // une ligne par point : c'est exactement la matière des points. On la reprend
  // une fois, pour que rien de ce qui a été saisi ne disparaisse de l'écran.
  // Les notes de séance, elles, restent où elles sont — les découper à la
  // machine reviendrait à deviner.
  const aReprendre = db.prepare(`
    SELECT id, ordre_du_jour FROM reunion
     WHERE COALESCE(ordre_du_jour, '') <> ''
       AND id NOT IN (SELECT reunion_id FROM reunion_point)
  `).all();
  const poser = db.prepare(
    'INSERT INTO reunion_point (reunion_id, ordre, intitule) VALUES (?,?,?)');
  for (const r of aReprendre) {
    String(r.ordre_du_jour).split('\n').map(l => l.trim()).filter(Boolean)
      .forEach((ligne, i) => poser.run(r.id, i, ligne));
  }

  // Même principe pour les responsables : la tâche qui en portait un seul le
  // garde, et il devient le premier de son équipage.
  db.exec(`
    INSERT INTO tache_personne (tache_id, user_id, professeur_id, role, rang)
    SELECT t.id, t.responsable_user_id, t.responsable_professeur_id,
           t.responsable_role, 0
      FROM tache t
     WHERE (t.responsable_user_id IS NOT NULL
            OR t.responsable_professeur_id IS NOT NULL
            OR t.responsable_role IS NOT NULL)
       AND t.id NOT IN (SELECT tache_id FROM tache_personne)
  `);
}

export default migrerReunions;

/**
 * LE JOURNAL DES MODIFICATIONS — FICHES, PAE, RÉSULTATS ET NOTES (3.1.47,
 * Charles, 5 octobre 2026 : « je ne vois aucun geste de Florian ni de Mélina,
 * pourtant ils ont travaillé » ; le journal est « à faire »).
 *
 * Changer l'adresse d'un étudiant, lui ajouter ou retirer une unité, encoder
 * une note ne laissait AUCUNE trace : seize endroits du code écrivent des
 * notes, une trentaine touchent aux inscriptions. Les tracer un par un, c'est
 * en oublier un — et ce serait celui-là qui manquerait. Le journal s'écrit donc
 * DANS LA BASE, par des déclencheurs : tout geste y entre, quel que soit
 * l'écran, l'import ou la route qui le pose, et ceux qu'on écrira demain.
 *
 * L'AUTEUR est la personne connectée, lue par deux fonctions que le serveur
 * déclare à la base (`lucie_auteur()`, `lucie_auteur_id()`, db/index.js). Hors
 * requête — migration, tâche planifiée —, elles rendent null : on n'invente pas
 * de nom. Un script qui écrit directement dans ces tables doit déclarer ces
 * deux fonctions, sans quoi SQLite refuse l'écriture (« no such function ») —
 * jamais en silence.
 *
 * EN AJOUT SEUL : aucune route ne modifie ni n'efface ce journal.
 */
import db from '../db/index.js';

// Les colonnes de la fiche qui ne disent rien d'un geste.
// rn_norm se recalcule du numéro national, déjà tracé ; une photo n'est pas un texte à relire.
const FICHE_IGNOREES = new Set(['id', 'maj_le', 'cree_le', 'modifie_le', 'rn_norm']);
// Une valeur de journal se lit, elle ne se stocke pas en entier.
const court = v => `substr(CAST(${v} AS TEXT), 1, 500)`;

export function migrerJournalModifications(dbx = db) {
  dbx.exec(`
    CREATE TABLE IF NOT EXISTS journal_modification (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      le             TEXT NOT NULL DEFAULT (datetime('now')),
      par            TEXT,
      par_id         INTEGER,
      objet          TEXT NOT NULL,      -- fiche | pae | resultat | note
      geste          TEXT NOT NULL,      -- création, modification, ajout, retrait…
      etudiant_id    INTEGER,
      annee_scolaire TEXT,
      ue_num         INTEGER,
      code           TEXT,               -- le champ de la fiche, ou le code de la note
      avant          TEXT,
      apres          TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jm_etudiant ON journal_modification(etudiant_id, le);
    CREATE INDEX IF NOT EXISTS idx_jm_le ON journal_modification(le);
  `);
  const qui = `lucie_auteur(), lucie_auteur_id()`;
  const triggers = [];

  // La fiche : une ligne par champ changé.
  const cols = dbx.prepare('PRAGMA table_info(etudiant)').all()
    .filter(c => !FICHE_IGNOREES.has(c.name) && !/blob/i.test(c.type || '') && !/photo|image|signature/i.test(c.name))
    .map(c => c.name);
  for (const c of cols) {
    triggers.push(`CREATE TRIGGER jm_fiche_${c} AFTER UPDATE OF "${c}" ON etudiant
      WHEN OLD."${c}" IS NOT NEW."${c}"
      BEGIN INSERT INTO journal_modification (par, par_id, objet, geste, etudiant_id, code, avant, apres)
        VALUES (${qui}, 'fiche', 'modification', NEW.id, '${c}', ${court(`OLD."${c}"`)}, ${court(`NEW."${c}"`)}); END`);
  }
  triggers.push(`CREATE TRIGGER jm_fiche_creation AFTER INSERT ON etudiant
    BEGIN INSERT INTO journal_modification (par, par_id, objet, geste, etudiant_id, apres)
      VALUES (${qui}, 'fiche', 'création', NEW.id, COALESCE(NEW.nom, '') || ' ' || COALESCE(NEW.prenom, '')); END`);
  triggers.push(`CREATE TRIGGER jm_fiche_suppression AFTER DELETE ON etudiant
    BEGIN INSERT INTO journal_modification (par, par_id, objet, geste, etudiant_id, avant)
      VALUES (${qui}, 'fiche', 'suppression', OLD.id, COALESCE(OLD.nom, '') || ' ' || COALESCE(OLD.prenom, '')); END`);

  // Le PAE : une unité ajoutée ou retirée ; le résultat qui change.
  triggers.push(`CREATE TRIGGER jm_pae_ajout AFTER INSERT ON etudiant_inscription
    BEGIN INSERT INTO journal_modification (par, par_id, objet, geste, etudiant_id, annee_scolaire, ue_num, apres)
      VALUES (${qui}, 'pae', 'ajout', NEW.etudiant_id, NEW.annee_scolaire, NEW.ue_num, NEW.resultat); END`);
  triggers.push(`CREATE TRIGGER jm_pae_retrait AFTER DELETE ON etudiant_inscription
    BEGIN INSERT INTO journal_modification (par, par_id, objet, geste, etudiant_id, annee_scolaire, ue_num, avant)
      VALUES (${qui}, 'pae', 'retrait', OLD.etudiant_id, OLD.annee_scolaire, OLD.ue_num, OLD.resultat); END`);
  // Le résultat : chaque colonne de décision ou de points, sous son nom.
  const colsInscr = new Set(dbx.prepare('PRAGMA table_info(etudiant_inscription)').all().map(c => c.name));
  for (const c of ['resultat', 'points', 'mention', 'resultat_s1', 'resultat_s2', 'points_s1', 'points_s2'].filter(c => colsInscr.has(c))) {
    triggers.push(`CREATE TRIGGER jm_resultat_${c} AFTER UPDATE OF "${c}" ON etudiant_inscription
      WHEN OLD."${c}" IS NOT NEW."${c}"
      BEGIN INSERT INTO journal_modification (par, par_id, objet, geste, etudiant_id, annee_scolaire, ue_num, code, avant, apres)
        VALUES (${qui}, 'resultat', 'modification', NEW.etudiant_id, NEW.annee_scolaire, NEW.ue_num, '${c}', OLD."${c}", NEW."${c}"); END`);
  }

  // Les notes : posée, changée, effacée.
  const colsNote = new Set(dbx.prepare('PRAGMA table_info(etudiant_note_detail)').all().map(c => c.name));
  const parts = ['points', 'mention', 'non_evalue'].filter(c => colsNote.has(c));
  const val = t => `COALESCE(${t}.points${colsNote.has('mention') ? `, ${t}.mention` : ''}${colsNote.has('non_evalue') ? `, CASE WHEN ${t}.non_evalue = 1 THEN 'non évalué' END` : ''})`;
  const change = parts.map(c => `OLD.${c} IS NOT NEW.${c}`).join(' OR ');
  triggers.push(`CREATE TRIGGER jm_note_ajout AFTER INSERT ON etudiant_note_detail
    BEGIN INSERT INTO journal_modification (par, par_id, objet, geste, etudiant_id, annee_scolaire, ue_num, code, apres)
      VALUES (${qui}, 'note', 'encodage', NEW.etudiant_id, NEW.annee_scolaire, NEW.ue_num, NEW.type || ':' || NEW.code, ${val('NEW')}); END`);
  triggers.push(`CREATE TRIGGER jm_note_modif AFTER UPDATE ON etudiant_note_detail
    WHEN ${change}
    BEGIN INSERT INTO journal_modification (par, par_id, objet, geste, etudiant_id, annee_scolaire, ue_num, code, avant, apres)
      VALUES (${qui}, 'note', 'modification', NEW.etudiant_id, NEW.annee_scolaire, NEW.ue_num, NEW.type || ':' || NEW.code, ${val('OLD')}, ${val('NEW')}); END`);
  triggers.push(`CREATE TRIGGER jm_note_effacement AFTER DELETE ON etudiant_note_detail
    BEGIN INSERT INTO journal_modification (par, par_id, objet, geste, etudiant_id, annee_scolaire, ue_num, code, avant)
      VALUES (${qui}, 'note', 'effacement', OLD.etudiant_id, OLD.annee_scolaire, OLD.ue_num, OLD.type || ':' || OLD.code, ${val('OLD')}); END`);

  // Recréés à chaque démarrage : une colonne ajoutée à la fiche y entre d'elle-même.
  const existants = dbx.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'jm_%'").all();
  dbx.transaction(() => {
    for (const t of existants) dbx.exec(`DROP TRIGGER IF EXISTS "${t.name}"`);
    for (const sql of triggers) dbx.exec(sql);
  })();
}

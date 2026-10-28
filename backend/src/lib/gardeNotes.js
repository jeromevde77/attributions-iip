/**
 * UNE NOTE D'UNE SÉANCE CLOSE NE S'ÉCRIT PLUS, PAR AUCUNE PORTE (3.1.432, Charles,
 * 28 octobre 2026 : « vérifier qu'il n'y a pas pour une chose deux entrées »).
 *
 * Seul Mes cours refusait de proposer une note dans une séance close. La feuille de
 * notes, l'épreuve d'unité ou de cours, le détail de la grille du parcours, l'import
 * des notes et l'import du classeur écrivaient sans regarder : une note changée après
 * la délibération changeait en silence une décision déjà notifiée.
 *
 * LA RÈGLE — celle de `clotures()` (routes/mesCours.js) : la séance de la SESSION de la
 * note (« s2| » → 2, sinon 1) et de l'ORGANISATION de l'étudiant ; la ligne « unité
 * entière » ne compte que s'il n'existe aucune séance par organisation. Une séance de
 * REPRISE d'archives (`reprise = 1`) ne verrouille pas : l'historique se réimporte.
 * Une note reportée (`origine = 'report:…'`) a sa propre garde.
 *
 * DEUX ÉTAGES. Les écrans demandent `noteVerrouillee()` et refusent en le disant (409).
 * La base, elle, IGNORE l'écriture (comme pour les notes reportées) : un réimport du
 * classeur ne doit pas échouer en entier parce qu'une unité est close — il passe à côté
 * d'elle. Rouvrir la séance (direction, motif écrit) rend la main.
 */
import db from '../db/index.js';

const sessionDe = x => `(CASE WHEN ${x}.code LIKE 's2|%' THEN 2 ELSE 1 END)`;

/** La condition SQL « cette note est dans une séance close », sur NEW ou OLD. */
function close(x) {
  return `(COALESCE(${x}.origine, '') NOT LIKE 'report:%' AND EXISTS (
    SELECT 1 FROM deliberation_seance s
     WHERE s.ue_num = ${x}.ue_num AND s.annee_scolaire = ${x}.annee_scolaire
       AND s.session = ${sessionDe(x)} AND s.cloturee = 1 AND COALESCE(s.reprise, 0) = 0
       AND ((COALESCE(s.num_organisation, 0) > 0 AND s.num_organisation = (
              SELECT COALESCE(i.num_organisation, 0) FROM etudiant_inscription i
               WHERE i.etudiant_id = ${x}.etudiant_id AND i.annee_scolaire = ${x}.annee_scolaire
                 AND i.ue_num = ${x}.ue_num LIMIT 1))
         OR (COALESCE(s.num_organisation, 0) = 0 AND NOT EXISTS (
              SELECT 1 FROM deliberation_seance s2
               WHERE s2.ue_num = s.ue_num AND s2.annee_scolaire = s.annee_scolaire
                 AND s2.session = s.session AND COALESCE(s2.num_organisation, 0) > 0)))))`;
}

export function poserGardeNotes(dbx = db) {
  // Recréés à chaque démarrage : la règle peut évoluer, un déclencheur ancien ne doit pas rester.
  dbx.exec(`
    DROP TRIGGER IF EXISTS garde_note_close_ins;
    DROP TRIGGER IF EXISTS garde_note_close_maj;
    DROP TRIGGER IF EXISTS garde_note_close_supp;`);
  /* UNE COLONNE ABSENTE FERAIT ÉCHOUER TOUTE ÉCRITURE DE NOTE : un déclencheur se
     compile à son premier déclenchement, pas à sa création. On vérifie donc d'abord. */
  const cols = t => new Set(dbx.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name));
  const sea = cols('deliberation_seance'), note = cols('etudiant_note_detail'), ins = cols('etudiant_inscription');
  const manque = [['deliberation_seance', sea, ['session', 'num_organisation', 'cloturee', 'reprise']],
    ['etudiant_note_detail', note, ['origine', 'code']], ['etudiant_inscription', ins, ['num_organisation']]]
    .flatMap(([t, c, l]) => l.filter(x => !c.has(x)).map(x => `${t}.${x}`));
  if (manque.length) { console.error('[garde des notes] non posée, colonnes absentes :', manque.join(', ')); return false; }
  dbx.exec(`
    CREATE TRIGGER garde_note_close_ins BEFORE INSERT ON etudiant_note_detail
      WHEN ${close('NEW')} BEGIN SELECT RAISE(IGNORE); END;
    CREATE TRIGGER garde_note_close_maj BEFORE UPDATE OF points, mention ON etudiant_note_detail
      WHEN ${close('OLD')} BEGIN SELECT RAISE(IGNORE); END;
    CREATE TRIGGER garde_note_close_supp BEFORE DELETE ON etudiant_note_detail
      WHEN ${close('OLD')} AND EXISTS (SELECT 1 FROM etudiant WHERE id = OLD.etudiant_id)
      BEGIN SELECT RAISE(IGNORE); END;`);
  return true;
}

/** La même règle, pour les écrans : la séance close qui verrouille cette note, ou null. */
export function noteVerrouillee(etudId, annee, ueNum, code = 's1|') {
  try {
    const r = db.prepare(`SELECT ${close('n')} AS close FROM (SELECT ? AS etudiant_id, ? AS annee_scolaire,
      ? AS ue_num, ? AS code, NULL AS origine) n`).get(Number(etudId), annee, Number(ueNum), String(code || ''));
    return r?.close ? { session: String(code || '').startsWith('s2|') ? 2 : 1 } : null;
  } catch { return null; }
}

export const MESSAGE_CLOSE = (ue, s) => `La séance de ${s === 2 ? 'seconde' : 'première'} session de l'UE ${ue} est close : `
  + 'ses notes ne se modifient plus. La direction peut rouvrir la séance, avec un motif écrit.';

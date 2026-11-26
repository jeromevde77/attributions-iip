/* (CS) LES SECTIONS EN PLUS D'UN ÉTUDIANT (3.5.734, Charles, 26 novembre 2026 : « pouvoir facilement ajouter une section à un
   étudiant ; ils doivent pouvoir avoir ATNUP et psychomot » ; tranché : une section principale — `section_rattachement`, la fiche
   et les documents généraux — et des sections EN PLUS, qui comptent dans les listes, les filtres, les examens, les présences, le
   périmètre des coordinations, la composition du PAE et les pièces de section). Fiche → Identité → « + Ajouter une section ». */
import db from '../db/index.js';

export function migrerSectionsPlus(base = db) {
  base.exec(`CREATE TABLE IF NOT EXISTS etudiant_section_plus (
    etudiant_id INTEGER NOT NULL, section TEXT NOT NULL, depuis TEXT, par TEXT, le TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (etudiant_id, section))`);
}
try { migrerSectionsPlus(); } catch (e) { console.error('[sections en plus] migration', e.message); }

/** Les sections en plus d'un étudiant (sans la principale). */
export function sectionsPlus(etudId) {
  try { return db.prepare('SELECT section FROM etudiant_section_plus WHERE etudiant_id = ? ORDER BY section').all(Number(etudId)).map(x => x.section); }
  catch { return []; }
}

/** L'étudiant est-il (aussi) de cette section par une section en plus ? */
export function aLaSectionEnPlus(etudId, section) {
  if (!section) return false;
  try { return !!db.prepare('SELECT 1 FROM etudiant_section_plus WHERE etudiant_id = ? AND section = ?').get(Number(etudId), section); }
  catch { return false; }
}

export function ajouterSection(etudId, section, { depuis = null, par = null } = {}) {
  db.prepare(`INSERT INTO etudiant_section_plus (etudiant_id, section, depuis, par) VALUES (?,?,?,?)
    ON CONFLICT(etudiant_id, section) DO UPDATE SET depuis = COALESCE(excluded.depuis, depuis), par = excluded.par, le = datetime('now')`)
    .run(Number(etudId), section, depuis, par);
}
export function retirerSection(etudId, section) {
  return db.prepare('DELETE FROM etudiant_section_plus WHERE etudiant_id = ? AND section = ?').run(Number(etudId), section).changes;
}
export function listeSectionsPlus(etudId) {
  try { return db.prepare('SELECT section, depuis, par, le FROM etudiant_section_plus WHERE etudiant_id = ? ORDER BY section').all(Number(etudId)); }
  catch { return []; }
}

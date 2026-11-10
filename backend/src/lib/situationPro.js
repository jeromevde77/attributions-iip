/**
 * LA SITUATION PROFESSIONNELLE D'UN ÉTUDIANT, PAR ANNÉE (3.5.287, Charles : « le type de titre d'entrée par section dans les
 * statistiques, et aussi si chômeur, travailleur… » ; tranché : une situation par année). Liste fermée : SITUATIONS_PRO
 * (lib/profilEtudiant.js). Écrite depuis la fiche → Identité ; lue par les chiffres clés (lib/chiffresCles.js).
 */
import db from '../db/index.js';
import { SITUATIONS_PRO } from './profilEtudiant.js';

let pret = false;
export function migrerSituationPro() {
  if (pret) return;
  db.exec(`CREATE TABLE IF NOT EXISTS etudiant_situation_pro (
    etudiant_id INTEGER NOT NULL, annee_scolaire TEXT NOT NULL, situation TEXT NOT NULL,
    maj_par TEXT, maj_le TEXT DEFAULT (datetime('now')), PRIMARY KEY (etudiant_id, annee_scolaire))`);
  pret = true;
}
export function situationDe(etudId, annee) {
  migrerSituationPro();
  return db.prepare('SELECT situation, maj_par, maj_le FROM etudiant_situation_pro WHERE etudiant_id = ? AND annee_scolaire = ?').get(Number(etudId), annee) || null;
}
/** Poser (ou effacer, si vide) la situation d'une année. */
export function poserSituation(etudId, annee, situation, par) {
  migrerSituationPro();
  if (!/^\d{4}-\d{4}$/.test(String(annee || ''))) return { erreur: 'Année requise.' };
  const v = String(situation || '').trim();
  if (!v) { db.prepare('DELETE FROM etudiant_situation_pro WHERE etudiant_id = ? AND annee_scolaire = ?').run(Number(etudId), annee); return { situation: null }; }
  if (!SITUATIONS_PRO.some(([c]) => c === v)) return { erreur: 'Situation inconnue.' };
  db.prepare(`INSERT INTO etudiant_situation_pro (etudiant_id, annee_scolaire, situation, maj_par) VALUES (?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire) DO UPDATE SET situation = excluded.situation, maj_par = excluded.maj_par, maj_le = datetime('now')`)
    .run(Number(etudId), annee, v, par || null);
  return { situation: v };
}
/** Toutes les situations d'une année : { [etudiant_id]: code }. */
export function situationsDeLAnnee(annee) {
  migrerSituationPro();
  return Object.fromEntries(db.prepare('SELECT etudiant_id, situation FROM etudiant_situation_pro WHERE annee_scolaire = ?').all(annee).map(x => [x.etudiant_id, x.situation]));
}

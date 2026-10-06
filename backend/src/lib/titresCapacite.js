// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Les titres de capacité d'un membre du personnel
//
// Écrits par l'administration (fiche du personnel) ou proposés par le
// professeur dans « Ma fiche » puis appliqués à la validation de sa demande :
// une seule écriture pour les deux chemins.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';

/** Une liste de titres réduite à ce qui compte, dans l'ordre : sert à comparer
 *  la proposition d'un professeur à l'existant, et à écrire. */
export function normaliserTitres(titres) {
  return (Array.isArray(titres) ? titres : [])
    .map(t => ({ date_obtention: t?.date_obtention || null,
      intitule: String(t?.intitule || '').trim() || null,
      delivre_par: String(t?.delivre_par || '').trim() || null }))
    .filter(t => t.intitule || t.delivre_par || t.date_obtention);
}
export function ecrireTitres(profId, titres) {
  db.transaction(() => {
    db.prepare('DELETE FROM titre_capacite WHERE professeur_id = ?').run(profId);
    const ins = db.prepare(
      'INSERT INTO titre_capacite (professeur_id, date_obtention, intitule, delivre_par, ordre) VALUES (?,?,?,?,?)'
    );
    normaliserTitres(titres).forEach((t, i) => ins.run(profId, t.date_obtention, t.intitule, t.delivre_par, i));
  })();
}

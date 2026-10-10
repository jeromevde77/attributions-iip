import db from '../db/index.js';

/*
 * LE PRIMO-INSCRIT — UNE SEULE DÉFINITION (3.1.268, Charles, 10 octobre 2026 :
 * « un filtre primo et un badge — utile dans toutes les fenêtres où il y a des
 * étudiants »). Primo = aucune trace, inscription ou valorisation, dans une année
 * antérieure. Le matricule n'est qu'un indice ; l'historique fait foi. La même
 * règle était recopiée trois fois (liste des étudiants, PAE, générateur de listes).
 */
export function anciensAvant(annee) {
  return new Set([
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_inscription WHERE annee_scolaire < ?').all(annee).map(x => x.etudiant_id),
    ...db.prepare('SELECT DISTINCT etudiant_id FROM etudiant_valorisation WHERE annee_scolaire < ?').all(annee).map(x => x.etudiant_id),
  ]);
}

/** Ajoute `primo: true|false` à chaque étudiant d'une liste (champ `id`). */
export function marquerPrimo(liste, annee, cle = 'id') {
  const anciens = anciensAvant(annee);
  for (const e of liste) e.primo = !anciens.has(e[cle]);
  return liste;
}

/**
 * UN PROFESSEUR, UNE FICHE (3.1.436). La contrainte `UNIQUE(nom, prenom)` et les
 * recherches du recrutement comparaient à l'identique : « Dupont Marie » et « DUPONT
 * Marie » faisaient deux fiches, et la charge, les contrats et les attributions se
 * partageaient entre elles en silence. Une seule recherche, casse, accents, espaces et
 * traits d'union ignorés.
 */
import db from '../db/index.js';

const cle = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

/** La fiche existante de cette personne, ou null. */
export function professeurExistant(nom, prenom) {
  const n = cle(nom), p = cle(prenom);
  if (!n) return null;
  return db.prepare('SELECT id, nom, prenom FROM professeur').all()
    .find(x => cle(x.nom) === n && cle(x.prenom) === p) || null;
}

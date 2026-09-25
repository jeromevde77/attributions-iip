/**
 * LES SEPT ÉTATS DE LUCIE — écrits une fois.
 *
 * Étude du 25 septembre 2026, validée par Charles : un même état se dessinait
 * de quinze façons (liseré, fond, contour, texte coloré, aplat) et en cinq
 * verts. Il n'y a plus qu'une forme — le bloc d'état de `index.css` — et
 * qu'une liste d'états, celle-ci.
 *
 *   reussi        acquis, validé, fait
 *   faveur        réussi par octroi du Conseil — violet ET cadeau
 *   disponible    ouvert, en cours, à faire
 *   indisponible  pas maintenant : fermé, en attente d'un prérequis, archivé
 *   surveiller    un geste est attendu bientôt : ajourné, échéance proche
 *   corriger      un geste est attendu maintenant : refus, erreur, bloquant
 *   neutre        un chiffre sans état (et « fort », sa variante marine)
 *
 * L'ÉTAT DÉPEND DE CE QUE L'ÉCRAN REGARDE : en délibération, une UE refusée
 * est « à corriger » ; dans le parcours, la même UE est « disponible », avec la
 * mention « à reprendre ». Les nuances (S2, VA, D, sous réserve) s'écrivent,
 * elles ne se colorent pas — sauf la faveur, qui doit se voir de loin.
 */

export const ETATS = {
  reussi:       { libelle: 'Réussi',         jeton: '--c-reussi' },
  faveur:       { libelle: 'Réussi par faveur', jeton: '--c-faveur' },
  disponible:   { libelle: 'Disponible',     jeton: '--c-disponible' },
  indisponible: { libelle: 'Pas maintenant', gris: true },
  surveiller:   { libelle: 'À surveiller',   jeton: '--c-attente' },
  corriger:     { libelle: 'À corriger',     jeton: '--c-refuse' },
  neutre:       { libelle: '',               gris: true },
};

/**
 * Les trois teintes d'un état, en valeurs CSS — pour ce qui ne peut pas porter
 * la classe `.bloc-etat` : un SVG, un style calculé. Elles se lisent dans
 * `style={{ fill: … }}`, jamais dans un attribut `fill=` (où `var()` ne
 * s'évalue pas).
 */
export function teintes(etat) {
  if (etat === 'indisponible') return { rail: '#C3CAD6', fond: '#F4F5F7', bord: '#E3E6EB', texte: '#7A879E' };
  const d = ETATS[etat];
  if (!d?.jeton) return { rail: '#D8DCE4', fond: '#FFFFFF', bord: '#D8DCE4', texte: '#1B2B4B' };
  const e = `var(${d.jeton})`;
  return {
    rail: e,
    fond: `color-mix(in srgb, ${e} 11%, #fff)`,
    bord: `color-mix(in srgb, ${e} 30%, #fff)`,
    texte: '#1B2B4B',
  };
}

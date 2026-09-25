/**
 * LES BLOCS D'ÉTUDES — une seule définition pour tous les écrans.
 *
 * BA1 orange, BA2 bleu clair, BA3 marine (CLAUDE.md, « le repère de bloc »),
 * et l'or pour l'épreuve intégrée, qui n'appartient qu'à elle. Chaque écran
 * avait sa palette — quatre copies d'une même convention, dont une en
 * `#F97316 / #60A5FA / #1E3A8A` —, et c'est l'écran qu'on regarde le moins
 * qui aurait gardé l'ancienne teinte.
 */
export const COULEUR_BLOC = { BA1: '#E8890C', BA2: '#7FB3D5', BA3: '#1B2B4B', BA4: '#6E48A6', BA5: '#9D4A38' };
export const OR_EPREUVE = '#C9A84C';

/** « ba2 », « BA 2 », « BA2 » → « BA2 » ; autre chose → null. */
export function blocDe(niv) {
  const m = /^\s*BA\s*(\d+)\s*$/i.exec(String(niv || ''));
  return m ? `BA${m[1]}` : null;
}
export function couleurBloc(niv) {
  const b = blocDe(niv);
  return b ? (COULEUR_BLOC[b] || '#94A3B8') : null;
}
/** Le rang d'un bloc, pour trier : BA1 avant BA2, l'inconnu en dernier. */
export function rangBloc(niv) {
  const b = blocDe(niv);
  return b ? Number(b.slice(2)) : 99;
}

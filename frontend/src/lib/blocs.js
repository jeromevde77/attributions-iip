/**
 * LES BLOCS D'ÉTUDES — une seule définition pour tous les écrans.
 *
 * BA1 orange, BA2 bleu clair, BA3 marine (CLAUDE.md, « le repère de bloc »),
 * et l'or pour l'épreuve intégrée, qui n'appartient qu'à elle. Chaque écran
 * avait sa palette — quatre copies d'une même convention, dont une en
 * `#F97316 / #60A5FA / #1E3A8A` —, et c'est l'écran qu'on regarde le moins
 * qui aurait gardé l'ancienne teinte.
 */
// Réglables depuis Configuration → Thèmes et couleurs (2.12.194) : ce sont des
// valeurs CSS, à lire dans un `style`, jamais dans un attribut SVG.
export const COULEUR_BLOC = { BA1: 'var(--c-ba1, var(--c-attente))', BA2: 'var(--c-ba2, var(--c-disponible))',
  BA3: 'var(--c-ba3, var(--c-principal))', BA4: 'var(--c-disponible)', BA5: 'var(--c-refuse)' };
export const OR_EPREUVE = 'var(--c-epreuve, var(--c-attente))';

/** « ba2 », « BA 2 », « BA2 » → « BA2 » ; « BE1 » (même repère : CLAUDE.md,
 *  « BA1/BE1 orange ») → « BA1 » ; autre chose → null. */
export function blocDe(niv) {
  const m = /^\s*B[AE]\s*(\d+)\s*$/i.exec(String(niv || ''));
  return m ? `BA${m[1]}` : null;
}
export function couleurBloc(niv) {
  const b = blocDe(niv);
  return b ? (COULEUR_BLOC[b] || 'var(--c-disponible)') : null;
}
/** Le rang d'un bloc, pour trier : BA1 avant BA2, l'inconnu en dernier. */
export function rangBloc(niv) {
  const b = blocDe(niv);
  return b ? Number(b.slice(2)) : 99;
}

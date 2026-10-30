/**
 * LA VIERGE DANS LE LOGO (3.1.476, Charles, 30 octobre 2026 : « adapter le logo pour que la constellation de la
 * Vierge y soit — mon héritage, je suis Vierge ; un code secret, en fait »). Le réseau pâle derrière le L n'était
 * qu'un semis de points ; ce sont désormais les étoiles de la Vierge, à leur place relative dans le ciel
 * (ascension droite vers la gauche, déclinaison vers le haut), ramenées dans l'angle du L. Spica (α), la plus
 * brillante, porte la teinte. Le L reste ce qu'on voit ; qui sait, reconnaît.
 *
 * Coordonnées dans l'espace du logo de la barre (viewBox 0 0 140 44, le L va de (12,6) à (12,32) puis (42,32)).
 * Un seul tracé pour les trois dessins : la barre, la page de connexion, l'illustration du mode d'emploi.
 * NE PAS L'ÉCRIRE DANS UN DOCUMENT DESTINÉ À L'ÉCOLE : c'est un secret.
 */
export const ETOILES = {
  mu: [15, 22.9], iota: [19.9, 23.2], tau: [22.5, 14.5], zeta: [27.4, 16.4], spica: [29.1, 29.1],
  theta: [31.9, 22.6], vindemiatrix: [33.3, 4], delta: [34.5, 12.6], porrima: [37.1, 18], eta: [41, 17.3],
  beta: [46.3, 14.4], nu: [47.2, 9.1],
};
// Les traits de la figure : la tête (ν β η), le corps (γ δ ε), la main qui tient l'épi (γ θ Spica), la robe (δ ζ τ, ζ ι μ).
export const TRAITS = [
  ['nu', 'beta'], ['beta', 'eta'], ['eta', 'porrima'], ['porrima', 'delta'], ['delta', 'vindemiatrix'],
  ['porrima', 'theta'], ['theta', 'spica'], ['delta', 'zeta'], ['zeta', 'spica'], ['zeta', 'tau'],
  ['zeta', 'iota'], ['iota', 'mu'],
];
// Une magnitude grossière, pour la taille des points : Spica d'abord, puis Porrima, Vindemiatrix, Zavijava.
export const ECLAT = { spica: 1, porrima: .75, vindemiatrix: .7, beta: .6, delta: .6, eta: .5, zeta: .5 };

/* L'ORDRE D'APPARITION (3.1.478, Charles : « commence par rien ; la première étoile apparaît, puis les autres ;
   puis les liens qui font apparaître le L de Lucie »). Spica d'abord — la plus brillante —, puis on remonte la
   figure : la main et le corps, la tête, la robe. */
export const ORDRE_APPARITION = ['spica', 'theta', 'porrima', 'eta', 'beta', 'nu', 'delta', 'vindemiatrix', 'zeta', 'tau', 'iota', 'mu'];
/* LE RYTHME, en secondes : un temps de vide, Spica qui s'attarde, les étoiles, les liens, puis le L. */
export const CHRONO = (() => {
  const vide = 0.3, apresSpica = 0.5, pasEtoile = 0.15, pasLien = 0.1, pause = 0.2, dureeL = 1;
  const etoile = i => (i === 0 ? vide : vide + apresSpica + (i - 1) * pasEtoile);
  const finEtoiles = etoile(ORDRE_APPARITION.length - 1) + 0.4;
  const lien = i => finEtoiles + i * pasLien;
  const L = lien(TRAITS.length - 1) + 0.5 + pause;
  return { etoile, lien, L, dureeL, fin: L + dureeL + 0.2 };
})();

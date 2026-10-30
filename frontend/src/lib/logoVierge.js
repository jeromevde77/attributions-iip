/**
 * LA VIERGE DANS LE LOGO (3.1.476 ; refaite en 3.1.480, Charles : « les extrémités du L doivent être des étoiles
 * de la Vierge — tu peux changer l'orientation ; calcule et fais »). Un code secret : qui sait, reconnaît.
 *
 * LE CALCUL. Projection des étoiles (ascension droite, déclinaison J2000) sur le plan du ciel ; recherche, parmi
 * tous les triplets, de trois étoiles qui forment un angle droit dont les bras ont les proportions du L — sans
 * MIROIR (la figure garde son sens, seule l'orientation change). Retenu : τ Vir en HAUT du L, SPICA (α, la plus
 * brillante) au COIN, ZANIAH (η) au BOUT — angle 93°, ramené à 90° par un cisaillement de 3°, bras vertical de
 * 24,5 au lieu de 26 (le L est très légèrement plus bas). Tombent alors DANS l'angle du L : Vindemiatrix (ε),
 * Heze (ζ), Minelauva (δ), θ et Porrima (γ), ces deux dernières au ras de la barre du bas. La tête (β, ν, ο),
 * qui passerait sur le mot « Lucie », et ι, μ, κ, λ, à gauche du L, restent hors du logo : il doit rester simple.
 *
 * Coordonnées dans l'espace du logo de la barre (viewBox 0 0 140 44). Un seul tracé pour les trois dessins :
 * la barre, la page de connexion, l'illustration du mode d'emploi.
 * NE PAS L'ÉCRIRE DANS UN DOCUMENT DESTINÉ À L'ÉCOLE : c'est un secret.
 */
export const ETOILES = {
  tau: [12, 7.5], spica: [12, 32], eta: [42, 32],
  vindemiatrix: [39.4, 8], zeta: [18.7, 16.2], delta: [34.5, 19.2], theta: [22, 27.7], porrima: [34.5, 28.4],
};
/** Les trois extrémités du L : des étoiles. */
export const L = { haut: 'tau', coin: 'spica', bout: 'eta' };
export const POINTS_L = [ETOILES.tau, ETOILES.spica, ETOILES.eta];
/** Les traits de la figure (hors les deux barres du L, qui sont τ–Spica et Spica–Zaniah). */
export const TRAITS = [
  ['eta', 'porrima'], ['porrima', 'delta'], ['delta', 'vindemiatrix'], ['porrima', 'theta'],
  ['theta', 'spica'], ['delta', 'zeta'], ['zeta', 'tau'],
];
// Une magnitude grossière, pour la taille des points.
export const ECLAT = { spica: 1, porrima: .75, vindemiatrix: .7, delta: .6, eta: .55, zeta: .5, tau: .45, theta: .4 };

/* L'ORDRE D'APPARITION (3.1.478, Charles : « commence par rien ; la première étoile apparaît, puis les autres ;
   puis les liens qui font apparaître le L de Lucie »). Spica d'abord ; puis on remonte la figure. */
export const ORDRE_APPARITION = ['spica', 'theta', 'porrima', 'eta', 'delta', 'vindemiatrix', 'zeta', 'tau'];
/** Les étoiles qui ne sont pas au L : après l'animation, elles s'effacent presque (« que le logo reste simple »). */
export const DISCRETES = ORDRE_APPARITION.filter(k => !Object.values(L).includes(k));

/* LE RYTHME, en secondes : un temps de vide, Spica qui s'attarde, les étoiles, les liens, puis le L ; enfin la
   figure s'efface presque et le L reste. */
export const CHRONO = (() => {
  const vide = 0.3, apresSpica = 0.5, pasEtoile = 0.18, pasLien = 0.14, pause = 0.2, dureeL = 1;
  const etoile = i => (i === 0 ? vide : vide + apresSpica + (i - 1) * pasEtoile);
  const finEtoiles = etoile(ORDRE_APPARITION.length - 1) + 0.4;
  const lien = i => finEtoiles + i * pasLien;
  const Ldebut = lien(TRAITS.length - 1) + 0.5 + pause;
  const fin = Ldebut + dureeL + 0.2;
  return { etoile, lien, L: Ldebut, dureeL, fin, effacement: fin + 0.6 };
})();
/** Ce qui reste de la figure une fois le L posé. */
export const RESTE = { etoile: 0.28, trait: 0.14 };

/**
 * LA VIERGE DANS LE LOGO (3.1.476 ; refaite en 3.1.480, Charles : « les extrémités du L doivent être des étoiles
 * de la Vierge — tu peux changer l'orientation ; calcule et fais »). Un code secret : qui sait, reconnaît.
 *
 * LE CALCUL. Projection des étoiles (ascension droite, déclinaison J2000) sur le plan du ciel ; recherche, parmi
 * tous les triplets, de trois étoiles qui forment un angle droit dont les bras ont les proportions du L — sans
 * MIROIR (la figure garde son sens, seule l'orientation change). Retenu : τ Vir en HAUT du L, SPICA (α, la plus
 * brillante) au COIN, ZANIAH (η) au BOUT — angle 93°, ramené à 90° par un cisaillement de 3°, bras vertical de
 * 24,5 au lieu de 26 (le L est très légèrement plus bas). Depuis 3.1.485, TOUTE la figure des cartes du ciel est
 * dessinée (douze étoiles, mêmes projection et cisaillement) : ν à droite, κ, ι, μ et 109 à gauche du L.
 *
 * Coordonnées dans l'espace du logo de la barre (viewBox 0 0 140 44). Un seul tracé pour les trois dessins :
 * la barre, la page de connexion, l'illustration du mode d'emploi.
 * NE PAS L'ÉCRIRE DANS UN DOCUMENT DESTINÉ À L'ÉCOLE : c'est un secret.
 */
export const ETOILES = {
  tau: [12, 7.5], spica: [12, 32], eta: [42, 32],
  nu: [60.1, 29.8], porrima: [34.5, 28.4], kappa: [-3.1, 21], iota: [-0.1, 14.4], mu: [-9.8, 7.7],
  zeta: [18.7, 16.2], v109: [-3.4, -3.9], delta: [34.5, 19.2], vindemiatrix: [39.4, 8],
};
/** Les trois extrémités du L : des étoiles. */
export const L = { haut: 'tau', coin: 'spica', bout: 'eta' };
export const POINTS_L = [ETOILES.tau, ETOILES.spica, ETOILES.eta];
/* LA VRAIE FIGURE DE LA VIERGE (3.1.485, Charles : « ce n'est pas la forme de la Vierge » ; choisi : « la vraie figure
   + le L »). Les lignes sont celles des cartes du ciel modernes (Stellarium, culture « modern », CON Vir) :
   ν–η–γ–Spica–κ–ι–μ · Spica–ζ–τ–109 · ζ–δ–ε · δ–γ. Le L se trace PAR-DESSUS, sur τ, Spica et Zaniah. */
export const TRAITS = [
  ['nu', 'eta'], ['eta', 'porrima'], ['porrima', 'spica'], ['spica', 'kappa'], ['kappa', 'iota'], ['iota', 'mu'],
  ['spica', 'zeta'], ['zeta', 'tau'], ['tau', 'v109'], ['zeta', 'delta'], ['delta', 'vindemiatrix'], ['delta', 'porrima'],
];
// Une magnitude grossière, pour la taille des points.
export const ECLAT = { spica: 1, porrima: .75, vindemiatrix: .7, delta: .6, eta: .55, zeta: .5, tau: .45, nu: .4,
  kappa: .4, iota: .45, mu: .45, v109: .45 };

/* L'ORDRE D'APPARITION (3.1.478, Charles : « commence par rien ; la première étoile apparaît, puis les autres ;
   puis les liens qui font apparaître le L de Lucie »). Spica d'abord ; puis on parcourt la figure. */
export const ORDRE_APPARITION = ['spica', 'porrima', 'eta', 'nu', 'delta', 'vindemiatrix', 'zeta', 'tau', 'v109', 'kappa', 'iota', 'mu'];
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
export const RESTE = { etoile: 0.42, trait: 0.3 };   // 3.1.485 : la figure doit se reconnaître

/* LES ÉTOILES DU MODE D'EMPLOI (3.1.487, Charles : « chaque étoile devient un des thèmes du mode d'emploi »). Dix-huit
   chapitres pour douze étoiles dans la figure : six autres étoiles RÉELLES de la Vierge, hors des lignes des cartes du
   ciel (β, ο, θ, λ, ρ, φ), mêmes projection et cisaillement (scratchpad vierge3.py). Elles ne paraissent que dans le
   guide ; le logo de la barre et de la connexion garde la figure seule. */
export const ETOILES_HORS = {
  beta: [53.9, 35.2], omicron: [55.5, 22.7], theta: [22, 27.7], lambda: [-8.5, 24.1], rho: [45.1, 13.2], phi: [-0.8, 6.4],
};
export const ECLAT_HORS = { beta: .5, omicron: .4, theta: .4, lambda: .35, rho: .3, phi: .35 };
/** Une étoile par chapitre, dans l'ordre des chapitres : la figure d'abord (Spica au chapitre 1), puis les six autres. */
export const ETOILES_GUIDE = [...ORDRE_APPARITION, 'theta', 'beta', 'omicron', 'rho', 'phi', 'lambda'];
export const positionEtoile = k => ETOILES[k] || ETOILES_HORS[k];

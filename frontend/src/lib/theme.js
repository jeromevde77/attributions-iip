import { useEffect, useState } from 'react';

/**
 * DEUX MODES POUR LES MENUS — et un seul endroit qui le sait.
 *
 * Le rail et la barre du haut étaient marine, quoi qu'il arrive : un bloc
 * sombre posé sur une application claire. Deux partis s'offrent, et ils se
 * valent — l'un et l'autre sont justes, ce qui serait faux serait de les
 * mélanger :
 *
 *  · CLAIR — les menus sont un gris pâle, presque le fond de la page, tenus
 *    par un filet plutôt que par un aplat. Rien n'y attire l'œil, et c'est le
 *    but : le travail est au centre, pas dans la navigation.
 *
 *  · SOMBRE — les menus sont marine, comme aujourd'hui. Le contraste porte la
 *    structure : on sait toujours où l'on est.
 *
 * DANS LES DEUX CAS, LA COULEUR EST UNE DÉPENSE. Elle ne sert qu'à ce qui doit
 * être vu : la rubrique ouverte, une alerte, un compteur. Une icône qui n'a
 * rien à signaler reste grise — sinon plus rien ne signale, et c'est exactement
 * ce qu'on reproche aux interfaces chargées.
 *
 * Le mode s'écrit sur la racine du document (« data-mode »), d'où toutes les
 * variables de couleur des menus découlent : un composant ne connaît jamais le
 * mode, il lit ses jetons.
 */
const CLE = 'lucie.mode';
/* LE THÈME DE CHACUN (3.5.037, Charles, 1er novembre 2026 : « que TOUT le monde puisse, non pas gérer la mise en page,
 * mais avoir le choix entre des thèmes : Maison IIP, Sombre, Métal, Pastel »). Un choix PERSONNEL, gardé dans ce
 * navigateur : il se pose PAR-DESSUS les couleurs de l'école (Configuration → Thèmes et couleurs), qui ne changent pas.
 * « ecole » = les couleurs de l'école telles que la direction les a réglées (la Maison IIP par défaut). Les menus sont
 * marine (mode « sombre ») avec le thème Sombre seulement. */
const CLE_THEME = 'lucie.theme';
export const THEMES_PERSO = ['ecole', 'sombre', 'metal', 'pastel', 'nouveau'];
const abonnes = new Set();

function lireTheme() {
  try {
    const t = localStorage.getItem(CLE_THEME);
    if (THEMES_PERSO.includes(t)) return t;
    return localStorage.getItem(CLE) === 'sombre' ? 'sombre' : 'ecole';   // l'ancien bouton lune
  } catch { return 'ecole'; }
}

let theme = lireTheme();
let mode = theme === 'sombre' ? 'sombre' : 'clair';

function poser(v) {
  try { document.documentElement.dataset.mode = v; document.documentElement.dataset.theme = theme; } catch { /* rendu serveur */ }
}
poser(mode);

export function modeActuel() { return mode; }
export function themeActuel() { return theme; }

export function choisirTheme(t) {
  if (!THEMES_PERSO.includes(t)) return;
  theme = t; mode = t === 'sombre' ? 'sombre' : 'clair';
  try { localStorage.setItem(CLE_THEME, t); localStorage.setItem(CLE, mode); } catch { /* navigation privée */ }
  poser(mode);
  for (const f of abonnes) f(mode);
  for (const f of abonnesTheme) f(theme);
  import('./couleurs.js').then(m => m.chargerCouleurs()).catch(() => {});
}

export function basculerMode() { choisirTheme(theme === 'sombre' ? 'ecole' : 'sombre'); }

const abonnesTheme = new Set();
export function useTheme() {
  const [v, setV] = useState(theme);
  useEffect(() => { abonnesTheme.add(setV); setV(theme); return () => abonnesTheme.delete(setV); }, []);
  return v;
}

export function useMode() {
  const [v, setV] = useState(mode);
  useEffect(() => {
    abonnes.add(setV);
    setV(mode);
    return () => abonnes.delete(setV);
  }, []);
  return v;
}

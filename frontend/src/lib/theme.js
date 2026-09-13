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
const abonnes = new Set();

function lire() {
  try {
    const v = localStorage.getItem(CLE);
    return v === 'sombre' ? 'sombre' : 'clair';
  } catch { return 'clair'; }
}

let mode = lire();

function poser(v) {
  try { document.documentElement.dataset.mode = v; } catch { /* rendu serveur */ }
}
poser(mode);

export function modeActuel() { return mode; }

export function basculerMode() {
  mode = mode === 'sombre' ? 'clair' : 'sombre';
  try { localStorage.setItem(CLE, mode); } catch { /* navigation privée */ }
  poser(mode);
  for (const f of abonnes) f(mode);
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

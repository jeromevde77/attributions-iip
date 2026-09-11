import { useEffect, useState } from 'react';

/**
 * LE RAIL ÉPINGLÉ — ouvert pour de bon, et le contenu se décale avec lui.
 *
 * Deux gestes, et ils ne font pas la même chose :
 *
 *  · LE SURVOL est un coup d'œil. Le rail s'ouvre PAR-DESSUS le contenu, rien
 *    ne bouge. On lit un libellé, on ressort, la page n'a pas tressailli.
 *    Décaler la page au survol la ferait sauter de cent soixante-seize pixels
 *    chaque fois qu'on frôle le bord gauche sans l'avoir demandé — sur une
 *    grille de délibération, les colonnes se replient et la ligne qu'on lisait
 *    part ailleurs.
 *
 *  · L'ÉPINGLE est une décision. Le rail reste ouvert et le contenu se décale,
 *    parce qu'on l'a voulu. L'état se retient d'un écran à l'autre et d'un jour
 *    à l'autre : c'est une préférence de travail, pas un réglage à reprendre à
 *    chaque page.
 *
 * L'état vit hors de React — un seul rail est monté à la fois, mais il change
 * à chaque changement d'écran, et une préférence ne doit pas se perdre au
 * démontage.
 */
const CLE = 'lucie.rail.epingle';
const abonnes = new Set();

function lire() {
  try { return localStorage.getItem(CLE) === '1'; } catch { return false; }
}

let epingle = lire();

export function basculerEpingle() {
  epingle = !epingle;
  try { localStorage.setItem(CLE, epingle ? '1' : '0'); } catch { /* navigation privée */ }
  for (const f of abonnes) f(epingle);
}

export function useRailEpingle() {
  const [v, setV] = useState(epingle);
  useEffect(() => {
    abonnes.add(setV);
    setV(epingle);          // un écran monté après coup part du bon état
    return () => abonnes.delete(setV);
  }, []);
  return v;
}

/** La largeur que le rail occupe réellement, en rem. */
export const LARGEUR_RAIL = { replie: '4rem', ouvert: '15rem' };

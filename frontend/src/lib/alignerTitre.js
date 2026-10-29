import { useEffect } from 'react';

/**
 * LE HAUT DU CONTENU S'ALIGNE SUR LE HAUT DU RAIL (3.1.468, Charles, 29 octobre 2026 : « Étudiants et les
 * autres titres doivent être alignés avec le haut du rail »). Mesuré sur neuf écrans, le titre tombait entre
 * 3 et 88 px sous le haut du rail : chaque écran empile ses propres marges (gabarit, cadre, carte), et une
 * règle CSS écran par écran serait juste aujourd'hui et fausse demain. On ne compte pas les pixels, on les
 * MESURE (règle de la maison) : à l'ouverture d'un écran, le premier contenu visible de la zone de travail
 * est amené à la hauteur du haut du rail, par la marge haute de `main`. La mesure suit le chargement pendant
 * quelques secondes, puis se tait — rien ne doit bouger sous le doigt pendant qu'on travaille.
 */
const CIBLES = 'h1, h2, h3, .titre-ecran, p, label, button, input, select, textarea, table, .carte, .bloc-etat, .segments, img, svg';

function premierContenu(main) {
  let haut = Infinity;
  for (const el of main.querySelectorAll(CIBLES)) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (el.closest('[aria-hidden="true"], .fixed, [role="dialog"]')) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.position === 'fixed') continue;
    if (r.top + window.scrollY < haut) haut = r.top + window.scrollY;   // en coordonnées de la page
  }
  return haut === Infinity ? null : haut;
}

export function useAlignerSurLeRail(cle) {
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return undefined;
    let fin = false, attente = null;
    const ajuster = () => {
      attente = null;
      if (fin) return;
      const rail = [...document.querySelectorAll('aside')].find(a => getComputedStyle(a).position === 'fixed' && a.offsetWidth > 0);
      if (!rail || window.innerWidth < 640) { main.style.marginTop = ''; return; }
      const haut = premierContenu(main);
      if (haut == null) return;
      const ecart = haut - rail.getBoundingClientRect().top;   // le rail est fixe : son haut ne défile pas
      if (Math.abs(ecart) < 2) return;
      const actuel = parseFloat(main.style.marginTop) || 0;
      // Borné : jamais plus haut que ce que la page a de marge, jamais un saut absurde.
      main.style.marginTop = `${Math.max(-140, Math.min(60, actuel - ecart))}px`;
    };
    const plus_tard = () => { if (!attente) attente = requestAnimationFrame(ajuster); };
    const obs = new MutationObserver(plus_tard);
    let arret = null;
    // Une fenêtre d'observation : le chargement d'un écran dure ; au-delà, on ne déplace plus rien.
    const observer = duree => {
      obs.disconnect(); clearTimeout(arret);
      obs.observe(main, { childList: true, subtree: true });
      arret = setTimeout(() => obs.disconnect(), duree);
      plus_tard();
    };
    main.style.marginTop = '';
    observer(3500);
    // Une face choisie dans le rail change l'écran sans changer d'adresse : on mesure à nouveau.
    const surRail = e => { if (e.target.closest?.('aside')) observer(2000); };
    document.addEventListener('click', surRail, true);
    window.addEventListener('resize', plus_tard);
    return () => { fin = true; obs.disconnect(); clearTimeout(arret); document.removeEventListener('click', surRail, true);
      window.removeEventListener('resize', plus_tard); if (attente) cancelAnimationFrame(attente); };
  }, [cle]);
}

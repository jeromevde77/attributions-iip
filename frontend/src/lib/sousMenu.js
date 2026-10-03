import { useEffect, useSyncExternalStore } from 'react';

/**
 * LE SOUS-MENU GLISSÉ DE LA BARRE DU HAUT (Charles, 3 octobre 2026 : « comme
 * avec le rail… on ouvre un sous-menu glissé »). Un écran déclare ses faces —
 * ce qui était sa rangée d'onglets — et la barre les déplie à droite de la
 * rubrique ouverte. Un petit magasin de module : l'écran et la barre ne se
 * connaissent pas, comme le rail et ses outils.
 *
 * Déclaration : { titre, items: [{ key, label, icon?, actif }], onChoisir(key) }
 */
let courant = null;
const abonnes = new Set();
const prevenir = () => abonnes.forEach(f => f());

export function useSousMenu() {
  return useSyncExternalStore(f => { abonnes.add(f); return () => abonnes.delete(f); }, () => courant);
}

/** L'écran pose son sous-menu tant qu'il est monté ; il le retire en partant. */
export function useDeclarerSousMenu(declaration, deps) {
  useEffect(() => {
    courant = declaration;
    prevenir();
    return () => { if (courant === declaration) { courant = null; prevenir(); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* LES OUTILS QUI QUITTENT LE RAIL POUR LA BARRE DU HAUT (3.5.130, Charles : « simplifier les menus »). « Importer » dépend de
 * l'axe ouvert : l'axe déclare ici sa porte d'import, la barre du haut la montre tant qu'elle existe.
 * La porte est une FONCTION : on la range dans un objet — passée telle quelle à `setState`, React l'exécuterait. */
import { useEffect, useState } from 'react';

let porteImport = null;
const abonnes = new Set();
export function declarerImport(fn) { porteImport = fn || null; abonnes.forEach(a => a({ fn: porteImport })); }
export function useImport() {
  const [x, setX] = useState(() => ({ fn: porteImport }));
  useEffect(() => { abonnes.add(setX); setX({ fn: porteImport }); return () => abonnes.delete(setX); }, []);
  return x.fn;
}

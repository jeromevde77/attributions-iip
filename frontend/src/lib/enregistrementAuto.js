import { useEffect, useRef } from 'react';

/* L'ENREGISTREMENT AU CLIC (3.5.298, Charles, 10 novembre 2026 : « que ce qui est écrit dans la partie DUE / pondération soit sauvé
   au clic »). Une pause de saisie (`delai`) et ce qui a changé part seul ; le bouton « Enregistrer » reste pour qui veut forcer.
   `trace` : ce qui change à chaque geste (le brouillon) ; `pret` : rien à enregistrer tant qu'il est faux (lecture, état incomplet).
   À la sortie de l'écran, ce qui n'est pas encore parti part (`aLaSortie`). */
export function useEnregistrementAuto(trace, { pret, enregistrer, delai = 1200 }) {
  const fn = useRef(enregistrer); fn.current = enregistrer;
  const doit = useRef(pret); doit.current = pret;
  useEffect(() => {
    if (!pret) return undefined;
    const t = setTimeout(() => { fn.current?.({ auto: true }); }, delai);
    return () => clearTimeout(t);
  }, [trace, pret, delai]);
  useEffect(() => () => { if (doit.current) fn.current?.({ auto: true, sortie: true }); }, []);
}

export const heureCourte = () => new Date().toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });

/* UN PAE VALIDÉ NE SE MODIFIE PAS SANS LE DIRE (3.5.233, Charles, 8 novembre 2026 : « si un PAE est validé, on ne peut plus y toucher
   sans forcer la chose ; un pop-up "vous allez modifier un PAE" ; il faudra le valider à nouveau »).
   Le serveur refuse tout changement d'un programme confirmé (409, code « pae_valide », lib : ecrireProgramme). Plutôt que d'apprendre
   ce refus à chacun des écrans qui composent un PAE (revue, fiche, grille du parcours, composition en lot, propositions en ligne…),
   UNE fenêtre l'intercepte ici : elle dit lequel, qui l'a validé et quand, demande, puis renvoie la même requête avec l'en-tête
   « X-Lucie-Modifier-PAE ». Refuser rend la réponse d'origine à l'écran, qui l'affiche comme tout refus. */
import { demander } from './dialogue.jsx';

export function installerGardePAE() {
  if (window.__gardePAE) return;
  window.__gardePAE = true;
  const origine = window.fetch.bind(window);
  window.fetch = async (entree, init = {}) => {
    const rep = await origine(entree, init);
    if (rep.status !== 409) return rep;
    let j = null;
    try { j = await rep.clone().json(); } catch { return rep; }
    if (j?.code !== 'pae_valide') return rep;
    const ok = await demander({ titre: 'Vous allez modifier un PAE validé', message: `${j.error}\n\nContinuer quand même ?`, confirmer: 'Modifier le PAE' });
    if (!ok) return rep;
    const h = new Headers(init.headers || (entree instanceof Request ? entree.headers : undefined));
    h.set('X-Lucie-Modifier-PAE', '1');
    return origine(entree instanceof Request ? new Request(entree, { headers: h }) : entree, { ...init, headers: h });
  };
}

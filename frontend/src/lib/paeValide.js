/* LES REFUS QUI SE CONFIRMENT (3.5.233 et 3.5.238). Deux refus du serveur se lèvent sur la parole de qui clique, et une seule fenêtre
   commune les intercepte ici, plutôt que chacun des écrans qui composent un programme (revue, fiche, grille du parcours, composition en
   lot, propositions en ligne…) :
   — « pae_valide » (Charles, 8 novembre 2026 : « si un PAE est validé, on ne peut plus y toucher sans forcer la chose ; il faudra le
     valider à nouveau ») → en-tête « X-Lucie-Modifier-PAE » ;
   — « apres_dixieme » (circulaire 9764 : après le 1/10, l'étudiant compte au registre matricule ; qui part est en abandon, il ne
     s'efface pas) → en-tête « X-Lucie-Apres-Dixieme ».
   La fenêtre dit pourquoi, demande, puis renvoie la même requête avec l'en-tête. Refuser rend la réponse d'origine à l'écran. Les deux
   peuvent se suivre : la requête renvoyée garde le premier en-tête et peut lever le second. */
import { demander } from './dialogue.jsx';

const REFUS = {
  pae_valide: { titre: 'Vous allez modifier un PAE validé', confirmer: 'Modifier le PAE', entete: 'X-Lucie-Modifier-PAE' },
  apres_dixieme: { titre: 'Unité au-delà de son premier dixième', confirmer: 'Retirer quand même', entete: 'X-Lucie-Apres-Dixieme' },
};

export function installerGardePAE() {
  if (window.__gardePAE) return;
  window.__gardePAE = true;
  const origine = window.fetch.bind(window);
  const envoyer = async (entree, init, tours) => {
    const rep = await origine(entree, init);
    if (rep.status !== 409 || tours > 2) return rep;
    let j = null;
    try { j = await rep.clone().json(); } catch { return rep; }
    const r = REFUS[j?.code];
    if (!r) return rep;
    const ok = await demander({ titre: r.titre, message: `${j.error}\n\nContinuer quand même ?`, confirmer: r.confirmer });
    if (!ok) return rep;
    const h = new Headers(init.headers || (entree instanceof Request ? entree.headers : undefined));
    h.set(r.entete, '1');
    const suite = { ...init, headers: h };
    return envoyer(entree instanceof Request ? new Request(entree, { headers: h }) : entree, suite, tours + 1);
  };
  window.fetch = (entree, init = {}) => envoyer(entree, init, 0);
}

/**
 * UN NUMÉRO DEVANT CHAQUE ÉTUDIANT (3.5.147, Charles, 6 novembre 2026 : « je voudrais un numéro (1, 2, 3…) toujours quand on a
 * des étudiants — plus simple pour compter »). Écrit une fois, pour tous les écrans : tout tableau dont un en-tête de colonne
 * commence par « Étudiant » (ou qui porte `data-numeros`) numérote ses lignes, par un compteur CSS (`index.css`). Les lignes de
 * total et de regroupement ne comptent pas ; `data-numeros="non"` retire la numérotation d'un tableau.
 */
const RE = /^\s*étudiant/i;
function marquer(t) {
  if (t.dataset.numeros) return;
  const ths = t.querySelectorAll('thead th');
  if ([...ths].some(th => RE.test(th.textContent || ''))) t.dataset.numeros = 'oui';
}
export function installerNumeros() {
  if (typeof document === 'undefined' || !window.MutationObserver) return;
  const tout = () => document.querySelectorAll('table:not([data-numeros])').forEach(marquer);
  let attente = null;
  new MutationObserver(() => { if (attente) return; attente = requestAnimationFrame(() => { attente = null; tout(); }); })
    .observe(document.body, { childList: true, subtree: true });
  tout();
}

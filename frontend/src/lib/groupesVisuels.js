/* (CS) LES TUILES QUI SE SUIVENT (3.5.619, Charles, 21 novembre 2026 : « règle des tuiles qui se suivent pas respectée » — des cartes
   de cours rangées dans une grille, l'une sous l'autre sur un écran étroit). Une règle CSS ne sait pas si une grille montre une ou
   trois colonnes : on regarde l'écran. Deux cartes (ou deux tuiles de bloc) du même conteneur, de même largeur, alignées l'une
   sous l'autre et séparées de moins de 24 px, forment une pile : la seconde porte `data-voisin-haut`, la première `data-voisin-bas`,
   et l'écart à refermer `--doc-colle`. Le dessin est dans index.css (« le dessin des documents »). Mesuré à chaque changement de
   la page et de la taille de la fenêtre, regroupé dans une image. */
const SELECTEUR = '.carte, div.bloc-etat:not(.inline-flex):not(.inline-block)';

function exclu(el) {
  // Les lignes d'une pile déclarée, les volets de l'Accueil et une carte dans une carte ont leur propre règle.
  return !!el.closest('.pile-etats') || el.hasAttribute('data-rang') || !!el.parentElement?.closest('.carte, .bloc-etat');
}

function mesurer() {
  const vus = new Set();
  const marques = document.querySelectorAll('[data-voisin-haut], [data-voisin-bas]');
  for (const el of document.querySelectorAll(SELECTEUR)) {
    if (exclu(el) || vus.has(el.parentElement)) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    vus.add(parent);
    const items = [...parent.children].filter(x => x.matches(SELECTEUR) && !exclu(x) && x.offsetParent !== null)
      .map(x => ({ x, r: x.getBoundingClientRect(), mt: parseFloat(x.style.getPropertyValue('--doc-colle')) || 0 }));
    if (items.length < 2) continue;
    for (const a of items) {
      const b = items.find(o => o !== a && Math.abs(o.r.left - a.r.left) < 2 && Math.abs(o.r.width - a.r.width) < 2
        && (o.r.top + o.mt) - a.r.bottom >= -1 && (o.r.top + o.mt) - a.r.bottom <= 24);
      if (!b) continue;
      const ecart = Math.max(0, Math.round((b.r.top + b.mt) - a.r.bottom));
      a.x.dataset.voisinBas = '1';
      b.x.dataset.voisinHaut = '1';
      b.x.style.setProperty('--doc-colle', `${ecart}px`);
      b.x.dataset.vh = '1';
      a.x.dataset.vb = '1';
    }
  }
  // Ce qui n'a plus de voisin perd sa marque.
  for (const el of marques) {
    if (!el.dataset.vh) { delete el.dataset.voisinHaut; el.style.removeProperty('--doc-colle'); }
    if (!el.dataset.vb) delete el.dataset.voisinBas;
  }
  for (const el of document.querySelectorAll('[data-vh], [data-vb]')) { delete el.dataset.vh; delete el.dataset.vb; }
}

let prevu = false;
const planifier = () => { if (prevu) return; prevu = true; requestAnimationFrame(() => { prevu = false; try { mesurer(); } catch { /* la mise en page reste juste sans pile */ } }); };

export function installerGroupesVisuels() {
  if (typeof window === 'undefined' || window.__groupesVisuels) return;
  window.__groupesVisuels = true;
  new MutationObserver(muts => {
    // On ignore nos propres marques, sans quoi la mesure se relancerait elle-même.
    if (muts.every(m => m.type === 'attributes' && /^data-(voisin|v[hb])|^style$/.test(m.attributeName || ''))) return;
    planifier();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-ferme'] });
  window.addEventListener('resize', planifier);
  planifier();
}

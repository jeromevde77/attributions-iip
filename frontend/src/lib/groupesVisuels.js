/* (CS) LES TUILES QUI SE SUIVENT (3.5.619, Charles, 21 novembre 2026 : « règle des tuiles qui se suivent pas respectée » — des cartes
   de cours rangées dans une grille, l'une sous l'autre sur un écran étroit). Une règle CSS ne sait pas si une grille montre une ou
   trois colonnes : on regarde l'écran. Deux cartes (ou deux tuiles de bloc) du même conteneur, de même largeur, alignées l'une
   sous l'autre et séparées de moins de 24 px, forment une pile : la seconde porte `data-voisin-haut`, la première `data-voisin-bas`,
   et l'écart à refermer `--doc-colle`. Le dessin est dans index.css (« le dessin des documents »). Mesuré à chaque changement de
   la page et de la taille de la fenêtre, regroupé dans une image. */
const SELECTEUR = '.carte, div.bloc-etat:not(.inline-flex):not(.inline-block)';

function exclu(el) {
  // Les lignes d'une pile déclarée, les volets de l'Accueil et une carte dans une carte ont leur propre règle.
  return !!el.closest('.pile-etats') || el.hasAttribute('data-rang') || el.hasAttribute('data-tuile-seule') || !!el.parentElement?.closest('.carte, .bloc-etat');
}

/* (3.5.625) UNE GRILLE DE CARTES EST UNE SEULE TUILE COUPÉE EN MORCEAUX (Charles, 21 novembre 2026, les cours de l'UE 66 rangés sur
   deux colonnes : « un seul coin arrondi ; tout le reste est dans une tuile coupée en morceaux »). Un conteneur dont TOUS les enfants
   visibles sont des cartes, rangées sur au moins deux colonnes, porte `data-grille-doc` : c'est lui qui dessine le bord, l'arc et le
   coin ; chaque carte perd le sien et porte `data-g-ligne` (pas sur la première rangée : filet horizontal) et `data-g-col` (pas dans
   la première colonne : filet vertical court). */
function grilles() {
  const vus = new Set(), gardees = new Set();
  for (const el of document.querySelectorAll(SELECTEUR)) {
    const parent = el.parentElement;
    if (!parent || vus.has(parent) || el.closest('.pile-etats') || el.hasAttribute('data-rang') || parent.closest('.carte, .bloc-etat')) continue;
    vus.add(parent);
    const enfants = [...parent.children].filter(x => x.offsetParent !== null);
    if (enfants.length < 2 || !enfants.every(x => x.matches(SELECTEUR))) continue;
    // Une tuile qui porte un état (réussi, à surveiller…) ou un chiffre garde son dessin : la fondre lui ôterait sa couleur.
    if (enfants.some(x => x.matches('.tuile-grande, .tuile-compacte, [class*="etat-"], [data-tuile-seule]')
      || (x.dataset.etat && !['fort', 'neutre'].includes(x.dataset.etat)))) continue;
    const r = enfants.map(x => x.getBoundingClientRect());
    const cols = [...new Set(r.map(b => Math.round(b.left)))];
    if (cols.length < 2) continue;
    const haut = Math.min(...r.map(b => b.top)), gauche = Math.min(...r.map(b => b.left));
    parent.dataset.grilleDoc = '1'; gardees.add(parent);
    enfants.forEach((x, i) => {
      if (r[i].top - haut > 2) x.dataset.gLigne = '1'; else delete x.dataset.gLigne;
      if (r[i].left - gauche > 2) x.dataset.gCol = '1'; else delete x.dataset.gCol;
    });
  }
  // Les morceaux d'une tuile (3.5.626, `.morceau-doc`, ex. les cours d'un bloc dans Mes cours) : même repérage, la tuile est la carte.
  for (const parent of new Set([...document.querySelectorAll('.morceau-doc')].map(x => x.parentElement).filter(Boolean))) {
    const enfants = [...parent.children].filter(x => x.offsetParent !== null);
    if (!enfants.length) continue;
    const r = enfants.map(x => x.getBoundingClientRect());
    const haut = Math.min(...r.map(b => b.top)), gauche = Math.min(...r.map(b => b.left));
    enfants.forEach((x, i) => {
      if (r[i].top - haut > 2) x.dataset.gLigne = '1'; else delete x.dataset.gLigne;
      if (r[i].left - gauche > 2) x.dataset.gCol = '1'; else delete x.dataset.gCol;
    });
  }
  for (const g of document.querySelectorAll('[data-grille-doc]')) if (!gardees.has(g)) {
    delete g.dataset.grilleDoc;
    for (const x of g.children) { delete x.dataset.gLigne; delete x.dataset.gCol; }
  }
  return gardees;
}

/* (3.5.627) UNE CARTE QUI PORTE SA COULEUR EN LIGNE (style borderLeft, ex. le bloc d'une liste rangée par bloc) la garde sous Lucie V4 :
   le dessin des documents retire les bordures et lit sa couleur dans --e-doc. */
function couleursEnLigne() {
  for (const el of document.querySelectorAll('.carte[style*="border-left"]')) {
    const c = el.style.borderLeftColor;
    if (c && el.style.getPropertyValue('--e-doc') !== c) el.style.setProperty('--e-doc', c);
  }
}

/* (3.5.632) Les marges intérieures de la première et de la dernière colonne de chaque tableau, pour que ses filets partent du contenu. */
function margesTableaux() {
  if (document.documentElement.dataset.theme !== 'v4') return;
  for (const t of document.querySelectorAll('#root table')) {
    const ligne = t.querySelector('tbody > tr, thead > tr');
    const g = ligne?.firstElementChild, d = ligne?.lastElementChild;
    if (!g) continue;
    const pg = `${parseFloat(getComputedStyle(g).paddingLeft) || 0}px`, pd = `${parseFloat(getComputedStyle(d).paddingRight) || 0}px`;
    if (t.style.getPropertyValue('--tab-g') !== pg) t.style.setProperty('--tab-g', pg);
    if (t.style.getPropertyValue('--tab-d') !== pd) t.style.setProperty('--tab-d', pd);
  }
}

function mesurer() {
  couleursEnLigne();
  margesTableaux();
  const enGrille = grilles();
  const vus = new Set(enGrille);
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
      // (3.5.628) Même nature seulement : deux cartes, ou deux tuiles du même état ; une alerte ne se colle pas à une carte.
      const nature = x => (x.classList.contains('carte') ? 'carte' : `etat:${x.dataset.etat || ''}`);
      const b = items.find(o => o !== a && nature(o.x) === nature(a.x) && Math.abs(o.r.left - a.r.left) < 2 && Math.abs(o.r.width - a.r.width) < 2
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
    if (muts.every(m => m.type === 'attributes' && /^data-(voisin|v[hb]|grille|g-)|^style$/.test(m.attributeName || ''))) return;
    planifier();
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-ferme'] });
  window.addEventListener('resize', planifier);
  planifier();
}

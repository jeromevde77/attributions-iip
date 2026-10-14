// ─────────────────────────────────────────────────────────────────────────────
// LE TEXTE DU DOSSIER PÉDAGOGIQUE, EN MARQUES SIMPLES (3.1.356) — le pendant de
// backend/src/lib/texteDossier.js, à tenir à l'identique. « ## Rubrique », « ### Intertitre »,
// « - point », deux espaces de plus par sous-niveau. Ici, en plus, le chemin inverse : ce que
// l'éditeur rend (HTML) redevient du texte marqué, pour l'enregistrement.
// ─────────────────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const RUBRIQUES_DP = ['Finalités', 'Capacités préalables', "Acquis d'apprentissage", 'Degré de maîtrise',
  'Programme', 'Constitution des groupes', 'Chargés de cours'];

export function texteVersHtml(texte, { intertitre = 'h4' } = {}) {
  let h = ''; let ouverts = 0;
  const fermer = n => { while (ouverts > n) { h += '</li></ul>'; ouverts--; } };
  for (const brut of String(texte || '').split('\n')) {
    const puce = /^( *)- (.*)$/.exec(brut);
    if (puce) {
      const n = Math.floor(puce[1].length / 2) + 1;
      if (n > ouverts) { while (ouverts < n) { h += '<ul><li>'; ouverts++; } }
      else { fermer(n); h += '</li><li>'; }
      h += `<p>${esc(puce[2])}</p>`;
      continue;
    }
    const l = brut.trim();
    fermer(0);
    if (!l) continue;
    const t = /^###\s+(.*)$/.exec(l);
    if (t) h += intertitre === 'h4' ? `<h4>${esc(t[1])}</h4>` : `<p><strong>${esc(t[1])}</strong></p>`;
    else if (/^##\s+/.test(l)) continue;
    else h += `<p>${esc(l)}</p>`;
  }
  fermer(0);
  return h;
}

/** HTML de l'éditeur → texte marqué (h4 → « ### », listes imbriquées → « - »). */
export function htmlVersTexte(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const out = [];
  const texte = el => el.textContent.replace(/\s+/g, ' ').trim();
  const liste = (ul, n) => {
    for (const li of ul.children) {
      if (li.tagName !== 'LI') continue;
      const propre = [...li.childNodes].filter(x => !(x.nodeType === 1 && /^(UL|OL)$/.test(x.tagName)))
        .map(x => x.textContent).join(' ').replace(/\s+/g, ' ').trim();
      if (propre) out.push(`${'  '.repeat(n)}- ${propre}`);
      for (const sous of li.children) if (/^(UL|OL)$/.test(sous.tagName)) liste(sous, n + 1);
    }
  };
  for (const el of doc.body.firstChild.children) {
    if (/^H[1-6]$/.test(el.tagName)) { const t = texte(el); if (t) out.push(`### ${t}`); }
    else if (/^(UL|OL)$/.test(el.tagName)) liste(el, 0);
    else { const t = texte(el); if (t) out.push(t); }
  }
  return out.join('\n');
}

export function rubriquesDuTexte(texte) {
  const out = {}; let cle = null;
  for (const l of String(texte || '').split('\n')) {
    const m = /^##\s+(.*)$/.exec(l);
    if (m) { cle = m[1].trim(); out[cle] = []; continue; }
    if (cle) out[cle].push(l);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n').trim()]));
}

/* LES DOSSIERS IMPORTÉS AVANT 3.1.356 SONT À PLAT (Charles, 14 octobre 2026 : « tu ne mets pas de
 * structure ni de mise en page ») : ni puces ni intertitres, seulement des lignes. On les structure à
 * l'ouverture, par ce que le texte laisse voir — l'intitulé d'un cours ou un sous-titre connu devient
 * un intertitre ; ce qui suit une phrase finissant par « : » devient une liste, jusqu'au prochain
 * intertitre ou à la prochaine phrase en « : ». Les sous-puces ne se devinent pas : un réimport du
 * Word les rend. Un texte qui porte déjà des marques n'est pas touché. */
const SOUS_TITRES = /^(finalit[ée]s g[ée]n[ée]rales|finalit[ée]s particuli[èe]res|capacit[ée]s|titres? (pouvant en )?ten(ant|ir) lieu)\s*:?$/i;
export function structurerAPlat(texte, intitulesCours = []) {
  const t = String(texte || '');
  if (!t.trim() || /^###\s/m.test(t)) return t;
  const norme = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const cours = new Set(intitulesCours.map(norme).filter(Boolean));
  // Déjà ses puces (programme importé en 3.1.342) : il ne lui manque que ses intertitres.
  if (/^( *)- /m.test(t)) {
    return t.split('\n').map(l => (!/^\s*- /.test(l) && (cours.has(norme(l)) || SOUS_TITRES.test(l.trim()))
      ? `### ${l.trim().replace(/\s*:$/, '')}` : l)).join('\n');
  }
  const out = []; let liste = false; let sous = false;
  for (const brut of t.split('\n')) {
    const l = brut.trim();
    if (!l) { liste = false; sous = false; continue; }
    // Les sous-points d'un point en « : » — jusqu'à celui qui ferme par « ; » ou « . ».
    if (sous) { out.push(`  - ${l}`); if (/[;.]$/.test(l)) sous = false; continue; }
    // Un intertitre (un cours, « Finalités générales ») ouvre une liste : ses points suivent.
    if (cours.has(norme(l)) || SOUS_TITRES.test(l)) { out.push(`### ${l.replace(/\s*:$/, '')}`); liste = true; sous = false; continue; }
    // Un point en « : » au milieu d'une liste : c'est une puce, et ce qui suit, ses sous-puces.
    if (/:$/.test(l) && liste && /^- /.test(out[out.length - 1] || '')) { out.push(`- ${l}`); sous = true; continue; }
    if (/:$/.test(l)) { out.push(l); liste = true; continue; }
    // Une ligne en « , » qui ne suit pas une puce est une phrase de contexte (« en vue de…, ») ;
    // après une puce, c'est la suite de l'énumération.
    const precedente = out[out.length - 1] || '';
    if (liste && !(/,$/.test(l) && !/^- /.test(precedente))) { out.push(`- ${l}`); continue; }
    out.push(l);
  }
  return out.join('\n');
}

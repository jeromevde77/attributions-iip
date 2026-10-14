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

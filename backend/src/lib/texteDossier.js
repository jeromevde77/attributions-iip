// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LE TEXTE DU DOSSIER PÉDAGOGIQUE, EN MARQUES SIMPLES (3.1.350)
//
// L'import du dossier Word écrit chaque rubrique en lignes : « ## Rubrique », « ### Intertitre »
// (l'intitulé d'un cours, « Finalités générales »), « - point » et deux espaces de plus par
// sous-niveau. Ces fonctions en font du HTML structuré — pour la DUE, la pièce imprimée — et le
// découpent en rubriques. La même conversion vit côté écran (frontend/src/lib/texteDossier.js) :
// les deux se tiennent à l'identique.
// ─────────────────────────────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const RUBRIQUES_DP = ['Finalités', 'Capacités préalables', "Acquis d'apprentissage", 'Degré de maîtrise',
  'Programme', 'Constitution des groupes', 'Chargés de cours'];

/** Lignes marquées → HTML. `intertitre` : 'h4' (éditeur de la fiche) ou 'strong' (DUE, pièce). */
export function texteVersHtml(texte, { intertitre = 'strong' } = {}) {
  let h = ''; let ouverts = 0;
  const fermer = n => { while (ouverts > n) { h += '</li></ul>'; ouverts--; } };
  for (const brut of String(texte || '').split('\n')) {
    const puce = /^( *)- (.*)$/.exec(brut);
    if (puce) {
      const n = Math.floor(puce[1].length / 2) + 1;
      if (n > ouverts) { while (ouverts < n) { h += '<ul><li>'; ouverts++; } h = h.replace(/<li>$/, '<li>'); }
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
  return h.replace(/<ul><li><\/li><li>/g, '<ul><li>');
}

/** Le texte entier → { rubrique: texte }. */
export function rubriquesDuTexte(texte) {
  const out = {}; let cle = null;
  for (const l of String(texte || '').split('\n')) {
    const m = /^##\s+(.*)$/.exec(l);
    if (m) { cle = m[1].trim(); out[cle] = []; continue; }
    if (cle) out[cle].push(l);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join('\n').trim()]));
}

/** { rubrique: texte } → le texte entier, dans l'ordre du dossier. */
export function texteDesRubriques(rubriques) {
  const cles = [...RUBRIQUES_DP, ...Object.keys(rubriques).filter(k => !RUBRIQUES_DP.includes(k))];
  return cles.filter(k => String(rubriques[k] || '').trim()).map(k => `## ${k}\n${String(rubriques[k]).trim()}`).join('\n\n');
}

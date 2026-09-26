/**
 * LE FILIGRANE DES PIÈCES SIGNÉES — « un peu genre billets de banque ».
 *
 * Demandé par Charles le 26 septembre 2026, motif C retenu (« les vagues et la
 * bande ») : derrière le bloc de clôture ENTIER — cachet, lieu et date,
 * signature —, des vagues fines qui se croisent, et une bande de micro-texte
 * qui porte la pièce, la personne, la date et une référence. Et un petit
 * cartouche guilloché derrière chaque COTE : une cote retouchée casse le motif.
 *
 * CE QUE CELA PROTÈGE, ET CE QUE CELA NE PROTÈGE PAS. Une pièce recopiée,
 * découpée ou recollée se voit : la signature emporte un morceau de vagues et
 * de texte qui ne correspond plus. Cela n'empêche pas la copie.
 *
 * LE MOTIF DÉPEND DE LA RÉFÉRENCE : deux pièces ne portent jamais le même
 * dessin. La référence est celle de l'envoi quand la pièce part par courriel
 * (services/filigrane.js) ; sinon elle naît au moment où la pièce est produite.
 *
 * UNE FONCTION, POSÉE AU HTML FINAL (`filigraner`), et non pièce par pièce :
 * l'attestation, la motivation, le diplôme et le PV de diplomation ont chacun
 * leur bloc `.cloture` — ce serait autant d'occasions d'en oublier un.
 */
import { nouvelleReference } from '../services/filigrane.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// Un générateur déterministe tiré de la référence : même référence, même dessin.
function graine(texte) {
  let h = 2166136261;
  for (const c of String(texte)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

/** Les vagues croisées, en SVG, pour une surface de `l` × `h` unités. */
function vagues(ref, l = 600, h = 120, lignes = 12) {
  const r = graine(ref);
  const p1 = r() * 6, p2 = r() * 6, f1 = 13 + r() * 5, f2 = 16 + r() * 6;
  let d = '';
  for (let k = 0; k < lignes; k++) {
    const y0 = 8 + k * (h - 16) / (lignes - 1);
    let a = '', b = '';
    for (let x = 0; x <= l; x += 3) {
      a += (a ? 'L' : 'M') + x + ' ' + (y0 + 4.5 * Math.sin(x / f1 + k * 0.7 + p1)).toFixed(1);
      b += (b ? 'L' : 'M') + x + ' ' + (y0 + 4.5 * Math.sin(-x / f2 + k * 0.5 + p2)).toFixed(1);
    }
    d += `<path d="${a}"/><path d="${b}" opacity=".7"/>`;
  }
  return d;
}

/** Le fond du bloc de clôture : vagues sur toute la largeur, bande en bas. */
export function fondCloture({ ref, texte }) {
  const bande = `${texte} · RÉF. ${ref} · `.toUpperCase();
  return `<svg class="filigrane-cloture" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true">
<g fill="none" stroke="#C9D0DB" stroke-width=".5">${vagues(ref)}</g>
<text x="300" y="117" text-anchor="middle" font-size="5.2" letter-spacing=".5" fill="#A7B0BF"
  font-family="Arial, Helvetica, sans-serif">${esc(bande.repeat(3)).slice(0, 260)}</text>
</svg>`;
}

/** Le cartouche d'une cote : un petit guilloché, en image de fond. */
function fondCote(ref) {
  const r = graine(ref + '·cote');
  const p = r() * 6;
  let d = '';
  for (let k = 0; k < 5; k++) {
    let a = '';
    for (let x = 0; x <= 60; x += 1.5) a += (a ? 'L' : 'M') + x + ' ' + (3 + k * 3.4 + 1.6 * Math.sin(x / 3.2 + k + p)).toFixed(1);
    d += `<path d="${a}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 20" preserveAspectRatio="none"><g fill="none" stroke="#C3CAD6" stroke-width=".45">${d}</g></svg>`;
  // Guillemets SIMPLES : l'url se pose dans un attribut style="…".
  return `url('data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}')`;
}

const STYLES = `<style>
  .cloture{position:relative;isolation:isolate}
  .cloture>.filigrane-cloture{position:absolute;left:-2mm;right:-2mm;top:-3mm;bottom:-4mm;
    width:calc(100% + 4mm);height:calc(100% + 7mm);z-index:-1;pointer-events:none}
  .cote{display:inline-block;padding:0 1.6mm;border-radius:1mm;
    background-size:100% 100%;background-repeat:no-repeat}
</style>`;

/**
 * Pose le filigrane sur une pièce HTML complète.
 * @param {string} html  la pièce, telle qu'elle s'imprime
 * @param {{ ref?: string, texte?: string }} [o]
 *   ref   : la référence (celle de l'envoi si la pièce part par courriel) ;
 *   texte : ce que dit la bande — la pièce, la personne, la date.
 */
export function filigraner(html, o = {}) {
  let doc = String(html || '');
  if (!/class="cloture|class="[^"]*\bcote\b/.test(doc)) return doc;
  const ref = o.ref || nouvelleReference();
  const date = new Date().toLocaleDateString('fr-BE');
  const texteDe = bloc => {
    // La personne : le nom en tête de la pièce, quand elle en porte un.
    const nom = (/<div class="nom">([^<]+)<\/div>/.exec(bloc) || [])[1];
    return [o.texte || 'Institut Ilya Prigogine', nom, date].filter(Boolean).join(' · ');
  };
  // Chaque bloc de clôture reçoit son fond, avec la personne de SA page.
  let dernier = 0, sortie = '';
  const re = /<div class="cloture[^"]*">/g;
  let m;
  while ((m = re.exec(doc))) {
    const page = doc.slice(dernier, m.index);
    sortie += page + m[0] + fondCloture({ ref, texte: texteDe(page) });
    dernier = re.lastIndex;
  }
  doc = sortie + doc.slice(dernier);
  // Les cotes marquées « cote » reçoivent leur cartouche.
  const fond = fondCote(ref);
  doc = doc.replace(/class="([^"]*\bcote\b[^"]*)"/g, (t, c) => `class="${c}" style="background-image:${fond}"`);
  return doc.replace('</head>', `${STYLES}</head>`);
}

export default filigraner;

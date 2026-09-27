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

/* QUATRE VAGUES, ET ELLES SONT LE CODE DU DOCUMENT (Charles, 27 septembre
 * 2026 : « la vague doit être le code du document, en plus clair ; quatre
 * vagues entrelacées qui passent pile au milieu de ma signature et du
 * tampon »). Chaque vague est une ligne de micro-texte — la référence, la
 * pièce, la personne, la date — qui épouse la courbe ; deux paires se
 * croisent à la hauteur du tampon et du paraphe. Le dessin dépend encore de
 * la référence : deux pièces ne portent jamais les mêmes vagues. La bande du
 * bas disparaît, les vagues la portent. */
let numeroFond = 0;
export function fondCloture({ ref, texte }) {
  const r = graine(ref);
  const p = r() * 6, f = 24 + r() * 6;
  const code = esc(`RÉF. ${ref} · ${texte} · `.toUpperCase());
  const id = `fv${(numeroFond++).toString(36)}`;
  const V = [[1, 0, 12], [1, Math.PI, 12], [-1, 1.2, 8], [-1, 1.2 + Math.PI, 8]];
  let defs = '', txt = '';
  V.forEach(([sens, ph, amp], k) => {
    let a = '';
    for (let x = -20; x <= 620; x += 2) a += (a ? 'L' : 'M') + x + ' ' + (40 + amp * Math.sin(sens * x / f + ph + p)).toFixed(1);
    defs += `<path id="${id}-${k}" d="${a}"/>`;
    txt += `<text font-size="4.2" letter-spacing=".3" fill="${k < 2 ? '#C9D0DB' : '#D6DCE5'}"><textPath href="#${id}-${k}" startOffset="${k * 23}">${code.repeat(6)}</textPath></text>`;
  });
  return `<svg class="filigrane-cloture" viewBox="0 0 600 80" preserveAspectRatio="none" aria-hidden="true">
<defs>${defs}</defs><g font-family="Arial, Helvetica, sans-serif" font-weight="700">${txt}</g></svg>`;
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
  /* Posées sur la LIGNE du tampon et du paraphe (hauteur --filigrane-h) :
     les vagues la traversent en son milieu. */
  .cloture>.filigrane-cloture{position:absolute;left:-2mm;top:0;
    width:calc(100% + 4mm);height:var(--filigrane-h, 22mm);z-index:-1;pointer-events:none}
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

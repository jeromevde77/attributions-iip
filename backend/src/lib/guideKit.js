/**
 * LE MODE D'EMPLOI EN PDF, AU MODÈLE DU KIT FeLSI (3.1.521 ; refait en 3.5.032, Charles, 1er novembre 2026 : « je veux
 * que tu fasses évoluer le design vers le modèle microcertif de la FeLSI » — le kit « Microcertifications » qu'il a
 * dessiné pour le réseau ; le niveau de détail est celui du « Guide de l'enseignant » 3.1.219).
 *
 * Ce qui vient du kit : couverture pleine page bleu nuit ; sommaire groupé par parties, avec les PAGES ; tuiles de
 * chiffres et encadrés ; chaque chapitre ouvre une page par un bandeau PLEINE LARGEUR (partie en surtitre, icône dans
 * un cercle, titre, résumé, grand numéro en filigrane) ; « Ce que vous trouverez ici » ; chaque point en carte (rond
 * numéroté, « POINT n », titre, bande « Où ? », texte, captures encadrées, « À savoir ») ; un aide-mémoire « Je veux…
 * je vais… » ; un liseré sur le bord gauche de chaque page ; un pied logo · titre · page.
 * Ce qui vient de l'ancien guide : le mot de la direction, signé ; les captures annotées (repères numérotés, une carte
 * par repère). Pas de bleu clair en aplat, pas de liseré tricolore (3.5.034) : le bleu nuit du kit.
 *
 * Le CONTENU reste celui du guide en ligne (`modeEmploi.js`, filtré par public) : rien ne s'écrit ici.
 *
 * La mécanique : chaque morceau (couverture, mot, chaque chapitre, aide-mémoire) se rend à part — c'est ce qui donne
 * le numéro de page de chaque chapitre pour le sommaire —, puis le sommaire, puis tout se réunit (pdf-lib), qui pose
 * le liseré et la pagination « n / N ». Les captures ne vivent pas sur le serveur : l'écran les envoie en data URL.
 * La police est Inter (paquet `fonts-inter` de l'image du serveur) ; à défaut, la police sans empattement du système.
 */
import { modeEmploiPour, enrichiP } from './modeEmploi.js';
import { icone } from './iconesGuide.js';
import { logoCourant, logoBlancCourant, signatureCourante } from './identite.js';
import { mentionProduction } from './contexteRequete.js';
import { rendrePdfs } from '../services/pdf.js';

const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* Les couleurs du kit (le cyan du logo ne sert plus qu'au L de la couverture). */
const C = {
  nuit: '#0B2A55', bleu: '#1F78BE', clair: '#3E9BD6', ciel: '#9FD0F0', pale: '#EEF5FB', pale2: '#E4F0FA',
  filet: '#DCE6F0', gris: '#64748B', encre: '#1E293B', or: '#F9B619', cyan: '#05B7E6', iip: '#19537E',
};
const POLICE = `Inter, "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
const PUBLICS = { ens: 'Enseignants', sec: 'Secrétariat', coo: 'Coordinations', dir: 'Direction' };
const GUIDE_DE = { ens: "Le guide de l'enseignant", sec: 'Le guide du secrétariat', coo: 'Le guide de la coordination', dir: 'Le guide de la direction' };

/* LES PARTIES, comme « Comprendre et conduire · Les outils » du kit et « Mise en marche · Tout ce que vous pouvez
   faire » de l'ancien guide. Un chapitre absent de la liste va dans la dernière. */
const PARTIES = [
  { titre: 'Mise en marche', ids: ['ensemble', 'demarrage', 'accueil'] },
  // « Mes cours » vit entre l'espace de l'étudiant et le CEP dans le guide : une partie qui la sépare couperait l'ordre.
  { titre: 'Les étudiants et les cours', ids: ['etudiants', 'pae', 'valorisation', 'amenagements', 'deliberation', 'procedures', 'diplomes', 'editions', 'espace', 'mescours', 'cep'] },
  { titre: "L'école", ids: ['personnel', 'organisation', 'gestion'] },
  { titre: 'Les textes et les réglages', ids: ['documentation', 'config'] },
];
const partieDe = id => (PARTIES.find(p => p.ids.includes(id)) || PARTIES[PARTIES.length - 1]).titre;

/* LA FIGURE DU LOGO (coordonnées de `frontend/src/lib/logoVierge.js`, viewBox 0 0 140 44) : la couverture la dessine,
   comme l'ancien guide. */
const ETOILES = { tau: [12, 7.5], spica: [12, 32], eta: [42, 32], nu: [60.1, 29.8], porrima: [34.5, 28.4], kappa: [-3.1, 21],
  iota: [-0.1, 14.4], mu: [-9.8, 7.7], zeta: [18.7, 16.2], v109: [-3.4, -3.9], delta: [34.5, 19.2], vindemiatrix: [39.4, 8] };
const TRAITS = [['nu', 'eta'], ['eta', 'porrima'], ['porrima', 'spica'], ['spica', 'kappa'], ['kappa', 'iota'], ['iota', 'mu'],
  ['spica', 'zeta'], ['zeta', 'tau'], ['tau', 'v109'], ['zeta', 'delta'], ['delta', 'vindemiatrix'], ['delta', 'porrima']];
function logoLucie() {
  const L = ['tau', 'spica', 'eta'];
  const traits = TRAITS.map(([a, b]) => `<line x1="${ETOILES[a][0]}" y1="${ETOILES[a][1]}" x2="${ETOILES[b][0]}" y2="${ETOILES[b][1]}" stroke="#5E87B5" stroke-width=".55" stroke-opacity=".7"/>`).join('');
  const points = Object.entries(ETOILES).filter(([k]) => !L.includes(k))
    .map(([, [x, y]]) => `<circle cx="${x}" cy="${y}" r="1.25" fill="#6F8FB3" fill-opacity=".85"/>`).join('');
  const l = `<path d="M12 7.5 L12 32 L42 32" fill="none" stroke="${C.cyan}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>`
    + L.map(k => `<circle cx="${ETOILES[k][0]}" cy="${ETOILES[k][1]}" r="3.1" fill="${C.cyan}"/><circle cx="${ETOILES[k][0]}" cy="${ETOILES[k][1]}" r="1.5" fill="#BDEBFA"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -8 80 46" width="68mm">${traits}${points}${l}</svg>`;
}

const STYLES = `
  * { box-sizing: border-box; }
  html, body { margin: 0; font-family: ${POLICE}; color: ${C.encre}; font-size: 9.4pt; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Les marges latérales sont DANS la page (padding) : c'est ce qui laisse le bandeau aller d'un bord à l'autre. */
  body { padding: 0 18mm; }
  b, strong { font-weight: 650; color: ${C.nuit}; }
  .kick { font-size: 7.2pt; letter-spacing: .24em; font-weight: 700; text-transform: uppercase; color: ${C.clair}; }
  p { margin: 0 0 2.2mm; }

  /* le bandeau d'ouverture : pleine largeur, du bord gauche au bord droit de la feuille */
  .bande { background: ${C.nuit}; color: #fff; margin: 0 -18mm 6mm; padding: 9mm 18mm 9mm 18mm; position: relative; overflow: hidden;
    display: flex; gap: 7mm; align-items: center; break-inside: avoid; min-height: 52mm; }
  .bande .rond { width: 17mm; height: 17mm; border-radius: 50%; background: rgba(255,255,255,.08); display: grid; place-items: center; flex: none; }
  .bande .texte { position: relative; z-index: 1; max-width: 128mm; }
  .bande h1 { font-size: 23pt; font-weight: 800; letter-spacing: -.015em; margin: 2mm 0 2.5mm; line-height: 1.1; color: #fff; }
  .bande .res { color: #C3D6EA; font-size: 10pt; line-height: 1.45; margin: 0 0 2.5mm; }
  .bande .grand { position: absolute; right: 9mm; top: -9mm; font-size: 118pt; font-weight: 900; color: rgba(62,155,214,.17); line-height: 1; }
  .pubs { display: flex; flex-wrap: wrap; gap: 1.4mm; }
  .pub { border: .3mm solid rgba(255,255,255,.28); border-radius: 1.5mm; padding: .3mm 2mm; font-size: 7.2pt; color: #DCEAF6; }

  /* « Ce que vous trouverez ici » */
  /* Plus de trait bleu à côté des blocs (3.5.035, Charles : « le bleu à côté de chaque rectangle, c'est trop ; je veux le texte ») :
     seule la ligne bleu nuit en marge de la page reste. */
  .trouver { border-bottom: .3mm solid ${C.filet}; padding: 0 0 3mm;
    margin: 0 0 6mm; break-inside: avoid; }
  .trouver .t { display: flex; gap: 2mm; align-items: center; font-weight: 700; color: ${C.nuit}; margin-bottom: 1.8mm; }
  .trouver ul { margin: 0; padding-left: 4.5mm; columns: 2; column-gap: 9mm; }
  .trouver li { margin: 0 0 1mm; break-inside: avoid; } .trouver li::marker { color: ${C.clair}; }

  /* un point = une carte, au dessin des étapes du kit */
  .pt-debut { break-inside: avoid; }
  .pt { border-top: .3mm solid ${C.filet}; padding: 4.5mm 0 2mm;
    margin: 0 0 4.5mm; }
  .pt-tete { display: flex; align-items: center; gap: 3.5mm; margin: 0 0 3mm; break-inside: avoid; break-after: avoid; }
  .pt-num { width: 9.5mm; height: 9.5mm; border-radius: 50%; background: ${C.nuit}; color: #fff; display: grid; place-items: center;
    font-weight: 750; font-size: 11pt; flex: none; }
  .pt-kick { font-size: 6.8pt; letter-spacing: .22em; font-weight: 700; color: ${C.clair}; text-transform: uppercase; }
  .pt h3 { font-size: 12.5pt; color: ${C.nuit}; margin: .3mm 0 0; font-weight: 750; line-height: 1.25; }
  .pt-ou { display: flex; align-items: flex-start; gap: 2mm; background: #F1F4F8; border-radius: 2mm; padding: 2mm 3mm; margin: 0 0 3mm;
    font-size: 8.8pt; break-inside: avoid; }
  .pt-ou svg { flex: none; margin-top: .4mm; }
  .pt-ou .q { font-weight: 700; color: ${C.nuit}; white-space: nowrap; }
  .pt-ou .pas { font-weight: 600; color: ${C.nuit}; } .pt-ou .sep { color: ${C.clair}; margin: 0 1mm; font-weight: 700; }
  .pt-ou .reste { color: ${C.gris}; }
  .pt-corps { display: flow-root; }
  .pt-savoir { display: flex; gap: 2.5mm; background: #EEF2F7; border-radius: 2.5mm; padding: 3mm 4mm; margin: 2mm 0 1mm; font-size: 8.9pt;
    break-inside: avoid; }
  .pt-savoir svg { flex: none; margin-top: .3mm; }
  .pt-savoir .t { font-weight: 700; color: ${C.nuit}; margin-bottom: .8mm; }
  .pt-savoir ul { margin: 0; padding-left: 4mm; } .pt-savoir li { margin: 0 0 .8mm; } .pt-savoir li::marker { color: ${C.clair}; }
  .intro { margin: 0 0 4.5mm; }

  /* les captures, dans un cadre bleu pâle, légende centrée (ancien guide) */
  /* Une capture se pose seule, sur un filet gris (3.5.034, Charles : « tu mets des bandes bleues claires »). */
  .cap { margin: 0 0 3mm; break-inside: avoid; }
  .cap img { display: block; width: 100%; max-height: 72mm; object-fit: contain; border-radius: 2mm; border: .3mm solid #CBD5E1; background: #fff; }
  .cap figcaption { font-size: 7.8pt; color: ${C.gris}; text-align: center; margin-top: 1.8mm; line-height: 1.4; }
  .annot { margin: 1mm 0 3.5mm; width: 100%; }
  .annot-ecran { position: relative; }
  .annot-img { position: relative; }
  .annot-img img { display: block; width: 100%; border: .3mm solid #CBD5E1; border-radius: 2mm; background: #fff; }
  .rep { display: inline-grid; place-items: center; width: 5.6mm; height: 5.6mm; border-radius: 50%; background: ${C.nuit}; color: #fff;
    font-size: 7.6pt; font-weight: 750; flex: none; }
  .annot-ecran > .rep { position: absolute; transform: translateX(-50%); }
  .rep-trait { position: absolute; width: .45mm; margin-left: -.225mm; background: ${C.nuit}; }
  .annot figcaption { font-size: 7.8pt; color: ${C.gris}; text-align: center; margin: 1.8mm 0 2.5mm; }
  .reps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2.2mm; }
  .rep-carte { display: flex; gap: 2mm; align-items: flex-start; background: #F3F5F8; border-radius: 2.5mm; padding: 2.2mm 2.6mm;
    font-size: 8.2pt; line-height: 1.38; break-inside: avoid; }
  .rep-carte b { color: ${C.nuit}; }
  .flottant { float: left; display: flex; gap: 3mm; align-items: flex-start; margin: 0 5mm 2mm 0; max-width: 62%; }
  .flottant .cap { margin: 0; }
  .rangee { display: flex; flex-wrap: wrap; gap: 3mm; align-items: flex-start; clear: both; }
  .me-bt { font-weight: 700; color: ${C.nuit}; border: .3mm solid #9FB3C8; border-radius: 1.2mm; padding: 0 1.2mm; white-space: nowrap; background: #fff; }

  /* encadrés et tuiles (sommaire) */
  .callout { display: flex; gap: 3.5mm; background: #F3F5F8; border-radius: 3.5mm;
    padding: 3.5mm 5mm; margin: 0 0 4mm; break-inside: avoid; }
  .callout .t { display: block; font-weight: 700; color: ${C.nuit}; margin-bottom: .8mm; } .callout p { margin: 0 0 1mm; }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 0 0 4mm; } .deux .callout { margin: 0; }
  .tuiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin: 6mm 0 5mm; }
  .tuile { background: ${C.nuit}; color: #fff; border-radius: 3.5mm; padding: 4.5mm 5mm; }
  .tuile .n { font-size: 24pt; font-weight: 800; line-height: 1; } .tuile .n small { font-size: 11pt; font-weight: 650; color: ${C.ciel}; }
  .tuile p { margin: 2mm 0 0; font-size: 8pt; color: #C3D6EA; line-height: 1.4; }

  /* sommaire */
  h1.titre { font-size: 26pt; font-weight: 800; color: ${C.nuit}; margin: 2mm 0 6mm; letter-spacing: -.01em; }
  .som-partie { margin: 0 0 1.5mm; color: ${C.nuit}; }
  .somg { display: grid; grid-template-columns: 1fr 1fr; column-gap: 11mm; margin: 0 0 5mm; }
  .somg div { display: flex; align-items: baseline; gap: 3.5mm; padding: 2.2mm 0; border-bottom: .3mm dotted #B8C6D6; font-size: 10.2pt; break-inside: avoid; }
  .somg .n { color: ${C.bleu}; font-weight: 750; width: 6mm; flex: none; }
  .somg .l { flex: 1; } .somg .p { color: ${C.bleu}; font-size: 9pt; }

  /* mot de la direction */
  .mot { padding-top: 14mm; } .mot h1 { font-size: 21pt; color: ${C.nuit}; font-weight: 800; margin: 2.5mm 0 8mm; letter-spacing: -.01em; }
  .mot p { font-size: 10.4pt; line-height: 1.62; margin: 0 0 4mm; }
  .mot .sign { padding: 2mm 0; margin-top: 10mm; }
  .mot .sign img { height: 19mm; display: block; margin: 0 0 2mm; }
  .mot .sign .q { color: ${C.gris}; font-size: 9pt; }

  /* aide-mémoire */
  table.aide { width: 100%; border-collapse: collapse; font-size: 8.8pt; }
  table.aide td { padding: 2mm 3mm; border-bottom: .3mm solid ${C.filet}; vertical-align: top; }
  table.aide td:first-child { width: 42%; font-weight: 650; color: ${C.nuit}; }
  table.aide tr:nth-child(even) td { background: #F7FAFD; }
  table.aide tr.chap td { background: ${C.pale2}; color: ${C.bleu}; font-size: 7pt; letter-spacing: .2em; font-weight: 700; text-transform: uppercase;
    padding: 1.6mm 3mm; border-bottom: none; }
  table.aide tr { break-inside: avoid; }
`;

const page = (corps, styles = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STYLES}${styles}</style></head><body>${corps}</body></html>`;

/** Le chemin « Où », en étapes. */
function chemin(ou) {
  const [ch, ...reste] = String(ou).split(/(?<=\.)\s|·|;/).map(x => x.trim()).filter(Boolean);
  const etapes = String(ch || '').replace(/\.$/, '').split('→').map(x => x.trim()).filter(Boolean);
  return `<div class="pt-ou">${icone('lieu', 13, C.clair, 2)}<div><span class="q">Où ?</span>&nbsp; ${etapes.map((x, i) =>
    `${i ? '<span class="sep">›</span>' : ''}<span class="pas">${enrichiP(x)}</span>`).join('')}${reste.length ? ` <span class="reste">· ${reste.map(enrichiP).join(' · ')}</span>` : ''}</div></div>`;
}

/* LES CAPTURES : une capture étroite se place à gauche du texte (« carré comme Word », 3.5.025) ; les autres, en
   dessous, à leur taille (0,12 mm le pixel, hauteur plafonnée), jamais plus larges que la carte. */
const COLONNE_MM = 160;
function largeur(im, dims) {
  const d = dims?.(im.src);
  if (!d?.w || !d?.h) return im.etroite ? 46 : null;
  let w = d.w * 0.12 + 6, h = d.h * 0.12;
  if (h > 72) { w = (w - 6) * 72 / h + 6; h = 72; }
  return Math.min(COLONNE_MM, Math.round(w * 10) / 10);
}
function figure(i, w) {
  return `<figure class="cap"${w ? ` style="width:${w}mm"` : ''}><img src="${esc(i.src)}" alt="">${i.legende ? `<figcaption>${enrichiP(i.legende)}</figcaption>` : ''}</figure>`;
}

/* LA CAPTURE ANNOTÉE (3.5.034, Charles : « je n'ai pas comme dans le mode d'emploi initial ceci » — la barre du haut du
   guide du secrétariat, numérotée). Les numéros se posent AU-DESSUS de la capture, sur autant de rangs qu'il faut pour
   ne pas se toucher (`rangsReperes`), chacun avec son trait jusqu'à l'objet ; puis une carte par numéro, en quatre
   colonnes. Une capture annotée prend toute la largeur : elle ne flotte jamais à côté du texte. */
const PAS_RANG = 6.5;     // mm entre deux rangs de numéros
function captureAnnotee(i) {
  const reps = rangsReperes(i.reperes, 5.2);
  const nRangs = Math.max(...reps.map(r => r.rang)) + 1;
  const haut = nRangs * PAS_RANG + 2.5;
  const numeros = reps.map((r, k) => `<span class="rep" style="left:${r.x}%;top:${r.rang * PAS_RANG}mm">${k + 1}</span>`).join('');
  const traits = reps.map(r => {
    const ecart = haut - (r.rang * PAS_RANG + 5.6);
    return `<i class="rep-trait" style="left:${r.x}%;top:-${ecart}mm;height:calc(${r.y ?? 50}% + ${ecart}mm)"></i>`;
  }).join('');
  return `<figure class="annot"><div class="annot-ecran" style="padding-top:${haut}mm">${numeros}
      <div class="annot-img"><img src="${esc(i.src)}" alt="">${traits}</div></div>
    ${i.legende ? `<figcaption>${enrichiP(i.legende)}</figcaption>` : ''}
    <div class="reps">${reps.map((r, k) => `<div class="rep-carte"><span class="rep">${k + 1}</span><div><b>${esc(r.titre)}</b>${r.texte ? ` — ${enrichiP(r.texte)}` : ''}</div></div>`).join('')}</div>
  </figure>`;
}
/** Rangs des repères : dans l'ordre de `x`, chacun sur le premier rang où il ne touche pas le précédent. */
export function rangsReperes(reperes, ecartMin) {
  const fins = [];
  return (reperes || []).map(r => {
    let rang = 0;
    while (fins[rang] != null && r.x - fins[rang] < ecartMin) rang++;
    fins[rang] = r.x;
    return { ...r, rang };
  });
}

/** Un point du guide, en carte. */
function point(p, n, dims) {
  const l = [...(p.image ? [{ src: p.image, legende: p.legende }] : []), ...(p.images || [])];
  const petites = [], grandes = [];
  let cumul = 0;
  for (const i of l) {
    if (i.reperes?.length) { grandes.push([i, null]); continue; }
    const w = largeur(i, dims);
    const plafond = COLONNE_MM * (petites.length ? 0.5 : 0.62);
    if (w && cumul + w + (petites.length ? 3 : 0) < plafond) { petites.push([i, w]); cumul += w + (petites.length > 1 ? 3 : 0); }
    else grandes.push([i, w]);
  }
  /* L'ERGONOMIE DE LECTURE (3.5.036, Charles : « des captures qui débutent à la page d'après sans contexte ; des titres en bas
     de page ») : un point ne se coupe pas s'il tient sur une page (`.pt`, break-inside: avoid) ; s'il est plus long, son DÉBUT —
     titre, chemin, texte et première capture — reste d'un tenant (`.pt-debut`), et la suite vient après. */
  const dessiner = ([i, w]) => (i.reperes?.length ? captureAnnotee(i) : figure(i, w));
  const [premiere, ...suite] = grandes;
  const corps = `<div class="pt-corps">
      ${petites.length ? `<div class="flottant">${petites.map(([i, w]) => figure(i, w)).join('')}</div>` : ''}
      ${p.texte ? `<p>${enrichiP(p.texte)}</p>` : ''}${p.contenu || ''}
      ${premiere ? `<div class="rangee">${dessiner(premiere)}</div>` : ''}
    </div>`;
  const savoir = p.savoir?.length ? `<div class="pt-savoir">${icone('bulb', 15, C.bleu, 2)}<div><div class="t">À savoir</div>
      <ul>${p.savoir.map(s => `<li>${enrichiP(s)}</li>`).join('')}</ul></div></div>` : '';
  // Le début (titre, chemin, texte, première capture) reste d'un tenant ; le reste suit, chaque capture et « À savoir » entiers.
  // Un « À savoir » court (trois lignes au plus) reste collé au bloc qui le précède : il n'ouvre jamais une page seul.
  const court = p.savoir?.length && p.savoir.length <= 3;
  const derniere = court && suite.length ? suite.pop() : null;
  const milieu = (suite.length ? `<div class="rangee">${suite.map(dessiner).join('')}</div>` : '')
    + (derniere ? `<div class="pt-debut"><div class="rangee">${dessiner(derniere)}</div>${savoir}</div>` : '');
  const tete = p.titre ? `<div class="pt-tete"><span class="pt-num">${n}</span><div><div class="pt-kick">Point ${n}</div><h3>${esc(p.titre)}</h3></div></div>
    ${p.ou ? chemin(p.ou) : ''}` : '';
  const collerAuDebut = court && !derniere;
  const debut = `<div class="pt-debut">${tete}${corps}${collerAuDebut ? savoir : ''}</div>`;
  return `<div class="${p.titre ? 'pt' : 'intro'}">${debut}${milieu}${court ? '' : savoir}</div>`;
}

/** Le bandeau d'ouverture d'une page (chapitre, sommaire, aide-mémoire). */
function bande({ kick, titre, resume, nom, grand, pubs = [] }) {
  return `<div class="bande"><div class="rond">${icone(nom, 30, C.ciel, 1.7)}</div>
    <div class="texte"><div class="kick">${esc(kick)}</div><h1>${esc(titre)}</h1>
      ${resume ? `<p class="res">${enrichiP(resume)}</p>` : ''}
      ${pubs.length ? `<div class="pubs">${pubs.map(x => `<span class="pub">${PUBLICS[x]}</span>`).join('')}</div>` : ''}</div>
    <div class="grand">${esc(grand)}</div></div>`;
}

function chapitre(r, i, dims) {
  const pubs = String(r.pour || '').split(/\s+/).filter(x => PUBLICS[x]);
  const titres = r.points.filter(p => p.titre);
  let k = 0;
  return page(`${bande({ kick: partieDe(r.id), titre: r.titre, resume: r.resume, nom: r.icone, grand: i + 1, pubs })}
    ${titres.length > 1 ? `<div class="trouver"><div class="t">${icone('main', 17, C.bleu)} Ce que vous trouverez ici</div>
      <ul>${titres.map(p => `<li>${esc(p.titre)}</li>`).join('')}</ul></div>` : ''}
    ${r.points.map(p => point(p, p.titre ? ++k : null, dims)).join('')}`);
}

/** La couverture : pleine page bleu nuit, sans marge ni pied. */
function couverture(m) {
  const pub = m.publics?.length === 1 ? m.publics[0] : null;
  const titre = pub ? GUIDE_DE[pub] : 'Le guide complet';
  const sous = pub === 'ens'
    ? 'Vos premiers pas dans Lucie, puis tout ce que vous pouvez y faire : vos cours, vos notes, vos présences, vos avis.'
    : "Où aller, ce qu'on y fait, et ce qu'il faut savoir : tout le travail de l'école, écran par écran.";
  const v = String(m.version).split('.').slice(0, 2).join('.');
  return page(`<section class="couv">
    <div class="haut"><img src="${logoBlancCourant()}" alt=""><div class="k">ENSEIGNEMENT POUR ADULTES<br>INSTITUT ILYA PRIGOGINE</div></div>
    <div class="milieu"><div class="kick">Mode d'emploi</div>
      <div class="logo">${logoLucie()}<div class="nom">Lucie<span>v.${esc(v)}</span></div></div>
      <div class="ligne"></div><h2>${esc(titre)}</h2><div class="sous">${esc(sous)}</div></div>
    <div class="themes">${m.rubriques.map(r => esc(r.titre)).join(' · ')} · Aide-mémoire</div>
    <div class="pied"><div><b>Institut Ilya Prigogine</b><br>Campus Erasme · Route de Lennik 808, 1070 Anderlecht</div>
      <div style="text-align:right">${esc(mentionProduction())} · version ${esc(m.version)}<br>Captures sur données fictives</div></div>
  </section>`, `
    @page { size: A4; margin: 0; }
    body { padding: 0; }
    .couv { width: 210mm; height: 297mm; background: ${C.nuit}; color: #fff; padding: 24mm 22mm 20mm; display: flex; flex-direction: column; overflow: hidden; position: relative; }
    .couv .haut { display: flex; justify-content: space-between; align-items: flex-start; }
    .couv .haut img { height: 30mm; margin: -6mm 0 0 -6mm; }
    .couv .haut .k { text-align: right; font-size: 7.4pt; letter-spacing: .26em; color: ${C.clair}; line-height: 2.1; }
    .couv .milieu { margin-top: 26mm; }
    .couv .logo { margin: 5mm 0 0 -4mm; }
    .couv .nom { font-size: 50pt; font-weight: 800; letter-spacing: -.025em; line-height: 1; margin: -4mm 0 0 14mm; }
    .couv .nom span { font-size: 15pt; font-weight: 500; color: ${C.clair}; margin-left: 2.5mm; letter-spacing: 0; }
    .couv .ligne { width: 40mm; height: 1.1mm; background: ${C.clair}; margin: 9mm 0 7mm; }
    .couv h2 { font-size: 17pt; margin: 0 0 3mm; font-weight: 750; }
    .couv .sous { font-size: 10.6pt; color: #C3D6EA; max-width: 132mm; line-height: 1.55; }
    .couv .themes { margin-top: auto; font-size: 8.4pt; color: #9DB4CC; line-height: 1.9; }
    .couv .pied { margin-top: 9mm; border-top: .3mm solid rgba(255,255,255,.2); padding-top: 4mm; display: flex; justify-content: space-between; font-size: 7.8pt; color: #9DB4CC; line-height: 1.6; }
    .couv .pied b { color: #fff; }`);
}

/* LE MOT DE LA DIRECTION — le texte du guide 3.1.219, signé par Charles Sohet. */
function motDeLaDirection() {
  return page(`<section class="mot"><div class="kick">Le mot de la direction</div>
    <h1>Lucie, une assistante pour chacun de nous</h1>
    <p>Chères et chers collègues,</p>
    <p>Lucie est née d'une conviction simple : le temps que nous passons à recopier, à vérifier, à chercher un document ou à dissiper un malentendu est du temps que nous ne passons pas avec nos étudiants.</p>
    <p>Elle a été pensée pour nous simplifier la vie : communiquer plus facilement et plus directement, encoder <b>une seule fois</b> ce qui l'était deux ou trois fois, alléger les démarches administratives, et éviter les erreurs et les malentendus qui naissent de tout cela.</p>
    <p>Lucie n'est pas là pour surveiller, ni pour contrôler. <b>C'est une assistante</b> : elle se souvient à notre place, elle rappelle, elle propose — et c'est toujours vous qui décidez.</p>
    <p>Son seul but est de remettre notre métier au cœur de nos journées : <b>former des étudiants, et de futurs professionnels qui prendront soin des autres</b>.</p>
    <p>Lucie est jeune. Elle a encore ses maladresses, et elle grandira avec vous : chaque remarque, chaque idée envoyée par l'ampoule la rend un peu meilleure. Je compte sur votre patience et votre bienveillance — pour elle, et pour celles et ceux qui la font vivre. Partagez vos astuces entre collègues, dites-nous ce qui vous gêne… et pardonnez-lui ses premiers faux pas.</p>
    <p>Merci de faire ce chemin avec nous.</p>
    <div class="sign"><img src="${signatureCourante()}" alt=""><b>Charles Sohet</b><div class="q">Directeur de l'Institut Ilya Prigogine</div></div>
  </section>`);
}

/** Le sommaire, avec les pages de chaque chapitre. */
function sommaire(m, pages, pageAide) {
  const nPoints = m.rubriques.reduce((s, r) => s + r.points.filter(p => p.titre).length, 0);
  const nImages = m.rubriques.reduce((s, r) => s + r.points.reduce((t, p) => t + (p.image ? 1 : 0) + (p.images?.length || 0), 0), 0);
  const parties = PARTIES.map(pa => ({ ...pa, chap: m.rubriques.map((r, i) => ({ r, i })).filter(({ r }) => partieDe(r.id) === pa.titre) }))
    .filter(pa => pa.chap.length);
  const ligne = (n, l, p) => `<div><span class="n">${n}</span><span class="l">${esc(l)}</span><span class="p">${p ?? ''}</span></div>`;
  return page(`<h1 class="titre">Sommaire</h1>
    ${parties.map((pa, k) => `<div class="kick som-partie">${esc(pa.titre)}</div>
      <div class="somg">${pa.chap.map(({ r, i }) => ligne(i + 1, r.titre, pages[i])).join('')}${k === parties.length - 1 ? ligne('✓', 'Aide-mémoire', pageAide) : ''}</div>`).join('')}
    <div class="tuiles">
      <div class="tuile"><div class="n">${m.rubriques.length} <small>chapitres</small></div><p>en ${parties.length} parties, de la mise en marche ${parties.length > 2 ? 'aux réglages' : 'à votre travail'}</p></div>
      <div class="tuile"><div class="n">${nPoints} <small>points</small></div><p>chacun dit où aller, ce qu'on y fait, et ce qu'il faut savoir</p></div>
      <div class="tuile"><div class="n">${nImages} <small>captures</small></div><p>prises sur une base d'essai : les noms sont inventés</p></div>
    </div>
    <div class="callout"><div>${icone('info', 18, C.nuit)}</div><div><span class="t">Ce guide en ${parties.length} parties</span>
      ${(m.rubriques.length > 8
        ? [`<p>${parties.map(pa => `<b>${esc(pa.titre)}</b> (${pa.chap.length > 1 ? `chapitres ${pa.chap[0].i + 1} à ${pa.chap[pa.chap.length - 1].i + 1}` : `chapitre ${pa.chap[0].i + 1}`})`).join(' · ')}.</p>`]
        : parties.map(pa => `<p><b>${esc(pa.titre)}</b> (chapitre${pa.chap.length > 1 ? 's' : ''} ${pa.chap.length > 1 ? `${pa.chap[0].i + 1} à ${pa.chap[pa.chap.length - 1].i + 1}` : pa.chap[0].i + 1}) : ${esc(pa.chap.map(c => c.r.titre).join(' · '))}.</p>`)).join('')}
      <p>En fin de guide, l'<b>aide-mémoire</b> : « je veux… je vais… », chaque geste et son chemin.</p></div></div>
    <div class="deux">
      <div class="callout clair"><div>${icone('eye', 18, C.bleu)}</div><div><span class="t">Des données fictives</span><p>Les captures viennent d'une base d'essai : les noms, matricules et adresses sont <b>inventés</b>. Ce que vous verrez porte vos cours et vos étudiants.</p></div></div>
      <div class="callout clair"><div>${icone('bulb', 18, C.bleu)}</div><div><span class="t">Une question, une idée ?</span><p>L'<b>ampoule</b> « Proposer une amélioration » est sur tous les écrans : la direction y répond, et la réponse revient sur votre tableau de bord.</p></div></div>
    </div>
    <div class="callout"><div>${icone('refresh', 18, C.nuit)}</div><div><span class="t">Un guide qui suit Lucie</span><p>Ce document est composé, le jour où vous l'imprimez, à partir du guide en ligne (Documentation → Mode d'emploi), qui fait foi. Lucie s'améliore au fil des semaines : les écrans peuvent changer ; ce qui est attendu de vous, et l'endroit où le trouver, reste le même. Version décrite : ${esc(m.version)}.</p></div></div>`);
}

/** L'aide-mémoire : chaque point qui a un chemin, « je veux… je vais… ». */
function aideMemoire(m) {
  const lignes = m.rubriques.map(r => {
    const pts = r.points.filter(p => p.titre && p.ou);
    if (!pts.length) return '';
    return `<tr class="chap"><td colspan="2">${esc(r.titre)}</td></tr>${pts.map(p => `<tr><td>${esc(p.titre)}</td><td>${enrichiP(String(p.ou).replace(/\.$/, ''))}</td></tr>`).join('')}`;
  }).join('');
  return page(`${bande({ kick: 'Pour aller vite', titre: 'Aide-mémoire', resume: 'Je veux… je vais… — chaque point du guide et son chemin.', nom: 'IconChecklist', grand: '✓' })}
    <table class="aide">${lignes}</table>`);
}

/** Le pied de chaque page : logo au-dessus du filet, deux lignes centrées. La page « n / N » est posée ensuite. */
function pied() {
  return `<div style="width:100%;font-family:Inter,Arial,Helvetica,sans-serif;padding:0 18mm;margin:0">
    <img src="${logoCourant()}" style="height:7.5mm;display:block;margin:0 0 1mm">
    <div style="border-top:0.5pt solid ${C.bleu};padding-top:1.3mm;text-align:center;font-size:6.3pt;color:#3F4652;line-height:1.4">
      <b style="color:${C.nuit}">Institut Ilya Prigogine</b> · Lucie — mode d'emploi<br>${esc(mentionProduction())}</div></div>`;
}
const MARGES = { top: '16mm', right: '0', bottom: '27mm', left: '0' };

/** Largeur et hauteur d'une capture jointe (PNG : l'en-tête IHDR). */
function dimsDepuis(images) {
  const cache = new Map();
  return src => {
    if (cache.has(src)) return cache.get(src);
    let d = null;
    const m = /^data:image\/png;base64,(.{0,64})/.exec(String(images[src] || ''));
    if (m) { const b = Buffer.from(m[1], 'base64'); if (b.length >= 24) d = { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }
    cache.set(src, d); return d;
  };
}
function joindre(html, images) {
  for (const [src, data] of Object.entries(images)) {
    if (/^\/guide\/[\w.-]+\.(png|jpe?g|webp)$/i.test(src) && /^data:image\/(png|jpeg|webp);base64,/.test(String(data)) && html.includes(`src="${src}"`)) {
      html = html.split(`src="${src}"`).join(`src="${data}"`);
    }
  }
  return html;
}

/** Les chemins d'images que le document attend (l'écran les joint). */
export function imagesDuGuide(role, voir) {
  const m = modeEmploiPour(role, voir);
  const l = new Set();
  m.rubriques.forEach(r => r.points.forEach(p => { if (p.image) l.add(p.image); (p.images || []).forEach(i => l.add(i.src)); }));
  return [...l];
}

/** Le PDF complet. `images` : { '/guide/x.png': 'data:image/png;base64,…' }. */
export async function rendreGuidePdf(role, voir, images = {}) {
  const m = modeEmploiPour(role, voir);
  const dims = dimsDepuis(images);
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const corpsOpts = { pied, marges: MARGES };

  // 1. Tout sauf le sommaire : couverture, mot, chapitres, aide-mémoire.
  const morceaux = [
    { html: couverture(m), pageCss: true },
    { html: motDeLaDirection(), ...corpsOpts },
    ...m.rubriques.map((r, i) => ({ html: joindre(chapitre(r, i, dims), images), ...corpsOpts })),
    { html: aideMemoire(m), ...corpsOpts },
  ];
  // 2. Le sommaire se compte d'abord (pages provisoires), puis se refait avec les vraies pages.
  const brouillon = sommaire(m, m.rubriques.map(() => '00'), '00');
  const [rendus, [somBrouillon]] = await Promise.all([rendrePdfs(morceaux, {}, 3), rendrePdfs([{ html: brouillon, ...corpsOpts }], {}, 1)]);
  const docs = await Promise.all(rendus.map(b => PDFDocument.load(b)));
  const nSom = (await PDFDocument.load(somBrouillon)).getPageCount();
  // Pagination : la couverture ne compte pas ; le mot de la direction est la page 1.
  const nMot = docs[1].getPageCount();
  let p = 1 + nMot + nSom;
  const pages = m.rubriques.map((_, i) => { const d = p; p += docs[2 + i].getPageCount(); return d; });
  const pageAide = p;
  const [som] = await rendrePdfs([{ html: sommaire(m, pages, pageAide), ...corpsOpts }], {}, 1);

  // 3. L'assemblage, le liseré et la pagination.
  const ordre = [docs[0], docs[1], await PDFDocument.load(som), ...docs.slice(2)];
  const doc = await PDFDocument.create();
  for (const d of ordre) (await doc.copyPages(d, d.getPageIndices())).forEach(pg => doc.addPage(pg));
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const mm = x => x * 72 / 25.4;
  const hex = h => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const total = doc.getPageCount() - 1;
  doc.getPages().forEach((pg, k) => {
    if (k === 0) return;
    const { width, height } = pg.getSize();
    // Le liseré du kit : bleu nuit, d'un seul trait (3.5.034 : les trois couleurs du logo n'étaient pas celles du kit).
    pg.drawRectangle({ x: 0, y: 0, width: mm(2.2), height, color: hex(C.nuit) });
    const t = `${k} / ${total}`;
    const taille = 6.5;
    pg.drawText(t, { x: width - mm(18) - police.widthOfTextAtSize(t, taille), y: mm(10.4), size: taille, font: police, color: hex('#3F4652') });
  });
  doc.setTitle("Lucie — mode d'emploi");
  return { pdf: Buffer.from(await doc.save()), nom: `Lucie_mode_emploi_${m.version}` };
}

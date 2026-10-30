/**
 * LE MODE D'EMPLOI EN PDF, AU MODÈLE DU KIT (3.1.521, Charles, 30 octobre 2026 : « j'avais ça pour mon réseau, tu peux
 * t'en inspirer, et le logo IIP » — le kit Microcertifications de l'Enseignement pour adultes ; tranché : le mode d'emploi
 * seulement, les pièces officielles gardent le standard administratif).
 *
 * Couverture pleine page bleu nuit (logo blanc de l'établissement, titre, trait or, chapitres en pied), puis un sommaire
 * à tuiles, puis un chapitre par page : bandeau bleu nuit (icône dans un cercle, titre, résumé, numéro en filigrane),
 * « Ce que vous trouverez ici », et les points — ceux de `pointImprimable` (modeEmploi.js), redessinés par les styles
 * du kit. Le pied porte le logo, le titre, la mention « Produit par… » (règle des traces) et le numéro de page.
 *
 * La couverture et le corps se rendent à part (la couverture n'a ni marge ni pied), puis se réunissent (pdf-lib).
 * Les captures ne vivent pas sur le serveur : l'écran les envoie en data URL, clé = chemin `/guide/…`.
 */
import { modeEmploiPour, pointImprimable } from './modeEmploi.js';
import { icone } from './iconesGuide.js';
import { logoCourant, logoBlancCourant } from './identite.js';
import { mentionProduction } from './contexteRequete.js';
import { rendrePdf } from '../services/pdf.js';

const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const C = { nuit: '#0E2A4F', iip: '#19537E', bleu: '#2C7DB8', clair: '#3E9BD0', or: '#F9B619', pale: '#EEF5FB', filet: '#DCE6F0' };
const POLICE = `Inter, "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
const PUBLICS = { ens: 'Enseignants', sec: 'Secrétariat', coo: 'Coordinations', dir: 'Direction' };

const STYLES = `
  * { box-sizing: border-box; }
  html, body { margin: 0; font-family: ${POLICE}; color: #1E293B; font-size: 9.3pt; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .kick { font-size: 7.3pt; letter-spacing: .26em; font-weight: 700; text-transform: uppercase; color: #6FB9E3; }
  .saut { page-break-before: always; }
  /* sommaire */
  h1.som { font-size: 24pt; color: ${C.nuit}; margin: 0 0 5mm; }
  .somg { display: grid; grid-template-columns: 1fr 1fr; column-gap: 12mm; }
  .somg div { display: flex; gap: 4mm; padding: 2mm 0; border-bottom: .3mm dotted #B8C6D6; font-size: 10pt; break-inside: avoid; }
  .somg span:first-child { color: ${C.bleu}; font-weight: 700; width: 6mm; flex: none; }
  .tuiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin: 7mm 0 5mm; }
  .tuile { background: ${C.nuit}; color: #fff; border-radius: 3mm; padding: 4mm 5mm; }
  .tuile .n { font-size: 22pt; font-weight: 800; line-height: 1; } .tuile .n small { font-size: 11pt; font-weight: 600; color: #9CD3EE; }
  .tuile p { margin: 2mm 0 0; font-size: 8pt; color: #C9DCEE; line-height: 1.4; }
  .callout { display: flex; gap: 3.5mm; background: ${C.pale}; border-left: 1.3mm solid ${C.nuit}; border-radius: 0 3mm 3mm 0; padding: 3.5mm 5mm; margin: 0 0 4mm; break-inside: avoid; }
  .callout.clair { border-left-color: ${C.clair}; } .callout b.t { display: block; color: ${C.nuit}; margin-bottom: 1mm; } .callout p { margin: 0; }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; } .deux .callout { margin: 0; }
  /* chapitre */
  .bande { background: ${C.nuit}; color: #fff; border-radius: 3.5mm; padding: 8mm 9mm; display: flex; gap: 6mm; align-items: center; position: relative; overflow: hidden; margin: 0 0 5mm; break-inside: avoid; }
  .bande .rond { width: 16mm; height: 16mm; border-radius: 50%; background: rgba(255,255,255,.09); display: grid; place-items: center; flex: none; }
  .bande h2 { font-size: 20pt; font-weight: 800; margin: 1.2mm 0 1.5mm; letter-spacing: -.01em; }
  .bande p { margin: 0 0 2mm; color: #C9DCEE; font-size: 9.6pt; max-width: 120mm; }
  .bande .grand { position: absolute; right: 6mm; top: -7mm; font-size: 96pt; font-weight: 900; color: rgba(255,255,255,.08); line-height: 1; }
  .pubs { display: flex; flex-wrap: wrap; gap: 1.2mm; } .pub { background: rgba(255,255,255,.14); border-radius: 1.2mm; padding: .5mm 2mm; font-size: 7.3pt; color: #E2EEF8; }
  .trouver { border: .3mm solid ${C.filet}; border-left: 1.3mm solid ${C.clair}; border-radius: 0 3mm 3mm 0; padding: 3mm 5mm; margin: 0 0 5mm; break-inside: avoid; }
  .trouver .t { display: flex; gap: 2mm; align-items: center; font-weight: 700; color: ${C.nuit}; margin-bottom: 1.5mm; }
  .trouver ol { margin: 0; padding-left: 5mm; columns: 2; column-gap: 8mm; } .trouver li { margin: 0 0 .8mm; break-inside: avoid; }
  .trouver li::marker { color: ${C.clair}; font-weight: 700; }
  /* les points de modeEmploi.js, au dessin du kit */
  .me-point { border: .3mm solid ${C.filet}; border-left: none; border-radius: 0; border-width: .3mm 0 0 0; padding: 4mm 0 2mm; margin: 0 0 2mm; font-size: 9.3pt; }
  .me-point h3 { display: flex; align-items: center; gap: 2.5mm; font-size: 12.5pt; color: ${C.nuit}; margin: 0 0 2.5mm; break-after: avoid; }
  .me-rond { display: inline-grid; place-items: center; min-width: 6mm; height: 6mm; padding: 0 1mm; border-radius: 3mm; background: ${C.clair}; color: #fff; font-size: 8pt; font-weight: 700; }
  .me-corps.avec-images { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .85fr); gap: 5mm; align-items: start; }
  .me-corps p { margin: 0 0 2mm; } .me-corps ul { margin: 0 0 2mm; padding-left: 4.5mm; } .me-corps li::marker { color: ${C.clair}; }
  .me-chemin { display: flex; flex-wrap: wrap; align-items: center; gap: 1.2mm; font-size: 8.3pt; margin: 0 0 2.5mm; }
  .me-chemin .pas { background: ${C.pale}; border-radius: 1.5mm; padding: .6mm 2mm; color: ${C.nuit}; font-weight: 600; }
  .me-chemin .sep { color: #94A3B8; } .me-chemin .reste { color: #64748B; }
  .me-savoir { background: ${C.pale}; border-left: 1.3mm solid ${C.clair}; border-radius: 0 3mm 3mm 0; padding: 3mm 4mm; margin: 2mm 0 0; font-size: 8.8pt; break-inside: avoid; }
  .me-savoir .titre { display: flex; align-items: center; gap: 1.5mm; font-weight: 700; color: ${C.nuit}; margin: 0 0 1.2mm; }
  .me-savoir ul { list-style: none; margin: 0; padding: 0; }
  .me-savoir li { position: relative; padding-left: 3.5mm; margin: 0 0 1mm; color: #334155; }
  .me-savoir li::before { content: ''; position: absolute; left: 0; top: 1.6mm; width: 1.4mm; height: 1.4mm; border-radius: 50%; background: ${C.clair}; }
  .me-fig { display: block; margin: 0 0 3mm; break-inside: avoid; }
  .me-fig.etroite { display: inline-block; vertical-align: top; width: 40mm; margin-right: 3mm; }
  .me-corps.sans-images .me-fig.etroite { width: 50mm; }
  .me-fig img { display: block; max-width: 100%; max-height: 85mm; border: .3mm solid ${C.filet}; border-radius: 2.5mm; }
  .me-fig figcaption { font-size: 7.6pt; color: #64748B; margin-top: 1mm; }
  .me-bt { font-weight: 700; color: ${C.nuit}; border: .3mm solid #94A3B8; border-radius: 1mm; padding: 0 1mm; white-space: nowrap; }
`;

const page = (corps, styles = '') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${STYLES}${styles}</style></head><body>${corps}</body></html>`;

/** La couverture : pleine page, sans marge ni pied. */
function couverture(m, pourQui) {
  return page(`<section class="couv">
    <div class="haut"><img src="${logoBlancCourant()}" alt=""><div class="k">ENSEIGNEMENT POUR ADULTES<br>LUCIE · GUIDE</div></div>
    <div class="milieu"><div class="kick">Mode d'emploi</div><h1>Lucie,<br>pas à pas</h1><div class="ligne"></div>
      <h2>Où aller, ce qu'on y fait, et ce qu'il faut savoir</h2>
      <div class="sous">Le même contenu que le guide en ligne (Documentation → Mode d'emploi), composé le jour où vous l'imprimez. ${esc(pourQui)}</div></div>
    <div class="themes">${m.rubriques.map(r => esc(r.titre)).join(' · ')}</div>
    <div class="pied"><div><b>Institut Ilya Prigogine</b><br>${esc(mentionProduction())}</div>
      <div style="text-align:right">Version ${esc(m.version)}<br>Captures sur données fictives</div></div>
  </section>`, `
    @page { size: A4; margin: 0; }
    .couv { width: 210mm; height: 297mm; background: ${C.nuit}; color: #fff; padding: 22mm 20mm; display: flex; flex-direction: column; overflow: hidden; }
    .couv .haut { display: flex; justify-content: space-between; align-items: flex-start; }
    .couv .haut img { height: 30mm; margin: -6mm 0 0 -6mm; }
    .couv .haut .k { text-align: right; font-size: 7.5pt; letter-spacing: .25em; color: #7FC3E8; line-height: 2; }
    .couv .milieu { margin-top: auto; }
    .couv h1 { font-size: 44pt; font-weight: 800; letter-spacing: -.02em; margin: 3mm 0 7mm; line-height: 1.02; }
    .couv .ligne { width: 40mm; height: 1.2mm; background: ${C.or}; border-radius: 1mm; margin-bottom: 7mm; }
    .couv h2 { font-size: 15pt; margin: 0 0 3mm; }
    .couv .sous { font-size: 10.5pt; color: #C9DCEE; max-width: 135mm; }
    .couv .themes { margin-top: auto; padding-top: 24mm; font-size: 8.2pt; color: #A9C3DD; line-height: 1.9; }
    .couv .pied { margin-top: 10mm; border-top: .3mm solid rgba(255,255,255,.2); padding-top: 4mm; display: flex; justify-content: space-between; font-size: 8pt; color: #C9DCEE; }
    .couv .pied b { color: #fff; }`);
}

/** Le pied de chaque page du corps : logo, titre, trace de production, numéro. */
function pied(numeroter) {
  // Même construction que piedGabaritPdf (lib/document.js) : trois cases de largeur fixe, sinon Chromium décale le gabarit.
  return `<div style="width:100%;font-family:Arial,Helvetica,sans-serif;padding:0 16mm;margin:0">
    <div style="border-top:0.5pt solid ${C.bleu};padding-top:1.2mm;display:flex;align-items:flex-start">
      <div style="width:26mm;flex:none"><img src="${logoCourant()}" style="height:7mm;display:block"></div>
      <div style="flex:1;min-width:0;text-align:center;font-size:6pt;color:#3F4652;line-height:1.35">
        <b style="color:${C.nuit}">Institut Ilya Prigogine</b> · Lucie — mode d'emploi<br>${esc(mentionProduction())}</div>
      <div style="width:26mm;flex:none;text-align:right;font-size:6.5pt;color:#3F4652">${numeroter ? '<span class="pageNumber"></span> / <span class="totalPages"></span>' : ''}</div>
    </div></div>`;
}

/** Le corps : sommaire, puis un chapitre par page. */
function corps(m) {
  const nPoints = m.rubriques.reduce((s, r) => s + r.points.length, 0);
  const nImages = m.rubriques.reduce((s, r) => s + r.points.reduce((t, p) => t + (p.image ? 1 : 0) + (p.images?.length || 0), 0), 0);
  const sommaire = `<section>
    <h1 class="som">Sommaire</h1>
    <div class="somg">${m.rubriques.map((r, i) => `<div><span>${i + 1}</span><span>${esc(r.titre)}</span></div>`).join('')}</div>
    <div class="tuiles">
      <div class="tuile"><div class="n">${m.rubriques.length} <small>chapitres</small></div><p>un par métier de l'école, du tableau de bord à la configuration</p></div>
      <div class="tuile"><div class="n">${nPoints} <small>points</small></div><p>chacun dit où aller, ce qu'on y fait, et ce qu'il faut savoir</p></div>
      <div class="tuile"><div class="n">${nImages} <small>captures</small></div><p>prises sur une base d'essai : les noms sont fictifs</p></div>
    </div>
    <div class="callout"><div>${icone('info', 18, C.iip)}</div><div><b class="t">Le guide en ligne fait foi</b><p>Ce document est composé, le jour où vous l'imprimez, à partir du guide en ligne (Documentation → Mode d'emploi). Une nouveauté y paraît d'abord ; ce PDF la reprend sans rien faire.</p></div></div>
    <div class="deux">
      <div class="callout clair"><div>${icone('main', 18, C.iip)}</div><div><b class="t">Comment lire un point</b><p>Le chemin « Où » se suit de gauche à droite ; les boutons sont écrits comme à l'écran ; « À savoir » dit la règle à retenir.</p></div></div>
      <div class="callout clair"><div>${icone('refresh', 18, C.iip)}</div><div><b class="t">Un outil vivant</b><p>Lucie change chaque semaine. Version décrite : ${esc(m.version)}.</p></div></div>
    </div>
  </section>`;
  const chapitres = m.rubriques.map((r, i) => {
    const pubs = String(r.pour || '').split(/\s+/).filter(x => PUBLICS[x]);
    const titres = r.points.filter(p => p.titre);
    return `<section class="saut">
      <div class="bande"><div class="rond">${icone(r.icone, 26, '#9CD3EE')}</div>
        <div><div class="kick">Chapitre ${i + 1} sur ${m.rubriques.length}</div><h2>${esc(r.titre)}</h2>
          ${r.resume ? `<p>${esc(r.resume)}</p>` : ''}
          ${pubs.length ? `<div class="pubs">${pubs.map(x => `<span class="pub">${PUBLICS[x]}</span>`).join('')}</div>` : ''}</div>
        <div class="grand">${i + 1}</div></div>
      ${titres.length > 1 ? `<div class="trouver"><div class="t">${icone('main', 17, C.iip)} Ce que vous trouverez ici</div>
        <ol>${titres.map(p => `<li>${esc(p.titre)}</li>`).join('')}</ol></div>` : ''}
      ${r.points.map((p, k) => pointImprimable(p, p.titre ? k + 1 : null)).join('')}
    </section>`;
  }).join('');
  return page(sommaire + chapitres);
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
  const pourQui = m.publics ? `Édition pour : ${m.publics.map(p => PUBLICS[p].toLowerCase()).join(', ')}.` : 'Édition complète (tous les publics).';
  let html = corps(m);
  for (const [src, data] of Object.entries(images)) {
    if (/^\/guide\/[\w.-]+\.(png|jpe?g|webp)$/i.test(src) && /^data:image\/(png|jpeg|webp);base64,/.test(String(data))) {
      html = html.split(`src="${src}"`).join(`src="${data}"`);
    }
  }
  const [a, b] = await Promise.all([
    rendrePdf(couverture(m, pourQui), { pageCss: true }),
    rendrePdf(html, { pied, pagination: 'toujours', marges: { top: '14mm', right: '16mm', bottom: '20mm', left: '16mm' } }),
  ]);
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  for (const src of [a, b]) {
    const d = await PDFDocument.load(src);
    (await doc.copyPages(d, d.getPageIndices())).forEach(p => doc.addPage(p));
  }
  doc.setTitle("Lucie — mode d'emploi");
  return { pdf: Buffer.from(await doc.save()), nom: `Lucie_mode_emploi_${m.version}` };
}

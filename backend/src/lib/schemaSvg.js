/**
 * LE SCHÉMA DE CAPITALISATION IMPRIMÉ — LE MÊME DESSIN QU'À L'ÉCRAN.
 *
 * Charles, 26 septembre 2026 : « utiliser le même design que ce qui est à
 * l'écran pour l'impression du schéma ». La fiche imprimée avait gardé l'ancien
 * dessin — fonds pleins, cadre doré pour les UE inscrites, flèches grises,
 * épreuve intégrée dans une colonne à part — pendant que l'écran changeait.
 * Ce fichier reprend, en SVG serveur, la mise en page et les règles de
 * `frontend/src/components/SchemaCapitalisation.jsx` :
 *   · liseré gauche qui porte l'état, fond pâle de la même teinte, contour fin ;
 *   · réussie vert (note dans un cercle, année en italique), faveur violet et
 *     cadeau, disponible bleu (sous réserve : pointillé), ajournée en attente
 *     ocre, encore indisponible gris ;
 *   · au programme de l'année : bleu plein, écriture blanche ;
 *   · l'épreuve intégrée sous le dernier bloc, liseré doré ;
 *   · la flèche à la couleur du bloc où elle arrive ;
 *   · la pastille D (déterminante) marine.
 * Les couleurs viennent des réglages (lib/couleurs.js) : ce qui se règle dans
 * Thèmes et couleurs vaut sur le papier comme à l'écran.
 */
import { couleurs } from './couleurs.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Mélange d'une teinte avec le blanc (k = part de la teinte). */
function pale(hex, k) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return '#F4F5F7';
  const c = [1, 2, 3].map(i => Math.round(255 - (255 - parseInt(m[i], 16)) * k));
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
}
function fonce(hex, k) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return hex;
  return '#' + [1, 2, 3].map(i => Math.round(parseInt(m[i], 16) * (1 - k)).toString(16).padStart(2, '0')).join('');
}
const blocDe = niv => { const m = /^\s*BA\s*(\d+)\s*$/i.exec(String(niv || '')); return m ? `BA${m[1]}` : null; };

export function teintesSchema() {
  const C = couleurs();
  const etat = hex => ({ rail: hex, fond: pale(hex, 0.11), bord: pale(hex, 0.30), texte: '#1B2B4B' });
  return {
    acquise: etat(C.reussi), faveur: etat(C.faveur), accessible: etat(C.disponible),
    sous_reserve: etat(C.disponible), en_attente: etat(C.attente),
    bloquee: { rail: '#C3CAD6', fond: C.fond_indispo || '#F4F5F7', bord: '#E3E6EB', texte: '#7A879E' },
    programme: { rail: fonce(C.disponible, 0.3), fond: C.disponible, bord: C.disponible, texte: '#FFFFFF' },
    blocs: { BA1: C.ba1, BA2: C.ba2, BA3: C.ba3 },
    or: C.epreuve || '#C9A84C', faveurHex: C.faveur, reussiHex: C.reussi, incoherence: '#B45309',
  };
}

/** Une case à gauche droite (le liseré), à droite arrondie. */
const boite = (x, y, w, h, r) => `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;

/**
 * @param {{nodes, edges, groupes, colonnes}} data  celle de donneesCapitalisation()
 * @returns {string} le SVG
 */
export function schemaSvg(data) {
  const T = teintesSchema();
  const L = 78, H = 26, GX = 38, GY = 6, PAD = 5, TETE = 18, ECART_EI = 16, MARGE_D = 22;
  const couches = {};
  for (const n of data.nodes || []) (couches[n.couche] ||= []).push(n);
  let nums = Object.keys(couches).map(Number).sort((a, b) => a - b);
  const groupeEI = (data.groupes || []).find(g => g.sous_titre);
  const colEI = groupeEI ? groupeEI.debut : null;
  let sousEI = [];
  const autres = nums.filter(cn => cn !== colEI);
  if (colEI != null && couches[colEI] && autres.length) { sousEI = couches[colEI]; delete couches[colEI]; nums = autres; }
  const colPied = nums[nums.length - 1];
  const pos = {}, colonnesX = {};
  let bas = 0, piedEI = null;
  nums.forEach((cn, ci) => {
    const x = PAD + ci * (L + GX);
    colonnesX[cn] = x;
    couches[cn].forEach((n, ri) => { pos[n.ue_num] = { x, y: PAD + TETE + ri * (H + GY) }; });
    let yFin = PAD + TETE + couches[cn].length * (H + GY) - GY;
    if (cn === colPied && sousEI.length) {
      piedEI = { x, y: yFin + ECART_EI - 4 };
      sousEI.forEach((n, ri) => { pos[n.ue_num] = { x, y: yFin + ECART_EI + ri * (H + GY) }; });
      yFin += ECART_EI + sousEI.length * (H + GY);
    }
    bas = Math.max(bas, yFin);
  });
  const largeur = PAD * 2 + nums.length * (L + GX) - GX + MARGE_D;
  const hauteur = bas + PAD;

  // Titres des blocs, centrés sur leurs sous-colonnes.
  // Pièce remise à l'étudiant : jamais de cote sous dix (NA), et une unité
  // octroyée vaut 10 (circulaire Sanction des études).
  const groupes = ((data.groupes && data.groupes.length) ? data.groupes
    : (data.colonnes || []).map(c => ({ label: c.groupe || c.label || '', debut: c.index, fin: c.index })))
    .filter(g => !g.sous_titre && colonnesX[g.debut] !== undefined);
  const titres = groupes.map(g => {
    const xd = colonnesX[g.debut], xf = colonnesX[g.fin] ?? xd;
    return `<text x="${xd + (xf - xd + L) / 2}" y="${PAD + 10}" text-anchor="middle" font-size="8" font-weight="700" fill="#94A3B8" letter-spacing=".5">${esc(g.label)}</text>`;
  }).join('');
  const sepEI = piedEI ? `<text x="${piedEI.x}" y="${piedEI.y}" font-size="6.2" font-weight="700" fill="#8A6D1F" letter-spacing=".3">ÉPREUVE INTÉGRÉE</text>` : '';

  const marqueurs = ['BA1', 'BA2', 'BA3', 'INC', 'GRIS'].map(b => {
    const c = b === 'INC' ? T.incoherence : b === 'GRIS' ? '#94A3B8' : T.blocs[b];
    return `<marker id="fl-${b}" markerWidth="7" markerHeight="7" refX="6" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,5 L6,2.5 z" fill="${c}"/></marker>`;
  }).join('');
  const nivDe = n => blocDe((data.nodes || []).find(x => x.ue_num === n)?.ue_niv);
  const fleches = (data.edges || []).map(eg => {
    const a = pos[eg.from], b = pos[eg.to];
    if (!a || !b) return '';
    const x1 = a.x + L, y1 = a.y + H / 2, y2 = b.y + H / 2;
    const meme = a.x === b.x;
    const x2 = meme ? b.x + L + 5 : b.x - 7;
    const dx = Math.max(24, (x2 - x1) / 2);
    const arriere = !meme && x2 < x1;
    const d = meme ? `M${x1},${y1} C${x1 + 20},${y1} ${x2 + 20},${y2} ${x2},${y2}`
      : `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
    const bloc = nivDe(eg.to);
    const c = arriere ? T.incoherence : (T.blocs[bloc] || '#94A3B8');
    const m = arriere ? 'INC' : (T.blocs[bloc] ? bloc : 'GRIS');
    return `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.2"${eg.type === 'interne' ? ' stroke-dasharray="4 3"' : ''} marker-end="url(#fl-${m})"/>`;
  }).join('');

  const cadeau = (x, y) => `<g transform="translate(${x},${y}) scale(.35)" fill="none" stroke="${T.faveurHex}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></g>`;
  const boites = (data.nodes || []).map(n => {
    const p = pos[n.ue_num];
    if (!p) return '';
    const statut = n.statut === 'acquise' && n.reussite?.faveur ? 'faveur' : n.statut;
    const auProgramme = n.inscrite && statut !== 'acquise' && statut !== 'faveur';
    let co = auProgramme ? T.programme : (T[statut] || T.bloquee);
    if (n.epreuve_integree && !auProgramme) co = { ...co, rail: T.or };
    const aNote = (statut === 'acquise' || statut === 'faveur') && n.reussite;
    const max = (aNote ? 11 : 17) - (n.epreuve_integree ? 2 : 0);
    const nom = String(n.ue_nom || '');
    const court = nom.length > max ? nom.slice(0, max - 1) + '…' : nom;
    const xn = p.x + L - (n.determinante ? 15 : 8);
    return `<g>
      <path d="${boite(p.x, p.y, L, H, 6)}" fill="${co.fond}" stroke="${co.bord}" stroke-width="1"${n.statut === 'sous_reserve' ? ' stroke-dasharray="4 3"' : ''}/>
      <rect x="${p.x}" y="${p.y}" width="3.5" height="${H}" fill="${co.rail}"/>
      ${n.determinante ? `<circle cx="${p.x + L}" cy="${p.y}" r="6" fill="#1B2B4B" stroke="#fff" stroke-width="1.1"/><text x="${p.x + L}" y="${p.y + 2.5}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff">D</text>` : ''}
      ${n.epreuve_integree ? `<text x="${p.x + L - 5}" y="${p.y + H - 5}" text-anchor="end" font-size="8" fill="${T.or}">★</text>` : ''}
      <text x="${p.x + 7}" y="${p.y + 12}" font-size="10" font-weight="700" fill="${co.texte}">${n.ue_num}</text>
      ${statut === 'faveur' ? cadeau(p.x + 8 + String(n.ue_num).length * 6.2, p.y + 4.2) : ''}
      ${aNote ? `<circle cx="${xn}" cy="${p.y + 9}" r="5.6" fill="#fff" stroke="${co.rail}" stroke-width="1"/>
      <text x="${xn}" y="${p.y + 11.4}" text-anchor="middle" font-size="${n.reussite.va ? 5 : 6.5}" font-weight="700" fill="#1B2B4B">${n.reussite.va ? 'VA' : statut === 'faveur' ? 10 : n.reussite.note == null ? '✓' : Math.round(n.reussite.note) < 10 ? 'NA' : Math.round(n.reussite.note)}</text>
      <text x="${p.x + L - 4}" y="${p.y + 22}" text-anchor="end" font-size="6.2" font-style="italic" fill="#7A879E">${esc(String(n.reussite.annee || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2'))}</text>` : ''}
      <text x="${p.x + 7}" y="${p.y + 22}" font-size="7" fill="${co.texte}" opacity=".85">${esc(court)}</text>
    </g>`;
  }).join('');

  return `<svg viewBox="0 0 ${largeur} ${hauteur}" class="schema" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
  <defs>${marqueurs}</defs>${titres}${sepEI}${fleches}${boites}</svg>`;
}

/** La légende, en HTML, dans les mêmes teintes. */
export function legendeSchemaHtml() {
  const T = teintesSchema();
  const pastille = (co, pointille = false) =>
    `<span style="display:inline-block;width:3.5mm;height:3mm;background:${co.fond};border:0.3mm ${pointille ? 'dashed' : 'solid'} ${co.bord};border-left:0.9mm solid ${co.rail};border-radius:0 0.8mm 0.8mm 0;vertical-align:-0.5mm;margin-right:1.2mm"></span>`;
  const l = [
    [T.acquise, 'réussie'], [T.faveur, 'réussie par faveur'], [T.programme, 'au programme cette année'],
    [T.accessible, 'disponible'], [T.sous_reserve, 'disponible sous réserve', true],
    [T.en_attente, 'ajournée, en attente'], [T.bloquee, 'encore indisponible'],
  ];
  return l.map(([co, t, p]) => `<span style="margin-right:4mm;white-space:nowrap">${pastille(co, p)}${t}</span>`).join('')
    + `<span style="white-space:nowrap">flèche : couleur du bloc d'arrivée · ★ épreuve intégrée · D déterminante</span>`;
}

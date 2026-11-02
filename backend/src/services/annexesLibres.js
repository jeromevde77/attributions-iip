/**
 * TOUTES LES ANNEXES DEVIENNENT DES FENÊTRES (3.5.083, Charles, 2 novembre 2026 : « tu dois intégrer TOUS les documents pour
 * qu'ils deviennent des fenêtres, et ensuite imprimer, comme l'EA12 » ; tranché : une seule mécanique pour toutes).
 *
 * Lucie LIT le modèle Word officiel, une fois rempli de ce qu'elle sait (identité, établissement, contenu propre), et y
 * repère chaque blanc qui reste :
 *   · `texte`  — des pointillés (« ........ », « ____ », « _ _ /_ _ /20_ _ ») dans un paragraphe ;
 *   · `cellule` — une case de tableau vide, nommée par sa voisine de gauche ou par l'en-tête de sa colonne ;
 *   · `grille` — une rangée de cases d'un caractère (un numéro, une date) ;
 *   · `case`   — une case à cocher, nommée par le texte qui la suit.
 * Chaque blanc reçoit un identifiant tiré de son LIBELLÉ et de son rang parmi les blancs du même libellé : une saisie
 * enregistrée retrouve sa place même si Lucie, entre-temps, a appris à remplir un autre blanc du modèle.
 * Écrire, c'est poser chaque valeur à sa place, de la fin du document vers le début (les positions d'avant ne bougent pas).
 */
import { tableaux, paragraphes, episser, ecrireCellule, cocher } from './ea12_fill_officiel.js';

const T = s => [...String(s).replace(/<w:br\/>|<w:tab\/>|<\/w:p>/g, '<w:t> </w:t>').matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
// Un blanc : quatre points ou plus (espacés ou non), des soulignés, ou la date « _ _ /_ _ /20_ _ ».
const BLANC = /(?:_\s*_\s*\/\s*_\s*_\s*\/\s*(?:20)?\s*_\s*_(?:\s*_\s*_)?)|(?:[.…]\s?){4,}|(?:_\s?){3,}/g;
const propre = s => String(s || '').replace(/(?:[.…]\s){2,}[.…]?|\s\/(?=\s|$)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s:;,.\-–—*()]+|[\s:;,.\-–—*(]+$/g, '').trim();
const court = (s, n = 90) => { const t = propre(s); if (t.length <= n) return t; const c = t.slice(-n); return '…' + c.slice(c.indexOf(' ') + 1); };
const debut = (s, n = 90) => { const t = propre(s); return t.length <= n ? t : t.slice(0, n).replace(/\s\S*$/, '') + '…'; };
const norme = s => propre(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 48);

/** Les cellules du document, à plat, avec leur tableau, ligne et colonne. */
function cellules(x) {
  const out = [];
  tableaux(x).forEach((tb, t) => tb.rows.forEach((row, r) => row.forEach((c, k) => out.push({ t, r, c: k, s: c.s, e: c.e }))));
  return out;
}
const dansQuelleCellule = (cs, pos) => {
  let best = null;
  for (const c of cs) if (c.s <= pos && pos < c.e && (!best || c.e - c.s < best.e - best.s)) best = c;
  return best;
};

/** La géométrie d'un tableau : pour chaque cellule, son début et sa fin horizontale (largeurs cumulées), son texte. */
function geometrie(x, tb) {
  return tb.rows.map(row => {
    let g = 0;
    return row.map(c => {
      const xml = x.slice(c.s, c.e);
      const w = Number((/<w:tcW w:w="(\d+)"/.exec(xml) || [])[1] || 0) || 1;
      const brut = T(xml);
      const z = { x0: g, x1: g + w, texte: propre(brut), blanc: !propre(brut.replace(BLANC, '')), pointilles: BLANC.test(brut),
        fusion: /<w:vMerge(?: w:val="continue")?\s*\/>/.test(xml) };
      BLANC.lastIndex = 0;
      g += w; return z;
    });
  });
}
const lettres = s => (String(s).match(/\p{L}/gu) || []).length;
/** Le nom de la colonne d'une case : la ligne d'en-tête la plus proche au-dessus (presque toutes ses cases écrites, sans
 *  blanc), et dans elle la case qui couvre le milieu de celle-ci ; plus le libellé de la ligne (sa première case écrite). */
function nomDeColonne(geo, r, k) {
  const z = geo[r]?.[k]; if (!z) return { colonne: '', ligne: null };
  const mil = (z.x0 + z.x1) / 2;
  const ecrite = c => c && c.texte && !c.blanc && lettres(c.texte) >= 2;
  let h = -1;
  for (let i = r - 1; i >= 0; i--) {
    const ligne = geo[i];
    if (ligne.length > 1 && ligne.filter(ecrite).length >= Math.max(2, Math.ceil(ligne.length * 0.6))) { h = i; break; }
  }
  const sous = i => geo[i].find(c => c.x0 <= mil && mil < c.x1);
  const tete = h >= 0 ? sous(h)?.texte || '' : '';
  const premiere = k > 0 && ecrite(geo[r][0]) ? geo[r][0].texte : '';
  const gauche = k > 0 && ecrite(geo[r][k - 1]) ? geo[r][k - 1].texte : '';
  if (gauche && !(h >= 0 && premiere === gauche && geo.length - h > 2)) return { colonne: gauche, ligne: null };
  if (h < 0) return { colonne: premiere, ligne: null };
  // Le dernier rang d'en-tête (une sous-colonne « du », « au » sous « Dates ») : la numérotation des lignes part de lui.
  let ref = h, colonne = tete;
  for (let i = h + 1; i < r; i++) {
    const c = sous(i);
    if (geo[i].some(ecrite) && !geo[i].some(x => x.pointilles || (!x.texte && !x.fusion))) {
      ref = i; if (ecrite(c) && c.texte !== tete) colonne = tete ? `${tete} — ${c.texte}` : c.texte;
    } else break;
  }
  if (premiere && premiere !== tete) return { colonne: `${court(premiere, 40)} — ${colonne}`, ligne: null };
  return { colonne, ligne: geo.length - ref > 2 ? r - ref : null };
}
const nomComplet = ({ colonne, ligne }) => (colonne ? `${colonne}${ligne ? ` (ligne ${ligne})` : ''}` : '');

/** Les blancs du document `x`, dans l'ordre. */
export function detecter(x) {
  const cs = cellules(x);
  const tabs = tableaux(x);
  const texteCellule = (t, r, c) => { const z = tabs[t]?.rows[r]?.[c]; return z ? propre(T(x.slice(z.s, z.e))) : ''; };
  const geos = tabs.map(tb => geometrie(x, tb));
  const out = [];
  // 1. Les cases à cocher (leur rang dans le document est celui de `cocher`).
  [...x.matchAll(/<w:checkBox>([\s\S]*?)<\/w:checkBox>/g)].forEach((m, i) => {
    const coche = /<w:checked(?: w:val="(?:1|true)")?\s*\/>/.test(m[1]) || /<w:default w:val="1"\/>/.test(m[1]);
    const apres = debut(T(x.slice(m.index, m.index + 1500)).replace(/^\s+/, ''), 80);
    const avant = court(T(x.slice(Math.max(0, m.index - 1500), m.index)), 60);
    out.push({ type: 'case', pos: m.index, index: i, label: (lettres(apres) >= 2 ? apres : '') || avant || `Case ${i + 1}`, coche });
  });
  // 2. Les pointillés, paragraphe par paragraphe.
  const ps = paragraphes(x, 0, x.length);
  let precedent = '';
  ps.forEach(p => {
    const blancs = [...p.texte.matchAll(BLANC)];
    let finPrec = 0;
    blancs.forEach((b, k) => {
      let label = propre(p.texte.slice(finPrec, b.index));
      const place = {};
      if (lettres(label) < 3 || /^\(?\s*JJ\/MM/i.test(label)) {
        const cel = dansQuelleCellule(cs, p.s);
        const nc = cel ? nomDeColonne(geos[cel.t], cel.r, cel.c) : { colonne: '' };
        const col = nomComplet(nc);
        if (col && nc.ligne) Object.assign(place, { t: cel.t, ligne: nc.ligne, colonne: court(nc.colonne) });
        const suite = propre(p.texte.slice(b.index + b[0].length).replace(BLANC, ' '));
        label = col || (suite && lettres(suite) >= 3 && suite.length < 60 ? suite : '') || precedent;
      }
      out.push({ type: 'texte', pos: p.s + 1 + k, para: p.s, rang: k, label: court(label) || 'À compléter', ...place,
        date: /\//.test(b[0]), contexte: debut(p.texte.replace(BLANC, ' ▢ '), 140) });
      finPrec = b.index + b[0].length;
    });
    if (propre(p.texte)) precedent = court(p.texte.replace(BLANC, ' '), 70);
  });
  // 3. Les cases de tableau vides — une rangée de petites cases vides devient UNE grille.
  tabs.forEach((tb, t) => {
    const enTete = tb.rows[0] || [];
    tb.rows.forEach((row, r) => {
      const vides = row.map((c, k) => ({ c, k })).filter(({ c }) => {
        const xml = x.slice(c.s, c.e);
        return !propre(T(xml)) && !/<w:checkBox>|<w:tbl>|<w:vMerge(?: w:val="continue")?\s*\/>/.test(xml);
      });
      if (!vides.length) return;
      // Une grille : au moins quatre cases vides, étroites, côte à côte.
      const larg = c => Number((/<w:tcW w:w="(\d+)"/.exec(x.slice(c.s, c.e)) || [])[1] || 0);
      const etroites = vides.filter(({ c }) => larg(c) > 0 && larg(c) < 700);
      if (etroites.length >= 4 && etroites.length >= vides.length - 1) {
        const k0 = etroites[0].k;
        const avantTab = [...ps].reverse().find(p => p.e <= row[0].s && lettres(p.texte) >= 2 && dansQuelleCellule(cs, p.s)?.t !== t);
        const label = (k0 > 0 && texteCellule(t, r, k0 - 1)) || (avantTab ? court(avantTab.texte.replace(BLANC, ' '), 70) : '') || 'Numéro';
        out.push({ type: 'grille', pos: row[k0].s, t, r, cases: etroites.map(z => z.k), label: court(label), n: etroites.length });
        return;
      }
      vides.forEach(({ c, k }) => {
        const nc = nomDeColonne(geos[t], r, k);
        const label = nomComplet(nc);
        // Une case sans rien qui la nomme, ou nommée par un long paragraphe (un titre voisin) : de la mise en page.
        if (!label || label.startsWith('…')) return;
        out.push({ type: 'cellule', pos: c.s, t, r, c: k, label: court(label), ...(nc.ligne ? { ligne: nc.ligne, colonne: court(nc.colonne) } : {}) });
      });
    });
  });
  // Une signature se pose à la main, sur le papier : elle n'est pas un blanc à taper.
  const aSigner = f => /^(signature|cachet)\b/i.test(f.label) || /\bsignature( obligatoire)?$/i.test(f.label);
  for (let i = out.length - 1; i >= 0; i--) if (out[i].type !== 'case' && aSigner(out[i])) out.splice(i, 1);
  out.sort((a, b) => a.pos - b.pos);
  // L'identifiant : type, libellé et rang parmi les mêmes.
  const vus = new Map();
  for (const f of out) {
    const base = `${f.type}:${norme(f.label)}`;
    const n = vus.get(base) || 0; vus.set(base, n + 1);
    f.id = `${base}#${n}`;
  }
  return out;
}

/** Ce que la fenêtre montre : les blancs, sans leurs positions. */
export const champsPublics = champs => champs.map(f => ({ id: f.id, type: f.type, label: f.label, date: !!f.date, n: f.n || null,
  tableau: f.ligne ? f.t : null, ligne: f.ligne || null, colonne: f.colonne || null,
  coche: f.type === 'case' ? !!f.coche : undefined, contexte: f.contexte || null }));

/** Écrit `valeurs` ({ id: texte | true }) dans `x`, de la fin vers le début. */
export function appliquer(x, valeurs = {}) {
  const champs = detecter(x).filter(f => {
    const v = valeurs[f.id];
    return f.type === 'case' ? v === true && !f.coche : v != null && String(v).trim() !== '';
  });
  for (const f of champs.sort((a, b) => b.pos - a.pos)) {
    const v = valeurs[f.id];
    if (f.type === 'case') x = cocher(x, f.index);
    else if (f.type === 'cellule') x = ecrireCellule(x, f.t, f.r, f.c, String(v));
    else if (f.type === 'grille') {
      const chars = String(v).replace(/\s/g, '').split('').slice(0, f.cases.length);
      for (let i = chars.length - 1; i >= 0; i--) x = ecrireCellule(x, f.t, f.r, f.cases[i], chars[i]);
    } else {
      // Le paragraphe relu tel qu'il est maintenant ; les blancs après celui-ci sont déjà remplis : son rang n'a pas bougé.
      const p = paragraphes(x, f.para, f.para + 1)[0];
      if (!p || p.s !== f.para) continue;
      const b = [...p.texte.matchAll(BLANC)][f.rang];
      if (!b) continue;
      x = episser(x, p, b.index, b.index + b[0].length, ` ${String(v).trim()} `);
    }
  }
  return x;
}

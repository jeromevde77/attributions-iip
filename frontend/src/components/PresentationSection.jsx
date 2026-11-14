import { useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconMaximize, IconMinimize, IconPresentation, IconPencil, IconRefresh, IconDownload } from '@tabler/icons-react';
import { BarChart, Bar, Cell, PieChart, Pie, XAxis, YAxis, CartesianGrid, LabelList, Legend, LineChart, Line } from 'recharts';
import { authHeaders, getAnnee } from '../lib/api.js';
import { useIdentite } from '../lib/identite.js';
import { ETOILES, TRAITS, ECLAT, POINTS_L } from '../lib/logoVierge.js';
import { chiffresIipHelb } from './IipHelbGestion.jsx';
import { useCartes, CLASSES } from './CarteCommunes.jsx';
import { listePays } from '../lib/pays.js';

/* LA PRÉSENTATION D'UNE SECTION (3.5.446, Charles, 14 novembre 2026 : « jeudi je dois présenter la section imagerie médicale au CA,
   sous tous les axes : chiffres de population, grandeurs qualitatives (sexe, provenance…), résultats des étudiants, points forts et
   faibles… une présentation grandiose » ; « dans Lucie, avec un export possible en PPT » ; 30 à 45 minutes ; « je propose, tu
   corriges » pour forces et faiblesses ; modèle : la présentation du parcours du secrétariat — 16:9, nuit #001A70, bleu #2A7DB8, Inter).
   Gestion → Présenter une section (direction).

   UN MODÈLE, DEUX DESSINS. `composer()` range chaque diapositive en BLOCS posés au pixel sur une scène de 1280 × 720 (= 13,33 × 7,5
   pouces à 96 px par pouce) : l'écran les dessine en HTML et SVG, l'export les rend en PowerPoint (pptxgenjs, servi par Lucie dans
   /vendor comme pdf.js : pas de dépendance npm), avec des graphiques NATIFS, modifiables. Les chiffres viennent des routes de Gestion —
   population, délibérations, IIP et HELB (avec les réglages de cette page) — ; les textes (phrases à retenir, forces, faiblesses,
   notes de l'orateur) sont PROPOSÉS d'après les chiffres et se corrigent : ils sont gardés par section sur le serveur. Couleurs en
   hexadécimal : attributs SVG et fichier PowerPoint, où var() ne s'évalue pas (CLAUDE.md §6). */

const W = 1280, H = 720, M = 72, CW = W - 2 * M;
const C = { nuit: '#001A70', nuit2: '#0B2A86', bleu: '#2A7DB8', ciel: '#3A97C9', clair: '#BCC6E8', gris: '#5B6B7C', encre: '#1B2B4B',
  pale: '#F5FAFE', filet: '#D8DCE4', or: '#F9B619', iip: '#19537E', helb: '#C2408A', vert: '#3E7D5E', ocre: '#B45309', brique: '#9D4A38',
  violet: '#6B46C1', blanc: '#FFFFFF' };
const SERIE = [C.bleu, C.or, C.helb, C.vert, '#05B7E6', C.ocre, C.violet, '#94A3B8'];
const POLICE = "Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const n0 = v => Math.round(v || 0).toLocaleString('fr-BE');
const n1 = v => (v || 0).toLocaleString('fr-BE', { maximumFractionDigits: 1 });
const eur = v => `${n0(v)} €`;
const pc = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const court = a => `${String(a).slice(2, 4)}-${String(a).slice(7, 9)}`;
const COULEUR_DEPT = { 'Santé': '#5DADE2', 'COMAV': '#9F7AEA', 'Technoeco': '#1F2937', 'Social': '#DC2626', 'IIP': '#F9B619' };
const NOMS_SECTION = { TIM: 'Imagerie médicale', AeSI: 'Soins infirmiers', Psychomotricité: 'Psychomotricité', Optométrie: 'Optométrie',
  Orthoptie: 'Orthoptie', Optique: 'Optique', ATNUP: 'ATNUP', Soins_plaies: 'Soins de plaies' };
const jeudiProchain = () => {
  const d = new Date(); d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7));
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

/* LES CARTES ET LES SILHOUETTES (3.5.446, Charles : « des cartes de Belgique, d'Europe et du monde pour la provenance ; des icônes de
   femmes et d'hommes »). Dessinées en SVG écrit à la main — la même chaîne sert l'écran et, rendue en image, le PowerPoint. Les contours
   sont ceux de Gestion → Population (public/carte/), les classes de couleur aussi (CarteCommunes.jsx). */
const TONS = [16, 34, 52, 72, 100];
const melange = (hexa, p) => { const v = parseInt(hexa.slice(1), 16); const c = [v >> 16, (v >> 8) & 255, v & 255].map(x => Math.round(x * p / 100 + 255 * (1 - p / 100))); return `#${c.map(x => x.toString(16).padStart(2, '0')).join('')}`; };
const couleurClasse = (n, base) => (!n || !base ? '#EEF1F6' : melange('#16406A', TONS[Math.max(0, CLASSES.findIndex(([, a, b]) => (n / base) * 100 >= a && (n / base) * 100 < b))]));
const nu = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const EUROPE = ['FR', 'PT', 'ES', 'IE', 'GB', 'NO', 'SE', 'FI', 'DK', 'DE', 'PL', 'IT', 'GR', 'RO', 'BG', 'HU', 'AT', 'CZ', 'SK', 'NL', 'BE', 'CH', 'EE', 'LV', 'LT', 'HR', 'RS', 'BA', 'AL', 'MK', 'SI', 'UA', 'BY', 'MD', 'LU', 'ME', 'XK', 'TR', 'CY', 'IS'];
function boiteChemin(d) {
  const v = String(d).match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < v.length; i += 2) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); }
  return [x0, y0, x1, y1];
}
function svgCarte(b, cartes) {
  const { be, monde } = cartes || {};
  const v = b.valeurs || {}, base = b.base || Object.values(v).reduce((t, n) => t + n, 0);
  if (b.quelle === 'belgique' || b.quelle === 'bruxelles') {
    if (!be) return '';
    const bx = b.quelle === 'bruxelles';
    const cs = bx ? be.communes.filter(c => c.dbx) : be.communes;
    const [w, h] = bx ? [be.bruxelles.largeur, be.bruxelles.hauteur] : [be.largeur, be.hauteur];
    const pt = be.campus?.[bx ? 'bx' : 'be'];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${cs.map(c =>
      `<path d="${bx ? c.dbx : c.d}" fill="${couleurClasse(v[c.nis] || 0, base)}" stroke="${bx ? '#FFFFFF' : '#CBD5E1'}" stroke-width="${bx ? 1.4 : 0.5}" fill-rule="evenodd"/>`).join('')}${pt ? `<circle cx="${pt[0]}" cy="${pt[1]}" r="${bx ? 13 : 9}" fill="${C.or}" stroke="${C.nuit}" stroke-width="${bx ? 3.5 : 2.5}"/>` : ''}</svg>`;
  }
  if (!monde) return '';
  const boites = monde.pays.map(p => ({ p, bt: boiteChemin(p.d) }));
  const dedans = b.quelle === 'europe' ? boites.filter(x => EUROPE.includes(x.p.iso) && !['FR', 'IS', 'TR', 'CY', 'NO'].includes(x.p.iso)) : boites.filter(x => v[x.p.iso]);
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { bt } of (dedans.length ? dedans : boites)) { x0 = Math.min(x0, bt[0]); y0 = Math.min(y0, bt[1]); x1 = Math.max(x1, bt[2]); y1 = Math.max(y1, bt[3]); }
  const m = 14; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(monde.largeur, x1 + m); y1 = Math.min(monde.hauteur, y1 + m);
  const rapport = b.w / b.h;
  if ((x1 - x0) / (y1 - y0) < rapport) { const aj = ((y1 - y0) * rapport - (x1 - x0)) / 2; x0 = Math.max(0, x0 - aj); x1 = Math.min(monde.largeur, x1 + aj); }
  else { const aj = ((x1 - x0) / rapport - (y1 - y0)) / 2; y0 = Math.max(0, y0 - aj); y1 = Math.min(monde.hauteur, y1 + aj); }
  const sw = Math.max(0.2, (x1 - x0) / 1600);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${monde.pays.map(p =>
    `<path d="${p.d}" fill="${couleurClasse(v[p.iso] || 0, base)}" stroke="#CBD5E1" stroke-width="${sw}" fill-rule="evenodd"/>`).join('')}</svg>`;
}
/** Vingt silhouettes : une pour 5 %, femmes en framboise, hommes en bleu. */
function svgIsotype(b) {
  const tot = (b.f || 0) + (b.m || 0) || 1, nf = Math.round((b.f / tot) * 20), cols = 10, cw = b.w / cols, rh = b.h / 2;
  const sil = (x, y, femme, coul) => {
    const s = Math.min(cw / 40, rh / 100), cx = x + cw / 2, t = y + (rh - 96 * s) / 2;
    const tete = `<circle cx="${cx}" cy="${t + 11 * s}" r="${10 * s}" fill="${coul}"/>`;
    const corps = femme
      ? `<path d="M${cx - 9 * s} ${t + 25 * s} L${cx + 9 * s} ${t + 25 * s} L${cx + 17 * s} ${t + 62 * s} L${cx - 17 * s} ${t + 62 * s} Z" fill="${coul}"/><rect x="${cx - 7 * s}" y="${t + 61 * s}" width="${5 * s}" height="${33 * s}" rx="${2 * s}" fill="${coul}"/><rect x="${cx + 2 * s}" y="${t + 61 * s}" width="${5 * s}" height="${33 * s}" rx="${2 * s}" fill="${coul}"/>`
      : `<rect x="${cx - 12 * s}" y="${t + 25 * s}" width="${24 * s}" height="${38 * s}" rx="${5 * s}" fill="${coul}"/><rect x="${cx - 11 * s}" y="${t + 58 * s}" width="${9.5 * s}" height="${36 * s}" rx="${2.5 * s}" fill="${coul}"/><rect x="${cx + 1.5 * s}" y="${t + 58 * s}" width="${9.5 * s}" height="${36 * s}" rx="${2.5 * s}" fill="${coul}"/>`;
    return tete + corps;
  };
  let out = '';
  for (let k = 0; k < 20; k++) { const femme = k < nf; out += sil((k % cols) * cw, Math.floor(k / cols) * rh, femme, femme ? C.helb : C.bleu); }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b.w} ${b.h}" width="100%" height="100%">${out}</svg>`;
}

/* ------------------------------------------------------------------ LES DIAPOSITIVES ------------------------------------------- */

function composer(D, T) {
  const { section, nom, pop, stats, ih, annee } = D;
  const s = pop?.sections?.[0] || {};
  const iipEns = pop?.ensemble || {};
  const t = (cle, defaut) => (T[cle] !== undefined && T[cle] !== '' ? T[cle] : defaut);
  const lignes = (cle, defaut) => t(cle, defaut.join('\n')).split('\n').map(x => x.trim()).filter(Boolean);
  const pieds = [];
  const diapos = [];
  const ajouter = d => { diapos.push(d); return d; };

  // Les années de la section (population de référence, puis Lucie).
  const evo = (pop?.evolution || []).map(e => ({ annee: e.annee, n: e.par_section?.[section] || 0, total: e.total })).filter(e => e.n > 0);
  const premiere = evo[0], derniere = evo[evo.length - 1];
  // Les résultats : les années dont la première session est décidée.
  const res = (stats || []).filter(x => x.sec?.total?.s1?.decides > 0);
  const resC = res.filter(x => (x.sec.total.final?.en_attente || 0) / Math.max(1, x.sec.total.inscrits) < 0.2);
  const rN = resC[resC.length - 1] || res[res.length - 1];
  // L'IIP et la HELB.
  const IH = ih?.d ? chiffresIipHelb(ih.d, ih.reglages) : null;
  const yN = IH?.Y?.[IH.Y.length - 1], hN = IH?.HY?.[IH.HY.length - 1]?.h;
  const timH = ih?.d?.comparaison?.cursus?.find(c => c.tim), moyH = ih?.d?.comparaison?.moyennes?.['Moyenne HELB'];
  const apport = IH ? IH.HY.reduce((a, x) => a + (x.y.admin?.part || 0) + IH.u95(x.y), 0) : 0;

  /* — les blocs communs — */
  const entete = (kicker, titre) => [
    { k: 'texte', x: M, y: 38, w: CW, h: 22, texte: kicker.toUpperCase(), taille: 13, couleur: C.bleu, gras: true, espace: 2 },
    { k: 'texte', x: M, y: 60, w: CW, h: 50, texte: titre, taille: 32, couleur: C.nuit, gras: true },
  ];
  const retenir = (cle, defaut) => {
    const txt = t(`retenir.${cle}`, defaut);
    pieds.push(cle);
    return [
      { k: 'rect', x: M, y: 612, w: CW, h: 56, fond: C.pale, rayon: 0 },
      { k: 'rect', x: M, y: 612, w: 5, h: 56, fond: C.or },
      { k: 'texte', x: M + 22, y: 612, w: 120, h: 56, texte: 'À RETENIR', taille: 11, couleur: C.ocre, gras: true, espace: 1.5, vcentre: true },
      { k: 'texte', x: M + 140, y: 612, w: CW - 160, h: 56, texte: txt, taille: 17, couleur: C.encre, italique: true, vcentre: true, edit: `retenir.${cle}` },
    ];
  };
  const tuileSombre = (x, y, w, h, valeur, libelle, precision, couleur = C.nuit) => [
    { k: 'rect', x, y, w, h, fond: couleur, rayon: 10 },
    { k: 'texte', x: x + 24, y: y + 16, w: w - 48, h: 54, texte: valeur, taille: String(valeur).length > 9 ? 31 : String(valeur).length > 7 ? 35 : 40, couleur: C.blanc, gras: true, vcentre: true },
    { k: 'texte', x: x + 24, y: y + 72, w: w - 48, h: 26, texte: libelle, taille: 15, couleur: C.clair, gras: true },
    precision ? { k: 'texte', x: x + 24, y: y + 98, w: w - 48, h: h - 106, texte: precision, taille: 12.5, couleur: C.clair } : null,
  ].filter(Boolean);
  const tuileClaire = (x, y, w, h, valeur, libelle, precision, couleur = C.bleu) => [
    { k: 'rect', x, y, w, h, fond: C.blanc, bord: C.filet, rayon: 10 },
    { k: 'rect', x, y, w: 6, h, fond: couleur },
    { k: 'texte', x: x + 22, y: y + 12, w: w - 34, h: 42, texte: valeur, taille: 30, couleur, gras: true },
    { k: 'texte', x: x + 22, y: y + 54, w: w - 34, h: 22, texte: libelle, taille: 14, couleur: C.encre, gras: true },
    precision ? { k: 'texte', x: x + 22, y: y + 76, w: w - 34, h: h - 80, texte: precision, taille: 12, couleur: C.gris } : null,
  ].filter(Boolean);
  const intertitreBloc = (x, y, w, txt) => ({ k: 'texte', x, y, w, h: 24, texte: txt, taille: 15, couleur: C.encre, gras: true });
  const legendeClasses = (x, y, campus = false) => {
    const r = []; let cx = x;
    CLASSES.forEach(([l], i) => { r.push({ k: 'rect', x: cx, y: y + 3, w: 16, h: 12, fond: melange('#16406A', TONS[i]), rayon: 2 },
      { k: 'texte', x: cx + 21, y, w: 110, h: 18, texte: l, taille: 12, couleur: C.gris }); cx += 120; });
    if (campus) r.push({ k: 'rect', x: cx + 4, y: y + 2, w: 14, h: 14, fond: C.or, rayon: 7 }, { k: 'texte', x: cx + 24, y, w: 140, h: 18, texte: 'Campus Erasme', taille: 12, couleur: C.gris });
    return r;
  };
  const isoDe = (() => { const m = new Map(listePays().map(p => [nu(p.nom), p.code])); return nom => m.get(nu(nom)); })();
  const parIso = {}; for (const [nomPays, n] of Object.entries(s.pays || {})) { const c = isoDe(nomPays); if (c) parIso[c] = (parIso[c] || 0) + n; }
  const separateur = (num, titre, sous, icone) => ajouter({ id: `sep${num}`, fond: C.nuit, blocs: [
    { k: 'texte', x: 760, y: -40, w: 520, h: 520, texte: String(num), taille: 380, couleur: C.nuit2, gras: true, align: 'right' },
    { k: 'rect', x: M, y: 300, w: 96, h: 96, fond: C.bleu, rayon: 14 },
    { k: 'texte', x: M, y: 300, w: 96, h: 96, texte: icone, taille: 40, couleur: C.blanc, gras: true, align: 'center', vcentre: true },
    { k: 'texte', x: M + 130, y: 288, w: 900, h: 24, texte: `PARTIE ${num}`, taille: 14, couleur: C.ciel, gras: true, espace: 2 },
    { k: 'texte', x: M + 130, y: 312, w: 1000, h: 64, texte: titre, taille: 46, couleur: C.blanc, gras: true },
    { k: 'texte', x: M + 130, y: 384, w: 900, h: 60, texte: sous, taille: 18, couleur: C.clair },
  ], notes: t(`notes.sep${num}`, sous), notesCle: `notes.sep${num}` });

  /* 1. COUVERTURE */
  ajouter({ id: 'couverture', fond: C.nuit, blocs: [
    { k: 'logo', x: M, y: 48, w: 150, h: 64 },
    { k: 'texte', x: 640, y: 54, w: 568, h: 40, texte: 'INSTITUT ILYA PRIGOGINE\nENSEIGNEMENT POUR ADULTES', taille: 11, couleur: C.clair, gras: true, espace: 2, align: 'right' },
    { k: 'vierge', x: 760, y: 150, w: 440, h: 330 },
    { k: 'texte', x: M, y: 232, w: 700, h: 22, texte: t('couv.kicker', 'PRÉSENTATION AU CONSEIL D’ADMINISTRATION'), taille: 13, couleur: C.ciel, gras: true, espace: 2, edit: 'couv.kicker' },
    { k: 'texte', x: M, y: 262, w: 760, h: 150, texte: t('couv.titre', nom), taille: 60, couleur: C.blanc, gras: true, edit: 'couv.titre' },
    { k: 'rect', x: M, y: 420, w: 150, h: 4, fond: C.ciel },
    { k: 'texte', x: M, y: 444, w: 760, h: 80, texte: t('couv.sous', `La section ${section} sous tous ses angles : sa croissance, ses étudiants, leurs résultats, ce qu’elle coûte et ce qu’elle rapporte.`), taille: 19, couleur: C.clair, edit: 'couv.sous' },
    { k: 'rect', x: M, y: 600, w: CW, h: 1, fond: C.nuit2 },
    { k: 'texte', x: M, y: 616, w: 700, h: 44, texte: t('couv.orateur', 'Présentation de Charles Sohet, directeur'), taille: 13, couleur: C.clair, edit: 'couv.orateur' },
    { k: 'texte', x: 760, y: 616, w: 448, h: 44, texte: t('couv.date', `Conseil d’administration — ${jeudiProchain()}`), taille: 13, couleur: C.clair, align: 'right', edit: 'couv.date' },
  ], notes: t('notes.couverture', `Merci de m’accorder ce temps. Je vous présente la section ${nom} : d’où elle vient, qui sont ses étudiants, comment ils réussissent, ce qu’elle coûte et ce qu’elle rapporte, puis ses forces et ses fragilités.`), notesCle: 'notes.couverture' });

  /* 2. EN UN REGARD */
  {
    const fois = premiere && derniere && premiere.n ? derniere.n / premiere.n : null;
    const bl = [...entete('En un regard', `${nom} en quatre chiffres`)];
    const w4 = (CW - 3 * 24) / 4;
    const cles = [
      [n0(derniere?.n || s.n), `inscrits en ${derniere?.annee || annee}`, premiere ? `${n0(premiere.n)} à l’ouverture en ${premiere.annee}` : ''],
      [fois ? `× ${n1(fois)}` : '—', 'de croissance', premiere && derniere ? `de ${premiere.annee} à ${derniere.annee}` : ''],
      [rN ? `${n0(rN.sec.total.final.taux_reussite)} %` : '—', `de réussite finale`, rN ? `${rN.annee}, après la seconde session` : ''],
      [timH ? `${n0(timH.ratio)}` : '—', 'étudiants par ETP', moyH ? `moyenne de la HELB : ${n0(moyH)}` : ''],
    ];
    cles.forEach((c, i) => bl.push(...tuileSombre(M + i * (w4 + 24), 150, w4, 170, ...c, i === 3 ? C.vert : C.nuit)));
    const parts = [
      ['Population', 'croissance, blocs, place dans l’IIP'], ['Profil', 'sexe, âge, nationalités, domicile, accès'],
      ['Résultats', 'sessions, blocs, unités'], ['Finances', 'charge, coût, apport, comparaison HELB'], ['Bilan', 'forces, faiblesses, demandes'],
    ];
    const w5 = (CW - 4 * 16) / 5;
    parts.forEach(([a, b], i) => {
      const x = M + i * (w5 + 16);
      bl.push({ k: 'rect', x, y: 372, w: 40, h: 40, fond: C.bleu, rayon: 8 },
        { k: 'texte', x, y: 372, w: 40, h: 40, texte: String(i + 1), taille: 18, couleur: C.blanc, gras: true, align: 'center', vcentre: true },
        { k: 'texte', x, y: 424, w: w5, h: 26, texte: a, taille: 18, couleur: C.nuit, gras: true },
        { k: 'texte', x, y: 452, w: w5, h: 60, texte: b, taille: 13.5, couleur: C.gris });
    });
    bl.push(...retenir('regard', fois ? `En ${evo.length} ans, la section a été multipliée par ${n1(fois)} — sans coût supplémentaire pour l’IIP.` : 'Une section jeune, en forte croissance.'));
    ajouter({ id: 'regard', blocs: bl, notes: t('notes.regard', 'Quatre chiffres pour poser le décor ; la suite les explique un par un, en cinq parties.'), notesCle: 'notes.regard' });
  }

  /* PARTIE 1 — LA POPULATION */
  separateur(1, 'La population', 'Une section ouverte en ' + (premiere?.annee || '—') + ', qui a trouvé son public.', '↗');
  if (evo.length) {
    const bl = [...entete('Population', 'Une croissance continue depuis l’ouverture')];
    bl.push({ k: 'graphe', type: 'barres', x: M, y: 140, w: 700, h: 450, categories: evo.map(e => e.annee), series: [{ nom: 'Inscrits', valeurs: evo.map(e => e.n), couleur: C.bleu }], titre: `Inscrits en ${section}, par année` });
    const partIIP = derniere?.total ? pc(derniere.n, derniere.total) : 0, part0 = premiere?.total ? pc(premiere.n, premiere.total) : 0;
    bl.push(...tuileClaire(M + 740, 150, CW - 740, 130, `${partIIP} %`, `des étudiants de l’IIP en ${derniere?.annee}`, `${part0} % en ${premiere?.annee}`, C.or));
    const croit = evo.length > 1 ? evo.slice(1).map((e, i) => `${court(e.annee)} : ${evo[i].n ? `+${pc(e.n - evo[i].n, evo[i].n)} %` : '—'}`).join('  ·  ') : '';
    bl.push(...tuileClaire(M + 740, 300, CW - 740, 130, `${n0(derniere.n)}`, `inscrits en ${derniere.annee}`, croit, C.bleu));
    bl.push(...retenir('croissance', `De ${n0(premiere.n)} à ${n0(derniere.n)} étudiants : la section pèse aujourd’hui ${partIIP} % de l’IIP.`));
    ajouter({ id: 'croissance', blocs: bl, notes: t('notes.croissance', 'Chiffres de référence pour les années passées (les inscrits retenus par l’école), Lucie pour l’année en cours.'), notesCle: 'notes.croissance' });
  }
  if (derniere) {
    const e = (pop?.evolution || []).find(x => x.annee === derniere.annee);
    const parS = Object.entries(e?.par_section || {}).sort((a, b) => b[1] - a[1]);
    const bl = [...entete('Population', `La plus grande section de l’IIP en ${derniere.annee}`)];
    bl.push({ k: 'graphe', type: 'donut', x: M, y: 140, w: 560, h: 450, categories: parS.map(([k]) => k), series: [{ nom: 'Étudiants', valeurs: parS.map(([, v]) => v) }],
      couleurs: parS.map(([k], i) => (k === section ? C.bleu : ['#C9D6E8', '#AFC2DA', '#93ACCB', '#E2E8F0', '#B8C5D6', '#D5DEEA', '#A3B5CC', '#CBD5E1'][i % 8])), titre: 'Étudiants par section' });
    const blocs = Object.entries(s.par_niveau || {}).sort();
    bl.push(intertitreBloc(M + 600, 150, 500, `${section} par bloc, ${annee}`));
    bl.push({ k: 'graphe', type: 'barres', x: M + 600, y: 180, w: CW - 600, h: 250, categories: blocs.map(([k]) => k), series: [{ nom: 'Étudiants', valeurs: blocs.map(([, v]) => v), couleur: C.nuit }] });
    bl.push(...tuileClaire(M + 600, 450, (CW - 620) / 2, 130, n0(s.primo), 'primo-inscrits', `${pc(s.primo, s.n)} % de la section`, C.vert));
    bl.push(...tuileClaire(M + 620 + (CW - 620) / 2, 450, (CW - 620) / 2, 130, n0(blocs.find(b => b[0] === 'BA3')?.[1] || s.ba3), 'en dernière année', 'la première cohorte vers le diplôme', C.or));
    bl.push(...retenir('place', `${pc(s.n || derniere.n, e?.total)} % des étudiants de l’IIP ; ${pc(s.primo, s.n)} % de nouveaux chaque année.`));
    ajouter({ id: 'place', blocs: bl, notes: t('notes.place', `Une section qui attire : ${pc(s.primo, s.n)} % de primo-inscrits, et une cohorte en dernière année.`), notesCle: 'notes.place' });
  }

  /* PARTIE 2 — LE PROFIL */
  separateur(2, 'Qui sont nos étudiants', 'Des adultes, en majorité des femmes, venus de Bruxelles et du monde.', '◎');
  if (s.n) {
    const sexeConnu = (s.F || 0) + (s.M || 0) + (s.X || 0);
    const bl = [...entete('Profil', 'Des adultes, en majorité des femmes')];
    bl.push(intertitreBloc(M, 140, 480, 'Sexe — une silhouette pour 5 %'));
    bl.push({ k: 'isotype', x: M, y: 180, w: 470, h: 260, f: s.F, m: s.M });
    bl.push({ k: 'texte', x: M, y: 462, w: 230, h: 60, texte: `${pc(s.F, sexeConnu)} %`, taille: 46, couleur: C.helb, gras: true },
      { k: 'texte', x: M, y: 522, w: 230, h: 24, texte: `femmes · ${n0(s.F)}`, taille: 15, couleur: C.encre, gras: true },
      { k: 'texte', x: M + 240, y: 462, w: 230, h: 60, texte: `${pc(s.M, sexeConnu)} %`, taille: 46, couleur: C.bleu, gras: true },
      { k: 'texte', x: M + 240, y: 522, w: 230, h: 24, texte: `hommes · ${n0(s.M)}`, taille: 15, couleur: C.encre, gras: true });
    const ages = [['< 25 ans', s.m25], ['25-34 ans', s.m35], ['35-44 ans', s.m45], ['45 ans et +', s.p45]];
    bl.push({ k: 'graphe', type: 'barres', x: M + 520, y: 140, w: 400, h: 440, categories: ages.map(a => a[0]), series: [{ nom: 'Étudiants', valeurs: ages.map(a => a[1] || 0), couleur: C.bleu }], titre: 'Âge' });
    bl.push(...tuileSombre(M + 950, 150, CW - 950, 200, `${n0(s.age_moyen)} ans`, 'âge moyen', iipEns.age_moyen ? `IIP : ${n0(iipEns.age_moyen)} ans` : ''));
    bl.push(...tuileClaire(M + 950, 370, CW - 950, 200, `${pc(s.F, sexeConnu)} %`, 'de femmes', iipEns.n ? `IIP : ${pc(iipEns.F, (iipEns.F || 0) + (iipEns.M || 0) + (iipEns.X || 0))} %` : '', C.helb));
    bl.push(...retenir('sexe', `${pc(s.F, sexeConnu)} % de femmes, ${n0(s.age_moyen)} ans en moyenne : un public d’adultes en reprise d’études.`));
    ajouter({ id: 'sexe', blocs: bl, notes: t('notes.sexe', 'Comparaison avec l’ensemble de l’IIP dans les tuiles de droite.'), notesCle: 'notes.sexe' });

    const pays = Object.entries(s.pays || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const bl2 = [...entete('Profil', 'Une section ouverte sur le monde')];
    bl2.push(intertitreBloc(M, 136, 760, `${Object.keys(parIso).length} nationalités sur la carte du monde`));
    bl2.push({ k: 'carte', quelle: 'monde', x: M, y: 166, w: 760, h: 380, valeurs: parIso });
    bl2.push(...legendeClasses(M, 560));
    bl2.push({ k: 'graphe', type: 'barresH', x: M + 790, y: 136, w: CW - 790, h: 330, categories: pays.map(p => p[0]), series: [{ nom: 'Étudiants', valeurs: pays.map(p => p[1]), couleur: C.bleu }], titre: 'Les huit premières' });
    [['Belges', s.be, C.nuit], ['UE', s.ue, C.bleu], ['Hors UE', s.hors_ue, C.or]].forEach(([l, n, c], k) => {
      const w3 = (CW - 790 - 16) / 3, x = M + 790 + k * (w3 + 8);
      bl2.push({ k: 'rect', x, y: 482, w: w3, h: 100, fond: C.blanc, bord: C.filet, rayon: 8 }, { k: 'rect', x, y: 482, w: 5, h: 100, fond: c },
        { k: 'texte', x: x + 14, y: 492, w: w3 - 20, h: 40, texte: `${pc(n, s.n)} %`, taille: 28, couleur: c, gras: true },
        { k: 'texte', x: x + 14, y: 534, w: w3 - 20, h: 40, texte: `${l}\n${n0(n)} étudiants`, taille: 12, couleur: C.gris });
    });
    bl2.push(...retenir('nationalites', `${pc(s.hors_ue, s.n)} % de nationalités hors Union européenne : une attractivité internationale réelle.`));
    ajouter({ id: 'nationalites', blocs: bl2, notes: t('notes.nationalites', 'La nationalité n’est pas le domicile : la plupart vivent en Belgique, voir plus loin.'), notesCle: 'notes.nationalites' });

    const euro = Object.fromEntries(Object.entries(parIso).filter(([c]) => EUROPE.includes(c)));
    const listeEuro = Object.entries(euro).sort((a, b) => b[1] - a[1]);
    const nomIso = Object.fromEntries(listePays().map(p => [p.code, p.nom]));
    const totEuro = listeEuro.reduce((a, [, n]) => a + n, 0);
    const bl5 = [...entete('Profil', 'L’Europe dans la section')];
    bl5.push({ k: 'carte', quelle: 'europe', x: M, y: 140, w: 700, h: 420, valeurs: euro });
    bl5.push(...legendeClasses(M, 572));
    bl5.push({ k: 'graphe', type: 'barresH', x: M + 730, y: 140, w: CW - 730, h: 300, categories: listeEuro.slice(0, 7).map(([c]) => nomIso[c] || c), series: [{ nom: 'Étudiants', valeurs: listeEuro.slice(0, 7).map(([, n]) => n), couleur: C.nuit }], titre: 'Nationalités européennes' });
    bl5.push(...tuileClaire(M + 730, 456, CW - 730, 120, `${n0(totEuro)}`, 'étudiants de nationalité européenne', `${pc(totEuro, s.n)} % de la section, Belges compris`, C.bleu));
    bl5.push(...retenir('europe', `${listeEuro.length} nationalités européennes ; ${pc(s.ue, s.n)} % d’Européens non belges.`));
    ajouter({ id: 'europe', blocs: bl5, notes: t('notes.europe', ''), notesCle: 'notes.europe' });

    const dom = s.domicile || {};
    const communes = (dom.communes || []).slice(0, 8);
    const bl3 = [...entete('Profil', 'Une section bruxelloise, ouverte aux trois régions')];
    const parNis = dom.par_nis || {}, belges = Object.values(parNis).reduce((a, n) => a + n, 0);
    const bxlN = dom.bruxelles || 0;
    bl3.push(intertitreBloc(M, 136, 540, 'La Belgique'), intertitreBloc(M + 560, 136, 330, 'Bruxelles'));
    bl3.push({ k: 'carte', quelle: 'belgique', x: M, y: 166, w: 540, h: 400, valeurs: parNis, base: belges });
    bl3.push({ k: 'carte', quelle: 'bruxelles', x: M + 560, y: 166, w: 330, h: 330, valeurs: parNis, base: bxlN });
    bl3.push(...legendeClasses(M, 578, true));
    [['Bruxelles', dom.bruxelles, C.nuit], ['Wallonie', dom.wallonie, C.or], ['Flandre', dom.flandre, C.ciel]].forEach(([l, n, c], k) => {
      const x = M + 920, y = 166 + k * 112;
      bl3.push({ k: 'rect', x, y, w: CW - 920, h: 100, fond: C.blanc, bord: C.filet, rayon: 8 }, { k: 'rect', x, y, w: 5, h: 100, fond: c },
        { k: 'texte', x: x + 16, y: y + 10, w: CW - 940, h: 42, texte: `${pc(n, s.n)} %`, taille: 32, couleur: c === C.or ? '#B7860B' : c, gras: true },
        { k: 'texte', x: x + 16, y: y + 56, w: CW - 940, h: 36, texte: `${l} · ${n0(n)}`, taille: 13.5, couleur: C.encre, gras: true });
    });
    bl3.push({ k: 'texte', x: M + 560, y: 506, w: 330, h: 60, texte: communes.slice(0, 3).map(c => `${c.nom.replace(/^\d+ /, '')} ${n0(c.n)}`).join(' · '), taille: 12.5, couleur: C.gris });
    bl3.push(...retenir('domicile', `${pc(dom.bruxelles, s.n)} % habitent Bruxelles ; Anderlecht, la commune du campus, en tête.`));
    ajouter({ id: 'domicile', blocs: bl3, notes: t('notes.domicile', 'Adresse actuelle de la fiche de chaque étudiant.'), notesCle: 'notes.domicile' });

    const libAcces = Object.fromEntries((pop?.listes?.acces || []).map(([k, l]) => [k, l.replace(/\s*\(.*\)$/, '')]));
    const acces = Object.entries(s.acces || {}).sort((a, b) => b[1] - a[1]);
    const libSit = Object.fromEntries((pop?.listes?.situations || []).map(([k, l]) => [k, l]));
    const sit = Object.entries(s.situation || {}).sort((a, b) => b[1] - a[1]);
    if (acces.length) {
      const bl4 = [...entete('Profil', 'Par quelle porte ils entrent')];
      bl4.push({ k: 'graphe', type: 'donut', x: M, y: 140, w: sit.length ? 540 : CW - 360, h: 440, categories: acces.map(([k]) => libAcces[k] || k), series: [{ nom: 'Étudiants', valeurs: acces.map(([, v]) => v) }], couleurs: SERIE, titre: 'Titre d’accès' });
      if (sit.length) bl4.push({ k: 'graphe', type: 'donut', x: M + 580, y: 140, w: CW - 580, h: 440, categories: sit.map(([k]) => libSit[k] || k), series: [{ nom: 'Étudiants', valeurs: sit.map(([, v]) => v) }], couleurs: SERIE, titre: 'Situation professionnelle' });
      else bl4.push(...tuileClaire(M + CW - 330, 170, 330, 170, `${pc(s.acces_connu, s.n)} %`, 'des titres d’accès encodés', `${n0(s.acces_connu)} dossiers sur ${n0(s.n)} ; la situation professionnelle reste à encoder`, C.ocre));
      bl4.push(...retenir('acces', `${pc(s.acces?.secondaire_etranger || 0, s.acces_connu)} % entrent avec un diplôme secondaire étranger reconnu.`));
      ajouter({ id: 'acces', blocs: bl4, notes: t('notes.acces', 'Parts calculées sur les dossiers où le titre d’accès est encodé.'), notesCle: 'notes.acces' });
    }
  }

  /* PARTIE 3 — LES RÉSULTATS */
  separateur(3, 'Les résultats', 'Une première session exigeante, une seconde session qui rattrape.', '✓');
  if (rN) {
    const tt = rN.sec.total, iipT = rN.iip?.total;
    const bl = [...entete('Résultats', `Les décisions de ${rN.annee}`)];
    bl.push({ k: 'graphe', type: 'empileH', x: M, y: 150, w: 720, h: 300, categories: ['1re session', '2e session', 'Au final'],
      series: [
        { nom: 'Réussi', valeurs: [tt.s1.reussi, tt.s2?.reussi || 0, tt.final.reussi], couleur: C.vert },
        { nom: 'Ajourné', valeurs: [tt.s1.ajourne, tt.s2?.ajourne || 0, 0], couleur: C.or },
        { nom: 'Refusé', valeurs: [tt.s1.refuse, tt.s2?.refuse || 0, tt.final.refuse], couleur: C.brique },
      ], titre: 'Décisions par unité d’enseignement' });
    const w3 = (CW - 760) ;
    bl.push(...tuileSombre(M + 760, 150, w3, 130, `${n0(tt.final.taux_reussite)} %`, 'de réussite finale', iipT ? `IIP : ${n0(iipT.final.taux_reussite)} %` : '', C.vert));
    bl.push(...tuileClaire(M + 760, 300, w3, 120, `${n0(tt.s1.taux_reussite)} %`, 'de réussite en 1re session', iipT ? `IIP : ${n0(iipT.s1.taux_reussite)} %` : '', C.or));
    bl.push(...tuileClaire(M + 760, 440, w3, 120, `${n0(tt.s2?.taux_reussite)} %`, 'des ajournés réussissent en 2e session', `${n0(tt.s2?.taux_retour)} % se présentent`, C.bleu));
    bl.push({ k: 'texte', x: M, y: 470, w: 720, h: 110, texte: `${n0(tt.inscrits)} décisions d’unité en ${rN.annee} (un étudiant suit plusieurs unités). En première session, ${n0(tt.s1.taux_ajournement)} % sont ajournés : la seconde session en rattrape ${n0(tt.s2?.taux_reussite)} %.`, taille: 15, couleur: C.gris });
    bl.push(...retenir('decisions', `${n0(tt.final.taux_reussite)} % des unités réussies au final ; la seconde session fait la différence.`));
    ajouter({ id: 'decisions', blocs: bl, notes: t('notes.decisions', 'Les chiffres portent sur les décisions par unité d’enseignement, pas sur les étudiants.'), notesCle: 'notes.decisions' });

    const niv = (rN.sec.par_niveau || []).filter(x => /^BA\d$/.test(x.cle)).sort((a, b) => a.cle.localeCompare(b.cle));
    const bl2 = [...entete('Résultats', 'La réussite progresse au fil du parcours')];
    bl2.push({ k: 'graphe', type: 'groupes', x: M, y: 140, w: 700, h: 450, categories: niv.map(x => x.cle), unite: '%',
      series: [{ nom: '1re session', valeurs: niv.map(x => Math.round(x.s1.taux_reussite)), couleur: C.or }, { nom: 'Au final', valeurs: niv.map(x => Math.round(x.final.taux_reussite)), couleur: C.vert }],
      titre: `Taux de réussite par bloc, ${rN.annee}` });
    if (resC.length > 1) {
      bl2.push({ k: 'graphe', type: 'groupes', x: M + 740, y: 140, w: CW - 740, h: 450, categories: resC.map(x => x.annee), unite: '%',
        series: [{ nom: 'Section', valeurs: resC.map(x => Math.round(x.sec.total.final.taux_reussite)), couleur: C.bleu }, { nom: 'Ensemble de l’IIP', valeurs: resC.map(x => Math.round(x.iip?.total?.final?.taux_reussite || 0)), couleur: '#94A3B8' }],
        titre: 'Réussite finale, par année' });
    }
    const b1 = niv[0], bD = niv[niv.length - 1];
    bl2.push(...retenir('blocs', b1 && bD ? `De ${n0(b1.final.taux_reussite)} % en ${b1.cle} à ${n0(bD.final.taux_reussite)} % en ${bD.cle} : le premier bloc fait le tri.` : 'La réussite progresse au fil des blocs.'));
    ajouter({ id: 'blocs', blocs: bl2, notes: t('notes.blocs', 'Le premier bloc concentre les difficultés : c’est là que porte l’aide à la réussite.'), notesCle: 'notes.blocs' });

    const ues = (rN.sec.par_ue || []).filter(u => u.inscrits >= 10 && u.final).map(u => ({ ...u, court: String(u.libelle).replace(/^UE (\d+) — /, '$1 · ').slice(0, 48) }));
    const tri = [...ues].sort((a, b) => b.final.taux_reussite - a.final.taux_reussite);
    const haut = tri.slice(0, 6), bas = tri.slice(-6).reverse();
    const bl3 = [...entete('Résultats', 'Les unités qui réussissent, celles qui résistent')];
    bl3.push({ k: 'graphe', type: 'barresH', x: M, y: 140, w: CW / 2 - 16, h: 450, categories: haut.map(u => u.court), unite: '%', series: [{ nom: 'Réussite finale', valeurs: haut.map(u => Math.round(u.final.taux_reussite)), couleur: C.vert }], titre: 'Les mieux réussies' });
    bl3.push({ k: 'graphe', type: 'barresH', x: M + CW / 2 + 16, y: 140, w: CW / 2 - 16, h: 450, categories: bas.map(u => u.court), unite: '%', series: [{ nom: 'Réussite finale', valeurs: bas.map(u => Math.round(u.final.taux_reussite)), couleur: C.brique }], titre: 'Les plus difficiles' });
    bl3.push(...retenir('unites', bas[0] ? `UE ${bas[0].court.replace(/ · .*/, '')} : ${n0(bas[0].final.taux_reussite)} % de réussite — c’est là que l’accompagnement doit porter.` : 'Quelques unités concentrent l’échec.'));
    ajouter({ id: 'unites', blocs: bl3, notes: t('notes.unites', 'Unités d’au moins dix inscrits ; taux de réussite après la seconde session.'), notesCle: 'notes.unites' });
  }

  /* PARTIE 4 — LES FINANCES */
  separateur(4, 'Ce qu’elle coûte, ce qu’elle rapporte', 'Une section menée par optimisation de nos propres dotations.', '€');
  if (IH && yN) {
    const bl = [...entete('Finances', 'Une section efficiente')];
    const w4 = (CW - 3 * 24) / 4;
    const cles = [
      [hN ? `${hN.resultat >= 0 ? '+' : '−'}${eur(Math.abs(hN.resultat))}` : '—', `résultat HELB et ASBL ${court(yN.annee)}`, hN ? `rapporte ${eur(hN.recettes)}, coûte ${eur(hN.cout)}` : '', hN?.resultat >= 0 ? C.vert : C.brique],
      [timH ? n0(timH.ratio) : '—', 'étudiants par ETP', moyH ? `moyenne de la HELB : ${n0(moyH)}` : '', C.vert],
      [yN.inscrits ? eur((yN.coutI + yN.coutH) / yN.inscrits) : '—', `coût d’un étudiant ${court(yN.annee)}`, yN.inscrits ? `IIP ${eur(yN.coutI / yN.inscrits)} · HELB ${eur(yN.coutH / yN.inscrits)}` : '', C.nuit],
      [eur(apport), `apport de l’IIP sur ${IH.Y.length} ans`, '0 € de coût supplémentaire : nos propres dotations', '#8A6A00'],
    ];
    cles.forEach((c, i) => bl.push(...tuileSombre(M + i * (w4 + 24), 140, w4, 190, c[0], c[1], c[2], c[3])));
    bl.push({ k: 'graphe', type: 'empile', x: M, y: 352, w: CW, h: 240, categories: IH.Y.map(y => y.annee), unite: ' ETP',
      series: [{ nom: 'IIP', valeurs: IH.Y.map(y => +(y.etpI).toFixed(2)), couleur: C.iip }, { nom: 'HELB', valeurs: IH.Y.map(y => +(y.etpH).toFixed(2)), couleur: C.helb }],
      titre: 'La charge d’enseignement (et de coordination), en ETP', decimales: 1 });
    bl.push(...retenir('finances', timH && moyH ? `${n0(timH.ratio)} étudiants par ETP, contre ${n0(moyH)} en moyenne à la HELB : ${n1(timH.ratio / moyH)} fois plus efficiente.` : 'Une section qui rapporte plus qu’elle ne coûte.'));
    ajouter({ id: 'finances', blocs: bl, notes: t('notes.finances', 'Méthode et réglages : Gestion → Dotation → IIP et HELB (les mêmes chiffres que la pièce remise à la HELB).'), notesCle: 'notes.finances' });

    const cursus = (ih.d.comparaison?.cursus || []).filter(c => c.ratio).sort((a, b) => b.ratio - a.ratio).slice(0, 14);
    if (cursus.length) {
      const bl2 = [...entete('Finances', 'Comparée aux cursus de la HELB')];
      bl2.push({ k: 'graphe', type: 'barresH', x: M, y: 140, w: CW - 340, h: 460, categories: cursus.map(c => (c.tim ? `▶ ${c.cursus}` : c.cursus).slice(0, 46)),
        series: [{ nom: 'Étudiants par ETP', valeurs: cursus.map(c => Math.round(c.ratio)) }], couleursPoints: cursus.map(c => (c.tim ? C.bleu : COULEUR_DEPT[c.dept] || '#94A3B8')), titre: `Étudiants par ETP enseignant, ${ih.d.comparaison.annee || ''}` });
      const dep = Object.entries(COULEUR_DEPT);
      dep.forEach(([d, c], i) => bl2.push({ k: 'rect', x: W - M - 300, y: 170 + i * 34, w: 18, h: 18, fond: c, rayon: 4 }, { k: 'texte', x: W - M - 272, y: 166 + i * 34, w: 270, h: 26, texte: d, taille: 14, couleur: C.encre }));
      bl2.push({ k: 'rect', x: W - M - 300, y: 170 + dep.length * 34, w: 18, h: 18, fond: C.bleu, rayon: 4 }, { k: 'texte', x: W - M - 272, y: 166 + dep.length * 34, w: 270, h: 26, texte: `${section} (codiplômé)`, taille: 14, couleur: C.encre, gras: true });
      const rang = cursus.findIndex(c => c.tim) + 1, nbC = (ih.d.comparaison?.cursus || []).filter(c => c.ratio).length;
      bl2.push(...retenir('cursus', rang === 1 ? `${section} est le cursus le plus efficient des ${nbC} cursus de la HELB.` : `${section} est ${rang}e sur ${nbC} cursus de la HELB pour l’efficience.`));
      ajouter({ id: 'cursus', blocs: bl2, notes: t('notes.cursus', 'Source : chiffres de la HELB par cursus (étudiants comptés et ETP).'), notesCle: 'notes.cursus' });
    }
  }

  /* PARTIE 5 — LE BILAN */
  separateur(5, 'Le bilan', 'Ce qui fait la force de la section, ce qui la fragilise, ce que nous vous demandons.', '★');
  const forcesDef = [
    premiere && derniere ? `Croissance : de ${n0(premiere.n)} à ${n0(derniere.n)} étudiants en ${evo.length} ans` : null,
    timH && moyH ? `Efficience : ${n0(timH.ratio)} étudiants par ETP, ${n1(timH.ratio / moyH)} fois la moyenne de la HELB` : null,
    hN && hN.resultat >= 0 ? `Un résultat positif pour la HELB et l’ASBL (${eur(hN.resultat)} en ${yN.annee})` : null,
    'Aucun coût supplémentaire pour l’IIP : des dotations optimisées',
    rN?.sec?.total?.s2 ? `Une seconde session qui rattrape : ${n0(rN.sec.total.s2.taux_reussite)} % des ajournés réussissent` : null,
    'Une codiplomation avec la HELB : un diplôme de haute école, accessible aux adultes',
  ].filter(Boolean);
  const bas1 = rN ? [...(rN.sec.par_ue || [])].filter(u => u.inscrits >= 10 && u.final).sort((a, b) => a.final.taux_reussite - b.final.taux_reussite)[0] : null;
  const faiblessesDef = [
    rN ? `Une première session difficile : ${n0(rN.sec.total.s1.taux_reussite)} % de réussite (${n0((rN.sec.par_niveau || []).find(x => x.cle === 'BA1')?.s1?.taux_reussite)} % en BA1)` : null,
    bas1 ? `Quelques unités très sélectives : ${String(bas1.libelle).replace(/ — .*/, '')} à ${n0(bas1.final.taux_reussite)} %` : null,
    timH ? `Un encadrement très tendu : ${n0(timH.ratio)} étudiants par ETP` : null,
    'La capacité des lieux de stage et du matériel d’imagerie, à suivre avec la croissance',
    s.acces_connu < s.n ? `Des données à compléter : titre d’accès connu pour ${pc(s.acces_connu, s.n)} % des dossiers, situation professionnelle à encoder` : null,
  ].filter(Boolean);
  const opportunitesDef = [
    'L’allocation de la HELB, lissée sur trois ans à partir de 2026',
    'Une demande forte de technologues dans les hôpitaux (à étayer par les chiffres du secteur)',
    'Le modèle de codiplomation, transposable à d’autres sections',
  ];
  const menacesDef = [
    'Une croissance plus rapide que l’encadrement et les locaux',
    'La dépendance aux étudiants internationaux (visas, titres de séjour)',
    'L’échec en premier bloc, qui pèse sur la réussite et la réputation',
  ];
  const demandesDef = [
    'Prendre acte de la croissance et de l’efficience de la section',
    'Soutenir le renforcement de l’encadrement en premier bloc',
    'Appuyer auprès de la HELB la reconnaissance de la part de l’IIP',
  ];
  const listeBlocs = (x, y, w, h, titre, couleur, cle, defaut, taille = 17) => {
    const items = lignes(cle, defaut);
    return [
      { k: 'rect', x, y, w, h, fond: C.blanc, bord: C.filet, rayon: 12 },
      { k: 'rect', x, y, w, h: 54, fond: couleur, rayon: 12 },
      { k: 'rect', x, y: y + 40, w, h: 14, fond: couleur },
      { k: 'texte', x: x + 22, y, w: w - 44, h: 54, texte: titre, taille: 20, couleur: C.blanc, gras: true, vcentre: true },
      { k: 'liste', x: x + 22, y: y + 72, w: w - 44, h: h - 86, items, taille, couleur: C.encre, puce: couleur, edit: cle, editListe: true },
    ];
  };
  ajouter({ id: 'forces', blocs: [...entete('Bilan', 'Forces et faiblesses'),
    ...listeBlocs(M, 140, CW / 2 - 14, 450, 'Forces', C.vert, 'swot.forces', forcesDef, 16),
    ...listeBlocs(M + CW / 2 + 14, 140, CW / 2 - 14, 450, 'Faiblesses', C.brique, 'swot.faiblesses', faiblessesDef, 16),
    ...retenir('forces', 'Une section qui rapporte et qui grandit ; la réussite du premier bloc reste le chantier.'),
  ], notes: t('notes.forces', 'Propositions de Lucie d’après les chiffres ; à relire et corriger avant le CA.'), notesCle: 'notes.forces' });
  ajouter({ id: 'opportunites', blocs: [...entete('Bilan', 'Opportunités et menaces'),
    ...listeBlocs(M, 140, CW / 2 - 14, 450, 'Opportunités', C.bleu, 'swot.opportunites', opportunitesDef),
    ...listeBlocs(M + CW / 2 + 14, 140, CW / 2 - 14, 450, 'Menaces', C.ocre, 'swot.menaces', menacesDef),
    ...retenir('opportunites', 'Grandir, oui — en gardant la qualité de l’encadrement.'),
  ], notes: t('notes.opportunites', ''), notesCle: 'notes.opportunites' });
  ajouter({ id: 'demandes', blocs: [...entete('Bilan', 'Ce que nous demandons au Conseil'),
    ...listeBlocs(M, 140, CW, 450, 'Nos demandes', C.nuit, 'demandes', demandesDef, 20),
    ...retenir('demandes', 'Une section qui a fait ses preuves, et qui demande les moyens de bien grandir.'),
  ], notes: t('notes.demandes', ''), notesCle: 'notes.demandes' });

  /* MERCI */
  ajouter({ id: 'merci', fond: C.nuit, blocs: [
    { k: 'vierge', x: 420, y: 90, w: 440, h: 330 },
    { k: 'texte', x: M, y: 440, w: CW, h: 80, texte: t('merci.titre', 'Merci. Vos questions.'), taille: 50, couleur: C.blanc, gras: true, align: 'center', edit: 'merci.titre' },
    { k: 'texte', x: M, y: 530, w: CW, h: 40, texte: t('merci.sous', `${nom} — Institut Ilya Prigogine`), taille: 18, couleur: C.clair, align: 'center', edit: 'merci.sous' },
  ], notes: t('notes.merci', ''), notesCle: 'notes.merci' });

  // Le pied de chaque diapositive de contenu : section, numéro.
  diapos.forEach((d, i) => {
    if (d.fond) return;
    d.blocs.push({ k: 'texte', x: M, y: 684, w: 700, h: 20, texte: `Institut Ilya Prigogine · ${nom}`, taille: 10.5, couleur: C.gris },
      { k: 'texte', x: W - M - 100, y: 684, w: 100, h: 20, texte: `${i + 1} / ${diapos.length}`, taille: 10.5, couleur: C.gris, align: 'right' });
  });
  return diapos;
}

/* ------------------------------------------------------------------ LE DESSIN À L'ÉCRAN ---------------------------------------- */

function Vierge({ w, h, clair = false }) {
  // La figure de la Vierge, celle du logo de Lucie, en grand — le motif de la couverture.
  const coul = clair ? '#FFFFFF' : C.clair;
  return (
    <svg width={w} height={h} viewBox="-14 -8 80 46" preserveAspectRatio="xMidYMid meet">
      <g stroke={coul} strokeOpacity=".28" strokeWidth=".35" fill="none">
        {TRAITS.map(([a, b]) => <line key={a + b} x1={ETOILES[a][0]} y1={ETOILES[a][1]} x2={ETOILES[b][0]} y2={ETOILES[b][1]} />)}
      </g>
      {Object.entries(ETOILES).map(([k, [x, y]]) => <circle key={k} cx={x} cy={y} r={0.5 + (ECLAT[k] || 0.3) * 0.9} fill={coul} fillOpacity=".75" />)}
      <path d={`M${POINTS_L[0][0]} ${POINTS_L[0][1]} L${POINTS_L[1][0]} ${POINTS_L[1][1]} L${POINTS_L[2][0]} ${POINTS_L[2][1]}`} stroke="#05B7E6" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {POINTS_L.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 1 ? 1.9 : 1.6} fill="#05B7E6" />)}
    </svg>);
}

const fmtVal = (b) => v => (v === 0 || v == null ? '' : `${b.decimales ? n1(v) : n0(v)}${b.unite || ''}`);

function Graphe({ b }) {
  const titreH = b.titre ? 30 : 0, gh = b.h - titreH;
  const donnees = b.categories.map((c, i) => ({ c, ...Object.fromEntries(b.series.map((s, j) => [`s${j}`, s.valeurs[i]])) }));
  const axe = { fontSize: 14, fill: C.gris, fontFamily: POLICE };
  const lab = { fontSize: 14, fontWeight: 700, fill: C.encre, fontFamily: POLICE };
  let g = null;
  if (b.type === 'donut') {
    const tot = b.series[0].valeurs.reduce((a, v) => a + (v || 0), 0);
    const d = b.categories.map((c, i) => ({ c, v: b.series[0].valeurs[i] || 0 })).filter(x => x.v > 0);
    const r = Math.min(gh, b.w * 0.44) / 2 - 8;
    g = (
      <div style={{ display: 'flex', alignItems: 'center', height: gh }}>
        <PieChart width={r * 2 + 16} height={gh}>
          <Pie data={d} dataKey="v" nameKey="c" cx="50%" cy="50%" innerRadius={r * 0.58} outerRadius={r} paddingAngle={1} isAnimationActive={false} stroke="#fff" strokeWidth={2}>
            {d.map((x, i) => <Cell key={x.c} fill={b.couleurs?.[b.categories.indexOf(x.c)] || SERIE[i % SERIE.length]} />)}
          </Pie>
        </PieChart>
        <div style={{ flex: 1, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
          {d.map((x, i) => (
            <div key={x.c} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, color: C.encre }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, flex: 'none', background: b.couleurs?.[b.categories.indexOf(x.c)] || SERIE[i % SERIE.length] }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.c}</span>
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{n0(x.v)}</b>
              <span style={{ color: C.gris, width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pc(x.v, tot)} %</span>
            </div>))}
        </div>
      </div>);
  } else {
    const horiz = b.type === 'barresH' || b.type === 'empileH';
    const empile = b.type === 'empile' || b.type === 'empileH';
    const f0 = fmtVal(b);
    const plafond = empile ? Math.max(1, ...donnees.map(x => b.series.reduce((t, _, j) => t + (x[`s${j}`] || 0), 0))) : 0;
    const f = v => (empile && v < plafond * 0.07 ? '' : f0(v));
    const legende = b.series.length > 1;
    g = (
      <BarChart width={b.w} height={gh} data={donnees} layout={horiz ? 'vertical' : 'horizontal'} margin={{ top: 22, right: horiz ? 50 : 10, left: 0, bottom: 4 }} barCategoryGap={horiz ? 8 : '22%'}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" horizontal={!horiz} vertical={horiz} />
        {horiz ? <><XAxis type="number" hide /><YAxis type="category" dataKey="c" width={b.type === 'empileH' ? 120 : Math.min(340, b.w * 0.55, 24 + 7.6 * Math.max(...b.categories.map(c => String(c).length)))} tick={axe} interval={0} axisLine={false} tickLine={false} /></>
          : <><XAxis dataKey="c" tick={axe} interval={0} axisLine={{ stroke: C.filet }} tickLine={false} /><YAxis hide /></>}
        {legende && <Legend verticalAlign="top" align="right" height={30} wrapperStyle={{ fontSize: 14, fontFamily: POLICE, color: C.encre }} />}
        {b.series.map((s, j) => (
          <Bar key={j} dataKey={`s${j}`} name={s.nom} fill={s.couleur || SERIE[j]} stackId={empile ? 'a' : undefined} isAnimationActive={false} radius={empile ? 0 : (horiz ? [0, 4, 4, 0] : [4, 4, 0, 0])}>
            {b.couleursPoints && donnees.map((x, i) => <Cell key={i} fill={b.couleursPoints[i]} />)}
            <LabelList dataKey={`s${j}`} position={empile ? 'center' : (horiz ? 'right' : 'top')} formatter={f} style={empile ? { ...lab, fill: '#fff' } : lab} />
          </Bar>))}
      </BarChart>);
  }
  return (
    <div style={{ width: b.w, height: b.h }}>
      {b.titre && <div style={{ height: titreH, fontSize: 15, fontWeight: 700, color: C.encre }}>{b.titre}</div>}
      {g}
    </div>);
}

function Bloc({ b, logo, editer, onEditer, cartes, anim }) {
  const pos = { position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h, ...(anim || {}) };
  const marque = editer && b.edit ? { outline: '2px dashed #05B7E6', outlineOffset: 3, cursor: 'text' } : {};
  if (b.k === 'rect') return <div style={{ ...pos, background: b.fond, border: b.bord ? `1px solid ${b.bord}` : undefined, borderRadius: b.rayon || 0 }} />;
  if (b.k === 'logo') return logo ? <img alt="" src={logo} style={{ ...pos, objectFit: 'contain', objectPosition: 'left center' }} /> : null;
  if (b.k === 'vierge') return <div style={pos}><Vierge w={b.w} h={b.h} /></div>;
  if (b.k === 'graphe') return <div style={pos}><Graphe b={b} /></div>;
  if (b.k === 'carte') return <div style={pos} dangerouslySetInnerHTML={{ __html: svgCarte(b, cartes) }} />;
  if (b.k === 'isotype') return <div style={pos} dangerouslySetInnerHTML={{ __html: svgIsotype(b) }} />;
  if (b.k === 'liste') return (
    <ul onClick={() => editer && b.edit && onEditer(b.edit)} style={{ ...pos, ...marque, margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14, fontSize: b.taille, color: b.couleur, lineHeight: 1.35 }}>
      {b.items.map((it, i) => (
        <li key={i} style={{ display: 'flex', gap: 12 }}><span style={{ flex: 'none', width: 9, height: 9, borderRadius: 9, background: b.puce, marginTop: b.taille * 0.42 }} /><span>{it}</span></li>))}
    </ul>);
  return (
    <div onClick={() => editer && b.edit && onEditer(b.edit)} style={{ ...pos, ...marque, fontSize: b.taille, color: b.couleur, fontWeight: b.gras ? 700 : 400, fontStyle: b.italique ? 'italic' : 'normal',
      letterSpacing: b.espace ? `${b.espace * 0.06}em` : (b.taille >= 30 ? '-0.01em' : undefined), textAlign: b.align || 'left', lineHeight: b.taille >= 30 ? 1.08 : 1.3, whiteSpace: 'pre-line',
      display: b.vcentre ? 'flex' : 'block', alignItems: 'center', justifyContent: b.align === 'center' ? 'center' : b.align === 'right' ? 'flex-end' : 'flex-start', overflow: 'hidden' }}>{b.texte}</div>);
}

/* L'ENTRÉE DES BLOCS : chaque diapositive se compose sous les yeux — les blocs montent et paraissent l'un après l'autre (coupé par
   prefers-reduced-motion). */
const STYLE_ANIM = `@keyframes lucieEntree { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes lucieFondu { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .scene-lucie * { animation: none !important; } }`;
function Scene({ d, largeur, logo, editer, onEditer, cartes, anime = false }) {
  const k = largeur / W;
  let rang = 0;
  const anim = b => {
    if (!anime) return null;
    const fond = b.k === 'rect' && (b.w >= CW - 2 || b.y < 30);
    const delai = fond ? 0 : Math.min(1400, 80 + (rang++) * 45);
    return { animation: `${b.k === 'rect' ? 'lucieFondu' : 'lucieEntree'} .6s cubic-bezier(.2,.7,.2,1) ${delai}ms both` };
  };
  return (
    <div style={{ width: largeur, height: H * k, position: 'relative', overflow: 'hidden', borderRadius: 6, boxShadow: '0 10px 40px rgba(0,26,112,.18)', background: d.fond || '#fff' }}>
      {anime && <style>{STYLE_ANIM}</style>}
      <div key={d.id} className="scene-lucie" style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: '0 0', position: 'absolute', fontFamily: POLICE, background: d.fond || '#fff' }}>
        {d.blocs.map((b, i) => <Bloc key={i} b={b} logo={logo} editer={editer} onEditer={onEditer} cartes={cartes} anim={anim(b)} />)}
      </div>
    </div>);
}

/* ------------------------------------------------------------------ L'EXPORT POWERPOINT ---------------------------------------- */

let chargement = null;
function chargerPptx() {
  if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  if (!chargement) chargement = new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = '/vendor/pptxgenjs-3.12.0/pptxgen.bundle.js';
    s.onload = () => ok(window.PptxGenJS); s.onerror = () => { chargement = null; ko(new Error('L’outil PowerPoint ne s’est pas chargé.')); };
    document.head.appendChild(s);
  });
  return chargement;
}
const IN = v => +(v / 96).toFixed(3);
const PT = px => +(px * 0.75).toFixed(1);
const hex = c => String(c || '#000000').replace('#', '').toUpperCase();

function svgEnPng(svg, w, h) {
  return new Promise((ok, ko) => {
    const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const g = c.getContext('2d'); g.drawImage(im, 0, 0, w * 2, h * 2); ok(c.toDataURL('image/png')); };
    im.onerror = () => ko(new Error('Une carte ne s’est pas rendue.'));
    im.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('width="100%" height="100%"', `width="${w}" height="${h}"`))}`;
  });
}
async function exporterPptx(diapos, { titre, logo, logoRatio, nomFichier, cartes }) {
  const PptxGenJS = await chargerPptx();
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_WIDE';
  p.title = titre; p.author = 'Institut Ilya Prigogine'; p.company = 'Institut Ilya Prigogine';
  p.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };
  for (const d of diapos) {
    const sl = p.addSlide();
    sl.background = { color: hex(d.fond || '#FFFFFF') };
    for (const b of d.blocs) {
      const geo = { x: IN(b.x), y: IN(b.y), w: IN(b.w), h: IN(b.h) };
      if (b.k === 'rect') {
        sl.addShape(b.rayon ? p.ShapeType.roundRect : p.ShapeType.rect, { ...geo, fill: { color: hex(b.fond) }, line: b.bord ? { color: hex(b.bord), width: 0.75 } : { type: 'none' }, ...(b.rayon ? { rectRadius: Math.min(0.5, b.rayon / Math.min(b.w, b.h)) } : {}) });
      } else if (b.k === 'logo') {
        if (logo) {
          const h = b.h, w = Math.min(b.w, h * (logoRatio || 2));
          sl.addImage({ data: logo.replace(/^data:/, ''), x: IN(b.x), y: IN(b.y), w: IN(w), h: IN(h) });
        }
      } else if (b.k === 'carte' || b.k === 'isotype') {
        const svg = b.k === 'carte' ? svgCarte(b, cartes) : svgIsotype(b);
        if (svg) sl.addImage({ data: (await svgEnPng(svg, b.w, b.h)).replace(/^data:/, ''), ...geo });
      } else if (b.k === 'vierge') {
        // La figure, dessinée en formes : traits, étoiles, le L.
        const sx = b.w / 80, sy = b.h / 46, s = Math.min(sx, sy), ox = b.x + (b.w - 80 * s) / 2 + 14 * s, oy = b.y + (b.h - 46 * s) / 2 + 8 * s;
        const P = ([x, y]) => [ox + x * s, oy + y * s];
        const trait = (a, z, couleur, epaisseur, transp) => {
          const [x1, y1] = P(a), [x2, y2] = P(z);
          sl.addShape(p.ShapeType.line, { x: IN(Math.min(x1, x2)), y: IN(Math.min(y1, y2)), w: IN(Math.max(0.5, Math.abs(x2 - x1))), h: IN(Math.max(0.5, Math.abs(y2 - y1))),
            flipH: (x2 < x1) !== (y2 < y1), line: { color: couleur, width: epaisseur, transparency: transp } });
        };
        TRAITS.forEach(([a, z]) => trait(ETOILES[a], ETOILES[z], 'BCC6E8', 1, 70));
        Object.entries(ETOILES).forEach(([k, xy]) => { const [x, y] = P(xy), r = (0.5 + (ECLAT[k] || 0.3) * 0.9) * s; sl.addShape(p.ShapeType.ellipse, { x: IN(x - r), y: IN(y - r), w: IN(2 * r), h: IN(2 * r), fill: { color: 'BCC6E8', transparency: 25 }, line: { type: 'none' } }); });
        trait(POINTS_L[0], POINTS_L[1], '05B7E6', 3, 0); trait(POINTS_L[1], POINTS_L[2], '05B7E6', 3, 0);
        POINTS_L.forEach((xy, i) => { const [x, y] = P(xy), r = (i === 1 ? 1.9 : 1.6) * s; sl.addShape(p.ShapeType.ellipse, { x: IN(x - r), y: IN(y - r), w: IN(2 * r), h: IN(2 * r), fill: { color: '05B7E6' }, line: { type: 'none' } }); });
      } else if (b.k === 'liste') {
        sl.addText(b.items.map((it, i) => ({ text: it, options: { bullet: { characterCode: '25CF', indent: 18 }, color: hex(b.couleur), paraSpaceAfter: 10, breakLine: i < b.items.length - 1 } })),
          { ...geo, fontFace: 'Arial', fontSize: PT(b.taille), valign: 'top', margin: 0, isTextBox: true });
      } else if (b.k === 'texte') {
        sl.addText(b.texte, { ...geo, fontFace: 'Arial', fontSize: PT(b.taille), color: hex(b.couleur), bold: !!b.gras, italic: !!b.italique,
          align: b.align || 'left', valign: b.vcentre ? 'middle' : 'top', margin: 0, charSpacing: b.espace ? b.espace : undefined, isTextBox: true, fit: 'shrink' });
      } else if (b.k === 'graphe') {
        const titreH = b.titre ? 30 : 0;
        if (b.titre) sl.addText(b.titre, { x: IN(b.x), y: IN(b.y), w: IN(b.w), h: IN(26), fontFace: 'Arial', fontSize: PT(15), bold: true, color: hex(C.encre), margin: 0, isTextBox: true });
        const g = { x: IN(b.x), y: IN(b.y + titreH), w: IN(b.w), h: IN(b.h - titreH) };
        const commun = { catAxisLabelFontFace: 'Arial', valAxisLabelFontFace: 'Arial', legendFontFace: 'Arial', dataLabelFontFace: 'Arial', catAxisLabelColor: '5B6B7C', catAxisLabelFontSize: 11, dataLabelFontSize: 11, dataLabelColor: '1B2B4B' };
        if (b.type === 'donut') {
          const d = b.categories.map((c, i) => ({ c, v: b.series[0].valeurs[i] || 0, col: hex(b.couleurs?.[i] || SERIE[i % SERIE.length]) })).filter(x => x.v > 0);
          sl.addChart(p.ChartType.doughnut, [{ name: b.series[0].nom, labels: d.map(x => x.c), values: d.map(x => x.v) }],
            { ...g, ...commun, holeSize: 58, chartColors: d.map(x => x.col), showLegend: true, legendPos: 'r', legendFontSize: 12, legendColor: '1B2B4B', showPercent: true, showValue: false, dataLabelColor: 'FFFFFF', dataLabelFontBold: true });
        } else {
          const horiz = b.type === 'barresH' || b.type === 'empileH', empile = b.type === 'empile' || b.type === 'empileH';
          let series = b.series.map(s => ({ name: s.nom, labels: b.categories, values: s.valeurs.map(v => v || 0) }));
          let couleurs = b.series.map((s, j) => hex(s.couleur || SERIE[j]));
          let grouping = empile ? 'stacked' : 'clustered';
          if (b.couleursPoints) {
            // Une couleur par barre : une série par couleur, empilées (une seule valeur non nulle par catégorie).
            const distinctes = [...new Set(b.couleursPoints)];
            series = distinctes.map(col => ({ name: col, labels: b.categories, values: b.series[0].valeurs.map((v, i) => (b.couleursPoints[i] === col ? v : 0)) }));
            couleurs = distinctes.map(hex); grouping = 'stacked';
          }
          const cats = horiz ? [...b.categories].reverse() : b.categories;
          if (horiz) series = series.map(s => ({ ...s, labels: cats, values: [...s.values].reverse() }));
          sl.addChart(p.ChartType.bar, series, { ...g, ...commun, barDir: horiz ? 'bar' : 'col', barGrouping: grouping, chartColors: couleurs, barGapWidthPct: horiz ? 40 : 60,
            showValue: true, dataLabelPosition: grouping === 'stacked' ? 'ctr' : 'outEnd', dataLabelFormatCode: b.decimales ? '#,##0.0;;;' : '#,##0;;;', dataLabelColor: grouping === 'stacked' && !b.couleursPoints ? 'FFFFFF' : '1B2B4B', dataLabelFontBold: true,
            valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, catAxisLineShow: false,
            showLegend: b.series.length > 1 && !b.couleursPoints, legendPos: 't', legendFontSize: 12, legendColor: '1B2B4B' });
        }
      }
    }
    if (d.notes) sl.addNotes(d.notes);
  }
  await p.writeFile({ fileName: nomFichier });
}

/* ------------------------------------------------------------------ L'ÉCRAN ----------------------------------------------------- */

const MEMO = 'lucie.presentation';
export default function PresentationSection() {
  const identite = useIdentite();
  const cartes = useCartes();
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(() => { try { return localStorage.getItem(MEMO) || 'TIM'; } catch { return 'TIM'; } });
  const [D, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [tour, setTour] = useState(0);
  const [textes, setTextes] = useState({});
  const [sauve, setSauve] = useState(null);
  const [i, setI] = useState(0);
  const [plein, setPlein] = useState(false);
  const [editer, setEditer] = useState(false);
  const [champ, setChamp] = useState(null);
  const [exporte, setExporte] = useState(false);
  const [largeur, setLargeur] = useState(960);
  const [ratioLogo, setRatioLogo] = useState(2);
  const cadre = useRef(null), racine = useRef(null), glisse = useRef(null);
  const annee = getAnnee();

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l =>
      setSections((Array.isArray(l) ? l : []).map(s => s.code || s).filter(Boolean))).catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem(MEMO, section); } catch { /* sans mémoire */ } }, [section]);
  useEffect(() => {
    let vivant = true; setD(null); setErreur(null);
    const j = u => fetch(u, { headers: authHeaders() }).then(async r => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || `Erreur ${r.status}`); return x; });
    const rgl = (() => { try { const m = JSON.parse(localStorage.getItem('lucie.iipHelb') || '{}'); return m.section === section ? (m.reglages || {}) : (m.reglages || {}); } catch { return {}; } })();
    (async () => {
      const [pop, ihd, txt] = await Promise.all([
        j(`/api/pilotage/population-ecole?annee=${encodeURIComponent(annee)}&section=${encodeURIComponent(section)}`),
        j(`/api/pilotage/iip-helb?section=${encodeURIComponent(section)}${tour ? '&recalculer=1' : ''}`).catch(() => null),
        j(`/api/pilotage/presentation/${encodeURIComponent(section)}`).catch(() => ({ textes: {} })),
      ]);
      const evo = (pop.evolution || []).filter(e => (e.par_section?.[section] || 0) > 0).map(e => e.annee);
      const anneesRes = [...new Set([...evo, ...(ihd?.annees || [])])].filter(a => a <= annee).sort();
      const stats = await Promise.all(anneesRes.map(async a => {
        const [sec, iip] = await Promise.all([j(`/api/stats-deliberation?annee=${a}&section=${encodeURIComponent(section)}`).catch(() => null), j(`/api/stats-deliberation?annee=${a}`).catch(() => null)]);
        return { annee: a, sec, iip };
      }));
      if (!vivant) return;
      setTextes(txt.textes || {});
      setD({ section, nom: NOMS_SECTION[section] || section, pop, stats, ih: ihd ? { d: ihd, reglages: rgl } : null, annee });
    })().catch(e => vivant && setErreur(e.message));
    return () => { vivant = false; };
  }, [section, annee, tour]);

  const diapos = useMemo(() => (D ? composer(D, textes) : []), [D, textes]);
  const d = diapos[Math.min(i, diapos.length - 1)];

  // La taille de la scène suit la largeur disponible (et l'écran entier en plein écran).
  useEffect(() => {
    const el = plein ? racine.current : cadre.current; if (!el) return undefined;
    const f = () => { const r = el.getBoundingClientRect(); setLargeur(Math.max(320, Math.min(r.width, plein ? r.height * (W / H) : Math.max(560, (window.innerHeight - 300) * (W / H))))); };
    f(); const o = new ResizeObserver(f); o.observe(el); return () => o.disconnect();
  }, [plein, D]);
  useEffect(() => {
    const f = e => {
      if (champ || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); setI(x => Math.min(diapos.length - 1, x + 1)); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); setI(x => Math.max(0, x - 1)); }
      if (e.key === 'Home') setI(0);
      if (e.key === 'End') setI(diapos.length - 1);
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [diapos.length, champ]);
  useEffect(() => {
    const f = () => setPlein(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  useEffect(() => {
    if (!identite.logo_blanc) return;
    const im = new Image(); im.onload = () => im.naturalHeight && setRatioLogo(im.naturalWidth / im.naturalHeight); im.src = identite.logo_blanc;
  }, [identite.logo_blanc]);

  const pleinEcran = () => { if (document.fullscreenElement) document.exitFullscreen(); else racine.current?.requestFullscreen?.().catch(() => {}); };
  const enregistrer = async (nouveaux) => {
    setSauve('…');
    try {
      const r = await fetch(`/api/pilotage/presentation/${encodeURIComponent(section)}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ textes: nouveaux }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
      setSauve('Enregistré');
    } catch (e) { setSauve(`Non enregistré : ${e.message}`); }
  };
  const majTexte = (cle, v) => setTextes(t => ({ ...t, [cle]: v }));
  const exporter = async () => {
    setExporte(true); setErreur(null);
    try { await exporterPptx(diapos, { titre: `${D.nom} — Conseil d’administration`, logo: identite.logo_blanc, logoRatio: ratioLogo, cartes, nomFichier: `Presentation_${section}_CA_${new Date().toISOString().slice(0, 10)}.pptx` }); }
    catch (e) { setErreur(e.message); } finally { setExporte(false); }
  };
  // Le texte affiché d'un champ éditable : celui de la diapositive (proposé ou corrigé).
  const valeurDe = cle => {
    if (textes[cle] !== undefined) return textes[cle];
    for (const x of diapos) for (const b of x.blocs) if (b.edit === cle) return b.editListe ? b.items.join('\n') : b.texte;
    for (const x of diapos) if (x.notesCle === cle) return x.notes;
    return '';
  };
  const champsDiapo = d ? [...new Set(d.blocs.filter(b => b.edit).map(b => b.edit))] : [];

  if (erreur && !D) return <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
        <select className="controle flex-none" value={section} onChange={e => { setSection(e.target.value); setI(0); }} aria-label="Section">
          {(sections.length ? sections : [section]).map(s => <option key={s} value={s}>{NOMS_SECTION[s] ? `${s} — ${NOMS_SECTION[s]}` : s}</option>)}
        </select>
        <span className="text-second text-slate-500 whitespace-nowrap">{diapos.length ? `${diapos.length} diapositives` : 'Composition…'}</span>
        <button type="button" className={`bouton inline-flex items-center gap-1.5 whitespace-nowrap ${editer ? 'bouton-fort' : ''}`} onClick={() => setEditer(x => !x)} disabled={!D}
          title="Corriger les textes proposés : phrases à retenir, forces, faiblesses, notes"><IconPencil size={15} />{editer ? 'Terminer les corrections' : 'Corriger les textes'}</button>
        <button type="button" className="bouton inline-flex items-center gap-1.5 whitespace-nowrap" onClick={() => setTour(t => t + 1)} disabled={!D} title="Relire les chiffres"><IconRefresh size={15} />Recalculer</button>
        <span className="text-second text-slate-500 whitespace-nowrap">{sauve}</span>
        <button type="button" className="bouton ml-auto inline-flex items-center gap-1.5 whitespace-nowrap" onClick={pleinEcran} disabled={!D}><IconPresentation size={15} />Présenter</button>
        <button type="button" className="bouton bouton-sortir inline-flex items-center gap-1.5 whitespace-nowrap" onClick={exporter} disabled={!D || exporte}><IconDownload size={15} />{exporte ? 'Export…' : 'PowerPoint'}</button>
      </div>
      {erreur && <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>}
      <div ref={racine} className={plein ? 'flex items-center justify-center' : ''} style={plein ? { background: '#000', width: '100vw', height: '100vh' } : undefined}>
        {!D || !d ? <p className="text-second text-slate-400">Calcul des chiffres de la section… (quelques secondes)</p> : (
          <div ref={cadre} className="relative" style={plein ? { width: largeur } : undefined}>
            <div onClick={e => { if (plein && !editer && !e.target.closest('button')) setI(x => Math.min(diapos.length - 1, x + 1)); }}
              onTouchStart={e => { glisse.current = e.touches[0].clientX; }}
              onTouchEnd={e => { const dx = e.changedTouches[0].clientX - (glisse.current ?? e.changedTouches[0].clientX); glisse.current = null;
                if (Math.abs(dx) > 50) setI(x => (dx < 0 ? Math.min(diapos.length - 1, x + 1) : Math.max(0, x - 1))); }}><Scene d={d} largeur={largeur} logo={identite.logo_blanc} editer={editer} onEditer={setChamp} cartes={cartes} anime={!editer} /></div>
            <button type="button" aria-label="Diapositive précédente" onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 hover:bg-white shadow p-2 disabled:opacity-0"><IconChevronLeft size={22} /></button>
            <button type="button" aria-label="Diapositive suivante" onClick={() => setI(x => Math.min(diapos.length - 1, x + 1))} disabled={i >= diapos.length - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 hover:bg-white shadow p-2 disabled:opacity-0"><IconChevronRight size={22} /></button>
            {plein && <button type="button" onClick={pleinEcran} aria-label="Quitter le plein écran" className="absolute right-3 top-3 rounded-full bg-white/70 p-2"><IconMinimize size={18} /></button>}
          </div>)}
      </div>
      {D && !plein && (<>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {diapos.map((x, k) => (
            <button key={x.id} type="button" onClick={() => setI(k)} className={`flex-none rounded ${k === i ? 'ring-2 ring-iip-blue' : 'opacity-80 hover:opacity-100'}`} aria-label={`Diapositive ${k + 1}`}>
              <Scene d={x} largeur={128} logo={identite.logo_blanc} cartes={cartes} />
              <div className="text-mention text-slate-500 text-center mt-0.5">{k + 1}</div>
            </button>))}
        </div>
        {editer && (
          <section className="carte p-3 space-y-3">
            <div className="text-second text-slate-600">Les textes de cette diapositive — proposés par Lucie d’après les chiffres ; vos corrections sont gardées pour la section. Une ligne = un point. Vide = la proposition revient.</div>
            {[...champsDiapo, d?.notesCle].filter(Boolean).map(cle => (
              <label key={cle} className="block">
                <span className="text-second font-semibold text-slate-700">{cle.startsWith('notes.') ? 'Notes de l’orateur (dans le PowerPoint)' : cle.startsWith('swot.') || cle === 'demandes' ? 'Points (un par ligne)' : cle.startsWith('retenir.') ? 'À retenir' : 'Texte'}</span>
                <textarea data-reponses="non" className="controle w-full !h-auto mt-1" rows={cle.startsWith('swot.') || cle === 'demandes' ? 6 : 2} value={valeurDe(cle)} autoFocus={champ === cle}
                  onChange={e => majTexte(cle, e.target.value)} onBlur={() => enregistrer({ ...textes })} />
              </label>))}
          </section>)}
        {!editer && d?.notes && <p className="text-second text-slate-500"><b className="text-slate-700">Notes :</b> {d.notes}</p>}
      </>)}
      {plein && <IconMaximize className="hidden" />}
    </div>);
}

/**
 * L'IIP ET LA HELB SUR PLUSIEURS ANNÉES (3.5.428, Charles, 13 novembre 2026 : « dans Éditions, un rapport graphique, visuel, qui montre
 * l'évolution sur les années entre les deux — la Haute École veut une comparaison car elle pense dépenser plus ; noter aussi le cadre
 * administratif, la coordination ; même si cela prend plusieurs pages, complet » ; tranché : une section au choix, ETP et périodes,
 * coûts en euros, cadre administratif, étudiants ; la première année d'une section se dit comme telle).
 *
 * Rien n'est recalculé à part : les ETP au barème du Pilotage (CT/800 + PP/1000), les coûts, les inscrits et les fonctions viennent
 * de donneesCout (le rapport « Coûts des formations »), année par année. Le cadre administratif (direction, secrétariat : fonctions
 * d'établissement) se partage au prorata des inscrits, comme dans ce rapport ; les coordinations de la section se lisent fonction par
 * fonction, part HELB comprise. Une année sans fonction encodée le dit.
 */
import db from '../db/index.js';
import { donneesCout, tarifs, niveauDeSection } from './coutFormation.js';
import { getParamNum } from '../routes/parametres.js';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const n0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const n2 = n => (n || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = n => `${n0(n)} €`;
const pc = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const court = a => `${String(a).slice(0, 4)}-${String(a).slice(7, 9)}`;
const IIP = '#19537E', HELB = '#C2408A';
const NATURES = { Cours: 'Cours', EI: 'Épreuve intégrée', ES: 'Encadrement de stages', COCUR: 'Coordination de cursus',
  COSTA: 'Coordination des stages', COTFE: 'Coordination des TFE', COSEC: 'Coordination de section', CP: 'Coordination pédagogique' };

/** Les attributions d'une section pour une année, regroupées. */
function attributions(section, annee) {
  return db.prepare(`
    SELECT COALESCE(bloc, '—') AS bloc, COALESCE(contrat_mdp, 'IIP') AS contrat,
      CASE WHEN UPPER(COALESCE(type_cours, 'CT')) = 'PP' THEN 'PP' ELSE 'CT' END AS type,
      COALESCE(NULLIF(coordination_encadrement, ''), 'Cours') AS nature, cours_ept_ad AS ept,
      professeur_id, professeur, SUM(total_attribue_professeur) AS periodes
    FROM v_attribution_complete
    WHERE annee_scolaire = ? AND section = ? AND COALESCE(en_conge, 0) = 0
    GROUP BY 1,2,3,4,5,6,7`).all(annee, section)
    .map(l => ({ ...l, etp: (l.periodes || 0) / (l.type === 'PP' ? 1000 : 800), helb: l.contrat === 'HELB' }));
}

/* LE CALCUL DES COÛTS GARDÉ DIX MINUTES (3.5.432, Charles : « le rapport est lent à produire ») : donneesCout prend plusieurs secondes
   par année ; quatre années, et chaque réglage, le relançaient. */
const MEMO_COUT = new Map();
function coutMemo(a) {
  const m = MEMO_COUT.get(a);
  if (m && Date.now() - m.t < 600e3) return m.d;
  const d = donneesCout(a);
  MEMO_COUT.set(a, { t: Date.now(), d });
  return d;
}

/** Une année : périodes, ETP, coûts, inscrits, fonctions. */
function annee(section, a) {
  const L = attributions(section, a);
  const som = (f, filtre = () => true) => L.filter(filtre).reduce((t, l) => t + f(l), 0);
  let d = null;
  try { d = coutMemo(a); } catch (e) { console.error('[iip-helb] coût', a, e.message); }
  const S = d?.sections.find(x => x.section === section) || null;
  const missions = d?.missions || [];
  const pncc = missions.filter(m => m.pncc);
  const coutPncc = pncc.reduce((t, m) => t + (m.cout || 0), 0);
  const inscrits = S?.inscrits || 0;
  const base = d?.base_inscrits || 0;
  const partAdmin = base ? coutPncc * inscrits / base : 0;
  /* LES COORDINATIONS COMPTENT (3.5.429, Charles : « on doit compter les coordinations ») : chaque fonction de coordination de la
     section, part IIP et part HELB, en ETP × 800 × la période CT du niveau de la section — même quand la personne a des périodes de
     cours. Seule exception : sa coordination figure déjà en lignes d'attribution (codes CO…) — elle est alors dans la charge. */
  const tCT = tarifs()[niveauDeSection(section)]?.CT || 0;
  // Les codes de coordination de Lucie (COCUR, COSTA, COTFE, COSEC…) — en capitales : « Cours » n'en est pas un (3.5.432).
  const coordEnAttribution = new Set(L.filter(l => /^CO[A-Z]{2,4}$/.test(String(l.nature || ''))).map(l => l.professeur_id));
  const coord = missions.filter(m => !m.pncc && m.section_code === section).map(m => {
    const etpHelb = Number(m.etp_helb) || 0;
    const etpTot = Math.max(Number(m.etp) || 0, etpHelb);
    const etpIip = coordEnAttribution.has(m.professeur_id) ? 0 : Math.max(0, etpTot - etpHelb);
    return { fonction: m.fonction, personne: `${String(m.nom || '').toUpperCase()} ${m.prenom || ''}`.trim(),
      etp: etpTot, etp_helb: etpHelb, etp_iip: etpIip, deja: coordEnAttribution.has(m.professeur_id),
      cout_iip: etpIip * 800 * tCT, cout_helb: etpHelb * 800 * tCT };
  });
  /* CE QUE LA SECTION RAPPORTE (3.5.429, Charles : « le revenu par étudiant sur base des inscrits et de nos formules ») : le droit
     d'inscription et les frais, unité par unité, plus les forfaits — le calcul théorique de « Coûts des formations » (ni plafond, ni
     exonération). Une section dont un tiers perçoit les droits ne rapporte rien à l'IIP. */
  const recettes = S ? (S.droits_ues || []).reduce((t, u) => t + (u.droits?.recette || 0), 0) + (S.forfaits?.montant || 0) : 0;
  return {
    annee: a, lignes: L,
    per_iip: som(l => l.periodes, l => !l.helb), per_helb: som(l => l.periodes, l => l.helb),
    etp_iip: som(l => l.etp, l => !l.helb), etp_helb: som(l => l.etp, l => l.helb),
    profs_iip: new Set(L.filter(l => !l.helb && l.professeur_id).map(l => l.professeur_id)).size,
    profs_helb: new Set(L.filter(l => l.helb && l.professeur_id).map(l => l.professeur_id)).size,
    cout_iip: S?.cout_iip || 0, cout_helb: S?.cout_helb || 0, inscrits,
    admin: { fonctions: pncc.map(m => ({ fonction: m.fonction, etp: Number(m.etp) || 0, cout: m.cout || 0 })), cout: coutPncc, part: partAdmin, base },
    coord, recettes, tiers: S?.tiers || null,
    coord_helb: coord.reduce((t, c) => t + c.cout_helb, 0),
    coord_iip: coord.reduce((t, c) => t + c.cout_iip, 0),
    cetp_iip: coord.reduce((t, c) => t + c.etp_iip, 0),
    cetp_helb: coord.reduce((t, c) => t + c.etp_helb, 0),
  };
}

/* ── LES GRAPHIQUES, EN SVG, SANS SCRIPT ─────────────────────────────────────────────────────────────────────────────────── */
/* UN SEUL MOTEUR, QUATRE FORMES (3.5.431, Charles : « paramétrer ce que je veux comme diagrammes ») : colonnes empilées, colonnes côte
   à côte, parts en %, courbe. Deux séries (IIP, HELB) sur les années. Largeur fixe en mm : le texte ne se déforme pas. */
export const GRAPHES = [['empile', 'Colonnes empilées'], ['cote', 'Colonnes côte à côte'], ['parts', 'Parts en %'], ['courbe', 'Courbe'], ['aucun', 'Pas de graphique']];
function graphe(type, Y, iip, helb, fmt, titre) {
  if (type === 'aucun' || !Y.length) return '';
  const leg = `<div class="legendes"><span class="leg"><i style="background:${IIP}"></i>IIP</span><span class="leg"><i style="background:${HELB}"></i>HELB</span></div>`;
  if (type === 'parts') {
    return `<div class="cadre"><h3>${titre}</h3><table class="barres">${Y.map(y => {
      const i = iip(y) || 0, h = helb(y) || 0, t = i + h || 1;
      return `<tr><td class="barres-lib">${esc(y.annee)}</td><td class="barres-piste" style="background:transparent">
        <div class="parts"><span class="part" style="width:${(i / t) * 100}%;background:${IIP}"></span><span class="part" style="width:${(h / t) * 100}%;background:${HELB}"></span></div></td>
        <td class="barres-val">IIP ${pc(i, t)} · HELB ${pc(h, t)}</td></tr>`;
    }).join('')}</table>${leg}</div>`;
  }
  const W = 640, H = 230, bas = 190, haut = 30;
  const pas = (W - 40) / Y.length;
  const empile = type === 'empile';
  const max = Math.max(...Y.map(y => (empile ? (iip(y) || 0) + (helb(y) || 0) : Math.max(iip(y) || 0, helb(y) || 0))), 0) || 1;
  const h = v => ((v || 0) / max) * (bas - haut);
  const xc = i => 30 + pas * i + pas / 2;
  const lab = (x, y, t, o = {}) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${o.fs || 10}" font-weight="${o.fw || 600}" fill="${o.c || '#1B2B4B'}">${t}</text>`;
  let corps = '';
  if (type === 'courbe') {
    const pts = f => Y.map((y, i) => `${xc(i)},${bas - h(f(y))}`).join(' ');
    // La valeur de la courbe la plus haute au-dessus du point, l'autre en dessous : elles ne se chevauchent pas.
    corps = [[iip, IIP, helb], [helb, HELB, iip]].map(([f, c, autre]) => `<polyline points="${pts(f)}" fill="none" stroke="${c}" stroke-width="2.5"/>
      ${Y.map((y, i) => { const dessus = (f(y) || 0) >= (autre(y) || 0); return `<circle cx="${xc(i)}" cy="${bas - h(f(y))}" r="4" fill="${c}"/>${lab(xc(i), bas - h(f(y)) + (dessus ? -9 : 17), fmt(f(y)), { c })}`; }).join('')}`).join('');
  } else {
    const larg = Math.min(empile ? 90 : 40, empile ? pas - 30 : (pas - 30) / 2);
    corps = Y.map((y, i) => {
      const vi = iip(y) || 0, vh = helb(y) || 0;
      if (empile) {
        const x = xc(i) - larg / 2, hi = h(vi), hh = h(vh), yI = bas - hi, yH = yI - hh;
        return `<rect x="${x}" y="${yI}" width="${larg}" height="${hi}" fill="${IIP}" rx="2"/><rect x="${x}" y="${yH}" width="${larg}" height="${hh}" fill="${HELB}" rx="2"/>
          ${hi > 14 ? lab(xc(i), yI + hi / 2 + 4, fmt(vi), { c: '#fff' }) : ''}${hh > 14 ? lab(xc(i), yH + hh / 2 + 4, fmt(vh), { c: '#fff' }) : ''}
          ${lab(xc(i), yH - 5, fmt(vi + vh), { fs: 11, fw: 700 })}`;
      }
      const x1 = xc(i) - larg - 2, x2 = xc(i) + 2;
      return `<rect x="${x1}" y="${bas - h(vi)}" width="${larg}" height="${h(vi)}" fill="${IIP}" rx="2"/><rect x="${x2}" y="${bas - h(vh)}" width="${larg}" height="${h(vh)}" fill="${HELB}" rx="2"/>
        ${lab(x1 + larg / 2, bas - h(vi) - 4, fmt(vi), { c: IIP })}${lab(x2 + larg / 2, bas - h(vh) - 4, fmt(vh), { c: HELB })}`;
    }).join('');
  }
  const axes = Y.map((y, i) => lab(xc(i), bas + 15, court(y.annee), { fs: 11, fw: 400, c: '#475569' })).join('');
  return `<div class="cadre"><h3>${titre}</h3>
    <svg viewBox="0 0 ${W} ${H}" width="170mm" height="${(170 * H / W).toFixed(1)}mm">
      <line x1="20" y1="${bas}" x2="${W - 10}" y2="${bas}" stroke="#CBD5E1" stroke-width="1"/>${corps}${axes}</svg>${leg}</div>`;
}

/* ── LES PARTIES ET LES RÉGLAGES ─────────────────────────────────────────────────────────────────────────────────────────── */
/* LES PARTIES DU RAPPORT (3.5.431, Charles : « une page dans Gestion ; paramétrer les parties affichées, le type de graphique, ce qu'on
   mesure, l'ordre ; gardés, et l'impression les suit »). Le rapport d'Éditions est cette même page, réglée par défaut. */
export const PARTIES = [
  { cle: 'synthese', titre: 'Synthèse : chiffres clés et en bref' },
  { cle: 'charge', titre: 'La charge (ETP ou périodes)', graphe: 'empile' },
  { cle: 'couts', titre: 'Les coûts, poste par poste', graphe: 'empile' },
  { cle: 'etudiant', titre: 'Le coût d’un étudiant, deux méthodes', graphe: 'empile' },
  { cle: 'recettes', titre: 'Ce que la section rapporte', graphe: 'cote' },
  { cle: 'helb', titre: 'Pour la HELB : ce que coûte et rapporte la section', graphe: 'cote' },
  { cle: 'blocs', titre: 'L’enseignement par bloc' },
  { cle: 'natures', titre: 'L’enseignement par nature' },
  { cle: 'fonctions', titre: 'Les coordinations et le cadre administratif' },
  { cle: 'enseignants', titre: 'Par enseignant' },
  { cle: 'methode', titre: 'Méthode' },
];
export const MESURES = {
  charge: [['etp', 'En ETP'], ['periodes', 'En périodes']],
  cout: [['convention', 'Coût convention'], ['cmb', 'Coût moyen brut (HE)']],
  admin: [['oui', 'Avec le cadre administratif'], ['non', 'Sans le cadre administratif']],
  coord: [['oui', 'Avec les coordinations'], ['non', 'Enseignement seul']],
};
/* POUR LA HELB : CE QUE COÛTE ET RAPPORTE LA SECTION (3.5.433, Charles, 14 novembre 2026 : « calculer les coûts et bénéfices des
   étudiants pour la HELB ; montrer que la section est très peu coûteuse mais rapporte beaucoup » ; tranché : la HELB compte 50 % des
   inscrits, les droits d'inscription restent à l'IIP). Sources : la présentation financière de Vinci (MUCE 3 837,18 € en 2022, charges
   de fonctionnement 20,8 % de l'allocation, autres services 37,2 % des salaires enseignants), le courriel de F. Vanderoost (27 août
   2026 : santé × 1,5, coût moyen brut pondéré d'un MA proche de 90 000 €), le tableau Cor_HE_AE de la HELB (17 étudiants par ETP en
   moyenne). Les paramètres se règlent dans la page ; l'écran (IipHelbGestion.jsx) applique LA MÊME formule que helbAnnee. */
/* 3.5.435 (Charles : « TIM a été en création les trois premières années : l'allocation de la HE est fictive, elle ne commence à payer que
   cette année, de façon lissée ; les droits d'inscription vont directement à l'ASBL, et la HE paie ses enseignants avec son allocation —
   c'est de la rationalisation ») : l'allocation est nulle avant `debut`, puis vaut la MOYENNE des étudiants comptés des `lissage` années
   précédentes ; les droits et frais des étudiants de la section (au barème) entrent aux recettes, versés à l'ASBL. */
export const PARAM_HELB = { part: 50, muce: 3837.18, ponderation: 1.5, cmbp: 90000, autres: 37.2, fonctionnement: 20.8, moyenne: 17, debut: 2026, lissage: 3 };
/* LE MATÉRIEL ET LE FONCTIONNEMENT DE LA SECTION (3.5.436, Charles : « aller chercher dans les bilans ce que coûte la section en
   matériel » ; « vas-y »). La comptabilité analytique de l'ASBL (classeur « 2021 à 2024 Comptes & Budgets », cursus 111066) ne porte pour
   TIM en 2023 que des traitements, payés par la Fédération : aucun matériel. Ensuite, la part HELB (50 %) des lignes TIM des budgets
   initiaux 2025 et 2026 et du budget 2027 de Lucie, en prévision. Une année = le budget civil de sa seconde moitié. Corrigeable dans la
   page ; le forfait de 20,8 % de l'allocation reste au choix (mode_fonct), jamais additionné au réel — il couvre les mêmes achats. */
export const MATERIEL_HELB = {
  '2023-2024': { montant: 0, source: 'réel — comptabilité analytique 2023 (traitements seuls, aucun matériel)' },
  '2024-2025': { montant: 3250, source: 'prévu — budget initial 2025, part HELB 50 %' },
  '2025-2026': { montant: 7650, source: 'prévu — budget initial 2026, part HELB 50 %' },
  '2026-2027': { montant: 3750, source: 'prévu — budget 2027 (Lucie), part HELB 50 %' },
};
export function paramHelb(h = {}) {
  const o = { ...PARAM_HELB, mode_fonct: h?.mode_fonct === 'forfait' ? 'forfait' : 'reel' };
  for (const k of Object.keys(PARAM_HELB)) { const v = Number(String(h?.[k] ?? '').replace(',', '.')); if (h?.[k] !== undefined && h?.[k] !== '' && Number.isFinite(v) && v >= 0) o[k] = v; }
  return o;
}
/** L'année « 2024-2025 » décalée de k ans. */
export const anneeDecalee = (a, k) => `${Number(a.slice(0, 4)) - k}-${Number(a.slice(5, 9)) - k}`;
export function helbAnnee(y, P, avecCoord = true, inscritsDe = () => 0, materiel = null) {
  const comptes = y.inscrits * P.part / 100;
  const deb = Number(String(y.annee).slice(0, 4));
  let base = 0;
  if (deb >= P.debut) {
    const n = Math.max(1, Math.round(P.lissage));
    for (let k = 1; k <= n; k++) base += (inscritsDe(anneeDecalee(y.annee, k)) || 0) * P.part / 100;
    base /= n;
  }
  const allocation = base * P.muce * P.ponderation;
  const droits = y.tiers ? 0 : (y.recettes || 0);
  const recettes = allocation + droits;
  const etp = y.ens_helb + (avecCoord ? y.cetp_helb : 0);
  const salaires = etp * P.cmbp;
  const autres = salaires * P.autres / 100;
  const fonct = P.mode_fonct === 'forfait' ? allocation * P.fonctionnement / 100 : (materiel ?? MATERIEL_HELB[y.annee]?.montant ?? 0);
  const cout = salaires + autres + fonct;
  return { comptes, base, allocation, droits, recettes, etp, salaires, autres, fonct, cout, resultat: recettes - cout, parEtp: etp ? comptes / etp : null };
}

/** Les réglages, nettoyés : rien ne passe qui ne soit au catalogue. */
export function reglagesIipHelb(c = {}) {
  const cles = PARTIES.map(x => x.cle);
  const ordre = [...(Array.isArray(c.ordre) ? c.ordre.filter(k => cles.includes(k)) : []), ...cles].filter((k, i, t) => t.indexOf(k) === i);
  const masques = (Array.isArray(c.masques) ? c.masques : []).filter(k => cles.includes(k));
  const graphes = {};
  for (const x of PARTIES) if (x.graphe) graphes[x.cle] = GRAPHES.some(([g]) => g === c.graphes?.[x.cle]) ? c.graphes[x.cle] : x.graphe;
  const mesures = {};
  for (const [k, opts] of Object.entries(MESURES)) mesures[k] = opts.some(([v]) => v === c.mesures?.[k]) ? c.mesures[k] : opts[0][0];
  // LES INSCRITS RETENUS (3.5.434, Charles : « en 23-24 il y avait 117 étudiants ») : les années reprises d'Excel n'ont pas tous leurs
  // dossiers dans Lucie ; la direction pose le chiffre réel, année par année, et la pièce le dit.
  const inscrits = {};
  for (const [a, v] of Object.entries(c.inscrits || {})) { const n = Number(v); if (/^\d{4}-\d{4}$/.test(a) && Number.isFinite(n) && n > 0) inscrits[a] = Math.round(n); }
  const materiel = {};
  for (const [a, v] of Object.entries(c.materiel || {})) { const n = Number(v); if (/^\d{4}-\d{4}$/.test(a) && v !== '' && Number.isFinite(n) && n >= 0) materiel[a] = n; }
  return { ordre, masques, graphes, mesures, saut: c.saut !== false, helb: paramHelb(c.helb), inscrits, materiel };
}

/* ── LE DOCUMENT ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function documentIipHelb(p) {
  const section = p.section || 'TIM';
  const R = reglagesIipHelb(p.reglages);
  const toutes = db.prepare('SELECT DISTINCT annee_scolaire a FROM attribution WHERE section = ? ORDER BY 1').all(section).map(r => r.a);
  const annees = (p.annees?.length ? p.annees : toutes.slice(-4)).filter(a => toutes.includes(a)).sort();
  if (!annees.length) {
    return { corps: `<p>Aucune attribution en ${esc(section)} pour les années choisies.</p>`, titre: 'IIP et HELB', nom: 'IIP-HELB.html',
      entete: { titre: `IIP et HELB — ${section}`, sous: '' } };
  }
  const avecCoord = R.mesures.coord === 'oui', avecAdmin = R.mesures.admin === 'oui', enPer = R.mesures.charge === 'periodes';
  const niv = niveauDeSection(section);
  const taux = getParamNum(`cout.cmb_${niv.toLowerCase()}`, 0);
  const cmb = R.mesures.cout === 'cmb' && taux;
  const Y = annees.map(a => annee(section, a));
  for (const y of Y) {
    // Les droits et frais suivent les inscrits retenus : le montant moyen par étudiant de Lucie × le nombre retenu.
    if (R.inscrits[y.annee]) { y.inscrits_lucie = y.inscrits; y.inscrits = R.inscrits[y.annee]; if (y.inscrits_lucie) y.recettes = y.recettes * y.inscrits / y.inscrits_lucie; }
    y.ens_iip = y.etp_iip; y.ens_helb = y.etp_helb;
    if (!avecCoord) { y.cetp_iip = 0; y.cetp_helb = 0; y.coord_iip = 0; y.coord_helb = 0; }
    y.etp_iip = y.ens_iip + y.cetp_iip; y.etp_helb = y.ens_helb + y.cetp_helb;
    y.etp = y.etp_iip + y.etp_helb;
    y.pc_iip = y.per_iip + y.cetp_iip * 800; y.pc_helb = y.per_helb + y.cetp_helb * 800;   // périodes, coordinations à 800 par ETP
    y.per = y.per_iip + y.per_helb;
    const adm = avecAdmin ? y.admin.part : 0;
    // Le coût de chacun, selon la méthode choisie : convention (barème) ou coût moyen brut (un montant par période).
    y.c_iip = (cmb ? y.pc_iip * taux : y.cout_iip + y.coord_iip) + adm;
    y.c_helb = cmb ? y.pc_helb * taux : y.cout_helb + y.coord_helb;
    y.tout_iip = y.cout_iip + y.coord_iip + adm; y.tout_helb = y.cout_helb + y.coord_helb;
  }
  const methode = cmb ? `coût moyen brut (${n2(taux)} € la période)` : 'coût convention';
  const premiere = toutes[0];
  const a0 = Y[0], aN = Y[Y.length - 1];
  const evol = (k) => (a0[k] ? `${aN[k] >= a0[k] ? '+' : '−'}${Math.round(Math.abs((aN[k] - a0[k]) / a0[k]) * 100)} %` : '—');
  const totH = Y.reduce((t, y) => t + y.c_helb, 0), totI = Y.reduce((t, y) => t + y.c_iip, 0);
  const chargeI = y => (enPer ? y.pc_iip : y.etp_iip), chargeH = y => (enPer ? y.pc_helb : y.etp_helb);
  const fmtCharge = enPer ? n0 : n2, uCharge = enPer ? 'périodes' : 'ETP';
  const quoi = [avecCoord && 'coordinations', avecAdmin && 'cadre administratif'].filter(Boolean);
  const quoiTxt = quoi.length ? `, ${quoi.join(' et ')} compris` : '';

  const P = {};
  P.synthese = () => `
    <table class="tuiles"><tr>
      <td class="tuile"><div class="tuile-boite fort" style="border-left-color:#1B2B4B"><div class="tuile-val">${fmtCharge(chargeI(aN) + chargeH(aN))}<span class="tuile-u">${uCharge}</span></div>
        <div class="tuile-lib">Charge ${esc(aN.annee)}</div><div class="tuile-fin">${avecCoord ? 'enseignement et coordinations' : 'enseignement'}</div></div></td>
      <td class="tuile"><div class="tuile-boite" style="border-left-color:${IIP}"><div class="tuile-val">${pc(chargeI(aN), chargeI(aN) + chargeH(aN))}</div>
        <div class="tuile-lib">Part de l'IIP</div><div class="tuile-fin">${fmtCharge(chargeI(aN))} ${uCharge} · ${aN.profs_iip} enseignant(s)</div></div></td>
      <td class="tuile"><div class="tuile-boite" style="border-left-color:${HELB}"><div class="tuile-val">${pc(chargeH(aN), chargeI(aN) + chargeH(aN))}</div>
        <div class="tuile-lib">Part de la HELB</div><div class="tuile-fin">${fmtCharge(chargeH(aN))} ${uCharge} · ${aN.profs_helb} enseignant(s)</div></div></td>
      <td class="tuile"><div class="tuile-boite" style="border-left-color:#1B2B4B"><div class="tuile-val">${n0(aN.inscrits)}</div>
        <div class="tuile-lib">Inscrits ${esc(aN.annee)}</div><div class="tuile-fin">${Y.length > 1 ? `${n0(a0.inscrits)} en ${esc(a0.annee)}` : ''}</div></div></td>
    </tr></table>
    <div class="en-bref"><h3>En bref</h3><ul>${[
      `Sur ${Y.length} année${Y.length > 1 ? 's' : ''} (${esc(annees[0])} à ${esc(annees[annees.length - 1])}), au ${methode}${quoiTxt}, la section ${esc(section)}
        a coûté <b>${eur(totI)}</b> à l'IIP et <b>${eur(totH)}</b> à la HELB : la HELB en porte <b>${pc(totH, totI + totH)}</b>.`,
      `En ${esc(aN.annee)}, la charge est de <b>${fmtCharge(chargeI(aN) + chargeH(aN))} ${uCharge}</b> : <b>${fmtCharge(chargeI(aN))}</b> à l'IIP
        (${pc(chargeI(aN), chargeI(aN) + chargeH(aN))}) et <b>${fmtCharge(chargeH(aN))}</b> à la HELB.`,
      Y.length > 1 ? `De ${esc(a0.annee)} à ${esc(aN.annee)}, l'ETP de l'IIP évolue de ${evol('etp_iip')} et celui de la HELB de ${evol('etp_helb')} ;
        les inscrits passent de ${n0(a0.inscrits)} à ${n0(aN.inscrits)}.` : '',
      aN.inscrits && !aN.tiers ? `En ${esc(aN.annee)}, un étudiant rapporte <b>${eur(aN.recettes / aN.inscrits)}</b> en droits d'inscription et frais (au barème, versés
        à l'ASBL) et coûte à l'IIP <b>${eur(aN.c_iip / aN.inscrits)}</b>.` : '',
      premiere && annees.includes(premiere) ? `${esc(premiere)} est la première année de la section dans Lucie : une section qui ouvre ne compte que ses premiers blocs.` : '',
      (avecCoord || avecAdmin) && Y.some(y => !y.admin.fonctions.length) ? `Les fonctions (coordinations, cadre administratif) ne sont encodées que pour
        ${Y.filter(y => y.admin.fonctions.length).map(y => esc(y.annee)).join(', ') || 'aucune année'}.` : '',
    ].filter(Boolean).map(x => `<li>${x}</li>`).join('')}</ul></div>`;

  P.charge = () => `<h2>La charge, année par année</h2>
    ${graphe(R.graphes.charge, Y, chargeI, chargeH, fmtCharge, `La charge en ${uCharge} — ${avecCoord ? 'enseignement et coordinations' : 'enseignement'}`)}
    <table class="annees"><thead><tr><th>Année</th><th class="n">Pér. IIP</th><th class="n">Pér. HELB</th><th class="n">Ens. IIP</th><th class="n">Ens. HELB</th>
      ${avecCoord ? '<th class="n">Coord. IIP</th><th class="n">Coord. HELB</th>' : ''}<th class="n">ETP total</th><th class="n">Part HELB</th>
      <th class="n">Ens. IIP / HELB</th><th class="n">Inscrits</th><th class="n">ETP / 100 ét.</th></tr></thead>
      <tbody>${Y.map(y => `<tr><td>${esc(y.annee)}</td><td class="n">${n0(y.per_iip)}</td><td class="n">${n0(y.per_helb)}</td>
        <td class="n">${n2(y.ens_iip)}</td><td class="n">${n2(y.ens_helb)}</td>
        ${avecCoord ? `<td class="n">${y.coord.length ? n2(y.cetp_iip) : '—'}</td><td class="n">${y.coord.length ? n2(y.cetp_helb) : '—'}</td>` : ''}
        <td class="n g">${n2(y.etp)}</td><td class="n">${pc(y.etp_helb, y.etp)}</td><td class="n">${y.profs_iip} / ${y.profs_helb}</td>
        <td class="n">${n0(y.inscrits)}</td><td class="n">${y.inscrits ? n2(y.etp / y.inscrits * 100) : '—'}</td></tr>`).join('')}</tbody></table>`;

  P.couts = () => `<h2>Les coûts, poste par poste</h2>
    ${graphe(R.graphes.couts, Y, y => y.c_iip, y => y.c_helb, v => `${n0(v / 1000)} k€`, `Le coût de la section — ${methode}${quoiTxt}`)}
    <table class="annees"><thead><tr><th>Année</th><th class="n">Cours IIP</th><th class="n">Cours HELB</th>
      ${avecCoord ? '<th class="n">Coord. IIP</th><th class="n">Coord. HELB</th>' : ''}${avecAdmin ? '<th class="n">Cadre admin. (IIP)</th>' : ''}
      <th class="n">Total IIP</th><th class="n">Total HELB</th><th class="n">Part HELB</th></tr></thead><tbody>
      ${Y.map(y => `<tr><td>${esc(y.annee)}</td><td class="n">${eur(y.cout_iip)}</td><td class="n">${eur(y.cout_helb)}</td>
        ${avecCoord ? `<td class="n">${y.coord.length ? eur(y.coord_iip) : '—'}</td><td class="n">${y.coord.length ? eur(y.coord_helb) : '—'}</td>` : ''}
        ${avecAdmin ? `<td class="n">${y.admin.fonctions.length ? eur(y.admin.part) : '—'}</td>` : ''}
        <td class="n g">${eur(y.tout_iip)}</td><td class="n g">${eur(y.tout_helb)}</td><td class="n">${pc(y.tout_helb, y.tout_iip + y.tout_helb)}</td></tr>`).join('')}
      <tr class="repere"><td>Ensemble</td><td class="n">${eur(Y.reduce((t, y) => t + y.cout_iip, 0))}</td><td class="n">${eur(Y.reduce((t, y) => t + y.cout_helb, 0))}</td>
        ${avecCoord ? `<td class="n">${eur(Y.reduce((t, y) => t + y.coord_iip, 0))}</td><td class="n">${eur(Y.reduce((t, y) => t + y.coord_helb, 0))}</td>` : ''}
        ${avecAdmin ? `<td class="n">${eur(Y.reduce((t, y) => t + y.admin.part, 0))}</td>` : ''}
        <td class="n">${eur(Y.reduce((t, y) => t + y.tout_iip, 0))}</td><td class="n">${eur(Y.reduce((t, y) => t + y.tout_helb, 0))}</td><td class="n"></td></tr></tbody></table>
    <p class="fin">Le tableau est au coût convention : les périodes au barème de la circulaire des conventions (CT, PP, cours spéciaux, par niveau),
      comme « Coûts des formations ». Coordinations : ETP × 800 × la période CT du niveau, part IIP et part HELB — sauf si elles figurent déjà
      dans les attributions. Cadre administratif (direction, secrétariat) : partagé entre les sections au prorata des inscrits, porté par l'IIP.</p>`;

  P.etudiant = () => {
    const parEt = (v, y) => (y.inscrits ? eur(v / y.inscrits) : '—');
    const L = Y.map(y => ({ y, convI: y.cout_iip + y.coord_iip, convH: y.cout_helb + y.coord_helb,
      cmbI: taux ? y.pc_iip * taux : null, cmbH: taux ? y.pc_helb * taux : null, admin: avecAdmin ? y.admin.part : 0 }));
    const Yi = Y.filter(y => y.inscrits);
    return `<h2>Le coût d’un étudiant — l’IIP et la HELB, deux méthodes</h2>
      ${graphe(R.graphes.etudiant, Yi, y => y.c_iip / y.inscrits, y => y.c_helb / y.inscrits, v => `${n0(v)} €`, `Le coût d’un étudiant — ${methode}${quoiTxt}`)}
      <table class="annees"><thead>
        <tr><th rowspan="2">Année</th><th class="n" rowspan="2">Inscrits</th><th class="n" colspan="3">Coût convention, par étudiant</th>
          <th class="n" colspan="3">Coût moyen brut${taux ? ` (${n2(taux)} € / période)` : ''}, par étudiant</th>${avecAdmin ? '<th class="n" rowspan="2">Cadre admin. (IIP)</th>' : ''}</tr>
        <tr><th class="n">IIP</th><th class="n">HELB</th><th class="n">Total</th><th class="n">IIP</th><th class="n">HELB</th><th class="n">Total</th></tr></thead>
        <tbody>${L.map(l => `<tr><td>${esc(l.y.annee)}</td><td class="n">${n0(l.y.inscrits)}</td>
          <td class="n">${parEt(l.convI, l.y)}</td><td class="n">${parEt(l.convH, l.y)}</td><td class="n g">${parEt(l.convI + l.convH, l.y)}</td>
          <td class="n">${taux ? parEt(l.cmbI, l.y) : '—'}</td><td class="n">${taux ? parEt(l.cmbH, l.y) : '—'}</td><td class="n g">${taux ? parEt(l.cmbI + l.cmbH, l.y) : '—'}</td>
          ${avecAdmin ? `<td class="n">${l.admin ? parEt(l.admin, l.y) : '—'}</td>` : ''}</tr>`).join('')}</tbody></table>
      <p class="fin">Par étudiant : l'enseignement${avecCoord ? ' et les coordinations' : ''} de la section, divisé par ses inscrits de l'année.
        <b>Coût convention</b> : le montant d'une période selon son type et son niveau. <b>Coût moyen brut</b> : la méthode de la Haute École, un
        montant unique par période${avecCoord ? ' (coordinations à 800 périodes par ETP)' : ''}${taux ? '' : ' — non réglé : Configuration → Coût des périodes'}.
        ${avecAdmin ? 'Le cadre administratif, porté par l’IIP, s’ajoute à sa part quelle que soit la méthode.' : ''}</p>`;
  };

  P.recettes = () => {
    const Yi = Y.filter(y => y.inscrits && !y.tiers);
    return `<h2>Ce que la section rapporte, par étudiant</h2>
    ${R.graphes.recettes === 'aucun' ? '' : (() => {
      // Ici les deux séries sont « ce qu'il rapporte » et « ce qu'il coûte à l'IIP » : même dessin, autres légendes.
      const g = graphe(R.graphes.recettes === 'parts' ? 'cote' : R.graphes.recettes, Yi, y => y.c_iip / y.inscrits, y => y.recettes / y.inscrits, v => `${n0(v)} €`, 'Un étudiant : ce qu’il coûte à l’IIP et ce qu’il lui rapporte');
      return g.replace('</i>IIP</span>', '</i>Coût pour l’IIP</span>').replace('</i>HELB</span>', '</i>Droits et frais perçus</span>');
    })()}
    <table class="annees"><thead><tr><th>Année</th><th class="n">Inscrits</th><th class="n">Droits et frais (ASBL)</th><th class="n">Par étudiant</th>
      <th class="n">Coût IIP par étudiant</th><th class="n">Coût HELB par étudiant</th></tr></thead><tbody>
      ${Y.map(y => `<tr><td>${esc(y.annee)}</td><td class="n">${n0(y.inscrits)}</td>
        <td class="n">${y.tiers ? `<span class="fin">perçus par ${esc(y.tiers)}</span>` : eur(y.recettes)}</td>
        <td class="n g">${y.inscrits && !y.tiers ? eur(y.recettes / y.inscrits) : '—'}</td>
        <td class="n">${y.inscrits ? eur(y.c_iip / y.inscrits) : '—'}</td><td class="n">${y.inscrits ? eur(y.c_helb / y.inscrits) : '—'}</td></tr>`).join('')}</tbody></table>
    <p class="fin">Droits et frais au barème de l'année, unité par unité pour les inscrits de la section, plus les forfaits : le calcul de « Coûts des
      formations », sans plafond ni exonération — le perçu réel se lit dans les fiches. Coûts au ${methode}${quoiTxt}.</p>`;
  };

  P.helb = () => {
    const H = R.helb;
    const insc = {};
    for (const a of toutes) { try { insc[a] = coutMemo(a).sections.find(x => x.section === section)?.inscrits || 0; } catch { insc[a] = 0; } }
    for (const [a, n] of Object.entries(R.inscrits)) insc[a] = n;
    const L = Y.map(y => ({ y, h: helbAnnee(y, H, avecCoord, a => insc[a], R.materiel[y.annee]) }));
    const tot = k => L.reduce((t, l) => t + l.h[k], 0);
    const g = graphe(R.graphes.helb === 'parts' ? 'cote' : R.graphes.helb, L.map(l => ({ annee: l.y.annee, a: l.h.recettes, b: l.h.cout })), y => y.a, y => y.b,
      v => `${n0(v / 1000)} k€`, 'Pour la HELB et l’ASBL : ce que la section rapporte et ce qu’elle coûte')
      .replace('</i>IIP</span>', '</i>Ce qu’elle rapporte</span>').replace('</i>HELB</span>', '</i>Ce qu’elle coûte</span>')
      .replaceAll(`fill="${IIP}"`, 'fill="#3E7D5E"').replaceAll(`background:${IIP}`, 'background:#3E7D5E');
    return `<h2>Pour la HELB et l’ASBL : ce que coûte et rapporte la section</h2>
    ${g}
    <table class="annees"><thead><tr><th>Année</th><th class="n">Inscrits</th><th class="n">Comptés (lissés)</th><th class="n">Allocation</th><th class="n">Droits (ASBL)</th>
      <th class="n">ETP HELB</th><th class="n">Salaires</th><th class="n">Autres services</th><th class="n">${H.mode_fonct === 'forfait' ? 'Fonctionnement (forfait)' : 'Matériel et fonct.'}</th><th class="n">Coût</th>
      <th class="n">Résultat</th><th class="n">Étu. / ETP</th></tr></thead><tbody>
      ${L.map(({ y, h }) => `<tr><td>${esc(y.annee)}</td><td class="n">${n0(y.inscrits)}</td><td class="n">${h.base ? n0(h.base) : '—'}</td>
        <td class="n">${h.allocation ? eur(h.allocation) : '<span class="fin">en création</span>'}</td><td class="n">${eur(h.droits)}</td>
        <td class="n">${n2(h.etp)}</td><td class="n">${eur(h.salaires)}</td><td class="n">${eur(h.autres)}</td><td class="n">${eur(h.fonct)}</td><td class="n">${eur(h.cout)}</td>
        <td class="n g" style="color:${h.resultat >= 0 ? '#3E7D5E' : '#9D4A38'}">${h.resultat >= 0 ? '+' : '−'}${eur(Math.abs(h.resultat))}</td>
        <td class="n">${h.parEtp ? n0(h.parEtp) : '—'}</td></tr>`).join('')}
      <tr class="repere"><td>Ensemble</td><td class="n"></td><td class="n"></td><td class="n">${eur(tot('allocation'))}</td><td class="n">${eur(tot('droits'))}</td><td class="n"></td><td class="n">${eur(tot('salaires'))}</td>
        <td class="n">${eur(tot('autres'))}</td><td class="n">${eur(tot('fonct'))}</td><td class="n">${eur(tot('cout'))}</td>
        <td class="n g">${tot('resultat') >= 0 ? '+' : '−'}${eur(Math.abs(tot('resultat')))}</td><td class="n"></td></tr></tbody></table>
    <p class="fin">Allocation : nulle avant ${H.debut}-${H.debut + 1} (la section était en création) ; ensuite, la moyenne des étudiants comptés
      (${n0(H.part)} % des inscrits) des ${n0(H.lissage)} années précédentes × ${n2(H.muce)} € (unité de charge d'enseignement) × ${n2(H.ponderation)}
      (pondération santé). Droits : les droits d'inscription et frais des étudiants de la section, au barème, versés à l'ASBL, qui alimentent
      les moyens de la Haute École. L'IIP, lui, a financé sa part sur ses propres dotations (périodes de la Fédération) : aucun coût supplémentaire, une optimisation des moyens existants. Coût : les ETP HELB${avecCoord ? ' (enseignement et coordinations)' : ''} × ${n0(H.cmbp)} € (coût moyen brut pondéré), plus ${n2(H.autres)} %
      pour les autres services, et ${H.mode_fonct === 'forfait' ? `${n2(H.fonctionnement)} % de l'allocation pour le fonctionnement (forfait)`
        : `le matériel et le fonctionnement de la section : ${L.map(({ y }) => `${esc(y.annee)} ${R.materiel[y.annee] != null ? 'posé par la direction' : esc(MATERIEL_HELB[y.annee]?.source || 'inconnu')}`).join(' ; ')}`}.
      Pour comparaison, l'orthoptie porte en 2023 des frais réels de matériel, de documentation, d'informatique et d'amortissements (comptabilité analytique). La HELB compte en moyenne ${n0(H.moyenne)} étudiants par ETP.
      Sources : présentation financière des départements (Vinci), courriel de F. Vanderoost du 27 août 2026, tableau Cor_HE_AE. </p>`;
  };

  const croise = (cleDe, libelle, titre) => {
    const cles = [...new Set(Y.flatMap(y => y.lignes.map(cleDe)))].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
    const v = (y, k, h) => y.lignes.filter(l => cleDe(l) === k && l.helb === h).reduce((t, l) => t + l.etp, 0);
    return `<h2>${titre}</h2><table><thead><tr><th>${libelle}</th>${Y.map(y => `<th class="n" colspan="2">${esc(court(y.annee))}</th>`).join('')}</tr>
      <tr><th></th>${Y.map(() => '<th class="n">IIP</th><th class="n">HELB</th>').join('')}</tr></thead><tbody>
      ${cles.map(k => `<tr><td>${esc(NATURES[k] || (/^\d+$/.test(String(k)) ? `Autre (${k})` : k))}</td>${Y.map(y => `<td class="n">${v(y, k, false) ? n2(v(y, k, false)) : '—'}</td>
        <td class="n">${v(y, k, true) ? n2(v(y, k, true)) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  P.blocs = () => croise(l => l.bloc, 'Bloc', 'L’enseignement par bloc d’études (ETP)');
  P.natures = () => croise(l => l.nature, 'Nature', 'L’enseignement par nature (ETP)');

  P.fonctions = () => `<h2>Les coordinations et le cadre administratif</h2>${Y.map(y => `<h3>${esc(y.annee)}</h3>${!y.coord.length && !y.admin.fonctions.length
    ? '<p class="fin">Aucune fonction encodée pour cette année (onglet Fonctions de la fiche du personnel).</p>'
    : `<table><thead><tr><th>Fonction</th><th>Personne</th><th class="n">ETP</th><th class="n">dont HELB</th><th class="n">Coût IIP</th><th class="n">Coût HELB</th></tr></thead><tbody>
      ${y.coord.map(c => `<tr><td>${esc(c.fonction)}</td><td>${esc(c.personne)}</td><td class="n">${c.etp ? n2(c.etp) : '—'}</td><td class="n">${c.etp_helb ? n2(c.etp_helb) : '—'}</td>
        <td class="n">${c.deja ? '<span class="fin">dans ses attributions</span>' : c.cout_iip ? eur(c.cout_iip) : '—'}</td>
        <td class="n">${c.cout_helb ? eur(c.cout_helb) : '—'}</td></tr>`).join('')}
      ${y.admin.fonctions.length ? `<tr class="repere"><td colspan="2">Cadre administratif de l'établissement (${y.admin.fonctions.map(f => esc(f.fonction)).filter((v, i, t) => t.indexOf(v) === i).join(', ')})</td>
        <td class="n">${n2(y.admin.fonctions.reduce((t, f) => t + f.etp, 0))}</td><td class="n">—</td><td class="n">${eur(y.admin.cout)}</td><td class="n">—</td></tr>
        <tr><td colspan="4">— part de ${esc(section)} : ${n0(y.inscrits)} inscrits sur ${n0(y.admin.base)} (${pc(y.inscrits, y.admin.base)})</td>
        <td class="n g">${y.admin.cout ? eur(y.admin.part) : 'ETP à régler'}</td><td class="n">—</td></tr>` : ''}
      </tbody></table>`}`).join('')}`;

  P.enseignants = () => {
    const profs = new Map();
    for (const y of Y) for (const l of y.lignes) {
      const k = `${l.professeur || 'À désigner'}|${l.helb ? 'HELB' : 'IIP'}`;
      if (!profs.has(k)) profs.set(k, {});
      profs.get(k)[y.annee] = (profs.get(k)[y.annee] || 0) + l.etp;
    }
    const rang = [...profs.entries()].sort((a, b) => (b[1][aN.annee] || 0) - (a[1][aN.annee] || 0) || a[0].localeCompare(b[0], 'fr'));
    return `<h2>Qui porte la charge — par enseignant (ETP)</h2><table><thead><tr><th>Professeur</th><th>Contrat</th>${Y.map(y => `<th class="n">${esc(court(y.annee))}</th>`).join('')}</tr></thead><tbody>
      ${rang.map(([k, v]) => { const [nom, c] = k.split('|'); return `<tr><td>${esc(nom)}</td>
        <td><span class="marque" style="background:${c === 'HELB' ? HELB : IIP}">${c}</span></td>
        ${Y.map(y => `<td class="n">${v[y.annee] ? n2(v[y.annee]) : '—'}</td>`).join('')}</tr>`; }).join('')}</tbody></table>
      <p class="fin">Charge d'enseignement seule ; les coordinations sont détaillées avec les fonctions.</p>`;
  };

  P.methode = () => `<h2>Méthode</h2>
    <p class="fin">Source : les attributions de Lucie (les années ${esc(annees.filter(a => a < '2025-2026').join(', ') || '—')} reprises des fichiers
      d'attributions de la direction), hors congés. ETP au barème du Pilotage : périodes CT ÷ 800 + PP ÷ 1 000, autonomie comprise ; une
      attribution sans type compte en CT. « HELB » : attributions dont le contrat est HELB. Inscrits : ceux des chiffres clés de l'année.
      Graphiques au ${methode}${quoiTxt}. ${Y.filter(y => y.inscrits_lucie != null).map(y => `Inscrits ${esc(y.annee)} : ${n0(y.inscrits)} retenus par la direction (Lucie en compte ${n0(y.inscrits_lucie)}).`).join(' ')} ${premiere ? `Première année de ${esc(section)} dans Lucie : ${esc(premiere)}.` : ''}</p>`;

  const visibles = R.ordre.filter(k => !R.masques.includes(k));
  const corps = `
    <style>
      h2 { font-size:12pt; margin:8mm 0 2mm; color:#1B2B4B; }
      .partie + .partie.saut { break-before: page; }
      .en-bref ul { margin:1mm 0 0 4mm; padding:0; } .en-bref li { margin:0 0 1.5mm; font-size:9.5pt; line-height:1.4; }
      td.g { font-weight:700; }
      table.annees tbody td:first-child, table.annees td.n { white-space:nowrap; }
      table.annees th, table.annees td { padding-left:1.2mm; padding-right:1.2mm; }
      .fin { color:#64748b; font-size:8pt; }
    </style>
    ${visibles.map((k, i) => `<section class="partie${R.saut && i > 0 && !['synthese', 'methode'].includes(k) ? ' saut' : ''}">${P[k]()}</section>`).join('')}`;

  return {
    corps,
    titre: `IIP et HELB — ${section}`,
    nom: `IIP-HELB-${section}-${annees.map(court).join('_')}.html`,
    entete: { titre: `IIP et HELB : la charge et le coût de ${section}`, sous: `${annees.join(' · ')} · ${methode}${quoiTxt}` },
  };
}

/* LES DONNÉES, POUR LA PAGE DE GESTION (3.5.432, Charles : « en natif, comme le rapport finances ; plus précis avec les coordinations ;
   tout en accès direct »). Les mêmes chiffres que la pièce, sans mise en page : l'écran les dessine avec les composants de Lucie. */
export function donneesIipHelb(section, anneesDemandees) {
  const toutes = db.prepare('SELECT DISTINCT annee_scolaire a FROM attribution WHERE section = ? ORDER BY 1').all(section).map(r => r.a);
  const annees = (anneesDemandees?.length ? anneesDemandees : toutes.slice(-4)).filter(a => toutes.includes(a)).sort();
  const niv = niveauDeSection(section);
  const ens = new Map();
  const Y = annees.map(a => {
    const y = annee(section, a);
    const parCle = f => { const o = {}; for (const l of y.lignes) { const k = f(l); o[k] ||= { iip: 0, helb: 0 }; o[k][l.helb ? 'helb' : 'iip'] += l.etp; } return o; };
    for (const l of y.lignes) {
      const k = `${l.professeur || 'À désigner'}|${l.helb ? 'HELB' : 'IIP'}`;
      if (!ens.has(k)) ens.set(k, { nom: l.professeur || 'À désigner', contrat: l.helb ? 'HELB' : 'IIP', par: {} });
      ens.get(k).par[a] = (ens.get(k).par[a] || 0) + l.etp;
    }
    const { lignes, ...reste } = y;
    return { ...reste, ens_iip: y.etp_iip, ens_helb: y.etp_helb,
      blocs: parCle(l => l.bloc), natures: parCle(l => NATURES[l.nature] || (/^\d+$/.test(String(l.nature)) ? `Autre (${l.nature})` : l.nature)) };
  });
  // Les inscrits de chaque année de la section, pour le lissage de l'allocation (années hors du choix comprises).
  const inscrits_annees = {};
  for (const a of toutes) { try { inscrits_annees[a] = coutMemo(a).sections.find(x => x.section === section)?.inscrits || 0; } catch { inscrits_annees[a] = 0; } }
  return { section, annees, toutes, premiere: toutes[0] || null, inscrits_annees, materiel_defaut: MATERIEL_HELB, niveau: niv, taux_cmb: getParamNum(`cout.cmb_${niv.toLowerCase()}`, 0),
    tarif_ct: tarifs()[niv]?.CT || 0, Y, enseignants: [...ens.values()] };
}

/** Pour l'aperçu en tableau et le tableur : une ligne par année. */
export function lignesIipHelb(p) {
  const section = p.section || 'TIM';
  const annees = (p.annees?.length ? p.annees : []).sort();
  return annees.map(a => {
    const y = annee(section, a);
    return { annee: a, section, etp_iip: Math.round((y.etp_iip + y.cetp_iip) * 100) / 100, etp_helb: Math.round((y.etp_helb + y.cetp_helb) * 100) / 100,
      per_iip: Math.round(y.per_iip), per_helb: Math.round(y.per_helb), cout_iip: Math.round(y.cout_iip + y.coord_iip + y.admin.part),
      cout_helb: Math.round(y.cout_helb + y.coord_helb), inscrits: y.inscrits,
      recettes: Math.round(y.recettes), par_etudiant: y.inscrits ? Math.round(y.recettes / y.inscrits) : null };
  });
}

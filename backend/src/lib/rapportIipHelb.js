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
import { sourcesEnVigueur } from './sourcesReference.js';

const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const n0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const n2 = n => (n || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = n => `${n0(n)} €`;
const n1r = n => (n || 0).toLocaleString('fr-BE', { maximumFractionDigits: 1 });
const pc = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const court = a => `${String(a).slice(0, 4)}-${String(a).slice(7, 9)}`;
const IIP = '#19537E', HELB = '#C2408A';
const NATURES = { Cours: 'Cours', EI: 'Épreuve intégrée', ES: 'Encadrement de stages', COCUR: 'Coordination de cursus',
  COSTA: 'Coordination des stages', COTFE: 'Coordination des TFE', COSEC: 'Coordination de section', CP: 'Coordination pédagogique' };

/** Les attributions d'une section pour une année, regroupées. */
/* UN ETP DE LA HELB SE COMPTE EN HEURES DE LA HELB (3.5.463-464, Charles, 15 novembre 2026 : « seuls les cours de théorie donnés par
   un MA sont payés en 480 h ; le reste en 750 h, et si pas MA, au tarif d'un MFP »). LA RÈGLE EXISTAIT DÉJÀ dans Lucie (Pilotage → ETP,
   `calculHELB` de frontend/src/lib/helb.js) : on la reprend, on ne la réécrit pas. Par ligne HELB : le titre = la colonne « HELB » de
   la ligne (MA / MFP), à défaut le statut HELB de la fiche ; la nature = TH ou TP de la ligne (`helb_nature`) ; heures = périodes ×
   50/60 (`charge_en_heures`), ou les périodes telles quelles si les lignes sont en heures. Diviseur : coordination 1 400, MFP 750,
   MA / PI / à défaut : théorie 480, TP 750. Les lignes IIP gardent la règle de la dotation : CT ÷ 800, PP ÷ 1 000. */
export const HEURES_HELB = { CT: 480, PP: 750, COORD: 1400 };
export const divHelb = (titre, nature) => (titre === 'COORD' ? 1400 : titre === 'MFP' ? 750 : nature === 'TP' ? 750 : 480);
const etpLigne = (l, unite, mode = 'reel') => {
  if (!l.helb) return (l.periodes || 0) / (l.type === 'PP' ? 1000 : 800);
  // En convention (3.5.499) : un maître-assistant comme un CT (÷ 800), tout autre comme un PP (÷ 1 000), en périodes.
  if (mode === 'convention') return (unite === 'heures' ? (l.periodes || 0) * 60 / 50 : (l.periodes || 0)) / (String(l.titre_helb || '').toUpperCase() === 'MA' ? 800 : 1000);
  const h = unite === 'heures' ? (l.periodes || 0) : (l.heures || 0);
  return h / divHelb(l.titre_helb, l.nature_helb);
};
function attributions(section, annee, unite = 'periodes', mode = 'reel') {
  return db.prepare(`
    SELECT COALESCE(v.bloc, '—') AS bloc, COALESCE(v.contrat_mdp, 'IIP') AS contrat,
      CASE WHEN UPPER(COALESCE(v.type_cours, 'CT')) = 'PP' THEN 'PP' ELSE 'CT' END AS type,
      COALESCE(NULLIF(v.coordination_encadrement, ''), 'Cours') AS nature, v.cours_ept_ad AS ept,
      v.professeur_id, v.professeur,
      COALESCE(NULLIF(v.type_cours_helb, ''), NULLIF(p.statut_helb, ''), '') AS titre_helb,
      CASE WHEN v.helb_nature = 'TP' THEN 'TP' ELSE 'TH' END AS nature_helb,
      CASE WHEN v.statut_mdp = 'EXP' THEN 'EXP' WHEN v.statut_mdp = 'CC' THEN 'CC' ELSE 'AUTRE' END AS statut,
      SUM(v.total_attribue_professeur) AS periodes, SUM(v.charge_en_heures) AS heures
    FROM v_attribution_complete v LEFT JOIN professeur p ON p.id = v.professeur_id
    WHERE v.annee_scolaire = ? AND v.section = ? AND COALESCE(v.en_conge, 0) = 0
    GROUP BY 1,2,3,4,5,6,7,8,9,10`).all(annee, section)
    .map(l => ({ ...l, helb: l.contrat === 'HELB' })).map(l => ({ ...l, etp: etpLigne(l, unite, mode) }));
}

/* LE CALCUL DES COÛTS GARDÉ DIX MINUTES (3.5.432, Charles : « le rapport est lent à produire ») : donneesCout prend plusieurs secondes
   par année ; quatre années, et chaque réglage, le relançaient. */
/* LA MÉMOIRE SUIT LES DONNÉES (3.5.440, Charles : « tout est encodé pourtant » — la page montrait les fonctions d'avant son encodage).
   Une empreinte bon marché des fonctions, des attributions et des inscriptions de l'année : si elle change, on recalcule. */
const MEMO_COUT = new Map();
function empreinte(a) {
  try {
    const f = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(COALESCE(etp, 0) * 1000 + COALESCE(etp_helb, 0) * 7 + professeur_id), 0) s
      FROM personnel_mission WHERE annee_scolaire = ?`).get(a);
    const t = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(COALESCE(periodes_attribuees, 0) + COALESCE(autonomie_attribuee, 0) * 3 + COALESCE(professeur_id, 0)), 0) s,
      MAX(COALESCE(updated_at, created_at)) m FROM attribution WHERE annee_scolaire = ?`).get(a);
    const i = db.prepare('SELECT COUNT(*) n FROM etudiant_inscription WHERE annee_scolaire = ?').get(a);
    return `${f.n}|${f.s}|${t.n}|${t.s}|${t.m}|${i.n}`;
  } catch { return String(Date.now()); }
}
export function viderMemoCout() { MEMO_COUT.clear(); }
export function coutMemo(a) {
  const m = MEMO_COUT.get(a), e = empreinte(a);
  if (m && m.e === e && Date.now() - m.t < 600e3) return m.d;
  const d = donneesCout(a);
  MEMO_COUT.set(a, { t: Date.now(), d, e });
  return d;
}

/** Une année : périodes, ETP, coûts, inscrits, fonctions. */
function annee(section, a, unite = 'periodes', mode = 'reel') {
  const L = attributions(section, a, unite, mode);
  const som = (f, filtre = () => true) => L.filter(filtre).reduce((t, l) => t + f(l), 0);
  let d = null;
  try { d = coutMemo(a); } catch (e) { console.error('[iip-helb] coût', a, e.message); }
  const S = d?.sections.find(x => x.section === section) || null;
  const missions = d?.missions || [];
  const pncc = missions.filter(m => m.pncc);
  const coutPncc = pncc.reduce((t, m) => t + (m.cout || 0), 0);
  const inscrits = S?.inscrits || 0;
  const base = d?.base_inscrits || 0;
  /* LA PART DU CADRE ADMINISTRATIF SUIT LES PÉRIODES (3.5.493, Charles : « pour chez nous c'est simple, on sait faire un rapport en
     périodes ÷ périodes totales de l'IIP » ; « secrétariat (base) + postes de direction que je pourrais enlever » ; « on ne compte pas
     direction ni RH côté HE, et le secrétariat étudiant est 100 % chez nous : une charge pure IIP »). Part = périodes de la section ÷
     toutes les périodes de l'école (attributions hors congés, IIP et HELB) ; le secrétariat toujours, la direction au choix (`direction`
     des mesures) ; aucune part de la HELB. */
  const perEcole = db.prepare(`SELECT COALESCE(SUM(total_attribue_professeur), 0) p FROM v_attribution_complete
    WHERE annee_scolaire = ? AND COALESCE(en_conge, 0) = 0`).get(a)?.p || 0;
  const perSection = L.reduce((t, l) => t + (l.periodes || 0), 0);
  const ratioPer = perEcole ? perSection / perEcole : 0;
  const estDirection = m => /direct/i.test(String(m.fonction || ''));
  const coutDir = pncc.filter(estDirection).reduce((t, m) => t + (m.cout || 0), 0), coutSecr = coutPncc - coutDir;
  const etpDir = pncc.filter(estDirection).reduce((t, m) => t + (Number(m.etp) || 0), 0), etpSecr = pncc.reduce((t, m) => t + (Number(m.etp) || 0), 0) - etpDir;
  const partAdmin = coutPncc * ratioPer;
  /* LES COORDINATIONS COMPTENT (3.5.429, Charles : « on doit compter les coordinations ») : chaque fonction de coordination de la
     section, part IIP et part HELB, en ETP × 800 × la période CT du niveau de la section — même quand la personne a des périodes de
     cours. Seule exception : sa coordination figure déjà en lignes d'attribution (codes CO…) — elle est alors dans la charge. */
  const tCT = tarifs()[niveauDeSection(section)]?.CT || 0, tPP = tarifs()[niveauDeSection(section)]?.PP || 0;
  /* LA HELB EN CONVENTION (3.5.499, Charles : « si convention, on compte MA = CC = CT et MFP = CC = PP, et donc tout en périodes ; si pas
     conventions, on convertit tout en argent »). En convention, une ligne HELB d'un maître-assistant se compte comme un CT (÷ 800, prix CT
     de la circulaire), toute autre comme un PP (÷ 1 000, prix PP) ; ses périodes sont celles de la ligne (lignes saisies en heures : × 60/50).
     Les coordinations HELB suivent le titre de leur personne. En coûts réels, la règle des heures de la HELB (`divHelb`) et le COR. */
  const perConv = l => (unite === 'heures' ? (l.periodes || 0) * 60 / 50 : (l.periodes || 0));
  const estMA = t => String(t || '').toUpperCase() === 'MA';
  // Les codes de coordination de Lucie (COCUR, COSTA, COTFE, COSEC…) — en capitales : « Cours » n'en est pas un (3.5.432).
  const coordEnAttribution = new Set(L.filter(l => /^CO[A-Z]{2,4}$/.test(String(l.nature || ''))).map(l => l.professeur_id));
  /* LE TITRE D'UNE COORDINATION HELB (3.5.495, Charles : « le 0,6 de Moiny en HELB est MA aussi ») : celui de la fiche (statut HELB),
     à défaut le titre qui porte le plus d'heures parmi ses lignes HELB de l'année ; sans rien, MFP. Le prix « au titre » le suit. */
  const titreCoord = (profId) => {
    const f = profId ? String(db.prepare('SELECT statut_helb s FROM professeur WHERE id = ?').get(profId)?.s || '').toUpperCase() : '';
    if (f === 'MA' || f === 'MFP') return f;
    const h = {}; for (const l of L) if (l.helb && l.professeur_id === profId && l.titre_helb) h[l.titre_helb] = (h[l.titre_helb] || 0) + (l.heures || l.periodes || 0);
    const meilleur = Object.entries(h).sort((x, y) => y[1] - x[1])[0]?.[0];
    return meilleur === 'MA' ? 'MA' : 'MFP';
  };
  const coord = missions.filter(m => !m.pncc && m.section_code === section).map(m => {
    const etpHelb = Number(m.etp_helb) || 0;
    const etpTot = Math.max(Number(m.etp) || 0, etpHelb);
    const etpIip = coordEnAttribution.has(m.professeur_id) ? 0 : Math.max(0, etpTot - etpHelb);
    return { fonction: m.fonction, personne: `${String(m.nom || '').toUpperCase()} ${m.prenom || ''}`.trim(),
      etp: etpTot, etp_helb: etpHelb, etp_iip: etpIip, deja: coordEnAttribution.has(m.professeur_id), titre_helb: etpHelb ? titreCoord(m.professeur_id) : null,
      cout_iip: etpIip * 800 * tCT, cout_helb: etpHelb * 800 * tCT,
      cout_helb_conv: etpHelb * (titreCoord(m.professeur_id) === 'MA' ? 800 * tCT : 1000 * tPP) };
  });
  /* CE QUE LA SECTION RAPPORTE (3.5.429, Charles : « le revenu par étudiant sur base des inscrits et de nos formules ») : le droit
     d'inscription et les frais, unité par unité, plus les forfaits — le calcul théorique de « Coûts des formations » (ni plafond, ni
     exonération). Une section dont un tiers perçoit les droits ne rapporte rien à l'IIP. */
  const recettes = S ? (S.droits_ues || []).reduce((t, u) => t + (u.droits?.recette || 0), 0) + (S.forfaits?.montant || 0) : 0;
  return {
    annee: a, lignes: L,
    per_iip: som(l => l.periodes, l => !l.helb), per_helb: som(l => l.periodes, l => l.helb),
    etp_iip: som(l => l.etp, l => !l.helb), etp_helb: som(l => l.etp, l => l.helb),
    etp_helb_ma: som(l => l.etp, l => l.helb && l.titre_helb === 'MA'), etp_helb_mfp: som(l => l.etp, l => l.helb && l.titre_helb !== 'MA'),
    etp_helb_480: som(l => l.etp, l => l.helb && divHelb(l.titre_helb, l.nature_helb) === 480),
    profs_iip: new Set(L.filter(l => !l.helb && l.professeur_id).map(l => l.professeur_id)).size,
    profs_helb: new Set(L.filter(l => l.helb && l.professeur_id).map(l => l.professeur_id)).size,
    cout_iip: S?.cout_iip || 0, cout_helb: S?.cout_helb || 0, inscrits,
    admin: { fonctions: pncc.map(m => ({ fonction: m.fonction, etp: Number(m.etp) || 0, cout: m.cout || 0, direction: estDirection(m) })), cout: coutPncc,
      part: partAdmin, part_secr: coutSecr * ratioPer, part_dir: coutDir * ratioPer, etp_secr: etpSecr * ratioPer, etp_dir: etpDir * ratioPer,
      ratio: ratioPer, per_section: perSection, per_ecole: perEcole, base },
    coord, recettes, tiers: S?.tiers || null,
    coord_helb: coord.reduce((t, c) => t + c.cout_helb, 0),
    coord_iip: coord.reduce((t, c) => t + c.cout_iip, 0),
    cetp_iip: coord.reduce((t, c) => t + c.etp_iip, 0),
    cetp_helb: coord.reduce((t, c) => t + c.etp_helb, 0),
    cetp_helb_ma: coord.filter(c => c.titre_helb === 'MA').reduce((t, c) => t + c.etp_helb, 0),
    // La HELB en convention (3.5.499) : MA = CT, le reste = PP.
    per_helb_conv: som(perConv, l => l.helb),
    etp_helb_conv: som(l => perConv(l) / (estMA(l.titre_helb) ? 800 : 1000), l => l.helb),
    cout_helb_conv: som(l => perConv(l) * (estMA(l.titre_helb) ? tCT : tPP), l => l.helb),
    cper_helb_conv: coord.reduce((t, c) => t + c.etp_helb * (estMA(c.titre_helb) ? 800 : 1000), 0),
    coord_helb_conv: coord.reduce((t, c) => t + c.etp_helb * (estMA(c.titre_helb) ? 800 * tCT : 1000 * tPP), 0),
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
  { cle: 'vrio', titre: 'Une section porteuse : la lecture VRIO' },
  { cle: 'charge', titre: 'La charge (ETP ou périodes)', graphe: 'empile' },
  { cle: 'equipe', titre: 'Les enseignants depuis la création', graphe: 'empile' },
  { cle: 'couts', titre: 'Les coûts, poste par poste', graphe: 'empile' },
  { cle: 'etudiant', titre: 'Le coût d’un étudiant, deux méthodes', graphe: 'empile' },
  { cle: 'recettes', titre: 'Ce que la section rapporte', graphe: 'cote' },
  { cle: 'helb', titre: 'Pour la HELB : ce que coûte et rapporte la section', graphe: 'cote' },
  { cle: 'comparaison', titre: 'Les cursus de la Haute École : étudiants par ETP' },
  { cle: 'blocs', titre: 'L’enseignement par bloc' },
  { cle: 'natures', titre: 'L’enseignement par nature' },
  { cle: 'fonctions', titre: 'Les coordinations et le cadre administratif' },
  { cle: 'enseignants', titre: 'Par enseignant' },
  { cle: 'methode', titre: 'Méthode' },
];
export const MESURES = {
  charge: [['etp', 'En ETP'], ['periodes', 'En périodes']],
  // Une seule bascule pour toute la section (3.5.499) : convention (tout en périodes, MA = CT, MFP = PP) ou coûts réels (HELB au COR).
  cout: [['convention', 'Convention (MA = CT, MFP = PP)'], ['reel', 'Coûts réels (HELB au COR)']],
  admin: [['oui', 'Avec le cadre administratif'], ['non', 'Sans le cadre administratif']],
  direction: [['oui', 'Avec la direction'], ['non', 'Sans la direction (secrétariat seul)']],
  coord: [['oui', 'Avec les coordinations'], ['non', 'Enseignement seul']],
  // 3.5.463 : l'unité des lignes HELB, et le prix d'un ETP de la HELB.
  unite_helb: [['periodes', 'Lignes HELB en périodes'], ['heures', 'Lignes HELB en heures']],
  prix_helb: [['titres', 'ETP HELB au titre (COR)'], ['moyenne', 'ETP HELB à la moyenne (COR)'], ['fixe', 'ETP HELB au montant réglé']],
};
/* LE PRIX D'UN ETP DE LA HELB (3.5.463, Charles : « plusieurs calculs : la moyenne HELB, et les titres réels ») : les montants du COR.
   Au titre : un maître-assistant au prix du MA, tout le reste (MFP, praticiens, coordinations) au prix du MFP. À la moyenne : rémunérations d'enseignement statutaires ÷ ETP statutaires. Fixe : le montant réglé (cmbp). */
export function prixHelb(cor = null) {
  let c = cor;
  if (!c) { try { c = sourcesEnVigueur().helb_cor?.totaux || {}; } catch { c = {}; } }
  const moyen = c.enseignement_statutaire && c.etp_enseignants ? c.enseignement_statutaire / c.etp_enseignants : null;
  return { ma: c.prix_ma || COR_HELB.prix_ma, mfp: c.prix_mfp || COR_HELB.prix_mfp, moyen: Math.round(moyen || COR_HELB.prix_moyen) };
}
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
export const PARAM_HELB = { part: 50, muce: 3837.18, ponderation: 1.5, cmbp: 90000, autres: 0, fonctionnement: 20.8, moyenne: 17, debut: 2026, lissage: 3 };
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
  const p95 = Number(String(h?.part95 ?? '').replace(',', '.'));
  o.part95 = h?.part95 !== undefined && h?.part95 !== '' && Number.isFinite(p95) && p95 >= 0 ? p95 : null;
  for (const k of Object.keys(PARAM_HELB)) { const v = Number(String(h?.[k] ?? '').replace(',', '.')); if (h?.[k] !== undefined && h?.[k] !== '' && Number.isFinite(v) && v >= 0) o[k] = v; }
  return o;
}
/* L'APPORT DE L'IIP : LE CADRE ADMINISTRATIF (3.5.437, Charles : « la quote-part du personnel administratif, 100 % IIP — direction,
   etc. — % de la section dans l'IIP » ; tranché : une contribution de l'IIP, la structure de 2026-2027 reprise pour les années sans
   fonctions encodées). Le coût de la direction et du secrétariat de l'IIP × la part de la section dans ses inscrits. La HELB n'en paie
   rien : d'où les « autres services » de la HELB à 0 % par défaut (le taux de Vinci, 37,2 %, répartit SES services centraux). */
export function adminReference(section, toutes) {
  for (const a of [...toutes].sort().reverse()) {
    try {
      const d = coutMemo(a);
      const cout = (d.missions || []).filter(m => m.pncc).reduce((t, m) => t + (m.cout || 0), 0);
      const ins = d.sections.find(x => x.section === section)?.inscrits || 0;
      if (cout > 0 && d.base_inscrits) return { annee: a, cout, ratio: ins / d.base_inscrits };
    } catch { /* année sans calcul */ }
  }
  return null;
}
/* L'AIDE À LA RÉUSSITE (UE 95), AUSSI 100 % IIP (3.5.438, Charles : « aide à la réussite aussi (UE 95) »). Ses périodes attribuées de
   l'année × la période CT du supérieur ; la part de la section se règle (`part95`, en %), à défaut celle de la section dans les inscrits
   de l'IIP — les inscriptions à l'UE 95 ne disent pas la section de la plupart des étudiants. */
export function aideReussite(annee) {
  const per = db.prepare(`SELECT COALESCE(SUM(COALESCE(periodes_attribuees, 0) + COALESCE(autonomie_attribuee, 0)), 0) p FROM attribution
    WHERE ue_num = 95 AND annee_scolaire = ? AND COALESCE(en_conge, 0) = 0`).get(annee)?.p || 0;
  const t = tarifs().SUP?.CT || 0;
  return { periodes: per, cout: per * t };
}

/** L'apport administratif de l'IIP pour une année : le sien s'il est encodé, sinon la structure de référence. */
export function apportAdmin(y, ref) {
  if (y.admin?.part) return { montant: y.admin.part, reprise: !!y.admin.reprise };
  return ref ? { montant: ref.cout * ref.ratio, reprise: true } : { montant: 0, reprise: false };
}

/* LES CURSUS DE LA HAUTE ÉCOLE, POUR COMPARER (3.5.439, Charles : « pour tes calculs et comparaisons avec la Santé et tous les
   départements de la HE »). Les chiffres de la HELB elle-même : Chiffres_Santé.xlsx et « Evolution COMAV + étudiants » (étudiants
   comptés et ETP enseignants par cursus, 2022-2023 à 2025-2026), tableau Cor_HE_AE (2025-2026, Technoeco, Social, IIP). Des
   données de référence, jamais recalculées : la source est écrite sur la pièce. */
/* LES PROPORTIONS RÉELLES DE LA HELB (3.5.449, Charles, 14 novembre 2026 : « je veux juste utiliser les proportions pour nous assurer
   que nous comparons les bonnes choses »). Tirées du COR de la HELB (cadre organique réel, septembre 2026, version « total ») et de ses
   attributions 2026-2027 — des TOTAUX seulement : aucune donnée de personne n'est gardée. Elles disent ce que coûte vraiment un ETP
   d'enseignant, et ce que pèse l'encadrement (direction, administration) au-dessus de l'enseignement. */
/* LES RATIOS PAR DÉPARTEMENT DE LA HELB (3.5.465, Charles : « un autre document de la HE » — « ratio par département ») : étudiants
   finançables ÷ ETP, 2022-2023 à 2025-2026. Ils font foi pour les départements ; les cursus restent ceux de la comparaison ETP.
   Le dépôt d'un fichier du même modèle dans Les sources les remplace. */
export const DEPARTEMENTS_HE = {
  source: 'HELB : ratio par département (étudiants finançables et ETP)',
  departements: {
    Social: { '2022-2023': [424.5, 24.42], '2023-2024': [387.5, 26.35], '2024-2025': [368, 21.85], '2025-2026': [294.5, 22.03] },
    Technoeco: { '2022-2023': [214.5, 11.3], '2023-2024': [212.2, 11], '2024-2025': [210, 12.45], '2025-2026': [202.79, 13.15] },
    COMAV: { '2022-2023': [594.5, 35.12], '2023-2024': [600.5, 37.66], '2024-2025': [602.5, 43.25], '2025-2026': [578.5, 38.43] },
    'Santé': { '2022-2023': [1660.6, 95.74], '2023-2024': [1593.08, 97.91], '2024-2025': [1585.5, 95.13], '2025-2026': [1664.1, 95.44] },
  },
};
/** Les départements en vigueur : le fichier déposé, à défaut celui repris le 15 novembre 2026. { dept: { année: [étudiants, ETP] } } */
export function departementsHe() {
  try {
    const t = sourcesEnVigueur().helb_ratios?.totaux;
    if (t?.departements) return { source: 'HELB : ratio par département (fichier déposé)', departements: Object.fromEntries(Object.entries(t.departements)
      .map(([d, o]) => [d, Object.fromEntries(Object.entries(o).map(([a, v]) => [a, [v.etudiants, v.etp]]))])) };
  } catch { /* les sources ne se lisent pas : le repli */ }
  return DEPARTEMENTS_HE;
}
/** Étudiants par ETP de toute la HELB, une année : la somme des départements. */
export function ratioHelb(annee, D = departementsHe()) {
  let e = 0, p = 0;
  for (const o of Object.values(D.departements)) { const v = o[annee]; if (v) { e += v[0]; p += v[1]; } }
  return p ? e / p : null;
}
export const COR_HELB = {
  source: 'HELB : COR septembre 2026 (total) et attributions 2026-2027 — totaux',
  total: 18682190.77,            // rémunérations du COR, sans le personnel de recherche
  allocation: 18650000,
  enseignement: 12217316.27 + 1800490,   // maîtres-assistants, MFP (statutaires) + professeurs invités
  encadrement: 453420 + 113355 + 113355 + 1925089.5 + 2059165,   // direction, personnel administratif statutaire et contractuel
  etp_enseignants: 143.39,       // statutaires
  fonctions_sur_enseignement: 0.182,   // coordinations, stages, TFE… ÷ enseignement, dans les cursus (attributions 2026-2027)
  etp_cursus: 140.22 + 25.54,    // enseignement + fonctions des cursus (attributions 2026-2027, dixièmes ÷ 10)
  heures_enseignement: 89417,    // heures données dans les cursus (attributions 2026-2027, hors fonctions)
  inscrits: 3093,                // dossiers inscrits 2026-2027 au 2 novembre 2026, tous cursus (hors TIM, inscrit à l'IIP)
  inscrits_le: '2 novembre 2026',
  debutants: 1701,               // cohorte START (débutants) des mêmes dossiers, au 2 novembre 2026
  prix_ma: 88981,                // COR : maître-assistant TC, coût d'un ETP
  prix_mfp: 78037,               // COR : maître de formation pratique, coût d'un ETP
  prix_moyen: 85203,             // COR : enseignement statutaire ÷ ETP statutaires (12 217 316 € ÷ 143,39)
};

export const COMPARAISON_HE = {
  source: 'HELB : Chiffres_Santé.xlsx, Evolution COMAV + étudiants (3 avril 2026), Cor_HE_AE (2025-2026)',
  annee: '2025-2026',
  cursus: [
    ['Santé', 'Technologue en imagerie médicale', 155.5, 3.21, { '2023-2024': [58.5, 0.8], '2024-2025': [95, 1.97], '2025-2026': [155.5, 3.21] }, true],
    ['Santé', 'Kinésithérapie', 488, 19.89, { '2022-2023': [625, 21.35], '2023-2024': [538, 22.05], '2024-2025': [499, 20.76], '2025-2026': [488, 19.89] }],
    ['Santé', 'Hygiéniste bucco-dentaire', 251, 9, { '2022-2023': [139, 8.16], '2023-2024': [166, 7.82], '2024-2025': [188, 7.82], '2025-2026': [251, 9] }],
    ['Santé', 'Orthoptie', 44.88, 1.64, { '2022-2023': [39.6, 2.46], '2023-2024': [37.5, 1.95], '2024-2025': [42.25, 2], '2025-2026': [44.88, 1.64] }],
    ['Santé', 'Sage-femme', 197, 13.95, { '2022-2023': [195, 14.61], '2023-2024': [186, 14.42], '2024-2025': [187.5, 15.37], '2025-2026': [197, 13.95] }],
    ['Santé', 'Soins infirmiers', 261, 20.2, { '2022-2023': [369, 21.19], '2023-2024': [316, 21.23], '2024-2025': [292, 20.83], '2025-2026': [261, 20.2] }],
    ['Santé', 'AEJE', 26.25, 1.87, { '2023-2024': [8.5, 0.54], '2024-2025': [18.25, 1.45], '2025-2026': [26.25, 1.87] }],
    ['Santé', 'Ergothérapie (CEB)', 58.25, 4.33, { '2022-2023': [116, 6.86], '2023-2024': [87.5, 5.6], '2024-2025': [60.5, 5.09], '2025-2026': [58.25, 4.33] }],
    ['Santé', 'Podologie', 58, 6.74, { '2022-2023': [59, 6.98], '2023-2024': [64, 7.15], '2024-2025': [56, 6.65], '2025-2026': [58, 6.74] }],
    ['Santé', 'SIAMU', 54, 5.45, { '2022-2023': [51, 5.47], '2023-2024': [58.5, 4.85], '2024-2025': [60, 4.68], '2025-2026': [54, 5.45] }],
    ['Santé', 'MSI', 17.22, 0.69, { '2022-2023': [10.5, 0.59], '2023-2024': [13.58, 0.78], '2024-2025': [19, 0.89], '2025-2026': [17.22, 0.69] }],
    ['Santé', 'Art-thérapie', 26, 1.92, { '2022-2023': [22, 1.56], '2023-2024': [30, 1.78], '2024-2025': [38, 1.98], '2025-2026': [26, 1.92] }],
    ['Santé', 'Oncologie', 15, 1.74, { '2022-2023': [10, 1.63], '2023-2024': [10, 1.61], '2024-2025': [16, 1.64], '2025-2026': [15, 1.74] }],
    ['Santé', 'Santé communautaire', 7, 1.43, { '2022-2023': [8, 1.87], '2023-2024': [9, 1.96], '2024-2025': [2, 0.91], '2025-2026': [7, 1.43] }],
    ['Santé', 'Pédiatrie', 5, 2.5, { '2022-2023': [16.5, 2.51], '2023-2024': [10, 2.59], '2024-2025': [12, 2.59], '2025-2026': [5, 2.5] }],
    ['COMAV', 'Cinéma', 489, 27.7, { '2022-2023': [490, 23.11], '2023-2024': [492, 25.9], '2024-2025': [513, 29.23], '2025-2026': [489, 27.7] }],
    ['COMAV', 'Relations publiques', 69, 4.89, { '2022-2023': [82, 6.69], '2023-2024': [86, 6.29], '2024-2025': [73, 7.02], '2025-2026': [69, 4.89] }],
    ['COMAV', 'Photographie', 64, 5.45, { '2022-2023': [60, 4.9], '2023-2024': [52, 5.12], '2024-2025': [50, 6.62], '2025-2026': [64, 5.49] }],
    ['Technoeco', 'Cybersécurité', 16, 0.41, {}],
    ['Technoeco', 'Informatique de gestion', 154, 7.55, {}],
    ['Technoeco', 'Électronique appliquée', 25.75, 2.46, {}],
    ['Technoeco', 'Facility management', 25, 2.71, {}],
    ['Social', 'Assistant social', 306, 15.54, {}],
    ['Social', 'Écologie sociale', 32, 5.12, {}],
  ].map(([dept, cursus, etu, etp, series, tim]) => ({ dept, cursus, etu, etp, ratio: etp ? etu / etp : null, series, tim: !!tim })),
  moyennes: { 'Moyenne HELB': 17.2, 'Santé': 17.8, 'Bacheliers et masters santé': 19.4 },
  /* LES SECTIONS DE L'IIP, MESURÉES PAR LA HELB ELLE-MÊME (3.5.442, Charles : « comparer les départements et placer TIM, et l'IIP ; TIM
     face à l'IIP »). Tableau Cor_HE_AE, feuille Données_ASBL, 2025-2026 : étudiants comptés et ETP — même méthode que ses cursus. */
  iip: [
    ['Imagerie médicale (part IIP)', 126.9, 2.9, true],
    ['Optométrie (hors orthoptie)', 88, 1.74],
    ['Psychomotricité', 106, 2.58],
    ['Orthoptie (tronc commun)', 33, 1.53],
    ['Formation continue et optique', 137, 3.3],
  ].map(([cursus, etu, etp, tim]) => ({ dept: 'IIP', cursus, etu, etp, ratio: etu / etp, series: { '2025-2026': [etu, etp] }, tim: !!tim })),
  couleurs: { 'Santé': '#5DADE2', 'COMAV': '#9F7AEA', 'Technoeco': '#1F2937', 'Social': '#DC2626', 'IIP': '#F9B619' },
  admin: { 'Santé': { '2022-2023': 16.25, '2023-2024': 16.25, '2024-2025': 16.3, '2025-2026': 16.3 } },
};

/** L'année « 2024-2025 » décalée de k ans. */
export const anneeDecalee = (a, k) => `${Number(a.slice(0, 4)) - k}-${Number(a.slice(5, 9)) - k}`;
export function salairesHelb(y, P, avecCoord = true) {
  if (y.salaires_imposes != null) return y.salaires_imposes;   // la mesure choisie fait foi (3.5.496)
  const c = avecCoord ? (y.cetp_helb || 0) : 0, etp = (y.ens_helb || 0) + c;
  if (P.prix === 'moyenne' && P.prix_moyen) return etp * P.prix_moyen;
  if (P.prix === 'titres' && P.prix_ma) {
    // Au titre : un maître-assistant au prix du MA (cours et coordinations) ; tout le reste au prix du MFP.
    const cma = avecCoord ? Math.min(c, y.cetp_helb_ma || 0) : 0;
    const ma = (y.etp_helb_ma || 0) + cma, autres = Math.max(0, (y.ens_helb || 0) - (y.etp_helb_ma || 0)) + (c - cma);
    return ma * P.prix_ma + autres * (P.prix_mfp || P.prix_ma);
  }
  return etp * P.cmbp;
}
/* LE LISSAGE DU DÉCRET (3.5.470 ; décret du 9 septembre 1996 relatif au financement des Hautes Écoles, art. 17 al. 2 : « le nombre
   d'étudiants […] des trois dernières années précédant l'année budgétaire […] divisé par trois » ; l'année budgétaire est l'année
   civile ; Charles : « lissage selon le décret »). Les étudiants comptés d'une année budgétaire C = la moyenne de ceux des années
   académiques (C−4)-(C−3), (C−3)-(C−2), (C−2)-(C−1). Aucune année n'est perdue : chacune est payée trois fois un tiers, avec retard.
   Une année académique Y-(Y+1) reçoit 4/12 de l'allocation de l'année civile Y et 8/12 de celle de Y+1. Le nombre d'années de
   lissage reste réglable (3 au décret) ; il n'y a plus de « début de l'allocation ». */
export function baseDecret(deb, P, inscritsDe) {
  const n = Math.max(1, Math.round(P.lissage || 3));
  const civile = C => { let s = 0; for (let k = 2; k < 2 + n; k++) s += (inscritsDe(`${C - k}-${C - k + 1}`) || 0) * P.part / 100; return s / n; };
  return civile(deb) * 4 / 12 + civile(deb + 1) * 8 / 12;
}
export function helbAnnee(y, P, avecCoord = true, inscritsDe = () => 0, materiel = null) {
  const comptes = y.inscrits * P.part / 100;
  const deb = Number(String(y.annee).slice(0, 4));
  const base = baseDecret(deb, P, inscritsDe);
  const allocation = base * P.muce * P.ponderation;
  const droits = y.tiers ? 0 : (y.recettes || 0);
  const recettes = allocation + droits;
  const etp = y.ens_helb + (avecCoord ? y.cetp_helb : 0);
  const salaires = salairesHelb(y, P, avecCoord);
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
  // Les anciens réglages (3.5.496) : « titres » = coûts réels, « cmb » = convention.
  const ancien = { titres: 'reel', cmb: 'convention' };
  for (const [k, opts] of Object.entries(MESURES)) { const v = k === 'cout' ? (ancien[c.mesures?.[k]] || c.mesures?.[k]) : c.mesures?.[k]; mesures[k] = opts.some(([o]) => o === v) ? v : opts[0][0]; }
  // LES INSCRITS RETENUS (3.5.434, Charles : « en 23-24 il y avait 117 étudiants ») : les années reprises d'Excel n'ont pas tous leurs
  // dossiers dans Lucie ; la direction pose le chiffre réel, année par année, et la pièce le dit.
  const inscrits = {};
  for (const [a, v] of Object.entries(c.inscrits || {})) { const n = Number(v); if (/^\d{4}-\d{4}$/.test(a) && Number.isFinite(n) && n > 0) inscrits[a] = Math.round(n); }
  const materiel = {};
  for (const [a, v] of Object.entries(c.materiel || {})) { const n = Number(v); if (/^\d{4}-\d{4}$/.test(a) && v !== '' && Number.isFinite(n) && n >= 0) materiel[a] = n; }
  // Le commentaire de la direction, critère par critère (VRIO) : du texte, coupé à 1 500 caractères.
  const vrio = {};
  for (const k of ['V', 'R', 'I', 'O']) if (typeof c.vrio?.[k] === 'string' && c.vrio[k].trim()) vrio[k] = c.vrio[k].slice(0, 1500);
  return { ordre, masques, graphes, mesures, saut: c.saut !== false, helb: paramHelb(c.helb), inscrits, materiel, vrio };
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
  const taux = getParamNum(`cout.cmb_${niv.toLowerCase()}`, 0);   // la colonne de comparaison au coût moyen brut
  const reel = R.mesures.cout === 'reel';
  const Y = annees.map(a => annee(section, a, R.mesures.unite_helb, R.mesures.cout));
  const refAdmin = adminReference(section, toutes);
  for (const y of Y) {
    // Le cadre administratif d'une année sans fonctions encodées : la structure de référence (3.5.437).
    if (!(y.admin.cout > 0) && refAdmin) y.admin = { ...y.admin, part: refAdmin.cout * refAdmin.ratio, reprise: refAdmin.annee };
    else if (R.mesures.direction === 'non') y.admin = { ...y.admin, part: y.admin.part_secr || 0 };
    y.ue95 = aideReussite(y.annee);
    // Les droits et frais suivent les inscrits retenus : le montant moyen par étudiant de Lucie × le nombre retenu.
    if (R.inscrits[y.annee]) { y.inscrits_lucie = y.inscrits; y.inscrits = R.inscrits[y.annee]; if (y.inscrits_lucie) y.recettes = y.recettes * y.inscrits / y.inscrits_lucie; }
    y.ens_iip = y.etp_iip; y.ens_helb = y.etp_helb;   // déjà selon la lecture choisie (attributions)
    if (!avecCoord) { y.cetp_iip = 0; y.cetp_helb = 0; y.coord_iip = 0; y.coord_helb = 0; y.cper_helb_conv = 0; y.coord_helb_conv = 0; }
    y.etp_iip = y.ens_iip + y.cetp_iip; y.etp_helb = y.ens_helb + y.cetp_helb;
    y.etp = y.etp_iip + y.etp_helb;
    y.pc_iip = y.per_iip + y.cetp_iip * 800;   // périodes, coordinations à 800 par ETP
    y.pc_helb = reel ? y.per_helb + y.cetp_helb * 800 : y.per_helb_conv + y.cper_helb_conv;
    y.per = y.per_iip + y.per_helb;
    const adm = avecAdmin ? y.admin.part : 0;
    // L'IIP au prix de la circulaire des conventions, dans les deux lectures (3.5.499 : c'est ce que coûte sa dotation).
    y.c_iip = y.cout_iip + y.coord_iip + adm;
    // Un seul calcul pour la HELB (3.5.496) : la même mesure pour son coût et pour les salaires de son résultat.
    const Hp = { ...R.helb, ...Object.fromEntries(Object.entries(prixHelb(p.cor)).map(([k, v]) => [`prix_${k}`, v])), prix: R.mesures.prix_helb };
    y.c_helb = reel
      ? salairesHelb({ ens_helb: y.ens_helb, cetp_helb: y.cetp_helb, etp_helb_ma: y.etp_helb_ma, cetp_helb_ma: y.cetp_helb_ma }, Hp, avecCoord)
      : y.cout_helb_conv + y.coord_helb_conv;
    y.salaires_imposes = y.c_helb;
    // Le coût HELB en deux postes, selon la même lecture : les cours, puis les coordinations.
    y.cours_helb_m = reel ? salairesHelb({ ens_helb: y.ens_helb, cetp_helb: 0, etp_helb_ma: y.etp_helb_ma, cetp_helb_ma: 0 }, Hp, false) : y.cout_helb_conv;
    y.coord_helb_m = y.c_helb - y.cours_helb_m;
    y.tout_iip = y.cout_iip + y.coord_iip + adm; y.tout_helb = y.c_helb;
  }
  const methode = reel ? 'coûts réels : l’IIP au prix de la circulaire des conventions, la HELB au COR (MA / MFP, heures ÷ 480 / 750)' : 'convention : tout en périodes, les MA de la HELB comme CT, les MFP comme PP, au prix de la circulaire';
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

  /* LES ENSEIGNANTS DEPUIS LA CRÉATION (3.5.479) : toutes les années de la section, quelle que soit la sélection. */
  P.equipe = () => {
    const E = evolutionAttributions(section, R.mesures.unite_helb, R.mesures.cout);
    if (!E.annees.length) return '';
    const st = (y, k, c) => y.statuts[k]?.[c] || 0;
    const ligne = (lib, f, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><td>${lib}</td>${E.annees.map(y => `<td class="n">${f(y)}</td>`).join('')}</tr>`;
    const e0 = E.annees[0], eN = E.annees[E.annees.length - 1];
    const partExp = y => { const t = y.etp_iip + y.etp_helb; return pc(st(y, 'EXP', 'etp_iip') + st(y, 'EXP', 'etp_helb'), t); };
    const nm = E.nomination;
    return `<h2>Les enseignants depuis la création (${esc(E.premiere)})</h2>
    ${graphe(R.graphes.equipe, E.annees, y => y.personnes_iip, y => y.personnes_helb, n0, 'Le nombre d’enseignants, par école')}
    <table class="annees"><thead><tr><th></th>${E.annees.map(y => `<th class="n">${esc(court(y.annee))}</th>`).join('')}</tr></thead><tbody>
      ${ligne('<b>Enseignants (personnes)</b>', y => `<b>${n0(y.personnes)}</b>`, 'repere')}
      ${ligne('— à l’IIP', y => n0(y.personnes_iip))}
      ${ligne('— à la HELB', y => n0(y.personnes_helb))}
      ${ligne('Arrivées dans la section', y => (y === e0 ? '—' : n0(y.arrivees)))}
      ${ligne('Départs de la section', y => (y === e0 ? '—' : n0(y.departs)))}
      ${ligne('<b>Chargés de cours</b> (IIP · HELB)', y => `${n0(st(y, 'CC', 'iip'))} · ${n0(st(y, 'CC', 'helb'))}`, 'repere')}
      ${ligne('— en ETP', y => `${n2(st(y, 'CC', 'etp_iip'))} · ${n2(st(y, 'CC', 'etp_helb'))}`)}
      ${ligne('<b>Experts et invités</b> (IIP · HELB)', y => `${n0(st(y, 'EXP', 'iip'))} · ${n0(st(y, 'EXP', 'helb'))}`, 'repere')}
      ${ligne('— en ETP', y => `${n2(st(y, 'EXP', 'etp_iip'))} · ${n2(st(y, 'EXP', 'etp_helb'))}`)}
      ${ligne('Part des experts dans la charge', partExp)}
      ${ligne('<b>Charge</b> (périodes)', y => `<b>${n0(y.per_iip + y.per_helb)}</b>`, 'repere')}
      ${ligne('— ETP IIP · HELB', y => `${n2(y.etp_iip)} · ${n2(y.etp_helb)}`)}
      ${ligne('— part de la HELB', y => pc(y.etp_helb, y.etp_iip + y.etp_helb))}
      ${E.annees.some(y => y.a_designer) ? ligne('— périodes encore à désigner', y => (y.a_designer ? n0(y.a_designer) : '—')) : ''}
    </tbody></table>
    <div class="en-bref"><h3>En bref</h3><ul>${[
      E.annees.length > 1 ? `De ${esc(e0.annee)} à ${esc(eN.annee)}, la section passe de <b>${n0(e0.personnes)}</b> à <b>${n0(eN.personnes)}</b> enseignants
        et de <b>${n2(e0.etp_iip + e0.etp_helb)}</b> à <b>${n2(eN.etp_iip + eN.etp_helb)}</b> ETP d’enseignement.` : '',
      `En ${esc(eN.annee)} : ${n0(eN.personnes_iip)} enseignant(s) à l’IIP, ${n0(eN.personnes_helb)} à la HELB ; la HELB porte ${pc(eN.etp_helb, eN.etp_iip + eN.etp_helb)} de la charge,
        les experts et invités ${partExp(eN)}.`,
      E.annees.length > 1 ? `En ${esc(eN.annee)}, ${n0(eN.arrivees)} arrivée(s) et ${n0(eN.departs)} départ(s) par rapport à ${esc(E.annees[E.annees.length - 2].annee)}.` : '',
      nm ? `Statut de nomination des enseignants IIP de ${esc(nm.annee)} (la fiche, au présent) : ${n0(nm.definitif)} définitif(s), ${n0(nm.temporaire_prioritaire)} temporaire(s) prioritaire(s), ${n0(nm.temporaire)} temporaire(s).` : '',
    ].filter(Boolean).map(x => `<li>${x}</li>`).join('')}</ul></div>
    <p class="fin">Attributions de la section, hors congés ; coordinations non comprises (voir « Les coordinations »). Une personne qui enseigne
      pour les deux écoles compte une fois dans le total et une fois dans chaque école. Arrivée : jamais vue dans la section les années d’avant.
      Statut de chargé de cours ou d’expert : celui de la fiche. Le statut de nomination n’a pas d’historique dans Lucie.</p>`;
  };

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
      ${Y.map(y => `<tr><td>${esc(y.annee)}</td><td class="n">${eur(y.cout_iip)}</td><td class="n">${eur(y.cours_helb_m)}</td>
        ${avecCoord ? `<td class="n">${y.coord.length ? eur(y.coord_iip) : '—'}</td><td class="n">${y.coord.length ? eur(y.coord_helb_m) : '—'}</td>` : ''}
        ${avecAdmin ? `<td class="n">${y.admin.part ? `${eur(y.admin.part)}${y.admin.reprise ? ' *' : ''}` : '—'}</td>` : ''}
        <td class="n g">${eur(y.tout_iip)}</td><td class="n g">${eur(y.tout_helb)}</td><td class="n">${pc(y.tout_helb, y.tout_iip + y.tout_helb)}</td></tr>`).join('')}
      <tr class="repere"><td>Ensemble</td><td class="n">${eur(Y.reduce((t, y) => t + y.cout_iip, 0))}</td><td class="n">${eur(Y.reduce((t, y) => t + y.cours_helb_m, 0))}</td>
        ${avecCoord ? `<td class="n">${eur(Y.reduce((t, y) => t + y.coord_iip, 0))}</td><td class="n">${eur(Y.reduce((t, y) => t + y.coord_helb_m, 0))}</td>` : ''}
        ${avecAdmin ? `<td class="n">${eur(Y.reduce((t, y) => t + y.admin.part, 0))}</td>` : ''}
        <td class="n">${eur(Y.reduce((t, y) => t + y.tout_iip, 0))}</td><td class="n">${eur(Y.reduce((t, y) => t + y.tout_helb, 0))}</td><td class="n"></td></tr></tbody></table>
    <p class="fin">Lecture : ${methode}. L'IIP : ses périodes au barème de la circulaire des conventions (CT, PP, cours spéciaux, par niveau),
      comme « Coûts des formations » ; ses coordinations : ETP × 800 × la période CT du niveau — sauf si elles figurent déjà dans les
      attributions. La HELB : ${reel ? `ses ETP (heures ÷ 480 pour la théorie d'un maître-assistant, ÷ 750 sinon ; coordinations comprises) au prix de leur titre au COR` : `un maître-assistant compté comme un CT (÷ 800, prix CT), tout autre comme un PP (÷ 1 000, prix PP) — cours et coordinations`}. Cadre administratif (direction, secrétariat) : partagé entre les sections au prorata des inscrits, porté par l'IIP.</p>`;

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

  // Le bilan HELB et ASBL, calculé une fois : la carte « helb » et la lecture VRIO le lisent.
  const H = { ...R.helb, ...Object.fromEntries(Object.entries(prixHelb(p.cor)).map(([k, v]) => [`prix_${k}`, v])), prix: R.mesures.prix_helb };
  const insc = {};
  for (const a of toutes) { try { insc[a] = coutMemo(a).sections.find(x => x.section === section)?.inscrits || 0; } catch { insc[a] = 0; } }
  for (const [a, n] of Object.entries(R.inscrits)) insc[a] = n;
  const ref = adminReference(section, toutes);
  const part95 = H.part95 != null ? H.part95 / 100 : (ref?.ratio || 0);
  const u95 = y => (y.ue95?.cout || 0) * part95;
  const L = Y.map(y => ({ y, h: helbAnnee(y, H, avecCoord, a => insc[a], R.materiel[y.annee]), adm: apportAdmin(y, ref) }));
  const totL = k => L.reduce((t, l) => t + l.h[k], 0);
  const apportIIP = L.reduce((t, l) => t + l.adm.montant + u95(l.y), 0);
  const C = COMPARAISON_HE.cursus.filter(c => c.ratio).sort((a, b) => b.ratio - a.ratio);
  const rangTim = C.findIndex(c => c.tim) + 1;
  const tim = C.find(c => c.tim);

  P.helb = () => {
    const tot = totL;
    const g = graphe(R.graphes.helb === 'parts' ? 'cote' : R.graphes.helb, L.map(l => ({ annee: l.y.annee, a: l.h.recettes, b: l.h.cout })), y => y.a, y => y.b,
      v => `${n0(v / 1000)} k€`, 'Pour la HELB et l’ASBL : ce que la section rapporte et ce qu’elle coûte')
      .replace('</i>IIP</span>', '</i>Ce qu’elle rapporte</span>').replace('</i>HELB</span>', '</i>Ce qu’elle coûte</span>')
      .replaceAll(`fill="${IIP}"`, 'fill="#3E7D5E"').replaceAll(`background:${IIP}`, 'background:#3E7D5E');
    return `<h2>Pour la HELB et l’ASBL : ce que coûte et rapporte la section</h2>
    ${g}
    <table class="annees"><thead><tr><th>Année</th><th class="n">Inscrits</th><th class="n">Comptés (lissés)</th><th class="n">Allocation</th><th class="n">Droits (ASBL)</th>
      <th class="n">ETP HELB</th><th class="n">Salaires</th><th class="n">Autres services</th><th class="n">${H.mode_fonct === 'forfait' ? 'Fonctionnement (forfait)' : 'Matériel et fonct.'}</th><th class="n">Coût</th>
      <th class="n">Résultat</th><th class="n">Étu. / ETP</th><th class="n">Apport IIP : admin.</th><th class="n">Apport IIP : aide réussite</th></tr></thead><tbody>
      ${L.map(({ y, h, adm }) => `<tr><td>${esc(y.annee)}</td><td class="n">${n0(y.inscrits)}</td><td class="n">${h.base ? n0(h.base) : '—'}</td>
        <td class="n">${h.allocation ? eur(h.allocation) : '0 €'}</td><td class="n">${eur(h.droits)}</td>
        <td class="n">${n2(h.etp)}</td><td class="n">${eur(h.salaires)}</td><td class="n">${eur(h.autres)}</td><td class="n">${eur(h.fonct)}</td><td class="n">${eur(h.cout)}</td>
        <td class="n g" style="color:${h.resultat >= 0 ? '#3E7D5E' : '#9D4A38'}">${h.resultat >= 0 ? '+' : '−'}${eur(Math.abs(h.resultat))}</td>
        <td class="n">${h.parEtp ? n0(h.parEtp) : '—'}</td><td class="n">${eur(adm.montant)}${adm.reprise ? ' *' : ''}</td><td class="n">${eur(u95(y))}</td></tr>`).join('')}
      <tr class="repere"><td>Ensemble</td><td class="n"></td><td class="n"></td><td class="n">${eur(tot('allocation'))}</td><td class="n">${eur(tot('droits'))}</td><td class="n"></td><td class="n">${eur(tot('salaires'))}</td>
        <td class="n">${eur(tot('autres'))}</td><td class="n">${eur(tot('fonct'))}</td><td class="n">${eur(tot('cout'))}</td>
        <td class="n g">${tot('resultat') >= 0 ? '+' : '−'}${eur(Math.abs(tot('resultat')))}</td><td class="n"></td><td class="n">${eur(L.reduce((t, l) => t + l.adm.montant, 0))}</td><td class="n">${eur(L.reduce((t, l) => t + u95(l.y), 0))}</td></tr></tbody></table>
    <p class="fin">Allocation (décret du 9 septembre 1996, art. 17) : pour chaque année civile, la moyenne des étudiants comptés
      (${n0(H.part)} % des inscrits) des ${n0(H.lissage)} années académiques précédentes ; une année académique reçoit 4/12 de l'année civile où elle commence et 8/12 de la suivante × ${n2(H.muce)} € (unité de charge d'enseignement) × ${n2(H.ponderation)}
      (pondération santé). Droits : les droits d'inscription et frais des étudiants de la section, au barème, versés à l'ASBL, qui alimentent
      les moyens de la Haute École. L'IIP, lui, a financé sa part sur ses propres dotations (périodes de la Fédération) : aucun coût supplémentaire, une optimisation des moyens existants. Coût : ${!reel ? `les enseignants HELB${avecCoord ? ' (enseignement et coordinations)' : ''} en convention — un maître-assistant comme un CT, tout autre comme un PP, au prix de la circulaire —, ` : `les ETP HELB${avecCoord ? ' (enseignement et coordinations)' : ''} × `}${!reel ? '' : H.prix === 'titres' ? `le coût de leur titre au COR (maître-assistant ${n0(H.prix_ma)} € par ETP, les autres au prix d'un maître de formation pratique, ${n0(H.prix_mfp)} € ; ETP comptés à 480 h pour la théorie d'un maître-assistant, 750 h pour le reste)` : H.prix === 'moyenne' ? `${n0(H.prix_moyen)} € (moyenne du COR de la HELB)` : `${n0(H.cmbp)} € (coût moyen brut pondéré)`}, plus ${n2(H.autres)} %
      pour les autres services, et ${H.mode_fonct === 'forfait' ? `${n2(H.fonctionnement)} % de l'allocation pour le fonctionnement (forfait)`
        : `le matériel et le fonctionnement de la section : ${L.map(({ y }) => `${esc(y.annee)} ${R.materiel[y.annee] != null ? 'posé par la direction' : esc(MATERIEL_HELB[y.annee]?.source || 'inconnu')}`).join(' ; ')}`}.
      Apport de l'IIP : le cadre administratif de l'école (direction, secrétariat), 100 % IIP, × la part de ${esc(section)} dans les inscrits de
      l'IIP${ref ? ` ; * structure de ${esc(ref.annee)} reprise (${eur(ref.cout)} × ${pc(ref.ratio, 1)})` : ''} — la HELB n'en paie rien, hors la gestion RH de ses propres contrats (« autres services », réglable).
      Aide à la réussite (UE 95), 100 % IIP : ses périodes de l'année × ${n2(tarifs().SUP?.CT || 0)} € × ${pc(part95, 1)} (part de ${esc(section)}).
      <b>Les ressources humaines de la HELB (ses contrats) sont mises de côté : leur coût n'est pas estimable.</b> Le secrétariat travaille à
      100 % pour les étudiants et la direction.
      Pour comparaison, l'orthoptie porte en 2023 des frais réels de matériel, de documentation, d'informatique et d'amortissements (comptabilité analytique). La HELB compte en moyenne ${n0(H.moyenne)} étudiants par ETP.
      Sources : présentation financière des départements (Vinci), courriel de F. Vanderoost du 27 août 2026, tableau Cor_HE_AE. </p>`;
  };

  P.comparaison = () => {
    const max = Math.max(...C.map(c => c.ratio));
    const ann = ['2022-2023', '2023-2024', '2024-2025', '2025-2026'];
    return `<h2>Les cursus de la Haute École : étudiants par ETP enseignant</h2>
    <div class="cadre"><h3>${esc(COMPARAISON_HE.annee)} — étudiants comptés par ETP enseignant, tous les cursus de la HELB</h3>
    <table class="barres">${C.map(c => `<tr><td class="barres-lib" style="width:52mm;${c.tim ? 'font-weight:700' : ''}">${esc(c.cursus)} <span class="fin">${esc(c.dept)}</span></td>
      <td class="barres-piste"><span class="barres-barre" style="width:${(c.ratio / max) * 100}%;background:${c.tim ? '#3E7D5E' : '#94A3B8'};opacity:.9"></span></td>
      <td class="barres-val"${c.tim ? ' style="font-weight:700;color:#3E7D5E"' : ''}>${n0(c.ratio)} · ${n2(c.etp)} ETP · ${n0(c.etu)} étu.</td></tr>`).join('')}</table>
    <p class="fin">Moyenne de la HELB : ${n1r(ratioHelb(COMPARAISON_HE.annee) || COMPARAISON_HE.moyennes['Moyenne HELB'])} étudiants finançables par ETP ; département santé : ${n1r(departementsHe().departements['Santé']?.[COMPARAISON_HE.annee] ? departementsHe().departements['Santé'][COMPARAISON_HE.annee][0] / departementsHe().departements['Santé'][COMPARAISON_HE.annee][1] : COMPARAISON_HE.moyennes['Santé'])} (${esc(departementsHe().source)}).</p></div>
    ${(() => {
      // LES DÉPARTEMENTS, TIM ET L'IIP CÔTE À CÔTE (3.5.442) : étudiants par ETP, 2025-2026.
      const ratioDe = cs => { const e = cs.reduce((t, c) => t + c.etu, 0), t2 = cs.reduce((t, c) => t + c.etp, 0); return t2 ? e / t2 : 0; };
      const DH = departementsHe(), aC = COMPARAISON_HE.annee;
      const ratioDep = dp => { const v = DH.departements[dp]?.[aC]; return v && v[1] ? v[0] / v[1] : ratioDe(COMPARAISON_HE.cursus.filter(c => c.dept === dp)); };
      const lignes = [...new Set(COMPARAISON_HE.cursus.map(c => c.dept))].map(dp => ({ nom: `Département ${dp}`, v: ratioDep(dp), coul: COMPARAISON_HE.couleurs[dp] }))
        .concat([{ nom: 'Ensemble de la HELB', v: ratioHelb(aC, DH) || ratioDe(COMPARAISON_HE.cursus), coul: '#94A3B8' }, { nom: 'Institut Ilya Prigogine', v: ratioDe(COMPARAISON_HE.iip), coul: COMPARAISON_HE.couleurs.IIP },
          ...(tim ? [{ nom: `${section} — part HELB`, v: tim.ratio, coul: '#3E7D5E', fort: true }] : []),
          ...COMPARAISON_HE.iip.filter(c => c.tim).map(c => ({ nom: `${section} — part IIP`, v: c.ratio, coul: '#3E7D5E', fort: true }))])
        .sort((a, b) => b.v - a.v);
      const mx = Math.max(...lignes.map(l => l.v));
      return `<div class="cadre"><h3>Les départements, l'IIP et ${esc(section)} — étudiants par ETP (${esc(COMPARAISON_HE.annee)})</h3><table class="barres">${lignes.map(l =>
        `<tr><td class="barres-lib" style="width:52mm;${l.fort ? 'font-weight:700' : ''}">${esc(l.nom)}</td><td class="barres-piste"><span class="barres-barre" style="width:${(l.v / mx) * 100}%;background:${l.coul};opacity:.9"></span></td>
          <td class="barres-val"${l.fort ? ' style="font-weight:700"' : ''}>${n0(l.v)}</td></tr>`).join('')}</table></div>`;
    })()}
    ${(() => {
      // Par département : bande de couleur à gauche, sous-total (Σ étudiants ÷ Σ ETP) en tête de chaque groupe (3.5.441).
      const COUL = COMPARAISON_HE.couleurs;
      const val = (c, a) => { const v = c.series[a] || (a === COMPARAISON_HE.annee ? [c.etu, c.etp] : null); return v && v[1] ? v : null; };
      const ratio = (cs, a) => { let e = 0, t = 0; for (const c of cs) { const v = val(c, a); if (v) { e += v[0]; t += v[1]; } } return t ? n0(e / t) : '—'; };
      const ligne = (cs, lib, coul, fort) => `<tr${fort ? ' class="repere"' : ''}><td style="border-left:1.2mm solid ${coul};padding-left:2mm">${esc(lib)}</td>${ann.map(a => `<td class="n">${ratio(cs, a)}</td>`).join('')}</tr>`;
      const depts = [...new Set(COMPARAISON_HE.cursus.map(c => c.dept))];
      return `<table class="annees"><thead><tr><th>Cursus</th>${ann.map(a => `<th class="n">${esc(court(a))}</th>`).join('')}</tr></thead><tbody>
        ${ligne(COMPARAISON_HE.cursus, 'Ensemble de la HELB', '#94A3B8', true)}
        ${depts.map(dp => { const cs = COMPARAISON_HE.cursus.filter(c => c.dept === dp), coul = COUL[dp] || '#94A3B8';
          return ligne(cs, `Département ${dp}`, coul, true) + cs.map(c => `<tr${c.tim ? ' style="font-weight:700;color:#3E7D5E"' : ''}><td style="border-left:1.2mm solid ${coul};padding-left:2mm">${esc(c.cursus)}</td>
            ${ann.map(a => { const v = val(c, a); return `<td class="n">${v ? n0(v[0] / v[1]) : '—'}</td>`; }).join('')}</tr>`).join(''); }).join('')}
        ${ligne(COMPARAISON_HE.iip, 'Institut Ilya Prigogine', COUL.IIP, true)}
        ${COMPARAISON_HE.iip.map(c => `<tr${c.tim ? ' style="font-weight:700;color:#3E7D5E"' : ''}><td style="border-left:1.2mm solid ${COUL.IIP};padding-left:2mm">${esc(c.cursus)}</td>
          ${ann.map(a => { const v = val(c, a); return `<td class="n">${v ? n0(v[0] / v[1]) : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
    })()}
    <p class="fin">Étudiants comptés par ETP enseignant, d'après les fichiers de la HELB : ${esc(COMPARAISON_HE.source)}. ${esc(section)} y figure sous
      « Technologue en imagerie médicale » (part HELB des étudiants et des ETP). Technoeco et Social : 2025-2026 seulement ; les sous-totaux d'avant ne comptent que la santé et COMAV. Le département santé compte en outre ${n2(COMPARAISON_HE.admin['Santé']['2025-2026'])} ETP
      administratifs en 2025-2026 ; ceux de ${esc(section)} sont à l'IIP.</p>`;
  };

  P.vrio = () => {
    const lN = L[L.length - 1];
    const defaut = {
      V: `La section rapporte plus qu'elle ne coûte : sur ${L.length} année(s), le résultat pour la HELB et l'ASBL est de ${totL('resultat') >= 0 ? '+' : '−'}${eur(Math.abs(totL('resultat')))}, et l'IIP y apporte ${eur(apportIIP)} sans coût supplémentaire, sur ses propres dotations.`,
      R: tim ? `Avec ${n0(tim.ratio)} étudiants par ETP enseignant, ${section} est ${rangTim === 1 ? 'le cursus le plus efficient' : `au ${rangTim}e rang`} des ${C.length} cursus de la HELB, dont la moyenne est de ${n0(COMPARAISON_HE.moyennes['Moyenne HELB'])}.` : '',
      I: `Le modèle tient à la co-organisation : l'enseignement partagé entre l'IIP (sur sa dotation) et la HELB (sur son allocation), l'administration entièrement à l'IIP, l'aide à la réussite (UE 95) intégrée. Il ne se reproduit pas sans les deux établissements.`,
      O: `L'organisation est déjà en place : secrétariat et direction à l'IIP, coordinations identifiées, matériel réduit (${eur(totL('fonct'))} sur la période), suivi dans Lucie.`,
    };
    const preuves = {
      V: [`Résultat HELB et ASBL : ${totL('resultat') >= 0 ? '+' : '−'}${eur(Math.abs(totL('resultat')))} sur ${L.length} an(s)`, lN ? `${esc(lN.y.annee)} : ${eur(lN.h.recettes)} de recettes pour ${eur(lN.h.cout)} de coût` : '', `Apport de l'IIP : ${eur(apportIIP)}`],
      R: tim ? [`${n0(tim.ratio)} étudiants par ETP (${esc(COMPARAISON_HE.annee)})`, `Rang ${rangTim} sur ${C.length} cursus HELB`, `Moyenne HELB ${n0(COMPARAISON_HE.moyennes['Moyenne HELB'])}, santé ${n0(COMPARAISON_HE.moyennes['Santé'])}`] : [],
      I: [`Part IIP de la charge ${esc(aN.annee)} : ${pc(aN.etp_iip, aN.etp)}`, `Administration : 100 % IIP`, `Aide à la réussite (UE 95) : ${eur(L.reduce((t, l) => t + u95(l.y), 0))}`],
      O: [`Matériel et fonctionnement : ${eur(totL('fonct'))}`, `${n0(aN.inscrits)} inscrits en ${esc(aN.annee)}`, `Coordinations : ${aN.coord.length} fonction(s) encodée(s)`],
    };
    const NOMS = { V: 'Valeur', R: 'Rareté', I: 'Difficile à imiter', O: 'Organisation' };
    return `<h2>Une section porteuse : la lecture VRIO</h2>
    <table class="vrio"><thead><tr><th style="width:30mm">Critère</th><th style="width:60mm">Ce que montrent les chiffres</th><th>Lecture</th></tr></thead><tbody>
      ${['V', 'R', 'I', 'O'].map(k => `<tr><td><b>${k}</b> — ${NOMS[k]}</td><td><ul class="preuves">${preuves[k].filter(Boolean).map(x => `<li>${x}</li>`).join('')}</ul></td>
        <td>${esc(R.vrio[k] || defaut[k])}</td></tr>`).join('')}</tbody></table>
    <p class="fin">Les preuves sont calculées par Lucie à partir des chiffres de ce dossier ; la lecture est celle de la direction${Object.keys(R.vrio).length ? '' : ' (proposée, à relire)'}.</p>`;
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
      ${y.coord.length ? `<tr class="repere"><td colspan="2">Coordinations ${esc(y.annee)} — sous-total</td><td class="n">${n2(y.coord.reduce((t, c) => t + c.etp, 0))}</td>
        <td class="n">${n2(y.coord.reduce((t, c) => t + c.etp_helb, 0))}</td><td class="n">${eur(y.coord.reduce((t, c) => t + c.cout_iip, 0))}</td><td class="n">${eur(y.coord.reduce((t, c) => t + c.cout_helb, 0))}</td></tr>` : ''}
      ${y.coord.map(c => `<tr><td>${esc(c.fonction)}</td><td>${esc(c.personne)}</td><td class="n">${c.etp ? n2(c.etp) : '—'}</td><td class="n">${c.etp_helb ? n2(c.etp_helb) : '—'}</td>
        <td class="n">${c.deja ? '<span class="fin">dans ses attributions</span>' : c.cout_iip ? eur(c.cout_iip) : '—'}</td>
        <td class="n">${c.cout_helb ? eur(c.cout_helb) : '—'}</td></tr>`).join('')}
      ${y.admin.fonctions.length ? `<tr class="repere"><td colspan="2">Cadre administratif de l'établissement (${y.admin.fonctions.map(f => esc(f.fonction)).filter((v, i, t) => t.indexOf(v) === i).join(', ')})</td>
        <td class="n">${n2(y.admin.fonctions.reduce((t, f) => t + f.etp, 0))}</td><td class="n">—</td><td class="n">${eur(y.admin.cout)}</td><td class="n">—</td></tr>
        <tr><td colspan="4">— part de ${esc(section)} : ${n0(y.admin.per_section)} périodes sur ${n0(y.admin.per_ecole)} (${pc(y.admin.per_section, y.admin.per_ecole)})${R.mesures.direction === 'non' ? ', secrétariat seul' : ''}</td>
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
      table.vrio td { vertical-align:top; font-size:9pt; } ul.preuves { margin:0; padding-left:4mm; } ul.preuves li { margin:0 0 1mm; }
    </style>
    ${visibles.map((k, i) => `<section class="partie${R.saut && i > 0 && !['synthese', 'methode'].includes(k) ? ' saut' : ''}">${P[k]()}</section>`).join('')}`;

  return {
    corps,
    titre: `IIP et HELB — ${section}`,
    nom: `IIP-HELB-${section}-${annees.map(court).join('_')}.html`,
    entete: { titre: `IIP et HELB : la charge et le coût de ${section}`, sous: `${annees.join(' · ')} · ${methode}${quoiTxt}` },
  };
}

/* LES ATTRIBUTIONS DEPUIS LA CRÉATION (3.5.479, Charles, 16 novembre 2026 : « présenter au COPIL l'évolution des attributions depuis
   la création » ; tranché : périodes et ETP, nombre d'enseignants, part IIP / HELB et experts, statuts ; une pièce dans Éditions et des
   diapositives). Une ligne par année de la section, lue des attributions seules (hors congés, coordinations non comprises) : périodes et
   ETP par école, personnes par école et par statut (chargé de cours, expert ou invité), arrivées (jamais vues dans la section avant) et
   départs (présentes l'année d'avant, plus cette année). Le statut de nomination (définitif, temporaire prioritaire, temporaire) n'existe
   qu'au présent, sur la fiche : il se lit pour les enseignants de la dernière année seulement. */
export function evolutionAttributions(section, unite = 'periodes', mode = 'reel') {
  const toutes = db.prepare('SELECT DISTINCT annee_scolaire a FROM attribution WHERE section = ? ORDER BY 1').all(section).map(r => r.a);
  const vus = new Set();
  let avant = null;
  const annees = toutes.map(a => {
    const L = attributions(section, a, unite, mode);
    const som = (f, filtre) => L.filter(filtre).reduce((t, l) => t + (f(l) || 0), 0);
    const ids = h => new Set(L.filter(l => l.professeur_id && (h == null || l.helb === h)).map(l => l.professeur_id));
    const tous = ids(null);
    const parStatut = {};
    for (const st of ['CC', 'EXP', 'AUTRE']) {
      parStatut[st] = {
        iip: new Set(L.filter(l => l.professeur_id && !l.helb && l.statut === st).map(l => l.professeur_id)).size,
        helb: new Set(L.filter(l => l.professeur_id && l.helb && l.statut === st).map(l => l.professeur_id)).size,
        etp_iip: som(l => l.etp, l => !l.helb && l.statut === st), etp_helb: som(l => l.etp, l => l.helb && l.statut === st),
        per_iip: som(l => l.periodes, l => !l.helb && l.statut === st), per_helb: som(l => l.periodes, l => l.helb && l.statut === st),
      };
    }
    const arrivees = [...tous].filter(id => !vus.has(id)).length;
    const departs = avant ? [...avant].filter(id => !tous.has(id)).length : 0;
    for (const id of tous) vus.add(id);
    avant = tous;
    return {
      annee: a,
      per_iip: som(l => l.periodes, l => !l.helb), per_helb: som(l => l.periodes, l => l.helb),
      etp_iip: som(l => l.etp, l => !l.helb), etp_helb: som(l => l.etp, l => l.helb),
      a_designer: som(l => l.periodes, l => !l.professeur_id),
      personnes: tous.size, personnes_iip: ids(false).size, personnes_helb: ids(true).size,
      arrivees, departs, statuts: parStatut,
    };
  });
  // Le statut de nomination, au présent : les enseignants de la dernière année.
  let nomination = null;
  const derniere = toutes[toutes.length - 1];
  if (derniere) {
    const ids = [...new Set(attributions(section, derniere, unite, mode).filter(l => l.professeur_id && !l.helb).map(l => l.professeur_id))];
    if (ids.length) {
      const r = db.prepare(`SELECT COALESCE(NULLIF(statut_nomination, ''), 'temporaire') sn, COUNT(*) n FROM professeur WHERE id IN (${ids.map(() => '?').join(',')}) GROUP BY 1`).all(...ids);
      nomination = { annee: derniere, definitif: 0, temporaire_prioritaire: 0, temporaire: 0 };
      for (const x of r) nomination[x.sn in nomination ? x.sn : 'temporaire'] += x.n;
    }
  }
  return { section, premiere: toutes[0] || null, annees, nomination };
}

/* LES DONNÉES, POUR LA PAGE DE GESTION (3.5.432, Charles : « en natif, comme le rapport finances ; plus précis avec les coordinations ;
   tout en accès direct »). Les mêmes chiffres que la pièce, sans mise en page : l'écran les dessine avec les composants de Lucie. */
export function donneesIipHelb(section, anneesDemandees, { unite = 'periodes', cor = null, mode = 'reel' } = {}) {
  const toutes = db.prepare('SELECT DISTINCT annee_scolaire a FROM attribution WHERE section = ? ORDER BY 1').all(section).map(r => r.a);
  const annees = (anneesDemandees?.length ? anneesDemandees : toutes.slice(-4)).filter(a => toutes.includes(a)).sort();
  const niv = niveauDeSection(section);
  const ens = new Map();
  const refAdm = adminReference(section, toutes);
  const Y = annees.map(a => {
    const y = annee(section, a, unite, mode);
    const parCle = f => { const o = {}; for (const l of y.lignes) { const k = f(l); o[k] ||= { iip: 0, helb: 0 }; o[k][l.helb ? 'helb' : 'iip'] += l.etp; } return o; };
    for (const l of y.lignes) {
      const k = `${l.professeur || 'À désigner'}|${l.helb ? 'HELB' : 'IIP'}`;
      if (!ens.has(k)) ens.set(k, { nom: l.professeur || 'À désigner', contrat: l.helb ? 'HELB' : 'IIP', par: {} });
      ens.get(k).par[a] = (ens.get(k).par[a] || 0) + l.etp;
    }
    if (!(y.admin.cout > 0) && refAdm) y.admin = { ...y.admin, part: refAdm.cout * refAdm.ratio, reprise: refAdm.annee };
    y.ue95 = aideReussite(a);
    const { lignes, ...reste } = y;
    return { ...reste, ens_iip: y.etp_iip, ens_helb: y.etp_helb,
      blocs: parCle(l => l.bloc), natures: parCle(l => NATURES[l.nature] || (/^\d+$/.test(String(l.nature)) ? `Autre (${l.nature})` : l.nature)),
      /* LA BALANCE PAR ÉCOLE (3.5.471, Charles : « avoir cette balance chargés de cours / experts par école » — 2025-2026 : une
         enseignante de la HELHa détachée vers la HELB fin août, des UE basculées ; 2026-2027 : tous les stages passés à l'IIP). Par statut
         (chargé de cours, expert ou invité) et par nature (cours, stages, épreuve intégrée, coordination), IIP et HELB, en ETP. */
      statuts: parCle(l => `${{ CC: 'Chargés de cours', EXP: 'Experts et invités', AUTRE: 'Autres statuts' }[l.statut]} · ${l.nature === 'ES' ? 'stages' : l.nature === 'EI' ? 'épreuve intégrée' : l.nature === 'Cours' ? 'cours' : 'coordination et autres'}`) };
  });
  // Les inscrits de chaque année de la section, pour le lissage de l'allocation (années hors du choix comprises).
  const inscrits_annees = {};
  for (const a of toutes) { try { inscrits_annees[a] = coutMemo(a).sections.find(x => x.section === section)?.inscrits || 0; } catch { inscrits_annees[a] = 0; } }
  // L'ETP QUE DÉCLARE LA HELB (3.5.464, Charles : « les deux côte à côte ») : la comparaison ETP de la HELB, quand elle connaît la section.
  const cursusHe = COMPARAISON_HE.cursus.find(c => c.dept !== 'IIP' && c.tim && section === 'TIM');
  const etp_declare_helb = Object.fromEntries(Object.entries(cursusHe?.series || {}).map(([a, v]) => [a, v[1]]));
  return { etp_declare_helb, section, annees, toutes, premiere: toutes[0] || null, inscrits_annees, materiel_defaut: MATERIEL_HELB, admin_reference: refAdm, comparaison: { ...COMPARAISON_HE, departements: departementsHe() }, niveau: niv, taux_cmb: getParamNum(`cout.cmb_${niv.toLowerCase()}`, 0),
    tarif_ct: tarifs()[niv]?.CT || 0, prix_helb: prixHelb(cor), heures_helb: HEURES_HELB, unite_helb: unite, Y, enseignants: [...ens.values()] };
}

/** Pour l'aperçu en tableau et le tableur : une ligne par année. */
export function lignesIipHelb(p) {
  const section = p.section || 'TIM';
  const { unite_helb: unite, cout: mode } = reglagesIipHelb(p.reglages).mesures;
  const annees = (p.annees?.length ? p.annees : []).sort();
  return annees.map(a => {
    const y = annee(section, a, unite, mode);
    return { annee: a, section, etp_iip: Math.round((y.etp_iip + y.cetp_iip) * 100) / 100, etp_helb: Math.round((y.etp_helb + y.cetp_helb) * 100) / 100,
      per_iip: Math.round(y.per_iip), per_helb: Math.round(y.per_helb), cout_iip: Math.round(y.cout_iip + y.coord_iip + y.admin.part),
      cout_helb: Math.round(mode === 'reel' ? salairesHelb({ ens_helb: y.etp_helb, cetp_helb: y.cetp_helb, etp_helb_ma: y.etp_helb_ma, cetp_helb_ma: y.cetp_helb_ma }, { ...PARAM_HELB, prix: 'titres', ...Object.fromEntries(Object.entries(prixHelb()).map(([k, v]) => [`prix_${k}`, v])) }, true) : y.cout_helb_conv + y.coord_helb_conv), inscrits: y.inscrits,
      recettes: Math.round(y.recettes), par_etudiant: y.inscrits ? Math.round(y.recettes / y.inscrits) : null };
  });
}

/* LE COÛT DES ENSEIGNANTS HELB D'UNE SECTION SUR UNE ANNÉE CIVILE (3.5.467, Charles : « il vaut mieux ne pas être flatteur ; nos calculs
   doivent être réels » ; « cela comprend les coordinations : 2 ETP en 25-26 »). Les ETP de Lucie (lignes HELB + coordinations HELB,
   règle `divHelb`), au prix de leur titre (COR) ; une année civile = 8/12 de l'année scolaire qui finit + 4/12 de celle qui commence.
   Rend aussi les ETP, pour l'écran. */
export function enseignantsHelbCivil(section, anneeCivile) {
  const Y = Number(anneeCivile), P = { ...PARAM_HELB, prix: 'titres', ...Object.fromEntries(Object.entries(prixHelb()).map(([k, v]) => [`prix_${k}`, v])) };
  const toutes = new Set(db.prepare('SELECT DISTINCT annee_scolaire a FROM attribution WHERE section = ?').all(section).map(r => r.a));
  const part = (a, poids) => {
    if (!toutes.has(a)) return { cout: 0, etp: 0, poids: 0 };
    const y = annee(section, a);
    const yy = { ens_helb: y.etp_helb, cetp_helb: y.cetp_helb, etp_helb_ma: y.etp_helb_ma, cetp_helb_ma: y.cetp_helb_ma };
    return { cout: salairesHelb(yy, P, true) * poids, etp: (y.etp_helb + y.cetp_helb) * poids, poids };
  };
  const a = part(`${Y - 1}-${Y}`, 8 / 12), b = part(`${Y}-${Y + 1}`, 4 / 12);
  if (!a.poids && !b.poids) return null;
  return { cout: Math.round(a.cout + b.cout), etp: Math.round((a.etp + b.etp) * 100) / 100 };
}

/* LES ENSEIGNANTS DE L'IIP D'UNE SECTION, PAYÉS PAR LA FÉDÉRATION (3.5.498, Charles : « les charges prennent-elles en compte la dotation
   de l'IIP ? si pas, une colonne en plus avec les charges en MDP »). Ils ne sont pas dans les comptes de l'ASBL. Coût au prix de la
   circulaire des conventions (périodes IIP + coordinations IIP, comme la page IIP et HELB) ; une année civile = 8/12 de l'année scolaire
   qui finit + 4/12 de celle qui commence ; une année scolaire (« 2026-2027 ») se prend telle quelle. */
export function enseignantsIipCivil(section, periode) {
  const toutes = new Set(db.prepare('SELECT DISTINCT annee_scolaire a FROM attribution WHERE section = ?').all(section).map(r => r.a));
  const de = a => { if (!toutes.has(a)) return null; const y = annee(section, a); return { cout: y.cout_iip + y.coord_iip, etp: y.etp_iip + (y.cetp_iip || 0) }; };
  if (/^\d{4}-\d{4}$/.test(String(periode))) { const x = de(periode); return x ? { cout: Math.round(x.cout), etp: Math.round(x.etp * 100) / 100 } : null; }
  const Y = Number(periode), a = de(`${Y - 1}-${Y}`), b = de(`${Y}-${Y + 1}`);
  if (!a && !b) return null;
  return { cout: Math.round((a?.cout || 0) * 8 / 12 + (b?.cout || 0) * 4 / 12), etp: Math.round(((a?.etp || 0) * 8 / 12 + (b?.etp || 0) * 4 / 12) * 100) / 100 };
}

/* L'ESTIMATION D'UNE ANNÉE SCOLAIRE POUR TOUTE L'ASBL (3.5.468, Charles : « je veux une estimation sur 2026 et 26-27 en fonction des
   inscrits ; tu sais combien ils paient, et les attributions tu les as »). Le calcul de la page IIP et HELB (`helbAnnee`) : produits
   = allocation de la HELB (50 % des inscrits, MUCE × 1,5, lissée sur 3 ans, dès 2026-2027) + droits et frais des inscrits (barème de
   Lucie) ; charges = enseignants HELB de Lucie (coordinations comprises, prix du titre) + matériel. Les enseignants de l'IIP, payés par
   la Fédération, n'y sont pas : ils ne sont pas une charge de l'ASBL. */
export function estimationAnnee(section, a) {
  const toutes = db.prepare('SELECT DISTINCT annee_scolaire a FROM attribution WHERE section = ? ORDER BY 1').all(section).map(r => r.a);
  if (!toutes.includes(a)) return null;
  const y = annee(section, a);
  const insc = {};
  for (const x of toutes) { try { insc[x] = coutMemo(x).sections.find(z => z.section === section)?.inscrits || 0; } catch { insc[x] = 0; } }
  const P = { ...PARAM_HELB, mode_fonct: 'reel', prix: 'titres', ...Object.fromEntries(Object.entries(prixHelb()).map(([k, v]) => [`prix_${k}`, v])) };
  const yy = { ...y, ens_helb: y.etp_helb };
  const h = helbAnnee(yy, P, true, x => insc[x], MATERIEL_HELB[a]?.montant ?? 0);
  return { annee: a, inscrits: y.inscrits, etp_helb: Math.round((y.etp_helb + y.cetp_helb) * 100) / 100,
    allocation: Math.round(h.allocation), droits: Math.round(h.droits), produits: Math.round(h.recettes),
    salaires: Math.round(h.salaires), materiel: Math.round(h.fonct), cout: Math.round(h.cout) };
}

/** L'allocation de la HELB pour une section et une ANNÉE CIVILE (l'année budgétaire du décret, art. 17) : la moyenne des étudiants
 *  comptés des trois années académiques précédentes × MUCE × pondération. Pour l'estimation d'une année civile (3.5.470). */
export function allocationCivile(section, C) {
  const P = PARAM_HELB, n = Math.max(1, Math.round(P.lissage || 3));
  let s = 0;
  for (let k = 2; k < 2 + n; k++) {
    const a = `${C - k}-${C - k + 1}`;
    let ins = 0; try { ins = coutMemo(a).sections.find(x => x.section === section)?.inscrits || 0; } catch { ins = 0; }
    s += ins * P.part / 100;
  }
  return Math.round((s / n) * P.muce * P.ponderation);
}

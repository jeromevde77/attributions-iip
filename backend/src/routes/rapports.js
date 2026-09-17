/**
 * LES RAPPORTS — ce que Lucie sait dire d'elle-même, en tableur.
 *
 * Pilotage calculait sans jamais rien produire : ni ETP, ni dotation, ni
 * résultats ne pouvaient sortir de l'écran. Or ces chiffres servent DEHORS —
 * dotation, Conseil de perfectionnement, inspection, comptabilité — et le
 * secrétariat les recopiait à la main dans un classeur.
 *
 * LE TABLEUR PLUTÔT QUE LA PAGE MISE EN PAGE. Un rapport de pilotage se retrie,
 * se recoupe, se transmet à quelqu'un qui le retravaillera. Un document figé
 * obligerait à ressaisir. Les pièces réglementaires, elles, restent du ressort
 * des annexes — ce module ne produit AUCUNE pièce officielle.
 *
 * Chaque rapport déclare ses colonnes et sa requête : ajouter un rapport, c'est
 * ajouter une entrée, non un écran.
 */
import { Router } from 'express';
import ExcelJS from 'exceljs';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { envelopperDocument } from '../lib/document.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { decisionDeSession } from './acquis.js';
import { calculerEtp } from './pilotage.js';
import { couleurs } from '../lib/couleurs.js';

const r = Router();

/** Un ETP vaut 800 périodes en charge théorique ; le cours technique compte double. */
const COLS = (l) => l.map(([cle, entete, largeur = 16]) => ({ cle, entete, largeur }));

/**
 * LE CATALOGUE.
 *
 * « domaine » range le rapport dans son onglet ; « params » dit ce que l'écran
 * doit demander avant de le produire. Un rapport qui réclame une section ne
 * doit pas pouvoir se lancer sans elle.
 */
const STYLE_RAPPORT = `
        /* LE TABLEAU D'UN RAPPORT SE LIT, IL NE SE QUADRILLE PAS.
           Chaque cellule portait son filet : une grille de tableur posée sur
           une feuille administrative, où l'œil suit les traits au lieu de
           suivre les chiffres. On garde UN filet sous l'en-tête et UN filet
           fin entre les lignes — le reste est du blanc, qui sépare aussi bien.
           Les nombres passent en chiffres de largeur fixe : c'est ce qui rend
           une colonne comparable d'un coup d'œil. */
        h1 { font-size: 14pt; letter-spacing: -.2pt; }
        .sous { color:#64748b; font-size:9pt; margin:0 0 6mm; }
        .ref  { color:#94a3b8; font-size:8pt; margin-top:5mm; }
        h3 { font-size: 10pt; margin: 7mm 0 1mm; letter-spacing: -.1pt; }
        h3 .sous { display:inline; font-size:9pt; margin:0; }
        table { margin: 0 0 2mm; }
        th, td { border: 0; padding: 1.6mm 2mm; font-size: 8.5pt;
                 border-bottom: 0.3pt solid #e2e8f0; }
        th { background: transparent; color:#64748b; font-size: 7.5pt;
             border-bottom: 0.8pt solid #cbd5e1; }
        td { font-variant-numeric: tabular-nums; }
        tr.repere td { background: transparent; font-weight: 600; color:#1B2B4B;
                       padding-top: 3mm; border-bottom: 0.6pt solid #cbd5e1; }
        tbody tr:last-child td { border-bottom: 0; }
        td.n, th.n { text-align: right; }
        /* Le titre de groupe EST la section : en gras, sur sa ligne, et rien
           d'autre. C'est un titre, pas une cellule de plus. */
        tr.groupe td { font-weight: 700; color:#1B2B4B; padding-top: 4mm;
                       font-size: 9.5pt; border-bottom: 0.5pt solid #cbd5e1; }
        tr.groupe .fin { font-weight: 400; }
        td.vide { color:#94a3b8; text-align:center; padding: 6mm 0; }
        tfoot tr.repere td { border-top: 0.8pt solid #cbd5e1; border-bottom: 0; }`;

/*
 * ── DEUX FAMILLES DE PIÈCES, ET ELLES NE SE RESSEMBLENT PAS ────────────────
 *
 * Une pièce ADMINISTRATIVE — attestation, procès-verbal, grille de
 * délibération — se lit ligne à ligne et se dépose dans un dossier : elle est
 * sobre, dense, et rien n'y attire l'œil plus qu'autre chose, parce que tout y
 * fait foi.
 *
 * Une pièce de REPORTING — ETP, ratios, dotation — se présente à un COPIL ou à
 * un Conseil d'administration. Personne n'y lit trois cents lignes : on y
 * cherche un ordre de grandeur, une proportion, une évolution. Un listing ne
 * répond pas à cela ; une tuile et une barre, si.
 *
 * TOUT EST DESSINÉ EN SVG, sans une ligne de JavaScript. Une bibliothèque de
 * graphiques ne s'exécute pas dans une fenêtre d'impression, et un graphique
 * qui manque à l'impression est pire qu'un graphique absent : on ne s'en
 * aperçoit qu'une fois la pièce distribuée.
 */

/** Une tuile : le chiffre d'abord, le libellé dessous — comme à l'écran. */
function tuile({ valeur, unite = '', libelle, precision = null, ton = 'neutre',
                couleur = null }) {
  // Le filet de gauche porte la signification : la couleur d'un contrat quand
  // la tuile en parle, un gris neutre sinon. Jamais un fond coloré — la charte
  // le dit, et une page de fonds colorés ne signale plus rien.
  const bord = couleur || { neutre: '#cbd5e1', fort: '#1B2B4B', doux: '#94a3b8' }[ton] || '#cbd5e1';
  return `<td class="tuile" style="border-left-color:${bord}">
    <div class="tuile-val">${valeur}${unite ? `<span class="tuile-u">${unite}</span>` : ''}</div>
    <div class="tuile-lib">${libelle}</div>
    ${precision ? `<div class="tuile-fin">${precision}</div>` : ''}
  </td>`;
}
const rangeeTuiles = (tuiles) =>
  `<table class="tuiles"><tr>${tuiles.join('')}</tr></table>`;

/**
 * UNE BARRE HORIZONTALE PAR LIGNE — la forme qui compare des grandeurs
 * nommées. On lit d'abord le nom, puis la longueur : c'est l'ordre naturel,
 * et c'est ce qu'un camembert interdit dès qu'il y a plus de trois parts.
 */
function barres({ donnees, unite = '' }) {
  /* LE TEXTE NE VA PAS DANS LE SVG.
     Une barre dessinée dans un SVG étiré à la largeur de la page voit son
     texte étiré avec elle : huit points deviennent quatre, déformés, et
     illisibles à l'impression. La barre est donc un simple bloc coloré dont
     la LARGEUR est un pourcentage, et le libellé du texte, à côté, à la
     taille du document. Rien à mettre à l'échelle, rien à déformer. */
  const max = Math.max(...donnees.map(d => d.valeur), 0) || 1;
  return `<table class="barres">${donnees.map(d => `<tr>
      <td class="barres-lib">${d.nom || ''}</td>
      <td class="barres-piste">
        <span class="barres-barre" style="width:${Math.max(1, d.valeur / max * 100)}%;
          background:${d.couleur || '#1B2B4B'};opacity:${d.pale ? 0.35 : 0.85}"></span>
      </td>
      <td class="barres-val">${d.texte}</td>
    </tr>`).join('')}</table>${unite ? `<div class="fin">${unite}</div>` : ''}`;
}

/** Une seule barre, découpée en parts — pour dire « de quoi c'est fait ». */
function barreParts(parts) {
  const total = parts.reduce((s, p) => s + p.valeur, 0) || 1;
  const seg = parts.filter(p => p.valeur > 0).map(p =>
    `<span class="part" style="width:${p.valeur / total * 100}%;background:${p.couleur};
       opacity:${p.pale ? 0.35 : 0.85}"></span>`).join('');
  const legende = parts.filter(p => p.valeur > 0).map(p =>
    `<span class="leg"><i style="background:${p.couleur};opacity:${p.pale ? 0.35 : 0.85}"></i>${
      p.nom} — ${Math.round(p.valeur / total * 100)} %</span>`).join('');
  return `<div class="parts">${seg}</div><div class="legendes">${legende}</div>`;
}

/** Les styles des pièces de reporting — tuiles, barres, légendes. */
const STYLE_REPORTING = `
  /* LA RANGÉE DE TUILES RESTE DANS LA COLONNE DE TEXTE. Un écartement de
     cellules « déborde » d'une demi-valeur de chaque côté : la première tuile
     sortait de 5 mm à gauche, sous l'en-tête et le tableau qui, eux, partent
     de la marge. On écarte donc les tuiles SANS écarter la table : c'est le
     padding intérieur qui fait l'air, pas l'espacement extérieur. */
  table.tuiles { width:100%; border-collapse:collapse;
                 margin:3mm 0 8mm; table-layout:fixed; }
  td.tuile + td.tuile { padding-left:7mm !important; }
  /* LE FILET N'EST PAS UN SOULIGNEMENT COLLÉ AU CHIFFRE. À 22 points, un
     nombre a besoin d'air : 3 mm, le filet semblait poussé contre lui, et l'œil
     lisait « barre + chiffre » comme un seul objet au lieu d'un repère et d'une
     valeur. Le retrait passe à 4,5 mm — la même respiration que les tuiles de
     l'écran, où le filet de 3 px est suivi de 12 px. */
  td.tuile { border:0; border-left:2.5pt solid #cbd5e1; padding:1.2mm 0 1.2mm 4.5mm;
             vertical-align:top; }
  /* LE CHIFFRE EST LE SUJET DE LA TUILE : il est grand, serré, et tout le
     reste est gris. Une tuile où le libellé pèse autant que le nombre ne dit
     plus rien d'un coup d'œil. */
  /* Une interligne de 1 rogne les accents et les hampes : le haut du chiffre
     touchait le bord de la cellule. */
  .tuile-val { font-size:22pt; font-weight:700; color:#1B2B4B; line-height:1.12;
               letter-spacing:-.8pt; font-variant-numeric:tabular-nums; }
  .tuile-u   { font-size:9pt; font-weight:500; color:#a1a1a6; margin-left:1.2mm;
               letter-spacing:0; }
  /* PAS DE CAPITALES FORCÉES : « Étudiants » y perdait son accent, et une
     étiquette en capitales se lit moins vite qu'une étiquette normale. */
  .tuile-lib { font-size:9pt; color:#1B2B4B; margin-top:1.6mm; font-weight:500;
               letter-spacing:-.1pt; }
  .tuile-fin { font-size:8pt; color:#a1a1a6; margin-top:.8mm; }
  .legendes { margin-top:1.5mm; }
  .leg { font-size:8pt; color:#6e6e73; margin-right:5mm; white-space:nowrap; }
  .leg i { display:inline-block; width:7px; height:7px; border-radius:1.5px;
           margin-right:1.2mm; vertical-align:baseline; }
  .cadre { break-inside:avoid; page-break-inside:avoid; margin:0 0 5mm; }
  table.barres { width:100%; border-collapse:collapse; margin:0; }
  table.barres td { border:0; padding:.7mm 0; font-size:8.5pt; vertical-align:middle; }
  .barres-lib { width:34mm; color:#1B2B4B; padding-right:2mm !important; }
  .barres-piste { background:#f1f5f9; border-radius:1mm; height:4mm; line-height:0; }
  .barres-barre { display:inline-block; height:4mm; border-radius:1mm; }
  .barres-val { width:44mm; text-align:right; color:#475569;
                padding-left:2mm !important; white-space:nowrap; }
  .parts { display:flex; height:4mm; border-radius:1mm; overflow:hidden; }
  .parts .part { display:block; height:4mm; }
  .marque { color:#fff; font-size:6.5pt; font-weight:700; padding:.3mm 1.2mm;
            border-radius:1mm; letter-spacing:.3pt; }`;

/**
 * ── LA GRILLE DE SECTION ──────────────────────────────────────────────────
 *
 * La pièce que Jérôme sortait tous les ans, et qui a disparu avec l'écran qui
 * la portait. Elle n'est ni un tableau ni un rapport de reporting : c'est la
 * STRUCTURE d'un cursus, et elle se lit en descendant — bloc, unité, cours —
 * avec les sous-totaux à chaque palier.
 *
 * Trois colonnes de périodes, et elles ne disent pas la même chose : ce que
 * preste le PROFESSEUR, ce que suit l'ÉTUDIANT, et l'AUTONOMIE. Les confondre
 * en une seule colonne — ce que faisait le rendu générique — ôte à la grille
 * tout ce qui en fait une grille.
 */
function documentGrilleSection(p) {
  const section = p.section || p.portee?.section;
  if (!section) throw new Error('Choisissez une section.');
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const n = v => (v ? Math.round(v).toLocaleString('fr-BE') : '—');

  const ues = db.prepare(`
    SELECT u.ue_num, u.ue_nom, u.ue_niv, u.ue_quad, u.ue_aut, u.ects
      FROM ue u WHERE u.section = ? AND u.annee_scolaire = ?
     ORDER BY CAST(SUBSTR(COALESCE(u.ue_niv,'ZZZ'), -1) AS INTEGER), u.ue_num
  `).all(section, p.annee);
  if (!ues.length) throw new Error(`Aucune unité pour la section « ${section} » en ${p.annee}.`);

  const cours = db.prepare(`
    SELECT c.cours_code, c.cours_nom, c.ue_num, c.ct_pp, c.cours_per,
           c.ue_autonomie, c.heures, c.per_etudiant
      FROM cours c WHERE c.section = ? AND c.annee_scolaire = ?
     ORDER BY c.cours_code
  `).all(section, p.annee);

  /* LES PÉRIODES ÉTUDIANT NE SE DEVINENT PAS. Ordre de priorité du modèle :
     ce qui est saisi explicitement, sinon les heures converties (×1,2), sinon
     les périodes de cours. Un stage encodé à 400 h comptait pour 60 tant que
     `heures` était ignoré. */
  const vide = v => v === null || v === undefined || v === '';
  const perEtudiant = c => (!vide(c.per_etudiant) ? Number(c.per_etudiant)
    : !vide(c.heures) ? Math.round(Number(c.heures) * 1.2)
    : Number(c.cours_per) || 0);

  const parUe = new Map();
  for (const c of cours) {
    if (!parUe.has(c.ue_num)) parUe.set(c.ue_num, []);
    parUe.get(c.ue_num).push(c);
  }

  let gCt = 0, gPp = 0, gAut = 0, gEtud = 0, gTot = 0;
  let corps = '';
  let blocCourant = null;

  for (const u of ues) {
    const liste = parUe.get(u.ue_num) || [];
    const ct = liste.filter(c => c.ct_pp === 'CT').reduce((t, c) => t + (c.cours_per || 0), 0);
    const pp = liste.filter(c => c.ct_pp === 'PP').reduce((t, c) => t + (c.cours_per || 0), 0);
    const aut = Math.max(0, ...liste.map(c => c.ue_autonomie || 0), u.ue_aut || 0);
    const etud = liste.reduce((t, c) => t + perEtudiant(c), 0);
    const tot = ct + pp + aut;
    gCt += ct; gPp += pp; gAut += aut; gEtud += etud; gTot += tot;

    const bloc = u.ue_niv || '—';
    if (bloc !== blocCourant) {
      blocCourant = bloc;
      corps += `<tr class="bloc"><td colspan="8">${esc(bloc)}</td></tr>`;
    }

    corps += `<tr class="ue">
      <td class="ue-bloc">${esc(bloc)}</td>
      <td colspan="3"><b>UE ${esc(u.ue_num)} — ${esc(u.ue_nom)}</b>${
        u.ue_quad ? ` <span class="fin">${esc(u.ue_quad)}</span>` : ''}${
        u.ects ? ` <span class="fin">· ${esc(u.ects)} ECTS</span>` : ''}</td>
      <td colspan="4"></td></tr>`;

    for (const c of liste) {
      corps += `<tr>
        <td class="code">${esc(c.cours_code)}</td>
        <td colspan="2">${esc(c.cours_nom)}</td>
        <td class="type">${esc(c.ct_pp || '')}</td>
        <td class="n">${n(c.cours_per)}</td>
        <td class="n etud">${n(perEtudiant(c))}</td>
        <td class="n">${c.ue_autonomie ? n(c.ue_autonomie) : ''}</td>
        <td class="n g">${n(c.cours_per)}</td>
      </tr>`;
    }
    if (aut > 0) {
      corps += `<tr><td></td><td colspan="2"><i>Autonomie</i></td>
        <td class="type">Auto</td><td class="n">—</td><td class="n etud">—</td>
        <td class="n aut">${n(aut)}</td><td class="n g">${n(aut)}</td></tr>`;
    }
    corps += `<tr class="sous"><td></td>
      <td colspan="3">Sous-total UE ${esc(u.ue_num)}</td>
      <td class="n">${n(ct + pp)}</td><td class="n etud">${n(etud)}</td>
      <td class="n aut">${n(aut)}</td><td class="n g">${n(tot)}</td></tr>`;
  }

  corps = `<table class="grille">
    <thead><tr>
      <th style="width:18mm">Code</th><th colspan="2">Cours / unité</th>
      <th style="width:14mm">CT/PP</th>
      <th class="n" style="width:20mm">Pér. prof.</th>
      <th class="n" style="width:20mm">Pér. étud.</th>
      <th class="n" style="width:18mm">Autonomie</th>
      <th class="n" style="width:16mm">Total</th>
    </tr></thead>
    <tbody>${corps}</tbody>
    <tfoot><tr class="total">
      <td colspan="4">Total — ${esc(section)}</td>
      <td class="n">${n(gCt + gPp)}</td><td class="n etud">${n(gEtud)}</td>
      <td class="n aut">${n(gAut)}</td><td class="n">${n(gTot)}</td>
    </tr></tfoot>
  </table>
  <p class="ref">CT : ${n(gCt)} pér. · PP : ${n(gPp)} pér. · Autonomie : ${n(gAut)} pér.
    · ${ues.length} unité(s), ${cours.length} cours · total ${n(gTot)} périodes</p>`;

  return {
    corps,
    entete: {
      titre: `Grille de section — ${section}`,
      sous: `Année scolaire ${p.annee} · structure du référentiel`,
      mention: "Périodes professeur, périodes étudiant et autonomie ne se confondent pas : "
        + "la première est prestée, la deuxième est suivie, la troisième est encadrée.",
    },
    titre: `Grille de section — ${section}`,
    nom: `Grille-${String(section).replace(/\W+/g, '-')}-${p.annee}.html`,
    styles: STYLE_RAPPORT + `
      table.grille td, table.grille th { padding: 1.1mm 2mm; font-size: 8pt; }
      table.grille .n { text-align: right; font-variant-numeric: tabular-nums; }
      tr.bloc td { font-weight: 700; color: #1B2B4B; font-size: 9pt;
                   padding-top: 4mm; border-bottom: 0.8pt solid #1B2B4B; }
      tr.ue td { padding-top: 2.5mm; border-bottom: 0.3pt solid #e2e8f0; }
      tr.ue .ue-bloc { font-size: 6.5pt; color: #94a3b8; vertical-align: middle; }
      td.code { font-family: ui-monospace, Menlo, Consolas, monospace;
                font-size: 7.5pt; color: #64748b; }
      td.type { font-size: 7pt; color: #64748b; text-align: center; }
      td.etud { color: #64748b; }
      td.aut  { color: #B45309; }
      td.g    { font-weight: 700; color: #1B2B4B; }
      tr.sous td { font-size: 7.5pt; color: #475569; font-style: italic;
                   border-bottom: 0.6pt solid #cbd5e1; }
      tfoot tr.total td { font-weight: 700; color: #1B2B4B; font-size: 9pt;
                          border-top: 1pt solid #1B2B4B; border-bottom: 0; }`,
  };
}

/** Ce que toutes les pièces de charge partagent. */
const STYLE_ETP = `
  td.ue { font-weight: 600; color: #1B2B4B; white-space: nowrap; }
  td.n, th.n { text-align: right; }
  td.g { font-weight: 700; color: #1B2B4B; }
  tr.dont td { color: #64748b; font-size: 8pt; border-bottom: 0; }
  tr.dont td:first-child { text-align: right; }
  tfoot tr.repere td { border-top: 0.6pt solid #cbd5e1; }`;

/** Le bloc d'une unité — « BA1 », « BA2 »… ; à défaut, « Autres ». */
const blocDe = (u) => {
  const m = String(u.ue_niv || '').match(/\d+/);
  return m ? `BA${m[0]}` : 'Autres';
};
const NOM_BLOC = { BA1: 'Bloc 1', BA2: 'Bloc 2', BA3: 'Bloc 3', Autres: 'Hors bloc' };
const ORDRE_BLOC = ['BA1', 'BA2', 'BA3', 'Autres'];

/**
 * UNE UNITÉ EST « HELB » QUAND ELLE N'EST PORTÉE QUE PAR LA HAUTE ÉCOLE.
 * Ce n'est pas une propriété de l'unité : c'est un constat sur qui la donne
 * cette année-là. Il se refait donc à chaque édition, et ne se stocke pas.
 */
const contratDe = (u) => (u.etp_helb > 0 && u.etp_iip <= 0 ? 'HELB' : 'IIP');
const periodesDe = (u) => (u.per_ct || 0) + (u.per_pp || 0)
  + (u.per_ct_helb || 0) + (u.per_pp_helb || 0);

/** La section demandée, ou la première — un rapport de cursus en vise un. */
function cursus(p) {
  const d = calculerEtp(p.annee);
  const voulue = p.section || p.portee?.section;
  const sec = voulue
    ? (d.sections || []).find(s => s.section === voulue)
    : (d.sections || [])[0];
  if (!sec) {
    throw new Error(voulue
      ? `Aucune charge ETP pour la section « ${voulue} » en ${p.annee}.`
      : `Aucune charge ETP en ${p.annee}.`);
  }
  return { d, sec: filtrerTc(sec, p) };
}

/**
 * LE TRONC COMMUN EST UNE QUESTION, PAS UNE DÉCORATION.
 *
 * « Ce que coûte le tronc commun » et « ce que coûte le reste » sont deux
 * chiffres qu'on demande séparément : le premier se mutualise entre cursus,
 * le second est propre à la section. Sans ce filtre, il fallait sortir la
 * grille entière et recompter à la main — et deux personnes ne trouvaient pas
 * le même total.
 *
 * Le filtre porte sur l'UNITÉ (la marque est à ce niveau) et vaut donc pour
 * toutes les échelles qui en agrègent.
 */
export function gardeTc(u, tc) {
  if (tc !== 'tc' && tc !== 'hors') return true;
  const est = String(u?.ue_tc || '').trim().toLowerCase() === 'x';
  return tc === 'tc' ? est : !est;
}

/** Le même filtre, appliqué à toutes les sections d'un calcul d'établissement. */
function restreindreTc(d, p) {
  const tc = p.portee?.tc || p.tc;
  if (tc !== 'tc' && tc !== 'hors') return d;
  const somme = (ues, f) => ues.reduce((n, u) => n + (Number(f(u)) || 0), 0);
  const sections = (d.sections || []).map(s => {
    const ues = (s.ues || []).filter(u => gardeTc(u, tc));
    return { ...s, ues,
      etp_total: somme(ues, u => u.etp_total),
      etp_iip:   somme(ues, u => u.etp_iip),
      etp_helb:  somme(ues, u => u.etp_helb) };
  }).filter(s => s.ues.length);
  if (!sections.length) {
    throw new Error(`Aucune unité ${tc === 'tc' ? 'du' : 'hors'} tronc commun en ${p.annee}.`);
  }
  return { ...d, sections,
    total: { ...(d.total || {}),
      etp_total: somme(sections, s => s.etp_total),
      etp_iip:   somme(sections, s => s.etp_iip),
      etp_helb:  somme(sections, s => s.etp_helb) } };
}

function filtrerTc(sec, p) {
  const tc = p.portee?.tc || p.tc;
  if (tc !== 'tc' && tc !== 'hors') return sec;
  const ues = (sec.ues || []).filter(u => gardeTc(u, tc));
  if (!ues.length) {
    throw new Error(tc === 'tc'
      ? `Aucune unité du tronc commun dans « ${sec.section} » en ${p.annee}.`
      : `Aucune unité hors tronc commun dans « ${sec.section} » en ${p.annee}.`);
  }
  // Les totaux de la section sont RECALCULÉS sur le sous-ensemble : garder
  // ceux de la section entière ferait mentir chaque tuile.
  const somme = (f) => ues.reduce((n, u) => n + (Number(f(u)) || 0), 0);
  return { ...sec, ues,
    etp_total: somme(u => u.etp_total),
    etp_iip:   somme(u => u.etp_iip),
    etp_helb:  somme(u => u.etp_helb) };
}

/*
 * ── LA PORTÉE ────────────────────────────────────────────────────────────
 *
 * Quatre niveaux, du plus large au plus fin : l'établissement, une section,
 * une unité, un cours. Ils ne changent pas la question — « ce que coûte
 * l'enseignement » — mais l'échelle à laquelle on la pose, et donc ce qu'il
 * faut montrer : à l'établissement on compare des sections, dans une section
 * des blocs et des unités, dans une unité des cours, dans un cours des
 * personnes. LE DÉTAIL D'UN NIVEAU EST LE NIVEAU D'EN DESSOUS.
 */
const NIVEAUX = {
  etablissement: "Tout l'établissement",
  section: 'Une section', ue: 'Une unité', cours: 'Un cours',
};

/** Ce que le cours fait porter à qui — le niveau le plus fin. */
function attributionsDuCours(annee, ueNums, codeCours) {
  // UNE UNITÉ OU PLUSIEURS — la question ne change pas, l'échelle si. On
  // demandait « l'ETP de l'UE 286 » puis « celui de l'UE 290 » et l'on
  // additionnait à la main deux pièces qui ne se totalisaient nulle part.
  const liste = (Array.isArray(ueNums) ? ueNums : [ueNums])
    .map(n => Number(n)).filter(n => Number.isFinite(n));
  if (!liste.length) return [];
  const trous = liste.map(() => '?').join(',');
  return db.prepare(`
    SELECT professeur, code_cours, nom_cours, type_cours, contrat_mdp, section,
           ue_num, ue_nom,
           ROUND(SUM(total_attribue_professeur), 2) AS periodes
      FROM v_attribution_complete
     WHERE annee_scolaire = ? AND ue_num IN (${trous})
       AND (? IS NULL OR code_cours = ?) AND professeur IS NOT NULL
     GROUP BY professeur, ue_num, code_cours, nom_cours, type_cours, contrat_mdp
     ORDER BY ue_num, code_cours, professeur
  `).all(annee, ...liste, codeCours || null, codeCours || null);
}

/**
 * LES UNITÉS VISÉES PAR LA PORTÉE. Une, plusieurs, ou celles que le filtre
 * tronc commun retient — résolues UNE FOIS, ici, pour que la pièce et son
 * aperçu ne puissent pas travailler sur deux listes différentes.
 */
function unitesVisees(p) {
  const po = p.portee || {};
  let nums = Array.isArray(po.ue_nums) && po.ue_nums.length
    ? po.ue_nums : (po.ue_num ? [po.ue_num] : []);
  nums = nums.map(n => Number(n)).filter(n => Number.isFinite(n));
  const tc = po.tc || p.tc;
  if ((tc === 'tc' || tc === 'hors') && nums.length) {
    const trous = nums.map(() => '?').join(',');
    const marques = db.prepare(
      `SELECT ue_num, ue_tc FROM ue WHERE annee_scolaire = ? AND ue_num IN (${trous})`)
      .all(p.annee, ...nums);
    const gardees = new Set(marques.filter(u => gardeTc(u, tc)).map(u => Number(u.ue_num)));
    nums = nums.filter(n => gardees.has(n));
  }
  return nums;
}

/** L'ETP d'une ligne de charge : CT sur 800, PP sur 1000 — la règle maison. */
const etpDe = (l) => (l.type_cours === 'PP' ? (l.periodes || 0) / 1000
  : (l.periodes || 0) / 800);

/** L'aperçu : les mêmes unités que la pièce, à plat. */
function lignesEtpCursus(p) {
  const { sec } = cursus(p);
  return [...sec.ues]
    .sort((a, b) => (ORDRE_BLOC.indexOf(blocDe(a)) - ORDRE_BLOC.indexOf(blocDe(b)))
      || String(a.ue_num).localeCompare(String(b.ue_num), 'fr', { numeric: true }))
    .map(u => ({
      bloc: NOM_BLOC[blocDe(u)] || blocDe(u),
      ue_num: u.ue_num, ue_nom: u.ue_nom || '—',
      contrat: contratDe(u),
      per_ct: Math.round((u.per_ct || 0) + (u.per_ct_helb || 0)) || null,
      per_pp: Math.round((u.per_pp || 0) + (u.per_pp_helb || 0)) || null,
      periodes: Math.round(periodesDe(u)),
      etp: Math.round((u.etp_total || 0) * 10000) / 10000,
    }));
}

/**
 * L'AIGUILLAGE. Une seule entrée au catalogue, quatre pièces selon la portée —
 * et c'est l'utilisateur qui choisit, non le menu qui a décidé pour lui.
 */
function documentEtp(p) {
  const niveau = p.portee?.niveau || 'etablissement';
  if (niveau === 'section') return documentEtpCursus(p);
  if (niveau === 'ue' || niveau === 'cours') return documentEtpUe(p);
  return documentEtpEtablissement(p);
}

function lignesEtp(p) {
  const niveau = p.portee?.niveau || 'etablissement';
  if (niveau === 'section') return lignesEtpCursus(p);
  if (niveau === 'ue' || niveau === 'cours') {
    return attributionsDuCours(p.annee, unitesVisees(p), p.portee?.code_cours)
      .map(l => ({ ...l, etp: Math.round(etpDe(l) * 10000) / 10000 }));
  }
  const d = restreindreTc(calculerEtp(p.annee), p);
  return (d.sections || []).map(s => ({
    section: s.section, periodes: null, etp: s.etp_total,
    etp_iip: s.etp_iip, etp_helb: s.etp_helb, etudiants: s.nb_etudiants,
  }));
}

/**
 * TOUT L'ÉTABLISSEMENT — on y compare des SECTIONS, et rien d'autre. Le détail
 * unité par unité, à cette échelle, fait trois cents lignes que personne ne
 * lit : il est à un clic, au niveau du dessous.
 */
function documentEtpEtablissement(p) {
  // LE TRONC COMMUN SE DEMANDE AUSSI À L'ÉCHELLE DE LA MAISON — « ce que
  // coûte ce qu'on mutualise » est une question de dotation, pas de cursus.
  const d = restreindreTc(calculerEtp(p.annee), p);
  const C = couleurs();
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const n0 = n => Math.round(n || 0).toLocaleString('fr-BE');
  const n2 = n => (n || 0).toFixed(2).replace('.', ',');
  const secs = d.sections || [];
  const tot = d.total || {};
  const coord = secs.reduce((s, x) => s + (x.etp_coord_helb || 0), 0);
  const global = (tot.etp_total || 0) + coord;
  const etusLucie = secs.reduce((s, x) => s + (x.nb_etudiants || 0), 0);
  const etus = p.etudiants || etusLucie;
  const etusPose = !!p.etudiants && p.etudiants !== etusLucie;
  const ectsDe = (x) => (x.ues || []).reduce((t, u) => t + (Number(u.ects) || 0), 0);
  const ectsTot = secs.reduce((t, x) => t + ectsDe(x), 0);
  const ratio = (e) => (e > 0 && etus > 0 ? (etus / e).toFixed(1).replace('.', ',') : '—');

  const corps = `

    ${rangeeTuiles([
      tuile({ valeur: n2(global), unite: 'ETP', libelle: 'Charge globale',
        precision: `${secs.length} section(s)`, ton: 'fort' }),
      tuile({ valeur: n2(tot.etp_iip), unite: 'ETP', libelle: 'Institut',
        precision: global ? `${Math.round((tot.etp_iip || 0) / global * 100)} %` : '—',
        couleur: C.iip }),
      tuile({ valeur: n2((tot.etp_helb || 0) + coord), unite: 'ETP', libelle: 'Haute École',
        precision: global ? `${Math.round(((tot.etp_helb || 0) + coord) / global * 100)} %` : '—',
        couleur: C.helb }),
      tuile({ valeur: etus ? n0(etus) : '—', libelle: 'Étudiants',
        precision: etus
          ? `${ratio(global)} par ETP${etusPose ? ' · effectif posé' : ''}`
          : 'effectifs non encodés' }),
      tuile({ valeur: ectsTot ? n0(ectsTot) : '—', libelle: 'ECTS',
        precision: ectsTot && global > 0
          ? `${(ectsTot / global).toFixed(1).replace('.', ',')} par ETP` : 'non encodés' }),
    ])}

    <div class="cadre">
      <h2>De quoi la charge est faite</h2>
      ${barreParts([
        { nom: 'Institut', valeur: tot.etp_iip || 0, couleur: C.iip },
        { nom: 'Haute École', valeur: tot.etp_helb || 0, couleur: C.helb },
        ...(coord > 0 ? [{ nom: 'Coordination HELB', valeur: coord, couleur: C.helb, pale: true }] : []),
      ])}
    </div>

    <div class="cadre">
      <h2>Le poids de chaque section</h2>
      ${barres({ donnees: secs.map(x => ({
        nom: x.section, valeur: x.etp_total || 0, couleur: C.iip,
        texte: `${n2(x.etp_total)} ETP${
          global > 0 ? ` · ${Math.round((x.etp_total || 0) / global * 100)} %` : ''}`,
      })) })}
    </div>

    <h2>Section par section</h2>
    <table>
      <thead><tr><th>Section</th><th class="n" style="width:18mm">ECTS</th>
        <th class="n" style="width:20mm">ETP</th>
        <th class="n" style="width:20mm">Institut</th><th class="n" style="width:22mm">Haute École</th>
        <th class="n" style="width:20mm">Étudiants</th>
        <th class="n" style="width:24mm">Étu. par ETP</th></tr></thead>
      <tbody>${secs.map(x => `<tr>
        <td>${esc(x.section)}</td>
        <td class="n">${ectsDe(x) ? n0(ectsDe(x)) : '—'}</td>
        <td class="n g">${n2(x.etp_total)}</td>
        <td class="n">${n2(x.etp_iip)}</td><td class="n">${n2(x.etp_helb)}</td>
        <td class="n">${x.nb_etudiants ? n0(x.nb_etudiants) : '—'}</td>
        <td class="n">${x.nb_etudiants && x.etp_total > 0
          ? (x.nb_etudiants / x.etp_total).toFixed(1).replace('.', ',') : '—'}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr class="repere"><td>Ensemble</td>
        <td class="n">${ectsTot ? n0(ectsTot) : '—'}</td>
        <td class="n">${n2(tot.etp_total)}</td>
        <td class="n">${n2(tot.etp_iip)}</td><td class="n">${n2(tot.etp_helb)}</td>
        <td class="n">${etus ? n0(etus) : '—'}</td><td class="n">${ratio(tot.etp_total)}</td>
      </tr></tfoot>
    </table>`;

  return {
    corps,
    entete: {
      titre: "Charge en équivalents temps plein — tout l'établissement",
      sous: `Année académique ${p.annee} · ${secs.length} section(s)${
        etus ? ` · ${n0(etus)} étudiant(s)${etusPose ? ' (effectif posé)' : ''}` : ''}`,
      mention: etusPose
        ? `L'effectif de ${n0(etus)} étudiant(s) a été posé pour cette simulation ; `
          + `Lucie en compte ${n0(etusLucie)} d'inscrits à ce jour.` : null,
    },
    titre: "Charge en ETP — établissement",
    nom: `ETP-etablissement-${p.annee}.html`,
    styles: STYLE_RAPPORT + STYLE_REPORTING + STYLE_ETP,
  };
}

/**
 * UNE UNITÉ, OU UN DE SES COURS — le niveau où l'on voit enfin QUI porte la
 * charge. C'est la question qui vient toujours en séance, et à laquelle aucun
 * des quatre anciens rapports ne répondait.
 */
function documentEtpUe(p) {
  const C = couleurs();
  const nums = unitesVisees(p);
  const ueNum = nums[0];
  const plusieurs = nums.length > 1;
  const code = p.portee?.niveau === 'cours' ? p.portee?.code_cours : null;
  if (!nums.length) {
    const tc = p.portee?.tc;
    throw new Error(tc === 'tc' || tc === 'hors'
      ? `Aucune des unités choisies n'est ${tc === 'tc' ? 'du' : 'hors'} tronc commun.`
      : 'Choisissez au moins une unité.');
  }
  const lignes = attributionsDuCours(p.annee, nums, code);
  if (!lignes.length) {
    throw new Error(`Aucune attribution pour ${plusieurs
      ? `les ${nums.length} unités choisies` : `l'unité ${ueNum}`} en ${p.annee}.`);
  }
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const n0 = n => Math.round(n || 0).toLocaleString('fr-BE');
  const n2 = n => (n || 0).toFixed(2).replace('.', ',');
  const n4 = n => (n || 0).toFixed(4).replace('.', ',');

  // L'IDENTITÉ DE LA PIÈCE. Une unité parle d'elle-même ; plusieurs ne
  // peuvent emprunter le nom d'aucune — elles totalisent leurs ECTS et
  // nomment leurs sections, et l'effectif ne s'additionne PAS (un étudiant
  // inscrit à trois unités serait compté trois fois).
  const trous = nums.map(() => '?').join(',');
  const ueLignes = db.prepare(
    `SELECT ue_num, ue_nom, section, ects, nb_etudiants, ue_tc
       FROM ue WHERE annee_scolaire = ? AND ue_num IN (${trous})
      ORDER BY ue_num`).all(p.annee, ...nums);
  const ue = plusieurs
    ? { ue_nom: `${nums.length} unités`,
        section: [...new Set(ueLignes.map(u => u.section).filter(Boolean))].join(', '),
        ects: ueLignes.reduce((n, u) => n + (Number(u.ects) || 0), 0) || null,
        nb_etudiants: null }
    : (ueLignes[0] || {});
  const per = lignes.reduce((s, l) => s + (l.periodes || 0), 0);
  const etp = lignes.reduce((s, l) => s + etpDe(l), 0);
  const etpIip = lignes.filter(l => (l.contrat_mdp || 'IIP') === 'IIP')
    .reduce((s, l) => s + etpDe(l), 0);
  const profs = new Set(lignes.map(l => l.professeur)).size;

  // Par cours quand on regarde l'unité ; par personne quand on regarde un cours.
  const parCours = new Map();
  for (const l of lignes) {
    const k = plusieurs ? `UE ${l.ue_num}` : (l.code_cours || '—');
    if (!parCours.has(k)) {
      parCours.set(k, { nom: plusieurs ? l.ue_nom : l.nom_cours, periodes: 0, etp: 0 });
    }
    const g = parCours.get(k);
    g.periodes += l.periodes || 0; g.etp += etpDe(l);
  }

  const corps = `

    ${rangeeTuiles([
      tuile({ valeur: n4(etp), unite: 'ETP', libelle: 'Charge', ton: 'fort',
        precision: `${n0(per)} périodes` }),
      tuile({ valeur: n2(etpIip), unite: 'ETP', libelle: 'Institut',
        precision: etp > 0 ? `${Math.round(etpIip / etp * 100)} %` : '—', couleur: C.iip }),
      tuile({ valeur: n2(etp - etpIip), unite: 'ETP', libelle: 'Haute École',
        precision: etp > 0 ? `${Math.round((etp - etpIip) / etp * 100)} %` : '—', couleur: C.helb }),
      tuile({ valeur: profs, libelle: profs > 1 ? 'Enseignants' : 'Enseignant',
        precision: (p.etudiants || ue.nb_etudiants)
          ? `${n0(p.etudiants || ue.nb_etudiants)} étudiant(s)${
              p.etudiants ? ' (posé)' : ''}` : null }),
      tuile({ valeur: ue.ects ? n0(ue.ects) : '—', libelle: 'ECTS',
        precision: ue.ects && etp > 0
          ? `${(Number(ue.ects) / etp).toFixed(1).replace('.', ',')} par ETP` : 'non encodés' }),
    ])}

    ${parCours.size > 1 ? `<div class="cadre">
      <h2>Le poids de chaque ${plusieurs ? 'unité' : 'cours'}</h2>
      ${barres({ donnees: [...parCours.entries()].map(([k, v]) => ({
        nom: k, valeur: v.etp, couleur: C.iip,
        texte: `${n0(v.periodes)} pér. · ${n4(v.etp)} ETP`,
      })) })}
    </div>` : ''}

    <h2>Qui porte cette charge</h2>
    <table>
      <thead><tr>${plusieurs ? '<th style="width:14mm">UE</th>' : ''}
        <th>Enseignant</th><th style="width:18mm">Cours</th>
        <th>Intitulé</th><th style="width:12mm">Type</th><th style="width:16mm">Contrat</th>
        <th class="n" style="width:22mm">Périodes</th><th class="n" style="width:20mm">ETP</th>
      </tr></thead>
      <tbody>${lignes.map(l => `<tr>
        ${plusieurs ? `<td class="ue">${esc(l.ue_num)}</td>` : ''}
        <td>${esc(l.professeur)}</td><td class="ue">${esc(l.code_cours || '—')}</td>
        <td>${esc(l.nom_cours || '—')}</td><td>${esc(l.type_cours || '')}</td>
        <td>${(l.contrat_mdp || 'IIP') === 'IIP' ? ''
          : `<span class="marque" style="background:${C.helb}">HELB</span>`}</td>
        <td class="n">${n0(l.periodes)}</td><td class="n g">${n4(etpDe(l))}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr class="repere"><td colspan="${plusieurs ? 6 : 5}">Ensemble</td>
        <td class="n">${n0(per)}</td><td class="n">${n4(etp)}</td></tr></tfoot>
    </table>`;

  const quoi = code ? `cours ${code}`
    : plusieurs ? `${nums.length} unités` : `UE ${ueNum}`;
  const mentionTc = p.portee?.tc === 'tc' ? 'tronc commun'
    : p.portee?.tc === 'hors' ? 'hors tronc commun' : null;
  return {
    corps,
    entete: {
      titre: `Charge en équivalents temps plein — ${quoi}`,
      // LA RESTRICTION SE LIT SUR LA PIÈCE. Un total filtré qui ne dit pas
      // qu'il l'est se retrouve, trois mois plus tard, comparé à un total
      // complet — et c'est le logiciel qu'on accuse.
      sous: [plusieurs ? nums.map(n => `UE ${n}`).join(', ') : ue.ue_nom,
        ue.section, mentionTc, `année ${p.annee}`].filter(Boolean).join(' · '),
    },
    titre: `Charge en ETP — ${quoi}`,
    nom: `ETP-${code || (plusieurs ? `${nums.length}UE` : `UE${ueNum}`)}-${p.annee}.html`,
    styles: STYLE_RAPPORT + STYLE_REPORTING + STYLE_ETP,
  };
}

/** La pièce elle-même : blocs, sous-totaux, parts et ratios. */
function documentEtpCursus(p) {
  const { sec } = cursus(p);
  // LA MÊME COULEUR QU'À L'ÉCRAN. HELB est rose dans Attributions et dans
  // Référentiels : elle doit l'être ici. Une pièce qui repeint ce que
  // l'utilisateur voit tous les jours lui demande de traduire.
  const C = couleurs();
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const n0 = n => Math.round(n || 0).toLocaleString('fr-BE').replace(/ /g, ' ');
  const n2 = n => (n || 0).toFixed(2).replace('.', ',');
  const n4 = n => (n || 0).toFixed(4).replace('.', ',');

  const parBloc = new Map();
  for (const u of sec.ues) {
    const b = blocDe(u);
    if (!parBloc.has(b)) parBloc.set(b, []);
    parBloc.get(b).push(u);
  }
  const blocs = [...parBloc.keys()].sort(
    (a, b) => ORDRE_BLOC.indexOf(a) - ORDRE_BLOC.indexOf(b));

  let corpsBlocs = '';
  for (const b of blocs) {
    const ues = parBloc.get(b).sort((x, y) =>
      String(x.ue_num).localeCompare(String(y.ue_num), 'fr', { numeric: true }));
    let tPer = 0, tEtp = 0, iPer = 0, iEtp = 0, hPer = 0, hEtp = 0, tEcts = 0;
    const lignes = ues.map(u => {
      const per = periodesDe(u), c = contratDe(u);
      tPer += per; tEtp += u.etp_total || 0; tEcts += Number(u.ects) || 0;
      if (c === 'IIP') { iPer += per; iEtp += u.etp_total || 0; }
      else { hPer += per; hEtp += u.etp_total || 0; }
      const ct = Math.round((u.per_ct || 0) + (u.per_ct_helb || 0));
      const pp = Math.round((u.per_pp || 0) + (u.per_pp_helb || 0));
      return `<tr>
        <td class="ue">${esc(u.ue_num)}</td>
        <td>${esc(u.ue_nom || '—')}</td>
        <td>${c === 'IIP' ? '' : `<span class="marque" style="background:${C.helb}">HELB</span>`}</td>
        <td class="n">${u.ects ? esc(u.ects) : ''}</td>
        <td class="n">${ct ? n0(ct) : ''}</td>
        <td class="n">${pp ? n0(pp) : ''}</td>
        <td class="n">${n0(per)}</td>
        <td class="n g">${n4(u.etp_total)}</td>
      </tr>`;
    }).join('');

    // « dont HELB » ne s'affiche que s'il y a du HELB : une ligne à zéro
    // n'informe de rien et allonge la page.
    const dont = (lib, per, etp) => (etp > 0 ? `<tr class="dont">
      <td colspan="6">dont ${lib}</td><td class="n">${n0(per)}</td><td class="n">${n4(etp)}</td></tr>` : '');

    corpsBlocs += `
      <h3>${esc(NOM_BLOC[b] || b)} <span class="sous">— ${ues.length} unité(s)</span></h3>
      <table>
        <thead><tr>
          <th style="width:12mm">UE</th><th>Intitulé</th><th style="width:16mm">Contrat</th>
          <th class="n" style="width:14mm">ECTS</th>
          <th class="n" style="width:18mm">Pér. CT</th><th class="n" style="width:18mm">Pér. PP</th>
          <th class="n" style="width:20mm">Périodes</th><th class="n" style="width:20mm">ETP</th>
        </tr></thead>
        <tbody>${lignes}</tbody>
        <tfoot>
          ${dont('IIP', iPer, iEtp)}${dont('HELB', hPer, hEtp)}
          <tr class="repere"><td colspan="3">Sous-total ${esc(NOM_BLOC[b] || b)}</td>
            <td class="n">${tEcts ? n0(tEcts) : ''}</td><td class="n"></td><td class="n"></td>
            <td class="n">${n0(tPer)}</td><td class="n">${n4(tEtp)}</td></tr>
        </tfoot>
      </table>`;
  }

  /* LES ECTS SONT LA MONNAIE DU CURSUS. Une charge en ETP ne dit rien de ce
     que l'étudiant valide : c'est le rapprochement des deux qui parle — ce
     qu'une section coûte, et ce qu'elle délivre. */
  const ects = sec.ues.reduce((t, u) => t + (Number(u.ects) || 0), 0);
  const etpCours = sec.etp_total || 0;
  const etpCoord = sec.etp_coord_helb || 0;
  const etpSecr = sec.etp_secretariat || 0;
  const global = etpCours + etpCoord;
  const etusLucie = sec.nb_etudiants || 0;
  const etus = p.etudiants || etusLucie;
  const etusPose = !!p.etudiants && p.etudiants !== etusLucie;
  const perTot = sec.ues.reduce((s, u) => s + periodesDe(u), 0);
  const ratio = (e) => (e > 0 && etus > 0 ? (etus / e).toFixed(1).replace('.', ',') : '—');
  const part = (e) => (global > 0 ? `${Math.round(e / global * 100)} %` : '—');

  const corps = `

    ${rangeeTuiles([
      tuile({ valeur: n2(global), unite: 'ETP', libelle: 'Charge globale',
        precision: `${n0(perTot)} périodes de cours`, ton: 'fort' }),
      tuile({ valeur: n2(sec.etp_iip), unite: 'ETP', libelle: 'Institut',
        precision: part(sec.etp_iip), couleur: C.iip }),
      tuile({ valeur: n2(sec.etp_helb + etpCoord), unite: 'ETP', libelle: 'Haute École',
        precision: `${part(sec.etp_helb + etpCoord)}${etpCoord > 0
          ? ` · dont ${n2(etpCoord)} de coordination` : ''}`, couleur: C.helb }),
      tuile({ valeur: etus ? n0(etus) : '—', libelle: 'Étudiants',
        precision: etus
          ? `${ratio(global)} par ETP${etusPose ? ' · effectif posé' : ''}`
          : 'effectifs non encodés' }),
      tuile({ valeur: ects ? n0(ects) : '—', libelle: 'ECTS',
        precision: ects && global > 0
          ? `${(ects / global).toFixed(1).replace('.', ',')} par ETP` : 'non encodés' }),
    ])}

    <div class="cadre">
      <h2>De quoi la charge est faite</h2>
      ${barreParts([
        { nom: 'Institut', valeur: sec.etp_iip || 0, couleur: C.iip },
        { nom: 'Haute École', valeur: sec.etp_helb || 0, couleur: C.helb },
        ...(etpCoord > 0
          ? [{ nom: 'Coordination HELB', valeur: etpCoord, couleur: C.helb, pale: true }] : []),
      ])}
    </div>

    ${blocs.length > 1 ? `<div class="cadre">
      <h2>Le poids de chaque bloc</h2>
      ${barres({
        donnees: blocs.map(b => {
          const e = parBloc.get(b).reduce((s, u) => s + (u.etp_total || 0), 0);
          return { nom: NOM_BLOC[b] || b, valeur: e, couleur: C.iip,
            texte: `${n2(e)} ETP${global > 0 ? ` · ${Math.round(e / global * 100)} %` : ''}` };
        }),
      })}
    </div>` : ''}

    ${etpSecr > 0 ? `<p class="fin">S'y ajoute la quote-part de secrétariat
      étudiant : ${n2(etpSecr)} ETP, soit ${ratio(etpSecr)} étudiant(s) par ETP.</p>` : ''}

    <h2>Le détail par bloc</h2>
    ${corpsBlocs}

    <p class="ref">${sec.ues.length} unité(s) · ${ects ? `${n0(ects)} ECTS · ` : ''}${
      n0(perTot)} périodes · ${n4(etpCours)} ETP de cours · année ${esc(p.annee)}</p>`;

  return {
    corps,
    entete: {
      titre: `Charge en équivalents temps plein — ${sec.section}`
        + (p.portee?.tc === 'tc' ? ' · tronc commun'
          : p.portee?.tc === 'hors' ? ' · hors tronc commun' : ''),
      // UN TOTAL FILTRÉ LE DIT. Sans cette mention, la pièce se compare trois
      // mois plus tard à un total complet, et c'est le logiciel qu'on accuse.
      sous: `Année académique ${p.annee}${etus > 0
        ? ` · ${n0(etus)} étudiant(s)${etusPose ? ' (effectif posé)' : ' inscrits'}` : ''}${
        p.portee?.tc === 'tc' ? ' · unités du tronc commun uniquement'
          : p.portee?.tc === 'hors' ? ' · unités hors tronc commun uniquement' : ''}`,
      mention: "Pièce destinée au COPIL ou au Conseil d'administration. Elle reflète "
        + "l'état des attributions encodées, et non un arrêté de dotation."
        + (etusPose
          ? ` L'effectif de ${n0(etus)} étudiant(s) a été POSÉ pour cette simulation ; `
            + `Lucie en compte ${n0(etusLucie)} d'inscrits à ce jour.`
          : ''),
    },
    titre: `Rapport de charge ETP — ${sec.section}`,
    nom: `ETP-${String(sec.section).replace(/\W+/g, '-')}-${p.annee}.html`,
    orientation: 'portrait',
    // La colonne des ETP est celle qu'on lit : elle se distingue par la
    // graisse, non par une couleur — et le bloc par un filet, non un bandeau.
    styles: STYLE_RAPPORT + STYLE_REPORTING + STYLE_ETP,
  };
}

export const RAPPORTS = [
  // ── PILOTAGE ────────────────────────────────────────────────────────────
  /*
   * ── UN SEUL RAPPORT ETP, ET UNE PORTÉE ────────────────────────────────
   *
   * Il y en avait quatre : par section, par unité, par établissement
   * référent, et le rapport de cursus. Quatre entrées de menu pour UNE
   * question — « ce que coûte l'enseignement » — posée à quatre échelles.
   * L'utilisateur devait deviner laquelle répondait à la sienne, et les
   * quatre se présentaient différemment.
   *
   * Tout l'intérêt d'un logiciel de gestion est de MONTRER LES DONNÉES QU'ON
   * CHOISIT. On choisit donc le rapport une fois, puis on descend : tout
   * l'établissement, une section, une unité, un cours. La pièce s'adapte —
   * les tuiles disent ce qui compte à ce niveau-là, le graphique compare ce
   * qui est comparable à ce niveau-là, et le détail est celui du niveau
   * d'en dessous.
   */
  {
    id: 'resultats-section', domaine: 'pilotage', params: ['annee', 'session'],
    libelle: 'Résultats de délibération par unité',
    aide: "Réussites, ajournements et refus POUR LA SESSION CHOISIE — non l'état de l'année.",
    colonnes: COLS([['section', 'Section', 24], ['ue_num', 'UE', 8],
      ['ue_nom', 'Intitulé', 40], ['inscrits', 'Inscrits'],
      ['reussi', 'Réussites'], ['ajourne', 'Ajournements'], ['refuse', 'Refus'],
      ['sans', 'Sans décision'], ['taux', 'Taux de réussite', 16]]),
    lignes: (p) => {
      const ues = db.prepare(`SELECT ue_num, ue_nom, section FROM ue
        WHERE annee_scolaire = ? ORDER BY section, ue_num`).all(p.annee);
      return ues.map(u => {
        const inscrits = db.prepare(`SELECT etudiant_id FROM etudiant_inscription
          WHERE annee_scolaire = ? AND ue_num = ?`).all(p.annee, u.ue_num);
        const c = { reussi: 0, ajourne: 0, refuse: 0, sans: 0 };
        for (const i of inscrits) {
          const d = decisionDeSession(i.etudiant_id, u.ue_num, p.annee, p.session);
          if (d.resultat === 'reussi') c.reussi++;
          else if (d.resultat === 'ajourne') c.ajourne++;
          else if (d.resultat === 'refuse') c.refuse++;
          else c.sans++;
        }
        const decides = c.reussi + c.ajourne + c.refuse;
        return {
          ...u, inscrits: inscrits.length, ...c,
          // Le taux se calcule sur les DÉLIBÉRÉS : rapporté aux inscrits, il
          // ferait passer pour des échecs ceux que la séance n'a pas jugés.
          taux: decides ? Math.round((c.reussi / decides) * 1000) / 10 : null,
        };
      }).filter(l => l.inscrits > 0);
    },
  },
  {
    id: 'dotation-emploi', domaine: 'pilotage', params: ['annee'],
    libelle: "Emploi de la dotation par section",
    aide: "Ce qui est organisé, ce qui est attribué, et l'écart entre les deux.",
    colonnes: COLS([['section', 'Section', 28],
      ['organisees', 'Périodes organisées'], ['attribuees', 'Périodes attribuées'],
      ['ecart', 'Écart'], ['cout_dotation', 'Coût dotation'], ['cout_helb', 'Coût HELB']]),
    lignes: (p) => db.prepare(`
      SELECT section,
        ROUND(SUM(total_periodes_organisees), 2) AS organisees,
        ROUND(SUM(total_attribue_professeur), 2) AS attribuees,
        ROUND(SUM(total_periodes_organisees) - SUM(total_attribue_professeur), 2) AS ecart,
        ROUND(SUM(cout_dotation), 2) AS cout_dotation,
        ROUND(SUM(cout_helb), 2) AS cout_helb
      FROM v_attribution_complete WHERE annee_scolaire = ?
      GROUP BY section ORDER BY section`).all(p.annee),
  },

  // ── PERSONNEL ───────────────────────────────────────────────────────────
  {
    id: 'personnel-liste', domaine: 'personnel', params: ['annee'],
    libelle: 'Membres du personnel et leur charge',
    aide: "Statut, contrat, charge totale et ETP, toutes sections confondues.",
    colonnes: COLS([['nom', 'Nom', 22], ['prenom', 'Prénom', 18],
      ['statut', 'Statut', 12], ['contrat_mdp', 'Référent', 12],
      ['sections', 'Sections', 30], ['periodes', 'Périodes'], ['etp', 'ETP', 10],
      ['adresse_mail', 'Adresse électronique', 32]]),
    lignes: (p) => db.prepare(`
      SELECT pr.nom, pr.prenom, pr.statut, pr.adresse_mail,
        v.contrat_mdp,
        GROUP_CONCAT(DISTINCT v.section) AS sections,
        ROUND(SUM(v.total_attribue_professeur), 2) AS periodes,
        ROUND(SUM(v.total_attribue_professeur) / 800.0, 3) AS etp
      FROM v_attribution_complete v
      JOIN professeur pr ON pr.nom_prenom = v.professeur
      WHERE v.annee_scolaire = ?
      GROUP BY pr.id ORDER BY pr.nom, pr.prenom`).all(p.annee),
  },
  {
    id: 'personnel-temporaires', domaine: 'personnel', params: ['annee'],
    libelle: 'Temporaires et ancienneté',
    aide: "Les membres du personnel non définitifs, avec leur ancienneté de service.",
    colonnes: COLS([['nom', 'Nom', 22], ['prenom', 'Prénom', 18],
      ['statut', 'Statut', 12],
      ['annees_service', 'Années de service', 18],
      ['premiere_annee', 'Première année', 16],
      ['periodes_service', 'Périodes de service cumulées', 26],
      ['periodes', 'Périodes cette année'],
      ['adresse_mail', 'Adresse électronique', 32]]),
    lignes: (p) => {
      const l = db.prepare(`
        SELECT pr.id, pr.nom, pr.prenom, pr.statut, pr.adresse_mail,
          ROUND(SUM(v.total_attribue_professeur), 2) AS periodes
        FROM professeur pr
        LEFT JOIN v_attribution_complete v
          ON v.professeur = pr.nom_prenom AND v.annee_scolaire = ?
        WHERE UPPER(COALESCE(pr.statut, '')) <> 'MDP'
        GROUP BY pr.id ORDER BY pr.nom, pr.prenom`).all(p.annee);
      /**
       * L'ANCIENNETÉ SE COMPTE EN SERVICES, NON EN JOURS.
       *
       * « anciennete_service » ne porte pas de durée : elle enregistre les
       * périodes prestées par cours et par année scolaire. On rend donc le
       * nombre d'années où un service a été enregistré et le cumul des
       * périodes — ce que la table sait réellement dire. Convertir en jours
       * supposerait une règle de valorisation que ce module n'a pas à
       * inventer : elle relève du statut, non d'un rapport.
       */
      return l.map(x => {
        let a2 = { n: null, debut: null, per: null };
        try {
          a2 = db.prepare(`SELECT COUNT(DISTINCT annee_scolaire) AS n,
              MIN(annee_scolaire) AS debut, SUM(periodes) AS per
            FROM anciennete_service WHERE professeur_id = ?`).get(x.id) || a2;
        } catch { /* table absente : les colonnes restent vides */ }
        return {
          ...x,
          annees_service: a2.n || null,
          premiere_annee: a2.debut || null,
          periodes_service: a2.per || null,
          periodes: x.periodes,
        };
      });
    },
  },
  {
    id: 'personnel-attributions', domaine: 'personnel', params: ['annee'],
    libelle: 'Attributions par professeur',
    aide: "Le détail ligne à ligne : quelle unité, quel cours, combien de périodes.",
    colonnes: COLS([['professeur', 'Professeur', 26], ['section', 'Section', 22],
      ['ue_num', 'UE', 8], ['ue_nom', 'Unité', 36], ['code_cours', 'Cours', 12],
      ['nom_cours', 'Intitulé du cours', 36],
      ['total_attribue_professeur', 'Périodes'], ['contrat_mdp', 'Référent', 12]]),
    lignes: (p) => db.prepare(`
      SELECT professeur, section, ue_num, ue_nom, code_cours, nom_cours,
        ROUND(total_attribue_professeur, 2) AS total_attribue_professeur, contrat_mdp
      FROM v_attribution_complete WHERE annee_scolaire = ?
      ORDER BY professeur, section, ue_num, code_cours`).all(p.annee),
  },

  /*
   * ── LE RAPPORT DE CHARGE ETP D'UN CURSUS ──────────────────────────────
   *
   * C'est LA pièce du COPIL et du Conseil d'administration : ce que coûte une
   * section en équivalents temps plein, unité par unité, bloc par bloc, et
   * combien d'étudiants chaque ETP porte.
   *
   * Elle existait — et elle se fabriquait DANS LE NAVIGATEUR, avec sa propre
   * page A4, ses propres marges, un en-tête en aplat marine, des bandeaux
   * turquoise par bloc, des pastilles violettes, une rayure une ligne sur
   * deux, et pas de pied de page. C'était la dixième enveloppe, et la seule à
   * ne pas porter l'identité de l'établissement. Elle est donc ici, dans celle
   * de la maison — et sa lecture y gagne : ce qui distingue IIP de HELB est un
   * mot, non une couleur ; ce qui sépare les blocs est un filet, non un
   * bandeau. Les chiffres, eux, sont les mêmes, au même calcul.
   */
  {
    id: 'etp', domaine: 'pilotage', params: ['annee', 'portee', 'etudiants'],
    libelle: 'Charge en ETP',
    aide: "Tout l'établissement, une section, une unité ou un cours — la pièce s'adapte à la portée choisie.",
    // La portée descend jusqu'au cours : c'est le niveau où l'on voit enfin
    // QUI porte la charge, et c'est la question qui vient toujours en séance.
    portees: ['etablissement', 'section', 'ue', 'cours'],
    // Ce rapport n'est pas un tableau de lignes : il ne sort pas en tableur.
    // Les colonnes servent à l'aperçu, qui montre ce que la pièce contiendra.
    colonnes: COLS([['bloc', 'Bloc', 14], ['ue_num', 'UE', 8], ['ue_nom', 'Intitulé', 44],
      ['contrat', 'Contrat', 12], ['per_ct', 'Périodes CT'], ['per_pp', 'Périodes PP'],
      ['periodes', 'Périodes'], ['etp', 'ETP', 10]]),
    lignes: (p) => lignesEtp(p),
    document: (p) => documentEtp(p),
  },

  /*
   * ── CE QUI VIENT DU CONSTRUCTEUR DE LISTES ────────────────────────────
   *
   * Ces modèles existaient depuis longtemps, dans un écran à part : « profs
   * par section », « synthèse de charge », « UE sans attribution ». En
   * supprimant l'axe qui les portait, on a écrit qu'ils étaient « dans le
   * centre d'impression » — ils n'y avaient jamais été portés, et ils sont
   * restés un an derrière une porte fermée.
   *
   * Ils y sont maintenant, et ils y gagnent : aperçu avant téléchargement,
   * tableur ET pièce imprimable dans l'enveloppe de la maison, le tout sans
   * un écran de plus. LE CATALOGUE EST LA SEULE PORTE.
   */
  {
    id: 'personnel-par-section', domaine: 'personnel', params: ['annee', 'section'],
    libelle: 'Professeurs par section',
    aide: "Qui enseigne dans un cursus, sur combien d'unités, pour combien de périodes.",
    colonnes: COLS([['section', 'Section', 26], ['nom', 'Nom', 22],
      ['prenom', 'Prénom', 18], ['statut', 'Statut', 12],
      ['nb_ue', 'Unités', 10], ['nb_cours', 'Cours', 10],
      ['periodes', 'Périodes'], ['etp', 'ETP', 10],
      ['adresse_mail', 'Adresse électronique', 32]]),
    lignes: (p) => db.prepare(`
      SELECT v.section, pr.nom, pr.prenom, pr.statut, pr.adresse_mail,
        COUNT(DISTINCT v.ue_num) AS nb_ue,
        COUNT(DISTINCT v.code_cours) AS nb_cours,
        ROUND(SUM(v.total_attribue_professeur), 2) AS periodes,
        ROUND(SUM(v.total_attribue_professeur) / 800.0, 3) AS etp
      FROM v_attribution_complete v
      JOIN professeur pr ON pr.nom_prenom = v.professeur
      WHERE v.annee_scolaire = ? AND (? IS NULL OR v.section = ?)
      GROUP BY v.section, pr.id
      ORDER BY v.section, pr.nom, pr.prenom`).all(p.annee, p.section, p.section),
  },
  {
    id: 'personnel-charge', domaine: 'personnel', params: ['annee', 'section'],
    libelle: 'Synthèse de charge par professeur',
    aide: "Une ligne par professeur et par section : nombre de cours, périodes et heures.",
    colonnes: COLS([['professeur', 'Professeur', 26], ['section', 'Section', 26],
      ['nb_cours', 'Cours', 10], ['periodes', 'Périodes'],
      ['heures', 'Heures', 12], ['etp', 'ETP', 10]]),
    // LA PÉRIODE FAIT CINQUANTE MINUTES : les heures se déduisent, elles ne se
    // saisissent pas — et c'est en heures que se lit un contrat.
    lignes: (p) => db.prepare(`
      SELECT professeur, section,
        COUNT(DISTINCT code_cours) AS nb_cours,
        ROUND(SUM(total_attribue_professeur), 2) AS periodes,
        ROUND(SUM(total_attribue_professeur) * 50.0 / 60.0, 1) AS heures,
        ROUND(SUM(total_attribue_professeur) / 800.0, 3) AS etp
      FROM v_attribution_complete
      WHERE annee_scolaire = ? AND professeur IS NOT NULL
        AND (? IS NULL OR section = ?)
      GROUP BY professeur, section
      ORDER BY section, professeur`).all(p.annee, p.section, p.section),
  },
  {
    id: 'personnel-encadrement', domaine: 'personnel', params: ['annee', 'section'],
    libelle: 'Encadrements — TFE, stages, épreuves',
    aide: "Ce qui s'attribue hors cours : accompagnement, supervision, jurys.",
    colonnes: COLS([['section', 'Section', 26], ['professeur', 'Professeur', 26],
      ['nom_cours', 'Encadrement', 34], ['ue_num', 'UE', 8],
      ['ue_nom', 'Unité', 34], ['periodes', 'Périodes']]),
    lignes: (p) => db.prepare(`
      SELECT section, professeur, nom_cours, ue_num, ue_nom,
        ROUND(SUM(total_attribue_professeur), 2) AS periodes
      FROM v_attribution_complete
      WHERE annee_scolaire = ? AND professeur IS NOT NULL
        AND COALESCE(coordination_encadrement, '') <> ''
        AND (? IS NULL OR section = ?)
      GROUP BY section, professeur, nom_cours, ue_num, ue_nom
      ORDER BY section, professeur, ue_num`).all(p.annee, p.section, p.section),
  },

  // ── RÉFÉRENTIELS ────────────────────────────────────────────────────────
  {
    id: 'referentiel-ue', domaine: 'referentiels', params: ['annee'],
    libelle: 'Unités d’enseignement du référentiel',
    aide: "Code approuvé, niveau, périodes, déterminante, épreuve intégrée.",
    colonnes: COLS([['section', 'Section', 26], ['ue_num', 'UE', 8],
      ['ue_nom', 'Intitulé', 44], ['ue_code_fwb', 'Code approuvé', 18],
      ['ue_niv', 'Niveau', 10], ['ue_det', 'Déterminante', 14],
      ['is_epreuve_integree', 'Épreuve intégrée', 16], ['ects', 'ECTS', 8]]),
    lignes: (p) => db.prepare(`
      SELECT section, ue_num, ue_nom, ue_code_fwb, ue_niv,
        CASE WHEN ue_det = 'x' THEN 'oui' ELSE '' END AS ue_det,
        CASE WHEN COALESCE(is_epreuve_integree,0) = 1 THEN 'oui' ELSE '' END AS is_epreuve_integree,
        ects
      FROM ue WHERE annee_scolaire = ? ORDER BY section, ue_num`).all(p.annee),
  },
  {
    /* LA GRILLE DE COURS D'UNE SECTION — heures ET périodes.
       Elle sortait de l'ancien écran avec ses deux unités de compte, et c'est
       ce qui la rendait utile : le dossier pédagogique parle en PÉRIODES, un
       horaire et un contrat parlent en HEURES. Réduite aux seules périodes,
       elle obligeait à refaire la conversion à la main — cinquante fois. */
    id: 'referentiel-cours', domaine: 'referentiels', params: ['annee', 'section'],
    libelle: 'Grille de cours',
    aide: "Les cours de chaque unité, en périodes et en heures, avec les totaux par unité.",
    colonnes: COLS([['section', 'Section', 24], ['ue_num', 'UE', 8],
      ['ue_nom', 'Unité', 34], ['cours_code', 'Cours', 12],
      ['cours_nom', 'Intitulé', 38], ['type', 'Type', 8],
      ['quadri', 'Quadri', 8],
      ['periodes', 'Périodes'], ['heures', 'Heures'],
      ['autonomie', 'Autonomie']]),
    lignes: (p) => db.prepare(`
      SELECT u.section, c.ue_num, u.ue_nom, c.cours_code, c.cours_nom,
             c.ct_pp AS type, c.quadrimestre_cours AS quadri,
             c.cours_per AS periodes,
             -- UNE PÉRIODE FAIT CINQUANTE MINUTES. Quand les heures ne sont pas
             -- encodées, on les déduit plutôt que de laisser la colonne vide :
             -- la règle est connue, et une case vide se lit comme un zéro.
             COALESCE(c.heures, ROUND(c.cours_per * 50.0 / 60.0, 1)) AS heures,
             c.ue_autonomie AS autonomie
        FROM cours c
        LEFT JOIN ue u ON u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire
       WHERE c.annee_scolaire = ? AND (? IS NULL OR u.section = ? OR c.section = ?)
       ORDER BY u.section, c.ue_num, c.cours_code`)
      .all(p.annee, p.section, p.section, p.section),
  },
  {
    /* LA MÊME MATIÈRE, VUE PAR UNITÉ — ce que pèse une UE, d'un coup d'œil.
       C'est ce qu'on regarde pour décider d'ouvrir une unité, pas le détail
       cours par cours. */
    id: 'referentiel-poids-ue', domaine: 'referentiels', params: ['annee', 'section'],
    libelle: 'Poids des unités — périodes et heures',
    aide: "Une ligne par unité : nombre de cours, périodes, heures, autonomie et ECTS.",
    colonnes: COLS([['section', 'Section', 24], ['ue_num', 'UE', 8],
      ['ue_nom', 'Intitulé', 42], ['nb_cours', 'Cours', 10],
      ['periodes', 'Périodes'], ['heures', 'Heures'],
      ['autonomie', 'Autonomie'], ['ects', 'ECTS', 8]]),
    lignes: (p) => db.prepare(`
      SELECT u.section, u.ue_num, u.ue_nom, u.ects, u.ue_aut AS autonomie,
             COUNT(c.cours_code) AS nb_cours,
             SUM(c.cours_per) AS periodes,
             ROUND(SUM(COALESCE(c.heures, c.cours_per * 50.0 / 60.0)), 1) AS heures
        FROM ue u
        LEFT JOIN cours c ON c.ue_num = u.ue_num AND c.annee_scolaire = u.annee_scolaire
       WHERE u.annee_scolaire = ? AND (? IS NULL OR u.section = ?)
       GROUP BY u.section, u.ue_num, u.ue_nom, u.ects, u.ue_aut
       ORDER BY u.section, u.ue_num`).all(p.annee, p.section, p.section),
  },
  {
    id: 'grille-section', domaine: 'referentiels', params: ['annee', 'section'],
    libelle: 'Grille de section',
    aide: "La structure d'un cursus : blocs, unités, cours, avec périodes professeur, étudiant et autonomie.",
    colonnes: COLS([['ue_num', 'UE', 8], ['ue_nom', 'Unité', 44],
      ['cours_code', 'Cours', 14], ['cours_nom', 'Intitulé', 40],
      ['ct_pp', 'Type', 8], ['cours_per', 'Périodes']]),
    lignes: (p) => db.prepare(`
      SELECT c.ue_num, u.ue_nom, c.cours_code, c.cours_nom, c.ct_pp, c.cours_per
        FROM cours c LEFT JOIN ue u ON u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire
       WHERE c.annee_scolaire = ? AND (? IS NULL OR c.section = ?)
       ORDER BY c.ue_num, c.cours_code`).all(p.annee, p.section, p.section),
    document: (p) => documentGrilleSection(p),
  },
  {
    /* QUI DONNE QUOI DANS UNE UNITÉ — la liste « profs par UE » de l'ancien
       écran, celle qu'on imprime avant une réunion d'équipe d'unité. */
    id: 'referentiel-profs-ue', domaine: 'referentiels', params: ['annee', 'section'],
    libelle: 'Enseignants par unité',
    aide: "Qui donne quel cours dans quelle unité, et pour combien de périodes.",
    colonnes: COLS([['section', 'Section', 22], ['ue_num', 'UE', 8],
      ['ue_nom', 'Unité', 32], ['code_cours', 'Cours', 12],
      ['nom_cours', 'Intitulé', 32], ['professeur', 'Enseignant', 26],
      ['type_cours', 'Type', 8], ['periodes', 'Périodes']]),
    lignes: (p) => db.prepare(`
      SELECT section, ue_num, ue_nom, code_cours, nom_cours, professeur, type_cours,
             ROUND(SUM(total_attribue_professeur), 2) AS periodes
        FROM v_attribution_complete
       WHERE annee_scolaire = ? AND professeur IS NOT NULL
         AND (? IS NULL OR section = ?)
       GROUP BY section, ue_num, ue_nom, code_cours, nom_cours, professeur, type_cours
       ORDER BY section, ue_num, code_cours, professeur`)
      .all(p.annee, p.section, p.section),
  },
  {
    id: 'referentiel-acquis', domaine: 'referentiels', params: [],
    libelle: 'Acquis d’apprentissage',
    aide: "Les acquis de chaque unité, tels qu'ils figurent aux attestations.",
    colonnes: COLS([['ue_num', 'UE', 8], ['aa_code', 'Acquis', 14],
      ['description', 'Énoncé', 90]]),
    // La table « aa » ne porte PAS d'année : les acquis sont rattachés à
    // l'unité, non à un millésime. Filtrer sur l'année aurait échoué en
    // silence — ou plutôt bruyamment, ce qui vaut mieux.
    lignes: () => db.prepare(`
      SELECT ue_num, aa_code, description FROM aa
      ORDER BY ue_num, aa_code`).all(),
  },

  {
    id: 'referentiel-ue-sans-attribution', domaine: 'referentiels', params: ['annee', 'section'],
    libelle: 'Unités sans attribution',
    aide: "Ce qui est organisé mais que personne ne donne — à vérifier avant la rentrée.",
    colonnes: COLS([['section', 'Section', 26], ['ue_num', 'UE', 8],
      ['ue_nom', 'Intitulé', 44], ['ue_quad', 'Quadri', 10], ['ects', 'ECTS', 8]]),
    lignes: (p) => db.prepare(`
      SELECT u.section, u.ue_num, u.ue_nom, u.ue_quad, u.ects
      FROM ue u
      WHERE u.annee_scolaire = ? AND (? IS NULL OR u.section = ?)
        AND NOT EXISTS (SELECT 1 FROM v_attribution_complete v
                         WHERE v.annee_scolaire = u.annee_scolaire
                           AND v.ue_num = u.ue_num AND v.professeur IS NOT NULL)
      ORDER BY u.section, u.ue_num`).all(p.annee, p.section, p.section),
  },

  // ── ORGANISATION ────────────────────────────────────────────────────────
  {
    id: 'organisation-seances', domaine: 'organisation', params: ['annee'],
    libelle: 'Calendrier des délibérations',
    aide: "Dates de séance, visite des copies et seconde session, unité par unité.",
    colonnes: COLS([['section', 'Section', 24], ['ue_num', 'UE', 8],
      ['ue_nom', 'Unité', 36], ['session', 'Session', 10],
      ['date_seance', 'Délibération', 14], ['heure_seance', 'Heure', 10],
      ['visite_date', 'Visite des copies', 16], ['cloturee', 'Close', 10]]),
    lignes: (p) => db.prepare(`
      SELECT u.section, s.ue_num, u.ue_nom, s.session, s.date_seance, s.heure_seance,
        s.visite_date, CASE WHEN s.cloturee = 1 THEN 'oui' ELSE '' END AS cloturee
      FROM deliberation_seance s
      LEFT JOIN ue u ON u.ue_num = s.ue_num AND u.annee_scolaire = s.annee_scolaire
      WHERE s.annee_scolaire = ?
      ORDER BY u.section, s.ue_num, s.session`).all(p.annee),
  },
  {
    /* LES EFFECTIFS PAR UNITÉ — « étudiants par UE » de l'ancien écran. C'est
       le chiffre qu'on croise avec la charge pour décider d'un dédoublement,
       et celui que l'AEQES redemande section par section. */
    id: 'organisation-effectifs', domaine: 'organisation', params: ['annee', 'section'],
    libelle: 'Effectifs par unité',
    aide: "Inscrits par unité, avec la charge correspondante et le nombre d'étudiants par période.",
    colonnes: COLS([['section', 'Section', 24], ['ue_num', 'UE', 8],
      ['ue_nom', 'Intitulé', 40], ['ue_quad', 'Quadri', 10],
      ['etudiants', 'Inscrits'], ['periodes', 'Périodes attribuées'],
      ['par_periode', 'Étu. par période', 18]]),
    lignes: (p) => db.prepare(`
      SELECT u.section, u.ue_num, u.ue_nom, u.ue_quad,
             u.nb_etudiants AS etudiants,
             ROUND(COALESCE((SELECT SUM(v.total_attribue_professeur)
                               FROM v_attribution_complete v
                              WHERE v.annee_scolaire = u.annee_scolaire
                                AND v.ue_num = u.ue_num), 0), 2) AS periodes,
             CASE WHEN u.nb_etudiants > 0 THEN
               ROUND(u.nb_etudiants / NULLIF((SELECT SUM(v2.total_attribue_professeur)
                 FROM v_attribution_complete v2
                WHERE v2.annee_scolaire = u.annee_scolaire AND v2.ue_num = u.ue_num), 0), 2)
             END AS par_periode
        FROM ue u
       WHERE u.annee_scolaire = ? AND (? IS NULL OR u.section = ?)
       ORDER BY u.section, u.ue_num`).all(p.annee, p.section, p.section),
  },
  {
    id: 'organisation-locaux', domaine: 'organisation', params: [],
    libelle: 'Locaux de l’Institut',
    aide: "Type, capacité et équipements.",
    colonnes: COLS([['nom', 'Local', 18], ['type', 'Type', 26],
      ['places', 'Places'], ['equipements', 'Équipements', 44],
      ['actif', 'En service', 12]]),
    /**
     * DEUX DÉFINITIONS DE « local » COHABITENT dans le dépôt : celle du schéma
     * d'origine (« equipement », « micro », « son ») et celle des fondations
     * locaux (« equipements », « actif »). La base réelle porte la seconde,
     * mais une instance ancienne peut porter la première : on lit ce qui
     * existe plutôt que de supposer.
     */
    lignes: () => {
      const cols = new Set(db.prepare('PRAGMA table_info(local)').all().map(c => c.name));
      const eq = cols.has('equipements') ? 'equipements'
        : cols.has('equipement') ? 'equipement' : "''";
      const actif = cols.has('actif') ? "CASE WHEN actif = 1 THEN 'oui' ELSE 'non' END"
        : "'oui'";
      return db.prepare(`SELECT nom, type, places, ${eq} AS equipements,
        ${actif} AS actif FROM local ORDER BY type, nom`).all();
    },
  },
];

r.get('/catalogue', authRequired, (req, res) => {
  res.json({
    // « piece » dit à l'écran que ce rapport est une MISE EN PAGE et non un
    // tableau : le bouton « Tableur » n'a rien à y proposer, et un bouton qui
    // ne fait rien est pire qu'un bouton absent.
    rapports: RAPPORTS.map(({ id, domaine, libelle, aide, params, colonnes,
                             document, portees }) => ({
      id, domaine, libelle, aide, params, colonnes: colonnes.length,
      piece: !!document, portees: portees || null,
    })),
  });
});

/** Un aperçu à l'écran avant de télécharger : on voit ce qu'on emporte. */
r.post('/:id/apercu', authRequired, (req, res) => {
  const def = RAPPORTS.find(x => x.id === req.params.id);
  if (!def) return res.status(404).json({ error: 'rapport inconnu' });
  try {
    const p = parametres(req, def);
    const lignes = def.lignes(p);
    res.json({
      id: def.id, libelle: def.libelle, parametres: p,
      colonnes: def.colonnes, nb: lignes.length, lignes: lignes.slice(0, 50),
      tronque: lignes.length > 50,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/*
 * LE MÊME RAPPORT, MAIS IMPRIMABLE.
 *
 * Un rapport ne sortait qu'en tableur. Or un tableur ne se dépose pas dans un
 * dossier, ne s'annexe pas à un courrier et ne se présente pas au Conseil : il
 * se rouvre, et il s'édite. Pour tout ce qui doit être MONTRÉ plutôt que
 * retravaillé, il manquait la pièce — et donc, en pratique, la fonction.
 *
 * C'est la même enveloppe que toutes les pièces administratives de Lucie
 * (lib/document.js) : A4, marges de 18 mm, en-tête de l'établissement, pied
 * numéroté. On n'en écrit pas une dixième.
 */
r.post('/:id/document', authRequired, (req, res) => {
  const def = RAPPORTS.find(x => x.id === req.params.id);
  if (!def) return res.status(404).json({ error: 'rapport inconnu' });
  try {
    const p = parametres(req, def);

    /* CERTAINES PIÈCES NE SONT PAS DES TABLEAUX.
       Le rapport de charge d'un cursus a des blocs, des sous-totaux et des
       ratios : le rendu générique en ferait une liste de lignes, et la pièce
       du COPIL perdrait justement ce qui la rend lisible. Un rapport peut donc
       écrire son propre corps — dans LA MÊME enveloppe, ce qui est tout
       l'enjeu : on n'en recrée pas une dixième. */
    if (def.document) {
      const d = def.document(p);
      return res.json({
        html: envelopperDocument({
          html: d.corps, titre: d.titre,
          orientation: d.orientation || 'portrait',
          styles: d.styles || STYLE_RAPPORT,
          entete: d.entete || { titre: d.titre },
        }),
        nom: d.nom, titre: d.titre,
      });
    }

    const lignes = def.lignes(p);
    const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

    /* UNE LISTE N'EST PAS UN DOCUMENT.
     *
     * Le rendu générique posait les lignes telles quelles : « AeSI » répété
     * quatre-vingts fois dans la première colonne, aucun total, aucun
     * regroupement. Sur papier, cela ne se lit pas — cela se subit. Or ce qui
     * rend une liste lisible tient en trois gestes, et ils sont les mêmes
     * pour tous les rapports :
     *
     *  · GROUPER sur la première colonne quand elle se répète — la section,
     *    l'enseignant — et l'écrire UNE fois, en tête de son paquet ;
     *  · TOTALISER les colonnes de nombres, par groupe et pour l'ensemble :
     *    c'est presque toujours le chiffre qu'on cherchait ;
     *  · COMPTER ce qu'on montre, pour savoir si la page est complète.
     *
     * Écrit une fois ici, chaque rapport du catalogue en profite — y compris
     * ceux qu'on ajoutera demain. */
    const nombre = c => lignes.some(l => typeof l[c.cle] === 'number');
    const colonnes = def.colonnes;
    const premiere = colonnes[0];
    const groupable = lignes.length > 4 && premiere
      && new Set(lignes.map(l => l[premiere.cle])).size > 1
      && new Set(lignes.map(l => l[premiere.cle])).size <= lignes.length / 2;

    /* GROUPER, C'EST SUPPRIMER UNE COLONNE, PAS LA VIDER.
       La première colonne — la section — était laissée en place et vide sur
       chaque ligne : deux centimètres de blanc sur toute la hauteur de la
       page, pour une information déjà écrite en tête du groupe. Le titre du
       groupe EST cette colonne ; les lignes n'ont donc plus qu'à porter le
       reste, et l'intitulé récupère la place. */
    const visibles = groupable => (groupable ? colonnes.slice(1) : colonnes);
    const cellules = (l, groupable) => visibles(groupable).map(c =>
      `<td${nombre(c) ? ' class="n"' : ''}>${esc(l[c.cle])}</td>`).join('');

    const somme = (liste, c) => liste.reduce((t, l) =>
      t + (typeof l[c.cle] === 'number' ? l[c.cle] : 0), 0);
    /* Le libellé du total occupe les colonnes de texte, et les sommes se
       posent SOUS leurs colonnes de nombres : un total décalé d'une case ne
       se lit pas, il se devine. */
    const ligneTotal = (liste, libelle, groupable) => {
      const cols = visibles(groupable);
      const premierNombre = cols.findIndex(c => nombre(c));
      const avant = premierNombre < 0 ? cols.length : premierNombre;
      return `<tr class="repere">
        <td${avant > 1 ? ` colspan="${avant}"` : ''}>${esc(libelle)}</td>
        ${cols.slice(avant).map(c => `<td class="n">${nombre(c)
          ? Math.round(somme(liste, c) * 100) / 100 : ''}</td>`).join('')}
      </tr>`;
    };
    const aDesNombres = colonnes.some((c, i) => i > 0 && nombre(c));

    let corpsTable = '';
    if (groupable) {
      const groupes = new Map();
      for (const l of lignes) {
        const k = l[premiere.cle] ?? '—';
        if (!groupes.has(k)) groupes.set(k, []);
        groupes.get(k).push(l);
      }
      for (const [k, liste] of groupes) {
        corpsTable += `<tr class="groupe"><td colspan="${colonnes.length - 1}">${esc(k)}
          <span class="fin">— ${liste.length} ligne(s)</span></td></tr>`;
        corpsTable += liste.map(l => `<tr>${cellules(l, true)}</tr>`).join('');
        if (aDesNombres && liste.length > 1) {
          corpsTable += ligneTotal(liste, `Total ${k}`, true);
        }
      }
    } else {
      corpsTable = lignes.map(l => `<tr>${cellules(l, false)}</tr>`).join('');
    }

    const corps = `
      <table>
        <thead><tr>${visibles(groupable).map(c =>
          `<th${nombre(c) ? ' class="n"' : ''}>${esc(c.entete)}</th>`).join('')}</tr></thead>
        <tbody>${corpsTable || `<tr><td colspan="${visibles(groupable).length}" class="vide">
          Aucune donnée pour ces paramètres.</td></tr>`}</tbody>
        ${lignes.length && aDesNombres
          ? `<tfoot>${ligneTotal(lignes, 'Ensemble', groupable)}</tfoot>` : ''}
      </table>`;

    res.json({
      html: envelopperDocument({
        html: corps,
        titre: def.libelle,
        entete: {
          titre: def.libelle,
          sous: [p.annee ? `Année ${p.annee}` : null, p.section || null,
                 p.session ? `session ${p.session}` : null,
                 `${lignes.length} ligne(s)`].filter(Boolean).join(' · '),
          mention: def.aide || null,
        },
        // Un rapport large se lit en paysage : douze colonnes sur une A4
        // portrait deviennent illisibles, et on les imprime pour les lire.
        orientation: def.colonnes.length > 6 ? 'paysage' : 'portrait',
        styles: STYLE_RAPPORT,
      }),
      nom: `${def.id}-${p.annee || ''}.html`,
      titre: def.libelle,
      nb: lignes.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/:id/xlsx', authRequired, async (req, res) => {
  const def = RAPPORTS.find(x => x.id === req.params.id);
  if (!def) return res.status(404).json({ error: 'rapport inconnu' });
  try {
    const p = parametres(req, def);
    const lignes = def.lignes(p);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Lucie — Institut Ilya Prigogine';
    wb.created = new Date();
    const ws = wb.addWorksheet(def.libelle.slice(0, 30));

    // Un en-tête qui dit CE QU'ON REGARDE : un tableur sans son périmètre ni sa
    // date circule et devient faux sans que personne s'en aperçoive.
    ws.addRow([def.libelle]).font = { bold: true, size: 14 };
    ws.addRow([`${p.annee || ''}${p.session ? ` · session ${p.session}` : ''}`
      + ` · extrait le ${new Date().toLocaleDateString('fr-BE')}`]).font =
      { italic: true, color: { argb: 'FF64748B' } };
    ws.addRow([]);

    const entetes = ws.addRow(def.colonnes.map(c => c.entete));
    entetes.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    entetes.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2B4B' } };
      c.alignment = { vertical: 'middle', wrapText: true };
    });
    ws.columns.forEach((c, i) => { c.width = def.colonnes[i]?.largeur || 16; });

    for (const l of lignes) ws.addRow(def.colonnes.map(c => l[c.cle] ?? ''));
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + lignes.length, column: def.colonnes.length },
    };

    const buf = await wb.xlsx.writeBuffer();
    const nom = `${def.id}_${String(p.annee || '').replace(/\W/g, '')}.xlsx`;
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.send(Buffer.from(buf));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Les paramètres attendus, avec le périmètre de l'utilisateur toujours appliqué. */
function parametres(req, def) {
  const p = {};
  if (def.params.includes('annee')) p.annee = req.body?.annee || anneeDeTravail(req);
  if (def.params.includes('session')) p.session = Number(req.body?.session) === 2 ? 2 : 1;
  // LA SECTION EST UN FILTRE, PAS UNE OBLIGATION. Vide, le rapport porte sur
  // tout l'établissement — c'est le cas du Conseil et de la dotation ; choisie,
  // il ne parle que d'un cursus — c'est le cas d'une coordination.
  if (def.params.includes('section')) p.section = req.body?.section || null;
  /* LA PORTÉE : le niveau, et ce qu'on a choisi à ce niveau. On ne fait
     confiance à rien de ce qui arrive : le niveau doit être l'un de ceux que
     le rapport déclare, l'unité doit être un nombre, et le code de cours ne
     sert que de filtre d'égalité dans une requête préparée. */
  /* LE NOMBRE D'ÉTUDIANTS SE COMPTE, OU SE POSE.
   *
   * Lucie connaît les inscrits : c'est le chiffre juste, et c'est le défaut.
   * Mais une pièce de COPIL se prépare souvent AVANT les inscriptions — on
   * projette la rentrée suivante, on simule l'ouverture d'une section. Le
   * chiffre encodé vaut alors zéro, et le ratio ne dit plus rien.
   *
   * On peut donc poser un effectif à la main. La pièce dit LEQUEL des deux
   * elle a utilisé : un ratio dont on ignore d'où vient le dénominateur ne se
   * défend pas en séance. */
  if (def.params.includes('etudiants')) {
    const n = Number(req.body?.etudiants);
    p.etudiants = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  if (def.params.includes('portee')) {
    const b = req.body?.portee || {};
    const niveaux = def.portees || ['etablissement'];
    const niveau = niveaux.includes(b.niveau) ? b.niveau : niveaux[0];
    p.portee = {
      niveau,
      section: b.section ? String(b.section) : null,
      ue_num: Number.isFinite(Number(b.ue_num)) && b.ue_num !== null && b.ue_num !== ''
        ? Number(b.ue_num) : null,
      // PLUSIEURS UNITÉS. Chacune est validée comme l'était la seule : un
      // nombre, et rien d'autre.
      ue_nums: (Array.isArray(b.ue_nums) ? b.ue_nums : [])
        .map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0),
      // LE FILTRE TRONC COMMUN. Il ne fait PAS partie du niveau : on peut
      // restreindre au tronc commun à n'importe quelle échelle. Deux valeurs
      // seulement sont reconnues ; tout le reste vaut « pas de filtre ».
      tc: b.tc === 'tc' || b.tc === 'hors' ? b.tc : null,
      code_cours: b.code_cours ? String(b.code_cours) : null,
    };
    // Une portée « section » sert aussi de filtre aux pièces qui lisent
    // p.section : les deux disent la même chose, autant ne pas les séparer.
    if (!p.section && p.portee.section) p.section = p.portee.section;
  }
  p.perimetre = getUserSections(req.user);
  return p;
}

export default r;

/**
 * UN DOCUMENT GROUPÉ, DANS L'ENVELOPPE DE LA MAISON.
 *
 * Le pilotage écrivait son rapport lui-même, dans le navigateur : sa propre
 * page A4, ses propres marges de 14 mm, un en-tête de tableau en aplat marine,
 * des lignes de regroupement indigo, une rayure une ligne sur deux — et pas de
 * pied de page. C'était la dixième enveloppe, celle qu'on s'était promis de ne
 * pas écrire, et la seule à ne pas porter l'identité de l'établissement.
 *
 * Elle disparaît au profit de celle-ci : l'écran envoie ce qu'il veut MONTRER —
 * des groupes, des colonnes, des lignes —, jamais du balisage, et le serveur
 * l'habille comme toutes les autres pièces. La couleur y devient inutile : un
 * filet suffit à séparer, et le seul contraste est celui de l'en-tête.
 */
r.post('/document-groupe', authRequired, (req, res) => {
  const b = req.body || {};
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const groupes = Array.isArray(b.groupes) ? b.groupes : [];
  const colonnes = Array.isArray(b.colonnes) ? b.colonnes : [];
  if (!colonnes.length) return res.status(400).json({ error: 'colonnes requises' });

  const cell = (c, v, tag = 'td') =>
    `<${tag}${c.num ? ' style="text-align:right"' : ''}>${esc(v)}</${tag}>`;

  const corps = `
    <h1>${esc(b.titre || 'Rapport')}</h1>
    ${b.sous ? `<p class="sous">${esc(b.sous)}</p>` : ''}
    ${groupes.map(g => `
      <h3>${esc(g.titre || '')}${g.sous ? ` <span class="sous">— ${esc(g.sous)}</span>` : ''}</h3>
      <table>
        <thead><tr>${colonnes.map(c => cell(c, c.entete, 'th')).join('')}</tr></thead>
        <tbody>${(g.lignes || []).map(l => l.__repere
          ? `<tr class="repere"><td colspan="${colonnes.length}">${esc(l.__repere)}</td></tr>`
          : `<tr>${colonnes.map(c => cell(c, l[c.cle])).join('')}</tr>`).join('')}</tbody>
      </table>`).join('')}`;

  res.json({
    html: envelopperDocument({
      html: corps,
      titre: b.titre || 'Rapport',
      // L'écran choisit le sens quand il en propose le choix ; à défaut, un
      // tableau large se lit en paysage.
      orientation: b.orientation === 'paysage' || b.orientation === 'portrait'
        ? b.orientation : (colonnes.length > 6 ? 'paysage' : 'portrait'),
      styles: STYLE_RAPPORT,
    }),
    titre: b.titre || 'Rapport',
  });
});

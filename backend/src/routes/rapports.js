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
import { decisionDeSession, structureUE } from './acquis.js';
import { calculerEtp } from './pilotage.js';
import { MOTIFS_DI } from './droitInscription.js';
import { donneesChiffresCles, donneesPersonnel, TRANCHES_ETP } from '../lib/chiffresCles.js';
import { donneesCout } from '../lib/coutFormation.js';
import { TITRES_ACCES, DIPLOMES_MAX } from '../lib/profilEtudiant.js';
import { couleurs } from '../lib/couleurs.js';
import { controlePrerequisPae, corpsControlePae, prenomSeul, STYLES_CONTROLE_PAE } from '../lib/controlePae.js';

const r = Router();

/** Un ETP vaut 800 périodes en charge théorique ; le cours technique compte double. */
const COLS = (l) => l.map(([cle, entete, largeur = 16]) => ({ cle, entete, largeur }));
const sectionsControle = p => (p.section && (!p.perimetre || p.perimetre.includes(p.section)) ? [p.section] : (p.perimetre || null));

/**
 * LE CATALOGUE.
 *
 * « domaine » range le rapport dans son onglet ; « params » dit ce que l'écran
 * doit demander avant de le produire. Un rapport qui réclame une section ne
 * doit pas pouvoir se lancer sans elle.
 */
export const STYLE_RAPPORT = `
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
                 border-bottom: 0.25mm solid #C4CDD9; }
        th { background: transparent; color:#64748b; font-size: 7.5pt;
             border-bottom: 0.4mm solid #94A3B8; }
        td { font-variant-numeric: tabular-nums; }
        /* UNE LIGNE QUI NE SE VOIT PAS NE SÉPARE RIEN.
           Le filet valait 0,3 pt en #e2e8f0 — un gris presque blanc, d'une
           épaisseur sous le seuil de rendu de la plupart des imprimantes. Sur
           une liste de personnel à huit colonnes, l'œil perdait sa ligne en
           cours de route et lisait le prénom d'un autre. On passe en 0,25 mm
           (soit ~0,7 pt) et en gris franc : c'est un filet, pas un quadrillage,
           mais il existe sur le papier autant qu'à l'écran.
           La DERNIÈRE ligne garde le sien : elle le perdait, si bien qu'un
           tableau se terminait en l'air, sans bord bas. */
        td.n, th.n { text-align: right; }
        /* LA BANDE DE REGROUPEMENT PORTE SA COULEUR. Écrite en gras sur du
           blanc, elle se confondait avec les lignes qu'elle annonce : on ne
           voyait pas où un paquet commençait. Elle prend le marine de la
           maison, et le BLOC prend la sienne — orange BA1/BE1, bleu clair BA2,
           marine BA3. Un repère qu'il faut chercher n'est pas un repère.
           Ces trois teintes ne disent JAMAIS un état : vert, ocre et brique
           restent libres pour ce qui alerte. */
        /* LE TEXTE NE COLLE PAS AU BORD DE SA BANDE. Il commençait à 2 mm du
           bord gauche du tableau, donc à ras du rectangle coloré : une section
           écrite « ATNUP » semblait poussée hors de sa bande. Un retrait franc
           l'aligne sur la respiration du document, et la bande prend le rayon
           de la maison — tout ce qui est encadré dans Lucie a les angles
           arrondis, une bande à angles vifs au milieu jure avec le reste. */
        tr.groupe td { font-weight: 700; color:#ffffff; background:#2D4470;
                       padding: 2mm 2mm 2mm 4mm; font-size: 9pt; border-bottom: 0;
                       border-radius: 1.5mm; }
        tr.groupe .fin { font-weight: 400; opacity:.8; }
        tr.groupe.bloc1 td { background:#E8890C; }
        tr.groupe.bloc2 td { background:#7FB3D5; color:#123047; }
        tr.groupe.bloc3 td { background:#1B2B4B; }
        /* LE SOUS-TOTAL ADDITIONNE, IL N'ALERTE PAS. Il se dessinait dans un
           jaune-marron — or l'ocre veut dire « regarde ça » partout ailleurs
           dans Lucie, et un sous-total ne demande rien. Bleu très pâle : il se
           détache de la donnée sans prendre un sens qu'il n'a pas. */
        tr.repere td { background:#EDF2F8; font-weight:600;
                       border-bottom: 0.3pt solid #D6E0EC; }
        td.vide { color:#94a3b8; text-align:center; padding: 6mm 0; }
        tfoot tr.repere td { background:#FAFAFB; border-top: 0.8pt solid #1B2B4B;
                             border-bottom: 0; font-weight:700; }`;

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
export function tuile({ valeur, unite = '', libelle, precision = null, ton = 'neutre',
                couleur = null }) {
  // LE BLOC SIGNALÉ, À SES MESURES DE PAPIER (CLAUDE.md §6) : rail de 1,6 mm
  // qui porte l'état, contour 0,3 mm, rayon 1,5 mm, fond #FAFAFB. Le rail est
  // marine à l'intérieur ; une couleur ne s'y pose que pour dire un ÉTAT
  // (réussi, à corriger…) — jamais un contrat ni un bloc, qui sont des
  // repères de colonnes et d'en-têtes. Jamais un fond teinté.
  const bord = couleur || { neutre: '#1B2B4B', fort: '#1B2B4B', doux: '#94a3b8' }[ton] || '#1B2B4B';
  return `<td class="tuile"><div class="tuile-boite${ton === 'fort' ? ' fort' : ''}" style="border-left-color:${bord}">
    <div class="tuile-val">${valeur}${unite ? `<span class="tuile-u">${unite}</span>` : ''}</div>
    <div class="tuile-lib">${libelle}</div>
    ${precision ? `<div class="tuile-fin">${precision}</div>` : ''}
  </div></td>`;
}
export const rangeeTuiles = (tuiles) =>
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

/**
 * LE CAMEMBERT (Charles, 6 octobre 2026 : « des camemberts pour sexe, pays… »).
 * Un anneau SVG — le trou porte le total, la légende dit chaque part avec son
 * pourcentage. Couleurs en hexadécimal : c'est une pièce imprimée (les
 * attributs `fill` ne lisent pas les variables CSS). Une part « non
 * renseignée » est dessinée en gris pâle : elle se voit, elle ne disparaît pas.
 */
export function camembert(titre, parts, { total = null, note = '' } = {}) {
  const vis = parts.filter(p => p.valeur > 0);
  const somme = vis.reduce((t, p) => t + p.valeur, 0);
  const R = 34, r = 21, C = 40;
  let a = -Math.PI / 2;
  const arc = (v) => {
    const ang = (v / somme) * Math.PI * 2;
    if (ang >= Math.PI * 2 - 1e-6) {
      return `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke-width="${R - r}"`;
    }
    const x1 = C + R * Math.cos(a), y1 = C + R * Math.sin(a);
    const x2 = C + R * Math.cos(a + ang), y2 = C + R * Math.sin(a + ang);
    const x3 = C + r * Math.cos(a + ang), y3 = C + r * Math.sin(a + ang);
    const x4 = C + r * Math.cos(a), y4 = C + r * Math.sin(a);
    const g = ang > Math.PI ? 1 : 0;
    a += ang;
    return `<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${g} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${x3.toFixed(2)},${y3.toFixed(2)} A${r},${r} 0 ${g} 0 ${x4.toFixed(2)},${y4.toFixed(2)} Z"`;
  };
  const svg = somme ? vis.map(p => {
    const d = arc(p.valeur);
    const op = p.pale ? 0.35 : 0.9;
    return d.startsWith('<circle') ? `${d} stroke="${p.couleur}" stroke-opacity="${op}"/>` : `${d} fill="${p.couleur}" fill-opacity="${op}"/>`;
  }).join('') : `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="#E2E8F0" stroke-width="${R - r}"/>`;
  const centre = total ?? (somme ? Math.round(somme).toLocaleString('fr-BE') : '0');
  return `<div class="camembert"><h3>${titre}</h3><div class="cam-corps">
    <svg viewBox="0 0 80 80" width="26mm" height="26mm">${svg}
      <text x="${C}" y="${C + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="#1B2B4B">${centre}</text></svg>
    <div class="cam-leg">${somme ? vis.map(p => `<div><i style="background:${p.couleur};opacity:${p.pale ? 0.35 : 0.9}"></i>${p.nom}
      <b>${Math.round(p.valeur / somme * 100)} %</b></div>`).join('') : '<div class="fin">rien d’encodé</div>'}</div></div>
    ${note ? `<div class="fin">${note}</div>` : ''}</div>`;
}
/**
 * EN BREF (Charles, 6 octobre 2026 : « plus de phrases de synthèse »). Ce que
 * la pièce démontre, en phrases, en tête — calculées, jamais rédigées à la
 * main : une phrase écrite d'avance mentirait l'année suivante. Une donnée
 * trop peu remplie ne fait pas de conclusion : la phrase dit ce qui manque.
 */
export const enBref = (phrases) => `<div class="en-bref"><h3>En bref</h3><ul>${phrases.filter(Boolean)
  .map(x => `<li>${x}</li>`).join('')}</ul></div>`;
/** Les couleurs d'une série de sections, dans l'ordre. */
const couleursSerie = K => [K.bleu, K.or, K.cyan, K.marine, K.donnees, K.helb, '#64748b', '#94a3b8', '#3E7D5E', '#B45309'];

/** Une rangée de camemberts, côte à côte. */
export const rangeeCamemberts = (...c) => `<table class="cams"><tr>${c.filter(Boolean).map(x => `<td>${x}</td>`).join('')}</tr></table>`;

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
export const STYLE_REPORTING = `
  /* LA RANGÉE DE TUILES RESTE DANS LA COLONNE DE TEXTE. Un écartement de
     cellules « déborde » d'une demi-valeur de chaque côté : la première tuile
     sortait de 5 mm à gauche, sous l'en-tête et le tableau qui, eux, partent
     de la marge. On écarte donc les tuiles SANS écarter la table : c'est le
     padding intérieur qui fait l'air, pas l'espacement extérieur. */
  table.tuiles { width:100%; border-collapse:collapse;
                 margin:3mm 0 8mm; table-layout:fixed; }
  td.tuile + td.tuile { padding-left:3mm !important; }
  /* LA CELLULE ÉCARTE, LA BOÎTE DESSINE. Une cellule de tableau ne prend ni
     rayon ni contour propre en border-collapse : le bloc signalé vit donc
     dans une boîte, et la cellule ne fait que l'espacer. */
  td.tuile { border:0; padding:0; vertical-align:top; height:1px; }
  .tuile-boite { background:#fff; border:0.3mm solid #D8DCE4;
                 border-left:1mm solid #1B2B4B; border-radius:0 2.6mm 2.6mm 0;
                 padding:2mm 3mm 2.2mm; height:100%; break-inside:avoid; }
  /* LE CHIFFRE EST LE SUJET DE LA TUILE : il est grand, serré, et tout le
     reste est gris. Une tuile où le libellé pèse autant que le nombre ne dit
     plus rien d'un coup d'œil. Une interligne de 1 rogne les accents. */
  .tuile-val { font-size:16pt; font-weight:700; color:#1B2B4B; line-height:1.12;
               letter-spacing:-.3pt; font-variant-numeric:tabular-nums; }
  .tuile-boite.fort .tuile-val { font-size:19pt; }
  .tuile-u   { font-size:8pt; font-weight:400; color:#64748b; margin-left:1mm;
               letter-spacing:0; }
  /* PAS DE CAPITALES FORCÉES : « Étudiants » y perdait son accent, et une
     étiquette en capitales se lit moins vite qu'une étiquette normale. */
  .tuile-lib { font-size:9pt; color:#1B2B4B; margin-top:1mm; font-weight:600; }
  .tuile-fin { font-size:7.5pt; color:#64748b; margin-top:.5mm; }
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
      /* Le repère ne se pose QUE si le regroupement est réellement un bloc :
         posé sur autre chose, il mentirait sur ce qu'il désigne. */
      const cb = /\bB[AE]?\s*1\b/i.test(bloc) ? ' bloc1'
        : /\bBA\s*2\b/i.test(bloc) ? ' bloc2'
          : /\bBA\s*3\b/i.test(bloc) ? ' bloc3' : '';
      corps += `<tr class="bloc${cb}"><td colspan="8">${esc(bloc)}</td></tr>`;
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
      /* LA BANDE DE BLOC PORTE SA COULEUR — orange BA1/BE1, bleu clair BA2,
         marine BA3. Elle s'écrivait en marine sur du blanc, et le bloc se
         répétait en 6,5 pt gris dans la colonne de gauche de CHAQUE unité :
         deux façons de dire la même chose, dont aucune ne se voit en
         balayant la page. La bande le dit une fois, en couleur ; le rappel
         minuscule disparaît. */
      /* DEUX TONS, UNE POLICE (Charles, 27 septembre 2026 : « pas beau :
         plein de couleurs, pas les mêmes polices, le rectangle orange ; BA
         devrait être décalé à droite »). Le bloc se dit par un LISERÉ droit
         à sa couleur — orange, bleu clair, marine — sur un fond pâle de la
         même teinte, et « BA1 » respire à 5 mm du liseré. Le texte est
         marine, le second plan gris, et rien d'autre : l'ocre de l'autonomie
         disait « alerte » là où il n'y a qu'une grandeur. */
      tr.bloc td { font-weight: 700; color: #1B2B4B; font-size: 9pt; letter-spacing: .4pt;
                   padding: 1.6mm 2mm 1.6mm 5mm; border-bottom: 0;
                   border-left: 1.6mm solid #9AA3B5; background: #F4F6F9; }
      tr.bloc.bloc1 td { border-left-color: #E8890C; background: #FDF1E3; }
      tr.bloc.bloc2 td { border-left-color: #7FB3D5; background: #EEF5FA; }
      tr.bloc.bloc3 td { border-left-color: #1B2B4B; background: #E9ECF2; }
      tr.ue td { padding-top: 2.5mm; border-bottom: 0.25mm solid #D8DCE4; color: #1B2B4B; }
      tr.ue td .fin { color: #5B6478; font-weight: 400; }
      tr.ue .ue-bloc { display: none; }
      table.grille td { color: #1B2B4B; }
      td.code { font-variant-numeric: tabular-nums; color: #5B6478; }
      td.type { color: #5B6478; text-align: center; }
      td.etud { color: #5B6478; }
      td.aut  { color: #1B2B4B; }
      td.g    { font-weight: 700; color: #1B2B4B; }
      /* LE SOUS-TOTAL ADDITIONNE, IL N'ALERTE PAS. */
      tr.sous td { color: #1B2B4B; font-weight: 600;
                   background: #EDF2F8; border-bottom: 0.3pt solid #D8DCE4; }
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

/* LES GRAPHIQUES DES STATISTIQUES (Charles, 6 octobre 2026 : « des
   graphiques pour que cela soit sexy »). Les couleurs du logo pour les
   catégories, le rose de la HELB pour son contrat, et un GRIS PÂLE pour ce qui
   n'est pas renseigné : la part inconnue se voit, elle ne disparaît pas. */
const GRIS_INCONNU = '#94a3b8';
function paletteStats() {
  const C = couleurs();
  return { bleu: C.iip_bleu, or: C.iip_or, cyan: C.iip_cyan, marine: C.principal,
    donnees: C.donnees, iip: C.iip, helb: C.helb };
}
/** Deux graphiques côte à côte : un conseil se lit d'un coup d'œil. */
const duo = (...cadres) => `<table class="duo"><tr>${cadres.map(c => `<td>${c}</td>`).join('')}</tr></table>`;
const cadreGraphe = (titre, contenu, note = '') =>
  `<div class="cadre"><h3>${titre}</h3>${contenu}${note ? `<div class="fin">${note}</div>` : ''}</div>`;
const STYLE_STATS = `
  table.duo { width:100%; border-collapse:collapse; table-layout:fixed; margin:0 0 2mm; }
  /* LA DEMI-PAGE PORTE SES BARRES. Les largeurs fixes des barres (34 mm de
     libellé, 44 mm de valeur) mangeaient toute la demi-colonne : la piste
     disparaissait et la valeur débordait sur le graphique voisin. */
  table.duo > tbody > tr > td { vertical-align:top; padding:0 3mm 0 0 !important; border:0; }
  table.duo > tbody > tr > td + td { padding:0 0 0 3mm !important; }
  table.duo table.barres { table-layout:fixed; }
  table.duo .barres-lib { width:34% !important; }
  table.duo .barres-val { width:30% !important; padding-left:2mm !important; white-space:nowrap; }
  .cadre h3 { font-size:9.5pt; color:#1B2B4B; margin:0 0 2mm; font-weight:700; }
  table.cams { width:100%; border-collapse:collapse; table-layout:fixed; margin:0 0 4mm; }
  .en-bref { border:0.3mm solid #D8DCE4; border-left:1mm solid #C9A84C; border-radius:0 2.6mm 2.6mm 0;
             padding:2.5mm 4mm; margin:0 0 5mm; break-inside:avoid; background:#fff; }
  .en-bref h3 { font-size:9.5pt; color:#1B2B4B; margin:0 0 1.5mm; font-weight:700; }
  .en-bref ul { margin:0; padding-left:4.5mm; columns:2; column-gap:8mm; }
  .en-bref li { font-size:8.5pt; color:#1E293B; line-height:1.45; margin:0 0 1mm; break-inside:avoid; }
  table.cams td { vertical-align:top; padding:0 2mm !important; border:0; }
  .camembert { break-inside:avoid; }
  .camembert h3 { font-size:9pt; color:#1B2B4B; margin:0 0 1.5mm; font-weight:700; }
  .cam-corps { display:flex; align-items:center; gap:3mm; }
  .cam-leg { font-size:7.5pt; color:#334155; line-height:1.45; }
  .cam-leg i { display:inline-block; width:2.4mm; height:2.4mm; border-radius:.6mm; margin-right:1.2mm; vertical-align:-0.2mm; }
  .cam-leg b { color:#1B2B4B; margin-left:1mm; }
  /* UN NOMBRE NE SE COUPE PAS : « 47 240 » d'un côté, « € » de l'autre. */
  table.serre th, table.serre td { padding-left:1.2mm; padding-right:1.2mm; font-size:8pt; }
  table td.n { white-space:nowrap; }
`;
const partsDe = (P, liste) => barreParts(liste.filter(([, v]) => v > 0)
  .map(([nom, v, couleur, pale]) => ({ nom, valeur: v, couleur, pale })));

/** Les quatre camemberts d'un profil de personnes : sexe, âge, nationalité. */
function camembertsProfil(E, K, quoi = 'personnes') {
  const g = { couleur: GRIS_INCONNU, pale: true };
  return [
    camembert('Sexe', [{ nom: 'Femmes', valeur: E.F, couleur: K.or }, { nom: 'Hommes', valeur: E.M, couleur: K.bleu },
      { nom: 'X', valeur: E.X, couleur: K.cyan }, { nom: 'Non renseigné', valeur: E.sexe_inconnu, ...g }],
      { note: `renseigné pour ${E.n ? Math.round((E.n - E.sexe_inconnu) / E.n * 100) : 0} % des ${quoi}` }),
    camembert('Âge', [{ nom: 'moins de 25', valeur: E.m25, couleur: K.cyan }, { nom: '25-34', valeur: E.m35, couleur: K.or },
      { nom: '35-44', valeur: E.m45, couleur: K.bleu }, { nom: '45 et plus', valeur: E.p45, couleur: K.marine },
      { nom: 'Non renseigné', valeur: E.age_inconnu, ...g }],
      { note: E.age_moyen != null ? `âge moyen ${(Math.round(E.age_moyen * 10) / 10).toString().replace('.', ',')} ans` : '' }),
    camembert('Nationalité', [{ nom: 'Belgique', valeur: E.be, couleur: K.bleu }, { nom: 'Union européenne', valeur: E.ue, couleur: K.cyan },
      { nom: 'Hors UE', valeur: E.hors_ue, couleur: K.or }, { nom: 'Non renseignée', valeur: E.nat_inconnue, ...g }],
      { note: `renseignée pour ${E.n ? Math.round((E.n - E.nat_inconnue) / E.n * 100) : 0} % des ${quoi}` }),
  ];
}

/**
 * LES STATISTIQUES DU PERSONNEL — l'année en cours, au jour de l'impression.
 * Ce qui est sûr d'abord (statut, nomination, contrat, charge, sections) ; le
 * profil personnel ensuite, chaque fois avec la part des fiches qui le portent.
 */
function documentPersonnelStats(p) {
  const d = donneesPersonnel(p.annee);
  const K = paletteStats();
  const E = d.ensemble;
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const n0 = n => Math.round(n || 0).toLocaleString('fr-BE');
  const n1 = n => (n == null ? '—' : (Math.round(n * 10) / 10).toString().replace('.', ','));
  const n2 = n => (n == null ? '—' : (n || 0).toFixed(2).replace('.', ','));
  const pc = (k, n) => (n ? `${Math.round(k / n * 100)} %` : '—');
  const connu = (inconnu) => `renseigné pour ${pc(E.n - inconnu, E.n)} des membres`;
  const dateRef = d.ref.split('-').reverse().join('/');

  const g = { couleur: GRIS_INCONNU, pale: true };
  const graphes = `
    ${rangeeCamemberts(
      camembert('Statut', [{ nom: 'Chargés de cours', valeur: E.cc, couleur: K.bleu }, { nom: 'Experts', valeur: E.exp, couleur: K.cyan },
        { nom: 'Autre', valeur: E.autre_statut, ...g }]),
      camembert('Nomination', [{ nom: 'Définitifs', valeur: E.definitif, couleur: K.bleu }, { nom: 'Temporaires', valeur: E.temporaire, couleur: K.or },
        { nom: 'Non renseignée', valeur: E.n - E.definitif - E.temporaire, ...g }]),
      camembert('Employeur', [{ nom: 'Institut', valeur: E.iip, couleur: K.iip }, { nom: 'Haute École', valeur: E.helb, couleur: K.helb }],
        { note: E.iip + E.helb > E.n ? 'un membre sous les deux contrats compte dans chacun' : '' }),
      camembert('Domicile', [{ nom: 'Bruxelles', valeur: E.bruxelles, couleur: K.bleu }, { nom: 'Wallonie', valeur: E.wallonie, couleur: K.or },
        { nom: 'Flandre', valeur: E.flandre, couleur: K.cyan }, { nom: 'Non renseigné', valeur: E.domicile_inconnu, ...g }]))}
    ${rangeeCamemberts(...camembertsProfil(E, K, 'membres'))}
    ${duo(
      cadreGraphe('Charge individuelle — membres par tranche d’ETP', barres({ donnees: TRANCHES_ETP.map(([k, lib]) => ({
        nom: lib, valeur: E[k], couleur: K.donnees, texte: `${n0(E[k])} · ${n2(E[k + '_etp'])} ETP` })) })),
      cadreGraphe('ETP par section', barres({ donnees: [...d.sections].sort((a, b) => b.etp_section - a.etp_section)
        .map(x => ({ nom: esc(x.section), valeur: x.etp_section, couleur: K.marine, texte: `${n2(x.etp_section)} ETP` })) })))}`;

  const tSec = `<table><thead><tr><th>Section</th>${['Membres', 'CC', 'EXP', 'Définitifs', 'IIP', 'HELB', 'ETP', 'ETP moyen']
      .map(c => `<th class="n">${c}</th>`).join('')}</tr></thead>
    <tbody>${d.sections.map(x => `<tr><td>${esc(x.section)}</td><td class="n g">${n0(x.n)}</td><td class="n">${n0(x.cc)}</td>
      <td class="n">${n0(x.exp)}</td><td class="n">${n0(x.definitif)}</td><td class="n">${n0(x.iip)}</td><td class="n">${n0(x.helb)}</td>
      <td class="n g">${n2(x.etp_section)}</td><td class="n">${x.n ? n2(x.etp_section / x.n) : '—'}</td></tr>`).join('')}</tbody>
    <tfoot><tr class="repere"><td>Ensemble (chaque membre une fois)</td><td class="n">${n0(E.n)}</td><td class="n">${n0(E.cc)}</td>
      <td class="n">${n0(E.exp)}</td><td class="n">${n0(E.definitif)}</td><td class="n">${n0(E.iip)}</td><td class="n">${n0(E.helb)}</td>
      <td class="n">${n2(E.etp)}</td><td class="n">${E.n ? n2(E.etp / E.n) : '—'}</td></tr></tfoot></table>
    <p class="fin">Un membre attribué dans deux sections compte dans chacune ; l'ETP d'une section est la charge qui s'y donne.
      ETP au barème de Pilotage (CT/800 + PP/1000). Titres de capacité encodés pour ${pc(E.avec_titres, E.n)} des membres,
      CAPAES pour ${pc(E.capaes, E.n)}.</p>`;

  const corps = `
    ${rangeeTuiles([
      tuile({ valeur: n0(E.n), libelle: 'Membres du personnel', precision: `${n0(E.enseignant)} enseignant(s)`, ton: 'fort' }),
      tuile({ valeur: n2(E.etp), unite: 'ETP', libelle: 'Charge totale', precision: `${d.sections.length} section(s)` }),
      tuile({ valeur: E.n ? n2(E.etp / E.n) : '—', unite: 'ETP', libelle: 'Charge moyenne', precision: 'par membre' }),
      tuile({ valeur: pc(E.temporaire, E.n), libelle: 'Temporaires', precision: `${n0(E.definitif)} définitif(s)` }),
      tuile({ valeur: pc(E.cc, E.n), libelle: 'Chargés de cours', precision: `${n0(E.exp)} expert(s)` }),
    ])}
    ${(() => {
      const petits = (E.t1 || 0) + (E.t2 || 0);
      const domConnu = E.n - E.domicile_inconnu, sexeConnu = E.n - E.sexe_inconnu, ageConnu = E.n - E.age_inconnu;
      const grosse = [...d.sections].sort((a, b) => b.etp_section - a.etp_section)[0];
      return enBref([
        `<b>${n0(E.n)} membres</b> assurent <b>${n2(E.etp)} ETP</b> : la charge moyenne est de <b>${E.n ? n2(E.etp / E.n) : '—'} ETP</b> par personne.`,
        `<b>${pc(petits, E.n)}</b> des membres ont <b>moins d'un quart-temps</b> (moins de 0,25 ETP) ; ${n0(E.t5 || 0)} ont 0,75 ETP ou plus.`,
        `${pc(E.temporaire, E.n)} des membres sont <b>temporaires</b>, ${n0(E.definitif)} définitif(s).`,
        `Les <b>chargés de cours</b> sont ${pc(E.cc, E.n)}, les <b>experts</b> ${pc(E.exp, E.n)}.`,
        E.helb ? `<b>${n0(E.helb)}</b> membre(s) ont au moins une attribution sous <b>contrat HELB</b>.` : '',
        grosse ? `La section la plus chargée est <b>${esc(grosse.section)}</b>, avec ${n2(grosse.etp_section)} ETP (${pc(grosse.etp_section, E.etp)} du total).` : '',
        domConnu >= E.n * 0.5 ? `${pc(E.bruxelles, domConnu)} des membres habitent <b>Bruxelles</b>, ${pc(E.wallonie, domConnu)} la Wallonie, ${pc(E.flandre, domConnu)} la Flandre.` : '',
        sexeConnu >= E.n * 0.5 ? `Les <b>femmes</b> sont ${pc(E.F, sexeConnu)} des membres dont le sexe est connu${ageConnu >= E.n * 0.5 ? ` ; l'âge moyen est de ${n1(E.age_moyen)} ans` : ''}.`
          : `Le sexe et l'âge ne sont connus que pour ${pc(sexeConnu, E.n)} des membres : à compléter (Ma fiche, ou Compléter les fiches).`,
      ]);
    })()}
    ${graphes}
    ${duo(
      cadreGraphe('Membres par section', barres({ donnees: [...d.sections].sort((a, b) => b.n - a.n)
        .map(x => ({ nom: esc(x.section), valeur: x.n, couleur: K.donnees, texte: `${n0(x.n)} · ${n0(x.cc)} CC · ${n0(x.exp)} EXP` })) })),
      cadreGraphe('Charge moyenne par membre, par section', barres({ donnees: d.sections.filter(x => x.n)
        .sort((a, b) => b.etp_section / b.n - a.etp_section / a.n)
        .map(x => ({ nom: esc(x.section), valeur: x.etp_section / x.n, couleur: K.marine, texte: `${n2(x.etp_section / x.n)} ETP` })) })))}
    <h2>Section par section</h2>${tSec}`;

  return {
    corps,
    entete: { titre: 'Statistiques du personnel', sous: `Année académique ${p.annee} · situation au ${dateRef}` },
    titre: 'Statistiques du personnel',
    nom: `Statistiques-personnel-${p.annee}.html`,
    orientation: 'paysage',
    styles: STYLE_RAPPORT + STYLE_REPORTING + STYLE_STATS,
  };
}

/**
 * LE COÛT RÉEL DES FORMATIONS — chaque période attribuée au montant de la
 * circulaire des conventions, réglé dans Configuration → Coût des périodes.
 */
function documentCoutFormations(p) {
  const d = donneesCout(p.annee);
  const K = paletteStats();
  const T = d.tarifs;
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const eur = n => `${Math.round(n || 0).toLocaleString('fr-BE')} €`;
  const n0 = n => Math.round(n || 0).toLocaleString('fr-BE');
  const m2 = n => (n || 0).toFixed(2).replace('.', ',');
  const e1 = n => (Math.round((n || 0) * 100) / 100).toString().replace('.', ',');
  const pc = (k, n) => (n ? `${Math.round(k / n * 100)} %` : '—');
  const k0 = n => Math.round(n || 0).toLocaleString('fr-BE');   // montant sans symbole (colonne en €)
  const ins = d.base_inscrits;
  const tot = d.total;
  const ST = d.statuts, SX = d.sexes;
  const GRIS = GRIS_INCONNU;
  // Couleurs : CC au bleu du logo, EXP au cyan ; femmes à l'or, hommes au bleu, X au cyan.
  const coulStatut = { CC: K.bleu, EXP: K.cyan, AUTRE: GRIS };
  const coulSexe = { F: K.or, M: K.bleu, X: K.cyan, NR: GRIS };
  const libStatut = { CC: 'Chargés de cours', EXP: 'Experts', AUTRE: 'Sans statut' };
  const libSexe = { F: 'Femmes', M: 'Hommes', X: 'X', NR: 'Non renseigné' };

  /* UNE BARRE PAR SECTION, LA LÉGENDE UNE FOIS : vingt légendes identiques
     ne disent rien de plus qu'une seule. */
  const barreNue = (parts) => {
    const t = parts.reduce((a, x) => a + x.v, 0) || 1;
    return `<div class="parts">${parts.filter(x => x.v > 0).map(x =>
      `<span class="part" style="width:${x.v / t * 100}%;background:${x.c};opacity:${x.pale ? 0.35 : 0.85}"></span>`).join('')}</div>`;
  };
  const legende = (cles, lib, coul) => `<div class="legendes">${cles.map(k =>
    `<span class="leg"><i style="background:${coul[k]};opacity:${coul[k] === GRIS ? 0.35 : 0.85}"></i>${lib[k]}</span>`).join('')}</div>`;
  const parSection = (titre, get, cles, lib, coul) => cadreGraphe(titre, `<table class="barres">${d.sections.map(S => {
      const v = get(S); const t = cles.reduce((a, k) => a + (v[k]?.periodes || 0), 0);
      return `<tr><td class="barres-lib">${esc(S.section)}</td><td>${barreNue(cles.map(k => ({ v: v[k]?.periodes || 0, c: coul[k], pale: coul[k] === GRIS })))}</td>
        <td class="barres-val">${cles.filter(k => k !== 'AUTRE' && k !== 'NR').map(k => `${pc(v[k]?.periodes || 0, t)}`).join(' · ')}</td></tr>`;
    }).join('')}</table>${legende(cles, lib, coul)}`);
  const global = (titre, v, cles, lib, coul, note = '') => cadreGraphe(titre, partsDe(K, cles.map(k => [lib[k], v[k]?.periodes || 0, coul[k], coul[k] === GRIS])), note);

  const regle = `<div class="cadre"><h3>Comment se calcule le coût</h3>
    <p class="fin" style="margin:0">
      <b>Cours</b> — périodes attribuées × montant d'une période, selon le niveau de l'unité et le type du cours :
      supérieur de type court ${m2(T.SUP.CT)} € (cours généraux et techniques) · ${m2(T.SUP.PP)} € (pratique professionnelle) ;
      secondaire supérieur ${m2(T.DS.CT)} € · ${m2(T.DS.PP)} €${T.reference ? ` (${esc(T.reference)}${T.date_effet ? `, au ${esc(T.date_effet.split('-').reverse().join('/'))}` : ''})` : ''}.
      Le même montant vaut pour les chargés de cours et pour les experts. Les lignes en congé ne coûtent rien
      (leur remplaçant est compté) ; les activités Z n'entrent pas.<br>
      <b>Fonctions</b> — coût annuel d'un temps plein de la fonction × ETP de la personne dans cette fonction,
      réparti entre les sections au prorata de leurs inscrits (part = coût des fonctions × inscrits de la section ÷ ${n0(ins)}).<br>
      <b>Coût complet</b> d'une section = coût de ses cours + sa part des fonctions ; par étudiant = coût complet ÷ inscrits.
      Les pourcentages CC / EXP et femmes / hommes portent sur les <b>périodes</b>.</p></div>`;

  const tSections = `<table class="serre"><thead><tr><th>Section</th>${['Cours (€)', 'dont CC (€)', 'dont EXP (€)', '% CC', '% EXP', 'dont HELB (€)',
      'Inscrits', 'Fonctions (€)', 'Complet (€)', 'Par étudiant (€)'].map(c => `<th class="n">${c}</th>`).join('')}</tr></thead>
    <tbody>${d.sections.map(S => `<tr><td>${esc(S.section)}</td><td class="n">${k0(S.cout)}</td>
      <td class="n">${k0(S.statuts.CC.cout)}</td><td class="n">${k0(S.statuts.EXP.cout)}</td>
      <td class="n">${pc(S.statuts.CC.periodes, S.periodes)}</td><td class="n">${pc(S.statuts.EXP.periodes, S.periodes)}</td>
      <td class="n">${S.cout_helb ? k0(S.cout_helb) : '—'}</td><td class="n">${S.inscrits ? n0(S.inscrits) : '—'}</td>
      <td class="n">${S.part_fonctions ? k0(S.part_fonctions) : '—'}</td><td class="n g">${k0(S.cout_complet)}</td>
      <td class="n">${S.inscrits ? k0(S.cout_complet / S.inscrits) : '—'}</td></tr>`).join('')}</tbody>
    <tfoot><tr class="repere"><td>Ensemble</td><td class="n">${k0(tot.cout)}</td><td class="n">${k0(ST.CC.cout)}</td>
      <td class="n">${k0(ST.EXP.cout)}</td><td class="n">${pc(ST.CC.periodes, tot.periodes)}</td><td class="n">${pc(ST.EXP.periodes, tot.periodes)}</td>
      <td class="n">${k0(tot.cout_helb)}</td><td class="n">${n0(ins)}</td><td class="n">${k0(tot.cout_fonctions)}</td>
      <td class="n">${k0(tot.cout_complet)}</td><td class="n">${ins ? k0(tot.cout_complet / ins) : '—'}</td></tr></tfoot></table>
    <p class="fin">${ST.AUTRE.periodes ? `${n0(ST.AUTRE.periodes)} période(s) portées par un membre sans statut CC ou EXP sont comptées dans le coût, hors pourcentages CC / EXP. ` : ''}${d.type_defaut ? `${n0(d.type_defaut)} période(s) sans type de cours ont été comptées au tarif des cours généraux. ` : ''}${d.sans_tarif ? `<b>${n0(d.sans_tarif)} période(s) sans niveau ou sans tarif ne sont pas valorisées.</b> ` : ''}Un étudiant inscrit dans deux sections compte dans chacune.</p>`;

  const sexConnu = tot.periodes - SX.NR.periodes;
  const tSexes = `<table><thead><tr><th>Section</th>${['Femmes', 'Hommes', 'X', 'Non renseigné', '% femmes', '% hommes']
      .map(c => `<th class="n">${c}</th>`).join('')}</tr></thead>
    <tbody>${d.sections.map(S => { const v = S.sexes; const c = S.periodes - v.NR.periodes; return `<tr><td>${esc(S.section)}</td>
      <td class="n">${n0(v.F.periodes)}</td><td class="n">${n0(v.M.periodes)}</td><td class="n">${n0(v.X.periodes)}</td>
      <td class="n">${n0(v.NR.periodes)}</td><td class="n">${pc(v.F.periodes, c)}</td><td class="n">${pc(v.M.periodes, c)}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr class="repere"><td>Ensemble</td><td class="n">${n0(SX.F.periodes)}</td><td class="n">${n0(SX.M.periodes)}</td>
      <td class="n">${n0(SX.X.periodes)}</td><td class="n">${n0(SX.NR.periodes)}</td><td class="n">${pc(SX.F.periodes, sexConnu)}</td>
      <td class="n">${pc(SX.M.periodes, sexConnu)}</td></tr></tfoot></table>
    <p class="fin">En périodes données. Les pourcentages portent sur les périodes dont l'enseignant a son sexe renseigné
      — <b>${pc(sexConnu, tot.periodes)} des périodes</b> ; le reste se complète sur la fiche (Ma fiche ou Personnel).</p>`;

  // LES DROITS ET LES FRAIS : ce que paient les étudiants, et à qui cela revient.
  const R = d.recettes || {};
  const tRecettes = `<table class="serre"><thead><tr><th>Section</th>${['DI (€)', 'DIS (€)', 'Frais adm. (€)', 'Total dû (€)',
      'Versé (€)', 'Frais / étudiant (€)'].map(c => `<th class="n">${c}</th>`).join('')}</tr></thead>
    <tbody>${d.sections.map(S => { const x = S.recettes; const dû = x.di + x.dis + x.frais; return `<tr><td>${esc(S.section)}</td>
      <td class="n">${k0(x.di)}</td><td class="n">${k0(x.dis)}</td><td class="n">${k0(x.frais)}</td><td class="n g">${k0(dû)}</td>
      <td class="n">${k0(x.verse)}</td><td class="n">${S.inscrits ? k0(dû / S.inscrits) : '—'}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr class="repere"><td>Ensemble</td><td class="n">${k0(R.di)}</td><td class="n">${k0(R.dis)}</td><td class="n">${k0(R.frais)}</td>
      <td class="n">${k0((R.di || 0) + (R.dis || 0) + (R.frais || 0))}</td><td class="n">${k0(R.verse)}</td>
      <td class="n">${R.etudiants ? k0(((R.di || 0) + (R.dis || 0) + (R.frais || 0)) / R.etudiants) : '—'}</td></tr></tfoot></table>
    <p class="fin">Calcul de la fiche de chaque étudiant (Frais de scolarité) : <b>droit d'inscription</b> (forfait + montant par période,
      plafonné) et <b>frais administratifs</b> (fixe + montant par période du PAE), qui <b>restent à l'établissement</b> ;
      <b>droit d'inscription spécifique</b>, qui revient à la Fédération. Barèmes réglables dans la fiche Frais de scolarité.
      ${R.exoneres ? `${n0(R.exoneres)} étudiant(s) exonéré(s) du droit d'inscription. ` : ''}« Versé » : les paiements encodés à ce jour.
      Un étudiant inscrit dans deux sections est réparti entre elles au prorata des périodes de ses UE.
      Sur ${n0(R.etudiants || 0)} inscrits, le coût complet par étudiant est de ${ins ? eur(tot.cout_complet / ins) : '—'} ;
      ce que l'établissement perçoit (droit d'inscription et frais administratifs : ${eur((R.di || 0) + (R.frais || 0))})
      en couvre ${tot.cout_complet && ((R.di || 0) + (R.frais || 0)) ? pc((R.di || 0) + (R.frais || 0), tot.cout_complet) : '—'}.</p>`;

  const tFonctions = d.missions.length ? `<table><thead><tr><th>Personne</th><th>Fonction</th><th>Portée</th>
      <th class="n" style="width:14mm">ETP</th><th class="n" style="width:28mm">Temps plein / an</th><th class="n" style="width:24mm">Coût</th></tr></thead>
    <tbody>${d.missions.map(m => `<tr><td>${esc(`${m.prenom || ''} ${String(m.nom || '').toUpperCase()}`.trim())}</td>
      <td>${esc(m.fonction)}</td><td>${esc(m.portee)}</td>
      <td class="n">${m.etp ? e1(m.etp) : '<span class="fin">à régler</span>'}</td>
      <td class="n">${m.annuel ? eur(m.annuel) : '<span class="fin">à régler</span>'}</td>
      <td class="n">${m.cout ? eur(m.cout) : '—'}</td></tr>`).join('')}</tbody>
    <tfoot><tr class="repere"><td colspan="5">Ensemble des fonctions</td><td class="n">${eur(tot.cout_fonctions)}</td></tr></tfoot></table>
    <p class="fin">Coût = ETP × coût annuel d'un temps plein.${d.sans_etp ? ` <b>${d.sans_etp} fonction(s) sans ETP</b> (onglet Fonctions de la fiche) ne sont pas comptées.` : ''}${d.sans_cout ? ` <b>${d.sans_cout} fonction(s) sans coût annuel</b> (Configuration → Coût des périodes) ne sont pas comptées.` : ''}</p>`
    : '<p class="fin">Aucune fonction encodée pour cette année (onglet Fonctions de la fiche du personnel).</p>';

  // UNITÉ PAR UNITÉ : une ligne par statut, le calcul écrit.
  const calc = (per, tarif, cout) => (per ? `${n0(per)} × ${m2(tarif)} = ${eur(cout)}` : '—');
  const detail = d.sections.map(S => `
    <tr class="groupe"><td colspan="5">${esc(S.section)}<span class="fin"> — ${eur(S.cout)} · ${pc(S.statuts.CC.periodes, S.periodes)} CC · ${pc(S.statuts.EXP.periodes, S.periodes)} EXP</span></td></tr>
    ${S.ues.map(u => `<tr class="repere"><td>UE ${u.ue_num} — ${esc(u.ue_nom || '')}</td><td class="n">${u.niveau || '—'}</td>
        <td class="n" colspan="2">${pc(u.statuts.CC.periodes, u.periodes)} CC · ${pc(u.statuts.EXP.periodes, u.periodes)} EXP</td>
        <td class="n">${eur(u.cout)}</td></tr>
      ${['CC', 'EXP', 'AUTRE'].filter(k => u.statuts[k].periodes).map(k => { const x = u.statuts[k]; return `<tr>
        <td style="padding-left:6mm">${libStatut[k]}</td><td></td>
        <td class="n">${calc(x.per_ct, u.tarif_ct, x.cout_ct)}</td><td class="n">${calc(x.per_pp, u.tarif_pp, x.cout_pp)}</td>
        <td class="n">${eur(x.cout)}</td></tr>`; }).join('')}`).join('')}`).join('');

  const corps = `
    ${rangeeTuiles([
      tuile({ valeur: eur(tot.cout_complet), libelle: 'Coût complet', precision: `${d.sections.length} section(s)`, ton: 'fort' }),
      tuile({ valeur: eur(tot.cout), libelle: 'Cours', precision: `${n0(tot.periodes)} périodes attribuées` }),
      tuile({ valeur: pc(ST.CC.periodes, tot.periodes), libelle: 'Chargés de cours', precision: `${pc(ST.EXP.periodes, tot.periodes)} experts (périodes)` }),
      tuile({ valeur: eur(tot.cout_fonctions), libelle: 'Fonctions', precision: `${d.missions.length} fonction(s) encodée(s)` }),
      tuile({ valeur: ins ? eur(tot.cout_complet / ins) : '—', libelle: 'Par étudiant', precision: `${n0(ins)} inscrits` }),
    ])}
    ${(() => {
      const parEtu = d.sections.filter(S => S.inscrits && S.cout_complet).map(S => ({ s: S.section, v: S.cout_complet / S.inscrits })).sort((a, b) => b.v - a.v);
      const percu = (R.di || 0) + (R.frais || 0);
      const manque = (d.sans_etp || 0) + (d.sans_cout || 0);
      return enBref([
        `Le <b>coût complet</b> de l'année est de <b>${eur(tot.cout_complet)}</b> : ${eur(tot.cout)} de cours (${pc(tot.cout, tot.cout_complet)}) et ${eur(tot.cout_fonctions)} de fonctions.`,
        ins ? `Il revient en moyenne à <b>${eur(tot.cout_complet / ins)} par étudiant</b> inscrit${parEtu.length > 1 ? ` — de ${eur(parEtu[parEtu.length - 1].v)} en ${esc(parEtu[parEtu.length - 1].s)} à ${eur(parEtu[0].v)} en ${esc(parEtu[0].s)}` : ''}.` : '',
        `Les <b>chargés de cours</b> donnent ${pc(ST.CC.periodes, tot.periodes)} des périodes, les <b>experts</b> ${pc(ST.EXP.periodes, tot.periodes)}.`,
        tot.cout_helb ? `Les <b>contrats HELB</b> représentent ${eur(tot.cout_helb)}, soit ${pc(tot.cout_helb, tot.cout)} du coût des cours.` : '',
        percu ? `Les étudiants doivent <b>${eur(percu + (R.dis || 0))}</b> ; l'établissement perçoit ${eur(percu)} (droit d'inscription et frais), qui couvrent <b>${pc(percu, tot.cout_complet)}</b> du coût complet ; ${eur(R.verse)} versés à ce jour.` : '',
        manque ? `Le coût des fonctions est <b>incomplet</b> : ${manque} fonction(s) sans ETP ou sans coût annuel.` : (tot.cout_fonctions ? '' : 'Aucun coût de fonction n\'est encore réglé : il manque les montants annuels (Configuration) et les ETP (fiche, onglet Fonctions).'),
      ]);
    })()}
    ${regle}
    ${rangeeCamemberts(
      camembert('Chargés de cours et experts — périodes', ['CC', 'EXP', 'AUTRE'].map(k => ({ nom: libStatut[k], valeur: ST[k].periodes,
        couleur: coulStatut[k], pale: coulStatut[k] === GRIS })), { note: `CC ${eur(ST.CC.cout)} · EXP ${eur(ST.EXP.cout)}` }),
      camembert('Femmes et hommes — périodes', ['F', 'M', 'X', 'NR'].map(k => ({ nom: libSexe[k], valeur: SX[k].periodes,
        couleur: coulSexe[k], pale: coulSexe[k] === GRIS })), { note: `sexe renseigné pour ${pc(sexConnu, tot.periodes)} des périodes` }),
      camembert('Coût complet — cours et fonctions', [{ nom: 'Cours', valeur: tot.cout, couleur: K.bleu },
        { nom: 'Fonctions', valeur: tot.cout_fonctions, couleur: K.or }], { total: `${Math.round(tot.cout_complet / 1000).toLocaleString('fr-BE')} k€` }),
      camembert('Ce que paient les étudiants', [{ nom: "Droit d'inscription", valeur: R.di || 0, couleur: K.bleu },
        { nom: 'Frais administratifs', valeur: R.frais || 0, couleur: K.or }, { nom: 'Droit spécifique (FWB)', valeur: R.dis || 0, couleur: K.cyan }],
        { total: `${Math.round(((R.di || 0) + (R.frais || 0) + (R.dis || 0)) / 1000).toLocaleString('fr-BE')} k€` }))}
    ${duo(
      camembert('Coût des cours par section', d.sections.filter(S => S.cout).map((S, i) => ({ nom: esc(S.section), valeur: S.cout, couleur: couleursSerie(K)[i % 10] })),
        { total: `${Math.round(tot.cout / 1000).toLocaleString('fr-BE')} k€` }),
      camembert('Périodes par type de cours', [{ nom: 'Cours généraux et techniques (CT)', valeur: d.sections.reduce((t, S) => t + (S.per_ct || 0), 0), couleur: K.bleu },
        { nom: 'Pratique professionnelle (PP)', valeur: d.sections.reduce((t, S) => t + (S.per_pp || 0), 0), couleur: K.or }]))}
    ${duo(
      cadreGraphe('Coût complet par section', barres({ donnees: d.sections.map(S => ({ nom: esc(S.section), valeur: S.cout_complet, couleur: K.marine, texte: eur(S.cout_complet) })) })),
      cadreGraphe('Coût complet par étudiant inscrit', barres({ donnees: d.sections.filter(S => S.inscrits)
        .sort((a, b) => b.cout_complet / b.inscrits - a.cout_complet / a.inscrits)
        .map(S => ({ nom: esc(S.section), valeur: S.cout_complet / S.inscrits, couleur: K.donnees, texte: eur(S.cout_complet / S.inscrits) })) })))}
    ${duo(
      parSection('CC et EXP par section', S => S.statuts, ['CC', 'EXP', 'AUTRE'], libStatut, coulStatut),
      parSection('Femmes et hommes par section', S => S.sexes, ['F', 'M', 'X', 'NR'], libSexe, coulSexe))}

    <h2>Section par section</h2>${tSections}
    <h2>Droits d'inscription et frais</h2>
    ${duo(
      cadreGraphe('Ce que paient les étudiants', `<p class="fin">${eur((R.di || 0) + (R.dis || 0) + (R.frais || 0))} dus, dont
        ${eur((R.di || 0) + (R.frais || 0))} pour l'établissement (droit d'inscription et frais administratifs)
        et ${eur(R.dis || 0)} de droit spécifique pour la Fédération · ${eur(R.verse)} versés à ce jour.</p>`),
      cadreGraphe('Frais administratifs par section', barres({ donnees: [...d.sections].filter(S => S.recettes.frais)
        .sort((a, b) => b.recettes.frais - a.recettes.frais)
        .map(S => ({ nom: esc(S.section), valeur: S.recettes.frais, couleur: K.or, texte: eur(S.recettes.frais) })) })))}
    ${tRecettes}
    <h2>Femmes et hommes</h2>${tSexes}
    <h2>Fonctions — direction, secrétariat, coordinations</h2>${tFonctions}

    <h2>Unité par unité — le calcul</h2>
    <table><thead><tr><th>Unité</th><th class="n" style="width:14mm">Niveau</th>
      <th class="n" style="width:42mm">CT : périodes × €</th><th class="n" style="width:42mm">PP : périodes × €</th>
      <th class="n" style="width:24mm">Coût</th></tr></thead><tbody>${detail}</tbody></table>`;

  return {
    corps,
    entete: { titre: 'Coût des formations', sous: `Année académique ${p.annee} · cours au montant des conventions, fonctions au coût annuel` },
    titre: 'Coût des formations',
    nom: `Cout-formations-${p.annee}.html`,
    orientation: 'paysage',
    styles: STYLE_RAPPORT + STYLE_REPORTING + STYLE_STATS,
  };
}

/**
 * LES CHIFFRES CLÉS PAR SECTION — pour le conseil d'entreprise. L'année en
 * cours, au jour de l'impression. Une donnée personnelle peu remplie se
 * montre avec son taux, jamais comme une répartition complète.
 */
function documentChiffresCles(p) {
  const d = donneesChiffresCles(p.annee);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const n0 = n => Math.round(n || 0).toLocaleString('fr-BE');
  const n1 = n => (n == null ? '—' : (Math.round(n * 10) / 10).toString().replace('.', ','));
  const n2 = n => (n == null ? '—' : (n || 0).toFixed(2).replace('.', ','));
  const pc = (k, n) => (n ? `${Math.round(k / n * 100)} %` : '—');
  const z = v => (v ? n0(v) : '<span class="fin">0</span>');
  const E = d.ensemble.etudiants, P = d.ensemble.personnel;
  const taux = (r, quoi) => quoi.map(([lib, inconnu]) => `${lib} : ${pc(r.n - inconnu, r.n)}`).join(' · ');
  const dateRef = d.ref.split('-').reverse().join('/');

  const tete = (cols) => `<thead><tr>${cols.map(([c, w]) => `<th${w ? ` class="n" style="width:${w}mm"` : ''}>${c}</th>`).join('')}</tr></thead>`;
  const pied = (cells) => `<tfoot><tr class="repere">${cells.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr></tfoot>`;

  const tEtu = `<table>${tete([['Section'], ['Inscrits', 16], ['F', 11], ['M', 11], ['X', 9], ['?', 9], ['Âge moyen', 17],
      ['&lt; 25', 12], ['25-34', 12], ['35-44', 12], ['45 +', 12], ['SLE', 11]])}
    <tbody>${d.lignes.filter(l => l.etudiants.n).map(l => { const e = l.etudiants; return `<tr><td>${esc(l.section)}</td>
      <td class="n g">${n0(e.n)}</td><td class="n">${z(e.F)}</td><td class="n">${z(e.M)}</td><td class="n">${z(e.X)}</td>
      <td class="n">${z(e.sexe_inconnu)}</td><td class="n">${n1(e.age_moyen)}</td>
      <td class="n">${z(e.m25)}</td><td class="n">${z(e.m35)}</td><td class="n">${z(e.m45)}</td><td class="n">${z(e.p45)}</td>
      <td class="n">${z(e.sle)}</td></tr>`; }).join('')}</tbody>
    ${pied(['Ensemble (chaque étudiant une fois)', n0(E.n), n0(E.F), n0(E.M), n0(E.X), n0(E.sexe_inconnu), n1(E.age_moyen),
      n0(E.m25), n0(E.m35), n0(E.m45), n0(E.p45), n0(E.sle)])}</table>
    <p class="fin">Sexe connu pour ${pc(E.n - E.sexe_inconnu, E.n)} des inscrits, âge pour ${pc(E.n - E.age_inconnu, E.n)}.
      Un étudiant inscrit dans deux sections compte dans chacune ; l'ensemble le compte une fois.</p>`;

  const paysTri = Object.entries(E.pays).sort((a, b) => b[1] - a[1]);
  const tNat = `<table>${tete([['Section'], ['Inscrits', 16], ['Belgique', 18], ['Union europ.', 20], ['Hors UE', 17],
      ['Non renseignée', 24], ['Connue', 15]])}
    <tbody>${d.lignes.filter(l => l.etudiants.n).map(l => { const e = l.etudiants; return `<tr><td>${esc(l.section)}</td>
      <td class="n">${n0(e.n)}</td><td class="n">${z(e.be)}</td><td class="n">${z(e.ue)}</td><td class="n">${z(e.hors_ue)}</td>
      <td class="n">${z(e.nat_inconnue)}</td><td class="n g">${pc(e.n - e.nat_inconnue, e.n)}</td></tr>`; }).join('')}</tbody>
    ${pied(['Ensemble', n0(E.n), n0(E.be), n0(E.ue), n0(E.hors_ue), n0(E.nat_inconnue), pc(E.n - E.nat_inconnue, E.n)])}</table>
    <p class="fin">${E.n - E.nat_inconnue < E.n * 0.8
      ? `<b>La nationalité n'est connue que pour ${pc(E.n - E.nat_inconnue, E.n)} des inscrits</b> : ces chiffres disent qui a été encodé, pas la composition réelle des sections. `
      : ''}${paysTri.length ? `Pays les plus représentés : ${paysTri.slice(0, 8).map(([n, c]) => `${esc(n)} (${c})`).join(', ')}.` : ''}</p>`;

  const libAcces = Object.fromEntries(TITRES_ACCES); const libMax = Object.fromEntries(DIPLOMES_MAX);
  const repartition = (comptes, libs, connu) => (connu
    ? Object.entries(comptes).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${esc(libs[k] || k)} : ${c}`).join(' · ')
    : 'non renseigné');
  const tDipl = (E.acces_connu || E.max_connu)
    ? `<table>${tete([['Section'], ['Inscrits', 16], ["Titre d'accès connu", 30], ['Plus haut diplôme connu', 34]])}
      <tbody>${d.lignes.filter(l => l.etudiants.n).map(l => { const e = l.etudiants; return `<tr><td>${esc(l.section)}</td>
        <td class="n">${n0(e.n)}</td><td class="n">${pc(e.acces_connu, e.n)}</td><td class="n">${pc(e.max_connu, e.n)}</td></tr>`; }).join('')}</tbody></table>
      <p class="fin"><b>Titre d'accès</b> — ${repartition(E.acces, libAcces, E.acces_connu)}.<br>
        <b>Plus haut diplôme</b> — ${repartition(E.max, libMax, E.max_connu)}.</p>`
    : `<p class="fin">Le titre d'accès et le plus haut diplôme ne sont encore renseignés pour aucun inscrit
        (fiche de l'étudiant, onglet Identité, ou Import sur mesure).</p>`;

  const tPers = `<table>${tete([['Section'], ['Membres', 16], ['CC', 11], ['EXP', 11], ['IIP', 11], ['HELB', 12],
      ['ETP', 15], ['F', 10], ['M', 10], ['X', 9], ['?', 10], ['Âge moyen', 17]])}
    <tbody>${d.lignes.filter(l => l.personnel.n || l.etp).map(l => { const q = l.personnel; return `<tr><td>${esc(l.section)}</td>
      <td class="n g">${n0(q.n)}</td><td class="n">${z(q.cc)}</td><td class="n">${z(q.exp)}</td>
      <td class="n">${z(q.iip)}</td><td class="n">${z(q.helb)}</td><td class="n g">${n2(l.etp)}</td>
      <td class="n">${z(q.F)}</td><td class="n">${z(q.M)}</td><td class="n">${z(q.X)}</td><td class="n">${z(q.sexe_inconnu)}</td>
      <td class="n">${n1(q.age_moyen)}</td></tr>`; }).join('')}</tbody>
    ${pied(['Ensemble (chaque membre une fois)', n0(P.n), n0(P.cc), n0(P.exp), '', '', n2(d.ensemble.etp),
      n0(P.F), n0(P.M), n0(P.X), n0(P.sexe_inconnu), n1(P.age_moyen)])}</table>
    <p class="fin">${taux(P, [['Sexe connu', P.sexe_inconnu], ['âge', P.age_inconnu], ['nationalité', P.nat_inconnue]])}
      · titres de capacité encodés pour ${pc(P.avec_titres, P.n)} des membres.
      ETP de Pilotage (CT/800 + PP/1000). Un membre attribué dans deux sections compte dans chacune.</p>`;

  const tOffre = `<table>${tete([['Section'], ['UE', 14], ['Cours', 16], ['Périodes', 20]])}
    <tbody>${d.lignes.filter(l => l.ues).map(l => `<tr><td>${esc(l.section)}</td><td class="n">${n0(l.ues)}</td>
      <td class="n">${n0(l.cours)}</td><td class="n">${n0(l.periodes)}</td></tr>`).join('')}</tbody>
    ${pied(['Ensemble', n0(d.ensemble.ues), '', n0(d.ensemble.periodes)])}</table>
    <p class="fin">Périodes de cours du dossier pédagogique ; les activités Z (travail de l'étudiant, sans enseignant) n'y entrent pas.</p>`;

  const corps = `
    ${rangeeTuiles([
      tuile({ valeur: n0(E.n), libelle: 'Étudiants inscrits', precision: `${d.lignes.filter(l => l.etudiants.n).length} section(s)`, ton: 'fort' }),
      tuile({ valeur: n1(E.age_moyen), unite: 'ans', libelle: 'Âge moyen', precision: `connu pour ${pc(E.n - E.age_inconnu, E.n)}` }),
      tuile({ valeur: pc(E.F, E.n - E.sexe_inconnu), libelle: 'Étudiantes', precision: `${n0(E.F)} F · ${n0(E.M)} M${E.X ? ` · ${n0(E.X)} X` : ''}` }),
      tuile({ valeur: n0(P.n), libelle: 'Membres du personnel', precision: `${n0(P.cc)} CC · ${n0(P.exp)} EXP` }),
      tuile({ valeur: n2(d.ensemble.etp), unite: 'ETP', libelle: 'Charge', precision: `${n0(d.ensemble.ues)} UE organisées` }),
    ])}
    ${(() => {
      const secs = d.lignes.filter(l => l.etudiants.n).sort((a, b) => b.etudiants.n - a.etudiants.n);
      const top = secs[0];
      const sexeConnu = E.n - E.sexe_inconnu, ageConnu = E.n - E.age_inconnu, natConnue = E.n - E.nat_inconnue;
      const pcs = (k, n) => (n ? Math.round(k / n * 100) : 0);
      return enBref([
        `<b>${n0(E.n)} étudiants</b> sont inscrits en ${esc(p.annee)}, répartis en ${secs.length} sections${top ? ` ; <b>${esc(top.section)}</b> en rassemble ${pc(top.etudiants.n, E.n)}` : ''}.`,
        sexeConnu >= E.n * 0.5 ? `Les <b>femmes</b> représentent <b>${pc(E.F, sexeConnu)}</b> des inscrits dont le sexe est connu.`
          : `Le sexe n'est connu que pour ${pc(sexeConnu, E.n)} des inscrits : pas de conclusion à en tirer.`,
        ageConnu >= E.n * 0.5 ? `L'<b>âge moyen</b> est de <b>${n1(E.age_moyen)} ans</b> ; ${pc(E.m25, ageConnu)} ont moins de 25 ans, ${pc(E.p45, ageConnu)} ont 45 ans ou plus.` : '',
        natConnue >= E.n * 0.8 ? `${pc(E.be, natConnue)} des inscrits sont belges, ${pc(E.ue, natConnue)} d'un autre pays de l'Union, ${pc(E.hors_ue, natConnue)} hors Union.`
          : `La <b>nationalité</b> n'est connue que pour <b>${pc(natConnue, E.n)}</b> des inscrits : à compléter avant d'en tirer une répartition.`,
        E.sle ? `<b>${n0(E.sle)}</b> étudiants (${pc(E.sle, E.n)}) sont en <b>séjour limité aux études</b>.` : 'Aucun étudiant n\'est marqué en séjour limité aux études.',
        E.exo?.exoneres ? `<b>${n0(E.exo.exoneres)}</b> étudiants (${pc(E.exo.exoneres, E.n)}) sont <b>exonérés</b> du droit d'inscription.`
          : 'Aucune <b>exonération</b> du droit d\'inscription n\'est encodée : le motif se coche sur la fiche de l\'étudiant.',
        `<b>${n0(P.n)} membres</b> du personnel assurent <b>${n2(d.ensemble.etp)} ETP</b>${d.ensemble.etp ? `, soit ${n1(E.n / d.ensemble.etp)} étudiants par ETP` : ''} ; ${pc(P.cc, P.n)} sont chargés de cours, ${pc(P.exp, P.n)} experts.`,
        `L'offre compte <b>${n0(d.ensemble.ues)} unités</b> organisées et <b>${n0(d.ensemble.periodes)} périodes</b> de cours.`,
      ]);
    })()}
    ${(() => { const K = paletteStats(); const g = { couleur: GRIS_INCONNU, pale: true };
      const serie = couleursSerie(K);
      const secsN = d.lignes.filter(l => l.etudiants.n).sort((a, b) => b.etudiants.n - a.etudiants.n);
      const pays = Object.entries(E.pays || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const libMotif = Object.fromEntries(MOTIFS_DI.map(m => [m.code, m.libelle]));
      const couleursMotifs = [K.bleu, K.or, K.cyan, K.marine, K.donnees, K.helb, '#64748b', '#94a3b8'];
      const motifs = Object.entries(E.exo?.motifs || {}).sort((a, b) => b[1] - a[1]);
      return `
    ${duo(
      cadreGraphe('Inscrits par section', barres({ donnees: d.lignes.filter(l => l.etudiants.n)
        .map(l => ({ nom: esc(l.section), valeur: l.etudiants.n, couleur: K.donnees, texte: n0(l.etudiants.n) })) })),
      cadreGraphe('ETP par section', barres({ donnees: d.lignes.filter(l => l.etp).sort((a, b) => b.etp - a.etp)
        .map(l => ({ nom: esc(l.section), valeur: l.etp, couleur: K.marine, texte: `${n2(l.etp)} ETP` })) })))}
    <h2>Les étudiants</h2>
    ${duo(
      camembert('Inscrits par section', secsN.map((l, i) => ({ nom: esc(l.section), valeur: l.etudiants.n, couleur: serie[i % serie.length] }))),
      cadreGraphe('Âge moyen par section', barres({ donnees: secsN.filter(l => l.etudiants.age_moyen != null)
        .map(l => ({ nom: esc(l.section), valeur: l.etudiants.age_moyen, couleur: K.donnees, texte: `${n1(l.etudiants.age_moyen)} ans` })) })))}
    ${rangeeCamemberts(...camembertsProfil(E, K, 'inscrits'),
      camembert('Séjour limité aux études', [{ nom: 'SLE', valeur: E.sle, couleur: K.or }, { nom: 'Autres', valeur: E.n - E.sle, couleur: K.bleu }]))}
    ${rangeeCamemberts(
      camembert("Exonérés du droit d'inscription", [{ nom: 'Exonérés', valeur: E.exo?.exoneres || 0, couleur: K.or },
        { nom: 'Non exonérés', valeur: E.n - (E.exo?.exoneres || 0), couleur: K.bleu }],
        { note: E.exo?.exoneres ? '' : 'aucune exonération encodée sur les fiches' }),
      motifs.length ? camembert('Motifs d’exonération', motifs.map(([m, n], i) => ({ nom: esc(libMotif[m] || 'Motif non précisé'),
        valeur: n, couleur: couleursMotifs[i % couleursMotifs.length] }))) : '',
      camembert("Titre d'accès", Object.entries(E.acces || {}).map(([k, n], i) => ({ nom: esc(Object.fromEntries(TITRES_ACCES)[k] || k), valeur: n,
        couleur: couleursMotifs[i % couleursMotifs.length] })).concat([{ nom: 'Non renseigné', valeur: E.n - (E.acces_connu || 0), ...g }])))}
    ${duo(
      pays.length ? cadreGraphe('Pays les plus représentés', barres({ donnees: pays.map(([n, c]) => ({ nom: esc(n), valeur: c, couleur: K.cyan, texte: n0(c) })) }),
        `parmi les ${n0(E.n - E.nat_inconnue)} inscrits dont la nationalité est connue`) : '',
      cadreGraphe('Étudiants par ETP, par section', barres({ donnees: d.lignes.filter(l => l.etudiants.n && l.etp)
        .sort((a, b) => b.etudiants.n / b.etp - a.etudiants.n / a.etp)
        .map(l => ({ nom: esc(l.section), valeur: l.etudiants.n / l.etp, couleur: K.marine, texte: n1(l.etudiants.n / l.etp) })) })))}
    <h2>Le personnel</h2>
    ${rangeeCamemberts(...camembertsProfil(P, K, 'membres'),
      camembert('Statut', [{ nom: 'Chargés de cours', valeur: P.cc, couleur: K.bleu }, { nom: 'Experts', valeur: P.exp, couleur: K.cyan },
        { nom: 'Autre', valeur: P.n - P.cc - P.exp, ...g }]))}`; })()}
    <h2>Étudiants — sexe et âge</h2>${tEtu}
    <h2>Étudiants — nationalités</h2>${tNat}
    <h2>Étudiants — diplômes</h2>${tDipl}
    <h2>Personnel et charge</h2>${tPers}
    <h2>Offre de formation</h2>${tOffre}`;

  return {
    corps,
    entete: {
      titre: 'Chiffres clés par section',
      sous: `Année académique ${p.annee} · situation au ${dateRef}`,
    },
    titre: 'Chiffres clés par section',
    nom: `Chiffres-cles-${p.annee}.html`,
    orientation: 'paysage',
    styles: STYLE_RAPPORT + STYLE_REPORTING + STYLE_STATS,
  };
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
        precision: global ? `${Math.round((tot.etp_iip || 0) / global * 100)} %` : '—' }),
      tuile({ valeur: n2((tot.etp_helb || 0) + coord), unite: 'ETP', libelle: 'Haute École',
        precision: global ? `${Math.round(((tot.etp_helb || 0) + coord) / global * 100)} %` : '—' }),
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
        precision: etp > 0 ? `${Math.round(etpIip / etp * 100)} %` : '—' }),
      tuile({ valeur: n2(etp - etpIip), unite: 'ETP', libelle: 'Haute École',
        precision: etp > 0 ? `${Math.round((etp - etpIip) / etp * 100)} %` : '—' }),
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
        precision: part(sec.etp_iip) }),
      tuile({ valeur: n2(sec.etp_helb + etpCoord), unite: 'ETP', libelle: 'Haute École',
        precision: `${part(sec.etp_helb + etpCoord)}${etpCoord > 0
          ? ` · dont ${n2(etpCoord)} de coordination` : ''}` }),
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
    id: 'resultats-section', domaine: 'etudiants', params: ['annee', 'session'],
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
    id: 'dotation-emploi', domaine: 'gestion', params: ['annee'],
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
    id: 'etp', domaine: 'gestion', params: ['annee', 'portee', 'etudiants'],
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

  {
    /* LE COÛT RÉEL DES FORMATIONS (Charles, 6 octobre 2026 — circulaire des
       conventions n° 9789 ; montants réglables dans Configuration). */
    id: 'cout-formations', domaine: 'gestion', params: ['annee'],
    libelle: 'Coût des formations',
    aide: "Chaque période attribuée au montant de la circulaire des conventions, par section et par unité — et par étudiant inscrit.",
    colonnes: COLS([['section', 'Section', 24], ['per_ct', 'Pér. CT'], ['per_pp', 'Pér. PP'], ['cout', 'Cours (€)'],
      ['cout_cc', 'dont CC (€)'], ['cout_exp', 'dont EXP (€)'], ['pc_cc', '% CC'], ['pc_exp', '% EXP'],
      ['cout_helb', 'dont HELB (€)'], ['inscrits', 'Inscrits'], ['fonctions', 'Fonctions (€)'], ['complet', 'Complet (€)'],
      ['par_etudiant', 'Par étudiant (€)']]),
    lignes: (p) => donneesCout(p.annee).sections.map(S => ({ section: S.section, per_ct: Math.round(S.per_ct),
      per_pp: Math.round(S.per_pp), cout: Math.round(S.cout),
      cout_cc: Math.round(S.statuts.CC.cout), cout_exp: Math.round(S.statuts.EXP.cout),
      pc_cc: S.periodes ? Math.round(S.statuts.CC.periodes / S.periodes * 100) : null,
      pc_exp: S.periodes ? Math.round(S.statuts.EXP.periodes / S.periodes * 100) : null,
      cout_helb: Math.round(S.cout_helb), inscrits: S.inscrits,
      fonctions: Math.round(S.part_fonctions), complet: Math.round(S.cout_complet),
      par_etudiant: S.inscrits ? Math.round(S.cout_complet / S.inscrits) : null })),
    document: (p) => documentCoutFormations(p),
  },
  {
    /* LES CHIFFRES CLÉS PAR SECTION (Charles, 6 octobre 2026 — conseil
       d'entreprise : ETP, étudiants, UE, nationalités ; « c'est pour l'année
       en cours »). Chaque donnée personnelle dit combien de fiches la portent. */
    id: 'chiffres-cles', domaine: 'gestion', params: ['annee'],
    libelle: 'Chiffres clés par section',
    aide: "Étudiants (sexe, âge, nationalités, diplômes), personnel, ETP et offre, section par section — avec le taux de remplissage de chaque donnée.",
    colonnes: COLS([['section', 'Section', 24], ['inscrits', 'Inscrits'], ['femmes', 'F'], ['hommes', 'M'],
      ['x', 'X'], ['age', 'Âge moyen'], ['nat', 'Nationalité connue'], ['personnel', 'Personnel'],
      ['etp', 'ETP'], ['ues', 'UE'], ['periodes', 'Périodes']]),
    lignes: (p) => donneesChiffresCles(p.annee).lignes.map(l => ({
      section: l.section, inscrits: l.etudiants.n, femmes: l.etudiants.F, hommes: l.etudiants.M, x: l.etudiants.X,
      age: l.etudiants.age_moyen != null ? Math.round(l.etudiants.age_moyen * 10) / 10 : null,
      nat: l.etudiants.n ? `${Math.round((l.etudiants.n - l.etudiants.nat_inconnue) / l.etudiants.n * 100)} %` : '—',
      personnel: l.personnel.n, etp: l.etp != null ? Math.round(l.etp * 100) / 100 : null,
      ues: l.ues, periodes: l.periodes,
    })),
    document: (p) => documentChiffresCles(p),
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
    /* LES STATISTIQUES DU PERSONNEL (Charles, 6 octobre 2026 — conseil
       d'entreprise : « je veux les statistiques pour les profs »). */
    id: 'statistiques-personnel', domaine: 'personnel', params: ['annee'],
    libelle: 'Statistiques du personnel',
    aide: "Statut, nomination, employeur, charge individuelle, domicile, sexe, âge et nationalité — en graphiques, section par section, avec la part des fiches renseignées.",
    colonnes: COLS([['section', 'Section', 24], ['membres', 'Membres'], ['cc', 'CC'], ['exp', 'EXP'],
      ['definitifs', 'Définitifs'], ['iip', 'IIP'], ['helb', 'HELB'], ['etp', 'ETP']]),
    lignes: (p) => donneesPersonnel(p.annee).sections.map(x => ({ section: x.section, membres: x.n, cc: x.cc,
      exp: x.exp, definitifs: x.definitif, iip: x.iip, helb: x.helb, etp: Math.round(x.etp_section * 100) / 100 })),
    document: (p) => documentPersonnelStats(p),
  },
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
    id: 'referentiel-ue', domaine: 'organisation', params: ['annee'],
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
    id: 'referentiel-cours', domaine: 'organisation', params: ['annee', 'section'],
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
    id: 'referentiel-poids-ue', domaine: 'organisation', params: ['annee', 'section'],
    libelle: 'Poids des unités — périodes et heures',
    aide: "Une ligne par unité : nombre de cours, périodes, heures, autonomie et ECTS.",
    colonnes: COLS([['section', 'Section', 24], ['ue_num', 'UE', 8],
      ['ue_nom', 'Intitulé', 42], ['nb_cours', 'Cours', 10],
      ['periodes', 'Périodes'], ['heures', 'Heures'],
      ['autonomie', 'Autonomie'], ['ects', 'ECTS', 8]]),
    lignes: (p) => db.prepare(`
      SELECT u.section, u.ue_num, u.ue_nom, u.ects, u.ue_aut AS autonomie,
             COUNT(c.cours_code) AS nb_cours,
             -- Les activités Z ne comptent pas : aucun enseignant, aucune charge.
             SUM(CASE WHEN c.ct_pp = 'Z' THEN 0 ELSE c.cours_per END) AS periodes,
             ROUND(SUM(CASE WHEN c.ct_pp = 'Z' THEN 0
               ELSE COALESCE(c.heures, c.cours_per * 50.0 / 60.0) END), 1) AS heures
        FROM ue u
        LEFT JOIN cours c ON c.ue_num = u.ue_num AND c.annee_scolaire = u.annee_scolaire
       WHERE u.annee_scolaire = ? AND (? IS NULL OR u.section = ?)
       GROUP BY u.section, u.ue_num, u.ue_nom, u.ects, u.ue_aut
       ORDER BY u.section, u.ue_num`).all(p.annee, p.section, p.section),
  },
  {
    id: 'grille-section', domaine: 'organisation', params: ['annee', 'section'],
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
    id: 'referentiel-profs-ue', domaine: 'organisation', params: ['annee', 'section'],
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
    id: 'referentiel-acquis', domaine: 'organisation', params: [],
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
    /* LA RÉPARTITION DES ACQUIS PAR COURS ET PAR UNITÉ (Charles, 6 octobre
       2026 : « je souhaiterais pouvoir imprimer la répartition des AA par
       cours/UE »). Lue dans structureUE — la fonction même de la
       délibération : la pièce dit ce qui sera calculé, pas ce qu'on croit
       avoir paramétré. Une bande par unité ; le cours, ses périodes et son
       poids sur sa première ligne ; puis ses acquis et leurs points. */
    id: 'repartition-acquis', domaine: 'organisation', params: ['annee', 'section'],
    libelle: 'Répartition des acquis par cours et par unité',
    aide: "Pour chaque unité : ses cours, leurs périodes et leur poids, et les acquis reliés à chacun avec leurs points.",
    colonnes: COLS([['unite', 'Unité', 30], ['cours', 'Cours', 34], ['poids', 'Poids du cours', 16],
      ['aa_code', 'Acquis', 12], ['points', 'Points', 8], ['description', 'Énoncé', 70]]),
    lignes: (p) => {
      const ues = db.prepare(`SELECT ue_num, MIN(ue_nom) AS ue_nom FROM ue
         WHERE annee_scolaire = ? AND (? IS NULL OR section = ?)
         GROUP BY ue_num ORDER BY ue_num`).all(p.annee, p.section, p.section);
      const fr = v => String(Math.round(Number(v) * 100) / 100).replace('.', ',');
      const out = [];
      for (const u of ues) {
        const unite = `UE ${u.ue_num} — ${u.ue_nom || ''}`.trim();
        for (const c of structureUE(u.ue_num, p.annee)) {
          const z = String(c.ct_pp || '').toUpperCase() === 'Z';
          const cours = `${c.cours_code} · ${c.cours_nom || ''}${c.periodes ? ` (${c.periodes} pér.${z ? ', Z' : ''})` : ''}`;
          const poids = c.non_evalue ? 'non évalué' : z ? '0 % (activité Z)'
            : c.poids_cours_affiche != null ? `${c.poids_cours_affiche} %` : '—';
          const aas = c.aas || [];
          if (!aas.length) {
            out.push({ unite, cours, poids, aa_code: '—', points: '',
              description: c.non_evalue ? '' : 'Aucun acquis relié à ce cours' });
            continue;
          }
          aas.forEach((a, i) => out.push({
            unite, cours: i === 0 ? cours : '', poids: i === 0 ? poids : '',
            aa_code: a.aa_code, points: a.poids != null ? fr(a.poids) : '—',
            description: a.description || '',
          }));
        }
      }
      return out;
    },
  },

  {
    id: 'referentiel-ue-sans-attribution', domaine: 'organisation', params: ['annee', 'section'],
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
    /* LES PAE HORS RÈGLE DE PRÉREQUIS (3.1.44, Charles, 5 octobre 2026 : « je
       devrais pouvoir sortir cela de Lucie »). Le calcul est lib/controlePae.js,
       le même que la face « PAE hors règle » de Contrôler les dossiers. La
       pièce écrit son propre corps (tuiles, constat et action par étudiant) ;
       les colonnes servent à l'export Excel. */
    // Une section choisie hors du périmètre ne l'élargit pas.
    id: 'pae-hors-regle', domaine: 'etudiants', params: ['annee', 'section'],
    libelle: 'PAE hors règle de prérequis',
    aide: "Les inscriptions de l'année dont le prérequis légal n'est pas acquis, sans dérogation : constat et action, par étudiant.",
    colonnes: COLS([['section', 'Section', 18], ['etudiant', 'Étudiant', 28], ['matricule', 'Matricule', 12],
      ['ue', 'UE inscrite', 34], ['prerequis', 'Prérequis légal', 34], ['historique', 'Historique du prérequis', 28],
      ['constat', 'Constat', 40], ['action', 'Action', 44]]),
    lignes: (p) => controlePrerequisPae(p.annee, { sections: sectionsControle(p) }).hors
      .map(l => ({ section: l.section, etudiant: `${String(l.nom || '').toUpperCase()} ${prenomSeul(l.prenom)}`,
        matricule: l.matricule, ue: `UE ${l.ue_num} · ${l.niv_ue || ''} · ${l.nom_ue || ''}`,
        prerequis: `UE ${l.prerequis_num} · ${l.niv_pre || ''} · ${l.nom_pre || ''}`,
        historique: l.historique || 'aucun', constat: l.constat, action: l.action })),
    document: (p) => {
      const c = controlePrerequisPae(p.annee, { sections: sectionsControle(p) });
      return { titre: `PAE ${p.annee} — inscriptions hors règle de prérequis`, orientation: 'paysage',
        nom: `PAE_hors_regle_${p.annee}${p.section ? '_' + p.section : ''}`,
        entete: { titre: `PAE ${p.annee} — inscriptions hors règle de prérequis`,
          sous: p.section ? `Section ${p.section}` : 'Toutes sections',
          mention: 'Document de travail interne — à régulariser par le secrétariat et les coordinations.' },
        styles: STYLES_CONTROLE_PAE, corps: corpsControlePae(c) };
    },
  },
  {
    /* LES EFFECTIFS PAR UNITÉ — « étudiants par UE » de l'ancien écran. C'est
       le chiffre qu'on croise avec la charge pour décider d'un dédoublement,
       et celui que l'AEQES redemande section par section. */
    id: 'organisation-effectifs', domaine: 'etudiants', params: ['annee', 'section'],
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
/**
 * METTRE EN PAGE UNE LISTE CONSTRUITE À L'ÉCRAN.
 *
 * L'écran « Listes » est un GÉNÉRATEUR : on y coche ses colonnes, on filtre, et
 * la liste qui en sort n'est pas une pièce du catalogue — c'est une extraction
 * à la demande. Elle n'avait donc, pour onze de ses seize types, aucune
 * impression du tout : CSV et Excel, rien d'autre. Les cinq autres passaient
 * par `window.open` et l'impression du navigateur — ni A4 imposé, ni en-tête,
 * ni pied, ni numérotation ; le format rendu à la boîte d'impression de chacun,
 * ce que le centre d'impression existe précisément pour supprimer.
 *
 * ON N'OUVRE PAS UNE DIXIÈME ENVELOPPE, ON OUVRE CELLE-CI. Cette route ne sait
 * rien des listes : elle reçoit des colonnes et des lignes, et les habille avec
 * `envelopperDocument` et `STYLE_RAPPORT` — la même enveloppe, le même pied, la
 * même règle de paysage au-delà de six colonnes que les rapports du catalogue.
 * Une liste imprimée depuis « Listes » et la même depuis « Éditions » sortent
 * ainsi habillées pareil, ce qui est tout l'enjeu.
 *
 * Rien de ce qui arrive n'est du HTML : tout est échappé. Le corps de la pièce
 * se construit ici, à partir de valeurs.
 */
r.post('/mise-en-page', authRequired, (req, res) => {
  const b = req.body || {};
  const titre = String(b.titre || 'Liste').slice(0, 200);
  /* LES COLONNES ARRIVENT SOUS DEUX FORMES, ET LES DEUX DOIVENT MARCHER.
   * L'écran des listes envoie désormais { label, cle } ; d'autres appelants —
   * et les versions déjà déployées — n'envoient qu'une chaîne. On normalise
   * ici plutôt que d'imposer une migration simultanée de tout ce qui appelle. */
  const colonnes = (Array.isArray(b.colonnes) ? b.colonnes.slice(0, 40) : [])
    .map(c => (c && typeof c === 'object')
      ? { label: String(c.label ?? c.entete ?? c.cle ?? ''), cle: String(c.cle ?? '') }
      : { label: String(c ?? ''), cle: '' });
  /* UNE PAGE PAR GROUPE (1er octobre 2026, UE 333 AESI : « il ne sait pas
     imprimer les listes de groupes différents »). `pages: [{ titre, lignes }]`
     sort chaque paquet sur sa feuille, sous son titre — un seul PDF, qu'on
     distribue groupe par groupe. Sans `pages`, rien ne change. */
  const pages = Array.isArray(b.pages) && b.pages.length
    ? b.pages.slice(0, 200).map(pg => ({ titre: String(pg?.titre || '').slice(0, 200),
        lignes: Array.isArray(pg?.lignes) ? pg.lignes.slice(0, 5000) : [] }))
    : null;
  const lignes = pages ? pages.flatMap(pg => pg.lignes).slice(0, 5000)
    : (Array.isArray(b.lignes) ? b.lignes.slice(0, 5000) : []);
  if (!colonnes.length) return res.status(400).json({ error: 'Aucune colonne à mettre en page.' });

  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const estNombre = v => v !== null && v !== '' && !isNaN(Number(v));

  // Une colonne dont TOUTES les valeurs sont des nombres s'aligne à droite et
  // se totalise : c'est ce que fait déjà le rendu des rapports, et deux
  // alignements pour une même colonne selon la porte d'entrée se verrait.
  const numerique = colonnes.map((_, i) =>
    lignes.length > 0 && lignes.every(l => {
      const v = Array.isArray(l) ? l[i] : null;
      return v === null || v === '' || estNombre(v);
    }) && lignes.some(l => estNombre(Array.isArray(l) ? l[i] : null)));

  const cellules = l => colonnes.map((_, i) => {
    const v = Array.isArray(l) ? l[i] : '';
    return `<td${numerique[i] ? ' class="n"' : ''}>${esc(v)}</td>`;
  }).join('');

  /* ON N'ADDITIONNE PAS CE QUI NE S'ADDITIONNE PAS.
   *
   * Le pied sommait TOUTE colonne dont les valeurs étaient des nombres — donc
   * les numéros d'unité, les codes, les millésimes, les quadrimestres. Sur la
   * grille de cours, la dernière ligne annonçait fièrement la somme des
   * numéros d'UE : un chiffre à quatre chiffres qui ne veut rien dire, posé en
   * gras sous une colonne qui, elle, en veut un. Une somme fausse est pire
   * qu'une case vide, parce qu'on la lit.
   *
   * Un nombre n'est pas forcément une quantité : un identifiant, un code, une
   * année, un rang se comptent mais ne s'ajoutent pas. On les reconnaît à leur
   * clé — c'est le seul critère stable, les valeurs se ressemblant toutes. Les
   * colonnes écartées reçoivent un tiret : la ligne dit alors « ici, il n'y a
   * rien à totaliser », ce qui est une information. */
  const IDENTIFIANT = /(^|_)(num|numero|code|id|annee|annee_scolaire|quadri|quadrimestre|niv|niveau|rang|matricule|fase|ordre)$/i;
  /* ET UNE SÉCURITÉ SUR LE LIBELLÉ, pour les appelants qui n'envoient que lui.
   * Le contrôle par la clé est le bon — il est stable et il ne dépend pas de
   * la langue. Mais une liste mise en page par un écran plus ancien n'a que
   * des intitulés, et c'est justement là qu'on a vu « Ensemble 14899 » sous une
   * colonne de numéros d'unité. Mieux vaut ne pas totaliser une colonne qui
   * l'aurait mérité que d'afficher un nombre qui ne veut rien dire : une somme
   * fausse, on la lit. */
  const LIBELLE_IDENTIFIANT =
    /^(n°|no|num|numéro|code|identifiant|id|ue|unité|année|annee|quadri(mestre)?|niveau|niv|bloc|rang|matricule|fase|ordre|section|session)\b/i;
  const sommable = colonnes.map((c, i) => numerique[i]
    && !IDENTIFIANT.test(c.cle || '')
    && !LIBELLE_IDENTIFIANT.test(c.label || ''));

  const aDesNombres = sommable.some(Boolean);
  const tableau = (lignes) => {
    const total = aDesNombres ? `<tfoot><tr class="repere">${colonnes.map((_, i) => {
      if (i === 0) return `<td><b>Ensemble — ${lignes.length} ligne(s)</b></td>`;
      if (!sommable[i]) return numerique[i] ? '<td class="n">—</td>' : '<td></td>';
      const s2 = lignes.reduce((acc, l) => acc + (Number(Array.isArray(l) ? l[i] : 0) || 0), 0);
      return `<td class="n"><b>${esc(Math.round(s2 * 100) / 100)}</b></td>`;
    }).join('')}</tr></tfoot>` : '';

    /* GROUPER PAR LA PREMIÈRE COLONNE, comme le fait déjà le rendu des rapports.
       Une liste de deux cents lignes sans bande de regroupement se lit à la
       règle : on suit du doigt pour savoir où une section finit. Le regroupement
       ne se déclenche que s'il APPREND quelque chose — une valeur qui ne se
       répète jamais ferait autant de bandes que de lignes, et deux valeurs pour
       deux cents lignes n'en font que deux. */
    const cle = l => String((Array.isArray(l) ? l[0] : '') ?? '—');
    const distinctes = new Set(lignes.map(cle));
    const groupable = lignes.length >= 4 && distinctes.size > 1
      && distinctes.size <= Math.max(2, Math.floor(lignes.length / 2));

    const sousTotal = (lot, titre) => `<tr class="repere">${colonnes.map((_, i) => {
      if (i === 0) return `<td>${esc(titre)}</td>`;
      if (!numerique[i]) return '<td></td>';
      const s2 = lot.reduce((a, l) => a + (Number(Array.isArray(l) ? l[i] : 0) || 0), 0);
      return `<td class="n">${esc(Math.round(s2 * 100) / 100)}</td>`;
    }).join('')}</tr>`;

    let corpsTable = '';
    if (groupable) {
      const paquets = new Map();
      for (const l of lignes) {
        const k = cle(l);
        if (!paquets.has(k)) paquets.set(k, []);
        paquets.get(k).push(l);
      }
      for (const [k, lot] of paquets) {
        /* LE REPÈRE DE BLOC. Quand la clé de regroupement EST un bloc — BA1,
           BE1, BA2, BA3 —, la bande prend sa couleur. Ailleurs elle garde le
           marine : une couleur posée sur un groupement qui n'est pas un bloc
           mentirait sur ce qu'elle désigne. */
        const b = /\bB[AE]?\s*1\b/i.test(k) ? ' bloc1'
          : /\bBA\s*2\b/i.test(k) ? ' bloc2'
            : /\bBA\s*3\b/i.test(k) ? ' bloc3' : '';
        corpsTable += `<tr class="groupe${b}"><td colspan="${colonnes.length}">${esc(k)}`
          + `<span class="fin"> — ${lot.length} ligne(s)</span></td></tr>`;
        corpsTable += lot.map(l => `<tr>${cellules(l)}</tr>`).join('');
        if (aDesNombres && lot.length > 1) corpsTable += sousTotal(lot, `Sous-total ${k}`);
      }
    } else {
      corpsTable = lignes.map(l => `<tr>${cellules(l)}</tr>`).join('');
    }

    const corps = `
        <table>
          <thead><tr>${colonnes.map((c, i) =>
            `<th${numerique[i] ? ' class="n"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody>${corpsTable
            || `<tr><td colspan="${colonnes.length}" class="vide">Aucune donnée.</td></tr>`}</tbody>
          ${total}
        </table>`;
    return corps;
  };
  const corps = pages
    ? pages.map((pg, i) => `<div class="page-groupe"${i ? ' style="break-before:page;page-break-before:always"' : ''}>
        <div class="titre-groupe" style="font-size:11pt;font-weight:700;color:#1B2B4B;margin:0 0 2.5mm;border-left:1.2mm solid #C9A84C;padding-left:2.5mm">${esc(pg.titre)} <span style="font-weight:400;font-size:9pt;color:#64748b">— ${pg.lignes.length} ligne(s)</span></div>
        ${tableau(pg.lignes)}</div>`).join('')
    : tableau(lignes);

  res.json({
    html: envelopperDocument({
      html: corps,
      titre,
      entete: {
        titre,
        sous: [b.annee ? `Année ${b.annee}` : null, b.section || null,
               `${lignes.length} ligne(s)`].filter(Boolean).join(' · '),
        mention: b.mention ? String(b.mention).slice(0, 300) : null,
      },
      // La même règle que les rapports : douze colonnes sur une A4 portrait
      // deviennent illisibles, et on les imprime pour les lire.
      orientation: colonnes.length > 6 ? 'paysage' : 'portrait',
      styles: STYLE_RAPPORT,
    }),
    titre,
  });
});

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

    /* ON N'ADDITIONNE PAS CE QUI NE S'ADDITIONNE PAS.
     *
     * Le pied totalisait toute colonne dont les valeurs sont des nombres —
     * donc les numéros d'unité, les codes, les millésimes, les quadrimestres.
     * Sur la grille de cours, la dernière ligne annonçait la somme des numéros
     * d'UE : un chiffre à quatre chiffres qui ne veut rien dire, en gras, sous
     * une colonne qui, elle, en veut un. Une somme fausse est pire qu'une case
     * vide, parce qu'on la lit.
     *
     * Un nombre n'est pas forcément une quantité : un identifiant, un code, une
     * année, un rang se comptent mais ne s'ajoutent pas. On les reconnaît à
     * leur CLÉ — seul critère stable, les valeurs se ressemblant toutes. La
     * colonne écartée reçoit un tiret plutôt qu'un blanc : elle dit alors qu'il
     * n'y a rien à totaliser là, ce qui est une information. */
    const IDENTIFIANT = /(^|_)(num|numero|code|id|annee|quadri|quadrimestre|niv|niveau|rang|matricule|fase|ordre)$/i;
    const cumulable = c => nombre(c) && !IDENTIFIANT.test(String(c.cle || ''));
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
        ${cols.slice(avant).map(c => `<td class="n">${cumulable(c)
          ? Math.round(somme(liste, c) * 100) / 100
          : nombre(c) ? '—' : ''}</td>`).join('')}
      </tr>`;
    };
    // Un rapport dont AUCUNE colonne ne s'additionne n'a pas de ligne de total :
    // une ligne « Ensemble » suivie de tirets n'apprend rien à personne.
    const aDesNombres = colonnes.some((c, i) => i > 0 && cumulable(c));

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

  /* UN TITRE NE S'ÉCRIT QU'UNE FOIS. Ce corps posait son propre `h1` et son
     sous-titre alors que l'enveloppe dessine déjà le cadre de titre : la pièce
     annonçait deux fois ce qu'elle est, à deux tailles et à deux places, et
     c'est autant de lignes avant la première donnée. Le titre part là où il
     doit être — dans l'en-tête — et le corps commence par le contenu. */
  const corps = `
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
      // Le titre et sa précision passent par l'EN-TÊTE, comme pour toutes les
      // autres pièces : le générateur n'a pas de raison d'avoir sa présentation.
      entete: { titre: b.titre || 'Rapport', sous: b.sous || null },
      // L'écran choisit le sens quand il en propose le choix ; à défaut, un
      // tableau large se lit en paysage.
      orientation: b.orientation === 'paysage' || b.orientation === 'portrait'
        ? b.orientation : (colonnes.length > 6 ? 'paysage' : 'portrait'),
      styles: STYLE_RAPPORT,
    }),
    titre: b.titre || 'Rapport',
  });
});

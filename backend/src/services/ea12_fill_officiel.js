/**
 * ea12_fill_officiel.js — l'EA12 (Annexe 1 bis PS, SUPÉRIEUR) : LE MODÈLE
 * OFFICIEL DE LA FWB, REMPLI, ET RENDU EN WORD.
 *
 * Charles, 27 septembre 2026 : « il doit être la copie conforme, mais
 * éditable ». Ni une imitation HTML, ni un Word reconstruit : le document
 * `A1_bis_EA12_SUP.docx` lui-même, dans lequel Lucie écrit ce qu'elle sait —
 * il est conforme parce que c'est lui, et éditable parce que c'est du Word.
 *
 * LE MODÈLE A ÉTÉ LU, PAS SUPPOSÉ (relevé du 27 septembre 2026) :
 *   · 19 tableaux, repérés par leur rang dans le document (T0…T18) ;
 *   · 57 cases à cocher Word (FORMCHECKBOX) dont les NOMS SE RÉPÈTENT
 *     (CaseACocher77 sert neuf fois) : on ne peut les désigner que par leur
 *     RANG, relevé case par case (CASES ci-dessous) ;
 *   · aucun champ texte : les valeurs vont dans les cellules, à la place des
 *     pointillés « …… », des dates « _ _ /_ _ /20_ _ » et des grilles de
 *     chiffres (ECOT, FASE, matricule).
 * La version précédente cherchait les cellules par leur libellé et se
 * trompait de cible : le nom, le matricule, l'ECOT n'étaient jamais écrits.
 *
 * Tout se fait par ÉPISSURE DE TEXTE dans un paragraphe : les runs gardent
 * leur mise en forme, seul leur texte change — la page reste celle de la FWB.
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const MODELE = path.join(import.meta.dirname, 'ea12-assets', 'A1_bis_EA12_SUP.docx');

// ── Les cases, par RANG dans le document (0 = la première) ──────────────────
const CASES = {
  wbe: 0, subventionne: 1, officiel: 2, libre: 3,
  derogation: 4,
  statut: { T: 5, TPr: 6, St: 7, D: 8, ACS: 9, APE: 10, PTP: 11 },
  pas_cumul: 12, transmission_tardive: 13,
  prest_sec: 14, prest_sup: 15, prest_exp: 16, prest_acs: 17, cumul_a2: 18,
  jours: { 4: 19, 5: 20, 6: 21 },
  mouvement: [22, 23, 24, 25, 26, 27, 28, 29, 30, 31], mouvement_autres: 32,
  justifs: [33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
  absence: [46, 47, 48],
  oe: [[49, 50], [51, 52], [53, 54], [55, 56]],   // [D, T] par remplaçant
};
const MOUVEMENTS = [
  'Entrée en fonction', 'Rentrée en fonction', 'Maintien d’attributions',
  'Augmentation d’attributions', 'Prolongation d’attributions',
  'Réduction d’attributions', 'Fin de fonctions (dernier jour presté)',
  'Nomination ou engagement à titre définitif',
  'Extension nomination/engagement à titre définitif',
  'Passerelle / Changement d’affectation / Mutation',
];
const JUSTIFICATIONS = [
  'Création d’emploi', 'Remplacement', 'Changement d’affectation',
  'Modification d’organisation interne', 'Congé / Absence / Disponibilité',
  'Perte partielle de charge', 'DPPR', 'Suppression d’emploi',
  'Fin de remplacement', 'Démission', 'Mise à la retraite', 'Décès', 'Autres',
];
const TYPE_ABSENCE = ['Absence d’un jour', 'Début absence de plus d’1 jour', 'Reprise après absence de plus d’1 jour'];
// L'apostrophe droite et la typographique se valent : l'éditeur a écrit les deux.
const norm = s => String(s ?? '').replace(/[’']/g, '’').trim();

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// ── Lecture de la structure ────────────────────────────────────────────────
/** Les tableaux dans l'ordre du document, avec la position de chaque cellule. */
function tableaux(x) {
  const tok = /<w:tbl>|<\/w:tbl>|<w:tr[ >]|<w:tc>|<\/w:tc>/g;
  const pile = [], tabs = [], cellules = [];
  let m;
  while ((m = tok.exec(x))) {
    const t = m[0];
    if (t === '<w:tbl>') { tabs.push({ rows: [] }); pile.push(tabs.length - 1); }
    else if (t === '</w:tbl>') pile.pop();
    else if (t.startsWith('<w:tr')) tabs[pile[pile.length - 1]].rows.push([]);
    else if (t === '<w:tc>') {
      const c = { s: m.index, e: -1 };
      tabs[pile[pile.length - 1]].rows.at(-1).push(c); cellules.push(c);
    } else {                                   // </w:tc> ferme la dernière ouverte
      for (let i = cellules.length - 1; i >= 0; i--) if (cellules[i].e < 0) { cellules[i].e = tok.lastIndex; break; }
    }
  }
  return tabs;
}
const cellule = (x, t, r, c) => tableaux(x)[t]?.rows[r]?.[c] || null;

/** Les paragraphes d'une plage, avec leur texte et la position de chaque <w:t>. */
function paragraphes(x, s, e) {
  const out = [];
  const re = /<w:p[ >][\s\S]*?<\/w:p>/g;
  re.lastIndex = s;
  let m;
  while ((m = re.exec(x)) && m.index < e) {
    // Un paragraphe qui contient un tableau imbriqué n'est pas une feuille : on saute.
    const p = m[0];
    const ts = [];
    const rt = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;
    let n, txt = '';
    while ((n = rt.exec(p))) {
      const brut = unesc(n[1]);
      ts.push({ s: m.index + n.index, e: m.index + n.index + n[0].length, deb: txt.length, texte: brut, ouv: n[0].slice(0, n[0].indexOf('>') + 1) });
      txt += brut;
    }
    out.push({ s: m.index, e: m.index + p.length, texte: txt, ts });
  }
  return out;
}

/** Remplace [a, b) du texte d'un paragraphe par `valeur`, en gardant les runs. */
function episser(x, para, a, b, valeur, run = null) {
  const touches = para.ts.filter(t => t.deb + t.texte.length > a && t.deb < b || (a === b && t.deb <= a && t.deb + t.texte.length >= a));
  if (!touches.length) {
    // Paragraphe sans texte : on pose un run avant la fin du paragraphe.
    const rpr = (/<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/.exec(x.slice(para.s, para.e)) || [])[1] || '';
    const fin = para.e - '</w:p>'.length;
    return x.slice(0, fin) + `<w:r>${rpr}<w:t xml:space="preserve">${esc(valeur)}</w:t></w:r>` + x.slice(fin);
  }
  let res = x;
  for (let i = touches.length - 1; i >= 0; i--) {
    const t = touches[i];
    const la = Math.max(0, a - t.deb), lb = Math.min(t.texte.length, b - t.deb);
    // `run` : la valeur prend sa propre mise en forme (un nom écrit à la taille
    // des pointillés qu'il remplace devient illisible).
    const neuf = (i === 0 ? t.texte.slice(0, la) + (run ? '' : valeur) : '') + (i === touches.length - 1 ? t.texte.slice(lb) : '');
    res = res.slice(0, t.s) + `<w:t xml:space="preserve">${esc(neuf)}</w:t>` + res.slice(t.e);
    if (run && i === 0) {
      const finRun = res.indexOf('</w:r>', t.s) + '</w:r>'.length;
      const rpr = `<w:rPr>${run.bold ? '<w:b/>' : ''}<w:sz w:val="${run.sz || 18}"/><w:szCs w:val="${run.sz || 18}"/></w:rPr>`;
      res = res.slice(0, finRun) + `<w:r>${rpr}<w:t xml:space="preserve">${esc(valeur)}</w:t></w:r>` + res.slice(finRun);
    }
  }
  return res;
}

/** Dans la plage, le premier paragraphe dont le texte répond à `motif` ; on
 *  remplace le groupe 1 (ou toute la correspondance) par `valeur`. */
function remplacer(x, plage, motif, valeur, { apres = null, run = null } = {}) {
  if (valeur == null || valeur === '') return x;
  let ps = paragraphes(x, plage.s, plage.e);
  if (apres) { const k = ps.findIndex(p => apres.test(p.texte)); if (k >= 0) ps = ps.slice(k); }
  for (const p of ps) {
    const m = motif.exec(p.texte);
    if (!m) continue;
    const g = m[1] != null ? m.index + m[0].indexOf(m[1]) : m.index;
    const lg = m[1] != null ? m[1].length : m[0].length;
    return episser(x, p, g, g + lg, String(valeur), run);
  }
  return x;
}
/** Ajoute `valeur` à la fin du premier paragraphe dont le texte répond à `motif`. */
function ajouter(x, plage, motif, valeur) {
  if (valeur == null || valeur === '') return x;
  for (const p of paragraphes(x, plage.s, plage.e)) {
    if (!motif.test(p.texte)) continue;
    return episser(x, p, p.texte.length, p.texte.length, ' ' + valeur);
  }
  return x;
}
/** Écrit `valeur` dans une cellule vide (premier paragraphe). */
function ecrireCellule(x, t, r, c, valeur) {
  if (valeur == null || valeur === '') return x;
  const cel = cellule(x, t, r, c);
  if (!cel) return x;
  const lignes = String(valeur).split('\n');
  const p = paragraphes(x, cel.s, cel.e)[0];
  if (!p) return x;
  if (lignes.length === 1) return episser(x, p, 0, p.texte.length, lignes[0]);
  // Plusieurs lignes : des sauts de ligne dans le même run.
  let y = episser(x, p, 0, p.texte.length, '\u0000');
  return y.replace(/<w:t xml:space="preserve">([^<]*)\u0000([^<]*)<\/w:t>/,
    (_, av, ap) => lignes.map((l, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${i === 0 ? av : ''}${esc(l)}${i === lignes.length - 1 ? ap : ''}</w:t>`).join(''));
}
/** Une grille de chiffres : un caractère par case. */
function grille(x, t, r, c0, valeur, n) {
  const chars = String(valeur ?? '').replace(/\s/g, '').split('').slice(0, n);
  let y = x;
  chars.forEach((ch, i) => { y = ecrireCellule(y, t, r, c0 + i, ch); });
  return y;
}

/** Coche la case de rang `k` (FORMCHECKBOX). */
function cocher(x, k) {
  let i = -1;
  return x.replace(/<w:checkBox>([\s\S]*?)<\/w:checkBox>/g, (tout, corps) => {
    i++;
    if (i !== k) return tout;
    const sans = corps.replace(/<w:checked[^>]*\/>/g, '').replace(/<w:default w:val="0"\/>/, '<w:default w:val="1"/>');
    const avecDefaut = /<w:default /.test(sans) ? sans : sans + '<w:default w:val="1"/>';
    return `<w:checkBox>${avecDefaut}<w:checked/></w:checkBox>`;
  });
}

const DATE = /(_\s*_\s*\/\s*_\s*_\s*\/\s*20\s*_\s*_)/;
const POINTS = /([….]{6,})/;

// ── Le remplissage ──────────────────────────────────────────────────────────
export async function remplirModeleOfficiel(d) {
  const zip = await JSZip.loadAsync(fs.readFileSync(MODELE));
  let x = await zip.file('word/document.xml').async('string');
  const etab = d.etab || {};
  const C = (t, r, c) => cellule(x, t, r, c);

  // En-tête : année, document n°, dernier Doc12
  const an = /(\d{4})\D+(\d{4})/.exec(String(d.annee || ''));
  if (an) {
    x = ecrireCellule(x, 0, 0, 3, an[1][2]); x = ecrireCellule(x, 0, 0, 4, an[1][3]);
    x = ecrireCellule(x, 0, 0, 8, an[2][2]); x = ecrireCellule(x, 0, 0, 9, an[2][3]);
  }
  if (d.doc_num) {
    const ch = String(d.doc_num).split('');
    ch.forEach((c, i) => { x = ecrireCellule(x, 0, 2, 1 + i, c); });
  }
  x = remplacer(x, { s: 0, e: C(1, 0, 0)?.s || x.length }, /Dernier Doc12[^_]*(_\s*_\s*\/\s*_\s*_\s*\/\s*20\s*_\s*_)/, d.dernier_doc12);

  // Établissement
  const type = String(etab.type_po || '').toUpperCase();
  if (type === 'WBE') x = cocher(x, CASES.wbe);
  else if (type) {
    x = cocher(x, CASES.subventionne);
    x = cocher(x, String(etab.sous_type || '').toLowerCase() === 'officiel' ? CASES.officiel : CASES.libre);
  }
  x = grille(x, 3, 0, 0, etab.num_ecot, 10);
  x = grille(x, 4, 0, 0, etab.num_fase, 5);
  x = ecrireCellule(x, 2, 4, 1, etab.po_nom);
  x = ecrireCellule(x, 2, 5, 1, etab.etab_nom);
  x = ecrireCellule(x, 2, 6, 1, etab.adresse);
  const local = v => String(v || '').replace(/@.*$/, '');
  x = remplacer(x, C(2, 7, 1), /ec(\s+)@/, ` ${local(etab.email_ec)} `);
  x = remplacer(x, C(2, 8, 1), /po(\s+)@/, ` ${local(etab.email_po)} `);
  x = ajouter(x, C(2, 4, 3), /Nom\s*:/, etab.gest_nom);
  x = ajouter(x, C(2, 5, 3), /Prénom\s*:/, etab.gest_prenom);
  x = ajouter(x, C(2, 6, 3), /Qualité\s*:/, etab.gest_qualite);
  x = ajouter(x, C(2, 7, 3), /Tél/, etab.gest_tel);
  x = ajouter(x, C(2, 8, 3), /E-mail/, etab.gest_email);

  // Membre du personnel
  x = grille(x, 6, 0, 0, d.matricule, 11);
  x = remplacer(x, C(5, 1, 0), /NOM\s*:\s*([….]+)/, d.prof_nom ? ` ${d.prof_nom}` : null, { run: { sz: 20, bold: true } });
  x = remplacer(x, C(5, 1, 0), /Prénom\s*:\s*([….]+)/, d.prof_prenom ? ` ${d.prof_prenom}` : null, { run: { sz: 20 } });
  x = ajouter(x, C(5, 2, 1), /^\s*1\)\s*$/, d.titre1);
  x = ajouter(x, C(5, 2, 1), /^\s*2\)\s*$/, d.titre2);
  if (d.derogation_titre) x = cocher(x, CASES.derogation);
  if (CASES.statut[d.statut] != null) x = cocher(x, CASES.statut[d.statut]);

  // Cumul, transmission tardive, jours
  for (const k of ['pas_cumul', 'transmission_tardive', 'prest_sec', 'prest_sup', 'prest_exp', 'prest_acs', 'cumul_a2']) {
    if (d[k]) x = cocher(x, CASES[k]);
  }
  if (CASES.jours[Number(d.jours)] != null) x = cocher(x, CASES.jours[Number(d.jours)]);

  // Événement
  x = remplacer(x, C(8, 1, 0), DATE, d.date_evenement);
  x = ecrireSemaines();
  function ecrireSemaines() {
    if (!d.semaines) return x;
    // La case des semaines est un cadre à droite du libellé : on écrit après.
    return ajouter(x, C(8, 1, 1), /Semaines de fonctionnement/, String(d.semaines));
  }
  const iMv = MOUVEMENTS.findIndex(m => norm(m) === norm(d.type_evenement));
  if (iMv >= 0) x = cocher(x, CASES.mouvement[iMv]);
  else if (norm(d.type_evenement) === 'Autres') {
    x = cocher(x, CASES.mouvement_autres);
    x = remplacer(x, C(9, 1, 2), POINTS, d.type_evenement_autres, { apres: /Autres/ });
  }
  const justifs = (d.justifs || (d.justif ? [d.justif] : [])).map(norm);
  JUSTIFICATIONS.forEach((j, i) => { if (justifs.includes(norm(j))) x = cocher(x, CASES.justifs[i]); });
  if (justifs.includes('Autres')) {
    const row = tableaux(x)[9]?.rows[1] || [];
    x = remplacer(x, row[row.length - 1], POINTS, d.justif_autres, { apres: /Autres/ });
  }
  const iAbs = TYPE_ABSENCE.findIndex(a => norm(a) === norm(d.type_absence));
  if (iAbs >= 0) {
    x = cocher(x, CASES.absence[iAbs]);
    const row = tableaux(x)[9]?.rows[2] || [];
    const celMotif = row.find(c => /Motif de l/.test(paragraphes(x, c.s, c.e).map(p => p.texte).join('')));
    if (celMotif) x = remplacer(x, celMotif, POINTS, d.motif_absence, { apres: /Motif de l/ });
    const celDates = () => (tableaux(x)[9]?.rows[2] || []).find(c => /Date de début/.test(paragraphes(x, c.s, c.e).map(p => p.texte).join('')));
    if (celDates()) x = remplacer(x, celDates(), /Date de début[^_]*(_\s*_\s*\/\s*_\s*_\s*\/\s*20\s*_\s*_)/, d.date_debut_absence);
    if (celDates()) x = remplacer(x, celDates(), /Date de fin[^_]*(_\s*_\s*\/\s*_\s*_\s*\/\s*20\s*_\s*_)/, d.date_fin_absence);
  }

  // Observations
  x = ecrireCellule(x, 11, 0, 0, d.observations);

  // Page 2 : ECOT, FASE
  x = grille(x, 13, 0, 0, etab.num_ecot, 10);
  x = grille(x, 14, 0, 0, etab.num_fase, 5);

  // Attributions : 18 lignes dans le modèle ; au-delà, on en ajoute sur le
  // même dessin — tronquer ferait partir un document faux sans le dire.
  const attrs = (d.attributions || []).filter(a => a && (a.ue || a.denomination || a.nb_periodes));
  if (attrs.length > 18) {
    const tb = tableaux(x)[15];
    const derniere = tb.rows[18];
    const debutLigne = x.lastIndexOf('<w:tr', derniere[0].s);
    const finLigne = x.indexOf('</w:tr>', derniere.at(-1).e) + '</w:tr>'.length;
    const gabarit = x.slice(debutLigne, finLigne);
    x = x.slice(0, finLigne) + gabarit.repeat(attrs.length - 18) + x.slice(finLigne);
  }
  const COL = ['ue', 'f', 'denomination', 'cla', 'periode_occ', 'tctl', 'nb_periodes', 'titre', 'sit_adm', 'di', 'oe'];
  attrs.forEach((a, i) => COL.forEach((k, c) => { x = ecrireCellule(x, 15, 1 + i, c, a[k]); }));

  // Attributions actuelles : le total par classification et TC/TL.
  const tot = {};
  for (const a of attrs) {
    const cle = `${a.cla || '—'}|${a.tctl || '—'}`;
    tot[cle] = (tot[cle] || 0) + (Number(a.nb_periodes) || 0);
  }
  const cles = Object.keys(tot);
  if (cles.length) {
    x = ecrireCellule(x, 16, 2, 0, cles.map(k => k.split('|')[0]).join('\n'));
    x = ecrireCellule(x, 16, 2, 1, cles.map(k => k.split('|')[1]).join('\n'));
    x = ecrireCellule(x, 16, 2, 2, cles.map(k => String(tot[k])).join('\n'));
  }

  // Origine de l'événement : les MDP remplacés
  (d.oe_slots || []).slice(0, 4).forEach((o, i) => {
    if (!o) return;
    const cel = () => cellule(x, 17, 1 + i, 1);
    x = remplacer(x, cel(), /N° Mat\s*:\s*((?:_\s*){11})/, o.num_mat ? `${o.num_mat} ` : null);
    x = remplacer(x, cel(), /Nom, prénom\s*:\s*([….]+)/, o.nom_prenom ? ` ${o.nom_prenom}` : null);
    x = remplacer(x, cel(), /Motif de remplacement\s*:\s*([….]+)/, o.motif ? ` ${o.motif}` : null);
    const dF = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : v; };
    x = remplacer(x, cel(), /du\s*(_\s*_\s*\/\s*_\s*_\s*\/\s*20\s*_\s*_)/, dF(o.date_debut));
    x = remplacer(x, cel(), /au\s*(_\s*_\s*\/\s*_\s*_\s*\/\s*20\s*_\s*_)/, dF(o.date_fin));
    if (o.type === 'D') x = cocher(x, CASES.oe[i][0]);
    if (o.type === 'T') x = cocher(x, CASES.oe[i][1]);
  });

  zip.file('word/document.xml', x);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export default remplirModeleOfficiel;

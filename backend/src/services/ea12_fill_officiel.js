/**
 * ea12_fill_officiel.js — Remplit le MODÈLE OFFICIEL FWB (A1_bis_EA12_SUP.docx)
 * Remplit : entête, établissement, prof, cases à cocher, TABLEAU DES ATTRIBUTIONS.
 */
import fs   from 'fs';
import path from 'path';
import JSZip from 'jszip';

const MODELE = path.join(import.meta.dirname, 'ea12-assets', 'A1_bis_EA12_SUP.docx');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

/** Génère un run Arial avec le texte fourni */
function runVal(valeur, { size = 18, bold = false, center = false } = {}) {
  const rpr = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>${bold?'<w:b/>':''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
  return `<w:r>${rpr}<w:t xml:space="preserve">${esc(valeur)}</w:t></w:r>`;
}

/** Injecte `valeur` dans la cellule voisine à droite du libellé trouvé */
function injecterCelluleVoisine(xml, libelle, valeur, opts = {}) {
  if (!valeur) return xml;
  const tcRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
  const cells = []; let m;
  while ((m = tcRe.exec(xml)) !== null) cells.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  const idx = cells.findIndex(c => c.text.includes(libelle));
  if (idx === -1 || idx + 1 >= cells.length) return xml;
  const cible = cells[idx + 1];
  let nc = cible.text.replace(/(<\/w:pPr>)/, `$1${runVal(valeur, opts)}`);
  if (nc === cible.text) nc = cible.text.replace(/(<w:p\b[^>]*>)/, `$1${runVal(valeur, opts)}`);
  return xml.slice(0, cible.start) + nc + xml.slice(cible.end);
}

/** Injecte `valeur` après les pointillés (___) du libellé */
function injecterApresPointilles(xml, libelle, valeur, opts = {}) {
  if (!valeur) return xml;
  const idx = xml.indexOf(libelle);
  if (idx === -1) return xml;
  const after = xml.slice(idx);
  const ptRe = /(<w:t[^>]*>)([^<]*_{3,})(<\/w:t>)/;
  const pm = ptRe.exec(after);
  if (!pm) return xml;
  const prefix = pm[2].match(/^[^_]*/)[0];
  const souligne = pm[2].slice(prefix.length);
  const reste = souligne.slice(Math.min(esc(String(valeur)).length + 1, souligne.length));
  const remplacement = `${pm[1]}${esc(prefix + String(valeur) + ' ')}${reste}${pm[3]}`;
  const absStart = idx + pm.index;
  return xml.slice(0, absStart) + remplacement + xml.slice(absStart + pm[0].length);
}

/** Injecte des chiffres dans les cases individuelles après le libellé */
function injecterCasesChiffres(xml, libelleAvant, chiffres) {
  const tcRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
  const cells = []; let m;
  while ((m = tcRe.exec(xml)) !== null) cells.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  const libIdx = cells.findIndex(c => c.text.includes(libelleAvant));
  if (libIdx === -1) return xml;
  let out = xml, offset = 0, placed = 0;
  for (let k = libIdx + 1; k < cells.length && placed < chiffres.length; k++) {
    const c = cells[k];
    if (/<w:t[^>]*>[^<\s]/.test(c.text)) continue;
    const ch = chiffres[placed++];
    let nc = c.text;
    if (/<w:pPr>/.test(nc)) {
      if (!/<w:jc\b/.test(nc)) nc = nc.replace(/<w:pPr>/, '<w:pPr><w:jc w:val="center"/>');
      nc = nc.replace(/(<\/w:pPr>)/, `$1${runVal(ch, { size: 16, bold: true })}`);
    } else {
      nc = nc.replace(/(<w:p\b[^>]*>)/, `$1<w:pPr><w:jc w:val="center"/></w:pPr>${runVal(ch, { size: 16, bold: true })}`);
    }
    out = out.slice(0, c.start + offset) + nc + out.slice(c.end + offset);
    offset += nc.length - c.text.length;
  }
  return out;
}

/** Coche les cases à cocher aux indices donnés */
function cocherCases(xml, indices) {
  const set = new Set(indices); let i = -1;
  return xml.replace(/<w:checkBox>[\s\S]*?<\/w:checkBox>/g, mm => {
    i++;
    if (!set.has(i)) return mm;
    return '<w:checkBox><w:sizeAuto/><w:default w:val="1"/><w:checked w:val="1"/></w:checkBox>';
  });
}

/**
 * Remplit une cellule du tableau des attributions.
 * Remplace le contenu de la 1ère cellule vide d'une ligne par le texte.
 * On cible les w:tc dans la ligne et on injecte le run dans le paragraphe vide.
 */
function remplirCellule(cellule, valeur, opts = {}) {
  if (!valeur) return cellule;
  // Injecter un run après les rPr du paragraphe
  let nc = cellule.replace(/(<\/w:pPr>)/, `$1${runVal(valeur, opts)}`);
  if (nc === cellule) {
    // Pas de pPr : injecter directement après l'ouverture du paragraphe
    nc = cellule.replace(/(<w:p\b[^>]*>)(?![\s\S]*<w:r\b)/, `$1${runVal(valeur, opts)}`);
  }
  return nc;
}

/**
 * Remplit les lignes du tableau des attributions (tableau 11 dans le XML).
 * Le tableau a 19 lignes : 1 header + 18 lignes vides.
 * Colonnes : UE | F | Dénomination | CLA | Pér. occupation | TC/TL | Nb périodes | Titre | Sit.adm. | DI | N° OE
 */
function remplirTableauAttributions(xml, attributions) {
  if (!attributions || !attributions.length) return xml;

  // Trouver les tables dans le XML
  const tableRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  let tableIdx = 0;
  xml = xml.replace(tableRe, (table) => {
    tableIdx++;
    // On cherche le tableau des attributions = celui qui contient U.E. et Dénomination
    if (!table.includes('U.E.') || !table.includes('nomination')) return table;

    // Trouver toutes les lignes (w:tr)
    const rowRe = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
    const rows = [];
    let rm;
    while ((rm = rowRe.exec(table)) !== null) rows.push({ text: rm[0], start: rm.index, end: rm.index + rm[0].length });

    // Remplir les lignes 1..N (en sautant la ligne 0 = header)
    let newTable = table;
    let offset = 0;

    for (let r = 1; r < rows.length && r - 1 < attributions.length; r++) {
      const attr = attributions[r - 1];
      let row = rows[r].text;

      // Trouver les cellules de cette ligne
      const cellRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
      const cells = [];
      let cm;
      while ((cm = cellRe.exec(row)) !== null) cells.push({ text: cm[0], start: cm.index, end: cm.index + cm[0].length });

      if (cells.length < 7) continue;

      // Colonnes : 0=UE, 1=F, 2=Dénomination, 3=CLA, 4=Pér.occ., 5=TC/TL, 6=Nb pér, 7=Titre, 8=Sit.adm., 9=DI, 10=OE
      const vals = [
        { idx: 0, val: attr.ue,          opts: { size: 16, bold: true } },
        { idx: 1, val: attr.f || 'D',    opts: { size: 16 } },
        { idx: 2, val: attr.denomination,opts: { size: 16 } },
        { idx: 3, val: attr.cla,         opts: { size: 16 } },
        { idx: 4, val: attr.periode_occ, opts: { size: 16 } },
        { idx: 5, val: attr.tctl || 'TC',opts: { size: 16 } },
        { idx: 6, val: attr.nb_periodes, opts: { size: 16, bold: true } },
        { idx: 7, val: attr.titre,        opts: { size: 14 } },
        { idx: 8, val: attr.sit_adm,      opts: { size: 14 } },
        { idx: 9, val: attr.di,           opts: { size: 14 } },
        { idx: 10,val: attr.oe,           opts: { size: 14 } },
      ];

      // Appliquer les valeurs aux cellules
      let newRow = row;
      let cellOffset = 0;
      for (const { idx, val, opts } of vals) {
        if (idx >= cells.length || !val) continue;
        const cell = cells[idx];
        const newCell = remplirCellule(cell.text, val, opts);
        if (newCell !== cell.text) {
          newRow = newRow.slice(0, cell.start + cellOffset) + newCell + newRow.slice(cell.end + cellOffset);
          cellOffset += newCell.length - cell.text.length;
        }
      }

      // Remplacer la ligne dans le tableau
      newTable = newTable.slice(0, rows[r].start + offset) + newRow + newTable.slice(rows[r].end + offset);
      offset += newRow.length - rows[r].text.length;
    }
    return newTable;
  });
  return xml;
}

/** Remplit l'année académique (cases chiffres dans le header) */
function remplirAnnee(xml, annee) {
  // annee = "2025-2026" → on extrait "25" et "26"
  if (!annee) return xml;
  const m = annee.match(/(\d{4})[/-](\d{4})/);
  if (!m) return xml;
  const [, d1, d2] = m;
  // Cases : 2 0 _ _ / / 2 0 _ _  (les 2 et 0 sont fixes, on injecte les 2 derniers chiffres)
  return injecterCasesChiffres(xml, 'Année académique', [...d1.slice(2), ...d2.slice(2)]);
}

// ─── Index des cases à cocher (cartographie du modèle A1_bis_EA12_SUP.docx) ──
// 0=WBE, 1=FWB(sub), 2=Officiel, 3=Libre, 4=Dérogation titre
// 5=T, 6=TPr, 7=St, 8=ACS, 10=APE, 11=PTP
// 12=Pas cumul interne, 13=Circ.6930, 14=Secondaire, 15=Supérieur, 16=Expert, 17=ACS/APE
// 18=Cumul interne A2, 19=Jours4, 20=Jours5, 21=Jours6
// 22=Entrée, 23=Rentrée, 24=Maintien, 25=Augmentation, 26=Prolongation
// 27=Réduction, 28=Fin fonctions, 29=Nomination, 30=Extension, 31=Passerelle
// 32=Autres mvt, 33=Création, 34=Remplacement, 35=Chgt affectation, 36=Modif interne
// 37=Congé, 38=Perte charge, 39=DPPR, 40=Suppression, 41=Fin remplacement
// 42=Démission, 43=Retraite, 44=Décès, 45=Autres justif, 46-48=Absences, 49-56=Remplacements

export async function remplirModeleOfficiel(data) {
  const buf = fs.readFileSync(MODELE);
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file('word/document.xml').async('string');
  const e = data.etab || {};

  // ── Établissement ────────────────────────────────────────────────────────
  xml = injecterCelluleVoisine(xml, 'Nom du PO', e.po_nom);
  xml = injecterCelluleVoisine(xml, 'Nom de l\u2019\u00e9tablissement', e.etab_nom);
  xml = injecterCelluleVoisine(xml, 'Adresse compl\u00e8te', e.adresse);
  xml = injecterCelluleVoisine(xml, 'Nom\u00a0:', e.gest_nom);
  xml = injecterCelluleVoisine(xml, 'Pr\u00e9nom\u00a0:', e.gest_prenom);
  xml = injecterCelluleVoisine(xml, 'Qualit\u00e9\u00a0:', e.gest_qualite);
  xml = injecterCelluleVoisine(xml, 'T\u00e9l. direct\u00a0:', e.gest_tel);
  xml = injecterCelluleVoisine(xml, 'E-mail\u00a0:', e.gest_email);

  // ── Année académique + N° document ───────────────────────────────────────
  xml = remplirAnnee(xml, data.annee);
  if (data.doc_num) xml = injecterCelluleVoisine(xml, 'Document n\u00b0', data.doc_num);

  // ── ECOT / FASE / Matricule ───────────────────────────────────────────────
  if (e.num_ecot) xml = injecterCasesChiffres(xml, '(10 derniers chiffres)', e.num_ecot.replace(/\D/g, ''));
  if (e.num_fase) xml = injecterCasesChiffres(xml, 'N\u00b0 FASE', e.num_fase.replace(/\D/g, ''));
  if (data.matricule) xml = injecterCasesChiffres(xml, 'Matricule enseignant', String(data.matricule).replace(/\D/g, ''));

  // ── Identification MDP ────────────────────────────────────────────────────
  xml = injecterApresPointilles(xml, 'NOM\u00a0:', data.prof_nom, { bold: true, size: 18 });
  xml = injecterApresPointilles(xml, 'Pr\u00e9nom\u00a0:', data.prof_prenom, { bold: true, size: 18 });
  if (data.titre1) xml = injecterCelluleVoisine(xml, '1)', data.titre1);
  if (data.titre2) xml = injecterCelluleVoisine(xml, '2)', data.titre2);

  // ── Événement ────────────────────────────────────────────────────────────
  if (data.date_evenement) xml = injecterCelluleVoisine(xml, 'Date de l\u2019\u00e9v\u00e9nement', data.date_evenement);
  if (data.semaines) xml = injecterCelluleVoisine(xml, 'Semaines de fonctionnement', data.semaines);

  // ── Cases à cocher ────────────────────────────────────────────────────────
  const indices = [1, 3, 15]; // Fixes IIP : FWB + Libre + Supérieur

  const statutMap = { T: 5, TPr: 6, St: 7, D: 8, ACS: 9, APE: 10, PTP: 11 };
  if (data.statut && statutMap[data.statut] !== undefined) indices.push(statutMap[data.statut]);

  if (data.pas_cumul) indices.push(12);
  if (data.prest_sec) indices.push(14);
  if (data.prest_exp) indices.push(16);

  const joursMap = { 4: 19, 5: 20, 6: 21 };
  if (data.jours && joursMap[Number(data.jours)]) indices.push(joursMap[Number(data.jours)]);

  const justifMap = {
    entree_en_fonction:       22,
    rentree_en_fonction:      23,
    maintien_attributions:    24,
    augmentation_attributions:25,
    prolongation_attributions:26,
    reduction_attributions:   27,
    fin_fonctions:            28,
    nomination:               29,
    extension:                30,
    passerelle:               31,
    autres_mouvement:         32,
    creation_emploi:          33,
    remplacement:             34,
    changement_affectation:   35,  // ← corrigé (était manquant)
    modification_interne:     36,
    conge_absence:            37,
    perte_charge:             38,
    dppr:                     39,
    suppression_emploi:       40,
    fin_remplacement:         41,
    demission:                42,
    mise_retraite:            43,
    deces:                    44,
    autres_justif:            45,
  };
  if (data.justif && justifMap[data.justif] !== undefined) indices.push(justifMap[data.justif]);

  xml = cocherCases(xml, [...new Set(indices)]);

  // ── Tableau des attributions ───────────────────────────────────────────────
  if (data.attributions && data.attributions.length) {
    xml = remplirTableauAttributions(xml, data.attributions);
  }

  // ── Observations ─────────────────────────────────────────────────────────
  if (data.observations) xml = injecterCelluleVoisine(xml, 'Situation ancienne-nouvelle', data.observations);

  zip.file('word/document.xml', xml);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

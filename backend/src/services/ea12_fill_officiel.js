/**
 * ea12_fill_officiel.js — Remplit le MODÈLE OFFICIEL FWB (A1_bis_EA12_SUP.docx)
 * en injectant les données dans les cellules prévues, SANS toucher à la mise
 * en page. Le résultat est garanti fidèle au gabarit FWB.
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const MODELE = path.join(import.meta.dirname, 'ea12-assets', 'A1_bis_EA12_SUP.docx');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function runVal(valeur, { size = 18, bold = false } = {}) {
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(valeur)}</w:t></w:r>`;
}

function injecterCelluleVoisine(xml, libelle, valeur, opts = {}) {
  if (valeur == null || valeur === '') return xml;
  const tcRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
  const cells = [];
  let m;
  while ((m = tcRe.exec(xml)) !== null) cells.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  const libIdx = cells.findIndex(c => c.text.includes(libelle));
  if (libIdx === -1 || libIdx + 1 >= cells.length) return xml;
  const cible = cells[libIdx + 1];
  let nc;
  if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(cible.text)) {
    nc = cible.text.replace(/(<\/w:pPr>)/, `$1${runVal(valeur, opts)}`);
  } else {
    nc = cible.text.replace(/(<w:p\b[^>]*>)/, `$1${runVal(valeur, opts)}`);
  }
  return xml.slice(0, cible.start) + nc + xml.slice(cible.end);
}

function injecterApresPointilles(xml, libelle, valeur, opts = {}) {
  if (valeur == null || valeur === '') return xml;
  const idx = xml.indexOf(libelle);
  if (idx === -1) return xml;
  const after = xml.slice(idx);
  const ptRe = /(<w:t[^>]*>)(…{3,})(<\/w:t>)/;
  const pm = ptRe.exec(after);
  if (!pm) return xml;
  const reste = pm[2].slice(Math.min(esc(valeur).length + 2, pm[2].length));
  const remplacement = `${pm[1]}${esc(' ' + valeur + ' ')}${reste}${pm[3]}`;
  const absStart = idx + pm.index;
  return xml.slice(0, absStart) + remplacement + xml.slice(absStart + pm[0].length);
}

function cocherCases(xml, indices) {
  const set = new Set(indices);
  let i = -1;
  return xml.replace(/<w:checkBox>[\s\S]*?<\/w:checkBox>/g, (mm) => {
    i++;
    if (!set.has(i)) return mm;
    return '<w:checkBox><w:sizeAuto/><w:default w:val="1"/><w:checked w:val="1"/></w:checkBox>';
  });
}

function injecterCasesChiffres(xml, libelleAvant, chiffres) {
  const tcRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
  const cells = [];
  let m;
  while ((m = tcRe.exec(xml)) !== null) cells.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  const libIdx = cells.findIndex(c => c.text.includes(libelleAvant));
  if (libIdx === -1) return xml;
  let out = xml, offset = 0, placed = 0;
  for (let k = libIdx + 1; k < cells.length && placed < chiffres.length; k++) {
    const c = cells[k];
    const hasText = /<w:t[^>]*>[^<\s]/.test(c.text);
    if (hasText) continue;
    const ch = chiffres[placed++];
    let nc = centrerParagraphe(c.text);
    if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(nc)) {
      nc = nc.replace(/(<\/w:pPr>)/, `$1${runVal(ch, { size: 16, bold: true })}`);
    } else {
      nc = nc.replace(/(<w:p\b[^>]*>)/, `$1${runVal(ch, { size: 16, bold: true })}`);
    }
    out = out.slice(0, c.start + offset) + nc + out.slice(c.end + offset);
    offset += nc.length - c.text.length;
  }
  return out;
}

/** Force l'alignement centré du premier paragraphe d'une cellule. */
function centrerParagraphe(cellText) {
  if (/<w:pPr>/.test(cellText)) {
    // pPr existe : ajouter <w:jc w:val="center"/> au début du pPr s'il n'y est pas
    if (/<w:jc\b/.test(cellText)) {
      return cellText.replace(/<w:jc[^>]*\/>/, '<w:jc w:val="center"/>');
    }
    return cellText.replace(/(<w:pPr>)/, '$1<w:jc w:val="center"/>');
  }
  // pas de pPr : en créer un avec centrage juste après <w:p...>
  return cellText.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr><w:jc w:val="center"/></w:pPr>');
}

export async function remplirModeleOfficiel(data) {
  const buf = fs.readFileSync(MODELE);
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file('word/document.xml').async('string');
  const e = data.etab || {};

  // ── Établissement ────────────────────────────────────────────────────────
  xml = injecterCelluleVoisine(xml, 'Nom du PO', e.po_nom, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Nom de l\u2019\u00e9tablissement', e.etab_nom, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Adresse compl\u00e8te', e.adresse, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Nom\u00a0:', e.gest_nom, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Pr\u00e9nom\u00a0:', e.gest_prenom, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Qualit\u00e9\u00a0:', e.gest_qualite, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'T\u00e9l. direct\u00a0:', e.gest_tel, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'E-mail\u00a0:', e.gest_email, { size: 18 });

  // ── ECOT / FASE / Matricule (cases chiffres centrés) ─────────────────────
  if (e.num_ecot) xml = injecterCasesChiffres(xml, '(10 derniers chiffres)', e.num_ecot.replace(/\D/g, ''));
  if (e.num_fase) xml = injecterCasesChiffres(xml, 'N\u00b0 FASE', e.num_fase.replace(/\D/g, ''));
  if (data.matricule) xml = injecterCasesChiffres(xml, 'Matricule enseignant', String(data.matricule).replace(/\D/g, ''));

  // ── MDP ──────────────────────────────────────────────────────────────────
  xml = injecterApresPointilles(xml, 'NOM\u00a0:', data.prof_nom, { bold: true, size: 18 });
  xml = injecterApresPointilles(xml, 'Pr\u00e9nom\u00a0:', data.prof_prenom, { bold: true, size: 18 });
  if (data.titre1) xml = injecterCelluleVoisine(xml, '1)', data.titre1, { size: 18 });
  if (data.titre2) xml = injecterCelluleVoisine(xml, '2)', data.titre2, { size: 18 });

  // ── Événement ────────────────────────────────────────────────────────────
  if (data.date_evenement) xml = injecterCelluleVoisine(xml, 'Date de l\u2019\u00e9v\u00e9nement', data.date_evenement, { size: 18 });
  if (data.semaines) xml = injecterCelluleVoisine(xml, 'Semaines de fonctionnement', data.semaines, { size: 18 });

  // ── Cases à cocher ────────────────────────────────────────────────────────
  // Cartographie des 57 cases (analysée sur le modèle officiel A1_bis_EA12_SUP.docx)
  // 0=WBE, 1=FWB(sub), 2=Officiel, 3=Libre, 4=Dérogation titre
  // 5=T, 6=TPr, 7=St, 8=ACS, 10=APE, 11=PTP
  // 12=Pas cumul interne, 13=Circ.6930, 14=Secondaire, 15=Supérieur, 16=Expert, 17=ACS/APE
  // 18=Cumul interne A2, 19=Jours4, 20=Jours5, 21=Jours6
  // 22=Entrée, 23=Rentrée, 24=Maintien, 25=Augmentation, 26=Prolongation
  // 27=Réduction, 28=Fin fonctions, 29=Nomination, 30=Extension, 31=Passerelle
  // 32=Autres mvt, 33=Création, 34=Remplacement, 35=Chgt affectation, 36=Modif interne
  // 37=Congé, 38=Perte charge, 39=DPPR, 40=Suppression, 41=Fin remplacement
  // 42=Démission, 43=Retraite, 44=Décès, 45=Autres justif, 46-48=Absences
  const indices = [1, 3, 15]; // Fixes IIP : subventionné FWB + Libre + Supérieur

  // Statut du MDP
  const statutMap = { T:5, TPr:6, St:7, ACS:8, APE:10, PTP:11 };
  if (data.statut && statutMap[data.statut] !== undefined) indices.push(statutMap[data.statut]);

  // Cumul
  if (data.pas_cumul) indices.push(12);
  if (data.prest_sec) indices.push(14);
  if (data.prest_exp) indices.push(16);

  // Jours de fonctionnement
  const joursMap = { 4:19, 5:20, 6:21 };
  if (data.jours && joursMap[Number(data.jours)]) indices.push(joursMap[Number(data.jours)]);

  // Type d'événement / justification
  const justifMap = {
    entree_en_fonction:22, rentree_en_fonction:23, maintien_attributions:24,
    augmentation_attributions:25, prolongation_attributions:26, reduction_attributions:27,
    fin_fonctions:28, nomination:29, extension:30, passerelle:31,
    creation_emploi:33, remplacement:34, modification_interne:36,
    conge_absence:37, perte_charge:38, dppr:39,
    suppression_emploi:40, fin_remplacement:41, demission:42,
    mise_retraite:43, deces:44,
  };
  if (data.justif && justifMap[data.justif]) indices.push(justifMap[data.justif]);

  xml = cocherCases(xml, [...new Set(indices)]);

  zip.file('word/document.xml', xml);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

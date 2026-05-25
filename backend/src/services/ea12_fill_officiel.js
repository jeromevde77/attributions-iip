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
    let nc;
    if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(c.text)) {
      nc = c.text.replace(/(<\/w:pPr>)/, `$1${runVal(ch, { size: 16, bold: true })}`);
    } else {
      nc = c.text.replace(/(<w:p\b[^>]*>)/, `$1${runVal(ch, { size: 16, bold: true })}`);
    }
    out = out.slice(0, c.start + offset) + nc + out.slice(c.end + offset);
    offset += nc.length - c.text.length;
  }
  return out;
}

export async function remplirModeleOfficiel(data) {
  const buf = fs.readFileSync(MODELE);
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file('word/document.xml').async('string');
  const e = data.etab || {};

  xml = injecterCelluleVoisine(xml, 'Nom du PO', e.po_nom, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Nom de l’établissement', e.etab_nom, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Adresse complète', e.adresse, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Nom\u00a0:', e.gest_nom, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Prénom\u00a0:', e.gest_prenom, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Qualité\u00a0:', e.gest_qualite, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Tél. direct\u00a0:', e.gest_tel, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'E-mail\u00a0:', e.gest_email, { size: 18 });

  xml = injecterApresPointilles(xml, 'NOM\u00a0:', data.prof_nom, { bold: true, size: 18 });
  xml = injecterApresPointilles(xml, 'Prénom\u00a0:', data.prof_prenom, { bold: true, size: 18 });

  if (e.num_ecot) xml = injecterCasesChiffres(xml, '(10 derniers chiffres)', e.num_ecot.replace(/\D/g, ''));
  if (e.num_fase) xml = injecterCasesChiffres(xml, 'N° FASE', e.num_fase.replace(/\D/g, ''));
  if (data.matricule) xml = injecterCasesChiffres(xml, 'Matricule enseignant', data.matricule.replace(/\D/g, ''));

  zip.file('word/document.xml', xml);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

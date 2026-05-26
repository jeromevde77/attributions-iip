/**
 * fiche_fill_officiel.js — Remplit le MODÈLE OFFICIEL de la fiche signalétique
 * (annexe 3 FWB : A3_Fiche_signaletique.docx) en injectant les données, sans
 * toucher à la mise en page. Même méthode que l'EA12 (ea12_fill_officiel.js).
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const MODELE = path.join(import.meta.dirname, 'ea12-assets', 'A3_Fiche_signaletique.docx');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function runVal(valeur, { size = 18, bold = false } = {}) {
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(valeur)}</w:t></w:r>`;
}

/** Remplit une zone de soulignés (____) qui suit un libellé, en gardant le reste. */
function injecterApresSoulignes(xml, libelle, valeur, opts = {}) {
  if (valeur == null || valeur === '') return xml;
  const idx = xml.indexOf(libelle);
  if (idx === -1) return xml;
  const after = xml.slice(idx);
  // Cherche une zone de soulignés (dans un <w:t>, éventuellement précédée de ' : ')
  const re = /(<w:t[^>]*>)([^<]*?_{3,})(<\/w:t>)/;
  const pm = re.exec(after);
  if (!pm) return xml;
  // Conserver le début (ex ' : ') puis insérer la valeur, garder quelques soulignés
  const prefixMatch = pm[2].match(/^[^_]*/)[0]; // ce qui précède les soulignés (ex ' : ')
  const soulignes = pm[2].slice(prefixMatch.length);
  const reste = soulignes.slice(Math.min(esc(valeur).length + 1, soulignes.length));
  const remplacement = `${pm[1]}${esc(prefixMatch + valeur + ' ')}${reste}${pm[3]}`;
  const absStart = idx + pm.index;
  return xml.slice(0, absStart) + remplacement + xml.slice(absStart + pm[0].length);
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

/** Remplit le modèle officiel de la fiche et renvoie un buffer .docx. */
export async function remplirFicheOfficielle(data) {
  const buf = fs.readFileSync(MODELE);
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file('word/document.xml').async('string');
  const e = data.etab || {};

  // Établissement (cellules voisines, comme l'EA12)
  xml = injecterCelluleVoisine(xml, 'Nom du PO', e.po_nom, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Nom de l’établissement', e.etab_nom, { size: 18 });
  xml = injecterCelluleVoisine(xml, 'Adresse complète', e.adresse, { size: 18 });

  // MDP — champs en soulignés
  xml = injecterApresSoulignes(xml, 'NOM', data.prof_nom, { bold: true });
  xml = injecterApresSoulignes(xml, 'Prénom', data.prof_prenom, { bold: true });
  xml = injecterApresSoulignes(xml, 'Nationalité', data.nationalite);
  xml = injecterApresSoulignes(xml, 'Lieu de naissance', data.lieu_naissance);
  xml = injecterApresSoulignes(xml, 'Domicile', data.domicile);
  xml = injecterApresSoulignes(xml, 'Tél./GSM', data.tel_gsm);

  zip.file('word/document.xml', xml);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

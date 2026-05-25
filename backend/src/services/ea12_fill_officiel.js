/**
 * ea12_fill_officiel.js — Remplit le MODÈLE OFFICIEL FWB (A1_bis_EA12_SUP.docx)
 * en injectant les données, SANS toucher à la mise en page.
 *
 * Principe : on ne reconstruit RIEN. On charge le document.xml du modèle
 * officiel, on injecte le texte dans les bonnes cellules et on coche les
 * bonnes cases (FORMCHECKBOX). Le résultat est garanti fidèle au gabarit FWB
 * puisque c'est le gabarit FWB lui-même.
 *
 * Le modèle est livré dans ea12-assets/A1_bis_EA12_SUP.docx (copie du fichier
 * officiel fourni). On le décompresse, on patche word/document.xml, on
 * recompresse. Puis conversion PDF par le service docx-to-pdf.
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const MODELE = path.join(import.meta.dirname, 'ea12-assets', 'A1_bis_EA12_SUP.docx');

/** Échappe le texte pour XML. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Coche la n-ième case à cocher (FORMCHECKBOX) du document.
 * Les cases sont <w:checkBox><w:sizeAuto/><w:default w:val="0"/></w:checkBox>.
 * Pour cocher : default val="1" + ajout <w:checked/>.
 * @param {string} xml
 * @param {number[]} indicesACocher - indices (0-based) des cases à cocher
 */
function cocherCases(xml, indicesACocher) {
  const set = new Set(indicesACocher);
  let i = -1;
  return xml.replace(/<w:checkBox>.*?<\/w:checkBox>/g, (m) => {
    i++;
    if (!set.has(i)) return m;
    // Cocher : forcer default=1 et ajouter checked
    return '<w:checkBox><w:sizeAuto/><w:default w:val="1"/><w:checked w:val="1"/></w:checkBox>';
  });
}

/**
 * Injecte une valeur texte dans la première cellule vide qui suit un libellé donné.
 * On repère le libellé dans un <w:t>, puis on insère la valeur dans le prochain
 * paragraphe de la cellule voisine. Approche simple et robuste : on remplace
 * une séquence de pointillés (…) par la valeur, ou on insère après le libellé.
 *
 * Pour ce premier moteur, on cible les pointillés (placeholders naturels du
 * modèle) dans l'ordre, et les zones identifiables.
 */
function remplacerApresLibelle(xml, libelle, valeur) {
  // Cherche le <w:t> contenant le libellé, puis insère la valeur juste après
  // le run, dans le même paragraphe. Insertion d'un run avec la valeur.
  const re = new RegExp(`(<w:t[^>]*>${libelle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*</w:t>)`);
  if (!re.test(xml)) return xml;
  const runVal = `</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve"> ${esc(valeur)}</w:t></w:r><w:r><w:t xml:space="preserve">`;
  return xml.replace(re, (m) => m.replace(/<\/w:t>$/, runVal + '</w:t>'));
}

/**
 * Remplit le modèle officiel et renvoie un buffer .docx.
 * @param {object} data - données EA12 (mêmes clés que construireData)
 * @returns {Promise<Buffer>}
 */
export async function remplirModeleOfficiel(data) {
  const buf = fs.readFileSync(MODELE);
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file('word/document.xml').async('string');

  // ── Champs texte simples (injectés après leur libellé) ──
  const e = data.etab || {};
  if (e.po_nom)      xml = remplacerApresLibelle(xml, 'Nom du PO', e.po_nom);
  if (e.etab_nom)    xml = remplacerApresLibelle(xml, 'Nom de l’établissement', e.etab_nom);
  if (data.prof_nom) xml = remplacerApresLibelle(xml, 'NOM\u00a0:', data.prof_nom);

  // ── Réinjection ──
  zip.file('word/document.xml', xml);
  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return out;
}

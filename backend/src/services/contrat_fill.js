/**
 * contrat_fill.js — Génère un contrat de travail personnalisé
 * Modèle : Contrat_Enseignant.docx (CDD, Enseignement pour adultes, IIP)
 */
import fs   from 'fs';
import path from 'path';
import JSZip from 'jszip';

const MODELE = path.join(import.meta.dirname, 'contrat-assets', 'Contrat_Enseignant.docx');

// Jours de la semaine en français
const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const MOIS_FR  = ['janvier','février','mars','avril','mai','juin',
                  'juillet','août','septembre','octobre','novembre','décembre'];

function formatDateLongue(dateStr) {
  // dateStr = "2025-09-04"
  if (!dateStr) return '_______________';
  const d = new Date(dateStr + 'T12:00:00');
  return `${JOURS_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Remplace le texte exact dans un run/paragraphe XML.
 * Cherche le pattern dans les <w:t> et remplace le contenu.
 */
function remplacerTexte(xml, ancien, nouveau) {
  // Remplacer directement dans les balises <w:t>
  return xml.replaceAll(ancien, nouveau);
}

/**
 * Génère le contrat rempli et retourne un Buffer.
 * @param {object} data
 *   - prof_nom       : string (NOM en majuscules)
 *   - prof_prenom    : string (Prénom)
 *   - date_contrat   : string (YYYY-MM-DD)
 *   - representant   : string (optionnel, défaut "Charles Sohet, Directeur a.i.")
 */
export async function genererContrat(data) {
  const buf = fs.readFileSync(MODELE);
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file('word/document.xml').async('string');

  const { prof_nom = '', prof_prenom = '', date_contrat = '', representant } = data;

  // 1. Nom du membre du personnel (§8 : "AALHOUL Yasssin")
  const nomComplet = `${prof_nom} ${prof_prenom}`.trim();
  xml = remplacerTexte(xml, 'AALHOUL Yasssin', nomComplet);
  // Garde-fou si le template a été re-sauvegardé avec le bon nom
  xml = remplacerTexte(xml, 'Prof Démo',  nomComplet);
  xml = remplacerTexte(xml, 'AALHOUIL Yassin', nomComplet);

  // 2. Date de signature ("jeudi 4 septembre 2025")
  if (date_contrat) {
    xml = remplacerTexte(xml, 'jeudi 4 septembre 2025', formatDateLongue(date_contrat));
  }

  // 3. Représentant PO (optionnel)
  if (representant && representant !== 'Charles Sohet, Directeur a.i.') {
    xml = remplacerTexte(xml, 'Charles Sohet, Directeur a.i.', representant);
    xml = remplacerTexte(xml, 'Charles Sohet, Directeur a.i', representant);
  }

  zip.file('word/document.xml', xml);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * fiche_fill_officiel.js — Remplit le MODÈLE OFFICIEL de la fiche signalétique
 * (annexe 3 FWB : A3_Fiche_signaletique.docx). Même méthode que l'EA12.
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const MODELE = path.join(import.meta.dirname, 'ea12-assets', 'A3_Fiche_signaletique.docx');

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function runVal(v, { size=18, bold=false }={}) {
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>${bold?'<w:b/>':''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(v)}</w:t></w:r>`;
}

function injecterApresSoulignes(xml, libelle, valeur, opts={}) {
  if (!valeur) return xml;
  const idx = xml.indexOf(libelle);
  if (idx === -1) return xml;
  const after = xml.slice(idx);
  const ptRe = /(<w:t[^>]*>)([^<]*_{3,})(<\/w:t>)/;
  const pm = ptRe.exec(after);
  if (!pm) return xml;
  const prefix = pm[2].match(/^[^_]*/)[0];
  const souligne = pm[2].slice(prefix.length);
  const reste = souligne.slice(Math.min(esc(String(valeur)).length+1, souligne.length));
  const remplacement = `${pm[1]}${esc(prefix+String(valeur)+' ')}${reste}${pm[3]}`;
  const absStart = idx + pm.index;
  return xml.slice(0, absStart) + remplacement + xml.slice(absStart + pm[0].length);
}

function injecterCelluleVoisine(xml, libelle, valeur, opts={}) {
  if (!valeur) return xml;
  const tcRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
  const cells = []; let m;
  while ((m=tcRe.exec(xml))!==null) cells.push({text:m[0],start:m.index,end:m.index+m[0].length});
  const idx = cells.findIndex(c=>c.text.includes(libelle));
  if (idx===-1||idx+1>=cells.length) return xml;
  const cible = cells[idx+1];
  let nc;
  if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(cible.text)) nc=cible.text.replace(/(<\/w:pPr>)/,`$1${runVal(String(valeur),opts)}`);
  else nc=cible.text.replace(/(<w:p\b[^>]*>)/,`$1${runVal(String(valeur),opts)}`);
  return xml.slice(0,cible.start)+nc+xml.slice(cible.end);
}

function injecterCasesChiffres(xml, libelleAvant, chiffres) {
  const tcRe = /<w:tc>[\s\S]*?<\/w:tc>/g;
  const cells = []; let m;
  while ((m=tcRe.exec(xml))!==null) cells.push({text:m[0],start:m.index,end:m.index+m[0].length});
  const libIdx = cells.findIndex(c=>c.text.includes(libelleAvant));
  if (libIdx===-1) return xml;
  let out=xml, offset=0, placed=0;
  for (let k=libIdx+1; k<cells.length&&placed<chiffres.length; k++) {
    const c=cells[k];
    if (/<w:t[^>]*>[^<\s]/.test(c.text)) continue;
    const ch=chiffres[placed++];
    let nc=c.text.replace(/(<w:pPr>[\s\S]*?<\/w:pPr>)/,'$1');
    if (/<w:pPr>/.test(nc)) {
      if (!/<w:jc\b/.test(nc)) nc=nc.replace(/<w:pPr>/,'<w:pPr><w:jc w:val="center"/>');
      nc=nc.replace(/(<\/w:pPr>)/,`$1${runVal(ch,{size:16,bold:true})}`);
    } else nc=nc.replace(/(<w:p\b[^>]*>)/,`$1<w:pPr><w:jc w:val="center"/></w:pPr>${runVal(ch,{size:16,bold:true})}`);
    out=out.slice(0,c.start+offset)+nc+out.slice(c.end+offset);
    offset+=nc.length-c.text.length;
  }
  return out;
}

function cocherCases(xml, indices) {
  const set = new Set(indices); let i=-1;
  return xml.replace(/<w:checkBox>[\s\S]*?<\/w:checkBox>/g, mm=>{
    i++;
    if (!set.has(i)) return mm;
    return '<w:checkBox><w:sizeAuto/><w:default w:val="1"/><w:checked w:val="1"/></w:checkBox>';
  });
}

// Index des cases (voir cartographie complète) :
const CASES = {
  // Objet
  IMMATRICULATION: 0, ENTREE_FONCTION: 1, MODIFICATION: 2,
  // Niveau
  FONDAMENTAL: 3, SECONDAIRE: 4, ADU: 5, HE: 6, ESA: 7, ESAHR: 8, CPMS: 9,
  // Type
  ORDINAIRE: 10, SPECIALISE: 11, WBE: 12, FWB: 13, OFFICIEL: 14, LIBRE: 15,
  // Sexe (F=16, M=17 d'après analyse — case 16 précède « ou », case 17 suit « ou »)
  SEXE_F: 16, SEXE_M: 17,
  // Etat civil
  CELIBATAIRE: 18, MARIE: 19, VEUF: 20, DIVORCE: 21, COHAB_LEGAL: 22, COHABITANT: 23,
  SEPARE_CORPS: 24, SEPARE_FAIT: 25,
  // Handicap MDP
  HANDICAP_OUI: 26, HANDICAP_NON: 27,
  // Handicap conjoint
  CONJ_HANDICAP_OUI: 28, CONJ_HANDICAP_NON: 29,
  // Revenus conjoint
  CONJ_REV_PRO: 30, CONJ_REV_PRO2: 31, CONJ_REV_FAI: 34, CONJ_REV_PAS: 35,
  // CE883
  CE883_OUI: 36, CE883_NON: 37,
};

export async function remplirFicheOfficielle(data) {
  const buf = fs.readFileSync(MODELE);
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file('word/document.xml').async('string');
  const e = data.etab || {};

  // ── Établissement ──────────────────────────────────────────────────────────
  xml = injecterCelluleVoisine(xml, 'Nom du PO', e.po_nom);
  xml = injecterCelluleVoisine(xml, 'Nom de l201900e9tablissement', e.etab_nom);
  xml = injecterCelluleVoisine(xml, 'Adresse complète', e.adresse);
  if (e.num_ecot) xml = injecterCasesChiffres(xml, '(10 derniers chiffres)', e.num_ecot.replace(/\D/g,''));
  if (e.num_fase) xml = injecterCasesChiffres(xml, 'N° FASE', e.num_fase.replace(/\D/g,''));

  // ── MDP — identité ─────────────────────────────────────────────────────────
  xml = injecterApresSoulignes(xml, 'NOM\u00a0:', data.prof_nom, { bold: true });
  xml = injecterApresSoulignes(xml, 'Prénom\u00a0:', data.prof_prenom, { bold: true });
  if (data.matricule) xml = injecterCasesChiffres(xml, 'Matricule enseignant', data.matricule.replace(/\D/g,''));
  xml = injecterApresSoulignes(xml, 'Nationalité\u00a0:', data.nationalite);
  xml = injecterApresSoulignes(xml, 'Date de naissance', data.date_naissance ? data.date_naissance.split('-').reverse().join('/') : '');
  xml = injecterApresSoulignes(xml, 'Lieu de naissance', data.lieu_naissance);
  xml = injecterApresSoulignes(xml, 'Domicile', data.domicile);
  xml = injecterApresSoulignes(xml, 'E-mail\u00a0:', data.email);
  xml = injecterApresSoulignes(xml, 'Tél./GSM\u00a0', data.tel_gsm);

  // ── NISS / IBAN / BIC ──────────────────────────────────────────────────────
  if (data.niss) xml = injecterCasesChiffres(xml, 'NISS/NISS bis', data.niss.replace(/\D/g,''));
  if (data.iban) xml = injecterCasesChiffres(xml, 'N° Compte IBAN', data.iban.replace(/[^A-Z0-9]/gi,''));
  if (data.bic) xml = injecterApresSoulignes(xml, 'BIC', data.bic);
  if (data.compte_titulaire) xml = injecterApresSoulignes(xml, 'au nom de', data.compte_titulaire);

  // ── Cases à cocher ─────────────────────────────────────────────────────────
  const indices = [CASES.ADU, CASES.FWB, CASES.LIBRE]; // toujours : adultes + FWB + libre

  // Sexe
  if (data.sexe === 'F') indices.push(CASES.SEXE_F);
  else if (data.sexe === 'M') indices.push(CASES.SEXE_M);

  // État civil
  const etatCivilMap = {
    celibataire: CASES.CELIBATAIRE, marie: CASES.MARIE, veuf: CASES.VEUF,
    divorce: CASES.DIVORCE, cohab_legal: CASES.COHAB_LEGAL, cohabitant: CASES.COHABITANT,
    separe_corps: CASES.SEPARE_CORPS, separe_fait: CASES.SEPARE_FAIT,
  };
  if (data.etat_civil && etatCivilMap[data.etat_civil]) indices.push(etatCivilMap[data.etat_civil]);

  // Handicap MDP
  if (data.handicap === 'oui') indices.push(CASES.HANDICAP_OUI);
  else if (data.handicap === 'non') indices.push(CASES.HANDICAP_NON);

  // Handicap conjoint
  if (data.conjoint_handicap === 'oui') indices.push(CASES.CONJ_HANDICAP_OUI);
  else if (data.conjoint_handicap === 'non') indices.push(CASES.CONJ_HANDICAP_NON);

  // CE 883
  if (data.ce883_actif === 'oui') indices.push(CASES.CE883_OUI);
  else if (data.ce883_actif === 'non') indices.push(CASES.CE883_NON);

  xml = cocherCases(xml, indices);

  zip.file('word/document.xml', xml);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

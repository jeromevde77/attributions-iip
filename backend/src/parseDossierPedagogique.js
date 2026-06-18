/**
 * parseDossierPedagogique.js — ESM
 * Parse un .docx de dossier pédagogique FWB (format EPS standard)
 * et retourne { ue, cours[] } prêt à l'import Lucie.
 */
import JSZip from 'jszip';
import { parse as parseHtml } from 'node-html-parser';

function nodeText(node) {
  return node.querySelectorAll('w\\:t').map(n => n.text).join('').trim();
}

function parseDP(xmlStr) {
  const dom = parseHtml(xmlStr, { lowerCaseTagName: false });
  const blocks = [];

  for (const p of dom.querySelectorAll('w\\:p')) {
    const txt = nodeText(p).replace(/\s+/g, ' ').trim();
    if (txt) blocks.push({ type: 'p', text: txt });
  }
  for (const tr of dom.querySelectorAll('w\\:tr')) {
    const cells = tr.querySelectorAll('w\\:tc').map(tc =>
      nodeText(tc).replace(/\s+/g, ' ').trim()
    );
    if (cells.some(c => c)) blocks.push({ type: 'tr', cells });
  }

  const fullText = blocks.map(b =>
    b.type === 'p' ? b.text : b.cells.join(' | ')
  ).join('\n');

  // CODE FWB
  let codeFwb = '';
  const codeMatch = fullText.match(/CODE\s*:\s*([\d][\d\s]+U\d+\s*D\d+)/i)
    || fullText.match(/([\d]{2}\s*[\d]{2}\s*[\d]{2}\s*U\d+\s*D\d+)/);
  if (codeMatch) codeFwb = codeMatch[1].replace(/\s+/g, ' ').trim();

  // INTITULE UE
  let ueNom = '';
  for (let i = 0; i < blocks.length; i++) {
    if (/DOSSIER PEDAGOGIQUE|UNITE D.ENSEIGNEMENT/i.test(blocks[i].text || '')) {
      for (let j = i + 1; j < Math.min(i + 10, blocks.length); j++) {
        const c = (blocks[j].text || '').trim();
        if (c.length > 5 && c === c.toUpperCase()
          && !/ENSEIGNEMENT|MINISTERE|ADMINISTRATION|COMMUNAUTE|DOMAINE|CODE|DOCUMENT|SUPERIEUR|PROMOTION|DOSSIER/i.test(c)) {
          ueNom = c.split(' ').map(w =>
            w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()
          ).join(' ');
          break;
        }
      }
      if (ueNom) break;
    }
  }

  // NIVEAU
  let ueNiveau = '';
  if (/SUPERIEUR DE TYPE COURT|SUPERIEUR DE TYPE LONG/i.test(fullText)) ueNiveau = 'SUP';
  else if (/SECONDAIRE/i.test(fullText)) ueNiveau = 'DS';

  // CODE DOMAINE
  const domaineMatch = fullText.match(/CODE DU DOMAINE DE FORMATION\s*:\s*(\d+)/i);
  const codeDomaine = domaineMatch ? domaineMatch[1] : '';

  // ECTS
  const ectsMatch = fullText.match(/Nombre d.ECTS[^0-9]*(\d+)/i);
  const ects = ectsMatch ? parseInt(ectsMatch[1]) : null;

  // TOTAL PERIODES
  const totMatch = fullText.match(/Total des p.riodes[^0-9]*(\d+)/i);
  const totalPeriodes = totMatch ? parseInt(totMatch[1]) : null;

  // AUTONOMIE (7.2)
  let autonomie = null;
  for (const b of blocks) {
    if (b.type === 'tr' && b.cells.some(c => /autonomie/i.test(c))) {
      const last = b.cells[b.cells.length - 1];
      const m = last.match(/(\d+)/);
      if (m) { autonomie = parseInt(m[1]); break; }
    }
  }

  // TEXTES LONGS
  const lines = fullText.split('\n');
  const extractSection = (startRe, endRe) => {
    let on = false; const r = [];
    for (const l of lines) {
      if (startRe.test(l)) { on = true; continue; }
      if (on && endRe.test(l)) break;
      if (on && l.trim()) r.push(l.trim());
    }
    return r.join('\n').trim();
  };
  const detFinalites = extractSection(/FINALITES DE L.UNITE/i,  /CAPACITES PREALABLES/i);
  const detCapacites = extractSection(/CAPACITES PREALABLES/i,   /ACQUIS D.APPRENTISSAGE/i);
  const detAcquis    = extractSection(/ACQUIS D.APPRENTISSAGE/i, /PROGRAMME/i);
  const detProgramme = extractSection(/^PROGRAMME$/i,            /CONSTITUTION DES GROUPES|CHARGE.S. DE COURS/i);

  // COURS (tableau 7.1)
  // inHoraire se déclenche sur la ligne d'en-tête "7.1. Dénomination des cours"
  const cours = [];
  let inHoraire = false;
  for (const b of blocks) {
    if (b.type === 'tr' && b.cells.some(c => /D.nomination des cours/i.test(c))) {
      inHoraire = true; continue;
    }
    if (!inHoraire || b.type !== 'tr') continue;
    // Ignorer les lignes de métadonnées (autonomie, total, ECTS)
    if (!b.cells[1] || /autonomie|Total des|Nombre d.ECTS/i.test(b.cells[0])) continue;
    const [nom = '', classement = '', codeU = '', perStr = ''] = b.cells;
    if (!nom || nom.length < 3) continue;
    const periodes = perStr ? parseInt(perStr) : null;
    const ctpp = { CT: 'CT', CG: 'CG', PP: 'PP' }[classement.toUpperCase()] || classement;
    cours.push({ nom, classement: ctpp, codeU: codeU.toUpperCase(), periodes });
  }

  return {
    ue: {
      ue_nom:           ueNom,
      ue_code_fwb:      codeFwb,
      ue_niveau:        ueNiveau,
      ects,
      ue_aut:           autonomie,
      ue_per_etudiants: totalPeriodes,
      code_domaine:     codeDomaine,
      ue_det: [
        detFinalites && `## Finalités\n${detFinalites}`,
        detCapacites && `## Capacités préalables\n${detCapacites}`,
        detAcquis    && `## Acquis d'apprentissage\n${detAcquis}`,
        detProgramme && `## Programme\n${detProgramme}`,
      ].filter(Boolean).join('\n\n'),
    },
    cours,
  };
}

export async function parseDossierPedagogique(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) throw new Error('document.xml introuvable dans le .docx');
  const xmlStr = await xmlFile.async('string');
  return parseDP(xmlStr);
}

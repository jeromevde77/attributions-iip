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

  // ── ACQUIS D'APPRENTISSAGE : découpage du bloc en acquis individuels ──
  // Structure FWB habituelle :
  //   « Pour atteindre le seuil de réussite, l'étudiant sera capable de : »
  //   puis un acquis par paragraphe (les puces Word ne laissent pas de trace
  //   dans le texte extrait, chaque puce devient donc une ligne),
  //   puis « Pour la détermination du degré de maîtrise… » qui clôt la liste.
  const decouperAcquis = (bloc) => {
    if (!bloc) return [];
    const lignes = bloc.split('\n').map(l => l.trim()).filter(Boolean);
    const out = [];
    let commence = false;
    for (const l of lignes) {
      // Fin de la liste : critères de maîtrise, ou section suivante
      if (/degr[ée] de ma[îi]trise|pour la d[ée]termination/i.test(l)) break;
      // Amorce : une ligne d'introduction se terminant par « : »
      if (!commence) {
        if (/:\s*$/.test(l)) { commence = true; continue; }
        // Certains dossiers listent directement, sans phrase d'introduction
        if (/^[-•–]|^\d+[.)]\s/.test(l)) commence = true;
        else continue;
      }
      // Nettoyer les marqueurs de liste résiduels
      const t = l.replace(/^[-•–]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
      // Écarter les fragments trop courts (titres, numéros de page)
      if (t.length < 15) continue;
      out.push(t);
    }
    return out.map((description, i) => ({ num: i + 1, description }));
  };
  const acquis = decouperAcquis(detAcquis);

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
    acquis,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LES DOSSIERS PÉDAGOGIQUES EN PDF
//
// Les dossiers publiés par la Fédération circulent en PDF, non en Word : c'est
// sous cette forme que l'établissement les reçoit et les archive. Le texte en
// est extrait par pdftotext (poppler), puis lu à plat.
//
// Le vocabulaire n'est pas celui du modèle Word non plus. Les dossiers de 2011
// disent CAPACITÉS TERMINALES là où l'on dit aujourd'hui acquis
// d'apprentissage, placent le PROGRAMME (4) AVANT elles (5), et referment la
// liste par « Pour déterminer le degré de maîtrise » ou « Pour la
// détermination du degré de maîtrise » selon les rédacteurs. Le parseur .docx,
// écrit pour le modèle récent, n'y trouvait donc ni acquis ni programme.
// ═══════════════════════════════════════════════════════════════════════════

import { execFile } from 'child_process';

function pdfEnTexte(buffer) {
  return new Promise((resolve, reject) => {
    // -enc UTF-8 : les dossiers sont pleins d'accents et d'apostrophes typo.
    // Pas de -layout : l'ordre de lecture donne des lignes plus franches que
    // les colonnes reconstituées, et les tableaux d'horaire y restent lisibles.
    const p = execFile('pdftotext', ['-enc', 'UTF-8', '-', '-'],
      { maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => {
        if (err) {
          return reject(new Error(
            "Lecture du PDF impossible : l'outil pdftotext est absent du serveur "
            + '(paquet poppler-utils).'));
        }
        resolve(stdout);
      });
    p.stdin.end(buffer);
  });
}

// Le texte extrait charrie l'en-tête ministériel, les pieds de page et les
// puces converties en « i ». On le nettoie avant de chercher quoi que ce soit.
const ENTETE_MINISTERE =
  /^(MINISTERE DE LA COMMUNAUTE|ADMINISTRATION GENERALE|ENSEIGNEMENT DE PROMOTION SOCIALE DE REGIME|DOCUMENT DE REFERENCE|Approbation du Gouvernement|sur avis conforme)/i;

function nettoyer(texte) {
  return String(texte)
    .replace(/\u0002/g, '-')      // la césure ressort en caractère de contrôle
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => !/Page\s+\d+\s+sur\s+\d+/i.test(l))
    .filter(l => !ENTETE_MINISTERE.test(l.trim()))
    .join('\n');
}

// Une puce du dossier : « i » isolé en tête de ligne (une puce Wingdings mal
// convertie), ou un tiret.
const estPuce = l => /^\s*(i|[-•–])\s+/.test(l);
const sansPuce = l => l.replace(/^\s*(i|[-•–])\s+/, '').trim();

/**
 * RECOLLER LES LIGNES COUPÉES.
 *
 * Le PDF coupe au bord de la page, pas à la fin de la phrase : un acquis de
 * deux lignes ressort en deux morceaux dont le second ne porte plus de puce.
 * Pris tels quels, les acquis arrivaient tronqués à la moitié — « de définir
 * et d'illustrer les concepts essentiels relatifs aux différents champs de la »
 * — ce qui ne veut plus rien dire et se retrouvait tel quel dans les
 * motivations d'échec.
 *
 * On rattache donc toute ligne sans puce à la précédente, et l'on rend les
 * puces lisibles au passage.
 */
function recoller(bloc) {
  const out = [];
  for (const brute of String(bloc || '').split('\n')) {
    const l = brute.trim();
    if (!l) continue;
    if (estPuce(l) || !out.length) out.push(estPuce(l) ? `– ${sansPuce(l)}` : l);
    else out[out.length - 1] += ` ${l}`;
  }
  return out.map(l => l.replace(/\s+/g, ' ').trim());
}

/**
 * Découpe le dossier sur ses titres numérotés, dans l'ordre du document. On
 * désigne ensuite une section par son NUMÉRO plutôt que par celle qui la suit :
 * les dossiers ne les enchaînent pas tous dans le même ordre, et c'est ce qui
 * faisait manquer le programme.
 */
function decouperEnSections(texte) {
  const sections = [];
  let courante = null;
  for (const ligne of texte.split('\n')) {
    const m = ligne.trim().match(/^(\d+(?:\.\d+)?)\.\s+(\S.*)$/);
    if (m && m[2].length < 80) {
      courante = { numero: m[1], titre: m[2].trim(), lignes: [] };
      sections.push(courante);
      continue;
    }
    if (courante) courante.lignes.push(ligne);
  }
  return sections;
}

const texteDe = (sections, numero) => sections
  .filter(s => s.numero === numero)
  .map(s => s.lignes.join('\n').trim())
  .filter(Boolean).join('\n').trim();

// Une section et toutes ses sous-sections : « 4 » ramène 4, 4.1, 4.2…
function texteAvecSousSections(sections, prefixe) {
  const out = [];
  for (const s of sections) {
    if (s.numero === prefixe || s.numero.startsWith(prefixe + '.')) {
      if (s.numero !== prefixe) out.push(s.titre);
      out.push(s.lignes.join('\n').trim());
    }
  }
  return out.filter(Boolean).join('\n').trim();
}

function parseDPTexte(brut) {
  const texte = nettoyer(brut);
  const sections = decouperEnSections(texte);
  const lignes = texte.split('\n').map(l => l.trim());

  const codeMatch = texte.match(/CODE\s*:\s*([\dA-Z][\dA-Z\s]*U\s*\d+\s*D\s*\d+)/i);
  const codeFwb = codeMatch ? codeMatch[1].replace(/\s+/g, ' ').trim() : '';
  const domaineMatch = texte.match(/CODE DU DOMAINE DE FORMATION\s*:\s*(\d+)/i);

  // L'intitulé : ce qui suit « UNITE DE FORMATION » jusqu'au niveau ou au
  // code. Il tient parfois sur deux lignes (« BACHELIER EN … : / STAGE … »).
  let ueNom = '';
  const iUF = lignes.findIndex(l => /^UNITE DE FORMATION\s*$/i.test(l));
  if (iUF >= 0) {
    const morceaux = [];
    for (let j = iUF + 1; j < Math.min(iUF + 6, lignes.length); j++) {
      const c = lignes[j];
      if (!c) continue;
      if (/^(ENSEIGNEMENT|CODE)\b/i.test(c)) break;
      morceaux.push(c.replace(/\s*:\s*$/, ''));
    }
    ueNom = morceaux.join(' ').replace(/\s+/g, ' ').trim()
      .split(' ').map(w => (w.length > 2
        ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(' ');
  }

  // L'en-tête est en capitales SANS ACCENTS : « DECOUVERTE DE LA
  // PSYCHOMOTRICITE ». Écrasant un intitulé correct déjà en base, l'import
  // dégradait le référentiel à chaque passage. Le pied de page, lui, porte le
  // même intitulé accentué : on le préfère dès qu'on l'y retrouve.
  if (ueNom) {
    // Comparaison sur les seules lettres : le pied de page ponctue
    // autrement que l'en-tête (« BACHELIER … : STAGE » contre
    // « Bachelier … – stage »).
    const nu = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
    const cible = nu(ueNom);
    for (const l of brut.replace(/\r/g, '').split('\n')) {
      const c = l.replace(/Page\s+\d+\s+sur\s+\d+/i, '').trim();
      if (c && c !== ueNom && nu(c) === cible && /[àâçéèêëîïôûù]/i.test(c)) {
        ueNom = c; break;
      }
    }
  }

  let ueNiveau = '';
  if (/SUPERIEUR\b[^\n]*\bTYPE (COURT|LONG)/i.test(texte)) ueNiveau = 'SUP';
  else if (/SECONDAIRE/i.test(texte)) ueNiveau = 'DS';

  const ectsMatch = texte.match(/Nombre d.ECTS[^0-9]*(\d+)/i);
  const totMatch = texte.match(/Total des p[ée]riodes\D*(\d+)/i)
    || texte.match(/Etudiant\s*:\s*(\d+)\s*p[ée]riodes/i);
  const autMatch = texte.match(/Part d.autonomie\s*[A-Z]?\s*(\d+)/i);

  // ── Les cours de l'horaire minimum ──
  // « Histoire et fondements de la psychomotricité CT B 32 » : intitulé,
  // classement, code U, périodes. L'intitulé d'un stage court sur plusieurs
  // lignes ; on recolle alors ce qui précède la ligne portant les chiffres.
  const cours = [];
  let attente = [];
  for (const l of texteAvecSousSections(sections, '3').split('\n')) {
    const m = l.trim().match(/^(.*?)\s*\b(CT|PP|CG)\b\s+([A-Z])\s+(\d+)\s*$/);
    if (m) {
      const nom = [...attente, m[1]].join(' ').replace(/\s+/g, ' ').trim();
      attente = [];
      if (nom.length >= 3 && !/autonomie|total des|d[ée]nomination/i.test(nom)) {
        cours.push({ nom, classement: m[2], codeU: m[3], periodes: parseInt(m[4], 10) });
      }
      continue;
    }
    const t = l.trim();
    if (!t || /Classement|Code U|Nombre de p|par groupe d.[ée]tudiants|D[ée]nomination|autonomie|Total des|Etudiant\s*:/i.test(t)) {
      attente = []; continue;
    }
    attente.push(t);
  }

  // ── Les textes ──
  const detFinalites = texteDe(sections, '1.2') || texteDe(sections, '1');
  const detCapacites = texteDe(sections, '2.1') || texteDe(sections, '2');
  const detProgramme = texteAvecSousSections(sections, '4');

  // Les capacités terminales — nos acquis d'apprentissage — se referment sur
  // le degré de maîtrise, que le dossier n'isole pas en section propre.
  const terminales = texteAvecSousSections(sections, '5');
  const coupe = terminales.search(
    /pour (la d[ée]termination du|d[ée]terminer le) degr[ée] de ma[îi]trise/i);
  const detAcquis = (coupe > 0 ? terminales.slice(0, coupe) : terminales).trim();
  const detMaitrise = coupe > 0 ? terminales.slice(coupe).trim() : '';

  const acquis = recoller(detAcquis)
    .filter(l => l.startsWith('– '))
    .map(l => l.slice(2).replace(/[;.]\s*$/, '').trim())
    .filter(t => t.length >= 15)
    .map((description, i) => ({ num: i + 1, description }));

  return {
    ue: {
      ue_nom:           ueNom,
      ue_code_fwb:      codeFwb,
      ue_niveau:        ueNiveau,
      ects:             ectsMatch ? parseInt(ectsMatch[1], 10) : null,
      ue_aut:           autMatch ? parseInt(autMatch[1], 10) : null,
      ue_per_etudiants: totMatch ? parseInt(totMatch[1], 10) : null,
      code_domaine:     domaineMatch ? domaineMatch[1] : '',
      // Les sections sont recollées avant d'être stockées : c'est ce texte-là
      // que la description d'unité proposera de reprendre, et il doit se lire.
      ue_det: [
        ['Finalités', detFinalites],
        ['Capacités préalables', detCapacites],
        ["Acquis d'apprentissage", detAcquis],
        ['Degré de maîtrise', detMaitrise],
        ['Programme', detProgramme],
      ].filter(([, v]) => v)
        .map(([titre, v]) => `## ${titre}\n${recoller(v).join('\n')}`)
        .join('\n\n'),
    },
    cours,
    acquis,
  };
}

export async function parseDossierPedagogique(buffer) {
  // %PDF en tête : dossier publié par la Fédération. PK : un .docx.
  if (buffer.slice(0, 4).toString('latin1') === '%PDF') {
    return parseDPTexte(await pdfEnTexte(buffer));
  }
  const zip = await JSZip.loadAsync(buffer);
  const xmlFile = zip.file('word/document.xml');
  if (!xmlFile) throw new Error('document.xml introuvable dans le .docx');
  const xmlStr = await xmlFile.async('string');
  return parseDP(xmlStr);
}

export { parseDPTexte };

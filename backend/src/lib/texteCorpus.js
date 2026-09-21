// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LE TEXTE D'UN DOCUMENT DU CORPUS : d'où il vient, et ce qu'il a le
// droit de contenir.
//
// Demandé par Charles le 21 septembre 2026 : « faire comme avec l'import DP —
// je dépose, tu analyses et tu intègres à Lucie avec mise en page, mais DANS
// Lucie. Après, je peux corriger année après année dans Lucie. »
//
// Le fichier Word ou PDF n'est donc qu'un POINT D'ENTRÉE : on l'analyse, on en
// tire un texte mis en forme, et il ne sert plus. Le PDF n'est pas conservé —
// tranché par Charles le même jour : un décret est publié en ligne, le garder
// alourdirait la base pour rien. Le document porte à la place un lien vers sa
// source officielle.
//
// ── UNE SEULE LISTE DE CE QUI EST PERMIS ────────────────────────────────────
//
// Le texte s'affiche tel quel dans la fenêtre de lecture : c'est du HTML qu'on
// injecte dans la page de chaque membre du personnel. Un .docx peut contenir un
// lien `javascript:`, un texte collé peut porter un `<script>` ou un
// `onerror=`. Ce qui n'est pas dans la liste ci-dessous NE PASSE PAS — et c'est
// au moment de l'ÉCRITURE qu'on filtre, pour que la base ne contienne jamais
// que du texte sûr : une page qui oublierait de filtrer à l'affichage ne
// pourrait alors rien laisser passer.
// ─────────────────────────────────────────────────────────────────────────────

import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import { parse as parseHtml } from 'node-html-parser';
import { pdfEnTexte } from '../parseDossierPedagogique.js';

const PERMIS = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'blockquote',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'span', 'a',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    td: ['colspan', 'rowspan', 'style'],
    th: ['colspan', 'rowspan', 'style'],
    col: ['style'],
    p: ['style'], h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'],
    span: ['style'], mark: ['style'],
  },
  // Les styles se réduisent à ce qu'une mise en page de texte demande : un
  // alignement, un fond de cellule, une couleur. Rien qui positionne.
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
      'color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
      'width': [/^\d+(\.\d+)?(px|%)$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // Un lien du corpus sort de Lucie : il s'ouvre ailleurs, sans donner la
    // main sur l'onglet d'origine.
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};
PERMIS.allowedAttributes.a.push('target', 'rel');

/** Le HTML d'un texte du corpus, réduit à ce qui est permis. */
export function assainir(html) {
  return sanitizeHtml(String(html || ''), PERMIS).trim();
}

/** Un HTML « vide » — des paragraphes sans rien dedans — reste un texte vide. */
export function estVide(html) {
  return !sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ').trim();
}

const echapper = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* LE PDF, EN PARAGRAPHES — LIGNE PAR LIGNE.
 *
 * pdftotext rend une ligne par ligne IMPRIMÉE, et le plus souvent SANS ligne
 * vide entre deux paragraphes : un premier essai qui coupait aux blancs
 * rendait un décret entier en deux blocs. On recompose donc sur les lignes :
 *   - un titre (« CHAPITRE II », « Article 1er », « Art. 3bis ») coupe
 *     partout où il paraît, et s'il porte du texte sur la même ligne
 *     (« Art. 2. L'établissement… »), le texte ouvre le paragraphe suivant ;
 *   - un paragraphe se clôt quand une ligne finit par . : ; ! ? ou » ET que
 *     la suivante commence par une majuscule, « § », « 1° » ou « a) » ;
 *   - une puce ouvre un élément de liste ;
 *   - un numéro de page seul sur sa ligne n'est pas du texte.
 * Rien d'autre n'est deviné : un titre inventé se corrige plus mal qu'un
 * titre manquant ne s'ajoute. Les tableaux d'un PDF ne se reconstituent pas,
 * et l'avertissement le dit. */
const RE_CHAPITRE = /^(LIVRE|TITRE|CHAPITRE|SECTION|Chapitre|Section|Titre)\s+([IVXLC]+|\d+)(er|re)?\b/;
const RE_ARTICLE = /^(Art(?:icle)?\.?\s*\d+(?:er)?(?:bis|ter|quater|quinquies)?)\s*[.:\-–]?\s*(?:[-–]\s*)?(.*)$/;
const RE_PUCE = /^[•●▪◦–\-]\s+/;
const RE_DEBUT = /^([A-ZÀ-ÖØ-Þ«§]|\d+°|[a-z]\)|\d+[.)]\s)/;

function pdfEnHtml(texte) {
  const lignes = String(texte)
    .replace(/\u0002/g, '-').replace(/\r/g, '').replace(/\f/g, '\n')
    .split('\n').map(l => l.trim())
    .filter(l => !/^(page\s*)?\d+(\s*(\/|sur)\s*\d+)?$/i.test(l));

  const sortie = [];
  let para = null;          // texte du paragraphe en cours
  let puce = null;          // texte de l'élément de liste en cours
  let liste = [];
  const joindre = (a, l) => (a.endsWith('-') && /^[a-zà-ÿ]/.test(l)
    ? a.slice(0, -1) + l : `${a} ${l}`);
  const fermerPuce = () => { if (puce !== null) liste.push(puce); puce = null; };
  const fermerListe = () => {
    fermerPuce();
    if (liste.length) sortie.push(`<ul>${liste.map(l => `<li>${echapper(l)}</li>`).join('')}</ul>`);
    liste = [];
  };
  const fermerPara = () => { if (para) sortie.push(`<p>${echapper(para)}</p>`); para = null; };
  const fermerTout = () => { fermerPara(); fermerListe(); };
  const finDePhrase = t => /[.:;!?»]$/.test(t || '');

  for (const l of lignes) {
    if (!l) { fermerTout(); continue; }
    if (RE_CHAPITRE.test(l) && l.length < 160) {
      fermerTout(); sortie.push(`<h2>${echapper(l)}</h2>`); continue;
    }
    const art = RE_ARTICLE.exec(l);
    // Un renvoi en cours de phrase (« … conformément à l' / Art. 5 du décret »)
    // n'est pas un titre : l'article ne coupe qu'en tête de paragraphe.
    if (art && (!para || finDePhrase(para)) && puce === null) {
      fermerTout(); sortie.push(`<h3>${echapper(art[1])}</h3>`);
      if (art[2]) para = art[2];
      continue;
    }
    if (RE_PUCE.test(l)) {
      fermerPara(); fermerPuce(); puce = l.replace(RE_PUCE, ''); continue;
    }
    if (puce !== null) {
      if (finDePhrase(puce) && RE_DEBUT.test(l)) { fermerListe(); para = l; }
      else puce = joindre(puce, l);
      continue;
    }
    if (para && finDePhrase(para) && RE_DEBUT.test(l)) { fermerPara(); para = l; continue; }
    para = para ? joindre(para, l) : l;
  }
  fermerTout();
  return sortie.join('\n');
}

/* LES TABLEAUX QUI N'EN SONT PAS, ET LES TITRES QUE WORD NE SAIT PAS.
 *
 * Les documents de l'IIP se mettent en page avec des tableaux d'UNE case :
 * le bandeau du titre, les parties (« PHASE 1 — AVANT L'EXAMEN »), les
 * encadrés (« ⚠ Attention », « Art. 82. – Délai… »). Constaté sur la
 * circulaire de rentrée et les procédures examens et recours de 2026-2027.
 * Transposés tels quels, ils enfermaient le texte entier dans des cadres —
 * vingt-quatre tableaux pour une procédure qui en compte neuf vrais.
 *   - le premier, en tête du document      → le titre (h1), le reste dessous
 *   - une case d'une seule ligne courte    → un titre de partie
 *   - une case plus longue, ou « ⚠ … »     → un encadré (blockquote)
 * Un tableau d'au moins deux cases reste un tableau : c'en est un.
 *
 * LE RANG D'UN TITRE SE LIT DU DOCUMENT, PAS D'UNE RÈGLE FIXE — et ce point a
 * été codé faux au premier essai. « 1. » valait h3 partout : juste pour la
 * procédure examens, où les PHASES coiffent les sections numérotées ; faux
 * pour la circulaire, où les sections numérotées SONT le sommet et où Word
 * a marqué les sous-titres en Titre 2 — ses sous-titres s'affichaient plus
 * gros que ses sections. On repère donc d'abord QUELLES SORTES de titres le
 * document emploie, puis on les range dans un ordre fixe, du plus englobant
 * au plus fin, en ne gardant que celles qui existent :
 *     partie encadrée › « 1. » › « 1.1 » › Titre Word 1, 2, 3 › gras seul
 * Un paragraphe tout en gras et numéroté est un intertitre, même si Word ne
 * l'a pas marqué comme tel ; et deux intertitres de même numérotation ont le
 * même rang, quel que soit le style que Word leur a posé. */
const ORDRE = ['case', 'num1', 'num2', 'word1', 'word2', 'word3', 'gras'];
const RE_NUMERO = /^(\d+(?:\.\d+)*)\.?\s+\S/;

function toutEnGras(el) {
  const texte = el.text.replace(/\s+/g, ' ').trim();
  if (!texte) return false;
  const gras = el.querySelectorAll('strong, b').map(b => b.text).join('')
    .replace(/\s+/g, ' ').trim();
  return gras === texte;
}

const echapperTexte = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function restructurer(html) {
  const racine = parseHtml(`<div>${html}</div>`).firstChild;
  const titres = [];           // { el, sorte, contenu }
  let premier = true;

  for (const el of [...racine.childNodes]) {
    if (el.nodeType !== 1) continue;
    const tag = el.tagName.toLowerCase();

    if (tag === 'table') {
      const cases = el.querySelectorAll('td, th');
      if (cases.length !== 1) { premier = false; continue; }
      const paras = cases[0].childNodes.filter(n => n.nodeType === 1);
      const texte = cases[0].text.replace(/\s+/g, ' ').trim();
      if (!texte) { el.remove(); continue; }
      if (premier) {
        // Un titre écrit sur plusieurs lignes en gras (« ORGANISATION ET
        // SURVEILLANCE » / « DES EXAMENS ») est UN titre : on réunit les
        // paragraphes tout en gras de tête, le reste reste en dessous.
        let n = 0;
        while (n < paras.length && toutEnGras(paras[n])) n++;
        const tete = n ? paras.slice(0, n).map(p => p.text.replace(/\s+/g, ' ').trim()).join(' ')
                       : texte;
        el.replaceWith(`<h1>${echapperTexte(tete)}</h1>`
          + paras.slice(Math.max(n, 1)).map(p => p.toString()).join(''));
      } else if (paras.length <= 1 && texte.length <= 120 && !/^⚠/.test(texte)) {
        titres.push({ el, sorte: 'case', contenu: paras[0] ? paras[0].innerHTML : echapperTexte(texte) });
      } else {
        el.replaceWith(`<blockquote>${cases[0].innerHTML}</blockquote>`);
      }
      premier = false;
      continue;
    }

    const texte = el.text.replace(/\s+/g, ' ').trim();
    if (texte) premier = false;
    if (!/^(p|h[1-6])$/.test(tag) || !texte || texte.length > 140) continue;
    const num = RE_NUMERO.exec(texte);
    const estTitreWord = tag !== 'p';
    if (num && (estTitreWord || toutEnGras(el))) {
      titres.push({ el, sorte: num[1].includes('.') ? 'num2' : 'num1',
                    contenu: echapperTexte(texte) });
    } else if (estTitreWord) {
      titres.push({ el, sorte: `word${Math.min(Number(tag[1]), 3)}`, contenu: el.innerHTML });
    } else if (toutEnGras(el) && texte.length <= 90 && !/[:.]$/.test(texte)) {
      titres.push({ el, sorte: 'gras', contenu: echapperTexte(texte) });
    }
  }

  // Les sortes présentes, dans l'ordre fixe → h2, h3, h4 (et h4 au-delà).
  const presentes = ORDRE.filter(o => titres.some(t => t.sorte === o));
  for (const t of titres) {
    const n = Math.min(2 + presentes.indexOf(t.sorte), 4);
    t.el.replaceWith(`<h${n}>${t.contenu}</h${n}>`);
  }
  return racine.innerHTML;
}

/**
 * ANALYSER UN FICHIER — et ne rien écrire.
 *
 * Même principe que l'import DP : RIEN NE S'ÉCRIT SANS QU'ON AIT VU CE QUI SERA
 * ÉCRIT. Cette fonction rend un aperçu ; c'est la publication, plus tard, qui
 * enregistre — après relecture et correction dans l'éditeur.
 *
 * @returns {{ html: string, avertissements: string[], origine: 'docx'|'pdf' }}
 */
export async function analyserFichier(buffer, nomFichier = '') {
  const nom = String(nomFichier).toLowerCase();
  const estPdf = nom.endsWith('.pdf') || buffer.subarray(0, 5).toString() === '%PDF-';
  const estDocx = nom.endsWith('.docx') || buffer.subarray(0, 2).toString() === 'PK';

  if (estPdf) {
    const texte = await pdfEnTexte(buffer, { layout: false });
    const html = assainir(pdfEnHtml(texte));
    const avertissements = [
      'Texte extrait d’un PDF : les paragraphes ont été recomposés, les articles '
      + 'et chapitres repérés comme titres. Les tableaux d’un PDF ne se '
      + 'reconstituent pas — relisez avant de publier.',
    ];
    if (estVide(html)) {
      avertissements.unshift('Aucun texte n’a pu être extrait : ce PDF est '
        + 'probablement une image (document scanné). Il faudrait le texte source.');
    }
    return { html, avertissements, origine: 'pdf' };
  }

  if (estDocx) {
    const r = await mammoth.convertToHtml({ buffer }, {
      // Les images d'un .docx partiraient en base64 dans la base, à chaque
      // version : c'est précisément ce que Charles a demandé d'éviter pour les
      // PDF. On les laisse de côté, et on le dit.
      convertImage: mammoth.images.imgElement(() => ({ src: '' })),
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Titre'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
      ],
    });
    const brut = r.value || '';
    const html = assainir(restructurer(brut));
    const avertissements = [];
    if (/<img\b/i.test(brut)) {
      avertissements.push('Le document contient des images : elles n’ont pas été '
        + 'reprises. Seul le texte et sa mise en forme le sont.');
    }
    if (estVide(html)) avertissements.push('Aucun texte n’a pu être lu dans ce fichier.');
    return { html, avertissements, origine: 'docx' };
  }

  const err = new Error('Seuls les fichiers Word (.docx) et PDF sont acceptés. '
    + 'Un ancien .doc s’enregistre d’abord en .docx depuis Word.');
  err.status = 400;
  throw err;
}

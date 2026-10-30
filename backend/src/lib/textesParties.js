// ─────────────────────────────────────────────────────────────────────────────
// LES TEXTES DE L'IIP, ÉCRITS PAR PARTIES DANS LUCIE (3.1.489, Charles, 30 octobre 2026 : « que les procédures soient
// aussi sur ce modèle par partie ; cela rendrait les choses plus claires ; Lucie deviendrait l'endroit où on les crée,
// pas où on les importe ; l'endroit aussi pour les imprimer »). Tranché : les textes que l'IIP rédige (procédures, RDE,
// ROI, notes) ; une partie se compose comme le mode d'emploi ; l'existant se DÉCOUPE à ses titres ; tout de suite.
//
// Une version au format 'parties' porte un JSON :
//   { parties: [ { titre, resume, points: [ { titre, qui, ou, contenu (HTML assaini), savoir: [texte] } ] } ] }
// La règle du corpus ne change pas : une version publiée ne se modifie plus, la suivante dit ce qui change, les
// confirmations suivent `etatLecture`. Le HTML d'un point passe par la même liste fermée (`assainir`) que les textes
// mis en forme ; titres, « qui », « où » et « à savoir » sont du texte brut.
// ─────────────────────────────────────────────────────────────────────────────
import { parse as parseHtml } from 'node-html-parser';
import { assainir, estVide } from './texteCorpus.js';

const sansNumero = t => t.replace(/^\s*(?:\d+(?:\.\d+)*|[IVXLC]+|[a-z])\s*[.)°:–-]\s*/i, '').trim() || t;
const texte = (v, max = 2000) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Normalise et assainit un texte par parties. Rend `null` s'il est vide. */
export function assainirParties(entree) {
  let o = entree;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return null; } }
  const parties = (Array.isArray(o?.parties) ? o.parties : []).slice(0, 80).map(p => ({
    titre: texte(p?.titre, 200),
    resume: texte(p?.resume, 600),
    points: (Array.isArray(p?.points) ? p.points : []).slice(0, 120).map(pt => {
      const contenu = assainir(pt?.contenu || '');
      return {
        titre: texte(pt?.titre, 300),
        qui: texte(pt?.qui, 300),
        ou: texte(pt?.ou, 400),
        contenu: estVide(contenu) ? '' : contenu,
        savoir: (Array.isArray(pt?.savoir) ? pt.savoir : []).map(s => texte(s, 600)).filter(Boolean).slice(0, 30),
      };
    }).filter(pt => pt.titre || pt.contenu || pt.savoir.length),
  })).filter(p => p.titre || p.points.length);
  if (!parties.length || !parties.some(p => p.points.length)) return null;
  return { parties };
}

/**
 * DÉCOUPER UN TEXTE MIS EN FORME EN PARTIES, À SES TITRES. Le niveau le plus haut présent devient la partie, le
 * suivant le point ; ce qui précède le premier titre devient une partie « Préambule ». Rien n'est publié : la
 * direction relit la proposition, la retouche, puis publie la version suivante.
 */
export function decouperEnParties(html, titreDocument = '') {
  const racine = parseHtml(`<div>${assainir(html)}</div>`).firstChild;
  const blocs = racine.childNodes.filter(n => n.nodeType === 1 || String(n.text || '').trim());
  const niveaux = ['h1', 'h2', 'h3', 'h4'].filter(h => blocs.some(b => b.tagName?.toLowerCase() === h));
  const [hPartie, hPoint] = niveaux;
  // UN TEXTE SANS TITRES passe en une seule partie, un seul point : rien n'est perdu, la découpe se fait ensuite à la main.
  if (!hPartie) {
    return assainirParties({ parties: [{ titre: titreDocument || 'Texte', resume: '', points: [{ titre: '', contenu: html }] }] }) || { parties: [] };
  }
  const parties = [];
  let partie = null, point = null;
  const nouvellePartie = titre => { partie = { titre, resume: '', points: [] }; parties.push(partie); point = null; };
  const nouveauPoint = titre => { if (!partie) nouvellePartie('Préambule'); point = { titre, qui: '', ou: '', contenu: '', savoir: [] }; partie.points.push(point); };
  for (const b of blocs) {
    const tag = b.tagName?.toLowerCase();
    // La numérotation se refait à l'affichage : « 1. », « II – », « Article 3 : » ne se recopient pas dans le titre.
    if (hPartie && tag === hPartie) { nouvellePartie(sansNumero(texte(b.text, 200))); continue; }
    if (hPoint && tag === hPoint) { nouveauPoint(sansNumero(texte(b.text, 300))); continue; }
    if (!point) nouveauPoint(!partie || !partie.points.length ? '' : 'Suite');
    point.contenu += b.toString();
  }
  for (const p of parties) for (const pt of p.points) {
    pt.contenu = assainir(pt.contenu);
    // Un point sans titre au début d'une partie : son texte devient le résumé s'il est court, sinon il garde le titre de la partie.
    if (!pt.titre) {
      const brut = texte(parseHtml(pt.contenu).text, 2000);
      if (brut.length <= 400 && !/<(table|ul|ol)/.test(pt.contenu)) { p.resume = brut; pt.contenu = ''; }
      else pt.titre = p.titre;
    }
  }
  return assainirParties({ parties }) || { parties: [] };
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Les boutons écrits [[Libellé|…]] : sur papier, le libellé entre crochets, en gras. */
const boutonsPapier = h => String(h || '').replace(/\[\[([^\]|]+)[^\]]*\]\]/g, (_, l) => `<b class="bt">[${esc(l.trim())}]</b>`);

/** Le corps imprimable d'un texte par parties : sommaire, puis chaque partie et ses points numérotés. */
export function corpsImprimable({ titre, version, parties }) {
  const sommaire = parties.map((p, i) => `<li><span>${i + 1}.</span> ${esc(p.titre)}</li>`).join('');
  const corps = parties.map((p, i) => `
    <section class="tp-partie">
      <h2><span class="tp-num">${i + 1}</span> ${esc(p.titre)}</h2>
      ${p.resume ? `<p class="tp-resume">${esc(p.resume)}</p>` : ''}
      ${p.points.map((pt, k) => `
        <div class="tp-point">
          <h3><span class="tp-n">${i + 1}.${k + 1}</span> ${esc(pt.titre)}</h3>
          ${pt.qui ? `<p class="tp-meta"><b>Qui :</b> ${esc(pt.qui)}</p>` : ''}
          ${pt.ou ? `<p class="tp-meta"><b>Où :</b> ${boutonsPapier(esc(pt.ou))}</p>` : ''}
          ${pt.contenu ? `<div class="tp-contenu">${boutonsPapier(pt.contenu)}</div>` : ''}
          ${pt.savoir.length ? `<div class="tp-savoir"><b>À savoir</b><ul>${pt.savoir.map(s => `<li>${boutonsPapier(esc(s))}</li>`).join('')}</ul></div>` : ''}
        </div>`).join('')}
    </section>`).join('');
  return `
    <div class="tp-version">Version ${esc(version?.numero)} du ${esc(String(version?.publiee_le || '').slice(0, 10).split('-').reverse().join('/'))}${version?.publiee_par ? ` · publiée par ${esc(version.publiee_par)}` : ''}</div>
    ${parties.length > 1 ? `<div class="tp-sommaire"><b>Sommaire</b><ol>${sommaire}</ol></div>` : ''}
    ${corps}`;
}

export const STYLES_IMPRESSION = `
  .tp-version { font-size: 8.5pt; color: #64748B; margin: 0 0 4mm; }
  .tp-sommaire { border: 0.3mm solid #D8DCE4; border-left: 1mm solid #1B2B4B; border-radius: 0 2.6mm 2.6mm 0; padding: 3mm 4mm; margin: 0 0 6mm; font-size: 9.5pt; }
  .tp-sommaire ol { list-style: none; margin: 1.5mm 0 0; padding: 0; columns: 2; column-gap: 8mm; }
  .tp-sommaire li span { color: #64748B; display: inline-block; min-width: 6mm; }
  .tp-partie { margin: 0 0 6mm; }
  .tp-partie h2 { font-size: 13pt; color: #1B2B4B; margin: 7mm 0 2mm; page-break-after: avoid; }
  .tp-num { display: inline-block; min-width: 7mm; color: #64748B; }
  .tp-resume { font-size: 9.5pt; color: #475569; margin: 0 0 3mm; }
  .tp-point { border: 0.3mm solid #D8DCE4; border-left: 1mm solid #1B2B4B; border-radius: 0 2.6mm 2.6mm 0; padding: 2.5mm 4mm; margin: 0 0 3mm; page-break-inside: avoid; font-size: 9.5pt; }
  .tp-point h3 { font-size: 10.5pt; color: #1B2B4B; margin: 0 0 1.5mm; }
  .tp-n { color: #64748B; font-weight: 600; margin-right: 1.5mm; }
  .tp-meta { margin: 0 0 1mm; font-size: 9pt; color: #334155; }
  .tp-contenu p { margin: 0 0 1.5mm; } .tp-contenu table { border-collapse: collapse; width: 100%; margin: 1.5mm 0; }
  .tp-contenu td, .tp-contenu th { border: 0.2mm solid #CBD5E1; padding: 1mm 1.5mm; vertical-align: top; }
  .tp-savoir { margin-top: 1.5mm; border-top: 0.2mm dashed #CBD5E1; padding-top: 1.5mm; font-size: 9pt; }
  .tp-savoir ul { margin: 1mm 0 0; padding-left: 5mm; }
  .bt { font-weight: 700; }
`;

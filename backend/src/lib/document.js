// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Enveloppe commune des documents imprimés
//
// Tout document produit par Lucie porte le même pied de page — logo, raison
// sociale, numéro FASE, coordonnées — sauf le diplôme, qui a sa propre forme.
//
// Ce pied doit être COLLÉ EN BAS de chaque page, y compris de la dernière.
// La technique employée jusqu'ici, `display: table-footer-group`, le répète
// bien sur chaque page mais le pose immédiatement après le contenu : sur une
// dernière page à moitié vide, il flottait au milieu.
//
// La position fixe résout les deux à la fois. En impression, un élément
// `position: fixed` se répète sur chaque page et reste ancré à ses coordonnées.
// Il suffit de réserver sa hauteur dans la marge basse de `@page`, sans quoi le
// texte passerait dessous.
// ─────────────────────────────────────────────────────────────────────────────

import { piedDocument } from '../routes/parametres.js';
import db from '../db/index.js';

// ── RÈGLE UNIQUE DU PIED DE PAGE ─────────────────────────────────────────────
// Une seule réserve, pour TOUS les documents, comme le pied d'un Word : les
// derniers millimètres de chaque page lui appartiennent, le texte n'y descend
// jamais. Chaque document définissait auparavant ses propres valeurs, si bien
// qu'une correction n'en atteignait qu'un à la fois.
//
// BANDE_PIED_MM  hauteur totale réservée, du bord bas de la page
// MARGE_SOUS_PIED_MM  ce qui sépare le pied du bord de la feuille

export const BANDE_PIED_MM = 24;        // ~2,4 cm : logo, filet, deux lignes
export const MARGE_SOUS_PIED_MM = 8;    // le pied ne colle pas au bord

// Hauteur du bloc lui-même, une fois retirée la marge sous lui.
const HAUTEUR_PIED_MM = BANDE_PIED_MM - MARGE_SOUS_PIED_MM;

/**
 * Les règles de page communes à TOUT document imprimé par Lucie.
 *
 * À appeler dans le <style> de n'importe quel document : il hérite alors de la
 * même réserve de pied, sans avoir à recalculer marges et paddings.
 *
 * @param {object} [o]
 * @param {number} [o.haut]   marge haute, en mm
 * @param {number} [o.cote]   marges latérales, en mm
 * @param {string} [o.orientation]
 * @param {boolean}[o.avecPied]
 */
export function reglesDePage({ haut = 18, cote = 18,
                               orientation = 'portrait', avecPied = true } = {}) {
  return `
  @page {
    size: A4 ${orientation === 'paysage' ? 'landscape' : 'portrait'};
    /* La marge basse EST la réserve du pied. Elle n'ajoute rien au flux, à la
       différence d'un padding : c'est ce qui empêche une page blanche
       surnuméraire quand le contenu finit près du bas. */
    /* LA MARGE BASSE S'ARRÊTE OÙ LE PIED COMMENCE. Elle valait la bande
       entière (${BANDE_PIED_MM}mm) et le pied était repoussé SOUS elle par un
       décalage négatif : à l'impression, il sortait de la page — le filet seul
       restait en bas de la première, et le texte réapparaissait EN HAUT de la
       suivante, par-dessus l'en-tête du tableau. Un élément fixe ne doit pas
       déborder de la boîte de page ; la marge basse ne réserve donc plus que
       l'espace SOUS le pied, et le pied occupe le reste. */
    margin: ${haut}mm ${cote}mm ${avecPied ? BANDE_PIED_MM : haut}mm ${cote}mm;
  }
  /* Aucun padding de réserve : un padding de corps ne vaut que sur la DERNIÈRE
     page — essayé, et le pied venait s'imprimer par-dessus les lignes de la
     première. C'est la marge basse, ci-dessus, qui réserve la bande sur
     CHAQUE page ; le pied s'y loge sans déborder. */
  body { padding-bottom: 0; }`;
}

/**
 * @param {object}  o
 * @param {string}  o.html         corps du document
 * @param {string}  o.titre        titre de la fenêtre et du fichier
 * @param {string} [o.orientation] 'portrait' (défaut) ou 'paysage'
 * @param {string} [o.styles]      règles supplémentaires propres au document
 * @param {string} [o.logo]        logo encodé, pour les documents qui en portent un
 * @param {boolean}[o.avecPied]    false pour le diplôme, qui a sa propre forme
 */
/**
 * Le pied de page, en morceau réutilisable.
 *
 * Trois documents recopiaient chacun le leur : une correction n'en atteignait
 * qu'un seul à la fois, ce qui nous a coûté plusieurs allers-retours. Ils
 * partagent désormais ce balisage et ces styles, tout en gardant leurs propres
 * marges de page.
 *
 * Le logo est AU-DESSUS du filet doré et calé à GAUCHE : il sort donc du bloc
 * bordé, qui ne porte plus que le texte.
 */
export function piedBalisage(logo = null) {
  return `<div class="pied-lucie">`
    + (logo ? `<img class="pied-logo" src="${logo}" alt="">` : '')
    + `<div class="pied-filet"><div class="pied-txt">${piedDocument()}</div></div>`
    + `</div>`;
}

export function piedStyles(hauteur = HAUTEUR_PIED_MM, margeHaut = 18) {
  return `
  /* Le pied descend DANS la marge basse : « bottom: 0 » l'arrêterait au bas de
     la zone de contenu, soit à ${BANDE_PIED_MM}mm du bord, d'où le blanc dessous. */
  /* LE PIED SE RÉPÈTE PARCE QU'IL EST UN « tfoot », NON PARCE QU'IL EST FIXE.
   *
   * Un élément en position fixe n'est PAS répété de page en page à
   * l'impression : Chromium le dessine une fois, à cheval sur la coupure —
   * on obtenait le filet seul en bas de la première page et le texte en haut
   * de la seconde, par-dessus l'en-tête du tableau. Vérifié, PDF à l'appui,
   * puis vérifié encore après correction.
   *
   * La seule mécanique qui se répète vraiment est celle des tableaux : un
   * pied de tableau est redessiné au bas de CHAQUE page. Le corps du document
   * est donc posé dans une table d'une seule cellule, dont le pied de tableau
   * est le nôtre. C'est
   * la technique unique que la charte réclamait — il y en avait quatre. */
  /* La hauteur d'une table est un MINIMUM : en lui donnant celle de la zone
     de contenu, le pied descend au bas de la feuille même quand la pièce ne
     fait que dix lignes — sans quoi il se collait sous le dernier paragraphe. */
  table.feuille { width: 100%; border-collapse: collapse;
                  height: calc(297mm - ${margeHaut}mm - ${BANDE_PIED_MM}mm); }
  table.feuille > tbody > tr > td { vertical-align: top; }
  table.feuille > tbody > tr > td,
  table.feuille > tfoot > tr > td { border: 0; padding: 0; }
  table.feuille > tfoot { display: table-footer-group; }
  .pied-lucie { height: ${hauteur}mm; padding-top: 2mm; }
  .pied-lucie .pied-logo { height: ${Math.max(5, hauteur - 10)}mm; width: auto;
                           display: block; margin: 0 0 1.2mm; opacity: .9; }
  .pied-lucie .pied-filet { border-top: 0.5pt solid #C9A84C; padding-top: 1.5mm;
                            text-align: center; }
  .pied-lucie .pied-txt { font-size: 6pt; color: #888; line-height: 1.3; }
  /* À l'écran, la position fixe collerait le pied au bas de la FENÊTRE, non de
     la page. On simule donc la feuille : hauteur d'une A4 et pied repoussé en
     bas par « margin-top: auto ». L'aperçu montre alors ce que donnera
     l'impression, au lieu d'un pied collé sous le texte. */
  @media screen {
    /* À l'écran il n'y a pas de pages : on simule la feuille pour que l'aperçu
       montre le pied là où il s'imprimera, au lieu de le coller sous le texte. */
    body { min-height: 297mm; }
    table.feuille { min-height: calc(297mm - ${margeHaut}mm - ${BANDE_PIED_MM}mm); }
  }

  /* Plus de repli propre à Safari : un pied de tableau se répète de la même
     façon dans tous les navigateurs — c'était bien l'objet de l'unification. */
`;
}

/**
 * L'EN-TÊTE DE L'ÉTABLISSEMENT — ce qui manquait à toutes les pièces.
 *
 * L'enveloppe commune ne posait qu'un PIED. Les rapports sortaient donc avec
 * un titre en gras sur une page blanche : ni le nom de l'école, ni son numéro
 * FASE, ni la nature de la pièce. Présenté au COPIL, à une inspection ou à la
 * Fédération, un tel papier ne prouve rien — et c'est bien la question posée :
 * « je fais quoi avec ça ? »
 *
 * L'ordre est celui de la charte : filet fin, identité de l'établissement,
 * puis un cadre de titre portant ce que la pièce est, pour qui et pour quand.
 * Le tout tient en trois centimètres, et ne se répète pas d'une page à
 * l'autre : c'est une pièce, pas un formulaire.
 */
export function enteteDocument({ titre, sous = null, mention = null } = {}) {
  let etab = {};
  try { etab = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {}; } catch { /* base minimale */ }
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const ident = [etab.etab_nom, etab.adresse].filter(Boolean).map(esc).join(' · ');
  const refs = [
    etab.num_fase ? `FASE ${esc(etab.num_fase)}` : null,
    etab.num_entreprise ? `N° entreprise ${esc(etab.num_entreprise)}` : null,
  ].filter(Boolean).join(' · ');

  return `<div class="doc-entete">
    <div class="doc-ident">${ident || 'Institut Ilya Prigogine'}${
      refs ? `<span class="doc-refs">${refs}</span>` : ''}</div>
    <div class="doc-titre">
      <div class="doc-titre-t">${esc(titre)}</div>
      ${sous ? `<div class="doc-titre-s">${esc(sous)}</div>` : ''}
      ${mention ? `<div class="doc-titre-m">${esc(mention)}</div>` : ''}
    </div>
  </div>`;
}

export function envelopperDocument({ html, titre, orientation = 'portrait',
                                     styles = '', logo = null, avecPied = true,
                                     margeHaut = 18, margeCote = 18,
                                     entete = null }) {
  const pied = avecPied ? piedDocument() : '';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const piedHtml = avecPied && pied ? piedBalisage(logo) : '';
  // `entete` porte ce que la pièce veut annoncer ; passé à `false`, on n'en
  // met pas — le diplôme et le corps de courriel restent hors standard.
  const enteteHtml = entete === false ? ''
    : enteteDocument(entete || { titre });

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(titre)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  ${reglesDePage({ haut: margeHaut, cote: margeCote, orientation, avecPied })}

  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt;
         color: #1a1a2e; margin: 0; }
  /* La place du pied se réserve ici, faute de quoi le texte passerait dessous. */
  img { max-width: 100%; background: #fff; }
  /* ── L'EN-TÊTE ──────────────────────────────────────────────────────────
   *
   * LA HIÉRARCHIE SE FAIT PAR LA GRAISSE ET PAR L'AIR, PAS PAR DES TRAITS.
   *
   * Le titre vivait dans un cadre à filet marine : une convention de formulaire
   * administratif, qui date la pièce au premier coup d'œil. Un cadre dit
   * « ceci est une case à remplir » ; or ce n'en est pas une. Ce qu'il faut
   * lire en premier doit simplement être PLUS GROS et PLUS NOIR que le reste,
   * et avoir de la place autour de lui.
   *
   * Trois niveaux, trois graisses, un seul filet — celui qui sépare l'identité
   * de l'établissement du titre de la pièce, et il est de la couleur de la
   * maison. Rien d'autre.
   */
  .doc-entete { margin: 0 0 9mm; }
  .doc-ident { font-size: 7.5pt; color: #6e6e73; letter-spacing: .35pt;
               text-transform: uppercase; font-weight: 600;
               padding-bottom: 2mm; border-bottom: 0.25mm solid #C9A84C;
               display: flex; justify-content: space-between; gap: 6mm; }
  .doc-refs { color: #a1a1a6; white-space: nowrap; font-weight: 400;
              letter-spacing: .2pt; }
  .doc-titre { margin-top: 7mm; }
  /* Un titre de pièce se lit de loin, sur une table de réunion : grand, serré,
     et d'un seul poids. */
  .doc-titre-t { font-size: 19pt; font-weight: 700; color: #1B2B4B;
                 letter-spacing: -.45pt; line-height: 1.08; }
  .doc-titre-s { font-size: 10.5pt; color: #6e6e73; margin-top: 1.8mm;
                 letter-spacing: -.1pt; }
  .doc-titre-m { font-size: 8pt; color: #a1a1a6; margin-top: 2.5mm;
                 max-width: 150mm; line-height: 1.4; }
  /* Le titre est dans le cadre : un h1 dans le corps le dirait deux fois. */
  h1 { font-size: 15pt; color: #1B2B4B; margin: 0 0 2mm; }
  /* UN SEUL FILET DORÉ PAR PAGE, ET IL EST EN TÊTE. Sous chaque titre de
     section, il transformait la pièce en page de garde des années 2000 :
     quatre traits dorés sur une feuille qui n'a qu'un sujet. Un titre se
     distingue par sa graisse et par l'air qu'on lui laisse. */
  /* UN INTERTITRE SE VOIT PARCE QU'IL A DE LA PLACE, pas parce qu'il est
     souligné. Onze points collés au tableau précédent se lisaient comme une
     ligne de données ; treize points avec de l'air au-dessus ouvrent une
     section. */
  h2 { font-size: 13pt; color: #1B2B4B; margin: 9mm 0 3mm;
       letter-spacing: -.35pt; font-weight: 700; }
  h3 { font-size: 10.5pt; color: #1B2B4B; margin: 5mm 0 1.5mm; }
  p  { margin: 1.5mm 0; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0; }
  /* LES COLONNES S'ALIGNENT SUR LES BORDS DE LA PIÈCE.
     Le padding de cellule décalait le texte de la première colonne de 2 mm
     vers l'intérieur : « SECTION » commençait à droite du nom de
     l'établissement et du cadre de titre, qui, eux, partent de la marge. Trois
     bords de gauche différents sur la même feuille. La première et la dernière
     cellule perdent donc leur retrait extérieur ; l'air entre les colonnes,
     lui, reste. */
  table:not(.feuille) > * > tr > *:first-child { padding-left: 0; }
  table:not(.feuille) > * > tr > *:last-child { padding-right: 0; }
  th, td { border: 0.5pt solid #cbd5e1; padding: 1.2mm 2mm; vertical-align: top;
           font-size: 9pt; }
  th { background: #f1f5f9; text-align: left; font-size: 8pt;
       text-transform: uppercase; letter-spacing: .3pt; color: #475569; }
  .page-break { break-after: page; page-break-after: always; height: 0; }
  tr, td, th { break-inside: avoid; page-break-inside: avoid; }

  /* Le pied, ancré en bas de CHAQUE page — dernière comprise. */
  ${piedStyles(HAUTEUR_PIED_MM, margeHaut)}

  /* À l'écran, la position fixe collerait le pied au bas de la fenêtre, non
     de la page : on le laisse suivre le flux tant qu'on n'imprime pas. */
  @media screen {
    html { background: #e5e5e5; }
    /* Le padding suit les marges réglées, sinon l'aperçu ne correspond pas au
       document imprimé. */
    body { max-width: ${orientation === 'paysage' ? '297mm' : '210mm'};
           margin: 16px auto; padding: ${margeHaut}mm ${margeCote}mm 0; background: #fff;
           box-shadow: 0 2px 14px rgba(0,0,0,.18); }
  }

${styles}
</style></head><body>
<table class="feuille"><tfoot><tr><td>${piedHtml}</td></tr></tfoot>
<tbody><tr><td>
${enteteHtml}
${html}
</td></tr></tbody></table>
</body></html>`;
}

export default envelopperDocument;

/**
 * LE PIED, EN GABARIT CHROMIUM — un vrai pied de page, sur CHAQUE feuille.
 *
 * En HTML pur, un pied répété sur chaque page n'existe pas : `position: fixed`
 * s'ancre au bas de la zone de contenu et se fait recouvrir par un tableau qui
 * la dépasse, et `table-footer-group` se pose sous le texte au lieu du bas de
 * la feuille. Les documents de délibération sortaient donc « en continu » :
 * un seul pied, à la toute fin du lot.
 *
 * Chromium, lui, dispose du gabarit que le HTML n'a pas. Ce balisage lui est
 * destiné : styles EN LIGNE — aucune feuille du document ne s'y applique —,
 * tailles en points, et le logo en data-URI faute de quoi il ne se charge pas.
 *
 * @param {string|null} logo  image encodée en data-URI
 * @param {string}      texte pied de l'établissement, déjà mis en forme
 * @param {boolean}     numeroter  ajoute « n / total » sous le filet
 */
export function piedGabaritPdf(logo, texte, numeroter = false) {
  const T = String(texte || '').trim();
  return '<div style="width:100%;font-family:Arial,Helvetica,sans-serif;'
       + 'padding:0 15mm;margin:0;">'
       + (logo ? `<img src="${logo}" style="height:7mm;display:block;margin:0 0 1mm;opacity:.9">` : '')
       + '<div style="border-top:0.5pt solid #C9A84C;padding-top:1.2mm;text-align:center">'
       + `<div style="font-size:6pt;color:#888;line-height:1.3">${T}</div>`
       + (numeroter
          ? '<div style="font-size:6pt;color:#aaa;margin-top:0.6mm">'
            + '<span class="pageNumber"></span> / <span class="totalPages"></span></div>'
          : '')
       + '</div></div>';
}

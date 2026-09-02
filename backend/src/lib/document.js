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
    margin: ${haut}mm ${cote}mm ${avecPied ? BANDE_PIED_MM : haut}mm ${cote}mm;
  }
  /* Aucun padding de réserve : il ferait partie du flux et déborderait. */
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

export function piedStyles(hauteur = HAUTEUR_PIED_MM) {
  return `
  /* Le pied descend DANS la marge basse : « bottom: 0 » l'arrêterait au bas de
     la zone de contenu, soit à ${BANDE_PIED_MM}mm du bord, d'où le blanc dessous. */
  .pied-lucie { position: fixed; left: 0; right: 0;
                bottom: -${BANDE_PIED_MM - MARGE_SOUS_PIED_MM}mm;
                height: ${hauteur}mm; }
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
    body { min-height: 297mm; display: flex; flex-direction: column; }
    body > .pied-lucie { position: static; height: auto; margin-top: auto;
                         padding-top: 10mm; }
  }`;
}

export function envelopperDocument({ html, titre, orientation = 'portrait',
                                     styles = '', logo = null, avecPied = true,
                                     margeHaut = 18, margeCote = 18 }) {
  const pied = avecPied ? piedDocument() : '';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const piedHtml = avecPied && pied ? piedBalisage(logo) : '';

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(titre)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  ${reglesDePage({ haut: margeHaut, cote: margeCote, orientation, avecPied })}

  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt;
         color: #1a1a2e; margin: 0; }
  /* La place du pied se réserve ici, faute de quoi le texte passerait dessous. */
  img { max-width: 100%; background: #fff; }
  h1 { font-size: 15pt; color: #1B2B4B; margin: 0 0 2mm; }
  h2 { font-size: 12pt; color: #1B2B4B; margin: 6mm 0 2mm;
       border-bottom: 1.5pt solid #C9A84C; padding-bottom: 1mm; }
  h3 { font-size: 10.5pt; color: #1B2B4B; margin: 5mm 0 1.5mm; }
  p  { margin: 1.5mm 0; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0; }
  th, td { border: 0.5pt solid #cbd5e1; padding: 1.2mm 2mm; vertical-align: top;
           font-size: 9pt; }
  th { background: #f1f5f9; text-align: left; font-size: 8pt;
       text-transform: uppercase; letter-spacing: .3pt; color: #475569; }
  .page-break { break-after: page; page-break-after: always; height: 0; }
  tr, td, th { break-inside: avoid; page-break-inside: avoid; }

  /* Le pied, ancré en bas de CHAQUE page — dernière comprise. */
  ${piedStyles(HAUTEUR_PIED_MM)}

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
${html}
${piedHtml}
</body></html>`;
}

export default envelopperDocument;

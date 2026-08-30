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

// Hauteur réservée au pied : logo, filet et deux lignes de coordonnées.
const HAUTEUR_PIED_MM = 22;

/**
 * @param {object}  o
 * @param {string}  o.html         corps du document
 * @param {string}  o.titre        titre de la fenêtre et du fichier
 * @param {string} [o.orientation] 'portrait' (défaut) ou 'paysage'
 * @param {string} [o.styles]      règles supplémentaires propres au document
 * @param {string} [o.logo]        logo encodé, pour les documents qui en portent un
 * @param {boolean}[o.avecPied]    false pour le diplôme, qui a sa propre forme
 */
export function envelopperDocument({ html, titre, orientation = 'portrait',
                                     styles = '', logo = null, avecPied = true }) {
  const pied = avecPied ? piedDocument() : '';
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const piedHtml = avecPied && pied ? `
    <div class="pied-lucie">
      ${logo ? `<img class="pied-logo" src="${logo}" alt="">` : ''}
      <div class="pied-txt">${pied}</div>
    </div>` : '';

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(titre)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* La marge basse réserve la place du pied : sans elle, le texte passerait
     dessous à la fin de chaque page. */
  @page {
    size: A4 ${orientation === 'paysage' ? 'landscape' : 'portrait'};
    margin: 18mm 18mm ${avecPied ? HAUTEUR_PIED_MM + 6 : 18}mm 18mm;
  }

  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt;
         color: #1a1a2e; margin: 0; }
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
  .pied-lucie {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: ${HAUTEUR_PIED_MM}mm;
    padding-top: 2mm;
    border-top: 0.5pt solid #C9A84C;
    text-align: center;
  }
  .pied-lucie .pied-logo { height: 8mm; width: auto; display: block;
                           margin: 0 auto 1.5mm; opacity: .9; }
  .pied-lucie .pied-txt { font-size: 6pt; color: #888; line-height: 1.35; }

  /* À l'écran, la position fixe collerait le pied au bas de la fenêtre, non
     de la page : on le laisse suivre le flux tant qu'on n'imprime pas. */
  @media screen {
    html { background: #e5e5e5; }
    body { max-width: ${orientation === 'paysage' ? '297mm' : '210mm'};
           margin: 16px auto; padding: 18mm; background: #fff;
           box-shadow: 0 2px 14px rgba(0,0,0,.18); }
    .pied-lucie { position: static; margin-top: 10mm; height: auto; }
  }

${styles}
</style></head><body>
${html}
${piedHtml}
</body></html>`;
}

export default envelopperDocument;

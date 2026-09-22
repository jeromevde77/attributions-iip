import { envelopperDocument } from '../lib/document.js';

/**
 * LA LISTE DES COORDONNÉES — la pièce qu'on sort d'une sélection cochée.
 *
 * Étudiants et personnel se cochent chacun sur leur écran, mais la pièce est
 * la même : un tableau nominatif des moyens de joindre les personnes retenues.
 * Une seule mise en page, deux appels — les colonnes viennent de la route,
 * puisque ce sont elles qui savent ce qu'un étudiant ou un professeur porte.
 */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function htmlListeCoordonnees({ titre, sousTitre, colonnes, lignes }) {
  const enTetes = colonnes.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const corps = lignes.map((l, i) =>
    `<tr><td class="num">${i + 1}</td>${colonnes.map((c) => `<td>${esc(l[c.cle])}</td>`).join('')}</tr>`
  ).join('\n');

  const html = `
<div class="meta">${esc(sousTitre)} · imprimé le ${new Date().toLocaleDateString('fr-BE')}</div>
<table>
  <thead><tr><th class="num"></th>${enTetes}</tr></thead>
  <tbody>${corps || `<tr><td colspan="${colonnes.length + 1}" class="vide">Personne dans la sélection</td></tr>`}</tbody>
</table>`;

  const styles = `
  table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; }
  th.num, td.num { width: 22px; text-align: right; color: #94a3b8; }
  tr { page-break-inside: avoid; }
  .meta { color: #64748b; margin: 0 0 10px; font-size: 9pt; }
  .vide { color: #94a3b8; }`;

  return envelopperDocument({ html, titre, styles });
}

/**
 * UNE SIGNATURE QUI SE COPIE DOIT DIRE D'OÙ ELLE VIENT (Charles, 25 septembre
 * 2026 : « un filigrane gris clair dans la signature, à plusieurs endroits,
 * avec la date de la signature et le document lié, pour éviter qu'elle soit
 * copiée puis collée ailleurs »).
 *
 * Aucune technique n'empêche de copier une image qu'on affiche : ce qui
 * s'affiche chez le destinataire est chez lui. On rend donc la copie INUTILE
 * plutôt qu'impossible : chaque envoi reçoit SON fac-similé, traversé en
 * diagonale par l'Institut, la pièce, le destinataire, la date et une
 * référence. Collée sous un autre texte, la signature dit à quelle pièce elle
 * appartient — et la référence se retrouve dans le registre des envois.
 *
 * Sans navigateur pour la dessiner, PAS DE FAC-SIMILÉ DU TOUT : l'appelant
 * reçoit `null` et pose un trait de signature. Une signature nue ne part
 * jamais.
 */
import { rendreImage, capacitePdf } from './pdf.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Une référence courte, lisible au téléphone : sans 0/O ni 1/I. */
export function nouvelleReference() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 8; i++) r += A[Math.floor(Math.random() * A.length)];
  return `IIP-${r.slice(0, 4)}-${r.slice(4)}`;
}

/**
 * @param {string} dataUri   la signature (data:image/png;base64,…)
 * @param {{ piece: string, destinataire?: string, date: string, reference: string }} m
 * @returns {Promise<Buffer|null>}  PNG filigrané, ou null si impossible
 */
export async function signatureFiligranee(dataUri, m) {
  if (!dataUri) return null;
  try {
    const cap = await capacitePdf();
    if (!cap.disponible) return null;
    const ligne = [ 'Institut Ilya Prigogine', m.piece, m.destinataire, m.date, `réf. ${m.reference}` ]
      .filter(Boolean).map(esc).join(' · ');
    // UN SEUL BLOC DE LIGNES, INCLINÉ D'UN COUP : des bandes posées une à une
    // et inclinées chacune se chevauchaient, et laissaient le bas découvert.
    // Des lignes régulières, décalées d'une demi-ligne une fois sur deux,
    // couvrent toute la signature : on ne détoure pas l'une sans les autres.
    const lignes = Array.from({ length: 16 }, (_, i) =>
      `<div style="padding-left:${(i % 2) * 140}px">${ligne} · ${ligne}</div>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:transparent}
      #cible{position:relative;width:600px;height:280px;overflow:hidden}
      #cible img{position:absolute;inset:0;width:600px;height:280px;object-fit:contain}
      .f{position:absolute;left:-260px;top:-230px;width:1200px;transform:rotate(-14deg);
         font:600 16px/34px Arial,Helvetica,sans-serif;color:rgba(120,130,150,.40);
         white-space:nowrap;letter-spacing:.3px}
    </style></head><body><div id="cible"><img src="${dataUri}"><div class="f">${lignes}</div></div></body></html>`;
    return await rendreImage(html);
  } catch (e) {
    console.error('[filigrane] impossible, envoi sans fac-similé :', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LA SIGNATURE NE SORT JAMAIS NUE
//
// (Charles, 1er octobre 2026 : « ma signature doit toujours être avec la
// protection fac-similé ».) Le fac-similé (services/filigrane.js) — la
// signature traversée par l'Institut, la pièce, le destinataire, la date et une
// référence — ne s'appliquait qu'aux COURRIELS : une pièce imprimée en PDF ou
// ouverte en aperçu portait la signature nue, copiable telle quelle. La
// protection s'écrit ici, une fois, et toute sortie passe par elle : courriel,
// PDF, aperçu. Faute de pouvoir dessiner le fac-similé, la signature est
// RETIRÉE (un trait reste) — jamais laissée nue.
// ─────────────────────────────────────────────────────────────────────────────
import { variableImage } from './courrielPiece.js';
import { signatureFiligranee, nouvelleReference } from '../services/filigrane.js';

const RE_PARAPHE = /--paraphe\s*:\s*url\([^)]*\)/g;
export const jourDuJour = () => new Date().toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Le document porte-t-il une signature à protéger ? */
export function aSignature(html) {
  const h = String(html || '');
  return /class="cloture(?![^"]*sans-paraphe)[^"]*"/.test(h) && /class="paraphe"/.test(h) && RE_PARAPHE.test(h);
}

/**
 * @returns {Promise<{ htmlSigne: string, filigrane: Buffer|null, reference: string|null }>}
 */
export async function protegerSignature(html, { sujet, piece, destinataire = null, jour = null, reference = null } = {}) {
  RE_PARAPHE.lastIndex = 0;
  if (!aSignature(html)) return { htmlSigne: html, filigrane: null, reference: null };
  RE_PARAPHE.lastIndex = 0;
  const ref = reference || nouvelleReference();
  const nue = variableImage(html, 'paraphe');
  const filigrane = nue ? await signatureFiligranee(nue, {
    piece: piece || sujet || 'Document', destinataire, date: jour || jourDuJour(), reference: ref }) : null;
  const htmlSigne = String(html).replace(RE_PARAPHE, filigrane
    ? `--paraphe:url("data:image/png;base64,${filigrane.toString('base64')}")` : '--paraphe:none');
  return { htmlSigne, filigrane, reference: ref };
}

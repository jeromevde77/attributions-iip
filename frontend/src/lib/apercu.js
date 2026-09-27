/**
 * L'APERÇU EST LE PASSAGE OBLIGÉ DE TOUTE PIÈCE (Charles, 27 septembre 2026 :
 * « J'adore ce mode aperçu ! Ça tu peux généraliser »).
 *
 * Vingt écrans ouvraient chacun leur propre fenêtre et lançaient l'impression
 * à l'aveugle : pas de relecture, pas d'envoi par courriel, et un navigateur
 * qui bloque une fenêtre sur deux. Désormais, une pièce s'ouvre dans l'aperçu
 * commun (`PreviewModal`), monté une fois pour toute l'application : on la
 * lit, on l'imprime ou on l'envoie — l'avion.
 *
 *   ouvrirApercu({ html, titre, sousTitre, nomFichier, destinataire, typeDoc,
 *                  sujetMail, envoiPossible, astuceImpression })
 */
export const EVT_APERCU = 'lucie:apercu';
export function ouvrirApercu(opts) {
  if (!opts?.html) return;
  window.dispatchEvent(new CustomEvent(EVT_APERCU, { detail: opts }));
}

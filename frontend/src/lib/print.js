// print.js — Impression fiable multi-navigateurs (notamment Safari).
//
// Safari imprime des pages blanches quand on appelle window.print() sur une
// fenêtre ouverte via window.open()+document.write() OU via une Blob URL.
// La méthode fiable est d'injecter le HTML dans un <iframe> caché de la page
// courante, puis d'imprimer cet iframe. C'est la technique des libs PDF.

/**
 * Imprime un document HTML complet via un iframe caché.
 * @param {string} html - Document HTML complet (avec <html>, <head>, <body>).
 * @param {object} [opts]
 * @param {number} [opts.delay=500] - Délai (ms) avant print, pour laisser le rendu/les images se charger.
 */
export function printHtml(html, opts = {}) {
  const delay = opts.delay ?? 500;

  // Nettoyer un éventuel iframe précédent
  const old = document.getElementById('__print_iframe');
  if (old) old.remove();

  const iframe = document.createElement('iframe');
  iframe.id = '__print_iframe';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  const lancer = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('[print] échec impression iframe :', e);
    }
    // Retirer l'iframe une fois la boîte d'impression vraisemblablement fermée
    setTimeout(() => { try { iframe.remove(); } catch {} }, 60000);
  };

  // Attendre le chargement des images de l'iframe si possible, sinon délai fixe
  const imgs = doc.images ? Array.from(doc.images) : [];
  const pending = imgs.filter(img => !img.complete);
  if (pending.length === 0) {
    setTimeout(lancer, delay);
  } else {
    let restant = pending.length;
    let done = false;
    const fini = () => { if (--restant <= 0 && !done) { done = true; setTimeout(lancer, 150); } };
    pending.forEach(img => { img.addEventListener('load', fini); img.addEventListener('error', fini); });
    // Garde-fou : imprimer quand même après 3 s même si une image bloque
    setTimeout(() => { if (!done) { done = true; lancer(); } }, 3000);
  }
}

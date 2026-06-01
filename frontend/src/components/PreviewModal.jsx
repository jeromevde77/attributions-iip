import { useRef, useState } from 'react';

/**
 * Modale d'aperçu d'un document HTML avant impression / sauvegarde PDF.
 * Le HTML est chargé dans un <iframe> visible (aperçu), et l'impression
 * se fait sur ce même iframe — fiable sur Safari (contrairement à window.open).
 *
 * @param {string} html - Document HTML complet à prévisualiser.
 * @param {string} [titre] - Titre affiché dans l'en-tête de la modale.
 * @param {function} onClose - Callback de fermeture.
 */
export default function PreviewModal({ html, titre = 'Aperçu du document', onClose }) {
  const iframeRef = useRef(null);
  const [pret, setPret] = useState(false);

  function imprimer() {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('[preview] impression échouée :', e);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center p-3 sm:p-6"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
           style={{ height: '92vh' }}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50">
          <h3 className="font-semibold text-gray-700 text-sm">{titre}</h3>
          <div className="flex items-center gap-2">
            <button onClick={imprimer} disabled={!pret}
              className="px-4 py-1.5 bg-iip-mauve text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40">
              🖨 Imprimer / Enregistrer en PDF
            </button>
            <button onClick={onClose}
              className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-sm">
              ✕ Fermer
            </button>
          </div>
        </div>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={() => setPret(true)}
          title="Aperçu"
          className="flex-1 w-full border-0 bg-gray-100"
        />
      </div>
    </div>
  );
}

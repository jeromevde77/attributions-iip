import { useRef, useState } from 'react';

/**
 * Modale d'aperçu d'un document HTML avant impression / sauvegarde PDF.
 * @param {string} html    - Document HTML complet.
 * @param {string} [titre] - Titre affiché dans l'en-tête de la modale.
 * @param {string} [nomFichier] - Nom suggéré pour l'enregistrement (sans extension).
 * @param {function} onClose
 */
export default function PreviewModal({ html, titre = 'Aperçu du document', nomFichier, onClose }) {
  const iframeRef = useRef(null);
  const [pret, setPret] = useState(false);

  function imprimer() {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    // Injecter le titre dans le document pour que le PDF soit bien nommé
    if (nomFichier) {
      try {
        iframe.contentDocument.title = nomFichier;
      } catch(e) {}
    }
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
          <div>
            <h3 className="font-semibold text-gray-700 text-sm">{titre}</h3>
            {nomFichier && <div className="text-xs text-gray-400 font-mono">{nomFichier}</div>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-amber-600 hidden sm:inline" title="Safari ne force pas toujours l'orientation : choisissez Paysage dans la fenêtre d'impression">
              ⊞ Pensez à choisir « Paysage »
            </span>
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
          title={nomFichier || 'Aperçu'}
          className="flex-1 w-full border-0 bg-gray-100"
        />
      </div>
    </div>
  );
}

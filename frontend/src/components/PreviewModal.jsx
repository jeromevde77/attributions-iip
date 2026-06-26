import { useRef, useState } from 'react';
import { IconPrinter, IconX, IconDownload } from '@tabler/icons-react';

/**
 * Modale d'aperçu d'un document HTML avant impression / sauvegarde PDF.
 * @param {string} html        - Document HTML complet.
 * @param {string} [titre]     - Nom du prof ou titre principal (barre marine).
 * @param {string} [sousTitre] - Type de document (ex: "Fiche IIP · 2026-2027").
 * @param {string} [nomFichier] - Nom suggéré pour l'enregistrement.
 * @param {function} onClose
 */
export default function PreviewModal({ html, titre = 'Document', sousTitre, nomFichier, onClose }) {
  const iframeRef = useRef(null);
  const [pret, setPret] = useState(false);

  function imprimer() {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    if (nomFichier) {
      try { iframe.contentDocument.title = nomFichier; } catch(e) {}
    }
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('[preview] impression échouée :', e);
    }
  }

  // Extraire initiales depuis le titre (ex: "BAGAYOKO Daouda" → "DB")
  const initiales = titre.split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase();

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center p-2 sm:p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden"
           style={{ height: '95vh' }}>

        {/* ── Barre marine ── */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#1B2B4B] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {initiales}
            </div>
            <div className="min-w-0">
              <div className="text-white font-bold text-sm truncate">{titre}</div>
              {sousTitre && <div className="text-white/60 text-xs">{sousTitre}</div>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-amber-300 hidden sm:inline opacity-75">
              ⊞ Choisir « Paysage » à l'impression
            </span>
            <button onClick={imprimer} disabled={!pret}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-iip-turquoise text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40">
              <IconPrinter size={13} /> Imprimer / PDF
            </button>
            <button onClick={onClose}
              className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
              <IconX size={16} />
            </button>
          </div>
        </div>

        {/* ── iframe ── */}
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={() => setPret(true)}
          title={nomFichier || titre}
          className="flex-1 w-full border-0 bg-gray-100"
        />
      </div>
    </div>
  );
}

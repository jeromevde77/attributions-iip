import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import PreviewModal from './PreviewModal.jsx';
import { EVT_APERCU } from '../lib/apercu.js';

/** L'aperçu commun, monté une fois dans la mise en page protégée. */
export default function ApercuGlobal() {
  const [doc, setDoc] = useState(null);
  useEffect(() => {
    const f = e => setDoc(e.detail);
    window.addEventListener(EVT_APERCU, f);
    return () => window.removeEventListener(EVT_APERCU, f);
  }, []);
  if (!doc) return null;
  /* L'APERÇU PASSE DEVANT LES FENÊTRES (29 septembre 2026 : « il ouvre une
     fenêtre derrière »). Monté dans la mise en page, il précédait dans la page
     les fenêtres des écrans, toutes au même niveau : ouvert depuis Éditions,
     il s'affichait dessous. Projeté en fin de document, sur un niveau au-dessus
     des fenêtres. */
  return createPortal(
    <div style={{ position: 'relative', zIndex: 80 }}>
      <PreviewModal {...doc} titre={doc.titre || doc.nomFichier || 'Document'} onClose={() => setDoc(null)} />
    </div>, document.body);
}

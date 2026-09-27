import { useEffect, useState } from 'react';
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
  return <PreviewModal {...doc} titre={doc.titre || doc.nomFichier || 'Document'} onClose={() => setDoc(null)} />;
}

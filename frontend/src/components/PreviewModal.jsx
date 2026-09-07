import { useRef, useState } from 'react';
import { IconPrinter, IconX, IconDownload, IconMail } from '@tabler/icons-react';
import EnvoiMailModal from './EnvoiMailModal.jsx';
import { useEnvoiMail } from '../lib/envoiMail.js';

/**
 * Modale d'aperçu d'un document HTML avant impression / sauvegarde PDF.
 * @param {string} html        - Document HTML complet.
 * @param {string} [titre]     - Nom du prof ou titre principal (barre marine).
 * @param {string} [sousTitre] - Type de document (ex: "Fiche IIP · 2026-2027").
 * @param {string} [nomFichier] - Nom suggéré pour l'enregistrement.
 * @param {object} [destinataire] - { type: 'etudiant'|'professeur', id, nom, email } :
 *                                  s'il est connu, le document peut lui être envoyé par courriel.
 * @param {string} [typeDoc]   - Identifiant du document pour le journal des envois.
 * @param {string} [sujetMail] - Objet proposé pour le courriel.
 * @param {function} onClose
 */
export default function PreviewModal({ html, titre = 'Document', sousTitre, nomFichier, onClose, actionExtra,
                                       destinataire = null, typeDoc = null, sujetMail = null,
                                       astuceImpression = "⊞ Choisir « Paysage » à l'impression" }) {
  const iframeRef = useRef(null);
  const [pret, setPret] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const envoiMail = useEnvoiMail();

  function imprimer() {
    // Safari imprime le document PARENT lorsqu'on lui demande d'imprimer un
    // cadre alimenté par srcDoc : on obtenait une capture de l'écran, fenêtre
    // d'aperçu comprise. Une fenêtre dédiée porte le document seul, et
    // l'impression y est fidèle sur tous les navigateurs.
    const w = window.open('', '_blank');
    if (!w) {
      // Fenêtre bloquée : on retombe sur le cadre, imparfait mais fonctionnel
      // sur les navigateurs qui le gèrent.
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      try {
        if (nomFichier) iframe.contentDocument.title = nomFichier;
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (e) { console.error('[preview] impression échouée :', e); }
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();
    try { w.document.title = nomFichier || titre; } catch { /* sans conséquence */ }

    // Le document peut être prêt avant ou après la pose du gestionnaire selon
    // le navigateur : on couvre les deux, en n'imprimant qu'une fois.
    let lance = false;
    const lancer = () => {
      if (lance) return;
      lance = true;
      w.focus();
      w.print();
    };
    w.onload = lancer;
    setTimeout(lancer, 400);
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
            {astuceImpression && <span className="text-[10px] text-amber-300 hidden sm:inline opacity-75">
              {astuceImpression}
            </span>}
            <button onClick={imprimer} disabled={!pret}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-iip-turquoise text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40">
              <IconPrinter size={13} /> Imprimer / PDF
            </button>
            {destinataire && envoiMail?.actif && (
              <button onClick={() => setEnvoi(true)} disabled={!pret}
                title="Envoyer ce document par courriel, en PDF joint"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white border border-white/30 rounded-lg text-xs font-medium hover:bg-white/20 disabled:opacity-40">
                <IconMail size={13} /> Envoyer
              </button>
            )}
            {actionExtra}
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
      {envoi && destinataire && (
        <EnvoiMailModal
          pieces={[{ html, nom_fichier: nomFichier || titre, destinataire }]}
          typeDoc={typeDoc || 'apercu'}
          sujet={sujetMail || [sousTitre, titre].filter(Boolean).join(' — ') || 'Votre document'}
          onClose={() => setEnvoi(false)} />
      )}
    </div>
  );
}

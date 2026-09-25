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
                                       // Faux quand le document porte PLUSIEURS personnes : un
                                       // envoi force un document par personne, et c'est alors
                                       // l'écran appelant qui propose l'envoi, pièce par pièce.
                                       envoiPossible = true,
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

  return (
    /* LA FENÊTRE D'APERÇU REJOINT LES AUTRES.
       Elle gardait la forme d'avant : une barre marine pleine, un médaillon
       d'initiales, un bouton turquoise et une astuce en jaune. Toutes les
       autres fenêtres de Lucie sont désormais claires, tenues par un filet,
       leur titre en marine — c'est la règle du blanc réservé à ce qui se
       remplit, et elle vaut ici comme ailleurs. Un aperçu qui ne ressemble à
       aucune autre fenêtre donne l'impression d'avoir changé d'application au
       moment d'imprimer. */
    <div className="fixed inset-0 z-50 flex flex-col items-center p-2 sm:p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div aria-hidden="true"
        className="absolute inset-0 bg-[rgba(11,21,45,.32)] backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-fenetre shadow-dessus w-full max-w-5xl
                      flex flex-col overflow-hidden" style={{ height: '95vh' }}>

        {/* L'EN-TÊTE EST TON SUR TON, et un filet le sépare du document. */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-shrink-0
                        border-b border-slate-200" style={{ background: 'var(--barre-fond, #F8FAFC)' }}>
          <div className="min-w-0">
            <div className="titre-ecran mb-0 truncate">{titre}</div>
            <div className="text-[11px] text-slate-400 truncate">
              {[sousTitre, nomFichier].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {astuceImpression && <span className="text-[11px] text-slate-400 hidden lg:inline">
              {astuceImpression}
            </span>}
            <button onClick={imprimer} disabled={!pret}
              className="bouton-sortir controle px-3 flex items-center gap-1.5 disabled:opacity-40">
              <IconPrinter size={15} /> Imprimer / PDF
            </button>
            {envoiPossible && envoiMail?.actif && (
              <button onClick={() => setEnvoi(true)} disabled={!pret}
                title="Envoyer ce document par courriel — PDF joint ou dans le corps du message"
                className="bouton controle px-3 flex items-center gap-1.5 disabled:opacity-40">
                <IconMail size={15} /> Envoyer
              </button>
            )}
            {actionExtra}
            <button onClick={onClose} aria-label="Fermer"
              className="controle w-9 grid place-items-center rounded-champ
                         text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <IconX size={17} />
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
      {envoi && (
        <EnvoiMailModal
          pieces={[{ html, nom_fichier: nomFichier || titre,
                     destinataire: destinataire || { nom: titre || nomFichier || 'Document' } }]}
          typeDoc={typeDoc || 'apercu'}
          sujet={sujetMail || [sousTitre, titre].filter(Boolean).join(' — ') || 'Votre document'}
          onClose={() => setEnvoi(false)} />
      )}
    </div>
  );
}

/** LA FENÊTRE DES ESPACES (3.5.090, Charles : « pourquoi ce n'est pas le même style que Lucie, donc dans une fenêtre ? ») :
 *  celle de Lucie — centrée, ancrée en haut, bandeau bleu, coins arrondis, voile marine léger, pied fixe —, pour l'espace
 *  enseignant et l'espace étudiant, qui n'ont pas les composants de Lucie. Large d'office (3.5.091, Charles : « pourquoi si peu
 *  large ? » ; « 80 % de la largeur, et sur petit écran 100 % ») : un texte, un document, une DUE s'y lisent ; une petite fenêtre
 *  le demande (`large`). */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from '@tabler/icons-react';

export default function FenetreEspace({ titre, sous, onFermer, pied = null, large = null, children }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onFermer?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onFermer]);
  /* AU-DESSUS DE TOUT (3.5.177, Charles : « bug » — la fenêtre « Urgence », ouverte depuis le rail collant, passait SOUS la
     journée) : le rail `sticky` fait un contexte d'empilement ; la fenêtre se monte donc à la racine du document. */
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-4" style={{ paddingTop: 'max(6vh, 12px)' }}>
      <div className="absolute inset-0" style={{ background: 'rgba(22, 64, 106, .32)', backdropFilter: 'blur(3px)' }} onClick={onFermer} />
      <div role="dialog" aria-modal="true" aria-label={titre}
        className={`relative w-full bg-white flex flex-col overflow-hidden ${large ? '' : 'sm:w-[80vw]'}`}
        style={{ maxWidth: large || 'none', maxHeight: '88vh', borderRadius: 22, boxShadow: '0 24px 60px rgba(15, 30, 60, .28)' }}>
        <div className="flex items-start gap-3 px-6 py-4 text-white shrink-0" style={{ background: 'var(--c-principal-fonce, #16406A)' }}>
          <div className="flex-1 min-w-0"><div className="font-semibold leading-snug">{titre}</div>{sous && <div className="text-second opacity-80">{sous}</div>}</div>
          <button type="button" aria-label="Fermer" className="min-h-9 min-w-9 grid place-items-center rounded-full hover:bg-white/10" onClick={onFermer}><IconX size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-5">{children}</div>
        {pied && <div className="shrink-0 border-t border-slate-200 px-6 py-3 flex flex-wrap items-center gap-3">{pied}</div>}
      </div>
    </div>, document.body);
}

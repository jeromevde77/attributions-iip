import { Fenetre } from './ui.jsx';
import ChargementLucie from './ChargementLucie.jsx';

/**
 * VOS DOCUMENTS SONT EN CHARGEMENT (3.5.387, Charles : « le temps de création est parfois long ; il faut un message… et un logo de
 * chargement »). Une seule attente pour toute composition de pièces : le logo de Lucie et ses étoiles, et la phrase de Charles.
 * `fenetre` : par-dessus l'écran, sans croix (on ne la ferme pas, on attend) ; sinon, à la place du contenu (un aperçu qui se compose).
 */
export const MESSAGE_ATTENTE = 'Vos documents sont en chargement. Ceci peut prendre quelques secondes ou plusieurs minutes selon les demandes. Ne quittez pas cette fenêtre.';

export function MessageAttente({ texte = MESSAGE_ATTENTE }) {
  return (
    <div className="grid place-items-center">
      <ChargementLucie texte="" />
      <p className="text-sm text-center max-w-md -mt-6 px-4" style={{ color: 'var(--c-texte, #16406A)' }}>{texte}</p>
    </div>);
}

export default function AttenteDocuments({ actif = true, titre = 'Composition des documents', texte }) {
  if (!actif) return null;
  return (
    <Fenetre titre={titre} large="petite">
      <MessageAttente texte={texte} />
    </Fenetre>);
}

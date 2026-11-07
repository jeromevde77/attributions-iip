/** LA FENÊTRE DES ESPACES EST CELLE DE LUCIE (3.5.199, Charles, 7 novembre 2026 : « une seule fenêtre, celle de Lucie,
 *  partout »). L'ancienne fenêtre des espaces (bandeau marine, rayon 22 px, couleurs en dur) est retirée : on garde ce nom pour
 *  les écrans qui l'appellent, mais c'est `Fenetre` (ui.jsx) qui dessine — ses réglages (Formes et composants, Thèmes et
 *  couleurs) valent désormais pour les trois Lucie. `large` (une largeur CSS) demande une petite fenêtre. `outils` : les sorties
 *  au bandeau. */
import { Fenetre } from './ui.jsx';

export default function FenetreEspace({ titre, sous, onFermer, pied = null, large = null, outils = null, icone = null, children }) {
  return (
    <Fenetre icone={icone} titre={titre} sous={sous} onFermer={onFermer} pied={pied} outils={outils}
      large={large ? 'petite' : 'grande'}>
      {children}
    </Fenetre>);
}

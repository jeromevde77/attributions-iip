/**
 * LA CHARGE HELB D'UNE LIGNE — une seule règle, pour l'écran et pour le papier.
 *
 * Elle vivait dans la fiche globale imprimée, et la fiche du membre à l'écran
 * lisait un champ que le serveur n'envoyait pas : l'ETP affiché ignorait le
 * HELB, celui de la pièce imprimée le comptait. Deux chiffres pour une même
 * charge, c'est celui qu'on ne regarde pas qui est faux.
 *
 * Le HELB se compte en HEURES. Diviseur selon le statut HELB de la personne
 * (coordination 1400, MFP 750) ou, pour MA, PI et à défaut, selon la nature
 * de la ligne : théorie 480, travaux pratiques 750.
 */
export function calculHELB(statut, a) {
  const natLigne = a.helb_nature_ligne;
  const nature = natLigne === 'TP' ? 'TP'
               : natLigne === 'CT' ? 'COURS'
               : (a.helb_nature || (a.type_cours === 'PP' ? 'TP' : 'COURS'));
  let div;
  if (statut === 'COORD') div = 1400;
  else if (statut === 'MFP') div = 750;
  else div = nature === 'TP' ? 750 : 480; // MA, PI, ou défaut
  const h = a.heures || 0;
  const charge = div ? h / div : 0;
  return { nature, natureLbl: nature === 'TP' ? 'Trav. P. (TP)' : 'Théorie (TH)', div, h, charge };
}

export const estHELB = a => (a.contrat_mdp || 'IIP') === 'HELB';

/**
 * PAS DE DROIT, PAS DE BOUTON (3.1.20, Charles, 4 octobre 2026 : « si pas
 * accès, pas d'icône — fais attention à cela pour tout le monde »).
 *
 * Un bouton qui répond « Vous n'avez pas le droit » après le clic est une
 * fausse promesse. L'écran ne devine plus : il lit ce que la porte du serveur
 * répondrait, par trois questions et pas une de plus —
 *   peut('etudiants.creer')   un geste du catalogue (lib/gestes.js), réglages
 *                             de Configuration → Accès compris ; seul « oui »
 *                             ouvre (« demande » n'a pas d'écran qui la dépose) ;
 *   passe('admin', 'editeur') une route encore gardée par roleRequired — même
 *                             règle d'équivalence que le serveur ;
 *   ecrit('personnel')        le plafond du module (garderModule).
 *
 * Ce n'est pas une protection — la porte reste le serveur —, c'est une
 * politesse : on ne montre pas ce qui sera refusé.
 */
import { useState, useEffect } from 'react';
import { authHeaders, getUser, isAuthenticated } from './api.js';
import { droitEffectif, usePlafonds } from './modules.js';

let cache = null;
let enVol = null;
const abonnes = new Set();

export function chargerDroits() {
  if (cache || enVol || !isAuthenticated()) return enVol;
  enVol = fetch('/api/auth/droits', { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { if (d?.gestes) { cache = d; abonnes.forEach(f => f()); } return cache; })
    .catch(() => null)
    .finally(() => { enVol = null; });
  return enVol;
}

/** À la déconnexion et après un réglage des gestes : les droits du suivant ne sont pas ceux du précédent. */
export function oublierDroits() {
  cache = null;
  abonnes.forEach(f => f());
}

const NIVEAU_DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];

/** La règle de roleRequired (backend/src/middleware/auth.js), recopiée telle
 *  quelle. La coordination n'y passe jamais : le serveur lui répond
 *  « validation requise », et aucun de ces écrans ne dépose de demande. */
export function passeRole(roles, user = getUser()) {
  const role = user?.role;
  if (!role) return false;
  if (roles.includes(role)) return true;
  if (NIVEAU_DIRECTION.includes(role) && (roles.includes('admin') || roles.includes('editeur'))) return true;
  if (role === 'secretariat' && roles.includes('editeur')) return true;
  return false;
}

/** Le verdict d'un geste, hors React (gestionnaires d'événement, calculs). */
export function peutGeste(cle) {
  return cache?.gestes?.[cle] === 'oui';
}

/** Aménagements raisonnables : le geste, ou la case « écrire » cochée sur la fiche. */
export function peutAmenager() {
  return peutGeste('amenagements.instruire') || !!cache?.octrois?.amenagements;
}

export function ecritModule(module, user = getUser()) {
  const n = droitEffectif(user, module);
  return n === 'ecrit' || n === 'validation';
}

export function useDroits() {
  const [, redessiner] = useState(0);
  usePlafonds();
  useEffect(() => {
    const f = () => redessiner(n => n + 1);
    abonnes.add(f);
    chargerDroits();
    return () => { abonnes.delete(f); };
  }, []);
  const user = getUser();
  return {
    charge: !!cache,
    peut: peutGeste,
    passe: (...roles) => passeRole(roles, user),
    ecrit: m => ecritModule(m, user),
  };
}

import { useEffect, useState } from 'react';
import { authHeaders } from './api.js';

/**
 * L'envoi de documents par courriel est-il allumé ? (Configuration → Courriels)
 *
 * Demandé une fois par chargement de page et partagé : dix aperçus ne font
 * pas dix appels. `rafraichir()` après un changement dans Configuration.
 */
let cache = null;
let enCours = null;

export function chargerEtatEnvoi(force = false) {
  if (force) { cache = null; enCours = null; }
  if (cache) return Promise.resolve(cache);
  if (!enCours) {
    enCours = fetch('/api/envois/etat', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { actif: false }))
      .catch(() => ({ actif: false }))
      .then(e => { cache = { actif: false, smtp: false, pdf: false, ...e }; return cache; });
  }
  return enCours;
}

export function useEnvoiMail(force = false) {
  const [etat, setEtat] = useState(force ? null : cache);
  useEffect(() => {
    let ok = true;
    chargerEtatEnvoi(force).then(e => ok && setEtat(e));
    return () => { ok = false; };
  }, [force]);
  return etat;   // null tant qu'on ne sait pas ; { actif, smtp, pdf, pdf_raison } ensuite
}

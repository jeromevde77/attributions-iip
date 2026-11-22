/* (CS) « Écrire aux étudiants » ouvert à ce compte ? (3.5.650) Le secrétariat et la direction toujours ; les professeurs et les
   coordinations seulement si la fonction « Écrire aux étudiants — professeurs et coordinations » leur est ouverte (Mise en service).
   La porte reste le serveur (403) ; ceci ne fait que cacher le bouton. */
import { useEffect, useState } from 'react';
import { authHeaders } from './api.js';

export function useEcrireEtudiants(toujours = false) {
  const [ouvert, setOuvert] = useState(toujours);
  useEffect(() => {
    if (toujours) return;
    fetch('/api/fonctions/moi', { headers: authHeaders() }).then(r => (r.ok ? r.json() : {}))
      .then(f => setOuvert(!!f['messages.personnel'])).catch(() => setOuvert(false));
  }, [toujours]);
  return toujours || ouvert;
}

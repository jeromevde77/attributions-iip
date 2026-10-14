// LES TRANSFERTS FERMÉS (3.1.332) — Configuration → Transferts. Une porte fermée pour l'année ne
// s'affiche plus ; le serveur la refuse de toute façon. Voir backend/src/lib/transferts.js.
import { useEffect, useState } from 'react';
import { authHeaders } from './api.js';

export function useTransfertsFermes(annee) {
  const [fermees, setFermees] = useState({});
  useEffect(() => {
    if (!annee) return;
    let vivant = true;
    fetch(`/api/transferts/etat?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { fermees: {} }))
      .then(j => { if (vivant) setFermees(j.fermees || {}); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [annee]);
  return fermees;
}

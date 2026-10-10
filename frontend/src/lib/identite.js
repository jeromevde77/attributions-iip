import { useEffect, useState } from 'react';
import { authHeaders } from './api.js';

/**
 * L'IDENTITÉ DE L'ÉTABLISSEMENT À L'ÉCRAN (3.1.253, Charles, 10 octobre 2026 : « il
 * faut pouvoir importer un logo ; celui de l'atelier n'est pas le bon »). Le logo,
 * le logo blanc, la signature et le cachet viennent du serveur — ce qui a été
 * importé dans Configuration → Identité, ou à défaut les images d'origine. Quatre
 * écrans les embarquaient en dur, en texte : près d'un mégaoctet de code chargé
 * pour rien, et une image que personne ne pouvait changer.
 */
export const IDENTITE = { logo: '', logo_blanc: '', signature: '', cachet: '' };
let promesse = null;
const abonnes = new Set();
export function chargerIdentite(forcer = false) {
  if (promesse && !forcer) return promesse;
  promesse = fetch('/api/etablissement/images', { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : {}))
    .then(j => { Object.assign(IDENTITE, j || {}); abonnes.forEach(f => f()); return IDENTITE; })
    .catch(() => IDENTITE);
  return promesse;
}
/** Le composant se redessine quand les images arrivent. */
export function useIdentite() {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN(n => n + 1); abonnes.add(f); chargerIdentite(); return () => { abonnes.delete(f); }; }, []);
  return IDENTITE;
}

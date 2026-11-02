/**
 * VOIR L'ESPACE COMME LA PERSONNE (3.1.518 pour l'étudiant, 3.5.084 pour l'enseignant ; Charles : « dans la barre bleue,
 * le petit œil, si on a accès à son portail — la direction »). L'onglet s'ouvre AU CLIC (sinon l'iPad le bloque) ; le lien
 * d'une minute, à usage unique, y arrive ensuite. Lecture seule, tracé au nom de qui l'ouvre.
 */
import { authHeaders } from './api.js';
import { informer } from './dialogue.jsx';

export async function voirEspace(route) {
  const w = window.open('', '_blank');
  try {
    const r = await fetch(route, { method: 'POST', headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
    if (w) w.location = j.url; else window.location.href = j.url;
  } catch (e) { w?.close(); informer(`❌ ${e.message}`); }
}
export const voirEspaceEtudiant = id => voirEspace(`/api/portail-suivi/${id}/apercu`);
export const voirEspaceEnseignant = profId => voirEspace(`/api/espace-enseignant/${profId}/apercu`);

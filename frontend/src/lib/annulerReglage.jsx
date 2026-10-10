import { useEffect, useState } from 'react';
import { authHeaders } from './api.js';
import { chargerDesign } from './design.js';
import { chargerCouleurs } from './couleurs.js';
import { rechargerMiseEnPage } from './miseEnPage.js';

/**
 * REVENIR EN ARRIÈRE SUR UN RÉGLAGE (3.1.267, Charles, 10 octobre 2026 : « je viens de
 * changer la taille des boutons, je n'aime pas, je ne sais pas revenir en arrière ;
 * il faut régler cela, les profs font souvent des erreurs »). Les réglages
 * s'enregistrent sans bouton ; le serveur garde l'état que chaque geste remplace
 * (`reglage_historique`, routes /api/config/historique et /annuler). Un seul bouton,
 * le même partout : Formes et composants, Thèmes et couleurs, la boîte de
 * propriétés du catalogue, le mode mise en page.
 *   quoi : 'design' | 'couleurs' | 'mise_en_page'
 */
export const EVT_REGLAGES = 'lucie:reglages';

export const EVT_AVANT = 'lucie:reglages-avant';

export async function annulerReglage(quoi) {
  // Un enregistrement encore en attente (curseur lâché il y a moins d'une demi-seconde)
  // ne doit pas réécrire, après coup, ce qu'on vient d'annuler.
  window.dispatchEvent(new CustomEvent(EVT_AVANT, { detail: { quoi } }));
  const r = await fetch('/api/config/annuler', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ quoi }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: j.error || `Erreur ${r.status}` };
  if (quoi === 'design') await chargerDesign();
  else if (quoi === 'couleurs') await chargerCouleurs();
  else await rechargerMiseEnPage();
  // Les écrans de réglage ouverts relisent leurs valeurs.
  window.dispatchEvent(new CustomEvent(EVT_REGLAGES, { detail: { quoi } }));
  return { ok: true, reste: j.reste };
}

/** Relire quand une annulation a eu lieu (pour les écrans qui tiennent leurs valeurs). */
export function useRelireReglages(quoi, relire, suspendre) {
  useEffect(() => {
    const concerne = e => !quoi || e.detail?.quoi === quoi || (Array.isArray(quoi) && quoi.includes(e.detail?.quoi));
    const f = e => { if (concerne(e)) relire(); };
    const g = e => { if (concerne(e)) suspendre?.(); };
    window.addEventListener(EVT_REGLAGES, f); window.addEventListener(EVT_AVANT, g);
    return () => { window.removeEventListener(EVT_REGLAGES, f); window.removeEventListener(EVT_AVANT, g); };
  }, [quoi, relire, suspendre]);
}

/** Le bouton. `quoi` peut être une liste : il annule alors le plus récent des deux. */
export function BoutonAnnulerReglage({ quoi, className = 'bouton', libelle = 'Annuler le dernier changement' }) {
  const liste = Array.isArray(quoi) ? quoi : [quoi];
  const [message, setMessage] = useState('');
  const [enCours, setEnCours] = useState(false);
  async function annuler() {
    setEnCours(true); setMessage('');
    // Le plus récent d'abord, quand le bouton couvre formes ET couleurs.
    let cible = liste[0];
    if (liste.length > 1) {
      const h = await Promise.all(liste.map(q => fetch(`/api/config/historique?quoi=${q}`, { headers: authHeaders() }).then(r => r.json()).catch(() => ({}))));
      const i = h.reduce((m, x, k) => ((x.dernier?.le || '') > (h[m].dernier?.le || '') ? k : m), 0);
      cible = liste[i];
    }
    const res = await annulerReglage(cible);
    setEnCours(false);
    setMessage(res.ok ? `↶ Annulé${res.reste ? ` — encore ${res.reste} pas en arrière possible${res.reste > 1 ? 's' : ''}` : ''}` : res.error);
    setTimeout(() => setMessage(''), 6000);
  }
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <button type="button" className={className} disabled={enCours} onClick={annuler}
        title="Revient à l'état d'avant le dernier changement (un glissement de curseur compte pour un seul changement). Se répète pour reculer encore.">
        ↶ {libelle}
      </button>
      {message && <span className="text-second text-slate-500 truncate">{message}</span>}
    </span>
  );
}

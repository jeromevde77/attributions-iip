import { useState } from 'react';
import { IconHeart, IconHeartFilled, IconMessageCircle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * SOUHAITER UN ANNIVERSAIRE (3.1.272, Charles, 10 octobre 2026 : « liker la tuile — mieux
 * et moins chronophage »). Un clic sur le cœur, et, si l'on veut, un mot de 100
 * caractères. La personne fêtée retrouve tout dans une seule carte de son tableau de
 * bord : « Vous avez reçu … vœux pour votre anniversaire ! », avec la liste.
 */
export default function VoeuAnniversaire({ item, onChange }) {
  const [aime, setAime] = useState(!!item.aime);
  const [n, setN] = useState(item.voeux || 0);
  const [mot, setMot] = useState(null);           // null = champ fermé
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  if (item.soi) return <span className="text-xs text-slate-500">{n ? `${n} collègue${n > 1 ? 's' : ''} vous ont souhaité votre anniversaire` : ''}</span>;

  async function envoyer(message) {
    setEnCours(true); setErreur('');
    const r = await fetch(`/api/historique/anniversaire/${item.personne_id}/voeu`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ message }) });
    const j = await r.json().catch(() => ({}));
    setEnCours(false);
    if (!r.ok) { setErreur(j.error || 'Envoi impossible'); return; }
    setAime(true); setN(j.voeux); setMot(null); onChange?.();
  }
  async function retirer() {
    setEnCours(true);
    await fetch(`/api/historique/anniversaire/${item.personne_id}/voeu`, { method: 'DELETE', headers: authHeaders() });
    setEnCours(false); setAime(false); setN(x => Math.max(0, x - 1)); onChange?.();
  }

  return (
    <span className="inline-flex items-center gap-3 flex-wrap">
      <button type="button" disabled={enCours} onClick={() => (aime ? retirer() : envoyer(''))}
        title={aime ? 'Retirer mon vœu' : 'Souhaiter un joyeux anniversaire'}
        className="text-xs flex items-center gap-1" style={{ color: aime ? 'var(--c-refuse)' : undefined }}>
        {aime ? <IconHeartFilled size={14} /> : <IconHeart size={14} />} {aime ? 'Souhaité' : 'Souhaiter'}{n ? ` · ${n}` : ''}
      </button>
      {mot === null
        ? <button type="button" className="text-xs text-slate-500 flex items-center gap-1" onClick={() => setMot('')}><IconMessageCircle size={13} /> Un petit mot</button>
        : <span className="inline-flex items-center gap-1.5">
            <input autoFocus value={mot} maxLength={100} onChange={e => setMot(e.target.value)} data-reponses="non"
              onKeyDown={e => { if (e.key === 'Enter') envoyer(mot); if (e.key === 'Escape') setMot(null); }}
              placeholder="Joyeux anniversaire !" className="controle !h-7 text-xs w-60" />
            <span className="text-mention text-slate-400 tabular-nums">{mot.length}/100</span>
            <button type="button" className="bouton !h-7 text-xs" disabled={enCours || !mot.trim()} onClick={() => envoyer(mot)}>Envoyer</button>
          </span>}
      {erreur && <span className="text-xs" style={{ color: 'var(--c-refuse)' }}>{erreur}</span>}
    </span>
  );
}

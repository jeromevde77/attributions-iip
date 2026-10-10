import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { nomDepuisChaine } from '../lib/nom.js';
import { PastilleEtat } from './ui.jsx';

/**
 * LE FIL D'UNE IDÉE — la conversation entre celui qui l'a déposée et la
 * direction (Charles, 3 octobre 2026 : « quand je réponds, il faut que sur le
 * tableau de bord de la personne qui a écrit, ma réponse y soit et qu'elle
 * puisse répondre »).
 *
 * Le fil se charge à l'ouverture, et c'est le SERVEUR qui le marque vu en le
 * servant — pas ce composant. Un message ne se modifie ni ne s'efface :
 * l'autre l'a peut-être déjà lu.
 */

/** L'état d'une idée en pastille pleine, couleur des états de Lucie. */
export const ETAT_PASTILLE = {
  nouvelle: 'neutre',
  retenue: 'disponible',
  en_cours: 'disponible',
  faite: 'reussi',
  ecartee: 'corriger',
};
const LIBELLE_ETAT = {
  nouvelle: 'Nouvelle', retenue: 'Retenue', en_cours: 'En cours',
  faite: 'Faite', ecartee: 'Écartée',
};

export function PastilleIdee({ etat }) {
  return <PastilleEtat etat={ETAT_PASTILLE[etat] || 'neutre'}>{LIBELLE_ETAT[etat] || etat}</PastilleEtat>;
}

/** Le marqueur « nouveau » : une information d'état, donc une pastille pleine. */
export function PastilleNouveau() {
  return <PastilleEtat etat="surveiller">nouveau</PastilleEtat>;
}

const dateHeure = d => {
  if (!d) return '';
  const [j, h] = String(d).split(' ');
  return `${j.split('-').reverse().join('/')}${h ? ` à ${h.slice(0, 5)}` : ''}`;
};

export default function FilSuggestion({ id, onChange, invite }) {
  const [donnees, setDonnees] = useState(null);
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let vivant = true;
    fetch(`/api/suggestions/${id}/fil`, { headers: authHeaders() })
      .then(r => r.json().then(j => (r.ok ? j : Promise.reject(new Error(j.error || 'Erreur')))))
      .then(j => { if (vivant) { setDonnees(j); onChange?.(); } })
      .catch(e => vivant && setErreur(e.message));
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function envoyer() {
    const t = texte.trim();
    if (!t) return;
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/suggestions/${id}/messages`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ texte: t }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      setDonnees(d => ({ ...d, messages: j.messages }));
      setTexte('');
      onChange?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  if (!donnees) {
    return <div className="text-second text-slate-400 py-1">{erreur || 'Chargement…'}</div>;
  }

  return (
    <div className="mt-2 space-y-2">
      {donnees.messages.length === 0 && (
        <div className="text-second text-slate-400">Aucun échange encore.</div>
      )}
      {donnees.messages.map(m => (
        <div key={m.id}
          className={`border-l-2 pl-2 ${m.cote === 'direction'
            ? 'border-[color:var(--c-principal)]' : 'border-slate-300'}`}>
          <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-700">
              {m.auteur_nom ? nomDepuisChaine(m.auteur_nom) : '—'}
            </span>
            {m.cote === 'direction' && <span>· direction</span>}
            <span>· {dateHeure(m.cree_le)}</span>
            {m.nouveau && <PastilleNouveau />}
          </div>
          <div className="text-sm text-slate-800 whitespace-pre-wrap">{m.texte}</div>
        </div>
      ))}

      <div className="flex items-start gap-2 pt-1">
        <textarea rows={2} value={texte} onChange={e => setTexte(e.target.value)}
          placeholder={invite || 'Votre réponse'}
          className="flex-1 min-w-0 border border-slate-300 rounded-champ px-2 py-1.5 text-sm bg-white" />
        <button onClick={envoyer} disabled={!texte.trim() || enCours}
          className="bouton disabled:opacity-40">Envoyer</button>
      </div>
      <div className="text-xs text-slate-400">
        Un message envoyé ne se modifie ni ne s'efface : il est signé à votre nom.
        {erreur && <span className="text-rose-700 ml-2">{erreur}</span>}
      </div>
    </div>
  );
}

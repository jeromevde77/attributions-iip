import { useState } from 'react';
import { IconRotateClockwise } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre, Encadre } from './ui.jsx';

/**
 * LES DEUX BOUTONS S1 / S2 D'UNE UNITÉ (3.5.368, Charles, 12 novembre 2026 : « un bouton S1, un bouton S2, carrés à coins arrondis ;
 * grisé si la délibération n'est pas encore accessible ; blanc à bords verts si les examens sont passés et qu'on est à J-3 ou moins ;
 * vert si c'est délibéré ; dans le coin, la flèche qui tourne pour rouvrir ou annuler, dans une seule fenêtre »).
 * États servis par le serveur (`boutonsSessions`) : gris · attente (examens passés, délibération à plus de trois jours ou non datée :
 * blanc à bord gris) · pret (blanc à bord vert) · fait (vert). Un clic ouvre toujours la feuille de cette session ; un bouton gris
 * l'ouvre en lecture (le serveur refuse les décisions avant l'examen). La flèche : direction et secrétariat (geste deliberation.rouvrir).
 */
const jj = d => (d ? d.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '—');
const STYLE = {
  gris: { background: 'rgb(var(--gris-100, 241 245 249))', color: 'rgb(var(--gris-400, 148 163 184))', border: '1px solid rgb(var(--gris-200, 226 232 240))' },
  attente: { background: '#fff', color: 'var(--c-texte, #1B2B4B)', border: '1px solid rgb(var(--gris-300, 203 213 225))' },
  pret: { background: '#fff', color: 'var(--c-reussi)', border: '2px solid var(--c-reussi)' },
  fait: { background: 'var(--c-reussi)', color: '#fff', border: '2px solid var(--c-reussi)' },
};
const TITRE = {
  gris: 'Pas encore accessible : les examens n’ont pas eu lieu. Cliquer pour consulter la feuille.',
  attente: 'Examens passés : la délibération n’est pas encore à trois jours. Cliquer pour ouvrir la feuille.',
  pret: 'Examens passés, délibération dans trois jours ou moins : à délibérer.',
  fait: 'Délibérée : séance close. Cliquer pour consulter.',
};

export function BoutonsSessions({ u, onOuvrir, onGeste, peutGerer }) {
  return (
    <span className="flex items-center gap-2 flex-none">
      {[[1, u.bouton_s1], [2, u.bouton_s2]].map(([n, b]) => {
        const e = b?.etat || 'gris';
        const date = e === 'fait' ? b?.date : (b?.examen && e === 'gris' ? b.examen : b?.date);
        return (
          <span key={n} className="relative">
            <button type="button" onClick={() => onOuvrir(u, n)}
              title={n === 2 && b?.sans_objet ? 'Pas de seconde session : aucun ajourné.' : TITRE[e]}
              className="w-[52px] h-[44px] rounded-[10px] flex flex-col items-center justify-center leading-tight font-semibold text-sm"
              style={STYLE[e]}>
              S{n}<span className="text-mention font-normal">{n === 2 && b?.sans_objet ? '—' : jj(date)}</span>
            </button>
            {(e === 'fait' || b?.decides > 0) && peutGerer && (
              <button type="button" onClick={() => onGeste(u, n, e === 'fait')} aria-label={`Rouvrir ou annuler la session ${n}`}
                title="Rouvrir ou annuler la délibération de cette session"
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-slate-300 grid place-items-center text-slate-600 hover:text-iip-blue">
                <IconRotateClockwise size={12} />
              </button>)}
          </span>);
      })}
    </span>);
}

/** La fenêtre unique : rouvrir la séance (les décisions restent) ou annuler la délibération de CETTE session. Motif obligatoire. */
export function FenetreSessionClose({ u, session, annee, close = true, onFermer, onFait }) {
  // Une session ouverte qui porte des décisions (3.5.369) : seule l'annulation a un sens.
  const [choix, setChoix] = useState(close ? 'rouvrir' : 'annuler');
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const ok = motif.trim().length >= 5;
  const valider = async () => {
    setEnCours(true); setErreur(null);
    try {
      const r = choix === 'rouvrir'
        ? await fetch(`/api/acquis/deliberation/ue/${u.ue_num}/rouvrir`, { method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ annee, session, toutes: true, motif: motif.trim() }) })
        : await fetch(`/api/acquis/deliberation/ue/${u.ue_num}?annee=${encodeURIComponent(annee)}&session=${session}&motif=${encodeURIComponent(motif.trim())}`,
          { method: 'DELETE', headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || j.error || 'Refusé.');
      onFait();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const carte = (k, titre, texte) => (
    <label className={`flex gap-2.5 p-3 rounded-[10px] cursor-pointer text-sm ${choix === k ? 'ring-2 ring-iip-blue' : 'border border-slate-300'}`}>
      <input type="radio" name="geste-session" checked={choix === k} onChange={() => setChoix(k)} className="mt-1" />
      <span><span className="font-semibold">{titre}</span><br /><span className="text-second text-slate-600">{texte}</span></span>
    </label>);
  return (
    <Fenetre icone={IconRotateClockwise} titre={`UE ${u.ue_num} · ${session === 2 ? 'seconde' : 'première'} session`} sous={u.ue_nom || ''}
      large="petite" ton="alerte" onFermer={onFermer}
      pied={<div className="flex items-center gap-2 w-full">
        <span className="text-second text-slate-500 flex-1 min-w-0">{ok ? '' : 'Le motif est obligatoire (une phrase).'}</span>
        <button type="button" className="bouton" onClick={onFermer}>Fermer</button>
        <button type="button" className={`bouton ${choix === 'annuler' ? 'bouton-detruire' : 'bouton-fort'}`} disabled={!ok || enCours} onClick={valider}>
          {choix === 'rouvrir' ? 'Rouvrir' : 'Annuler la délibération'}</button>
      </div>}>
      <div className="space-y-2.5">
        {close ? carte('rouvrir', 'Rouvrir la délibération',
          'Les décisions restent ; la séance se rouvre pour corriger, puis se clôt à nouveau.')
          : <p className="text-second text-slate-600 m-0">La séance n’est pas close, mais des décisions y sont déjà posées.</p>}
        {carte('annuler', `Annuler la délibération de la ${session === 2 ? 'seconde' : 'première'} session`,
          session === 2
            ? 'Les décisions de seconde session tombent ; chaque étudiant retrouve sa décision de première session. La première reste close.'
            : 'Les décisions de première session tombent (résultat, faveurs, ajournements) et la séance se rouvre. Les notes restent. Impossible tant qu’une seconde session est décidée.')}
        <label className="block text-sm">
          <span className="text-slate-600">Motif (obligatoire, gardé au dossier)</span>
          <input className="controle w-full mt-1" value={motif} onChange={e => setMotif(e.target.value)} placeholder="ex. erreur de note au cours 251.2" />
        </label>
        {erreur && <Encadre etat="corriger" titre={erreur} />}
      </div>
    </Fenetre>);
}

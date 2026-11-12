import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IconClock } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre, Tableau, Th, Td, Tr, Encadre } from './ui.jsx';

/**
 * LA QUESTION DES 17 HEURES, AVANT L'IMPRESSION (3.5.357, Charles, 12 novembre 2026 : « pouvoir changer la case dans Lucie lors de
 * l'impression, avec une fenêtre qui liste les noms, le calcul de Lucie, le nombre de périodes total annuel et les cases »).
 * `demanderDixSept({ annee, ids })` ouvre la fenêtre et rend une Map id → 'oui' | 'non' pour les seules réponses posées à la main
 * (celles qui diffèrent du calcul, ou là où Lucie n'a pas de calcul) ; null si l'on annule. Le dernier choix est gardé pour la
 * session : une même liste ne redemande pas entre l'aperçu et la production.
 */
let dernier = null;   // { cle, choix }

function FenetreDixSept({ annee, ids, fin }) {
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [choix, setChoix] = useState({});
  useEffect(() => {
    fetch('/api/etudiants/attestation-inscription/heures', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee, ids }) })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Le calcul ne se lit pas.'); return j.lignes || []; })
      .then(l => { setLignes(l); setChoix(Object.fromEntries(l.map(x => [x.id, x.oui == null ? null : x.oui ? 'oui' : 'non']))); })
      .catch(e => setErreur(e.message));
  }, [annee, ids]);
  const virgule = v => String(v).replace('.', ',');
  const valider = () => {
    const m = new Map();
    for (const x of lignes || []) {
      const c = choix[x.id];
      const calc = x.oui == null ? null : x.oui ? 'oui' : 'non';
      if (c && c !== calc) m.set(x.id, c);
    }
    fin(m);
  };
  const tous = v => setChoix(Object.fromEntries((lignes || []).map(x => [x.id, v])));
  const remettre = () => setChoix(Object.fromEntries((lignes || []).map(x => [x.id, x.oui == null ? null : x.oui ? 'oui' : 'non'])));
  return (
    <Fenetre icone={IconClock} titre="17 heures de cours par semaine ?" sous={`Attestation d’inscription — ${annee}`} large="grande"
      onFermer={() => fin(null)}
      pied={<div className="flex items-center gap-2 w-full">
        <span className="text-second text-slate-500 min-w-0 flex-1">Lucie coche d’après son calcul ; changez une case si vous savez mieux.</span>
        <button type="button" className="bouton" onClick={() => fin(null)}>Annuler</button>
        <button type="button" className="bouton bouton-fort" disabled={!lignes} onClick={valider}>Continuer</button>
      </div>}>
      {erreur && <Encadre etat="corriger" titre={erreur} />}
      {!lignes && !erreur && <p className="text-second text-slate-500">Calcul…</p>}
      {lignes && <>
        <p className="text-second text-slate-500 mb-2">Le calcul : les heures de l’horaire de l’étudiant ; sans horaire, les périodes de cours
          du programme (50 min), hors stages et épreuve intégrée — divisées par les semaines de cours, congés retirés.</p>
        <div className="flex items-center gap-2 mb-2">
          <button type="button" className="bouton" onClick={() => tous('oui')}>Tous « Oui »</button>
          <button type="button" className="bouton" onClick={() => tous('non')}>Tous « Non »</button>
          <button type="button" className="bouton" onClick={remettre}>Revenir au calcul de Lucie</button>
        </div>
        <Tableau>
          <thead><tr><Th>Étudiant</Th><Th align="droite">Calcul de Lucie</Th><Th>Source</Th><Th align="droite">Périodes annuelles</Th>
            <Th align="droite">Semaines</Th><Th align="centre">Oui</Th><Th align="centre">Non</Th></tr></thead>
          <tbody>{lignes.map(x => (
            <Tr key={x.id}>
              <Td><b>{String(x.nom || '').toUpperCase()}</b> {x.prenom}{x.erreur && <div className="text-mention text-red-700">{x.erreur}</div>}</Td>
              <Td align="droite">{x.heures != null ? `${virgule(x.heures)} h / sem.` : '—'}</Td>
              <Td className="text-second text-slate-500">{x.source === 'horaire' ? `horaire (${virgule(x.heures_horaire)} h)` : x.source === 'pae' ? 'programme (PAE)' : 'aucune'}</Td>
              <Td align="droite">{x.periodes ?? '—'}</Td>
              <Td align="droite">{x.semaines ?? '—'}</Td>
              {['oui', 'non'].map(v => (
                <Td key={v} align="centre">
                  <input type="radio" name={`dixsept-${x.id}`} className="accent-iip-blue" checked={choix[x.id] === v}
                    onChange={() => setChoix(c => ({ ...c, [x.id]: v }))} />
                </Td>))}
            </Tr>))}</tbody>
        </Tableau>
      </>}
    </Fenetre>
  );
}

export function demanderDixSept({ annee, ids }) {
  const liste = [...new Set((ids || []).map(Number).filter(Boolean))].sort((a, b) => a - b);
  const cle = `${annee}|${liste.join(',')}`;
  if (dernier?.cle === cle) return Promise.resolve(dernier.choix);
  return new Promise(resolve => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    const fin = choix => {
      if (choix) dernier = { cle, choix };
      setTimeout(() => { racine.unmount(); hote.remove(); }, 0);
      resolve(choix);
    };
    racine.render(<FenetreDixSept annee={annee} ids={liste} fin={fin} />);
  });
}

/** L'adresse de la pièce, avec la réponse posée à la main s'il y en a une. */
export const avecDixSept = (url, choix, id) => (choix?.get(Number(id)) ? `${url}&dixsept=${choix.get(Number(id))}` : url);

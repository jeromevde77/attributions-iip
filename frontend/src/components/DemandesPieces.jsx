/* (CS) LES PIÈCES DEMANDÉES PAR LES ÉTUDIANTS (3.5.645) : depuis leur espace (Mes documents), au secrétariat. On produit la pièce
   (Éditions, fiche de l'étudiant), puis on dit la demande traitée — ou refusée, avec un mot. L'étudiant lit l'état dans son espace. */
import { useEffect, useState } from 'react';
import { IconFileDescription, IconCheck, IconX } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre, Encadre, Tableau, TableauEntete, Th, PastilleEtat } from './ui.jsx';
import { saisir } from '../lib/dialogue.jsx';

const ETAT = { recue: ['À traiter', 'surveiller'], traitee: ['Traitée', 'reussi'], refusee: ['Refusée', 'corriger'] };
const jour = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');

export default function DemandesPieces({ onFermer }) {
  const [l, setL] = useState(null);
  const [tout, setTout] = useState(false);
  const [msg, setMsg] = useState(null);
  const charger = () => fetch(`/api/demandes-pieces${tout ? '' : '?statut=a_traiter'}`, { headers: authHeaders() })
    .then(r => r.json()).then(x => setL(Array.isArray(x) ? x : [])).catch(() => setL([]));
  useEffect(() => { charger(); }, [tout]);   // eslint-disable-line react-hooks/exhaustive-deps
  const poser = async (d, statut) => {
    setMsg(null);
    const reponse = statut === 'refusee'
      ? await saisir({ message: 'Pourquoi la demande est-elle refusée ? (l’étudiant lit ce mot)', obligatoire: true })
      : statut === 'traitee'
        ? await saisir({ message: 'Un mot pour l’étudiant (facultatif)', valeur: 'Votre pièce est prête : elle vous a été envoyée à votre adresse de l’institut.' })
        : '';
    if (reponse === null) return;
    const r = await fetch(`/api/demandes-pieces/${d.id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ statut, reponse }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Non enregistré.'); return; }
    charger();
  };
  return (
    <Fenetre icone={IconFileDescription} titre="Pièces demandées par les étudiants" sous="Depuis leur espace. Préparez la pièce (Éditions ou fiche de l’étudiant), puis dites-la traitée : l’étudiant le lit dans son espace." large="grande" onFermer={onFermer}>
      <div className="space-y-3">
        <div className="segments" role="radiogroup" aria-label="Quelles demandes">
          {[[false, 'À traiter'], [true, 'Toutes']].map(([v, t]) => (
            <button key={t} type="button" role="radio" aria-checked={tout === v} onClick={() => setTout(v)}
              className={tout === v ? 'bg-iip-blue text-white font-semibold px-3 py-1.5 text-sm' : 'text-slate-600 px-3 py-1.5 text-sm'}>{t}</button>))}
        </div>
        {msg && <Encadre etat="corriger">{msg}</Encadre>}
        {l == null ? <div className="text-sm text-slate-400">Chargement…</div>
          : !l.length ? <p className="text-sm text-slate-500">{tout ? 'Aucune demande.' : 'Aucune demande n’attend.'}</p>
          : <Tableau>
            <TableauEntete><Th>Étudiant</Th><Th>Pièce demandée</Th><Th largeur="w-28">Le</Th><Th largeur="w-28">État</Th><Th largeur="w-56" /></TableauEntete>
            <tbody>{l.map(d => {
              const [et, etat] = ETAT[d.statut] || ETAT.recue;
              return (
                <tr key={d.id}>
                  <td className="cellule px-3"><a className="text-iip-blue hover:underline" href={`/etudiants?id=${d.etudiant_id}`}>{`${String(d.nom || '').toUpperCase()} ${d.prenom || ''}`}</a>
                    {d.id_ecampus ? <div className="text-second text-slate-500">{d.id_ecampus}</div> : null}</td>
                  <td className="cellule px-3"><div>{d.libelle}</div>{d.texte && <div className="text-second text-slate-600">« {d.texte} »</div>}
                    {d.reponse && <div className="text-second text-slate-500">Réponse : {d.reponse}{d.traite_par ? ` — ${d.traite_par}` : ''}</div>}</td>
                  <td className="cellule px-3">{jour(d.demande_le)}</td>
                  <td className="cellule px-3"><PastilleEtat etat={etat}>{et}</PastilleEtat></td>
                  <td className="cellule px-3 text-right whitespace-nowrap">
                    {d.statut === 'recue' ? <>
                      <button type="button" className="bouton bouton-fort mr-2" onClick={() => poser(d, 'traitee')}><IconCheck size={15} /> Traitée</button>
                      <button type="button" className="bouton" onClick={() => poser(d, 'refusee')}><IconX size={15} /> Refuser</button></>
                      : <button type="button" className="bouton" onClick={() => poser(d, 'recue')}>Rouvrir</button>}
                  </td>
                </tr>);
            })}</tbody>
          </Tableau>}
      </div>
    </Fenetre>);
}

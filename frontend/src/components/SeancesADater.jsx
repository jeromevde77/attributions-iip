import { useCallback, useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { Tableau, TableauEntete, Th, Td, Tr, Encadre } from './ui.jsx';

/**
 * LES SÉANCES CLOSES SANS DATE (3.5.386, Charles : « la date de signature, c'est la date de délibération ! »). L'attestation de
 * réussite signe à la date de la séance ; sans date, elle prend la fermeture de l'UE. On pose ici la vraie date, une fois.
 */
const jj = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
export default function SeancesADater() {
  const [l, setL] = useState(null);
  const [dates, setDates] = useState({});
  const [msg, setMsg] = useState(null);
  const charger = useCallback(() => fetch('/api/seances-a-dater', { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : [])).then(setL).catch(() => setL([])), []);
  useEffect(() => { charger(); }, [charger]);
  const poser = async s => {
    setMsg(null);
    const r = await fetch(`/api/seances-a-dater/${s.id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ date: dates[s.id] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Refusé.'); return; }
    charger();
  };
  if (!l) return <p className="text-sm text-slate-500">Chargement…</p>;
  return (
    <div className="space-y-3">
      <p className="text-second text-slate-500 m-0">Ces séances sont closes mais n’ont pas de date. L’attestation de réussite signe à la date de la délibération ;
        sans elle, Lucie prend la date de fermeture de l’UE (colonne « En attendant »). Posez la date réelle de la séance : rien d’autre ne change.</p>
      {msg && <Encadre etat="corriger" titre={msg} />}
      {!l.length ? <Encadre etat="reussi" titre="Toutes les séances closes ont une date." /> : (
        <Tableau>
          <TableauEntete><Th>Année</Th><Th>UE</Th><Th>Session</Th><Th>Org.</Th><Th>Décisions</Th><Th>En attendant</Th><Th>Date de la séance</Th><Th /></TableauEntete>
          <tbody>{l.map(s => (
            <Tr key={s.id}>
              <Td className="whitespace-nowrap">{s.annee}</Td>
              <Td>UE {s.ue_num} <span className="text-slate-500">{s.ue_nom || ''}</span></Td>
              <Td>S{s.session}</Td><Td>{s.org || 'toute l’unité'}</Td><Td className="tabular-nums">{s.decisions}</Td>
              <Td className="whitespace-nowrap text-slate-500">{jj(s.fin_ue)}</Td>
              <Td><input type="date" className="controle" value={dates[s.id] || ''} onChange={e => setDates(d => ({ ...d, [s.id]: e.target.value }))} /></Td>
              <Td><button type="button" className="bouton" disabled={!dates[s.id]} onClick={() => poser(s)}>Poser</button></Td>
            </Tr>))}</tbody>
        </Tableau>)}
    </div>);
}

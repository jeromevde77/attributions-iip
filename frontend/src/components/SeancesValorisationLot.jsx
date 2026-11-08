import { useEffect, useState } from 'react';
import { Fenetre, Tableau, TableauEntete, Th, Td, Tr, Encadre, PastilleEtat } from './ui.jsx';
import { authHeaders } from '../lib/api.js';

/* LES SÉANCES DE VALORISATION EN LOT (3.5.219, Charles, 8 novembre 2026 : « impossible, il faut un patch pour le faire d'un
   coup » — quinze unités de TIM bloquées par « la séance de valorisation n'a pas encore été ouverte »). Pour les unités cochées :
   la date de la séance reprise des décisions encodées (une seule date) ou tapée (plusieurs dates = plusieurs séances, Lucie ne
   choisit pas) ; la date de communication et la présidence, une fois pour toutes. Les présences ne sont pas touchées : la
   composition arrive présente, les absents se décochent dans la séance de l'unité (« PV et attestations »).
   Serveur : GET/POST /api/attestations/valorisation/seances/lot. */
const fr = d => (d ? String(d).split('-').reverse().join('/') : '');
const aujourdHui = () => new Date().toLocaleDateString('sv-SE');
const complete = s => !!(s?.date_seance && s?.communication_date && String(s?.president_nom || '').trim());

export default function SeancesValorisationLot({ annee, ues, onClose, onFait }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [coches, setCoches] = useState(new Set());
  const [dates, setDates] = useState({});
  const [comm, setComm] = useState(aujourdHui());
  const [pres, setPres] = useState({ nom: '', titre: '' });
  const [retour, setRetour] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    fetch(`/api/attestations/valorisation/seances/lot?annee=${encodeURIComponent(annee)}&ues=${ues.join(',')}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
      .then(j => {
        setD(j);
        setCoches(new Set(j.unites.filter(u => !u.seance?.cloturee && !complete(u.seance)).map(u => u.ue_num)));
        setDates(Object.fromEntries(j.unites.map(u => [u.ue_num, u.date_proposee || ''])));
        setPres({ nom: j.president_nom || '', titre: j.president_titre || '' });
      })
      .catch(e => setErreur(e.message));
  }, [annee, ues.join(',')]);   // eslint-disable-line react-hooks/exhaustive-deps

  const envoyer = async ecrire => {
    setEnvoi(true); setRetour(null);
    try {
      const r = await fetch('/api/attestations/valorisation/seances/lot', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ecrire, communication_date: comm, president_nom: pres.nom, president_titre: pres.titre,
          lignes: [...coches].map(n => ({ ue_num: n, date_seance: dates[n] || null })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setRetour({ ok: false, texte: j.error || 'Refusé.', refus: j.refus || [] });
      else if (j.simulation) setRetour({ ok: true, simulation: true, texte: `${j.plan.length} séance(s) seront posées : ${j.plan.map(p => `UE ${p.ue_num} le ${fr(p.date_seance)}`).join(', ')}.` });
      else { setRetour({ ok: true, texte: `✓ ${j.plan.length} séance(s) posées. Les pièces de ces unités peuvent sortir.` }); onFait?.(); }
    } catch (e) { setRetour({ ok: false, texte: e.message }); } finally { setEnvoi(false); }
  };

  const basculer = n => setCoches(c => { const x = new Set(c); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const pret = coches.size > 0 && comm && pres.nom.trim();

  return (
    <Fenetre titre="Poser les séances de valorisation en lot" sous={`${annee} · ${ues.length} unité(s)`} onFermer={onClose} large="grande"
      pied={<div className="flex flex-wrap items-center gap-3 justify-end w-full">
        <span className="text-second text-slate-500 min-w-0 flex-1">{!coches.size ? 'Cochez au moins une unité.' : `${coches.size} unité(s) cochée(s).`}</span>
        <button type="button" className="bouton" disabled={!pret || envoi} onClick={() => envoyer(false)}>Simuler</button>
        <button type="button" className="bouton bouton-fort" disabled={!pret || envoi || !retour?.simulation} onClick={() => envoyer(true)}>Poser les séances</button>
      </div>}>
      {erreur && <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>}
      {!erreur && !d && <div className="text-second text-slate-500 py-6">Chargement…</div>}
      {d && (
        <div className="space-y-4">
          <p className="text-second text-slate-500">La date de la séance est reprise des décisions encodées quand elles portent une seule date ; sinon, tapez-la. La communication et la présidence valent pour toutes les unités cochées. Les présences ne changent pas : la composition de chaque unité est notée présente, les absents se décochent dans « PV et attestations ».</p>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm"><span className="block text-slate-500">Communication des résultats</span>
              <input type="date" className="controle mt-1" value={comm} onChange={e => { setComm(e.target.value); setRetour(null); }} /></label>
            <label className="text-sm"><span className="block text-slate-500">Président de séance</span>
              <input className="controle mt-1 w-56" value={pres.nom} onChange={e => { setPres(p => ({ ...p, nom: e.target.value })); setRetour(null); }} /></label>
            <label className="text-sm"><span className="block text-slate-500">Qualité</span>
              <input className="controle mt-1 w-44" value={pres.titre} placeholder="le Directeur" onChange={e => { setPres(p => ({ ...p, titre: e.target.value })); setRetour(null); }} /></label>
          </div>
          <Tableau dense>
            <TableauEntete>
              <Th largeur="w-8" /><Th>Unité</Th><Th>Décisions encodées</Th><Th>Date de la séance</Th><Th>Séance actuelle</Th>
            </TableauEntete>
            <tbody>
              {d.unites.map(u => (
                <Tr key={u.ue_num}>
                  <Td><input type="checkbox" disabled={!!u.seance?.cloturee} checked={coches.has(u.ue_num)} onChange={() => { basculer(u.ue_num); setRetour(null); }} aria-label={`UE ${u.ue_num}`} /></Td>
                  <Td><b>UE {u.ue_num}</b> <span className="text-slate-500">{u.ue_nom}</span></Td>
                  <Td ton="secondaire">{u.dates.length ? u.dates.map(x => `${fr(x.d)} (${x.n})`).join(' · ') : 'aucune date'}</Td>
                  <Td><input type="date" className="controle" value={dates[u.ue_num] || ''} onChange={e => { setDates(x => ({ ...x, [u.ue_num]: e.target.value })); setRetour(null); }} /></Td>
                  <Td>{u.seance?.cloturee ? <PastilleEtat etat="neutre">clôturée</PastilleEtat>
                    : complete(u.seance) ? <PastilleEtat etat="reussi">complète</PastilleEtat>
                    : u.seance ? <PastilleEtat etat="surveiller">incomplète</PastilleEtat>
                    : <PastilleEtat etat="surveiller">pas ouverte</PastilleEtat>}</Td>
                </Tr>))}
            </tbody>
          </Tableau>
          {retour && (
            <Encadre etat={retour.ok ? (retour.simulation ? 'disponible' : 'reussi') : 'corriger'} titre={retour.ok ? (retour.simulation ? 'Simulation' : 'Fait') : 'Refusé'}>
              <p>{retour.texte}</p>
              {retour.refus?.length > 0 && <ul className="list-disc pl-5 mt-1">{retour.refus.map(x => <li key={x}>{x}</li>)}</ul>}
            </Encadre>)}
        </div>)}
    </Fenetre>);
}

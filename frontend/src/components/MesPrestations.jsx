import { useCallback, useEffect, useState } from 'react';
import { IconClockHour4, IconSend } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Encadre, PastilleEtat, Tableau, TableauEntete, Th, Td, Tr, TrTotal } from './ui.jsx';

/* MES PRESTATIONS (3.5.241, espace enseignant, experts seulement). Le mois se déclare ici, au plus tard le 5e jour ouvrable avant
   la fin du mois (circulaire de rentrée IIP) : Lucie propose, cours par cours, les dates et les périodes lues de l'horaire ;
   l'expert corrige ce qui n'a pas eu lieu (0 si rien ce mois-ci) et déclare. Le secrétariat valide — l'A27 du mois en sort
   remplie — ou renvoie avec un mot. Un mois validé ne se modifie plus. Serveur : /api/prestations-experts/moi. */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const ETAT = { declaree: ['disponible', 'Déclarée — en attente du secrétariat'], validee: ['reussi', 'Validée'], renvoyee: ['surveiller', 'Renvoyée : à corriger'] };

export default function MesPrestations() {
  const [mois, setMois] = useState(null);
  const [d, setD] = useState(null);
  const [ues, setUes] = useState([]);
  const [remarque, setRemarque] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const charger = useCallback(() => {
    fetch(`/api/prestations-experts/moi${mois ? `?mois=${mois}` : ''}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
      .then(j => { setD(j); setUes(j.ues || []); setRemarque(j.declaration?.remarque || ''); if (!mois && j.mois) setMois(j.mois); })
      .catch(e => setErreur(e.message));
  }, [mois]);
  useEffect(() => { charger(); }, [charger]);
  if (erreur && !d) return <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>;
  if (!d) return <p className="text-second text-slate-500">Chargement…</p>;
  if (!d.relie) return <Encadre etat="surveiller" titre="Compte non relié">Votre compte n’est relié à aucune fiche d’enseignant : le secrétariat fait le lien.</Encadre>;
  if (!d.expert) return <Encadre etat="neutre" titre="Pas de prestation d’expert">Cette page sert aux experts : vous n’avez pas d’attribution d’expert cette année.</Encadre>;
  const dc = d.declaration;
  const fige = dc?.statut === 'validee';
  const maj = (i, k, champ, v) => setUes(l => l.map((u, a) => (a !== i ? u : { ...u, cours: u.cours.map((c, b) => (b !== k ? c : { ...c, [champ]: v })) })));
  const total = ues.flatMap(u => u.cours || []).reduce((t, c) => t + (Number(c.periodes) || 0), 0);
  const declarer = async () => {
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch('/api/prestations-experts/moi', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ mois: d.mois, ues, remarque }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Refusé.');
      charger();
    } catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  };
  return (
    <div className="space-y-4">
      <h1 className="titre-ecran">Mes prestations</h1>
      <p className="m-0 text-sm text-slate-600">Déclarez chaque mois vos prestations d’expert. Lucie propose les dates et les périodes de votre horaire ; corrigez ce qui n’a pas eu lieu (0 si rien ce mois-ci), puis déclarez — au plus tard le <b>5e jour ouvrable avant la fin du mois</b>. Le secrétariat les valide : vos prestations ne sont payées qu’une fois validées.</p>
      <div className="flex flex-wrap gap-1.5">
        {d.mois_liste.map(m => {
          const [et] = m.statut ? ETAT[m.statut] : ['neutre'];
          return <button key={m.mois} type="button" onClick={() => setMois(m.mois)}
            className={`bouton !h-8 ${m.mois === d.mois ? 'bouton-fort' : ''}`} title={m.statut ? ETAT[m.statut][1] : 'Pas encore déclaré'}>
            {m.libelle.split(' ')[0]}{m.statut && <span className="ml-1.5 inline-block w-2 h-2 rounded-full" style={{ background: `var(--c-${et === 'reussi' ? 'reussi' : et === 'surveiller' ? 'attente' : 'disponible'})` }} />}
          </button>;
        })}
      </div>
      <div className="carte p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <IconClockHour4 size={18} className="text-slate-400" />
          <b className="text-base">{d.libelle}</b>
          <span className="text-second text-slate-500">à déclarer au plus tard le {fr(d.delai)}</span>
          {dc && <PastilleEtat etat={ETAT[dc.statut][0]}>{ETAT[dc.statut][1]}</PastilleEtat>}
        </div>
        {dc?.statut === 'renvoyee' && dc.mot && <Encadre etat="surveiller" titre="Le secrétariat vous demande de corriger">{dc.mot}</Encadre>}
        {!ues.length ? <p className="m-0 text-second text-slate-500">Aucun cours d’expert pour cette année.</p> : (
          <Tableau dense>
            <TableauEntete><Th>Cours</Th><Th largeur="w-64">Dates prestées</Th><Th largeur="w-28" align="droite">Périodes</Th></TableauEntete>
            <tbody>
              <TrTotal><Td colSpan={2}><b>Total du mois</b></Td><Td align="droite"><b>{total}</b></Td></TrTotal>
              {ues.map((u, i) => [
                <Tr key={`u${i}`}><Td colSpan={3} className="font-semibold">{u.intitule}</Td></Tr>,
                ...(u.cours || []).map((c, k) => (
                  <Tr key={`c${i}-${k}`}>
                    <Td>{c.denomination}{c.depuis_horaire && !dc ? <span className="text-second text-slate-500"> · repris de l’horaire</span> : ''}</Td>
                    <Td><input className="controle !h-8 w-full" disabled={fige} placeholder="ex. 03, 10, 17/11" value={c.dates || ''} onChange={e => maj(i, k, 'dates', e.target.value)} /></Td>
                    <Td align="droite"><input type="number" min="0" className="controle !h-8 w-20 text-right" disabled={fige} value={c.periodes ?? ''} onChange={e => maj(i, k, 'periodes', e.target.value)} /></Td>
                  </Tr>)),
              ])}
            </tbody>
          </Tableau>)}
        <label className="block text-sm"><span className="text-slate-500">Remarque pour le secrétariat (facultatif)</span>
          <textarea className="controle mt-1 w-full !h-auto py-2" rows={2} disabled={fige} value={remarque} onChange={e => setRemarque(e.target.value)} /></label>
        {erreur && <Encadre etat="corriger" titre="Refusé">{erreur}</Encadre>}
        <div className="flex items-center justify-end gap-3">
          {dc && <span className="text-second text-slate-500">Déclarée le {fr(dc.declare_le)}{dc.decide_le ? ` · ${dc.statut === 'validee' ? 'validée' : 'renvoyée'} le ${fr(dc.decide_le)}` : ''}</span>}
          {!fige && <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={envoi || !ues.length} onClick={declarer}>
            <IconSend size={15} /> {dc ? 'Déclarer à nouveau' : `Déclarer mes prestations de ${d.libelle.split(' ')[0]}`}</button>}
        </div>
      </div>
    </div>);
}

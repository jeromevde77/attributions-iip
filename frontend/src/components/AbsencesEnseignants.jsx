import { useEffect, useState } from 'react';
import { IconUserOff, IconSend, IconTrash } from '@tabler/icons-react';
import { Fenetre, ListeEtats, LigneEtat, PastilleEtat, Encadre, Tableau, Th, Td, Tr } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';

/* L'ABSENCE D'UN ENSEIGNANT (3.5.210, Charles, 7 novembre 2026 ; tranché : le professeur signale, le secrétariat décide séance
   par séance, les étudiants sont prévenus ensuite). Deux écrans sur le même registre (`lib/absencesEnseignant.js`) :
   - `SignalerAbsence` : le professeur (Mes cours, et son espace par le relais) — ses dates, un motif, un mot ; ses absences et
     ce que le secrétariat en a décidé ;
   - `AbsencesEnseignants` (défaut) : Organisation → Absences des enseignants — une ligne par absence (ocre : à traiter), ses
     séances, une décision par séance (annulée, remplacée par…, déplacée au…, maintenue), puis « Prévenir les étudiants ». */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const appel = async (url, opts = {}) => {
  const r = await fetch(url, { headers: authHeaders(), ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Opération refusée.');
  return j;
};
const ETAT = { a_traiter: ['surveiller', 'à traiter'], en_cours: ['surveiller', 'en cours'], traitee: ['reussi', 'traitée'], retiree: ['neutre', 'retirée'] };
const TON = { annulee: 'corriger', remplacee: 'disponible', deplacee: 'disponible', maintenue: 'neutre' };

export function SignalerAbsence({ onFermer }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ du: aujourdhui(), au: aujourdhui(), motif: '', remarque: '' });
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const charger = () => appel('/api/mes-cours/absence').then(setD).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  const signaler = async () => {
    setEnvoi(true); setErreur(null);
    try {
      const x = await appel('/api/mes-cours/absence', { method: 'POST', body: JSON.stringify(f) });
      await informer(`Absence signalée. ${x.seances} séance(s) concernée(s) ; le secrétariat décide de chacune, puis prévient vos étudiants.`);
      setF({ du: aujourdhui(), au: aujourdhui(), motif: '', remarque: '' });
      charger();
    } catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  };
  const retirer = async a => {
    if (!(await demander(`Retirer le signalement du ${fr(a.du)} ?`))) return;
    try { await appel(`/api/mes-cours/absence/${a.id}`, { method: 'DELETE' }); charger(); } catch (e) { informer(e.message); }
  };
  const pret = f.du && f.au && f.au >= f.du && f.motif;
  return (
    <Fenetre titre="Signaler une absence" icone={IconUserOff} large="grande" onFermer={onFermer}
      pied={<div className="flex items-center gap-3 justify-end w-full">
        {erreur && <span className="text-second min-w-0" style={{ color: 'var(--c-refuse)' }}>{erreur}</span>}
        {!pret && !erreur && <span className="text-second text-slate-500 min-w-0">Les dates et le motif.</span>}
        <button type="button" className="bouton bouton-fort" disabled={!pret || envoi || d?.relie === false} onClick={signaler}>{envoi ? 'Envoi…' : 'Signaler'}</button>
      </div>}>
      <div className="space-y-4">
        <p className="text-second text-slate-500">Le secrétariat reçoit votre signalement et décide de chaque séance (annulée, remplacée, déplacée). Vos étudiants sont prévenus ensuite, par leur espace ou par courriel.</p>
        {d?.relie === false && <Encadre etat="surveiller" titre="Compte non relié">Votre compte n’est relié à aucune fiche du personnel : le secrétariat fait le lien.</Encadre>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-second text-slate-500">Du<input type="date" className="controle w-full" value={f.du} onChange={e => setF(x => ({ ...x, du: e.target.value, au: x.au < e.target.value ? e.target.value : x.au }))} /></label>
          <label className="text-second text-slate-500">Au<input type="date" className="controle w-full" value={f.au} onChange={e => setF(x => ({ ...x, au: e.target.value }))} /></label>
          <label className="text-second text-slate-500">Motif
            <select className="controle w-full" value={f.motif} onChange={e => setF(x => ({ ...x, motif: e.target.value }))}>
              <option value="">— choisir —</option>
              {Object.entries(d?.motifs || {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
        </div>
        <label className="block text-second text-slate-500">Un mot pour le secrétariat (facultatif)
          <textarea className="controle w-full" rows={2} data-reponses="absence-enseignant" value={f.remarque} onChange={e => setF(x => ({ ...x, remarque: e.target.value }))} /></label>
        {d?.absences?.length > 0 && <>
          <div className="intertitre">Mes absences signalées</div>
          <ListeEtats>
            {d.absences.map(a => (
              <LigneEtat key={a.id} etat={ETAT[a.etat]?.[0] || 'neutre'} attenue={a.etat === 'retiree'}
                titre={a.du === a.au ? `Le ${fr(a.du)}` : `Du ${fr(a.du)} au ${fr(a.au)}`} sous={`${a.motif_libelle}${a.remarque ? ` — ${a.remarque}` : ''}`}
                meta={<PastilleEtat etat={ETAT[a.etat]?.[0] || 'neutre'}>{ETAT[a.etat]?.[1]}</PastilleEtat>}
                droite={a.etat === 'a_traiter' ? <button type="button" className="bouton" title="Retirer le signalement" onClick={() => retirer(a)}><IconTrash size={16} /></button> : null}>
                {a.seances.length ? (
                  <ul className="text-sm space-y-1 py-1">
                    {a.seances.map(s => <li key={s.seance_id}>{fr(s.date)} {s.heure_debut || ''} — {s.cours_nom || s.cours_code} : <b>{s.decision_libelle || 'à décider'}</b>
                      {s.decision === 'remplacee' ? ` par ${s.remplacant}` : ''}{s.decision === 'deplacee' ? ` au ${fr(s.nouvelle_date)} ${s.nouvelle_heure_debut}` : ''}</li>)}
                  </ul>) : <div className="text-second text-slate-500 py-1">Aucune séance à l’horaire sur cette période.</div>}
              </LigneEtat>))}
          </ListeEtats>
        </>}
      </div>
    </Fenetre>);
}

function LigneSeance({ a, s, profs, decide, onFait }) {
  const [v, setV] = useState({ decision: s.decision || '', remplacant_id: s.remplacant_id || '', date: s.nouvelle_date || s.date, heure_debut: s.nouvelle_heure_debut || s.heure_debut || '', heure_fin: s.nouvelle_heure_fin || s.heure_fin || '', mot: s.mot || '' });
  const [envoi, setEnvoi] = useState(false);
  const poser = async () => {
    setEnvoi(true);
    try { await appel(`/api/absences-enseignants/${a.id}/seance/${s.seance_id}`, { method: 'PUT', body: JSON.stringify(v) }); onFait(); }
    catch (e) { informer(e.message); } finally { setEnvoi(false); }
  };
  const change = v.decision && (v.decision !== s.decision || String(v.remplacant_id || '') !== String(s.remplacant_id || '')
    || (v.decision === 'deplacee' && (v.date !== s.nouvelle_date || v.heure_debut !== s.nouvelle_heure_debut || v.heure_fin !== s.nouvelle_heure_fin)) || v.mot !== (s.mot || ''));
  return (
    <Tr>
      <Td className="whitespace-nowrap">{fr(s.date)}<div className="text-second text-slate-500">{s.heure_debut}–{s.heure_fin}</div></Td>
      <Td>{s.cours_nom || s.cours_code}<div className="text-second text-slate-500">{s.cours_code}{s.section ? ` · ${s.section}` : ''}</div></Td>
      <Td>
        {decide ? (
          <div className="flex flex-wrap items-center gap-2">
            <select className="controle" value={v.decision} onChange={e => setV(x => ({ ...x, decision: e.target.value }))}>
              <option value="">— à décider —</option>
              <option value="annulee">Annulée</option><option value="remplacee">Remplacée</option>
              <option value="deplacee">Déplacée</option><option value="maintenue">Maintenue</option>
            </select>
            {v.decision === 'remplacee' && (
              <select className="controle" value={v.remplacant_id} onChange={e => setV(x => ({ ...x, remplacant_id: e.target.value }))}>
                <option value="">— par qui —</option>
                {profs.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>)}
            {v.decision === 'deplacee' && <>
              <input type="date" className="controle" value={v.date} onChange={e => setV(x => ({ ...x, date: e.target.value }))} />
              <input type="time" className="controle" value={v.heure_debut} onChange={e => setV(x => ({ ...x, heure_debut: e.target.value }))} />
              <input type="time" className="controle" value={v.heure_fin} onChange={e => setV(x => ({ ...x, heure_fin: e.target.value }))} />
            </>}
            {v.decision && v.decision !== 'maintenue' && <input className="controle min-w-[10rem] flex-1" placeholder="Un mot aux étudiants (facultatif)" value={v.mot} onChange={e => setV(x => ({ ...x, mot: e.target.value }))} />}
            <button type="button" className="bouton" disabled={!change || envoi} onClick={poser}>{envoi ? '…' : 'Poser'}</button>
          </div>)
          : <span>{s.decision_libelle || 'à décider'}{s.remplacant ? ` par ${s.remplacant}` : ''}</span>}
      </Td>
      <Td className="whitespace-nowrap text-second text-slate-500">
        {s.decision ? <PastilleEtat etat={TON[s.decision]}>{s.decision_libelle}</PastilleEtat> : null}
        {s.prevenus_le ? <div>prévenus le {fr(s.prevenus_le)}</div> : s.decision && s.decision !== 'maintenue' ? <div>à annoncer</div> : null}
      </Td>
    </Tr>);
}

export default function AbsencesEnseignants() {
  const [d, setD] = useState(null);
  const [profs, setProfs] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [tout, setTout] = useState(false);
  const charger = () => appel(`/api/absences-enseignants${tout ? '?tout=1' : ''}`).then(x => {
    setD(x); if (x.decide && !profs.length) appel('/api/absences-enseignants/professeurs').then(setProfs).catch(() => {});
  }).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, [tout]);   // eslint-disable-line react-hooks/exhaustive-deps
  const prevenir = async a => {
    if (!(await demander(`Prévenir les étudiants des ${a.a_prevenir} séance(s) décidée(s) de ${a.professeur} ?`))) return;
    try {
      const x = await appel(`/api/absences-enseignants/${a.id}/prevenir`, { method: 'POST' });
      await informer(`Prévenus : ${x.espace} par leur espace, ${x.courriel} par courriel.${x.sans_adresse.length ? ` Sans adresse d’école : ${x.sans_adresse.join(', ')}.` : ''}`);
      charger();
    } catch (e) { informer(e.message); }
  };
  if (erreur) return <Encadre etat="corriger" titre="Absences des enseignants">{erreur}</Encadre>;
  if (!d) return <div className="text-second text-slate-500 p-4">Chargement…</div>;
  const aTraiter = d.absences.filter(a => a.etat === 'a_traiter' || a.etat === 'en_cours').length;
  return (
    <div className="space-y-4">
      <div className="flex flex-nowrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="titre-ecran !mb-0">Absences des enseignants</h1>
          <p className="text-second text-slate-500">Les absences signalées par les professeurs. {d.decide ? 'Décidez chaque séance, puis prévenez les étudiants.' : 'Le secrétariat décide ; vous lisez celles de vos sections.'}</p>
        </div>
        <label className="text-second text-slate-500 inline-flex items-center gap-2 whitespace-nowrap"><input type="checkbox" checked={tout} onChange={e => setTout(e.target.checked)} /> Tout l’historique</label>
      </div>
      {!d.absences.length && <Encadre etat="neutre" titre="Aucune absence">Aucune absence signalée{tout ? '' : ' ces deux derniers mois'}.</Encadre>}
      {aTraiter > 0 && <div className="text-second text-slate-500">{aTraiter} absence{aTraiter > 1 ? 's' : ''} à traiter.</div>}
      {d.absences.length > 0 && (
        <ListeEtats>
          {d.absences.map(a => (
            <LigneEtat key={a.id} etat={ETAT[a.etat]?.[0] || 'neutre'} icone={IconUserOff} attenue={a.etat === 'retiree'}
              ouverte={ouvert === a.id} onClick={() => setOuvert(o => (o === a.id ? null : a.id))}
              titre={a.professeur} sous={`${a.du === a.au ? `le ${fr(a.du)}` : `du ${fr(a.du)} au ${fr(a.au)}`} · ${a.motif_libelle}${a.remarque ? ` — ${a.remarque}` : ''}`}
              meta={<PastilleEtat etat={ETAT[a.etat]?.[0] || 'neutre'}>{ETAT[a.etat]?.[1]}</PastilleEtat>}
              droite={<span className="text-second text-slate-500 whitespace-nowrap">{a.seances.length} séance{a.seances.length > 1 ? 's' : ''} · signalée le {fr(a.signale_le)}</span>}>
              <div className="space-y-3 py-2">
                {a.seances.length ? (
                  <Tableau>
                    <thead><tr><Th>Date</Th><Th>Cours</Th><Th>Décision</Th><Th>État</Th></tr></thead>
                    <tbody>{a.seances.map(s => <LigneSeance key={s.seance_id} a={a} s={s} profs={profs} decide={d.decide && a.etat !== 'retiree'} onFait={charger} />)}</tbody>
                  </Tableau>) : <div className="text-second text-slate-500">Aucune séance à l’horaire sur cette période.</div>}
                {d.decide && a.a_prevenir > 0 && (
                  <div className="flex justify-end">
                    <button type="button" className="bouton bouton-sortir inline-flex items-center gap-1.5" onClick={() => prevenir(a)}><IconSend size={16} /> Prévenir les étudiants ({a.a_prevenir})</button>
                  </div>)}
              </div>
            </LigneEtat>))}
        </ListeEtats>)}
    </div>);
}

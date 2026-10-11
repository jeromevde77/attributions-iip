import { useEffect, useState } from 'react';
import { IconLifebuoy, IconChevronRight, IconPhone, IconPlus, IconTrash, IconDoorEnter, IconDoorExit } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';
import { demander, informer } from '../lib/dialogue.jsx';

/**
 * QUI EST LÀ ? (3.1.287, Charles, 11 octobre 2026, d'après l'idée de Jérôme à l'EPFC : « en cas
 * de souci, on clique et on sait de suite qui est là ou qui est de permanence ; si on clique,
 * ça appelle »). La tuile dit en une ligne qui est là maintenant et qui est de permanence ; la
 * fenêtre donne les numéros — un clic appelle (téléphone, ou l'application d'appel de
 * l'ordinateur). Présent = « J'arrive » du jour s'il existe, sinon l'horaire de la semaine.
 */
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const telLien = t => `tel:${String(t || '').replace(/[^\d+]/g, '')}`;

function Appeler({ p }) {
  if (!p.telephone) return <span className="text-mention text-slate-400">pas de numéro affiché</span>;
  return (
    <a href={telLien(p.telephone)} className="bouton bouton-fort inline-flex items-center gap-1.5 whitespace-nowrap" title={`Appeler ${p.nom}`}>
      <IconPhone size={15} /> {p.telephone}
    </a>);
}

export default function TuileQuiEstLa() {
  const [d, setD] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [face, setFace] = useState('maintenant');
  const charger = () => fetch('/api/equipe/maintenant', { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  useEffect(() => { charger(); const t = setInterval(charger, 60000); return () => clearInterval(t); }, []);
  if (!d) return null;

  const permEnCours = d.permanences.filter(p => p.en_cours);
  const resume = d.presents.length
    ? `${d.presents.length} personne${d.presents.length > 1 ? 's' : ''} là maintenant : ${d.presents.slice(0, 3).map(p => p.nom).join(', ')}${d.presents.length > 3 ? '…' : ''}`
    : 'Personne n’est signalé présent pour l’instant';
  const perm = permEnCours.length ? `Permanence : ${permEnCours.map(p => `${p.nom} jusqu’à ${p.fin}`).join(', ')}`
    : d.permanences.length ? `Permanence aujourd’hui : ${d.permanences.map(p => `${p.nom} ${p.debut}-${p.fin}`).join(', ')}` : '';

  return (<>
    <button type="button" onClick={() => { setFace('maintenant'); setOuvert(true); charger(); }} data-etat="disponible"
      className="bloc-etat w-full text-left px-4 py-3 flex items-center gap-3 hover:brightness-[.98]">
      <IconLifebuoy size={22} style={{ color: 'var(--c-disponible)' }} className="flex-none" />
      <span className="min-w-0 flex-1">
        <b className="text-sm">Qui est là ? — en cas de souci</b>
        <span className="block text-second text-slate-500 truncate">{resume}{perm ? ` · ${perm}` : ''}</span>
      </span>
      <IconChevronRight size={16} className="text-slate-400 flex-none" />
    </button>
    {ouvert && <FenetreQuiEstLa d={d} face={face} setFace={setFace} recharger={charger} onFermer={() => setOuvert(false)} />}
  </>);
}

function FenetreQuiEstLa({ d, face, setFace, recharger, onFermer }) {
  async function pointer(etat) {
    await fetch('/api/equipe/pointer', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ etat }) });
    recharger();
  }
  return (
    <Fenetre titre="Qui est là ?" sous={`${JOURS[d.jour - 1]} ${d.date.split('-').reverse().join('/')} · ${d.heure}`} large="grande" onFermer={onFermer}
      pied={<>
        <span className="text-second text-slate-500 min-w-0 flex-1">
          {d.moi.etat === 'la' ? `Vous êtes signalé présent depuis ${d.moi.depuis}.` : d.moi.etat === 'parti' ? `Vous êtes signalé parti depuis ${d.moi.depuis}.` : 'Signalez votre présence : elle corrige votre horaire pour aujourd’hui.'}
        </span>
        <button className="bouton" onClick={() => pointer('la')}><IconDoorEnter size={15} className="inline -mt-0.5 mr-1" />J’arrive</button>
        <button className="bouton" onClick={() => pointer('parti')}><IconDoorExit size={15} className="inline -mt-0.5 mr-1" />Je pars</button>
        <button className="bouton bouton-fort" onClick={onFermer}>Fermer</button>
      </>}>
      <div className="flex items-center gap-1 border-b border-slate-200 mb-3">
        {[['maintenant', 'Maintenant'], ['moi', 'Mon horaire et mon numéro'], ...(d.peut_gerer ? [['permanences', 'Permanences']] : [])].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFace(k)} className={`onglet-page ${face === k ? 'onglet-page-actif' : ''}`}>{l}</button>))}
      </div>
      {face === 'maintenant' && <Maintenant d={d} />}
      {face === 'moi' && <Moi d={d} recharger={recharger} />}
      {face === 'permanences' && <Permanences recharger={recharger} />}
    </Fenetre>);
}

function Maintenant({ d }) {
  return (
    <div className="space-y-4">
      <section>
        <div className="intertitre mb-1.5">De permanence aujourd’hui</div>
        {!d.permanences.length ? <p className="text-sm text-slate-500">Aucune permanence prévue aujourd’hui.</p>
          : <ul className="divide-y divide-slate-100">{d.permanences.map(p => (
              <li key={p.id} className="py-2 flex items-center gap-3">
                <span className="min-w-0 flex-1"><b className="text-sm">{p.nom}</b>
                  <span className="block text-second text-slate-500">{p.debut}–{p.fin}{p.en_cours ? ' · en ce moment' : ''}{p.note ? ` · ${p.note}` : ''}</span></span>
                <Appeler p={p} /></li>))}</ul>}
      </section>
      <section>
        <div className="intertitre mb-1.5">Là maintenant</div>
        {!d.presents.length ? <p className="text-sm text-slate-500">Personne n’est signalé présent pour l’instant.</p>
          : <ul className="divide-y divide-slate-100">{d.presents.map(p => (
              <li key={p.id} className="py-2 flex items-center gap-3">
                <span className="min-w-0 flex-1"><b className="text-sm">{p.nom}</b> <span className="text-second text-slate-500">{p.role}</span>
                  <span className="block text-second text-slate-500">
                    {p.source === 'pointage' ? `arrivé à ${p.depuis}` : `selon son horaire, ${p.depuis}–${p.jusqu}`}{p.lieu ? ` · ${p.lieu}` : ''}
                  </span></span>
                <Appeler p={p} /></li>))}</ul>}
      </section>
      {d.attendus.length > 0 && (
        <section>
          <div className="intertitre mb-1.5">Attendus plus tard</div>
          <p className="text-sm text-slate-600">{d.attendus.map(p => `${p.nom} (${p.a})`).join(' · ')}</p>
        </section>)}
    </div>);
}

function Moi({ d, recharger }) {
  const [plages, setPlages] = useState(null);
  const [tel, setTel] = useState(d.moi.telephone || '');
  useEffect(() => { fetch('/api/equipe/horaire', { headers: authHeaders() }).then(r => r.json()).then(setPlages).catch(() => setPlages([])); }, []);
  if (!plages) return <div className="text-sm text-slate-400">Chargement…</div>;
  const maj = (i, k, v) => setPlages(l => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  async function enregistrer() {
    await fetch('/api/equipe/telephone', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ telephone: tel }) });
    const r = await fetch('/api/equipe/horaire', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ plages }) });
    const j = await r.json().catch(() => ({}));
    await informer(r.ok ? `✓ Enregistré : ${j.plages} plage(s) d’horaire.` : `❌ ${j.error || 'Erreur'}`);
    recharger();
  }
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="intertitre block mb-1">Le numéro que j’accepte d’afficher</span>
        <input value={tel} onChange={e => setTel(e.target.value)} placeholder="Ex. : 02 560 29 60 ou GSM de service" className="controle w-72" data-reponses="non" />
        <span className="block text-second text-slate-500 mt-1">Il ne s’affiche que dans « Qui est là ? », quand vous êtes présent ou de permanence. Vide : aucun numéro.</span>
      </label>
      <div>
        <span className="intertitre block mb-1">Mon horaire de la semaine</span>
        <table className="text-sm">
          <tbody>{plages.map((p, i) => (
            <tr key={i}>
              <td className="pr-2 py-1"><select className="controle !h-8" value={p.jour} onChange={e => maj(i, 'jour', Number(e.target.value))}>{JOURS.map((j, k) => <option key={j} value={k + 1}>{j}</option>)}</select></td>
              <td className="pr-2"><input type="time" className="controle !h-8" value={p.debut} onChange={e => maj(i, 'debut', e.target.value)} /></td>
              <td className="pr-2"><input type="time" className="controle !h-8" value={p.fin} onChange={e => maj(i, 'fin', e.target.value)} /></td>
              <td className="pr-2"><input className="controle !h-8 w-40" value={p.lieu || ''} placeholder="Lieu (secrétariat…)" onChange={e => maj(i, 'lieu', e.target.value)} data-reponses="non" /></td>
              <td><button type="button" className="text-slate-400 hover:text-red-600" aria-label="Retirer" onClick={() => setPlages(l => l.filter((_, j) => j !== i))}><IconTrash size={15} /></button></td>
            </tr>))}</tbody>
        </table>
        <button type="button" className="bouton mt-2" onClick={() => setPlages(l => [...l, { jour: 1, debut: '08:00', fin: '16:00', lieu: '' }])}><IconPlus size={14} className="inline -mt-0.5 mr-1" />Ajouter une plage</button>
      </div>
      <button className="bouton bouton-fort" onClick={enregistrer}>Enregistrer</button>
    </div>);
}

function Permanences({ recharger }) {
  const [l, setL] = useState(null);
  const [personnes, setPersonnes] = useState([]);
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), debut: '17:30', fin: '22:00', utilisateur_id: '', note: '', repeter: 1 });
  const lire = () => fetch('/api/equipe/permanences', { headers: authHeaders() }).then(r => r.json()).then(setL).catch(() => setL([]));
  useEffect(() => { lire(); fetch('/api/equipe/personnes', { headers: authHeaders() }).then(r => r.json()).then(setPersonnes).catch(() => {}); }, []);
  async function ajouter() {
    const r = await fetch('/api/equipe/permanences', { method: 'POST', headers: authHeaders(), body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { await informer(`❌ ${j.error || 'Erreur'}`); return; }
    lire(); recharger();
  }
  async function retirer(p) {
    if (!(await demander({ titre: 'Retirer cette permanence', message: `${p.nom}, le ${p.date.split('-').reverse().join('/')} de ${p.debut} à ${p.fin}.`, confirmer: 'Retirer' }))) return;
    await fetch(`/api/equipe/permanences/${p.id}`, { method: 'DELETE', headers: authHeaders() });
    lire(); recharger();
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-second">Date<input type="date" className="controle block" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
        <label className="text-second">De<input type="time" className="controle block" value={f.debut} onChange={e => setF({ ...f, debut: e.target.value })} /></label>
        <label className="text-second">À<input type="time" className="controle block" value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })} /></label>
        <label className="text-second">Personne
          <select className="controle block" value={f.utilisateur_id} onChange={e => setF({ ...f, utilisateur_id: e.target.value })}>
            <option value="">—</option>{personnes.map(p => <option key={p.id} value={p.id}>{p.nom} ({p.role})</option>)}</select></label>
        <label className="text-second">Note<input className="controle block w-40" value={f.note} placeholder="cours du soir…" onChange={e => setF({ ...f, note: e.target.value })} data-reponses="non" /></label>
        <label className="text-second">Semaines<input type="number" min={1} max={52} className="controle block w-20" value={f.repeter} onChange={e => setF({ ...f, repeter: Number(e.target.value) || 1 })} title="Répéter la même permanence, semaine après semaine" /></label>
        <button className="bouton bouton-fort" disabled={!f.utilisateur_id} onClick={ajouter}><IconPlus size={14} className="inline -mt-0.5 mr-1" />Ajouter</button>
      </div>
      {!l ? <div className="text-sm text-slate-400">Chargement…</div> : !l.length ? <p className="text-sm text-slate-500">Aucune permanence à venir.</p>
        : <ul className="divide-y divide-slate-100 text-sm">{l.map(p => (
            <li key={p.id} className="py-1.5 flex items-center gap-3">
              <span className="tabular-nums w-24">{p.date.split('-').reverse().join('/')}</span>
              <span className="tabular-nums w-28">{p.debut}–{p.fin}</span>
              <span className="flex-1">{p.nom}{p.note ? <span className="text-slate-500"> · {p.note}</span> : null}</span>
              <button type="button" className="text-slate-400 hover:text-red-600" aria-label="Retirer" onClick={() => retirer(p)}><IconTrash size={15} /></button>
            </li>))}</ul>}
    </div>);
}

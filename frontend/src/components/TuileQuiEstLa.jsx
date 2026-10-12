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
// « Pas ocre… fraise » (Charles) : ce qui empêche de joindre quelqu'un prend le rouge du réglage « à corriger ».
const FRAISE = 'var(--c-refuse)';
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
  const perm = permEnCours.length ? `Permanence : ${permEnCours.map(p => `${p.nom} jusqu’à ${p.fin}${p.secours.length ? ` (secours : ${p.secours.map(x => x.nom).join(', ')})` : ''}`).join(', ')}`
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
        {[['maintenant', 'Maintenant'], ['moi', 'Mon horaire et mon numéro'], ...(d.peut_gerer ? [['equipe', 'Horaires de l’équipe'], ['permanences', 'Permanences']] : [])].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFace(k)} className={`onglet-page ${face === k ? 'onglet-page-actif' : ''}`}>{l}</button>))}
      </div>
      {face === 'maintenant' && <Maintenant d={d} />}
      {face === 'moi' && <Moi d={d} recharger={recharger} />}
      {face === 'equipe' && <HorairesEquipe d={d} recharger={recharger} />}
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
                  <span className="block text-second text-slate-500">{p.debut}–{p.fin}{p.habituelle ? ' · permanence habituelle' : ''}{p.en_cours ? ' · en ce moment' : ''}{p.note ? ` · ${p.note}` : ''}</span>
                  {p.secours.map((x, k) => (
                    <span key={x.id} className="mt-1 flex items-center gap-2 text-second">
                      <span className="text-slate-500">Si pas de réponse — secours {k + 1} :</span> <b>{x.nom}</b>
                      {x.telephone ? <a href={telLien(x.telephone)} className="underline" title={`Appeler ${x.nom}`}><IconPhone size={13} className="inline -mt-0.5" /> {x.telephone}</a>
                        : <span style={{ color: FRAISE }}>pas de numéro affiché</span>}
                    </span>))}</span>
                <Appeler p={p} /></li>))}</ul>}
      </section>
      <section>
        <div className="intertitre mb-1.5">Là maintenant</div>
        {!d.presents.length ? <p className="text-sm text-slate-500">Personne n’est signalé présent pour l’instant.</p>
          : <ul className="divide-y divide-slate-100">{d.presents.map(p => (
              <li key={p.id} className="py-2 flex items-center gap-3">
                <span className="min-w-0 flex-1"><b className="text-sm">{p.nom}</b> <span className="text-second text-slate-500">{p.role}</span>
                  <span className="block text-second text-slate-500">
                    {p.source === 'pointage' ? `arrivé à ${p.depuis}` : `selon son horaire, ${p.depuis}–${p.jusqu}`}{p.lieu ? ` · ${p.lieu === LIEU_AGENDA ? 'disponible selon son agenda — joindre par téléphone' : p.lieu}` : ''}
                    {p.lieu === LIEU_AGENDA && !p.telephone && <span style={{ color: FRAISE }}> · aucun numéro affiché : injoignable</span>}
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

/* L'HORAIRE DE L'ÉQUIPE (12 octobre 2026, Charles : « où est-ce que je définis cet horaire pour mon
   équipe ? ») : la direction et le secrétariat règlent l'horaire de chacun. Le numéro, lui, reste
   à chacun — on n'affiche pas le téléphone d'un autre à sa place. */
function HorairesEquipe({ d, recharger }) {
  const [personnes, setPersonnes] = useState([]);
  const [qui, setQui] = useState('');
  const [fait, setFait] = useState(null);   // la personne qu'on vient d'enregistrer : on enchaîne sur la suivante
  useEffect(() => { fetch('/api/equipe/personnes', { headers: authHeaders() }).then(r => r.json()).then(setPersonnes).catch(() => {}); }, []);
  return (
    <div className="space-y-4">
      <label className="text-second block">Personne
        <select className="controle block" value={qui} onChange={e => setQui(e.target.value)}>
          <option value="">— choisir —</option>{personnes.map(p => <option key={p.id} value={p.id}>{p.nom} ({p.role})</option>)}</select></label>
      {fait && !qui && <p className="text-sm" style={{ color: 'var(--c-reussi)' }}>✓ Horaire de {fait} enregistré. Choisissez la personne suivante.</p>}
      {qui ? <Moi key={qui} d={d} recharger={recharger} utilisateur={Number(qui)} aTelephone={!!personnes.find(p => String(p.id) === String(qui))?.a_telephone}
        apresEnregistrement={() => { setFait(personnes.find(p => String(p.id) === String(qui))?.nom || 'cette personne'); setQui(''); }} />
        : !fait && <p className="text-sm text-slate-500">Choisissez une personne pour régler son horaire de la semaine.</p>}
    </div>);
}

/* Les lieux de la maison (Charles, 12 octobre 2026 : « pour le lieu, une liste déroulante »).
   Un lieu déjà enregistré hors de la liste reste affiché, pour ne rien perdre. */
const LIEU_AGENDA = 'Selon l’agenda — joindre par téléphone';   // en réunion dehors : pas de lieu fixe, le téléphone fait foi
const LIEUX = [LIEU_AGENDA, 'Secrétariat', 'Direction', 'Accueil', 'Coordination', 'Bureau', 'Salle des professeurs', 'Télétravail', 'Extérieur'];
const minutes = h => { const [a, b] = String(h || '').split(':').map(Number); return Number.isFinite(a) ? a * 60 + (b || 0) : null; };
const duree = p => { const a = minutes(p.debut), b = minutes(p.fin); return a != null && b != null && b > a ? b - a : 0; };
const enHeures = m => `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;

function Moi({ d, recharger, utilisateur = null, apresEnregistrement = null, aTelephone = false }) {
  const [plages, setPlages] = useState(null);
  const [tel, setTel] = useState(d.moi.telephone || '');
  useEffect(() => { fetch(`/api/equipe/horaire${utilisateur ? `?utilisateur=${utilisateur}` : ''}`, { headers: authHeaders() }).then(r => r.json()).then(setPlages).catch(() => setPlages([])); }, [utilisateur]);
  if (!plages) return <div className="text-sm text-slate-400">Chargement…</div>;
  const maj = (i, k, v) => setPlages(l => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  async function enregistrer() {
    if (!utilisateur) await fetch('/api/equipe/telephone', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ telephone: tel }) });
    const r = await fetch('/api/equipe/horaire', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ plages, ...(utilisateur ? { utilisateur } : {}) }) });
    const j = await r.json().catch(() => ({}));
    recharger();
    if (r.ok && apresEnregistrement) return apresEnregistrement();
    await informer(r.ok ? `✓ Enregistré : ${j.plages} plage(s) d’horaire.` : `❌ ${j.error || 'Erreur'}`);
  }
  const total = plages.reduce((s, p) => s + duree(p), 0);
  const sansNumero = plages.some(p => p.lieu === LIEU_AGENDA) && !(utilisateur ? aTelephone : tel.trim());
  return (
    <div className="space-y-4">
      {!utilisateur && <label className="block">
        <span className="intertitre block mb-1">Le numéro que j’accepte d’afficher</span>
        <input value={tel} onChange={e => setTel(e.target.value)} placeholder="Ex. : 02 560 29 60 ou GSM de service" className="controle w-72" data-reponses="non" />
        <span className="block text-second text-slate-500 mt-1">Il ne s’affiche que dans « Qui est là ? », quand vous êtes présent ou de permanence. Vide : aucun numéro.</span>
      </label>}
      <div>
        <span className="intertitre block mb-1">{utilisateur ? 'Son horaire de la semaine' : 'Mon horaire de la semaine'}</span>
        <table className="text-sm">
          <tbody>{plages.map((p, i) => (
            <tr key={i}>
              <td className="pr-2 py-1"><select className="controle !h-8" value={p.jour} onChange={e => maj(i, 'jour', Number(e.target.value))}>{JOURS.map((j, k) => <option key={j} value={k + 1}>{j}</option>)}</select></td>
              <td className="pr-2"><input type="time" className="controle !h-8" value={p.debut} onChange={e => maj(i, 'debut', e.target.value)} /></td>
              <td className="pr-2"><input type="time" className="controle !h-8" value={p.fin} onChange={e => maj(i, 'fin', e.target.value)} /></td>
              <td className="pr-2"><select className="controle !h-8 w-44" value={p.lieu || ''} onChange={e => maj(i, 'lieu', e.target.value)}>
                <option value="">— lieu —</option>
                {p.lieu && !LIEUX.includes(p.lieu) && <option value={p.lieu}>{p.lieu}</option>}
                {LIEUX.map(l => <option key={l} value={l}>{l}</option>)}</select></td>
              <td className="pr-3 text-slate-500 italic whitespace-nowrap tabular-nums">{duree(p) ? enHeures(duree(p)) : 'fin avant début'}</td>
              <td><button type="button" className="text-slate-400 hover:text-red-600" aria-label="Retirer" onClick={() => setPlages(l => l.filter((_, j) => j !== i))}><IconTrash size={15} /></button></td>
            </tr>))}</tbody>
        </table>
        {plages.length > 0 && <p className="text-sm text-slate-500 italic mt-1">Total de la semaine : {enHeures(total)}</p>}
        {sansNumero && <p className="text-sm mt-1" style={{ color: FRAISE }}>« Selon l’agenda » sans numéro affiché : personne ne pourra {utilisateur ? 'la' : 'vous'} joindre. {utilisateur ? 'Elle doit indiquer son numéro dans « Mon horaire et mon numéro ».' : 'Indiquez un numéro ci-dessus.'}</p>}
        <button type="button" className="bouton mt-2" onClick={() => setPlages(l => { const der = l[l.length - 1]; return [...l, der ? { ...der, jour: der.jour % 7 + 1 } : { jour: 1, debut: '08:00', fin: '16:00', lieu: '' }]; })}><IconPlus size={14} className="inline -mt-0.5 mr-1" />Ajouter une plage</button>
      </div>
      <button className="bouton bouton-fort" onClick={enregistrer}>{apresEnregistrement ? 'Enregistrer et passer à une autre personne' : 'Enregistrer'}</button>
    </div>);
}

/* LES PERMANENCES (12 octobre 2026, Charles) : HABITUELLES, sans date — des jours de la semaine,
   jusqu'à ce qu'on les retire (« je suis de permanence tous les jours de 9 h à 19 h 30 ») —, ou
   DATÉES, pour un remplacement ou une soirée ; une datée l'emporte ce jour-là. Chacune peut porter
   un secours 1 et un secours 2 : « au cas où je ne réponds pas ». */
const JOURS_COURTS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const nomsJours = js => (js.join(',') === '1,2,3,4,5' ? 'du lundi au vendredi' : js.join(',') === '1,2,3,4,5,6,7' ? 'tous les jours' : js.map(j => JOURS[j - 1].toLowerCase()).join(', '));
const secoursTexte = p => [p.secours1, p.secours2].filter(Boolean).map((n, k) => `secours ${k + 1} : ${n}`).join(' · ');

function ChoixPersonne({ libelle, valeur, personnes, onChange, vide = '—' }) {
  return (
    <label className="text-second flex flex-col gap-0.5">{libelle}
      <select className="controle block" value={valeur} onChange={e => onChange(e.target.value)}>
        <option value="">{vide}</option>{personnes.map(p => <option key={p.id} value={p.id}>{p.nom} ({p.role})</option>)}</select></label>);
}

function Permanences({ recharger }) {
  const [l, setL] = useState(null);
  const [h, setH] = useState(null);
  const [personnes, setPersonnes] = useState([]);
  const [mode, setMode] = useState('habituelle');
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), jours: [1, 2, 3, 4, 5], debut: '09:00', fin: '19:30', utilisateur_id: '', secours1_id: '', secours2_id: '', note: '', repeter: 1 });
  const lire = () => {
    fetch('/api/equipe/permanences', { headers: authHeaders() }).then(r => r.json()).then(setL).catch(() => setL([]));
    fetch('/api/equipe/permanences/habituelles', { headers: authHeaders() }).then(r => r.json()).then(setH).catch(() => setH([]));
  };
  useEffect(() => { lire(); fetch('/api/equipe/personnes', { headers: authHeaders() }).then(r => r.json()).then(setPersonnes).catch(() => {}); }, []);
  const basculerJour = j => setF(x => ({ ...x, jours: x.jours.includes(j) ? x.jours.filter(k => k !== j) : [...x.jours, j].sort() }));
  async function ajouter() {
    const url = mode === 'habituelle' ? '/api/equipe/permanences/habituelles' : '/api/equipe/permanences';
    const r = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { await informer(`❌ ${j.error || 'Erreur'}`); return; }
    setF(x => ({ ...x, utilisateur_id: '', secours1_id: '', secours2_id: '', note: '' }));
    lire(); recharger();
  }
  async function retirer(p, habituelle) {
    const quand = habituelle ? `${nomsJours(p.jours)}` : `le ${p.date.split('-').reverse().join('/')}`;
    if (!(await demander({ titre: 'Retirer cette permanence', message: `${p.nom}, ${quand}, de ${p.debut} à ${p.fin}.`, confirmer: 'Retirer' }))) return;
    await fetch(`/api/equipe/permanences/${habituelle ? 'habituelles/' : ''}${p.id}`, { method: 'DELETE', headers: authHeaders() });
    lire(); recharger();
  }
  const pret = f.utilisateur_id && (mode === 'datee' || f.jours.length);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="segments">
          {[['habituelle', 'Habituelle (sans date)'], ['datee', 'À une date']].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={mode === k} className={mode === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'} onClick={() => setMode(k)}>{t}</button>))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {mode === 'habituelle'
            ? <div className="text-second flex flex-col gap-0.5">Jours
                <div className="flex gap-1">{JOURS_COURTS.map((t, k) => (
                  <button key={t} type="button" aria-pressed={f.jours.includes(k + 1)} onClick={() => basculerJour(k + 1)}
                    className={`controle !px-2 ${f.jours.includes(k + 1) ? 'controle-fort' : ''}`}>{t}</button>))}</div></div>
            : <label className="text-second flex flex-col gap-0.5">Date<input type="date" className="controle block" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>}
          <label className="text-second flex flex-col gap-0.5">De<input type="time" className="controle block" value={f.debut} onChange={e => setF({ ...f, debut: e.target.value })} /></label>
          <label className="text-second flex flex-col gap-0.5">À<input type="time" className="controle block" value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })} /></label>
          {mode === 'datee' && <label className="text-second flex flex-col gap-0.5">Semaines<input type="number" min={1} max={52} className="controle block w-20" value={f.repeter} onChange={e => setF({ ...f, repeter: Number(e.target.value) || 1 })} title="Répéter la même permanence, semaine après semaine" /></label>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <ChoixPersonne libelle="De permanence" valeur={f.utilisateur_id} personnes={personnes} onChange={v => setF({ ...f, utilisateur_id: v })} />
          <ChoixPersonne libelle="Secours 1" valeur={f.secours1_id} personnes={personnes.filter(p => String(p.id) !== String(f.utilisateur_id))} onChange={v => setF({ ...f, secours1_id: v })} vide="— aucun —" />
          <ChoixPersonne libelle="Secours 2" valeur={f.secours2_id} personnes={personnes.filter(p => ![f.utilisateur_id, f.secours1_id].map(String).includes(String(p.id)))} onChange={v => setF({ ...f, secours2_id: v })} vide="— aucun —" />
          <label className="text-second flex flex-col gap-0.5">Note<input className="controle block w-40" value={f.note} placeholder="cours du soir…" onChange={e => setF({ ...f, note: e.target.value })} data-reponses="non" /></label>
          <button className="bouton bouton-fort" disabled={!pret} onClick={ajouter}><IconPlus size={14} className="inline -mt-0.5 mr-1" />Ajouter</button>
        </div>
      </div>

      <section>
        <div className="intertitre mb-1.5">Permanences habituelles</div>
        {!h ? <div className="text-sm text-slate-400">Chargement…</div> : !h.length ? <p className="text-sm text-slate-500">Aucune permanence habituelle.</p>
          : <ul className="divide-y divide-slate-100 text-sm">{h.map(p => (
              <li key={p.id} className="py-1.5 flex items-center gap-3">
                <span className="w-44">{nomsJours(p.jours)}</span>
                <span className="tabular-nums w-28">{p.debut}–{p.fin}</span>
                <span className="flex-1 min-w-0">{p.nom}{secoursTexte(p) ? <span className="text-slate-500"> · {secoursTexte(p)}</span> : null}{p.note ? <span className="text-slate-500"> · {p.note}</span> : null}</span>
                <button type="button" className="text-slate-400 hover:text-red-600" aria-label="Retirer" onClick={() => retirer(p, true)}><IconTrash size={15} /></button>
              </li>))}</ul>}
      </section>

      <section>
        <div className="intertitre mb-1.5">Permanences datées à venir</div>
        {!l ? <div className="text-sm text-slate-400">Chargement…</div> : !l.length ? <p className="text-sm text-slate-500">Aucune permanence datée à venir.</p>
          : <ul className="divide-y divide-slate-100 text-sm">{l.map(p => (
              <li key={p.id} className="py-1.5 flex items-center gap-3">
                <span className="tabular-nums w-24">{p.date.split('-').reverse().join('/')}</span>
                <span className="tabular-nums w-28">{p.debut}–{p.fin}</span>
                <span className="flex-1 min-w-0">{p.nom}{secoursTexte(p) ? <span className="text-slate-500"> · {secoursTexte(p)}</span> : null}{p.note ? <span className="text-slate-500"> · {p.note}</span> : null}</span>
                <button type="button" className="text-slate-400 hover:text-red-600" aria-label="Retirer" onClick={() => retirer(p, false)}><IconTrash size={15} /></button>
              </li>))}</ul>}
      </section>
    </div>);
}

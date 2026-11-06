/**
 * LES DATES D'UNE SEMAINE, POSÉES DEPUIS L'AGENDA (3.5.149, Charles : « continue l'agenda » — l'agenda de l'école, seule porte des
 * dates). Un clic sur une semaine des rangées « Unités » ou « Sessions » ouvre ici : les unités qui ouvrent ou ferment cette
 * semaine, les épreuves et les délibérations, chacune modifiable sur place ; et l'ajout d'une délibération ou d'une épreuve. On
 * écrit par les portes de toujours — `PUT /api/annuel/dates-ue` (une coordination dépose une demande), `PUT /api/calendrier`
 * (une séance close exige un motif) — : aucune règle n'est doublée.
 */
import { useEffect, useState } from 'react';
import { IconGavel, IconPencil, IconSchool, IconPlus } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { informer, saisir } from '../lib/dialogue.jsx';

const plus = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmt = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');

async function poserSessions(annee, corps) {
  let r = await fetch('/api/calendrier', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee, ...corps }) });
  let j = await r.json().catch(() => ({}));
  if (r.status === 409 && j.closes) {
    const motif = await saisir(`${j.detail || 'Séance clôturée.'}\n\nMotif de la correction :`);
    if (!motif) return false;
    r = await fetch('/api/calendrier', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee, ...corps, motif }) });
    j = await r.json().catch(() => ({}));
  }
  if (!r.ok) { informer(j.error || `Refusé (${r.status})`); return false; }
  return true;
}

function LigneUnite({ it, annee, onFait }) {
  const [du, setDu] = useState(it.du || ''), [au, setAu] = useState(it.au || '');
  const change = du !== (it.du || '') || au !== (it.au || '');
  async function enregistrer() {
    const r = await fetch('/api/annuel/dates-ue', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee, lignes: [{ id: it.id, date_debut: du || null, date_fin: au || null }] }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { informer(j.error || `Refusé (${r.status})`); return; }
    if (j.en_attente) informer('Transmis pour validation à la direction.');
    onFait();
  }
  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5 border-t border-slate-100">
      <span className="min-w-0 flex-1"><b>UE {it.ue_num}</b>{it.org > 1 ? ` (org. ${it.org})` : ''} <span className="text-slate-500">{it.ue_nom}</span>
        <span className="text-second text-slate-400"> · {it.quoi === 'ouvre' ? 'ouvre' : 'ferme'} cette semaine</span></span>
      <label className="inline-flex items-center gap-1 text-second">du <input type="date" className="controle !h-8" value={du} onChange={e => setDu(e.target.value)} /></label>
      <label className="inline-flex items-center gap-1 text-second">au <input type="date" className="controle !h-8" value={au} onChange={e => setAu(e.target.value)} /></label>
      <button type="button" className="bouton !h-8" disabled={!change} onClick={enregistrer}>Enregistrer</button>
    </div>);
}

function LigneSession({ it, annee, onFait }) {
  const [date, setDate] = useState(it.date || ''), [heure, setHeure] = useState(String(it.heure || '').slice(0, 5));
  const change = date !== (it.date || '') || heure !== String(it.heure || '').slice(0, 5);
  async function enregistrer() {
    const corps = it.quoi === 'deliberation'
      ? { seances: [{ ue_num: it.ue_num, session: it.session, date_seance: date || null, heure_seance: heure || null }] }
      : { epreuves: [{ ue_num: it.ue_num, session: it.session, cours_code: it.cours_code || '', [`s${it.session}_date`]: date || null, [`s${it.session}_heure`]: heure || null }] };
    if (await poserSessions(annee, corps)) onFait();
  }
  const quoi = it.quoi === 'deliberation' ? 'Délibération' : 'Épreuve';
  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5 border-t border-slate-100">
      <span className="px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: it.quoi === 'deliberation' ? 'var(--c-principal)' : 'var(--c-attente)' }}>{quoi} S{it.session}</span>
      <span className="min-w-0 flex-1"><b>{it.cours_code || `UE ${it.ue_num}`}</b> <span className="text-slate-500">{it.ue_nom}</span>
        {it.org ? <span className="text-second text-slate-400"> · org. {it.org} (se règle dans la délibération)</span> : null}{it.close ? <span className="text-second text-slate-400"> · séance close</span> : null}</span>
      <input type="date" className="controle !h-8" value={date} onChange={e => setDate(e.target.value)} disabled={!!it.org} aria-label="Date" />
      <input type="time" className="controle !h-8" value={heure} onChange={e => setHeure(e.target.value)} disabled={!!it.org} aria-label="Heure" />
      <button type="button" className="bouton !h-8" disabled={!change || !!it.org} onClick={enregistrer}>Enregistrer</button>
    </div>);
}

function Ajouter({ annee, lundi, onFait }) {
  const [ues, setUes] = useState([]);
  const [f, setF] = useState({ quoi: 'deliberation', ue: '', session: 1, date: lundi, heure: '', cours: '' });
  useEffect(() => {
    fetch(`/api/calendrier?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : { ues: [] }))
      .then(j => setUes(j.ues || [])).catch(() => setUes([]));
  }, [annee]);
  const ue = ues.find(u => String(u.ue_num) === String(f.ue));
  async function poser() {
    const corps = f.quoi === 'deliberation'
      ? { seances: [{ ue_num: Number(f.ue), session: f.session, date_seance: f.date, heure_seance: f.heure || null }] }
      : { epreuves: [{ ue_num: Number(f.ue), session: f.session, cours_code: f.cours || '', [`s${f.session}_date`]: f.date, [`s${f.session}_heure`]: f.heure || null }] };
    if (await poserSessions(annee, corps)) { setF(x => ({ ...x, ue: '', heure: '', cours: '' })); onFait(); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="segments">{[['deliberation', 'Délibération'], ['epreuve', 'Épreuve']].map(([k, l]) => (
        <button key={k} type="button" onClick={() => setF(x => ({ ...x, quoi: k }))} className={f.quoi === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{l}</button>))}</div>
      <select className="controle !h-8" value={f.ue} onChange={e => setF(x => ({ ...x, ue: e.target.value, cours: '' }))} aria-label="Unité">
        <option value="">Unité…</option>
        {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}{u.section ? ` · ${u.section}` : ''}</option>)}
      </select>
      {f.quoi === 'epreuve' && ue?.cours?.length > 0 && (
        <select className="controle !h-8" value={f.cours} onChange={e => setF(x => ({ ...x, cours: e.target.value }))} aria-label="Cours">
          <option value="">toute l’unité</option>
          {ue.cours.map(c => <option key={c.cours_code || c} value={c.cours_code || c}>{c.cours_code || c}{c.cours_nom ? ` ${c.cours_nom}` : ''}</option>)}
        </select>)}
      <select className="controle !h-8" value={f.session} onChange={e => setF(x => ({ ...x, session: Number(e.target.value) }))} aria-label="Session">
        <option value={1}>1re session</option><option value={2}>2e session</option></select>
      <input type="date" className="controle !h-8" value={f.date} min={lundi} max={plus(lundi, 6)} onChange={e => setF(x => ({ ...x, date: e.target.value }))} aria-label="Date" />
      <input type="time" className="controle !h-8" value={f.heure} onChange={e => setF(x => ({ ...x, heure: e.target.value }))} aria-label="Heure" />
      <button type="button" className="bouton bouton-fort !h-8 inline-flex items-center gap-1" disabled={!f.ue || !f.date} onClick={poser}><IconPlus size={14} /> Poser</button>
    </div>);
}

export default function AgendaDates({ annee, lundi, ag, onFermer, onFait }) {
  const i = ag.semaines.indexOf(lundi);
  const unites = ag.unites?.[i]?.items || [];
  const sessions = ag.sessions?.[i]?.items || [];
  const [cle, setCle] = useState(0);
  const fait = () => { setCle(k => k + 1); onFait(); };
  return (
    <Fenetre titre={`Semaine du ${fmt(lundi)} au ${fmt(plus(lundi, 6))}`} sous="Les dates des unités et des sessions — posées ici, lues partout" onFermer={onFermer}>
      <div className="space-y-5 text-sm" key={cle}>
        <section>
          <div className="intertitre flex items-center gap-1.5 mb-1"><IconGavel size={15} /> Épreuves et délibérations</div>
          {sessions.length ? sessions.map((it, k) => <LigneSession key={`${it.quoi}-${it.ue_num}-${it.session}-${it.cours_code || ''}-${it.org || 0}-${k}`} it={it} annee={annee} onFait={fait} />)
            : <p className="m-0 text-slate-500">Aucune épreuve ni délibération cette semaine.</p>}
          <div className="mt-3 pt-3 border-t border-slate-200">
            <div className="text-second text-slate-500 mb-1.5 inline-flex items-center gap-1"><IconPencil size={13} /> Ajouter une délibération ou une épreuve cette semaine</div>
            <Ajouter annee={annee} lundi={lundi} onFait={fait} />
          </div>
        </section>
        <section>
          <div className="intertitre flex items-center gap-1.5 mb-1"><IconSchool size={15} /> Unités qui ouvrent ou ferment</div>
          {unites.length ? unites.map((it, k) => <LigneUnite key={`${it.id}-${it.quoi}-${k}`} it={it} annee={annee} onFait={fait} />)
            : <p className="m-0 text-slate-500">Aucune unité n’ouvre ni ne ferme cette semaine. Les dates de toutes les unités : Organisation → L’année → Dates des UE.</p>}
        </section>
      </div>
    </Fenetre>);
}

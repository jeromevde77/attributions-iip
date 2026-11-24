/**
 * LES DATES D'UNE SEMAINE, POSÉES DEPUIS L'AGENDA (3.5.149, Charles : « continue l'agenda » — l'agenda de l'école, seule porte des
 * dates). Un clic sur une semaine des rangées « Unités » ou « Sessions » ouvre ici : les unités qui ouvrent ou ferment cette
 * semaine, les épreuves et les délibérations, chacune modifiable sur place ; et l'ajout d'une délibération ou d'une épreuve. On
 * écrit par les portes de toujours — `PUT /api/annuel/dates-ue` (une coordination dépose une demande), `PUT /api/calendrier`
 * (une séance close exige un motif) — : aucune règle n'est doublée.
 */
import { useEffect, useState } from 'react';
import { IconGavel, IconPencil, IconSchool, IconPlus, IconBrandTeams, IconExternalLink } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { informer, saisir, demander } from '../lib/dialogue.jsx';
import { nomPropre } from '../lib/nom.js';

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

/* L'INVITATION TEAMS (3.5.666, Charles : « générer une invitation Microsoft Teams, envoyée à tous les profs qui doivent y
   être »). La clé est celle du serveur (lib/invitationsTeams.js) : une séance, un passage, ou une épreuve (année, session,
   unité, cours). Un clic : la simulation (qui est invité, qui n'a pas d'adresse), la confirmation, puis la réunion créée
   — ou mise à jour si la date l'était déjà. */
const cleTeams = (it, annee) => (it.quoi === 'deliberation' ? `deliberation:${it.id}`
  : it.passage_id ? `passage:${it.passage_id}` : `examen:${annee}|${it.session}|${it.ue_num}|${it.cours_code || ''}`);
const quandFr = d => (d ? new Date(`${String(d).replace(' ', 'T')}Z`).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' à') : '');

function BoutonTeams({ it, annee, teams, onFait }) {
  const [occupe, setOccupe] = useState(false);
  if (!teams?.dispo?.autorise) return null;           // pas de droit, pas de bouton
  if (it.quoi === 'deliberation' && !it.id) return null;
  const inv = teams.etat?.[cleTeams(it, annee)];
  const actif = inv && !inv.annule_le;
  const raison = !teams.dispo.pret ? teams.dispo.raison : !it.date ? 'Posez d’abord la date.' : !String(it.heure || '').trim() ? 'Posez d’abord l’heure.' : null;
  const q = it.quoi === 'deliberation' ? { type: 'deliberation', id: it.id }
    : it.passage_id ? { type: 'examen', passage_id: it.passage_id } : { type: 'examen', annee, session: it.session, ue_num: it.ue_num, cours_code: it.cours_code || '' };
  async function inviter() {
    setOccupe(true);
    try {
      const r = await fetch('/api/teams/inviter', { method: 'POST', headers: authHeaders(), body: JSON.stringify(q) });
      const s = await r.json().catch(() => ({}));
      if (!r.ok) { informer(s.error || `Refusé (${r.status})`); return; }
      if (s.manque?.length) { informer(`Impossible d’inviter : il manque ${s.manque.join(', ')}.`); return; }
      const nom = p => nomPropre(p.nom, p.prenom);
      const lignes = [
        `${s.evenement.sujet}`,
        `Le ${s.evenement.date.split('-').reverse().join('/')} à ${s.evenement.heure}${s.evenement.lieu ? ` — ${s.evenement.lieu}` : ''}.`,
        '',
        s.deja && !s.deja.annule_le
          ? `Déjà invitée le ${quandFr(s.deja.cree_le)} : la réunion sera MISE À JOUR (même lien Teams).${s.ajoutes.length ? ` Ajouté${s.ajoutes.length > 1 ? 's' : ''} : ${s.ajoutes.map(nom).join(', ')}.` : ''}`
          : `Une réunion Teams sera créée et envoyée à ${s.invites.length} professeur${s.invites.length > 1 ? 's' : ''}.`,
        '',
        'Invités :',
        ...s.invites.map(p => `• ${nom(p)} — ${p.email}`),
        ...(s.sans_adresse.length ? ['', 'Sans adresse (non invités) :', ...s.sans_adresse.map(p => `• ${nom(p)}`)] : []),
      ];
      if (!(await demander({ titre: 'Inviter sur Teams', message: lignes.join('\n'), confirmer: actif ? 'Mettre à jour' : 'Envoyer l’invitation' }))) return;
      const w = await fetch('/api/teams/inviter', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...q, ecrire: true }) });
      const j = await w.json().catch(() => ({}));
      if (!w.ok) { informer(j.error || `Refusé (${w.status})`); return; }
      informer({ ton: 'reussi', message: `${j.mise_a_jour ? 'Invitation mise à jour' : 'Invitation envoyée'} · ${j.invites.length} invité${j.invites.length > 1 ? 's' : ''}.` });
      onFait();
    } finally { setOccupe(false); }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="bouton !h-8 inline-flex items-center gap-1" disabled={!!raison || occupe} title={raison || undefined} onClick={inviter}>
        <IconBrandTeams size={15} /> {actif ? 'Mettre à jour Teams' : 'Inviter sur Teams'}
      </button>
      {raison && <span className="text-second text-slate-400">{raison}</span>}
      {actif && (
        <span className="text-second text-slate-500">
          Invitation {inv.maj_le && inv.maj_le !== inv.cree_le ? 'mise à jour' : 'envoyée'} le {quandFr(inv.maj_le || inv.cree_le)} · {inv.invites.length} invité{inv.invites.length > 1 ? 's' : ''}
          {inv.statut === 'changee' ? ' · la date a changé depuis : à mettre à jour' : ''}
          {inv.join_url && <> · <a href={inv.join_url} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">lien Teams <IconExternalLink size={12} /></a></>}
        </span>)}
    </span>);
}

function LigneSession({ it, annee, onFait, teams }) {
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
        {it.org ? <span className="text-second text-slate-400"> · org. {it.org} (se règle dans la délibération)</span> : null}{it.close ? <span className="text-second text-slate-400"> · séance close</span> : null}
        {/* UN PASSAGE (3.5.284) se règle dans sa fenêtre « Passages » du calendrier des sessions, avec sa liste. */}
        {it.passage ? <span className="text-second text-slate-400"> · {it.partie ? `${it.partie} · ` : ''}passage (se règle dans le calendrier des sessions → Passages)</span> : null}</span>
      <input type="date" className="controle !h-8" value={date} onChange={e => setDate(e.target.value)} disabled={!!it.org || !!it.passage} aria-label="Date" />
      <input type="time" className="controle !h-8" value={heure} onChange={e => setHeure(e.target.value)} disabled={!!it.org || !!it.passage} aria-label="Heure" />
      <button type="button" className="bouton !h-8" disabled={!change || !!it.org || !!it.passage} onClick={enregistrer}>Enregistrer</button>
      {teams?.dispo?.autorise && <div className="basis-full"><BoutonTeams it={it} annee={annee} teams={teams} onFait={teams.recharger} /></div>}
    </div>);
}

/** Les invitations Teams de l'année et ce qui manque pour inviter (lus une fois par fenêtre). */
function useTeams(annee) {
  const [dispo, setDispo] = useState(null), [etat, setEtat] = useState({}), [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch('/api/teams/disponible', { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(d => {
      if (!vivant) return;
      setDispo(d);
      if (d?.autorise && d.ouverte) {
        fetch(`/api/teams/etat?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : []))
          .then(l => vivant && setEtat(Object.fromEntries((Array.isArray(l) ? l : []).map(x => [x.cle, x])))).catch(() => {});
      }
    }).catch(() => setDispo(null));
    return () => { vivant = false; };
  }, [annee, n]);
  return { dispo, etat, recharger: () => setN(k => k + 1) };
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
  const teams = useTeams(annee);
  return (
    <Fenetre titre={`Semaine du ${fmt(lundi)} au ${fmt(plus(lundi, 6))}`} sous="Les dates des unités et des sessions — posées ici, lues partout" onFermer={onFermer}>
      <div className="space-y-5 text-sm" key={cle}>
        <section>
          <div className="intertitre flex items-center gap-1.5 mb-1"><IconGavel size={15} /> Épreuves et délibérations</div>
          {sessions.length ? sessions.map((it, k) => <LigneSession key={`${it.quoi}-${it.ue_num}-${it.session}-${it.cours_code || ''}-${it.org || 0}-${k}`} it={it} annee={annee} onFait={fait} teams={teams} />)
            : <p className="m-0 text-slate-500">Aucune épreuve ni délibération cette semaine.</p>}
          {/* UNE DATE RETIRÉE DE LUCIE dont la réunion Teams court encore : on propose de l'annuler (Graph prévient les invités). */}
          {Object.values(teams.etat).filter(x => x.statut === 'disparue' && String(x.debut || '').slice(0, 10) >= lundi && String(x.debut || '').slice(0, 10) <= plus(lundi, 6)).map(x => (
            <div key={x.cle} className="flex flex-wrap items-center gap-2 py-1.5 border-t border-slate-100">
              <IconBrandTeams size={15} className="text-slate-400" />
              <span className="min-w-0 flex-1">{x.sujet} <span className="text-second text-slate-400">· la date n’existe plus dans Lucie, la réunion Teams court encore ({x.invites.length} invité{x.invites.length > 1 ? 's' : ''})</span></span>
              <button type="button" className="bouton bouton-detruire !h-8" onClick={async () => {
                if (!(await demander(`Annuler la réunion Teams « ${x.sujet} » ? Les ${x.invites.length} invités en sont prévenus.`))) return;
                const r = await fetch('/api/teams/annuler', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ cle: x.cle }) });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) { informer(j.error || `Refusé (${r.status})`); return; }
                teams.recharger();
              }}>Annuler la réunion</button>
            </div>))}
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

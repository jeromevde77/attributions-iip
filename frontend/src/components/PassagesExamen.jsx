/* LES PASSAGES D'UN EXAMEN (3.5.284, Charles : « plusieurs groupes et donc plusieurs dates ; un même cours coupé en parties, avec des
 * listes d'étudiants »). Fenêtre ouverte depuis le calendrier des sessions, sous chaque cours : un passage = une partie (facultatif :
 * écrit, oral, partie 1…), une date, une heure, un local, et SES étudiants — tous, des groupes de la répartition (ou une
 * organisation), une tranche alphabétique, ou choisis à la main. Lucie dit qui n'est placé nulle part et qui l'est deux fois pour
 * une même partie. Les notes ne changent pas : elles restent par acquis. Serveur : GET/PUT /api/calendrier/passages. */
import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconTrash, IconDeviceFloppy, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { demander } from '../lib/dialogue.jsx';
import { Fenetre, Encadre } from './ui.jsx';

const MODES = [['tous', 'Tous'], ['groupes', 'Par groupe'], ['alpha', 'De A à Z'], ['main', 'À la main']];
const vide = () => ({ partie: '', date: '', heure: '', local: '', mode: 'tous', groupes: [], alpha_de: '', alpha_a: '', etudiants: [] });

export default function PassagesExamen({ annee, ue, cours, session, onFermer }) {
  const [d, setD] = useState(null);
  const [l, setL] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [vus, setVus] = useState({});
  const charger = useCallback(() => {
    fetch(`/api/calendrier/passages?annee=${encodeURIComponent(annee)}&ue=${ue.ue_num}&cours=${encodeURIComponent(cours.cours_code || '')}&session=${session}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(j => {
        setD(j);
        setL(j.passages.length ? j.passages.map(p => ({ ...vide(), ...p, partie: p.partie || '', heure: String(p.heure || '').slice(0, 5), local: p.local || '',
          alpha_de: p.alpha_de || '', alpha_a: p.alpha_a || '', etudiants: p.mode === 'main' ? p.etudiants.map(e => e.id) : [], liste: p.etudiants }))
          : [{ ...vide(), date: (session === 2 ? cours.s2?.s2_date : cours.s1?.s1_date) || '', heure: String((session === 2 ? cours.s2?.s2_heure : cours.s1?.s1_heure) || '').slice(0, 5),
            local: (session === 2 ? cours.s2?.s2_local : cours.s1?.s1_local) || '' }]);
      })
      .catch(e => setErreur(e.message));
  }, [annee, ue.ue_num, cours, session]);
  useEffect(() => { charger(); }, [charger]);

  const maj = (i, champs) => setL(x => x.map((p, k) => (k === i ? { ...p, ...champs, liste: undefined } : p)));
  const basculer = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  async function enregistrer() {
    setErreur(null); setMessage(null); setEnvoi(true);
    try {
      const r = await fetch('/api/calendrier/passages', { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, ue_num: ue.ue_num, cours_code: cours.cours_code || '', session,
          passages: l.map(p => ({ partie: p.partie, date: p.date, heure: p.heure, local: p.local, mode: p.mode, groupes: p.groupes, alpha_de: p.alpha_de, alpha_a: p.alpha_a, etudiants: p.etudiants })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setMessage(`${j.passages} passage(s) enregistré(s). Les listes ci-dessous sont à jour.`);
      charger();
    } catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  }
  async function toutRetirer() {
    if (!(await demander('Retirer tous les passages de cet examen ? Il redevient une seule date pour tous ses étudiants (la première date reste au calendrier).'))) return;
    setL([]);
    const r = await fetch('/api/calendrier/passages', { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ annee, ue_num: ue.ue_num, cours_code: cours.cours_code || '', session, passages: [] }) });
    if (r.ok) { setMessage('Passages retirés.'); charger(); } else setErreur((await r.json().catch(() => ({}))).error || 'Refusé.');
  }

  return (
    <Fenetre titre={`Passages de l’examen — ${cours.cours_code || `UE ${ue.ue_num}`} ${cours.cours_nom || ''}`.trim()}
      sous={`${session === 2 ? 'Seconde' : 'Première'} session · UE ${ue.ue_num} ${ue.ue_nom || ''} · ${d?.etudiants?.length ?? '…'} étudiant(s) à l’examen`}
      large="grande" onFermer={onFermer}
      pied={<>
        {d?.passages?.length > 0 && <button type="button" className="bouton mr-auto" onClick={toutRetirer}>Revenir à une seule date</button>}
        <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => setL(x => [...x, vide()])}><IconPlus size={15} /> Ajouter un passage</button>
        <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={envoi || !l.length} onClick={enregistrer}><IconDeviceFloppy size={15} /> Enregistrer</button>
      </>}>
      {!d ? (erreur ? <Encadre etat="corriger">{erreur}</Encadre> : <p className="text-sm text-slate-400">Chargement…</p>) : (
        <div className="space-y-3 text-sm">
          <p className="m-0 text-slate-600">Un examen peut se passer en plusieurs fois : par groupe, ou en parties (écrit, oral…). Chaque passage a sa date, son heure,
            son local et sa liste d’étudiants. Les notes ne changent pas : elles restent par acquis.</p>
          {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
          {message && <Encadre etat="reussi">{message}</Encadre>}
          {d.passages.length > 0 && d.non_places.length > 0 && <Encadre etat="surveiller" titre={`${d.non_places.length} étudiant(s) placé(s) dans aucun passage`}>
            {d.non_places.map(e => `${e.nom}${e.partie ? ` (${e.partie})` : ''}`).join(', ')}</Encadre>}
          {d.passages.length > 0 && d.doubles.length > 0 && <Encadre etat="surveiller" titre={`${d.doubles.length} étudiant(s) placé(s) deux fois pour une même partie`}>
            {d.doubles.map(e => `${e.nom}${e.partie ? ` (${e.partie})` : ''}`).join(', ')}</Encadre>}
          {l.map((p, i) => (
            <section key={i} className="carte p-3 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <span className="font-semibold text-iip-texte mr-1">Passage {i + 1}</span>
                <label className="flex-1 min-w-[140px]"><span className="block text-mention text-slate-500">Partie (facultatif)</span>
                  <input className="controle w-full" data-reponses="non" placeholder="écrit, oral, partie 1…" value={p.partie} onChange={e => maj(i, { partie: e.target.value })} /></label>
                <label><span className="block text-mention text-slate-500">Date</span>
                  <input type="date" className="controle" value={p.date} onChange={e => maj(i, { date: e.target.value })} /></label>
                <label><span className="block text-mention text-slate-500">Heure</span>
                  <input type="time" className="controle w-[100px]" value={p.heure} onChange={e => maj(i, { heure: e.target.value })} /></label>
                <label className="min-w-[120px]"><span className="block text-mention text-slate-500">Local</span>
                  <input className="controle w-full" data-reponses="non" value={p.local} onChange={e => maj(i, { local: e.target.value })} /></label>
                <button type="button" className="text-slate-400 hover:text-slate-700 mb-2" title="Retirer ce passage" onClick={() => setL(x => x.filter((_, k) => k !== i))}><IconTrash size={16} /></button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-mention text-slate-500">Étudiants :</span>
                <div className="segments">{MODES.map(([k, t]) => (
                  <button key={k} type="button" className={`px-3 py-1 text-second ${p.mode === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`} aria-pressed={p.mode === k} onClick={() => maj(i, { mode: k })}>{t}</button>))}</div>
              </div>
              {p.mode === 'groupes' && (
                (d.groupes.length || d.organisations.length) ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {d.groupes.map(g => <label key={g.code} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={p.groupes.includes(String(g.code))}
                      onChange={() => maj(i, { groupes: basculer(p.groupes, String(g.code)) })} /> Groupe {g.code} <span className="text-slate-400">({g.n})</span></label>)}
                    {d.organisations.map(o => <label key={o.n} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={p.groupes.includes(`org:${o.n}`)}
                      onChange={() => maj(i, { groupes: basculer(p.groupes, `org:${o.n}`) })} /> Organisation {o.n} <span className="text-slate-400">({o.etudiants})</span></label>)}
                  </div>)
                  : <p className="m-0 text-slate-500">Aucun groupe dans la répartition des étudiants pour ce cours (Organisation → Répartition des étudiants). Choisissez une tranche ou à la main.</p>)}
              {p.mode === 'alpha' && (
                <div className="flex items-center gap-2">Noms de
                  <input className="controle w-20 uppercase" maxLength={4} value={p.alpha_de} onChange={e => maj(i, { alpha_de: e.target.value })} placeholder="A" /> à
                  <input className="controle w-20 uppercase" maxLength={4} value={p.alpha_a} onChange={e => maj(i, { alpha_a: e.target.value })} placeholder="L" />
                  <span className="text-slate-500">(les premières lettres du nom, comprises)</span></div>)}
              {p.mode === 'main' && (
                <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-champ p-2 grid sm:grid-cols-2 gap-x-4">
                  {d.etudiants.map(e => <label key={e.id} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={p.etudiants.includes(e.id)}
                    onChange={() => maj(i, { etudiants: basculer(p.etudiants, e.id) })} /> {e.nom}</label>)}
                </div>)}
              {p.liste && (
                <div>
                  <button type="button" className="text-iip-blue inline-flex items-center gap-1" onClick={() => setVus(v => ({ ...v, [i]: !v[i] }))}>
                    {vus[i] ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />} {p.liste.length} étudiant(s) dans ce passage</button>
                  {vus[i] && <ol className="mt-1 ml-5 list-decimal columns-2 text-slate-700">{p.liste.map(e => <li key={e.id}>{e.nom}</li>)}</ol>}
                </div>)}
            </section>))}
          {!l.length && <p className="text-slate-500">Aucun passage : l’examen redevient une seule date pour tous ses étudiants.</p>}
        </div>)}
    </Fenetre>);
}

/* (CS) LE « + » DE L'HORAIRE (3.5.750, Charles, 26 novembre 2026 : « bouton + pour horaire »). Ajouter une séance depuis n'importe
   quelle vue (classe, professeur, local) et depuis la journée : on choisit une ATTRIBUTION (cours, groupe, professeur — les heures
   déjà posées sur elle sont dites), un jour, des heures, un local. La séance naît reliée à son attribution (POST /api/horaire/seance
   avec `attribution_id`) : professeur, groupe et lien sont ceux de l'attribution. */
import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const deHm = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const lisible = t => { const n = hm(t); return `${Math.floor(n / 60)}h${String(n % 60).padStart(2, '0')}`; };

async function appel(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

export default function NouvelleSeance({ annee, vue, cle, date, locaux = [], onFermer, onFini }) {
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [filtre, setFiltre] = useState('');
  const [f, setF] = useState({ attr: '', date: date || '', debut: '08:00', fin: '10:00', local: vue === 'local' && cle ? cle : '' });
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams({ annee: annee || '', vue: vue || '', cle: cle || '' });
    appel(`/api/horaire/a-placer?${q}`).then(setListe).catch(e => setErreur(e.message));
  }, [annee, vue, cle]);
  const visibles = useMemo(() => {
    const t = filtre.trim().toLowerCase();
    return (liste || []).filter(a => !t || `${a.code_cours} ${a.cours_nom || ''} ${a.prof || ''} ${a.groupe || ''} ${a.activite || ''} ${a.section}`.toLowerCase().includes(t));
  }, [liste, filtre]);
  const heures = []; for (let m = 7 * 60; m <= 22 * 60; m += 15) heures.push(deHm(m));
  const ok = f.attr && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && hm(f.fin) > hm(f.debut);
  const poser = async () => {
    setEnCours(true); setErreur(null);
    try {
      await appel('/api/horaire/seance', { method: 'POST', body: JSON.stringify({ attribution_id: Number(f.attr), date: f.date,
        heure_debut: f.debut, heure_fin: f.fin, local_texte: f.local }) });
      onFini();
    } catch (e) { setErreur(e.message); setEnCours(false); }
  };
  return (
    <Fenetre titre="Ajouter une séance" large="moyenne" onFermer={onFermer}
      sous="Elle naît reliée à son attribution : cours, groupe et professeur viennent d’elle."
      pied={<><span className="flex-1 min-w-0 text-second text-slate-500">{!f.attr ? 'Choisissez une attribution.' : ''}</span>
        <button className="bouton" onClick={onFermer}>Annuler</button>
        <button className="bouton bouton-fort" disabled={!ok || enCours} onClick={poser}>Ajouter</button></>}>
      <div className="space-y-3 text-sm">
        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
        <label className="block">
          <span className="text-xs text-slate-500">Attribution — cours, groupe, professeur</span>
          <input className="controle w-full mb-1.5" placeholder="Filtrer : code, cours, professeur, groupe…" value={filtre} onChange={e => setFiltre(e.target.value)} />
          <select className="controle w-full" size={8} value={f.attr} onChange={e => setF({ ...f, attr: e.target.value })} style={{ height: 'auto' }}>
            {liste === null && <option disabled>Chargement…</option>}
            {liste && !visibles.length && <option disabled>Aucune attribution</option>}
            {visibles.map(a => (
              <option key={a.id} value={String(a.id)}>
                {a.code_cours} {a.cours_nom || ''}{a.activite ? ` · ${a.activite}` : ''} · gr. {a.groupe || 'tous'} · {a.prof || 'professeur à désigner'}
                {a.reste != null ? ` — ${a.reste <= 0 ? 'complet' : `reste ${a.reste} h sur ${a.heures}`}` : ` — ${a.posees} h posées`}
              </option>))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block col-span-3 sm:col-span-1">
            <span className="text-xs text-slate-500">Jour</span>
            <input type="date" className="controle w-full" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">De</span>
            <select className="controle w-full" value={f.debut} onChange={e => {
              const d = e.target.value; setF({ ...f, debut: d, fin: deHm(Math.min(22 * 60, hm(d) + (hm(f.fin) - hm(f.debut) || 120))) });
            }}>{heures.slice(0, -1).map(h => <option key={h} value={h}>{lisible(h)}</option>)}</select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">À</span>
            <select className="controle w-full" value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })}>
              {heures.filter(h => hm(h) > hm(f.debut)).map(h => <option key={h} value={h}>{lisible(h)}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-slate-500">Local</span>
          <input className="controle w-full" list="locaux-nouvelle-seance" value={f.local} onChange={e => setF({ ...f, local: e.target.value })}
            placeholder="P2 523, Nile, Distanciel asynchrone…" />
          <datalist id="locaux-nouvelle-seance">{locaux.map(l => <option key={l.nom} value={l.nom} />)}<option value="Distanciel asynchrone" /></datalist>
        </label>
        <p className="text-xs text-slate-500">Un cours absent de la liste n’a pas d’attribution : il s’ajoute d’abord dans Attributions. Le groupe se change ensuite dans la séance.</p>
      </div>
    </Fenetre>
  );
}

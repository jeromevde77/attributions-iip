/* (CS) LE « + » DE L'HORAIRE (3.5.750, Charles, 26 novembre 2026 : « bouton + pour horaire »). Ajouter une séance depuis n'importe
   quelle vue (classe, professeur, local) et depuis la journée. La séance naît reliée à son ATTRIBUTION (POST /api/horaire/seance avec
   `attribution_id`) : professeur, groupe et lien sont ceux de l'attribution.
   PAR ÉTAPES (3.5.755, Charles : « un sélecteur de section qui réduit la liste des cours ; plus dynamique ou automatique ») :
   section → unité → cours → groupe et professeur, en boutons ; un seul choix possible se prend tout seul. La section et l'unité
   partent de la vue ouverte (la classe, le professeur). La durée se propose d'après ce qui reste à placer (un bloc de 2 h au plus). */
import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';
import { teinteCours } from '../lib/teinteCours.js';

const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const deHm = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const lisible = t => { const n = hm(t); return `${Math.floor(n / 60)}h${String(n % 60).padStart(2, '0')}`; };
const trier = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true });

async function appel(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

function Choix({ titre, options, valeur, onChoisir, rendu }) {
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{titre}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => (
          <button key={o.v} type="button" onClick={() => onChoisir(o.v)}
            className={`bouton !h-auto min-h-8 py-1 text-left ${valeur === o.v ? 'bouton-fort' : ''}`}>
            {rendu ? rendu(o, valeur === o.v) : o.l}
          </button>))}
      </div>
    </div>
  );
}

export default function NouvelleSeance({ annee, vue, cle, date, locaux = [], onFermer, onFini }) {
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [sec, setSec] = useState('');
  const [ue, setUe] = useState('');
  const [cours, setCours] = useState('');
  const [attr, setAttr] = useState('');
  const [f, setF] = useState({ date: date || '', debut: '08:00', fin: '10:00', local: vue === 'local' && cle ? cle : '' });
  const [enCours, setEnCours] = useState(false);
  const [profVue] = useState(vue === 'professeur' ? Number(cle) : null);
  const [uesClasse, setUesClasse] = useState(null);   // les unités de la classe ouverte, pour partir d'elles

  useEffect(() => {
    // Tout le périmètre : le sélecteur de section réduit ensuite ; la vue ouverte donne le point de départ.
    appel(`/api/horaire/a-placer?${new URLSearchParams({ annee: annee || '' })}`).then(l => {
      setListe(l);
      if (vue === 'classe' && cle) {
        setSec(String(cle).split('|')[0]);
        appel(`/api/horaire/a-placer?${new URLSearchParams({ annee: annee || '', vue, cle })}`)
          .then(c => setUesClasse(new Set(c.map(a => a.ue_num)))).catch(() => {});
      } else if (vue === 'professeur' && cle) {
        const s = [...new Set(l.filter(a => a.professeur_id === Number(cle)).map(a => a.section))];
        if (s.length === 1) setSec(s[0]);
      }
    }).catch(e => setErreur(e.message));
  }, [annee, vue, cle]);

  const sections = useMemo(() => [...new Set((liste || []).map(a => a.section))].sort(trier), [liste]);
  const dansSec = useMemo(() => (liste || []).filter(a => a.section === sec), [liste, sec]);
  const ues = useMemo(() => {
    const m = new Map();
    for (const a of dansSec) if (!m.has(a.ue_num)) m.set(a.ue_num, a.ue_nom);
    let l = [...m.entries()].sort((a, b) => a[0] - b[0]);
    // La classe ouverte d'abord : ses unités en tête, les autres derrière (une UE peut se donner à plusieurs blocs).
    if (uesClasse) l = [...l.filter(([n]) => uesClasse.has(n)), ...l.filter(([n]) => !uesClasse.has(n))];
    return l;
  }, [dansSec, uesClasse]);
  const coursUE = useMemo(() => {
    const m = new Map();
    for (const a of dansSec.filter(a => String(a.ue_num) === String(ue))) if (!m.has(a.code_cours)) m.set(a.code_cours, a.cours_nom);
    return [...m.entries()].sort((a, b) => trier(a[0], b[0]));
  }, [dansSec, ue]);
  const lignes = useMemo(() => dansSec.filter(a => a.code_cours === cours)
    .sort((a, b) => (profVue ? (b.professeur_id === profVue) - (a.professeur_id === profVue) : 0) || trier(a.groupe || 'Ts', b.groupe || 'Ts')), [dansSec, cours, profVue]);

  // L'AUTOMATIQUE : un seul choix possible se prend tout seul, à chaque étape.
  useEffect(() => { if (!sec && sections.length === 1) setSec(sections[0]); }, [sections, sec]);
  useEffect(() => { if (sec && ues.length === 1) setUe(String(ues[0][0])); }, [sec, ues]);
  useEffect(() => { if (ue && coursUE.length === 1) setCours(coursUE[0][0]); }, [ue, coursUE]);
  useEffect(() => { if (cours && lignes.length === 1) setAttr(String(lignes[0].id)); }, [cours, lignes]);

  const choisie = lignes.find(a => String(a.id) === String(attr));
  // La durée proposée : ce qui reste, dans un bloc de 2 h au plus (par quart d'heure).
  useEffect(() => {
    if (!choisie) return;
    const reste = choisie.reste != null && choisie.reste > 0 ? Math.round(choisie.reste * 4) * 15 : 120;
    setF(x => ({ ...x, fin: deHm(Math.min(22 * 60, hm(x.debut) + Math.max(30, Math.min(120, reste)))) }));
  }, [attr]);   // eslint-disable-line

  const heures = []; for (let m = 7 * 60; m <= 22 * 60; m += 15) heures.push(deHm(m));
  const ok = choisie && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && hm(f.fin) > hm(f.debut);
  const poser = async () => {
    setEnCours(true); setErreur(null);
    try {
      await appel('/api/horaire/seance', { method: 'POST', body: JSON.stringify({ attribution_id: choisie.id, date: f.date,
        heure_debut: f.debut, heure_fin: f.fin, local_texte: f.local }) });
      onFini();
    } catch (e) { setErreur(e.message); setEnCours(false); }
  };
  const reste = a => (a.reste == null ? `${a.posees} h posées` : a.reste <= 0 ? 'complet' : `reste ${a.reste} h sur ${a.heures}`);

  return (
    <Fenetre titre="Ajouter une séance" large="moyenne" onFermer={onFermer}
      sous="Elle naît reliée à son attribution : cours, groupe et professeur viennent d’elle."
      pied={<><span className="flex-1 min-w-0 text-second text-slate-500">
        {choisie ? <>{choisie.code_cours} · gr. {choisie.groupe || 'Ts'} · {choisie.prof || 'à désigner'} — {reste(choisie)}</> : 'Choisissez la section, l’unité, le cours puis le groupe.'}</span>
        <button className="bouton" onClick={onFermer}>Annuler</button>
        <button className="bouton bouton-fort" disabled={!ok || enCours} onClick={poser}>Ajouter</button></>}>
      <div className="space-y-3 text-sm">
        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
        {liste === null ? <p className="text-slate-400">Chargement des attributions…</p> : <>
          <label className="block">
            <span className="text-xs text-slate-500">Section</span>
            <select className="controle w-full" value={sec} onChange={e => { setSec(e.target.value); setUe(''); setCours(''); setAttr(''); }}>
              <option value="">— choisir —</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {sec && (
            <label className="block">
              <span className="text-xs text-slate-500">Unité</span>
              <select className="controle w-full" value={ue} onChange={e => { setUe(e.target.value); setCours(''); setAttr(''); }}>
                <option value="">— choisir —</option>
                {ues.map(([n, nom]) => <option key={n} value={String(n)}>UE {n} — {nom || ''}{uesClasse && !uesClasse.has(n) ? ' (autre bloc)' : ''}</option>)}
              </select>
            </label>)}
          {ue && coursUE.length > 0 && (
            <Choix titre="Cours" valeur={cours} onChoisir={v => { setCours(v); setAttr(''); }}
              options={coursUE.map(([c, nom]) => ({ v: c, l: `${c} ${nom || ''}` }))}
              rendu={(o, actif) => <span className="inline-flex items-center gap-1.5">
                {!actif && <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: teinteCours(o.v) }} />}{o.l}</span>} />)}
          {cours && lignes.length > 0 && (
            <Choix titre="Groupe et professeur" valeur={attr} onChoisir={v => setAttr(v)}
              options={lignes.map(a => ({ v: String(a.id), a }))}
              rendu={({ a }, actif) => <span className="block leading-tight">
                <b>gr. {a.groupe || 'Ts'}</b> · {a.prof || 'à désigner'}{a.activite ? ` · ${a.activite}` : ''}
                <span className={`block text-[11px] ${actif ? 'text-white/80' : a.reste != null && a.reste <= 0 ? 'text-slate-400' : 'text-slate-500'}`}>{reste(a)}</span></span>} />)}
          {sec && !dansSec.length && <p className="text-slate-500">Aucune attribution dans cette section.</p>}
        </>}
        <div className="grid grid-cols-3 gap-2 pt-1">
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
        <p className="text-xs text-slate-500">Un cours absent n’a pas d’attribution : il s’ajoute d’abord dans Attributions. Le groupe se change ensuite dans la séance.</p>
      </div>
    </Fenetre>
  );
}

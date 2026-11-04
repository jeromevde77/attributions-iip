/* CORRIGER UNE UE — ANNÉES REPRISES (3.5.118, outil temporaire). Une unité, une année reprise, tous ses inscrits : les notes
 * des acquis cours par cours (modifiables), la note de chaque cours et celle de l'unité (calculées par la délibération), la
 * note de l'unité portée par l'inscription (modifiable) et la décision finale, qui change d'un clic :
 * vide → réussi → ajourné → refusé → faveur → vide. Serveur : `routes/correctionUE.js`. À retirer quand les corrections des
 * imports seront finies. */
import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';

const CYCLE = [null, 'reussi', 'ajourne', 'refuse', 'faveur'];
const DECISION = {
  reussi: { l: 'Réussi', c: 'var(--c-reussi)' },
  ajourne: { l: 'Ajourné', c: 'var(--c-attente)' },
  refuse: { l: 'Refusé', c: 'var(--c-refuse)' },
  faveur: { l: 'Faveur', c: 'var(--c-faveur)' },
};
const fr = n => (n == null || n === '' ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ','));
const affiche = x => (x?.mention ? x.mention : fr(x?.note));

async function appeler(url, corps) {
  const r = await fetch(url, { method: corps ? 'PUT' : 'GET', headers: authHeaders(), ...(corps ? { body: JSON.stringify(corps) } : {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Refusé (${r.status})`);
  return j;
}

export default function CorrectionUE() {
  const [choix, setChoix] = useState(null);           // { annees, annee, ues }
  const [annee, setAnnee] = useState('');
  const [ue, setUe] = useState('');
  const [session, setSession] = useState(1);
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(null);         // l'étudiant dont une écriture est en cours

  useEffect(() => {
    appeler(`/api/correction-ue/choix${annee ? `?annee=${encodeURIComponent(annee)}` : ''}`)
      .then(j => { setChoix(j); if (!annee) setAnnee(j.annee); })
      .catch(e => setErreur(e.message));
  }, [annee]);

  useEffect(() => {
    if (!ue || !annee) { setData(null); return; }
    setErreur(null); setData(null);
    appeler(`/api/correction-ue?ue=${ue}&annee=${encodeURIComponent(annee)}&session=${session}`)
      .then(j => { setData(j); if (j.session !== session) setSession(j.session); })
      .catch(e => setErreur(e.message));
  }, [ue, annee, session]);

  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.etudiants || []).filter(e => !t || `${e.nom} ${e.prenom} ${e.matricule || ''}`.toLowerCase().includes(t));
  }, [data, q]);

  const remplacer = e => setData(d => ({ ...d, etudiants: d.etudiants.map(x => (x.id === e.id ? e : x)) }));
  async function ecrire(url, corps, etudId) {
    setErreur(null); setOccupe(etudId);
    try { const j = await appeler(url, { annee, ue_num: Number(ue), session, etudiant_id: etudId, ...corps }); if (j.etudiant) remplacer(j.etudiant); }
    catch (e) { setErreur(e.message); }
    finally { setOccupe(null); }
  }
  const decisionDe = e => (e.faveur ? 'faveur' : e.resultat || null);
  const suivante = e => CYCLE[(CYCLE.indexOf(decisionDe(e)) + 1) % CYCLE.length];

  const structure = data?.structure || [];
  const cellule = 'px-1.5 py-1 border-l border-slate-100';
  const champ = 'w-14 text-center text-sm rounded border border-slate-200 bg-white px-1 py-0.5 focus:border-iip-blue outline-none';

  return (
    <div className="space-y-3">
      <div>
        <h2 className="titre-ecran mb-0">Corriger une UE — années reprises</h2>
        <p className="text-sm text-slate-500">
          Outil temporaire pour corriger les imports : une unité, une année, tous ses inscrits. Les notes des acquis se modifient
          cours par cours ; la décision change d’un clic. Chaque changement est inscrit au journal des modifications.
        </p>
      </div>

      <div className="flex flex-nowrap items-center gap-2 min-w-0">
        <select className="controle" value={annee} onChange={e => { setAnnee(e.target.value); setUe(''); }} aria-label="Année">
          {(choix?.annees || []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="controle min-w-0 max-w-[28rem]" value={ue} onChange={e => setUe(e.target.value)} aria-label="Unité">
          <option value="">— choisir une unité —</option>
          {(choix?.ues || []).map(u => (
            <option key={u.ue_num} value={u.ue_num}>{u.ue_num} — {u.ue_nom || 'sans intitulé'}{u.section ? ` · ${u.section}` : ''} ({u.n})</option>))}
        </select>
        {data?.sessions?.length > 1 && (
          <div className="segments flex h-9 flex-none">
            {data.sessions.map(s => (
              <button key={s} type="button" onClick={() => setSession(s)}
                className={`px-3 text-second ${session === s ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>
                Notes de {s === 1 ? '1re' : '2e'} session</button>))}
          </div>)}
        <input className="controle w-56" placeholder="Rechercher un étudiant…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
      {ue && !data && !erreur && <div className="text-sm text-slate-400">Chargement…</div>}

      {data && (
        <div className="carte overflow-x-auto">
          <table className="text-sm border-collapse min-w-full">
            <thead>
              <tr className="tab-entete">
                <th rowSpan={2} className="px-3 py-1.5 text-left sticky left-0 z-10 min-w-[220px]" style={{ background: 'var(--tab-repere)' }}>
                  Étudiant <span className="font-normal text-slate-400">({lignes.length})</span></th>
                {structure.map(c => (
                  <th key={c.cours_code} colSpan={c.aas.length + 1} className="px-2 py-1 text-center border-l border-slate-200">
                    {c.epreuve ? c.cours_nom : <>{c.cours_code} · {c.cours_nom}</>}</th>))}
                <th colSpan={3} className="px-2 py-1 text-center border-l border-slate-200">Unité {data.ue_num}</th>
              </tr>
              <tr className="tab-entete">
                {structure.flatMap(c => [
                  ...c.aas.map(a => <th key={`${c.cours_code}|${a}`} className="px-1 py-1 text-center font-normal border-l border-slate-100" title={a}>{a.replace(/^AA/, '')}</th>),
                  <th key={`${c.cours_code}|n`} className="px-1 py-1 text-center border-l border-slate-100" title="Note du cours, calculée (indicative)">cours</th>,
                ])}
                <th className="px-1 py-1 text-center border-l border-slate-200" title="Note de l’unité calculée par la délibération">calc.</th>
                <th className="px-1 py-1 text-center border-l border-slate-100" title="Note de l’unité portée par l’inscription (celle des pièces)">note</th>
                <th className="px-2 py-1 text-center border-l border-slate-100">décision finale</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(e => {
                const dec = decisionDe(e), D = DECISION[dec];
                return (
                  <tr key={e.id} className={`border-b border-slate-100 ${occupe === e.id ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-1 sticky left-0 z-[1] bg-white border-r border-slate-100 whitespace-nowrap">
                      {(e.nom || '').toUpperCase()} {e.prenom}
                      {e.matricule && <span className="ml-1.5 text-mention text-slate-400">{e.matricule}</span>}
                    </td>
                    {structure.flatMap(c => [
                      ...c.aas.map(a => {
                        const x = e.notes[`${c.cours_code}|${a}`];
                        const v = affiche(x);
                        return (
                          <td key={`${c.cours_code}|${a}`} className={cellule}>
                            <input key={`${e.id}|${c.cours_code}|${a}|${session}|${v}`} defaultValue={v} className={champ}
                              style={x?.note != null && x.note < 10 && !x.mention ? { color: 'var(--c-refuse)' } : undefined}
                              title={`${a} — ${c.cours_nom} : une note entre 0 et 20, NP, PP, ou vide pour effacer`}
                              onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); }}
                              onBlur={ev => { if (ev.target.value.trim() !== v) ecrire('/api/correction-ue/note', { cours_code: c.cours_code, aa_code: a, valeur: ev.target.value }, e.id); }} />
                          </td>);
                      }),
                      <td key={`${c.cours_code}|n`} className={`${cellule} text-center text-slate-500 tabular-nums`}>{affiche(e.cours[c.cours_code])}</td>,
                    ])}
                    <td className={`${cellule} text-center tabular-nums font-semibold`}
                      title={e.proposee ? `La délibération proposerait : ${DECISION[e.proposee]?.l || e.proposee}` : ''}>{fr(e.note_ue)}</td>
                    <td className={cellule}>
                      <input key={`${e.id}|pts|${e.points}`} defaultValue={fr(e.points)} className={champ} title="Note de l’unité portée par l’inscription"
                        onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); }}
                        onBlur={ev => { if (ev.target.value.trim() !== fr(e.points)) ecrire('/api/correction-ue/decision', { points: ev.target.value }, e.id); }} />
                    </td>
                    <td className={`${cellule} text-center`}>
                      <button type="button" disabled={occupe === e.id} onClick={() => ecrire('/api/correction-ue/decision', { decision: suivante(e) }, e.id)}
                        title={`Cliquer : ${DECISION[suivante(e)]?.l || 'effacer la décision'}`}
                        className="min-w-[5.5rem] px-2.5 py-0.5 rounded-full text-mention font-bold border"
                        style={D ? { background: D.c, borderColor: D.c, color: '#fff' } : { borderColor: 'var(--c-filet, #D8DCE4)', color: '#94A3B8' }}>
                        {D ? D.l : '—'}
                      </button>
                    </td>
                  </tr>);
              })}
            </tbody>
          </table>
          {!lignes.length && <p className="px-3 py-4 text-sm text-slate-400">Aucun inscrit.</p>}
        </div>)}
    </div>
  );
}

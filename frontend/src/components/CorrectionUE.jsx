/* CORRIGER UNE UE — ANNÉES REPRISES (3.5.118, outil temporaire). PLUSIEURS UE ET DES VOLETS (3.5.317, le secrétariat : « choisir
 * plusieurs UE ; alors plus le détail des AA ni des cours d'emblée — des volets, comme dans Inscrits par unité ») : chaque unité
 * cochée est une colonne repliée (note calculée, note, décision) ; un clic sur son en-tête ouvre son volet (cours et acquis). Une unité, une année reprise, tous ses inscrits : les notes
 * des acquis cours par cours (modifiables), la note de chaque cours et celle de l'unité (calculées par la délibération), la
 * note de l'unité portée par l'inscription (modifiable) et la décision finale, qui change d'un clic :
 * vide → réussi → ajourné → refusé → faveur → vide. Serveur : `routes/correctionUE.js`. À retirer quand les corrections des
 * imports seront finies. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
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
  const [ues, setUes] = useState([]);                 // les unités cochées, dans l'ordre
  const [ouvertes, setOuvertes] = useState(() => new Set());   // les volets ouverts
  const [session, setSession] = useState(1);
  const [donnees, setDonnees] = useState({});         // ue_num → lecture de l'unité
  const [q, setQ] = useState('');
  const [qUE, setQUE] = useState('');
  const [panneau, setPanneau] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [charge, setCharge] = useState(false);
  const [occupe, setOccupe] = useState(null);         // « étudiant|ue » d'une écriture en cours
  const refPanneau = useRef(null);

  useEffect(() => {
    appeler(`/api/correction-ue/choix${annee ? `?annee=${encodeURIComponent(annee)}` : ''}`)
      .then(j => { setChoix(j); if (!annee) setAnnee(j.annee); })
      .catch(e => setErreur(e.message));
  }, [annee]);

  useEffect(() => {
    if (!ues.length || !annee) { setDonnees({}); return; }
    setErreur(null); setCharge(true);
    appeler(`/api/correction-ue/plusieurs?ues=${ues.join(',')}&annee=${encodeURIComponent(annee)}&session=${session}`)
      .then(j => setDonnees(Object.fromEntries(j.ues.map(u => [u.ue_num, u]))))
      .catch(e => setErreur(e.message))
      .finally(() => setCharge(false));
  }, [ues, annee, session]);

  // Une seule unité : son volet s'ouvre d'office.
  useEffect(() => { if (ues.length === 1) setOuvertes(new Set(ues)); }, [ues]);
  useEffect(() => {
    if (!panneau) return undefined;
    const fermer = ev => { if (refPanneau.current && !refPanneau.current.contains(ev.target)) setPanneau(false); };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, [panneau]);

  const lues = ues.map(u => donnees[u]).filter(Boolean);
  const aSeconde = lues.some(d => d.sessions?.length > 1);
  // Les étudiants : la réunion des inscrits des unités cochées.
  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    const par = new Map();
    for (const d of lues) for (const e of d.etudiants) if (!par.has(e.id)) par.set(e.id, e);
    return [...par.values()].filter(e => !t || `${e.nom} ${e.prenom} ${e.matricule || ''}`.toLowerCase().includes(t))
      .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
  }, [donnees, ues, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const remplacer = (ueNum, e) => setDonnees(m => ({ ...m, [ueNum]: { ...m[ueNum], etudiants: m[ueNum].etudiants.map(x => (x.id === e.id ? e : x)) } }));
  async function ecrire(url, corps, etudId, ueNum) {
    setErreur(null); setOccupe(`${etudId}|${ueNum}`);
    try {
      const j = await appeler(url, { annee, ue_num: Number(ueNum), session: donnees[ueNum]?.session || 1, etudiant_id: etudId, ...corps });
      if (j.etudiant) remplacer(ueNum, j.etudiant);
    } catch (e) { setErreur(e.message); } finally { setOccupe(null); }
  }
  const decisionDe = e => (e.faveur ? 'faveur' : e.resultat || null);
  const suivante = e => CYCLE[(CYCLE.indexOf(decisionDe(e)) + 1) % CYCLE.length];
  const basculerUE = n => setUes(l => (l.includes(n) ? l.filter(x => x !== n) : [...l, n]));
  const basculerVolet = n => setOuvertes(s0 => { const s1 = new Set(s0); s1.has(n) ? s1.delete(n) : s1.add(n); return s1; });

  const cellule = 'px-1.5 py-1 border-l border-slate-100';
  const champ = 'w-14 text-center text-sm rounded border border-slate-200 bg-white px-1 py-0.5 focus:border-iip-blue outline-none';
  const listeUE = (choix?.ues || []).filter(u => !qUE.trim() || `${u.ue_num} ${u.ue_nom || ''} ${u.section || ''}`.toLowerCase().includes(qUE.trim().toLowerCase()));

  return (
    <div className="space-y-3">
      <div>
        <h2 className="titre-ecran mb-0">Corriger une UE — années reprises</h2>
        <p className="text-sm text-slate-500">
          Outil temporaire pour corriger les imports : une ou plusieurs unités d’une année, tous leurs inscrits. Chaque unité se lit
          repliée (note calculée, note, décision) ; un clic sur son en-tête ouvre ses cours et ses acquis. La décision change d’un
          clic. Chaque changement est inscrit au journal des modifications.
        </p>
      </div>

      <div className="flex flex-nowrap items-center gap-2 min-w-0">
        <select className="controle" value={annee} onChange={e => { setAnnee(e.target.value); setUes([]); }} aria-label="Année">
          {(choix?.annees || []).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="relative" ref={refPanneau}>
          <button type="button" className="controle inline-flex items-center gap-1.5 max-w-[26rem]" onClick={() => setPanneau(v => !v)}>
            <span className="truncate">{ues.length ? `Unités : ${ues.join(', ')}` : '— choisir des unités —'}</span>
            <IconChevronDown size={14} className="flex-none" />
          </button>
          {panneau && (
            <div className="absolute z-30 mt-1 w-[30rem] max-h-[60vh] overflow-auto carte bg-white p-2 shadow-flottant">
              <div className="flex items-center gap-2 mb-1.5">
                <input className="controle flex-1" placeholder="Chercher une unité…" value={qUE} onChange={e => setQUE(e.target.value)} autoFocus />
                {ues.length > 0 && <button type="button" className="bouton" onClick={() => setUes([])}>Tout décocher</button>}
              </div>
              {listeUE.map(u => (
                <label key={u.ue_num} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer text-sm">
                  <input type="checkbox" checked={ues.includes(u.ue_num)} onChange={() => basculerUE(u.ue_num)} />
                  <span className="font-semibold tabular-nums w-10">{u.ue_num}</span>
                  <span className="flex-1 min-w-0 truncate">{u.ue_nom || 'sans intitulé'}{u.section ? <span className="text-slate-400"> · {u.section}</span> : null}</span>
                  <span className="text-mention text-slate-400">{u.n}</span>
                </label>))}
            </div>)}
        </div>
        {aSeconde && (
          <div className="segments flex h-9 flex-none">
            {[1, 2].map(s0 => (
              <button key={s0} type="button" onClick={() => setSession(s0)}
                className={`px-3 text-second ${session === s0 ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>
                Notes de {s0 === 1 ? '1re' : '2e'} session</button>))}
          </div>)}
        <input className="controle w-56" placeholder="Rechercher un étudiant…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
      {charge && <div className="text-sm text-slate-400">Chargement…</div>}

      {lues.length > 0 && (
        <div className="carte overflow-x-auto">
          <table className="text-sm border-collapse min-w-full">
            <thead>
              <tr className="tab-entete">
                <th rowSpan={2} className="px-3 py-1.5 text-left sticky left-0 z-10 min-w-[220px]" style={{ background: 'var(--tab-repere)' }}>
                  Étudiant <span className="font-normal text-slate-400">({lignes.length})</span></th>
                {lues.map(d => {
                  const ouvert = ouvertes.has(d.ue_num);
                  const largeur = (ouvert ? d.structure.reduce((n, c) => n + c.aas.length + 1, 0) : 0) + 3;
                  return (
                    <th key={d.ue_num} colSpan={largeur} className="px-2 py-1 text-center border-l-2 border-slate-300 cursor-pointer select-none hover:bg-slate-100"
                      onClick={() => basculerVolet(d.ue_num)} title={ouvert ? 'Replier les cours et les acquis' : 'Ouvrir les cours et les acquis'}>
                      <span className="inline-flex items-center gap-1">{ouvert ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                        UE {d.ue_num}<span className="font-normal normal-case text-slate-500 truncate max-w-[14rem]"> · {d.ue_nom}</span></span>
                    </th>);
                })}
              </tr>
              <tr className="tab-entete">
                {lues.flatMap(d => [
                  ...(ouvertes.has(d.ue_num) ? d.structure.flatMap(c => [
                    ...c.aas.map(a => <th key={`${d.ue_num}|${c.cours_code}|${a}`} className="px-1 py-1 text-center font-normal border-l border-slate-100" title={`${c.cours_nom} — ${a}`}>{a.replace(/^AA/, '')}</th>),
                    <th key={`${d.ue_num}|${c.cours_code}|n`} className="px-1 py-1 text-center border-l border-slate-100" title={`Note du cours ${c.cours_nom}, calculée (indicative)`}>{c.epreuve ? 'épr.' : c.cours_code}</th>,
                  ]) : []),
                  <th key={`${d.ue_num}|calc`} className="px-1 py-1 text-center border-l-2 border-slate-300" title="Note de l’unité calculée par la délibération">calc.</th>,
                  <th key={`${d.ue_num}|note`} className="px-1 py-1 text-center border-l border-slate-100" title="Note de l’unité portée par l’inscription (celle des pièces)">note</th>,
                  <th key={`${d.ue_num}|dec`} className="px-2 py-1 text-center border-l border-slate-100">décision</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {lignes.map(e0 => (
                <tr key={e0.id} className="border-b border-slate-100">
                  <td className="px-3 py-1 sticky left-0 z-[1] bg-white border-r border-slate-100 whitespace-nowrap">
                    {(e0.nom || '').toUpperCase()} {e0.prenom}
                    {e0.matricule && <span className="ml-1.5 text-mention text-slate-400">{e0.matricule}</span>}
                  </td>
                  {lues.flatMap(d => {
                    const e = d.etudiants.find(x => x.id === e0.id);
                    const ouvert = ouvertes.has(d.ue_num);
                    const nCols = (ouvert ? d.structure.reduce((n, c) => n + c.aas.length + 1, 0) : 0) + 3;
                    if (!e) return [<td key={`${d.ue_num}|x`} colSpan={nCols} className={`${cellule} border-l-2 border-slate-300 text-center text-slate-300`}>pas inscrit</td>];
                    const dec = decisionDe(e), D = DECISION[dec];
                    const ici = occupe === `${e.id}|${d.ue_num}`;
                    return [
                      ...(ouvert ? d.structure.flatMap(c => [
                        ...c.aas.map(a => {
                          const x = e.notes[`${c.cours_code}|${a}`];
                          const v = affiche(x);
                          return (
                            <td key={`${d.ue_num}|${c.cours_code}|${a}`} className={cellule}>
                              <input key={`${e.id}|${c.cours_code}|${a}|${d.session}|${v}`} defaultValue={v} className={champ} disabled={ici}
                                style={x?.note != null && x.note < 10 && !x.mention ? { color: 'var(--c-refuse)' } : undefined}
                                title={`${a} — ${c.cours_nom} : une note entre 0 et 20, NP, PP, ou vide pour effacer`}
                                onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); }}
                                onBlur={ev => { if (ev.target.value.trim() !== v) ecrire('/api/correction-ue/note', { cours_code: c.cours_code, aa_code: a, valeur: ev.target.value }, e.id, d.ue_num); }} />
                            </td>);
                        }),
                        <td key={`${d.ue_num}|${c.cours_code}|n`} className={`${cellule} text-center text-slate-500 tabular-nums`}>{affiche(e.cours[c.cours_code])}</td>,
                      ]) : []),
                      <td key={`${d.ue_num}|calc`} className={`${cellule} border-l-2 border-slate-300 text-center tabular-nums font-semibold`}
                        title={e.proposee ? `La délibération proposerait : ${DECISION[e.proposee]?.l || e.proposee}` : ''}>{fr(e.note_ue)}</td>,
                      <td key={`${d.ue_num}|note`} className={cellule}>
                        <input key={`${e.id}|pts|${e.points}`} defaultValue={fr(e.points)} className={champ} disabled={ici} title="Note de l’unité portée par l’inscription"
                          onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); }}
                          onBlur={ev => { if (ev.target.value.trim() !== fr(e.points)) ecrire('/api/correction-ue/decision', { points: ev.target.value }, e.id, d.ue_num); }} />
                      </td>,
                      <td key={`${d.ue_num}|dec`} className={`${cellule} text-center`}>
                        <button type="button" disabled={ici} onClick={() => ecrire('/api/correction-ue/decision', { decision: suivante(e) }, e.id, d.ue_num)}
                          title={`Cliquer : ${DECISION[suivante(e)]?.l || 'effacer la décision'}`}
                          className="min-w-[5.5rem] px-2.5 py-0.5 rounded-full text-mention font-bold border"
                          style={D ? { background: D.c, borderColor: D.c, color: '#fff' } : { borderColor: 'var(--c-filet, #D8DCE4)', color: '#94A3B8' }}>
                          {D ? D.l : '—'}
                        </button>
                      </td>,
                    ];
                  })}
                </tr>))}
            </tbody>
          </table>
          {!lignes.length && <p className="px-3 py-4 text-sm text-slate-400">Aucun inscrit.</p>}
        </div>)}
    </div>
  );
}

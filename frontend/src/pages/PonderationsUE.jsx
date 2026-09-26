import { useEffect, useMemo, useState } from 'react';
import { IconArrowsSplit, IconCheck, IconAlertTriangle, IconHistory, IconLock } from '@tabler/icons-react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import SchemaLiensAA from '../components/SchemaLiensAA.jsx';

/**
 * ORGANISATION → PONDÉRATIONS : le tableau de bord d'une UE, pour une année
 * (Charles, 25 septembre 2026 — maquette validée le même jour).
 *
 * Les poids se règlent ICI, dans l'axe de ce qu'on organise cette année, et
 * non plus dans Configuration : depuis 2.12.179 ils sont ANNUELS, et régler
 * 2026-2027 ne touche plus aux années délibérées.
 *
 * Trois zones, une seule source de vérité (le brouillon des points) :
 *   A. l'unité d'un coup d'œil — la part de chaque cours dans l'UE ;
 *   B. qui évalue quel acquis — une ligne par acquis, une colonne par cours,
 *      et la jauge du poids RÉEL de chaque acquis dans la note d'unité ;
 *   C. un cours et ses acquis — ses dix points, par pas de 0,5.
 *
 * Les années reprises des classeurs (avant 2026-2027) se lisent sans se
 * modifier : leurs délibérations sont tenues.
 */
const ANNEE_PERIODES = '2026-2027';
const TEINTES = ['#1F6F8B', '#A0602A', '#6E48A6', '#2F7D5B', '#9D4A38', '#4B5F8A', '#8A6A1F', '#3E6E6E'];
const PEUT_REGLER = ['admin', 'editeur', 'coordination'];
const fr = (n, d = 1) => Number(n || 0).toLocaleString('fr-BE', { maximumFractionDigits: d });
const anneeAvant = a => { const m = /^(\d{4})-(\d{4})$/.exec(a || ''); return m ? `${+m[1] - 1}-${+m[2] - 1}` : null; };

async function lire(url) {
  const r = await fetch(url, { headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Lecture refusée (${r.status})`);
  return j;
}
async function ecrire(url, corps, method = 'PUT') {
  const r = await fetch(url, { method, headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(corps) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Refusé (${r.status})`);
  return j;
}

function Tuile({ valeur, libelle, precision, ton = 'neutre' }) {
  const rail = { vert: '#3E7D5E', ocre: '#B0701A', brique: '#9D4A38', marine: '#1B2B4B', neutre: '#D8DCE4' }[ton];
  return (
    <div className="bg-white rounded-carte border border-slate-200 px-3 py-2.5" style={{ borderLeft: `3px solid ${rail}` }}>
      <div className="text-[17px] font-bold text-iip-blue tabular-nums">{valeur}</div>
      <div className="text-[12px] text-slate-600">{libelle}</div>
      {precision && <div className="text-[11px] text-slate-400 mt-0.5">{precision}</div>}
    </div>
  );
}

function Zone({ lettre, titre, sous, children, droite }) {
  return (
    <section className="rounded-carte border border-slate-200 p-3.5 space-y-3 min-w-0">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className="w-[22px] h-[22px] rounded-full bg-[#C9A84C] text-iip-blue text-[12px] font-bold grid place-items-center flex-none">{lettre}</span>
        <h3 className="text-[15px] font-semibold text-iip-blue">{titre}</h3>
        {sous && <span className="text-[12px] text-slate-400">{sous}</span>}
        {droite && <span className="ml-auto">{droite}</span>}
      </div>
      {children}
    </section>
  );
}

export default function PonderationsUE() {
  const annee = getAnnee();
  const role = getUser?.()?.role;
  const passee = annee < ANNEE_PERIODES;
  const peutRegler = PEUT_REGLER.includes(role) && !passee;

  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [ues, setUes] = useState([]);
  const [ue, setUe] = useState(null);
  const [structure, setStructure] = useState(null);
  const [liens, setLiens] = useState(null);
  const [brouillon, setBrouillon] = useState({});      // cours → { aa: poids }
  const [coursActif, setCoursActif] = useState(null);
  const [aaSuivi, setAaSuivi] = useState(null);
  const [base, setBase] = useState('periodes');
  const [poidsSaisis, setPoidsSaisis] = useState({});   // cours → %
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [trace, setTrace] = useState(false);

  useEffect(() => {
    lire('/api/ref/sections').then(l => {
      const t = Array.isArray(l) ? l : [];
      setSections(t);
      if (t.length && !section) setSection((t.find(s => s.code === 'TIM') || t[0]).code);
    }).catch(e => setErreur(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!section) return;
    setUe(null); setStructure(null); setLiens(null);
    lire(`/api/acquis/sections/${encodeURIComponent(section)}/ues?annee=${encodeURIComponent(annee)}`)
      .then(l => { setUes(Array.isArray(l) ? l : []); if (l?.length) setUe(l[0].ue_num); })
      .catch(e => setErreur(e.message));
  }, [section, annee]);

  async function charger(n = ue) {
    if (!n) return;
    setErreur(null);
    try {
      const q = `?annee=${encodeURIComponent(annee)}`;
      const [st, li] = await Promise.all([lire(`/api/acquis/ue/${n}/structure${q}`), lire(`/api/acquis/ue/${n}/liens${q}`)]);
      setStructure(st); setLiens(li);
      const b = {};
      for (const c of li.cours) b[c.cours_code] = {};
      for (const l of li.liens) (b[l.cours_code] ||= {})[l.aa_code] = Number(l.poids);
      setBrouillon(b);
      setBase(st.base_poids_cours || 'periodes');
      setPoidsSaisis(Object.fromEntries(st.cours.map(c => [c.cours_code, Math.round(c.poids_cours ?? 0)])));
      setCoursActif(c0 => (li.cours.some(c => c.cours_code === c0) ? c0 : li.cours[0]?.cours_code || null));
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(ue); /* eslint-disable-next-line */ }, [ue, annee]);

  // ── Ce qui se calcule sur le brouillon ────────────────────────────────────
  const cours = liens?.cours || [];
  const acquis = liens?.acquis || [];
  const evalue = c => !c.non_evalue && String(c.ct_pp || '').toUpperCase() !== 'Z';
  const coursEval = cours.filter(evalue);
  const poidsCoursDe = useMemo(() => {
    const m = {};
    for (const c of structure?.cours || []) m[c.cours_code] = c.poids_cours ?? 0;
    return m;
  }, [structure]);
  const somme = code => Object.values(brouillon[code] || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const pasJuste = code => Object.values(brouillon[code] || {}).some(v => v && !Number.isInteger(Number(v) * 2));
  const coursJuste = code => Math.abs(somme(code) - 10) < 1e-9 && !pasJuste(code);
  const teinte = code => TEINTES[Math.max(0, acquis.findIndex(a => a.aa_code === code)) % TEINTES.length];
  // Le poids RÉEL d'un acquis dans la note d'unité : son poids dans chaque
  // cours, rapporté aux points du cours, multiplié par le poids du cours.
  const poidsReel = aa => coursEval.reduce((s, c) => {
    const t = somme(c.cours_code);
    return s + (t ? (poidsCoursDe[c.cours_code] || 0) / 100 * ((brouillon[c.cours_code]?.[aa] || 0) / t) : 0);
  }, 0);
  const saved = useMemo(() => {
    const b = {};
    for (const l of liens?.liens || []) (b[l.cours_code] ||= {})[l.aa_code] = Number(l.poids);
    return b;
  }, [liens]);
  const modifie = code => JSON.stringify(Object.entries(brouillon[code] || {}).filter(([, v]) => v).sort())
    !== JSON.stringify(Object.entries(saved[code] || {}).filter(([, v]) => v).sort());
  const nbReliés = acquis.filter(a => coursEval.some(c => brouillon[c.cours_code]?.[a.aa_code])).length;

  const poser = (code, aa, v) => {
    setMessage(null);
    setBrouillon(b => ({ ...b, [code]: { ...(b[code] || {}), [aa]: v === '' ? 0 : Number(String(v).replace(',', '.')) } }));
  };

  async function enregistrerCours(code) {
    setErreur(null);
    try {
      await ecrire('/api/acquis/ponderations', { ue_num: ue, cours_code: code, annee,
        ponderations: acquis.map(a => ({ aa_code: a.aa_code, poids: brouillon[code]?.[a.aa_code] || 0 })) });
      setMessage(`Points du cours ${code} enregistrés pour ${annee}.`);
      await charger();
    } catch (e) { setErreur(e.message); }
  }
  async function enregistrerBase() {
    setErreur(null);
    try {
      await ecrire(`/api/acquis/ue/${ue}/poids-cours`, base === 'periodes'
        ? { annee, mode: 'periodes' } : { annee, mode: 'saisi', poids: poidsSaisis });
      setMessage(base === 'periodes' ? 'Le poids des cours suit les périodes du dossier pédagogique.'
        : 'Poids des cours saisis pour cette UE et cette année.');
      await charger();
    } catch (e) { setErreur(e.message); }
  }
  const avant = anneeAvant(annee);
  async function reprendre() {
    setErreur(null);
    try {
      const sim = await ecrire(`/api/acquis/ue/${ue}/reprendre`, { annee, source: avant, simulation: true }, 'POST');
      if (!sim.points) { setErreur(`L'UE ${ue} ne porte aucun point en ${avant} : rien à reprendre.`); return; }
      if (!window.confirm(`Reprendre les points de ${avant} pour l'UE ${ue} ?\n\n`
        + `${sim.points} point(s) d'acquis${sim.poids_cours ? ` et ${sim.poids_cours} poids de cours` : ''} seront recopiés sur ${annee}.`
        + (sim.remplaces ? `\nIls remplacent les ${sim.remplaces} point(s) déjà posés en ${annee}.` : ''))) return;
      await ecrire(`/api/acquis/ue/${ue}/reprendre`, { annee, source: avant, simulation: false }, 'POST');
      setMessage(`Points repris de ${avant}.`);
      await charger();
    } catch (e) { setErreur(e.message); }
  }

  const ueActive = ues.find(u => u.ue_num === ue);
  const totalPer = coursEval.reduce((s, c) => s + Number(c.cours_per || 0), 0);
  const sommeSaisis = coursEval.reduce((s, c) => s + (Number(poidsSaisis[c.cours_code]) || 0), 0);
  const baseModifiee = base !== (structure?.base_poids_cours || 'periodes')
    || (base === 'saisi' && coursEval.some(c => Math.round(poidsCoursDe[c.cours_code] || 0) !== Number(poidsSaisis[c.cours_code])));
  const coursC = cours.find(c => c.cours_code === coursActif);

  return (
    <div className="p-4 space-y-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-semibold text-iip-blue mr-auto">Pondérations · {annee}</h2>
        <select value={section} onChange={e => setSection(e.target.value)} className="controle" aria-label="Section">
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <select value={ue || ''} onChange={e => setUe(Number(e.target.value))} className="controle max-w-[26rem]" aria-label="Unité">
          {ues.map(u => <option key={u.ue_num} value={u.ue_num}>{u.ue_num} — {u.ue_nom}{u.pret ? '' : ' ⚠'}</option>)}
        </select>
        {peutRegler && ue && (
          <>
            <button className="bouton" onClick={reprendre} title={`Recopier les points de ${avant} sur ${annee}`}>
              <IconHistory size={14} /> Reprendre de {avant}
            </button>
            <button className="bouton" onClick={() => setTrace(true)} title="Relier les acquis aux cours en traçant les liens">
              <IconArrowsSplit size={14} /> Relier au tracé
            </button>
          </>
        )}
      </div>

      {passee && (
        <p className="text-[12px] text-slate-600 flex items-center gap-1.5">
          <IconLock size={14} className="text-slate-400" />
          {annee} est une année reprise des classeurs, dont les délibérations sont tenues : ses poids se lisent ici, ils ne se modifient pas.
        </p>
      )}
      {erreur && <div className="carte p-2.5 text-[12px] text-[#9D4A38] flex items-start gap-1.5"><IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}</div>}
      {message && <div className="text-[12px] text-[#3E7D5E] flex items-center gap-1.5"><IconCheck size={14} />{message}</div>}

      {!ues.length && section && <p className="text-[13px] text-slate-400">Aucune unité pour {section} en {annee}.</p>}
      {ue && structure && liens && (
        <>
          {/* ── A ─────────────────────────────────────────────────────── */}
          <Zone lettre="A" titre="L'unité d'un coup d'œil" sous={`${ue} — ${ueActive?.ue_nom || liens.ue_nom || ''}`}>
            <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
              <Tuile valeur={`${coursEval.length} / ${cours.length}`} libelle="cours évalués"
                precision={cours.length - coursEval.length ? `${cours.length - coursEval.length} « pas évalué » ou activité Z` : 'aucun cours écarté'}
                ton={coursEval.length ? 'vert' : 'brique'} />
              <Tuile valeur={`${nbReliés} / ${acquis.length}`} libelle="acquis reliés à un cours"
                precision={nbReliés < acquis.length ? 'un acquis sans cours n’est évalué nulle part' : 'chaque acquis est évalué'}
                ton={liens.epreuve_integree ? 'neutre' : nbReliés === acquis.length && acquis.length ? 'vert' : 'ocre'} />
              <Tuile valeur={`${coursEval.filter(c => coursJuste(c.cours_code)).length} / ${coursEval.length}`} libelle="cours à 10 points"
                precision={coursEval.filter(c => !coursJuste(c.cours_code)).map(c => `${c.cours_code} : ${fr(somme(c.cours_code))}`).join(' · ') || 'tous répartis'}
                ton={liens.epreuve_integree ? 'neutre' : coursEval.every(c => coursJuste(c.cours_code)) ? 'vert' : 'ocre'} />
              <Tuile valeur={structure.base_poids_cours === 'saisi' ? 'Poids saisis' : 'Périodes'} libelle="base du poids des cours"
                precision={structure.base_poids_cours === 'saisi' ? `exception posée pour ${annee}` : `dossier pédagogique · ${totalPer} périodes`} ton="marine" />
            </div>

            {liens.epreuve_integree ? (
              <p className="text-[12px] text-violet-800 bg-violet-50 border border-violet-200 rounded-champ px-2.5 py-1.5">
                Épreuve intégrée : les acquis se pèsent pour l'unité, sans cours. Leur poids se règle au tracé (« Relier au tracé »).
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="inline-flex rounded-champ border border-slate-300 overflow-hidden" role="group" aria-label="Base du poids des cours">
                    {[['periodes', 'Poids = périodes du DP'], ['saisi', 'Poids saisis (exception)']].map(([v, l], i) => (
                      <button key={v} disabled={!peutRegler} onClick={() => setBase(v)}
                        className={`px-2.5 py-1 font-semibold ${i ? 'border-l border-slate-300' : ''} ${base === v ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'} disabled:cursor-default`}>{l}</button>
                    ))}
                  </span>
                  <span className="text-slate-400">Pour {annee} seulement ; les autres années gardent les leurs.</span>
                  {/* LE BOUTON GARDE SA PLACE (Charles, 26 septembre 2026 : « quand je
                      clique, la fenêtre bouge ») : il paraissait au premier clic et
                      poussait la rangée. Il est toujours là, invisible tant que rien
                      n'a changé. */}
                  {peutRegler && (
                    <button className={`bouton bouton-fort ml-auto ${baseModifiee ? '' : 'invisible'}`}
                      onClick={enregistrerBase} tabIndex={baseModifiee ? 0 : -1}
                      disabled={!baseModifiee || (base === 'saisi' && sommeSaisis !== 100)}>
                      Enregistrer la base{base === 'saisi' ? ` (${sommeSaisis} %)` : ''}
                    </button>
                  )}
                </div>
                <div className="flex h-10 rounded-champ overflow-hidden border border-slate-200" role="img"
                  aria-label={coursEval.map(c => `${c.cours_code} ${fr(poidsCoursDe[c.cours_code], 0)} %`).join(', ')}>
                  {coursEval.map((c, i) => {
                    const p = base === 'saisi' ? Number(poidsSaisis[c.cours_code]) || 0 : poidsCoursDe[c.cours_code] || 0;
                    return (
                      <div key={c.cours_code} style={{ width: `${p}%`, background: ['#1B2B4B', '#3A5580', '#8FA3C2', '#5C6F91', '#2A4068'][i % 5], color: i % 5 === 2 ? '#1B2B4B' : '#fff' }}
                        className="flex items-center px-2 text-[12px] font-semibold whitespace-nowrap overflow-hidden min-w-0">
                        {c.cours_code} · {fr(p, 0)} %
                      </div>
                    );
                  })}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {cours.map(c => (
                    <div key={c.cours_code} className="text-[12px] text-slate-600 min-w-0">
                      <div><b className="text-slate-800">{c.cours_code}</b> · {c.cours_per ?? '—'} périodes{c.ct_pp ? ` · ${c.ct_pp}` : ''}</div>
                      <div className="truncate" title={c.cours_nom}>{c.cours_nom}</div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {!evalue(c)
                          ? <span className="text-[11px] font-semibold px-1.5 rounded-full border border-slate-300 text-slate-500">{c.non_evalue ? 'pas évalué' : 'activité Z'}</span>
                          : <span className={`text-[11px] font-semibold px-1.5 rounded-full border ${coursJuste(c.cours_code) ? 'border-[#BCD6C8] text-[#3E7D5E]' : 'border-[#E6CFA8] text-[#B0701A]'}`}>{fr(somme(c.cours_code))} / 10</span>}
                        {base === 'saisi' && evalue(c) && (
                          <label className="flex items-center gap-1 text-[11px]">
                            <input type="number" min="0" max="100" step="1" value={poidsSaisis[c.cours_code] ?? ''} disabled={!peutRegler}
                              onChange={e => setPoidsSaisis(p => ({ ...p, [c.cours_code]: e.target.value === '' ? '' : Number(e.target.value) }))}
                              className="w-14 border border-slate-300 rounded-champ px-1.5 py-0.5 text-right tabular-nums" aria-label={`Poids de ${c.cours_code}, en pour cent`} /> %
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Zone>

          {!liens.epreuve_integree && (
            <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
              {/* ── B ─────────────────────────────────────────────────── */}
              <Zone lettre="B" titre="Qui évalue quel acquis" sous="le poids dans le cours, sur 10 · clic sur un acquis : ses liens">
                <div className="overflow-x-auto rounded-champ border border-slate-200 bg-white">
                  <table className="w-full border-separate border-spacing-0 text-[12px]" style={{ minWidth: 260 + coursEval.length * 86 }}>
                    <thead>
                      <tr>
                        <th className="tab-entete sticky left-0 z-10 text-left px-2.5 py-2 min-w-[240px]">Acquis · poids réel dans l'UE</th>
                        {coursEval.map(c => (
                          <th key={c.cours_code} className="tab-entete px-2 py-2 text-center">
                            <div className="text-slate-800">{c.cours_code}</div>
                            <div className="font-normal text-slate-500">{fr(poidsCoursDe[c.cours_code], 0)} %</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {acquis.map(a => {
                        const t = teinte(a.aa_code);
                        const reel = poidsReel(a.aa_code) * 100;
                        const eteint = aaSuivi && aaSuivi !== a.aa_code;
                        return (
                          <tr key={a.aa_code} className={eteint ? 'opacity-35' : ''}>
                            <td className="sticky left-0 z-[1] bg-white border-t border-slate-100 px-2.5 py-1.5 cursor-pointer"
                              onClick={() => setAaSuivi(s => (s === a.aa_code ? null : a.aa_code))}>
                              <div className="font-bold" style={{ color: t }}>{a.aa_code}</div>
                              <div className="text-slate-500 truncate max-w-[260px]" title={a.description}>{a.description}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="h-1.5 flex-1 rounded bg-slate-100 overflow-hidden">
                                  <div className="h-full rounded" style={{ width: `${Math.min(100, reel * 2)}%`, background: t }} />
                                </div>
                                <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                                  {fr(reel)} % · {coursEval.filter(c => brouillon[c.cours_code]?.[a.aa_code]).length} cours
                                </span>
                              </div>
                            </td>
                            {coursEval.map(c => {
                              const v = brouillon[c.cours_code]?.[a.aa_code] || 0;
                              return (
                                <td key={c.cours_code} className="border-t border-slate-100 px-1.5 py-1.5 text-center">
                                  {peutRegler ? (
                                    v ? (
                                      <input type="number" min="0" max="10" step="0.5" value={v}
                                        onChange={e => poser(c.cours_code, a.aa_code, e.target.value)}
                                        aria-label={`Points de ${a.aa_code} dans ${c.cours_code}`}
                                        className="w-14 h-7 rounded-champ border-[1.5px] text-center font-bold tabular-nums bg-white"
                                        style={{ borderColor: t, color: t }} />
                                    ) : (
                                      <button onClick={() => poser(c.cours_code, a.aa_code, 1)}
                                        aria-label={`Relier ${a.aa_code} à ${c.cours_code}`}
                                        className="w-14 h-7 rounded-champ border-[1.5px] border-dashed border-slate-300 text-slate-400 hover:border-slate-400">+</button>
                                    )
                                  ) : (
                                    <span className="font-bold tabular-nums" style={{ color: v ? t : '#cbd5e1' }}>{v ? fr(v) : '·'}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="tab-entete sticky left-0 z-10 px-2.5 py-1.5 text-slate-600">Points répartis dans le cours</td>
                        {coursEval.map(c => (
                          <td key={c.cours_code} className="tab-entete px-1.5 py-1.5 text-center">
                            <div className={`font-bold tabular-nums ${coursJuste(c.cours_code) ? 'text-slate-700' : 'text-[#B0701A]'}`}>{fr(somme(c.cours_code))} / 10</div>
                            {peutRegler && modifie(c.cours_code) && (
                              <button className="text-[11px] font-semibold text-iip-blue underline disabled:text-slate-400 disabled:no-underline"
                                disabled={!coursJuste(c.cours_code)} onClick={() => enregistrerCours(c.cours_code)}
                                title={coursJuste(c.cours_code) ? '' : 'Dix points, par pas de 0,5, avant d’enregistrer'}>Enregistrer</button>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-[11px] text-slate-400">
                  Avec beaucoup de cours, le tableau défile vers la droite ; la colonne des acquis reste en place.
                  Une case pointillée relie l'acquis au cours ; mettre 0 le délie.
                </p>
              </Zone>

              {/* ── C ─────────────────────────────────────────────────── */}
              <Zone lettre="C" titre="Un cours et ses acquis" sous="ses dix points, par pas de 0,5">
                <div className="flex gap-4 border-b border-slate-200 flex-wrap" role="tablist">
                  {coursEval.map(c => (
                    <button key={c.cours_code} role="tab" aria-selected={coursActif === c.cours_code}
                      onClick={() => setCoursActif(c.cours_code)}
                      className={`onglet-page ${coursActif === c.cours_code ? 'onglet-page-actif' : ''}`}>{c.cours_code}</button>
                  ))}
                </div>
                {coursC && evalue(coursC) && (
                  <div className="space-y-2">
                    <div className="flex justify-between gap-2 flex-wrap text-[12px]">
                      <b className="text-iip-blue">{coursC.cours_code} · {coursC.cours_nom}</b>
                      <span className="text-slate-400 tabular-nums">{coursC.cours_per ?? '—'} périodes · {fr(poidsCoursDe[coursC.cours_code], 0)} % de l'UE</span>
                    </div>
                    {acquis.map(a => {
                      const v = brouillon[coursC.cours_code]?.[a.aa_code] || 0;
                      const t = teinte(a.aa_code);
                      return (
                        <div key={a.aa_code} className="grid grid-cols-[72px_1fr_76px] gap-2 items-center">
                          <span className="font-bold text-[12px]" style={{ color: t }}>{a.aa_code}</span>
                          <div className="h-5 rounded bg-slate-100 overflow-hidden"><div className="h-full rounded" style={{ width: `${v * 10}%`, background: t }} /></div>
                          {peutRegler ? (
                            <input type="number" min="0" max="10" step="0.5" value={v || ''} placeholder="0"
                              onChange={e => poser(coursC.cours_code, a.aa_code, e.target.value)}
                              aria-label={`Points de ${a.aa_code} dans ${coursC.cours_code}`}
                              className="w-full border border-slate-300 rounded-champ px-1.5 py-0.5 text-right tabular-nums text-[12px]" />
                          ) : <span className="text-right font-bold tabular-nums text-[12px]">{fr(v)} <span className="font-normal text-slate-400">/ 10</span></span>}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                      <span className="text-[12px] tabular-nums">Total : <b>{fr(somme(coursC.cours_code))} / 10</b>
                        {pasJuste(coursC.cours_code) && <span className="text-[#B0701A]"> · par pas de 0,5</span>}</span>
                      {coursJuste(coursC.cours_code)
                        ? <span className="text-[11px] font-semibold px-1.5 rounded-full border border-[#BCD6C8] text-[#3E7D5E]">réparti</span>
                        : <span className="text-[11px] font-semibold px-1.5 rounded-full border border-[#E6CFA8] text-[#B0701A]">
                            {somme(coursC.cours_code) > 10 ? `dépasse de ${fr(somme(coursC.cours_code) - 10)}` : `manque ${fr(10 - somme(coursC.cours_code))}`} point</span>}
                      {peutRegler && modifie(coursC.cours_code) && (
                        <button className="bouton bouton-fort" disabled={!coursJuste(coursC.cours_code)}
                          onClick={() => enregistrerCours(coursC.cours_code)}>Enregistrer {coursC.cours_code}</button>
                      )}
                    </div>
                  </div>
                )}
              </Zone>
            </div>
          )}
        </>
      )}

      {trace && ue && (
        <SchemaLiensAA ueNum={ue} annee={annee} onClose={() => { setTrace(false); charger(); }} onEnregistre={() => charger()} />
      )}
    </div>
  );
}

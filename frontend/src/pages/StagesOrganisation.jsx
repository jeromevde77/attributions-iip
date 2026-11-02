/* LA GESTION DES STAGES (3.5.067, Charles, 2 novembre 2026 : « dans Organisation, une vraie gestion des stages » ; tranché :
 * vue d'ensemble, pièces et jalons manquants, affectation en lot, lieux et places ; AESI proposés d'après les UE de stage ;
 * coordination + secrétariat ; lot 1 = vue, pièces, lot, propositions). Organisation → Stages. Quatre faces :
 *   Vue d'ensemble — tous les stages de l'année, la ligne du temps par section, filtres ;
 *   Pièces manquantes — ce qui manque avant le début (art. 51 et 55), l'urgence, « Relancer » l'étudiant ;
 *   Affecter en lot — une UE de stage, ses inscrits cochés, le même lieu, les mêmes dates, le même professeur ;
 *   Propositions — un stage par inscrit d'une UE de stage qui n'en a pas, aux dates de son organisation.
 * Le stage de chaque étudiant se retouche dans sa fiche (onglet Stages). Serveur : routes/stages.js. */
import { useEffect, useMemo, useState } from 'react';
import { IconSend, IconCheck } from '@tabler/icons-react';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr, PastilleEtat, TuileEtat } from '../components/ui.jsx';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const STATUTS = { prevu: 'Prévu', autorise: 'Autorisé', en_cours: 'En cours', termine: 'Terminé', rompu: 'Rompu', annule: 'Annulé' };
const appel = (url, o = {}) => fetch(url, { ...o, headers: { ...authHeaders(), ...(o.body ? { 'Content-Type': 'application/json' } : {}) } })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; });
const plus = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);

export default function StagesOrganisation({ annee }) {
  const [face, setFace] = useState('ensemble');
  const [d, setD] = useState(null);
  const [nProp, setNProp] = useState(0);
  const charger = () => {
    appel(`/api/stages?annee=${encodeURIComponent(annee)}`).then(setD).catch(e => setD({ erreur: e.message }));
    appel(`/api/stages/propositions?annee=${encodeURIComponent(annee)}`).then(l => setNProp(l.length)).catch(() => setNProp(0));
  };
  useEffect(() => { if (annee) charger(); }, [annee]);
  const faces = [['ensemble', 'Vue d’ensemble'], ['pieces', `Pièces manquantes${d?.synthese?.incomplets ? ` (${d.synthese.incomplets})` : ''}`], ['lot', 'Affecter en lot'], ['propositions', `Propositions${nProp ? ` (${nProp})` : ''}`]];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="titre-ecran">Stages</h1>
        <p className="text-second text-slate-500">Les stages de {annee} : qui est en stage, où et quand ; ce qui manque avant de commencer (art. 51 et 55) ; l’affectation en lot.</p>
      </div>
      <div className="flex flex-nowrap gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--menu-bord)' }}>
        {faces.map(([k, l]) => <button key={k} onClick={() => setFace(k)} className={`onglet-page ${face === k ? 'onglet-page-actif' : ''}`}>{l}</button>)}
      </div>
      {!d ? <div className="text-sm text-slate-500">Chargement…</div> : d.erreur ? <div className="text-sm text-red-700">{d.erreur}</div> : <>
        {face === 'ensemble' && <Ensemble d={d} />}
        {face === 'pieces' && <Pieces d={d} recharger={charger} />}
        {face === 'lot' && <Lot annee={annee} recharger={charger} />}
        {face === 'propositions' && <Propositions annee={annee} recharger={charger} />}
      </>}
    </div>
  );
}

function Ensemble({ d }) {
  const [section, setSection] = useState('');
  const [statut, setStatut] = useState('');
  const [q, setQ] = useState('');
  const sections = [...new Set(d.stages.map(s => s.section).filter(Boolean))].sort();
  const liste = d.stages.filter(s => (!section || s.section === section) && (!statut || s.statut === statut)
    && (!q || `${s.etud_nom} ${s.etud_prenom} ${s.lieu_nom || ''} ${s.ue_nom || ''}`.toLowerCase().includes(q.toLowerCase())));
  const sy = d.synthese;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <TuileEtat valeur={sy.total} libelle="stages" />
        <TuileEtat etat={sy.en_cours ? 'disponible' : 'neutre'} valeur={sy.en_cours} libelle="en cours" />
        <TuileEtat etat={sy.sans_lieu ? 'surveiller' : 'neutre'} valeur={sy.sans_lieu} libelle="sans lieu" />
        <TuileEtat etat={sy.incomplets ? 'surveiller' : 'reussi'} valeur={sy.incomplets} libelle="incomplets" />
        <TuileEtat etat={sy.a_relancer ? 'corriger' : 'reussi'} valeur={sy.a_relancer} libelle="à relancer d’urgence" />
      </div>
      <LigneStages stages={d.stages} annee={d.annee} />
      <div className="carte overflow-hidden">
        <EnteteCarte titre={`${liste.length} stage(s)`} sous="Le stage d’un étudiant se retouche dans sa fiche, onglet Stages.">
          <input className="controle border border-slate-300 rounded-champ text-sm w-48" placeholder="Étudiant, lieu, UE…" value={q} onChange={e => setQ(e.target.value)} />
          <select className="controle border border-slate-300 rounded-champ text-sm" value={section} onChange={e => setSection(e.target.value)}><option value="">Toutes les sections</option>{sections.map(s => <option key={s}>{s}</option>)}</select>
          <select className="controle border border-slate-300 rounded-champ text-sm" value={statut} onChange={e => setStatut(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </EnteteCarte>
        <Tableau dense>
          <TableauEntete><Th>Étudiant</Th><Th>Section</Th><Th>UE</Th><Th>Lieu</Th><Th>Du</Th><Th>Au</Th><Th>Professeur de stage</Th><Th>Statut</Th><Th>Il manque</Th></TableauEntete>
          <tbody>{liste.map(s => (
            <Tr key={s.id}>
              <Td><a className="underline-offset-2 hover:underline" href={`/etudiants?q=${encodeURIComponent(s.etud_nom)}`}>{String(s.etud_nom).toUpperCase()} {s.etud_prenom}</a></Td>
              <Td ton="secondaire">{s.section || '—'}</Td><Td ton="secondaire">{s.ue_num ? `UE ${s.ue_num}` : '—'}</Td>
              <Td>{s.lieu_nom || <span className="text-slate-400">—</span>}</Td><Td>{fr(s.date_debut)}</Td><Td>{fr(s.date_fin)}</Td>
              <Td ton="secondaire">{s.professeur || '—'}</Td><Td>{STATUTS[s.statut] || s.statut}</Td>
              <Td>{s.manquent?.length ? <PastilleEtat etat={s.urgence === 'rouge' ? 'corriger' : 'surveiller'} title={s.manquent.join(', ')}>{s.manquent.length} élément(s)</PastilleEtat> : <span className="text-slate-400">—</span>}</Td>
            </Tr>))}</tbody>
        </Tableau>
      </div>
    </div>
  );
}

/* La ligne du temps : par section, le nombre d'étudiants en stage chaque semaine. */
function LigneStages({ stages, annee }) {
  const sem = useMemo(() => {
    const a1 = Number(String(annee).split('-')[0]); const d = `${a1}-08-15`; const w = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
    const l0 = w === 0 ? d : plus(d, 7 - w); return Array.from({ length: 52 }, (_, i) => plus(l0, 7 * i));
  }, [annee]);
  const sections = [...new Set(stages.map(s => s.section || '—'))].sort();
  if (!stages.some(s => s.date_debut)) return null;
  const compte = (sec, l) => stages.filter(s => (s.section || '—') === sec && s.date_debut && s.date_debut <= plus(l, 6) && (s.date_fin || s.date_debut) >= l && !['annule', 'rompu'].includes(s.statut)).length;
  const grille = sections.map(sec => sem.map(l => compte(sec, l)));
  const max = Math.max(1, ...grille.flat());
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre="Qui est en stage, quand" sous="Le nombre d’étudiants en stage chaque semaine, par section." />
      <div className="px-3 py-3 overflow-x-auto"><div className="min-w-[760px] space-y-1">
        <div className="grid" style={{ gridTemplateColumns: '8rem repeat(52, minmax(0,1fr))' }}><div />
          {sem.map((l, i) => { const m = Number(plus(l, 3).slice(5, 7)); const prec = i ? Number(plus(sem[i - 1], 3).slice(5, 7)) : null; return <div key={l} className="text-mention text-slate-500 whitespace-nowrap overflow-visible">{m !== prec ? MOIS[m - 1] : ''}</div>; })}</div>
        {sections.map((sec, k) => (
          <div key={sec} className="grid items-end" style={{ gridTemplateColumns: '8rem repeat(52, minmax(0,1fr))' }}>
            <div className="text-second text-slate-600 pr-2 truncate">{sec}</div>
            {grille[k].map((n, i) => <div key={i} title={`${sec} · semaine du ${fr(sem[i])} · ${n} en stage`} className="relative h-6 mx-px">
              {n > 0 && <span className="absolute inset-x-0 bottom-0 rounded-t-[2px]" style={{ height: `${Math.max(15, (n / max) * 100)}%`, background: 'var(--c-serie_5, #4FA64A)' }} />}</div>)}
          </div>))}
      </div></div>
    </div>
  );
}

function Pieces({ d, recharger }) {
  const liste = d.stages.filter(s => s.manquent?.length).sort((a, b) => (a.urgence === 'rouge' ? 0 : 1) - (b.urgence === 'rouge' ? 0 : 1) || String(a.date_debut || '9').localeCompare(String(b.date_debut || '9')));
  const relancer = async s => {
    if (!(await demander(`Envoyer à ${String(s.etud_nom).toUpperCase()} ${s.etud_prenom} (adresse d’école) la liste des pièces qui manquent ?`))) return;
    try { const r = await appel(`/api/stages/${s.id}/relancer`, { method: 'POST' }); informer({ message: `Relance envoyée à ${r.a} : ${r.pieces.join(', ')}.` }); recharger(); }
    catch (e) { informer({ message: e.message }); }
  };
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre="Ce qui manque avant de commencer" sous="Aucun stage ne commence sans autorisation écrite et convention signée (art. 51) ; casier (modèle 2, moins de six mois) avant le premier dixième de l’UE, médecine du travail et vaccination (art. 55). En rouge : début dans 14 jours ou moins, ou premier dixième passé sans casier." />
      {!liste.length ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Rien ne manque : tous les stages à venir ont leurs pièces.</p> : (
        <Tableau dense>
          <TableauEntete><Th>Étudiant</Th><Th>Section</Th><Th>Lieu</Th><Th>Début</Th><Th>1/10 de l’UE</Th><Th>Il manque</Th><Th>Relancé</Th><Th /></TableauEntete>
          <tbody>{liste.map(s => (
            <Tr key={s.id}>
              <Td>{String(s.etud_nom).toUpperCase()} {s.etud_prenom}</Td><Td ton="secondaire">{s.section || '—'}</Td><Td>{s.lieu_nom || '—'}</Td>
              <Td>{s.urgence === 'rouge' ? <PastilleEtat etat="corriger">{fr(s.date_debut)}</PastilleEtat> : fr(s.date_debut)}</Td><Td ton="secondaire">{fr(s.dixieme)}</Td>
              <Td><span className="text-second">{s.manquent.join(' · ')}</span></Td><Td ton="secondaire">{s.relance_le ? fr(s.relance_le) : '—'}</Td>
              <Td align="droite"><button className="bouton px-2 py-0.5 text-second inline-flex items-center gap-1" onClick={() => relancer(s)}><IconSend size={13} /> Relancer</button></Td>
            </Tr>))}</tbody>
        </Tableau>)}
    </div>
  );
}

function Lot({ annee, recharger }) {
  const [choix, setChoix] = useState(null);
  const [lieux, setLieux] = useState([]);
  const [ue, setUe] = useState('');
  const [ins, setIns] = useState(null);
  const [coches, setCoches] = useState([]);
  const [v, setV] = useState({ lieu_id: '', date_debut: '', date_fin: '', professeur_id: '', maitre_stage: '', intitule: '' });
  const [plan, setPlan] = useState(null);
  useEffect(() => { appel(`/api/stages/choix?annee=${encodeURIComponent(annee)}`).then(setChoix).catch(e => setChoix({ erreur: e.message })); appel('/api/stages/lieux').then(l => setLieux(Array.isArray(l) ? l : l.lieux || [])).catch(() => {}); }, [annee]);
  useEffect(() => { setIns(null); setCoches([]); setPlan(null); if (ue) appel(`/api/stages/inscrits?annee=${encodeURIComponent(annee)}&ue_num=${ue}`).then(setIns).catch(e => setIns({ erreur: e.message })); }, [ue]);
  const org = o => { const x = ins?.organisations?.find(y => y.org === o); if (x) setV(w => ({ ...w, date_debut: x.du || '', date_fin: x.au || '' })); setCoches((ins?.inscrits || []).filter(i => (i.org || 1) === o).map(i => i.id)); };
  const corps = () => ({ annee, ue_num: Number(ue), etudiant_ids: coches, ...v, lieu_id: v.lieu_id ? Number(v.lieu_id) : '', professeur_id: v.professeur_id ? Number(v.professeur_id) : '' });
  const simuler = async () => { try { setPlan(await appel('/api/stages/lot', { method: 'POST', body: JSON.stringify(corps()) })); } catch (e) { informer({ message: e.message }); } };
  const ecrire = async () => { try { const r = await appel('/api/stages/lot', { method: 'POST', body: JSON.stringify({ ...corps(), ecrire: true }) }); informer({ message: `${r.ecrits} stage(s) écrits.` }); setPlan(null); recharger(); setUe(u => u); appel(`/api/stages/inscrits?annee=${encodeURIComponent(annee)}&ue_num=${ue}`).then(setIns); } catch (e) { informer({ message: e.message }); } };
  if (!choix) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (choix.erreur) return <div className="text-sm text-red-700">{choix.erreur}</div>;
  const champ = 'controle border border-slate-300 rounded-champ text-sm w-full';
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="carte overflow-hidden min-w-0">
        <EnteteCarte titre="1. L’unité et ses étudiants" sous="Cochez ceux qui reçoivent la même affectation. Une organisation coche les siens et reprend ses dates.">
          <select className="controle border border-slate-300 rounded-champ text-sm" value={ue} onChange={e => setUe(e.target.value)} aria-label="UE de stage">
            <option value="">— UE de stage —</option>{choix.ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} · {u.ue_nom} ({u.sections}) · {u.inscrits} inscrits</option>)}
          </select>
        </EnteteCarte>
        {!ue ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Choisissez une UE de stage.</p> : !ins ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Chargement…</p> : ins.erreur ? <p className="px-4 py-3 text-sm text-red-700 m-0">{ins.erreur}</p> : <>
          {ins.organisations.length > 1 && <div className="px-4 pt-3 flex flex-wrap gap-2 text-second">{ins.organisations.map(o => <button key={o.org} className="bouton px-2 py-0.5" onClick={() => org(o.org)}>Organisation {o.org} · {fr(o.du)} → {fr(o.au)}</button>)}</div>}
          <Tableau dense>
            <TableauEntete><Th><input type="checkbox" checked={ins.inscrits.length > 0 && coches.length === ins.inscrits.length} onChange={e => setCoches(e.target.checked ? ins.inscrits.map(i => i.id) : [])} aria-label="Tout cocher" /></Th><Th>Étudiant</Th><Th>Section</Th><Th>Org.</Th><Th>Stage</Th></TableauEntete>
            <tbody>{ins.inscrits.map(i => (
              <Tr key={i.id}><Td><input type="checkbox" checked={coches.includes(i.id)} onChange={e => setCoches(c => (e.target.checked ? [...c, i.id] : c.filter(x => x !== i.id)))} /></Td>
                <Td>{String(i.nom).toUpperCase()} {i.prenom}</Td><Td ton="secondaire">{i.section || '—'}</Td><Td ton="secondaire">{i.org || 1}</Td>
                <Td>{i.stage_id ? <PastilleEtat etat="disponible">existe</PastilleEtat> : <span className="text-slate-400">aucun</span>}</Td></Tr>))}</tbody>
          </Tableau>
        </>}
      </div>
      <div className="carte overflow-hidden self-start">
        <EnteteCarte titre="2. Ce qu’ils reçoivent" sous="Seuls les champs remplis s’écrivent ; un stage existant est complété." />
        <div className="px-4 py-3 space-y-2 text-sm">
          <label className="block">Lieu<select className={champ} value={v.lieu_id} onChange={e => setV({ ...v, lieu_id: e.target.value })}><option value="">—</option>{lieux.map(l => <option key={l.id} value={l.id}>{l.nom}{l.localite ? ` · ${l.localite}` : ''}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-2"><label className="block">Du<input type="date" className={champ} value={v.date_debut} onChange={e => setV({ ...v, date_debut: e.target.value })} /></label>
            <label className="block">Au<input type="date" className={champ} value={v.date_fin} onChange={e => setV({ ...v, date_fin: e.target.value })} /></label></div>
          <label className="block">Professeur de stage<select className={champ} value={v.professeur_id} onChange={e => setV({ ...v, professeur_id: e.target.value })}><option value="">—</option>{choix.professeurs.map(p => <option key={p.id} value={p.id}>{p.nom}{p.stage ? ' ★' : ''}</option>)}</select></label>
          <label className="block">Maître de stage (facultatif)<input className={champ} value={v.maitre_stage} onChange={e => setV({ ...v, maitre_stage: e.target.value })} /></label>
          <label className="block">Intitulé (facultatif)<input className={champ} value={v.intitule} onChange={e => setV({ ...v, intitule: e.target.value })} placeholder="3e année – Stage 5" /></label>
          <p className="text-mention text-slate-500 m-0">★ : attribué à une UE de stage cette année.</p>
          <div className="flex gap-2 pt-1"><button className="bouton" disabled={!coches.length} onClick={simuler}>Voir ce qui sera écrit</button>
            <button className="bouton bouton-fort inline-flex items-center gap-1" disabled={!plan} onClick={ecrire}><IconCheck size={14} /> Affecter</button></div>
          {plan && <div className="text-second space-y-0.5 pt-1">
            <div><b>{plan.plan.filter(x => x.geste === 'créer').length}</b> créé(s), <b>{plan.plan.filter(x => x.geste === 'compléter').length}</b> complété(s){plan.plan.some(x => x.refus) ? `, ${plan.plan.filter(x => x.refus).length} écarté(s)` : ''}.</div>
            {plan.plan.filter(x => x.refus).map(x => <div key={x.etudiant_id} className="text-[var(--c-refuse)]">{x.nom || x.etudiant_id} : {x.refus}</div>)}
          </div>}
        </div>
      </div>
    </div>
  );
}

function Propositions({ annee, recharger }) {
  const [l, setL] = useState(null);
  const [coches, setCoches] = useState([]);
  const charger = () => appel(`/api/stages/propositions?annee=${encodeURIComponent(annee)}`).then(x => { setL(x); setCoches(x.map(p => `${p.etudiant_id}|${p.ue_num}`)); }).catch(e => setL({ erreur: e.message }));
  useEffect(() => { charger(); }, [annee]);
  if (!l) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (l.erreur) return <div className="text-sm text-red-700">{l.erreur}</div>;
  const creer = async () => {
    if (!(await demander(`Créer ${coches.length} stage(s) aux dates de leur organisation ? Lieu et encadrant se complètent ensuite (Affecter en lot, ou la fiche).`))) return;
    try { const r = await appel('/api/stages/propositions', { method: 'POST', body: JSON.stringify({ annee, items: coches.map(k => { const [e, u] = k.split('|'); return { etudiant_id: Number(e), ue_num: Number(u) }; }) }) }); informer({ message: `${r.crees} stage(s) créé(s).` }); charger(); recharger(); }
    catch (e) { informer({ message: e.message }); }
  };
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre={`${l.length} stage(s) à créer d’après les UE de stage`} sous="Chaque inscrit d’une UE de stage qui n’a pas encore de stage pour elle, aux dates de son organisation (AESI : Toussaint–Noël, Carnaval–Pâques). Rien n’est écrit avant « Créer ».">
        <button className="bouton bouton-fort" disabled={!coches.length} onClick={creer}>Créer {coches.length}</button>
      </EnteteCarte>
      {!l.length ? <p className="px-4 py-3 text-sm text-slate-500 m-0">Chaque inscrit d’une UE de stage a déjà son stage.</p> : (
        <Tableau dense>
          <TableauEntete><Th><input type="checkbox" checked={coches.length === l.length} onChange={e => setCoches(e.target.checked ? l.map(p => `${p.etudiant_id}|${p.ue_num}`) : [])} aria-label="Tout cocher" /></Th><Th>Étudiant</Th><Th>Section</Th><Th>UE</Th><Th>Org.</Th><Th>Du</Th><Th>Au</Th></TableauEntete>
          <tbody>{l.map(p => { const k = `${p.etudiant_id}|${p.ue_num}`; return (
            <Tr key={k}><Td><input type="checkbox" checked={coches.includes(k)} onChange={e => setCoches(c => (e.target.checked ? [...c, k] : c.filter(x => x !== k)))} /></Td>
              <Td>{p.nom}</Td><Td ton="secondaire">{p.section || '—'}</Td><Td>UE {p.ue_num} · {p.ue_nom}</Td><Td ton="secondaire">{p.org}</Td><Td>{fr(p.du)}</Td><Td>{fr(p.au)}</Td></Tr>); })}</tbody>
        </Tableau>)}
    </div>
  );
}

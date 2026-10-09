import { useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle, IconWand, IconDeviceFloppy, IconUsersGroup } from '@tabler/icons-react';
import { api, authHeaders, getAnnee } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { passeRole } from '../lib/droits.js';
import { teinteCours, styleTuileCours } from '../lib/teinteCours.js';

/**
 * LES GROUPES COMMUNS (Charles, 9 octobre 2026 : « des TP par 4, par 6, par 8
 * dans plusieurs UE : je dois trouver des groupes communs pour mes horaires »).
 *
 * Une cohorte (section + bloc) se coupe en BRIQUES ; chaque groupe de chaque
 * activité est un assemblage fixe de briques. On range les étudiants dans les
 * briques (Lucie propose, on ajuste en glissant), puis « Remplir les groupes »
 * écrit, après simulation, tous les groupes de toutes les activités d'un coup.
 * Le moteur est lib/groupesCommuns.js. Les boutons sont en haut.
 */
const BLOCS = ['BA1', 'BA2', 'BA3'];
const cleG = g => `${g.num_organisation}|${g.groupe || ''}`;
const pgcd = (a, b) => (b ? pgcd(b, a % b) : a);
const ppcm = l => l.filter(n => n > 1).reduce((a, b) => a / pgcd(a, b) * b, 1);

export default function GroupesCommuns() {
  const annee = getAnnee();
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [bloc, setBloc] = useState('BA2');
  const [c, setC] = useState(null);                  // la cohorte telle que le serveur la rend
  const [reglages, setReglages] = useState({});      // clé → { nb_groupes, quadri, inclus }
  const [briques, setBriques] = useState({});        // etudiant_id → brique
  const [modifie, setModifie] = useState(false);
  const [simu, setSimu] = useState(null);
  const [glisse, setGlisse] = useState(null);
  const [erreur, setErreur] = useState(null);
  const peutEcrire = passeRole(['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'coordination', 'editeur']);

  useEffect(() => { api.sections().then(l => { const ls = Array.isArray(l) ? l : []; setSections(ls); if (!section && ls.some(s => s.code === 'TIM')) setSection('TIM'); }).catch(() => {}); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const charger = async () => {
    if (!section) return;
    setErreur(null); setSimu(null);
    const r = await fetch(`/api/etudiants/repartition-cours/communs?section=${encodeURIComponent(section)}&bloc=${bloc}&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
    const j = await r.json();
    if (!r.ok) { setErreur(j.error); setC(null); return; }
    setC(j); setBriques(j.briques || {}); setModifie(false);
    setReglages(Object.fromEntries(j.activites.map(a => [`${a.cours_code}#${a.activite_id}`, { nb_groupes: a.nb_groupes, quadri: a.quadri, inclus: a.inclus, ordre: a.groupes.map(cleG) }])));
  };
  useEffect(() => { charger(); }, [section, bloc]);   // eslint-disable-line react-hooks/exhaustive-deps

  const acts = useMemo(() => (c?.activites || []).map(a => {
    const r = reglages[`${a.cours_code}#${a.activite_id}`] || {};
    const parCle = new Map(a.groupes.map(g => [cleG(g), g]));
    const groupes = (r.ordre || []).map(k => parCle.get(k)).filter(Boolean);
    return { ...a, ...r, groupes: groupes.length === a.groupes.length ? groupes : a.groupes };
  }), [c, reglages]);
  const B = useMemo(() => ppcm(acts.filter(a => a.inclus).map(a => Number(a.nb_groupes) || 1)), [acts]);
  const regler = (a, k, v) => { setReglages(r => ({ ...r, [`${a.cours_code}#${a.activite_id}`]: { ...r[`${a.cours_code}#${a.activite_id}`], [k]: v } })); setModifie(true); setSimu(null); };
  const parBrique = useMemo(() => {
    const m = Array.from({ length: B + 1 }, () => []);
    for (const e of c?.etudiants || []) { const b = briques[e.id]; m[b && b <= B ? b : 0].push(e); }
    return m;
  }, [c, briques, B]);
  const nomCourt = e => `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
  const ueCourt = new Map((c?.ues || []).map(u => [u.ue_num, u.ue_nom]));

  async function enregistrer() {
    const r = await fetch('/api/etudiants/repartition-cours/communs', { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ section, bloc, annee, briques,
        reglages: acts.map(a => ({ cours_code: a.cours_code, activite_id: a.activite_id, nb_groupes: Number(a.nb_groupes), quadri: a.quadri, inclus: a.inclus, ordre: a.groupes.map(cleG) })) }) });
    const j = await r.json();
    if (!r.ok) { informer(j.error || 'Enregistrement refusé.'); return false; }
    setC(j); setModifie(false); return true;
  }
  async function proposer() {
    if (Object.keys(briques).length && !(await demander('Proposer une nouvelle répartition en briques ?\n\nLa répartition actuelle est remplacée (rien n’est enregistré avant « Enregistrer »).'))) return;
    const r = await fetch('/api/etudiants/repartition-cours/communs/proposer', { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ section, bloc, annee, nb_briques: B }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.briques) { informer(j.error || `La proposition a échoué (erreur ${r.status}).`); return; }
    setBriques(j.briques); setModifie(true); setSimu(null);
  }
  async function simuler() {
    if (modifie && !(await enregistrer())) return;
    const r = await fetch('/api/etudiants/repartition-cours/communs/appliquer', { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ section, bloc, annee, simulation: true }) });
    const j = await r.json().catch(() => ({}));
    // Un refus du serveur se lit comme tel, jamais comme une simulation.
    if (!r.ok || !Array.isArray(j.activites)) { setSimu(null); setErreur(j.error || `La simulation a échoué (erreur ${r.status}).`); return; }
    setErreur(null); setSimu(j);
  }
  async function appliquer() {
    if (!(await demander(`Remplir les groupes de ${simu.activites.length} activité(s) ?\n\n${simu.a_poser} placement(s) nouveaux, ${simu.a_changer} changement(s) de groupe. La répartition actuelle de ces activités est remplacée.`))) return;
    const r = await fetch('/api/etudiants/repartition-cours/communs/appliquer', { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ section, bloc, annee, simulation: false }) });
    const j = await r.json();
    if (!r.ok) { informer(j.error); return; }
    informer(`✓ Groupes remplis : ${j.a_poser + j.a_changer} placement(s) écrit(s). La répartition et les listes les montrent dès à présent.`);
    setSimu(null);
  }
  const deposer = b => { if (glisse == null) return; setBriques(x => ({ ...x, [glisse]: b })); setGlisse(null); setModifie(true); setSimu(null); };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={section} onChange={e => setSection(e.target.value)} className="controle">
          <option value="">— Section —</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <div className="segments flex h-9">
          {BLOCS.map(b => <button key={b} onClick={() => setBloc(b)} className={`px-3 text-[13px] ${bloc === b ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>{b}</button>)}
        </div>
        <span className="flex-1" />
        {peutEcrire && c && <>
          <button className="bouton controle inline-flex items-center gap-1.5" onClick={proposer}><IconWand size={15} /> Proposer les briques</button>
          <button className="bouton controle inline-flex items-center gap-1.5" disabled={!modifie} onClick={enregistrer}><IconDeviceFloppy size={15} /> Enregistrer</button>
          <button className="bouton bouton-fort controle inline-flex items-center gap-1.5" disabled={!Object.keys(briques).length} onClick={simuler}>
            <IconUsersGroup size={15} /> Remplir les groupes…</button>
        </>}
      </div>
      {erreur && <div className="text-[13px]" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}

      {simu && (
        <div className="carte p-3 space-y-2" style={{ borderLeft: '4px solid var(--c-disponible)' }}>
          <div className="flex items-center gap-3 flex-wrap">
            <b className="text-[13px]">Simulation</b>
            <span className="text-[13px] text-slate-600">{simu.a_poser} placement(s) nouveaux · {simu.a_changer} changement(s) · {simu.inchanges} déjà en place</span>
            <span className="flex-1" />
            <button className="bouton bouton-fort" onClick={appliquer} disabled={!simu.a_poser && !simu.a_changer}>Écrire ces groupes</button>
            <button className="bouton" onClick={() => setSimu(null)}>Fermer</button>
          </div>
          {(simu.ecarts || []).map((x, i) => <div key={i} className="text-[12.5px] flex gap-1.5" style={{ color: 'var(--c-attente)' }}><IconAlertTriangle size={14} className="mt-0.5 flex-none" />{x}</div>)}
          <div className="grid gap-x-6 gap-y-1 text-[12px]" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
            {simu.activites.map(a => <div key={a.libelle}><b>{a.libelle}</b> — {a.groupes.map(g => `${g.nom} : ${g.effectif}`).join(' · ')}</div>)}
          </div>
        </div>)}

      {c && (
        <div className="carte overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-3 flex-wrap">
            <b className="text-[13px]">Activités à groupes — {section} · {bloc}</b>
            <span className="text-[12.5px] text-slate-600">{c.etudiants.length} étudiant(s) · <b>{B} brique(s)</b> : le plus petit nombre qui convient à tous les découpages cochés</span>
          </div>
          <table className="w-full text-[12.5px]">
            <thead><tr className="tab-entete text-left">
              <th className="px-3 py-1.5">Dans les briques</th><th className="px-3 py-1.5">Cours · activité</th>
              <th className="px-3 py-1.5">Groupes en attribution</th><th className="px-3 py-1.5">Découpage (attributions)</th>
              <th className="px-3 py-1.5">Quadrimestre</th><th className="px-3 py-1.5">Un groupe =</th></tr></thead>
            <tbody>
              {acts.map(a => {
                const n = Number(a.nb_groupes) || 1;
                const tombe = !a.inclus || B % n === 0;
                return (
                  <tr key={`${a.cours_code}#${a.activite_id}`} className={`border-t border-slate-100 ${a.inclus ? '' : 'text-slate-400'}`}>
                    <td className="px-3 py-1"><input type="checkbox" checked={!!a.inclus} disabled={!peutEcrire} onChange={e => regler(a, 'inclus', e.target.checked)} /></td>
                    <td className="px-3 py-1"><b>{a.cours_code}</b> {a.activite || a.cours_nom}<span className="text-slate-400"> · UE {a.ue_num}</span></td>
                    <td className="px-3 py-1">{a.groupes.length} <span className="text-slate-400">({a.groupes.map(g => g.groupe).join(' ')})</span></td>
                    <td className="px-3 py-1" title="Cette année, le nombre de groupes est celui des attributions">{n} groupes</td>
                    <td className="px-3 py-1">
                      <select value={a.quadri} disabled={!peutEcrire} onChange={e => regler(a, 'quadri', e.target.value)} className="controle">
                        <option value="AN">Toute l’année</option><option value="Q1">Q1</option><option value="Q2">Q2</option></select>
                    </td>
                    <td className="px-3 py-1 text-slate-600">{a.inclus ? (tombe ? `${B / n} brique(s)` : <span style={{ color: 'var(--c-refuse)' }}>ne tombe pas juste</span>) : 'hors briques'}</td>
                  </tr>);
              })}
              {!acts.length && <tr><td colSpan="6" className="px-3 py-4 text-slate-400">Aucune activité à groupes dans les attributions de ce bloc.</td></tr>}
            </tbody>
          </table>
        </div>)}

      {c && <SimulationAnnee section={section} bloc={bloc} annee={annee} peutEcrire={peutEcrire} />}

      {c && B > 1 && <PlanGroupes acts={acts.filter(a => a.inclus && B % a.nb_groupes === 0)} B={B} peutEcrire={peutEcrire}
        onEchanger={(a, i, j) => {
          const ordre = a.groupes.map(cleG); [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
          regler(a, 'ordre', ordre);
        }} />}

      {c && (
        <div className="space-y-2">
          <div className="text-[12.5px] text-slate-600">Glissez un étudiant d’une brique à l’autre : tous ses groupes suivent. Chaque brique dit, sous son numéro, dans quel groupe elle tombe pour chaque découpage.</div>
          {parBrique[0].length > 0 && (
            <div className="carte p-2" onDragOver={e => e.preventDefault()} onDrop={() => deposer(0)}>
              <div className="text-[12px] font-semibold mb-1" style={{ color: 'var(--c-attente)' }}>Sans brique · {parBrique[0].length}</div>
              <div className="flex flex-wrap gap-1">{parBrique[0].map(e => <Puce key={e.id} e={e} nom={nomCourt(e)} disp={c.dispenses[e.id]} onGlisse={setGlisse} ues={ueCourt} />)}</div>
            </div>)}
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}>
            {Array.from({ length: B }, (_, i) => i + 1).map(b => (
              <div key={b} className="carte p-2 min-h-[90px]" onDragOver={e => e.preventDefault()} onDrop={() => deposer(b)}>
                <div className="flex items-baseline gap-2 mb-1">
                  <b className="text-[13px]">Brique {b}</b><span className="text-[11.5px] text-slate-500">{parBrique[b].length} étudiant(s)</span>
                </div>
                <div className="text-[10.5px] text-slate-400 mb-1.5 leading-snug">
                  {[...new Set(acts.filter(a => a.inclus && B % a.nb_groupes === 0).map(a => a.nb_groupes))].sort((x, y) => y - x)
                    .map(n => `${n} gr. → ${Math.floor((b - 1) / (B / n)) + 1}`).join(' · ')}
                </div>
                <div className="flex flex-wrap gap-1">{parBrique[b].map(e => <Puce key={e.id} e={e} nom={nomCourt(e)} disp={c.dispenses[e.id]} onGlisse={setGlisse} ues={ueCourt} />)}</div>
              </div>))}
          </div>
        </div>)}
    </div>
  );
}

function Puce({ e, nom, disp, onGlisse, ues }) {
  const d = disp ? Object.entries(disp).map(([k, v]) => `${k} (${v})`).join(', ') : '';
  return (
    <span draggable onDragStart={() => onGlisse(e.id)}
      title={`${nom}\nUE : ${e.ues.map(u => `${u} ${ues.get(u) || ''}`).join(' · ')}${e.num_organisation != null ? `\nOrganisation ${e.num_organisation}` : ''}${d ? `\nDispensé de ${d}` : ''}`}
      className="text-[11.5px] px-1.5 py-0.5 rounded border border-slate-200 bg-white cursor-grab hover:border-[var(--c-disponible)] whitespace-nowrap">
      {nom}{d ? <span className="text-slate-400"> · D</span> : ''}
    </span>
  );
}

/**
 * LE PLAN DES GROUPES : une ligne par TP, les briques en colonnes, chaque groupe
 * est une barre sur les briques qu'il couvre. Ce qui est aligné verticalement
 * partage les mêmes étudiants ; on glisse une barre sur une autre de sa ligne
 * pour les échanger — c'est ainsi qu'on LIE 252.2 C à 250.1 B. Le survol d'une
 * barre éclaire ses briques sur toutes les lignes : on voit qui est à cheval.
 */
function PlanGroupes({ acts, B, peutEcrire, onEchanger }) {
  const [prise, setPrise] = useState(null);     // { cle, i }
  const [survol, setSurvol] = useState(null);   // [debut, fin] en briques
  if (!acts.length) return null;
  const col = `minmax(18px, 1fr)`;
  return (
    <div className="carte p-3 space-y-1.5 overflow-x-auto">
      <div className="flex items-baseline gap-2 flex-wrap">
        <b className="text-[13px]">Plan des groupes</b>
        <span className="text-[12px] text-slate-500">Les groupes alignés partagent les mêmes étudiants. Glissez une barre sur une autre de sa ligne pour les échanger, et lier ainsi un groupe à ceux des autres cours.</span>
      </div>
      <div className="grid gap-y-1 min-w-[760px]" style={{ gridTemplateColumns: `minmax(220px, 260px) repeat(${B}, ${col})` }}>
        <div />
        {Array.from({ length: B }, (_, k) => (
          <div key={k} className={`text-center text-[10px] ${survol && k + 1 >= survol[0] && k + 1 <= survol[1] ? 'text-[color:var(--c-disponible)] font-bold' : 'text-slate-400'}`}>{k + 1}</div>))}
        {acts.map(a => {
          const cle = `${a.cours_code}#${a.activite_id}`;
          const larg = B / a.nb_groupes;
          return [
            <div key={cle + 'l'} className="text-[11.5px] pr-2 truncate self-center" title={`${a.cours_code} ${a.activite || ''}`}>
              <b>{a.cours_code}</b> {a.activite || ''}</div>,
            ...a.groupes.map((g, i) => {
              const debut = i * larg + 1, fin = (i + 1) * larg;
              const eclaire = survol && !(fin < survol[0] || debut > survol[1]);
              return (
                <div key={cle + i} style={{ gridColumn: `${debut + 1} / span ${larg}` }}
                  draggable={peutEcrire} onDragStart={() => setPrise({ cle, i })}
                  onDragOver={e => { if (prise?.cle === cle) e.preventDefault(); }}
                  onDrop={() => { if (prise?.cle === cle && prise.i !== i) onEchanger(a, prise.i, i); setPrise(null); }}
                  onMouseEnter={() => setSurvol([debut, fin])} onMouseLeave={() => setSurvol(null)}
                  title={`${a.cours_code} · groupe ${g.groupe || ''} — briques ${debut} à ${fin}`}
                  className={`mx-[1px] h-7 rounded-[6px] border text-[11.5px] font-semibold flex items-center justify-center select-none
                    ${peutEcrire ? 'cursor-grab' : ''} ${eclaire ? 'bg-[color-mix(in_srgb,var(--c-disponible)_18%,white)] border-[var(--c-disponible)]' : 'bg-white border-slate-300'}
                    ${prise?.cle === cle && prise.i === i ? 'opacity-50' : ''}`}>
                  {g.groupe || `Org ${g.num_organisation}`}
                </div>);
            }),
          ];
        })}
      </div>
    </div>
  );
}

/**
 * LA SIMULATION DE L'ANNÉE (lib/simulationHoraire.js) : les plages de la
 * section (réglables), la capacité, ce qui est placé et ce qui reste, et la
 * semaine de son choix en grille. Rien ne s'écrit dans l'horaire.
 */
const NOMS_JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
/**
 * LES LOCAUX POSSIBLES, ACTIVITÉ PAR ACTIVITÉ (Charles, 9 octobre 2026 : « fais
 * les locaux »). On choisit dans le référentiel, dans l'ordre de préférence ;
 * la simulation garde le même local chaque semaine et ne met jamais deux
 * séances dans la même salle. Sans choix : la théorie prend d'office une classe
 * ou un auditoire assez grand ; un TP reste « à désigner » — un labo ne se
 * devine pas.
 */
function LocauxActivites({ sim, section, bloc, annee, peutEcrire, onEnregistre }) {
  const acts = useMemo(() => {
    const m = new Map();
    for (const a of sim.activites || []) {
      const k = `${a.cours_code}#${a.activite_id}`;
      const x = m.get(k) || { cle: k, cours_code: a.cours_code, activite_id: a.activite_id, activite: a.activite, groupes: 0,
        effectif: 0, origine: a.local_origine, locaux: a.locaux || [] };
      x.groupes++; x.effectif = Math.max(x.effectif, a.effectif || 0);
      m.set(k, x);
    }
    return [...m.values()];
  }, [sim]);
  const [choix, setChoix] = useState({});
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  useEffect(() => { setChoix(Object.fromEntries(acts.map(a => [a.cle, a.origine === 'choisi' ? a.locaux : []]))); }, [acts]);
  const ref = sim.referentiel_locaux || [];
  const parNom = Object.fromEntries(ref.map(l => [l.nom, l]));
  const modifie = acts.some(a => JSON.stringify(choix[a.cle] || []) !== JSON.stringify(a.origine === 'choisi' ? a.locaux : []));
  const aDesigner = acts.filter(a => !(choix[a.cle] || []).length && a.origine === 'a_designer').length;
  async function enregistrer() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/etudiants/horaire-locaux', { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ section, bloc, annee, locaux: acts.map(a => ({ cours_code: a.cours_code, activite_id: a.activite_id, locaux: choix[a.cle] || [] })) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      await onEnregistre();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }
  return (
    <details className="border border-slate-200 rounded-carte">
      <summary className="px-3 py-2 cursor-pointer text-[13px] font-semibold">
        Locaux des activités{aDesigner ? <span className="font-normal" style={{ color: 'var(--c-attente)' }}> — {aDesigner} activité(s) sans local désigné</span> : ''}
      </summary>
      {/* LES BOUTONS EN HAUT. */}
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap border-b border-slate-100">
        {peutEcrire && <button className="bouton bouton-fort" disabled={!modifie || enCours} onClick={enregistrer}>
          {enCours ? 'Enregistrement…' : 'Enregistrer et simuler à nouveau'}</button>}
        <span className="text-[12px] text-slate-500">Le premier local de la liste est le préféré. La simulation garde le même local toute l’année et n’en met jamais deux groupes en même temps.
          Sans choix, la théorie prend d’office une classe ou un auditoire assez grand ; un TP reste à désigner.</span>
        {erreur && <span className="text-[12.5px]" style={{ color: 'var(--c-refuse)' }}>{erreur}</span>}
      </div>
      <table className="w-full text-[12.5px]">
        <thead><tr className="tab-entete text-left">
          <th className="px-3 py-1">Cours</th><th className="px-3 py-1">Activité</th><th className="px-3 py-1">Étudiants / groupe</th>
          <th className="px-3 py-1">Locaux possibles</th></tr></thead>
        <tbody>
          {acts.map(a => {
            const l = choix[a.cle] || [];
            return (
              <tr key={a.cle} className="border-t border-slate-100 align-top">
                <td className="px-3 py-1 font-semibold whitespace-nowrap">{a.cours_code}</td>
                <td className="px-3 py-1">{String(a.activite || '').slice(0, 44)}{a.groupes > 1 && <span className="text-slate-400"> · {a.groupes} groupes</span>}</td>
                <td className="px-3 py-1 tabular-nums">{a.effectif}</td>
                <td className="px-3 py-1">
                  <div className="flex flex-wrap items-center gap-1">
                    {l.map((n, i) => {
                      const petit = parNom[n]?.places && parNom[n].places < a.effectif;
                      return (
                        <span key={n} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 border border-slate-300 bg-white"
                          title={`${parNom[n]?.type || ''}${parNom[n]?.places ? ` · ${parNom[n].places} places` : ''}${petit ? ' — trop petit pour ce groupe' : ''}`}
                          style={petit ? { borderColor: 'var(--c-attente)' } : undefined}>
                          {i === 0 && l.length > 1 && <span className="text-[10px] text-slate-400">préféré</span>}
                          {n}{petit && <IconAlertTriangle size={12} style={{ color: 'var(--c-attente)' }} />}
                          {peutEcrire && <button type="button" className="text-slate-400 hover:text-slate-700" title="Retirer"
                            onClick={() => setChoix(c => ({ ...c, [a.cle]: l.filter(x => x !== n) }))}>×</button>}
                        </span>);
                    })}
                    {!l.length && (a.origine === 'auto' ? <span className="text-slate-500">d’office : {a.locaux.slice(0, 3).join(', ')}{a.locaux.length > 3 ? '…' : ''}</span>
                      : a.origine === 'aucun' ? <span style={{ color: 'var(--c-refuse)' }}>aucune salle assez grande au référentiel</span>
                      : <span style={{ color: 'var(--c-attente)' }}>à désigner</span>)}
                    {peutEcrire && (
                      <select className="controle !h-7 text-[12px]" value="" onChange={e => { const n = e.target.value; if (n) setChoix(c => ({ ...c, [a.cle]: [...l, n] })); }}>
                        <option value="">+ local…</option>
                        {ref.filter(x => !l.includes(x.nom)).map(x => <option key={x.nom} value={x.nom}>{x.nom} — {x.type || '?'}{x.places ? ` · ${x.places} pl.` : ''}</option>)}
                      </select>)}
                  </div>
                </td>
              </tr>);
          })}
        </tbody>
      </table>
    </details>
  );
}

export function SimulationAnnee({ section, bloc, annee, peutEcrire }) {
  const [plages, setPlages] = useState(null);
  const [texte, setTexte] = useState({});
  const [sim, setSim] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [semaine, setSemaine] = useState(1);
  const [erreur, setErreur] = useState(null);
  const [vueSem, setVueSem] = useState('deux');       // proposition | actuel | deux
  const [actuelSem, setActuelSem] = useState([]);
  useEffect(() => {
    const lundi = sim?.semaines?.[semaine - 1]?.lundi;
    if (!lundi) { setActuelSem([]); return; }
    fetch(`/api/horaire/semaine?annee=${encodeURIComponent(annee)}&lundi=${lundi}&vue=classe&cle=${encodeURIComponent(`${section}|${bloc}`)}`, { headers: authHeaders() })
      .then(r => r.json()).then(j => setActuelSem((j.seances || []).filter(x => x.source !== 'simulation' && !x.annule))).catch(() => setActuelSem([]));
  }, [sim, semaine, section, bloc, annee]);
  useEffect(() => {
    setSim(null);
    fetch(`/api/etudiants/horaire-plages?section=${encodeURIComponent(section)}`, { headers: authHeaders() }).then(r => r.json())
      .then(j => { setPlages(j.plages || []); const t = {}; for (let d = 1; d <= 6; d++) t[d] = (j.plages || []).filter(p => p.jour === d).map(p => `${p.debut}-${p.fin}`).join(', '); setTexte(t); })
      .catch(() => setPlages([]));
  }, [section]);
  async function enregistrerPlages() {
    const liste = [];
    for (const [j, v] of Object.entries(texte)) for (const m of String(v || '').split(',').map(x => x.trim()).filter(Boolean)) {
      const r = /^(\d{1,2})[:h](\d{2})\s*-\s*(\d{1,2})[:h](\d{2})$/.exec(m);
      if (r) liste.push({ jour: Number(j), debut: `${r[1].padStart(2, '0')}:${r[2]}`, fin: `${r[3].padStart(2, '0')}:${r[4]}` });
    }
    const r = await fetch('/api/etudiants/horaire-plages', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ section, plages: liste }) });
    const j = await r.json();
    if (!r.ok) { setErreur(j.error); return; }
    setPlages(j.plages); setSim(null);
  }
  async function simuler() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/etudiants/repartition-cours/communs/simulation?section=${encodeURIComponent(section)}&bloc=${bloc}&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setSim(j); setSemaine(1);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }
  /* POSER DANS L'HORAIRE : un compte rendu d'abord, puis l'écriture. Les
     séances retouchées à la main dans l'horaire ne sont jamais remplacées. */
  async function poser() {
    const corps = { section, bloc, annee };
    const r0 = await fetch('/api/etudiants/repartition-cours/communs/simulation/poser', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...corps, simulation: true }) });
    const a = await r0.json();
    if (!r0.ok) { setErreur(a.error || `Erreur ${r0.status}`); return; }
    if (!(await demander(`Poser ${a.a_poser} séance(s) dans l’horaire de ${section} ${bloc} ?\n\n`
      + (a.remplacees ? `${a.remplacees} séance(s) posées par une simulation précédente seront remplacées.\n` : '')
      + (a.gardees ? `${a.gardees} séance(s) retouchées à la main sont gardées telles quelles.\n` : '')
      + (a.restes ? `${a.restes} activité(s) n’ont pas toutes leurs séances : elles restent à placer à la main.\n` : '')
      + '\nLes séances se déplacent ensuite dans Organisation → Horaire de la semaine.'))) return;
    setEnCours(true);
    try {
      const r = await fetch('/api/etudiants/repartition-cours/communs/simulation/poser', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...corps, simulation: false }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      informer(`✓ ${j.a_poser} séance(s) posées dans l’horaire de ${section} ${bloc}. Elles sont visibles dans Organisation → Horaire de la semaine (classe ${section} · ${bloc}).`);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }
  const creneauxSemaine = useMemo(() => (sim?.seances || []).filter(s => s.semaine === semaine), [sim, semaine]);
  const heures = [...new Set((plages || []).map(p => `${p.debut}-${p.fin}`))].sort();
  const jours = [...new Set((plages || []).map(p => p.jour))].sort();
  const datesSemaine = useMemo(() => Object.fromEntries(creneauxSemaine.map(s => [s.jour, s.date])), [creneauxSemaine]);

  return (
    <div className="carte p-3 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <b className="text-[13px]">Simulation de l’année — {section} · {bloc}</b>
        <span className="text-[12px] text-slate-500">Semaines de cours du calendrier, congés et fériés déduits ; périodes attribuées (50 min) ; une brique et un enseignant jamais à deux endroits à la fois. Rien ne s’écrit dans l’horaire.</span>
        <span className="flex-1" />
        <button className={sim ? 'bouton' : 'bouton bouton-fort'} onClick={simuler} disabled={enCours || !plages?.length}>{enCours ? 'Simulation…' : sim ? 'Simuler à nouveau' : 'Simuler l’année'}</button>

      </div>
      {erreur && <div className="text-[12.5px]" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}

      <details className="text-[12.5px]">
        <summary className="cursor-pointer text-slate-600">Plages horaires de {section} ({(plages || []).length} tranche(s) par semaine)</summary>
        <div className="mt-2 grid gap-1.5 max-w-[640px]">
          {[1, 2, 3, 4, 5, 6].map(d => (
            <label key={d} className="flex items-center gap-2">
              <span className="w-20">{NOMS_JOURS[d]}</span>
              <input value={texte[d] || ''} disabled={!peutEcrire} onChange={e => setTexte(t => ({ ...t, [d]: e.target.value }))}
                placeholder="aucune — ex. 15:30-17:30, 17:30-19:30" className="controle flex-1" data-reponses="non" />
            </label>))}
          {peutEcrire && <div><button className="bouton" onClick={enregistrerPlages}>Enregistrer les plages</button></div>}
        </div>
      </details>

      {sim && <>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
          {[[sim.nb_semaines, 'semaines de cours', 'neutre'], [`${sim.heures_disponibles} h`, 'disponibles par étudiant', 'neutre'],
            [`${sim.heures_attribuees} h`, 'attribuées au bloc (hors stage et évaluations)', 'neutre'],
            [`${sim.actuel.heures} h`, `horaire actuel — ${sim.actuel.seances} séance(s)${sim.actuel.derniere ? `, jusqu’au ${sim.actuel.derniere.slice(8, 10)}/${sim.actuel.derniere.slice(5, 7)}` : ''}`, sim.actuel.heures < sim.heures_attribuees ? 'surveiller' : 'reussi'],
            [`${Math.round(sim.seances.reduce((t, x) => t + x.minutes, 0) / 60)} h`, `proposition de Lucie — ${sim.nb_seances} séance(s)`, sim.restes.length ? 'corriger' : 'reussi'],
            [sim.restes.length ? `${sim.restes.reduce((t, r) => t + r.manque, 0)}` : '0', sim.restes.length ? 'séances sans place dans la proposition' : 'tout est placé', sim.restes.length ? 'corriger' : 'reussi']].map(([v, l, e]) => (
            <div key={l} className="bloc-etat px-3 py-2" data-etat={e}>
              <div className="text-[17px] font-bold">{v}</div><div className="text-[11.5px] text-slate-500">{l}</div></div>))}
        </div>
        {sim.restes.length > 0 && (
          <div className="space-y-1">
            {sim.restes.map(r => <div key={r.cle} className="text-[12.5px] flex gap-1.5" style={{ color: 'var(--c-refuse)' }}>
              <IconAlertTriangle size={14} className="mt-0.5 flex-none" /><span><b>{r.cours_code}</b> {r.activite} · {r.groupe} — {r.manque} séance(s) sans place : {r.raison}{r.professeur ? ` (${r.professeur})` : ''}</span></div>)}
          </div>)}
        <LocauxActivites sim={sim} section={section} bloc={bloc} annee={annee} peutEcrire={peutEcrire} onEnregistre={simuler} />
        {/* LA RÉGULARITÉ SE LIT : un créneau fixe par groupe, ses semaines. */}
        <details className="border border-slate-200 rounded-carte">
          <summary className="px-3 py-2 cursor-pointer text-[13px] font-semibold">
            Créneaux fixes — {sim.activites.filter(a => a.creneaux_fixes?.length && !a.irreguliers).length} sur {sim.activites.length} activité(s) entièrement régulières
          </summary>
          <table className="w-full text-[12.5px]">
            <thead><tr className="tab-entete text-left">
              <th className="px-3 py-1">Cours</th><th className="px-3 py-1">Activité</th><th className="px-3 py-1">Groupe</th>
              <th className="px-3 py-1">Créneau fixe</th><th className="px-3 py-1">Semaines</th><th className="px-3 py-1">Local</th><th className="px-3 py-1">Enseignant</th></tr></thead>
            <tbody>
              {sim.activites.map(a => (
                <tr key={a.cle} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-1 font-semibold whitespace-nowrap">{a.cours_code}</td>
                  <td className="px-3 py-1">{String(a.activite || '').slice(0, 40)}</td>
                  <td className="px-3 py-1">{a.tout_le_bloc ? 'tout le bloc' : a.groupe}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{(a.creneaux_fixes || []).map((f, i) => <div key={i}>{f.jour_nom} {f.debut.replace(':', ' h ')} – {f.fin.replace(':', ' h ')}</div>)}
                    {a.irreguliers > 0 && <div style={{ color: 'var(--c-attente)' }}>+ {a.irreguliers} séance(s) hors créneau fixe</div>}
                    {!a.creneaux_fixes?.length && !a.irreguliers && <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-1 whitespace-nowrap text-slate-600">{(a.creneaux_fixes || []).map((f, i) => <div key={i}>{f.de === f.a ? `semaine ${f.de}` : `semaines ${f.de} à ${f.a}`} · {f.seances} séance(s)</div>)}</td>
                  <td className="px-3 py-1 whitespace-nowrap">{(a.creneaux_fixes || []).map((f, i) => <div key={i}>{f.local
                    || <span style={{ color: 'var(--c-attente)' }}>à désigner</span>}</div>)}</td>
                  <td className="px-3 py-1 text-slate-600">{a.professeur || '—'}</td>
                </tr>))}
            </tbody>
          </table>
        </details>
        <div className="flex items-center gap-2">
          <button className="bouton px-2" disabled={semaine <= 1} onClick={() => setSemaine(s => s - 1)}>◀</button>
          <select value={semaine} onChange={e => setSemaine(Number(e.target.value))} className="controle">
            {Array.from({ length: sim.nb_semaines }, (_, i) => i + 1).map(w => <option key={w} value={w}>Semaine {w}</option>)}
          </select>
          <button className="bouton px-2" disabled={semaine >= sim.nb_semaines} onClick={() => setSemaine(s => s + 1)}>▶</button>
          <span className="text-[12px] text-slate-500">{sim.semaines?.[semaine - 1] ? `semaine du ${sim.semaines[semaine - 1].lundi.split('-').reverse().join('/')}` : ''}</span>
          <span className="flex-1" />
          <div className="segments flex h-8">
            {[['proposition', 'Proposition de Lucie'], ['actuel', 'Horaire actuel'], ['deux', 'Côte à côte']].map(([k, l]) => (
              <button key={k} onClick={() => setVueSem(k)} className={`px-3 text-[12.5px] ${vueSem === k ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>{l}</button>))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] border-collapse min-w-[860px]">
            <thead><tr className="tab-entete">
              <th className="px-2 py-1 w-24 text-left">Plage</th>
              {jours.map(j => <th key={j} className="px-2 py-1 text-left">{NOMS_JOURS[j]}{datesSemaine[j] ? <span className="font-normal text-slate-500"> {datesSemaine[j].slice(8, 10)}/{datesSemaine[j].slice(5, 7)}</span> : ''}</th>)}
            </tr></thead>
            <tbody>
              {heures.map(h => (
                <tr key={h} className="border-t border-slate-200 align-top">
                  <td className="px-2 py-1 font-semibold whitespace-nowrap">{h.replace('-', ' – ')}</td>
                  {jours.map(j => {
                    const [hd, hf] = h.split('-');
                    const ici = vueSem === 'actuel' ? [] : creneauxSemaine.filter(s => s.jour === j && `${s.debut}-${s.fin}` === h);
                    const jourDe = d => { const x = new Date(`${d}T12:00:00Z`).getUTCDay(); return x || 7; };
                    // Une séance actuelle va dans la plage qu'elle recouvre le PLUS : à cheval sur deux, elle s'affichait deux fois.
                    const m = t => { const [a, b] = String(t).split(':').map(Number); return a * 60 + b; };
                    const recouvre = (x, p0) => Math.max(0, Math.min(m(x.heure_fin), m(p0.split('-')[1])) - Math.max(m(x.heure_debut), m(p0.split('-')[0])));
                    const act = vueSem === 'proposition' ? [] : actuelSem.filter(x => {
                      if (jourDe(x.date) !== j) return false;
                      const duJour = (plages || []).filter(p0 => p0.jour === j).map(p0 => `${p0.debut}-${p0.fin}`);
                      const cand = duJour.length ? duJour : heures;
                      const meilleure = cand.reduce((best, p0) => (recouvre(x, p0) > recouvre(x, best) ? p0 : best), cand[0]);
                      return meilleure === h;
                    });
                    const existe = (plages || []).some(p => p.jour === j && `${p.debut}-${p.fin}` === h);
                    return (
                      <td key={j} className={`px-1 py-1 border-l border-slate-100 ${existe ? '' : 'bg-slate-50'}`}>
                        <div className="flex flex-col gap-0.5">
                          {act.map((x, i) => (
                            <span key={`a${i}`} className="rounded px-1.5 py-0.5 border border-dashed text-slate-600"
                              title={`Horaire actuel — ${x.cours_code || ''} ${x.cours_nom || x.matiere || ''} ${x.heure_debut}–${x.heure_fin}${x.groupe_nom ? ` · groupe ${x.groupe_nom}` : ''}${x.conflits?.length ? `\nConflit : ${x.conflits.join(', ')}` : ''}`}
                              style={{ borderColor: x.conflits?.length ? 'var(--c-refuse)' : '#94A3B8', background: '#F8FAFC' }}>
                              <span className="text-[10px] text-slate-400">actuel </span><b>{x.cours_code || '—'}</b> {x.heure_debut}–{x.heure_fin}{x.groupe_nom ? ` · ${x.groupe_nom}` : ''}
                            </span>))}
                          {ici.map((s, i) => (
                            <span key={i} className="rounded px-1.5 py-0.5 border" title={`${s.cours_code} ${s.activite || ''} — groupe ${s.groupe}${s.professeur ? ` — ${s.professeur}` : ''}${s.local ? `\nLocal ${s.local}` : ''}\nBriques ${s.tout_le_bloc ? 'toutes' : s.briques.join(', ')}`}
                              style={{ ...styleTuileCours(s.cours_code), border: 'none', borderLeft: `4px solid ${teinteCours(s.cours_code)}`, fontWeight: s.tout_le_bloc ? 600 : undefined }}>
                              <b>{s.cours_code}</b> {s.groupe !== 'Tous' && s.groupe !== 'Ts' ? `· ${s.groupe}` : '· tous'}
                              <span className="text-slate-500"> {String(s.activite || '').replace(/\s*\((TP|TH)\)\s*$/i, '').slice(0, 22)}</span>
                              {s.local && <span className="text-slate-500"> · {s.local}</span>}
                            </span>))}
                        </div>
                      </td>);
                  })}
                </tr>))}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  );
}

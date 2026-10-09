import { useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle, IconWand, IconDeviceFloppy, IconUsersGroup } from '@tabler/icons-react';
import { api, authHeaders, getAnnee } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { passeRole } from '../lib/droits.js';

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
export function SimulationAnnee({ section, bloc, annee, peutEcrire }) {
  const [plages, setPlages] = useState(null);
  const [texte, setTexte] = useState({});
  const [sim, setSim] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [semaine, setSemaine] = useState(1);
  const [erreur, setErreur] = useState(null);
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
        <button className="bouton bouton-fort" onClick={simuler} disabled={enCours || !plages?.length}>{enCours ? 'Simulation…' : 'Simuler l’année'}</button>
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
          {[[sim.nb_semaines, 'semaines de cours'], [sim.creneaux, 'créneaux disponibles'], [`${sim.heures_disponibles} h`, 'disponibles par étudiant'],
            [`${sim.heures_demandees_min}–${sim.heures_demandees_max} h`, 'demandées par brique'], [`${sim.nb_seances}`, 'séances placées'],
            [sim.restes.length ? `${sim.restes.reduce((t, r) => t + r.manque, 0)}` : '0', sim.restes.length ? 'séances sans place' : 'tout est placé']].map(([v, l]) => (
            <div key={l} className="bloc-etat px-3 py-2" data-etat={l === 'séances sans place' ? 'corriger' : 'neutre'}>
              <div className="text-[17px] font-bold">{v}</div><div className="text-[11.5px] text-slate-500">{l}</div></div>))}
        </div>
        {sim.restes.length > 0 && (
          <div className="space-y-1">
            {sim.restes.map(r => <div key={r.cle} className="text-[12.5px] flex gap-1.5" style={{ color: 'var(--c-refuse)' }}>
              <IconAlertTriangle size={14} className="mt-0.5 flex-none" /><span><b>{r.cours_code}</b> {r.activite} · {r.groupe} — {r.manque} séance(s) sans place : {r.raison}{r.professeur ? ` (${r.professeur})` : ''}</span></div>)}
          </div>)}
        <div className="flex items-center gap-2">
          <button className="bouton px-2" disabled={semaine <= 1} onClick={() => setSemaine(s => s - 1)}>◀</button>
          <select value={semaine} onChange={e => setSemaine(Number(e.target.value))} className="controle">
            {Array.from({ length: sim.nb_semaines }, (_, i) => i + 1).map(w => <option key={w} value={w}>Semaine {w}</option>)}
          </select>
          <button className="bouton px-2" disabled={semaine >= sim.nb_semaines} onClick={() => setSemaine(s => s + 1)}>▶</button>
          <span className="text-[12px] text-slate-500">{creneauxSemaine.length} séance(s) cette semaine</span>
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
                    const ici = creneauxSemaine.filter(s => s.jour === j && `${s.debut}-${s.fin}` === h);
                    const existe = (plages || []).some(p => p.jour === j && `${p.debut}-${p.fin}` === h);
                    return (
                      <td key={j} className={`px-1 py-1 border-l border-slate-100 ${existe ? '' : 'bg-slate-50'}`}>
                        <div className="flex flex-col gap-0.5">
                          {ici.map((s, i) => (
                            <span key={i} className="rounded px-1.5 py-0.5 border" title={`${s.cours_code} ${s.activite || ''} — groupe ${s.groupe}${s.professeur ? ` — ${s.professeur}` : ''}\nBriques ${s.tout_le_bloc ? 'toutes' : s.briques.join(', ')}`}
                              style={{ borderColor: s.tout_le_bloc ? 'var(--c-fort, #16406A)' : '#CBD5E1', background: s.tout_le_bloc ? '#EEF3F9' : '#fff' }}>
                              <b>{s.cours_code}</b> {s.groupe !== 'Tous' && s.groupe !== 'Ts' ? `· ${s.groupe}` : '· tous'}
                              <span className="text-slate-500"> {String(s.activite || '').replace(/\s*\((TP|TH)\)\s*$/i, '').slice(0, 22)}</span>
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

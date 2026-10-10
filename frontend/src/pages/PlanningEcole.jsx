import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { passeRole } from '../lib/droits.js';
import AgendaSemaine, { LegendeDispo, suivant } from '../components/AgendaSemaine.jsx';

/**
 * LE PLANNING DE L'ÉCOLE — face du laboratoire temporel (Charles, 10 octobre 2026 :
 * « un agenda des 7 jours de la semaine. On règle les blocs de cours, on définit
 * la base. Une fois la base définie, on peut aller placer pour les profs les
 * dispos, pour les cours aussi : dire que TIM c'est en soirée, ou 4 jours
 * semaine, mais on laisse la machine — ou pas — définir »).
 *
 * Deux gestes, un seul dessin (`AgendaSemaine`) :
 *   1. LA BASE de l'école — une pour tout l'IIP : les blocs de cours, jour par
 *      jour. Réglée par la direction et le secrétariat.
 *   2. PEINDRE sur la base, en vert, orange ou rouge : une section, un bloc, une
 *      UE, un cours, une activité, un enseignant, un local. Ce qui n'est pas
 *      peint reste au choix de la simulation. Ce qu'un niveau au-dessus impose
 *      déjà s'écrit dans la case : on voit ce qu'on peint ET ce qui s'applique.
 */
const TYPES = [
  ['base', 'La base'], ['section', 'Section'], ['bloc', 'Bloc'], ['ue', 'UE'], ['cours', 'Cours'],
  ['activite', 'Activité'], ['prof', 'Enseignant'], ['local', 'Local'],
];
const QUADRIS = [['AN', 'Toute l’année'], ['Q1', 'Q1'], ['Q2', 'Q2']];

export default function PlanningEcole({ section, annee, peutEcrire }) {
  const peutBase = passeRole(['admin', 'editeur']);
  const [p, setP] = useState(null);                  // { base, contraintes, regles }
  const [cibles, setCibles] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [type, setType] = useState('base');
  const [cible, setCible] = useState('');
  const [voulue, setVoulue] = useState(null);       // la cible demandée depuis « Déjà peint »
  const [quadri, setQuadri] = useState('AN');
  const [brouillon, setBrouillon] = useState(null);  // Map « jour|debut » → 0/2 (peindre) ou liste de cases (base)
  const [modeles, setModeles] = useState([]);        // blocs proposés dans la base
  const [nouveau, setNouveau] = useState({ debut: '08:00', fin: '10:00' });
  const [regles, setRegles] = useState({ jours_max: 5, regrouper: true });
  const [enCours, setEnCours] = useState(false);

  const charger = async () => {
    try {
      const r = await fetch('/api/etudiants/planning', { headers: authHeaders() });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setP(j); setErreur(null);
      setModeles(m => { const k = new Set(m.map(x => `${x.debut}|${x.fin}`)); const n = [...m]; for (const c of j.base) if (!k.has(`${c.debut}|${c.fin}`)) { k.add(`${c.debut}|${c.fin}`); n.push({ debut: c.debut, fin: c.fin }); } return n.sort((a, b) => a.debut.localeCompare(b.debut)); });
    } catch (e) { setErreur(e.message); }
  };
  useEffect(() => { charger(); }, []);
  useEffect(() => {
    setCibles(null);
    fetch(`/api/etudiants/planning/cibles?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => r.json()).then(setCibles).catch(() => setCibles({ blocs: [], ues: [], cours: [], activites: [], profs: [], locaux: [] }));
  }, [section, annee]);
  useEffect(() => {
    const r = p?.regles?.[section]; setRegles({ jours_max: Number(r?.jours_max) || 5, regrouper: r ? r.regrouper !== '0' : true });
  }, [p, section]);

  // La cible par défaut du type choisi.
  const options = useMemo(() => {
    if (!cibles) return [];
    switch (type) {
      case 'section': return [[section, section]];
      case 'bloc': return cibles.blocs.map(b => [`${section}|${b}`, `${section} · ${b}`]);
      case 'ue': return cibles.ues.map(u => [String(u.ue_num), `UE ${u.ue_num} — ${u.ue_nom}${u.bloc ? ` (${u.bloc})` : ''}`]);
      case 'cours': return cibles.cours.map(c => [c.cours_code, `${c.cours_code} — ${c.cours_nom}`]);
      case 'activite': return cibles.activites.map(a => [`${a.cours_code}#${a.activite_id}`, `${a.cours_code} — ${a.libelle}`]);
      case 'prof': return cibles.profs.map(x => [String(x.id), `${String(x.nom || '').toUpperCase()} ${x.prenom || ''}`]);
      case 'local': return cibles.locaux.map(l => [l.nom, `${l.nom}${l.type ? ` — ${l.type}` : ''}${l.places ? `, ${l.places} places` : ''}`]);
      default: return [];
    }
  }, [type, cibles, section]);
  useEffect(() => { setCible(voulue && options.some(o => o[0] === voulue) ? voulue : options[0]?.[0] || ''); setVoulue(null); setBrouillon(null); }, [type, options]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setBrouillon(null); }, [cible, quadri]);

  const base = p?.base || [];
  const enBase = type === 'base';
  const baseVue = enBase && Array.isArray(brouillon) ? brouillon : base;
  const enregistre = useMemo(() => new Map((p?.contraintes || []).filter(c => c.type === type && c.cible === cible && c.quadrimestre === quadri).map(c => [`${c.jour}|${c.debut}`, c.valeur])), [p, type, cible, quadri]);
  const peint = !enBase && brouillon instanceof Map ? brouillon : enregistre;

  // CE QUI S'IMPOSE DÉJÀ : les niveaux au-dessus de la cible, et l'autre lecture du temps (année / quadrimestre).
  const parents = useMemo(() => {
    if (!cibles || enBase) return [];
    const l = [];
    const ajoute = (t, c, nom) => c && l.push({ t, c, nom });
    const ueDe = n => cibles.ues.find(u => String(u.ue_num) === String(n));
    if (['bloc', 'ue', 'cours', 'activite'].includes(type)) ajoute('section', section, 'section');
    if (type === 'ue') { const u = ueDe(cible); if (u?.bloc) ajoute('bloc', `${section}|${u.bloc}`, u.bloc); }
    if (type === 'cours' || type === 'activite') {
      const code = String(cible).split('#')[0], c = cibles.cours.find(x => x.cours_code === code), u = ueDe(c?.ue_num);
      if (u?.bloc) ajoute('bloc', `${section}|${u.bloc}`, u.bloc);
      if (c) ajoute('ue', String(c.ue_num), `UE ${c.ue_num}`);
      if (type === 'activite') ajoute('cours', code, 'cours');
    }
    return l;
  }, [cibles, type, cible, section, enBase]);
  const herite = (j, c) => {
    let pire = null;
    const regarde = (t, cb, qd, nom) => {
      const v = (p?.contraintes || []).find(x => x.type === t && x.cible === cb && x.quadrimestre === qd && x.jour === j && x.debut === c.debut)?.valeur;
      if (v === 0 && pire?.v !== 0) pire = { v: 0, par: nom };
      else if (v === 2 && !pire) pire = { v: 2, par: nom };
    };
    for (const x of parents) for (const qd of quadri === 'AN' ? ['AN'] : ['AN', quadri]) regarde(x.t, x.c, qd, x.nom);
    if (quadri !== 'AN') regarde(type, cible, 'AN', 'l’année');
    return pire;
  };

  function changer(j, c, geste) {
    if (enBase) {
      setBrouillon(b => {
        const l = [...(Array.isArray(b) ? b : base)];
        return geste === 'ajouter' ? [...l, { jour: j, debut: c.debut, fin: c.fin }] : l.filter(x => !(x.jour === j && x.debut === c.debut));
      });
      return;
    }
    setBrouillon(b => {
      const m = new Map(b instanceof Map ? b : enregistre), k = `${j}|${c.debut}`;
      const v = suivant(m.has(k) ? m.get(k) : 1);
      if (v === 1) m.delete(k); else m.set(k, v);
      return m;
    });
  }

  async function enregistrer() {
    setEnCours(true); setErreur(null);
    try {
      if (enBase) {
        const avant = new Set(base.map(c => `${c.jour}|${c.debut}`)), apres = new Set(brouillon.map(c => `${c.jour}|${c.debut}`));
        const perdues = (p?.contraintes || []).filter(c => avant.has(`${c.jour}|${c.debut}`) && !apres.has(`${c.jour}|${c.debut}`)).length;
        if (perdues && !(await demander({ titre: 'Modifier la base de l’école', message: `${perdues} case(s) déjà peintes (sections, enseignants, cours…) portent sur des blocs que vous retirez : elles seront effacées.`, confirmer: 'Enregistrer la base' }))) return;
        const r = await fetch('/api/etudiants/planning/base', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ cases: brouillon }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      } else {
        const cases = [...peint].map(([k, valeur]) => { const [jour, debut] = k.split('|'); return { jour: Number(jour), debut, valeur }; });
        const r = await fetch('/api/etudiants/planning/contraintes', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ type, cible, quadrimestre: quadri, cases }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
        if (type === 'section') {
          const r2 = await fetch('/api/etudiants/horaire-plages', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ section, regles }) });
          if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error || `Erreur ${r2.status}`);
        }
      }
      setBrouillon(null); await charger();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  function ajouterModele() {
    const { debut, fin } = nouveau;
    if (!/^\d\d:\d\d$/.test(debut) || !/^\d\d:\d\d$/.test(fin) || debut >= fin) { informer('Un bloc a un début et une fin, au format 08:00.'); return; }
    setModeles(m => m.some(x => x.debut === debut && x.fin === fin) ? m : [...m, { debut, fin }].sort((a, b) => a.debut.localeCompare(b.debut)));
  }
  // Poser un modèle sur plusieurs jours d'un coup.
  function poserPartout(m, jours) {
    setBrouillon(b => {
      const l = [...(Array.isArray(b) ? b : base)];
      for (const j of jours) {
        if (l.some(c => c.jour === j && c.debut < m.fin && m.debut < c.fin)) continue;
        l.push({ jour: j, debut: m.debut, fin: m.fin });
      }
      return l;
    });
  }
  const retirerModele = m => {
    setBrouillon(b => (Array.isArray(b) ? b : base).filter(c => !(c.debut === m.debut && c.fin === m.fin)));
    setModeles(l => l.filter(x => !(x.debut === m.debut && x.fin === m.fin)));
  };

  // Ce qui est déjà peint dans la section : une liste de portes.
  const resume = useMemo(() => {
    if (!p || !cibles) return [];
    const noms = new Map();
    noms.set(`section|${section}`, `Section ${section}`);
    for (const b of cibles.blocs) noms.set(`bloc|${section}|${b}`, `Bloc ${b}`);
    for (const u of cibles.ues) noms.set(`ue|${u.ue_num}`, `UE ${u.ue_num}`);
    for (const c of cibles.cours) noms.set(`cours|${c.cours_code}`, `Cours ${c.cours_code}`);
    for (const a of cibles.activites) noms.set(`activite|${a.cours_code}#${a.activite_id}`, `${a.cours_code} ${a.libelle}`);
    for (const x of cibles.profs) noms.set(`prof|${x.id}`, `${String(x.nom || '').toUpperCase()} ${x.prenom || ''}`);
    for (const l of cibles.locaux) noms.set(`local|${l.nom}`, `Local ${l.nom}`);
    const n = new Map();
    for (const c of p.contraintes) { const k = `${c.type}|${c.cible}`; if (noms.has(k)) n.set(k, (n.get(k) || 0) + 1); }
    return [...n].map(([k, nb]) => { const [t, ...r] = k.split('|'); return { t, c: r.join('|'), nom: noms.get(k), nb }; });
  }, [p, cibles, section]);

  const modifie = brouillon !== null;
  const peutIci = enBase ? peutBase : peutEcrire;
  if (erreur && !p) return <div className="text-second" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>;
  if (!p) return <div className="text-sm text-slate-400">Chargement…</div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="segments flex h-9">
          {TYPES.map(([k, l]) => <button key={k} onClick={() => setType(k)} className={`px-3 text-second ${type === k ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>{l}</button>)}
        </div>
        {!enBase && options.length > 1 && (
          <select className="controle max-w-[340px]" value={cible} onChange={e => setCible(e.target.value)}>
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>)}
        {!enBase && <div className="segments flex h-9">
          {QUADRIS.map(([k, l]) => <button key={k} onClick={() => setQuadri(k)} className={`px-3 text-second ${quadri === k ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>{l}</button>)}
        </div>}
        <span className="flex-1" />
        {peutIci && modifie && <button className="bouton" onClick={() => setBrouillon(null)} disabled={enCours}>Annuler</button>}
        {peutIci && !enBase && <button className="bouton" disabled={!peint.size || enCours} onClick={() => setBrouillon(new Map())} title="Plus rien de peint : tout redevient libre">Tout vert</button>}
        {peutIci && <button className="bouton bouton-fort" disabled={!modifie || enCours || (!enBase && !cible)} onClick={enregistrer}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>}
      </div>
      {erreur && <div className="text-second" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}

      <div className="bloc-etat px-3 py-2 text-second" data-etat="neutre">
        {enBase
          ? <><b>La base de l’école</b> : les blocs de cours, jour par jour, pour tout l’IIP. Un clic sur un bloc le retire, un clic sur un bloc en pointillé l’ajoute ce jour-là. Tout le reste — enseignants, sections, cours, locaux — se peint sur ces blocs.{!peutBase && ' Seuls la direction et le secrétariat la modifient.'}</>
          : <>Cliquez sur un bloc pour le changer : <b>vert</b> libre (la simulation choisit), <b>orange</b> éventuellement (évité tant qu’il y a mieux), <b>rouge</b> jamais. Ce qu’un niveau au-dessus impose déjà s’écrit dans le bloc.
            {quadri !== 'AN' && ' Ce qui est peint pour toute l’année s’applique aussi.'}</>}
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="carte p-3 bg-white flex-1 min-w-[520px] space-y-2">
          {!enBase && <div className="flex items-center gap-3"><b className="text-sm">{options.find(o => o[0] === cible)?.[1] || '—'}</b><span className="flex-1" /><LegendeDispo /></div>}
          <AgendaSemaine base={baseVue} modeles={modeles} mode={enBase ? 'base' : 'peindre'} desactive={!peutIci}
            valeur={(j, c) => peint.get(`${j}|${c.debut}`) ?? 1} herite={enBase ? null : herite} onCase={changer} />
        </div>

        <div className="w-[300px] flex-none space-y-3">
          {enBase && (
            <div className="carte p-3 space-y-2">
              <b className="text-sm">Les blocs de cours</b>
              <div className="space-y-1">
                {modeles.map(m => (
                  <div key={`${m.debut}|${m.fin}`} className="flex items-center gap-2 text-second">
                    <span className="tabular-nums w-[92px]">{m.debut}–{m.fin}</span>
                    <span className="text-slate-500 text-xs flex-1">{baseVue.filter(c => c.debut === m.debut && c.fin === m.fin).length} jour(s)</span>
                    {peutBase && <>
                      <button className="bouton !h-7 !px-2 text-xs" onClick={() => poserPartout(m, [1, 2, 3, 4, 5])} title="Poser ce bloc du lundi au vendredi">Lu–ve</button>
                      <button className="bouton !h-7 !px-2 text-xs" onClick={() => retirerModele(m)} title="Retirer ce bloc de tous les jours">✕</button></>}
                  </div>))}
              </div>
              {peutBase && <div className="flex items-center gap-1 pt-2 border-t border-slate-200">
                <input type="time" className="controle !h-8 w-[96px]" value={nouveau.debut} onChange={e => setNouveau(n => ({ ...n, debut: e.target.value }))} />
                <span>–</span>
                <input type="time" className="controle !h-8 w-[96px]" value={nouveau.fin} onChange={e => setNouveau(n => ({ ...n, fin: e.target.value }))} />
                <button className="bouton !h-8" onClick={ajouterModele}>Ajouter</button>
              </div>}
              <p className="text-xs text-slate-500">Un bloc ajouté paraît en pointillé dans l’agenda : un clic le pose sur un jour, « Lu–ve » sur toute la semaine. Deux blocs d’un même jour ne se chevauchent pas.</p>
            </div>)}
          {type === 'section' && (
            <div className="carte p-3 space-y-2 text-second">
              <b className="text-sm">Priorités de {section}</b>
              <label className="flex items-center gap-2">
                <span>Un étudiant vient au plus</span>
                <select className="controle !h-8" value={regles.jours_max} disabled={!peutEcrire} onChange={e => { setRegles(r => ({ ...r, jours_max: Number(e.target.value) })); setBrouillon(b => b ?? new Map(enregistre)); }}>
                  {[2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span>jours par semaine</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!regles.regrouper} disabled={!peutEcrire} onChange={e => { setRegles(r => ({ ...r, regrouper: e.target.checked })); setBrouillon(b => b ?? new Map(enregistre)); }} />
                Regrouper les cours sur les jours où les étudiants viennent déjà
              </label>
            </div>)}
          {!enBase && (
            <div className="carte p-3 space-y-1.5">
              <b className="text-sm">Déjà peint pour {section}</b>
              {!resume.length && <p className="text-second text-slate-500">Rien encore : la simulation a toute la base.</p>}
              {resume.map(x => (
                <button key={`${x.t}|${x.c}`} className="w-full flex items-center gap-2 text-left text-second hover:underline" onClick={() => { if (x.t === type) setCible(x.c); else { setVoulue(x.c); setType(x.t); } }}>
                  <span className="flex-1 truncate">{x.nom}</span><span className="text-slate-500 tabular-nums">{x.nb}</span>
                </button>))}
            </div>)}
        </div>
      </div>
    </div>
  );
}

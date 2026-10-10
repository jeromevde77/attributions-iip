import { useEffect, useMemo, useRef, useState } from 'react';
import { api, authHeaders, getAnnee } from '../lib/api.js';
import { informer } from '../lib/dialogue.jsx';
import { passeRole } from '../lib/droits.js';
import { teinteCours, styleTuileCours } from '../lib/teinteCours.js';
import { IconeLaboratoire } from '../components/IconeLaboratoire.jsx';

/**
 * LE LABORATOIRE TEMPOREL DE LUCIE (Charles, 10 octobre 2026 : « on zoome pour
 * voir le détail de l'unité, on dézoome pour avoir une vision méta » ; « le verre
 * ne se voit qu'au dernier zoom, sinon c'est illisible ; pour le reste ce sont
 * des tuiles »).
 *
 * Trois niveaux, une seule source — la grille d'organisation (`/api/grille`) :
 *   · L'ANNÉE : chaque UE est une tuile posée sur ses semaines ; on la glisse
 *     pour la déplacer, on tire ses bords pour l'allonger. Ses dates sont celles
 *     de Dates des UE (organisation_ue) : rien n'est doublé.
 *   · LES COUCHES : la tuile s'ouvre sur ses cours et leurs activités.
 *   · UNE UE : le VERRE. Chaque cours y occupe la hauteur de ses périodes du
 *     dossier ; on le remplit d'activités par glisser-déposer, une activité en
 *     groupes se coupe en autant de blocs. Ce qui manque se hachure.
 * Les UE qui ont lieu en même temps se rangent l'une sous l'autre.
 *
 * Dans la grille, les périodes d'une activité sont celles de l'ENSEIGNANT, tous
 * groupes confondus ; le verre montre ce que vit l'ÉTUDIANT : periodes / groupes.
 */

const NOMS_MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const parEtudiant = a => (Number(a.periodes) || 0) / Math.max(1, Number(a.groupes) || 1);
const sommeEtudiant = c => (c.activites || []).reduce((t, a) => t + parEtudiant(a), 0);
const arrondi = n => Math.round(n * 10) / 10;
const lettre = i => String.fromCharCode(65 + (i % 26));
const estGroupes = lib => /\bTP\b|travaux pratiques|labo|séminaire|seminaire/i.test(lib || '');

export default function LaboratoireTemporel() {
  const [annee] = useState(getAnnee());
  const peutEcrire = passeRole(['admin', 'editeur', 'coordination']);
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(() => { try { return localStorage.getItem('lucie.labo.section') || ''; } catch { return ''; } });
  const [bloc, setBloc] = useState('');
  const [data, setData] = useState(null);
  const [types, setTypes] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [zoom, setZoom] = useState('annee');
  const [choix, setChoix] = useState(null);           // n° de l'UE choisie
  const [glisse, setGlisse] = useState(null);         // { ue, de, a } pendant un geste

  useEffect(() => { api.sections().then(l => { const ls = Array.isArray(l) ? l : []; setSections(ls); if (!section && ls[0]) setSection(ls[0].code); }).catch(() => {}); }, []); // eslint-disable-line
  const charger = async () => {
    if (!section) return;
    try { localStorage.setItem('lucie.labo.section', section); } catch { /* préférence seulement */ }
    try {
      const r = await fetch(`/api/grille?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setData(j); setErreur(null);
    } catch (e) { setErreur(e.message); }
    fetch(`/api/grille/activites?section=${encodeURIComponent(section)}`, { headers: authHeaders() }).then(r => r.json()).then(l => setTypes(Array.isArray(l) ? l : [])).catch(() => setTypes([]));
  };
  useEffect(() => { setData(null); setChoix(null); charger(); }, [section, annee]); // eslint-disable-line

  const semaines = data?.semaines || [];
  const NB = semaines.length;
  const indexDe = num => semaines.findIndex(s => s.semaine_num === num);
  const blocs = useMemo(() => [...new Set((data?.ues || []).map(u => String(u.ue_niv || '').toUpperCase()).filter(Boolean))].sort(), [data]);
  const ues = useMemo(() => (data?.ues || []).filter(u => !bloc || String(u.ue_niv || '').toUpperCase() === bloc), [data, bloc]);
  // L'étendue d'une UE en colonnes : ses dates, sinon toute l'année de cours (à poser).
  const premiereCours = semaines.findIndex(s => s.type === 'cours'), derniereCours = semaines.map(s => s.type).lastIndexOf('cours');
  const etendue = u => {
    if (glisse && glisse.ue === u.ue_num) return { de: glisse.de, a: glisse.a, posee: true };
    const de = indexDe(u.sem_debut), a = indexDe(u.sem_fin);
    return de >= 0 && a >= 0 ? { de, a, posee: true } : { de: Math.max(0, premiereCours), a: Math.max(0, derniereCours), posee: false };
  };
  // Les pistes : une UE qui chevauche une autre passe dessous.
  const pistes = useMemo(() => {
    const fin = [], out = new Map();
    for (const u of [...ues].sort((x, y) => etendue(x).de - etendue(y).de || etendue(y).a - etendue(x).a)) {
      const e = etendue(u);
      let i = fin.findIndex(f => f < e.de);
      if (i < 0) { i = fin.length; fin.push(-1); }
      fin[i] = e.a; out.set(u.ue_num, i);
    }
    return { n: fin.length, de: out };
  }, [ues, glisse, semaines]); // eslint-disable-line

  async function poserDates(u, de, a) {
    const r = await fetch('/api/grille/ue', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({
      annee_scolaire: annee, section, ue_num: u.ue_num, date_debut: semaines[de].date_debut, date_fin: semaines[a].date_fin || semaines[a].date_debut }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
  }
  async function basculerStage(u) {
    const r = await fetch('/api/grille/ue', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee_scolaire: annee, section, ue_num: u.ue_num, stage_bloquant: !u.stage_bloquant }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
  }

  const zone = useRef(null);
  function geste(ev, u, quoi) {
    if (!peutEcrire) { setChoix(u.ue_num); return; }
    ev.preventDefault(); ev.stopPropagation();
    const larg = (zone.current?.getBoundingClientRect().width || 1) / Math.max(1, NB);
    const e0 = etendue(u), x0 = ev.clientX;
    let courant = null;
    const mv = e => {
      const dc = Math.round((e.clientX - x0) / larg);
      if (!dc && !courant) return;
      let de = e0.de, a = e0.a;
      if (quoi === 'deplacer') { const d = Math.max(-e0.de, Math.min(NB - 1 - e0.a, dc)); de += d; a += d; }
      if (quoi === 'debut') de = Math.max(0, Math.min(e0.a, e0.de + dc));
      if (quoi === 'fin') a = Math.min(NB - 1, Math.max(e0.de, e0.a + dc));
      courant = { ue: u.ue_num, de, a }; setGlisse(courant);
    };
    const up = async () => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      if (!courant) { setChoix(u.ue_num); return; }
      setChoix(u.ue_num);
      await poserDates(u, courant.de, courant.a);
      setGlisse(null);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }

  const ueChoisie = (data?.ues || []).find(u => u.ue_num === choix) || null;
  const stagesBloquants = ues.filter(u => u.stage && u.stage_bloquant && etendue(u).posee).map(etendue);
  // Seule une UE POSÉE peut tomber pendant le stage : sans dates, on ne sait pas.
  const pendantStage = u => !u.stage && etendue(u).posee && stagesBloquants.some(s => etendue(u).de <= s.a && etendue(u).a >= s.de);

  const molette = e => { if (!e.ctrlKey) return; e.preventDefault(); const z = ['annee', 'couches', 'ue'], i = z.indexOf(zoom) + (e.deltaY < 0 ? 1 : -1); if (z[i] === 'ue' && !ueChoisie) return; if (z[i]) setZoom(z[i]); };

  return (
    <div className="space-y-3">
      {/* LES BOUTONS EN HAUT. */}
      <div className="flex flex-wrap items-center gap-2">
        <IconeLaboratoire size={26} className="text-iip-blue" />
        <b className="text-[15px] text-iip-blue mr-2">Le laboratoire temporel</b>
        <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <select className="controle" value={bloc} onChange={e => setBloc(e.target.value)}>
          <option value="">Tous les blocs</option>
          {blocs.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="segments flex h-9">
          {[['annee', 'L’année'], ['couches', 'Les couches'], ['ue', 'Une UE']].map(([k, l]) => (
            <button key={k} disabled={k === 'ue' && !ueChoisie} onClick={() => setZoom(k)}
              className={`px-3 text-[12.5px] ${zoom === k ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'} disabled:opacity-40`}>{l}</button>))}
        </div>
        <span className="text-[12px] text-slate-500">{zoom === 'ue' ? 'Glisser une activité dans un cours ; tirer le haut d’une couche.' : 'Ctrl + molette pour zoomer · glisser une tuile la déplace dans l’année, ses bords l’allongent · double-clic : son verre.'}</span>
      </div>
      {erreur && <div className="text-[12.5px]" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}
      {!data && !erreur && <div className="text-[13px] text-slate-400">Chargement…</div>}

      {data && zoom !== 'ue' && (
        <div className="carte p-3 overflow-x-auto" onWheel={molette}>
          <div className="min-w-[980px] relative">
            {/* Les mois, puis les semaines : cours numérotées, évaluations « É ». */}
            <Entete semaines={semaines} />
            <div ref={zone} className="relative" style={{ height: pistes.n * (zoom === 'annee' ? 62 : hauteurCouches(ues) + 8) + 4 }}>
              <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${NB}, minmax(0,1fr))` }}>
                {semaines.map((s, i) => <div key={i} style={{ background: fondSemaine(s.type), boxShadow: stagesBloquants.some(x => i >= x.de && i <= x.a) ? 'inset 0 0 0 999px rgba(71,85,105,.08)' : undefined }} />)}
              </div>
              {ues.map(u => {
                const e = etendue(u), p = pistes.de.get(u.ue_num) || 0, h = zoom === 'annee' ? 54 : hauteurCouches(ues);
                return (
                  <TuileUE key={u.ue_num} u={u} zoom={zoom} choisie={choix === u.ue_num} posee={e.posee} pendantStage={pendantStage(u)}
                    style={{ left: `calc(${e.de / NB * 100}% + 1px)`, width: `calc(${(e.a - e.de + 1) / NB * 100}% - 2px)`, top: p * (h + 8), height: h }}
                    onDeplacer={ev => geste(ev, u, 'deplacer')} onDebut={ev => geste(ev, u, 'debut')} onFin={ev => geste(ev, u, 'fin')}
                    onOuvrir={() => { setChoix(u.ue_num); setZoom('ue'); }} />);
              })}
            </div>
          </div>
        </div>)}

      {data && zoom !== 'ue' && ueChoisie && (
        <ResumeUE u={ueChoisie} semaines={semaines} peutEcrire={peutEcrire} pendantStage={pendantStage(ueChoisie)}
          onStage={() => basculerStage(ueChoisie)} onOuvrir={() => setZoom('ue')} />)}

      {data && zoom === 'ue' && ueChoisie && (
        <Verre key={`${ueChoisie.ue_num}-${data.ues.indexOf(ueChoisie)}`} u={ueChoisie} types={types} annee={annee} section={section}
          peutEcrire={peutEcrire} onRetour={() => setZoom('couches')} onEnregistre={charger} />)}

      <div className="flex flex-wrap gap-4 text-[12px] text-slate-500">
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-[3px]" style={{ background: fondSemaine('ev1') }} />évaluations</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-[3px] border border-slate-200" style={{ background: fondSemaine('vacances') }} />vacances</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-[3px] border border-dashed border-slate-400" />dates à poser</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-[3px]" style={{ background: HACHURE }} />périodes encore à remplir</span>
      </div>
    </div>
  );
}

const HACHURE = 'repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--c-attente, #B45309) 28%, transparent) 5px 10px)';
const fondSemaine = t => (t === 'ev1' || t === 'ev2' ? 'color-mix(in srgb, var(--c-attente, #B45309) 13%, transparent)'
  : t === 'cours' ? 'transparent' : 'repeating-linear-gradient(135deg, #EEF1F5 0 4px, transparent 4px 8px)');
const hauteurCouches = ues => 36 + 22 * Math.max(1, ...ues.map(u => (u.cours || []).length));

function Entete({ semaines }) {
  const NB = semaines.length;
  const mois = [];
  semaines.forEach((s, i) => { const m = String(s.date_debut).slice(0, 7); if (!mois.length || mois[mois.length - 1].m !== m) mois.push({ m, de: i }); });
  let n = 0;
  return (<>
    <div className="grid text-[10.5px] text-slate-500" style={{ gridTemplateColumns: `repeat(${NB}, minmax(0,1fr))` }}>
      {mois.map((m, i) => <div key={m.m} className="border-l border-slate-200 pl-1 truncate" style={{ gridColumn: `${m.de + 1} / ${(mois[i + 1]?.de ?? NB) + 1}` }}>{NOMS_MOIS[Number(m.m.slice(5, 7)) - 1]}</div>)}
    </div>
    <div className="grid text-[10.5px] text-slate-400 mb-1" style={{ gridTemplateColumns: `repeat(${NB}, minmax(0,1fr))` }}>
      {semaines.map((s, i) => <div key={i} className="text-center tabular-nums" title={s.label || s.type}>{s.type === 'cours' ? ++n : String(s.type).startsWith('ev') ? 'É' : ''}</div>)}
    </div>
  </>);
}

/* UNE TUILE PAR UE — la tuile de Lucie : blanche, liseré de la couleur de l'UE,
   texte à l'encre. Le stage est hachuré ; une UE sans dates, en pointillé. */
function TuileUE({ u, zoom, choisie, posee, pendantStage, style, onDeplacer, onDebut, onFin, onOuvrir }) {
  const teinte = teinteCours(`${u.ue_num}.1`);
  const dossier = (u.cours || []).reduce((t, c) => t + (Number(c.cours_per) || 0), 0);
  const remplies = arrondi((u.cours || []).reduce((t, c) => t + Math.min(Number(c.cours_per) || 0, sommeEtudiant(c)), 0));
  return (
    <div className="absolute rounded-r-[10px] bg-white overflow-hidden select-none cursor-grab"
      style={{ ...style, borderLeft: `4px solid ${u.stage ? '#64748B' : teinte}`, border: `1px ${posee ? 'solid' : 'dashed'} ${choisie ? '#16406A' : '#D8DCE4'}`,
        borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: u.stage ? '#64748B' : teinte,
        background: u.stage ? 'repeating-linear-gradient(135deg, rgba(100,116,139,.12) 0 7px, #fff 7px 14px)' : '#fff',
        boxShadow: choisie ? '0 0 0 2px rgba(22,64,106,.25)' : undefined }}
      onPointerDown={onDeplacer} onDoubleClick={onOuvrir}
      title={`UE ${u.ue_num} — ${u.ue_nom}\n${dossier} périodes au dossier · ${remplies} posées dans la grille${posee ? '' : '\nDates à poser'}`}>
      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-[#16406A]/20" onPointerDown={onDebut} />
      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-[#16406A]/20" onPointerDown={onFin} />
      <div className="px-2 py-1 text-[12px] leading-tight text-[#1B2B4B]">
        <div className="flex items-center gap-1.5 min-w-0">
          <b className="flex-none">{u.stage ? 'Stage' : 'UE'} {u.ue_num}</b>
          <span className="truncate text-slate-600">{u.ue_nom}</span>
          {u.stage && u.stage_bloquant && <span className="flex-none px-1.5 rounded-[5px] text-[10px] font-semibold text-white" style={{ background: '#475569' }}>bloquant</span>}
          {pendantStage && <span className="flex-none px-1.5 rounded-[5px] text-[10px] font-semibold text-white" style={{ background: 'var(--c-refuse)' }} title="Cette UE a cours pendant un stage bloquant">pendant le stage</span>}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
          <span>{u.ue_niv} · {dossier} p. · {(u.cours || []).length} cours</span>
          {!posee && <span className="px-1.5 rounded-[5px] text-[10px] font-semibold text-white" style={{ background: 'var(--c-attente)' }}>dates à poser</span>}
          {!u.stage && <span className="px-1.5 rounded-[5px] text-[10px] font-semibold text-white" style={{ background: remplies >= dossier && dossier ? 'var(--c-reussi)' : 'var(--c-attente)' }}>
            {remplies >= dossier && dossier ? 'grille complète' : `grille : ${remplies}/${dossier}`}</span>}
        </div>
        {/* LES COUCHES : une ligne par cours, ses activités en tuiles. */}
        {zoom === 'couches' && (
          <div className="mt-1 space-y-[3px]">
            {(u.cours || []).map(c => {
              const s = arrondi(sommeEtudiant(c)), dp = Number(c.cours_per) || 0;
              return (
                <div key={c.cours_code} className="flex items-center gap-1 h-[19px] min-w-0">
                  <b className="flex-none w-[38px] text-[11px]">{c.cours_code}</b>
                  <span className="flex-none text-[10.5px] tabular-nums w-[46px]" style={{ color: s >= dp ? 'var(--c-reussi)' : 'var(--c-attente)' }}>{s}/{dp}</span>
                  <div className="flex gap-[3px] min-w-0 overflow-hidden">
                    {(c.activites || []).map((a, i) => (
                      <span key={i} className="flex-none px-1.5 rounded-[5px] text-[10.5px] truncate max-w-[11rem]" style={styleTuileCours(c.cours_code, { fond: 14 })}
                        title={`${a.activite_nom || 'activité'} — ${arrondi(parEtudiant(a))} p. par étudiant${a.groupes > 1 ? `, ${a.groupes} groupes` : ''}`}>
                        {a.activite_nom || 'activité'} · {arrondi(parEtudiant(a))} p.{a.groupes > 1 ? ` ×${a.groupes}` : ''}</span>))}
                    {!(c.activites || []).length && <span className="text-[10.5px] text-slate-400">à découper</span>}
                  </div>
                </div>);
            })}
          </div>)}
      </div>
    </div>
  );
}

function ResumeUE({ u, semaines, peutEcrire, pendantStage, onStage, onOuvrir }) {
  const dt = d => (d ? d.split('-').reverse().slice(0, 2).join('/') : '—');
  return (
    <div className="carte p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-[14px] text-iip-blue">{u.stage ? 'Stage' : 'UE'} {u.ue_num} — {u.ue_nom}</b>
        <span className="flex-1" />
        {!u.stage && <button className="bouton bouton-fort" onClick={onOuvrir}>Ouvrir le verre de l’UE {u.ue_num}</button>}
      </div>
      <div className="text-[12.5px] text-slate-600">
        {u.planifiee ? `Du ${dt(u.date_debut)} au ${dt(u.date_fin)}` : 'Dates à poser : glissez la tuile, ou tirez ses bords'} · {u.ue_niv} ·{' '}
        {(u.cours || []).map(c => `${c.cours_code} : ${arrondi(sommeEtudiant(c))}/${c.cours_per}`).join(' · ')}
      </div>
      {u.stage && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={!!u.stage_bloquant} disabled={!peutEcrire} onChange={onStage} />
          Stage bloquant : aucun cours du bloc pendant ses semaines
        </label>)}
      {pendantStage && <div className="text-[12.5px]" style={{ color: 'var(--c-refuse)' }}>Cette UE a cours pendant un stage bloquant : la simulation n’y placera rien ces semaines-là.</div>}
    </div>
  );
}

/* LE VERRE — au dernier zoom seulement. On le remplit par glisser-déposer. */
function Verre({ u, types, annee, section, peutEcrire, onRetour, onEnregistre }) {
  const [cours, setCours] = useState(() => (u.cours || []).map(c => ({ ...c, activites: (c.activites || []).map(a => ({ ...a, groupes: Math.max(1, Number(a.groupes) || 1) })) })));
  const [choix, setChoix] = useState(null);           // { c, k }
  const [modifies, setModifies] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);
  const [cible, setCible] = useState(null);
  /* LA BARRE NE PORTE QUE LES ACTIVITÉS COURANTES : la liste de la maison en
     compte soixante-dix, rôles administratifs compris. Les autres se tirent
     d'un menu et rejoignent la barre le temps du travail. */
  const COURANTES = /^(théorie|exercices|travaux pratiques|laboratoire|stage|séminaire|clinique|atelier)\b/i;
  const [ajoutees, setAjoutees] = useState([]);
  const barre = types.filter(t => (COURANTES.test(t.libelle || '') && !t.section) || ajoutees.includes(String(t.id)))
    .concat(types.filter(t => t.role === 'evaluation').slice(0, 1))
    .filter((t, i, l) => l.findIndex(x => x.id === t.id) === i);
  const total = cours.reduce((t, c) => t + Math.max(Number(c.cours_per) || 0, sommeEtudiant(c)), 0);
  const PX = Math.max(2.4, Math.min(5, 560 / Math.max(1, total)));
  const changer = (ci, f) => { setCours(cs => cs.map((c, i) => (i === ci ? f(c) : c))); setModifies(m => new Set(m).add(ci)); };
  const teinteCouche = (c, k) => { const base = teinteCours(c.cours_code); return k % 2 ? `color-mix(in srgb, ${base} 72%, white)` : base; };

  async function enregistrer() {
    setEnCours(true);
    try {
      for (const ci of modifies) {
        const c = cours[ci];
        const r = await fetch('/api/grille/cours', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({
          annee_scolaire: annee, section, ue_num: u.ue_num, cours_code: c.cours_code,
          date_debut: c.date_debut || null, date_fin: c.date_fin || null, autonomie_placee: c.autonomie_placee || 0, evaluation_mode: c.evaluation_mode || 'examen',
          activites: c.activites.map(a => ({ activite_id: a.activite_id, periodes: a.periodes, groupes: a.groupes, vu_etudiant: a.vu_etudiant !== 0 })) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
        if (j.repli?.applique) await informer(`${c.cours_code} : un cours ne s’enregistre pas vide — il revient à son contenu du dossier, ${j.repli.periodes} périodes de matière.`);
      }
      setModifies(new Set());
      await onEnregistre();
    } catch (e) { await informer(`❌ ${e.message}`); } finally { setEnCours(false); }
  }

  function deposer(ci, typeId) {
    const t = types.find(x => String(x.id) === String(typeId));
    if (!t) return;
    const g = estGroupes(t.libelle) ? 4 : 1;
    changer(ci, c => ({ ...c, activites: [...c.activites, { activite_id: t.id, activite_nom: t.libelle, periodes: 4 * g, groupes: g, vu_etudiant: 1 }] }));
    setChoix({ c: ci, k: cours[ci].activites.length });
  }
  function tirer(ev, ci, k) {
    if (!peutEcrire) return;
    ev.preventDefault(); ev.stopPropagation();
    const a0 = cours[ci].activites[k], y0 = ev.clientY, p0 = parEtudiant(a0);
    const mv = e => { const p = Math.max(1, Math.round(p0 + (y0 - e.clientY) / PX)); changer(ci, c => ({ ...c, activites: c.activites.map((a, i) => (i === k ? { ...a, periodes: p * a.groupes } : a)) })); };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    setChoix({ c: ci, k });
  }
  const act = choix ? cours[choix.c]?.activites[choix.k] : null;
  const regler = f => changer(choix.c, c => ({ ...c, activites: c.activites.map((a, i) => (i === choix.k ? f(a) : a)) }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="bouton" onClick={onRetour}>← Les couches</button>
        <b className="text-[14px] text-iip-blue">UE {u.ue_num}</b><span className="text-[12.5px] text-slate-500 truncate">{u.ue_nom}</span>
        <span className="flex-1" />
        {peutEcrire && <button className="bouton bouton-fort" disabled={!modifies.size || enCours} onClick={enregistrer}>
          {enCours ? 'Enregistrement…' : modifies.size ? `Enregistrer (${modifies.size} cours)` : 'Enregistré'}</button>}
      </div>
      {peutEcrire && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-slate-500 font-semibold">Glisser dans un cours :</span>
          {barre.map(t => (
            <span key={t.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(t.id))}
              className="controle !h-8 inline-flex items-center gap-1.5 cursor-grab bg-white text-[12.5px]">
              <i className="inline-block w-2.5 h-2.5 rounded-[3px]" style={{ background: t.role === 'evaluation' ? '#B45309' : estGroupes(t.libelle) ? '#2F6FB0' : '#16406A' }} />{t.libelle}</span>))}
          <select className="controle !h-8 text-[12.5px] max-w-[16rem]" value="" onChange={e => e.target.value && setAjoutees(a => [...a, e.target.value])}>
            <option value="">Autre activité…</option>
            {types.filter(t => !barre.some(x => x.id === t.id)).map(t => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </select>
        </div>)}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div className="carte p-4 overflow-x-auto flex gap-2">
          {/* La graduation, tous les 10 périodes. */}
          <div className="relative w-8 flex-none" style={{ height: total * PX + 8 }}>
            {Array.from({ length: Math.floor(total / 10) + 1 }, (_, i) => (
              <span key={i} className="absolute right-1 text-[10px] text-slate-400 tabular-nums" style={{ bottom: i * 10 * PX + 4, transform: 'translateY(50%)' }}>{i * 10}</span>))}
          </div>
          <div className="pr-[220px]">
            <div className="relative w-[440px] flex flex-col-reverse p-1 rounded-b-[26px] border-[3px] border-t-0" style={{ borderColor: '#16406A', background: '#EEF3F9' }}>
              {cours.map((c, ci) => {
                const s = sommeEtudiant(c), dp = Number(c.cours_per) || 0, manque = arrondi(dp - s);
                return (
                  <div key={c.cours_code} className="relative flex flex-col-reverse border-t-2 border-dashed border-slate-400"
                    style={{ height: Math.max(dp, s) * PX, outline: cible === ci ? '3px solid #16406A' : undefined, outlineOffset: -3 }}
                    onDragOver={e => { if (peutEcrire) { e.preventDefault(); setCible(ci); } }} onDragLeave={() => setCible(null)}
                    onDrop={e => { e.preventDefault(); setCible(null); deposer(ci, e.dataTransfer.getData('text/plain')); }}>
                    {c.activites.map((a, k) => {
                      const p = parEtudiant(a), col = teinteCouche(c, k), on = choix && choix.c === ci && choix.k === k;
                      return (
                        <div key={k} className="relative flex-none flex gap-[3px] py-[2px] cursor-pointer" style={{ height: p * PX }} onClick={() => setChoix({ c: ci, k })}>
                          {Array.from({ length: a.groupes }, (_, g) => (
                            <div key={g} className="flex-1 min-w-0 rounded-[5px] flex items-center justify-center gap-1 overflow-hidden whitespace-nowrap text-white text-[11px] font-semibold"
                              style={{ background: col, boxShadow: on ? '0 0 0 2px #16406A' : undefined }} title={`${a.activite_nom || 'activité'} — ${arrondi(p)} p. par étudiant${a.groupes > 1 ? ` · groupe ${lettre(g)}` : ''}`}>
                              {a.groupes > 1 ? <span className="bg-white text-[#16253D] rounded-[4px] px-1 text-[10px]">{lettre(g)}</span> : (p * PX > 13 ? `${a.activite_nom || 'activité'} · ${arrondi(p)} p.` : '')}
                            </div>))}
                          {peutEcrire && <div className="absolute left-0 right-0 -top-[3px] h-[7px] cursor-ns-resize z-10 hover:bg-[#16406A]/30" onPointerDown={e => tirer(e, ci, k)} title="Tirer : les périodes" />}
                        </div>);
                    })}
                    {manque > 0 && <div className="flex-none flex items-center justify-center text-[11px] font-semibold" style={{ height: manque * PX, background: HACHURE, color: 'var(--c-attente)' }}>{manque * PX > 12 ? `à remplir · ${manque} p.` : ''}</div>}
                    <div className="absolute bottom-0 text-[12px] leading-tight w-[205px]" style={{ left: 'calc(100% + 14px)' }}>
                      <b className="block text-[13px]">{c.cours_code}</b>
                      <span className="text-slate-600">{String(c.cours_nom || '').slice(0, 60)}</span><br />
                      <span className="font-semibold" style={{ color: manque === 0 ? 'var(--c-reussi)' : manque > 0 ? 'var(--c-attente)' : 'var(--c-refuse)' }}>
                        {arrondi(s)} / {dp} périodes{manque > 0 ? ` — il en manque ${manque}` : manque < 0 ? ` — ${-manque} de trop` : ' — complet'}</span>
                    </div>
                  </div>);
              })}
            </div>
          </div>
        </div>
        <aside className="carte p-3 space-y-2 self-start text-[13px]">
          {!act ? <p className="text-slate-500">Cliquez une couche du verre pour la régler. Glissez une activité de la barre dans un cours pour en ajouter une.</p> : (<>
            <b className="text-iip-blue">{cours[choix.c].cours_code} — {act.activite_nom || 'activité'}</b>
            <label className="grid gap-1 text-[12px] text-slate-500">Activité
              <select className="controle w-full min-w-0" disabled={!peutEcrire} value={act.activite_id || ''} onChange={e => { const t = types.find(x => String(x.id) === e.target.value); regler(a => ({ ...a, activite_id: t?.id, activite_nom: t?.libelle })); }}>
                {types.map(t => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select></label>
            <label className="grid gap-1 text-[12px] text-slate-500">Périodes par étudiant
              <input type="number" min="1" className="controle" disabled={!peutEcrire} value={arrondi(parEtudiant(act))}
                onChange={e => { const p = Math.max(1, Number(e.target.value) || 1); regler(a => ({ ...a, periodes: p * a.groupes })); }} /></label>
            <div className="text-[12px] text-slate-500">Groupes
              <div className="flex items-center gap-2 mt-1">
                <button className="bouton !h-8" disabled={!peutEcrire || act.groupes <= 1} onClick={() => regler(a => ({ ...a, periodes: parEtudiant(a) * (a.groupes - 1), groupes: a.groupes - 1 }))}>−</button>
                <b className="text-[14px] text-[#1B2B4B] tabular-nums">{act.groupes}</b>
                <button className="bouton !h-8" disabled={!peutEcrire || act.groupes >= 30} onClick={() => regler(a => ({ ...a, periodes: parEtudiant(a) * (a.groupes + 1), groupes: a.groupes + 1 }))}>+</button>
                <span>{act.groupes > 1 ? `blocs ${Array.from({ length: act.groupes }, (_, g) => lettre(g)).join(', ')}` : 'tout le bloc ensemble'}</span>
              </div></div>
            <div className="text-[12px] text-slate-500">Côté enseignant : {arrondi(Number(act.periodes) || 0)} période(s), tous groupes confondus.</div>
            {peutEcrire && <button className="bouton bouton-detruire" onClick={() => { changer(choix.c, c => ({ ...c, activites: c.activites.filter((_, i) => i !== choix.k) })); setChoix(null); }}>Retirer cette couche</button>}
          </>)}
          <div className="text-[11.5px] text-slate-400 pt-1 border-t border-slate-100">Les disponibilités des enseignants viendront ici, saisies par le secrétariat ou la coordination (lot à venir).</div>
        </aside>
      </div>
    </div>
  );
}

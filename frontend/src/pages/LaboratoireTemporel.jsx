import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api, authHeaders, getAnnee } from '../lib/api.js';
import { demander, informer, saisir } from '../lib/dialogue.jsx';
import { passeRole } from '../lib/droits.js';
import { teinteCours, styleTuileCours } from '../lib/teinteCours.js';
import { IconeLaboratoire } from '../components/IconeLaboratoire.jsx';
import { IconSitemap, IconPuzzle, IconCalendarWeek, IconTimeline } from '@tabler/icons-react';
const StructureSection = lazy(() => import('./StructureSection.jsx'));
const GroupesCommuns = lazy(() => import('./GroupesCommuns.jsx'));
const SimulationAnnee = lazy(() => import('./GroupesCommuns.jsx').then(m => ({ default: m.SimulationAnnee })));

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
  /* UN SEUL LABORATOIRE (Charles, 10 octobre 2026 : « réunis tout dans le labo ») :
     quatre faces sur la même section et le même bloc — le temps (l'année, les
     couches, le verre), les groupes (briques, plan des groupes), la semaine
     (simulation, plan enregistré) et le schéma de capitalisation. */
  const [face, setFace] = useState(() => {
    try { const q = new URLSearchParams(window.location.search); return q.get('face') || (q.get('onglet') === 'groupes-communs' ? 'groupes' : 'temps'); } catch { return 'temps'; }
  });
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
  /* LES PISTES NE BOUGENT PAS SOUS LA MAIN (Charles, 10 octobre 2026 : « quand je
     change la taille d'une tuile, elle bascule en bas ; on dirait un bug »). Elles
     se rangeaient dans l'ordre des DATES : raccourcir une UE changeait son rang, et
     la tuile sautait de piste. Elles se rangent désormais dans l'ordre du NUMÉRO
     d'UE — chaque UE prend la première piste où elle ne chevauche personne —, et
     elles se calculent sur les dates ENREGISTRÉES : pendant le geste, rien ne bouge. */
  const etendueEnregistree = u => {
    const de = indexDe(u.sem_debut), a = indexDe(u.sem_fin);
    return de >= 0 && a >= 0 ? { de, a } : { de: Math.max(0, premiereCours), a: Math.max(0, derniereCours) };
  };
  const pistes = useMemo(() => {
    const occupe = [], out = new Map();
    for (const u of [...ues].sort((x, y) => x.ue_num - y.ue_num)) {
      const e = etendueEnregistree(u);
      let i = occupe.findIndex(l => l.every(x => x.a < e.de || x.de > e.a));
      if (i < 0) { i = occupe.length; occupe.push([]); }
      occupe[i].push(e); out.set(u.ue_num, i);
    }
    return { n: occupe.length, de: out };
  }, [ues, semaines]); // eslint-disable-line

  async function poserDates(u, de, a) {
    const r = await fetch('/api/grille/ue', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({
      annee_scolaire: annee, section, ue_num: u.ue_num, date_debut: semaines[de].date_debut, date_fin: semaines[a].date_fin || semaines[a].date_debut }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
  }
  async function basculerConges(u) {
    const r = await fetch('/api/grille/ue', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee_scolaire: annee, section, ue_num: u.ue_num, cours_pendant_conges: !u.cours_pendant_conges }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErreur(j.error || `Erreur ${r.status}`); return; }
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

  /* LES COUCHES DANS LE TEMPS (Charles, 10 octobre 2026 : « le contenu de la tuile
     est le reflet du verre, mais temporellement : l'évaluation à la fin, théorie
     et exercices en suivant ou en parallèle »). Chaque cours est une petite ligne
     du temps de ses activités ; deux activités qui se chevauchent passent l'une
     sous l'autre. Une activité sans dates court sur toute l'unité — l'évaluation,
     elle, se place d'office sur sa dernière semaine de cours. */
  const evalId = data?.evaluation?.activite_id ?? null;
  const [glisseAct, setGlisseAct] = useState(null);       // { ue, cours, k, de, a }
  const idxDate = d => { if (!d) return -1; const i = semaines.findIndex(x => d >= x.date_debut && d <= (x.date_fin || x.date_debut)); if (i >= 0) return i;
    let j = -1; semaines.forEach((x, n) => { if (x.date_debut <= d) j = n; }); return j; };
  const spanAct = (u, c, a, k) => {
    if (glisseAct && glisseAct.ue === u.ue_num && glisseAct.cours === c.cours_code && glisseAct.k === k) return { de: glisseAct.de, a: glisseAct.a };
    const e = etendue(u);
    const d = idxDate(a.date_debut), f = idxDate(a.date_fin);
    if (d >= 0 && f >= 0) return { de: Math.max(e.de, Math.min(d, e.a)), a: Math.max(e.de, Math.min(f, e.a)) };
    if (evalId != null && Number(a.activite_id) === Number(evalId)) {
      let i = e.a; while (i > e.de && semaines[i]?.type !== 'cours') i--;
      return { de: i, a: i };
    }
    return { de: e.de, a: e.a };
  };
  const couchesDe = u => (u.cours || []).map(c => {
    const lignes = [];
    (c.activites || []).map((act, k) => { const sp = spanAct(u, c, act, k); return { act, k, de: sp.de, fin: sp.a }; })
      .sort((x, y) => x.de - y.de || y.fin - x.fin).forEach(x => {
      let i = lignes.findIndex(l => l.every(y => y.fin < x.de || y.de > x.fin));
      if (i < 0) { i = lignes.length; lignes.push([]); }
      lignes[i].push(x);
    });
    return { c, lignes };
  });
  const hauteurUE = u => (zoom === 'annee' ? 54 : 40 + couchesDe(u).reduce((t, x) => t + 15 + 19 * Math.max(1, x.lignes.length), 0));
  // Une piste fait la hauteur de sa plus haute tuile ; les suivantes s'empilent dessous.
  const hauteursPistes = Array.from({ length: pistes.n }, (_, i) => Math.max(54, ...ues.filter(u => pistes.de.get(u.ue_num) === i).map(hauteurUE)));
  const hautDePiste = i => hauteursPistes.slice(0, i).reduce((t, h) => t + h + 8, 0);

  async function ecrireActivites(u, c, activites) {
    const r = await fetch('/api/grille/cours', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({
      annee_scolaire: annee, section, ue_num: u.ue_num, cours_code: c.cours_code,
      date_debut: c.date_debut || null, date_fin: c.date_fin || null, autonomie_placee: c.autonomie_placee || 0, evaluation_mode: c.evaluation_mode || 'examen',
      activites: activites.map(a => ({ activite_id: a.activite_id, periodes: a.periodes, groupes: a.groupes || 1, vu_etudiant: a.vu_etudiant !== 0,
        date_debut: a.date_debut || null, date_fin: a.date_fin || null })) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
  }
  /* À LA SUITE OU EN PARALLÈLE, D'UN CLIC (Charles, 10 octobre 2026 : « jouer sur
     les juxtapositions et déterminer la temporalité »). À la suite : les activités
     s'enchaînent dans l'ordre du verre, chacune sur une durée proportionnelle à ses
     périodes, l'évaluation sur la dernière semaine. En parallèle : toutes sur toute
     l'unité. On ajuste ensuite barre par barre. */
  async function arranger(u, c, facon) {
    const e = etendue(u);
    const sem = semaines.map((x, i) => ({ x, i })).filter(({ x, i }) => i >= e.de && i <= e.a && (x.type === 'cours' || (u.cours_pendant_conges && x.type === 'vacances'))).map(({ i }) => i);
    if (!sem.length) return;
    const date = (i, fin) => (fin ? semaines[i].date_fin || semaines[i].date_debut : semaines[i].date_debut);
    let acts;
    if (facon === 'parallele') acts = c.activites.map(a => ({ ...a, date_debut: date(sem[0]), date_fin: date(sem[sem.length - 1], true) }));
    else {
      const estEval = a => evalId != null && Number(a.activite_id) === Number(evalId);
      const evals = c.activites.filter(estEval), autres = c.activites.filter(a => !estEval(a));
      const dispo = evals.length ? sem.slice(0, -1) : sem;
      const tot = autres.reduce((t, a) => t + parEtudiant(a), 0) || 1;
      let curseur = 0;
      const places = new Map();
      autres.forEach((a, n) => {
        const part = n === autres.length - 1 ? dispo.length - curseur : Math.max(1, Math.round(dispo.length * parEtudiant(a) / tot));
        const de = Math.min(curseur, dispo.length - 1), fin = Math.min(dispo.length - 1, curseur + part - 1);
        places.set(a, { de: dispo[de], fin: dispo[Math.max(de, fin)] }); curseur = fin + 1;
      });
      acts = c.activites.map(a => {
        if (estEval(a)) return { ...a, date_debut: date(sem[sem.length - 1]), date_fin: date(sem[sem.length - 1], true) };
        const p = places.get(a);
        return { ...a, date_debut: date(p.de), date_fin: date(p.fin, true) };
      });
    }
    await ecrireActivites(u, c, acts);
  }
  function gesteAct(ev, u, c, k, quoi) {
    if (!peutEcrire) return;
    ev.preventDefault(); ev.stopPropagation();
    const e = etendue(u), larg = (zone.current?.getBoundingClientRect().width || 1) / Math.max(1, NB);
    const s0 = spanAct(u, c, c.activites[k], k), x0 = ev.clientX;
    let courant = null;
    const mv = m => {
      const dc = Math.round((m.clientX - x0) / larg);
      if (!dc && !courant) return;
      let de = s0.de, a = s0.a;
      if (quoi === 'deplacer') { const d = Math.max(e.de - s0.de, Math.min(e.a - s0.a, dc)); de += d; a += d; }
      if (quoi === 'debut') de = Math.max(e.de, Math.min(s0.a, s0.de + dc));
      if (quoi === 'fin') a = Math.min(e.a, Math.max(s0.de, s0.a + dc));
      courant = { ue: u.ue_num, cours: c.cours_code, k, de, a }; setGlisseAct(courant);
    };
    const up = async () => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      if (!courant) return;
      const acts = c.activites.map((a, i) => (i === k ? { ...a, date_debut: semaines[courant.de].date_debut, date_fin: semaines[courant.a].date_fin || semaines[courant.a].date_debut } : a));
      await ecrireActivites(u, c, acts);
      setGlisseAct(null);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }

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
        {face === 'temps' && <div className="segments flex h-9">
          {[['annee', 'L’année'], ['couches', 'Les couches'], ['ue', 'Une UE']].map(([k, l]) => (
            <button key={k} disabled={k === 'ue' && !ueChoisie} onClick={() => setZoom(k)}
              className={`px-3 text-[12.5px] ${zoom === k ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'} disabled:opacity-40`}>{l}</button>))}
        </div>}
        <span className="text-[12px] text-slate-500">{face !== 'temps' ? '' : zoom === 'ue' ? 'Glisser une activité dans un cours ; tirer le haut d’une couche ; double-clic : revenir à l’année.' : (zoom === 'couches' ? 'Glisser une barre la déplace, ses bords l’allongent ; « à la suite » ou « en parallèle » arrangent un cours d’un clic · double-clic : le verre.' : 'Ctrl + molette ou double-clic pour zoomer · glisser une tuile la déplace dans l’année, ses bords l’allongent.')}</span>
      </div>
      {/* LES FACES DU LABORATOIRE : des onglets soulignés (on tourne une page du même objet). */}
      <div className="flex gap-5 border-b border-slate-200">
        {[['temps', 'Le temps', IconTimeline], ['groupes', 'Les groupes', IconPuzzle], ['semaine', 'La semaine', IconCalendarWeek], ['schema', 'Schéma de capitalisation', IconSitemap]].map(([k, l, I]) => (
          <button key={k} onClick={() => { setFace(k); if ((k === 'groupes' || k === 'semaine') && !bloc && blocs[0]) setBloc(blocs.includes('BA2') ? 'BA2' : blocs[0]); }}
            className={`${face === k ? 'onglet-page onglet-page-actif' : 'onglet-page'} inline-flex items-center gap-1.5`}><I size={15} />{l}</button>))}
      </div>
      {erreur && <div className="text-[12.5px]" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}
      {!data && !erreur && <div className="text-[13px] text-slate-400">Chargement…</div>}

      {face === 'groupes' && (bloc ? (
        <Suspense fallback={<div className="text-[13px] text-slate-400">Chargement…</div>}>
          <GroupesCommuns key={`${section}-${bloc}`} sectionImposee={section} blocImpose={bloc} dansLeLabo />
        </Suspense>) : <p className="text-[13px] text-slate-500">Choisissez un bloc : les groupes se font bloc par bloc.</p>)}
      {face === 'semaine' && (bloc ? (
        <Suspense fallback={<div className="text-[13px] text-slate-400">Chargement…</div>}>
          <SimulationAnnee key={`${section}-${bloc}`} section={section} bloc={bloc} annee={annee} peutEcrire={peutEcrire} />
        </Suspense>) : <p className="text-[13px] text-slate-500">Choisissez un bloc : la semaine se compose bloc par bloc.</p>)}

      {face === 'schema' && (
        <Suspense fallback={<div className="text-[13px] text-slate-400">Chargement…</div>}>
          <StructureSection key={section} annee={annee} sectionInitiale={section} />
        </Suspense>)}

      {face === 'temps' && data && zoom !== 'ue' && (
        <div className="carte p-3 overflow-x-auto" onWheel={molette}>
          <div className="min-w-[980px] relative">
            {/* Les mois, puis les semaines : cours numérotées, évaluations « É ». */}
            <Entete semaines={semaines} />
            <div ref={zone} className="relative" style={{ height: hautDePiste(pistes.n) + 4 }}>
              <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${NB}, minmax(0,1fr))` }}>
                {semaines.map((s, i) => <div key={i} style={{ background: fondSemaine(s.type), boxShadow: stagesBloquants.some(x => i >= x.de && i <= x.a) ? 'inset 0 0 0 999px rgba(71,85,105,.08)' : undefined }} />)}
              </div>
              {ues.map(u => {
                const e = etendue(u), p = pistes.de.get(u.ue_num) || 0, h = hauteursPistes[p];
                return (
                  <TuileUE key={u.ue_num} u={u} zoom={zoom} choisie={choix === u.ue_num} posee={e.posee} pendantStage={pendantStage(u)}
                    style={{ left: `calc(${e.de / NB * 100}% + 1px)`, width: `calc(${(e.a - e.de + 1) / NB * 100}% - 2px)`, top: hautDePiste(p), height: h }}
                    couches={zoom === 'couches' ? couchesDe(u) : null} span={e} semaines={semaines} peutEcrire={peutEcrire}
                    onActivite={(ev, c, k, quoi) => gesteAct(ev, u, c, k, quoi)} onArranger={(c, f) => arranger(u, c, f)}
                    onDeplacer={ev => geste(ev, u, 'deplacer')} onDebut={ev => geste(ev, u, 'debut')} onFin={ev => geste(ev, u, 'fin')}
                    onOuvrir={() => {
                      /* LE DOUBLE-CLIC ZOOME (Charles, 10 octobre 2026) : l'année → les
                         couches → le verre ; dans le verre, il ramène à l'année. */
                      setChoix(u.ue_num);
                      setZoom(z => (z === 'annee' ? 'couches' : u.stage ? 'annee' : 'ue'));
                    }} />);
              })}
            </div>
          </div>
        </div>)}

      {face === 'temps' && data && zoom !== 'ue' && ueChoisie && (
        <ResumeUE u={ueChoisie} semaines={semaines} peutEcrire={peutEcrire} pendantStage={pendantStage(ueChoisie)}
          onStage={() => basculerStage(ueChoisie)} onConges={() => basculerConges(ueChoisie)} onOuvrir={() => setZoom('ue')} />)}

      {face === 'temps' && data && zoom === 'ue' && ueChoisie && (
        <Verre key={`${ueChoisie.ue_num}-${data.ues.indexOf(ueChoisie)}`} u={ueChoisie} types={types} annee={annee} section={section}
          peutEcrire={peutEcrire} onRetour={() => setZoom('couches')} onAnnee={() => setZoom('annee')} onEnregistre={charger} />)}

      {face === 'temps' && <div className="flex flex-wrap gap-4 text-[12px] text-slate-500">
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-[3px]" style={{ background: fondSemaine('ev1') }} />évaluations</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-[3px] border border-slate-200" style={{ background: fondSemaine('vacances') }} />vacances</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-[3px] border border-dashed border-slate-400" />dates à poser</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-[3px]" style={{ background: HACHURE }} />périodes encore à remplir</span>
      </div>}
    </div>
  );
}

/* DE L'UNI COLORÉ, PAS DE HACHURES (Charles, 10 octobre 2026 : « pas de lignes
   zébrées, je préfère de l'uni coloré »). */
const HACHURE = 'color-mix(in srgb, var(--c-attente, #B45309) 16%, white)';
const FOND_STAGE = 'color-mix(in srgb, #64748B 16%, white)';
const fondSemaine = t => (t === 'ev1' || t === 'ev2' ? 'color-mix(in srgb, var(--c-attente, #B45309) 13%, transparent)'
  : t === 'cours' ? 'transparent' : 'color-mix(in srgb, #64748B 9%, transparent)');

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
function TuileUE({ u, zoom, choisie, posee, pendantStage, style, onDeplacer, onDebut, onFin, onOuvrir, couches, span, semaines = [], peutEcrire, onActivite, onArranger }) {
  /* LA TUILE SE COUPE AUX VACANCES (Charles, 10 octobre 2026) : pas de cours ces
     semaines-là, sauf si l'UE a décidé d'en donner (« faites sauter les congés »). */
  const n = span ? span.a - span.de + 1 : 1;
  const coupures = span && !u.cours_pendant_conges && !u.stage
    ? semaines.map((x, i) => ({ x, i })).filter(({ x, i }) => i >= span.de && i <= span.a && x.type !== 'cours' && !String(x.type).startsWith('ev')) : [];
  const teinte = teinteCours(`${u.ue_num}.1`);
  const dossier = (u.cours || []).reduce((t, c) => t + (Number(c.cours_per) || 0), 0);
  const remplies = arrondi((u.cours || []).reduce((t, c) => t + Math.min(Number(c.cours_per) || 0, sommeEtudiant(c)), 0));
  return (
    <div className="absolute rounded-r-[10px] bg-white overflow-hidden select-none cursor-grab"
      style={{ ...style, borderLeft: `4px solid ${u.stage ? '#64748B' : teinte}`, border: `1px ${posee ? 'solid' : 'dashed'} ${choisie ? '#16406A' : '#D8DCE4'}`,
        borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: u.stage ? '#64748B' : teinte,
        // La tuile est COLORÉE de son UE, pour se lire (Charles, 10 octobre 2026).
        background: u.stage ? FOND_STAGE : `color-mix(in srgb, ${teinte} 16%, white)`,
        boxShadow: choisie ? '0 0 0 2px rgba(22,64,106,.25)' : undefined }}
      onPointerDown={onDeplacer} onDoubleClick={onOuvrir}
      title={`UE ${u.ue_num} — ${u.ue_nom}\n${dossier} périodes au dossier · ${remplies} posées dans la grille${posee ? '' : '\nDates à poser'}`}>
      {coupures.map(({ i }) => (
        <div key={`v${i}`} className="absolute top-0 bottom-0 z-0 pointer-events-none" title="Vacances : pas de cours"
          style={{ left: `calc(${(i - span.de) / n * 100}% - 4px)`, width: `calc(${100 / n}%)`, background: 'color-mix(in srgb, #64748B 22%, #F6F8FB)', borderLeft: '1px solid #fff', borderRight: '1px solid #fff' }} />))}
      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-[#16406A]/20" onPointerDown={onDebut} />
      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-[#16406A]/20" onPointerDown={onFin} />
      <div className="relative z-[1] px-2 py-1 text-[12px] leading-tight text-[#1B2B4B]">
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
        {/* LES COUCHES, DANS LE TEMPS : une ligne par cours, ses activités en barres
            posées sur leurs semaines — on les glisse, on tire leurs bords. */}
        {couches && (
          <div className="mt-1">
            {couches.map(({ c, lignes }) => {
              const s = arrondi(sommeEtudiant(c)), dp = Number(c.cours_per) || 0, n = span.a - span.de + 1;
              return (
                <div key={c.cours_code}>
                  <div className="h-[15px] text-[10.5px] leading-[15px] flex gap-1.5">
                    <b>{c.cours_code}</b><span className="tabular-nums" style={{ color: s >= dp ? 'var(--c-reussi)' : 'var(--c-attente)' }}>{s}/{dp} p.</span>
                    {!(c.activites || []).length && <span className="text-slate-400">à découper — dans le verre</span>}
                    {peutEcrire && (c.activites || []).length > 1 && <>
                      <button className="ml-1 px-1.5 rounded-[4px] border border-slate-300 bg-white text-[10px] leading-[13px] hover:border-[#16406A]"
                        onPointerDown={ev => ev.stopPropagation()} onDoubleClick={ev => ev.stopPropagation()} onClick={() => onArranger(c, 'suite')}
                        title="Enchaîner les activités dans l’ordre du verre, l’évaluation en dernier">⇢ à la suite</button>
                      <button className="px-1.5 rounded-[4px] border border-slate-300 bg-white text-[10px] leading-[13px] hover:border-[#16406A]"
                        onPointerDown={ev => ev.stopPropagation()} onDoubleClick={ev => ev.stopPropagation()} onClick={() => onArranger(c, 'parallele')}
                        title="Toutes les activités sur toute la période de l’UE">⇉ en parallèle</button></>}
                  </div>
                  {(lignes.length ? lignes : [[]]).map((l, li) => (
                    <div key={li} className="relative h-[19px] -mx-2">
                      {l.map(x => (
                        <div key={x.k} onPointerDown={ev => onActivite(ev, c, x.k, 'deplacer')} onDoubleClick={ev => ev.stopPropagation()}
                          className={`absolute top-[2px] h-[15px] rounded-[4px] px-1.5 text-[10px] leading-[15px] text-white truncate ${peutEcrire ? 'cursor-grab' : ''}`}
                          style={{ left: `calc(${(x.de - span.de) / n * 100}% + 1px)`, width: `calc(${(x.fin - x.de + 1) / n * 100}% - 2px)`,
                            background: x.act.activite_id && /valuation/i.test(x.act.activite_nom || '') ? '#B45309' : teinteCours(c.cours_code) }}
                          title={`${c.cours_code} — ${x.act.activite_nom || 'activité'} · ${arrondi(parEtudiant(x.act))} p. par étudiant${x.act.groupes > 1 ? `, ${x.act.groupes} groupes` : ''}\nGlisser : le déplacer ; tirer ses bords : l’allonger`}>
                          {peutEcrire && <span className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize" onPointerDown={ev => onActivite(ev, c, x.k, 'debut')} />}
                          {x.act.activite_nom || 'activité'} · {arrondi(parEtudiant(x.act))} p.{x.act.groupes > 1 ? ` ×${x.act.groupes}` : ''}
                          {peutEcrire && <span className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize" onPointerDown={ev => onActivite(ev, c, x.k, 'fin')} />}
                        </div>))}
                    </div>))}
                </div>);
            })}
          </div>)}
      </div>
    </div>
  );
}

function ResumeUE({ u, semaines, peutEcrire, pendantStage, onStage, onConges, onOuvrir }) {
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
      {!u.stage && (
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={!!u.cours_pendant_conges} disabled={!peutEcrire} onChange={onConges} />
          Donner cours pendant les congés — la tuile n’est plus coupée aux vacances, et la simulation peut y placer des séances
        </label>)}
      {pendantStage && <div className="text-[12.5px]" style={{ color: 'var(--c-refuse)' }}>Cette UE a cours pendant un stage bloquant : la simulation n’y placera rien ces semaines-là.</div>}
    </div>
  );
}

/* LE VERRE — au dernier zoom seulement. On le remplit par glisser-déposer. */
function Verre({ u, types, annee, section, peutEcrire, onRetour, onAnnee, onEnregistre }) {
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
  /* LA BURETTE DE L'UE (Charles, 10 octobre 2026) : l'autonomie que le dossier
     donne à l'unité, pleine au départ, qui se vide quand un cours en prend pour
     contenir ce qui déborde. La capacité d'un cours, c'est ses périodes du
     dossier plus l'autonomie qu'il a prise (grille_cours.autonomie_placee). */
  const autonomieUE = Number((u.cours || []).find(c => c.ue_autonomie != null)?.ue_autonomie) || 0;
  const autonomiePrise = cours.reduce((t, c) => t + (Number(c.autonomie_placee) || 0), 0);
  const autonomieReste = arrondi(autonomieUE - autonomiePrise);
  const capacite = c => (Number(c.cours_per) || 0) + (Number(c.autonomie_placee) || 0);
  const total = cours.reduce((t, c) => t + Math.max(capacite(c), sommeEtudiant(c)), 0);
  const PX = Math.max(2.4, Math.min(5, 560 / Math.max(1, total)));
  /* LA BURETTE SE VIDE TOUTE SEULE (Charles, 10 octobre 2026 : « si on dépasse le
     verre, il faut dire : attention, je dois prendre des heures d'autonomie ; et si
     on augmente, automatiquement la burette se vide »). Après chaque geste, ce qui
     dépasse le dossier se prend dans l'autonomie de l'UE, autant qu'il en reste ;
     quand le cours redescend, la burette se remplit d'autant. */
  const [avis, setAvis] = useState(null);
  // À l'ouverture, un cours qui déborde déjà puise aussitôt dans la burette (et le dit).
  useEffect(() => {
    cours.forEach((c, ci) => {
      const besoin = Math.max(0, arrondi(sommeEtudiant(c) - (Number(c.cours_per) || 0)));
      if (besoin > (Number(c.autonomie_placee) || 0)) changer(ci, x => x);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const changer = (ci, f) => {
    setCours(cs => {
      const next = cs.map((c, i) => (i === ci ? f(c) : c));
      const c = next[ci], avant = Number(cs[ci]?.autonomie_placee) || 0;
      const autres = next.reduce((t, x, i) => t + (i === ci ? 0 : Number(x.autonomie_placee) || 0), 0);
      const besoin = Math.max(0, arrondi(sommeEtudiant(c) - (Number(c.cours_per) || 0)));
      const prise = arrondi(Math.min(besoin, Math.max(0, autonomieUE - autres)));
      next[ci] = { ...c, autonomie_placee: prise };
      if (prise > avant) setAvis(`Attention : ${c.cours_code} dépasse son verre — je prends ${prise} p. d’autonomie dans la burette de l’UE.${besoin > prise ? ` Il en manque encore ${arrondi(besoin - prise)} : la burette est vide.` : ''}`);
      else if (prise < avant) setAvis(`${c.cours_code} redescend : ${arrondi(avant - prise)} p. d’autonomie retournent dans la burette.`);
      else if (besoin > prise) setAvis(`Attention : ${c.cours_code} dépasse son verre de ${arrondi(besoin - prise)} p. et la burette de l’UE est vide.`);
      return next;
    });
    setModifies(m => new Set(m).add(ci));
  };
  const teinteCouche = (c, k) => { const base = teinteCours(c.cours_code); return k % 2 ? `color-mix(in srgb, ${base} 72%, white)` : base; };

  async function enregistrer() {
    setEnCours(true);
    try {
      for (const ci of modifies) {
        const c = cours[ci];
        const r = await fetch('/api/grille/cours', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({
          annee_scolaire: annee, section, ue_num: u.ue_num, cours_code: c.cours_code,
          date_debut: c.date_debut || null, date_fin: c.date_fin || null, autonomie_placee: c.autonomie_placee || 0, evaluation_mode: c.evaluation_mode || 'examen',
          activites: c.activites.map(a => ({ activite_id: a.activite_id, periodes: a.periodes, groupes: a.groupes, vu_etudiant: a.vu_etudiant !== 0,
            date_debut: a.date_debut || null, date_fin: a.date_fin || null })) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
        if (j.repli?.applique) await informer(`${c.cours_code} : un cours ne s’enregistre pas vide — il revient à son contenu du dossier, ${j.repli.periodes} périodes de matière.`);
      }
      setModifies(new Set());
      await onEnregistre();
    } catch (e) { await informer(`❌ ${e.message}`); } finally { setEnCours(false); }
  }

  /* GLISSER UNE ACTIVITÉ POSE LES QUESTIONS DANS L'ORDRE (Charles, 10 octobre
     2026) : réduit-elle la précédente ? de combien ? sinon, quelle place prend-
     elle ? et si le verre déborde, prend-on de l'autonomie dans l'UE ? combien ? */
  async function deposer(ci, typeId) {
    const t = types.find(x => String(x.id) === String(typeId));
    if (!t) return;
    const c = cours[ci], g = estGroupes(t.libelle) ? 4 : 1;
    const cap = capacite(c), s = sommeEtudiant(c), libre = arrondi(cap - s);
    const prev = c.activites[c.activites.length - 1], pPrev = prev ? arrondi(parEtudiant(prev)) : 0;
    const titre = `${t.libelle} dans ${c.cours_code}`;
    let reduire = false;
    if (prev) {
      reduire = await demander({ titre, message: `Cette activité réduit-elle la place de la précédente (« ${prev.activite_nom || 'activité'} », ${pPrev} p.) ?`,
        confirmer: 'Oui, elle la réduit', annuler: 'Non, elle s’ajoute' });
    }
    const brut = await saisir({ titre, valeur: String(reduire ? Math.max(1, Math.round(pPrev / 2)) : Math.max(1, libre > 0 ? libre : 4)),
      message: reduire ? `Quelle place prend-elle, en périodes par étudiant ? « ${prev.activite_nom || 'activité'} » en a ${pPrev}.`
        : `Combien de périodes par étudiant prend-elle ? ${libre > 0 ? `Il reste ${libre} p. dans le cours.` : 'Le cours est déjà plein.'}` });
    if (brut == null) return;
    const x = arrondi(Number(String(brut).replace(',', '.')));
    if (!(x > 0)) { await informer('Il faut un nombre de périodes plus grand que zéro.'); return; }
    if (reduire && x >= pPrev) { await informer(`« ${prev.activite_nom || 'activité'} » n’a que ${pPrev} p. : la nouvelle activité ne peut pas prendre toute sa place — retirez plutôt la précédente.`); return; }
    changer(ci, cc => ({ ...cc,
      activites: [...cc.activites.map((a, i) => (reduire && i === cc.activites.length - 1 ? { ...a, periodes: (parEtudiant(a) - x) * (a.groupes || 1) } : a)),
        { activite_id: t.id, activite_nom: t.libelle, periodes: x * g, groupes: g, vu_etudiant: 1 }] }));
    setChoix({ c: ci, k: c.activites.length });
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
      {avis && (
        <div className="bloc-etat px-3 py-2 text-[13px] flex items-center gap-2" data-etat={/^Attention/.test(avis) ? 'surveiller' : 'neutre'}>
          <span className="flex-1">{avis}</span><button className="text-slate-400 hover:text-slate-700" onClick={() => setAvis(null)} title="Fermer">×</button>
        </div>)}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div className="carte p-4 overflow-x-auto flex gap-2 items-end" onDoubleClick={onAnnee} title="Double-clic : revenir à l’année">
          {/* LA BURETTE : l'autonomie de l'UE, pleine au départ ; elle se vide quand un cours en prend. */}
          <div className="flex-none flex flex-col items-center gap-1 mr-2" title={`Autonomie de l’UE : ${autonomieUE} p. au dossier, ${arrondi(autonomiePrise)} prise(s), ${autonomieReste} restante(s)`}>
            <span className="text-[10.5px] text-slate-500 text-center leading-tight w-[64px]">autonomie<br />de l’UE</span>
            <div className="relative w-[26px] rounded-b-[10px] border-2 border-t-0 overflow-hidden" style={{ height: Math.max(40, autonomieUE * PX), borderColor: '#16406A', background: '#fff' }}>
              <div className="absolute left-0 right-0 bottom-0" style={{ height: `${autonomieUE ? Math.max(0, autonomieReste) / autonomieUE * 100 : 0}%`, background: 'color-mix(in srgb, var(--c-accent, #0E87B0) 55%, white)' }} />
            </div>
            <b className="text-[12px] tabular-nums" style={{ color: autonomieReste < 0 ? 'var(--c-refuse)' : '#1B2B4B' }}>{autonomieUE ? `${autonomieReste}/${autonomieUE}` : '0'}</b>
            <span className="text-[10px] text-slate-400">{autonomieUE ? 'p. restantes' : 'aucune au dossier'}</span>
          </div>
          {/* La graduation, tous les 10 périodes. */}
          <div className="relative w-8 flex-none" style={{ height: total * PX + 8 }}>
            {Array.from({ length: Math.floor(total / 10) + 1 }, (_, i) => (
              <span key={i} className="absolute right-1 text-[10px] text-slate-400 tabular-nums" style={{ bottom: i * 10 * PX + 4, transform: 'translateY(50%)' }}>{i * 10}</span>))}
          </div>
          <div className="pr-[220px]">
            <div className="relative w-[440px] flex flex-col-reverse p-1 rounded-b-[26px] border-[3px] border-t-0" style={{ borderColor: '#16406A', background: '#EEF3F9' }}>
              {cours.map((c, ci) => {
                const s = sommeEtudiant(c), dp = Number(c.cours_per) || 0, aut = Number(c.autonomie_placee) || 0, manque = arrondi(dp + aut - s);
                return (
                  <div key={c.cours_code} className="relative flex flex-col-reverse border-t-2 border-dashed border-slate-400"
                    style={{ height: Math.max(dp + aut, s) * PX, outline: cible === ci ? '3px solid #16406A' : undefined, outlineOffset: -3 }}
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
                        {arrondi(s)} / {dp} p.{aut ? ` (+${aut} d’autonomie)` : ''}{manque > 0 ? ` — il en manque ${manque}` : manque < 0 ? ` — ${-manque} de trop` : ' — complet'}</span>
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
            {(() => {
              const c = cours[choix.c], reste = arrondi(capacite(c) - sommeEtudiant(c));
              return peutEcrire && (<div className="flex flex-wrap gap-2">
                <button className="bouton" disabled={reste <= 0} title="L’activité prend toute la place restante du cours"
                  onClick={() => regler(a => ({ ...a, periodes: (parEtudiant(a) + reste) * (a.groupes || 1) }))}>Tout remplir{reste > 0 ? ` (+${reste} p.)` : ''}</button>

              </div>);
            })()}
            {peutEcrire && <button className="bouton bouton-detruire" onClick={() => { changer(choix.c, c => ({ ...c, activites: c.activites.filter((_, i) => i !== choix.k) })); setChoix(null); }}>Retirer cette couche</button>}
          </>)}
          <div className="text-[11.5px] text-slate-400 pt-1 border-t border-slate-100">Les disponibilités des enseignants viendront ici, saisies par le secrétariat ou la coordination (lot à venir).</div>
        </aside>
      </div>
    </div>
  );
}

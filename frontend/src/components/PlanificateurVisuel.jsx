import { useState, useEffect, useRef, useMemo } from 'react';
import { getAnnee } from '../lib/api.js';
import WizardConfigCours from './WizardConfigCours.jsx';

const TOKEN = () => localStorage.getItem('token');
const authFetch = (url, opts = {}) =>
  fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}`, ...opts.headers } }).then(r => r.json());

// Base : 2h de contact / semaine par défaut → longueur du bloc = heures / baseHpS semaines
const BASE_H_PAR_SEM = 2;

// Couleur du type de semaine (calendrier promotion sociale)
const SEM_STYLE = {
  cours:    { bg: '#ffffff',  label: '' },
  vacances: { bg: '#f3f4f6',  label: 'Vac.' },
  ferie:    { bg: '#f3f4f6',  label: 'Férié' },
  ev1:      { bg: '#fff7ed',  label: 'EV1' },
  ev2:      { bg: '#fef2f2',  label: 'EV2' },
  stage:    { bg: '#eff6ff',  label: 'Stage' },
};

// Couleur d'un bloc selon le type d'activité
function blocColor(activite) {
  const a = (activite || '').toLowerCase();
  if (a.includes('remédiation') || a.includes('remediation')) return { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' };
  if (a.includes('autonomie')) return { bg: '#fae8ff', border: '#c026d3', text: '#86198f' };
  if (a.includes('évaluation') || a.includes('evaluation')) return { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' };
  return { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }; // cours par défaut
}

/**
 * Planificateur visuel d'UE — vue type Gantt.
 * Chaque groupe = une ligne. Les heures de l'UE deviennent des blocs dont
 * la longueur (en semaines) = heures / (heures par semaine). On glisse
 * horizontalement pour décaler le début, on coupe pour créer des activités.
 */
export default function PlanificateurVisuel({ onClose }) {
  const annee = getAnnee();
  const [sections, setSections] = useState([]);
  const [section, setSection]   = useState('');
  const [ues, setUes]           = useState([]);
  const [ueNum, setUeNum]       = useState('');
  const [grille, setGrille]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [hParSem, setHParSem]   = useState(BASE_H_PAR_SEM);
  const [blocs, setBlocs]       = useState([]); // [{id, groupe_id, activite, debutSem, dureeSem, heures, color}]
  const [saving, setSaving]     = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [calSessions, setCalSessions] = useState(null); // dates jalons rétroactives
  const [wizardCours, setWizardCours] = useState(null); // cours en cours de configuration
  const [menuBloc, setMenuBloc] = useState(null); // bloc dont le menu est ouvert

  // Largeur d'une semaine en pixels
  const PX_SEM = 38;
  const LABEL_W = 220;

  useEffect(() => {
    authFetch('/api/ref/sections').then(d => setSections(Array.isArray(d) ? d : [])).catch(() => {});
    authFetch('/api/planification/calendrier-sessions').then(d => setCalSessions(d?.defini ? d : null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (section) {
      authFetch(`/api/ref/ue?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`)
        .then(d => setUes(Array.isArray(d) ? d : [])).catch(() => setUes([]));
      setUeNum('');
      setGrille(null);
      setBlocs([]);
    }
  }, [section, annee]);

  useEffect(() => {
    if (section && ueNum) chargerUE();
  }, [section, ueNum]);

  async function chargerUE() {
    setLoading(true);
    try {
      // Le calendrier (semaines) vient de /grille ; les LIGNES viennent des attributions réelles
      const params = new URLSearchParams({ annee, section });
      const grilleData = await authFetch(`/api/planification/grille?${params}`);
      const ligneData = await authFetch(`/api/planification/lignes-ue?annee=${encodeURIComponent(annee)}&section=${encodeURIComponent(section)}&ue=${encodeURIComponent(ueNum)}`);
      const lignes = ligneData.lignes || [];
      setGrille({ semaines: grilleData.semaines || [], groupes: lignes });
      construireBlocs(lignes, grilleData.semaines || []);
    } finally { setLoading(false); }
  }

  // Construit les blocs depuis les lignes d'attribution (source = attributions réelles)
  function dureeCalendairePourCours(semainesArr, debut, nbSemCoursVoulu, limiteIdx) {
    let coursComptes = 0;
    let i = debut;
    const max = limiteIdx >= 0 ? limiteIdx : semainesArr.length - 1;
    while (i <= max && coursComptes < nbSemCoursVoulu) {
      if (semainesArr[i] && semainesArr[i].type === 'cours') coursComptes++;
      i++;
    }
    return Math.max(1, i - debut); // durée calendaire (inclut congés traversés)
  }

  function construireBlocs(lignes, semaines) {
    const premiereSemCours = semaines.findIndex(s => s.type === 'cours');
    const startIdx = premiereSemCours >= 0 ? premiereSemCours : 0;
    const limiteIdx = limiteCoursIdx(semaines);
    const nouveaux = lignes.map((l, i) => {
      const heuresCours = l.heures || 0;
      const heuresAuto = Math.round(((l.autonomie || 0) / 1.2) * 10) / 10; // périodes auto → heures
      const heuresTotal = heuresCours + heuresAuto;
      const nbSemCours = Math.max(1, Math.round(heuresTotal / hParSem));
      const duree = dureeCalendairePourCours(semaines, startIdx, nbSemCours, limiteIdx);
      return {
        id: `bloc-${l.attribution_id}-${i}`,
        groupe_id: l.attribution_id,
        groupe_nom: l.groupe,
        code_cours: l.code_cours,
        activite: l.activite,
        prof: l.prof,
        debutSem: startIdx,
        dureeSem: duree,
        heures: heuresCours,
        heuresAuto,           // part d'autonomie (heures)
        autonomie: l.autonomie || 0, // périodes d'autonomie
        periodes: l.periodes,
        color: blocColor(l.type_cours === 'PP' ? 'tp' : l.activite),
      };
    });
    setBlocs(nouveaux);
  }

  // Calcule l'index de la dernière semaine de cours autorisée pour un tableau de semaines
  function limiteCoursIdx(semainesArr) {
    if (!calSessions?.dernier_cours || !semainesArr.length) return semainesArr.length - 1;
    let idx = -1;
    for (let i = 0; i < semainesArr.length; i++) {
      if (semainesArr[i].date_debut <= calSessions.dernier_cours) idx = i;
    }
    return idx >= 0 ? idx : semainesArr.length - 1;
  }

  // Recalcule la durée des blocs si on change les heures/semaine (en respectant la limite)
  useEffect(() => {
    if (blocs.length > 0 && semaines.length) {
      const limiteIdx = dernierCoursIdx;
      setBlocs(prev => prev.map(b => {
        const nbSemCours = Math.max(1, Math.round(b.heures / hParSem));
        const duree = dureeCalendairePourCours(semaines, b.debutSem, nbSemCours, limiteIdx);
        return { ...b, dureeSem: duree };
      }));
    }
  }, [hParSem]);

  const semaines = grille?.semaines || [];
  const nbSem = semaines.length;

  // Index de la dernière semaine de cours utilisable (selon le calcul rétroactif des sessions)
  const dernierCoursIdx = useMemo(() => {
    if (!calSessions?.dernier_cours || !semaines.length) return nbSem - 1;
    const limite = calSessions.dernier_cours;
    // Dernière semaine dont la date_debut <= dernier_cours
    let idx = -1;
    for (let i = 0; i < semaines.length; i++) {
      if (semaines[i].date_debut <= limite) idx = i;
    }
    return idx >= 0 ? idx : nbSem - 1;
  }, [calSessions, semaines, nbSem]);

  // Semaines de cours réellement disponibles (type cours, jusqu'à dernierCoursIdx)
  const semCoursDispo = useMemo(() =>
    semaines.filter((s, i) => i <= dernierCoursIdx && s.type === 'cours').length,
    [semaines, dernierCoursIdx]);

  // Total heures de l'UE (somme des groupes)
  const totalHeuresUE = useMemo(() =>
    (grille?.groupes || []).reduce((s, l) => s + (l.heures || 0), 0),
    [grille]);

  const capaciteOK = useMemo(() => {
    if (!grille?.groupes?.length || !semCoursDispo) return true;
    const maxHeures = Math.max(...grille.groupes.map(l => l.heures || 0));
    return maxHeures <= semCoursDispo * hParSem * 2.5;
  }, [grille, semCoursDispo, hParSem]);

  // ── Drag horizontal d'un bloc ──
  const dragRef = useRef(null);
  function onBlocMouseDown(e, bloc) {
    e.preventDefault();
    const startX = e.clientX;
    const startDebut = bloc.debutSem;
    dragRef.current = { id: bloc.id, startX, startDebut };
    const onMove = ev => {
      const diffPx = ev.clientX - dragRef.current.startX;
      const diffSem = Math.round(diffPx / PX_SEM);
      setBlocs(prev => prev.map(b => {
        if (b.id !== dragRef.current.id) return b;
        const newDebut = Math.max(0, Math.min(dernierCoursIdx - b.dureeSem + 1, dragRef.current.startDebut + diffSem));
        return { ...b, debutSem: newDebut };
      }));
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Redimensionner un bloc (bord droit) = changer le rythme ──
  const resizeRef = useRef(null);
  function onResizeMouseDown(e, bloc) {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startDuree = bloc.dureeSem;
    resizeRef.current = { id: bloc.id, startX, startDuree };
    const onMove = ev => {
      const diffPx = ev.clientX - resizeRef.current.startX;
      const diffSem = Math.round(diffPx / PX_SEM);
      setBlocs(prev => prev.map(b => {
        if (b.id !== resizeRef.current.id) return b;
        const newDuree = Math.max(1, Math.min(dernierCoursIdx - b.debutSem + 1, resizeRef.current.startDuree + diffSem));
        return { ...b, dureeSem: newDuree };
      }));
    };
    const onUp = () => { resizeRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Couper un bloc en deux (crée une activité) ──
  function couperBloc(bloc) {
    const moitie = Math.floor(bloc.dureeSem / 2);
    if (moitie < 1) return;
    const reste = bloc.dureeSem - moitie;
    const hParSemBloc = bloc.heures / bloc.dureeSem;
    setBlocs(prev => {
      const idx = prev.findIndex(b => b.id === bloc.id);
      // 1er segment : garde l'autonomie ; 2e segment : pas d'autonomie, devient une activité
      const b1 = { ...bloc, dureeSem: moitie, heures: Math.round(hParSemBloc * moitie * 100) / 100 };
      const b2 = {
        ...bloc,
        id: `${bloc.id}-split-${Date.now()}`,
        debutSem: bloc.debutSem + moitie,
        dureeSem: reste,
        heures: Math.round(hParSemBloc * reste * 100) / 100,
        heuresAuto: 0,
        autonomie: 0,
        activite: 'Remédiation',
        color: blocColor('remédiation'),
      };
      const copy = [...prev];
      copy.splice(idx, 1, b1, b2);
      return copy;
    });
  }

  function supprimerBloc(id) {
    setBlocs(prev => prev.filter(b => b.id !== id));
    setMenuBloc(null);
  }

  // Dédoubler un bloc → crée un groupe supplémentaire (B, C…) identique
  function dedoublerBloc(bloc) {
    setBlocs(prev => {
      // Compter les groupes existants pour ce même cours/activité
      const memeCours = prev.filter(b => b.activite === bloc.activite || b.groupe_id === bloc.groupe_id);
      const lettres = memeCours.map(b => b.groupe_nom).filter(g => /^[A-Z]$/.test(g));
      const prochaine = String.fromCharCode(65 + lettres.length); // A→B→C
      const nouveau = {
        ...bloc,
        id: `${bloc.id}-dbl-${Date.now()}`,
        groupe_id: `${bloc.groupe_id}-${prochaine}`,
        groupe_nom: prochaine,
        activite: bloc.activite.replace(/ groupe [A-Z]$/, '') + ` groupe ${prochaine}`,
      };
      return [...prev, nouveau];
    });
    setMenuBloc(null);
  }

  // Changer l'activité d'un bloc
  function setActiviteBloc(bloc, activite) {
    setBlocs(prev => prev.map(b => b.id === bloc.id ? { ...b, activite, color: blocColor(activite) } : b));
    setMenuBloc(null);
  }

  // Basculer le mode "une semaine sur deux" (alternance)
  function toggleAlternance(bloc) {
    setBlocs(prev => prev.map(b => {
      if (b.id !== bloc.id) return b;
      const alt = !b.alternance;
      // En alternance, le bloc occupe 2× plus de semaines calendaires (1 sem sur 2)
      return { ...b, alternance: alt };
    }));
    setMenuBloc(null);
  }

  // Grouper les blocs par groupe (chaque groupe = une "voie", mais un bloc coupé occupe la même voie)
  const voies = useMemo(() => {
    const map = {};
    for (const b of blocs) {
      (map[b.groupe_id] ||= []).push(b);
    }
    return Object.entries(map).map(([gid, bs]) => ({
      groupe_id: gid,
      // Infos directement depuis le premier bloc de la voie
      groupe: {
        cours_nom: bs[0]?.code_cours ? `${bs[0].code_cours} — ${bs[0].activite}` : bs[0]?.activite,
        nom: bs[0]?.groupe_nom,
        prof: bs[0]?.prof,
        heures: bs.reduce((s, b) => s + (b.heures || 0), 0),
      },
      blocs: bs.sort((a, b) => a.debutSem - b.debutSem),
    }));
  }, [blocs]);

  const ueChoisie = ues.find(u => String(u.ue_num) === String(ueNum));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="border-b border-gray-200 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="font-title text-lg text-iip-gold">📅 Planificateur visuel d'UE</h2>
            <select value={section} onChange={e => setSection(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
              <option value="">— Section —</option>
              {sections.map(s => <option key={s.code} value={s.code}>{s.code} — {s.nom}</option>)}
            </select>
            <select value={ueNum} onChange={e => setUeNum(e.target.value)} disabled={!section}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white disabled:opacity-50">
              <option value="">— UE —</option>
              {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
            </select>
            {ueNum && (
              <button onClick={() => setWizardCours(true)}
                className="bg-iip-mauve/10 text-iip-mauve text-xs px-3 py-1.5 rounded hover:bg-iip-mauve/20 whitespace-nowrap">
                ⚙ Configurer un cours
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 flex items-center gap-1.5">
              Base h/semaine
              <input type="number" min="0.5" step="0.5" value={hParSem}
                onChange={e => setHParSem(Math.max(0.5, Number(e.target.value) || BASE_H_PAR_SEM))}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-sm" />
            </label>
            <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
          </div>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-auto p-4">
          {!ueNum ? (
            <div className="text-center text-gray-400 py-20">Choisissez une section puis une UE pour commencer.</div>
          ) : loading ? (
            <div className="text-center text-gray-400 py-20">Chargement…</div>
          ) : voies.length === 0 ? (
            <div className="text-center text-gray-400 py-20">
              Aucun groupe pour cette UE.<br/>
              <span className="text-sm">Créez d'abord des groupes dans la grille de planification, ou importez depuis les attributions.</span>
            </div>
          ) : (
            <div className="inline-block min-w-full">
              {/* Bandeau capacité / sessions */}
              <div className="mb-3 flex items-center gap-4 flex-wrap text-xs" style={{ paddingLeft: LABEL_W }}>
                {calSessions ? (
                  <span className="text-gray-500">
                    Dernière semaine de cours : <strong className="text-gray-700">S{semaines[dernierCoursIdx]?.semaine_num}</strong> ({semaines[dernierCoursIdx]?.date_debut})
                    · {semCoursDispo} semaines de cours disponibles
                  </span>
                ) : (
                  <span className="text-orange-500">⚠ Dernier jour admin non défini (Paramètres) — limite de session non calculée</span>
                )}
                {!capaciteOK && (
                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                    ⚠ Le volume horaire risque de ne pas tenir dans les semaines disponibles
                  </span>
                )}
              </div>

              {/* En-tête des semaines */}
              <div className="flex sticky top-0 z-10 bg-white" style={{ paddingLeft: LABEL_W }}>
                {semaines.map((s, i) => {
                  const st = SEM_STYLE[s.type] || SEM_STYLE.cours;
                  const apresCours = i > dernierCoursIdx;
                  return (
                    <div key={s.id} style={{ width: PX_SEM, background: apresCours ? '#fef2f2' : st.bg }}
                      className="border-r border-gray-100 text-center py-1 text-[9px] text-gray-500 flex-shrink-0"
                      title={`Semaine ${s.semaine_num} — ${s.date_debut} (${s.type})${s.label ? ' · '+s.label : ''}${apresCours ? ' · zone sessions/délibé (hors cours)' : ''}`}>
                      <div className="font-semibold">{s.semaine_num}</div>
                      {apresCours ? <div className="text-[8px] text-red-400">sess.</div> : st.label && <div className="text-[8px] text-gray-400">{st.label}</div>}
                    </div>
                  );
                })}
              </div>

              {/* Voies (groupes) */}
              {voies.map(voie => (
                <div key={voie.groupe_id} className="flex items-stretch border-b border-gray-100 group/voie" style={{ minHeight: 52 }}>
                  {/* Label du groupe */}
                  <div style={{ width: LABEL_W }} className="flex-shrink-0 pr-3 py-2 flex flex-col justify-center">
                    <div className="text-sm font-medium text-gray-700 truncate">
                      {voie.groupe?.cours_nom || 'Cours'}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">
                      Groupe {voie.groupe?.nom}
                      {voie.groupe?.prof && ` · ${voie.groupe.prof}`}
                      {` · ${voie.groupe?.heures || 0}h`}
                    </div>
                  </div>
                  {/* Zone des blocs */}
                  <div className="relative flex-1" style={{ height: 52 }}>
                    {/* Fond : colonnes de semaines */}
                    <div className="absolute inset-0 flex">
                      {semaines.map((s, i) => {
                        const st = SEM_STYLE[s.type] || SEM_STYLE.cours;
                        const apresCours = i > dernierCoursIdx;
                        const bg = apresCours ? 'rgba(254,242,242,.6)' : (s.type !== 'cours' ? st.bg : 'transparent');
                        return <div key={s.id} style={{ width: PX_SEM, background: bg }}
                          className="border-r border-gray-50 flex-shrink-0" />;
                      })}
                    </div>
                    {/* Blocs */}
                    {voie.blocs.map(b => {
                      // Semaines de cours réelles vs congés traversés
                      const congesTraverses = [];
                      let semCoursReelles = 0;
                      for (let i = b.debutSem; i < b.debutSem + b.dureeSem && i < nbSem; i++) {
                        if (semaines[i] && semaines[i].type !== 'cours') congesTraverses.push(i - b.debutSem);
                        else if (semaines[i]) semCoursReelles++;
                      }
                      semCoursReelles = Math.max(1, semCoursReelles);
                      // En alternance (1 sem sur 2), seules la moitié des semaines portent le cours
                      const semEffectives = b.alternance ? Math.max(1, Math.ceil(semCoursReelles / 2)) : semCoursReelles;
                      const hParSemaine = Math.round((b.heures / semEffectives) * 10) / 10;
                      const depasseLimite = (b.debutSem + b.dureeSem - 1) > dernierCoursIdx;
                      return (
                      <div key={b.id}
                        onMouseDown={e => onBlocMouseDown(e, b)}
                        style={{
                          position: 'absolute',
                          left: b.debutSem * PX_SEM,
                          width: b.dureeSem * PX_SEM - 2,
                          top: 6, bottom: 6,
                          background: b.color.bg,
                          border: `1.5px solid ${depasseLimite ? '#ef4444' : b.color.border}`,
                          color: b.color.text,
                          borderRadius: 6,
                          cursor: 'grab',
                        }}
                        className="flex items-center px-2 text-[11px] font-medium overflow-hidden select-none hover:brightness-95 transition group/bloc"
                        title={`${b.activite} · ${b.heures}h sur ${semCoursReelles} sem. de cours = ${hParSemaine}h/sem${depasseLimite ? ' ⚠ dépasse la dernière semaine de cours' : ''}${congesTraverses.length ? ` · ${congesTraverses.length} congé(s) traversé(s)` : ''}`}>
                        {/* Hachures sur les semaines de congé */}
                        {congesTraverses.map(off => (
                          <div key={off} style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: off * PX_SEM, width: PX_SEM,
                            background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,.10) 3px, rgba(0,0,0,.10) 6px)',
                            borderLeft: '1px dashed rgba(0,0,0,.3)', borderRight: '1px dashed rgba(0,0,0,.3)',
                          }} title="Congé — pas de cours, le bloc est prolongé d'autant" />
                        ))}
                        {/* Alternance 1 semaine sur 2 : bandes colorées */}
                        {b.alternance && Array.from({ length: b.dureeSem }).map((_, k) => (
                          k % 2 === 1 ? <div key={`alt-${k}`} style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: k * PX_SEM, width: PX_SEM,
                            background: 'rgba(27,43,75,.18)',
                          }} title="Semaine sans ce cours (alternance)" /> : null
                        ))}
                        {/* Segment d'autonomie à la fin du bloc (violet) */}
                        {b.heuresAuto > 0 && (b.heures + b.heuresAuto) > 0 && (
                          <div style={{
                            position: 'absolute', top: 0, bottom: 0, right: 0,
                            width: `${(b.heuresAuto / (b.heures + b.heuresAuto)) * 100}%`,
                            background: 'repeating-linear-gradient(45deg, rgba(192,38,211,.22), rgba(192,38,211,.22) 4px, rgba(192,38,211,.32) 4px, rgba(192,38,211,.32) 8px)',
                            borderLeft: '2px solid #c026d3',
                            borderTopRightRadius: 5, borderBottomRightRadius: 5,
                          }} title={`Autonomie : ${b.autonomie} pér. (${b.heuresAuto}h)`} className="z-[5] flex items-center justify-center">
                            <span className="text-[8px] font-bold text-fuchsia-800 rotate-0">aut.</span>
                          </div>
                        )}
                        <span className="truncate flex-1 relative z-10">{b.activite}</span>
                        {/* Calcul h/semaine bien visible */}
                        <span className="text-[10px] font-bold ml-1 whitespace-nowrap relative z-10 bg-white/50 rounded px-1">
                          {hParSemaine}h/sem
                        </span>
                        {/* Bouton + : ouvre le menu d'actions */}
                        <button onMouseDown={e => { e.stopPropagation(); }}
                          onClick={e => { e.stopPropagation(); setMenuBloc(menuBloc?.id === b.id ? null : b); }}
                          className="ml-1 w-4 h-4 flex items-center justify-center rounded-full bg-white/70 hover:bg-white text-gray-700 text-[11px] leading-none relative z-10 flex-shrink-0"
                          title="Actions sur ce bloc">+</button>
                        {/* Poignée de redimensionnement */}
                        <span onMouseDown={e => onResizeMouseDown(e, b)}
                          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize' }}
                          className="hover:bg-black/10 z-10" />
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Légende */}
              <div className="mt-4 flex items-center gap-4 text-[11px] text-gray-500 flex-wrap" style={{ paddingLeft: LABEL_W }}>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{background:'#dbeafe',border:'1.5px solid #3b82f6'}}/>Cours</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{background:'#fef3c7',border:'1.5px solid #f59e0b'}}/>Remédiation</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{background:'#fae8ff',border:'1.5px solid #c026d3'}}/>Autonomie</span>
                <span className="ml-4">Glisser = décaler · bord droit = rythme · ✂ = couper</span>
              </div>
            </div>
          )}
        </div>

        {/* Pied */}
        <div className="border-t border-gray-200 p-4 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {ueChoisie && <>UE {ueChoisie.ue_num} · {voies.length} groupe(s) · {blocs.length} bloc(s)</>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Fermer</button>
            <button onClick={() => setConfirmOpen(true)} disabled={!blocs.length || saving}
              className="bg-iip-gold hover:bg-iip-amber disabled:opacity-50 text-white text-sm px-5 py-2 rounded font-medium">
              {saving ? 'Création…' : '✓ Créer les attributions'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={e => e.target === e.currentTarget && setConfirmOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="font-title text-lg text-iip-gold mb-2">Créer les attributions ?</h3>
            <p className="text-sm text-gray-600 mb-4">
              {blocs.length} bloc(s) seront convertis en planification (heures par semaine)
              pour l'UE {ueChoisie?.ue_num}. Les blocs coupés deviennent des activités distinctes.
            </p>
            <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 max-h-40 overflow-auto mb-4">
              {blocs.map(b => (
                <div key={b.id} className="flex justify-between py-0.5">
                  <span>{b.activite} (gr. {b.groupe_nom})</span>
                  <span>{b.heures}h · S{semaines[b.debutSem]?.semaine_num}→S{semaines[Math.min(b.debutSem+b.dureeSem-1, nbSem-1)]?.semaine_num}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
              <button onClick={enregistrer} disabled={saving}
                className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-5 py-2 rounded font-medium disabled:opacity-50">
                {saving ? 'Création…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Menu contextuel d'un bloc */}
      {menuBloc && (
        <div className="fixed inset-0 z-[55]" onClick={() => setMenuBloc(null)}>
          <div className="absolute bg-white rounded-lg shadow-2xl border border-gray-200 py-1 w-56 text-sm"
            style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }}
            onClick={e => e.stopPropagation()}>
            <div className="px-3 py-2 border-b border-gray-100 text-xs text-gray-500 font-medium truncate">
              {menuBloc.activite}
            </div>
            <button onClick={() => dedoublerBloc(menuBloc)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
              ➕ Dédoubler le groupe (B, C…)
            </button>
            <div className="px-3 py-1.5 text-xs text-gray-400">Activité :</div>
            {['Cours', 'TP / Labo', 'Remédiation', 'Autonomie', 'Évaluation'].map(act => (
              <button key={act} onClick={() => setActiviteBloc(menuBloc, act)}
                className="w-full text-left px-5 py-1.5 hover:bg-gray-50 text-xs">{act}</button>
            ))}
            <div className="border-t border-gray-100 my-1" />
            <button onClick={() => toggleAlternance(menuBloc)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
              {menuBloc.alternance ? '✓ ' : ''}🔁 Une semaine sur deux
            </button>
            <button onClick={() => { couperBloc(menuBloc); setMenuBloc(null); }} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
              ✂ Couper en deux
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button onClick={() => supprimerBloc(menuBloc.id)} className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2">
              🗑 Supprimer ce bloc
            </button>
          </div>
        </div>
      )}

      {/* Wizard de configuration de cours */}
      {wizardCours && (
        <WizardConfigCours
          ueNum={ueNum}
          section={section}
          annee={annee}
          onClose={() => setWizardCours(null)}
          onGenerate={(lignes) => {
            // Transformer les lignes générées en blocs sur le planificateur
            const premiereSemCours = semaines.findIndex(s => s.type === 'cours');
            const startIdx = premiereSemCours >= 0 ? premiereSemCours : 0;
            const limiteIdx = dernierCoursIdx;
            const nouveaux = lignes.map((ligne, i) => {
              const nbSemCours = Math.max(1, Math.round(ligne.heures / hParSem));
              const duree = dureeCalendairePourCours(semaines, startIdx, nbSemCours, limiteIdx);
              return {
                id: `wizard-${Date.now()}-${i}`,
                groupe_id: `w-${i}`,
                groupe_nom: ligne.groupe,
                activite: ligne.label,
                prof: null,
                debutSem: startIdx,
                dureeSem: duree,
                heures: ligne.heures,
                color: blocColor(ligne.type === 'tp' ? 'tp' : ligne.label),
                local_id: ligne.local_id,
              };
            });
            setBlocs(prev => [...prev, ...nouveaux]);
            setWizardCours(null);
          }}
        />
      )}
    </div>
  );

  async function enregistrer() {
    setSaving(true);
    try {
      // Convertir chaque bloc en cellules planification : répartir les heures
      // sur les semaines de cours couvertes (en sautant vacances/fériés)
      const cellules = [];
      for (const b of blocs) {
        const semCouvertes = [];
        for (let i = b.debutSem; i < b.debutSem + b.dureeSem && i < nbSem; i++) {
          if (semaines[i] && semaines[i].type === 'cours') semCouvertes.push(semaines[i]);
        }
        if (semCouvertes.length === 0) continue;
        const hParSemReel = Math.round((b.heures / semCouvertes.length) * 100) / 100;
        for (const s of semCouvertes) {
          cellules.push({ groupe_id: b.groupe_id, semaine_id: s.id, heures: String(hParSemReel) });
        }
      }
      if (cellules.length) {
        await authFetch('/api/planification/cellules-bulk', { method: 'PUT', body: JSON.stringify({ cellules }) });
      }
      setConfirmOpen(false);
      onClose(true);
    } finally { setSaving(false); }
  }
}

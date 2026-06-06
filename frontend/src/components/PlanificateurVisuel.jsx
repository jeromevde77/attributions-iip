import { useState, useEffect, useRef, useMemo } from 'react';
import { getAnnee } from '../lib/api.js';

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

  // Largeur d'une semaine en pixels
  const PX_SEM = 38;
  const LABEL_W = 220;

  useEffect(() => {
    authFetch('/api/ref/sections').then(d => setSections(Array.isArray(d) ? d : [])).catch(() => {});
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
      const params = new URLSearchParams({ annee, section });
      const d = await authFetch(`/api/planification/grille?${params}`);
      // Filtrer pour ne garder que les groupes de l'UE choisie
      const groupesUE = (d.groupes || []).filter(g => String(g.ue_num) === String(ueNum));
      setGrille({ ...d, groupes: groupesUE });
      construireBlocs(groupesUE, d.semaines);
    } finally { setLoading(false); }
  }

  // Construit les blocs initiaux à partir des groupes (1 bloc = total heures du groupe)
  function construireBlocs(groupes, semaines) {
    const premiereSemCours = semaines.findIndex(s => s.type === 'cours');
    const startIdx = premiereSemCours >= 0 ? premiereSemCours : 0;
    const nouveaux = groupes.map((g, i) => {
      const heures = g.heures_attribuees || 0;
      const duree = Math.max(1, Math.round(heures / hParSem));
      return {
        id: `bloc-${g.id}-${i}`,
        groupe_id: g.id,
        groupe_nom: g.nom,
        activite: g.activite_nom || g.cours_nom || 'Cours',
        prof: g.prof_nom ? `${g.prof_prenom || ''} ${g.prof_nom}`.trim() : null,
        debutSem: startIdx,
        dureeSem: duree,
        heures,
        color: blocColor(g.activite_nom),
      };
    });
    setBlocs(nouveaux);
  }

  // Recalcule la durée des blocs si on change les heures/semaine
  useEffect(() => {
    if (blocs.length > 0) {
      setBlocs(prev => prev.map(b => ({ ...b, dureeSem: Math.max(1, Math.round(b.heures / hParSem)) })));
    }
  }, [hParSem]);

  const semaines = grille?.semaines || [];
  const nbSem = semaines.length;

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
        const newDebut = Math.max(0, Math.min(nbSem - b.dureeSem, dragRef.current.startDebut + diffSem));
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
        const newDuree = Math.max(1, Math.min(nbSem - b.debutSem, resizeRef.current.startDuree + diffSem));
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
      const b1 = { ...bloc, dureeSem: moitie, heures: Math.round(hParSemBloc * moitie * 100) / 100 };
      const b2 = {
        ...bloc,
        id: `${bloc.id}-split-${Date.now()}`,
        debutSem: bloc.debutSem + moitie,
        dureeSem: reste,
        heures: Math.round(hParSemBloc * reste * 100) / 100,
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
  }

  // Grouper les blocs par groupe (chaque groupe = une "voie", mais un bloc coupé occupe la même voie)
  const voies = useMemo(() => {
    const map = {};
    for (const b of blocs) {
      (map[b.groupe_id] ||= []).push(b);
    }
    return Object.entries(map).map(([gid, bs]) => ({
      groupe_id: Number(gid),
      groupe: grille?.groupes.find(g => g.id === Number(gid)),
      blocs: bs.sort((a, b) => a.debutSem - b.debutSem),
    }));
  }, [blocs, grille]);

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
              {/* En-tête des semaines */}
              <div className="flex sticky top-0 z-10 bg-white" style={{ paddingLeft: LABEL_W }}>
                {semaines.map(s => {
                  const st = SEM_STYLE[s.type] || SEM_STYLE.cours;
                  return (
                    <div key={s.id} style={{ width: PX_SEM, background: st.bg }}
                      className="border-r border-gray-100 text-center py-1 text-[9px] text-gray-500 flex-shrink-0"
                      title={`Semaine ${s.semaine_num} — ${s.date_debut} (${s.type})${s.label ? ' · '+s.label : ''}`}>
                      <div className="font-semibold">{s.semaine_num}</div>
                      {st.label && <div className="text-[8px] text-gray-400">{st.label}</div>}
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
                      {voie.groupe?.cours_nom || voie.groupe?.activite_nom || 'Cours'}
                    </div>
                    <div className="text-[11px] text-gray-400 truncate">
                      Groupe {voie.groupe?.nom}
                      {voie.groupe?.prof_nom && ` · ${voie.groupe.prof_prenom || ''} ${voie.groupe.prof_nom}`}
                      {` · ${voie.groupe?.heures_attribuees || 0}h`}
                    </div>
                  </div>
                  {/* Zone des blocs */}
                  <div className="relative flex-1" style={{ height: 52 }}>
                    {/* Fond : colonnes de semaines */}
                    <div className="absolute inset-0 flex">
                      {semaines.map(s => {
                        const st = SEM_STYLE[s.type] || SEM_STYLE.cours;
                        return <div key={s.id} style={{ width: PX_SEM, background: s.type !== 'cours' ? st.bg : 'transparent' }}
                          className="border-r border-gray-50 flex-shrink-0" />;
                      })}
                    </div>
                    {/* Blocs */}
                    {voie.blocs.map(b => (
                      <div key={b.id}
                        onMouseDown={e => onBlocMouseDown(e, b)}
                        style={{
                          position: 'absolute',
                          left: b.debutSem * PX_SEM,
                          width: b.dureeSem * PX_SEM - 2,
                          top: 6, bottom: 6,
                          background: b.color.bg,
                          border: `1.5px solid ${b.color.border}`,
                          color: b.color.text,
                          borderRadius: 6,
                          cursor: 'grab',
                        }}
                        className="flex items-center px-2 text-[11px] font-medium overflow-hidden select-none hover:brightness-95 transition"
                        title={`${b.activite} · ${b.heures}h sur ${b.dureeSem} sem. (${Math.round(b.heures/b.dureeSem*10)/10}h/sem)`}>
                        <span className="truncate flex-1">{b.activite}</span>
                        <span className="text-[9px] opacity-70 ml-1 whitespace-nowrap">{b.heures}h</span>
                        {/* Bouton couper */}
                        <button onMouseDown={e => { e.stopPropagation(); }} onClick={e => { e.stopPropagation(); couperBloc(b); }}
                          className="ml-1 opacity-0 group-hover/voie:opacity-60 hover:!opacity-100 text-[10px]" title="Couper en deux (créer une activité)">✂</button>
                        <button onMouseDown={e => { e.stopPropagation(); }} onClick={e => { e.stopPropagation(); supprimerBloc(b.id); }}
                          className="ml-0.5 opacity-0 group-hover/voie:opacity-60 hover:!opacity-100 text-[10px]" title="Supprimer ce bloc">🗑</button>
                        {/* Poignée de redimensionnement (bord droit) */}
                        <span onMouseDown={e => onResizeMouseDown(e, b)}
                          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize' }}
                          className="hover:bg-black/10" />
                      </div>
                    ))}
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

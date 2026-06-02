import { useState, useEffect, useRef } from 'react';
import { getAnnee } from '../lib/api.js';

const TOKEN = () => localStorage.getItem('token');
const authFetch = (url, opts = {}) =>
  fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}`, ...opts.headers } }).then(r => r.json());

// ─── Valeurs spéciales dans les cellules ──────────────────────────────────────
const CELL_SPECIAL = {
  EV1: { heures: 2,    bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  EV2: { heures: 0,    bg: 'bg-red-100',    text: 'text-red-800',    border: 'border-red-300'    },
  VC:  { heures: 1,    bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
};

function cellHeures(val) {
  if (!val || val === '' || val === '0') return 0;
  const up = String(val).toUpperCase().trim();
  if (CELL_SPECIAL[up]) return CELL_SPECIAL[up].heures;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function arrondir(v) {
  // < 0.5 → inférieur, >= 0.5 → supérieur
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return n % 1 < 0.5 ? Math.floor(n) : Math.ceil(n);
}

function cellDisplay(val) {
  if (!val || val === '' || val === '0' || val === 0) return null;
  const up = String(val).toUpperCase().trim();
  if (CELL_SPECIAL[up]) return up;
  const n = parseFloat(val);
  if (isNaN(n)) return String(val);
  return String(arrondir(n));
}

// ─── Vérification contraintes EV1→VC→EV2 ────────────────────────────────────
// Retourne les avertissements pour un groupe donné sur toutes ses semaines
function checkContraintes(groupeId, semaines, cellules) {
  const warnings = [];
  const vals = semaines.map(s => {
    const v = String(cellules[`${groupeId}_${s.id}`] || '').toUpperCase().trim();
    return { id: s.id, num: s.semaine_num, val: v };
  });

  const ev1Indices = vals.reduce((a, v, i) => v.val === 'EV1' ? [...a, i] : a, []);
  const vcIndices  = vals.reduce((a, v, i) => v.val === 'VC'  ? [...a, i] : a, []);
  const ev2Indices = vals.reduce((a, v, i) => v.val === 'EV2' ? [...a, i] : a, []);

  for (const i2 of ev2Indices) {
    // Trouver le dernier EV1 avant cet EV2
    const prevEV1 = ev1Indices.filter(i => i < i2).slice(-1)[0];
    if (prevEV1 === undefined) {
      warnings.push({ semaineId: vals[i2].id, msg: 'EV2 sans EV1 précédent' });
      continue;
    }
    // Il doit y avoir au moins 1 semaine libre entre EV1 et EV2
    if (i2 - prevEV1 < 2) {
      warnings.push({ semaineId: vals[i2].id, msg: 'EV2 trop proche de EV1 (min. 1 semaine libre)' });
    }
    // VC doit être entre EV1 et EV2
    const vcEntre = vcIndices.some(i => i > prevEV1 && i < i2);
    if (!vcEntre) {
      warnings.push({ semaineId: vals[i2].id, msg: 'Aucune VC entre EV1 et EV2' });
    }
  }
  return warnings; // [{ semaineId, msg }]
}

// ─── Couleurs calendrier (semaines) ──────────────────────────────────────────
const TYPE_STYLE = {
  cours:    { header: 'bg-gray-50',    text: 'text-gray-600' },
  vacances: { header: 'bg-gray-200',   text: 'text-gray-500' },
  stage:    { header: 'bg-green-100',  text: 'text-green-700' },
  ferie:    { header: 'bg-blue-100',   text: 'text-blue-600' },
  autre:    { header: 'bg-yellow-100', text: 'text-yellow-700' },
};

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' });
}

const hToPer = h => Math.round(h * 1.2 * 100) / 100;

// ─── Cellule éditable ─────────────────────────────────────────────────────────
function Cellule({ groupeId, semaineId, semaineType, value, onChange, warning }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const inputRef              = useRef();

  const display = cellDisplay(value);
  const upVal   = String(value || '').toUpperCase().trim();
  const special = CELL_SPECIAL[upVal];

  function startEdit() {
    setDraft(display || '');
    setEditing(true);
    setTimeout(() => { inputRef.current?.select(); }, 10);
  }

  function commit() {
    setEditing(false);
    const raw = draft.trim().toUpperCase();
    // Normaliser EV1/EV2/VC
    const normalized = CELL_SPECIAL[raw] ? raw : (parseFloat(draft) || 0);
    const prev = value || 0;
    if (String(normalized) !== String(prev)) onChange(normalized);
  }

  if (semaineType === 'vacances' || semaineType === 'ferie') {
    return (
      <td className="border border-gray-200 text-center text-xs w-10 h-8 bg-gray-100 text-gray-300 select-none">—</td>
    );
  }

  const bgClass = special
    ? `${special.bg} ${special.border}`
    : display ? 'bg-iip-gold/20' : 'bg-white hover:bg-iip-gold/5';

  return (
    <td
      className={`border border-gray-200 text-center text-xs w-10 h-8 cursor-pointer transition relative
        ${bgClass} ${warning ? 'ring-2 ring-red-400 ring-inset' : ''}`}
      onClick={startEdit}
      title={warning ? warning : undefined}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setDraft(''); setEditing(false); }
            if (e.key === 'Delete' || e.key === 'Backspace') setDraft('');
          }}
          style={{ MozAppearance: 'textfield', appearance: 'textfield' }}
          className="w-9 h-7 text-center text-xs border-0 bg-yellow-50 outline outline-2 outline-iip-gold rounded p-0"
          autoFocus
        />
      ) : (
        <span className={special ? `font-bold text-[10px] ${special.text}` : 'text-gray-800 text-xs'}>
          {display || <span className="text-gray-200">·</span>}
        </span>
      )}
      {warning && <span className="absolute top-0 right-0 text-[8px] text-red-500 leading-none">⚠</span>}
    </td>
  );
}

// ─── Ligne groupe (aplatie, sans niveau UE) ───────────────────────────────────
function LigneGroupe({ groupe, semaines, cellules, onCellChange, onEditGroupe, warnings }) {
  const hPlanif = semaines.reduce((s, sem) => {
    return s + cellHeures(cellules[`${groupe.id}_${sem.id}`]);
  }, 0);
  const pct  = groupe.heures_attribuees > 0 ? Math.round(hPlanif / groupe.heures_attribuees * 100) : 0;
  const over  = hPlanif > groupe.heures_attribuees + 0.01;
  const done  = !over && hPlanif >= groupe.heures_attribuees - 0.01 && groupe.heures_attribuees > 0;
  const warnSet = new Set((warnings || []).map(w => w.semaineId));

  return (
    <tr className="hover:bg-gray-50/50 group">
      {/* Nom : badge UE + nom UE + groupe + prof */}
      <td className="sticky left-0 z-10 bg-white border border-gray-200 px-2 py-1 min-w-[260px] max-w-[260px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center bg-iip-mauve/10 text-iip-mauve text-[10px] font-bold px-1.5 py-0.5 rounded">
            UE {groupe.ue_num}
          </span>
          <span className="text-xs text-gray-600 truncate max-w-[100px]" title={groupe.ue_nom}>
            {groupe.ue_nom || `UE ${groupe.ue_num}`}
          </span>
          {groupe.activite_nom && (
            <span className="text-[10px] bg-iip-gold/10 text-iip-gold px-1.5 py-0.5 rounded font-medium">
              {groupe.activite_nom}
            </span>
          )}
          <span className="text-[10px] text-gray-400">· Gr.{groupe.nom}</span>
          {groupe.prof_nom && (
            <span className="text-[10px] text-gray-500 ml-auto">
              {groupe.prof_nom} {groupe.prof_prenom?.[0] || ''}.
            </span>
          )}
          <button onClick={() => onEditGroupe(groupe)}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-iip-gold text-xs transition ml-1">✏</button>
        </div>
      </td>
      {/* Total */}
      <td className={`sticky left-[260px] z-10 border border-gray-200 text-center text-xs w-24 font-mono
        ${over ? 'bg-red-50 text-red-700' : done ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
        <div className="font-semibold text-[11px]">{Math.round(hPlanif * 10) / 10}h</div>
        <div className="text-[9px] opacity-70">/{groupe.heures_attribuees}h · {pct}%</div>
      </td>
      {/* Cellules */}
      {semaines.map(sem => (
        <Cellule
          key={sem.id}
          groupeId={groupe.id}
          semaineId={sem.id}
          semaineType={sem.type}
          value={cellules[`${groupe.id}_${sem.id}`] || ''}
          onChange={v => onCellChange(groupe.id, sem.id, v)}
          warning={warnSet.has(sem.id) ? (warnings.find(w => w.semaineId === sem.id)?.msg) : null}
        />
      ))}
      {/* PEP */}
      <td className="border border-gray-200 text-center text-[10px] w-14 bg-blue-50 text-blue-600 font-mono">
        {groupe.nb_etudiants > 0
          ? Math.round(hPlanif * groupe.nb_etudiants * 1.2)
          : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  );
}

// ─── Bloc section (groupes directs, sans niveau UE) ───────────────────────────
function BlocSection({ section, groupes, semaines, cellules, onCellChange, onEditGroupe, onAddGroupe }) {
  const [open, setOpen] = useState(true);

  const hAttrib  = groupes.reduce((s, g) => s + (g.heures_attribuees || 0), 0);
  const hPlanif  = groupes.reduce((s, g) =>
    s + semaines.reduce((ss, sem) => ss + cellHeures(cellules[`${g.id}_${sem.id}`]), 0), 0);
  const pepTotal = groupes.reduce((s, g) => {
    const h = semaines.reduce((ss, sem) => ss + cellHeures(cellules[`${g.id}_${sem.id}`]), 0);
    return s + h * (g.nb_etudiants || 0) * 1.2;
  }, 0);
  const pct = hAttrib > 0 ? Math.round(hPlanif / hAttrib * 100) : 0;

  // Calculer les warnings pour tous les groupes de cette section
  const warningsParGroupe = {};
  for (const g of groupes) {
    warningsParGroupe[g.id] = checkContraintes(g.id, semaines, cellules);
  }
  const totalWarnings = Object.values(warningsParGroupe).flat().length;

  return (
    <>
      {/* Header section */}
      <tr className="bg-iip-gold/10 cursor-pointer select-none" onClick={() => setOpen(v => !v)}>
        <td colSpan={2} className="sticky left-0 z-10 bg-iip-gold/10 border border-gray-300 px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm text-iip-gold">{open ? '▼' : '▶'} {section}</span>
            <span className="text-xs text-gray-500">{groupes.length} groupe{groupes.length > 1 ? 's' : ''}</span>
            {totalWarnings > 0 && (
              <span className="text-xs text-red-500 font-medium">⚠ {totalWarnings} alerte{totalWarnings > 1 ? 's' : ''}</span>
            )}
            <span className={`ml-auto text-xs font-semibold ${pct >= 100 ? 'text-green-600' : 'text-gray-500'}`}>
              {Math.round(hPlanif * 10) / 10}h / {Math.round(hAttrib * 10) / 10}h ({pct}%)
            </span>
          </div>
        </td>
        {semaines.map(sem => {
          const hSem = groupes.reduce((s, g) => s + cellHeures(cellules[`${g.id}_${sem.id}`]), 0);
          return (
            <td key={sem.id} className={`border border-gray-200 text-center text-[10px] w-10
              ${TYPE_STYLE[sem.type]?.header || 'bg-gray-50'}
              ${hSem > 0 ? 'text-iip-gold font-semibold' : 'text-transparent'}`}>
              {hSem > 0 ? hSem : '·'}
            </td>
          );
        })}
        <td className="border border-gray-200 text-center text-[10px] w-14 bg-blue-50 text-blue-600 font-bold">
          {Math.round(pepTotal)}
        </td>
      </tr>
      {open && groupes.map(g => (
        <LigneGroupe key={g.id} groupe={g} semaines={semaines} cellules={cellules}
          onCellChange={onCellChange} onEditGroupe={onEditGroupe}
          warnings={warningsParGroupe[g.id]} />
      ))}
      {open && (
        <tr>
          <td colSpan={semaines.length + 3} className="border border-gray-100 bg-gray-50/50 px-3 py-1">
            <button onClick={() => onAddGroupe(null, null, section)}
              className="text-xs text-gray-400 hover:text-iip-gold transition">+ Ajouter un groupe dans {section}</button>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Modal ajout/édition groupe ───────────────────────────────────────────────
function ModalGroupe({ initial, annee, profs, ues, onSave, onClose }) {
  const [ueNum, setUeNum]     = useState(initial?.ue_num || '');
  const [nom, setNom]         = useState(initial?.nom || '');
  const [nbEtu, setNbEtu]     = useState(initial?.nb_etudiants || '');
  const [profId, setProfId]   = useState(initial?.professeur_id || '');
  const [heures, setHeures]   = useState(initial?.heures_attribuees || '');
  const [notes, setNotes]     = useState(initial?.notes || '');
  const [saving, setSaving]   = useState(false);

  async function sauvegarder() {
    if (!nom || !ueNum) return;
    setSaving(true);
    try {
      const body = { nom, nb_etudiants: Number(nbEtu) || 0, professeur_id: Number(profId) || null, heures_attribuees: Number(heures) || 0, notes };
      if (initial?.id) {
        await authFetch(`/api/planification/groupes/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await authFetch('/api/planification/groupes', { method: 'POST', body: JSON.stringify({ annee_scolaire: annee, ue_num: Number(ueNum), section: initial?.section, ...body }) });
      }
      onSave();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{initial?.id ? 'Modifier le groupe' : 'Nouveau groupe'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {!initial?.id && (
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">UE *</label>
              <select value={ueNum} onChange={e => setUeNum(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">— Choisir une UE —</option>
                {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Groupe *</label>
            <input value={nom} onChange={e => setNom(e.target.value)} placeholder="A, B, 1…"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" autoFocus />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nb étudiants</label>
            <input type="number" value={nbEtu} onChange={e => setNbEtu(e.target.value)} min="0"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Professeur</label>
            <select value={profId} onChange={e => setProfId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
              <option value="">— Aucun / À définir —</option>
              {profs.map(p => <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Heures attribuées (60 min)</label>
            <input type="number" step="0.5" value={heures} onChange={e => setHeures(e.target.value)} min="0"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
            {heures > 0 && <p className="text-[10px] text-gray-400 mt-0.5">= {hToPer(Number(heures))} périodes de 50 min</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm px-4 py-1.5 rounded">Annuler</button>
          <button onClick={sauvegarder} disabled={!nom || !ueNum || saving}
            className="bg-iip-gold text-white text-sm px-4 py-1.5 rounded hover:bg-iip-amber disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel calendrier ─────────────────────────────────────────────────────────
function PanelCalendrier({ semaines, onUpdate, onClose }) {
  const [selected, setSelected] = useState(new Set());
  const [type, setType]         = useState('vacances');
  const [label, setLabel]       = useState('');
  const [saving, setSaving]     = useState(false);

  const TYPES = [
    { k: 'cours',    l: 'Cours' },
    { k: 'vacances', l: 'Vacances' },
    { k: 'stage',    l: 'Stage' },
    { k: 'ferie',    l: 'Férié' },
    { k: 'autre',    l: 'Autre' },
  ];

  async function appliquer() {
    if (!selected.size) return;
    setSaving(true);
    try {
      await authFetch('/api/planification/calendrier/bulk', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selected], type, label: label || null }),
      });
      onUpdate();
      setSelected(new Set());
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end">
      <div className="bg-white w-full max-w-2xl h-full overflow-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-800">Calendrier — ajuster les semaines</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="px-6 py-4 border-b space-y-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                {TYPES.map(t => <option key={t.k} value={t.k}>{t.l}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Label (optionnel)</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="ex. Vacances Noël"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
            </div>
            <button onClick={appliquer} disabled={!selected.size || saving}
              className="bg-iip-gold text-white text-sm px-4 py-1.5 rounded hover:bg-iip-amber disabled:opacity-40">
              Appliquer à {selected.size} sem.
            </button>
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:text-gray-600">Tout désélectionner</button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="grid grid-cols-5 gap-1.5">
            {semaines.map(sem => {
              const style = TYPE_STYLE[sem.type] || TYPE_STYLE.cours;
              const isSel = selected.has(sem.id);
              return (
                <button key={sem.id} onClick={() => setSelected(prev => { const n = new Set(prev); n.has(sem.id) ? n.delete(sem.id) : n.add(sem.id); return n; })}
                  className={`text-left p-2 rounded border-2 transition text-xs
                    ${isSel ? 'border-iip-gold shadow-sm' : 'border-gray-200 hover:border-gray-400'}
                    ${style.header}`}>
                  <div className={`font-semibold ${style.text}`}>S{sem.semaine_num}</div>
                  <div className="text-gray-500 text-[10px]">{fmtDate(sem.date_debut)}</div>
                  {sem.label && <div className={`text-[9px] mt-0.5 ${style.text}`}>{sem.label}</div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal import ─────────────────────────────────────────────────────────────
function ModalImport({ annee, onImported, onClose }) {
  const [preview, setPreview]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [mode, setMode]           = useState('skip');
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState(null);

  useEffect(() => {
    authFetch(`/api/planification/import-preview?annee=${encodeURIComponent(annee)}`)
      .then(d => setPreview(d)).finally(() => setLoading(false));
  }, [annee]);

  async function lancer() {
    setImporting(true);
    try {
      const d = await authFetch('/api/planification/import-from-attributions', {
        method: 'POST', body: JSON.stringify({ annee, mode }),
      });
      setResult(d);
    } finally { setImporting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Import depuis les attributions — {annee}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Analyse des attributions…</div>
          ) : result ? (
            <div className="text-center space-y-3 py-8">
              <p className="text-4xl">✅</p>
              <p className="font-semibold text-gray-800">Import terminé</p>
              <div className="flex justify-center gap-6 text-sm">
                <div><span className="text-2xl font-bold text-green-600">{result.created}</span><p className="text-gray-500">groupes créés</p></div>
                <div><span className="text-2xl font-bold text-gray-400">{result.skipped}</span><p className="text-gray-500">déjà existants</p></div>
              </div>
              <p className="text-xs text-gray-400">Le nombre d'étudiants reste à 0 — à compléter via le bouton ✏ de chaque ligne.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-4">
                <div className="bg-iip-gold/10 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-iip-gold">{preview?.groupes?.length || 0}</p>
                  <p className="text-xs text-gray-500">groupes à importer</p>
                </div>
                {preview?.existants > 0 && (
                  <div className="bg-orange-50 rounded-lg px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-orange-500">{preview.existants}</p>
                    <p className="text-xs text-gray-500">déjà en base</p>
                  </div>
                )}
              </div>
              {preview?.existants > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-orange-800">Des groupes existent déjà. Comment procéder ?</p>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="radio" value="skip" checked={mode==='skip'} onChange={() => setMode('skip')} />
                      Ajouter seulement les nouveaux
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-red-700">
                      <input type="radio" value="replace" checked={mode==='replace'} onChange={() => setMode('replace')} />
                      Tout remplacer <span className="text-xs text-red-500">(perd la planification saisie)</span>
                    </label>
                  </div>
                </div>
              )}
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Section</th>
                      <th className="px-3 py-2 text-left">UE</th>
                      <th className="px-3 py-2 text-center">Gr.</th>
                      <th className="px-3 py-2 text-right">Heures</th>
                      <th className="px-3 py-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(preview?.groupes || []).map((g, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-medium text-iip-mauve">{g.section || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600">UE {g.ue_num} <span className="text-gray-400">{g.ue_nom?.slice(0,25)}</span></td>
                        <td className="px-3 py-1.5 text-center font-bold">{g.nom}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{g.heures_attribuees}h</td>
                        <td className="px-3 py-1.5 text-gray-400 italic">{g.notes || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">⚠ Le nombre d'étudiants restera à 0 — à compléter via le bouton ✏.</p>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          {result ? (
            <button onClick={() => { onImported(); onClose(); }} className="bg-iip-gold text-white text-sm px-5 py-2 rounded hover:bg-iip-amber">Voir la grille</button>
          ) : (
            <>
              <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded">Annuler</button>
              <button onClick={lancer} disabled={importing || loading || !preview?.groupes?.length}
                className="bg-iip-gold text-white text-sm px-5 py-2 rounded hover:bg-iip-amber disabled:opacity-40">
                {importing ? 'Import…' : `Importer ${preview?.groupes?.length || 0} groupes`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal génération IA ──────────────────────────────────────────────────────
function ModalIA({ annee, section, onApplied, onClose }) {
  const [step, setStep]             = useState('config'); // config | preview | applying | done
  const [preserverManuel, setPreserver] = useState(true);
  const [preview, setPreview]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  async function genererPreview() {
    setLoading(true); setError(null);
    try {
      const d = await authFetch('/api/planification-ia/generer', {
        method: 'POST',
        body: JSON.stringify({ section, annee_scolaire: annee, mode: 'preview', preserverManuel }),
      });
      if (d.error) { setError(d.error); return; }
      setPreview(d);
      setStep('preview');
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function appliquer() {
    setStep('applying'); setError(null);
    try {
      const d = await authFetch('/api/planification-ia/generer', {
        method: 'POST',
        body: JSON.stringify({ section, annee_scolaire: annee, mode: 'apply', preserverManuel }),
      });
      if (d.error) { setError(d.error); setStep('preview'); return; }
      setStep('done');
      setTimeout(() => { onApplied(); onClose(); }, 1500);
    } catch(e) { setError(e.message); setStep('preview'); }
  }

  const nbCellules = preview ? Object.values(preview.proposition).reduce((s, c) => s + Object.keys(c).length, 0) : 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="font-semibold text-gray-800">✨ Planification IA — {section}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{annee}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-4">

          {/* Step : config */}
          {step === 'config' && (
            <>
              <div className="bg-iip-mauve/5 border border-iip-mauve/20 rounded-lg p-4 text-sm text-gray-700 space-y-2">
                <p className="font-medium text-iip-mauve">Ce que Lucie IA va faire :</p>
                <ul className="space-y-1 text-xs text-gray-600 list-disc list-inside">
                  <li>Respecter l'ordre des prérequis UE (organigramme)</li>
                  <li>Distribuer les heures uniformément selon le quadrimestre de chaque UE</li>
                  <li>Placer EV1, VC et EV2 automatiquement aux bonnes semaines</li>
                  <li>Appliquer le pattern d'alternance de chaque groupe</li>
                </ul>
              </div>

              <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                <input type="checkbox" checked={preserverManuel} onChange={e => setPreserver(e.target.checked)}
                  className="w-4 h-4 accent-iip-mauve" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Préserver mes saisies manuelles</p>
                  <p className="text-xs text-gray-400">Les cellules que tu as saisies toi-même ne seront pas écrasées</p>
                </div>
              </label>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
            </>
          )}

          {/* Step : preview */}
          {step === 'preview' && preview && (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-iip-mauve/5 rounded-lg p-3">
                  <p className="text-2xl font-bold text-iip-mauve">{preview.meta.groupes_traites}</p>
                  <p className="text-xs text-gray-500">groupes planifiés</p>
                </div>
                <div className="bg-iip-gold/10 rounded-lg p-3">
                  <p className="text-2xl font-bold text-iip-gold">{nbCellules}</p>
                  <p className="text-xs text-gray-500">cellules à créer</p>
                </div>
                <div className={`rounded-lg p-3 ${preview.alertes.length ? 'bg-red-50' : 'bg-green-50'}`}>
                  <p className={`text-2xl font-bold ${preview.alertes.length ? 'text-red-600' : 'text-green-600'}`}>
                    {preview.alertes.length}
                  </p>
                  <p className="text-xs text-gray-500">alertes</p>
                </div>
              </div>

              {/* Ordre des UE */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Ordre de planification (prérequis respectés)</p>
                <div className="flex flex-wrap gap-1">
                  {preview.meta.ue_ordre.map((n, i) => (
                    <span key={n} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {i+1}. UE{n}
                    </span>
                  ))}
                </div>
              </div>

              {/* Note évaluations */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700">
                📅 EV1, VC et EV2 sont placés automatiquement après les derniers cours de chaque groupe
              </div>

              {/* Alertes */}
              {preview.alertes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-red-600">⚠ Alertes ({preview.alertes.length})</p>
                  {preview.alertes.map((a, i) => (
                    <div key={i} className="text-xs bg-red-50 border border-red-200 rounded p-2 text-red-700">{a.msg}</div>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>}
            </>
          )}

          {/* Step : applying */}
          {step === 'applying' && (
            <div className="text-center py-8 space-y-3">
              <p className="text-3xl animate-pulse">✨</p>
              <p className="font-medium text-gray-700">Application en cours…</p>
            </div>
          )}

          {/* Step : done */}
          {step === 'done' && (
            <div className="text-center py-8 space-y-3">
              <p className="text-3xl">✅</p>
              <p className="font-medium text-gray-700">Planification appliquée !</p>
              <p className="text-xs text-gray-400">La grille s'actualise…</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          {step === 'config' && (
            <>
              <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded">Annuler</button>
              <button onClick={genererPreview} disabled={loading}
                className="bg-iip-mauve text-white text-sm px-5 py-2 rounded hover:opacity-90 disabled:opacity-50">
                {loading ? 'Analyse en cours…' : 'Générer un aperçu →'}
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('config')} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded">← Retour</button>
              <button onClick={appliquer}
                className="bg-iip-mauve text-white text-sm px-5 py-2 rounded hover:opacity-90">
                Appliquer en brouillon
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal réinitialisation planification ─────────────────────────────────────
function ModalReset({ annee, section, onReset, onClose }) {
  const [etape, setEtape]   = useState('choix'); // choix | confirm | doing | done
  const [mode, setMode]     = useState('cellules'); // 'cellules' | 'tout'
  const [error, setError]   = useState(null);

  async function executer() {
    setEtape('doing');
    try {
      const r = await authFetch('/api/planification/reset', {
        method: 'POST',
        body: JSON.stringify({ annee_scolaire: annee, section, mode }),
      });
      if (r.error) { setError(r.error); setEtape('confirm'); return; }
      setEtape('done');
      setTimeout(() => { onReset(); onClose(); }, 1200);
    } catch(e) { setError(e.message); setEtape('confirm'); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-800">🗑 Réinitialiser la planification</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {etape === 'choix' && (
            <>
              <p className="text-sm text-gray-600">
                Section <strong>{section}</strong> — Année <strong>{annee}</strong>
              </p>
              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input type="radio" name="mode" value="cellules" checked={mode==='cellules'} onChange={()=>setMode('cellules')} className="mt-0.5 accent-iip-gold" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Effacer uniquement les cellules</p>
                    <p className="text-xs text-gray-400">Les groupes sont conservés, seule la planification est effacée. Utile pour régénérer avec l'IA.</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input type="radio" name="mode" value="tout" checked={mode==='tout'} onChange={()=>setMode('tout')} className="mt-0.5 accent-red-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Effacer groupes + cellules</p>
                    <p className="text-xs text-gray-400">Repart de zéro. Nécessite un nouvel import depuis les attributions.</p>
                  </div>
                </label>
              </div>
            </>
          )}

          {etape === 'confirm' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <p className="font-medium mb-1">⚠ Confirmation requise</p>
              <p>{mode === 'tout'
                ? `Tous les groupes et cellules de ${section} seront supprimés définitivement.`
                : `Toutes les cellules de planification de ${section} seront effacées.`}
              </p>
              {error && <p className="mt-2 text-red-600">{error}</p>}
            </div>
          )}

          {etape === 'doing' && (
            <div className="text-center py-6">
              <p className="text-gray-500 animate-pulse">Réinitialisation en cours…</p>
            </div>
          )}

          {etape === 'done' && (
            <div className="text-center py-6">
              <p className="text-green-600 font-medium">✓ Planification réinitialisée</p>
            </div>
          )}
        </div>

        {(etape === 'choix' || etape === 'confirm') && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t">
            <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded">Annuler</button>
            {etape === 'choix' && (
              <button onClick={() => setEtape('confirm')}
                className="bg-red-600 text-white text-sm px-5 py-2 rounded hover:bg-red-700">
                Continuer →
              </button>
            )}
            {etape === 'confirm' && (
              <button onClick={executer}
                className="bg-red-600 text-white text-sm px-5 py-2 rounded hover:bg-red-700">
                Confirmer la suppression
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Planification() {
  const annee = getAnnee();
  const [grille, setGrille]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [sections, setSections]       = useState([]);
  const [ues, setUes]                 = useState([]);
  const [filtreSection, setFiltreSection] = useState('');
  const [profs, setProfs]             = useState([]);
  const [modalGroupe, setModalGroupe] = useState(null);
  const [showCalendrier, setShowCalendrier] = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [showIA, setShowIA]           = useState(false);
  const [showReset, setShowReset]     = useState(false);
  const [pendingCells, setPendingCells] = useState({});
  const pendingRef                    = useRef({});
  const [saving, setSaving]           = useState(false);
  const saveTimerRef                  = useRef(null);

  useEffect(() => {
    charger();
    authFetch('/api/ref/sections').then(d => setSections(Array.isArray(d) ? d : [])).catch(() => {});
    authFetch('/api/ref/professeurs').then(d => setProfs(Array.isArray(d) ? d : [])).catch(() => {});
    authFetch(`/api/ref/ue?annee=${encodeURIComponent(annee)}`).then(d => setUes(Array.isArray(d) ? d : [])).catch(() => {});
  }, [annee, filtreSection]);

  async function charger() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ annee });
      if (filtreSection) params.set('section', filtreSection);
      const d = await authFetch(`/api/planification/grille?${params}`);
      setGrille(d);
      pendingRef.current = {};
      setPendingCells({});
    } finally { setLoading(false); }
  }

  const parSection = {};
  if (grille?.groupes) {
    for (const g of grille.groupes) {
      const s = g.section || '(Sans section)';
      if (!parSection[s]) parSection[s] = [];
      parSection[s].push(g);
    }
  }

  const cellulesEffectives = grille ? { ...grille.cellules, ...pendingCells } : {};

  function handleCellChange(groupeId, semaineId, valeur) {
    const key = `${groupeId}_${semaineId}`;
    pendingRef.current = { ...pendingRef.current, [key]: valeur };
    setPendingCells({ ...pendingRef.current });
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => sauvegarderPending(), 800);
  }

  async function sauvegarderPending() {
    const cells = pendingRef.current;
    if (!Object.keys(cells).length) return;
    // Convertir les valeurs spéciales en format stockable
    const cellules = Object.entries(cells).map(([k, valeur]) => {
      const [groupe_id, semaine_id] = k.split('_').map(Number);
      return { groupe_id, semaine_id, heures: valeur };
    }).filter(c => c.groupe_id && c.semaine_id);
    if (!cellules.length) return;
    setSaving(true);
    try {
      await authFetch('/api/planification/cellules-bulk', { method: 'PUT', body: JSON.stringify({ cellules }) });
      setGrille(prev => {
        if (!prev) return prev;
        const newCellules = { ...prev.cellules };
        for (const { groupe_id, semaine_id, heures } of cellules) {
          const key = `${groupe_id}_${semaine_id}`;
          if (!heures || heures === 0 || heures === '0' || heures === '') delete newCellules[key];
          else newCellules[key] = heures;
        }
        return { ...prev, cellules: newCellules };
      });
      pendingRef.current = {};
      setPendingCells({});
    } finally { setSaving(false); }
  }

  const semaines = grille?.semaines || [];

  const totalH = grille?.groupes?.reduce((s, g) =>
    s + semaines.reduce((ss, sem) => ss + cellHeures(cellulesEffectives[`${g.id}_${sem.id}`]), 0), 0) || 0;
  const totalPEP = grille?.groupes?.reduce((s, g) => {
    const h = semaines.reduce((ss, sem) => ss + cellHeures(cellulesEffectives[`${g.id}_${sem.id}`]), 0);
    return s + h * (g.nb_etudiants || 0) * 1.2;
  }, 0) || 0;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Barre d'outils */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 flex-wrap">
        <h1 className="font-title text-iip-mauve font-bold text-sm">📐 Planification — {annee}</h1>
        <select value={filtreSection} onChange={e => setFiltreSection(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-xs bg-white">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
        </select>
        <div className="flex-1" />
        {/* Légende */}
        <div className="flex gap-1.5 items-center text-[10px]">
          <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-bold">EV1 = 2h</span>
          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">EV2 = 0h</span>
          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-bold">VC = 1h</span>
        </div>
        <button onClick={() => setShowImport(true)}
          className="bg-iip-gold text-white text-xs px-3 py-1.5 rounded hover:bg-iip-amber">
          ⬇ Importer
        </button>
        {filtreSection && (
          <button onClick={() => setShowIA(true)}
            className="bg-iip-mauve text-white text-xs px-3 py-1.5 rounded hover:opacity-90 flex items-center gap-1">
            ✨ Générer avec Lucie IA
          </button>
        )}
        {filtreSection && (
          <button onClick={() => setShowReset(true)}
            className="bg-red-100 text-red-600 text-xs px-3 py-1.5 rounded hover:bg-red-200 flex items-center gap-1">
            🗑 Réinitialiser
          </button>
        )}
        <button onClick={() => setShowCalendrier(true)}
          className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50">
          📅 Calendrier
        </button>
        {saving && <span className="text-xs text-iip-gold animate-pulse">💾</span>}
        {!saving && Object.keys(pendingCells).length === 0 && grille && <span className="text-xs text-green-500">✓</span>}
      </div>

      {/* Bandeau synthèse */}
      {grille && (
        <div className="flex-shrink-0 flex gap-6 px-4 py-1.5 bg-iip-gold/5 border-b border-iip-gold/20 text-xs">
          <span className="text-gray-500">Heures planifiées <strong className="text-gray-800">{Math.round(totalH * 10) / 10} h</strong></span>
          <span className="text-gray-500">PEP générées <strong className="text-blue-700">{Math.round(totalPEP)}</strong></span>
          <span className="text-gray-500">Groupes <strong className="text-gray-800">{grille.groupes?.length || 0}</strong></span>
        </div>
      )}

      {/* Grille */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Chargement…</div>
        ) : (
          <table className="border-collapse text-xs" style={{ minWidth: `${284 + semaines.length * 40 + 56}px` }}>
            <thead className="sticky top-0 z-20">
              {/* Mois */}
              <tr>
                <th className="sticky left-0 z-30 bg-white border border-gray-300 w-[260px]"></th>
                <th className="sticky left-[260px] z-30 bg-white border border-gray-300 w-24 text-center text-[9px] text-gray-400">Total</th>
                {semaines.map((sem, i) => {
                  const style = TYPE_STYLE[sem.type] || TYPE_STYLE.cours;
                  const mois = new Date(sem.date_debut + 'T12:00:00').toLocaleDateString('fr-BE', { month: 'short' });
                  const prev = i > 0 ? new Date(semaines[i-1].date_debut + 'T12:00:00').toLocaleDateString('fr-BE', { month: 'short' }) : null;
                  return (
                    <th key={sem.id} className={`border border-gray-200 text-center w-10 text-[9px] font-medium ${style.header} ${style.text}`}
                      title={`S${sem.semaine_num} · ${fmtDate(sem.date_debut)}${sem.label ? ' · '+sem.label : ''}`}>
                      {mois !== prev ? mois : ''}
                    </th>
                  );
                })}
                <th className="border border-gray-300 bg-blue-50 text-blue-600 text-[9px] w-14 text-center">PEP</th>
              </tr>
              {/* N° semaine + date */}
              <tr>
                <th className="sticky left-0 z-30 bg-gray-50 border border-gray-300 text-left px-2 text-[9px] text-gray-400 font-normal">Attribution</th>
                <th className="sticky left-[260px] z-30 bg-gray-50 border border-gray-300 text-center text-[9px] text-gray-400 font-normal">planif./attr.</th>
                {semaines.map(sem => {
                  const style = TYPE_STYLE[sem.type] || TYPE_STYLE.cours;
                  return (
                    <th key={sem.id} className={`border border-gray-200 text-center w-10 ${style.header} ${style.text}`}
                      title={`${fmtDate(sem.date_debut)}–${fmtDate(sem.date_fin)}`}>
                      <div className="text-[9px] font-mono font-semibold">{sem.semaine_num}</div>
                      <div className="text-[8px] font-normal text-gray-400">{fmtDate(sem.date_debut)}</div>
                    </th>
                  );
                })}
                <th className="border border-gray-300 bg-blue-50 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(parSection).length === 0 ? (
                <tr>
                  <td colSpan={semaines.length + 3} className="text-center py-16 text-gray-400">
                    <p className="text-2xl mb-2">➕</p>
                    <p className="text-sm">Aucun groupe configuré pour {annee}.</p>
                    <button onClick={() => setShowImport(true)}
                      className="mt-3 bg-iip-gold text-white text-sm px-5 py-2 rounded hover:bg-iip-amber">
                      ⬇ Importer depuis les attributions
                    </button>
                  </td>
                </tr>
              ) : (
                Object.entries(parSection).sort(([a],[b]) => a.localeCompare(b)).map(([sec, grps]) => (
                  <BlocSection key={sec} section={sec}
                    groupes={grps.sort((a,b) => a.ue_num - b.ue_num || a.nom.localeCompare(b.nom))}
                    semaines={semaines} cellules={cellulesEffectives}
                    onCellChange={handleCellChange}
                    onEditGroupe={g => setModalGroupe({ initial: g })}
                    onAddGroupe={(_, __, section) => setModalGroupe({ initial: { section } })}
                  />
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalGroupe && (
        <ModalGroupe {...modalGroupe} annee={annee} profs={profs} ues={ues}
          onSave={() => { setModalGroupe(null); charger(); }}
          onClose={() => setModalGroupe(null)} />
      )}
      {showImport && <ModalImport annee={annee} onImported={charger} onClose={() => setShowImport(false)} />}
      {showIA && <ModalIA annee={annee} section={filtreSection} onApplied={charger} onClose={() => setShowIA(false)} />}
      {showReset && <ModalReset annee={annee} section={filtreSection} onReset={charger} onClose={() => setShowReset(false)} />}
      {showCalendrier && <PanelCalendrier semaines={semaines} onUpdate={charger} onClose={() => setShowCalendrier(false)} />}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { getAnnee } from '../lib/api.js';

const TOKEN = () => localStorage.getItem('token');
const authFetch = (url, opts = {}) =>
  fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}`, ...opts.headers } }).then(r => r.json());

// ─── Couleurs par type de semaine ─────────────────────────────────────────────
const TYPE_STYLE = {
  cours:    { bg: 'bg-white',       header: 'bg-gray-50',      text: 'text-gray-700', label: 'Cours' },
  ev1:      { bg: 'bg-orange-50',   header: 'bg-orange-200',   text: 'text-orange-800', label: 'EV1' },
  ev2:      { bg: 'bg-red-50',      header: 'bg-red-200',      text: 'text-red-800',    label: 'EV2' },
  vacances: { bg: 'bg-gray-100',    header: 'bg-gray-300',     text: 'text-gray-500',   label: 'Vac.' },
  stage:    { bg: 'bg-green-50',    header: 'bg-green-200',    text: 'text-green-800',  label: 'Stage' },
  ferie:    { bg: 'bg-blue-50',     header: 'bg-blue-200',     text: 'text-blue-700',   label: 'Férié' },
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' });
}

// ─── Conversion heures ↔ périodes (1h = 1.2 périodes de 50min) ───────────────
const hToPer = h => Math.round(h * 1.2 * 100) / 100;
const perToH  = p => Math.round(p / 1.2 * 100) / 100;

// ─── Cellule éditable ─────────────────────────────────────────────────────────
function Cellule({ value, semaineType, onChange, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');
  const inputRef = useRef();

  useEffect(() => { setVal(value || ''); }, [value]);

  function commit() {
    setEditing(false);
    const h = parseFloat(val) || 0;
    if (h !== (parseFloat(value) || 0)) onChange(h);
  }

  const bgClass = value > 0
    ? 'bg-iip-gold/20 font-semibold text-gray-800'
    : TYPE_STYLE[semaineType]?.bg || 'bg-white';

  if (readOnly || semaineType === 'vacances' || semaineType === 'ferie') {
    return (
      <td className={`border border-gray-200 text-center text-xs w-10 h-8 ${bgClass} text-gray-400`}>
        {semaineType === 'vacances' || semaineType === 'ferie' ? '—' : (value > 0 ? value : '')}
      </td>
    );
  }

  return (
    <td
      className={`border border-gray-200 text-center text-xs w-10 h-8 cursor-pointer hover:bg-iip-gold/10 transition ${bgClass}`}
      onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 10); }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="number" step="0.5" min="0" max="40"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') commit(); if (e.key === 'Escape') { setVal(value || ''); setEditing(false); } }}
          className="w-9 h-7 text-center text-xs border-0 bg-yellow-50 outline outline-2 outline-iip-gold rounded"
          autoFocus
        />
      ) : (
        value > 0 ? value : <span className="text-gray-200">·</span>
      )}
    </td>
  );
}

// ─── Ligne groupe ─────────────────────────────────────────────────────────────
function LigneGroupe({ groupe, semaines, cellules, onCellChange, onEditGroupe }) {
  const hPlanif = semaines.reduce((s, sem) => s + (cellules[`${groupe.id}_${sem.id}`] || 0), 0);
  const pct = groupe.heures_attribuees > 0 ? Math.round(hPlanif / groupe.heures_attribuees * 100) : 0;
  const ok = hPlanif >= groupe.heures_attribuees - 0.01;
  const over = hPlanif > groupe.heures_attribuees + 0.01;

  return (
    <tr className="hover:bg-gray-50/50 group">
      {/* Nom groupe */}
      <td className="sticky left-0 z-10 bg-white border border-gray-200 px-2 py-1 min-w-[200px] max-w-[200px]">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-gray-700">
              {groupe.prof_nom ? `${groupe.prof_nom} ${groupe.prof_prenom?.[0] || ''}.` : '—'}
            </span>
            <span className="ml-1.5 text-xs text-gray-400">Gr. {groupe.nom}</span>
            {groupe.nb_etudiants > 0 && (
              <span className="ml-1 text-xs text-blue-500">{groupe.nb_etudiants}étu</span>
            )}
          </div>
          <button onClick={() => onEditGroupe(groupe)}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-iip-gold text-xs transition">✏</button>
        </div>
      </td>
      {/* Total planifié */}
      <td className={`sticky left-[200px] z-10 border border-gray-200 text-center text-xs w-20 font-mono
        ${over ? 'bg-red-50 text-red-700' : ok ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
        <div className="font-semibold">{Math.round(hPlanif * 10) / 10}h</div>
        <div className="text-[10px] opacity-70">/ {groupe.heures_attribuees}h ({pct}%)</div>
      </td>
      {/* Cellules semaines */}
      {semaines.map(sem => (
        <Cellule
          key={sem.id}
          value={cellules[`${groupe.id}_${sem.id}`] || 0}
          semaineType={sem.type}
          onChange={h => onCellChange(groupe.id, sem.id, h)}
        />
      ))}
      {/* PEP total */}
      <td className="border border-gray-200 text-center text-xs w-16 bg-blue-50 text-blue-700 font-mono">
        {groupe.nb_etudiants > 0 ? Math.round(hPlanif * groupe.nb_etudiants * 1.2) : '—'}
      </td>
    </tr>
  );
}

// ─── Ligne UE (avec groupes dépliables) ───────────────────────────────────────
function LigneUE({ ue_num, ue_nom, groupes, semaines, cellules, onCellChange, onEditGroupe, onAddGroupe }) {
  const [open, setOpen] = useState(true);
  const hAttrib  = groupes.reduce((s, g) => s + g.heures_attribuees, 0);
  const hPlanif  = groupes.reduce((s, g) =>
    s + semaines.reduce((ss, sem) => ss + (cellules[`${g.id}_${sem.id}`] || 0), 0), 0);
  const pepTotal = groupes.reduce((s, g) => {
    const h = semaines.reduce((ss, sem) => ss + (cellules[`${g.id}_${sem.id}`] || 0), 0);
    return s + h * g.nb_etudiants * 1.2;
  }, 0);

  return (
    <>
      {/* Ligne UE */}
      <tr className="bg-iip-mauve/5 cursor-pointer select-none" onClick={() => setOpen(v => !v)}>
        <td colSpan={2} className="sticky left-0 z-10 bg-iip-mauve/5 border border-gray-200 px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className="text-iip-mauve font-semibold text-xs">{open ? '▼' : '▶'}</span>
            <span className="text-xs font-bold text-iip-mauve">UE {ue_num}</span>
            <span className="text-xs text-gray-600 truncate max-w-[180px]">{ue_nom}</span>
            <span className="ml-auto text-xs text-gray-400">{groupes.length} gr.</span>
          </div>
        </td>
        {semaines.map(sem => {
          const hSem = groupes.reduce((s, g) => s + (cellules[`${g.id}_${sem.id}`] || 0), 0);
          return (
            <td key={sem.id} className={`border border-gray-200 text-center text-[10px] w-10 
              ${TYPE_STYLE[sem.type]?.bg || ''} ${hSem > 0 ? 'text-iip-mauve font-semibold' : 'text-transparent'}`}>
              {hSem > 0 ? hSem : '·'}
            </td>
          );
        })}
        <td className="border border-gray-200 text-center text-xs w-16 bg-blue-50 text-blue-600 font-semibold">
          {Math.round(pepTotal)}
        </td>
      </tr>
      {/* Lignes groupes */}
      {open && groupes.map(g => (
        <LigneGroupe key={g.id} groupe={g} semaines={semaines} cellules={cellules}
          onCellChange={onCellChange} onEditGroupe={onEditGroupe} />
      ))}
      {open && (
        <tr>
          <td colSpan={semaines.length + 3} className="border border-gray-100 bg-gray-50 px-3 py-1">
            <button onClick={() => onAddGroupe(ue_num, ue_nom)}
              className="text-xs text-gray-400 hover:text-iip-gold transition">+ Ajouter un groupe</button>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Bloc section (avec UE dépliables) ────────────────────────────────────────
function BlocSection({ section, groupes, semaines, cellules, onCellChange, onEditGroupe, onAddGroupe }) {
  const [open, setOpen] = useState(true);

  // Grouper les groupes par UE
  const parUE = {};
  for (const g of groupes) {
    const key = g.ue_num;
    if (!parUE[key]) parUE[key] = { ue_num: g.ue_num, ue_nom: g.ue_nom || `UE ${g.ue_num}`, groupes: [] };
    parUE[key].groupes.push(g);
  }
  const ues = Object.values(parUE).sort((a, b) => a.ue_num - b.ue_num);

  // Totaux section
  const hAttrib = groupes.reduce((s, g) => s + g.heures_attribuees, 0);
  const hPlanif = groupes.reduce((s, g) =>
    s + semaines.reduce((ss, sem) => ss + (cellules[`${g.id}_${sem.id}`] || 0), 0), 0);
  const pepTotal = groupes.reduce((s, g) => {
    const h = semaines.reduce((ss, sem) => ss + (cellules[`${g.id}_${sem.id}`] || 0), 0);
    return s + h * g.nb_etudiants * 1.2;
  }, 0);
  const pct = hAttrib > 0 ? Math.round(hPlanif / hAttrib * 100) : 0;

  return (
    <>
      {/* Header section */}
      <tr className="bg-iip-gold/15 cursor-pointer select-none" onClick={() => setOpen(v => !v)}>
        <td colSpan={2} className="sticky left-0 z-10 bg-iip-gold/15 border border-gray-300 px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm text-iip-gold">{open ? '▼' : '▶'} {section}</span>
            <span className="text-xs text-gray-600">{ues.length} UE · {groupes.length} groupes</span>
            <span className={`ml-auto text-xs font-semibold ${pct >= 100 ? 'text-green-600' : 'text-gray-500'}`}>
              {Math.round(hPlanif * 10) / 10}h / {Math.round(hAttrib * 10) / 10}h ({pct}%)
            </span>
          </div>
        </td>
        {semaines.map(sem => {
          const hSem = groupes.reduce((s, g) => s + (cellules[`${g.id}_${sem.id}`] || 0), 0);
          return (
            <td key={sem.id} className={`border border-gray-200 text-center text-[10px] w-10 font-semibold
              ${TYPE_STYLE[sem.type]?.bg || ''} ${hSem > 0 ? 'text-iip-gold' : 'text-transparent'}`}>
              {hSem > 0 ? hSem : '·'}
            </td>
          );
        })}
        <td className="border border-gray-200 text-center text-xs w-16 bg-blue-100 text-blue-700 font-bold">
          {Math.round(pepTotal)}
        </td>
      </tr>
      {open && ues.map(ue => (
        <LigneUE key={ue.ue_num} {...ue} semaines={semaines} cellules={cellules}
          onCellChange={onCellChange} onEditGroupe={onEditGroupe} onAddGroupe={onAddGroupe} />
      ))}
    </>
  );
}

// ─── Modal ajout/édition groupe ───────────────────────────────────────────────
function ModalGroupe({ initial, ue_num, ue_nom, annee, profs, onSave, onClose }) {
  const [nom, setNom]                 = useState(initial?.nom || '');
  const [nbEtu, setNbEtu]             = useState(initial?.nb_etudiants || '');
  const [profId, setProfId]           = useState(initial?.professeur_id || '');
  const [heures, setHeures]           = useState(initial?.heures_attribuees || '');
  const [notes, setNotes]             = useState(initial?.notes || '');
  const [saving, setSaving]           = useState(false);

  async function sauvegarder() {
    if (!nom) return;
    setSaving(true);
    try {
      if (initial?.id) {
        await authFetch(`/api/planification/groupes/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ nom, nb_etudiants: Number(nbEtu) || 0, professeur_id: Number(profId) || null, heures_attribuees: Number(heures) || 0, notes }),
        });
      } else {
        await authFetch('/api/planification/groupes', {
          method: 'POST',
          body: JSON.stringify({ annee_scolaire: annee, ue_num, section: initial?.section, nom, nb_etudiants: Number(nbEtu) || 0, professeur_id: Number(profId) || null, heures_attribuees: Number(heures) || 0, notes }),
        });
      }
      onSave();
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">
            {initial?.id ? 'Modifier le groupe' : 'Nouveau groupe'} — UE {ue_num} {ue_nom ? `· ${ue_nom}` : ''}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom du groupe *</label>
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
          <button onClick={sauvegarder} disabled={!nom || saving}
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
  const [type, setType] = useState('vacances');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleSem(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

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
          <h3 className="font-semibold text-gray-800">Calendrier annuel — ajuster les semaines</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="px-6 py-4 border-b bg-gray-50 space-y-3">
          <p className="text-xs text-gray-500">Sélectionnez des semaines puis choisissez leur type.</p>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                {Object.entries(TYPE_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
          <div className="grid grid-cols-4 gap-2">
            {semaines.map(sem => {
              const style = TYPE_STYLE[sem.type] || TYPE_STYLE.cours;
              const isSel = selected.has(sem.id);
              return (
                <button key={sem.id} onClick={() => toggleSem(sem.id)}
                  className={`text-left p-2 rounded border-2 transition text-xs
                    ${isSel ? 'border-iip-gold shadow-md' : 'border-gray-200 hover:border-gray-400'}
                    ${style.bg}`}>
                  <div className={`font-semibold ${style.text}`}>S{sem.semaine_num}</div>
                  <div className="text-gray-500">{fmtDate(sem.date_debut)}</div>
                  <div className={`text-[10px] mt-0.5 ${style.text}`}>{sem.label || style.label}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal import depuis attributions ────────────────────────────────────────
function ModalImport({ annee, onImported, onClose }) {
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [mode, setMode]         = useState('skip');
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState(null);

  useEffect(() => {
    authFetch(`/api/planification/import-preview?annee=${encodeURIComponent(annee)}`)
      .then(d => setPreview(d))
      .finally(() => setLoading(false));
  }, [annee]);

  async function lancer() {
    setImporting(true);
    try {
      const d = await authFetch('/api/planification/import-from-attributions', {
        method: 'POST',
        body: JSON.stringify({ annee, mode }),
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
              <p className="text-xs text-gray-400">Le nombre d'étudiants reste à 0 — à compléter par le secrétariat.</p>
            </div>
          ) : (
            <>
              {/* Stats */}
              <div className="flex gap-4 text-sm">
                <div className="bg-iip-gold/10 rounded-lg px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-iip-gold">{preview?.groupes?.length || 0}</p>
                  <p className="text-xs text-gray-500">groupes à importer</p>
                </div>
                {preview?.existants > 0 && (
                  <div className="bg-orange-50 rounded-lg px-4 py-3 text-center">
                    <p className="text-2xl font-bold text-orange-500">{preview.existants}</p>
                    <p className="text-xs text-gray-500">groupes déjà en base</p>
                  </div>
                )}
              </div>

              {/* Mode si groupes existants */}
              {preview?.existants > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-orange-800">Des groupes existent déjà pour {annee}. Comment procéder ?</p>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="radio" value="skip" checked={mode==='skip'} onChange={() => setMode('skip')} />
                      <span>Ajouter seulement les nouveaux (ne pas toucher aux existants)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="radio" value="replace" checked={mode==='replace'} onChange={() => setMode('replace')} />
                      <span className="text-red-700">Tout remplacer <span className="text-xs">(perd la planification saisie !)</span></span>
                    </label>
                  </div>
                </div>
              )}

              {/* Aperçu tableau */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left">Section</th>
                      <th className="px-3 py-2 text-left">UE</th>
                      <th className="px-3 py-2 text-center">Gr.</th>
                      <th className="px-3 py-2 text-left">Prof principal</th>
                      <th className="px-3 py-2 text-right">Heures</th>
                      <th className="px-3 py-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(preview?.groupes || []).slice(0, 50).map((g, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-medium text-iip-mauve">{g.section || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600">UE {g.ue_num} <span className="text-gray-400">{g.ue_nom?.slice(0,30)}</span></td>
                        <td className="px-3 py-1.5 text-center font-bold">{g.nom}</td>
                        <td className="px-3 py-1.5 text-gray-600">{g.professeur_id ? `#${g.professeur_id}` : <span className="text-gray-300 italic">multi-profs</span>}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-gray-800">{g.heures_attribuees}h</td>
                        <td className="px-3 py-1.5 text-gray-400 italic">{g.notes || ''}</td>
                      </tr>
                    ))}
                    {(preview?.groupes?.length || 0) > 50 && (
                      <tr><td colSpan={6} className="px-3 py-2 text-center text-gray-400 italic">… et {preview.groupes.length - 50} autres</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">⚠ Le nombre d'étudiants n'est pas dans les attributions — il restera à 0 et devra être saisi par le secrétariat.</p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          {result ? (
            <button onClick={() => { onImported(); onClose(); }}
              className="bg-iip-gold text-white text-sm px-5 py-2 rounded hover:bg-iip-amber">
              Voir la grille
            </button>
          ) : (
            <>
              <button onClick={onClose} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded">Annuler</button>
              <button onClick={lancer} disabled={importing || loading || !preview?.groupes?.length}
                className="bg-iip-gold text-white text-sm px-5 py-2 rounded hover:bg-iip-amber disabled:opacity-40">
                {importing ? 'Import en cours…' : `Importer ${preview?.groupes?.length || 0} groupes`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


export default function Planification() {
  const annee = getAnnee();
  const [grille, setGrille]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [sections, setSections]     = useState([]);
  const [filtreSection, setFiltreSection] = useState('');
  const [profs, setProfs]           = useState([]);
  const [modalGroupe, setModalGroupe] = useState(null); // { ue_num, ue_nom, initial? }
  const [showCalendrier, setShowCalendrier] = useState(false);
  const [showImport, setShowImport]         = useState(false);
  const [pendingCells, setPendingCells] = useState({}); // { groupeId_semaineId: heures }
  const [saving, setSaving]         = useState(false);
  const saveTimerRef                = useRef(null);

  useEffect(() => {
    charger();
    authFetch('/api/ref/sections').then(d => setSections(Array.isArray(d) ? d : [])).catch(() => {});
    authFetch('/api/ref/professeurs').then(d => setProfs(Array.isArray(d) ? d : [])).catch(() => {});
  }, [annee, filtreSection]);

  async function charger() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ annee });
      if (filtreSection) params.set('section', filtreSection);
      const d = await authFetch(`/api/planification/grille?${params}`);
      setGrille(d);
      setPendingCells({});
    } finally { setLoading(false); }
  }

  // Regrouper les groupes par section
  const parSection = {};
  if (grille) {
    for (const g of grille.groupes) {
      const s = g.section || '(Sans section)';
      if (!parSection[s]) parSection[s] = [];
      parSection[s].push(g);
    }
  }

  // Cellules fusionnées : grille DB + modifications locales non encore sauvegardées
  const cellulesEffectives = grille
    ? { ...grille.cellules, ...pendingCells }
    : {};

  function handleCellChange(groupeId, semaineId, heures) {
    const key = `${groupeId}_${semaineId}`;
    setPendingCells(prev => ({ ...prev, [key]: heures }));
    // Auto-save après 800ms d'inactivité
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => sauvegarderPending({ ...pendingCells, [key]: heures }), 800);
  }

  async function sauvegarderPending(cells) {
    const cellules = Object.entries(cells).map(([k, heures]) => {
      const [groupe_id, semaine_id] = k.split('_').map(Number);
      return { groupe_id, semaine_id, heures };
    }).filter(c => c.groupe_id && c.semaine_id);
    if (!cellules.length) return;
    setSaving(true);
    try {
      await authFetch('/api/planification/cellules-bulk', { method: 'PUT', body: JSON.stringify({ cellules }) });
      setPendingCells({});
    } finally { setSaving(false); }
  }

  const semaines = grille?.semaines || [];

  // Totaux globaux
  const totalPEP = grille?.groupes?.reduce((s, g) => {
    const h = semaines.reduce((ss, sem) => ss + (cellulesEffectives[`${g.id}_${sem.id}`] || 0), 0);
    return s + h * g.nb_etudiants * 1.2;
  }, 0) || 0;
  const totalH = grille?.groupes?.reduce((s, g) =>
    s + semaines.reduce((ss, sem) => ss + (cellulesEffectives[`${g.id}_${sem.id}`] || 0), 0), 0) || 0;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Barre d'outils */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 flex-wrap">
        <h1 className="font-title text-iip-mauve font-bold text-base">Planification horaire</h1>
        <span className="text-xs text-gray-400">{annee}</span>

        {/* Filtre section */}
        <select value={filtreSection} onChange={e => setFiltreSection(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm bg-white ml-2">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
        </select>

        <div className="flex-1" />

        {/* Légende types */}
        <div className="flex gap-2 items-center">
          {Object.entries(TYPE_STYLE).map(([k, v]) => (
            <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded ${v.header} ${v.text} font-medium`}>{v.label}</span>
          ))}
        </div>

        <button onClick={() => setShowImport(true)}
          className="bg-iip-gold text-white text-xs px-3 py-1.5 rounded hover:bg-iip-amber">
          ⬇ Importer les attributions
        </button>
        <button onClick={() => setShowCalendrier(true)}
          className="border border-gray-300 text-gray-600 text-xs px-3 py-1.5 rounded hover:bg-gray-50">
          📅 Calendrier
        </button>

        {/* Indicateur sauvegarde */}
        {saving && <span className="text-xs text-iip-gold animate-pulse">💾 Sauvegarde…</span>}
        {!saving && Object.keys(pendingCells).length === 0 && grille && (
          <span className="text-xs text-green-500">✓ À jour</span>
        )}
      </div>

      {/* Bandeau synthèse */}
      {grille && (
        <div className="flex-shrink-0 flex gap-6 px-4 py-2 bg-iip-gold/5 border-b border-iip-gold/20 text-sm">
          <div>
            <span className="text-xs text-gray-500">Heures planifiées</span>
            <span className="ml-2 font-semibold text-gray-800">{Math.round(totalH * 10) / 10} h</span>
          </div>
          <div>
            <span className="text-xs text-gray-500">PEP générées</span>
            <span className="ml-2 font-semibold text-blue-700">{Math.round(totalPEP)}</span>
            <span className="ml-1 text-xs text-gray-400">périodes élèves</span>
          </div>
          <div>
            <span className="text-xs text-gray-500">Groupes</span>
            <span className="ml-2 font-semibold text-gray-800">{grille.groupes?.length || 0}</span>
          </div>
        </div>
      )}

      {/* Grille */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Chargement de la grille…</div>
        ) : !grille || semaines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <p className="text-3xl">📅</p>
            <p className="font-medium">Aucune donnée pour {annee}</p>
          </div>
        ) : (
          <table className="border-collapse text-xs" style={{ minWidth: `${220 + semaines.length * 40 + 80}px` }}>
            <thead className="sticky top-0 z-20">
              {/* Ligne mois */}
              <tr>
                <th className="sticky left-0 z-30 bg-white border border-gray-300 w-[200px]"></th>
                <th className="sticky left-[200px] z-30 bg-white border border-gray-300 w-20 text-center text-[10px] text-gray-400">Total</th>
                {semaines.map((sem, i) => {
                  const style = TYPE_STYLE[sem.type] || TYPE_STYLE.cours;
                  const mois = new Date(sem.date_debut + 'T12:00:00').toLocaleDateString('fr-BE', { month: 'short' });
                  // Afficher le label mois seulement quand il change
                  const prevMois = i > 0 ? new Date(semaines[i-1].date_debut + 'T12:00:00').toLocaleDateString('fr-BE', { month: 'short' }) : null;
                  return (
                    <th key={sem.id}
                      className={`border border-gray-200 text-center w-10 text-[10px] font-medium ${style.header} ${style.text}`}
                      title={`S${sem.semaine_num} · ${fmtDate(sem.date_debut)}–${fmtDate(sem.date_fin)}${sem.label ? ' · ' + sem.label : ''}`}>
                      {mois !== prevMois ? mois : ''}
                    </th>
                  );
                })}
                <th className="border border-gray-300 bg-blue-50 text-blue-700 text-[10px] w-16 text-center">PEP</th>
              </tr>
              {/* Ligne numéros de semaines */}
              <tr>
                <th className="sticky left-0 z-30 bg-gray-50 border border-gray-300 text-left px-2 text-[10px] text-gray-500">Attribution</th>
                <th className="sticky left-[200px] z-30 bg-gray-50 border border-gray-300 text-center text-[10px] text-gray-500">H planif.</th>
                {semaines.map(sem => {
                  const style = TYPE_STYLE[sem.type] || TYPE_STYLE.cours;
                  return (
                    <th key={sem.id}
                      className={`border border-gray-200 text-center w-10 text-[10px] font-mono ${style.header} ${style.text}`}
                      title={`${fmtDate(sem.date_debut)}–${fmtDate(sem.date_fin)}`}>
                      {sem.semaine_num}
                    </th>
                  );
                })}
                <th className="border border-gray-300 bg-blue-50 text-blue-600 text-[10px] w-16 text-center">total</th>
              </tr>
              {/* Ligne dates */}
              <tr>
                <th className="sticky left-0 z-30 bg-white border border-gray-300"></th>
                <th className="sticky left-[200px] z-30 bg-white border border-gray-300"></th>
                {semaines.map(sem => {
                  const style = TYPE_STYLE[sem.type] || TYPE_STYLE.cours;
                  return (
                    <th key={sem.id} className={`border border-gray-200 text-center w-10 text-[9px] ${style.bg} text-gray-400 font-normal`}>
                      {fmtDate(sem.date_debut)}
                    </th>
                  );
                })}
                <th className="border border-gray-300 bg-blue-50 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(parSection).length === 0 ? (
                <tr>
                  <td colSpan={semaines.length + 3} className="text-center py-16 text-gray-400">
                    <p className="text-2xl mb-2">➕</p>
                    <p>Aucun groupe configuré pour {annee}.</p>
                    <button onClick={() => setShowImport(true)}
                      className="mt-3 bg-iip-gold text-white text-sm px-5 py-2 rounded hover:bg-iip-amber">
                      ⬇ Importer depuis les attributions
                    </button>
                  </td>
                </tr>
              ) : (
                Object.entries(parSection).sort(([a], [b]) => a.localeCompare(b)).map(([sec, grps]) => (
                  <BlocSection key={sec} section={sec} groupes={grps} semaines={semaines}
                    cellules={cellulesEffectives}
                    onCellChange={handleCellChange}
                    onEditGroupe={g => setModalGroupe({ ue_num: g.ue_num, ue_nom: g.ue_nom, initial: g })}
                    onAddGroupe={(ue_num, ue_nom) => setModalGroupe({ ue_num, ue_nom, initial: { section: sec } })}
                  />
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {modalGroupe && (
        <ModalGroupe
          ue_num={modalGroupe.ue_num} ue_nom={modalGroupe.ue_nom}
          initial={modalGroupe.initial} annee={annee} profs={profs}
          onSave={() => { setModalGroupe(null); charger(); }}
          onClose={() => setModalGroupe(null)}
        />
      )}
      {showImport && (
        <ModalImport annee={annee} onImported={charger} onClose={() => setShowImport(false)} />
      )}
      {showCalendrier && (
        <PanelCalendrier semaines={semaines} onUpdate={charger} onClose={() => setShowCalendrier(false)} />
      )}
    </div>
  );
}

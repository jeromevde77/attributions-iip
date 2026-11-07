import { useState, useEffect, useRef } from 'react';
import { nomPropre } from '../lib/nom.js';
import { getAnnee } from '../lib/api.js';
import { IconCalendarStats, IconPencil, IconChevronDown, IconChevronRight, IconX, IconDeviceFloppy, IconTrash, IconPlus, IconHash, IconCalendar, IconSitemap, IconBook, IconAlertTriangle, IconDownload, IconSparkles, IconCircleCheck, IconBox } from '@tabler/icons-react';
import PlanificateurVisuel from '../components/PlanificateurVisuel.jsx';
import { Fenetre, PastilleEtat, TuileEtat, Encadre, Tableau } from '../components/ui.jsx';
import { informer } from '../lib/dialogue.jsx';

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
  ferie:    { header: 'bg-iip-turquoise/10',   text: 'text-iip-blue' },
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
      <td className="border border-slate-200 text-center text-xs w-10 h-8 text-slate-300 select-none" style={{ background: 'rgb(var(--gris-100))' }}>—</td>
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
          className="w-9 h-7 text-center text-xs border-0 bg-white outline outline-2 outline-iip-blue rounded p-0"
          autoFocus
        />
      ) : (
        <span className={special ? `font-bold text-mention ${special.text}` : 'text-gray-800 text-xs'}>
          {display || <span className="text-gray-200">·</span>}
        </span>
      )}
      {warning && <IconAlertTriangle size={10} className="absolute top-0 right-0 text-red-500" />}
    </td>
  );
}

// ─── Ligne groupe (aplatie, sans niveau UE) ───────────────────────────────────
function LigneGroupe({ groupe, semaines, cellules, onCellChange, onEditGroupe, warnings, nivBorderColor }) {
  const hPlanif = semaines.reduce((s, sem) => {
    return s + cellHeures(cellules[`${groupe.id}_${sem.id}`]);
  }, 0);
  const pct  = groupe.heures_attribuees > 0 ? Math.round(hPlanif / groupe.heures_attribuees * 100) : 0;
  const over  = hPlanif > groupe.heures_attribuees + 0.01;
  const done  = !over && hPlanif >= groupe.heures_attribuees - 0.01 && groupe.heures_attribuees > 0;
  const warnSet = new Set((warnings || []).map(w => w.semaineId));

  return (
    <tr className="ligne-maison group">
      {/* Nom : badge UE + nom UE + groupe + prof */}
      <td className="sticky left-0 z-10 bg-white border border-gray-200 px-2 py-1 min-w-[260px] max-w-[260px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <PastilleEtat etat="neutre">UE {groupe.ue_num}</PastilleEtat>
          {groupe.ue_niv && (
            <PastilleEtat etat="neutre">{groupe.ue_niv}</PastilleEtat>
          )}
          {groupe.ue_quad && (
            <PastilleEtat etat="neutre">
              {String(groupe.ue_quad).replace(/\s/g,'').toUpperCase() === 'Q1Q2' ? 'Q1/Q2' : groupe.ue_quad}
            </PastilleEtat>
          )}
          <span className="text-xs text-gray-600 truncate max-w-[120px]"
            title={groupe.cours_nom || groupe.ue_nom}>
            {groupe.cours_nom || groupe.ue_nom || `UE ${groupe.ue_num}`}
          </span>
          {groupe.activite_nom && (
            <PastilleEtat etat="neutre">{groupe.activite_nom}</PastilleEtat>
          )}
          <span className="text-mention text-gray-400">· Gr.{groupe.nom}</span>
          {groupe.prof_nom && (
            <span className="text-mention text-gray-500 ml-auto">
              {groupe.prof_nom} {groupe.prof_prenom?.[0] || ''}.
            </span>
          )}
          <button onClick={() => onEditGroupe(groupe)}
            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-iip-blue text-xs transition ml-1"><IconPencil size={13} /></button>
        </div>
      </td>
      {/* Total — bordure colorée à gauche = repère visuel du niveau */}
      <td className={`sticky left-[260px] z-10 border border-slate-200 text-center text-xs w-24 font-mono bg-white
        ${over ? 'text-red-700' : done ? 'text-emerald-700' : 'text-slate-500'}`}
        style={nivBorderColor ? { borderLeft: `3px solid ${nivBorderColor}` } : {}}>
        <div className="font-semibold text-xs">{Math.round(hPlanif * 10) / 10}h</div>
        <div className="text-mention opacity-70">/{groupe.heures_attribuees}h · {pct}%</div>
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
      <td className="border border-gray-200 text-center text-mention w-14 bg-iip-turquoise/5 text-iip-blue font-mono">
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
      <tr className="tab-repere cursor-pointer select-none" onClick={() => setOpen(v => !v)}>
        <td colSpan={2} className="sticky left-0 z-10 border border-slate-300 px-3 py-2 bande-entete">
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm text-iip-blue">{open ? <IconChevronDown size={14} className="inline align-[-2px]" /> : <IconChevronRight size={14} className="inline align-[-2px]" />} {section}</span>
            <span className="text-xs text-gray-500">{groupes.length} groupe{groupes.length > 1 ? 's' : ''}</span>
            {totalWarnings > 0 && (
              <PastilleEtat etat="corriger"><IconAlertTriangle size={11} /> {totalWarnings} alerte{totalWarnings > 1 ? 's' : ''}</PastilleEtat>
            )}
            <span className={`ml-auto text-xs font-semibold ${pct >= 100 ? 'text-green-600' : 'text-gray-500'}`}>
              {Math.round(hPlanif * 10) / 10}h / {Math.round(hAttrib * 10) / 10}h ({pct}%)
            </span>
          </div>
        </td>
        {semaines.map(sem => {
          const hSem = groupes.reduce((s, g) => s + cellHeures(cellules[`${g.id}_${sem.id}`]), 0);
          return (
            <td key={sem.id} className={`border border-gray-200 text-center text-mention w-10
              ${TYPE_STYLE[sem.type]?.header || 'bg-gray-50'}
              ${hSem > 0 ? 'text-iip-blue font-semibold' : 'text-transparent'}`}
              style={{ backgroundColor: hSem > 0 ? 'rgb(var(--gris-100))' : undefined }}>
              {hSem > 0 ? hSem : '·'}
            </td>
          );
        })}
        <td className="border border-gray-200 text-center text-mention w-14 bg-iip-turquoise/5 text-iip-blue font-bold">
          {Math.round(pepTotal)}
        </td>
      </tr>
      {open && (() => {
        // Grouper par niveau, dans l'ordre reçu du backend
        const niveaux = [];
        const parNiv = {};
        for (const g of groupes) {
          const niv = g.ue_niv || 'Autre';
          if (!parNiv[niv]) { parNiv[niv] = []; niveaux.push(niv); }
          parNiv[niv].push(g);
        }
        const niveauxTries = triNiveaux(niveaux);

        return niveauxTries.flatMap((niv, nivIdx) => {
          const grpsNiv = parNiv[niv];
          const col = getNivColor(niv, niveauxTries);
          const borderColor = col.border;

          const lignes = grpsNiv.map(g => (
            <LigneGroupe key={g.id} groupe={g} semaines={semaines} cellules={cellules}
              onCellChange={onCellChange} onEditGroupe={onEditGroupe}
              warnings={warningsParGroupe[g.id]}
              nivBorderColor={borderColor} />
          ));

          // Ligne de total du niveau
          const ligneTotal = (
            <tr key={`total-${niv}`} className="select-none">
              <td colSpan={2} className="sticky left-0 z-10 border border-gray-200 px-3 py-1 text-mention font-semibold"
                style={{ backgroundColor: col.hex || 'rgb(var(--gris-50))', borderLeft: `3px solid ${borderColor}` }}>
                <span style={{ color: borderColor }}>Σ {niv}</span>
                <span className="ml-2 font-normal text-gray-400">
                  {Math.round(grpsNiv.reduce((s,g) => s + semaines.reduce((ss,sem) => ss + cellHeures(cellules[`${g.id}_${sem.id}`]), 0), 0) * 10) / 10}h planifiées
                </span>
              </td>
              {semaines.map(sem => {
                const hSem = grpsNiv.reduce((s, g) => s + cellHeures(cellules[`${g.id}_${sem.id}`]), 0);
                return (
                  <td key={sem.id} className="border border-gray-200 text-center text-mention w-10"
                    style={{ backgroundColor: col.hex || 'rgb(var(--gris-50))', color: hSem > 0 ? borderColor : 'transparent', fontWeight: hSem > 0 ? 600 : 400 }}>
                    {hSem > 0 ? arrondir(hSem) : '·'}
                  </td>
                );
              })}
              <td className="border border-slate-200 w-14" style={{ backgroundColor: col.hex || 'rgb(var(--gris-50))' }} />
            </tr>
          );

          return [...lignes, ligneTotal];
        });
      })()}
      {open && (
        <tr>
          <td colSpan={semaines.length + 3} className="border border-slate-100 px-3 py-1">
            <button onClick={() => onAddGroupe(null, null, section)}
              className="text-xs text-slate-400 hover:text-iip-blue transition">+ Ajouter un groupe dans {section}</button>
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
    <Fenetre icone={IconPencil} titre={initial?.id ? 'Modifier le groupe' : 'Nouveau groupe'} large="petite" onFermer={onClose}
      pied={<>
        <span />
        <button onClick={onClose} className="bouton">Annuler</button>
        <button onClick={sauvegarder} disabled={!nom || !ueNum || saving}
          className="bouton bouton-fort">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </>}>
        <div className="grid grid-cols-2 gap-3">
          {!initial?.id && (
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">UE *</label>
              <select value={ueNum} onChange={e => setUeNum(e.target.value)}
                className="controle w-full">
                <option value="">— Choisir une UE —</option>
                {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Groupe *</label>
            <input value={nom} onChange={e => setNom(e.target.value)} placeholder="A, B, 1…"
              className="controle w-full" autoFocus />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Nb étudiants</label>
            <input type="number" value={nbEtu} onChange={e => setNbEtu(e.target.value)} min="0"
              className="controle w-full" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Professeur</label>
            <select value={profId} onChange={e => setProfId(e.target.value)}
              className="controle w-full">
              <option value="">— Aucun / À définir —</option>
              {profs.map(p => <option key={p.id} value={p.id}>{nomPropre(p.nom, p.prenom)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Heures attribuées (60 min)</label>
            <input type="number" step="0.5" value={heures} onChange={e => setHeures(e.target.value)} min="0"
              className="controle w-full" />
            {heures > 0 && <p className="text-mention text-gray-400 mt-0.5">= {hToPer(Number(heures))} périodes de 50 min</p>}
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="controle w-full" />
          </div>
        </div>
    </Fenetre>
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
    <Fenetre icone={IconCalendar} titre="Calendrier — ajuster les semaines" large="moyenne" hauteurFixe onFermer={onClose}
      pied={<>
        <span />
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())} className="bouton">Tout désélectionner</button>
        )}
        <button onClick={appliquer} disabled={!selected.size || saving}
          className="bouton bouton-fort">
          Appliquer à {selected.size} sem.
        </button>
      </>}>
        <div className="pb-4 mb-4 border-b border-slate-200 space-y-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="controle">
                {TYPES.map(t => <option key={t.k} value={t.k}>{t.l}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Label (optionnel)</label>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder="ex. Vacances Noël"
                className="controle w-full" />
            </div>
          </div>
        </div>
        <div>
          <div className="grid grid-cols-5 gap-1.5">
            {semaines.map(sem => {
              const style = TYPE_STYLE[sem.type] || TYPE_STYLE.cours;
              const isSel = selected.has(sem.id);
              return (
                <button key={sem.id} onClick={() => setSelected(prev => { const n = new Set(prev); n.has(sem.id) ? n.delete(sem.id) : n.add(sem.id); return n; })}
                  className={`text-left p-2 rounded border-2 transition text-xs
                    ${isSel ? 'border-iip-blue' : 'border-slate-200 hover:border-slate-400'}
                    ${style.header}`}>
                  <div className={`font-semibold ${style.text}`}>S{sem.semaine_num}</div>
                  <div className="text-slate-500 text-mention">{fmtDate(sem.date_debut)}</div>
                  {sem.label && <div className={`text-mention mt-0.5 ${style.text}`}>{sem.label}</div>}
                </button>
              );
            })}
          </div>
        </div>
    </Fenetre>
  );
}

// ─── Modal import ─────────────────────────────────────────────────────────────
function ModalImport({ annee, onImported, onClose }) {
  const [preview, setPreview]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [mode, setMode]           = useState('replace');
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
    <Fenetre titre={`Import depuis les attributions — ${annee}`} large="moyenne" onFermer={onClose}
      pied={<>
        <span />
        {result ? (
          <button onClick={() => { onImported(); onClose(); }} className="bouton bouton-fort">Voir la grille</button>
        ) : (
          <>
            <button onClick={onClose} className="bouton">Annuler</button>
            <button onClick={lancer} disabled={importing || loading || !preview?.groupes?.length}
              className="bouton bouton-fort">
              {importing ? 'Import…' : `Importer ${preview?.groupes?.length || 0} groupes`}
            </button>
          </>
        )}
      </>}>
        <div className="space-y-4">
          {loading ? (
            <div className="text-center text-slate-400 py-8">Analyse des attributions…</div>
          ) : result ? (
            <div className="text-center space-y-3 py-8">
              <IconCircleCheck size={40} className="mx-auto" style={{ color: 'var(--c-reussi)' }} />
              <p className="font-semibold text-slate-800">Import terminé</p>
              <div className="flex justify-center gap-3 text-sm">
                <TuileEtat etat="reussi" valeur={result.created} libelle="groupes créés" />
                <TuileEtat etat="neutre" valeur={result.skipped} libelle="déjà existants" />
              </div>
              <p className="text-xs text-slate-400">Le nombre d'étudiants reste à 0 — à compléter via le crayon de chaque ligne.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <TuileEtat etat="neutre" valeur={preview?.groupes?.length || 0} libelle="groupes à importer" />
                {preview?.existants > 0 && (
                  <TuileEtat etat="surveiller" valeur={preview.existants} libelle="déjà en base" />
                )}
              </div>
              {preview?.existants > 0 && (
                <div data-etat="surveiller" className="bloc-etat p-3 space-y-2">
                  <p className="text-xs font-medium text-iip-texte">Des groupes existent déjà. Comment procéder ?</p>
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
              <div className="max-h-64 overflow-y-auto">
                <Tableau dense>
                  <thead className="sticky top-0">
                    <tr className="tab-entete">
                      <th className="px-3 py-2 text-left">Section</th>
                      <th className="px-3 py-2 text-left">UE</th>
                      <th className="px-3 py-2 text-left">Cours</th>
                      <th className="px-3 py-2 text-center">Gr.</th>
                      <th className="px-3 py-2 text-right">Heures</th>
                      <th className="px-3 py-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview?.groupes || []).map((g, i) => (
                      <tr key={i} className="ligne-maison">
                        <td className="px-3 py-1.5 h-9 font-medium text-iip-blue">{g.section || '—'}</td>
                        <td className="px-3 py-1.5 h-9 text-gray-600">UE {g.ue_num} <span className="text-gray-400">{g.ue_nom?.slice(0,20)}</span></td>
                        <td className="px-3 py-1.5 h-9 text-gray-500 text-mention">{g.code_cours || '—'}</td>
                        <td className="px-3 py-1.5 h-9 text-center font-bold">{g.nom}</td>
                        <td className="px-3 py-1.5 h-9 text-right font-mono">{g.heures_attribuees}h</td>
                        <td className="px-3 py-1.5 h-9 text-gray-400 italic">{g.notes || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tableau>
              </div>
              <p className="text-xs text-slate-400">Le nombre d'étudiants restera à 0 — à compléter via le crayon.</p>
            </>
          )}
        </div>
    </Fenetre>
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
    <Fenetre icone={IconSparkles} titre={`Planification IA — ${section}`} sous={annee} large="moyenne" onFermer={onClose}
      pied={(step === 'config' || step === 'preview') ? (<>
        <span />
        {step === 'config' && (
          <>
            <button onClick={onClose} className="bouton">Annuler</button>
            <button onClick={genererPreview} disabled={loading}
              className="bouton bouton-fort">
              {loading ? 'Analyse en cours…' : 'Générer un aperçu →'}
            </button>
          </>
        )}
        {step === 'preview' && (
          <>
            <button onClick={() => setStep('config')} className="bouton">← Retour</button>
            <button onClick={appliquer}
              className="bouton bouton-fort">
              Appliquer en brouillon
            </button>
          </>
        )}
      </>) : null}>
        <div className="space-y-4">

          {/* Step : config */}
          {step === 'config' && (
            <>
              <div className="carte p-4 text-sm text-slate-700 space-y-2">
                <p className="font-medium text-iip-blue">Ce que Lucie IA va faire :</p>
                <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                  <li>Respecter l'ordre des prérequis UE (organigramme)</li>
                  <li>Distribuer les heures uniformément selon le quadrimestre de chaque UE</li>
                  <li>Placer EV1, VC et EV2 automatiquement aux bonnes semaines</li>
                  <li>Appliquer le pattern d'alternance de chaque groupe</li>
                </ul>
              </div>

              <label className="carte flex items-center gap-3 cursor-pointer p-3">
                <input type="checkbox" checked={preserverManuel} onChange={e => setPreserver(e.target.checked)}
                  className="w-4 h-4 accent-iip-blue" />
                <div>
                  <p className="text-sm font-medium text-slate-700">Préserver mes saisies manuelles</p>
                  <p className="text-xs text-slate-400">Les cellules que tu as saisies toi-même ne seront pas écrasées</p>
                </div>
              </label>

              {error && <p className="bloc-etat etat-corriger text-sm text-red-600 p-3">{error}</p>}
            </>
          )}

          {/* Step : preview */}
          {step === 'preview' && preview && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <TuileEtat etat="neutre" valeur={preview.meta.groupes_traites} libelle="groupes planifiés" />
                <TuileEtat etat="neutre" valeur={nbCellules} libelle="cellules à créer" />
                <TuileEtat etat={preview.alertes.length ? 'corriger' : 'reussi'} valeur={preview.alertes.length} libelle="alertes" />
              </div>

              {/* Ordre des UE */}
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Ordre de planification (prérequis respectés)</p>
                <div className="flex flex-wrap gap-1">
                  {preview.meta.ue_ordre.map((n, i) => (
                    <PastilleEtat key={n} etat="neutre">{i+1}. UE{n}</PastilleEtat>
                  ))}
                </div>
              </div>

              {/* Note évaluations */}
              <Encadre etat="disponible" icone={IconCalendar}>
                EV1, VC et EV2 sont placés automatiquement après les derniers cours de chaque groupe
              </Encadre>

              {/* Alertes */}
              {preview.alertes.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-600 flex items-center gap-1"><IconAlertTriangle size={13} style={{ color: 'var(--c-refuse)' }} /> Alertes ({preview.alertes.length})</p>
                  {preview.alertes.map((a, i) => (
                    <div key={i} data-etat="corriger" className="bloc-etat text-xs p-2 text-slate-800">{a.msg}</div>
                  ))}
                </div>
              )}

              {error && <p className="bloc-etat etat-corriger text-sm text-red-600 p-3">{error}</p>}
            </>
          )}

          {/* Step : applying */}
          {step === 'applying' && (
            <div className="text-center py-8 space-y-3">
              <IconSparkles size={32} className="mx-auto animate-pulse text-iip-blue" />
              <p className="font-medium text-slate-700">Application en cours…</p>
            </div>
          )}

          {/* Step : done */}
          {step === 'done' && (
            <div className="text-center py-8 space-y-3">
              <IconCircleCheck size={32} className="mx-auto" style={{ color: 'var(--c-reussi)' }} />
              <p className="font-medium text-slate-700">Planification appliquée !</p>
              <p className="text-xs text-slate-400">La grille s'actualise…</p>
            </div>
          )}
        </div>
    </Fenetre>
  );
}

// ─── Modal séquenceur ─────────────────────────────────────────────────────────
// ─── Modal séquenceur (2 onglets) ────────────────────────────────────────────
function ModalSequence({ annee, section, groupes, onClose }) {
  const [onglet, setOnglet] = useState('prereqs'); // 'prereqs' | 'cours'

  return (
    <Fenetre icone={IconHash} titre={`Séquencer — ${section}`} sous={annee} large="pleine" hauteurFixe onFermer={onClose}>
      {/* Les deux onglets gèrent leur propre défilement (panneaux côte à côte) :
          ce cadre leur donne la hauteur utile de la fenêtre, sous son en-tête. */}
      <div className="-mx-5 -my-4 flex flex-col" style={{ height: 'calc(88vh - 4.25rem)' }}>
        {/* Onglets */}
        <div className="flex gap-4 border-b border-slate-200 px-6">
          <button onClick={() => setOnglet('prereqs')}
            className={`onglet-page ${onglet === 'prereqs' ? 'onglet-page-actif' : ''}`}>
            <IconSitemap size={14} className="inline align-[-2px] mr-1" />Structure des UE
          </button>
          <button onClick={() => setOnglet('cours')}
            className={`onglet-page ${onglet === 'cours' ? 'onglet-page-actif' : ''}`}>
            <IconBook size={14} className="inline align-[-2px] mr-1" />Séquencer les cours
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {onglet === 'prereqs' && <StructureUE annee={annee} section={section} groupes={groupes} />}
          {onglet === 'cours'   && <SeqCours    annee={annee} section={section} groupes={groupes} />}
        </div>
      </div>
    </Fenetre>
  );
}

// ─── Onglet Structure UE (grille niveau × quadrimestre) ──────────────────────
// Trie les niveaux par leur chiffre final (BA1<BA2, S4<S5<S6, BE1<BE2...)
function triNiveaux(niveaux) {
  return [...niveaux].sort((a, b) => {
    const na = parseInt(a.match(/\d+$/)?.[0] ?? '99');
    const nb = parseInt(b.match(/\d+$/)?.[0] ?? '99');
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

// Couleur selon la position dans la liste des niveaux (0=premier, 1=second, ...)
const NIV_COLORS = [
  // rang 1 = orange, rang 2 = bleu clair, rang 3 = bleu marine
  { bg: 'bg-orange-100', text: 'text-orange-700', border: 'var(--c-attente)', hex: 'rgb(var(--e-attente-100))' },
  { bg: 'bg-iip-turquoise/10',   text: 'text-iip-blue',   border: 'var(--c-disponible)', hex: 'rgb(var(--e-disponible-100))' },
  { bg: 'bg-iip-blue',   text: 'text-iip-blue',   border: 'var(--c-texte)', hex: 'var(--c-texte)' },
  { bg: 'bg-purple-100', text: 'text-purple-700', border: 'var(--c-faveur)', hex: 'rgb(var(--e-faveur-100))' },
  { bg: 'bg-pink-100',   text: 'text-pink-700',   border: 'var(--c-helb)', hex: 'rgb(var(--e-helb-50, var(--gris-50)))' },
];
function getNivColor(niv, niveauxListe) {
  const idx = niveauxListe.indexOf(niv);
  return NIV_COLORS[Math.max(0, idx) % NIV_COLORS.length];
}

const QUADS = [
  { key: 'Q1',    label: 'Q1' },
  { key: 'Q1/Q2', label: 'Q1 / Q2 (annuel)' },
  { key: 'Q2',    label: 'Q2' },
];

// Normalise toutes les variantes de quadrimestre vers le format DB : Q1 | Q1/Q2 | Q2
function normQuad(q) {
  if (!q) return 'Q1/Q2';
  const s = String(q).toUpperCase().replace(/\s/g, '');
  if (s === 'Q1') return 'Q1';
  if (s === 'Q2') return 'Q2';
  // Q1Q2, Q1/Q2, Q1-Q2, ANNUEL... → annuel
  return 'Q1/Q2';
}

function StructureUE({ annee, section, groupes }) {
  const [ues, setUes]           = useState([]);
  const [prereqs, setPrereqs]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving]     = useState(null); // ue_num en cours de sauvegarde
  const dragRef = useRef(null);
  const [dragOverCell, setDragOverCell] = useState(null); // 'niv|quad'

  function chargerUes() {
    return authFetch(`/api/ref/ue?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`)
      .then(d => {
        const arr = Array.isArray(d) ? d : [];
        // garder uniquement les UE présentes dans les groupes (celles de la planif)
        setUes(arr.map(u => ({
          ue_num: u.ue_num, ue_nom: u.ue_nom,
          ue_niv: u.ue_niv || 'Autre',
          ue_quad: normQuad(u.ue_quad),
        })));
      });
  }

  useEffect(() => {
    chargerUes();
    authFetch(`/api/prerequis/ue?section=${encodeURIComponent(section)}`)
      .then(d => setPrereqs(Array.isArray(d) ? d : []));
  }, [section, annee]);

  function getPrereqsOf(ue_num) { return prereqs.filter(p => p.ue_num === ue_num).map(p => p.prerequis_num); }
  function getDependantsOf(ue_num) { return prereqs.filter(p => p.prerequis_num === ue_num).map(p => p.ue_num); }

  async function togglePrereq(ue_num, pre_num) {
    const existing = prereqs.find(p => p.ue_num === ue_num && p.prerequis_num === pre_num);
    if (existing) {
      await authFetch(`/api/prerequis/ue/${existing.id}`, { method: 'DELETE' });
      setPrereqs(prev => prev.filter(p => p.id !== existing.id));
    } else {
      const r = await authFetch('/api/prerequis/ue', { method: 'POST', body: JSON.stringify({ ue_num, prerequis_num: pre_num, section }) });
      if (r.ok) {
        const d = await authFetch(`/api/prerequis/ue?section=${encodeURIComponent(section)}`);
        setPrereqs(Array.isArray(d) ? d : []);
      }
    }
  }

  // Déplacer une UE vers une cellule (niveau, quad) → écrit en base
  async function deplacerUE(ue_num, niv, quad) {
    const ue = ues.find(u => u.ue_num === ue_num);
    if (!ue) return;
    if (ue.ue_niv === niv && ue.ue_quad === quad) return;
    // MAJ optimiste
    setUes(prev => prev.map(u => u.ue_num === ue_num ? { ...u, ue_niv: niv, ue_quad: quad } : u));
    setSaving(ue_num);
    try {
      await authFetch(`/api/ref/ue/${ue_num}`, {
        method: 'PATCH',
        body: JSON.stringify({ annee_scolaire: annee, ue_niv: niv === 'Autre' ? null : niv, ue_quad: quad }),
      });
    } catch(e) { informer('Erreur : ' + e.message); chargerUes(); }
    finally { setSaving(null); }
  }

  function onDragStart(ue_num) { dragRef.current = ue_num; }
  function onDropCell(niv, quad) {
    const ue_num = dragRef.current;
    dragRef.current = null; setDragOverCell(null);
    if (ue_num != null) deplacerUE(ue_num, niv, quad);
  }

  // Niveaux présents dans la section, triés par chiffre final
  const niveauxAffiches = triNiveaux([...new Set(ues.map(u => u.ue_niv))]);
  const selUE = ues.find(u => u.ue_num === selected);

  function uesDans(niv, quad) {
    return ues.filter(u => u.ue_niv === niv && u.ue_quad === quad).sort((a,b)=>a.ue_num-b.ue_num);
  }

  function BadgeUE({ u }) {
    const isSel = selected === u.ue_num;
    const isPrereqOfSel = selected && prereqs.find(p => p.ue_num === selected && p.prerequis_num === u.ue_num);
    const isDepOfSel = selected && prereqs.find(p => p.prerequis_num === selected && p.ue_num === u.ue_num);
    const nbPre = getPrereqsOf(u.ue_num).length;
    const nbDep = getDependantsOf(u.ue_num).length;
    const col = getNivColor(u.ue_niv, niveauxAffiches);
    return (
      <div draggable
        onDragStart={() => onDragStart(u.ue_num)}
        onClick={() => setSelected(isSel ? null : u.ue_num)}
        className={`rounded-lg p-2 cursor-pointer border-2 transition select-none mb-1.5
          ${isSel ? 'border-iip-blue bg-white' :
            isPrereqOfSel ? 'border-sky-500 bg-white' :
            isDepOfSel ? 'border-amber-500 bg-white' :
            'border-slate-200 hover:border-slate-400 bg-white'}`}>
        <div className="flex items-center gap-1.5">
          <span className="text-mention font-bold text-iip-blue">UE{u.ue_num}</span>
          {saving === u.ue_num && <span className="text-mention text-gray-400"><IconDeviceFloppy size={12} className="inline" /></span>}
          {nbPre > 0 && <PastilleEtat etat="disponible">{nbPre}↑</PastilleEtat>}
          {nbDep > 0 && <PastilleEtat etat="surveiller">{nbDep}↓</PastilleEtat>}
        </div>
        <p className="text-mention text-gray-600 leading-tight mt-0.5">{u.ue_nom?.slice(0, 40)}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-auto p-4">
        <p className="text-xs text-gray-400 mb-3">
          Glisse une UE vers une cellule pour changer son <strong>niveau</strong> (ligne) ou son <strong>quadrimestre</strong> (colonne). Clique pour gérer les prérequis. Les changements sont écrits en base immédiatement.
        </p>

        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-12"></th>
              {QUADS.map(q => (
                <th key={q.key} className="text-xs font-semibold text-gray-500 px-2 py-1.5 h-9 text-center border-b-2 border-gray-200">
                  {q.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {niveauxAffiches.map(niv => (
              <tr key={niv}>
                <td className={`text-xs font-bold text-center align-top pt-2 w-12 ${getNivColor(niv, niveauxAffiches).text}`}>
                  {niv}
                </td>
                {QUADS.map(q => {
                  const cellKey = `${niv}|${q.key}`;
                  const list = uesDans(niv, q.key);
                  return (
                    <td key={q.key}
                      onDragOver={e => { e.preventDefault(); setDragOverCell(cellKey); }}
                      onDragLeave={() => setDragOverCell(null)}
                      onDrop={() => onDropCell(niv, q.key)}
                      className={`align-top p-2 border border-dashed transition min-w-[180px]
                        ${dragOverCell === cellKey ? 'border-iip-blue ligne-active' : 'border-slate-200'}`}>
                      {list.map(u => <BadgeUE key={u.ue_num} u={u} />)}
                      {list.length === 0 && <p className="text-mention text-gray-300 italic text-center py-2">—</p>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Panneau prérequis */}
      {selected && selUE && (
        <div className="w-72 border-l border-slate-200 overflow-auto p-4 flex-shrink-0">
          <div className="mb-4">
            <p className="font-semibold text-sm text-gray-800">UE {selected}</p>
            <p className="text-xs text-gray-500">{selUE.ue_nom}</p>
            <p className="text-mention text-gray-400 mt-1">{selUE.ue_niv} · {selUE.ue_quad}</p>
          </div>
          <p className="text-xs font-medium text-gray-600 mb-2">Doit être précédée par :</p>
          <div className="space-y-1.5">
            {ues.filter(u => u.ue_num !== selected).map(u => {
              const isChecked = prereqs.some(p => p.ue_num === selected && p.prerequis_num === u.ue_num);
              return (
                <label key={u.ue_num} className="flex items-start gap-2 p-2 rounded-lg hover:bg-white cursor-pointer border border-transparent hover:border-gray-200 transition">
                  <input type="checkbox" checked={isChecked} onChange={() => togglePrereq(selected, u.ue_num)} className="mt-0.5 accent-iip-blue flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">UE {u.ue_num}</p>
                    <p className="text-mention text-gray-400">{u.ue_nom?.slice(0, 35)}</p>
                  </div>
                </label>
              );
            })}
          </div>
          <button onClick={() => setSelected(null)} className="bouton mt-4 w-full justify-center">Fermer</button>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Séquencer les cours ───────────────────────────────────────────────
function SeqCours({ annee, section, groupes }) {
  // Grouper les groupes par UE
  const parUE = {};
  for (const g of groupes) {
    if (!parUE[g.ue_num]) parUE[g.ue_num] = { ue_num: g.ue_num, ue_nom: g.ue_nom, groupes: [] };
    parUE[g.ue_num].groupes.push(g);
  }
  const ues = Object.values(parUE).sort((a, b) => a.ue_num - b.ue_num);

  const [ueSelectionnee, setUeSelectionnee] = useState(ues[0]?.ue_num || null);
  const [rangs, setRangs] = useState([]);
  const [nonSequences, setNonSequences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [dragOver, setDragOver] = useState(null);
  const dragRef = useRef(null);

  const ueActuelle = ues.find(u => u.ue_num === ueSelectionnee);

  useEffect(() => {
    if (!ueSelectionnee || !ueActuelle) return;
    setLoading(true);
    authFetch(`/api/sequence?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`)
      .then(data => {
        const ueData = data.find(u => u.ue_num === ueSelectionnee);
        if (ueData) {
          const rangsArr = Object.values(ueData.rangs).sort((a, b) => a.rang - b.rang);
          setRangs(rangsArr.map(r => ({ ...r, groupe_ids: r.groupes.map(g => g.groupe_id) })));
          const sequencedIds = new Set(rangsArr.flatMap(r => r.groupes.map(g => g.groupe_id)));
          setNonSequences(ueActuelle.groupes.filter(g => !sequencedIds.has(g.id)));
        } else {
          setRangs([]);
          setNonSequences([...ueActuelle.groupes]);
        }
      }).finally(() => setLoading(false));
  }, [ueSelectionnee]);

  function getGroupe(id) { return ueActuelle?.groupes.find(g => g.id === id); }

  function ajouterRang() {
    const dernierRang = rangs.length > 0 ? rangs[rangs.length - 1].rang : -1;
    setRangs(prev => [...prev, { rang: dernierRang + 1, delai_avant: 0, groupe_ids: [] }]);
  }

  function supprimerRang(idx) {
    const ids = rangs[idx].groupe_ids;
    setNonSequences(prev => [...prev, ...ids.map(id => getGroupe(id)).filter(Boolean)]);
    setRangs(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, rang: i })));
  }

  function setDelai(idx, val) {
    setRangs(prev => prev.map((r, i) => i === idx ? { ...r, delai_avant: Number(val) || 0 } : r));
  }

  function onDragStart(groupe_id, from) { dragRef.current = { groupe_id, from }; }

  function onDrop(to) {
    if (!dragRef.current) return;
    const { groupe_id, from } = dragRef.current;
    dragRef.current = null; setDragOver(null);
    if (from === 'pool') setNonSequences(prev => prev.filter(g => g.id !== groupe_id));
    else setRangs(prev => prev.map((r, i) => i === from ? { ...r, groupe_ids: r.groupe_ids.filter(id => id !== groupe_id) } : r));
    if (to === 'pool') { const g = getGroupe(groupe_id); if (g) setNonSequences(prev => [...prev, g]); }
    else setRangs(prev => prev.map((r, i) => i === to ? { ...r, groupe_ids: [...r.groupe_ids, groupe_id] } : r));
  }

  async function sauvegarder() {
    setSaving(true);
    try {
      await authFetch('/api/sequence', {
        method: 'PUT',
        body: JSON.stringify({ section, annee_scolaire: annee, ue_num: ueSelectionnee,
          rangs: rangs.map(r => ({ rang: r.rang, delai_avant: r.delai_avant, groupe_ids: r.groupe_ids })) }),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch(e) { informer(e.message); }
    finally { setSaving(false); }
  }

  function BadgeGroupe({ groupe_id, from }) {
    const g = getGroupe(groupe_id);
    if (!g) return null;
    return (
      <div draggable onDragStart={() => onDragStart(groupe_id, from)}
        className="flex items-center gap-2 bg-white border border-slate-200 rounded-champ px-3 py-2 cursor-grab hover:border-iip-blue transition select-none">
        <span className="text-xs font-bold text-iip-blue">UE{g.ue_num}</span>
        <span className="text-xs text-gray-600 truncate max-w-[150px]" title={g.cours_nom || g.ue_nom}>
          {g.cours_nom || g.ue_nom}
        </span>
        {g.activite_nom && <PastilleEtat etat="neutre">{g.activite_nom}</PastilleEtat>}
        <span className="text-mention text-gray-400">Gr.{g.nom}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar UE */}
      <div className="w-48 border-r border-slate-200 overflow-auto flex-shrink-0">
        {ues.map(u => (
          <button key={u.ue_num} onClick={() => setUeSelectionnee(u.ue_num)}
            className={`w-full text-left px-4 py-3 text-sm border-b transition
              ${ueSelectionnee === u.ue_num ? 'ligne-active text-iip-blue font-semibold' : 'hover:bg-slate-50 text-slate-700'}`}>
            <p className="font-medium">UE {u.ue_num}</p>
            <p className="text-mention truncate text-slate-400 font-normal">{u.ue_nom}</p>
            <p className="text-mention text-slate-400 font-normal">{u.groupes.length} cours</p>
          </button>
        ))}
      </div>

      {/* Zone principale */}
      <div className="flex-1 overflow-auto p-5 space-y-4">
        {loading ? <div className="text-center text-gray-400 py-10">Chargement…</div> : (
          <>
            <div onDragOver={e => { e.preventDefault(); setDragOver('pool'); }}
              onDragLeave={() => setDragOver(null)} onDrop={() => onDrop('pool')}
              className={`rounded-carte border-2 border-dashed p-3 min-h-[60px] transition
                ${dragOver === 'pool' ? 'border-iip-blue ligne-active' : 'border-slate-200'}`}>
              <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><IconBox size={13} /> Cours non séquencés</p>
              <div className="flex flex-wrap gap-2">
                {nonSequences.map(g => <BadgeGroupe key={g.id} groupe_id={g.id} from="pool" />)}
                {nonSequences.length === 0 && <p className="text-xs text-gray-300 italic">Tous les cours sont séquencés</p>}
              </div>
            </div>

            {rangs.map((rang, idx) => (
              <div key={idx}>
                {idx > 0 && (
                  <div className="flex items-center gap-2 my-2 ml-4">
                    <div className="w-px h-6 bg-gray-300"></div>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500">
                      Délai :
                      <input type="number" min="0" max="20" value={rang.delai_avant}
                        onChange={e => setDelai(idx, e.target.value)}
                        className="w-14 border border-gray-300 rounded px-2 py-0.5 text-center text-xs focus:border-iip-mauve outline-none" />
                      semaine{rang.delai_avant !== 1 ? 's' : ''}
                    </label>
                  </div>
                )}
                <div onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                  onDragLeave={() => setDragOver(null)} onDrop={() => onDrop(idx)}
                  className={`carte p-3 min-h-[70px] transition
                    ${dragOver === idx ? '!border-iip-blue ligne-active' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500">
                      {idx === 0 ? '▶ Démarre en premier' : `▶ Rang ${idx + 1}`}
                      <span className="ml-2 font-normal text-gray-400">— en parallèle</span>
                    </span>
                    <button onClick={() => supprimerRang(idx)} className="text-gray-300 hover:text-red-500 text-xs"><IconX size={15} /></button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rang.groupe_ids.map(id => <BadgeGroupe key={id} groupe_id={id} from={idx} />)}
                    {rang.groupe_ids.length === 0 && <p className="text-xs text-gray-300 italic">Dépose des cours ici</p>}
                  </div>
                </div>
              </div>
            ))}

            <button onClick={ajouterRang}
              className="w-full border-2 border-dashed border-slate-200 rounded-carte py-3 text-sm text-slate-400 hover:border-iip-blue hover:text-iip-blue transition">
              + Ajouter un rang
            </button>
          </>
        )}
      </div>

      {/* Footer sauvegarde */}
      <div className="absolute bottom-0 right-0 p-4">
        <button onClick={sauvegarder} disabled={saving}
          className="bouton bouton-fort shadow-flottant">
          {saving ? 'Sauvegarde…' : saved ? '✓ Sauvegardé' : 'Enregistrer'}
        </button>
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
    <Fenetre icone={IconTrash} titre="Réinitialiser la planification" large="petite" onFermer={onClose}
      pied={(etape === 'choix' || etape === 'confirm') ? (<>
        <span />
        <button onClick={onClose} className="bouton">Annuler</button>
        {etape === 'choix' && (
          <button onClick={() => setEtape('confirm')}
            className="bouton bouton-detruire">
            Continuer →
          </button>
        )}
        {etape === 'confirm' && (
          <button onClick={executer}
            className="bouton bouton-detruire">
            Confirmer la suppression
          </button>
        )}
      </>) : null}>
        <div className="space-y-4">
          {etape === 'choix' && (
            <>
              <p className="text-sm text-gray-600">
                Section <strong>{section}</strong> — Année <strong>{annee}</strong>
              </p>
              <div className="space-y-2">
                <label className="carte flex items-start gap-3 p-3 cursor-pointer">
                  <input type="radio" name="mode" value="cellules" checked={mode==='cellules'} onChange={()=>setMode('cellules')} className="mt-0.5 accent-iip-blue" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Effacer uniquement les cellules</p>
                    <p className="text-xs text-gray-400">Les groupes sont conservés, seule la planification est effacée. Utile pour régénérer avec l'IA.</p>
                  </div>
                </label>
                <label className="carte flex items-start gap-3 p-3 cursor-pointer">
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
            <div data-etat="corriger" className="bloc-etat p-4 text-sm text-slate-800">
              <p className="font-medium mb-1 flex items-center gap-1.5"><IconAlertTriangle size={15} style={{ color: 'var(--e)' }} /> Confirmation requise</p>
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
              <p className="text-slate-800 font-medium flex items-center justify-center gap-1.5"><IconCircleCheck size={16} style={{ color: 'var(--c-reussi)' }} /> Planification réinitialisée</p>
            </div>
          )}
        </div>
    </Fenetre>
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
  const [showSequence, setShowSequence] = useState(false);
  const [showVisuel, setShowVisuel]     = useState(false);
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
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 flex-wrap">
        <h1 className="titre-ecran flex items-center gap-1.5"><IconCalendarStats size={16} className="text-iip-turquoise"/>Planification — {annee}</h1>
        <select value={filtreSection} onChange={e => setFiltreSection(e.target.value)}
          className="controle">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
        </select>
        <div className="flex-1" />
        {/* Légende */}
        <div className="flex gap-1.5 items-center text-mention">
          <span className="px-1.5 py-0.5 rounded border bg-orange-100 text-orange-800 border-orange-300 font-bold">EV1 = 2h</span>
          <span className="px-1.5 py-0.5 rounded border bg-red-100 text-red-800 border-red-300 font-bold">EV2 = 0h</span>
          <span className="px-1.5 py-0.5 rounded border bg-purple-100 text-purple-800 border-purple-300 font-bold">VC = 1h</span>
        </div>
        <button onClick={() => setShowImport(true)}
          className="bouton flex items-center gap-1">
          <IconDownload size={14} />Importer
        </button>
        {filtreSection && (
          <button onClick={() => setShowSequence(true)}
            className="bouton flex items-center gap-1">
            <IconHash size={14} />Séquencer
          </button>
        )}
        <button onClick={() => setShowVisuel(true)}
          className="bouton flex items-center gap-1">
          <IconCalendar size={14} />Planificateur visuel
        </button>
        {filtreSection && (
          <button onClick={() => setShowIA(true)}
            className="bouton flex items-center gap-1">
            <IconSparkles size={14} />Générer avec Lucie IA
          </button>
        )}
        {filtreSection && (
          <button onClick={() => setShowReset(true)}
            className="bouton bouton-detruire flex items-center gap-1">
            <IconTrash size={15} /> Réinitialiser
          </button>
        )}
        <button onClick={() => setShowCalendrier(true)}
          className="bouton flex items-center gap-1">
          <IconCalendar size={14} />Calendrier
        </button>
        {saving && <span className="text-xs text-iip-blue animate-pulse"><IconDeviceFloppy size={12} className="inline" /></span>}
        {!saving && Object.keys(pendingCells).length === 0 && grille && <IconCircleCheck size={15} title="Enregistré" style={{ color: 'var(--c-reussi)' }} />}
      </div>

      {/* Bandeau synthèse */}
      {grille && (
        <div className="flex-shrink-0 flex gap-6 px-4 py-1.5 h-9 bande-entete border-b border-slate-200 text-xs items-center">
          <span className="text-gray-500">Heures planifiées <strong className="text-gray-800">{Math.round(totalH * 10) / 10} h</strong></span>
          <span className="text-gray-500">PEP générées <strong className="text-iip-blue">{Math.round(totalPEP)}</strong></span>
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
                <th className="sticky left-0 z-30 bande-entete border border-gray-300 w-[260px]"></th>
                <th className="sticky left-[260px] z-30 bande-entete border border-slate-300 w-24 text-center text-mention text-slate-500">Total</th>
                {semaines.map((sem, i) => {
                  const style = TYPE_STYLE[sem.type] || TYPE_STYLE.cours;
                  const mois = new Date(sem.date_debut + 'T12:00:00').toLocaleDateString('fr-BE', { month: 'short' });
                  const prev = i > 0 ? new Date(semaines[i-1].date_debut + 'T12:00:00').toLocaleDateString('fr-BE', { month: 'short' }) : null;
                  return (
                    <th key={sem.id} className={`border border-gray-200 text-center w-10 text-mention font-medium ${style.header} ${style.text}`}
                      title={`S${sem.semaine_num} · ${fmtDate(sem.date_debut)}${sem.label ? ' · '+sem.label : ''}`}>
                      {mois !== prev ? mois : ''}
                    </th>
                  );
                })}
                <th className="border border-gray-300 bg-iip-turquoise/5 text-iip-blue text-mention w-14 text-center">PEP</th>
              </tr>
              {/* N° semaine + date */}
              <tr>
                <th className="sticky left-0 z-30 bande-entete border border-slate-300 text-left px-2 text-mention text-slate-500 font-normal">Attribution</th>
                <th className="sticky left-[260px] z-30 bande-entete border border-slate-300 text-center text-mention text-slate-500 font-normal">planif./attr.</th>
                {semaines.map(sem => {
                  const style = TYPE_STYLE[sem.type] || TYPE_STYLE.cours;
                  return (
                    <th key={sem.id} className={`border border-gray-200 text-center w-10 ${style.header} ${style.text}`}
                      title={`${fmtDate(sem.date_debut)}–${fmtDate(sem.date_fin)}`}>
                      <div className="text-mention font-mono font-semibold">{sem.semaine_num}</div>
                      <div className="text-mention font-normal text-gray-400">{fmtDate(sem.date_debut)}</div>
                    </th>
                  );
                })}
                <th className="border border-gray-300 bg-iip-turquoise/5 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(parSection).length === 0 ? (
                <tr>
                  <td colSpan={semaines.length + 3} className="text-center py-16 text-gray-400">
                    <p className="text-2xl mb-2"><IconPlus size={28} className="inline text-gray-300" /></p>
                    <p className="text-sm">Aucun groupe configuré pour {annee}.</p>
                    <button onClick={() => setShowImport(true)}
                      className="mt-3 bouton bouton-fort inline-flex items-center gap-1.5">
                      <IconDownload size={15} /> Importer depuis les attributions
                    </button>
                  </td>
                </tr>
              ) : (
                Object.entries(parSection).sort(([a],[b]) => a.localeCompare(b)).map(([sec, grps]) => (
                  <BlocSection key={sec} section={sec}
                    groupes={grps}
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
      {showSequence && <ModalSequence annee={annee} section={filtreSection} groupes={grille.groupes || []} onClose={() => setShowSequence(false)} />}
      {showVisuel && <PlanificateurVisuel onClose={(changed) => { setShowVisuel(false); if (changed) charger(); }} />}
      {showCalendrier && <PanelCalendrier semaines={semaines} onUpdate={charger} onClose={() => setShowCalendrier(false)} />}
    </div>
  );
}

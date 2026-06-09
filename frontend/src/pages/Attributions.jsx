import { useEffect, useState, useMemo } from 'react';
import { api, getAnnee } from '../lib/api.js';
import PreviewModal from '../components/PreviewModal.jsx';
import EptModal from '../components/EptModal.jsx';
import OrganisationUEModal from '../components/OrganisationUEModal.jsx';
import Doc23Modal from '../components/Doc23Modal.jsx';
import * as XLSX from 'xlsx';
import { IconClipboardText, IconTrash, IconLock, IconLockOpen, IconArrowsHorizontal, IconRefresh, IconCalendar, IconFileText, IconChartBar, IconEraser, IconWand, IconSearch, IconX, IconSettings, IconFolder, IconPlus, IconFileImport, IconFileSpreadsheet } from '@tabler/icons-react';

// ─── Modale : copier les attributions d'une section d'une année vers une autre ─
function CopierSectionModal({ sections, anneeActive, isAdmin, onClose, onCopied }) {
  const [sectionSrc, setSectionSrc]   = useState(sections[0]?.code || '');
  const [anneeSrc,   setAnneeSrc]     = useState('');
  const [anneeDest,  setAnneeDest]    = useState(anneeActive);
  const [anneesMap,  setAnneesMap]    = useState({}); // { section -> [{annee, n}] }
  const [loading,    setLoading]      = useState(false);
  const [conflict,   setConflict]     = useState(null);
  const [error,      setError]        = useState('');
  const [success,    setSuccess]      = useState('');

  useEffect(() => {
    api.anneesParSection().then(map => {
      setAnneesMap(map);
      // Sélectionner la première section qui a des attributions (pas forcément sections[0])
      const firstWithData = sections.find(s => map[s.code]?.length > 0);
      const code = firstWithData?.code || sections[0]?.code || '';
      if (code) setSectionSrc(code);
      const anneesDispo = map[code] || [];
      const src = anneesDispo.find(a => a.annee !== anneeActive) || anneesDispo[0];
      if (src) setAnneeSrc(src.annee);
    });
  }, []);

  // Quand la section change, mettre à jour l'année source
  function handleSectionChange(code) {
    setSectionSrc(code);
    setError(''); setConflict(null);
    const anneesDispo = anneesMap[code] || [];
    const src = anneesDispo.find(a => a.annee !== anneeDest) || anneesDispo[0];
    setAnneeSrc(src ? src.annee : '');
  }

  const anneesDispo = anneesMap[sectionSrc] || [];
  const nbSource = anneesDispo.find(a => a.annee === anneeSrc)?.n || 0;

  async function copier(force = false) {
    if (!sectionSrc || !anneeSrc || !anneeDest) { setError('Tous les champs sont requis'); return; }
    setLoading(true); setError(''); setConflict(null);
    try {
      const r = await api.copierSection(sectionSrc, anneeSrc, anneeDest, force);
      setSuccess(`✅ ${r.copied} attribution(s) copiées de ${sectionSrc} (${anneeSrc}) → ${anneeDest}.`);
      onCopied();
    } catch (e) {
      const body = e.body || {};
      if (e.status === 409) {
        setConflict({ count: body.count, canForce: body.canForce });
        setError(body.error || e.message);
      } else {
        setError(e.message);
      }
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border-t-4 border-indigo-600">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-title text-lg text-indigo-700 flex items-center gap-2"><IconClipboardText size={18}/> Copier les attributions</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl">×</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">Copie toutes les attributions (prof inclus) d'une section vers une autre année.</p>

          <label className="block">
            <div className="text-xs font-medium text-gray-600 mb-1">Section</div>
            <select value={sectionSrc} onChange={e => handleSectionChange(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
              {sections.map(s => <option key={s.code} value={s.code}>{s.code}{s.libelle && s.libelle !== s.code ? ` — ${s.libelle}` : ''}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs font-medium text-gray-600 mb-1">Année source</div>
              <select value={anneeSrc} onChange={e => setAnneeSrc(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                <option value="">— Choisir —</option>
                {anneesDispo.map(a => (
                  <option key={a.annee} value={a.annee}>{a.annee} ({a.n} lignes)</option>
                ))}
              </select>
              {anneesDispo.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Aucune attribution trouvée pour cette section.</p>
              )}
            </label>
            <label className="block">
              <div className="text-xs font-medium text-gray-600 mb-1">Année destination</div>
              <select value={anneeDest} onChange={e => setAnneeDest(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm">
                {Object.keys(anneesMap).length > 0
                  ? [...new Set([anneeActive, ...Object.values(anneesMap).flat().map(a => a.annee)])].sort().reverse().map(a => (
                      <option key={a} value={a}>{a}{a === anneeActive ? ' ✓' : ''}</option>
                    ))
                  : <option value={anneeActive}>{anneeActive} ✓</option>
                }
              </select>
            </label>
          </div>

          {anneeSrc && nbSource > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-700">
              {nbSource} attribution(s) seront copiées de <strong>{sectionSrc}</strong> ({anneeSrc}) vers <strong>{anneeDest}</strong>.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
              {conflict && isAdmin && (
                <div className="mt-2">
                  <button onClick={() => copier(true)} disabled={loading}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded font-medium disabled:opacity-40">
                    ⚠️ Forcer — supprimer les {conflict.count} existantes et recopier
                  </button>
                </div>
              )}
              {conflict && !isAdmin && (
                <p className="mt-1 text-xs text-gray-500">Contactez un administrateur pour forcer la copie.</p>
              )}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">{success}</div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              {success ? 'Fermer' : 'Annuler'}
            </button>
            {!success && (
              <button onClick={() => copier(false)}
                disabled={loading || !sectionSrc || !anneeSrc || !anneeDest || nbSource === 0}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm px-5 py-2 rounded-lg font-medium">
                {loading ? '…' : <span className="inline-flex items-center gap-1.5"><IconClipboardText size={15}/> Copier {nbSource ? `(${nbSource})` : ''}</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import AttributionForm from '../components/AttributionForm.jsx';
import BulkCreateForm from '../components/BulkCreateForm.jsx';
import AttributionCard from '../components/AttributionCard.jsx';
import ResizableHeader from '../components/ResizableHeader.jsx';
import CoursEditModal from '../components/CoursEditModal.jsx';
import CoursFormModal from '../components/CoursFormModal.jsx';

// ---------------------------------------------------------------------------
// Colonnes de la grille
// ---------------------------------------------------------------------------
const DEFAULT_COLS = [
  { key: '__select', label: '', width: 36 },
  { key: '__conformite', label: '✓', width: 38,
    render: (_, row) => {
      const { cours_conforme: ok, cours_total_attribue: tot, cours_per: per, cours_multiple_attendu: mult } = row;
      if (per == null || per === 0) return <span className="text-gray-300" title="Pas de Cours_per défini">—</span>;
      const tip = `Cours_per=${per} · Total=${tot} · Ratio=${mult}`;
      return ok
        ? <span className="text-green-600 font-bold" title={`Conforme. ${tip}`}>✓</span>
        : <span className="text-red-600 font-bold" title={`NON conforme. ${tip}`}>✗</span>;
    }},
  { key: 'section',               label: 'Section',    width: 110, rowClickable: true, flatOnly: true },
  { key: 'contrat_mdp',           label: 'Contr.',     width: 60, edit: 'select',
    options: [['','—'],['IIP','IIP'],['HELB','HELB']],
    render: v => v === 'IIP' ? <span className="badge badge-iip">IIP</span> : v === 'HELB' ? <span className="badge badge-helb">HELB</span> : v },
  { key: 'ue_num',                label: 'UE',         width: 70,  num: true, rowClickable: true, flatOnly: true },
  { key: 'ue_nom',                label: "Nom de l'UE",width: 280, rowClickable: true, flatOnly: true },
  { key: 'bloc',                  label: 'Bloc',       width: 70,  rowClickable: true, flatOnly: true },
  { key: 'num_organisation',      label: 'Org.',       width: 60,  num: true, edit: 'select', flatOnly: true,
    options: [['1','1'],['2','2'],['3','3'],['4','4']],
    render: v => v && v > 1 ? <span className="bg-amber-100 text-amber-800 text-xs px-1.5 py-0.5 rounded font-semibold">{v}</span> : <span className="text-gray-400">{v || 1}</span> },
  { key: 'quadrimestre_attribue', label: 'Quadri',     width: 110, edit: 'select', flatOnly: true,
    options: [['','—'],['Q1','Q1'],['Q2','Q2'],['Q1/Q2','Q1/Q2']] },
  { key: 'code_cours',            label: 'Code',       width: 70,  rowClickable: true, coursOnly: true },
  { key: 'nom_cours',             label: 'Cours',      width: 200, rowClickable: true, coursOnly: true },
  { key: 'activite_nom',          label: 'Activité',   width: 120, rowClickable: true,
    render: v => v || <span className="text-gray-300 text-xs italic">—</span> },
  { key: 'type_cours',            label: 'Type',       width: 56, rowClickable: true,
    render: v => { const cls = {CT:'badge-ct',CG:'badge-cc',PP:'badge-pp',Z:'badge-z',B:'badge-b',F:'badge-f',T:'badge-t',P:'badge-p',O:'badge-o'}[v]; return cls ? <span className={`badge ${cls}`}>{v}</span> : (v || '—'); } },
  { key: 'code',                  label: 'Gr.',        width: 52, edit: 'text' },
  { key: 'professeur_id',         label: 'Professeur', width: 200, edit: 'prof',
    render: (_, row) => row.professeur || <span className="italic text-orange-500">—</span> },
  { key: 'contrat',               label: 'Stat.',      width: 64, edit: 'statut',
    options: [['','—'],['CC','CC'],['EXP','EXP']] },
  { key: 'titre_rtf',             label: 'Titre',      width: 64, edit: 'select',
    options: [['','—'],['R','R — Titre requis'],['TR','TR — Titre requis (RTF)'],['TS','TS — Titre suffisant'],['TPL','TPL — Pénurie listé'],['TPNL','TPNL — Pénurie non listé'],['ATS','ATS — Assim. suffisant'],['ATP','ATP — Assim. pénurie listé'],['A','A — Suffisant gr. A'],['3B','3B — Suffisant gr. B (3 déc.)'],['Art. 20','Art. 20 (WBE)']],
    render: v => v ? <span className="bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded font-semibold">{v}</span> : <span className="text-gray-300">—</span> },
  { key: 'type_cours_helb',       label: 'HELB',       width: 60, edit: 'select', helbOnly: true,
    options: [['','—'],['MFP','MFP'],['MA','MA']],
    render: v => v ? <span className="bg-pink-100 text-pink-700 text-xs px-1.5 py-0.5 rounded font-semibold">{v}</span> : <span className="text-gray-300">—</span> },
  { key: 'periodes_attribuees',   label: 'Per.',       width: 84, num: true, edit: 'number' },
  { key: 'autonomie_attribuee',   label: 'Aut.',       width: 84, num: true, edit: 'number' },
  { key: 'total_attribue_professeur', label: 'Total',  width: 64, num: true, calc: true, rowClickable: true },
  { key: 'charge_en_heures',      label: 'Hrs',        width: 60, num: true, calc: true, rowClickable: true },
  { key: '__actions',             label: '',           width: 44 },
];

// ===========================================================================
export default function Attributions() {
  const [data, setData] = useState([]);
  const [sections, setSections] = useState([]);
  const [professeurs, setProfesseurs] = useState([]);
  const [activitesList, setActivitesList] = useState([]);
  const [extDot, setExtDot] = useState({}); // { [attribution_id]: 'EXT'|'DOT'|'EXT+DOT' }
  const [verrous, setVerrous] = useState({}); // { [attribution_id]: {nomination...} }
  const [pertesCharge, setPertesCharge] = useState([]); // profs définitifs en perte de charge
  const [alertesCours, setAlertesCours] = useState({}); // { [attribution_id]: {definitif...} } cours avec un définitif
  const [autAnalyse, setAutAnalyse] = useState({}); // { [ue_num]: { ok, reste } }
  const [filters, setFilters] = useState({ section:'', prof_id:'', contrat:'', type_cours:'', ue_num:'', q:'' });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [showCopierSection, setShowCopierSection] = useState(false);
  const [rapportHtml, setRapportHtml] = useState(null); // { html, nom }

  const [selected, setSelected] = useState(new Set());
  const [sortBy, setSortBy] = useState({ key: null, dir: 'asc' });
  const [confirmDeleteSection, setConfirmDeleteSection] = useState(null);
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);
  const [bulkDeleteModal, setBulkDeleteModal] = useState(null);
  const [secDel, setSecDel] = useState(null); // { section, lignes, count } | null
  const [secDelText, setSecDelText] = useState('');
  const [secDelBusy, setSecDelBusy] = useState(false);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkConfirmText, setBulkConfirmText] = useState('');
  const [editRow, setEditRow] = useState(null);
  const [addMenuUE, setAddMenuUE] = useState(null);   // {ue, sec} : menu + ouvert pour cette UE
  const [coursManquants, setCoursManquants] = useState([]); // cours du DP sans ligne (pour l'UE du menu ouvert)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 }); // position fixe du menu
  const [eptModal, setEptModal] = useState(null);
  const [orgModal, setOrgModal] = useState(null);
  const [doc23Modal, setDoc23Modal] = useState(null);
  const [quadriMenu, setQuadriMenu] = useState(null); // key de l'UE dont le menu quadri est ouvert
  const [activeUE, setActiveUE] = useState(null);     // key de la dernière UE cliquée (encadrée)
  const [newCoursForm, setNewCoursForm] = useState(null); // préremplissage AttributionForm pour nouveau cours
  const [viewMode, setViewMode] = useState('ue');
  const [openUEs, setOpenUEs] = useState(new Set());

  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('attr_col_widths') || '{}');
      const base = {};
      for (const c of DEFAULT_COLS) base[c.key] = saved[c.key] || c.width;
      return base;
    } catch { return Object.fromEntries(DEFAULT_COLS.map(c => [c.key, c.width])); }
  });
  function setColWidth(key, w) {
    setColWidths(prev => {
      const next = { ...prev, [key]: Math.max(30, Math.round(w)) };
      try { localStorage.setItem('attr_col_widths', JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const COLS = useMemo(() => DEFAULT_COLS.map(c => ({ ...c, width: colWidths[c.key] || c.width })), [colWidths]);
  // Détecter s'il y a des lignes HELB dans les données affichées
  const hasHelb = useMemo(() => Array.isArray(data) && data.some(r => r.contrat_mdp === 'HELB'), [data]);
  // Colonnes pour la vue accordéon niveau UE (masque section/ue/bloc/org, garde code_cours/nom_cours)
  const COLS_UE = useMemo(() => COLS.filter(c => !c.flatOnly && (!c.helbOnly || hasHelb)), [COLS, hasHelb]);
  // Colonnes pour la vue accordéon niveau Cours (masque aussi code_cours/nom_cours)
  const COLS_COURS = useMemo(() => COLS.filter(c => !c.flatOnly && !c.coursOnly && (!c.helbOnly || hasHelb)), [COLS, hasHelb]);

  const me = JSON.parse(localStorage.getItem('user') || 'null');
  const isAdmin = me?.role === 'admin';

  async function genererRapport(section) {
    const annee = getAnnee();
    const tok = localStorage.getItem('token');
    const d = await fetch(`/api/attributions/rapport-attributions?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());
    if (d.error) { alert(d.error); return; }

    // Couleurs par niveau (rang 1=orange, 2=bleu clair, 3=bleu marine)
    const niveaux = [...new Set(d.ues.map(u => u.ue_niv).filter(Boolean))].sort((a,b) => {
      const na = parseInt(a.match(/\d+$/)?.[0]??'99'); const nb = parseInt(b.match(/\d+$/)?.[0]??'99');
      return na - nb;
    });
    const NIV_PALETTE = ['#f97316','#60a5fa','#1e3a8a','#a855f7','#ec4899'];
    const getNivCol = niv => NIV_PALETTE[niveaux.indexOf(niv) % NIV_PALETTE.length] || '#6b7280';
    const fmt = n => (n != null && n !== '') ? String(n) : '0';
    const S = 'padding:1px 5px;font-size:10px;line-height:1.2;';
    const SR = S + 'text-align:right;';
    const SN = S + 'white-space:nowrap;';

    const lignesUE = d.ues.map(ue => {
      const col = getNivCol(ue.ue_niv);
      const lignesCours = ue.cours.map((c,i) => `
        <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
          <td style="${SN}padding-left:20px">${c.code_cours||'—'}</td>
          <td style="${S}max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
              title="${(c.cours_nom||'').replace(/"/g,"'")}">${c.cours_nom||'—'}${c.activite_nom?` <em style="color:#9ca3af;font-size:10px">(${c.activite_nom})</em>`:''}</td>
          <td style="${SN}color:#6b7280">Gr.${c.groupe_code}</td>
          <td style="${SN}">${c.prof_nom}</td>
          <td style="${SR}color:#374151">${fmt(c.periodes)}</td>
          <td style="${SR}color:#6b7280">${fmt(c.autonomie)}</td>
          <td style="${SR}font-weight:600;border-left:1px solid #e5e7eb">${fmt(c.total)}</td>
        </tr>`).join('');

      return `
        <tr style="background:#f1f5f9;border-left:3px solid ${col}">
          <td colspan="4" style="padding:4px 6px 4px 8px;font-weight:700;font-size:12px;color:#111827;white-space:nowrap">
            <span style="background:${col};color:white;font-size:9px;padding:1px 4px;border-radius:2px;margin-right:5px">${ue.ue_niv||''}</span>UE ${ue.ue_num} — ${ue.ue_nom||''}
          </td>
          <td style="${SR}color:#6b7280;font-size:10px"></td>
          <td style="${SR}color:#6b7280;font-size:10px"></td>
          <td style="${SR}border-left:1px solid #e5e7eb"></td>
        </tr>
        ${lignesCours}
        <tr style="background:#e8edf3;border-left:3px solid ${col}">
          <td colspan="4" style="padding:2px 6px 2px 20px;font-size:10px;color:#6b7280;font-style:italic">Sous-total UE ${ue.ue_num}</td>
          <td style="${SR}font-weight:700;color:#374151">${fmt(ue.total_per)}</td>
          <td style="${SR}font-weight:600;color:#6b7280">${fmt(ue.total_aut)}</td>
          <td style="${SR}font-weight:700;border-left:1px solid #e5e7eb">${fmt(ue.total_per+ue.total_aut)}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:Arial,sans-serif; font-size:11px; color:#111827; }
        table { width:100%; border-collapse:collapse; }
        td,th { border-bottom:1px solid #e5e7eb; }
        @media print {
          @page { margin:10mm; size:A4 landscape; }
          tr { page-break-inside:avoid; }
          thead { display:table-header-group; }
        }
      </style></head><body>
      <div style="padding:10mm">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1B2B4B;padding-bottom:6px;margin-bottom:10px">
          <div>
            <div style="font-size:16px;font-weight:700;color:#1B2B4B">Attributions — ${section}</div>
            <div style="font-size:11px;color:#6b7280">Année scolaire ${annee}</div>
          </div>
          <div style="font-size:9px;color:#9ca3af">Généré le ${new Date().toLocaleDateString('fr-BE')} · Lucie · IIP</div>
        </div>
        <table>
          <thead>
            <tr style="background:#1B2B4B;color:white">
              <th style="padding:3px 5px;text-align:left;font-size:10px;white-space:nowrap">Code</th>
              <th style="padding:3px 5px;text-align:left;font-size:10px">Cours</th>
              <th style="padding:3px 5px;text-align:left;font-size:10px;white-space:nowrap">Gr.</th>
              <th style="padding:3px 5px;text-align:left;font-size:10px;white-space:nowrap">Professeur</th>
              <th style="padding:3px 5px;text-align:right;font-size:10px;white-space:nowrap">Pér.</th>
              <th style="padding:3px 5px;text-align:right;font-size:10px;white-space:nowrap">Aut.</th>
              <th style="padding:3px 5px;text-align:right;font-size:10px;white-space:nowrap;border-left:1px solid rgba(255,255,255,.3)">Total</th>
            </tr>
          </thead>
          <tbody>
            ${lignesUE}
            <tr style="background:#1B2B4B;color:white">
              <td colspan="4" style="padding:4px 6px;font-weight:700;font-size:12px;white-space:nowrap">TOTAL — ${section}</td>
              <td style="${SR}font-weight:700;color:white">${fmt(d.total_per)}</td>
              <td style="${SR}font-weight:700;color:white">${fmt(d.total_aut)}</td>
              <td style="${SR}font-weight:700;color:white;border-left:1px solid rgba(255,255,255,.3)">${fmt(d.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      </body></html>`;

    setRapportHtml({ html, nom: nomDoc('Rapport_attr', filtres?.section || 'Toutes_sections', getAnnee()) });
  }
  async function genererExcel(section) {
    const annee = getAnnee();
    const tok = localStorage.getItem('token');
    const d = await fetch(`/api/attributions/rapport-attributions?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());
    if (d.error) { alert(d.error); return; }

    // Couleurs
    const BLEU_MARINE  = '1B2B4B';
    const TURQUOISE    = '00AACC';
    const GRIS_CLAIR   = 'F1F5F9';
    const GRIS_ZEBRE   = 'F9FAFB';
    const GRIS_SOUS    = 'E8EDF3';
    const GRIS_TEXTE   = '6B7280';
    const NIV_PAL      = ['F97316','60A5FA','1E3A8A','A855F7','EC4899'];
    const niveaux      = [...new Set(d.ues.map(u => u.ue_niv).filter(Boolean))].sort((a,b)=>{
      return parseInt(a.match(/\d+$/)?.[0]??99) - parseInt(b.match(/\d+$/)?.[0]??99);
    });
    const nivCol = niv => NIV_PAL[niveaux.indexOf(niv) % NIV_PAL.length] || '6B7280';

    const hdr = (v, bgHex, fgHex='FFFFFF', bold=false, sz=9, al='left') => ({
      v, s: {
        font:{ name:'Calibri', sz, bold, color:{ rgb: fgHex } },
        fill:{ fgColor:{ rgb: bgHex }, patternType:'solid' },
        alignment:{ horizontal: al, vertical:'center', wrapText:false },
        border:{ bottom:{ style:'thin', color:{ rgb:'E5E7EB' } } }
      }
    });

    const rows = [];

    // Titre
    rows.push([{ v:`Attributions — ${section}`, s:{font:{name:'Calibri',sz:14,bold:true,color:{rgb:BLEU_MARINE}}}}]);
    rows.push([{ v:`Année scolaire ${annee}`, s:{font:{name:'Calibri',sz:10,color:{rgb:GRIS_TEXTE}}}}]);
    rows.push([]);

    // En-têtes colonnes
    rows.push([
      hdr('Code',        BLEU_MARINE,'FFFFFF',true,9,'left'),
      hdr('Cours',       BLEU_MARINE,'FFFFFF',true,9,'left'),
      hdr('Gr.',         BLEU_MARINE,'FFFFFF',true,9,'center'),
      hdr('Professeur',  BLEU_MARINE,'FFFFFF',true,9,'left'),
      hdr('Pér.',        BLEU_MARINE,'FFFFFF',true,9,'center'),
      hdr('Aut.',        BLEU_MARINE,'FFFFFF',true,9,'center'),
      hdr('Total',       BLEU_MARINE,'FFFFFF',true,9,'center'),
    ]);

    for (const ue of d.ues) {
      const col = nivCol(ue.ue_niv);
      const ueLabel = `UE ${ue.ue_num}${ue.ue_niv ? ' ['+ue.ue_niv+']' : ''}${ue.ue_quad ? ' · '+ue.ue_quad : ''} — ${ue.ue_nom}`;
      // Ligne UE
      rows.push([
        { v:ueLabel, s:{font:{name:'Calibri',sz:10,bold:true,color:{rgb:BLEU_MARINE}},fill:{fgColor:{rgb:GRIS_CLAIR},patternType:'solid'},alignment:{horizontal:'left',vertical:'center'}}},
        { v:'', s:{fill:{fgColor:{rgb:GRIS_CLAIR},patternType:'solid'}}},
        { v:'', s:{fill:{fgColor:{rgb:GRIS_CLAIR},patternType:'solid'}}},
        { v:'', s:{fill:{fgColor:{rgb:GRIS_CLAIR},patternType:'solid'}}},
        { v:'', s:{fill:{fgColor:{rgb:GRIS_CLAIR},patternType:'solid'}}},
        { v:'', s:{fill:{fgColor:{rgb:GRIS_CLAIR},patternType:'solid'}}},
        { v:'', s:{fill:{fgColor:{rgb:GRIS_CLAIR},patternType:'solid'}}},
      ]);

      ue.cours.forEach((c, i) => {
        const bg = i%2===0 ? 'FFFFFF' : GRIS_ZEBRE;
        const cn = c.activite_nom ? `${c.cours_nom}  (${c.activite_nom})` : c.cours_nom;
        rows.push([
          { v:c.code_cours||'', s:{font:{name:'Calibri',sz:9,color:{rgb:'374151'}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'left',vertical:'center'}}},
          { v:cn||'', s:{font:{name:'Calibri',sz:9,color:{rgb:'374151'}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'left',vertical:'center',wrapText:false}}},
          { v:`Gr.${c.groupe_code}`, s:{font:{name:'Calibri',sz:9,color:{rgb:GRIS_TEXTE}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'center',vertical:'center'}}},
          { v:c.prof_nom||'—', s:{font:{name:'Calibri',sz:9,color:{rgb:'374151'}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'left',vertical:'center'}}},
          { v:c.periodes||0, s:{font:{name:'Calibri',sz:9,color:{rgb:'374151'}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'center',vertical:'center'}}},
          { v:c.autonomie||0, s:{font:{name:'Calibri',sz:9,color:{rgb:GRIS_TEXTE}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'center',vertical:'center'}}},
          { v:c.total||0, s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:BLEU_MARINE}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'center',vertical:'center'}}},
        ]);
      });

      // Sous-total UE
      rows.push([
        { v:`Sous-total UE ${ue.ue_num}`, s:{font:{name:'Calibri',sz:9,italic:true,color:{rgb:GRIS_TEXTE}},fill:{fgColor:{rgb:GRIS_SOUS},patternType:'solid'},alignment:{horizontal:'right',vertical:'center'}}},
        { v:'', s:{fill:{fgColor:{rgb:GRIS_SOUS},patternType:'solid'}}},
        { v:'', s:{fill:{fgColor:{rgb:GRIS_SOUS},patternType:'solid'}}},
        { v:'', s:{fill:{fgColor:{rgb:GRIS_SOUS},patternType:'solid'}}},
        { v:ue.total_per, s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:'374151'}},fill:{fgColor:{rgb:GRIS_SOUS},patternType:'solid'},alignment:{horizontal:'center',vertical:'center'}}},
        { v:ue.total_aut, s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:GRIS_TEXTE}},fill:{fgColor:{rgb:GRIS_SOUS},patternType:'solid'},alignment:{horizontal:'center',vertical:'center'}}},
        { v:ue.total_per+ue.total_aut, s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:BLEU_MARINE}},fill:{fgColor:{rgb:GRIS_SOUS},patternType:'solid'},alignment:{horizontal:'center',vertical:'center'}}},
      ]);
      rows.push([]); // espace entre UE
    }

    // Total section
    rows.push([
      { v:`TOTAL — ${section}`, s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU_MARINE},patternType:'solid'},alignment:{horizontal:'left',vertical:'center'}}},
      { v:'', s:{fill:{fgColor:{rgb:BLEU_MARINE},patternType:'solid'}}},
      { v:'', s:{fill:{fgColor:{rgb:BLEU_MARINE},patternType:'solid'}}},
      { v:'', s:{fill:{fgColor:{rgb:BLEU_MARINE},patternType:'solid'}}},
      { v:d.total_per, s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU_MARINE},patternType:'solid'},alignment:{horizontal:'center',vertical:'center'}}},
      { v:d.total_aut, s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU_MARINE},patternType:'solid'},alignment:{horizontal:'center',vertical:'center'}}},
      { v:d.total, s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU_MARINE},patternType:'solid'},alignment:{horizontal:'center',vertical:'center'}}},
    ]);

    rows.push([]);
    const today = new Date().toLocaleDateString('fr-BE');
    rows.push([{ v:`Généré le ${today} · Lucie · Institut Ilya Prigogine`, s:{font:{name:'Calibri',sz:8,italic:true,color:{rgb:'9CA3AF'}},alignment:{horizontal:'right'}}}]);

    // Créer le workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Largeurs colonnes
    ws['!cols'] = [
      {wch:10}, {wch:44}, {wch:7}, {wch:20},
      {wch:8},  {wch:8},  {wch:8}
    ];
    // Figer les 4 premières lignes (titre + sous-titre + espace + en-têtes)
    ws['!freeze'] = { xSplit:0, ySplit:4 };

    XLSX.utils.book_append_sheet(wb, ws, section.slice(0,31));

    // Télécharger
    XLSX.writeFile(wb, `Attributions_${section}_${annee}.xlsx`);
  }

  /* --- Sélection --- */
  function toggleSelect(id) {
    if (String(id).startsWith('z-')) return; // lignes Z non sélectionnables
    setSelected(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  }
  function toggleSelectAll() {
    const realIds = sortedData.filter(r => !r.is_z).map(r => r.id);
    setSelected(s => s.size === realIds.length ? new Set() : new Set(realIds));
  }

  /* --- Tri --- */
  function toggleSort(key) {
    if (['__actions','__conformite','__select'].includes(key)) return;
    setSortBy(s => s.key !== key ? { key, dir:'asc' } : s.dir === 'asc' ? { key, dir:'desc' } : { key:null, dir:'asc' });
  }
  const sortedData = useMemo(() => {
    if (!sortBy.key) return data;
    const k = sortBy.key;
    return [...data].sort((a,b) => {
      const va=a[k], vb=b[k];
      if (va==null&&vb==null) return 0; if (va==null) return 1; if (vb==null) return -1;
      const na=Number(va), nb=Number(vb);
      const cmp = (!isNaN(na)&&!isNaN(nb)&&va!==''&&vb!=='') ? na-nb : String(va).localeCompare(String(vb),'fr',{numeric:true,sensitivity:'base'});
      return sortBy.dir==='asc' ? cmp : -cmp;
    });
  }, [data, sortBy]);

  /* --- Groupement Section → UE (par organisation) → Cours --- */
  const sectionGroups = useMemo(() => {
    const secMap = new Map();
    for (const r of sortedData) {
      const sec = r.section || '(sans section)';
      if (!secMap.has(sec)) secMap.set(sec, new Map());
      const ueMap = secMap.get(sec);
      const org = r.num_organisation || 1;
      const ueKey = (r.ue_num ?? 0) + '/org' + org;
      if (!ueMap.has(ueKey)) ueMap.set(ueKey, { ue_num: r.ue_num, ue_nom: r.ue_nom, bloc: r.bloc, ue_et_ref: r.ue_et_ref, ue_quad: r.quadri_pour_tous_prevu, num_organisation: org, coursMap: new Map(), rows: [] });
      const ueGroup = ueMap.get(ueKey);
      ueGroup.rows.push(r);
      const coursKey = r.code_cours || '?';
      if (!ueGroup.coursMap.has(coursKey)) ueGroup.coursMap.set(coursKey, { code_cours: r.code_cours, nom_cours: r.nom_cours, type_cours: r.type_cours, rows: [] });
      ueGroup.coursMap.get(coursKey).rows.push(r);
    }
    // Convertir en array structuré
    const result = [];
    for (const [sec, ueMap] of secMap) {
      const ues = Array.from(ueMap.values()).map(ue => ({
        ...ue,
        cours: Array.from(ue.coursMap.values()).sort((a,b) => (a.code_cours||'').localeCompare(b.code_cours||'','fr',{numeric:true}))
      })).sort((a,b) => {
        const ba=a.bloc||'', bb=b.bloc||'';
        if (ba!==bb) return ba.localeCompare(bb,'fr',{numeric:true});
        if ((a.ue_num||0) !== (b.ue_num||0)) return (a.ue_num||0)-(b.ue_num||0);
        return (a.num_organisation||1)-(b.num_organisation||1);
      });
      const allRows = ues.flatMap(u=>u.rows);
      result.push({ section: sec, ues, rows: allRows });
    }
    return result.sort((a,b) => a.section.localeCompare(b.section,'fr',{numeric:true}));
  }, [sortedData]);

  // Clés ouvertes : "sec:TIM", "ue:TIM/250/1", "cours:TIM/250/1/CHEM101"
  function toggle(key) { setOpenUEs(s=>{const x=new Set(s); x.has(key)?x.delete(key):x.add(key); return x;}); }

  // Couleurs du badge quadrimestre (3 états + neutre)
  function quadriStyle(q) {
    if (q === 'Q1')    return 'bg-blue-100 text-blue-700';
    if (q === 'Q2')    return 'bg-amber-100 text-amber-800';
    if (q === 'Q1/Q2') return 'bg-iip-mauve/15 text-iip-mauve';
    return 'bg-gray-100 text-gray-400'; // non défini
  }
  async function changeQuadri(ue, sec, org, q) {
    setQuadriMenu(null);
    try { await api.updateUE(ue.ue_num, { ue_quad: q || null }); load(); }
    catch (e) { alert(e.message); }
  }
  async function reouvrirUE(ue, sec) {
    if (!confirm(`Réouvrir l'UE ${ue.ue_num} dans ${sec} ? Une nouvelle organisation sera créée avec le numéro suivant.`)) return;
    try {
      const r = await api.reouvrirUE(ue.ue_num, sec, ue.num_organisation || 1);
      load();
      alert(`Nouvelle organisation ${r.num_organisation} créée (${r.created} cours).`);
    } catch (e) { alert(e.message); }
  }

  function expandAll() {
    const keys = new Set();
    for (const sg of sectionGroups) {
      keys.add('sec:'+sg.section);
      for (const ue of sg.ues) {
        const uk = sg.section+'/'+ue.ue_num+'/'+(ue.num_organisation||1);
        keys.add('ue:'+uk);
        for (const c of ue.cours) keys.add('cours:'+uk+'/'+c.code_cours);
      }
    }
    setOpenUEs(keys);
  }
  function collapseAll() { setOpenUEs(new Set()); }
  // Mobile : replier/déplier toutes les sections (clé mobsec:)
  function mobileCollapseAll() {
    setOpenUEs(s => { const n = new Set(s); sectionGroups.forEach(g => n.add('mobsec:' + g.section)); return n; });
  }
  function mobileExpandAll() {
    setOpenUEs(s => { const n = new Set(s); sectionGroups.forEach(g => n.delete('mobsec:' + g.section)); return n; });
  }
  // Nombre total d'UE pour les stats
  const totalUECount = useMemo(() => sectionGroups.reduce((s,g)=>s+g.ues.length,0), [sectionGroups]);

  /* --- CRUD --- */
  async function deleteRow(id) {
    if (!confirm('Supprimer cette attribution ?')) return;
    try { await api.deleteAttribution(id); setData(d=>d.filter(r=>r.id!==id)); setSelected(s=>{const n=new Set(s);n.delete(id);return n;}); }
    catch(e){ alert('Erreur : '+e.message); }
  }
  async function delSection(code) {
    setConfirmDeleteSection(code);
  }
  const [confirmViderSection, setConfirmViderSection] = useState(null);

  async function viderSectionConfirmed(section) {
    try {
      const r = await api.bulkDeleteFiltered({ section, annee_scolaire: getAnnee() });
      setConfirmViderSection(null);
      load();
      alert(`${r.deleted} attribution(s) supprimée(s) pour ${section}.`);
    } catch(e) { alert('Erreur : ' + e.message); }
  }
  async function delSectionConfirmed(code) {
    try { await api.maskSection(code, getAnnee()); setConfirmDeleteSection(null); load(); }
    catch(e){ alert('Erreur : ' + e.message); setConfirmDeleteSection(null); }
  }
  async function autoFillSection(section) {
    if (!confirm(`Remplir automatiquement les périodes prof de la section "${section}" ?\n\nToutes les lignes à 0 période recevront la valeur cours_per du cours correspondant. L'autonomie n'est pas touchée.`)) return;
    try {
      const r = await api.autoFillPeriodes(section);
      if (r.updated > 0) { load(); }
      else alert('Aucune ligne à remplir (toutes les périodes sont déjà renseignées).');
    } catch(e){ alert('Erreur : ' + e.message); }
  }
  async function saveCell(id, field, value) {
    try {
      // Garde-fou : réattribuer un cours engagé à titre définitif à quelqu'un d'autre
      if (field === 'professeur_id') {
        const alerte = alertesCours[id];
        const verrou = verrous[id];
        const definitifNom = alerte?.definitif || null;
        const nouveauId = value ? Number(value) : null;
        // Si un définitif est lié à ce cours et qu'on attribue à un AUTRE prof
        if (definitifNom && nouveauId && verrou?.definitif_id !== nouveauId) {
          if (!confirm(`Ce cours est attribué à titre définitif à ${definitifNom}.\n\nÊtes-vous certain de l'attribuer à quelqu'un d'autre ?`)) {
            return; // annulé : on ne change rien
          }
        }
      }
      const numF = ['periodes_attribuees','autonomie_attribuee','num_organisation'];
      const payload = { [field]: numF.includes(field) ? Number(value) : value };
      if (field === 'contrat_mdp' && value !== 'HELB') {
        payload.type_cours_helb = null;
      }
      await api.updateAttribution(id, payload);
      setData(prev=>prev.map(r=>r.id===id?{...r,...payload,...recompute(r,payload)}:r));
      // Si on a changé le prof, recharger les verrous/alertes de nomination (cadenas)
      if (field === 'professeur_id') {
        const tok = localStorage.getItem('token');
        fetch(`/api/nominations/verrous?annee=${encodeURIComponent(getAnnee())}`, { headers: { Authorization: `Bearer ${tok}` } })
          .then(r => r.json()).then(d => {
            const map = {};
            for (const v of (Array.isArray(d) ? d : [])) map[v.attribution_id] = v;
            setVerrous(map);
          }).catch(() => {});
        fetch(`/api/nominations/alertes-cours?annee=${encodeURIComponent(getAnnee())}`, { headers: { Authorization: `Bearer ${tok}` } })
          .then(r => r.json()).then(d => {
            const map = {};
            for (const a of (Array.isArray(d) ? d : [])) map[a.attribution_id] = a;
            setAlertesCours(map);
          }).catch(() => {});
      }
    } catch(e){ alert('Erreur : '+e.message); }
  }
  async function toggleConge(row) {
    try {
      if (!row.en_conge) {
        if (!confirm(`Mettre ${row.professeur_id ? 'ce titulaire' : 'cette ligne'} en congé ?\n\nLa ligne sera grisée (comptée 0 en dotation) et une ligne de remplacement sera créée avec les mêmes périodes.`)) return;
      }
      await api.toggleConge(row.id);
      load();
    } catch(e){ alert('Erreur : '+e.message); }
  }
  function recompute(row, patch) {
    const per = Number(patch.periodes_attribuees ?? row.periodes_attribuees ?? 0);
    const aut = Number(patch.autonomie_attribuee ?? row.autonomie_attribuee ?? 0);
    const total = per+aut;
    return { total_attribue_professeur: total, charge_en_heures: Math.round(total*50/60) };
  }

  /* --- Bulk delete --- */
  async function openBulkModal(mode) {
    setBulkConfirmText(''); setBulkDeleteModal(mode); setBulkPreview(null);
    if (mode==='selection') { setBulkPreview({count:selected.size}); return; }
    try {
      const f = {};
      if (mode==='filtered') { if(filters.section) f.section=filters.section; if(filters.prof_id) f.professeur_id=filters.prof_id; if(filters.contrat) f.contrat=filters.contrat; }
      setBulkPreview(await api.bulkDeletePreview(f));
    } catch(e){ alert(e.message); setBulkDeleteModal(null); }
  }
  async function ouvrirSuppressionSection(section) {
    setSecDelText('');
    try {
      const d = await api.apercuSuppressionSection(section);
      setSecDel({ section, lignes: d.lignes || [], count: d.count || 0 });
    } catch (e) { alert('Erreur : ' + e.message); }
  }
  async function confirmSuppressionSection() {
    if (!secDel) return;
    setSecDelBusy(true);
    try {
      const r = await api.supprimerToutSection(secDel.section);
      setSecDel(null); setSecDelText('');
      alert(`${r.supprimees} attribution(s) supprimée(s).` + (r.backup ? `\nSauvegarde créée : ${r.backup}` : ''));
      load();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setSecDelBusy(false); }
  }

  async function confirmBulkDelete() {
    if (bulkConfirmText!=='SUPPRIMER') { alert('Tapez SUPPRIMER.'); return; }
    try {
      let r;
      if (bulkDeleteModal==='selection') {
        // Exclure les IDs synthétiques Z (format 'z-xxx')
        const realIds = Array.from(selected).filter(id => !String(id).startsWith('z-'));
        if (realIds.length === 0) { alert('Aucune attribution réelle sélectionnée (les lignes Z ne peuvent pas être supprimées).'); return; }
        r = await api.bulkDeleteAttributions(realIds);
      }
      else if (bulkDeleteModal==='filtered') { const f={}; if(filters.section) f.section=filters.section; if(filters.prof_id) f.professeur_id=filters.prof_id; if(filters.contrat) f.contrat=filters.contrat; r = await api.bulkDeleteFiltered(f); }
      else r = await api.bulkDeleteFiltered({});
      alert(`${r.deleted} supprimée(s).`); setBulkDeleteModal(null); setSelected(new Set()); load();
    } catch(e){ alert('Erreur : '+e.message); }
  }
  async function reimportExcel() {
    if (!confirm('Réimporter depuis Excel ?')) return;
    try { await api.adminReimportExcel(); alert('Réimport terminé.'); load(); } catch(e){ alert(e.message); }
  }

  /* --- Chargement --- */
  async function load(overrideFilters) {
    setLoading(true);
    const f = overrideFilters ?? filters;
    try {
      const [a,s,p] = await Promise.all([api.attributions(f), api.sections(), api.professeurs(true)]);
      setData(a); setSections(s); setProfesseurs(p);
      if (activitesList.length === 0) api.activites().then(setActivitesList).catch(()=>{});
      // Charger badges EXT/DOT
      const tok = localStorage.getItem('token');
      fetch(`/api/pilotage/ext-dot?annee=${encodeURIComponent(getAnnee())}`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.json()).then(d => {
          const map = {};
          for (const a of (d.attrs || [])) map[a.id] = a.badge;
          setExtDot(map);
        }).catch(() => {});
      // Charger les verrous de nomination (attributions verrouillées : prof définitif sur son cours)
      fetch(`/api/nominations/verrous?annee=${encodeURIComponent(getAnnee())}`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.json()).then(d => {
          const map = {};
          for (const v of (Array.isArray(d) ? d : [])) map[v.attribution_id] = v;
          setVerrous(map);
        }).catch(() => {});
      // Charger les pertes de charge (profs définitifs dont le cours n'existe plus / pas dedans)
      fetch(`/api/nominations/pertes-charge?annee=${encodeURIComponent(getAnnee())}`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.json()).then(d => setPertesCharge(Array.isArray(d) ? d : [])).catch(() => {});
      // Charger les alertes "un définitif est engagé sur ce cours" (matche par cours, pas par prof attribué)
      fetch(`/api/nominations/alertes-cours?annee=${encodeURIComponent(getAnnee())}`, { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.json()).then(d => {
          const map = {};
          for (const a of (Array.isArray(d) ? d : [])) map[a.attribution_id] = a;
          setAlertesCours(map);
        }).catch(() => {});
      // Charger analyse autonomie par UE — pour toutes les sections présentes
      const sectionsVisibles = [...new Set((Array.isArray(a) ? a : []).map(r => r.section).filter(Boolean))];
      if (f.section && !sectionsVisibles.includes(f.section)) sectionsVisibles.push(f.section);
      if (sectionsVisibles.length > 0) {
        Promise.all(sectionsVisibles.map(sec =>
          fetch(`/api/attributions/autonomie-ue?section=${encodeURIComponent(sec)}&annee=${encodeURIComponent(getAnnee())}`,
            { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json()).catch(() => ({}))
        )).then(results => {
          const merged = {};
          for (const m of results) Object.assign(merged, m || {});
          setAutAnalyse(merged);
        });
      } else {
        setAutAnalyse({});
      }
    } catch(e){ console.error(e); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);
  function applyFilters() { load(filters); }
  function resetFilters() {
    const empty = {section:'',prof_id:'',contrat:'',type_cours:'',ue_num:'',q:''};
    setFilters(empty);
    load(empty);
  }

  const ueList = useMemo(() => {
    const m = new Map();
    for (const r of data) if (r.ue_num && !m.has(r.ue_num)) m.set(r.ue_num, r.ue_nom);
    return Array.from(m.entries()).sort((a,b)=>a[0]-b[0]);
  }, [data]);

  const stats = useMemo(() => data.reduce((a,r)=>{
    a.total += Number(r.total_attribue_professeur||0);
    a.iip += r.contrat_mdp==='IIP' ? Number(r.total_attribue_professeur||0) : 0;
    a.helb += r.contrat_mdp==='HELB' ? Number(r.total_attribue_professeur||0) : 0;
    return a;
  },{total:0,iip:0,helb:0}), [data]);

  /* === Rendu d'une ligne de grille (cols paramétrable) === */
  function renderRow(row, cols) {
    const colSet = cols || COLS;
    const isHelb = row.contrat_mdp === 'HELB';
    const isZ = row.is_z === true;
    const rowBg = isZ ? 'text-gray-500 italic' : selected.has(row.id) ? 'bg-yellow-50/60' : (row.en_conge ? 'opacity-50 bg-gray-50' : '');
    // Ligne Z : synthétique (activités 7.3), non éditable, sans prof ni charge.
    if (isZ) {
      return (
        <tr key={row.id} className={rowBg} title="Activités Z : périodes étudiant, sans enseignant ni coût">
          {colSet.map(c => {
            const _textCols = ['nom_cours','ue_nom','activite_nom','professeur_id','section','code_cours']; const sty = { width:c.width, minWidth:c.width, maxWidth:c.width, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign: c.num ? 'right' : _textCols.includes(c.key) ? 'left' : 'center' };
            let v = '';
            if (c.key === 'section') v = row.section;
            else if (c.key === 'ue_num') v = row.ue_num;
            else if (c.key === 'ue_nom') v = row.ue_nom;
            else if (c.key === 'nom_cours') v = row.nom_cours;
            else if (c.key === 'type_cours') v = 'Z';
            else if (c.key === 'per_etudiant_total_dp') v = row.per_etudiant_total_dp;
            else if (c.key === 'periodes_attribuees' || c.key === 'autonomie_attribuee' || c.key === 'total_attribue_professeur') v = '0';
            return <td key={c.key} style={sty}>{v}</td>;
          })}
        </tr>
      );
    }
    return (
      <tr key={row.id} className={rowBg}>
        {colSet.map(c => {
          const _textCols = ['nom_cours','ue_nom','activite_nom','professeur_id','section','code_cours']; const sty = { width:c.width, minWidth:c.width, maxWidth:c.width, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign: c.num ? 'right' : _textCols.includes(c.key) ? 'left' : 'center' };
          const click = c.rowClickable ? ()=>setEditRow(row) : undefined;
          const cClass = c.rowClickable ? 'cursor-pointer hover:bg-iip-gold/5' : '';
          if (c.key==='__select') return <td key={c.key} className="text-center" style={sty}><input type="checkbox" checked={selected.has(row.id)} onChange={()=>toggleSelect(row.id)} className="cursor-pointer"/></td>;
          if (c.key==='__actions') return <td key={c.key} className="text-center" style={sty}><button onClick={()=>deleteRow(row.id)} className="text-red-500 hover:text-red-700 text-sm" title="Supprimer"><IconTrash size={15}/></button></td>;
          if (c.key==='__conformite') return <td key={c.key} className="text-center" style={sty}>{c.render(null,row)}</td>;
          // Badge EXT/DOT sur la colonne professeur
          if (c.key === 'professeur_id') {
            const badge = extDot[row.id];
            const select = <select defaultValue={row.professeur_id??''} onClick={e=>e.stopPropagation()} className="bg-transparent border-0 outline-none w-full text-sm cursor-pointer focus:bg-yellow-50" onChange={e=>{const nid=e.target.value?Number(e.target.value):null;if(nid!==row.professeur_id)saveCell(row.id,'professeur_id',nid);}}><option value="">— Aucun —</option>{professeurs.map(p=><option key={p.id} value={p.id}>{p.nom_prenom}</option>)}</select>;
            return <td key={c.key} style={sty}>
              <div className="flex items-center gap-1">
                {verrous[row.id] && <span title={`Nomination définitive — ${verrous[row.id].periodes_nommees||''} pér. ${verrous[row.id].type_charge||''} · code FWB ${verrous[row.id].code_fwb||''} (attribution verrouillée)`} className="shrink-0 text-blue-600"><IconLock size={13}/></span>}
                {!verrous[row.id] && alertesCours[row.id] && <span title={`⚠ ${alertesCours[row.id].definitif} est engagé(e) à titre définitif sur ce cours (${alertesCours[row.id].periodes_nommees||''} pér. ${alertesCours[row.id].type_charge||''}, FWB ${alertesCours[row.id].code_fwb||''})`} className="shrink-0 cursor-help text-amber-600"><IconLockOpen size={13}/></span>}
                {!!row.remplace_attribution_id && <span title="Ligne de remplacement (titulaire en congé)" className="shrink-0 text-[9px] text-blue-600 font-bold">R</span>}
                {!!row.est_rt && <span title="Remise au travail (RT) — charge d'un définitif recasée ici" className="shrink-0 text-[9px] px-1 py-0 rounded font-bold text-orange-600 border border-red-500">RT</span>}
                {badge === 'EXT' && <span className="text-[9px] px-1 py-0 rounded font-bold bg-teal-100 text-teal-700 border border-teal-300 shrink-0" title="Couvert par l'enveloppe externe">EXT</span>}
                {badge === 'DOT' && <span className="text-[9px] px-1 py-0 rounded font-bold bg-orange-100 text-orange-700 border border-orange-300 shrink-0" title="Dépasse le plafond → dotation organique">DOT</span>}
                {badge === 'EXT+DOT' && <span className="text-[9px] px-1 py-0 rounded font-bold bg-purple-100 text-purple-700 border border-purple-300 shrink-0" title="Partiellement EXT, partiellement DOT">EXT+DOT</span>}
                <div className="flex-1 min-w-0">{select}</div>
                <button onClick={e=>{e.stopPropagation(); toggleConge(row);}} title={row.en_conge ? 'En congé — cliquer pour réactiver' : 'Mettre en congé (crée une ligne de remplacement)'} className={`shrink-0 text-[10px] font-bold px-1 py-0.5 rounded border ${row.en_conge ? 'bg-transparent text-red-600 border-red-500' : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-red-400 hover:text-red-500'}`}>C</button>
              </div>
              {!verrous[row.id] && alertesCours[row.id] && <div className="text-[10px] text-amber-600 leading-tight mt-0.5">⚠ définitif : {alertesCours[row.id].definitif}</div>}
            </td>;
          }
          // Colonne Type : pour les lignes HELB, badge cliquable CT (cours théoriques) ↔ TP (travaux pratiques)
          if (c.key==='type_cours' && row.contrat_mdp==='HELB') {
            const nat = row.helb_nature || 'CT';
            return <td key={c.key} style={sty} className="text-center">
              <button onClick={e=>{e.stopPropagation(); saveCell(row.id,'helb_nature', nat==='CT'?'TP':'CT');}}
                title={nat==='CT' ? 'Théorie (cliquer pour travaux pratiques)' : 'Travaux pratiques (cliquer pour théorie)'}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${nat==='TP' ? 'bg-cyan-50 text-cyan-700 border-cyan-300' : 'bg-indigo-50 text-indigo-700 border-indigo-300'}`}>
                {nat==='TP' ? 'TP' : 'TH'}
              </button>
            </td>;
          }
          const v = row[c.key]; const display = c.render ? c.render(v,row) : v;
          if (c.readonly) return <td key={c.key} style={sty} onClick={click} className={`${c.num?'num':''} bg-gray-100 text-gray-500 ${cClass}`} title={c.tooltip}>{v!=null?Number(v).toLocaleString('fr-BE',{maximumFractionDigits:2}):<span className="text-gray-300">—</span>}</td>;
          if (c.edit==='number') {
            // Pour Per. et Aut. : afficher la valeur prévue en gris (attribué/prévu)
            const prevuKey = c.key==='periodes_attribuees' ? 'cours_per_prevu'
                           : c.key==='autonomie_attribuee' ? 'ue_autonomie_prevu' : null;
            const prevu = prevuKey ? row[prevuKey] : null;
            return <td key={c.key} className={c.num?'num':''} style={sty}>
              <div className="flex items-center justify-end">
                <input type="text" inputMode="decimal" defaultValue={v??0} className="input-cell text-right no-spinner" style={{width: prevu!=null ? '2.75rem' : '100%'}} onClick={e=>e.stopPropagation()} onBlur={e=>{const val=e.target.value.replace(',','.');if(Number(val)!==Number(v))saveCell(row.id,c.key,val);}}/>
                {prevu!=null && <span className="text-gray-400 whitespace-nowrap" title={c.key==='periodes_attribuees'?'Périodes prévues':'Autonomie prévue'}>/{Number(prevu).toLocaleString('fr-BE',{maximumFractionDigits:2})}</span>}
              </div>
            </td>;
          }
          if (c.edit==='text') return <td key={c.key} style={sty}><input type="text" defaultValue={v??''} className="input-cell w-full text-center" onClick={e=>e.stopPropagation()} onBlur={e=>{if(e.target.value!==(v??''))saveCell(row.id,c.key,e.target.value);}}/></td>;
          if (c.key==='type_cours_helb') {
            if (row.contrat_mdp !== 'HELB') {
              // Non applicable hors HELB : cellule grisée, non éditable
              return <td key={c.key} style={sty} className="bg-gray-100 text-gray-300 text-center" title="Réservé au contrat HELB">—</td>;
            }
            return <td key={c.key} style={sty}><select defaultValue={v??''} onClick={e=>e.stopPropagation()} className="bg-transparent border-0 outline-none w-full text-sm cursor-pointer focus:bg-yellow-50" onChange={e=>{if(e.target.value!==(v??''))saveCell(row.id,c.key,e.target.value);}}>{c.options.map(([val,lbl])=><option key={val} value={val}>{lbl}</option>)}</select></td>;
          }
          if (c.key === 'contrat_mdp') {
            const isHelbContrat = v === 'HELB';
            const next = isHelbContrat ? 'IIP' : 'HELB';
            return <td key={c.key} style={sty}>
              <button
                onClick={e => { e.stopPropagation(); saveCell(row.id, 'contrat_mdp', next); }}
                title={`Payroll : ${v || '—'} (cliquer pour passer à ${next})`}
                className={`badge-interactive text-[11px] font-bold px-2 py-0.5 rounded border bg-transparent ${
                  isHelbContrat
                    ? 'border-pink-500 text-pink-600'
                    : 'border-[#1B2B4B] text-[#1B2B4B]'
                }`}>
                {v || '—'}
              </button>
            </td>;
          }
          if (c.edit==='select') return <td key={c.key} style={sty}><select defaultValue={v??''} onClick={e=>e.stopPropagation()} className="bg-transparent border-0 outline-none w-full text-sm cursor-pointer focus:bg-yellow-50" onChange={e=>{if(e.target.value!==(v??''))saveCell(row.id,c.key,e.target.value);}}>{c.options.map(([val,lbl])=><option key={val} value={val}>{lbl}</option>)}</select></td>;
          if (c.edit==='prof') return <td key={c.key} style={sty}><div className="flex items-center gap-1">{verrous[row.id] && <span title={`Nomination définitive — ${verrous[row.id].periodes_nommees||''} pér. ${verrous[row.id].type_charge||''} · code FWB ${verrous[row.id].code_fwb||''} (attribution verrouillée)`} className="flex-shrink-0">🔒</span>}{!verrous[row.id] && alertesCours[row.id] && <span title={`⚠ ${alertesCours[row.id].definitif} est engagé(e) à titre définitif sur ce cours (${alertesCours[row.id].periodes_nommees||''} pér. ${alertesCours[row.id].type_charge||''}, FWB ${alertesCours[row.id].code_fwb||''})`} className="flex-shrink-0 cursor-help">🔓</span>}{row.remplace_attribution_id && <span title="Ligne de remplacement (titulaire en congé)" className="flex-shrink-0 text-[9px] text-blue-600 font-bold">R</span>}<select defaultValue={row.professeur_id??''} onClick={e=>e.stopPropagation()} className="bg-transparent border-0 outline-none w-full text-sm cursor-pointer focus:bg-yellow-50" onChange={e=>{const nid=e.target.value?Number(e.target.value):null;if(nid!==row.professeur_id)saveCell(row.id,'professeur_id',nid);}}><option value="">— Aucun —</option>{professeurs.map(p=><option key={p.id} value={p.id}>{p.nom_prenom}</option>)}</select><button onClick={e=>{e.stopPropagation(); toggleConge(row);}} title={row.en_conge ? 'En congé — cliquer pour réactiver' : 'Mettre en congé (crée une ligne de remplacement)'} className={`flex-shrink-0 text-[10px] font-bold px-1 py-0.5 rounded border ${row.en_conge ? 'bg-transparent text-red-600 border-red-500' : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-red-400 hover:text-red-500'}`}>C</button></div>{!verrous[row.id] && alertesCours[row.id] && <div className="text-[10px] text-amber-600 leading-tight mt-0.5">⚠ définitif : {alertesCours[row.id].definitif}</div>}</td>;
          if (c.edit==='statut') {
            const isHelb = row.contrat_mdp === 'HELB';
            const statutOptions = c.options.map(([val, lbl]) => [val, (isHelb && val === 'EXP') ? 'PI' : lbl]);
            if (!row.professeur_id) return <td key={c.key} style={sty}><span className="text-gray-300">—</span></td>;
            const displayVal = (isHelb && v === 'EXP') ? 'PI' : v;
            const badgeCls = v === 'CC' ? 'badge-iip' : v === 'EXP' ? 'badge-exp' : '';
            return <td key={c.key} style={sty}>
              <div className="relative inline-flex justify-center w-full">
                {displayVal
                  ? <span className={`inline-flex items-center justify-center min-w-[2.2rem] h-6 px-1.5 rounded text-[10px] font-bold ${badgeCls}`}>{displayVal}</span>
                  : <span className="text-gray-300 text-xs">—</span>}
                <select defaultValue={v??''} onClick={e=>e.stopPropagation()}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                  onChange={async e=>{try{await api.updateProfStatut(row.professeur_id,e.target.value);load();}catch(err){alert(err.message);}}}>
                  {statutOptions.map(([val,lbl])=><option key={val} value={val}>{lbl}</option>)}
                </select>
              </div>
            </td>;
          }
          return <td key={c.key} className={`${c.num?'num':''} ${cClass}`} style={sty} onClick={click}>{c.num&&v!=null?Number(v).toLocaleString('fr-BE',{maximumFractionDigits:2}):display}</td>;
        })}
      </tr>
    );
  }

  /* === Stats helper === */
  function groupStats(rows) {
    const tPer = rows.reduce((s,r)=>s+(Number(r.periodes_attribuees)||0),0);
    const tAut = rows.reduce((s,r)=>s+(Number(r.autonomie_attribuee)||0),0);
    const nBad = rows.filter(r=>r.cours_conforme===0).length;
    const nConf = rows.filter(r=>r.cours_conforme===1).length;
    const nProf = new Set(rows.filter(r=>r.professeur_id).map(r=>r.professeur_id)).size;
    const nCours = new Set(rows.map(r=>r.code_cours)).size;
    return { tPer, tAut, nBad, nConf, nProf, nCours };
  }

  /* === Rendu d'un cours (niveau 3) === */
  function renderCours(ueKey, cg) {
    const key = 'cours:'+ueKey+'/'+cg.code_cours;
    const open = openUEs.has(key);
    const st = groupStats(cg.rows);
    const isZCours = cg.type_cours === 'Z';
    return (
      <div key={key} className="border-t border-gray-100">
        <button onClick={()=>toggle(key)} className={`w-full flex items-center gap-2 pl-10 pr-4 py-2 hover:bg-gray-100/60 transition text-left text-sm ${isZCours ? 'opacity-70' : ''}`}>
          <span className={`text-gray-400 text-sm transition-transform ${open?'rotate-90':''}`}>▶</span>
          <span className={`font-mono text-sm ${isZCours ? 'text-gray-400' : 'text-gray-500'}`}>{cg.code_cours}</span>
          <span className={`truncate flex-1 ${isZCours ? 'text-gray-400 italic' : 'text-gray-700'}`}>{cg.nom_cours}</span>
          {cg.type_cours && <span className={`text-xs px-1.5 py-0.5 rounded ${isZCours ? 'bg-gray-100 text-gray-400' : cg.type_cours==='CT'?'bg-blue-100 text-blue-700':'bg-purple-100 text-purple-700'}`}>{cg.type_cours}</span>}
          {isZCours
            ? <span className="text-xs text-gray-400 italic">périodes étudiants — sans prof</span>
            : <>
                <span className="text-sm text-gray-500">{cg.rows.length} attr.</span>
                <span className="text-sm font-semibold text-iip-gold">{st.tPer}p</span>
                {st.tAut>0 && <span className="text-sm text-gray-400">+{st.tAut}a</span>}
                {st.nBad>0 ? <span className="text-sm text-red-600 font-bold">✗</span> : st.nConf>0 ? <span className="text-sm text-green-600 font-bold">✓</span> : null}
              </>
          }
        </button>
        {open && (
          <div className="overflow-auto max-h-[40vh] border-t border-gray-100 bg-white">
            <table className="grid-excel-soft" style={{tableLayout:'fixed'}}>
              <thead><tr>
                {COLS_COURS.map(c => c.key==='__select'
                  ? <th key={c.key} style={{width:c.width,minWidth:c.width,maxWidth:c.width}}>
                      <input type="checkbox"
                        checked={cg.rows.filter(r=>!r.is_z).length>0&&cg.rows.filter(r=>!r.is_z).every(r=>selected.has(r.id))}
                        onChange={()=>{const real=cg.rows.filter(r=>!r.is_z);const all=real.every(r=>selected.has(r.id));setSelected(s=>{const n=new Set(s);real.forEach(r=>all?n.delete(r.id):n.add(r.id));return n;});}}
                        className="cursor-pointer"/>
                    </th>
                  : <ResizableHeader key={c.key} col={c} sortKey={sortBy.key} sortDir={sortBy.dir} onSort={toggleSort} onResize={setColWidth}>{c.label}</ResizableHeader>
                )}
              </tr></thead>
              <tbody>{cg.rows.map(r => renderRow(r, COLS_COURS))}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* === Rendu d'un accordéon UE (niveau 2) === */
  function renderUE(sec, ue) {
    const org = ue.num_organisation || 1;
    const ueKey = sec+'/'+ue.ue_num+'/'+org;
    const key = 'ue:'+ueKey;
    const open = openUEs.has(key);
    const st = groupStats(ue.rows);
    const isHelb = ue.ue_et_ref === 'HELB';
    return (
      <div key={key} className={`overflow-hidden transition-all ${
        activeUE === key
          ? (isHelb
              ? 'border-2 border-pink-400 rounded-sm shadow-sm mb-0.5'
              : 'border-2 border-iip-gold/60 rounded-sm shadow-sm mb-0.5')
          : (isHelb
              ? 'border-b border-gray-100 border-l-2 border-l-pink-400'
              : 'border-b border-gray-100')
      }`}>
        <div className={`w-full flex items-center pl-6 pr-3 py-1.5 transition relative ${activeUE === key ? (isHelb ? 'bg-pink-50 hover:bg-pink-100/70' : 'bg-iip-gold/5 hover:bg-iip-gold/10') : (isHelb ? 'hover:bg-pink-100/60' : 'hover:bg-gray-50')}`}>
          <div onClick={()=>{toggle(key); setActiveUE(key);}} role="button" className="grid items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                  style={{ gridTemplateColumns: '16px 70px 110px 1fr auto' }}>
            <span className={`text-iip-gold text-sm transition-transform ${open?'rotate-90':''}`}>▶</span>
            <span className="font-semibold text-iip-gold text-sm whitespace-nowrap">UE {ue.ue_num}</span>
            <span className="flex items-center gap-1 flex-wrap">
              {org > 1 && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">Org. {org}</span>}
              {ue.bloc && <span className="text-xs bg-iip-gold/10 text-iip-gold px-1.5 py-0.5 rounded">{ue.bloc}</span>}
              {isHelb && <span className="text-xs text-pink-600 font-bold px-1.5 py-0.5 rounded bg-pink-100">HELB</span>}
              <span className="relative inline-block" onClick={e=>e.stopPropagation()}>
                <button onClick={()=>setQuadriMenu(quadriMenu===key?null:key)}
                  title="Quadrimestre de l'UE (cliquer pour modifier)"
                  className={`text-xs px-1.5 py-0.5 rounded font-semibold cursor-pointer hover:ring-1 hover:ring-gray-300 ${quadriStyle(ue.ue_quad)}`}>
                  {ue.ue_quad || '— Q'}
                </button>
                {quadriMenu===key && (
                  <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-28">
                    {[['','—'],['Q1','Q1'],['Q2','Q2'],['Q1/Q2','Q1/Q2']].map(([val,lbl])=>(
                      <button key={val} onClick={()=>changeQuadri(ue, sec, org, val)}
                        className="w-full text-left px-3 py-1 text-sm hover:bg-iip-gold/10">{lbl}</button>
                    ))}
                  </div>
                )}
              </span>
            </span>
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-gray-600 truncate" title={ue.ue_nom}>{ue.ue_nom || 'UE sans nom'}</span>
              {autAnalyse[String(ue.ue_num)] && (() => {
                const a = autAnalyse[String(ue.ue_num)];
                if (a.ok) {
                  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium flex-shrink-0" title={`Autonomie ${a.aut_attribuee} dans l'intervalle [${a.min} ; ${a.max}]`}>✓ aut.</span>;
                }
                const msg = a.multiple_obligatoire
                  ? `Tous dédoublés ×${a.multiple_obligatoire} → autonomie doit être ${a.attendu} (actuel ${a.aut_attribuee})`
                  : a.depasse_max
                    ? `Autonomie ${a.aut_attribuee} > max ${a.max} → utiliser EPT ligne 96`
                    : `Autonomie ${a.aut_attribuee} hors intervalle [${a.min} ; ${a.max}]`;
                return <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium flex-shrink-0" title={msg}>⚠ aut. {a.aut_attribuee}/[{a.min}–{a.max}]</span>;
              })()}
            </span>
            <span className="flex items-center gap-3 text-sm text-gray-500 flex-shrink-0 justify-end whitespace-nowrap">
              <span>{ue.rows.length} attr.</span>
              <span>{st.nCours} cours</span>
              <span>{st.nProf} prof.</span>
              <span className="font-semibold text-iip-gold w-12 text-right">{st.tPer}p</span>
              {st.tAut>0 ? <span className="text-gray-400 w-10 text-right">+{st.tAut}a</span> : <span className="w-10"></span>}
              {st.nBad>0 ? <span className="text-red-600 font-bold w-8 text-right">✗ {st.nBad}</span>
                : st.nConf>0 ? <span className="text-green-600 font-bold w-8 text-right">✓</span>
                : <span className="w-8"></span>}
            </span>
          </div>
          {/* Bouton dédoubler/annuler tous les cours de l'UE en un clic (demande Nicolas) */}
          <button onClick={async (e)=>{
                    e.stopPropagation();
                    try {
                      const r = await api.dedoublerUE(ue.ue_num);
                      load();
                    } catch(err) { alert('Erreur : ' + err.message); }
                  }}
                  title="Dédoubler tous les cours de cette UE (×2)"
                  className="flex-shrink-0 ml-2 px-2 h-7 flex items-center justify-center rounded-full text-xs font-bold transition bg-gray-100 text-gray-500 hover:bg-amber-100 hover:text-amber-700">
                  ×2
          </button>
          {/* Bouton Réouvrir : crée une nouvelle organisation */}
          <button onClick={(e)=>{e.stopPropagation(); reouvrirUE(ue, sec);}}
                  title="Réouvrir cette UE (nouvelle organisation)"
                  className="flex-shrink-0 ml-2 w-7 h-7 flex items-center justify-center rounded-full bg-iip-mauve/10 hover:bg-iip-mauve hover:text-white text-iip-mauve transition" style={{fontSize:'0.9rem'}}>⧉</button>
          {/* Bouton + : ajouter une ligne / un cours */}
          <button onClick={(e)=>{e.stopPropagation(); if(addMenuUE?.key===key){setAddMenuUE(null);}else{const r=e.currentTarget.getBoundingClientRect();setMenuPos({top:r.bottom+4,right:window.innerWidth-r.right});setAddMenuUE({key,ue,sec,org});setCoursManquants([]);fetch(`/api/attributions/cours-manquants?annee=${encodeURIComponent(getAnnee())}&ue_num=${ue.ue_num}&section=${encodeURIComponent(sec)}`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}}).then(r=>r.json()).then(d=>setCoursManquants(Array.isArray(d)?d:[])).catch(()=>{});}}}
                  title="Ajouter une attribution"
                  className="flex-shrink-0 ml-2 w-7 h-7 flex items-center justify-center rounded-full bg-iip-gold/10 hover:bg-iip-gold hover:text-white text-iip-gold font-bold transition">+</button>
          {addMenuUE?.key===key && (
            <div className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-64"
              style={{top: menuPos.top, right: menuPos.right}}
              onClick={e=>e.stopPropagation()}>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100">Ajouter dans l'UE {ue.ue_num}</div>
              {ue.cours.filter(cg => cg.type_cours !== 'Z').map(cg => (
                <button key={cg.code_cours} onClick={()=>{ setEditRow({section: sec, code_cours: cg.code_cours}); setAddMenuUE(null); }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-iip-gold/10 flex items-center gap-2">
                  <span className="text-iip-gold">＋</span>
                  <span className="truncate">Ligne sur <b>{cg.code_cours}</b> — {cg.nom_cours}</span>
                </button>
              ))}
              {/* Cours du référentiel (DP) sans aucune ligne d'attribution — re-créables */}
              {coursManquants.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-xs font-semibold text-amber-600 border-t border-gray-100 bg-amber-50">Cours du DP sans ligne (à rétablir)</div>
                  {coursManquants.map(cm => (
                    <button key={cm.cours_code} onClick={async ()=>{
                        try {
                          await api.creerLigneDepuisCours(cm.cours_code, cm.ue_num, cm.section);
                          setAddMenuUE(null);
                          load();
                        } catch(err){ alert('Erreur : ' + err.message); }
                      }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-amber-100 flex items-center gap-2">
                      <span className="text-amber-600">↻</span>
                      <span className="truncate">Rétablir <b>{cm.cours_code}</b> — {cm.cours_nom} <span className="text-gray-400">({cm.cours_per}p {cm.ct_pp})</span></span>
                    </button>
                  ))}
                </>
              )}
              <button onClick={()=>{ setNewCoursForm({section: sec, ue_num: ue.ue_num, ue_nom: ue.ue_nom, num_organisation: org}); setAddMenuUE(null); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-iip-mauve/10 text-iip-mauve border-t border-gray-100 flex items-center gap-2">
                <span>＋</span><span>Nouveau cours dans cette UE</span>
              </button>
              <button onClick={()=>{ setEptModal({section: sec, ue_num: ue.ue_num, ue_nom: ue.ue_nom}); setAddMenuUE(null); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 text-blue-700 border-t border-gray-100 flex items-center gap-2">
                <IconClipboardText size={15}/><span>Lignes EPT (95-99)</span>
              </button>
              <button onClick={()=>{ setOrgModal({section: sec, ue_num: ue.ue_num, ue_nom: ue.ue_nom}); setAddMenuUE(null); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-teal-50 text-teal-700 border-t border-gray-100 flex items-center gap-2">
                <IconCalendar size={15}/><span>Organisations (Doc A)</span>
              </button>
              <button onClick={()=>{ setDoc23Modal({section: sec, ue_num: ue.ue_num, ue_nom: ue.ue_nom}); setAddMenuUE(null); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-purple-50 text-purple-700 border-t border-gray-100 flex items-center gap-2">
                <IconFileText size={15}/><span>DOC2 / DOC3</span>
              </button>
            </div>
          )}
        </div>
        {open && (
          <div className={activeUE === key ? (isHelb ? 'bg-pink-50/60' : 'bg-iip-gold/5') : (isHelb ? 'bg-pink-50/40' : 'bg-gray-50/50')}>
            {ue.cours.map(cg => renderCours(ueKey, cg))}
          </div>
        )}
      </div>
    );
  }

  /* === Rendu d'un accordéon Section (niveau 1) === */
  function renderSection(sg) {
    const key = 'sec:'+sg.section;
    const open = openUEs.has(key);
    const st = groupStats(sg.rows);
    return (
      <div key={key}>
        <button onClick={()=>toggle(key)} className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-iip-gold/10 transition text-left bg-iip-gold/5 first:border-t-0 ${open ? 'border-t-2 border-iip-gold/60' : 'border-t border-gray-200'}`}>
          <span className={`text-iip-gold font-bold transition-transform ${open?'rotate-90':''}`}>▶</span>
          <span className="font-bold text-iip-gold text-sm">{sg.section}</span>
          <div className="flex items-center gap-3 text-sm text-gray-500 flex-shrink-0 ml-auto">
            <span>{sg.ues.length} UE</span>
            <span>{sg.rows.length} attr.</span>
            <span>{st.nCours} cours</span>
            <span>{st.nProf} prof.</span>
            <span className="font-bold text-iip-gold">{st.tPer}p</span>
            {st.tAut>0 && <span className="text-gray-400">+{st.tAut}a</span>}
            {st.nBad>0 && <span className="text-red-600 font-bold">✗ {st.nBad}</span>}
            {st.nBad===0 && st.nConf>0 && <span className="text-green-600 font-bold">✓</span>}
            {isAdmin && (
              <span className="flex items-center gap-1 flex-shrink-0" onClick={e=>e.stopPropagation()}>
                <button onClick={()=>autoFillSection(sg.section)}
                  className="text-iip-gold hover:text-iip-amber" title="Remplir automatiquement les périodes prof"><IconWand size={16}/></button>
                <button onClick={()=>genererRapport(sg.section)}
                  className="text-gray-400 hover:text-iip-mauve" title="Rapport d'attributions (HTML/impression)"><IconFileText size={16}/></button>
                <button onClick={()=>genererExcel(sg.section)}
                  className="text-gray-400 hover:text-green-600" title="Exporter en Excel (.xlsx)"><IconFileSpreadsheet size={16}/></button>
                <button onClick={()=>ouvrirSuppressionSection(sg.section)}
                  className="text-orange-400 hover:text-red-600" title="Supprimer toutes les attributions de cette section (avec sauvegarde)"><IconEraser size={16}/></button>
                <button onClick={()=>delSection(sg.section)}
                  className="text-red-400 hover:text-red-600" title="Retirer cette section de la vue"><IconTrash size={16}/></button>
              </span>
            )}
          </div>
        </button>
        {open && (
          <div>
            {sg.ues.map(ue => renderUE(sg.section, ue))}
          </div>
        )}
      </div>
    );
  }

  // ===================== RENDU =====================
  return (
    <div className="p-2 md:p-4 max-w-7xl mx-auto">
      {/* (bandeau perte de charge déplacé en bas de page) */}

      {/* Barre mobile */}
      <div className="md:hidden mb-2 flex gap-2">
        <input value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})} onKeyDown={e=>e.key==='Enter'&&applyFilters()} placeholder="Rechercher…" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
        <button onClick={mobileCollapseAll} title="Tout replier" className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium">⊟</button>
        <button onClick={mobileExpandAll} title="Tout déplier" className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium">⊞</button>
        <button onClick={()=>setFiltersOpenMobile(o=>!o)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium">{filtersOpenMobile ? <IconX size={16}/> : <IconSettings size={16}/>}</button>
      </div>

      {/* Filtres */}
      <div className={`bg-white rounded-lg border border-gray-200 p-3 mb-3 flex flex-wrap items-end gap-2 ${filtersOpenMobile?'':'hidden md:flex'}`}>
        <div><label className="block text-xs text-gray-600 mb-0.5">Section</label>
          <select value={filters.section} onChange={e=>{const f={...filters,section:e.target.value};setFilters(f);load(f);}} className="border border-gray-300 rounded px-2 py-1 text-sm"><option value="">— Toutes —</option>{sections.map(s=><option key={s.code} value={s.code}>{s.code}</option>)}</select></div>
        <div><label className="block text-xs text-gray-600 mb-0.5">UE</label>
          <select value={filters.ue_num} onChange={e=>{const f={...filters,ue_num:e.target.value};setFilters(f);load(f);}} className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[180px]"><option value="">— Toutes —</option>{ueList.map(([n,nom])=><option key={n} value={n}>UE {n} — {nom}</option>)}</select></div>
        <div><label className="block text-xs text-gray-600 mb-0.5">Professeur</label>
          <select value={filters.prof_id} onChange={e=>{const f={...filters,prof_id:e.target.value};setFilters(f);load(f);}} className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[200px]"><option value="">— Tous —</option>{professeurs.map(p=><option key={p.id} value={p.id}>{p.nom_prenom}</option>)}</select></div>
        <div><label className="block text-xs text-gray-600 mb-0.5">Contrat</label>
          <select value={filters.contrat} onChange={e=>{const f={...filters,contrat:e.target.value};setFilters(f);load(f);}} className="border border-gray-300 rounded px-2 py-1 text-sm"><option value="">—</option><option value="IIP">IIP</option><option value="HELB">HELB</option></select></div>
        <div><label className="block text-xs text-gray-600 mb-0.5">Type</label>
          <select value={filters.type_cours} onChange={e=>{const f={...filters,type_cours:e.target.value};setFilters(f);load(f);}} className="border border-gray-300 rounded px-2 py-1 text-sm"><option value="">—</option><option value="CT">CT</option><option value="PP">PP</option></select></div>
        <div className="flex-1"><label className="block text-xs text-gray-600 mb-0.5">Recherche libre</label>
          <input value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})} onKeyDown={e=>e.key==='Enter'&&applyFilters()} placeholder="UE, cours, professeur..." className="border border-gray-300 rounded px-2 py-1 text-sm w-full"/></div>
        <button onClick={applyFilters} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-1.5 rounded">Filtrer</button>
        <button onClick={resetFilters} className="text-gray-600 hover:text-iip-orange text-sm px-2 py-1.5">Réinitialiser</button>
      </div>

      {/* Barre d'actions desktop */}
      <div className="hidden md:flex items-center gap-2 mb-3 flex-wrap">
        <div className="bg-white border border-gray-200 rounded-lg flex overflow-hidden text-sm mr-2">
          <button onClick={()=>setViewMode('ue')} className={`px-3 py-1.5 font-medium transition ${viewMode==='ue'?'bg-iip-gold text-white':'text-gray-600 hover:bg-gray-50'}`}><span className="inline-flex items-center gap-1.5"><IconFolder size={15}/>Par section</span></button>
          <button onClick={()=>setViewMode('flat')} className={`px-3 py-1.5 font-medium transition ${viewMode==='flat'?'bg-iip-gold text-white':'text-gray-600 hover:bg-gray-50'}`}><span className="inline-flex items-center gap-1.5"><IconClipboardText size={15}/>Vue complète</span></button>
        </div>
        {viewMode==='ue' && <div className="flex gap-1 text-xs mr-2">
          <button onClick={expandAll} className="text-gray-500 hover:text-iip-gold px-2 py-1">Tout déplier</button>
          <button onClick={collapseAll} className="text-gray-500 hover:text-iip-gold px-2 py-1">Tout replier</button>
        </div>}
        <span className="bg-white rounded px-3 py-1 border border-gray-200 text-sm">
          <b>{data.length}</b> attr. · {sectionGroups.length} sect. · {totalUECount} UE · <b>{stats.total.toLocaleString('fr-BE')}</b> per.
          · IIP <b className="text-iip-gold">{stats.iip.toLocaleString('fr-BE')}</b>
          · HELB <b className="text-iip-mauve">{stats.helb.toLocaleString('fr-BE')}</b>
        </span>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button onClick={()=>setShowForm(true)} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-3 py-1.5 rounded font-medium"><span className="inline-flex items-center gap-1.5"><IconPlus size={15}/>Nouvelle</span></button>
          <button onClick={()=>setShowBulkCreate(true)} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-3 py-1.5 rounded font-medium" title="Créer les attributions d'une section"><span className="inline-flex items-center gap-1.5"><IconPlus size={15}/>Créer une section</span></button>
          <button onClick={()=>setShowCopierSection(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-1.5 rounded font-medium" title="Copier les attributions d'une section vers une autre année"><span className="inline-flex items-center gap-1.5"><IconClipboardText size={15}/>Copier section</span></button>
          <button onClick={()=>api.exportExcel()} className="bg-iip-mauve hover:opacity-90 text-white text-sm px-3 py-1.5 rounded font-medium"><span className="inline-flex items-center gap-1.5"><IconFileImport size={15}/>Export</span></button>
          {isAdmin && <>
            {selected.size>0 && <button onClick={()=>openBulkModal('selection')} className="bg-iip-orange hover:opacity-90 text-white text-sm px-3 py-1.5 rounded font-medium"><span className="inline-flex items-center gap-1.5"><IconTrash size={15}/>Sélection ({selected.size})</span></button>}
            <button onClick={()=>openBulkModal('filtered')} className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded font-medium"><span className="inline-flex items-center gap-1.5"><IconTrash size={15}/>Suppr. filtre</span></button>
            <button onClick={()=>openBulkModal('all')} className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1.5 rounded font-medium"><span className="inline-flex items-center gap-1.5"><IconTrash size={15}/>Tout supprimer</span></button>
            <button onClick={reimportExcel} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded font-medium"><span className="inline-flex items-center gap-1.5"><IconRefresh size={15}/>Réimporter</span></button>
          </>}
        </div>
      </div>

      {/* VUE PAR SECTION/UE/COURS — tableau unique continu */}
      {viewMode==='ue' && <div className="hidden md:block">
        {loading ? <div className="p-8 text-center text-gray-400">Chargement…</div>
         : sectionGroups.length===0 ? <div className="p-8 text-center text-gray-400 bg-white rounded-lg border">Aucune attribution</div>
         : <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
             {sectionGroups.map(renderSection)}
           </div>}
      </div>}

      {/* VUE COMPLÈTE */}
      {viewMode==='flat' && <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-auto max-h-[calc(100vh-260px)]">
        {loading ? <div className="p-8 text-center text-gray-400">Chargement…</div> : (
          <table className="grid-excel-soft" style={{tableLayout:'fixed'}}>
            <thead><tr>
              {COLS.map(c => c.key==='__select'
                ? <th key={c.key} style={{width:c.width,minWidth:c.width,maxWidth:c.width}}><input type="checkbox" checked={selected.size>0&&selected.size===sortedData.length} onChange={toggleSelectAll} className="cursor-pointer"/></th>
                : <ResizableHeader key={c.key} col={c} sortKey={sortBy.key} sortDir={sortBy.dir} onSort={toggleSort} onResize={setColWidth}>{c.label}</ResizableHeader>
              )}
            </tr></thead>
            <tbody>{sortedData.map(r => renderRow(r, COLS))}</tbody>
          </table>
        )}
      </div>}

      {/* VUE MOBILE */}
      <div className="md:hidden">
        {loading ? <div className="p-8 text-center text-gray-400">Chargement…</div>
         : sortedData.length===0 ? <div className="p-8 text-center text-gray-400 bg-white rounded-lg border">Aucune attribution</div>
         : <div className="pb-24 space-y-4">
             {sectionGroups.map(sg => {
               const secKey = 'mobsec:' + sg.section;
               const closed = openUEs.has(secKey); // présent = replié
               return (
               <div key={sg.section}>
                 <button onClick={() => toggle(secKey)}
                   className="w-full sticky top-0 z-10 bg-iip-gold text-white px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-between gap-2">
                   <span className="flex items-center gap-2">
                     <span className={`transition-transform ${closed ? '' : 'rotate-90'}`}>▶</span>
                     {sg.section}
                   </span>
                   <span className="text-xs font-normal opacity-90">{sg.rows.length} attr. · {sg.rows.reduce((s,r)=>s+(Number(r.periodes_attribuees)||0),0)}p</span>
                 </button>
                 {!closed && (
                   <div className="space-y-2 mt-2">
                     {sg.rows.map(row=><AttributionCard key={row.id} row={row} selected={selected.has(row.id)} onToggleSelect={toggleSelect} onChange={load} onDelete={deleteRow} isAdmin={isAdmin} professeurs={professeurs} activites={activitesList}/>)}
                   </div>
                 )}
               </div>
               );
             })}
           </div>}
      </div>

      {/* FAB mobile */}
      <button onClick={()=>setShowForm(true)} className="md:hidden fixed bottom-6 right-6 bg-iip-gold hover:bg-iip-amber text-white rounded-full w-14 h-14 shadow-2xl flex items-center justify-center text-3xl z-30">+</button>

      {/* Overlay pour fermer le menu + */}
      {addMenuUE && <div className="fixed inset-0 z-20" onClick={()=>setAddMenuUE(null)} />}
      {confirmDeleteSection && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-semibold text-gray-800">Retirer la section</h3>
            <p className="text-sm text-gray-600">
              Retirer la section <strong>{confirmDeleteSection}</strong> de la vue des attributions pour cette année ?
              Le référentiel (UE et cours) n'est pas touché. La section réapparaîtra automatiquement
              dès que tu y crées des attributions.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteSection(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
              <button onClick={() => delSectionConfirmed(confirmDeleteSection)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
      {quadriMenu && <div className="fixed inset-0 z-30" onClick={()=>setQuadriMenu(null)} />}

      {/* Modales */}
      {showForm && <AttributionForm onClose={()=>setShowForm(false)} onCreated={load}/>}
      {newCoursForm && <CoursFormModal cours={{}} ueNum={newCoursForm.ue_num} section={newCoursForm.section}
        onClose={()=>setNewCoursForm(null)}
        onSaved={(code)=>{ const sec=newCoursForm.section; setNewCoursForm(null); load(); setEditRow({section: sec, code_cours: code}); }}/>}
      {showBulkCreate && <BulkCreateForm onClose={()=>setShowBulkCreate(false)} onCreated={load}/>}
      {showCopierSection && <CopierSectionModal sections={sections} anneeActive={getAnnee()} isAdmin={isAdmin} onClose={()=>setShowCopierSection(false)} onCopied={load}/>}
      {confirmViderSection && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">⚠️ Supprimer toutes les attributions</h3>
            <p className="text-sm text-gray-600">
              Supprimer <strong>toutes les attributions</strong> de la section <strong>{confirmViderSection}</strong> pour l'année <strong>{getAnnee()}</strong> ?
            </p>
            <p className="text-xs text-red-600 font-medium">Cette action est irréversible. Le référentiel (UE, cours) n'est pas touché.</p>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setConfirmViderSection(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">Annuler</button>
              <button onClick={() => viderSectionConfirmed(confirmViderSection)}
                className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded font-semibold">
                Supprimer toutes les attributions
              </button>
            </div>
          </div>
        </div>
      )}
      {eptModal && <EptModal {...eptModal} annee={getAnnee()} onClose={() => { setEptModal(null); load(); }} />}
      {orgModal && <OrganisationUEModal {...orgModal} annee={getAnnee()} onClose={() => setOrgModal(null)} />}
      {doc23Modal && <Doc23Modal {...doc23Modal} annee={getAnnee()} onClose={() => setDoc23Modal(null)} />}
      {rapportHtml && <PreviewModal html={rapportHtml.html || rapportHtml} titre="Rapport d'attributions" nomFichier={rapportHtml.nom} onClose={() => setRapportHtml(null)} />}
      {editRow && <CoursEditModal section={editRow.section} codeCours={editRow.code_cours} onClose={()=>setEditRow(null)} onChanged={load}/>}

      {secDel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40" onClick={e=>e.target===e.currentTarget&&setSecDel(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border-t-4 border-red-600 flex flex-col" style={{maxHeight:'85vh'}}>
            <h2 className="text-xl font-title text-red-700 mb-2">⚠️ Tout supprimer — section {secDel.section}</h2>
            <p className="text-sm text-gray-700 mb-2">
              Vous allez supprimer <b className="text-red-600">{secDel.count} attribution(s)</b> de la section <b>{secDel.section}</b> pour {getAnnee()}.
              La section et les cours restent dans le référentiel ; seules les attributions sont effacées.
            </p>
            <p className="text-xs text-gray-500 mb-2">Une <b>copie de sauvegarde</b> de la base est créée automatiquement juste avant. Action <b>irréversible</b> sans restauration de cette copie.</p>
            <div className="border border-gray-200 rounded-lg overflow-auto mb-3 flex-1" style={{minHeight:'80px'}}>
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 sticky top-0"><tr>
                  <th className="text-left px-2 py-1 text-gray-500">UE</th>
                  <th className="text-left px-2 py-1 text-gray-500">Cours</th>
                  <th className="text-left px-2 py-1 text-gray-500">Prof</th>
                  <th className="text-right px-2 py-1 text-gray-500">Pér.</th>
                </tr></thead>
                <tbody>
                  {secDel.lignes.map(l => (
                    <tr key={l.id} className="border-t border-gray-100">
                      <td className="px-2 py-1 text-gray-600">{l.ue_num} · {l.code_cours}</td>
                      <td className="px-2 py-1 text-gray-700 truncate max-w-[160px]">{l.cours_nom || '—'}</td>
                      <td className="px-2 py-1 text-gray-600">{l.prof_prenom || ''} {l.prof_nom || '—'}</td>
                      <td className="px-2 py-1 text-right text-gray-600">{(l.per||0)+(l.aut||0)}</td>
                    </tr>
                  ))}
                  {secDel.count===0 && <tr><td colSpan={4} className="px-2 py-3 text-center text-gray-400">Aucune attribution.</td></tr>}
                </tbody>
              </table>
            </div>
            <label className="block text-xs text-gray-600 mb-1">Tapez le nom de la section <code className="bg-gray-100 px-1 rounded font-mono">{secDel.section}</code> pour confirmer :</label>
            <input value={secDelText} onChange={e=>setSecDelText(e.target.value)} autoFocus className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono mb-4" placeholder={secDel.section}/>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setSecDel(null)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
              <button onClick={confirmSuppressionSection} disabled={secDelText!==secDel.section || secDel.count===0 || secDelBusy}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-30 text-white text-sm px-5 py-2 rounded font-medium">
                {secDelBusy ? 'Suppression…' : `Supprimer ${secDel.count} attribution(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40" onClick={e=>e.target===e.currentTarget&&setBulkDeleteModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border-t-4 border-red-600">
            <h2 className="text-xl font-title text-red-700 mb-3">⚠️ Suppression en masse</h2>
            <p className="text-sm text-gray-700 mb-4">
              {bulkDeleteModal==='selection'&&<>Supprimer <b>{bulkPreview?.count??'…'}</b> attribution(s) sélectionnée(s) ?</>}
              {bulkDeleteModal==='filtered'&&<>Supprimer <b>{bulkPreview?.count??'…'}</b> attribution(s) correspondant aux filtres ?</>}
              {bulkDeleteModal==='all'&&<>Supprimer <b className="text-red-600">TOUTES les {bulkPreview?.count??'…'} attributions</b> ?</>}
            </p>
            <p className="text-xs text-gray-500 mb-3">Planning supprimé en cascade. <b>Irréversible.</b></p>
            <label className="block text-xs text-gray-600 mb-1">Tapez <code className="bg-gray-100 px-1 rounded font-mono">SUPPRIMER</code> :</label>
            <input value={bulkConfirmText} onChange={e=>setBulkConfirmText(e.target.value)} autoFocus className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono mb-4" placeholder="SUPPRIMER"/>
            <div className="flex justify-end gap-2">
              <button onClick={()=>setBulkDeleteModal(null)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
              <button onClick={confirmBulkDelete} disabled={bulkConfirmText!=='SUPPRIMER'} className="bg-red-600 hover:bg-red-700 disabled:opacity-30 text-white text-sm px-5 py-2 rounded font-medium">Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {/* Bandeau : profs définitifs en perte de charge (ETP global, en bas) */}
      {pertesCharge.length > 0 && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-1.5">
            ⚠ {pertesCharge.length} engagement(s) à titre définitif en perte de charge
          </div>
          <p className="text-[12px] text-red-600 mb-2">
            L'équivalent ETP de l'engagement définitif n'est pas couvert. Cochez des attributions comme remise au travail (RT) dans la fiche du prof, ou attribuez-leur de nouveaux cours.
          </p>
          <div className="space-y-1">
            {pertesCharge.map(p => (
              <div key={p.professeur_id} className="flex items-center justify-between bg-white rounded px-2.5 py-1.5 text-[12px]">
                <span className="text-gray-700"><strong>{p.prof}</strong></span>
                <span className="text-red-600 font-semibold whitespace-nowrap ml-2">
                  manque {p.etp_manque} ETP (~{p.equiv_periodes_ct} pér. CT)
                  <span className="text-gray-400 font-normal"> · nommé {p.etp_nomme} / couvert {p.etp_couvert}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

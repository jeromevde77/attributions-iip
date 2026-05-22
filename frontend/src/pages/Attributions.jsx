import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api.js';
import AttributionForm from '../components/AttributionForm.jsx';
import BulkCreateForm from '../components/BulkCreateForm.jsx';
import AttributionCard from '../components/AttributionCard.jsx';
import ResizableHeader from '../components/ResizableHeader.jsx';
import CoursEditModal from '../components/CoursEditModal.jsx';

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
  { key: 'contrat_mdp',           label: 'Contrat',    width: 110, edit: 'select',
    options: [['','—'],['IIP','IIP'],['HELB','HELB']],
    render: v => v === 'IIP' ? <span className="badge badge-iip">IIP</span> : v === 'HELB' ? <span className="badge badge-helb">HELB</span> : v },
  { key: 'ue_num',                label: 'UE',         width: 70,  num: true, rowClickable: true, flatOnly: true },
  { key: 'ue_nom',                label: "Nom de l'UE",width: 280, rowClickable: true, flatOnly: true },
  { key: 'bloc',                  label: 'Bloc',       width: 70,  rowClickable: true, flatOnly: true },
  { key: 'num_organisation',      label: 'Org.',       width: 60,  num: true, edit: 'select', flatOnly: true,
    options: [['1','1'],['2','2'],['3','3'],['4','4']],
    render: v => v && v > 1 ? <span className="bg-amber-100 text-amber-800 text-xs px-1.5 py-0.5 rounded font-semibold">{v}</span> : <span className="text-gray-400">{v || 1}</span> },
  { key: 'quadrimestre_attribue', label: 'Quadri',     width: 110, edit: 'select',
    options: [['','—'],['Q1','Q1'],['Q2','Q2'],['Q1/Q2','Q1/Q2']] },
  { key: 'code_cours',            label: 'Code',       width: 80,  rowClickable: true, coursOnly: true },
  { key: 'nom_cours',             label: 'Cours',      width: 240, rowClickable: true, coursOnly: true },
  { key: 'activite_nom',          label: 'Activité',   width: 130, rowClickable: true,
    render: v => v || <span className="text-gray-300 text-xs italic">—</span> },
  { key: 'type_cours',            label: 'Type',       width: 70, rowClickable: true,
    render: v => v === 'CT' ? <span className="badge badge-ct">CT</span> : v === 'PP' ? <span className="badge badge-pp">PP</span> : v },
  { key: 'code',                  label: 'Gr.',        width: 70, edit: 'text' },
  { key: 'professeur_id',         label: 'Professeur', width: 220, edit: 'prof',
    render: (_, row) => row.professeur || <span className="italic text-orange-500">—</span> },
  { key: 'contrat',               label: 'Stat.',      width: 90, edit: 'statut',
    options: [['','—'],['CC','CC'],['EXP','EXP']] },
  { key: 'type_cours_helb',       label: 'HELB',       width: 90, edit: 'select',
    options: [['','—'],['MFP','MFP'],['MA','MA']],
    render: v => v ? <span className="bg-pink-100 text-pink-700 text-xs px-1.5 py-0.5 rounded font-semibold">{v}</span> : <span className="text-gray-300">—</span> },
  { key: 'periodes_attribuees',   label: 'Per.',       width: 70, num: true, edit: 'number' },
  { key: 'cours_per_prevu',       label: '',           width: 50, num: true, readonly: true,
    tooltip: 'Périodes prévues (BD_UE_COURS)', rowClickable: true },
  { key: 'autonomie_attribuee',   label: 'Aut.',       width: 70, num: true, edit: 'number' },
  { key: 'ue_autonomie_prevu',    label: '',           width: 50, num: true, readonly: true,
    tooltip: "Autonomie prévue (BD_UE_COURS)", rowClickable: true },
  { key: 'total_attribue_professeur', label: 'Total',  width: 70, num: true, calc: true, rowClickable: true },
  { key: 'charge_en_heures',      label: 'Hrs',        width: 70, num: true, calc: true, rowClickable: true },
  { key: '__actions',             label: '',           width: 50 },
];

// ===========================================================================
export default function Attributions() {
  const [data, setData] = useState([]);
  const [sections, setSections] = useState([]);
  const [professeurs, setProfesseurs] = useState([]);
  const [activitesList, setActivitesList] = useState([]);
  const [filters, setFilters] = useState({ section:'', prof_id:'', contrat:'', type_cours:'', ue_num:'', q:'' });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [sortBy, setSortBy] = useState({ key: null, dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);
  const [bulkDeleteModal, setBulkDeleteModal] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkConfirmText, setBulkConfirmText] = useState('');
  const [editRow, setEditRow] = useState(null);
  const [addMenuUE, setAddMenuUE] = useState(null);   // {ue, sec} : menu + ouvert pour cette UE
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
  // Colonnes pour la vue accordéon niveau UE (masque section/ue/bloc/org, garde code_cours/nom_cours)
  const COLS_UE = useMemo(() => COLS.filter(c => !c.flatOnly), [COLS]);
  // Colonnes pour la vue accordéon niveau Cours (masque aussi code_cours/nom_cours)
  const COLS_COURS = useMemo(() => COLS.filter(c => !c.flatOnly && !c.coursOnly), [COLS]);

  const me = JSON.parse(localStorage.getItem('user') || 'null');
  const isAdmin = me?.role === 'admin';

  /* --- Sélection --- */
  function toggleSelect(id) { setSelected(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; }); }
  function toggleSelectAll() { setSelected(s => s.size === sortedData.length ? new Set() : new Set(sortedData.map(r=>r.id))); }

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
      if (!ueMap.has(ueKey)) ueMap.set(ueKey, { ue_num: r.ue_num, ue_nom: r.ue_nom, bloc: r.bloc, num_organisation: org, coursMap: new Map(), rows: [] });
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
  async function saveCell(id, field, value) {
    try {
      const numF = ['periodes_attribuees','autonomie_attribuee','num_organisation'];
      const payload = { [field]: numF.includes(field) ? Number(value) : value };
      // Si on change le contrat vers autre chose que HELB, vider le statut HELB
      if (field === 'contrat_mdp' && value !== 'HELB') {
        payload.type_cours_helb = null;
      }
      await api.updateAttribution(id, payload);
      setData(prev=>prev.map(r=>r.id===id?{...r,...payload,...recompute(r,payload)}:r));
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
  async function confirmBulkDelete() {
    if (bulkConfirmText!=='SUPPRIMER') { alert('Tapez SUPPRIMER.'); return; }
    try {
      let r;
      if (bulkDeleteModal==='selection') r = await api.bulkDeleteAttributions(Array.from(selected));
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
      const [a,s,p] = await Promise.all([api.attributions(f), api.sections(), api.professeurs()]);
      setData(a); setSections(s); setProfesseurs(p);
      if (activitesList.length === 0) api.activites().then(setActivitesList).catch(()=>{});
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
    const rowBg = selected.has(row.id) ? 'bg-yellow-50' : isHelb ? 'bg-pink-50 hover:bg-pink-100/60' : '';
    return (
      <tr key={row.id} className={rowBg}>
        {colSet.map(c => {
          const sty = { width:c.width, minWidth:c.width, maxWidth:c.width, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' };
          const click = c.rowClickable ? ()=>setEditRow(row) : undefined;
          const cClass = c.rowClickable ? 'cursor-pointer hover:bg-iip-gold/5' : '';
          if (c.key==='__select') return <td key={c.key} className="text-center" style={sty}><input type="checkbox" checked={selected.has(row.id)} onChange={()=>toggleSelect(row.id)} className="cursor-pointer"/></td>;
          if (c.key==='__actions') return <td key={c.key} className="text-center" style={sty}><button onClick={()=>deleteRow(row.id)} className="text-red-500 hover:text-red-700 text-sm" title="Supprimer">🗑</button></td>;
          if (c.key==='__conformite') return <td key={c.key} className="text-center" style={sty}>{c.render(null,row)}</td>;
          const v = row[c.key]; const display = c.render ? c.render(v,row) : v;
          if (c.readonly) return <td key={c.key} style={sty} onClick={click} className={`${c.num?'num':''} bg-gray-100 text-gray-500 ${cClass}`} title={c.tooltip}>{v!=null?Number(v).toLocaleString('fr-BE',{maximumFractionDigits:2}):<span className="text-gray-300">—</span>}</td>;
          if (c.edit==='number') return <td key={c.key} className={c.num?'num':''} style={sty}><input type="text" inputMode="decimal" defaultValue={v??0} className="input-cell text-right w-full no-spinner" onClick={e=>e.stopPropagation()} onBlur={e=>{const val=e.target.value.replace(',','.');if(Number(val)!==Number(v))saveCell(row.id,c.key,val);}}/></td>;
          if (c.edit==='text') return <td key={c.key} style={sty}><input type="text" defaultValue={v??''} className="input-cell w-full text-center" onClick={e=>e.stopPropagation()} onBlur={e=>{if(e.target.value!==(v??''))saveCell(row.id,c.key,e.target.value);}}/></td>;
          if (c.key==='type_cours_helb') {
            if (row.contrat_mdp !== 'HELB') {
              // Non applicable hors HELB : cellule grisée, non éditable
              return <td key={c.key} style={sty} className="bg-gray-100 text-gray-300 text-center" title="Réservé au contrat HELB">—</td>;
            }
            return <td key={c.key} style={sty}><select defaultValue={v??''} onClick={e=>e.stopPropagation()} className="bg-transparent border-0 outline-none w-full text-sm cursor-pointer focus:bg-yellow-50" onChange={e=>{if(e.target.value!==(v??''))saveCell(row.id,c.key,e.target.value);}}>{c.options.map(([val,lbl])=><option key={val} value={val}>{lbl}</option>)}</select></td>;
          }
          if (c.edit==='select') return <td key={c.key} style={sty}><select defaultValue={v??''} onClick={e=>e.stopPropagation()} className="bg-transparent border-0 outline-none w-full text-sm cursor-pointer focus:bg-yellow-50" onChange={e=>{if(e.target.value!==(v??''))saveCell(row.id,c.key,e.target.value);}}>{c.options.map(([val,lbl])=><option key={val} value={val}>{lbl}</option>)}</select></td>;
          if (c.edit==='prof') return <td key={c.key} style={sty}><select defaultValue={row.professeur_id??''} onClick={e=>e.stopPropagation()} className="bg-transparent border-0 outline-none w-full text-sm cursor-pointer focus:bg-yellow-50" onChange={e=>{const nid=e.target.value?Number(e.target.value):null;if(nid!==row.professeur_id)saveCell(row.id,'professeur_id',nid);}}><option value="">— Aucun —</option>{professeurs.map(p=><option key={p.id} value={p.id}>{p.nom_prenom}</option>)}</select></td>;
          if (c.edit==='statut') {
            const isHelb = row.contrat_mdp === 'HELB';
            // En HELB, on affiche "PI" (professeur invité) au lieu de "EXP" — la valeur stockée reste EXP
            const statutOptions = c.options.map(([val, lbl]) => [val, (isHelb && val === 'EXP') ? 'PI' : lbl]);
            return <td key={c.key} style={sty}>{row.professeur_id?<select defaultValue={v??''} onClick={e=>e.stopPropagation()} className="bg-transparent border-0 outline-none w-full text-sm cursor-pointer focus:bg-yellow-50" onChange={async e=>{try{await api.updateProfStatut(row.professeur_id,e.target.value);load();}catch(err){alert(err.message);}}}>{statutOptions.map(([val,lbl])=><option key={val} value={val}>{lbl}</option>)}</select>:<span className="text-gray-300">—</span>}</td>;
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
    return (
      <div key={key} className="border-t border-gray-100">
        <button onClick={()=>toggle(key)} className="w-full flex items-center gap-2 px-6 py-2 hover:bg-gray-50 transition text-left text-sm">
          <span className={`text-gray-400 text-xs transition-transform ${open?'rotate-90':''}`}>▶</span>
          <span className="font-mono text-xs text-gray-500">{cg.code_cours}</span>
          <span className="text-gray-700 truncate flex-1">{cg.nom_cours}</span>
          {cg.type_cours && <span className={`text-xs px-1.5 py-0.5 rounded ${cg.type_cours==='CT'?'bg-blue-100 text-blue-700':'bg-purple-100 text-purple-700'}`}>{cg.type_cours}</span>}
          <span className="text-xs text-gray-500">{cg.rows.length} attr.</span>
          <span className="text-xs font-semibold text-iip-gold">{st.tPer}p</span>
          {st.tAut>0 && <span className="text-xs text-gray-400">+{st.tAut}a</span>}
          {st.nBad>0 ? <span className="text-xs text-red-600 font-bold">✗</span> : st.nConf>0 ? <span className="text-xs text-green-600 font-bold">✓</span> : null}
        </button>
        {open && (
          <div className="overflow-auto max-h-[40vh] ml-6 mr-2 mb-2 border border-gray-200 rounded">
            <table className="grid-excel" style={{tableLayout:'fixed'}}>
              <thead><tr>
                {COLS_COURS.map(c => c.key==='__select'
                  ? <th key={c.key} style={{width:c.width,minWidth:c.width,maxWidth:c.width}}>
                      <input type="checkbox" checked={cg.rows.length>0&&cg.rows.every(r=>selected.has(r.id))}
                        onChange={()=>{const all=cg.rows.every(r=>selected.has(r.id));setSelected(s=>{const n=new Set(s);cg.rows.forEach(r=>all?n.delete(r.id):n.add(r.id));return n;});}}
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
    return (
      <div key={key} className="border-t border-gray-200">
        <div className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-iip-gold/5 transition relative">
          <button onClick={()=>toggle(key)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
            <span className={`text-iip-gold text-sm transition-transform ${open?'rotate-90':''}`}>▶</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-iip-gold text-sm">UE {ue.ue_num}</span>
                {org > 1 && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold">Org. {org}</span>}
                {ue.bloc && <span className="text-xs bg-iip-gold/10 text-iip-gold px-1.5 py-0.5 rounded">{ue.bloc}</span>}
              </div>
              <div className="text-xs text-gray-600 truncate">{ue.ue_nom || 'UE sans nom'}</div>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
              <span>{ue.rows.length} attr.</span>
              <span>{st.nCours} cours</span>
              <span>{st.nProf} prof.</span>
              <span className="font-semibold text-iip-gold">{st.tPer}p</span>
              {st.tAut>0 && <span className="text-gray-400">+{st.tAut}a</span>}
              {st.nBad>0 && <span className="text-red-600 font-bold">✗ {st.nBad}</span>}
              {st.nBad===0 && st.nConf>0 && <span className="text-green-600 font-bold">✓</span>}
            </div>
          </button>
          {/* Bouton + : ajouter une ligne / un cours */}
          <button onClick={(e)=>{e.stopPropagation(); setAddMenuUE(addMenuUE?.key===key ? null : {key, ue, sec, org});}}
                  title="Ajouter une attribution"
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-iip-gold/10 hover:bg-iip-gold hover:text-white text-iip-gold font-bold transition">+</button>
          {addMenuUE?.key===key && (
            <div className="absolute right-3 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-64" onClick={e=>e.stopPropagation()}>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 border-b border-gray-100">Ajouter dans l'UE {ue.ue_num}</div>
              {ue.cours.map(cg => (
                <button key={cg.code_cours} onClick={()=>{ setEditRow({section: sec, code_cours: cg.code_cours}); setAddMenuUE(null); }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-iip-gold/10 flex items-center gap-2">
                  <span className="text-iip-gold">＋</span>
                  <span className="truncate">Ligne sur <b>{cg.code_cours}</b> — {cg.nom_cours}</span>
                </button>
              ))}
              <button onClick={()=>{ setNewCoursForm({section: sec, ue_num: ue.ue_num, ue_nom: ue.ue_nom, num_organisation: org}); setAddMenuUE(null); }}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-iip-mauve/10 text-iip-mauve border-t border-gray-100 flex items-center gap-2">
                <span>＋</span><span>Nouveau cours dans cette UE</span>
              </button>
            </div>
          )}
        </div>
        {open && (
          <div className="bg-gray-50/50">
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
      <div key={key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <button onClick={()=>toggle(key)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-iip-gold/10 transition text-left bg-iip-gold/5">
          <span className={`text-iip-gold font-bold transition-transform ${open?'rotate-90':''}`}>▶</span>
          <span className="font-bold text-iip-gold text-lg">{sg.section}</span>
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0 ml-auto">
            <span>{sg.ues.length} UE</span>
            <span>{sg.rows.length} attr.</span>
            <span>{st.nCours} cours</span>
            <span>{st.nProf} prof.</span>
            <span className="font-bold text-iip-gold text-sm">{st.tPer}p</span>
            {st.tAut>0 && <span className="text-gray-400">+{st.tAut}a</span>}
            {st.nBad>0 && <span className="text-red-600 font-bold">✗ {st.nBad}</span>}
            {st.nBad===0 && st.nConf>0 && <span className="text-green-600 font-bold">✓</span>}
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
    <div className="p-2 md:p-4">
      {/* Barre mobile */}
      <div className="md:hidden mb-2 flex gap-2">
        <input value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})} onKeyDown={e=>e.key==='Enter'&&applyFilters()} placeholder="🔍 Rechercher…" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"/>
        <button onClick={mobileCollapseAll} title="Tout replier" className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium">⊟</button>
        <button onClick={mobileExpandAll} title="Tout déplier" className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium">⊞</button>
        <button onClick={()=>setFiltersOpenMobile(o=>!o)} className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium">{filtersOpenMobile?'✕':'⚙'}</button>
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
          <button onClick={()=>setViewMode('ue')} className={`px-3 py-1.5 font-medium transition ${viewMode==='ue'?'bg-iip-gold text-white':'text-gray-600 hover:bg-gray-50'}`}>📂 Par section</button>
          <button onClick={()=>setViewMode('flat')} className={`px-3 py-1.5 font-medium transition ${viewMode==='flat'?'bg-iip-gold text-white':'text-gray-600 hover:bg-gray-50'}`}>📋 Vue complète</button>
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
          <button onClick={()=>setShowForm(true)} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-3 py-1.5 rounded font-medium">➕ Nouvelle</button>
          <button onClick={()=>setShowBulkCreate(true)} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-3 py-1.5 rounded font-medium" title="Créer les attributions d'une section">➕➕ Créer une section</button>
          <button onClick={()=>api.exportExcel()} className="bg-iip-mauve hover:opacity-90 text-white text-sm px-3 py-1.5 rounded font-medium">📥 Export</button>
          {isAdmin && <>
            {selected.size>0 && <button onClick={()=>openBulkModal('selection')} className="bg-iip-orange hover:opacity-90 text-white text-sm px-3 py-1.5 rounded font-medium">🗑 Sélection ({selected.size})</button>}
            <button onClick={()=>openBulkModal('filtered')} className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded font-medium">🗑 Suppr. filtre</button>
            <button onClick={()=>openBulkModal('all')} className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1.5 rounded font-medium">🗑 Tout supprimer</button>
            <button onClick={reimportExcel} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded font-medium">↻ Réimporter</button>
          </>}
        </div>
      </div>

      {/* VUE PAR SECTION/UE/COURS */}
      {viewMode==='ue' && <div className="hidden md:flex flex-col gap-2">
        {loading ? <div className="p-8 text-center text-gray-400">Chargement…</div>
         : sectionGroups.length===0 ? <div className="p-8 text-center text-gray-400 bg-white rounded-lg border">Aucune attribution</div>
         : sectionGroups.map(renderSection)}
      </div>}

      {/* VUE COMPLÈTE */}
      {viewMode==='flat' && <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-auto max-h-[calc(100vh-260px)]">
        {loading ? <div className="p-8 text-center text-gray-400">Chargement…</div> : (
          <table className="grid-excel" style={{tableLayout:'fixed'}}>
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

      {/* Modales */}
      {showForm && <AttributionForm onClose={()=>setShowForm(false)} onCreated={load}/>}
      {newCoursForm && <AttributionForm editRow={newCoursForm} onClose={()=>setNewCoursForm(null)} onCreated={load}/>}
      {showBulkCreate && <BulkCreateForm onClose={()=>setShowBulkCreate(false)} onCreated={load}/>}
      {editRow && <CoursEditModal section={editRow.section} codeCours={editRow.code_cours} onClose={()=>setEditRow(null)} onChanged={load}/>}

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
    </div>
  );
}

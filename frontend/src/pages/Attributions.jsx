import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api.js';
import AttributionForm from '../components/AttributionForm.jsx';
import BulkCreateForm from '../components/BulkCreateForm.jsx';
import AttributionCard from '../components/AttributionCard.jsx';

const COLS = [
  {
    key: '__select',
    label: '',
    w: 'w-8'
  },
  {
    key: '__conformite',
    label: '✓',
    w: 'w-10',
    render: (_, row) => {
      const conforme = row.cours_conforme;
      const total = row.cours_total_attribue;
      const per = row.cours_per;
      const mult = row.cours_multiple_attendu;
      if (per == null || per === 0) {
        return <span className="text-gray-300" title="Pas de Cours_per défini">—</span>;
      }
      const tooltip = `Cours_per=${per} · Total attribué=${total} · Ratio=${mult}`;
      return conforme
        ? <span className="text-green-600 font-bold" title={`Conforme. ${tooltip}`}>✓</span>
        : <span className="text-red-600 font-bold" title={`NON conforme : le total n'est pas un multiple entier de Cours_per. ${tooltip}`}>✗</span>;
    }
  },
  { key: 'section',                label: 'Section',     w: 'w-28' },
  { key: 'contrat_mdp',            label: 'Contrat',     w: 'w-20', render: v =>
      v === 'IIP'  ? <span className="badge badge-iip">IIP</span> :
      v === 'HELB' ? <span className="badge badge-helb">HELB</span> : v },
  { key: 'ue_num',                 label: 'UE',          w: 'w-16',  num: true },
  { key: 'ue_nom',                 label: "Nom de l'UE", w: 'min-w-[260px]' },
  { key: 'bloc',                   label: 'Bloc',        w: 'w-16' },
  { key: 'quadri_pour_tous_prevu', label: 'Quadri',      w: 'w-20' },
  { key: 'code_cours',             label: 'Code',        w: 'w-20' },
  { key: 'nom_cours',              label: 'Cours',       w: 'min-w-[220px]' },
  { key: 'type_cours',             label: 'Type',        w: 'w-16', render: v =>
      v === 'CT' ? <span className="badge badge-ct">CT</span> :
      v === 'PP' ? <span className="badge badge-pp">PP</span> : v },
  { key: 'code',                   label: 'Gr.',         w: 'w-14' },
  { key: 'professeur',             label: 'Professeur',  w: 'min-w-[200px]' },
  { key: 'contrat',                label: 'Stat.',       w: 'w-16' },
  { key: 'periodes_attribuees',    label: 'Per.',        w: 'w-20', num: true, edit: true },
  { key: 'autonomie_attribuee',    label: 'Aut.',        w: 'w-20', num: true, edit: true },
  { key: 'total_attribue_professeur', label: 'Total',    w: 'w-20', num: true, calc: true },
  { key: 'charge_en_heures',       label: 'Hrs',         w: 'w-20', num: true, calc: true },
  { key: 'cout_dotation',          label: 'Coût dot.',   w: 'w-24', num: true, calc: true },
  { key: '__actions',              label: '',            w: 'w-16' },
];

export default function Attributions() {
  const [data, setData] = useState([]);
  const [sections, setSections] = useState([]);
  const [professeurs, setProfesseurs] = useState([]);
  const [filters, setFilters] = useState({ section: '', prof_id: '', contrat: '', type_cours: '', q: '' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState({}); // { rowId: { field: value } }
  const [showForm, setShowForm] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [sortBy, setSortBy] = useState({ key: null, dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [filtersOpenMobile, setFiltersOpenMobile] = useState(false);
  const [bulkDeleteModal, setBulkDeleteModal] = useState(null); // null | 'selection' | 'filtered' | 'all'
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkConfirmText, setBulkConfirmText] = useState('');

  const me = JSON.parse(localStorage.getItem('user') || 'null');
  const isAdmin = me?.role === 'admin';

  function toggleSelect(id) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected(s => {
      if (s.size === sortedData.length) return new Set();
      return new Set(sortedData.map(r => r.id));
    });
  }

  function toggleSort(key) {
    if (key === '__actions' || key === '__conformite' || key === '__select') return;
    setSortBy(s => {
      if (s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  }

  const sortedData = useMemo(() => {
    if (!sortBy.key) return data;
    const arr = [...data];
    const k = sortBy.key;
    arr.sort((a, b) => {
      const va = a[k], vb = b[k];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const na = Number(va), nb = Number(vb);
      const bothNum = !isNaN(na) && !isNaN(nb) && va !== '' && vb !== '';
      const cmp = bothNum
        ? na - nb
        : String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' });
      return sortBy.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [data, sortBy]);

  async function deleteRow(id) {
    if (!confirm('Supprimer cette attribution ?')) return;
    try {
      await api.deleteAttribution(id);
      setData(d => d.filter(r => r.id !== id));
      setSelected(s => { const n = new Set(s); n.delete(id); return n; });
    } catch (e) { alert('Suppression échouée : ' + e.message); }
  }

  async function openBulkModal(mode) {
    setBulkConfirmText('');
    setBulkDeleteModal(mode);
    setBulkPreview(null);
    if (mode === 'selection') {
      setBulkPreview({ count: selected.size });
    } else if (mode === 'filtered') {
      try {
        const f = {};
        if (filters.section)  f.section = filters.section;
        if (filters.prof_id)  f.professeur_id = filters.prof_id;
        if (filters.contrat)  f.contrat = filters.contrat;
        const r = await api.bulkDeletePreview(f);
        setBulkPreview(r);
      } catch (e) { alert(e.message); setBulkDeleteModal(null); }
    } else if (mode === 'all') {
      try {
        const r = await api.bulkDeletePreview({});
        setBulkPreview(r);
      } catch (e) { alert(e.message); setBulkDeleteModal(null); }
    }
  }

  async function confirmBulkDelete() {
    if (bulkConfirmText !== 'SUPPRIMER') {
      alert('Tapez exactement SUPPRIMER pour confirmer.');
      return;
    }
    try {
      let result;
      if (bulkDeleteModal === 'selection') {
        result = await api.bulkDeleteAttributions(Array.from(selected));
      } else if (bulkDeleteModal === 'filtered') {
        const f = {};
        if (filters.section)  f.section = filters.section;
        if (filters.prof_id)  f.professeur_id = filters.prof_id;
        if (filters.contrat)  f.contrat = filters.contrat;
        result = await api.bulkDeleteFiltered(f);
      } else {
        result = await api.bulkDeleteFiltered({});
      }
      alert(`${result.deleted} attribution(s) supprimée(s).`);
      setBulkDeleteModal(null);
      setSelected(new Set());
      load();
    } catch (e) { alert('Erreur : ' + e.message); }
  }

  async function reimportExcel() {
    if (!confirm('Réimporter depuis les fichiers Excel ? Cela va remplacer les UE/cours/professeurs et ajouter les attributions du fichier.')) return;
    try {
      const r = await api.adminReimportExcel();
      alert('Réimport terminé. Voir log dans la console.');
      console.log(r.log);
      load();
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [attrs, secs, profs] = await Promise.all([
        api.attributions(filters),
        api.sections(),
        api.professeurs()
      ]);
      setData(attrs);
      setSections(secs);
      setProfesseurs(profs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function applyFilters() { load(); }
  function resetFilters() {
    setFilters({ section: '', prof_id: '', contrat: '', type_cours: '', q: '' });
    setTimeout(load, 0);
  }

  async function saveCell(id, field, value) {
    try {
      const numericFields = ['periodes_attribuees', 'autonomie_attribuee'];
      const payload = { [field]: numericFields.includes(field) ? Number(value) : value };
      await api.updateAttribution(id, payload);
      setData(prev => prev.map(r => r.id === id ? { ...r, ...payload, ...recompute(r, payload) } : r));
    } catch (e) { alert('Sauvegarde échouée : ' + e.message); }
  }

  // Recalcul côté client (anticipation visuelle avant retour serveur)
  function recompute(row, patch) {
    const per = Number(patch.periodes_attribuees ?? row.periodes_attribuees ?? 0);
    const aut = Number(patch.autonomie_attribuee ?? row.autonomie_attribuee ?? 0);
    const total = per + aut;
    const hrs = Math.round(total * 50 / 60);
    return { total_attribue_professeur: total, charge_en_heures: hrs };
  }

  const stats = useMemo(() => {
    const tot = data.reduce((acc, r) => {
      acc.total += Number(r.total_attribue_professeur || 0);
      acc.iip  += r.contrat_mdp === 'IIP'  ? Number(r.total_attribue_professeur || 0) : 0;
      acc.helb += r.contrat_mdp === 'HELB' ? Number(r.total_attribue_professeur || 0) : 0;
      return acc;
    }, { total: 0, iip: 0, helb: 0 });
    return tot;
  }, [data]);

  return (
    <div className="p-2 md:p-4">
      {/* Barre compacte mobile : recherche rapide + toggle filtres */}
      <div className="md:hidden mb-2 flex gap-2">
        <input value={filters.q} onChange={e=>setFilters({...filters, q: e.target.value})}
               onKeyDown={e => e.key === 'Enter' && applyFilters()}
               placeholder="🔍 Rechercher…"
               className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <button onClick={() => setFiltersOpenMobile(o => !o)}
                className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium">
          {filtersOpenMobile ? '✕' : '⚙'}
        </button>
      </div>

      {/* Filtres */}
      <div className={`bg-white rounded-lg border border-gray-200 p-3 mb-3 flex flex-wrap items-end gap-2 ${filtersOpenMobile ? '' : 'hidden md:flex'}`}>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Section</label>
          <select value={filters.section} onChange={e=>setFilters({...filters, section: e.target.value})}
                  className="border border-gray-300 rounded px-2 py-1 text-sm">
            <option value="">— Toutes —</option>
            {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Professeur</label>
          <select value={filters.prof_id} onChange={e=>setFilters({...filters, prof_id: e.target.value})}
                  className="border border-gray-300 rounded px-2 py-1 text-sm min-w-[200px]">
            <option value="">— Tous —</option>
            {professeurs.map(p => <option key={p.id} value={p.id}>{p.nom_prenom}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Contrat</label>
          <select value={filters.contrat} onChange={e=>setFilters({...filters, contrat: e.target.value})}
                  className="border border-gray-300 rounded px-2 py-1 text-sm">
            <option value="">—</option>
            <option value="IIP">IIP</option>
            <option value="HELB">HELB</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5">Type</label>
          <select value={filters.type_cours} onChange={e=>setFilters({...filters, type_cours: e.target.value})}
                  className="border border-gray-300 rounded px-2 py-1 text-sm">
            <option value="">—</option>
            <option value="CT">CT</option>
            <option value="PP">PP</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-600 mb-0.5">Recherche libre</label>
          <input value={filters.q} onChange={e=>setFilters({...filters, q: e.target.value})}
                 onKeyDown={e => e.key === 'Enter' && applyFilters()}
                 placeholder="UE, cours, professeur..."
                 className="border border-gray-300 rounded px-2 py-1 text-sm w-full" />
        </div>
        <button onClick={applyFilters} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-1.5 rounded">Filtrer</button>
        <button onClick={resetFilters} className="text-gray-600 hover:text-iip-orange text-sm px-2 py-1.5">Réinitialiser</button>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button onClick={() => setShowForm(true)} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-3 py-1.5 rounded font-medium">
            ➕ Nouvelle
          </button>
          <button onClick={() => setShowBulkCreate(true)} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-3 py-1.5 rounded font-medium"
                  title="Créer toutes les attributions d'une section d'un coup">
            ➕➕ Créer une section
          </button>
          <button onClick={() => api.exportExcel()} className="bg-iip-mauve hover:opacity-90 text-white text-sm px-3 py-1.5 rounded font-medium">
            📥 Export Excel
          </button>
          {isAdmin && (
            <>
              {selected.size > 0 && (
                <button onClick={() => openBulkModal('selection')}
                        className="bg-iip-orange hover:opacity-90 text-white text-sm px-3 py-1.5 rounded font-medium">
                  🗑 Supprimer sélection ({selected.size})
                </button>
              )}
              <button onClick={() => openBulkModal('filtered')}
                      className="bg-orange-500 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded font-medium"
                      title="Supprimer toutes les attributions correspondant aux filtres actifs">
                🗑 Suppr. filtre
              </button>
              <button onClick={() => openBulkModal('all')}
                      className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1.5 rounded font-medium"
                      title="Supprimer TOUTES les attributions">
                🗑 Tout supprimer
              </button>
              <button onClick={reimportExcel}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded font-medium"
                      title="Réimporter depuis les Excel sources">
                ↻ Réimporter Excel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-3 text-sm">
        <span className="bg-white rounded px-3 py-1 border border-gray-200">
          <b>{data.length}</b> lignes • Total <b>{stats.total.toLocaleString('fr-BE')}</b> per.
          • IIP <b className="text-iip-gold">{stats.iip.toLocaleString('fr-BE')}</b>
          • HELB <b className="text-iip-mauve">{stats.helb.toLocaleString('fr-BE')}</b>
        </span>
      </div>

      {/* Grille — desktop uniquement */}
      <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-auto max-h-[calc(100vh-260px)]">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Chargement…</div>
        ) : (
          <table className="grid-excel">
            <thead>
              <tr>
                {COLS.map(c => {
                  if (c.key === '__select') {
                    return (
                      <th key={c.key} className={c.w}>
                        <input type="checkbox"
                               checked={selected.size > 0 && selected.size === sortedData.length}
                               onChange={toggleSelectAll}
                               title="Tout sélectionner / désélectionner"
                               className="cursor-pointer" />
                      </th>
                    );
                  }
                  const isSortable = c.key !== '__actions' && c.key !== '__conformite' && c.key !== '__select';
                  const arrow = sortBy.key === c.key ? (sortBy.dir === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th key={c.key}
                        className={`${c.w} ${isSortable ? 'cursor-pointer select-none hover:bg-iip-amber' : ''}`}
                        onClick={() => toggleSort(c.key)}
                        title={isSortable ? 'Cliquer pour trier' : undefined}>
                      {c.label}{arrow}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedData.map(row => (
                <tr key={row.id} className={selected.has(row.id) ? 'bg-yellow-50' : ''}>
                  {COLS.map(c => {
                    if (c.key === '__select') {
                      return (
                        <td key={c.key} className="text-center">
                          <input type="checkbox" checked={selected.has(row.id)}
                                 onChange={() => toggleSelect(row.id)}
                                 className="cursor-pointer" />
                        </td>
                      );
                    }
                    if (c.key === '__actions') {
                      return (
                        <td key={c.key} className="text-center">
                          <button onClick={() => deleteRow(row.id)}
                                  className="text-red-500 hover:text-red-700 text-sm" title="Supprimer">🗑</button>
                        </td>
                      );
                    }
                    if (c.key === '__conformite') {
                      return (
                        <td key={c.key} className="text-center">
                          {c.render(null, row)}
                        </td>
                      );
                    }
                    const v = row[c.key];
                    const display = c.render ? c.render(v, row) : v;
                    return (
                      <td key={c.key} className={c.num ? 'num' : ''}>
                        {c.edit ? (
                          <input type="number" step="0.5" defaultValue={v ?? 0}
                                 className="input-cell text-right w-full"
                                 onBlur={e => {
                                   if (Number(e.target.value) !== Number(v)) saveCell(row.id, c.key, e.target.value);
                                 }} />
                        ) : c.num && v != null ? (
                          Number(v).toLocaleString('fr-BE', { maximumFractionDigits: 2 })
                        ) : display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Vue cartes — mobile uniquement */}
      <div className="md:hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Chargement…</div>
        ) : sortedData.length === 0 ? (
          <div className="p-8 text-center text-gray-400 bg-white rounded-lg border border-gray-200">
            Aucune attribution trouvée
          </div>
        ) : (
          <div className="space-y-2 pb-24">
            {sortedData.map(row => (
              <AttributionCard
                key={row.id}
                row={row}
                selected={selected.has(row.id)}
                onToggleSelect={toggleSelect}
                onChange={load}
                onDelete={deleteRow}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB mobile — bouton flottant "Nouvelle attribution" */}
      <button onClick={() => setShowForm(true)}
              className="md:hidden fixed bottom-6 right-6 bg-iip-gold hover:bg-iip-amber text-white rounded-full w-14 h-14 shadow-2xl flex items-center justify-center text-3xl z-30"
              aria-label="Nouvelle attribution"
              title="Nouvelle attribution">
        +
      </button>

      {showForm && <AttributionForm onClose={() => setShowForm(false)} onCreated={load} />}
      {showBulkCreate && <BulkCreateForm onClose={() => setShowBulkCreate(false)} onCreated={load} />}

      {bulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40"
             onClick={e => e.target === e.currentTarget && setBulkDeleteModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border-t-4 border-red-600">
            <h2 className="text-xl font-title text-red-700 mb-3">⚠️ Suppression en masse</h2>

            <p className="text-sm text-gray-700 mb-4">
              {bulkDeleteModal === 'selection' && <>Vous allez supprimer <b>{bulkPreview?.count ?? '…'}</b> attribution(s) sélectionnée(s).</>}
              {bulkDeleteModal === 'filtered'  && <>Vous allez supprimer <b>{bulkPreview?.count ?? '…'}</b> attribution(s) correspondant aux <b>filtres actifs</b>.</>}
              {bulkDeleteModal === 'all'       && <>Vous allez supprimer <b className="text-red-600">TOUTES les {bulkPreview?.count ?? '…'} attributions</b> de la base.</>}
            </p>

            <p className="text-xs text-gray-500 mb-3">
              Les heures de planning hebdomadaire associées seront également supprimées.
              <br/>
              Cette action est <b>irréversible</b>.
            </p>

            <label className="block text-xs text-gray-600 mb-1">
              Pour confirmer, tapez <code className="bg-gray-100 px-1 rounded font-mono">SUPPRIMER</code> :
            </label>
            <input value={bulkConfirmText}
                   onChange={e => setBulkConfirmText(e.target.value)}
                   autoFocus
                   className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono mb-4"
                   placeholder="SUPPRIMER" />

            <div className="flex justify-end gap-2">
              <button onClick={() => setBulkDeleteModal(null)}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Annuler
              </button>
              <button onClick={confirmBulkDelete}
                      disabled={bulkConfirmText !== 'SUPPRIMER'}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm px-5 py-2 rounded font-medium">
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

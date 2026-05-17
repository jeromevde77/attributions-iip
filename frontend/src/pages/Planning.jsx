import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const SEMAINES = Array.from({ length: 43 }, (_, i) => i); // 0 → 42

export default function Planning() {
  const [data, setData] = useState([]);
  const [sections, setSections] = useState([]);
  const [profs, setProfs] = useState([]);
  const [filter, setFilter] = useState({ section: '', prof_id: '' });
  const [loading, setLoading] = useState(true);
  const [filterOpenMobile, setFilterOpenMobile] = useState(false);
  const [editingRow, setEditingRow] = useState(null); // attribution en cours d'édition mobile

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.entries(filter).filter(([_, v]) => v)).toString();
      const [planning, s, p] = await Promise.all([
        fetch('/api/planning' + (params ? '?' + params : ''), {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).then(r => r.json()),
        api.sections(),
        api.professeurs()
      ]);
      setData(planning); setSections(s); setProfs(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function saveCell(attrId, semaine, heures) {
    try {
      await fetch(`/api/planning/${attrId}/${semaine}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ heures: Number(heures) })
      });
      setData(d => d.map(r => {
        if (r.id !== attrId) return r;
        const semaines = { ...r.semaines };
        if (Number(heures) === 0) delete semaines[semaine];
        else semaines[semaine] = Number(heures);
        const total = Object.values(semaines).reduce((s, h) => s + h, 0);
        return { ...r, semaines, total_place: total, solde: (r.charge_en_heures || 0) - total };
      }));
      if (editingRow?.id === attrId) {
        setEditingRow(r => ({ ...r, semaines: data.find(d => d.id === attrId)?.semaines || r.semaines }));
      }
    } catch (e) { alert('Sauvegarde échouée'); }
  }

  return (
    <div className="p-2 md:p-4">
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-xl md:text-2xl font-title text-iip-gold">Planning hebdomadaire</h1>
        <span className="hidden md:inline text-sm text-gray-500">— 43 semaines (S0 → S42)</span>
      </div>

      {/* Barre mobile compacte */}
      <div className="md:hidden mb-2 flex gap-2">
        <button onClick={() => setFilterOpenMobile(o => !o)}
                className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-left">
          {filter.section || filter.prof_id ? '🔧 Filtres actifs' : '⚙ Filtrer'}
          {filter.section && <span className="ml-2 badge badge-iip">{filter.section}</span>}
        </button>
      </div>

      {/* Filtres */}
      <div className={`bg-white rounded-lg border border-gray-200 p-3 mb-3 flex flex-wrap items-end gap-2 ${filterOpenMobile ? '' : 'hidden md:flex'}`}>
        <div className="flex-1 md:flex-none min-w-[140px]">
          <label className="block text-xs text-gray-600 mb-0.5 font-medium">Section</label>
          <select value={filter.section} onChange={e=>setFilter({...filter, section: e.target.value})}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
            <option value="">— Toutes —</option>
            {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
          </select>
        </div>
        <div className="flex-1 md:flex-none min-w-[200px]">
          <label className="block text-xs text-gray-600 mb-0.5 font-medium">Professeur</label>
          <select value={filter.prof_id} onChange={e=>setFilter({...filter, prof_id: e.target.value})}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
            <option value="">— Tous —</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.nom_prenom}</option>)}
          </select>
        </div>
        <button onClick={() => { load(); setFilterOpenMobile(false); }}
                className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-1.5 rounded">Filtrer</button>
      </div>

      {/* Grille — desktop uniquement */}
      <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Chargement…</div>
        ) : (
          <table className="grid-excel">
            <thead>
              <tr>
                <th className="sticky left-0 z-10" style={{ background: '#1B2B4B', minWidth: 200 }}>Professeur</th>
                <th>Section</th>
                <th>UE</th>
                <th>Cours</th>
                <th>Type</th>
                <th>Gr.</th>
                <th>Q</th>
                <th className="text-right">Hrs cible</th>
                <th className="text-right">Placé</th>
                <th className="text-right">Solde</th>
                {SEMAINES.map(s => <th key={s} className="text-center" style={{ minWidth: 36 }}>S{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
                <tr key={row.id}>
                  <td className="sticky left-0 bg-white z-10 font-medium">{row.professeur || '—'}</td>
                  <td>{row.section}</td>
                  <td>{row.ue_num}</td>
                  <td className="text-xs">{row.cours_nom}</td>
                  <td>{row.type_cours}</td>
                  <td>{row.code}</td>
                  <td>{row.quadrimestre_attribue}</td>
                  <td className="num">{row.charge_en_heures}</td>
                  <td className="num font-medium">{row.total_place?.toFixed(1)}</td>
                  <td className={`num font-semibold ${row.solde > 0 ? 'text-red-600' : row.solde < 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {row.solde?.toFixed(1)}
                  </td>
                  {SEMAINES.map(s => (
                    <td key={s} className="num p-0" style={{ minWidth: 36 }}>
                      <input type="number" step="0.5" min="0"
                             defaultValue={row.semaines[s] ?? ''}
                             className="input-cell text-center w-full px-1 py-1"
                             onBlur={e => {
                               const v = e.target.value;
                               if ((v === '' && row.semaines[s] != null) ||
                                   (v !== '' && Number(v) !== row.semaines[s])) {
                                 saveCell(row.id, s, v || 0);
                               }
                             }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Cartes — mobile */}
      <div className="md:hidden space-y-2 pb-4">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Chargement…</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-gray-400 bg-white rounded-lg border">Aucune attribution</div>
        ) : (
          data.map(row => {
            const soldeClass =
              row.solde > 0 ? 'text-red-600 bg-red-50' :
              row.solde < 0 ? 'text-orange-600 bg-orange-50' : 'text-green-600 bg-green-50';
            const totalPlace = row.total_place?.toFixed(1) || '0';
            const cible = row.charge_en_heures || 0;
            const pct = cible > 0 ? Math.min(100, (row.total_place / cible) * 100) : 0;
            return (
              <div key={row.id}
                   onClick={() => setEditingRow(row)}
                   className="bg-white rounded-lg border border-gray-200 p-3 active:bg-gray-50">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="text-sm font-medium text-gray-800 truncate flex-1">
                    {row.professeur || <span className="italic text-orange-600">⚠ Non assigné</span>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${soldeClass}`}>
                    {row.solde > 0 && '+'}{row.solde?.toFixed(1)}h
                  </span>
                </div>
                <div className="text-xs text-gray-500 mb-2 line-clamp-1">
                  {row.section} · UE{row.ue_num} · {row.cours_nom}
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${row.solde >= 0 ? 'bg-iip-gold' : 'bg-orange-500'}`}
                         style={{ width: `${pct}%` }}></div>
                  </div>
                  <div className="text-xs text-gray-600 whitespace-nowrap">
                    <b>{totalPlace}</b> / {cible}h
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(row.semaines || {}).slice(0, 8).map(([s, h]) => (
                    <span key={s} className="text-[10px] bg-iip-gold/10 text-iip-gold px-1.5 py-0.5 rounded">
                      S{s}:{h}
                    </span>
                  ))}
                  {Object.keys(row.semaines || {}).length > 8 && (
                    <span className="text-[10px] text-gray-400">+{Object.keys(row.semaines).length - 8}…</span>
                  )}
                  {Object.keys(row.semaines || {}).length === 0 && (
                    <span className="text-[10px] italic text-gray-400">Aucune semaine planifiée</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Drawer édition mobile */}
      {editingRow && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setEditingRow(null)}>
          <div className="absolute inset-0 bg-black/40"></div>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-4 max-h-[85vh] overflow-auto"
               onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-300 rounded mx-auto mb-3"></div>
            <h3 className="font-title text-base text-iip-gold mb-1 leading-tight">
              {editingRow.professeur || '⚠ Non assigné'}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              {editingRow.section} · UE{editingRow.ue_num} · {editingRow.cours_nom}
            </p>
            <div className="bg-gray-50 rounded p-2 mb-3 text-center text-sm">
              <b>{editingRow.total_place?.toFixed(1) || 0}h</b> placées / <b>{editingRow.charge_en_heures || 0}h</b> cibles
            </div>

            <p className="text-xs text-gray-600 mb-2">Saisissez les heures par semaine :</p>
            <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5 mb-4">
              {SEMAINES.map(s => {
                const current = editingRow.semaines?.[s];
                return (
                  <label key={s} className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-500">S{s}</span>
                    <input type="number" step="0.5" min="0"
                           defaultValue={current ?? ''}
                           inputMode="decimal"
                           className="w-full border border-gray-300 rounded px-1 py-1 text-center text-sm focus:border-iip-gold focus:bg-iip-gold/5"
                           onBlur={e => {
                             const v = e.target.value;
                             if ((v === '' && current != null) || (v !== '' && Number(v) !== current)) {
                               saveCell(editingRow.id, s, v || 0);
                             }
                           }} />
                  </label>
                );
              })}
            </div>

            <button onClick={() => setEditingRow(null)}
                    className="w-full bg-iip-gold hover:bg-iip-amber text-white text-sm py-2.5 rounded font-medium">
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

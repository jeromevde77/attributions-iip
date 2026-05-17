import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const SEMAINES = Array.from({ length: 43 }, (_, i) => i); // 0 → 42

export default function Planning() {
  const [data, setData] = useState([]);
  const [sections, setSections] = useState([]);
  const [profs, setProfs] = useState([]);
  const [filter, setFilter] = useState({ section: '', prof_id: '' });
  const [loading, setLoading] = useState(true);

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
      // mise à jour locale
      setData(d => d.map(r => {
        if (r.id !== attrId) return r;
        const semaines = { ...r.semaines };
        if (Number(heures) === 0) delete semaines[semaine];
        else semaines[semaine] = Number(heures);
        const total = Object.values(semaines).reduce((s, h) => s + h, 0);
        return { ...r, semaines, total_place: total, solde: (r.charge_en_heures || 0) - total };
      }));
    } catch (e) { alert('Sauvegarde échouée'); }
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-2xl font-title text-iip-gold">Planning hebdomadaire 2025-2026</h1>
        <span className="text-sm text-gray-500">— 43 semaines (S0 → S42)</span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-3 flex items-end gap-2">
        <div>
          <label className="block text-xs text-gray-600 mb-0.5 font-medium">Section</label>
          <select value={filter.section} onChange={e=>setFilter({...filter, section: e.target.value})}
                  className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
            <option value="">— Toutes —</option>
            {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-0.5 font-medium">Professeur</label>
          <select value={filter.prof_id} onChange={e=>setFilter({...filter, prof_id: e.target.value})}
                  className="border border-gray-300 rounded px-2 py-1 text-sm bg-white min-w-[200px]">
            <option value="">— Tous —</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.nom_prenom}</option>)}
          </select>
        </div>
        <button onClick={load} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-1.5 rounded">Filtrer</button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
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
    </div>
  );
}

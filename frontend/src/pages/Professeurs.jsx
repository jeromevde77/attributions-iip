import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

const COLS = [
  { key: 'nom_prenom',           label: 'Nom et prénom' },
  { key: 'statut',               label: 'Statut' },
  { key: 'adresse_mail',         label: 'Email' },
  { key: 'total_per_iip',        label: 'Total IIP',        num: true },
  { key: 'total_hrs_helb',       label: 'Total HELB (hrs)', num: true },
  { key: 'prestations',          label: 'Prestations' },
  { key: 'anciennete_25_26_po',  label: 'Ancienneté PO',    num: true },
];

export default function Professeurs() {
  const [profs, setProfs] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [sortBy, setSortBy] = useState({ key: null, dir: 'asc' });

  useEffect(() => {
    api.professeurs().then(setProfs).finally(() => setLoading(false));
  }, []);

  function toggleSort(key) {
    setSortBy(s => {
      if (s.key !== key) return { key, dir: 'asc' };
      if (s.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  }

  const filtered = useMemo(() => {
    let arr = profs.filter(p =>
      !q || p.nom_prenom?.toLowerCase().includes(q.toLowerCase())
    );
    if (sortBy.key) {
      arr = [...arr].sort((a, b) => {
        const va = a[sortBy.key], vb = b[sortBy.key];
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
    }
    return arr;
  }, [profs, q, sortBy]);

  async function openDetail(id) {
    try { setDetail(await api.professeur(id)); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-title text-iip-gold">Corps professoral</h1>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher..."
               className="border border-gray-300 rounded px-3 py-1.5 text-sm w-80" />
      </div>

      {loading ? <p className="text-gray-400">Chargement…</p> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <table className="grid-excel">
            <thead>
              <tr>
                {COLS.map(c => {
                  const arrow = sortBy.key === c.key ? (sortBy.dir === 'asc' ? ' ▲' : ' ▼') : '';
                  return (
                    <th key={c.key}
                        className={`cursor-pointer select-none hover:bg-iip-amber ${c.num ? 'text-right' : ''}`}
                        onClick={() => toggleSort(c.key)}
                        title="Cliquer pour trier">
                      {c.label}{arrow}
                    </th>
                  );
                })}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td className="font-medium">{p.nom_prenom}</td>
                  <td><span className="badge badge-iip">{p.statut || '—'}</span></td>
                  <td className="text-xs text-gray-600">{p.adresse_mail}</td>
                  <td className="num">{Number(p.total_per_iip || 0).toLocaleString('fr-BE')}</td>
                  <td className="num">{Number(p.total_hrs_helb || 0).toLocaleString('fr-BE')}</td>
                  <td>
                    <span className={p.prestations === 'complètes' ? 'badge badge-pp' : 'badge badge-ct'}>
                      {p.prestations}
                    </span>
                  </td>
                  <td className="num">{p.anciennete_25_26_po}</td>
                  <td>
                    <button onClick={() => openDetail(p.id)}
                            className="text-iip-orange hover:underline text-sm">Voir attributions</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30" onClick={()=>setDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[85vh] overflow-auto p-6" onClick={e=>e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-title text-iip-gold">{detail.nom_prenom}</h2>
                <p className="text-sm text-gray-500">{detail.adresse_mail}</p>
              </div>
              <button onClick={()=>setDetail(null)} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
              <div className="bg-iip-gold/10 rounded p-3"><div className="text-xs text-gray-600">Total IIP</div><div className="font-bold text-lg">{detail.total_per_iip} per.</div></div>
              <div className="bg-iip-mauve/10 rounded p-3"><div className="text-xs text-gray-600">Total HELB</div><div className="font-bold text-lg">{detail.total_hrs_helb} hrs</div></div>
              <div className="bg-iip-orange/10 rounded p-3"><div className="text-xs text-gray-600">Prestations</div><div className="font-bold text-lg">{detail.prestations}</div></div>
            </div>
            <h3 className="font-semibold mb-2">Attributions ({detail.attributions?.length || 0})</h3>
            <table className="grid-excel">
              <thead>
                <tr>
                  <th>Section</th><th>UE</th><th>Cours</th><th>Type</th><th>Gr.</th>
                  <th className="text-right">Per.</th><th className="text-right">Aut.</th><th className="text-right">Total</th><th className="text-right">Hrs</th>
                </tr>
              </thead>
              <tbody>
                {detail.attributions?.map(a => (
                  <tr key={a.id}>
                    <td>{a.section}</td>
                    <td>{a.ue_num}</td>
                    <td className="text-xs">{a.nom_cours}</td>
                    <td>{a.type_cours}</td>
                    <td>{a.code}</td>
                    <td className="num">{a.periodes_attribuees}</td>
                    <td className="num">{a.autonomie_attribuee}</td>
                    <td className="num font-semibold">{a.total_attribue_professeur}</td>
                    <td className="num">{a.charge_en_heures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useCallback } from 'react';
import { api, getAnnee } from '../lib/api.js';

// ─── Définition des entités disponibles ───────────────────────────────────────
const ENTITES = {
  profs: {
    label: 'Professeurs', icon: '👤',
    cols: [
      { key: 'nom',            label: 'Nom',          defaut: true },
      { key: 'prenom',         label: 'Prénom',       defaut: true },
      { key: 'statut',         label: 'Statut',       defaut: true },
      { key: 'adresse_mail',   label: 'E-mail IIP',   defaut: false },
      { key: 'mail_prive',     label: 'E-mail privé', defaut: false },
      { key: 'commune',        label: 'Commune',      defaut: false },
      { key: 'matricule',      label: 'Matricule',    defaut: false },
      { key: 'total_per_iip',  label: 'Pér. IIP',     defaut: true  },
      { key: 'total_hrs_helb', label: 'Hrs HELB',     defaut: false },
      { key: 'anciennete_25_26_po', label: 'Anc. PO', defaut: false },
      { key: 'capaes',         label: 'CAPAES',       defaut: false },
    ],
    fetch: (annee, filtres) => api.professeurs(),
    filtres: [],
  },
  ues: {
    label: 'Unités d\'enseignement', icon: '📚',
    cols: [
      { key: 'ue_num',        label: 'N° UE',      defaut: true  },
      { key: 'ue_nom',        label: 'Nom',         defaut: true  },
      { key: 'section',       label: 'Section',     defaut: true  },
      { key: 'ue_niv',        label: 'Bloc',        defaut: true  },
      { key: 'ue_niveau',     label: 'Niveau',      defaut: false },
      { key: 'ue_quad',       label: 'Quadri',      defaut: true  },
      { key: 'ects',          label: 'ECTS',        defaut: true  },
      { key: 'ue_aut',        label: 'Autonomie',   defaut: false },
      { key: 'ue_per_z',      label: 'Pér. Z',      defaut: false },
      { key: 'et_ref',        label: 'Réf.',        defaut: false },
      { key: 'ue_code_fwb',   label: 'Code FWB',    defaut: false },
      { key: 'ue_tc',         label: 'TC',          defaut: false },
      { key: 'ue_prerequise', label: 'Prérequis',   defaut: false },
    ],
    fetch: (annee, filtres) => fetch(`/api/ref/structure?annee=${encodeURIComponent(annee)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).then(r => r.json()).then(d => {
      const ues = new Map();
      for (const sg of Object.values(d)) for (const ue of sg) if (!ues.has(ue.ue_num)) ues.set(ue.ue_num, ue);
      return [...ues.values()];
    }),
    filtres: ['section', 'niveau', 'bloc'],
  },
  cours: {
    label: 'Cours', icon: '📖',
    cols: [
      { key: 'cours_code',         label: 'Code cours',    defaut: true  },
      { key: 'cours_nom',          label: 'Nom du cours',  defaut: true  },
      { key: 'ue_num',             label: 'N° UE',         defaut: true  },
      { key: 'section',            label: 'Section',       defaut: true  },
      { key: 'ct_pp',              label: 'Type',          defaut: true  },
      { key: 'cours_per',          label: 'Pér. Prof.',    defaut: true  },
      { key: 'heures',             label: 'Heures',        defaut: false },
      { key: 'cours_autonomie',    label: 'Autonomie',     defaut: false },
      { key: 'dedouble',           label: 'Dédoublé',      defaut: false },
      { key: 'quadrimestre_cours', label: 'Quadri',        defaut: false },
    ],
    fetch: (annee, filtres) => fetch(`/api/ref/cours?annee=${encodeURIComponent(annee)}${filtres.section ? '&section=' + encodeURIComponent(filtres.section) : ''}${filtres.ue_num ? '&ue_num=' + encodeURIComponent(filtres.ue_num) : ''}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).then(r => r.json()),
    filtres: ['section', 'ue_num'],
  },
  profs_par_ue: {
    label: 'Profs par UE', icon: '🔗',
    cols: [
      { key: 'professeur',    label: 'Professeur',    defaut: true  },
      { key: 'ue_num',        label: 'N° UE',         defaut: true  },
      { key: 'ue_nom',        label: 'Nom UE',        defaut: true  },
      { key: 'section',       label: 'Section',       defaut: true  },
      { key: 'nom_cours',     label: 'Cours',         defaut: true  },
      { key: 'type_cours',    label: 'Type',          defaut: false },
      { key: 'periodes_attribuees', label: 'Pér.',    defaut: true  },
      { key: 'autonomie_attribuee', label: 'Auto.',   defaut: false },
      { key: 'total_attribue_professeur', label: 'Total', defaut: true },
    ],
    fetch: (annee, filtres) => fetch(`/api/attributions?annee=${encodeURIComponent(annee)}${filtres.section ? '&section=' + encodeURIComponent(filtres.section) : ''}${filtres.ue_num ? '&ue_num=' + encodeURIComponent(filtres.ue_num) : ''}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).then(r => r.json()).then(d => d.filter(r => !r.is_z)),
    filtres: ['section', 'ue_num'],
  },
  profs_par_section: {
    label: 'Profs par section', icon: '🏫',
    cols: [
      { key: 'section',       label: 'Section',    defaut: true  },
      { key: 'professeur',    label: 'Professeur', defaut: true  },
      { key: 'nom_cours',     label: 'Cours',      defaut: true  },
      { key: 'ue_num',        label: 'N° UE',      defaut: false },
      { key: 'type_cours',    label: 'Type',        defaut: false },
      { key: 'periodes_attribuees', label: 'Pér.', defaut: true  },
      { key: 'total_attribue_professeur', label: 'Total', defaut: false },
    ],
    fetch: (annee, filtres) => fetch(`/api/attributions?annee=${encodeURIComponent(annee)}${filtres.section ? '&section=' + encodeURIComponent(filtres.section) : ''}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }).then(r => r.json()).then(d => d.filter(r => !r.is_z)),
    filtres: ['section'],
  },
};

// ─── Export CSV ────────────────────────────────────────────────────────────────
function exportCSV(rows, cols) {
  const header = cols.map(c => `"${c.label}"`).join(';');
  const lines = rows.map(r => cols.map(c => `"${r[c.key] ?? ''}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + header + '\n' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'export_lucie.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ─── Composant principal ───────────────────────────────────────────────────────
export default function Listes() {
  const annee = getAnnee() || '2026-2027';
  const [entite, setEntite] = useState('profs');
  const [colsActives, setColsActives] = useState(() => {
    const e = ENTITES['profs'];
    return new Set(e.cols.filter(c => c.defaut).map(c => c.key));
  });
  const [filtres, setFiltres] = useState({});
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sections, setSections] = useState([]);

  // Charge les sections au premier rendu
  useState(() => {
    api.sections?.()?.then?.(s => setSections(s || [])).catch(() => {});
  });

  const def = ENTITES[entite];

  function changerEntite(k) {
    setEntite(k);
    setRows(null); setError('');
    setFiltres({});
    const e = ENTITES[k];
    setColsActives(new Set(e.cols.filter(c => c.defaut).map(c => c.key)));
  }

  function toggleCol(key) {
    setColsActives(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function generer() {
    setLoading(true); setError('');
    try {
      const data = await def.fetch(annee, filtres);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) { setError(e.message); setRows([]); }
    finally { setLoading(false); }
  }

  const colsVisibles = def.cols.filter(c => colsActives.has(c.key));

  return (
    <div className="flex flex-col h-full min-h-0 gap-0">
      <div className="px-6 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-2xl font-title text-iip-gold mb-1">Listes & Extractions</h1>
        <p className="text-sm text-gray-500">Générez, filtrez et exportez n'importe quelle liste depuis la base Lucie.</p>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ─ Panneau gauche : configuration ─ */}
        <div className="w-64 flex-shrink-0 bg-gray-50 border-r border-gray-200 overflow-auto p-4 space-y-5">

          {/* Entité */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type de liste</div>
            {Object.entries(ENTITES).map(([k, e]) => (
              <button key={k} onClick={() => changerEntite(k)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 transition ${entite === k ? 'bg-iip-gold text-white font-semibold' : 'hover:bg-gray-100 text-gray-700'}`}>
                <span>{e.icon}</span><span>{e.label}</span>
              </button>
            ))}
          </div>

          {/* Filtres */}
          {def.filtres.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filtres</div>
              {def.filtres.includes('section') && (
                <label className="block mb-2">
                  <div className="text-xs text-gray-600 mb-0.5">Section</div>
                  <select value={filtres.section || ''} onChange={e => setFiltres(f => ({ ...f, section: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                    <option value="">— Toutes —</option>
                    {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                  </select>
                </label>
              )}
              {def.filtres.includes('ue_num') && (
                <label className="block mb-2">
                  <div className="text-xs text-gray-600 mb-0.5">N° UE</div>
                  <input type="number" value={filtres.ue_num || ''} onChange={e => setFiltres(f => ({ ...f, ue_num: e.target.value }))}
                    placeholder="Ex: 95" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </label>
              )}
              {def.filtres.includes('niveau') && (
                <label className="block mb-2">
                  <div className="text-xs text-gray-600 mb-0.5">Niveau</div>
                  <select value={filtres.niveau || ''} onChange={e => setFiltres(f => ({ ...f, niveau: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                    <option value="">— Tous —</option>
                    <option value="SUP">SUP</option><option value="DS">DS</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {/* Colonnes */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Colonnes</div>
            {def.cols.map(c => (
              <label key={c.key} className="flex items-center gap-2 py-0.5 text-sm cursor-pointer">
                <input type="checkbox" checked={colsActives.has(c.key)} onChange={() => toggleCol(c.key)} />
                <span className={colsActives.has(c.key) ? 'text-gray-800' : 'text-gray-400'}>{c.label}</span>
              </label>
            ))}
          </div>

          {/* Bouton générer */}
          <button onClick={generer} disabled={loading}
            className="w-full bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition">
            {loading ? 'Chargement…' : '⚡ Générer'}
          </button>
        </div>

        {/* ─ Zone résultats ─ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {rows === null ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
              <span className="text-5xl">📋</span>
              <div className="text-sm">Choisissez un type de liste, configurez vos colonnes et cliquez sur <b>Générer</b>.</div>
            </div>
          ) : (
            <>
              {/* Barre actions */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
                <span className="text-sm text-gray-600">
                  <b>{rows.length}</b> {rows.length > 1 ? 'résultats' : 'résultat'} — {def.label} · {annee}
                  {filtres.section && <span className="ml-2 text-iip-gold font-medium">· {filtres.section}</span>}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => exportCSV(rows, colsVisibles)}
                    className="text-xs border border-gray-300 hover:bg-gray-50 px-3 py-1.5 rounded text-gray-600">
                    ⬇ CSV
                  </button>
                </div>
              </div>
              {error && <div className="bg-red-50 text-red-700 text-sm p-3 m-4 rounded">{error}</div>}
              {/* Tableau */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr>
                      {colsVisibles.map(c => (
                        <th key={c.key} className="text-left px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                        {colsVisibles.map(c => (
                          <td key={c.key} className="px-3 py-1.5 border-b border-gray-100 text-gray-800 max-w-xs truncate">
                            {row[c.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={colsVisibles.length} className="text-center text-gray-400 py-8">Aucun résultat</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

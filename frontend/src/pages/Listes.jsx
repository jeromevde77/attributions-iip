import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { api, getAnnee } from '../lib/api.js';

function getToken() { return localStorage.getItem('token'); }

// ─── Fonction fetch authentifiée ────────────────────────────────────────────
function authFetch(url) {
  return fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

// ─── Définition des entités ─────────────────────────────────────────────────
const ENTITES = {
  profs: {
    label: 'Professeurs', icon: '👤',
    cols: [
      { key: 'nom',            label: 'Nom',          defaut: true  },
      { key: 'prenom',         label: 'Prénom',       defaut: true  },
      { key: 'statut',         label: 'Statut',       defaut: true  },
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
      { key: 'ue_num',        label: 'N° UE',          defaut: true  },
      { key: 'ue_nom',        label: 'Nom',             defaut: true  },
      { key: '_sectionsLabel',label: 'Section(s)',      defaut: true  },
      { key: 'ue_niv',        label: 'Bloc',            defaut: true  },
      { key: 'ue_niveau',     label: 'Niveau',          defaut: false },
      { key: 'ue_quad',       label: 'Quadri',          defaut: true  },
      { key: 'ects',          label: 'ECTS',            defaut: true  },
      { key: 'ue_aut',         label: 'Autonomie (DP)',          defaut: true  },
      { key: 'ue_per_z',       label: 'Pér. Z (7.3)',            defaut: false },
      { key: 'calc_per_cours', label: 'Pér. cours prof (calc.)', defaut: false },
      { key: 'calc_autonomie', label: 'Autonomie (calc.)',        defaut: false },
      { key: 'calc_per_z',     label: 'Pér. Z (calc.)',          defaut: false },
      { key: 'calc_tot_prof',  label: 'Total prof (calc.)',      defaut: false },
      { key: 'ue_per_etudiants', label: 'Périodes étudiant DP', defaut: true  },
      { key: 'et_ref',        label: 'Réf.',            defaut: false },
      { key: 'ue_code_fwb',   label: 'Code FWB',        defaut: false },
      { key: 'ue_tc',         label: 'TC',              defaut: false },
      { key: 'ue_prerequise', label: 'Prérequis',       defaut: false },
    ],
    fetch: (annee, filtres) => authFetch(`/api/ref/structure?annee=${encodeURIComponent(annee)}`).then(d => {
      // d est un TABLEAU d'objets { section, ues: [...] }
      const map = new Map();
      for (const sg of (Array.isArray(d) ? d : [])) {
        for (const ue of (sg.ues || [])) {
          if (!map.has(ue.ue_num)) {
            map.set(ue.ue_num, { ...ue, _sections: new Set() });
          }
          if (sg.section && sg.section !== '(sans section)') {
            map.get(ue.ue_num)._sections.add(sg.section);
          }
        }
      }
      let rows = [...map.values()].map(ue => ({
        ...ue,
        _sectionsLabel: ue._sections.size ? [...ue._sections].sort().join(', ') : '—'
      }));
      if (filtres.section) rows = rows.filter(u => u._sections.has(filtres.section));
      if (filtres.niveau) rows = rows.filter(u => u.ue_niveau === filtres.niveau);
      return rows.sort((a, b) => (a.ue_num || 0) - (b.ue_num || 0));
    }),
    filtres: ['section', 'niveau'],
  },
  cours: {
    label: 'Cours', icon: '📖',
    cols: [
      { key: 'cours_code',         label: 'Code cours',   defaut: true  },
      { key: 'cours_nom',          label: 'Nom du cours', defaut: true  },
      { key: 'ue_num',             label: 'N° UE',        defaut: true  },
      { key: 'section',            label: 'Section',      defaut: true  },
      { key: 'ct_pp',              label: 'Type',         defaut: true  },
      { key: 'cours_per',          label: 'Pér. Prof.',   defaut: true  },
      { key: 'heures',             label: 'Heures',       defaut: false },
      { key: 'cours_autonomie',    label: 'Autonomie',    defaut: false },
      { key: 'dedouble',           label: 'Dédoublé',     defaut: false },
      { key: 'quadrimestre_cours', label: 'Quadri cours', defaut: false },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/ref/cours?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      if (filtres.ue_num)  url += `&ue_num=${encodeURIComponent(filtres.ue_num)}`;
      return authFetch(url);
    },
    filtres: ['section', 'ue_num'],
  },
  profs_par_ue: {
    label: 'Profs par UE', icon: '🔗',
    cols: [
      { key: 'professeur',    label: 'Professeur',  defaut: true  },
      { key: 'ue_num',        label: 'N° UE',        defaut: true  },
      { key: 'ue_nom',        label: 'Nom UE',       defaut: true  },
      { key: 'section',       label: 'Section',      defaut: true  },
      { key: 'nom_cours',     label: 'Cours',        defaut: true  },
      { key: 'type_cours',    label: 'Type',         defaut: false },
      { key: 'periodes_attribuees',         label: 'Pér.',   defaut: true  },
      { key: 'autonomie_attribuee',         label: 'Auto.',  defaut: false },
      { key: 'total_attribue_professeur',   label: 'Total',  defaut: true  },
      { key: 'charge_en_heures',            label: 'Heures', defaut: false },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/attributions?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      if (filtres.ue_num)  url += `&ue_num=${encodeURIComponent(filtres.ue_num)}`;
      return authFetch(url).then(d => d.filter(r => !r.is_z && r.professeur_id));
    },
    filtres: ['section', 'ue_num'],
  },
  profs_par_section: {
    label: 'Profs par section', icon: '🏫',
    cols: [
      { key: 'section',       label: 'Section',     defaut: true  },
      { key: 'professeur',    label: 'Professeur',  defaut: true  },
      { key: 'ue_num',        label: 'N° UE',       defaut: false },
      { key: 'ue_nom',        label: 'Nom UE',      defaut: false },
      { key: 'nom_cours',     label: 'Cours',       defaut: true  },
      { key: 'type_cours',    label: 'Type',        defaut: false },
      { key: 'periodes_attribuees',       label: 'Pér.',  defaut: true  },
      { key: 'total_attribue_professeur', label: 'Total', defaut: false },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/attributions?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      return authFetch(url).then(d => d.filter(r => !r.is_z && r.professeur_id));
    },
    filtres: ['section'],
  },
  synthese_charge: {
    label: 'Synthèse charge / prof', icon: '⚖️',
    cols: [
      { key: 'professeur',    label: 'Professeur',  defaut: true  },
      { key: 'section',       label: 'Section',     defaut: true  },
      { key: 'nb_cours',      label: 'Nb cours',    defaut: true  },
      { key: 'total_per',     label: 'Total pér.',  defaut: true  },
      { key: 'total_heures',  label: 'Total heures',defaut: true  },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/attributions?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      return authFetch(url).then(d => {
        const map = new Map();
        for (const r of d) {
          if (!r.professeur_id || r.is_z) continue;
          const k = `${r.professeur_id}||${r.section}`;
          if (!map.has(k)) map.set(k, { professeur: r.professeur, section: r.section, nb_cours: 0, total_per: 0, total_heures: 0 });
          const g = map.get(k);
          g.nb_cours++;
          g.total_per += Number(r.total_attribue_professeur) || 0;
          g.total_heures = Math.round((g.total_per * 50 / 60) * 10) / 10;
        }
        return [...map.values()].sort((a, b) => (a.section || '').localeCompare(b.section || '') || (a.professeur || '').localeCompare(b.professeur || ''));
      });
    },
    filtres: ['section'],
  },
  ues_sans_attribution: {
    label: 'UE sans attribution', icon: '⚠️',
    cols: [
      { key: 'ue_num',  label: 'N° UE',  defaut: true  },
      { key: 'ue_nom',  label: 'Nom',    defaut: true  },
      { key: 'section', label: 'Section',defaut: true  },
      { key: 'ue_quad', label: 'Quadri', defaut: true  },
      { key: 'ects',    label: 'ECTS',   defaut: false },
    ],
    fetch: (annee, filtres) => authFetch(`/api/ref/structure?annee=${encodeURIComponent(annee)}`).then(d => {
      const map = new Map();
      for (const sg of (Array.isArray(d) ? d : [])) {
        for (const ue of (sg.ues || [])) {
          if (!map.has(ue.ue_num)) map.set(ue.ue_num, { ...ue, nb_attributions: ue.nb_attributions || 0 });
        }
      }
      return [...map.values()].filter(u => !u.nb_attributions).sort((a, b) => (a.ue_num || 0) - (b.ue_num || 0));
    }),
    filtres: ['section'],
  },
};

// ─── Exports ─────────────────────────────────────────────────────────────────
function exportCSV(rows, cols, nom) {
  const header = cols.map(c => `"${c.label}"`).join(';');
  const lines = rows.map(r => cols.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + header + '\n' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${nom}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function exportExcel(rows, cols, nom) {
  const data = [cols.map(c => c.label), ...rows.map(r => cols.map(c => r[c.key] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Export');
  XLSX.writeFile(wb, `${nom}.xlsx`);
}

// ─── Composant principal ─────────────────────────────────────────────────────
export default function Listes() {
  const annee = getAnnee() || '2026-2027';
  const [entite, setEntite] = useState('profs');
  const [colsActives, setColsActives] = useState(() => new Set(ENTITES['profs'].cols.filter(c => c.defaut).map(c => c.key)));
  const [filtres, setFiltres] = useState({});
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sections, setSections] = useState([]);

  useEffect(() => {
    api.sections().then(s => setSections(Array.isArray(s) ? s : [])).catch(() => {});
  }, []);

  const def = ENTITES[entite];

  function changerEntite(k) {
    setEntite(k);
    setRows(null); setError(''); setFiltres({});
    setColsActives(new Set(ENTITES[k].cols.filter(c => c.defaut).map(c => c.key)));
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
  const nomFichier = `lucie_${entite}_${annee}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* En-tête */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
        <h1 className="text-2xl font-title text-iip-gold mb-1">Listes &amp; Extractions</h1>
        <p className="text-sm text-gray-500">Générez, filtrez et exportez n'importe quelle liste — CSV ou Excel.</p>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Panneau gauche ── */}
        <div className="w-64 flex-shrink-0 bg-gray-50 border-r border-gray-200 overflow-auto p-4 space-y-5">

          {/* Type de liste */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type de liste</div>
            {Object.entries(ENTITES).map(([k, e]) => (
              <button key={k} onClick={() => changerEntite(k)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 transition
                  ${entite === k ? 'bg-iip-gold text-white font-semibold' : 'hover:bg-gray-100 text-gray-700'}`}>
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
                    placeholder="ex: 95" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
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
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Colonnes</div>
              <button onClick={() => setColsActives(new Set(def.cols.map(c => c.key)))}
                className="text-xs text-iip-gold hover:underline">tout</button>
            </div>
            {def.cols.map(c => (
              <label key={c.key} className="flex items-center gap-2 py-0.5 text-sm cursor-pointer">
                <input type="checkbox" checked={colsActives.has(c.key)} onChange={() => toggleCol(c.key)} />
                <span className={colsActives.has(c.key) ? 'text-gray-800' : 'text-gray-400'}>{c.label}</span>
              </label>
            ))}
          </div>

          {/* Bouton */}
          <button onClick={generer} disabled={loading}
            className="w-full bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition">
            {loading ? 'Chargement…' : '⚡ Générer'}
          </button>
        </div>

        {/* ── Zone résultats ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {rows === null ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
              <span className="text-5xl">📋</span>
              <p className="text-sm">Choisissez un type, configurez vos colonnes, cliquez <b>Générer</b>.</p>
            </div>
          ) : (
            <>
              {/* Barre d'actions */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
                <span className="text-sm text-gray-600">
                  <b>{rows.length}</b> résultat{rows.length > 1 ? 's' : ''} · {def.label} · {annee}
                  {filtres.section && <span className="ml-2 font-medium text-iip-gold">· {filtres.section}</span>}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => exportCSV(rows, colsVisibles, nomFichier)}
                    disabled={rows.length === 0}
                    className="text-xs border border-gray-300 hover:bg-gray-50 disabled:opacity-40 px-3 py-1.5 rounded text-gray-600">
                    ⬇ CSV
                  </button>
                  <button onClick={() => exportExcel(rows, colsVisibles, nomFichier)}
                    disabled={rows.length === 0}
                    className="text-xs border border-green-500 text-green-700 hover:bg-green-50 disabled:opacity-40 px-3 py-1.5 rounded font-medium">
                    ⬇ Excel
                  </button>
                </div>
              </div>
              {error && <div className="bg-red-50 text-red-700 text-sm p-3 mx-4 mt-2 rounded">{error}</div>}
              {/* Tableau */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr>
                      {colsVisibles.map(c => (
                        <th key={c.key} className="text-left px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={i % 2 ? 'bg-gray-50/50' : ''}>
                        {colsVisibles.map(c => (
                          <td key={c.key} className="px-3 py-1.5 border-b border-gray-100 text-gray-800 max-w-xs truncate" title={String(row[c.key] ?? '')}>
                            {row[c.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={colsVisibles.length || 1} className="text-center text-gray-400 py-8">Aucun résultat</td></tr>
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

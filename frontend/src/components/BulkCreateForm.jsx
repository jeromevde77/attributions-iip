import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Modale de création en masse d'attributions pour une section.
 * L'utilisateur :
 *   1. Choisit une section
 *   2. Voit la liste des UE avec leurs cours et statut "déjà créé"
 *   3. Coche les UE souhaitées
 *   4. Confirme → crée les attributions squelette manquantes
 */
export default function BulkCreateForm({ onClose, onCreated }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [ues, setUes] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { api.sections().then(setSections).catch(console.error); }, []);

  useEffect(() => {
    if (!section) { setUes([]); setSelected(new Set()); return; }
    setLoading(true);
    api.sectionUeCours(section)
      .then(data => {
        setUes(data);
        // pré-cocher uniquement les UE qui ont des cours manquants
        const auto = new Set(data.filter(u => u.cours_manquants > 0).map(u => u.ue_num));
        setSelected(auto);
      })
      .catch(e => alert(e.message))
      .finally(() => setLoading(false));
  }, [section]);

  function toggle(ueNum) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(ueNum)) next.delete(ueNum); else next.add(ueNum);
      return next;
    });
  }
  function selectAll()      { setSelected(new Set(ues.map(u => u.ue_num))); }
  function selectNone()     { setSelected(new Set()); }
  function selectMissing()  { setSelected(new Set(ues.filter(u => u.cours_manquants > 0).map(u => u.ue_num))); }

  // Statistiques de la sélection
  const stats = ues.reduce((acc, u) => {
    if (selected.has(u.ue_num)) {
      acc.cours += u.cours_total;
      acc.manquants += u.cours_manquants;
    }
    return acc;
  }, { cours: 0, manquants: 0 });

  async function submit() {
    if (selected.size === 0) return;
    setCreating(true);
    try {
      const r = await api.bulkCreateFromSection(section, Array.from(selected));
      setResult(r);
      if (r.created > 0) onCreated?.();
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="border-b border-gray-200 p-5 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-title text-iip-gold">Créer toute une section</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 overflow-auto flex-1">
          {result ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-lg font-semibold mb-2">Création terminée</h3>
              <p className="text-gray-600">
                <b>{result.created}</b> attribution(s) créée(s)
                {result.skipped > 0 && <> · <b>{result.skipped}</b> ignorée(s) (déjà existante(s))</>}
              </p>
              <button onClick={onClose} className="mt-6 bg-iip-gold hover:bg-iip-amber text-white text-sm px-5 py-2 rounded font-medium">
                Fermer
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Crée des attributions squelette (sans professeur ni périodes) pour chaque cours
                des UE sélectionnées. Les attributions déjà existantes ne sont pas dupliquées.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                <select value={section} onChange={e => setSection(e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  <option value="">— Choisir —</option>
                  {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                </select>
              </div>

              {loading && <p className="text-gray-400">Chargement des UE…</p>}

              {section && !loading && ues.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-2 mb-3 text-xs">
                    <button onClick={selectAll}     className="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded">Tout cocher</button>
                    <button onClick={selectMissing} className="bg-iip-gold/10 hover:bg-iip-gold/20 text-iip-gold px-3 py-1 rounded font-medium">Seulement les manquants</button>
                    <button onClick={selectNone}    className="bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded">Tout décocher</button>
                  </div>

                  <div className="border border-gray-200 rounded overflow-hidden">
                    <table className="grid-excel">
                      <thead>
                        <tr>
                          <th className="w-10"></th>
                          <th>UE</th>
                          <th>Nom de l'UE</th>
                          <th>Bloc</th>
                          <th className="text-right">Cours</th>
                          <th className="text-right">Couverts</th>
                          <th className="text-right">À créer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ues.map(u => {
                          const isSelected = selected.has(u.ue_num);
                          const allCovered = u.cours_manquants === 0;
                          return (
                            <tr key={u.ue_num}
                                onClick={() => toggle(u.ue_num)}
                                className={`cursor-pointer ${isSelected ? 'bg-yellow-50' : ''} ${allCovered ? 'opacity-60' : ''}`}>
                              <td className="text-center">
                                <input type="checkbox" checked={isSelected} onChange={() => {}} className="cursor-pointer" />
                              </td>
                              <td>{u.ue_num}</td>
                              <td className="text-xs">{u.ue_nom}</td>
                              <td>{u.bloc || '—'}</td>
                              <td className="num">{u.cours_total}</td>
                              <td className="num">
                                {u.cours_couverts > 0
                                  ? <span className="text-green-600">{u.cours_couverts}</span>
                                  : '—'}
                              </td>
                              <td className="num">
                                {u.cours_manquants > 0
                                  ? <span className="text-orange-600 font-semibold">{u.cours_manquants}</span>
                                  : <span className="text-gray-400">0</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {section && !loading && ues.length === 0 && (
                <p className="text-gray-500 italic">Aucune UE/cours dans BD_UE_COURS pour cette section.</p>
              )}
            </>
          )}
        </div>

        {!result && (
          <div className="border-t border-gray-200 p-4 flex items-center justify-between flex-shrink-0">
            <div className="text-sm text-gray-600">
              {selected.size > 0 && (
                <>
                  <b>{selected.size}</b> UE sélectionnée(s) ·{' '}
                  <b>{stats.cours}</b> cours dont <b className="text-orange-600">{stats.manquants}</b> à créer
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
              <button onClick={submit} disabled={creating || stats.manquants === 0}
                      className="bg-iip-gold hover:bg-iip-amber disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm px-5 py-2 rounded font-medium">
                {creating ? 'Création…' : `✓ Créer ${stats.manquants} attribution${stats.manquants > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

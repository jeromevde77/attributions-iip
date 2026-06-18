import { useEffect, useState } from 'react';
import { IconChevronRight } from '@tabler/icons-react';
import { api } from '../lib/api.js';

/**
 * Assistant d'import sélectif d'UE depuis une année source vers une année cible.
 * Affiche un accordéon Section → UE avec cases à cocher.
 *
 * Props :
 *  - source : code année source (ex. '2025-2026')
 *  - cible  : code année cible (ex. '2026-2027')
 *  - onClose()
 *  - onDone(result) : appelé après import réussi
 */
export default function ImportUEAssistant({ source, cible, onClose, onDone }) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(new Set());      // ue_num cochés
  const [openSecs, setOpenSecs] = useState(new Set());
  const [avecAttr, setAvecAttr] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.importPreview(source, cible)
      .then(setTree)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [source, cible]);

  function toggleUE(ueNum) {
    setChecked(s => { const n = new Set(s); n.has(ueNum) ? n.delete(ueNum) : n.add(ueNum); return n; });
  }
  function toggleSec(sg) {
    // coche/décoche toutes les UE importables (non déjà présentes) de la section
    const importables = sg.ues.filter(u => !u.deja_presente).map(u => u.ue_num);
    const allChecked = importables.every(n => checked.has(n));
    setChecked(s => {
      const n = new Set(s);
      if (allChecked) importables.forEach(x => n.delete(x));
      else importables.forEach(x => n.add(x));
      return n;
    });
  }
  function toggleOpen(sec) {
    setOpenSecs(s => { const n = new Set(s); n.has(sec) ? n.delete(sec) : n.add(sec); return n; });
  }
  function selectAll() {
    const all = new Set();
    tree.forEach(sg => sg.ues.forEach(u => { if (!u.deja_presente) all.add(u.ue_num); }));
    setChecked(all);
  }
  function selectNone() { setChecked(new Set()); }

  async function doImport() {
    if (checked.size === 0) { setError('Sélectionnez au moins une UE'); return; }
    setImporting(true); setError('');
    try {
      const result = await api.importUEs({
        source, cible, ue_nums: Array.from(checked), avec_attributions: avecAttr
      });
      onDone?.(result);
    } catch (e) { setError(e.message); }
    finally { setImporting(false); }
  }

  const totalImportable = tree.reduce((s, sg) => s + sg.ues.filter(u => !u.deja_presente).length, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border-t-4 border-iip-gold">
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <div>
            <h2 className="font-title text-lg text-iip-gold">Importer des UE</h2>
            <p className="text-xs text-gray-500">Depuis {source} → vers {cible}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl">×</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Chargement…</div>
        ) : (
          <>
            <div className="px-5 py-2 border-b flex items-center gap-3 flex-wrap text-sm flex-shrink-0">
              <button onClick={selectAll} className="text-iip-gold hover:underline">Tout cocher</button>
              <button onClick={selectNone} className="text-gray-500 hover:underline">Tout décocher</button>
              <span className="text-gray-400">·</span>
              <span className="text-gray-600"><b>{checked.size}</b> / {totalImportable} UE sélectionnées</span>
              <label className="flex items-center gap-1.5 ml-auto text-xs cursor-pointer">
                <input type="checkbox" checked={avecAttr} onChange={e => setAvecAttr(e.target.checked)} />
                Importer aussi les attributions (profs, périodes)
              </label>
            </div>

            <div className="flex-1 overflow-auto px-5 py-3 space-y-2">
              {tree.length === 0 && <p className="text-gray-400 text-center py-4">Aucune UE dans l'année source.</p>}
              {tree.map(sg => {
                const importables = sg.ues.filter(u => !u.deja_presente);
                const allChecked = importables.length > 0 && importables.every(u => checked.has(u.ue_num));
                const isOpen = openSecs.has(sg.section);
                return (
                  <div key={sg.section} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
                      <input type="checkbox" checked={allChecked} onChange={() => toggleSec(sg)}
                             disabled={importables.length === 0} />
                      <button onClick={() => toggleOpen(sg.section)} className="flex items-center gap-2 flex-1 text-left">
                        <IconChevronRight size={14} className={`text-iip-gold text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        <span className="font-semibold text-iip-gold text-sm">{sg.section}</span>
                        <span className="text-xs text-gray-400">{sg.ues.length} UE</span>
                      </button>
                    </div>
                    {isOpen && (
                      <div className="divide-y divide-gray-100">
                        {sg.ues.map(u => (
                          <label key={u.ue_num}
                                 className={`flex items-center gap-2 px-3 py-1.5 text-sm ${u.deja_presente ? 'opacity-40' : 'hover:bg-iip-gold/5 cursor-pointer'}`}>
                            <input type="checkbox" checked={checked.has(u.ue_num)} disabled={u.deja_presente}
                                   onChange={() => toggleUE(u.ue_num)} />
                            <span className="font-medium text-iip-gold">UE {u.ue_num}</span>
                            {u.ue_niv && <span className="text-xs bg-gray-100 px-1 rounded">{u.ue_niv}</span>}
                            <span className="truncate flex-1">{u.ue_nom}</span>
                            <span className="text-xs text-gray-400">{u.nb_cours} cours</span>
                            {u.deja_presente && <span className="text-xs text-green-600">✓ déjà importée</span>}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {error && <div className="px-5 py-2 text-sm text-red-600 flex-shrink-0">{error}</div>}
            <div className="flex justify-end gap-2 px-5 py-3 border-t flex-shrink-0">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
              <button onClick={doImport} disabled={importing || checked.size === 0}
                      className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
                {importing ? 'Import…' : `Importer ${checked.size} UE`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

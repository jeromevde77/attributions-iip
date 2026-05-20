import { useEffect, useState } from 'react';
import { api, getAnnee, setAnnee } from '../lib/api.js';

export default function Annees() {
  const [annees, setAnnees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', libelle: '', source: '', mode: 'vide' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const anneeActive = getAnnee();

  async function load() {
    setLoading(true);
    try { setAnnees(await api.annees()); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Suggestions de code pour la prochaine année
  function nextYear() {
    const last = annees[0]?.code || '2025-2026';
    const [y1, y2] = last.split('-').map(Number);
    return `${y1+1}-${y2+1}`;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.code) return alert('Saisissez un code d\'année (ex: 2026-2027)');
    setSaving(true);
    try {
      const res = await api.createAnnee({
        code: form.code,
        libelle: form.libelle || `Année ${form.code}`,
        source: form.mode === 'copie' ? form.source : null
      });
      alert(res.copied > 0
        ? `Année ${form.code} créée avec ${res.copied} attribution(s) copiées depuis ${form.source}.`
        : `Année ${form.code} créée (vide).`);
      setShowForm(false);
      setForm({ code: '', libelle: '', source: '', mode: 'vide' });
      load();
    } catch(e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(code) {
    if (!confirm(`Supprimer l'année ${code} et TOUTES ses attributions ? Cette action est irréversible.`)) return;
    setDeleting(code);
    try {
      const r = await api.deleteAnnee(code);
      alert(`Année ${code} supprimée (${r.deleted} attribution(s) effacées).`);
      if (anneeActive === code) { setAnnee(annees.find(a=>a.code!==code)?.code || '2025-2026'); window.location.reload(); }
      load();
    } catch(e) { alert('Erreur : ' + e.message); }
    finally { setDeleting(null); }
  }

  function activerAnnee(code) {
    setAnnee(code);
    window.location.reload();
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-title text-iip-gold">Années scolaires</h1>
        <button onClick={() => { setShowForm(true); setForm({ code: nextYear(), libelle: `Année ${nextYear()}`, source: annees[annees.length-1]?.code || '2025-2026', mode: 'copie' }); }}
          className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-2 rounded font-medium">
          ➕ Nouvelle année
        </button>
      </div>

      {/* Liste des années */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? <div className="p-8 text-center text-gray-400">Chargement…</div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2">Année</th>
                <th className="text-left px-4 py-2">Libellé</th>
                <th className="text-right px-4 py-2">Créée le</th>
                <th className="text-right px-4 py-2 w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {annees.map(a => (
                <tr key={a.code} className={`border-t border-gray-100 ${a.code === anneeActive ? 'bg-iip-gold/5' : ''}`}>
                  <td className="px-4 py-3 font-semibold">
                    {a.code}
                    {a.code === anneeActive && <span className="ml-2 text-xs bg-iip-gold text-white px-1.5 py-0.5 rounded">active</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.libelle}</td>
                  <td className="px-4 py-3 text-gray-400 text-right">{a.created_at ? new Date(a.created_at).toLocaleDateString('fr-BE') : '—'}</td>
                  <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                    {a.code !== anneeActive && (
                      <button onClick={() => activerAnnee(a.code)}
                        className="text-iip-gold hover:underline text-xs">
                        Activer
                      </button>
                    )}
                    {a.code !== '2025-2026' && (
                      <button onClick={() => handleDelete(a.code)} disabled={deleting === a.code}
                        className="text-red-500 hover:text-red-700 text-xs disabled:opacity-40">
                        {deleting === a.code ? '…' : '🗑 Supprimer'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Formulaire création */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40"
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border-t-4 border-iip-gold">
            <h2 className="text-xl font-title text-iip-gold mb-4">Nouvelle année scolaire</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Code <span className="text-red-500">*</span></label>
                <input value={form.code} onChange={e => setForm({...form, code: e.target.value})}
                  placeholder="ex: 2026-2027" pattern="\d{4}-\d{4}"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-iip-gold" required />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Libellé</label>
                <input value={form.libelle} onChange={e => setForm({...form, libelle: e.target.value})}
                  placeholder={`Année ${form.code}`}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-2">Données de départ</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value="vide" checked={form.mode==='vide'} onChange={() => setForm({...form, mode:'vide'})} />
                    <span className="text-sm">Page blanche <span className="text-gray-400">(réimporter les Excel ensuite)</span></span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value="copie" checked={form.mode==='copie'} onChange={() => setForm({...form, mode:'copie'})} />
                    <span className="text-sm">Copier depuis une année existante</span>
                  </label>
                </div>
                {form.mode === 'copie' && (
                  <div className="mt-2 ml-6">
                    <select value={form.source} onChange={e => setForm({...form, source: e.target.value})}
                      className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-iip-gold">
                      {annees.map(a => <option key={a.code} value={a.code}>{a.code} — {a.libelle}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Structure copiée (section, UE, cours, contrat, périodes). Les professeurs sont réinitialisés.</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
                <button type="submit" disabled={saving}
                  className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
                  {saving ? 'Création…' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

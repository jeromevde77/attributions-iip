import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

const CODES_EPT = [
  { code: '95', label: 'ExPT — Expertise Pédagogique et Technique' },
  { code: '96', label: 'SEtu — Admission, suivi pédagogique et sanction' },
  { code: '97', label: 'PeSu — Périodes supplémentaires' },
  { code: '98', label: 'PSup — Part supplémentaire' },
  { code: '99', label: 'CEtu — Conseil des études' },
];

export default function EptModal({ section, ue_num, ue_nom, annee, onClose }) {
  const [lignes, setLignes]       = useState([]);
  const [profs, setProfs]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ code_ept: '95', professeur_id: '', periodes: '' });
  const [numOrg, setNumOrg]       = useState(null);

  async function charger() {
    setLoading(true);
    try {
      const tok = localStorage.getItem('token');
      const d = await fetch(
        `/api/attributions/ept?section=${encodeURIComponent(section)}&ue_num=${ue_num}&annee=${encodeURIComponent(annee)}`,
        { headers: { Authorization: `Bearer ${tok}` } }
      ).then(r => r.json());
      setLignes(d);
      // Déterminer num_organisation commun (toutes les lignes EPT partagent le même org)
      if (d.length > 0) setNumOrg(d[0].num_organisation);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    charger();
    // Charger la liste des profs
    const tok = localStorage.getItem('token');
    fetch('/api/ref/professeurs?tous=1', { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json()).then(setProfs).catch(() => {});
  }, []);

  async function ajouterLigne() {
    if (!form.professeur_id || !form.periodes) return;
    setSaving(true);
    try {
      const tok = localStorage.getItem('token');
      await fetch('/api/attributions/ept', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section, ue_num, annee,
          code_ept: form.code_ept,
          professeur_id: parseInt(form.professeur_id),
          periodes: parseInt(form.periodes),
          num_organisation: numOrg || undefined,
        }),
      }).then(r => r.json());
      await charger();
      setForm(f => ({ ...f, periodes: '' }));
    } catch(e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  async function supprimerLigne(id) {
    if (!confirm('Supprimer cette ligne EPT ?')) return;
    const tok = localStorage.getItem('token');
    await fetch(`/api/attributions/ept/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tok}` },
    });
    await charger();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <div className="font-bold text-iip-gold text-lg">Lignes EPT — UE {ue_num}</div>
            <div className="text-xs text-gray-500">{ue_nom} · {section} · {annee}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl">×</button>
        </div>

        {/* Lignes existantes */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading ? (
            <div className="text-gray-400 text-sm text-center py-4">Chargement...</div>
          ) : lignes.length === 0 ? (
            <div className="text-gray-400 text-sm text-center py-4 italic">Aucune ligne EPT pour cette UE</div>
          ) : (
            <table className="w-full text-sm border-collapse mb-4">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Professeur</th>
                  <th className="px-3 py-2 text-right">Périodes</th>
                  <th className="px-3 py-2 text-center">Org.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={l.id} className={`border-t ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                    <td className="px-3 py-2 font-mono font-bold text-blue-700">{l.code_ept}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{l.libelle_ept}</td>
                    <td className="px-3 py-2">{l.prof_nom}</td>
                    <td className="px-3 py-2 text-right font-semibold">{l.periodes}</td>
                    <td className="px-3 py-2 text-center text-gray-400 text-xs">Org {l.num_organisation}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => supprimerLigne(l.id)}
                        className="text-red-400 hover:text-red-600 text-xs">🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Formulaire ajout */}
          <div className="border border-blue-100 bg-blue-50/40 rounded-lg p-4">
            <div className="text-xs font-semibold text-blue-700 mb-3 uppercase tracking-wider">Ajouter une ligne</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Code EPT</label>
                <select value={form.code_ept} onChange={e => setForm(f => ({ ...f, code_ept: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                  {CODES_EPT.map(c => (
                    <option key={c.code} value={c.code}>{c.code} — {c.label.split('—')[1]?.trim() || c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Périodes</label>
                <input type="number" min="0" value={form.periodes}
                  onChange={e => setForm(f => ({ ...f, periodes: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  placeholder="0" />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">Professeur</label>
              <select value={form.professeur_id} onChange={e => setForm(f => ({ ...f, professeur_id: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                <option value="">— Choisir un professeur —</option>
                {[...profs].sort((a,b) => a.nom.localeCompare(b.nom)).map(p => (
                  <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>
                ))}
              </select>
            </div>
            <button onClick={ajouterLigne} disabled={saving || !form.professeur_id || !form.periodes}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded disabled:opacity-50">
              {saving ? 'Ajout...' : '＋ Ajouter'}
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-t flex justify-end">
          <button onClick={onClose} className="bg-iip-gold text-white px-4 py-1.5 rounded text-sm hover:bg-iip-amber">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

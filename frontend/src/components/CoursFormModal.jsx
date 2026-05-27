import { useState } from 'react';
import { api, getUser } from '../lib/api.js';

/**
 * Modale de création / édition d'un COURS du référentiel (table cours).
 * Refonte dossier pédagogique :
 *  - Type : CG / CT / PP (Z géré au niveau de l'UE, pas ici)
 *  - Périodes Prof. (cours_per) : périodes attribuables, coûtent à la dotation
 *  - Quadri du cours (≠ quadri de l'UE qui impacte la dotation)
 *  - Heures : horaire réel en heures (multiples de 60 min, fait par la coordination)
 *  - Autonomie du cours (cours_autonomie) : part de 7.2 proposée pour ce cours
 *  - Dédoublé : si O, périodes ET autonomie comptent ×2
 *  - Admin : peut forcer le code cours (vérif unicité + propagation backend)
 */
export default function CoursFormModal({ cours, ueNum, section, onClose, onSaved }) {
  const isNew = !cours?._edit;
  const me = getUser?.();
  const isAdmin = me?.role === 'admin';
  const [form, setForm] = useState({
    cours_code: cours?.cours_code || '', cours_nom: cours?.cours_nom || '',
    ct_pp: cours?.ct_pp || '', cours_per: cours?.cours_per || '',
    quadrimestre_cours: cours?.quadrimestre_cours || '',
    heures: cours?.heures || '',
    cours_autonomie: cours?.cours_autonomie || '', dedouble: cours?.dedouble || 'N',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Forçage du code cours (admin)
  const [renaming, setRenaming] = useState(false);
  const [newCode, setNewCode] = useState('');
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.cours_code || !form.cours_nom) { setError('Code et nom requis'); return; }
    setSaving(true);
    try {
      if (isNew) await api.createCours({ ...form, ue_num: ueNum, section });
      else await api.updateCours(cours.cours_code, form);
      onSaved?.(form.cours_code);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function forcerCode() {
    const code = newCode.trim();
    if (!code || code === cours.cours_code) { setRenaming(false); return; }
    setSaving(true); setError('');
    try {
      await api.renameCoursCode(cours.cours_code, code);
      onSaved?.(code);
    } catch (e) { setError(e.message); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border-t-4 border-iip-mauve">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-title text-lg text-iip-mauve">{isNew ? `Nouveau cours${ueNum ? ` (UE ${ueNum})` : ''}` : `Modifier ${cours.cours_code}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl">×</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <label className="block"><div className="text-xs text-gray-600 mb-0.5">Code cours *</div>
            <div className="flex gap-2 items-center">
              <input value={form.cours_code} onChange={e => set('cours_code', e.target.value)} disabled={!isNew} placeholder="ex: 246.1"
                className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm font-mono disabled:bg-gray-100" />
              {!isNew && isAdmin && !renaming && (
                <button type="button" onClick={() => { setRenaming(true); setNewCode(cours.cours_code); }}
                  className="text-xs text-iip-mauve border border-iip-mauve/40 rounded px-2 py-1 hover:bg-iip-mauve/5 whitespace-nowrap" title="Forcer le code (admin)">✎ Forcer</button>
              )}
            </div>
          </label>
          {renaming && (
            <div className="bg-iip-mauve/5 border border-iip-mauve/30 rounded p-3 space-y-2">
              <div className="text-xs text-gray-700">⚠️ Forcer le code mettra à jour le cours, ses attributions et ses activités liées. Lucie vérifie que le nouveau code n'existe pas.</div>
              <div className="flex gap-2">
                <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Nouveau code"
                  className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm font-mono" />
                <button type="button" onClick={forcerCode} disabled={saving}
                  className="bg-iip-mauve text-white text-sm px-3 py-1.5 rounded disabled:opacity-40">Forcer</button>
                <button type="button" onClick={() => setRenaming(false)} className="text-sm text-gray-500 px-2">Annuler</button>
              </div>
            </div>
          )}
          <label className="block"><div className="text-xs text-gray-600 mb-0.5">Nom du cours *</div>
            <input value={form.cours_nom} onChange={e => set('cours_nom', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Type</div>
              <select value={form.ct_pp} onChange={e => set('ct_pp', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option><option value="CG">CG</option><option value="CT">CT</option><option value="PP">PP</option>
              </select></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Périodes Prof.</div>
              <input type="number" value={form.cours_per} onChange={e => set('cours_per', e.target.value)}
                className="w-full border border-iip-gold/40 rounded px-3 py-1.5 text-sm bg-iip-gold/5" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Quadri du cours</div>
              <select value={form.quadrimestre_cours} onChange={e => set('quadrimestre_cours', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q1/Q2">Q1/Q2</option>
              </select></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Heures</div>
              <input type="number" value={form.heures} onChange={e => set('heures', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Autonomie du cours</div>
              <input type="number" value={form.cours_autonomie} onChange={e => set('cours_autonomie', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Dédoublé</div>
              <select value={form.dedouble} onChange={e => set('dedouble', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="N">Non</option><option value="O">Oui (×2)</option>
              </select></label>
          </div>
          {error && <div className="bg-red-50 text-red-700 text-sm rounded p-2">{error}</div>}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
            <button type="submit" disabled={saving} className="bg-iip-mauve hover:opacity-90 disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
              {saving ? '…' : isNew ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

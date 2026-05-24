import { useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Modale de création / édition d'un COURS du référentiel (table cours),
 * avec son cours_per (périodes prévues), type, quadrimestre.
 * Partagée entre le module Référentiels et la page Attributions.
 *
 * Props :
 *  - cours : objet cours existant (avec _edit:true) ou {} pour création
 *  - ueNum, section : contexte de rattachement (création)
 *  - onClose() : fermeture
 *  - onSaved(coursCode) : après succès, reçoit le code du cours créé/modifié
 */
export default function CoursFormModal({ cours, ueNum, section, onClose, onSaved }) {
  const isNew = !cours?._edit;
  const [form, setForm] = useState({
    cours_code: cours?.cours_code || '', cours_nom: cours?.cours_nom || '',
    ct_pp: cours?.ct_pp || '', cours_per: cours?.cours_per || '',
    quadrimestre_cours: cours?.quadrimestre_cours || '', ue_niveau: cours?.ue_niveau || '',
    cours_num: cours?.cours_num || '', cours_total: cours?.cours_total || '',
    ue_autonomie: cours?.ue_autonomie || '', ue_per_total: cours?.ue_per_total || '',
    enc_cours: cours?.enc_cours || '', heures: cours?.heures || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border-t-4 border-iip-mauve">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-title text-lg text-iip-mauve">{isNew ? `Nouveau cours${ueNum ? ` (UE ${ueNum})` : ''}` : `Modifier ${cours.cours_code}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl">×</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <label className="block"><div className="text-xs text-gray-600 mb-0.5">Code cours *</div>
            <input value={form.cours_code} onChange={e => set('cours_code', e.target.value)} disabled={!isNew} placeholder="ex: 246.1"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono disabled:bg-gray-100" /></label>
          <label className="block"><div className="text-xs text-gray-600 mb-0.5">Nom du cours *</div>
            <input value={form.cours_nom} onChange={e => set('cours_nom', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Type</div>
              <select value={form.ct_pp} onChange={e => set('ct_pp', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option><option value="CT">CT</option><option value="PP">PP</option>
              </select></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Cours_per</div>
              <input type="number" value={form.cours_per} onChange={e => set('cours_per', e.target.value)}
                className="w-full border border-iip-gold/40 rounded px-3 py-1.5 text-sm bg-iip-gold/5" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Quadri</div>
              <select value={form.quadrimestre_cours} onChange={e => set('quadrimestre_cours', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q1/Q2">Q1/Q2</option>
              </select></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">N° cours</div>
              <input type="number" value={form.cours_num} onChange={e => set('cours_num', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Cours total</div>
              <input type="number" value={form.cours_total} onChange={e => set('cours_total', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Heures</div>
              <input type="number" value={form.heures} onChange={e => set('heures', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Autonomie UE</div>
              <input type="number" value={form.ue_autonomie} onChange={e => set('ue_autonomie', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Pér. total UE</div>
              <input type="number" value={form.ue_per_total} onChange={e => set('ue_per_total', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Encadrement</div>
              <input value={form.enc_cours} onChange={e => set('enc_cours', e.target.value)} placeholder="Cours / Encadrement"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
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

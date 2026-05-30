import { useState } from 'react';
import { api, getUser } from '../lib/api.js';

/**
 * Modale création / édition d'un cours du référentiel.
 *
 * La case "Z (7.3)" à côté du code cours permet de déclarer le cours
 * comme Activité autonome (Art. 7.3) :
 *  - périodes étudiant uniquement, sans charge prof, sans coût dotation
 *  - quand Z est coché → Type, Périodes, Quadri, Heures, Autonomie, Dédoublé
 *    sont grisés et réinitialisés
 */
export default function CoursFormModal({ cours, ueNum, section, onClose, onSaved }) {
  const isNew   = !cours?._edit;
  const me      = getUser?.();
  const isAdmin = me?.role === 'admin';

  const [form, setForm] = useState({
    cours_code:         cours?.cours_code         || '',
    cours_nom:          cours?.cours_nom           || '',
    ct_pp:              cours?.ct_pp               || '',
    cours_per:          cours?.cours_per           || '',
    per_etudiant:       cours?.per_etudiant        || '',
    quadrimestre_cours: cours?.quadrimestre_cours  || '',
    heures:             cours?.heures              || '',
    cours_autonomie:    cours?.cours_autonomie     || '',
    dedouble:           cours?.dedouble            || 'N',
  });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [renaming, setRenaming] = useState(false);
  const [newCode,  setNewCode]  = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // ── Z toggle ───────────────────────────────────────────────────────────────
  const isZ = form.ct_pp === 'Z';
  function toggleZ(checked) {
    if (checked) {
      setForm(f => ({
        ...f,
        ct_pp: 'Z',
        cours_per: '',
        cours_autonomie: '',
        heures: '',
        quadrimestre_cours: '',
        dedouble: 'N',
      }));
    } else {
      set('ct_pp', '');
    }
  }

  // ── Soumission ─────────────────────────────────────────────────────────────
  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.cours_code || !form.cours_nom) { setError('Code et nom requis'); return; }
    setSaving(true);
    try {
      if (isNew) await api.createCours({ ...form, ue_num: ueNum, section });
      else       await api.updateCours(cours.cours_code, form);
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

  // ── Styles utilitaires ────────────────────────────────────────────────────
  const inp  = 'w-full border border-gray-300 rounded px-3 py-1.5 text-sm';
  const inpZ = 'w-full border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-400 cursor-not-allowed select-none';
  const lbl  = 'text-xs font-medium mb-1';
  const lblZ = 'text-xs font-medium mb-1 text-gray-400';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border-t-4 border-iip-mauve">

        {/* ── En-tête ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-title text-lg text-iip-mauve">
            {isNew ? `Nouveau cours${ueNum ? ` — UE ${ueNum}` : ''}` : `Modifier ${cours.cours_code}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">

          {/* ── CODE + Z ──────────────────────────────────────────────────── */}
          <div>
            <div className={lbl}>Code cours *</div>
            <div className="flex items-center gap-3">
              <input value={form.cours_code} onChange={e => set('cours_code', e.target.value)}
                disabled={!isNew} placeholder="ex: 900.1"
                className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm font-mono disabled:bg-gray-100" />

              {/* Case Z */}
              <label className={`flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-lg border-2 transition
                ${isZ ? 'border-[#1F3864] bg-[#1F3864]' : 'border-gray-300 hover:border-[#1F3864]/50'}`}>
                <div className={`w-4 h-4 rounded flex items-center justify-center border-2 transition
                  ${isZ ? 'bg-white border-white' : 'border-gray-400'}`}>
                  {isZ && <svg className="w-2.5 h-2.5 text-[#1F3864]" fill="none" viewBox="0 0 10 10"><path d="M1 5l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className={`text-sm font-bold ${isZ ? 'text-white' : 'text-gray-600'}`}>Z</span>
                <span className={`text-xs ${isZ ? 'text-blue-200' : 'text-gray-400'}`}>7.3</span>
                <input type="checkbox" checked={isZ} onChange={e => toggleZ(e.target.checked)} className="sr-only" />
              </label>

              {!isNew && isAdmin && !renaming && (
                <button type="button" onClick={() => { setRenaming(true); setNewCode(cours.cours_code); }}
                  className="text-xs text-iip-mauve border border-iip-mauve/40 rounded px-2 py-1 hover:bg-iip-mauve/5 whitespace-nowrap">
                  ✎ Forcer
                </button>
              )}
            </div>

            {/* Explication Z */}
            {isZ && (
              <div className="mt-2 px-3 py-2 bg-[#1F3864]/8 border border-[#1F3864]/20 rounded-lg flex items-start gap-2">
                <span className="badge badge-z mt-0.5">Z</span>
                <div className="text-xs text-[#1F3864]">
                  <strong>Activité autonome — Art. 7.3</strong><br/>
                  Périodes étudiant uniquement. Pas de charge prof, pas de coût dotation.
                </div>
              </div>
            )}
          </div>

          {/* ── PÉRIODES ÉTUDIANT (Z uniquement) ──────────────────────────── */}
          {isZ && (
            <label className="block">
              <div className="text-xs font-semibold text-[#1F3864] mb-1 flex items-center gap-2">
                <span className="badge badge-z text-xs">Z</span>
                Périodes étudiant (7.3) *
              </div>
              <input type="number" min="0" value={form.per_etudiant}
                onChange={e => set('per_etudiant', e.target.value)}
                placeholder="Nombre de périodes autonomes de l'étudiant"
                className="w-full border-2 border-[#1F3864] rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-[#1F3864]/30" />
              <p className="text-xs text-gray-500 mt-1">
                Ces périodes s'ajoutent aux périodes étudiant totaux de l'UE.
              </p>
            </label>
          )}

          {/* Forçage code (admin) */}
          {renaming && (
            <div className="bg-iip-mauve/5 border border-iip-mauve/30 rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-700">⚠️ Met à jour le cours, ses attributions et activités liées.</p>
              <div className="flex gap-2">
                <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Nouveau code"
                  className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm font-mono" />
                <button type="button" onClick={forcerCode} disabled={saving}
                  className="bg-iip-mauve text-white text-sm px-3 py-1.5 rounded disabled:opacity-40">Forcer</button>
                <button type="button" onClick={() => setRenaming(false)} className="text-sm text-gray-500 px-2">✕</button>
              </div>
            </div>
          )}

          {/* ── NOM ───────────────────────────────────────────────────────── */}
          <label className="block">
            <div className={lbl}>Nom du cours *</div>
            <input value={form.cours_nom} onChange={e => set('cours_nom', e.target.value)}
              placeholder="Intitulé complet du cours" className={inp} />
          </label>

          {/* ── CHAMPS DÉSACTIVÉS EN Z ─────────────────────────────────── */}
          <div className={`space-y-3 transition-opacity ${isZ ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <div className={isZ ? lblZ : lbl}>Type</div>
                <select value={form.ct_pp} onChange={e => set('ct_pp', e.target.value)}
                  disabled={isZ} className={isZ ? inpZ : inp + ' bg-white'}>
                  <option value="">—</option>
                  <optgroup label="Codes enseignement">
                    <option value="CG">CG — Cours Généraux</option>
                    <option value="CT">CT — Cours Techniques</option>
                    <option value="PP">PP — Pratique Professionnelle</option>
                  </optgroup>
                  <optgroup label="Codes U">
                    <option value="B">B</option>
                    <option value="F">F</option>
                    <option value="T">T</option>
                    <option value="P">P</option>
                    <option value="O">O</option>
                  </optgroup>
                </select>
              </label>
              <label className="block">
                <div className={isZ ? lblZ : lbl + ' text-iip-gold'}>Périodes Prof.</div>
                <input type="number" min="0" value={form.cours_per} onChange={e => set('cours_per', e.target.value)}
                  disabled={isZ} placeholder="0"
                  className={isZ ? inpZ : 'w-full border border-iip-gold/40 rounded px-3 py-1.5 text-sm bg-iip-gold/5'} />
              </label>
              <label className="block">
                <div className={isZ ? lblZ : lbl}>Quadrimestre</div>
                <select value={form.quadrimestre_cours} onChange={e => set('quadrimestre_cours', e.target.value)}
                  disabled={isZ} className={isZ ? inpZ : inp + ' bg-white'}>
                  <option value="">—</option>
                  <option value="Q1">Q1</option>
                  <option value="Q2">Q2</option>
                  <option value="Q1/Q2">Q1/Q2</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <div className={isZ ? lblZ : lbl}>Heures</div>
                <input type="number" min="0" value={form.heures} onChange={e => set('heures', e.target.value)}
                  disabled={isZ} placeholder="0" className={isZ ? inpZ : inp} />
              </label>
              <label className="block">
                <div className={isZ ? lblZ : lbl}>Autonomie du cours</div>
                <input type="number" min="0" value={form.cours_autonomie} onChange={e => set('cours_autonomie', e.target.value)}
                  disabled={isZ} placeholder="0" className={isZ ? inpZ : inp} />
              </label>
              <label className="block">
                <div className={isZ ? lblZ : lbl}>Dédoublé</div>
                <select value={form.dedouble} onChange={e => set('dedouble', e.target.value)}
                  disabled={isZ} className={isZ ? inpZ : inp + ' bg-white'}>
                  <option value="N">Non</option>
                  <option value="O">Oui (×2)</option>
                </select>
              </label>
            </div>
          </div>

          {isZ && (
            <p className="text-xs text-gray-400 italic -mt-1">
              Ces champs ne s'appliquent pas aux activités Z (7.3).
            </p>
          )}

          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-2">{error}</div>}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Annuler</button>
            <button type="submit" disabled={saving}
              className="bg-iip-mauve hover:opacity-90 disabled:opacity-40 text-white text-sm px-5 py-2 rounded-lg font-medium">
              {saving ? '…' : isNew ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

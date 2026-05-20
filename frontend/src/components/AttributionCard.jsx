import { useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Carte compacte d'une attribution pour vue mobile.
 * Tap = ouvre le drawer d'édition rapide en bas (sheet).
 */
export default function AttributionCard({ row, selected, onToggleSelect, onChange, onDelete, isAdmin, professeurs = [], activites = [] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    periodes_attribuees: row.periodes_attribuees ?? 0,
    autonomie_attribuee: row.autonomie_attribuee ?? 0,
    contrat_mdp: row.contrat_mdp ?? '',
    quadrimestre_attribue: row.quadrimestre_attribue ?? '',
    type_cours_helb: row.type_cours_helb ?? '',
    num_organisation: row.num_organisation ?? 1,
    code: row.code ?? '',
    professeur_id: row.professeur_id ?? '',
    activite_id: row.activite_id ?? ''
  });
  const [saving, setSaving] = useState(false);

  const conforme = row.cours_conforme;
  const isHelb = form.contrat_mdp === 'HELB';
  const total = (Number(form.periodes_attribuees) || 0) + (Number(form.autonomie_attribuee) || 0);
  const heures = Math.round(total * 50 / 60);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        periodes_attribuees: Number(form.periodes_attribuees),
        autonomie_attribuee: Number(form.autonomie_attribuee),
        contrat_mdp: form.contrat_mdp || null,
        quadrimestre_attribue: form.quadrimestre_attribue || null,
        type_cours_helb: form.type_cours_helb || null,
        num_organisation: Number(form.num_organisation) || 1,
        code: form.code || null,
        professeur_id: form.professeur_id ? Number(form.professeur_id) : null,
        activite_id: form.activite_id ? Number(form.activite_id) : null
      };
      await api.updateAttribution(row.id, payload);
      onChange?.();
      setOpen(false);
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  const contratBadge =
    row.contrat_mdp === 'IIP'  ? <span className="badge badge-iip">IIP</span> :
    row.contrat_mdp === 'HELB' ? <span className="badge badge-helb">HELB</span> : null;

  const typeBadge =
    row.type_cours === 'CT' ? <span className="badge badge-ct">CT</span> :
    row.type_cours === 'PP' ? <span className="badge badge-pp">PP</span> : null;

  const cardHelb = row.contrat_mdp === 'HELB';

  return (
    <>
      <div className={`rounded-lg border p-3 transition-all ${
        selected ? 'border-iip-gold ring-2 ring-iip-gold/30 bg-yellow-50'
        : cardHelb ? 'border-pink-200 bg-pink-50'
        : 'border-gray-200 bg-white'}`}>
        <div className="flex items-start gap-2">
          {isAdmin && (
            <input type="checkbox" checked={selected || false}
                   onChange={e => { e.stopPropagation(); onToggleSelect?.(row.id); }}
                   className="mt-1 cursor-pointer flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0" onClick={() => setOpen(true)}>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1 flex-wrap">
              <span>UE {row.ue_num}</span>
              {row.num_organisation > 1 && <span className="bg-amber-100 text-amber-800 px-1 rounded text-[10px] font-semibold">Org. {row.num_organisation}</span>}
              {row.code_cours && <><span>·</span><span>{row.code_cours}</span></>}
              {row.bloc && <><span>·</span><span>{row.bloc}</span></>}
            </div>
            <div className="text-sm font-medium text-gray-800 line-clamp-1 mb-0.5">
              {row.nom_cours || row.ue_nom}
            </div>
            {row.activite_nom && <div className="text-xs text-gray-500 mb-1">{row.activite_nom}</div>}
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                {contratBadge}
                {typeBadge}
                {row.type_cours_helb && <span className="bg-pink-100 text-pink-700 text-[10px] px-1.5 py-0.5 rounded font-semibold">{row.type_cours_helb}</span>}
                {row.code && <span className="badge badge-exp">Gr. {row.code}</span>}
                {row.quadrimestre_attribue && <span className="badge badge-exp">{row.quadrimestre_attribue}</span>}
                {row.contrat && <span className="badge badge-exp">{row.contrat}</span>}
                {conforme === 0 && <span className="badge bg-red-100 text-red-700">✗</span>}
              </div>
              <div className="text-right">
                <div className="text-base font-bold text-iip-gold leading-tight">{row.total_attribue_professeur ?? total}</div>
                <div className="text-[10px] text-gray-500 leading-tight">per.</div>
              </div>
            </div>
            <div className="mt-1.5 text-xs text-gray-600 truncate">
              {row.professeur || <span className="italic text-orange-600">⚠ Professeur non assigné</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Drawer d'édition rapide */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40"></div>
          <div className={`relative w-full rounded-t-2xl shadow-2xl p-4 max-h-[88vh] overflow-auto ${isHelb ? 'bg-pink-50' : 'bg-white'}`}
               onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-300 rounded mx-auto mb-3"></div>
            <h3 className="font-title text-lg text-iip-gold mb-1">{row.nom_cours || row.ue_nom}</h3>
            <p className="text-xs text-gray-500 mb-4">
              {row.section} · UE {row.ue_num} · {row.code_cours}
              {row.activite_nom && ` · ${row.activite_nom}`}
            </p>

            <div className="space-y-3 mb-4">
              {/* Professeur */}
              <label className="block">
                <div className="text-xs text-gray-600 mb-1">Professeur</div>
                <select value={form.professeur_id} onChange={e => set('professeur_id', e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-base bg-white">
                  <option value="">— Aucun —</option>
                  {professeurs.map(p => <option key={p.id} value={p.id}>{p.nom_prenom}</option>)}
                </select>
              </label>

              {/* Activité */}
              <label className="block">
                <div className="text-xs text-gray-600 mb-1">Activité</div>
                <select value={form.activite_id} onChange={e => set('activite_id', e.target.value)}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-base bg-white">
                  <option value="">— Aucune —</option>
                  {activites.map(a => <option key={a.id} value={a.id}>{a.libelle}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs text-gray-600 mb-1">Contrat</div>
                  <select value={form.contrat_mdp} onChange={e => set('contrat_mdp', e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-base bg-white">
                    <option value="">—</option>
                    <option value="IIP">IIP</option>
                    <option value="HELB">HELB</option>
                  </select>
                </label>
                <label className="block">
                  <div className="text-xs text-gray-600 mb-1">Quadrimestre</div>
                  <select value={form.quadrimestre_attribue} onChange={e => set('quadrimestre_attribue', e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-base bg-white">
                    <option value="">—</option>
                    <option value="Q1">Q1</option>
                    <option value="Q2">Q2</option>
                    <option value="Q1/Q2">Q1/Q2</option>
                  </select>
                </label>
                <label className="block">
                  <div className="text-xs text-gray-600 mb-1">Groupe</div>
                  <input type="text" value={form.code} onChange={e => set('code', e.target.value)}
                         className="w-full border border-gray-300 rounded px-3 py-2 text-base bg-white" />
                </label>
                <label className="block">
                  <div className="text-xs text-gray-600 mb-1">Organisation</div>
                  <select value={form.num_organisation} onChange={e => set('num_organisation', e.target.value)}
                          className="w-full border border-gray-300 rounded px-3 py-2 text-base bg-white">
                    <option value="1">1</option><option value="2">2</option>
                    <option value="3">3</option><option value="4">4</option>
                  </select>
                </label>
                {isHelb && (
                  <label className="block col-span-2">
                    <div className="text-xs text-gray-600 mb-1">Statut HELB</div>
                    <select value={form.type_cours_helb} onChange={e => set('type_cours_helb', e.target.value)}
                            className="w-full border border-pink-300 rounded px-3 py-2 text-base bg-white">
                      <option value="">—</option>
                      <option value="MFP">MFP</option>
                      <option value="MA">MA</option>
                    </select>
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
                <label className="block">
                  <div className="text-xs text-gray-600 mb-1">Périodes</div>
                  <input type="text" inputMode="decimal" value={form.periodes_attribuees}
                         onChange={e => set('periodes_attribuees', e.target.value)}
                         className="w-full border border-iip-gold/40 rounded px-3 py-2 text-base bg-iip-gold/5 no-spinner" />
                </label>
                <label className="block">
                  <div className="text-xs text-gray-600 mb-1">Autonomie</div>
                  <input type="text" inputMode="decimal" value={form.autonomie_attribuee}
                         onChange={e => set('autonomie_attribuee', e.target.value)}
                         className="w-full border border-iip-gold/40 rounded px-3 py-2 text-base bg-iip-gold/5 no-spinner" />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded p-2 text-center">
                <div>
                  <div className="text-[10px] text-gray-500">Total</div>
                  <div className="text-lg font-bold">{total}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Heures</div>
                  <div className="text-lg font-bold">{heures}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Coût dot.</div>
                  <div className="text-lg font-bold">{row.cout_dotation || '—'}</div>
                </div>
              </div>

              {row.cours_per != null && (
                <div className={`text-xs rounded p-2 ${conforme ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  Cours_per : {row.cours_per} · Total attribué : {row.cours_total_attribue}
                  {conforme
                    ? <span className="ml-1 font-semibold">✓ Conforme</span>
                    : <span className="ml-1 font-semibold">✗ Non conforme (ratio {row.cours_multiple_attendu})</span>}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-200">
              <button onClick={() => setOpen(false)}
                      className="flex-1 py-2.5 text-sm text-gray-600 hover:text-gray-800">
                Fermer
              </button>
              {isAdmin && (
                <button onClick={() => { setOpen(false); onDelete?.(row.id); }}
                        className="px-4 py-2.5 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded font-medium">
                  🗑
                </button>
              )}
              <button onClick={save} disabled={saving}
                      className="flex-1 bg-iip-gold hover:bg-iip-amber disabled:opacity-50 text-white text-sm py-2.5 rounded font-medium">
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

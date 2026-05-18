import { useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Carte compacte d'une attribution pour vue mobile.
 * Tap = ouvre le drawer d'édition rapide en bas (sheet).
 */
export default function AttributionCard({ row, selected, onToggleSelect, onChange, onDelete, isAdmin }) {
  const [open, setOpen] = useState(false);
  const [periodes, setPeriodes] = useState(row.periodes_attribuees ?? 0);
  const [autonomie, setAutonomie] = useState(row.autonomie_attribuee ?? 0);
  const [saving, setSaving] = useState(false);

  const conforme = row.cours_conforme;
  const total = (Number(periodes) || 0) + (Number(autonomie) || 0);
  const heures = Math.round(total * 50 / 60);

  async function save() {
    setSaving(true);
    try {
      const pNum = Number(periodes), aNum = Number(autonomie);
      if (pNum !== Number(row.periodes_attribuees)) {
        await api.updateAttribution(row.id, { periodes_attribuees: pNum });
      }
      if (aNum !== Number(row.autonomie_attribuee)) {
        await api.updateAttribution(row.id, { autonomie_attribuee: aNum });
      }
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

  return (
    <>
      <div className={`rounded-lg border bg-white p-3 transition-all ${selected ? 'border-iip-gold ring-2 ring-iip-gold/30 bg-yellow-50' : 'border-gray-200'}`}>
        <div className="flex items-start gap-2">
          {isAdmin && (
            <input type="checkbox" checked={selected || false}
                   onChange={e => { e.stopPropagation(); onToggleSelect?.(row.id); }}
                   className="mt-1 cursor-pointer flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0" onClick={() => setOpen(true)}>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
              <span className="font-semibold text-gray-700">{row.section}</span>
              {row.ue_num && <><span>·</span><span>UE {row.ue_num}</span></>}
              {row.code_cours && <><span>·</span><span>{row.code_cours}</span></>}
              {row.bloc && <><span>·</span><span>{row.bloc}</span></>}
            </div>
            <div className="text-sm font-medium text-gray-800 line-clamp-2 mb-1">
              {row.ue_nom || 'UE sans nom'}
            </div>
            <div className="text-xs text-gray-600 line-clamp-1 mb-2">
              {row.nom_cours}
            </div>
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                {contratBadge}
                {typeBadge}
                {row.code && <span className="badge badge-exp">Gr. {row.code}</span>}
                {row.quadrimestre_attribue && <span className="badge badge-exp">{row.quadrimestre_attribue}</span>}
                {conforme === 0 && <span className="badge bg-red-100 text-red-700">✗ non conforme</span>}
              </div>
              <div className="text-right">
                <div className="text-base font-bold text-iip-gold leading-tight">{total}</div>
                <div className="text-[10px] text-gray-500 leading-tight">{heures}h · per.</div>
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
          <div className="relative w-full bg-white rounded-t-2xl shadow-2xl p-4 max-h-[85vh] overflow-auto"
               onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1 bg-gray-300 rounded mx-auto mb-3"></div>
            <h3 className="font-title text-lg text-iip-gold mb-1">{row.ue_nom}</h3>
            <p className="text-xs text-gray-500 mb-4">
              {row.section} · UE {row.ue_num} · {row.code_cours} · {row.nom_cours}
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <div className="text-xs text-gray-600 mb-1">Professeur</div>
                <div className="text-sm font-medium">
                  {row.professeur || <span className="italic text-orange-600">Non assigné</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Contrat</div>
                  <div className="text-sm">{row.contrat_mdp || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Quadrimestre</div>
                  <div className="text-sm">{row.quadrimestre_attribue || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Type</div>
                  <div className="text-sm">{row.type_cours || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Groupe</div>
                  <div className="text-sm">{row.code || '—'}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                <label className="block">
                  <div className="text-xs text-gray-600 mb-1">Périodes</div>
                  <input type="text" inputMode="decimal" value={periodes}
                         onChange={e => setPeriodes(e.target.value)}
                         className="w-full border border-iip-gold/40 rounded px-3 py-2 text-base bg-iip-gold/5 no-spinner" />
                </label>
                <label className="block">
                  <div className="text-xs text-gray-600 mb-1">Autonomie</div>
                  <input type="text" inputMode="decimal" value={autonomie}
                         onChange={e => setAutonomie(e.target.value)}
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

            <div className="flex gap-2 pt-2 border-t border-gray-100">
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

import { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api.js';

/**
 * Modale d'édition d'un COURS (section + code_cours) avec toutes ses attributions.
 *
 * Affiche un tableau multi-lignes : chaque ligne = un groupe × une activité.
 * Permet d'ajouter/supprimer des lignes, de modifier prof, groupe, activité,
 * périodes et autonomie. Calcule la conformité globale (total = multiple de cours_per).
 *
 * Props :
 *   section, codeCours  → identifient le cours
 *   onClose, onChanged  → callbacks
 */
export default function CoursEditModal({ section, codeCours, onClose, onChanged }) {
  const [data, setData] = useState(null);    // { attributions, conformite }
  const [rows, setRows] = useState([]);      // copie locale éditable
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profs, setProfs] = useState([]);
  const [activites, setActivites] = useState([]);
  const [error, setError] = useState('');

  // Lignes nouvellement créées (pas encore en DB) : id < 0
  const [nextTempId, setNextTempId] = useState(-1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.attributionsByCours(section, codeCours),
      api.professeurs(),
      api.activites()
    ]).then(([d, p, a]) => {
      if (!alive) return;
      setData(d);
      setRows(d.attributions.map(r => ({ ...r, _dirty: false, _new: false })));
      setProfs(p);
      setActivites(a);
    }).catch(e => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [section, codeCours]);

  const coursPer = data?.conformite?.cours_per;
  const coursNom = data?.attributions?.[0]?.nom_cours || codeCours;
  const ueNum    = data?.attributions?.[0]?.ue_num;
  const ueNom    = data?.attributions?.[0]?.ue_nom;

  // Totaux et conformité recalculés à la volée (lignes non supprimées)
  const totals = useMemo(() => {
    const t = rows.filter(r => !r._deleted).reduce((acc, r) => {
      acc.periodes  += Number(r.periodes_attribuees)  || 0;
      acc.autonomie += Number(r.autonomie_attribuee) || 0;
      return acc;
    }, { periodes: 0, autonomie: 0 });
    t.total = t.periodes + t.autonomie;
    if (coursPer && coursPer > 0) {
      t.conforme = (t.periodes % coursPer) === 0;
      t.multiple = (t.periodes / coursPer).toFixed(2);
    } else {
      t.conforme = null;
    }
    return t;
  }, [rows, coursPer]);

  function updateRow(rowId, field, value) {
    setRows(rs => rs.map(r => r.id === rowId ? { ...r, [field]: value, _dirty: true } : r));
  }

  function addRow() {
    // Trouver la prochaine lettre de groupe disponible
    const usedCodes = new Set(rows.filter(r => !r._deleted).map(r => r.code));
    let nextCode = 'A';
    for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      if (!usedCodes.has(c)) { nextCode = c; break; }
    }
    // Hériter du contexte des autres lignes (section, ue, code_cours, type_cours, quadri)
    const ref = rows.find(r => !r._deleted) || {};
    const newRow = {
      id: nextTempId,
      _new: true,
      _dirty: true,
      section,
      code_cours: codeCours,
      ue_num: ref.ue_num,
      type_cours: ref.type_cours,
      quadrimestre_attribue: ref.quadrimestre_attribue,
      contrat_mdp: ref.contrat_mdp || 'IIP',
      etablissement_referent: ref.etablissement_referent || 'IIP',
      organisation: ref.organisation || 'x',
      num_organisation: ref.num_organisation || 1,
      nb_groupes: ref.nb_groupes || 1,
      split_groupe: 'N',
      cours_ept_ad: 'C',
      coordination_encadrement: 'Cours',
      code: nextCode,
      professeur_id: null,
      professeur: null,
      activite_id: null,
      activite_nom: null,
      periodes_attribuees: 0,
      autonomie_attribuee: 0,
      nom_cours: coursNom,
      ue_nom: ueNom
    };
    setRows(rs => [...rs, newRow]);
    setNextTempId(id => id - 1);
  }

  function deleteRow(rowId) {
    setRows(rs => {
      const r = rs.find(x => x.id === rowId);
      if (r?._new) {
        // Pas encore en DB → simple suppression locale
        return rs.filter(x => x.id !== rowId);
      }
      return rs.map(x => x.id === rowId ? { ...x, _deleted: true } : x);
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      // Créer les nouvelles
      for (const r of rows.filter(r => r._new && !r._deleted)) {
        const payload = {
          section: r.section,
          contrat_mdp: r.contrat_mdp,
          etablissement_referent: r.etablissement_referent,
          organisation: r.organisation,
          ue_num: Number(r.ue_num),
          num_organisation: Number(r.num_organisation),
          quadrimestre_attribue: r.quadrimestre_attribue,
          code_cours: r.code_cours,
          type_cours: r.type_cours,
          code: r.code,
          nb_groupes: Number(r.nb_groupes),
          split_groupe: r.split_groupe,
          professeur_id: r.professeur_id ? Number(r.professeur_id) : null,
          cours_ept_ad: r.cours_ept_ad,
          coordination_encadrement: r.coordination_encadrement,
          activite_id: r.activite_id ? Number(r.activite_id) : null,
          periodes_attribuees: Number(r.periodes_attribuees) || 0,
          autonomie_attribuee: Number(r.autonomie_attribuee) || 0
        };
        await api.createAttribution(payload);
      }
      // Modifier les existantes
      for (const r of rows.filter(r => !r._new && r._dirty && !r._deleted)) {
        await api.updateAttribution(r.id, {
          code: r.code,
          activite_id: r.activite_id ? Number(r.activite_id) : null,
          professeur_id: r.professeur_id ? Number(r.professeur_id) : null,
          periodes_attribuees: Number(r.periodes_attribuees) || 0,
          autonomie_attribuee: Number(r.autonomie_attribuee) || 0
        });
      }
      // Supprimer les marquées
      for (const r of rows.filter(r => !r._new && r._deleted)) {
        await api.deleteAttribution(r.id);
      }
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const visibleRows = rows.filter(r => !r._deleted);
  const me = JSON.parse(localStorage.getItem('user') || 'null');
  const canEdit = me?.role === 'admin' || me?.role === 'editeur';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-2 md:p-4 z-30"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col">
        {/* En-tête */}
        <div className="border-b border-gray-200 p-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-title text-iip-gold">{coursNom}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Section <b>{section}</b> · UE <b>{ueNum}</b> {ueNom && <>· {ueNom}</>} · Code <b>{codeCours}</b>
              {coursPer != null && <> · <b>{coursPer} périodes prévues par cours</b></>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <p className="text-gray-400 text-center py-8">Chargement…</p>
          ) : error ? (
            <div className="bg-red-50 text-red-700 text-sm rounded p-3">{error}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded">
                  <thead>
                    <tr className="bg-gray-50 text-xs uppercase text-gray-600">
                      <th className="text-left p-2 border-b">Cours</th>
                      <th className="text-left p-2 border-b">Activité</th>
                      <th className="text-left p-2 border-b">Groupe</th>
                      <th className="text-left p-2 border-b">Professeur</th>
                      <th className="text-right p-2 border-b">Périodes</th>
                      <th className="text-right p-2 border-b bg-gray-100 text-gray-500"
                          title="Périodes prévues pour ce cours (BD_UE_COURS)">Per. prévu</th>
                      <th className="text-right p-2 border-b">Autonomie</th>
                      <th className="text-right p-2 border-b bg-gray-100 text-gray-500"
                          title="Autonomie max prévue pour l'UE (BD_UE_COURS)">Aut. prévu</th>
                      <th className="text-right p-2 border-b">Total</th>
                      <th className="p-2 border-b w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(r => {
                      const lineTotal = (Number(r.periodes_attribuees) || 0) + (Number(r.autonomie_attribuee) || 0);
                      return (
                        <tr key={r.id} className={`hover:bg-iip-gold/5 ${r._new ? 'bg-green-50/50' : ''}`}>
                          <td className="p-2 border-b text-gray-700">{r.nom_cours}</td>
                          <td className="p-2 border-b">
                            <select value={r.activite_id ?? ''}
                                    disabled={!canEdit}
                                    onChange={e => updateRow(r.id, 'activite_id', e.target.value ? Number(e.target.value) : null)}
                                    className="w-full bg-transparent border border-gray-200 rounded px-2 py-1 text-sm focus:border-iip-gold outline-none">
                              <option value="">— Aucune —</option>
                              {activites.map(a => <option key={a.id} value={a.id}>{a.libelle}</option>)}
                            </select>
                          </td>
                          <td className="p-2 border-b">
                            <input type="text" value={r.code ?? ''}
                                   disabled={!canEdit}
                                   onChange={e => updateRow(r.id, 'code', e.target.value)}
                                   className="w-16 border border-gray-200 rounded px-2 py-1 text-center text-sm focus:border-iip-gold outline-none" />
                          </td>
                          <td className="p-2 border-b">
                            <select value={r.professeur_id ?? ''}
                                    disabled={!canEdit}
                                    onChange={e => updateRow(r.id, 'professeur_id', e.target.value ? Number(e.target.value) : null)}
                                    className="w-full bg-transparent border border-gray-200 rounded px-2 py-1 text-sm focus:border-iip-gold outline-none">
                              <option value="">— Non assigné —</option>
                              {profs.map(p => <option key={p.id} value={p.id}>{p.nom_prenom}</option>)}
                            </select>
                          </td>
                          <td className="p-2 border-b text-right">
                            <input type="text" inputMode="decimal" value={r.periodes_attribuees ?? 0}
                                   disabled={!canEdit}
                                   onChange={e => updateRow(r.id, 'periodes_attribuees', e.target.value.replace(',', '.'))}
                                   className="w-20 border border-gray-200 rounded px-2 py-1 text-right text-sm focus:border-iip-gold outline-none no-spinner" />
                          </td>
                          <td className="p-2 border-b text-right bg-gray-50 text-gray-500 tabular-nums"
                              title="Périodes prévues pour ce cours (BD_UE_COURS)">
                            {r.cours_per_prevu != null
                              ? Number(r.cours_per_prevu).toLocaleString('fr-BE')
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="p-2 border-b text-right">
                            <input type="text" inputMode="decimal" value={r.autonomie_attribuee ?? 0}
                                   disabled={!canEdit}
                                   onChange={e => updateRow(r.id, 'autonomie_attribuee', e.target.value.replace(',', '.'))}
                                   className="w-20 border border-gray-200 rounded px-2 py-1 text-right text-sm focus:border-iip-gold outline-none no-spinner" />
                          </td>
                          <td className="p-2 border-b text-right bg-gray-50 text-gray-500 tabular-nums"
                              title="Autonomie max prévue pour l'UE (BD_UE_COURS)">
                            {r.ue_autonomie_prevu != null
                              ? Number(r.ue_autonomie_prevu).toLocaleString('fr-BE')
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="p-2 border-b text-right font-medium tabular-nums">{lineTotal.toLocaleString('fr-BE')}</td>
                          <td className="p-2 border-b text-center">
                            {canEdit && (
                              <button onClick={() => deleteRow(r.id)}
                                      className="text-red-400 hover:text-red-600 text-base"
                                      title="Supprimer cette ligne">🗑</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-iip-gold/10 font-semibold">
                      <td colSpan="4" className="p-2 text-right text-gray-700">TOTAUX</td>
                      <td className="p-2 text-right tabular-nums">{totals.periodes.toLocaleString('fr-BE')}</td>
                      <td className="p-2 bg-gray-100"></td>
                      <td className="p-2 text-right tabular-nums">{totals.autonomie.toLocaleString('fr-BE')}</td>
                      <td className="p-2 bg-gray-100"></td>
                      <td className="p-2 text-right tabular-nums">{totals.total.toLocaleString('fr-BE')}</td>
                      <td className="p-2 text-center">
                        {totals.conforme === true && <span className="text-green-600 text-lg" title={`Total = ${totals.multiple} × ${coursPer}`}>✓</span>}
                        {totals.conforme === false && <span className="text-red-600 text-lg" title={`Total ≠ multiple de ${coursPer}`}>✗</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Récap multiples sous le tableau */}
              {(() => {
                const ueAut = visibleRows.find(r => r.ue_autonomie_prevu != null)?.ue_autonomie_prevu;
                const perMultiple = coursPer && coursPer > 0 ? (totals.periodes / coursPer) : null;
                const autMultiple = ueAut && ueAut > 0 ? (totals.autonomie / ueAut) : null;
                const perEntier = perMultiple != null && Number.isInteger(perMultiple);

                return (
                  <div className="mt-3 flex flex-col gap-1.5 text-xs">
                    {coursPer != null && coursPer > 0 && (
                      <div className={`rounded p-2.5 flex items-center gap-2 ${perEntier ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        <span className="text-base">{perEntier ? '✓' : '✗'}</span>
                        <span>
                          <b>Périodes</b> : {coursNom} <b>{coursPer}p</b> × <b>{perMultiple != null ? perMultiple.toLocaleString('fr-BE', { maximumFractionDigits: 2 }) : '?'}</b> = <b>{totals.periodes}p</b>
                          {perEntier
                            ? <> — multiple entier </>
                            : <> — <span className="font-semibold">pas un multiple entier</span></>
                          }
                        </span>
                      </div>
                    )}
                    {ueAut != null && ueAut > 0 && (
                      <div className="rounded p-2.5 bg-blue-50 text-blue-700 flex items-center gap-2">
                        <span className="text-base">ℹ</span>
                        <span>
                          <b>Autonomie</b> : UE autonomie <b>{Number(ueAut).toLocaleString('fr-BE')}p</b> × <b>{autMultiple != null ? autMultiple.toLocaleString('fr-BE', { maximumFractionDigits: 2 }) : '?'}</b> = <b>{totals.autonomie}p</b>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {canEdit && (
                <button onClick={addRow}
                        className="mt-3 bg-iip-mauve/15 hover:bg-iip-mauve/25 text-iip-mauve text-sm font-medium px-4 py-2 rounded">
                  ➕ Ajouter une ligne
                </button>
              )}
            </>
          )}
        </div>

        {/* Pied */}
        <div className="border-t border-gray-200 p-4 flex items-center justify-between gap-2">
          <div className="text-xs text-gray-500">
            {visibleRows.length} ligne(s) · {rows.filter(r => r._new && !r._deleted).length} nouvelle(s) ·
            {' '}{rows.filter(r => !r._new && r._deleted).length} à supprimer ·
            {' '}{rows.filter(r => !r._new && r._dirty && !r._deleted).length} modifiée(s)
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Fermer</button>
            {canEdit && (
              <button onClick={save} disabled={saving}
                      className="bg-iip-gold hover:bg-iip-amber disabled:opacity-50 text-white text-sm px-5 py-2 rounded font-medium">
                {saving ? 'Enregistrement…' : '✓ Enregistrer'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [showNewActivite, setShowNewActivite] = useState(null); // { rowId }

  // Lignes nouvellement créées (pas encore en DB) : id < 0
  const [nextTempId, setNextTempId] = useState(-1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.attributionsByCours(section, codeCours),
      api.professeurs(true),
      api.activites({ section }) // globales + section (ue_num ajouté après)
    ]).then(([d, p, a]) => {
      if (!alive) return;
      setData(d);
      setRows(d.attributions.map(r => ({ ...r, _dirty: false, _new: false })));
      setProfs(p);
      setActivites(a);
      // Recharger les activités avec le ue_num du cours pour inclure les spécifiques
      const ueNum = d.attributions?.[0]?.ue_num || d.cours_info?.ue_num;
      if (ueNum) {
        api.activites({ section, ue_num: ueNum }).then(a2 => { if (alive) setActivites(a2); });
      }
    }).catch(e => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [section, codeCours]);

  const coursPer = data?.conformite?.cours_per ?? data?.cours_info?.cours_per;
  const coursNom = data?.attributions?.[0]?.nom_cours || data?.cours_info?.cours_nom || codeCours;
  const ueNum    = data?.attributions?.[0]?.ue_num ?? data?.cours_info?.ue_num;
  const ueNom    = data?.attributions?.[0]?.ue_nom || data?.cours_info?.ue_nom;
  const coursType = data?.attributions?.[0]?.type_cours || data?.cours_info?.type_cours;
  const [heures, setHeures] = useState('');
  const ueAnalyse = data?.ue_analyse;

  // Initialiser heures depuis data
  useEffect(() => {
    if (data?.cours_info?.heures != null) setHeures(String(data.cours_info.heures));
  }, [data]);

  async function saveHeures() {
    if (heures === '' || heures === String(data?.cours_info?.heures)) return;
    try {
      await api.updateCours(codeCours, { heures: heures ? Number(heures) : null });
    } catch(e) { console.error('Erreur sauvegarde heures:', e); }
  }
  const coursQuad = data?.attributions?.[0]?.quadrimestre_attribue || data?.cours_info?.quadrimestre_cours;

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
      ue_num: ref.ue_num ?? ueNum,
      type_cours: ref.type_cours ?? coursType,
      quadrimestre_attribue: ref.quadrimestre_attribue ?? coursQuad,
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
    // Validation : une ligne avec 0 période de cours mais de l'autonomie
    // (ligne d'autonomie pure) doit être rattachée à une activité.
    const lignesActives = rows.filter(r => !r._deleted);
    for (const r of lignesActives) {
      const per = Number(r.periodes_attribuees) || 0;
      const aut = Number(r.autonomie_attribuee) || 0;
      if (per === 0 && aut > 0 && !r.activite_id) {
        setError(`Une ligne sans période de cours (autonomie seule) doit être rattachée à une activité (ex. théorie, TP). Sélectionnez une activité pour la ligne concernée.`);
        return;
      }
    }
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
          ue_num: r.ue_num != null ? Number(r.ue_num) : null,
          num_organisation: Number(r.num_organisation) || 1,
          quadrimestre_attribue: r.quadrimestre_attribue,
          code_cours: r.code_cours,
          type_cours: r.type_cours,
          code: r.code,
          nb_groupes: Number(r.nb_groupes) || 1,
          split_groupe: r.split_groupe,
          professeur_id: r.professeur_id ? Number(r.professeur_id) : null,
          cours_ept_ad: r.cours_ept_ad,
          coordination_encadrement: r.coordination_encadrement,
          activite_id: r.activite_id ? Number(r.activite_id) : null,
          type_cours_helb: r.type_cours_helb ?? null,
          periodes_attribuees: Number(r.periodes_attribuees) || 0,
          autonomie_attribuee: Number(r.autonomie_attribuee) || 0
        };
        await api.createAttribution(payload);
      }
      // Modifier les existantes
      for (const r of rows.filter(r => !r._new && r._dirty && !r._deleted)) {
        await api.updateAttribution(r.id, {
          code: r.code,
          contrat_mdp: r.contrat_mdp,
          type_cours_helb: r.type_cours_helb ?? null,
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
  const hasHelb = visibleRows.some(r => r.contrat_mdp === 'HELB');
  async function creerActivite(libelle, portee) {
    // portee: 'cours' | 'section' | 'global'
    const tok = localStorage.getItem('token');
    const payload = {
      libelle,
      section: portee === 'global' ? null : section,
      ue_num:  portee === 'cours'  ? ueNum : null,
    };
    const r2 = await fetch('/api/ref/activites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify(payload),
    }).then(r => r.json());
    if (r2.error) throw new Error(r2.error);
    // Recharger les activités filtrées
    const a = await fetch(`/api/ref/activites?section=${encodeURIComponent(section)}&ue_num=${ueNum || ''}`,
      { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());
    setActivites(Array.isArray(a) ? a : []);
    return r2.id;
  }

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
              {/* ── Encart Vue étudiant ── */}
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-4 space-y-2">
                <div className="text-xs font-semibold text-violet-700 uppercase tracking-wider">🎓 Vue étudiant</div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white rounded border border-violet-100 p-2">
                    <div className="text-[10px] text-gray-500 mb-0.5">Heures de contact</div>
                    <input type="number" min="0"
                      value={heures}
                      onChange={e => setHeures(e.target.value)}
                      onBlur={saveHeures}
                      autoComplete="off"
                      placeholder="0"
                      className="font-bold text-violet-700 text-lg text-center w-full bg-transparent border-b border-violet-200 focus:outline-none focus:border-violet-500"
                    />
                    <div className="text-[10px] text-gray-400">heures ×60 min</div>
                  </div>
                  <div className="bg-white rounded border border-violet-100 p-2">
                    <div className="text-[10px] text-gray-500 mb-0.5">Pér. contact (×1.2)</div>
                    <div className="font-bold text-violet-600 text-lg">
                      {Number(heures) > 0 ? Math.round(Number(heures) * 1.2) : '—'}
                    </div>
                    <div className="text-[10px] text-gray-400">périodes 50 min</div>
                  </div>
                  <div className="bg-white rounded border border-violet-100 p-2">
                    <div className="text-[10px] text-gray-500 mb-0.5">Pér. dossier pédag.</div>
                    <div className="font-bold text-iip-gold text-lg">{coursPer ?? '—'}</div>
                    <div className="text-[10px] text-gray-400">périodes prof.</div>
                  </div>
                </div>
                {Number(heures) > 0 && coursPer > 0 && (
                  <div className="text-xs text-violet-600 text-center pt-1 border-t border-violet-100">
                    Temps hors-contact estimé : <strong>{Math.max(0, Math.round(coursPer - Number(heures) * 1.2))} pér.</strong>
                    <span className="text-gray-400"> (corrections, évaluations, préparation...)</span>
                  </div>
                )}

                {/* Analyse autonomie UE — intervalle [min ; max] */}
                {ueAnalyse && ueAnalyse.per_ouvertes > 0 && (
                  <div className={`rounded p-2 mt-1 text-xs ${ueAnalyse.ok ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                    <div className="font-semibold mb-1">
                      {ueAnalyse.ok ? '✅' : '⚠'} Autonomie UE {ueNum} ({ueAnalyse.nb_cours} cours)
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <span className="text-gray-500">Pér. cours DP :</span>
                      <span className="font-medium">{ueAnalyse.per_cours_dp} pér.</span>
                      <span className="text-gray-500">Pér. cours ouvertes :</span>
                      <span className="font-medium">{ueAnalyse.per_ouvertes} pér.{ueAnalyse.per_ajoutees > 0 && ` (+${ueAnalyse.per_ajoutees} dédoubl.)`}</span>
                      <span className="text-gray-500">Autonomie DP (min) :</span>
                      <span className="font-medium">{ueAnalyse.ue_aut} pér.</span>
                      {ueAnalyse.multiple_obligatoire ? (
                        <>
                          <span className="text-gray-500">Tous dédoublés ×{ueAnalyse.multiple_obligatoire} :</span>
                          <span className="font-medium">autonomie = {ueAnalyse.attendu} pér. (obligatoire)</span>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-500">Autonomie max (20% ajout) :</span>
                          <span className="font-medium">{ueAnalyse.max} pér.</span>
                        </>
                      )}
                      <span className="text-gray-500">Déjà attribuée :</span>
                      <span className="font-medium">{ueAnalyse.aut_attribuee} pér.</span>
                    </div>
                    <div className={`mt-1 pt-1 border-t font-semibold ${ueAnalyse.ok ? 'border-green-200' : 'border-orange-200'}`}>
                      {ueAnalyse.ok
                        ? (ueAnalyse.multiple_obligatoire
                            ? `✅ Autonomie conforme (${ueAnalyse.attendu} pér.)`
                            : `✅ Autonomie dans l'intervalle [${ueAnalyse.min} ; ${ueAnalyse.max}]`)
                        : (ueAnalyse.multiple_obligatoire
                            ? `⚠ Tous les cours dédoublés ×${ueAnalyse.multiple_obligatoire} → l'autonomie doit être ${ueAnalyse.attendu} pér.`
                            : ueAnalyse.depasse_max
                              ? `⚠ Autonomie ${ueAnalyse.aut_attribuee} > max ${ueAnalyse.max} → utiliser EPT ligne 96 pour le surplus`
                              : `⚠ Autonomie ${ueAnalyse.aut_attribuee} hors intervalle [${ueAnalyse.min} ; ${ueAnalyse.max}]`)}
                    </div>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded">
                  <thead>
                    <tr className="bg-gray-50 text-xs uppercase text-gray-600">
                      <th className="text-left p-2 border-b">Cours</th>
                      <th className="text-left p-2 border-b">Activité</th>
                      <th className="text-left p-2 border-b">Groupe</th>
                      <th className="text-left p-2 border-b">Contrat</th>
                      <th className="text-left p-2 border-b">Professeur</th>
                      {hasHelb && <th className="text-left p-2 border-b bg-pink-50 text-pink-700">Statut HELB</th>}
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
                      const isHelb = r.contrat_mdp === 'HELB';
                      return (
                        <tr key={r.id} className={`
                          ${isHelb ? 'bg-pink-50 hover:bg-pink-100/70' : 'hover:bg-iip-gold/5'}
                          ${r._new && !isHelb ? 'bg-green-50/50' : ''}
                          ${r._new && isHelb ? 'bg-pink-50' : ''}
                        `}>
                          <td className="p-2 border-b text-gray-700">{r.nom_cours}</td>
                          <td className="p-2 border-b">
                            {(() => {
                              const per = Number(r.periodes_attribuees) || 0;
                              const aut = Number(r.autonomie_attribuee) || 0;
                              const manque = per === 0 && aut > 0 && !r.activite_id;
                              return (
                            <div className="flex gap-1 items-center">
                              <select value={r.activite_id ?? ''}
                                    disabled={!canEdit}
                                    onChange={e => updateRow(r.id, 'activite_id', e.target.value ? Number(e.target.value) : null)}
                                    title={manque ? 'Activité requise pour une ligne d\'autonomie seule' : ''}
                                    className={`flex-1 bg-transparent border rounded px-2 py-1 text-sm focus:border-iip-gold outline-none ${manque ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
                                <option value="">— Aucune —</option>
                                {activites.filter(a => !a.ue_num).length > 0 && (
                                  <optgroup label="Globales">
                                    {activites.filter(a => !a.ue_num && !a.section).map(a => <option key={a.id} value={a.id}>{a.libelle}</option>)}
                                  </optgroup>
                                )}
                                {activites.filter(a => a.section && !a.ue_num).length > 0 && (
                                  <optgroup label={`Section ${section}`}>
                                    {activites.filter(a => a.section && !a.ue_num).map(a => <option key={a.id} value={a.id}>{a.libelle}</option>)}
                                  </optgroup>
                                )}
                                {activites.filter(a => a.ue_num).length > 0 && (
                                  <optgroup label="Ce cours">
                                    {activites.filter(a => a.ue_num).map(a => <option key={a.id} value={a.id}>{a.libelle}</option>)}
                                  </optgroup>
                                )}
                              </select>
                              {canEdit && (
                                <button onClick={() => setShowNewActivite({ rowId: r.id })}
                                  title="Créer une nouvelle activité pour ce cours"
                                  className="text-gray-300 hover:text-iip-gold transition text-lg leading-none flex-shrink-0">+</button>
                              )}
                            </div>
                              );
                            })()}
                          </td>
                          <td className="p-2 border-b">
                            <input type="text" value={r.code ?? ''}
                                   disabled={!canEdit}
                                   onChange={e => updateRow(r.id, 'code', e.target.value)}
                                   className="w-16 border border-gray-200 rounded px-2 py-1 text-center text-sm focus:border-iip-gold outline-none" />
                          </td>
                          <td className="p-2 border-b">
                            <select value={r.contrat_mdp ?? 'IIP'}
                                    disabled={!canEdit}
                                    onChange={e => updateRow(r.id, 'contrat_mdp', e.target.value)}
                                    className={`w-full bg-transparent border border-gray-200 rounded px-2 py-1 text-sm focus:border-iip-gold outline-none font-semibold
                                      ${isHelb ? 'text-pink-700' : 'text-iip-gold'}`}>
                              <option value="IIP">IIP</option>
                              <option value="HELB">HELB</option>
                            </select>
                          </td>
                          <td className="p-2 border-b">
                            <select value={r.professeur_id ?? ''}
                                    disabled={!canEdit}
                                    onChange={e => {
                                      const aD = profs.find(p => p.nom === 'À DÉSIGNER');
                                      updateRow(r.id, 'professeur_id', e.target.value ? Number(e.target.value) : (aD?.id ?? null));
                                    }}
                                    className="w-full bg-transparent border border-gray-200 rounded px-2 py-1 text-sm focus:border-iip-gold outline-none">
                              <option value="">— À DÉSIGNER —</option>
                              {profs.filter(p => p.nom !== 'À DÉSIGNER').map(p => <option key={p.id} value={p.id}>{p.nom_prenom}</option>)}
                            </select>
                          </td>
                          {hasHelb && (
                            <td className="p-2 border-b bg-pink-50/50">
                              {isHelb ? (
                                <select value={r.type_cours_helb ?? ''}
                                        disabled={!canEdit}
                                        onChange={e => updateRow(r.id, 'type_cours_helb', e.target.value)}
                                        className="w-full bg-white border border-pink-200 rounded px-2 py-1 text-sm focus:border-pink-400 outline-none text-pink-800">
                                  <option value="">— Choisir —</option>
                                  <option value="Cours">Cours</option>
                                  <option value="TP">TP</option>
                                </select>
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                          )}
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
                      <td colSpan={hasHelb ? 6 : 5} className="p-2 text-right text-gray-700">TOTAUX</td>
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
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={addRow}
                          className="bg-iip-mauve/15 hover:bg-iip-mauve/25 text-iip-mauve text-sm font-medium px-4 py-2 rounded">
                    ➕ Ajouter une ligne
                  </button>
                  <button
                    onClick={() => {
                      localStorage.setItem('referentiels_goto', 'activites');
                      window.location.href = '/referentiels';
                    }}
                    title="Ouvrir la gestion des activités dans les Référentiels"
                    className="text-sm text-gray-500 hover:text-iip-gold border border-gray-200 hover:border-iip-gold/40 px-3 py-2 rounded transition">
                    🎯 Gérer les activités…
                  </button>
                </div>
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

      {/* Mini-modal : créer une nouvelle activité */}
      {showNewActivite && (
        <ModalNouvelleActivite
          section={section}
          onCreer={async (libelle, portee) => {
            try {
              const id = await creerActivite(libelle, portee);
              updateRow(showNewActivite.rowId, 'activite_id', id);
              setShowNewActivite(null);
            } catch(e) { alert(e.message); }
          }}
          onClose={() => setShowNewActivite(null)}
        />
      )}
    </div>
  );
}

function ModalNouvelleActivite({ section, onCreer, onClose }) {
  const [libelle, setLibelle] = useState('');
  const [portee, setPortee]   = useState('cours'); // 'cours' | 'section' | 'global'
  const [saving, setSaving]   = useState(false);

  async function valider() {
    if (!libelle.trim()) return;
    setSaving(true);
    try { await onCreer(libelle.trim(), portee); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-800">+ Nouvelle activité</h3>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Nom de l'activité</label>
          <input autoFocus type="text" value={libelle} onChange={e => setLibelle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && valider()}
            placeholder="ex. TP Palpation, Remédiation…"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-iip-gold outline-none" />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-2">Portée</label>
          <div className="space-y-2">
            {[
              { value: 'cours',   label: 'Ce cours uniquement',    desc: 'Disponible seulement pour cette UE' },
              { value: 'section', label: `Section ${section}`,     desc: 'Disponible pour tous les cours de la section' },
              { value: 'global',  label: 'Globale',                desc: 'Disponible pour toutes les sections' },
            ].map(opt => (
              <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="portee" value={opt.value} checked={portee === opt.value}
                  onChange={() => setPortee(opt.value)} className="mt-0.5 accent-iip-gold" />
                <div>
                  <p className="text-sm font-medium text-gray-700">{opt.label}</p>
                  <p className="text-xs text-gray-400">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-600 text-sm py-2 rounded">Annuler</button>
          <button onClick={valider} disabled={!libelle.trim() || saving}
            className="flex-1 bg-iip-gold text-white text-sm py-2 rounded hover:bg-iip-amber disabled:opacity-50">
            {saving ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

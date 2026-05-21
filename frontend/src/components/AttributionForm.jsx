import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Modale de création OU d'édition d'une attribution.
 * Charge automatiquement les UE de la section choisie, puis les cours de l'UE,
 * et propose une liste de professeurs.
 *
 * @param onClose      - callback à la fermeture
 * @param onCreated    - callback après création (recharge la liste)
 * @param editRow      - attribution existante à éditer (null = mode création)
 */
export default function AttributionForm({ onClose, onCreated, editRow = null }) {
  const isEdit = !!editRow;
  const [sections, setSections] = useState([]);
  const [ueList, setUeList] = useState([]);
  const [coursList, setCoursList] = useState([]);
  const [profs, setProfs] = useState([]);
  const [types, setTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState(isEdit ? {
    section: editRow.section || '',
    contrat_mdp: editRow.contrat_mdp || 'IIP',
    etablissement_referent: editRow.etablissement_referent || 'IIP',
    organisation: editRow.organisation || 'x',
    ue_num: editRow.ue_num || '',
    num_organisation: editRow.num_organisation || 1,
    code_cours: editRow.code_cours || '',
    type_cours: editRow.type_cours || 'CT',
    type_cours_helb: editRow.type_cours_helb || '',
    code: editRow.code || 'A',
    nb_groupes: editRow.nb_groupes || 1,
    split_groupe: editRow.split_groupe || 'N',
    professeur_id: editRow.professeur_id || '',
    cours_ept_ad: editRow.cours_ept_ad || 'C',
    coordination_encadrement: editRow.coordination_encadrement || 'Cours',
    quadrimestre_attribue: editRow.quadrimestre_attribue || '',
    commentaire: editRow.commentaire || '',
    periodes_attribuees: editRow.periodes_attribuees ?? 0,
    autonomie_attribuee: editRow.autonomie_attribuee ?? 0,
    per_etudiant_total_dp: editRow.per_etudiant_total_dp ?? 0
  } : {
    section: '',
    contrat_mdp: 'IIP',
    etablissement_referent: 'IIP',
    organisation: 'x',
    ue_num: '',
    num_organisation: 1,
    code_cours: '',
    type_cours: 'CT',
    type_cours_helb: '',
    code: 'A',
    nb_groupes: 1,
    split_groupe: 'N',
    professeur_id: '',
    cours_ept_ad: 'C',
    coordination_encadrement: 'Cours',
    quadrimestre_attribue: '',
    commentaire: '',
    periodes_attribuees: 0,
    autonomie_attribuee: 0,
    per_etudiant_total_dp: 0
  });

  useEffect(() => {
    Promise.all([api.sections(), api.professeurs(), api.typesEncadrement()])
      .then(([s, p, t]) => { setSections(s); setProfs(p); setTypes(t); })
      .catch(e => setError(e.message));
  }, []);

  // Charger les UE quand la section change
  // En mode édition, on évite de réinitialiser ue_num/code_cours au premier rendu.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (form.section) {
      api.ue(form.section).then(setUeList).catch(console.error);
    } else { setUeList([]); }
    if (hydrated) {
      setForm(f => ({ ...f, ue_num: '', code_cours: '' }));
    }
  }, [form.section]);

  // Charger les cours quand l'UE change
  useEffect(() => {
    if (form.ue_num) {
      api.cours({ ue_num: form.ue_num }).then(setCoursList).catch(console.error);
    } else { setCoursList([]); }
    if (hydrated) {
      setForm(f => ({ ...f, code_cours: '' }));
    }
  }, [form.ue_num]);

  // Active la réinitialisation après le premier rendu
  useEffect(() => { setHydrated(true); }, []);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.section || !form.ue_num || !form.code_cours) {
      setError('Section, UE et cours sont obligatoires.');
      return;
    }
    // Une ligne avec 0 période mais de l'autonomie doit avoir une activité
    const per = Number(form.periodes_attribuees) || 0;
    const aut = Number(form.autonomie_attribuee) || 0;
    if (per === 0 && aut > 0 && !form.activite_id) {
      setError('Une ligne sans période de cours (autonomie seule) doit être rattachée à une activité (ex. théorie, TP).');
      return;
    }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        ue_num: Number(form.ue_num),
        professeur_id: form.professeur_id ? Number(form.professeur_id) : null,
        num_organisation: Number(form.num_organisation),
        nb_groupes: Number(form.nb_groupes),
        periodes_attribuees: Number(form.periodes_attribuees),
        autonomie_attribuee: Number(form.autonomie_attribuee),
        per_etudiant_total_dp: Number(form.per_etudiant_total_dp)
      };
      if (isEdit) {
        await api.updateAttribution(editRow.id, payload);
      } else {
        await api.createAttribution(payload);
      }
      onCreated?.();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const total = Number(form.periodes_attribuees) + Number(form.autonomie_attribuee);
  const heures = Math.round(total * 50 / 60);
  const cout = form.contrat_mdp === 'IIP' ? (total * 1.5) : 0; // approx SUP

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex items-center justify-between">
          <h2 className="text-xl font-title text-iip-gold">{isEdit ? 'Modifier l\'attribution' : 'Nouvelle attribution'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3">{error}</div>}

          {/* Contexte */}
          <fieldset className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <legend className="text-sm font-medium text-gray-700 mb-2 col-span-full">📋 Contexte</legend>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Section *</label>
              <select value={form.section} onChange={e => set('section', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="">—</option>
                {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Contrat MDP</label>
              <select value={form.contrat_mdp} onChange={e => set('contrat_mdp', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="IIP">IIP</option>
                <option value="HELB">HELB</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Établissement réf.</label>
              <select value={form.etablissement_referent} onChange={e => set('etablissement_referent', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="IIP">IIP</option>
                <option value="HELB">HELB</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Organisation</label>
              <select value={form.organisation} onChange={e => set('organisation', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="x">Organisé (x)</option>
                <option value="">Non organisé</option>
              </select>
            </div>
          </fieldset>

          {/* UE et Cours */}
          <fieldset className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <legend className="text-sm font-medium text-gray-700 mb-2 col-span-full">📚 UE et cours</legend>
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-0.5">UE *</label>
              <select value={form.ue_num} onChange={e => set('ue_num', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="">—</option>
                {ueList.map(u => <option key={u.ue_num} value={u.ue_num}>{u.ue_num} — {u.ue_nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">N° organisation</label>
              <input type="number" value={form.num_organisation} min="1"
                     onChange={e => set('num_organisation', e.target.value)}
                     className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Quadri attribué</label>
              <select value={form.quadrimestre_attribue} onChange={e => set('quadrimestre_attribue', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="">—</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q1/Q2">Q1/Q2</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-0.5">Cours *</label>
              <select value={form.code_cours} onChange={e => set('code_cours', e.target.value)}
                      disabled={!coursList.length}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm disabled:bg-gray-50">
                <option value="">—</option>
                {coursList.map(c => <option key={c.cours_code} value={c.cours_code}>{c.cours_code} — {c.cours_nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Type cours</label>
              <select value={form.type_cours} onChange={e => set('type_cours', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="CT">CT (800ᵉ)</option>
                <option value="PP">PP (1000ᵉ)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Type HELB</label>
              <select value={form.type_cours_helb} onChange={e => set('type_cours_helb', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="">—</option>
                <option value="MFP">MFP (750h)</option>
                <option value="MA">MA (480h)</option>
              </select>
            </div>
          </fieldset>

          {/* Groupe */}
          <fieldset className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <legend className="text-sm font-medium text-gray-700 mb-2 col-span-full">👥 Groupe</legend>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Code (A/B/...)</label>
              <input value={form.code} onChange={e => set('code', e.target.value)}
                     className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Nb groupes</label>
              <input type="number" value={form.nb_groupes} min="1"
                     onChange={e => set('nb_groupes', e.target.value)}
                     className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Split-groupe</label>
              <select value={form.split_groupe} onChange={e => set('split_groupe', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="N">Non</option>
                <option value="O">Oui</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Per. étudiant DP</label>
              <input type="number" value={form.per_etudiant_total_dp}
                     onChange={e => set('per_etudiant_total_dp', e.target.value)}
                     className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
            </div>
          </fieldset>

          {/* Professeur */}
          <fieldset className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <legend className="text-sm font-medium text-gray-700 mb-2 col-span-full">👨‍🏫 Professeur</legend>
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 mb-0.5">Professeur *</label>
              <select value={form.professeur_id} onChange={e => set('professeur_id', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="">—</option>
                {profs.map(p => <option key={p.id} value={p.id}>{p.nom_prenom} ({p.statut || '?'})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Cours/EPT/AD</label>
              <select value={form.cours_ept_ad} onChange={e => set('cours_ept_ad', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                <option value="C">C</option>
                <option value="EPT">EPT</option>
                <option value="AD">AD</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">Coordination/Encadrement</label>
              <select value={form.coordination_encadrement} onChange={e => set('coordination_encadrement', e.target.value)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                {types.map(t => <option key={t.code} value={t.code}>{t.libelle}</option>)}
              </select>
            </div>
          </fieldset>

          {/* Périodes (les inputs principaux) */}
          <fieldset className="bg-iip-gold/5 rounded-lg p-4 border border-iip-gold/20">
            <legend className="text-sm font-medium text-iip-gold mb-2 px-1">⭐ Charge (inputs principaux)</legend>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Périodes attribuées</label>
                <input type="number" step="0.5" value={form.periodes_attribuees}
                       onChange={e => set('periodes_attribuees', e.target.value)}
                       className="w-full border border-iip-gold/40 rounded px-2 py-1.5 text-sm bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Autonomie attribuée</label>
                <input type="number" step="0.5" value={form.autonomie_attribuee}
                       onChange={e => set('autonomie_attribuee', e.target.value)}
                       className="w-full border border-iip-gold/40 rounded px-2 py-1.5 text-sm bg-white" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Total (calculé)</label>
                <div className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-gray-50 font-semibold">{total}</div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Heures (50/60)</label>
                <div className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-gray-50">{heures}</div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Coût dot. (SUP×1.5)</label>
                <div className="border border-gray-200 rounded px-2 py-1.5 text-sm bg-gray-50">{cout}</div>
              </div>
            </div>
          </fieldset>

          {/* Commentaire */}
          <div>
            <label className="block text-xs text-gray-600 mb-0.5">Commentaire</label>
            <textarea value={form.commentaire} onChange={e => set('commentaire', e.target.value)}
                      rows="2" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
          <button onClick={submit} disabled={saving}
                  className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-5 py-2 rounded font-medium disabled:opacity-50">
            {saving ? 'Enregistrement…' : (isEdit ? '✓ Enregistrer' : '✓ Créer l\'attribution')}
          </button>
        </div>
      </div>
    </div>
  );
}

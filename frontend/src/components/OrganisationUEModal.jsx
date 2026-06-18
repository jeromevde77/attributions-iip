import { useState, useEffect } from 'react';
import { IconCalendar, IconDeviceFloppy, IconPencil, IconTrash } from '@tabler/icons-react';

const FLAGS = [
  { key: 'ept_uniquement',        label: 'Uniquement EPT / périodes suppl.' },
  { key: 'va_uniquement',         label: 'Uniquement pour VA' },
  { key: 'sept_tq_7p',            label: 'Uniquement 7TQ, 7P' },
  { key: 'hybride',               label: 'Enseignement hybride' },
  { key: 'prison',                label: 'En prison' },
  { key: 'activite_formation',    label: 'Activité de formation' },
  { key: 'conseiller_prevention', label: 'Conseiller prévention / DPO' },
];

function OrgForm({ org, onSave, onDelete, onCancel }) {
  const [form, setForm] = useState({
    num_organisation: org?.num_organisation ?? 1,
    date_debut: org?.date_debut ?? '',
    date_fin: org?.date_fin ?? '',
    nb_semaines: org?.nb_semaines ?? '',
    ept_uniquement: org?.ept_uniquement ?? 0,
    va_uniquement: org?.va_uniquement ?? 0,
    sept_tq_7p: org?.sept_tq_7p ?? 0,
    hybride: org?.hybride ?? 0,
    prison: org?.prison ?? 0,
    activite_formation: org?.activite_formation ?? 0,
    conseiller_prevention: org?.conseiller_prevention ?? 0,
    ue_2_annees_org_prec: org?.ue_2_annees_org_prec ?? '',
    intervention_ext_type: org?.intervention_ext_type ?? '',
    intervention_ext_50: org?.intervention_ext_50 ?? 0,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-iip-gold text-sm">Organisation N° {form.num_organisation}</div>
        {org?.id && (
          <button onClick={() => onDelete(org.id)}
            className="text-red-400 hover:text-red-600 text-xs"><IconTrash size={14} className="inline align-[-2px] mr-1" />Supprimer</button>
        )}
      </div>

      {/* Dates obligatoires */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">* Début organisation</label>
          <input type="text" placeholder="JJ/MM/AAAA" value={form.date_debut}
            onChange={e => set('date_debut', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">* Fin organisation</label>
          <input type="text" placeholder="JJ/MM/AAAA" value={form.date_fin}
            onChange={e => set('date_fin', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nb semaines</label>
          <input type="number" min="1" max="52" value={form.nb_semaines}
            onChange={e => set('nb_semaines', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
      </div>

      {/* Flags */}
      <div className="grid grid-cols-2 gap-1">
        {FLAGS.map(f => (
          <label key={f.key} className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={!!form[f.key]}
              onChange={e => set(f.key, e.target.checked ? 1 : 0)}
              className="rounded" />
            {f.label}
          </label>
        ))}
      </div>

      {/* Options avancées */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
        <div>
          <label className="block text-xs text-gray-500 mb-1">UE sur 2 ans — N° org année préc.</label>
          <input type="number" min="1" value={form.ue_2_annees_org_prec}
            onChange={e => set('ue_2_annees_org_prec', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type intervention extérieure</label>
          <input type="text" value={form.intervention_ext_type}
            onChange={e => set('intervention_ext_type', e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={!!form.intervention_ext_50}
          onChange={e => set('intervention_ext_50', e.target.checked ? 1 : 0)} />
        Intervention extérieure à 50% et plus
      </label>

      <div className="flex gap-2 pt-2">
        <button onClick={() => onSave(form)}
          disabled={!form.date_debut || !form.date_fin}
          className="bg-iip-gold text-white text-sm px-4 py-1.5 rounded hover:bg-iip-amber disabled:opacity-50">
          <IconDeviceFloppy size={14} className="inline align-[-2px] mr-1" />Enregistrer
        </button>
        <button onClick={onCancel}
          className="text-gray-500 text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50">
          Annuler
        </button>
      </div>
    </div>
  );
}

export default function OrganisationUEModal({ ue_num, section, ue_nom, annee, onClose }) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);  // null | 'new' | org object
  const tok = () => localStorage.getItem('token');

  async function charger() {
    setLoading(true);
    try {
      const d = await fetch(
        `/api/ref/organisations-ue?ue_num=${ue_num}&section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`,
        { headers: { Authorization: `Bearer ${tok()}` } }
      ).then(r => r.json());
      setOrgs(Array.isArray(d) ? d : []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { charger(); }, []);

  async function sauvegarder(form) {
    const next_num = editing === 'new'
      ? (orgs.length ? Math.max(...orgs.map(o => o.num_organisation)) + 1 : 1)
      : editing.num_organisation;

    await fetch('/api/ref/organisations-ue', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ue_num, section, annee_scolaire: annee, ...form, num_organisation: next_num }),
    });
    setEditing(null);
    await charger();
  }

  async function supprimer(id) {
    if (!confirm('Supprimer cette organisation ?')) return;
    await fetch(`/api/ref/organisations-ue/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${tok()}` }
    });
    setEditing(null);
    await charger();
  }

  const fmt = (d) => d || '—';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <div className="font-bold text-iip-gold text-lg">Organisations — UE {ue_num}</div>
            <div className="text-xs text-gray-500">{ue_nom} · {section} · {annee}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {loading ? (
            <div className="text-gray-400 text-sm text-center py-4">Chargement...</div>
          ) : (
            <>
              {/* Liste des organisations existantes */}
              {orgs.map(org => (
                editing?.id === org.id ? (
                  <OrgForm key={org.id} org={editing}
                    onSave={sauvegarder} onDelete={supprimer} onCancel={() => setEditing(null)} />
                ) : (
                  <div key={org.id}
                    className="border border-gray-200 rounded-lg p-4 flex items-start justify-between hover:border-iip-gold/50 cursor-pointer"
                    onClick={() => setEditing(org)}>
                    <div>
                      <div className="font-semibold text-iip-gold text-sm mb-1">
                        Organisation N° {org.num_organisation}
                      </div>
                      <div className="text-xs text-gray-600">
                        <IconCalendar size={13} className="inline align-[-2px] mr-1" />{fmt(org.date_debut)} → {fmt(org.date_fin)}
                        {org.nb_semaines && <span className="ml-3">📆 {org.nb_semaines} semaines</span>}
                      </div>
                      {FLAGS.filter(f => org[f.key]).length > 0 && (
                        <div className="text-xs text-gray-400 mt-1">
                          {FLAGS.filter(f => org[f.key]).map(f => f.label).join(' · ')}
                        </div>
                      )}
                    </div>
                    <span className="text-iip-gold text-xs"><IconPencil size={12} className="inline align-[-2px] mr-1" />Modifier</span>
                  </div>
                )
              ))}

              {/* Formulaire nouvelle organisation */}
              {editing === 'new' ? (
                <OrgForm org={{ num_organisation: (orgs.length ? Math.max(...orgs.map(o => o.num_organisation)) + 1 : 1) }}
                  onSave={sauvegarder} onDelete={null} onCancel={() => setEditing(null)} />
              ) : (
                <button onClick={() => setEditing('new')}
                  className="w-full border-2 border-dashed border-iip-gold/40 hover:border-iip-gold text-iip-gold text-sm py-3 rounded-lg">
                  + Ajouter une organisation
                </button>
              )}
            </>
          )}
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

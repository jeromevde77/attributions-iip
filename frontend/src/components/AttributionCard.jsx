import { useState } from 'react';
import { IconTrash, IconX, IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { Fenetre, TuileEtat, Encadre, PastilleEtat } from './ui.jsx';
import { api } from '../lib/api.js';
import { informer } from '../lib/dialogue.jsx';

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
    const per = Number(form.periodes_attribuees) || 0;
    const aut = Number(form.autonomie_attribuee) || 0;
    if (per === 0 && aut > 0 && !form.activite_id) {
      informer('Une ligne sans période de cours (autonomie seule) doit être rattachée à une activité (ex. théorie, TP).');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        periodes_attribuees: Number(form.periodes_attribuees),
        autonomie_attribuee: Number(form.autonomie_attribuee),
        contrat_mdp: form.contrat_mdp || null,
        quadrimestre_attribue: form.quadrimestre_attribue || null,
        type_cours_helb: form.contrat_mdp === 'HELB' ? (form.type_cours_helb || null) : null,
        num_organisation: Number(form.num_organisation) || 1,
        code: form.code || null,
        professeur_id: form.professeur_id ? Number(form.professeur_id) : null,
        activite_id: form.activite_id ? Number(form.activite_id) : null
      };
      await api.updateAttribution(row.id, payload);
      onChange?.();
      setOpen(false);
    } catch (e) { informer(e.message); }
    finally { setSaving(false); }
  }

  const contratBadge =
    row.contrat_mdp === 'IIP'  ? <span className="badge badge-iip">IIP</span> :
    row.contrat_mdp === 'HELB' ? <span className="badge badge-helb">HELB</span> : null;

  const typeBadge =
    row.type_cours === 'CT' ? <span className="badge badge-ct">CT</span> :
    row.type_cours === 'PP' ? <span className="badge badge-pp">PP</span> : null;

  const cardHelb = row.contrat_mdp === 'HELB';
  const champ = 'controle w-full';

  return (
    <>
      <div className={`carte p-3 transition-all ${selected ? 'ring-2 ring-iip-blue/30' : ''}`}
        style={cardHelb ? { borderLeft: '4px solid var(--c-helb)' } : undefined}>
        <div className="flex items-start gap-2">
          {isAdmin && (
            <input type="checkbox" checked={selected || false}
                   onChange={e => { e.stopPropagation(); onToggleSelect?.(row.id); }}
                   className="mt-1 cursor-pointer flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0" onClick={() => setOpen(true)}>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1 flex-wrap">
              <span>UE {row.ue_num}</span>
              {row.num_organisation > 1 && <PastilleEtat etat="neutre">Org. {row.num_organisation}</PastilleEtat>}
              {row.code_cours && <><span>·</span><span>{row.code_cours}</span></>}
              {row.bloc && <><span>·</span><span>{row.bloc}</span></>}
            </div>
            <div className="text-sm font-medium text-iip-texte line-clamp-1 mb-0.5">
              {row.nom_cours || row.ue_nom}
            </div>
            {row.activite_nom && <div className="text-xs text-slate-500 mb-1">{row.activite_nom}</div>}
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                {contratBadge}
                {typeBadge}
                {row.type_cours_helb && <span className="badge badge-helb">{row.type_cours_helb}</span>}
                {row.code && <span className="badge badge-exp">Gr. {row.code}</span>}
                {row.quadrimestre_attribue && <span className="badge badge-exp">{row.quadrimestre_attribue}</span>}
                {row.contrat && <span className="badge badge-exp">{row.contrat === 'EXP' && cardHelb ? 'PI' : row.contrat}</span>}
                {conforme === 0 && <PastilleEtat etat="corriger" title="Non conforme"><IconX size={11} stroke={2.5} /></PastilleEtat>}
              </div>
              <div className="text-right">
                <div className="text-base font-bold text-iip-blue leading-tight">{row.total_attribue_professeur ?? total}</div>
                <div className="text-mention text-slate-500 leading-tight">per.</div>
              </div>
            </div>
            <div className="mt-1.5 text-xs text-slate-600 truncate">
              {row.professeur || <span className="italic inline-flex items-center gap-1" style={{ color: 'var(--c-attente)' }}>
                <IconAlertTriangle size={12} /> Professeur non assigné</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Édition rapide : une fenêtre de Lucie. */}
      {open && (
        <Fenetre titre={row.nom_cours || row.ue_nom}
          sous={`${row.section || ''} · UE ${row.ue_num} · ${row.code_cours || ''}${row.activite_nom ? ` · ${row.activite_nom}` : ''}`}
          large="petite" onFermer={() => setOpen(false)}
          pied={<>
            {isAdmin && (
              <button onClick={() => { setOpen(false); onDelete?.(row.id); }}
                      className="bouton bouton-detruire" aria-label="Supprimer" title="Supprimer">
                <IconTrash size={15} />
              </button>
            )}
            <span />
            <button onClick={() => setOpen(false)} className="bouton">Fermer</button>
            <button onClick={save} disabled={saving} className="bouton bouton-fort">
              {saving ? '…' : 'Enregistrer'}
            </button>
          </>}>
            <div className="space-y-3">
              {/* Professeur */}
              <label className="block">
                <div className="text-xs text-slate-600 mb-1">Professeur</div>
                <select value={form.professeur_id} onChange={e => set('professeur_id', e.target.value)} className={champ}>
                  <option value="">— Aucun —</option>
                  {professeurs.map(p => <option key={p.id} value={p.id}>{p.nom_prenom}</option>)}
                </select>
              </label>

              {/* Activité */}
              <label className="block">
                <div className="text-xs text-slate-600 mb-1">Activité</div>
                <select value={form.activite_id} onChange={e => set('activite_id', e.target.value)} className={champ}>
                  <option value="">— Aucune —</option>
                  {activites.map(a => <option key={a.id} value={a.id}>{a.libelle}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs text-slate-600 mb-1">Contrat</div>
                  <select value={form.contrat_mdp} onChange={e => set('contrat_mdp', e.target.value)} className={champ}>
                    <option value="">—</option>
                    <option value="IIP">IIP</option>
                    <option value="HELB">HELB</option>
                  </select>
                </label>
                <label className="block">
                  <div className="text-xs text-slate-600 mb-1">Quadrimestre</div>
                  <select value={form.quadrimestre_attribue} onChange={e => set('quadrimestre_attribue', e.target.value)} className={champ}>
                    <option value="">—</option>
                    <option value="Q1">Q1</option>
                    <option value="Q2">Q2</option>
                    <option value="Q1/Q2">Q1/Q2</option>
                  </select>
                </label>
                <label className="block">
                  <div className="text-xs text-slate-600 mb-1">Groupe</div>
                  <input type="text" value={form.code} onChange={e => set('code', e.target.value)} className={champ} />
                </label>
                <label className="block">
                  <div className="text-xs text-slate-600 mb-1">Organisation</div>
                  <select value={form.num_organisation} onChange={e => set('num_organisation', e.target.value)} className={champ}>
                    <option value="1">1</option><option value="2">2</option>
                    <option value="3">3</option><option value="4">4</option>
                  </select>
                </label>
                {isHelb && (
                  <label className="block col-span-2">
                    <div className="text-xs text-slate-600 mb-1">Statut HELB</div>
                    <select value={form.type_cours_helb} onChange={e => set('type_cours_helb', e.target.value)} className={champ}>
                      <option value="">—</option>
                      <option value="MFP">MFP</option>
                      <option value="MA">MA</option>
                    </select>
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <label className="block">
                  <div className="text-xs text-slate-600 mb-1">Périodes</div>
                  <input type="text" inputMode="decimal" value={form.periodes_attribuees}
                         onChange={e => set('periodes_attribuees', e.target.value)}
                         className={`${champ} no-spinner`} />
                </label>
                <label className="block">
                  <div className="text-xs text-slate-600 mb-1">Autonomie</div>
                  <input type="text" inputMode="decimal" value={form.autonomie_attribuee}
                         onChange={e => set('autonomie_attribuee', e.target.value)}
                         className={`${champ} no-spinner`} />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <TuileEtat taille="compacte" valeur={total} libelle="Total" />
                <TuileEtat taille="compacte" valeur={heures} libelle="Heures" />
                <TuileEtat taille="compacte" valeur={row.cout_dotation || '—'} libelle="Coût dot." />
              </div>

              {row.cours_per != null && (
                <Encadre etat={conforme ? 'reussi' : 'corriger'} icone={conforme ? IconCheck : IconX}
                  titre={conforme ? 'Conforme' : `Non conforme (ratio ${row.cours_multiple_attendu})`}>
                  Cours_per : {row.cours_per} · Total attribué : {row.cours_total_attribue}
                </Encadre>
              )}
            </div>
        </Fenetre>
      )}
    </>
  );
}

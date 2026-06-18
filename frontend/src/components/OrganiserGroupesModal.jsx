import { useState, useMemo } from 'react';
import { api } from '../lib/api.js';
import { IconChevronDown, IconChevronRight, IconChecks, IconSquare, IconX, IconUsersGroup } from '@tabler/icons-react';

// Nombre de groupes actuel d'un cours = nombre de lignes distinctes par code de groupe
function groupesActuels(cours) {
  const codes = new Set((cours.rows || []).map(r => r.code || 'Ts'));
  return Math.max(1, codes.size);
}

// Une rangée de pastilles Ts / 2 / 3 / 4 / + (jusqu'à 100)
function SelecteurGroupes({ valeur, onChange }) {
  const [libreOpen, setLibreOpen] = useState(false);
  const presets = [1, 2, 3, 4];
  const estPreset = presets.includes(valeur);
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {presets.map(n => (
        <button key={n} type="button" onClick={() => { onChange(n); setLibreOpen(false); }}
          className={`text-[11px] px-2.5 py-1 rounded-md border transition ${valeur === n
            ? 'bg-iip-turquoise/10 text-iip-blue border-iip-turquoise/40 font-medium'
            : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
          {n === 1 ? 'Ts' : n}
        </button>
      ))}
      {!estPreset && (
        <span className="text-[11px] px-2.5 py-1 rounded-md bg-iip-turquoise/10 text-iip-blue border border-iip-turquoise/40 font-medium">{valeur}</span>
      )}
      {libreOpen ? (
        <input type="number" min={1} max={100} autoFocus defaultValue={estPreset ? '' : valeur}
          onBlur={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= 100) onChange(v); setLibreOpen(false); }}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
          className="w-14 text-[11px] px-1.5 py-1 rounded-md border border-iip-turquoise/40" placeholder="2-100" />
      ) : (
        <button type="button" onClick={() => setLibreOpen(true)}
          className="text-[11px] px-2 py-1 rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50" title="Autre nombre (jusqu'à 100)">+</button>
      )}
    </div>
  );
}

export default function OrganiserGroupesModal({ portee, section, ues, onClose, onApplied }) {
  // portee : 'section' (toutes les UE) ou 'ue' (une seule)
  // ues : [{ ue_num, ue_nom, bloc, num_organisation, cours: [{code_cours, nom_cours, rows}] }]
  const peu = ues.length <= 3;
  const [expanded, setExpanded] = useState(() => new Set(peu ? ues.map(u => u.ue_num + '/' + (u.num_organisation || 1)) : []));
  const [orga2, setOrga2] = useState(new Set());      // clés d'UE cochées « créer orga 2 »
  const [source, setSource] = useState('orga');        // 'orga' | 'dp'
  const [busy, setBusy] = useState(false);
  // état des groupes : { ueKey: { code_cours: nbGroupes } }
  const [groupes, setGroupes] = useState(() => {
    const init = {};
    for (const ue of ues) {
      const k = ue.ue_num + '/' + (ue.num_organisation || 1);
      init[k] = {};
      for (const c of ue.cours) init[k][c.code_cours] = groupesActuels(c);
    }
    return init;
  });

  const keyOf = (ue) => ue.ue_num + '/' + (ue.num_organisation || 1);
  const toggleExp = (k) => setExpanded(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleOrga2 = (k) => setOrga2(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const setNb = (k, cc, n) => setGroupes(p => ({ ...p, [k]: { ...p[k], [cc]: n } }));
  const toutCocher = () => setOrga2(new Set(ues.map(keyOf)));
  const toutDecocher = () => setOrga2(new Set());

  async function appliquer() {
    setBusy(true);
    let okCount = 0, errs = [];
    try {
      for (const ue of ues) {
        const k = keyOf(ue);
        const creerOrga2 = orga2.has(k);
        const coursPayload = ue.cours.map(c => ({ code_cours: c.code_cours, nb_groupes: groupes[k]?.[c.code_cours] || 1 }));
        // N'agir que si quelque chose change OU si on crée une orga 2
        const change = creerOrga2 || ue.cours.some(c => (groupes[k]?.[c.code_cours] || 1) !== groupesActuels(c));
        if (!change) continue;
        try {
          await api.organiserGroupesUE(ue.ue_num, {
            section: section || ue.section,
            num_organisation: ue.num_organisation || 1,
            creer_orga_2: creerOrga2,
            cours: coursPayload,
          });
          okCount++;
        } catch (e) { errs.push(`UE ${ue.ue_num}: ${e.message}`); }
      }
      if (errs.length) alert(`${okCount} UE traitée(s).\nErreurs :\n${errs.join('\n')}`);
      onApplied(okCount);
    } finally { setBusy(false); }
  }

  const nbCoches = orga2.size;
  const blocCouleur = (bloc) => {
    const n = parseInt((bloc || '').match(/\d+/)?.[0] || '0');
    return ['#6b7280', '#f97316', '#60a5fa', '#1e3a8a', '#a855f7'][n] || '#6b7280';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '88vh' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <IconUsersGroup size={18} className="text-iip-mauve" />
            <span className="font-title text-lg">Organiser les groupes {portee === 'section' ? `— section ${section}` : `— UE ${ues[0]?.ue_num}`}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={18} /></button>
        </div>

        <div className="px-5 py-2 text-[12px] text-gray-500 border-b border-gray-50">
          Choisissez le nombre de groupes par cours : <b>Ts</b> (tous ensemble) ou 2, 3, 4… (A, B, C…). Cochez une UE pour la créer en <b>organisation 2</b> ; sinon l'organisation actuelle est modifiée.
        </div>

        <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-50">
          <button type="button" onClick={toutCocher} className="text-[12px] px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1"><IconChecks size={14} />Tout cocher (orga 2)</button>
          <button type="button" onClick={toutDecocher} className="text-[12px] px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1"><IconSquare size={14} />Tout décocher</button>
          <div className="flex-1" />
          {nbCoches > 0 && (
            <>
              <span className="text-[12px] text-gray-400">source orga 2 :</span>
              <select value={source} onChange={e => setSource(e.target.value)} className="text-[12px] border border-gray-200 rounded px-2 py-1">
                <option value="orga">Copier l'orga actuelle</option>
                <option value="dp">Dossier pédagogique</option>
              </select>
            </>
          )}
        </div>

        <div className="overflow-auto px-3 py-3 flex-1">
          {ues.map(ue => {
            const k = keyOf(ue);
            const open = expanded.has(k);
            const coche = orga2.has(k);
            return (
              <div key={k} className="mb-2 border border-gray-100 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2.5 px-3 py-2 bg-gray-50/70">
                  <input type="checkbox" checked={coche} onChange={() => toggleOrga2(k)} title="Créer en organisation 2"
                    className="w-4 h-4 cursor-pointer" />
                  <button onClick={() => toggleExp(k)} className="text-gray-400 hover:text-gray-600">
                    {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                  </button>
                  {ue.bloc && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded text-white" style={{ background: blocCouleur(ue.bloc) }}>{ue.bloc}</span>}
                  <span className="font-medium text-[13px] cursor-pointer" onClick={() => toggleExp(k)}>UE {ue.ue_num} — {ue.ue_nom || ''}</span>
                  {ue.num_organisation > 1 && <span className="text-[10px] text-iip-mauve">org. {ue.num_organisation}</span>}
                  <span className="flex-1" />
                  <span className="text-[11px] text-gray-400">{ue.cours.length} cours{coche ? ' · → orga 2' : ''}</span>
                </div>
                {open && (
                  <div className="divide-y divide-gray-50">
                    {ue.cours.map(c => (
                      <div key={c.code_cours} className="flex items-center gap-2 px-3 py-1.5 h-9 pl-10 text-[13px]">
                        <span className="flex-1 text-gray-600 truncate" title={c.nom_cours || c.code_cours}>{c.code_cours} — {c.nom_cours || ''}</span>
                        <SelecteurGroupes valeur={groupes[k]?.[c.code_cours] || 1} onChange={(n) => setNb(k, c.code_cours, n)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
          <button onClick={appliquer} disabled={busy}
            className="bg-iip-mauve hover:opacity-90 disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
            {busy ? 'Application…' : `Appliquer${nbCoches > 0 ? ` (${nbCoches} en orga 2)` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

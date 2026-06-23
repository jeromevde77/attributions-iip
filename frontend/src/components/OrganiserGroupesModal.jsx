import { useState, useMemo } from 'react';
import { api } from '../lib/api.js';
import { IconX, IconUsersGroup, IconUser, IconUsers, IconArrowsSplit } from '@tabler/icons-react';

// ── Détecte le mode actuel d'un cours ────────────────────────────────────────
function modeActuel(cours) {
  const rows = cours.rows || [];
  if (rows.length === 0) return 'ts';
  if (rows.every(r => r.split_groupe === 'O')) return 'split';
  if (rows.some(r => r.code && r.code !== 'Ts' && r.split_groupe !== 'O')) return 'groupes';
  return 'ts';
}

function nbGroupesActuels(cours) {
  const rows = cours.rows || [];
  if (rows.length === 0) return 1;
  const codes = new Set(rows.map(r => r.code || 'Ts'));
  return Math.max(1, codes.size);
}

// ── Badge mode ───────────────────────────────────────────────────────────────
const MODE_CFG = {
  ts:      { label: 'Ts',      desc: 'Tous ensemble',     icon: IconUser,         bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
  split:   { label: 'Split',   desc: 'Partagé (Ts×N)',    icon: IconArrowsSplit,  bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  groupes: { label: 'Groupes', desc: 'Étudiants répartis', icon: IconUsers,       bg: '#fdf4ff', color: '#7e22ce', border: '#d8b4fe' },
};

function ModeBadge({ mode, petit }) {
  const cfg = MODE_CFG[mode] || MODE_CFG.ts;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${petit ? 'text-[10px]' : 'text-xs'} font-medium`}
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      <Icon size={petit ? 10 : 12} />
      {cfg.label}
    </span>
  );
}

// ── Sélecteur de nombre de groupes / splits ──────────────────────────────────
function SelecteurN({ valeur, onChange, min = 1 }) {
  const [libre, setLibre] = useState(false);
  const presets = min === 1 ? [1, 2, 3, 4] : [2, 3, 4];
  return (
    <div className="flex items-center gap-1">
      {presets.map(n => (
        <button key={n} type="button" onClick={() => { onChange(n); setLibre(false); }}
          className={`text-[11px] w-8 h-7 rounded border transition font-medium ${
            valeur === n ? 'bg-iip-turquoise/10 text-iip-blue border-iip-turquoise/50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}>
          {n === 1 ? 'Ts' : n}
        </button>
      ))}
      {libre ? (
        <input type="number" min={min} max={26} autoFocus defaultValue={valeur}
          className="w-12 text-[11px] h-7 px-1.5 border border-iip-turquoise/40 rounded"
          onBlur={e => { const v = parseInt(e.target.value); if (v >= min) onChange(v); setLibre(false); }}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
      ) : (
        <button type="button" onClick={() => setLibre(true)}
          className="text-[11px] w-7 h-7 rounded border border-gray-200 text-gray-400 hover:bg-gray-50">+</button>
      )}
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────────────────────
export default function OrganiserGroupesModal({ portee, section, ues, onClose, onApplied }) {
  const peu = ues.length <= 3;
  const [expanded, setExpanded] = useState(() => new Set(peu ? ues.map(u => `${u.ue_num}/${u.num_organisation||1}`) : []));
  const [creerOrga2, setCreerOrga2] = useState(new Set());
  const [busy, setBusy] = useState(false);

  // État des cours : { ueKey: { code_cours: { mode, nb } } }
  const [etat, setEtat] = useState(() => {
    const init = {};
    for (const ue of ues) {
      const k = `${ue.ue_num}/${ue.num_organisation||1}`;
      init[k] = {};
      for (const c of ue.cours) {
        const mode = modeActuel(c);
        const nb = nbGroupesActuels(c);
        init[k][c.code_cours] = { mode, nb };
      }
    }
    return init;
  });

  const setMode = (k, cc, mode) => setEtat(e => ({ ...e, [k]: { ...e[k], [cc]: { ...e[k][cc], mode, nb: mode === 'ts' ? 1 : (e[k][cc].nb < 2 ? 2 : e[k][cc].nb) } } }));
  const setNb   = (k, cc, nb)   => setEtat(e => ({ ...e, [k]: { ...e[k], [cc]: { ...e[k][cc], nb } } }));
  const keyOf   = ue => `${ue.ue_num}/${ue.num_organisation||1}`;
  const toggle  = k => setExpanded(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleO2 = k => setCreerOrga2(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const blocCouleur = b => { const n = parseInt((b||'').match(/\d+/)?.[0]||'0'); return ['#6b7280','#f97316','#60a5fa','#1e3a8a','#a855f7'][n]||'#6b7280'; };

  async function appliquer() {
    setBusy(true);
    let ok = 0; const errs = [];
    try {
      for (const ue of ues) {
        const k = keyOf(ue);
        const coursPayload = ue.cours.map(c => {
          const e = etat[k]?.[c.code_cours] || { mode: 'ts', nb: 1 };
          // nb_groupes : pour split on passe nb négatif (convention interne) pour signaler le mode
          // En fait l'API attend nb_groupes + on gère split_groupe via l'API
          return {
            code_cours: c.code_cours,
            nb_groupes: e.mode === 'ts' ? 1 : e.nb,
            mode: e.mode, // 'ts' | 'split' | 'groupes'
          };
        });

        // Vérifier s'il y a un changement
        const change = creerOrga2.has(k) || ue.cours.some(c => {
          const e = etat[k]?.[c.code_cours];
          const modeOrig = modeActuel(c);
          const nbOrig   = nbGroupesActuels(c);
          return e && (e.mode !== modeOrig || e.nb !== nbOrig);
        });
        if (!change) continue;

        try {
          await api.organiserGroupesUE(ue.ue_num, {
            section: section || ue.section,
            num_organisation: ue.num_organisation || 1,
            creer_orga_2: creerOrga2.has(k),
            cours: coursPayload,
          });
          ok++;
        } catch(e) { errs.push(`UE ${ue.ue_num} : ${e.message}`); }
      }
      if (errs.length) alert(`${ok} UE traitée(s).\nErreurs :\n${errs.join('\n')}`);
      onApplied(ok);
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <IconUsersGroup size={18} className="text-iip-blue" />
            <span className="font-title text-lg text-iip-blue">
              Organiser les groupes — {portee === 'section' ? `section ${section}` : `UE ${ues[0]?.ue_num}`}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={18} /></button>
        </div>

        {/* Légende des modes */}
        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-4 flex-wrap">
          {Object.entries(MODE_CFG).map(([k, cfg]) => {
            const Icon = cfg.icon;
            return (
              <div key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
                <ModeBadge mode={k} petit />
                <span className="text-gray-400">— {cfg.desc}</span>
              </div>
            );
          })}
          <div className="ml-auto text-xs text-gray-400">
            Cocher une UE = créer une <strong>organisation 2</strong>
          </div>
        </div>

        {/* Corps */}
        <div className="overflow-auto flex-1 px-4 py-3 space-y-3">
          {ues.map(ue => {
            const k = keyOf(ue);
            const open = expanded.has(k);
            const o2 = creerOrga2.has(k);
            return (
              <div key={k} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* En-tête UE */}
                <div className="flex items-center gap-2.5 px-3 py-2 bg-gray-50 cursor-pointer" onClick={() => toggle(k)}>
                  <input type="checkbox" checked={o2} onClick={e => e.stopPropagation()} onChange={() => toggleO2(k)}
                    className="w-4 h-4 accent-iip-turquoise" title="Créer en organisation 2" />
                  <button className="text-gray-400 text-xs">{open ? '▼' : '▶'}</button>
                  {ue.bloc && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: blocCouleur(ue.bloc) }}>{ue.bloc}</span>}
                  <span className="font-semibold text-sm text-iip-blue flex-1">UE {ue.ue_num} — {ue.ue_nom}</span>
                  {ue.num_organisation > 1 && <span className="text-[10px] text-purple-500">org. {ue.num_organisation}</span>}
                  {o2 && <span className="text-[10px] text-iip-turquoise font-medium">→ orga 2</span>}
                  <span className="text-xs text-gray-400">{ue.cours.length} cours</span>
                </div>

                {/* Tableau des cours */}
                {open && (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 border-t border-gray-100">
                        <th className="text-left px-3 py-1.5 text-gray-500 font-medium">Cours</th>
                        <th className="text-center px-2 py-1.5 text-gray-500 font-medium w-24">État actuel</th>
                        <th className="text-center px-2 py-1.5 text-gray-500 font-medium w-32">Nouveau mode</th>
                        <th className="text-center px-2 py-1.5 text-gray-500 font-medium w-40">Nb</th>
                        <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Profs actuels</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {ue.cours.map(c => {
                        const e = etat[k]?.[c.code_cours] || { mode: 'ts', nb: 1 };
                        const modeOrig = modeActuel(c);
                        const changed = e.mode !== modeOrig || (e.mode !== 'ts' && e.nb !== nbGroupesActuels(c));
                        const rows = c.rows || [];

                        return (
                          <tr key={c.code_cours} className={changed ? 'bg-amber-50/50' : ''}>
                            {/* Nom du cours */}
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-800 truncate max-w-[220px]" title={c.nom_cours}>{c.nom_cours || c.code_cours}</div>
                              <div className="text-gray-400 text-[10px]">{c.code_cours}</div>
                            </td>

                            {/* État actuel */}
                            <td className="px-2 py-2 text-center">
                              <ModeBadge mode={modeOrig} petit />
                              {modeOrig !== 'ts' && <div className="text-[10px] text-gray-400 mt-0.5">{nbGroupesActuels(c)} {modeOrig === 'split' ? 'profs' : 'gr.'}</div>}
                            </td>

                            {/* Sélecteur de mode */}
                            <td className="px-2 py-2">
                              <div className="flex gap-1 justify-center">
                                {Object.keys(MODE_CFG).map(m => {
                                  const cfg = MODE_CFG[m];
                                  const Icon = cfg.icon;
                                  return (
                                    <button key={m} type="button" onClick={() => setMode(k, c.code_cours, m)}
                                      title={cfg.desc}
                                      className={`flex items-center gap-0.5 text-[10px] px-1.5 py-1 rounded border transition ${
                                        e.mode === m
                                          ? 'font-bold'
                                          : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                                      }`}
                                      style={e.mode === m ? { background: cfg.bg, color: cfg.color, borderColor: cfg.border } : {}}>
                                      <Icon size={11} />
                                      {cfg.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>

                            {/* Nb groupes/splits */}
                            <td className="px-2 py-2">
                              {e.mode === 'ts'
                                ? <span className="text-gray-400 text-[11px] block text-center">—</span>
                                : <SelecteurN valeur={e.nb} onChange={nb => setNb(k, c.code_cours, nb)} min={2} />
                              }
                            </td>

                            {/* Profs actuels */}
                            <td className="px-2 py-2">
                              <div className="space-y-0.5">
                                {rows.map((r, i) => (
                                  <div key={i} className="flex items-center gap-1 text-[10px]">
                                    {r.code && r.code !== 'Ts' && (
                                      <span className="font-bold text-gray-500 w-4">{r.code}</span>
                                    )}
                                    {r.split_groupe === 'O' && (
                                      <span className="text-blue-400">↔</span>
                                    )}
                                    <span className={r.professeur ? 'text-gray-700' : 'text-gray-300 italic'}>
                                      {(r.prof_nom || r.prof_prenom) ? `${r.prof_prenom||''} ${r.prof_nom||''}`.trim() : 'À désigner'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <div className="text-xs text-amber-600">
            {ues.flatMap(ue => {
              const k = keyOf(ue);
              return ue.cours.filter(c => {
                const e = etat[k]?.[c.code_cours];
                return e && (e.mode !== modeActuel(c) || (e.mode !== 'ts' && e.nb !== nbGroupesActuels(c)));
              });
            }).length > 0 && '⚠ Des modifications sont en attente'}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Annuler</button>
            <button onClick={appliquer} disabled={busy}
              className="bg-iip-blue hover:opacity-90 disabled:opacity-40 text-white text-sm px-5 py-2 rounded-lg font-medium">
              {busy ? 'Application…' : 'Appliquer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

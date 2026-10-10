import { useState } from 'react';
import { api } from '../lib/api.js';
import { IconUsersGroup, IconUser, IconUsers, IconArrowsSplit } from '@tabler/icons-react';
import { informer } from '../lib/dialogue.jsx';
import { Fenetre } from './ui.jsx';

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
  return Math.max(1, new Set(rows.map(r => r.code || 'Ts')).size);
}

const MODE_CFG = {
  ts:      { label: 'Ts',      desc: 'Tous ensemble · 1 prof',    icon: IconUser,        bg: 'var(--c-reussi)', color: '#FFFFFF', border: 'var(--c-reussi)' },
  split:   { label: 'Split',   desc: 'Ts partagé entre N profs',  icon: IconArrowsSplit, bg: 'var(--c-disponible)', color: '#FFFFFF', border: 'var(--c-disponible)' },
  groupes: { label: 'Groupes', desc: 'Étudiants répartis A/B/C',  icon: IconUsers,       bg: 'rgb(var(--e-faveur-100))', color: 'var(--c-texte)', border: 'var(--c-faveur)' },
};

export default function OrganiserGroupesModal({ portee, section, ues, onClose, onApplied }) {
  const peu = ues.length <= 3;
  const [expanded, setExpanded] = useState(() => new Set(peu ? ues.map(u => `${u.ue_num}/${u.num_organisation||1}`) : []));
  const [creerOrga2, setCreerOrga2] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [etat, setEtat] = useState(() => {
    const init = {};
    for (const ue of ues) {
      const k = `${ue.ue_num}/${ue.num_organisation||1}`;
      init[k] = {};
      for (const c of ue.cours) {
        const mode = modeActuel(c);
        init[k][c.code_cours] = { mode, nb: Math.max(2, nbGroupesActuels(c)) };
      }
    }
    return init;
  });

  const keyOf = ue => `${ue.ue_num}/${ue.num_organisation||1}`;
  const toggle = k => setExpanded(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleO2 = k => setCreerOrga2(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const setMode = (k, cc, mode) => setEtat(e => ({ ...e, [k]: { ...e[k], [cc]: { ...e[k][cc], mode } } }));
  const setNb   = (k, cc, nb)   => setEtat(e => ({ ...e, [k]: { ...e[k], [cc]: { ...e[k][cc], nb } } }));
  const blocCouleur = b => { const n = parseInt((b||'').match(/\d+/)?.[0]||'0'); return ['#6b7280','var(--c-attente)','var(--c-disponible)','var(--c-texte)','var(--c-faveur)'][n]||'#6b7280'; };

  const nbChanges = ues.reduce((acc, ue) => {
    const k = keyOf(ue);
    return acc + ue.cours.filter(c => {
      const e = etat[k]?.[c.code_cours];
      return e && (e.mode !== modeActuel(c) || (e.mode !== 'ts' && e.nb !== nbGroupesActuels(c)));
    }).length;
  }, 0);

  async function appliquer() {
    setBusy(true);
    let ok = 0; const errs = [];
    try {
      for (const ue of ues) {
        const k = keyOf(ue);
        const coursPayload = ue.cours.map(c => {
          const e = etat[k]?.[c.code_cours] || { mode: 'ts', nb: 2 };
          return { code_cours: c.code_cours, nb_groupes: e.mode === 'ts' ? 1 : e.nb, mode: e.mode };
        });
        const change = creerOrga2.has(k) || ue.cours.some(c => {
          const e = etat[k]?.[c.code_cours];
          return e && (e.mode !== modeActuel(c) || (e.mode !== 'ts' && e.nb !== nbGroupesActuels(c)));
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
      if (errs.length) await informer(`${ok} UE traitée(s).\nErreurs :\n${errs.join('\n')}`);
      onApplied(ok);
    } finally { setBusy(false); }
  }

  return (
    <Fenetre icone={IconUsersGroup} large="grande" onFermer={onClose}
      titre={`Organiser — ${portee === 'section' ? `section ${section}` : `UE ${ues[0]?.ue_num}`}`}
      pied={<>
        <span className="text-xs text-amber-600">
          {nbChanges > 0 ? `${nbChanges} modification${nbChanges > 1 ? 's' : ''} en attente` : ''}
        </span>
        <button onClick={onClose} className="bouton">Annuler</button>
        <button onClick={appliquer} disabled={busy}
          className="bouton bouton-fort">
          {busy ? 'Application…' : `Appliquer${nbChanges > 0 ? ` (${nbChanges})` : ''}`}
        </button>
      </>}>
        {/* Légende compacte */}
        <div className="-mx-5 -mt-4 mb-3 px-5 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
          {Object.entries(MODE_CFG).map(([k, cfg]) => {
            const Icon = cfg.icon;
            return (
              <span key={k} className="flex items-center gap-1 px-2 py-0.5 rounded-champ border"
                style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
                <Icon size={10} /> {cfg.label} — {cfg.desc}
              </span>
            );
          })}
          <span className="ml-auto text-gray-400">☐ = créer org. 2</span>
        </div>

        {/* Corps */}
        <div className="space-y-2">
          {ues.map(ue => {
            const k = keyOf(ue);
            const open = expanded.has(k);
            const o2 = creerOrga2.has(k);
            return (
              <div key={k} className="border border-gray-200 rounded-lg overflow-hidden">

                {/* En-tête UE — clic pour déplier */}
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer select-none"
                  onClick={() => toggle(k)}>
                  <input type="checkbox" checked={o2}
                    onClick={e => e.stopPropagation()} onChange={() => toggleO2(k)}
                    className="w-3.5 h-3.5 accent-iip-blue flex-shrink-0" title="Créer org. 2" />
                  <span className="text-gray-400 text-xs w-3">{open ? '▾' : '▸'}</span>
                  {ue.bloc && <span className="text-mention font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0"
                    style={{ background: blocCouleur(ue.bloc) }}>{ue.bloc}</span>}
                  <span className="font-semibold text-sm text-iip-blue flex-1 truncate">
                    UE {ue.ue_num} — {ue.ue_nom}
                  </span>
                  {o2 && <span className="text-mention text-iip-turquoise font-medium flex-shrink-0">→ orga 2</span>}
                  <span className="text-xs text-gray-400 flex-shrink-0">{ue.cours.length} cours</span>
                </div>

                {/* Cours */}
                {open && (
                  <div className="divide-y divide-gray-50">
                    {ue.cours.map(c => {
                      const e = etat[k]?.[c.code_cours] || { mode: 'ts', nb: 2 };
                      const modeOrig = modeActuel(c);
                      const changed = e.mode !== modeOrig || (e.mode !== 'ts' && e.nb !== nbGroupesActuels(c));
                      const rows = c.rows || [];

                      return (
                        <div key={c.code_cours}
                          className={`px-3 py-2 ${changed ? 'bg-amber-50/60 border-l-4 border-l-amber-500' : ''}`}>

                          {/* Ligne 1 : nom du cours + mode actuel */}
                          <div className="flex items-start gap-2 mb-1.5">
                            <div className="flex-1 min-w-0">
                              <span className="text-second font-medium text-gray-800 truncate block"
                                title={c.nom_cours}>{c.nom_cours || c.code_cours}</span>
                              <span className="text-mention text-gray-400">{c.code_cours}</span>
                            </div>
                            {/* Badge état actuel */}
                            <span className="text-mention px-1.5 py-0.5 rounded-champ border flex-shrink-0 flex items-center gap-0.5"
                              style={{ background: MODE_CFG[modeOrig].bg, color: MODE_CFG[modeOrig].color, borderColor: MODE_CFG[modeOrig].border }}>
                              {modeOrig !== 'ts' && `×${nbGroupesActuels(c)} `}{MODE_CFG[modeOrig].label}
                            </span>
                          </div>

                          {/* Ligne 2 : sélecteur mode + nb + profs */}
                          <div className="flex items-center gap-2 flex-wrap">

                            {/* Boutons mode */}
                            <div className="flex gap-1">
                              {Object.entries(MODE_CFG).map(([m, cfg]) => {
                                const Icon = cfg.icon;
                                return (
                                  <button key={m} type="button" onClick={() => setMode(k, c.code_cours, m)}
                                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition ${
                                      e.mode === m ? 'font-semibold' : 'border-gray-200 text-gray-400 hover:bg-gray-50'
                                    }`}
                                    style={e.mode === m ? { background: cfg.bg, color: cfg.color, borderColor: cfg.border } : {}}>
                                    <Icon size={11} />{cfg.label}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Nb (seulement si pas Ts) */}
                            {e.mode !== 'ts' && (
                              <div className="flex items-center gap-1">
                                {[2, 3, 4].map(n => (
                                  <button key={n} type="button" onClick={() => setNb(k, c.code_cours, n)}
                                    className={`text-xs w-7 h-6 rounded border transition ${
                                      e.nb === n ? 'bg-iip-turquoise/10 text-iip-blue border-iip-turquoise/50 font-bold' : 'border-gray-200 text-gray-500'
                                    }`}>{n}</button>
                                ))}
                                <input type="number" min={2} max={26} value={e.nb}
                                  onChange={ev => { const v = parseInt(ev.target.value); if (v >= 2 && v <= 26) setNb(k, c.code_cours, v); }}
                                  className="w-10 text-xs h-6 px-1 border border-gray-200 rounded text-center" />
                              </div>
                            )}

                            {/* Profs actuels — inline compact */}
                            {rows.length > 0 && (
                              <div className="flex flex-wrap gap-1 ml-auto">
                                {rows.map((r, i) => (
                                  <span key={i} className="text-mention bg-gray-100 rounded px-1.5 py-0.5 text-gray-600 flex items-center gap-0.5">
                                    {r.code && r.code !== 'Ts' && <b>{r.code}</b>}
                                    {r.split_groupe === 'O' && <span className="text-blue-400">↔</span>}
                                    {(r.prof_nom || r.prof_prenom)
                                      ? `${(r.prof_nom||'').toUpperCase()} ${r.prof_prenom||''}`.trim()
                                      : <i className="text-gray-400">À désigner</i>}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </Fenetre>
  );
}

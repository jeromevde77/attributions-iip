import { useMemo, useState } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { couleurBloc, rangBloc } from '../lib/blocs.js';

/**
 * LA COMPOSITION D'UNE SECTION, EN GRILLE À COCHER (Charles, 30 septembre
 * 2026 : « quand je crée la section, je devrais pouvoir cocher dans la grille
 * des UE les UE qui seront comprises — partagées ou non »).
 *
 * Remplace la double liste étroite d'avant. Les UE de l'année, rangées par
 * section principale puis par bloc — celles de la section en tête —, une case
 * chacune. Une UE dont c'est la section principale en fait partie d'office.
 * Cocher une UE d'une autre section la RATTACHE (ue_section) : elle n'est
 * jamais dupliquée. Le tronc commun et les UE déjà partagées le disent.
 *
 * Composant piloté : la fenêtre de section tient la sélection et l'enregistre
 * avec le reste de la fiche — un seul bouton pour toute la fenêtre.
 */
export default function CompositionSection({ sectionCode, data, choix, onChoix, lecture = false }) {
  const [recherche, setRecherche] = useState('');
  const [seulesCochees, setSeulesCochees] = useState(false);

  const toutes = useMemo(() => (data ? [...data.composition, ...data.disponibles] : []), [data]);
  const principale = u => u.section === sectionCode;
  const coche = u => principale(u) || choix.has(u.ue_num);
  const f = recherche.trim().toLowerCase();
  const visibles = toutes.filter(u => (!f || String(u.ue_num).includes(f) || (u.ue_nom || '').toLowerCase().includes(f))
    && (!seulesCochees || coche(u)));

  // Par section principale (la sienne d'abord), puis par bloc.
  const groupes = useMemo(() => {
    const m = new Map();
    for (const u of visibles) {
      const s = u.section || 'Sans section';
      if (!m.has(s)) m.set(s, new Map());
      const b = String(u.ue_niv || '—').toUpperCase();
      if (!m.get(s).has(b)) m.get(s).set(b, []);
      m.get(s).get(b).push(u);
    }
    return [...m.entries()].sort((a, b) => (a[0] === sectionCode ? -1 : b[0] === sectionCode ? 1 : a[0].localeCompare(b[0], 'fr')))
      .map(([s, blocs]) => ({ section: s, blocs: [...blocs.entries()].sort((x, y) => rangBloc(x[0]) - rangBloc(y[0]) || x[0].localeCompare(y[0])) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibles, sectionCode]);

  const retenues = toutes.filter(coche);
  const ects = retenues.reduce((t, u) => t + (Number(u.ects) || 0), 0);
  const basculer = n => onChoix(s => { const x = new Set(s); x.has(n) ? x.delete(n) : x.add(n); return x; });
  const toutLeGroupe = (lst, oui) => onChoix(s => { const x = new Set(s); lst.filter(u => !principale(u)).forEach(u => (oui ? x.add(u.ue_num) : x.delete(u.ue_num))); return x; });

  if (!data) return <p className="text-[13px] text-slate-400">Chargement des UE…</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="controle controle-icone w-64" placeholder="Numéro ou intitulé…" value={recherche} onChange={e => setRecherche(e.target.value)} />
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-slate-600 cursor-pointer">
          <input type="checkbox" checked={seulesCochees} onChange={e => setSeulesCochees(e.target.checked)} /> seulement les UE comprises
        </label>
        <span className="ml-auto text-[12px] text-slate-600"><b className="text-iip-texte">{retenues.length}</b> UE comprises · <b className="text-iip-texte">{ects}</b> ECTS</span>
      </div>
      {groupes.map(g => {
        const aelle = g.section === sectionCode;
        return (
          <div key={g.section} className="border border-slate-200 rounded-carte overflow-hidden">
            <div className="tab-entete px-3 py-1.5 text-[12px] font-semibold text-slate-700 flex items-center gap-2">
              {aelle ? `${g.section} — ses propres UE, comprises d'office` : `UE de ${g.section}`}
            </div>
            <div className="divide-y divide-slate-100">
              {g.blocs.map(([bloc, lst]) => {
                const tous = lst.every(coche);
                return (
                  <div key={bloc} className="bg-white">
                    <div className="px-3 pt-2 pb-1 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: couleurBloc(bloc) || '#D8DCE4' }} />
                      {bloc}
                      {!aelle && !lecture && (
                        <button type="button" className="ml-1 font-normal underline text-slate-500" onClick={() => toutLeGroupe(lst, !tous)}>
                          {tous ? 'tout décocher' : 'tout cocher'}</button>
                      )}
                    </div>
                    <div className="grid gap-1.5 px-3 pb-2.5 sm:grid-cols-2 xl:grid-cols-3">
                      {lst.map(u => {
                        const c = coche(u);
                        return (
                          <label key={u.ue_num}
                            className={`flex items-start gap-2 rounded-champ border px-2.5 py-1.5 text-[12.5px] ${aelle || lecture ? '' : 'cursor-pointer hover:border-slate-400'}`}
                            style={{ borderColor: c ? 'var(--c-principal)' : '#E4E7EC' }}>
                            <input type="checkbox" className="mt-0.5" checked={c} disabled={aelle || lecture} onChange={() => basculer(u.ue_num)} />
                            <span className="min-w-0 flex-1">
                              <b className="text-iip-texte tabular-nums">{u.ue_num}</b> <span className="text-slate-700">{u.ue_nom}</span>
                              <span className="block text-[11px] text-slate-500">
                                {[u.ects ? `${u.ects} ECTS` : null, u.ue_per_total ? `${u.ue_per_total} pér.` : null].filter(Boolean).join(' · ')}
                                {String(u.ue_tc).toLowerCase() === 'x' && <span className="ml-1.5 font-semibold text-slate-600">tronc commun</span>}
                                {u.autres_sections?.filter(s => s !== g.section).length > 0 && (
                                  <span className="ml-1.5">· aussi en {u.autres_sections.filter(s => s !== g.section).join(', ')}</span>)}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!groupes.length && <p className="text-[13px] text-slate-500">Aucune UE ne correspond.</p>}
    </div>
  );
}

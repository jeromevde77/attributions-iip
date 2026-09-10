import { useEffect, useState } from 'react';
import {
  IconX, IconCheck, IconAlertTriangle, IconClock, IconPrinter, IconSquare,
  IconSquareCheck, IconArrowRight,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LE PASSAGE À L'ANNÉE SUIVANTE, POUR TOUTE UNE SECTION.
 *
 * Fin septembre, tout est tranché et il faut composer le programme de l'année
 * suivante pour une promotion entière. Le faire dossier par dossier occupe une
 * semaine de secrétariat — une semaine pendant laquelle les étudiants ne
 * savent pas à quoi ils sont inscrits.
 *
 * ON NE COMPOSE PAS SUR DES RÉSULTATS PROVISOIRES. Un étudiant dont la seconde
 * session n'est pas close n'est pas admissible : l'inscrire à la suite serait
 * lui promettre une place qu'un refus de septembre lui reprendrait. L'écran
 * sépare donc trois piles — ceux qui sont prêts, ceux qui attendent encore
 * quelque chose (et quoi, unité par unité), et ceux à qui plus rien ne
 * s'ouvre, qui relèvent d'une décision humaine et non d'une inscription.
 *
 * ET RIEN NE S'ÉCRIT SANS QU'ON AIT VU CE QUI SERA ÉCRIT : la simulation est
 * le passage obligé, l'écriture se demande.
 */
export default function PassageAnnee({ annee, onClose, onTermine }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [cible, setCible] = useState(anneeSuivante(annee));
  const [rapport, setRapport] = useState(null);
  const [ecartes, setEcartes] = useState(new Set());   // prêts qu'on ne prend pas
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); })
      .catch(() => {});
  }, []);

  async function recenser(simulation = true, ids = null) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/etudiants/pae-promotion', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ section, annee_source: annee, annee_cible: cible,
          etudiants: ids, simulation }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return null; }
      return j;
    } catch (e) { setErreur(e.message); return null; }
    finally { setEnCours(false); }
  }

  const lancer = async () => {
    const j = await recenser(true);
    if (j) { setRapport(j); setEcartes(new Set()); setFait(null); }
  };

  const ecrire = async () => {
    const retenus = rapport.prets.filter(p => !ecartes.has(p.id)).map(p => p.id);
    if (!retenus.length) return;
    const j = await recenser(false, retenus);
    if (j) { setFait(j); setRapport(j); onTermine?.(); }
  };

  const imprimer = async () => {
    const retenus = rapport.prets.filter(p => !ecartes.has(p.id)).map(p => p.id);
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/etudiants/parcours-lot', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee: cible, etudiants: retenus }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      const w = window.open('', '_blank');
      if (!w) { setErreur('La fenêtre d’impression a été bloquée par le navigateur.'); return; }
      w.document.write(j.html); w.document.close();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const retenus = rapport ? rapport.prets.filter(p => !ecartes.has(p.id)) : [];
  const aCreer = retenus.reduce((n, p) => n + p.ues.length, 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mt-12
                      max-h-[86vh] overflow-hidden flex flex-col">
        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue">
              Passage à l'année suivante
            </h3>
            <p className="text-[12px] text-slate-500">
              Composer le programme de chacun sur ses résultats : les unités réussies
              libèrent la suite, celles qui ne l'ont pas été reviennent au programme.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-end
                        gap-3 flex-wrap">
          <label className="text-[11.5px] text-slate-600">
            <div className="font-semibold mb-0.5">Section</div>
            <select value={section} onChange={e => { setSection(e.target.value); setRapport(null); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px] min-w-[180px]">
              <option value="">— choisir —</option>
              {sections.map(s => (
                <option key={s.code || s} value={s.code || s}>
                  {s.code || s}{s.libelle ? ` — ${s.libelle}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="text-[11.5px] text-slate-600">
            <div className="font-semibold mb-0.5">Résultats de</div>
            <div className="px-2 py-1.5 border border-slate-200 rounded-lg bg-slate-50
                            text-[12.5px] tabular-nums">{annee}</div>
          </div>
          <IconArrowRight size={16} className="text-slate-400 mb-2" />
          <label className="text-[11.5px] text-slate-600">
            <div className="font-semibold mb-0.5">Programme pour</div>
            <input value={cible} onChange={e => { setCible(e.target.value); setRapport(null); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-[12.5px] w-[110px]
                         tabular-nums" />
          </label>
          <button onClick={lancer} disabled={enCours || !section || !cible}
            className="px-3 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white font-semibold
                       disabled:opacity-40">
            {enCours ? 'Calcul…' : 'Voir qui est admissible'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 text-[12.5px]">
          {erreur && (
            <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200
                            text-rose-900">{erreur}</div>
          )}

          {fait && (
            <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-300
                            text-emerald-900">
              <b>{fait.total.inscriptions_creees} inscription(s)</b> créée(s) pour{' '}
              {fait.total.etudiants_ecrits} étudiant(s) en {fait.annee_cible}.
            </div>
          )}

          {!rapport && !erreur && (
            <p className="text-slate-400 italic py-8 text-center">
              Choisissez une section, puis lancez le recensement.
            </p>
          )}

          {rapport && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[['Prêts', rapport.total.prets,
                   'bg-emerald-50 border-emerald-200', 'text-emerald-800', 'text-emerald-700'],
                  ['En attente', rapport.total.attente,
                   'bg-amber-50 border-amber-200', 'text-amber-800', 'text-amber-700'],
                  ['Sans programme', rapport.total.sans_programme,
                   'bg-slate-50 border-slate-200', 'text-slate-800', 'text-slate-600'],
                ].map(([l, n, boite, gros, petit]) => (
                  <div key={l} className={`px-3 py-2 rounded-xl border ${boite}`}>
                    <div className={`text-[19px] font-bold tabular-nums ${gros}`}>{n}</div>
                    <div className={`text-[11px] ${petit}`}>{l}</div>
                  </div>
                ))}
              </div>

              {!!rapport.prets.length && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200
                                  text-[11px] uppercase tracking-wide text-slate-500 font-semibold
                                  flex items-center justify-between">
                    <span>Programmes à créer</span>
                    <span className="normal-case tracking-normal text-slate-400">
                      décochez pour écarter un dossier
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[280px] overflow-y-auto">
                    {rapport.prets.map(p => {
                      const pris = !ecartes.has(p.id);
                      return (
                        <div key={p.id} className="px-3 py-2 flex items-start gap-2">
                          <button onClick={() => setEcartes(s => {
                            const n = new Set(s);
                            n.has(p.id) ? n.delete(p.id) : n.add(p.id);
                            return n;
                          })} className="mt-0.5 text-iip-blue">
                            {pris ? <IconSquareCheck size={16} /> : <IconSquare size={16}
                              className="text-slate-300" />}
                          </button>
                          <div className={`flex-1 min-w-0 ${pris ? '' : 'opacity-40'}`}>
                            <div className="font-semibold text-iip-blue">
                              {p.nom} {p.prenom}
                              {p.niveau && <span className="ml-1.5 text-[10px] font-normal
                                text-slate-500">{p.niveau}</span>}
                            </div>
                            <div className="text-[11px] text-slate-600 mt-0.5">
                              {p.ues.length} unité(s) à inscrire
                              {p.deja > 0 && ` · ${p.deja} déjà inscrite(s)`}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {p.ues.map(u => (
                                <span key={u.ue_num} title={u.ue_nom || ''}
                                  className={`px-1.5 py-px rounded text-[10px] border
                                    ${u.epreuve_integree
                                      ? 'bg-violet-50 border-violet-300 text-violet-800'
                                      : u.reprise
                                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                                        : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                  {u.ue_num}
                                  {u.epreuve_integree && ' · EI'}
                                  {u.reprise && ' · reprise'}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!!rapport.attente.length && (
                <div className="border border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200
                                  text-[11px] uppercase tracking-wide text-amber-800 font-semibold
                                  flex items-center gap-1.5">
                    <IconClock size={13} /> En attente — rien ne leur sera inscrit
                  </div>
                  <div className="divide-y divide-amber-100 max-h-[200px] overflow-y-auto">
                    {rapport.attente.map(a => (
                      <div key={a.id} className="px-3 py-1.5">
                        <div className="font-semibold text-slate-700">{a.nom} {a.prenom}</div>
                        <ul className="text-[11px] text-amber-800 mt-0.5">
                          {a.attentes.map((x, i) => (
                            <li key={i}>
                              {x.ue_num ? `UE ${x.ue_num}${x.ue_nom ? ` — ${x.ue_nom}` : ''} : ` : ''}
                              {x.raison}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!!rapport.sans_programme.length && (
                <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200
                                text-slate-600">
                  <b>{rapport.sans_programme.length} étudiant(s)</b> à qui plus aucune unité
                  ne s'ouvre en {cible} — cursus terminé, ou décision à prendre au cas par
                  cas : {rapport.sans_programme.map(x => `${x.nom} ${x.prenom}`).join(' · ')}
                </div>
              )}
            </>
          )}
        </div>

        {rapport && (
          <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center
                          justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              {retenus.length} dossier(s) retenu(s) · <b>{aCreer}</b> inscription(s) seront
              créées. Une unité déjà inscrite n'est jamais recréée, et rien n'est supprimé.
            </p>
            <div className="flex items-center gap-2">
              <button onClick={imprimer} disabled={enCours || !retenus.length}
                title="Le parcours de chacun : graphe des prérequis, unités acquises, programme"
                className="px-3 py-2 text-[12.5px] rounded-lg border border-slate-300
                           text-slate-600 font-semibold flex items-center gap-1.5
                           disabled:opacity-40">
                <IconPrinter size={14} /> Parcours individuels
              </button>
              <button onClick={ecrire} disabled={enCours || !aCreer}
                className="px-4 py-2 text-[12.5px] rounded-lg bg-emerald-600 text-white
                           font-semibold flex items-center gap-1.5 disabled:opacity-40">
                <IconCheck size={15} /> Créer les {aCreer} inscription(s)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** « 2025-2026 » → « 2026-2027 ». Une proposition, pas une contrainte. */
function anneeSuivante(a) {
  const m = /^(\d{4})-(\d{4})$/.exec(String(a || ''));
  return m ? `${Number(m[1]) + 1}-${Number(m[2]) + 1}` : '';
}

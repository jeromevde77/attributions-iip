import { useEffect, useState } from 'react';
import { nomPropre } from '../lib/nom.js';
import {
  IconCheck, IconAlertTriangle, IconClock, IconPrinter, IconSquare,
  IconSquareCheck, IconArrowRight,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { TuileEtat, OuvrirEditions, Fenetre } from './ui.jsx';
import { ouvrirApercu } from '../lib/apercu.js';

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
  /* L'ANNÉE SE CHOISIT, ELLE NE SE TAPE PAS (Charles, 21 septembre 2026) : les
     années connues, plus l'année suivante calculée — qui peut ne pas être
     encore créée au moment où l'on prépare la rentrée. */
  const [annees, setAnnees] = useState([]);
  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code || a)))
      .catch(() => {});
  }, []);
  const choixAnnees = [...new Set([...annees, anneeSuivante(annee)])].filter(Boolean).sort();
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

  /* Une réponse qui n'est pas du JSON (page d'erreur, coupure) se dit en clair :
     Safari n'en rendait que « The string did not match the expected pattern ». */
  async function lireJson(rep) {
    const texte = await rep.text();
    try { return JSON.parse(texte); }
    catch { return { error: `Le serveur a répondu autre chose que prévu (code ${rep.status}). Réessayez ; si cela se répète, signalez-le avec l'heure.` }; }
  }

  async function recenser(simulation = true, ids = null) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/etudiants/pae-promotion', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ section, annee_source: annee, annee_cible: cible,
          etudiants: ids, simulation }),
      });
      const j = await lireJson(rep);
      if (!rep.ok || j.error) { setErreur(j.error); return null; }
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
      const j = await lireJson(rep);
      if (!rep.ok || !j.html) {
        setErreur([j.error || 'Aucun parcours produit.', ...(j.manques || []).slice(0, 5).map(m => `${m.nom} : ${m.raison}`)].join(' · '));
        return;
      }
      if (j.manques?.length) setErreur(`${j.manques.length} parcours non produit(s) : `
        + j.manques.slice(0, 5).map(m => `${m.nom} (${m.raison})`).join(', ') + (j.manques.length > 5 ? '…' : ''));
      ouvrirApercu({
        html: j.html, titre: 'Parcours des étudiants', sousTitre: cible,
        nomFichier: `Parcours_${cible}`, envoiPossible: false, astuceImpression: 'A4 portrait',
      });
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const retenus = rapport ? rapport.prets.filter(p => !ecartes.has(p.id)) : [];
  const aCreer = retenus.reduce((n, p) => n + p.ues.length, 0);

  return (
    <Fenetre titre="Passage à l'année suivante" large="grande" onFermer={onClose}
      sous="Composer le programme de chacun sur ses résultats : les unités réussies libèrent la suite, celles qui ne l'ont pas été reviennent au programme."
      pied={rapport && (<>
        <span className="text-xs text-slate-500">
          {retenus.length} dossier(s) retenu(s) · <b>{aCreer}</b> inscription(s) seront
          créées. Une unité déjà inscrite n'est jamais recréée, et rien n'est supprimé.
        </span>
        <OuvrirEditions disabled={enCours || !retenus.length} titre="Parcours individuels — centre d'édition"
          pieces={[{ cle: 'parcours', label: 'Parcours individuels', description: 'Graphe des prérequis, unités acquises, programme — un par dossier retenu', onClick: () => imprimer() }]} />
        <button onClick={ecrire} disabled={enCours || !aCreer}
          className="bouton bouton-fort inline-flex items-center gap-1.5">
          <IconCheck size={15} /> Créer les {aCreer} inscription(s)
        </button>
      </>)}>
        {/* Les réglages collent au haut de la zone qui défile. */}
        <div className="sticky -top-4 z-10 bg-white -mx-5 -mt-4 mb-3">
        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-end
                        gap-3 flex-wrap">
          <label className="text-second text-slate-600">
            <div className="font-semibold mb-0.5">Section</div>
            <select value={section} onChange={e => { setSection(e.target.value); setRapport(null); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm min-w-[180px]">
              <option value="">— choisir —</option>
              {sections.map(s => (
                <option key={s.code || s} value={s.code || s}>
                  {s.code || s}{s.libelle ? ` — ${s.libelle}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="text-second text-slate-600">
            <div className="font-semibold mb-0.5">Résultats de</div>
            <div className="px-2 py-1.5 border border-slate-200 rounded-lg bg-slate-50
                            text-sm tabular-nums">{annee}</div>
          </div>
          <IconArrowRight size={16} className="text-slate-400 mb-2" />
          <label className="text-second text-slate-600">
            <div className="font-semibold mb-0.5">Programme pour</div>
            <select value={cible} onChange={e => { setCible(e.target.value); setRapport(null); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm tabular-nums">
              {choixAnnees.map(a => (
                <option key={a} value={a}>{a}{annees.includes(a) ? '' : ' (pas encore créée)'}</option>
              ))}
            </select>
          </label>
          <button onClick={lancer} disabled={enCours || !section || !cible}
            className="px-3 py-2 text-sm rounded-lg bg-iip-blue text-white font-semibold
                       disabled:opacity-40">
            {enCours ? 'Calcul…' : 'Voir qui est admissible'}
          </button>
        </div>
        </div>

        <div className="space-y-4 text-sm">
          {erreur && (
            <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>
          )}

          {fait && (
            <div data-etat="reussi" className="bloc-etat px-3 py-2">
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
                <TuileEtat etat="reussi" valeur={rapport.total.prets} libelle="Prêts" />
                <TuileEtat etat="surveiller" valeur={rapport.total.attente} libelle="En attente" />
                <TuileEtat etat="neutre" valeur={rapport.total.sans_programme} libelle="Sans programme" />
              </div>

              {!!rapport.prets.length && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200
                                  text-xs uppercase tracking-wide text-slate-500 font-semibold
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
                              {nomPropre(p.nom, p.prenom)}
                              {p.niveau && <span className="ml-1.5 text-mention font-normal
                                text-slate-500">{p.niveau}</span>}
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5">
                              {p.ues.length} unité(s) à inscrire
                              {p.deja > 0 && ` · ${p.deja} déjà inscrite(s)`}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {p.ues.map(u => (
                                <span key={u.ue_num} title={u.ue_nom || ''}
                                  className={`px-1.5 py-px rounded text-mention border
                                    ${u.epreuve_integree
                                      ? 'bg-violet-500 border-violet-500 text-white'
                                      : u.reprise
                                        ? 'bg-amber-500 border-amber-500 text-white'
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
                                  text-xs uppercase tracking-wide text-amber-800 font-semibold
                                  flex items-center gap-1.5">
                    <IconClock size={13} /> En attente — rien ne leur sera inscrit
                  </div>
                  <div className="divide-y divide-amber-100 max-h-[200px] overflow-y-auto">
                    {rapport.attente.map(a => (
                      <div key={a.id} className="px-3 py-1.5">
                        <div className="font-semibold text-slate-700">{nomPropre(a.nom, a.prenom)}</div>
                        <ul className="text-xs text-amber-800 mt-0.5">
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
    </Fenetre>
  );
}

/** « 2025-2026 » → « 2026-2027 ». Une proposition, pas une contrainte. */
function anneeSuivante(a) {
  const m = /^(\d{4})-(\d{4})$/.exec(String(a || ''));
  return m ? `${Number(m[1]) + 1}-${Number(m[2]) + 1}` : '';
}

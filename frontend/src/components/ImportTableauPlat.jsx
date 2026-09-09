import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { IconX, IconAlertTriangle, IconUpload } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { CHAMPS, reconnaitreColonnes, construireUnites, construirePlanning, estPlanning }
  from '../lib/lireTableauPlat.js';

/**
 * REPRENDRE UNE ANNÉE DEPUIS UN TABLEAU PLAT.
 *
 * Le classeur de suivi est une feuille par unité ; une reprise d'historique
 * arrive autrement — un tableau unique, une ligne par étudiant, unité et
 * session, où chaque ligne porte aussi les dates du jury qui l'a décidée.
 *
 * L'écran fait trois choses, dans cet ordre : il RECONNAÎT les colonnes et
 * laisse corriger ce qu'il a mal compris ; il MONTRE ce qu'il a compris,
 * unité par unité, sans rien écrire ; il ÉCRIT, et seulement alors.
 *
 * Les dates viennent du fichier — on ne retape pas ce qu'on a déjà.
 */
/** Ce qui manque pour écrire, selon le document qu'on croit tenir. */
function manquantsDe(colonnes, type) {
  const requis = type === 'planning'
    ? ['ue_num', 'session', 'date_seance']
    : CHAMPS.filter(c => c.requis).map(c => c.cle);
  return requis.filter(k => colonnes[k] == null)
    .map(k => CHAMPS.find(x => x.cle === k)?.libelle || k);
}

export default function ImportTableauPlat({ annee, onClose, onFini }) {
  const [lignes, setLignes] = useState(null);      // [[cellules]] — en-têtes en 0
  const [colonnes, setColonnes] = useState({});
  const [manquants, setManquants] = useState([]);
  // LE TYPE DE DOCUMENT EST UN ÉTAT, PAS UNE DÉDUCTION PERMANENTE.
  //
  // Il se devinait à chaque frappe : désigner une colonne « Nom » sur un
  // planning le faisait basculer en tableau de décisions, sans un mot, et
  // l'écran réclamait alors un prénom et une décision que le planning n'a
  // pas. On le détecte une fois, à l'ouverture, et on l'affiche — il se
  // change à la main, jamais tout seul.
  const [type, setType] = useState('decisions');   // 'decisions' | 'planning'
  const [nomFichier, setNomFichier] = useState('');
  const [choisies, setChoisies] = useState(new Set());
  const [clore, setClore] = useState(false);
  const [justifDefaut, setJustifDefaut] = useState('');
  const [creer, setCreer] = useState(true);
  const [rapport, setRapport] = useState(null);
  const [applique, setApplique] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function lire(f) {
    if (!f) return;
    setErreur(null); setRapport(null); setApplique(false);
    try {
      // Le CSV du secrétariat est en point-virgule et en UTF-8 avec BOM : XLSX
      // le lit comme une feuille, à condition qu'on ne lui impose rien.
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false });
      const fe = wb.Sheets[wb.SheetNames[0]];
      const tab = XLSX.utils.sheet_to_json(fe, { header: 1, raw: true, defval: null });
      const utiles = tab.filter(l => (l || []).some(c => c != null && String(c).trim() !== ''));
      if (utiles.length < 2) throw new Error('Le fichier ne contient aucune ligne de données.');
      const { colonnes: c } = reconnaitreColonnes(utiles[0]);
      // Le planning n'a ni nom ni prénom : ce ne sont donc pas des colonnes
      // manquantes, c'est un autre document. Les exiger le rendrait illisible.
      const t = estPlanning(c) ? 'planning' : 'decisions';
      setLignes(utiles); setColonnes(c); setNomFichier(f.name);
      setType(t); setManquants(manquantsDe(c, t)); setChoisies(new Set());
    } catch (e) { setErreur(e.message); }
  }

  const planning = type === 'planning';
  const { unites, rejets } = useMemo(
    () => (lignes && !manquants.length
      ? (planning ? construirePlanning(lignes, colonnes) : construireUnites(lignes, colonnes))
      : { unites: [], rejets: [] }),
    [lignes, colonnes, manquants, planning]);

  // Tout est coché d'emblée — on vient reprendre une année, pas trier.
  useMemo(() => {
    if (unites.length && !choisies.size) setChoisies(new Set(unites.map(u => u.ue_num)));
    /* eslint-disable-next-line */
  }, [unites.length]);

  async function envoyer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/import-suivi', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, simulation, migration: true,
          // Le tableau ne porte ni pondérations ni notes d'acquis : il ne
          // porte que des décisions. Demander le reste ferait effacer.
          // Un PLANNING ne porte même pas de décision : il ne pose que des
          // séances, et ne doit toucher à aucun résultat.
          ponderations: false, notes: false, decisions: !planning,
          creer: planning ? false : creer, inscrire: planning ? false : creer,
          justification_defaut: justifDefaut.trim(),
          unites: unites.filter(u => choisies.has(u.ue_num)).map(u => ({
            ue_num: u.ue_num, etudiants: u.etudiants,
            seance: { ...u.seance, cloturer: clore },
          })),
        }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setRapport(j);
      if (!simulation) { setApplique(true); onFini?.(); }
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const entetes = lignes?.[0] || [];
  const total = unites.filter(u => choisies.has(u.ue_num))
    .reduce((n, u) => n + u.resume.s1 + u.resume.s2, 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-3 overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1040px] my-4
                      max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200
                        flex-shrink-0">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue">
              Reprise d'historique{planning ? ' — planning des séances' : ' — tableau de délibérations'}
            </h3>
            <p className="text-[12px] text-slate-500">
              {planning
                ? <>Une ligne par unité et session : dates de délibération, créneaux et
                    locaux de visite des copies. <b>Aucun résultat n'est touché.</b></>
                : <>Une ligne par étudiant, unité et session. Les décisions, les cotes et
                    les dates du jury sont reprises <b>telles quelles</b> : aucun recalcul.</>}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12.5px] text-red-800 flex items-start gap-2">
              <IconAlertTriangle size={15} className="mt-px shrink-0" /> {erreur}
            </div>
          )}

          {!lignes ? (
            <label className="block border-2 border-dashed border-slate-300 rounded-xl
                              px-6 py-10 text-center cursor-pointer hover:border-iip-blue">
              <IconUpload size={22} className="mx-auto text-slate-400" />
              <div className="mt-2 text-[13px] font-semibold text-iip-blue">
                Choisir le fichier de reprise
              </div>
              <div className="text-[11.5px] text-slate-500">
                .xlsx ou .csv — le tableau des décisions, ou le planning des séances
              </div>
              <input type="file" accept=".xlsx,.xlsm,.csv" className="hidden"
                onChange={e => lire(e.target.files?.[0])} />
            </label>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] text-slate-500">
                  <b className="text-slate-700">{nomFichier}</b> · {lignes.length - 1} ligne(s)
                </span>
                <span className="flex-1" />
                <span className="text-[12px] text-slate-500">Ce fichier est :</span>
                <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                  {[['decisions', 'un tableau de décisions'],
                    ['planning', 'un planning de séances']].map(([v, lib]) => (
                    <button key={v}
                      onClick={() => { setType(v); setManquants(manquantsDe(colonnes, v)); }}
                      className={`px-2.5 py-1 text-[12px] ${type === v
                        ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>
                      {lib}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── CE QUE LUCIE A COMPRIS DES COLONNES ──────────────────── */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200
                                text-[12.5px] font-semibold text-iip-blue">
                  Les colonnes du fichier
                </div>
                <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {CHAMPS.filter(c => !planning
                    || !['nom', 'prenom', 'decision', 'note', 'justification', 'matricule']
                      .includes(c.cle)).map(c => (
                    <label key={c.cle} className="text-[11px] text-slate-600">
                      {c.libelle}
                      {manquantsDe({}, type).includes(c.libelle)
                        && <span className="text-red-600"> *</span>}
                      <select value={colonnes[c.cle] ?? ''}
                        onChange={e => {
                          const v = e.target.value === '' ? null : Number(e.target.value);
                          const suite = { ...colonnes };
                          if (v == null) delete suite[c.cle]; else suite[c.cle] = v;
                          setColonnes(suite);
                          setManquants(manquantsDe(suite, type));
                        }}
                        className={`block mt-0.5 w-full px-2 py-1 border rounded-lg text-[12px]
                          ${manquants.includes(c.libelle)
                            ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}>
                        <option value="">— aucune —</option>
                        {entetes.map((h, i) => (
                          <option key={i} value={i}>{String(h ?? `colonne ${i + 1}`)}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {!!manquants.length && (
                  <div className="px-3 py-2 bg-red-50 border-t border-red-200
                                  text-[11.5px] text-red-800">
                    Colonnes indispensables non reconnues : <b>{manquants.join(', ')}</b>.
                    Désignez-les ci-dessus.{type === 'decisions'
                      ? ' Sans elles, une ligne ne peut pas être rattachée à un étudiant '
                        + 'ni à une décision — et s’il s’agit en réalité du planning des '
                        + 'séances, dites-le ci-dessus : il n’a pas d’étudiants.'
                      : ' Un planning a besoin de l’unité, de la session et de la date.'}
                  </div>
                )}
              </div>

              {!manquants.length && (
                <>
                  {/* ── LES UNITÉS LUES ──────────────────────────────────── */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-200
                                    flex items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-iip-blue">
                        {unites.length} unité(s) lue(s)
                      </span>
                      <span className="flex-1" />
                      <button onClick={() => setChoisies(choisies.size === unites.length
                        ? new Set() : new Set(unites.map(u => u.ue_num)))}
                        className="text-[11.5px] text-iip-blue underline">
                        {choisies.size === unites.length ? 'tout décocher' : 'tout cocher'}
                      </button>
                    </div>
                    <div className="max-h-[30vh] overflow-y-auto divide-y divide-slate-100">
                      {unites.map(u => (
                        <label key={u.ue_num}
                          className="px-3 py-1.5 flex items-center gap-2 text-[12.5px]
                                     cursor-pointer hover:bg-slate-50">
                          <input type="checkbox" checked={choisies.has(u.ue_num)}
                            onChange={() => setChoisies(s => {
                              const t = new Set(s);
                              if (t.has(u.ue_num)) t.delete(u.ue_num); else t.add(u.ue_num);
                              return t;
                            })} />
                          <span className="w-16 tabular-nums text-slate-500">UE {u.ue_num}</span>
                          <span className="flex-1 text-slate-700">
                            {planning
                              ? `${u.resume.seances} séance(s) : ${Object.keys(u.seance)
                                  .map(k => k.toUpperCase()).join(', ')}`
                              : `${u.resume.etudiants} étudiant(s) · ${u.resume.s1} en 1re · `
                                + `${u.resume.s2} en 2e`}
                          </span>
                          <span className="text-[11.5px] text-slate-500 w-24 text-right">
                            {u.resume.cotes} cote(s)
                          </span>
                          <span className="text-[11.5px] text-slate-500 w-24 text-right">
                            {u.resume.motifs} motif(s)
                          </span>
                          {/* La date de séance est la pièce qui rend les documents
                              utilisables : son absence se voit d'ici. */}
                          <span className={`text-[11.5px] w-28 text-right ${u.resume.date_s1
                            ? 'text-emerald-700' : 'text-amber-700 font-semibold'}`}>
                            {u.resume.date_s1 || 'sans date'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {!!rejets.length && (
                    <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200
                                    text-[11.5px] text-amber-900">
                      <b>{rejets.length} ligne(s) écartée(s)</b> — une décision qu'on ne sait
                      pas lire n'est pas rangée dans la catégorie la plus fréquente :
                      <div className="mt-1 max-h-24 overflow-y-auto">
                        {rejets.slice(0, 12).map((x, i) => (
                          <div key={i}>
                            ligne {x.ligne} · UE {x.ue_num} · {x.etudiant} — {x.motif}
                          </div>
                        ))}
                        {rejets.length > 12 && <div>… et {rejets.length - 12} autres.</div>}
                      </div>
                    </div>
                  )}

                  {/* ── CE QUI S'ÉCRIT ───────────────────────────────────── */}
                  <div className="space-y-2 px-1">
                    {!planning && (
                      <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
                        <input type="checkbox" checked={creer} className="w-4 h-4 accent-iip-blue"
                          onChange={e => setCreer(e.target.checked)} />
                        Créer les étudiants inconnus et les inscrire aux unités
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-[12.5px] text-slate-700">
                      <input type="checkbox" checked={clore} className="w-4 h-4 accent-iip-blue"
                        onChange={e => setClore(e.target.checked)} />
                      Clôturer les séances — elles ont réellement été tenues
                    </label>
                    {!planning && (
                    <label className="block text-[11.5px] text-slate-700">
                      Justification imposée là où le fichier n'en porte aucune
                      <textarea value={justifDefaut} onChange={e => setJustifDefaut(e.target.value)}
                        rows={2}
                        placeholder="ex. Décision du jury ; motivation non consignée — reprise d'historique."
                        className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded-lg
                                   text-[12px]" />
                    </label>)}
                    {!planning && (
                    <p className="text-[11px] text-slate-500">
                      Elle est marquée « imposée » et ne se confond pas avec une motivation
                      prise en séance. Laissez vide pour n'en imposer aucune : le rapport
                      comptera les décisions défavorables restées sans motif.
                    </p>)}
                  </div>

                  {rapport && (
                    <div className={`rounded-xl border p-3 ${applique
                      ? 'border-emerald-200 bg-emerald-50' : 'border-sky-200 bg-sky-50'}`}>
                      <div className="text-[12.5px] font-semibold mb-2 text-slate-800">
                        {applique ? 'Import appliqué' : 'Simulation — rien n’a été écrit'}
                      </div>
                      {/* POURQUOI UNE UNITÉ N'A RIEN REÇU. Le serveur le dit,
                          unité par unité — « inconnue en 2025-2026 », « hors de
                          votre périmètre » — et l'écran ne le montrait pas : on
                          lisait « 0 séance » sans savoir si le fichier était
                          mauvais, l'année mal choisie, ou l'unité absente. Un
                          import qui ne dit pas pourquoi il n'a rien fait est un
                          import qu'on refait au hasard. */}
                      {!!(rapport.unites || []).filter(u => u.ignoree).length && (
                        <div className="mb-2 px-3 py-2 rounded-lg bg-red-50 border
                                        border-red-200 text-[11.5px] text-red-800">
                          <b>{rapport.unites.filter(u => u.ignoree).length} unité(s) écartée(s)
                          — rien ne leur a été écrit :</b>
                          <div className="mt-1 max-h-28 overflow-y-auto">
                            {rapport.unites.filter(u => u.ignoree).map(u => (
                              <div key={u.ue_num}>UE {u.ue_num} — {u.ignoree}</div>
                            ))}
                          </div>
                          {rapport.unites.some(u => /inconnue en/.test(u.ignoree || '')) && (
                            <div className="mt-1.5 pt-1.5 border-t border-red-200">
                              « Inconnue en … » veut dire que l'unité n'existe pas dans
                              l'année affichée en haut de Lucie. Vérifiez le sélecteur
                              d'année : un planning de 2025-2026 importé en 2026-2027
                              ne trouve rien.
                            </div>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        {[['décisions', rapport.total.decisions],
                          ['cotes', rapport.total.cotes || 0],
                          ['motifs repris', rapport.total.motifs || 0],
                          ['motifs imposés', rapport.total.motifs_imposes || 0],
                          ['sans motif', rapport.total.sans_motif || 0],
                          ['séances', rapport.total.seances || 0],
                          ['dossiers créés', rapport.total.crees || 0],
                          ['non rapprochés', rapport.total.inconnus
                            + rapport.total.hors_inscription + rapport.total.collisions],
                        ].map(([l, n]) => (
                          <div key={l} className="bg-white/70 rounded-lg px-2 py-1.5">
                            <div className="text-[17px] font-bold tabular-nums text-iip-blue">{n}</div>
                            <div className="text-[10.5px] text-slate-600">{l}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center
                        justify-between gap-3 flex-shrink-0">
          <span className="text-[12px] text-slate-500">
            {lignes && !manquants.length
              ? (planning ? `${choisies.size} unité(s) · séances seules`
                : `${choisies.size} unité(s) · ${total} décision(s)`) : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300
                         text-slate-600">Fermer</button>
            <button disabled={enCours || !choisies.size || !!manquants.length}
              onClick={() => envoyer(true)}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-sky-400
                         text-sky-800 font-semibold disabled:opacity-40">
              Simuler
            </button>
            <button disabled={enCours || !choisies.size || !!manquants.length || !rapport}
              onClick={() => envoyer(false)}
              title={!rapport ? 'Simulez d’abord : c’est une écriture de masse' : undefined}
              className="px-4 py-2 text-[13px] rounded-lg bg-iip-blue text-white
                         font-semibold disabled:opacity-40">
              Appliquer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

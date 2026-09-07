import { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  IconX, IconUpload, IconAlertTriangle, IconCheck, IconFileSpreadsheet,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { lireClasseur, GEOMETRIE } from '../lib/suiviClasseur.js';

/**
 * L'IMPORT DU CLASSEUR DE SUIVI.
 *
 * On ouvre le classeur de l'année, on regarde ce que Lucie s'apprête à écrire,
 * et on écrit. Une seule opération là où il fallait seize copier-coller.
 *
 * TOUJOURS EN DEUX TEMPS. Le premier passage ne touche à rien : il dit combien
 * d'étudiants sont reconnus, lesquels ne le sont pas, et ce que cela
 * représente de notes et de décisions. Le second exécute. Personne ne lance
 * l'écriture de plusieurs milliers de notes sans avoir vu la première liste.
 */
export default function ImportSuivi({ annee, onClose, onFini }) {
  const [fichier, setFichier] = useState(null);
  const [unites, setUnites] = useState(null);
  const [choisies, setChoisies] = useState(new Set());
  const [quoi, setQuoi] = useState({ ponderations: true, notes: true, decisions: true });
  const [rapport, setRapport] = useState(null);
  const [applique, setApplique] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function ouvrir(f) {
    setErreur(null); setRapport(null); setApplique(false); setUnites(null);
    if (!f) return;
    setFichier(f); setEnCours(true);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const feuilles = wb.SheetNames.map(nom => ({
        nom,
        cell: (L, r) => { const c = wb.Sheets[nom][`${L}${r}`]; return c ? c.v : null; },
      }));
      const lues = lireClasseur(feuilles);
      if (!lues.length) {
        throw new Error("Aucune feuille d'unité dans ce classeur. "
          + 'Les feuilles d\'unité portent le numéro de l\'unité pour nom — « 251 », « 263 ».');
      }
      setUnites(lues);
      setChoisies(new Set(lues.filter(u => u.resume.etudiants).map(u => u.ue_num)));
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function envoyer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/import-suivi', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, simulation, ...quoi,
          unites: unites.filter(u => choisies.has(u.ue_num)),
        }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setRapport(j);
      if (!simulation) { setApplique(true); onFini?.(); }
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const total = unites
    ? unites.filter(u => choisies.has(u.ue_num))
        .reduce((s, u) => s + u.resume.etudiants, 0)
    : 0;

  // Ce qui mérite d'être lu avant d'écrire : rien de ce qui va bien.
  const soucis = rapport
    ? rapport.unites.flatMap(u => [
      ...u.collisions.map(t => ({ ue: u.ue_num, gravite: 'haute', t })),
      ...u.inconnus.map(t => ({ ue: u.ue_num, gravite: 'moyenne', t: `${t} — inconnu de Lucie` })),
      ...u.hors_inscription.map(t => ({ ue: u.ue_num, gravite: 'moyenne',
        t: `${t} — pas inscrit à cette unité en ${annee}` })),
    ])
    : [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-6
                      max-h-[92vh] overflow-hidden flex flex-col">

        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue flex items-center gap-2">
              <IconFileSpreadsheet size={17} className="text-iip-gold" />
              Importer le classeur de suivi
            </h3>
            <p className="text-[12px] text-slate-500">
              Pondérations, notes des deux sessions et décisions du jury · {annee}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12.5px] text-red-900 flex items-start gap-1.5">
              <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
            </div>
          )}

          {/* ── Le fichier ────────────────────────────────────────────── */}
          <label className="block border-2 border-dashed border-slate-300 rounded-xl
                            px-4 py-6 text-center cursor-pointer hover:border-iip-blue/50">
            <input type="file" accept=".xlsm,.xlsx" className="hidden"
              onChange={e => ouvrir(e.target.files?.[0])} />
            <IconUpload size={22} className="mx-auto text-slate-400 mb-1.5" />
            <span className="block text-[13px] font-semibold text-slate-700">
              {fichier ? fichier.name : 'Choisir le classeur de suivi'}
            </span>
            <span className="block text-[11.5px] text-slate-500 mt-0.5">
              Suivi_etudiants_&lt;section&gt;_&lt;année&gt;.xlsm — une feuille par unité
            </span>
          </label>

          {/* ── Ce que le classeur contient ───────────────────────────── */}
          {unites && (
            <>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-1.5 text-[11px] font-semibold
                                text-slate-600 flex items-center justify-between">
                  <span>{unites.length} unité(s) dans le classeur</span>
                  <button
                    onClick={() => setChoisies(c => c.size === unites.length
                      ? new Set() : new Set(unites.map(u => u.ue_num)))}
                    className="text-iip-blue font-semibold">
                    {choisies.size === unites.length ? 'tout décocher' : 'tout cocher'}
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
                  {unites.map(u => (
                    <label key={u.ue_num}
                      className="flex items-center gap-3 px-3 py-1.5 cursor-pointer
                                 hover:bg-slate-50">
                      <input type="checkbox" checked={choisies.has(u.ue_num)}
                        onChange={() => setChoisies(s => {
                          const t = new Set(s);
                          if (t.has(u.ue_num)) t.delete(u.ue_num); else t.add(u.ue_num);
                          return t;
                        })}
                        className="w-4 h-4 accent-iip-blue flex-none" />
                      <span className="text-[12.5px] font-semibold text-slate-800 w-14">
                        UE {u.ue_num}
                      </span>
                      <span className="flex-1 text-[11.5px] text-slate-500 tabular-nums">
                        {u.resume.cours} cours · {u.resume.acquis_declares} acquis ·{' '}
                        {u.resume.etudiants} étudiants ·{' '}
                        {u.resume.decides_s1} décidés en S1, {u.resume.decides_s2} en S2
                        {!!u.acquis_hors_referentiel?.length && (
                          <span className="text-amber-700">
                            {' '}· {u.acquis_hors_referentiel.join(', ')} pondéré(s) mais absent(s)
                            de l'onglet AA
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 px-1">
                {[['ponderations', 'Pondérations'], ['notes', 'Notes'],
                  ['decisions', 'Décisions du jury']].map(([k, l]) => (
                  <label key={k} className="flex items-center gap-1.5 text-[12.5px] text-slate-700">
                    <input type="checkbox" checked={quoi[k]}
                      onChange={e => setQuoi(q => ({ ...q, [k]: e.target.checked }))}
                      className="w-4 h-4 accent-iip-blue" />
                    {l}
                  </label>
                ))}
              </div>
              <p className="text-[11.5px] text-slate-500 px-1">
                Les notes du classeur sont exprimées dans l'échelle du poids de chaque acquis ;
                elles sont ramenées sur 20. La décision du Conseil est reprise telle quelle —
                rien n'est redélibéré. La seconde session n'est lue que pour les étudiants qui
                l'ont présentée.
              </p>
            </>
          )}

          {/* ── Le rapport ────────────────────────────────────────────── */}
          {rapport && (
            <div className={`rounded-xl border p-3 space-y-2
              ${applique ? 'bg-emerald-50 border-emerald-200' : 'bg-sky-50 border-sky-200'}`}>
              <div className="text-[12.5px] font-semibold flex items-center gap-1.5
                              text-slate-800">
                {applique ? <IconCheck size={15} className="text-emerald-700" /> : null}
                {applique ? 'Import effectué' : 'Simulation — rien n\'a été écrit'}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                {[['unités', rapport.total.unites], ['étudiants', rapport.total.rapproches],
                  ['notes 1re session', rapport.total.notes_s1],
                  ['notes 2e session', rapport.total.notes_s2],
                  ['décisions', rapport.total.decisions],
                  ['cours à représenter', rapport.total.ajournements],
                  ['acquis', rapport.total.acquis],
                  ['non rapprochés', rapport.total.inconnus + rapport.total.hors_inscription
                    + rapport.total.collisions]].map(([l, n]) => (
                  <div key={l} className="bg-white/70 rounded-lg px-2 py-1.5">
                    <div className="text-[17px] font-bold tabular-nums text-iip-blue">{n}</div>
                    <div className="text-[10.5px] text-slate-600">{l}</div>
                  </div>
                ))}
              </div>

              {!!soucis.length && (
                <div className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                  <div className="px-2.5 py-1.5 bg-amber-50 text-[11px] font-semibold
                                  text-amber-900">
                    {soucis.length} ligne(s) qui ne seront pas importées
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-50">
                    {soucis.slice(0, 60).map((s, i) => (
                      <div key={i} className="px-2.5 py-1 text-[11.5px] flex gap-2">
                        <span className="text-slate-400 w-12 flex-none">UE {s.ue}</span>
                        <span className={s.gravite === 'haute'
                          ? 'text-red-800 font-semibold' : 'text-slate-700'}>{s.t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rapport.unites.some(u => u.ignoree) && (
                <p className="text-[11.5px] text-amber-900">
                  Unités écartées :{' '}
                  {rapport.unites.filter(u => u.ignoree)
                    .map(u => `${u.ue_num} (${u.ignoree})`).join(' · ')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center
                        justify-between gap-2">
          <span className="text-[11.5px] text-slate-500">
            {unites ? `${choisies.size} unité(s) · ${total} lignes` : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
              {applique ? 'Fermer' : 'Annuler'}
            </button>
            <button onClick={() => envoyer(true)}
              disabled={!unites || !choisies.size || enCours}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-iip-blue
                         text-iip-blue font-semibold disabled:opacity-40">
              Simuler
            </button>
            <button onClick={() => envoyer(false)}
              disabled={!rapport || applique || enCours}
              title={!rapport ? 'Simuler d\'abord' : ''}
              className="px-4 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white
                         font-semibold disabled:opacity-40">
              Importer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { GEOMETRIE };

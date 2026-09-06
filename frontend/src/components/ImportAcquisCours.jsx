import { useState } from 'react';
import { IconX, IconFileSpreadsheet, IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * IMPORTER LES ACQUIS D'UN COURS DEPUIS UN CLASSEUR.
 *
 * Les acquis se saisissaient un à un, puis se reliaient à la flèche. Ils
 * existent pourtant déjà dans un tableur — le dossier pédagogique en vient.
 *
 * Trois colonnes suffisent, et l'on dit laquelle est laquelle, comme pour
 * l'importateur sur mesure : le CODE de l'acquis, son INTITULÉ, son POIDS dans
 * ce cours. L'écran propose une correspondance de départ, montre la valeur de
 * la première ligne à côté de chaque choix, et rien ne s'écrit avant qu'on ait
 * lu la simulation.
 */

const CHAMPS = [
  { cle: 'aa_code', libelle: "Code de l'acquis", requis: true,
    aide: 'AA74.1, 1.2, A3… — ce qui identifie l’acquis' },
  { cle: 'description', libelle: 'Intitulé de l’acquis',
    aide: 'Le texte du dossier pédagogique' },
  { cle: 'poids', libelle: 'Poids dans ce cours',
    aide: 'À défaut, chaque acquis entre au poids 1' },
];

const reduire = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z]/g, '');

export default function ImportAcquisCours({ coursCode, coursNom, annee, onClose, onImporte }) {
  const [entetes, setEntetes] = useState([]);
  const [brut, setBrut] = useState([]);
  const [corresp, setCorresp] = useState({});
  const [ligne, setLigne] = useState(0);      // la ligne dont on montre les valeurs
  const [remplacer, setRemplacer] = useState(false);
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function lire(fichier) {
    setErreur(null); setRapport(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array', cellDates: true });
      const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
      if (!lignes.length) throw new Error('Ce classeur ne contient aucune ligne.');

      const cols = Object.keys(lignes[0]);
      setEntetes(cols); setBrut(lignes); setLigne(0);

      // Une proposition de départ, qui ne fait que dégrossir : tout reste
      // corrigeable, et l'on voit la valeur réelle en face de chaque choix.
      const mots = {
        aa_code: ['aacode', 'code', 'acquis', 'aa', 'ref'],
        description: ['description', 'intitule', 'libelle', 'acquisdapprentissage', 'texte'],
        poids: ['poids', 'ponderation', 'points', 'coefficient', 'coef'],
      };
      const propose = {};
      for (const c of CHAMPS) {
        const t = cols.find(col => mots[c.cle].includes(reduire(col)))
          || cols.find(col => mots[c.cle].some(m => reduire(col).includes(m) && m.length > 3));
        if (t && !Object.values(propose).includes(t)) propose[c.cle] = t;
      }
      setCorresp(propose);
    } catch (e) { setErreur(e.message); }
  }

  function construire() {
    if (!corresp.aa_code) {
      throw new Error("Indiquez la colonne du code d'acquis : sans elle, l'import ne "
        + 'sait pas de quel acquis il parle.');
    }
    return brut.map(row => {
      const l = {};
      for (const [champ, col] of Object.entries(corresp)) {
        if (!col) continue;
        const v = row[col];
        if (v == null || String(v).trim() === '') continue;
        l[champ] = v;
      }
      return l;
    }).filter(l => l.aa_code != null);
  }

  async function lancer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(
        `/api/acquis/cours/${encodeURIComponent(coursCode)}/acquis/importer`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ annee, lignes: construire(), simulation, remplacer }),
        });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setRapport(j);
      if (!simulation) onImporte && onImporte();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const ex = brut[ligne] || {};
  const TON = { creee: 'text-emerald-700', modifiee: 'text-sky-700',
                inchangee: 'text-slate-400', ignoree: 'text-amber-700',
                refusee: 'text-red-700' };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-[60] p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-10
                      max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue">
              Importer les acquis — {coursCode}
            </h3>
            <p className="text-[12px] text-slate-500">
              {coursNom || ''} · {annee} · l'acquis est créé dans l'unité s'il n'y est
              pas, puis relié à ce cours avec son poids.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12.5px] text-red-800 flex items-start gap-1.5">
              <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
            </div>
          )}

          <label className="flex items-center gap-3 px-3 py-3 rounded-xl border-2
                            border-dashed border-slate-300 cursor-pointer hover:border-iip-blue">
            <IconFileSpreadsheet size={20} className="text-slate-400 flex-none" />
            <span className="flex-1 text-[12.5px] text-slate-600">
              {brut.length
                ? <>{brut.length} ligne(s) lue(s) · {entetes.length} colonne(s) —
                    cliquez pour changer de fichier</>
                : 'Choisir un classeur Excel (.xlsx) ou un CSV'}
            </span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => e.target.files?.[0] && lire(e.target.files[0])} />
          </label>

          {!!entetes.length && (
            <>
              {/* La correspondance, avec la valeur réelle en regard : c'est
                  elle qui dit si l'on a visé la bonne colonne. */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200
                                flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-iip-blue">
                    Correspondance des colonnes
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    exemple : ligne
                    <button disabled={ligne <= 0} onClick={() => setLigne(l => l - 1)}
                      className="px-1.5 rounded border border-slate-300 disabled:opacity-30">‹</button>
                    <b className="tabular-nums">{ligne + 1}</b>
                    <button disabled={ligne >= brut.length - 1} onClick={() => setLigne(l => l + 1)}
                      className="px-1.5 rounded border border-slate-300 disabled:opacity-30">›</button>
                    / {brut.length}
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {CHAMPS.map(c => (
                    <div key={c.cle} className="px-3 py-2 flex items-center gap-3">
                      <span className="w-44 flex-none">
                        <span className="text-[12.5px] font-semibold text-slate-800">
                          {c.libelle}
                          {c.requis && <span className="text-red-600"> *</span>}
                        </span>
                        <span className="block text-[10.5px] text-slate-500">{c.aide}</span>
                      </span>
                      <select value={corresp[c.cle] || ''}
                        onChange={e => setCorresp(m => ({ ...m, [c.cle]: e.target.value || undefined }))}
                        className={`flex-1 border rounded-lg px-2 py-1.5 text-[12px]
                          ${c.requis && !corresp[c.cle] ? 'border-red-400' : 'border-slate-300'}`}>
                        <option value="">— aucune colonne —</option>
                        {entetes.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span className="w-44 flex-none text-[11.5px] text-slate-600 truncate"
                        title={String(ex[corresp[c.cle]] ?? '')}>
                        {corresp[c.cle]
                          ? (ex[corresp[c.cle]] == null || ex[corresp[c.cle]] === ''
                              ? <i className="text-slate-400">vide</i>
                              : String(ex[corresp[c.cle]]))
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2.5 px-3 py-2 rounded-xl border
                                border-slate-200 cursor-pointer">
                <input type="checkbox" checked={remplacer}
                  onChange={e => setRemplacer(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-iip-blue" />
                <span>
                  <span className="text-[12.5px] font-semibold text-slate-800">
                    Le fichier fait foi
                  </span>
                  <span className="block text-[11.5px] text-slate-500">
                    Les acquis que ce cours évalue et qui ne figurent pas dans le fichier
                    en sont détachés. L'acquis lui-même n'est jamais supprimé — un autre
                    cours peut l'évaluer.
                  </span>
                </span>
              </label>

              {rapport && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className={`px-3 py-2 border-b text-[12.5px] ${rapport.simulation
                    ? 'bg-sky-50 border-sky-200 text-sky-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
                    <b>{rapport.simulation ? 'Simulation' : 'Import effectué'}</b> —
                    {' '}{rapport.resume.creees} créé(s),
                    {' '}{rapport.resume.modifiees} modifié(s),
                    {' '}{rapport.resume.inchangees} inchangé(s)
                    {rapport.resume.ignorees ? `, ${rapport.resume.ignorees} ignoré(s)` : ''}
                    {rapport.resume.refusees ? `, ${rapport.resume.refusees} refusé(s)` : ''}
                    {rapport.resume.deliees ? `, ${rapport.resume.deliees} détaché(s)` : ''}.
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {rapport.rapport.map(r => (
                      <div key={r.ligne} className="px-3 py-1 flex items-baseline gap-2 text-[11.5px]">
                        <span className="w-8 flex-none text-slate-400 tabular-nums">{r.ligne}</span>
                        <span className="w-24 flex-none font-mono font-semibold text-slate-700">
                          {r.aa_code || '—'}
                        </span>
                        <span className={`flex-1 ${TON[r.etat] || ''}`}>{r.quoi}</span>
                      </div>
                    ))}
                    {!!rapport.delies?.length && (
                      <div className="px-3 py-1.5 text-[11.5px] text-amber-800 bg-amber-50">
                        Détachés de ce cours : {rapport.delies.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center
                        justify-between gap-2">
          <span className="text-[11px] text-slate-500">
            Rien ne s'écrit tant que la simulation n'a pas été lue.
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
              Fermer
            </button>
            <button onClick={() => lancer(true)} disabled={enCours || !brut.length}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-iip-blue
                         text-iip-blue font-semibold disabled:opacity-40">
              Simuler
            </button>
            <button onClick={() => lancer(false)}
              disabled={enCours || !rapport || rapport.simulation === false}
              title={rapport ? '' : 'Simulez d’abord'}
              className="px-4 py-1.5 text-[12.5px] rounded-lg bg-iip-blue text-white
                         font-semibold disabled:opacity-40 flex items-center gap-1.5">
              <IconCheck size={14} /> Importer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

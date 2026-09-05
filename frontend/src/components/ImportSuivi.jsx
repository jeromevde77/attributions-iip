import { useState } from 'react';
import {
  IconUpload, IconX, IconAlertTriangle, IconCheck, IconSearch,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { lireFeuilleUE, decisionRetenue, lireRepartition } from '../lib/lireSuivi.js';

/**
 * Import d'un classeur « Suivi étudiants » — une feuille par unité.
 *
 * L'écran LIT d'abord et montre ce qu'il a compris, unité par unité. Rien
 * n'est écrit avant une simulation, puis une confirmation : un import de
 * résultats touche à des délibérations, il ne se rattrape pas.
 */
export default function ImportSuivi({ annee, onClose, onTermine }) {
  const [feuilles, setFeuilles] = useState(null);   // [{ ue_num, lignes }]
  const [lues, setLues] = useState(null);           // résultat de la lecture
  const [choisies, setChoisies] = useState(new Set());
  const [rapport, setRapport] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState('');

  async function lire(fichier) {
    setErreur(null); setRapport(null); setLues(null);
    setEnCours(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });

      // Une feuille d'unité porte un nom purement numérique : « 246 ». Les
      // autres — Coordonnées, PAE, Listes — ne nous concernent pas.
      // L'onglet de RÉPARTITION porte les pondérations telles que le Conseil
      // les a fixées : elles priment sur celles déduites des périodes.
      let repartition = {};
      const nomRep = wb.SheetNames.find(n => /^Repartition_AA_UE$/i.test(n.trim()));
      if (nomRep) {
        try {
          repartition = lireRepartition(XLSX.utils.sheet_to_json(
            wb.Sheets[nomRep], { header: 1, defval: null, raw: false }));
        } catch (e) { console.error('[répartition]', e); }
      }

      const utiles = wb.SheetNames.filter(n => /^\d+$/.test(n.trim()));
      if (!utiles.length) {
        throw new Error("Aucune feuille d'unité dans ce classeur. Les feuilles "
          + 'attendues portent un numéro, comme « 246 ».');
      }

      const brut = utiles.map(nom => ({
        ue_num: Number(nom.trim()),
        repartition: repartition[Number(nom.trim())] || null,
        lignes: XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: null, raw: false }),
      }));
      setFeuilles(brut);

      const analyse = brut.map(f => {
        try {
          const r = lireFeuilleUE(f.lignes, f.ue_num);
          r.repartition = f.repartition;
          const decisions = {};
          let justifs = 0, sansDecision = 0;
          for (const e of r.etudiants) {
            const d = decisionRetenue(e.sessions);
            if (!d) { sansDecision++; continue; }
            const cle = `${d.session} ${d.resultat}`;
            decisions[cle] = (decisions[cle] || 0) + 1;
            if (d.justification) justifs++;
          }
          return { ...r, decisions, justifs, sansDecision, erreur: r.erreur || null,
                   nbPonderations: r.repartition
                     ? Object.keys(r.repartition.cours || {}).filter(k => r.repartition.cours[k]).length
                     : Object.keys(r.ponderations || {}).length,
                   aRepartition: !!r.repartition };
        } catch (e) {
          return { ue_num: f.ue_num, etudiants: [], erreur: e.message };
        }
      });
      setLues(analyse);
      // Rien n'est coché d'emblée : on choisit ce qu'on importe.
      setChoisies(new Set());
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function executer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const paquet = [];
      for (const f of lues.filter(x => choisies.has(x.ue_num) && !x.erreur)) {
        for (const e of f.etudiants) {
          const d = decisionRetenue(e.sessions);
          paquet.push({
            matricule: e.matricule, nom: e.nom, prenom: e.prenom,
            ue_num: f.ue_num,
            decision: d?.resultat || null,
            points: d?.points ?? null,
            session: d?.session || null,
            justification: d?.justification || null,
            recopie: !!d?.recopie,
            // Les pondérations du bloc : propres à l'unité, portées par la
            // première ligne suffit, mais on les joint à chacune par simplicité.
            ponderations: f.ponderations || null,
            repartition: f.repartition || null,
            notes_s1: e.sessions.s1?.notes || {},
            notes_s2: e.sessions.s2?.notes || {},
          });
        }
      }
      if (!paquet.length) { setErreur('Aucune unité retenue.'); return; }

      const rep = await fetch('/api/etudiants/import-suivi', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, lignes: paquet, simulation }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setRapport(j);
      if (!simulation) onTermine && onTermine();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const affichees = (lues || []).filter(f =>
    !recherche.trim() || String(f.ue_num).includes(recherche.trim()));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-8 p-5 space-y-4
                      max-h-[88vh] overflow-y-auto">

        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">
              Importer un classeur de suivi
            </h3>
            <p className="text-[12px] text-slate-500">
              Les deux sessions, les notes par acquis et la motivation des
              décisions · année {annee}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        {erreur && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                          text-[12.5px] text-red-800">{erreur}</div>
        )}

        <label className="inline-flex items-center gap-2 px-3 py-2 text-[12.5px] border
                          border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
          <IconUpload size={15} /> Choisir un classeur
          <input type="file" accept=".xlsm,.xlsx" className="hidden"
            onChange={e => e.target.files[0] && lire(e.target.files[0])} />
        </label>

        {lues && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button onClick={() => setChoisies(s =>
                s.size === lues.filter(f => !f.erreur).length
                  ? new Set()
                  : new Set(lues.filter(f => !f.erreur).map(f => f.ue_num)))}
                className="text-[12.5px] text-iip-blue font-semibold">
                {choisies.size === lues.filter(f => !f.erreur).length
                  ? 'Tout décocher' : 'Tout cocher'}
              </button>
              <span className="text-[13px] font-semibold text-iip-blue">
                {choisies.size} unité(s) sur {lues.length}
              </span>
              <div className="relative">
                <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2
                                                 text-slate-400" />
                <input value={recherche} onChange={e => setRecherche(e.target.value)}
                  placeholder="N° d'UE…"
                  className="border border-slate-300 rounded-lg pl-8 pr-2 py-1 text-[12px] w-32" />
              </div>
            </div>

            {/* Ce que le lecteur a compris, unité par unité. On voit avant
                d'écrire — un import de résultats ne se rattrape pas. */}
            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl
                            divide-y divide-slate-100">
              {affichees.map(f => (
                <label key={f.ue_num}
                  className={`flex items-start gap-3 px-3 py-2 text-[12px] cursor-pointer
                    ${f.erreur ? 'bg-red-50/50'
                      : choisies.has(f.ue_num) ? 'bg-iip-blue/5' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" checked={choisies.has(f.ue_num)}
                    disabled={!!f.erreur} className="mt-0.5"
                    onChange={() => setChoisies(s => {
                      const n = new Set(s);
                      n.has(f.ue_num) ? n.delete(f.ue_num) : n.add(f.ue_num);
                      return n;
                    })} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-iip-blue">
                      UE {f.ue_num}
                      {f.erreur && (
                        <span className="ml-2 text-red-700 font-normal">{f.erreur}</span>
                      )}
                    </div>
                    {!f.erreur && (
                      <>
                        <div className="text-slate-600">
                          {f.etudiants.length} étudiant(s) ·{' '}
                          {Object.entries(f.blocs || {}).map(([k, b]) =>
                            `${k} ${b.acquis} AA`).join(' · ')}
                          {f.justifs > 0 && ` · ${f.justifs} justification(s)`}
                          {f.nbPonderations > 0 && (f.aRepartition
                            ? ` · ${f.nbPonderations} cours pondéré(s)`
                            : ` · ${f.nbPonderations} pondération(s)`)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {Object.entries(f.decisions).sort()
                            .map(([k, n]) => `${k} : ${n}`).join('  ·  ')}
                          {f.sansDecision > 0 && (
                            <span className="text-amber-700">
                              {'  ·  '}{f.sansDecision} sans décision
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <button onClick={() => executer(true)} disabled={enCours || !choisies.size}
              className="px-4 py-2 text-sm bg-iip-blue text-white font-semibold rounded-lg
                         disabled:opacity-40">
              {enCours ? 'Analyse…' : 'Simuler'}
            </button>
          </div>
        )}

        {rapport && (
          <div className="space-y-3 border-t border-slate-200 pt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[['Lignes lues', rapport.lignes_lues],
                ['Étudiants retrouvés', rapport.retrouves],
                ['Résultats à écrire', rapport.resultats],
                ['Inconnus', rapport.nb_inconnus]].map(([l, v]) => (
                <div key={l} className="border border-slate-200 rounded-xl px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500
                                  font-semibold">{l}</div>
                  <div className="text-[18px] font-bold text-iip-blue">{v}</div>
                </div>
              ))}
            </div>

            {rapport.nb_inconnus > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                              text-[12px] text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <IconAlertTriangle size={14} />
                  {rapport.nb_inconnus} étudiant(s) sans correspondance
                </div>
                Leur matricule ne figure pas dans Lucie. Leurs résultats ne
                seront pas importés.
                <div className="mt-1 text-[11px]">
                  {rapport.inconnus.slice(0, 6).map(i =>
                    `${i.nom} ${i.prenom} (${i.matricule})`).join(' · ')}
                </div>
              </div>
            )}

            {rapport.ecrases > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                              text-[12px] text-amber-900">
                {rapport.ecrases} résultat(s) déjà en base seront REMPLACÉS.
                Les valeurs actuelles seront perdues.
              </div>
            )}

            {rapport.simulation ? (
              <button onClick={() => executer(false)}
                disabled={enCours || !rapport.resultats}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-iip-blue text-white
                           font-semibold rounded-lg disabled:opacity-40">
                <IconCheck size={15} /> Importer {rapport.resultats} résultat(s)
              </button>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200
                              text-[12.5px] text-emerald-800">
                {rapport.resultats} résultat(s) importé(s) · {rapport.notes} note(s)
                par acquis · {rapport.motivations} motivation(s).
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

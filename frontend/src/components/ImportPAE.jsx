import { useState } from 'react';
import { IconX, IconUpload, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Import du classeur de PAE établi par la coordination.
 *
 * Le classeur donne un étudiant par ligne et un COURS par colonne — la maille
 * qui manquait à Lucie. Les valeurs employées relèvent d'une convention propre
 * à l'établissement : plutôt que de la figer dans le code, l'import affiche les
 * valeurs rencontrées et laisse la coordination les qualifier.
 */

const SENS = [
  { val: 'reussi',       label: 'Réussi (crédité)' },
  { val: 'faveur',       label: 'Réussi par faveur du Conseil des études' },
  { val: 'refuse',       label: 'Refusé' },
  { val: 'non_presente', label: 'Non présenté' },
  { val: 'va',           label: 'Valorisation des acquis' },
  { val: 'vp',           label: 'Valorisation partielle' },
  { val: 'pae',          label: 'Inscrit au PAE, non délibéré' },
  { val: 'note',         label: 'Note reportée (valeur sur 20)' },
  { val: 'ignorer',      label: '— ignorer' },
];

// Convention observée dans le classeur de la coordination
const DEFAUTS = {
  c: 'reussi', C: 'reussi',
  r: 'refuse', R: 'refuse',
  F: 'faveur',
  np: 'non_presente', NP: 'non_presente',
  VA: 'va', VP: 'vp',
  x: 'pae', X: 'pae',
  '-': 'ignorer', '?': 'ignorer',
};

export default function ImportPAE({ annee, onClose, onImporte }) {
  const [etape, setEtape] = useState('fichier');   // fichier | legende | fait
  const [analyse, setAnalyse] = useState(null);
  const [mapping, setMapping] = useState({});
  const [anneeRes, setAnneeRes] = useState('');
  const [anneePae, setAnneePae] = useState(annee || '');
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function lire(fichier) {
    setErreur(null); setEnCours(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });
      const nom = wb.SheetNames.includes('TOUS') ? 'TOUS' : wb.SheetNames[0];
      const M = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: null });
      if (M.length < 3) throw new Error('Onglet trop court — attendu : intitulés, codes, puis les étudiants.');

      // Ligne 2 : les codes de cours ; ligne 1 : leurs intitulés
      const nettoie = v => String(v ?? '').replace(/\u00a0/g, '').trim();
      const codes = (M[1] || []).map(nettoie);
      const noms  = (M[0] || []).map(nettoie);

      const iMat = codes.findIndex(v => /^Id_Etud/i.test(v));
      if (iMat < 0) throw new Error("Colonne « Id_Etud » introuvable en deuxième ligne.");
      const iCom = codes.findIndex(v => /Commentaire/i.test(v));

      // Colonnes de cours : un code numérique éventuellement suivi d'un rang
      const colonnes = [];
      codes.forEach((cd, i) => {
        if (i > iMat && /^\d+(\.\d+)?$/.test(cd)) colonnes.push({ i, code: cd, nom: noms[i] || '' });
      });
      if (!colonnes.length) throw new Error('Aucune colonne de cours reconnue (codes attendus : 246, 248.1…).');

      // Valeurs rencontrées, hors nombres qui sont des notes
      const occurrences = {};
      let nEtudiants = 0;
      for (let li = 2; li < M.length; li++) {
        const row = M[li] || [];
        if (!nettoie(row[iMat])) continue;
        nEtudiants++;
        for (const c of colonnes) {
          const v = nettoie(row[c.i]);
          if (!v) continue;
          const cle = /^\d+([.,]\d+)?$/.test(v) ? '«nombre»' : v;
          occurrences[cle] = (occurrences[cle] || 0) + 1;
        }
      }

      const liste = Object.entries(occurrences)
        .sort((a, b) => b[1] - a[1])
        .map(([valeur, n]) => ({ valeur, n }));

      const map = {};
      for (const { valeur } of liste) {
        map[valeur] = valeur === '«nombre»' ? 'note' : (DEFAUTS[valeur] ?? 'ignorer');
      }

      setAnalyse({ M, codes, colonnes, iMat, iCom, liste, nEtudiants, onglet: nom });
      setMapping(map);
      // Année des résultats = celle qui précède l'année du PAE
      const [a1, a2] = (annee || '').split('-').map(Number);
      setAnneeRes(a1 ? `${a1 - 1}-${a2 - 1}` : '');
      setEtape('legende');
    } catch (e) {
      setErreur(e.message);
    } finally { setEnCours(false); }
  }

  async function importer() {
    if (!/^20\d{2}-20\d{2}$/.test(anneeRes.trim())) { setErreur('Année des résultats : format 2025-2026'); return; }
    setEnCours(true); setErreur(null);
    try {
      const { M, colonnes, iMat, iCom } = analyse;
      const nettoie = v => String(v ?? '').replace(/\u00a0/g, '').trim();
      const resultats = [], pae = [], commentaires = [];

      for (let li = 2; li < M.length; li++) {
        const row = M[li] || [];
        const mat = nettoie(row[iMat]);
        if (!mat) continue;

        if (iCom >= 0 && nettoie(row[iCom])) {
          commentaires.push({ id_ecampus: mat, texte: nettoie(row[iCom]) });
        }

        for (const c of colonnes) {
          const brut = nettoie(row[c.i]);
          if (!brut) continue;
          const estNombre = /^\d+([.,]\d+)?$/.test(brut);
          const sens = mapping[estNombre ? '«nombre»' : brut] || 'ignorer';
          if (sens === 'ignorer') continue;

          if (sens === 'pae') { pae.push({ id_ecampus: mat, cours_code: c.code }); continue; }

          if (sens === 'note') {
            resultats.push({
              id_ecampus: mat, cours_code: c.code, statut: 'report',
              note: Number(brut.replace(',', '.')), faveur: 0,
            });
            continue;
          }
          resultats.push({
            id_ecampus: mat, cours_code: c.code,
            statut: sens === 'faveur' ? 'reussi' : sens,
            note: null, faveur: sens === 'faveur' ? 1 : 0,
          });
        }
      }

      const rep = await fetch('/api/etudiants/import-pae', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee_resultats: anneeRes.trim(),
          annee_pae: anneePae.trim() || null,
          resultats, pae, commentaires,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error || 'Erreur'); return; }
      setRapport(j); setEtape('fait');
      onImporte && onImporte();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-10">
        <div className="bg-iip-blue rounded-t-2xl px-5 py-4 flex items-start justify-between">
          <div>
            <div className="text-white font-bold text-[15px]">Importer le classeur de PAE</div>
            <div className="text-blue-200 text-[12px] mt-0.5">
              Résultats par cours et programme de l'année suivante
            </div>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><IconX size={19} /></button>
        </div>

        <div className="p-5 space-y-4">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12.5px] text-red-800">
              {erreur}
            </div>
          )}

          {etape === 'fichier' && (
            <>
              <p className="text-[13px] text-slate-600">
                Le classeur doit comporter un onglet <b>TOUS</b> : les intitulés en première ligne,
                les codes de cours en deuxième, puis un étudiant par ligne.
              </p>
              <label className={`flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-xl cursor-pointer
                ${enCours ? 'opacity-50 pointer-events-none' : 'border-iip-turquoise text-iip-turquoise hover:bg-iip-turquoise/5'}`}>
                <IconUpload size={18} />
                {enCours ? 'Lecture…' : 'Choisir le fichier .xlsx'}
                <input type="file" accept=".xlsx,.xlsm" className="hidden"
                  onChange={e => e.target.files[0] && lire(e.target.files[0])} />
              </label>
            </>
          )}

          {etape === 'legende' && analyse && (
            <>
              <div className="text-[12.5px] text-slate-600">
                Onglet <b>{analyse.onglet}</b> — {analyse.nEtudiants} étudiants,
                {' '}{analyse.colonnes.length} colonnes de cours.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs">
                  <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Année des résultats
                  </span>
                  <input value={anneeRes} onChange={e => setAnneeRes(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs">
                  <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Année du PAE
                  </span>
                  <input value={anneePae} onChange={e => setAnneePae(e.target.value)}
                    placeholder="laisser vide pour ne pas créer d'inscriptions"
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                </label>
              </div>

              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Signification des valeurs rencontrées
                </div>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {analyse.liste.map(({ valeur, n }) => (
                    <div key={valeur} className="flex items-center gap-3 px-3 py-2">
                      <code className="text-[12px] font-bold text-iip-blue bg-slate-100 px-2 py-0.5 rounded flex-none min-w-[70px] text-center">
                        {valeur}
                      </code>
                      <span className="text-[11px] text-slate-400 flex-none w-16">{n}×</span>
                      <select value={mapping[valeur] || 'ignorer'}
                        onChange={e => setMapping(m => ({ ...m, [valeur]: e.target.value }))}
                        className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-[12px]">
                        {SENS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p className="text-[10.5px] text-slate-400 mt-1.5">
                  Les commentaires libres du Conseil des études sont repris tels quels et
                  n'apparaissent pas ici. Une valeur laissée sur « ignorer » n'est pas importée.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => setEtape('fichier')}
                  className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Retour</button>
                <button onClick={importer} disabled={enCours}
                  className="text-sm px-4 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-50">
                  {enCours ? 'Import…' : 'Importer'}
                </button>
              </div>
            </>
          )}

          {etape === 'fait' && rapport && (
            <>
              <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[13px] text-emerald-900">
                <div className="font-semibold mb-1">Import terminé</div>
                <ul className="space-y-0.5 text-[12px]">
                  <li>{rapport.resultats_cours} résultat(s) de cours enregistré(s)</li>
                  <li>{rapport.ue_deduites} unité(s) d'enseignement déduite(s) et sanctionnée(s)</li>
                  <li>{rapport.pae_creees} inscription(s) créée(s) au PAE</li>
                  <li>{rapport.commentaires} commentaire(s) du Conseil des études repris</li>
                </ul>
              </div>

              {(rapport.matricules_inconnus?.length > 0 || rapport.cours_inconnus?.length > 0) && (
                <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11.5px] text-amber-900">
                  <div className="flex items-center gap-1.5 font-semibold mb-1">
                    <IconAlertTriangle size={14} /> À vérifier
                  </div>
                  {rapport.matricules_inconnus?.length > 0 && (
                    <div>Matricules absents de Lucie : {rapport.matricules_inconnus.join(', ')}</div>
                  )}
                  {rapport.cours_inconnus?.length > 0 && (
                    <div className="mt-1">
                      Codes de cours absents du référentiel : {rapport.cours_inconnus.join(', ')} —
                      leurs résultats sont enregistrés mais non rattachés à une UE.
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={onClose}
                  className="text-sm px-4 py-1.5 rounded-lg bg-iip-blue text-white font-semibold">
                  Fermer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

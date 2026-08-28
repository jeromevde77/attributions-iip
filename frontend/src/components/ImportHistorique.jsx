import { useState } from 'react';
import { IconX, IconUpload, IconAlertTriangle, IconCheck, IconFileSpreadsheet } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Reconstruction de l'historique depuis les classeurs de suivi.
 *
 * Plusieurs classeurs, plusieurs années, plusieurs sections en une fois.
 * eCampus réattribuant un matricule à chaque rentrée, le rapprochement se fait
 * d'abord sur le NUMÉRO NATIONAL — sans quoi chaque étudiant se retrouverait
 * dédoublé, un dossier par année, et son parcours éclaté.
 *
 * Rien n'est écrit avant que la simulation n'ait montré ce qui sera fait.
 */
export default function ImportHistorique({ onClose, onImporte }) {
  const [fichiers, setFichiers] = useState([]);
  const [rapport, setRapport] = useState(null);
  const [etape, setEtape] = useState('fichiers');   // fichiers | simulation | fait
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  const net = v => String(v ?? '').replace(/\u00a0/g, '').trim();

  // « Suivi_etudiants_TIM_25 » → 2025-2026 ; « …_psychomotricite_24 » → 2024-2025
  function anneeDepuisNom(nom) {
    const m = /(?:^|[_\s-])(\d{2})(?:\D|$)/g;
    let dernier = null, x;
    while ((x = m.exec(nom)) !== null) dernier = x[1];
    if (!dernier) return '';
    const a = 2000 + Number(dernier);
    return `${a}-${a + 1}`;
  }
  function sectionDepuisNom(nom) {
    const n = nom.toLowerCase();
    if (n.includes('tim')) return 'TIM';
    if (n.includes('psychomot')) return 'Psychomotricité';
    if (n.includes('optom')) return 'Optométrie';
    return '';
  }

  async function lire(liste) {
    setErreur(null); setEnCours(true);
    try {
      const XLSX = await import('xlsx');
      const lus = [];
      for (const f of liste) {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });

        // Signalétique — onglet Coordonnées lorsqu'il existe
        let coordonnees = [];
        const ongletCoord = wb.SheetNames.find(n => /coordonn/i.test(n));
        if (ongletCoord) {
          for (const l of XLSX.utils.sheet_to_json(wb.Sheets[ongletCoord], { defval: null })) {
            const id = net(l.Id_Etud);
            if (!id) continue;
            const loc = net(l['Localité']);
            const mLoc = /^(\d{4})\s+(.*)$/.exec(loc);
            coordonnees.push({
              id_ecampus: id,
              nom: net(l.NomEtud), prenom: net(l['PréEtud']), titre: net(l.TitreMrMme),
              email_ecole: net(l.EmailEcole), email_perso: net(l['Email Perso']),
              date_naissance: net(l.StrDatNais), num_national: net(l['N°National']),
              gsm: net(l.GSMEtud), adresse: net(l['AdrN°Bte']),
              cp: mLoc ? mLoc[1] : net(l.CP), localite: mLoc ? mLoc[2] : loc,
            });
          }
        }

        // Résultats — un onglet par UE, nommé par son numéro
        const resultats = [];
        let ues = 0;
        for (const nomOnglet of wb.SheetNames) {
          if (!/^\d+$/.test(nomOnglet.trim())) continue;
          const M = XLSX.utils.sheet_to_json(wb.Sheets[nomOnglet], { header: 1, defval: null });
          if (M.length < 13) continue;
          const l8 = (M[7] || []).map(net), l12 = (M[11] || []).map(net);
          const iDs1 = l8.indexOf('Décision.s1'), iDs2 = l8.indexOf('Décision.s2');
          const iNs1 = l8.indexOf('Note.s1'),     iNs2 = l8.indexOf('Note.s2');
          const iMat = l12.indexOf('Matricule');
          if (iMat < 0 || (iDs1 < 0 && iDs2 < 0)) continue;
          ues++;
          for (let li = 12; li < M.length; li++) {
            const row = M[li] || [];
            const mat = net(row[iMat]);
            if (!mat) continue;
            const d = net(iDs2 >= 0 ? row[iDs2] : '') || net(iDs1 >= 0 ? row[iDs1] : '');
            const D = d.toUpperCase();
            const brute = [iNs2, iNs1].map(i => (i >= 0 ? row[i] : null))
              .find(v => v != null && v !== '' && !isNaN(Number(v)));
            const note = brute == null ? null
              : Math.round((Number(brute) <= 20 ? Number(brute) : Number(brute) / 5) * 10) / 10;
            const resultat = D === 'C' ? 'reussi' : (D === 'R' || D === 'AJ') ? 'ajourne' : null;
            if (!resultat && note == null) continue;
            resultats.push({ id_ecampus: mat, ue_num: Number(nomOnglet.trim()), resultat, points: note });
          }
        }

        lus.push({
          nom: f.name, annee: anneeDepuisNom(f.name), section: sectionDepuisNom(f.name),
          ues, coordonnees, resultats,
          avecCoord: !!ongletCoord,
        });
      }
      setFichiers(lus);
      setEtape('simulation');
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function lancer(simulation) {
    const invalides = fichiers.filter(f => !/^20\d{2}-20\d{2}$/.test(f.annee));
    if (invalides.length) { setErreur(`Année manquante ou invalide : ${invalides.map(f => f.nom).join(', ')}`); return; }
    setErreur(null); setEnCours(true);
    try {
      const rep = await fetch('/api/import-historique', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ simulation, fichiers }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error || 'Erreur'); return; }
      setRapport(j);
      if (!simulation) { setEtape('fait'); onImporte && onImporte(); }
    } finally { setEnCours(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-8">
        <div className="bg-iip-blue rounded-t-2xl px-5 py-4 flex items-start justify-between">
          <div>
            <div className="text-white font-bold text-[15px]">Reconstruire l'historique</div>
            <div className="text-blue-200 text-[12px] mt-0.5">
              Plusieurs classeurs de suivi, plusieurs années, en une fois
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

          {etape === 'fichiers' && (
            <>
              <div className="px-3 py-2.5 rounded-lg bg-sky-50 border border-sky-200 text-[12px] text-sky-900">
                eCampus réattribue un matricule à chaque rentrée : le même étudiant figure sous
                <code className="mx-1 px-1 bg-white rounded">24-00174</code> puis
                <code className="mx-1 px-1 bg-white rounded">25-00298</code>. Le rapprochement se fait
                donc d'abord sur le <b>numéro national</b>, puis sur les matricules connus, enfin sur
                l'identité. Sans quoi chaque étudiant serait dédoublé et son parcours éclaté.
              </div>
              <label className={`flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-xl cursor-pointer
                ${enCours ? 'opacity-50 pointer-events-none' : 'border-iip-turquoise text-iip-turquoise hover:bg-iip-turquoise/5'}`}>
                <IconUpload size={18} />
                {enCours ? 'Lecture…' : 'Choisir les classeurs (.xlsm) — plusieurs à la fois'}
                <input type="file" accept=".xlsm,.xlsx" multiple className="hidden"
                  onChange={e => e.target.files.length && lire([...e.target.files])} />
              </label>
            </>
          )}

          {etape === 'simulation' && (
            <>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {fichiers.map((f, i) => (
                  <div key={f.nom} className="px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <IconFileSpreadsheet size={15} className="text-slate-400 flex-none" />
                      <span className="text-[12.5px] text-slate-800 flex-1 truncate">{f.nom}</span>
                      <input value={f.annee}
                        onChange={e => setFichiers(fs => fs.map((x, j) => j === i ? { ...x, annee: e.target.value } : x))}
                        className="w-24 border border-slate-300 rounded-lg px-2 py-1 text-[12px] text-center" />
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 ml-6">
                      {f.section || 'section indéterminée'} · {f.ues} UE ·
                      {' '}{f.resultats.length} résultats ·
                      {' '}{f.avecCoord ? `${f.coordonnees.length} fiches signalétiques`
                                        : <span className="text-amber-700">sans onglet Coordonnées</span>}
                    </div>
                  </div>
                ))}
              </div>

              {rapport && (
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-900 mb-1.5">
                    <IconAlertTriangle size={15} /> Ce qui sera fait
                  </div>
                  <ul className="text-[12px] text-amber-900 space-y-0.5">
                    <li><b>{rapport.total.rapproches}</b> étudiant(s) rapproché(s) d'un dossier existant
                      — dont {rapport.methodes.numero_national} par numéro national,
                      {' '}{rapport.methodes.matricule} par matricule,
                      {' '}{rapport.methodes.identite} par identité</li>
                    <li><b>{rapport.total.crees}</b> dossier(s) à créer</li>
                    <li><b>{rapport.total.resultats}</b> résultat(s) à enregistrer</li>
                    {rapport.total.sans_correspondance > 0 && (
                      <li className="text-amber-800">{rapport.total.sans_correspondance} résultat(s)
                        sans étudiant identifiable — ignorés</li>
                    )}
                  </ul>
                  {rapport.doublons_pressentis?.length > 0 && (
                    <div className="mt-2 text-[11px] text-amber-800">
                      Attention : {rapport.doublons_pressentis.length} numéro(s) national(aux) déjà
                      portés par plusieurs dossiers en base — à fusionner ensuite.
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={() => { setEtape('fichiers'); setRapport(null); }}
                  className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Retour</button>
                <button onClick={() => lancer(true)} disabled={enCours}
                  className="text-sm px-3 py-1.5 rounded-lg border border-iip-blue text-iip-blue font-medium disabled:opacity-50">
                  {enCours ? '…' : 'Simuler'}
                </button>
                <button onClick={() => lancer(false)} disabled={!rapport || enCours}
                  className="text-sm px-4 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40">
                  Importer
                </button>
              </div>
            </>
          )}

          {etape === 'fait' && rapport && (
            <>
              <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[13px] text-emerald-900">
                <div className="font-semibold mb-1 flex items-center gap-1.5">
                  <IconCheck size={16} /> Historique reconstruit
                </div>
                <ul className="text-[12px] space-y-0.5">
                  <li>{rapport.total.rapproches} étudiant(s) rapproché(s), {rapport.total.crees} créé(s)</li>
                  <li>{rapport.total.resultats} résultat(s) enregistré(s)</li>
                </ul>
              </div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {rapport.fichiers.map(f => (
                  <div key={f.nom} className="px-3 py-2 text-[11.5px]">
                    <div className="text-slate-800">{f.nom} <span className="text-slate-400">· {f.annee}</span></div>
                    <div className="text-slate-500">
                      {f.rapproches} rapproché(s), {f.crees} créé(s), {f.resultats} résultat(s)
                      {f.sans_correspondance > 0 && ` · ${f.sans_correspondance} ignoré(s)`}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button onClick={onClose}
                  className="text-sm px-4 py-1.5 rounded-lg bg-iip-blue text-white font-semibold">Fermer</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

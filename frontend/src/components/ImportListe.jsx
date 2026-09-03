import { useState } from 'react';
import { IconX, IconUpload, IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Import d'une liste eCampus (R_Etudiants_Excel_Inscriptions_).
 *
 * Ces listes portent la signalétique complète — adresse, numéro national, date
 * de naissance — mais désignent les UE par un code court propre à eCampus
 * (TINFO, PDPS, 901) et non par le numéro d'UE. La correspondance s'établit
 * une fois : elle est mémorisée et resservira aux imports suivants.
 */
export default function ImportListe({ annee, onClose, onImporte }) {
  const [etape, setEtape] = useState('fichier');
  const [brut, setBrut] = useState(null);
  const [codes, setCodes] = useState([]);
  const [ues, setUes] = useState([]);
  const [anneeImport, setAnneeImport] = useState(annee || '');
  const [rapport, setRapport] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const nettoie = v => String(v ?? '').replace(/\u00a0/g, '').trim();

  async function lire(fichier) {
    setErreur(null); setEnCours(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });
      const nom = wb.SheetNames.find(n => /Inscriptions/i.test(n)) || wb.SheetNames[0];
      const lignes = XLSX.utils.sheet_to_json(wb.Sheets[nom], { defval: null });
      if (!lignes.length) throw new Error('Onglet vide.');
      if (!('Id_Etud' in lignes[0]) || !('UE' in lignes[0])) {
        throw new Error("Colonnes « Id_Etud » et « UE » attendues — est-ce bien une liste eCampus ?");
      }

      // Étudiants dédupliqués, avec toute la signalétique disponible
      const vus = new Map();
      for (const l of lignes) {
        const id = nettoie(l.Id_Etud);
        if (!id || vus.has(id)) continue;
        const loc = nettoie(l['Localité']);          // « 1731 Relegem »
        const m = /^(\d{4})\s+(.*)$/.exec(loc);
        vus.set(id, {
          id_ecampus: id,
          nom: nettoie(l.NomEtud), prenom: nettoie(l['PréEtud']),
          titre: nettoie(l.TitreMrMme),
          email_ecole: nettoie(l.EmailEcole) || nettoie(l['Email Ecole']),
          email_perso: nettoie(l['Email Perso']),
          date_naissance: nettoie(l.StrDatNais),
          // Vos classeurs portent LieuNais, mais l'import ne le lisait pas :
          // le lieu de naissance restait vide sur les attestations, alors que
          // la donnée était dans le fichier.
          lieu_naissance: nettoie(l.LieuNais),
          num_national: nettoie(l['N°National']),
          gsm: nettoie(l.GSMEtud) || nettoie(l['TélEtud']),
          adresse: nettoie(l['AdrN°Bte']),
          cp: m ? m[1] : nettoie(l.CP),
          localite: m ? m[2] : loc,
        });
      }

      // Codes d'UE distincts, avec leur intitulé eCampus
      const parCode = new Map();
      for (const l of lignes) {
        const cd = nettoie(l.UE);
        if (cd && !parCode.has(cd)) parCode.set(cd, nettoie(l.Classe));
      }

      const rep = await fetch('/api/etudiants/codes-externes/resoudre', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ codes: [...parCode].map(([code, libelle]) => ({ code, libelle })) }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur de résolution');

      setBrut({ lignes, etudiants: [...vus.values()] });
      setCodes(j.resultats);
      setUes(j.ues || []);
      setEtape('correspondance');
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function importer() {
    if (!/^20\d{2}-20\d{2}$/.test(anneeImport.trim())) { setErreur('Année : format 2025-2026'); return; }
    const manquants = codes.filter(c => c.ue_num == null);
    if (manquants.length && !window.confirm(
      `${manquants.length} code(s) sans correspondance : ${manquants.map(c => c.code).join(', ')}.\n` +
      `Leurs inscriptions seront ignorées. Poursuivre ?`)) return;

    setEnCours(true); setErreur(null);
    try {
      // Mémoriser la correspondance pour les imports suivants
      await fetch('/api/etudiants/codes-externes', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          correspondances: codes.filter(c => c.ue_num != null)
            .map(c => ({ code: c.code, ue_num: c.ue_num, libelle: c.libelle })),
        }),
      });

      const map = Object.fromEntries(codes.filter(c => c.ue_num != null).map(c => [c.code, c.ue_num]));
      const inscriptions = brut.lignes.map(l => {
        const cd = nettoie(l.UE);
        const cog = nettoie(l.COG);                     // « TINFO-1-A »
        const g = /-(\d+)-([A-Za-z]+)$/.exec(cog);
        return {
          id_ecampus: nettoie(l.Id_Etud),
          ue_num: map[cd] ?? null,
          groupe: g ? g[2].toUpperCase() : null,
        };
      }).filter(i => i.id_ecampus);

      const rep = await fetch('/api/etudiants/import-liste', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee: anneeImport.trim(), etudiants: brut.etudiants, inscriptions }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error || 'Erreur'); return; }
      setRapport(j); setEtape('fait');
      onImporte && onImporte();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const resolus = codes.filter(c => c.ue_num != null).length;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-10">
        <div className="bg-iip-blue rounded-t-2xl px-5 py-4 flex items-start justify-between">
          <div>
            <div className="text-white font-bold text-[15px]">Importer une liste eCampus</div>
            <div className="text-blue-200 text-[12px] mt-0.5">
              Signalétique complète, inscriptions et groupes
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
                Fichier <b>Liste_…&nbsp;.xls</b> exporté d'eCampus, onglet
                « R_Etudiants_Excel_Inscriptions_ ».
              </p>
              <label className={`flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-xl cursor-pointer
                ${enCours ? 'opacity-50 pointer-events-none' : 'border-iip-turquoise text-iip-turquoise hover:bg-iip-turquoise/5'}`}>
                <IconUpload size={18} />
                {enCours ? 'Lecture…' : 'Choisir le fichier'}
                <input type="file" accept=".xls,.xlsx" className="hidden"
                  onChange={e => e.target.files[0] && lire(e.target.files[0])} />
              </label>
            </>
          )}

          {etape === 'correspondance' && brut && (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[12.5px] text-slate-600">
                  {brut.etudiants.length} étudiants · {brut.lignes.length} inscriptions ·
                  {' '}{codes.length} codes d'UE
                </div>
                <label className="text-xs flex items-center gap-2">
                  <span className="font-semibold text-slate-500 uppercase tracking-wide">Année</span>
                  <input value={anneeImport} onChange={e => setAnneeImport(e.target.value)}
                    className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-28" />
                </label>
              </div>

              <div className={`px-3 py-2 rounded-lg text-[12px] border ${
                resolus === codes.length
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                {resolus} code(s) sur {codes.length} rapproché(s) automatiquement.
                {resolus < codes.length && " Complétez les autres ci-dessous — la correspondance sera mémorisée."}
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {codes.map((c, i) => (
                  <div key={c.code} className="flex items-center gap-2 px-3 py-2">
                    <code className="text-[11.5px] font-bold text-iip-blue bg-slate-100 px-1.5 py-0.5 rounded flex-none min-w-[62px] text-center">
                      {c.code}
                    </code>
                    <span className="text-[11px] text-slate-500 flex-1 truncate" title={c.libelle}>
                      {c.libelle}
                    </span>
                    {c.origine === 'memorise' && (
                      <span className="text-[9.5px] text-slate-400 flex-none">mémorisé</span>
                    )}
                    {c.origine === 'suggere' && (
                      <IconCheck size={13} className="text-emerald-600 flex-none" />
                    )}
                    {!c.origine && (
                      <IconAlertTriangle size={13} className="text-amber-500 flex-none" />
                    )}
                    <select value={c.ue_num ?? ''}
                      onChange={e => setCodes(cs => cs.map((x, j) =>
                        j === i ? { ...x, ue_num: e.target.value ? Number(e.target.value) : null,
                                    origine: e.target.value ? 'manuel' : null } : x))}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-[11.5px] w-64 flex-none">
                      <option value="">— sans correspondance</option>
                      {ues.map(u => (
                        <option key={u.ue_num} value={u.ue_num}>
                          {u.ue_num} — {(u.ue_nom || '').slice(0, 40)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
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
                <div className="font-semibold mb-1">Import terminé — {rapport.annee}</div>
                <ul className="text-[12px] space-y-0.5">
                  <li>{rapport.etudiants} étudiant(s) créé(s) ou mis à jour</li>
                  <li>{rapport.inscriptions} inscription(s) avec leur groupe</li>
                  {rapport.ignorees > 0 && <li>{rapport.ignorees} ligne(s) ignorée(s), faute de correspondance</li>}
                </ul>
              </div>
              <p className="text-[11px] text-slate-500">
                La signalétique complète le dossier sans écraser ce qui existait : seuls les
                champs vides de Lucie sont remplis.
              </p>
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

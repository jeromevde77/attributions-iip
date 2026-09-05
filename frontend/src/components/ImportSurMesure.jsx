import { useEffect, useState } from 'react';
import {
  IconUpload, IconX, IconCheck, IconAlertTriangle, IconDeviceFloppy,
  IconArrowRight, IconTrash,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Importateur sur mesure.
 *
 * À gauche le champ de Lucie qui REÇOIT, à droite la colonne du document qui
 * FOURNIT. Les imports existants devinent les en-têtes en dur et cassent dès
 * qu'un intitulé change ; ici on désigne soi-même, et le réglage s'enregistre
 * en profil pour ne pas être refait.
 */
export default function ImportSurMesure({ onClose, onTermine, annee = null }) {
  const [cibles, setCibles] = useState([]);
  const [cible, setCible] = useState(null);
  const [profils, setProfils] = useState([]);

  const [entetes, setEntetes] = useState(null);
  const [brut, setBrut] = useState(null);
  const [corresp, setCorresp] = useState({});   // champ Lucie → en-tête fichier
  const [cleChoisie, setCleChoisie] = useState('');

  const [ecraser, setEcraser] = useState(false);
  // La CRÉATION est fermée par défaut : compléter un dossier existant est
  // anodin, en créer un ne l'est pas.
  const [creer, setCreer] = useState(false);
  const [rapport, setRapport] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [nomProfil, setNomProfil] = useState('');
  // Ligne du fichier servant d'exemple. On juge une correspondance sur des
  // valeurs, pas sur des noms de colonnes : la première ligne peut être
  // atypique — champ vide, cas particulier — et donner faussement raison.
  const [ligne, setLigne] = useState(0);

  useEffect(() => {
    fetch('/api/import-sur-mesure/cibles', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => {
        if (!Array.isArray(l)) return;
        setCibles(l);
        if (l.length) { setCible(l[0]); setCleChoisie(l[0].cles[0]?.champ || ''); }
      }).catch(e => setErreur(e.message));
  }, []);

  useEffect(() => {
    if (!cible) return;
    fetch(`/api/import-sur-mesure/profils?cible=${cible.cle}`, { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setProfils(l); }).catch(() => {});
  }, [cible]);

  const reduire = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');

  async function lire(fichier) {
    setErreur(null); setRapport(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array', cellDates: true });
      const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
      if (!lignes.length) throw new Error('Ce classeur ne contient aucune ligne.');

      const cols = Object.keys(lignes[0]);
      setEntetes(cols); setBrut(lignes); setLigne(0);

      // Proposition de départ : on rapproche les noms réduits à leurs lettres,
      // accents transposés. Elle ne fait que dégrossir, tout reste corrigeable.
      const propose = {};
      for (const c of (cible?.champs || [])) {
        const cible2 = reduire(c.champ.replace(/_/g, ''));
        const t = cols.find(col => reduire(col) === cible2)
          || cols.find(col => reduire(col).includes(cible2) && cible2.length > 3);
        if (t && !Object.values(propose).includes(t)) propose[c.champ] = t;
      }
      setCorresp(propose);
    } catch (e) { setErreur(e.message); }
  }

  function appliquerProfil(p) {
    setCorresp(p.corresp || {});
    if (p.cle_choisie) setCleChoisie(p.cle_choisie);
    setRapport(null);
  }

  async function enregistrerProfil() {
    if (!nomProfil.trim()) { setErreur('Donnez un nom au profil.'); return; }
    const rep = await fetch('/api/import-sur-mesure/profils', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ nom: nomProfil.trim(), cible: cible.cle,
                             cle_choisie: cleChoisie, corresp }),
    });
    const j = await rep.json();
    if (!rep.ok) { setErreur(j.error); return; }
    setNomProfil('');
    fetch(`/api/import-sur-mesure/profils?cible=${cible.cle}`, { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setProfils(l); });
  }

  async function supprimerProfil(id) {
    await fetch(`/api/import-sur-mesure/profils/${id}`, {
      method: 'DELETE', headers: authHeaders() });
    setProfils(p => p.filter(x => x.id !== id));
  }

  function construire() {
    if (!corresp[cleChoisie]) {
      throw new Error("Indiquez la colonne qui identifie la ligne : sans elle, "
        + "l'import ne saurait pas quel dossier compléter.");
    }
    return brut.map(row => {
      const l = {};
      for (const [champ, col] of Object.entries(corresp)) {
        if (!col) continue;
        const v = row[col];
        if (v == null || String(v).trim() === '') continue;
        l[champ] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
      }
      return l;
    }).filter(l => l[cleChoisie]);
  }

  async function executer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const lignes = construire();
      if (!lignes.length) throw new Error('Aucune ligne ne porte la clé choisie.');
      const rep = await fetch('/api/import-sur-mesure/executer', {
        method: 'POST', headers: authHeaders(),
        // L'ANNÉE accompagne les cibles qui n'existent qu'au millésime — une
        // UE, un cours. Sans elle le serveur refuse, plutôt que d'écraser la
        // même unité dans toutes les années.
        body: JSON.stringify({ cible: cible.cle, cle_choisie: cleChoisie,
                               lignes, simulation, ecraser,
                               creer: cible.creation ? creer : undefined,
                               annee: cible.portee === 'annee' ? annee : undefined }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setRapport(j);
      if (!simulation) onTermine && onTermine();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  if (!cible) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-8 p-5 space-y-4
                      max-h-[88vh] overflow-y-auto">

        <div className="sticky top-0 z-20 bg-white -mx-5 px-5 -mt-5 pt-5 pb-3 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">Importateur sur mesure</h3>
            <p className="text-[12px] text-slate-500">
              Choisissez ce que vous alimentez, puis reliez chaque champ à sa colonne.
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {cible?.portee === 'annee' && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-sky-50 border border-sky-200
                            text-[12px] text-sky-900">
              Cette cible existe une fois par millésime : l'import portera sur
              l'année <b>{annee || '— non déterminée'}</b>.
              {!annee && " Fermez et choisissez d'abord une année de travail."}
            </div>
          )}
          {cibles.map(c => (
            <button key={c.cle}
              onClick={() => { setCible(c); setCleChoisie(c.cles[0]?.champ || '');
                               setCorresp({}); setRapport(null); }}
              className={`text-left px-3 py-2.5 rounded-xl border ${
                cible.cle === c.cle ? 'border-iip-blue bg-iip-blue/5'
                                    : 'border-slate-200 hover:bg-slate-50'}`}>
              <div className="text-[13px] font-semibold text-iip-blue">{c.libelle}</div>
              <div className="text-[11px] text-slate-500">{c.description}</div>
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 px-3 py-2 text-[12.5px] border
                          border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
          <IconUpload size={15} /> Choisir un classeur
          <input type="file" accept=".xls,.xlsx,.xlsm,.csv" className="hidden"
            onChange={e => e.target.files[0] && lire(e.target.files[0])} />
        </label>

        {profils.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              Profils
            </span>
            {profils.map(p => (
              <span key={p.id} className="inline-flex items-center gap-1 border
                                          border-slate-300 rounded-lg overflow-hidden">
                <button onClick={() => appliquerProfil(p)}
                  className="px-2.5 py-1 text-[12px] hover:bg-slate-50">{p.nom}</button>
                <button onClick={() => supprimerProfil(p.id)} title="Supprimer"
                  className="px-1.5 py-1 text-slate-300 hover:text-red-500">
                  <IconTrash size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {entetes && (
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div>
              <span className="text-[13px] font-semibold text-iip-blue">Correspondances</span>
              <p className="text-[11.5px] text-slate-500">
                {brut.length} ligne(s), {entetes.length} colonne(s). À gauche le champ de
                Lucie, à droite la colonne du document.
              </p>
            </div>

            <label className="block text-xs bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <span className="block font-semibold text-amber-900 mb-1">
                Colonne qui identifie la ligne
              </span>
              <select value={cleChoisie} onChange={e => setCleChoisie(e.target.value)}
                className="border border-amber-300 rounded-lg px-2 py-1 text-[12px] bg-white">
                {cible.cles.map(k => (
                  <option key={k.champ} value={k.champ}>{k.libelle}</option>
                ))}
              </select>
              <span className="block text-[10.5px] text-amber-800 mt-1">
                C'est elle qui retrouve le dossier à compléter. Le numéro national est le
                plus sûr : le matricule change à chaque rentrée.
              </span>
            </label>

            {/* La navigation entre lignes : une correspondance juste sur la
                première ligne peut être fausse sur la dixième. */}
            <div className="flex items-center justify-between gap-3 flex-wrap
                            px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[11.5px] text-slate-500">
                Exemple pris sur la ligne <b className="text-slate-700">{ligne + 1}</b> sur {brut.length}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setLigne(i => Math.max(0, i - 1))}
                  disabled={ligne === 0}
                  className="px-2 h-6 rounded border border-slate-300 text-slate-600
                             text-[12px] disabled:opacity-40">◀</button>
                <input type="number" min={1} max={brut.length} value={ligne + 1}
                  onChange={e => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setLigne(Math.min(brut.length, Math.max(1, v)) - 1);
                  }}
                  className="w-16 border border-slate-300 rounded px-1 py-0.5 text-[12px] text-center" />
                <button type="button" onClick={() => setLigne(i => Math.min(brut.length - 1, i + 1))}
                  disabled={ligne >= brut.length - 1}
                  className="px-2 h-6 rounded border border-slate-300 text-slate-600
                             text-[12px] disabled:opacity-40">▶</button>
              </div>
            </div>

            <div className="space-y-1">
              {cible.champs.map(ch => {
                const estCle = ch.champ === cleChoisie;
                return (
                  <div key={ch.champ} className="flex items-center gap-2 text-[12px]">
                    <span className={`w-44 flex-none ${estCle
                      ? 'font-semibold text-amber-800' : 'text-slate-600'}`}>
                      {ch.libelle}{estCle && ' ★'}
                    </span>
                    <IconArrowRight size={13} className="text-slate-300 flex-none" />
                    <select value={corresp[ch.champ] || ''}
                      onChange={e => setCorresp(m => ({ ...m, [ch.champ]: e.target.value || undefined }))}
                      className={`flex-1 border rounded-lg px-2 py-1 text-[12px] ${
                        estCle && !corresp[ch.champ]
                          ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}>
                      <option value="">— ne pas importer —</option>
                      {entetes.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                    {/* Ce que la colonne choisie DONNE sur cette ligne : c'est
                        cela qu'on vérifie, pas l'intitulé de la colonne. */}
                    <span className="w-40 flex-none truncate text-[11.5px]"
                      title={corresp[ch.champ]
                        ? String(brut[ligne]?.[corresp[ch.champ]] ?? '')
                        : ''}>
                      {corresp[ch.champ]
                        ? (() => {
                            const v = brut[ligne]?.[corresp[ch.champ]];
                            const vide = v == null || String(v).trim() === '';
                            return vide
                              ? <em className="text-slate-300">vide</em>
                              : <b className="text-slate-700">{String(v)}</b>;
                          })()
                        : <span className="text-slate-300">—</span>}
                    </span>
                  </div>
                );
              })}
            </div>

            {corresp[cleChoisie] && (
              <div className="text-[11.5px] text-slate-600 bg-slate-50 rounded-lg p-2.5">
                <b>Ligne {ligne + 1} telle qu'elle sera lue :</b>
                <div className="mt-1 space-y-0.5">
                  {cible.champs.filter(ch => corresp[ch.champ]).map(ch => (
                    <div key={ch.champ}>
                      <span className="text-slate-500">{ch.libelle} :</span>{' '}
                      <b>{String(brut[ligne]?.[corresp[ch.champ]] ?? '—')}</b>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cible.creation && (
              <label className="flex items-center gap-2 text-[12.5px] text-slate-700
                                px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                <input type="checkbox" checked={creer}
                  onChange={e => setCreer(e.target.checked)} />
                <span>
                  <b>Créer les lignes sans correspondance</b>
                  <span className="block text-[11px] text-amber-900">
                    Un dossier sera ouvert pour chaque ligne inconnue portant un
                    nom et un prénom. Simulez d'abord : une clé mal choisie crée
                    des doublons au lieu de compléter les dossiers existants.
                  </span>
                </span>
              </label>
            )}

            <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
              <input type="checkbox" checked={ecraser} onChange={e => setEcraser(e.target.checked)} />
              Écraser les valeurs déjà présentes
              <span className="text-[11px] text-slate-400">
                — par défaut, seuls les champs vides sont complétés
              </span>
            </label>

            <div className="flex gap-2 flex-wrap items-center">
              <button onClick={() => executer(true)} disabled={enCours || !corresp[cleChoisie]}
                className="px-4 py-2 text-sm bg-iip-blue text-white font-semibold rounded-lg
                           disabled:opacity-40">
                {enCours ? 'Analyse…' : 'Simuler'}
              </button>

              <span className="flex-1" />
              <input value={nomProfil} onChange={e => setNomProfil(e.target.value)}
                placeholder="Nom du profil"
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-[12px] w-40" />
              <button onClick={enregistrerProfil} disabled={!nomProfil.trim()}
                title="Enregistrer ces correspondances pour tout l'établissement"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] border
                           border-slate-300 text-slate-600 rounded-lg disabled:opacity-40">
                <IconDeviceFloppy size={14} /> Enregistrer
              </button>
            </div>
          </div>
        )}

        {rapport && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[['Lignes lues', rapport.lignes_lues], ['Retrouvés', rapport.retrouves],
                ['À compléter', rapport.nb_modifications],
                ...(rapport.nb_crees ? [['À créer', rapport.nb_crees]] : []),
                ['Sans correspondance', rapport.nb_inconnus]].map(([l, v]) => (
                <div key={l} className="border border-slate-200 rounded-xl px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500
                                  font-semibold">{l}</div>
                  <div className="text-[18px] font-bold text-iip-blue">{v}</div>
                </div>
              ))}
            </div>

            {Object.keys(rapport.champs || {}).length > 0 && (
              <div className="text-[12px] text-slate-600">
                Champs complétés :{' '}
                {Object.entries(rapport.champs).map(([k, n]) => `${k} (${n})`).join(', ')}
              </div>
            )}

            {rapport.nb_illisibles > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                              text-[12px] text-amber-900">
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <IconAlertTriangle size={14} /> {rapport.nb_illisibles} valeur(s) illisible(s)
                </div>
                Elles ne seront pas importées. Exemples : {rapport.illisibles.join(' · ')}
              </div>
            )}

            {rapport.nb_crees > 0 && (
              <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200
                              text-[12px] text-emerald-900">
                <b>{rapport.nb_crees} dossier(s)</b> {rapport.simulation ? 'seraient créés' : 'créés'} :
                {' '}{rapport.crees.slice(0, 12).map(c => c.libelle).join(' · ')}
                {rapport.nb_crees > 12 && ` … et ${rapport.nb_crees - 12} autre(s)`}
              </div>
            )}

            {rapport.nb_inconnus > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                              text-[12px] text-amber-900">
                {rapport.nb_inconnus} ligne(s) sans correspondance dans Lucie.
              </div>
            )}

            {rapport.simulation ? (
              <button onClick={() => executer(false)}
                disabled={enCours || !(rapport.nb_modifications || rapport.nb_crees)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-iip-blue text-white
                           font-semibold rounded-lg disabled:opacity-40">
                <IconCheck size={15} /> Appliquer à {rapport.nb_modifications} dossier(s)
              </button>
            ) : (
              <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200
                              text-[12.5px] text-emerald-800">
                {rapport.nb_modifications} dossier(s) complété(s).
              </div>
            )}

            {rapport.modifications.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl
                              divide-y divide-slate-100">
                {rapport.modifications.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
                    <span className="flex-1 truncate">{m.libelle}</span>
                    <span className="text-slate-500 flex-none">{m.champs.join(', ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

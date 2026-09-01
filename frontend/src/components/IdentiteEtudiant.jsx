import { useEffect, useState } from 'react';
import { IconDeviceFloppy, IconUpload, IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Tableau, TableauEntete, Th, Td, Tr, Badge } from './ui.jsx';

/**
 * Identité d'un étudiant, et complément de dossier par import.
 *
 * Rien ne permettait jusqu'ici de corriger une adresse ou d'ajouter un lieu de
 * naissance : on pouvait créer un étudiant, jamais le rectifier. Or ces données
 * figurent sur la fiche d'inscription et sur les attestations.
 *
 * L'import se rapproche par NUMÉRO NATIONAL, seul identifiant stable : eCampus
 * réattribue les matricules à chaque rentrée, et le nom seul ne distingue pas
 * deux homonymes.
 */
const CHAMPS = [
  { k: 'titre', l: 'Titre', type: 'select', options: ['', 'Monsieur', 'Madame'] },
  { k: 'nom', l: 'Nom', requis: true },
  { k: 'prenom', l: 'Prénom', requis: true },
  { k: 'date_naissance', l: 'Date de naissance', type: 'date' },
  { k: 'lieu_naissance', l: 'Lieu de naissance', aide: "Figure sur les attestations de réussite" },
  { k: 'nationalite', l: 'Nationalité', aide: "Exigée par l'annexe 2 (Office des Étrangers)" },
  { k: 'num_national', l: 'Numéro national', aide: "Sert au rapprochement des dossiers" },
  { k: 'id_ecampus', l: 'Matricule eCampus' },
  { k: 'adresse', l: 'Adresse' },
  { k: 'cp', l: 'Code postal' },
  { k: 'localite', l: 'Localité' },
  { k: 'gsm', l: 'Téléphone' },
  { k: 'email_ecole', l: 'Courriel école', type: 'email' },
  { k: 'email_perso', l: 'Courriel personnel', type: 'email' },
];

export default function IdentiteEtudiant({ etudId, onModifie }) {
  const [e, setE] = useState(null);
  const [modifs, setModifs] = useState({});
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    const rep = await fetch(`/api/etudiants/${etudId}`, { headers: authHeaders() });
    if (rep.ok) { setE(await rep.json()); setModifs({}); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId]);

  async function enregistrer() {
    if (!Object.keys(modifs).length) return;
    setEnCours(true);
    try {
      const rep = await fetch(`/api/etudiants/${etudId}`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify(modifs),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      setMessage({ type: 'ok', texte: `${j.modifies.length} champ(s) enregistré(s).` });
      await charger();
      onModifie && onModifie();
    } finally { setEnCours(false); }
  }

  if (!e) return <div className="py-8 text-center text-sm text-slate-400">Chargement…</div>;

  const val = k => (k in modifs ? modifs[k] : (e[k] ?? ''));
  const nbModifs = Object.keys(modifs).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-semibold text-iip-blue">Identité</h3>
          <p className="text-[12px] text-slate-500">
            Ces données figurent sur la fiche d'inscription et les attestations.
          </p>
        </div>
        <button onClick={enregistrer} disabled={!nbModifs || enCours}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-iip-blue text-white
                     font-semibold rounded-lg disabled:opacity-40">
          <IconDeviceFloppy size={15} />
          {enCours ? 'Enregistrement…' : nbModifs ? `Enregistrer (${nbModifs})` : 'Enregistrer'}
        </button>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-[12.5px] flex items-start justify-between gap-2 ${
          message.type === 'ok' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                                : 'bg-red-50 border border-red-200 text-red-800'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="opacity-60">✕</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CHAMPS.map(c => (
          <label key={c.k} className="text-xs block">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {c.l}{c.requis && <span className="text-red-500"> *</span>}
            </span>
            {c.type === 'select' ? (
              <select value={val(c.k)}
                onChange={ev => setModifs(m => ({ ...m, [c.k]: ev.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {c.options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
              </select>
            ) : (
              <input type={c.type || 'text'} value={val(c.k)}
                onChange={ev => setModifs(m => ({ ...m, [c.k]: ev.target.value }))}
                className={`w-full border rounded-lg px-2 py-1.5 text-sm
                  ${c.k in modifs ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`} />
            )}
            {c.aide && <span className="block text-[10px] text-slate-400 mt-0.5">{c.aide}</span>}
          </label>
        ))}
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
        <input type="checkbox" checked={val('actif') !== 0 && val('actif') !== false}
          onChange={ev => setModifs(m => ({ ...m, actif: ev.target.checked ? 1 : 0 }))} />
        Dossier actif
        <span className="text-[11px] text-slate-400">
          — un dossier inactif reste consultable mais sort des listes
        </span>
      </label>
    </div>
  );
}

/**
 * Complément de dossiers par import.
 *
 * Le rapprochement se fait sur le numéro national. Les valeurs déjà présentes
 * ne sont pas écrasées : une liste importée n'est pas plus fiable que ce qu'un
 * secrétariat a corrigé à la main.
 */
// Champs que l'import peut compléter, avec les en-têtes qu'on rencontre le
// plus souvent. La proposition n'est qu'un point de départ : la correspondance
// se corrige colonne par colonne, faute de quoi le moindre intitulé inattendu
// rendrait le classeur illisible.
const CHAMPS_IMPORT = [
  { k: 'num_national',   l: 'Numéro national', requis: true,
    motifs: ['national', 'niss', 'registre'] },
  { k: 'nom',            l: 'Nom',             motifs: ['nometud', 'nom'] },
  { k: 'prenom',         l: 'Prénom',          motifs: ['preetud', 'prenom'] },
  { k: 'titre',          l: 'Titre',           motifs: ['titremrmme', 'titre', 'civilite'] },
  { k: 'lieu_naissance', l: 'Lieu de naissance', motifs: ['lieunais', 'lieudenaissance'] },
  { k: 'nationalite',    l: 'Nationalité',      motifs: ['nationalite', 'nation'] },
  { k: 'date_naissance', l: 'Date de naissance', motifs: ['datnais', 'datenaissance', 'ddn'] },
  { k: 'adresse',        l: 'Adresse',         motifs: ['adrnbte', 'adresse', 'rue'] },
  { k: 'cp',             l: 'Code postal',     motifs: ['cp', 'codepostal'] },
  { k: 'localite',       l: 'Localité',        motifs: ['localite', 'commune', 'ville'] },
  { k: 'gsm',            l: 'Téléphone',       motifs: ['gsmetud', 'gsm', 'teletud', 'telephone'] },
  { k: 'email_perso',    l: 'Courriel personnel', motifs: ['emailperso', 'mailperso'] },
  { k: 'email_ecole',    l: 'Courriel école',  motifs: ['emailecole', 'mailecole'] },
  { k: 'id_ecampus',     l: 'Matricule',       motifs: ['idetud', 'matricule', 'idecampus'] },
];

// Les mois écrits en toutes lettres : les listes eCampus datent ainsi
// (« 5 mars 2005 »), et c'est la forme la plus courante dans les exports.
const MOIS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  jan: 1, fev: 2, mar: 3, avr: 4, jui: 6, juil: 7, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Une date arrive sous quatre formes : objet, numéro de série Excel, texte
 * numérique, ou texte en toutes lettres. La dernière échappait à l'analyse, et
 * aucune date n'était importée.
 */
function versDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);

  // Numéro de série Excel, compté depuis le 30 décembre 1899.
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }

  const s = String(v).trim();

  // Déjà au format ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // 5/3/2005, 05-03-2005, 5.3.05
  const num = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2,4})$/.exec(s);
  if (num) {
    const a = num[3].length === 2 ? (Number(num[3]) > 30 ? '19' : '20') + num[3] : num[3];
    return `${a}-${num[2].padStart(2, '0')}-${num[1].padStart(2, '0')}`;
  }

  // « 5 mars 2005 », « 1er septembre 1987 »
  const lettres = /^(\d{1,2})\s*(?:er)?\s+([a-zéûôùî]+)\s+(\d{4})$/i.exec(s);
  if (lettres) {
    const mois = MOIS[lettres[2].toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
    if (mois) {
      return `${lettres[3]}-${String(mois).padStart(2, '0')}-${lettres[1].padStart(2, '0')}`;
    }
  }

  return null;   // illisible : mieux vaut rien qu'une date fausse
}


export function ComplementDossiers({ onTermine }) {
  const [entetes, setEntetes] = useState(null);     // colonnes du classeur
  const [brut, setBrut] = useState(null);           // lignes telles que lues
  const [corresp, setCorresp] = useState({});       // champ Lucie → en-tête
  const [rapport, setRapport] = useState(null);
  const [ecraser, setEcraser] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [avertissement, setAvertissement] = useState(null);

  async function lire(fichier) {
    setErreur(null); setRapport(null); setEntetes(null); setBrut(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array', cellDates: true });
      const lignes = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
      if (!lignes.length) throw new Error('Ce classeur ne contient aucune ligne.');

      const cols = Object.keys(lignes[0]);
      setEntetes(cols);
      setBrut(lignes);

      // Proposition : on cherche l'en-tête dont le nom, réduit à ses lettres,
      // contient l'un des motifs connus. Le premier motif prime, ce qui évite
      // que « Email Ecole » soit pris pour le courriel personnel.
      // Les accents se TRANSPOSENT, ils ne se suppriment pas : « PréEtud »
      // devenait « pretud » et « Localité » « localit », si bien que les deux
      // colonnes échappaient à la reconnaissance.
      const reduire = s => String(s)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z]/g, '');

      const propose = {};
      for (const ch of CHAMPS_IMPORT) {
        for (const motif of ch.motifs) {
          const trouve = cols.find(col => {
            const n = reduire(col);
            return n === motif || n.startsWith(motif);
          }) || cols.find(col => reduire(col).includes(motif));
          if (trouve && !Object.values(propose).includes(trouve)) {
            propose[ch.k] = trouve;
            break;
          }
        }
      }
      setCorresp(propose);
    } catch (e) { setErreur(e.message); }
  }

  function construire() {
    // Les dates qu'on n'a pas su lire : les taire reviendrait à laisser croire
    // qu'elles ont été importées.
    const illisibles = [];
    const colRN = corresp.num_national;
    if (!colRN) throw new Error("Indiquez la colonne du numéro national : c'est elle qui "
      + "rapproche les dossiers.");
    const lignes = brut.map(r => {
      const l = { num_national: r[colRN] };
      for (const ch of CHAMPS_IMPORT) {
        if (ch.k === 'num_national') continue;
        const col = corresp[ch.k];
        if (!col) continue;
        const v = r[col];
        if (v == null || String(v).trim() === '') continue;
        if (ch.k === 'date_naissance') {
          const d = versDate(v);
          if (d) l[ch.k] = d; else illisibles.push(String(v));
        } else {
          l[ch.k] = String(v).trim();
        }
      }
      return l;
    }).filter(x => x.num_national);

    if (illisibles.length) {
      setAvertissement(`${illisibles.length} date(s) de naissance illisible(s) — elles ne seront `
        + `pas importées. Exemples : ${[...new Set(illisibles)].slice(0, 3).join(', ')}.`);
    } else setAvertissement(null);

    return lignes;
  }

  async function envoyer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const lignes = construire();
      if (!lignes.length) throw new Error('Aucune ligne ne porte de numéro national.');
      const rep = await fetch('/api/etudiants/completer', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          lignes: lignes.map(x => (ecraser ? { ...x, __ecraser: true } : x)),
          simulation,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setRapport(j);
      if (!simulation) onTermine && onTermine();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold text-iip-blue">Compléter les dossiers</h3>
        <p className="text-[12px] text-slate-500">
          Le rapprochement se fait sur le numéro national — le matricule change à chaque rentrée.
        </p>
      </div>

      <label className="inline-flex items-center gap-2 px-3 py-2 text-[12.5px] border
                        border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
        <IconUpload size={15} /> Choisir un classeur
        <input type="file" accept=".xls,.xlsx,.xlsm,.csv" className="hidden"
          onChange={ev => ev.target.files[0] && lire(ev.target.files[0])} />
      </label>

      {avertissement && (
        <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900">
          {avertissement}
        </div>
      )}

      {erreur && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12.5px] text-red-800">
          {erreur}
        </div>
      )}

      {/* Correspondance des colonnes — corrigeable, car aucun jeu d'en-têtes
          ne se répète d'une liste à l'autre. */}
      {entetes && (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3">
          <div>
            <span className="text-[13px] font-semibold text-iip-blue">Correspondance des colonnes</span>
            <p className="text-[11.5px] text-slate-500">
              {brut.length} ligne(s), {entetes.length} colonne(s). Vérifiez les correspondances
              proposées et corrigez celles qui ne conviennent pas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {CHAMPS_IMPORT.map(ch => (
              <label key={ch.k} className="flex items-center gap-2 text-[12px]">
                <span className={`w-40 flex-none ${ch.requis ? 'font-semibold text-iip-blue' : 'text-slate-600'}`}>
                  {ch.l}{ch.requis && ' *'}
                </span>
                <select value={corresp[ch.k] || ''}
                  onChange={ev => setCorresp(m => ({ ...m, [ch.k]: ev.target.value || undefined }))}
                  className={`flex-1 border rounded-lg px-2 py-1 text-[12px]
                    ${ch.requis && !corresp[ch.k] ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}>
                  <option value="">— ne pas importer —</option>
                  {entetes.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </label>
            ))}
          </div>

          {/* Un aperçu vaut mieux qu'une promesse : on montre ce qui sera lu. */}
          {corresp.num_national && (
            <div className="text-[11.5px] text-slate-600 bg-slate-50 rounded-lg p-2.5">
              <b>Première ligne telle qu'elle sera lue :</b>
              <div className="mt-1 space-y-0.5">
                {CHAMPS_IMPORT.filter(ch => corresp[ch.k]).map(ch => {
                  const v = brut[0][corresp[ch.k]];
                  const lu = ch.k === 'date_naissance' ? versDate(v) : (v ?? '—');
                  return (
                    <div key={ch.k}>
                      <span className="text-slate-500">{ch.l} :</span>{' '}
                      <b>{String(lu ?? '—')}</b>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
            <input type="checkbox" checked={ecraser} onChange={ev => setEcraser(ev.target.checked)} />
            Écraser les valeurs déjà présentes
            <span className="text-[11px] text-slate-400">
              — par défaut, seuls les champs vides sont complétés
            </span>
          </label>

          <button onClick={() => envoyer(true)} disabled={enCours || !corresp.num_national}
            className="px-4 py-2 text-sm bg-iip-blue text-white font-semibold rounded-lg
                       disabled:opacity-40">
            {enCours ? 'Analyse…' : 'Simuler'}
          </button>
        </div>
      )}

      {rapport && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Lignes lues', rapport.lignes_lues], ['Retrouvés', rapport.retrouves],
              ['À compléter', rapport.modifications.length],
              ['Inconnus', rapport.nb_inconnus]].map(([l, v]) => (
              <div key={l} className="border border-slate-200 rounded-xl px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{l}</div>
                <div className="text-[18px] font-bold text-iip-blue">{v}</div>
              </div>
            ))}
          </div>

          {Object.keys(rapport.champs || {}).length > 0 && (
            <div className="text-[12px] text-slate-600">
              Champs qui seraient complétés :{' '}
              {Object.entries(rapport.champs).map(([k, n]) => `${k} (${n})`).join(', ')}
            </div>
          )}

          {rapport.nb_inconnus > 0 && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-900">
              <div className="flex items-center gap-1.5 font-semibold mb-1">
                <IconAlertTriangle size={14} /> {rapport.nb_inconnus} numéro(s) sans correspondance
              </div>
              Ces personnes ne figurent pas dans Lucie, ou leur numéro national n'y est pas encodé.
              {rapport.inconnus.length > 0 && (
                <div className="mt-1 text-[11px]">
                  {rapport.inconnus.slice(0, 8).map(i => i.nom || i.num_national).join(' · ')}
                  {rapport.nb_inconnus > 8 && ` … et ${rapport.nb_inconnus - 8} autre(s)`}
                </div>
              )}
            </div>
          )}

          {rapport.simulation ? (
            <button onClick={() => envoyer(false)}
              disabled={enCours || !rapport.modifications.length}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-iip-blue text-white
                         font-semibold rounded-lg disabled:opacity-40">
              <IconCheck size={15} /> Appliquer à {rapport.modifications.length} dossier(s)
            </button>
          ) : (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200
                            text-[12.5px] text-emerald-800">
              {rapport.modifications.length} dossier(s) complété(s).
            </div>
          )}

          {rapport.modifications.length > 0 && (
            <Tableau dense>
              <TableauEntete>
                <Th>Étudiant</Th>
                <Th>Champs complétés</Th>
              </TableauEntete>
              <tbody>
                {rapport.modifications.slice(0, 40).map(m => (
                  <Tr key={m.id}>
                    <Td>{m.nom} {m.prenom}</Td>
                    <Td ton="secondaire">
                      {m.champs.map(ch => <Badge key={ch} ton="info" className="mr-1">{ch}</Badge>)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tableau>
          )}
        </div>
      )}
    </div>
  );
}

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
export function ComplementDossiers({ onTermine }) {
  const [rapport, setRapport] = useState(null);
  const [lignes, setLignes] = useState(null);
  const [ecraser, setEcraser] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  async function lire(fichier) {
    setErreur(null); setRapport(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await fichier.arrayBuffer(), { type: 'array' });
      const feuille = wb.Sheets[wb.SheetNames[0]];
      const brut = XLSX.utils.sheet_to_json(feuille, { defval: null });
      if (!brut.length) throw new Error('Le classeur est vide.');

      // Correspondance souple des en-têtes : les listes officielles ne les
      // nomment pas toutes de la même façon.
      const cle = (obj, ...motifs) => {
        for (const k of Object.keys(obj)) {
          const n = k.toLowerCase().replace(/[^a-z]/g, '');
          if (motifs.some(m => n.includes(m))) return obj[k];
        }
        return null;
      };

      const l = brut.map(r => ({
        num_national: cle(r, 'national', 'niss', 'registre'),
        nom: cle(r, 'nom'),
        lieu_naissance: cle(r, 'lieunaissance', 'lieudenaissance', 'nea'),
        date_naissance: (() => {
          const v = cle(r, 'datenaissance', 'datedenaissance', 'ddn');
          if (!v) return null;
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          const s = String(v).trim();
          const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
          return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s.slice(0, 10);
        })(),
        adresse: cle(r, 'adresse', 'rue'),
        cp: cle(r, 'codepostal', 'cp'),
        localite: cle(r, 'localite', 'commune', 'ville'),
        gsm: cle(r, 'gsm', 'telephone', 'tel', 'portable'),
        email_perso: cle(r, 'emailperso', 'mailperso', 'courrielperso'),
        titre: cle(r, 'titre', 'civilite', 'sexe'),
        id_ecampus: cle(r, 'matricule', 'idetud', 'idecampus'),
      })).filter(x => x.num_national);

      if (!l.length) {
        throw new Error("Aucun numéro national trouvé. La colonne doit s'intituler "
          + "« Numéro national », « NISS » ou « Registre national ».");
      }
      setLignes(l);
      await envoyer(l, true);
    } catch (e) { setErreur(e.message); }
  }

  async function envoyer(l, simulation) {
    setEnCours(true);
    try {
      const rep = await fetch('/api/etudiants/completer', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          lignes: l.map(x => (ecraser ? { ...x, __ecraser: true } : x)),
          simulation,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setRapport(j);
      if (!simulation) { onTermine && onTermine(); }
    } finally { setEnCours(false); }
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
        <input type="file" accept=".xlsx,.xlsm,.csv" className="hidden"
          onChange={ev => ev.target.files[0] && lire(ev.target.files[0])} />
      </label>

      <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
        <input type="checkbox" checked={ecraser} onChange={ev => setEcraser(ev.target.checked)} />
        Écraser les valeurs déjà présentes
        <span className="text-[11px] text-slate-400">
          — par défaut, seuls les champs vides sont complétés
        </span>
      </label>

      {erreur && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12.5px] text-red-800">
          {erreur}
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
            <button onClick={() => envoyer(lignes, false)}
              disabled={enCours || !rapport.modifications.length}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-iip-blue text-white
                         font-semibold rounded-lg disabled:opacity-40">
              <IconCheck size={15} />
              Appliquer à {rapport.modifications.length} dossier(s)
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

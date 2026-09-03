import { useEffect, useMemo, useState } from 'react';
import { IconX, IconDeviceFloppy, IconSearch, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Encodage direct des notes d'UE.
 *
 * La matrice ne retient que le résultat — réussi, ajourné, absent. Ici on
 * saisit la NOTE, dont le résultat se déduit au seuil de 10/20 (RDE, art. 44).
 * L'année se choisit librement, pour rattraper un millésime antérieur sans
 * changer d'écran.
 */
export default function EncodageDirect({ onClose, anneeDefaut, sectionDefaut }) {
  const [annees, setAnnees] = useState([]);
  const [sections, setSections] = useState([]);
  const [annee, setAnnee] = useState(anneeDefaut || '');
  const [section, setSection] = useState(sectionDefaut || '');
  const [ueFiltre, setUeFiltre] = useState('');

  const [donnees, setDonnees] = useState(null);
  const [saisies, setSaisies] = useState({});   // "etud|ue" → note
  const [recherche, setRecherche] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json()).then(l => {
        if (!Array.isArray(l)) return;
        const codes = l.map(a => a.code || a).filter(Boolean);
        setAnnees(codes);
        if (!annee && codes.length) setAnnee(codes[codes.length - 1]);
      }).catch(() => {});
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  async function charger() {
    if (!annee || !section) return;
    setEnCours(true); setMessage(null);
    try {
      const qs = new URLSearchParams({ annee, section });
      if (ueFiltre) qs.set('ue_num', ueFiltre);
      const rep = await fetch(`/api/etudiants/encodage-direct?${qs}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); setDonnees(null); return; }
      setDonnees(j); setSaisies({});
    } finally { setEnCours(false); }
  }

  useEffect(() => { if (annee && section) charger(); /* eslint-disable-next-line */ },
    [annee, section, ueFiltre]);

  // Les UE affichées : celle qu'on filtre, ou toutes.
  const uesVues = useMemo(() => {
    if (!donnees) return [];
    return ueFiltre ? donnees.ues.filter(u => String(u.ue_num) === String(ueFiltre)) : donnees.ues;
  }, [donnees, ueFiltre]);

  const etudiantsVus = useMemo(() => {
    if (!donnees) return [];
    const q = recherche.trim().toLowerCase();
    if (!q) return donnees.etudiants;
    return donnees.etudiants.filter(e =>
      `${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase().includes(q));
  }, [donnees, recherche]);

  const nbSaisies = Object.values(saisies).filter(v => v !== '' && v != null).length;

  async function enregistrer() {
    const entrees = Object.entries(saisies)
      .filter(([, v]) => v !== '' && v != null)
      .map(([cle, points]) => {
        const [etudiant_id, ue_num] = cle.split('|');
        return { etudiant_id: Number(etudiant_id), ue_num: Number(ue_num), points };
      });
    if (!entrees.length) return;

    setEnCours(true); setMessage(null);
    try {
      const rep = await fetch('/api/etudiants/encodage-direct', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, entrees }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      setMessage({
        type: j.nb_refuses ? 'alerte' : 'ok',
        texte: j.nb_refuses
          ? `${j.enregistres} note(s) enregistrée(s). ${j.nb_refuses} refusée(s) : `
            + `une note doit être comprise entre 0 et 20.`
          : `${j.enregistres} note(s) enregistrée(s).`,
      });
      await charger();
    } finally { setEnCours(false); }
  }

  const valeur = (etudId, ueNum) => {
    const cle = `${etudId}|${ueNum}`;
    if (cle in saisies) return saisies[cle];
    const d = donnees?.existant?.[cle];
    return d?.points != null ? String(d.points) : '';
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mt-8 p-5 space-y-4
                      max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">Encodage direct</h3>
            <p className="text-[12px] text-slate-500">
              Saisissez la note sur 20 ; le résultat en découle au seuil de 10.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        {message && (
          <div className={`px-3 py-2 rounded-lg text-[12.5px] ${
            message.type === 'err' ? 'bg-red-50 border border-red-200 text-red-800'
            : message.type === 'alerte' ? 'bg-amber-50 border border-amber-200 text-amber-900'
            : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
            {message.texte}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Année <span className="text-red-500">*</span>
            </span>
            <select value={annee} onChange={e => setAnnee(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="">—</option>
              {annees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Section <span className="text-red-500">*</span>
            </span>
            <select value={section} onChange={e => { setSection(e.target.value); setUeFiltre(''); }}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="">—</option>
              {sections.map(s => (
                <option key={s.code} value={s.code}>{s.libelle || s.code}</option>
              ))}
            </select>
          </label>

          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Unité
            </span>
            <select value={ueFiltre} onChange={e => setUeFiltre(e.target.value)}
              disabled={!donnees}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="">Toutes</option>
              {(donnees?.ues || []).map(u => (
                <option key={u.ue_num} value={u.ue_num}>{u.ue_num} — {u.ue_nom}</option>
              ))}
            </select>
          </label>

          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Étudiant
            </span>
            <div className="relative">
              <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={recherche} onChange={e => setRecherche(e.target.value)}
                placeholder="Filtrer…"
                className="w-full border border-slate-300 rounded-lg pl-8 pr-2 py-1.5 text-sm" />
            </div>
          </label>
        </div>

        {!donnees ? (
          <div className="py-10 text-center text-[12.5px] text-slate-400">
            {enCours ? 'Chargement…' : 'Choisissez une année et une section.'}
          </div>
        ) : !etudiantsVus.length ? (
          <div className="py-10 text-center text-[12.5px] text-slate-400 border-2 border-dashed rounded-xl">
            Aucun étudiant inscrit dans cette section pour {annee}.
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-[12px] border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr>
                    <th className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide
                                   text-slate-500 font-semibold border-b border-slate-200
                                   sticky left-0 bg-slate-50">Étudiant</th>
                    {uesVues.map(u => (
                      <th key={u.ue_num} title={u.ue_nom}
                        className="px-1 py-1.5 border-b border-slate-200 min-w-[52px]">
                        <div className="text-[11px] font-bold text-iip-blue">{u.ue_num}</div>
                        <div className="text-[9px] text-slate-400 truncate max-w-[70px]">
                          {u.ue_nom}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {etudiantsVus.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="px-2 py-1 border-b border-slate-100 whitespace-nowrap
                                     sticky left-0 bg-white">
                        <span className="font-medium text-slate-700">{e.nom}</span>{' '}
                        <span className="text-slate-500">{e.prenom}</span>
                      </td>
                      {uesVues.map(u => {
                        const cle = `${e.id}|${u.ue_num}`;
                        const v = valeur(e.id, u.ue_num);
                        const modifie = cle in saisies;
                        const n = v === '' ? null : Number(String(v).replace(',', '.'));
                        const d = donnees?.existant?.[cle];
                        const va = d?.resultat === 'va';
                        return (
                          <td key={u.ue_num}
                            className="px-0.5 py-1 border-b border-slate-100 text-center">
                            <input value={v} inputMode="decimal"
                              onChange={ev => setSaisies(s => ({ ...s, [cle]: ev.target.value }))}
                              title={va
                                ? `Valorisation${d.conflit
                                    ? ` — attention, un résultat « ${d.conflit} » est aussi encodé`
                                    : ''}`
                                : undefined}
                              className={`w-11 text-center border rounded px-1 py-0.5 text-[12px]
                                ${modifie ? 'border-amber-400 bg-amber-50'
                                  // La valorisation se distingue : la grille de
                                  // parcours l'affiche, cet écran l'ignorait.
                                  : d?.conflit ? 'border-red-400 bg-red-100 font-semibold'
                                  : va ? 'border-iip-turquoise bg-iip-turquoise/10'
                                  : n == null ? 'border-slate-200'
                                  : n >= 10 ? 'border-emerald-200 bg-emerald-50/50'
                                            : 'border-red-200 bg-red-50/50'}`} />
                            {va && (
                              <div className="text-[8px] leading-none mt-0.5 text-iip-turquoise
                                              font-semibold">
                                {d.conflit ? '⚠ VA' : 'VA'}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[11px] text-iip-turquoise flex items-center gap-1.5">
                VA = valorisation · ⚠ VA = valorisation ET résultat encodé, à trancher
              </span>
              <span className="text-[11.5px] text-slate-500 flex items-center gap-1.5">
                <IconAlertTriangle size={13} />
                {etudiantsVus.length} étudiant(s) · {uesVues.length} unité(s).
                Une note sous 10 vaut ajournement.
              </span>
              <button onClick={enregistrer} disabled={!nbSaisies || enCours}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-iip-blue text-white
                           font-semibold rounded-lg disabled:opacity-40">
                <IconDeviceFloppy size={15} />
                {enCours ? 'Enregistrement…'
                  : nbSaisies ? `Enregistrer ${nbSaisies} note(s)` : 'Enregistrer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

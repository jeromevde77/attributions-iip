import { useEffect, useMemo, useState } from 'react';
import { IconX, IconSearch, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Feuille de délibération d'une unité.
 *
 * L'encodage rapide présente les UNITÉS en colonnes ; cette feuille présente
 * les ACQUIS d'une seule unité, pour tous ses étudiants. C'est la vue du
 * Conseil des études au moment de délibérer : on voit qui maîtrise quoi.
 *
 * La note d'unité se CALCULE des acquis, pondérés quand la pondération est
 * connue. Elle reste indicative : c'est le Conseil qui décide, pas la moyenne.
 */
export default function FeuilleDeliberation({ ueNum, annee, onClose }) {
  const [data, setData] = useState(null);
  const [session, setSession] = useState(1);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enAttente, setEnAttente] = useState(0);

  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [ueNum, annee]);

  async function charger() {
    setErreur(null);
    const rep = await fetch(
      `/api/acquis/feuille/${ueNum}?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() });
    const j = await rep.json();
    if (!rep.ok) { setErreur(j.error); return; }
    setData(j);
  }

  /** La note d'un acquis, pour la session affichée. */
  const noteDe = (e, aa) => e.notes?.[`s${session}`]?.[aa] ?? null;

  async function poser(e, aa, valeur) {
    const brut = String(valeur).trim();
    const n = brut === '' ? null : Number(brut.replace(',', '.'));
    if (brut !== '' && (!Number.isFinite(n) || n < 0 || n > 20)) return;

    // L'écran se met à jour d'abord : attendre le serveur rendrait la saisie
    // saccadée sur une feuille de cent étudiants.
    setData(d => ({
      ...d,
      etudiants: d.etudiants.map(x => x.id !== e.id ? x : {
        ...x,
        notes: { ...x.notes,
          [`s${session}`]: { ...(x.notes?.[`s${session}`] || {}),
            ...(brut === '' ? {} : { [aa]: n }) } },
      }),
    }));

    setEnAttente(v => v + 1);
    try {
      const rep = await fetch('/api/acquis/feuille/note', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: e.id, annee_scolaire: annee, ue_num: ueNum,
          aa_code: aa, session, points: brut === '' ? null : n,
        }),
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        setErreur(j.error || "La note n'a pas été enregistrée.");
      }
    } finally { setEnAttente(v => v - 1); }
  }

  /** La note d'unité, pondérée si les poids sont connus. */
  function noteUE(e) {
    if (!data?.acquis?.length) return null;
    let somme = 0, poids = 0;
    for (const a of data.acquis) {
      const n = noteDe(e, a.aa_code);
      if (n == null) continue;
      const p = a.poids ?? 1;
      somme += n * p; poids += p;
    }
    return poids ? Math.round((somme / poids) * 10) / 10 : null;
  }

  const affiches = useMemo(() => {
    if (!data) return [];
    const q = recherche.trim().toLowerCase();
    if (!q) return data.etudiants;
    return data.etudiants.filter(e =>
      `${e.nom} ${e.prenom} ${e.matricule || ''}`.toLowerCase().includes(q));
  }, [data, recherche]);

  if (!data) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-6 mt-20 text-[13px] text-slate-500">
          {erreur || 'Chargement…'}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-3"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] mt-4 p-4
                      space-y-3 max-h-[94vh] overflow-hidden flex flex-col">

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue">
              UE {data.ue_num} · {data.ue_nom}
            </h3>
            <p className="text-[12px] text-slate-500">
              {data.etudiants.length} étudiant(s) · {data.acquis.length} acquis ·
              {' '}{data.section || '—'} · {annee}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border border-slate-300 rounded-lg p-0.5">
              {[1, 2].map(s => (
                <button key={s} onClick={() => setSession(s)}
                  className={`px-2.5 py-1 text-[12px] rounded-md font-semibold ${
                    session === s ? 'bg-iip-blue text-white'
                                  : 'text-slate-600 hover:bg-slate-100'}`}>
                  Session {s}
                </button>
              ))}
            </div>
            <div className="relative">
              <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2
                                               text-slate-400" />
              <input value={recherche} onChange={e => setRecherche(e.target.value)}
                placeholder="Filtrer…"
                className="border border-slate-300 rounded-lg pl-8 pr-2 py-1 text-[12px] w-36" />
            </div>
            <span className="text-[11px] text-slate-400 w-16">
              {enAttente > 0 ? 'Enregistrement…' : ''}
            </span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <IconX size={18} />
            </button>
          </div>
        </div>

        {erreur && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                          text-[12.5px] text-red-800 flex items-center gap-2">
            <IconAlertTriangle size={14} /> {erreur}
          </div>
        )}

        {!data.acquis.length ? (
          <div className="py-8 text-center text-[12.5px] text-slate-400 border-2
                          border-dashed rounded-xl">
            Aucun acquis d'apprentissage au référentiel de cette unité.
          </div>
        ) : (
          <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
            <table className="text-[12px] border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr>
                  <th className="sticky left-0 bg-white z-20 text-left px-3 py-2
                                 border-b border-r border-slate-200 min-w-[190px]">
                    Étudiant
                  </th>
                  {data.acquis.map(a => (
                    <th key={a.aa_code} title={`${a.description || ''}\n${a.cours_nom || ''}`}
                      className="px-1 py-2 border-b border-slate-200 w-14 align-bottom">
                      <div className="text-[10.5px] font-bold text-iip-blue">{a.aa_code}</div>
                      {a.poids != null && (
                        <div className="text-[8px] text-slate-400">{a.poids}%</div>
                      )}
                    </th>
                  ))}
                  <th className="px-2 py-2 border-b border-l border-slate-200 w-16
                                 text-iip-blue">Note</th>
                </tr>
              </thead>
              <tbody>
                {affiches.map(e => {
                  const nUE = noteUE(e);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60">
                      <td className="sticky left-0 bg-white hover:bg-slate-50/60 z-10
                                     px-3 py-1 border-b border-r border-slate-100">
                        <div className="font-semibold text-iip-blue truncate">{e.nom}</div>
                        <div className="text-[10.5px] text-slate-500 truncate">
                          {e.prenom}
                          {e[`resultat_s${session}`] && (
                            <span className="ml-1.5 text-slate-400">
                              · {e[`resultat_s${session}`]}
                            </span>
                          )}
                        </div>
                      </td>
                      {data.acquis.map(a => {
                        const n = noteDe(e, a.aa_code);
                        return (
                          <td key={a.aa_code} className="border-b border-slate-100 p-0.5">
                            <input type="number" min="0" max="20" step="0.5"
                              value={n ?? ''}
                              onChange={ev => poser(e, a.aa_code, ev.target.value)}
                              className={`w-12 h-8 text-center rounded border text-[12px]
                                ${n == null ? 'border-slate-200 text-slate-400'
                                  : n < 10 ? 'border-amber-300 bg-amber-50 text-amber-800'
                                  : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`} />
                          </td>
                        );
                      })}
                      <td className="border-b border-l border-slate-100 px-2 text-right
                                     font-bold">
                        <span className={nUE == null ? 'text-slate-300'
                          : nUE < 10 ? 'text-amber-700' : 'text-emerald-700'}>
                          {nUE ?? '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-slate-500">
          La note d'unité est calculée des acquis, pondérée quand la pondération
          est connue. Elle est indicative : la décision appartient au Conseil.
        </p>
      </div>
    </div>
  );
}

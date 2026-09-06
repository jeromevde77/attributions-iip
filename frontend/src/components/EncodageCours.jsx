import { useEffect, useState } from 'react';
import { IconX, IconAlertTriangle, IconSearch } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Saisie des notes D'UN COURS — l'écran du professeur.
 *
 * La feuille de délibération présente les acquis d'une unité, consolidés :
 * c'est la vue du Conseil, celle qui sert à décider. Le professeur, lui, ne
 * connaît que SON cours et les acquis qu'il y évalue. Lui faire saisir dans la
 * grille de l'unité, c'était lui montrer les acquis de ses collègues et le
 * mettre en position d'écraser leurs notes.
 *
 * La note part sous « cours|acquis » : un acquis évalué dans deux cours a donc
 * deux notes, et chaque cours a la sienne. C'est ce que la délibération
 * consolide ensuite.
 */
const SEUIL = 10;

const tonNote = n => n == null || n === '' ? 'border-slate-300'
  : Number(n) >= 14 ? 'border-emerald-300 bg-emerald-50'
  : Number(n) >= SEUIL ? 'border-sky-300 bg-sky-50'
  : 'border-amber-300 bg-amber-50';

export default function EncodageCours({ coursCode, annee, onClose, onEnregistre, onParametrer }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [session, setSession] = useState(1);
  const [recherche, setRecherche] = useState('');
  const [enAttente, setEnAttente] = useState(0);

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(
        `/api/acquis/cours/${encodeURIComponent(coursCode)}/feuille`
        + `?annee=${encodeURIComponent(annee)}&session=${session}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setData(j);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [coursCode, annee, session]);

  // Chaque note part SEULE, dès la sortie du champ : une saisie de délibération
  // s'interrompt — un appel, une question — et un enregistrement global perdrait
  // tout ce qui n'a pas été validé.
  async function poser(etudId, aaCode, valeur) {
    const v = valeur === '' ? null : Number(String(valeur).replace(',', '.'));
    if (v != null && (!Number.isFinite(v) || v < 0 || v > 20)) {
      setErreur('Note attendue entre 0 et 20.');
      return;
    }
    setData(d => ({ ...d, notes: { ...d.notes,
      [etudId]: { ...(d.notes[etudId] || {}), [aaCode]: v } } }));
    setEnAttente(n => n + 1);
    try {
      const rep = await fetch('/api/acquis/feuille/note', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({
          etudiant_id: etudId, annee_scolaire: annee, ue_num: data.cours.ue_num,
          cours_code: coursCode, aa_code: aaCode, session, points: v,
        }),
      });
      if (!rep.ok) {
        const j = await rep.json().catch(() => ({}));
        setErreur(j.error || 'Enregistrement refusé.');
        await charger();
      } else { setErreur(null); onEnregistre && onEnregistre(); }
    } catch (e) { setErreur(e.message); }
    finally { setEnAttente(n => n - 1); }
  }

  const fermer = () => onClose();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && fermer()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mt-8
                      max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex-none p-5 pb-3 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">
              {data ? `${data.cours.cours_code} · ${data.cours.cours_nom || ''}` : coursCode}
            </h3>
            <p className="text-[12px] text-slate-500">
              {data && `UE ${data.cours.ue_num} · ${data.etudiants.length} étudiant(s) · `}
              {data && `${data.acquis.length} acquis · `}{annee}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {enAttente > 0 && <span className="text-[11.5px] text-slate-400">enregistrement…</span>}
            <div className="flex rounded-lg border border-slate-300 overflow-hidden">
              {[1, 2].map(s => (
                <button key={s} onClick={() => setSession(s)}
                  className={`px-3 py-1 text-[12px] font-semibold ${session === s
                    ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>
                  Session {s}
                </button>
              ))}
            </div>
            <button onClick={fermer} className="text-slate-400 hover:text-slate-600">
              <IconX size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12.5px] text-red-800">{erreur}</div>
          )}

          {!data ? (
            <div className="py-8 text-center text-slate-400 text-sm">Chargement…</div>
          ) : data.sans_acquis ? (
            /* Le cas de vos UE actuelles : sans lien cours↔acquis, il n'y a
               rien à saisir, et le dire vaut mieux qu'une grille vide. */
            <div className="px-4 py-6 rounded-xl bg-amber-50 border border-amber-200
                            text-[13px] text-amber-900 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <IconAlertTriangle size={16} /> Aucun acquis rattaché à ce cours
              </div>
              <p>
                La saisie par cours suppose de savoir quels acquis ce cours évalue.
                Ce lien se pose au paramétrage de l'unité, ou s'importe du classeur
                de suivi, onglet <b>Repartition_AA_UE</b>.
              </p>
              {onParametrer && (
                <button onClick={() => onParametrer(data.cours.ue_num)}
                  className="mt-1 px-3 py-1.5 text-[12.5px] rounded-lg bg-iip-blue
                             text-white font-semibold">
                  Paramétrer les cours et acquis de l'UE {data.cours.ue_num}
                </button>
              )}
            </div>
          ) : (
            <>
              {data.sans_ponderation && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                                text-[12px] text-amber-900">
                  Ces acquis n'ont pas de pondération dans ce cours : la note du cours
                  sera la moyenne simple de ses acquis.
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <IconSearch size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={recherche} onChange={e => setRecherche(e.target.value)}
                    placeholder="Filtrer un étudiant…"
                    className="w-full border border-slate-300 rounded-lg pl-7 pr-2 py-1 text-[12.5px]" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="text-[12px] border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-white text-left px-3 py-1.5
                                     border-b border-r border-slate-200 min-w-[180px]">Étudiant</th>
                      {data.acquis.map(a => (
                        <th key={a.aa_code}
                          title={a.description || ''}
                          className="px-2 py-1.5 border-b border-slate-200 font-mono
                                     text-[11px] text-slate-600 whitespace-nowrap">
                          {a.aa_code}
                          {a.poids != null && (
                            <span className="block font-sans text-[9.5px] text-slate-400">
                              poids {Math.round(a.poids)}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.etudiants
                      .filter(e => !recherche.trim()
                        || `${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase()
                             .includes(recherche.trim().toLowerCase()))
                      .map(e => (
                      <tr key={e.id} className="hover:bg-slate-50/60">
                        <td className="sticky left-0 bg-white px-3 py-1
                                       border-b border-r border-slate-100">
                          <div className="font-semibold text-iip-blue truncate">{e.nom}</div>
                          <div className="text-[10.5px] text-slate-500 truncate">{e.prenom}</div>
                        </td>
                        {data.acquis.map(a => {
                          const v = data.notes[e.id]?.[a.aa_code];
                          return (
                            <td key={a.aa_code} className="px-1 py-1 border-b border-slate-100 text-center">
                              <input type="number" min="0" max="20" step="0.5"
                                defaultValue={v ?? ''}
                                key={`${e.id}-${a.aa_code}-${session}-${v ?? ''}`}
                                onBlur={ev => {
                                  const brut = ev.target.value;
                                  const avant = v == null ? '' : String(v);
                                  if (brut !== avant) poser(e.id, a.aa_code, brut);
                                }}
                                className={`w-16 border rounded-lg px-1.5 py-1 text-[12.5px]
                                            text-center tabular-nums ${tonNote(v)}`} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11.5px] text-slate-500">
                Chaque note s'enregistre en quittant le champ. Elle vaut pour CE cours :
                un acquis évalué dans un autre cours y garde sa propre note, et la
                délibération consolide les deux.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

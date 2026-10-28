/**
 * LES PRÉSENCES À COMPLÉTER, SUR LE TABLEAU DE BORD DU PROFESSEUR (Charles,
 * 28 octobre 2026 : « une fenêtre dans Lucie qui dit au prof : les étudiants
 * suivants n'ont pas noté leur présence — et propose de les noter présents,
 * absents ou autre »).
 *
 * Pour chaque séance où il a projeté le QR, la fenêtre de scan fermée : ceux
 * qui n'ont pas scanné. Rien ne passe « absent » tout seul : le professeur voit
 * la liste et choisit. L'enregistrement prend la route des présences de Mes
 * cours (source « manuel ») ; une séance complète ne revient plus.
 */
import { useEffect, useState } from 'react';
import { IconQrcode } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

const CHOIX = [['present', 'Présent'], ['absent', 'Absent'], ['justifie', 'Justifié'], ['non_concerne', 'Non concerné']];
const fr = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
const CLE_PLUS_TARD = 'lucie.presences-plus-tard';

export default function PresencesACompleter() {
  const [data, setData] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState({});     // `${seance}|${etudiant}` → { statut, motif }
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const charger = () => fetch('/api/mes-cours/qr/a-completer', { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      setData(j);
      // « Plus tard » vaut pour la session du navigateur, pas pour toujours.
      let reporte = false; try { reporte = sessionStorage.getItem(CLE_PLUS_TARD) === '1'; } catch { /* */ }
      if (j?.seances?.length && !reporte) setOuvert(true);
    })
    .catch(() => {});
  useEffect(() => { charger(); }, []);

  if (!data?.seances?.length) return null;
  const total = data.seances.reduce((t, s) => t + s.manquants.length, 0);
  const choisir = (s, e, statut) => setSaisie(x => ({ ...x, [`${s.seance_id}|${e.id}`]: { statut, motif: x[`${s.seance_id}|${e.id}`]?.motif || '' } }));
  const motif = (s, e, m) => setSaisie(x => ({ ...x, [`${s.seance_id}|${e.id}`]: { ...x[`${s.seance_id}|${e.id}`], motif: m } }));
  const tousAbsents = s => setSaisie(x => {
    const y = { ...x };
    for (const e of s.manquants) if (!y[`${s.seance_id}|${e.id}`]?.statut) y[`${s.seance_id}|${e.id}`] = { statut: 'absent', motif: '' };
    return y;
  });
  const lignes = s => s.manquants.map(e => ({ etudiant_id: e.id, ...saisie[`${s.seance_id}|${e.id}`] })).filter(l => l.statut);
  const sansMotif = Object.values(saisie).filter(v => v.statut === 'justifie' && !v.motif).length;
  const nbChoisis = data.seances.reduce((t, s) => t + lignes(s).length, 0);

  const enregistrer = async () => {
    setEnCours(true); setErreur(null);
    try {
      for (const s of data.seances) {
        const l = lignes(s);
        if (!l.length) continue;
        const r = await fetch(`/api/mes-cours/${encodeURIComponent(s.cours_code)}/presences/${s.seance_id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ annee: s.annee, presences: l.map(x => ({ etudiant_id: x.etudiant_id, statut: x.statut, motif: x.statut === 'justifie' ? x.motif : null })) }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`${s.libelle} : ${j.error || `erreur ${r.status}`}`);
      }
      setSaisie({});
      await charger();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const plusTard = () => { try { sessionStorage.setItem(CLE_PLUS_TARD, '1'); } catch { /* */ } setOuvert(false); };

  return (
    <>
      {/* Fermée, la fenêtre laisse un rappel sur le tableau de bord. */}
      {!ouvert && (
        <button type="button" onClick={() => setOuvert(true)} className="bloc-etat w-full text-left px-4 py-2.5 mb-4" data-etat="surveiller">
          <span className="font-semibold">{total} présence{total > 1 ? 's' : ''} à compléter</span>
          <span className="text-second text-slate-500"> — des étudiants n’ont pas scanné le QR ({data.seances.length} séance{data.seances.length > 1 ? 's' : ''})</span>
        </button>
      )}
      {ouvert && (
        <Fenetre icone={IconQrcode} titre="Présences à compléter"
          sous="Ces étudiants n’ont pas noté leur présence par le QR. Indiquez ce qu’il en est."
          large="moyenne" onFermer={plusTard}
          pied={<>
            <span className="text-second text-slate-500 min-w-0 flex-1">
              {sansMotif ? `${sansMotif} absence(s) justifiée(s) sans motif` : nbChoisis ? `${nbChoisis} présence(s) à enregistrer` : 'Choisissez un statut pour chaque étudiant'}
            </span>
            <button type="button" className="bouton" onClick={plusTard}>Plus tard</button>
            <button type="button" className="bouton bouton-fort" disabled={enCours || !nbChoisis || sansMotif > 0} onClick={enregistrer}>
              {enCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </>}>
          <div className="space-y-4">
            {erreur && <p className="text-sm m-0" style={{ color: 'var(--c-refuse)' }}>{erreur}</p>}
            {data.seances.map(s => (
              <div key={s.seance_id}>
                <div className="flex items-baseline gap-2 mb-1">
                  <h3 className="intertitre m-0">{s.libelle}</h3>
                  <span className="text-second text-slate-500">{fr(s.date)}</span>
                  <button type="button" className="ml-auto text-second underline text-slate-500" onClick={() => tousAbsents(s)}>
                    Les autres absents
                  </button>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {s.manquants.map(e => {
                      const v = saisie[`${s.seance_id}|${e.id}`] || {};
                      return (
                        <tr key={e.id} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3 whitespace-nowrap"><b>{String(e.nom || '').toUpperCase()}</b> {e.prenom}</td>
                          <td className="py-1.5">
                            <div className="segments">
                              {CHOIX.map(([k, l]) => (
                                <button key={k} type="button" onClick={() => choisir(s, e, k)}
                                  className={`px-2.5 py-1 text-second ${v.statut === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>
                              ))}
                            </div>
                            {v.statut === 'justifie' && (
                              <select value={v.motif || ''} onChange={ev => motif(s, e, ev.target.value)}
                                className="controle mt-1 w-full border border-slate-300 rounded-champ bg-white text-sm">
                                <option value="">— motif de l’absence —</option>
                                {Object.entries(data.motifs || {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </Fenetre>
      )}
    </>
  );
}

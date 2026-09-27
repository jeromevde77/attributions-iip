import { useEffect, useState } from 'react';
import { IconArrowForwardUp } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre, TuileEtat } from './ui.jsx';

/**
 * LES REPORTS DE NOTES D'OFFICE — le rattrapage des PAE déjà composés.
 *
 * Charles, 27 septembre 2026 : « dès qu'un étudiant est en refus, on regarde
 * ses notes. Si dans un cours il a réussi tous les AA, le cours est dispensé
 * pour l'année suivante ; les notes sont placées dans le nouveau cours comme
 * s'il avait eu les mêmes notes. » Le report se pose désormais seul quand le
 * PAE s'enregistre ; cette fenêtre rattrape ceux composés avant, et le
 * rapport ne s'écrit qu'après avoir été vu (simulation d'abord).
 */
export default function ReportsOffice({ annee, onClose }) {
  const [rapport, setRapport] = useState(null);
  const [fait, setFait] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  async function appeler(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/reports/office', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee, simulation }),
      });
      const texte = await rep.text();
      let j; try { j = JSON.parse(texte); } catch { j = { error: `Réponse inattendue du serveur (code ${rep.status}).` }; }
      if (!rep.ok || j.error) { setErreur(j.error); return null; }
      return j;
    } catch (e) { setErreur(e.message); return null; }
    finally { setEnCours(false); }
  }

  useEffect(() => { appeler(true).then(j => j && setRapport(j)); }, [annee]);

  const poser = async () => {
    const j = await appeler(false);
    if (j) { setFait(j); setRapport(null); }
  };

  const lignes = rapport?.lignes || [];
  const court = a => String(a || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2');

  return (
    <Fenetre icone={IconArrowForwardUp} titre="Reports de notes" large="grande"
      sous={`Cours dont tous les acquis ont été maîtrisés l'an passé — dispensés en ${annee}, notes reprises`}
      onFermer={onClose}
      pied={
        <>
          <span className="flex-1 min-w-0 text-[12px] text-slate-500">
            {fait ? 'Reports posés. Ils se posent désormais seuls à chaque PAE enregistré.'
              : rapport ? (lignes.length ? 'Rien n’est écrit tant que vous n’avez pas cliqué.' : 'Aucun report à poser.')
              : 'Recherche des cours reportables…'}
          </span>
          {!fait && (
            <button className="bouton bouton-fort" disabled={enCours || !lignes.length} onClick={poser}>
              {enCours ? 'En cours…' : `Poser ${lignes.length} report(s)`}
            </button>
          )}
          <button className="bouton" onClick={onClose}>Fermer</button>
        </>
      }>
      <div className="space-y-3 text-[13px]">
        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
        {fait && (
          <div data-etat="reussi" className="bloc-etat px-3 py-2">
            <b>{fait.lignes.length} cours reporté(s)</b> pour {fait.etudiants} étudiant(s) en {fait.annee}.
          </div>
        )}
        {rapport && (
          <>
            <div className="grid grid-cols-2 gap-2 max-w-md">
              <TuileEtat etat="disponible" valeur={lignes.length} libelle="Cours à reporter" />
              <TuileEtat etat="neutre" valeur={rapport.etudiants} libelle="Étudiants concernés" />
            </div>
            {!!lignes.length && (
              <div className="border border-slate-200 rounded-carte overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="tab-entete">
                    <tr className="text-left text-[11px] text-slate-500">
                      <th className="px-3 py-1.5">Étudiant</th>
                      <th className="px-2 py-1.5">UE</th>
                      <th className="px-2 py-1.5">Cours</th>
                      <th className="px-2 py-1.5">Acquis repris</th>
                      <th className="px-2 py-1.5 text-right">Note</th>
                      <th className="px-3 py-1.5">Depuis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map(l => (
                      <tr key={`${l.etudiant_id}-${l.ue_num}-${l.cours_code}`} className="border-t border-slate-100 bg-white">
                        <td className="px-3 py-1 whitespace-nowrap"><b>{(l.nom || '').toUpperCase()}</b> {l.prenom}
                          {l.section && <span className="text-slate-400"> · {l.section}</span>}</td>
                        <td className="px-2 py-1 tabular-nums">{l.ue_num}</td>
                        <td className="px-2 py-1">{l.cours_code}{l.cours_nom ? <span className="text-slate-500"> — {l.cours_nom}</span> : null}</td>
                        <td className="px-2 py-1 text-slate-500 tabular-nums">
                          {(l.aas || []).map(a => `${a.aa_code} : ${Math.round(a.note)}`).join(' · ')}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums font-semibold">{l.note != null ? `${Math.round(l.note)}/20` : '—'}</td>
                        <td className="px-3 py-1 text-slate-500">{court(l.annee_origine)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Fenetre>
  );
}

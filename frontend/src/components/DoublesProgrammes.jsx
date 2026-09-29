/**
 * PROGRAMMES SUR DEUX SECTIONS — la réparation (Charles, 27 septembre 2026 :
 * « non, ce n'est pas possible »).
 *
 * Le 25 septembre, 123 étudiants d'ATNUP ont reçu en plus le BA1 de
 * psychomotricité, et 84 d'AeSI dix unités d'optométrie. Cet écran montre, un
 * par un, les étudiants inscrits cette année dans deux sections, la section
 * qu'on garde et pourquoi, les inscriptions qu'on retire — et celles qu'on ne
 * touche pas (résultat, note, report). Un dossier dont l'historique connaît
 * les deux sections n'est pas tranché : il se règle à la main.
 *
 * Rien ne s'écrit avant le clic, et le clic est un geste de direction.
 */
import { useEffect, useState } from 'react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import { TuileEtat } from './ui.jsx';

export default function DoublesProgrammes() {
  const [annee] = useState(getAnnee());
  const [r, setR] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [exclus, setExclus] = useState(() => new Set());
  const [confirmer, setConfirmer] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(null);
  const direction = ['admin', 'directeur', 'directeur_adjoint'].includes(getUser()?.role);

  const appeler = async simulation => {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/etudiants/doubles-programmes', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, simulation, exclus: [...exclus] }) });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.error || `Erreur ${rep.status}`);
      return j;
    } catch (e) { setErreur(e.message); return null; } finally { setEnCours(false); }
  };
  useEffect(() => { appeler(true).then(j => j && setR(j)); /* eslint-disable-next-line */ }, [annee]);

  const reparer = async () => {
    const j = await appeler(false);
    if (j) { setFait(j.retirees); setConfirmer(false); const s = await appeler(true); if (s) setR(s); }
  };

  const lignes = r?.lignes || [];
  const tranchees = lignes.filter(l => !l.ambigu);
  const ambigus = lignes.filter(l => l.ambigu);
  const aRetirer = tranchees.filter(l => !exclus.has(l.etudiant_id)).reduce((n, l) => n + l.retirer.length, 0);
  const bascule = id => setExclus(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-3 text-[13px]">
      <div>
        <div className="text-[15px] font-semibold text-iip-blue">Programmes sur deux sections — {annee}</div>
        <p className="text-slate-500 text-[12px]">
          Les étudiants inscrits cette année dans les unités de deux sections. Lucie garde la section du dossier
          (rattachement, sinon années antérieures, sinon la première inscrite) et propose de retirer le reste.
          Une inscription qui porte un résultat, une note ou un report n'est jamais retirée.
        </p>
      </div>
      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
      {fait != null && <div data-etat="reussi" className="bloc-etat px-3 py-2"><b>{fait} inscription(s) retirée(s).</b> La liste ci-dessous est recalculée.</div>}
      {!r ? <p className="text-slate-400">Recherche…</p> : (
        <>
          <div className="grid grid-cols-3 gap-2 max-w-xl">
            <TuileEtat etat="corriger" valeur={tranchees.length} libelle="Étudiants à réparer" />
            <TuileEtat etat="neutre" valeur={aRetirer} libelle="Inscriptions à retirer" />
            <TuileEtat etat="surveiller" valeur={ambigus.length} libelle="À trancher à la main" />
          </div>
          {!lignes.length && <p className="text-slate-500">Aucun étudiant n'est inscrit dans deux sections cette année.</p>}
          {!!lignes.length && (
            <div className="border border-slate-200 rounded-carte overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="tab-entete"><tr className="text-left text-[11px] text-slate-500">
                  <th className="px-2 py-1.5 w-8"></th><th className="px-2 py-1.5">Étudiant</th><th className="px-2 py-1.5">Garder</th>
                  <th className="px-2 py-1.5">Retirer</th><th className="px-2 py-1.5">Ne pas toucher</th></tr></thead>
                <tbody>
                  {lignes.map(l => (
                    <tr key={l.etudiant_id} className={`border-t border-slate-100 bg-white ${l.ambigu || exclus.has(l.etudiant_id) ? 'text-slate-400' : ''}`}>
                      <td className="px-2 py-1">{!l.ambigu && <input type="checkbox" checked={!exclus.has(l.etudiant_id)} onChange={() => bascule(l.etudiant_id)} aria-label="Réparer ce dossier" />}</td>
                      <td className="px-2 py-1 whitespace-nowrap"><b>{(l.nom || '').toUpperCase()}</b> {l.prenom} <span className="text-slate-400">· {l.id_ecampus || '—'}</span></td>
                      <td className="px-2 py-1">{l.ambigu ? <span className="text-amber-800">à trancher — {l.raison}</span>
                        : <><b className="text-iip-blue">{l.garde}</b> <span className="text-slate-400">({l.raison})</span></>}</td>
                      <td className="px-2 py-1 tabular-nums">{l.retirer.length ? `${l.retirer[0].section} : UE ${l.retirer.map(x => x.ue_num).join(', ')}` : '—'}</td>
                      <td className="px-2 py-1 tabular-nums text-slate-500">{l.proteges.map(x => `UE ${x.ue_num} (${x.pourquoi})`).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!aRetirer && (
            <div className="flex items-center gap-3 flex-wrap">
              {!direction ? <span className="text-slate-500 text-[12px]">La réparation est un geste de direction.</span>
                : !confirmer ? <button className="bouton bouton-detruire" disabled={enCours} onClick={() => setConfirmer(true)}>Retirer {aRetirer} inscription(s)</button>
                : <div data-etat="corriger" className="bloc-etat px-3 py-2 flex items-center gap-3 flex-wrap">
                    <span>Retirer {aRetirer} inscription(s) pour {tranchees.filter(l => !exclus.has(l.etudiant_id)).length} étudiant(s) ? Les inscriptions qui portent un résultat, une note ou un report restent.</span>
                    <button className="bouton bouton-detruire" disabled={enCours} onClick={reparer}>{enCours ? '…' : 'Retirer'}</button>
                    <button className="bouton" onClick={() => setConfirmer(false)}>Annuler</button>
                  </div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

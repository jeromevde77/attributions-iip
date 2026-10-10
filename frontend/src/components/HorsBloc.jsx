/**
 * PROGRAMMES AU-DELÀ DU BLOC ATTEINT — la réparation (Charles, 28 septembre
 * 2026 : « tous les primos de psychomotricité ont toutes les UE de la section,
 * pas possible »).
 *
 * Un étudiant ne s'inscrit d'office que jusqu'au bloc qui suit le plus haut
 * bloc déjà suivi ou acquis — BA1 pour un primo-inscrit. Des programmes posés
 * avant cette règle portent des unités de BA2 et BA3 que rien n'ouvre. Cet
 * écran les nomme, étudiant par étudiant, et propose de les retirer.
 * Ne sont jamais retirées : une unité qui porte un résultat, une note ou un
 * report, et une dérogation tracée. Un étudiant qui a une valorisation n'est
 * pas tranché : elle peut ouvrir le bloc suivant.
 *
 * Rien ne s'écrit avant le clic, et le clic est un geste de direction.
 */
import { useEffect, useState } from 'react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import { TuileEtat } from './ui.jsx';

export default function HorsBloc() {
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
      const rep = await fetch('/api/etudiants/hors-bloc', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, simulation, exclus: [...exclus] }) });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.error || `Erreur ${rep.status}`);
      return j;
    } catch (e) { setErreur(e.message); return null; } finally { setEnCours(false); }
  };
  useEffect(() => { appeler(true).then(j => j && setR(j)); /* eslint-disable-next-line */ }, [annee]);

  const reparer = async () => {
    const j = await appeler(false);
    if (j) { setFait(j); setConfirmer(false); const s = await appeler(true); if (s) setR(s); }
  };

  const lignes = r?.lignes || [];
  const tranchees = lignes.filter(l => !l.ambigu && l.retirer.length);
  const ambigus = lignes.filter(l => l.ambigu);
  const retenus = tranchees.filter(l => !exclus.has(l.etudiant_id));
  const aRetirer = retenus.reduce((n, l) => n + l.retirer.length, 0);
  const bascule = id => setExclus(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ba = n => `BA${n}`;

  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="text-base font-semibold text-iip-blue">Programmes au-delà du bloc atteint — {annee}</div>
        <p className="text-slate-500 text-second">
          Les étudiants inscrits à des unités d'un bloc qu'ils n'ont pas encore atteint : au-delà du bloc qui suit le
          plus haut bloc déjà suivi ou acquis (BA1 pour un primo-inscrit). Une inscription qui porte un résultat, une
          note ou un report, ou une dérogation tracée, n'est jamais retirée. Un programme confirmé perd sa confirmation.
        </p>
      </div>
      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
      {fait && <div data-etat="reussi" className="bloc-etat px-3 py-2"><b>{fait.retirees} inscription(s) retirée(s).</b>
        {fait.confirmations_retirees ? ` ${fait.confirmations_retirees} confirmation(s) retirée(s) : ces PAE sont à confirmer à nouveau.` : ''} La liste est recalculée.</div>}
      {!r ? <p className="text-slate-400">Recherche…</p> : (
        <>
          <div className="grid grid-cols-3 gap-2 max-w-xl">
            <TuileEtat etat={tranchees.length ? 'corriger' : 'neutre'} valeur={tranchees.length} libelle="Étudiants à réparer" />
            <TuileEtat etat="neutre" valeur={aRetirer} libelle="Inscriptions à retirer" />
            <TuileEtat etat={ambigus.length ? 'surveiller' : 'neutre'} valeur={ambigus.length} libelle="À trancher à la main" />
          </div>
          {!lignes.length && <p className="text-slate-500">Aucun programme ne dépasse le bloc atteint cette année.</p>}
          {!!lignes.length && (
            <div className="border border-slate-200 rounded-carte overflow-hidden">
              <table className="w-full text-second">
                <thead className="tab-entete"><tr className="text-left text-xs text-slate-500">
                  <th className="px-2 py-1.5 w-8"></th><th className="px-2 py-1.5">Étudiant</th><th className="px-2 py-1.5">Section</th>
                  <th className="px-2 py-1.5">Bloc atteint</th><th className="px-2 py-1.5">Retirer</th><th className="px-2 py-1.5">Ne pas toucher</th></tr></thead>
                <tbody>
                  {lignes.map(l => (
                    <tr key={l.etudiant_id} className={`border-t border-slate-100 bg-white ${l.ambigu || exclus.has(l.etudiant_id) ? 'text-slate-400' : ''}`}>
                      <td className="px-2 py-1">{!l.ambigu && l.retirer.length > 0 && <input type="checkbox" checked={!exclus.has(l.etudiant_id)} onChange={() => bascule(l.etudiant_id)} aria-label="Réparer ce dossier" />}</td>
                      <td className="px-2 py-1 whitespace-nowrap"><b>{(l.nom || '').toUpperCase()}</b> {l.prenom} <span className="text-slate-400">· {l.id_ecampus || '—'}{l.primo ? ' · primo' : ''}</span></td>
                      <td className="px-2 py-1">{l.section || '—'}</td>
                      <td className="px-2 py-1">jusqu'au {ba(l.plafond)}</td>
                      <td className="px-2 py-1 tabular-nums">{l.ambigu ? <span className="text-iip-texte">à trancher — {l.raison}</span>
                        : l.retirer.length ? `UE ${l.retirer.map(x => x.ue_num).join(', ')}` : '—'}</td>
                      <td className="px-2 py-1 tabular-nums text-slate-500">{l.proteges.map(x => `UE ${x.ue_num} (${x.pourquoi})`).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!aRetirer && (
            <div className="flex items-center gap-3 flex-wrap">
              {!direction ? <span className="text-slate-500 text-second">La réparation est un geste de direction.</span>
                : !confirmer ? <button className="bouton bouton-detruire" disabled={enCours} onClick={() => setConfirmer(true)}>Retirer {aRetirer} inscription(s)</button>
                : <div data-etat="corriger" className="bloc-etat px-3 py-2 flex items-center gap-3 flex-wrap">
                    <span>Retirer {aRetirer} inscription(s) pour {retenus.length} étudiant(s) ? Ce qui porte un résultat, une note ou un report reste.</span>
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

/**
 * LES DÉCISIONS SANS INSCRIPTION — la réparation (Charles, 30 septembre 2026 :
 * « ABDO R est notée comme primo. Pourquoi ? »).
 *
 * Une décision du Conseil dont l'inscription a disparu ne se voit nulle part :
 * « primo », le parcours, la frise, le bloc atteint et les crédits lisent
 * l'inscription. On la recrée d'après la décision de la session la plus
 * avancée, avec sa cote. Les notes d'acquis effacées avec elle ne reviennent
 * pas (un nouvel import du classeur les rend). Un dossier sans matricule qui a
 * un homonyme est un doublon probable : il se fusionne d'abord.
 *
 * Rien ne s'écrit avant le clic, et le clic est un geste de direction.
 */
import { useEffect, useState } from 'react';
import { authHeaders, getUser } from '../lib/api.js';
import { TuileEtat } from './ui.jsx';

const RESULTAT = { reussi: 'réussi', ajourne: 'ajourné', refuse: 'refusé', absent: 'absent' };
const cote = v => (v == null ? '' : ` ${Number(v).toLocaleString('fr-BE', { maximumFractionDigits: 2 })}`);

export default function DecisionsSansInscription() {
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
      const rep = await fetch('/api/etudiants/decisions-sans-inscription', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ simulation, exclus: [...exclus] }) });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.error || `Erreur ${rep.status}`);
      return j;
    } catch (e) { setErreur(e.message); return null; } finally { setEnCours(false); }
  };
  useEffect(() => { appeler(true).then(j => j && setR(j)); /* eslint-disable-next-line */ }, []);

  const reparer = async () => {
    const j = await appeler(false);
    if (j) { setFait(j); setConfirmer(false); const s = await appeler(true); if (s) setR(s); }
  };

  const lignes = r?.lignes || [];
  const reparables = lignes.filter(l => !l.doublon);
  const doublons = lignes.filter(l => l.doublon);
  const retenus = reparables.filter(l => !exclus.has(l.etudiant_id));
  const aRecreer = retenus.reduce((n, l) => n + l.unites.length, 0);
  const primos = reparables.filter(l => l.primo_a_tort).length;
  const bascule = id => setExclus(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="text-base font-semibold text-iip-blue">Décisions sans inscription</div>
        <p className="text-slate-500 text-second">
          Des décisions du Conseil dont l'inscription a été supprimée ensuite (suppression d'une année sur la fiche,
          purge). Elles ne comptent nulle part : ni dans le parcours, ni dans les crédits, ni pour le bloc atteint — et
          l'étudiant peut se lire « primo ». La réparation recrée l'inscription avec le résultat et la cote de la session
          la plus avancée. Les notes d'acquis supprimées avec elle ne reviennent pas : seul un nouvel import du classeur
          les rend.
        </p>
      </div>
      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
      {fait && <div data-etat="reussi" className="bloc-etat px-3 py-2"><b>{fait.recreees} inscription(s) recréée(s) pour {fait.etudiants} étudiant(s).</b> La liste est recalculée.</div>}
      {!r ? <p className="text-slate-400">Recherche…</p> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-3xl">
            <TuileEtat etat={reparables.length ? 'corriger' : 'neutre'} valeur={reparables.length} libelle="Étudiants à réparer" />
            <TuileEtat etat="neutre" valeur={aRecreer} libelle="Inscriptions à recréer" />
            <TuileEtat etat={primos ? 'surveiller' : 'neutre'} valeur={primos} libelle="Lus « primo » à tort" />
            <TuileEtat etat={doublons.length ? 'surveiller' : 'neutre'} valeur={doublons.length} libelle="Doublons à fusionner d'abord" />
          </div>
          {!lignes.length && <p className="text-slate-500">Toutes les décisions ont leur inscription.</p>}
          {!!lignes.length && (
            <div className="border border-slate-200 rounded-carte overflow-x-auto">
              <table className="w-full text-second">
                <thead className="tab-entete"><tr className="text-left text-xs text-slate-500">
                  <th className="px-2 py-1.5 w-8"></th><th className="px-2 py-1.5">Étudiant</th>
                  <th className="px-2 py-1.5">Inscriptions à recréer</th></tr></thead>
                <tbody>
                  {[...reparables, ...doublons].map(l => (
                    <tr key={l.etudiant_id} className={`border-t border-slate-100 bg-white align-top ${l.doublon || exclus.has(l.etudiant_id) ? 'text-slate-400' : ''}`}>
                      <td className="px-2 py-1">{!l.doublon && <input type="checkbox" checked={!exclus.has(l.etudiant_id)} onChange={() => bascule(l.etudiant_id)} aria-label="Réparer ce dossier" />}</td>
                      <td className="px-2 py-1 whitespace-nowrap">
                        <b>{(l.nom || '').toUpperCase()}</b> {l.prenom} <span className="text-slate-400">· {l.id_ecampus || 'sans matricule'}</span>
                        {l.primo_a_tort && !l.doublon && <span className="block text-xs text-slate-500">lu « primo » à tort</span>}
                        {l.doublon && <span className="block text-xs text-iip-texte">doublon probable de {l.doublon.map(d => `${d.prenom || ''} (${d.id_ecampus})`).join(', ')} — à fusionner dans « Dossiers dédoublés »</span>}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {l.unites.map(u => (
                          <span key={`${u.annee}|${u.ue_num}`} className="inline-block mr-3 whitespace-nowrap" title={u.ue_nom || ''}>
                            {u.annee.slice(2, 4)}-{u.annee.slice(7, 9)} · UE {u.ue_num} <span className="text-slate-500">{RESULTAT[u.resultat] || u.resultat}{cote(u.points)}</span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!aRecreer && (
            <div className="flex items-center gap-3 flex-wrap">
              {!direction ? <span className="text-slate-500 text-second">La réparation est un geste de direction.</span>
                : !confirmer ? <button className="bouton bouton-fort" disabled={enCours} onClick={() => setConfirmer(true)}>Recréer {aRecreer} inscription(s)</button>
                : <div data-etat="surveiller" className="bloc-etat px-3 py-2 flex items-center gap-3 flex-wrap">
                    <span>Recréer {aRecreer} inscription(s) pour {retenus.length} étudiant(s), avec le résultat et la cote de leur décision ? Aucune décision ne change.</span>
                    <button className="bouton bouton-fort" disabled={enCours} onClick={reparer}>{enCours ? '…' : 'Recréer'}</button>
                    <button className="bouton" onClick={() => setConfirmer(false)}>Annuler</button>
                  </div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

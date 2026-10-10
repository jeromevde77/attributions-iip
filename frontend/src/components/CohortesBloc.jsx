import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { Fenetre, BadgePrimo } from './ui.jsx';

/**
 * LES COHORTES D'UN BLOC (Charles, 10 octobre 2026 : en AESI, deux demi-promotions
 * stables — l'une en stage de Toussaint à Noël, l'autre de Carnaval à Pâques).
 * Placer un étudiant dans la cohorte 2, c'est le mettre en organisation 2 dans
 * TOUTES les UE dédoublées de son bloc. Le cas par cas (un étudiant en org 1 d'une
 * UE et en org 2 d'une autre) reste possible dans la répartition de chaque UE :
 * il se lit ici « mixte ». Compte rendu d'abord, écriture ensuite.
 */
export default function CohortesBloc({ section, bloc, annee, peutEcrire, onFermer }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [choix, setChoix] = useState({});            // etudiant → org choisie
  const [q, setQ] = useState('');
  const [fPrimo, setFPrimo] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = async () => {
    try {
      const r = await fetch(`/api/grille/cohortes?section=${encodeURIComponent(section)}&bloc=${encodeURIComponent(bloc)}&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setD(j); setChoix({}); setErreur(null);
    } catch (e) { setErreur(e.message); }
  };
  useEffect(() => { charger(); }, [section, bloc, annee]); // eslint-disable-line react-hooks/exhaustive-deps

  const orgs = useMemo(() => [...new Set((d?.ues || []).flatMap(u => u.orgs))].sort(), [d]);
  const actuelle = e => { const v = [...new Set(Object.values(e.orgs))]; return v.length === 1 ? v[0] : null; };
  const cohorte = e => choix[e.id] ?? actuelle(e);
  const n = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const liste = (d?.etudiants || []).filter(e => (!q.trim() || n(`${e.nom} ${e.prenom}`).includes(n(q))) && (!fPrimo || (fPrimo === 'primo') === !!e.primo));
  const compte = o => (d?.etudiants || []).filter(e => cohorte(e) === o).length;
  const mixtes = (d?.etudiants || []).filter(e => cohorte(e) === null).length;

  function moitie() {
    const l = [...(d?.etudiants || [])], m = Math.ceil(l.length / 2);
    setChoix(Object.fromEntries(l.map((e, i) => [e.id, i < m ? orgs[0] : orgs[1] || orgs[0]])));
  }
  async function enregistrer() {
    const affectations = Object.entries(choix).map(([id, org]) => ({ etudiant_id: Number(id), org }));
    const corps = { annee_scolaire: annee, section, bloc, affectations };
    setEnCours(true);
    try {
      const r0 = await fetch('/api/grille/cohortes', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ ...corps, simulation: true }) });
      const a = await r0.json(); if (!r0.ok) throw new Error(a.error || `Erreur ${r0.status}`);
      if (!a.changements) { await informer('Rien à changer : ces étudiants sont déjà dans ces cohortes.'); return; }
      if (!(await demander({ titre: 'Enregistrer les cohortes', message: `${a.etudiants} étudiant(s) changent d’organisation, sur ${a.changements} inscription(s) aux UE dédoublées de ${bloc}.`, confirmer: 'Enregistrer' }))) return;
      const r = await fetch('/api/grille/cohortes', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ ...corps, simulation: false }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      await charger();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  const modifie = Object.keys(choix).length > 0;
  return (
    <Fenetre titre={`Cohortes de ${section} · ${bloc}`} sous="Une cohorte = une organisation dans toutes les UE dédoublées du bloc" large="grande" onFermer={onFermer}
      pied={peutEcrire && <div className="flex items-center gap-2 w-full">
        <span className="text-second text-slate-500 min-w-0 flex-1">{modifie ? `${Object.keys(choix).length} étudiant(s) modifié(s), non enregistré(s)` : 'Cliquez sur un numéro pour placer l’étudiant.'}</span>
        {modifie && <button className="bouton" onClick={() => setChoix({})} disabled={enCours}>Annuler</button>}
        <button className="bouton bouton-fort" disabled={!modifie || enCours} onClick={enregistrer}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>}>
      {erreur && <div className="text-second mb-2" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}
      {!d ? <div className="text-sm text-slate-400">Chargement…</div> : !d.ues.length
        ? <p className="text-sm text-slate-600">Aucune UE dédoublée dans {bloc} : dédoublez d’abord une UE (fiche de l’UE, « Dédoubler »).</p>
        : <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-second">
            {orgs.map(o => <span key={o}><b>Cohorte {o}</b> : {compte(o)}</span>)}
            {mixtes > 0 && <span title="Organisation différente selon l’UE (répartition au cas par cas)"><b>Mixtes</b> : {mixtes}</span>}
            <span className="text-slate-500">UE dédoublées : {d.ues.map(u => u.ue_num).join(', ')}</span>
            {d.ues.some(u => u.par_groupes) && <span className="text-slate-500 w-full" title="La répartition des groupes de ces UE (Étudiants → Groupes) fait foi pour la simulation : l’organisation s’y lit cours par cours.">Réparties par les groupes : {d.ues.filter(u => u.par_groupes).map(u => u.ue_num).join(', ')} — l’organisation s’y lit cours par cours (« 1+2 » quand elle change d’un cours à l’autre).</span>}
            <span className="flex-1" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un étudiant…" className="controle w-56" data-reponses="non" />
            <select value={fPrimo} onChange={e => setFPrimo(e.target.value)} className="controle" title="Primo : aucune inscription ni valorisation dans une année antérieure">
              <option value="">Tous</option>
              <option value="primo">Primo-inscrits ({(d.etudiants || []).filter(e => e.primo).length})</option>
              <option value="anciens">Déjà inscrits avant ({(d.etudiants || []).filter(e => !e.primo).length})</option>
            </select>
            {peutEcrire && orgs.length > 1 && <button className="bouton" onClick={moitie} title="La première moitié de la liste (ordre alphabétique) en cohorte 1, la seconde en cohorte 2">Moitié / moitié</button>}
          </div>
          <table className="w-full text-second">
            <thead><tr className="tab-entete"><th className="text-left px-2 py-1.5">Étudiant</th><th className="text-left px-2 py-1.5">Cohorte</th><th className="text-left px-2 py-1.5">Par UE</th></tr></thead>
            <tbody>
              {liste.map(e => {
                const c = cohorte(e), change = choix[e.id] != null && choix[e.id] !== actuelle(e);
                return (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="px-2 py-1">{String(e.nom || '').toUpperCase()} {e.prenom}{e.primo && <BadgePrimo className="ml-1.5" />}{change && <span className="ml-1 text-xs text-slate-500">(modifié)</span>}</td>
                    <td className="px-2 py-1">
                      <div className="segments inline-flex h-7">
                        {orgs.map(o => <button key={o} disabled={!peutEcrire} onClick={() => setChoix(x => ({ ...x, [e.id]: o }))}
                          className={`px-3 text-second ${c === o ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>{o}</button>)}
                      </div>
                      {c === null && <span className="ml-2 text-xs text-slate-500">mixte</span>}
                    </td>
                    <td className="px-2 py-1 text-xs text-slate-500">{d.ues.map(u => `${u.ue_num} : ${e.orgs[u.ue_num] ?? '—'}`).join(' · ')}</td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>}
    </Fenetre>
  );
}

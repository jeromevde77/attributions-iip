/* ═══ Configuration → Transferts (3.1.332) ═══════════════════════════════════
 *
 * Les portes qui ont fait entrer le passé dans Lucie — classeurs de suivi, historique,
 * décisions délibérées dans Excel. Une ligne par porte, une colonne par année : fermée, elle
 * disparaît des écrans et le serveur la refuse. Rouvrir se motive. L'administrateur seul
 * (Charles, 14 octobre 2026). Ce qui est entré reste intact.
 */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { saisir, informer } from '../lib/dialogue.jsx';

export default function RegistreTransferts() {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    try {
      const r = await fetch('/api/transferts', { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); }, []);

  async function basculer(p, annee, fermer) {
    let motif = null;
    if (!fermer) {
      motif = await saisir({ message: `Rouvrir « ${p.libelle} » pour ${annee} : pourquoi ? Le motif reste au journal.` });
      if (motif == null) return;
      if (motif.trim().length < 5) { await informer('Rouvrir un transfert se motive (cinq caractères au moins).'); return; }
    }
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/transferts/${p.cle}/${annee}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ ferme: fermer, motif }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      await charger();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  if (!data) return <div className="text-sm text-slate-500">{erreur || 'Chargement…'}</div>;
  const libelle = cle => data.portes.find(p => p.cle === cle)?.libelle || cle;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 max-w-3xl">
        Ces portes ont servi à faire entrer le passé dans Lucie. Une porte <b>fermée</b> pour une année
        disparaît des écrans et le serveur la refuse ; ce qui est déjà entré reste intact et lisible.
        Les imports courants (eCampus, signalétique, liste HELB, dossier pédagogique, notes d'une unité)
        ne sont pas ici : ils restent là où l'on s'en sert.
      </p>
      {erreur && <div className="text-sm" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}

      <div className="border border-slate-200 rounded-carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="tab-entete text-left">
              <th className="px-3 py-2">Transfert</th>
              {data.annees.map(a => <th key={a} className="px-3 py-2 text-center whitespace-nowrap">{a}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.portes.map(p => (
              <tr key={p.cle} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2 min-w-[280px]">
                  <div className="font-semibold text-iip-texte">{p.libelle}</div>
                  <div className="text-second text-slate-500">{p.quoi}</div>
                  <div className="text-mention text-slate-400">{p.ou}</div>
                </td>
                {data.annees.map(a => {
                  const e = p.annees[a] || {};
                  return (
                    <td key={a} className="px-3 py-2 text-center">
                      <button type="button" disabled={enCours} onClick={() => basculer(p, a, !e.ferme)}
                        title={e.maj_le ? `${e.ferme ? 'Fermé' : 'Rouvert'} le ${e.maj_le}${e.maj_par ? ` par ${e.maj_par}` : ''}` : 'Jamais réglé : ouvert'}
                        className="inline-block px-2.5 rounded-full text-white text-xs font-semibold"
                        style={{ background: e.ferme ? 'rgb(var(--gris-500))' : 'var(--c-reussi)' }}>
                        {e.ferme ? 'fermé' : 'ouvert'}
                      </button>
                    </td>);
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.journal.length > 0 && (
        <div className="space-y-1">
          <div className="intertitre">Journal</div>
          <ul className="text-second text-slate-600 space-y-0.5">
            {data.journal.map(j => (
              <li key={j.id}>
                {j.fait_le} · <b>{j.geste === 'fermer' ? 'fermé' : 'rouvert'}</b> · {libelle(j.cle)} · {j.annee_scolaire}
                {j.fait_par && <> · {j.fait_par}</>}
                {j.motif && <span className="text-slate-500"> — « {j.motif} »</span>}
              </li>))}
          </ul>
        </div>
      )}
    </div>
  );
}

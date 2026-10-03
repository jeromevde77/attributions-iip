import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';

/**
 * LES NATIONALITÉS REMISES D'APLOMB (3 octobre 2026) — ce qui a été tapé
 * avant la liste des pays : « Camerounaise », « CAMEROUN », « BurkinaFaso »…
 * La simulation montre chaque correction et le nombre de dossiers ; rien ne
 * s'écrit avant le clic. Ce qui n'est pas reconnu reste nommé, à corriger
 * sur la fiche.
 */
export default function NationalitesNormaliser() {
  const [plan, setPlan] = useState(null);
  const [fait, setFait] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const charger = () => fetch('/api/etudiants/nationalites/normaliser', { headers: authHeaders() })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); setPlan(j); })
    .catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  const appliquer = async () => {
    setOccupe(true); setErreur(null);
    try {
      const r = await fetch('/api/etudiants/nationalites/normaliser', { method: 'POST', headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setFait(j.dossiers); await charger();
    } catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  if (!plan) return <p className="text-[13px] text-slate-400">{erreur || 'Chargement…'}</p>;
  const total = plan.corriger.reduce((t, c) => t + c.dossiers, 0);
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-slate-600">La nationalité se choisit désormais dans la liste des pays. Voici ce qui a été écrit avant,
        et le pays reconnu. Rien ne change avant « Appliquer ».</p>
      {erreur && <p className="text-[13px]" style={{ color: 'var(--c-refuse, #9D4A38)' }}>{erreur}</p>}
      {fait != null && <p className="text-[13px] font-semibold" style={{ color: 'var(--c-reussi, #3E7D5E)' }}>{fait} dossier(s) corrigé(s).</p>}
      {plan.corriger.length ? (
        <table className="w-full text-[13px]">
          <thead><tr className="tab-entete"><th className="text-left px-2 py-1">Écrit aujourd'hui</th><th className="text-left px-2 py-1">Devient</th><th className="text-right px-2 py-1">Dossiers</th></tr></thead>
          <tbody>{plan.corriger.map(c => (
            <tr key={c.actuel} className="border-b border-slate-100"><td className="px-2 py-1">{c.actuel}</td><td className="px-2 py-1 font-semibold">{c.propose}</td><td className="px-2 py-1 text-right tabular-nums">{c.dossiers}</td></tr>
          ))}</tbody>
        </table>
      ) : <p className="text-[13px] text-slate-500">Rien à corriger : toutes les nationalités reconnues sont déjà des pays de la liste.</p>}
      {!!plan.corriger.length && (
        <button type="button" disabled={occupe} onClick={appliquer} className="bouton bouton-fort disabled:opacity-40">
          Appliquer — {total} dossier(s)</button>
      )}
      {!!plan.revoir.length && (
        <div className="text-[12.5px]">
          <div className="font-semibold">Non reconnues — à corriger sur la fiche</div>
          <div className="text-slate-600">{plan.revoir.map(c => `${c.actuel} (${c.dossiers})`).join(' · ')}</div>
        </div>
      )}
    </div>
  );
}

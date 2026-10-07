/**
 * LES INSCRITS PRÉVUS (Charles, 7 octobre 2026 : « opticien : s'il n'y a pas
 * d'inscrit, il faut pouvoir les mettre à la main, idem ailleurs »). Ils ne
 * servent qu'aux « Coûts et recettes des formations », et seulement là où
 * aucun inscrit n'est encodé : un inscrit réel l'emporte toujours.
 */
import { useEffect, useState } from 'react';
import { authHeaders, getAnnee } from '../lib/api.js';

export default function InscritsPrevus() {
  const [annee] = useState(getAnnee());
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [d, setD] = useState(null);
  const [valeurs, setValeurs] = useState({});
  const [etat, setEtat] = useState(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l => setSections(l || [])).catch(() => {});
  }, []);
  useEffect(() => {
    setD(null); setEtat(null);
    if (!section) return;
    fetch(`/api/effectifs-prevus?annee=${encodeURIComponent(annee)}&section=${encodeURIComponent(section)}`, { headers: authHeaders() })
      .then(r => r.json()).then(j => {
        setD(j);
        setValeurs({ 0: j.section_prevu ?? '', ...Object.fromEntries(j.ues.map(u => [u.ue_num, u.prevu ?? ''])) });
      }).catch(e => setEtat(e.message));
  }, [annee, section]);

  async function enregistrer() {
    const r = await fetch('/api/effectifs-prevus', { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ annee, section, valeurs: Object.entries(valeurs).map(([ue_num, inscrits]) => ({ ue_num: Number(ue_num), inscrits })) }) });
    const j = await r.json().catch(() => ({}));
    setEtat(r.ok ? 'Enregistré.' : (j.error || 'Refusé.'));
  }
  const champ = (cle, reel) => (
    <input value={valeurs[cle] ?? ''} inputMode="numeric" placeholder={reel ? '—' : 'à saisir'} disabled={!!reel}
      onChange={e => setValeurs(v => ({ ...v, [cle]: e.target.value.replace(/[^\d]/g, '') }))}
      className="controle w-20 text-right disabled:bg-slate-50 disabled:text-slate-400" />
  );

  return (
    <div className="carte p-4 space-y-3 mt-4">
      <div>
        <div className="text-[15px] font-medium text-iip-blue">Inscrits prévus — {annee}</div>
        <p className="text-[12px] text-slate-500">Pour une section ou une unité qui n’a encore aucun inscrit encodé (Optique, par exemple).
          Ces chiffres ne servent qu’à la pièce « Coûts et recettes des formations », marqués « prévu » ; un inscrit réel l’emporte toujours.</p>
      </div>
      <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
        <option value="">Choisir une section</option>
        {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
      </select>
      {d && (
        <table className="text-[13px] tabular-nums">
          <thead className="tab-entete"><tr><th className="text-left px-2 py-1.5">Unité</th><th className="text-right px-2">Inscrits réels</th><th className="text-right px-2">Prévus</th></tr></thead>
          <tbody>
            <tr className="border-b border-slate-200 font-medium"><td className="px-2 py-1">Section entière (étudiants)</td>
              <td className="px-2 text-right">{d.section_reel || '—'}</td><td className="px-2 text-right">{champ(0, d.section_reel)}</td></tr>
            {d.ues.map(u => (
              <tr key={u.ue_num} className="border-b border-slate-100"><td className="px-2 py-1">UE {u.ue_num} — {u.ue_nom}</td>
                <td className="px-2 text-right">{u.reel || '—'}</td><td className="px-2 text-right">{champ(u.ue_num, u.reel)}</td></tr>))}
          </tbody>
        </table>)}
      {d && (
        <div className="flex items-center gap-3">
          <button type="button" className="bouton bouton-fort" onClick={enregistrer}>Enregistrer</button>
          {etat && <span className="text-[12px] text-slate-600">{etat}</span>}
        </div>)}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LA POPULATION RÉELLE, CONSTATÉE APRÈS LA RENTRÉE (Charles, 22 septembre 2026).
 *
 * L'effectif « prévu » de chaque unité est un chiffre saisi pour planifier ;
 * celui qu'on a réellement devant soi ne se lisait nulle part. On compte ici
 * les étudiants dont le PAE est CONFIRMÉ — par section, par niveau dans la
 * section (le niveau de l'étudiant), et par unité face au prévu.
 */
export default function Population({ annee }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState('');

  useEffect(() => {
    setData(null); setErreur(null);
    fetch(`/api/stats-deliberation/population?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture refusée.'); return j; })
      .then(setData).catch(e => setErreur(e.message));
  }, [annee]);

  const ues = useMemo(() => (data?.par_ue || []).filter(u => !section || u.section === section), [data, section]);
  const sectionsUe = useMemo(() => [...new Set((data?.par_ue || []).map(u => u.section))], [data]);

  if (erreur) return <div className="carte p-3 text-[13px] text-rose-700 flex gap-1.5"><IconAlertTriangle size={15} />{erreur}</div>;
  if (!data) return <div className="text-[13px] text-slate-400 py-8">Comptage…</div>;

  const niveaux = data.niveaux;
  const tuile = (n, lib, rail) => (
    <div className="rounded-carte border border-slate-200 bg-white px-3 py-2"
      style={{ borderLeftWidth: 3, borderLeftColor: rail || 'transparent' }}>
      <div className="text-[17px] font-semibold tabular-nums">{n}</div>
      <div className="text-[11px] text-slate-500">{lib}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-slate-600 max-w-3xl">
        Année {data.annee}. On compte les étudiants dont le <b>programme est confirmé</b>.
        La section est celle de l'étudiant, et le niveau celui de l'étudiant : un parcours mixte compte
        à son niveau principal, celui où il a le plus d'unités.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-2xl">
        {tuile(data.total, 'étudiants au programme confirmé', '#1B2B4B')}
        {tuile(data.en_attente, 'programmes encore à confirmer', data.en_attente ? '#B45309' : null)}
        {tuile(data.parcours_mixtes, 'en parcours mixte', null)}
      </div>

      <section>
        <h2 className="text-[15px] font-semibold text-iip-blue mb-1.5">Par section et par niveau</h2>
        <div className="carte overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="tab-entete text-left">
                <th className="px-3 py-1.5">Section</th>
                {niveaux.map(n => <th key={n} className="px-3 py-1.5 text-right w-24">{n}</th>)}
                <th className="px-3 py-1.5 text-right w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.par_section.map(g => (
                <tr key={g.section} className="border-t border-slate-100 bg-white">
                  <td className="px-3 py-1.5 font-medium">{g.section}</td>
                  {niveaux.map(n => <td key={n} className="px-3 py-1.5 text-right tabular-nums">{g.par_niveau[n] || ''}</td>)}
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{g.etudiants}</td>
                </tr>
              ))}
              {!data.par_section.length && (
                <tr><td colSpan={niveaux.length + 2} className="px-3 py-3 text-slate-400">Aucun programme confirmé pour cette année.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center gap-3 mb-1.5">
          <h2 className="text-[15px] font-semibold text-iip-blue">Par unité, face à l'effectif prévu</h2>
          <select value={section} onChange={e => setSection(e.target.value)} className="controle text-[13px]">
            <option value="">Toutes les sections</option>
            {sectionsUe.map(s0 => <option key={s0} value={s0}>{s0}</option>)}
          </select>
        </div>
        <div className="carte overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="tab-entete text-left">
                <th className="px-3 py-1.5 w-40">Section de l'UE</th>
                <th className="px-3 py-1.5 w-16">UE</th>
                <th className="px-3 py-1.5">Intitulé</th>
                <th className="px-3 py-1.5 text-right w-20">Réels</th>
                <th className="px-3 py-1.5 text-right w-20">Prévus</th>
                <th className="px-3 py-1.5 text-right w-20">Écart</th>
              </tr>
            </thead>
            <tbody>
              {ues.map(u => (
                <tr key={u.ue_num} className="border-t border-slate-100 bg-white">
                  <td className="px-3 py-1.5 text-slate-500">{u.section}</td>
                  <td className="px-3 py-1.5 tabular-nums">{u.ue_num}</td>
                  <td className="px-3 py-1.5">{u.ue_nom || '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{u.reels}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{u.prevus ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums"
                    style={{ color: u.ecart == null || u.ecart === 0 ? undefined : u.ecart < 0 ? '#B45309' : '#1B2B4B' }}>
                    {u.ecart == null ? '—' : u.ecart > 0 ? `+${u.ecart}` : u.ecart}
                  </td>
                </tr>
              ))}
              {!ues.length && <tr><td colSpan={6} className="px-3 py-3 text-slate-400">Aucune unité.</td></tr>}
            </tbody>
          </table>
        </div>
        {ues.length > 0 && ues.filter(u => u.prevus != null).length < ues.length && (
          <p className="text-[12px] text-[#B45309] mt-1.5">
            {ues.length - ues.filter(u => u.prevus != null).length} unité(s) sur {ues.length} n'ont pas d'effectif prévu :
            l'écart ne se calcule pas pour elles. Il se saisit dans la planification de l'unité.
          </p>
        )}
        <p className="text-[11px] text-slate-500 mt-1.5">
          « Prévus » est l'effectif saisi pour la planification de l'unité. Une unité hors cursus accueille plusieurs sections : elle se lit à part.
        </p>
      </section>
    </div>
  );
}

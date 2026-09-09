import { useEffect, useState } from 'react';
import { IconRefresh, IconAlertTriangle, IconDownload } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LES CHIFFRES DE LA DÉLIBÉRATION.
 *
 * Combien réussissent, combien sont ajournés, combien refusés — par unité, par
 * année d'études, par section. Ces chiffres se reconstituaient à la main, une
 * fois l'an, classeur par classeur, pour le rapport d'activité. Ils sont
 * pourtant déjà en base : c'est ce que le Conseil a décidé.
 *
 * TROIS PRÉCAUTIONS, et chacune corrige une erreur qu'on a réellement faite :
 *   — le taux se calcule sur les DÉCIDÉS, jamais sur les inscrits : un dossier
 *     sans décision n'est pas un échec, c'est un dossier à finir, et il se
 *     compte à part ;
 *   — la seconde session ne se compte que sur les ajournés de juin — le
 *     classeur y recopiait toute la promotion, d'où des taux au-delà de cent ;
 *   — un cours n'a pas de décision : le Conseil délibère l'unité. Ce qu'on
 *     peut dire d'un cours, c'est la note qu'il a produite, et c'est un
 *     indicateur d'évaluation, pas de délibération.
 */

const pc = v => (v == null ? '—' : `${String(v).replace('.', ',')} %`);

function tonTaux(v) {
  if (v == null) return 'text-slate-400';
  if (v >= 75) return 'text-emerald-700';
  if (v >= 50) return 'text-amber-700';
  return 'text-rose-700';
}

function Barre({ c }) {
  const t = c.s1.decides || 1;
  const seg = [
    ['reussi', c.s1.reussi, 'bg-emerald-500'],
    ['ajourne', c.s1.ajourne, 'bg-amber-500'],
    ['refuse', c.s1.refuse + c.s1.absent, 'bg-rose-500'],
  ];
  return (
    <div className="flex h-2 w-28 rounded-full overflow-hidden bg-slate-100"
      title={`${c.s1.reussi} réussi(s) · ${c.s1.ajourne} ajourné(s) · `
           + `${c.s1.refuse + c.s1.absent} refusé(s) — sur ${c.s1.decides} décidés`}>
      {seg.map(([k, n, cl]) => n
        ? <div key={k} className={cl} style={{ width: `${(n / t) * 100}%` }} /> : null)}
    </div>
  );
}

function Tableau({ titre, sous, lignes, colonne = 'Groupe' }) {
  if (!lignes?.length) return null;
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="text-[13px] font-semibold text-iip-blue">{titre}</div>
        {sous && <div className="text-[11px] text-slate-500">{sous}</div>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-slate-500 text-left border-b border-slate-200">
              <th className="px-3 py-1.5 font-semibold">{colonne}</th>
              <th className="px-2 py-1.5 font-semibold text-right">Inscrits</th>
              <th className="px-2 py-1.5 font-semibold" />
              <th className="px-2 py-1.5 font-semibold text-right">Réussis</th>
              <th className="px-2 py-1.5 font-semibold text-right">Ajournés</th>
              <th className="px-2 py-1.5 font-semibold text-right">Refusés</th>
              <th className="px-2 py-1.5 font-semibold text-right">Réussite S1</th>
              <th className="px-2 py-1.5 font-semibold text-right">S2 revenus</th>
              <th className="px-2 py-1.5 font-semibold text-right">S2 réussis</th>
              <th className="px-2 py-1.5 font-semibold text-right">Réussite finale</th>
              <th className="px-2 py-1.5 font-semibold text-right">À finir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lignes.map(l => (
              <tr key={l.cle}>
                <td className="px-3 py-1.5">{l.libelle}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{l.inscrits}</td>
                <td className="px-2 py-1.5"><Barre c={l} /></td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.s1.reussi}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.s1.ajourne}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.s1.refuse + l.s1.absent}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                  tonTaux(l.s1.taux_reussite)}`}>{pc(l.s1.taux_reussite)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500"
                  title={`${l.s2.decides} décidé(s) sur ${l.s2.attendus} ajourné(s) de juin`}>
                  {l.s2.attendus ? `${l.s2.decides}/${l.s2.attendus}` : '—'}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {l.s2.decides ? l.s2.reussi : '—'}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                  tonTaux(l.final.taux_reussite)}`}>{pc(l.final.taux_reussite)}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${
                  l.s1.sans_decision ? 'text-amber-700 font-semibold' : 'text-slate-300'}`}>
                  {l.s1.sans_decision || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function StatsDeliberation({ annee }) {
  const [data, setData] = useState(null);
  const [section, setSection] = useState('');
  const [sections, setSections] = useState([]);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setSections(Array.isArray(l) ? l : []))
      .catch(() => setSections([]));
  }, []);

  const charger = async () => {
    if (!annee) return;
    setEnCours(true); setErreur('');
    try {
      const p = new URLSearchParams({ annee });
      if (section) p.set('section', section);
      const rep = await fetch(`/api/stats-deliberation?${p}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'lecture impossible');
      setData(j);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee, section]);

  // Le tableur reste le format du rapport d'activité : autant le donner.
  const exporter = () => {
    if (!data) return;
    const l = [['Regroupement', 'Clé', 'Inscrits', 'Décidés S1', 'Réussis S1',
      'Ajournés S1', 'Refusés S1', 'Réussite S1 %', 'Ajournés attendus S2',
      'Décidés S2', 'Réussis S2', 'Refusés S2', 'Réussite finale %', 'Sans décision']];
    const pousser = (nom, arr) => arr.forEach(x => l.push([nom, x.libelle, x.inscrits,
      x.s1.decides, x.s1.reussi, x.s1.ajourne, x.s1.refuse + x.s1.absent,
      x.s1.taux_reussite, x.s2.attendus, x.s2.decides, x.s2.reussi, x.s2.refuse,
      x.final.taux_reussite, x.s1.sans_decision]));
    pousser('Unité', data.par_ue);
    pousser('Année', data.par_niveau);
    pousser('Section', data.par_section);
    const csv = l.map(r => r.map(v => {
      const t = String(v ?? '');
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    }).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `Deliberation_${annee}${section ? `_${section}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="max-w-3xl">
          <div className="text-[15px] font-semibold text-iip-blue">
            Résultats de la délibération — {annee}
          </div>
          <p className="text-[12px] text-slate-600 mt-0.5">
            Ce que le Conseil a décidé, unité par unité. Le taux se calcule sur les
            dossiers <b>décidés</b> et non sur les inscrits : un dossier sans décision
            n'est pas un échec, c'est un dossier à finir — il se compte à part, dans la
            dernière colonne.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={section} onChange={e => setSection(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-[12.5px]">
            <option value="">Toutes les sections</option>
            {sections.map(s => (
              <option key={s.code} value={s.code}>{s.libelle || s.code}</option>
            ))}
          </select>
          <button onClick={exporter} disabled={!data}
            className="px-2.5 py-1.5 text-[12px] rounded-lg border border-slate-300
                       text-slate-600 flex items-center gap-1.5 disabled:opacity-40">
            <IconDownload size={14} /> Tableur
          </button>
          <button onClick={charger} disabled={enCours}
            className="px-2.5 py-1.5 text-[12px] rounded-lg border border-slate-300
                       text-slate-600 flex items-center gap-1.5 disabled:opacity-40">
            <IconRefresh size={14} /> Relire
          </button>
        </div>
      </div>

      {erreur && (
        <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200
                        text-[12px] text-rose-900">{erreur}</div>
      )}

      {data && (
        <>
          <div className="grid gap-2 sm:grid-cols-5">
            {[
              ['Décisions prises', data.total.s1.decides],
              ['Réussite en 1re session', pc(data.total.s1.taux_reussite)],
              ['Ajournés revenus en 2e', data.total.s2.attendus
                ? `${data.total.s2.decides} / ${data.total.s2.attendus}` : '—'],
              ['Réussite après les 2 sessions', pc(data.total.final.taux_reussite)],
              ['Dossiers à finir', data.dossiers_ouverts],
            ].map(([l, v], i) => (
              <div key={l} className={`px-3 py-2 rounded-xl border ${
                i === 4 && data.dossiers_ouverts
                  ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                <div className="text-[11px] text-slate-500">{l}</div>
                <div className="text-[17px] font-bold text-iip-blue tabular-nums">{v}</div>
              </div>
            ))}
          </div>

          {!!data.dossiers_ouverts && (
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300
                            text-[12px] text-amber-900 flex items-start gap-1.5">
              <IconAlertTriangle size={15} className="flex-none mt-px" />
              <span>
                <b>{data.dossiers_ouverts} inscription(s) sans aucune décision.</b> Elles
                ne comptent nulle part dans les taux — ni en réussite, ni en échec. Tant
                qu'elles restent ouvertes, ces chiffres décrivent une année inachevée.
              </span>
            </div>
          )}

          <Tableau titre="Par unité d'enseignement" colonne="Unité" lignes={data.par_ue} />
          <div className="grid gap-3 lg:grid-cols-2">
            <Tableau titre="Par année d'études" colonne="Année" lignes={data.par_niveau} />
            <Tableau titre="Par section" colonne="Section" lignes={data.par_section} />
          </div>

          {/* LE COURS N'EST PAS DÉLIBÉRÉ : on ne lui donne donc pas les mêmes
              colonnes, pour qu'on ne lise pas ces chiffres comme des décisions. */}
          {!!data.par_cours?.length && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                <div className="text-[13px] font-semibold text-iip-blue">Par cours</div>
                <div className="text-[11px] text-slate-500">
                  Un cours n'a pas de décision — le Conseil délibère l'unité. Ce qui se dit
                  d'un cours, c'est la note qu'il a produite : un indicateur d'évaluation,
                  pas de délibération.
                </div>
              </div>
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-slate-500 text-left border-b border-slate-200">
                      <th className="px-3 py-1.5 font-semibold">Cours</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Notes</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Moyenne</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Au seuil</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.par_cours.map(c => (
                      <tr key={c.cours_code}>
                        <td className="px-3 py-1.5">
                          <span className="font-mono font-bold text-slate-700">{c.cours_code}</span>
                          {c.cours_nom ? <span className="text-slate-500"> · {c.cours_nom}</span> : null}
                          <span className="text-slate-400"> — UE {c.ue_num}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{c.notes}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                          c.moyenne == null ? 'text-slate-400'
                            : c.moyenne < 10 ? 'text-rose-700'
                            : c.moyenne < 12 ? 'text-amber-700' : 'text-emerald-700'}`}>
                          {c.moyenne == null ? '—' : String(c.moyenne).replace('.', ',')}
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${
                          tonTaux(c.taux_au_seuil)}`}>{pc(c.taux_au_seuil)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

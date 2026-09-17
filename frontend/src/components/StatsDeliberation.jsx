import { useEffect, useState } from 'react';
import { IconRefresh, IconAlertTriangle, IconDownload } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import {
  nb, pc, tonTaux, couleurTaux, BarreDecisions, Tuile, Etendue, forme,
} from './statsUi.jsx';

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

/* Les couleurs, les tuiles et la barre d'étendue vivent dans statsUi.jsx : les
   deux écrans de statistiques parlent désormais les deux langues, et une teinte
   qui change doit changer aux deux endroits à la fois. */
const Barre = ({ c }) => (
  <BarreDecisions reussi={c.s1.reussi} ajourne={c.s1.ajourne}
    refuse={c.s1.refuse + c.s1.absent} />
);

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

  // LA FORME SE CALCULE ICI, à partir de ce qui est déjà chargé : redemander
  // au serveur la distribution des taux serait une seconde source pour un même
  // fait. Les unités sans décision n'y entrent pas — elles n'ont pas de taux.
  const formeUE = forme((data?.par_ue || [])
    .filter(u => u.s1.decides > 0).map(u => u.s1.taux_reussite));

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
            className="controle">
            <option value="">Toutes les sections</option>
            {sections.map(s => (
              <option key={s.code} value={s.code}>{s.libelle || s.code}</option>
            ))}
          </select>
          <button onClick={exporter} disabled={!data}
            className="controle">
            <IconDownload size={14} /> Tableur
          </button>
          <button onClick={charger} disabled={enCours}
            className="controle">
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
          {/* LES MÊMES TUILES QU'EN DISTRIBUTIONS — filet gauche teinté, chiffre
              d'abord —, mais la teinte dit ici ce que la couleur disait déjà
              dans le tableau : un taux se juge, et le vert, l'ocre et le rose
              sont ce jugement. Le vocabulaire est commun aux deux écrans. */}
          <div className="flex gap-2 flex-wrap">
            <Tuile libelle="Décisions prises" valeur={data.total.s1.decides} />
            <Tuile libelle="Réussite en 1re session"
              valeur={pc(data.total.s1.taux_reussite)}
              couleur={couleurTaux(data.total.s1.taux_reussite)} />
            <Tuile libelle="Ajournés revenus en 2e"
              valeur={data.total.s2.attendus
                ? `${data.total.s2.decides} / ${data.total.s2.attendus}` : '—'}
              precision={data.total.s2.attendus ? 'décidés sur ajournés de juin' : null} />
            <Tuile libelle="Réussite après les 2 sessions"
              valeur={pc(data.total.final.taux_reussite)}
              couleur={couleurTaux(data.total.final.taux_reussite)} />
            <Tuile libelle="Dossiers à finir" valeur={data.dossiers_ouverts}
              ton={data.dossiers_ouverts ? 'alerte' : null}
              precision={data.dossiers_ouverts ? 'hors de tous les taux' : null} />
          </div>

          {/* ET LA FORME, QUE LE TAUX GLOBAL NE DIT PAS.
              « 68 % de réussite » peut être vingt unités toutes autour de 68,
              ou dix à 95 et dix à 40 : ce n'est pas la même année, et ce n'est
              pas la même conversation à tenir avec l'équipe. La barre montre
              d'où à où vont les unités, où se tient celle du milieu, et où
              tombe la moyenne. */}
          {formeUE && formeUE.n > 2 && (
            <div className="carte px-3 py-2.5 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="text-[12px] text-slate-600">
                  Dispersion des taux de réussite de 1re session,
                  sur <b>{formeUE.n}</b> unité(s) délibérée(s)
                </div>
                <div className="text-[11px] text-slate-500 tabular-nums">
                  la plus basse {nb(formeUE.min)} % · médiane <b className="text-iip-blue">
                    {nb(formeUE.mediane)} %</b> · moyenne {nb(formeUE.moyenne)} %
                  · la plus haute {nb(formeUE.max)} %
                </div>
              </div>
              <Etendue d={formeUE} max={100} />
              {Math.abs(formeUE.moyenne - formeUE.mediane) > 5 && (
                <div className="text-[11px] text-[color:var(--c-attente,#B45309)]">
                  Plus de cinq points entre la moyenne et la médiane : la série est
                  tirée par un bout — quelques unités pèsent sur l'ensemble.
                </div>
              )}
            </div>
          )}

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

          {/* DU PLUS GÉNÉRAL AU PLUS FIN, UN BLOC APRÈS L'AUTRE.
              La section d'abord — c'est l'échelle à laquelle on pilote —, puis
              l'année d'études, puis l'unité, puis le cours pour qui veut aller
              voir. Deux tableaux côte à côte obligeaient à lire en zigzag et
              les colonnes ne s'alignaient plus d'un bloc à l'autre : on
              comparait des chiffres qui ne se comparaient pas. */}
          <Tableau titre="Par section" colonne="Section" lignes={data.par_section}
            sous="L'échelle du pilotage : ce que la section produit, toutes unités confondues." />
          <Tableau titre="Par année d'études" colonne="Année" lignes={data.par_niveau}
            sous="La décomposition par bloc, à l'intérieur de la section." />
          <Tableau titre="Par unité d'enseignement" colonne="Unité" lignes={data.par_ue}
            sous="Le détail unité par unité — c'est le niveau où la décision se prend." />

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

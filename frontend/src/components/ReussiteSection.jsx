/* LA RÉUSSITE D'UNE SECTION (3.5.551 ; refaite en 3.5.558 sur la maquette validée par Charles : « les jauges empilées — une ligne verte,
   orange et rouge —, c'était design » ; « les boîtes à moustaches, mais design, avec médiane, mode et moyenne, et l'étendue »).
   Une carte « La réussite » (trois disques avec leur référence, l'évolution sur trois ans), les décisions par bloc et unité par unité en
   jauges empilées, la dispersion des notes d'unité en boîtes à moustaches (bloc par bloc, la section, l'IIP), la note moyenne cours par
   cours. Les chiffres : GET /api/stats-deliberation (taux) et /api/stats-deliberation/distributions (notes). Rien ne se recalcule. */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { Encadre } from './ui.jsx';
import ChargementLucie from './ChargementLucie.jsx';
import { Disque, ComparerA, Partie } from './Disques.jsx';

const avant = (a, k) => { const x = Number(String(a).slice(0, 4)) - k; return `${x}-${x + 1}`; };
const pc = v => (v == null ? '—' : `${Math.round(v)} %`);
const f1 = v => (v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ','));
const lire = (chemin, q) => fetch(`${chemin}?${new URLSearchParams(q)}`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).catch(() => null);
const VERT = 'var(--c-reussi)', OCRE = 'var(--c-attente)', ROUGE = 'var(--c-refuse)';

function Jauge({ r = 0, a = 0, x = 0, haut = 14 }) {
  const t = r + a + x || 1;
  return (
    <div className="flex rounded overflow-hidden" style={{ height: haut, background: '#EDF0F4' }}>
      <div style={{ width: `${(r / t) * 100}%`, background: VERT }} /><div style={{ width: `${(a / t) * 100}%`, background: OCRE }} /><div style={{ width: `${(x / t) * 100}%`, background: ROUGE }} />
    </div>);
}

function Boites({ lignes }) {
  const X = v => 190 + v * 20, W = 1000;
  const h = 34 + lignes.length * 42;
  return (
    <svg viewBox={`0 0 ${W} ${h + 20}`} style={{ width: '100%', height: h + 20 }} role="img" aria-label="Boîtes à moustaches des notes d’unité">
      {[0, 5, 10, 15, 20].map(v => <line key={v} x1={X(v)} y1="14" x2={X(v)} y2={h} style={{ stroke: v === 10 ? 'var(--c-texte, #16263D)' : '#EDF0F4' }} strokeDasharray={v === 10 ? '4 3' : undefined} />)}
      {[0, 10, 20].map(v => <text key={v} x={X(v)} y={h + 16} textAnchor="middle" fontSize="12" style={{ fill: v === 10 ? 'var(--c-texte, #16263D)' : '#64748B' }} fontWeight={v === 10 ? 700 : 400}>{v === 10 ? '10 · seuil' : v}</text>)}
      {lignes.map((b, i) => {
        const y = 34 + i * 42, md = Array.isArray(b.mode) ? b.mode[0] : b.mode;
        const ref = b.ref, fort = b.fort;
        return (
          <g key={b.nom}>
            <text x="0" y={y + 4} fontSize="13" fontWeight={fort ? 700 : 500} style={{ fill: 'var(--c-texte, #16263D)' }}>{b.nom}</text>
            <line x1={X(b.min)} y1={y} x2={X(b.q1)} y2={y} strokeWidth="2" style={{ stroke: '#7C8BA1' }} />
            <line x1={X(b.q3)} y1={y} x2={X(b.max)} y2={y} strokeWidth="2" style={{ stroke: '#7C8BA1' }} />
            <line x1={X(b.min)} y1={y - 7} x2={X(b.min)} y2={y + 7} strokeWidth="2" style={{ stroke: '#7C8BA1' }} />
            <line x1={X(b.max)} y1={y - 7} x2={X(b.max)} y2={y + 7} strokeWidth="2" style={{ stroke: '#7C8BA1' }} />
            <rect x={X(b.q1)} y={y - 11} width={Math.max(2, X(b.q3) - X(b.q1))} height="22" rx="5" strokeWidth="1.5"
              style={{ fill: ref ? '#EDF0F4' : fort ? 'color-mix(in srgb, var(--c-reussi) 26%, white)' : 'color-mix(in srgb, var(--c-reussi) 14%, white)', stroke: ref ? '#7C8BA1' : 'var(--c-reussi)' }} />
            <line x1={X(b.mediane)} y1={y - 11} x2={X(b.mediane)} y2={y + 11} strokeWidth="3" style={{ stroke: 'var(--c-texte, #16263D)' }} />
            <circle cx={X(b.moyenne)} cy={y} r="5" strokeWidth="2" style={{ fill: '#fff', stroke: 'var(--c-texte, #16263D)' }} />
            {md != null && <path d={`M ${X(md) - 6} ${y - 17} L ${X(md) + 6} ${y - 17} L ${X(md)} ${y - 9} Z`} style={{ fill: '#F9B619' }} />}
            <text x="620" y={y + 4} fontSize="12" style={{ fill: '#475569' }}>médiane {f1(b.mediane)} · moyenne {f1(b.moyenne)}{md != null ? ` · mode ${f1(md)}` : ''} · étendue {f1(b.min)} → {f1(b.max)} · {b.n} notes</text>
          </g>);
      })}
    </svg>);
}

export default function ReussiteSection({ section, annee, refs = null }) {
  const [ref, setRef] = useState('IIP');
  const [donnees, setDonnees] = useState(null);
  useEffect(() => {
    let vivant = true; setDonnees(null);
    const l = [avant(annee, 2), avant(annee, 1), annee];
    Promise.all([...l.map(a => lire('/api/stats-deliberation', { annee: a, section })),
      lire('/api/stats-deliberation/distributions', { annee, section }), lire('/api/stats-deliberation/distributions', { annee })])
      .then(r => vivant && setDonnees({ annees: l.map((a, i) => ({ annee: a, data: r[i] })), dist: r[3], distIip: r[4] }));
    return () => { vivant = false; };
  }, [section, annee]);
  if (!donnees) return <ChargementLucie texte="Lucie lit les délibérations de la section…" />;
  const cur = donnees.annees[donnees.annees.length - 1].data;
  if (!cur?.total) return <Encadre etat="neutre" titre={`Aucune délibération pour ${section} en ${annee}.`} />;
  const T = cur.total, R = refs?.[ref] || {};
  const s2 = T.s2?.decides ? (T.s2.reussi / T.s2.decides) * 100 : null;
  const evolution = donnees.annees.filter(x => x.data?.total?.s1?.decides).map(x => ({ lib: `${x.annee.slice(2, 4)}-${x.annee.slice(7, 9)}`, s1: x.data.total.s1.taux_reussite, fin: x.data.total.final.taux_reussite }));
  const blocs = (cur.par_niveau || []).filter(b => b.s1?.decides);
  const ues = (cur.par_ue || []).filter(u => u.s1?.decides).sort((a, b) => (a.final.taux_reussite ?? 0) - (b.final.taux_reussite ?? 0));
  const cours = (cur.par_cours || []).filter(c => c.moyenne != null).map(c => ({ ...c, m: Number(c.moyenne) })).sort((a, b) => a.m - b.m);
  const D = donnees.dist?.cotes_ue, DI = donnees.distIip?.cotes_ue;
  const boites = [
    ...(D?.par_bloc || []).filter(b => /^BA\d/.test(b.cle) && b.n > 2).map(b => ({ ...b, nom: b.cle })),
    ...(D?.ensemble?.n ? [{ ...D.ensemble, nom: section, fort: true }] : []),
    ...(DI?.ensemble?.n ? [{ ...DI.ensemble, nom: 'IIP', fort: true, ref: true }] : []),
  ].filter(b => b.q1 != null && b.q3 != null);
  // L'évolution, dessinée à l'échelle 0-100 % (un SVG simple, comme la maquette).
  const W = 420, H = 130, px = i => 50 + (evolution.length > 1 ? i * ((W - 100) / (evolution.length - 1)) : (W - 100) / 2), py = v => 110 - (v / 100) * 100;
  const pts = k => evolution.map((e, i) => `${px(i)},${py(e[k])}`).join(' ');
  return (
    <div className="space-y-4">
      <Partie titre="La réussite" sous={`résultats ${annee} · ${T.s1.decides} décisions de 1re session${cur.dossiers_ouverts ? ` · ${cur.dossiers_ouverts} inscriptions sans décision, hors des taux` : ''}`}
        droite={refs ? <ComparerA valeur={ref} onChange={setRef} /> : null}>
        <div className="grid grid-cols-1 lg:[grid-template-columns:1fr_1.6fr]">
          <div className="px-4 py-3 flex justify-around gap-2 lg:border-r border-slate-100">
            <Disque nom="1re session" valeur={T.s1.taux_reussite} reference={R.s1 ?? null} nomRef={ref} couleur={OCRE} />
            <Disque nom="Après les deux sessions" valeur={T.final.taux_reussite} reference={R.final ?? null} nomRef={ref} couleur={VERT} />
            <Disque nom="Ajournés réussis en 2e" valeur={s2} reference={null} nomRef={ref} couleur="var(--c-principal)" />
          </div>
          <div className="px-4 py-3 space-y-1.5">
            <div className="text-mention font-bold uppercase tracking-wider text-slate-500">Sur trois ans</div>
            {evolution.length > 1 ? (
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }} role="img" aria-label="Réussite sur trois ans">
                <line x1="20" y1="110" x2={W - 10} y2="110" style={{ stroke: '#E4E7EC' }} />
                <polyline points={pts('s1')} fill="none" strokeWidth="2.5" style={{ stroke: OCRE }} />
                <polyline points={pts('fin')} fill="none" strokeWidth="2.5" style={{ stroke: VERT }} />
                {evolution.map((e, i) => (<g key={e.lib}>
                  <circle cx={px(i)} cy={py(e.s1)} r="4" style={{ fill: OCRE }} /><circle cx={px(i)} cy={py(e.fin)} r="4" style={{ fill: VERT }} />
                  <text x={px(i)} y={py(e.fin) - 8} textAnchor="middle" fontSize="11" style={{ fill: VERT }}>{pc(e.fin)}</text>
                  <text x={px(i)} y={py(e.s1) + 16} textAnchor="middle" fontSize="11" style={{ fill: OCRE }}>{pc(e.s1)}</text>
                  <text x={px(i)} y={H - 4} textAnchor="middle" fontSize="11" style={{ fill: '#64748B' }}>{e.lib}</text></g>))}
              </svg>) : <p className="text-second text-slate-500">Une seule année délibérée.</p>}
            <div className="flex gap-4 text-mention"><span style={{ color: OCRE }}>● 1re session</span><span style={{ color: VERT }}>● après les deux sessions</span></div>
          </div>
        </div>
      </Partie>

      <div className="grid gap-4 grid-cols-1 lg:[grid-template-columns:1fr_1.4fr]">
        <Partie titre="Les décisions par bloc" sous="1re session · réussite finale à droite">
          <div className="px-4 py-3 space-y-2.5">
            {blocs.map(b => (
              <div key={b.cle} className="grid grid-cols-[44px_1fr_56px] items-center gap-2.5 text-second">
                <b>{b.libelle}</b><Jauge r={b.s1.reussi} a={b.s1.ajourne} x={(b.s1.refuse || 0) + (b.s1.absent || 0)} haut={16} />
                <span className="text-right tabular-nums">{pc(b.final.taux_reussite)}</span>
              </div>))}
            <div className="flex gap-3 text-mention text-slate-600 pt-1">
              <span><span className="inline-block w-2.5 h-2.5 mr-1 align-middle" style={{ background: VERT }} />réussi</span>
              <span><span className="inline-block w-2.5 h-2.5 mr-1 align-middle" style={{ background: OCRE }} />ajourné</span>
              <span><span className="inline-block w-2.5 h-2.5 mr-1 align-middle" style={{ background: ROUGE }} />refusé ou absent</span>
            </div>
          </div>
        </Partie>
        <Partie titre="Unité par unité" sous="réussi · ajourné · refusé — de la plus difficile à la plus réussie">
          <div className="px-4 py-3 space-y-1.5 max-h-[420px] overflow-auto">
            {ues.map(u => (
              <div key={u.cle} className="grid grid-cols-[minmax(0,220px)_1fr_48px] items-center gap-2.5 text-second">
                <span className="truncate" title={u.libelle}>{u.libelle}</span>
                <Jauge r={u.s1.reussi} a={u.s1.ajourne} x={(u.s1.refuse || 0) + (u.s1.absent || 0)} haut={12} />
                <span className="text-right tabular-nums">{pc(u.final.taux_reussite)}</span>
              </div>))}
          </div>
        </Partie>
      </div>

      {boites.length > 0 && (
        <Partie titre="La dispersion des notes d’unité, sur 20" sous={`une boîte par bloc, puis ${section} et l’IIP · la boîte = la moitié centrale des notes ; les moustaches = l’étendue`}>
          <div className="px-4 pt-2">
            <Boites lignes={boites} />
            <div className="flex flex-wrap gap-4 text-mention text-slate-600 pb-3">
              <span><b className="inline-block w-[3px] h-3 align-middle mr-1" style={{ background: 'var(--c-texte, #16263D)' }} />médiane</span>
              <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ border: '2px solid var(--c-texte, #16263D)' }} />moyenne</span>
              <span><span className="inline-block align-middle mr-1" style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '9px solid #F9B619' }} />mode (la note la plus fréquente)</span>
              <span>boîte : du 1er au 3e quartile · moustaches : de la plus basse à la plus haute</span>
            </div>
          </div>
        </Partie>)}

      {cours.length > 0 && (
        <Partie titre="La note moyenne, cours par cours" sous={`${cours.length} cours · un cours n’est pas délibéré : c’est la note qu’il a produite · le trait = le seuil de 10`}>
          <div className="px-4 py-3 grid gap-x-7 gap-y-1.5 grid-cols-1 lg:grid-cols-2">
            {cours.map(c => (
              <div key={c.cours_code} className="grid grid-cols-[minmax(0,190px)_1fr_36px] items-center gap-2.5 text-second">
                <span className="truncate" title={c.cours_nom || c.cours_code}>{c.cours_code}{c.cours_nom ? ` · ${c.cours_nom}` : ''}</span>
                <div className="relative h-2.5 rounded" style={{ background: '#EDF0F4' }}>
                  <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.min(100, c.m * 5)}%`, background: c.m < 10 ? ROUGE : c.m < 12 ? OCRE : VERT }} />
                  <div className="absolute -top-[3px] -bottom-[3px] w-px" style={{ left: '50%', background: 'var(--c-texte, #16263D)' }} />
                </div>
                <span className="text-right tabular-nums">{f1(c.m)}</span>
              </div>))}
          </div>
        </Partie>)}
    </div>);
}

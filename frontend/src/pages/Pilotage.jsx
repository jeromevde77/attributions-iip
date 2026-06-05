import { useState, useEffect, useMemo, useRef } from 'react';
import { api, getAnnee } from '../lib/api.js';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid, ReferenceLine,
  ComposedChart, Line,
} from 'recharts';

// ── Utilitaires ──────────────────────────────────────────────────────────────
const fmt  = (v, d = 0) => (v == null ? '—' : Number(v).toLocaleString('fr-BE', { maximumFractionDigits: d }));
const pct  = (v) => (v == null ? '—' : `${fmt(v, 1)} %`);
const sign = (v) => (v > 0 ? '+' : '');

function trafficColor(p) {
  if (p == null) return 'text-gray-400';
  if (p > 100) return 'text-red-700 font-bold';
  if (p > 95)  return 'text-red-500';
  if (p > 85)  return 'text-amber-600';
  return 'text-green-700';
}
function trafficBg(p) {
  if (p == null) return 'bg-gray-50 border-gray-200';
  if (p > 100) return 'bg-red-50   border-red-300';
  if (p > 95)  return 'bg-red-50   border-red-200';
  if (p > 85)  return 'bg-amber-50 border-amber-200';
  return 'bg-green-50 border-green-200';
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, color = 'text-iip-gold' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

// ── Barre de progression ──────────────────────────────────────────────────────
function ProgressBar({ pct: p }) {
  const w = Math.min(Math.max(p || 0, 0), 110);
  const bg = p > 100 ? 'bg-red-600' : p > 95 ? 'bg-red-400' : p > 85 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
      <div className={`h-2.5 rounded-full transition-all ${bg}`} style={{ width: `${w}%` }} />
    </div>
  );
}

// ── Carte enveloppe externe ───────────────────────────────────────────────────
function EnvCard({ env }) {
  return (
    <div className={`border rounded-xl p-4 ${trafficBg(env.pct)}`}>
      <div className="text-sm font-semibold text-gray-700 mb-0.5">{env.label}</div>
      <div className="text-xs text-gray-500 mb-2">Enveloppe {env.code} · Civile {env.annee_civile}</div>
      <div className="grid grid-cols-3 gap-2 text-center mb-2">
        <div><div className="text-[10px] text-gray-500">Allocation</div><div className="font-bold text-gray-700">{fmt(env.periodes_b)}</div></div>
        <div><div className="text-[10px] text-gray-500">Utilisé</div><div className={`font-bold ${trafficColor(env.pct)}`}>{fmt(env.usage)}</div></div>
        <div><div className="text-[10px] text-gray-500">Solde</div><div className={`font-bold ${env.solde < 0 ? 'text-red-600' : 'text-green-700'}`}>{sign(env.solde)}{fmt(env.solde)}</div></div>
      </div>
      <ProgressBar pct={env.pct} />
      <div className={`text-xs mt-1 text-right font-medium ${trafficColor(env.pct)}`}>{pct(env.pct)}</div>
    </div>
  );
}

// ── Tooltip graphique ─────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
      <div className="font-semibold mb-1">Civile {label}</div>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name} :</span>
          <span className="font-medium">{fmt(p.value)} pér. B</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page principale
// ─────────────────────────────────────────────────────────────────────────────
// Sélecteur de section pour l'onglet dotation
function DotSectionSelect({ value, onChange }) {
  const [sections, setSections] = useState([]);
  useEffect(() => {
    import('../lib/api.js').then(({ api }) => api.sections().then(setSections).catch(() => {}));
  }, []);
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">Section</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white w-52">
        <option value="">— Choisir une section —</option>
        {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
      </select>
    </div>
  );
}

// ── Composant comparaison dotation ───────────────────────────────────────────
function DotationComparaison({ civil }) {
  // Pré-remplir : annee2 = année active, annee1 = année précédente
  const anneeActive = getAnnee(); // ex. '2026-2027'
  const [annee1, setAnnee1] = useState(() => {
    const parts = anneeActive.split('-');
    return parts.length === 2 ? `${parseInt(parts[0])-1}-${parts[0]}` : '';
  });
  const [annee2, setAnnee2] = useState(anneeActive);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [openSecs, setOpenSecs] = useState(new Set());
  const [potFilter, setPotFilter] = useState('organique');
  const [pondere, setPondere] = useState(true);
  // Largeurs de colonnes redimensionnables
  const [colW, setColW] = useState({ nom: 320, niv: 56, quad: 60, q1a: 64, q2a: 64, ta: 80, q1b: 64, q2b: 64, tb: 80, delta: 64 });
  const resizing = useRef(null);

  function startResize(col, e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colW[col];
    resizing.current = { col, startX, startW };
    const onMove = ev => {
      const diff = ev.clientX - resizing.current.startX;
      setColW(prev => ({ ...prev, [resizing.current.col]: Math.max(40, resizing.current.startW + diff) }));
    };
    const onUp = () => { resizing.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function Th({ col, children, align = 'left', rowSpan, colSpan, style = {} }) {
    return (
      <th rowSpan={rowSpan} colSpan={colSpan}
        style={{ width: colW[col] || undefined, minWidth: colW[col] || undefined, position:'relative', userSelect:'none', ...style }}
        className={`px-2 py-2 text-${align} whitespace-nowrap overflow-hidden text-ellipsis`}>
        {children}
        {col && (
          <span onMouseDown={e => startResize(col, e)}
            style={{position:'absolute',right:0,top:0,bottom:0,width:4,cursor:'col-resize',background:'rgba(255,255,255,.2)',zIndex:1}}
            onClick={e => e.stopPropagation()} />
        )}
      </th>
    );
  }

  // Années scolaires disponibles
  const anneesSco = [...new Set(
    civil.flatMap(y => [`${y.annee_civile-1}-${y.annee_civile}`, `${y.annee_civile}-${y.annee_civile+1}`])
  )].sort();

  // Chargement automatique dès que les données civiles sont disponibles
  useEffect(() => {
    if (anneesSco.length > 0 && annee1 && annee2 && !data) {
      charger();
    }
  }, [anneesSco.length]);

  async function charger() {
    if (!annee1 || !annee2) return;
    setLoading(true);
    try {
      const d = await api.dotationComparaison(annee1, annee2, potFilter || null, pondere);
      setData(d);
      setOpenSecs(new Set(d.sections.map(s => s.section)));
    } catch(e) { alert(e.message); }
    finally { setLoading(false); }
  }

  function toggleSec(sec) {
    setOpenSecs(prev => {
      const n = new Set(prev);
      n.has(sec) ? n.delete(sec) : n.add(sec);
      return n;
    });
  }

  const NIV_PAL = ['#f97316','#60a5fa','#1e3a8a','#a855f7','#ec4899'];
  const niveaux = data ? [...new Set(data.sections.flatMap(s => s.ues.map(u => u.ue_niv).filter(Boolean)))]
    .sort((a,b) => parseInt(a.match(/\d+$/)?.[0]??99) - parseInt(b.match(/\d+$/)?.[0]??99)) : [];
  const nivColor = niv => NIV_PAL[niveaux.indexOf(niv) % NIV_PAL.length] || '#6b7280';

  const fmt = n => n > 0 ? n : <span className="text-gray-300 text-xs">—</span>;
  const delta = (d) => {
    if (d === 0) return <span className="text-gray-400 text-xs">=</span>;
    const col = d > 0 ? 'text-red-600' : 'text-green-600';
    return <span className={`font-semibold text-xs ${col}`}>{d > 0 ? '+' : ''}{d}</span>;
  };

  // Totaux globaux
  const totGlob1 = data ? Math.round(data.sections.reduce((s,sec) => s + sec.tot1_total, 0) * 100) / 100 : 0;
  const totGlob2 = data ? Math.round(data.sections.reduce((s,sec) => s + sec.tot2_total, 0) * 100) / 100 : 0;
  const deltaGlob = Math.round((totGlob2 - totGlob1) * 100) / 100;

  return (
    <div className="p-6 space-y-4">
      {/* Sélecteurs années */}
      <div className="flex flex-wrap gap-3 items-end">
        {[['annee1', annee1, setAnnee1, 'Année de référence'], ['annee2', annee2, setAnnee2, 'Année comparée']].map(([k, val, set, lbl]) => (
          <div key={k}>
            <label className="block text-xs text-gray-500 mb-1">{lbl}</label>
            <select value={val} onChange={e => set(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white w-36">
              <option value="">— Choisir —</option>
              {anneesSco.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mode</label>
          <div className="flex rounded border border-gray-300 overflow-hidden text-sm">
            <button onClick={() => setPondere(true)}
              className={`px-3 py-1.5 ${pondere ? 'bg-iip-gold text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              Pér. B pondérées
            </button>
            <button onClick={() => setPondere(false)}
              className={`px-3 py-1.5 border-l border-gray-300 ${!pondere ? 'bg-iip-gold text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              Pér. brutes
            </button>
          </div>
        </div>
        <button onClick={charger} disabled={loading || !annee1 || !annee2 || annee1 === annee2}
          className="bg-iip-gold text-white px-4 py-1.5 rounded text-sm hover:bg-iip-amber disabled:opacity-50 self-end">
          {loading ? 'Chargement...' : 'Comparer'}
        </button>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Enveloppe</label>
          <select value={potFilter} onChange={e => setPotFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
            <option value="">Toutes (IIP)</option>
            <option value="organique">Organique</option>
            <option value="AESI">AESI</option>
            <option value="QUAL">Qualité (QUAL)</option>
            <option value="CF">Cons. Formation (CF)</option>
            <option value="INCL">Inclusif (INCL)</option>
            <option value="HELB">HELB (pér. brutes)</option>
          </select>
        </div>
        {data && (
          <div className="ml-auto flex gap-2">
            <button onClick={() => setOpenSecs(new Set(data.sections.map(s => s.section)))}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1">Tout ouvrir</button>
            <button onClick={() => setOpenSecs(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1">Tout fermer</button>
          </div>
        )}
      </div>

      {data && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <div className="px-4 py-2 border-b flex items-center gap-2 text-xs text-gray-400">
            {potFilter === 'HELB' || !pondere ? 'Périodes brutes (sans pondération)' : 'Pér. B · ×1.5 SUP · ×1.25 DS'} ·
            {potFilter ? <span className="ml-1 bg-iip-gold/10 text-iip-gold font-semibold px-2 py-0.5 rounded">{potFilter}</span> : <span className="ml-1 bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Toutes (IIP)</span>}
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-iip-gold text-white text-xs">
                <Th col="nom" align="left" style={{position:'sticky',left:0,background:'#1B2B4B',zIndex:10}}>Section / UE</Th>
                <Th col="niv" align="center">Niv.</Th>
                <Th col="quad" align="center">Quad.</Th>
                <th className="px-2 py-1 text-center border-l border-white/30" colSpan={3}
                  style={{background:'rgba(255,255,255,.12)'}}>{annee1}</th>
                <th className="px-2 py-1 text-center border-l border-white/30" colSpan={3}
                  style={{background:'rgba(255,255,255,.06)'}}>{annee2}</th>
                <Th col="delta" align="center" style={{borderLeft:'1px solid rgba(255,255,255,.3)'}}>Δ</Th>
              </tr>
              <tr className="bg-iip-gold/80 text-white text-[10px]">
                <th style={{position:'sticky',left:0,background:'rgba(27,43,75,.8)',zIndex:10,width:colW.nom}}></th>
                <th style={{width:colW.niv}}></th>
                <th style={{width:colW.quad}}></th>
                <Th col="q1a" align="right" style={{borderLeft:'1px solid rgba(255,255,255,.2)'}}>Q1</Th>
                <Th col="q2a" align="right">Q2</Th>
                <Th col="ta" align="right" style={{fontWeight:'bold'}}>Total B</Th>
                <Th col="q1b" align="right" style={{borderLeft:'1px solid rgba(255,255,255,.2)'}}>Q1</Th>
                <Th col="q2b" align="right">Q2</Th>
                <Th col="tb" align="right" style={{fontWeight:'bold'}}>Total B</Th>
                <th style={{width:colW.delta}}></th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((sec, si) => {
                const open = openSecs.has(sec.section);
                const secDelta = sec.delta;
                return (
                  <>
                    {/* Ligne section */}
                    <tr key={sec.section}
                      className={`cursor-pointer border-t-2 ${si % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-iip-gold/5`}
                      style={{borderTopColor: '#1B2B4B'}}
                      onClick={() => toggleSec(sec.section)}>
                      <td className="px-3 py-2 font-bold text-iip-gold sticky left-0 z-10 overflow-hidden text-ellipsis whitespace-nowrap"
                        style={{background: si % 2 === 0 ? '#f9fafb' : 'white', width:colW.nom, maxWidth:colW.nom}}>
                        <span className="mr-2 text-xs">{open ? '▼' : '▶'}</span>
                        {sec.section}
                      </td>
                      <td style={{width:colW.niv}}></td><td style={{width:colW.quad}}></td>
                      <td className="px-2 py-2 text-right text-xs border-l border-gray-100" style={{width:colW.q1a}}>{fmt(sec.tot1.q1)}</td>
                      <td className="px-2 py-2 text-right text-xs" style={{width:colW.q2a}}>{fmt(sec.tot1.q2)}</td>
                      <td className="px-2 py-2 text-right font-bold text-iip-gold" style={{width:colW.ta}}>{sec.tot1_total || '—'}</td>
                      <td className="px-2 py-2 text-right text-xs border-l border-gray-100" style={{width:colW.q1b}}>{fmt(sec.tot2.q1)}</td>
                      <td className="px-2 py-2 text-right text-xs" style={{width:colW.q2b}}>{fmt(sec.tot2.q2)}</td>
                      <td className={`px-2 py-2 text-right font-bold ${secDelta > 0 ? 'text-red-600' : secDelta < 0 ? 'text-green-600' : 'text-iip-gold'}`} style={{width:colW.tb}}>{sec.tot2_total || '—'}</td>
                      <td className="px-3 py-2 text-center border-l border-gray-200" style={{width:colW.delta}}>{delta(secDelta)}</td>
                    </tr>
                    {/* Lignes UE */}
                    {open && sec.ues.map((u, i) => (
                      <tr key={`${u.section}-${u.ue_num}`}
                        className={`border-t border-gray-100 ${i%2===0?'bg-white':'bg-gray-50/50'} text-xs`}>
                        <td className="px-3 py-1.5 sticky left-0 z-10 pl-8 overflow-hidden text-ellipsis whitespace-nowrap"
                          style={{background: i%2===0?'white':'#fafafa', width:colW.nom, maxWidth:colW.nom}}>
                          <span className="font-mono text-gray-400 mr-2">UE {u.ue_num}</span>
                          <span className="text-gray-600">{u.ue_nom}</span>
                        </td>
                        <td className="px-2 py-1.5 text-center" style={{width:colW.niv}}>
                          {u.ue_niv && <span className="text-[9px] font-bold px-1 py-0.5 rounded text-white"
                            style={{background: nivColor(u.ue_niv)}}>{u.ue_niv}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-center text-gray-400">{u.ue_quad||'—'}</td>
                        <td className="px-2 py-1.5 text-right border-l border-gray-100 text-gray-600">{fmt(u.c1.q1)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-600">{fmt(u.c1.q2)}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-gray-700">{u.t1||'—'}</td>
                        <td className="px-2 py-1.5 text-right border-l border-gray-100 text-gray-600">{fmt(u.c2.q1)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-600">{fmt(u.c2.q2)}</td>
                        <td className={`px-2 py-1.5 text-right font-semibold ${u.delta > 0 ? 'text-red-500' : u.delta < 0 ? 'text-green-500' : 'text-gray-700'}`}>{u.t2||'—'}</td>
                        <td className="px-3 py-1.5 text-center border-l border-gray-200">{delta(u.delta)}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
              {/* Ligne totaux globaux */}
              <tr className="border-t-2 border-iip-gold bg-iip-gold/5 font-bold">
                <td className="px-3 py-2.5 text-iip-gold sticky left-0 bg-iip-gold/5 z-10">TOTAL GÉNÉRAL</td>
                <td></td><td></td>
                <td className="px-2 py-2.5 text-right border-l border-gray-200">
                  {fmt(Math.round(data.sections.reduce((s,sec)=>s+sec.tot1.q1,0)*100)/100)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  {fmt(Math.round(data.sections.reduce((s,sec)=>s+sec.tot1.q2,0)*100)/100)}
                </td>
                <td className="px-2 py-2.5 text-right text-iip-gold text-base">{totGlob1}</td>
                <td className="px-2 py-2.5 text-right border-l border-gray-200">
                  {fmt(Math.round(data.sections.reduce((s,sec)=>s+sec.tot2.q1,0)*100)/100)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  {fmt(Math.round(data.sections.reduce((s,sec)=>s+sec.tot2.q2,0)*100)/100)}
                </td>
                <td className={`px-2 py-2.5 text-right text-base ${deltaGlob > 0 ? 'text-red-600' : deltaGlob < 0 ? 'text-green-600' : 'text-iip-gold'}`}>{totGlob2}</td>
                <td className="px-3 py-2.5 text-center border-l border-gray-200">{delta(deltaGlob)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Pilotage() {
  const anneeActive = getAnnee();
  const [tab, setTab]               = useState('synthese'); // synthese | detail | config
  const [civil, setCivil]           = useState([]);
  const [selYear, setSelYear]       = useState(null);
  const [detail, setDetail]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Config state
  const [editDot, setEditDot]       = useState(null);   // { annee_civile, dotation_organique, usage_historique_organique, notes }
  const [editEnv, setEditEnv]       = useState(null);   // enveloppe en édition
  const [newYear, setNewYear]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [ueList, setUeList]         = useState([]);
  const [dotUE, setDotUE]           = useState(null);    // résultat dotation par UE
  const [dotSection, setDotSection] = useState('');
  const [dotAnnee, setDotAnnee]     = useState('');
  const [dotMode, setDotMode]       = useState('scolaire');
  const [dotLoading, setDotLoading] = useState(false);

  // Charger la synthèse
  const load = () => {
    setLoading(true);
    api.pilotageCivil()
      .then(d => {
        setCivil(d);
        if (d.length && !selYear) setSelYear(d[d.length - 1].annee_civile); // dernière année par défaut
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Charger le détail quand on change d'année ou d'onglet
  useEffect(() => {
    if (!selYear || tab !== 'detail') return;
    setLoadingDetail(true);
    api.pilotageCivilDetail(selYear)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoadingDetail(false));
  }, [selYear, tab]);

  // Charger les UEs avec pot pour la config
  useEffect(() => {
    if (tab === 'config') {
      api.ueWithPot(anneeActive, null, true).then(setUeList).catch(console.error);
    }
  }, [tab]);

  const selectedData = civil.find(y => y.annee_civile === selYear);

  // Données graphique multi-années
  const chartData = useMemo(() => civil.map(y => ({
    annee: y.annee_civile,
    'Dotation organique': y.dotation_organique,
    'Usage organique':    y.usage_organique,
    'Total enveloppes':   y.enveloppes.reduce((s, e) => s + (e.periodes_b || 0), 0),
    'Usage enveloppes':   y.enveloppes.reduce((s, e) => s + (e.usage || 0), 0),
  })), [civil]);

  // Données PEP pour le graphique combiné (toutes années avec PEP, triées)
  const pepChartData = useMemo(() =>
    civil
      .filter(y => y.periodes_eleves > 0 || y.pep_calculee > 0)
      .sort((a, b) => a.annee_civile - b.annee_civile)
      .map(y => ({
        annee: y.annee_civile,
        'PEP brute (Menu 7)': y.periodes_eleves || null,
        'PEP pondérée (mécan.)': y.pep_calculee || null,
        'PEP réf.':  y.pep_reference || null,
        'Dotation':  y.dotation_organique > 0 ? y.dotation_organique : null,
      })),
    [civil]
  );

  // Table analyse PEP → dotation (mécanisme ±8 %, utilise pep_calculee = valeur pondérée Menu 5.5)
  const pepTableData = useMemo(() => {
    return civil
      .filter(y => y.pep_calculee > 0 || y.dotation_organique > 0)
      .sort((a, b) => a.annee_civile - b.annee_civile)
      .map(y => {
        const pep_calc = y.pep_calculee;   // PEP pondérée utilisée pour CE calcul de dotation
        const pep_ref  = y.pep_reference;
        const ecart    = (pep_calc != null && pep_ref) ? (pep_calc / pep_ref - 1) * 100 : null;
        const zone     = ecart == null ? null :
          Math.abs(ecart) <= 8 ? 'NEUTRE' :
          ecart > 8 ? 'HAUSSE' : 'BAISSE';
        // Estimation perte si baisse (Art. 6 A.Gt 22-11-2002) : (dotation/4) × min(|%|, 50)
        const perte = (zone === 'BAISSE' && y.dotation_organique > 0)
          ? Math.round((y.dotation_organique / 4) * Math.min(Math.abs(ecart), 50) / 100)
          : null;
        return {
          annee_civile:      y.annee_civile,
          pep_annee_utilisee: y.pep_annee_utilisee,
          pep_brute:         y.periodes_eleves,   // Menu 7 (info context)
          pep_calc,                               // Menu 5.5 (pivot du mécanisme)
          pep_ref,
          ecart,
          zone,
          perte,
          dotation:      y.dotation_organique > 0 ? y.dotation_organique : null,
          dot_utilisable: y.dotation_utilisable || null,
          derogation:    y.notes?.includes('Dérogation') || false,
          partiel:       y.notes?.includes('artiel') || false,
        };
      });
  }, [civil]);

  // ── Onglet synthèse ─────────────────────────────────────────────────────────
  const renderSynthese = () => {
    if (!selectedData) return <div className="text-gray-400 py-12 text-center">Aucune donnée</div>;
    const d = selectedData;
    return (
      <div className="space-y-6">
        {/* KPIs organiques */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            Dotation organique · Civile {d.annee_civile}
            {d.source === 'historique' && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">données historiques</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Dotation" value={fmt(d.dotation_organique)} sub="périodes B" />
            <Kpi label="Utilisées" value={fmt(d.usage_organique)} sub="périodes B"
              color={trafficColor(d.pct_organique)} />
            <Kpi label="Solde"
              value={<span className={d.solde_organique < 0 ? 'text-red-600' : 'text-green-700'}>{sign(d.solde_organique)}{fmt(d.solde_organique)}</span>}
              sub={d.solde_organique < -200 ? '⚠ Pénalité ×1,5 possible' : 'périodes B'} />
            <div className={`rounded-xl border p-4 shadow-sm ${trafficBg(d.pct_organique)}`}>
              <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Taux d'utilisation</div>
              <div className={`text-2xl font-bold ${trafficColor(d.pct_organique)}`}>{pct(d.pct_organique)}</div>
              <ProgressBar pct={d.pct_organique} />
            </div>
          </div>
        </div>

        {/* Enveloppes extérieures */}
        {d.enveloppes.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Enveloppes extérieures</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {d.enveloppes.map(e => <EnvCard key={e.code} env={e} />)}
            </div>
          </div>
        )}

        {/* Graphique multi-années */}
        {chartData.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-4">Comparaison pluriannuelle — dotation</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="annee" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v / 1000, 1) + 'k'} />
                <Tooltip content={<ChartTip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Dotation organique" fill="#d1a846" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Usage organique"    fill="#4a7fa5" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Total enveloppes"   fill="#b8e0d2" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Usage enveloppes"   fill="#7bc4a8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Section PEP */}
        {pepChartData.length > 0 && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Périodes-élèves pondérées (PEP) · Art. 3 A.Gt 22-11-2002
                </div>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  Dotation civile N = basée sur PEP N-2 · Bande neutre ±8 %
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Dérogations COVID: dotations 2022/2023/2024 ont utilisé PEP 2019 (A.Gt 27-10-2022).
                PEP de référence à saisir dans Configuration (valeur pivot HOD).
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={pepChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="annee" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="pep" tick={{ fontSize: 10 }} tickFormatter={v => (v/1000).toFixed(0)+'k'}
                    label={{ value: 'PEP', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <YAxis yAxisId="dot" orientation="right" tick={{ fontSize: 10 }}
                    tickFormatter={v => (v/1000).toFixed(1)+'k'}
                    label={{ value: 'Dot. B', angle: 90, position: 'insideRight', fontSize: 10 }} />
                  <Tooltip formatter={(v, n) => [v?.toLocaleString('fr-BE'), n]} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="pep" dataKey="PEP"      fill="#6b7fff" radius={[3,3,0,0]} name="PEP (pér.-élèves)" />
                  <Line yAxisId="pep" dataKey="PEP réf." stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" name="PEP réf." />
                  <Line yAxisId="dot" dataKey="Dotation" stroke="#d1a846" strokeWidth={2} dot={{ r: 3 }} name="Dotation org. (pér. B)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Table PEP & calcul dotation */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Mécanisme d'ajustement de dotation
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 text-left">Dotation</th>
                      <th className="px-3 py-2 text-right">PEP N-2 utilisée</th>
                      <th className="px-3 py-2 text-right">PEP pondérée (mécan.)</th>
                      <th className="px-3 py-2 text-right">PEP référence</th>
                      <th className="px-3 py-2 text-right">Écart ±8 %</th>
                      <th className="px-3 py-2 text-center">Zone</th>
                      <th className="px-3 py-2 text-right">Dotation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pepTableData.map(row => (
                      <tr key={row.annee_civile} className={`border-t border-gray-100 ${row.annee_civile === selYear ? 'bg-iip-gold/5' : 'hover:bg-gray-50'}`}>
                        <td className={`px-3 py-2 font-semibold ${row.annee_civile === selYear ? 'text-iip-gold' : 'text-gray-700'}`}>
                          {row.annee_civile} {row.annee_civile === selYear ? '◄' : ''}
                          {row.derogation && <span className="ml-1 text-[10px] bg-amber-100 text-amber-600 px-1 rounded">dérог.</span>}
                          {row.partiel && <span className="ml-1 text-[10px] bg-blue-100 text-blue-600 px-1 rounded">partiel</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500 font-mono text-xs">{row.pep_annee_utilisee || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {row.pep_calc ? fmt(row.pep_calc) : '—'}
                          {row.pep_brute ? <span className="block text-[10px] text-gray-400">brute: {fmt(row.pep_brute)}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-500">{row.pep_ref ? fmt(row.pep_ref) : <span className="text-gray-300">à saisir</span>}</td>
                        <td className="px-3 py-2 text-right">
                          {row.ecart != null
                            ? <span className={Math.abs(row.ecart) > 8 ? (row.ecart > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold') : 'text-gray-600'}>
                                {sign(row.ecart)}{fmt(row.ecart, 1)} %
                              </span>
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.zone === 'NEUTRE' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Neutre ±8 %</span>}
                          {row.zone === 'HAUSSE' && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">↑ Hausse &gt;+8 %</span>}
                          {row.zone === 'BAISSE' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">↓ Baisse &lt;−8 %</span>}
                          {row.zone == null && <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.dotation ? <span className="font-mono">{fmt(row.dotation)}</span> : <span className="text-gray-300 text-xs">—</span>}
                          {row.dot_utilisable && row.dot_utilisable !== row.dotation ? <span className="block text-[10px] text-gray-400">util: {fmt(row.dot_utilisable)}</span> : null}
                          {row.zone === 'BAISSE' && row.perte ? <span className="block text-[10px] text-red-500">−{fmt(row.perte)} pér. estimées</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Onglet détail par section ──────────────────────────────────────────────
  const renderDetail = () => {
    if (loadingDetail) return <div className="text-gray-400 py-8 text-center">Chargement…</div>;
    if (!detail) return null;
    if (detail.source === 'historique') return <p className="text-gray-500 py-8 text-center">Données historiques — pas de détail par section disponible.</p>;

    // Grouper par section
    const bySection = {};
    for (const row of detail.sections || []) {
      if (!bySection[row.section]) bySection[row.section] = { organique: 0, pots: {} };
      if (row.pot === 'organique') bySection[row.section].organique += row.usage;
      else bySection[row.section].pots[row.pot] = (bySection[row.section].pots[row.pot] || 0) + row.usage;
    }
    const rows = Object.entries(bySection).sort((a, b) => b[1].organique - a[1].organique);
    const total = rows.reduce((s, [, v]) => s + v.organique, 0);

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 text-left">Section</th>
              <th className="px-4 py-3 text-right">Usage organique (pér. B)</th>
              <th className="px-4 py-3 text-right">% dotation ({fmt(detail.dotation_organique)})</th>
              <th className="px-4 py-3 text-left">Enveloppes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([sec, v]) => (
              <tr key={sec} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-700">{sec || '—'}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(v.organique)}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={trafficColor(detail.dotation_organique ? v.organique / detail.dotation_organique * 100 : null)}>
                    {detail.dotation_organique ? pct(v.organique / detail.dotation_organique * 100) : '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-500">
                  {Object.entries(v.pots).map(([p, u]) => <span key={p} className="mr-2">{p}: {fmt(u)}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-iip-gold/5 text-xs font-semibold">
            <tr className="border-t-2 border-iip-gold/20">
              <td className="px-4 py-2.5 text-iip-gold">TOTAL</td>
              <td className="px-4 py-2.5 text-right font-mono text-iip-gold">{fmt(total)}</td>
              <td className="px-4 py-2.5 text-right text-iip-gold">{detail.dotation_organique ? pct(total / detail.dotation_organique * 100) : '—'}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  // ── Onglet configuration ───────────────────────────────────────────────────
  const saveDotation = async () => {
    if (!editDot) return;
    setSaving(true);
    try {
      await api.dotationCivilePut(editDot.annee_civile, {
        dotation_organique:            parseFloat(editDot.dotation_organique) || 0,
        usage_historique_organique:    editDot.usage_historique_organique !== '' ? parseFloat(editDot.usage_historique_organique) : null,
        periodes_eleves:               editDot.periodes_eleves !== '' ? parseFloat(editDot.periodes_eleves) : null,
        pep_reference:                 editDot.pep_reference !== '' ? parseFloat(editDot.pep_reference) : null,
        pep_annee_utilisee:            editDot.pep_annee_utilisee !== '' ? parseInt(editDot.pep_annee_utilisee) : null,
        notes: editDot.notes || null,
      });
      setEditDot(null);
      load();
    } finally { setSaving(false); }
  };

  const saveEnv = async () => {
    if (!editEnv) return;
    setSaving(true);
    try {
      const body = {
        label: editEnv.label,
        periodes_b: parseFloat(editEnv.periodes_b) || 0,
        usage_historique: editEnv.usage_historique !== '' ? parseFloat(editEnv.usage_historique) : null,
        notes: editEnv.notes || null,
      };
      if (editEnv.id) await api.enveloppePut(editEnv.id, body);
      else await api.enveloppePost({ ...body, code: editEnv.code, annee_civile: parseInt(editEnv.annee_civile) });
      setEditEnv(null);
      load();
    } finally { setSaving(false); }
  };

  const addYear = async () => {
    const y = parseInt(newYear);
    if (!y || y < 2000 || y > 2100) return;
    setSaving(true);
    try {
      await api.dotationCivilePut(y, { dotation_organique: 0 });
      setNewYear('');
      load();
    } finally { setSaving(false); }
  };

  const deleteYear = async (y) => {
    if (!confirm(`Supprimer l'année civile ${y} et toutes ses enveloppes ?`)) return;
    await api.dotationCivileDelete(y);
    load();
  };

  const renderConfig = () => (
    <div className="space-y-6">
      {/* Dotations organiques */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 text-sm">Dotations organiques par année civile</h3>
          <div className="flex gap-2">
            <input value={newYear} onChange={e => setNewYear(e.target.value)} placeholder="Ex: 2027"
              className="border border-gray-300 rounded px-2 py-1 text-sm w-24" />
            <button onClick={addYear} disabled={saving || !newYear} className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded">Ajouter</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr><th className="px-4 py-2 text-left">Année civile</th><th className="px-4 py-2 text-right">Dotation (pér. B)</th><th className="px-4 py-2 text-right">PEP</th><th className="px-4 py-2 text-right">PEP réf.</th><th className="px-4 py-2 text-right">PEP an. utilisée</th><th className="px-4 py-2 text-right">Usage historique</th><th className="px-4 py-2 text-left">Notes</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {civil.map(y => editDot?.annee_civile === y.annee_civile ? (
              <tr key={y.annee_civile} className="border-t border-gray-100 bg-iip-gold/5">
                <td className="px-4 py-2 font-semibold text-iip-gold">{y.annee_civile}</td>
                <td className="px-4 py-2"><input type="number" value={editDot.dotation_organique} onChange={e => setEditDot({ ...editDot, dotation_organique: e.target.value })} className="border border-gray-300 rounded px-2 py-1 text-sm w-24 text-right" /></td>
                <td className="px-4 py-2"><input type="number" value={editDot.periodes_eleves ?? ''} onChange={e => setEditDot({ ...editDot, periodes_eleves: e.target.value })} placeholder="HOD" className="border border-gray-300 rounded px-2 py-1 text-sm w-28 text-right" /></td>
                <td className="px-4 py-2"><input type="number" value={editDot.pep_reference ?? ''} onChange={e => setEditDot({ ...editDot, pep_reference: e.target.value })} placeholder="HOD" className="border border-gray-300 rounded px-2 py-1 text-sm w-28 text-right" /></td>
                <td className="px-4 py-2"><input type="number" value={editDot.pep_annee_utilisee ?? ''} onChange={e => setEditDot({ ...editDot, pep_annee_utilisee: e.target.value })} placeholder="ex: 2023" className="border border-gray-300 rounded px-2 py-1 text-sm w-20 text-right" /></td>
                <td className="px-4 py-2"><input type="number" value={editDot.usage_historique_organique ?? ''} onChange={e => setEditDot({ ...editDot, usage_historique_organique: e.target.value })} placeholder="calculé si vide" className="border border-gray-300 rounded px-2 py-1 text-sm w-28 text-right" /></td>
                <td className="px-4 py-2"><input value={editDot.notes || ''} onChange={e => setEditDot({ ...editDot, notes: e.target.value })} className="border border-gray-300 rounded px-2 py-1 text-sm w-full" /></td>
                <td className="px-4 py-2 flex gap-1 justify-end">
                  <button onClick={saveDotation} disabled={saving} className="bg-iip-gold text-white text-xs px-2 py-1 rounded">✓</button>
                  <button onClick={() => setEditDot(null)} className="text-gray-500 text-xs px-2 py-1 rounded border">✕</button>
                </td>
              </tr>
            ) : (
              <tr key={y.annee_civile} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-semibold text-gray-700">{y.annee_civile}</td>
                <td className="px-4 py-2.5 text-right font-mono">{y.dotation_organique > 0 ? fmt(y.dotation_organique) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2.5 text-right font-mono text-blue-700">{y.periodes_eleves ? fmt(y.periodes_eleves) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2.5 text-right font-mono text-red-400">{y.pep_reference ? fmt(y.pep_reference) : <span className="text-gray-300">à saisir</span>}</td>
                <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{y.pep_annee_utilisee || '—'}</td>
                <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{y.source === 'historique' ? fmt(y.usage_organique) : '(calculé)'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 max-w-xs truncate">{y.notes || ''}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setEditDot({ annee_civile: y.annee_civile, dotation_organique: y.dotation_organique, periodes_eleves: y.periodes_eleves ?? '', pep_reference: y.pep_reference ?? '', pep_annee_utilisee: y.pep_annee_utilisee ?? '', usage_historique_organique: y.source === 'historique' ? y.usage_organique : '', notes: y.notes || '' })} className="text-iip-gold hover:text-iip-amber text-xs border border-iip-gold/30 px-2 py-1 rounded">Modifier</button>
                    <button onClick={() => deleteYear(y.annee_civile)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1">🗑</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Enveloppes extérieures */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-700 text-sm">Enveloppes extérieures</h3>
          <button onClick={() => setEditEnv({ id: null, code: 'QUAL', label: '', annee_civile: selYear || 2026, periodes_b: 0, usage_historique: '', notes: '' })} className="bg-iip-gold hover:bg-iip-amber text-white text-xs px-3 py-1.5 rounded">+ Ajouter</button>
        </div>
        {editEnv && !editEnv.id && (
          <div className="p-4 bg-iip-gold/5 border-b border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
              <div><label className="block text-xs text-gray-500 mb-0.5">Code</label>
                <select value={editEnv.code} onChange={e => setEditEnv({ ...editEnv, code: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full">
                  {['QUAL', 'CF', 'INCL'].map(c => <option key={c}>{c}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-0.5">Libellé</label>
                <input value={editEnv.label} onChange={e => setEditEnv({ ...editEnv, label: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" /></div>
              <div><label className="block text-xs text-gray-500 mb-0.5">Année civile</label>
                <input type="number" value={editEnv.annee_civile} onChange={e => setEditEnv({ ...editEnv, annee_civile: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" /></div>
              <div><label className="block text-xs text-gray-500 mb-0.5">Périodes B</label>
                <input type="number" value={editEnv.periodes_b} onChange={e => setEditEnv({ ...editEnv, periodes_b: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" /></div>
              <div className="flex gap-1">
                <button onClick={saveEnv} disabled={saving} className="bg-iip-gold text-white text-xs px-3 py-1.5 rounded w-full">Créer</button>
                <button onClick={() => setEditEnv(null)} className="border text-gray-500 text-xs px-2 py-1.5 rounded">✕</button>
              </div>
            </div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr><th className="px-4 py-2 text-left">Code</th><th className="px-4 py-2 text-left">Libellé</th><th className="px-4 py-2 text-right">Civile</th><th className="px-4 py-2 text-right">Allocation (B)</th><th className="px-4 py-2 text-right">Usage hist.</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {civil.flatMap(y => y.enveloppes.map(e => editEnv?.id === e.id ? (
              <tr key={e.id} className="border-t border-gray-100 bg-iip-gold/5">
                <td className="px-4 py-2 font-mono text-iip-gold">{e.code}</td>
                <td className="px-4 py-2"><input value={editEnv.label} onChange={ev => setEditEnv({ ...editEnv, label: ev.target.value })} className="border border-gray-300 rounded px-2 py-1 text-sm w-full" /></td>
                <td className="px-4 py-2 text-right">{e.annee_civile}</td>
                <td className="px-4 py-2"><input type="number" value={editEnv.periodes_b} onChange={ev => setEditEnv({ ...editEnv, periodes_b: ev.target.value })} className="border border-gray-300 rounded px-2 py-1 text-sm w-24 text-right" /></td>
                <td className="px-4 py-2"><input type="number" value={editEnv.usage_historique ?? ''} onChange={ev => setEditEnv({ ...editEnv, usage_historique: ev.target.value })} placeholder="calculé" className="border border-gray-300 rounded px-2 py-1 text-sm w-24 text-right" /></td>
                <td className="px-4 py-2 flex gap-1 justify-end">
                  <button onClick={saveEnv} disabled={saving} className="bg-iip-gold text-white text-xs px-2 py-1 rounded">✓</button>
                  <button onClick={() => setEditEnv(null)} className="text-gray-500 text-xs px-2 py-1 rounded border">✕</button>
                </td>
              </tr>
            ) : (
              <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono font-semibold text-gray-700">{e.code}</td>
                <td className="px-4 py-2.5 text-gray-600">{e.label}</td>
                <td className="px-4 py-2.5 text-right">{e.annee_civile}</td>
                <td className="px-4 py-2.5 text-right font-mono">{fmt(e.periodes_b)}</td>
                <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{e.source === 'historique' ? fmt(e.usage) : '(calculé)'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setEditEnv({ id: e.id, label: e.label, periodes_b: e.periodes_b, usage_historique: e.usage_historique ?? '', notes: e.notes || '' })} className="text-iip-gold hover:text-iip-amber text-xs border border-iip-gold/30 px-2 py-1 rounded">Modifier</button>
                    <button onClick={async () => { if (confirm('Supprimer cette enveloppe ?')) { await api.enveloppeDelete(e.id); load(); } }} className="text-red-400 hover:text-red-600 text-xs px-2 py-1">🗑</button>
                  </div>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>

      {/* UEs avec pot */}
      {ueList.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-700 text-sm">Attribution des enveloppes par UE</h3>
              <p className="text-xs text-gray-400 mt-0.5">Assigne chaque UE à une enveloppe (QUAL, CF, INCL, AESI, organique...)</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select onChange={e => {
                  const s = e.target.value;
                  api.ueWithPot(anneeActive, s || null, true).then(setUeList);
                }}
                className="border border-gray-200 rounded px-2 py-1 text-xs bg-white">
                <option value="">— Toutes sections —</option>
                {[...new Set(ueList.map(u => u.section).filter(Boolean))].sort().map(s =>
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">Section</th>
                <th className="px-4 py-2 text-left">UE</th>
                <th className="px-4 py-2 text-left">Code FWB</th>
                <th className="px-4 py-2 text-center">Pot effectif</th>
                <th className="px-4 py-2 text-center">Override</th>
              </tr>
            </thead>
            <tbody>
              {ueList.map(u => (
                <tr key={`${u.ue_num}-${u.section}`} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-xs text-gray-400">{u.section}</td>
                  <td className="px-4 py-2.5 text-gray-700 text-xs">{u.ue_nom}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{u.ue_code_fwb || '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="text-xs bg-iip-gold/10 text-iip-gold font-semibold px-2 py-0.5 rounded">
                      {u.pot_effectif || '?'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <select value={u.pot_code || ''} onChange={async e => {
                      await api.ueSetPot(u.ue_num, anneeActive, e.target.value || null);
                      api.ueWithPot(anneeActive, null, true).then(setUeList);
                    }} className="border border-gray-200 rounded px-1.5 py-0.5 text-xs">
                      <option value="">Auto</option>
                      {['QUAL', 'CF', 'INCL', 'AESI', 'organique'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="px-3 md:px-6 py-4 max-w-6xl mx-auto space-y-5">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-title text-xl text-iip-gold">📊 Pilotage des dotations</h1>
          <p className="text-xs text-gray-400 mt-0.5">Suivi par année civile · Enveloppes extérieures · Comparaison pluriannuelle</p>
        </div>
        {/* Sélecteur d'année civile */}
        <div className="flex gap-1.5 flex-wrap">
          {civil.map(y => (
            <button key={y.annee_civile} onClick={() => setSelYear(y.annee_civile)}
              className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition ${
                selYear === y.annee_civile
                  ? 'bg-iip-gold text-white border-iip-gold shadow'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-iip-gold/50'
              }`}>
              {y.annee_civile}
              {y.pct_organique > 95 && <span className="ml-1 text-xs">⚠</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-0.5 border-b border-gray-200">
        {[['synthese', '🏠 Synthèse'], ['detail', '📋 Détail par section'], ['dotation', '📊 Dotation par UE'], ['config', '⚙ Configuration']].map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`text-sm px-4 py-2 -mb-px border-b-2 transition font-medium ${tab === k ? 'border-iip-gold text-iip-gold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="text-gray-400 py-12 text-center">Chargement…</div>
      ) : civil.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-700">
          Aucune année civile configurée. Allez dans <strong>Configuration</strong> pour ajouter les premières années.
        </div>
      ) : (
        <>
          {tab === 'synthese' && renderSynthese()}
          {tab === 'detail'   && renderDetail()}
          {tab === 'dotation' && <DotationComparaison civil={civil} />}
                    {tab === 'config'   && renderConfig()}
        </>
      )}
    </div>
  );
}

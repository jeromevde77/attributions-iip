import { useState, useEffect, useMemo } from 'react';
import { api, getAnnee } from '../lib/api.js';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid, ReferenceLine,
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
      api.ueWithPot(anneeActive).then(setUeList).catch(console.error);
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
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-4">Comparaison pluriannuelle</div>
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
        dotation_organique: parseFloat(editDot.dotation_organique) || 0,
        usage_historique_organique: editDot.usage_historique_organique !== '' ? parseFloat(editDot.usage_historique_organique) : null,
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
            <tr><th className="px-4 py-2 text-left">Année civile</th><th className="px-4 py-2 text-right">Dotation (pér. B)</th><th className="px-4 py-2 text-right">Usage historique</th><th className="px-4 py-2 text-left">Notes</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {civil.map(y => editDot?.annee_civile === y.annee_civile ? (
              <tr key={y.annee_civile} className="border-t border-gray-100 bg-iip-gold/5">
                <td className="px-4 py-2 font-semibold text-iip-gold">{y.annee_civile}</td>
                <td className="px-4 py-2"><input type="number" value={editDot.dotation_organique} onChange={e => setEditDot({ ...editDot, dotation_organique: e.target.value })} className="border border-gray-300 rounded px-2 py-1 text-sm w-28 text-right" /></td>
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
                <td className="px-4 py-2.5 text-right font-mono">{fmt(y.dotation_organique)}</td>
                <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{y.source === 'historique' ? fmt(civil.find(c => c.annee_civile === y.annee_civile)?.usage_organique) : '(calculé)'}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">{y.notes || ''}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setEditDot({ annee_civile: y.annee_civile, dotation_organique: y.dotation_organique, usage_historique_organique: y.source === 'historique' ? y.usage_organique : '', notes: y.notes || '' })} className="text-iip-gold hover:text-iip-amber text-xs border border-iip-gold/30 px-2 py-1 rounded">Modifier</button>
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
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700 text-sm">UEs liées à une enveloppe</h3>
            <p className="text-xs text-gray-400 mt-0.5">UEs auto-détectées (code FWB 9803xx) ou taggées manuellement. L'enveloppe réelle prime sur l'auto-détection.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr><th className="px-4 py-2 text-left">UE</th><th className="px-4 py-2 text-left">Code FWB</th><th className="px-4 py-2 text-center">Pot effectif</th><th className="px-4 py-2 text-center">Override</th></tr>
            </thead>
            <tbody>
              {ueList.map(u => (
                <tr key={u.ue_num} className="border-t border-gray-100 hover:bg-gray-50">
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
                      api.ueWithPot(anneeActive).then(setUeList);
                    }} className="border border-gray-200 rounded px-1.5 py-0.5 text-xs">
                      <option value="">Auto</option>
                      {['QUAL', 'CF', 'INCL', 'organique'].map(c => <option key={c} value={c}>{c}</option>)}
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
        {[['synthese', '🏠 Synthèse'], ['detail', '📋 Détail par section'], ['config', '⚙ Configuration']].map(([k, lbl]) => (
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
          {tab === 'config'   && renderConfig()}
        </>
      )}
    </div>
  );
}

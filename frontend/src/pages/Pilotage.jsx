import { ICONE_AXE } from '../lib/iconesAxes.js';
import { IconReportAnalytics, IconReportMoney, IconChartInfographic, IconSchool, IconBuildingBank, IconCoin, IconRosette } from '@tabler/icons-react';
import { droitEffectif } from '../lib/modules.js';
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { api, getAnnee, getUser, authHeaders } from '../lib/api.js';
import { IconChartBar, IconHome, IconUsers, IconSettings, IconChevronRight, IconChevronDown, IconPrinter, IconRotateClockwise, IconCheck, IconX, IconTrash, IconCash, IconCalendar, IconArrowsLeftRight, IconScale, IconUsersGroup, IconUserCheck } from '@tabler/icons-react';
import { PageHeader, Tabs, RailLateral, OuvrirEditions, TuileEtat, Chevron, Fenetre } from '../components/ui.jsx';
import { createPortal } from 'react-dom';
import Distributions from '../components/Distributions.jsx';
import Population from '../components/Population.jsx';
import PilotagePresences from '../components/PilotagePresences.jsx';
import PlanActionQualite from '../components/PlanActionQualite.jsx';
import PopulationEcole from '../components/PopulationEcole.jsx';
import PersonnelEcole from '../components/PersonnelEcole.jsx';
import CentreImpressionCentral from '../components/CentreImpressionCentral.jsx';
import Budget from './Budget.jsx';
import RapportStatistique from '../components/RapportStatistique.jsx';
import RepartitionPeriodes from './RepartitionPeriodes.jsx';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid, ReferenceLine,
  ComposedChart, Line,
} from 'recharts';
import { ouvrirApercu } from '../lib/apercu.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { couleursGraphique } from '../lib/couleurs.js';
import { reglagesGraphique } from '../lib/design.js';

// ── Utilitaires ──────────────────────────────────────────────────────────────
const fmt  = (v, d = 0) => (v == null ? '—' : Number(v).toLocaleString('fr-BE', { maximumFractionDigits: d }));
const pct  = (v) => (v == null ? '—' : `${fmt(v, 1)} %`);
const sign = (v) => (v > 0 ? '+' : '');

/*
 * OR, ARGENT, BRONZE — et pas de rouge.
 *
 * L'écran peignait en ROUGE un taux d'emploi de 96,7 %. Or 96,7 %, c'est une
 * dotation presque entièrement employée : c'est le MEILLEUR résultat possible,
 * pas une alerte. Le rouge disait « danger » là où il fallait lire « bravo » —
 * et Lucie n'a d'ailleurs pas de rouge : elle a du BRIQUE, et il est réservé à
 * ce qui supprime.
 *
 * L'échelle devient donc une échelle de PODIUM, qui se lit sans légende :
 *   · OR (95 à 100 %)      — la dotation est employée, et c'est le but ;
 *   · ARGENT (85 à 95 %)   — correct, il reste de la marge ;
 *   · BRONZE (sous 85 %)   — on laisse des périodes sur la table ;
 *   · BRIQUE (au-delà de 100) — le dépassement, seul vrai problème, et seule
 *     occasion d'employer la couleur de l'alerte.
 *
 * Un taux qui dépasse n'est pas « pire » qu'un taux trop bas : c'est un autre
 * fait. C'est pourquoi il sort du podium plutôt que d'en occuper le dernier
 * rang.
 */
/* LE PODIUM EST RETIRÉ (Charles, 29 septembre 2026 : « couleurs ! ») : or,
   argent et bronze étaient trois teintes qu'aucun réglage ne porte — et l'or
   est celui de l'épreuve intégrée, il ne dit que cela. Le taux se lit dans
   les ÉTATS de la configuration, sur fond blanc, chiffre à l'encre :
     95–100 % réussi (la dotation est employée, c'est le but) · 85–95 % en
     cours · sous 85 % à surveiller (des périodes restent sur la table) ·
     au-delà de 100 % à corriger (le dépassement, seul vrai problème). */
export function tonDotation(p) {
  const blanc = { fond: '#FFFFFF', bord: 'rgb(var(--gris-200))' };
  if (p == null) return { teinte: 'rgb(var(--gris-300))', ...blanc, rang: null, etat: 'neutre' };
  if (p > 100)   return { teinte: 'var(--c-refuse)', ...blanc, rang: 'dépassement', etat: 'corriger' };
  if (p >= 95)   return { teinte: 'var(--c-reussi)', ...blanc, rang: 'or', etat: 'reussi' };
  if (p >= 85)   return { teinte: 'var(--c-disponible)', ...blanc, rang: 'argent', etat: 'disponible' };
  return { teinte: 'var(--c-attente)', ...blanc, rang: 'bronze', etat: 'surveiller' };
}
// Le chiffre reste à l'encre : la couleur va à la barre, jamais au texte.
function trafficColor(p) {
  return tonDotation(p).rang === 'dépassement' ? 'text-iip-texte font-bold' : 'text-iip-texte';
}
function trafficBg() { return ''; }

// ── KPI card ─────────────────────────────────────────────────────────────────
// LE STANDARD (3.1.249) : la tuile de la maison ; la couleur devient un état.
const etatDeCouleur = c => /emerald|green|reussi/.test(c || '') ? 'reussi' : /amber|orange|attente/.test(c || '') ? 'surveiller' : /red|danger|refuse/.test(c || '') ? 'corriger' : /violet|purple|faveur/.test(c || '') ? 'faveur' : 'neutre';
function Kpi({ label, value, sub, color = '' }) {
  return <TuileEtat etat={etatDeCouleur(color)} valeur={value} libelle={label} precision={sub} />;
}

// ── Barre de progression ──────────────────────────────────────────────────────
function ProgressBar({ pct: p }) {
  const w = Math.min(Math.max(p || 0, 0), 110);
  const { teinte } = tonDotation(p);
  return (
    <div className="jauge w-full">
      <div className="h-2.5 rounded-full transition-all"
        style={{ width: `${w}%`, background: teinte }} />
    </div>
  );
}

// ── Panneau EXT / DOT ─────────────────────────────────────────────────────────
function ExtDotPanel({ annee }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!annee) return;
    const tok = localStorage.getItem('token');
    fetch(`/api/pilotage/ext-dot?annee=${encodeURIComponent(annee)}`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json()).then(setData).catch(() => {});
  }, [annee]);

  if (!data || !data.resume) return null;
  const pots = Object.entries(data.resume).filter(([,v]) => v.illimite || v.plafond > 0 || v.consomme > 0);
  if (pots.length === 0) return null;

  return (
    <div>
      <div className="intertitre mb-2">Répartition EXT / DOT</div>
      <div className="grid grid-cols-1 md:grid-cols-3 2xl:grid-cols-4 gap-3">
        {pots.map(([pot, v]) => {
          const pct = v.plafond > 0 ? Math.min(100, Math.round(v.consomme / v.plafond * 100)) : 0;
          const depasse = v.dot > 0;
          if (v.illimite) {
            return (
              <div key={pot} data-etat="reussi" className="bloc-etat p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-sm">{pot}</span>
                  <span className="text-mention bg-teal-500 text-white px-1.5 py-0.5 rounded font-bold">∞ Illimité</span>
                </div>
                <div className="text-xs text-gray-600 mb-2">
                  Enveloppe <b>illimitée</b> · Consommé : <b>{v.consomme}</b> pér. B
                </div>
                <div className="text-xs text-teal-700 mt-1">Aucune charge sur la dotation organique.</div>
              </div>
            );
          }
          return (
            <div key={pot} data-etat={depasse ? 'corriger' : 'reussi'} className="bloc-etat p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sm">{pot}</span>
                {depasse && <span className="text-mention bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold">⚠ DOT {v.dot} pér. B</span>}
              </div>
              <div className="text-xs text-gray-600 mb-2">
                Plafond EXT : <b>{v.plafond}</b> pér. B · Consommé : <b>{v.consomme}</b> pér. B
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className={`h-2 rounded-full ${depasse ? 'bg-orange-500' : 'bg-teal-500'}`} style={{ width: `${Math.min(100,pct)}%` }} />
              </div>
              <div className="text-mention text-gray-500 mt-1 text-right">{pct}% du plafond</div>
              {depasse && (
                <div className="text-xs text-orange-700 mt-2 font-medium">
                  ⚠ {v.dot} pér. B au-delà du plafond → à charge de la dotation organique
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Carte enveloppe externe ───────────────────────────────────────────────────
function EnvCard({ env }) {
  const depasse = env.solde < 0;
  const dot = Math.abs(Math.min(0, env.solde));
  return (
    <div data-etat={depasse ? 'corriger' : 'neutre'} className="bloc-etat px-3 py-2 flex items-center gap-3">
      {/* Nom + code */}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-gray-700 truncate">{env.label}</div>
        <div className="text-mention text-gray-400">{env.code}</div>
      </div>
      {/* Alloc / Utilisé / Solde */}
      <div className="flex items-center gap-3 text-center flex-shrink-0">
        <div>
          <div className="text-mention text-gray-400 uppercase">Alloc.</div>
          <div className="text-xs font-bold text-gray-600">{fmt(env.periodes_b)}</div>
        </div>
        <div>
          <div className="text-mention text-gray-400 uppercase">Utilisé</div>
          <div className={`text-xs font-bold ${trafficColor(env.pct)}`}>{fmt(env.usage)}</div>
        </div>
        <div>
          <div className="text-mention text-gray-400 uppercase">Solde</div>
          <div className={`text-xs font-bold ${env.solde < 0 ? 'text-red-600' : 'text-green-700'}`}>{sign(env.solde)}{fmt(env.solde)}</div>
        </div>
      </div>
      {/* Barre + % */}
      <div className="w-20 flex-shrink-0">
        <ProgressBar pct={env.pct} />
        <div className={`text-mention text-right font-medium mt-0.5 ${trafficColor(env.pct)}`}>{pct(env.pct)}</div>
      </div>
      {/* Badge dépassement */}
      {depasse && (
        <span className="text-mention bg-orange-500 text-white border border-orange-500 px-1.5 py-0.5 rounded font-bold flex-shrink-0 whitespace-nowrap">
          ⚠ +{fmt(dot)}
        </span>
      )}
    </div>
  );
}

// ── Tooltip graphique ─────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-flottant text-xs">
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
        className="border border-gray-300 rounded px-3 py-1.5 h-9 text-sm bg-white w-52">
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
  const [mode, setMode]     = useState('scolaire'); // 'scolaire' | 'civil'
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
        className={`px-2 py-2 text-${align} whitespace-nowrap overflow-hidden text-ellipsis group/th`}>
        {children}
        {col && (
          <span onMouseDown={e => startResize(col, e)}
            onClick={e => e.stopPropagation()}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(255,255,255,.35)', zIndex: 1 }} />
        )}
      </th>
    );
  }

  // Années scolaires disponibles
  const anneesSco = [...new Set(
    civil.flatMap(y => [`${y.annee_civile-1}-${y.annee_civile}`, `${y.annee_civile}-${y.annee_civile+1}`])
  )].sort();
  // Années civiles disponibles
  const anneesCiviles = [...new Set(civil.map(y => String(y.annee_civile)))].sort();
  const optionsAnnees = mode === 'civil' ? anneesCiviles : anneesSco;

  // Pré-remplir des valeurs par défaut quand le mode change et que les champs sont vides
  useEffect(() => {
    if (annee1 === '' && annee2 === '' && optionsAnnees.length >= 2) {
      setAnnee1(optionsAnnees[optionsAnnees.length - 2]);
      setAnnee2(optionsAnnees[optionsAnnees.length - 1]);
    } else if (annee1 === '' && annee2 === '' && optionsAnnees.length === 1) {
      setAnnee2(optionsAnnees[0]);
    }
  }, [mode, optionsAnnees.length]);

  // Rechargement automatique à chaque changement de paramètre
  useEffect(() => {
    if (annee1 && annee2 && annee1 !== annee2) {
      charger();
    }
  }, [annee1, annee2, potFilter, pondere, mode, anneesSco.length]);

  async function charger() {
    if (!annee1 || !annee2 || annee1 === annee2) return;
    setLoading(true);
    try {
      const d = await api.dotationComparaison(annee1, annee2, potFilter || null, pondere, mode);
      setData(d);
      setOpenSecs(new Set(d.sections.map(s => s.section)));
    } catch(e) { informer(e.message); }
    finally { setLoading(false); }
  }

  function toggleSec(sec) {
    setOpenSecs(prev => {
      const n = new Set(prev);
      n.has(sec) ? n.delete(sec) : n.add(sec);
      return n;
    });
  }

  const NIV_PAL = ['var(--c-attente)','var(--c-disponible)','var(--c-texte)','var(--c-faveur)','var(--c-helb)'];
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
        {[['annee1', annee1, setAnnee1, mode === 'civil' ? 'Année civile réf.' : 'Année de référence'], ['annee2', annee2, setAnnee2, mode === 'civil' ? 'Année civile comp.' : 'Année comparée']].map(([k, val, set, lbl]) => (
          <div key={k}>
            <label className="block text-xs text-gray-500 mb-1">{lbl}</label>
            <select value={val} onChange={e => set(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 h-9 text-sm bg-white w-36">
              <option value="">— Choisir —</option>
              {optionsAnnees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Période</label>
          <div className="flex rounded border border-gray-300 overflow-hidden text-sm">
            <button onClick={() => { setMode('scolaire'); setAnnee1(''); setAnnee2(''); }}
              className={`px-3 py-1.5 ${mode === 'scolaire' ? 'bg-iip-mauve text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              Scolaire
            </button>
            <button onClick={() => { setMode('civil'); setAnnee1(''); setAnnee2(''); }}
              className={`px-3 py-1.5 border-l border-gray-300 ${mode === 'civil' ? 'bg-iip-mauve text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              Civile
            </button>
          </div>
        </div>
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
        {loading && <span className="text-xs text-gray-400 self-end pb-2 animate-pulse">Chargement...</span>}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Enveloppe</label>
          <select value={potFilter} onChange={e => setPotFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 h-9 text-sm bg-white">
            <option value="TOUT">Tout (IIP + HELB)</option>
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
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-white text-xs" style={{ background: 'var(--c-principal)' }}>
                <Th col="nom" align="left" rowSpan={2} style={{position:'sticky',left:0,background:'var(--c-principal)',zIndex:10,verticalAlign:'bottom',paddingBottom:'0.5rem'}}>Section / UE</Th>
                <Th col="niv" align="center" rowSpan={2} style={{verticalAlign:'bottom',paddingBottom:'0.5rem'}}>Niv.</Th>
                <Th col="quad" align="center" rowSpan={2} style={{verticalAlign:'bottom',paddingBottom:'0.5rem'}}>Quad.</Th>
                <th className="px-2 py-1.5 h-9 text-center font-semibold" colSpan={3}
                  style={{borderLeft:'1px solid rgba(255,255,255,.18)'}}>{annee1}</th>
                <th className="px-2 py-1.5 h-9 text-center font-semibold" colSpan={3}
                  style={{borderLeft:'1px solid rgba(255,255,255,.18)'}}>{annee2}</th>
                <Th col="delta" align="center" rowSpan={2} style={{borderLeft:'1px solid rgba(255,255,255,.18)',verticalAlign:'bottom',paddingBottom:'0.5rem'}}>Δ</Th>
              </tr>
              <tr className="text-white/80 text-mention" style={{ background: 'var(--c-principal)' }}>
                <Th col="q1a" align="right" style={{borderLeft:'1px solid rgba(255,255,255,.12)',fontWeight:'normal'}}>Q1</Th>
                <Th col="q2a" align="right" style={{fontWeight:'normal'}}>Q2</Th>
                <Th col="ta" align="right" style={{fontWeight:'600'}}>Total</Th>
                <Th col="q1b" align="right" style={{borderLeft:'1px solid rgba(255,255,255,.12)',fontWeight:'normal'}}>Q1</Th>
                <Th col="q2b" align="right" style={{fontWeight:'normal'}}>Q2</Th>
                <Th col="tb" align="right" style={{fontWeight:'600'}}>Total</Th>
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
                      style={{borderTopColor: 'var(--c-principal)'}}
                      onClick={() => toggleSec(sec.section)}>
                      <td className="px-3 py-2 font-bold text-iip-gold sticky left-0 z-10 overflow-hidden text-ellipsis whitespace-nowrap"
                        style={{background: si % 2 === 0 ? '#f9fafb' : 'white', width:colW.nom, maxWidth:colW.nom}}>
                        <Chevron ouvert={open} size={14} className="mr-2" />
                        {sec.section}
                      </td>
                      <td style={{width:colW.niv}}></td><td style={{width:colW.quad}}></td>
                      <td className="px-2 py-2 text-right text-xs" style={{width:colW.q1a}}>{fmt(sec.tot1.q1)}</td>
                      <td className="px-2 py-2 text-right text-xs" style={{width:colW.q2a}}>{fmt(sec.tot1.q2)}</td>
                      <td className="px-2 py-2 text-right font-bold text-iip-gold" style={{width:colW.ta}}>{sec.tot1_total || '—'}</td>
                      <td className="px-2 py-2 text-right text-xs" style={{width:colW.q1b}}>{fmt(sec.tot2.q1)}</td>
                      <td className="px-2 py-2 text-right text-xs" style={{width:colW.q2b}}>{fmt(sec.tot2.q2)}</td>
                      <td className={`px-2 py-2 text-right font-bold ${secDelta > 0 ? 'text-red-600' : secDelta < 0 ? 'text-green-600' : 'text-iip-gold'}`} style={{width:colW.tb}}>{sec.tot2_total || '—'}</td>
                      <td className="px-3 py-2 text-center border-l border-gray-100" style={{width:colW.delta}}>{delta(secDelta)}</td>
                    </tr>
                    {/* Lignes UE */}
                    {open && sec.ues.map((u, i) => (
                      <tr key={`${u.section}-${u.ue_num}`}
                        className={`border-t border-gray-100 text-xs hover:bg-gray-50/60`}>
                        <td className="px-3 py-1.5 h-9 sticky left-0 z-10 pl-8 overflow-hidden text-ellipsis whitespace-nowrap"
                          style={{background:'var(--blanc)', width:colW.nom, maxWidth:colW.nom}}>
                          <span className="font-mono text-gray-400 mr-2">UE {u.ue_num}</span>
                          <span className="text-gray-600">{u.ue_nom}</span>
                        </td>
                        <td className="px-2 py-1.5 h-9 text-center" style={{width:colW.niv}}>
                          {u.ue_niv && <span className="text-mention font-bold px-1 py-0.5 rounded text-white"
                            style={{background: nivColor(u.ue_niv)}}>{u.ue_niv}</span>}
                        </td>
                        <td className="px-2 py-1.5 h-9 text-center text-gray-400">{u.ue_quad||'—'}</td>
                        <td className="px-2 py-1.5 h-9 text-right text-gray-600">{fmt(u.c1.q1)}</td>
                        <td className="px-2 py-1.5 h-9 text-right text-gray-600">{fmt(u.c1.q2)}</td>
                        <td className="px-2 py-1.5 h-9 text-right font-semibold text-gray-700">{u.t1||'—'}</td>
                        <td className="px-2 py-1.5 h-9 text-right text-gray-600">{fmt(u.c2.q1)}</td>
                        <td className="px-2 py-1.5 h-9 text-right text-gray-600">{fmt(u.c2.q2)}</td>
                        <td className={`px-2 py-1.5 text-right font-semibold ${u.delta > 0 ? 'text-red-500' : u.delta < 0 ? 'text-green-500' : 'text-gray-700'}`}>{u.t2||'—'}</td>
                        <td className="px-3 py-1.5 h-9 text-center border-l border-gray-100">{delta(u.delta)}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
              {/* Ligne totaux globaux */}
              <tr className="border-t-2 border-iip-gold bg-iip-gold/5 font-bold">
                <td className="px-3 py-2.5 text-iip-gold sticky left-0 bg-iip-gold/5 z-10">TOTAL GÉNÉRAL</td>
                <td></td><td></td>
                <td className="px-2 py-2.5 text-right border-l border-gray-100">
                  {fmt(Math.round(data.sections.reduce((s,sec)=>s+sec.tot1.q1,0)*100)/100)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  {fmt(Math.round(data.sections.reduce((s,sec)=>s+sec.tot1.q2,0)*100)/100)}
                </td>
                <td className="px-2 py-2.5 text-right text-iip-gold text-base">{totGlob1}</td>
                <td className="px-2 py-2.5 text-right border-l border-gray-100">
                  {fmt(Math.round(data.sections.reduce((s,sec)=>s+sec.tot2.q1,0)*100)/100)}
                </td>
                <td className="px-2 py-2.5 text-right">
                  {fmt(Math.round(data.sections.reduce((s,sec)=>s+sec.tot2.q2,0)*100)/100)}
                </td>
                <td className={`px-2 py-2.5 text-right text-base ${deltaGlob > 0 ? 'text-red-600' : deltaGlob < 0 ? 'text-green-600' : 'text-iip-gold'}`}>{totGlob2}</td>
                <td className="px-3 py-2.5 text-center border-l border-gray-100">{delta(deltaGlob)}</td>
              </tr>
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            {potFilter === 'TOUT'
              ? (pondere ? 'IIP en pér. B pondérées + HELB en brut' : 'IIP + HELB en périodes brutes')
              : potFilter === 'HELB' || !pondere ? 'Périodes brutes (sans pondération)' : 'Périodes B pondérées · ×1.5 SUP · ×1.25 DS'}
            {mode === 'civil' && ' · année civile = Q2 (sept→déc) + Q1 (janv→juin)'}
          </div>
        </div>
      )}
    </div>
  );
}

import StatsDeliberation from '../components/StatsDeliberation.jsx';

export default function Pilotage({ vue = 'tout' }) {
  const [centreImpression, setCentreImpression] = useState(false);
  /* L'ANNÉE SE CHOISIT SUR CHAQUE PAGE DE GESTION (Charles, 14 octobre 2026 : « je dois pouvoir
     traiter les années une par une, dans un sélecteur, pour chaque page »). Un sélecteur, en tête de
     page, que suivent toutes les faces à l'année scolaire ; la dotation et le budget gardent l'année
     civile, qui est la leur. L'année de travail de la barre du haut reste le point de départ. */
  const [anneeActive, setAnneeActive] = useState(getAnnee());
  const [anneesScolaires, setAnneesScolaires] = useState([]);
  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() }).then(r => (r.ok ? r.json() : []))
      .then(l => setAnneesScolaires((Array.isArray(l) ? l : []).map(a => a.code || a).filter(Boolean).sort().reverse()))
      .catch(() => {});
  }, []);
  // L'écran ouvre sur ce que sa vue sait montrer : « Dotation » n'existe pas
  // dans le reporting, et y atterrir donnerait une page vide.
  const [tab, setTab]               = useState(() => (vue === 'reporting' ? 'etp'
    : new URLSearchParams(window.location.search).get('onglet') || 'population-ecole'));
  const [etpData, setEtpData]       = useState(null);
  // Dotation détaillée par section/UE (table fidèle maquette v3)
  const [dotEffic, setDotEffic]     = useState(null);   // efficience année active
  const [dotEfficPrev, setDotEfficPrev] = useState(null); // efficience année précédente (pour Δ%)
  const [dotNiv, setDotNiv]         = useState(null);   // /etp → niveau UE (BA1/BA2)
  const [dotOpen, setDotOpen]       = useState(new Set()); // volets fermés par défaut
  const [dotFace, setDotFace]       = useState('recto');    // carte flip : 'recto' (KPIs) | 'verso' (pluriannuel)
  const anneePrec = (() => { const p = (anneeActive||'').split('-'); return p.length === 2 ? `${+p[0]-1}-${p[0]}` : ''; })();
  const [etpOpen, setEtpOpen]       = useState(new Set());
  // IMPRIMER DES PARTIES DE LA GESTION (Charles, 14 octobre 2026) : le choix, puis l'aperçu composé.
  const [choixImpression, setChoixImpression] = useState(null);   // Set des faces cochées, fenêtre ouverte
  const [facesImprimees, setFacesImprimees] = useState(null);     // faces de l'aperçu
  const imprime = k => !!facesImprimees?.includes(k);
  const [civil, setCivil]           = useState([]);
  const [selYear, setSelYear]       = useState(null);
  const [loading, setLoading]       = useState(true);

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
        // L'année civile en cours par défaut : c'est celle sur laquelle on
        // travaille, et non la dernière encodée, qui peut être une prévision.
        if (d.length && !selYear) {
          const courante = new Date().getFullYear();
          const trouvee = d.find(y => y.annee_civile === courante);
          setSelYear(trouvee ? trouvee.annee_civile : d[d.length - 1].annee_civile);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Charger la répartition ETP (IIP/HELB par section et UE) quand on ouvre l'onglet
  useEffect(() => {
    if (tab !== 'etp' && !imprime('etp')) return;
    const tok = localStorage.getItem('token');
    fetch(`/api/pilotage/etp?annee=${encodeURIComponent(anneeActive)}`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json()).then(setEtpData).catch(console.error);
  }, [tab, anneeActive, facesImprimees]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Charger la dotation détaillée (section→UE + Δ% vs année précédente) sur l'onglet Dotation
  useEffect(() => {
    if (tab !== 'synthese' && !imprime('synthese')) return;
    const tok = localStorage.getItem('token');
    const h = { headers: { Authorization: `Bearer ${tok}` } };
    fetch(`/api/pilotage/efficience?annee=${encodeURIComponent(anneeActive)}`, h).then(r => r.json()).then(setDotEffic).catch(() => {});
    fetch(`/api/pilotage/etp?annee=${encodeURIComponent(anneeActive)}`, h).then(r => r.json()).then(setDotNiv).catch(() => {});
    if (anneePrec) fetch(`/api/pilotage/efficience?annee=${encodeURIComponent(anneePrec)}`, h).then(r => r.json()).then(setDotEfficPrev).catch(() => setDotEfficPrev(null));
    else setDotEfficPrev(null);
  }, [tab, anneeActive, facesImprimees]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Charger les UEs avec pot pour la config
  useEffect(() => {
    if (tab === 'config') {
      api.ueWithPot(anneeActive, null, true).then(setUeList).catch(console.error);
    }
  }, [tab]);

  const selectedData = civil.find(y => y.annee_civile === selYear);

  // Données graphique multi-années
  //
  // L'USAGE DÉCLARÉ EST UNE SÉRIE À PART, et il le reste.
  //
  // La courbe traçait le seul usage CALCULÉ : sur une année dont la base n'a
  // pas tout — 2025, dont le premier semestre n'est pas encodé —, elle montre
  // une consommation basse qui n'a jamais eu lieu, et la barre dément le
  // solde constaté saisi juste à côté.
  //
  // Le remède n'est pas de remplacer l'un par l'autre : ce serait perdre la
  // mesure de ce qui manque. C'est de tracer les DEUX. La barre ambre dit ce
  // que la direction constate, la bleue ce que la base établit, et l'écart
  // entre elles se voit — c'est lui qui se refermera à mesure qu'on encode.
  const chartData = useMemo(() => civil.map(y => ({
    annee: y.annee_civile,
    'Dotation organique': y.dotation_organique,
    'Usage organique':    y.usage_organique,
    'Usage constaté':     y.usage_implique ?? null,
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

  // ── Dotation détaillée par section → UE (table fidèle maquette v3) ───────────
  const dotTable = useMemo(() => {
    if (!dotEffic?.sections) return null;
    const nivMap = {};
    for (const s of (dotNiv?.sections || [])) for (const u of s.ues) nivMap[`${s.section}|${u.ue_num}`] = u.ue_niv;
    const prevMap = {};
    for (const s of (dotEfficPrev?.sections || [])) for (const u of s.ues) prevMap[`${s.section}|${u.ue_num}`] = u.periodes;
    return dotEffic.sections.map(s => {
      const ues = s.ues.map(u => {
        const niv = nivMap[`${s.section}|${u.ue_num}`] || '—';
        const prev = prevMap[`${s.section}|${u.ue_num}`];
        const delta = (prev != null && prev > 0) ? ((u.periodes - prev) / prev) * 100 : null;
        const pct = s.periodes > 0 ? (u.periodes / s.periodes) * 100 : null;
        return { ...u, niv, prev, delta, pct };
      });
      const groups = {};
      for (const u of ues) (groups[u.niv] ||= []).push(u);
      const niveaux = Object.keys(groups).sort((a, b) =>
        (parseInt((a.match(/\d+$/) || [99])[0])) - (parseInt((b.match(/\d+$/) || [99])[0])));
      const grouped = niveaux.map(niv => ({
        niv,
        ues: groups[niv].sort((a, b) => (b.periodes || 0) - (a.periodes || 0)),
        periodes: groups[niv].reduce((t, u) => t + (u.periodes || 0), 0),
        etp: groups[niv].reduce((t, u) => t + (u.etp || 0), 0),
      }));
      return { ...s, grouped };
    }).sort((a, b) => (b.periodes || 0) - (a.periodes || 0));
  }, [dotEffic, dotEfficPrev, dotNiv]);

  // Rapport A4 imprimable (bascule portrait / paysage)
  const [rapportPaysage, setRapportPaysage] = useState(false);
  /**
   * LE RAPPORT PASSE PAR L'ENVELOPPE DE LA MAISON.
   *
   * Il s'écrivait ici, dans le navigateur : sa page A4 à lui, ses marges de
   * 14 mm, un en-tête de tableau en aplat marine, des lignes de regroupement
   * indigo, une rayure une ligne sur deux — et aucun pied de page. C'était la
   * dixième enveloppe, et la seule pièce de Lucie à ne pas porter l'identité
   * de l'établissement.
   *
   * L'écran n'envoie plus que ce qu'il veut MONTRER : des groupes, des
   * colonnes, des lignes. Le serveur l'habille comme les attestations et les
   * annexes — mêmes marges, même pied numéroté, mêmes tons.
   *
   * ET IL SE LIT EN ETP. La dotation se pilote en équivalents temps plein ;
   * les périodes en sont le détail. La colonne existait dans l'écran et
   * manquait au document.
   */
  async function imprimerDotation(paysage) {
    if (!dotTable) return;
    const groupes = dotTable.map(s => ({
      titre: s.section,
      // L'ETP D'ABORD : c'est l'unité dans laquelle la dotation se pilote ;
      // les périodes en sont le détail, et les étudiants le pourquoi.
      sous: `${fmt(s.etp, 1)} ETP · ${fmt(s.periodes)} périodes`
        + (s.etudiants ? ` · ${s.etudiants} étudiants` : ''),
      lignes: s.grouped.flatMap(g => [
        ...(s.grouped.length > 1
          ? [{ __repere: `${g.niv} — ${(g.etp || 0).toFixed(1)} ETP · ${Math.round(g.periodes)} périodes` }]
          : []),
        ...g.ues.map(u => ({
          ue: `UE ${u.ue_num}`,
          nom: u.ue_nom || '',
          periodes: Math.round(u.periodes || 0),
          etp: (u.etp || 0).toFixed(2),
          pct: u.pct != null ? `${u.pct.toFixed(0)} %` : '—',
          delta: u.delta == null ? '—' : `${u.delta > 0 ? '+' : ''}${u.delta.toFixed(0)} %`,
        })),
      ]),
    }));
    const rep = await fetch('/api/rapports/document-groupe', {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titre: 'Dotation par section et unité',
        sous: `Année ${anneeActive}${anneePrec ? ` · évolution par rapport à ${anneePrec}` : ''}`,
        colonnes: [
          { cle: 'ue', entete: 'UE' }, { cle: 'nom', entete: 'Intitulé' },
          { cle: 'periodes', entete: 'Périodes', num: true },
          { cle: 'etp', entete: 'ETP', num: true },
          { cle: 'pct', entete: '% de la section', num: true },
          { cle: 'delta', entete: `Δ ${anneePrec || ''}`, num: true },
        ],
        groupes,
        orientation: paysage ? 'paysage' : 'portrait',
      }),
    });
    if (!rep.ok) return;
    const { html } = await rep.json();
    ouvrirApercu({ html, titre: 'Dotation par section et unité', sousTitre: `Année ${anneeActive}`,
                   nomFichier: `Dotation_${anneeActive}`, envoiPossible: false,
                   astuceImpression: paysage ? "⊞ Choisir « Paysage » à l'impression" : 'A4 portrait' });
  }

  const renderDotationTable = () => {
    if (!dotTable) return <div className="text-gray-400 text-sm py-4">Chargement de la dotation détaillée…</div>;
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="intertitre">
            Dotation détaillée par section et UE · {anneeActive}{anneePrec ? ` · Δ% vs ${anneePrec}` : ''}
          </div>
          <div className="flex items-center gap-2">
            <div className="segments text-xs">
              <button onClick={() => setRapportPaysage(false)} className={`px-2.5 py-1 ${!rapportPaysage ? 'bg-iip-blue text-white' : 'bg-white text-gray-500'}`}>Portrait</button>
              <button onClick={() => setRapportPaysage(true)} className={`px-2.5 py-1 ${rapportPaysage ? 'bg-iip-blue text-white' : 'bg-white text-gray-500'}`}>Paysage</button>
            </div>
            <OuvrirEditions ongletInitial="gestion" titre="Imprimer ou envoyer le rapport — centre d'édition"
              pieces={[{ cle: 'dotation', label: 'Rapport de dotation (A4)', description: rapportPaysage ? 'Paysage' : 'Portrait', onClick: () => imprimerDotation(rapportPaysage) }]} />
          </div>
        </div>
        <div className="space-y-2">
          {dotTable.map(s => {
            const open = dotOpen.has(s.section);
            return (
              <div key={s.section} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-pose">
                <button onClick={() => setDotOpen(p => { const n = new Set(p); n.has(s.section) ? n.delete(s.section) : n.add(s.section); return n; })}
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 text-left">
                  {open ? <IconChevronDown size={16} className="text-gray-400" /> : <IconChevronRight size={16} className="text-gray-400" />}
                  <span className="font-semibold text-iip-blue text-sm flex-1">{s.section}</span>
                  <span className="text-xs text-gray-500">{fmt(s.periodes)} pér. · {fmt(s.etp, 1)} ETP{s.etudiants ? ` · ${s.etudiants} ét.` : ''}</span>
                </button>
                {open && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="tab-entete intertitre">
                        <tr>
                          <th className="px-4 py-2 text-left">UE</th>
                          <th className="px-3 py-2 text-right">Périodes</th>
                          <th className="px-3 py-2 text-right">% dot.</th>
                          <th className="px-3 py-2 text-right whitespace-nowrap">Δ% {anneePrec || ''}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.grouped.map(g => (
                          <Fragment key={g.niv}>
                            {s.grouped.length > 1 && (
                              <tr className="bg-iip-blue/5">
                                <td className="px-4 py-1.5 h-9 text-xs font-semibold text-iip-blue">{g.niv}</td>
                                <td className="px-3 py-1.5 h-9 text-right text-xs font-semibold text-iip-blue">{fmt(g.periodes)}</td>
                                <td colSpan={2}></td>
                              </tr>
                            )}
                            {g.ues.map(u => (
                              <tr key={u.ue_num} className="border-t border-gray-100 hover:bg-gray-50">
                                <td className="px-4 py-2 text-gray-700"><span className="text-gray-400 text-xs mr-1">UE{u.ue_num}</span>{u.ue_nom || ''}</td>
                                <td className="px-3 py-2 text-right font-mono">{fmt(u.periodes)}</td>
                                <td className="px-3 py-2 text-right text-gray-500">{u.pct != null ? u.pct.toFixed(0) + ' %' : '—'}</td>
                                <td className="px-3 py-2 text-right">
                                  {u.delta == null
                                    ? <span className="text-gray-300">—</span>
                                    : <span className={u.delta > 0 ? 'text-green-600 font-semibold' : u.delta < 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>{u.delta > 0 ? '+' : ''}{u.delta.toFixed(0)} %</span>}
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Onglet synthèse ─────────────────────────────────────────────────────────
  const renderSynthese = () => {
    if (!selectedData) return <div className="text-gray-400 py-12 text-center">Aucune donnée</div>;
    const d = selectedData;
    const felsi     = Math.round(d.dotation_organique * 0.01);
    const gips      = 40;
    const charges   = felsi + gips;
    const soldeReel = d.solde_organique - charges;

    return (
      <div className="space-y-5">

        {/* ── Grande carte unique : KPIs + enveloppes + dotation détaillée ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-pose overflow-hidden">

          {/* ── En-tête avec flip ── */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="intertitre">
              {dotFace === 'recto'
                ? `Dotation organique · Civile ${d.annee_civile}`
                : 'Comparaison pluriannuelle'}
            </div>
            <button onClick={() => setDotFace(f => f === 'recto' ? 'verso' : 'recto')}
              title="Retourner la carte"
              className="w-8 h-8 rounded-full border border-iip-turquoise/40 text-iip-turquoise hover:bg-iip-turquoise hover:text-white flex items-center justify-center transition flex-shrink-0">
              <IconRotateClockwise size={16} />
            </button>
          </div>

          {dotFace === 'verso' ? (
            /* ── VERSO : graphiques ── */
            <div className="p-4">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} barCategoryGap="30%">
                    {reglagesGraphique().grille !== 'aucun' && <CartesianGrid strokeDasharray={reglagesGraphique().grille === 'plein' ? '0' : '3 3'} stroke={couleursGraphique().grille} />}
                    <XAxis dataKey="annee" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v / 1000, 1) + 'k'} />
                    <Tooltip content={<ChartTip />} />
                    {reglagesGraphique().legende !== 'aucune' && <Legend verticalAlign={reglagesGraphique().legende === 'haut' ? 'top' : 'bottom'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
                    <Bar dataKey="Dotation organique" fill={couleursGraphique().series[0]} radius={reglagesGraphique().rayon} />
                    <Bar dataKey="Usage organique"    fill={couleursGraphique().series[1]} radius={reglagesGraphique().rayon} />
                    {/* Les années où la direction a constaté un solde : ce
                        qu'elle déclare, à côté de ce que la base compte. */}
                    <Bar dataKey="Usage constaté"     fill={couleursGraphique().series[2]} radius={reglagesGraphique().rayon} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-gray-400 text-sm py-12 text-center">Pas assez d'années pour la comparaison pluriannuelle.</div>
              )}
            </div>
          ) : (
            /* ── RECTO : KPIs + enveloppes + table ── */
            <>
              {/* KPIs compacts */}
              <div className="grid grid-cols-5 gap-px bg-gray-100 border-b border-gray-100">
                {[
                  { label: 'Dotation',      value: fmt(d.dotation_organique), sub: 'périodes B',            color: 'text-iip-blue' },
                  { label: 'Utilisées',     value: fmt(d.usage_organique),
                    sub: d.dot_total > 0
                      ? <span className="text-orange-600 text-mention">dont {fmt(d.dot_total)} pér. de dépassement</span>
                      : 'périodes B',
                    color: trafficColor(d.pct_organique) },
                  { label: 'Charges fixes', value: <span className="text-orange-600">−{fmt(charges)}</span>, sub: `FELSI ${fmt(felsi)} + GIPS 40`, color: '' },
                  { label: 'Solde réel',    value: <span className={soldeReel < 0 ? 'text-red-600' : 'text-green-700'}>{sign(soldeReel)}{fmt(soldeReel)}</span>, sub: soldeReel < -200 ? '⚠ Pénalité ×1,5' : 'après FELSI + GIPS', color: '' },
                  { label: 'Taux',          value: <span className={trafficColor(d.pct_organique)}>{pct(d.pct_organique)}</span>, sub: <ProgressBar pct={d.pct_organique} />, taux: true },
                ].map(({ label, value, sub, color, taux }) => (
                  <div key={label} className={`px-4 py-3 bg-white ${taux ? trafficBg(d.pct_organique) : ''}`}>
                    <div className="intertitre mb-0.5">{label}</div>
                    <div className={`text-lg font-bold leading-tight ${color || 'text-iip-blue'}`}>{value}</div>
                    <div className="text-mention text-gray-400 mt-0.5">{sub}</div>
                  </div>
                ))}
              </div>

              {/* ── LES DEUX MOITIÉS DE L'ANNÉE CIVILE ──────────────────────
                  Janvier-juin est le second quadrimestre de l'année scolaire
                  qui s'achève : une fois celle-ci close, cette moitié est
                  JOUÉE. Septembre-décembre n'est qu'engagé. Le total des deux
                  cache la question qu'on se pose en juillet : « la première
                  moitié est derrière moi, combien me reste-t-il pour la
                  rentrée ? » */}
              {(d.usage_jan_juin > 0 || d.usage_sep_dec > 0
                || d.usage_jan_juin_suivant > 0) && (
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="intertitre mb-2">
                    L'année civile en deux moitiés
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-carte border border-gray-200 px-3 py-2">
                      <div className="text-mention text-gray-500">
                        Janvier – juin {d.annee_civile}
                      </div>
                      <div className="text-lg font-bold text-iip-blue leading-tight">
                        {fmt(d.usage_jan_juin)}
                      </div>
                      <div className="text-mention text-gray-400">
                        Q2 de {d.scolaire_jan_juin} — consommé
                      </div>
                    </div>
                    <div className="rounded-carte border border-gray-200 px-3 py-2">
                      <div className="text-mention text-gray-500">
                        Septembre – décembre {d.annee_civile}
                      </div>
                      <div className="text-lg font-bold text-iip-blue leading-tight">
                        {fmt(d.usage_sep_dec)}
                      </div>
                      <div className="text-mention text-gray-400">
                        Q1 de {d.scolaire_sep_dec} — engagé, encore mouvant
                      </div>
                    </div>
                    {/* LA MOITIÉ QUI VIENT — l'année académique en cours ne
                        s'arrête pas en décembre. Son second quadrimestre est
                        déjà attribué : il tombe en janvier-juin de l'année
                        civile suivante, et il pèsera sur la dotation de
                        celle-ci. Ne montrer que les deux moitiés de l'année
                        civile revenait à couper l'année académique en cours en
                        deux et à n'en regarder que la première moitié. */}
                    <div className="rounded-carte border border-gray-200 px-3 py-2">
                      <div className="text-mention text-gray-500">
                        Janvier – juin {d.annee_civile + 1}
                      </div>
                      <div className="text-lg font-bold text-iip-blue leading-tight">
                        {fmt(d.usage_jan_juin_suivant)}
                      </div>
                      <div className="text-mention text-gray-400">
                        Q2 de {d.scolaire_sep_dec} — engagé, sur la dotation {d.annee_civile + 1}
                      </div>
                    </div>

                    <div data-etat={d.solde_apres_jan_juin < 0 ? 'corriger' : 'reussi'} className="bloc-etat px-3 py-2">
                      <div className="text-mention text-gray-600">
                        Reste pour la rentrée
                      </div>
                      <div className={`text-lg font-bold leading-tight ${
                        'text-iip-texte'}`}>
                        {fmt(d.solde_apres_jan_juin)}
                      </div>
                      <div className="text-mention text-gray-500">
                        après décompte de janvier – juin
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── LE SOLDE CONSTATÉ, EN FACE DU CALCUL ────────────────────
                  Ce que la direction sait d'une année dont la base n'a pas
                  encore tout : « tout utilisé sauf cinq périodes ». Il ne
                  corrige pas le calcul, il le confronte — et l'écart entre les
                  deux mesure ce qui reste à encoder. Le fondre dans le solde
                  ferait disparaître cette information même. */}
              {d.solde_constate != null && (
                <div className="px-4 py-3 border-b border-gray-100 border-l-4 border-l-[color:var(--c-attente)]">
                  <div className="flex items-center gap-6 flex-wrap text-xs">
                    <div>
                      <div className="text-mention uppercase tracking-wider text-amber-700 mb-0.5">
                        Solde constaté
                      </div>
                      <div className="text-lg font-bold text-amber-900 leading-tight">
                        {fmt(d.solde_constate)}
                      </div>
                      <div className="text-mention text-amber-700">déclaré par la direction</div>
                    </div>
                    <div>
                      <div className="intertitre mb-0.5">
                        Consommation qu'il implique
                      </div>
                      <div className="text-lg font-bold text-iip-blue leading-tight">
                        {fmt(d.usage_implique)}
                      </div>
                      <div className="text-mention text-gray-400">
                        dotation utilisable − solde constaté
                      </div>
                    </div>
                    <div>
                      <div className="intertitre mb-0.5">
                        Écart avec la base
                      </div>
                      <div className={`text-lg font-bold leading-tight ${
                        Math.abs(d.ecart_encodage || 0) < 1 ? 'text-green-700' : 'text-orange-600'}`}>
                        {sign(d.ecart_encodage)}{fmt(Math.abs(d.ecart_encodage))}
                      </div>
                      <div className="text-mention text-gray-400">
                        {Math.abs(d.ecart_encodage || 0) < 1
                          ? 'la base rend compte de l’année'
                          : 'périodes non encodées dans Lucie'}
                      </div>
                    </div>
                    {d.solde_constate_note && (
                      <div className="flex-1 min-w-[200px] text-xs text-amber-900 italic">
                        « {d.solde_constate_note} »
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Enveloppes extérieures — 4 cartes sur une ligne */}
              {d.enveloppes.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="intertitre mb-2">Enveloppes extérieures</div>
                  <div className="grid grid-cols-4 gap-2">
                    {d.enveloppes.map(e => {
                      const dep = e.solde < 0;
                      const dot = Math.abs(Math.min(0, e.solde));
                      return (
                        <div key={e.code} data-etat={dep ? 'corriger' : 'neutre'} className="bloc-etat px-3 py-2 text-xs">
                          <div className="font-semibold text-iip-blue truncate">{e.label}</div>
                          <div className="text-mention text-gray-400 mb-1.5">{e.code}</div>
                          <div className="flex justify-between text-mention text-gray-500 mb-1">
                            <span>{fmt(e.periodes_b)}</span>
                            <span className={trafficColor(e.pct)}>{fmt(e.usage)}</span>
                            <span className={e.solde < 0 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>{sign(e.solde)}{fmt(e.solde)}</span>
                          </div>
                          <ProgressBar pct={e.pct} />
                          <div className="flex justify-between mt-0.5">
                            <span className={`text-mention font-medium ${trafficColor(e.pct)}`}>{pct(e.pct)}</span>
                            {dep && <span className="text-mention text-orange-600 font-bold">⚠ +{fmt(dot)}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Table dotation par section/UE */}
              <div className="px-4 pt-3 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="intertitre">
                    Détail par section · {anneeActive}{anneePrec ? ` · Δ% vs ${anneePrec}` : ''}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded border border-gray-200 overflow-hidden text-mention">
                      <button onClick={() => setRapportPaysage(false)} className={`px-2 py-1 ${!rapportPaysage ? 'bg-iip-blue text-white' : 'bg-white text-gray-500'}`}>Portrait</button>
                      <button onClick={() => setRapportPaysage(true)}  className={`px-2 py-1 ${rapportPaysage ? 'bg-iip-blue text-white' : 'bg-white text-gray-500'}`}>Paysage</button>
                    </div>
                    <OuvrirEditions taille="petit" ongletInitial="gestion" titre="Imprimer ou envoyer le rapport — centre d'édition"
                      pieces={[{ cle: 'dotation', label: 'Rapport de dotation (A4)', description: rapportPaysage ? 'Paysage' : 'Portrait', onClick: () => imprimerDotation(rapportPaysage) }]} />
                  </div>
                </div>
                {!dotTable ? (
                  <div className="text-gray-400 text-sm py-4 text-center">Chargement…</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {dotTable.map(s => {
                      const open = dotOpen.has(s.section);
                      return (
                        <div key={s.section}>
                          <button
                            onClick={() => setDotOpen(p => { const n = new Set(p); n.has(s.section) ? n.delete(s.section) : n.add(s.section); return n; })}
                            className="w-full flex items-center gap-2 py-2 hover:bg-gray-50 text-left">
                            {open
                              ? <IconChevronDown size={14} className="text-gray-400 flex-shrink-0" />
                              : <IconChevronRight size={14} className="text-gray-400 flex-shrink-0" />}
                            <span className="font-semibold text-iip-blue text-sm flex-1">{s.section}</span>
                            <span className="text-xs text-gray-400">{fmt(s.periodes)} pér. · {fmt(s.etp, 1)} ETP{s.etudiants ? ` · ${s.etudiants} ét.` : ''}</span>
                            {s.delta != null && (
                              <span className={`text-xs font-semibold ml-3 ${s.delta > 0 ? 'text-green-600' : s.delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                {s.delta > 0 ? '+' : ''}{s.delta.toFixed(1)} %
                              </span>
                            )}
                          </button>
                          {open && (
                            <table className="w-full text-sm mb-1">
                              <thead>
                                <tr className="intertitre border-b border-gray-100">
                                  <th className="pb-1 text-left pl-5 font-medium">UE</th>
                                  <th className="pb-1 text-right font-medium pr-2">Périodes</th>
                                  <th className="pb-1 text-right font-medium pr-2">% Dot.</th>
                                  <th className="pb-1 text-right font-medium pr-1">Δ% {anneePrec || ''}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.grouped.map(g => (
                                  <Fragment key={g.niv}>
                                    {s.grouped.length > 1 && (
                                      <tr className="bg-iip-blue/5">
                                        <td className="pl-5 py-1 text-mention font-semibold text-iip-blue" colSpan={4}>{g.niv}</td>
                                      </tr>
                                    )}
                                    {g.ues.map(u => (
                                      <tr key={u.ue_num} className="border-t border-gray-50 hover:bg-gray-50">
                                        <td className="pl-5 py-1.5 h-9 text-gray-700"><span className="text-gray-400 text-mention mr-1">UE{u.ue_num}</span>{u.ue_nom || ''}</td>
                                        <td className="py-1.5 h-9 text-right pr-2 font-mono text-gray-700">{fmt(u.periodes)}</td>
                                        <td className="py-1.5 h-9 text-right pr-2 text-gray-400 text-xs">{u.pct != null ? u.pct.toFixed(0) + ' %' : '—'}</td>
                                        <td className="py-1.5 h-9 text-right pr-1">
                                          {u.delta == null
                                            ? <span className="text-gray-300 text-xs">—</span>
                                            : <span className={`text-xs font-semibold ${u.delta > 0 ? 'text-green-600' : u.delta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                                {u.delta > 0 ? '+' : ''}{u.delta.toFixed(0)} %
                                              </span>}
                                        </td>
                                      </tr>
                                    ))}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Section PEP */}
        {pepChartData.length > 0 && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-pose">
              <div className="flex items-center justify-between mb-1">
                <div className="intertitre">
                  Périodes-élèves pondérées (PEP) · Art. 3 A.Gt 22-11-2002
                </div>
                <span className="text-mention text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  Dotation civile N = basée sur PEP N-2 · Bande neutre ±8 %
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Dérogations COVID: dotations 2022/2023/2024 ont utilisé PEP 2019 (A.Gt 27-10-2022).
                PEP de référence à saisir dans Configuration (valeur pivot HOD).
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={pepChartData}>
                  {reglagesGraphique().grille !== 'aucun' && <CartesianGrid strokeDasharray={reglagesGraphique().grille === 'plein' ? '0' : '3 3'} stroke={couleursGraphique().grille} />}
                  <XAxis dataKey="annee" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="pep" tick={{ fontSize: 10 }} tickFormatter={v => (v/1000).toFixed(0)+'k'}
                    label={{ value: 'PEP', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <YAxis yAxisId="dot" orientation="right" tick={{ fontSize: 10 }}
                    tickFormatter={v => (v/1000).toFixed(1)+'k'}
                    label={{ value: 'Dot. B', angle: 90, position: 'insideRight', fontSize: 10 }} />
                  <Tooltip formatter={(v, n) => [v?.toLocaleString('fr-BE'), n]} />
                  {reglagesGraphique().legende !== 'aucune' && <Legend verticalAlign={reglagesGraphique().legende === 'haut' ? 'top' : 'bottom'} iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
                  <Bar yAxisId="pep" dataKey="PEP"      fill={couleursGraphique().series[1]} radius={reglagesGraphique().rayon} name="PEP (pér.-élèves)" />
                  <Line yAxisId="pep" dataKey="PEP réf." stroke={couleursGraphique().reference} strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" name="PEP réf." />
                  <Line yAxisId="dot" dataKey="Dotation" stroke={couleursGraphique().series[0]} strokeWidth={2} dot={{ r: 3 }} name="Dotation org. (pér. B)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Table PEP & calcul dotation */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="intertitre px-4 py-2.5 border-b border-gray-100">
                Mécanisme d'ajustement de dotation
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="tab-entete intertitre">
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
                          {row.derogation && <span className="ml-1 text-mention bg-amber-500 text-white px-1 rounded">dérог.</span>}
                          {row.partiel && <span className="ml-1 text-mention bg-iip-turquoise/10 text-iip-blue px-1 rounded">partiel</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500 font-mono text-xs">{row.pep_annee_utilisee || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {row.pep_calc ? fmt(row.pep_calc) : '—'}
                          {row.pep_brute ? <span className="block text-mention text-gray-400">brute: {fmt(row.pep_brute)}</span> : null}
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
                          {row.zone === 'NEUTRE' && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-champ">Neutre ±8 %</span>}
                          {row.zone === 'HAUSSE' && <span className="text-xs bg-iip-turquoise/10 text-iip-blue px-2 py-0.5 rounded-champ">↑ Hausse &gt;+8 %</span>}
                          {row.zone === 'BAISSE' && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-champ">↓ Baisse &lt;−8 %</span>}
                          {row.zone == null && <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.dotation ? <span className="font-mono">{fmt(row.dotation)}</span> : <span className="text-gray-300 text-xs">—</span>}
                          {row.dot_utilisable && row.dot_utilisable !== row.dotation ? <span className="block text-mention text-gray-400">util: {fmt(row.dot_utilisable)}</span> : null}
                          {row.zone === 'BAISSE' && row.perte ? <span className="block text-mention text-red-500">−{fmt(row.perte)} pér. estimées</span> : null}
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

  // ── Onglet ETP : répartition IIP et HELB, tout en CT/800 + PP/1000 (périodes) par section/UE ──
  const renderETP = () => {
    if (!etpData) return <div className="text-gray-400 py-8 text-center">Chargement…</div>;
    const secs = etpData.sections || [];
    const t = etpData.total || {};
    const toggle = (s) => setEtpOpen(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
    const f = (x) => (x || 0).toFixed(2);
    const f3 = (x) => (x || 0).toFixed(3);
    // LE RATIO ETP PAR ÉTUDIANT (14 octobre 2026) : cours, administratif (direction comprise), total.
    const R = etpData.ratios || {};
    const nEtu = R.inscrits || 0;
    const etpCours = t.etp_total || 0, etpAdmin = R.etp_admin || 0;
    // ÉTUDIANTS PAR ETP (Charles, 14 octobre 2026 : « c'est étudiant/ETP ! ») : combien d'étudiants pour un ETP.
    const ratio = e => (e ? (nEtu / e).toFixed(1).replace('.', ',') : '—');
    const pour = e => (e && nEtu ? `soit ${(e / nEtu).toFixed(3).replace('.', ',')} ETP par étudiant` : '');
    const parSec = s => R.inscrits_par_section?.[s] || 0;
    return (
      <div>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex-1 min-w-[170px]"><TuileEtat valeur={ratio(etpCours)} libelle="étudiants par ETP de cours" precision={`${f(etpCours)} ETP · ${pour(etpCours)}`} /></div>
          <div className="flex-1 min-w-[170px]"><TuileEtat valeur={ratio(etpAdmin)} libelle="étudiants par ETP administratif"
            precision={`${f(etpAdmin)} ETP — ${(R.admin || []).map(a => `${a.fonction} ${String(a.etp).replace('.', ',')}`).join(', ') || 'aucune fonction d’établissement encodée'}`} /></div>
          <div className="flex-1 min-w-[170px]"><TuileEtat etat="fort" valeur={ratio(etpCours + etpAdmin)} libelle="étudiants par ETP, tout le monde compris" precision={`${f(etpCours + etpAdmin)} ETP · ${pour(etpCours + etpAdmin)}`} /></div>
          <div className="flex-1 min-w-[140px]"><TuileEtat valeur={nEtu.toLocaleString('fr-BE')} libelle="étudiants inscrits" precision="hors archivés, chacun une fois" /></div>
        </div>
        <div className="mb-4 bg-iip-gold/5 border border-iip-gold/30 rounded-lg p-3 text-second text-gray-700">
          <b>Répartition ETP</b> — équivalents temps plein par section et UE, année {etpData.annee}.
          <span className="block mt-1 text-gray-500">
            <b>IIP</b> : cours généraux (CT) ÷ 800 périodes + cours pratiques (PP) ÷ 1000 périodes.
            <b className="ml-2">HELB</b> : même base (CT ÷ 800, PP ÷ 1000) — tout est exprimé en périodes.
          </span>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th className="text-left px-3 py-2">Section / UE</th>
              <th className="text-right px-3 py-2">ETP CT <span className="font-normal normal-case">(÷800)</span></th>
              <th className="text-right px-3 py-2">ETP PP <span className="font-normal normal-case">(÷1000)</span></th>
              <th className="text-right px-3 py-2 text-iip-gold">ETP IIP</th>
              <th className="text-right px-3 py-2 text-iip-mauve">ETP HELB</th>
              <th className="text-right px-3 py-2">ETP total</th>
              <th className="text-right px-3 py-2">% total</th>
              <th className="text-right px-3 py-2">Inscrits</th>
              <th className="text-right px-3 py-2" title="Inscrits de la section ÷ ses ETP de cours">Étudiants / ETP</th>
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {/* Le total d'abord, sous l'en-tête. */}
            <tr className="border-b-2 border-gray-300 font-bold bg-gray-50">
              <td className="px-3 py-2">TOTAL</td>
              <td className="px-3 py-2 text-right text-gray-600">{f(t.etp_ct)}</td>
              <td className="px-3 py-2 text-right text-gray-600">{f(t.etp_pp)}</td>
              <td className="px-3 py-2 text-right text-iip-gold">{f(t.etp_iip)}</td>
              <td className="px-3 py-2 text-right text-iip-mauve">{f(t.etp_helb)}</td>
              <td className="px-3 py-2 text-right">{f(t.etp_total)}</td>
              <td className="px-3 py-2 text-right">100 %</td>
              <td className="px-3 py-2 text-right tabular-nums">{nEtu}</td>
              <td className="px-3 py-2 text-right tabular-nums">{ratio(etpCours)}</td>
              <td></td>
            </tr>
            {secs.map(s => (
              <Fragment key={s.section}>
                <tr className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => toggle(s.section)}>
                  <td className="px-3 py-2 font-medium text-gray-800">{s.section}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{f(s.etp_ct)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{f(s.etp_pp)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-iip-gold">{f(s.etp_iip)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-iip-mauve">{f(s.etp_helb)}</td>
                  <td className="px-3 py-2 text-right font-bold text-gray-800">{f(s.etp_total)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{t.etp_total ? (s.etp_total / t.etp_total * 100).toFixed(1) + ' %' : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{parSec(s.section) || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{parSec(s.section) && s.etp_total ? (parSec(s.section) / s.etp_total).toFixed(1).replace('.', ',') : '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{etpOpen.has(s.section) ? '▾' : '▸'}</td>
                </tr>
                {etpOpen.has(s.section) && s.ues.map(u => (
                  <tr key={u.ue_num} className="bg-gray-50/50 text-second">
                    <td className="px-3 py-1 pl-8 text-gray-600">UE {u.ue_num}{u.ue_nom ? ` — ${u.ue_nom}` : ''}</td>
                    <td className="px-3 py-1 text-right text-gray-400">{f3(u.etp_ct)}</td>
                    <td className="px-3 py-1 text-right text-gray-400">{f3(u.etp_pp)}</td>
                    <td className="px-3 py-1 text-right text-iip-gold">{f3(u.etp_iip)}</td>
                    <td className="px-3 py-1 text-right text-iip-mauve">{f3(u.etp_helb)}</td>
                    <td className="px-3 py-1 text-right text-gray-600">{f3(u.etp_total)}</td>
                    <td className="px-3 py-1 text-right text-gray-300">{t.etp_total ? (u.etp_total / t.etp_total * 100).toFixed(1) + ' %' : ''}</td>
                    <td></td><td></td><td></td>
                  </tr>
                ))}
              </Fragment>
            ))}

          </tbody>
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
        solde_constate:                editDot.solde_constate !== '' && editDot.solde_constate != null ? parseFloat(editDot.solde_constate) : null,
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
    if (!await demander(`Supprimer l'année civile ${y} et toutes ses enveloppes ?`)) return;
    await api.dotationCivileDelete(y);
    load();
  };

  const renderConfig = () => (
    <div className="space-y-6">
      {/* Dotations organiques */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="titre-carte">Dotations organiques par année civile</h3>
          <div className="flex gap-2">
            <input value={newYear} onChange={e => setNewYear(e.target.value)} placeholder="Ex: 2027"
              className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-24" />
            <button onClick={addYear} disabled={saving || !newYear} className="bouton bouton-fort">Ajouter</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="tab-entete intertitre">
            <tr><th className="px-4 py-2 text-left">Année civile</th><th className="px-4 py-2 text-right">Dotation (pér. B)</th><th className="px-4 py-2 text-right">PEP</th><th className="px-4 py-2 text-right">PEP réf.</th><th className="px-4 py-2 text-right">PEP an. utilisée</th><th className="px-4 py-2 text-right">Usage historique</th><th className="px-4 py-2 text-right" title="Ce que la direction constate : le solde réellement resté à la fin de l’année. Il ne remplace pas le calcul, il le confronte.">Solde constaté</th><th className="px-4 py-2 text-left">Notes</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {civil.map(y => editDot?.annee_civile === y.annee_civile ? (
              <tr key={y.annee_civile} className="border-t border-gray-100 bg-iip-gold/5">
                <td className="px-4 py-2 font-semibold text-iip-gold">{y.annee_civile}</td>
                <td className="px-4 py-2"><input type="number" value={editDot.dotation_organique} onChange={e => setEditDot({ ...editDot, dotation_organique: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-24 text-right" /></td>
                <td className="px-4 py-2"><input type="number" value={editDot.periodes_eleves ?? ''} onChange={e => setEditDot({ ...editDot, periodes_eleves: e.target.value })} placeholder="HOD" className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-28 text-right" /></td>
                <td className="px-4 py-2"><input type="number" value={editDot.pep_reference ?? ''} onChange={e => setEditDot({ ...editDot, pep_reference: e.target.value })} placeholder="HOD" className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-28 text-right" /></td>
                <td className="px-4 py-2"><input type="number" value={editDot.pep_annee_utilisee ?? ''} onChange={e => setEditDot({ ...editDot, pep_annee_utilisee: e.target.value })} placeholder="ex: 2023" className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-20 text-right" /></td>
                <td className="px-4 py-2"><input type="number" value={editDot.usage_historique_organique ?? ''} onChange={e => setEditDot({ ...editDot, usage_historique_organique: e.target.value })} placeholder="calculé si vide" className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-28 text-right" /></td>
                {/* LE SOLDE CONSTATÉ. « Tout utilisé sauf cinq périodes » est
                    ce dont on se souvient d'une année ; la consommation, on ne
                    l'a jamais soustraite. On saisit donc ce qu'on sait, et
                    Lucie en déduit le reste. */}
                <td className="px-4 py-2"><input type="number" step="0.01" value={editDot.solde_constate ?? ''} onChange={e => setEditDot({ ...editDot, solde_constate: e.target.value })} placeholder="ex. 5" title="Périodes restées inutilisées, telles que la direction les constate" className="bloc-etat etat-surveiller px-2 py-1.5 h-9 text-sm w-28 text-right" /></td>
                <td className="px-4 py-2"><input value={editDot.notes || ''} onChange={e => setEditDot({ ...editDot, notes: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-full" /></td>
                <td className="px-4 py-2 flex gap-1 justify-end">
                  <button onClick={saveDotation} disabled={saving} className="bouton bouton-fort"><IconCheck size={14} /></button>
                  <button onClick={() => setEditDot(null)} className="text-gray-500 text-xs px-2 py-1 rounded border"><IconX size={14} /></button>
                </td>
              </tr>
            ) : (
              <tr key={y.annee_civile} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-semibold text-gray-700">{y.annee_civile}</td>
                <td className="px-4 py-2.5 text-right font-mono">{y.dotation_organique > 0 ? fmt(y.dotation_organique) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2.5 text-right font-mono text-iip-blue">{y.periodes_eleves ? fmt(y.periodes_eleves) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2.5 text-right font-mono text-red-400">{y.pep_reference ? fmt(y.pep_reference) : <span className="text-gray-300">à saisir</span>}</td>
                <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{y.pep_annee_utilisee || '—'}</td>
                <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{y.source === 'historique' ? fmt(y.usage_organique) : '(calculé)'}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs">{y.solde_constate != null
                  ? <span className="text-amber-800 font-semibold" title={y.ecart_encodage != null && Math.abs(y.ecart_encodage) >= 1 ? `${fmt(Math.abs(y.ecart_encodage))} périodes non encodées dans Lucie` : 'la base rend compte de l’année'}>{fmt(y.solde_constate)}</span>
                  : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400 max-w-xs truncate">{y.notes || ''}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setEditDot({ annee_civile: y.annee_civile, dotation_organique: y.dotation_organique, periodes_eleves: y.periodes_eleves ?? '', pep_reference: y.pep_reference ?? '', pep_annee_utilisee: y.pep_annee_utilisee ?? '', usage_historique_organique: y.source === 'historique' ? y.usage_organique : '', solde_constate: y.solde_constate ?? '', notes: y.notes || '' })} className="text-iip-gold hover:text-iip-amber text-xs border border-iip-gold/30 px-2 py-1 rounded">Modifier</button>
                    <button onClick={() => deleteYear(y.annee_civile)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1"><IconTrash size={16} /></button>
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
          <h3 className="titre-carte">Enveloppes extérieures</h3>
          <button onClick={() => setEditEnv({ id: null, code: 'QUAL', label: '', annee_civile: selYear || 2026, periodes_b: 0, usage_historique: '', notes: '' })} className="bg-iip-gold hover:bg-iip-amber text-white text-xs px-3 py-1.5 h-9 rounded">+ Ajouter</button>
        </div>
        {editEnv && !editEnv.id && (
          <div className="p-4 bg-iip-gold/5 border-b border-gray-100">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
              <div><label className="block text-xs text-gray-500 mb-0.5">Code</label>
                <select value={editEnv.code} onChange={e => setEditEnv({ ...editEnv, code: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-full">
                  {['QUAL', 'CF', 'INCL'].map(c => <option key={c}>{c}</option>)}</select></div>
              <div><label className="block text-xs text-gray-500 mb-0.5">Libellé</label>
                <input value={editEnv.label} onChange={e => setEditEnv({ ...editEnv, label: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-full" /></div>
              <div><label className="block text-xs text-gray-500 mb-0.5">Année civile</label>
                <input type="number" value={editEnv.annee_civile} onChange={e => setEditEnv({ ...editEnv, annee_civile: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-full" /></div>
              <div><label className="block text-xs text-gray-500 mb-0.5">Périodes B</label>
                <input type="number" value={editEnv.periodes_b} onChange={e => setEditEnv({ ...editEnv, periodes_b: e.target.value })} className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-full" /></div>
              <div className="flex gap-1">
                <button onClick={saveEnv} disabled={saving} className="bouton bouton-fort w-full">Créer</button>
                <button onClick={() => setEditEnv(null)} className="border text-gray-500 text-xs px-2 py-1.5 h-9 rounded"><IconX size={14} /></button>
              </div>
            </div>
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="tab-entete intertitre">
            <tr><th className="px-4 py-2 text-left">Code</th><th className="px-4 py-2 text-left">Libellé</th><th className="px-4 py-2 text-right">Civile</th><th className="px-4 py-2 text-right">Allocation (B)</th><th className="px-4 py-2 text-right">Usage hist.</th><th className="px-4 py-2" /></tr>
          </thead>
          <tbody>
            {civil.flatMap(y => y.enveloppes.map(e => editEnv?.id === e.id ? (
              <tr key={e.id} className="border-t border-gray-100 bg-iip-gold/5">
                <td className="px-4 py-2 font-mono text-iip-gold">{e.code}</td>
                <td className="px-4 py-2"><input value={editEnv.label} onChange={ev => setEditEnv({ ...editEnv, label: ev.target.value })} className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-full" /></td>
                <td className="px-4 py-2 text-right">{e.annee_civile}</td>
                <td className="px-4 py-2"><input type="number" value={editEnv.periodes_b} onChange={ev => setEditEnv({ ...editEnv, periodes_b: ev.target.value })} className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-24 text-right" /></td>
                <td className="px-4 py-2"><input type="number" value={editEnv.usage_historique ?? ''} onChange={ev => setEditEnv({ ...editEnv, usage_historique: ev.target.value })} placeholder="calculé" className="border border-gray-300 rounded px-2 py-1.5 h-9 text-sm w-24 text-right" /></td>
                <td className="px-4 py-2 flex gap-1 justify-end">
                  <button onClick={saveEnv} disabled={saving} className="bouton bouton-fort"><IconCheck size={14} /></button>
                  <button onClick={() => setEditEnv(null)} className="text-gray-500 text-xs px-2 py-1 rounded border"><IconX size={14} /></button>
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
                    <button onClick={async () => { if (await demander('Supprimer cette enveloppe ?')) { await api.enveloppeDelete(e.id); load(); } }} className="text-red-400 hover:text-red-600 text-xs px-2 py-1"><IconTrash size={16} /></button>
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
              <h3 className="titre-carte">Attribution des enveloppes par UE</h3>
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
            <thead className="tab-entete intertitre">
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

  /* GESTION : « DONNÉES DE L'ÉTABLISSEMENT » (Charles, 14 octobre 2026 : « centraliser les données
     de pilotage » ; « tout mettre dans le rail dans un sous-menu Données de l'établissement »).
     Une entrée de rail, qui se déplie en quatre rubriques — Population, Résultats, Dotation,
     Finances —, chacune son icône ; les faces d'une rubrique se choisissent en tête de l'écran.
     GESTION EST OUVERTE PAR RUBRIQUE : qui lit les statistiques y entre ; la dotation, la
     répartition et le budget ne se montrent qu'à qui en a le droit. Rien n'est recalculé. */
  const u = getUser();
  const lit = m => droitEffectif(u, m) !== 'rien';
  const coord = u?.role === 'coordination';
  const RUBRIQUES = [
    { key: 'g-population', label: 'Population', icon: IconUsersGroup, faces: [
      ['population-ecole', 'Qui sont nos étudiants'], !coord && ['personnel-ecole', 'Notre personnel'], ['population', 'Places par unité']] },
    /* LES PRÉSENCES (28 octobre 2026) : par UE, le comptage au 1er dixième, les alertes —
       direction et secrétariat (la route le garde ; la coordination n'y passe pas). */
    { key: 'g-presences', label: 'Présences', icon: IconUserCheck, faces: [
      !coord && ['presences-ue', 'Présences par UE']] },
    { key: 'g-resultats', label: 'Résultats', icon: IconSchool, faces: [
      ['deliberation', 'Décisions et taux de réussite'], ['distributions', 'Distributions des cotes']] },
    { key: 'g-dotation', label: 'Dotation', icon: IconBuildingBank, faces: [
      lit('dotation') && ['synthese', 'Dotation'], ['etp', 'ETP'], ['dotation', 'Comparaison'],
      !coord && lit('repartition') && ['repartition', 'Répartition des périodes'],
      lit('dotation') && ['config', 'Configuration']] },
    /* LA DÉMARCHE QUALITÉ (3.1.442) : le plan d'action AEQES, tenu dans Lucie dès 2026-2027 —
       rien ne se rattrape en 2028. La coordination y pose les actions de ses sections. */
    { key: 'g-qualite', label: 'Qualité', icon: IconRosette, faces: [
      ['qualite', 'Plan d’action']] },
    { key: 'g-finances', label: 'Finances', icon: IconCoin, faces: [
      !coord && ['rapport', 'Coûts des formations'], lit('budget') && ['budget', 'Budget']] },
  ].map(r => ({ ...r, faces: r.faces.filter(Boolean) })).filter(r => r.faces.length);
  const rubriqueActive = RUBRIQUES.find(r => r.faces.some(f => f[0] === tab)) || null;
  const railGestion = [{
    key: 'donnees', label: 'Données de l’établissement', icon: IconChartInfographic, actif: !!rubriqueActive,
    onClick: () => { if (!rubriqueActive) setTab(RUBRIQUES[0].faces[0][0]); },
    sous: RUBRIQUES.map(r => ({ key: r.key, label: r.label, icon: r.icon, actif: r === rubriqueActive,
      onClick: () => { if (r !== rubriqueActive) setTab(r.faces[0][0]); } })),
  }];

  /* UNE FACE, OÙ QU'ELLE S'AFFICHE — à l'écran comme dans l'aperçu d'impression : un seul rendu, deux
     usages, l'écran et le papier ne peuvent pas différer. */
  const renduFace = k => (
    k === 'population-ecole' ? <PopulationEcole annee={anneeActive} />
    : k === 'personnel-ecole' ? <PersonnelEcole annee={anneeActive} />
    : k === 'rapport' ? <RapportStatistique annee={anneeActive} />
    : k === 'repartition' ? <RepartitionPeriodes annee={anneeActive} />
    : k === 'distributions' ? <Distributions annee={anneeActive} />
    : k === 'population' ? <Population annee={anneeActive} />
    : k === 'budget' ? <Budget />
    : k === 'synthese' ? renderSynthese()
    : k === 'etp' ? (etpData ? renderETP() : <div className="text-gray-400 py-4">Chargement…</div>)
    : k === 'dotation' ? <DotationComparaison civil={civil} />
    : k === 'deliberation' ? <StatsDeliberation annee={anneeActive} />
    : null);
  // Ce qui s'imprime : toutes les faces sauf la configuration, qui règle et ne rapporte rien.
  const IMPRIMABLES = RUBRIQUES.map(r => ({ ...r, faces: r.faces.filter(([k]) => k !== 'config') })).filter(r => r.faces.length);
  const libelleFace = k => { for (const r of IMPRIMABLES) { const f = r.faces.find(([x]) => x === k); if (f) return `${r.label} — ${f[1]}`; } return k; };
  /* LE PDF DU SERVEUR (Charles, 15 octobre 2026 : « le bas de page ne se met pas ») : l'impression du
     navigateur ne pose pas de pied sur chaque feuille (Safari ignore les marges de page). On envoie au
     serveur la page TELLE QU'ELLE EST DESSINÉE — son HTML, les feuilles de style de Lucie et les réglages
     de couleurs posés sur la racine — et il la rend en A4 paysage avec le pied de la maison et le numéro
     de page, comme toutes les pièces. */
  const [pdfGestion, setPdfGestion] = useState(false);
  /* CHOISIR LES BLOCS (3.1.388, Charles, 16 octobre 2026 : « je veux pouvoir retirer cela du PDF… être plus
     précis sur ce que je choisis d'imprimer »). Mode allumé, un clic sur une carte ou une tuile de l'aperçu
     la retire (grisée) ; un second clic la remet. Ce qui est retiré ne sort ni en PDF ni à l'impression. */
  const [choisirBlocs, setChoisirBlocs] = useState(false);
  const [nbRetires, setNbRetires] = useState(0);
  /* LA LISTE DES ÉLÉMENTS, À COCHER (Charles, 16 octobre 2026 : « j'aimerais pouvoir cocher chaque item —
     graphique sexe, graphique âge, tableau… »). Recensée dans l'aperçu une fois les parties dessinées :
     chaque carte (par son titre) et chaque rangée de tuiles. Décocher retire l'élément de l'impression. */
  const [elements, setElements] = useState([]);
  function recenser() {
    const zone = document.querySelector('.zone-impression .page-impression');
    if (!zone) return;
    const out = []; let n = 0;
    for (const partie of zone.querySelectorAll('.partie-impression')) {
      const nomPartie = partie.querySelector(':scope > .titre-carte')?.textContent?.trim() || '';
      const vus = new Set();
      const cartes = [...partie.querySelectorAll('.carte')].filter(c => !c.parentElement.closest('.carte'));
      // CHAQUE TUILE SA CASE (Charles, 16 octobre 2026 : « tu ne me permets toujours pas de choisir les tuiles »).
      const tuiles = [...partie.querySelectorAll('.bloc-etat')].filter(t => !t.closest('.sans-impression'))
        .map(t => t.closest('.flex-1') && t.closest('.flex-1').querySelectorAll('.bloc-etat').length === 1 ? t.closest('.flex-1') : t)
        .filter(r => !vus.has(r) && vus.add(r));
      for (const el of [...tuiles, ...cartes].sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1))) {
        el.dataset.bloc = String(++n);
        const t = el.classList.contains('carte') ? null : (el.classList.contains('bloc-etat') ? el : el.querySelector('.bloc-etat'));
        // Une tuile se nomme par son chiffre et son libellé (« 854 inscrits »), pas par toute sa précision.
        const nomTuile = t ? [...t.querySelectorAll('div, span')].map(x => x.childElementCount ? '' : x.textContent.trim()).filter(Boolean).slice(0, 2).join(' ') : '';
        const titre = el.classList.contains('carte')
          ? (el.querySelector('.titre-carte, .text-base.font-semibold')?.textContent || el.textContent).trim().slice(0, 70)
          : `Tuile · ${(nomTuile || el.textContent.trim()).slice(0, 60)}`;
        // Une tuile DANS une carte se range sous elle, en retrait.
        out.push({ id: el.dataset.bloc, partie: nomPartie, titre, dans: !el.classList.contains('carte') && !!el.closest('.carte'), exclu: el.classList.contains('exclu-impression') });
      }
    }
    setElements(out);
    setNbRetires(out.filter(x => x.exclu).length);
  }
  function cocherElement(id, garder) {
    const el = document.querySelector(`.zone-impression [data-bloc="${id}"]`);
    if (el) el.classList.toggle('exclu-impression', !garder);
    setElements(l => { const m = l.map(x => (x.id === id ? { ...x, exclu: !garder } : x)); setNbRetires(m.filter(x => x.exclu).length); return m; });
  }
  useEffect(() => {
    if (!facesImprimees) { setElements([]); return undefined; }
    const t1 = setTimeout(recenser, 1500), t2 = setTimeout(recenser, 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [facesImprimees]);   // eslint-disable-line react-hooks/exhaustive-deps
  const BLOCS_IMPRIMABLES = '.carte, .bloc-etat';
  function basculerBloc(e) {
    if (!choisirBlocs) return;
    const b = e.target.closest('.bloc-etat') || e.target.closest(BLOCS_IMPRIMABLES);
    if (!b || !e.currentTarget.contains(b)) return;
    e.preventDefault(); e.stopPropagation();
    b.classList.toggle('exclu-impression');
    setNbRetires(e.currentTarget.querySelectorAll('.exclu-impression').length);
    setElements(l => l.map(x => (x.id === b.dataset.bloc ? { ...x, exclu: b.classList.contains('exclu-impression') } : x)));
  }
  async function pdfDeLAperçu() {
    const zone = document.querySelector('.zone-impression .page-impression');
    if (!zone) return;
    setPdfGestion(true);
    try {
      let css = '';
      for (const f of document.styleSheets) {
        try { css += [...f.cssRules].map(r => r.cssText).join('\n'); } catch { /* feuille d'une autre origine */ }
      }
      const liens = [...document.querySelectorAll('link[rel="stylesheet"]')].filter(l => !l.href.startsWith(location.origin))
        .map(l => `<link rel="stylesheet" href="${l.href}">`).join('');
      const racine = document.documentElement;
      const attrs = [...racine.attributes].filter(a => a.name !== 'class' || a.value).map(a => `${a.name}="${String(a.value).replace(/"/g, '&quot;')}"`).join(' ');
      const clone = zone.cloneNode(true);
      clone.querySelectorAll('.exclu-impression').forEach(n => n.remove());
      clone.querySelectorAll('.sans-impression, button, select').forEach(n => { if (n.tagName === 'SELECT') { const t = document.createElement('span'); t.textContent = n.options[n.selectedIndex]?.text || ''; n.replaceWith(t); } else if (n.classList.contains('sans-impression')) n.remove(); });
      /* CE QUI SERT À MANIPULER L'ÉCRAN NE S'IMPRIME PAS (Charles, 16 octobre 2026 : « ça ne va pas, la première
         page » — elle ne portait que « Recalculer », « Imprimer ou envoyer » et une rubrique repliée). Les
         boutons d'action, les champs et les rubriques repliées sortent ; les sélecteurs à segments gardent le
         seul choix actif, qui dit ce que montre la page. */
      clone.querySelectorAll('.segments').forEach(g => {
        const actif = [...g.querySelectorAll('button')].find(b => /bg-iip-blue/.test(b.className));
        const t = document.createElement('div'); t.className = 'text-second font-semibold'; t.textContent = actif?.textContent?.trim() || '';
        g.replaceWith(t);
      });
      // Une barre d'outils vidée de ses boutons ne laisse pas de trou — seuls ces parents-là, jamais une barre de graphique.
      const parents = new Set();
      clone.querySelectorAll('button, input, textarea, details:not([open])').forEach(n => { if (n.parentElement) parents.add(n.parentElement); n.remove(); });
      for (let p of parents) { while (p && p !== clone && !p.textContent.trim() && !p.children.length) { const up = p.parentElement; p.remove(); p = up; } }
      const html = `<!doctype html><html ${attrs}><head><meta charset="utf-8">${liens}<style>${css}</style>
<style>@page { size: A4 landscape; } body { background: #fff !important; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page-impression { width: 1000px !important; margin: 0 auto !important; padding: 0 !important; }
.carte, .carte-plate, .bloc-etat, .recharts-wrapper, svg, tr, li, img, section section, [class*="rounded-carte"], .grid > * { break-inside: avoid; }
table { width: 100% !important; font-size: 8.5pt !important; } th, td { white-space: normal !important; padding: 3px 4px !important; }
/* UN TABLEAU QUI TIENT SUR UNE PAGE NE SE COUPE PAS (Charles, 16 octobre 2026 : « sois malin ») : s'il ne tient pas
   sous le graphique, il passe en entier à la page suivante ; seul un tableau plus long qu'une page se coupe. */
table, .overflow-x-auto, .overflow-auto, .recharts-responsive-container { break-inside: avoid; page-break-inside: avoid; }
/* La marge basse est celle du pied de la maison (le serveur la réserve) : la page nommée de l'aperçu n'en impose pas d'autre. */
.zone-impression { page: auto !important; }
.titre-carte, .intertitre, .titre-ecran, h2, h3, h4 { break-after: avoid; }
thead { display: table-header-group; }
.overflow-x-auto, .overflow-y-auto, .overflow-auto { overflow: visible !important; } [class*="max-h-"] { max-height: none !important; }
.partie-impression + .partie-impression { break-before: page; }</style></head>
<body class="impression-gestion"><div class="zone-impression">${clone.outerHTML}</div></body></html>`;
      const nom = `Gestion_${String(anneeActive).replace(/\W/g, '')}_${facesImprimees.length === 1 ? facesImprimees[0] : 'parties'}`;
      const r = await fetch('/api/impression/pdf', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ html, nom, orientation: 'paysage', pagination: 'toujours' }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Erreur ${r.status}`); }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = `${nom}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { informer(`Le PDF n'a pas pu être produit : ${e.message}`); }
    finally { setPdfGestion(false); }
  }

  useEffect(() => {
    if (!facesImprimees) return undefined;
    document.body.classList.add('impression-gestion');
    return () => document.body.classList.remove('impression-gestion');
  }, [facesImprimees]);

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="relative" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral impression="pilotage"

        icon={ICONE_AXE.gestion}
        titre={vue === 'gestion' ? 'Gestion' : 'Pilotage'}
        extra={
          /* BLANC SUR BLANC. Ce sélecteur était écrit pour le rail marine :
             texte blanc, fond blanc à 10 %, filet blanc. En mode clair il
             devenait illisible sur le gris pâle. Il lit désormais les jetons,
             comme tout ce qui vit dans un menu. */
          <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
            className="w-full champ-barre text-sm rounded-champ px-2 py-1.5 h-9 focus:outline-none">
            {civil.map(y => (
              <option key={y.annee_civile} value={y.annee_civile} className="text-gray-800">
                {y.annee_civile}{y.pct_organique > 95 ? ' ⚠' : ''}
              </option>
            ))}
          </select>
        }
        /* CE QU'ON LIT ET CE QU'ON ENGAGE NE SE MÊLENT PLUS.
           Le même écran servait les deux, et c'est pour cela qu'on ne pouvait
           pas ouvrir l'un sans l'autre. « vue » le scinde : « reporting » ne
           montre que ce qui se consulte, « gestion » que ce qui engage. */
        sections={[{ items: vue === 'gestion' ? railGestion : [
          /* LE RAPPORT STATISTIQUE, EN TÊTE (Charles, 8 octobre 2026 : « super
             important ») — coûts, recettes et personnes, dans les deux vues. */
          ...(getUser()?.role === 'coordination' ? [] : [
            { key: 'rapport', label: 'Rapport statistique', icon: IconReportMoney, actif: tab === 'rapport', onClick: () => setTab('rapport') },
          ]),
          ...(vue === 'gestion' ? [] : [
            { key: 'etp',      label: 'ETP',         icon: IconUsers,    actif: tab === 'etp',      onClick: () => setTab('etp') },
            { key: 'dotation', label: 'Comparaison', icon: IconArrowsLeftRight, actif: tab === 'dotation', onClick: () => setTab('dotation') },
          ]),
          ...(vue === 'reporting' ? [] : [
            { key: 'synthese', label: 'Dotation',    icon: IconHome,     actif: tab === 'synthese', onClick: () => setTab('synthese') },
            { key: 'budget',   label: 'Budget',      icon: IconCash,     actif: tab === 'budget',   onClick: () => setTab('budget') },
          ]),
          // La répartition entre années civiles relève de la direction : inutile
          // de la proposer à qui ne pourra pas l'ouvrir.
          ...(vue === 'reporting' || getUser()?.role === 'coordination' ? [] : [
            { key: 'repartition', label: 'Répartition des périodes', icon: IconCalendar, actif: tab === 'repartition', onClick: () => setTab('repartition') },
          ]),
          // CE QUE LE CONSEIL A DÉCIDÉ, en chiffres. Ces taux se
          // reconstituaient à la main pour le rapport d'activité alors qu'ils
          // sont déjà en base.
          ...(vue === 'gestion' ? [] : [
            { key: 'deliberation', label: 'Résultats', icon: IconScale,
              actif: tab === 'deliberation', onClick: () => setTab('deliberation') },
            /* LA DISTRIBUTION À CÔTÉ DES RÉSULTATS, et non dans un menu à part :
               « 62 % de réussite » et « une moyenne de 12 tirée par deux
               extrêmes » répondent à la même question, posée deux fois. */
            { key: 'distributions', label: 'Distributions', icon: IconChartBar,
              actif: tab === 'distributions', onClick: () => setTab('distributions') },
            /* LA POPULATION RÉELLE (22 septembre 2026) : ce qu'on a devant soi
               après la rentrée, face à l'effectif prévu. */
            { key: 'population', label: 'Population réelle', icon: IconUsersGroup,
              actif: tab === 'population', onClick: () => setTab('population') },
          ]),
          ...(vue === 'reporting' ? [] : [
            { key: 'config', label: 'Configuration', icon: IconSettings, actif: tab === 'config', onClick: () => setTab('config') },
          ]),
        ] }]}
      />

      {choixImpression && (
        <Fenetre icone={IconPrinter} titre="Imprimer des parties de la Gestion" large="moyenne" onFermer={() => setChoixImpression(null)}
          sous={`Année scolaire ${anneeActive} — cochez les parties ; elles se suivent dans une seule pièce, chacune sur sa page`}
          pied={<>
            <span className="text-second text-slate-500 flex-1 min-w-0">{choixImpression.size ? `${choixImpression.size} partie(s)` : 'Cochez au moins une partie.'}</span>
            <button type="button" className="bouton bouton-fort" disabled={!choixImpression.size}
              onClick={() => { const ordre = IMPRIMABLES.flatMap(r => r.faces.map(([k]) => k)).filter(k => choixImpression.has(k)); setFacesImprimees(ordre); setChoixImpression(null); setChoisirBlocs(false); setNbRetires(0); }}>
              Composer l'aperçu</button>
          </>}>
          <div className="space-y-4">
            {IMPRIMABLES.map(r => {
              const toutes = r.faces.every(([k]) => choixImpression.has(k));
              return (
                <div key={r.key}>
                  <label className="flex items-center gap-2 intertitre cursor-pointer">
                    <input type="checkbox" checked={toutes} onChange={() => setChoixImpression(c => { const n = new Set(c); r.faces.forEach(([k]) => (toutes ? n.delete(k) : n.add(k))); return n; })} />
                    {r.label}
                  </label>
                  <div className="pl-6 space-y-1 mt-1">
                    {r.faces.map(([k, l]) => (
                      <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={choixImpression.has(k)} onChange={() => setChoixImpression(c => { const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k); return n; })} />
                        {l}
                      </label>))}
                  </div>
                </div>);
            })}
            <div className="flex gap-2">
              <button type="button" className="bouton" onClick={() => setChoixImpression(new Set(IMPRIMABLES.flatMap(r => r.faces.map(([k]) => k))))}>Tout cocher</button>
              <button type="button" className="bouton" onClick={() => setChoixImpression(new Set())}>Tout décocher</button>
            </div>
          </div>
        </Fenetre>)}
      {facesImprimees && createPortal(
        <div className="zone-impression fixed inset-0 z-[300] overflow-auto" style={{ background: 'var(--page-fond, #fff)' }}>
          <div className="sans-impression sticky top-0 z-10 flex items-center gap-3 px-6 py-3 border-b border-slate-200" style={{ background: 'var(--page-fond, #fff)' }}>
            <IconPrinter size={18} className="text-slate-500" />
            <span className="font-semibold flex-1 min-w-0">Aperçu — {facesImprimees.length} partie(s) · année scolaire {anneeActive}</span>
            <span className="text-second text-slate-500">Attendez que les graphiques soient chargés, puis « PDF » : A4 paysage, bas de page et numéro sur chaque feuille.</span>
            <button type="button" className={`bouton inline-flex items-center gap-1.5 ${choisirBlocs ? 'bouton-fort' : ''}`} onClick={() => setChoisirBlocs(v => !v)}
              title="Un clic sur une carte ou une tuile la retire de l'impression ; un second clic la remet">
              {choisirBlocs ? 'Terminer le choix' : 'Choisir les blocs'}{nbRetires ? ` · ${nbRetires} retiré(s)` : ''}</button>
            <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={pdfGestion} onClick={pdfDeLAperçu}>
              <IconPrinter size={15} /> {pdfGestion ? 'PDF en cours…' : 'PDF'}</button>
            <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => window.print()} title="Impression du navigateur, sans bas de page garanti">Imprimer (navigateur)</button>
            <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => setFacesImprimees(null)}><IconX size={15} /> Fermer</button>
          </div>
          {elements.length > 0 && (
            <aside className="sans-impression fixed right-4 top-20 z-20 w-72 max-h-[75vh] overflow-y-auto rounded-carte border border-slate-200 shadow-flottant p-3 text-second"
              style={{ background: 'var(--page-fond, #fff)' }}>
              <div className="flex items-center gap-2 mb-2">
                <b className="flex-1">Éléments à imprimer</b>
                <button type="button" className="text-iip-blue underline" onClick={() => elements.forEach(x => cocherElement(x.id, true))}>tous</button>
                <button type="button" className="text-iip-blue underline" onClick={() => elements.forEach(x => cocherElement(x.id, false))}>aucun</button>
                <button type="button" className="text-slate-500 underline" title="Relire l'aperçu (si une partie a fini de se charger)" onClick={recenser}>relire</button>
              </div>
              {[...new Set(elements.map(x => x.partie))].map(p => (
                <div key={p} className="mb-2">
                  <div className="intertitre mb-1">{p}</div>
                  {elements.filter(x => x.partie === p).map(x => (
                    <label key={x.id} className={`flex items-start gap-2 py-0.5 cursor-pointer ${x.dans ? 'pl-5 text-xs' : ''} ${x.exclu ? 'text-slate-400 line-through' : ''}`}>
                      <input type="checkbox" className="mt-0.5" checked={!x.exclu} onChange={e => cocherElement(x.id, e.target.checked)} />
                      <span className="min-w-0">{x.titre}</span>
                    </label>))}
                </div>))}
            </aside>)}
          {choisirBlocs && <div className="sans-impression bloc-etat mx-auto my-2 px-3 py-2 text-second" style={{ width: 1000 }} data-etat="disponible">
            <b>Choix des blocs</b> : cliquez une carte ou une tuile pour la retirer de l'impression — elle se grise ; recliquez pour la remettre. « Terminer le choix » quand c'est prêt.</div>}
          <div className={`page-impression mx-auto px-0 py-5 space-y-6 ${choisirBlocs ? 'choix-blocs' : ''}`} onClickCapture={basculerBloc}>
            <div className="border-b-2 pb-2" style={{ borderColor: '#C9A84C' }}>
              <div className="text-mention uppercase tracking-wide text-slate-500">Institut Ilya Prigogine · Gestion — données de l'établissement</div>
              <div className="titre-ecran">{facesImprimees.length === 1 ? libelleFace(facesImprimees[0]) : 'Données de l’établissement'} · {anneeActive}</div>
              <div className="text-second text-slate-500">Produit par {getUser()?.nom || '—'} le {new Date().toLocaleDateString('fr-BE')} à {new Date().toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            {facesImprimees.map((k, i) => (
              <section key={k} className="partie-impression space-y-3" style={{ breakBefore: i ? 'page' : 'auto' }}>
                <div className="titre-carte border-b border-slate-200 pb-1">{libelleFace(k)}</div>
                {renduFace(k)}
              </section>))}
          </div>
        </div>, document.body)}

      <div className="gouttiere-rail px-3 md:px-6 py-4 space-y-5">
        {vue === 'gestion' && rubriqueActive && (
          <div className="flex items-center gap-3 flex-wrap">
            {rubriqueActive.faces.length > 1 && (
              <div className="segments">
                {rubriqueActive.faces.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setTab(k)}
                    className={tab === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>{l}</button>))}
              </div>)}
            <span className="flex-1" />
            <button type="button" className="bouton bouton-sortir controle inline-flex items-center gap-1.5"
              onClick={() => setChoixImpression(new Set([tab].filter(k => k !== 'config')))}>
              <IconPrinter size={15} /> Imprimer des parties…</button>
            {tab === 'synthese' && <span className="text-second text-slate-500">année civile {selYear} : dans le rail</span>}
            {['budget', 'dotation'].includes(tab)
              ? <span className="text-second text-slate-500">{tab === 'budget' ? 'Année civile : dans la page' : 'Toutes les années civiles'}</span>
              : (
                <label className="flex items-center gap-2 text-second text-slate-600">
                  Année scolaire
                  <select value={anneeActive} onChange={e => setAnneeActive(e.target.value)} className="controle">
                    {[...new Set([anneeActive, ...anneesScolaires])].map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>)}
          </div>)}
        {/* UN TITRE NE PROMET QUE CE QUE L'ÉCRAN MONTRE.
            « Pilotage des dotations · Enveloppes extérieures · Comparaison
            pluriannuelle » coiffait aussi les résultats de délibération et les
            distributions de cotes : on annonçait de l'argent et des périodes
            au-dessus de chiffres d'étudiants. */}
        {tab === 'personnel-ecole' ? (
          <PageHeader icon={IconUsersGroup} titre="Population"
            sous="Notre personnel : sections, sexe, âge, statut, charge, domicile, nationalité" />
        ) : tab === 'population-ecole' ? (
          <PageHeader icon={IconUsersGroup} titre="Population"
            sous="Qui sont nos étudiants : sections, sexe, âge, domicile, nationalité, nouveaux et diplômants, sur cinq ans" />
        ) : tab === 'rapport' ? (
          <PageHeader icon={IconReportMoney} titre="Rapport statistique"
            sous="Coûts et recettes des formations, enseignants et personnes — à lire ici ; la pièce mise en page s’imprime ou s’envoie" />
        ) : ['deliberation', 'distributions', 'population'].includes(tab) ? (
          <PageHeader icon={IconChartBar} titre="Statistiques étudiantes"
            sous="Décisions du Conseil, cotes et effectifs — par section et par unité" />
        ) : tab === 'qualite' ? (
          <PageHeader icon={IconRosette} titre="Démarche qualité"
            sous="Le plan d’action : ce qui est décidé, qui s’en charge, où on en est" />
        ) : tab === 'presences-ue' ? (
          <PageHeader icon={IconChartBar} titre="Présences et régularité"
            sous="Présences encodées, réguliers au premier dixième, PEP estimée — par section et par unité" />
        ) : (
          <PageHeader icon={IconChartBar} titre="Pilotage des dotations"
            sous={`${selYear ? `Année civile ${selYear} · ` : ''}Enveloppes extérieures · Comparaison pluriannuelle`} />
        )}

        {tab === 'population-ecole' ? (
          <PopulationEcole annee={anneeActive} />
        ) : tab === 'personnel-ecole' ? (
          <PersonnelEcole annee={anneeActive} />
        ) : tab === 'rapport' ? (
          <RapportStatistique annee={vue === 'gestion' ? anneeActive : null} />
        ) : tab === 'repartition' ? (
          <RepartitionPeriodes annee={vue === 'gestion' ? anneeActive : null} />
        ) : tab === 'distributions' ? (
          <Distributions annee={vue === 'gestion' ? anneeActive : null} />
        ) : tab === 'population' ? (
          <Population annee={anneeActive} />
        ) : tab === 'presences-ue' ? (
          <PilotagePresences annee={anneeActive} />
        ) : tab === 'qualite' ? (
          <PlanActionQualite />
        ) : tab === 'budget' ? (
          <Budget />
        ) : loading ? (
          <div className="text-gray-400 py-12 text-center">Chargement…</div>
        ) : civil.length === 0 ? (
          <div className="bg-amber-500 border border-amber-500 rounded-xl p-6 text-sm text-white">
            Aucune année civile configurée. Allez dans <strong>Configuration</strong> pour ajouter les premières années.
          </div>
        ) : (
          <>
            {tab === 'synthese' && renderSynthese()}
            {tab === 'etp'      && renderETP()}
            {tab === 'dotation' && <DotationComparaison civil={civil} />}
            {tab === 'deliberation' && <StatsDeliberation annee={anneeActive} />}
            {tab === 'config'   && renderConfig()}
          </>
        )}
      </div>
    </div>
  );
}

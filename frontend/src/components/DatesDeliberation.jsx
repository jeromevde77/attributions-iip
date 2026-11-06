/* LES DATES DES DÉLIBÉRATIONS DE MES UNITÉS (3.5.141, Charles, 6 novembre 2026 : « pour les UE, la liste des dates de délibération
   (date et heure), S1 et S2 »). Lues de `GET /api/mes-cours/deliberations` : une ligne par unité, la 1re et la 2e session côte à
   côte, une ligne par organisation quand l'unité se délibère par organisation. `ue` limite à une unité. */
import { useEffect, useState } from 'react';
import { IconGavel } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { EnteteCarte } from './ui.jsx';

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const quand = s => {
  if (!s?.date) return <span className="text-slate-400">date à poser</span>;
  const [a, m, j] = s.date.split('-').map(Number);
  const d = new Date(a, m - 1, j);
  return <span className="tabular-nums">{JOURS[d.getDay()]} {String(j).padStart(2, '0')}/{String(m).padStart(2, '0')}/{a}{s.heure ? ` à ${String(s.heure).slice(0, 5)}` : ''}{s.close ? <span className="text-slate-400"> · close</span> : null}</span>;
};

export function useDatesDeliberation(annee = getAnnee()) {
  const [l, setL] = useState(null);
  useEffect(() => {
    fetch(`/api/mes-cours/deliberations?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { seances: [] })).then(j => setL(j.seances || [])).catch(() => setL([]));
  }, [annee]);
  return l;
}

/** Une ligne courte pour une unité : « S1 lun. 12/01/2027 à 14:00 · S2 … ». */
export function LigneDeliberation({ seances, ue }) {
  const l = (seances || []).filter(s => Number(s.ue_num) === Number(ue));
  if (!l.length) return null;
  const s1 = l.filter(s => s.session === 1), s2 = l.filter(s => s.session === 2);
  const org = s => (s.org ? ` (org. ${s.org})` : '');
  return (
    <span className="text-second text-slate-600 inline-flex flex-wrap gap-x-3 gap-y-0.5 items-center">
      <IconGavel size={14} className="text-slate-400" />
      {s1.map((s, i) => <span key={`a${i}`}>S1{org(s)} : {quand(s)}</span>)}
      {s2.length ? s2.map((s, i) => <span key={`b${i}`}>S2{org(s)} : {quand(s)}</span>) : <span>S2 : <span className="text-slate-400">date à poser</span></span>}
    </span>);
}

export default function DatesDeliberation({ annee = getAnnee() }) {
  const l = useDatesDeliberation(annee);
  if (!l || !l.length) return null;
  const ues = [...new Map(l.map(s => [s.ue_num, s.ue_nom])).entries()];
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte icone={IconGavel} titre="Les délibérations de mes unités" sous={`Date et heure de chaque séance, ${annee}`} />
      <table className="w-full text-sm">
        <thead><tr><th className="px-3 py-1.5 text-left">Unité</th><th className="px-3 py-1.5 text-left">1re session</th><th className="px-3 py-1.5 text-left">2e session</th></tr></thead>
        <tbody>{ues.map(([u, nom]) => {
          const s1 = l.filter(s => s.ue_num === u && s.session === 1), s2 = l.filter(s => s.ue_num === u && s.session === 2);
          const cel = arr => (arr.length ? arr.map((s, i) => <div key={i}>{s.org ? <span className="text-slate-500">org. {s.org} · </span> : null}{quand(s)}</div>) : <span className="text-slate-400">date à poser</span>);
          return (
            <tr key={u} className="border-t border-slate-100 align-top">
              <td className="px-3 py-1.5"><b>UE {u}</b>{nom ? <span className="text-slate-500"> — {nom}</span> : null}</td>
              <td className="px-3 py-1.5">{cel(s1)}</td>
              <td className="px-3 py-1.5">{cel(s2)}</td>
            </tr>);
        })}</tbody>
      </table>
    </div>);
}

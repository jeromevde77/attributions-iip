import { useEffect, useMemo, useState } from 'react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Tableau, Th, Td, Tr, TrTotal, EnteteCarte } from './ui.jsx';

/* L'ETP SUR PLUSIEURS ANNÉES (3.5.427, Charles, 13 novembre 2026 : « un bilan comparatif des ETP par section sur plusieurs années à
   cocher ; pour TIM, la répartition des charges sur les trois dernières années et celle-ci, avec la HELB »). Gestion → Dotation →
   ETP sur plusieurs années. Les années se cochent ; une section ou toutes ; trois lectures : par section (ou par bloc pour une
   section), par nature de charge, par professeur. IIP et HELB côte à côte, total. Barème du Pilotage : CT/800 + PP/1000. */

const n2 = v => (v ? v.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const court = a => `${String(a).slice(2, 4)}-${String(a).slice(7, 9)}`;
const MEMO = 'lucie.etpAnnees';

function sommer(lignes, cle) {
  const m = new Map();
  for (const l of lignes) {
    const k = cle(l);
    if (!m.has(k)) m.set(k, {});
    const par = m.get(k);
    const c = (par[l.annee] = par[l.annee] || { IIP: 0, HELB: 0, per: 0 });
    c[l.contrat === 'HELB' ? 'HELB' : 'IIP'] += l.etp;
    c.per += l.periodes || 0;
  }
  return m;
}

export default function EtpPlusieursAnnees() {
  const [toutes, setToutes] = useState([]);
  const [annees, setAnnees] = useState(() => { try { return JSON.parse(localStorage.getItem(MEMO) || 'null')?.annees || null; } catch { return null; } });
  const [section, setSection] = useState(() => { try { return JSON.parse(localStorage.getItem(MEMO) || 'null')?.section ?? 'TIM'; } catch { return 'TIM'; } });
  const [sections, setSections] = useState([]);
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [helb, setHelb] = useState(true);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l => {
      const codes = (Array.isArray(l) ? l : []).map(a => a.code || a).filter(Boolean).sort();
      setToutes(codes);
      // Par défaut : l'année de travail et les trois qui la précèdent.
      setAnnees(x => x || codes.filter(c => c <= getAnnee()).slice(-4));
    }).catch(() => {});
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l =>
      setSections((Array.isArray(l) ? l : []).map(s => s.code || s).filter(Boolean))).catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem(MEMO, JSON.stringify({ annees, section })); } catch { /* sans mémoire */ } }, [annees, section]);
  useEffect(() => {
    if (!annees?.length) { setD(null); return; }
    let vivant = true; setErreur(null);
    fetch(`/api/pilotage/etp-annees?annees=${encodeURIComponent(annees.join(','))}${section ? `&section=${encodeURIComponent(section)}` : ''}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); if (vivant) setD(j); })
      .catch(e => vivant && setErreur(e.message));
    return () => { vivant = false; };
  }, [annees, section]);

  const cols = useMemo(() => [...(annees || [])].sort(), [annees]);
  const lignes = d?.lignes || [];
  const parGroupe = useMemo(() => sommer(lignes, l => (section ? l.bloc : l.section)), [lignes, section]);
  const parNature = useMemo(() => sommer(lignes, l => l.nature), [lignes]);
  const parProf = useMemo(() => sommer(lignes, l => l.professeur || 'À désigner'), [lignes]);
  const total = useMemo(() => sommer(lignes, () => 'Total').get('Total') || {}, [lignes]);

  const basculer = a => setAnnees(x => (x.includes(a) ? x.filter(y => y !== a) : [...x, a]));
  const val = (c, k) => (c ? (k === 'tot' ? c.IIP + c.HELB : c[k]) : 0);
  const sousCols = helb ? [['IIP', 'IIP'], ['HELB', 'HELB'], ['tot', 'Total']] : [['IIP', 'IIP']];

  const ecart = (par) => {
    if (cols.length < 2) return null;
    const a = val(par[cols[0]], helb ? 'tot' : 'IIP'), b = val(par[cols[cols.length - 1]], helb ? 'tot' : 'IIP');
    if (!a) return null;
    const p = Math.round(((b - a) / a) * 100);
    return <span style={{ color: p > 0 ? 'var(--c-attente)' : p < 0 ? 'var(--c-disponible)' : undefined }}>{p > 0 ? '+' : ''}{p} %</span>;
  };

  const tableau = (titre, sous, m, { tri = 'nom' } = {}) => {
    const entrees = [...m.entries()];
    if (tri === 'charge') entrees.sort((x, y) => val(y[1][cols[cols.length - 1]], 'tot') - val(x[1][cols[cols.length - 1]], 'tot') || x[0].localeCompare(y[0], 'fr'));
    else entrees.sort((x, y) => String(x[0]).localeCompare(String(y[0]), 'fr'));
    return (
      <section className="carte overflow-hidden">
        <EnteteCarte titre={titre} sous={sous} />
        <div className="overflow-x-auto">
          <Tableau className="!border-0 !rounded-none">
            <thead>
              <tr className="tab-entete">
                <Th rowSpan={2}>{titre.replace(/^Par /, '').replace(/^./, c => c.toUpperCase())}</Th>
                {cols.map(a => <Th key={a} colSpan={sousCols.length} align="centre">{a}</Th>)}
                {cols.length > 1 && <Th rowSpan={2} align="droite">Évolution</Th>}
              </tr>
              <tr className="tab-entete">{cols.map(a => sousCols.map(([k, l]) => <Th key={a + k} align="droite">{l}</Th>))}</tr>
            </thead>
            <tbody>
              <TrTotal>
                <Td>Total</Td>
                {cols.map(a => sousCols.map(([k]) => <Td key={a + k} align="droite">{n2(val(total[a], k))}</Td>))}
                {cols.length > 1 && <Td align="droite">{ecart(total)}</Td>}
              </TrTotal>
              {entrees.map(([nom, par]) => (
                <Tr key={nom}>
                  <Td>{nom}</Td>
                  {cols.map(a => sousCols.map(([k]) => <Td key={a + k} align="droite" className={k === 'tot' ? 'font-semibold' : ''}>{n2(val(par[a], k))}</Td>))}
                  {cols.length > 1 && <Td align="droite">{ecart(par)}</Td>}
                </Tr>))}
            </tbody>
          </Tableau>
        </div>
      </section>);
  };

  async function exporter() {
    const XLSX = await import('xlsx');
    const feuille = (m) => [...m.entries()].map(([nom, par]) => {
      const o = { Libellé: nom };
      for (const a of cols) { o[`${a} IIP`] = +val(par[a], 'IIP').toFixed(4); o[`${a} HELB`] = +val(par[a], 'HELB').toFixed(4); o[`${a} total`] = +val(par[a], 'tot').toFixed(4); o[`${a} périodes`] = par[a]?.per || 0; }
      return o;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(feuille(parGroupe)), section ? 'Par bloc' : 'Par section');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(feuille(parNature)), 'Par nature');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(feuille(parProf)), 'Par professeur');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes.map(l => ({ Année: l.annee, Section: l.section, Bloc: l.bloc, Contrat: l.contrat,
      Type: l.type, Nature: l.nature, Professeur: l.professeur || '', Périodes: l.periodes, ETP: +l.etp.toFixed(4) }))), 'Détail');
    XLSX.writeFile(wb, `ETP_${section || 'toutes'}_${cols.map(court).join('_')}.xlsx`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
        <select className="controle" value={section} onChange={e => setSection(e.target.value)} aria-label="Section">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="segments" role="group" aria-label="Années">
          {toutes.map(a => (
            <button key={a} type="button" aria-pressed={!!annees?.includes(a)} onClick={() => basculer(a)}
              className={annees?.includes(a) ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>{court(a)}</button>))}
        </div>
        <label className="flex items-center gap-1.5 text-second text-slate-600 whitespace-nowrap">
          <input type="checkbox" checked={helb} onChange={e => setHelb(e.target.checked)} /> avec la HELB</label>
        {lignes.length > 0 && <button type="button" className="bouton ml-auto" onClick={exporter}>Excel</button>}
      </div>
      <p className="text-second text-slate-500 m-0">ETP au barème du Pilotage : périodes CT / 800 + PP / 1000, autonomie comprise. Les années 2023-2024 et 2024-2025 viennent de l’import des attributions passées.</p>
      {erreur && <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>}
      {!annees?.length ? <p className="text-second text-slate-500">Cochez au moins une année.</p> : !d ? <p className="text-second text-slate-400">Chargement…</p> : !lignes.length
        ? <p className="text-second text-slate-500">Aucune attribution pour ce choix.</p>
        : (<>
          {tableau(section ? 'Par bloc' : 'Par section', section ? `${section} — ETP par bloc d’études` : 'ETP par section', parGroupe)}
          {tableau('Par nature', 'Cours, épreuves, coordinations, encadrements', parNature)}
          {tableau('Par professeur', `Qui porte la charge${section ? ` en ${section}` : ''} — rangé par la charge de ${cols[cols.length - 1]}`, parProf, { tri: 'charge' })}
        </>)}
    </div>);
}

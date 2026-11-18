/**
 * LA CHARGE BLOC PAR BLOC, ET LES POSTES DE COORDINATION HELB (3.5.491, Charles, 16 novembre 2026 : « je veux intégrer la partie
 * bloc 1, 2 et 3, ainsi que la partie coordination — dans la gestion, important »). Les mêmes chiffres que le « Rapport de charge
 * ETP » d'une section (Listes, Éditions → Charge en ETP) : GET /api/pilotage/etp (calculerEtp) — unités du bloc (ue_niv), contrat
 * (porté par la seule HELB = HELB), inscrits, périodes CT / PP, part du bloc, ETP (CT ÷ 800, PP ÷ 1 000) ; sous-totaux « dont IIP »,
 * « dont HELB » ; puis les coordinations financées par la HELB, hors dotation IIP. Rien n'est recalculé ici.
 */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr } from './ui.jsx';
import { COULEUR_BLOC } from '../lib/blocs.js';

const n0 = v => Math.round(v || 0).toLocaleString('fr-BE');
const n2 = v => (v || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n4 = v => (v || 0).toLocaleString('fr-BE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const blocDe = u => { const m = String(u.ue_niv || '').match(/\d+/); return m ? `BA${m[0]}` : 'Autres'; };
const NOM_BLOC = { BA1: 'Bloc 1 (BA1)', BA2: 'Bloc 2 (BA2)', BA3: 'Bloc 3 (BA3)', Autres: 'Hors bloc' };
const ORDRE = ['BA1', 'BA2', 'BA3', 'Autres'];
// Les couleurs de bloc sont des repères (lib/blocs.js, réglées dans Thèmes et couleurs) : la bande PORTE la couleur.
const BANDE = { ...COULEUR_BLOC, Autres: 'rgb(var(--gris-400))' };
const contratDe = u => (u.etp_helb > 0 && u.etp_iip <= 0 ? 'HELB' : 'IIP');
const perDe = u => (u.per_ct || 0) + (u.per_pp || 0) + (u.per_ct_helb || 0) + (u.per_pp_helb || 0);

export default function ChargeParBloc({ annee, section, voir = { blocs: true, coord: true }, compact = false }) {
  const [ouverts, setOuverts] = useState([]);
  const [sec, setSec] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    if (!annee || !section) return;
    setSec(null); setErreur(null);
    fetch(`/api/pilotage/etp?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(d => setSec((d.sections || []).find(s => s.section === section) || false))
      .catch(e => setErreur(e.message));
  }, [annee, section]);
  if (erreur) return <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>;
  if (sec === null) return null;
  if (!sec) return <p className="text-second text-slate-500">Aucune charge pour {section} en {annee}.</p>;

  const parBloc = new Map();
  for (const u of sec.ues || []) { const b = blocDe(u); if (!parBloc.has(b)) parBloc.set(b, []); parBloc.get(b).push(u); }
  const blocs = [...parBloc.keys()].sort((a, b) => ORDRE.indexOf(a) - ORDRE.indexOf(b));
  const coord = sec.coord_helb || [];

  /* UN SEUL TABLEAU (3.5.558, maquette validée de la fiche d'une section : « un bloc se déplie pour ses UE ») : l'ensemble en tête,
     une ligne par bloc qu'on déplie, les coordinations en pied. */
  if (compact) {
    const etpC = (us, c) => us.reduce((t, u) => t + (c === 'IIP' ? (u.etp_iip || 0) : (u.etp_helb || 0)), 0);
    const toutes = sec.ues || [];
    const ligne = (cle, lib, us, fort) => (
      <tr key={cle} className={`border-t border-slate-100 ${fort ? 'ligne-total font-semibold' : ''}`}>
        <td className="px-4 py-2">{lib}</td><td className="px-3 py-2 text-right tabular-nums">{us.length}</td>
        <td className="px-3 py-2 text-right tabular-nums">{n0(us.reduce((t, u) => t + perDe(u), 0))}</td>
        <td className="px-3 py-2 text-right tabular-nums">{n2(etpC(us, 'IIP'))}</td><td className="px-3 py-2 text-right tabular-nums">{n2(etpC(us, 'HELB'))}</td>
        <td className="px-4 py-2 text-right tabular-nums">{n2(us.reduce((t, u) => t + (u.etp_total || 0), 0))}</td></tr>);
    return (
      <section className="carte overflow-hidden lg:col-span-2">
        <EnteteCarte titre={`Les attributions de ${annee}, bloc par bloc, et les coordinations`} sous="un seul tableau · un bloc se déplie pour ses UE" />
        <div className="overflow-x-auto"><table className="w-full text-second" data-numeros="non">
          <thead><tr className="tab-entete text-mention uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2 text-left font-semibold">Bloc</th><th className="px-3 py-2 text-right font-semibold">UE</th><th className="px-3 py-2 text-right font-semibold">Périodes</th>
            <th className="px-3 py-2 text-right font-semibold">ETP IIP</th><th className="px-3 py-2 text-right font-semibold">ETP HELB</th><th className="px-4 py-2 text-right font-semibold">Total</th></tr></thead>
          <tbody>
            {ligne('tout', 'Ensemble', toutes, true)}
            {blocs.map(b => {
              const us = parBloc.get(b).sort((x, y) => String(x.ue_num).localeCompare(String(y.ue_num), 'fr', { numeric: true }));
              const o = ouverts.includes(b);
              return [
                <tr key={b} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50" onClick={() => setOuverts(v => (o ? v.filter(x => x !== b) : [...v, b]))}>
                  <td className="px-4 py-2"><span className="inline-block w-3 text-slate-500">{o ? '▾' : '▸'}</span> {NOM_BLOC[b]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{us.length}</td><td className="px-3 py-2 text-right tabular-nums">{n0(us.reduce((t, u) => t + perDe(u), 0))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n2(etpC(us, 'IIP'))}</td><td className="px-3 py-2 text-right tabular-nums">{n2(etpC(us, 'HELB'))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{n2(us.reduce((t, u) => t + (u.etp_total || 0), 0))}</td></tr>,
                ...(o ? us.map(u => (
                  <tr key={`${b}-${u.ue_num}`} className="border-t border-slate-100 text-slate-600" style={{ background: 'rgb(var(--gris-50, 250 251 252))' }}>
                    <td className="py-1.5 pl-10 pr-3">UE {u.ue_num} · {u.ue_nom || '—'}</td><td />
                    <td className="px-3 py-1.5 text-right tabular-nums">{n0(perDe(u))}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{u.etp_iip ? n2(u.etp_iip) : '—'}</td><td className="px-3 py-1.5 text-right tabular-nums">{u.etp_helb ? n2(u.etp_helb) : '—'}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{n2(u.etp_total)}</td></tr>)) : []),
              ];
            })}
            {voir.coord && coord.length > 0 && (
              <tr className="border-t-2 border-slate-200">
                <td className="px-4 py-2">Coordinations HELB ({coord.map(m => `${String(m.prof_nom || '').toUpperCase()} ${n2(m.etp_helb)}`).join(' · ')})</td>
                <td /><td /><td className="px-3 py-2 text-right">—</td><td className="px-3 py-2 text-right tabular-nums">{n2(sec.etp_coord_helb)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{n2(sec.etp_coord_helb)}</td></tr>)}
          </tbody>
        </table></div>
      </section>);
  }
  return (
    <>
      {voir.blocs && blocs.map(b => {
        const ues = parBloc.get(b).sort((x, y) => String(x.ue_num).localeCompare(String(y.ue_num), 'fr', { numeric: true }));
        const tPer = ues.reduce((t, u) => t + perDe(u), 0), tEtp = ues.reduce((t, u) => t + (u.etp_total || 0), 0);
        const som = c => ues.filter(u => contratDe(u) === c);
        const sPer = c => som(c).reduce((t, u) => t + perDe(u), 0), sEtp = c => som(c).reduce((t, u) => t + (u.etp_total || 0), 0);
        const pc = v => (tPer ? `${Math.round((v / tPer) * 100)} %` : '—');
        return (
          <section key={b} className="carte overflow-hidden lg:col-span-2">
            <div className="titre-carte px-4 py-2 font-semibold" style={{ background: BANDE[b], color: b === 'BA2' ? '#16304F' : '#fff', margin: 0 }}>
              {NOM_BLOC[b]} · {annee}</div>
            <Tableau dense className="!border-0 !rounded-none">
              <TableauEntete><Th>UE</Th><Th>Intitulé</Th><Th>Contrat</Th><Th align="droite">Inscrits</Th><Th align="droite">CT / PP</Th>
                <Th align="droite">%</Th><Th align="droite">Périodes</Th><Th align="droite">ETP</Th></TableauEntete>
              <tbody>
                {ues.map(u => {
                  const ct = Math.round((u.per_ct || 0) + (u.per_ct_helb || 0)), pp = Math.round((u.per_pp || 0) + (u.per_pp_helb || 0)), c = contratDe(u);
                  return (
                    <Tr key={u.ue_num}>
                      <Td className="font-semibold whitespace-nowrap">UE {u.ue_num}</Td>
                      <Td>{u.ue_nom || '—'}{u.ects ? <span className="text-mention text-slate-500"> · {u.ects} ECTS</span> : null}</Td>
                      <Td><span className="text-mention font-bold px-1.5 py-0.5 rounded" style={c === 'HELB' ? { background: 'var(--c-helb, #C2408A)', color: '#fff' } : { border: '1px solid rgb(var(--gris-300))' }}>{c}</span></Td>
                      <Td align="droite">{u.nb_inscrits != null ? n0(u.nb_inscrits) : '—'}</Td>
                      <Td align="droite" className="whitespace-nowrap">{[ct ? `CT ${n0(ct)}` : '', pp ? `PP ${n0(pp)}` : ''].filter(Boolean).join(' · ') || '—'}</Td>
                      <Td align="droite">{pc(perDe(u))}</Td>
                      <Td align="droite">{n0(perDe(u))}</Td>
                      <Td align="droite" ton="fort">{n4(u.etp_total)}</Td>
                    </Tr>);
                })}
                {['IIP', 'HELB'].filter(c => sEtp(c) > 0).map(c => (
                  <Tr key={c}><Td colSpan={5} align="droite" ton="secondaire">dont {c}</Td><Td align="droite" ton="secondaire">{pc(sPer(c))}</Td>
                    <Td align="droite" ton="secondaire">{n0(sPer(c))}</Td><Td align="droite" ton="secondaire">{n4(sEtp(c))}</Td></Tr>))}
                <tr className="ligne-total font-semibold"><Td colSpan={5} align="droite">Sous-total {NOM_BLOC[b].split(' (')[0]}</Td>
                  <Td align="droite">100 %</Td><Td align="droite">{n0(tPer)}</Td><Td align="droite">{n4(tEtp)}</Td></tr>
              </tbody>
            </Tableau>
          </section>);
      })}
      {voir.coord && coord.length > 0 && (
        <section className="carte overflow-hidden lg:col-span-2">
          <EnteteCarte titre={`Postes de coordination HELB — hors dotation IIP · ${n2(sec.etp_coord_helb)} ETP`}
            sous="Financés directement par la HELB, pas prélevés sur la dotation de périodes de l’IIP. La conversion ETP × 800 est indicative (base CT)." />
          <Tableau dense className="!border-0 !rounded-none">
            <TableauEntete><Th>Personne</Th><Th>Fonction</Th><Th align="droite">ETP</Th><Th align="droite">≈ pér. (× 800)</Th></TableauEntete>
            <tbody>
              {coord.map((m, i) => (
                <Tr key={i}><Td>{String(m.prof_nom || '').toUpperCase()} {m.prof_prenom || ''}</Td><Td ton="secondaire">{m.fonction}</Td>
                  <Td align="droite" ton="fort">{n2(m.etp_helb)}</Td><Td align="droite">{n0((m.etp_helb || 0) * 800)}</Td></Tr>))}
              <tr className="ligne-total font-semibold"><Td colSpan={2}>Total coordination HELB</Td>
                <Td align="droite">{n2(sec.etp_coord_helb)}</Td><Td align="droite">{n0((sec.etp_coord_helb || 0) * 800)}</Td></tr>
            </tbody>
          </Tableau>
        </section>)}
    </>);
}

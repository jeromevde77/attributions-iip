import { useEffect, useMemo, useState } from 'react';
import { IconSend, IconX, IconEye } from '@tabler/icons-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Legend } from 'recharts';
import { authHeaders, getAnnee } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { EnteteCarte } from './ui.jsx';
import { Tuile } from './statsUi.jsx';

/* L'IIP ET LA HELB, UNE PAGE DE GESTION NATIVE (3.5.432, Charles, 14 novembre 2026 : « le rapport est lent ; je le voudrais en natif,
   comme le rapport finances ou les nationalités ; beaucoup plus précis avec les coordinations ; tout en accès direct »). Gestion →
   Dotation → IIP et HELB. Les chiffres viennent de GET /api/pilotage/iip-helb (lib/rapportIipHelb.js, ceux de la pièce, calcul gardé
   dix minutes) ; l'écran les dessine. « Imprimer ou envoyer » compose la pièce avec les MÊMES réglages (gardés dans `lucie.iipHelb`).
   Couleurs en hexadécimal : attributs SVG des graphiques, où var() ne s'évalue pas (CLAUDE.md §6). */

const IIP = '#19537E', HELB = '#C2408A', PERCU = '#3E7D5E';
const MEMO = 'lucie.iipHelb';
const lire = () => { try { return JSON.parse(localStorage.getItem(MEMO) || '{}'); } catch { return {}; } };
const n0 = v => Math.round(v || 0).toLocaleString('fr-BE');
const n2 = v => (v || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur = v => `${n0(v)} €`;
const keur = v => `${n0((v || 0) / 1000)} k€`;
const pc = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const court = a => `${String(a).slice(2, 4)}-${String(a).slice(7, 9)}`;
const FORMES = [['empile', 'Empilé'], ['cote', 'Côte à côte'], ['parts', '%'], ['courbe', 'Courbe']];
const CARTES = [['charge', 'La charge'], ['couts', 'Le coût de la section'], ['etudiant', 'Le coût d’un étudiant'], ['recettes', 'Ce qu’un étudiant rapporte'],
  ['fonctions', 'Les coordinations'], ['admin', 'Le cadre administratif'], ['blocs', 'Par bloc'], ['natures', 'Par nature'], ['enseignants', 'Par enseignant']];

/** Un graphique de deux séries sur les années, dans la forme choisie. */
function Graphe({ donnees, forme, fmt, series = [['iip', 'IIP', IIP], ['helb', 'HELB', HELB]] }) {
  const pct = forme === 'parts';
  const d = pct ? donnees.map(x => { const t = series.reduce((s, [k]) => s + (x[k] || 0), 0) || 1; return { ...x, ...Object.fromEntries(series.map(([k]) => [k, ((x[k] || 0) / t) * 100])) }; }) : donnees;
  const f = pct ? v => `${Math.round(v)} %` : fmt;
  const bulle = <Tooltip formatter={(v, n) => [f(v), n]} contentStyle={{ fontSize: 12 }} />;
  if (forme === 'courbe') {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={d} margin={{ top: 22, right: 24, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis dataKey="lib" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={f} width={56} />{bulle}<Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map(([k, n, c]) => <Line key={k} dataKey={k} name={n} stroke={c} strokeWidth={2.5} dot={{ r: 4 }}><LabelList dataKey={k} position="top" formatter={f} style={{ fontSize: 10, fill: c }} /></Line>)}
        </LineChart>
      </ResponsiveContainer>);
  }
  const empile = forme === 'empile' || pct;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={d} margin={{ top: 22, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
        <XAxis dataKey="lib" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={f} width={56} domain={pct ? [0, 100] : undefined} />{bulle}<Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map(([k, n, c], i) => (
          <Bar key={k} dataKey={k} name={n} fill={c} stackId={empile ? 'a' : undefined} radius={empile && i < series.length - 1 ? 0 : [3, 3, 0, 0]}>
            <LabelList dataKey={k} position={empile ? 'center' : 'top'} formatter={v => (v ? f(v) : '')} style={{ fontSize: 10, fill: empile ? '#fff' : c }} />
          </Bar>))}
      </BarChart>
    </ResponsiveContainer>);
}

/** Une carte : son titre, le choix de la forme, et la croix qui la masque. */
function Carte({ titre, sous, forme, onForme, onMasquer, children, large }) {
  return (
    <section className={`carte overflow-hidden ${large ? 'lg:col-span-2' : ''}`}>
      <EnteteCarte titre={titre} sous={sous}>
        {onForme && (
          <div className="segments flex-none" role="radiogroup" aria-label="Forme du graphique">
            {FORMES.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={forme === v} onClick={() => onForme(v)}
              className={`!px-2 text-mention whitespace-nowrap ${forme === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}
          </div>)}
        <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onMasquer} aria-label={`Masquer « ${titre} »`} title="Masquer cette partie"><IconX size={15} /></button>
      </EnteteCarte>
      <div className="p-3">{children}</div>
    </section>);
}

export default function IipHelbGestion() {
  const memo = useMemo(lire, []);
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(memo.section || 'TIM');
  const [annees, setAnnees] = useState(memo.annees || null);
  const [reglages, setReglages] = useState(memo.reglages || {});
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l =>
      setSections((Array.isArray(l) ? l : []).map(s => s.code || s).filter(Boolean))).catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem(MEMO, JSON.stringify({ section, annees, reglages })); } catch { /* sans mémoire */ } }, [section, annees, reglages]);
  useEffect(() => {
    let vivant = true; setEnCours(true); setErreur(null);
    fetch(`/api/pilotage/iip-helb?section=${encodeURIComponent(section)}${annees?.length ? `&annees=${encodeURIComponent(annees.join(','))}` : ''}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); if (vivant) { setD(j); if (!annees) setAnnees(j.annees); } })
      .catch(e => vivant && setErreur(e.message)).finally(() => vivant && setEnCours(false));
    return () => { vivant = false; };
  }, [section, annees]);   // eslint-disable-line react-hooks/exhaustive-deps

  const mes = { charge: 'etp', cout: 'convention', admin: 'oui', coord: 'oui', ...(reglages.mesures || {}) };
  const maj = (k, v) => setReglages(r => ({ ...r, [k]: v }));
  const majMes = (k, v) => maj('mesures', { ...(reglages.mesures || {}), [k]: v });
  const forme = (k, def) => reglages.graphes?.[k] || def;
  const majForme = k => v => maj('graphes', { ...(reglages.graphes || {}), [k]: v });
  const masques = reglages.masques || [];
  const masquer = k => () => maj('masques', [...masques, k]);
  const vu = k => !masques.includes(k);

  // Les chiffres de chaque année selon les mesures choisies — les mêmes formules que la pièce (lib/rapportIipHelb.js).
  const Y = useMemo(() => (d?.Y || []).map(y => {
    const avecC = mes.coord === 'oui', avecA = mes.admin === 'oui', cmb = mes.cout === 'cmb' && d.taux_cmb;
    const cI = avecC ? y.cetp_iip : 0, cH = avecC ? y.cetp_helb : 0;
    const pcI = y.per_iip + cI * 800, pcH = y.per_helb + cH * 800;
    const adm = avecA ? y.admin.part : 0;
    const coutI = (cmb ? pcI * d.taux_cmb : y.cout_iip + (avecC ? y.coord_iip : 0)) + adm;
    const coutH = cmb ? pcH * d.taux_cmb : y.cout_helb + (avecC ? y.coord_helb : 0);
    return { ...y, lib: court(y.annee), etpI: y.ens_iip + cI, etpH: y.ens_helb + cH, pcI, pcH, coutI, coutH,
      chI: mes.charge === 'periodes' ? pcI : y.ens_iip + cI, chH: mes.charge === 'periodes' ? pcH : y.ens_helb + cH };
  }), [d, reglages]);   // eslint-disable-line react-hooks/exhaustive-deps

  const imprimer = async () => {
    const r = await fetch('/api/rapports/iip-helb-annees/document', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ section, annees, reglages }) });
    const j = await r.json(); if (!r.ok) { setErreur(j.error || 'La pièce ne s’est pas composée.'); return; }
    ouvrirApercu({ html: j.html, titre: j.titre, sousTitre: (annees || []).join(' · '), nomFichier: j.nom });
  };

  const aN = Y[Y.length - 1], a0 = Y[0];
  const fCh = mes.charge === 'periodes' ? n0 : n2, uCh = mes.charge === 'periodes' ? 'périodes' : 'ETP';
  const totI = Y.reduce((t, y) => t + y.coutI, 0), totH = Y.reduce((t, y) => t + y.coutH, 0);
  const methode = mes.cout === 'cmb' ? `coût moyen brut (${n2(d?.taux_cmb)} € / période)` : 'coût convention';
  const segm = (k, opts) => (
    <div className="segments flex-none" role="radiogroup">
      {opts.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={mes[k] === v} onClick={() => majMes(k, v)}
        className={`whitespace-nowrap ${mes[k] === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}
    </div>);

  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
        <select className="controle flex-none" value={section} onChange={e => { setSection(e.target.value); setAnnees(null); }} aria-label="Section">
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="segments flex-none" role="group" aria-label="Années">
          {(d?.toutes || []).map(a => { const on = annees?.includes(a); return (
            <button key={a} type="button" aria-pressed={!!on} onClick={() => setAnnees(x => (on ? (x || []).filter(y => y !== a) : [...(x || []), a].sort()))}
              className={`whitespace-nowrap ${on ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{court(a)}</button>); })}
        </div>
        {segm('charge', [['etp', 'ETP'], ['periodes', 'Périodes']])}
        {segm('cout', [['convention', 'Coût convention'], ['cmb', 'Coût moyen brut']])}
        {segm('coord', [['oui', 'Avec coordinations'], ['non', 'Sans']])}
        {segm('admin', [['oui', 'Avec cadre admin.'], ['non', 'Sans']])}
        <button type="button" className="bouton bouton-sortir ml-auto inline-flex items-center gap-1.5 whitespace-nowrap" onClick={imprimer} disabled={!Y.length}>
          <IconSend size={15} />Imprimer</button>
      </div>
      {masques.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-second text-slate-500">
          <IconEye size={14} /> Parties masquées :
          {masques.map(k => <button key={k} type="button" className="bouton !py-0.5 !px-2 text-mention" onClick={() => maj('masques', masques.filter(x => x !== k))}>{CARTES.find(c => c[0] === k)?.[1] || k}</button>)}
        </div>)}
      {erreur && <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>}
      {!d ? <p className="text-second text-slate-400">{enCours ? 'Calcul… (quelques secondes la première fois)' : ''}</p> : !Y.length
        ? <p className="text-second text-slate-500">Aucune attribution en {section} pour ces années.</p> : (<>
        <div className="flex flex-wrap gap-3">
          <Tuile ton="fort" valeur={fCh(aN.chI + aN.chH)} unite={uCh} libelle={`Charge ${aN.annee}`} precision={mes.coord === 'oui' ? 'enseignement et coordinations' : 'enseignement'} />
          <Tuile valeur={pc(aN.chI, aN.chI + aN.chH)} libelle="Part de l’IIP" precision={`${fCh(aN.chI)} ${uCh} · ${aN.profs_iip} enseignant(s)`} />
          <Tuile valeur={pc(aN.chH, aN.chI + aN.chH)} libelle="Part de la HELB" precision={`${fCh(aN.chH)} ${uCh} · ${aN.profs_helb} enseignant(s)`} />
          <Tuile valeur={eur(totI + totH)} libelle={`Coût sur ${Y.length} an(s)`} precision={`HELB ${pc(totH, totI + totH)} · ${methode}`} />
          <Tuile valeur={aN.inscrits ? eur((aN.coutI + aN.coutH) / aN.inscrits) : '—'} libelle="Coût d’un étudiant" precision={aN.inscrits ? `IIP ${eur(aN.coutI / aN.inscrits)} · HELB ${eur(aN.coutH / aN.inscrits)}` : ''} />
          <Tuile valeur={aN.inscrits && !aN.tiers ? eur(aN.recettes / aN.inscrits) : '—'} libelle="Ce qu’il rapporte à l’IIP" precision="droits et frais, au barème" />
          <Tuile valeur={n0(aN.inscrits)} libelle={`Inscrits ${aN.annee}`} precision={Y.length > 1 ? `${n0(a0.inscrits)} en ${a0.annee}` : ''} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {vu('charge') && <Carte titre={`La charge, en ${uCh}`} sous={mes.coord === 'oui' ? 'Enseignement et coordinations' : 'Enseignement seul'}
            forme={forme('charge', 'empile')} onForme={majForme('charge')} onMasquer={masquer('charge')}>
            <Graphe forme={forme('charge', 'empile')} fmt={fCh} donnees={Y.map(y => ({ lib: y.lib, iip: y.chI, helb: y.chH }))} />
          </Carte>}
          {vu('couts') && <Carte titre="Le coût de la section" sous={`${methode}${mes.coord === 'oui' ? ', coordinations' : ''}${mes.admin === 'oui' ? ', cadre administratif' : ''}`}
            forme={forme('couts', 'empile')} onForme={majForme('couts')} onMasquer={masquer('couts')}>
            <Graphe forme={forme('couts', 'empile')} fmt={keur} donnees={Y.map(y => ({ lib: y.lib, iip: y.coutI, helb: y.coutH }))} />
          </Carte>}
          {vu('etudiant') && <Carte titre="Le coût d’un étudiant" sous={methode} forme={forme('etudiant', 'empile')} onForme={majForme('etudiant')} onMasquer={masquer('etudiant')}>
            <Graphe forme={forme('etudiant', 'empile')} fmt={eur} donnees={Y.filter(y => y.inscrits).map(y => ({ lib: y.lib, iip: y.coutI / y.inscrits, helb: y.coutH / y.inscrits }))} />
            <table className="w-full text-second mt-2"><thead><tr className="tab-entete"><th className="px-2 py-1 text-left">Année</th>
              <th className="px-2 py-1 text-right">Convention IIP</th><th className="px-2 py-1 text-right">Convention HELB</th>
              <th className="px-2 py-1 text-right">Coût moyen brut IIP</th><th className="px-2 py-1 text-right">Coût moyen brut HELB</th></tr></thead>
              <tbody>{Y.filter(y => y.inscrits).map(y => {
                const cI = mes.coord === 'oui' ? y.cetp_iip : 0, cH = mes.coord === 'oui' ? y.cetp_helb : 0, adm = mes.admin === 'oui' ? y.admin.part : 0;
                const convI = y.cout_iip + (mes.coord === 'oui' ? y.coord_iip : 0) + adm, convH = y.cout_helb + (mes.coord === 'oui' ? y.coord_helb : 0);
                const cmbI = (y.per_iip + cI * 800) * d.taux_cmb + adm, cmbH = (y.per_helb + cH * 800) * d.taux_cmb;
                return <tr key={y.annee} className="border-b border-slate-100"><td className="px-2 py-1 whitespace-nowrap">{y.annee}</td>
                  <td className="px-2 py-1 text-right">{eur(convI / y.inscrits)}</td><td className="px-2 py-1 text-right">{eur(convH / y.inscrits)}</td>
                  <td className="px-2 py-1 text-right">{d.taux_cmb ? eur(cmbI / y.inscrits) : '—'}</td><td className="px-2 py-1 text-right">{d.taux_cmb ? eur(cmbH / y.inscrits) : '—'}</td></tr>; })}</tbody></table>
          </Carte>}
          {vu('recettes') && <Carte titre="Ce qu’un étudiant rapporte à l’IIP, et ce qu’il lui coûte" sous="Droits et frais au barème, sans plafond ni exonération"
            forme={forme('recettes', 'cote')} onForme={majForme('recettes')} onMasquer={masquer('recettes')}>
            <Graphe forme={forme('recettes', 'cote') === 'parts' ? 'cote' : forme('recettes', 'cote')} fmt={eur}
              series={[['cout', 'Coût pour l’IIP', IIP], ['percu', 'Droits et frais perçus', PERCU]]}
              donnees={Y.filter(y => y.inscrits && !y.tiers).map(y => ({ lib: y.lib, cout: y.coutI / y.inscrits, percu: y.recettes / y.inscrits }))} />
          </Carte>}

          {vu('fonctions') && <Carte large titre="Les coordinations de la section" sous={`ETP × 800 × ${n2(d.tarif_ct)} € (période CT ${d.niveau}), part IIP et part HELB`} onMasquer={masquer('fonctions')}>
            <div className="overflow-x-auto"><table className="w-full text-second">
              <thead><tr className="tab-entete"><th className="px-2 py-1 text-left">Année</th><th className="px-2 py-1 text-left">Fonction</th><th className="px-2 py-1 text-left">Personne</th>
                <th className="px-2 py-1 text-right">ETP</th><th className="px-2 py-1 text-right">dont IIP</th><th className="px-2 py-1 text-right">dont HELB</th>
                <th className="px-2 py-1 text-right">Coût IIP</th><th className="px-2 py-1 text-right">Coût HELB</th></tr></thead>
              <tbody>
                <tr className="ligne-total font-semibold"><td className="px-2 py-1" colSpan={3}>Total</td>
                  <td className="px-2 py-1 text-right">{n2(Y.reduce((t, y) => t + y.cetp_iip + y.cetp_helb, 0))}</td>
                  <td className="px-2 py-1 text-right">{n2(Y.reduce((t, y) => t + y.cetp_iip, 0))}</td><td className="px-2 py-1 text-right">{n2(Y.reduce((t, y) => t + y.cetp_helb, 0))}</td>
                  <td className="px-2 py-1 text-right">{eur(Y.reduce((t, y) => t + y.coord_iip, 0))}</td><td className="px-2 py-1 text-right">{eur(Y.reduce((t, y) => t + y.coord_helb, 0))}</td></tr>
                {Y.map(y => (y.coord.length ? y.coord.map((c, i) => (
                  <tr key={y.annee + i} className="border-b border-slate-100"><td className="px-2 py-1 whitespace-nowrap">{i === 0 ? y.annee : ''}</td>
                    <td className="px-2 py-1">{c.fonction}</td><td className="px-2 py-1">{c.personne}</td>
                    <td className="px-2 py-1 text-right">{c.etp ? n2(c.etp) : <span style={{ color: 'var(--c-attente)' }} title="Personnel → fiche → Fonctions">ETP à renseigner</span>}</td><td className="px-2 py-1 text-right">{c.deja ? <span className="text-slate-400" title="Déjà dans ses attributions">dans ses cours</span> : n2(c.etp_iip)}</td>
                    <td className="px-2 py-1 text-right">{n2(c.etp_helb)}</td><td className="px-2 py-1 text-right">{c.cout_iip ? eur(c.cout_iip) : '—'}</td><td className="px-2 py-1 text-right">{c.cout_helb ? eur(c.cout_helb) : '—'}</td></tr>))
                  : <tr key={y.annee} className="border-b border-slate-100"><td className="px-2 py-1">{y.annee}</td><td className="px-2 py-1 text-slate-400" colSpan={7}>Aucune coordination encodée (Personnel → fiche → Fonctions, année {y.annee}).</td></tr>))}
              </tbody></table></div>
          </Carte>}

          {vu('admin') && <Carte titre="Le cadre administratif" sous="Direction et secrétariat, partagés au prorata des inscrits" onMasquer={masquer('admin')}>
            <table className="w-full text-second"><thead><tr className="tab-entete"><th className="px-2 py-1 text-left">Année</th><th className="px-2 py-1 text-right">ETP de l’école</th>
              <th className="px-2 py-1 text-right">Coût de l’école</th><th className="px-2 py-1 text-right">Part de {section}</th><th className="px-2 py-1 text-right">Montant</th></tr></thead>
              <tbody>{Y.map(y => <tr key={y.annee} className="border-b border-slate-100"><td className="px-2 py-1">{y.annee}</td>
                <td className="px-2 py-1 text-right">{y.admin.fonctions.length ? n2(y.admin.fonctions.reduce((t, f) => t + f.etp, 0)) : '—'}</td>
                <td className="px-2 py-1 text-right">{y.admin.cout ? eur(y.admin.cout) : y.admin.fonctions.length ? 'ETP à régler' : '—'}</td>
                <td className="px-2 py-1 text-right">{pc(y.inscrits, y.admin.base)}</td><td className="px-2 py-1 text-right font-semibold">{y.admin.cout ? eur(y.admin.part) : '—'}</td></tr>)}</tbody></table>
          </Carte>}

          {[['blocs', 'L’enseignement par bloc (ETP)'], ['natures', 'L’enseignement par nature (ETP)']].map(([k, t]) => vu(k) && (
            <Carte key={k} titre={t} onMasquer={masquer(k)}>
              <div className="overflow-x-auto"><table className="w-full text-second">
                <thead><tr className="tab-entete"><th className="px-2 py-1 text-left" />{Y.map(y => <th key={y.annee} className="px-2 py-1 text-right" colSpan={2}>{y.lib}</th>)}</tr>
                  <tr className="tab-entete"><th />{Y.map(y => [<th key={y.annee + 'i'} className="px-2 py-1 text-right font-normal">IIP</th>, <th key={y.annee + 'h'} className="px-2 py-1 text-right font-normal">HELB</th>])}</tr></thead>
                <tbody>{[...new Set(Y.flatMap(y => Object.keys(y[k] || {})))].sort((a, b) => a.localeCompare(b, 'fr')).map(c => (
                  <tr key={c} className="border-b border-slate-100"><td className="px-2 py-1">{c}</td>
                    {Y.map(y => [<td key={y.annee + 'i'} className="px-2 py-1 text-right">{y[k]?.[c]?.iip ? n2(y[k][c].iip) : '—'}</td>,
                      <td key={y.annee + 'h'} className="px-2 py-1 text-right">{y[k]?.[c]?.helb ? n2(y[k][c].helb) : '—'}</td>])}</tr>))}</tbody></table></div>
            </Carte>))}

          {vu('enseignants') && <Carte large titre="Qui porte l’enseignement — par enseignant (ETP)" sous={`Rangé par la charge de ${aN.annee}`} onMasquer={masquer('enseignants')}>
            <div className="overflow-x-auto max-h-[28rem]"><table className="w-full text-second">
              <thead className="sticky top-0 bg-white"><tr className="tab-entete"><th className="px-2 py-1 text-left">Enseignant</th><th className="px-2 py-1 text-left">Contrat</th>
                {Y.map(y => <th key={y.annee} className="px-2 py-1 text-right">{y.lib}</th>)}</tr></thead>
              <tbody>{[...d.enseignants].sort((a, b) => (b.par[aN.annee] || 0) - (a.par[aN.annee] || 0) || a.nom.localeCompare(b.nom, 'fr')).map(e => (
                <tr key={e.nom + e.contrat} className="border-b border-slate-100"><td className="px-2 py-1">{e.nom}</td>
                  <td className="px-2 py-1"><span className="pastille-etat" style={{ color: '#fff', background: e.contrat === 'HELB' ? HELB : IIP }}>{e.contrat}</span></td>
                  {Y.map(y => <td key={y.annee} className="px-2 py-1 text-right">{e.par[y.annee] ? n2(e.par[y.annee]) : '—'}</td>)}</tr>))}</tbody></table></div>
          </Carte>}
        </div>
        <p className="text-mention text-slate-500">Charge au barème du Pilotage (CT ÷ 800 + PP ÷ 1 000, autonomie comprise). Coût convention : la période selon son type et son niveau
          (circulaire des conventions) ; coût moyen brut : un montant unique par période ({n2(d.taux_cmb)} €, Configuration → Coût des périodes). Coordinations :
          ETP × 800 × la période CT, sauf si elles figurent déjà dans les attributions. {d.premiere ? `Première année de ${section} dans Lucie : ${d.premiere}.` : ''}</p>
      </>)}
    </div>);
}

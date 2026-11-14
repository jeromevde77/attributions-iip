import { useEffect, useMemo, useState } from 'react';
import { IconSend, IconX, IconEye } from '@tabler/icons-react';
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Legend } from 'recharts';
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
/* POUR LA HELB (3.5.433) : la formule de helbAnnee (lib/rapportIipHelb.js), recopiée ici pour l'écran — qui change l'une change l'autre. */
const PARAM_HELB = { part: 50, muce: 3837.18, ponderation: 1.5, cmbp: 90000, autres: 0, fonctionnement: 20.8, moyenne: 17, debut: 2026, lissage: 3 };
const LIB_HELB = [['part', '% des inscrits comptés', '%'], ['muce', 'Unité de charge (MUCE)', '€'], ['ponderation', 'Pondération santé', '×'],
  ['debut', 'Allocation à partir de', 'année'], ['lissage', 'Lissage', 'ans'], ['cmbp', 'Coût moyen brut d’un ETP', '€'], ['autres', 'Autres services', '% des salaires'], ['fonctionnement', 'Fonctionnement', '% de l’allocation'], ['moyenne', 'Moyenne HELB', 'étu./ETP']];
const decalee = (a, k) => `${Number(a.slice(0, 4)) - k}-${Number(a.slice(5, 9)) - k}`;
function helbAnnee(y, P, avecCoord, inscritsDe, materiel) {
  const comptes = y.inscrits * P.part / 100;
  let base = 0;
  if (Number(y.annee.slice(0, 4)) >= P.debut) {
    const n = Math.max(1, Math.round(P.lissage));
    for (let k = 1; k <= n; k++) base += (inscritsDe(decalee(y.annee, k)) || 0) * P.part / 100;
    base /= n;
  }
  const allocation = base * P.muce * P.ponderation, droits = y.tiers ? 0 : (y.recettes || 0), recettes = allocation + droits;
  const etp = y.ens_helb + (avecCoord ? y.cetp_helb : 0), salaires = etp * P.cmbp, autres = salaires * P.autres / 100;
  const fonct = P.mode_fonct === 'forfait' ? allocation * P.fonctionnement / 100 : (materiel || 0);
  const cout = salaires + autres + fonct;
  return { comptes, base, allocation, droits, recettes, etp, salaires, autres, fonct, cout, resultat: recettes - cout, parEtp: etp ? comptes / etp : null };
}
const CARTES = [['charge', 'La charge'], ['couts', 'Le coût de la section'], ['etudiant', 'Le coût d’un étudiant'], ['recettes', 'Ce qu’un étudiant rapporte'], ['helb', 'Pour la HELB'], ['vrio', 'La lecture VRIO'], ['comparaison', 'Les cursus de la HE'],
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
  const Y = useMemo(() => (d?.Y || []).map(y0 => {
    // Les inscrits retenus par la direction, année par année (3.5.434) — la pièce applique les mêmes.
    const ret = Number(reglages.inscrits?.[y0.annee]);
    const y = ret > 0 ? { ...y0, inscrits: Math.round(ret), inscrits_lucie: y0.inscrits, recettes: y0.inscrits ? y0.recettes * Math.round(ret) / y0.inscrits : y0.recettes } : y0;
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

  const PH = { ...PARAM_HELB, ...Object.fromEntries(Object.entries(reglages.helb || {}).filter(([, v]) => v !== '' && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) };
  const inscritsDe = a => { const r = Number(reglages.inscrits?.[a]); return r > 0 ? r : (d?.inscrits_annees?.[a] || 0); };
  PH.mode_fonct = reglages.helb?.mode_fonct === 'forfait' ? 'forfait' : 'reel';
  const materielDe = a => { const v = reglages.materiel?.[a]; return v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : (d?.materiel_defaut?.[a]?.montant ?? 0); };
  // L'aide à la réussite (UE 95), 100 % IIP : son coût × la part de la section (réglable ; à défaut, sa part dans les inscrits de l'IIP).
  const part95 = reglages.helb?.part95 !== undefined && reglages.helb.part95 !== '' && Number.isFinite(Number(reglages.helb.part95)) ? Number(reglages.helb.part95) / 100 : (d?.admin_reference?.ratio || 0);
  const u95 = y => (y.ue95?.cout || 0) * part95;
  const HY = Y.map(y => ({ y, h: helbAnnee(y, PH, mes.coord === 'oui', inscritsDe, materielDe(y.annee)) }));
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
      {d?.Y?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-second text-slate-600">
          <span>Inscrits retenus :</span>
          {d.Y.map(y => (
            <label key={y.annee} className="flex items-center gap-1" title={`Lucie en compte ${y.inscrits}`}>
              <span className="text-slate-500">{court(y.annee)}</span>
              <input className="controle !h-8 w-20 text-right" inputMode="numeric" placeholder={String(y.inscrits)} value={reglages.inscrits?.[y.annee] ?? ''}
                onChange={e => maj('inscrits', { ...(reglages.inscrits || {}), [y.annee]: e.target.value.replace(/\D/g, '') })} aria-label={`Inscrits ${y.annee}`} />
            </label>))}
          <span className="text-mention text-slate-400">vide = le chiffre de Lucie (en gris)</span>
        </div>)}
      {!d ? <p className="text-second text-slate-400">{enCours ? 'Calcul… (quelques secondes la première fois)' : ''}</p> : !Y.length
        ? <p className="text-second text-slate-500">Aucune attribution en {section} pour ces années.</p> : (<>
        <div className="flex flex-wrap gap-3">
          <Tuile ton="fort" valeur={fCh(aN.chI + aN.chH)} unite={uCh} libelle={`Charge ${aN.annee}`} precision={mes.coord === 'oui' ? 'enseignement et coordinations' : 'enseignement'} />
          <Tuile valeur={pc(aN.chI, aN.chI + aN.chH)} libelle="Part de l’IIP" precision={`${fCh(aN.chI)} ${uCh} · ${aN.profs_iip} enseignant(s)`} />
          <Tuile valeur={pc(aN.chH, aN.chI + aN.chH)} libelle="Part de la HELB" precision={`${fCh(aN.chH)} ${uCh} · ${aN.profs_helb} enseignant(s)`} />
          <Tuile valeur={eur(totI + totH)} libelle={`Coût sur ${Y.length} an(s)`} precision={`HELB ${pc(totH, totI + totH)} · ${methode}`} />
          <Tuile valeur={aN.inscrits ? eur((aN.coutI + aN.coutH) / aN.inscrits) : '—'} libelle="Coût d’un étudiant" precision={aN.inscrits ? `IIP ${eur(aN.coutI / aN.inscrits)} · HELB ${eur(aN.coutH / aN.inscrits)}` : ''} />
          <Tuile valeur={aN.inscrits && !aN.tiers ? eur(aN.recettes / aN.inscrits) : '—'} libelle="Ce qu’il rapporte" precision="droits et frais, à l’ASBL" />
          {(() => { const h = HY[HY.length - 1].h; return <Tuile valeur={`${h.resultat >= 0 ? '+' : '−'}${eur(Math.abs(h.resultat))}`} libelle={`Résultat HELB et ASBL ${aN.annee}`}
            precision={`rapporte ${keur(h.recettes)} · coûte ${keur(h.cout)}`} />; })()}
          <Tuile valeur={eur(HY.reduce((t, x) => t + (x.y.admin.part || 0) + u95(x.y), 0))} libelle={`Apport de l’IIP sur ${Y.length} an(s)`} precision="administration et aide à la réussite, 100 % IIP" />
          <Tuile valeur="0 €" libelle="Coût supplémentaire pour l’IIP" precision="financé sur ses propres dotations" />
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
          {vu('recettes') && <Carte titre="Un étudiant : ce qu’il rapporte (droits, à l’ASBL) et ce qu’il coûte à l’IIP" sous="Droits et frais au barème, sans plafond ni exonération"
            forme={forme('recettes', 'cote')} onForme={majForme('recettes')} onMasquer={masquer('recettes')}>
            <Graphe forme={forme('recettes', 'cote') === 'parts' ? 'cote' : forme('recettes', 'cote')} fmt={eur}
              series={[['cout', 'Coût pour l’IIP', IIP], ['percu', 'Droits et frais perçus', PERCU]]}
              donnees={Y.filter(y => y.inscrits && !y.tiers).map(y => ({ lib: y.lib, cout: y.coutI / y.inscrits, percu: y.recettes / y.inscrits }))} />
          </Carte>}

          {vu('helb') && <Carte large titre="Pour la HELB et l’ASBL : ce que coûte et rapporte la section" sous={`Allocation dès ${PH.debut}-${PH.debut + 1}, lissée sur ${PH.lissage} ans · droits à l’ASBL · ETP à ${n0(PH.cmbp)} €`}
            forme={forme('helb', 'cote')} onForme={majForme('helb')} onMasquer={masquer('helb')}>
            <div className="grid gap-3 lg:grid-cols-[1fr_20rem]">
              <div className="min-w-0">
                <Graphe forme={forme('helb', 'cote') === 'parts' ? 'cote' : forme('helb', 'cote')} fmt={keur}
                  series={[['recettes', 'Ce qu’elle rapporte', PERCU], ['cout', 'Ce qu’elle coûte', HELB]]}
                  donnees={HY.map(({ y, h }) => ({ lib: y.lib, recettes: h.recettes, cout: h.cout }))} />
                <div className="overflow-x-auto"><table className="w-full text-second mt-2 whitespace-nowrap">
                  <thead><tr className="tab-entete"><th className="px-2 py-1 text-left">Année</th><th className="px-2 py-1 text-right">Comptés (lissés)</th><th className="px-2 py-1 text-right">Allocation</th><th className="px-2 py-1 text-right">Droits (ASBL)</th>
                    <th className="px-2 py-1 text-right">ETP HELB</th><th className="px-2 py-1 text-right">Salaires</th><th className="px-2 py-1 text-right">Autres serv.</th>
                    <th className="px-2 py-1 text-right">{PH.mode_fonct === 'forfait' ? 'Fonct. (forfait)' : 'Matériel'}</th><th className="px-2 py-1 text-right">Coût</th><th className="px-2 py-1 text-right">Résultat</th><th className="px-2 py-1 text-right">Étu./ETP</th><th className="px-2 py-1 text-right" title="Direction et secrétariat, 100 % IIP">Apport IIP : admin.</th><th className="px-2 py-1 text-right" title="UE 95, 100 % IIP">Apport IIP : aide réussite</th></tr></thead>
                  <tbody>
                    <tr className="ligne-total font-semibold"><td className="px-2 py-1">Ensemble</td><td />
                      <td className="px-2 py-1 text-right">{eur(HY.reduce((t, x) => t + x.h.allocation, 0))}</td>
                      <td className="px-2 py-1 text-right">{eur(HY.reduce((t, x) => t + x.h.droits, 0))}</td><td />
                      <td className="px-2 py-1 text-right">{eur(HY.reduce((t, x) => t + x.h.salaires, 0))}</td><td className="px-2 py-1 text-right">{eur(HY.reduce((t, x) => t + x.h.autres, 0))}</td>
                      <td className="px-2 py-1 text-right">{eur(HY.reduce((t, x) => t + x.h.fonct, 0))}</td><td className="px-2 py-1 text-right">{eur(HY.reduce((t, x) => t + x.h.cout, 0))}</td>
                      <td className="px-2 py-1 text-right" style={{ color: 'var(--c-reussi)' }}>{eur(HY.reduce((t, x) => t + x.h.resultat, 0))}</td><td />
                      <td className="px-2 py-1 text-right">{eur(HY.reduce((t, x) => t + (x.y.admin.part || 0), 0))}</td>
                      <td className="px-2 py-1 text-right">{eur(HY.reduce((t, x) => t + u95(x.y), 0))}</td></tr>
                    {HY.map(({ y, h }) => <tr key={y.annee} className="border-b border-slate-100"><td className="px-2 py-1 whitespace-nowrap">{y.annee}</td>
                      <td className="px-2 py-1 text-right">{h.base ? n0(h.base) : '—'}</td>
                      <td className="px-2 py-1 text-right">{h.allocation ? eur(h.allocation) : <span className="text-slate-400">en création</span>}</td>
                      <td className="px-2 py-1 text-right">{eur(h.droits)}</td><td className="px-2 py-1 text-right">{n2(h.etp)}</td>
                      <td className="px-2 py-1 text-right">{eur(h.salaires)}</td><td className="px-2 py-1 text-right">{eur(h.autres)}</td><td className="px-2 py-1 text-right">{eur(h.fonct)}</td>
                      <td className="px-2 py-1 text-right">{eur(h.cout)}</td>
                      <td className="px-2 py-1 text-right font-semibold" style={{ color: h.resultat >= 0 ? 'var(--c-reussi)' : 'var(--c-refuse)' }}>{h.resultat >= 0 ? '+' : '−'}{eur(Math.abs(h.resultat))}</td>
                      <td className="px-2 py-1 text-right">{h.parEtp ? <span title={`Moyenne HELB : ${PH.moyenne}`}>{n0(h.parEtp)} <span className="text-slate-400">/ {PH.moyenne}</span></span> : '—'}</td>
                      <td className="px-2 py-1 text-right" title={y.admin.reprise ? `Structure de ${y.admin.reprise} reprise` : ''}>{y.admin.part ? `${eur(y.admin.part)}${y.admin.reprise ? ' *' : ''}` : '—'}</td>
                      <td className="px-2 py-1 text-right" title={`UE 95 : ${n0(y.ue95?.periodes)} périodes`}>{u95(y) ? eur(u95(y)) : '—'}</td></tr>)}
                  </tbody></table></div>
                <div className="bloc-etat px-3 py-2 text-second mt-2" data-etat="surveiller">
                  <b>Les ressources humaines de la HELB sont mises de côté</b> : elle établit les contrats de ses enseignants, mais ce coût n’est pas estimable.
                  Tout le reste de l’administration est à l’IIP — le secrétariat travaille à 100 % pour les étudiants et la direction —, ainsi que l’aide à la réussite (UE 95).
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="intertitre">Le matériel et le fonctionnement</div>
                <div className="segments w-full" role="radiogroup">
                  {[['reel', 'Réel de la section'], ['forfait', `Forfait ${PH.fonctionnement} %`]].map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={PH.mode_fonct === v} onClick={() => maj('helb', { ...(reglages.helb || {}), mode_fonct: v })}
                      className={`flex-1 whitespace-nowrap ${PH.mode_fonct === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>))}
                </div>
                {PH.mode_fonct === 'reel' && HY.map(({ y }) => (
                  <label key={y.annee} className="flex items-center gap-2 text-second" title={d?.materiel_defaut?.[y.annee]?.source || ''}>
                    <span className="flex-1 min-w-0 truncate">{y.annee} <span className="text-mention text-slate-400">{d?.materiel_defaut?.[y.annee]?.source?.split(' — ')[0] || ''}</span></span>
                    <input className="controle !h-8 w-24 text-right" inputMode="decimal" placeholder={String(d?.materiel_defaut?.[y.annee]?.montant ?? 0)}
                      value={reglages.materiel?.[y.annee] ?? ''} onChange={e => maj('materiel', { ...(reglages.materiel || {}), [y.annee]: e.target.value.replace(',', '.') })} aria-label={`Matériel ${y.annee}`} />
                    <span className="w-20 text-mention text-slate-500">€</span>
                  </label>))}
                <div className="intertitre pt-2">Les paramètres</div>
                <label className="flex items-center gap-2 text-second">
                  <span className="flex-1 min-w-0">Part de la section dans l’UE 95</span>
                  <input className="controle !h-8 w-24 text-right" inputMode="decimal" placeholder={String(Math.round((d?.admin_reference?.ratio || 0) * 100))}
                    value={reglages.helb?.part95 ?? ''} onChange={e => maj('helb', { ...(reglages.helb || {}), part95: e.target.value.replace(',', '.') })} aria-label="Part de la section dans l'UE 95" />
                  <span className="w-20 text-mention text-slate-500">%</span>
                </label>
                {LIB_HELB.map(([k, l, u]) => (
                  <label key={k} className="flex items-center gap-2 text-second">
                    <span className="flex-1 min-w-0">{l}</span>
                    <input className="controle !h-8 w-24 text-right" inputMode="decimal" value={reglages.helb?.[k] ?? PARAM_HELB[k]}
                      onChange={e => maj('helb', { ...(reglages.helb || {}), [k]: e.target.value.replace(',', '.') })} aria-label={l} />
                    <span className="w-20 text-mention text-slate-500">{u}</span>
                  </label>))}
                <p className="text-mention text-slate-500 m-0">Sources : présentation financière des départements (Vinci : MUCE 2022, 20,8 % de fonctionnement, 37,2 % d'autres
                  services), courriel de F. Vanderoost du 27 août 2026 (santé × 1,5, ~90 000 € par ETP), tableau Cor_HE_AE (17 étudiants par ETP en moyenne).
                  Apport de l'IIP : le cadre administratif (direction, secrétariat), 100 % IIP, × la part de la section dans ses inscrits
                  {d.admin_reference ? ` ; * structure de ${d.admin_reference.annee} reprise (${eur(d.admin_reference.cout)} × ${pc(d.admin_reference.ratio, 1)})` : ''} — la HELB n'en paie rien,
                  la HELB n'y garde que les ressources humaines de ses propres contrats : « autres services » à régler en conséquence (0 % par défaut ; le taux de Vinci, 37,2 %, couvre tous ses services centraux).
                  Matériel : comptabilité analytique de l'ASBL (2023 : aucun matériel pour TIM) puis budgets 2025-2027, part HELB.
                  Les droits d'inscription vont à l'ASBL et alimentent les moyens de la Haute École. L'IIP a financé sa part sur ses propres
                  dotations : aucun coût supplémentaire, une optimisation des moyens existants.</p>
              </div>
            </div>
          </Carte>}

          {vu('vrio') && (() => {
            /* LA LECTURE VRIO (3.5.439, Charles : « un dossier très clair, transparent, qui montre une section optimisée, porteuse, une valeur
               VRIN/VRIO »). Les preuves sont calculées ici, la lecture se réécrit (gardée avec les réglages, reprise par la pièce). */
            const C = (d.comparaison?.cursus || []).filter(c => c.ratio).sort((a, b) => b.ratio - a.ratio);
            const tim = C.find(c => c.tim), rang = C.findIndex(c => c.tim) + 1;
            const res = HY.reduce((t, x) => t + x.h.resultat, 0), apport = HY.reduce((t, x) => t + (x.y.admin.part || 0) + u95(x.y), 0);
            const mat = HY.reduce((t, x) => t + x.h.fonct, 0), lN = HY[HY.length - 1];
            const sg = v => `${v >= 0 ? '+' : '−'}${eur(Math.abs(v))}`;
            const L = [
              ['V', 'Valeur', [`Résultat HELB et ASBL : ${sg(res)} sur ${HY.length} an(s)`, `${lN.y.annee} : ${eur(lN.h.recettes)} de recettes, ${eur(lN.h.cout)} de coût`, `Apport de l’IIP : ${eur(apport)}`],
                `La section rapporte plus qu'elle ne coûte : sur ${HY.length} année(s), le résultat pour la HELB et l'ASBL est de ${sg(res)}, et l'IIP y apporte ${eur(apport)} sans coût supplémentaire, sur ses propres dotations.`],
              ['R', 'Rareté', tim ? [`${n0(tim.ratio)} étudiants par ETP (${d.comparaison.annee})`, `Rang ${rang} sur ${C.length} cursus HELB`, `Moyenne HELB ${n0(d.comparaison.moyennes['Moyenne HELB'])}, santé ${n0(d.comparaison.moyennes['Santé'])}`] : [],
                tim ? `Avec ${n0(tim.ratio)} étudiants par ETP enseignant, ${section} est ${rang === 1 ? 'le cursus le plus efficient' : `au ${rang}e rang`} des ${C.length} cursus de la HELB, dont la moyenne est de ${n0(d.comparaison.moyennes['Moyenne HELB'])}.` : ''],
              ['I', 'Difficile à imiter', [`Part IIP de la charge ${aN.annee} : ${pc(aN.etpI, aN.etpI + aN.etpH)}`, 'Administration : 100 % IIP', `Aide à la réussite (UE 95) : ${eur(HY.reduce((t, x) => t + u95(x.y), 0))}`],
                "Le modèle tient à la co-organisation : l'enseignement partagé entre l'IIP (sur sa dotation) et la HELB (sur son allocation), l'administration entièrement à l'IIP, l'aide à la réussite (UE 95) intégrée. Il ne se reproduit pas sans les deux établissements."],
              ['O', 'Organisation', [`Matériel et fonctionnement : ${eur(mat)}`, `${n0(aN.inscrits)} inscrits en ${aN.annee}`, `Coordinations : ${aN.coord.length} fonction(s) encodée(s)`],
                `L'organisation est déjà en place : secrétariat et direction à l'IIP, coordinations identifiées, matériel réduit (${eur(mat)} sur la période), suivi dans Lucie.`],
            ];
            return (
              <Carte large titre="Une section porteuse : la lecture VRIO" sous="Les preuves sont calculées ; la lecture est la vôtre — réécrivez-la, la pièce la reprend" onMasquer={masquer('vrio')}>
                <div className="space-y-2">
                  {L.map(([k, nom, preuves, defaut]) => (
                    <div key={k} className="grid gap-3 md:grid-cols-[9rem_18rem_1fr] items-start border-b border-slate-100 pb-2">
                      <div><span className="titre-carte">{k}</span> <span className="text-second text-slate-600">{nom}</span></div>
                      <ul className="text-second m-0 pl-4 list-disc">{preuves.map(p => <li key={p}>{p}</li>)}</ul>
                      <textarea className="controle w-full !h-auto text-second" rows={3} data-reponses="non" value={reglages.vrio?.[k] ?? defaut}
                        onChange={e => maj('vrio', { ...(reglages.vrio || {}), [k]: e.target.value })} aria-label={`Lecture ${nom}`} />
                    </div>))}
                </div>
              </Carte>);
          })()}

          {vu('comparaison') && d.comparaison && (() => {
            const C = d.comparaison.cursus.filter(c => c.ratio).sort((a, b) => b.ratio - a.ratio);
            const ann = ['2022-2023', '2023-2024', '2024-2025', '2025-2026'];
            return (
              <Carte large titre="Les cursus de la Haute École : étudiants par ETP enseignant" sous={`Les chiffres de la HELB — ${d.comparaison.source}`} onMasquer={masquer('comparaison')}>
                <div className="grid gap-3 lg:grid-cols-2">
                  <ResponsiveContainer width="100%" height={Math.max(280, C.length * 20)}>
                    <BarChart data={C.map(c => ({ lib: c.cursus, v: Math.round(c.ratio), tim: c.tim }))} layout="vertical" margin={{ left: 10, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="lib" width={190} interval={0} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={v => [`${v} étudiants par ETP`, d.comparaison.annee]} contentStyle={{ fontSize: 12 }} />
                      <Bar dataKey="v" radius={[0, 3, 3, 0]}>
                        {C.map(c => <Cell key={c.cursus} fill={c.tim ? PERCU : '#94A3B8'} />)}
                        <LabelList dataKey="v" position="right" style={{ fontSize: 10, fill: '#475569' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="overflow-x-auto"><table className="w-full text-second whitespace-nowrap">
                    <thead><tr className="tab-entete"><th className="px-2 py-1 text-left">Cursus</th>{ann.map(a => <th key={a} className="px-2 py-1 text-right">{court(a)}</th>)}</tr></thead>
                    <tbody>{d.comparaison.cursus.filter(c => Object.keys(c.series).length).map(c => (
                      <tr key={c.cursus} className={`border-b border-slate-100 ${c.tim ? 'font-semibold' : ''}`} style={c.tim ? { color: PERCU } : undefined}><td className="px-2 py-1">{c.cursus}</td>
                        {ann.map(a => { const v = c.series[a]; return <td key={a} className="px-2 py-1 text-right">{v && v[1] ? n0(v[0] / v[1]) : '—'}</td>; })}</tr>))}</tbody></table>
                    <p className="text-mention text-slate-500 mt-1">Moyenne HELB {n0(d.comparaison.moyennes['Moyenne HELB'])}, santé {n0(d.comparaison.moyennes['Santé'])}. Le département santé compte {n2(d.comparaison.admin['Santé']['2025-2026'])} ETP administratifs en 2025-2026 ; ceux de {section} sont à l’IIP.</p>
                  </div>
                </div>
              </Carte>);
          })()}

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
                <td className="px-2 py-1 text-right">{pc(y.inscrits, y.admin.base)}</td><td className="px-2 py-1 text-right font-semibold" title={y.admin.reprise ? `Structure de ${y.admin.reprise} reprise` : ''}>{y.admin.part ? `${eur(y.admin.part)}${y.admin.reprise ? ' *' : ''}` : '—'}</td></tr>)}</tbody></table>
            {Y.some(y => y.admin.reprise) && <p className="text-mention text-slate-500 mt-1 mb-0">* Fonctions non encodées cette année : la structure de {d.admin_reference?.annee} est reprise, partagée selon la part de {section}.</p>}
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

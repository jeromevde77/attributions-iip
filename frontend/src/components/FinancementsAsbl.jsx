/* LES FINANCEMENTS PAR SECTION ET PAR DÉPARTEMENT DE L'ASBL (3.5.511, Charles, 17 novembre 2026 : « un tableau des financements de
   chaque section et département de l'ASBL : salaires, financements, nombre d'étudiants »). Les chiffres viennent de
   GET /api/pilotage/financements (lib/financementsAsbl.js) : les comptes de l'ASBL, les étudiants et ETP de la HELB et de Lucie. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { IconChevronRight, IconRefresh } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { BulleAide, EnteteCarte, Tableau, TableauEntete, Th, Td, Tr, TrTotal, TuileEtat } from './ui.jsx';

const eur = v => (v == null ? '—' : `${Math.round(v).toLocaleString('fr-BE')} €`);
const n0 = v => (v == null ? '—' : Math.round(v).toLocaleString('fr-BE'));
const n1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('fr-BE'));
const n2 = v => (v == null ? '—' : v.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const par = (a, b) => (a != null && b ? a / b : null);
// Le coût complet par étudiant, sauf quand le coût des enseignants de l'IIP manque pour l'année (3.5.520).
const cpe = v => (v?.incomplet ? null : par(v?.cout_complet, v?.etudiants));

const METRIQUES = [
  ['etudiants', 'Étudiants', v => v?.etudiants, n0],
  ['charges', 'Charges', v => v?.charges, eur],
  ['produits', 'Produits', v => v?.produits, eur],
  ['resultat', 'Résultat', v => v?.resultat, eur],
  ['cout_etu', 'Coût complet / étudiant', v => (v?.incomplet ? null : par(v?.cout_complet, v?.etudiants)), eur],
  ['etu_etp', 'Étudiants / ETP', v => par(v?.etudiants, v?.etp), n1],
];

export default function FinancementsAsbl() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [tour, setTour] = useState(0);
  const [essai, setEssai] = useState(0);   // le calcul tourne au serveur : on redemande (202)
  const [annee, setAnnee] = useState(null);
  const [ouverts, setOuverts] = useState([]);
  const [metrique, setMetrique] = useState('charges');
  useEffect(() => {
    let vivant = true; setErreur(null);
    fetch(`/api/pilotage/financements${tour && !essai ? '?recalculer=1' : ''}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(j => { if (!vivant) return; if (j.en_cours) { setTimeout(() => vivant && setEssai(n => n + 1), 4000); return; } setD(j); setAnnee(a => a || j.dernier); })
      .catch(e => vivant && setErreur(e.message));
    return () => { vivant = false; };
  }, [tour, essai]);

  const lignes = d?.lignes || [];
  // Une ligne de cursus ne se montre que sous son département ouvert.
  const visibles = useMemo(() => lignes.filter(l => l.niveau < 2 || ouverts.includes(`${l.bloc}|${l.dept}`)), [lignes, ouverts]);
  if (erreur) return <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>;
  if (!d) return <p className="text-second text-slate-500">Calcul des financements… (les chiffres de Lucie prennent quelques secondes)</p>;
  if (!lignes.length) return <p className="text-second text-slate-500">Aucune synthèse des budgets et comptes de l’ASBL n’est déposée (Gestion → Les sources).</p>;

  const A = annee || d.dernier;
  const tot = lignes.find(l => l.bloc === 'ASBL')?.par[A];
  const helb = lignes.find(l => l.bloc === 'HELB' && l.niveau === 0)?.par[A];
  const iip = lignes.find(l => l.bloc === 'Institut Ilya Prigogine' && l.niveau === 0)?.par[A];
  const deptDe = l => (l.niveau === 1 && l.bloc === 'HELB' && /^Département /.test(l.libelle) ? `HELB|${l.libelle.replace(/^Département /, '')}` : null);
  const bascule = k => setOuverts(x => (x.includes(k) ? x.filter(y => y !== k) : [...x, k]));
  const nomLigne = l => {
    const k = deptDe(l);
    return (
      <span className={`inline-flex items-center gap-1 ${l.niveau === 2 ? 'pl-6 text-slate-600' : l.niveau === 1 ? 'pl-3' : 'font-semibold'}`}>
        {k && <button type="button" onClick={() => bascule(k)} className="text-slate-400 hover:text-slate-700 sans-impression" aria-expanded={ouverts.includes(k)}
          aria-label={ouverts.includes(k) ? 'Replier les cursus' : 'Voir les cursus'}>
          <IconChevronRight size={14} className={`transition-transform ${ouverts.includes(k) ? 'rotate-90' : ''}`} /></button>}
        {l.libelle}
      </span>);
  };
  const cellules = (v, fort) => {
    const ens = v?.enseignants;
    return (<>
      <Td align="droite">{n0(v?.etudiants)}</Td>
      <Td align="droite">{n2(v?.etp)}</Td>
      <Td align="droite">{n1(par(v?.etudiants, v?.etp))}</Td>
      <Td align="droite">{eur(v?.charges)}</Td>
      <Td align="droite">{eur(v?.produits)}</Td>
      {avecDecret && <Td align="droite" title={v?.decret_detail ? `Moyenne des étudiants comptés ${v.decret_detail.annees.map(([a, n]) => `${a} : ${n}`).join(', ')} = ${v.decret_detail.moyenne} × MUCE ${v.decret_detail.annee_civile || ''} ${eur(v.decret_detail.muce)}${v.decret_detail.muce_estimee ? ' (estimée par indexation)' : ''} × ${v.decret_detail.ponderation}` : undefined}>
        {v?.decret != null ? <>{eur(v.decret)}{v.decret_detail?.muce_estimee ? '*' : ''}<span className={`block text-mention ${v.decret - (v.produits || 0) >= 0 ? 'text-[var(--c-reussi)]' : 'text-[var(--c-refuse)]'}`}>{v.decret - (v.produits || 0) >= 0 ? '+' : '−'}{eur(Math.abs(v.decret - (v.produits || 0)))} / comptes</span></> : '—'}</Td>}
      <Td align="droite" className={v?.resultat < 0 ? '!text-[var(--c-refuse)]' : ''}>{eur(v?.resultat)}</Td>
      <Td align="droite" title={v?.estime ? 'ETP × coût moyen d’un ETP statutaire du COR — estimation, déjà comprise dans les charges' : v?.federation ? 'Payés par la Fédération, hors des comptes de l’ASBL' : undefined}>
        {ens != null ? <>{v?.estime ? '≈ ' : ''}{eur(ens)}{v?.federation && <span className="text-mention text-slate-400"> FWB</span>}</> : '—'}</Td>
      <Td align="droite" className={fort ? 'font-semibold' : ''}>{eur(v?.cout_complet)}</Td>
      <Td align="droite" title={v?.incomplet ? 'Coût des enseignants de l’IIP inconnu pour une partie des sections cette année-là (pas d’attributions dans Lucie) : pas de coût par étudiant.' : undefined}>{v?.incomplet ? '—' : eur(par(v?.cout_complet, v?.etudiants))}</Td>
      <Td align="droite">{eur(par(v?.produits, v?.etudiants))}</Td>
    </>);
  };
  const M = METRIQUES.find(m => m[0] === metrique);
  const avecDecret = lignes.some(l => Object.values(l.par).some(v => v?.decret != null));

  return (
    <div className="space-y-4">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 sans-impression">
        <div className="segments flex-none" role="group" aria-label="Exercice">
          {d.annees.map(a => (
            <button key={a} type="button" aria-pressed={a === A} onClick={() => setAnnee(a)}
              className={`whitespace-nowrap ${a === A ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{a}</button>))}
        </div>
        <button type="button" className="bouton ml-auto inline-flex items-center gap-1.5 whitespace-nowrap" onClick={() => { setEssai(0); setD(null); setTour(t => t + 1); }}
          title="Refaire le calcul avec les dernières données"><IconRefresh size={15} />Recalculer</button>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <TuileEtat etat="fort" valeur={n0(tot?.etudiants)} libelle={`étudiants de l’ASBL (${Number(A) - 1}-${A})`}
          precision={`HELB ${n0(helb?.etudiants)} finançables · IIP ${n0(iip?.etudiants)} inscrits`}
          aide="HELB : étudiants finançables du document « ratio par département ». IIP : inscrits de Lucie (chiffres clés). L’année académique qui finit dans l’exercice." />
        <TuileEtat etat="neutre" valeur={eur(tot?.charges)} libelle={`charges de l’ASBL (${A})`} precision={`produits ${eur(tot?.produits)} · résultat ${eur(tot?.resultat)}`}
          aide="Les comptes réalisés de l’exercice, tels que la synthèse des budgets et comptes de l’ASBL les porte." />
        <TuileEtat etat="neutre" valeur={eur(cpe(tot))} libelle="coût complet par étudiant"
          precision={`HELB ${eur(cpe(helb))} · IIP ${eur(cpe(iip))}`}
          aide="Coût complet = charges des comptes + enseignants de l’IIP payés par la Fédération (convention), hors des comptes. ÷ étudiants." />
        <TuileEtat etat="neutre" valeur={n1(par(tot?.etudiants, tot?.etp))} libelle="étudiants par ETP enseignant"
          precision={`HELB ${n1(par(helb?.etudiants, helb?.etp))} · IIP ${n1(par(iip?.etudiants, iip?.etp))}`}
          aide="HELB : ETP du document « ratio par département ». IIP : ETP des attributions de Lucie (enseignants IIP, coordinations comprises)." />
      </div>

      {d.inscrits_helb && <InscritsHelb x={d.inscrits_helb} />}

      <div className="carte overflow-hidden">
        <EnteteCarte titre={`Les financements, poste par poste — exercice ${A}`}
          sous={`Comptes : ${d.fichier || 'synthèse de l’ASBL'} · étudiants et ETP de ${Number(A) - 1}-${A}`}>
          <BulleAide titre="Comment c’est calculé" droite>
            <p><b>Charges, produits, résultat</b> : les comptes réalisés de l’exercice (synthèse des budgets et comptes de l’ASBL), tels quels.</p>
            <p><b>Étudiants et ETP</b> : l’année académique qui finit dans l’exercice. HELB : étudiants finançables et ETP par département, et par cursus quand la HELB les publie. IIP : les inscrits de référence (Gestion → Population : la direction, corrigés dans Lucie), à défaut ceux de Lucie ; ETP des attributions de Lucie.</p>
            <p><b>Attention</b> : un étudiant finançable de la HELB est à peu près un temps plein ; un inscrit de l’IIP, un adulte qui suit souvent une partie du programme. Le coût par étudiant de l’IIP est donc un coût par inscrit.</p>
            <p><b>Enseignants</b> : HELB = ETP × {eur(d.prix_etp_helb)} (coût moyen d’un ETP statutaire du COR) — une estimation, déjà comprise dans les charges. IIP (FWB) = coût des enseignants payés par la Fédération, au prix de la convention — hors des comptes.</p>
            <p><b>Coût complet</b> = charges + enseignants payés par la Fédération.</p>
            <p><b>*</b> MUCE estimée par indexation : pour 2023, 2024 et 2025, la valeur réelle n’est pas connue ; elle est placée sur la pente régulière entre 2022 (3 837,18 €) et 2026 (4 562 €).</p>
            <p><b>Selon le décret</b> : la HELB répartit son allocation dans les comptes au même montant par étudiant (« un étudiant vaut un étudiant »). Le décret du 9 septembre 1996 (art. 17) finance chaque cursus en UCE : étudiants comptés, en moyenne sur les trois années académiques précédentes, × MUCE × la pondération du groupe du cursus. Calculé pour les cursus dont la pondération est réglée (en bas de page). L’écart se lit face aux produits des comptes.</p>
          </BulleAide>
        </EnteteCarte>
        <Tableau className="!border-0 !rounded-none" dense>
          <TableauEntete>
            <Th>Poste</Th><Th align="droite">Étudiants</Th><Th align="droite">ETP ens.</Th><Th align="droite">Étud. / ETP</Th>
            <Th align="droite">Charges</Th><Th align="droite">Produits</Th>{avecDecret && <Th align="droite">Selon le décret</Th>}<Th align="droite">Résultat</Th>
            <Th align="droite">Enseignants</Th><Th align="droite">Coût complet</Th><Th align="droite">Coût / étud.</Th><Th align="droite">Produits / étud.</Th>
          </TableauEntete>
          <tbody>
            {visibles.map(l => {
              const v = l.par[A];
              if (l.bloc === 'ASBL') return <TrTotal key={l.cle}><Td>{l.libelle}</Td>{cellules(v, true)}</TrTotal>;
              return (
                <Fragment key={l.cle}>
                  <Tr className={l.niveau === 0 ? 'font-semibold' : ''}><Td>{nomLigne(l)}</Td>{cellules(v, l.niveau === 0)}</Tr>
                </Fragment>);
            })}
          </tbody>
        </Tableau>
        <p className="text-mention text-slate-500 px-3 py-2 m-0">
          ≈ : estimation (ETP × coût moyen du COR). FWB : payé par la Fédération, hors des comptes de l’ASBL.
          {lignes.find(l => l.cle === 'IIP|autres')?.par[A]?.sections?.length ? ` « Autres formations » : ${lignes.find(l => l.cle === 'IIP|autres').par[A].sections.join(', ')}.` : ''}
        </p>
      </div>

      <div className="carte overflow-hidden">
        <EnteteCarte titre="L’évolution, exercice par exercice">
          <div className="segments flex-none sans-impression" role="radiogroup" aria-label="Mesure">
            {METRIQUES.map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={metrique === k} onClick={() => setMetrique(k)}
                className={`whitespace-nowrap ${metrique === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>))}
          </div>
        </EnteteCarte>
        <Tableau className="!border-0 !rounded-none" dense>
          <TableauEntete>
            <Th>{M[1]}</Th>{d.annees.map(a => <Th key={a} align="droite">{a}</Th>)}
          </TableauEntete>
          <tbody>
            {visibles.map(l => {
              const cels = d.annees.map(a => <Td key={a} align="droite">{M[3](M[2](l.par[a]))}</Td>);
              return l.bloc === 'ASBL'
                ? <TrTotal key={l.cle}><Td>{l.libelle}</Td>{cels}</TrTotal>
                : <Tr key={l.cle} className={l.niveau === 0 ? 'font-semibold' : ''}><Td>{nomLigne(l)}</Td>{cels}</Tr>;
            })}
          </tbody>
        </Tableau>
      </div>
      <Ponderations d={d} onFait={() => { setEssai(0); setD(null); setTour(t => t + 1); }} />
    </div>);
}

/* LA PONDÉRATION DU DÉCRET, CURSUS PAR CURSUS (3.5.512, Charles : « chaque cursus, son groupe »). Seule celle de TIM (1,5, paramédical)
   est connue d'office ; la direction règle les autres. Un cursus sans pondération n'est pas calculé. */
function Ponderations({ d, onFait }) {
  const [ouvert, setOuvert] = useState(false);
  const [val, setVal] = useState(() => Object.fromEntries(Object.entries(d.ponderations || {}).map(([k, v]) => [k, String(v).replace('.', ',')])));
  const [msg, setMsg] = useState(null);
  const enregistrer = async () => {
    setMsg(null);
    const r = await fetch('/api/pilotage/financements/ponderations', { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ponderations: val }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error || `Erreur ${r.status}`);
    onFait();
  };
  return (
    <div className="carte overflow-hidden sans-impression">
      <EnteteCarte titre="La pondération du décret, cursus par cursus" sous="Le groupe de chaque cursus de la HELB fixe sa pondération (TIM : 1,5, paramédical). Vide : pas calculé.">
        <button type="button" className="bouton" onClick={() => setOuvert(o => !o)}>{ouvert ? 'Fermer' : 'Régler'}</button>
      </EnteteCarte>
      {ouvert && (
        <div className="p-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(d.cursus_helb || []).map(c => (
              <label key={c} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate" title={c}>{c}</span>
                <input className="controle !h-8 w-20 text-right" inputMode="decimal" placeholder="—" value={val[c] ?? ''}
                  onChange={e => setVal(x => ({ ...x, [c]: e.target.value }))} />
              </label>))}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="bouton bouton-fort" onClick={enregistrer}>Enregistrer et recalculer</button>
            {msg && <span className="text-second text-[var(--c-refuse)]">{msg}</span>}
          </div>
        </div>)}
    </div>);
}

/* LES INSCRITS DE LA HELB, PAR DÉPARTEMENT ET PAR CURSUS (3.5.571, Charles : « pour avoir de vrais chiffres des départements ») : le
   fichier des dossiers inscrits avec cohorte (Gestion → Les sources). Des DOSSIERS à une date, avec leur cohorte — débutants,
   intermédiaires, diplômants —, et à côté, pour repère, les étudiants comptés l'année d'avant (comparaison ETP de la HELB). */
function InscritsHelb({ x }) {
  const [ouverts, setOuverts] = useState([]);
  const coh = (o, k) => n0(o?.[k] || 0);
  const date = x.date ? x.date.split('-').reverse().join('/') : '';
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre={`Les inscrits de la HELB en ${x.annee || ''}, par département`}
        sous={`${n0(x.total)} dossiers inscrits au ${date} · ${n0(x.cohortes?.START)} débutants · TIM compté à l’IIP`} />
      <Tableau dense className="!border-0 !rounded-none">
        <TableauEntete><Th>Département et cursus</Th><Th align="droite">Dossiers inscrits</Th><Th align="droite">Débutants</Th><Th align="droite">Intermédiaires</Th>
          <Th align="droite">Diplômants</Th><Th align="droite">Part des débutants</Th><Th align="droite" title="Étudiants comptés par la HELB l’année d’avant (comparaison ETP) : un repère, pas la même mesure">Comptés {x.avant || ''}</Th></TableauEntete>
        <tbody>
          <TrTotal><Td>Toute la HELB</Td><Td align="droite">{n0(x.total)}</Td><Td align="droite">{coh(x.cohortes, 'START')}</Td><Td align="droite">{coh(x.cohortes, 'PROGRESS')}</Td>
            <Td align="droite">{coh(x.cohortes, 'END')}</Td><Td align="droite">{x.total ? `${Math.round(((x.cohortes?.START || 0) / x.total) * 100)} %` : '—'}</Td><Td align="droite">—</Td></TrTotal>
          {x.departements.map(D => {
            const ouvert = ouverts.includes(D.dept);
            return (<Fragment key={D.dept}>
              <Tr><Td><button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => setOuverts(o => (o.includes(D.dept) ? o.filter(y => y !== D.dept) : [...o, D.dept]))}>
                <IconChevronRight size={14} className={`text-slate-400 transition-transform sans-impression ${ouvert ? 'rotate-90' : ''}`} />{D.dept}</button></Td>
                <Td align="droite" className="font-semibold">{n0(D.inscrits)}</Td><Td align="droite">{coh(D.cohortes, 'START')}</Td><Td align="droite">{coh(D.cohortes, 'PROGRESS')}</Td>
                <Td align="droite">{coh(D.cohortes, 'END')}</Td><Td align="droite">{D.inscrits ? `${Math.round(((D.cohortes.START || 0) / D.inscrits) * 100)} %` : '—'}</Td>
                <Td align="droite">{D.comptes_avant != null ? n0(D.comptes_avant) : '—'}</Td></Tr>
              {ouvert && D.cursus.map(c => (
                <Tr key={c.cursus}><Td><span className="pl-6 text-slate-600" title={c.libelles.join(' · ')}>{c.cursus}{c.libelles.length > 1 ? ` (${c.libelles.length} intitulés)` : ''}</span></Td>
                  <Td align="droite">{n0(c.inscrits)}</Td><Td align="droite">{coh(c.cohortes, 'START')}</Td><Td align="droite">{coh(c.cohortes, 'PROGRESS')}</Td>
                  <Td align="droite">{coh(c.cohortes, 'END')}</Td><Td align="droite">{c.inscrits ? `${Math.round(((c.cohortes.START || 0) / c.inscrits) * 100)} %` : '—'}</Td>
                  <Td align="droite">{c.comptes_avant != null ? n1(c.comptes_avant) : '—'}</Td></Tr>))}
            </Fragment>);
          })}
        </tbody>
      </Tableau>
      {!x.detail && <p className="px-3 py-2 m-0 text-mention text-slate-500">Les cohortes par cursus manquent : déposer à nouveau le fichier dans Gestion → Les sources.</p>}
    </div>);
}

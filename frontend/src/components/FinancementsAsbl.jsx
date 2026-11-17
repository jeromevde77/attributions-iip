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

const METRIQUES = [
  ['etudiants', 'Étudiants', v => v?.etudiants, n0],
  ['charges', 'Charges', v => v?.charges, eur],
  ['produits', 'Produits', v => v?.produits, eur],
  ['resultat', 'Résultat', v => v?.resultat, eur],
  ['cout_etu', 'Coût complet / étudiant', v => par(v?.cout_complet, v?.etudiants), eur],
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
      {avecDecret && <Td align="droite" title={v?.decret_detail ? `Moyenne des étudiants comptés ${v.decret_detail.annees.map(([a, n]) => `${a} : ${n}`).join(', ')} = ${v.decret_detail.moyenne} × MUCE ${eur(v.decret_detail.muce)} × ${v.decret_detail.ponderation}` : undefined}>
        {v?.decret != null ? <>{eur(v.decret)}<span className={`block text-mention ${v.decret - (v.produits || 0) >= 0 ? 'text-[var(--c-reussi)]' : 'text-[var(--c-refuse)]'}`}>{v.decret - (v.produits || 0) >= 0 ? '+' : '−'}{eur(Math.abs(v.decret - (v.produits || 0)))} / comptes</span></> : '—'}</Td>}
      <Td align="droite" className={v?.resultat < 0 ? '!text-[var(--c-refuse)]' : ''}>{eur(v?.resultat)}</Td>
      <Td align="droite" title={v?.estime ? 'ETP × coût moyen d’un ETP statutaire du COR — estimation, déjà comprise dans les charges' : v?.federation ? 'Payés par la Fédération, hors des comptes de l’ASBL' : undefined}>
        {ens != null ? <>{v?.estime ? '≈ ' : ''}{eur(ens)}{v?.federation && <span className="text-mention text-slate-400"> FWB</span>}</> : '—'}</Td>
      <Td align="droite" className={fort ? 'font-semibold' : ''}>{eur(v?.cout_complet)}</Td>
      <Td align="droite">{eur(par(v?.cout_complet, v?.etudiants))}</Td>
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
        <TuileEtat etat="neutre" valeur={eur(par(tot?.cout_complet, tot?.etudiants))} libelle="coût complet par étudiant"
          precision={`HELB ${eur(par(helb?.cout_complet, helb?.etudiants))} · IIP ${eur(par(iip?.cout_complet, iip?.etudiants))}`}
          aide="Coût complet = charges des comptes + enseignants de l’IIP payés par la Fédération (convention), hors des comptes. ÷ étudiants." />
        <TuileEtat etat="neutre" valeur={n1(par(tot?.etudiants, tot?.etp))} libelle="étudiants par ETP enseignant"
          precision={`HELB ${n1(par(helb?.etudiants, helb?.etp))} · IIP ${n1(par(iip?.etudiants, iip?.etp))}`}
          aide="HELB : ETP du document « ratio par département ». IIP : ETP des attributions de Lucie (enseignants IIP, coordinations comprises)." />
      </div>

      <div className="carte overflow-hidden">
        <EnteteCarte titre={`Les financements, poste par poste — exercice ${A}`}
          sous={`Comptes : ${d.fichier || 'synthèse de l’ASBL'} · étudiants et ETP de ${Number(A) - 1}-${A}`}>
          <BulleAide titre="Comment c’est calculé" droite>
            <p><b>Charges, produits, résultat</b> : les comptes réalisés de l’exercice (synthèse des budgets et comptes de l’ASBL), tels quels.</p>
            <p><b>Étudiants et ETP</b> : l’année académique qui finit dans l’exercice. HELB : étudiants finançables et ETP par département, et par cursus quand la HELB les publie. IIP : inscrits et ETP de Lucie.</p>
            <p><b>Enseignants</b> : HELB = ETP × {eur(d.prix_etp_helb)} (coût moyen d’un ETP statutaire du COR) — une estimation, déjà comprise dans les charges. IIP (FWB) = coût des enseignants payés par la Fédération, au prix de la convention — hors des comptes.</p>
            <p><b>Coût complet</b> = charges + enseignants payés par la Fédération.</p>
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

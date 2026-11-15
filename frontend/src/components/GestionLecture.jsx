import { useEffect, useMemo, useRef, useState } from 'react';
import { IconPresentation, IconRefresh, IconMaximize, IconMinimize } from '@tabler/icons-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, LabelList, ReferenceLine, CartesianGrid, Legend } from 'recharts';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import IipHelbGestion from './IipHelbGestion.jsx';
import { couleursGraphique } from '../lib/couleurs.js';
import { EnteteCarte, Tableau, Th, Td, Tr, TrTotal, TuileEtat, PastilleEtat } from './ui.jsx';

/* LIRE ET COMPARER (3.5.447, Charles, 14 novembre 2026 — maquette validée : « choisir la manière de consulter : par établissement,
   par section avec toutes les données combinées, ou juste les résultats, ou les finances — modulable » ; « des référentiels : HELB,
   IIP, ASBL… positionner la section, voir ce qu'on peut améliorer ou non » ; « tout dans Lucie : on sélectionne, on présente »).
   Gestion → Vue d'ensemble. Une bande, trois choix — LIRE (l'établissement ou une section) · VOIR (tout, étudiants, réussite,
   finances) · COMPARER À (IIP, HELB, ASBL, l'année d'avant) — décide de tout ce que la page montre. Les chiffres : GET
   /api/pilotage/lecture (mêmes sources que les autres faces de Gestion). Couleurs des graphiques en hexadécimal (attributs SVG). */

const MEMO = 'lucie.gestionLecture';
const lire = () => { try { return JSON.parse(localStorage.getItem(MEMO) || '{}'); } catch { return {}; } };
const n0 = v => (v == null ? '—' : Math.round(v).toLocaleString('fr-BE'));
const n1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('fr-BE'));
/* LES COULEURS VIENNENT DE CONFIGURATION (3.5.454, Charles : « ce que tu as choisi ne correspond pas à ce qui se trouve dans
   Config ») : séries et états de Thèmes et couleurs, lus au moment de dessiner (recharts pose des attributs SVG). */
const palette = () => { const G = couleursGraphique(); return { ...G, serie: i => G.series[i % G.series.length] }; };

/* LES INDICATEURS : libellé, format, sens (1 = plus haut, mieux ; −1 = plus bas, mieux ; 0 = un profil, sans jugement), lentille. */
const IND = {
  inscrits: { l: 'Inscrits', f: n0, sens: 0, v: 'etu', aide: 'au 15/10 (référence de Population)' },
  croissance: { l: 'Croissance', f: v => (v == null ? '—' : `${v > 0 ? '+' : ''}${n0(v)} %`), sens: 1, v: 'etu', aide: 'sur un an' },
  femmes: { l: 'Femmes', f: v => (v == null ? '—' : `${n0(v)} %`), sens: 0, v: 'etu' },
  primo: { l: 'Primo-inscrits', f: v => (v == null ? '—' : `${n0(v)} %`), sens: 0, v: 'etu' },
  age: { l: 'Âge moyen', f: v => (v == null ? '—' : `${n0(v)} ans`), sens: 0, v: 'etu' },
  hors_ue: { l: 'Hors Union européenne', f: v => (v == null ? '—' : `${n0(v)} %`), sens: 0, v: 'etu', court: 'Hors UE' },
  bruxelles: { l: 'Domicile à Bruxelles', f: v => (v == null ? '—' : `${n0(v)} %`), sens: 0, v: 'etu', court: 'Bruxelles' },
  reussite_finale: { l: 'Réussite finale', f: v => (v == null ? '—' : `${n0(v)} %`), sens: 1, v: 'res', aide: 'unités réussies, après la seconde session' },
  reussite_s1: { l: 'Réussite en 1re session', f: v => (v == null ? '—' : `${n0(v)} %`), sens: 1, v: 'res', court: '1re session' },
  reussite_s2: { l: 'Ajournés qui réussissent en 2e', f: v => (v == null ? '—' : `${n0(v)} %`), sens: 1, v: 'res', court: '2e session' },
  etp: { l: 'ETP enseignant', f: n1, sens: 0, v: 'fin', aide: 'CT ÷ 800 + PP ÷ 1000' },
  taille_groupes: { l: 'Taille moyenne des groupes', f: n1, sens: 1, v: 'fin', aide: 'Σ inscriptions × périodes de l’UE ÷ périodes données', court: 'Groupes' },
  etc_etp: { l: 'Étudiants temps plein par ETP', f: n1, sens: 1, v: 'fin', aide: 'crédits ÷ 60, par ETP enseignant', court: 'ETC / ETP' },
  cout_etudiant: { l: 'Coût d’un étudiant', f: v => (v == null ? '—' : `${n0(v)} €`), sens: -1, v: 'fin', aide: 'coût complet ÷ inscrits', court: 'Coût / étudiant' },
  cout_etc: { l: 'Coût d’un étudiant temps plein', f: v => (v == null ? '—' : `${n0(v)} €`), sens: -1, v: 'fin', aide: 'coût complet ÷ (crédits ÷ 60) : comparable d’une section à l’autre', court: 'Coût / ETC' },
  cout_credit: { l: 'Coût par crédit', f: v => (v == null ? '—' : `${n0(v)} €`), sens: -1, v: 'fin', aide: 'coût complet ÷ crédits suivis', court: 'Coût / crédit' },
  cout_180: { l: 'Coût d’une formation de 180 crédits', f: v => (v == null ? '—' : `${n0(v)} €`), sens: -1, v: 'fin', aide: 'coût par crédit × 180', court: '180 crédits' },
  cout_periode: { l: 'Coût par période de la grille étudiant', f: v => (v == null ? '—' : `${(Math.round(v * 100) / 100).toLocaleString('fr-BE')} €`), sens: -1, v: 'fin', aide: 'coût complet ÷ (inscriptions × périodes étudiant de l’UE) — vaut aussi sans crédits', court: 'Coût / période' },
  recettes_etudiant: { l: 'Recettes par étudiant', f: v => (v == null ? '—' : `${n0(v)} €`), sens: 1, v: 'fin', aide: 'droits et frais', court: 'Recettes / étudiant' },
};
const COLONNES = {
  tout: ['inscrits', 'croissance', 'reussite_finale', 'reussite_s1', 'taille_groupes', 'cout_credit', 'cout_periode'],
  etu: ['inscrits', 'croissance', 'femmes', 'primo', 'age', 'hors_ue', 'bruxelles'],
  res: ['reussite_finale', 'reussite_s1', 'reussite_s2'],
  fin: ['etp', 'taille_groupes', 'etc_etp', 'cout_credit', 'cout_180', 'cout_periode', 'cout_etudiant', 'recettes_etudiant'],
};
const POSITION = {
  tout: ['reussite_finale', 'reussite_s1', 'croissance', 'taille_groupes', 'etc_etp', 'cout_credit', 'cout_periode', 'recettes_etudiant', 'primo', 'femmes'],
  etu: ['croissance', 'femmes', 'primo', 'age', 'hors_ue', 'bruxelles'],
  res: ['reussite_finale', 'reussite_s1', 'reussite_s2'],
  fin: ['taille_groupes', 'etc_etp', 'cout_credit', 'cout_180', 'cout_periode', 'recettes_etudiant', 'etp'],
};
const REFS = [['IIP', 'IIP'], ['ASBL', 'ASBL'], ['N1', 'Année d’avant']];
const LENTILLES = [['tout', 'Tout'], ['etu', 'Étudiants'], ['res', 'Réussite'], ['fin', 'Finances']];

function Segments({ valeur, options, onChange, label }) {
  return (
    <div className="segments flex-none" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={valeur === v} onClick={() => onChange(v)}
        className={`whitespace-nowrap ${valeur === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}
    </div>);
}
/* L'état d'un écart : la pastille du catalogue (réussi = mieux que la référence, surveiller = moins bien, neutre = un profil). */
const Verdict = ({ etat, children }) => <PastilleEtat etat={etat}>{children}</PastilleEtat>;

export default function GestionLecture({ annee: anneeProp, onPresenter, onSources }) {
  const memo = useMemo(lire, []);
  const annee = anneeProp || getAnnee();
  const [perim, setPerim] = useState(memo.perim || 'etab');
  const [section, setSection] = useState(memo.section || 'TIM');
  const [lentille, setLentille] = useState(memo.lentille || 'tout');
  const [ref, setRef] = useState(memo.ref === 'HELB' ? 'ASBL' : memo.ref || 'IIP');
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [tour, setTour] = useState(0);
  const [blocs, setBlocs] = useState(null);
  const racine = useRef(null);
  /* LE PLEIN ÉCRAN EST PLUS LÉGER (3.5.456, Charles : « quand on met plein écran, cela doit être plus light ») : la barre de choix et
     la ligne d'explication s'effacent ; un titre dit ce qu'on regarde ; de l'air autour ; une croix discrète pour sortir. */
  const [plein, setPlein] = useState(false);
  useEffect(() => {
    const f = () => setPlein(!!document.fullscreenElement && document.fullscreenElement === racine.current);
    document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  useEffect(() => { try { localStorage.setItem(MEMO, JSON.stringify({ perim, section, lentille, ref })); } catch { /* sans mémoire */ } }, [perim, section, lentille, ref]);
  useEffect(() => {
    let vivant = true; setErreur(null);
    fetch(`/api/pilotage/lecture?annee=${encodeURIComponent(annee)}${tour ? '&recalculer=1' : ''}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); if (vivant) setD(j); })
      .catch(e => vivant && setErreur(e.message));
    return () => { vivant = false; };
  }, [annee, tour]);
  useEffect(() => {
    if (perim !== 'section' || !d?.resultats_annee) { setBlocs(null); return undefined; }
    let vivant = true;
    fetch(`/api/stats-deliberation?annee=${d.resultats_annee}&section=${encodeURIComponent(section)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(j => vivant && setBlocs((j?.par_niveau || []).filter(x => /^BA\d$/.test(x.cle)).sort((a, b) => a.cle.localeCompare(b.cle))))
      .catch(() => vivant && setBlocs([]));
    return () => { vivant = false; };
  }, [perim, section, d?.resultats_annee]);

  const sections = d?.sections || [];
  const S = sections.find(x => x.section === section) || null;
  const nomRef = { IIP: 'l’IIP', ASBL: 'l’ASBL', N1: d?.prec ? d.prec.annee : 'l’année d’avant' }[ref];

  /* La référence d'un indicateur, pour une ligne (une section, ou l'établissement). */
  const refDe = (k, code) => {
    if (ref === 'IIP') return code === 'IIP' ? null : d?.iip?.[k] ?? null;
    if (ref === 'N1') return code === 'IIP' ? d?.prec?.iip?.[k] ?? null : d?.prec?.sections?.find(x => x.section === code)?.[k] ?? null;
    if (ref === 'ASBL') {
      const A = d?.asbl || {};
      return { cout_etudiant: A.cout_etudiant, cout_credit: A.cout_credit, cout_180: A.cout_180, etc_etp: A.etc_etp, taille_groupes: A.taille_groupes,
        croissance: A.croissance, primo: A.primo, cout_etc: A.cout_etc, cout_periode: A.cout_periode, recettes_etudiant: A.recettes_etudiant, etp: null }[k] ?? null;
    }
    return null;
  };
  const valDe = (k, ligne) => ligne?.[k];
  const juger = (k, v, r) => {
    if (v == null || r == null) return { etat: 'indisponible', mot: 'à calculer', ecart: null };
    const e = v - r, s = IND[k].sens;
    if (!s) return { etat: 'neutre', mot: `${e > 0 ? '+' : ''}${IND[k].f(e).replace(/ (%|€|ans)$/, '')}${/%$/.test(IND[k].f(v)) ? ' pts' : ''}`, ecart: e };
    const bien = s > 0 ? e >= 0 : e <= 0;
    return { etat: bien ? 'reussi' : 'surveiller', mot: s < 0 ? (bien ? 'moins cher' : 'plus cher') : (bien ? 'au-dessus' : 'en dessous'), ecart: e, bien };
  };

  const presenter = () => {
    if (perim === 'section' && onPresenter) { onPresenter(section); return; }
    if (document.fullscreenElement) document.exitFullscreen(); else racine.current?.requestFullscreen?.().catch(() => {});
  };

  /* CE QU'ON PEUT AMÉLIORER — OU NON : les écarts à la référence, les pires d'abord, les points forts ensuite. */
  const pistes = useMemo(() => {
    if (!S || !d) return [];
    const r = [];
    for (const k of POSITION[lentille]) {
      const v = valDe(k, S), rf = refDe(k, S.section), j = juger(k, v, rf);
      if (!IND[k].sens || j.ecart == null) continue;
      const ampleur = Math.abs(j.ecart) / Math.max(1, Math.abs(rf));
      if (ampleur < 0.03) continue;
      r.push({ k, bien: j.bien, ampleur, txt: `${IND[k].l} : ${IND[k].f(v)} contre ${IND[k].f(rf)} pour ${nomRef}.` });
    }
    if (lentille !== 'fin' && blocs?.length) {
      const pire = [...blocs].sort((a, b) => a.s1.taux_reussite - b.s1.taux_reussite)[0];
      if (pire && S.reussite_s1 != null && pire.s1.taux_reussite < S.reussite_s1 - 3) r.push({ k: 'bloc', bien: false, ampleur: 0.5, txt: `Le ${pire.cle} concentre l’échec de première session : ${n0(pire.s1.taux_reussite)} % (${n0(pire.final.taux_reussite)} % au final). C’est là que l’accompagnement porte le plus.` });
    }
    return [...r.filter(x => !x.bien).sort((a, b) => b.ampleur - a.ampleur), ...r.filter(x => x.bien).sort((a, b) => b.ampleur - a.ampleur)];
  }, [S, d, lentille, ref, blocs]);   // eslint-disable-line react-hooks/exhaustive-deps

  const barre = (
    <div className="flex flex-nowrap items-center gap-x-4 overflow-x-auto pb-1">
      <div className="flex items-center gap-2 flex-none"><span className="text-mention font-bold uppercase tracking-wider text-slate-500">Lire</span>
        <Segments label="Lire" valeur={perim} onChange={setPerim} options={[['etab', 'L’établissement'], ['section', 'Une section']]} />
        {perim === 'section' && (
          <select className="controle flex-none" value={section} onChange={e => setSection(e.target.value)} aria-label="Section">
            {sections.map(x => <option key={x.section} value={x.section}>{x.section}</option>)}
          </select>)}
      </div>
      <div className="flex items-center gap-2 flex-none"><span className="text-mention font-bold uppercase tracking-wider text-slate-500">Voir</span>
        <Segments label="Voir" valeur={lentille} onChange={setLentille} options={LENTILLES} /></div>
      <div className="flex items-center gap-2 flex-none"><span className="text-mention font-bold uppercase tracking-wider text-slate-500">Comparer à</span>
        <Segments label="Comparer à" valeur={ref} onChange={setRef} options={REFS} /></div>
      <button type="button" className="bouton ml-auto inline-flex items-center flex-none" onClick={() => setTour(t => t + 1)} title="Recalculer avec les dernières données" aria-label="Recalculer"><IconRefresh size={15} /></button>
      <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5 whitespace-nowrap flex-none" onClick={presenter} disabled={!d}>
        {perim === 'section' ? <IconPresentation size={15} /> : <IconMaximize size={15} />}Présenter</button>
    </div>);

  const noteRef = ref === 'ASBL' ? (d?.asbl
    ? `L’ASBL = les deux établissements réunis : ${n0(d.asbl.etudiants)} étudiants (${n0(d.asbl.etudiants_iip)} à l’IIP), ${n0(d.asbl.cout_total)} € — charges de l’ASBL en ${d.asbl.exercice} et coût de l’IIP calculé par Lucie —, ${n1(d.asbl.etp)} ETP d’enseignement. Taille des groupes : on suppose qu’un étudiant de la HELB suit autant de périodes qu’un étudiant temps plein de l’IIP (${n0(d.asbl.periodes_par_etudiant)} par an). Croissance de la HELB d’après ses étudiants comptés (${d.asbl.croissance_annees || '—'}) ; primo-inscrits = ses débutants ; recettes = chiffre d’affaires des comptes ${d.asbl.exercice_comptes || ''}. Réussite, sexe, âge, nationalité, domicile : absents des fichiers de la HELB.`
    : 'L’ASBL n’a pas encore de source : déposez ses comptes dans Vue d’ensemble → Les sources.')
    : ref === 'N1' ? `Chaque section comparée à elle-même en ${d?.prec?.annee || 'l’année d’avant'}.` : 'L’ensemble de l’IIP, toutes sections.';

  if (erreur && !d) return <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>;
  return (
    <div ref={racine} className={plein ? 'space-y-5 overflow-auto' : 'space-y-3'} style={{ background: 'var(--page-fond, #F4F6F9)', ...(plein ? { height: '100vh', padding: '2.5rem clamp(1.5rem, 5vw, 5rem)' } : {}) }}>
      {plein ? (
        <div className="flex items-end gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-mention font-bold uppercase tracking-wider text-slate-500">{d?.annee} · {LENTILLES.find(l => l[0] === lentille)?.[1]} · comparé à {nomRef}</div>
            <h1 className="titre-ecran m-0 mt-1">{perim === 'etab' ? 'L’Institut, section par section' : section}</h1>
          </div>
          <button type="button" className="bouton inline-flex items-center flex-none" onClick={presenter} aria-label="Quitter le plein écran" title="Quitter le plein écran"><IconMinimize size={15} /></button>
        </div>) : barre}
      {erreur && <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>}
      {!d ? <p className="text-second text-slate-400">Calcul des indicateurs de toutes les sections… (quelques secondes la première fois)</p> : (<>
        {!plein && <p className="text-mention text-slate-500 m-0">Année {d.annee} · résultats {d.resultats_annee || '—'} · comparé à {nomRef} — {noteRef}{' '}
          {onSources && <button type="button" className="text-iip-blue underline" onClick={onSources}>Les sources</button>}</p>}
        {perim === 'etab' ? <Etablissement d={d} lentille={lentille} refDe={refDe} valDe={valDe} juger={juger} nomRef={nomRef}
          ouvrir={s => { setSection(s); setPerim('section'); }} />
          : !S ? <p className="text-second text-slate-500">Section introuvable pour {d.annee}.</p>
            : <>
              <Section S={S} d={d} compta={d.compta?.sections?.[S.section]} comptaSource={d.compta} lentille={lentille} refDe={refDe} valDe={valDe} juger={juger} nomRef={nomRef} blocs={blocs} pistes={pistes} />
              {/* UNE CODIPLOMATION PORTE SES DONNÉES IIP / HELB (3.5.461, Charles : « dans le choix du TIM, ces données en plus ; si co-dip,
                  alors données complémentaires ») : la page IIP et HELB, années au choix, pour la section lue — direction seule (la route l'est). */}
              {(d.codiplomation || []).includes(String(S.section).toLowerCase()) && ['admin', 'directeur', 'directeur_adjoint'].includes(getUser()?.role)
                && (lentille === 'tout' || lentille === 'fin') && <>
                  <h2 className="titre-ecran !mt-6 !mb-0">La codiplomation IIP / HELB, année par année</h2>
                  <p className="text-mention text-slate-500 m-0">{S.section} est organisée avec la HELB : charge, coût, part de chacun, coordinations et enseignants sur les années choisies.</p>
                  <IipHelbGestion sectionFixe={S.section} />
                </>}
            </>}
      </>)}
    </div>);
}

/* ------------------------------------------------------------------------------------------------ L'ÉTABLISSEMENT */
function Etablissement({ d, lentille, refDe, valDe, juger, nomRef, ouvrir }) {
  const P = palette();
  const I = d.iip, Pr = d.prec?.iip;
  const cols = COLONNES[lentille];
  const k0 = { tout: 'reussite_finale', etu: 'inscrits', res: 'reussite_finale', fin: 'cout_periode' }[lentille];
  const triees = [...d.sections].sort((a, b) => (b.inscrits || 0) - (a.inscrits || 0));
  const barres = triees.filter(s => s[k0] != null && true).map(s => ({ c: s.section, v: Math.round(s[k0]) }));
  return (<>
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
      <TuileEtat etat="fort" valeur={n0(I.inscrits)} libelle="inscrits au 15/10" precision={I.inscrits_prec ? `${n0(I.inscrits_prec)} l’an dernier · ${IND.croissance.f(I.croissance)}` : ''} />
      <TuileEtat etat="reussi" valeur={IND.reussite_finale.f(I.reussite_finale)} libelle={`réussite finale ${d.resultats_annee || ''}`} precision={`${IND.reussite_s1.f(I.reussite_s1)} en 1re session${Pr?.reussite_finale != null ? ` · ${IND.reussite_finale.f(Pr.reussite_finale)} l’année d’avant` : ''}`} />
      <TuileEtat etat="disponible" valeur={IND.cout_credit.f(I.cout_credit)} libelle="coût par crédit" precision={`${IND.cout_180.f(I.cout_180)} pour 180 crédits · ${IND.cout_periode.f(I.cout_periode)} par période · ASBL ${IND.cout_credit.f(d.asbl?.cout_credit)}`} />
      <TuileEtat valeur={n1(I.taille_groupes)} libelle="étudiants par groupe, en moyenne" precision={`${n1(I.etc_etp)} étudiants temps plein par ETP · ASBL : ${n1(d.asbl?.etc_etp)}`} />
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="carte overflow-hidden">
        <EnteteCarte titre="Les étudiants par section" sous={`${n0(I.inscrits)} au 15/10`} />
        <div className="p-3 flex items-center gap-4">
          <PieChart width={220} height={220}>
            <Pie data={triees} dataKey="inscrits" nameKey="section" innerRadius={62} outerRadius={100} paddingAngle={1} isAnimationActive={false} stroke="#fff" strokeWidth={2}>
              {triees.map((s, i) => <Cell key={s.section} fill={P.serie(i)} />)}
            </Pie>
          </PieChart>
          <div className="flex-1 min-w-0 space-y-1.5">
            {triees.map((s, i) => (
              <button key={s.section} type="button" onClick={() => ouvrir(s.section)} className="w-full flex items-center gap-2 text-second hover:text-iip-blue text-left">
                <span className="w-3 h-3 rounded-sm flex-none" style={{ background: P.serie(i) }} />
                <span className="flex-1 truncate">{s.section}</span><b className="tabular-nums">{n0(s.inscrits)}</b>
                <span className="w-11 text-right text-slate-500 tabular-nums">{Math.round((s.inscrits / Math.max(1, I.inscrits)) * 100)} %</span>
              </button>))}
          </div>
        </div>
      </section>
      <section className="carte overflow-hidden">
        <EnteteCarte titre={IND[k0].l} sous={`par section · le trait : ${nomRef}`} />
        <div className="p-3 overflow-x-auto">
          <BarChart width={520} height={Math.max(180, barres.length * 30 + 20)} data={barres} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 4 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={P.grille} />
            <XAxis type="number" hide domain={[0, 'dataMax']} />
            <YAxis type="category" dataKey="c" width={110} tick={{ fontSize: 12, fill: P.second }} axisLine={false} tickLine={false} interval={0} />
            {refDe(k0, 'X') != null && <ReferenceLine x={refDe(k0, 'X')} stroke={P.reference} strokeDasharray="4 3" />}
            <Bar dataKey="v" fill={P.principal} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {barres.map(b => { const j = juger(k0, b.v, refDe(k0, b.c)); return <Cell key={b.c} fill={j.bien === undefined ? P.principal : j.bien ? P.reussi : P.attente} />; })}
              <LabelList dataKey="v" position="right" formatter={v => IND[k0].f(v)} style={{ fontSize: 12, fontWeight: 700, fill: P.texte }} />
            </Bar>
          </BarChart>
        </div>
      </section>
    </div>
    <section className="carte overflow-hidden">
      <EnteteCarte titre="Les sections côte à côte" sous={`chaque case comparée à ${nomRef} — vert au-dessus, ocre en dessous ; un clic ouvre la section`} />
      <div className="overflow-x-auto">
        <Tableau className="!border-0 !rounded-none">
          <thead><tr className="tab-entete"><Th>Section</Th>{cols.map(k => <Th key={k} align="droite" title={IND[k].aide}>{IND[k].court || IND[k].l}</Th>)}</tr></thead>
          <tbody>
            <TrTotal><Td>Institut (IIP)</Td>{cols.map(k => <Td key={k} align="droite">{IND[k].f(I[k])}</Td>)}</TrTotal>
            {triees.map(s => (
              <Tr key={s.section} className="cursor-pointer" onClick={() => ouvrir(s.section)}>
                <Td><span className="font-semibold text-iip-blue">{s.section}</span></Td>
                {cols.map(k => {
                  const v = valDe(k, s), j = juger(k, v, refDe(k, s.section));
                  return <Td key={k} align="droite">{IND[k].sens && j.bien !== undefined
                    ? <PastilleEtat etat={j.etat}>{IND[k].f(v)}</PastilleEtat>
                    : <span className="tabular-nums">{IND[k].f(v)}</span>}</Td>;
                })}
              </Tr>))}
          </tbody>
        </Tableau>
      </div>
    </section>
  </>);
}

/* ------------------------------------------------------------------------------------------------ UNE SECTION */
function Section({ S, d, compta, comptaSource, lentille, refDe, valDe, juger, nomRef, blocs, pistes }) {
  const P = palette();
  const lignes = POSITION[lentille].map(k => {
    const v = valDe(k, S), r = refDe(k, S.section), j = juger(k, v, r);
    const tous = [v, r, ...d.sections.map(x => x[k])].filter(x => x != null && Number.isFinite(x));
    const max = Math.max(1, ...tous.filter(x => !(k === 'etc_etp' && x > 200)), v || 0, r || 0) * 1.08;
    return { k, v, r, j, x: v == null ? null : Math.min(100, (v / max) * 100), rx: r == null ? null : Math.min(100, (r / max) * 100) };
  });
  const voir = l => lentille === 'tout' || lentille === l;
  const reel = (compta?.helb || []).some(x => x.non_impute != null);
  return (<>
    <section className="carte overflow-hidden">
      <EnteteCarte titre={`Où se situe ${S.section} ?`} sous={`comparée à ${nomRef} · le point = ${S.section} (vert : mieux que la référence, orange : à surveiller), le trait = la référence`} />
      <div className="px-4 pb-2">
        {lignes.map(({ k, v, r, j, x, rx }) => (
          <div key={k} className="grid items-center gap-3 py-2.5 border-b border-slate-100 last:border-0" style={{ gridTemplateColumns: 'minmax(150px,1.3fr) minmax(120px,3fr) 84px 110px 110px' }}>
            <div className="min-w-0"><div className="text-sm font-semibold text-slate-800">{IND[k].l}</div>{IND[k].aide && <div className="text-mention text-slate-500 truncate">{IND[k].aide}</div>}</div>
            <div className="relative h-6" aria-hidden="true">
              <div className="absolute inset-x-0 top-[11px] h-[3px] rounded bg-slate-200" />
              {rx != null && <div className="absolute top-[3px] w-[3px] h-[19px] bg-slate-500" style={{ left: `${rx}%` }} />}
              {x != null && rx != null && j.bien !== undefined && <div className="absolute top-[11px] h-[3px] rounded" style={{ left: `${Math.min(x, rx)}%`, width: `${Math.abs(x - rx)}%`, background: j.bien ? P.reussi : P.attente, opacity: .55 }} />}
              {x != null && (() => { const c = j.bien === undefined ? P.principal : j.bien ? P.reussi : P.attente; return <div className="absolute top-[4px] w-4 h-4 -ml-2 rounded-full border-[3px] border-white" style={{ left: `${x}%`, background: c, boxShadow: `0 0 0 1px ${c}` }} />; })()}
            </div>
            <div className="text-right text-sm font-bold tabular-nums text-iip-blue">{IND[k].f(v)}</div>
            <div className="text-right text-second text-slate-500 tabular-nums">{r == null ? '—' : IND[k].f(r)}</div>
            <div className="text-right"><Verdict etat={j.etat}>{j.mot}</Verdict></div>
          </div>))}
      </div>
    </section>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 items-stretch">
      {voir('etu') && (
        <section className="carte overflow-hidden h-full">
          <EnteteCarte titre="Les étudiants" sous={`${n0(S.inscrits)} au 15/10 · ${IND.croissance.f(S.croissance)} sur un an`} />
          <div className="p-4 flex items-center gap-4">
            <PieChart width={130} height={130}>
              <Pie data={[{ n: 'Femmes', v: S.femmes || 0 }, { n: 'Hommes', v: 100 - (S.femmes || 0) }]} dataKey="v" innerRadius={40} outerRadius={60} startAngle={90} endAngle={-270} isAnimationActive={false} stroke="#fff" strokeWidth={2}>
                <Cell fill={P.serie(0)} /><Cell fill={P.serie(1)} />
              </Pie>
            </PieChart>
            <div className="space-y-1.5 text-sm">
              <div><b style={{ color: P.serie(0) }}>{IND.femmes.f(S.femmes)}</b> femmes · <b style={{ color: P.serie(1) }}>{S.femmes == null ? '—' : `${n0(100 - S.femmes)} %`}</b> hommes</div>
              <div><b>{IND.age.f(S.age)}</b> en moyenne</div>
              <div><b>{IND.primo.f(S.primo)}</b> de primo-inscrits</div>
              <div><b>{IND.hors_ue.f(S.hors_ue)}</b> hors Union européenne</div>
              <div><b>{IND.bruxelles.f(S.bruxelles)}</b> à Bruxelles</div>
            </div>
          </div>
        </section>)}
      {voir('res') && (
        <section className="carte overflow-hidden h-full">
          <EnteteCarte titre="La réussite par bloc" sous={`${d.resultats_annee || ''} · 1re session, puis au final`} />
          <div className="p-4">
            {!blocs ? <p className="text-second text-slate-400">Chargement…</p> : !blocs.length ? <p className="text-second text-slate-500">Pas de décisions par bloc pour cette section.</p> : (
              <BarChart width={330} height={195} data={blocs.map(b => ({ c: b.cle, s1: Math.round(b.s1.taux_reussite), f: Math.round(b.final.taux_reussite) }))} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="c" tick={{ fontSize: 12, fill: P.second }} axisLine={{ stroke: P.grille }} tickLine={false} />
                <YAxis hide domain={[0, 100]} />
                <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="s1" name="1re session" fill={P.attente} radius={[4, 4, 0, 0]} isAnimationActive={false}><LabelList dataKey="s1" position="top" formatter={v => `${v} %`} style={{ fontSize: 11, fontWeight: 700, fill: P.texte }} /></Bar>
                <Bar dataKey="f" name="Au final" fill={P.reussi} radius={[4, 4, 0, 0]} isAnimationActive={false}><LabelList dataKey="f" position="top" formatter={v => `${v} %`} style={{ fontSize: 11, fontWeight: 700, fill: P.texte }} /></Bar>
              </BarChart>)}
          </div>
        </section>)}
      {voir('fin') && (
        <section className="carte overflow-hidden h-full">
          <EnteteCarte titre="Les finances" sous={`${d.annee} · coût complet, CT ÷ 800 + PP ÷ 1000`} />
          <div className="p-4 grid grid-cols-2 gap-3">
            {['cout_credit', 'cout_periode', 'taille_groupes', 'recettes_etudiant'].map(k => <TuileEtat key={k} valeur={IND[k].f(S[k])} libelle={IND[k].l} />)}
          </div>
        </section>)}
    </div>

    {voir('fin') && compta && (
      <section className="carte overflow-hidden">
        <EnteteCarte titre="La comptabilité de l’ASBL pour cette section" sous={reel ? 'résultat réel : le coût des enseignants HELB que les comptes imputent à d’autres codes analytiques est ajouté (ETP de Lucie, coordinations comprises, au prix du titre ; 8/12 de l’année scolaire qui finit, 4/12 de celle qui commence)' : `charges, produits et résultat, exercice par exercice · ${comptaSource?.fichier || ''}`} />
        <div className="overflow-x-auto">
          <Tableau className="!border-0 !rounded-none">
            <thead><tr className="tab-entete"><Th>Exercice</Th><Th>Côté</Th><Th align="droite">Charges</Th><Th align="droite">Produits</Th><Th align="droite">Résultat comptable</Th>
              {reel && <><Th align="droite">Enseignants HELB imputés ailleurs</Th><Th align="droite">Résultat réel</Th></>}</tr></thead>
            <tbody>
              {[...new Set([...(compta.helb || []), ...(compta.iip || [])].map(x => x.annee))].sort().reverse().flatMap(a => [['HELB', compta.helb], ['IIP', compta.iip]].map(([cote, L]) => {
                const v = (L || []).find(x => x.annee === a); if (!v) return null;
                return (<Tr key={a + cote}><Td>{a} <span className="text-slate-400">· {v.estimation ? (v.scolaire ? 'année scolaire, estimation de Lucie' : 'estimation de Lucie') : v.nature}</span></Td>
                  <Td>{v.estimation ? <span title={`Produits : allocation HELB ${n0(v.allocation)} €${v.allocation_reelle ? ` (en partie au niveau réel des subsides de ${v.subsides_de})` : ''} + droits et frais des inscrits ${n0(v.droits)} €. Charges : enseignants HELB ${n0(v.salaires)} € (${n1(v.etp_helb)} ETP, coordinations comprises, prix du titre) + matériel ${n0(v.materiel)} €. Frais généraux et leur quote-part : neutres, laissés de côté.`}>HELB + IIP</span> : cote}</Td><Td align="droite">{n0(v.charges)} €</Td><Td align="droite">{n0(v.produits)} €</Td>
                  <Td align="droite">{v.estimation ? <span className="text-slate-400">—</span> : reel ? <span className="text-slate-500">{v.resultat >= 0 ? '+' : ''}{n0(v.resultat)} €</span> : <b style={{ color: v.resultat >= 0 ? 'var(--c-reussi)' : 'var(--c-attente)' }}>{v.resultat >= 0 ? '+' : ''}{n0(v.resultat)} €</b>}</Td>
                  {reel && <><Td align="droite">{v.estimation ? <span className="text-slate-400">compris</span> : v.non_impute != null ? <span title={`${n1(v.etp_helb)} ETP HELB (coordinations comprises), ${n0(v.enseignants_helb)} € au prix du titre ; déjà imputés à la section : ${v.deja_impute == null ? 'inconnu' : `${n0(v.deja_impute)} €`}`}>−{n0(v.non_impute)} €</span> : '—'}</Td>
                    <Td align="droite">{(() => {
                      const coul = r => (r >= 0 ? 'var(--c-reussi)' : 'var(--c-attente)'), f = r => `${r >= 0 ? '+' : ''}${n0(r)} €`;
                      // Une estimation montre les deux lectures du financement de la HELB (3.5.469) : UCE et subsides réels.
                      if (v.estimation && v.resultat_subsides != null) return (<span className="inline-flex flex-col items-end leading-tight">
                        <b style={{ color: coul(v.resultat_subsides) }} title={`Financement HELB au niveau des subsides réels : ${n0(v.par_inscrit)} € par inscrit, soit ${n0(v.allocation_subsides)} €`}>{f(v.resultat_subsides)} <span className="font-normal text-mention text-slate-500">subsides réels</span></b>
                        <b style={{ color: coul(v.resultat_reel) }} title={`Financement HELB aux UCE : ${n0(v.allocation)} €`}>{f(v.resultat_reel)} <span className="font-normal text-mention text-slate-500">UCE</span></b></span>);
                      const r = v.resultat_reel ?? v.resultat; return <b style={{ color: coul(r) }}>{f(r)}</b>; })()}</Td></>}</Tr>);
              }))}
            </tbody>
          </Tableau>
        </div>
      </section>)}
    <section className="carte overflow-hidden">
      <EnteteCarte titre="Ce qu’on peut améliorer — ou non" sous={`déduit des écarts à ${nomRef}`} />
      <div className="px-4 py-1">
        {!pistes.length ? <p className="text-second text-slate-500 py-2">Rien à signaler face à cette référence, ou pas de référence pour ces indicateurs.</p> : pistes.map(p => (
          <div key={p.k} className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
            <Verdict etat={p.bien ? 'reussi' : 'surveiller'}>{p.bien ? 'Point fort' : 'À améliorer'}</Verdict>
            <div className="text-sm leading-snug text-slate-800">{p.txt}</div>
          </div>))}
      </div>
    </section>
  </>);
}

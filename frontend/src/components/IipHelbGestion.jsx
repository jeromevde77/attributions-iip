import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSend, IconX, IconEye, IconRefresh, IconChevronRight } from '@tabler/icons-react';
import { BarChart, Bar, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Legend } from 'recharts';
import { authHeaders, getAnnee } from '../lib/api.js';
import { couleursGraphique } from '../lib/couleurs.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { EnteteCarte, TuileEtat, Tableau, Th, Td } from './ui.jsx';
import { Anneau } from './graphiques.jsx';
import ChargeParBloc from './ChargeParBloc.jsx';
import { Tuile } from './statsUi.jsx';

/* L'IIP ET LA HELB, UNE PAGE DE GESTION NATIVE (3.5.432, Charles, 14 novembre 2026 : « le rapport est lent ; je le voudrais en natif,
   comme le rapport finances ou les nationalités ; beaucoup plus précis avec les coordinations ; tout en accès direct »). Gestion →
   Dotation → IIP et HELB. Les chiffres viennent de GET /api/pilotage/iip-helb (lib/rapportIipHelb.js, ceux de la pièce, calcul gardé
   dix minutes) ; l'écran les dessine. « Imprimer ou envoyer » compose la pièce avec les MÊMES réglages (gardés dans `lucie.iipHelb`).
   Couleurs en hexadécimal : attributs SVG des graphiques, où var() ne s'évalue pas (CLAUDE.md §6). */

/* Les couleurs de l'IIP, de la HELB et de « ce qui est perçu » sont celles de Configuration → Thèmes et couleurs (3.5.454) : lues au
   moment de dessiner (`lireCouleurs`, appelé par la page), avec celles de la maison en repli tant que rien n'est chargé. */
let IIP = '#19537E', HELB = '#C2408A', PERCU = '#3E7D5E';
function lireCouleurs() { const G = couleursGraphique(); IIP = G.iip || IIP; HELB = G.helb || HELB; PERCU = G.reussi || PERCU; }
const MEMO = 'lucie.iipHelb';
const lire = () => { try { return JSON.parse(localStorage.getItem(MEMO) || '{}'); } catch { return {}; } };
const n0 = v => Math.round(v || 0).toLocaleString('fr-BE');
const n2 = v => (v || 0).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n1 = v => (v || 0).toLocaleString('fr-BE', { maximumFractionDigits: 1 });
const eur = v => `${n0(v)} €`;
const keur = v => `${n0((v || 0) / 1000)} k€`;
const pc = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const court = a => `${String(a).slice(2, 4)}-${String(a).slice(7, 9)}`;
const FORMES = [['empile', 'Empilé'], ['cote', 'Côte à côte'], ['parts', '%'], ['courbe', 'Courbe']];
/* POUR LA HELB (3.5.433) : la formule de helbAnnee (lib/rapportIipHelb.js), recopiée ici pour l'écran — qui change l'une change l'autre. */
const PARAM_HELB = { part: 50, muce: 3837.18, ponderation: 1.5, cmbp: 90000, autres: 0, fonctionnement: 20.8, moyenne: 17, debut: 2026, lissage: 3 };
const LIB_HELB = [['part', '% des inscrits comptés', '%'], ['muce', 'Unité de charge (MUCE)', '€'], ['ponderation', 'Pondération santé', '×'],
  ['lissage', 'Lissage (décret : 3)', 'ans'], ['cmbp', 'Coût moyen brut d’un ETP', '€'], ['autres', 'Autres services', '% des salaires'], ['fonctionnement', 'Fonctionnement', '% de l’allocation'], ['moyenne', 'Moyenne HELB', 'étu./ETP']];
const decalee = (a, k) => `${Number(a.slice(0, 4)) - k}-${Number(a.slice(5, 9)) - k}`;
/* LE PRIX D'UN ETP DE LA HELB (3.5.463) : au titre (théorie = maître-assistant, TP = maître de formation pratique), à la moyenne du COR,
   ou au montant réglé — la formule de salairesHelb (lib/rapportIipHelb.js), recopiée : qui change l'une change l'autre. */
function salairesHelb(y, P, avecCoord) {
  if (y.salaires_imposes != null) return y.salaires_imposes;   // la mesure choisie fait foi (3.5.496)
  const c = avecCoord ? (y.cetp_helb || 0) : 0, etp = (y.ens_helb || 0) + c;
  if (P.prix === 'moyenne' && P.prix_moyen) return etp * P.prix_moyen;
  if (P.prix === 'titres' && P.prix_ma) {
    // (Recopie de lib/rapportIipHelb.js.) Au titre : un maître-assistant au prix du MA (cours et coordinations) ; tout le reste au prix du MFP. Un invité (statut EXP), au
    // prix moyen d'un invité du COR quand il est connu (3.5.506), quel que soit son titre.
    const cma = avecCoord ? Math.min(c, y.cetp_helb_ma || 0) : 0;
    const inv = P.prix_invite ? (y.etp_helb_inv || 0) : 0, maInv = P.prix_invite ? (y.etp_helb_ma_inv || 0) : 0;
    const ma = (y.etp_helb_ma || 0) - maInv + cma, autres = Math.max(0, (y.ens_helb || 0) - (y.etp_helb_ma || 0) - (inv - maInv)) + (c - cma);
    return ma * P.prix_ma + autres * (P.prix_mfp || P.prix_ma) + inv * (P.prix_invite || 0);
  }
  return etp * P.cmbp;
}
function helbAnnee(y, P, avecCoord, inscritsDe, materiel) {
  const comptes = y.inscrits * P.part / 100;
  // Le lissage du décret (art. 17) : la formule de baseDecret (lib/rapportIipHelb.js), recopiée — qui change l'une change l'autre.
  const n = Math.max(1, Math.round(P.lissage || 3)), deb = Number(y.annee.slice(0, 4));
  const civile = C => { let s = 0; for (let k = 2; k < 2 + n; k++) s += (inscritsDe(`${C - k}-${C - k + 1}`) || 0) * P.part / 100; return s / n; };
  const base = civile(deb) * 4 / 12 + civile(deb + 1) * 8 / 12;
  const allocation = base * P.muce * P.ponderation, droits = y.tiers ? 0 : (y.recettes || 0), recettes = allocation + droits;
  const etp = y.ens_helb + (avecCoord ? y.cetp_helb : 0), salaires = salairesHelb(y, P, avecCoord), autres = salaires * P.autres / 100;
  const fonct = P.mode_fonct === 'forfait' ? allocation * P.fonctionnement / 100 : (materiel || 0);
  const cout = salaires + autres + fonct;
  return { comptes, base, allocation, droits, recettes, etp, salaires, autres, fonct, cout, resultat: recettes - cout, parEtp: etp ? comptes / etp : null };
}
const COULEUR_DEPT = { 'Santé': '#5DADE2', 'COMAV': '#9F7AEA', 'Technoeco': '#1F2937', 'Social': '#DC2626', 'IIP': '#F9B619' };
/* UN VOLET QUI SE REPLIE (3.5.442, Charles : « des volets à refermer là où cela rend la lecture plus fine »). */
function Volet({ titre, ouvert = false, droite = null, children }) {
  const [o, setO] = useState(ouvert);
  // À l'impression, tout volet est ouvert (3.5.483) : une page imprimée ne se déplie pas.
  const rac = useRef(null);
  useEffect(() => { if (rac.current?.closest('.zone-impression')) setO(true); }, []);
  return (
    <div ref={rac} className="border-t border-slate-100 pt-2 mt-2">
      <button type="button" onClick={() => setO(x => !x)} aria-expanded={o} className="w-full flex items-center gap-1.5 text-second font-semibold text-slate-700 hover:text-iip-blue">
        <IconChevronRight size={14} className={`transition-transform ${o ? 'rotate-90' : ''}`} /> <span className="flex-1 text-left">{titre}</span>{droite}
      </button>
      {o && <div className="mt-2">{children}</div>}
    </div>);
}
const CARTES = [['blocs_ue', 'Détail par bloc et par UE'], ['coord_helb', 'Postes de coordination HELB'], ['charge', 'La charge'], ['charge_ens', 'Charge : enseignement seul'], ['charge_coord', 'Charge : avec coordinations'], ['charge_admin', 'Charge : avec cadre administratif'], ['couts', 'Le coût de la section'], ['etudiant', 'Le coût d’un étudiant'], ['recettes', 'Ce qu’un étudiant rapporte'], ['helb', 'Pour la HELB'], ['vrio', 'La lecture VRIO'], ['comparaison', 'Les cursus de la HE'],
  ['fonctions', 'Les coordinations'], ['admin', 'Le cadre administratif'], ['statuts', 'Chargés de cours et experts'], ['blocs', 'Par bloc'], ['natures', 'Par nature'], ['enseignants', 'Par enseignant']];

/* LA VALEUR DANS UN BADGE DE LA COULEUR DE SA SÉRIE (3.5.443, Charles : « que les points soient connectés à la légende — le montant,
   les périodes — dans un badge de la même couleur »). Un rectangle arrondi, texte blanc, posé au-dessus du point ou de la barre, à
   droite d'une barre horizontale, au centre d'un segment empilé (cerné de blanc pour s'en détacher). */
function badge(couleur, fmt = v => v, place = 'haut', rangDe = null) {
  return function Badge({ x, y, width = 0, height = 0, value, index }) {
    if (value == null || value === '' || !Number.isFinite(Number(value)) || !Number(value)) return null;
    const t = String(fmt(value)), w = t.length * 6 + 10, h = 16;
    let cx = x + width / 2, cy = y - h / 2 - 4;
    if (place === 'centre') cy = y + height / 2;
    if (place === 'droite') { cx = x + width + w / 2 + 4; cy = y + height / 2; }
    /* LISIBLE SUR UNE COURBE (3.5.444, Charles : « veiller à ce que cela soit lisible ») : à un même point, la série la plus haute garde
       son badge au-dessus, la suivante le prend en dessous, une troisième se décale sur le côté — jamais deux badges l'un sur l'autre. */
    if (rangDe) {
      const r = rangDe(index);
      if (r === 1) cy = y + h / 2 + 6;
      else if (r >= 2) { cy = y + h / 2 + 6; cx = x + w + 6; }
    }
    return (
      <g>
        <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={8} fill={couleur} stroke={place === 'centre' ? '#fff' : 'none'} strokeWidth={1.5} />
        <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">{t}</text>
      </g>);
  };
}

/** Le rang d'une série à un point : 0 = la plus haute (à valeur égale, l'ordre des séries). */
function rangA(data, cles, k, i) {
  const row = data[i] || {};
  const v = cle => (Number.isFinite(Number(row[cle])) && row[cle] !== null ? Number(row[cle]) : -Infinity);
  return cles.filter(c => c !== k && (v(c) > v(k) || (v(c) === v(k) && cles.indexOf(c) < cles.indexOf(k)))).length;
}

/** Un graphique de deux séries sur les années, dans la forme choisie. */
function Graphe({ donnees, forme, fmt, series = [['iip', 'IIP', IIP], ['helb', 'HELB', HELB]] }) {
  const pct = forme === 'parts';
  const d = pct ? donnees.map(x => { const t = series.reduce((s, [k]) => s + (x[k] || 0), 0) || 1; return { ...x, ...Object.fromEntries(series.map(([k]) => [k, ((x[k] || 0) / t) * 100])) }; }) : donnees;
  const f = pct ? v => `${Math.round(v)} %` : fmt;
  const bulle = <Tooltip formatter={(v, n) => [f(v), n]} contentStyle={{ fontSize: 12 }} />;
  if (forme === 'courbe') {
    return (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={d} margin={{ top: 30, right: 28, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis dataKey="lib" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={f} width={56} />{bulle}<Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map(([k, n, c]) => <Line key={k} dataKey={k} name={n} stroke={c} strokeWidth={2.5} dot={{ r: 4 }}><LabelList dataKey={k} content={badge(c, f, 'haut', i => rangA(d, series.map(x => x[0]), k, i))} /></Line>)}
        </LineChart>
      </ResponsiveContainer>);
  }
  const empile = forme === 'empile' || pct;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={d} margin={{ top: 30, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
        <XAxis dataKey="lib" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={f} width={56} domain={pct ? [0, 100] : undefined} />{bulle}<Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map(([k, n, c], i) => (
          <Bar key={k} dataKey={k} name={n} fill={c} stackId={empile ? 'a' : undefined} radius={empile && i < series.length - 1 ? 0 : [3, 3, 0, 0]}>
            <LabelList dataKey={k} content={badge(c, f, empile ? 'centre' : 'haut')} />
          </Bar>))}
      </BarChart>
    </ResponsiveContainer>);
}

/** Une carte : son titre, le choix de la forme, et la croix qui la masque. */
function Carte({ titre, sous, forme, onForme, onMasquer, children, large, plat }) {
  return (
    <section className={`carte overflow-hidden ${large ? 'lg:col-span-2' : ''}`}>
      <EnteteCarte titre={titre} sous={sous}>
        {onForme && (
          <div className="segments flex-none sans-impression" role="radiogroup" aria-label="Forme du graphique">
            {FORMES.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={forme === v} onClick={() => onForme(v)}
              className={`!px-2 text-mention whitespace-nowrap ${forme === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}
          </div>)}
        <button type="button" className="text-slate-400 hover:text-slate-700 sans-impression" onClick={onMasquer} aria-label={`Masquer « ${titre} »`} title="Masquer cette partie"><IconX size={15} /></button>
      </EnteteCarte>
      {/* `plat` : une carte qui n'est qu'un tableau — il va d'un bord à l'autre, sans cadre dans le cadre (3.5.452). */}
      <div className={plat ? '' : 'p-3'}>{children}</div>
    </section>);
}

/* LES CHIFFRES DE LA PAGE, SELON LES RÉGLAGES (3.5.446) : une fonction pure, lue par la page et par la présentation d'une section
   (PresentationSection.jsx) — un calcul, deux lecteurs. */
export function chiffresIipHelb(d, reglages = {}) {
  const mes = { charge: 'etp', cout: 'convention', admin: 'oui', direction: 'oui', coord: 'oui', unite_helb: 'periodes', prix_helb: 'titres', ...(reglages.mesures || {}) };
  // Une seule bascule (3.5.499) : convention ou coûts réels ; les anciens réglages s'y ramènent.
  mes.cout = mes.cout === 'titres' || mes.cout === 'reel' ? 'reel' : 'convention';
  const PH = { ...PARAM_HELB, ...Object.fromEntries(Object.entries(reglages.helb || {}).filter(([, v]) => v !== '' && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) };
  const inscritsDe = a => { const r = Number(reglages.inscrits?.[a]); return r > 0 ? r : (d?.inscrits_annees?.[a] || 0); };
  PH.mode_fonct = reglages.helb?.mode_fonct === 'forfait' ? 'forfait' : 'reel';
  PH.prix = mes.prix_helb; PH.prix_ma = d?.prix_helb?.ma; PH.prix_mfp = d?.prix_helb?.mfp; PH.prix_moyen = d?.prix_helb?.moyen; PH.prix_invite = d?.prix_helb?.invite || null;
  // Les chiffres de chaque année selon les mesures choisies — les mêmes formules que la pièce (lib/rapportIipHelb.js).
  const Y = (d?.Y || []).map(y0 => {
    // Les inscrits retenus par la direction, année par année (3.5.434) — la pièce applique les mêmes.
    const ret = Number(reglages.inscrits?.[y0.annee]);
    const y1 = ret > 0 ? { ...y0, inscrits: Math.round(ret), inscrits_lucie: y0.inscrits, recettes: y0.inscrits ? y0.recettes * Math.round(ret) / y0.inscrits : y0.recettes } : y0;
    // La direction au choix (3.5.493) : le secrétariat reste toujours compté.
    const y = mes.direction === 'non' && y1.admin?.part_secr != null && !y1.admin.reprise ? { ...y1, admin: { ...y1.admin, part: y1.admin.part_secr } } : y1;
    const avecC = mes.coord === 'oui', avecA = mes.admin === 'oui', reel = mes.cout === 'reel';
    const cI = avecC ? y.cetp_iip : 0, cH = avecC ? y.cetp_helb : 0;
    /* CONVENTION OU COÛTS RÉELS, POUR TOUTE LA SECTION (3.5.499, Charles : « si convention, MA = CC = CT et MFP = CC = PP, tout en
       périodes ; si pas, on convertit tout en argent »). L'IIP reste au prix de la circulaire dans les deux lectures. La HELB : en
       convention, MA = CT (÷ 800, prix CT), le reste = PP (÷ 1 000, prix PP) ; en coûts réels, heures ÷ 480 / 750 et le COR. */
    const ensH = y.ens_helb;   // le serveur l'a déjà compté selon la lecture (paramètre `cout` de la route)
    const pcI = y.per_iip + cI * 800, pcH = reel ? y.per_helb + cH * 800 : (y.per_helb_conv ?? y.per_helb) + (avecC ? (y.cper_helb_conv ?? cH * 800) : 0);
    const adm = avecA ? y.admin.part : 0;
    const coutI = y.cout_iip + (avecC ? y.coord_iip : 0) + adm;
    /* UN SEUL CALCUL POUR LA HELB (3.5.496, Charles : « soit tout en convention, soit tout en calcul MA / MFP, avec un bouton de
       bascule ; sinon ce n'est pas correct ») : le coût HELB de la section (cours + coordinations) ET les salaires du résultat de la
       HELB (`salaires_imposes`, lus par helbAnnee) viennent de la même mesure — convention, coût réel MA / MFP, ou coût moyen brut. */
    const coursH = reel ? salairesHelb(y, PH, false) : (y.cout_helb_conv ?? y.cout_helb);
    const coutH = reel ? salairesHelb(y, PH, avecC) : coursH + (avecC ? (y.coord_helb_conv ?? y.coord_helb) : 0);
    return { ...y, ens_helb: ensH, salaires_imposes: coutH, coursH, coordH: coutH - coursH, lib: court(y.annee), etpI: y.ens_iip + cI, etpH: ensH + cH, pcI, pcH, coutI, coutH,
      chI: mes.charge === 'periodes' ? pcI : y.ens_iip + cI, chH: mes.charge === 'periodes' ? pcH : ensH + cH };
  });
  const materielDe = a => { const v = reglages.materiel?.[a]; return v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : (d?.materiel_defaut?.[a]?.montant ?? 0); };
  // L'aide à la réussite (UE 95), 100 % IIP : son coût × la part de la section (réglable ; à défaut, sa part dans les inscrits de l'IIP).
  const part95 = reglages.helb?.part95 !== undefined && reglages.helb.part95 !== '' && Number.isFinite(Number(reglages.helb.part95)) ? Number(reglages.helb.part95) / 100 : (d?.admin_reference?.ratio || 0);
  const u95 = y => (y.ue95?.cout || 0) * part95;
  const HY = Y.map(y => ({ y, h: helbAnnee(y, PH, mes.coord === 'oui', inscritsDe, materielDe(y.annee)) }));
  return { mes, Y, PH, inscritsDe, materielDe, part95, u95, HY };
}

export default function IipHelbGestion({ sectionFixe = null } = {}) {
  lireCouleurs();
  const memo = useMemo(lire, []);
  const [sections, setSections] = useState([]);
  const [sectionChoisie, setSection] = useState(memo.section || 'TIM');
  /* DANS LIRE ET COMPARER (3.5.461, Charles : « si co-dip, alors données complémentaires ») : la section est celle de la lecture. */
  const section = sectionFixe || sectionChoisie;
  const [annees, setAnnees] = useState(memo.annees || null);
  const [reglages, setReglages] = useState(memo.reglages || {});
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  /* À L'IMPRESSION (3.5.483, Charles, PDF du 16 novembre : « un peu déçu de la présentation quand on imprime ») : les réglages de l'écran
     cèdent la place à une ligne qui les dit ; les années de coordinations sont dépliées. */
  const racine = useRef(null);
  const [enImpression, setEnImpression] = useState(false);
  useEffect(() => { if (racine.current?.closest('.zone-impression')) setEnImpression(true); }, []);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l =>
      setSections((Array.isArray(l) ? l : []).map(s => s.code || s).filter(Boolean))).catch(() => {});
  }, []);
  useEffect(() => { if (sectionFixe) setAnnees(null); }, [sectionFixe]);
  /* LA MOYENNE DE L'ASBL (3.5.497, Charles : « je veux la moyenne ASBL ») : étudiants des deux établissements par ETP enseignant, lue de
     Lire et comparer (GET /api/pilotage/lecture, ASBL) pour la dernière année choisie. */
  const [asbl, setAsbl] = useState(null);
  const derniere = (annees || d?.annees || []).slice(-1)[0];
  useEffect(() => {
    if (!derniere) return;
    fetch(`/api/pilotage/lecture?annee=${encodeURIComponent(derniere)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(j => setAsbl(j?.asbl || null)).catch(() => {});
  }, [derniere]);
  useEffect(() => { try { localStorage.setItem(MEMO, JSON.stringify({ section, annees, reglages })); } catch { /* sans mémoire */ } }, [section, annees, reglages]);
  const [tour, setTour] = useState(0);
  const [deplies, setDeplies] = useState(['Santé', 'IIP']);
  const [coordOuv, setCoordOuv] = useState([]);   // les années de coordinations dépliées   // les départements dépliés dans la comparaison   // « Recalculer » : refait le calcul côté serveur
  useEffect(() => {
    let vivant = true; setEnCours(true); setErreur(null);
    fetch(`/api/pilotage/iip-helb?section=${encodeURIComponent(section)}${annees?.length ? `&annees=${encodeURIComponent(annees.join(','))}` : ''}${tour ? '&recalculer=1' : ''}&unite_helb=${reglages.mesures?.unite_helb === 'heures' ? 'heures' : 'periodes'}&cout=${['reel', 'titres'].includes(reglages.mesures?.cout) ? 'reel' : 'convention'}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); if (vivant) { setD(j); if (!annees) setAnnees(j.annees); } })
      .catch(e => vivant && setErreur(e.message)).finally(() => vivant && setEnCours(false));
    return () => { vivant = false; };
  }, [section, annees, tour, reglages.mesures?.unite_helb, reglages.mesures?.cout]);   // eslint-disable-line react-hooks/exhaustive-deps

  const maj = (k, v) => setReglages(r => ({ ...r, [k]: v }));
  const majMes = (k, v) => maj('mesures', { ...(reglages.mesures || {}), [k]: v });
  const forme = (k, def) => reglages.graphes?.[k] || def;
  const majForme = k => v => maj('graphes', { ...(reglages.graphes || {}), [k]: v });
  const masques = reglages.masques || [];
  const masquer = k => () => maj('masques', [...masques, k]);
  const vu = k => !masques.includes(k);

  const { mes, Y, PH, inscritsDe, materielDe, part95, u95, HY } = useMemo(() => chiffresIipHelb(d, reglages), [d, reglages]);

  const imprimer = async () => {
    const r = await fetch('/api/rapports/iip-helb-annees/document', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ section, annees, reglages }) });
    const j = await r.json(); if (!r.ok) { setErreur(j.error || 'La pièce ne s’est pas composée.'); return; }
    ouvrirApercu({ html: j.html, titre: j.titre, sousTitre: (annees || []).join(' · '), nomFichier: j.nom });
  };

  const aN = Y[Y.length - 1], a0 = Y[0];
  const fCh = mes.charge === 'periodes' ? n0 : n2, uCh = mes.charge === 'periodes' ? 'périodes' : 'ETP';
  const totI = Y.reduce((t, y) => t + y.coutI, 0), totH = Y.reduce((t, y) => t + y.coutH, 0);
  const methode = mes.cout === 'reel' ? 'coûts réels (IIP à la circulaire, HELB au COR)' : 'convention (MA = CT, MFP = PP)';
  // Le coût HELB d'une coordination, selon la lecture (3.5.499) : convention = titre (MA ÷ 800 au prix CT, sinon ÷ 1 000 au prix PP) ; réel = le COR.
  const prixEtpHelb = t => (PH.prix === 'moyenne' ? PH.prix_moyen : PH.prix === 'fixe' ? PH.cmbp : t === 'MA' ? PH.prix_ma : (PH.prix_mfp || PH.prix_ma)) || 0;
  const coutCoordH = c => (mes.cout === 'reel' ? (c.etp_helb || 0) * prixEtpHelb(c.titre_helb) : (c.cout_helb_conv ?? c.cout_helb ?? 0));
  const segm = (k, opts) => (
    <div className="segments flex-none" role="radiogroup">
      {opts.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={mes[k] === v} onClick={() => majMes(k, v)}
        className={`whitespace-nowrap ${mes[k] === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}
    </div>);

  return (
    <div ref={racine} className="space-y-3">
      {enImpression && d?.Y?.length > 0 && (
        <p className="text-second text-slate-600 m-0">{section} · {(annees?.length ? annees : d.annees || []).map(court).join(', ')} · charge en {mes.charge === 'periodes' ? 'périodes' : 'ETP'} ·
          {' '}{methode} · {mes.coord === 'oui' ? 'avec' : 'sans'} coordinations · {mes.admin === 'oui' ? 'avec' : 'sans'} cadre administratif
          {Object.keys(reglages.inscrits || {}).filter(a => reglages.inscrits[a]).length ? ` · inscrits retenus : ${Object.entries(reglages.inscrits).filter(([, v]) => v).map(([a, v]) => `${court(a)} ${v}`).join(', ')}` : ''}</p>)}
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 sans-impression">
        {!sectionFixe && <select className="controle flex-none" value={section} onChange={e => { setSection(e.target.value); setAnnees(null); }} aria-label="Section">
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>}
        <div className="segments flex-none" role="group" aria-label="Années">
          {(d?.toutes || []).map(a => { const on = annees?.includes(a); return (
            <button key={a} type="button" aria-pressed={!!on} onClick={() => setAnnees(x => (on ? (x || []).filter(y => y !== a) : [...(x || []), a].sort()))}
              className={`whitespace-nowrap ${on ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{court(a)}</button>); })}
        </div>
        {segm('charge', [['etp', 'ETP'], ['periodes', 'Périodes']])}
        {segm('cout', [['convention', 'Convention (MA = CT, MFP = PP)'], ['reel', 'Coûts réels']])}
        {segm('coord', [['oui', 'Avec coordinations'], ['non', 'Sans']])}
        {segm('admin', [['oui', 'Avec cadre admin.'], ['non', 'Sans']])}
        {mes.admin === 'oui' && segm('direction', [['oui', 'Avec direction'], ['non', 'Secrétariat seul']])}
        <button type="button" className="bouton ml-auto inline-flex items-center gap-1.5 whitespace-nowrap" disabled={enCours} onClick={() => setTour(t => t + 1)}
          title="Refaire le calcul avec les dernières données encodées"><IconRefresh size={15} />{enCours ? 'Calcul…' : 'Recalculer'}</button>
        <button type="button" className="bouton bouton-sortir inline-flex items-center gap-1.5 whitespace-nowrap" onClick={imprimer} disabled={!Y.length}>
          <IconSend size={15} />Imprimer</button>
      </div>
      {masques.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-second text-slate-500 sans-impression">
          <IconEye size={14} /> Parties masquées :
          {masques.map(k => <button key={k} type="button" className="bouton !py-0.5 !px-2 text-mention" onClick={() => maj('masques', masques.filter(x => x !== k))}>{CARTES.find(c => c[0] === k)?.[1] || k}</button>)}
        </div>)}
      {erreur && <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>}
      {d?.Y?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-second text-slate-600 sans-impression">
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
        {(() => {
          /* DES CARTES DE MÊME TAILLE, LES INDICATEURS CLÉS EN ÉVIDENCE (3.5.445, Charles : « des cartes de même taille, un peu de
             couleurs, mettre en évidence les indicateurs clés »). Quatre clés, grandes, liseré et chiffre de couleur ; six autres, petites,
             dans une grille régulière. */
          const h = HY[HY.length - 1].h;
          const timH = d.comparaison?.cursus?.find(c => c.tim);
          const moy = (() => { let e = 0, t = 0; for (const o of Object.values(d.comparaison?.departements?.departements || {})) { const v = o[d.comparaison.annee]; if (v) { e += v[0]; t += v[1]; } } return t ? e / t : d.comparaison?.moyennes?.['Moyenne HELB']; })();
          const apport = HY.reduce((t, x) => t + (x.y.admin.part || 0) + u95(x.y), 0);
          return (<>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
              <TuileEtat etat={h.resultat >= 0 ? 'reussi' : 'corriger'} aide={`Ce que la section rapporte − ce qu’elle coûte à la HELB et à l’ASBL, pour ${aN.annee}.\nRapporte = allocation de la HELB + droits et frais des inscrits.\nAllocation (décret du 9 septembre 1996, art. 17) : pour chaque année civile, la moyenne des étudiants comptés (${PH.part} % des inscrits) des 3 années académiques précédentes × ${PH.muce} € (unité de charge) × ${PH.ponderation} (pondération) ; une année académique reçoit 4/12 de l’année civile où elle commence et 8/12 de la suivante.\nDroits et frais : au barème de Lucie, sans plafond ni exonération.\nCoûte = enseignants HELB (lignes HELB : heures = périodes × 50/60 ÷ 480 pour la théorie d’un maître-assistant, ÷ 750 sinon ; coordinations comprises) × ${PH.prix === 'titres' ? 'le prix de leur titre au COR' : PH.prix === 'moyenne' ? 'la moyenne du COR' : 'le montant réglé'} + autres services + matériel.\nLes enseignants de l’IIP, payés par la Fédération, n’y sont pas.`} valeur={`${h.resultat >= 0 ? '+' : '−'}${eur(Math.abs(h.resultat))}`} libelle={`Résultat HELB et ASBL ${aN.annee}`}
                precision={`rapporte ${keur(h.recettes)}, coûte ${keur(h.cout)}`} />
              <TuileEtat etat="reussi" aide={'Chiffres de la HELB, non recalculés par Lucie : étudiants comptés de la section ÷ ETP enseignants que la HELB y déclare (comparaison ETP de la HELB, année la plus récente). La moyenne de la HELB = somme des étudiants finançables des quatre départements ÷ somme de leurs ETP (document « ratio par département »).\nLa moyenne de l’ASBL = (inscrits de la HELB + inscrits de l’IIP) ÷ (ETP des cursus de la HELB + ETP enseignants de l’IIP), comme dans Lire et comparer.'} valeur={timH ? `${n0(timH.ratio)} étudiants` : '—'} libelle="par ETP enseignant (HELB)" precision={[moy ? `moyenne de la HELB : ${n1(moy)}` : '', asbl?.etu_etp ? `de l’ASBL : ${n1(asbl.etu_etp)}` : ''].filter(Boolean).join(' · ')} />
              <TuileEtat etat="fort" aide={`(Coût IIP + coût HELB) ÷ inscrits de ${aN.annee}.\nLecture : ${methode}.\nCoût IIP = périodes IIP × prix de la circulaire des conventions${mes.coord === 'oui' ? ' + coordinations IIP (ETP × 800 × période CT)' : ''}${mes.admin === 'oui' ? ' + part du cadre administratif (direction et secrétariat × part de la section dans les inscrits de l’IIP)' : ''}.\nCoût HELB = ${mes.cout === 'reel' ? 'ETP HELB (heures ÷ 480 pour la théorie d’un MA, ÷ 750 sinon) × prix de leur titre au COR' : 'périodes HELB × prix de la circulaire : un MA comme un CT, tout autre comme un PP'}${mes.coord === 'oui' ? ' + coordinations HELB (selon le titre)' : ''}.\nIIP et HELB : les montants détaillés dans « Le coût de la section ».`} valeur={aN.inscrits ? eur((aN.coutI + aN.coutH) / aN.inscrits) : '—'} libelle={`Coût d’un étudiant ${aN.annee}`}
                precision={aN.inscrits ? `IIP ${eur(aN.coutI / aN.inscrits)} · HELB ${eur(aN.coutH / aN.inscrits)}` : ''} />
              <TuileEtat etat="disponible" aide={'Ce que l’IIP apporte sans que la HELB le paie, sur les années choisies : la part de la section dans le cadre administratif de l’IIP (direction et secrétariat × part de la section dans les inscrits ; structure de la dernière année encodée reprise pour les années sans fonctions) + l’aide à la réussite (UE 95 : périodes × période CT du supérieur × part de la section). Payé sur les dotations de l’IIP : aucun coût supplémentaire.'} valeur={eur(apport)} libelle={`Apport de l’IIP sur ${Y.length} an(s)`} precision="0 € de coût supplémentaire : ses propres dotations" />
            </div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 items-stretch">
              <TuileEtat taille="compacte" etat="fort" aide={'IIP : périodes attribuées, CT ÷ 800 + PP ÷ 1 000 (règle de la dotation). HELB : heures = périodes × 50/60, ÷ 480 pour la théorie d’un maître-assistant, ÷ 750 pour le reste, ÷ 1 400 pour une coordination (titre lu dans la colonne « HELB » de la ligne d’attribution). Coordinations : leur ETP, si elles ne figurent pas déjà dans les attributions. Lignes en congé exclues.'} valeur={`${fCh(aN.chI + aN.chH)} ${uCh}`} libelle={`Charge ${aN.annee}`} precision={mes.coord === 'oui' ? 'enseignement et coordinations' : 'enseignement'} />
              <TuileEtat taille="compacte" aide={'Charge de l’IIP ÷ charge totale (IIP + HELB), même unité que la tuile « Charge ». Enseignants : ceux qui ont au moins une ligne IIP cette année.'} valeur={pc(aN.chI, aN.chI + aN.chH)} libelle="Part de l’IIP" precision={`${fCh(aN.chI)} ${uCh} · ${aN.profs_iip} enseignants`} />
              <TuileEtat taille="compacte" aide={'Charge de la HELB ÷ charge totale (IIP + HELB). Enseignants : ceux qui ont au moins une ligne HELB cette année.'} valeur={pc(aN.chH, aN.chI + aN.chH)} libelle="Part de la HELB" precision={`${fCh(aN.chH)} ${uCh} · ${aN.profs_helb} enseignants`} />
              <TuileEtat taille="compacte" aide={'Somme, sur les années choisies, du coût IIP et du coût HELB de chaque année (méthode choisie : coût convention ou coût moyen brut), coordinations et cadre administratif selon les réglages.'} valeur={eur(totI + totH)} libelle={`Coût sur ${Y.length} an(s)`} precision={`HELB ${pc(totH, totI + totH)} · ${methode}`} />
              <TuileEtat taille="compacte" aide={'Droits et frais au barème de Lucie, unité par unité : périodes de l’UE × tarif du droit d’inscription + périodes étudiant × frais par période, × inscrits de l’UE ; plus le forfait et les frais fixes par étudiant. Sans plafond ni exonération. ÷ inscrits. Une section dont un tiers perçoit les droits ne rapporte rien à l’ASBL.'} valeur={aN.inscrits && !aN.tiers ? eur(aN.recettes / aN.inscrits) : '—'} libelle="Ce qu’il rapporte" precision="par étudiant, droits et frais (ASBL)" />
              <TuileEtat taille="compacte" aide={'Les inscrits de la section selon les chiffres clés de Lucie (un étudiant compte une fois), ou le chiffre retenu par la direction dans « Inscrits retenus » quand il est saisi.'} valeur={n0(aN.inscrits)} libelle={`Inscrits ${aN.annee}`} precision={Y.length > 1 ? `${n0(a0.inscrits)} en ${a0.annee}` : ''} />
            </div>
          </>);
        })()}

        <div className="grid gap-3 lg:grid-cols-2">
          {vu('charge') && <Carte titre={`La charge, en ${uCh}`} sous={mes.coord === 'oui' ? 'Enseignement et coordinations' : 'Enseignement seul'}
            forme={forme('charge', 'empile')} onForme={majForme('charge')} onMasquer={masquer('charge')}>
            <Graphe forme={forme('charge', 'empile')} fmt={fCh} donnees={Y.map(y => ({ lib: y.lib, iip: y.chI, helb: y.chH }))} />
          </Carte>}
          {/* LE DÉTAIL PAR BLOC ET LES COORDINATIONS HELB (3.5.491, Charles : « intégrer la partie bloc 1, 2 et 3, ainsi que la partie
              coordination — dans la gestion, important ») : la dernière année choisie, comme le rapport de charge ETP d'une section. */}
          {(vu('blocs_ue') || vu('coord_helb')) && Y.length > 0 && (
            <ChargeParBloc annee={Y[Y.length - 1].annee} section={section} voir={{ blocs: vu('blocs_ue'), coord: vu('coord_helb') }} />)}
          {/* LA CHARGE EN TROIS LECTURES (3.5.482, Charles : « la charge ETP sans coordination, avec coordination et avec admin — à la
              carte ») : trois cartes, chacune son graphique, quelles que soient les mesures choisies — on garde à l'impression celles qu'on
              veut. Le cadre administratif (direction, secrétariat : IIP) en ETP, au prorata des inscrits de la section. */}
          {(() => {
            // Le secrétariat toujours, la direction si elle est comptée ; au prorata des périodes de la section (3.5.493).
            const admEtp = y => (y.admin?.etp_secr != null ? y.admin.etp_secr + (mes.direction === 'non' ? 0 : y.admin.etp_dir || 0) : 0);
            const sansAdm = Y.some(y => !(y.admin?.fonctions || []).length);
            return [
              ['charge_ens', 'La charge en ETP : enseignement seul', 'Attributions de la section, hors congés', y => ({ iip: y.ens_iip, helb: y.ens_helb })],
              ['charge_coord', 'La charge en ETP : avec les coordinations', 'Enseignement + coordinations de la section (part IIP et part HELB)', y => ({ iip: y.ens_iip + (y.cetp_iip || 0), helb: y.ens_helb + (y.cetp_helb || 0) })],
              ['charge_admin', 'La charge en ETP : avec le cadre administratif', `Enseignement + coordinations + part ${mes.direction === 'non' ? 'du secrétariat' : 'du secrétariat et de la direction'} (IIP seule), au prorata des périodes de la section${sansAdm ? ' · fonctions non encodées pour certaines années : 0' : ''}`, y => ({ iip: y.ens_iip + (y.cetp_iip || 0) + admEtp(y), helb: y.ens_helb + (y.cetp_helb || 0) })],
            ].filter(([k]) => vu(k)).map(([k, titre, sous, f]) => (
              <Carte key={k} titre={titre} sous={sous} forme={forme(k, 'empile')} onForme={majForme(k)} onMasquer={masquer(k)}>
                <Graphe forme={forme(k, 'empile')} fmt={n2} donnees={Y.map(y => ({ lib: y.lib, ...f(y) }))} />
              </Carte>));
          })()}
          {vu('couts') && <Carte titre="Le coût de la section" sous={`${methode}${mes.coord === 'oui' ? ', coordinations' : ''}${mes.admin === 'oui' ? ', cadre administratif' : ''}`}
            forme={forme('couts', 'empile')} onForme={majForme('couts')} onMasquer={masquer('couts')}>
            <Graphe forme={forme('couts', 'empile')} fmt={keur} donnees={Y.map(y => ({ lib: y.lib, iip: y.coutI, helb: y.coutH }))} />
          </Carte>}
          {vu('etudiant') && <Carte titre="Le coût d’un étudiant" sous={methode} forme={forme('etudiant', 'empile')} onForme={majForme('etudiant')} onMasquer={masquer('etudiant')}>
            <Graphe forme={forme('etudiant', 'empile')} fmt={eur} donnees={Y.filter(y => y.inscrits).map(y => ({ lib: y.lib, iip: y.coutI / y.inscrits, helb: y.coutH / y.inscrits }))} />
            <Tableau className="!border-0 !rounded-none"><thead><tr className="tab-entete"><Th>Année</Th>
              <Th align="droite">IIP</Th><Th align="droite">HELB</Th><Th align="droite">Ensemble</Th></tr></thead>
              <tbody>{Y.filter(y => y.inscrits).map(y => (
                <tr key={y.annee} className="border-b border-slate-100"><Td className="whitespace-nowrap">{y.annee}</Td>
                  <Td align="droite">{eur(y.coutI / y.inscrits)}</Td><Td align="droite">{eur(y.coutH / y.inscrits)}</Td>
                  <Td align="droite" ton="fort">{eur((y.coutI + y.coutH) / y.inscrits)}</Td></tr>))}</tbody></Tableau>
          </Carte>}
          {vu('recettes') && <Carte titre="Un étudiant : ce qu’il rapporte (droits, à l’ASBL) et ce qu’il coûte à l’IIP" sous="Droits et frais au barème, sans plafond ni exonération"
            forme={forme('recettes', 'cote')} onForme={majForme('recettes')} onMasquer={masquer('recettes')}>
            <Graphe forme={forme('recettes', 'cote') === 'parts' ? 'cote' : forme('recettes', 'cote')} fmt={eur}
              series={[['cout', 'Coût pour l’IIP', IIP], ['percu', 'Droits et frais perçus', PERCU]]}
              donnees={Y.filter(y => y.inscrits && !y.tiers).map(y => ({ lib: y.lib, cout: y.coutI / y.inscrits, percu: y.recettes / y.inscrits }))} />
          </Carte>}

          {vu('helb') && <Carte large titre="Pour la HELB et l’ASBL : ce que coûte et rapporte la section" sous={`Allocation lissée sur ${PH.lissage} ans (décret de 1996, art. 17) · droits à l’ASBL`}
            forme={forme('helb', 'cote')} onForme={majForme('helb')} onMasquer={masquer('helb')}>
            <div>
              <div className="min-w-0">
                <Graphe forme={forme('helb', 'cote') === 'parts' ? 'cote' : forme('helb', 'cote')} fmt={keur}
                  series={[['recettes', 'Ce qu’elle rapporte', PERCU], ['cout', 'Ce qu’elle coûte', HELB]]}
                  donnees={HY.map(({ y, h }) => ({ lib: y.lib, recettes: h.recettes, cout: h.cout }))} />
                <div className="overflow-x-auto"><Tableau className="!border-0 !rounded-none">
                  <thead><tr className="tab-entete"><Th>Année</Th><Th align="droite">Comptés (lissés)</Th><Th align="droite">Allocation</Th><Th align="droite">Droits (ASBL)</Th>
                    <Th align="droite">ETP HELB</Th><Th align="droite">Salaires</Th><Th align="droite">Autres serv.</Th>
                    <Th align="droite">{PH.mode_fonct === 'forfait' ? 'Fonct. (forfait)' : 'Matériel'}</Th><Th align="droite">Coût</Th><Th align="droite">Résultat</Th><Th align="droite">Étu./ETP</Th><Th align="droite" title="Direction et secrétariat, 100 % IIP">Apport IIP : admin.</Th><Th align="droite" title="UE 95, 100 % IIP">Apport IIP : aide réussite</Th></tr></thead>
                  <tbody>
                    <tr className="ligne-total font-semibold"><Td>Ensemble</Td><Td />
                      <Td align="droite">{eur(HY.reduce((t, x) => t + x.h.allocation, 0))}</Td>
                      <Td align="droite">{eur(HY.reduce((t, x) => t + x.h.droits, 0))}</Td><Td />
                      <Td align="droite">{eur(HY.reduce((t, x) => t + x.h.salaires, 0))}</Td><Td align="droite">{eur(HY.reduce((t, x) => t + x.h.autres, 0))}</Td>
                      <Td align="droite">{eur(HY.reduce((t, x) => t + x.h.fonct, 0))}</Td><Td align="droite">{eur(HY.reduce((t, x) => t + x.h.cout, 0))}</Td>
                      <Td align="droite" style={{ color: 'var(--c-reussi)' }}>{eur(HY.reduce((t, x) => t + x.h.resultat, 0))}</Td><Td />
                      <Td align="droite">{eur(HY.reduce((t, x) => t + (x.y.admin.part || 0), 0))}</Td>
                      <Td align="droite">{eur(HY.reduce((t, x) => t + u95(x.y), 0))}</Td></tr>
                    {HY.map(({ y, h }) => <tr key={y.annee} className="border-b border-slate-100"><Td className="whitespace-nowrap">{y.annee}</Td>
                      <Td align="droite">{h.base ? n0(h.base) : '—'}</Td>
                      <Td align="droite">{h.allocation ? eur(h.allocation) : <span className="text-slate-400" title="Aucun étudiant de la section dans les trois années académiques précédentes (décret, art. 17)">0 €</span>}</Td>
                      <Td align="droite">{eur(h.droits)}</Td><Td align="droite">{n2(h.etp)}</Td>
                      <Td align="droite">{eur(h.salaires)}</Td><Td align="droite">{eur(h.autres)}</Td><Td align="droite">{eur(h.fonct)}</Td>
                      <Td align="droite">{eur(h.cout)}</Td>
                      <Td align="droite" className="font-semibold" style={{ color: h.resultat >= 0 ? 'var(--c-reussi)' : 'var(--c-refuse)' }}>{h.resultat >= 0 ? '+' : '−'}{eur(Math.abs(h.resultat))}</Td>
                      <Td align="droite">{h.parEtp ? <span title={`Moyenne HELB : ${PH.moyenne}`}>{n0(h.parEtp)} <span className="text-slate-400">/ {PH.moyenne}</span></span> : '—'}</Td>
                      <Td align="droite" title={y.admin.reprise ? `Structure de ${y.admin.reprise} reprise` : ''}>{y.admin.part ? `${eur(y.admin.part)}${y.admin.reprise ? ' *' : ''}` : '—'}</Td>
                      <Td align="droite" title={`UE 95 : ${n0(y.ue95?.periodes)} périodes`}>{u95(y) ? eur(u95(y)) : '—'}</Td></tr>)}
                  </tbody></Tableau></div>
                <div className="bloc-etat px-3 py-2 text-second mt-2" data-etat="surveiller">
                  <b>Les ressources humaines de la HELB sont mises de côté</b> : elle établit les contrats de ses enseignants, mais ce coût n’est pas estimable.
                  Tout le reste de l’administration est à l’IIP — le secrétariat travaille à 100 % pour les étudiants et la direction —, ainsi que l’aide à la réussite (UE 95).
                </div>
              </div>
              <Volet titre="Les réglages : matériel, paramètres et sources">
              <div className="space-y-2">
                <div className="intertitre">Le matériel et le fonctionnement</div>
                <div className="segments" role="radiogroup">
                  {[['reel', 'Réel de la section'], ['forfait', `Forfait ${PH.fonctionnement} %`]].map(([v, l]) => (
                    <button key={v} type="button" role="radio" aria-checked={PH.mode_fonct === v} onClick={() => maj('helb', { ...(reglages.helb || {}), mode_fonct: v })}
                      className={`flex-1 whitespace-nowrap ${PH.mode_fonct === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>))}
                </div>
                {PH.mode_fonct === 'reel' && <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-4">{HY.map(({ y }) => (
                  <label key={y.annee} className="flex items-center gap-2 text-second" title={d?.materiel_defaut?.[y.annee]?.source || ''}>
                    <span className="flex-1 min-w-0 truncate">{y.annee} <span className="text-mention text-slate-400">{d?.materiel_defaut?.[y.annee]?.source?.split(' — ')[0] || ''}</span></span>
                    <input className="controle !h-8 w-24 text-right" inputMode="decimal" placeholder={String(d?.materiel_defaut?.[y.annee]?.montant ?? 0)}
                      value={reglages.materiel?.[y.annee] ?? ''} onChange={e => maj('materiel', { ...(reglages.materiel || {}), [y.annee]: e.target.value.replace(',', '.') })} aria-label={`Matériel ${y.annee}`} />
                    <span className="w-6 text-mention text-slate-500">€</span>
                  </label>))}</div>}
                {/* UN ETP DE LA HELB (3.5.463) : ses heures, et son prix — plusieurs calculs côte à côte. */}
                <div className="intertitre pt-2">Un ETP de la HELB</div>
                <p className="text-second text-slate-600 m-0">Un temps plein : 480 h pour la théorie d’un maître-assistant, 750 h pour tout le reste (TP, maîtres de formation pratique, praticiens), 1 400 h pour une coordination. Le titre se lit dans la colonne « HELB » de la ligne d’attribution (à défaut, le statut HELB de la fiche), la théorie ou le TP dans la colonne TH/TP. Les lignes HELB des attributions sont lues :</p>
                <div className="flex flex-wrap gap-2">
                  {segm('unite_helb', [['periodes', 'en périodes de 50 min'], ['heures', 'en heures']])}
                  {mes.cout === 'reel' && segm('prix_helb', [['titres', `Au titre — MA ${eur(d?.prix_helb?.ma)}, MFP ${eur(d?.prix_helb?.mfp)}, invité ${d?.prix_helb?.invite ? eur(d.prix_helb.invite) : 'au titre'}`], ['moyenne', `Moyenne HELB — ${eur(d?.prix_helb?.moyen)}`], ['fixe', `Montant réglé — ${eur(PH.cmbp)}`]])}
                </div>
                {mes.cout === 'reel' && <p className="text-mention text-slate-500 m-0">Professeurs invités de la HELB (lignes au statut expert) : {d?.prix_helb?.invite
                  ? `au prix moyen d’un invité du COR, ${eur(d.prix_helb.invite)} par ETP (ligne « professeurs invités » ÷ ETP des invités), quel que soit leur titre.`
                  : 'prix moyen d’un invité inconnu — déposez à nouveau le fichier d’attributions de la HELB dans Les sources (Lucie y lit désormais les ETP des invités) ; en attendant, ils comptent au prix de leur titre.'}</p>}
                {HY.length > 0 && mes.cout === 'reel' && <p className="text-mention text-slate-500 m-0">Salaires HELB {HY[HY.length - 1].y.annee} : au titre {eur(salairesHelb({ ...HY[HY.length - 1].y, salaires_imposes: null }, { ...PH, prix: 'titres' }, mes.coord === 'oui'))} · à la moyenne {eur(salairesHelb({ ...HY[HY.length - 1].y, salaires_imposes: null }, { ...PH, prix: 'moyenne' }, mes.coord === 'oui'))} · au montant réglé {eur(salairesHelb({ ...HY[HY.length - 1].y, salaires_imposes: null }, { ...PH, prix: 'fixe' }, mes.coord === 'oui'))}. Au titre : un maître-assistant au prix du MA (cours et coordinations), tout le reste au prix d’un MFP.</p>}
                {HY.length > 0 && mes.cout === 'reel' && <div className="overflow-x-auto"><Tableau className="!w-auto">
                  <thead><tr><Th>Année</Th><Th align="droite">ETP HELB selon Lucie</Th><Th align="droite">dont maîtres-assistants</Th><Th align="droite">ETP déclaré par la HELB</Th><Th align="droite">Écart</Th></tr></thead>
                  <tbody>{HY.map(({ y }) => { const dec = d?.etp_declare_helb?.[y.annee]; return (
                    <tr key={y.annee}><Td>{y.annee}</Td><Td align="droite">{n2(y.ens_helb)}</Td><Td align="droite">{n2(y.etp_helb_ma)}</Td>
                      <Td align="droite">{dec != null ? n2(dec) : '—'}</Td><Td align="droite">{dec != null ? n2(y.ens_helb - dec) : '—'}</Td></tr>); })}</tbody>
                </Tableau></div>}
                <div className="intertitre pt-2">Les paramètres</div>
                <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-4">
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
                </div>
                <p className="text-mention text-slate-500 m-0">Sources : présentation financière des départements (Vinci : MUCE 2022, 20,8 % de fonctionnement, 37,2 % d'autres
                  services), courriel de F. Vanderoost du 27 août 2026 (santé × 1,5, ~90 000 € par ETP), tableau Cor_HE_AE (17 étudiants par ETP en moyenne).
                  Apport de l'IIP : le cadre administratif (direction, secrétariat), 100 % IIP, × la part de la section dans ses inscrits
                  {d.admin_reference ? ` ; * structure de ${d.admin_reference.annee} reprise (${eur(d.admin_reference.cout)} × ${pc(d.admin_reference.ratio, 1)})` : ''} — la HELB n'en paie rien,
                  la HELB n'y garde que les ressources humaines de ses propres contrats : « autres services » à régler en conséquence (0 % par défaut ; le taux de Vinci, 37,2 %, couvre tous ses services centraux).
                  Matériel : comptabilité analytique de l'ASBL (2023 : aucun matériel pour TIM) puis budgets 2025-2027, part HELB.
                  Les droits d'inscription vont à l'ASBL et alimentent les moyens de la Haute École. L'IIP a financé sa part sur ses propres
                  dotations : aucun coût supplémentaire, une optimisation des moyens existants.</p>
              </div>
              </Volet>
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
            /* LA COMPARAISON, DIDACTIQUE (3.5.442, Charles : « des graphes pour comparer les départements et placer TIM, et l'IIP ; TIM face à
               l'IIP ; la bande de couleur du département — santé bleu clair, COMAV mauve, Technoeco noir, Social rouge, IIP jaune ; des volets »). */
            const tous = [...d.comparaison.cursus, ...(d.comparaison.iip || [])];
            const ann = ['2022-2023', '2023-2024', '2024-2025', '2025-2026'];
            const val = (c, a) => { const v = c.series[a] || (a === d.comparaison.annee ? [c.etu, c.etp] : null); return v && v[1] ? v : null; };
            const ratioCs = (cs, a = d.comparaison.annee) => { let e = 0, t = 0; for (const c of cs) { const v = val(c, a); if (v) { e += v[0]; t += v[1]; } } return t ? e / t : null; };
            /* LES DÉPARTEMENTS FONT FOI (3.5.465) : le document « ratio par département » de la HELB (étudiants finançables ÷ ETP), quatre
               départements, quatre années ; à défaut la somme des cursus. L'ensemble de la HELB = la somme des départements. */
            const DEP = d.comparaison.departements?.departements || {};
            const ratioDep = (dp, a = d.comparaison.annee) => { const v = DEP[dp]?.[a]; return v && v[1] ? v[0] / v[1] : ratioCs(d.comparaison.cursus.filter(c => c.dept === dp), a); };
            const ratioHe = (a = d.comparaison.annee) => { let e = 0, t = 0; for (const o of Object.values(DEP)) { const v = o[a]; if (v) { e += v[0]; t += v[1]; } } return t ? e / t : ratioCs(d.comparaison.cursus, a); };
            const depts = [...new Set(d.comparaison.cursus.map(c => c.dept))];
            const timH = d.comparaison.cursus.find(c => c.tim), timI = (d.comparaison.iip || []).find(c => c.tim);
            const barresDept = [
              ...depts.map(dp => ({ lib: `Département ${dp}`, v: ratioDep(dp), c: COULEUR_DEPT[dp] })),
              { lib: 'Ensemble de la HELB', v: ratioHe(), c: '#94A3B8' },
              { lib: 'Institut Ilya Prigogine', v: ratioCs(d.comparaison.iip || []), c: COULEUR_DEPT.IIP },
              ...(timH ? [{ lib: `${section} — part HELB`, v: timH.ratio, c: PERCU }] : []),
              ...(timI ? [{ lib: `${section} — part IIP`, v: timI.ratio, c: PERCU }] : []),
            ].filter(x => x.v).map(x => ({ ...x, v: Math.round(x.v) })).sort((x, y) => y.v - x.v);
            const parCursus = tous.filter(c => c.ratio).map(c => ({ lib: c.cursus, v: Math.round(c.ratio), c: c.tim ? PERCU : COULEUR_DEPT[c.dept] })).sort((x, y) => y.v - x.v);
            const evol = ann.map(a => ({ lib: court(a), sante: ratioDep('Santé', a), comav: ratioDep('COMAV', a),
              tim: timH && val(timH, a) ? val(timH, a)[0] / val(timH, a)[1] : null })).map(x => ({ ...x, sante: x.sante && Math.round(x.sante), comav: x.comav && Math.round(x.comav), tim: x.tim && Math.round(x.tim) }));
            const Barres = ({ data, hauteur }) => (
              <ResponsiveContainer width="100%" height={hauteur}>
                <BarChart data={data} layout="vertical" margin={{ left: 10, right: 56 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="lib" width={200} interval={0} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => [`${v} étudiants par ETP`, d.comparaison.annee]} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="v" radius={[0, 3, 3, 0]}>{data.map(x => <Cell key={x.lib} fill={x.c} />)}<LabelList dataKey="v" content={p => badge(data[p.index]?.c || '#475569', v => v, 'droite')(p)} /></Bar>
                </BarChart>
              </ResponsiveContainer>);
            const legende = <div className="flex flex-wrap gap-3 text-mention text-slate-600">{Object.entries(COULEUR_DEPT).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm" style={{ background: c }} />{k === 'IIP' ? 'IIP' : k}</span>)}<span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-3 rounded-sm" style={{ background: PERCU }} />{section}</span></div>;
            const ligneT = (cs, lib, coul, fort, k, onClick, ouvert, ratio = a => ratioCs(cs, a)) => (
              <tr key={k} className={fort ? 'ligne-total font-semibold' : 'border-b border-slate-100'} style={{ boxShadow: `inset 5px 0 0 ${coul}`, cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
                <Td className="pl-4">{onClick && <IconChevronRight size={12} className={`inline mr-1 transition-transform ${ouvert ? 'rotate-90' : ''}`} />}{lib}</Td>
                {ann.map(a => { const r = ratio(a); return <Td key={a} align="droite">{r ? n1(r) : '—'}</Td>; })}</tr>);
            return (
              <Carte large titre="Les cursus et départements : étudiants par ETP enseignant" sous={`Les chiffres de la HELB — ${d.comparaison.source}`} onMasquer={masquer('comparaison')}>
                {legende}
                <div className="grid gap-4 lg:grid-cols-2 mt-2">
                  <div className="min-w-0"><div className="intertitre">Les départements, l’IIP et {section} ({d.comparaison.annee})</div><Barres data={barresDept} hauteur={Math.max(240, barresDept.length * 30)} /></div>
                  <div className="min-w-0"><div className="intertitre">L’évolution : {section} face aux départements</div>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={evol} margin={{ top: 30, right: 28, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} /><XAxis dataKey="lib" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={40} />
                        <Tooltip contentStyle={{ fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 12 }} />
                        {[['tim', `${section} (part HELB)`, PERCU], ['sante', 'Département santé', COULEUR_DEPT['Santé']], ['comav', 'Département COMAV', COULEUR_DEPT.COMAV]].map(([k, n, c]) => (
                          <Line key={k} dataKey={k} name={n} stroke={c} strokeWidth={2.5} dot={{ r: 4 }} connectNulls><LabelList dataKey={k} content={badge(c, v => v, 'haut', i => rangA(evol, ['tim', 'sante', 'comav'], k, i))} /></Line>))}
                      </LineChart>
                    </ResponsiveContainer></div>
                </div>
                <Volet titre={`Tous les cursus, un par un (${d.comparaison.annee})`}><Barres data={parCursus} hauteur={Math.max(300, parCursus.length * 20)} /></Volet>
                <Volet titre="Le tableau, département par département (cliquer un département pour le déplier)" ouvert>
                  <div className="overflow-x-auto"><Tableau className="!border-0 !rounded-none">
                    <thead><tr className="tab-entete"><Th>Cursus</Th>{ann.map(a => <Th key={a} align="droite">{court(a)}</Th>)}</tr></thead>
                    <tbody>
                      {ligneT(d.comparaison.cursus, 'Ensemble de la HELB', '#94A3B8', true, 'tout', null, false, a => ratioHe(a))}
                      {[...depts, 'IIP'].flatMap(dp => {
                        const cs = dp === 'IIP' ? (d.comparaison.iip || []) : d.comparaison.cursus.filter(c => c.dept === dp), coul = COULEUR_DEPT[dp] || '#94A3B8';
                        const ouvert = enImpression || deplies.includes(dp);
                        return [ligneT(cs, dp === 'IIP' ? 'Institut Ilya Prigogine' : `Département ${dp}`, coul, true, dp, () => setDeplies(x => (x.includes(dp) ? x.filter(y => y !== dp) : [...x, dp])), ouvert, dp === 'IIP' ? undefined : a => ratioDep(dp, a)),
                          ...(ouvert ? cs.map(c => (
                            <tr key={dp + c.cursus} className={`border-b border-slate-100 ${c.tim ? 'font-semibold' : ''}`} style={{ boxShadow: `inset 5px 0 0 ${coul}`, ...(c.tim ? { color: PERCU } : {}) }}>
                              <Td className="pl-8">{c.cursus}</Td>
                              {ann.map(a => { const v = val(c, a); return <Td key={a} align="droite">{v ? n0(v[0] / v[1]) : '—'}</Td>; })}</tr>)) : [])];
                      })}
                    </tbody></Tableau>
                    <p className="text-mention text-slate-500 mt-1">Départements et ensemble de la HELB : {d.comparaison.departements?.source || "comparaison ETP"} — étudiants finançables par ETP, 2022-2023 à 2025-2026. Cursus : comparaison ETP de la HELB (Technoeco et Social : 2025-2026 seulement). L’IIP vient du tableau Cor_HE_AE de la HELB, même méthode.</p>
                  </div>
                </Volet>
              </Carte>);
          })()}

          {vu('fonctions') && <Carte large plat titre="Les coordinations de la section" sous={`ETP × 800 × ${n2(d.tarif_ct)} € (période CT ${d.niveau}), part IIP et part HELB`} onMasquer={masquer('fonctions')}>
            <div className="overflow-x-auto"><Tableau className="!border-0 !rounded-none">
              <thead><tr className="tab-entete"><Th>Année</Th><Th>Fonction</Th><Th>Personne</Th>
                <Th align="droite">ETP</Th><Th align="droite">dont IIP</Th><Th align="droite">dont HELB</Th>
                <Th align="droite">Coût IIP</Th><Th align="droite">Coût HELB</Th></tr></thead>
              <tbody>
                <tr className="ligne-total font-semibold"><Td colSpan={3}>Total</Td>
                  <Td align="droite">{n2(Y.reduce((t, y) => t + y.cetp_iip + y.cetp_helb, 0))}</Td>
                  <Td align="droite">{n2(Y.reduce((t, y) => t + y.cetp_iip, 0))}</Td><Td align="droite">{n2(Y.reduce((t, y) => t + y.cetp_helb, 0))}</Td>
                  <Td align="droite">{eur(Y.reduce((t, y) => t + y.coord_iip, 0))}</Td><Td align="droite">{eur(Y.reduce((t, y) => t + y.coord.reduce((u, c) => u + coutCoordH(c), 0), 0))}</Td></tr>
                {Y.flatMap(y => {
                  // UNE ANNÉE, UN VOLET (3.5.442) : le sous-total de l'année, un clic déplie ses fonctions.
                  const ouvert = enImpression || coordOuv.includes(y.annee), bascule = () => setCoordOuv(x => (x.includes(y.annee) ? x.filter(a => a !== y.annee) : [...x, y.annee]));
                  if (!y.coord.length) return [<tr key={y.annee} className="border-b border-slate-100"><Td>{y.annee}</Td><Td className="text-slate-400" colSpan={7}>Aucune coordination encodée (Personnel → fiche → Fonctions, année {y.annee}).</Td></tr>];
                  const somme = k => y.coord.reduce((t, c) => t + (c[k] || 0), 0);
                  return [
                    <tr key={y.annee + 's'} className="tab-repere font-semibold cursor-pointer" onClick={bascule}>
                      <Td className="whitespace-nowrap"><IconChevronRight size={12} className={`inline mr-1 transition-transform ${ouvert ? 'rotate-90' : ''}`} />{y.annee}</Td>
                      <Td className="text-slate-500 font-normal" colSpan={2}>{y.coord.length} fonction(s){y.coord.some(c => !c.etp) ? ' — ETP à renseigner' : ''}</Td>
                      <Td align="droite">{n2(somme('etp'))}</Td><Td align="droite">{n2(somme('etp_iip'))}</Td><Td align="droite">{n2(somme('etp_helb'))}</Td>
                      <Td align="droite">{eur(somme('cout_iip'))}</Td><Td align="droite">{eur(y.coord.reduce((u, c) => u + coutCoordH(c), 0))}</Td></tr>,
                    ...(ouvert ? y.coord.map((c, i) => (
                  <tr key={y.annee + i} className="border-b border-slate-100"><Td />
                    <Td>{c.fonction}{c.titre_helb ? <span className="text-mention text-slate-500"> · HELB {c.titre_helb}</span> : null}</Td><Td>{c.personne}</Td>
                    <Td align="droite">{c.etp ? n2(c.etp) : <span style={{ color: 'var(--c-attente)' }} title="Personnel → fiche → Fonctions">ETP à renseigner</span>}</Td><Td align="droite">{c.deja ? <span className="text-slate-400" title="Déjà dans ses attributions">dans ses cours</span> : n2(c.etp_iip)}</Td>
                    <Td align="droite">{n2(c.etp_helb)}</Td><Td align="droite">{c.cout_iip ? eur(c.cout_iip) : '—'}</Td><Td align="droite">{coutCoordH(c) ? eur(coutCoordH(c)) : '—'}</Td></tr>)) : [])];
                })}
              </tbody></Tableau></div>
          </Carte>}

          {vu('admin') && <Carte plat titre="Le cadre administratif" sous={`${mes.direction === 'non' ? 'Secrétariat seul' : 'Secrétariat et direction'}, charge 100 % IIP, partagés au prorata des périodes (section ÷ école)`} onMasquer={masquer('admin')}>
            <Tableau className="!border-0 !rounded-none"><thead><tr className="tab-entete"><Th>Année</Th><Th align="droite">ETP de l’école</Th>
              <Th align="droite">Coût de l’école</Th><Th align="droite">Part de {section}</Th><Th align="droite">Montant</Th></tr></thead>
              <tbody>{Y.map(y => <tr key={y.annee} className="border-b border-slate-100"><Td>{y.annee}</Td>
                <Td align="droite">{y.admin.fonctions.length ? n2(y.admin.fonctions.reduce((t, f) => t + f.etp, 0)) : '—'}</Td>
                <Td align="droite">{y.admin.cout ? eur(y.admin.cout) : y.admin.fonctions.length ? 'ETP à régler' : '—'}</Td>
                <Td align="droite" title={y.admin.per_ecole ? `${Math.round(y.admin.per_section)} périodes sur ${Math.round(y.admin.per_ecole)}` : ''}>{y.admin.reprise ? `${Math.round((d.admin_reference?.ratio || 0) * 100)} %` : pc(y.admin.per_section, y.admin.per_ecole)}</Td><Td align="droite" className="font-semibold" title={y.admin.reprise ? `Structure de ${y.admin.reprise} reprise` : ''}>{y.admin.part ? `${eur(y.admin.part)}${y.admin.reprise ? ' *' : ''}` : '—'}</Td></tr>)}</tbody></Tableau>
            {Y.some(y => y.admin.reprise) && <p className="text-mention text-slate-500 px-4 py-2 m-0">* Fonctions non encodées cette année : la structure de {d.admin_reference?.annee} est reprise, partagée selon la part de {section}.</p>}
          </Carte>}

          {[['statuts', 'La balance par école : chargés de cours, experts et invités (ETP)'], ['blocs', 'L’enseignement par bloc (ETP)'], ['natures', 'L’enseignement par nature (ETP)']].map(([k, t]) => vu(k) && (
            <Carte key={k} plat large={k === 'statuts'} titre={t} onMasquer={masquer(k)}>
              {/* LES DISQUES DE LA BALANCE (3.5.472, Charles : « des disques, avec la part de profs invités et experts pour chaque école
                  sur les années ») : une ligne par école, un disque par année — chargés de cours, experts et invités, en ETP. */}
              {k === 'statuts' && (() => {
                // « Les deux écoles réunies » (3.5.473, Charles : « et la part globale toute école confondue ») : IIP + HELB.
                const part = (y, cote, re) => Object.entries(y.statuts || {}).filter(([c]) => re.test(c)).reduce((t, [, v]) => t + (cote === 'tout' ? (v.iip || 0) + (v.helb || 0) : (v[cote] || 0)), 0);
                const COUL = { cc: 'var(--g-1)', exp: 'var(--g-3)', autre: 'var(--g-vide)' };
                return (
                  <div className="p-3 space-y-3 border-b border-slate-100">
                    {[['iip', 'Institut Ilya Prigogine'], ['helb', 'Haute École (HELB)'], ['tout', 'Les deux écoles réunies']].map(([cote, nom]) => (
                      <div key={cote} className={`flex items-center gap-4 flex-wrap ${cote === 'tout' ? 'pt-3 border-t border-slate-100' : ''}`}>
                        <div className="w-44 flex-none text-sm font-semibold text-slate-700">{nom}</div>
                        {Y.map(y => {
                          const cc = part(y, cote, /^Chargés/), ex = part(y, cote, /^Experts/), au = part(y, cote, /^Autres/), tot = cc + ex + au;
                          return (
                            <div key={y.annee} className="flex flex-col items-center gap-1">
                              <Anneau taille={92} legende={false} centre={tot ? `${Math.round((ex / tot) * 100)} %` : '—'}
                                parts={[{ nom: 'Chargés de cours', valeur: cc, couleur: COUL.cc }, { nom: 'Experts et invités', valeur: ex, couleur: COUL.exp }, { nom: 'Autres statuts', valeur: au, couleur: COUL.autre }]} />
                              <span className="text-mention text-slate-500 tabular-nums">{y.lib} · {n2(tot)} ETP</span>
                            </div>);
                        })}
                      </div>))}
                    <div className="flex flex-wrap gap-4 text-mention text-slate-600">
                      <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-pastille" style={{ background: COUL.cc }} />Chargés de cours</span>
                      <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-pastille" style={{ background: COUL.exp }} />Experts et invités (le pourcentage au centre)</span>
                    </div>
                  </div>);
              })()}
              <div className="overflow-x-auto"><Tableau className="!border-0 !rounded-none">
                <thead><tr className="tab-entete"><Th />{Y.map(y => <Th key={y.annee} align="droite" colSpan={2}>{y.lib}</Th>)}</tr>
                  <tr className="tab-entete"><Th />{Y.map(y => [<Th key={y.annee + 'i'} align="droite" className="font-normal">IIP</Th>, <Th key={y.annee + 'h'} align="droite" className="font-normal">HELB</Th>])}</tr></thead>
                <tbody>{[...new Set(Y.flatMap(y => Object.keys(y[k] || {})))].sort((a, b) => a.localeCompare(b, 'fr')).map(c => (
                  <tr key={c} className="border-b border-slate-100"><Td>{c}</Td>
                    {Y.map(y => [<Td key={y.annee + 'i'} align="droite">{y[k]?.[c]?.iip ? n2(y[k][c].iip) : '—'}</Td>,
                      <Td key={y.annee + 'h'} align="droite">{y[k]?.[c]?.helb ? n2(y[k][c].helb) : '—'}</Td>])}</tr>))}
                  {k === 'statuts' && (() => {
                    // Les totaux par statut, puis la part de l'IIP dans les stages : la balance se lit d'un coup d'œil.
                    const tot = (y, re, cote) => Object.entries(y.statuts || {}).filter(([c]) => re.test(c)).reduce((t, [, v]) => t + (v[cote] || 0), 0);
                    return [['Chargés de cours', /^Chargés/], ['Experts et invités', /^Experts/], ['Stages (tous statuts)', /stages$/]].map(([lib, re]) => (
                      <tr key={lib} className="ligne-total font-semibold"><Td>{lib}</Td>
                        {Y.map(y => [<Td key={y.annee + 'i'} align="droite">{n2(tot(y, re, 'iip'))}</Td>, <Td key={y.annee + 'h'} align="droite">{n2(tot(y, re, 'helb'))}</Td>])}</tr>));
                  })()}</tbody></Tableau></div>
            </Carte>))}

          {vu('enseignants') && <Carte large titre="Qui porte l’enseignement — par enseignant (ETP)" sous={`Rangé par la charge de ${aN.annee}`} onMasquer={masquer('enseignants')}>
            <Volet titre={`${d.enseignants.length} enseignants — déplier la liste`}>
            <div className="overflow-x-auto max-h-[28rem]"><Tableau className="!border-0 !rounded-none">
              <thead className="sticky top-0 bg-white"><tr className="tab-entete"><Th>Enseignant</Th><Th>Contrat</Th>
                {Y.map(y => <Th key={y.annee} align="droite">{y.lib}</Th>)}</tr></thead>
              <tbody>{[...d.enseignants].sort((a, b) => (b.par[aN.annee] || 0) - (a.par[aN.annee] || 0) || a.nom.localeCompare(b.nom, 'fr')).map(e => (
                <tr key={e.nom + e.contrat} className="border-b border-slate-100"><Td>{e.nom}</Td>
                  <Td><span className="pastille-etat" style={{ color: '#fff', background: e.contrat === 'HELB' ? HELB : IIP }}>{e.contrat}</span></Td>
                  {Y.map(y => <Td key={y.annee} align="droite">{e.par[y.annee] ? n2(e.par[y.annee]) : '—'}</Td>)}</tr>))}</tbody></Tableau></div>
            </Volet>
          </Carte>}
        </div>
        <p className="text-mention text-slate-500">Lecture : {methode}. IIP : barème du Pilotage (CT ÷ 800 + PP ÷ 1 000, autonomie comprise), au prix de la circulaire des conventions ; coordinations IIP : ETP × 800 × la période CT. HELB, {mes.cout === 'reel'
          ? 'en coûts réels : heures de la HELB (480 h pour la théorie d’un maître-assistant, 750 h pour le reste), au prix de leur titre au COR, coordinations comprises'
          : 'en convention : un maître-assistant compté comme un CT (÷ 800, prix CT), tout autre comme un PP (÷ 1 000, prix PP) — cours et coordinations'}. Une coordination déjà dans les attributions n'est pas recomptée. {d.premiere ? `Première année de ${section} dans Lucie : ${d.premiere}.` : ''}</p>
      </>)}
    </div>);
}

/* LES CARTES DE LA POPULATION (3.5.289-292). Charles : « une carte des communes, couleurs en dégradé selon les chiffres » ; « carte du
 * monde en plus » ; « trois tuiles Bruxelles, Belgique, Monde, avec mini carte » (proposition A) ; « un zoom de la carte du monde sur la
 * largeur de la tuile » ; puis, d'après une page de la HELB (3.5.292) : le campus Erasme sur les cartes, des CLASSES de couleur au lieu
 * du dégradé (moins de 3 %, 3-5, 5-8, 8-12, 12 % et plus), et Bruxelles sur trois années avec l'évolution et les 5 premières communes.
 * Contours des communes : secteurs statistiques Statbel au 1er janvier 2026, regroupés en 565 communes, avec leurs voisines et le
 * campus (public/carte/communes-be.json) ; des pays : Natural Earth 1:110 M, domaine public (public/carte/monde.json). Chiffres :
 * `domicile.par_nis` (code postal → commune par la liste bpost) et `pays` (nationalité → code ISO par la liste des pays de Lucie).
 * Couleurs dans `style`, jamais en attribut SVG. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { listePays } from '../lib/pays.js';
import { Fenetre, Tableau, TableauEntete, Th, Td, Tr } from './ui.jsx';

const CACHE = {};
const charger = f => (CACHE[f] ||= fetch(`/carte/${f}`).then(r => (r.ok ? r.json() : null)).catch(() => null));
export function useCartes() {
  const [be, setBe] = useState(null);
  const [monde, setMonde] = useState(null);
  useEffect(() => { charger('communes-be.json').then(setBe); charger('monde.json').then(setMonde); }, []);
  return { be, monde };
}

const k0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const pc = (k, n) => (n ? `${Math.round((k / n) * 100)} %` : '—');
const pc1 = (k, n) => (n ? `${((k / n) * 100).toFixed(1).replace('.', ',')} %` : '—');
const nu = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/* LES CINQ CLASSES (la page de la HELB) : la part de la commune dans l'ensemble de la carte. */
export const CLASSES = [['moins de 3 %', 0, 3], ['3 à 5 %', 3, 5], ['5 à 8 %', 5, 8], ['8 à 12 %', 8, 12], ['12 % et plus', 12, Infinity]];
const TONS = [16, 34, 52, 72, 100];
const teinteClasse = i => `color-mix(in srgb, var(--c-principal, #16406A) ${TONS[i]}%, white)`;
export const teinte = (n, base) => {
  if (!n || !base) return 'rgb(var(--gris-100, 241 245 249))';
  const p = (n / base) * 100;
  return teinteClasse(CLASSES.findIndex(([, a, b]) => p >= a && p < b));
};
const OR = '#F9B619';

function boite(d) {
  const v = String(d).match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < v.length; i += 2) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); }
  return [x0, y0, x1, y1];
}
const nomCommune = c => (c.region === 'flandre' ? c.nl : c.region === 'bruxelles' ? c.fr : c.fr === c.nl ? c.fr : `${c.fr} / ${c.nl}`);

export function LegendeClasses({ campus = true, de = '' }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-mention text-slate-500">
      {de && <span>{de} :</span>}
      {CLASSES.map(([l], i) => <span key={l} className="inline-flex items-center gap-1"><span className="inline-block w-3.5 h-3 rounded-sm" style={{ background: teinteClasse(i) }} />{l}</span>)}
      {campus && <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: OR, boxShadow: '0 0 0 1.5px var(--c-principal, #16406A)' }} />Campus Erasme</span>}
    </div>);
}

/** Une carte de Bruxelles (ou de la Belgique) : communes en classes, le campus en pastille or. */
export function CarteDomicile({ be, parNis, base, quelle = 'bruxelles', vif = false, onVu }) {
  if (!be) return null;
  const bxl = quelle === 'bruxelles';
  const cs = bxl ? be.communes.filter(c => c.dbx) : be.communes;
  const [w, h] = bxl ? [be.bruxelles.largeur, be.bruxelles.hauteur] : [be.largeur, be.hauteur];
  const pt = be.campus?.[bxl ? 'bx' : 'be'];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" role={vif ? 'img' : undefined}
      aria-label={vif ? `${bxl ? 'Bruxelles' : 'Belgique'} : étudiants par commune de domicile` : undefined}>
      {cs.map(c => {
        const n = parNis[c.nis] || 0;
        return (
          <path key={c.nis} d={bxl ? c.dbx : c.d} strokeWidth={bxl ? 1.2 : 0.5} fillRule="evenodd"
            style={{ fill: teinte(n, base), stroke: bxl ? 'white' : 'rgb(var(--gris-300, 203 213 225))', cursor: vif ? 'pointer' : undefined }}
            {...(vif ? { onMouseEnter: () => onVu?.({ libelle: nomCommune(c), n, base }), onMouseLeave: () => onVu?.(null), onClick: () => onVu?.({ libelle: nomCommune(c), n, base }) } : {})}>
            {vif && <title>{`${nomCommune(c)} — ${k0(n)} étudiant(s)${n ? ` · ${pc1(n, base)}` : ''}`}</title>}
          </path>);
      })}
      {pt && <circle cx={pt[0]} cy={pt[1]} r={bxl ? 11 : 7} style={{ fill: OR, stroke: 'var(--c-principal, #16406A)', strokeWidth: bxl ? 3 : 2 }}><title>Campus Erasme</title></circle>}
    </svg>);
}

export default function CarteCommunes({ parNis = {}, total = 0, pays = {}, totalPays = 0 }) {
  const { be, monde } = useCartes();
  const [ouverte, setOuverte] = useState(null);   // 'bruxelles' | 'belgique' | 'monde'
  const [vu, setVu] = useState(null);
  const [avecBelgique, setAvecBelgique] = useState(false);
  const parIso = useMemo(() => {
    const code = new Map(listePays().map(p => [nu(p.nom), p.code]));
    const r = {}; let hors = 0;
    for (const [nom, n] of Object.entries(pays)) { const c = code.get(nu(nom)); if (c) r[c] = (r[c] || 0) + n; else hors += n; }
    return { r, hors };
  }, [pays]);
  const boites = useMemo(() => (monde ? Object.fromEntries(monde.pays.map(p => [`${p.iso}-${p.fr}`, boite(p.d)])) : {}), [monde]);

  const comptesMonde = avecBelgique ? parIso.r : Object.fromEntries(Object.entries(parIso.r).filter(([c]) => c !== 'BE'));
  const baseMonde = Object.values(comptesMonde).reduce((t, n) => t + n, 0);
  const bxl = be ? be.communes.filter(c => c.region === 'bruxelles') : [];
  const nBxl = bxl.reduce((t, c) => t + (parNis[c.nis] || 0), 0);
  const cBxl = bxl.filter(c => parNis[c.nis]).length;
  const nationalites = Object.keys(parIso.r).filter(c => c !== 'BE').length;
  const horsBe = Object.entries(parIso.r).filter(([c]) => c !== 'BE').reduce((t, [, n]) => t + n, 0);

  const cadreMonde = useMemo(() => {
    if (!monde) return null;
    const concernes = monde.pays.filter(p => comptesMonde[p.iso]);
    if (!concernes.length) return `0 0 ${monde.largeur} ${monde.hauteur}`;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of concernes) { const b = boites[`${p.iso}-${p.fr}`]; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    const m = 25; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(monde.largeur, x1 + m); y1 = Math.min(monde.hauteur, y1 + m);
    const l = x1 - x0, h = y1 - y0;
    if (l < 2.2 * h) { const ajout = (2.2 * h - l) / 2; x0 = Math.max(0, x0 - ajout); x1 = Math.min(monde.largeur, x1 + ajout); }
    return `${Math.round(x0)} ${Math.round(y0)} ${Math.round(x1 - x0)} ${Math.round(y1 - y0)}`;
  }, [monde, boites, comptesMonde]);

  const svgMonde = (vif, cadre) => monde && (
    <svg viewBox={cadre || `0 0 ${monde.largeur} ${monde.hauteur}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" role={vif ? 'img' : undefined} aria-label={vif ? 'Le monde : étudiants par nationalité' : undefined}>
      {monde.pays.map(p => { const n = comptesMonde[p.iso] || 0; return (
        <path key={`${p.iso}-${p.fr}`} d={p.d} strokeWidth={0.4} fillRule="evenodd" style={{ fill: teinte(n, baseMonde), stroke: 'rgb(var(--gris-300, 203 213 225))', cursor: vif ? 'pointer' : undefined }}
          {...(vif ? { onMouseEnter: () => setVu({ libelle: p.fr, n, base: baseMonde }), onMouseLeave: () => setVu(null), onClick: () => setVu({ libelle: p.fr, n, base: baseMonde }) } : {})}>
          {vif && <title>{`${p.fr} — ${k0(n)} étudiant(s)${n ? ` · ${pc1(n, baseMonde)}` : ''}`}</title>}
        </path>); })}
    </svg>);

  const tuile = (cle, chiffre, libelle, precision, mini, large) => (
    <button key={cle} type="button" data-etat="fort" onClick={() => { setVu(null); setOuverte(cle); }}
      className="bloc-etat tuile-grande relative text-left min-w-0 cursor-pointer hover:brightness-[.98] transition flex items-center gap-3 h-[104px] overflow-hidden">
      <div className="min-w-0 shrink-0">
        <div className="tuile-chiffre font-bold tabular-nums leading-tight">{chiffre}</div>
        <div className="tuile-libelle text-slate-600">{libelle}</div>
        <div className="text-mention text-slate-400">{precision}</div>
      </div>
      <div className={`${large ? 'flex-1 min-w-0' : 'w-20 ml-auto'} h-[76px]`} aria-hidden="true">{mini}</div>
    </button>);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        {tuile('bruxelles', k0(nBxl), 'à Bruxelles', `${pc(nBxl, total)} des adresses belges · ${cBxl} commune(s)`, <CarteDomicile be={be} parNis={parNis} base={nBxl} quelle="bruxelles" />)}
        {tuile('belgique', k0(total), 'adresses belges', `${k0(Object.keys(parNis).length)} commune(s) concernée(s)`, <CarteDomicile be={be} parNis={parNis} base={total} quelle="belgique" />)}
        {tuile('monde', k0(nationalites), 'nationalités hors Belgique', `${k0(horsBe)} étudiant(s)`, svgMonde(false, cadreMonde), true)}
      </div>
      {ouverte && (
        <Fenetre titre={{ bruxelles: 'Bruxelles — domicile des étudiants', belgique: 'Belgique — domicile des étudiants', monde: 'Le monde — nationalité des étudiants' }[ouverte]}
          sous={ouverte === 'monde' ? `${k0(totalPays)} étudiants dont la nationalité est renseignée` : ouverte === 'bruxelles' ? `${k0(nBxl)} Bruxellois · part de chaque commune parmi eux` : `${k0(total)} adresses belges · part de chaque commune`}
          large="grande" onFermer={() => setOuverte(null)}>
          <div className="space-y-2">
            {ouverte === 'monde' && (
              <label className="text-second text-slate-600 inline-flex items-center gap-1.5"><input type="checkbox" checked={avecBelgique} onChange={e => setAvecBelgique(e.target.checked)} /> Belgique comprise</label>)}
            <div className="w-full" style={{ aspectRatio: ouverte === 'monde' ? `${monde?.largeur || 1000} / ${monde?.hauteur || 394}` : ouverte === 'belgique' ? `${be?.largeur || 1000} / ${be?.hauteur || 816}` : '1 / 1', maxHeight: '62vh' }}>
              {ouverte === 'monde' ? svgMonde(true) : <CarteDomicile be={be} parNis={parNis} base={ouverte === 'bruxelles' ? nBxl : total} quelle={ouverte} vif onVu={setVu} />}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <LegendeClasses campus={ouverte !== 'monde'} />
              <div className="ml-auto text-second font-medium text-iip-texte min-h-[1.25rem]">{vu ? `${vu.libelle} — ${k0(vu.n)} étudiant(s)${vu.n ? ` · ${pc1(vu.n, vu.base)}` : ''}` : 'Survolez ou touchez une commune ou un pays.'}</div>
            </div>
            {ouverte === 'monde' && parIso.hors > 0 && <div className="text-mention text-slate-400">{k0(parIso.hors)} nationalité(s) encodée(s) hors de la liste des pays : pas sur la carte.</div>}
            <p className="text-mention text-slate-400 m-0">{ouverte === 'monde' ? (monde?.source || 'Natural Earth') : `${be?.source || 'Statbel'} ; code postal → commune : liste des codes postaux de bpost.`}</p>
          </div>
        </Fenetre>)}
    </>);
}

/* BRUXELLES SUR TROIS ANNÉES (3.5.292, d'après la page de la HELB) : la carte de chaque année, le tableau d'évolution et les cinq
   premières communes. L'adresse est celle de la fiche aujourd'hui (Lucie ne garde pas l'adresse de chaque année). */
export function BruxellesTroisAns({ parAnnee = [], titreFiltre = '' }) {
  const { be } = useCartes();
  const [vu, setVu] = useState(null);
  if (!be || !parAnnee.length) return null;
  const anderlecht = be.communes.find(c => c.nis === '21001');
  const autour = new Set(['21001', ...(anderlecht?.voisins || []).filter(v => be.communes.find(c => c.nis === v)?.region === 'bruxelles')]);
  const bx = new Set(be.communes.filter(c => c.region === 'bruxelles').map(c => c.nis));
  const lignes = parAnnee.map(a => {
    const d = a.domicile || { par_nis: {}, bruxelles: 0, wallonie: 0, flandre: 0 };
    const pn = d.par_nis || {};
    const belges = (d.bruxelles || 0) + (d.wallonie || 0) + (d.flandre || 0);
    const bxl = Object.entries(pn).filter(([k]) => bx.has(k)).reduce((t, [, n]) => t + n, 0);
    const campus = pn['21001'] || 0;
    const zone = Object.entries(pn).filter(([k]) => autour.has(k)).reduce((t, [, n]) => t + n, 0);
    const top = Object.entries(pn).filter(([k]) => bx.has(k)).sort((x, y) => y[1] - x[1]).slice(0, 5)
      .map(([k, n]) => ({ nom: nomCommune(be.communes.find(c => c.nis === k) || { fr: k, nl: k }), n }));
    return { annee: a.annee, pn, belges, bxl, campus, zone, top };
  });
  const evol = (a, b, enPoints) => {
    if (a == null || b == null) return '';
    if (enPoints) { const v = b - a; return `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')} pt`; }
    if (!a) return '';
    const v = ((b - a) / a) * 100; return `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')} %`;
  };
  const part = (k, n) => (n ? (k / n) * 100 : null);
  const ligneTab = (libelle, f, enPct, fort) => (
    <Tr className={fort ? 'font-semibold' : ''}>
      <Td>{libelle}</Td>
      {lignes.map((l, i) => <Fragment key={l.annee}><Td align="droite" className="tabular-nums whitespace-nowrap">{enPct ? (part(...f(l)) == null ? '—' : `${part(...f(l)).toFixed(1).replace('.', ',')} %`) : k0(f(l))}</Td>
        {i > 0 && <Td align="droite" className="tabular-nums whitespace-nowrap text-slate-500">{enPct ? evol(part(...f(lignes[i - 1])), part(...f(l)), true) : evol(f(lignes[i - 1]), f(l), false)}</Td>}</Fragment>)}
    </Tr>);
  return (
    <section className="carte overflow-hidden min-w-0">
      <div className="entete-carte px-4 py-2.5">
        <div className="titre-carte">Domicile à Bruxelles{titreFiltre ? ` — ${titreFiltre}` : ''}, sur trois années</div>
        <div className="text-second text-slate-500">Part de chaque commune parmi les Bruxellois de l'année · adresse actuelle de la fiche (Lucie ne garde pas l'adresse de chaque année)</div>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {lignes.map((l, i) => (
            <div key={l.annee} className="min-w-0 space-y-1">
              <div className="text-center font-semibold" style={{ color: i === lignes.length - 1 ? '#B8860B' : undefined }}>{l.annee}</div>
              <div className="aspect-square"><CarteDomicile be={be} parNis={l.pn} base={l.bxl} quelle="bruxelles" vif onVu={x => setVu(x && { ...x, annee: l.annee })} /></div>
            </div>))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LegendeClasses de="% des Bruxellois" />
          <span className="ml-auto text-second font-medium text-iip-texte min-h-[1.25rem]">{vu ? `${vu.annee} · ${vu.libelle} — ${k0(vu.n)} étudiant(s)${vu.n ? ` · ${pc1(vu.n, vu.base)}` : ''}` : ''}</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="overflow-x-auto">
            <Tableau dense>
              <TableauEntete><Th>Domicile</Th>{lignes.map((l, i) => <Fragment key={l.annee}><Th align="droite">{l.annee}</Th>{i > 0 && <Th align="droite">Évol.</Th>}</Fragment>)}</TableauEntete>
              <tbody>
                {ligneTab('Domiciliés en Belgique', l => l.belges)}
                {ligneTab('dont en Région bruxelloise', l => l.bxl)}
                {ligneTab('Part en Région bruxelloise', l => [l.bxl, l.belges], true, true)}
                {ligneTab('Bruxellois : commune du campus (Anderlecht)', l => [l.campus, l.bxl], true)}
                {ligneTab('Bruxellois : campus + communes limitrophes', l => [l.zone, l.bxl], true, true)}
              </tbody>
            </Tableau>
            <p className="text-mention text-slate-400 m-0 pt-1">Communes limitrophes d'Anderlecht dans la Région : {[...autour].filter(k => k !== '21001').map(k => nomCommune(be.communes.find(c => c.nis === k))).join(', ')}.</p>
          </div>
          <div className="overflow-x-auto">
            <div className="intertitre pb-1">5 premières communes</div>
            <Tableau dense>
              <TableauEntete><Th>N°</Th>{lignes.map(l => <Th key={l.annee}>{l.annee}</Th>)}</TableauEntete>
              <tbody>{[0, 1, 2, 3, 4].map(r => (
                <Tr key={r}><Td>{r + 1}</Td>{lignes.map(l => <Td key={l.annee}>{l.top[r] ? `${l.top[r].nom} · ${pc(l.top[r].n, l.bxl)}` : '—'}</Td>)}</Tr>))}</tbody>
            </Tableau>
          </div>
        </div>
      </div>
    </section>);
}

/* LES CARTES DE LA POPULATION (3.5.289-291). Charles : « une carte des communes, couleurs en dégradé selon les chiffres » ; « carte du
 * monde en plus » ; puis « trois tuiles Bruxelles, Belgique, Monde, avec mini carte, même hauteur et largeur sur ordinateur, l'une sous
 * l'autre sur iPhone » (proposition A : chiffre à gauche, mini carte à droite) ; « un zoom de la carte du monde sur la largeur de la
 * tuile » (la mini carte du monde se cadre sur les pays concernés et prend toute la place libre). Un clic ou un toucher ouvre la carte
 * en grand dans une fenêtre, avec le survol commune par commune.
 * Contours des communes : secteurs statistiques Statbel au 1er janvier 2026, regroupés en 565 communes (public/carte/communes-be.json) ;
 * des pays : Natural Earth 1:110 M, domaine public (public/carte/monde.json). Chiffres : `domicile.par_nis` (code postal → commune par
 * la liste bpost) et `pays` (nationalité de la fiche → code ISO par la liste des pays de Lucie). Couleurs dans `style`, jamais en
 * attribut SVG. */
import { useEffect, useMemo, useState } from 'react';
import { listePays } from '../lib/pays.js';
import { Fenetre } from './ui.jsx';

const CACHE = {};
const charger = f => (CACHE[f] ||= fetch(`/carte/${f}`).then(r => (r.ok ? r.json() : null)).catch(() => null));

const k0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const pc = (k, n) => (n ? `${Math.round((k / n) * 100)} %` : '—');
const nu = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const degrade = max => n => (n ? `color-mix(in srgb, var(--c-principal, #16406A) ${Math.round(18 + 82 * Math.sqrt(n / Math.max(1, max)))}%, white)` : 'rgb(var(--gris-100, 241 245 249))');
/** Le rectangle d'un chemin SVG (ses nombres, deux par deux). */
function boite(d) {
  const v = String(d).match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < v.length; i += 2) { x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i]); y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1]); }
  return [x0, y0, x1, y1];
}

function Legende({ max, teinte }) {
  return (
    <div className="flex items-center gap-1.5 text-mention text-slate-500">1
      <span className="inline-block h-2 w-24 rounded-full" style={{ background: `linear-gradient(to right, ${teinte(1)}, ${teinte(max)})` }} />
      {k0(max)} étudiant(s)</div>);
}

export default function CarteCommunes({ parNis = {}, total = 0, pays = {}, totalPays = 0 }) {
  const [be, setBe] = useState(null);
  const [monde, setMonde] = useState(null);
  const [ouverte, setOuverte] = useState(null);   // 'bruxelles' | 'belgique' | 'monde'
  const [vu, setVu] = useState(null);
  const [avecBelgique, setAvecBelgique] = useState(false);
  useEffect(() => { charger('communes-be.json').then(setBe); charger('monde.json').then(setMonde); }, []);
  const parIso = useMemo(() => {
    const code = new Map(listePays().map(p => [nu(p.nom), p.code]));
    const r = {}; let hors = 0;
    for (const [nom, n] of Object.entries(pays)) { const c = code.get(nu(nom)); if (c) r[c] = (r[c] || 0) + n; else hors += n; }
    return { r, hors };
  }, [pays]);
  const boites = useMemo(() => (monde ? Object.fromEntries(monde.pays.map(p => [`${p.iso}-${p.fr}`, boite(p.d)])) : {}), [monde]);

  const maxC = Math.max(1, ...Object.values(parNis));
  const comptesMonde = avecBelgique ? parIso.r : Object.fromEntries(Object.entries(parIso.r).filter(([c]) => c !== 'BE'));
  const maxM = Math.max(1, ...Object.values(comptesMonde));
  const tC = degrade(maxC), tM = degrade(maxM);
  const nom = c => (c.region === 'flandre' ? c.nl : c.fr === c.nl ? c.fr : `${c.fr} / ${c.nl}`);
  const forme = (cle, d, n, libelle, teinte, larg, base, vif = true) => (
    <path key={cle} d={d} strokeWidth={larg} fillRule="evenodd"
      style={{ fill: teinte(n), stroke: 'rgb(var(--gris-300, 203 213 225))', cursor: vif ? 'pointer' : undefined }}
      {...(vif ? { onMouseEnter: () => setVu({ libelle, n, base }), onMouseLeave: () => setVu(null), onClick: () => setVu({ libelle, n, base }) } : {})}>
      {vif && <title>{`${libelle} — ${k0(n)} étudiant(s)${n ? ` · ${pc(n, base)}` : ''}`}</title>}
    </path>);

  // Les chiffres des tuiles.
  const bxl = be ? be.communes.filter(c => c.region === 'bruxelles') : [];
  const nBxl = bxl.reduce((t, c) => t + (parNis[c.nis] || 0), 0);
  const cBxl = bxl.filter(c => parNis[c.nis]).length;
  const nationalites = Object.keys(parIso.r).filter(c => c !== 'BE').length;
  const horsBe = Object.entries(parIso.r).filter(([c]) => c !== 'BE').reduce((t, [, n]) => t + n, 0);

  // Le monde cadré sur les pays concernés (une marge autour), pour qu'il tienne la largeur de la tuile.
  const cadreMonde = useMemo(() => {
    if (!monde) return null;
    const concernes = monde.pays.filter(p => comptesMonde[p.iso]);
    if (!concernes.length) return `0 0 ${monde.largeur} ${monde.hauteur}`;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of concernes) { const b = boites[`${p.iso}-${p.fr}`]; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    const m = 25; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(monde.largeur, x1 + m); y1 = Math.min(monde.hauteur, y1 + m);
    // Au moins deux fois plus large que haut : la tuile est un bandeau.
    const l = x1 - x0, h = y1 - y0;
    if (l < 2.2 * h) { const ajout = (2.2 * h - l) / 2; x0 = Math.max(0, x0 - ajout); x1 = Math.min(monde.largeur, x1 + ajout); }
    return `${Math.round(x0)} ${Math.round(y0)} ${Math.round(x1 - x0)} ${Math.round(y1 - y0)}`;
  }, [monde, boites, comptesMonde]);

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

  const svgBelgique = (vif, larg) => be && (
    <svg viewBox={`0 0 ${be.largeur} ${be.hauteur}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" role={vif ? 'img' : undefined} aria-label={vif ? 'Belgique : étudiants par commune de domicile' : undefined}>
      {be.communes.map(c => forme(c.nis, c.d, parNis[c.nis] || 0, nom(c), tC, larg, total, vif))}</svg>);
  const svgBruxelles = (vif, larg) => be && (
    <svg viewBox={`0 0 ${be.bruxelles.largeur} ${be.bruxelles.hauteur}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" role={vif ? 'img' : undefined} aria-label={vif ? 'Bruxelles : étudiants par commune de domicile' : undefined}>
      {bxl.map(c => forme(c.nis, c.dbx, parNis[c.nis] || 0, nom(c), tC, larg, total, vif))}</svg>);
  const svgMonde = (vif, larg, cadre) => monde && (
    <svg viewBox={cadre || `0 0 ${monde.largeur} ${monde.hauteur}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" role={vif ? 'img' : undefined} aria-label={vif ? 'Le monde : étudiants par nationalité' : undefined}>
      {monde.pays.map(p => forme(`${p.iso}-${p.fr}`, p.d, comptesMonde[p.iso] || 0, p.fr, tM, larg, totalPays, vif))}</svg>);

  const infobulle = <div className="text-second font-medium text-iip-texte min-h-[1.25rem]">{vu ? `${vu.libelle} — ${k0(vu.n)} étudiant(s)${vu.n ? ` · ${pc(vu.n, vu.base)}` : ''}` : 'Survolez ou touchez une commune ou un pays.'}</div>;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        {tuile('bruxelles', k0(nBxl), 'à Bruxelles', `${pc(nBxl, total)} des adresses belges · ${cBxl} commune(s)`, svgBruxelles(false, 1.2))}
        {tuile('belgique', k0(total), 'adresses belges', `${k0(Object.keys(parNis).length)} commune(s) concernée(s)`, svgBelgique(false, 0.4))}
        {tuile('monde', k0(nationalites), 'nationalités hors Belgique', `${k0(horsBe)} étudiant(s)`, svgMonde(false, 0.4, cadreMonde), true)}
      </div>
      {ouverte && (
        <Fenetre titre={{ bruxelles: 'Bruxelles — domicile des étudiants', belgique: 'Belgique — domicile des étudiants', monde: 'Le monde — nationalité des étudiants' }[ouverte]}
          sous={ouverte === 'monde' ? `${k0(totalPays)} étudiants dont la nationalité est renseignée` : `${k0(total)} adresses belges`} large="grande" onFermer={() => setOuverte(null)}>
          <div className="space-y-2">
            {ouverte === 'monde' && (
              <label className="text-second text-slate-600 inline-flex items-center gap-1.5"><input type="checkbox" checked={avecBelgique} onChange={e => setAvecBelgique(e.target.checked)} /> Belgique comprise</label>)}
            <div className="w-full" style={{ aspectRatio: ouverte === 'monde' ? `${monde?.largeur || 1000} / ${monde?.hauteur || 394}` : ouverte === 'belgique' ? `${be?.largeur || 1000} / ${be?.hauteur || 816}` : '1 / 1', maxHeight: '62vh' }}>
              {ouverte === 'bruxelles' ? svgBruxelles(true, 1.2) : ouverte === 'belgique' ? svgBelgique(true, 0.6) : svgMonde(true, 0.4)}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Legende max={ouverte === 'monde' ? maxM : maxC} teinte={ouverte === 'monde' ? tM : tC} />
              <div className="ml-auto">{infobulle}</div>
            </div>
            {ouverte === 'monde' && parIso.hors > 0 && <div className="text-mention text-slate-400">{k0(parIso.hors)} nationalité(s) encodée(s) hors de la liste des pays : pas sur la carte.</div>}
            <p className="text-mention text-slate-400 m-0">{ouverte === 'monde' ? (monde?.source || 'Natural Earth') : `${be?.source || 'Statbel'} ; code postal → commune : liste des codes postaux de bpost.`}</p>
          </div>
        </Fenetre>)}
    </>);
}

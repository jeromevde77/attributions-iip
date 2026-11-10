/* LES CARTES DE LA POPULATION (3.5.289-290, Charles : « une carte des communes, couleurs en dégradé selon les chiffres » ; « un peu
 * grande ; carte du monde en plus » ; tranché : trois cartes côte à côte — Belgique, Bruxelles agrandie, le monde par nationalité).
 * Contours des communes : secteurs statistiques Statbel au 1er janvier 2026, regroupés en 565 communes (public/carte/communes-be.json) ;
 * des pays : Natural Earth 1:110 M, domaine public (public/carte/monde.json). Chiffres : `domicile.par_nis` (code postal → commune par
 * la liste bpost) et `pays` (nationalité de la fiche, rattachée au code ISO par la liste des pays de Lucie). Plus foncé = plus
 * d'étudiants ; nom, nombre et part au survol ou au toucher. Couleurs dans `style`, jamais en attribut SVG. */
import { useEffect, useMemo, useState } from 'react';
import { listePays } from '../lib/pays.js';

const CACHE = {};
const charger = f => (CACHE[f] ||= fetch(`/carte/${f}`).then(r => (r.ok ? r.json() : null)).catch(() => null));

const k0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const pc = (k, n) => (n ? `${Math.round((k / n) * 100)} %` : '—');
const nu = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

const degrade = max => n => (n ? `color-mix(in srgb, var(--c-principal, #16406A) ${Math.round(18 + 82 * Math.sqrt(n / Math.max(1, max)))}%, white)` : 'rgb(var(--gris-100, 241 245 249))');

function Legende({ max, teinte, unite }) {
  return (
    <div className="flex items-center gap-1.5 text-mention text-slate-500">1
      <span className="inline-block h-2 w-20 rounded-full" style={{ background: `linear-gradient(to right, ${teinte(1)}, ${teinte(max)})` }} />
      {k0(max)} {unite}</div>);
}

export default function CarteCommunes({ parNis = {}, total = 0, pays = {}, totalPays = 0 }) {
  const [be, setBe] = useState(null);
  const [monde, setMonde] = useState(null);
  const [vu, setVu] = useState(null);
  const [avecBelgique, setAvecBelgique] = useState(false);
  useEffect(() => { charger('communes-be.json').then(setBe); charger('monde.json').then(setMonde); }, []);
  // La nationalité de la fiche → le code ISO (la liste des pays de Lucie : « Maroc » → MA).
  const parIso = useMemo(() => {
    const code = new Map(listePays().map(p => [nu(p.nom), p.code]));
    const r = {}; let hors = 0;
    for (const [nom, n] of Object.entries(pays)) { const c = code.get(nu(nom)); if (c) r[c] = (r[c] || 0) + n; else hors += n; }
    return { r, hors };
  }, [pays]);
  const maxC = Math.max(1, ...Object.values(parNis));
  const comptesMonde = avecBelgique ? parIso.r : Object.fromEntries(Object.entries(parIso.r).filter(([c]) => c !== 'BE'));
  const maxM = Math.max(1, ...Object.values(comptesMonde));
  const tC = degrade(maxC), tM = degrade(maxM);
  const nom = c => (c.region === 'flandre' ? c.nl : c.fr === c.nl ? c.fr : `${c.fr} / ${c.nl}`);
  const forme = (cle, d, n, libelle, teinte, larg, base) => (
    <path key={cle} d={d} strokeWidth={larg} fillRule="evenodd"
      style={{ fill: teinte(n), stroke: 'rgb(var(--gris-300, 203 213 225))', cursor: 'pointer' }}
      onMouseEnter={() => setVu({ libelle, n, base })} onMouseLeave={() => setVu(null)} onClick={() => setVu({ libelle, n, base })}>
      <title>{`${libelle} — ${k0(n)} étudiant(s)${n ? ` · ${pc(n, base)}` : ''}`}</title>
    </path>);
  const titre = t => <div className="text-mention font-semibold text-slate-600 uppercase tracking-wide">{t}</div>;
  return (
    <div className="space-y-2">
      <div className="grid gap-4 md:grid-cols-3 items-start">
        <div className="space-y-1 min-w-0">
          {titre('Belgique — domicile')}
          {be ? <svg viewBox={`0 0 ${be.largeur} ${be.hauteur}`} className="w-full h-auto" role="img" aria-label="Belgique : étudiants par commune de domicile">
            {be.communes.map(c => forme(c.nis, c.d, parNis[c.nis] || 0, nom(c), tC, 0.6, total))}</svg> : <p className="text-sm text-slate-400">Chargement…</p>}
          <Legende max={maxC} teinte={tC} unite="étudiant(s)" />
        </div>
        <div className="space-y-1 min-w-0">
          {titre('Bruxelles — domicile')}
          {be ? <svg viewBox={`0 0 ${be.bruxelles.largeur} ${be.bruxelles.hauteur}`} className="w-full h-auto max-h-64" role="img" aria-label="Bruxelles : étudiants par commune de domicile">
            {be.communes.filter(c => c.dbx).map(c => forme(c.nis, c.dbx, parNis[c.nis] || 0, nom(c), tC, 1.2, total))}</svg> : null}
          <div className="text-mention text-slate-400">{k0(Object.keys(parNis).length)} commune(s) concernée(s)</div>
        </div>
        <div className="space-y-1 min-w-0">
          <div className="flex items-center justify-between gap-2">{titre('Le monde — nationalité')}
            <label className="text-mention text-slate-500 inline-flex items-center gap-1"><input type="checkbox" checked={avecBelgique} onChange={e => setAvecBelgique(e.target.checked)} /> Belgique comprise</label></div>
          {monde ? <svg viewBox={`0 0 ${monde.largeur} ${monde.hauteur}`} className="w-full h-auto" role="img" aria-label="Le monde : étudiants par nationalité">
            {monde.pays.map(p => forme(`${p.iso}-${p.fr}`, p.d, comptesMonde[p.iso] || 0, p.fr, tM, 0.4, totalPays))}</svg> : <p className="text-sm text-slate-400">Chargement…</p>}
          <Legende max={maxM} teinte={tM} unite="étudiant(s)" />
          {parIso.hors > 0 && <div className="text-mention text-slate-400">{k0(parIso.hors)} nationalité(s) encodée(s) hors de la liste des pays : pas sur la carte.</div>}
        </div>
      </div>
      <div className="text-second font-medium text-iip-texte min-h-[1.25rem]">{vu ? `${vu.libelle} — ${k0(vu.n)} étudiant(s)${vu.n ? ` · ${pc(vu.n, vu.base)}` : ''}` : 'Survolez ou touchez une commune ou un pays.'}</div>
      <p className="text-mention text-slate-400 m-0">{be?.source || 'Statbel'} ; code postal → commune : liste des codes postaux de bpost. {monde?.source || 'Natural Earth'}.</p>
    </div>);
}

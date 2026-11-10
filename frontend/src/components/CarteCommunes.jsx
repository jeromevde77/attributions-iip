/* LA CARTE DES COMMUNES (3.5.289, Charles : « une carte des communes qui sont concernées, avec des couleurs en dégradé en fonction
 * des chiffres » ; tranché : la Belgique et un encart agrandi de Bruxelles, le dégradé = le nombre d'étudiants). Les contours : les
 * secteurs statistiques Statbel au 1er janvier 2026, regroupés en 565 communes et simplifiés (public/carte/communes-be.json, chargé
 * une fois). Les chiffres : `domicile.par_nis` du serveur (code postal → commune par la liste bpost). Plus foncé = plus d'étudiants ;
 * le nom, le nombre et la part au survol ou au toucher. */
import { useEffect, useMemo, useState } from 'react';

let CACHE = null;
const charger = () => (CACHE ||= fetch('/carte/communes-be.json').then(r => (r.ok ? r.json() : null)).catch(() => null));

const k0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const pc = (k, n) => (n ? `${Math.round((k / n) * 100)} %` : '—');

export default function CarteCommunes({ parNis = {}, total = 0 }) {
  const [g, setG] = useState(null);
  const [vu, setVu] = useState(null);   // { nom, n }
  useEffect(() => { charger().then(setG); }, []);
  const max = useMemo(() => Math.max(1, ...Object.values(parNis)), [parNis]);
  if (!g) return <p className="text-sm text-slate-400 m-0">Chargement de la carte…</p>;
  // Le dégradé : la racine carrée du rapport au maximum, pour que les communes à 1 ou 2 étudiants restent visibles.
  const teinte = n => (n ? `color-mix(in srgb, var(--c-principal, #16406A) ${Math.round(18 + 82 * Math.sqrt(n / max))}%, white)` : 'rgb(var(--gris-100, 241 245 249))');
  const nom = c => (c.region === 'flandre' ? c.nl : c.fr === c.nl ? c.fr : `${c.fr} / ${c.nl}`);
  const commune = (c, d, larg) => {
    const n = parNis[c.nis] || 0;
    return (
      // Couleurs dans `style`, jamais en attribut SVG : `var()` ne s'y évalue pas partout.
      <path key={c.nis} d={d} strokeWidth={larg} fillRule="evenodd"
        style={{ fill: teinte(n), stroke: 'rgb(var(--gris-300, 203 213 225))', cursor: n ? 'pointer' : 'default' }}
        onMouseEnter={() => setVu({ nom: nom(c), n })} onMouseLeave={() => setVu(null)} onClick={() => setVu({ nom: nom(c), n })}>
        <title>{`${nom(c)} — ${k0(n)} étudiant(s)${n ? ` · ${pc(n, total)}` : ''}`}</title>
      </path>);
  };
  const touchees = Object.keys(parNis).length;
  return (
    <div className="space-y-2">
      <div className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        <svg viewBox={`0 0 ${g.largeur} ${g.hauteur}`} className="w-full h-auto" role="img" aria-label="Carte de Belgique : étudiants par commune">
          {g.communes.map(c => commune(c, c.d, 0.6))}
        </svg>
        <div className="space-y-1">
          <div className="text-mention text-slate-500">Bruxelles, agrandie</div>
          <svg viewBox={`0 0 ${g.bruxelles.largeur} ${g.bruxelles.hauteur}`} className="w-full h-auto" role="img" aria-label="Carte de Bruxelles : étudiants par commune">
            {g.communes.filter(c => c.dbx).map(c => commune(c, c.dbx, 1.2))}
          </svg>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-second text-slate-600">
        <span className="inline-flex items-center gap-1.5">1
          <span className="inline-block h-2.5 w-32 rounded-full" style={{ background: `linear-gradient(to right, ${teinte(1)}, ${teinte(max)})` }} />
          {k0(max)} étudiant(s)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: teinte(0) }} /> aucun</span>
        <span className="text-slate-400">{k0(touchees)} commune(s) concernée(s)</span>
        <span className="ml-auto font-medium text-iip-texte min-h-[1.25rem]">{vu ? `${vu.nom} — ${k0(vu.n)} étudiant(s)${vu.n ? ` · ${pc(vu.n, total)}` : ''}` : 'Survolez ou touchez une commune.'}</span>
      </div>
      <p className="text-mention text-slate-400 m-0">{g.source} ; code postal → commune : liste des codes postaux de bpost.</p>
    </div>);
}

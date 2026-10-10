import { IconChevronRight } from '@tabler/icons-react';
import { reglagesGraphique } from '../lib/design.js';

/**
 * LES GRAPHIQUES DE LA MAISON (3.1.261, Charles, 10 octobre 2026 : « il manque les
 * diagrammes ronds… vérifie »). Chaque forme de donnée a UN composant, réglable :
 * l'anneau (les parts d'un tout), les barres horizontales (des grandeurs à
 * comparer), la répartition empilée (un tout coupé en états), la jauge (une part
 * d'un objectif). Couleurs : séries et part vide (Thèmes et couleurs, --g-*) ;
 * formes : épaisseur de l'anneau, hauteur des barres et des jauges (Formes et
 * composants, --d-*). Un écran qui dessine une donnée à la main est à ramener ici.
 */
const pc = (v, t) => (t ? `${Math.round((v / t) * 100)} %` : '—');
export const SERIES = ['var(--g-1)', 'var(--g-2)', 'var(--g-3)', 'var(--g-4)', 'var(--g-5)', 'var(--g-6)'];

/** L'anneau : les parts d'un tout, la légende avec les pourcentages. */
export function Anneau({ parts, total, centre, taille = 144, legende = true }) {
  const t = total ?? parts.reduce((a, p) => a + p.valeur, 0);
  const ep = (reglagesGraphique().anneau || 40) / 100;
  const R = 56, r = Math.max(4, R * (1 - ep)), C = 70;
  let angle = -Math.PI / 2;
  const arc = p => {
    const a0 = angle, a1 = angle + (t ? (p.valeur / t) * Math.PI * 2 : 0); angle = a1;
    const grand = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (rad, a) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`;
    if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M ${pt(R, a0)} A ${R} ${R} 0 1 1 ${pt(R, a0 + Math.PI)} A ${R} ${R} 0 1 1 ${pt(R, a0)} M ${pt(r, a0)} A ${r} ${r} 0 1 0 ${pt(r, a0 + Math.PI)} A ${r} ${r} 0 1 0 ${pt(r, a0)} Z`;
    return `M ${pt(R, a0)} A ${R} ${R} 0 ${grand} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${grand} 0 ${pt(r, a0)} Z`;
  };
  const vis = parts.filter(p => p.valeur > 0).map((p, i) => ({ ...p, couleur: p.couleur || SERIES[i % SERIES.length] }));
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 140 140" style={{ width: taille, height: taille }} className="flex-none" role="img" aria-label={vis.map(p => `${p.nom} ${pc(p.valeur, t)}`).join(', ')}>
        {!vis.length && <circle cx={C} cy={C} r={(R + r) / 2} style={{ fill: 'none', stroke: 'var(--g-vide)', strokeWidth: R - r }} />}
        {vis.map(p => <path key={p.nom} d={arc(p)} style={{ fill: p.couleur }} fillRule="evenodd" />)}
        {centre != null && <text x={C} y={C + 5} textAnchor="middle" fontSize="15" fontWeight="700" style={{ fill: 'var(--c-texte, #16406A)' }}>{centre}</text>}
      </svg>
      {legende && <ul className="m-0 p-0 list-none space-y-1 text-second min-w-0">
        {vis.map(p => (
          <li key={p.nom} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-pastille flex-none" style={{ background: p.couleur }} />
            <span className="truncate">{p.nom}</span>
            <b className="tabular-nums ml-auto pl-2">{pc(p.valeur, t)}</b>
          </li>))}
      </ul>}
    </div>);
}

/** Des barres horizontales, à l'échelle de la plus grande. */
export function Barres({ lignes, couleur = 'var(--g-1)', format = v => v }) {
  const max = Math.max(1, ...lignes.map(l => l.valeur));
  return (
    <div className="space-y-1.5">
      {lignes.map(l => (
        <div key={l.nom} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-second">
          <span className="truncate">{l.nom}</span>
          <div className="barre-piste"><div className="barre-remplie" style={{ width: `${(l.valeur / max) * 100}%`, background: l.couleur || couleur }} /></div>
          <span className="tabular-nums text-right w-24">{format(l.valeur)}</span>
        </div>))}
    </div>);
}

/** Un tout coupé en parts (états, séries), sur une ligne. */
export function Repartition({ parts, className = 'w-28', title }) {
  const t = parts.reduce((a, p) => a + (p.valeur || 0), 0) || 1;
  return (
    <div className={`jauge ${className}`} title={title || parts.map(p => `${p.valeur} ${p.nom}`).join(' · ')}>
      {parts.map((p, i) => (p.valeur ? <div key={p.nom} style={{ width: `${(p.valeur / t) * 100}%`, background: p.couleur || SERIES[i % SERIES.length] }} /> : null))}
    </div>);
}

/** Une part d'un objectif : 0 à 100 %, la couleur de l'état ou de la série. */
export function Jauge({ valeur = 0, max = 100, etat = null, couleur, className = 'w-full', title }) {
  const p = Math.max(0, Math.min(100, max ? (valeur / max) * 100 : 0));
  const c = couleur || (etat ? `var(--c-${{ reussi: 'reussi', surveiller: 'attente', corriger: 'refuse', faveur: 'faveur', disponible: 'disponible' }[etat] || 'principal'})` : 'var(--g-1)');
  return <div className={`jauge ${className}`} title={title ?? `${Math.round(p)} %`}><div style={{ width: `${p}%`, background: c }} /></div>;
}

/* LE TABLEAU À VOLETS (Charles : « les tableaux, et les tableaux à volets »). Dix-huit
   écrans dépliaient leurs lignes chacun à sa façon. Une ligne qui s'ouvre : le
   chevron dans la première cellule, le détail dessous sur toute la largeur, dans
   le fond des volets (réglable). */
export function TrVolet({ cellules, ouvert, onBascule, detail, colonnes }) {
  return (<>
    <tr className={`ligne-maison ligne-volet ${ouvert ? 'ligne-volet-ouverte' : ''}`} onClick={onBascule}>
      {cellules.map((c, i) => (
        <td key={i} className={`cellule px-3 ${i === 0 ? 'whitespace-nowrap' : ''}`}>
          {i === 0 && <IconChevronRight size={14} className="chevron-volet inline mr-1.5 align-[-2px]" />}{c}
        </td>))}
    </tr>
    {ouvert && <tr className="ligne-detail"><td colSpan={colonnes || cellules.length} className="cellule-detail">{detail}</td></tr>}
  </>);
}

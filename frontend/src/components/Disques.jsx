/* LES DISQUES ET L'INTERRUPTEUR « COMPARER À » (3.5.552, maquette « Une section » validée par Charles le 18 novembre 2026 : « des
   graphiques en disques plutôt que des nombres qui ne parlent pas, triés par type » ; « comparer avec se règle par partie, avec un
   bouton IIP / ASBL à la mode bouton coulissant Apple »).
   Disque : l'anneau plein = la section ; le fin trait gris intérieur = la référence (IIP ou ASBL). Couleurs lues des réglages, posées en
   `style` (un attribut SVG ne lit pas var()). */
import { couleurSerie } from './graphiques.jsx';
import { reglagesGraphique } from '../lib/design.js';

/* MÊME DESSIN QUE LES ANNEAUX DU BAS DE PAGE (3.5.556, Charles : « une unicité dans le design ; mets le cercle IIP/ASBL en jaune
   pour qu'on le voie ») : l'épaisseur de l'anneau vient des réglages des graphiques (`reglagesGraphique().anneau`), la section prend la
   première couleur des séries — la même pour tous les disques —, la référence est un anneau JAUNE (deuxième série) à l'intérieur. */
export function Disque({ nom, valeur, reference = null, nomRef = 'IIP', taille = 84 }) {
  const v = valeur == null ? null : Math.max(0, Math.min(100, Math.round(valeur)));
  const r = reference == null ? null : Math.max(0, Math.min(100, Math.round(reference)));
  const ep = (reglagesGraphique().anneau || 40) / 100;
  const R = 46, ray = R - (R * ep) / 2, epaisseur = R * ep, Ci = 2 * Math.PI * ray;
  const rr = R - R * ep - 5, Cr = 2 * Math.PI * rr;
  return (
    <figure className="m-0 flex flex-col items-center gap-1">
      <svg width={taille} height={taille} viewBox="0 0 100 100" role="img" aria-label={`${nom} : ${v == null ? 'non disponible' : `${v} %`}${r != null ? `, ${nomRef} ${r} %` : ''}`}>
        <circle cx="50" cy="50" r={ray} fill="none" strokeWidth={epaisseur} style={{ stroke: 'var(--g-vide, #E9EDF2)' }} />
        {v != null && v > 0 && <circle cx="50" cy="50" r={ray} fill="none" strokeWidth={epaisseur} transform="rotate(-90 50 50)"
          strokeDasharray={`${(v / 100) * Ci} ${Ci}`} style={{ stroke: couleurSerie(0) }} />}
        {r != null && rr > 4 && <circle cx="50" cy="50" r={rr} fill="none" strokeWidth="3.5" strokeLinecap="round" transform="rotate(-90 50 50)"
          strokeDasharray={`${(r / 100) * Cr} ${Cr}`} style={{ stroke: couleurSerie(1) }} />}
        <text x="50" y="55" textAnchor="middle" fontSize="15" fontWeight="700" style={{ fill: 'var(--c-texte, #16263D)' }}>{v == null ? '—' : `${v} %`}</text>
      </svg>
      <figcaption className="text-center text-second leading-tight">
        <span className="font-semibold text-slate-800">{nom}</span><br />
        <span className="text-mention" style={{ color: r == null ? undefined : 'var(--c-texte)' }}>
          <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ background: r == null ? 'var(--g-vide, #E9EDF2)' : couleurSerie(1) }} />
          {nomRef} : {r == null ? 'non disponible' : `${r} %`}</span>
      </figcaption>
    </figure>);
}

/** Des chiffres en ligne, sans cadre (dans une carte, une tuile encadrée ferait un cadre dans le cadre). */
export function Chiffres({ items }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-slate-100">
      {items.map(([val, lib, prec]) => (
        <div key={lib} className="px-4 py-3">
          <div className="text-xl font-bold tabular-nums" style={{ color: 'var(--c-texte)' }}>{val}</div>
          <div className="text-second text-slate-700">{lib}</div>
          {prec && <div className="text-mention text-slate-500">{prec}</div>}
        </div>))}
    </div>);
}

/** L'interrupteur coulissant « Comparer à » : IIP | ASBL (une partie de page à la fois). */
export function ComparerA({ valeur, onChange, options = [['IIP', 'IIP'], ['ASBL', 'ASBL']] }) {
  return (
    <div className="flex items-center gap-2 flex-none sans-impression">
      <span className="text-mention text-slate-500">Comparer à</span>
      <div role="radiogroup" aria-label="Comparer à" className="inline-flex p-[3px] rounded-full" style={{ background: 'rgb(var(--gris-100, 233 237 242))' }}>
        {options.map(([v, l]) => {
          const on = valeur === v;
          return (
            <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
              className={`px-4 py-1 rounded-full text-second transition-all duration-200 ${on ? 'font-semibold shadow-sm text-white' : 'text-slate-500 hover:text-slate-700'}`}
              style={on ? { background: 'var(--c-principal)' } : undefined}>{l}</button>);
        })}
      </div>
    </div>);
}

/** Une carte de partie : titre, sous-titre, l'interrupteur à droite. */
export function Partie({ titre, sous, droite = null, children, className = '' }) {
  return (
    <section className={`carte overflow-hidden ${className}`}>
      <div className="entete-carte flex items-center justify-between gap-3 flex-wrap px-4 py-3">
        <div className="min-w-0"><div className="titre-carte">{titre}</div>{sous && <div className="text-second text-slate-500">{sous}</div>}</div>
        {droite}
      </div>
      {children}
    </section>);
}

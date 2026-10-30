/**
 * LE LOGO DU MODE D'EMPLOI : UNE CARTE DES CHAPITRES (3.1.487, Charles : « dans le mode d'emploi il se dessine aussi,
 * et chaque étoile devient un des thèmes du mode d'emploi »).
 *
 * Le logo se DESSINE une fois, à la première ouverture du guide — les étoiles, Spica d'abord, puis les liens de la
 * Vierge, puis le L —, en aplat, dans les couleurs de Lucie (pas de néon : c'est l'état final de la page de
 * connexion). Il ne se redessine pas d'un chapitre à l'autre (« tu ne dois pas recréer le logo à chaque fois ») :
 * seule l'étoile du chapitre ouvert change, un cercle qui porte son pictogramme.
 * Chaque chapitre a SON étoile (`ETOILES_GUIDE` : les douze de la figure, puis six autres étoiles réelles de la
 * Vierge, hors des lignes) ; toucher une étoile ouvre son chapitre — au doigt comme à la souris, le titre se lit
 * dans `<title>` au survol et sous le logo pour l'étoile ouverte.
 */
import { useEffect, useState } from 'react';
import { ETOILES, TRAITS, ECLAT, POINTS_L, ETOILES_GUIDE, ECLAT_HORS, positionEtoile } from '../lib/logoVierge.js';

const P = 'var(--c-principal, #16406A)';
const A = 'var(--c-accent, #05B7E6)';

// Le logo (x -9,8 → 60,1 ; y -3,9 → 35,2) dans 260 × 160.
const K = 3.4, X0 = 44.3, Y0 = 28;
const pt = ([x, y]) => [X0 + x * K, Y0 + y * K];
const [LH, LB, LD] = POINTS_L.map(pt);
const CHEMIN_L = `M${LH[0]} ${LH[1]} L${LB[0]} ${LB[1]} L${LD[0]} ${LD[1]}`;

export const STYLE_GUIDE = `
@keyframes gl-pop { 0% { opacity: 0; transform: scale(.2); } 60% { opacity: 1; transform: scale(1.3); } 100% { opacity: 1; transform: scale(1); } }
@keyframes gl-trace { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes gl-allume { 0% { opacity: 0; transform: scale(.3); } 65% { opacity: 1; transform: scale(1.15); } 100% { opacity: 1; transform: scale(1); } }
@keyframes ga-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.gl { transform-box: fill-box; transform-origin: center; }
.gl-nait { opacity: 0; animation: gl-pop .55s cubic-bezier(.32,.72,0,1) forwards; }
.gl-trace { stroke-dasharray: 1; stroke-dashoffset: 1; animation: gl-trace .6s ease-out forwards; }
.gl-allume { animation: gl-allume .6s cubic-bezier(.32,.72,0,1) both; }
.gl-etoile-chapitre { cursor: pointer; }
.gl-etoile-chapitre:hover circle.gl-cible { stroke: ${A}; stroke-width: 1.5; }
.gl-etoile-chapitre:focus-visible { outline: none; }
.gl-etoile-chapitre:focus-visible circle.gl-cible { stroke: ${A}; stroke-width: 2; }
/* Les boutons du texte du guide : la forme de Lucie, en petit, et inertes. */
.bouton.bouton-guide { display: inline-flex; align-items: center; gap: 4px; height: auto; min-height: 0; padding: 1px 8px;
  font-size: 12px; line-height: 1.55; vertical-align: 1px; margin: 1px 1px; pointer-events: none; white-space: nowrap; box-shadow: none; }
.guide-entree { animation: ga-entree .45s cubic-bezier(.32,.72,0,1) both; }
@media (prefers-reduced-motion: reduce) {
  .gl-nait, .gl-trace, .gl-allume, .guide-entree { animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; transform: none !important; }
}`;

// Le dessin ne se fait qu'une fois par visite du guide : les chapitres suivants trouvent le logo déjà posé.
let dejaDessine = false;

export const etoileDuChapitre = rang => ETOILES_GUIDE[Math.max(0, rang) % ETOILES_GUIDE.length];

/**
 * chapitres — [{ id, titre }] dans l'ordre du sommaire ; rang — le chapitre ouvert ; Icone — son pictogramme ;
 * onChoisir(id) — ouvrir un chapitre en touchant son étoile.
 */
export default function IllustrationGuide({ chapitres = [], rang = 0, Icone = null, onChoisir = null }) {
  // Lu à la naissance du composant, marqué après son affichage (le double rendu du mode strict ne le consomme pas).
  const [anime] = useState(() => !dejaDessine);
  useEffect(() => { dejaDessine = true; }, []);
  const d = s => (anime ? { animationDelay: `${s}s` } : { animation: 'none', opacity: 1, strokeDashoffset: 0 });
  const kOuvert = etoileDuChapitre(rang);
  const [ox, oy] = pt(positionEtoile(kOuvert));
  const finDessin = anime ? 2.6 : 0;

  return (
    <svg viewBox="0 0 260 160" className="w-full h-auto" style={{ overflow: 'visible' }} role="group" aria-label="Les chapitres du mode d'emploi">
      {/* Les liens de la Vierge, légers. */}
      <g fill="none" strokeLinecap="round" style={{ stroke: P, strokeOpacity: 0.16, strokeWidth: 1.4 }}>
        {TRAITS.map(([a, b], j) => {
          const [p1, p2] = [pt(ETOILES[a]), pt(ETOILES[b])];
          return <path key={a + b} d={`M${p1[0]} ${p1[1]} L${p2[0]} ${p2[1]}`} pathLength="1" className="gl-trace" style={d(1.2 + j * 0.06)} />;
        })}
      </g>
      {/* Le L de Lucie, en aplat. */}
      <path d={CHEMIN_L} pathLength="1" className="gl-trace" style={{ fill: 'none', stroke: A, strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round', animationDuration: '.9s', ...d(1.9) }} />
      {[LH, LB, LD].map(([x, y], i) => (
        <g key={`L${i}`} className="gl gl-nait" style={d(1.9 + i * 0.4)}>
          <circle cx={x} cy={y} r="7" style={{ fill: A }} />
          <circle cx={x} cy={y} r="2.8" style={{ fill: '#fff', fillOpacity: 0.75 }} />
        </g>))}

      {/* UNE ÉTOILE PAR CHAPITRE : toucher l'étoile ouvre le chapitre. Les étoiles sans chapitre restent de simples points. */}
      {ETOILES_GUIDE.map((k, i) => {
        const [x, y] = pt(positionEtoile(k));
        const e = ECLAT[k] ?? ECLAT_HORS[k] ?? 0.4;
        const ch = chapitres[i];
        const r = 2.6 + e * 2.6;
        const point = <circle cx={x} cy={y} r={r} className="gl-cible" style={{ fill: P, fillOpacity: ch ? 0.55 : 0.25, stroke: 'transparent', strokeWidth: 8 }} />;
        return (
          <g key={k} className="gl gl-nait" style={d(0.15 + i * 0.07)}>
            {ch && onChoisir ? (
              <g className="gl-etoile-chapitre" role="button" tabIndex={0} aria-label={`Chapitre ${i + 1} : ${ch.titre}`}
                onClick={() => onChoisir(ch.id)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onChoisir(ch.id); } }}>
                <title>{`${i + 1}. ${ch.titre}`}</title>
                {/* Une cible plus large que le point, pour le doigt. */}
                <circle cx={x} cy={y} r="11" style={{ fill: 'transparent' }} />
                {point}
              </g>) : point}
          </g>);
      })}

      {/* L'étoile du chapitre ouvert : elle seule change d'un chapitre à l'autre. */}
      <g key={kOuvert} className="gl gl-allume" style={anime ? { animationDelay: `${finDessin}s` } : undefined}>
        <circle cx={ox} cy={oy} r="18" style={{ fill: P, stroke: '#fff', strokeWidth: 3 }} />
        {Icone && <Icone x={ox - 10.5} y={oy - 10.5} width={21} height={21} stroke={1.8} color="#fff" />}
      </g>
    </svg>
  );
}

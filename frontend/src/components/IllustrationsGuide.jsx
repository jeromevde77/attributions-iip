/**
 * L'ILLUSTRATION DU MODE D'EMPLOI, TIRÉE DU LOGO DE LUCIE (3.1.470, Charles : « j'aime beaucoup l'image
 * animée, mais elle serait mieux sur base du logo de Lucie — il y a des lignes et des points que tu
 * pourrais colorer et animer »). Remplace les schémas de 3.1.467.
 *
 * La constellation du logo (App.jsx, `.logo-lucie`) est redessinée en grand : le réseau fin se trace, le
 * « L » se tire à l'accent, puis les points s'allument un à un, chacun dans une teinte de la maison (l'ordre
 * des teintes tourne d'un chapitre à l'autre), un éclat parcourt le L, et le pictogramme du chapitre se pose
 * au pied, dans la teinte du chapitre.
 * Mêmes coordonnées que le logo : on agrandit, on n'invente pas un second dessin. Couleurs du thème
 * (`var(--c-…)`, lues dans `style`) ; tout s'arrête pour qui a demandé moins de mouvement.
 *
 * 3.1.484 (Charles : « tu ne dois pas recréer le logo à chaque fois, mais allumer une étoile différente avec le
 * logo de la thématique dans cette étoile ») : le logo est FIXE — le L et la figure à peine visible, comme dans la
 * barre ; chaque chapitre allume UNE étoile de la Vierge, un cercle qui porte le pictogramme du chapitre.
 */
import { ETOILES, TRAITS, ECLAT, ORDRE_APPARITION, POINTS_L, RESTE } from '../lib/logoVierge.js';

const P = 'var(--c-principal, #16406A)';
const A = 'var(--c-accent, #05B7E6)';
const G = '#D8DCE4';

// Les points et les lignes du logo (viewBox du logo : 0-44), agrandis.
const K = 4.4, X0 = 26.6, Y0 = -3.6;
const pt = ([x, y]) => [X0 + x * K, Y0 + y * K];
const [LH, LB, LD] = POINTS_L.map(pt);
const CHEMIN_L = `M${LH[0]} ${LH[1]} L${LB[0]} ${LB[1]} L${LD[0]} ${LD[1]}`;

export const STYLE_GUIDE = `
@keyframes gl-allume { 0% { opacity: 0; transform: scale(.3); } 65% { opacity: 1; transform: scale(1.15); } 100% { opacity: 1; transform: scale(1); } }
@keyframes gl-onde { 0% { opacity: .45; transform: scale(1); } 100% { opacity: 0; transform: scale(1.9); } }
@keyframes ga-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.gl { transform-box: fill-box; transform-origin: center; }
.gl-allume { animation: gl-allume .6s cubic-bezier(.32,.72,0,1) both; }
.gl-onde { opacity: 0; animation: gl-onde 2.6s ease-out .6s infinite; }
.guide-entree { animation: ga-entree .45s cubic-bezier(.32,.72,0,1) both; }
@media (prefers-reduced-motion: reduce) {
  .gl-allume, .guide-entree { animation: none !important; opacity: 1 !important; transform: none !important; }
  .gl-onde { display: none; }
}`;

/** L'étoile de la Vierge que chaque chapitre allume (les huit tournent sur les dix-huit chapitres). */
export const etoileDuChapitre = rang => ORDRE_APPARITION[Math.max(0, rang) % ORDRE_APPARITION.length];

/**
 * LE LOGO, FIXE, ET L'ÉTOILE DU CHAPITRE.
 * rang  — le rang du chapitre (quelle étoile s'allume)
 * Icone — le pictogramme du chapitre, posé DANS l'étoile allumée
 */
export default function IllustrationGuide({ rang = 0, Icone = null }) {
  const k = etoileDuChapitre(rang);
  const [x, y] = pt(ETOILES[k]);
  return (
    <svg viewBox="0 0 260 160" className="w-full h-auto" style={{ overflow: 'visible' }} role="img" aria-hidden="true">
      {/* La figure, à peine visible, comme dans la barre. */}
      {TRAITS.map(([a, b]) => {
        const [p1, p2] = [pt(ETOILES[a]), pt(ETOILES[b])];
        return <line key={a + b} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]}
          style={{ stroke: P, strokeOpacity: RESTE.trait, strokeWidth: 2, strokeLinecap: 'round' }} />;
      })}
      {Object.keys(ETOILES).map(e => {
        const [ex, ey] = pt(ETOILES[e]);
        return <circle key={e} cx={ex} cy={ey} r={3 + (ECLAT[e] || 0.35) * 3} style={{ fill: P, fillOpacity: RESTE.etoile }} />;
      })}
      {/* Le L de Lucie. */}
      <path d={CHEMIN_L} style={{ fill: 'none', stroke: A, strokeWidth: 6, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      {[LH, LB, LD].map(([lx, ly], i) => (
        <g key={i}>
          <circle cx={lx} cy={ly} r="9" style={{ fill: A }} />
          <circle cx={lx} cy={ly} r="3.4" style={{ fill: '#fff', fillOpacity: 0.75 }} />
        </g>))}
      {/* L'étoile du chapitre : elle seule change d'un chapitre à l'autre. */}
      <g key={k}>
        <circle cx={x} cy={y} r="26" className="gl gl-onde" style={{ fill: P }} />
        <g className="gl gl-allume">
          <circle cx={x} cy={y} r="26" style={{ fill: P, stroke: '#fff', strokeWidth: 3 }} />
          {Icone && <Icone x={x - 16} y={y - 16} width={32} height={32} stroke={1.8} color="#fff" />}
        </g>
      </g>
    </svg>
  );
}

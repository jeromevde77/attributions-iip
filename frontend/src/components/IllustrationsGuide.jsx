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
 */
const P = 'var(--c-principal, #16406A)';
const A = 'var(--c-accent, #05B7E6)';
const OR = 'var(--c-iip_or, #F9B619)';
const OK = 'var(--c-reussi, #3E7D5E)';
const VI = 'var(--c-faveur, #6B46C1)';
const G = '#D8DCE4';

// Les points et les lignes du logo (viewBox du logo : 0-44), agrandis.
const K = 4.4, X0 = 26.6, Y0 = -3.6;
const pt = ([x, y]) => [X0 + x * K, Y0 + y * K];
const NOEUDS = [[5, 14], [12, 6], [23, 8], [36, 14], [16, 23], [23, 32], [12, 32], [42, 32]].map(pt);
const RESEAU = [[[5, 14], [12, 6]], [[5, 14], [16, 23]], [[12, 6], [23, 8]], [[16, 23], [23, 8]],
  [[16, 23], [23, 32]], [[23, 8], [36, 14]], [[36, 14], [42, 32]], [[23, 32], [42, 32]]].map(([a, b]) => [pt(a), pt(b)]);
const [LH, LB, LD] = [pt([12, 6]), pt([12, 32]), pt([42, 32])];
const CHEMIN_L = `M${LH[0]} ${LH[1]} L${LB[0]} ${LB[1]} L${LD[0]} ${LD[1]}`;
const LONG_L = (LB[1] - LH[1]) + (LD[0] - LB[0]);

// Les teintes de la maison ; chaque chapitre les fait tourner à partir de la sienne (toujours la même).
const TEINTES = [A, OR, OK, VI, P];
const rangDe = id => [...String(id || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % TEINTES.length;
// Les extrémités du L gardent l'accent du logo ; les autres points prennent les teintes du chapitre.
const L_POINTS = new Set([1, 6, 7]);

export const STYLE_GUIDE = `
@keyframes gl-trace { from { stroke-dashoffset: var(--long); } to { stroke-dashoffset: 0; } }
@keyframes gl-point { 0% { opacity: 0; transform: scale(.2); } 60% { opacity: 1; transform: scale(1.25); } 100% { opacity: 1; transform: scale(1); } }
@keyframes gl-onde { 0% { opacity: .55; transform: scale(1); } 100% { opacity: 0; transform: scale(2.6); } }
@keyframes gl-eclat { 0% { offset-distance: 0%; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes gl-pose { from { opacity: 0; transform: translateY(8px) scale(.8); } to { opacity: 1; transform: none; } }
@keyframes ga-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.gl { transform-box: fill-box; transform-origin: center; }
.gl-trace { stroke-dasharray: var(--long); stroke-dashoffset: var(--long); animation: gl-trace .9s cubic-bezier(.32,.72,0,1) forwards; }
.gl-point { opacity: 0; animation: gl-point .5s cubic-bezier(.32,.72,0,1) forwards; }
.gl-onde { opacity: 0; animation: gl-onde 2.4s ease-out infinite; }
.gl-eclat { offset-path: path('${CHEMIN_L}'); opacity: 0; animation: gl-eclat 3.2s ease-in-out infinite; }
.gl-pose { opacity: 0; animation: gl-pose .5s cubic-bezier(.32,.72,0,1) forwards; }
.guide-entree { animation: ga-entree .45s cubic-bezier(.32,.72,0,1) both; }
@media (prefers-reduced-motion: reduce) {
  .gl-trace, .gl-point, .gl-pose, .guide-entree { animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; transform: none !important; }
  .gl-onde, .gl-eclat { display: none; }
}`;

const long = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const d = s => ({ animationDelay: `${s}s` });

/**
 * id      — le chapitre (l'ordre de ses teintes)
 * Icone   — le pictogramme du chapitre, posé au pied du L
 */
export default function IllustrationGuide({ id, Icone = null }) {
  const r0 = rangDe(id);
  const teinte = i => TEINTES[(r0 + i) % TEINTES.length];
  const c = teinte(0);
  const couleurPoint = i => (L_POINTS.has(i) ? A : teinte(i));
  const indexDe = ([x, y]) => NOEUDS.findIndex(n => Math.abs(n[0] - x) < .01 && Math.abs(n[1] - y) < .01);
  const allumes = NOEUDS.length;
  const debutPoints = 0.4 + RESEAU.length * 0.08 + 0.7;
  return (
    // La clé redémarre l'animation à chaque chapitre.
    <svg key={id} viewBox="0 0 260 160" className="w-full h-auto" role="img" aria-hidden="true">
      <rect x="1" y="1" width="258" height="158" rx="14" style={{ fill: '#fff', stroke: G }} />

      {/* Le réseau fin se trace. */}
      {RESEAU.map((l, i) => (
        <line key={i} x1={l[0][0]} y1={l[0][1]} x2={l[1][0]} y2={l[1][1]} className="gl-trace"
          style={{ stroke: couleurPoint(indexDe(l[0])), strokeOpacity: 0.55, strokeWidth: 2.4, strokeLinecap: 'round', '--long': long(l), ...d(0.1 + i * 0.08) }} />))}

      {/* Le L de Lucie, à l'accent. */}
      <path d={CHEMIN_L} className="gl-trace"
        style={{ fill: 'none', stroke: A, strokeWidth: 6, strokeLinecap: 'round', strokeLinejoin: 'round', '--long': LONG_L, ...d(0.4 + RESEAU.length * 0.08) }} />

      {/* Les points : tous en gris, puis ceux du chapitre s'allument un à un. */}
      {NOEUDS.map(([x, y], i) => <circle key={`g${i}`} cx={x} cy={y} r="5" style={{ fill: G }} />)}
      {NOEUDS.slice(0, allumes).map(([x, y], i) => (
        <g key={`p${i}`}>
          <circle cx={x} cy={y} r="8" className="gl gl-onde" style={{ fill: couleurPoint(i), ...d(debutPoints + 0.6 + i * 0.3) }} />
          <circle cx={x} cy={y} r={L_POINTS.has(i) ? 9 : 7} className="gl gl-point" style={{ fill: couleurPoint(i), ...d(debutPoints + i * 0.18) }} />
          <circle cx={x} cy={y} r="2.6" className="gl gl-point" style={{ fill: '#fff', fillOpacity: 0.75, ...d(debutPoints + i * 0.18 + 0.1) }} />
        </g>))}

      {/* Un éclat parcourt le L. */}
      <circle r="4" cx="0" cy="0" className="gl-eclat" style={{ fill: '#fff', stroke: A, strokeWidth: 2, ...d(debutPoints + allumes * 0.18) }} />

      {/* Le pictogramme du chapitre, au pied du L. */}
      {Icone && (
        <g className="gl gl-pose" style={d(debutPoints + allumes * 0.18 + 0.2)}>
          <circle cx={LD[0]} cy={LD[1]} r="17" style={{ fill: c }} />
          <Icone x={LD[0] - 10} y={LD[1] - 10} width={20} height={20} stroke={1.8} color="#fff" />
        </g>)}
    </svg>
  );
}

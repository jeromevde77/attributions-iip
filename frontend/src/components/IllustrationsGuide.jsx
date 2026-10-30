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
import { ETOILES, TRAITS, ECLAT, ORDRE_APPARITION, CHRONO } from '../lib/logoVierge.js';

const P = 'var(--c-principal, #16406A)';
const A = 'var(--c-accent, #05B7E6)';
const OR = 'var(--c-iip_or, #F9B619)';
const OK = 'var(--c-reussi, #3E7D5E)';
const VI = 'var(--c-faveur, #6B46C1)';
const G = '#D8DCE4';

// Les points et les lignes du logo (viewBox du logo : 0-44), agrandis.
const K = 4.4, X0 = 26.6, Y0 = -3.6;
const pt = ([x, y]) => [X0 + x * K, Y0 + y * K];
const [LH, LB, LD] = [pt([12, 6]), pt([12, 32]), pt([42, 32])];
const CHEMIN_L = `M${LH[0]} ${LH[1]} L${LB[0]} ${LB[1]} L${LD[0]} ${LD[1]}`;
const LONG_L = (LB[1] - LH[1]) + (LD[0] - LB[0]);

// Les teintes de la maison ; chaque chapitre les fait tourner à partir de la sienne (toujours la même).
const TEINTES = [A, OR, OK, VI, P];
const rangDe = id => [...String(id || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % TEINTES.length;

export const STYLE_GUIDE = `
@keyframes gl-trace { from { stroke-dashoffset: var(--long); } to { stroke-dashoffset: 0; } }
@keyframes gl-point { 0% { opacity: 0; transform: scale(.2); } 60% { opacity: 1; transform: scale(1.25); } 100% { opacity: 1; transform: scale(1); } }
@keyframes gl-onde { 0% { opacity: .55; transform: scale(1); } 100% { opacity: 0; transform: scale(2.6); } }
@keyframes gl-eclat { 0% { offset-distance: 0%; opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { offset-distance: 100%; opacity: 0; } }
@keyframes gl-pose { from { opacity: 0; transform: translateY(8px) scale(.8); } to { opacity: 1; transform: none; } }
@keyframes ga-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.gl { transform-box: fill-box; transform-origin: center; }
.gl-trace { stroke-dasharray: var(--long); stroke-dashoffset: var(--long); animation: gl-trace .9s cubic-bezier(.32,.72,0,1) forwards; }
.gl-trace-lent { animation-duration: ${CHRONO.dureeL}s; animation-timing-function: ease-in-out; }
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
 * LA NAISSANCE DU LOGO (3.1.478, Charles : « une animation qui commence par rien ; puis la première étoile de la
 * constellation apparaît, puis les autres ; puis les liens ; puis le L de Lucie »). Le rythme vient de
 * lib/logoVierge.js (CHRONO), le même que sur la page de connexion.
 *
 * id      — le chapitre (l'ordre de ses teintes)
 * Icone   — le pictogramme du chapitre, posé au pied du L, une fois le L tracé
 */
export default function IllustrationGuide({ id, Icone = null }) {
  const r0 = rangDe(id);
  const teinte = i => TEINTES[(r0 + i) % TEINTES.length];
  const c = teinte(0);
  const t = CHRONO;
  return (
    // La clé redémarre l'animation à chaque chapitre.
    <svg key={id} viewBox="0 0 260 160" className="w-full h-auto" role="img" aria-hidden="true">
      <rect x="1" y="1" width="258" height="158" rx="14" style={{ fill: '#fff', stroke: G }} />

      {/* 2-3. LES ÉTOILES, UNE À UNE — Spica d'abord. */}
      {ORDRE_APPARITION.map((k, i) => {
        const [x, y] = pt(ETOILES[k]); const e = ECLAT[k] || 0.35; const coul = teinte(i);
        return (
          <g key={k}>
            <circle cx={x} cy={y} r={7 + e * 4} className="gl gl-onde" style={{ fill: coul, ...d(t.etoile(i) + 0.4) }} />
            <circle cx={x} cy={y} r={3.5 + e * 4} className="gl gl-point" style={{ fill: coul, ...d(t.etoile(i)) }} />
            <circle cx={x} cy={y} r={1.4 + e * 1.4} className="gl gl-point" style={{ fill: '#fff', fillOpacity: 0.8, ...d(t.etoile(i) + 0.08) }} />
          </g>);
      })}

      {/* 4. LES LIENS DE LA CONSTELLATION, dans l'ordre de la figure. */}
      {TRAITS.map(([a, b], i) => {
        const l = [pt(ETOILES[a]), pt(ETOILES[b])];
        return <line key={a + b} x1={l[0][0]} y1={l[0][1]} x2={l[1][0]} y2={l[1][1]} className="gl-trace"
          style={{ stroke: teinte(ORDRE_APPARITION.indexOf(a)), strokeOpacity: 0.6, strokeWidth: 2.2, strokeLinecap: 'round', '--long': long(l), ...d(t.lien(i)) }} />;
      })}

      {/* 5. LE L DE LUCIE : il se tire du haut vers le pied, puis vers la droite ; ses points s'allument au passage. */}
      <path d={CHEMIN_L} className="gl-trace gl-trace-lent"
        style={{ fill: 'none', stroke: A, strokeWidth: 6, strokeLinecap: 'round', strokeLinejoin: 'round', '--long': LONG_L, ...d(t.L) }} />
      {[[LH, 0], [LB, (LB[1] - LH[1]) / LONG_L], [LD, 1]].map(([[x, y], f], i) => (
        <g key={`L${i}`}>
          <circle cx={x} cy={y} r="9" className="gl gl-point" style={{ fill: A, ...d(t.L + f * t.dureeL) }} />
          <circle cx={x} cy={y} r="3.4" className="gl gl-point" style={{ fill: '#fff', fillOpacity: 0.75, ...d(t.L + f * t.dureeL + 0.08) }} />
        </g>))}

      {/* Puis un éclat parcourt le L, et le pictogramme du chapitre se pose à son pied. */}
      <circle r="4" cx="0" cy="0" className="gl-eclat" style={{ fill: '#fff', stroke: A, strokeWidth: 2, ...d(t.fin) }} />
      {Icone && (
        <g className="gl gl-pose" style={d(t.fin)}>
          <circle cx={LD[0]} cy={LD[1]} r="17" style={{ fill: c }} />
          <Icone x={LD[0] - 10} y={LD[1] - 10} width={20} height={20} stroke={1.8} color="#fff" />
        </g>)}
    </svg>
  );
}

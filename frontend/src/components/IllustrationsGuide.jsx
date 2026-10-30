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
import { ETOILES, TRAITS, ECLAT, ORDRE_APPARITION, CHRONO, DISCRETES, POINTS_L, RESTE } from '../lib/logoVierge.js';

const P = 'var(--c-principal, #16406A)';
const A = 'var(--c-accent, #05B7E6)';
const OR = 'var(--c-iip_or, #F9B619)';
const OK = 'var(--c-reussi, #3E7D5E)';
const VI = 'var(--c-faveur, #6B46C1)';
const G = '#D8DCE4';

// Les points et les lignes du logo (viewBox du logo : 0-44), agrandis.
const K = 4.4, X0 = 26.6, Y0 = -3.6;
const pt = ([x, y]) => [X0 + x * K, Y0 + y * K];
const [LH, LB, LD] = POINTS_L.map(pt);
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
.gl-discret { animation: gl-point .5s cubic-bezier(.32,.72,0,1) forwards, gl-efface 1.4s ease-in-out forwards; }
.gl-discret-trait { animation: gl-trace .9s cubic-bezier(.32,.72,0,1) forwards, gl-efface-trait 1.4s ease-in-out forwards; }
@keyframes gl-efface { to { opacity: ${RESTE.etoile + 0.1}; } }
@keyframes gl-efface-trait { to { opacity: ${RESTE.trait + 0.1}; } }
/* UNE ÉTOILE S'ALLUME PAR ITEM, ET GRANDIT (3.1.480, Charles). */
.gl-allumee { transform-box: fill-box; transform-origin: center; transition: transform .6s cubic-bezier(.32,.72,0,1), opacity .6s; }
@keyframes gl-grandit { 0% { transform: scale(.3); opacity: 0; } 70% { transform: scale(1.5); opacity: 1; } 100% { transform: scale(1.25); opacity: 1; } }
.gl-active { animation: gl-grandit .7s cubic-bezier(.32,.72,0,1) forwards; }
/* L'étoile du point, dans la carte : elle s'allume et grandit. */
@keyframes etoile-grandit { 0% { transform: scale(1); } 55% { transform: scale(1.45) rotate(18deg); } 100% { transform: scale(1.15); } }
.etoile-point { transition: transform .3s; }
.etoile-point-allumee { animation: etoile-grandit .7s cubic-bezier(.32,.72,0,1) forwards; filter: drop-shadow(0 0 4px rgba(249,182,25,.55)); }
.gl-pose { opacity: 0; animation: gl-pose .5s cubic-bezier(.32,.72,0,1) forwards; }
.guide-entree { animation: ga-entree .45s cubic-bezier(.32,.72,0,1) both; }
@media (prefers-reduced-motion: reduce) {
  .gl-trace, .gl-point, .gl-pose, .guide-entree { animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; transform: none !important; }
  .gl-onde, .gl-eclat { display: none; }
  .gl-discret { opacity: ${RESTE.etoile + 0.1} !important; } .gl-discret-trait { opacity: ${RESTE.trait + 0.1} !important; }
  .gl-active { animation: none; transform: scale(1.25); opacity: 1; }
  .etoile-point-allumee { animation: none; transform: scale(1.15); }
}`;

const long = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const d = s => ({ animationDelay: `${s}s` });

/**
 * LA NAISSANCE DU LOGO (3.1.478, Charles : « une animation qui commence par rien ; puis la première étoile de la
 * constellation apparaît, puis les autres ; puis les liens ; puis le L de Lucie »). Depuis 3.1.480, les trois
 * extrémités du L SONT des étoiles de la Vierge, et une fois le L posé, la figure s'efface presque. Puis, au fil de
 * la lecture : UNE ÉTOILE S'ALLUME PAR ITEM, ET GRANDIT (`vus`, `actif` : les points du chapitre déjà parus, et
 * celui qu'on lit). Le rythme vient de lib/logoVierge.js (CHRONO), le même que sur la page de connexion.
 *
 * id      — le chapitre (l'ordre de ses teintes)
 * Icone   — le pictogramme du chapitre, posé au pied du L, une fois le L tracé
 * vus     — indices des points déjà parus ; actif — l'indice du point qu'on lit
 */
export const etoileDuPoint = i => ORDRE_APPARITION[i % ORDRE_APPARITION.length];

export default function IllustrationGuide({ id, Icone = null, vus = [], actif = null }) {
  const r0 = rangDe(id);
  const teinte = i => TEINTES[(r0 + i) % TEINTES.length];
  const c = teinte(0);
  const t = CHRONO;
  const allumees = new Map();
  for (const i of vus) allumees.set(etoileDuPoint(i), i);
  const kActif = actif != null ? etoileDuPoint(actif) : null;
  return (
    // La clé redémarre l'animation à chaque chapitre.
    <svg key={id} viewBox="0 0 260 160" className="w-full h-auto" role="img" aria-hidden="true">
      <rect x="1" y="1" width="258" height="158" rx="14" style={{ fill: '#fff', stroke: G }} />

      {/* LES LIENS DE LA FIGURE, après les étoiles ; ils s'effacent presque une fois le L posé. */}
      {TRAITS.map(([a, b], i) => {
        const l = [pt(ETOILES[a]), pt(ETOILES[b])];
        return <line key={a + b} x1={l[0][0]} y1={l[0][1]} x2={l[1][0]} y2={l[1][1]} className="gl-trace gl-discret-trait"
          style={{ stroke: teinte(ORDRE_APPARITION.indexOf(a)), strokeOpacity: 0.6, strokeWidth: 2.2, strokeLinecap: 'round', '--long': long(l),
            animationDelay: `${t.lien(i)}s, ${t.effacement}s` }} />;
      })}

      {/* LES ÉTOILES, UNE À UNE — Spica d'abord. Celles qui ne sont pas au L s'effacent presque ensuite. */}
      {ORDRE_APPARITION.map((k, i) => {
        const [x, y] = pt(ETOILES[k]); const e = ECLAT[k] || 0.35; const coul = teinte(i);
        const discrete = DISCRETES.includes(k);
        return (
          <g key={k}>
            <circle cx={x} cy={y} r={3.5 + e * 4} className={`gl ${discrete ? 'gl-discret' : 'gl-point'}`}
              style={{ fill: coul, opacity: 0, animationDelay: discrete ? `${t.etoile(i)}s, ${t.effacement}s` : `${t.etoile(i)}s` }} />
          </g>);
      })}

      {/* LE L DE LUCIE : de τ (haut) à Spica (coin), puis à Zaniah (bout) ; ses étoiles grandissent au passage. */}
      <path d={CHEMIN_L} className="gl-trace gl-trace-lent"
        style={{ fill: 'none', stroke: A, strokeWidth: 6, strokeLinecap: 'round', strokeLinejoin: 'round', '--long': LONG_L, ...d(t.L) }} />
      {[[LH, 0], [LB, (LB[1] - LH[1]) / LONG_L], [LD, 1]].map(([[x, y], f], i) => (
        <g key={`L${i}`}>
          <circle cx={x} cy={y} r="9" className="gl gl-point" style={{ fill: A, ...d(t.L + f * t.dureeL) }} />
          <circle cx={x} cy={y} r="3.4" className="gl gl-point" style={{ fill: '#fff', fillOpacity: 0.75, ...d(t.L + f * t.dureeL + 0.08) }} />
        </g>))}

      {/* UNE ÉTOILE PAR ITEM : allumée quand le point a paru, plus grande pour celui qu'on lit. */}
      {[...allumees].map(([k, i]) => {
        const [x, y] = pt(ETOILES[k]); const e = ECLAT[k] || 0.35; const coul = teinte(i);
        const lu = k === kActif;
        return (
          <g key={`a-${k}-${lu ? 'actif' : 'vu'}`}>
            {lu && <circle cx={x} cy={y} r={13 + e * 4} className="gl gl-onde" style={{ fill: coul }} />}
            <circle cx={x} cy={y} r={4.5 + e * 4} className={`gl gl-allumee ${lu ? 'gl-active' : ''}`} style={{ fill: coul }} />
            <circle cx={x} cy={y} r={1.8 + e * 1.4} className={`gl gl-allumee ${lu ? 'gl-active' : ''}`} style={{ fill: '#fff', fillOpacity: 0.85 }} />
          </g>);
      })}

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

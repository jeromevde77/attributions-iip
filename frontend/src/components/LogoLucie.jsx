/** LE LOGO DE LUCIE, EN APLAT (3.1.487) : la Vierge à peine visible, le L par-dessus, « Lucie » à côté. Le même partout — la
 *  barre de Lucie, l'espace enseignant, l'espace étudiant (3.5.086, Charles : « ce n'est pas le bon logo »). */
import { ETOILES, TRAITS, ECLAT, DISCRETES, POINTS_L } from '../lib/logoVierge.js';

export default function LogoLucie({ hauteur = 28, className = 'logo-lucie' }) {
  return (
    <svg className={className} width={Math.round(hauteur * 3.5)} height={hauteur} viewBox="-12 -6 172 49" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Lucie">
      <g stroke="#1B2B4B" strokeOpacity=".12" fill="none" strokeWidth="0.8" strokeLinecap="round">
        {TRAITS.map(([a, b]) => <line key={a + b} x1={ETOILES[a][0]} y1={ETOILES[a][1]} x2={ETOILES[b][0]} y2={ETOILES[b][1]} />)}
      </g>
      {DISCRETES.map(k => (
        <circle key={k} cx={ETOILES[k][0]} cy={ETOILES[k][1]} r={0.9 + (ECLAT[k] || 0.3) * 1.1} fill="#1B2B4B" fillOpacity=".3" />))}
      <path d={`M${POINTS_L[0][0]} ${POINTS_L[0][1]} L${POINTS_L[1][0]} ${POINTS_L[1][1]} L${POINTS_L[2][0]} ${POINTS_L[2][1]}`}
        stroke="#00AACC" strokeOpacity=".85" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {POINTS_L.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={i === 1 ? 3.6 : 3.2} fill="#00AACC" />
          <circle cx={x} cy={y} r={i === 1 ? 1.6 : 1.4} fill="white" fillOpacity=".7" />
        </g>))}
      <text x="66" y="30" fontFamily="'Segoe UI','Helvetica Neue',Arial,sans-serif" fontSize="22" fontWeight="700" letterSpacing="-0.5" fill="#1B2B4B">Lucie</text>
    </svg>
  );
}

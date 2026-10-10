/**
 * LA FÊTE (3.1.271, Charles, 10 octobre 2026 : « un petit fond animé avec des feux
 * d'artifice, des chapeaux d'anniversaire… un truc sympa »). Un calque derrière la
 * carte d'un anniversaire du JOUR : trois bouquets qui éclatent, des confettis qui
 * tombent, deux chapeaux qui se dandinent. Les couleurs sont celles du réglage (logo,
 * états) : la fête suit le thème. Discret — le texte reste lisible — et immobile
 * pour qui a demandé à son système de réduire les animations.
 */
const TEINTES = ['var(--c-iip_or, #F9B619)', 'var(--c-iip_cyan, #05B7E6)', 'var(--c-faveur, #6B46C1)', 'var(--c-reussi, #3E7D5E)', 'var(--c-refuse, #9D4A38)', 'var(--c-principal, #16406A)'];

// Un tirage fixe : la fête ne « saute » pas à chaque rendu.
const alea = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

function Bouquet({ x, y, delai, teinte }) {
  return (
    <span className="fete-bouquet" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delai}s` }}>
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} style={{ '--angle': `${i * 30}deg`, background: teinte, animationDelay: `${delai}s` }} />
      ))}
    </span>
  );
}

function Chapeau({ x, teinte, delai, taille = 22 }) {
  return (
    <svg className="fete-chapeau" viewBox="0 0 24 30" width={taille} height={taille * 1.25}
      style={{ left: `${x}%`, animationDelay: `${delai}s` }} aria-hidden="true">
      <polygon points="12,2 22,28 2,28" style={{ fill: teinte }} />
      <polyline points="7,15 12,13 17,15" style={{ fill: 'none', stroke: 'var(--blanc, #fff)', strokeWidth: 1.6 }} />
      <polyline points="5,21 12,19 19,21" style={{ fill: 'none', stroke: 'var(--blanc, #fff)', strokeWidth: 1.6 }} />
      <circle cx="12" cy="2.5" r="2.5" style={{ fill: 'var(--c-iip_or, #F9B619)' }} />
    </svg>
  );
}

export default function FeteAnniversaire() {
  return (
    <div className="fete-anniversaire" aria-hidden="true">
      <Bouquet x={72} y={30} delai={0} teinte={TEINTES[0]} />
      <Bouquet x={88} y={58} delai={1.1} teinte={TEINTES[1]} />
      <Bouquet x={58} y={66} delai={2.2} teinte={TEINTES[2]} />
      {Array.from({ length: 22 }, (_, i) => (
        <span key={i} className="fete-confetti" style={{
          left: `${Math.round(alea(i, 1) * 100)}%`, background: TEINTES[i % TEINTES.length],
          animationDelay: `${(alea(i, 2) * 4).toFixed(2)}s`, animationDuration: `${(3.5 + alea(i, 3) * 2.5).toFixed(2)}s`,
          '--derive': `${Math.round((alea(i, 4) - 0.5) * 40)}px`, '--tour': `${Math.round(alea(i, 5) * 720)}deg`,
        }} />
      ))}
      <Chapeau x={80} teinte={TEINTES[2]} delai={0} />
      <Chapeau x={92} teinte={TEINTES[1]} delai={0.6} taille={18} />
    </div>
  );
}

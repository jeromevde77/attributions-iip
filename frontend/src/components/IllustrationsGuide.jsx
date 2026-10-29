/**
 * LES ILLUSTRATIONS DU MODE D'EMPLOI (3.1.467, Charles : « un vrai guide illustré et joli, même avec
 * animations » ; choix : des SCHÉMAS ANIMÉS plutôt que des captures). Chaque chapitre a son dessin : il
 * montre le PRINCIPE — un circuit qui avance, un QR qu'on scanne, une liste qu'on coche —, jamais le détail
 * d'un écran, qui changerait à la prochaine version (CLAUDE.md : « ne pas décrire un détail visuel sans
 * capture »). Couleurs du thème (`var(--c-…)`, lues dans `style`, où `var()` s'évalue) ; l'animation se
 * coupe pour qui a demandé moins de mouvement.
 */
const P = 'var(--c-principal, #16406A)';
const A = 'var(--c-accent, #05B7E6)';
const OR = 'var(--c-iip_or, #F9B619)';
const OK = 'var(--c-reussi, #3E7D5E)';
const OC = 'var(--c-attente, #B45309)';
const G = '#D8DCE4';
const G2 = '#EEF1F5';

export const STYLE_GUIDE = `
@keyframes ga-pop { 0%, 8% { opacity: 0; transform: scale(.6); } 18%, 88% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1); } }
@keyframes ga-glisse { 0%, 10% { opacity: 0; transform: translateX(-24px); } 25%, 85% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; } }
@keyframes ga-monte { 0%, 10% { transform: scaleY(0); } 35%, 85% { transform: scaleY(1); } 100% { transform: scaleY(0); } }
@keyframes ga-pouls { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes ga-balaye { 0% { transform: translateY(0); } 50% { transform: translateY(44px); } 100% { transform: translateY(0); } }
@keyframes ga-vole { 0%, 10% { transform: translate(0, 0) rotate(0); opacity: 1; } 60% { transform: translate(120px, -40px) rotate(-12deg); opacity: 1; } 75%, 100% { transform: translate(150px, -10px) scale(.4); opacity: 0; } }
@keyframes ga-tampon { 0%, 40% { transform: translateY(-40px) scale(1.4); opacity: 0; } 55% { transform: translateY(0) scale(1); opacity: 1; } 90% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ga-curseur { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(46px); } }
@keyframes ga-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.ga { transform-box: fill-box; transform-origin: center; }
.ga-pop { animation: ga-pop 6s ease-in-out infinite both; }
.ga-glisse { animation: ga-glisse 6s ease-in-out infinite both; }
.ga-monte { animation: ga-monte 6s ease-in-out infinite both; transform-origin: bottom; }
.ga-pouls { animation: ga-pouls 2.4s ease-in-out infinite; }
.ga-balaye { animation: ga-balaye 2.6s ease-in-out infinite; }
.ga-vole { animation: ga-vole 4s ease-in-out infinite both; }
.ga-tampon { animation: ga-tampon 4s ease-out infinite both; }
.ga-curseur { animation: ga-curseur 3s ease-in-out infinite; }
.guide-entree { animation: ga-entree .45s cubic-bezier(.32,.72,0,1) both; }
@media (prefers-reduced-motion: reduce) {
  .ga, .ga-pop, .ga-glisse, .ga-monte, .ga-pouls, .ga-balaye, .ga-vole, .ga-tampon, .ga-curseur, .guide-entree { animation: none !important; opacity: 1 !important; transform: none !important; }
}`;

const d = s => ({ animationDelay: `${s}s` });
const Cadre = ({ children }) => (
  <svg viewBox="0 0 260 160" className="w-full h-auto" role="img" aria-hidden="true">
    <rect x="1" y="1" width="258" height="158" rx="14" style={{ fill: '#fff', stroke: G }} />
    {children}
  </svg>
);
/* Une fenêtre d'application stylisée : barre, rail, page. */
const Appli = ({ children }) => (<>
  <rect x="14" y="14" width="232" height="16" rx="5" style={{ fill: G2 }} />
  <circle cx="24" cy="22" r="3.5" style={{ fill: A }} />
  <rect x="14" y="36" width="20" height="110" rx="6" style={{ fill: G2 }} />
  {children}
</>);
const Coche = ({ x, y, delai, couleur = OK }) => (
  <g className="ga ga-pop" style={d(delai)}>
    <circle cx={x} cy={y} r="8" style={{ fill: couleur }} />
    <path d={`M${x - 3.5} ${y} l2.5 2.5 l4.5 -5`} style={{ fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' }} />
  </g>
);
const Ligne = ({ x, y, l, c = G, h = 6 }) => <rect x={x} y={y} width={l} height={h} rx={h / 2} style={{ fill: c }} />;

/* Un circuit qui avance : les étapes s'allument l'une après l'autre. */
function Circuit({ etapes = 5 }) {
  const pas = 200 / (etapes - 1);
  return (
    <Cadre>
      <Ligne x={30} y={78} l={200} h={4} c={G} />
      {Array.from({ length: etapes }, (_, i) => (
        <g key={i}>
          <circle cx={30 + i * pas} cy={80} r="13" style={{ fill: '#fff', stroke: G, strokeWidth: 2 }} />
          <g className="ga ga-pop" style={d(i * 0.6)}>
            <circle cx={30 + i * pas} cy={80} r="13" style={{ fill: i === etapes - 1 ? OK : P }} />
            <text x={30 + i * pas} y={84.5} textAnchor="middle" style={{ fill: '#fff', fontSize: 12, fontWeight: 700 }}>{i + 1}</text>
          </g>
          <Ligne x={14 + i * pas} y={104} l={32} h={5} c={G2} />
        </g>))}
      <g className="ga ga-pop" style={d(etapes * 0.6)}>
        <rect x="88" y="124" width="84" height="20" rx="10" style={{ fill: OK }} />
        <text x="130" y="138" textAnchor="middle" style={{ fill: '#fff', fontSize: 10, fontWeight: 700 }}>pièce signée</text>
      </g>
    </Cadre>
  );
}

const DESSINS = {
  ensemble: () => (
    <Cadre>
      {[0, 1, 2, 3, 4, 5].map(i => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2, x = 130 + Math.cos(a) * 58, y = 80 + Math.sin(a) * 50;
        return (
          <g key={i} className="ga ga-pop" style={d(i * 0.35)}>
            <line x1="130" y1="80" x2={x} y2={y} style={{ stroke: G, strokeWidth: 2 }} />
            <circle cx={x} cy={y} r="13" style={{ fill: [A, OR, OK, P, A, OR][i] }} />
          </g>);
      })}
      {/* Le centre se dessine APRÈS les rayons : sinon ils barrent le nom. */}
      <circle cx="130" cy="80" r="26" style={{ fill: P }} />
      <text x="130" y="85" textAnchor="middle" style={{ fill: '#fff', fontSize: 13, fontWeight: 700 }}>Lucie</text>
    </Cadre>),
  demarrage: () => (
    <Cadre><Appli>
      {[0, 1, 2, 3].map(i => <rect key={i} x="19" y={46 + i * 22} width="10" height="10" rx="3" style={{ fill: G }} />)}
      <rect className="ga ga-balaye" x="17" y="44" width="14" height="14" rx="4" style={{ fill: 'none', stroke: A, strokeWidth: 2 }} />
      <Ligne x={46} y={44} l={110} h={9} c={P} />
      <Ligne x={46} y={64} l={180} /><Ligne x={46} y={78} l={150} /><Ligne x={46} y={92} l={165} />
      <rect className="ga ga-pop" style={{ fill: OK, ...d(.8) }} x="160" y="118" width="70" height="20" rx="8" />
    </Appli></Cadre>),
  accueil: () => (
    <Cadre><Appli>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <g key={i} className="ga ga-pop" style={d(i * 0.3)}>
          <rect x={46 + (i % 3) * 66} y={44 + Math.floor(i / 3) * 52} width="58" height="42" rx="6" style={{ fill: '#fff', stroke: G }} />
          <rect x={46 + (i % 3) * 66} y={44 + Math.floor(i / 3) * 52} width="4" height="42" style={{ fill: [P, OK, OC, A, OR, P][i] }} />
          <Ligne x={56 + (i % 3) * 66} y={54 + Math.floor(i / 3) * 52} l={22} h={8} c={P} />
          <Ligne x={56 + (i % 3) * 66} y={70 + Math.floor(i / 3) * 52} l={38} h={4} />
        </g>))}
    </Appli></Cadre>),
  etudiants: () => (
    <Cadre><Appli>
      {[0, 1, 2, 3, 4].map(i => (
        <g key={i}>
          <rect x="44" y={42 + i * 21} width="12" height="12" rx="3" style={{ fill: '#fff', stroke: G, strokeWidth: 1.5 }} />
          <g className="ga ga-pop" style={d(0.4 + i * 0.35)}>
            <rect x="44" y={42 + i * 21} width="12" height="12" rx="3" style={{ fill: P }} />
            <path d={`M47 ${48 + i * 21} l2 2 l4 -4`} style={{ fill: 'none', stroke: '#fff', strokeWidth: 1.6 }} />
          </g>
          <Ligne x={64} y={45 + i * 21} l={60} h={6} c={P} />
          <Ligne x={130} y={45 + i * 21} l={40} />
          {[0, 1, 2].map(k => <rect key={k} x={180 + k * 18} y={43 + i * 21} width="15" height="10" rx="2" style={{ fill: [OR, A, P][k], opacity: .8 }} />)}
        </g>))}
    </Appli></Cadre>),
  pae: () => (
    <Cadre>
      <text x="40" y="26" style={{ fill: P, fontSize: 10, fontWeight: 700 }}>UE disponibles</text>
      <text x="168" y="26" style={{ fill: P, fontSize: 10, fontWeight: 700 }}>Programme</text>
      <rect x="152" y="34" width="94" height="114" rx="10" style={{ fill: G2 }} />
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <rect x="20" y={36 + i * 28} width="94" height="20" rx="6" style={{ fill: '#fff', stroke: G }} />
          <g className="ga ga-glisse" style={d(i * 0.5)}>
            <rect x="160" y={42 + i * 26} width="78" height="20" rx="6" style={{ fill: '#fff', stroke: [OR, A, P, OK][i], strokeWidth: 2 }} />
            <Ligne x={168} y={49 + i * 26} l={40} c={[OR, A, P, OK][i]} />
          </g>
        </g>))}
    </Cadre>),
  valorisation: () => <Circuit etapes={5} />,
  amenagements: () => <Circuit etapes={4} />,
  procedures: () => <Circuit etapes={4} />,
  deliberation: () => (
    <Cadre>
      {[0, 1, 2, 3].map(r => (
        <g key={r}>
          <Ligne x={18} y={30 + r * 28} l={56} c={P} />
          {[0, 1, 2].map(c => {
            const ko = (r === 1 && c === 2) || (r === 3 && c === 0);
            return <g key={c}><rect x={84 + c * 34} y={23 + r * 28} width="28" height="18" rx="4" style={{ fill: ko ? OC : G2 }} />
              <text x={98 + c * 34} y={35.5 + r * 28} textAnchor="middle" style={{ fill: ko ? '#fff' : P, fontSize: 9, fontWeight: 600 }}>{ko ? '8' : [14, 12, 16][c]}</text></g>;
          })}
          <g className="ga ga-pop" style={d(0.6 + r * 0.45)}>
            <rect x="196" y={23 + r * 28} width="50" height="18" rx="9" style={{ fill: r === 1 || r === 3 ? OC : OK }} />
            <text x="221" y={35.5 + r * 28} textAnchor="middle" style={{ fill: '#fff', fontSize: 8.5, fontWeight: 700 }}>{r === 1 || r === 3 ? 'Ajourné' : 'Réussi'}</text>
          </g>
        </g>))}
    </Cadre>),
  diplomes: () => (
    <Cadre>
      <rect x="50" y="22" width="160" height="116" rx="6" style={{ fill: '#fff', stroke: OR, strokeWidth: 2 }} />
      <Ligne x={80} y={40} l={100} h={9} c={P} />
      <Ligne x={70} y={60} l={120} /><Ligne x={70} y={72} l={110} /><Ligne x={70} y={84} l={116} />
      <g className="ga ga-tampon">
        <circle cx="178" cy="112" r="17" style={{ fill: 'none', stroke: P, strokeWidth: 3 }} />
        <circle cx="178" cy="112" r="9" style={{ fill: OR }} />
      </g>
    </Cadre>),
  editions: () => (
    <Cadre>
      <rect x="28" y="40" width="64" height="84" rx="5" style={{ fill: '#fff', stroke: G, strokeWidth: 1.5 }} />
      <Ligne x={38} y={52} l={36} h={7} c={P} /><Ligne x={38} y={68} l={44} /><Ligne x={38} y={80} l={40} /><Ligne x={38} y={92} l={44} />
      <g className="ga ga-vole" style={{ transformOrigin: '60px 80px' }}>
        <path d="M60 70 l30 12 l-30 12 l6 -12 z" style={{ fill: A }} />
      </g>
      <rect x="190" y="52" width="52" height="38" rx="5" style={{ fill: G2, stroke: P, strokeWidth: 1.5 }} />
      <path d="M190 54 l26 18 l26 -18" style={{ fill: 'none', stroke: P, strokeWidth: 1.5 }} />
    </Cadre>),
  mescours: () => (
    <Cadre>
      <rect x="24" y="26" width="104" height="104" rx="8" style={{ fill: '#fff', stroke: G }} />
      {Array.from({ length: 49 }, (_, i) => ((i * 37) % 7 < 3 || [0, 6, 42, 48].includes(i)) && (
        <rect key={i} x={34 + (i % 7) * 12} y={36 + Math.floor(i / 7) * 12} width="10" height="10" rx="1.5" style={{ fill: P }} />))}
      <rect className="ga ga-balaye" x="28" y="34" width="96" height="3" rx="1.5" style={{ fill: A }} />
      <rect x="168" y="30" width="62" height="104" rx="12" style={{ fill: '#fff', stroke: P, strokeWidth: 2 }} />
      <rect x="176" y="44" width="46" height="70" rx="4" style={{ fill: G2 }} />
      <Coche x={199} y={79} delai={0.6} />
      <text className="ga ga-pop" x="199" y="104" textAnchor="middle" style={{ fill: OK, fontSize: 9, fontWeight: 700, animationDelay: '.9s' }}>présent</text>
    </Cadre>),
  cep: () => (
    <Cadre>
      <rect x="40" y="22" width="180" height="118" rx="8" style={{ fill: '#fff', stroke: G }} />
      <rect x="40" y="22" width="180" height="20" rx="8" style={{ fill: P }} />
      {Array.from({ length: 15 }, (_, i) => (
        <g key={i}>
          <rect x={52 + (i % 5) * 33} y={52 + Math.floor(i / 5) * 28} width="26" height="20" rx="4" style={{ fill: G2 }} />
          {i % 4 !== 3 && <Coche x={65 + (i % 5) * 33} y={62 + Math.floor(i / 5) * 28} delai={i * 0.18} />}
        </g>))}
    </Cadre>),
  personnel: () => (
    <Cadre>
      {[0, 1, 2, 3].map(i => (
        <g key={i} className="ga ga-pop" style={d(i * 0.4)}>
          <circle cx={50 + i * 54} cy={64} r="16" style={{ fill: [P, A, OR, OK][i] }} />
          <rect x={30 + i * 54} y={86} width="40" height="22" rx="11" style={{ fill: [P, A, OR, OK][i], opacity: .55 }} />
          <Ligne x={34 + i * 54} y={118} l={32} />
        </g>))}
    </Cadre>),
  organisation: () => (
    <Cadre>
      {[0, 1, 2, 3, 4].map(i => <line key={i} x1={40 + i * 46} y1="20" x2={40 + i * 46} y2="144" style={{ stroke: G2, strokeWidth: 1 }} />)}
      {[[30, 120, P], [70, 90, A], [110, 110, OR], [40, 170, OK]].map(([x, l, c], i) => (
        <rect key={i} className="ga ga-glisse" style={{ fill: c, ...d(i * 0.45) }} x={x} y={32 + i * 28} width={l} height={16} rx="8" />))}
    </Cadre>),
  gestion: () => (
    <Cadre>
      <line x1="30" y1="134" x2="236" y2="134" style={{ stroke: G, strokeWidth: 2 }} />
      {[60, 90, 50, 110, 80, 100].map((h, i) => (
        <rect key={i} className="ga ga-monte" style={{ fill: i === 3 ? OR : P, ...d(i * 0.25) }} x={42 + i * 32} y={134 - h} width="20" height={h} rx="4" />))}
    </Cadre>),
  documentation: () => (
    <Cadre>
      <rect x="60" y="20" width="96" height="120" rx="6" style={{ fill: '#fff', stroke: G, strokeWidth: 1.5 }} />
      <Ligne x={72} y={34} l={60} h={8} c={P} />
      {[0, 1, 2, 3, 4, 5].map(i => <Ligne key={i} x={72} y={52 + i * 12} l={64 - (i % 3) * 8} />)}
      <g className="ga ga-pop" style={d(1)}>
        <rect x="140" y="104" width="86" height="24" rx="12" style={{ fill: OK }} />
        <text x="183" y="120" textAnchor="middle" style={{ fill: '#fff', fontSize: 9.5, fontWeight: 700 }}>✓ lu et confirmé</text>
      </g>
    </Cadre>),
  config: () => (
    <Cadre>
      {[0, 1, 2].map(i => (
        <g key={i}>
          <Ligne x={40} y={44 + i * 36} l={180} h={6} c={G2} />
          <circle className="ga ga-curseur" cx={70 + i * 30} cy={47 + i * 36} r="9" style={{ fill: [P, A, OR][i], animationDelay: `${i * 0.5}s` }} />
        </g>))}
    </Cadre>),
};

export default function IllustrationGuide({ id }) {
  const Dessin = DESSINS[id] || DESSINS.ensemble;
  return <Dessin />;
}

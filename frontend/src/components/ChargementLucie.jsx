import LogoLucie from './LogoLucie.jsx';

/* LE CHARGEMENT SE VOIT (3.5.208, Charles : « quand l'espace prof ou étudiant charge, le logo de Lucie au centre avec des petites
   étoiles bleues qui étincellent, sinon c'est long et on pense que ça plante »). Le logo au centre, des étoiles bleues autour qui
   scintillent chacune à son rythme (comme la page de connexion), et un mot. `pleine` : toute la page (l'ouverture d'un espace) ;
   sinon, la place d'un écran. Les animations se coupent pour qui les refuse (prefers-reduced-motion). */
const ETOILES = [
  [8, 22, 7, 0], [20, 78, 5, .5], [33, 12, 4, 1.1], [44, 88, 6, .3], [58, 18, 5, 1.6], [70, 82, 7, .8],
  [82, 30, 4, 1.3], [90, 70, 5, .2], [15, 50, 4, 1.9], [86, 50, 6, .7], [50, 6, 4, 1.4], [52, 94, 5, 2.1],
];
export default function ChargementLucie({ pleine = false, texte = 'Chargement…' }) {
  return (
    <div className={`grid place-items-center ${pleine ? 'min-h-screen' : 'py-16'}`} style={pleine ? { background: 'var(--page-fond)' } : undefined}
      role="status" aria-live="polite">
      <style>{`
        @keyframes lucie-scintille { 0%, 100% { opacity: .15; transform: scale(.6) rotate(0deg); } 50% { opacity: 1; transform: scale(1.15) rotate(45deg); } }
        @keyframes lucie-respire { 0%, 100% { opacity: .85; } 50% { opacity: 1; } }
        .lucie-etoile { position: absolute; color: var(--c-accent, var(--c-disponible)); animation: lucie-scintille 2.4s ease-in-out infinite; }
        .lucie-logo-respire { animation: lucie-respire 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .lucie-etoile, .lucie-logo-respire { animation: none; opacity: .7; } }
      `}</style>
      <div className="relative w-64 h-40 grid place-items-center">
        {ETOILES.map(([x, y, t, d], i) => (
          <svg key={i} className="lucie-etoile" viewBox="0 0 20 20" width={t * 2.4} height={t * 2.4}
            style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s`, animationDuration: `${2 + (i % 4) * .45}s` }} aria-hidden="true">
            <path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill="currentColor" />
          </svg>))}
        <div className="lucie-logo-respire"><LogoLucie hauteur={44} className="" /></div>
      </div>
      <div className="text-second text-slate-500 -mt-2">{texte}</div>
    </div>);
}

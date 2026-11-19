/* LA TAILLE DE L'ÉCRAN, POUR PROJETER (3.5.582 ; remplace la loupe de 3.5.581 — Charles : « ce que je veux, c'est que tu changes
 * la taille de la mise en page » ; tranché : tout l'écran plus grand). Un bouton de la barre du haut ouvre le choix : 100 % à 200 %.
 * Toute la page grandit et se remet en page ; on défile normalement. Raccourcis : Alt + « + », Alt + « − », Alt + 0 (100 %).
 * Le choix reste sur cet appareil. */
import { useEffect, useRef, useState } from 'react';
import { IconZoomIn } from '@tabler/icons-react';
import { TAILLES, tailleGardee, poserTaille } from '../lib/tailleEcran.js';

export default function Loupe() {
  const [taille, setTaille] = useState(tailleGardee);
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef(null);
  const choisir = t => setTaille(poserTaille(t));

  useEffect(() => {
    const clavier = e => {
      if (!e.altKey) return;
      const i = TAILLES.indexOf(tailleGardee());
      if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') { e.preventDefault(); choisir(TAILLES[Math.min(TAILLES.length - 1, i + 1)]); }
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-') { e.preventDefault(); choisir(TAILLES[Math.max(0, i - 1)]); }
      else if (e.code === 'Digit0' || e.code === 'Numpad0') { e.preventDefault(); choisir(100); }
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, []);

  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = e => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    const echap = e => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('pointerdown', dehors); document.removeEventListener('keydown', echap); };
  }, [ouvert]);

  return (
    <div ref={boite} className="relative">
      <button type="button" onClick={() => setOuvert(o => !o)} aria-expanded={ouvert} aria-label="Taille de l’écran"
        title="Taille de l’écran, pour projeter (Alt + « + » / « − »)"
        className="objet-barre objet-barre-icone" style={taille !== 100 ? { width: 'auto', paddingInline: 8 } : undefined}>
        <IconZoomIn size={16} />{taille !== 100 && <span className="ml-1 text-second font-semibold tabular-nums">{taille} %</span>}
      </button>
      {ouvert && (
        <div role="menu" className="absolute right-0 top-full mt-2 z-50 w-56 rounded-carte border border-[rgb(var(--gris-200))] shadow-flottant p-3"
          style={{ background: 'var(--c-fond_carte, #fff)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--gris-500))] mb-2">Taille de l’écran</div>
          <div className="grid grid-cols-3 gap-1">
            {TAILLES.map(t => (
              <button key={t} type="button" role="menuitemradio" aria-checked={taille === t} onClick={() => choisir(t)}
                className={`bouton !px-0 justify-center tabular-nums ${taille === t ? 'bouton-fort' : ''}`}>{t} %</button>))}
          </div>
          <p className="text-mention text-[rgb(var(--gris-500))] mt-2 leading-snug">Toute la page grandit, pour la projection. Gardé sur cet appareil. Alt + « + » / « − », Alt + 0.</p>
        </div>)}
    </div>);
}

/* LA LOUPE DE PROJECTION (3.5.581, Charles, 19 novembre 2026 : « quand je projette mon écran, j'ai besoin de faire des zooms » ;
 * tranché : sur n'importe quel écran de Lucie). Un bouton de la barre du haut (ou Alt + Z) : l'écran se grossit AUTOUR DE LA
 * SOURIS — le point sous le pointeur reste sous le pointeur, ses alentours s'agrandissent, et la zone suit la souris. « + » et
 * « − » (ou Alt + molette) règlent le grossissement de ×1,5 à ×4 ; Échap ou le bouton referment. Rien n'est réécrit : un `transform`
 * posé sur la racine de l'application le temps du zoom, retiré à la sortie. Les clics continuent de fonctionner pendant le zoom. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconZoomIn, IconZoomOut, IconX } from '@tabler/icons-react';

const NIVEAUX = [1.5, 2, 2.5, 3, 4];

export default function Loupe() {
  const [actif, setActif] = useState(false);
  const [rang, setRang] = useState(1);   // ×2 par défaut
  const dernier = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const niveau = NIVEAUX[rang];

  // Alt + Z, partout ; Échap et + / − pendant le zoom.
  useEffect(() => {
    const clavier = e => {
      if (e.altKey && (e.key === 'z' || e.key === 'Z' || e.code === 'KeyZ')) { e.preventDefault(); setActif(a => !a); return; }
      if (!actif) return;
      const champ = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
      if (e.key === 'Escape') { setActif(false); return; }
      if (champ) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); setRang(r => Math.min(NIVEAUX.length - 1, r + 1)); }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); setRang(r => Math.max(0, r - 1)); }
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [actif]);

  // Le grossissement suit la souris : l'origine de la transformation est le point sous le pointeur.
  useEffect(() => {
    const racine = document.getElementById('root');
    if (!racine) return undefined;
    if (!actif) { racine.style.transform = ''; racine.style.transformOrigin = ''; racine.style.transition = ''; return undefined; }
    const poser = (x, y) => {
      dernier.current = { x, y };
      racine.style.transformOrigin = `${x + window.scrollX - racine.offsetLeft}px ${y + window.scrollY - racine.offsetTop}px`;
    };
    racine.style.transition = 'transform 160ms cubic-bezier(.32,.72,0,1)';
    racine.style.transform = `scale(${niveau})`;
    poser(dernier.current.x, dernier.current.y);
    const bouge = e => poser(e.clientX, e.clientY);
    const touche = e => { const t = e.touches?.[0]; if (t) poser(t.clientX, t.clientY); };
    const molette = e => { if (!e.altKey) return; e.preventDefault(); setRang(r => Math.max(0, Math.min(NIVEAUX.length - 1, r + (e.deltaY < 0 ? 1 : -1)))); };
    window.addEventListener('mousemove', bouge);
    window.addEventListener('touchmove', touche, { passive: true });
    window.addEventListener('wheel', molette, { passive: false });
    return () => {
      window.removeEventListener('mousemove', bouge);
      window.removeEventListener('touchmove', touche);
      window.removeEventListener('wheel', molette);
      racine.style.transform = ''; racine.style.transformOrigin = ''; racine.style.transition = '';
    };
  }, [actif, niveau]);

  return (<>
    <button type="button" onClick={() => setActif(a => !a)} aria-pressed={actif} aria-label="Loupe de projection"
      title="Loupe de projection : grossir l’écran autour de la souris (Alt + Z)"
      className="objet-barre objet-barre-icone"><IconZoomIn size={16} /></button>
    {/* Le bandeau vit HORS de la racine grossie : il reste lisible et à sa place. */}
    {actif && createPortal(
      <div role="toolbar" aria-label="Loupe" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-1 rounded-full px-2 py-1 text-white text-second shadow-flottant"
        style={{ background: 'rgb(var(--c-principal-rgb, 22 64 106) / .92)' }}>
        <button type="button" className="p-1.5 rounded-full hover:bg-white/15 disabled:opacity-40" aria-label="Moins" disabled={rang === 0}
          onClick={() => setRang(r => Math.max(0, r - 1))}><IconZoomOut size={16} /></button>
        <span className="tabular-nums font-semibold w-10 text-center">×{String(niveau).replace('.', ',')}</span>
        <button type="button" className="p-1.5 rounded-full hover:bg-white/15 disabled:opacity-40" aria-label="Plus" disabled={rang === NIVEAUX.length - 1}
          onClick={() => setRang(r => Math.min(NIVEAUX.length - 1, r + 1))}><IconZoomIn size={16} /></button>
        <span className="px-2 opacity-80 whitespace-nowrap hidden sm:inline">la zone suit la souris · Échap pour sortir</span>
        <button type="button" className="p-1.5 rounded-full hover:bg-white/15" aria-label="Fermer la loupe" onClick={() => setActif(false)}><IconX size={16} /></button>
      </div>, document.body)}
  </>);
}

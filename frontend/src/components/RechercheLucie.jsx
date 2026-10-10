import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconSearch, IconCornerDownLeft } from '@tabler/icons-react';
import { chercherDestinations } from '../lib/destinations.js';

/**
 * « OÙ ALLER ? » — la recherche des endroits de Lucie, comme le « Rechercher »
 * de Word (Charles, 3 octobre 2026). Une loupe dans la barre du haut, ou ⌘K /
 * Ctrl+K partout ; on tape « PAE » et Lucie liste les écrans et les outils qui
 * en parlent. Flèches et Entrée pour y aller. L'index : lib/destinations.js.
 */
export default function RechercheLucie() {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const champ = useRef(null);
  const navigate = useNavigate();
  const lieu = useLocation();

  useEffect(() => {
    const touche = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOuvert(o => !o); }
      if (e.key === 'Escape') setOuvert(false);
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);
  useEffect(() => { if (ouvert) { setQ(''); setI(0); setTimeout(() => champ.current?.focus(), 0); } }, [ouvert]);

  const res = chercherDestinations(q);
  const aller = d => {
    setOuvert(false);
    if (!d) return;
    if (d.outil) { try { sessionStorage.setItem('lucie.outil', d.outil); } catch { /* */ } }
    const [chemin] = d.chemin.split('?');
    // Même écran, autre rubrique ou outil : l'écran ne relit son adresse qu'à
    // l'ouverture — on le recharge plutôt que d'y arriver sans rien changer.
    if (chemin === lieu.pathname) window.location.assign(d.chemin);
    else navigate(d.chemin);
  };

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} aria-label="Rechercher dans Lucie"
        title="Où aller ? — rechercher un écran ou un outil (⌘K)"
        className="objet-barre objet-barre-icone">
        <IconSearch size={16} />
      </button>
      {ouvert && createPortal(
        <div className="fixed inset-0 z-[80] voile-fenetre" onMouseDown={() => setOuvert(false)}>
          <div className="mx-auto mt-[12vh] w-[min(640px,92vw)] bg-white rounded-fenetre shadow-dessus overflow-hidden"
            onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 border-b border-slate-200">
              <IconSearch size={18} className="text-slate-400" />
              <input ref={champ} value={q} placeholder="Où aller ? — PAE, délibération, attributions, couleurs…"
                onChange={e => { setQ(e.target.value); setI(0); }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(x + 1, res.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(x - 1, 0)); }
                  if (e.key === 'Enter') aller(res[i]);
                }}
                className="flex-1 h-12 text-base outline-none bg-transparent" style={{ border: 0, boxShadow: "none" }} />
              <span className="text-xs text-slate-400 border border-slate-200 rounded px-1.5">Échap</span>
            </div>
            <div className="max-h-[50vh] overflow-auto py-1">
              {!q.trim() && <p className="px-4 py-3 text-second text-slate-500">Tapez ce que vous cherchez : un mot suffit (« PAE », « diplôme », « VA », « horaire »…).</p>}
              {q.trim() && !res.length && <p className="px-4 py-3 text-second text-slate-500">Rien ne répond à « {q} ».</p>}
              {res.map((d, k) => (
                <button key={`${d.chemin}|${d.outil || ''}`} type="button" onMouseEnter={() => setI(k)} onClick={() => aller(d)}
                  className={`w-full text-left px-4 py-2 flex items-center gap-3 ${k === i ? 'bg-slate-100' : ''}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-iip-texte font-medium truncate">{d.label}</span>
                    <span className="block text-xs text-slate-500">{d.axe}</span>
                  </span>
                  {k === i && <IconCornerDownLeft size={15} className="text-slate-400 flex-none" />}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body)}
    </>
  );
}

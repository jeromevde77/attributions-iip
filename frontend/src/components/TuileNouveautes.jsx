import { useEffect, useRef, useState } from 'react';
import { IconSparkles, IconChevronRight } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders, getUser } from '../lib/api.js';

/**
 * LES NOUVEAUTÉS, SUR LE BUREAU (3.1.283, Charles, 11 octobre 2026 : « comme il y en a
 * beaucoup, une tuile New / info ; quand on clique dessus, les gens tombent sur ce que tu
 * as écrit »). Le guide vit dans Lucie (`backend/assets/nouveautes/<édition>.html`, servi par
 * `GET /api/documentation/nouveautes/<édition>` qui RETIRE ce qui ne concerne pas le rôle de la
 * personne — 3.1.460, « un prof ne doit pas savoir qu'une amélioration qui ne le concerne pas a
 * été faite ») ; la fenêtre
 * l'affiche — le serveur interdit les cadres (X-Frame-Options), on l'insère donc, styles
 * limités à `.guide`, couleurs du thème. « Nouveau » tant que la personne ne l'a pas ouvert
 * (mémoire de ce navigateur). Une nouvelle édition : changer EDITION et le fichier.
 */
const EDITION = '2026-11';
// Le guide d'une édition s'enrichit : la révision rallume « Nouveau » sans changer de fichier.
const REVISION = `${EDITION}.459`;
const DEPUIS = 'depuis le jeudi 8 octobre';
const cleVu = () => `lucie.nouveautes.vu.${getUser()?.id || 'x'}`;

export default function TuileNouveautes() {
  const [vu, setVu] = useState(() => { try { return localStorage.getItem(cleVu()) === REVISION; } catch { return false; } });
  const [ouvert, setOuvert] = useState(false);
  const [html, setHtml] = useState('');
  const zone = useRef(null);

  async function ouvrir() {
    setOuvert(true);
    try { localStorage.setItem(cleVu(), REVISION); } catch { /* navigateur privé */ }
    setVu(true);
    if (!html) {
      const t = await fetch(`/api/documentation/nouveautes/${EDITION}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.text() : '')).catch(() => '');
      const d = new DOMParser().parseFromString(t, 'text/html');
      const styles = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n')
        .replace(/body\s*\{[^}]*\}/, '')                        // le fond de la page seule n'entre pas dans Lucie
        + '.guide .filtres{position:static}';             // dans une fenêtre, la barre collée laissait le texte passer au-dessus
      setHtml(`<style>${styles}</style>${d.querySelector('.guide')?.outerHTML || '<p>Guide introuvable.</p>'}`);
    }
  }

  // Les filtres par public : le script du fichier ne s'exécute pas une fois inséré, on les branche ici.
  useEffect(() => {
    const racine = zone.current;
    if (!ouvert || !html || !racine) return;
    const boutons = [...racine.querySelectorAll('.filtres button')];
    const articles = [...racine.querySelectorAll('.nouveau')];
    const titres = [...racine.querySelectorAll('main > h2')];
    const filtrer = pub => {
      boutons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.public === pub)));
      articles.forEach(a => { a.hidden = pub !== 'tous' && !a.dataset.pour.split(' ').includes(pub); });
      titres.forEach(h => {
        let el = h.nextElementSibling, visible = false;
        while (el && el.tagName !== 'H2' && !el.classList.contains('avenir')) { if (el.classList.contains('nouveau') && !el.hidden) visible = true; el = el.nextElementSibling; }
        h.hidden = !visible;
        if (h.nextElementSibling?.classList.contains('intro')) h.nextElementSibling.hidden = !visible;
      });
    };
    const ecouteurs = boutons.map(b => { const f = () => filtrer(b.dataset.public); b.addEventListener('click', f); return [b, f]; });
    // Le serveur n'a envoyé que ce qui concerne la personne : on montre tout ce qu'on a reçu (la
    // direction garde les boutons pour regarder par public), et un bloc vide ne s'affiche pas.
    filtrer('tous');
    racine.querySelectorAll('.jours, .avenir').forEach(b => { b.hidden = !b.querySelector('li'); });
    return () => ecouteurs.forEach(([b, f]) => b.removeEventListener('click', f));
  }, [ouvert, html]);

  return (<>
    <button type="button" onClick={ouvrir} data-etat={vu ? 'neutre' : 'disponible'}
      className="bloc-etat w-full text-left px-4 py-3 flex items-center gap-3 hover:brightness-[.98]">
      <IconSparkles size={22} style={{ color: 'var(--c-iip_or, #F9B619)' }} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <b className="text-sm">Quoi de neuf dans Lucie ?</b>
          {!vu && <span className="pastille-etat" data-etat="disponible">Nouveau</span>}
        </span>
        <span className="block text-second text-slate-500">Les nouveautés {DEPUIS}, rangées par public : où les trouver, comment s’en servir.</span>
      </span>
      <IconChevronRight size={16} className="text-slate-400" />
    </button>
    {ouvert && (
      <Fenetre titre="Quoi de neuf dans Lucie ?" sous={`Les nouveautés ${DEPUIS}`} large="grande" onFermer={() => setOuvert(false)}
        pied={<button className="bouton bouton-fort" onClick={() => setOuvert(false)}>Fermer</button>}>
        {!html ? <div className="text-sm text-slate-400">Chargement…</div>
          : <div ref={zone} dangerouslySetInnerHTML={{ __html: html }} />}
      </Fenetre>)}
  </>);
}

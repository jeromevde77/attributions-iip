import { useEffect, useRef, useState } from 'react';
import { IconPalette, IconCheck } from '@tabler/icons-react';
import { useTheme, choisirTheme, THEMES_PERSO } from '../lib/theme.js';
import { THEMES_PERSONNELS, DEFAUT } from '../lib/couleurs.js';
import { passeRole } from '../lib/droits.js';

/* « Nouveau style » est à l'essai (3.5.103) : seule la direction le voit dans la palette. */
const themesVisibles = theme => THEMES_PERSO.filter(k => k !== 'nouveau' || theme === 'nouveau' || passeRole(['admin', 'directeur', 'directeur_adjoint']));

/* LE CHOIX DU THÈME, POUR CHACUN (3.5.037, Charles : « que TOUT le monde puisse, non pas gérer la mise en page, mais avoir
 * le choix entre des thèmes »). Une palette dans la barre du haut ; quatre thèmes, nommés, avec leurs trois couleurs.
 * Le choix ne vaut que pour soi, dans ce navigateur ; les réglages de l'école ne changent pas. `enLigne` : la version du
 * menu déroulant (iPad, téléphone), les quatre choix posés à plat. */
const nuancier = cle => {
  const c = THEMES_PERSONNELS[cle].couleurs || DEFAUT;
  return [c.fond_page || '#FFFFFF', c.principal, c.accent];
};

function Pastilles({ cle }) {
  return (
    <span className="flex -space-x-1 flex-none">
      {nuancier(cle).map((c, i) => <span key={i} className="w-3.5 h-3.5 rounded-full border border-slate-300" style={{ background: c }} />)}
    </span>
  );
}

export default function ChoixTheme({ enLigne = false }) {
  const theme = useTheme();
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!ouvert) return;
    const fermer = e => { if (!ref.current?.contains(e.target)) setOuvert(false); };
    const echap = e => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', fermer); document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', fermer); document.removeEventListener('keydown', echap); };
  }, [ouvert]);

  if (enLigne) return (
    <div className="flex flex-wrap items-center gap-1.5 w-full" role="radiogroup" aria-label="Thème">
      <IconPalette size={14} className="flex-none" />
      {themesVisibles(theme).map(k => (
        <button key={k} role="radio" aria-checked={theme === k} onClick={() => choisirTheme(k)}
          className={`objet-barre ${theme === k ? 'objet-barre-etat' : ''}`} style={theme === k ? { '--e': 'var(--c-principal)' } : undefined}>
          <Pastilles cle={k} /> {THEMES_PERSONNELS[k].nom}
        </button>
      ))}
    </div>
  );

  return (
    <span ref={ref} className="relative">
      <button onClick={() => setOuvert(o => !o)} aria-label="Choisir le thème" aria-expanded={ouvert}
        title={`Thème : ${THEMES_PERSONNELS[theme].nom}`} className="objet-barre objet-barre-icone">
        <IconPalette size={16} />
      </button>
      {ouvert && (
        <div role="menu" className="absolute right-0 top-full mt-2 z-50 w-64 rounded-carte border shadow-flottant p-1.5"
          style={{ background: 'var(--c-fond_carte, var(--c-fond_page, #fff))', borderColor: 'var(--menu-bord)' }}>
          <p className="px-2.5 pt-1.5 pb-1 text-mention uppercase tracking-wide" style={{ color: 'var(--c-intertitre, var(--menu-texte-doux))' }}>Mon thème</p>
          {themesVisibles(theme).map(k => (
            <button key={k} role="menuitemradio" aria-checked={theme === k}
              onClick={() => { choisirTheme(k); setOuvert(false); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-champ text-left hover:bg-[var(--menu-survol)]">
              <Pastilles cle={k} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium" style={{ color: 'var(--menu-texte)' }}>{THEMES_PERSONNELS[k].nom}</span>
                <span className="block text-second" style={{ color: 'var(--menu-texte-doux)' }}>{THEMES_PERSONNELS[k].texte}</span>
              </span>
              {theme === k && <IconCheck size={15} className="flex-none" style={{ color: 'var(--c-principal)' }} />}
            </button>
          ))}
          <p className="px-2.5 pt-1 pb-1.5 text-mention" style={{ color: 'var(--menu-texte-doux)' }}>Pour vous seul, sur cet appareil. Les pièces imprimées gardent la charte de l'Institut.</p>
        </div>
      )}
    </span>
  );
}

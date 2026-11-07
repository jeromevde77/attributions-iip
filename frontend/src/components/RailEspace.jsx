/* LE RAIL DES ESPACES (3.5.173 → 3.5.184, Charles : « dans l'espace étudiant, tu n'as pas utilisé le même design que dans
   l'espace prof ; TOUT doit être semblable, sinon les gens se perdent »). Un seul bouton pour l'espace enseignant et l'espace
   étudiant, aux mesures du rail de Lucie : case carrée de 36 px, icône 19 trait 1,8, grise ; l'entrée ouverte en pastille pâle
   cernée d'un filet, icône à l'accent ; au survol, la bulle marine du nom. Sur téléphone, une bande d'onglets nommés. */
export function BoutonRail({ f, actif, onClick, etroit = false }) {
  /* LES MESURES DU RAIL DE LUCIE (3.5.178, Charles : « taille des icônes un peu grande, fais comme dans Lucie, tout ») : rail
     étroit = cases carrées de 36 px, icône 19 trait 1,8, grise ; l'entrée ouverte = pastille pâle cernée d'un filet, icône à
     l'accent ; survol = ombre légère. Déplié : la même icône, le libellé à côté. */
  const style = actif
    ? { background: 'var(--menu-survol)', color: 'var(--menu-texte)', boxShadow: 'inset 0 0 0 1px var(--menu-actif-bord)' }
    : { color: 'var(--menu-texte-doux)' };
  return (
    <button type="button" onClick={onClick} aria-current={actif ? 'page' : undefined} aria-label={f.l}
      className={`group relative shrink-0 inline-flex items-center text-sm text-left transition-colors duration-150 ${actif ? 'font-semibold' : 'hover:shadow-pose'}
        ${etroit ? 'min-h-11 px-3 gap-2.5 rounded-carte md:min-h-0 md:w-9 md:h-9 md:mx-auto md:px-0 md:justify-center' : 'min-h-11 md:min-h-10 px-2.5 gap-3 rounded-carte'}`}
      style={style}>
      <f.I size={19} stroke={1.8} className="flex-shrink-0" style={{ color: actif ? 'var(--menu-accent)' : 'var(--menu-icone)' }} />
      <span className={etroit ? 'md:hidden' : ''}>{f.l}</span>
      {etroit && <span role="tooltip" className="hidden md:group-hover:block md:group-focus-visible:block pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 px-2 py-0.5 rounded-champ shadow-flottant text-white font-medium text-xs whitespace-nowrap"
        style={{ background: 'var(--c-principal, #16406A)' }}>{f.l}</span>}
    </button>);
}

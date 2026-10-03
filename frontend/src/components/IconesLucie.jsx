/**
 * LES ICÔNES DESSINÉES POUR LUCIE — quand la bibliothèque n'a pas le dessin.
 * Même grammaire que Tabler (24 × 24, trait arrondi), mêmes props (size, stroke).
 */
export function IconEtudiant({ size = 24, stroke = 2, className = '', ...rest }) {
  // Un bonhomme coiffé du chapeau de diplômé (Charles, 3 octobre 2026).
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} {...rest}>
      <path d="M4 5.5l8 -3l8 3l-8 3z" />
      <path d="M19 6v3.5" />
      <path d="M8.5 7v1.5a3.5 2 0 0 0 7 0v-1.5" />
      <circle cx="12" cy="13" r="2.6" />
      <path d="M6.5 21v-.5a4 4 0 0 1 4 -4h3a4 4 0 0 1 4 4v.5" />
    </svg>
  );
}

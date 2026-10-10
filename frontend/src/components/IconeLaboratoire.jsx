/** L'icône du laboratoire temporel de Lucie : un erlenmeyer, et dans sa panse une horloge (Charles, 10 octobre 2026). Mêmes propriétés qu'une icône Tabler. */
export function IconeLaboratoire({ size = 18, stroke = 1.8, className = '' }) {
  // Un erlenmeyer de laboratoire, et dans sa panse une horloge.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 3h6M10 3v6.2L4.6 18.6A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.4-2.4L14 9.2V3" />
      <circle cx="12" cy="16" r="3.4" />
      <path d="M12 14.4V16l1.1.8" />
    </svg>
  );
}


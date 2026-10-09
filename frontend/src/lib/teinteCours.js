/**
 * LA COULEUR D'UN COURS DANS UN HORAIRE (Charles, 9 octobre 2026 : « les tuiles
 * doivent être colorées, pour bien les repérer, et pas juste la bande »).
 *
 * Une teinte par code de cours, toujours la même : 250.1 a la même couleur dans
 * l'Horaire de la semaine et dans la simulation de l'année. C'est un REPÈRE,
 * comme les couleurs de bloc : il ne dit aucun état — d'où une palette à part,
 * sans le violet de la faveur ni la brique de l'erreur. La tuile porte un fond
 * de sa teinte, un liseré plein et un filet ; le texte reste à l'encre.
 */
const PALETTE = ['#2F6FB0', '#3E7D5E', '#C2410C', '#0E7490', '#BE185D', '#4D7C0F', '#A16207', '#475569',
  '#0F766E', '#1D4ED8', '#B45309', '#15803D', '#0369A1', '#9F1239'];

export function teinteCours(code) {
  let h = 0;
  for (const c of String(code || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Le style d'une tuile : fond teinté, liseré gauche, filet. */
export function styleTuileCours(code, { fond = 18 } = {}) {
  const c = teinteCours(code);
  return {
    background: `color-mix(in srgb, ${c} ${fond}%, white)`,
    borderLeft: `4px solid ${c}`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 35%, white)`,
  };
}

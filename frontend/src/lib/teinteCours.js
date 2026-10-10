/**
 * LA COULEUR D'UN COURS DANS UN HORAIRE (Charles, 9 octobre 2026 : « les tuiles
 * doivent être colorées, pour bien les repérer, et pas juste la bande »).
 *
 * Une teinte par unité, déclinée par cours, toujours la même : 250.1 a la même couleur dans
 * l'Horaire de la semaine et dans la simulation de l'année. C'est un REPÈRE,
 * comme les couleurs de bloc : il ne dit aucun état — d'où une palette à part,
 * sans le violet de la faveur ni la brique de l'erreur. La tuile porte un fond
 * de sa teinte, un liseré plein et un filet ; le texte reste à l'encre.
 */
// Dix teintes éloignées, dans un ordre qui alterne : deux numéros voisins ne se ressemblent pas.
const PALETTE = ['#2F6FB0', '#C2410C', '#3E7D5E', '#BE185D', '#0E7490', '#A16207', '#4D7C0F', '#9F1239', '#475569', '#0F766E'];

/* DES COULEURS PROCHES PAR UNITÉ (Charles, 9 octobre 2026 : « des couleurs
   semblables par UE »). L'UNITÉ choisit la teinte (250 dans 250.1), le COURS
   la décline : 250.1 la teinte franche, 250.2 plus sombre, 250.3 plus claire… */
const NUANCES = [0, -0.28, 0.25, -0.45, 0.4, -0.14, 0.12];
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = c => `#${c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const nuancer = (h, f) => rgb2hex(hex2rgb(h).map(v => (f < 0 ? v * (1 + f) : v + (255 - v) * f)));
const hache = t => { let h = 0; for (const c of String(t || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export function teinteCours(code) {
  const m = /^([^.]+)\.(\d+)/.exec(String(code || ''));
  const ue = m ? m[1] : String(code || '');
  // Un numéro d'unité choisit sa teinte par son rang : deux unités voisines (250, 251) ne se confondent jamais.
  const base = PALETTE[(/^\d+$/.test(ue) ? Number(ue) : hache(ue)) % PALETTE.length];
  return nuancer(base, m ? NUANCES[(Number(m[2]) - 1 + NUANCES.length) % NUANCES.length] : 0);
}

/** Le style d'une tuile : fond teinté, liseré gauche, filet. */
export function styleTuileCours(code, { fond = 18 } = {}) {
  const c = teinteCours(code);
  return {
    background: `color-mix(in srgb, ${c} ${fond}%, var(--blanc))`,
    borderLeft: `4px solid ${c}`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 35%, var(--blanc))`,
  };
}

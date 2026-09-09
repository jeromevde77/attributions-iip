/**
 * LA GRILLE D'ENCODAGE SE PARCOURT AU CLAVIER.
 *
 * Encoder cent notes à la souris, case par case, est le genre de travail qui
 * fait préférer le tableur. On y va pourtant de gauche à droite et de haut en
 * bas, sans jamais lever les mains — c'est exactement ce que fait un tableur,
 * et c'est tout ce qu'on demandait.
 *
 * ┌ Flèches ─────────────────────────────────────────────────────────────────┐
 * │ ← →   case précédente / suivante, mais SEULEMENT quand le curseur est au │
 * │       bord du texte : au milieu d'un « 14 », la flèche doit déplacer le  │
 * │       curseur, c'est ce que tout le monde attend.                        │
 * │ ↑ ↓   ligne précédente / suivante, même colonne.                         │
 * │ Entrée / Maj+Entrée   comme ↓ / ↑ : la main reste sur le pavé numérique. │
 * │ Tab   laissé au navigateur, qui le fait déjà bien.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * UNE CASE FERMÉE NE SE TRAVERSE PAS, ELLE S'ENJAMBE. En seconde session, les
 * cours qui ne se représentent pas sont désactivés : s'y arrêter donnerait
 * l'impression que la flèche ne marche plus. On saute jusqu'à la prochaine
 * case ouverte, dans la direction demandée.
 *
 * Le repérage se fait par un attribut « data-cell » plutôt que par une
 * collection de refs : la grille se reconstruit à chaque frappe (une note
 * change les cotes calculées), et des refs y survivraient mal.
 */

const SEL = '[data-cell]';

/** Les coordonnées portées par une case. */
function coord(el) {
  const [r, c] = String(el?.dataset?.cell || '').split('|').map(Number);
  return Number.isFinite(r) && Number.isFinite(c) ? { r, c } : null;
}

/**
 * La case ouverte la plus proche dans la direction voulue.
 * `dr`/`dc` valent -1, 0 ou 1 ; on avance jusqu'à en trouver une, sans boucler.
 */
function voisine(racine, depuis, dr, dc) {
  const cases = [...racine.querySelectorAll(SEL)]
    .map(el => ({ el, ...coord(el) }))
    .filter(x => x.r != null);
  if (!cases.length) return null;

  const lignes = [...new Set(cases.map(x => x.r))].sort((a, b) => a - b);
  const colonnes = [...new Set(cases.map(x => x.c))].sort((a, b) => a - b);
  const iL = lignes.indexOf(depuis.r);
  const iC = colonnes.indexOf(depuis.c);
  if (iL < 0 || iC < 0) return null;

  const trouver = (l, c) => cases.find(x => x.r === lignes[l] && x.c === colonnes[c]);
  let l = iL, c = iC;
  for (let pas = 0; pas < lignes.length * colonnes.length; pas++) {
    l += dr; c += dc;
    // EN BOUT DE LIGNE, ON PASSE À LA SUIVANTE — comme on lit. Sans cela, la
    // flèche droite s'arrête au dernier acquis du dernier cours et il faut
    // reprendre la souris pour changer d'étudiant.
    if (dc > 0 && c >= colonnes.length) { c = 0; l += 1; }
    if (dc < 0 && c < 0) { c = colonnes.length - 1; l -= 1; }
    if (l < 0 || l >= lignes.length || c < 0 || c >= colonnes.length) return null;
    const x = trouver(l, c);
    if (x && !x.el.disabled && !x.el.readOnly) return x.el;
  }
  return null;
}

/** Le curseur est-il au tout début / à la toute fin du contenu ? */
function auBord(el, sens) {
  // Un champ « number » ne répond pas sur selectionStart : les grilles
  // d'encodage utilisent donc « text » avec inputMode numérique, ce qui
  // supprime aussi la molette qui changeait les notes par mégarde.
  let d, f;
  try { d = el.selectionStart; f = el.selectionEnd; } catch { return true; }
  if (d == null) return true;
  const n = String(el.value ?? '').length;
  return sens < 0 ? (d === 0 && f === 0) : (d === n && f === n);
}

/**
 * À poser sur le conteneur de la grille (ou sur chaque case).
 * `racine` est l'élément dans lequel chercher — le <table>, en général.
 */
export function naviguerGrille(ev, racine) {
  const el = ev.target;
  const ici = coord(el);
  if (!ici || !racine) return;

  const bouger = (dr, dc) => {
    const cible = voisine(racine, ici, dr, dc);
    if (!cible) return;
    ev.preventDefault();
    cible.focus();
    // Tout sélectionner : taper remplace, comme dans un tableur.
    try { cible.select?.(); } catch { /* champ sans sélection */ }
  };

  switch (ev.key) {
    case 'ArrowDown': ev.preventDefault(); return bouger(1, 0);
    case 'ArrowUp': ev.preventDefault(); return bouger(-1, 0);
    case 'Enter': ev.preventDefault(); return bouger(ev.shiftKey ? -1 : 1, 0);
    case 'ArrowRight': if (auBord(el, 1)) return bouger(0, 1); return;
    case 'ArrowLeft': if (auBord(el, -1)) return bouger(0, -1); return;
    default:
  }
}

/** Les attributs communs d'une case de saisie numérique. */
export function caseGrille(r, c) {
  return {
    'data-cell': `${r}|${c}`,
    type: 'text',
    inputMode: 'decimal',
    autoComplete: 'off',
    onFocus: ev => { try { ev.target.select(); } catch { /* rien */ } },
  };
}

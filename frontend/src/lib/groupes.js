/**
 * LE NOM D'UN GROUPE, ÉCRIT UNE FOIS (Charles, 3 octobre 2026).
 *
 * En AeSI, la classe A est coupée en deux pour les TP : avec des lettres seules,
 * ses deux moitiés s'appelaient A et B — et B se lit comme une autre classe.
 * Chaque section choisit donc (Organisation → Référentiels → la section) :
 *   lettres          A, B, C…            (l'usage d'origine)
 *   lettre_chiffre   A1, A2… B1, B2…     la lettre est la classe (l'organisation)
 *   chiffres         1, 2, 3…            la classe garde sa lettre, à part
 *
 * Le nom se fabrique quand on découpe un cours ; ce qui est déjà écrit n'est
 * pas renommé d'office — les étudiants répartis le sont sous ce nom.
 */
export const MODES_GROUPES = [
  ['lettres', 'A, B, C — une lettre par groupe'],
  ['lettre_chiffre', 'A1, A2, B1, B2 — la classe, puis le groupe'],
  ['chiffres', '1, 2, 3, 4 — les groupes numérotés'],
];

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const lettre = i => (i < 26 ? ALPHA[i] : ALPHA[i % 26].repeat(Math.floor(i / 26) + 1));

/** Le code du groupe d'index i (0, 1, 2…) dans la classe `org` (1 = A). */
export function codeGroupe(i, mode = 'lettres', org = 1) {
  if (mode === 'chiffres') return String(i + 1);
  if (mode === 'lettre_chiffre') return `${lettre(Math.max(0, (Number(org) || 1) - 1))}${i + 1}`;
  return lettre(i);
}

/** La suite attendue de n groupes, dans l'ordre où l'on compare des codes triés. */
export function suiteGroupes(n, mode = 'lettres', org = 1) {
  return Array.from({ length: n }, (_, i) => codeGroupe(i, mode, org))
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
}

/** Trie des codes de groupe comme la suite (2 avant 10). */
export const trierCodes = codes => [...codes].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));

/** Le rang (0, 1, 2…) qui donne la couleur d'un code : A ou A1 = 0, B ou A2 ou 2 = 1. */
export function rangCouleur(code) {
  const c = String(code || '').toUpperCase();
  const m = c.match(/^[A-Z]*(\d+)$/);
  if (m) return Number(m[1]) - 1;
  return ALPHA.indexOf(c[0]);
}

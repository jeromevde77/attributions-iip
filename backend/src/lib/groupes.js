/**
 * LE NOM D'UN GROUPE — la même règle que frontend/src/lib/groupes.js
 * (3 octobre 2026). Chaque section choisit : lettres (A, B…), lettre_chiffre
 * (A1, A2… — la lettre est la classe, c'est-à-dire l'organisation) ou
 * chiffres (1, 2…).
 */
import db from '../db/index.js';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const lettre = i => (i < 26 ? ALPHA[i] : ALPHA[i % 26].repeat(Math.floor(i / 26) + 1));

export function codeGroupe(i, mode = 'lettres', org = 1) {
  if (mode === 'chiffres') return String(i + 1);
  if (mode === 'lettre_chiffre') return `${lettre(Math.max(0, (Number(org) || 1) - 1))}${i + 1}`;
  return lettre(i);
}

/** La règle de numérotation d'une section ('lettres' si rien n'est réglé). */
export function modeGroupes(section) {
  try {
    return db.prepare('SELECT numerotation_groupes m FROM section WHERE code = ?').get(section)?.m || 'lettres';
  } catch { return 'lettres'; }
}

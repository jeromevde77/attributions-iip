/**
 * L'ANNÉE EN COURS, ET LA GARDE QUI VA AVEC.
 *
 * Ce fichier ne dépend de rien d'autre : il est appelé depuis la couche d'API
 * elle-même, et une dépendance circulaire à cet endroit casserait tout le
 * chargement de l'application. Il relit donc le jeton lui-même plutôt que
 * d'importer les entêtes.
 */

const lireJeton = () => { try { return localStorage.getItem('token'); } catch { return null; } };
const anneeRegardee = () => {
  try { return localStorage.getItem('annee_active') || '2026-2027'; }
  catch { return '2026-2027'; }
};

let promesse = null;

/** L'année EN COURS au sens de l'établissement — pas celle qu'on regarde. */
export function anneeCourante() {
  if (!promesse) {
    const t = lireJeton();
    promesse = fetch('/api/annees', { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      .then(r => r.json())
      .then(l => (Array.isArray(l) ? l : []).find(a => a.active)?.code || null)
      .catch(() => null);
  }
  return promesse;
}

const cle = (annee, quoi) => `lucie.annee-acceptee.${quoi}.${annee}`;
export const dejaAccepte = (annee, quoi) => {
  try { return sessionStorage.getItem(cle(annee, quoi)) === '1'; } catch { return false; }
};
export const accepter = (annee, quoi) => {
  try { sessionStorage.setItem(cle(annee, quoi), '1'); } catch { /* navigation privée */ }
};

/**
 * LA GARDE AU MOMENT D'ÉCRIRE.
 *
 * Posée dans la couche d'API plutôt que sur chaque bouton : une garde qui n'est
 * juste que si l'on y pense est une garde fausse — il y a douze endroits d'où
 * part une modification d'attribution, et il y en aura treize demain.
 *
 * Elle ne demande rien dans l'année en cours, et ne redemande pas dans la même
 * session pour la même année : celui qui a répondu « je sais ce que je fais »
 * ne doit pas être interrogé à chaque cellule, sinon il cesse de lire.
 */
export async function confirmerAnnee(quoi = 'cette donnée') {
  const regardee = anneeRegardee();
  const courante = await anneeCourante();
  if (!courante || courante === regardee) return true;
  if (dejaAccepte(regardee, `ecriture:${quoi}`)) return true;
  const ok = window.confirm(
    `Vous modifiez ${quoi} de l'année ${regardee}, qui n'est pas l'année en cours `
    + `(${courante}).\n\nCe qui sera enregistré ne comptera pas pour ${courante}.\n\n`
    + `Confirmez-vous ?`);
  if (ok) accepter(regardee, `ecriture:${quoi}`);
  return ok;
}

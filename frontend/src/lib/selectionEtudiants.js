/**
 * LA SÉLECTION D'ÉTUDIANTS DE L'ÉCRAN ÉTUDIANTS, CONNUE DES ÉDITIONS (Charles,
 * 7 octobre 2026 : « quand je clique sur plusieurs étudiants et que je vais
 * dans Éditions, pouvoir sortir des listes, des PAE… déjà sélectionnés »).
 * L'écran la publie ; le centre d'impression et le générateur de listes la
 * lisent, quel que soit le chemin par lequel on les ouvre (rail, barre,
 * bouton). Elle vit le temps de la page : quitter la liste l'efface.
 */
let courante = { ids: [], annee: null, sections: [] };
const abonnes = new Set();
export function poserSelectionEtudiants(ids, annee, sections = []) {
  courante = { ids: [...(ids || [])], annee: annee || null, sections: [...new Set(sections.filter(Boolean))] };
  for (const f of abonnes) f(courante);
}
export function selectionEtudiants() { return courante; }
export function suivreSelectionEtudiants(f) { abonnes.add(f); return () => abonnes.delete(f); }

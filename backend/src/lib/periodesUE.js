/**
 * LES PÉRIODES DE L'ÉTUDIANT POUR UNE UNITÉ, AUTONOMIE COMPRISE.
 *
 * Deux conventions coexistent en base : `ue_per_etudiants` porte tantôt
 * l'autonomie (UE 338 AeSI : 100 = 80 + 20), tantôt pas (UE 246 TIM : 80,
 * plus 20 d'autonomie). Le total de l'étudiant est donc le plus grand de ce
 * que dit le dossier et de cours + autonomie — la règle du PAE (3.1.85), écrite
 * une fois ici. Un stage, dont les périodes étudiant dépassent celles du
 * professeur, garde les siennes.
 */
export function periodesEtudiantUE({ per_etud, per_cours, aut } = {}) {
  const n = v => Number(v) || 0;
  return Math.max(n(per_etud), n(per_cours) + n(aut));
}

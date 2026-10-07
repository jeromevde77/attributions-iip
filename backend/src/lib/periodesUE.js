/**
 * LES PÉRIODES QUI FONDENT LE DROIT D'INSCRIPTION (Charles, 7 octobre 2026).
 *
 * Ce sont les périodes PROFESSEUR du dossier pédagogique, autonomie comprise —
 * `ue_tot_prf` —, et non les périodes étudiant : un DP de stage ou de TFE qui
 * porte 20 périodes de pratique réflexive et 20 d'encadrement de stage compte
 * 40, quelles que soient les heures que l'étudiant passe en stage. Les
 * périodes Z (développement professionnel, en autonomie sans enseignant) n'y
 * entrent pas. Le plafond de 800 se compte dans la même unité.
 * À défaut de total encodé : cours + autonomie.
 */
export function periodesDI({ tot_prf, per_cours, aut } = {}) {
  const n = v => Number(v) || 0;
  return n(tot_prf) || (n(per_cours) + n(aut));
}

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

/**
 * LES PÉRIODES DE L'ÉTUDIANT, qui fondent les FRAIS D'INSCRIPTION
 * complémentaires cette année (Charles, 7 octobre 2026 : « les FI sont encore
 * calculés, eux, sur les périodes prestées par l'étudiant — 820 pour Zaynab
 * JAMAL »). Le plus grand de ce que dit le dossier (`ue_per_etudiants`) et de
 * cours + autonomie : les deux conventions coexistent en base. Un stage garde
 * les heures de l'étudiant (UE 261 : 140, et non les 60 d'encadrement).
 */
export function periodesEtudiantUE({ per_etud, per_cours, aut } = {}) {
  const n = v => Number(v) || 0;
  return Math.max(n(per_etud), n(per_cours) + n(aut));
}

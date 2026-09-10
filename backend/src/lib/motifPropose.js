/**
 * LA MOTIVATION PROPOSÉE — celle qu'on écrit quand personne n'a écrit.
 *
 * Un échec doit être motivé acquis par acquis (RDE art. 88 §3) : une décision
 * non motivée se perd au recours, et elle s'y perd sur ce terrain-là. Or, à
 * quatre-vingts dossiers dans une soirée, la case reste vide — et l'annexe
 * part avec un blanc, ce qui est pire qu'une phrase générale.
 *
 * Cette fabrique donne donc, pour chaque acquis en échec, un énoncé DÉFENDABLE
 * TEL QUEL : il se rapporte à l'acquis, jamais à l'étudiant, et il dit ce que
 * la base sait réellement — l'épreuve n'a pas été présentée, l'acquis n'a pas
 * été évalué, la maîtrise reste sous le seuil.
 *
 * MAIS ELLE N'ÉCRIT RIEN. La proposition se calcule à la lecture ; tant que
 * personne ne l'a reprise, la base reste vide et l'écran l'affiche en gris.
 * C'est la différence entre « le Conseil a motivé » et « personne n'a rien
 * écrit », et cette différence doit rester lisible — sur l'écran, dans la
 * base, et au moment de clôturer.
 *
 * Ce qu'elle ne fait pas : remplacer la motivation du Conseil. Deux dossiers
 * qui portent la même phrase s'affaiblissent l'un l'autre ; c'est pourquoi
 * la clôture compte les propositions restées telles quelles et les nomme.
 */

/**
 * @param {object} a  un acquis tel que le renvoie la délibération :
 *   { note, na, non_evalue, mention, description }
 * @param {number} seuil  le seuil de maîtrise (RDE art. 78)
 * @returns {string} l'énoncé proposé, ou '' si l'acquis n'est pas en échec
 */
export function motifPropose(a, seuil = 10) {
  if (!a) return '';

  // UNE FAVEUR N'EST PAS UN ÉCHEC. Elle se motive, mais comme une décision du
  // Conseil — pas comme une insuffisance. On ne propose rien.
  if (a.faveur) return '';

  const mention = String(a.mention || '').toUpperCase();

  // L'épreuve n'a pas été présentée : c'est un fait, pas un jugement.
  if (mention === 'PP') {
    return "L'épreuve par laquelle cet acquis devait être attesté n'a pas été "
         + 'présentée : la maîtrise de cet acquis ne peut être établie.';
  }
  // Note de présence : l'étudiant était là, la copie n'atteste rien.
  if (mention === 'NP') {
    return "L'épreuve a été présentée sans que les éléments attendus par cet "
         + 'acquis y soient rencontrés.';
  }
  // Pas de note du tout : l'acquis n'a pas été évalué.
  if (a.non_evalue || (a.note == null && !a.na)) {
    return "Cet acquis n'a fait l'objet d'aucune évaluation au terme de "
         + "l'unité : sa maîtrise ne peut être attestée.";
  }

  const n = a.note == null ? null : Number(a.note);
  if (n == null) {
    // Marqué NA sans note lisible : on dit ce qu'on sait, rien de plus.
    return "Cet acquis n'est pas maîtrisé au terme de l'unité d'enseignement.";
  }
  if (n >= seuil) return '';   // maîtrisé : rien à motiver

  // Sous le seuil. L'écart dit quelque chose — une maîtrise partielle n'est
  // pas une absence de maîtrise, et écrire l'un pour l'autre est attaquable.
  if (n < seuil / 2) {
    return "Les éléments attendus par cet acquis ne sont pas rencontrés : la "
         + "maîtrise démontrée reste très en deçà du seuil requis.";
  }
  return 'La maîtrise démontrée ne couvre qu’une partie du champ de cet '
       + "acquis et n'atteint pas le seuil requis.";
}

/**
 * Le même énoncé, mais pour une UNITÉ refusée ou ajournée : il renvoie aux
 * acquis, car c'est d'eux que la décision procède.
 */
export function motifProposeUE(acquisEnEchec = []) {
  const n = acquisEnEchec.length;
  if (!n) return '';
  const codes = acquisEnEchec.map(a => a.aa_code).filter(Boolean).join(', ');
  return `La décision procède du constat que ${n === 1
    ? "l'acquis d'apprentissage suivant n'est pas maîtrisé"
    : `les ${n} acquis d'apprentissage suivants ne sont pas maîtrisés`} au `
    + `terme de l'unité : ${codes}. Le détail figure au relevé des acquis.`;
}

export default motifPropose;

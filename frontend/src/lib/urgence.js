/**
 * L'URGENCE D'UNE ÉCHÉANCE — UNE SEULE FOIS, POUR TOUS LES ÉCRANS.
 *
 * Une tâche n'a pas deux états : elle est loin, elle approche, elle presse, ou
 * elle est dépassée. Ce jugement se prenait nulle part — l'Accueil se
 * contentait d'écrire « en retard » en ambre une fois la date passée, si bien
 * qu'on découvrait une échéance le lendemain de son terme.
 *
 * Trois seuils, et rien entre eux :
 *
 *   J-7 à J-4   ocre    — elle approche : on s'organise
 *   J-3 à J-0   brique  — elle presse : on la fait, ou on la déplace
 *   dépassée    brique  — on ne l'a pas faite, et cela se voit
 *
 * La brique s'écrit en BLANC sur fond plein : c'est le seul endroit de Lucie
 * où un fond porte la couleur plutôt qu'un filet, et c'est voulu — trois jours
 * avant, on ne doit pas avoir à lire la ligne pour la voir.
 *
 * Au-delà de sept jours, rien : si tout est signalé, plus rien ne signale.
 */

/** Le jour d'aujourd'hui en AAAA-MM-JJ, à l'heure locale — pas en UTC. */
export function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    + `-${String(d.getDate()).padStart(2, '0')}`;
}

/** Le nombre de jours entiers qui séparent deux dates AAAA-MM-JJ. */
export function joursAvant(echeance, depuis = aujourdhui()) {
  if (!echeance) return null;
  const a = new Date(`${String(echeance).slice(0, 10)}T00:00:00`);
  const b = new Date(`${depuis}T00:00:00`);
  if (Number.isNaN(a.getTime())) return null;
  return Math.round((a - b) / 86400000);
}

/**
 * L'état d'une échéance : ce qu'il faut écrire, et comment.
 *
 * @returns {{ niveau, jours, mention, ligne, pastille }}
 *   niveau   'depasse' | 'presse' | 'approche' | 'calme' | null
 *   mention  « J-5 », « aujourd'hui », « en retard de 3 j »
 *   ligne    classes du fond de ligne
 *   pastille classes de la mention elle-même
 */
export function urgence(echeance, depuis = aujourdhui()) {
  const j = joursAvant(echeance, depuis);
  if (j === null) {
    return { niveau: null, jours: null, mention: null, ligne: '', pastille: '' };
  }

  // DÉPASSÉE. On dit de combien : « en retard » seul ne distingue pas hier
  // d'il y a trois semaines, et ce n'est pas la même conversation.
  if (j < 0) {
    const n = Math.abs(j);
    return {
      niveau: 'depasse', jours: j,
      mention: n === 1 ? 'en retard d’un jour' : `en retard de ${n} jours`,
      ligne: 'bg-[#9D4A38]',
      pastille: 'text-white',
    };
  }

  if (j <= 3) {
    return {
      niveau: 'presse', jours: j,
      mention: j === 0 ? 'aujourd’hui' : `J-${j}`,
      ligne: 'bg-[#9D4A38]',
      pastille: 'text-white',
    };
  }

  if (j <= 7) {
    return {
      niveau: 'approche', jours: j,
      mention: `J-${j}`,
      ligne: 'bg-amber-50',
      pastille: 'text-amber-800',
    };
  }

  return { niveau: 'calme', jours: j, mention: null, ligne: '', pastille: 'text-slate-500' };
}

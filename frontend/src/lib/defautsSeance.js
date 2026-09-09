/**
 * LES DÉFAUTS DE LA SÉANCE.
 *
 * Une délibération se tient le jour où on la saisit, la visite des copies deux
 * jours plus tard, la seconde session dix jours après. Ces trois valeurs
 * étaient à retaper à chaque unité — vingt fois par session pour une section —
 * alors qu'elles ne changent presque jamais. Elles sont désormais proposées,
 * et rien de plus : chaque champ reste modifiable, et c'est la clôture qui
 * fige ce qui aura été retenu.
 *
 * Les dates proposées évitent le samedi et le dimanche : un rendez-vous de
 * visite des copies un dimanche n'est pas un défaut, c'est une correction de
 * plus à faire.
 */

const jour = 86400000;

export function iso(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Le jour ouvrable à `n` jours de `depuis` (une date ISO ou un Date). */
export function ouvrable(depuis, n) {
  const base = depuis instanceof Date ? depuis : new Date(`${depuis}T12:00:00`);
  if (isNaN(base)) return '';
  const d = new Date(base.getTime() + n * jour);
  while (d.getDay() === 0 || d.getDay() === 6) d.setTime(d.getTime() + jour);
  return iso(d);
}

export function heureCourante(now = new Date()) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export const DEFAUTS = {
  visite_jours: 2,
  visite_local: 'Contacter le professeur',
  session2_jours: 10,
  session2_heure: '08:00',
  session2_local: 'Contacter la coordination',
};

/**
 * Ce qu'on propose pour une séance vide. `seance` est ce que la base porte
 * déjà : on ne remplace jamais une valeur enregistrée.
 */
export function proposition(seance, now = new Date()) {
  const dateS = seance?.date_seance || iso(now);
  const heureS = seance?.heure_seance || heureCourante(now);
  return {
    date_seance: dateS,
    heure_seance: heureS,
    visite_date: seance?.visite_date || ouvrable(dateS, DEFAUTS.visite_jours),
    visite_heure: seance?.visite_heure || heureS,
    visite_local: seance?.visite_local || DEFAUTS.visite_local,
    session2_date: ouvrable(dateS, DEFAUTS.session2_jours),
    session2_heure: DEFAUTS.session2_heure,
    session2_local: DEFAUTS.session2_local,
  };
}

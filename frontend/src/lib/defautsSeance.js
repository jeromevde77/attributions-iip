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
/* LES DÉLAIS DES PROCÉDURES (3.5.338) : `delais` vient du serveur (lib/delaisSessions.js) — visite J+1 après la délibération,
   seconde session au moins 7 jours après la visite. À défaut, les anciens défauts. */
export function proposition(seance, now = new Date(), delais = null) {
  const dateS = seance?.date_seance || iso(now);
  const heureS = seance?.heure_seance || heureCourante(now);
  const visite = seance?.visite_date || ouvrable(dateS, delais ? delais.visite_apres_delib : DEFAUTS.visite_jours);
  return {
    date_seance: dateS,
    heure_seance: heureS,
    visite_date: visite,
    visite_heure: seance?.visite_heure || heureS,
    visite_local: seance?.visite_local || DEFAUTS.visite_local,
    session2_date: delais ? ouvrable(visite, delais.ev2_apres_visite) : ouvrable(dateS, DEFAUTS.session2_jours),
    session2_heure: DEFAUTS.session2_heure,
    session2_local: DEFAUTS.session2_local,
  };
}

/** CE QUE LES PROCÉDURES DISENT D'UNE DATE POSÉE (3.5.338) : des avertissements, jamais un blocage. */
export function avertissementsDates({ delib, visite, ev2, rdv = false }, delais) {
  if (!delais || !delib) return [];
  const j = d => new Date(`${d}T12:00:00`).getTime();
  const ecart = (a, b) => Math.round((j(b) - j(a)) / 86400000);
  const out = [];
  if (visite && !rdv) {
    if (ecart(delib, visite) < 0) out.push('visite des copies avant la délibération');
    else if (ecart(delib, visite) > delais.publication_ouvr + delais.visite_max_publication + 2)
      out.push(`visite des copies tardive (procédure : J+${delais.visite_apres_delib}, au plus ${delais.visite_max_publication} jours après la publication)`);
  }
  if (ev2) {
    const base = visite && !rdv ? visite : delib;
    const min = visite && !rdv ? delais.ev2_apres_visite : delais.visite_apres_delib + delais.ev2_apres_visite;
    if (ecart(base, ev2) < min) out.push(`examen de seconde session trop tôt (procédure : au moins ${delais.ev2_apres_visite} jours après la visite des copies)`);
  }
  return out;
}

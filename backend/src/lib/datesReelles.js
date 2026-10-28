/**
 * LES DATES DE L'UE ET L'HORAIRE RÉEL, ALIGNÉS (Charles, 28 octobre 2026 : « il
 * faut surtout que le premier dixième et le dernier dixième soient alignés aux
 * horaires réels, et vice versa »).
 *
 * Deux vérités se côtoyaient : les dates d'ouverture et de fermeture de l'UE
 * (`organisation_ue` — le RGE du supérieur, art. 1er 12°, y fonde le premier
 * dixième ; l'échéancier, les frais et le droit d'inscription les lisent) et les
 * séances de l'horaire (`horaire_seance` — d'où la grille tire le premier
 * dixième, comme la vérificatrice). Alignées, elles donnent la même date.
 *
 * Ici, on COMPARE : première et dernière séance réelles face aux dates de l'UE,
 * les deux premiers dixièmes, et les séances posées hors des dates de l'UE (le
 * « vice versa »). L'alignement lui-même passe par l'enregistrement habituel des
 * dates (`PUT /annuel/dates-ue`), avec ses règles : la coordination dépose une
 * demande, la direction et le secrétariat écrivent.
 */
import db from '../db/index.js';
import { premierDixieme } from './grillePresence.js';

const jour = d => Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') / 86400000;
const iso = j => new Date(Math.round(j) * 86400000).toISOString().slice(0, 10);
const ecart = (a, b) => (a && b ? Math.round(jour(a) - jour(b)) : null);

/** Le premier dixième au sens du RGE : un dixième de la durée entre l'ouverture et la fermeture. */
export function dixiemeDesDates(debut, fin) {
  if (!debut || !fin || fin < debut) return null;
  return iso(jour(debut) + (jour(fin) - jour(debut)) / 10);
}

export function comparerDatesUE(annee, { section = null, perimetre = null } = {}) {
  const orgs = db.prepare(`SELECT o.id, o.ue_num, o.section, o.num_organisation, o.date_debut, o.date_fin,
      (SELECT MIN(ue_nom) FROM ue u WHERE u.ue_num = o.ue_num AND u.annee_scolaire = o.annee_scolaire) AS ue_nom,
      (SELECT COUNT(*) FROM organisation_ue x WHERE x.ue_num = o.ue_num AND x.section = o.section AND x.annee_scolaire = o.annee_scolaire) AS nb_orgs
    FROM organisation_ue o WHERE o.annee_scolaire = ? ${section ? 'AND o.section = ?' : ''}
    ORDER BY o.section, o.ue_num, o.num_organisation`).all(...(section ? [annee, section] : [annee]))
    .filter(o => !perimetre || perimetre.includes(o.section));
  const seancesDe = db.prepare(`SELECT s.date FROM horaire_seance s
    WHERE s.annee_scolaire = ? AND COALESCE(s.annule, 0) = 0 AND (s.section IS NULL OR s.section = ?)
      AND (s.ue_num = ? OR s.cours_code IN (SELECT cours_code FROM cours WHERE ue_num = ? AND annee_scolaire = ?))
    ORDER BY s.date`);
  return orgs.map(o => {
    const seances = seancesDe.all(annee, o.section, o.ue_num, o.ue_num, annee);
    const dates = seances.map(x => String(x.date).slice(0, 10));
    const premiere = dates[0] || null, derniere = dates[dates.length - 1] || null;
    // Une séance est « hors des dates » si elle ne tombe dans la fenêtre d'AUCUNE
    // organisation de l'UE : l'horaire ne dit pas à quelle organisation elle appartient.
    const fenetres = (o.nb_orgs > 1 ? orgs.filter(x => x.ue_num === o.ue_num && x.section === o.section) : [o])
      .filter(x => x.date_debut && x.date_fin);
    const horsDates = fenetres.length ? dates.filter(d => !fenetres.some(x => d >= x.date_debut && d <= x.date_fin)) : [];
    const statut = !dates.length ? 'sans_seances'
      : (!o.date_debut || !o.date_fin) ? 'sans_dates'
      : o.nb_orgs > 1 ? 'plusieurs_orgs'
      : (o.date_debut === premiere && o.date_fin === derniere) ? 'aligne' : 'ecart';
    return {
      id: o.id, ue_num: o.ue_num, ue_nom: o.ue_nom, section: o.section, num_organisation: o.num_organisation, nb_orgs: o.nb_orgs,
      date_debut: o.date_debut, date_fin: o.date_fin, premiere, derniere, nb_seances: dates.length, hors: horsDates.length, hors_dates: [...new Set(horsDates)].slice(0, 12),
      ecart_debut: ecart(o.date_debut, premiere), ecart_fin: ecart(o.date_fin, derniere),
      dixieme_dates: dixiemeDesDates(o.date_debut, o.date_fin),
      dixieme_horaire: dates.length ? premierDixieme(seances.map(x => ({ date: x.date }))).date : null,
      statut,
      // Ce que vaudraient les dates alignées : la première et la dernière séance réelle.
      // Une UE à plusieurs organisations ne s'aligne pas d'office : l'horaire ne dit pas
      // quelle séance appartient à quelle organisation.
      alignable: (statut === 'ecart' || statut === 'sans_dates') && o.nb_orgs === 1,
    };
  });
}

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

const proche = (dates, cible) => {
  let d = dates[0];
  for (const x of dates) if (Math.abs(jour(x) - cible) < Math.abs(jour(d) - cible)) d = x;
  return d;
};

/**
 * UN JALON DE L'UE DANS L'HORAIRE RÉEL : `pct` % de l'écart entre la première et
 * la dernière séance, puis la séance la plus proche (la plus tôt à égalité) —
 * la méthode de la vérificatrice, celle de `premierDixieme()` de la grille.
 */
export function jalonDesSeances(dates, pct) {
  const d = [...new Set(dates.map(x => String(x).slice(0, 10)))].sort();
  if (!d.length) return null;
  return proche(d, jour(d[0]) + (jour(d[d.length - 1]) - jour(d[0])) * pct / 100);
}

/**
 * LE PREMIER DIXIÈME D'UNE UE — UNE SEULE RÈGLE POUR TOUT LUCIE (Charles,
 * 28 octobre 2026 : les frais, le droit d'inscription et l'échéancier « aussi »).
 * L'horaire réel d'abord : 1/10 entre la première et la dernière séance, séance la
 * plus proche. À défaut — pas de séance, ou une UE en plusieurs organisations, que
 * l'horaire ne sépare pas —, les dates de l'organisation (`numOrganisation`, sinon
 * la plus tôt). Rend { date, source: 'horaire' | 'dates' } ou null.
 */
export function premierDixiemeUE(ueNum, annee, { section = null, numOrganisation = null, pct = 10 } = {}) {
  const ue = Number(ueNum);
  const orgs = db.prepare(`SELECT num_organisation, date_debut, date_fin FROM organisation_ue
    WHERE ue_num = ? AND annee_scolaire = ? ${section ? 'AND section = ?' : ''}`).all(...(section ? [ue, annee, section] : [ue, annee]));
  // Plusieurs organisations : l'horaire ne dit pas à laquelle appartient une séance.
  if (new Set(orgs.map(o => o.num_organisation)).size <= 1) {
    const dates = db.prepare(`SELECT s.date FROM horaire_seance s
      WHERE s.annee_scolaire = ? AND COALESCE(s.annule, 0) = 0 ${section ? 'AND (s.section IS NULL OR s.section = ?)' : ''}
        AND (s.ue_num = ? OR s.cours_code IN (SELECT cours_code FROM cours WHERE ue_num = ? AND annee_scolaire = ?))`)
      .all(...(section ? [annee, section] : [annee]), ue, ue, annee).map(x => x.date);
    const d = jalonDesSeances(dates, pct);
    if (d) return { date: d, source: 'horaire' };
  }
  const o = orgs.filter(x => x.date_debut && x.date_fin && x.date_fin >= x.date_debut)
    .sort((a, b) => ((a.num_organisation === numOrganisation) ? -1 : 0) - ((b.num_organisation === numOrganisation) ? -1 : 0)
      || String(a.date_debut).localeCompare(String(b.date_debut)))[0];
  if (!o) return null;
  return { date: iso(jour(o.date_debut) + (jour(o.date_fin) - jour(o.date_debut)) * pct / 100), source: 'dates' };
}

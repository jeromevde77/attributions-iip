// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Calcul des dates d'échéance
//
// Grammaire de `echeance_type.regle_date` :
//   fixe:JJ/MM               → chaque année à cette date
//   mensuel:gedi             → dates-limites GEDI (table DATES_GEDI par année)
//   mensuel_ouvrables:N      → N premiers jours ouvrables de chaque mois
//   rel:<ancre><±><N><unité> → relatif à un événement
//        ancres : ue_debut, ue_fin, engagement, publication, deliberation,
//                 absence_debut, contrat_fin, evenement
//        unités : j     = jours calendrier
//                 jo    = jours ouvrables (tous sauf dimanche et fériés légaux — RGE art. 29)
//                 jc_hc = jours calendrier hors congés scolaires (D. 16/04/1991 art. 123ter)
//                 pc    = pourcentage de la durée de l'UE (ex. +10pc = 1/10)
//                 m     = mois
//                 sem   = semaines
//   manuelle                 → aucune date calculée
// ─────────────────────────────────────────────────────────────────────────────

// ── Utilitaires de date (ISO YYYY-MM-DD, sans dépendance externe) ───────────
export function iso(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const j = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}
export function parseISO(s) {
  const [y, m, j] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, j));
}
export function ajouterJours(dateISO, n) {
  const d = parseISO(dateISO);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export function ajouterMois(dateISO, n) {
  const d = parseISO(dateISO);
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  // Gérer les fins de mois (31 janvier + 1 mois = 28/29 février)
  const dernierJour = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernierJour));
  return iso(d);
}
export function diffJours(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

// ── Jours fériés légaux belges ──────────────────────────────────────────────
function paques(annee) {
  // Algorithme de Meeus/Jones/Butcher
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}

/** Jours fériés légaux belges pour une année civile (Set de dates ISO). */
export function feriesLegaux(annee) {
  const p = paques(annee);
  const plus = (n) => { const d = new Date(p); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  return new Set([
    `${annee}-01-01`,          // Jour de l'an
    plus(1),                   // Lundi de Pâques
    `${annee}-05-01`,          // Fête du travail
    plus(39),                  // Ascension
    plus(50),                  // Lundi de Pentecôte
    `${annee}-07-21`,          // Fête nationale
    `${annee}-08-15`,          // Assomption
    `${annee}-11-01`,          // Toussaint
    `${annee}-11-11`,          // Armistice
    `${annee}-12-25`,          // Noël
  ]);
}

const _cacheFeries = new Map();
function estFerie(dateISO) {
  const an = Number(dateISO.slice(0, 4));
  if (!_cacheFeries.has(an)) _cacheFeries.set(an, feriesLegaux(an));
  return _cacheFeries.get(an).has(dateISO);
}

/**
 * Jour ouvrable au sens du RGE (art. 29) : « tous les jours de la semaine,
 * à l'exception du dimanche et des jours fériés légaux ».
 * ⚠️ Le samedi EST un jour ouvrable dans cette définition.
 */
export function estJourOuvrable(dateISO) {
  const d = parseISO(dateISO);
  if (d.getUTCDay() === 0) return false;   // dimanche
  return !estFerie(dateISO);
}

/** Ajoute N jours ouvrables (RGE) à une date. */
export function ajouterJoursOuvrables(dateISO, n) {
  let d = dateISO, restant = Math.abs(n), pas = n >= 0 ? 1 : -1;
  while (restant > 0) {
    d = ajouterJours(d, pas);
    if (estJourOuvrable(d)) restant--;
  }
  return d;
}

/**
 * Ajoute N jours calendrier « hors congés scolaires » (D. 16/04/1991 art. 123ter :
 * la procédure de recours interne ne peut excéder les sept jours calendrier
 * HORS CONGÉS SCOLAIRES qui suivent la publication des résultats).
 * Les périodes de congé sont lues dans `annee_calendrier` (semaines typées
 * 'vacances' ou 'ferie'). Sans calendrier encodé, on retombe sur les jours
 * calendrier simples en excluant les fériés légaux.
 */
export function ajouterJoursHorsConges(dateISO, n, estEnConge) {
  let d = dateISO, restant = n;
  let garde = 0;
  while (restant > 0 && garde < 400) {
    d = ajouterJours(d, 1);
    garde++;
    if (!estEnConge(d)) restant--;
  }
  return d;
}

/**
 * Construit un prédicat « ce jour est en congé scolaire » à partir
 * d'annee_calendrier (semaines de type 'vacances' ou 'ferie').
 */
export function chargerPeriodesConges(db, anneeScolaire) {
  let semaines = [];
  try {
    semaines = db.prepare(`
      SELECT date_debut, date_fin, type FROM annee_calendrier
      WHERE annee_scolaire = ? AND type IN ('vacances','ferie')
    `).all(anneeScolaire) || [];
  } catch { semaines = []; }

  return function estEnConge(dateISO) {
    if (estFerie(dateISO)) return true;
    for (const s of semaines) {
      // La semaine va du lundi (date_debut) au vendredi (date_fin) : on couvre
      // jusqu'au dimanche pour ne pas laisser un week-end de congé compter.
      if (dateISO >= s.date_debut && dateISO <= ajouterJours(s.date_fin, 2)) return true;
    }
    return false;
  };
}

// ── Calcul principal ────────────────────────────────────────────────────────

/**
 * Calcule la (ou les) date(s) d'échéance pour un type donné.
 * @returns {Array<{date_due:string, libelle?:string, source_type?:string, source_id?:number}>}
 */
export function calculerDates(regle, ctx = {}) {
  const { anneeScolaire, anneeDebut, ancres = {}, estEnConge, datesGedi = [] } = ctx;
  if (!regle || regle === 'manuelle') return [];

  // ── fixe:JJ/MM ──
  let m = /^fixe:(\d{2})\/(\d{2})$/.exec(regle);
  if (m) {
    const [, jour, mois] = m;
    // L'année scolaire court d'août à juillet : les mois ≥ 08 sont sur l'année
    // de début, les mois ≤ 07 sur l'année suivante.
    const an = Number(mois) >= 8 ? anneeDebut : anneeDebut + 1;
    return [{ date_due: `${an}-${mois}-${jour}` }];
  }

  // ── mensuel:gedi ──
  if (regle === 'mensuel:gedi') {
    return datesGedi.map(g => ({ date_due: g.date, libelle: g.libelle }));
  }

  // ── mensuel_ouvrables:N ──
  m = /^mensuel_ouvrables:(\d+)$/.exec(regle);
  if (m) {
    const n = Number(m[1]);
    const out = [];
    for (let i = 0; i < 12; i++) {
      // mois de septembre (année de début) à août (année suivante)
      const moisAbs = 8 + i;                       // 8 = septembre (index 0-based : 8)
      const an = anneeDebut + Math.floor(moisAbs / 12);
      const mo = (moisAbs % 12) + 1;
      let d = `${an}-${String(mo).padStart(2, '0')}-01`;
      // N-ième jour ouvrable du mois
      let compte = estJourOuvrable(d) ? 1 : 0;
      while (compte < n) { d = ajouterJours(d, 1); if (estJourOuvrable(d)) compte++; }
      const moisPrec = mo === 1 ? 12 : mo - 1;
      out.push({ date_due: d, libelle: `relevé de ${NOM_MOIS[moisPrec - 1]}` });
    }
    return out;
  }

  // ── rel:<ancre><±><N><unité> ──
  m = /^rel:([a-z_]+)([+-])(\d+)(jo|jc_hc|pc|sem|m|j)$/.exec(regle);
  if (m) {
    const [, ancre, signe, nStr, unite] = m;
    const base = ancres[ancre];
    if (!base) return [];
    const n = Number(nStr) * (signe === '-' ? -1 : 1);
    let date;
    switch (unite) {
      case 'j':     date = ajouterJours(base, n); break;
      case 'jo':    date = ajouterJoursOuvrables(base, n); break;
      case 'sem':   date = ajouterJours(base, n * 7); break;
      case 'm':     date = ajouterMois(base, n); break;
      case 'jc_hc': {
        const pred = estEnConge || (() => false);
        date = n >= 0 ? ajouterJoursHorsConges(base, n, pred) : ajouterJours(base, n);
        break;
      }
      case 'pc': {
        // pourcentage de la durée de l'UE : nécessite ancres.ue_debut et ue_fin
        const deb = ancres.ue_debut, fin = ancres.ue_fin;
        if (!deb || !fin) return [];
        const duree = diffJours(deb, fin);
        date = ajouterJours(deb, Math.round(duree * n / 100));
        break;
      }
      default: return [];
    }
    return [{ date_due: date }];
  }

  return [];
}

const NOM_MOIS = ['janvier','février','mars','avril','mai','juin',
                  'juillet','août','septembre','octobre','novembre','décembre'];

/** Extrait l'année de début d'un code d'année scolaire « 2026-2027 ». */
export function anneeDebutDe(anneeScolaire) {
  const m = /^(\d{4})/.exec(String(anneeScolaire || ''));
  return m ? Number(m[1]) : new Date().getUTCFullYear();
}

export default { calculerDates, estJourOuvrable, ajouterJoursOuvrables,
                 ajouterJoursHorsConges, chargerPeriodesConges, feriesLegaux,
                 ajouterJours, ajouterMois, diffJours, iso, parseISO, anneeDebutDe };

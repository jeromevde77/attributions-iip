// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Calcul de l'ancienneté de service (promotion sociale)
//
// Base légale :
//   Art. 29bis (statut LS 01/02/1993) — règle générale
//   Art. 29ter (inséré D. 19-12-2002)  — dérogation promotion sociale
//
// Règles IIP (choix du PO : ancienneté par COURS, pas par fonction) :
//
// PAR COURS, PAR ANNÉE :
//   · < 40 périodes → 0 jour (condition préalable art. 29ter, al. 1er)
//   · CT (charge complète = 800 p/an) :
//       ≥ 400 périodes (≥ 50 %) → 360 j   /   < 400 → 180 j
//   · PP (charge complète = 1000 p/an) :
//       ≥ 500 périodes (≥ 50 %) → 360 j   /   < 500 → 180 j
//
// ANCIENNETÉ PO (art. 29bis § 3 — plafond 360 j/an) :
//   ETP = Σ (périodes ÷ charge_complète) par cours
//   Jours PO = min(360, round(ETP × 360))
//
// Fonctions pures — testables sans serveur.
// ─────────────────────────────────────────────────────────────────────────────

/** Charge complète annuelle selon le type de cours. */
export function chargeComplete(typeCours) {
  return typeCours === 'PP' ? 1000 : 800;
}

/**
 * Jours d'ancienneté acquis dans un cours pour une année (art. 29ter).
 * @param {number} periodes   Périodes attribuées dans ce cours cette année
 * @param {string} typeCours  'CT' ou 'PP'
 * @returns {number} 0 | 180 | 360
 */
export function joursParCours(periodes, typeCours) {
  if (!periodes || periodes < 40) return 0;
  const ref = chargeComplete(typeCours);
  return periodes / ref >= 0.5 ? 360 : 180;
}

/**
 * ETP d'un cours (utilisé pour le cumul PO).
 * @param {number} periodes
 * @param {string} typeCours
 * @returns {number}
 */
export function etpCours(periodes, typeCours) {
  // Le seuil de 40 périodes s'applique aussi à l'ETP PO (art. 29ter) :
  // un cours < 40 p ne contribue ni à l'ancienneté cours, ni à l'ETP PO.
  if (!periodes || periodes < 40) return 0;
  return periodes / chargeComplete(typeCours);
}

/**
 * Jours d'ancienneté PO à partir d'un tableau de services d'une même année.
 * Plafond 360 j/an (art. 29bis § 3).
 * @param {{ periodes: number, type_cours: string }[]} services
 * @returns {{ etp: number, jours: number }}
 */
export function joursAnciennetePO(services) {
  const etp = services.reduce((s, sv) => s + etpCours(sv.periodes, sv.type_cours), 0);
  return { etp: Math.round(etp * 1000) / 1000, jours: Math.min(360, Math.round(etp * 360)) };
}

/**
 * Calcule l'ancienneté complète d'un membre du personnel
 * à partir de ses services groupés par année.
 *
 * @param {{ annee_scolaire: string, periodes: number, type_cours: string,
 *           cours_code: string, cours_nom?: string }[]} services
 * @returns {{ par_annee: object[], total_cours: object, total_po: number }}
 */
export function calculerAnciennete(services) {
  // Grouper par année
  const parAnnee = {};
  for (const s of services) {
    if (!parAnnee[s.annee_scolaire]) parAnnee[s.annee_scolaire] = [];
    parAnnee[s.annee_scolaire].push(s);
  }

  const par_annee = [];
  // Cumul par cours (toutes années)
  const total_cours = {};
  let total_po = 0;

  for (const [annee, svs] of Object.entries(parAnnee).sort()) {
    const lignes = svs.map(s => ({
      ...s,
      charge_complete: chargeComplete(s.type_cours),
      etp: Math.round(etpCours(s.periodes, s.type_cours) * 1000) / 1000,
      jours_cours: joursParCours(s.periodes, s.type_cours),
    }));
    const { etp, jours } = joursAnciennetePO(lignes);
    par_annee.push({ annee_scolaire: annee, lignes, etp_total: etp, jours_po: jours });
    total_po += jours;

    for (const l of lignes) {
      if (!total_cours[l.cours_code]) {
        total_cours[l.cours_code] = { cours_code: l.cours_code, cours_nom: l.cours_nom, jours: 0 };
      }
      total_cours[l.cours_code].jours += l.jours_cours;
    }
  }

  return { par_annee, total_cours: Object.values(total_cours), total_po };
}

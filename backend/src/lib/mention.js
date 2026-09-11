import db from '../db/index.js';

/**
 * LA MENTION DU TITRE — calculée, et non retapée.
 *
 * Elle vivait dans un écran React, sous deux formes également fragiles : les
 * unités déterminantes de TIM écrites en dur dans le code — numéros, intitulés
 * et périodes —, et les cotes SAISIES À LA MAIN puis rangées dans une clé de
 * configuration. Un diplôme se délivrait donc sur des chiffres recopiés à côté
 * de ceux que le Conseil avait arrêtés, sans que rien ne garantisse qu'ils
 * concordent. Et la règle elle-même, deux tiers / un tiers, n'était énoncée
 * nulle part ailleurs que dans une fonction.
 *
 * Elle se calcule désormais sur ce que la maison sait déjà : les unités
 * marquées déterminantes au référentiel, leurs périodes, et les cotes issues
 * des délibérations.
 *
 * LA RÈGLE, ELLE, SE RÈGLE. Les deux tiers et les seuils sont les usages de
 * l'établissement, non une contrainte du décret : ils appartiennent aux règles,
 * là où on peut les lire et les discuter.
 */

export const MENTION_DEFAUT = {
  // Le poids de l'épreuve intégrée dans la note finale. Le reste — les unités
  // déterminantes, pondérées entre elles par leurs périodes — vaut le
  // complément.
  poids_epreuve: 1 / 3,
  // Les seuils, en pour cent. Lus du plus haut au plus bas ; en dessous du
  // dernier, il n'y a pas de mention, et donc pas de titre.
  seuils: [
    { min: 90, libelle: 'La plus grande distinction' },
    { min: 80, libelle: 'Grande distinction' },
    { min: 70, libelle: 'Distinction' },
    { min: 60, libelle: 'Satisfaction' },
    { min: 50, libelle: 'Réussite' },
  ],
};

export function reglesMention() {
  try {
    const row = db.prepare(
      "SELECT valeur FROM lucie_config WHERE cle = 'mention_titre'").get();
    if (!row) return { ...MENTION_DEFAUT };
    const v = JSON.parse(row.valeur) || {};
    const p = Number(v.poids_epreuve);
    const seuils = Array.isArray(v.seuils) && v.seuils.length
      ? v.seuils
        .map(s => ({ min: Number(s.min), libelle: String(s.libelle || '').trim() }))
        .filter(s => Number.isFinite(s.min) && s.libelle)
        .sort((a, b) => b.min - a.min)
      : MENTION_DEFAUT.seuils;
    return {
      // Entre 0 et 1 : au-delà, l'épreuve vaudrait plus que tout le cursus.
      poids_epreuve: Number.isFinite(p) && p >= 0 && p <= 1
        ? p : MENTION_DEFAUT.poids_epreuve,
      seuils,
    };
  } catch { return { ...MENTION_DEFAUT }; }
}

/**
 * @param {Array} determinantes [{ ue_num, periodes, cote }] — cote sur 20, ou null
 * @param {number|null} epreuve  la cote de l'épreuve intégrée, sur 20
 * @returns { pourcent, mention, complet, manquantes[] }
 */
export function calculerMention(determinantes = [], epreuve = null, regles = null) {
  const r = regles || reglesMention();

  const notees = determinantes.filter(u => u.cote != null && Number.isFinite(Number(u.cote)));
  const manquantes = determinantes
    .filter(u => u.cote == null || !Number.isFinite(Number(u.cote)))
    .map(u => u.ue_num);

  // LES PÉRIODES PONDÈRENT LES DÉTERMINANTES ENTRE ELLES. Une unité de six
  // cents périodes ne pèse pas comme une de soixante — c'est tout le sens de
  // « déterminante », et une moyenne arithmétique le nierait.
  //
  // Une unité sans périodes renseignées ne vaut pas zéro : elle compterait
  // alors pour rien, ce qui reviendrait à l'exclure en silence. On lui donne un
  // poids d'une unité et on le signale en amont, au référentiel.
  let num = 0, den = 0;
  for (const u of notees) {
    const p = Number(u.periodes) > 0 ? Number(u.periodes) : 1;
    num += Number(u.cote) * 5 * p;   // sur 20 → pour cent
    den += p;
  }
  const moyenneDet = den ? num / den : null;

  const e = epreuve == null || !Number.isFinite(Number(epreuve))
    ? null : Number(epreuve) * 5;

  // Sans épreuve intégrée cotée, les déterminantes font toute la note : mieux
  // vaut une mention calculée sur ce qu'on a qu'aucune mention du tout — mais
  // « complet » dit que la pièce manque.
  const finale = moyenneDet == null ? e
    : e == null ? moyenneDet
      : moyenneDet * (1 - r.poids_epreuve) + e * r.poids_epreuve;

  if (finale == null) {
    return { pourcent: null, mention: null, complet: false,
             manquantes, sans_epreuve: e == null };
  }

  const pourcent = Math.round(finale * 10) / 10;
  const seuil = r.seuils.find(s => pourcent >= s.min);

  return {
    pourcent,
    mention: seuil ? seuil.libelle : null,
    // COMPLET veut dire : toutes les déterminantes cotées ET l'épreuve cotée.
    // Une mention annoncée sur un parcours incomplet est une mention fausse —
    // l'écran doit pouvoir la montrer en la disant provisoire.
    complet: manquantes.length === 0 && e != null,
    manquantes,
    sans_epreuve: e == null,
    moyenne_determinantes: moyenneDet == null ? null : Math.round(moyenneDet * 10) / 10,
    pourcent_epreuve: e == null ? null : Math.round(e * 10) / 10,
    poids_epreuve: r.poids_epreuve,
  };
}

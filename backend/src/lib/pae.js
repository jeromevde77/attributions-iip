/**
 * LE MOTEUR DU PAE — UNE SEULE RÈGLE POUR DIRE CE QUI EST ACCESSIBLE
 * (Charles, 28 septembre 2026 : « tout le mécanisme PAE est multiple ; il n'y
 * a pas qu'une seule porte d'entrée, et donc cela crée des bugs »).
 *
 * Sept calculs disaient, chacun à sa façon, ce qu'un étudiant peut suivre : la
 * proposition du PAE, le schéma de la fiche, la frise de la liste, le PAE
 * automatique, la fiche de parcours, la fiche d'inscription, la grille. Ils ne
 * lisaient ni le même niveau, ni les mêmes prérequis, ni la même attente — si
 * bien qu'une unité proposée avec un cadenas dans le PAE s'affichait
 * « indisponible » sur le schéma d'à côté. Ce fichier est la règle ; les
 * écrans la LISENT, ils ne la refont pas.
 *
 * Fonction PURE : aucune lecture en base. Celui qui l'appelle rassemble les
 * faits (unités, prérequis, acquis, attente, plafond) ; elle rend l'état.
 *
 * Les règles, telles que tranchées :
 *   · Un prérequis LÉGAL bloque ; un prérequis INTERNE avertit seulement
 *     (Charles, 28 septembre 2026).
 *   · Est EN ATTENTE ce qui a été AJOURNÉ l'année consultée ou la précédente,
 *     sans réussite depuis. Une unité suivie sans note n'est pas en attente :
 *     « si pas de note, c'est comme si pas acquis » (Charles, 28 septembre).
 *   · Un prérequis en attente ouvre sa suite AVEC UN CADENAS, quel que soit
 *     le niveau : elle ne sera suivie que si la seconde session le réussit
 *     (Charles, 25 septembre).
 *   · Sous réserve : les prérequis manquants sont proposés la même année et
 *     au même niveau (l'épreuve intégrée et ses déterminantes).
 *   · Plafond de bloc : on ne propose que jusqu'au bloc QUI SUIT le plus haut
 *     bloc déjà suivi ou acquis — BA1 pour un primo-inscrit (27 septembre).
 *     Au-delà, l'unité s'ajoute à la main, et la dérogation se trace.
 *   · L'épreuve intégrée ne s'ouvre que lorsque toutes les unités des blocs
 *     inférieurs sont acquises.
 */

const RE_BLOC = /^B[AE](\d+)$/;
export function rangBloc(niv) {
  const m = RE_BLOC.exec(String(niv || '').toUpperCase());
  return m ? Number(m[1]) : 0;
}

/** Plafond : bloc qui suit le plus haut bloc déjà suivi ou acquis. */
export function plafondBloc(suiviesAvant, acquis, niv) {
  const r = [...suiviesAvant, ...acquis].map(n => rangBloc(niv[n])).filter(x => x > 0);
  return (r.length ? Math.max(...r) : 0) + 1;
}

/**
 * @param {object} p
 * @param {Array<{ue_num:number, organisee:boolean, epreuve:boolean}>} p.ues
 *        l'univers : les unités du cursus actif, l'année consultée
 * @param {Object<number,string>} p.niv    niveau effectif de chaque unité (BA1…)
 * @param {Object<number,number[]>} p.legal  prérequis légaux de chaque unité
 * @param {Object<number,{ue:number,motif:string}[]>} p.interne  prérequis internes
 * @param {Set<number>} p.acquis      réussies ou valorisées (dispense complète)
 * @param {Set<number>} p.enAttente   ajournées, sans réussite depuis
 * @param {number|null} p.plafond     rang du bloc plafond, null = aucun
 * @returns {Map<number, object>} l'état de chaque unité
 */
export function etatsPAE({ ues, niv, legal, interne, acquis, enAttente, plafond = null }) {
  const nivDe = n => String(niv[n] || '').toUpperCase();
  const organisees = new Set(ues.filter(u => u.organisee).map(u => u.ue_num));
  const horsBloc = n => plafond != null && rangBloc(niv[n]) > plafond;

  // La chaîne COMPLÈTE des prérequis légaux manquants : s'inscrire à la 256
  // suppose la 255, laquelle suppose la 254.
  const chaine = n => {
    const manquants = new Set(), vus = new Set(), pile = [n];
    while (pile.length) {
      const x = pile.pop();
      if (vus.has(x)) continue;
      vus.add(x);
      for (const p of (legal[x] || [])) {
        if (acquis.has(p)) continue;
        manquants.add(p); pile.push(p);
      }
    }
    return [...manquants].sort((a, b) => a - b);
  };

  const etats = new Map();
  for (const u of ues) {
    const n = u.ue_num;
    const manquants = (legal[n] || []).filter(p => !acquis.has(p));
    const e = {
      deja_reussie: acquis.has(n),
      en_attente: enAttente.has(n) && !acquis.has(n),
      organisee: organisees.has(n),
      epreuve: !!u.epreuve,
      hors_bloc: !acquis.has(n) && horsBloc(n),
      prereq_manquants: manquants,
      prereq_chaine: chaine(n),
      cadenas: manquants.filter(p => enAttente.has(p)),
      avertissements: (interne[n] || []).filter(x => !acquis.has(x.ue)),
      epreuve_etat: null, epreuve_restantes: null,
    };
    if (u.epreuve) {
      const r = rangBloc(niv[n]);
      e.epreuve_restantes = ues
        .filter(x => x.ue_num !== n && rangBloc(niv[x.ue_num]) < r && !acquis.has(x.ue_num))
        .map(x => x.ue_num).sort((a, b) => a - b);
      e.epreuve_etat = e.epreuve_restantes.length ? 'fermee' : 'ouverte';
      e.accessible = e.epreuve_etat === 'ouverte' && !e.deja_reussie;
      e.sous_reserve = false;
    } else {
      e.accessible = !manquants.length && !e.deja_reussie;
      e.sous_reserve = !e.deja_reussie && manquants.length > 0
        && manquants.every(p => organisees.has(p) && nivDe(p) === nivDe(n));
    }
    etats.set(n, e);
  }

  // La proposition : point fixe à l'intérieur d'un niveau.
  const proposees = new Set();
  let stable = false;
  while (!stable) {
    stable = true;
    for (const u of ues) {
      const n = u.ue_num, e = etats.get(n);
      if (proposees.has(n) || e.deja_reussie || e.en_attente || !e.organisee || e.hors_bloc) continue;
      if (e.epreuve) {
        if (e.epreuve_etat === 'ouverte') { proposees.add(n); stable = false; }
        continue;
      }
      const ok = e.prereq_manquants.every(p =>
        (proposees.has(p) && nivDe(p) === nivDe(n)) || enAttente.has(p));
      if (ok) { proposees.add(n); stable = false; }
    }
  }

  for (const [n, e] of etats) {
    e.propose = proposees.has(n);
    // Sous réserve d'une réussite de CETTE année ; le cadenas, lui, attend la
    // seconde session d'une unité de l'an dernier.
    e.propose_sous_reserve = e.propose && e.prereq_manquants.some(p => !enAttente.has(p));
    if (!e.propose) e.cadenas = [];
    // L'état que dessinent le schéma et la frise.
    e.statut = e.deja_reussie ? 'acquise'
      : e.en_attente ? 'en_attente'
      : e.propose && e.prereq_manquants.length ? 'sous_reserve'
      : e.propose ? 'accessible'
      : 'bloquee';
  }
  return etats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES COULEURS QUI VEULENT DIRE QUELQUE CHOSE
//
// Une couleur d'interface est un mot : « HELB » est rose, « IIP » est marine,
// « réussi » est vert. Le mot doit donc s'écrire de la même façon partout —
// à l'écran, sur le papier, dans un tableur.
//
// CE N'ÉTAIT PAS LE CAS. Le même contrat HELB se lisait en rose dans
// Attributions et Référentiels, en violet dans Professeurs et dans l'ancien
// rapport ETP, en cyan dans la feuille de style des badges. Quatre couleurs
// pour un seul fait : personne ne pouvait dire laquelle était la bonne, et
// l'imprimé ne ressemblait à aucun écran.
//
// Elles vivent donc ici, et ici seulement. L'écran les lit et les pose en
// variables CSS ; les documents les lisent pour peindre leurs badges et leurs
// graphiques. UN RÉGLAGE, DEUX LECTEURS — et il est modifiable depuis
// Configuration, parce qu'une couleur qui signifie quelque chose pour l'école
// n'a pas à être décidée dans le code.
//
// Depuis 2.12.194 (Configuration → Thèmes et couleurs), les repères de bloc et
// les deux fonds s'y ajoutent. Les filets et les gris du texte, eux, relèvent
// de la charte et ne se règlent pas.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';

export const COULEURS_DEFAUT = {
  // L'IDENTITÉ — relevée sur le logo (29 septembre 2026). Elle ne dit aucun
  // état : c'est la maison. Les pièces imprimées gardent la charte.
  iip_bleu: { groupe: 'identite', libelle: 'Bleu IIP (logo)', valeur: '#19537E' },
  iip_or:   { groupe: 'identite', libelle: 'Or IIP (logo)',   valeur: '#F9B619' },
  iip_cyan: { groupe: 'identite', libelle: 'Cyan IIP (logo)', valeur: '#05B7E6' },
  // L'ÉCRAN — tout ce qui n'est pas un état. Les défauts sont ceux de la Maison IIP
  // depuis 3.0.2 (« Lucie d'origine » reste un thème qu'on peut rappeler).
  principal:   { groupe: 'ecran', libelle: 'Principal — bouton fort, titres, rubrique ouverte', valeur: '#16406A' },
  accent:      { groupe: 'ecran', libelle: 'Accent — sortir une pièce, liens, focus', valeur: '#0A8FBF' },
  texte:       { groupe: 'ecran', libelle: 'Texte', valeur: '#16406A' },
  donnees:     { groupe: 'ecran', libelle: 'Données — barres, jauges, graphiques', valeur: '#0A8FBF' },
  menu_sombre: { groupe: 'ecran', libelle: 'Menus en mode sombre', valeur: '#0F2A47' },
  // LE SENS — les deux employeurs, les deux natures de cours.
  iip:  { groupe: 'sens', libelle: "Institut (IIP)",    valeur: '#16406A' },
  helb: { groupe: 'sens', libelle: "Haute École (HELB)", valeur: '#D14F8A' },
  ct:   { groupe: 'sens', libelle: 'Cours théorique (CT)',  valeur: '#2F6FB0' },
  pp:   { groupe: 'sens', libelle: 'Pratique professionnelle (PP)', valeur: '#2E8F6E' },
  // LES ÉTATS — une seule grammaire pour tout Lucie (étude du 25 septembre
  // 2026). Chaque état n'a qu'UNE valeur réglée : le liseré. Le fond pâle et
  // le contour s'en DÉDUISENT, sans quoi trois réglages par état finiraient
  // par se contredire.
  reussi:     { groupe: 'etats', libelle: 'Réussi',                 valeur: '#4FA64A' },
  faveur:     { groupe: 'etats', libelle: 'Réussi par faveur',      valeur: '#8E4F9A' },
  disponible: { groupe: 'etats', libelle: 'Disponible, inscrit',    valeur: '#3F7FD0' },
  attente:    { groupe: 'etats', libelle: 'À surveiller (ajourné, échéance proche)', valeur: '#F0922E' },
  refuse:     { groupe: 'etats', libelle: 'À corriger (refus, erreur)', valeur: '#E0564F' },
  // LES REPÈRES — les blocs et l'épreuve intégrée. Ils disent où l'on est,
  // jamais un état.
  ba1:     { groupe: 'blocs', libelle: 'Bloc 1 (BA1)', valeur: '#F9B619' },
  ba2:     { groupe: 'blocs', libelle: 'Bloc 2 (BA2)', valeur: '#19537E' },
  ba3:     { groupe: 'blocs', libelle: 'Bloc 3 (BA3)', valeur: '#16406A' },
  epreuve: { groupe: 'blocs', libelle: 'Épreuve intégrée', valeur: '#C9A227' },
  // LES FONDS — le sol de la page (barre et rail compris, en mode clair : un
  // seul sol) et le gris de ce qui n'est pas encore atteignable.
  fond_page:    { groupe: 'fonds', libelle: 'Fond de la page', valeur: '#FFFFFF' },
  fond_indispo: { groupe: 'fonds', libelle: 'Pas encore atteignable', valeur: '#F4F5F7' },
};

/** Les couleurs en vigueur : les défauts, écrasés par ce qui a été réglé. */
export function couleurs() {
  const out = {};
  for (const [cle, d] of Object.entries(COULEURS_DEFAUT)) out[cle] = d.valeur;
  try {
    const row = db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'couleurs'").get();
    if (row?.valeur) {
      const reglees = JSON.parse(row.valeur);
      for (const [cle, v] of Object.entries(reglees)) {
        // ON NE FAIT CONFIANCE QU'À CE QUI EST UNE COULEUR. Un réglage libre
        // finit tôt ou tard par porter autre chose qu'une couleur — et ce
        // qu'on écrit sans vérifier dans un attribut `fill` ou `style` est une
        // porte ouverte. Seul le dièse suivi de six chiffres hexadécimaux
        // passe ; le reste retombe sur le défaut.
        if (cle in out && /^#[0-9a-fA-F]{6}$/.test(String(v))) out[cle] = v;
      }
    }
  } catch { /* pas de réglage, pas de table : les défauts suffisent */ }
  return out;
}

/** Le même jeu, en variables CSS — ce que l'écran pose sur :root. */
export function couleursCss() {
  return Object.entries(couleurs())
    .map(([cle, v]) => `--c-${cle}: ${v};`).join(' ');
}

export default couleurs;

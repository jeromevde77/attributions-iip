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
  // LE SENS — les deux employeurs, les deux natures de cours.
  iip:  { groupe: 'sens', libelle: "Institut (IIP)",    valeur: '#1B2B4B' },
  helb: { groupe: 'sens', libelle: "Haute École (HELB)", valeur: '#DB2777' },
  ct:   { groupe: 'sens', libelle: 'Cours théorique (CT)',  valeur: '#1D4ED8' },
  pp:   { groupe: 'sens', libelle: 'Pratique professionnelle (PP)', valeur: '#047857' },
  // LES ÉTATS — une seule grammaire pour tout Lucie (étude du 25 septembre
  // 2026). Chaque état n'a qu'UNE valeur réglée : le liseré. Le fond pâle et
  // le contour s'en DÉDUISENT, sans quoi trois réglages par état finiraient
  // par se contredire.
  reussi:     { groupe: 'etats', libelle: 'Réussi',                 valeur: '#3E7D5E' },
  faveur:     { groupe: 'etats', libelle: 'Réussi par faveur',      valeur: '#6B46C1' },
  disponible: { groupe: 'etats', libelle: 'Disponible, inscrit',    valeur: '#2F6FB0' },
  attente:    { groupe: 'etats', libelle: 'À surveiller (ajourné, échéance proche)', valeur: '#B45309' },
  refuse:     { groupe: 'etats', libelle: 'À corriger (refus, erreur)', valeur: '#9D4A38' },
  // LES REPÈRES — les blocs et l'épreuve intégrée. Ils disent où l'on est,
  // jamais un état.
  ba1:     { groupe: 'blocs', libelle: 'Bloc 1 (BA1)', valeur: '#E8890C' },
  ba2:     { groupe: 'blocs', libelle: 'Bloc 2 (BA2)', valeur: '#7FB3D5' },
  ba3:     { groupe: 'blocs', libelle: 'Bloc 3 (BA3)', valeur: '#1B2B4B' },
  epreuve: { groupe: 'blocs', libelle: 'Épreuve intégrée', valeur: '#C9A84C' },
  // LES FONDS — le sol de la page (barre et rail compris, en mode clair : un
  // seul sol) et le gris de ce qui n'est pas encore atteignable.
  fond_page:    { groupe: 'fonds', libelle: 'Fond de la page', valeur: '#F8FAFC' },
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

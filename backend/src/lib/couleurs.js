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
// Ce qui N'EST PAS ici : les tons de l'habillage (gris, filets, fonds), qui
// relèvent de la charte et ne se discutent pas écran par écran.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';

export const COULEURS_DEFAUT = {
  // Les deux employeurs référents : c'est la distinction la plus lue de Lucie.
  iip:  { libelle: "Institut (IIP)",    valeur: '#1B2B4B' },
  helb: { libelle: "Haute École (HELB)", valeur: '#DB2777' },
  // Les deux natures de cours, qui se comparent sans cesse dans les charges.
  ct:   { libelle: 'Cours théorique (CT)',  valeur: '#1D4ED8' },
  pp:   { libelle: 'Pratique professionnelle (PP)', valeur: '#047857' },
  // LES ÉTATS — une seule grammaire pour tout Lucie (étude du 25 septembre
  // 2026, validée par Charles). Chaque état n'a qu'UNE valeur réglée : le
  // liseré. Le fond pâle et le contour s'en DÉDUISENT (11 % et 30 % de la
  // teinte sur du blanc), sans quoi trois réglages par état finiraient par se
  // contredire. « Pas maintenant » et « neutre » sont des gris de la charte :
  // ils ne se règlent pas.
  reussi:     { libelle: 'Réussi',                 valeur: '#3E7D5E' },
  faveur:     { libelle: 'Réussi par faveur',      valeur: '#6B46C1' },
  disponible: { libelle: 'Disponible, ouvert',     valeur: '#2F6FB0' },
  attente:    { libelle: 'À surveiller (ajourné, échéance proche)', valeur: '#B45309' },
  refuse:     { libelle: 'À corriger (refus, erreur)', valeur: '#9D4A38' },
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

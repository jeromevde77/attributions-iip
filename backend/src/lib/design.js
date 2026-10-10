// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LES FORMES ET LES COMPOSANTS, RÉGLABLES PAR ÉCOLE
//
// Charles, 10 octobre 2026 : « Lucie devient mature, elle doit être paramétrable
// et non en dur ; il faut uniformiser ; c'est l'administrateur qui règle. »
// Les couleurs se réglaient déjà (lib/couleurs.js) ; les formes — rayons,
// hauteur des contrôles, liseré des tuiles, ombres, voile, police, échelle du
// texte — étaient écrites en dur dans index.css et tailwind.config.js. Elles
// vivent ici, avec leur valeur de la maison, et l'écran les pose en variables
// `--d-*` (frontend/src/lib/design.js) ; les classes de la maison et l'échelle de
// Tailwind les lisent, avec la valeur de la maison en repli.
// Inventaire et suite du chantier : docs/contexte/inventaire-design-2026-10-10.md.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';

export const DESIGN_DEFAUT = {
  rayon_champ:    { groupe: 'rayons', libelle: 'Champs et boutons', type: 'px', min: 0, max: 18, valeur: 8 },
  rayon_carte:    { groupe: 'rayons', libelle: 'Cartes et tableaux', type: 'px', min: 0, max: 28, valeur: 14 },
  rayon_fenetre:  { groupe: 'rayons', libelle: 'Fenêtres', type: 'px', min: 0, max: 32, valeur: 22 },
  rayon_panneau:  { groupe: 'rayons', libelle: 'Panneaux flottants (rail)', type: 'px', min: 0, max: 32, valeur: 26 },
  rayon_tuile:    { groupe: 'tuiles', libelle: 'Rayon de la tuile', type: 'px', min: 0, max: 20, valeur: 10 },
  tuile_lisere:   { groupe: 'tuiles', libelle: 'Épaisseur du liseré d’état', type: 'px', min: 0, max: 10, valeur: 4 },
  tuile_coins:    { groupe: 'tuiles', libelle: 'Coins côté liseré', type: 'choix', choix: ['droits', 'arrondis'], valeur: 'droits' },
  tuile_chiffre:  { groupe: 'tuiles', libelle: 'Grande tuile — taille du chiffre', type: 'px', min: 13, max: 32, valeur: 17 },
  tuile_espace:   { groupe: 'tuiles', libelle: 'Grande tuile — marge intérieure', type: 'px', min: 4, max: 20, valeur: 10 },
  tuile_compacte_chiffre: { groupe: 'tuiles', libelle: 'Tuile compacte — taille du chiffre', type: 'px', min: 10, max: 18, valeur: 13 },
  rayon_pastille: { groupe: 'tuiles', libelle: 'Rayon des pastilles d’état', type: 'px', min: 0, max: 12, valeur: 4 },
  controle_hauteur: { groupe: 'controles', libelle: 'Hauteur des boutons et des champs', type: 'px', min: 28, max: 48, valeur: 36 },
  bouton_graisse: { groupe: 'controles', libelle: 'Graisse des boutons', type: 'choix', choix: ['500', '600', '700'], valeur: '600' },
  onglet_trait:   { groupe: 'controles', libelle: 'Trait de l’onglet actif', type: 'px', min: 1, max: 4, valeur: 2 },
  titre_carte:    { groupe: 'titres', libelle: 'Titre d’une carte, d’une section', type: 'px', min: 12, max: 22, valeur: 15 },
  titre_graisse:  { groupe: 'titres', libelle: 'Graisse des titres', type: 'choix', choix: ['500', '600', '700'], valeur: '600' },
  intertitre_taille: { groupe: 'titres', libelle: 'Intertitre — taille', type: 'px', min: 9, max: 14, valeur: 11 },
  intertitre_casse:  { groupe: 'titres', libelle: 'Intertitre — casse', type: 'choix', choix: ['majuscules', 'normale'], valeur: 'majuscules' },
  intertitre_espace: { groupe: 'titres', libelle: 'Intertitre — interlettrage (‰)', type: 'nombre', min: 0, max: 150, valeur: 60 },
  intertitre_graisse: { groupe: 'titres', libelle: 'Intertitre — graisse', type: 'choix', choix: ['400', '500', '600', '700'], valeur: '600' },
  tableau_densite: { groupe: 'tableaux', libelle: 'Densité des lignes', type: 'choix', choix: ['serree', 'normale', 'aeree'], valeur: 'normale' },
  tableau_zebre:   { groupe: 'tableaux', libelle: 'Lignes alternées', type: 'choix', choix: ['non', 'oui'], valeur: 'non' },
  tableau_filets:  { groupe: 'tableaux', libelle: 'Filets', type: 'choix', choix: ['horizontaux', 'grille', 'aucun'], valeur: 'horizontaux' },
  tableau_entete_taille: { groupe: 'tableaux', libelle: 'En-tête — taille', type: 'px', min: 9, max: 14, valeur: 11 },
  anneau_epaisseur: { groupe: 'graphiques', libelle: 'Anneau — épaisseur (%)', type: 'nombre', min: 15, max: 100, valeur: 40 },
  barre_hauteur:    { groupe: 'graphiques', libelle: 'Barres horizontales — hauteur', type: 'px', min: 4, max: 24, valeur: 12 },
  jauge_hauteur:    { groupe: 'graphiques', libelle: 'Jauges — hauteur', type: 'px', min: 2, max: 16, valeur: 6 },
  jauge_forme:      { groupe: 'graphiques', libelle: 'Jauges — bouts', type: 'choix', choix: ['arrondis', 'droits'], valeur: 'arrondis' },
  volet_retrait:    { groupe: 'tableaux', libelle: 'Tableau à volets — retrait du détail', type: 'px', min: 0, max: 48, valeur: 24 },
  etape_taille:     { groupe: 'graphiques', libelle: 'Frises — taille des pastilles d’étape', type: 'px', min: 18, max: 40, valeur: 28 },
  graphique_rayon:  { groupe: 'graphiques', libelle: 'Rayon des barres', type: 'px', min: 0, max: 8, valeur: 3 },
  graphique_grille: { groupe: 'graphiques', libelle: 'Quadrillage', type: 'choix', choix: ['pointille', 'plein', 'aucun'], valeur: 'pointille' },
  graphique_legende: { groupe: 'graphiques', libelle: 'Légende', type: 'choix', choix: ['bas', 'haut', 'aucune'], valeur: 'bas' },
  ombre:          { groupe: 'elevations', libelle: 'Ombres', type: 'choix', choix: ['aucune', 'douce', 'normale', 'marquee'], valeur: 'normale' },
  voile:          { groupe: 'elevations', libelle: 'Opacité du voile des fenêtres (%)', type: 'nombre', min: 0, max: 70, valeur: 32 },
  voile_flou:     { groupe: 'elevations', libelle: 'Flou du voile', type: 'px', min: 0, max: 12, valeur: 3 },
  police:         { groupe: 'texte', libelle: 'Police de l’interface', type: 'choix', choix: ['Inter', 'Aptos', 'Système', 'Arial', 'Georgia'], valeur: 'Inter' },
  texte:          { groupe: 'texte', libelle: 'Taille du texte (%)', type: 'nombre', min: 85, max: 125, valeur: 100 },
  titre_ecran:    { groupe: 'texte', libelle: 'Titre d’un écran', type: 'px', min: 14, max: 26, valeur: 17 },
};

/** Une valeur passe si elle est dans les bornes ou dans la liste fermée — sinon on garde celle de la maison. */
export function valide(cle, v) {
  const d = DESIGN_DEFAUT[cle]; if (!d) return undefined;
  if (d.type === 'choix') return d.choix.includes(String(v)) ? String(v) : undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= d.min && n <= d.max ? n : undefined;
}

export function design() {
  const out = Object.fromEntries(Object.entries(DESIGN_DEFAUT).map(([k, d]) => [k, d.valeur]));
  try {
    const v = JSON.parse(db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'design'").get()?.valeur || '{}');
    for (const [k, x] of Object.entries(v)) { const ok = valide(k, x); if (ok !== undefined) out[k] = ok; }
  } catch { /* rien d'enregistré : la maison */ }
  return out;
}

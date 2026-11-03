import { modeActuel, themeActuel } from './theme.js';
import { authHeaders } from './api.js';

/**
 * LES COULEURS QUI VEULENT DIRE QUELQUE CHOSE — côté écran.
 *
 * Le même contrat HELB se lisait en rose dans Attributions et Référentiels, en
 * violet dans Professeurs, en cyan dans la feuille de style des badges, et en
 * violet encore sur le rapport ETP imprimé. Quatre couleurs pour un seul fait :
 * personne ne pouvait dire laquelle était la bonne, et l'imprimé ne ressemblait
 * à aucun écran.
 *
 * Elles sont désormais réglées en un seul endroit, côté serveur, et lues ici
 * pour être posées en variables CSS sur la racine. Un composant n'écrit plus
 * jamais « #DB2777 » : il écrit « var(--c-helb) », et la maison décide.
 *
 * ON POSE AVANT DE DEMANDER. Les valeurs par défaut sont écrites tout de suite,
 * pour qu'aucun écran ne s'affiche en noir et blanc le temps d'un aller-retour
 * réseau ; la réponse du serveur ne fait que les corriger si elles ont été
 * réglées.
 */

/* LE DÉFAUT EST LA MAISON IIP (3.0.2, Charles : « tu n'as pas mis Maison IIP
   de base »). « Lucie d'origine » reste un thème qu'on peut rappeler. */
export const ORIGINE = {
  principal: '#1B2B4B', accent: '#00AACC', texte: '#1B2B4B', donnees: '#00AACC', menu_sombre: '#0F1A2E',
  iip: '#1B2B4B', helb: '#DB2777', ct: '#1D4ED8', pp: '#047857',
  reussi: '#3E7D5E', faveur: '#6B46C1', disponible: '#2F6FB0', attente: '#B45309', refuse: '#9D4A38',
  ba1: '#E8890C', ba2: '#7FB3D5', ba3: '#1B2B4B', epreuve: '#C9A84C',
};

export const DEFAUT = {
  iip_bleu: '#19537E', iip_or: '#F9B619', iip_cyan: '#05B7E6',
  principal: '#16406A', accent: '#0A8FBF', texte: '#16406A', donnees: '#0A8FBF', menu_sombre: '#0F2A47',
  iip: '#16406A', helb: '#D14F8A', ct: '#2F6FB0', pp: '#2E8F6E',
  reussi: '#4FA64A', faveur: '#8E4F9A', disponible: '#3F7FD0', attente: '#F0922E', refuse: '#E0564F',
  ba1: '#F9B619', ba2: '#05B7E6', ba3: '#16406A', epreuve: '#C9A227',
  fond_page: '#FFFFFF', fond_indispo: '#F4F5F7',
};

/* L'ÉCHELLE DES GRIS À PARTIR D'UNE TEINTE (2.12.198). La teinte choisie
 * fait le 500 ; les clairs se mélangent au blanc, les foncés au noir, dans les
 * proportions de l'échelle de Tailwind. Rendue en canaux RVB, comme les jeux
 * « ardoise » et « neutre » d'index.css, pour que les opacités fonctionnent. */
const MELANGE = { 50: ['b', .04], 100: ['b', .08], 200: ['b', .16], 300: ['b', .3], 400: ['b', .62],
  500: ['b', 1], 600: ['n', .2], 700: ['n', .38], 800: ['n', .6], 900: ['n', .76], 950: ['n', .9] };
export function echelleGris(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return null;
  const c = [1, 2, 3].map(i => parseInt(m[i], 16));
  return Object.fromEntries(Object.entries(MELANGE).map(([n, [vers, k]]) => [
    `--gris-${n}`, c.map(x => Math.round(vers === 'b' ? 255 - (255 - x) * k : x * (1 - k))).join(' ')]));
}

/** Les gris : « ardoise » (d'origine), « neutre », ou une teinte #RRGGBB. */
export function poserGris(jeu) {
  const racine = document.documentElement;
  const echelle = echelleGris(jeu);
  for (const n of Object.keys(MELANGE)) racine.style.removeProperty(`--gris-${n}`);
  if (echelle) { delete racine.dataset.gris; for (const [k, v] of Object.entries(echelle)) racine.style.setProperty(k, v); }
  else if (jeu === 'neutre' || jeu === 'apple' || jeu === 'sombre') racine.dataset.gris = jeu;
  else delete racine.dataset.gris;
}

/* TOUT LUCIE LIT LES RÉGLAGES (29 septembre 2026, Charles : « TOUT doit être
 * paramétrable dans Config »). Deux mille sept cents classes Tailwind
 * nommaient une couleur fixe — emerald, amber, red, violet… — que rien ne
 * pouvait atteindre. On ne les réécrit pas : chaque famille lit désormais
 * l'échelle d'un réglage (tailwind.config.js), calculée ici comme celle des
 * gris. « emerald » veut dire « réussi », et c'est la maison qui en choisit la
 * nuance. */
export const ECHELLES = ['reussi', 'attente', 'refuse', 'faveur', 'disponible', 'accent', 'principal', 'helb', 'donnees'];
const canaux = hex => { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : null; };
export function echelle(hex) {
  const c = canaux(hex);
  if (!c) return null;
  return Object.fromEntries(Object.entries(MELANGE).map(([n, [vers, k]]) => [n,
    c.map(x => Math.round(vers === 'b' ? 255 - (255 - x) * k : x * (1 - k))).join(' ')]));
}

/* LES ÉTATS N'ONT QUE QUATRE VALEURS, ET AUCUNE AUTRE (Charles, 29 septembre
 * 2026 : « il n'y a pas ce ton dans le modèle ; reste à ce qui est dans la
 * configuration »). Une échelle de onze nuances calculées inventait des tons —
 * un brun sous l'ocre, un vert bouteille sous le vert — qu'aucun réglage ne
 * porte. Pour un état, les classes de Tailwind ne produisent donc que ce que
 * dit le modèle de la tuile : le FOND PÂLE (11 %), le CONTOUR (30 %), la
 * COULEUR elle-même, et l'ENCRE du texte — la couleur ne va jamais au texte.
 *   50–100 blanc · 200–300 le gris des filets · 400–700 la couleur · 800–950 l'encre
 * Les échelles de l'accent, du principal et des données restent graduées :
 * elles servent au survol et aux nuances d'une série, pas à un état. */
export const ETATS_REGLES = ['reussi', 'attente', 'refuse', 'faveur', 'disponible', 'accent', 'helb'];
const pale = (c, k) => c.map(x => Math.round(255 - (255 - x) * k)).join(' ');
export function echelleEtat(hex) {
  const c = canaux(hex);
  if (!c) return null;
  const e = {};
  // PLUS DE PÂLE (Charles, 29 septembre 2026 : « trop de teintes partout ») :
  // les fonds clairs d'un état sont BLANCS, ses contours ceux des filets.
  for (const n of [50, 100]) e[n] = '255 255 255';
  for (const n of [200, 300]) e[n] = 'var(--gris-200)';
  for (const n of [400, 500, 600, 700]) e[n] = c.join(' ');
  for (const n of [800, 900, 950]) e[n] = 'var(--c-texte-rgb)';
  return e;
}
const echelleDe = (cle, valeur) => (ETATS_REGLES.includes(cle) ? echelleEtat(valeur) : echelle(valeur));

export function poser(jeu, racine = document.documentElement) {
  for (const [cle, valeur] of Object.entries(jeu || {})) {
    // Une zone sans valeur SUIT une autre (3.1.250) : on retire sa variable, le repli du CSS reprend.
    if (valeur == null || valeur === '') { racine.style.removeProperty(`--c-${cle}`); racine.style.removeProperty(`--c-${cle}-rgb`); continue; }
    if (/^#[0-9a-fA-F]{6}$/.test(String(valeur))) {
      racine.style.setProperty(`--c-${cle}`, valeur);
      racine.style.setProperty(`--c-${cle}-rgb`, canaux(valeur).join(' '));
      if (ECHELLES.includes(cle)) {
        for (const [n, v] of Object.entries(echelleDe(cle, valeur))) racine.style.setProperty(`--e-${cle}-${n}`, v);
      }
    }
  }
}

/** Les mêmes variables, en objet de style — pour un aperçu qui montre ce qui SERA. */
export function variables(jeu) {
  const out = {};
  for (const [cle, valeur] of Object.entries(jeu || {})) {
    const c = canaux(valeur);
    if (!c) continue;
    out[`--c-${cle}`] = valeur; out[`--c-${cle}-rgb`] = c.join(' ');
    if (ECHELLES.includes(cle)) for (const [n, v] of Object.entries(echelleDe(cle, valeur))) out[`--e-${cle}-${n}`] = v;
  }
  return out;
}

/* LE THÈME SOMBRE (3.1.266) — ses valeurs vivent ici, une seule fois : Configuration les propose à
 * l'école, et le bouton lune de la barre du haut les pose POUR SOI (12 octobre 2026, Charles :
 * « quand je clique sur nuit, je veux le mode sombre »). Le choix est personnel, gardé dans ce
 * navigateur (lib/theme.js) ; les couleurs de l'école ne changent pas. */
export const COULEURS_SOMBRE = { principal: '#5B9BD5', accent: '#3FC1E8', texte: '#E4E8EE', donnees: '#5B9BD5', menu_sombre: '#17191C',
               iip: '#7FB3E6', helb: '#E07AA6', ct: '#6FA0DD', pp: '#4FB58E',
               reussi: '#4FB06A', faveur: '#A879C9', disponible: '#5B9BE0', attente: '#F0A040', refuse: '#E66A62',
               ba1: '#F9B619', ba2: '#05B7E6', ba3: '#7FB3E6', epreuve: '#D4AF37',
               fond_page: '#17191C', fond_indispo: '#2A2E34', fond_menus: '#17191C', fond_carte: '#1B1E22', fond_entete: '#24282E',
               fond_ligne: '#1F2226', fond_survol: '#2A2F36', fond_tuile: '#23272D', fond_champ: '#262A30', filet: '#353A42',
               sous_menu: '#6FA8DC', fenetre_bandeau: '#2A3038', fenetre_titre: '#F2F4F7', fenetre_corps: '#202328',
               titre: '#E9EDF2', intertitre: '#9AA3AF', tableau_total: '#2A3038', fond_volet: '#24282E',
               serie_1: '#5B9BD5', serie_2: '#3FC1E8', serie_3: '#F9B619', serie_4: '#A879C9', serie_5: '#4FB06A', serie_6: '#E07AA6',
               graphique_vide: '#3A4048', graphique_grille: '#33383F', graphique_piste: '#2E333A' };

/* LE FOND DE LA PAGE A TOUJOURS LA COULEUR DU RAIL ET DE LA BARRE DU HAUT (3.5.046, Charles : « j'insiste ») : dans chaque
 * thème, fond_menus = fond_page. Métal : les gris d'Apple (« dans les tons de gris, genre Apple » ; « il n'y a pas de bordure, les teintes de gris sont plus
 * proches » — apple.com, deux captures) : page et menus #F5F5F7 (la règle : le fond a la couleur du rail), cartes et tuiles BLANCHES sans bordure, une ombre douce
 * qui naît au survol (index.css, `[data-theme="metal"]`), texte
 * #1D1D1F, le bleu d'Apple (#0071E3) pour l'action, l'orange (#BF4800) pour ce qui est à surveiller.
 * MÉTAL ET PASTEL (3.5.037, Charles : « j'aimerais aussi un métal et un pastel »). Comme le Sombre : des couleurs
 * seulement, qu'on pose pour soi (bouton palette de la barre du haut) ou que l'école adopte (Thèmes et couleurs). Les
 * états gardent leur sens (Pastel : fond BLANC — Charles, 1er novembre 2026 : « le fond est moche, il faut garder un fond blanc ») — vert réussi, ocre à surveiller, brique à corriger, violet faveur — dans la nuance du thème. */
export const COULEURS_METAL = { principal: '#1D1D1F', accent: '#0071E3', texte: '#1D1D1F', donnees: '#6E6E73', menu_sombre: '#1D1D1F',
               iip: '#1D1D1F', helb: '#B5577F', ct: '#6E6E73', pp: '#4E7A5E',
               reussi: '#248A3D', faveur: '#8944AB', disponible: '#0071E3', attente: '#BF4800', refuse: '#D70015',
               ba1: '#C9A227', ba2: '#5FA8C2', ba3: '#1D1D1F', epreuve: '#B8973A',
               fond_page: '#F5F5F7', fond_indispo: '#EDEDF0', fond_menus: '#F5F5F7', fond_carte: '#FFFFFF', fond_entete: '#FAFAFC',
               fond_ligne: '#FFFFFF', fond_tuile: '#FFFFFF', fond_champ: '#FFFFFF', filet: '#F0F0F2', fond_survol: '#F7F7F9',
               fenetre_bandeau: '#1D1D1F', bouton_fort: '#0071E3', segment_actif: '#1D1D1F',
               titre: '#1D1D1F', intertitre: '#6E6E73' };
/* LE NOUVEAU STYLE, À L'ESSAI (3.5.103, Charles : « basé sur apple.com, en gardant le bleu, pas de noir » ; « fond blanc uni
   partout ; le rail devient une parenthèse » ; prototype validé, à essayer dans la vraie Lucie). Fond blanc partout, texte marine,
   bleu du logo pour les actions, filets très pâles. */
export const COULEURS_NOUVEAU = { principal: '#16406A', accent: '#1F78BE', texte: '#16406A', donnees: '#1F78BE', menu_sombre: '#16406A',
               fond_page: '#FFFFFF', fond_indispo: '#F6F8FB', fond_menus: '#FFFFFF', fond_carte: '#FFFFFF', fond_entete: '#FFFFFF',
               fond_regroupement: '#FFFFFF', fond_ligne: '#FFFFFF', fond_tuile: '#FFFFFF', fond_champ: '#FFFFFF', filet: '#EDEEF2', fond_survol: '#F6F8FB',
               fenetre_bandeau: '#16406A', bouton_fort: '#1F78BE', segment_actif: '#1F78BE', titre: '#16406A', intertitre: '#8A9BB2' };
export const COULEURS_PASTEL = { principal: '#5A6FA8', accent: '#5FAFC2', texte: '#3A4466', donnees: '#7FA7D9', menu_sombre: '#4A5A8A',
               iip: '#5A6FA8', helb: '#D97FA8', ct: '#7FA7D9', pp: '#6DB896',
               reussi: '#5BAA7A', faveur: '#9D7FD0', disponible: '#6F9AD6', attente: '#E39A50', refuse: '#DB7070',
               ba1: '#F3C95C', ba2: '#86CDE3', ba3: '#8C9ED6', epreuve: '#D4B062',
               fond_page: '#FFFFFF', fond_indispo: '#F3F2F8', fond_menus: '#FFFFFF', fond_carte: '#FFFFFF', fond_entete: '#EEF0FA',
               fond_tuile: '#FFFFFF', fond_champ: '#FFFFFF', filet: '#E2DDEB', fenetre_bandeau: '#6F82BC',
               titre: '#4A5788', intertitre: '#878DA8' };
/** Le thème de chacun : ses couleurs et son jeu de gris. « ecole » : rien par-dessus les couleurs de l'école. */
export const THEMES_PERSONNELS = {
  ecole:  { nom: 'Maison IIP', texte: "Les couleurs de l'école", couleurs: null, gris: null },
  sombre: { nom: 'Sombre', texte: 'Gris foncés, texte clair', couleurs: COULEURS_SOMBRE, gris: 'sombre' },
  metal:  { nom: 'Métal', texte: 'Blanc et gris d’Apple, sans bordure', couleurs: COULEURS_METAL, gris: 'apple' },
  pastel: { nom: 'Pastel', texte: 'Tons doux sur fond blanc', couleurs: COULEURS_PASTEL, gris: 'neutre' },
  nouveau: { nom: 'Nouveau style', texte: 'À l’essai : fond blanc, rail en parenthèse', couleurs: COULEURS_NOUVEAU, gris: 'neutre' },
};
const CLES_PERSO = [...new Set([COULEURS_SOMBRE, COULEURS_METAL, COULEURS_PASTEL, COULEURS_NOUVEAU].flatMap(Object.keys))];
function poserThemePerso() {
  const t = THEMES_PERSONNELS[themeActuel()];
  if (t?.couleurs) { poser(t.couleurs); poserGris(t.gris); }
}

/** À l'ouverture de l'application, et après chaque réglage. */
export async function chargerCouleurs() {
  // Repartir propre : ce que le thème sombre avait posé et que l'école ne règle pas doit s'effacer.
  poser(Object.fromEntries(CLES_PERSO.map(k => [k, null])));
  poser(DEFAUT);
  poserThemePerso();   // tout de suite, sans attendre le serveur
  try {
    const rep = await fetch('/api/config/couleurs', { headers: authHeaders() });
    if (!rep.ok) return DEFAUT;
    const j = await rep.json();
    poser(j.couleurs);
    poserGris(j.gris);
    // Le thème de chacun, par-dessus les couleurs de l'école.
    poserThemePerso();
    return j.couleurs;
  } catch {
    // Hors ligne ou session expirée : les défauts tiennent l'écran debout.
    return DEFAUT;
  }
}

export default chargerCouleurs;

/** Les couleurs des graphiques, RÉSOLUES (3.1.254) : recharts les pose en attributs
 *  SVG, où une variable CSS ne se lit pas. On lit donc la valeur calculée. */
export function couleursGraphique() {
  const st = getComputedStyle(document.documentElement);
  const v = n => st.getPropertyValue(n).trim();
  return { series: [1, 2, 3, 4, 5, 6].map(i => v(`--g-${i}`)), vide: v('--g-vide'), grille: v('--g-grille'),
    reference: v('--g-ref'), principal: v('--c-principal'), helb: v('--c-helb'), iip: v('--c-iip') };
}

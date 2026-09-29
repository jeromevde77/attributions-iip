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

export const DEFAUT = {
  iip_bleu: '#19537E', iip_or: '#F9B619', iip_cyan: '#05B7E6',
  principal: '#1B2B4B', accent: '#00AACC', texte: '#1B2B4B', donnees: '#00AACC', menu_sombre: '#0F1A2E',
  iip: '#1B2B4B', helb: '#DB2777', ct: '#1D4ED8', pp: '#047857',
  reussi: '#3E7D5E', faveur: '#6B46C1', disponible: '#2F6FB0', attente: '#B45309', refuse: '#9D4A38',
  ba1: '#E8890C', ba2: '#7FB3D5', ba3: '#1B2B4B', epreuve: '#C9A84C',
  fond_page: '#F8FAFC', fond_indispo: '#F4F5F7',
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
  else if (jeu === 'neutre') racine.dataset.gris = 'neutre';
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

/** À l'ouverture de l'application, et après chaque réglage. */
export async function chargerCouleurs() {
  poser(DEFAUT);
  try {
    const rep = await fetch('/api/config/couleurs', { headers: authHeaders() });
    if (!rep.ok) return DEFAUT;
    const j = await rep.json();
    poser(j.couleurs);
    poserGris(j.gris);
    return j.couleurs;
  } catch {
    // Hors ligne ou session expirée : les défauts tiennent l'écran debout.
    return DEFAUT;
  }
}

export default chargerCouleurs;

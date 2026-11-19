/* LA TAILLE DE L'ÉCRAN (3.5.582, Charles, 19 novembre 2026 : « ce que je veux, c'est que tu changes la taille de la mise en page »
 * — pour projeter). Toute la page de Lucie grandit et se remet en page à cette taille, comme le zoom du navigateur : `zoom` posé
 * sur la racine du document. Gardée sur cet appareil (`localStorage`), relue au démarrage avant le premier rendu. */
export const TAILLES = [100, 115, 125, 150, 175, 200];
const CLE = 'lucie.tailleEcran';

export function tailleGardee() {
  try { const t = Number(localStorage.getItem(CLE)); return TAILLES.includes(t) ? t : 100; } catch { return 100; }
}

export function poserTaille(t) {
  const v = TAILLES.includes(t) ? t : 100;
  document.documentElement.style.zoom = v === 100 ? '' : String(v / 100);
  try { if (v === 100) localStorage.removeItem(CLE); else localStorage.setItem(CLE, String(v)); } catch { /* sans stockage, pour cette fois */ }
  window.dispatchEvent(new CustomEvent('lucie:taille', { detail: v }));
  window.dispatchEvent(new Event('resize'));   // rail, titre et graphiques se remesurent
  return v;
}

export function installerTaille() { const t = tailleGardee(); if (t !== 100) document.documentElement.style.zoom = String(t / 100); }

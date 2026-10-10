import { authHeaders } from './api.js';

/**
 * LES FORMES ET LES COMPOSANTS, RÉGLABLES PAR ÉCOLE (3.1.248, Charles, 10 octobre
 * 2026 : « Lucie doit être paramétrable et non en dur »). Le catalogue vit côté
 * serveur (backend/src/lib/design.js) ; ici, on pose les variables `--d-*` que lisent
 * index.css et tailwind.config.js — avec la valeur de la maison en repli, si bien
 * qu'un écran sans réglage ne change pas.
 */
export const DESIGN_MAISON = {
  rayon_champ: 8, rayon_carte: 14, rayon_fenetre: 22, rayon_panneau: 26, rayon_tuile: 10, tuile_lisere: 4,
  tuile_coins: 'droits', rayon_pastille: 4, tuile_chiffre: 17, tuile_espace: 10, tuile_compacte_chiffre: 13, controle_hauteur: 36, bouton_graisse: '600', onglet_trait: 2,
  ombre: 'normale', voile: 32, voile_flou: 3, police: 'Inter', texte: 100, titre_ecran: 17,
};
const POLICES = {
  Inter: "'Inter', 'Aptos', system-ui, Arial, sans-serif",
  Aptos: "'Aptos', 'Inter', system-ui, Arial, sans-serif",
  'Système': "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  Arial: "Arial, Helvetica, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
};
const OMBRES = { aucune: 0, douce: 0.5, normale: 1, marquee: 1.6 };

/** Les variables CSS d'un jeu de réglages (servent aussi à l'aperçu). */
export function variablesDesign(v = {}) {
  const d = { ...DESIGN_MAISON, ...v };
  const k = OMBRES[d.ombre] ?? 1;
  const a = x => Math.round(x * k * 1000) / 1000;
  return {
    '--d-rayon-champ': `${d.rayon_champ}px`, '--d-rayon-carte': `${d.rayon_carte}px`,
    '--d-rayon-fenetre': `${d.rayon_fenetre}px`, '--d-rayon-panneau': `${d.rayon_panneau}px`,
    '--d-rayon-tuile': `${d.rayon_tuile}px`, '--d-tuile-lisere': `${d.tuile_lisere}px`,
    '--d-tuile-coin': d.tuile_coins === 'arrondis' ? `${d.rayon_tuile}px` : '0px',
    '--d-rayon-pastille': `${d.rayon_pastille}px`, '--d-tuile-chiffre': `${d.tuile_chiffre}px`,
    '--d-tuile-pad-v': `${Math.round(d.tuile_espace * 0.8)}px`, '--d-tuile-pad-h': `${Math.round(d.tuile_espace * 1.2)}px`,
    '--d-tuile-compacte-chiffre': `${d.tuile_compacte_chiffre}px`, '--d-controle-h': `${d.controle_hauteur}px`,
    '--d-bouton-graisse': String(d.bouton_graisse), '--d-onglet-trait': `${d.onglet_trait}px`,
    '--d-ombre-pose': k ? `0 1px 2px rgba(11,21,45,${a(0.06)})` : 'none',
    '--d-ombre-flottant': k ? `0 20px 50px -18px rgba(11,21,45,${a(0.35)})` : 'none',
    '--d-ombre-dessus': k ? `0 30px 70px -20px rgba(11,21,45,${a(0.45)})` : 'none',
    '--d-voile': String(d.voile / 100), '--d-voile-flou': `${d.voile_flou}px`,
    '--d-police': POLICES[d.police] || POLICES.Inter, '--d-texte': String(d.texte / 100),
    '--d-titre-ecran': `${d.titre_ecran}px`,
  };
}
export function poserDesign(v) {
  const r = document.documentElement.style;
  for (const [k, x] of Object.entries(variablesDesign(v))) r.setProperty(k, x);
}
export async function chargerDesign() {
  try {
    const rep = await fetch('/api/config/design', { headers: authHeaders() });
    if (!rep.ok) return DESIGN_MAISON;
    const j = await rep.json();
    poserDesign(j.design);
    return j.design;
  } catch { return DESIGN_MAISON; }
}

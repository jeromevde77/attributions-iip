/**
 * LE RELAIS DE MES COURS, CÔTÉ ÉCRAN (3.5.137, Charles, 6 novembre 2026 : « TOUTES les fonctionnalités de Mes cours passent dans
 * l'espace enseignant »). Les écrans de Mes cours sont ceux de Lucie, repris tels quels : ils appellent « /api/… ». Ici, ces appels
 * partent vers « /api/enseignant/relais/… » avec la session de l'espace ; le portail les note, Lucie les relève, les exécute avec
 * les droits du compte de l'enseignant et rend la réponse. Rien de Lucie n'est joint directement.
 */
const CLE = 'lucie.enseignant';
let installe = false;

export function installerRelais() {
  if (installe) return;
  installe = true;
  const origine = window.fetch.bind(window);
  window.fetch = (entree, init = {}) => {
    const url = typeof entree === 'string' ? entree : entree?.url || '';
    const chemin = url.startsWith(window.location.origin) ? url.slice(window.location.origin.length) : url;
    if (!chemin.startsWith('/api/') || chemin.startsWith('/api/enseignant/')) return origine(entree, init);
    const h = new Headers(init.headers || (typeof entree === 'object' ? entree.headers : undefined) || {});
    let t = null; try { t = sessionStorage.getItem(CLE); } catch { /* */ }
    if (t) h.set('Authorization', `Bearer ${t}`); else h.delete('Authorization');
    return origine(`/api/enseignant/relais/${chemin.slice('/api/'.length)}`, { ...init, headers: h, credentials: 'same-origin' });
  };
  // Les écrans de Lucie lisent un jeton et un compte dans le stockage local : on y pose de quoi les satisfaire (le vrai
  // jeton est celui de l'espace, posé par le relais ci-dessus).
  try { if (!localStorage.getItem('token')) localStorage.setItem('token', 'espace-enseignant'); } catch { /* */ }
}

/** Le compte et l'année, lus dans Lucie par le relais, pour les écrans repris. */
export async function preparerLucie() {
  installerRelais();
  try {
    const moi = await fetch('/api/auth/me').then(r => (r.ok ? r.json() : null));
    const u = moi?.user || moi;
    if (u?.id) localStorage.setItem('user', JSON.stringify(u));
  } catch { /* */ }
  try {
    const annees = await fetch('/api/annees').then(r => (r.ok ? r.json() : []));
    const active = (Array.isArray(annees) ? annees : annees?.annees || []).find(a => a.active)?.code;
    if (active && !localStorage.getItem('annee_active')) localStorage.setItem('annee_active', active);
  } catch { /* */ }
  try { (await import('../lib/couleurs.js')).chargerCouleurs(); } catch { /* */ }
  try { (await import('../lib/design.js')).chargerDesign(); } catch { /* */ }
}

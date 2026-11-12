/* L'ONGLET QUI S'OUVRE PENDANT LA COMPOSITION (3.5.390, Charles : « c'est là que je veux un loading… quand tu crées les documents ») :
   le navigateur n'autorise un nouvel onglet qu'au moment du clic ; Lucie l'ouvre donc tout de suite, puis y verse le document quand il
   est prêt. Entre-temps l'onglet était BLANC. Il porte désormais les étoiles de Lucie qui scintillent et le message d'attente. */
const MESSAGE = 'Vos documents sont en chargement. Ceci peut prendre quelques secondes ou plusieurs minutes selon les demandes. Ne quittez pas cette fenêtre.';
const ETOILES = [[8, 22, 7, 0], [20, 78, 5, .5], [33, 12, 4, 1.1], [44, 88, 6, .3], [58, 18, 5, 1.6], [70, 82, 7, .8],
  [82, 30, 4, 1.3], [90, 70, 5, .2], [15, 50, 4, 1.9], [86, 50, 6, .7], [50, 6, 4, 1.4], [52, 94, 5, 2.1]];

export function pageAttente(texte = MESSAGE) {
  const etoiles = ETOILES.map(([x, y, t, d], i) => `<svg class="e" viewBox="0 0 20 20" width="${t * 2.4}" height="${t * 2.4}"
    style="left:${x}%;top:${y}%;animation-delay:${d}s;animation-duration:${2 + (i % 4) * .45}s"><path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill="currentColor"/></svg>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lucie — composition…</title><style>
html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#F5F7FA;font:15px/1.5 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#16406A}
.c{position:relative;width:260px;height:160px;display:grid;place-items:center}
.e{position:absolute;color:#05B7E6;animation:s 2.4s ease-in-out infinite}
@keyframes s{0%,100%{opacity:.15;transform:scale(.6) rotate(0)}50%{opacity:1;transform:scale(1.15) rotate(45deg)}}
.l{font-weight:700;font-size:34px;letter-spacing:.02em;animation:r 2.4s ease-in-out infinite}@keyframes r{0%,100%{opacity:.8}50%{opacity:1}}
p{max-width:30rem;text-align:center;margin:8px 16px 0}
@media (prefers-reduced-motion:reduce){.e,.l{animation:none;opacity:.8}}
</style></head><body><div><div class="c">${etoiles}<div class="l">Lucie</div></div><p>${texte}</p></div></body></html>`;
}

/** Ouvre l'onglet (au clic) avec la page d'attente ; rend l'onglet, ou null si le navigateur l'a bloqué. */
export function ouvrirOngletAttente(texte) {
  const w = window.open('', '_blank');
  try { if (w) { w.document.open(); w.document.write(pageAttente(texte)); w.document.close(); } } catch { /* */ }
  return w;
}

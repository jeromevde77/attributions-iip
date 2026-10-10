import React from 'react';
import { ReponsesTypesHote } from './lib/reponsesTypes.jsx';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { Dialogues } from './lib/dialogue.jsx';
import './index.css';
// LES COULEURS DE SIGNIFICATION SE POSENT AVANT LE PREMIER RENDU : un badge
// HELB qui change de couleur une seconde après l'affichage se remarque plus
// qu'une couleur fausse.
import { chargerCouleurs } from './lib/couleurs.js';

chargerCouleurs();
import('./lib/design.js').then(m => m.chargerDesign()).catch(() => {});

/* UNE MISE À JOUR PENDANT QU'ON TRAVAILLE NE DOIT PAS FINIR EN ERREUR
   (« Importing a module script failed », 3 octobre 2026). Chaque version
   renomme les morceaux de l'application ; une page ouverte avant la mise à
   jour réclame alors un morceau qui n'existe plus. On recharge, une fois —
   la garde évite une boucle si le serveur était réellement injoignable. */
function rechargerApresMiseAJour(e) {
  try {
    const dernier = Number(sessionStorage.getItem('lucie_rechargement') || 0);
    if (Date.now() - dernier < 30000) return;   // déjà tenté il y a moins de 30 s
    sessionStorage.setItem('lucie_rechargement', String(Date.now()));
  } catch { /* stockage indisponible : on recharge quand même */ }
  e?.preventDefault?.();
  window.location.reload();
}
window.addEventListener('vite:preloadError', rechargerApresMiseAJour);

/* PAS DE REMPLISSAGE AUTOMATIQUE DU NAVIGATEUR DANS LUCIE (Charles, 3 octobre
   2026 : « j'ai cela partout dans les champs, c'est insupportable »). Safari et
   Chrome reconnaissent « nom », « prénom » dans un champ et y proposent les
   contacts et les saisies passées, par-dessus les listes de Lucie. Un champ
   qui DÉCLARE son remplissage (connexion : username, current-password,
   one-time-code) le garde ; tous les autres le perdent — aussi ceux qui
   naissent plus tard, d'où l'observateur. */
let compteurChamps = 0;
function sansRemplissage(racine) {
  const champs = racine.querySelectorAll ? racine.querySelectorAll('input:not([autocomplete]), textarea:not([autocomplete])') : [];
  for (const c of champs) {
    c.setAttribute('autocomplete', 'off');
    c.setAttribute('data-lpignore', 'true');      // gestionnaires de mots de passe
    c.setAttribute('data-1p-ignore', 'true');
    // SAFARI PASSE OUTRE « off » quand il croit voir un champ de nom (« Nom,
    // prénom… ») et propose les contacts. Il ne remplit jamais un champ dont
    // le NOM contient « search » : c'est la seule parade qui tienne.
    if (!c.getAttribute('name')) c.setAttribute('name', `search_lucie_${++compteurChamps}`);
  }
}
sansRemplissage(document);
new MutationObserver(lots => {
  for (const l of lots) for (const n of l.addedNodes) {
    if (n.nodeType !== 1) continue;
    if ((n.tagName === 'INPUT' || n.tagName === 'TEXTAREA') && !n.hasAttribute('autocomplete')) sansRemplissage(n.parentNode || document);
    else sansRemplissage(n);
  }
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('unhandledrejection', e => {
  const m = String(e?.reason?.message || e?.reason || '');
  if (/Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(m)) {
    rechargerApresMiseAJour(e);
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Dialogues />
      <ReponsesTypesHote />
    </BrowserRouter>
  </React.StrictMode>
);

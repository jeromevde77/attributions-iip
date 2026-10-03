import React from 'react';
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
    </BrowserRouter>
  </React.StrictMode>
);

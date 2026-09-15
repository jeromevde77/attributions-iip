import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
// LES COULEURS DE SIGNIFICATION SE POSENT AVANT LE PREMIER RENDU : un badge
// HELB qui change de couleur une seconde après l'affichage se remarque plus
// qu'une couleur fausse.
import { chargerCouleurs } from './lib/couleurs.js';

chargerCouleurs();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

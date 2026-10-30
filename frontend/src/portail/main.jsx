/**
 * LE SITE DES ÉTUDIANTS — UNE ENTRÉE À PART (3.1.477, le mur). Construit seul (`vite.portail.config.js`), il
 * n'importe que ce dossier et la feuille de style : aucune ligne de l'application du personnel n'y entre, et
 * il ne parle qu'au portail (/api/portail), jamais à Lucie.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import EspaceEtudiant from './EspaceEtudiant.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><EspaceEtudiant /></React.StrictMode>);

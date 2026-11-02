/**
 * L'ESPACE ENSEIGNANT — UNE ENTRÉE À PART (3.5.076, derrière le mur, comme le site des étudiants). Construit avec lui
 * (`vite.portail.config.js`), il n'importe que ce dossier et la feuille de style, et ne parle qu'au portail
 * (/api/enseignant), jamais à Lucie.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import EspaceEnseignant from './EspaceEnseignant.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><EspaceEnseignant /></React.StrictMode>);

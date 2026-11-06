/**
 * L'ESPACE ENSEIGNANT — UNE ENTRÉE À PART (3.5.076, derrière le mur, comme le site des étudiants). Construit avec lui
 * (`vite.portail.config.js`). Il ne parle qu'au portail (/api/enseignant) ; les écrans de Mes cours qu'il reprend (3.5.137) passent
 * par le relais du portail, que Lucie relève — jamais Lucie en direct.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import EspaceEnseignant from './EspaceEnseignant.jsx';
import { Dialogues } from '../lib/dialogue.jsx';
import { ReponsesTypesHote } from '../lib/reponsesTypes.jsx';
import { installerRelais } from './relais.js';

// LES ÉCRANS DE MES COURS (3.5.137) parlent à Lucie par le relais de l'espace, jamais en direct.
installerRelais();
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><EspaceEnseignant /><Dialogues /><ReponsesTypesHote /></React.StrictMode>);

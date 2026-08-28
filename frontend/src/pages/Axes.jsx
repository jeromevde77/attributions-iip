import { Suspense, lazy } from 'react';
import Axe from '../components/Axe.jsx';
import Accueil from './Accueil.jsx';
import Etudiants from './Etudiants.jsx';
import EncodageRapide from './EncodageRapide.jsx';
import Echeancier from './Echeancier.jsx';

const Listes = lazy(() => import('./Listes.jsx'));
const Procedures = lazy(() => import('./Procedures.jsx'));

const Attente = () => <div className="p-6 text-sm text-slate-400">Chargement…</div>;

/**
 * Axes de la structure en 7 dont le contenu se résume à regrouper des écrans
 * existants sous un en-tête commun. Aucun écran n'est réécrit.
 */

// ── ACCUEIL — « Qu'est-ce qui m'attend ? » ──────────────────────────────────
export function AxeAccueil() {
  return (
    <Axe
      titre="Accueil"
      question="« Qu'est-ce qui m'attend ? »"
      onglets={[
        { key: 'tableau', label: 'Tableau de bord', sansMarge: true, rendu: <Accueil /> },
        { key: 'echeancier', label: 'Échéancier', sansMarge: true, rendu: <Echeancier /> },
      ]}
    />
  );
}

// ── ÉTUDIANTS — « Où en est cet étudiant ? » ────────────────────────────────
export function AxeEtudiants() {
  return (
    <Axe
      titre="Étudiants"
      question="« Où en est cet étudiant ? »"
      onglets={[
        { key: 'pae', label: 'PAE & inscriptions', sansMarge: true,
          rendu: <Etudiants /> },
        { key: 'encodage', label: 'Encodage rapide', sansMarge: true,
          rendu: <EncodageRapide /> },
        { key: 'recours', label: 'Recours', sansMarge: true,
          rendu: <Suspense fallback={<Attente />}><Procedures /></Suspense> },
        { key: 'admission', label: 'Admission & inscription', futur: true,
          description: "Titres d'accès, valorisation des acquis, droit d'inscription et exemptions." },
        { key: 'presences', label: 'Présences', futur: true,
          description: 'Encodage, comptages réglementaires (1er/10e), justificatifs.' },
        { key: 'parcours', label: 'Parcours & sanction', futur: true,
          description: 'Notes, conseils des études, épreuve intégrée, attestations.' },
      ]}
    />
  );
}

// ── COMMUNICATION — « Que dois-je produire ou envoyer ? » ───────────────────
export function AxeCommunication() {
  return (
    <Axe
      titre="Communication"
      question="« Que dois-je produire ou envoyer ? »"
      onglets={[
        { key: 'listes', label: 'Listes & impressions', sansMarge: true,
          rendu: <Suspense fallback={<Attente />}><Listes /></Suspense> },
        { key: 'diffusion', label: 'Diffusion ciblée', futur: true,
          description: '« Envoyer à tous les professeurs de l\u2019UE 95 » — modèles, accusés de lecture, historique.' },
        { key: 'documents', label: 'Courriers & documents', futur: true,
          description: "L'archive de tout ce que Lucie a généré : réimpression, production en lot." },
        { key: 'reunions', label: 'Notes de réunion', futur: true,
          description: 'Décisions, diffusion aux absents, lien décision → action → échéance.' },
      ]}
    />
  );
}

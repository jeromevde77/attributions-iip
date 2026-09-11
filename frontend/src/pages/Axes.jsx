import { Suspense, lazy } from 'react';
import {
  IconHome, IconChecklist, IconSend, IconLayoutDashboard, IconCalendarStats,
  IconClipboardList, IconScale, IconShieldExclamation, IconDoorEnter,
  IconUserCheck, IconRoute, IconFileText, IconFolder, IconNotes,
} from '@tabler/icons-react';
import Axe from '../components/Axe.jsx';
import Accueil from './Accueil.jsx';
import Etudiants from './Etudiants.jsx';
import Deliberation from './Deliberation.jsx';
import Echeancier from './Echeancier.jsx';

const Listes = lazy(() => import('./Listes.jsx'));
const Procedures = lazy(() => import('./Procedures.jsx'));
const CalendrierSessions = lazy(() => import('../components/CalendrierSessions.jsx'));

const Attente = () => <div className="p-6 text-sm text-slate-400">Chargement…</div>;

/**
 * Axes de la structure en 7 dont le contenu se résume à regrouper des écrans
 * existants sous un en-tête commun. Aucun écran n'est réécrit.
 */

// ── ACCUEIL — « Qu'est-ce qui m'attend ? » ──────────────────────────────────
export function AxeAccueil() {
  return (
    <Axe
      titre="Accueil" icone={IconHome}
      question="« Qu'est-ce qui m'attend ? »"
      onglets={[
        { key: 'tableau', label: 'Tableau de bord', icone: IconLayoutDashboard,
          sansMarge: true, railPropre: true,
          rendu: <Accueil /> },
        { key: 'echeancier', label: 'Échéancier', icone: IconCalendarStats,
          sansMarge: true, railPropre: true,
          rendu: <Echeancier /> },
      ]}
    />
  );
}

// ── ÉTUDIANTS — « Où en est cet étudiant ? » ────────────────────────────────
export function AxeEtudiants() {
  return (
    <Axe
      titre="Étudiants" icone={IconChecklist}
      question="« Où en est cet étudiant ? »"
      onglets={[
        { key: 'pae', label: 'PAE & inscriptions', icone: IconClipboardList,
          sansMarge: true, railPropre: true,
          rendu: <Etudiants /> },
        // La DÉLIBÉRATION prend la place de la saisie rapide, qu'elle contient.
        // On atteignait la feuille par un clic non annoncé sur un en-tête de
        // colonne, dans l'écran de saisie : on arrivait au sens par
        // l'accessoire. L'onglet nomme désormais ce qu'on vient y faire, et la
        // saisie rapide s'y ouvre d'un bouton.
        { key: 'deliberation', label: 'Délibération', icone: IconScale, sansMarge: true,
          rendu: <Deliberation /> },
        // LE CALENDRIER, HORS DE LA DÉLIBÉRATION. Les dates se posaient au fond
        // de l'écran de délibération, unité par unité : fixer celui d'une
        // section demandait d'ouvrir trente actes de Conseil pour y taper des
        // dates. Elles ont leur page, et elle se lit d'un coup d'œil.
        { key: 'calendrier', label: 'Calendrier des sessions', icone: IconCalendarStats,
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<Attente />}><CalendrierSessions /></Suspense> },
        // L'onglet ouvre TOUTE la page Procédures — recours, fraude,
        // disciplinaire, examens, archives. L'appeler « Recours » annonçait un
        // cinquième de son contenu et cachait le reste.
        { key: 'procedures', label: 'Procédures', icone: IconShieldExclamation,
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<Attente />}><Procedures /></Suspense> },
        { key: 'admission', label: 'Admission & inscription', icone: IconDoorEnter, futur: true,
          description: "Titres d'accès, valorisation des acquis, droit d'inscription et exemptions." },
        { key: 'presences', label: 'Présences', icone: IconUserCheck, futur: true,
          description: 'Encodage, comptages réglementaires (1er/10e), justificatifs.' },
        { key: 'parcours', label: 'Parcours & sanction', icone: IconRoute, futur: true,
          description: 'Notes, conseils des études, épreuve intégrée, attestations.' },
      ]}
    />
  );
}

// ── COMMUNICATION — « Que dois-je produire ou envoyer ? » ───────────────────
export function AxeCommunication() {
  return (
    <Axe
      titre="Communication" icone={IconSend}
      question="« Que dois-je produire ou envoyer ? »"
      onglets={[
        { key: 'listes', label: 'Listes & impressions', icone: IconFileText,
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<Attente />}><Listes /></Suspense> },
        { key: 'diffusion', label: 'Diffusion ciblée', icone: IconSend, futur: true,
          description: '« Envoyer à tous les professeurs de l\u2019UE 95 » — modèles, accusés de lecture, historique.' },
        { key: 'documents', label: 'Courriers & documents', icone: IconFolder, futur: true,
          description: "L'archive de tout ce que Lucie a généré : réimpression, production en lot." },
        { key: 'reunions', label: 'Notes de réunion', icone: IconNotes, futur: true,
          description: 'Décisions, diffusion aux absents, lien décision → action → échéance.' },
      ]}
    />
  );
}

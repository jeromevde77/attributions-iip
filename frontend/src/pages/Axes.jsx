import { Suspense, lazy } from 'react';
import {
  IconHome, IconChecklist, IconSend, IconLayoutDashboard, IconCalendarStats,
  IconChartBar,
  IconClipboardList, IconScale, IconShieldExclamation, IconDoorEnter,
  IconUserCheck, IconRoute, IconFileText, IconFolder, IconNotes,
} from '@tabler/icons-react';
import Axe from '../components/Axe.jsx';
import Accueil from './Accueil.jsx';
import { droitEffectif } from '../lib/modules.js';
import { getUser } from '../lib/api.js';
const Pilotage = lazy(() => import('./Pilotage.jsx'));
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
  /*
   * ACCUEIL ET PILOTAGE NE FONT PLUS QU'UN.
   *
   * « Qu'est-ce qui m'attend ? » et « où en sommes-nous ? » sont la même
   * question posée à deux échelles : ce que je dois faire aujourd'hui, et ce
   * que l'école a produit. Ce qui les séparait n'était pas leur nature mais
   * leur confidentialité — et la confidentialité se règle par le RÔLE, pas par
   * un onglet. La direction voit tout ; une coordination voit sa section, et
   * les chiffres globaux qu'on aura décidé de montrer.
   *
   * Le reporting n'apparaît donc que si le module « pilotage » est ouvert, et
   * il ne montre que ce qui se CONSULTE : ce qui engage est dans Gestion.
   */
  const voitReporting = droitEffectif(getUser(), 'pilotage') !== 'rien';
  return (
    <Axe
      titre="Tableau de bord" icone={IconHome}
      question="« Où en sommes-nous ? »"
      onglets={[
        { key: 'tableau', label: 'Ce qui m\u2019attend', icone: IconLayoutDashboard,
          sansMarge: true, railPropre: true,
          rendu: <Accueil /> },
        { key: 'echeancier', label: 'Échéancier', icone: IconCalendarStats,
          sansMarge: true, railPropre: true,
          rendu: <Echeancier /> },
        ...(voitReporting ? [{
          key: 'reporting', label: 'Chiffres de l\u2019école', icone: IconChartBar,
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<Attente />}><Pilotage vue="reporting" /></Suspense>,
        }] : []),
      ]}
    />
  );
}

// ── ÉTUDIANTS — « Où en est cet étudiant ? » ────────────────────────────────
export function AxeEtudiants() {
  return (
    <Axe
      titre="Étudiants" icone={IconChecklist} impression="etudiants" echanges
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
        // LE CALENDRIER A REJOINT ORGANISATION. Fixer la date d'une épreuve,
        // d'une visite des copies ou d'une délibération, c'est organiser
        // l'année — pas suivre un étudiant. Et l'écran des dates d'UE y est
        // déjà : les deux doivent se lire côte à côte.
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

// ── COMMUNICATION N'EXISTE PLUS ─────────────────────────────────────────────
// L'axe ne portait qu'un constructeur de listes et deux raccourcis de
// documents — plus trois onglets jamais construits. Or c'est exactement ce que
// fait le catalogue d'impression : la même chose, à un endroit de moins. Les
// listes y sont des pièces, et « envoyer par courriel » est une SORTIE, pas
// une porte.

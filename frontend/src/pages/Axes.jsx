import { Suspense, lazy } from 'react';
import {
  IconHome, IconChecklist, IconSend, IconLayoutDashboard, IconCalendarStats,
  IconChartBar,
  IconCertificate, IconClipboardList, IconScale, IconShieldExclamation, IconDoorEnter,
  IconUserCheck, IconRoute, IconFileText, IconFolder, IconNotes,
} from '@tabler/icons-react';
import Axe from '../components/Axe.jsx';
import Accueil from './Accueil.jsx';
import { droitEffectif, usePlafonds } from '../lib/modules.js';
import { getUser } from '../lib/api.js';
const Pilotage = lazy(() => import('./Pilotage.jsx'));
import Etudiants from './Etudiants.jsx';
import Deliberation from './Deliberation.jsx';
import Echeancier from './Echeancier.jsx';
const SuiviEquipe = lazy(() => import('./SuiviEquipe.jsx'));

const Listes = lazy(() => import('./Listes.jsx'));
const Procedures = lazy(() => import('./Procedures.jsx'));
const Valorisations = lazy(() => import('./Valorisations.jsx'));

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
  usePlafonds();
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
        /* LE SUIVI D'ÉQUIPE EST UN TABLEAU DE BORD, PAS UN MODULE À PART.
           « Où en sommes-nous ? » se pose à trois échelles : ce que je dois
           faire aujourd'hui, ce que l'école a produit, et ce que l'équipe s'est
           engagée à faire. La troisième manquait — elle vivait dans un carnet
           et dans des courriels. L'échéancier porte les obligations légales de
           l'établissement ; ceci porte les décisions d'une réunion de service.
           Voisins, jamais confondus. */
        { key: 'suivi', label: 'Suivi d\u2019équipe', icone: IconChecklist,
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<Attente />}><SuiviEquipe /></Suspense> },
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
      /* L'ORDRE DU RAIL EST CELUI DU PARCOURS, ET IL MÊLE LES DEUX NATURES.
       *
       * Les rubriques de l'axe et les outils de l'écran étaient rangés en deux
       * blocs — propre pour le code, faux pour l'usage : « Composer les PAE de
       * l'année suivante » appartient au PAE, « Diplômes et titres » suit la
       * délibération. Les séparer par nature coupait une suite de gestes en
       * deux listes qu'il fallait recoller de tête.
       *
       * Quatre groupes, séparés par un filet : on entre (créer, PAE, composer
       * le PAE suivant), on instruit (valorisation, délibération), on délivre
       * (diplômes) — puis l'exception (procédures), puis ce qui efface. */
      ordreRail={[
        ['nouvel-etudiant', 'pae', 'passage', 'valorisation', 'deliberation',
         'diplomation'],
        ['procedures'],
        ['purge'],
      ]}
      /* L'ORDRE EST CELUI DU PARCOURS, PAS CELUI DE LA CONSTRUCTION.
         On entre dans l'école, on demande une valorisation, on compose son
         programme, on délibère, on délivre le titre — et les procédures sont
         l'exception, à part et signalée. Un menu rangé dans l'ordre où les
         écrans ont été écrits oblige chacun à retenir une liste ; rangé dans
         l'ordre du travail, il ne se retient pas, il se suit. */
      onglets={[
        { key: 'pae', label: 'Inscriptions & PAE', icone: IconClipboardList,
          sansMarge: true, railPropre: true,
          rendu: <Etudiants /> },
        { key: 'valorisation', label: 'Valorisation des acquis', icone: IconCertificate,
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<Attente />}><Valorisations /></Suspense> },
        { key: 'deliberation', label: 'Délibération', icone: IconScale, sansMarge: true,
          rendu: <Deliberation /> },
        /* LES PROCÉDURES SONT L'EXCEPTION, ET ELLES SE SIGNALENT.
           Recours, fraude, disciplinaire : on n'y va pas dans le cours normal
           du travail, on y va quand quelque chose a dérapé. L'ocre le dit —
           c'est la seule rubrique de l'axe qui porte une couleur, et c'est
           pour cela qu'elle la porte. */
        { key: 'procedures', label: 'Procédures', icone: IconShieldExclamation,
          couleur: '#B45309',
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<Attente />}><Procedures /></Suspense> },
        { key: 'presences', label: 'Présences', icone: IconUserCheck, futur: true,
          description: 'Encodage, comptages réglementaires (1er/10e), justificatifs.' },
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

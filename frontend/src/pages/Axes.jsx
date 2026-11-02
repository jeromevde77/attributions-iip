import { ICONE_AXE } from '../lib/iconesAxes.js';
import { peutGeste, passeRole, useDroits } from '../lib/droits.js';
import { IconEtudiant } from '../components/IconesLucie.jsx';
import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  IconHome, IconChecklist, IconSend, IconLayoutDashboard, IconCalendarStats,
  IconChartBar, IconSpeakerphone,
  IconCertificate, IconClipboardList, IconScale, IconShieldExclamation, IconDoorEnter,
  IconUserCheck, IconRoute, IconFileText, IconStairsUp, IconEyeCheck, IconArrowForwardUp, IconTablePlus, IconFolder, IconNotes, IconAccessible, IconTable,
  IconUserPlus, IconListSearch, IconCash, IconQrcode, IconMessages, IconInbox, IconPlaylistX, IconBolt, IconChecks, IconZoomQuestion, IconAdjustments,
  IconListDetails, IconArchive,
} from '@tabler/icons-react';
import Axe from '../components/Axe.jsx';
import Accueil from './Accueil.jsx';
import { droitEffectif, usePlafonds } from '../lib/modules.js';
import { getUser } from '../lib/api.js';
const Pilotage = lazy(() => import('./Pilotage.jsx'));
import Etudiants from './Etudiants.jsx';
import Deliberation from './Deliberation.jsx';
import Echeancier from './Echeancier.jsx';
const Communication = lazy(() => import('./Communication.jsx'));
const SuiviEquipe = lazy(() => import('./SuiviEquipe.jsx'));

const Listes = lazy(() => import('./Listes.jsx'));
const Procedures = lazy(() => import('./Procedures.jsx'));
const Valorisations = lazy(() => import('./Valorisations.jsx'));
const RegistreAmenagements = lazy(() => import('./RegistreAmenagements.jsx'));
const InscritsUnites = lazy(() => import('./InscritsUnites.jsx'));

const Attente = () => <div className="p-6 text-sm text-slate-400">Chargement…</div>;

/**
 * Axes de la structure en 7 dont le contenu se résume à regrouper des écrans
 * existants sous un en-tête commun. Aucun écran n'est réécrit.
 */

// ── ACCUEIL — « Qu'est-ce qui m'attend ? » ──────────────────────────────────
export function AxeAccueil() {
  const [paramsAccueil] = useSearchParams();
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
      ongletInitial={paramsAccueil.get('onglet') || undefined}
      titre="Tableau de bord" icone={ICONE_AXE.accueil}
      question="« Où en sommes-nous ? »"
      onglets={[
        { key: 'tableau', label: 'Ce qui m\u2019attend', icone: IconLayoutDashboard,
          sansMarge: true, railPropre: true,
          rendu: <Accueil /> },
        { key: 'echeancier', module: 'reunions', label: 'Échéancier', icone: IconCalendarStats,
          sansMarge: true, railPropre: true,
          rendu: <Echeancier /> },
        /* LE SUIVI D'ÉQUIPE EST UN TABLEAU DE BORD, PAS UN MODULE À PART.
           « Où en sommes-nous ? » se pose à trois échelles : ce que je dois
           faire aujourd'hui, ce que l'école a produit, et ce que l'équipe s'est
           engagée à faire. La troisième manquait — elle vivait dans un carnet
           et dans des courriels. L'échéancier porte les obligations légales de
           l'établissement ; ceci porte les décisions d'une réunion de service.
           Voisins, jamais confondus. */
        { key: 'suivi', module: 'reunions', label: 'Suivi d\u2019équipe', icone: IconChecklist,
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<Attente />}><SuiviEquipe /></Suspense> },
        /* LA COMMUNICATION (3.1.278) : écrire au tableau de bord des autres — la direction,
           le secrétariat et les coordinations (ces dernières, à leurs sections). */
        ...(['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur', 'coordination'].includes(getUser()?.role) ? [{
          key: 'communication', label: 'Communication', icone: IconSpeakerphone,
          rendu: <Suspense fallback={<Attente />}><Communication /></Suspense>,
        }] : []),
        /* « CHIFFRES DE L'ÉCOLE » A REJOINT GESTION (14 octobre 2026, Charles : « il doit être
           intégré ») : Population et Résultats pour tous ceux qui lisent les statistiques. */
      ]}
    />
  );
}

// ── ÉTUDIANTS — « Où en est cet étudiant ? » ────────────────────────────────
export function AxeEtudiants() {
  useDroits();   // le tiroir se recalcule quand les droits arrivent
  // « ?onglet=deliberation » : un renvoi (Configuration, un lien) ouvre l'axe
  // sur la bonne rubrique.
  const [params] = useSearchParams();
  return (
    <Axe
      titre="Étudiants" icone={ICONE_AXE.etudiants} impression="etudiants" echanges
      ongletInitial={params.get('onglet') || undefined}
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
      /* LE RAIL PAR ÉTAPE DU PARCOURS (3.5.075, Charles, 2 novembre 2026 ; maquette validée). Cinq groupes dans l'ordre de
         l'année : inscrire, accompagner, évaluer, recours, vider. Chaque outil vit sous la rubrique à laquelle il appartient,
         ou à son étape ; les visites de stage ont quitté ce rail (Organisation → Stages → Visites et trajets). Une icône par
         entrée, qui n'est qu'à elle. */
      ordreRail={[
        ['nouvel-etudiant', 'controles-dossiers', 'pae', 'extraits-bancaires'],
        ['valorisation', 'amenagements', 'presence-qr', 'messages-etudiants'],
        ['deliberation'],
        ['procedures'],
        ['purge'],
      ]}
      outilsPermanents={[
        { key: 'nouvel-etudiant', label: 'Créer un étudiant', icone: IconUserPlus, hote: 'pae', peut: () => peutGeste('etudiants.creer') },
        { key: 'controles-dossiers', label: 'Contrôler les dossiers', icone: IconListSearch, hote: 'pae' },
        { key: 'extraits-bancaires', label: 'Frais — extraits de compte', icone: IconCash, hote: 'pae',
          peut: () => passeRole(['admin', 'editeur']) },
        { key: 'presence-qr', label: 'Suivi des présences', icone: IconQrcode, hote: 'pae',
          peut: () => passeRole(['admin', 'editeur', 'coordination']) },
        { key: 'messages-etudiants', label: 'Écrire aux étudiants', icone: IconMessages, hote: 'pae',
          peut: () => passeRole(['admin', 'editeur', 'coordination']) },
      ]}
      sousMenus={[
        { key: 'pae', label: 'Inscriptions & PAE', icone: IconClipboardList, hote: 'pae',
          enfants: [
            { key: 'passage', label: 'Composer le PAE', icone: IconStairsUp, peut: () => peutGeste('etudiants.pae_composer') },
            { key: 'revue-pae', label: 'Revue des PAE', icone: IconEyeCheck },
            { key: 'pae-en-ligne', label: 'PAE en ligne', icone: IconInbox, peut: () => peutGeste('etudiants.pae_composer') },
            { key: 'inscrits-unites', label: 'Inscrits par unité', icone: IconTable },
            { key: 'refus2', label: 'Refus en 2e session', icone: IconPlaylistX,
              peut: () => passeRole(['admin', 'editeur']) || peutGeste('etudiants.pae_composer') },
          ] },
        { key: 'deliberation', label: 'Délibération', icone: IconScale, hote: 'deliberation',
          enfants: [
            { key: 'rapide', label: 'Encodage rapide', icone: IconBolt },
            { key: 'controles', label: 'Contrôles des notes et des décisions', icone: IconChecks, peut: () => passeRole(['admin', 'editeur']) },
            { key: 'ou-notes', label: 'Où sont les notes ?', icone: IconZoomQuestion, peut: () => passeRole(['admin', 'editeur']) },
            { key: 'regles', label: 'Règles de délibération', icone: IconAdjustments, peut: () => passeRole(['admin', 'editeur']) },
            { key: 'reports', label: 'Reports de notes', icone: IconArrowForwardUp, hote: 'pae',
              peut: () => passeRole(['admin', 'directeur', 'directeur_adjoint', 'editeur']) },
          ] },
        { key: 'procedures', label: 'Procédures', icone: IconShieldExclamation, hote: 'procedures',
          enfants: [
            { key: 'registre', label: 'Registre', icone: IconListDetails },
            { key: 'anciens', label: 'Anciens dossiers', icone: IconArchive },
          ] },
      ]}
      onglets={[
        { key: 'pae', module: 'etudiants', label: 'Inscriptions & PAE', icone: IconClipboardList,
          sansMarge: true, railPropre: true,
          rendu: <Etudiants /> },
        /* LES INSCRITS PAR UNITÉ (Charles, 7 octobre 2026) : la section, une
           ligne par unité, puis l'étudiant × ses cours pour les unités cochées. */
        { key: 'inscrits-unites', module: 'etudiants', label: 'Inscrits par unité', icone: IconTable,
          rendu: <Suspense fallback={<Attente />}><InscritsUnites /></Suspense> },
        { key: 'valorisation', module: 'etudiants', label: 'Valorisation des acquis', icone: IconCertificate,
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<Attente />}><Valorisations /></Suspense> },
        /* LES AMÉNAGEMENTS RAISONNABLES, EN DIRECT (Charles, 28 septembre 2026 :
           « comme valorisation des acquis, afin que cela soit rapidement
           joint »). Le registre de l'année ; chaque ligne ouvre la fiche sur
           son onglet Aménagements. */
        { key: 'amenagements', module: 'amenagements', label: 'Aménagements raisonnables', icone: IconAccessible,
          rendu: <Suspense fallback={<Attente />}><RegistreAmenagements /></Suspense> },
        { key: 'deliberation', module: 'etudiants', label: 'Délibération', icone: IconScale, sansMarge: true,
          rendu: <Deliberation /> },
        /* LES PROCÉDURES SONT L'EXCEPTION, ET ELLES SE SIGNALENT.
           Recours, fraude, disciplinaire : on n'y va pas dans le cours normal
           du travail, on y va quand quelque chose a dérapé. L'ocre le dit —
           c'est la seule rubrique de l'axe qui porte une couleur, et c'est
           pour cela qu'elle la porte. */
        { key: 'procedures', module: 'procedures', label: 'Procédures', icone: IconShieldExclamation,
          couleur: 'var(--c-attente)',
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

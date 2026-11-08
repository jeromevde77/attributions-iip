import { ICONE_AXE } from '../lib/iconesAxes.js';
import { lazy, Suspense, useEffect, useState } from 'react';
import { RailLateral } from '../components/ui.jsx';
import GardeAnnee from '../components/GardeAnnee.jsx';
import { useSearchParams } from 'react-router-dom';
import Axe from '../components/Axe.jsx';
import {
  IconLayoutGrid, IconBook2, IconCalendar, IconChalkboard, IconUsers, IconSchool, IconSitemap, IconFileDescription, IconTimeline, IconUserCheck, IconCalendarCog,
  IconClock, IconCalendarStats, IconBuilding, IconBooks, IconUsersGroup, IconListDetails, IconBook, IconCalendarEvent, IconWriting, IconPlane, IconPercentage, IconTable, IconCalendarWeek, IconChartBar, IconPuzzle, IconEye, IconCalendarMonth, IconBriefcase, IconFileCertificate, IconHierarchy2, IconCalendarTime, IconCalendarCheck, IconUserOff,
} from '@tabler/icons-react';
import Attributions from './Attributions.jsx';
import Planification from './Planification.jsx';
import HoraireComparateur from './HoraireComparateur.jsx';
const AtelierUE = lazy(() => import('./AtelierUE.jsx'));
import StructureSection from './StructureSection.jsx';
import Rentree from './Rentree.jsx';
import { authHeaders } from '../lib/api.js';

const CentrePlanification = lazy(() => import('./CentrePlanification.jsx'));
const ExamensPreparer = lazy(() => import('../components/ExamensPreparer.jsx'));
const VoyagesEtudes = lazy(() => import('../components/VoyagesEtudes.jsx'));
const RepartitionCours = lazy(() => import('./RepartitionCours.jsx'));
const LaboratoireTemporel = lazy(() => import('./LaboratoireTemporel.jsx'));
const AgendaEcole = lazy(() => import('./AgendaEcole.jsx'));
const StagesOrganisation = lazy(() => import('./StagesOrganisation.jsx'));
const TfeOrganisation = lazy(() => import('./TfeOrganisation.jsx'));
const AbsencesEnseignants = lazy(() => import('../components/AbsencesEnseignants.jsx'));
/* Stages et TFE : direction, secrétariat et TOUTE coordination (ses sections), quelles que soient les cases de sa fiche
   (3.5.073, Charles). Le serveur fait la même règle (`garderModuleSauf`). */
const STAGES_TFE = ['admin', 'directeur', 'directeur_adjoint', 'editeur', 'secretariat', 'coordination'];
import { IconeLaboratoire } from '../components/IconeLaboratoire.jsx';
const HoraireSemaine = lazy(() => import('./HoraireSemaine.jsx'));
const Effectifs = lazy(() => import('./Configuration.jsx').then(m => ({ default: m.OngletStatistiques })));

/**
 * Axe ORGANISATION — « Qu'organise-t-on cette année ? »
 *
 * L'axe annuel, dans l'ordre du travail de rentrée. L'onglet par défaut est
 * Attributions : l'écran le plus utilisé garde son nom et reste à un clic.
 * Les Organisations d'UE (tableau + planificateur en ligne du temps) y
 * trouvent leur adresse principale ; Configuration → Paramétrage annuel y
 * renvoie désormais.
 */
export default function Organisation({ ongletInitial }) {
  const [params] = useSearchParams();
  const demande = params.get('onglet') || ongletInitial;
  const faceUnite = demande === 'ponderations' ? 'ponderation' : params.get('face') || (demande === 'due' ? 'descriptif' : 'croisement');
  // Groupes communs est devenu une face du laboratoire temporel (10 octobre 2026) : l'ancienne adresse y mène.
  const ongletDemande = ['ponderations', 'due'].includes(demande) ? 'unite' : demande === 'groupes-communs' ? 'laboratoire'
    // La planification en trois entrées (3.5.146) : l'ancienne adresse « onglet=planifier&sous=… » mène à la bonne.
    : demande === 'planifier' ? ({ dates: 'planif-dates', sessions: 'planif-sessions' }[params.get('sous')] || 'planif-ue') : demande;
  const [annee, setAnnee] = useState('');
  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => {
        const a = (Array.isArray(l) ? l : []).find(x => x.active) || (Array.isArray(l) ? l[0] : null);
        if (a?.code) setAnnee(a.code);
      })
      .catch(() => {});
  }, []);

  return (
    <>
    {/* ON ORGANISE UNE ANNÉE, ET IL FAUT SAVOIR LAQUELLE. L'année de travail
        est rémanente : ouvert un jour sur l'an dernier pour vérifier une
        charge, on y reste le lendemain — et l'on y encode. */}
    <GardeAnnee quoi="l'organisation" />
    <Axe
      titre="Organisation" icone={ICONE_AXE.organisation} impression="organisation" echanges
      question="« Qu'organise-t-on cette année ? »"
      ongletInitial={ongletDemande}
      /* LES ÉTAPES DE L'UNITÉ SE DÉPLIENT SOUS ELLE (Charles, 8 octobre 2026 : « bug
         ordre »). Sans ordre déclaré, le tiroir de l'écran ouvert se rangeait sous
         la DERNIÈRE rubrique — après Horaires et Effectifs —, loin de l'icône
         cliquée. L'ordre est celui du rail tel qu'il était ; seule l'unité porte
         ses trois étapes dessous. */
      /* QUATRE GROUPES, DANS L'ORDRE DU TRAVAIL (3.5.069, Charles, 2 novembre 2026 : « revoir les groupements du
         menu ») : le programme, l'année, qui enseigne et quand, les étudiants. */
      /* QUATRE GROUPES À TIROIR (3.5.130, Charles, 5 novembre 2026 : « le rail d'Organisation devient fort long » ; maquette
         validée) : le programme, l'année, qui enseigne et quand, les étudiants. Les étapes de l'Unité, du Laboratoire et des
         Horaires se déplient dans le tiroir de leur groupe quand leur écran est ouvert (`seulementPresent`). */
      ordreRail={[['g-programme', 'g-annee', 'g-enseigne', 'g-etudiants']]}
      sousMenus={[
        { key: 'g-programme', label: 'Le programme', icone: IconBook2,
          enfants: [
            { key: 'structure' }, { key: 'unite' },
            { key: 'face-dossier', label: '0. Lire le dossier pédagogique', icone: IconBook, seulementPresent: true },
            { key: 'face-croisement', label: '1. Croiser les acquis et le programme', icone: IconTable, seulementPresent: true },
            { key: 'face-ponderation', label: '2. Pondérer', icone: IconPercentage, seulementPresent: true },
            { key: 'face-descriptif', label: '3. Décrire l’unité (DUE)', icone: IconFileDescription, seulementPresent: true },
          ] },
        { key: 'g-annee', label: 'L’année', icone: IconCalendar,
          enfants: [{ key: 'agenda' }, { key: 'planif-ue' }, { key: 'planif-dates' }, { key: 'planif-sessions' }, { key: 'examens' }, { key: 'planification' }, { key: 'effectifs' }, { key: 'rentree' }] },
        { key: 'g-enseigne', label: 'Qui enseigne et quand', icone: IconChalkboard,
          enfants: [
            { key: 'attributions' }, { key: 'laboratoire' },
            // LES ÉTAPES DANS L'ORDRE DU TRAVAIL (3.1.465) — celui de ETAPES_LABO (LaboratoireTemporel.jsx).
            { key: 'labo-schema', label: '1. Le schéma', icone: IconHierarchy2, seulementPresent: true },
            { key: 'labo-temps', label: '2. Le temps', icone: IconTimeline, seulementPresent: true },
            { key: 'labo-groupes', label: '3. Les groupes', icone: IconPuzzle, seulementPresent: true },
            { key: 'labo-planning', label: '4. Le planning', icone: IconCalendarCog, seulementPresent: true },
            { key: 'labo-disponibilites', label: '5. Les disponibilités', icone: IconUserCheck, seulementPresent: true },
            { key: 'labo-semaine', label: '6. La semaine', icone: IconCalendarTime, seulementPresent: true },
            { key: 'labo-horaire', label: '7. L’horaire', icone: IconCalendarCheck, seulementPresent: true },
            { key: 'horaire-semaine' },
            { key: 'horaire-consulter', label: 'Consulter l’horaire', icone: IconEye, seulementPresent: true },
            { key: 'horaire-composer', label: 'Composer la semaine', icone: IconCalendarEvent, seulementPresent: true },
            { key: 'horaire-controler', label: 'Contrôler contre les attributions', icone: IconClock, seulementPresent: true },
            { key: 'absences-prof' },
          ] },
        { key: 'g-etudiants', label: 'Les étudiants', icone: IconUsers,
          enfants: [{ key: 'repartition' }, { key: 'stages' }, { key: 'tfe' }, { key: 'voyages' }] },
      ]}
      onglets={[
        { key: 'attributions', module: 'attributions', label: 'Attributions', icone: IconLayoutGrid, sansMarge: true,
          rendu: <Attributions /> },
        /* L'AGENDA DE L'ÉCOLE (3.5.058) : un seul agenda, lu partout — cours, fermeture, jours fermés, sections, moments,
           chaleur, peints sur la ligne du temps de l'année. */
        { key: 'agenda', module: 'organisation', label: 'Agenda de l’école', icone: IconCalendarMonth,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}>
                   {annee ? <AgendaEcole annee={annee} /> : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div>}</Suspense> },
        /* PLANIFIER, C'EST UN SEUL TERRITOIRE — DONC UNE SEULE PORTE.
         *
         * Trois entrées du rail répondaient à la même question — QUAND les
         * choses se passent : la grille d'organisation, les dates d'ouverture
         * et de fermeture des unités, le calendrier des sessions. On en
         * ouvrait une, puis l'autre, pour reconstituer de tête une chronologie
         * que personne ne voyait d'un bloc — et trois icônes voisines qui
         * disent « le temps » ne signalent plus rien. Une icône se mérite.
         *
         * La planification suit immédiatement les attributions : elle se fait
         * AVANT d'attribuer, et c'est l'ordre du travail de rentrée. */
        /* TROIS ENTRÉES, PAS UN SOUS-MENU DE SOUS-MENU (3.5.146, Charles, 6 novembre 2026 : « je ne trouve plus l'endroit avec les
           dates des délibérations et sessions » ; « il ne faut pas de sous-menu de sous-menu »). La grille, les dates des UE et les
           sessions (épreuves et délibérations) sont trois entrées du groupe « L'année » ; plus d'onglets dans la page. */
        ...[['planif-ue', 'ue', 'Planification des UE et cours', IconCalendarStats], ['planif-dates', 'dates', 'Dates des UE', IconCalendarTime],
          ['planif-sessions', 'sessions', 'Sessions : épreuves et délibérations', IconCalendarEvent]].map(([key, face, label, icone]) => ({
          key, module: 'planification', label, icone, sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}>
                   <CentrePlanification annee={annee} face={face} /></Suspense> })),
        /* EXAMENS : PRÉPARER ET IMPRIMER (3.5.226) — les pièces de l'enveloppe d'examen, après les sessions qui datent les épreuves. */
        { key: 'examens', module: 'planification', label: 'Examens : préparer et imprimer', icone: IconWriting,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}><ExamensPreparer annee={annee} /></Suspense> },
        /* LE LABORATOIRE TEMPOREL DE LUCIE (10 octobre 2026) : les UE posées sur
           l'année en tuiles, leurs couches, et le verre de chacune — sur la
           grille d'organisation et les dates des UE, sans rien doubler. */
        { key: 'laboratoire', module: 'organisation', label: 'Le laboratoire temporel', icone: IconeLaboratoire,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}>
                   <LaboratoireTemporel /></Suspense> },
        { key: 'rentree', module: 'organisation', label: 'Rentrée', icone: IconSchool, sansMarge: true,
          rendu: annee
            ? <Rentree annee={annee} />
            : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div> },
        /* LE LIEN ATTRIBUTIONS × PAE. Après la rentrée, les étudiants sont là
           et les attributions posées : on les croise — pour chaque cours, qui
           a cours dans quel groupe. Demandé par Charles (24 septembre 2026) :
           « c'est le tableau qui va croiser les attributions et les PAE. » */
        { key: 'repartition', module: 'organisation', label: 'Répartition des étudiants', icone: IconUsersGroup,
          sansMarge: true,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}>
                   <RepartitionCours /></Suspense> },
        /* LES STAGES (3.5.067) : la vue de l'année, les pièces manquantes, l'affectation en lot, les propositions. */
        { key: 'stages', roles: STAGES_TFE, label: 'Stages', icone: IconBriefcase,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}>
                   {annee ? <StagesOrganisation annee={annee} /> : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div>}</Suspense> },
        /* LES TFE (3.5.069) : sujets et promoteurs, remises, défenses et jurys, décision de l'épreuve intégrée. */
        { key: 'tfe', roles: STAGES_TFE, label: 'Travaux de fin d’études', icone: IconFileCertificate,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}>
                   {annee ? <TfeOrganisation annee={annee} /> : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div>}</Suspense> },
        /* LES VOYAGES D'ÉTUDES (3.5.230) : la demande, le devis, le financement, la validation, les participants. */
        { key: 'voyages', roles: STAGES_TFE, label: 'Voyages d’études', icone: IconPlane,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}>
                   <div className="space-y-3"><h1 className="titre-ecran">Voyages d’études</h1>{annee ? <VoyagesEtudes annee={annee} /> : null}</div></Suspense> },
        /* LES ABSENCES DES ENSEIGNANTS (3.5.210) : le professeur signale, le secrétariat décide séance par séance et prévient. */
        { key: 'absences-prof', roles: STAGES_TFE, label: 'Absences des enseignants', icone: IconUserOff,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}><AbsencesEnseignants /></Suspense> },
        /* LES GROUPES COMMUNS (9 octobre 2026) : les TP d'un bloc coupés en
           briques, pour que les groupes de tous les cours s'emboîtent à l'horaire. */

        { key: 'structure', module: 'organisation', label: 'Schéma de capitalisation', icone: IconSitemap, sansMarge: true,
          rendu: annee
            ? <StructureSection annee={annee} />
            : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div> },
        /* UNE UNITÉ, TROIS FACES (Charles, 8 octobre 2026 : « un onglet qui reprend
           pondération, DUE et tableau de croisement »). Les pondérations (choix
           annuel, 25 septembre 2026) et le descriptif d'unité avaient chacun leur
           entrée ; le croisement acquis × programme les relie. L'unité se choisit
           une fois. Les anciennes adresses (?onglet=ponderations, ?onglet=due, /due)
           mènent ici, sur la bonne face. */
        { key: 'unite', module: 'organisation', label: 'Unité : croiser, pondérer, décrire', icone: IconListDetails, sansMarge: true,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}>
                   <AtelierUE faceInitiale={faceUnite} /></Suspense> },
        /* UN SEUL CENTRE HORAIRE (Charles, 29 septembre 2026 : « les deux
           premières icônes doivent devenir un seul centre horaire ; la
           troisième est un ancien module, à cacher »). Deux faces d'un même
           objet : COMPOSER la semaine (tuiles, bac tiré des groupes, import
           Hyperplanning) et CONTRÔLER l'horaire contre les attributions — ce
           que l'horaire dépense doit être ce qui a été accordé, et par les
           bonnes personnes. L'ancien « Horaires & planification » est masqué :
           la Planification du rail le remplace. */
        { key: 'horaire-semaine', module: 'planification', label: 'Horaires', icone: IconCalendarWeek, sansMarge: true,
          rendu: <CentreHoraire annee={annee} /> },
        { key: 'planification', module: 'planification', label: 'Horaires & planification', icone: IconCalendarStats,
          sansMarge: true, masque: true,
          rendu: <Planification /> },
        /* LES EFFECTIFS ET LES POSTES PNCC SONT DES DONNÉES DE L'ANNÉE (lot 4,
           2 octobre 2026) : ils quittent Configuration pour l'axe de ce qu'on
           organise. */
        { key: 'effectifs', module: 'organisation', label: 'Effectifs et postes PNCC', icone: IconChartBar,
          rendu: <Suspense fallback={<div className="p-4 text-sm text-slate-400">Chargement…</div>}>
                   <Effectifs /></Suspense> },
        { key: 'locaux', label: 'Locaux', icone: IconBuilding, futur: true,
          description: "Les locaux quitteront Configuration pour rejoindre le travail d'organisation." },
      ]}
    />
    </>
  );
}

/* LES DEUX FACES DE L'HORAIRE SONT DANS LE RAIL (Charles, 8 octobre 2026 : « sous
   menu rail ») : comme les étapes de l'unité, elles se déplient sous la rubrique. */
function CentreHoraire({ annee }) {
  const [face, setFace] = useState(() => {
    try {
      const o = sessionStorage.getItem('lucie.outil');
      if (o === 'horaire-controler' || o === 'horaire-composer' || o === 'horaire-consulter') { sessionStorage.removeItem('lucie.outil'); return o.slice(8); }
    } catch { /* sans mémoire de session */ }
    // CONSULTER D'ABORD (3.1.465, Charles) : on vient voir l'horaire ; le créer se fait au laboratoire.
    return 'consulter';
  });
  return (
    <div>
      {/* EN SERVICE LE 2 NOVEMBRE 2026 (3.1.463, Charles : « tout passe en service lundi ») : le grisé
          « bientôt » du rail et le bandeau « Version temporaire » du 11 octobre sont retirés. */}
      <RailLateral titre="Horaires" sections={[{ items: [
        { key: 'horaire-consulter', label: 'Consulter l’horaire', icon: IconEye, actif: face === 'consulter', onClick: () => setFace('consulter') },
        { key: 'horaire-composer', label: 'Composer la semaine', icon: IconCalendarEvent, actif: face === 'composer', onClick: () => setFace('composer') },
        { key: 'horaire-controler', label: 'Contrôler contre les attributions', icon: IconClock, actif: face === 'controler', onClick: () => setFace('controler') },
      ] }]} />
      {face === 'consulter' || face === 'composer' ? (
        <div className="p-4 space-y-3">
          {face === 'consulter' && (
            <div>
              <h1 className="titre-ecran">L’horaire de la semaine</h1>
              <p className="text-second text-slate-500">Par classe, par professeur ou par local. Il se crée au laboratoire temporel
                (Organisation → Le laboratoire temporel, étapes 1 à 6) ; une séance se retouche dans « Composer la semaine ».</p>
            </div>)}
          <Suspense fallback={<div className="text-sm text-slate-400">Chargement…</div>}>
            <HoraireSemaine key={face} consultation={face === 'consulter'} />
          </Suspense>
        </div>
      ) : annee
        ? <HoraireComparateur annee={annee} />
        : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div>}
    </div>
  );
}

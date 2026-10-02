import { lazy, Suspense, useEffect, useState } from 'react';
import GardeAnnee from '../components/GardeAnnee.jsx';
import { useSearchParams } from 'react-router-dom';
import Axe from '../components/Axe.jsx';
import {
  IconLayoutGrid, IconSchool, IconSitemap, IconFileDescription,
  IconClock, IconCalendarStats, IconBuilding, IconBooks, IconUsersGroup, IconPercentage, IconCalendarWeek, IconChartBar,
} from '@tabler/icons-react';
import Attributions from './Attributions.jsx';
import Planification from './Planification.jsx';
import HoraireComparateur from './HoraireComparateur.jsx';
import DUE from './DUE.jsx';
import StructureSection from './StructureSection.jsx';
import Rentree from './Rentree.jsx';
import { authHeaders } from '../lib/api.js';

const CentrePlanification = lazy(() => import('./CentrePlanification.jsx'));
const RepartitionCours = lazy(() => import('./RepartitionCours.jsx'));
const PonderationsUE = lazy(() => import('./PonderationsUE.jsx'));
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
  const ongletDemande = params.get('onglet') || ongletInitial;
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
      titre="Organisation" icone={IconBooks} impression="organisation" echanges
      question="« Qu'organise-t-on cette année ? »"
      ongletInitial={ongletDemande}
      onglets={[
        { key: 'attributions', label: 'Attributions', icone: IconLayoutGrid, sansMarge: true,
          rendu: <Attributions /> },
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
        { key: 'planifier', label: 'Planification', icone: IconCalendarStats,
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<div className="p-4 text-[13px] text-slate-400">Chargement…</div>}>
                   <CentrePlanification annee={annee}
                     ongletInitial={params.get('sous') || 'ue'} /></Suspense> },
        { key: 'rentree', label: 'Rentrée', icone: IconSchool, sansMarge: true,
          rendu: annee
            ? <Rentree annee={annee} />
            : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div> },
        /* LE LIEN ATTRIBUTIONS × PAE. Après la rentrée, les étudiants sont là
           et les attributions posées : on les croise — pour chaque cours, qui
           a cours dans quel groupe. Demandé par Charles (24 septembre 2026) :
           « c'est le tableau qui va croiser les attributions et les PAE. » */
        { key: 'repartition', label: 'Répartition des étudiants', icone: IconUsersGroup,
          sansMarge: true,
          rendu: <Suspense fallback={<div className="p-4 text-[13px] text-slate-400">Chargement…</div>}>
                   <RepartitionCours /></Suspense> },
        { key: 'structure', label: 'Schéma de capitalisation', icone: IconSitemap, sansMarge: true,
          rendu: annee
            ? <StructureSection annee={annee} />
            : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div> },
        /* LES PONDÉRATIONS SONT UN CHOIX ANNUEL (Charles, 25 septembre 2026) :
           elles quittent Configuration pour l'axe de ce qu'on organise cette
           année. Part des cours dans l'UE, liens acquis → cours, dix points
           par cours. */
        { key: 'ponderations', label: 'Pondérations', icone: IconPercentage, sansMarge: true,
          rendu: <Suspense fallback={<div className="p-4 text-[13px] text-slate-400">Chargement…</div>}>
                   <PonderationsUE /></Suspense> },
        // Le descriptif d'unité était un Word recopié d'année en année. Il
        // trouve ici sa place : c'est bien de l'organisation de l'enseignement
        // qu'il parle, et les titulaires y accèdent pour leurs propres unités.
        { key: 'due', label: "Descriptifs d'UE", icone: IconFileDescription, sansMarge: true,
          rendu: <DUE /> },
        /* UN SEUL CENTRE HORAIRE (Charles, 29 septembre 2026 : « les deux
           premières icônes doivent devenir un seul centre horaire ; la
           troisième est un ancien module, à cacher »). Deux faces d'un même
           objet : COMPOSER la semaine (tuiles, bac tiré des groupes, import
           Hyperplanning) et CONTRÔLER l'horaire contre les attributions — ce
           que l'horaire dépense doit être ce qui a été accordé, et par les
           bonnes personnes. L'ancien « Horaires & planification » est masqué :
           la Planification du rail le remplace. */
        { key: 'horaire-semaine', label: 'Horaires', icone: IconCalendarWeek, sansMarge: true,
          rendu: <CentreHoraire annee={annee} /> },
        { key: 'planification', label: 'Horaires & planification', icone: IconCalendarStats,
          sansMarge: true, masque: true,
          rendu: <Planification /> },
        /* LES EFFECTIFS ET LES POSTES PNCC SONT DES DONNÉES DE L'ANNÉE (lot 4,
           2 octobre 2026) : ils quittent Configuration pour l'axe de ce qu'on
           organise. */
        { key: 'effectifs', label: 'Effectifs et postes PNCC', icone: IconChartBar,
          rendu: <Suspense fallback={<div className="p-4 text-[13px] text-slate-400">Chargement…</div>}>
                   <Effectifs /></Suspense> },
        { key: 'locaux', label: 'Locaux', icone: IconBuilding, futur: true,
          description: "Les locaux quitteront Configuration pour rejoindre le travail d'organisation." },
      ]}
    />
    </>
  );
}

function CentreHoraire({ annee }) {
  const [face, setFace] = useState('composer');
  const FACES = [
    { cle: 'composer', label: 'Composer la semaine', icone: IconCalendarWeek,
      aide: 'La semaine par classe, professeur ou local ; les tuiles se déplacent, le bac tient ce qui reste à poser.' },
    { cle: 'controler', label: 'Contrôler contre les attributions', icone: IconClock,
      aide: "Ce que l'horaire dépense, rapporté à ce qui a été attribué, et par qui." },
  ];
  return (
    <div>
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-200">
        {FACES.map(o => {
          const Icone = o.icone;
          return (
            <button key={o.cle} type="button" onClick={() => setFace(o.cle)} title={o.aide}
              className={`onglet-page ${face === o.cle ? 'onglet-page-actif' : ''} flex items-center gap-1.5`}>
              <Icone size={15} /> {o.label}
            </button>
          );
        })}
      </div>
      {face === 'composer' ? (
        <div className="p-4">
          <Suspense fallback={<div className="text-[13px] text-slate-400">Chargement…</div>}>
            <HoraireSemaine />
          </Suspense>
        </div>
      ) : annee
        ? <HoraireComparateur annee={annee} />
        : <div className="text-sm text-slate-400 p-4">Chargement de l'année active…</div>}
    </div>
  );
}

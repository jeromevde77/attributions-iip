import { ICONE_AXE } from '../lib/iconesAxes.js';
import { lazy, Suspense, useEffect, useState } from 'react';
import { RailLateral } from '../components/ui.jsx';
import GardeAnnee from '../components/GardeAnnee.jsx';
import { useSearchParams } from 'react-router-dom';
import Axe from '../components/Axe.jsx';
import {
  IconLayoutGrid, IconSchool, IconSitemap, IconFileDescription,
  IconClock, IconCalendarStats, IconBuilding, IconBooks, IconUsersGroup, IconListDetails, IconCalendarEvent, IconPercentage, IconTable, IconCalendarWeek, IconChartBar, IconPuzzle,
} from '@tabler/icons-react';
import Attributions from './Attributions.jsx';
import Planification from './Planification.jsx';
import HoraireComparateur from './HoraireComparateur.jsx';
const AtelierUE = lazy(() => import('./AtelierUE.jsx'));
import StructureSection from './StructureSection.jsx';
import Rentree from './Rentree.jsx';
import { authHeaders } from '../lib/api.js';

const CentrePlanification = lazy(() => import('./CentrePlanification.jsx'));
const RepartitionCours = lazy(() => import('./RepartitionCours.jsx'));
const GroupesCommuns = lazy(() => import('./GroupesCommuns.jsx'));
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
  const ongletDemande = ['ponderations', 'due'].includes(demande) ? 'unite' : demande;
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
      ordreRail={[['attributions', 'planifier', 'rentree', 'repartition', 'structure', 'unite',
        'horaire-semaine', 'effectifs']]}
      sousMenus={[{ key: 'horaire-semaine', label: 'Horaires', icone: IconCalendarWeek, hote: 'horaire-semaine',
        enfants: [
          { key: 'horaire-composer', label: 'Composer la semaine', icone: IconCalendarEvent },
          { key: 'horaire-controler', label: 'Contrôler contre les attributions', icone: IconClock },
        ] }, { key: 'unite', label: 'Unité : croiser, pondérer, décrire', icone: IconListDetails, hote: 'unite',
        enfants: [
          { key: 'face-croisement', label: '1. Croiser les acquis et le programme', icone: IconTable },
          { key: 'face-ponderation', label: '2. Pondérer', icone: IconPercentage },
          { key: 'face-descriptif', label: '3. Décrire l’unité (DUE)', icone: IconFileDescription },
        ] }]}
      onglets={[
        { key: 'attributions', module: 'attributions', label: 'Attributions', icone: IconLayoutGrid, sansMarge: true,
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
        { key: 'planifier', module: 'planification', label: 'Planification', icone: IconCalendarStats,
          sansMarge: true, railPropre: true,
          rendu: <Suspense fallback={<div className="p-4 text-[13px] text-slate-400">Chargement…</div>}>
                   <CentrePlanification annee={annee}
                     ongletInitial={params.get('sous') || 'ue'} /></Suspense> },
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
          rendu: <Suspense fallback={<div className="p-4 text-[13px] text-slate-400">Chargement…</div>}>
                   <RepartitionCours /></Suspense> },
        /* LES GROUPES COMMUNS (9 octobre 2026) : les TP d'un bloc coupés en
           briques, pour que les groupes de tous les cours s'emboîtent à l'horaire. */
        { key: 'groupes-communs', module: 'organisation', label: 'Groupes communs (TP)', icone: IconPuzzle, sansMarge: true,
          rendu: <Suspense fallback={<div className="p-4 text-[13px] text-slate-400">Chargement…</div>}>
                   <GroupesCommuns /></Suspense> },
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
          rendu: <Suspense fallback={<div className="p-4 text-[13px] text-slate-400">Chargement…</div>}>
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
          rendu: <Suspense fallback={<div className="p-4 text-[13px] text-slate-400">Chargement…</div>}>
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
      if (o === 'horaire-controler' || o === 'horaire-composer') { sessionStorage.removeItem('lucie.outil'); return o.slice(8); }
    } catch { /* sans mémoire de session */ }
    return 'composer';
  });
  return (
    <div>
      <RailLateral titre="Horaires" sections={[{ items: [
        { key: 'horaire-composer', label: 'Composer la semaine', icon: IconCalendarEvent, actif: face === 'composer', onClick: () => setFace('composer') },
        { key: 'horaire-controler', label: 'Contrôler contre les attributions', icon: IconClock, actif: face === 'controler', onClick: () => setFace('controler') },
      ] }]} />
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

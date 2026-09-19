import { lazy, Suspense, useState } from 'react';
import { IconCalendarStats, IconCalendar, IconCalendarEvent } from '@tabler/icons-react';
import DatesUE from '../components/DatesUE.jsx';

const GrilleOrganisation = lazy(() => import('./GrilleOrganisation.jsx'));
const CalendrierSessions = lazy(() => import('../components/CalendrierSessions.jsx'));

/**
 * PLANIFIER, C'EST UN SEUL TERRITOIRE — DONC UNE SEULE PORTE.
 *
 * Trois écrans répondaient à la même question — QUAND les choses se passent —
 * et occupaient trois entrées du rail : la grille d'organisation, les dates
 * d'ouverture et de fermeture des unités, et le calendrier des sessions. Le
 * rail les présentait côte à côte comme trois métiers distincts, si bien qu'on
 * en ouvrait un, puis l'autre, pour reconstituer de tête une chronologie que
 * personne ne voyait d'un bloc. Et une icône se mérite : trois icônes voisines
 * qui disent « le temps » ne signalent plus rien.
 *
 * Une entrée, trois faces du même objet. La forme suit la règle de la maison :
 * on ne change pas de territoire, on tourne une page — donc le SOULIGNEMENT
 * (`.onglet-page`), et non la pastille, qui dit « où l'on est ».
 *
 * L'ordre est celui du travail réel, et il ne se discute pas plus que le reste :
 * on planifie d'abord ce qu'on organise (unités et cours), puis on pose les
 * dates de chaque unité, puis les sessions d'évaluation qui les ferment.
 */
const ONGLETS = [
  { cle: 'ue', label: 'Planification des UE et cours', icone: IconCalendarStats,
    aide: 'La grille : ce qu’on fait de chaque unité cette année' },
  { cle: 'dates', label: 'Dates des UE', icone: IconCalendar,
    aide: 'Ouverture et fermeture de chaque unité' },
  { cle: 'sessions', label: 'Sessions', icone: IconCalendarEvent,
    aide: 'Évaluations et délibérations de la section' },
];

export default function CentrePlanification({ annee, ongletInitial = 'ue' }) {
  const [onglet, setOnglet] = useState(
    ONGLETS.some(o => o.cle === ongletInitial) ? ongletInitial : 'ue');

  return (
    /* LA GOUTTIÈRE DU RAIL EST POSÉE ICI, UNE FOIS POUR LES TROIS FACES.
     *
     * Chaque écran la posait — ou ne la posait pas : la grille et les dates
     * n'en avaient aucune, et c'est l'axe qui la fournissait avant qu'elles ne
     * soient déclarées « rail propre ». Réunies sous des onglets, l'anomalie
     * s'est vue d'un coup : la barre d'onglets commençait sous le rail. Une
     * règle qui n'est juste que si chaque écran y pense est une règle fausse —
     * le centre la pose, et les trois en héritent. */
    <div className="gouttiere-rail flex flex-col min-h-0">
      {/* LA BARRE D'ONGLETS NE DÉFILE PAS AVEC LE CONTENU : on change de face
          en gardant le repère, comme sur une fiche. */}
      <div className="flex-none flex items-center gap-1 px-4 pt-3
                      border-b border-slate-200">
        {ONGLETS.map(o => {
          const Icone = o.icone;
          return (
            <button key={o.cle} onClick={() => setOnglet(o.cle)} title={o.aide}
              className={`onglet-page ${onglet === o.cle ? 'onglet-page-actif' : ''}
                          flex items-center gap-1.5`}>
              <Icone size={15} />
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        <Suspense fallback={
          <div className="p-4 text-[13px] text-slate-400">Chargement…</div>}>
          {onglet === 'ue' && <GrilleOrganisation sansTitre />}
          {onglet === 'dates' && (annee
            ? <DatesUE annee={annee} sansTitre />
            : <div className="p-4 text-[13px] text-slate-400">
                Chargement de l'année active…
              </div>)}
          {onglet === 'sessions' && <CalendrierSessions sansTitre />}
        </Suspense>
      </div>
    </div>
  );
}

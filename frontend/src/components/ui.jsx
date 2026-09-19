import { createContext, Fragment, lazy, Suspense, useContext, useEffect, useState } from 'react';

const CentreImpressionCentral = lazy(() => import('./CentreImpressionCentral.jsx'));
const Ameliorations = lazy(() => import('./Ameliorations.jsx'));
import { createPortal } from 'react-dom';
import { IconPin, IconPinnedOff, IconSun, IconMoon, IconSend, IconBulb, IconX } from '@tabler/icons-react';
import { useRailEpingle, basculerEpingle, LARGEUR_RAIL } from '../lib/railEpingle.js';
import { useMode, basculerMode } from '../lib/theme.js';

/**
 * LE RAIL EST UN, ET IL APPARTIENT À L'AXE.
 *
 * Chaque écran posait son propre rail, et l'axe posait au-dessus une rangée
 * d'onglets horizontaux : deux navigations pour le même endroit, l'une sous
 * l'autre, plus le menu principal en haut. Trois niveaux empilés — et la
 * verticale, qui est la place naturelle d'une liste de rubriques, restait à
 * moitié vide pendant que l'horizontale débordait.
 *
 * Désormais : le menu principal reste horizontal — c'est lui qui dit dans quel
 * MÉTIER on est —, et tout le reste descend dans le rail. Les rubriques de
 * l'axe en tête, puis les outils de l'écran ouvert.
 *
 * Le contexte permet à un écran de CONTRIBUER ses outils au rail de l'axe sans
 * rien changer à son code : il appelle `RailLateral` comme avant, et le
 * composant s'inscrit au lieu de se dessiner. Hors d'un axe — un écran ouvert
 * seul — il se dessine comme avant.
 */
const ContexteRail = createContext(null);
/**
 * LE VOLET DU RAIL — pour les écrans qui ne tiennent pas dans une colonne
 * d'icônes.
 *
 * Attributions affichait, collé au rail, un second panneau blanc « Filtres &
 * actions » : sa propre flèche de repli, son propre style, ses propres
 * boutons. Deux bandes verticales avant d'atteindre le tableau, et une
 * info-bulle du rail qui venait recouvrir le texte du voisin. Deux menus l'un
 * contre l'autre, c'en est un de trop.
 *
 * Ces écrans reçoivent donc un RAIL LARGE : le même objet flottant, la même
 * ombre, le même rayon, mais une seconde colonne à l'intérieur. Les icônes de
 * l'axe restent où l'œil les cherche, et ce qui ne tient pas en icône — des
 * listes déroulantes, un champ de recherche — vit à côté d'elles, DANS le
 * rail. Un seul panneau, une seule bordure.
 */
const ContextePanneau = createContext(null);
/**
 * L'écran dit à l'axe COMMENT ouvrir son centre d'échanges ; l'axe décide OÙ
 * le bouton se trouve. C'est ainsi que « Importer / exporter » est à la même
 * place partout sans qu'aucun écran n'ait à savoir où est le rail.
 */
const ContexteEchanges = createContext(null);
export function FournisseurRail({ valeur, panneau, echanges, children }) {
  return (
    <ContexteRail.Provider value={valeur}>
      <ContexteEchanges.Provider value={echanges}>
        <ContextePanneau.Provider value={panneau}>{children}</ContextePanneau.Provider>
      </ContexteEchanges.Provider>
    </ContexteRail.Provider>
  );
}

/** Un écran déclare ici la porte de ses imports et exports. */
export function useEchangesDuRail(ouvrir) {
  const inscrire = useContext(ContexteEchanges);
  useEffect(() => {
    if (!inscrire) return undefined;
    inscrire(() => ouvrir);
    return () => inscrire(null);
  }, [inscrire, ouvrir]);
}

/**
 * Un écran déclare son volet en montant ce composant, comme il déclare ses
 * outils avec RailLateral : il ne dessine rien lui-même et ne sait pas où le
 * rail se trouve.
 */
export function VoletRail({ titre, children }) {
  const ctx = useContext(ContextePanneau);
  // ON NE FAIT PAS REMONTER LE CONTENU, ON DESCEND LE CONTENEUR.
  // Faire passer des éléments React par un contexte les recrée à chaque rendu,
  // donc réinscrit, donc redessine — une boucle sans fin. Le rail annonce
  // seulement qu'il tient un volet ; l'écran y projette son contenu, qui reste
  // son contenu : son état, ses gestionnaires, ses rendus, chez lui.
  useEffect(() => {
    if (!ctx?.declarer) return undefined;
    ctx.declarer(titre || '');
    return () => ctx.declarer(null);
  }, [ctx, titre]);
  if (!ctx?.noeud) return null;
  return createPortal(children, ctx.noeud);
}

// Composants UI partagés — système de design IIP harmonisé.
// Couleurs : bleu marine #1B2B4B (iip-blue), turquoise #00AACC (iip-turquoise), rouge #C0392B (danger).
// Police : Inter (définie globalement dans index.css).

// En-tête de page standard : icône turquoise + titre bleu marine + sous-titre.
//
// IL TENAIT SUR DEUX LIGNES ET PESAIT UNE BANDE ENTIÈRE. Or l'axe est déjà
// nommé dans la barre du haut et l'onglet dit lequel on regarde : ce titre-ci
// n'est plus une annonce, c'est un repère. Il en prend la taille — et le
// sous-titre passe SUR LA MÊME LIGNE quand la largeur le permet, séparé par un
// point médian, au lieu de s'empiler dessous.
//
// Ce qui est gagné, ce sont les quarante pixels qui séparaient le haut de
// l'écran de la première donnée, sur chacun des dix écrans qui l'emploient.
export function PageHeader({ icon: Icon, titre, sous, actions }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-3.5">
      {/* PLUS D'ICÔNE DEVANT LE TITRE.
          Elle répétait celle de l'axe, à trois centimètres de distance, et
          aucun des autres écrans n'en avait : le titre tombait donc plus à
          droite ici qu'ailleurs, pour redire ce que le rail disait déjà. */}
      <div className="flex items-baseline gap-2.5 min-w-0">
        <h1 className="titre-ecran flex-shrink-0 mb-0">{titre}</h1>
        {sous && (
          <p className="text-[13px] text-slate-400 truncate hidden md:block">
            <span className="mr-2 text-slate-300">·</span>{sous}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// Barre d'onglets harmonisée. items = [{ key, label, icon }]. value = clé active.
export function Tabs({ items, value, onChange }) {
  return (
    <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
      {items.map(({ key, label, icon: Icon }) => {
        const actif = value === key;
        return (
          <button key={key} onClick={() => onChange(key)}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-[13px] whitespace-nowrap border-b-2 -mb-px transition-colors duration-150
              ${actif
                ? 'border-iip-turquoise text-iip-blue font-semibold'
                : 'border-transparent text-gray-500 hover:text-iip-blue'}`}>
            {Icon && <Icon size={17} stroke={1.8} className={actif ? 'text-iip-turquoise' : ''} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Bouton harmonisé. variant : 'primary' | 'secondary' | 'accent' | 'danger' | 'danger-soft' | 'ghost'
export function Btn({ variant = 'secondary', icon: Icon, children, className = '', ...props }) {
  const base = 'inline-flex items-center gap-2 text-[13px] font-medium px-3.5 py-2 rounded-champ transition-colors duration-150 ease-ios disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary:      'bg-iip-blue text-white hover:bg-iip-blue-dark',
    secondary:    'bg-white text-iip-blue border border-slate-300 hover:bg-slate-50',
    accent:       'bg-iip-turquoise text-white hover:bg-iip-turquoise-dark',
    danger:       'bg-iip-danger text-white hover:brightness-110',
    'danger-soft':'bg-white text-iip-danger border border-red-200 hover:bg-red-50',
    ghost:        'text-gray-500 hover:text-iip-blue hover:bg-slate-100',
  };
  return (
    <button className={`${base} ${variants[variant] || variants.secondary} ${className}`} {...props}>
      {Icon && <Icon size={16} stroke={1.8} />}
      {children}
    </button>
  );
}

// Carte KPI sobre. couleur : valeur affichée (sémantique). 'neutral'|'warn'|'good'|'bad'
export function KpiCard({ label, valeur, sous, ton = 'neutral' }) {
  const tons = {
    neutral: 'text-iip-blue',
    warn: 'text-amber-600',
    good: 'text-emerald-700',
    bad: 'text-iip-danger',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-carte shadow-pose px-5 py-4">
      <div className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${tons[ton] || tons.neutral}`}>{valeur}</div>
      {sous && <div className="text-[11px] text-gray-400 mt-0.5">{sous}</div>}
    </div>
  );
}

// Rail latéral « glissant » partagé.
// Étroit (icônes seules) par défaut, s'élargit au survol PAR-DESSUS le contenu
// (positionné en absolute) pour ne pas faire sauter la zone de travail centrale.
// Le conteneur parent doit être `relative` ; le contenu porte la classe
// `gouttiere-rail`, qui suit la largeur réelle du rail.
//   icon       : composant icône d'en-tête (turquoise)
//   titre      : titre de l'en-tête (blanc, visible au survol)
//   sousTitre  : petite ligne sous le titre (optionnel)
//   extra      : noeud rendu sous l'en-tête (ex. déroulant année) — visible au survol
//   sections   : [{ label?, items: [{ key, label, icon, actif, onClick }] }]
export function RailLateral({ icon: HeaderIcon, titre, sousTitre, extra,
                              sections = [], actions = [],
                              impression = 'etudiants', pieces = null }) {
  // DANS UN AXE, ON NE SE DESSINE PAS : ON S'INSCRIT. L'axe tient un seul rail
  // et y place d'abord ses rubriques, puis ces outils-ci.
  const inscrire = useContext(ContexteRail);
  // La signature sert de comparaison : sans elle, chaque rendu de l'écran
  // réinscrirait un tableau neuf et le rail se redessinerait sans fin.
  const signature = JSON.stringify(sections.map(sec => [sec.label,
    (sec.items || []).map(i => [i.key, i.label, !!i.actif, i.couleur || ''])]));
  useEffect(() => {
    if (!inscrire) return undefined;
    inscrire(sections);
    return () => inscrire(null);
  }, [inscrire, signature, sousTitre]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (inscrire) return null;

  return <RailDessine icon={HeaderIcon} titre={titre} sousTitre={sousTitre}
    extra={extra} sections={sections} actions={actions}
    impression={impression} pieces={pieces} />;
}

/** Le rail tel qu'il se dessine — appelé par l'axe, ou par un écran isolé. */
/**
 * LE TIROIR DU RAIL — il s'ouvre, il n'apparaît pas.
 *
 * Monté directement à sa hauteur finale, le sous-menu surgissait d'un bloc :
 * on ne voyait pas d'où il venait, et le lien avec la rubrique cliquée se
 * perdait. Il se monte donc FERMÉ, et s'ouvre à l'image suivante — c'est le
 * mouvement, pas la présence, qui dit la parenté.
 *
 * La hauteur passe de 0fr à 1fr : la seule transition de hauteur qui n'oblige
 * pas à mesurer le contenu, donc la seule qui reste juste le jour où une
 * entrée s'ajoute.
 */
function TiroirRail({ children }) {
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setOuvert(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return (
    <div className="grid transition-[grid-template-rows] duration-300 ease-ios"
      style={{ gridTemplateRows: ouvert ? '1fr' : '0fr' }}>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

export function RailDessine({ icon: HeaderIcon, titre, sousTitre, extra, surAccueil,
                              sections = [], actions = [], volet = null,
                              surNoeudVolet = null, impression = 'etudiants',
                              pieces = null }) {
  /*
   * LE CENTRE D'IMPRESSION EST PORTÉ PAR LE RAIL, ET PAR LUI SEUL.
   *
   * « On doit toujours pouvoir aller vers le centre d'impression. » Il était
   * déclaré écran par écran : présent sur trois, absent sur les vingt autres.
   * Un outil qu'on trouve ici et pas sur l'écran voisin n'est pas un outil,
   * c'est une surprise — et une règle qui n'est juste que si l'on y pense est
   * une règle fausse. Le rail le pose donc pour tous, en dernier sous le
   * filet, à la même place et dans le même ordre.
   */
  const [centre, setCentre] = useState(false);
  const epingle = useRailEpingle();
  // On ne s'abonne au mode que pour savoir quelle icône proposer — soleil ou
  // lune : les couleurs, elles, viennent des jetons.
  const mode = useMode();
  /**
   * UNE SEULE BULLE, HORS DE LA ZONE QUI DÉFILE.
   *
   * Rendue dans chaque entrée, elle aurait été rognée : le rail porte
   * « overflow-hidden » et le conteneur des rubriques défile, ce qui force le
   * navigateur à couper ce qui dépasse. On retient donc le libellé survolé et
   * sa hauteur, et on la dessine une fois, au niveau du rail.
   */
  const [survol, setSurvol] = useState(null);
  const [idees, setIdees] = useState(false);
  const surviser = (e, label) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = e.currentTarget.closest('aside').getBoundingClientRect();
    setSurvol({ label, y: r.top - p.top + r.height / 2 });
  };

  // LA GOUTTIÈRE EST POSÉE PAR LE RAIL, ET PAR LUI SEUL. Les écrans la
  // consomment par la classe « gouttiere-rail » : c'est ainsi que le contenu
  // suit quand on épingle, sans qu'aucun d'eux ait à le savoir.
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--rail', volet ? LARGEUR_RAIL.volet
      : epingle ? LARGEUR_RAIL.ouvert : LARGEUR_RAIL.replie);
    // LA LARGEUR RÉELLE DU PANNEAU, distincte de la gouttière : c'est là que
    // le filet du rail monte rejoindre celui de la barre du haut.
    r.style.setProperty('--rail-largeur',
      volet || epingle ? '14.5rem' : '3.5rem');
    return () => {
      r.style.removeProperty('--rail');
      r.style.removeProperty('--rail-largeur');
    };
  }, [epingle, volet]);

  /**
   * LE RAIL NE BOUGE PLUS.
   *
   * Il s'élargissait au survol, par-dessus le contenu. Sur le calendrier des
   * sessions ou une grille de délibération — les écrans les plus larges — il
   * recouvrait précisément ce qu'on était en train de lire, et il affichait
   * cinq libellés pour répondre à une seule question.
   *
   * Étroit et fixe, donc, avec une BULLE au survol : elle nomme une seule
   * chose, celle qu'on vise, et ne déplace rien. L'épingle reste pour qui veut
   * la liste sous les yeux en permanence — c'est un réglage, non un accident
   * du curseur.
   */
  const reveal = epingle ? 'whitespace-normal' : 'hidden';

  const rail = (
    /* Le parti est expliqué sur la balise ci-dessous : le rail fait
       désormais partie du cadre de la page, il ne s'y pose plus. */
    <aside
      /* LE RAIL SE FOND DANS LA PAGE.
       *
       * Panneau flottant, il posait une question sans réponse : à quelle
       * hauteur commence-t-il ? Centré, il ne tombait sur rien ; aligné, il
       * dépendait de la marge de chaque écran, et quatre pixels suffisaient à
       * le trahir. Un objet qui flotte doit s'aligner sur quelque chose, et il
       * n'y avait rien.
       *
       * Il prend donc le parti inverse : MÊME FOND QUE LA PAGE, collé au bord
       * gauche, trois côtés seulement — un filet à droite, deux angles
       * arrondis de ce côté-là. Il ne flotte plus : il fait partie du cadre,
       * comme la barre du haut. Plus rien à aligner, puisqu'il va d'un bord à
       * l'autre de ce qui reste sous la barre.
       *
       * La barre du haut demeure le seul point fixe, et le rail s'y raccroche.
       */
      className={`group/rail fixed left-0 z-10 flex py-0
        top-[calc(var(--barre-h,4rem)+1rem)] bottom-4
        rounded-r-carte border-l-0 border-r border-y
        transition-[width] duration-300 ease-ios
        ${volet ? 'w-[14.5rem]' : epingle ? 'w-[14.5rem]' : 'w-14'}`}
      style={{ background: 'var(--menu-fond)', borderColor: 'var(--menu-bord)' }}>
      {/* LA COLONNE DES ICÔNES — ce que tous les écrans ont en commun. */}
      {/* LE RAIL RESPIRE COMME LA ZONE DE TRAVAIL.
          Sa colonne d'icônes commençait douze pixels sous le filet, quand le
          contenu en prend seize : la première icône et la première carte ne
          tombaient donc jamais sur la même ligne, et l'oeil le voyait sans
          pouvoir le nommer. Même retrait des deux côtés — c'est une règle, pas
          un pixel choisi à la main. */}
      {/* LA PREMIÈRE ICÔNE TOMBE SUR LE TITRE DE L'ÉCRAN.
          Une case carrée de quarante et une ligne de titre de vingt-deux ne
          s'alignent pas en leur donnant le même retrait : c'est leur MILIEU qui
          doit coïncider. Le rail prend donc le retrait de la page moins la
          moitié de l'écart entre les deux hauteurs — une règle, pas un pixel
          choisi à la main : que la page respire plus ou moins, les deux
          milieux restent sur la même ligne. */}
      <div className={`flex flex-col pb-3 min-h-0 flex-shrink-0
        ${volet ? 'w-14 border-r' : 'flex-1'}`}
        style={{ borderColor: 'var(--menu-filet)',
                 paddingTop: 'calc(var(--retrait-page, 1rem) - 0.5rem)' }}>
      {/* UN EN-TÊTE VIDE OCCUPE QUAND MÊME SA PLACE.
          Rail replié et sans icône de titre, ce bloc ne montrait rien — mais
          ses vingt-quatre pixels poussaient la première icône plus bas que le
          titre du volet juste à côté, et que la première carte de la page. Les
          trois colonnes doivent partir de la même ligne : ce qui ne s'affiche
          pas ne se réserve pas de hauteur.

          ET L'ICÔNE DU TITRE NE DESCEND PAS DANS LA COLONNE. Rail replié, elle
          s'y rangeait comme une entrée de plus — même taille, même place, mais
          rien à cliquer —, et c'était déjà celle de l'axe dans la barre du
          haut : le même dessin, deux fois, à trente pixels d'écart. Un titre ne
          s'écrit qu'une fois. L'en-tête n'existe donc que le rail ouvert. */}
      {/* LA PORTE DE L'AXE — TOUJOURS LÀ, MÊME REPLIÉE.
          L'en-tête n'existait qu'une fois le rail épinglé, au motif que son
          icône redisait celle de la barre du haut. Le raisonnement était joli
          et faux : replié — c'est-à-dire presque toujours —, le rail n'avait
          plus ni nom ni retour. On cliquait « Délibération », le tiroir de la
          rubrique précédente se refermait, la colonne raccourcissait, et plus
          rien ne disait où l'on était ni comment rentrer.

          Ce bouton est donc le MÊME GESTE PARTOUT : il porte l'icône de l'axe,
          il le nomme, et il ramène à sa première rubrique — l'écran de base de
          cette partie de Lucie. C'est ce qui manquait : un point d'ancrage
          identique d'un axe à l'autre. */}
      {HeaderIcon && (
        <div className="flex-shrink-0 pb-1 mb-1">
          <button onClick={surAccueil} aria-label={`Revenir à ${titre}`}
            onMouseEnter={e => !epingle && surviser(e, `${titre} — écran de base`)}
            onMouseLeave={() => setSurvol(null)}
            disabled={!surAccueil}
            className={`relative flex text-[13px] transition-colors duration-150 ease-ios
              ${epingle
                ? 'w-full items-center gap-3 py-2 px-2.5 rounded-fenetre'
                : 'w-10 h-10 mx-auto items-center justify-center rounded-carte'}
              ${surAccueil ? 'hover:shadow-pose' : 'cursor-default'}`}
            style={{ color: 'var(--menu-texte)' }}
            data-case-rail={epingle ? undefined : '1'}>
            <HeaderIcon size={20} stroke={1.8} className="flex-shrink-0"
              style={{ color: 'var(--menu-accent)' }} />
            <span className={`text-left font-semibold min-w-0 flex-1 ${reveal}`}>
              {titre}
            </span>
          </button>
          <div className={`${epingle ? 'mx-2' : 'w-5 mx-auto'} pt-1.5 border-t`}
            style={{ borderColor: 'var(--menu-filet)' }} />
        </div>
      )}

      {epingle && (<>
      <div className={`flex items-center gap-3 mb-1 flex-shrink-0
        text-[color:var(--menu-texte)] ${epingle ? 'px-4' : 'justify-center'}`}>
        {/* Le titre est porté par la porte de l'axe, juste au-dessus : ici il
            ne reste que le sous-titre et l'épingle. Un titre ne s'écrit
            qu'une fois. */}
        <span className={`text-[15px] font-semibold flex-1 min-w-0 ${reveal}
                          sr-only`}>{titre}</span>
        {/* L'ÉPINGLE : le survol montre, l'épingle décide. Décaler la page au
            survol la ferait sauter chaque fois qu'on frôle le bord gauche. */}
        <button onClick={basculerEpingle}
          title={epingle ? 'Replier le rail' : 'Garder le rail ouvert'}
          className={`flex-none p-1 rounded-champ hover:bg-[color:var(--menu-survol)]
            ${epingle ? '' : 'hidden'}`}
          style={{ color: 'var(--menu-texte-doux)' }}>
          {epingle ? <IconPinnedOff size={15} /> : <IconPin size={15} />}
        </button>
      </div>
      {sousTitre && (
        <div className={`px-4 text-[11px] ${reveal}`}
          style={{ color: 'var(--menu-texte-doux)' }}>{sousTitre}</div>
      )}
      {extra && <div className={`px-3 pt-2 ${reveal}`}>{extra}</div>}
      </>)}

      {/* LES ACTIONS, EN TÊTE ET SOUS UN FILET.
          Au-dessus, ce qui change d'un écran à l'autre ; en dessous, ce qui ne
          change jamais — même place, même ordre, quel que soit l'écran, si bien
          qu'on finit par y aller sans regarder. L'impression d'abord : on
          imprime tous les jours, on importe quelques fois par an.

          ET CE BLOC EST EN HAUT. Rangé sous les rubriques, il finissait au bas
          du rail — d'autant plus bas que l'écran avait de rubriques, donc
          jamais à la même hauteur, et parfois hors de vue. Ce qu'on fait tous
          les jours se met en premier, à l'endroit où l'œil entre dans le
          rail. */}
      {/* UN FILET NE TOUCHE JAMAIS LES BORDS — c'est la règle de Lucie, et elle
          vaut ici comme dans la barre du haut. Posé d'un bord à l'autre, il
          coupe le rail en deux morceaux ; retiré des côtés, il sépare sans
          trancher. */}
      {true && (
        /* LE FILET SE RETIRE DES BORDS, PAS LES CASES.
           La marge qui écartait le filet du bord (« mx-3 ») écartait aussi les
           boutons : la case de quarante se retrouvait dans une colonne de
           trente-deux, et toutes les icônes d'en bas glissaient vers la droite
           tandis que celles du haut restaient centrées. Le filet est désormais
           une ligne à lui seul ; les cases gardent la colonne entière. */
        /* LE FILET EST UNE LIGNE À LUI, ET IL SE CENTRE SUR LES CASES.
           Porté par le bloc lui-même, il prenait la largeur de la colonne
           entière — donc exactement celle des cases, bords compris : il en
           prolongeait les coins arrondis et l'œil le lisait décalé. Il vaut
           désormais la moitié d'une case, centré dessous : rien à aligner,
           puisqu'il part du même axe. */
        <div className="flex-shrink-0 pb-1 mb-1 space-y-1">
          {/* IMPRIMER D'ABORD, ET TOUJOURS.
              On imprime tous les jours, on importe quelques fois par an : le
              geste le plus fréquent vient en tête, et il ne bouge jamais de
              place. « Exporter » a disparu de cette liste — imprimer, c'est
              sortir une pièce, quel que soit le format qu'on choisit ensuite
              dans la fenêtre. Deux portes pour un même geste, c'en était une
              de trop. */}
          {/* LE MÊME ORDRE PARTOUT, ET IL NE SE DISCUTE PAS :
              SORTIR d'abord — imprimer une pièce ou l'envoyer, c'est le même
              geste depuis que le centre fait les deux —, puis ce que l'écran
              apporte, puis DÉTRUIRE, toujours en dernier.
              L'avion plutôt que l'imprimante : ce qu'on ouvre là ne sort pas
              que du papier. Et le libellé suit le dessin — une enveloppe qui
              dirait « Imprimer » serait un libellé qui ment. */}
          {[{ key: '__impression', label: 'Imprimer ou envoyer', icon: IconSend,
              couleur: 'var(--menu-accent)', onClick: () => setCentre(true) },
            ...actions.filter(a2 => !a2.destructif),
            /* LA PORTE DES IDÉES, SUR TOUS LES ÉCRANS ET AU MÊME ENDROIT.
               Une demande s'écrit au moment où l'on bute, pas trois jours plus
               tard en réunion : si la porte n'est pas là où l'on est, elle
               n'est nulle part. Elle remplace les rubriques « à venir », qui
               promettaient des écrans inexistants dans le menu de ceux qui
               travaillent. */
            { key: '__idee', label: 'Proposer une amélioration', icon: IconBulb,
              onClick: () => setIdees(true) },
            ...actions.filter(a2 => a2.destructif)].map(a2 => {
            const Ic = a2.icon;
            return (
              <button key={a2.key} onClick={a2.onClick} aria-label={a2.label}
                onMouseEnter={e => !epingle && surviser(e, a2.label)}
                onMouseLeave={() => setSurvol(null)}
                /* LA MÊME CASE QUE PARTOUT — un carré aux coins arrondis.
                   L'impression s'affichait dans un cercle : une forme pour
                   elle seule dans toute l'application, ce qui la faisait
                   remarquer pour la mauvaise raison. Ce qui la distingue
                   désormais, c'est la COULEUR de son icône, et rien d'autre. */
                className={`relative flex text-[13px] mb-1
                  transition-colors duration-150 ease-ios
                  ${epingle
                    ? 'w-full items-center gap-3 py-2 px-2.5 rounded-fenetre'
                    : 'w-10 h-10 mx-auto items-center justify-center rounded-carte'}
                  hover:shadow-pose`}
                style={{ color: 'var(--menu-texte-doux)' }}
                data-case-rail={epingle ? undefined : '1'}>
                {Ic && (
                  /* LA COULEUR N'EST PAS UNE DÉCORATION, C'EST UN REPÈRE.
                     Turquoise : ce qui SORT — imprimer, et on le trouve sans
                     le chercher. Brique : ce qui DÉTRUIT. Gris : tout le
                     reste. Trois teintes, et chacune veut dire quelque chose. */
                  <Ic size={19} stroke={1.8} className="flex-shrink-0"
                    style={{ color: a2.couleur || 'var(--menu-icone)' }} />
                )}
                <span className={`text-left leading-tight min-w-0 flex-1 ${reveal}`}>
                  {a2.label}
                </span>
              </button>
            );
          })}
          <div className={`${epingle ? 'mx-2' : 'w-5 mx-auto'} pt-1.5 border-t`}
            style={{ borderColor: 'var(--menu-filet)' }} />
        </div>
      )}

      {/* Sections */}
      {/* LA COLONNE DES RUBRIQUES EST CE QUI CÈDE.
          Sans « flex-1 », elle prenait sa hauteur naturelle : dès qu'un écran
          avait dix rubriques, la pile poussait l'impression et le mode SOUS le
          bas du rail — hors du cadre, coupés par le bord de la fenêtre. Ce qui
          doit toujours se voir (imprimer, le mode) ne bouge pas ; c'est la
          liste qui se comprime et défile. */}
      <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden rail-defile px-2
        ${epingle ? 'mt-1.5' : ''}`}>
        {sections.map((sec, si) => (
          <div key={si} className="mb-3">
            {sec.label && (
              <div className={`px-1.5 mt-2 mb-1 text-[10px] font-semibold uppercase
                tracking-wider ${reveal}`} style={{ color: 'var(--menu-texte-doux)' }}>
                {sec.label}
              </div>
            )}
            {sec.items.map(it => {
              const Ic = it.icon;
              return (
                <Fragment key={it.key}>
                <button key={it.key} onClick={it.onClick} aria-label={it.label}
                  onMouseEnter={e => !epingle && surviser(e, it.label)}
                  onMouseLeave={() => setSurvol(null)}
                  /* UNE CASE CARRÉE, ET TOUTES DE LA MÊME TAILLE.
                     Les entrées étaient des boutons pleine largeur alignés en
                     haut (« items-start »), avec un « mt-px » sur l'icône : la
                     hauteur suivait le libellé, invisible mais présent, et les
                     icônes ne tombaient plus sur la même ligne d'un écran à
                     l'autre. Replié, chaque entrée est désormais un carré de
                     quarante, l'icône centrée dedans — ce qu'un rail d'icônes
                     doit être.
                     AU SURVOL, LA MÊME PASTILLE QUE L'ACTIVE, en plus discret :
                     un fond blanc à coins largement arrondis, et non un simple
                     grisé. On voit ce qu'on vise. */
                  className={`relative flex text-[13px] mb-1
                    transition-colors duration-150 ease-ios
                    ${epingle
                      ? 'w-full items-start gap-3 py-2 px-2.5 rounded-fenetre'
                      : 'w-10 h-10 mx-auto items-center justify-center rounded-carte'}
                    ${it.actif ? 'font-semibold ring-1 ring-inset' : 'hover:shadow-pose'}`}
                  style={it.actif
                    ? { background: 'var(--menu-actif)', color: 'var(--menu-texte)',
                        '--tw-ring-color': 'var(--menu-actif-bord)' }
                    : { color: 'var(--menu-texte-doux)' }}
                  onFocus={undefined}
                  data-case-rail={epingle ? undefined : '1'}>
                  {/* CELLE-CI A OUVERT QUELQUE CHOSE.
                      Un rail de trois pixels collé au bord de la tuile a été
                      essayé : vu à l'écran, il barre le côté gauche et écrase
                      la forme — la tuile n'est plus une tuile, c'est un onglet.
                      Un FILET FIN, posé à côté, plus court que la tuile et
                      terminé en arc aux deux bouts : il marque sans peser, et
                      la tuile garde son dessin d'origine. */}
                  {/* Le filet dit « un tiroir est ouvert dessous ». Il ne
                      dépend plus de « cette rubrique-ci est active » : le
                      tiroir se rattache désormais à la DERNIÈRE rubrique, qui
                      n'est presque jamais celle qu'on regarde. */}
                  {it.sous?.length > 0 && (
                    <span aria-hidden="true"
                      className="absolute left-0.5 top-1/2 -translate-y-1/2
                                 w-[2px] h-4 rounded-full"
                      style={{ background: 'var(--menu-accent)' }} />
                  )}
                  {Ic ? (
                    /* L'ACCENT EST SUR L'ICÔNE, non sur toute la pastille : un
                       aplat turquoise pleine largeur criait plus fort que le
                       contenu de la page. */
                    /* « couleur » ne peint plus la pastille : un aplat vert
                       à côté d'un aplat turquoise à côté d'un aplat marine
                       faisait de Personnel un autre menu que celui d'Étudiants,
                       pour des entrées qui n'avaient rien de plus à signaler
                       que les autres. Elle ne teinte que le TRAIT de l'icône,
                       et seulement quand quelque chose le mérite. */
                    <Ic size={19} stroke={1.8} className="flex-shrink-0"
                      style={it.actif ? { color: 'var(--menu-accent)' }
                        : { color: it.couleur || 'var(--menu-icone)' }} />
                  ) : (
                    /* FILET DE SÉCURITÉ : une entrée sans icône donnerait, rail
                       replié, une ligne vide — invisible et impossible à viser,
                       alors que le clic, lui, fonctionne toujours. À défaut
                       d'icône, un point tient la place et se voit. */
                    <span className="flex-shrink-0 w-[19px] flex justify-center"
                      aria-hidden="true">
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                    </span>
                  )}
                  {/* REPLIÉ, LE LIBELLÉ RESTE SUR UNE LIGNE — sinon un intitulé
                      long se replierait en quatre lignes invisibles et ferait
                      un bouton haut de cinquante pixels dans un rail où l'on ne
                      voit qu'une icône. OUVERT, il revient à la ligne : « Composer
                      les PAE de l'année suivante » ne tient pas en deux cent
                      quarante pixels, et débordait du rail. */}
                  <span className={`text-left leading-tight min-w-0 flex-1
                    break-words ${reveal}`}>
                    {it.label}
                  </span>
                </button>

                {/* LE RAIL S'OUVRE EN SON MILIEU.
                    Les outils de l'écran ouvert étaient ajoutés SOUS les
                    rubriques, dans une section à part : le rail semblait se
                    réécrire tout seul à chaque clic, et rien ne disait que ces
                    icônes-là appartenaient à l'écran plutôt qu'à l'axe.

                    Ils naissent désormais SOUS LEUR RUBRIQUE, entre deux
                    filets, en bleu clair : la parenté se lit sans qu'on
                    l'explique. Ce qui suit glisse vers le bas.

                    La hauteur passe de 0fr à 1fr — la seule transition de
                    hauteur qui n'oblige pas à mesurer le contenu, donc la seule
                    qui reste juste quand une entrée s'ajoute. */}
                {it.sous?.length > 0 && (
                  <TiroirRail key={`sous-${it.key}`}>
                      <div className={`${epingle ? 'mx-2' : 'w-5 mx-auto'} my-1 border-t`}
                        style={{ borderColor: 'var(--menu-sous-filet)' }} />
                      {it.sous.map(sv => {
                        const Sc = sv.icon;
                        return (
                          <button key={sv.key} onClick={sv.onClick} aria-label={sv.label}
                            onMouseEnter={e => !epingle && surviser(e, sv.label)}
                            onMouseLeave={() => setSurvol(null)}
                            className={`relative flex text-[13px] mb-1
                              transition-colors duration-150 ease-ios
                              ${epingle
                                ? 'w-full items-center gap-3 py-2 px-2.5 rounded-fenetre'
                                : 'w-10 h-10 mx-auto items-center justify-center rounded-carte'}
                              ${sv.actif ? 'font-semibold' : 'hover:shadow-pose'}`}
                            style={sv.actif
                              ? { background: 'var(--menu-sous-actif)',
                                  color: 'var(--menu-texte)' }
                              : { color: 'var(--menu-texte-doux)' }}
                            data-case-rail={epingle ? undefined : '1'}>
                            {Sc ? (
                              /* GRISES, COMME CELLES DU DESSUS.
                                 Les peindre toutes en bleu faisait du sous-menu
                                 un autre menu : cinq icônes colorées côte à
                                 côte ne signalent plus rien, elles décorent. La
                                 couleur reste ce qu'elle est partout dans
                                 Lucie — une dépense, réservée à ce qui doit
                                 être vu. Le bleu du sous-menu ne vit plus que
                                 dans ses deux filets. */
                              <Sc size={18} stroke={1.8} className="flex-shrink-0"
                                style={{ color: sv.couleur || 'var(--menu-icone)' }} />
                            ) : (
                              <span className="flex-shrink-0 w-[18px] flex justify-center"
                                aria-hidden="true">
                                <span className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: 'var(--menu-icone)' }} />
                              </span>
                            )}
                            <span className={`text-left leading-tight min-w-0 flex-1
                              break-words ${reveal}`}>{sv.label}</span>
                          </button>
                        );
                      })}
                      <div className={`${epingle ? 'mx-2' : 'w-5 mx-auto'} mt-1 mb-2 border-t`}
                        style={{ borderColor: 'var(--menu-sous-filet)' }} />
                  </TiroirRail>
                )}
                </Fragment>
              );
            })}
          </div>
        ))}
      </div>

      </div>

      {/* LE VOLET — ce que cet écran-ci ne peut pas dire en icônes. */}
      {volet && (
        <div className="flex-1 min-w-0 flex flex-col pb-3 px-3 min-h-0"
          style={{ paddingTop: 'calc(var(--retrait-page, 1rem) - 0.5rem)' }}>
          {volet.titre && (
            <div className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-wider
                            flex-shrink-0"
              style={{ color: 'var(--menu-texte-doux)' }}>{volet.titre}</div>
          )}
          <div ref={surNoeudVolet}
            className="min-h-0 overflow-y-auto rail-defile text-[13px]"
            style={{ color: 'var(--menu-texte)' }} />
        </div>
      )}

      {/* La bulle : une seule, au niveau du rail, hors de ce qui défile. */}
      {survol && !epingle && (
        /* LA BULLE SE POSE CONTRE L'ICÔNE, PAS CONTRE LE RAIL ENTIER.
           Calée sur « 100 % » de l'aside, elle sautait de l'autre côté du
           volet quand celui-ci était ouvert : on survolait une icône à gauche
           et le libellé s'affichait deux cent trente pixels plus loin, posé
           sur le contenu de la page. Elle suit désormais la colonne d'icônes,
           qui est ce qu'on survole. */
        <span style={{ top: survol.y, background: 'var(--menu-fond)',
                       borderColor: 'var(--menu-bord)', color: 'var(--menu-texte)',
                       boxShadow: 'var(--menu-ombre)',
                       left: volet ? 'calc(3.5rem + 10px)' : 'calc(100% + 10px)' }}
          className="pointer-events-none absolute -translate-y-1/2 z-50
                     px-2.5 py-1.5 rounded-champ border backdrop-blur-xl backdrop-saturate-150
                     text-[12px] whitespace-nowrap">
          {survol.label}
        </span>
      )}
    </aside>
  );

  return (
    <>
      {rail}
      {/* LA FENÊTRE SORT DU RAIL, PAR UN PORTAIL.
          Un élément « fixed » n'est fixe que si aucun de ses ancêtres ne
          transforme ni ne filtre : le rail floutait son fond, ce qui suffit à
          en faire le cadre de référence. Le centre d'impression se dessinait
          alors dans une bande de cinquante-six pixels de large. Rendu sur le
          corps du document, il retrouve la fenêtre entière. */}
      {centre && createPortal(
        <Suspense fallback={null}>
          <CentreImpressionCentral ongletInitial={impression} pieces={pieces}
            onClose={() => setCentre(false)} />
        </Suspense>, document.body)}

      {idees && createPortal(
        <Suspense fallback={null}>
          <Ameliorations ecran={titre} onClose={() => setIdees(false)} />
        </Suspense>, document.body)}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tableaux — bibliothèque partagée
//
// Le style est celui mis au point pour la répartition des périodes : aplats,
// gris pour les valeurs de référence, marine pour ce qui compte, en-têtes en
// petites capitales espacées. L'écrire une fois évite que trente-sept tableaux
// dérivent chacun de leur côté.
//
// Chaque composant accepte className pour les particularités locales — badges,
// teintes de ligne, colonnes figées — sans qu'il faille sortir de la famille.
// ─────────────────────────────────────────────────────────────────────────────

/** Cadre du tableau : bordure, arrondi, défilement horizontal. */
export function Tableau({ children, className = '', dense = false }) {
  return (
    <div className={`border border-slate-200 rounded-xl overflow-x-auto bg-white ${className}`}>
      <table className={`w-full ${dense ? 'text-[12px]' : 'text-sm'}`}>{children}</table>
    </div>
  );
}

/** En-tête : petites capitales grises sur fond clair. */
export function TableauEntete({ children, className = '' }) {
  return (
    <thead>
      <tr className={`tab-entete ${className}`}>
        {children}
      </tr>
    </thead>
  );
}

/**
 * Cellule d'en-tête.
 * @param {'gauche'|'centre'|'droite'} align
 */
export function Th({ children, align = 'gauche', largeur, className = '', ...props }) {
  const a = align === 'droite' ? 'text-right' : align === 'centre' ? 'text-center' : 'text-left';
  return (
    <th className={`px-3 py-2 font-medium ${a} ${largeur || ''} ${className}`} {...props}>
      {children}
    </th>
  );
}

/**
 * Cellule ordinaire.
 * @param {'normal'|'secondaire'|'fort'} ton  gris clair, gris, ou marine appuyé
 */
export function Td({ children, align = 'gauche', ton = 'normal', className = '', ...props }) {
  const a = align === 'droite' ? 'text-right' : align === 'centre' ? 'text-center' : 'text-left';
  const t = ton === 'secondaire' ? 'text-[12px] text-slate-500'
    : ton === 'fort' ? 'text-[13px] font-semibold text-iip-blue'
    : 'text-[13px] text-slate-800';
  return <td className={`px-3 py-1.5 ${a} ${t} ${className}`} {...props}>{children}</td>;
}

/** Ligne ordinaire, avec son survol et son filet. */
export function Tr({ children, actif = false, className = '', ...props }) {
  return (
    <tr className={`border-b border-slate-100 ${actif ? 'bg-iip-blue/5' : 'hover:bg-slate-50/60'}
                    ${className}`} {...props}>
      {children}
    </tr>
  );
}

/** Ligne de regroupement — section, catégorie — repliable le cas échéant. */
export function TrGroupe({ children, className = '', ...props }) {
  return (
    <tr className={`tab-repere ${className}`} {...props}>
      {children}
    </tr>
  );
}

/** Ligne de total : fond neutre, valeurs appuyées. */
export function TrTotal({ children, className = '', ...props }) {
  return (
    <tr className={`bg-slate-50 border-t-2 border-slate-300 font-semibold ${className}`} {...props}>
      {children}
    </tr>
  );
}

/** Message d'absence de données, occupant toute la largeur. */
export function TableauVide({ colonnes, children }) {
  return (
    <tr>
      <td colSpan={colonnes} className="px-4 py-8 text-center text-[13px] text-slate-400">
        {children}
      </td>
    </tr>
  );
}

const TEINTES_BADGE = {
  neutre:  'bg-slate-100 text-slate-600',
  info:    'bg-sky-100 text-sky-800',
  succes:  'bg-emerald-100 text-emerald-800',
  alerte:  'bg-amber-100 text-amber-800',
  danger:  'bg-red-100 text-red-700',
  accent:  'bg-violet-100 text-violet-700',
};

/** Badge de tableau : discret, sans bordure, aux teintes de l'application. */
export function Badge({ children, ton = 'neutre', className = '', ...props }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${TEINTES_BADGE[ton] || TEINTES_BADGE.neutre}
                      ${className}`} {...props}>
      {children}
    </span>
  );
}

/** Valeur numérique secondaire, en gris — un rapport, un rappel, une unité. */
export function Mention({ children, ton = 'neutre', className = '' }) {
  const t = ton === 'danger' ? 'text-red-600 font-semibold'
    : ton === 'alerte' ? 'text-amber-700' : 'text-slate-400';
  return <span className={`ml-1 text-[10px] ${t} ${className}`}>{children}</span>;
}


// ─────────────────────────────────────────────────────────────────────────────
// LES FENÊTRES — une seule, pour toutes.
//
// Soixante et onze fichiers posaient leur propre « fixed inset-0 » : autant de
// voiles, de rayons, d'en-têtes et de boutons de fermeture, tous presque
// pareils et jamais tout à fait. Le résultat se voyait — on changeait de
// maison en changeant de fenêtre — et il se payait : corriger un détail de
// mise en page demandait soixante et onze corrections.
//
// Le dessin est celui de la maquette : un voile marine léger, un panneau au
// rayon « fenetre », un bandeau marine qui NOMME la fenêtre, et un corps clair
// où les pièces sont des lignes bordées, plutôt que des boutons empilés. Rien
// n'y crie : la couleur est réservée à ce qui avertit.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le cadre. Il porte le voile, le panneau, le bandeau et la fermeture — et
 * rien d'autre : ce qu'il y a dedans ne le regarde pas.
 *
 *   icone   : icône du bandeau
 *   titre   : ce que la fenêtre EST (« Éditions — Étudiants »)
 *   sous    : une ligne de contexte, facultative
 *   large   : 'petite' | 'moyenne' | 'grande' | 'pleine'
 *   hauteurFixe : occuper 88 vh même quand le contenu est court. À réserver
 *     aux fenêtres dont le contenu change de hauteur sous l'utilisateur —
 *     sinon, une fenêtre fait la hauteur de ce qu'elle dit.
 *   pied    : noeud rendu sous un filet, en bas (les actions)
 *   ton     : 'neutre' | 'alerte' — l'alerte teinte le bandeau, et elle seule
 */
export function Fenetre({ icone: Ic, titre, sous, large = 'moyenne',
                         hauteurFixe = false,
                          pied = null, ton = 'neutre', onFermer, children }) {
  const largeurs = {
    petite: 'w-[440px]', moyenne: 'w-[720px]',
    grande: 'w-[1000px]', pleine: 'w-[1180px]',
  };
  // LA TOUCHE ÉCHAP FERME. Elle le faisait dans certaines fenêtres et pas dans
  // d'autres, ce qui est pire que nulle part : on apprend un geste qui tombe
  // parfois dans le vide.
  useEffect(() => {
    const f = e => { if (e.key === 'Escape') onFermer?.(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onFermer]);

  return (
    <div role="dialog" aria-modal="true" aria-label={titre}
      /* UNE FENÊTRE NE BOUGE PAS UNE FOIS OUVERTE.
         Centrée verticalement, elle se recentrait à chaque changement
         d'onglet : un onglet court la faisait monter, un onglet long
         descendre, et le bouton qu'on visait n'était plus là où on l'avait
         laissé. Elle s'ancre donc en haut, à une distance fixe, et c'est son
         CONTENU qui défile — la dynamique est la même dans toute l'appli. */
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[6vh]"
      onClick={e => e.target === e.currentTarget && onFermer?.()}>
      {/* LE VOILE EST UNE COUCHE À PART, ET C'EST VOLONTAIRE.
          Porté par le conteneur, son flou faisait de lui le cadre de référence
          de tout « fixed » rendu à l'intérieur : une fenêtre ouverte DEPUIS une
          fenêtre s'y trouvait enfermée. Le flou vit donc sur un calque frère du
          panneau, jamais sur son ancêtre. */}
      <div aria-hidden="true"
        className="absolute inset-0 bg-[rgba(11,21,45,.32)] backdrop-blur-[3px]" />
      {/* UNE FENÊTRE FAIT LA HAUTEUR DE CE QU'ELLE DIT — JUSQU'À 88 vh.
       *
       * Les grandes étaient figées à 88 vh parce qu'elles portaient des
       * onglets : une hauteur suivant le contenu faisait sauter l'écran d'un
       * onglet à l'autre. Mais la fenêtre s'ancre désormais EN HAUT, à 6 vh —
       * elle ne se recentre plus, donc son sommet ne bouge plus quand sa
       * hauteur change, et la raison d'être de la hauteur fixe est tombée.
       * Ce qu'il en restait se voyait : « Améliorations », trois champs et un
       * bouton, occupait les neuf dixièmes de l'écran, dont les deux tiers de
       * blanc sous le pied.
       *
       * Toutes plafonnent donc à 88 vh et s'arrêtent à leur contenu. Celles
       * dont le contenu varie vraiment d'un onglet à l'autre demandent
       * `hauteurFixe` — c'est alors un choix, écrit, et non le défaut subi par
       * les autres. */}
      <div className={`relative bg-white rounded-fenetre shadow-dessus overflow-hidden
                       flex flex-col max-w-full
                       ${hauteurFixe ? 'h-[88vh]' : 'max-h-[88vh]'}
                       ${largeurs[large] || largeurs.moyenne}`}>
        <div className="flex items-center gap-3 px-5 py-3 text-white flex-shrink-0"
          style={{ background: ton === 'alerte' ? '#9d4a38' : '#1B2B4B' }}>
          {Ic && <Ic size={18} className="flex-shrink-0"
            style={{ color: ton === 'alerte' ? '#f1c7bf' : '#7fd4e6' }} />}
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold truncate">{titre}</div>
            {sous && <div className="text-[12px] text-white/70 truncate">{sous}</div>}
          </div>
          <button onClick={onFermer} aria-label="Fermer"
            className="flex-none w-8 h-8 grid place-items-center rounded-champ
                       hover:bg-white/15 transition-colors duration-150 ease-ios">
            <IconX size={16} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>

        {pied && (
          <div className="flex-shrink-0 px-5 py-3 border-t border-slate-200
                          flex items-center gap-2 flex-wrap">{pied}</div>
        )}
      </div>
    </div>
  );
}

/** Un intertitre : il dit de quoi parle ce qui suit, en petit et en gris. */
export function GroupeFenetre({ titre, ton = 'neutre', children }) {
  return (
    <section className="mb-4 last:mb-0">
      {titre && (
        <div className="text-[11px] font-semibold uppercase tracking-[.13em] mb-2"
          style={{ color: ton === 'alerte' ? '#9d4a38' : '#94a3b8' }}>{titre}</div>
      )}
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

/**
 * UNE PIÈCE — une ligne bordée, et non un bouton de plus.
 *
 * L'ancien dessin empilait des boutons pleins, chacun d'une couleur : dix
 * aplats côte à côte, et plus rien ne ressortait. Une ligne claire, un filet,
 * l'icône en gris, ce qu'on emporte à droite. Ce qui doit alerter le dit par
 * son ton, et il est alors le seul de la liste à le faire.
 */
export function PieceFenetre({ icone: Ic, titre, sous, meta, ton = 'neutre',
                               actif = false, desactive = false, onClick }) {
  const teinte = ton === 'alerte' ? '#9d4a38' : ton === 'neuf' ? '#00809c' : null;
  const Balise = onClick ? 'button' : 'div';
  return (
    <Balise onClick={desactive ? undefined : onClick} disabled={desactive || undefined}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-carte
        border transition-colors duration-150 ease-ios
        ${desactive ? 'opacity-45' : onClick ? 'hover:border-slate-400' : ''}
        ${actif ? 'bg-slate-50' : 'bg-white'}`}
      style={{ borderColor: actif || teinte ? (teinte || '#1B2B4B') + '55' : '#e2e8f0' }}>
      {Ic && <Ic size={17} className="flex-shrink-0"
        style={{ color: teinte || '#94a3b8' }} />}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-slate-700">{titre}</span>
        {sous && <span className="block text-[12px] text-slate-400">{sous}</span>}
      </span>
      {meta != null && (
        <span className="flex-none text-[12px] text-slate-400 whitespace-nowrap">{meta}</span>
      )}
    </Balise>
  );
}

/** Les boutons du pied : un seul principal, le reste en retrait. */
export function BoutonFenetre({ principal = false, ton = 'neutre', desactive = false,
                                onClick, children }) {
  const fond = ton === 'alerte' ? '#9d4a38' : '#1B2B4B';
  return (
    <button onClick={onClick} disabled={desactive}
      className={`px-4 py-2 rounded-champ text-[13px] font-semibold
        transition-colors duration-150 ease-ios disabled:opacity-40
        ${principal ? 'text-white' : 'text-slate-600 border border-slate-300 hover:bg-slate-50'}`}
      style={principal ? { background: fond } : undefined}>
      {children}
    </button>
  );
}

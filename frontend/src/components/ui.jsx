import { createContext, Fragment, lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';

const CentreImpressionCentral = lazy(() => import('./CentreImpressionCentral.jsx'));
const Ameliorations = lazy(() => import('./Ameliorations.jsx'));
import { createPortal } from 'react-dom';
import { IconPin, IconPinnedOff, IconSun, IconMoon, IconSend, IconBulb, IconX, IconGift, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { demander } from '../lib/dialogue.jsx';
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
          <p className="text-sm text-slate-400 truncate hidden md:block">
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
  // LE STANDARD (3.1.249) : le soulignement de la maison, `.onglet-page`, réglable.
  return (
    <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
      {items.map(({ key, label, icon: Icon }) => (
        <button key={key} onClick={() => onChange(key)}
          className={`onglet-page flex items-center gap-2 ${value === key ? 'onglet-page-actif' : ''}`}>
          {Icon && <Icon size={17} stroke={1.8} />}
          {label}
        </button>))}
    </div>
  );
}

// Bouton harmonisé. variant : 'primary' | 'secondary' | 'accent' | 'danger' | 'danger-soft' | 'ghost'
export function Btn({ variant = 'secondary', icon: Icon, children, className = '', ...props }) {
  // LE STANDARD (3.1.249) : `.bouton` et ses trois emplois — fort, détruire, neutre.
  const variants = {
    primary: 'bouton bouton-fort', accent: 'bouton bouton-fort', secondary: 'bouton',
    danger: 'bouton bouton-detruire', 'danger-soft': 'bouton', ghost: 'bouton',
  };
  return (
    <button className={`${variants[variant] || 'bouton'} ${className}`} {...props}>
      {Icon && <Icon size={16} stroke={1.8} />}
      {children}
    </button>
  );
}

// Carte KPI sobre. couleur : valeur affichée (sémantique). 'neutral'|'warn'|'good'|'bad'
export function KpiCard({ label, valeur, sous, ton = 'neutral' }) {
  // LE STANDARD (3.1.249) : c'est une tuile ; le ton devient l'état.
  const etat = { neutral: 'neutre', warn: 'surveiller', good: 'reussi', bad: 'corriger' }[ton] || 'neutre';
  return <TuileEtat etat={etat} valeur={valeur} libelle={label} precision={sous} />;
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
    /* LES OUTILS DE L'ÉCRAN FORMENT UN BLOC, ET LE BLOC PORTE SON PROPRE
     * REPÈRE. Un filet le longe sur toute sa hauteur : on lit d'un coup où
     * commencent et où finissent les icônes qui appartiennent à l'écran
     * ouvert, sans que ce repère désigne — à tort — la rubrique posée juste
     * au-dessus. */
    <div className="relative grid transition-[grid-template-rows] duration-300 ease-ios"
      style={{ gridTemplateRows: ouvert ? '1fr' : '0fr' }}>
      {/* LE FILET VERTICAL EST RETIRÉ (3.1.28, Charles, 4 octobre 2026 :
       * « enlève la barre le long du sous-menu »), et avec lui le retrait de
       * six pixels qu'il imposait aux icônes. */}
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
                 paddingTop: '0.25rem' }}>
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
        <div className="flex-shrink-0">
          <button onClick={surAccueil} aria-label={`Revenir à ${titre}`}
            onMouseEnter={e => !epingle && surviser(e, `${titre} — écran de base`)}
            onMouseLeave={() => setSurvol(null)}
            disabled={!surAccueil}
            className={`relative flex text-sm transition-colors duration-150 ease-ios
              ${epingle
                ? 'w-full items-center gap-3 py-2 px-2.5 rounded-fenetre'
                : 'w-9 h-9 mx-auto items-center justify-center rounded-carte'}
              ${surAccueil ? 'hover:shadow-pose' : 'cursor-default'}`}
            style={{ color: 'var(--menu-texte)' }}
            data-case-rail={epingle ? undefined : '1'}>
            <HeaderIcon size={20} stroke={1.8} className="flex-shrink-0"
              style={{ color: 'var(--menu-accent)' }} />
            <span className={`text-left font-semibold min-w-0 flex-1 ${reveal}`}>
              {titre}
            </span>
          </button>
          <div className={`${epingle ? 'mx-2' : 'w-5 mx-auto'} my-1 border-t`}
            style={{ borderColor: 'var(--menu-filet)' }} />
        </div>
      )}

      {epingle && (<>
      <div className={`flex items-center gap-3 mb-1 flex-shrink-0
        text-[color:var(--menu-texte)] ${epingle ? 'px-4' : 'justify-center'}`}>
        {/* Le titre est porté par la porte de l'axe, juste au-dessus : ici il
            ne reste que le sous-titre et l'épingle. Un titre ne s'écrit
            qu'une fois. */}
        <span className={`text-base font-semibold flex-1 min-w-0 ${reveal}
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
        <div className={`px-4 text-xs ${reveal}`}
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
        <div className="flex-shrink-0 space-y-0.5">
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
                className={`relative flex text-sm mb-0.5
                  transition-colors duration-150 ease-ios
                  ${epingle
                    ? 'w-full items-center gap-3 py-2 px-2.5 rounded-fenetre'
                    : 'w-9 h-9 mx-auto items-center justify-center rounded-carte'}
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
          <div className={`${epingle ? 'mx-2' : 'w-5 mx-auto'} my-1 border-t`}
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
          <div key={si} className={sec.filet ? 'mb-3' : 'mb-3'}>
            {/* UN FILET ENTRE LES GROUPES, ET AUCUN À LA FIN.
                Les groupes du rail disent des moments du travail — ce qui fait
                entrer, le parcours, l'exception, ce qui efface. Un filet les
                sépare ; une barre posée après le dernier ne sépare de rien et
                ferme la liste sur du vide. */}
            {sec.filet && (
              <div className={`${epingle ? 'mx-2' : 'w-5 mx-auto'} mt-0.5 mb-1.5 border-t`}
                style={{ borderColor: 'var(--menu-filet)' }} />
            )}
            {sec.label && (
              <div className={`px-1.5 mt-2 mb-1 text-mention font-semibold uppercase
                tracking-wider ${reveal}`} style={{ color: 'var(--menu-texte-doux)' }}>
                {sec.label}
              </div>
            )}
            {sec.items.map(it => {
              const Ic = it.icon;
              return (
                /* LE FILET APPARTIENT AU TIROIR, PAS À LA RUBRIQUE AU-DESSUS.
                 *
                 * Première tentative : l'étirer de la rubrique jusqu'au bas du
                 * tiroir, pour en faire un bloc. Elle reposait sur une prémisse
                 * FAUSSE — le tiroir ne se rattache pas à l'icône qu'on a
                 * cliquée, mais à la DERNIÈRE rubrique de l'axe, parce que
                 * l'axe se lit d'abord en entier (tranché le 19 septembre).
                 * Le repère désignait donc une icône qui ne possède rien, et,
                 * allongé, il balayait tout le rail. Tant qu'il faisait seize
                 * pixels, l'erreur ne se voyait pas ; c'est elle que
                 * l'allongement a révélée.
                 *
                 * Les outils de l'écran forment bien un bloc — mais un bloc à
                 * eux, et c'est le tiroir qui le porte. L'icône qu'on a
                 * cliquée, elle, est la rubrique ACTIVE : elle a déjà sa
                 * pastille et son accent. */
                /* LA FAMILLE ENTRE DANS SON PLATEAU (3.1.30, Charles, 4 octobre
                   2026) : quand une entrée déplie ses rubriques, le plateau
                   commence à son icône et s'allonge vers le bas, comme un
                   tiroir qu'on tire. Dans le plateau, rien ne se pose
                   par-dessus — ni pastille blanche, ni ombre : seules les
                   icônes changent de couleur (marine pour la famille et au
                   survol, bleu pour la rubrique ouverte). */
                <div key={it.key} {...(it.poignee || {})}
                  className={`relative ${it.sous?.length > 0 ? `${epingle ? '' : 'w-9 mx-auto'} rounded-carte mb-0.5` : ''}`}
                  data-plateau={it.sous?.length > 0 ? '1' : undefined}
                  style={it.sous?.length > 0 ? { background: 'var(--menu-plateau)' } : undefined}>
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
                  className={`relative flex text-sm mb-0.5
                    transition-colors duration-150 ease-ios
                    ${epingle
                      ? 'w-full items-start gap-3 py-2 px-2.5 rounded-fenetre'
                      : 'w-9 h-9 mx-auto items-center justify-center rounded-carte'}
                    ${it.sous?.length > 0 ? 'hover:[--ic:var(--menu-texte)] hover:text-[color:var(--menu-texte)]' : it.actif ? 'font-semibold ring-1 ring-inset' : 'hover:shadow-pose'}`}
                  style={it.sous?.length > 0
                    ? { color: 'var(--menu-texte-doux)' }
                    : it.actif
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
                    /* L'ACCENT VA À LA RUBRIQUE ACTIVE, ET À ELLE SEULE.
                       Le donner aussi à celle qui « porte » le tiroir peignait
                       une icône au hasard — la dernière de l'axe. */
                    <Ic size={19} stroke={1.8} className="flex-shrink-0"
                      style={it.sous?.length > 0 ? { color: 'var(--ic, var(--menu-icone))' }
                        : it.actif ? { color: 'var(--menu-accent)' }
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
                    {/* LE PLATEAU (3.1.29, Charles, 4 octobre 2026 : « plateau,
                        mais même largeur que les icônes ») : les rubriques
                        dépliées posent sur un fond arrondi, exactement de la
                        largeur d'une case — ni filet, ni retrait. */}
                    <div className="pb-0.5">
                      {it.sous.map(sv => {
                        const Sc = sv.icon;
                        return (
                          <button key={sv.key} onClick={sv.onClick} aria-label={sv.label}
                            onMouseEnter={e => !epingle && surviser(e, sv.label)}
                            onMouseLeave={() => setSurvol(null)}
                            className={`relative flex text-sm mb-0.5
                              transition-colors duration-150 ease-ios
                              ${epingle
                                ? 'w-full items-center gap-3 py-2 px-2.5 rounded-fenetre'
                                : 'w-9 h-9 mx-auto items-center justify-center rounded-carte'}
                              ${sv.actif ? 'font-semibold' : 'hover:[--ic:var(--menu-texte)] hover:text-[color:var(--menu-texte)]'}`}
                            style={sv.actif
                              ? { color: 'var(--menu-texte)', '--ic': 'var(--menu-accent)' }
                              : { color: 'var(--menu-texte-doux)' }}
                            data-case-rail={epingle ? undefined : '1'}>
                            {/* LA RUBRIQUE OUVERTE : son icône en bleu, et un
                                petit trait bleu au bord du plateau, en face d'elle
                                (proposition 2, Charles, 4 octobre 2026). */}
                            {sv.actif && (
                              <span aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-3.5 rounded-full"
                                style={{ background: 'var(--menu-accent)' }} />
                            )}
                            {Sc ? (
                              /* GRISES, COMME CELLES DU DESSUS.
                                 Les peindre toutes en bleu faisait du sous-menu
                                 un autre menu : cinq icônes colorées côte à
                                 côte ne signalent plus rien, elles décorent. La
                                 couleur reste ce qu'elle est partout dans
                                 Lucie — une dépense, réservée à ce qui doit
                                 être vu. Le bleu du sous-menu ne vit plus que
                                 dans ses deux filets. */
                              <Sc size={18} stroke={1.8} className="flex-shrink-0 transition-colors duration-150"
                                style={{ color: `var(--ic, ${sv.couleur || 'var(--menu-icone)'})` }} />
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
                    </div>
                  </TiroirRail>
                )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      </div>

      {/* LE VOLET — ce que cet écran-ci ne peut pas dire en icônes. */}
      {volet && (
        <div className="flex-1 min-w-0 flex flex-col pb-3 px-3 min-h-0"
          style={{ paddingTop: '0.5rem' }}>
          {volet.titre && (
            <div className="intertitre px-1 pb-2 flex-shrink-0"
              style={{ color: 'var(--menu-texte-doux)' }}>{volet.titre}</div>
          )}
          <div ref={surNoeudVolet}
            className="min-h-0 overflow-y-auto rail-defile text-sm"
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
        /* LA MÊME BULLE QUE LA BARRE DU HAUT (Charles, 3 octobre 2026 : « une
           uniformité entre rail et menu du haut ») : marine, texte blanc. */
        <span style={{ top: survol.y, background: 'var(--c-principal, #16406A)',
                       left: volet ? 'calc(3.5rem + 10px)' : 'calc(100% + 10px)' }}
          className="pointer-events-none absolute -translate-y-1/2 z-50
                     px-2 py-0.5 rounded-champ shadow-flottant text-white font-medium
                     text-xs whitespace-nowrap">
          {survol.label}
        </span>
      )}
    </aside>
  );

  return (
    <>
      {/* LE RAIL SORT DE L'ÉCRAN, PAR UN PORTAIL (Charles, 2 octobre 2026 :
          « le rail devrait rester statique quand je défile »). Un élément
          « fixed » n'est fixe que si aucun ancêtre ne transforme, ne filtre ni
          n'anime : il suffisait qu'un écran pose une transition sur son cadre
          pour que le rail défile avec la page. Rendu sur le corps du
          document, il est fixe partout, quoi que fassent les écrans. */}
      {typeof document !== 'undefined' ? createPortal(rail, document.body) : rail}
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
    <div style={{ background: 'var(--c-fond_ligne, #fff)', borderColor: 'var(--c-filet, rgb(var(--gris-200)))' }} className={`border rounded-xl overflow-x-auto ${className}`}>
      <table className={`tableau-maison w-full ${dense ? 'text-second' : 'text-sm'}`}>{children}</table>
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
    <th className={`cellule px-3 font-medium ${a} ${largeur || ''} ${className}`} {...props}>
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
  const t = ton === 'secondaire' ? 'text-second text-slate-500'
    : ton === 'fort' ? 'text-sm font-semibold text-iip-blue'
    : 'text-sm text-slate-800';
  return <td className={`cellule px-3 ${a} ${t} ${className}`} {...props}>{children}</td>;
}

/** Ligne ordinaire, avec son survol et son filet. */
export function Tr({ children, actif = false, className = '', ...props }) {
  return (
    <tr className={`ligne-maison ${actif ? 'ligne-active' : ''}
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
    <tr className={`ligne-total font-semibold ${className}`} {...props}>
      {children}
    </tr>
  );
}

/** Message d'absence de données, occupant toute la largeur. */
export function TableauVide({ colonnes, children }) {
  return (
    <tr>
      <td colSpan={colonnes} className="px-4 py-8 text-center text-sm text-slate-400">
        {children}
      </td>
    </tr>
  );
}

/** Badge de tableau — LE STANDARD (3.1.249) : la pastille d'état, pleine. Le ton devient l'état. */
const ETAT_BADGE = { neutre: 'neutre', info: 'disponible', succes: 'reussi', alerte: 'surveiller', danger: 'corriger', accent: 'faveur' };
export function Badge({ children, ton = 'neutre', className = '', ...props }) {
  return (
    <span className={`pastille-etat ${className}`} data-etat={ETAT_BADGE[ton] || 'neutre'} {...props}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LE BLOC D'ÉTAT — tuile, encadré, pastille : un seul dessin (index.css,
// `.bloc-etat`), sept états (lib/etats.js). Étude du 25 septembre 2026.
// ─────────────────────────────────────────────────────────────────────────────

/** Le cadeau de la faveur : violet, partout où une unité a été octroyée. */
export function IconeFaveur({ size = 13, className = '' }) {
  return <IconGift size={size} stroke={2} className={`inline shrink-0 ${className}`}
    style={{ color: 'var(--c-faveur)' }} aria-label="faveur" />;
}

/**
 * LA TUILE. Chiffre (ou intitulé) d'abord, libellé dessous, précision en gris.
 * `etat` : reussi | faveur | disponible | indisponible | surveiller | corriger
 * | neutre | fort. Cliquable si `onClick` : elle devient alors un bouton.
 */
export function TuileEtat({ etat = 'neutre', valeur, unite, libelle, precision, icone: Icone,
                            onClick, actif = false, sousReserve = false, className = '', title, taille = 'grande' }) {
  // DEUX TAILLES, UN DESSIN (3.1.252, Charles : « deux types de tuiles — grande et
  // compacte »). La grande pour un tableau de bord : chiffre, libellé dessous,
  // précision. La compacte pour une liste ou une frise : chiffre et libellé sur une
  // ligne, la précision au survol. Mesures réglables (Formes et composants).
  const Balise = onClick ? 'button' : 'div';
  const compacte = taille === 'compacte';
  return (
    <Balise type={onClick ? 'button' : undefined} onClick={onClick} title={title || (compacte && precision) || undefined}
      data-etat={etat}
      className={`bloc-etat ${compacte ? 'tuile-compacte' : 'tuile-grande'} ${sousReserve ? 'sous-reserve' : ''} relative text-left min-w-0
        ${onClick ? 'cursor-pointer hover:brightness-[.98] transition' : ''}
        ${actif ? 'ring-2 ring-offset-1 ring-iip-blue/30' : ''} ${className}`}>
      {Icone && !compacte && <Icone size={15} stroke={1.8} className="absolute right-2.5 top-2.5" style={{ color: 'var(--e)' }} />}
      <div className="tuile-chiffre font-bold tabular-nums leading-tight">
        {valeur}
        {unite && <span className="text-xs font-normal text-slate-500 ml-1">{unite}</span>}
        {etat === 'faveur' && <IconeFaveur className="ml-1.5 align-[-1px]" />}
      </div>
      {libelle && <div className="tuile-libelle text-slate-600">{libelle}</div>}
      {precision && !compacte && <div className="text-mention text-slate-400">{precision}</div>}
    </Balise>
  );
}

/** L'ENCADRÉ : une phrase qui porte un état — avertissement, erreur, confirmation. */
export function Encadre({ etat = 'surveiller', titre, children, icone: Icone, className = '' }) {
  return (
    <div data-etat={etat} className={`bloc-etat px-3 py-2 text-second ${className}`}>
      {(titre || Icone) && (
        <div className="flex items-center gap-1.5 font-semibold text-sm">
          {Icone && <Icone size={15} stroke={1.8} style={{ color: 'var(--e)' }} />}
          {titre}
        </div>
      )}
      {children && <div className={titre ? 'mt-0.5 text-slate-700' : 'text-slate-700'}>{children}</div>}
    </div>
  );
}

/** LA PASTILLE : le même état, en ligne, dans une cellule ou après un nom. */
export function PastilleEtat({ etat = 'neutre', children, className = '', title }) {
  return (
    <span data-etat={etat} title={title} className={`pastille-etat ${className}`}>
      {etat === 'faveur' && <IconGift size={11} stroke={2} />}
      {children}
    </span>
  );
}

/** Valeur numérique secondaire, en gris — un rapport, un rappel, une unité. */
export function Mention({ children, ton = 'neutre', className = '' }) {
  const t = ton === 'danger' ? 'text-red-600 font-semibold'
    : ton === 'alerte' ? 'text-amber-700' : 'text-slate-400';
  return <span className={`ml-1 text-mention ${t} ${className}`}>{children}</span>;
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
/**
 * LA BULLE D'AIDE — DIRE CE QUE C'EST, LÀ OÙ ON LE DEMANDE.
 *
 * Un champ réglementaire porte un nom que seul celui qui l'a écrit comprend :
 * « base légale de la décision », « finalité », « porte d'entrée ». On le
 * remplit donc au jugé, et c'est ainsi qu'une valeur fausse part sur une pièce
 * signée. Un texte d'aide posé en permanence sous chaque champ, lui, encombre
 * l'écran au point qu'on ne lit plus rien.
 *
 * D'où la bulle : un point d'interrogation discret, la phrase au clic. Elle
 * s'ancre SUR le champ plutôt que dans une fenêtre — un voile ferait perdre de
 * vue ce qu'on était en train de remplir, et c'est la même raison qui a fait
 * choisir une bulle pour les notes d'attribution.
 *
 * Elle ne dit pas comment cliquer : elle dit ce que la chose EST, et ce qu'elle
 * engage. Expliquer le travail, pas l'informatique.
 */
export function BulleAide({ titre, children }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOuvert(o => !o)}
        aria-label={titre ? `Aide : ${titre}` : 'Aide'}
        aria-expanded={ouvert}
        className="w-5 h-5 rounded-full border border-slate-300 text-slate-500
                   text-xs font-semibold leading-none flex items-center
                   justify-center hover:bg-slate-50 transition-colors">
        ?
      </button>
      {ouvert && (
        <>
          {/* FERMER EN CLIQUANT À CÔTÉ : une bulle qui ne se ferme que par son
              propre bouton reste ouverte sur l'écran de celui qui a cliqué
              ailleurs. */}
          <span className="fixed inset-0 z-40" onClick={() => setOuvert(false)}
            aria-hidden="true" />
          <span className="absolute z-50 left-0 top-7 w-[26rem] max-w-[80vw]
                           carte p-3 shadow-flottant bg-white text-left"
            role="dialog">
            {titre && (
              <span className="block text-sm font-semibold text-iip-blue mb-1">
                {titre}
              </span>
            )}
            <span className="block text-second text-slate-600 whitespace-pre-line">
              {children}
            </span>
          </span>
        </>
      )}
    </span>
  );
}

/** Les fenêtres ouvertes, de la plus ancienne à celle du dessus. */
const PILE_FENETRES = [];

/* LE BANDEAU PORTE LES FLÈCHES ET L'AVION — UNE FOIS, POUR TOUTES LES FENÊTRES
   (Charles, 8 octobre 2026 : « généraliser dans le bandeau les flèches avant /
   après et le bouton Éditions »). Trois écrans avaient leurs flèches, chacun à
   sa façon ; une fenêtre les reçoit désormais par deux options :
     navigation = { position, total, onAller(i), sale }  — ouverte DEPUIS UNE
       LISTE : ◀ 3 / 17 ▶, et les touches ← → (hors d'un champ de saisie).
       `sale` : des modifications non enregistrées — la flèche demande avant
       de les abandonner. Sans liste, pas de flèches : une flèche grise
       promettrait un « suivant » qui n'existe pas.
     editions = () => … | { …contexte d'Éditions }  — l'avion : les pièces de
       l'objet affiché ; un objet ouvre le centre d'Éditions sur ce contexte. */
export function Fenetre({ icone: Ic, titre, sous, large = 'moyenne',
                         hauteurFixe = false, outils = null, navigation = null, editions = null,
                          pied = null, ton = 'neutre', onFermer, children, pleinCorps = false }) {
  const largeurs = {
    petite: 'w-[440px]', moyenne: 'w-[720px]',
    grande: 'w-[1000px]', pleine: 'w-[1180px]',
    // TOUTE LA LARGEUR (Charles, 26 septembre 2026 : « il faut utiliser toute
    // la largeur, ça permet de ne pas scroller ») — la fiche étudiant, dont le
    // parcours met le schéma et les notes côte à côte.
    ecran: 'w-[min(1800px,97vw)]',
  };
  // LA TOUCHE ÉCHAP FERME. Elle le faisait dans certaines fenêtres et pas dans
  // d'autres, ce qui est pire que nulle part : on apprend un geste qui tombe
  // parfois dans le vide.
  // ET SEULE LA FENÊTRE DU DESSUS répond : une fenêtre ouverte depuis une
  // autre (l'aperçu du classeur sur l'encodage) fermait les deux d'un coup.
  // La place dans la pile se prend À L'OUVERTURE, une fois : un nouveau rendu
  // de la fenêtre du dessous ne doit pas la remettre au-dessus.
  const moi = useRef(null);
  if (!moi.current) moi.current = Symbol('fenetre');
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  const [editionsOuvert, setEditionsOuvert] = useState(false);
  const nav = useRef(navigation);
  nav.current = navigation;
  const aller = async delta => {
    const n = nav.current;
    if (!n) return;
    const i = n.position + delta;
    if (i < 0 || i >= n.total) return;
    if (n.sale && !(await demander({ message: 'Des modifications ne sont pas enregistrées.\n\nPasser à la fiche '
      + (delta > 0 ? 'suivante' : 'précédente') + ' en les abandonnant ?', confirmer: 'Abandonner et passer' }))) return;
    n.onAller(i);
  };
  useEffect(() => {
    const jeton = moi.current;
    PILE_FENETRES.push(jeton);
    const f = e => {
      if (PILE_FENETRES[PILE_FENETRES.length - 1] !== jeton) return;
      if (e.key === 'Escape') { fermer.current?.(); return; }
      // ← → : seulement hors d'un champ, où elles déplacent le curseur.
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && nav.current && !e.altKey && !e.metaKey && !e.ctrlKey) {
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        e.preventDefault();
        aller(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', f);
    return () => {
      window.removeEventListener('keydown', f);
      const i = PILE_FENETRES.lastIndexOf(jeton);
      if (i >= 0) PILE_FENETRES.splice(i, 1);
    };
  }, []);

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
        className="absolute inset-0 voile-fenetre" />
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
      <div style={{ background: 'var(--c-fenetre_corps, #fff)' }} className={`relative rounded-fenetre shadow-dessus overflow-hidden
                       flex flex-col max-w-full
                       ${hauteurFixe ? 'h-[88vh]' : 'max-h-[88vh]'}
                       ${largeurs[large] || largeurs.moyenne}`}>
        <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
          style={{ background: ton === 'alerte' ? 'var(--c-refuse)' : 'var(--c-fenetre_bandeau, var(--c-principal))', color: 'var(--c-fenetre_titre, #fff)' }}>
          {Ic && <Ic size={18} className="flex-shrink-0"
            style={{ color: ton === 'alerte' ? 'var(--c-texte)' : 'var(--c-accent)' }} />}
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold truncate">{titre}</div>
            {sous && <div className="text-second text-white/70 truncate">{sous}</div>}
          </div>
          {navigation && navigation.total > 1 && (
            <div className="flex items-center gap-0.5 flex-none text-second text-white/80">
              <button type="button" onClick={() => aller(-1)} disabled={navigation.position <= 0}
                aria-label="Précédent" title="Précédent (←)"
                className="w-8 h-8 grid place-items-center rounded-champ hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent">
                <IconChevronLeft size={17} />
              </button>
              <span className="tabular-nums min-w-[3.5rem] text-center">{navigation.position + 1} / {navigation.total}</span>
              <button type="button" onClick={() => aller(1)} disabled={navigation.position >= navigation.total - 1}
                aria-label="Suivant" title="Suivant (→)"
                className="w-8 h-8 grid place-items-center rounded-champ hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent">
                <IconChevronRight size={17} />
              </button>
            </div>)}
          {editions && (
            <button type="button" aria-label="Éditions" title="Éditions — imprimer ou envoyer les pièces"
              onClick={() => (typeof editions === 'function' ? editions() : setEditionsOuvert(true))}
              className="flex-none w-8 h-8 grid place-items-center rounded-champ hover:bg-white/15 transition-colors duration-150 ease-ios">
              <IconSend size={16} />
            </button>)}
          {editionsOuvert && editions && typeof editions === 'object' && createPortal(
            <Suspense fallback={null}>
              <CentreImpressionCentral {...editions} onClose={() => setEditionsOuvert(false)} />
            </Suspense>, document.body)}
          {/* Les outils de la fenêtre, à côté de la croix. */}
          {outils}
          <button onClick={onFermer} aria-label="Fermer"
            className="flex-none w-8 h-8 grid place-items-center rounded-champ
                       hover:bg-white/15 transition-colors duration-150 ease-ios">
            <IconX size={16} />
          </button>
        </div>

        {/* LE CORPS PLEIN (3.1.255) : un document (aperçu de pièce) occupe toute la fenêtre, sans marge. */}
        {pleinCorps ? <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          : <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>}

        {pied && (
          /* LE PIED NE SE CHEVAUCHE PAS.
           * Le bouton et la phrase qui dit pourquoi il est gris vivent côte à
           * côte ; la phrase est longue, et rien ne lui disait de se réduire —
           * un enfant de boîte flex ne descend pas sous la largeur de son
           * contenu sans `min-w-0`. Sur une fenêtre étroite, le texte passait
           * donc SOUS le bouton. Les boutons ne se compriment jamais
           * (`.bouton` est en `nowrap`), c'est au texte de céder.
           * UNE CALE VIDE NE RÉSERVE RIEN (29 septembre 2026) : le
           * `<span className="flex-1" />` qui pousse « Fermer · Enregistrer » à
           * droite recevait aussi les 12 rem de la phrase, et dans une petite
           * fenêtre il envoyait les boutons à la ligne. */
          <div style={{ background: 'var(--c-fenetre_pied, var(--c-fenetre_corps, #fff))', borderColor: 'var(--c-filet, rgb(var(--gris-200)))' }}
            className="flex-shrink-0 px-5 py-3 border-t
                          flex items-center gap-x-3 gap-y-2 flex-wrap
                          [&>button]:flex-none [&>span]:min-w-0
                          [&>span]:flex-1 [&>span]:basis-48
                          [&>span:empty]:basis-0">{pied}</div>
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
        <div className="intertitre mb-2"
          style={{ color: ton === 'alerte' ? 'var(--c-refuse)' : 'var(--c-disponible)' }}>{titre}</div>
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
  const teinte = ton === 'alerte' ? 'var(--c-refuse)' : ton === 'neuf' ? 'var(--c-accent)' : null;
  const Balise = onClick ? 'button' : 'div';
  return (
    <Balise onClick={desactive ? undefined : onClick} disabled={desactive || undefined}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-carte
        border transition-colors duration-150 ease-ios
        ${desactive ? 'opacity-45' : onClick ? 'hover:border-slate-400' : ''}
        ${actif ? 'bg-slate-50' : 'bg-white'}`}
      style={{ borderColor: actif || teinte ? `rgb(var(--gris-200))` : 'rgb(var(--gris-200))' }}>
      {Ic && <Ic size={17} className="flex-shrink-0"
        style={{ color: teinte || 'var(--c-texte)' }} />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-700">{titre}</span>
        {sous && <span className="block text-second text-slate-400">{sous}</span>}
      </span>
      {meta != null && (
        <span className="flex-none text-second text-slate-400 whitespace-nowrap">{meta}</span>
      )}
    </Balise>
  );
}

/** Les boutons du pied : un seul principal, le reste en retrait. */
export function BoutonFenetre({ principal = false, ton = 'neutre', desactive = false,
                                onClick, children }) {
  // LE STANDARD (3.1.249) : `.bouton`, fort pour l'action principale, brique pour l'alerte.
  const cls = principal ? (ton === 'alerte' ? 'bouton bouton-detruire' : 'bouton bouton-fort') : 'bouton';
  return <button onClick={onClick} disabled={desactive} className={cls}>{children}</button>;
}


/* ══ L'AVION — LA SEULE PORTE POUR IMPRIMER OU ENVOYER ═════════════════════
 *
 * Charles, 2 octobre 2026 : « le simple petit avion, dans un carré, en bleu
 * comme partout, et il renvoie vers le centre d'édition TOUJOURS ». Chaque
 * écran avait son bouton — « Imprimer ou envoyer », « Documents », une
 * imprimante — et la moitié ouvrait autre chose que le centre. Un seul dessin,
 * une seule destination : le centre, ouvert sur ce que l'écran regarde.
 *
 * BoutonEditions : le carré seul (onClick fourni).
 * OuvrirEditions : le carré ET le centre, ouvert avec le contexte donné.
 */
export function BoutonEditions({ onClick, titre = 'Imprimer ou envoyer — centre d’édition', taille = 'normal', disabled = false, sombre = false }) {
  const cote = taille === 'petit' ? 'w-7 h-7' : taille === 'moyen' ? 'w-8 h-8' : 'w-9 h-9';
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={titre} aria-label={titre}
      className={`${cote} flex-none grid place-items-center rounded-champ border transition-colors duration-150 ease-ios disabled:opacity-40
        ${sombre ? 'border-white/40 text-white hover:bg-white/10' : 'bg-white hover:bg-[color:var(--c-principal)]/[0.06]'}`}
      style={sombre ? undefined : { borderColor: 'var(--c-principal, #16406A)', color: 'var(--c-principal, #16406A)' }}>
      <IconSend size={taille === 'petit' ? 14 : taille === 'moyen' ? 15 : 17} />
    </button>
  );
}

export function OuvrirEditions({ titre, taille, disabled, sombre, ...contexte }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <BoutonEditions titre={titre} taille={taille} disabled={disabled} sombre={sombre}
        onClick={ev => { ev?.stopPropagation?.(); setOuvert(true); }} />
      {ouvert && createPortal(
        <Suspense fallback={null}>
          <CentreImpressionCentral {...contexte} onClose={() => setOuvert(false)} />
        </Suspense>, document.body)}
    </>
  );
}

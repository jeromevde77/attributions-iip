import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconPin, IconPinnedOff, IconSun, IconMoon } from '@tabler/icons-react';
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
export function FournisseurRail({ valeur, panneau, children }) {
  return (
    <ContexteRail.Provider value={valeur}>
      <ContextePanneau.Provider value={panneau}>{children}</ContextePanneau.Provider>
    </ContexteRail.Provider>
  );
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
      <div className="flex items-baseline gap-2.5 min-w-0">
        {Icon && (
          <Icon size={19} stroke={1.8}
            className="text-iip-turquoise flex-shrink-0 self-center" />
        )}
        <h1 className="text-[17px] font-title text-iip-blue leading-tight
                       flex-shrink-0">{titre}</h1>
        {sous && (
          <p className="text-[12.5px] text-slate-400 truncate hidden md:block">
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
            className={`flex items-center gap-2 px-3.5 py-2.5 text-[13.5px] whitespace-nowrap border-b-2 -mb-px transition-colors duration-150
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
                              sections = [], actions = [] }) {
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
    extra={extra} sections={sections} actions={actions} />;
}

/** Le rail tel qu'il se dessine — appelé par l'axe, ou par un écran isolé. */
export function RailDessine({ icon: HeaderIcon, titre, sousTitre, extra,
                              sections = [], actions = [], volet = null,
                              surNoeudVolet = null }) {
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
    return () => r.style.removeProperty('--rail');
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

  return (
    /* UN PANNEAU POSÉ SUR LA PAGE, ET NON UNE COLONNE COLLÉE AU BORD.
     *
     * Le rail occupait toute la hauteur de l'écran, d'un bord à l'autre : une
     * bande pleine, du même bleu, qui faisait de la page deux territoires — « on
     * dirait deux espaces différents ». Il devient un objet : détaché des bords,
     * coins largement arrondis, HAUT DE CE QU'IL CONTIENT et centré
     * verticalement, translucide sur ce qu'il recouvre, porté par une ombre
     * douce. Six rubriques ne réclament pas quatre-vingts centimètres de bleu.
     *
     * SES COULEURS VIENNENT DES JETONS, jamais d'un bleu écrit en dur : c'est
     * ce qui lui permet d'être gris pâle ou marine sans qu'il ait à le savoir. */
    <aside
      /* POSÉ SUR LA FENÊTRE, NON SUR LA PAGE. En « absolute », le rail se
         centrait sur la HAUTEUR DU CONTENU : sur un écran long, il descendait
         sous le bas de la fenêtre et son pied devenait inatteignable. En
         « fixed », il reste où l'œil le cherche, et il suit quand on défile.
         Le décalage de deux rem le centre SOUS la barre du haut, non sur la
         fenêtre entière : sans lui, il montait par-dessus le logo. */
      className={`group/rail fixed left-3 top-[calc(50%+2rem)] -translate-y-1/2 z-10
        max-h-[calc(100vh-9rem)] flex py-0
        rounded-panneau border backdrop-blur-xl backdrop-saturate-150
        transition-[width] duration-300 ease-ios
        ${volet ? 'w-[21.5rem]' : epingle ? 'w-[14.5rem]' : 'w-14'}`}
      style={{ background: 'var(--menu-fond)', borderColor: 'var(--menu-bord)',
               boxShadow: 'var(--menu-ombre)' }}>
      {/* LA COLONNE DES ICÔNES — ce que tous les écrans ont en commun. */}
      <div className={`flex flex-col py-3 min-h-0 flex-shrink-0
        ${volet ? 'w-14 border-r' : 'flex-1'}`}
        style={{ borderColor: 'var(--menu-filet)' }}>
      {/* En-tête — replié, tout se centre : un libellé seulement masqué
          laisserait l'icône décalée par rapport à la colonne du dessous. */}
      <div className={`flex items-center gap-3 mb-1 flex-shrink-0
        text-[color:var(--menu-texte)] ${epingle ? 'px-4' : 'justify-center'}`}>
        {HeaderIcon && (
          <HeaderIcon size={22} className="flex-shrink-0"
            style={{ color: 'var(--menu-accent)' }} />
        )}
        <span className={`text-[15px] font-semibold flex-1 min-w-0 ${reveal}`}>{titre}</span>
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

      {/* Sections */}
      <div className="min-h-0 overflow-y-auto overflow-x-hidden rail-defile px-2 mt-1.5">
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
                <button key={it.key} onClick={it.onClick} aria-label={it.label}
                  onMouseEnter={e => !epingle && surviser(e, it.label)}
                  onMouseLeave={() => setSurvol(null)}
                  className={`relative w-full flex items-start gap-3 py-2
                    rounded-fenetre text-[13px] mb-0.5 transition-colors duration-150 ease-ios
                    ${epingle ? 'px-2.5' : 'justify-center px-0'}
                    ${it.actif ? 'font-semibold ring-1 ring-inset'
                      : 'hover:bg-[color:var(--menu-survol)]'}`}
                  style={it.actif
                    ? { background: 'var(--menu-actif)', color: 'var(--menu-texte)',
                        '--tw-ring-color': 'var(--menu-actif-bord)' }
                    : { color: 'var(--menu-texte-doux)' }}>
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
                    <Ic size={18} stroke={1.8} className="flex-shrink-0 mt-px"
                      style={it.actif ? { color: 'var(--menu-accent)' }
                        : { color: it.couleur || 'var(--menu-icone)' }} />
                  ) : (
                    /* FILET DE SÉCURITÉ : une entrée sans icône donnerait, rail
                       replié, une ligne vide — invisible et impossible à viser,
                       alors que le clic, lui, fonctionne toujours. À défaut
                       d'icône, un point tient la place et se voit. */
                    <span className="flex-shrink-0 w-[18px] flex justify-center mt-1.5"
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
              );
            })}
          </div>
        ))}
      </div>

      {/* LES ACTIONS, SOUS UN FILET.
          Au-dessus, ce qui change d'un écran à l'autre ; en dessous, ce qui ne
          change jamais — même place, même ordre, quel que soit l'écran, si bien
          qu'on finit par y aller sans regarder. L'impression d'abord : on
          imprime tous les jours, on importe quelques fois par an. */}
      {!!actions.length && (
        <div className="flex-shrink-0 px-2 pt-2 mt-1 border-t space-y-1"
          style={{ borderColor: 'var(--menu-filet)' }}>
          {actions.map(a2 => {
            const Ic = a2.icon;
            return (
              <button key={a2.key} onClick={a2.onClick} aria-label={a2.label}
                onMouseEnter={e => !epingle && surviser(e, a2.label)}
                onMouseLeave={() => setSurvol(null)}
                className={`relative w-full flex items-center gap-3 py-2 rounded-fenetre
                  text-[13px] transition-colors duration-150 ease-ios
                  ${epingle ? 'px-2.5' : 'justify-center px-0'}
                  ${a2.primaire ? 'font-semibold ring-1 ring-inset'
                    : 'hover:bg-[color:var(--menu-survol)]'}`}
                style={a2.primaire
                  ? { background: 'var(--menu-actif)', color: 'var(--menu-texte)',
                      '--tw-ring-color': 'var(--menu-actif-bord)' }
                  : { color: 'var(--menu-texte-doux)' }}>
                {Ic && (
                  <Ic size={19} stroke={1.8} className="flex-shrink-0"
                    style={{ color: a2.primaire ? 'var(--menu-accent)' : 'var(--menu-icone)' }} />
                )}
                <span className={`text-left leading-tight min-w-0 flex-1 ${reveal}`}>
                  {a2.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* LE MODE SE CHANGE LÀ OÙ IL SE VOIT — c'est un réglage de confort, on
          l'essaie, on juge, on garde ; il se retient d'un jour à l'autre. */}
      <div className="flex-shrink-0 flex justify-center pt-2 mt-1 mx-2 border-t"
        style={{ borderColor: 'var(--menu-filet)' }}>
        <button onClick={basculerMode} aria-label="Changer le mode d'affichage"
          onMouseEnter={e => !epingle && surviser(e,
            mode === 'sombre' ? 'Menus en gris pâle' : 'Menus en marine')}
          onMouseLeave={() => setSurvol(null)}
          className="w-9 h-9 grid place-items-center rounded-fenetre
            hover:bg-[color:var(--menu-survol)] transition-colors duration-150 ease-ios"
          style={{ color: 'var(--menu-texte-doux)' }}>
          {mode === 'sombre' ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
      </div>

      </div>

      {/* LE VOLET — ce que cet écran-ci ne peut pas dire en icônes. */}
      {volet && (
        <div className="flex-1 min-w-0 flex flex-col py-3 px-3 min-h-0">
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
        <span style={{ top: survol.y, background: 'var(--menu-fond)',
                       borderColor: 'var(--menu-bord)', color: 'var(--menu-texte)',
                       boxShadow: 'var(--menu-ombre)' }}
          className="pointer-events-none absolute left-[calc(100%+10px)] -translate-y-1/2 z-50
                     px-2.5 py-1.5 rounded-champ border backdrop-blur-xl backdrop-saturate-150
                     text-[11.5px] whitespace-nowrap">
          {survol.label}
        </span>
      )}
    </aside>
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
      <tr className={`bg-slate-50 border-b border-slate-200 text-[10px] uppercase
                      tracking-wide text-slate-500 ${className}`}>
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
  const t = ton === 'secondaire' ? 'text-[11.5px] text-slate-500'
    : ton === 'fort' ? 'text-[12.5px] font-semibold text-iip-blue'
    : 'text-[12.5px] text-slate-800';
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
    <tr className={`bg-iip-blue/5 border-y border-iip-blue/20 ${className}`} {...props}>
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
      <td colSpan={colonnes} className="px-4 py-8 text-center text-[12.5px] text-slate-400">
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

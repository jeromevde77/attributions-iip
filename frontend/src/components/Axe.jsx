import { useCallback, useMemo, useState } from 'react';
import { IconDatabaseImport } from '@tabler/icons-react';
import { RailDessine, FournisseurRail } from './ui.jsx';
import { droitEffectif, usePlafonds } from '../lib/modules.js';
import { getUser } from '../lib/api.js';

/**
 * Enveloppe d'un axe de la structure en 7 : des rubriques, et dans chacune un
 * écran EXISTANT repris tel quel. La migration regroupe, elle ne réécrit rien.
 *
 * TOUTE LA NAVIGATION DESCEND DANS LE RAIL — sauf le menu principal.
 *
 * Il y avait trois niveaux empilés : le menu des sept métiers en haut, la
 * rangée d'onglets de l'axe juste dessous, et le rail de l'écran à gauche.
 * Trois navigations pour dire où l'on est, deux d'entre elles à l'horizontale,
 * et cent cinquante pixels consommés avant la première donnée.
 *
 * Le menu principal reste horizontal : c'est lui qui dit dans quel MÉTIER on
 * travaille, et il ne change pas d'un écran à l'autre. Tout le reste passe à
 * la verticale, où une liste de rubriques se lit naturellement et où la place
 * ne manque pas. Le rail porte donc, dans cet ordre : les rubriques de l'axe,
 * puis les outils de l'écran ouvert — qui s'y inscrivent d'eux-mêmes, sans que
 * leur code change.
 *
 * Une rubrique peut être marquée `futur` : elle annonce sa place réservée sans
 * prétendre exister.
 */
export default function Axe({ titre, question, icone, onglets, ongletInitial,
                              /* Des GROUPES de clés, mêlant rubriques de l'axe
                                 et outils de l'écran, dans l'ordre du travail.
                                 Voir plus bas : sans lui, on retombe sur les
                                 rubriques puis le tiroir. */
                              ordreRail = null,
                              /* DES SOUS-MENUS QUI GLISSENT (Charles, 2 octobre
                                 2026 : « l'escalier devient Parcours, on y place
                                 report de notes, valorisation des acquis et revue
                                 des PAE »). [{ key, label, icone, hote,
                                 enfants: [{ key, label, icone }] }] — un enfant
                                 qui est un outil d'un autre écran ouvre l'écran
                                 hôte, qui lance l'outil (sessionStorage
                                 « lucie.outil »). */
                              sousMenus = [],
                              impression = 'etudiants', echanges = false }) {
  // LES RUBRIQUES « À VENIR » NE SONT PLUS DANS LE MENU.
  // Une place réservée annonçant un écran qui n'existe pas est une promesse
  // faite à qui n'a rien demandé : on vise une entrée, on tombe sur « à venir »,
  // et l'icône qui la portait parasitait le rail replié de ceux qui
  // travaillent. Les idées ont désormais leur porte — « Proposer une
  // amélioration », présente sur tous les écrans, au même endroit.
  /* LE RAIL SUIT LES DROITS, COMME LE MENU PRINCIPAL (Charles, 3 octobre 2026).
     Une rubrique déclare son `module` : si le rôle n'a « rien » sur ce module,
     elle n'apparaît pas — un professeur ne voyait pas Gestion dans la barre,
     mais retrouvait dans le rail des écrans qui ne lui répondaient que par un
     refus. `roles`, quand il est posé, limite la rubrique à ces rôles. */
  usePlafonds();
  const moi = getUser();
  const visibles = onglets.filter(o => !o.masque && !o.futur
    && (!o.module || droitEffectif(moi, o.module) !== 'rien')
    && (!o.roles || o.roles.includes(moi?.role)));
  const [actif, setActif] = useState(
    ongletInitial && visibles.some(o => o.key === ongletInitial)
      ? ongletInitial
      : visibles[0]?.key
  );
  const courant = visibles.find(o => o.key === actif) || visibles[0];

  // Ce que l'écran ouvert apporte au rail. Il s'y inscrit en se montant et s'en
  // retire en se démontant : le rail ne garde jamais les outils d'un écran
  // qu'on vient de quitter.
  const [outils, setOutils] = useState(null);
  const inscrire = useCallback(secs => setOutils(secs), []);
  // ET SON VOLET, s'il en a un : ce qui ne tient pas en icônes — des listes
  // déroulantes, un champ de recherche — vit DANS le rail plutôt que dans un
  // second panneau collé contre lui.
  const [voletTitre, setVoletTitre] = useState(null);
  const [noeudVolet, setNoeudVolet] = useState(null);
  const declarer = useCallback(t => setVoletTitre(t), []);
  const panneau = useMemo(() => ({ declarer, noeud: noeudVolet }),
    [declarer, noeudVolet]);

  /*
   * LES DEUX OUTILS QUI SONT PARTOUT — ET QUI SONT POSÉS ICI, PAS PAR LES
   * ÉCRANS.
   *
   * « On doit toujours pouvoir aller vers le centre d'impression. » Il était
   * déclaré écran par écran : présent sur trois, absent sur les autres, et
   * chacun le nommait à sa façon. Un outil qu'on trouve sur un écran et pas
   * sur le voisin n'est pas un outil, c'est une surprise.
   *
   * L'axe le porte donc pour tous ses volets, sous le filet, à la même place
   * et dans le même ordre — l'impression d'abord : on imprime tous les jours,
   * on importe quelques fois par an.
   */
  const [portesEchanges, setPortesEchanges] = useState(null);
  const outilsCommuns = [
    ...(echanges && portesEchanges ? [{
      key: 'echanges', label: 'Importer', icon: IconDatabaseImport,
      onClick: portesEchanges,
    }] : []),
  ];

  /*
   * LES OUTILS DE L'ÉCRAN NAISSENT SOUS LEUR RUBRIQUE.
   *
   * Ils formaient une section à part, ajoutée SOUS la liste des rubriques. Le
   * rail semblait donc se réécrire tout seul à chaque clic — les rubriques
   * restaient, mais la moitié basse changeait sans que rien l'annonce, et rien
   * ne disait que ces icônes-là appartenaient à l'écran ouvert plutôt qu'à
   * l'axe.
   *
   * Elles se déplient désormais SOUS la rubrique qui les a ouvertes, entre deux
   * filets : la parenté se lit, et ce qui suit glisse simplement vers le bas.
   *
   * Les sections que l'écran déclare sont aplaties : leurs intertitres — « Fin
   * de cycle », « Supprimer » — ne survivraient pas au rail replié, où le
   * libellé est masqué. Un séparateur invisible n'est pas un séparateur.
   */
  const sousOutils = (() => {
    const tous = (outils || []).flatMap(sec => sec.items || []);
    // DÉTRUIRE EN DERNIER, TOUJOURS. Rangé au milieu, ce bouton finit par se
    // trouver là où l'on visait autre chose la veille — et c'est le seul du
    // rail qu'on ne peut pas défaire.
    return [...tous.filter(i => !i.destructif), ...tous.filter(i => i.destructif)];
  })();

  /* LES RUBRIQUES DE L'AXE PASSENT DEVANT LES OUTILS DE L'ÉCRAN.
   *
   * Le tiroir d'outils se dépliait SOUS la rubrique ouverte — ce qui disait
   * bien la parenté, mais repoussait toutes les rubriques suivantes derrière
   * une demi-douzaine d'icônes d'écran. Sur l'axe Étudiants, « Valorisation »,
   * « Délibération » et « Procédures » se retrouvaient ainsi APRÈS « Diplômes
   * et titres » et la corbeille : le parcours de l'étudiant, qui est l'ordre
   * même du rail, était coupé en deux par les outils d'un seul écran.
   *
   * L'axe se lit donc d'abord en entier — c'est lui qui dit où l'on peut
   * aller —, et les outils de l'écran ouvert se déplient EN DESSOUS, entre
   * leurs deux filets teintés. La parenté reste lisible par le filet et par le
   * mouvement ; ce qui change, c'est qu'elle ne coupe plus la liste.
   *
   * Tranché par Charles le 19 septembre 2026, contre deux autres options :
   * ne remonter que la valorisation, et laisser l'ordre en place en
   * descendant seulement les diplômes et la corbeille. */
  const entreeRubrique = o => ({
      key: o.key,
      label: o.label + (o.futur ? ' — à venir' : ''),
      // SANS ICÔNE, LE RAIL REPLIÉ N'A RIEN À MONTRER : le libellé y est
      // masqué, et une rubrique sans icône devient une ligne vide qu'on ne
      // peut ni lire ni viser. L'axe en fournit une par défaut, pour qu'un
      // volet ajouté sans icône reste utilisable.
      icon: o.icone || icone,
      actif: actif === o.key,
      onClick: () => setActif(o.key),
  });

  /* L'ORDRE DU RAIL EST CELUI DU TRAVAIL, PAS CELUI DE LA MÉCANIQUE.
   *
   * On a d'abord rangé les rubriques de l'axe d'un côté et les outils de
   * l'écran de l'autre, en deux blocs. C'était propre pour le code et faux
   * pour l'usage : sur Étudiants, « Composer les PAE de l'année suivante »
   * appartient au PAE et « Diplômes et titres » suit la délibération. Les
   * séparer par nature revenait à couper une suite de gestes en deux listes
   * qu'il faut ensuite recoller de tête.
   *
   * Un axe peut donc déclarer `ordreRail` : des GROUPES de clés, mêlant
   * rubriques et outils, séparés à l'écran par un filet. Ce qui n'y figure pas
   * garde sa place naturelle — un écran qui ajoute un outil demain ne
   * disparaît pas du rail parce que personne n'a pensé à le lister.
   *
   * Sans `ordreRail`, on retombe sur le comportement précédent : les rubriques,
   * puis le tiroir des outils. Les autres axes n'ont rien à changer. */
  const parCle = new Map();
  for (const o of visibles) parCle.set(o.key, entreeRubrique(o));
  for (const it of sousOutils) if (!parCle.has(it.key)) parCle.set(it.key, it);

  const [sousOuvert, setSousOuvert] = useState(null);
  for (const sm of sousMenus) {
    const enfants = (sm.enfants || []).map(e => {
      // PAS DE DROIT, PAS D'ICÔNE (3.1.20) : un outil que la porte refuserait
      // ne revient pas par le tiroir, même quand l'écran hôte n'est pas ouvert.
      if (e.peut && !e.peut()) return null;
      const present = parCle.get(e.key);
      if (present) return { ...present, label: e.label || present.label, icon: e.icone || present.icon };
      // Une RUBRIQUE que le rôle ne voit pas ne revient pas par le tiroir.
      if (onglets.some(o => o.key === e.key)) return null;
      // L'outil vit sur un autre écran : on l'ouvre, et il se lance.
      return { key: e.key, label: e.label, icon: e.icone, actif: false,
        onClick: () => { try { sessionStorage.setItem('lucie.outil', e.key); } catch { /* */ } setActif(sm.hote); } };
    }).filter(Boolean);
    for (const e of sm.enfants || []) parCle.delete(e.key);
    // UN SOUS-MENU QUI PORTE LA CLÉ D'UNE RUBRIQUE EST CETTE RUBRIQUE : elle
    // garde son geste (ouvrir son écran) et déplie ses outils dessous dès
    // qu'on est chez elle ou chez l'un d'eux (« Inscriptions & PAE », 4 octobre 2026).
    const rubrique = parCle.get(sm.key);
    if (rubrique && rubrique.onClick) {
      // FERMÉ PAR DÉFAUT (Charles, 4 octobre 2026) : on arrive sur la rubrique
      // sans le tiroir ; un clic sur elle, quand on y est déjà, l'ouvre ou le
      // referme. Il reste ouvert tant qu'on travaille dans l'un de ses outils.
      const ouvertR = enfants.some(e => e.actif) || sousOuvert === sm.key;
      parCle.set(sm.key, { ...rubrique, sous: ouvertR ? enfants : undefined,
        onClick: () => {
          if (rubrique.actif) setSousOuvert(o => (o === sm.key ? null : sm.key));
          else rubrique.onClick();
        } });
      continue;
    }
    const ouvert = sousOuvert === sm.key || enfants.some(e => e.actif);
    parCle.set(sm.key, { key: sm.key, label: sm.label, icon: sm.icone, actif: false,
      onClick: () => setSousOuvert(o => (o === sm.key ? null : sm.key)),
      sous: ouvert ? enfants : undefined });
  }

  const groupes = [];
  if (Array.isArray(ordreRail) && ordreRail.length) {
    const places = new Set();
    for (const g of ordreRail) {
      const items = g.map(k => parCle.get(k)).filter(Boolean);
      for (const k of g) places.add(k);
      if (items.length) groupes.push(items);
    }
    // LE RESTE N'EST PAS PERDU : ce qui n'a pas été listé rejoint le premier
    // groupe, rubriques d'abord — et les destructifs ferment la marche, comme
    // partout ailleurs dans Lucie.
    const restants = [...parCle.entries()].filter(([k]) => !places.has(k)).map(([, v]) => v);
    if (restants.length) {
      const doux = restants.filter(i => !i.destructif);
      const durs = restants.filter(i => i.destructif);
      if (doux.length) (groupes[0] || groupes[groupes.push([]) - 1]).push(...doux);
      if (durs.length) groupes.push(durs);
    }
  }

  const rubriques = groupes.length
    ? null
    : {
        label: 'Dans cet axe',
        items: visibles.map((o, i) => ({
          ...entreeRubrique(o),
          sous: (i === visibles.length - 1 && sousOutils.length) ? sousOutils : undefined,
        })),
      };

  /* Les groupes deviennent des sections du rail, sans intitulé : un titre par
     groupe ne survivrait pas au rail replié, où le libellé est masqué — et un
     filet dit déjà ce qu'il faut. Le dernier ne porte pas de filet après lui :
     une barre en fin de liste ne sépare de rien. */
  const sectionsRail = groupes.length
    ? groupes.map((items, i) => ({ items, filet: i > 0 }))
    : [rubriques];

  return (
    <div className="relative" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailDessine icon={icone} titre={titre} sousTitre={question}
        /* REVENIR À L'AXE, c'est revenir à sa PREMIÈRE rubrique : celle par
           laquelle on y entre, et celle qu'on cherche quand on s'est perdu
           trois écrans plus loin. */
        surAccueil={() => setActif(visibles[0]?.key)}
        sections={sectionsRail}
        volet={voletTitre === null ? null : { titre: voletTitre }}
        surNoeudVolet={setNoeudVolet}
        actions={outilsCommuns} impression={impression} />

      {/* LA GOUTTIÈRE DU RAIL EST POSÉE ICI PAR DÉFAUT, et sa largeur vient du
          rail lui-même (classe « gouttiere-rail », variable --rail) : le
          contenu suit quand on épingle, sans qu'aucun écran ait à le savoir.
          Seuls les écrans qui posent DÉJÀ la leur le déclarent. */}
      <div className={courant?.railPropre
        ? '' : (courant?.sansMarge ? 'gouttiere-rail' : 'gouttiere-rail cadre-page p-4')}>
        <FournisseurRail valeur={inscrire} panneau={panneau}
          echanges={setPortesEchanges}>
          {courant?.futur ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8
                            text-center text-sm text-slate-500 m-4">
              <div className="font-semibold text-slate-600 mb-1">{courant.label}</div>
              {courant.description
                || 'Ce module a sa place réservée dans la structure et sera construit ici.'}
            </div>
          ) : courant?.rendu}
        </FournisseurRail>
      </div>
    </div>
  );
}

import { useCallback, useState } from 'react';
import { RailDessine, FournisseurRail } from './ui.jsx';

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
export default function Axe({ titre, question, icone, onglets, ongletInitial }) {
  const visibles = onglets.filter(o => !o.masque);
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

  const rubriques = {
    label: 'Dans cet axe',
    items: visibles.map(o => ({
      key: o.key,
      label: o.label + (o.futur ? ' — à venir' : ''),
      // SANS ICÔNE, LE RAIL REPLIÉ N'A RIEN À MONTRER : le libellé y est
      // masqué, et une rubrique sans icône devient une ligne vide qu'on ne
      // peut ni lire ni viser. L'axe en fournit une par défaut, pour qu'un
      // volet ajouté sans icône reste utilisable.
      icon: o.icone || icone,
      actif: actif === o.key,
      onClick: () => setActif(o.key),
    })),
  };

  return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailDessine icon={icone} titre={titre} sousTitre={question}
        sections={[rubriques, ...(outils || [])]} />

      {/* LA GOUTTIÈRE DU RAIL EST POSÉE ICI PAR DÉFAUT, et sa largeur vient du
          rail lui-même (classe « gouttiere-rail », variable --rail) : le
          contenu suit quand on épingle, sans qu'aucun écran ait à le savoir.
          Seuls les écrans qui posent DÉJÀ la leur le déclarent. */}
      <div className={courant?.railPropre
        ? '' : (courant?.sansMarge ? 'gouttiere-rail' : 'gouttiere-rail p-4')}>
        <FournisseurRail valeur={inscrire}>
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

import { Fenetre, GroupeFenetre, PieceFenetre, BoutonFenetre } from './ui.jsx';
import { IconUpload, IconDownload, IconAlertTriangle, IconDatabaseImport } from '@tabler/icons-react';

/**
 * LE CENTRE D'ÉCHANGES — tout ce qui entre, tout ce qui sort, en une porte.
 *
 * Le rail portait treize entrées, dont huit imports rangés les uns sous les
 * autres et distingués par leur seul intitulé : « Classeur PAE », « Classeur
 * de suivi (2 sessions) », « Comparer un classeur », « Importateur sur
 * mesure ». Quatre fois le mot classeur, aucune indication de ce que chacun
 * attend — et l'on ouvrait au jugé, on refermait, on recommençait.
 *
 * DIRE CE QUE ÇA FAIT, ET CE QUE ÇA MANGE. Chaque entrée annonce désormais son
 * usage en une phrase et le fichier qu'elle réclame. C'est la seule chose qui
 * permette de choisir sans essayer : entre deux imports de classeur, ce n'est
 * pas le nom qui tranche, c'est le format attendu.
 *
 * CE QUI DÉTRUIT SE VOIT DE LOIN. La purge des résultats vit ici comme le
 * reste — la cacher ailleurs ne l'aurait pas rendue moins dangereuse — mais
 * dans son propre bloc, à part, et de sa couleur.
 */
export default function CentreEchanges({ sorties = [], entrees = [], risques = [], onClose }) {
  const Bloc = ({ titre, sous, icone: Ic, items, ton }) => {
    if (!items.length) return null;
    return (
      <GroupeFenetre titre={titre} ton={ton === 'risque' ? 'alerte' : 'neutre'}>
        <div className="-mt-1 mb-1 text-[12px] text-slate-400">{sous}</div>
        {items.map(it => (
          <PieceFenetre key={it.cle} icone={Ic} titre={it.titre} sous={it.quoi}
            meta={it.attend ? 'attend : ' + it.attend : null}
            ton={ton === 'risque' ? 'alerte' : 'neutre'}
            onClick={() => { onClose(); it.onClick(); }} />
        ))}
      </GroupeFenetre>
    );
  };

  return (
    <Fenetre icone={IconDatabaseImport} titre="Importer et exporter"
      sous="Chaque outil dit le fichier qu'il attend."
      large="grande" onFermer={onClose}
      pied={<>
        <p className="text-[12px] text-slate-500 flex-1 min-w-0">
          Les imports montrent toujours ce qu'ils vont écrire avant de l'écrire.
        </p>
        <BoutonFenetre onClick={onClose}>Fermer</BoutonFenetre>
      </>}>
      <Bloc titre="Sortir" sous="produire un fichier depuis Lucie"
        icone={IconDownload} items={sorties} />
      <Bloc titre="Faire entrer" sous="reprendre des données venues d'ailleurs"
        icone={IconUpload} items={entrees} />
      <Bloc titre="Entretien" sous="opérations destructrices"
        icone={IconAlertTriangle} items={risques} ton="risque" />
    </Fenetre>
  );
}

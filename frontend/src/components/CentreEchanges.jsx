import { Fenetre, BoutonFenetre } from './ui.jsx';
import { IconUpload, IconAlertTriangle, IconDatabaseImport } from '@tabler/icons-react';

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
/* UN CENTRE D'IMPORT, PAS D'EXPORT, ET DES CASES PLUTÔT QUE DES TUILES
   (Charles, 3 octobre 2026 : « c'est un centre d'import… export c'est dans
   Éditions ; on supprime les tuiles, on passe à des cases, trop grand »).
   `sorties` reste accepté pour ne rien casser chez les appelants, mais ne
   s'affiche plus : produire un fichier se fait dans Éditions (listes
   « Étudiants », « Étudiants par UE », en Excel). */
export default function CentreEchanges({ entrees = [], risques = [], onClose }) {
  const Cases = ({ titre, items, risque = false }) => {
    if (!items.length) return null;
    return (
      <section className="mb-4 last:mb-0">
        <div className="intertitre mb-1.5"
          style={{ color: risque ? 'var(--c-refuse)' : 'var(--c-disponible)' }}>{titre}</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {items.map(it => (
            <button key={it.cle} type="button" onClick={() => { onClose(); it.onClick(); }}
              title={[it.quoi, it.attend ? `Attend : ${it.attend}` : null].filter(Boolean).join('\n')}
              className={`text-left rounded-champ border bg-white px-3 py-2 min-w-0
                transition-colors duration-150 ease-ios hover:bg-slate-50
                ${risque ? 'border-[color:var(--c-refuse)]/40' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="flex items-center gap-1.5 text-second font-semibold text-iip-texte">
                {risque ? <IconAlertTriangle size={14} className="flex-none" style={{ color: 'var(--c-refuse)' }} />
                        : <IconUpload size={14} className="flex-none text-slate-400" />}
                <span className="truncate">{it.titre}</span>
              </div>
              {it.quoi && <div className="text-xs text-slate-500 leading-snug line-clamp-2 mt-0.5">{it.quoi}</div>}
              {it.attend && <div className="text-mention text-slate-400 truncate mt-0.5">{it.attend}</div>}
            </button>
          ))}
        </div>
      </section>
    );
  };

  return (
    <Fenetre icone={IconDatabaseImport} titre="Importer"
      sous="Chaque outil dit le fichier qu'il attend."
      large="grande" onFermer={onClose}
      pied={<>
        <span className="text-second text-slate-500">
          Les imports montrent toujours ce qu'ils vont écrire avant de l'écrire. Pour sortir un fichier : Éditions.
        </span>
        <BoutonFenetre onClick={onClose}>Fermer</BoutonFenetre>
      </>}>
      <Cases titre="Faire entrer des données" items={entrees} />
      <Cases titre="Entretien — opérations destructrices" items={risques} risque />
    </Fenetre>
  );
}

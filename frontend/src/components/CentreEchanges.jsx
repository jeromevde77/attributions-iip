import { IconX, IconUpload, IconDownload, IconAlertTriangle } from '@tabler/icons-react';

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
      <section className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h4 className={`text-[11px] font-bold uppercase tracking-wider
            ${ton === 'risque' ? 'text-red-700' : 'text-slate-500'}`}>{titre}</h4>
          <span className="text-[11.5px] text-slate-400">{sous}</span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {items.map(it => (
            <button key={it.cle} onClick={() => { onClose(); it.onClick(); }}
              className={`text-left rounded-xl border px-3 py-2.5 flex gap-2.5
                transition-colors ${ton === 'risque'
                  ? 'border-red-200 bg-red-50/60 hover:bg-red-50 hover:border-red-300'
                  : 'border-slate-200 bg-white hover:border-iip-turquoise hover:bg-slate-50'}`}>
              <Ic size={16} className={`flex-none mt-0.5 ${ton === 'risque'
                ? 'text-red-600' : 'text-slate-400'}`} stroke={1.8} />
              <span className="min-w-0">
                <span className={`block text-[13px] font-semibold leading-tight
                  ${ton === 'risque' ? 'text-red-800' : 'text-iip-blue'}`}>{it.titre}</span>
                <span className="block text-[11.5px] text-slate-500 leading-snug mt-0.5">
                  {it.quoi}
                </span>
                {it.attend && (
                  <span className="block text-[10.5px] text-slate-400 mt-1">
                    Attend : {it.attend}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-[60] p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-12
                      max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex-none px-5 py-3 border-b border-slate-100 flex items-start
                        justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue">
              Importer et exporter
            </h3>
            <p className="text-[12px] text-slate-500">
              Tout ce qui entre dans Lucie et tout ce qui en sort. Chaque outil dit
              le fichier qu'il attend.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <Bloc titre="Sortir" sous="produire un fichier depuis Lucie"
            icone={IconDownload} items={sorties} />
          <Bloc titre="Faire entrer" sous="reprendre des données venues d'ailleurs"
            icone={IconUpload} items={entrees} />
          <Bloc titre="Entretien" sous="opérations destructrices"
            icone={IconAlertTriangle} items={risques} ton="risque" />
        </div>

        <div className="flex-none px-5 py-2.5 border-t border-slate-100 flex items-center
                        justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Les imports montrent toujours ce qu'ils vont écrire avant de l'écrire.
          </p>
          <button onClick={onClose}
            className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300
                       text-slate-600">Fermer</button>
        </div>
      </div>
    </div>
  );
}

import { IconCheck, IconChevronRight } from '@tabler/icons-react';

/**
 * Le cheminement d'un dossier d'aménagements raisonnables, tel que le
 * formulaire l'organise :
 *
 *   cadre A  la demande de l'étudiant, reçue par la personne de référence
 *   cadre B  le rapport de la personne de référence, transmis au Conseil
 *            la décision du Conseil des études, puis sa notification
 *
 * Les étapes ne se BLOQUENT PAS : un dossier peut avancer sans que tout soit
 * rempli — une demande urgente se traite parfois avant que les annexes
 * n'arrivent. Ce qui manque est signalé, non interdit.
 */
export default function EtapesAmenagement({ d, onAller, etapeActive }) {
  const etapes = [
    {
      cle: 'demande',
      titre: 'Demande',
      sous: 'Cadre A · étudiant',
      fait: !!d?.date_demande,
      manque: [
        !d?.date_demande && 'date de la demande',
        !d?.ues?.length && 'unités concernées',
        !d?.soins_specifiques && 'nature des aménagements demandés',
        !d?.signe_etudiant_le && "signature de l'étudiant",
      ].filter(Boolean),
    },
    {
      cle: 'rapport',
      titre: 'Rapport',
      sous: 'Cadre B · personne de référence',
      fait: !!d?.transmis_cde_le,
      manque: [
        !d?.personne_reference && 'personne de référence',
        d?.materiel_demande == null && d?.pedago_demande == null
          && 'aménagements matériels ou pédagogiques',
        !d?.signe_reference_le && 'signature de la personne de référence',
        !d?.transmis_cde_le && 'transmission au Conseil',
      ].filter(Boolean),
    },
    {
      cle: 'decision',
      titre: 'Décision',
      sous: 'Conseil des études',
      fait: ['accepte', 'partiel', 'refuse'].includes(d?.statut),
      manque: [
        !d?.cde_recu_le && 'réception par le Conseil',
        !['accepte', 'partiel', 'refuse'].includes(d?.statut) && 'décision',
        ['accepte', 'partiel', 'refuse'].includes(d?.statut) && !d?.cde_motivation
          && 'motivation de la décision',
        !d?.notifie_le && "notification à l'étudiant",
      ].filter(Boolean),
    },
  ];

  return (
    <div className="flex items-stretch gap-1 mb-4">
      {etapes.map((e, i) => {
        const actif = etapeActive === e.cle;
        return (
          <div key={e.cle} className="flex items-stretch flex-1 min-w-0">
            <button onClick={() => onAller(e.cle)}
              className={`flex-1 min-w-0 text-left px-3 py-2 rounded-xl border transition
                ${actif ? 'border-iip-blue bg-iip-blue/5'
                  : e.fait ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
                  : 'border-slate-200 hover:bg-slate-50'}`}>
              <div className="flex items-center gap-1.5">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center
                  text-[9px] font-bold flex-none ${
                  e.fait ? 'bg-emerald-600 text-white'
                         : 'bg-slate-200 text-slate-600'}`}>
                  {e.fait ? <IconCheck size={10} /> : i + 1}
                </span>
                <span className="text-[13px] font-semibold text-iip-blue truncate">
                  {e.titre}
                </span>
              </div>
              <div className="text-[10.5px] text-slate-500 truncate">{e.sous}</div>
              {/* Ce qui manque est ÉNONCÉ, non bloquant : une demande urgente
                  se traite parfois avant que les annexes n'arrivent. */}
              {e.manque.length > 0 && (
                <div className="text-[10px] text-amber-700 mt-0.5 truncate"
                  title={e.manque.join('\n')}>
                  {e.manque.length} élément(s) à compléter
                </div>
              )}
            </button>
            {i < etapes.length - 1 && (
              <div className="flex items-center px-0.5 text-slate-300 flex-none">
                <IconChevronRight size={14} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

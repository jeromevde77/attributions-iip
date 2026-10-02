import { IconCheck, IconChevronRight, IconLock } from '@tabler/icons-react';

/**
 * LE CIRCUIT D'UN AMÉNAGEMENT RAISONNABLE, EN QUATRE ÉTAPES (Charles,
 * 2 octobre 2026) :
 *
 *   1 Demande   cadre A — se VALIDE (qui écrit les AR) ; elle passe au vert ;
 *   2 Rapport   cadre B et mesures demandées — s'ouvre quand A est validée,
 *               se VALIDE par la personne de référence ;
 *   3 Avis      les chargés de cours, mesure par mesure, dans Mes cours ;
 *   4 Décision  le Conseil des études tranche, voit pièces et avis.
 *
 * Une étape fermée porte un cadenas et ne s'ouvre pas : on sait où l'on en est,
 * et ce qui vient. Un dossier décidé avant le circuit reste entièrement ouvert.
 */
export default function EtapesAmenagement({ d, circuit, onAller, etapeActive }) {
  const c = circuit || {};
  const hors = !!c.hors_circuit;
  const aOk = !!c.a?.valide_le, bOk = !!c.b?.valide_le;
  const decide = ['accepte', 'partiel', 'refuse', 'recours'].includes(d?.statut);
  const nAvis = new Set((c.avis || []).map(x => x.professeur_id)).size;
  const nCharges = (c.charges || []).length;
  const etapes = [
    { cle: 'demande', titre: 'Demande', sous: 'cadre A', fait: aOk || hors, ouvert: true,
      etat: aOk ? 'validée' : `${c.a?.manques?.length || 0} élément(s) à compléter` },
    { cle: 'rapport', titre: 'Rapport', sous: 'cadre B · personne de référence', fait: bOk || hors, ouvert: aOk || hors,
      etat: bOk ? 'validé' : aOk ? `${c.b?.manques?.length || 0} élément(s) à compléter` : 'après la demande' },
    { cle: 'avis', titre: 'Avis', sous: 'chargés de cours', fait: bOk && nCharges > 0 && nAvis >= nCharges, ouvert: bOk || hors,
      etat: bOk ? `${nAvis} sur ${nCharges} rendu(s)` : 'après le rapport' },
    { cle: 'decision', titre: 'Décision', sous: 'Conseil des études', fait: decide, ouvert: bOk || hors,
      etat: decide ? 'rendue' : bOk ? 'à trancher' : 'après le rapport' },
  ];
  return (
    <div className="flex items-stretch gap-1">
      {etapes.map((e, i) => {
        const actif = etapeActive === e.cle;
        return (
          <div key={e.cle} className="flex items-stretch flex-1 min-w-0">
            <button onClick={() => e.ouvert && onAller(e.cle)} disabled={!e.ouvert}
              className={`flex-1 min-w-0 text-left px-3 py-1.5 rounded-lg border transition disabled:cursor-not-allowed
                ${actif ? 'border-iip-blue bg-white shadow-[0_0_0_1px_var(--c-principal)]' : 'border-slate-200 bg-white hover:bg-slate-50'}
                ${!e.ouvert ? 'opacity-50' : ''}`}
              style={e.fait ? { borderLeft: '4px solid var(--c-reussi, #3E7D5E)' } : undefined}>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-none text-white"
                  style={{ background: e.fait ? 'var(--c-reussi, #3E7D5E)' : e.ouvert ? 'var(--c-principal, #16406A)' : '#94A3B8' }}>
                  {e.fait ? <IconCheck size={10} /> : !e.ouvert ? <IconLock size={9} /> : i + 1}
                </span>
                <span className="text-[13px] font-semibold text-iip-blue truncate">{e.titre}</span>
                <span className="text-[11px] text-slate-500 truncate">· {e.sous}</span>
              </div>
              <div className="text-[11px] truncate" style={{ color: e.fait ? 'var(--c-reussi, #3E7D5E)' : '#64748b' }}>{e.etat}</div>
            </button>
            {i < etapes.length - 1 && (
              <div className="flex items-center px-0.5 text-slate-300 flex-none"><IconChevronRight size={14} /></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

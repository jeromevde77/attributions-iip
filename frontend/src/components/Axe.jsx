import { useState } from 'react';

/**
 * Enveloppe d'un axe de la structure en 7 :
 * un titre, la question à laquelle l'axe répond, des onglets — et dans chaque
 * onglet un écran EXISTANT, repris tel quel. La migration regroupe, elle ne
 * réécrit rien : chaque écran garde sa logique, ses appels et ses droits.
 *
 * Un onglet peut être marqué `futur` : il annonce sa place réservée sans
 * prétendre exister (pastille « À venir », contenu descriptif).
 */
export default function Axe({ titre, question, onglets, ongletInitial }) {
  const visibles = onglets.filter(o => !o.masque);
  const [actif, setActif] = useState(
    ongletInitial && visibles.some(o => o.key === ongletInitial)
      ? ongletInitial
      : visibles[0]?.key
  );
  const courant = visibles.find(o => o.key === actif) || visibles[0];

  return (
    <div>
      <div className="bg-white border-b border-slate-200 px-5 pt-4">
        <h1 className="text-lg font-bold text-iip-blue">{titre}</h1>
        {question && <p className="text-[12.5px] text-slate-500 italic mt-0.5 mb-3">{question}</p>}
        <div className="flex gap-1 flex-wrap -mb-px">
          {visibles.map(o => (
            <button key={o.key} onClick={() => setActif(o.key)}
              className={`px-3.5 py-2 text-[13px] font-medium border-b-2 ${actif === o.key
                ? 'border-iip-turquoise text-iip-blue font-semibold'
                : 'border-transparent text-slate-500 hover:text-iip-blue'}`}>
              {o.label}
              {o.futur && (
                <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 align-[2px]">
                  À VENIR
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className={courant?.sansMarge ? '' : 'p-4'}>
        {courant?.futur ? (
          <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500 m-4">
            <div className="font-semibold text-slate-600 mb-1">{courant.label}</div>
            {courant.description || 'Ce module a sa place réservée dans la structure et sera construit ici.'}
          </div>
        ) : courant?.rendu}
      </div>
    </div>
  );
}

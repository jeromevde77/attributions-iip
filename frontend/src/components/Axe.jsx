import { useState } from 'react';

/**
 * Enveloppe d'un axe de la structure en 7 : des onglets, et dans chacun un
 * écran EXISTANT repris tel quel. La migration regroupe, elle ne réécrit rien.
 *
 * UN SEUL BANDEAU, ET IL TIENT SUR UNE LIGNE.
 *
 * Il y en avait trois empilés avant le moindre contenu : la barre du haut, le
 * titre de l'axe, puis l'écran qui redonnait son propre titre. « Étudiants »
 * s'écrivait trois fois sur la même page, et l'on descendait de cent cinquante
 * pixels pour arriver à la première donnée.
 *
 * Le titre disparaît donc : la barre du haut dit déjà où l'on est, et elle le
 * dit en surbrillance. Restent les onglets — ce qui se choisit — et la
 * question de l'axe, posée en clair à droite : elle tient sur la même ligne
 * au lieu de coûter une bande à elle seule.
 *
 * ET UN SEUL FOND. Le bandeau était blanc, le contenu gris : deux aplats
 * différents cousus par une bordure, d'où l'impression de deux espaces
 * juxtaposés. Ils partagent désormais le même fond, séparés par un simple
 * filet — la page redevient continue.
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
      <div className="bg-slate-50 border-b border-slate-200/80 px-5
                      flex items-end justify-between gap-6">
        <div className="flex gap-0.5 flex-wrap -mb-px" role="tablist" aria-label={titre}>
          {visibles.map(o => (
            <button key={o.key} onClick={() => setActif(o.key)} role="tab"
              aria-selected={actif === o.key}
              className={`px-3.5 py-2.5 text-[13px] border-b-2 transition-colors
                duration-150 ${actif === o.key
                  ? 'border-iip-turquoise text-iip-blue font-semibold'
                  : 'border-transparent text-slate-500 hover:text-iip-blue'}`}>
              {o.label}
              {o.futur && (
                <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full
                                 bg-amber-100 text-amber-800 align-[2px]">
                  À VENIR
                </span>
              )}
            </button>
          ))}
        </div>
        {/* La question de l'axe : elle dit à quoi cet écran sert, ce qu'aucun
            onglet ne dit. Elle s'efface sur un écran étroit, où la place va
            d'abord à ce qui se clique. */}
        {question && (
          <p className="hidden lg:block pb-2.5 text-[12px] text-slate-400 italic
                        whitespace-nowrap">{question}</p>
        )}
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

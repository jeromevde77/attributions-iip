import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconCheck, IconArrowRight, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Assistant de mise en route — rendu générique.
 *
 * N'implémente aucun écran : il lit l'état réel en base et renvoie vers les
 * écrans existants. Ajouter un assistant se fait côté backend, dans la
 * définition déclarative ; ce composant les sert tous.
 */
export default function Assistant({ cle, params = {}, onFerme = null }) {
  const [etat, setEtat] = useState(null);
  const navigate = useNavigate();

  async function charger() {
    const qs = new URLSearchParams(params).toString();
    const rep = await fetch(`/api/assistants/${cle}?${qs}`, { headers: authHeaders() });
    setEtat(rep.ok ? await rep.json() : { erreur: (await rep.json().catch(() => ({}))).error });
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [cle, JSON.stringify(params)]);

  if (!etat) return <div className="p-4 text-sm text-slate-400">Chargement…</div>;
  if (etat.erreur) return <div className="p-4 text-sm text-red-600">{etat.erreur}</div>;

  const pct = etat.total ? Math.round((etat.faites / etat.total) * 100) : 0;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-iip-blue text-base">{etat.titre}</div>
            <div className="text-second text-slate-500 mt-0.5">{etat.intro}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-second font-semibold text-slate-600">
              {etat.faites}/{etat.total}
            </div>
            <button onClick={charger}
              className="text-second px-2.5 py-1 border border-slate-300 rounded-lg hover:bg-white">
              Actualiser
            </button>
            {onFerme && (
              <button onClick={onFerme} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
            )}
          </div>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-iip-turquoise transition-all" style={{ width: pct + '%' }} />
        </div>
      </div>

      {etat.termine && (
        <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 text-sm text-emerald-800 flex items-center gap-2 border-l-4 border-l-emerald-500">
          <IconCheck size={15} /> Toutes les étapes sont faites — la section est opérationnelle.
        </div>
      )}

      <ol className="divide-y divide-slate-100">
        {etat.etapes.map((e, i) => {
          const prochaine = etat.prochaine === e.cle;
          return (
            <li key={e.cle}
              className={`flex items-start gap-3 px-4 py-3 ${prochaine ? 'bg-sky-50/60 border-l-4 border-l-sky-500' : ''}`}>
              <div className={`flex-none w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5
                ${e.fait ? 'bg-emerald-500 text-white'
                         : prochaine ? 'bg-iip-turquoise text-white'
                         : 'bg-slate-100 text-slate-400'}`}>
                {e.fait ? <IconCheck size={13} /> : i + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${e.fait ? 'text-slate-500' : 'text-slate-800'}`}>
                    {e.titre}
                  </span>
                  {e.valeur && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {e.valeur}
                    </span>
                  )}
                  {prochaine && (
                    <span className="text-mention font-bold px-1.5 py-0.5 rounded-champ bg-iip-turquoise/15 text-iip-blue">
                      À FAIRE MAINTENANT
                    </span>
                  )}
                </div>
                <div className="text-second text-slate-500 mt-0.5">{e.aide}</div>
                {e.detail && (
                  <div className="text-xs text-amber-700 mt-1 flex items-start gap-1">
                    <IconAlertTriangle size={12} className="mt-0.5 flex-none" /> {e.detail}
                  </div>
                )}
              </div>

              <button onClick={() => navigate(e.cible)}
                className={`flex-none flex items-center gap-1 text-second px-2.5 py-1.5 rounded-lg border transition
                  ${prochaine
                    ? 'bg-iip-blue text-white border-iip-blue font-semibold'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                Ouvrir <IconArrowRight size={13} />
              </button>
            </li>
          );
        })}
      </ol>

      <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
        Chaque étape est vérifiée sur les données réelles : cet assistant sert aussi de
        diagnostic sur une section déjà en place.
      </div>
    </div>
  );
}

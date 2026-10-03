import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { IconBulb, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { authHeaders, getUser } from '../lib/api.js';
import FilSuggestion, { PastilleIdee, PastilleNouveau } from './FilSuggestion.jsx';

const Ameliorations = lazy(() => import('./Ameliorations.jsx'));

const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const jour = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

/**
 * MES PROPOSITIONS — à l'Accueil de celui qui a écrit (Charles, 3 octobre
 * 2026 : « quand je réponds, il faut que sur le tableau de bord de la personne
 * qui a écrit, ma réponse y soit et qu'elle puisse répondre »).
 *
 * Paraît dès que la direction a répondu à l'une de ses idées ; une réponse non
 * lue la porte en tête, marquée « nouveau ». Une idée close (faite, écartée)
 * et lue depuis plus de trente jours sort du bloc — le serveur en décide.
 *
 * Côté direction, une seule ligne : combien d'auteurs ont répondu sans être
 * lus, et la porte vers la fenêtre des idées, où ces fils passent en tête.
 */
export default function MesPropositions() {
  const [lignes, setLignes] = useState([]);
  const [ouvert, setOuvert] = useState(null);
  const [vus, setVus] = useState(() => new Set());
  const [aLire, setALire] = useState(0);
  const [fenetre, setFenetre] = useState(false);
  const direction = DIRECTION.includes(getUser()?.role);

  const charger = useCallback(() => {
    fetch('/api/suggestions/miennes', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(j => setLignes(Array.isArray(j?.lignes) ? j.lignes : []))
      .catch(() => {});
    if (direction) {
      fetch('/api/suggestions', { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : null))
        // Seules comptent les réponses des AUTRES : ses propres idées sont
        // déjà dans « Mes propositions ».
        .then(j => setALire((j?.lignes || []).filter(l => l.nouveau && l.cote === 'direction').length))
        .catch(() => {});
    }
  }, [direction]);
  useEffect(() => { charger(); }, [charger]);

  if (!lignes.length && !aLire) return null;

  const ouvrir = id => {
    setVus(v => new Set(v).add(id));
    setOuvert(o => (o === id ? null : id));
  };
  const nbNouveaux = lignes.filter(l => l.nouveau && !vus.has(l.id)).length;

  return (
    <>
      {aLire > 0 && (
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-1.5">
            <h2 className="text-[13px] font-semibold text-iip-blue">Propositions d'amélioration</h2>
            <span className="text-[11px] text-slate-400">les auteurs vous ont répondu</span>
          </div>
          <button type="button" onClick={() => setFenetre(true)}
            className="carte w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-100">
            <IconBulb size={16} className="text-slate-400 flex-none" />
            <span className="flex-1 text-[13px] text-slate-800">
              {aLire} proposition{aLire > 1 ? 's' : ''} avec une réponse non lue
            </span>
            <PastilleNouveau />
            <span className="text-[12px] text-iip-blue font-semibold">Ouvrir</span>
          </button>
        </div>
      )}

      {lignes.length > 0 && (
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-1.5">
            <h2 className="text-[13px] font-semibold text-iip-blue">Mes propositions</h2>
            <span className="text-[11px] text-slate-400">
              {nbNouveaux
                ? `${nbNouveaux} réponse${nbNouveaux > 1 ? 's' : ''} de la direction à lire`
                : 'les réponses de la direction à vos idées'}
            </span>
          </div>
          <div className="carte overflow-hidden">
            {lignes.map(s => {
              const Chevron = ouvert === s.id ? IconChevronDown : IconChevronRight;
              return (
                <div key={s.id} className="border-t border-slate-100 first:border-t-0">
                  <button type="button" onClick={() => ouvrir(s.id)}
                    className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-100">
                    <Chevron size={14} className="text-slate-400 flex-none" />
                    <span className="flex-1 min-w-0 text-[13px] text-slate-800 truncate">{s.titre}</span>
                    {s.nouveau && !vus.has(s.id) && <PastilleNouveau />}
                    <PastilleIdee etat={s.etat} />
                    <span className="text-[11px] text-slate-400 tabular-nums flex-none">
                      {jour(s.derniere_activite)}
                    </span>
                  </button>
                  {ouvert === s.id && (
                    <div className="px-3 pb-3 pl-9">
                      {s.detail && (
                        <div className="text-[12px] text-slate-500 whitespace-pre-wrap mb-1">{s.detail}</div>
                      )}
                      <FilSuggestion id={s.id} invite="Votre réponse à la direction" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {fenetre && (
        <Suspense fallback={null}>
          <Ameliorations onClose={() => { setFenetre(false); charger(); }} />
        </Suspense>
      )}
    </>
  );
}

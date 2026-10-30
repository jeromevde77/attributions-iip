import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Chevron as ChevronMaison } from './ui.jsx';
import { IconBulb, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { authHeaders, getUser } from '../lib/api.js';
import FilSuggestion, { PastilleIdee, PastilleNouveau } from './FilSuggestion.jsx';
import { nomDepuisChaine } from '../lib/nom.js';

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
 * Côté direction (3.1.470) : « Idées à traiter » — chaque idée nouvelle ou dont l'auteur a écrit, à
 * déplier, avec son état et son fil ; « Toutes les idées » ouvre la fenêtre.
 */
export default function MesPropositions() {
  const [lignes, setLignes] = useState([]);
  const [ouvert, setOuvert] = useState(null);
  const [vus, setVus] = useState(() => new Set());
  // LES IDÉES À TRAITER, SUR LE TABLEAU DE BORD DE LA DIRECTION (3.1.470, Charles : « les idées doivent
  // arriver dans mon tableau de bord »). Une idée « nouvelle » (pas encore triée) ou à laquelle son auteur
  // a écrit sans être lu y reste jusqu'à ce qu'on lui donne un état ou qu'on lise le fil.
  const [aTraiter, setATraiter] = useState([]);
  const [etats, setEtats] = useState([]);
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
        .then(j => {
          setEtats(j?.etats || []);
          setATraiter((j?.lignes || []).filter(l => l.cote === 'direction' && (l.nouveau || l.etat === 'nouvelle')));
        })
        .catch(() => {});
    }
  }, [direction]);
  useEffect(() => { charger(); }, [charger]);

  if (!lignes.length && !aTraiter.length) return null;

  async function poserEtat(id, etat) {
    await fetch(`/api/suggestions/${id}`, {
      method: 'PATCH', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ etat }),
    });
    charger();
  }

  const ouvrir = id => {
    setVus(v => new Set(v).add(id));
    setOuvert(o => (o === id ? null : id));
  };
  const nbNouveaux = lignes.filter(l => l.nouveau && !vus.has(l.id)).length;

  return (
    <>
      {aTraiter.length > 0 && (
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-1.5">
            <h2 className="titre-carte">Idées à traiter</h2>
            <span className="text-xs text-slate-400">
              {aTraiter.length} — les nouvelles, et celles où l’auteur vous a écrit
            </span>
            <button type="button" className="ml-auto text-second text-iip-blue hover:underline" onClick={() => setFenetre(true)}>
              Toutes les idées</button>
          </div>
          <div className="carte overflow-hidden">
            {aTraiter.map(s => {
              const Chevron = props => <ChevronMaison ouvert={ouvert === s.id} {...props} />;
              return (
                <div key={s.id} className="border-t border-slate-100 first:border-t-0">
                  <button type="button" onClick={() => ouvrir(s.id)}
                    className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-100">
                    <Chevron size={14} className="text-slate-400 flex-none" />
                    <IconBulb size={15} className="text-slate-400 flex-none" />
                    <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">
                      {s.titre}
                      <span className="text-xs text-slate-400"> · {s.auteur_nom ? nomDepuisChaine(s.auteur_nom) : 'anonyme'}{s.ecran ? ` · ${s.ecran}` : ''}</span>
                    </span>
                    {s.nouveau && !vus.has(s.id) && <PastilleNouveau />}
                    <PastilleIdee etat={s.etat} />
                    <span className="text-xs text-slate-400 tabular-nums flex-none">{jour(s.derniere_activite)}</span>
                  </button>
                  {ouvert === s.id && (
                    <div className="px-3 pb-3 pl-9 space-y-2">
                      {s.detail && <div className="text-second text-slate-600 whitespace-pre-wrap">{s.detail}</div>}
                      <label className="flex items-center gap-2 text-second text-slate-500">État
                        <select value={s.etat} onChange={e => poserEtat(s.id, e.target.value)} className="controle text-second h-7 py-0">
                          {etats.map(e2 => <option key={e2.cle} value={e2.cle}>{e2.libelle}</option>)}
                        </select>
                      </label>
                      <FilSuggestion id={s.id} invite="Réponse à l'auteur — même pour dire non, et pourquoi" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {lignes.length > 0 && (
        <div className="mb-5">
          <div className="flex items-baseline gap-2 mb-1.5">
            <h2 className="titre-carte">Mes propositions</h2>
            <span className="text-xs text-slate-400">
              {nbNouveaux
                ? `${nbNouveaux} réponse${nbNouveaux > 1 ? 's' : ''} de la direction à lire`
                : 'les réponses de la direction à vos idées'}
            </span>
          </div>
          <div className="carte overflow-hidden">
            {lignes.map(s => {
              const Chevron = props => <ChevronMaison ouvert={ouvert === s.id} {...props} />;
              return (
                <div key={s.id} className="border-t border-slate-100 first:border-t-0">
                  <button type="button" onClick={() => ouvrir(s.id)}
                    className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-100">
                    <Chevron size={14} className="text-slate-400 flex-none" />
                    <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">{s.titre}</span>
                    {s.nouveau && !vus.has(s.id) && <PastilleNouveau />}
                    <PastilleIdee etat={s.etat} />
                    <span className="text-xs text-slate-400 tabular-nums flex-none">
                      {jour(s.derniere_activite)}
                    </span>
                  </button>
                  {ouvert === s.id && (
                    <div className="px-3 pb-3 pl-9">
                      {s.detail && (
                        <div className="text-second text-slate-500 whitespace-pre-wrap mb-1">{s.detail}</div>
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

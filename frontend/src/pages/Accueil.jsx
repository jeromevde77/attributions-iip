import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAnnee, getUser, authHeaders } from '../lib/api.js';
import { PageHeader, RailLateral } from '../components/ui.jsx';
import {
  IconHome, IconBell, IconCheck, IconChevronRight,
  // Les trois icônes de calendrier ont disparu avec les trois entrées de
  // période : un réglage n'est pas un territoire, il vit dans une fenêtre.
  IconUserPlus, IconClipboardList, IconSettings, IconRefresh, IconCake,
  IconClipboardPlus, IconFilter} from '@tabler/icons-react';
import ConfierTache from '../components/ConfierTache.jsx';
import { urgence } from '../lib/urgence.js';
import { Fenetre } from '../components/ui.jsx';

const tok = () => localStorage.getItem('token');

/* Les libellés du filtre courant, rappelés sous le titre de l'écran. */
const LIBELLES_FILTRE = {
  attribution: 'attributions seules', recrutement: 'recrutement seul',
  systeme: 'système seul',
};
const LIBELLES_PERIODE = { 7: '7 derniers jours', 90: '3 derniers mois' };

// ── Config visuelle par type d'événement ──────────────────────────────────────
const TYPE_CONFIG = {
  attribution: {
    create: { label: 'Nouvelle attribution', color: '#15803d', bg: '#dcfce7', icon: IconUserPlus },
    delete: { label: 'Attribution retirée',  color: '#b91c1c', bg: '#fee2e2', icon: IconClipboardList },
    update: { label: 'Modification',         color: '#0369a1', bg: '#e0f2fe', icon: IconClipboardList },
  },
  recrutement: {
    info: { label: 'Recrutement', color: '#7c3aed', bg: '#ede9fe', icon: IconUserPlus },
  },
  systeme: {
    info: { label: 'Lucie',       color: '#1B2B4B', bg: '#e8edf5', icon: IconSettings },
  },
  anniversaire: {
    // La veille en teinte sourde, le jour même en ambre : l'un prépare,
    // l'autre appelle.
    demain:     { label: 'Demain',      color: '#92400e', bg: '#fef3c7', icon: IconCake },
    aujourdhui: { label: "Aujourd'hui", color: '#b45309', bg: '#fde68a', icon: IconCake },
  },
};

function getConfig(type, action) {
  return TYPE_CONFIG[type]?.[action] || { label: 'Info', color: '#6b7280', bg: '#f3f4f6', icon: IconBell };
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)    return "à l'instant";
  if (diff < 3600)  return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`;
  return d.toLocaleDateString('fr-BE', { day: '2-digit', month: 'long' });
}

// Extraire le prénom depuis nom_complet
function prenom(nomComplet) {
  if (!nomComplet) return '';
  return nomComplet.trim().split(/\s+/)[0];
}

/**
 * MES TÂCHES — celles qu'on m'a confiées, nommément ou par mon rôle.
 *
 * Elles viennent du suivi d'équipe : ce qui se décide en réunion se retrouve
 * ici le lendemain, chez la personne qui s'en est chargée. Cocher se fait sur
 * place — repasser par l'écran des réunions pour dire « c'est fait » est un
 * détour que personne ne prend.
 */
function MesTaches({ signal = 0 }) {
  const [taches, setTaches] = useState([]);
  const [confiees, setConfiees] = useState([]);
  const [prochaine, setProchaine] = useState(null);

  const lire = (chemin, pose) => fetch(chemin, { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : null)).then(pose).catch(() => {});

  const charger = () => {
    lire('/api/reunions/taches?mien=1&ouvertes=1',
      l => setTaches(Array.isArray(l) ? l : []));
    // CE QUE J'AI CONFIÉ ME REGARDE AUSSI : l'organisateur d'une réunion rouvre
    // les points à la séance suivante, et la direction répond de l'ensemble.
    lire('/api/reunions/taches?confie=1&ouvertes=1',
      l => setConfiees(Array.isArray(l) ? l : []));
    lire('/api/reunions/prochaine', setProchaine);
  };
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [signal]);

  async function cocher(t) {
    await fetch(`/api/reunions/taches/${t.id}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: 'fait' }),
    });
    charger();
  }

  const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : null);
  if (!taches.length && !confiees.length && !prochaine) return null;

  return (
    <div className="mb-5">
      {/* LE PROCHAIN RENDEZ-VOUS, chez ceux qui y sont attendus. Fixé en fin de
          séance, il vivait dans un procès-verbal que personne ne rouvre. */}
      {prochaine && (
        <div className="carte px-3 py-2 mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Prochaine réunion
          </span>
          <span className="text-[13px] font-semibold text-iip-blue">
            {prochaine.titre}
          </span>
          <span className="text-[13px] text-slate-600 tabular-nums">
            {fr(prochaine.prochaine_date)}
            {prochaine.prochaine_heure ? ` à ${prochaine.prochaine_heure}` : ''}
            {prochaine.prochain_lieu ? ` · ${prochaine.prochain_lieu}` : ''}
          </span>
          {prochaine.prochaine_qui && (
            <span className="text-[11px] text-slate-400">
              attendus : {prochaine.prochaine_qui}
            </span>
          )}
        </div>
      )}

      <div className="flex items-baseline gap-2 mb-1.5">
        <h2 className="text-[13px] font-semibold text-iip-blue">Ce qui m’attend</h2>
        <span className="text-[11px] text-slate-400">
          {taches.length} tâche(s) — décidées en réunion
        </span>
      </div>
      {!!taches.length && (
      <div className="carte overflow-hidden">
        {taches.map(t => {
          // TROIS SEUILS, ET RIEN ENTRE EUX : ocre à sept jours, brique à
          // trois, brique encore une fois dépassée. Le jugement vit dans
          // lib/urgence.js — deux écrans qui le referaient chacun de leur côté
          // finiraient par ne plus dire la même chose.
          const u = urgence(t.echeance);
          return (
            <div key={t.id} className={`px-3 py-2 flex items-center gap-3
                                       border-t border-slate-100 first:border-t-0
                                       ${u.rail}`}>
              <button onClick={() => cocher(t)} title="Marquer comme faite"
                className="w-5 h-5 flex-none grid place-items-center rounded-champ border
                           border-slate-300 text-transparent hover:border-emerald-500
                           hover:text-emerald-600">
                <IconCheck size={13} />
              </button>
              <span className="flex-1 min-w-0 text-[13px] text-slate-800 truncate">
                {t.titre}
              </span>
              {/* CE QUE L'ACTION SERT : l'obligation l'emporte sur la réunion.
                  Savoir qu'une tâche tient une échéance de la circulaire change
                  l'ordre dans lequel on la fait. */}
              {(t.obligation_libelle || t.reunion_date) && (
                <span className="text-[11px] text-slate-400 hidden sm:inline truncate max-w-[18rem]">
                  {t.obligation_libelle
                    ? `pour : ${t.obligation_libelle}${t.obligation_base ? ` — ${t.obligation_base}` : ''}`
                    : `décidée le ${fr(t.reunion_date)}`}
                </span>
              )}
              {t.echeance && (
                <span className={`text-[11px] font-semibold tabular-nums flex-none
                  ${u.pastille}`}>
                  {u.mention ? `${u.mention} · ` : 'pour le '}{fr(t.echeance)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* CE QUE J'AI CONFIÉ — chez l'organisateur de la séance et chez la
          direction. Sans cela, le suivi reposait sur la mémoire de celui qui
          présidait : au point suivant, on redemandait « où en est-on ? ». */}
      {!!confiees.length && (
        <div className="mt-3">
          <div className="flex items-baseline gap-2 mb-1.5">
            <h2 className="text-[13px] font-semibold text-iip-blue">Ce que j’ai confié</h2>
            <span className="text-[11px] text-slate-400">
              {confiees.length} action(s) chez d’autres
            </span>
          </div>
          <div className="carte overflow-hidden">
            {confiees.map(t => {
              const u = urgence(t.echeance);
              return (
                <div key={t.id} className={`px-3 py-2 flex items-center gap-3
                                           border-t border-slate-100 first:border-t-0
                                           ${u.rail}`}>
                  <span className="flex-1 min-w-0 text-[13px] text-slate-800 truncate">
                    {t.titre}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate max-w-[12rem]">
                    {t.responsable_nom || t.responsable_role || 'sans responsable'}
                  </span>
                  {t.echeance && (
                    <span className={`text-[11px] font-semibold tabular-nums flex-none
                      ${u.pastille}`}>
                      {u.mention ? `${u.mention} · ` : 'pour le '}{fr(t.echeance)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Accueil() {
  const [items, setItems]     = useState([]);
  const [nbNonLus, setNbNonLus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre]   = useState('tout'); // 'tout' | 'attribution' | 'recrutement' | 'systeme'
  const [jours, setJours]     = useState(30);
  const [confier, setConfier] = useState(false);
  const [filtres, setFiltres] = useState(false);
  // Confier une tâche doit se voir tout de suite dans « Ce que j'ai confié » :
  // une action qu'on ne retrouve pas donne l'impression de n'avoir rien fait.
  const [rafraichirTaches, setRafraichirTaches] = useState(0);
  const annee   = getAnnee();
  const u       = getUser();
  const navigate = useNavigate();

  const charger = useCallback(() => {
    setLoading(true);
    fetch(`/api/historique/feed?annee=${encodeURIComponent(annee)}&jours=${jours}`,
      { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setNbNonLus(d.nbNonLus || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [annee, jours]);

  useEffect(() => { charger(); }, [charger]);

  const marquerLu = async (item) => {
    const [, type, id] = item.id.split('-');
    await fetch(`/api/historique/feed/${type}/${id}/lu`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok()}` },
    });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, lue: true } : i));
    setNbNonLus(n => Math.max(0, n - 1));
  };

  const marquerTousLus = async () => {
    for (const item of items.filter(i => !i.lue)) await marquerLu(item);
  };

  const itemsFiltres = filtre === 'tout' ? items : items.filter(i => i.type === filtre);
  const nbNonLusType = (type) => items.filter(i => i.type === type && !i.lue).length;

  const nbAttr    = nbNonLusType('attribution');
  const nbRecr    = nbNonLusType('recrutement');
  const nbSys     = nbNonLusType('systeme');

  // Grouper par date (aujourd'hui, hier, cette semaine, plus ancien)
  const grouper = (items) => {
    const now   = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now - 86400000).toDateString();
    const groupes = { "Aujourd'hui": [], 'Hier': [], 'Cette semaine': [], 'Plus ancien': [] };
    for (const item of items) {
      const d = new Date(item.date.replace(' ', 'T') + (item.date.includes('Z') ? '' : 'Z'));
      const ds = d.toDateString();
      const diff = (now - d) / 86400000;
      if (ds === today)           groupes["Aujourd'hui"].push(item);
      else if (ds === yesterday)  groupes['Hier'].push(item);
      else if (diff < 7)          groupes['Cette semaine'].push(item);
      else                        groupes['Plus ancien'].push(item);
    }
    return Object.entries(groupes).filter(([, v]) => v.length > 0);
  };

  const groupes = grouper(itemsFiltres);

  return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral
        icon={IconHome}
        titre="Accueil"
        sousTitre={annee}
        /* UNE ICÔNE SE MÉRITE.
           Le rail portait SEPT entrées pour DEUX réglages : quatre types
           d'événement et trois périodes — dont trois calendriers d'affilée,
           qu'un commentaire d'ici s'employait à distinguer alors que la vraie
           réponse était de ne pas leur donner d'icône du tout. Un réglage
           n'est pas un territoire : il s'ouvre, se règle, et se referme.
           Restent deux entrées — ce qu'on FAIT, et ce qu'on filtre. */
        sections={[
          { items: [
            /* CONFIER SE FAIT D'ICI. Une consigne donnée dans un couloir
               n'avait nulle part où aller : le seul écran qui créait des
               tâches était celui d'une réunion. */
            { key: 'confier', label: 'Confier une tâche', icon: IconClipboardPlus,
              onClick: () => setConfier(true) },
            { key: 'filtres', label: 'Filtrer', icon: IconFilter,
              // L'accent ne signale QUE ce qui n'est pas le réglage par
              // défaut : une icône qui brille en permanence n'apprend rien.
              actif: filtre !== 'tout' || jours !== 30,
              onClick: () => setFiltres(true) },
          ]},
        ]}
      />

      {filtres && (
        <Fenetre icone={IconFilter} large="petite" titre="Filtrer le journal"
          sous="Ce qu'on regarde, et sur quelle durée"
          onFermer={() => setFiltres(false)}>
          <div className="p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase
                              tracking-wide mb-1.5">Quels événements</div>
              <div className="carte divide-y divide-slate-100">
                {[['tout', `Tout`, nbNonLus],
                  ['attribution', 'Attributions', nbAttr],
                  ['recrutement', 'Recrutement', nbRecr],
                  ['systeme', 'Système', nbSys]].map(([cle, lib, n]) => (
                  <label key={cle}
                    className="flex items-center gap-2.5 px-3 py-2 cursor-pointer">
                    <input type="radio" name="filtre-accueil" checked={filtre === cle}
                      onChange={() => setFiltre(cle)} className="accent-iip-blue" />
                    <span className="text-[13px] flex-1">{lib}</span>
                    {n > 0 && (
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {n} non lu(s)
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase
                              tracking-wide mb-1.5">Sur quelle durée</div>
              <div className="segments w-full">
                {[[7, '7 jours'], [30, '30 jours'], [90, '3 mois']].map(([v, lib]) => (
                  <button key={v} onClick={() => setJours(v)}
                    className={`flex-1 px-2 py-1.5 text-[12px] ${jours === v
                      ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>
                    {lib}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setFiltre('tout'); setJours(30); }}
                className="bouton">Tout revoir</button>
              <button onClick={() => setFiltres(false)}
                className="bouton bouton-fort ml-auto">Fermer</button>
            </div>
          </div>
        </Fenetre>
      )}

      {confier && (
        <ConfierTache onClose={() => setConfier(false)}
          onCree={() => setRafraichirTaches(n => n + 1)} />
      )}

      <div className="gouttiere-rail p-4 md:p-8">

        {/* LE SALUT EST UN TITRE D'ÉCRAN COMME LES AUTRES.
            Il s'écrivait deux fois plus gros que celui de tous les autres
            écrans, sa date empilée dessous et quarante pixels de marge sous le
            tout : la première ligne de l'Accueil tombait cent pixels plus bas
            que la première icône du rail, et ne répondait donc à rien. Une
            seule échelle, et rien en dehors. */}
        <PageHeader
          titre={`Bonjour, ${prenom(u?.nom) || u?.email?.split('@')[0] || 'vous'} !`}
          /* CE QU'ON REGARDE SE DIT EN HAUT DE L'ÉCRAN. Le filtre vivant
             désormais dans une fenêtre, rien ne dirait plus qu'on ne voit
             qu'une partie des événements — et c'est ainsi qu'on croit un
             journal vide alors qu'il est filtré. */
          sous={[new Date().toLocaleDateString('fr-BE',
            { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
            filtre !== 'tout' ? LIBELLES_FILTRE[filtre] : null,
            jours !== 30 ? LIBELLES_PERIODE[jours] : null,
          ].filter(Boolean).join(' · ')} />

        {/* CE QUI M'ATTEND VIENT AVANT CE QUI S'EST PASSÉ.
            Le fil d'activité raconte ce que les autres ont fait ; il ne dit pas
            ce que MOI je dois faire. Une tâche décidée en réunion de service
            n'avait donc aucun endroit où réapparaître : elle vivait dans le
            procès-verbal, c'est-à-dire nulle part. Elle s'affiche ici, au-dessus
            du fil, et se coche d'ici — avec les tâches confiées à mon rôle, pas
            seulement à mon nom. */}
        <MesTaches signal={rafraichirTaches} />

        {/* En-tête du fil */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-iip-blue">
              {filtre === 'tout' ? 'Fil d\'activité' :
               filtre === 'attribution' ? 'Attributions' :
               filtre === 'recrutement' ? 'Recrutement' : 'Système'}
            </h2>
            {nbNonLus > 0 && (
              <span className="text-xs bg-iip-turquoise text-white rounded-champ px-2 py-0.5 font-bold">{nbNonLus} non lu{nbNonLus > 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {nbNonLus > 0 && (
              <button onClick={marquerTousLus}
                className="text-xs text-gray-400 hover:text-iip-blue">
                Tout marquer comme lu
              </button>
            )}
            <button onClick={charger} title="Actualiser"
              className="text-gray-300 hover:text-iip-blue p-1 rounded">
              <IconRefresh size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {loading && items.length === 0 && (
          <div className="text-sm text-gray-400 py-8 text-center">Chargement…</div>
        )}

        {!loading && itemsFiltres.length === 0 && (
          <div className="text-sm text-gray-400 py-16 text-center">
            Aucune activité sur les {jours} derniers jours.
          </div>
        )}

        {/* Fil groupé par date */}
        <div className="space-y-6">
          {groupes.map(([groupe, gItems]) => (
            <div key={groupe}>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{groupe}</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2 items-start">
                {gItems.map(item => {
                  const cfg = getConfig(item.type, item.action);
                  const Icon = cfg.icon;
                  return (
                    <div key={item.id}
                      className={`border rounded-xl p-3.5 flex items-start gap-3 transition ${
                        item.lue
                          ? 'border-gray-100 bg-white/60'
                          : 'border-gray-200 bg-white shadow-sm'
                      }`}>

                      {/* Icône colorée */}
                      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
                        style={{ background: cfg.bg }}>
                        <Icon size={16} style={{ color: cfg.color }} />
                      </div>

                      {/* Contenu */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wide mr-2"
                              style={{ color: cfg.color }}>{cfg.label}</span>
                            <span className={`text-sm font-medium ${item.lue ? 'text-gray-500' : 'text-gray-800'}`}>
                              {item.titre}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">{timeAgo(item.date)}</span>
                        </div>

                        {item.detail && (
                          <div className="text-xs text-gray-400 mt-0.5">{item.detail}</div>
                        )}
                        {item.auteur && item.auteur !== 'Lucie' && (
                          <div className="text-xs text-gray-400 mt-0.5">par {item.auteur}</div>
                        )}
                        {item.corps && (
                          <div className="text-xs text-gray-600 mt-1.5 leading-relaxed bg-gray-50 rounded-lg px-3 py-2"
                            dangerouslySetInnerHTML={{ __html: item.corps }} />
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-3 mt-2">
                          {item.lien && (
                            <button onClick={() => { if (!item.lue) marquerLu(item); navigate(item.lien); }}
                              className="text-xs text-iip-blue hover:underline flex items-center gap-0.5">
                              Voir <IconChevronRight size={12} />
                            </button>
                          )}
                          {!item.lue && (
                            <button onClick={() => marquerLu(item)}
                              className="text-xs text-gray-400 hover:text-green-600 flex items-center gap-1">
                              <IconCheck size={12} /> Marquer comme lu
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

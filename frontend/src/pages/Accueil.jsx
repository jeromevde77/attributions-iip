import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAnnee, getUser } from '../lib/api.js';
import { RailLateral } from '../components/ui.jsx';
import {
  IconHome, IconBell, IconActivity, IconCheck, IconChevronRight,
  IconUserPlus, IconClipboardList, IconSettings, IconRefresh,
} from '@tabler/icons-react';

const tok = () => localStorage.getItem('token');

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

export default function Accueil() {
  const [items, setItems]     = useState([]);
  const [nbNonLus, setNbNonLus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre]   = useState('tout'); // 'tout' | 'attribution' | 'recrutement' | 'systeme'
  const [jours, setJours]     = useState(30);
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
        sections={[
          { label: 'Filtre', items: [
            { key: 'tout',         label: `Tout${nbNonLus > 0 ? ` (${nbNonLus})` : ''}`,            icon: IconBell,          actif: filtre === 'tout',         onClick: () => setFiltre('tout') },
            { key: 'attribution',  label: `Attributions${nbAttr > 0 ? ` (${nbAttr})` : ''}`,       icon: IconClipboardList, actif: filtre === 'attribution',  onClick: () => setFiltre('attribution') },
            { key: 'recrutement',  label: `Recrutement${nbRecr > 0 ? ` (${nbRecr})` : ''}`,        icon: IconUserPlus,      actif: filtre === 'recrutement',  onClick: () => setFiltre('recrutement') },
            { key: 'systeme',      label: `Système${nbSys > 0 ? ` (${nbSys})` : ''}`,              icon: IconSettings,      actif: filtre === 'systeme',      onClick: () => setFiltre('systeme') },
          ]},
          { label: 'Période', items: [
            { key: '7',  label: '7 derniers jours',  icon: IconActivity, actif: jours === 7,  onClick: () => setJours(7) },
            { key: '30', label: '30 derniers jours', icon: IconActivity, actif: jours === 30, onClick: () => setJours(30) },
            { key: '90', label: '3 derniers mois',   icon: IconActivity, actif: jours === 90, onClick: () => setJours(90) },
          ]},
        ]}
      />

      <div className="ml-16 p-4 md:p-8 max-w-3xl">

        {/* Bonjour */}
        <div className="mb-8">
          <h1 className="text-3xl font-title text-iip-blue">
            Bonjour, {prenom(u?.nom) || u?.email?.split('@')[0] || 'vous'} !
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {new Date().toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* En-tête du fil */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-iip-blue">
              {filtre === 'tout' ? 'Fil d\'activité' :
               filtre === 'attribution' ? 'Attributions' :
               filtre === 'recrutement' ? 'Recrutement' : 'Système'}
            </h2>
            {nbNonLus > 0 && (
              <span className="text-xs bg-red-500 text-white rounded-full px-2 py-0.5 font-bold">{nbNonLus} non lu{nbNonLus > 1 ? 's' : ''}</span>
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
              <div className="space-y-2">
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

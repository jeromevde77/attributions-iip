import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAnnee, getUser } from '../lib/api.js';
import { RailLateral } from '../components/ui.jsx';
import {
  IconHome, IconBell, IconActivity, IconCheck, IconBriefcase,
  IconUserPlus, IconEdit, IconTrash, IconChevronRight,
} from '@tabler/icons-react';

const tok = () => localStorage.getItem('token');

const TYPE_ICONS = {
  recrutement_attribue: { icon: IconUserPlus, color: '#15803d', bg: '#dcfce7', label: 'Recrutement' },
  attribution_new:      { icon: IconEdit,     color: '#0369a1', bg: '#e0f2fe', label: 'Attribution' },
  default:              { icon: IconBell,     color: '#6b7280', bg: '#f3f4f6', label: 'Info' },
};

const ACTION_STYLE = {
  create: { label: 'Ajout',        cls: 'bg-green-100 text-green-700' },
  update: { label: 'Modification', cls: 'bg-iip-turquoise/10 text-iip-blue' },
  delete: { label: 'Suppression',  cls: 'bg-red-100 text-red-700' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)    return "à l'instant";
  if (diff < 3600)  return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Accueil() {
  const [vue, setVue]           = useState('notifications');
  const [notifs, setNotifs]     = useState([]);
  const [activite, setActivite] = useState(null);
  const [loadingN, setLoadingN] = useState(true);
  const [loadingA, setLoadingA] = useState(true);
  const u = getUser();
  const annee = getAnnee();
  const navigate = useNavigate();

  const chargerNotifs = () => {
    setLoadingN(true);
    fetch('/api/recrutement/notifications', { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json()).then(d => setNotifs(Array.isArray(d) ? d : []))
      .catch(() => setNotifs([])).finally(() => setLoadingN(false));
  };

  const chargerActivite = () => {
    setLoadingA(true);
    api.activiteFeed(14, 100)
      .then(setActivite).catch(() => setActivite(null)).finally(() => setLoadingA(false));
  };

  useEffect(() => { chargerNotifs(); chargerActivite(); }, []);

  const marquerLue = async (id) => {
    await fetch(`/api/recrutement/notifications/${id}/lue`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok()}` },
    });
    chargerNotifs();
  };

  const nbNonLues = notifs.filter(n => !n.lue).length;
  const nbNonTraitees = activite?.non_traitees || 0;

  return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral
        icon={IconHome}
        titre="Accueil"
        sousTitre={`Bonjour${u?.nom ? `, ${u.nom.split(' ')[0]}` : ''} !`}
        sections={[
          { label: 'Vue', items: [
            { key: 'notifications', label: `Notifications${nbNonLues > 0 ? ` (${nbNonLues})` : ''}`,
              icon: IconBell,     actif: vue === 'notifications', onClick: () => setVue('notifications') },
            { key: 'activite',     label: `Activité${nbNonTraitees > 0 ? ` (${nbNonTraitees})` : ''}`,
              icon: IconActivity, actif: vue === 'activite',     onClick: () => setVue('activite') },
          ]},
        ]}
      />

      <div className="ml-16 p-4 md:p-6 max-w-3xl">

        {vue === 'notifications' && (
          <>
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-2xl font-title text-iip-gold">
                Notifications
                {nbNonLues > 0 && (
                  <span className="ml-2 text-sm font-normal text-white bg-red-500 rounded-full px-2 py-0.5">{nbNonLues}</span>
                )}
              </h1>
              {nbNonLues > 0 && (
                <button onClick={async () => {
                  for (const n of notifs.filter(x => !x.lue)) await marquerLue(n.id);
                }} className="text-xs text-gray-400 hover:text-iip-blue">
                  Tout marquer comme lu
                </button>
              )}
            </div>

            {loadingN && <div className="text-sm text-gray-400">Chargement…</div>}

            {!loadingN && notifs.length === 0 && (
              <div className="text-sm text-gray-400 text-center py-16">
                Aucune notification pour l'instant.
              </div>
            )}

            <div className="space-y-2">
              {notifs.map(n => {
                const t = TYPE_ICONS[n.type] || TYPE_ICONS.default;
                const Icon = t.icon;
                return (
                  <div key={n.id}
                    className={`border rounded-xl p-4 flex items-start gap-3 transition ${
                      n.lue ? 'border-gray-200 bg-white opacity-70' : 'border-iip-blue/20 bg-white shadow-sm'
                    }`}>
                    <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ background: t.bg }}>
                      <Icon size={18} style={{ color: t.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-semibold text-sm text-iip-blue">{n.titre}</div>
                        <div className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(n.cree_le)}</div>
                      </div>
                      {n.corps && (
                        <div className="text-sm text-gray-600 mt-1 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: n.corps }} />
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {n.lien && (
                          <button onClick={() => { marquerLue(n.id); navigate(n.lien); }}
                            className="text-xs text-iip-blue hover:underline flex items-center gap-0.5">
                            Voir <IconChevronRight size={12} />
                          </button>
                        )}
                        {!n.lue && (
                          <button onClick={() => marquerLue(n.id)}
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
          </>
        )}

        {vue === 'activite' && (
          <>
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-2xl font-title text-iip-gold">
                Activité récente
                {nbNonTraitees > 0 && (
                  <span className="ml-2 text-sm font-normal text-white bg-iip-blue rounded-full px-2 py-0.5">{nbNonTraitees}</span>
                )}
              </h1>
              <div className="text-xs text-gray-400">14 derniers jours · {activite?.count || 0} modifications</div>
            </div>

            {loadingA && <div className="text-sm text-gray-400">Chargement…</div>}

            {!loadingA && (!activite?.items?.length) && (
              <div className="text-sm text-gray-400 text-center py-16">Aucune activité récente.</div>
            )}

            <div className="space-y-1.5">
              {(activite?.items || []).map(it => {
                const st = ACTION_STYLE[it.action] || ACTION_STYLE.update;
                return (
                  <div key={it.id}
                    className={`border rounded-lg px-4 py-2.5 flex items-center gap-3 transition ${
                      it.traitee ? 'border-gray-100 bg-white opacity-60' : 'border-gray-200 bg-white'
                    }`}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-iip-blue font-medium truncate">
                        {it.nom_cours || `UE ${it.ue_num}`}
                        <span className="font-normal text-gray-500 ml-1">· {it.section}</span>
                      </div>
                      <div className="text-xs text-gray-400">{it.utilisateur_nom}</div>
                    </div>
                    <div className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(it.created_at)}</div>
                    <button onClick={async () => {
                      await api.activiteTraitee(it.id, !it.traitee);
                      chargerActivite();
                    }} title={it.traitee ? 'Marquer non traité' : 'Marquer traité'}
                      className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition ${
                        it.traitee ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-green-400'
                      }`}>
                      {it.traitee && <IconCheck size={11} className="text-green-500" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

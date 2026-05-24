import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/* Libellés et couleurs par type d'action */
const ACTIONS = {
  create: { label: 'Ajout',        cls: 'bg-green-100 text-green-700' },
  update: { label: 'Modification', cls: 'bg-blue-100 text-blue-700' },
  delete: { label: 'Suppression',  cls: 'bg-red-100 text-red-700' },
};

function timeAgo(iso) {
  if (!iso) return '';
  // created_at est en UTC (datetime SQLite) ; on l'affiche en local FR
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityFeed() {
  const [data, setData] = useState(null);   // { depuis, count, items }
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api.activiteFeed().then(setData).catch(() => setData(null));
  }, []);

  // Rien à montrer : pas de données, ou aucune nouveauté
  if (dismissed || !data || !data.items || data.items.length === 0) return null;

  const count = data.count;

  async function marquerVu() {
    try { await api.activiteVu(); } catch { /* sans gravité */ }
    setDismissed(true);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* En-tête de la bannière */}
      <div className="flex items-center justify-between px-4 py-3 bg-iip-gold/5 border-b border-gray-100">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-iip-mauve opacity-60"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-iip-mauve"></span>
          </span>
          <span className="font-semibold text-iip-gold">
            {count} nouveauté{count > 1 ? 's' : ''} depuis votre dernière visite
          </span>
          <span className={`text-iip-gold text-sm transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        </button>
        <button onClick={marquerVu} className="text-xs text-gray-500 hover:text-gray-700 underline">
          Marquer comme lu
        </button>
      </div>

      {/* Liste des modifications */}
      {open && (
        <ul className="divide-y divide-gray-100 max-h-80 overflow-auto">
          {data.items.map(it => {
            const a = ACTIONS[it.action] || { label: it.action, cls: 'bg-gray-100 text-gray-600' };
            return (
              <li key={it.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-gray-50">
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${a.cls}`}>{a.label}</span>
                <div className="flex-1 min-w-0 text-sm">
                  <div className="text-gray-700 truncate">
                    {it.section && <span className="font-medium">{it.section}</span>}
                    {it.ue_num != null && <span className="text-gray-500"> · UE {it.ue_num}</span>}
                    {it.nom_cours && <span className="text-gray-500"> · {it.nom_cours}</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    {it.utilisateur_nom || 'Système'} · {timeAgo(it.created_at)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

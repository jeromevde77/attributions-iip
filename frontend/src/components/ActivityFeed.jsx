import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/* Libellés et couleurs par type d'action */
const ACTIONS = {
  create: { label: 'Ajout',        cls: 'bg-green-100 text-green-700' },
  update: { label: 'Modification', cls: 'bg-iip-turquoise/10 text-iip-blue' },
  delete: { label: 'Suppression',  cls: 'bg-red-100 text-red-700' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ActivityFeed() {
  const [data, setData] = useState(null);     // { jours, count, non_traitees, items }
  const [open, setOpen] = useState(false);
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [busy, setBusy] = useState(null);

  function charger() {
    api.activiteFeed().then(setData).catch(() => setData(null));
  }
  useEffect(() => { charger(); }, []);

  if (!data || !data.items || data.items.length === 0) return null;

  const nonTraitees = data.non_traitees;
  const items = onlyTodo ? data.items.filter(it => !it.traitee) : data.items;

  async function basculer(it) {
    setBusy(it.id);
    const nouveau = !it.traitee;
    setData(d => ({
      ...d,
      items: d.items.map(x => x.id === it.id ? { ...x, traitee: nouveau ? 1 : 0 } : x),
      non_traitees: d.non_traitees + (nouveau ? -1 : 1),
    }));
    try { await api.activiteTraitee(it.id, nouveau); }
    catch { charger(); }
    finally { setBusy(null); }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-iip-gold/5 border-b border-gray-100">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left">
          {nonTraitees > 0 && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-iip-mauve opacity-60"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-iip-mauve"></span>
            </span>
          )}
          <span className="font-semibold text-iip-gold">
            Activité des 7 derniers jours
            {nonTraitees > 0
              ? <span className="ml-1 text-iip-mauve">· {nonTraitees} à vérifier</span>
              : <span className="ml-1 text-green-600 font-normal">· tout est vérifié ✓</span>}
          </span>
          <span className={`text-iip-gold text-sm transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        </button>
        {open && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={onlyTodo} onChange={e => setOnlyTodo(e.target.checked)} className="cursor-pointer" />
            À vérifier seulement
          </label>
        )}
      </div>

      {open && (
        <ul className="divide-y divide-gray-100 max-h-96 overflow-auto">
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-400">Rien à vérifier 🎉</li>
          )}
          {items.map(it => {
            const a = ACTIONS[it.action] || { label: it.action, cls: 'bg-gray-100 text-gray-600' };
            return (
              <li key={it.id} className={`px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 ${it.traitee ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  checked={!!it.traitee}
                  disabled={busy === it.id}
                  onChange={() => basculer(it)}
                  className="cursor-pointer w-4 h-4 flex-shrink-0"
                  title={it.traitee ? 'Marquer comme à vérifier' : 'Marquer comme vérifiée'}
                />
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${a.cls}`}>{a.label}</span>
                <div className="flex-1 min-w-0 text-sm">
                  <div className={`text-gray-700 truncate ${it.traitee ? 'line-through' : ''}`}>
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

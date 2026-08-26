import { useEffect, useState } from 'react';
import { IconArrowBackUp, IconX, IconRefresh, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Annulation des dernières modifications d'attributions.
 *
 * Chaque écriture (création, modification, suppression) enregistre au préalable
 * un instantané complet de la ligne. Restaurer consiste à réécrire cet
 * instantané — y compris pour une attribution supprimée, qui est alors recréée
 * avec son identifiant d'origine.
 */

const ACTIONS = {
  create:   { libelle: 'Création',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  update:   { libelle: 'Modification', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  delete:   { libelle: 'Suppression',  cls: 'bg-red-50 text-red-700 border-red-200' },
  rollback: { libelle: 'Restauration', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
};

export default function AnnulationPanel({ annee, onClose, onRestaure }) {
  const [items, setItems] = useState(null);
  const [actif, setActif] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState(null);

  async function charger() {
    const [h, cfg] = await Promise.all([
      fetch(`/api/historique${annee ? `?annee=${annee}` : ''}&limit=40`.replace('?&', '?'),
        { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
      fetch('/api/historique/config', { headers: authHeaders() })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    setItems(Array.isArray(h) ? h : []);
    setActif(cfg);
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee]);

  async function restaurer(it) {
    const quoi = `UE ${it.ue_num ?? '?'}${it.nom_cours ? ' — ' + it.nom_cours : ''}`;
    if (!window.confirm(
      `Restaurer l'état de ${quoi} tel qu'il était avant cette ${ACTIONS[it.action]?.libelle.toLowerCase() || 'action'} ?\n\n` +
      `Du ${new Date(it.created_at).toLocaleString('fr-BE')}` +
      (it.utilisateur_nom ? ` par ${it.utilisateur_nom}` : ''))) return;

    setEnCours(it.id);
    try {
      const rep = await fetch(`/api/historique/rollback/${it.id}`, {
        method: 'POST', headers: authHeaders(),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'Erreur' }); return; }
      setMessage({ type: 'ok', texte: `Attribution ${j.restored} restaurée.` });
      await charger();
      onRestaure && onRestaure();
    } finally { setEnCours(null); }
  }

  const historiqueInactif = actif && actif.actif === false;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-10">
        <div className="bg-iip-blue rounded-t-2xl px-5 py-4 flex items-start justify-between">
          <div>
            <div className="text-white font-bold text-[15px] flex items-center gap-2">
              <IconArrowBackUp size={18} /> Annuler une modification
            </div>
            <div className="text-blue-200 text-[12px] mt-0.5">
              Dernières écritures sur les attributions{annee ? ` — ${annee}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={charger} className="text-blue-200 hover:text-white" title="Actualiser">
              <IconRefresh size={17} />
            </button>
            <button onClick={onClose} className="text-blue-200 hover:text-white"><IconX size={19} /></button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {historiqueInactif && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[12.5px] text-amber-800">
              <IconAlertTriangle size={15} className="mt-0.5 flex-none" />
              <span>
                L'historique est <b>désactivé</b> : les modifications ne sont plus enregistrées et
                ne pourront pas être annulées. Activez-le dans Configuration → Historique.
              </span>
            </div>
          )}

          {message && (
            <div className={`px-3 py-2 rounded-lg text-[12.5px] flex items-center justify-between ${
              message.type === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'}`}>
              <span>{message.texte}</span>
              <button onClick={() => setMessage(null)} className="opacity-60 ml-3">✕</button>
            </div>
          )}

          {!items ? (
            <div className="text-sm text-slate-400 py-6 text-center">Chargement…</div>
          ) : !items.length ? (
            <div className="text-sm text-slate-400 py-8 text-center border-2 border-dashed rounded-xl">
              Aucune modification enregistrée.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[52vh] overflow-auto">
              {items.map(it => {
                const a = ACTIONS[it.action] || ACTIONS.update;
                return (
                  <div key={it.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60">
                    <span className={`text-[10.5px] px-2 py-0.5 rounded-lg border font-medium flex-none ${a.cls}`}>
                      {a.libelle}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-slate-800 truncate">
                        <b className="text-iip-blue">UE {it.ue_num ?? '—'}</b>
                        {it.nom_cours ? ` · ${it.nom_cours}` : ''}
                        {it.section ? <span className="text-slate-400"> · {it.section}</span> : null}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(it.created_at).toLocaleString('fr-BE')}
                        {it.utilisateur_nom ? ` · ${it.utilisateur_nom}` : ''}
                      </div>
                    </div>
                    {it.action !== 'rollback' && (
                      <button onClick={() => restaurer(it)} disabled={enCours === it.id}
                        className="flex-none flex items-center gap-1 text-[11.5px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-white hover:border-iip-turquoise disabled:opacity-40">
                        <IconArrowBackUp size={13} />
                        {enCours === it.id ? '…' : 'Rétablir l\u2019état antérieur'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-slate-400 border-t pt-3">
            « Rétablir l'état antérieur » réécrit l'attribution telle qu'elle était juste avant
            l'action choisie. Une attribution supprimée est recréée avec son identifiant d'origine.
            La restauration est elle-même enregistrée : elle peut donc être annulée à son tour.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { IconCheck, IconX, IconClock, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Demandes de modification.
 *
 * Un coordinateur encode pour sa section, mais sa saisie n'entre en vigueur
 * qu'après décision. C'est ici qu'on tranche — et le tableau montre l'avant et
 * l'après côte à côte, pour décider sans avoir à ouvrir l'écran d'origine.
 */
const LIBELLE_TYPE = {
  date_ue: "Dates d'unité d'enseignement",
  attribution: 'Attribution',
};

export default function Demandes() {
  const [statut, setStatut] = useState('en_attente');
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    const rep = await fetch(`/api/demandes?statut=${statut}`, { headers: authHeaders() });
    setData(rep.ok ? await rep.json() : { demandes: [] });
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [statut]);

  async function decider(id, action) {
    let motif = null;
    if (action === 'refuser') {
      motif = window.prompt('Motif du refus — il sera visible par le coordinateur :');
      if (motif === null) return;
    }
    setEnCours(true);
    try {
      const rep = await fetch(`/api/demandes/${id}/${action}`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ motif }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      setMessage({ type: 'ok', texte: action === 'valider' ? (j.message || 'Appliqué.') : 'Refusé.' });
      await charger();
    } finally { setEnCours(false); }
  }

  // Champs modifiés, pour montrer l'écart plutôt que l'objet entier
  function ecarts(d) {
    const a = d.avant || {}, b = d.apres || {};
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter(k => String(a[k] ?? '') !== String(b[k] ?? ''))
      .map(k => ({ champ: k, avant: a[k], apres: b[k] }));
  }

  const fr = v => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v))
    ? String(v).slice(0, 10).split('-').reverse().join('/') : (v ?? '—'));

  return (
    <div className="p-5 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-iip-blue">Demandes de modification</h2>
        <p className="text-sm text-slate-500">
          Les saisies des coordinateurs n'entrent en vigueur qu'après décision.
        </p>
      </div>

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${
          message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <div className="flex rounded-lg border border-slate-300 overflow-hidden">
          {[['en_attente', 'En attente'], ['validee', 'Validées'], ['refusee', 'Refusées']].map(([v, l]) => (
            <button key={v} onClick={() => setStatut(v)}
              className={`px-3 py-1.5 text-[12.5px] ${statut === v
                ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
              {l}
            </button>
          ))}
        </div>
        {data?.en_attente > 0 && statut !== 'en_attente' && (
          <span className="text-[12px] text-amber-700 flex items-center gap-1">
            <IconClock size={13} /> {data.en_attente} en attente
          </span>
        )}
      </div>

      {!data ? (
        <div className="py-10 text-center text-sm text-slate-400">Chargement…</div>
      ) : !data.demandes.length ? (
        <div className="py-10 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
          {statut === 'en_attente' ? 'Aucune demande en attente.' : 'Aucune demande.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {data.demandes.map(d => {
            const diff = ecarts(d);
            return (
              <div key={d.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[13px] font-semibold text-iip-blue">{d.libelle}</div>
                    <div className="text-[11px] text-slate-500">
                      {LIBELLE_TYPE[d.type] || d.type}
                      {d.section ? ` · ${d.section}` : ''}
                      {d.annee_scolaire ? ` · ${d.annee_scolaire}` : ''}
                      {' · demandé par '}{d.auteur_nom || '—'}
                      {' le '}{fr(d.cree_le)}
                    </div>
                  </div>
                  {d.statut === 'en_attente' ? (
                    <div className="flex gap-2">
                      <button onClick={() => decider(d.id, 'refuser')} disabled={enCours}
                        className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50">
                        <IconX size={13} /> Refuser
                      </button>
                      <button onClick={() => decider(d.id, 'valider')} disabled={enCours}
                        className="flex items-center gap-1 text-[12px] px-3 py-1 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50">
                        <IconCheck size={13} /> Valider
                      </button>
                    </div>
                  ) : (
                    <div className={`text-[11.5px] ${d.statut === 'validee' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {d.statut === 'validee' ? 'Validée' : 'Refusée'} par {d.decideur_nom || '—'}
                      {d.motif_refus && <span className="block text-slate-500">« {d.motif_refus} »</span>}
                    </div>
                  )}
                </div>

                <div className="px-4 py-2.5">
                  {!diff.length ? (
                    <div className="text-[12px] text-slate-400">Aucun écart détecté.</div>
                  ) : (
                    <table className="text-[12px]">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                          <th className="text-left pr-6 pb-1">Champ</th>
                          <th className="text-left pr-6 pb-1">Actuellement</th>
                          <th className="text-left pb-1">Demandé</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.map(e => (
                          <tr key={e.champ}>
                            <td className="pr-6 py-0.5 text-slate-500">{e.champ.replace(/_/g, ' ')}</td>
                            <td className="pr-6 py-0.5 text-slate-500 line-through">{fr(e.avant)}</td>
                            <td className="py-0.5 font-semibold text-iip-blue">{fr(e.apres)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
        <IconAlertTriangle size={13} className="mt-0.5 flex-none" />
        Tant qu'une demande n'est pas validée, la donnée officielle reste inchangée : la dotation
        et les documents se calculent sur les valeurs en vigueur, jamais sur une proposition.
      </p>
    </div>
  );
}

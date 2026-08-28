import { useEffect, useState } from 'react';
import {
  IconCheck, IconAlertTriangle, IconCopy, IconCalendarEvent, IconScale,
} from '@tabler/icons-react';
import Assistant from '../components/Assistant.jsx';
import { authHeaders } from '../lib/api.js';

/**
 * Rentrée — ouverture d'une année scolaire.
 *
 * Deux natures d'échéances, deux traitements :
 *  · les échéances légales sont décrites une fois dans le référentiel des
 *    types (règle de date + base légale) : si décret et circulaire n'ont pas
 *    changé, on les reconduit d'un clic ;
 *  · les événements de l'établissement ne se déduisent d'aucun texte : on
 *    reporte ceux de l'an dernier, décalés d'un an, à ajuster.
 */
export default function Rentree({ annee }) {
  const [veille, setVeille] = useState(null);
  const [evenements, setEvenements] = useState([]);
  const [message, setMessage] = useState(null);
  const [detailOuvert, setDetailOuvert] = useState(false);

  const anneePrecedente = (() => {
    if (!annee) return '';
    const [a1, a2] = annee.split('-').map(Number);
    return `${a1 - 1}-${a2 - 1}`;
  })();

  async function charger() {
    if (!annee) return;
    const [v, e] = await Promise.all([
      fetch(`/api/rentree/veille?annee=${annee}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : null),
      fetch(`/api/rentree/evenements?annee=${annee}`, { headers: authHeaders() }).then(r => r.ok ? r.json() : []),
    ]);
    setVeille(v);
    setEvenements(Array.isArray(e) ? e : []);
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee]);

  async function confirmerVeille(sansChangement) {
    if (!sansChangement) {
      setDetailOuvert(true);
      setMessage({ type: 'info', texte: "Ajustez les types concernés dans Configuration → Référentiel des échéances, puis confirmez-les ici." });
      return;
    }
    const rep = await fetch('/api/rentree/veille', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ annee, sans_changement: true }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'Erreur' }); return; }
    setMessage({ type: 'ok', texte: `${j.confirmes} type(s) d'échéance reconduits pour ${annee}` });
    await charger();
  }

  async function confirmerType(id) {
    const rep = await fetch('/api/rentree/veille', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ annee, types_confirmes: [id] }),
    });
    if (rep.ok) await charger();
  }

  async function instancier() {
    const rep = await fetch('/api/echeancier/instancier', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'Erreur' }); return; }
    setMessage({ type: 'ok', texte: `Échéances générées pour ${annee}` });
    await charger();
  }

  async function reporterEvenements() {
    if (!window.confirm(`Reporter les événements de ${anneePrecedente} vers ${annee} ?\nLes dates sont décalées de 52 semaines — un samedi reste un samedi — et restent à ajuster.`)) return;
    const rep = await fetch('/api/rentree/reporter-evenements', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ annee, annee_source: anneePrecedente }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error || 'Erreur' }); return; }
    setMessage({
      type: j.reportes ? 'ok' : 'info',
      texte: j.reportes
        ? `${j.reportes} événement(s) reporté(s) depuis ${anneePrecedente}${j.ignores ? ` · ${j.ignores} déjà présent(s)` : ''}`
        : `Aucun événement à reporter depuis ${anneePrecedente}`,
    });
    await charger();
  }

  return (
    <div className="p-5 space-y-4 max-w-none">
      <div>
        <h2 className="text-xl font-semibold text-iip-blue">Rentrée {annee}</h2>
        <p className="text-sm text-slate-500">
          Ouvrir l'année : reconduire ce qui est réglementaire, reporter ce qui est propre à l'établissement.
        </p>
      </div>

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${
          message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : message.type === 'err' ? 'bg-red-50 text-red-800 border border-red-200'
          : 'bg-sky-50 text-sky-800 border border-sky-200'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}

      {/* ── Veille réglementaire ── */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <IconScale size={16} className="text-iip-blue" />
          <span className="font-semibold text-iip-blue text-[13.5px]">Veille réglementaire</span>
          {veille && (
            <span className="text-[11.5px] text-slate-500 ml-1">
              {veille.revus}/{veille.total} type(s) confirmé(s)
            </span>
          )}
        </div>

        <div className="p-4">
          {!veille ? (
            <div className="text-sm text-slate-400">Chargement…</div>
          ) : veille.confirme ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-[13px] text-emerald-700">
                <IconCheck size={16} /> Les échéances légales sont confirmées pour {annee}.
              </div>
              <button onClick={instancier}
                className="px-3 py-1.5 text-sm bg-iip-blue text-white font-semibold rounded-lg">
                Générer les échéances de l'année
              </button>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-slate-700 mb-1">
                Le décret ou la circulaire de rentrée ont-ils modifié les échéances légales ?
              </p>
              <p className="text-[11.5px] text-slate-500 mb-3">
                Les dates sont calculées à partir des règles enregistrées une fois pour toutes.
                Si rien n'a changé, elles se reconduisent sans ressaisie.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => confirmerVeille(true)}
                  className="px-3 py-1.5 text-sm bg-iip-turquoise text-white font-semibold rounded-lg">
                  Rien n'a changé — reconduire
                </button>
                <button onClick={() => confirmerVeille(false)}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                  Un texte a changé — revoir les types
                </button>
                {veille.a_revoir?.length > 0 && (
                  <button onClick={() => setDetailOuvert(o => !o)}
                    className="px-3 py-1.5 text-sm text-slate-500">
                    {detailOuvert ? 'Masquer' : `Voir les ${veille.a_revoir.length} type(s)`}
                  </button>
                )}
              </div>

              {detailOuvert && veille.a_revoir?.length > 0 && (
                <div className="mt-3 border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {veille.a_revoir.map(t => (
                    <div key={t.id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-slate-800">{t.libelle}</div>
                        <div className="text-[11px] text-slate-500">
                          {t.base_legale || 'Sans base légale renseignée'}
                          {t.derniere_revue && ` · dernière revue ${t.derniere_revue}`}
                        </div>
                      </div>
                      <button onClick={() => confirmerType(t.id)}
                        className="flex-none text-[11.5px] px-2 py-1 border border-slate-300 rounded-lg hover:bg-slate-50">
                        Inchangé
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Événements de l'établissement ── */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <IconCalendarEvent size={16} className="text-iip-blue" />
            <span className="font-semibold text-iip-blue text-[13.5px]">Événements de l'établissement</span>
            <span className="text-[11.5px] text-slate-500 ml-1">{evenements.length} pour {annee}</span>
          </div>
          <button onClick={reporterEvenements}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
            <IconCopy size={14} /> Reporter depuis {anneePrecedente}
          </button>
        </div>

        <div className="p-4">
          {!evenements.length ? (
            <div className="text-center py-5 text-slate-400 text-sm border-2 border-dashed rounded-xl">
              Aucun événement pour {annee} — portes ouvertes, délibérations, sorties, exercice d'évacuation.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-slate-400 border-b">
                  <th className="py-2 text-left w-28">Date</th>
                  <th className="py-2 text-left">Événement</th>
                  <th className="py-2 text-left w-32">Type</th>
                  <th className="py-2 text-left w-32">Lieu</th>
                </tr>
              </thead>
              <tbody>
                {evenements.map(e => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 text-[12px] text-slate-600">{e.date_debut}</td>
                    <td className="py-2 text-[12.5px] text-slate-800">{e.titre}</td>
                    <td className="py-2 text-[11px] text-slate-400">{e.type}</td>
                    <td className="py-2 text-[11px] text-slate-400">{e.lieu || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11px] text-slate-400 mt-3">
            Le report décale les dates de 52 semaines : un samedi reste un samedi. Vérifiez-les
            ensuite, notamment les délibérations, qui dépendent des dates de fin d'UE.
          </p>
        </div>
      </div>

      {/* ── Checklist d'ouverture ── */}
      {annee && <Assistant cle="annee" params={{ annee }} />}
    </div>
  );
}

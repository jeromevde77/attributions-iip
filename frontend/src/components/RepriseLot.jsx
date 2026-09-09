import { useEffect, useState } from 'react';
import { IconX, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * REPRENDRE TOUT UN CLASSEUR — une section, ou les unités qu'on coche.
 *
 * DISPOSITIF TRANSITOIRE, le temps que les années d'Excel soient reprises.
 * Ces délibérations ONT EU LIEU : le Conseil s'est réuni, il a décidé, et le
 * classeur en garde la trace. Les rejouer unité par unité, c'est vingt-sept
 * fois le même geste pour recopier un travail fait.
 *
 * TROIS CHOSES SE DÉCIDENT ICI, et une seule est anodine.
 *
 * 1. LES UNITÉS. On les coche ; celles qui n'ont rien d'encodé sont montrées
 *    mais grisées — il n'y a rien à y reprendre.
 * 2. LA DATE DE SÉANCE. Le classeur ne dit pas quand le Conseil s'est réuni :
 *    c'est vous qui la déclarez, et elle ira telle quelle au procès-verbal.
 *    Elle fait courir le délai de recours — ce n'est pas une formalité.
 * 3. LA CLÔTURE. Clore, c'est constater le quorum. Les présences de ces
 *    séances-là n'ont jamais été encodées : les cocher toutes, c'est écrire
 *    que chacun y était. L'écran le dit, et le serveur refuse de le faire
 *    sans que ce soit demandé pour soi-même.
 */
export default function RepriseLot({ annee, section = null, onClose, onFini }) {
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [choisies, setChoisies] = useState(() => new Set());
  const [sec, setSec] = useState(section);
  const [date, setDate] = useState('');
  const [heure, setHeure] = useState('');
  const [vDate, setVDate] = useState('');
  const [vHeure, setVHeure] = useState('');
  const [vLocal, setVLocal] = useState('');
  const [clore, setClore] = useState(false);
  const [presents, setPresents] = useState(false);
  const [apercu, setApercu] = useState(null);
  const [fait, setFait] = useState(null);

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/reprise-lot'
        + `?annee=${encodeURIComponent(annee)}${sec ? `&section=${encodeURIComponent(sec)}` : ''}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setEtat(j);
      // Tout ce qui a quelque chose à reprendre est coché d'emblée : c'est le
      // geste attendu, et décocher est plus rapide que tout cocher.
      setChoisies(new Set(j.unites
        .filter(u => !u.cloturee && (u.concordants + u.divergents) > 0)
        .map(u => u.ue_num)));
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee, sec]);

  async function envoyer(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/reprise-lot', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, session: 1, ue_nums: [...choisies], simulation,
          date_seance: date, heure_seance: heure || undefined,
          visite_date: vDate || undefined, visite_heure: vHeure || undefined,
          visite_local: vLocal || undefined,
          cloturer: clore, presences_tous: presents,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.detail || j.error); return; }
      if (simulation) setApercu(j);
      else { setFait(j); setApercu(null); await charger(); onFini?.(); }
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const unites = etat?.unites || [];
  const reprenables = unites.filter(u => !u.cloturee && (u.concordants + u.divergents) > 0);
  const basculer = n => setChoisies(s => {
    const c = new Set(s); if (c.has(n)) c.delete(n); else c.add(n); return c;
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-3"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[980px] mt-6
                      max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue">
              Reprendre les délibérations du classeur — en lot
            </h3>
            <p className="text-[12px] text-slate-500">
              Année <b>{annee}</b> · première session. Les décisions viennent du classeur et
              sont reprises telles quelles ; Lucie y ajoute la cote qu'elle calcule et les
              cours à représenter, puis pose la date que vous fixez.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12.5px] text-red-800 flex items-start gap-2">
              <IconAlertTriangle size={15} className="mt-px shrink-0" /> {erreur}
            </div>
          )}

          {fait && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200
                            text-[12.5px] text-emerald-900">
              <b>{fait.reprises} unité(s) reprises</b>, {fait.etudiants} décisions écrites,
              {' '}{fait.closes} séance(s) close(s) au {fait.date_seance}.
              {!!fait.ignorees?.length && (
                <div className="mt-1 text-[11.5px] text-emerald-800">
                  Non reprises : {fait.ignorees.map(i => `UE${i.ue_num} (${i.motif})`).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* ── Le choix des unités ─────────────────────────────────────── */}
          {!etat ? (
            <div className="py-8 text-center text-[12.5px] text-slate-400">Lecture du classeur…</div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] text-slate-500">Section :</span>
                <button onClick={() => setSec(null)}
                  className={`px-2 py-1 rounded-lg border text-[12px] ${!sec
                    ? 'border-iip-blue text-iip-blue font-semibold' : 'border-slate-300 text-slate-600'}`}>
                  toutes
                </button>
                {(etat.sections || []).map(s => (
                  <button key={s} onClick={() => setSec(s)}
                    className={`px-2 py-1 rounded-lg border text-[12px] ${sec === s
                      ? 'border-iip-blue text-iip-blue font-semibold' : 'border-slate-300 text-slate-600'}`}>
                    {s}
                  </button>
                ))}
                <span className="flex-1" />
                <button onClick={() => setChoisies(new Set(reprenables.map(u => u.ue_num)))}
                  className="text-[12px] text-iip-blue underline">tout cocher</button>
                <button onClick={() => setChoisies(new Set())}
                  className="text-[12px] text-slate-500 underline">tout décocher</button>
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100
                              max-h-[34vh] overflow-y-auto">
                {!unites.length && (
                  <div className="px-3 py-6 text-center text-[12.5px] text-slate-400">
                    Aucune unité pour cette année.
                  </div>
                )}
                {unites.map(u => {
                  const rien = (u.concordants + u.divergents) === 0;
                  const bloquee = rien || u.cloturee;
                  return (
                    <label key={u.ue_num}
                      className={`px-3 py-1.5 flex items-center gap-2 text-[12.5px]
                        ${bloquee ? 'opacity-45' : 'cursor-pointer hover:bg-slate-50'}`}>
                      <input type="checkbox" disabled={bloquee}
                        checked={choisies.has(u.ue_num)} onChange={() => basculer(u.ue_num)} />
                      <span className="w-16 tabular-nums text-slate-500">UE{u.ue_num}</span>
                      <span className="flex-1 truncate">{u.ue_nom}</span>
                      <span className="text-[11px] text-slate-400 w-14">{u.section}</span>
                      <span className="text-[11.5px] text-slate-600 w-40 text-right">
                        {u.cloturee ? 'séance close'
                          : rien ? 'rien d’encodé'
                          : `${u.concordants + u.divergents} décision(s)`}
                      </span>
                      <span className={`text-[11.5px] w-24 text-right ${u.divergents
                        ? 'text-amber-700 font-semibold' : 'text-slate-300'}`}>
                        {u.divergents ? `${u.divergents} écart(s)` : '—'}
                      </span>
                      <span className={`text-[11.5px] w-28 text-right ${u.sans_decision
                        ? 'text-slate-500' : 'text-slate-300'}`}>
                        {u.sans_decision ? `${u.sans_decision} sans décision` : '—'}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* ── La date, qui ira au procès-verbal ─────────────────────── */}
              <div className="px-3 py-3 rounded-xl border border-slate-200 space-y-2">
                <div className="text-[12.5px] font-semibold text-iip-blue">
                  La date de la séance
                </div>
                <p className="text-[11.5px] text-slate-500">
                  Le classeur ne dit pas quand le Conseil s'est réuni. La date que vous
                  fixez ici figurera sur tous les procès-verbaux et toutes les notifications
                  des unités cochées, et c'est d'elle que court le délai de recours
                  (RGE art. 87-91).
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-[11.5px] text-slate-600">
                    Date de séance
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                      className="block mt-0.5 px-2 py-1 border border-slate-300 rounded-lg text-[12.5px]" />
                  </label>
                  <label className="text-[11.5px] text-slate-600">
                    Heure
                    <input type="time" value={heure} onChange={e => setHeure(e.target.value)}
                      className="block mt-0.5 px-2 py-1 border border-slate-300 rounded-lg text-[12.5px]" />
                  </label>
                  <label className="text-[11.5px] text-slate-600">
                    Visite des copies — date
                    <input type="date" value={vDate} onChange={e => setVDate(e.target.value)}
                      className="block mt-0.5 px-2 py-1 border border-slate-300 rounded-lg text-[12.5px]" />
                  </label>
                  <label className="text-[11.5px] text-slate-600">
                    Heure
                    <input type="time" value={vHeure} onChange={e => setVHeure(e.target.value)}
                      className="block mt-0.5 px-2 py-1 border border-slate-300 rounded-lg text-[12.5px]" />
                  </label>
                  <label className="text-[11.5px] text-slate-600 flex-1 min-w-[160px]">
                    Local
                    <input value={vLocal} onChange={e => setVLocal(e.target.value)}
                      placeholder="ex. secrétariat, 2e étage"
                      className="block mt-0.5 w-full px-2 py-1 border border-slate-300
                                 rounded-lg text-[12.5px]" />
                  </label>
                </div>
              </div>

              {/* ── La clôture, et ce qu'elle engage ──────────────────────── */}
              <div className="px-3 py-3 rounded-xl border border-amber-200 bg-amber-50 space-y-2">
                <label className="flex items-start gap-2 text-[12.5px] text-amber-900">
                  <input type="checkbox" checked={clore} className="mt-0.5"
                    onChange={e => { setClore(e.target.checked); if (!e.target.checked) setPresents(false); }} />
                  <span>
                    <b>Clôturer les séances</b> — sans quoi les attestations et notifications
                    ne peuvent pas sortir.
                  </span>
                </label>
                {clore && (
                  <label className="flex items-start gap-2 text-[12.5px] text-amber-900 pl-6">
                    <input type="checkbox" checked={presents} className="mt-0.5"
                      onChange={e => setPresents(e.target.checked)} />
                    <span>
                      J'inscris <b>tous les membres du Conseil comme présents</b>. Les présences
                      de ces séances n'ont jamais été encodées ; la clôture doit pourtant
                      constater le quorum des deux tiers (RGE art. 25 §1). Le procès-verbal
                      dira donc que chacun y était — à corriger unité par unité si ce n'est
                      pas le cas.
                    </span>
                  </label>
                )}
              </div>

              {apercu && (
                <div className="px-3 py-2 rounded-xl border border-sky-200 bg-sky-50
                                text-[12px] text-sky-900">
                  <b>Simulation — rien n'est écrit.</b> {apercu.reprises} unité(s),
                  {' '}{apercu.etudiants} décisions
                  {clore ? `, ${apercu.unites.filter(u => u.close).length} séance(s) seraient closes` : ''}.
                  {apercu.unites.some(u => u.quorum_manquant) && (
                    <div className="mt-1 text-amber-800">
                      Quorum non atteint (aucun professeur attribué ?) sur :
                      {' '}{apercu.unites.filter(u => u.quorum_manquant)
                        .map(u => `UE${u.ue_num}`).join(', ')} — elles resteront ouvertes.
                    </div>
                  )}
                  {!!apercu.ignorees?.length && (
                    <div className="mt-1">
                      Ignorées : {apercu.ignorees.map(i => `UE${i.ue_num} (${i.motif})`).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3">
          <span className="text-[12px] text-slate-500">
            {choisies.size} unité(s) cochée(s) sur {reprenables.length} reprenables
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
              Fermer
            </button>
            <button disabled={enCours || !choisies.size || !date} onClick={() => envoyer(true)}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-sky-400
                         text-sky-800 font-semibold disabled:opacity-40">
              Simuler
            </button>
            <button disabled={enCours || !choisies.size || !date} onClick={() => envoyer(false)}
              className="px-4 py-2 text-[13px] rounded-lg bg-sky-700 text-white
                         font-semibold disabled:opacity-40">
              Reprendre {choisies.size} unité(s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

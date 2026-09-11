import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconCalendarStats, IconChevronRight, IconChevronDown, IconAlertTriangle,
  IconCheck, IconLock, IconWand, IconSearch,
} from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { PageHeader, RailLateral } from './ui.jsx';

/**
 * LE CALENDRIER DES SESSIONS — une section, une page.
 *
 * Ces dates se posaient une par une, chacune au fond de l'écran de
 * délibération de son unité : pour fixer le calendrier d'une section il
 * fallait ouvrir trente délibérations, alors qu'une délibération est un acte
 * de Conseil et non un formulaire de dates.
 *
 * Or ces dates se posent EN GROS : la visite des copies est le même jour pour
 * toute la section, la délibération tient sur deux après-midi, et une salle
 * qui change les change toutes. La page les montre donc ensemble, et permet
 * d'en appliquer une à tout ce qui est coché.
 *
 * Deux niveaux, parce que la réalité en a deux : l'UNITÉ porte la
 * délibération et la visite des copies — le Conseil siège par unité —, le
 * COURS porte les épreuves, parce que deux professeurs ne font pas passer la
 * leur le même jour.
 */


/** Une case de saisie sobre, qui se remonte quand la donnée change. */
function Case({ valeur, onPoser, type = 'date', large, titre, bloque }) {
  return (
    <input
      type={type} defaultValue={valeur ?? ''} key={String(valeur ?? '')}
      title={titre} disabled={bloque}
      onBlur={e => {
        const v = e.target.value;
        if (String(v) !== String(valeur ?? '')) onPoser(v);
      }}
      className={`px-1.5 py-1 text-[12px] border border-slate-200 rounded
                  focus:border-iip-blue focus:outline-none disabled:bg-slate-50
                  disabled:text-slate-400 ${large ? 'w-28' : 'w-[122px]'}`} />
  );
}

const CHAMPS_LOT = [
  { cle: 'date_seance', label: 'Date de délibération', type: 'date', portee: 'ue' },
  { cle: 'heure_seance', label: 'Heure de délibération', type: 'time', portee: 'ue' },
  { cle: 'visite_date', label: 'Visite des copies — date', type: 'date', portee: 'ue' },
  { cle: 'visite_heure', label: 'Visite des copies — heure', type: 'time', portee: 'ue' },
  { cle: 'visite_local', label: 'Visite des copies — local', type: 'text', portee: 'ue' },
  { cle: 's1_date', label: 'Épreuve 1re session — date', type: 'date', portee: 'cours' },
  { cle: 's1_heure', label: 'Épreuve 1re session — heure', type: 'time', portee: 'cours' },
  { cle: 's1_local', label: 'Épreuve 1re session — local', type: 'text', portee: 'cours' },
  { cle: 's2_date', label: '2e session — date', type: 'date', portee: 'cours' },
  { cle: 's2_heure', label: '2e session — heure', type: 'time', portee: 'cours' },
  { cle: 's2_local', label: '2e session — local', type: 'text', portee: 'cours' },
];

export default function CalendrierSessions() {
  const annee = getAnnee();
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(null);
  const [session, setSession] = useState(1);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [dernier, setDernier] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [deplie, setDeplie] = useState(() => new Set());
  const [coches, setCoches] = useState(() => new Set());
  // La demande de motif, quand une séance close est touchée : on ne l'invente
  // pas, et l'on ne l'impose pas non plus d'avance.
  const [aMotiver, setAMotiver] = useState(null);   // { charge, detail, closes }
  const [motif, setMotif] = useState('');
  // Le geste de masse, replié tant qu'on ne s'en sert pas.
  const [lot, setLot] = useState({ ouvert: false, champ: 'visite_date', valeur: '' });

  useEffect(() => {
    (async () => {
      try {
        const rep = await fetch(`/api/acquis/deliberation/plan?annee=${encodeURIComponent(annee)}`,
          { headers: authHeaders() });
        const j = await rep.json();
        if (rep.ok) {
          setSections(j.sections || []);
          setSection(s => s || j.sections?.[0]?.section || null);
        }
      } catch { /* la page vaut sans le sommaire */ }
    })();
  }, [annee]);

  const charger = useCallback(async () => {
    if (!section) return;
    setErreur(null);
    try {
      const rep = await fetch(`/api/calendrier?annee=${encodeURIComponent(annee)}`
        + `&section=${encodeURIComponent(section)}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setData(j);
    } catch (e) { setErreur(e.message); }
  }, [annee, section]);
  useEffect(() => { charger(); }, [charger]);

  /**
   * POSER — une case ou deux cents, c'est la même écriture.
   *
   * Si le serveur oppose une séance close, on ne perd pas la saisie : on la
   * garde en attente et l'on demande le motif, puis on rejoue exactement le
   * même envoi. Redemander de tout retaper après un refus, c'est punir
   * l'utilisateur d'une règle qu'il ne connaissait pas.
   */
  const envoyer = useCallback(async (charge, motifEcrit) => {
    setErreur(null);
    try {
      const rep = await fetch('/api/calendrier', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, ...charge, motif: motifEcrit || undefined }),
      });
      const j = await rep.json().catch(() => ({}));
      if (rep.status === 409 && j.closes) {
        setAMotiver({ charge, detail: j.detail, closes: j.closes });
        return false;
      }
      if (!rep.ok) throw new Error(j.error || 'Enregistrement refusé.');
      setDernier(Date.now());
      await charger();
      return true;
    } catch (e) { setErreur(e.message); return false; }
  }, [annee, charger]);

  const poserSeance = (ueNum, ses, champ, valeur) =>
    envoyer({ seances: [{ ue_num: ueNum, session: ses, [champ]: valeur }] });
  const poserEpreuve = (ueNum, coursCode, ses, champ, valeur) =>
    envoyer({ epreuves: [{ ue_num: ueNum, cours_code: coursCode, session: ses, [champ]: valeur }] });

  const ues = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const l = data?.ues || [];
    if (!q) return l;
    return l.filter(u => `${u.ue_num} ${u.ue_nom || ''}`.toLowerCase().includes(q)
      || (u.cours || []).some(c => `${c.cours_code} ${c.cours_nom || ''}`.toLowerCase().includes(q)));
  }, [data, recherche]);

  const basculer = (set, v) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    return n;
  };

  /** LE GESTE DE MASSE : une valeur, tout ce qui est coché. */
  async function appliquerLot() {
    const def = CHAMPS_LOT.find(c => c.cle === lot.champ);
    if (!def) return;
    const cibles = (data?.ues || []).filter(u => coches.has(u.ue_num));
    if (!cibles.length) { setErreur('Cochez d’abord les unités à traiter.'); return; }
    const v = lot.valeur === '' ? null : lot.valeur;
    if (def.portee === 'ue') {
      await envoyer({ seances: cibles.map(u => ({
        ue_num: u.ue_num, session, [def.cle]: v })) });
    } else {
      const ses = def.cle.startsWith('s2') ? 2 : 1;
      await envoyer({ epreuves: cibles.flatMap(u => (u.cours || []).map(c => ({
        ue_num: u.ue_num, cours_code: c.cours_code, session: ses, [def.cle]: v }))) });
    }
  }

  const champLot = CHAMPS_LOT.find(c => c.cle === lot.champ);

  return (
    <div>
      <RailLateral sections={[{
        label: 'Sections',
        items: (sections || []).map(s => ({
          key: s.section, label: s.section, actif: section === s.section,
          onClick: () => { setSection(s.section); setCoches(new Set()); },
        })),
      }, {
        label: 'Session délibérée',
        items: [1, 2].map(s => ({
          key: `s${s}`, label: s === 1 ? '1re session' : '2e session',
          actif: session === s, onClick: () => setSession(s),
        })),
      }]} />

      <div className="gouttiere-rail p-5 pt-4">
        <PageHeader icon={IconCalendarStats} titre="Calendrier des sessions"
          sous={`Épreuves, visite des copies et délibérations — ${section || '…'} · ${annee}`} />

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="relative">
            <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Unité ou cours…"
              className="pl-7 pr-2 py-1.5 text-[12.5px] border border-slate-300 rounded-lg w-56" />
          </div>
          <button onClick={() => setLot(l => ({ ...l, ouvert: !l.ouvert }))}
            className={`px-3 py-1.5 text-[12.5px] rounded-lg border inline-flex items-center gap-1.5
              ${lot.ouvert ? 'bg-iip-blue text-white border-iip-blue'
              : 'border-slate-300 text-slate-600'}`}>
            <IconWand size={14} /> Poser en une fois
          </button>
          <span className="text-[12px] text-slate-500">
            {coches.size ? `${coches.size} unité(s) cochée(s)` : 'aucune unité cochée'}
          </span>
          <button onClick={() => setCoches(new Set((data?.ues || []).map(u => u.ue_num)))}
            className="text-[12px] text-iip-blue hover:underline">tout cocher</button>
          {coches.size > 0 && (
            <button onClick={() => setCoches(new Set())}
              className="text-[12px] text-slate-500 hover:underline">tout décocher</button>
          )}
          {dernier && !erreur && (
            <span className="text-[12px] text-emerald-700 inline-flex items-center gap-1">
              <IconCheck size={12} /> enregistré
            </span>
          )}
        </div>

        {lot.ouvert && (
          <div className="mb-3 px-3 py-2.5 rounded-lg border border-iip-blue/25 bg-iip-blue/5
                          flex flex-wrap items-end gap-2">
            <label className="block">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Ce qu'on pose</div>
              <select value={lot.champ} onChange={e => setLot(l => ({ ...l, champ: e.target.value, valeur: '' }))}
                className="px-2 py-1.5 text-[12.5px] border border-slate-300 rounded-lg bg-white">
                {CHAMPS_LOT.map(c => <option key={c.cle} value={c.cle}>{c.label}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">Valeur</div>
              <input type={champLot?.type || 'text'} value={lot.valeur}
                onChange={e => setLot(l => ({ ...l, valeur: e.target.value }))}
                className="px-2 py-1.5 text-[12.5px] border border-slate-300 rounded-lg w-44" />
            </label>
            <button onClick={appliquerLot}
              className="px-4 py-1.5 text-[12.5px] rounded-lg bg-iip-blue text-white font-semibold">
              Appliquer aux {coches.size} unité(s)
            </button>
            <p className="text-[11.5px] text-slate-600 basis-full">
              {champLot?.portee === 'cours'
                ? 'Cette date appartient au cours : elle sera posée sur TOUS les cours des unités cochées.'
                : `Posée sur l'unité, pour la ${session === 1 ? '1re' : '2e'} session délibérée.`}
              {' '}Une valeur vide efface ce qui s'y trouvait.
            </p>
          </div>
        )}

        {erreur && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200
                          text-[12.5px] text-red-800 flex items-start gap-1.5">
            <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
          </div>
        )}

        {!data ? (
          <div className="py-10 text-center text-slate-400 text-sm">Chargement…</div>
        ) : !ues.length ? (
          <div className="py-10 text-center text-slate-500 text-sm">
            {recherche ? 'Aucune unité ne correspond.' : 'Aucune unité dans cette section.'}
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="w-8" />
                  <th className="text-left px-2 py-2 font-semibold">Unité</th>
                  <th className="text-left px-2 py-2 font-semibold">Délibération</th>
                  <th className="text-left px-2 py-2 font-semibold">Heure</th>
                  <th className="text-left px-2 py-2 font-semibold">Visite des copies</th>
                  <th className="text-left px-2 py-2 font-semibold">Heure</th>
                  <th className="text-left px-2 py-2 font-semibold">Local</th>
                </tr>
              </thead>
              <tbody>
                {ues.map(u => {
                  const s = session === 2 ? u.seance_s2 : u.seance_s1;
                  const close = !!s?.cloturee;
                  const ouvert = deplie.has(u.ue_num);
                  return (
                    <tr key={u.ue_num} className="align-top">
                      <td colSpan={7} className="p-0">
                        <div className="border-t border-slate-100">
                          <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50/60">
                            <input type="checkbox" checked={coches.has(u.ue_num)}
                              onChange={() => setCoches(c => basculer(c, u.ue_num))}
                              className="w-3.5 h-3.5 accent-iip-blue flex-none" />
                            <button onClick={() => setDeplie(d => basculer(d, u.ue_num))}
                              className="flex items-center gap-1 min-w-[240px] text-left flex-none">
                              {ouvert ? <IconChevronDown size={14} className="text-slate-400" />
                                : <IconChevronRight size={14} className="text-slate-400" />}
                              <span className="font-semibold text-iip-blue">{u.ue_num}</span>
                              <span className="text-slate-600 truncate max-w-[200px]">{u.ue_nom}</span>
                              <span className="text-[10px] text-slate-400">
                                {(u.cours || []).length} cours
                              </span>
                            </button>
                            {/* UNE SÉANCE CLOSE SE DIT, ET NE SE BLOQUE PAS :
                                la date se corrige, mais en écrivant pourquoi —
                                c'est ce que la fenêtre demandera. */}
                            {close && (
                              <span title="Séance clôturée : la corriger demandera un motif écrit"
                                className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50
                                           border border-amber-200 rounded px-1 py-px inline-flex
                                           items-center gap-1 flex-none">
                                <IconLock size={10} /> close
                              </span>
                            )}
                            <div className="flex items-center gap-1.5 ml-auto flex-none">
                              <Case valeur={s?.date_seance} titre="Date de la délibération"
                                onPoser={v => poserSeance(u.ue_num, session, 'date_seance', v)} />
                              <Case valeur={s?.heure_seance} type="time" large
                                titre="Heure de la délibération"
                                onPoser={v => poserSeance(u.ue_num, session, 'heure_seance', v)} />
                              <span className="w-px h-5 bg-slate-200" />
                              <Case valeur={s?.visite_date} titre="Visite des copies — date"
                                onPoser={v => poserSeance(u.ue_num, session, 'visite_date', v)} />
                              <Case valeur={s?.visite_heure} type="time" large
                                titre="Visite des copies — heure"
                                onPoser={v => poserSeance(u.ue_num, session, 'visite_heure', v)} />
                              <Case valeur={s?.visite_local} type="text" large
                                titre="Visite des copies — local"
                                onPoser={v => poserSeance(u.ue_num, session, 'visite_local', v)} />
                            </div>
                          </div>

                          {ouvert && (
                            <div className="bg-slate-50/70 border-t border-slate-100 px-2 py-2">
                              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1
                                              text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                                <div>Cours</div>
                                <div className="text-center">Épreuve 1re session</div>
                                <div className="text-center">2e session</div>
                              </div>
                              {(u.cours || []).map(c => (
                                <div key={c.cours_code}
                                  className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 items-center py-0.5">
                                  <div className="min-w-0">
                                    <span className="text-slate-700">{c.cours_nom || c.cours_code}</span>
                                    <span className="text-slate-400 ml-1.5">{c.cours_code}</span>
                                    {c.professeurs && (
                                      <span className="text-[11px] text-iip-blue/80 italic ml-1.5
                                                       truncate" title={c.professeurs}>
                                        {c.professeurs}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Case valeur={c.s1?.s1_date} titre="Épreuve de 1re session — date"
                                      onPoser={v => poserEpreuve(u.ue_num, c.cours_code, 1, 's1_date', v)} />
                                    <Case valeur={c.s1?.s1_heure} type="time" large titre="Heure"
                                      onPoser={v => poserEpreuve(u.ue_num, c.cours_code, 1, 's1_heure', v)} />
                                    <Case valeur={c.s1?.s1_local} type="text" large titre="Local"
                                      onPoser={v => poserEpreuve(u.ue_num, c.cours_code, 1, 's1_local', v)} />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Case valeur={c.s2?.s2_date} titre="2e session — date"
                                      onPoser={v => poserEpreuve(u.ue_num, c.cours_code, 2, 's2_date', v)} />
                                    <Case valeur={c.s2?.s2_heure} type="time" large titre="Heure"
                                      onPoser={v => poserEpreuve(u.ue_num, c.cours_code, 2, 's2_heure', v)} />
                                    <Case valeur={c.s2?.s2_local} type="text" large titre="Local"
                                      onPoser={v => poserEpreuve(u.ue_num, c.cours_code, 2, 's2_local', v)} />
                                  </div>
                                </div>
                              ))}
                              {!(u.cours || []).length && (
                                <div className="text-[12px] text-slate-400 py-1">
                                  Aucun cours déclaré pour cette unité cette année.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-2 text-[11.5px] text-slate-500">
          Chaque date s'enregistre seule, en quittant la case. La délibération et la visite des
          copies appartiennent à l'unité ; les épreuves, au cours — deux professeurs ne font pas
          passer la leur le même jour. Les dates fixées ici sont celles que reprennent les
          notifications et les annexes.
        </p>
      </div>

      {/* LE MOTIF, DEMANDÉ APRÈS COUP ET NON D'AVANCE. La saisie est conservée :
          on la rejoue telle quelle une fois la phrase écrite. */}
      {aMotiver && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target === e.currentTarget && setAMotiver(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5">
            <h3 className="text-[15px] font-semibold text-iip-blue mb-1">
              Corriger une date déjà au procès-verbal
            </h3>
            <p className="text-[12.5px] text-slate-600 mb-3">{aMotiver.detail}</p>
            <div className="text-[12px] text-slate-500 mb-2">
              Unité(s) concernée(s) :{' '}
              {aMotiver.closes.map(c => `${c.ue_num} (S${c.session})`).join(', ')}
            </div>
            <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3}
              placeholder="Ex. : la salle A12 était occupée, la visite des copies a eu lieu en B04."
              className="w-full px-3 py-2 text-[12.5px] border border-slate-300 rounded-lg
                         focus:border-iip-blue focus:outline-none" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { setAMotiver(null); setMotif(''); }}
                className="px-4 py-2 text-[12.5px] text-slate-600">Annuler</button>
              <button disabled={motif.trim().length < 5}
                onClick={async () => {
                  const ok = await envoyer(aMotiver.charge, motif.trim());
                  if (ok) { setAMotiver(null); setMotif(''); }
                }}
                className="px-4 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white
                           font-semibold disabled:opacity-40">
                Corriger et conserver le motif
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

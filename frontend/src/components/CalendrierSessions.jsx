import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconCalendarStats, IconChevronRight, IconChevronDown, IconAlertTriangle,
  IconLock, IconWand, IconSearch, IconLayoutRows,
} from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { PageHeader, RailLateral } from './ui.jsx';

/**
 * LE CALENDRIER DES SESSIONS — une section, une page, les deux sessions.
 *
 * Ces dates se posaient une par une, chacune au fond de l'écran de
 * délibération de son unité : pour fixer le calendrier d'une section il
 * fallait ouvrir trente délibérations, alors qu'une délibération est un acte
 * de Conseil et non un formulaire de dates.
 *
 * Deux niveaux, parce que la réalité en a deux. L'UNITÉ porte la
 * délibération : le Conseil siège par unité, et il n'y a qu'une décision.
 * Le COURS porte l'épreuve ET la visite des copies — on vient consulter la
 * copie d'une épreuve, et deux professeurs qui n'interrogent pas le même jour
 * ne montrent pas les copies le même jour. La visite était rangée sur
 * l'unité ; elle descend ici au cours, en gardant le repli sur l'unité pour
 * les notifications déjà imprimées.
 *
 * Et les deux sessions sont L'UNE SOUS L'AUTRE, non l'une après l'autre :
 * juin se règle en regardant septembre, et une page qu'il faut quitter pour
 * comparer deux dates n'est pas un calendrier.
 */

/** Une case de saisie sobre, qui se remonte quand la donnée change. */
function Case({ valeur, onPoser, type = 'date', classe = 'w-[118px]', titre, bloque }) {
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
                  disabled:text-slate-400 ${classe}`} />
  );
}

/**
 * LE LOCAL SE CHOISIT, IL NE SE TAPE PLUS.
 *
 * « P5 102 » devenait « p5 102 » puis « P5-102 », et trois écritures du même
 * lieu se retrouvaient sur trois notifications. La liste des locaux de
 * l'Institut est en base : on y puise, groupée par type, avec le nombre de
 * places — parce que la question devant une salle est « est-elle assez
 * grande ». Une valeur ancienne hors liste reste affichée plutôt que d'être
 * silencieusement effacée.
 */
function ChoixLocal({ valeur, onPoser, locaux, bloque }) {
  const connus = useMemo(() => new Set((locaux || []).map(l => l.nom)), [locaux]);
  const parType = useMemo(() => {
    const g = {};
    for (const l of (locaux || [])) (g[l.type || 'Autre'] ||= []).push(l);
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [locaux]);
  return (
    <select value={valeur ?? ''} disabled={bloque}
      onChange={e => onPoser(e.target.value)}
      className="px-1 py-1 text-[12px] border border-slate-200 rounded w-[118px]
                 focus:border-iip-blue focus:outline-none disabled:bg-slate-50">
      <option value="">local…</option>
      {valeur && !connus.has(valeur) && <option value={valeur}>{valeur} (hors liste)</option>}
      {parType.map(([type, liste]) => (
        <optgroup key={type} label={type}>
          {liste.map(l => (
            <option key={l.id ?? l.nom} value={l.nom}>
              {l.nom}{l.places ? ` · ${l.places} pl.` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Les champs posables en une fois, par session. */
function champsLot(ses) {
  const p = ses === 2 ? 's2' : 's1';
  return [
    { cle: 'date_seance', label: 'Délibération — date', type: 'date', portee: 'ue' },
    { cle: 'heure_seance', label: 'Délibération — heure', type: 'time', portee: 'ue' },
    { cle: `${p}_date`, label: 'Épreuve — date', type: 'date', portee: 'cours' },
    { cle: `${p}_heure`, label: 'Épreuve — heure', type: 'time', portee: 'cours' },
    { cle: `${p}_local`, label: 'Épreuve — local', type: 'local', portee: 'cours' },
    { cle: `${p}_visite_date`, label: 'Visite des copies — date', type: 'date', portee: 'cours' },
    { cle: `${p}_visite_heure`, label: 'Visite des copies — heure', type: 'time', portee: 'cours' },
    { cle: `${p}_visite_local`, label: 'Visite des copies — local', type: 'local', portee: 'cours' },
  ];
}

/**
 * UN BLOC DE SESSION. Bleu pour juin, gris pour septembre : la couleur dit de
 * quelle session on parle avant qu'on ait lu l'en-tête, et c'est ce qui évite
 * de poser une date de septembre dans le calendrier de juin.
 */
function BlocSession({
  ses, ues, locaux, deplie, setDeplie, coches, setCoches,
  poserSeance, poserEpreuve, appliquerLot,
}) {
  const [lot, setLot] = useState({ champ: `s${ses}_date`, valeur: '' });
  const champs = useMemo(() => champsLot(ses), [ses]);
  const def = champs.find(c => c.cle === lot.champ) || champs[0];
  const bleu = ses === 1;
  const cadre = bleu ? 'border-iip-blue/30 bg-iip-blue/[0.035]' : 'border-slate-300 bg-slate-50';
  const titre = bleu ? 'text-iip-blue' : 'text-slate-600';
  const seanceDe = u => (ses === 1 ? u.seance_s1 : u.seance_s2) || {};
  const coursDe = (c) => (ses === 1 ? c.s1 : c.s2) || {};
  const p = ses === 2 ? 's2' : 's1';

  return (
    <section className={`border rounded-xl p-3 mb-4 ${cadre}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <h3 className={`text-[14px] font-medium ${titre}`}>
          {bleu ? 'Première session' : 'Seconde session'}
        </h3>
        <span className="flex-1" />
        {def.type === 'local'
          ? <ChoixLocal valeur={lot.valeur} locaux={locaux}
              onPoser={v => setLot(l => ({ ...l, valeur: v }))} />
          : <input type={def.type} value={lot.valeur}
              onChange={e => setLot(l => ({ ...l, valeur: e.target.value }))}
              className="px-2 py-1 text-[12px] border border-slate-300 rounded w-[130px]" />}
        <select value={lot.champ}
          onChange={e => setLot(l => ({ ...l, champ: e.target.value, valeur: '' }))}
          className="px-2 py-1 text-[12px] border border-slate-300 rounded">
          {champs.map(c => <option key={c.cle} value={c.cle}>{c.label}</option>)}
        </select>
        <button onClick={() => appliquerLot(ses, def, lot.valeur)}
          className="px-2.5 py-1 text-[12px] rounded border border-slate-300
                     text-slate-700 hover:bg-white inline-flex items-center gap-1">
          <IconWand size={13} /> Poser sur {coches.size} cochée{coches.size > 1 ? 's' : ''}
        </button>
      </div>

      <table className="w-full text-[12.5px] table-fixed">
        <colgroup>
          <col className="w-[34%]" /><col className="w-[22%]" />
          <col className="w-[22%]" /><col className="w-[22%]" />
        </colgroup>
        <thead>
          <tr className={`text-[11.5px] ${bleu ? 'text-iip-blue/80' : 'text-slate-500'}`}>
            <th className="text-left font-normal py-1 px-1">Unité · cours</th>
            <th className="font-normal py-1 px-1">Épreuve</th>
            <th className="font-normal py-1 px-1">Visite des copies</th>
            <th className="font-normal py-1 px-1">Délibération</th>
          </tr>
        </thead>
        <tbody>
          {ues.map(u => {
            const s = seanceDe(u);
            const ouvert = deplie.has(u.ue_num);
            const close = !!s.cloturee;
            return [
              <tr key={`u${u.ue_num}`} className="border-t border-slate-200">
                <td className="py-1.5 px-1">
                  <input type="checkbox" checked={coches.has(u.ue_num)}
                    onChange={() => setCoches(c => {
                      const n = new Set(c);
                      n.has(u.ue_num) ? n.delete(u.ue_num) : n.add(u.ue_num);
                      return n;
                    })}
                    className="align-middle mr-1.5" />
                  <button onClick={() => setDeplie(d => {
                    const n = new Set(d);
                    n.has(u.ue_num) ? n.delete(u.ue_num) : n.add(u.ue_num);
                    return n;
                  })} className="align-middle text-slate-400 hover:text-slate-700"
                    aria-label={ouvert ? 'Replier' : 'Déplier'}>
                    {ouvert ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  </button>
                  <span className="font-medium ml-0.5">{u.ue_num}</span>{' '}
                  <span className="text-slate-500">{u.ue_nom}</span>
                  {close && (
                    <span className="ml-1.5 px-1.5 py-px text-[10.5px] rounded bg-amber-50
                                     text-amber-700 inline-flex items-center gap-1">
                      <IconLock size={11} /> close
                    </span>
                  )}
                </td>
                <td className="text-center text-[11px] text-slate-400">par cours</td>
                <td className="text-center text-[11px] text-slate-400">par cours</td>
                <td className="py-1 px-1">
                  <Case valeur={s.date_seance} classe="w-full"
                    onPoser={v => poserSeance(u.ue_num, ses, 'date_seance', v)} />
                  <Case valeur={s.heure_seance} type="time" classe="w-full mt-1"
                    onPoser={v => poserSeance(u.ue_num, ses, 'heure_seance', v)} />
                </td>
              </tr>,
              ...(ouvert ? (u.cours || []).map(c => {
                const d = coursDe(c);
                return (
                  <tr key={`c${u.ue_num}-${c.cours_code}`}>
                    <td className="py-1 px-1 pl-7 text-slate-500 text-[12px]">
                      {c.cours_code} {c.cours_nom}
                      {c.professeurs && (
                        <span className="block text-[10.5px] text-slate-400">{c.professeurs}</span>
                      )}
                    </td>
                    <td className="py-1 px-1">
                      <Case valeur={d[`${p}_date`]} classe="w-full"
                        onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_date`, v)} />
                      <div className="flex gap-1 mt-1">
                        <Case valeur={d[`${p}_heure`]} type="time" classe="w-1/2"
                          onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_heure`, v)} />
                        <ChoixLocal valeur={d[`${p}_local`]} locaux={locaux}
                          onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_local`, v)} />
                      </div>
                    </td>
                    <td className="py-1 px-1">
                      <Case valeur={d[`${p}_visite_date`]} classe="w-full"
                        onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_visite_date`, v)} />
                      <div className="flex gap-1 mt-1">
                        <Case valeur={d[`${p}_visite_heure`]} type="time" classe="w-1/2"
                          onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_visite_heure`, v)} />
                        <ChoixLocal valeur={d[`${p}_visite_local`]} locaux={locaux}
                          onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_visite_local`, v)} />
                      </div>
                    </td>
                    <td />
                  </tr>
                );
              }) : []),
            ];
          })}
        </tbody>
      </table>
      {!ues.length && (
        <p className="text-[12.5px] text-slate-400 py-3">Aucune unité pour cette section.</p>
      )}
    </section>
  );
}

export default function CalendrierSessions() {
  const annee = getAnnee();
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(null);
  const [locaux, setLocaux] = useState([]);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [deplie, setDeplie] = useState(() => new Set());
  const [coches, setCoches] = useState(() => new Set());
  // La demande de motif, quand une séance close est touchée : on ne l'invente
  // pas, et l'on ne l'impose pas non plus d'avance.
  const [aMotiver, setAMotiver] = useState(null);
  const [motif, setMotif] = useState('');

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
      try {
        const rep = await fetch('/api/locaux', { headers: authHeaders() });
        const j = await rep.json();
        if (rep.ok && Array.isArray(j)) setLocaux(j);
      } catch { /* on retombe sur une saisie vide, non sur un écran mort */ }
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
      await charger();
      return true;
    } catch (e) { setErreur(e.message); return false; }
  }, [annee, charger]);

  const poserSeance = (ueNum, ses, champ, valeur) =>
    envoyer({ seances: [{ ue_num: ueNum, session: ses, [champ]: valeur }] });
  const poserEpreuve = (ueNum, coursCode, ses, champ, valeur) =>
    envoyer({ epreuves: [{ ue_num: ueNum, cours_code: coursCode, session: ses, [champ]: valeur }] });

  /** LE GESTE DE MASSE : une valeur, tout ce qui est coché. */
  async function appliquerLot(ses, def, valeur) {
    const cibles = (data?.ues || []).filter(u => coches.has(u.ue_num));
    if (!cibles.length) { setErreur('Cochez d’abord les unités à traiter.'); return; }
    const v = valeur === '' ? null : valeur;
    if (def.portee === 'ue') {
      await envoyer({ seances: cibles.map(u => ({ ue_num: u.ue_num, session: ses, [def.cle]: v })) });
    } else {
      await envoyer({ epreuves: cibles.flatMap(u => (u.cours || []).map(c => ({
        ue_num: u.ue_num, cours_code: c.cours_code, session: ses, [def.cle]: v }))) });
    }
  }

  const ues = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const l = data?.ues || [];
    if (!q) return l;
    return l.filter(u => `${u.ue_num} ${u.ue_nom || ''}`.toLowerCase().includes(q)
      || (u.cours || []).some(c => `${c.cours_code} ${c.cours_nom || ''}`.toLowerCase().includes(q)));
  }, [data, recherche]);

  const toutDeplie = ues.length > 0 && ues.every(u => deplie.has(u.ue_num));

  return (
    <div>
      <RailLateral sections={[{
        label: 'Sections',
        items: (sections || []).map(s => ({
          key: s.section, label: s.section, actif: section === s.section,
          onClick: () => { setSection(s.section); setCoches(new Set()); },
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
          <button onClick={() => setDeplie(toutDeplie ? new Set() : new Set(ues.map(u => u.ue_num)))}
            className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300
                       text-slate-600 inline-flex items-center gap-1.5">
            <IconLayoutRows size={14} /> {toutDeplie ? 'Tout replier' : 'Tout déplier'}
          </button>
          <button onClick={() => setCoches(coches.size ? new Set() : new Set(ues.map(u => u.ue_num)))}
            className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
            {coches.size ? 'Tout décocher' : 'Tout cocher'}
          </button>
        </div>

        {erreur && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 text-[12.5px]
                          inline-flex items-center gap-2">
            <IconAlertTriangle size={15} /> {erreur}
          </div>
        )}

        {[1, 2].map(ses => (
          <BlocSession key={ses} ses={ses} ues={ues} locaux={locaux}
            deplie={deplie} setDeplie={setDeplie}
            coches={coches} setCoches={setCoches}
            poserSeance={poserSeance} poserEpreuve={poserEpreuve}
            appliquerLot={appliquerLot} />
        ))}

        {/* CORRIGER UNE SÉANCE CLOSE : jamais en silence. Le motif se conserve
            avec l'avant et l'après, parce que c'est ce qu'un recours viendra
            chercher. Corriger une date ne rouvre pas la délibération. */}
        {aMotiver && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-5 w-[520px] max-w-[92vw]">
              <h3 className="text-[15px] font-medium mb-1">Séance close</h3>
              <p className="text-[12.5px] text-slate-600 mb-3">
                {aMotiver.detail || `Cette modification touche ${aMotiver.closes?.length || 0}
                 séance(s) déjà closes.`} La séance reste close ; seule la date change,
                et la correction est conservée avec son motif.
              </p>
              <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3}
                placeholder="Pourquoi cette date est-elle corrigée ?"
                className="w-full px-2 py-1.5 text-[12.5px] border border-slate-300 rounded-lg mb-3" />
              <div className="flex justify-end gap-2">
                <button onClick={() => { setAMotiver(null); setMotif(''); }}
                  className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300">
                  Annuler
                </button>
                <button
                  onClick={async () => {
                    if (!motif.trim()) { setErreur('Un motif écrit est nécessaire.'); return; }
                    const ok = await envoyer(aMotiver.charge, motif.trim());
                    if (ok) { setAMotiver(null); setMotif(''); }
                  }}
                  className="px-3 py-1.5 text-[12.5px] rounded-lg bg-iip-blue text-white">
                  Corriger
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

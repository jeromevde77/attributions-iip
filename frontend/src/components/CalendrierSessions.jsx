import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconChevronRight, IconChevronDown, IconAlertTriangle,
  IconLock, IconWand, IconSearch, IconLayoutRows, IconCalendarEvent, IconGavel, IconWriting, IconEye,
} from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { PageHeader, Fenetre, Chevron, PastilleEtat, OuvrirEditions } from './ui.jsx';
import PassagesExamen from './PassagesExamen.jsx';

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
  const vide = valeur == null || valeur === '';
  return (
    <input
      type={type} defaultValue={valeur ?? ''} key={String(valeur ?? '')}
      title={titre} disabled={bloque}
      onBlur={e => {
        const v = e.target.value;
        if (String(v) !== String(valeur ?? '')) onPoser(v);
      }}
      // UN CHAMP VIDE DOIT SE VOIR VIDE. Certains navigateurs peuplent un
      // champ date vierge de la date du jour, en gris : on lit alors une
      // section entière délibérée aujourd'hui, là où la base ne porte rien.
      // Le fond pâle dit « rien de posé » sans dépendre du navigateur.
      className={`controle !h-8 px-2 text-second ${vide ? 'text-slate-400' : ''} ${classe}`} />
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
function ChoixLocal({ valeur, onPoser, locaux, bloque, classe = 'w-[118px]' }) {
  const connus = useMemo(() => new Set((locaux || []).map(l => l.nom)), [locaux]);
  const parType = useMemo(() => {
    const g = {};
    for (const l of (locaux || [])) (g[l.type || 'Autre'] ||= []).push(l);
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  }, [locaux]);
  return (
    <select value={valeur ?? ''} disabled={bloque}
      onChange={e => onPoser(e.target.value)}
      className={`px-1 py-1 text-second border border-slate-200 rounded
                 focus:border-iip-blue focus:outline-none disabled:bg-slate-50 ${classe}`}>
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
 * POSER EN GROS, en vue côte à côte. La session s'y choisit explicitement :
 * la couleur ne suffit plus à dire où la valeur ira, puisque la barre est
 * commune aux deux.
 */
function BarrePose({ locaux, nbCoches, appliquerLot }) {
  const [ses, setSes] = useState(1);
  const champs = useMemo(() => champsLot(ses), [ses]);
  const [cle, setCle] = useState('date_seance');
  const [valeur, setValeur] = useState('');
  const def = champs.find(c => c.cle === cle) || champs[0];
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-slate-50
                    border border-slate-200">
      <span className="text-sm text-slate-500">Poser</span>
      <select value={ses} onChange={e => {
        const n = Number(e.target.value); setSes(n);
        setCle(c => c.replace(/^s[12]/, n === 2 ? 's2' : 's1'));
      }} className="px-2 py-1 text-second border border-slate-300 rounded">
        <option value={1}>1re session</option>
        <option value={2}>2e session</option>
      </select>
      {def.type === 'local'
        ? <ChoixLocal valeur={valeur} locaux={locaux} onPoser={setValeur} classe="w-[150px]" />
        : <input type={def.type} value={valeur} onChange={e => setValeur(e.target.value)}
            className="px-2 py-1 text-second border border-slate-300 rounded w-[130px]" />}
      <select value={cle} onChange={e => { setCle(e.target.value); setValeur(''); }}
        className="px-2 py-1 text-second border border-slate-300 rounded">
        {champs.map(c => <option key={c.cle} value={c.cle}>{c.label}</option>)}
      </select>
      <button onClick={() => appliquerLot(ses, def, valeur)}
        className="px-2.5 py-1 text-second rounded border border-slate-300 text-slate-700
                   hover:bg-white inline-flex items-center gap-1">
        <IconWand size={13} /> Poser sur {nbCoches} cochée{nbCoches > 1 ? 's' : ''}
      </button>
    </div>
  );
}

/* ── LES DEUX VUES (3.5.248, Charles : « il faut revoir cette mise en page, c'est daté et peu clair » ; maquettes A et B,
   tranché : « les deux, en bascule »). PAR UNITÉ — une ligne par unité, l'état de chaque session en pastilles (délibération,
   épreuves datées sur le nombre de cours), un clic ouvre le détail où l'on pose les dates ; PAR DATE — la frise des jours, ce
   qui s'y passe (épreuves, visites, délibérations), et en bas ce qui reste à dater. Plus de cases vides grisées : ce qui n'est
   pas posé se dit « à poser ». ── */
const jourCourt = d => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' }) : '');
const hm = h => (h ? String(h).slice(0, 5) : '');
const etatSession = (u, ses) => {
  const sc = (ses === 1 ? u.seance_s1 : u.seance_s2) || {};
  const p = ses === 2 ? 's2' : 's1';
  const cours = u.cours || [];
  const datees = cours.filter(c => ((ses === 1 ? c.s1 : c.s2) || {})[`${p}_date`]).length;
  return { sc, datees, total: cours.length };
};

function PastillesSession({ u, ses }) {
  const { sc, datees, total } = etatSession(u, ses);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sc.date_seance
        ? <PastilleEtat etat="reussi" title="Délibération">Délib. {jourCourt(sc.date_seance)}{sc.heure_seance ? ` · ${hm(sc.heure_seance)}` : ''}</PastilleEtat>
        : <PastilleEtat etat="neutre">délibération à poser</PastilleEtat>}
      {!!sc.cloturee && <PastilleEtat etat="neutre"><IconLock size={11} /> close</PastilleEtat>}
      {total > 0 && <PastilleEtat etat={datees === total ? 'reussi' : datees ? 'surveiller' : 'neutre'} title="Épreuves datées sur le nombre de cours">
        épreuves {datees}/{total}</PastilleEtat>}
    </div>
  );
}

function Champ({ label, children }) {
  return <label className="block min-w-0"><span className="block text-mention text-slate-500 mb-0.5">{label}</span><div className="flex gap-1">{children}</div></label>;
}

function DetailSession({ u, ses, locaux, poserSeance, poserEpreuve, onPassages }) {
  const { sc } = etatSession(u, ses);
  const p = ses === 2 ? 's2' : 's1';
  return (
    <div className="min-w-0 space-y-2">
      <div className="text-sm font-semibold text-iip-texte flex items-center gap-2">{ses === 1 ? 'Première session' : 'Seconde session'}
        {!!sc.cloturee && <PastilleEtat etat="neutre"><IconLock size={11} /> séance close</PastilleEtat>}</div>
      <Champ label="Délibération">
        <Case valeur={sc.date_seance} classe="flex-1 min-w-0" onPoser={v => poserSeance(u.ue_num, ses, 'date_seance', v)} />
        <Case valeur={sc.heure_seance} type="time" classe="w-[84px] shrink-0" onPoser={v => poserSeance(u.ue_num, ses, 'heure_seance', v)} />
      </Champ>
      {(u.cours || []).map(c => {
        const d = (ses === 1 ? c.s1 : c.s2) || {};
        const nbP = ses === 1 ? c.passages_s1 : c.passages_s2;
        return (
          <div key={c.cours_code} className="border-t border-slate-100 pt-2">
            <div className="text-second font-medium flex items-center gap-2">
              <span className="min-w-0 flex-1">{c.cours_code} {c.cours_nom}{c.professeurs && <span className="font-normal text-slate-500"> · {c.professeurs}</span>}</span>
              {/* PLUSIEURS PASSAGES (3.5.284) : groupes, parties — chacun sa date et sa liste. */}
              <button type="button" className="text-iip-blue underline font-normal shrink-0" onClick={() => onPassages(u, c, ses)}>
                {nbP ? `${nbP} passages` : 'Plusieurs passages ?'}</button>
              {/* LA LISTE DE CETTE ÉPREUVE (3.5.296) : le centre d'impression, onglet Examens, réglé sur ce jour et cette épreuve. */}
              {d[`${p}_date`] && (
                <OuvrirEditions taille="petit" titre="Listes et pièces de cette épreuve — centre d’impression"
                  ongletInitial="etudiants" familleInitiale="examens"
                  perimetre={{ examen: { section: u.section || '', session: ses, du: String(d[`${p}_date`]).slice(0, 10),
                    au: String(d[`${p}_date`]).slice(0, 10), cle: `${ses}|${u.ue_num}|${c.cours_code || ''}` } }} />)}
            </div>
            {nbP > 0 && <div className="text-mention text-slate-500">L’épreuve a {nbP} passages : leurs dates se règlent dans « {nbP} passages ». La date ci-dessous est le premier.</div>}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Champ label="Épreuve">
                <Case valeur={d[`${p}_date`]} classe="flex-1 min-w-0" onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_date`, v)} />
                <Case valeur={d[`${p}_heure`]} type="time" classe="w-[84px] shrink-0" onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_heure`, v)} />
              </Champ>
              <Champ label="Visite des copies">
                <Case valeur={d[`${p}_visite_date`]} classe="flex-1 min-w-0" onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_visite_date`, v)} />
                <Case valeur={d[`${p}_visite_heure`]} type="time" classe="w-[84px] shrink-0" onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_visite_heure`, v)} />
              </Champ>
              <ChoixLocal valeur={d[`${p}_local`]} locaux={locaux} classe="w-full" onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_local`, v)} />
              <ChoixLocal valeur={d[`${p}_visite_local`]} locaux={locaux} classe="w-full" onPoser={v => poserEpreuve(u.ue_num, c.cours_code, ses, `${p}_visite_local`, v)} />
            </div>
          </div>);
      })}
      {!(u.cours || []).length && <p className="m-0 text-second text-slate-500">Aucun cours pour cette unité.</p>}
    </div>
  );
}

function VueUnites({ ues, locaux, deplie, setDeplie, coches, setCoches, poserSeance, poserEpreuve, onPassages }) {
  const basculer = (set, k) => set(x => { const n = new Set(x); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return (
    <div className="carte overflow-hidden">
      <div className="entete-carte grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 text-second font-semibold text-slate-600">
        <span>Unité</span><span>Première session</span><span>Seconde session</span>
      </div>
      {ues.map(u => {
        const ouvert = deplie.has(u.ue_num);
        return (
          <div key={u.ue_num} className="border-t border-slate-100 first:border-t-0">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 items-center px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
              onClick={() => basculer(setDeplie, u.ue_num)}>
              <div className="flex items-center gap-2 min-w-0">
                <input type="checkbox" checked={coches.has(u.ue_num)} onClick={e => e.stopPropagation()} onChange={() => basculer(setCoches, u.ue_num)} aria-label={`Cocher l'UE ${u.ue_num}`} />
                <Chevron ouvert={ouvert} size={14} />
                <span className="min-w-0"><b className="font-semibold">{u.ue_num}</b> <span className="text-slate-700">{u.ue_nom}</span>
                  <span className="block text-mention text-slate-500">{(u.cours || []).length} cours</span></span>
              </div>
              <PastillesSession u={u} ses={1} />
              <PastillesSession u={u} ses={2} />
            </div>
            {ouvert && (
              <div className="grid md:grid-cols-2 gap-6 px-4 pb-4 pt-1 bg-slate-50/60">
                <DetailSession u={u} ses={1} locaux={locaux} poserSeance={poserSeance} poserEpreuve={poserEpreuve} onPassages={onPassages} />
                <DetailSession u={u} ses={2} locaux={locaux} poserSeance={poserSeance} poserEpreuve={poserEpreuve} onPassages={onPassages} />
              </div>)}
          </div>);
      })}
      {!ues.length && <p className="text-sm text-slate-400 p-4 m-0">Aucune unité pour cette section.</p>}
    </div>
  );
}

function VueFrise({ ues, onOuvrir }) {
  const [ses, setSes] = useState(1);
  const p = ses === 2 ? 's2' : 's1';
  const evts = [], aDater = [];
  for (const u of ues) {
    const sc = (ses === 1 ? u.seance_s1 : u.seance_s2) || {};
    if (sc.date_seance) evts.push({ d: String(sc.date_seance).slice(0, 10), h: hm(sc.heure_seance), type: 'delib', u, texte: `Délibération — UE ${u.ue_num} ${u.ue_nom || ''}`, close: !!sc.cloturee });
    else aDater.push({ u, texte: `UE ${u.ue_num} — délibération` });
    for (const c of u.cours || []) {
      const d = (ses === 1 ? c.s1 : c.s2) || {};
      if (d[`${p}_date`]) evts.push({ d: String(d[`${p}_date`]).slice(0, 10), h: hm(d[`${p}_heure`]), type: 'epreuve', u, texte: `Épreuve — ${c.cours_code} ${c.cours_nom || ''}`, local: d[`${p}_local`] });
      else if (ses === 1) aDater.push({ u, texte: `${c.cours_code} — épreuve` });
      if (d[`${p}_visite_date`]) evts.push({ d: String(d[`${p}_visite_date`]).slice(0, 10), h: hm(d[`${p}_visite_heure`]), type: 'visite', u, texte: `Visite des copies — ${c.cours_code}`, local: d[`${p}_visite_local`] });
    }
  }
  const parJour = new Map();
  for (const e of evts.sort((a, b) => a.d.localeCompare(b.d) || a.h.localeCompare(b.h))) (parJour.get(e.d) || parJour.set(e.d, []).get(e.d)).push(e);
  const ICONE = { delib: IconGavel, epreuve: IconWriting, visite: IconEye };
  const ETAT = { delib: 'reussi', epreuve: 'disponible', visite: 'neutre' };
  return (
    <div className="space-y-3">
      <div className="flex border-b border-slate-200">
        {[1, 2].map(n => <button key={n} type="button" onClick={() => setSes(n)} className={`onglet-page ${ses === n ? 'onglet-page-actif' : ''}`}>{n === 1 ? 'Première session' : 'Seconde session'}</button>)}
      </div>
      {!parJour.size && <p className="text-sm text-slate-500 m-0">Rien n’est encore daté pour cette session.</p>}
      {[...parJour].map(([d, l]) => (
        <div key={d} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
          <div className="text-second font-semibold text-slate-600 pt-2 capitalize">{jourCourt(d)}</div>
          <div className="carte divide-y divide-slate-100">
            {l.map((e, i) => {
              const I = ICONE[e.type];
              return (
                <button key={i} type="button" onClick={() => onOuvrir(e.u.ue_num)} className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
                  <span className="w-12 shrink-0 text-second text-slate-500">{e.h || '—'}</span>
                  <I size={16} className="shrink-0" style={{ color: `var(--c-${ETAT[e.type] === 'reussi' ? 'reussi' : ETAT[e.type] === 'disponible' ? 'disponible' : 'principal'})` }} />
                  <span className="flex-1 min-w-0 text-sm">{e.texte}</span>
                  {e.local && <span className="text-second text-slate-500">{e.local}</span>}
                  {e.close && <PastilleEtat etat="neutre"><IconLock size={11} /> close</PastilleEtat>}
                </button>);
            })}
          </div>
        </div>))}
      {aDater.length > 0 && (
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
          <div className="text-second font-semibold text-slate-500 pt-2">À dater</div>
          <div className="carte px-3 py-2 flex flex-wrap gap-1.5">
            {aDater.map((x, i) => <button key={i} type="button" onClick={() => onOuvrir(x.u.ue_num)} className="pastille-etat" data-etat="neutre" title="Ouvrir pour poser la date">{x.texte}</button>)}
          </div>
        </div>)}
    </div>
  );
}

export default function CalendrierSessions({ sansTitre = false } = {}) {
  const annee = getAnnee();
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(null);
  const [locaux, setLocaux] = useState([]);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [deplie, setDeplie] = useState(() => new Set());
  const [coches, setCoches] = useState(() => new Set());
  // La disposition se choisit : côte à côte pour lire les deux sessions d'une
  // unité d'un regard, empilée pour saisir au large. Le choix se retient.
  const [dispo, setDispo] = useState(() => { try { return localStorage.getItem('calendrier.vue') === 'date' ? 'date' : 'unite'; } catch { return 'unite'; } });
  const choisirVue = v => { setDispo(v); try { localStorage.setItem('calendrier.vue', v); } catch { /* */ } };
  // La demande de motif, quand une séance close est touchée : on ne l'invente
  // pas, et l'on ne l'impose pas non plus d'avance.
  const [aMotiver, setAMotiver] = useState(null);
  const [passages, setPassages] = useState(null);   // { u, c, ses } — la fenêtre des passages d'un examen (3.5.284)
  const [motif, setMotif] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // TOUTES LES UNITÉS DE L'ANNÉE, inscrites ou non : on pose des dates avant
        // que les inscriptions soient encodées, sinon on ne planifie qu'après coup.
        const rep = await fetch(
          `/api/acquis/deliberation/plan?toutes=1&annee=${encodeURIComponent(annee)}`,
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
      {/* LE CHOIX DE LA SECTION EST UN FILTRE, PAS UNE RUBRIQUE.
          Il occupait la colonne d'icônes du rail, une entrée par section et
          sans icône : replié, on ne voyait qu'une file de points identiques
          qu'il fallait survoler un par un — et la liste s'allonge à chaque
          section ouverte. Une icône se mérite. Le choix redescend dans la barre
          de filtres de l'écran, avec la recherche et les autres réglages, là où
          l'œil le cherche. */}
      {/* Plus de gouttière ici : le centre de planification la pose pour les
          trois faces. Deux gouttières superposées décalaient l'écran. */}
      <div className="p-5 pt-4">
        {/* Un titre ne s'écrit qu'une fois : sous les onglets de planification,
            l'onglet nomme déjà la face qu'on regarde. */}
        {!sansTitre && (
          <PageHeader titre="Calendrier des sessions"
            sous={`Épreuves, visite des copies et délibérations — ${section || '…'} · ${annee}`} />
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            Section
            <select value={section || ''}
              onChange={e => { setSection(e.target.value); setCoches(new Set()); }}
              className="controle bg-white border border-slate-300 rounded-champ
                         px-2 text-sm">
              {(sections || []).map(s2 => (
                <option key={s2.section} value={s2.section}>
                  {s2.section}{s2.nb_ues ? ` — ${s2.nb_ues} UE` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="relative">
            <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Unité ou cours…"
              className="controle controle-icone pr-2 text-sm bg-white border border-slate-300 rounded-champ w-56" />
          </div>
          {dispo === 'unite' && <><button onClick={() => setDeplie(toutDeplie ? new Set() : new Set(ues.map(u => u.ue_num)))}
            className="bouton controle px-3 inline-flex items-center gap-1.5">
            <IconLayoutRows size={14} /> {toutDeplie ? 'Tout replier' : 'Tout déplier'}
          </button>
          <button onClick={() => setCoches(coches.size ? new Set() : new Set(ues.map(u => u.ue_num)))}
            className="bouton controle px-3">
            {coches.size ? 'Tout décocher' : 'Tout cocher'}
          </button></>}
          <div className="segments flex ml-auto" role="group" aria-label="Vue">
            <button type="button" onClick={() => choisirVue('unite')} className={dispo === 'unite' ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}><IconLayoutRows size={14} className="inline mr-1" />Par unité</button>
            <button type="button" onClick={() => choisirVue('date')} className={dispo === 'date' ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}><IconCalendarEvent size={14} className="inline mr-1" />Par date</button>
          </div>
        </div>

        {erreur && (
          <div className="mb-3 px-3 py-2 rounded-carte bg-[color:color-mix(in_srgb,var(--c-attente)_9%,var(--blanc))] text-[color:var(--c-refuse)] text-sm
                          border border-[color:var(--c-attente)] inline-flex items-center gap-2">
            <IconAlertTriangle size={15} /> {erreur}
          </div>
        )}

        {dispo === 'unite' && coches.size > 0 && (
          <BarrePose locaux={locaux} nbCoches={coches.size} appliquerLot={appliquerLot} />
        )}

        {dispo === 'unite' ? (
          <VueUnites ues={ues} locaux={locaux}
            deplie={deplie} setDeplie={setDeplie} coches={coches} setCoches={setCoches}
            poserSeance={poserSeance} poserEpreuve={poserEpreuve} onPassages={(u, c, ses) => setPassages({ u, c, ses })} />
        ) : (
          <VueFrise ues={ues} onOuvrir={n => { setDeplie(new Set([n])); choisirVue('unite'); }} />
        )}

        {passages && <PassagesExamen annee={annee} ue={passages.u} cours={passages.c} session={passages.ses}
          onFermer={() => { setPassages(null); charger(); }} />}

        {/* CORRIGER UNE SÉANCE CLOSE : jamais en silence. Le motif se conserve
            avec l'avant et l'après, parce que c'est ce qu'un recours viendra
            chercher. Corriger une date ne rouvre pas la délibération. */}
        {aMotiver && (
          <Fenetre icone={IconLock} titre="Séance close" large="petite"
            onFermer={() => { setAMotiver(null); setMotif(''); }}
            pied={<>
              <span />
              <button onClick={() => { setAMotiver(null); setMotif(''); }}
                className="bouton">
                Annuler
              </button>
              <button
                onClick={async () => {
                  if (!motif.trim()) { setErreur('Un motif écrit est nécessaire.'); return; }
                  const ok = await envoyer(aMotiver.charge, motif.trim());
                  if (ok) { setAMotiver(null); setMotif(''); }
                }}
                className="bouton bouton-fort">
                Corriger
              </button>
            </>}>
              <p className="text-sm text-slate-600 mb-3">
                {aMotiver.detail || `Cette modification touche ${aMotiver.closes?.length || 0}
                 séance(s) déjà closes.`} La séance reste close ; seule la date change,
                et la correction est conservée avec son motif.
              </p>
              <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3}
                placeholder="Pourquoi cette date est-elle corrigée ?"
                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg" />
          </Fenetre>
        )}
        <CorrectionsApresCloture annee={annee} />
      </div>
    </div>
  );
}

/** LES CORRECTIONS APRÈS CLÔTURE, RELUES (audit du 28 octobre 2026) : elles s'écrivaient
 *  « pour qu'elles se lisent », et aucun écran ne les lisait. Avant, après, motif, qui. */
function CorrectionsApresCloture({ annee }) {
  const [l, setL] = useState([]);
  useEffect(() => {
    fetch(`/api/calendrier/corrections?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(x => setL(Array.isArray(x) ? x : [])).catch(() => setL([]));
  }, [annee]);
  if (!l.length) return null;
  const lire = j => { try { return Object.entries(JSON.parse(j || '{}')).map(([k, v]) => `${k.replace(/_/g, ' ')} : ${v ?? '—'}`).join(', '); } catch { return ''; } };
  const fr = d => (d ? new Date(String(d).replace(' ', 'T') + 'Z').toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  return (
    <details className="carte px-3 py-2 mt-4">
      <summary className="cursor-pointer text-sm font-semibold">Corrections après clôture ({l.length})</summary>
      <table className="w-full text-second mt-2">
        <thead><tr className="tab-entete text-left"><th className="px-2 py-1">Le</th><th className="px-2 py-1">UE</th><th className="px-2 py-1">Avant</th>
          <th className="px-2 py-1">Après</th><th className="px-2 py-1">Motif</th><th className="px-2 py-1">Par</th></tr></thead>
        <tbody>{l.map(x => (
          <tr key={x.id} className="border-t border-slate-100 align-top"><td className="px-2 py-1 whitespace-nowrap">{fr(x.le)}</td>
            <td className="px-2 py-1">UE {x.ue_num} · S{x.session}</td><td className="px-2 py-1">{lire(x.avant)}</td>
            <td className="px-2 py-1">{lire(x.apres)}</td><td className="px-2 py-1">{x.motif}</td><td className="px-2 py-1">{x.par}</td></tr>))}
        </tbody>
      </table>
    </details>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { IconMail, IconFileText, IconListCheck, IconLayoutGrid, IconAccessible, IconAlertTriangle, IconArchive, IconId, IconCalendarEvent } from '@tabler/icons-react';
import { authHeaders, api } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Tableau, TableauEntete, Th, Td, Tr, Encadre, EnteteCarte } from './ui.jsx';

/* EXAMENS : PRÉPARER ET IMPRIMER (3.5.226, Charles, 8 novembre 2026 : « le secrétariat souhaite sortir des documents pour les
   examens : liste de présence avec la date de l'examen, le professeur, le surveillant, le nombre d'étudiants… pense à tout »).
   Les épreuves datées du calendrier des sessions, une ligne chacune : on y complète ce que le calendrier ne porte pas (surveillants,
   écrit ou oral, durée, matériel), on coche, et on sort les pièces — l'enveloppe complète selon la procédure 2026-2027, ou une pièce
   à la fois. Serveur : /api/examens (lib/examens.js). */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const ICONES = { enveloppe: IconMail, fiche: IconFileText, registre: IconListCheck, plan: IconLayoutGrid, ar: IconAccessible, incident: IconAlertTriangle, archivage: IconArchive, garde: IconId, recap: IconCalendarEvent };

function Champ({ valeur, onPoser, liste, largeur = 'w-44', placeholder = '' }) {
  const [v, setV] = useState(valeur || '');
  useEffect(() => setV(valeur || ''), [valeur]);
  return <input className={`controle !h-8 ${largeur}`} value={v} list={liste} placeholder={placeholder} data-reponses="non"
    onChange={e => setV(e.target.value)} onBlur={() => { if ((v || '') !== (valeur || '')) onPoser(v); }} />;
}

/* DANS LE CENTRE D'IMPRESSION (3.5.296, Charles : « simplifier la sortie des listes d'examens ; il faut que cela aille dans le
   centre d'impression ») : Éditions → Étudiants → Examens. `initial` règle l'écran à l'ouverture (depuis le calendrier des
   sessions : section, session, le jour de l'épreuve, l'épreuve cochée) ; `integre` retire le titre d'écran. */
export default function ExamensPreparer({ annee, initial = null, integre = false }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(initial?.section || '');
  const [session, setSession] = useState(Number(initial?.session) === 2 ? 2 : 1);
  const [du, setDu] = useState(initial?.du || '');
  const [au, setAu] = useState(initial?.au || '');
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [coches, setCoches] = useState(new Set());
  const [enCours, setEnCours] = useState(null);
  const premiereCle = useRef(initial?.cle || null);

  useEffect(() => { api.sections().then(l => setSections(Array.isArray(l) ? l : [])).catch(() => {}); }, []);
  const charger = () => {
    const q = new URLSearchParams({ annee: annee || '', session: String(session), ...(section ? { section } : {}), ...(du ? { du } : {}), ...(au ? { au } : {}) });
    fetch(`/api/examens?${q}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
      .then(j => { setD(j); setErreur(null);
        // L'épreuve demandée par le calendrier est cochée une fois, à l'ouverture.
        const voulue = premiereCle.current; premiereCle.current = null;
        setCoches(voulue && (j.epreuves || []).some(e => e.cle === voulue) ? new Set([voulue]) : new Set()); })
      .catch(e => setErreur(e.message));
  };
  useEffect(() => { charger(); }, [annee, section, session, du, au]);   // eslint-disable-line react-hooks/exhaustive-deps

  const poser = async (e, champ, valeur) => {
    const r = await fetch('/api/examens/detail', { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ annee: d.annee, session, ue_num: e.ue_num, cours_code: e.cours_code, [champ]: valeur }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Enregistrement refusé.'); return; }
    setD(x => ({ ...x, epreuves: x.epreuves.map(y => (y.cle === e.cle ? { ...y, ...j.detail, heure_fin: finDe(y.heure, j.detail.duree_min) } : y)) }));
  };
  const sortir = async piece => {
    setEnCours(piece); setErreur(null);
    try {
      const r = await fetch('/api/examens/documents', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee: d.annee, session, section: section || null, du: du || null, au: au || null, cles: [...coches], pieces: [piece] }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'La pièce n’a pas pu être composée.');
      ouvrirApercu({ html: j.html, titre: j.titre, sousTitre: j.sous, nomFichier: j.nom, envoiPossible: false, astuceImpression: 'A4 portrait' });
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  const liste = d?.epreuves || [];
  const tous = liste.length > 0 && liste.every(e => coches.has(e.cle));
  const basculer = k => setCoches(c => { const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const manquent = useMemo(() => liste.filter(e => (!coches.size || coches.has(e.cle)) && (!e.surveillants || !e.local)).length, [liste, coches]);

  return (
    <div className="space-y-4">
      <div>
        {!integre && <h1 className="titre-ecran">Examens : préparer et imprimer</h1>}
        <p className="text-second text-slate-500 m-0">Les épreuves datées dans « Sessions : épreuves et délibérations ». Choisissez la section et la période, complétez ce qui manque — surveillants, écrit ou oral, durée, matériel —, cochez (aucune coche = toutes), puis sortez les pièces. Les étudiants dispensés (valorisation accordée, report de notes) ne figurent pas sur les listes de l’épreuve dont ils sont dispensés. L’enveloppe suit la procédure pour l’organisation des examens 2026-2027.</p>
      </div>
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
        <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <div className="segments flex">{[1, 2].map(n => <button key={n} type="button" onClick={() => setSession(n)} className={session === n ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{n === 1 ? '1re session' : '2e session'}</button>)}</div>
        <label className="text-second text-slate-500 inline-flex items-center gap-1">Du <input type="date" className="controle" value={du} onChange={e => setDu(e.target.value)} /></label>
        <label className="text-second text-slate-500 inline-flex items-center gap-1">au <input type="date" className="controle" value={au} onChange={e => setAu(e.target.value)} /></label>
        <span className="flex-1" />
        <span className="text-second text-slate-500 whitespace-nowrap">{liste.length} épreuve(s){coches.size ? ` · ${coches.size} cochée(s)` : ''}</span>
      </div>
      {erreur && <Encadre etat="corriger" titre="Refusé">{erreur}</Encadre>}
      <datalist id="examens-personnes">{(d?.personnes || []).map(p => <option key={p} value={p} />)}</datalist>

      <section className="carte overflow-hidden">
        <EnteteCarte titre="Sortir les pièces" sous={coches.size ? `Pour les ${coches.size} épreuve(s) cochée(s).` : 'Pour toutes les épreuves affichées.'} />
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {(d?.pieces || []).map(p => { const I = ICONES[p.id] || IconFileText; return (
            <button key={p.id} type="button" title={p.aide || p.libelle} disabled={!liste.length || !!enCours}
              className={`bouton ${p.id === 'enveloppe' ? 'bouton-fort' : 'bouton-sortir'} inline-flex items-center gap-1.5`} onClick={() => sortir(p.id)}>
              <I size={15} /> {enCours === p.id ? 'Composition…' : p.libelle}</button>); })}
        </div>
        {manquent > 0 && <p className="px-4 pb-3 m-0 text-second text-slate-500">{manquent} épreuve(s) sans surveillant ou sans local : la pièce sortira avec une ligne à compléter à la main.</p>}
      </section>

      {!d && !erreur ? <p className="text-second text-slate-500">Chargement…</p>
        : !liste.length ? <Encadre etat="neutre" titre="Aucune épreuve datée">Les épreuves se datent dans Organisation → Sessions : épreuves et délibérations (date, heure, local).</Encadre>
        : <Tableau dense>
            <TableauEntete>
              <Th largeur="w-8"><input type="checkbox" checked={tous} onChange={() => setCoches(tous ? new Set() : new Set(liste.map(e => e.cle)))} aria-label="Tout cocher" /></Th>
              <Th>Date</Th><Th>Horaire</Th><Th>Local</Th><Th>Épreuve</Th><Th>Professeur(s)</Th><Th>Surveillant(s)</Th><Th>Type</Th><Th>Durée</Th><Th>Matériel autorisé</Th><Th>Effectif</Th><Th>AR</Th><Th>Questionnaire</Th>
            </TableauEntete>
            <tbody>{liste.map(e => (
              <Tr key={e.cle}>
                <Td><input type="checkbox" checked={coches.has(e.cle)} onChange={() => basculer(e.cle)} aria-label={`UE ${e.ue_num} ${e.cours_code}`} /></Td>
                <Td className="whitespace-nowrap">{fr(e.date)}</Td>
                <Td className="whitespace-nowrap tabular-nums">{String(e.heure || '').slice(0, 5)} → {e.heure_fin}</Td>
                <Td>{e.local || <span className="text-slate-400">—</span>}</Td>
                <Td><b>UE {e.ue_num}</b> {e.cours_code ? `· ${e.cours_code}` : '· unité'}<div className="text-mention text-slate-500">{e.cours_nom || e.ue_nom}{e.section ? ` · ${e.section}` : ''}</div></Td>
                <Td className="text-second">{e.professeurs || '—'}</Td>
                <Td><Champ valeur={e.surveillants} liste="examens-personnes" placeholder="Nom(s)…" onPoser={v => poser(e, 'surveillants', v)} /></Td>
                <Td><select className="controle !h-8" value={e.type} onChange={x => poser(e, 'type', x.target.value)}><option value="ecrit">écrit</option><option value="oral">oral</option></select></Td>
                <Td><select className="controle !h-8" value={e.duree_min} onChange={x => poser(e, 'duree_min', Number(x.target.value))}>
                  {[...new Set([60, 90, 120, 150, 180, 240, e.duree_min])].sort((a, b) => a - b).map(m => <option key={m} value={m}>{Math.floor(m / 60)} h{m % 60 ? String(m % 60).padStart(2, '0') : ''}</option>)}</select></Td>
                <Td><Champ valeur={e.materiel} largeur="w-40" placeholder="par défaut" onPoser={v => poser(e, 'materiel', v)} /></Td>
                <Td className="text-center tabular-nums">{e.etudiants}</Td>
                <Td className="text-center tabular-nums">{e.ar || ''}</Td>
                {/* LE QUESTIONNAIRE REÇU (3.5.227) : tant qu'il ne l'est pas, Lucie le rappelle au professeur, puis à la coordination. */}
                <Td className="whitespace-nowrap">{e.session === 2 ? <span className="text-mention text-slate-400">avec la 1re session</span> : (
                  <label className="inline-flex items-center gap-1.5 text-second">
                    <input type="checkbox" checked={!!e.questionnaire_recu_le} onChange={x => poser(e, 'questionnaire_recu_le', x.target.checked ? new Date().toLocaleDateString('sv-SE') : null)} />
                    {e.questionnaire_recu_le ? `reçu le ${fr(e.questionnaire_recu_le)}` : <span className={e.delai_questionnaire && e.delai_questionnaire < new Date().toLocaleDateString('sv-SE') ? 'text-red-700 font-semibold' : 'text-slate-500'}>pour le {fr(e.delai_questionnaire)}</span>}
                  </label>)}</Td>
              </Tr>))}</tbody>
          </Tableau>}
    </div>);
}

function finDe(h, m) {
  const [a, b] = String(h || '').slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(a)) return '';
  const t = a * 60 + (b || 0) + Number(m || 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

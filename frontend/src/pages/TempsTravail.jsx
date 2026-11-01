import { useEffect, useMemo, useState } from 'react';
import { IconPrinter, IconWand, IconSignature, IconCalendarWeek, IconUsers, IconSettings, IconClockHour4, IconChecklist } from '@tabler/icons-react';
import { authHeaders, getUser } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { Tableau, TableauEntete, Th, Td, Tr, EnteteCarte, PastilleEtat } from '../components/ui.jsx';
import PreviewModal from '../components/PreviewModal.jsx';

/* LE TEMPS DE TRAVAIL DU SECRÉTARIAT (3.5.039, Charles, 1er novembre 2026 — courriel à Nicolas : « souplesse dans
 * l'organisation des semaines, pas sur le nombre d'heures » ; « un générateur annuel qui respecte le décret et calcule le
 * temps de travail »). Règles et calculs : backend/src/lib/tempsTravail.js — l'écran ne calcule rien, il montre.
 * Faces : Mon année · Mon relevé · L'équipe, et pour la direction : Suivi · Générer l'année · Personnes et réglages. */

/* L'ANNÉE DU MODULE est la sienne : celle qui contient aujourd'hui (septembre → août), choisie en tête d'écran ; elle ne
   suit pas l'année de travail du reste de Lucie (on prépare 2026-2027 pendant qu'on encode encore 2025-2026). */
const anneeDuJour = () => { const d = new Date(); const y = d.getFullYear(); return d.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
const ANNEE = { v: anneeDuJour() };
const api = (url, o = {}) => fetch(`/api/temps-travail${url}${url.includes('?') ? '&' : '?'}annee=${ANNEE.v}`, { ...o, headers: { ...authHeaders(), ...(o.body ? { 'Content-Type': 'application/json' } : {}) } })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { bilan: j.bilan }); return j; });
const hm = m => { if (m == null) return ''; const s = m < 0 ? '−' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const JOURS_C = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const fmt = d => `${d.slice(8)}/${d.slice(5, 7)}`;
const moisCourant = () => new Date().toISOString().slice(0, 7);
const ETAT_JOUR = { prevu: ['neutre', 'prévu'], libre: [null, 'libre'], conge: ['disponible', 'congé'], ete: ['disponible', 'été'],
  ferie: ['disponible', 'férié'], reel: ['surveiller', 'réel'], absence: ['surveiller', 'absence'], hors: [null, ''] };
const ETAPES = { personne: 'la personne', adjoint: 'la direction adjointe', direction: 'la direction' };

function Signatures({ sig, ordre }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ordre.map(e => {
        const s = sig.find(x => x.etape === e && x.valable);
        const ancienne = !s && sig.find(x => x.etape === e);
        return <PastilleEtat key={e} etat={s ? 'reussi' : ancienne ? 'corriger' : 'neutre'}
          title={s ? `Signé par ${s.par_nom} le ${String(s.le).slice(0, 16)}` : ancienne ? 'Signé, puis le contenu a changé : à signer de nouveau' : 'À signer'}>
          {ETAPES[e]}{s ? ' ✓' : ancienne ? ' — à refaire' : ''}</PastilleEtat>;
      })}
    </div>
  );
}

export default function TempsTravail() {
  const moi = getUser();
  const [info, setInfo] = useState(null);
  const [face, setFace] = useState('annee');
  const [uid, setUid] = useState(moi?.id);
  const [personnes, setPersonnes] = useState([]);
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState('');
  const [an, setAn] = useState(ANNEE.v);
  const changerAnnee = v => { ANNEE.v = v; setAn(v); setInfo(i => ({ ...i, annee: v })); };
  useEffect(() => { api('/moi').then(i => { setInfo(i); if (i.gere && !i.designe) setFace('suivi'); }).catch(e => setErreur(e.message)); }, []);
  const chargerPersonnes = () => info?.gere && api('/personnes').then(setPersonnes).catch(e => setErreur(e.message));
  useEffect(() => { chargerPersonnes(); }, [info?.gere]);
  useEffect(() => { if (info?.gere && !info.designe && personnes.personnes?.length && uid === moi?.id) setUid(personnes.personnes[0].utilisateur_id); }, [personnes]);

  if (!info) return <div className="text-sm text-slate-500">{erreur || 'Chargement…'}</div>;
  if (!info.gere && !info.designe) return <div className="carte px-4 py-3 text-sm text-slate-600">Le temps de travail ne concerne que les membres du personnel désignés par la direction.</div>;

  const faces = [
    ...(info.designe || info.gere ? [['annee', 'Année', IconCalendarWeek], ['releve', 'Relevé du mois', IconClockHour4], ['equipe', 'L’équipe', IconUsers]] : []),
    ...(info.gere ? [['suivi', 'Suivi', IconChecklist], ['generer', 'Générer l’année', IconWand], ['reglages', 'Personnes et réglages', IconSettings]] : []),
  ];
  const listePers = personnes.personnes || [];
  const ouvrir = async url => { try { setApercu(await api(url)); } catch (e) { informer({ message: e.message }); } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="titre-ecran">Temps de travail</h1>
          <p className="text-second text-slate-500">36 h de travail effectif par semaine pour un temps plein · l’horaire prévu fait foi, on n’encode que les écarts.</p>
        </div>
        <div className="flex flex-nowrap items-center gap-2">
        <select className="controle border border-slate-300 rounded-champ text-sm" value={an} onChange={e => changerAnnee(e.target.value)} aria-label="Année">
          {[-1, 0, 1].map(k => { const a = Number(anneeDuJour().slice(0, 4)) + k; return <option key={k} value={`${a}-${a + 1}`}>{a}-{a + 1}</option>; })}
        </select>
        {info.gere && ['annee', 'releve'].includes(face) && (
          <select className="controle border border-slate-300 rounded-champ text-sm" value={uid} onChange={e => setUid(Number(e.target.value))}>
            {info.designe && <option value={moi.id}>Moi</option>}
            {listePers.filter(p => p.actif && p.utilisateur_id !== moi.id).map(p => <option key={p.utilisateur_id} value={p.utilisateur_id}>{p.nom}</option>)}
          </select>
        )}
        </div>
      </div>
      <div className="flex flex-nowrap gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--menu-bord)' }}>
        {faces.map(([k, l]) => <button key={k} onClick={() => setFace(k)} className={`onglet-page ${face === k ? 'onglet-page-actif' : ''}`}>{l}</button>)}
      </div>
      {erreur && <div className="text-sm text-red-700">{erreur}</div>}
      <div key={an} className="space-y-4">
      {face === 'annee' && <Annee uid={uid} info={info} ouvrir={ouvrir} />}
      {face === 'releve' && <Releve uid={uid} info={info} ouvrir={ouvrir} />}
      {face === 'equipe' && <Equipe />}
      {face === 'suivi' && <Suivi onOuvrir={(id, f) => { setUid(id); setFace(f); }} />}
      {face === 'generer' && <Generer info={info} personnes={listePers} recharger={chargerPersonnes} />}
      </div>
      {face === 'reglages' && <Reglages info={info} donnees={personnes} recharger={() => { chargerPersonnes(); api('/moi').then(setInfo); }} />}
      {apercu && <PreviewModal html={apercu.html} titre={apercu.titre} nomFichier={apercu.nom_fichier} envoiPossible={false} onClose={() => setApercu(null)} />}
    </div>
  );
}

function Annee({ uid, info, ouvrir }) {
  const [d, setD] = useState(null); const [fc, setFc] = useState(null);
  const charger = () => { api(`/annee/${uid}`).then(setD).catch(() => setD({ semaines: [] })); api(`/conges/${uid}`).then(setFc).catch(() => setFc(null)); };
  useEffect(() => { charger(); }, [uid]);
  if (!d) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (!d.semaines.length) return <div className="carte px-4 py-3 text-sm text-slate-600">L’année n’est pas encore générée. {info.gere ? 'Face « Générer l’année ».' : 'La direction adjointe la prépare avec vous.'}</div>;
  const signer = async etape => {
    if (!(await demander({ message: `Signer la fiche de congés ${info.annee} au nom de ${ETAPES[etape]} ?` }))) return;
    try { await api(`/signer/${uid}`, { method: 'POST', body: JSON.stringify({ objet: 'conges', periode: info.annee, etape }) }); charger(); }
    catch (e) { informer({ message: e.message }); }
  };
  const role = getUser()?.role;
  return (
    <div className="space-y-4">
      <div className="carte overflow-hidden">
        <EnteteCarte titre="L’année" sous={`${d.semaines.filter(s => s.statut === 'travail').length} semaines de travail · ${hm(d.total)} prévues pour ${hm(d.cible)} dues${d.total !== d.cible ? ' — écart à corriger' : ''}`} />
        <div className="px-4 py-3 flex flex-wrap gap-1">
          {d.semaines.map(s => (
            <div key={s.lundi} title={`Semaine du ${s.lundi} : ${s.statut === 'travail' ? hm(s.minutes) : s.statut === 'ete' ? 'vacances d’été' : 'congé scolaire'}`}
              className="w-[3.4rem] text-center rounded-champ border py-1" style={{ borderColor: 'var(--menu-bord)', background: s.statut === 'travail' ? 'var(--c-fond_tuile, #fff)' : 'var(--c-fond_entete, var(--fond-bande))' }}>
              <div className="text-mention text-slate-500">{fmt(s.lundi)}</div>
              <div className="text-second font-semibold">{s.statut === 'travail' ? hm(s.minutes).replace(' h ', 'h') : s.statut === 'ete' ? 'été' : 'congé'}</div>
            </div>
          ))}
        </div>
      </div>
      {fc && (
        <div className="carte overflow-hidden">
          <EnteteCarte titre="Fiche de congés" sous="À signer par la direction adjointe, puis par la direction pour accord, avant le 1er décembre.">
            <button className="bouton-sortir px-2.5 py-1 text-second inline-flex items-center gap-1.5" onClick={() => ouvrir(`/conges/${uid}/document`)}><IconPrinter size={14} /> Fiche de congés</button>
          </EnteteCarte>
          <Tableau dense>
            <TableauEntete><Th>Période</Th><Th>Du</Th><Th>Au</Th></TableauEntete>
            <tbody>{fc.periodes.map(p => <Tr key={p.du}><Td>{p.libelle}</Td><Td>{p.du}</Td><Td>{p.au}</Td></Tr>)}</tbody>
          </Tableau>
          <div className="px-4 py-3 flex flex-wrap items-center gap-3">
            <Signatures sig={fc.signatures} ordre={['adjoint', 'direction']} />
            {['directeur_adjoint', 'admin', 'directeur'].includes(role) && uid !== getUser()?.id && <button className="bouton text-second" onClick={() => signer('adjoint')}><IconSignature size={14} /> Signer (direction adjointe)</button>}
            {['directeur', 'admin'].includes(role) && uid !== getUser()?.id && <button className="bouton text-second" onClick={() => signer('direction')}><IconSignature size={14} /> Accord de la direction</button>}
          </div>
        </div>
      )}
    </div>
  );
}

const moisDansAnnee = () => { const m = moisCourant(); const [a1, a2] = ANNEE.v.split('-'); return m >= `${a1}-09` && m <= `${a2}-08` ? m : `${a1}-09`; };
function Releve({ uid, info, ouvrir }) {
  const [mois, setMois] = useState(moisDansAnnee());
  const [d, setD] = useState(null); const [edit, setEdit] = useState(null);
  const charger = () => api(`/releve/${uid}/${mois}`).then(setD).catch(e => setD({ erreur: e.message }));
  useEffect(() => { charger(); }, [uid, mois]);
  if (!d) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (d.erreur) return <div className="text-sm text-red-700">{d.erreur}</div>;
  const role = getUser()?.role, soi = uid === getUser()?.id;
  const signer = async etape => {
    if (!(await demander({ message: `Signer le relevé de ${mois} au nom de ${ETAPES[etape]} ? Le contenu signé est celui que vous voyez.` }))) return;
    try { await api(`/signer/${uid}`, { method: 'POST', body: JSON.stringify({ objet: 'releve', periode: mois, etape }) }); charger(); }
    catch (e) { informer({ message: e.message }); }
  };
  const enregistrer = async v => {
    try { setD(await api(`/ecart/${uid}/${edit.jour}`, { method: 'PUT', body: JSON.stringify(v) })); setEdit(null); }
    catch (e) { informer({ message: e.message }); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2">
        <input type="month" className="controle border border-slate-300 rounded-champ text-sm" value={mois} onChange={e => e.target.value && setMois(e.target.value)} />
        <span className="text-second text-slate-500">Prévu {hm(d.prevu)} · presté {hm(d.reel)} · écart {hm(d.ecart)} · <b>solde de l’année {hm(d.solde)}</b></span>
        <div className="flex-1" />
        <button className="bouton-sortir px-2.5 py-1 text-second inline-flex items-center gap-1.5" onClick={() => ouvrir(`/releve/${uid}/${mois}/document`)}><IconPrinter size={14} /> Relevé du mois</button>
      </div>
      {!d.prevu && !d.jours.some(j => j.saisie) && <div className="carte px-4 py-3 text-sm text-slate-600">Aucune heure prévue ce mois-ci : l’année n’est pas générée, ou le mois est hors de l’année {ANNEE.v}.</div>}
      <Tableau dense>
        <TableauEntete><Th>Jour</Th><Th>Prévu</Th><Th>Réel ou absence</Th><Th align="droite">Prévu</Th><Th align="droite">Presté</Th><Th align="droite">Écart</Th><Th /></TableauEntete>
        <tbody>
          {d.jours.filter(j => j.etat !== 'libre' && j.etat !== 'hors' || j.saisie).map(j => {
            const [etat, mot] = ETAT_JOUR[j.etat] || [null, ''];
            return (
              <Tr key={j.jour}>
                <Td className="whitespace-nowrap">{j.jour_semaine} {fmt(j.jour)}</Td>
                <Td ton="secondaire">{j.plan ? `${j.plan.debut}–${j.plan.fin}${j.plan.pause_debut ? ` (pause ${j.plan.pause_debut}–${j.plan.pause_fin})` : ''}` : ''}</Td>
                <Td>
                  {etat && <PastilleEtat etat={etat}>{mot}</PastilleEtat>}{' '}
                  {j.saisie?.type === 'reel' && `${j.saisie.debut}–${j.saisie.fin}${j.saisie.pause_debut ? ` (pause ${j.saisie.pause_debut}–${j.saisie.pause_fin})` : ''}`}
                  {j.saisie?.type === 'absence' && (info.absences[j.saisie.motif]?.libelle || j.saisie.motif)}
                  {j.ferie && <span className="text-slate-500"> {j.ferie}</span>}
                  {j.controles.map((c, i) => <div key={i} className="text-second text-red-700">{c}</div>)}
                </Td>
                <Td align="droite">{j.prevu ? hm(j.prevu) : ''}</Td>
                <Td align="droite">{j.reel || j.prevu ? hm(j.reel) : ''}</Td>
                <Td align="droite">{j.ecart ? hm(j.ecart) : ''}</Td>
                <Td align="droite">{!d.verrouille && (soi || info.gere) && <button className="bouton px-2 py-0.5 text-second" onClick={() => setEdit({ jour: j.jour, plan: j.plan, saisie: j.saisie })}>Écart</button>}</Td>
              </Tr>
            );
          })}
        </tbody>
      </Tableau>
      <div className="carte px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-second text-slate-600">Signatures :</span>
        <Signatures sig={d.signatures} ordre={['personne', 'adjoint', 'direction']} />
        {soi && <button className="bouton text-second" onClick={() => signer('personne')}><IconSignature size={14} /> Je confirme mon relevé</button>}
        {!soi && ['directeur_adjoint', 'admin', 'directeur'].includes(role) && <button className="bouton text-second" onClick={() => signer('adjoint')}><IconSignature size={14} /> Contrôlé (direction adjointe)</button>}
        {!soi && ['directeur', 'admin'].includes(role) && <button className="bouton text-second" onClick={() => signer('direction')}><IconSignature size={14} /> Accord de la direction</button>}
        {d.verrouille && <span className="text-second text-slate-500">Mois signé par la direction : il ne change plus.</span>}
      </div>
      {edit && <EditionEcart edit={edit} info={info} onClose={() => setEdit(null)} onSave={enregistrer} />}
    </div>
  );
}

function EditionEcart({ edit, info, onClose, onSave }) {
  const s = edit.saisie || {};
  const [type, setType] = useState(s.type || 'reel');
  const [v, setV] = useState({ debut: s.debut || edit.plan?.debut || '', fin: s.fin || edit.plan?.fin || '', pause_debut: s.pause_debut || edit.plan?.pause_debut || '',
    pause_fin: s.pause_fin || edit.plan?.pause_fin || '', motif: s.motif || 'maladie', note: s.note || '' });
  const ch = k => e => setV(x => ({ ...x, [k]: e.target.value }));
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre={`Écart du ${edit.jour}`} sous="Seul ce qui diffère de l’horaire prévu s’encode." />
      <div className="px-4 py-3 space-y-3 text-sm">
        <div className="segments">
          {[['reel', 'Heures réelles'], ['absence', 'Absence'], ['aucun', 'Revenir au prévu']].map(([k, l]) =>
            <button key={k} type="button" className={`px-3 py-1 text-second ${type === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`} onClick={() => setType(k)}>{l}</button>)}
        </div>
        {type === 'reel' && (
          <div className="flex flex-wrap items-center gap-2">
            Arrivée <input type="time" className="controle border border-slate-300 rounded-champ" value={v.debut} onChange={ch('debut')} />
            départ <input type="time" className="controle border border-slate-300 rounded-champ" value={v.fin} onChange={ch('fin')} />
            pause de <input type="time" className="controle border border-slate-300 rounded-champ" value={v.pause_debut} onChange={ch('pause_debut')} />
            à <input type="time" className="controle border border-slate-300 rounded-champ" value={v.pause_fin} onChange={ch('pause_fin')} />
          </div>
        )}
        {type === 'absence' && (
          <select className="controle border border-slate-300 rounded-champ" value={v.motif} onChange={ch('motif')}>
            {Object.entries(info.absences).map(([k, a]) => <option key={k} value={k}>{a.libelle}{a.compte ? ' — comptée comme prestée' : ' — non comptée'}</option>)}
          </select>
        )}
        {type !== 'aucun' && <input className="controle border border-slate-300 rounded-champ w-full" placeholder="Note (facultatif)" value={v.note} onChange={ch('note')} />}
        <div className="flex gap-2 justify-end">
          <button className="bouton" onClick={onClose}>Annuler</button>
          <button className="bouton bouton-fort" onClick={() => onSave(type === 'aucun' ? { type: 'aucun' } : { type, ...v })}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function Equipe() {
  const [mois, setMois] = useState(moisDansAnnee());
  const [d, setD] = useState(null);
  useEffect(() => { api(`/equipe/${mois}`).then(setD).catch(e => setD({ erreur: e.message })); }, [mois]);
  if (!d) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (d.erreur) return <div className="text-sm text-red-700">{d.erreur}</div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2">
        <input type="month" className="controle border border-slate-300 rounded-champ text-sm" value={mois} onChange={e => e.target.value && setMois(e.target.value)} />
        <span className="text-second text-slate-500">Qui est prévu, jour par jour. Au moins {d.presents_min} présents, et le secrétariat ouvert cinq jours par semaine.</span>
      </div>
      <div className="overflow-x-auto">
        <Tableau dense>
          <TableauEntete>
            <Th>Personne</Th>
            {d.jours.map(j => <Th key={j.jour} align="centre" title={j.ferie || j.alerte || ''}>{fmt(j.jour)}</Th>)}
          </TableauEntete>
          <tbody>
            {d.personnes.map(p => (
              <Tr key={p.id}>
                <Td className="whitespace-nowrap">{p.nom}</Td>
                {d.jours.map(j => { const x = p.jours.find(y => y.jour === j.jour);
                  return <Td key={j.jour} align="centre" title={x?.plan || ''}>{x?.present ? '●' : x && ['conge', 'ete'].includes(x.etat) ? <span className="text-slate-400">C</span> : x?.etat === 'absence' ? <span className="text-slate-400">A</span> : ''}</Td>; })}
              </Tr>
            ))}
            <Tr>
              <Td ton="fort">Présents</Td>
              {d.jours.map(j => <Td key={j.jour} align="centre">{j.ferie ? <span className="text-slate-400">F</span> : j.alerte ? <PastilleEtat etat={j.presents ? 'surveiller' : 'corriger'} title={j.alerte}>{j.presents}</PastilleEtat> : j.presents}</Td>)}
            </Tr>
          </tbody>
        </Tableau>
      </div>
      <p className="text-second text-slate-500">● prévu présent · C congé · A absence · F férié.</p>
    </div>
  );
}

function Suivi({ onOuvrir }) {
  const [mois, setMois] = useState(moisDansAnnee());
  const [d, setD] = useState(null);
  useEffect(() => { api(`/suivi?mois=${mois}`).then(setD).catch(e => setD({ erreur: e.message })); }, [mois]);
  if (!d) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (d.erreur) return <div className="text-sm text-red-700">{d.erreur}</div>;
  return (
    <div className="space-y-3">
      <input type="month" className="controle border border-slate-300 rounded-champ text-sm" value={mois} onChange={e => e.target.value && setMois(e.target.value)} />
      <Tableau dense>
        <TableauEntete><Th>Personne</Th><Th>Formule</Th><Th>Année</Th><Th align="droite">Solde</Th><Th>Relevé du mois</Th><Th>Fiche de congés</Th><Th /></TableauEntete>
        <tbody>
          {d.map(p => (
            <Tr key={p.id}>
              <Td>{p.nom}</Td>
              <Td ton="secondaire">{p.formule === '4j' ? '4 × 9 h' : p.formule === 'annualise' ? 'Annualisé' : '5 jours'} · {Math.round(p.fraction * 100)} %</Td>
              <Td>{p.genere ? <PastilleEtat etat="reussi">générée</PastilleEtat> : <PastilleEtat etat="surveiller">à générer</PastilleEtat>}</Td>
              <Td align="droite">{hm(p.solde)}</Td>
              <Td>{p.defauts ? <PastilleEtat etat="corriger">{p.defauts} jour(s) en défaut</PastilleEtat> : null} <span className="text-second text-slate-500">{p.releve.length ? `signé : ${p.releve.map(e => ETAPES[e]).join(', ')}` : 'non signé'}</span></Td>
              <Td><span className="text-second text-slate-500">{p.conges.length ? `signée : ${p.conges.map(e => ETAPES[e]).join(', ')}` : 'non signée'}</span></Td>
              <Td align="droite" className="whitespace-nowrap">
                <button className="bouton px-2 py-0.5 text-second" onClick={() => onOuvrir(p.id, 'releve')}>Relevé</button>{' '}
                <button className="bouton px-2 py-0.5 text-second" onClick={() => onOuvrir(p.id, 'annee')}>Année</button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Tableau>
      {!d.length && <p className="text-sm text-slate-500">Personne n’est encore désigné : face « Personnes et réglages ».</p>}
    </div>
  );
}

function Generer({ info, personnes, recharger }) {
  const actifs = personnes.filter(p => p.actif);
  const [uid, setUid] = useState(actifs[0]?.utilisateur_id || null);
  const p = actifs.find(x => x.utilisateur_id === uid);
  const [formule, setFormule] = useState(p?.formule || '5j');
  const [fraction, setFraction] = useState(p?.fraction || 1);
  const [ete, setEte] = useState('');
  const [jourLibre, setJourLibre] = useState(4);
  const [fortes, setFortes] = useState({});
  const [cal, setCal] = useState(null);
  const [sim, setSim] = useState(null);
  useEffect(() => { api('/calendrier').then(setCal); }, []);
  useEffect(() => { if (p) { setFormule(p.formule); setFraction(p.fraction); } setSim(null); }, [uid]);
  const lundisEte = useMemo(() => (cal?.semaines || []).filter(s => { const fin = new Date(new Date(s.lundi).getTime() + 34 * 864e5).toISOString().slice(0, 10); return s.lundi >= cal.reglage.ete_du && fin <= cal.reglage.ete_au; }), [cal]);
  const corps = () => ({ formule, fraction: Number(fraction), ete: ete || null, jourLibre: Number(jourLibre), fortes: Object.fromEntries(Object.entries(fortes).filter(([, v]) => v).map(([k, v]) => [k, Math.round(Number(v) * 60)])) });
  const simuler = async () => { try { setSim(await api(`/generer/${uid}`, { method: 'POST', body: JSON.stringify(corps()) })); } catch (e) { informer({ message: e.message }); } };
  const ecrire = async () => {
    if (!(await demander({ message: 'Enregistrer cette année ? Elle remplace l’année déjà générée pour cette personne (les écarts encodés restent).' }))) return;
    try { await api(`/generer/${uid}`, { method: 'POST', body: JSON.stringify({ ...corps(), ecrire: true }) }); informer({ message: 'Année enregistrée.' }); recharger(); }
    catch (e) { informer({ message: e.message + (e.bilan?.erreurs?.length ? ' ' + e.bilan.erreurs.join(' ') : '') }); }
  };
  if (!actifs.length) return <p className="text-sm text-slate-500">Désignez d’abord les personnes concernées (face « Personnes et réglages »).</p>;
  const ok = sim && !sim.bilan.erreurs.length && !sim.bilan.semaines_en_defaut;
  return (
    <div className="space-y-4">
      <div className="carte overflow-hidden">
        <EnteteCarte titre="Le générateur annuel" sous="Il pose les 52 semaines : congés scolaires de l’école, cinq semaines d’été, et les semaines de travail selon la formule — puis il contrôle chaque règle. Rien ne s’écrit avant « Enregistrer »." />
        <div className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
          <select className="controle border border-slate-300 rounded-champ" value={uid || ''} onChange={e => setUid(Number(e.target.value))}>
            {actifs.map(x => <option key={x.utilisateur_id} value={x.utilisateur_id}>{x.nom}</option>)}
          </select>
          <select className="controle border border-slate-300 rounded-champ" value={formule} onChange={e => setFormule(e.target.value)}>
            {Object.entries(info.formules).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <label className="flex items-center gap-1.5">Temps <input type="number" min="0.1" max="1" step="0.05" className="controle border border-slate-300 rounded-champ w-20" value={fraction} onChange={e => setFraction(e.target.value)} /></label>
          {formule === '4j' && <label className="flex items-center gap-1.5">Jour libre <select className="controle border border-slate-300 rounded-champ" value={jourLibre} onChange={e => setJourLibre(e.target.value)}>{['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'].map((j, i) => <option key={i} value={i}>{j}</option>)}</select></label>}
          <label className="flex items-center gap-1.5">Été à partir du <select className="controle border border-slate-300 rounded-champ" value={ete} onChange={e => setEte(e.target.value)}>
            <option value="">— choisir —</option>{lundisEte.map(s => <option key={s.lundi} value={s.lundi}>{s.lundi}</option>)}</select></label>
          <button className="bouton" onClick={simuler}>Calculer</button>
          <button className="bouton bouton-fort" disabled={!ok} onClick={ecrire}>Enregistrer l’année</button>
        </div>
        {formule === 'annualise' && cal && (
          <div className="px-4 pb-3 text-second text-slate-600">
            Semaines chargées (heures) — les autres semaines compensent d’elles-mêmes :
            <div className="flex flex-wrap gap-1 mt-1">{cal.semaines.filter(s => !s.conge).map(s => (
              <label key={s.lundi} className="flex flex-col items-center"><span className="text-mention">{fmt(s.lundi)}</span>
                <input type="number" min="31" max="45" step="0.5" className="controle border border-slate-300 rounded-champ w-16 text-center" value={fortes[s.lundi] || ''} onChange={e => setFortes(f => ({ ...f, [s.lundi]: e.target.value }))} /></label>))}</div>
          </div>
        )}
      </div>
      {sim && (
        <div className="carte overflow-hidden">
          <EnteteCarte titre={ok ? 'L’année tient toutes les règles' : 'L’année ne tient pas encore'} sous={`${sim.bilan.semaines_travail} semaines de travail · ${sim.bilan.semaines_conge} de congés scolaires · ${sim.bilan.semaines_ete} d’été · ${hm(sim.bilan.total_annee)} prévues pour ${hm(sim.bilan.cible_annee)} dues`} />
          {sim.bilan.erreurs.map((e, i) => <div key={i} className="px-4 pt-2 text-sm text-red-700">{e}</div>)}
          {(sim.bilan.avertissements || []).map((e, i) => <div key={'a' + i} className="px-4 pt-2 text-sm text-amber-700">{e}</div>)}
          <Tableau dense>
            <TableauEntete><Th>Semaine</Th><Th>Statut</Th><Th align="droite">Heures</Th><Th>Jours</Th><Th>Contrôles</Th></TableauEntete>
            <tbody>{sim.semaines.map(s => (
              <Tr key={s.lundi}>
                <Td className="whitespace-nowrap">{s.lundi}</Td>
                <Td>{s.statut === 'travail' ? 'travail' : <PastilleEtat etat="disponible">{s.libelle || s.statut}</PastilleEtat>}</Td>
                <Td align="droite">{s.minutes ? hm(s.minutes) : ''}</Td>
                <Td ton="secondaire">{s.jours.map((j, i) => (j ? `${JOURS_C[i]} ${j.debut}–${j.fin}` : null)).filter(Boolean).join(' · ')}{s.feries.length ? ` · férié : ${s.feries.join(', ')}` : ''}</Td>
                <Td>{s.controles.map((c, i) => <div key={i} className="text-second text-red-700">{c}</div>)}</Td>
              </Tr>))}</tbody>
          </Tableau>
        </div>
      )}
    </div>
  );
}

function Reglages({ info, donnees, recharger }) {
  const [r, setR] = useState(info.reglage);
  const [ajout, setAjout] = useState('');
  const sauver = async v => { try { setR(await api('/reglage', { method: 'PUT', body: JSON.stringify(v) })); recharger(); } catch (e) { informer({ message: e.message }); } };
  const majPers = async (p, v) => { try { await api(`/personnes/${p.utilisateur_id ?? p.id}`, { method: 'PUT', body: JSON.stringify({ fraction: p.fraction ?? 1, formule: p.formule ?? '5j', actif: p.actif !== 0, ...v }) }); recharger(); } catch (e) { informer({ message: e.message }); } };
  const deja = new Set((donnees.personnes || []).map(p => p.utilisateur_id));
  return (
    <div className="space-y-4">
      <div className="carte overflow-hidden">
        <EnteteCarte titre="Les personnes concernées" sous="La direction désigne qui entre dans le module, sa formule et sa part de temps plein." />
        <Tableau dense>
          <TableauEntete><Th>Personne</Th><Th>Formule</Th><Th>Temps plein</Th><Th>Année</Th><Th /></TableauEntete>
          <tbody>{(donnees.personnes || []).map(p => (
            <Tr key={p.utilisateur_id}>
              <Td>{p.nom}</Td>
              <Td><select className="border border-slate-300 rounded-champ text-second px-1 py-0.5" value={p.formule} onChange={e => majPers(p, { formule: e.target.value })}>{Object.entries(info.formules).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Td>
              <Td><input type="number" min="0.1" max="1" step="0.05" className="border border-slate-300 rounded-champ text-second px-1 py-0.5 w-20" defaultValue={p.fraction} onBlur={e => Number(e.target.value) !== p.fraction && majPers(p, { fraction: Number(e.target.value) })} /></Td>
              <Td ton="secondaire">{p.genere ? `${hm(p.total)} / ${hm(p.cible)}` : 'à générer'}</Td>
              <Td align="droite"><button className="bouton px-2 py-0.5 text-second" onClick={() => majPers(p, { actif: !p.actif })}>{p.actif ? 'Retirer' : 'Réintégrer'}</button></Td>
            </Tr>))}</tbody>
        </Tableau>
        <div className="px-4 py-3 flex flex-nowrap items-center gap-2">
          <select className="controle border border-slate-300 rounded-champ text-sm" value={ajout} onChange={e => setAjout(e.target.value)}>
            <option value="">— ajouter une personne —</option>
            {(donnees.comptes || []).filter(c => !deja.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <button className="bouton" disabled={!ajout} onClick={() => { majPers({ id: Number(ajout) }, {}); setAjout(''); }}>Ajouter</button>
        </div>
      </div>
      <div className="carte overflow-hidden">
        <EnteteCarte titre="Les règles de l’école" sous="Les règles légales ne se règlent pas : 36 h, pause, 8 h (9 h), 11 h de repos, 45 h et les écarts de l’art. 20bis." />
        <div className="px-4 py-3 space-y-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={r.rt_variable} onChange={e => sauver({ rt_variable: e.target.checked })} />
            L’horaire variable est inscrit au règlement de travail (sans cela, l’horaire annualisé est refusé et les journées de 9 h ne valent qu’en semaine de 4 jours).</label>
          <div className="flex flex-wrap items-center gap-2">Fenêtre des vacances d’été : du
            <input type="date" className="controle border border-slate-300 rounded-champ" value={r.ete_du} onChange={e => sauver({ ete_du: e.target.value })} /> au
            <input type="date" className="controle border border-slate-300 rounded-champ" value={r.ete_au} onChange={e => sauver({ ete_au: e.target.value })} /></div>
          <label className="flex items-center gap-2">Au moins <input type="number" min="1" max="10" className="controle border border-slate-300 rounded-champ w-16" value={r.presents_min} onChange={e => sauver({ presents_min: e.target.value })} /> personnes présentes chaque jour ouvrable.</label>
          <p className="text-second text-slate-500">Les congés scolaires viennent du calendrier de l’école (Organisation → Planification → calendrier, périodes « vacances »).</p>
        </div>
      </div>
    </div>
  );
}

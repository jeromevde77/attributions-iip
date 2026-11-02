import { useEffect, useMemo, useState } from 'react';
import { IconPrinter, IconSignature } from '@tabler/icons-react';
import { authHeaders, getUser } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { Tableau, TableauEntete, Th, Td, Tr, EnteteCarte, PastilleEtat } from '../components/ui.jsx';
import PreviewModal from '../components/PreviewModal.jsx';
import LigneTempsTravail from '../components/LigneTempsTravail.jsx';

/* LE TEMPS DE TRAVAIL DU SECRÉTARIAT (3.5.039, Charles, 1er novembre 2026 — courriel à Nicolas : « souplesse dans
 * l'organisation des semaines, pas sur le nombre d'heures » ; « un générateur annuel qui respecte le décret et calcule le
 * temps de travail »). Règles et calculs : backend/src/lib/tempsTravail.js — l'écran ne calcule rien, il montre.
 * Faces (3.5.057) : Ligne du temps (components/LigneTempsTravail.jsx) · Relevé et signatures · Préparer l'année (direction). */

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
const ETAT_JOUR = { prevu: ['neutre', 'prévu'], recup: ['disponible', 'jour donné'], libre: [null, 'libre'], conge: ['disponible', 'congé'], ete: ['disponible', 'été'],
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
  const [face, setFace] = useState('ligne');
  const [uid, setUid] = useState(moi?.id);
  const [personnes, setPersonnes] = useState([]);
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState('');
  const [an, setAn] = useState(ANNEE.v);
  const changerAnnee = v => { ANNEE.v = v; setAn(v); setInfo(i => ({ ...i, annee: v })); };
  useEffect(() => { api('/moi').then(setInfo).catch(e => setErreur(e.message)); }, []);
  const chargerPersonnes = () => info?.gere && api('/personnes').then(setPersonnes).catch(e => setErreur(e.message));
  useEffect(() => { chargerPersonnes(); }, [info?.gere]);
  useEffect(() => { if (info?.gere && !info.designe && personnes.personnes?.length && uid === moi?.id) setUid(personnes.personnes[0].utilisateur_id); }, [personnes]);

  if (!info) return <div className="text-sm text-slate-500">{erreur || 'Chargement…'}</div>;
  if (!info.gere && !info.designe) return <div className="carte px-4 py-3 text-sm text-slate-600">Le temps de travail ne concerne que les membres du personnel désignés par la direction.</div>;

  /* TROIS FACES, DANS L'ORDRE DU TRAVAIL (3.5.057, Charles : « un ordre chronologique logique ») : la ligne du temps — l'année
     de l'équipe à zoom, les moments, la chaleur, l'assistant —, le relevé du mois et ses signatures, et pour la direction la
     préparation de l'année, en étapes numérotées. Les onglets Équipe (année, semaine, mois), Suivi, Congés et Générer de
     3.5.039-3.5.056 s'y sont fondus. */
  const faces = [['ligne', 'Ligne du temps'], ['releve', 'Relevé et signatures'], ...(info.gere ? [['preparer', 'Préparer l’année']] : [])];
  const listePers = personnes.personnes || [];
  const ouvrir = async url => { try { setApercu(await api(url)); } catch (e) { informer({ message: e.message }); } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="titre-ecran">Temps de travail</h1>
          <p className="text-second text-slate-500">36 h de travail effectif par semaine pour un temps plein, 1 404 h sur l’année · on module les semaines, jamais le total.</p>
        </div>
        <select className="controle border border-slate-300 rounded-champ text-sm flex-none" value={an} onChange={e => changerAnnee(e.target.value)} aria-label="Année">
          {[-1, 0, 1].map(k => { const a = Number(anneeDuJour().slice(0, 4)) + k; return <option key={k} value={`${a}-${a + 1}`}>{a}-{a + 1}</option>; })}
        </select>
      </div>
      <div className="flex flex-nowrap gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--menu-bord)' }}>
        {faces.map(([k, l]) => <button key={k} onClick={() => setFace(k)} className={`onglet-page ${face === k ? 'onglet-page-actif' : ''}`}>{l}</button>)}
      </div>
      {erreur && <div className="text-sm text-red-700">{erreur}</div>}
      <div key={an} className="space-y-4">
        {face === 'ligne' && <LigneTempsTravail api={api} info={info} onReleve={id => { setUid(id); setFace('releve'); }} />}
        {face === 'releve' && <>
          {info.gere && <Suivi uid={uid} onOuvrir={id => setUid(id)} />}
          <Releve uid={uid} info={info} ouvrir={ouvrir} />
          <FicheConges uid={uid} info={info} ouvrir={ouvrir} />
        </>}
        {face === 'preparer' && <Preparer info={info} personnes={personnes} listePers={listePers} recharger={() => { chargerPersonnes(); api('/moi').then(setInfo); }} />}
      </div>
      {apercu && <PreviewModal html={apercu.html} titre={apercu.titre} nomFichier={apercu.nom_fichier} envoiPossible={false} onClose={() => setApercu(null)} />}
    </div>
  );
}

/* PRÉPARER L'ANNÉE : quatre étapes, dans l'ordre où elles se font. */
const ETAPES_PREP = [['personnes', 'Personnes et règles'], ['conges', 'Congés'], ['moments', 'Grands moments'], ['generer', 'Générer les années']];
function Preparer({ info, personnes, listePers, recharger }) {
  const [etape, setEtape] = useState('personnes');
  const i = ETAPES_PREP.findIndex(e => e[0] === etape);
  return (
    <div className="space-y-4">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
        {ETAPES_PREP.map(([k, l], n) => (
          <button key={k} type="button" onClick={() => setEtape(k)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-champ border whitespace-nowrap text-sm ${etape === k ? 'border-[var(--c-principal)] font-semibold text-iip-texte' : 'border-transparent text-slate-600'}`}>
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-mention ${etape === k ? 'bg-[var(--c-principal)] text-white' : 'border border-slate-300'}`}>{n + 1}</span>{l}
          </button>))}
      </div>
      {etape === 'personnes' && <Reglages info={info} donnees={personnes} recharger={recharger} />}
      {etape === 'conges' && <CalendrierConges onGenerer={() => setEtape('generer')} />}
      {etape === 'moments' && <MomentsAnnee />}
      {etape === 'generer' && <Generer info={info} personnes={listePers} recharger={recharger} />}
      {i < ETAPES_PREP.length - 1 && <div><button className="bouton" onClick={() => setEtape(ETAPES_PREP[i + 1][0])}>Étape suivante : {ETAPES_PREP[i + 1][1]} →</button></div>}
    </div>
  );
}

/* LES GRANDS MOMENTS DE L'ANNÉE (3.5.057) : ce que la direction pose (inscriptions, examens, remise des diplômes…, dans les
   événements de l'établissement — la table de la rentrée) et ce que Lucie lit seule (les séances de délibération). Ils
   s'affichent sur la ligne du temps et réchauffent leurs semaines. */
function MomentsAnnee() {
  const [l, setL] = useState(null);
  const [types, setTypes] = useState({});
  const [n, setN] = useState({ type: 'inscriptions', titre: '', du: '', au: '' });
  const charger = () => { api('/moments').then(setL).catch(e => setL({ erreur: e.message })); api('/ligne').then(x => setTypes(x.types_moment)).catch(() => {}); };
  useEffect(() => { charger(); }, []);
  if (!l) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (l.erreur) return <div className="text-sm text-red-700">{l.erreur}</div>;
  const ajouter = async () => { try { await api('/moments', { method: 'POST', body: JSON.stringify(n) }); setN({ type: n.type, titre: '', du: '', au: '' }); charger(); } catch (e) { informer({ message: e.message }); } };
  const retirer = async m => { if (!(await demander(`Retirer « ${m.titre} » ?`))) return; try { await api(`/moments/${m.id}`, { method: 'DELETE' }); charger(); } catch (e) { informer({ message: e.message }); } };
  const choix = Object.entries(types).filter(([k]) => k !== 'deliberations');
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre={`Les grands moments ${ANNEE.v}`} sous="Inscriptions, examens, remise des diplômes, rentrée… Ils se posent sur la ligne du temps et rendent leurs semaines plus chaudes. Les délibérations se lisent seules des séances." />
      <Tableau dense>
        <TableauEntete><Th>Moment</Th><Th>Nature</Th><Th>Du</Th><Th>Au</Th><Th /></TableauEntete>
        <tbody>
          {l.map((m, i) => (
            <Tr key={m.id || `d${i}`}>
              <Td>{m.titre}</Td><Td ton="secondaire">{m.libelle_type}</Td><Td>{fmt(m.du)}</Td><Td>{m.au !== m.du ? fmt(m.au) : ''}</Td>
              <Td align="droite">{m.source === 'etablissement' ? <button className="bouton px-2 py-0.5 text-second" onClick={() => retirer(m)}>Retirer</button> : <span className="text-mention text-slate-500">lu des séances</span>}</Td>
            </Tr>))}
          <Tr>
            <Td><input className="controle border border-slate-300 rounded-champ text-sm w-full" placeholder="Intitulé (facultatif)" value={n.titre} onChange={e => setN({ ...n, titre: e.target.value })} /></Td>
            <Td><select className="controle border border-slate-300 rounded-champ text-sm" value={n.type} onChange={e => setN({ ...n, type: e.target.value })}>{choix.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></Td>
            <Td><input type="date" className="controle border border-slate-300 rounded-champ text-sm" value={n.du} onChange={e => setN({ ...n, du: e.target.value })} /></Td>
            <Td><input type="date" className="controle border border-slate-300 rounded-champ text-sm" value={n.au} onChange={e => setN({ ...n, au: e.target.value })} /></Td>
            <Td align="droite"><button className="bouton bouton-fort px-2 py-0.5 text-second" disabled={!n.du} onClick={ajouter}>Ajouter</button></Td>
          </Tr>
        </tbody>
      </Tableau>
    </div>
  );
}

/* LA FICHE DE CONGÉS (signée par la direction adjointe, puis la direction). */
function FicheConges({ uid, info, ouvrir }) {
  const [fc, setFc] = useState(null);
  const charger = () => api(`/conges/${uid}`).then(setFc).catch(() => setFc(null));
  useEffect(() => { charger(); }, [uid]);
  if (!fc || !fc.periodes.length) return null;
  const signer = async etape => {
    if (!(await demander({ message: `Signer la fiche de congés ${info.annee} au nom de ${ETAPES[etape]} ?` }))) return;
    try { await api(`/signer/${uid}`, { method: 'POST', body: JSON.stringify({ objet: 'conges', periode: info.annee, etape }) }); charger(); }
    catch (e) { informer({ message: e.message }); }
  };
  const role = getUser()?.role;
  return (
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
          {d.jours.filter(j => j.saisie || j.plan || (!['samedi', 'dimanche'].includes(j.jour_semaine) && !['libre', 'hors'].includes(j.etat))).map(j => {
            const [etat, mot] = ETAT_JOUR[j.etat] || [null, ''];
            return (
              <Tr key={j.jour}>
                <Td className="whitespace-nowrap">{j.jour_semaine} {fmt(j.jour)}</Td>
                <Td ton="secondaire">{j.plan?.debut ? `${j.plan.debut}–${j.plan.fin}${j.plan.pause_debut ? ` (pause ${j.plan.pause_debut}–${j.plan.pause_fin})` : ''}` : ''}</Td>
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

/* LE SUIVI DE LA DIRECTION, en tête du relevé : chaque personne, son solde, ses signatures — une ligne choisit le relevé. */
function Suivi({ uid, onOuvrir }) {
  const [mois, setMois] = useState(moisDansAnnee());
  const [d, setD] = useState(null);
  useEffect(() => { api(`/suivi?mois=${mois}`).then(setD).catch(e => setD({ erreur: e.message })); }, [mois]);
  if (!d) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (d.erreur) return <div className="text-sm text-red-700">{d.erreur}</div>;
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre="Le suivi de l’équipe" sous="Touchez une personne pour ouvrir son relevé et sa fiche de congés.">
        <input type="month" className="controle border border-slate-300 rounded-champ text-sm" value={mois} onChange={e => e.target.value && setMois(e.target.value)} aria-label="Mois" />
      </EnteteCarte>
      <Tableau dense>
        <TableauEntete><Th>Personne</Th><Th>Formule</Th><Th>Année</Th><Th align="droite">Solde</Th><Th>Relevé du mois</Th><Th>Fiche de congés</Th></TableauEntete>
        <tbody>
          {d.map(p => (
            <Tr key={p.id} actif={p.id === uid} onClick={() => onOuvrir(p.id)} className="cursor-pointer">
              <Td>{p.nom}</Td>
              <Td ton="secondaire">{p.formule === '4j' ? '4 × 9 h' : p.formule === 'annualise' ? 'Annualisé' : '5 jours'} · {Math.round(p.fraction * 100)} %</Td>
              <Td>{p.genere ? <PastilleEtat etat="reussi">générée</PastilleEtat> : <PastilleEtat etat="surveiller">à générer</PastilleEtat>}</Td>
              <Td align="droite">{hm(p.solde)}</Td>
              <Td>{p.defauts ? <PastilleEtat etat="corriger">{p.defauts} jour(s) en défaut</PastilleEtat> : null} <span className="text-second text-slate-500">{p.releve.length ? `signé : ${p.releve.map(e => ETAPES[e]).join(', ')}` : 'non signé'}</span></Td>
              <Td><span className="text-second text-slate-500">{p.conges.length ? `signée : ${p.conges.map(e => ETAPES[e]).join(', ')}` : 'non signée'}</span></Td>
            </Tr>
          ))}
        </tbody>
      </Tableau>
      {!d.length && <p className="px-4 py-3 text-sm text-slate-500">Personne n’est encore désigné : Préparer l’année → 1. Personnes et règles.</p>}
    </div>
  );
}

/* LE CALENDRIER DE L'ANNÉE ET SES CONGÉS (3.5.055, Charles : « tu ne me permets pas de générer le calendrier de l'année et
   de fixer les vacances ? »). La direction fixe les périodes de congé ; tant qu'elle ne l'a pas fait, on voit celles du
   calendrier de l'école, à reprendre d'un clic. Le générateur s'en sert ; les cinq semaines d'été se choisissent par
   personne, au générateur. */
function CalendrierConges({ onGenerer }) {
  const [d, setD] = useState(null);
  const [lignes, setLignes] = useState([]);
  const [sale, setSale] = useState(false);
  const charger = () => api('/conges-annee').then(j => {
    setD(j);
    const l = j.periodes.map(p => ({ du: p.du, au: p.au, libelle: p.label || p.libelle || 'Congé' }));
    // Repris de l'école : on propose l'été (5 semaines dès l'ouverture de la fenêtre), à corriger si besoin.
    if (j.source === 'ecole' && !j.semaines_ete && j.reglage?.ete_du) {
      const d0 = new Date(`${j.reglage.ete_du}T00:00:00Z`); const w = (d0.getUTCDay() + 6) % 7; const lundi = new Date(d0.getTime() + ((7 - w) % 7) * 864e5);
      const fin = new Date(lundi.getTime() + 32 * 864e5);
      l.push({ du: lundi.toISOString().slice(0, 10), au: fin.toISOString().slice(0, 10), libelle: 'Vacances d’été' });
    }
    setLignes(l); setSale(j.source === 'ecole'); })
    .catch(e => setD({ erreur: e.message }));
  useEffect(() => { charger(); }, []);
  if (!d) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (d.erreur) return <div className="text-sm text-red-700">{d.erreur}</div>;
  const maj = (i, k, v) => { setLignes(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setSale(true); };
  const enregistrer = async () => {
    try { await api('/conges-annee', { method: 'PUT', body: JSON.stringify({ periodes: lignes }) }); await charger(); setSale(false); informer({ message: 'Congés de l’année fixés.' }); }
    catch (e) { informer({ message: e.message }); }
  };
  const travail = d.semaines_travail, heures = d.heures;
  return (
    <div className="space-y-4">
      <div className="carte overflow-hidden">
        <EnteteCarte titre={`Les congés de l’année ${ANNEE.v}`}
          sous={d.source === 'ecole' ? 'Repris du calendrier de l’école : vérifiez, corrigez, puis « Fixer les congés ».' : 'Fixés par la direction pour le personnel administratif.'}>
          <button className="bouton bouton-fort" disabled={!sale} onClick={enregistrer}>Fixer les congés</button>
        </EnteteCarte>
        <Tableau dense>
          <TableauEntete><Th>Congé</Th><Th>Du</Th><Th>Au</Th><Th /></TableauEntete>
          <tbody>
            {lignes.map((x, i) => (
              <Tr key={i}>
                <Td><input className="controle border border-slate-300 rounded-champ text-sm w-56" value={x.libelle} onChange={e => maj(i, 'libelle', e.target.value)} /></Td>
                <Td><input type="date" className="controle border border-slate-300 rounded-champ text-sm" value={x.du} onChange={e => maj(i, 'du', e.target.value)} /></Td>
                <Td><input type="date" className="controle border border-slate-300 rounded-champ text-sm" value={x.au} onChange={e => maj(i, 'au', e.target.value)} /></Td>
                <Td align="droite"><button className="bouton px-2 py-0.5 text-second" onClick={() => { setLignes(l => l.filter((_, j) => j !== i)); setSale(true); }}>Retirer</button></Td>
              </Tr>
            ))}
          </tbody>
        </Tableau>
        <div className="px-4 py-3 flex flex-wrap items-center gap-2">
          <button className="bouton" onClick={() => { setLignes(l => [...l, { du: '', au: '', libelle: 'Congé' }]); setSale(true); }}>+ Ajouter une période</button>
        </div>
      </div>
      <div className="carte overflow-hidden">
        <EnteteCarte titre="L’année qui en résulte" sous={`Une semaine compte en congé quand ses cinq jours ouvrables tombent dans une période. L’été (entre le ${d.reglage?.ete_du} et le ${d.reglage?.ete_au}) se place par personne, au générateur.`} />
        <div className="px-4 py-3 text-sm space-y-1">
          <p><b>13 semaines de congé</b> par an : ici <b>{d.semaines_conge}</b> semaine(s) de congés scolaires + <b>{d.semaines_ete}</b> semaine(s) d’été = <b>{d.semaines_total}</b>. Restent <b>{travail}</b> semaines de travail : <b>{heures} h</b> dues pour un temps plein (36 h × 39), en proportion pour un temps partiel.</p>
          <p className="text-slate-600">Une personne peut travailler pendant une semaine de congé scolaire (Carnaval, par exemple) : au générateur, on la coche, et son été s’allonge d’autant. Le total reste 13 semaines de congé et 1 404 h.</p>
          {d.source === 'module' && d.semaines_total !== 13 && <p className="text-amber-700">Les congés fixés comptent {d.semaines_total} semaine(s) au lieu de 13 : le générateur ajuste l’été pour garder 39 semaines de travail.</p>}
          {d.source === 'ecole' && <p className="text-amber-700">Rien n’est encore fixé : vérifiez les lignes ci-dessus (l’été est proposé), puis « Fixer les congés ».</p>}
          <button className="bouton mt-2" onClick={onGenerer}>Générer l’année d’une personne →</button>
        </div>
      </div>
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
  const [travaillees, setTravaillees] = useState([]);
  const [cal, setCal] = useState(null);
  const [sim, setSim] = useState(null);
  useEffect(() => { api('/calendrier').then(setCal); }, []);
  useEffect(() => { if (p) { setFormule(p.formule); setFraction(p.fraction); } setSim(null); }, [uid]);
  // L'été s'allonge d'une semaine par semaine de congé travaillée (l'échange).
  // 13 semaines de congé au total : l'été est le complément des congés scolaires réellement pris.
  const a2 = ANNEE.v.split('-')[1];
  const estEte = l => l >= `${a2}-06-15` && l <= `${a2}-08-31`;
  const eteFixe = (cal?.semaines || []).some(x => x.conge && estEte(x.lundi));
  const nEte = 13 - ((cal?.semaines || []).filter(x => x.conge && !estEte(x.lundi)).length - travaillees.length);
  const lundisEte = useMemo(() => (cal?.semaines || []).filter(s => { const fin = new Date(new Date(s.lundi).getTime() + (7 * nEte - 1) * 864e5).toISOString().slice(0, 10); return s.lundi >= cal.reglage.ete_du && fin <= cal.reglage.ete_au; }), [cal, nEte]);
  const corps = () => ({ formule, fraction: Number(fraction), ete: ete || null, jourLibre: Number(jourLibre), travaillees, fortes: Object.fromEntries(Object.entries(fortes).filter(([, v]) => v).map(([k, v]) => [k, Math.round(Number(v) * 60)])) });
  const simuler = async () => { try { setSim(await api(`/generer/${uid}`, { method: 'POST', body: JSON.stringify(corps()) })); } catch (e) { informer({ message: e.message }); } };
  const ecrire = async () => {
    if (!(await demander({ message: 'Enregistrer cette année ? Elle remplace l’année déjà générée pour cette personne (les écarts encodés restent).' }))) return;
    try { await api(`/generer/${uid}`, { method: 'POST', body: JSON.stringify({ ...corps(), ecrire: true }) }); informer({ message: 'Année enregistrée.' }); recharger(); }
    catch (e) { informer({ message: e.message + (e.bilan?.erreurs?.length ? ' ' + e.bilan.erreurs.join(' ') : '') }); }
  };
  if (!actifs.length) return <p className="text-sm text-slate-500">Désignez d’abord les personnes concernées (étape 1 : Personnes et règles).</p>;
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
          {eteFixe ? <span className="text-second text-slate-600">Été : {nEte} semaines, fixé dans « Congés »</span>
            : <label className="flex items-center gap-1.5">Été ({nEte} sem.) à partir du <select className="controle border border-slate-300 rounded-champ" value={ete} onChange={e => setEte(e.target.value)}>
            <option value="">— choisir —</option>{lundisEte.map(s => <option key={s.lundi} value={s.lundi}>{s.lundi}</option>)}</select></label>}
          <button className="bouton" onClick={simuler}>Calculer</button>
          <button className="bouton bouton-fort" disabled={!ok} onClick={ecrire}>Enregistrer l’année</button>
        </div>
        {cal && (
          <div className="px-4 pb-3 text-second text-slate-600">
            <b>Échanger une semaine de congé contre l’été</b> — cochez les semaines de congé où cette personne travaille ; son été passe à {nEte} semaines, d’un seul tenant :
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
              {cal.semaines.filter(x => x.conge && !estEte(x.lundi)).map(x => (
                <label key={x.lundi} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={travaillees.includes(x.lundi)} onChange={e => { setTravaillees(t => (e.target.checked ? [...t, x.lundi] : t.filter(y => y !== x.lundi))); setEte(''); setSim(null); }} />
                  {x.conge} · {fmt(x.lundi)}
                </label>))}
            </div>
          </div>
        )}
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

import { Fragment, useCallback, useEffect, useState } from 'react';
import SchemaCapitalisation from '../components/SchemaCapitalisation.jsx';
import { MonTfe, MonStage } from './TfeStage.jsx';
import MesAbsences from './MesAbsences.jsx';
import MonAmenagement from './MonAmenagement.jsx';
import VisiteGuidee, { visiteVue } from './VisiteGuidee.jsx';
import { BoutonRail } from '../components/RailEspace.jsx';
import LogoLucie from '../components/LogoLucie.jsx';
import FenetreEspace from '../components/FenetreEspace.jsx';
import ChargementLucie from '../components/ChargementLucie.jsx';
import { ListeEtats, LigneEtat, Encadre, EnteteCarte, PastilleEtat, TuileEtat, Tableau, TableauEntete, Th, Td, Tr, TrTotal } from '../components/ui.jsx';
import { IconCertificate, IconFileText, IconBook, IconSignature, IconCheck, IconLogout, IconLock, IconDevices, IconTrash, IconShieldCheck, IconShieldX, IconKey, IconWorld, IconUserCircle, IconAward, IconUpload, IconPlus, IconAlertTriangle, IconListCheck, IconMessages, IconRoute, IconCash, IconHelpCircle, IconCopy, IconSchool, IconBriefcase, IconStethoscope, IconHome, IconCalendarEvent, IconStar, IconChevronRight } from '@tabler/icons-react';

/**
 * L'ESPACE DE L'ÉTUDIANT (3.1.475, Charles : « un mini espace ultra sécurisé : récupérer ses documents, voir ses
 * notes, signer les accusés de réception »). DEPUIS 3.1.477, DE L'AUTRE CÔTÉ DU MUR : ce fichier est servi par le
 * site des étudiants (etudiants.lucie-iip.be, `vite.portail.config.js`) et ne parle qu'au portail (/api/portail),
 * qui n'a ni la base ni les clés de Lucie. Son propre jeton (sessionStorage, « lucie.espace »).
 * Trois faces : résultats délibérés, documents, règlements. Signer un accusé = avoir ouvert la pièce + un code à
 * six chiffres reçu à l'adresse d'école. Serveur : portail/src/serveur.js.
 * ENTRER (3.1.513) : adresse de l'institut + mot de passe choisi par l'étudiant ; un code en plus sur un appareil
 * non reconnu ; le lien par courriel ne sert qu'à la première visite et au mot de passe oublié. Depuis la Belgique.
 */
const CLE = 'lucie.espace';
const lire = () => { try { return sessionStorage.getItem(CLE); } catch { return null; } };
// « Quitter » dans cet onglet (depuis 3.1.513, l'entrée demande toujours le mot de passe : simple repère).
const QUITTE = 'lucie.espace.quitte';
const marquerQuitte = v => { try { v ? sessionStorage.setItem(QUITTE, '1') : sessionStorage.removeItem(QUITTE); } catch { /* */ } };
const poser = t => { try { t ? sessionStorage.setItem(CLE, t) : sessionStorage.removeItem(CLE); } catch { /* navigation privée */ } };
const jourFr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

async function appel(methode, chemin, corps, brut = false) {
  const h = {};
  const t = lire();
  if (t) h.Authorization = `Bearer ${t}`;
  if (corps) h['Content-Type'] = 'application/json';
  const r = await fetch(`/api/portail${chemin}`, { method: methode, headers: h, body: corps ? JSON.stringify(corps) : undefined, credentials: 'same-origin' });
  if (brut && r.ok) return r;
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !chemin.startsWith('/accuser')) { poser(null); const e = new Error(j.error || 'Session expirée.'); e.session = true; throw e; }
  if (!r.ok) { const e = new Error(j.error || `Erreur ${r.status}`); e.donnees = j; e.statut = r.status; throw e; }
  return j;
}


// Le nom court d'un onglet sur téléphone (la grille des onglets, 3.5.009).
const COURT = { aujourdhui: 'Aujourd’hui', messages: 'Messages', parcours: 'Parcours', documents: 'Documents', demarches: 'Démarches', frais: 'Frais', aide: 'Aide', compte: 'Compte' };

/** L'accusé d'une pièce : ouvrir, puis signer par code. */
function Accuse({ type, id, presente, signe, onFait, onErreur }) {
  const [etape, setEtape] = useState(null);   // null | 'code'
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  if (signe) return <span className="inline-flex items-center gap-1 text-second" style={{ color: 'var(--c-reussi)' }}><IconCheck size={15} /> Accusé signé le {jourFr(signe)}</span>;
  if (!presente) return <span className="text-second text-slate-500">Ouvrez la pièce pour pouvoir en accuser réception.</span>;
  const demanderCode = async () => {
    try { const j = await appel('POST', '/code', { objet_type: type, objet_id: id }); setMsg(j.message); setEtape('code'); }
    catch (e) { onErreur(e); }
  };
  const signer = async ev => {
    ev.preventDefault();
    try { await appel('POST', '/accuser', { objet_type: type, objet_id: id, code }); onFait(); }
    catch (e) { setMsg(e.message); }
  };
  if (etape !== 'code') {
    return <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" onClick={demanderCode}>
      <IconSignature size={15} /> Signer l’accusé de réception</button>;
  }
  return (
    <form onSubmit={signer} className="flex flex-wrap items-center gap-2">
      <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
        placeholder="Code à 6 chiffres" className="controle w-40 tracking-widest" autoFocus />
      <button type="submit" className="bouton bouton-fort" disabled={code.length !== 6}>Signer</button>
      <button type="button" className="text-second text-iip-blue underline" onClick={demanderCode}>Nouveau code</button>
      {msg && <span className="text-second text-slate-600 w-full">{msg}</span>}
    </form>
  );
}

/** Au-delà de 90 jours, un document s'ouvre par un code reçu à l'adresse de l'institut (anti-fraude). */
function Deverrouiller({ doc, onOuvrir, onErreur }) {
  const [etape, setEtape] = useState(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  const demander = async () => {
    try { const j = await appel('POST', '/code', { objet_type: 'telechargement', objet_id: doc.id }); setMsg(j.message); setEtape('code'); }
    catch (e) { onErreur(e); }
  };
  const valider = async ev => {
    ev.preventDefault();
    try { await appel('POST', `/documents/${doc.id}/deverrouiller`, { code }); onOuvrir(doc); }
    catch (e) { setMsg(e.message); }
  };
  if (etape !== 'code') return <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={demander}><IconLock size={15} /> Recevoir un code</button>;
  return (
    <form onSubmit={valider} className="flex flex-wrap items-center gap-2">
      <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
        placeholder="Code à 6 chiffres" className="controle w-40 tracking-widest" autoFocus />
      <button type="submit" className="bouton bouton-fort" disabled={code.length !== 6}>Ouvrir</button>
      {msg && <span className="text-second text-slate-600 w-full">{msg}</span>}
    </form>
  );
}

/** Mes appareils : ceux qui entrent sans lien ; en oublier un. */
function MesAppareils({ onErreur, onOublieCourant }) {
  const [l, setL] = useState(null);
  const charger = useCallback(() => appel('GET', '/appareils').then(setL).catch(onErreur), [onErreur]);
  useEffect(() => { charger(); }, [charger]);
  if (!l) return <ChargementLucie />;
  const oublier = async a => {
    try { await appel('POST', `/appareils/${a.id}/oublier`); if (a.courant) onOublieCourant(); else charger(); } catch (e) { onErreur(e); }
  };
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">Sur ces appareils, votre mot de passe suffit, pendant {l.jours} jours après leur dernière visite ;
        ailleurs, un code reçu par courriel est demandé en plus.{` ${l.max} au plus`}. Un appareil que vous ne reconnaissez pas ? Oubliez-le.</p>
      {l.appareils.length ? l.appareils.map(a => (
        <div key={a.id} className="bloc-etat px-4 py-3 flex flex-wrap items-center gap-3" data-etat="disponible">
          <IconDevices size={18} className="text-slate-400 flex-none" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-iip-texte">{a.nom || 'Appareil'}{a.courant ? ' — celui-ci' : ''}</div>
            <div className="text-second text-slate-500">reconnu le {jourFr(a.cree_le)}{a.vu_le ? ` · dernière visite le ${jourFr(a.vu_le)}` : ''}</div>
          </div>
          <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => oublier(a)}><IconTrash size={15} /> Oublier</button>
        </div>)) : <p className="text-sm text-slate-500">Aucun appareil reconnu : chaque entrée demande un code reçu à votre adresse de l’institut.</p>}
    </div>
  );
}

/* LA VÉRIFICATION D'UNE PIÈCE (3.1.511, Charles : « si quelqu'un scanne, il sait que c'est un vrai ») — publique,
   sans compte : le QR d'une pièce mène ici (/?v=<référence>). */
function Verification({ reference }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    fetch(`/api/portail/verifier/${encodeURIComponent(reference)}`).then(x => x.json()).then(setR).catch(() => setR({ erreur: true }));
  }, [reference]);
  const Ligne = ({ l, v }) => v ? <div className="grid grid-cols-[8rem_1fr] gap-3 py-1.5 border-t border-slate-100 first:border-t-0">
    <span className="text-second text-slate-500">{l}</span><span className="text-sm text-iip-texte">{v}</span></div> : null;
  return (
    <div className="min-h-screen px-4 py-8" style={{ background: 'var(--page-fond)' }}>
      <div className="space-y-4">
        <div className="flex items-center gap-3"><LogoLucie hauteur={30} className="" /><div className="text-second text-slate-500">Vérification d’une pièce · Institut Ilya Prigogine</div></div>
        {!r ? <p className="text-sm text-slate-500">Vérification…</p> : r.trouve ? (
          <div className="bloc-etat px-5 py-4 space-y-3" data-etat="reussi">
            <h1 className="titre-ecran flex items-center gap-2"><IconShieldCheck size={22} style={{ color: 'var(--c-reussi)' }} /> Pièce authentique</h1>
            <p className="text-sm text-slate-600">L’Institut Ilya Prigogine a bien émis une pièce sous cette référence. Comparez-la au document que vous avez en main :
              une pièce modifiée ne correspond plus.</p>
            <div>
              <Ligne l="Référence" v={r.reference} />
              <Ligne l="Nature" v={r.nature} />
              <Ligne l="Objet" v={r.objet} />
              <Ligne l="Au nom de" v={r.personne} />
              {r.decision_le && <Ligne l="Date de la décision (Conseil des études)" v={jourFr(r.decision_le)} />}
              {r.note && <Ligne l="Note portée par la pièce" v={r.note} />}
              <Ligne l="Pièce émise le" v={jourFr(r.emise_le)} />
              <Ligne l="Par" v={r.etablissement} />
            </div>
          </div>
        ) : (
          <div className="bloc-etat px-5 py-4 space-y-2" data-etat="corriger">
            <h1 className="titre-ecran flex items-center gap-2"><IconShieldX size={22} style={{ color: 'var(--c-refuse)' }} /> Référence inconnue</h1>
            <p className="text-sm text-slate-600">{r.erreur ? 'La vérification n’a pas pu se faire. Réessayez dans un instant.'
              : <>L’Institut Ilya Prigogine n’a émis aucune pièce sous la référence <b>{r.reference || reference}</b>. Vérifiez la saisie ;
                si elle est exacte, ce document n’est pas une pièce de l’Institut. En cas de doute, contactez le secrétariat.</>}</p>
          </div>)}
      </div>
    </div>
  );
}

/* VALIDER SON PAE À LA PREMIÈRE CONNEXION (3.5.275, Charles : « à la première connexion, ils doivent valider leur PAE » ;
   tranché : un bouton « Je confirme » ; s'il n'est pas d'accord, il le signale par un message et entre quand même — la validation
   lui est redemandée à chaque connexion tant qu'elle n'est pas faite). Le programme de l'année tel qu'il est dans Lucie. */
const PAE_REMIS = 'lucie.paeRemis';
function ValiderPAE({ annee, onFait }) {
  const [o, setO] = useState(null);
  const [lu, setLu] = useState(false);
  const [desaccord, setDesaccord] = useState(false);
  const [mot, setMot] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => { appel('GET', '/pae').then(j => setO(j.offre)).catch(e => setErreur(e.message)); }, []);
  const ues = (o?.unites || []).filter(u => u.inscrite);
  const valider = async () => {
    setEnvoi(true); setErreur(null);
    try { await appel('POST', '/pae/valider', { accepte: true, programme: o.programme }); onFait('valide'); }
    catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  };
  const signaler = async () => {
    setEnvoi(true); setErreur(null);
    try { await appel('POST', '/pae/signaler', { message: mot }); try { sessionStorage.setItem(PAE_REMIS, '1'); } catch { /* */ } onFait('signale'); }
    catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  };
  return (
    <FenetreEspace titre={`Votre programme ${annee || ''}`} sous="À valider avant d’entrer dans votre espace" large
      pied={desaccord
        ? <><button type="button" className="bouton" onClick={() => setDesaccord(false)}>Retour</button>
            <button type="button" className="bouton bouton-signaler" disabled={envoi || mot.trim().length < 5} onClick={signaler}>Envoyer à ma coordination</button></>
        : <><button type="button" className="bouton bouton-signaler inline-flex items-center gap-1.5"
              onClick={() => setDesaccord(true)}><IconAlertTriangle size={15} /> Mon PAE n’est pas juste, j’en informe la coordination</button>
            <button type="button" className="bouton bouton-confirmer inline-flex items-center gap-1.5"
              disabled={envoi || !lu || !o} onClick={valider}><IconCheck size={15} /> Je confirme mon PAE</button></>}>
      <div className="space-y-3 text-sm">
        {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
        {!o ? <p className="text-slate-500">Chargement de votre programme…</p> : desaccord ? (<>
          <p className="m-0">Dites ce qui ne va pas : une unité qui manque, une unité en trop… Votre coordination et le secrétariat
            recevront votre message et vous répondront. Vous pourrez entrer dans votre espace ; la validation vous sera redemandée.</p>
          <textarea className="controle w-full !h-auto py-2" rows={4} value={mot} onChange={e => setMot(e.target.value)} placeholder="Par exemple : l’UE 250 manque à mon programme." />
        </>) : (<>
          <p className="m-0">Voici les unités auxquelles vous êtes inscrit·e cette année. Relisez-les, puis confirmez.</p>
          <div className="carte overflow-hidden">
            <Tableau dense className="!border-0 !rounded-none">
              <TableauEntete><Th>Unité</Th><Th align="droite">ECTS</Th></TableauEntete>
              <tbody>
                {ues.length ? ues.map(u => <Tr key={u.ue_num}><Td>UE {u.ue_num} — {u.ue_nom}</Td><Td align="droite">{u.ects ?? ''}</Td></Tr>)
                  : (o.programme || []).map(n => <Tr key={n}><Td>UE {n}</Td><Td /></Tr>)}
              </tbody>
            </Tableau>
          </div>
          <label className="flex items-start gap-2 cursor-pointer"><input type="checkbox" className="mt-0.5" checked={lu} onChange={e => setLu(e.target.checked)} />
            <span>J’ai lu mon programme de {annee} et je le confirme.</span></label>
        </>)}
      </div>
    </FenetreEspace>);
}

/* LE DÉTAIL D'UNE NOTE (3.5.316 ; en VOLET depuis 3.5.320, Charles : « pas une fenêtre qui s'ouvre, un volet qui se déplie, avec
   des couleurs ; et surtout la liste des examens à repasser, quand »). Calculé par Lucie (portailSync, `detailResultat`) : jamais
   une cote sous 10, une faveur vaut 10 partout. Vert : acquis ; orange : à représenter ; fraise : non acquis (refus) ; violet :
   accordé par le Conseil. */
const dateFr = x => (x ? new Date(`${String(x).slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');
function caseNote(note, { faveur, representer, refuse, petit = false }) {
  const chiffre = /^\d+$/.test(String(note));
  const fond = faveur ? 'var(--c-faveur)' : chiffre ? 'var(--c-reussi)' : note === 'NA' ? (representer ? 'var(--c-attente)' : refuse ? 'var(--c-refuse)' : 'var(--c-attente)') : null;
  return fond
    ? <span className={`inline-flex items-center justify-center ${petit ? 'min-w-[3rem] h-5 text-mention' : 'min-w-[3.5rem] h-7'} px-2 rounded-champ text-white font-semibold tabular-nums flex-none`} style={{ background: fond }}>{note}{chiffre ? '/20' : ''}</span>
    : <span className="text-slate-400">{note}</span>;
}
/* UNE LIGNE, UNE HAUTEUR (3.5.330, Charles : « pas de lignes plus hautes que d'autres ; "…" et cliquer pour ouvrir le détail ; la note
   pas dans un badge, mais comme une fin de ligne sur fond de couleur »). Chaque cours et chaque acquis tient sur une ligne de même
   hauteur, même police ; le texte trop long finit par « … » ; un clic ouvre la ligne (texte entier, motivation). La note est un bloc
   de couleur au bout de la ligne, de largeur fixe. */
const H_LIGNE = 'h-10';
function finDeLigne(note, { faveur, representer, refuse }) {
  const chiffre = /^\d+$/.test(String(note));
  const fond = faveur ? 'var(--c-faveur)' : chiffre ? 'var(--c-reussi)' : note === 'NA' ? (refuse && !representer ? 'var(--c-refuse)' : 'var(--c-attente)') : null;
  return (
    <span className="flex-none w-20 self-stretch flex items-center justify-center font-semibold tabular-nums text-sm"
      style={fond ? { background: fond, color: '#fff' } : { background: 'rgb(var(--gris-100))', color: 'rgb(var(--gris-400))' }}>
      {note}{chiffre ? '/20' : ''}
    </span>);
}
function VoletResultat({ u }) {
  const d = u.detail;
  const [ouverte, setOuverte] = useState(null);   // la ligne dépliée (texte entier, motivation)
  const refuse = u.etat === 'corriger';
  const deux = (d.cours || []).some(c => c.note_s1 != null);
  const ligne = ({ cle, texte, note, note1, fort, retrait, representer, detail }) => {
    const ouv = ouverte === cle;
    return (
      <div key={cle} className="border-t border-slate-100">
        <button type="button" onClick={() => setOuverte(ouv ? null : cle)}
          className={`w-full flex items-stretch text-left text-sm ${ouv ? 'min-h-10' : H_LIGNE} hover:bg-slate-50`}>
          <span className={`flex-1 min-w-0 flex items-center gap-2 ${retrait ? 'pl-8' : 'pl-4'} pr-3`}>
            <span className={`${ouv ? 'py-2' : 'truncate'} ${fort ? 'font-semibold text-iip-texte' : 'text-slate-600'}`}>{texte}</span>
            {detail?.motif && !ouv && <span className="flex-none text-mention text-iip-blue">pourquoi ?</span>}
          </span>
          {deux && <span className="flex-none w-20 self-stretch flex items-center justify-center border-l border-white">{finDeLigne(note1 ?? '—', { faveur: false, representer: true, refuse: false })}</span>}
          {finDeLigne(note, { faveur: d.faveur, representer, refuse })}
        </button>
        {ouv && (detail?.motif || detail?.suite) && (
          <div className={`${retrait ? 'pl-8' : 'pl-4'} pr-24 pb-2 text-second text-slate-600 space-y-1`}>
            {detail?.motif && <div className="pl-3 border-l-2 whitespace-pre-line" style={{ borderColor: refuse ? 'var(--c-refuse)' : 'var(--c-attente)' }}>
              <span className="text-mention text-slate-500">Motivation du Conseil des études — </span>{detail.motif}</div>}
            {detail?.suite && <div className="text-slate-500">{detail.suite}</div>}
          </div>)}
      </div>);
  };
  // `w-0 min-w-full` : le volet ne pousse jamais la largeur du tableau (sinon « … » ne coupe rien et la note sort de l'écran).
  return (
    <div className="bg-white w-0 min-w-full">
      {deux && <div className="flex justify-end text-mention text-slate-500 border-t border-slate-100"><span className="w-20 text-center py-1">1re session</span><span className="w-20 text-center py-1">2e session</span></div>}
      {d.cours.map(c => {
        const rep = c.a_representer;
        const suite = [rep ? `À représenter : ${rep.length ? rep.join(', ') : 'tout le cours'}${c.examen ? ` — examen le ${dateFr(c.examen.date)}${c.examen.heure ? ` à ${c.examen.heure}` : ''}${c.examen.local ? `, local ${c.examen.local}` : ''}` : ' — date d’examen à venir'}` : null,
          c.visite ? `Visite des copies : ${c.visite.rdv ? 'sur rendez-vous, contactez le professeur' : `${dateFr(c.visite.date)}${c.visite.heure ? ` à ${c.visite.heure}` : ''}${c.visite.local ? `, local ${c.visite.local}` : ''}`}` : null].filter(Boolean).join(' · ');
        return (
          <div key={c.code}>
            {ligne({ cle: c.code, texte: `${c.code} ${c.nom}${rep ? ' — à représenter' : ''}`, note: c.note, note1: c.note_s1, fort: true, representer: !!rep, detail: { suite } })}
            {c.acquis.map(a => ligne({ cle: `${c.code}|${a.code}`, texte: `${a.code} ${a.libelle}`, note: a.note, note1: a.note_s1, retrait: true,
              representer: rep && (!rep.length || rep.includes(a.code)), detail: { motif: a.motif } }))}
          </div>);
      })}
      {d.faveur && <p className="text-second text-slate-500 px-4 py-2 m-0 border-t border-slate-100">L’unité vous a été accordée par le Conseil des études : chaque note vaut 10.</p>}
    </div>);
}
/** Les examens à repasser : tous les cours à représenter de l'année, par date. */
function ExamensARepasser({ resultats }) {
  const liste = resultats.flatMap(a => a.ues.flatMap(u => (u.detail?.cours || []).filter(c => c.a_representer)
    .map(c => ({ ue: u, c })))).sort((x, y) => String(x.c.examen?.date || '9999').localeCompare(String(y.c.examen?.date || '9999')));
  if (!liste.length) return null;
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte titre="Mes examens à repasser" sous="Seconde session : ce que vous représentez, et quand." />
      <ListeEtats className="!border-0 !rounded-none">
        {liste.map(({ ue, c }) => (
          <LigneEtat key={`${ue.ue_num}|${c.code}`} etat="surveiller"
            titre={<><b>{c.code}</b> {c.nom}</>}
            sous={`UE ${ue.ue_num} · ${c.a_representer.length ? `acquis ${c.a_representer.join(', ')}` : 'tout le cours'}`}
            droite={<span className="text-sm font-semibold text-right">{c.examen ? <>{dateFr(c.examen.date)}{c.examen.heure ? ` à ${c.examen.heure}` : ''}{c.examen.local ? <span className="block font-normal text-slate-500">local {c.examen.local}</span> : null}</> : <span className="font-normal text-slate-500">date à venir</span>}</span>} />))}
      </ListeEtats>
    </section>);
}

export default function EspaceEtudiant() {
  const aVerifier = new URLSearchParams(window.location.search).get('v');
  if (aVerifier) return <Verification reference={aVerifier} />;
  return <Espace />;
}

const eur = n => `${(Number(n) || 0).toFixed(2).replace('.', ',')} €`;
const PORTE = { va: 'VA', vae: 'VAE' };

/** Une pièce, de l'appareil au portail (25 Mo au plus) ; Lucie la relève et la range au dossier. */
async function deposerPiece(ue, nature, fichier) {
  const t = lire();
  const r = await fetch(`/api/portail/va/piece?ue_num=${ue}&nature=${encodeURIComponent(nature)}&nom=${encodeURIComponent(fichier.name)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: fichier });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || (r.status === 413 ? 'Fichier trop lourd (25 Mo au plus).' : `Erreur ${r.status}`));
}

/** LA DEMANDE DE VALORISATION EN LIGNE (3.1.514) : derrière le mur, Lucie relève et juge chaque geste. */
/* LA VALORISATION PAS À PAS (3.5.006, Charles, 31 octobre 2026 : « il faut dire à l'étudiant ce qui est attendu de lui…
   pas à pas, comme un tutoriel » ; « cela doit surtout respecter la circulaire »). D'abord ce que sont la VA, la VAE et
   l'admission, les règles dépliables ; puis la demande en trois étapes, celles du formulaire de la circulaire 9447
   (annexes 6 et 7) : ma demande · mes documents probants · la motivation, acquis par acquis ; puis « je certifie » et
   l'envoi. Les pièces sont numérotées : la motivation les cite. */
const ORIGINES = [
  ['Mon parcours dans l’enseignement', ['DIP', 'REL', 'DP']],
  ['Un organisme de formation ou un centre de validation', ['ATT']],
  ['Mon expérience professionnelle ou personnelle', ['EXP', 'CT', 'CV']],
  ['Autre', ['DEM', 'CI', 'AUT']],
];
const ATTENDU = {
  va: ['Le diplôme, le certificat, l’attestation de réussite ou le bulletin', 'Ce qu’ils couvrent : programme, contenu des cours, acquis, crédits, fiche ECTS', 'Si utile : grille horaire, heures de cours, relevé d’heures de stage'],
  vae: ['Le contrat de travail, la description de fonction, une attestation de service ou des tâches réalisées', 'Un projet, un portfolio, des réalisations', 'Ce qui vient de votre vie personnelle : bénévolat, loisirs, langues, autoformation'],
};
function Etapes({ faits }) {
  const noms = ['Ma demande', 'Mes documents', 'Ma motivation', 'Envoyer'];
  const courant = faits.findIndex(f => !f);
  return (
    <div className="flex">
      {noms.map((n, i) => {
        const fait = faits[i], actif = i === courant;
        return (
          <div key={n} className="flex-1 text-center relative text-second" style={{ color: actif ? 'var(--c-principal)' : 'rgb(var(--gris-500))', fontWeight: actif ? 600 : 400 }}>
            {i > 0 && <span className="absolute top-[13px] right-1/2 w-full h-0.5" style={{ background: fait || actif ? 'var(--c-reussi)' : 'rgb(var(--gris-200))' }} />}
            <span className="relative z-10 mx-auto mb-1 w-7 h-7 rounded-full grid place-items-center font-bold border-2"
              style={fait ? { background: 'var(--c-reussi)', borderColor: 'var(--c-reussi)', color: 'var(--blanc, #fff)' }
                : actif ? { background: 'var(--c-principal)', borderColor: 'var(--c-principal)', color: 'var(--blanc, #fff)' }
                  : { background: 'var(--c-fond_tuile)', borderColor: 'rgb(var(--gris-300))' }}>{fait ? <IconCheck size={15} /> : i + 1}</span>
            {n}
          </div>);
      })}
    </div>);
}
const Zone = ({ n, titre, children, pale }) => (
  <section className={`carte overflow-hidden ${pale ? 'opacity-60' : ''}`}>
    <EnteteCarte titre={<span className="inline-flex items-center gap-2">
      <span className="w-6 h-6 rounded-full grid place-items-center text-mention flex-none" style={{ background: 'var(--c-principal)', color: 'var(--blanc, #fff)' }}>{n}</span>{titre}</span>} />
    <div className="px-4 py-3 space-y-2">{children}</div>
  </section>);
const Plus = ({ titre, children }) => (
  <details className="text-sm py-1.5 border-b border-slate-100 last:border-b-0">
    <summary className="cursor-pointer font-semibold text-iip-blue">{titre}</summary>
    <div className="mt-1.5 text-slate-700 space-y-1">{children}</div>
  </details>);

function CarteAdmission({ adm }) {
  const entete = l => /^en\s.+,$/i.test(l) || /:$/.test(l);
  return (
    <div className="bloc-etat px-3 py-2.5 space-y-1.5" data-etat="neutre">
      <div className="text-sm font-semibold text-iip-texte">Admission — l’épreuve d’entrée</div>
      <p className="text-second text-slate-600">Vous n’avez pas le titre demandé pour entrer dans la section{adm?.titre ? <> ({adm.titre.replace(/\.$/, '')})</> : ''} ?
        Vous pouvez passer une <b>épreuve d’admission</b> qui vous en donne l’accès.</p>
      {adm?.capacites?.length > 0 && (
        <details className="text-second">
          <summary className="cursor-pointer font-semibold text-iip-blue">Ce que l’épreuve vérifie{adm.section ? ` en ${adm.section}` : ''}</summary>
          {adm.capacites.map((c, i) => (
            <div key={i} className="mt-1.5 space-y-0.5">
              {adm.capacites.length > 1 && <div className="text-second text-slate-500">UE {c.ues.join(', ')}</div>}
              {c.lignes.map((l, j) => entete(l) ? <div key={j} className="font-semibold text-slate-700 pt-1">{l}</div>
                : <div key={j} className="pl-3 text-slate-700">· {l}</div>)}
            </div>))}
          {adm.exemples && <div className="mt-2 space-y-1">
            {adm.exemples.split('\n').filter(Boolean).map((l, i) => <p key={i} className="text-slate-600">{l}</p>)}</div>}
        </details>)}
      <p className="text-second text-slate-600">La demande d’admission et l’inscription à l’épreuve se font au secrétariat, qui vous en communique la date.</p>
    </div>);
}

function MesValorisations({ onErreur }) {
  const [v, setV] = useState(null);
  const [ue, setUe] = useState('');
  const [porte, setPorte] = useState('');
  const [nature, setNature] = useState({});
  const [brouillon, setBrouillon] = useState({});   // `${ue}|${aa}` → { texte, pieces: [] }
  const [certifie, setCertifie] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);
  const charger = useCallback(() => appel('GET', '/va').then(setV).catch(onErreur), [onErreur]);
  useEffect(() => { charger(); }, [charger]);
  // Tant que Lucie n'a pas relevé (quelques secondes), on regarde à nouveau.
  const attend = v && (!v.pret || v.en_attente.length > 0);
  useEffect(() => { if (!attend) return undefined; const t = setTimeout(charger, 4000); return () => clearTimeout(t); }, [attend, v, charger]);
  if (!v) return <ChargementLucie />;
  if (!v.pret) return <p className="text-sm text-slate-500">Préparation de vos unités… quelques secondes.</p>;

  const geste = async (chemin, corps, ok) => {
    setEnCours(true); setMessage(null);
    try { await appel('POST', chemin, corps); ok?.(); await charger(); } catch (e) { onErreur(e); } finally { setEnCours(false); }
  };
  const unites = v.offre?.unites || [];
  const ouvertes = new Set([...v.etat.map(d => d.ue_num), ...v.en_attente.filter(g => g.type === 'ouvrir').map(g => g.ue_num)]);
  const libres = unites.filter(u => !ouvertes.has(u.ue_num));
  const choisie = libres.find(u => String(u.ue_num) === String(ue));
  const enAttente = (u, type) => v.en_attente.filter(g => g.ue_num === u && (!type || g.type === type));
  const natures = v.offre?.natures || [];
  const ajouter = async (u, ev) => {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setEnCours(true);
    try { await deposerPiece(u, nature[u] || 'AUT', f); await charger(); } catch (e) { onErreur(e); } finally { setEnCours(false); }
  };
  const demandes = [...v.etat, ...v.en_attente.filter(g => g.type === 'ouvrir').map(g => ({ ue_num: g.ue_num, porte: g.porte, attente: true,
    ue_nom: unites.find(u => u.ue_num === g.ue_num)?.ue_nom, pieces: [], modifiable: true, frise: [],
    acquis: unites.find(u => u.ue_num === g.ue_num)?.acquis || [], motivations: {} }))];
  // La motivation telle qu'elle sera une fois relevée : l'enregistré, puis les gestes en route.
  const motivation = (d, code) => {
    const g = [...enAttente(d.ue_num, 'motiver')].reverse().find(x => x.nature === code);
    if (g) return { texte: g.texte || '', pieces: String(g.porte || '').split(',').map(Number).filter(Boolean) };
    return d.motivations?.[code] || { texte: '', pieces: [] };
  };
  const ouvertesALaMain = demandes.filter(d => d.modifiable);
  const manques = d => {
    const m = [];
    if (!d.pieces.length && !enAttente(d.ue_num, 'piece').length) m.push('aucune pièce');
    const nm = (d.acquis || []).filter(a => !motivation(d, a.code).texte.trim()).length;
    if (nm) m.push(`${nm} acquis à motiver`);
    return m;
  };
  const faits = [
    demandes.length > 0,
    demandes.length > 0 && demandes.every(d => d.pieces.length > 0 || enAttente(d.ue_num, 'piece').length > 0),
    demandes.length > 0 && demandes.every(d => (d.acquis || []).every(a => motivation(d, a.code).texte.trim())),
    demandes.length > 0 && demandes.every(d => d.certifie_le || !d.modifiable),
  ];
  const incomplets = ouvertesALaMain.map(d => ({ d, m: manques(d) })).filter(x => x.m.length);

  return (
    <div className="space-y-4">
      {/* CE QUE C'EST — AVANT TOUT GESTE. */}
      <section className="space-y-2">
        <h2 className="titre-carte">Faire reconnaître ce que vous savez déjà</h2>
        <p className="text-sm text-slate-600">Vous maîtrisez déjà, par des études ou par l’expérience, ce qu’enseigne une unité ? Le Conseil des études
          peut vous en dispenser : c’est la <b>valorisation des acquis</b>.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {[['va', 'VA — par des études', <>Des acquis <b>formels</b> : un diplôme, une attestation de réussite, des crédits, un titre de compétence…</>],
            ['vae', 'VAE — par l’expérience', <>Des acquis <b>informels ou non formels</b> : votre travail, une formation non diplômante, le bénévolat, la vie personnelle.</>]].map(([p, t, txt]) => (
            <div key={p} className="bloc-etat px-3 py-2.5 space-y-1.5" data-etat="disponible">
              <div className="text-sm font-semibold text-iip-texte">{t}</div>
              <p className="text-second text-slate-600">{txt}</p>
              <details className="text-second"><summary className="cursor-pointer font-semibold text-iip-blue">Que faut-il montrer ?</summary>
                <ul className="mt-1 pl-4 list-disc text-slate-700">{ATTENDU[p].map(l => <li key={l}>{l}</li>)}</ul>
                {p === 'va' && <p className="mt-1 text-slate-600">Les originaux se présentent au secrétariat ; l’école en garde une copie.</p>}
                {p === 'vae' && <p className="mt-1 text-slate-600">Le Conseil peut décider sur dossier, ou vous faire passer un test ou une épreuve.</p>}
              </details>
            </div>))}
          <CarteAdmission adm={v.offre?.admission} />
        </div>
        <div className="carte px-4 py-1">
          <Plus titre="Ce que le Conseil peut décider"><ul className="pl-4 list-disc space-y-1">
            <li><b>Dispense complète</b> : vous maîtrisez de façon globale et suffisante <b>tous</b> les acquis de l’unité. Vous ne la suivez pas et recevez une attestation de réussite « valorisation », avec des points en pourcentage.</li>
            <li><b>Dispense partielle</b> : vous maîtrisez certains acquis ; vous êtes dispensé des activités qui y correspondent, mais vous restez inscrit à l’unité et présentez l’évaluation que le Conseil précise.</li>
            <li><b>Refus</b>, motivé : le Conseil dit quel acquis n’est pas atteint.</li></ul></Plus>
          <Plus titre="Ce qui ne se valorise pas"><ul className="pl-4 list-disc space-y-1">
            <li>L’épreuve intégrée, les unités sans prestations d’étudiants, celles qu’une réglementation impose de suivre.</li>
            <li>Un stage : votre activité professionnelle peut tenir lieu de tout ou partie des heures de stage, mais pas des évaluations, tests et rapports.</li></ul></Plus>
          <Plus titre="Dans l’enseignement supérieur"><ul className="pl-4 list-disc space-y-1">
            <li>Au moins 30 crédits doivent être suivis dans l’établissement qui délivre le diplôme.</li>
            <li>Par l’expérience, une valorisation porte sur moins de 60 crédits.</li></ul></Plus>
          <Plus titre="Délai, frais, décision"><ul className="pl-4 list-disc space-y-1">
            <li>Une demande par unité, dans le délai affiché pour chacune. Hors délai, elle n’est pas prise en considération.</li>
            <li>Vous payez vos frais d’inscription sur la base de votre PAE. Si une <b>dispense complète</b> (VA ou VAE de toute l’unité) vous est accordée, vous n’êtes plus redevable du droit d’inscription de cette unité : vos frais sont revus.</li>
            <li>L’instruction d’une demande de VA ou de VAE coûte des frais d’inscription complémentaires, annoncés avant l’envoi, dus dès la demande, quelle que soit la décision.</li>
            <li>La décision vous est communiquée au plus tard deux jours ouvrables après la séance du Conseil. Elle est définitive et ne peut faire l’objet d’aucun recours (décrets liés à l’organisation de l’enseignement pour adultes et de la valorisation des acquis).</li></ul></Plus>
        </div>
      </section>

      {v.refus.map(r => (
        <div key={r.id} className="bloc-etat px-3 py-2 text-sm flex gap-2" data-etat="corriger"><IconAlertTriangle size={16} className="flex-none text-slate-400" />
          <span className="flex-1">{r.ue_num ? `UE ${r.ue_num} — ` : ''}{r.nom ? `${r.nom} : ` : ''}{r.erreur}</span></div>))}
      {v.refus.length > 0 && <button type="button" className="text-second text-iip-blue underline" onClick={() => geste('/va/refus-lus')}>J’ai compris</button>}
      {message && <div className="bloc-etat px-3 py-2 text-sm" data-etat="reussi">{message}</div>}

      {/* LA DEMANDE, EN TROIS ÉTAPES. */}
      <section className="space-y-3">
        <h2 className="titre-carte">Votre demande, unité par unité, en 3 étapes</h2>
        <p className="text-second text-slate-500">Les trois étapes du formulaire officiel. Vous pouvez vous arrêter et revenir : tout est gardé.</p>
        <Etapes faits={faits} />

        {libres.length > 0 && (
          <Zone n="1" titre={demandes.length ? 'Ma demande — une autre unité ?' : 'Ma demande'}>
            <p className="text-second text-slate-500">L’unité que vous voulez faire reconnaître, puis sur quoi vous vous appuyez. Le prix et la date limite s’affichent avant de confirmer.</p>
            <select value={ue} onChange={e => setUe(e.target.value)} className="controle w-full min-w-0">
              <option value="">Quelle unité ? (section {v.offre?.section || '—'})</option>
              {libres.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}{u.au_pae ? ' · à mon programme' : ''}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              {['va', 'vae'].map(p => (
                <button key={p} type="button" onClick={() => setPorte(p)} className={`bouton min-w-0 !whitespace-normal !h-auto py-2 leading-tight ${porte === p ? 'bouton-fort' : ''}`}>
                  {p === 'va' ? 'VA — par des études' : 'VAE — par l’expérience'}</button>))}
            </div>
            {choisie && (
              <div className="bloc-etat px-3 py-2 text-sm space-y-1" data-etat={choisie.hors_delai ? 'surveiller' : 'disponible'}>
                {choisie.echeance && <div>{choisie.hors_delai
                  ? <>Le délai est dépassé (au plus tard le {jourFr(choisie.echeance)}) : la demande risque de ne pas être prise en considération.</>
                  : <>À introduire au plus tard le <b>{jourFr(choisie.echeance)}</b>.</>}</div>}
                <div><b>Frais d’instruction : {eur(choisie.prix)}</b>, dus dès la demande, quelle que soit la décision.</div>
                {choisie.au_pae && <div>Si la dispense complète vous est accordée, le droit d’inscription de l’UE {choisie.ue_num} n’est plus dû : vos frais seront revus.</div>}
              </div>)}
            <button type="button" className="bouton bouton-fort w-full" disabled={!choisie || !porte || enCours}
              onClick={() => geste('/va/ouvrir', { ue_num: Number(ue), porte }, () => { setUe(''); setPorte(''); })}>
              Ouvrir la demande{choisie ? ` pour l’UE ${choisie.ue_num}` : ''}</button>
          </Zone>)}

        {demandes.map(d => (
          /* PLUS DE LISERÉ AUTOUR DES CARTES (3.5.332, audit) : un intertitre par demande, puis ses étapes en cartes. */
          <div key={d.ue_num} className="space-y-2 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="intertitre m-0 flex-1 min-w-0 truncate">UE {d.ue_num} {d.ue_nom || ''}</h3>
              <PastilleEtat etat="disponible">{PORTE[d.porte] || d.porte}</PastilleEtat>
              {!d.attente && d.en_ligne && d.modifiable && <button type="button" className="text-second text-iip-blue underline" disabled={enCours}
                onClick={() => geste('/va/retirer', { ue_num: d.ue_num })}>Retirer cette demande</button>}
            </div>
            {d.attente && <p className="text-second text-slate-500">Envoyée à l’école : enregistrée dans quelques secondes.</p>}
            {enAttente(d.ue_num, 'retirer').length > 0 && <p className="text-second text-slate-500">Retrait de la demande en cours…</p>}

            <Zone n="2" titre="Mes documents probants">
              <p className="text-second text-slate-500">Tout ce qui prouve que vous maîtrisez les acquis de l’unité. Une pièce à la fois : dites ce que c’est,
                puis choisissez le fichier (PDF, photo, Word — 25 Mo au plus). Chaque pièce reçoit un numéro, que vous citerez à l’étape 3.</p>
              {!d.pieces.length && <ul className="text-second text-slate-600 pl-4 list-disc">{(ATTENDU[d.porte] || ATTENDU.va).map(l => <li key={l}>{l}</li>)}</ul>}
              <div className="space-y-1">
                {d.pieces.map(pc => (
                  <div key={pc.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-second font-semibold text-slate-500 w-9">n° {pc.numero}</span>
                    <IconFileText size={15} className="text-slate-400" /><span className="flex-1 min-w-0 break-all">{pc.nom}</span>
                    {pc.a_moi && d.modifiable && <button type="button" className="text-second text-iip-blue underline" disabled={enCours}
                      onClick={() => geste('/va/retirer-piece', { ue_num: d.ue_num, fichier_id: pc.id })}>retirer</button>}
                  </div>))}
                {enAttente(d.ue_num, 'piece').map(g => <div key={g.id} className="text-sm text-slate-500">{g.nom} — envoi en cours…</div>)}
                {enAttente(d.ue_num, 'retirer_piece').length > 0 && <div className="text-sm text-slate-500">Retrait en cours…</div>}
              </div>
              {d.modifiable && !enAttente(d.ue_num, 'retirer').length && (
                <div className="flex flex-wrap items-center gap-2">
                  <select value={nature[d.ue_num] || ''} onChange={e => setNature(n => ({ ...n, [d.ue_num]: e.target.value }))} className="controle w-full sm:w-auto sm:flex-1 min-w-0">
                    <option value="">Quelle pièce ?</option>
                    {ORIGINES.map(([titre, cles]) => {
                      const ns = natures.filter(n => cles.includes(n.cle));
                      return ns.length ? <optgroup key={titre} label={titre}>{ns.map(n => <option key={n.cle} value={n.cle}>{n.label}</option>)}</optgroup> : null;
                    })}
                  </select>
                  <label className={`bouton inline-flex items-center gap-1.5 ${!nature[d.ue_num] || enCours ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                    <IconUpload size={15} /> Choisir le fichier
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic,.tif,.tiff,.doc,.docx,.odt,image/*" onChange={ev => ajouter(d.ue_num, ev)} /></label>
                </div>)}
              {d.porte === 'va' && <p className="text-second text-slate-500">Les originaux de vos diplômes seront à présenter au secrétariat.</p>}
            </Zone>

            <Zone n="3" titre="Motivation de ma demande" pale={!d.pieces.length}>
              <p className="text-second text-slate-500">Pour <b>chaque</b> acquis d’apprentissage de l’unité (ils viennent du dossier pédagogique), dites en
                quelques lignes où et comment vous l’avez acquis, et cochez les pièces qui le prouvent. C’est ce que lira le Conseil des études.
                Chaque acquis doit être motivé. Si vous ne les maîtrisez pas tous, le Conseil peut vous accorder une dispense partielle.</p>
              {!(d.acquis || []).length && <p className="text-second text-slate-500">Les acquis de cette unité ne sont pas encore disponibles en ligne : décrivez votre demande au secrétariat.</p>}
              {(d.acquis || []).map(a => {
                const cle = `${d.ue_num}|${a.code}`, enreg = motivation(d, a.code), b = brouillon[cle];
                const cur = b || enreg, change = !!b && (b.texte !== enreg.texte || b.pieces.join(',') !== enreg.pieces.join(','));
                const poser = x => setBrouillon(o => ({ ...o, [cle]: { ...cur, ...x } }));
                return (
                  <div key={a.code} className="border-t border-slate-100 pt-2 space-y-1">
                    <div className="text-sm"><b className="text-iip-texte">{a.code}</b> <span className="text-slate-700">{a.libelle}</span>
                      {enreg.texte.trim() && !change && <IconCheck size={14} className="inline ml-1" style={{ color: 'var(--c-reussi)' }} />}</div>
                    <textarea rows={3} className="controle w-full !h-auto py-1.5 leading-snug" disabled={!d.modifiable || d.attente} value={cur.texte}
                      placeholder="Où et comment avez-vous acquis cet acquis ?" onChange={e => poser({ texte: e.target.value })} />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-second text-slate-600">
                      {d.pieces.length > 0 && <span>Pièces :</span>}
                      {d.pieces.map(pc => (
                        <label key={pc.id} className="inline-flex items-center gap-1">
                          <input type="checkbox" disabled={!d.modifiable} checked={cur.pieces.includes(pc.id)}
                            onChange={e => poser({ pieces: e.target.checked ? [...cur.pieces, pc.id] : cur.pieces.filter(x => x !== pc.id) })} /> n° {pc.numero}</label>))}
                      {change && <button type="button" className="bouton bouton-fort ml-auto" disabled={enCours}
                        onClick={() => geste('/va/motiver', { ue_num: d.ue_num, aa_code: a.code, texte: cur.texte, pieces: cur.pieces },
                          () => setBrouillon(o => { const n = { ...o }; delete n[cle]; return n; }))}>Enregistrer</button>}
                    </div>
                  </div>);
              })}
            </Zone>

            {!d.attente && d.frise.length > 0 && (
              <div className="space-y-1">
                <div className="text-second text-slate-500">Ensuite, ce que fait l’école :</div>
                <div className="flex flex-wrap gap-1">
                  {d.frise.map(e => (
                    <PastilleEtat key={e.cle} etat={e.refus ? 'corriger' : e.fait ? 'reussi' : 'indisponible'}>
                      {e.fait && <IconCheck size={11} stroke={3} />}{e.libelle}{e.le && e.fait ? ` · ${jourFr(e.le)}` : ''}</PastilleEtat>))}
                </div>
              </div>)}
            {d.motif_irrecevabilite && <p className="text-sm text-slate-700">Motif : {d.motif_irrecevabilite}</p>}
            {d.decision && <p className="text-sm text-slate-700">Décision : <b>{d.decision}</b> — la notification est dans vos documents.</p>}
          </div>))}

        {ouvertesALaMain.length > 0 && (
          <Zone n={<IconCheck size={13} />} titre="Je certifie et j’envoie">
            {incomplets.length > 0 && (
              <div className="text-second text-slate-600">Pour envoyer, il manque encore :
                <ul className="pl-4 list-disc">{incomplets.map(x => <li key={x.d.ue_num}>UE {x.d.ue_num} — {x.m.join(', ')}</li>)}</ul></div>)}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={certifie} onChange={e => setCertifie(e.target.checked)} />
              Je certifie que toutes les informations renseignées dans ma demande de valorisation sont exactes.</label>
            {/* LE DERNIER GESTE SE VOIT (Charles, 31 octobre 2026 : « en vert avec un petit V, sinon ils ne verront pas »). */}
            {/* Sur téléphone, le libellé passe à la ligne : `.bouton` ne le permet pas (3.5.022). */}
            <button type="button" className="bouton bouton-confirmer w-full inline-flex items-center justify-center gap-2 font-semibold disabled:opacity-50 !whitespace-normal !h-auto py-2 text-center leading-snug"
              disabled={enCours || attend || !certifie || incomplets.length > 0}
              onClick={() => geste('/va/terminer', null, () => { setCertifie(false); setMessage('C’est noté : l’accusé de réception part à votre adresse dans la minute. Il reste dans vos documents.'); })}>
              <IconCheck size={17} /> J’ai terminé — envoyer et recevoir l’accusé de réception</button>
            <p className="text-second text-slate-500">Vous pouvez encore compléter tant que le secrétariat n’a pas examiné la demande.</p>
          </Zone>)}
      </section>
    </div>
  );
}

const PARCOURS_ETAT = {
  acquise: ['var(--c-reussi)', 'var(--blanc, #fff)', 'acquise'],
  programme: ['var(--c-disponible)', 'var(--blanc, #fff)', 'à mon programme'],
  accessible: ['var(--c-fond_tuile)', 'var(--c-disponible)', 'accessible'],
  attente: ['var(--c-attente)', 'var(--blanc, #fff)', 'en attente d’une délibération'],
  pas_encore: ['rgb(var(--gris-100))', 'rgb(var(--gris-500))', 'pas encore accessible'],
};

/** LE SCHÉMA DE CAPITALISATION (3.5.010) : le dessin de la fiche, déposé par Lucie, montré comme une image (aucun script
 *  ne passe) ; sur téléphone il défile de côté, un toucher l'ouvre en grand. */
/* LE SCHÉMA DE LUCIE (3.5.026) : le composant de la fiche, en lecture (mode « etudiant »), sur les données déposées — les
   flèches contournent les cases comme partout. Un lot d'avant (une chaîne SVG) se montre encore en image, le temps du
   prochain dépôt. Le composant ne fait que dessiner : aucune donnée de Lucie ne passe par lui. */
function SchemaParcours({ schema, onNoeud = null }) {
  if (typeof schema === 'string') {
    const src = `data:image/svg+xml;utf8,${encodeURIComponent(schema)}`;
    return <section className="carte p-3"><div className="overflow-x-auto"><img src={src} alt="Schéma de capitalisation" style={{ maxWidth: 'none' }} /></div></section>;
  }
  return (
    <section className="carte p-3">
      <p className="sm:hidden text-second text-slate-500 mb-1">Faites glisser le schéma de côté ; « + » l’agrandit.</p>
      <SchemaCapitalisation data={schema} mode="etudiant" titre="Mon schéma de capitalisation" onNoeud={onNoeud} />
    </section>
  );
}

/** MON PARCOURS (3.1.517) : le schéma de l'année — chaque unité de ses sections, par bloc, et les crédits acquis. */
/** MA SANTÉ (3.5.286, Charles : « je ne vois pas Ma santé dans l'espace étudiant ») : sa visite médicale du CESI, telle que le
 *  secrétariat l'a encodée — en ordre jusqu'au…, échue, ou à faire. Pas le formulaire : il reste au dossier. */
function MaSante({ onErreur }) {
  const [d, setD] = useState(null);
  useEffect(() => { appel('GET', '/sante').then(setD).catch(onErreur); }, [onErreur]);
  if (!d) return <ChargementLucie />;
  const s = d.sante;
  if (!s) return <p className="text-sm text-slate-500">Votre suivi de santé n’est pas encore disponible. Revenez dans quelques minutes.</p>;
  return (
    <div className="space-y-3">
      {s.etat === 'valide' && <Encadre etat="reussi" titre="Votre visite médicale est en ordre">
        Visite du {jourFr(s.date)}{s.organisme ? ` (${s.organisme})` : ''} — valable jusqu’au {jourFr(s.jusqu_au)}.</Encadre>}
      {s.etat === 'echue' && <Encadre etat="corriger" titre="Votre visite médicale est échue">
        Votre dernière visite date du {jourFr(s.date)} ; elle valait jusqu’au {jourFr(s.jusqu_au)}. Une nouvelle visite est à faire : vous recevrez la convocation du CESI.</Encadre>}
      {s.etat === 'aucune' && <Encadre etat="surveiller" titre="Pas encore de visite médicale enregistrée">
        Vous recevrez votre convocation du CESI. Après la visite, le CESI envoie à l’école le formulaire de santé : il paraîtra ici.</Encadre>}
      <p className="text-sm text-slate-600">Pas de visite médicale, pas de stage et pas de réussite en fin d’année. Une visite vaut {s.validite_mois} mois.
        Une question ? Écrivez au secrétariat depuis « Messages ».</p>
    </div>);
}

/** MES EXAMENS (3.5.284) : ses prochaines épreuves — le passage qui le concerne (date, heure, local, partie), déposés avec son
 *  parcours. Montrés dans « Aujourd'hui ». */
function MesExamens() {
  const [l, setL] = useState(null);
  useEffect(() => { appel('GET', '/parcours').then(x => setL(x?.parcours?.examens || [])).catch(() => setL([])); }, []);
  if (!l || !l.length) return null;
  const jour = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return (
    <section className="space-y-2">
      <h2 className="intertitre flex items-center gap-2"><IconCalendarEvent size={16} /> Mes prochains examens</h2>
      <ListeEtats>{l.slice(0, 12).map((x, i) => (
        <LigneEtat key={i} etat="disponible" icone={IconCalendarEvent}
          titre={`${jour(x.date)}${x.heure ? ` à ${String(x.heure).slice(0, 5)}` : ''} — ${x.intitule}${x.partie ? ` · ${x.partie}` : ''}`}
          sous={`${x.session === 2 ? 'Seconde session' : 'Première session'}${x.local ? ` · local ${x.local}` : ''}`} />))}
      </ListeEtats>
    </section>);
}

function MonParcours({ onErreur }) {
  const [p, setP] = useState(null);
  const [ouverte, setOuverte] = useState(null);
  const [doc, setDoc] = useState(null);
  const ouvrirDoc = (u, quoi) => {
    setDoc({ u, quoi });
    appel('GET', `/ue/${u.ue_num}/${quoi}`).then(j => setDoc({ u, quoi, html: j.html }))
      .catch(e => setDoc({ u, quoi, erreur: e.message || 'Document indisponible.' }));
  };
  const charger = useCallback(() => appel('GET', '/parcours').then(setP).catch(onErreur), [onErreur]);
  useEffect(() => { charger(); }, [charger]);
  // LES SUPPORTS DE COURS (3.5.211) : fermés pour cet étudiant, la route répond 404 et rien ne s'affiche.
  const [supports, setSupports] = useState([]);
  useEffect(() => { appel('GET', '/supports').then(j => setSupports(j.supports || [])).catch(() => setSupports([])); }, []);
  const recent = s => s.depose_le && (Date.now() - new Date(String(s.depose_le).replace(' ', 'T') + 'Z').getTime()) < 7 * 86400000;
  const ouvrirSupport = async s => {
    const w = window.open('', '_blank');
    try {
      const r = await appel('GET', `/supports/${s.id}`, null, true);
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location = url; else window.location.href = url;
    } catch (e) { if (w) w.close(); onErreur(e); }
  };
  useEffect(() => { if (!p || p.pret) return undefined; const t = setTimeout(charger, 4000); return () => clearTimeout(t); }, [p, charger]);
  if (!p) return <ChargementLucie />;
  if (!p.pret) return <p className="text-sm text-slate-500">Préparation de votre parcours… quelques secondes.</p>;
  const x = p.parcours;
  if (!x?.unites?.length) return <p className="text-sm text-slate-500">Votre parcours n’est pas encore disponible : votre section n’a pas d’unités organisées cette année.</p>;
  const blocs = [...new Set(x.unites.map(u => u.bloc))].sort();
  const pc = x.ects_total ? Math.round((x.ects_acquis / x.ects_total) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="bloc-etat px-4 py-3 space-y-2" data-etat="reussi">
        {x.ects_total > 0 ? <>
          <div className="text-sm"><b>{x.ects_acquis}</b> crédits acquis sur <b>{x.ects_total}</b> — {x.sections.join(', ')} · {x.annee}</div>
          <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full" style={{ width: `${pc}%`, background: 'var(--c-reussi)' }} /></div>
        </> : <div className="text-sm"><b>{x.unites.filter(u => u.etat === 'acquise').length}</b> unité(s) acquise(s) sur {x.unites.length} — {x.sections.join(', ')} · {x.annee}</div>}
      </div>
      {x.schema && <SchemaParcours schema={x.schema} onNoeud={n => { setOuverte(n); setTimeout(() => document.getElementById(`ue-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }} />}
      {/* LES UNITÉS ET LEURS COURS (3.5.194, Charles : « double emploi… le schéma suffit ; il faudrait que les cours apparaissent ;
          la DUE et le dossier pédagogique de chaque UE ») : une seule liste, liseré de l'état à gauche ; une unité se déplie sur
          ses cours ; la DUE (validée) et le dossier pédagogique s'ouvrent dans une fenêtre. Toucher une UE du schéma l'ouvre ici. */}
      <h2 className="intertitre pt-1">Mes unités et leurs cours</h2>
      <ListeEtats>
        {blocs.flatMap(b => x.unites.filter(u => u.bloc === b)).map(u => {
          /* LE MÊME CODE QUE LE SCHÉMA (3.5.329, Charles : « si c'est raté ou ajourné, le bord dans Mes unités doit aussi être orange
             ou rouge ») : la décision de l'année, lue sur le nœud du schéma, l'emporte sur « au programme ». */
          const nd = (x.schema?.nodes || []).find(n => Number(n.ue_num) === Number(u.ue_num)) || {};
          const decision = nd.echec_double ? ['corriger', 'échouée deux fois'] : nd.refusee_annee ? ['corriger', 'refusée cette année · à reprendre']
            : nd.ajournee_annee ? ['surveiller', 'ajournée · 2e session'] : null;
          const lib = decision ? decision[1] : (PARCOURS_ETAT[u.etat] || PARCOURS_ETAT.pas_encore)[2];
          const etat = decision ? decision[0] : ({ acquise: 'reussi', programme: 'disponible', accessible: 'neutre', attente: 'surveiller', pas_encore: 'indisponible' }[u.etat] || 'neutre');
          const ouv = ouverte === u.ue_num;
          const faveur = nd.statut === 'acquise' && nd.reussite?.faveur;
          const nouveaux = supports.filter(sp => Number(sp.ue_num) === Number(u.ue_num) && recent(sp)).length;
          /* UNE LIGNE, UNE HAUTEUR (3.5.331, audit) : la ligne standard (`LigneEtat`), titre coupé, une seule ligne grise ;
             le reste (cours, supports, DUE, dossier) se lit en ouvrant. Faveur en violet. */
          return (
            <LigneEtat key={u.ue_num} id={`ue-${u.ue_num}`} etat={faveur ? 'faveur' : etat}
              titre={<>UE {u.ue_num} {u.epreuve && <IconStar size={12} className="inline align-[-1px]" />} <span className="font-normal">{u.ue_nom}</span></>}
              sous={[u.bloc !== '—' ? u.bloc : null, u.ects ? `${u.ects} ECTS` : null, faveur ? 'acquise par faveur' : lib,
                u.va ? (u.va === true ? 'VA' : u.va) : null, u.raison, u.cours?.length ? `${u.cours.length} cours` : null].filter(Boolean).join(' · ')}
              meta={nouveaux ? <PastilleEtat etat="disponible">{nouveaux} nouveau{nouveaux > 1 ? 'x' : ''}</PastilleEtat> : null}
              onClick={() => setOuverte(ouv ? null : u.ue_num)} ouverte={ouv}>
              {ouv && (
                <div className="space-y-2">
                  {u.cours?.length > 0 && (
                    <div className="divide-y divide-slate-100">
                      {u.cours.map(k => (
                        <div key={k.code} className="py-1.5">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="tabular-nums text-slate-500 w-14 flex-none">{k.code}</span>
                            <span className="min-w-0 flex-1 truncate text-iip-texte">{k.nom}</span>
                            <span className="text-second text-slate-500 flex-none">{k.autonomie ? 'travail personnel' : k.per ? `${k.per} p.` : ''}</span>
                          </div>
                          {supports.filter(sp => sp.cours_code === k.code).map(sp => (
                            <button key={sp.id} type="button" className="ml-16 mt-1 flex items-center gap-1.5 text-left text-second hover:underline" onClick={() => ouvrirSupport(sp)}>
                              <IconFileText size={14} className="text-slate-500 flex-none" /><span className="text-iip-texte">{sp.titre}</span>
                              <span className="text-slate-500">· {jourFr(sp.depose_le)}</span>
                              {recent(sp) && <PastilleEtat etat="disponible">nouveau</PastilleEtat>}
                            </button>))}
                        </div>))}
                    </div>)}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => ouvrirDoc(u, 'due')}><IconFileText size={15} /> La DUE</button>
                    <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => ouvrirDoc(u, 'dp')}><IconBook size={15} /> Le dossier pédagogique</button>
                  </div>
                </div>)}
            </LigneEtat>);
        })}
      </ListeEtats>
      {doc && (
        <FenetreEspace titre={`${doc.quoi === 'due' ? 'DUE' : 'Dossier pédagogique'} — UE ${doc.u.ue_num}`} sous={doc.u.ue_nom} onFermer={() => setDoc(null)}>
          {doc.erreur ? <p className="text-sm text-slate-600">{doc.erreur}</p>
            : !doc.html ? <ChargementLucie />
              : <iframe title={doc.quoi} srcDoc={doc.html} sandbox="" className="w-full bg-white border-0" style={{ height: '70vh' }} />}
        </FenetreEspace>)}
      <p className="text-second text-slate-500"><IconStar size={12} className="inline align-[-1px]" /> épreuve intégrée. Ce schéma suit les règles de votre programme ; ce qui fait foi reste la décision du Conseil des études et votre PAE.</p>
    </div>
  );
}

/** MES FRAIS (3.1.517) : les mêmes chiffres que la note de frais ; comment payer, avec le QR à scanner. */
function MesFrais({ onErreur }) {
  const [p, setP] = useState(null);
  const [copie, setCopie] = useState(false);
  const charger = useCallback(() => appel('GET', '/frais').then(setP).catch(onErreur), [onErreur]);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { if (!p || p.pret) return undefined; const t = setTimeout(charger, 4000); return () => clearTimeout(t); }, [p, charger]);
  if (!p) return <ChargementLucie />;
  if (!p.pret) return <p className="text-sm text-slate-500">Préparation de vos frais… quelques secondes.</p>;
  const f = p.frais;
  if (!f) return <p className="text-sm text-slate-500">Aucun frais pour l’instant.</p>;
  /* « SANS FRAIS » NE VEUT DIRE QUE « SANS FRAIS ADMINISTRATIFS » (Charles, 31 octobre 2026 : l'AeSI ne perçoit pas de
     frais administratifs, mais le droit d'inscription du PAE et le forfait VA restent dus). Rien à payer = total nul. */
  if (!(Number(f.total) > 0)) return <p className="text-sm text-slate-600">Votre inscription ne donne lieu à aucun frais auprès de l’Institut.</p>;
  const copier = async t => { try { await navigator.clipboard.writeText(t); setCopie(true); setTimeout(() => setCopie(false), 1500); } catch { /* */ } };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[['Total', f.total, 'neutre'], ['Versé', f.verse, 'reussi'], ['Reste à payer', f.restant, f.restant > 0 ? 'corriger' : 'reussi']].map(([l, m, e]) => (
          <TuileEtat key={l} etat={e} valeur={eur(m)} libelle={l} taille="compacte" />))}
      </div>
      <div className="text-sm text-slate-600">{f.acompte_verse ? <>Acompte de {eur(f.acompte)} versé.</> : <>Acompte de <b>{eur(f.acompte)}</b> à verser dès l’inscription.</>}
        {f.restant > 0 && f.echeance_solde && <> Le solde est à payer avant le <b>{jourFr(f.echeance_solde)}</b>.</>}</div>
      {f.virement && (
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Payer par virement" />
          <div className="px-4 py-3 space-y-3">
          <div className="flex flex-wrap gap-4 items-start">
            {f.virement.qr && <img alt="QR de paiement" className="w-40 h-40"
              src={`data:image/svg+xml;utf8,${encodeURIComponent(f.virement.qr)}`} />}
            <div className="text-sm space-y-1 min-w-0 flex-1">
              <div><span className="text-slate-500">Bénéficiaire :</span> {f.virement.beneficiaire}</div>
              <div className="break-all"><span className="text-slate-500">IBAN :</span> {f.virement.iban}</div>
              {f.virement.montant && <div><span className="text-slate-500">Montant :</span> <b>{eur(f.virement.montant)}</b></div>}
              <div className="flex items-center gap-2 flex-wrap"><span className="text-slate-500">Communication :</span> <b className="tabular-nums">{f.virement.communication}</b>
                <button type="button" className="text-second text-iip-blue underline inline-flex items-center gap-1" onClick={() => copier(f.virement.communication)}>
                  <IconCopy size={13} />{copie ? 'copiée' : 'copier'}</button></div>
            </div>
          </div>
          <p className="text-second text-slate-500">Scannez le QR avec l’application de votre banque : bénéficiaire, montant et communication s’y remplissent seuls.
            Gardez la communication telle quelle : c’est elle qui rattache votre paiement à votre dossier.</p>
          </div>
        </section>)}
      <section className="carte overflow-hidden">
        <EnteteCarte titre={`Mes frais ${f.annee}`} />
        <Tableau dense className="!border-0 !rounded-none">
          <tbody>
            <TrTotal><Td>Total {f.annee}</Td><Td align="droite" className="tabular-nums">{eur(f.total)}</Td></TrTotal>
            {f.lignes.map(l => <Tr key={l.libelle}><Td>{l.libelle}</Td><Td align="droite" className="tabular-nums">{l.note || eur(l.montant)}</Td></Tr>)}
          </tbody>
        </Tableau>
      </section>
      {f.sans_frais && <p className="text-second text-slate-500">Votre section ne perçoit pas de frais administratifs : seuls les droits ci-dessus sont dus.</p>}
      {f.paiements.length > 0 && <section className="carte overflow-hidden">
        <EnteteCarte titre="Mes versements" />
        <Tableau dense className="!border-0 !rounded-none">
          <tbody>{f.paiements.map((v, i) => <Tr key={i}><Td className="tabular-nums whitespace-nowrap">{jourFr(v.date)}</Td>
            <Td>{v.nature || ''}{v.moyen ? ` · ${v.moyen}` : ''}</Td><Td align="droite" className="tabular-nums">{eur(v.montant)}</Td></Tr>)}</tbody>
        </Tableau>
      </section>}
    </div>
  );
}

/** AIDE ET RÈGLES (3.1.517) : un petit mode d'emploi, la grille de lecture des résultats, puis les règlements. */
const GUIDE = [
  ['Entrer', "Votre adresse de l'institut et votre mot de passe. Sur un appareil que vous n'avez pas fait reconnaître, un code reçu par courriel est demandé en plus. Mot de passe oublié : « Première visite, ou mot de passe oublié ? ». L'espace s'ouvre depuis la Belgique ; en stage ou en Erasmus à l'étranger, le secrétariat peut vous l'ouvrir pour la durée du séjour."],
  ['Aujourd’hui', "Ce qui vous attend : documents et règlements à signer, messages non lus, et les raccourcis vers votre PAE, vos résultats, vos frais."],
  ['Mon parcours', "Trois onglets. « Schéma et unités » : votre schéma de capitalisation, puis chaque unité, ses cours, sa DUE et son dossier pédagogique. « Mes résultats » : les décisions du Conseil des études, une fois la délibération close (la grille ci-dessous dit comment les lire). « Mon PAE » : pendant la période annoncée, cochez les unités que vous voulez suivre et envoyez votre proposition ; votre coordination la valide ou la corrige ; une fois votre PAE confirmé par l'école, confirmez-le à votre tour."],
  ['Mes documents', "Vos attestations, les décisions qui vous concernent et les règlements de l'école. Ouvrez-les, puis signez l'accusé de réception (un code reçu par courriel). Téléchargement libre pendant 90 jours ; ensuite, un code est demandé."],
  ['Messages', "Ce que l'école vous écrit. Vous pouvez répondre : votre réponse va à la personne qui a écrit."],
  ['Mes démarches', "Valorisation (faire reconnaître des études ou une expérience, une demande par unité, avec vos pièces), Mon TFE (question de recherche, remises, défense), Mon stage (lieu, pièces, visites), Mes absences (déposer un certificat médical)."],
  ['Mes frais', 'Ce qui est dû, versé, ce qui reste ; et le QR à scanner pour payer avec la bonne communication.'],
  ['Mon compte', 'Changer votre mot de passe ; voir et oublier vos appareils reconnus (trois au plus).'],
];
const GRILLE = [
  ['Réussi', "L'unité est acquise : vous en maîtrisez tous les acquis d'apprentissage. La note est sur 20."],
  ['NA', "Non acquis : une note sous 10 ne figure jamais sur un document remis à l'étudiant."],
  ['Ajourné', "Première session : au moins un acquis n'est pas maîtrisé. Vous représentez les acquis concernés en seconde session."],
  ['Refusé', "Seconde session : l'unité n'est pas acquise. Elle revient à votre programme une autre année."],
  ['10 (faveur)', "Le Conseil des études a accordé l'unité : elle vaut 10 partout, chaque acquis compris."],
  ['VA', 'Unité valorisée : vous en êtes dispensé, sur la base de vos études ou de votre expérience.'],
];
function AideRegles({ onRevoir }) {
  return (
    <div className="space-y-5">
      {onRevoir && <div><button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" onClick={onRevoir}>
        <IconRoute size={15} /> Revoir la visite guidée</button></div>}
      <section className="space-y-2">
        <h2 className="intertitre flex items-center gap-2">Votre espace, en bref</h2>
        <ListeEtats>{GUIDE.map(([t, x]) => <LigneEtat key={t} titre={t} sous={null}><div className="text-sm text-slate-600 -mt-1">{x}</div></LigneEtat>)}</ListeEtats>
      </section>
      <section className="space-y-2">
        <h2 className="intertitre">Lire vos résultats</h2>
        <ListeEtats>{GRILLE.map(([t, x]) => <LigneEtat key={t} titre={t}><div className="text-sm text-slate-600 -mt-1">{x}</div></LigneEtat>)}</ListeEtats>
        <p className="text-second text-slate-500">Pas de compensation entre acquis : une unité s'acquiert quand tous ses acquis sont maîtrisés. Ce qui fait foi reste la pièce que l'école vous remet. Les règlements de l'école sont dans « Mes documents ».</p>
      </section>
    </div>
  );
}

/** LES MESSAGES DE L'ÉCOLE (3.1.516) : les lire (l'auteur voit ✓ lu), y répondre — la réponse va à l'auteur. */
function MesMessages({ onErreur, onLus }) {
  const [l, setL] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [texte, setTexte] = useState('');
  const [enCours, setEnCours] = useState(false);
  const charger = useCallback(() => appel('GET', '/messages').then(x => { setL(x); onLus?.(x.filter(m => !m.lu).length); }).catch(onErreur), [onErreur, onLus]);
  useEffect(() => { charger(); }, [charger]);
  const enCoursFil = l?.some(m => m.fil.some(f => f.en_cours));
  // Une réponse en route : on regarde vite ; sinon toutes les trente secondes (une réponse de l'école arrive).
  useEffect(() => { const t = setTimeout(charger, enCoursFil ? 5000 : 30000); return () => clearTimeout(t); }, [enCoursFil, l, charger]);
  if (!l) return <ChargementLucie />;
  if (!l.length) return <p className="text-sm text-slate-500">Aucun message pour l’instant. Les messages du secrétariat, de votre coordination et de vos enseignants paraîtront ici.</p>;
  const ouvrir = async m => {
    setOuvert(o => (o === m.id ? null : m.id)); setTexte('');
    if (!m.lu) { try { await appel('POST', `/messages/${m.id}/lu`); charger(); } catch (e) { onErreur(e); } }
  };
  const envoyer = async m => {
    setEnCours(true);
    try { await appel('POST', `/messages/${m.id}/repondre`, { corps: texte }); setTexte(''); await charger(); } catch (e) { onErreur(e); } finally { setEnCours(false); }
  };
  /* LA LISTE STANDARD (3.5.331, audit) : une ligne par message (`LigneEtat`), comme les textes et documents de l'enseignant ; non lu
     = liseré bleu ; le message et son fil se déplient sous la ligne. */
  return (
    <ListeEtats>
      {l.map(m => (
        <LigneEtat key={m.id} etat={m.lu ? 'neutre' : 'disponible'} icone={IconMessages} titre={m.objet}
          meta={!m.lu ? <PastilleEtat etat="disponible">non lu</PastilleEtat> : null}
          sous={`${m.auteur} · ${jourFr(m.envoye_le)}${m.fil.length ? ` · ${m.fil.length} réponse${m.fil.length > 1 ? 's' : ''}` : ''}`}
          onClick={() => ouvrir(m)} ouverte={ouvert === m.id}>
          {ouvert === m.id && <div className="space-y-2">
            <div className="text-sm text-slate-700 whitespace-pre-line break-words">{m.corps}</div>
            {m.fil.map((f, i) => (
              <div key={i} className={`text-sm pl-3 border-l-2 whitespace-pre-line break-words ${f.de === 'etudiant' ? 'ml-6' : ''}`}
                style={{ borderColor: f.de === 'etudiant' ? 'rgb(var(--gris-300))' : 'var(--c-disponible)' }}>
                <div className="text-second text-slate-500 mb-0.5">{f.de === 'etudiant' ? 'Vous' : f.auteur} · {jourFr(f.le)}{f.en_cours ? ' · envoi en cours…' : ''}</div>{f.corps}
              </div>))}
            <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={3} placeholder={`Répondre à ${m.auteur}…`} className="controle w-full !h-auto py-2" />
            <button type="button" className="bouton bouton-fort" disabled={!texte.trim() || enCours} onClick={() => envoyer(m)}>Répondre</button>
          </div>}
        </LigneEtat>))}
    </ListeEtats>
  );
}

/** LES FRAIS ESTIMÉS (3.1.526) : la formule de Lucie (backend/src/lib/fraisEstimes.js, `estimerFrais`), recopiée telle
 *  quelle — le tarif vient de Lucie avec l'offre, l'espace ne fait qu'additionner les unités cochées. */
function estimerFrais(t, ues) {
  const arrondi = n => Math.round((Number(n) || 0) * 100) / 100;
  const l = ues.map(n => t.unites[Number(n)]).filter(Boolean);
  if (!l.length) return null;
  const somme = (niv, k) => l.filter(u => !niv || u.niveau === niv).reduce((s, u) => s + (Number(u[k]) || 0), 0);
  const sec = Math.min(somme('secondaire', 'per_di'), t.plafond);
  const sup = Math.max(0, Math.min(somme('superieur', 'per_di'), t.plafond - sec));
  const droit = t.exonere_di ? 0 : Math.round((t.forfait + sec * t.tarif_secondaire + sup * t.tarif_superieur) * 20) / 20;
  const fixes = t.sans_frais ? 0 : t.frais_fixes;
  const variables = t.sans_frais ? 0 : arrondi(somme(null, 'per_etud') * t.par_periode);
  const total = arrondi(droit + t.dis + fixes + variables);
  return { droit: arrondi(droit), dis: t.dis, fixes: arrondi(fixes), variables, total, acompte: arrondi(droit + t.dis + fixes),
    periodes: somme(null, 'per_etud') };
}

function FraisEstimes({ tarif, ues }) {
  if (!tarif) return null;
  const f = estimerFrais(tarif, ues);
  if (!f) return null;
  const lignes = [
    ['Droit d’inscription', f.droit, tarif.exonere_di ? 'exonéré' : null],
    ['Droit spécifique', f.dis],
    ['Frais administratifs (part fixe)', f.fixes],
    [`Frais administratifs (${f.periodes} périodes)`, f.variables],
  ].filter(([, m, note]) => m > 0 || note);
  return (
    <div className="carte px-4 py-3 text-sm space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-iip-texte">Frais estimés pour {tarif.annee}</span>
        <span className="text-lg font-semibold tabular-nums text-iip-texte">{eur(f.total)}</span>
      </div>
      {lignes.map(([lib, m, note]) => (
        <div key={lib} className="flex justify-between gap-3 text-slate-600">
          <span>{lib}{note ? ` — ${note}` : ''}</span><span className="tabular-nums">{eur(m)}</span>
        </div>))}
      <div className="flex justify-between gap-3 text-slate-600 border-t border-slate-100 pt-1.5">
        <span>dont acompte à l’inscription</span><span className="tabular-nums">{eur(f.acompte)}</span>
      </div>
      <p className="text-second text-slate-500">Une estimation, selon les unités cochées : ce qui fait foi est la note de frais que l’école vous remettra.
        {tarif.tiers ? ` Vos droits sont perçus par ${tarif.tiers}.` : ''} Une demande de valorisation a ses propres frais d’analyse.</p>
    </div>
  );
}

/** LE PAE EN LIGNE (3.1.515) : Lucie coche ce qui est accessible ; l'étudiant choisit et envoie ; la coordination valide
 *  ou corrige ; une fois le PAE confirmé par l'école, il le confirme à son tour par un code. */
function MonPAE({ onErreur, email }) {
  const [p, setP] = useState(null);
  const [choix, setChoix] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const charger = useCallback(() => appel('GET', '/pae').then(x => { setP(x); }).catch(onErreur), [onErreur]);
  useEffect(() => { charger(); }, [charger]);
  const attend = p && (!p.pret || p.en_attente.length > 0);
  // Une proposition qui attend la coordination, ou un PAE confirmé par l'école mais pas encore par lui : on regarde de temps en temps.
  const veille = p?.offre && (p.offre.proposition?.statut === 'deposee' || (p.offre.confirme_le && !p.offre.signature?.a_jour));
  useEffect(() => { if (!attend && !veille) return undefined; const t = setTimeout(charger, attend ? 4000 : 20000); return () => clearTimeout(t); }, [attend, veille, p, charger]);
  const o = p?.offre;
  // Point de départ : sa dernière proposition, sinon le programme, sinon ce que Lucie propose.
  useEffect(() => {
    if (!o?.unites || choix) return;
    const cochables = new Set(o.unites.filter(u => u.cochable).map(u => Number(u.ue_num)));
    const depart = o.proposition?.statut === 'deposee' ? o.proposition.ues
      : o.programme?.some(u => cochables.has(Number(u))) ? o.programme : o.unites.filter(u => u.propose && u.cochable).map(u => u.ue_num);
    setChoix(new Set(depart.map(Number).filter(u => cochables.has(u))));
  }, [o, choix]);
  if (!p) return <ChargementLucie />;
  if (!p.pret) return <p className="text-sm text-slate-500">Préparation de votre PAE… quelques secondes.</p>;
  if (!o?.annee) return <p className="text-sm text-slate-500">Votre PAE n’est pas encore disponible.</p>;
  const nomUE = n => o.unites?.find(u => u.ue_num === n)?.ue_nom || '';
  const geste = async (chemin, corps, ok) => {
    setEnCours(true);
    try { await appel('POST', chemin, corps); ok?.(); await charger(); } catch (e) { onErreur(e); } finally { setEnCours(false); }
  };
  const refus = p.refus.length > 0 && (
    <div className="space-y-2">
      {p.refus.map(r => <div key={r.id} className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{r.erreur}</div>)}
      <button type="button" className="text-second text-iip-blue underline" onClick={() => geste('/pae/refus-lus')}>J’ai compris</button>
    </div>);
  const prop = o.proposition;
  const etatProp = prop && {
    deposee: ['disponible', `Votre proposition du ${jourFr(prop.depose_le)} attend votre coordination.`],
    reprise: ['reussi', `Votre proposition a été reprise telle quelle le ${jourFr(prop.traite_le)}.`],
    corrigee: ['surveiller', `Votre coordination a corrigé votre proposition le ${jourFr(prop.traite_le)}.`],
    refusee: ['corriger', `Votre coordination n’a pas retenu votre proposition (${jourFr(prop.traite_le)}).`],
  }[prop.statut];

  // CONFIRMÉ PAR L'ÉCOLE : on le lit, et on le confirme à son tour.
  if (o.confirme_le) {
    const signe = o.signature?.a_jour;
    return (
      <div className="space-y-3">
        {refus}
        <div className="bloc-etat px-4 py-3 text-sm space-y-1" data-etat={signe ? 'reussi' : 'disponible'}>
          <div className="font-semibold text-iip-texte">PAE {o.annee} — confirmé par l’école le {jourFr(o.confirme_le)}</div>
          {signe ? <div>Vous l’avez confirmé le {jourFr(o.signature.signe_le)}.</div>
            : <div>Relisez-le : s’il est juste, confirmez-le ; sinon, dites-le à votre coordination.</div>}
        </div>
        <ListeEtats>{(o.programme || []).map(n => <LigneEtat key={n} etat="disponible" titre={<>UE {n} <span className="font-normal">{nomUE(n)}</span></>} />)}</ListeEtats>
        <FraisEstimes tarif={o.tarif} ues={o.programme || []} />
        {!signe && !attend && <DecisionPAE programme={o.programme || []} onFait={charger} onErreur={onErreur} />}
        {attend && <p className="text-sm text-slate-500">Confirmation en cours d’enregistrement…</p>}
      </div>);
  }

  // HORS DE LA FENÊTRE : le PAE de l'année se LIT — ses unités, ses frais estimés (3.5.008).
  if (!o.ouvert && !etatProp) {
    const prog = o.programme || [];
    return (
      <div className="space-y-3">
        {refus}
        <div className="bloc-etat px-4 py-3 text-sm" data-etat="neutre">
          <div className="font-semibold text-iip-texte">Mon PAE {o.annee} — {prog.length} unité{prog.length > 1 ? 's' : ''} inscrite{prog.length > 1 ? 's' : ''}</div>
          <div className="text-slate-600">Pas encore confirmé par l’école. Pour le modifier, adressez-vous à votre coordination
            {o.du && o.au && o.du > new Date().toISOString().slice(0, 10) ? `, ou proposez vos unités en ligne du ${jourFr(o.du)} au ${jourFr(o.au)}` : ''}.</div>
        </div>
        {prog.length ? <ListeEtats>{prog.map(n => <LigneEtat key={n} etat="disponible" titre={<>UE {n} <span className="font-normal">{nomUE(n)}</span></>} />)}</ListeEtats> : <p className="text-sm text-slate-500">Aucune unité inscrite cette année pour l’instant.</p>}
        {prog.length > 0 && <FraisEstimes tarif={o.tarif} ues={prog} />}
        {prog.length > 0 && (o.signature?.a_jour
          ? <Encadre etat="reussi">Vous avez confirmé ce programme le {jourFr(o.signature.signe_le)}.</Encadre>
          : !attend && <DecisionPAE programme={prog} onFait={charger} onErreur={onErreur} />)}
      </div>);
  }

  const n = choix ? choix.size : 0;
  const verrouillees = (o.unites || []).filter(u => u.verrouillee).length;
  return (
    <div className="space-y-3">
      {refus}
      <div className="bloc-etat px-4 py-3 text-sm" data-etat={o.ouvert ? 'disponible' : 'neutre'}>
        <b>Mon PAE {o.annee}</b> — {o.ouvert ? <>ouvert jusqu’au {jourFr(o.au)}. Cochez les unités que vous voulez suivre, puis envoyez :
          votre coordination valide ou corrige.</> : <>ouvert du {jourFr(o.du)} au {jourFr(o.au)}.</>}
      </div>
      {etatProp && <div className="bloc-etat px-4 py-3 text-sm space-y-1" data-etat={etatProp[0]}><div>{etatProp[1]}</div>
        {prop.message && <div className="text-slate-600">« {prop.message} »</div>}</div>}
      {attend && <p className="text-sm text-slate-500">Envoi en cours d’enregistrement…</p>}
      {/* UNE LIGNE, UNE HAUTEUR (3.5.332, audit) : le nom se coupe, la raison tient sur une ligne grise (texte entier au survol et
          dans l'aide de la coordination) ; liseré bleu = au programme (coché ou posé par l'école), comme la frise et le schéma. */}
      <div className="pile-etats">
        {(o.unites || []).map(u => {
          const pris = u.verrouillee || !!choix?.has(u.ue_num);
          const sous = u.avertissement || (u.raison ? (u.verrouillee ? `au programme, posée par l’école (${u.raison})` : u.raison) : (u.ue_niv || ''));
          return (
            <label key={u.ue_num} data-etat={pris ? 'disponible' : 'neutre'}
              className={`bloc-etat px-4 h-14 flex items-center gap-3 text-sm ${u.cochable && o.ouvert ? 'cursor-pointer' : 'opacity-60'}`} title={sous || undefined}>
              <input type="checkbox" className="flex-none" disabled={!u.cochable || !o.ouvert} checked={pris}
                onChange={e => setChoix(c => { const x = new Set(c); e.target.checked ? x.add(u.ue_num) : x.delete(u.ue_num); return x; })} />
              <span className="flex-1 min-w-0">
                <span className="block truncate"><b className="text-iip-texte">UE {u.ue_num}</b> {u.ue_nom}</span>
                {sous && <span className="block truncate text-second" style={u.avertissement ? { color: 'var(--c-attente)' } : undefined}>{sous}</span>}
              </span>
            </label>);
        })}
      </div>
      <p className="text-second text-slate-500">Une unité grisée ne se choisit pas en ligne : si vous pensez qu’elle devrait l’être, parlez-en à votre coordination.</p>
      <FraisEstimes tarif={o.tarif} ues={[...(choix || []), ...(o.unites || []).filter(u => u.verrouillee).map(u => u.ue_num)]} />
      {o.ouvert && <button type="button" className="bouton bouton-fort w-full" disabled={!n || enCours || attend}
        onClick={() => geste('/pae/proposer', { ues: [...choix] })}>Envoyer ma proposition — {n + verrouillees} unité{n + verrouillees > 1 ? 's' : ''}</button>}
    </div>
  );
}

/** LES DEUX RÉPONSES AU PAE (3.5.279, Charles : « je veux les deux : Je confirme mon PAE et Mon PAE n'est pas juste, j'en informe
 *  la coordination ; juste → le bouton vert ; pas juste → le bouton fraise, et la coordination de la section reçoit une
 *  notification sur son tableau de bord »). Confirmer = /pae/valider (sans code, comme la fenêtre d'entrée) ; pas juste =
 *  /pae/signaler (notification `pae_desaccord`, coordination et secrétariat de la section). */
function DecisionPAE({ programme, onFait, onErreur }) {
  const [ouvert, setOuvert] = useState(false);
  const [mot, setMot] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [parti, setParti] = useState(false);
  const confirmer = async () => {
    setEnvoi(true);
    try { await appel('POST', '/pae/valider', { accepte: true, programme }); try { sessionStorage.setItem(PAE_REMIS, '1'); } catch { /* */ } await onFait?.(); }
    catch (e) { onErreur(e); } finally { setEnvoi(false); }
  };
  const envoyer = async () => {
    setEnvoi(true);
    try { await appel('POST', '/pae/signaler', { message: mot }); setParti(true); try { sessionStorage.setItem(PAE_REMIS, '1'); } catch { /* */ } }
    catch (e) { onErreur(e); } finally { setEnvoi(false); }
  };
  if (parti) return <Encadre etat="disponible">Votre message est parti à votre coordination : elle vous répondra dans « Messages ». Quand votre programme sera corrigé, vous pourrez le confirmer ici.</Encadre>;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className="bouton bouton-confirmer justify-center min-h-11" disabled={envoi} onClick={confirmer}>
          <IconCheck size={16} /> Je confirme mon PAE</button>
        <button type="button" className="bouton bouton-signaler justify-center min-h-11" disabled={envoi} onClick={() => setOuvert(true)}>
          <IconAlertTriangle size={16} /> Mon PAE n’est pas juste, j’en informe la coordination</button>
      </div>
      {ouvert && (
        <div className="carte px-4 py-3 space-y-2 text-sm">
          <p className="m-0">Dites ce qui ne va pas : une unité qui manque, une unité en trop… Votre coordination reçoit votre message sur son tableau de bord et vous répond.</p>
          <textarea className="controle w-full !h-auto py-2" rows={3} value={mot} onChange={e => setMot(e.target.value)} placeholder="Par exemple : l’UE 250 manque à mon programme." />
          <div className="flex justify-end gap-2">
            <button type="button" className="bouton" onClick={() => setOuvert(false)}>Annuler</button>
            <button type="button" className="bouton bouton-signaler" disabled={envoi || mot.trim().length < 5} onClick={envoyer}>Envoyer à ma coordination</button>
          </div>
        </div>)}
    </div>);
}

/** Choisir son mot de passe : après le lien (première visite, oubli), ou depuis « Mon compte » avec l'actuel. */
function ChoisirMotDePasse({ avecActuel, nouveauCompte, onFait }) {
  const [actuel, setActuel] = useState('');
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(false);
  const pareil = mdp && mdp === mdp2;
  const valider = async ev => {
    ev.preventDefault(); setErreur(null);
    try {
      const j = await appel('POST', '/mot-de-passe', { nouveau: mdp, ...(avecActuel ? { actuel } : {}) });
      if (j.token) poser(j.token);
      setFait(true); setActuel(''); setMdp(''); setMdp2(''); onFait?.();
    } catch (e) { setErreur(e.message); }
  };
  return (
    <form onSubmit={valider} className="carte p-5 space-y-3">
      <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconKey size={18} />
        {avecActuel ? 'Changer mon mot de passe' : nouveauCompte ? 'Choisissez votre mot de passe' : 'Choisissez un nouveau mot de passe'}</h1>
      <p className="text-sm text-slate-600">Dix caractères au moins. Une phrase courte que vous retenez fait un bon mot de passe ; évitez
        votre nom et celui de l'école.{!avecActuel && !nouveauCompte ? ' Vos autres appareils devront à nouveau recevoir un code.' : ''}</p>
      {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
      {fait && avecActuel && <div className="bloc-etat px-3 py-2 text-sm" data-etat="reussi">Mot de passe changé.</div>}
      {avecActuel && <input type="password" value={actuel} onChange={e => setActuel(e.target.value)} placeholder="Mot de passe actuel"
        autoComplete="current-password" className="controle w-full" />}
      <input type="password" value={mdp} onChange={e => setMdp(e.target.value)} placeholder="Nouveau mot de passe" autoComplete="new-password" className="controle w-full" />
      <input type="password" value={mdp2} onChange={e => setMdp2(e.target.value)} placeholder="Le même, une seconde fois" autoComplete="new-password" className="controle w-full" />
      {mdp2 && !pareil && <p className="text-second text-red-700">Les deux ne sont pas identiques.</p>}
      <button type="submit" className="bouton bouton-fort w-full" disabled={!pareil || mdp.length < 10 || (avecActuel && !actuel)}>Enregistrer mon mot de passe</button>
    </form>
  );
}

/* Hors du composant : défini dedans, il serait un nouveau composant à chaque frappe, et le champ perdrait le focus. */
/* LA MÊME ENTRÉE QUE L'ESPACE ENSEIGNANT (3.5.202, Charles : « tout doit être semblable ») : une carte blanche au milieu de la
   page, le logo et le nom de l'espace en tête ; les formulaires s'y posent sans cadre à eux (`.entree-espace`). */
const Cadre = ({ horsBe, erreur, children }) => (
  <div className="min-h-screen grid place-items-center px-4 py-8" style={{ background: 'var(--page-fond)' }}>
    <div className="entree-espace w-full max-w-md bg-white border border-slate-200 rounded-carte p-6 space-y-4">
      <div className="flex items-center gap-3"><LogoLucie hauteur={30} className="" /><div className="text-second text-slate-500">Espace étudiant · Institut Ilya Prigogine</div></div>
      {horsBe && <HorsBelgique texte={horsBe} />}
      {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
      {children}
    </div>
  </div>);

const HorsBelgique = ({ texte }) => (
  <div className="bloc-etat px-4 py-3 text-sm flex gap-2" data-etat="corriger"><IconWorld size={18} className="flex-none text-slate-400" /><span>{texte}</span></div>);

function Espace() {
  const [connecte, setConnecte] = useState(!!lire());
  // L'entrée : adresse + mot de passe ; puis, sur un autre appareil, le code (et au 4e appareil, lequel remplacer).
  const [ident, setIdent] = useState('');
  const [mdp, setMdp] = useState('');
  const [defi, setDefi] = useState(null);     // { defi, adresse, code, retenir, appareils? }
  const [modeLien, setModeLien] = useState(false);
  const [modeCandidat, setModeCandidat] = useState(false);
  const [codeAcces, setCodeAcces] = useState('');
  // Le lien ouvert : reconnaître l'appareil ou non ; au 4e, lequel remplacer ; puis choisir le mot de passe.
  const [lien, setLien] = useState(null);   // { jeton, appareils? }
  const [definir, setDefinir] = useState(null);   // { nouveauCompte }
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [horsBe, setHorsBe] = useState(null);
  const [d, setD] = useState(null);
  const [detailUE, setDetailUE] = useState(null);   // la clé de l'unité dont le volet est ouvert (3.5.320)
  const [paeRemis, setPaeRemis] = useState(() => { try { return !!sessionStorage.getItem(PAE_REMIS); } catch { return false; } });
  /* LA FENÊTRE DES MOTS DE PASSE NE RESTE PAS SUR UN CHAMP DISPARU (3.5.235, capture de Charles : le trousseau de Safari restait
     ouvert par-dessus l'espace, accroché au champ d'identifiant de la page d'entrée, que l'aperçu affiche un instant). L'espace ouvert,
     on retire le focus. */
  useEffect(() => { if (d && document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }, [!!d]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [face, setFace] = useState('aujourdhui');
  /* LA VISITE GUIDÉE (3.5.276-278) : à la première entrée, AVANT tout ; elle finit sur « Mon PAE » (Charles : « après le tour, tu vas
     à cette fenêtre » — confirmer, ou dire que le programme n'est pas juste). La fenêtre de confirmation ne la recouvre pas dans la
     même visite ; aux connexions suivantes, tant que rien n'est fait, elle revient. Relancée depuis Aide. */
  const [visite, setVisite] = useState(false);
  const [visiteDepart, setVisiteDepart] = useState(0);
  const paeEnAttente = !!(d?.pae_a_valider && !d.apercu && !paeRemis);
  const idEtud = d?.etudiant?.matricule || d?.etudiant?.email;   // /moi ne rend pas l’identifiant interne
  useEffect(() => { if (idEtud && !visiteVue(idEtud)) { const t = setTimeout(() => { setVisiteDepart(0); setVisite(true); }, 400); return () => clearTimeout(t); } return undefined; }, [idEtud]);
  const [sous, setSous] = useState({});
  const [texte, setTexte] = useState(null);   // règlement ouvert
  const [nonLus, setNonLus] = useState(0);
  // Les messages non lus se voient dès l'entrée, sur l'onglet.
  const aD = !!d;
  useEffect(() => { if (aD) appel('GET', '/messages').then(x => setNonLus(x.filter(m => !m.lu).length)).catch(() => {}); }, [aD]);

  const echec = e => {
    if (e.donnees?.hors_belgique) { setHorsBe(e.message); setConnecte(false); setD(null); poser(null); return; }
    setErreur(e.message); if (e.session) { setConnecte(false); setD(null); }
  };
  const charger = useCallback(async () => { try { setD(await appel('GET', '/moi')); setErreur(null); } catch (e) { echec(e); } }, []);

  useEffect(() => {
    const jeton = new URLSearchParams(window.location.search).get('jeton');
    if (jeton) { window.history.replaceState(null, '', '/'); setLien({ jeton }); return; }
    // L'APERÇU DE LA DIRECTION (3.1.518) : un lien d'une minute, ouvert depuis la fiche dans Lucie, en lecture seule.
    const apercu = new URLSearchParams(window.location.search).get('apercu');
    if (apercu) {
      window.history.replaceState(null, '', '/');
      /* LES DONNÉES ARRIVENT APRÈS LE LIEN (3.5.128) : Lucie dépose les pièces de l'étudiant en arrière-plan — une
         vingtaine d'attestations prennent ~45 s. L'aperçu se relit donc toutes les 5 s pendant trois minutes (3.5.216, 5 s depuis 3.5.218 : « il faut parfois cliquer ailleurs » ;
         Charles : « pourquoi ATEMEZEM Maylis n'a pas ses documents ? » — ils arrivaient 45 s après l'ouverture). */
      appel('POST', '/apercu', { jeton: apercu }).then(j => {
        poser(j.token); setConnecte(true); charger();
        let n = 0; const t = setInterval(() => { if (++n > 36) clearInterval(t); else charger(); }, 5000);
      }).catch(e => setErreur(e.message));
      return;
    }
    if (lire()) { charger(); return; }
    // UN APPAREIL RECONNU : l'adresse est déjà là, il ne reste que le mot de passe.
    appel('GET', '/appareil').then(j => { if (j.reconnu) setIdent(j.identifiant); }).catch(() => {});
  }, [charger]);

  const entrer = token => { poser(token); marquerQuitte(false); setDefi(null); setMdp(''); setConnecte(true); charger(); };

  const ouvrirSession = async (retenir, remplacer = null) => {
    setErreur(null);
    try {
      const j = await appel('POST', '/session', { jeton: lien.jeton, retenir, ...(remplacer ? { remplacer } : {}) });
      poser(j.token); setLien(null); setDefinir({ nouveauCompte: !j.a_un_mot_de_passe });
    } catch (e) {
      if (e.statut === 409 && e.donnees?.choix) setLien(l0 => ({ ...l0, appareils: e.donnees.appareils }));
      else { setLien(null); setConnecte(false); echec(e); }
    }
  };

  const seConnecter = async ev => {
    ev.preventDefault(); setErreur(null); setHorsBe(null);
    try {
      const j = await appel('POST', '/connexion', { identifiant: ident.trim(), mot_de_passe: mdp });
      if (j.token) entrer(j.token);
      else if (j.code_requis) setDefi({ defi: j.defi, adresse: j.adresse, code: '', retenir: true });
    } catch (e) {
      if (e.donnees?.premiere) { setModeLien(true); setErreur(e.message); } else echec(e);
    }
  };
  const validerCode = async (remplacer = null, retenir = defi.retenir) => {
    setErreur(null);
    try {
      const j = await appel('POST', '/connexion/code', { defi: defi.defi, code: defi.code, retenir, ...(remplacer ? { remplacer } : {}) });
      entrer(j.token);
    } catch (e) {
      if (e.statut === 409 && e.donnees?.choix) setDefi(x => ({ ...x, appareils: e.donnees.appareils }));
      else if (e.session) { setDefi(null); setErreur(e.message); } else echec(e);
    }
  };

  const entrerCandidat = async ev => {
    ev.preventDefault(); setErreur(null); setHorsBe(null);
    try { const j = await appel('POST', '/candidat', { email: ident.trim(), code: codeAcces }); setCodeAcces(''); entrer(j.token); }
    catch (e) { echec(e); }
  };
  const demanderLien = async ev => {
    ev.preventDefault();
    if (!ident.trim()) return;
    setErreur(null); setHorsBe(null);
    try { const j = await appel('POST', '/lien', { identifiant: ident.trim() }); setMessage(j.message); } catch (e) { echec(e); }
  };
  const quitter = () => {
    poser(null); marquerQuitte(true); setConnecte(false); setD(null); setFace('aujourdhui'); setIdent('');
    appel('GET', '/appareil').then(j => { if (j.reconnu) setIdent(j.identifiant); }).catch(() => {});
  };

  // UN DOCUMENT S'OUVRE DANS UN ONGLET : l'onglet s'ouvre AU CLIC (sinon l'iPad le bloque), la pièce y arrive ensuite.
  const ouvrir = async doc => {
    const w = window.open('', '_blank');
    try {
      const r = await appel('GET', `/documents/${doc.id}`, null, true);
      const url = URL.createObjectURL(await r.blob());
      if (w) w.location = url; else window.location.href = url;
      charger();
    } catch (e) { if (w) w.close(); echec(e); }
  };
  const lireTexte = async reg => {
    try { setTexte({ ...reg, ...(await appel('GET', `/reglements/${encodeURIComponent(reg.cle)}`)) }); charger(); } catch (e) { echec(e); }
  };

  // APRÈS LE LIEN : choisir son mot de passe (première visite, ou oubli).
  if (definir) {
    return <Cadre horsBe={horsBe} erreur={erreur}><ChoisirMotDePasse nouveauCompte={definir.nouveauCompte}
      onFait={() => { setDefinir(null); marquerQuitte(false); setConnecte(true); charger(); }} /></Cadre>;
  }

  // LE LIEN VIENT D'ÊTRE OUVERT : sur cet appareil, le reconnaître (le sien) ou juste cette fois (un ordinateur partagé).
  if (lien && !connecte) {
    return (
      <Cadre horsBe={horsBe} erreur={erreur}>
        <div className="carte p-5 space-y-3">
          {!lien.appareils ? <>
            <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconDevices size={18} /> Cet appareil est-il le vôtre ?</h1>
            <p className="text-sm text-slate-600">Reconnu, il ne vous demandera que votre mot de passe pendant 90 jours ; un autre appareil
              demande aussi un code reçu par courriel. Sur un ordinateur partagé (bibliothèque, salle de cours), choisissez « juste cette fois ».</p>
            <button type="button" className="bouton bouton-fort w-full" onClick={() => ouvrirSession(true)}>Oui — reconnaître cet appareil</button>
            <button type="button" className="bouton w-full" onClick={() => ouvrirSession(false)}>Non — juste cette fois</button>
          </> : <ChoixAppareil appareils={lien.appareils} onChoisir={id => ouvrirSession(true, id)} onAucun={() => ouvrirSession(false)} />}
        </div>
      </Cadre>
    );
  }

  if (!connecte && defi) {
    return (
      <Cadre horsBe={horsBe} erreur={erreur}>
        <div className="carte p-5 space-y-3">
          {!defi.appareils ? <>
            <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconShieldCheck size={18} /> Un nouvel appareil</h1>
            <p className="text-sm text-slate-600">Un code à six chiffres part dans la minute vers <b>{defi.adresse}</b>. Il est valable 10 minutes.</p>
            <input value={defi.code} onChange={e => setDefi(x => ({ ...x, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
              inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" className="controle w-full text-center tracking-[0.4em]" autoFocus />
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={defi.retenir} onChange={e => setDefi(x => ({ ...x, retenir: e.target.checked }))} className="mt-0.5" />
              <span>Reconnaître cet appareil : la prochaine fois, le mot de passe suffira (pas sur un ordinateur partagé).</span></label>
            <button type="button" className="bouton bouton-fort w-full" disabled={defi.code.length !== 6} onClick={() => validerCode()}>Entrer</button>
            <button type="button" className="text-second text-iip-blue underline" onClick={() => setDefi(null)}>Revenir</button>
          </> : <ChoixAppareil appareils={defi.appareils} onChoisir={id => validerCode(id, true)} onAucun={() => validerCode(null, false)} />}
        </div>
      </Cadre>
    );
  }

  if (!connecte) {
    return (
      <Cadre horsBe={horsBe} erreur={erreur}>
        {modeCandidat ? (
          <form onSubmit={entrerCandidat} className="carte p-5 space-y-3">
            <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconKey size={18} /> Pas encore d’adresse de l’institut</h1>
            <p className="text-sm text-slate-600">Votre dossier vient d’être ouvert : un <b>code d’accès</b> vous a été envoyé à votre adresse
              privée. Il ouvre votre espace jusqu’à ce que vous receviez votre adresse de l’institut.</p>
            <input value={ident} onChange={e => setIdent(e.target.value)} placeholder="Votre adresse privée" autoComplete="email"
              className="controle w-full" autoFocus />
            <input value={codeAcces} onChange={e => setCodeAcces(e.target.value.toUpperCase())} placeholder="Code d’accès : XXXXX-XXXXX" autoComplete="one-time-code"
              className="controle w-full tracking-widest" />
            <button type="submit" className="bouton bouton-fort w-full" disabled={!ident.trim() || codeAcces.replace(/[^A-Z0-9]/g, '').length < 10}>Entrer</button>
            <p className="text-second text-slate-500">Code perdu ou échu ? Le secrétariat peut vous en envoyer un nouveau.</p>
            <button type="button" className="text-second text-iip-blue underline" onClick={() => { setModeCandidat(false); setErreur(null); }}>J’ai mon adresse de l’institut</button>
          </form>
        ) : !modeLien ? (
          <form onSubmit={seConnecter} className="carte p-5 space-y-3">
            <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconLock size={18} /> Mon espace étudiant</h1>
            <p className="text-sm text-slate-600">Vos résultats délibérés, vos documents, vos accusés de réception.</p>
            <input value={ident} onChange={e => setIdent(e.target.value)} placeholder="Adresse de l'institut (ou matricule)" autoComplete="username"
              className="controle w-full" autoFocus={!ident} />
            <input type="password" value={mdp} onChange={e => setMdp(e.target.value)} placeholder="Mot de passe" autoComplete="current-password"
              className="controle w-full" autoFocus={!!ident} />
            <button type="submit" className="bouton bouton-fort w-full" disabled={!ident.trim() || !mdp}>Entrer</button>
            <button type="button" className="text-second text-iip-blue underline" onClick={() => { setModeLien(true); setErreur(null); }}>
              Première visite, ou mot de passe oublié ?</button>
            <button type="button" className="block text-second text-iip-blue underline" onClick={() => { setModeCandidat(true); setErreur(null); setIdent(''); }}>
              Pas encore d’adresse de l’institut ? Entrer avec mon code d’accès</button>
          </form>
        ) : (
          <form onSubmit={demanderLien} className="carte p-5 space-y-3">
            <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconKey size={18} /> Première visite ou mot de passe oublié</h1>
            <p className="text-sm text-slate-600">Tapez votre adresse de l'institut (ou votre matricule) : un lien, valable 30 minutes et à usage
              unique, part à votre adresse électronique <b>de l'institut</b>. Il vous mène à choisir votre mot de passe.</p>
            <input value={ident} onChange={e => setIdent(e.target.value)} placeholder="prenom.nom@… ou matricule" autoComplete="username"
              className="controle w-full" autoFocus />
            <button type="submit" className="bouton bouton-fort w-full" disabled={!ident.trim()}>Recevoir mon lien</button>
            {message && <p className="text-sm text-slate-700">{message}</p>}
            <button type="button" className="text-second text-iip-blue underline" onClick={() => { setModeLien(false); setMessage(null); setErreur(null); }}>
              J'ai mon mot de passe</button>
          </form>
        )}
      </Cadre>
    );
  }

  // L'OUVERTURE SE VOIT (3.5.208) : connecté, en attendant ses données, le logo et les étoiles plutôt qu'une page vide.
  if (!d && !erreur) return <ChargementLucie pleine texte="Ouverture de votre espace…" />;
  const nom = d ? `${String(d.etudiant.nom || '').toUpperCase()} ${d.etudiant.prenom || ''}` : '';
  const docsASigner = d ? d.documents.filter(x => !x.signe_le) : [];
  const reglASigner = d ? d.reglements.filter(x => !x.signe_le) : [];
  const aSigner = docsASigner.length + reglASigner.length;
  /* LA STRUCTURE DE L'ESPACE ENSEIGNANT (3.5.201, Charles, 7 novembre 2026 : « comme l'enseignant » ; dix entrées qui se
     recoupaient). Aujourd'hui · Mon parcours (schéma et unités, résultats, PAE) · Mes documents (pièces et règlements à signer)
     · Messages · Mes démarches (VA, TFE, stage, absences) · Mes frais — puis Aide et Mon compte. Une face n'existe que si
     Lucie a ouvert au moins une de ses fonctions pour cet étudiant (3.5.001). */
  const ouvertes = d?.fonctions || [];
  const a_ = k => ouvertes.includes(k);
  const SOUS = {
    parcours: [['parcours', 'Schéma et unités'], ['resultats', 'Mes résultats'], ['pae', 'Mon PAE']].filter(([k]) => a_(k)),
    demarches: [['va', 'Valorisation'], ['tfe', 'Mon TFE'], ['stage', 'Mon stage'], ['certificats', 'Mes absences'], ['amenagements', 'Aménagement raisonnable'], ['sante', 'Ma santé']].filter(([k]) => a_(k)),
  };
  const FACES = [
    ['aujourdhui', 'Aujourd’hui', IconHome],
    SOUS.parcours.length && ['parcours', 'Mon parcours', IconRoute],
    (a_('documents') || (d?.reglements || []).length) && ['documents', 'Mes documents', IconFileText],
    a_('messages') && ['messages', nonLus ? `Messages (${nonLus})` : 'Messages', IconMessages],
    SOUS.demarches.length && ['demarches', 'Mes démarches', IconListCheck],
    a_('frais') && ['frais', 'Mes frais', IconCash],
    ['aide', 'Aide', IconHelpCircle], ['compte', 'Mon compte', IconUserCircle],
  ].filter(Boolean);
  if (d && !FACES.some(([k]) => k === face)) setTimeout(() => setFace('aujourdhui'), 0);
  const sousActif = SOUS[face] ? (SOUS[face].some(([k]) => k === sous[face]) ? sous[face] : SOUS[face][0]?.[0]) : null;
  const aller = (f, s2 = null) => { setFace(f); if (s2) setSous(x => ({ ...x, [f]: s2 })); };
  const Onglets = ({ f }) => (SOUS[f].length > 1 ? (
    <div className="flex gap-5 border-b border-slate-200 mb-4 overflow-x-auto">
      {SOUS[f].map(([k, l]) => (
        <button key={k} type="button" onClick={() => setSous(x => ({ ...x, [f]: k }))}
          className={sousActif === k ? 'onglet-page onglet-page-actif' : 'onglet-page'}>{l}</button>))}
    </div>) : null);

  return (
    /* LE MÊME DESSIN QUE L'ESPACE ENSEIGNANT : le rail étroit à gauche (icônes, bulle au survol), une bande sur téléphone. */
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: 'var(--page-fond)' }}>
      <div className="md:hidden bg-white px-4 pt-3 pb-1 flex items-center gap-3"><LogoLucie hauteur={24} className="" /><span className="ml-auto text-second text-slate-500 truncate">{nom}</span></div>
      <nav aria-label="Mon espace" className="md:z-30 md:w-14 md:shrink-0 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-3 md:px-1.5 md:py-4 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:sticky md:top-0 md:h-screen">
        <div className="hidden md:flex justify-center pb-4"><LogoLucie hauteur={26} sansTexte className="" /></div>
        {FACES.filter(([k]) => !['aide', 'compte'].includes(k)).map(([k, l, I]) => (
          <BoutonRail key={k} etroit f={{ k, l: window.innerWidth < 768 ? (k === 'messages' ? l : COURT[k] || l) : l, I }} actif={face === k} onClick={() => setFace(k)} />))}
        <div className="hidden md:block flex-1" />
        {FACES.filter(([k]) => ['aide', 'compte'].includes(k)).map(([k, l, I]) => (
          <BoutonRail key={k} etroit f={{ k, l: window.innerWidth < 768 ? (COURT[k] || l) : l, I }} actif={face === k} onClick={() => setFace(k)} />))}
        <div className="md:border-t border-slate-200 md:pt-3 flex md:flex-col gap-1 shrink-0 ml-auto md:ml-0">
          <button type="button" className="text-second text-iip-blue inline-flex items-center gap-1 min-h-11 md:min-h-0 md:justify-center" onClick={quitter}
            title="Se déconnecter"><IconLogout size={15} /><span className="md:hidden"> Se déconnecter</span></button>
        </div>
      </nav>
      <main className="flex-1 min-w-0 p-4 md:p-8">
      {paeEnAttente && !visite && (
        <ValiderPAE annee={d.pae_a_valider.annee} onFait={quoi => {
          setPaeRemis(true); if (quoi === 'valide') setD(x => ({ ...x, pae_a_valider: null }));
        }} />)}
      <div className="space-y-4" data-visite="contenu">
        {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
        {d?.apercu && <Encadre etat="surveiller"><b>Aperçu de la direction</b> — l’espace de {nom} tel qu’il le voit.
          Lecture seule : rien ne s’enregistre, rien ne compte comme lu ni signé. Ouvert par {d.apercu.par}.</Encadre>}
        {d?.candidat && <Encadre etat="disponible">Accès par code, jusqu’au {jourFr(d.candidat.jusqu_au)} ou jusqu’à votre adresse de l’institut.</Encadre>}
        <h1 className="titre-ecran">{face === 'aujourdhui' ? `Bonjour ${d?.etudiant?.prenom || ''}` : (FACES.find(([k]) => k === face) || [])[1] || 'Mon espace'}
          {face !== 'aujourdhui' && nom ? <span className="compte">{nom}</span> : null}</h1>

        {/* AUJOURD'HUI : ce qui attend, une ligne par chose, qui mène où la faire. */}
        {d && face === 'aujourdhui' && (() => {
          const lignes = [
            docsASigner.length > 0 && { k: 'docs', etat: 'surveiller', I: IconSignature, t: `${docsASigner.length} document(s) à ouvrir et à signer`, s: docsASigner.slice(0, 3).map(x => x.sujet).join(' · '), go: () => aller('documents') },
            reglASigner.length > 0 && { k: 'regl', etat: 'surveiller', I: IconBook, t: `${reglASigner.length} règlement(s) à lire et à signer`, s: reglASigner.map(x => x.titre).join(' · '), go: () => aller('documents') },
            nonLus > 0 && { k: 'msg', etat: 'disponible', I: IconMessages, t: `${nonLus} message(s) non lu(s)`, s: 'De l’école, de votre coordination, de vos enseignants', go: () => aller('messages') },
            a_('pae') && { k: 'pae', etat: 'neutre', I: IconListCheck, t: 'Mon PAE', s: 'Les unités de mon programme, et ma proposition quand la fenêtre est ouverte', go: () => aller('parcours', 'pae') },
            a_('resultats') && { k: 'res', etat: 'neutre', I: IconCertificate, t: 'Mes résultats', s: 'Les décisions des délibérations closes', go: () => aller('parcours', 'resultats') },
            a_('frais') && { k: 'frais', etat: 'neutre', I: IconCash, t: 'Mes frais', s: 'Ce qui est dû, versé, ce qui reste — et le QR pour payer', go: () => aller('frais') },
          ].filter(Boolean);
          return (<>
            {lignes.length ? (
              <ListeEtats>{lignes.map(l => <LigneEtat key={l.k} etat={l.etat} icone={l.I} titre={l.t} sous={l.s} onClick={l.go} />)}</ListeEtats>
            ) : <p className="text-sm text-slate-500">Rien ne vous attend pour l’instant.</p>}
            {a_('parcours') && <MesExamens />}
          </>);
        })()}

        {/* MON PARCOURS : schéma et unités · résultats · PAE. */}
        {face === 'parcours' && <Onglets f="parcours" />}
        {face === 'parcours' && sousActif === 'parcours' && <MonParcours onErreur={echec} />}
        {d && face === 'parcours' && sousActif === 'resultats' && (d.resultats.length ? (<>
          <ExamensARepasser resultats={d.resultats} />
          {d.resultats.map(a => (
            <section key={a.annee} className="carte overflow-hidden">
              <EnteteCarte titre={a.annee.replace('-', ' – ')} />
              <Tableau className="!border-0 !rounded-none">
                {/* UNE COLONNE PAR SESSION (3.5.370, Charles : « une colonne S1, une colonne S2, avec le détail ») : décision et note de
                    chaque session close ; « — » quand il n'y a pas (encore) de seconde session. */}
                <TableauEntete><Th>Unité</Th><Th>Intitulé</Th><Th>1re session</Th><Th>2e session</Th><Th /></TableauEntete>
                <tbody>{a.ues.map(u => { const cle = `${a.annee}|${u.ue_num}|${u.decision}`; const ouvert = detailUE === cle; const avecDetail = !!u.detail?.cours;
                  const ses = u.detail?.sessions?.length ? u.detail.sessions : [{ n: 1, decision: u.decision, note: u.note, etat: u.etat }];
                  const cellule = n => { const x = ses.find(y => y.n === n); return x
                    ? <span className="inline-flex items-center gap-2 whitespace-nowrap"><PastilleEtat etat={['reussi', 'faveur', 'surveiller', 'corriger'].includes(x.etat) ? x.etat : 'neutre'}>{x.decision}</PastilleEtat>
                      <b className="tabular-nums">{x.note}{/^\d+$/.test(String(x.note)) ? ' /20' : ''}</b></span>
                    : <span className="text-slate-400">—</span>; };
                  return (<Fragment key={cle}>
                  <Tr className={avecDetail ? 'cursor-pointer' : ''} onClick={avecDetail ? () => setDetailUE(ouvert ? null : cle) : undefined}
                    title={avecDetail ? (ouvert ? 'Replier le détail' : 'Voir le détail par cours et par acquis') : undefined}>
                    <Td className="tabular-nums whitespace-nowrap">UE {u.ue_num}</Td><Td>{u.ue_nom}</Td>
                    <Td>{cellule(1)}</Td><Td>{cellule(2)}</Td>
                    <Td align="droite">{avecDetail && <IconChevronRight size={14} className={`inline text-slate-400 transition-transform ${ouvert ? 'rotate-90' : ''}`} />}</Td>
                  </Tr>
                  {ouvert && <tr><td colSpan={5} className="p-0"><VoletResultat u={u} /></td></tr>}
                </Fragment>); })}</tbody>
              </Tableau>
            </section>))}
          <p className="text-second text-slate-500">« NA » : non acquis. Touchez une unité pour voir ses cours et ses acquis. Seuls les résultats des délibérations closes paraissent ici ; ce qui fait foi reste la pièce que l’école vous remet.</p>
        </>) : <p className="text-sm text-slate-500">Aucun résultat délibéré pour l’instant. Un résultat paraît ici quand la délibération de l’unité est close.</p>)}
        {face === 'parcours' && sousActif === 'pae' && <MonPAE onErreur={echec} email={d?.etudiant?.email} />}

        {/* MES DOCUMENTS : les pièces de l'école, puis les règlements — tout ce qui se signe au même endroit. */}
        {d && face === 'documents' && (<>
          {a_('documents') && (d.documents.length ? (
            <ListeEtats>
              {d.documents.map(doc => (
                <LigneEtat key={doc.id} etat={doc.signe_le ? 'reussi' : 'disponible'} icone={IconFileText} titre={doc.sujet}
                  sous={`mis à disposition le ${jourFr(doc.envoye_le)}${doc.reference ? ` · réf. ${doc.reference}` : ''}${doc.libre && doc.libre_jusqu_au ? ` · libre jusqu’au ${jourFr(doc.libre_jusqu_au)}` : ''}${!doc.libre ? ' · plus de 90 jours : un code est demandé' : ''}`}
                  droite={doc.libre ? <button type="button" className="bouton flex-none" onClick={() => ouvrir(doc)}>Ouvrir</button>
                    : <Deverrouiller doc={doc} onOuvrir={ouvrir} onErreur={echec} />}>
                  <Accuse type="envoi" id={doc.id} presente={doc.presente_le} signe={doc.signe_le} onFait={charger} onErreur={echec} />
                </LigneEtat>))}
            </ListeEtats>) : <p className="text-sm text-slate-500">Aucun document pour l’instant. Vos attestations et les décisions du Conseil des études paraissent ici dès la clôture de la délibération.<br />Le chargement des documents peut prendre plusieurs minutes, selon la durée de votre parcours : revenez plus tard si vous attendez une attestation.</p>)}
          {d.reglements.length > 0 && (<>
            <h2 className="intertitre pt-2">Les règlements</h2>
            <ListeEtats>
              {d.reglements.map(reg => (
                <LigneEtat key={reg.cle} etat={reg.signe_le ? 'reussi' : 'disponible'} icone={IconBook} titre={reg.titre}
                  sous={`Version ${reg.numero} · publiée le ${jourFr(reg.publiee_le)}`}
                  droite={<button type="button" className="bouton flex-none" onClick={() => lireTexte(reg)}>Lire</button>}>
                  <Accuse type="reglement" id={reg.version_id} presente={reg.presente_le} signe={reg.signe_le} onFait={charger} onErreur={echec} />
                </LigneEtat>))}
            </ListeEtats></>)}
        </>)}

        {face === 'messages' && <MesMessages onErreur={echec} onLus={setNonLus} />}

        {/* MES DÉMARCHES : valorisation, TFE, stage, absences. */}
        {face === 'demarches' && <Onglets f="demarches" />}
        {face === 'demarches' && sousActif === 'va' && <MesValorisations onErreur={echec} />}
        {face === 'demarches' && sousActif === 'tfe' && <MonTfe appel={appel} jeton={lire} onErreur={echec} />}
        {face === 'demarches' && sousActif === 'stage' && <MonStage appel={appel} onErreur={echec} />}
        {face === 'demarches' && sousActif === 'certificats' && <MesAbsences appel={appel} jeton={lire} onErreur={echec} />}
        {face === 'demarches' && sousActif === 'amenagements' && <MonAmenagement appel={appel} onErreur={echec} />}
        {face === 'demarches' && sousActif === 'sante' && <MaSante onErreur={echec} />}

        {face === 'frais' && <MesFrais onErreur={echec} />}
        {d && face === 'aide' && <AideRegles onRevoir={() => { setVisiteDepart(0); setVisite(true); }} />}
        {face === 'compte' && <div className="space-y-4">
          <ChoisirMotDePasse avecActuel />
          <h2 className="titre-carte flex items-center gap-2"><IconDevices size={16} /> Mes appareils</h2>
          <MesAppareils onErreur={echec} onOublieCourant={quitter} />
        </div>}

        {texte && (
          <FenetreEspace titre={texte.titre} sous={`Version ${texte.numero}`} onFermer={() => setTexte(null)}
            pied={texte.source_url ? <a href={texte.source_url} target="_blank" rel="noreferrer" className="text-second text-iip-blue underline">Le texte officiel</a> : null}>
            {/* Le texte, mis en page par Lucie, dans son cadre (3.5.203) : ses styles ne débordent pas sur l'espace. */}
            <iframe title={texte.titre} sandbox="" className="w-full border-0" style={{ height: '70vh' }}
              srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:15px/1.55 'Segoe UI',Arial,sans-serif;color:#16406A;margin:0;padding:4px}</style>${texte.contenu || ''}`} />
          </FenetreEspace>)}
      </div>
      </main>
      {visite && idEtud && <VisiteGuidee etudiantId={idEtud} depart={visiteDepart} aller={aller}
        dispo={et => FACES.some(([k]) => k === et.face) && (!et.sous || (SOUS[et.face] || []).some(([k]) => k === et.sous))}
        onFin={dest => { setVisite(false); if (dest === 'pae') { setPaeRemis(true); aller('parcours', 'pae'); window.scrollTo({ top: 0 }); } else setFace('aujourdhui'); }} />}
    </div>
  );
}

/** Trois appareils reconnus au plus : au quatrième, lequel celui-ci remplace. */
function ChoixAppareil({ appareils, onChoisir, onAucun }) {
  return <>
    <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconDevices size={18} /> Trois appareils sont déjà reconnus</h1>
    <p className="text-sm text-slate-600">Pour votre sécurité, trois appareils au plus sont reconnus. Lequel celui-ci remplace-t-il ?</p>
    {appareils.map(a => (
      <button key={a.id} type="button" className="bouton w-full justify-between" onClick={() => onChoisir(a.id)}>
        <span>{a.nom || 'Appareil'}</span>
        <span className="text-second text-slate-500">{a.vu_le ? `dernière visite le ${jourFr(a.vu_le)}` : `reconnu le ${jourFr(a.cree_le)}`}</span>
      </button>))}
    <button type="button" className="text-second text-iip-blue underline" onClick={onAucun}>Ne rien remplacer — juste cette fois</button>
  </>;
}

import { teinteCours, styleTuileCours } from '../lib/teinteCours.js';
import LogoLucie from '../components/LogoLucie.jsx';
import FenetreEspace from '../components/FenetreEspace.jsx';
import ChargementLucie from '../components/ChargementLucie.jsx';
import { FriseJournee } from '../components/FriseJournee.jsx';
import QRCode from 'qrcode';
import { lazy, Suspense } from 'react';
import { FournisseurRail, ListeEtats, LigneEtat, Encadre, Tableau, TableauEntete, Th, Tr, Td } from '../components/ui.jsx';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { EvaluationsDeliberations } from '../components/DatesDeliberation.jsx';
import { preparerLucie } from './relais.js';
import { rangBloc } from '../lib/blocs.js';
import TrainUE from '../components/TrainUE.jsx';
import { BoutonRail as BoutonFace } from '../components/RailEspace.jsx';
const MesCoursLucie = lazy(() => import('../pages/MesCours.jsx'));
const AccueilLucie = lazy(() => import('../pages/Accueil.jsx'));
const MaJourneeLucie = lazy(() => import('../components/MaJournee.jsx'));
const SemaineLucie = lazy(() => import('../components/MonHoraireSemaine.jsx'));
const VisitesStageLucie = lazy(() => import('../components/VisitesStage.jsx'));
const AgendaAbonnementLucie = lazy(() => import('../components/AgendaAbonnement.jsx'));
const MessagesEtudiantsLucie = lazy(() => import('../components/MessagesEtudiants.jsx'));
const AideLucie = lazy(() => import('../pages/Aide.jsx'));
const MaFicheLucie = lazy(() => import('../pages/Professeurs.jsx'));
const MesTfeLucie = lazy(() => import('../components/MesTfe.jsx'));
const MesStagesLucie = lazy(() => import('../components/MesStages.jsx'));
const SignalerAbsenceLucie = lazy(() => import('../components/AbsencesEnseignants.jsx').then(m => ({ default: m.SignalerAbsence })));
const MesDisponibilitesLucie = lazy(() => import('../components/MesDisponibilites.jsx'));
const MesReunionsLucie = lazy(() => import('../components/MesReunions.jsx'));
const MaCandidatureLucie = lazy(() => import('../components/MaCandidature.jsx'));
const VoyagesLucie = lazy(() => import('../components/VoyagesEtudes.jsx'));
const MesExamensLucie = lazy(() => import('../components/MesExamens.jsx'));
const MesPrestationsLucie = lazy(() => import('../components/MesPrestations.jsx'));
const AmeliorationsLucie = lazy(() => import('../components/Ameliorations.jsx'));
import AnnulerGestes from '../components/AnnulerGestes.jsx';
const ListeSurMesureLucie = lazy(() => import('../components/MaListe.jsx').then(m => ({ default: m.ListeSurMesure })));
import { Component, useCallback, useEffect, useRef, useState } from 'react';
import { IconClipboardText, IconClockHour4, IconWriting, IconFileCheck, IconBulb, IconSchool, IconBriefcase, IconUserOff, IconSun, IconUserCheck, IconCalendarWeek, IconUserCircle, IconLogout, IconChevronLeft, IconChevronRight, IconCheck, IconDevices, IconTrash, IconLock, IconMapPin, IconUsers, IconChevronDown, IconBook, IconFileText, IconHelpCircle, IconPhone, IconTable, IconDownload, IconQrcode, IconPencil, IconChecklist, IconCalendar, IconBuilding, IconCar, IconCalendarShare, IconMessages, IconLayoutDashboard, IconSend, IconSearch, IconId, IconAccessible, IconPrinter } from '@tabler/icons-react';

/**
 * L'ESPACE ENSEIGNANT (3.5.076, Charles, 2 novembre 2026 : « pour les profs, il faut penser les menus autrement… un module
 * à part » ; maquette validée). Site à part (enseignants.lucie-iip.be), derrière le mur : il ne parle qu'au portail
 * (/api/enseignant), qui n'a ni la base ni les clés de Lucie. Étape 1 : l'entrée (lien de première visite, mot de passe
 * propre, code sur un nouvel appareil), Ma journée, les présences, Mon horaire, Mon compte. Ni axes, ni gestion, rien au
 * survol. Serveur : portail/src/enseignants.js ; côté Lucie : backend/src/lib/portailEnseignants.js.
 */
const CLE = 'lucie.enseignant';
const lire = () => { try { return sessionStorage.getItem(CLE); } catch { return null; } };
const poser = t => { try { t ? sessionStorage.setItem(CLE, t) : sessionStorage.removeItem(CLE); } catch { /* navigation privée */ } };
const jourFr = d => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' }) : '');
const court = d => (d ? String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
const h = x => (x ? String(x).slice(0, 5) : '');
const decaler = (jour, n) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function appel(methode, chemin, corps) {
  const hd = {};
  const t = lire();
  if (t) hd.Authorization = `Bearer ${t}`;
  if (corps) hd['Content-Type'] = 'application/json';
  const r = await fetch(`/api/enseignant${chemin}`, { method: methode, headers: hd, body: corps ? JSON.stringify(corps) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !chemin.startsWith('/connexion') && chemin !== '/session') { poser(null); const e = new Error(j.error || 'Session expirée.'); e.session = true; throw e; }
  if (!r.ok) { const e = new Error(j.error || `Erreur ${r.status}`); e.donnees = j; throw e; }
  return j;
}

const cleDe = p => (p?.statut === 'present' && p.retard ? 'retard' : p?.statut || null);

const Logo = () => <LogoLucie hauteur={30} className="" />;

// ── L'ENTRÉE ──
function Entree({ onEntre }) {
  const [vue, setVue] = useState('connexion');   // connexion | code | lien | appareils
  const [ident, setIdent] = useState('');
  const [mdp, setMdp] = useState('');
  const [code, setCode] = useState('');
  const [defi, setDefi] = useState(null);
  const [adresse, setAdresse] = useState('');
  const [appareils, setAppareils] = useState(null);
  const [msg, setMsg] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [lucieUrl, setLucieUrl] = useState(null);
  useEffect(() => { appel('GET', '/appareil').then(r => { if (r.reconnu) setIdent(r.identifiant); setLucieUrl(r.lucie || null); }).catch(() => {}); }, []);
  const entrer = async ev => {
    ev?.preventDefault(); setErreur(null);
    try {
      const r = await appel('POST', '/connexion', { identifiant: ident, mot_de_passe: mdp });
      if (r.token) return onEntre(r.token);
      if (r.code_requis) { setDefi(r.defi); setAdresse(r.adresse); setVue('code'); }
    } catch (e) { setErreur(e.message); if (e.donnees?.premiere) setVue('lien'); }
  };
  const valider = async (ev, remplacer) => {
    ev?.preventDefault(); setErreur(null);
    try { const r = await appel('POST', '/connexion/code', { defi, code, ...(remplacer ? { remplacer } : {}) }); onEntre(r.token); }
    catch (e) { if (e.donnees?.choix) { setAppareils(e.donnees.appareils); setVue('appareils'); } setErreur(e.message); }
  };
  const lien = async ev => {
    ev.preventDefault(); setErreur(null);
    try { const r = await appel('POST', '/lien', { identifiant: ident }); setMsg(r.message); } catch (e) { setErreur(e.message); }
  };
  return (
    <div className="min-h-screen grid place-items-center px-4" style={{ background: 'var(--page-fond, #F5F7FA)' }}>
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-carte p-6 space-y-4">
        <div className="flex items-center gap-3"><Logo /><div className="text-second text-slate-500">Espace enseignant · Institut Ilya Prigogine</div></div>
        {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
        {vue === 'connexion' && (
          <form onSubmit={entrer} className="space-y-3">
            <label className="block text-second text-slate-600">Votre adresse de l’institut
              <input className="controle w-full mt-1" type="email" autoComplete="username" value={ident} onChange={e => setIdent(e.target.value)} required /></label>
            <label className="block text-second text-slate-600">Votre mot de passe de Lucie
              <input className="controle w-full mt-1" type="password" autoComplete="current-password" value={mdp} onChange={e => setMdp(e.target.value)} required /></label>
            <button type="submit" className="bouton bouton-fort controle w-full">Entrer</button>
            <button type="button" className="text-second text-iip-blue underline" onClick={() => { setVue('oubli'); setErreur(null); }}>Mot de passe oublié ?</button>
          </form>)}
        {vue === 'code' && (
          <form onSubmit={valider} className="space-y-3">
            <p className="text-sm">Un code à six chiffres vient de partir vers <b>{adresse}</b>. Il vaut 10 minutes.</p>
            <input className="controle w-full tracking-widest text-lg" inputMode="numeric" autoComplete="one-time-code" placeholder="Code à 6 chiffres"
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
            <button type="submit" className="bouton bouton-fort controle w-full" disabled={code.length !== 6}>Valider et reconnaître cet appareil</button>
          </form>)}
        {vue === 'appareils' && (
          <div className="space-y-2">
            <p className="text-sm">Choisissez l’appareil que celui-ci remplace :</p>
            {(appareils || []).map(a => <button key={a.id} type="button" className="bouton controle w-full justify-start" onClick={e => valider(e, a.id)}><IconDevices size={15} /> {a.nom} · vu le {court(a.vu_le || a.cree_le)}</button>)}
          </div>)}
        {vue === 'oubli' && (
          <div className="space-y-3">
            <p className="text-sm">Votre mot de passe est celui de Lucie. S’il est oublié, choisissez-en un nouveau depuis la page de connexion de Lucie
              (« Mot de passe oublié ») : il vaudra ici deux minutes plus tard.</p>
            {lucieUrl && <a className="bouton bouton-fort controle w-full justify-center" href={`${lucieUrl}/login`} target="_blank" rel="noreferrer">Ouvrir Lucie</a>}
            <button type="button" className="text-second text-iip-blue underline" onClick={() => setVue('connexion')}>Retour</button>
          </div>)}
        {vue === 'lien' && (
          <form onSubmit={lien} className="space-y-3">
            <p className="text-sm">Un lien part vers votre adresse de l’institut : il vous mène à choisir votre mot de passe pour cet espace.</p>
            <input className="controle w-full" type="email" placeholder="prenom.nom@institut-prigogine.be" value={ident} onChange={e => setIdent(e.target.value)} required />
            <button type="submit" className="bouton bouton-fort controle w-full">Recevoir mon lien</button>
            {msg && <div className="bloc-etat px-3 py-2 text-sm" data-etat="reussi">{msg}</div>}
            <button type="button" className="text-second text-iip-blue underline" onClick={() => setVue('connexion')}>Retour</button>
          </form>)}
      </div>
    </div>
  );
}

function ChoisirMotDePasse({ onFait, avecActuel }) {
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [encore, setEncore] = useState('');
  const [erreur, setErreur] = useState(null);
  const valider = async ev => {
    ev.preventDefault(); setErreur(null);
    if (nouveau !== encore) return setErreur('Les deux mots de passe diffèrent.');
    try { const r = await appel('POST', '/mot-de-passe', { actuel, nouveau }); onFait(r.token); } catch (e) { setErreur(e.message); }
  };
  return (
    <form onSubmit={valider} className="space-y-3 max-w-md">
      {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
      {avecActuel && <label className="block text-second text-slate-600">Mot de passe actuel<input className="controle w-full mt-1" type="password" value={actuel} onChange={e => setActuel(e.target.value)} /></label>}
      <label className="block text-second text-slate-600">Nouveau mot de passe (dix caractères au moins)<input className="controle w-full mt-1" type="password" autoComplete="new-password" value={nouveau} onChange={e => setNouveau(e.target.value)} /></label>
      <label className="block text-second text-slate-600">Encore une fois<input className="controle w-full mt-1" type="password" autoComplete="new-password" value={encore} onChange={e => setEncore(e.target.value)} /></label>
      <button type="submit" className="bouton bouton-fort controle">Enregistrer</button>
    </form>
  );
}


const Volet = props => <FenetreEspace {...props} />;
/* LIRE ET CONFIRMER UN TEXTE DE L'ÉCOLE (3.5.088) : l'ouvrir le pose « présenté » ; « Je confirme avoir pris connaissance »
   le pose « confirmé », dans le registre de lecture de Lucie. */
function LireTexte({ vid, onFermer }) {
  const [t, setT] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => { appel('GET', `/texte/${vid}`).then(setT).catch(e => setErreur(e.message)); }, [vid]);
  const confirmer = async () => {
    setEnvoi(true); setErreur(null);
    try { const r = await appel('POST', `/texte/${vid}/confirmer`); setT(x => ({ ...x, confirme_le: r.confirme_le })); }
    catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  };
  return (
    <Volet titre={t?.titre || 'Texte'} sous={t ? `Version ${t.numero}${t.publiee_le ? ` du ${court(t.publiee_le)}` : ''}` : ''} onFermer={onFermer}
      pied={t && (t.confirme_le
        ? <span className="text-second" style={{ color: 'var(--c-reussi, #3E7D5E)' }}>Vous avez confirmé avoir pris connaissance de ce texte le {court(t.confirme_le)}.</span>
        : <><span className="flex-1 min-w-0 text-second text-slate-600">La direction vous demande d’en prendre connaissance.</span>
            <button type="button" className="bouton bouton-fort controle" disabled={envoi} onClick={confirmer}>Je confirme avoir pris connaissance</button></>)}>
      {erreur && <Encadre etat="corriger" className="mb-3">{erreur}</Encadre>}
      {!t ? !erreur && <ChargementLucie /> : (
        <div className="space-y-4">
          <iframe title={t.titre} srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:15px/1.55 'Segoe UI',Arial,sans-serif;color:#1B2B4B;margin:0;padding:4px}</style>${t.html}`}
            sandbox="" className="w-full border-0" style={{ height: '58vh' }} />
          {t.source_url && <p className="m-0 text-second"><a className="text-iip-blue underline" href={t.source_url} target="_blank" rel="noreferrer">Le texte officiel, en ligne</a></p>}
        </div>)}
    </Volet>);
}
function TextesEcole() {
  const [l, setL] = useState(null);
  const [lire, setLire] = useState(null);
  const charger = () => appel('GET', '/textes').then(setL).catch(() => setL([]));
  useEffect(() => { charger(); }, []);
  if (!l) return <ChargementLucie />;
  return (
    <div className="space-y-4">
      <p className="m-0 text-slate-600">Les règles du jeu : circulaires, règlements, procédures. Ceux qui ne sont pas encore confirmés vous attendent.</p>
      {!l.length ? <p className="text-slate-500">Aucun texte pour l’instant.</p> : (
        <ListeEtats>
          {l.map(t => (
            <LigneEtat key={t.version_id} etat={t.confirme_le ? 'reussi' : 'corriger'} icone={IconBook} titre={t.titre} onClick={() => setLire(t.version_id)}
              droite={<span className="text-second text-slate-500 whitespace-nowrap">{t.confirme_le ? `confirmé le ${court(t.confirme_le)}` : t.ouvert_le ? 'ouvert, à confirmer' : 'à lire et confirmer'}</span>} />))}
        </ListeEtats>)}
      {lire && <LireTexte vid={lire} onFermer={() => { setLire(null); charger(); }} />}
    </div>);
}

/* MES DOCUMENTS (3.5.089) : les pièces que l'école lui a envoyées par Lucie — son contrat, sa fiche d'attributions… — telles
   qu'elles sont parties. Les ouvrir les pose « présentées » ; il en accuse réception d'un bouton. */
function OuvrirDocument({ d, onFermer }) {
  const [url, setUrl] = useState(null);
  const [etat, setEtat] = useState(d);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    let u = null;
    fetch(`/api/enseignant/document/${d.envoi_id}`, { headers: { Authorization: `Bearer ${lire()}` }, credentials: 'same-origin' })
      .then(async r => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`); u = URL.createObjectURL(await r.blob()); setUrl(u); setEtat(x => ({ ...x, presente_le: x.presente_le || 'maintenant' })); })
      .catch(e => setErreur(e.message));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [d.envoi_id]);
  const accuser = async () => { try { const r = await appel('POST', `/document/${d.envoi_id}/accuser`); setEtat(x => ({ ...x, accuse_le: r.accuse_le })); } catch (e) { setErreur(e.message); } };
  return (
    <Volet titre={d.sujet || d.nom_fichier} sous={`Envoyé le ${court(d.envoye_le)}${d.reference ? ` · réf. ${d.reference}` : ''}`} onFermer={onFermer}
      pied={url && <>
        <a className="bouton controle" href={url} download={d.nom_fichier} target="_blank" rel="noreferrer">Télécharger</a>
        <span className="flex-1" />
        {etat.accuse_le ? <span className="text-second" style={{ color: 'var(--c-reussi, #3E7D5E)' }}>Réception accusée le {court(etat.accuse_le)}</span>
          : <button type="button" className="bouton bouton-fort controle" onClick={accuser}>J’accuse réception de cette pièce</button>}</>}>
      {erreur && <Encadre etat="corriger" className="mb-3">{erreur}</Encadre>}
      {!url ? !erreur && <ChargementLucie /> : (
        <iframe title={d.nom_fichier} src={url} className="w-full border border-slate-200 rounded-champ" style={{ height: '62vh' }} />)}
    </Volet>);
}
function MesDocuments() {
  const [l, setL] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const charger = () => appel('GET', '/documents').then(setL).catch(() => setL([]));
  useEffect(() => { charger(); }, []);
  if (!l) return <ChargementLucie />;
  return (
    <div className="space-y-4">
      <p className="m-0 text-slate-600">Les pièces que l’école vous a envoyées par Lucie — votre contrat, votre fiche d’attributions… —, telles qu’elles sont parties.</p>
      {!l.length ? <p className="text-slate-500">Aucune pièce pour l’instant.</p> : (
        <ListeEtats>
          {l.map(d => d.sans_copie ? (
            <LigneEtat key={d.envoi_id} etat="indisponible" icone={IconFileText} titre={d.sujet || d.nom_fichier}
              sous={`envoyé le ${court(d.envoye_le)}${d.reference ? ` · réf. ${d.reference}` : ''}`}
              droite={<span className="text-second text-slate-500 text-right">copie non conservée par Lucie<span className="block">à redemander au secrétariat</span></span>} />
          ) : (
            <LigneEtat key={d.envoi_id} etat={d.accuse_le ? 'reussi' : 'disponible'} icone={IconFileText} titre={d.sujet || d.nom_fichier}
              sous={`envoyé le ${court(d.envoye_le)}${d.reference ? ` · réf. ${d.reference}` : ''}`} onClick={() => setOuvert(d)}
              droite={<span className="text-second text-slate-500 whitespace-nowrap">{d.accuse_le ? `reçu le ${court(d.accuse_le)}` : 'à ouvrir'}</span>} />))}
        </ListeEtats>)}
      {ouvert && <OuvrirDocument d={ouvert} onFermer={() => { setOuvert(null); charger(); }} />}
    </div>);
}
/* L'AIDE (3.5.089) : le mode d'emploi des enseignants, tel que Lucie le tient (guide en ligne, version Enseignants). */
function FicheEtudiant({ id, onFermer }) {
  const [f, setF] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => { appel('GET', `/etudiant/${id}`).then(setF).catch(e => setErreur(e.message)); }, [id]);
  return (
    <Volet titre={f ? `${String(f.nom || '').toUpperCase()} ${f.prenom || ''}` : 'Fiche'} sous={f ? [f.section, f.matricule, f.email].filter(Boolean).join(' · ') : ''} onFermer={onFermer}>
      {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
      {!f ? !erreur && <ChargementLucie /> : (
        <div className="space-y-5 text-sm">
          {f.amenagements.length > 0 && (
            <Encadre etat="disponible" titre="Aménagements raisonnables accordés">
              <ul className="m-0 pl-5">{f.amenagements.map((a, i) => <li key={i}>{a.libelle}{a.precisions ? ` — ${a.precisions}` : ''}{a.ue_num ? ` (UE ${a.ue_num})` : ''}</li>)}</ul></Encadre>)}
          {f.cours.map(c => {
            const p = c.presences; const dus = p.present + p.absent + p.justifie;
            return (
              <section key={c.code} className="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                <div className="font-semibold">{c.nom || c.code} <span className="font-normal text-slate-500">· UE {c.ue_num}{c.groupe ? ` · ${c.groupe}` : ''}</span></div>
                <div className="text-slate-600 mt-1">Présences : {p.present} présent·e · {p.absent} absent·e · {p.justifie} justifiée(s){p.passees ? ` — sur ${p.passees} séance(s) passée(s)${dus < p.passees ? `, ${p.passees - dus} non encodée(s)` : ''}` : ''}</div>
                {c.notes.length > 0 ? (
                  <div className="mt-2 max-w-md"><Tableau dense><tbody>
                    {c.notes.map((n, i) => <Tr key={i}><Td>{n.evaluation}</Td>
                      <Td align="droite" className="tabular-nums">{n.mention || (n.points != null ? `${String(n.points).replace('.', ',')} / ${n.sur}` : '—')}</Td></Tr>)}
                  </tbody></Tableau></div>) : <div className="text-slate-400 mt-1">Aucune note au carnet.</div>}
              </section>);
          })}
        </div>)}
    </Volet>);
}
function TrainDeLUE({ u }) {
  return <TrainUE section={u.section} niveau={u.ue_niv} ects={u.ects} nbCours={u.cours.length}
    nbEtudiants={new Set(u.cours.flatMap(c => c.etudiants.map(e => e.id))).size} />;
}
/* LA LISTE PAR GROUPE (3.5.156, Charles : « je ne vois pas les listes par groupe ») : un intertitre par groupe (« Labo · Gr. A »),
   ses étudiants numérotés ; un cours que tous suivent reste une seule liste. */
function ListeParGroupe({ etudiants, onFiche }) {
  const groupes = new Map();
  for (const e of etudiants) for (const g of String(e.groupe || '').split(' + ').map(x => x.trim()).filter(Boolean).concat(e.groupe ? [] : [''])) {
    (groupes.get(g) || groupes.set(g, []).get(g)).push(e);
  }
  const cles = [...groupes.keys()].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const nomOrd = (x, y) => `${x.nom} ${x.prenom}`.localeCompare(`${y.nom} ${y.prenom}`, 'fr');
  return (
    <div className="pb-2 px-4 grid gap-3" style={{ gridTemplateColumns: cles.length > 1 ? 'repeat(auto-fill, minmax(260px, 1fr))' : '1fr' }}>
      {cles.map(g => (
        <div key={g || '—'} className="min-w-0">
          {(cles.length > 1 || g) && (
            <div className="intertitre flex items-baseline gap-2 px-1 py-1 border-b border-slate-200">
              <span className="font-semibold text-iip-texte">{g.replace(/^Org 1 · /, '').replace(/ · Org 1 · /, ' · ') || 'Sans groupe'}</span>
              <span className="text-second text-slate-500">{groupes.get(g).length}</span>
            </div>)}
          <ol className="m-0 pl-0 list-none">
            {groupes.get(g).sort(nomOrd).map((e, i) => (
              <li key={e.id}><button type="button" className="w-full text-left px-1 py-1 text-sm hover:bg-slate-50 flex gap-2" onClick={() => onFiche(e.id)}>
                <span className="w-6 text-right tabular-nums text-slate-400">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate"><b className="font-semibold">{String(e.nom || '').toUpperCase()}</b> {e.prenom}</span>
              </button></li>))}
          </ol>
        </div>))}
    </div>);
}

function MesUE() {
  const [t, setT] = useState(null);
  const [ouvert, setOuvert] = useState({});
  const [fiche, setFiche] = useState(null);
  const [liste, setListe] = useState(null);
  const [ecrire, setEcrire] = useState(false);
  useEffect(() => { appel('GET', '/tableau').then(setT).catch(() => setT({ pret: false })); }, []);
  if (!t) return <ChargementLucie />;
  if (!t.pret || !t.ues?.length) return <p className="text-slate-500">Aucune unité attribuée cette année dans Lucie.</p>;
  return (
    <div className="space-y-5">
      {/* UNE CHOSE, UNE PLACE (3.5.202, Charles : « une chose, une place ») : les dates et délibérations vivent dans Mon agenda, le
          dossier pédagogique et la DUE dans Mes unités ; ici, les étudiants — et leur écrire. */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="titre-ecran !mb-0 flex-1">Mes étudiants{t.annee ? <span className="compte">{t.annee}</span> : null}</h1>
        <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => setEcrire(true)}><IconMessages size={16} /> Écrire à mes étudiants</button>
      </div>
      {[...t.ues].sort((a, b) => rangBloc(a.ue_niv) - rangBloc(b.ue_niv) || a.ue_num - b.ue_num).map(u => (
        <section key={u.ue_num} className="carte overflow-hidden">
          <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-slate-100">
            <span className="flex-1 min-w-[16rem] font-semibold text-iip-texte">UE {u.ue_num} — {u.ue_nom}{u.section ? <span className="font-normal text-slate-500"> · {u.section}</span> : ''}</span>
            <TrainDeLUE u={u} />
          </div>
          {u.cours.map(c => {
            const k = `${u.ue_num}|${c.code}`;
            return (
              <div key={c.code} className="border-t border-slate-100">
                <div className="flex items-center hover:bg-slate-50">
                  <button type="button" className="flex-1 min-w-0 text-left px-4 py-3 flex items-center gap-3" onClick={() => setOuvert(o => ({ ...o, [k]: !o[k] }))}>
                    {ouvert[k] ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                    <span className="flex-1 min-w-0">{c.nom || c.code}</span>
                    <span className="text-second text-slate-500">{(c.groupes || []).length ? `${c.groupes.length > 1 ? 'groupes' : 'groupe'} ${c.groupes.join(', ')} · ` : ''}{c.etudiants.length} étudiant(s)</span>
                  </button>
                  {/* LA LISTE SUR MESURE (3.5.160, Charles : « le petit avion pour exporter des listes sur mesure ») : colonnes au choix,
                      aperçu, PDF ou Excel — une feuille par groupe. */}
                  <button type="button" className="mr-3 w-9 h-9 grid place-items-center rounded-champ text-iip-blue hover:bg-white border border-transparent hover:border-slate-200"
                    title="Exporter une liste sur mesure (PDF ou Excel)" aria-label="Exporter une liste sur mesure" onClick={() => setListe(c.code)}><IconSend size={18} /></button>
                </div>
                {ouvert[k] && <ListeParGroupe etudiants={c.etudiants} onFiche={setFiche} />}
              </div>);
          })}
        </section>))}
      {fiche && <FicheEtudiant id={fiche} onFermer={() => setFiche(null)} />}
      <Suspense fallback={null}>{ecrire && <MessagesEtudiantsLucie titre="Écrire à mes étudiants" onFermer={() => setEcrire(false)} />}</Suspense>
      {liste && <Suspense fallback={null}><ListeSurMesureLucie cours={liste} annee={t.annee || undefined} onFermer={() => setListe(null)} /></Suspense>}
    </div>);
}

/* LE QR PROJETÉ (3.5.136) : signé par l'espace, il change toutes les 15 s ; l'étudiant scanne vers Lucie. Le compteur suit les
   présences que Lucie renvoie (toutes les dix secondes environ). */

const MOT_AGENDA = { ferie: 'Férié', ferme: 'École fermée', conge: 'Congé', formation: 'Formation', moment: '' };
function BoutonContact({ compact = false }) {
  const [c, setC] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const charger = () => appel('GET', '/contact').then(setC).catch(() => {});
  useEffect(() => { charger(); const t = setInterval(charger, 120000); return () => clearInterval(t); }, []);
  if (!c) return null;
  const ok = !!c.secretariat_ouvert;
  const Tel = ({ p }) => (p.telephone ? <a className="text-iip-blue underline whitespace-nowrap" href={`tel:${String(p.telephone).replace(/\s+/g, '')}`}>{p.telephone}</a> : <span className="text-slate-400">pas de numéro</span>);
  return (<>
    <button type="button" onClick={() => { charger(); setOuvert(true); }} title={ok ? 'Contacter' : 'Urgence'} className={`shrink-0 min-h-11 md:min-h-9 rounded-carte inline-flex items-center justify-center gap-2 text-sm font-semibold text-white ${compact ? 'md:w-9 md:h-9 md:px-0 px-3' : 'px-3'}`}
      style={{ background: ok ? 'var(--c-reussi, #3E7D5E)' : 'var(--c-attente, #B45309)' }}>
      <IconPhone size={17} stroke={1.8} />{!compact && ` ${ok ? 'Contacter' : 'Urgence'}`}
    </button>
    {ouvert && (
      <Volet titre={ok ? 'Contacter l’école' : 'Urgence'} sous={ok ? 'Le secrétariat est ouvert' : 'Le secrétariat est fermé : la permanence'} onFermer={() => setOuvert(false)}>
        {/* LA FRISE DE LUCIE (3.5.134, Charles : « cela ne respecte pas la mise en page de Lucie, avec la ligne du temps de la
            journée ») : le même dessin que « Qui est là ? », sans les crayons de la direction. */}
        <div className="space-y-2 text-sm">
          <div className="intertitre">La journée de l’équipe</div>
          {c.journee?.length || c.permanences.length
            ? <div className="overflow-x-auto"><div className="min-w-[640px]"><FriseJournee journee={c.journee || []} permanences={c.permanences} heure={c.heure} /></div></div>
            : <p className="m-0 text-slate-500">Personne n’a d’horaire ni de permanence aujourd’hui.</p>}
          <p className="m-0 text-mention text-slate-400">Mis à jour à {c.heure}.</p>
        </div>
      </Volet>)}
  </>);
}


function MonCompte({ moi, onToken }) {
  const [app, setApp] = useState(null);
  const charger = () => appel('GET', '/appareils').then(setApp).catch(() => setApp({ appareils: [] }));
  useEffect(() => { charger(); }, []);
  return (
    <div className="space-y-5">
      <h1 className="titre-ecran">Mon compte</h1>
      <p className="m-0 text-slate-600">{String(moi.nom || '').toUpperCase()} {moi.prenom} · {moi.email}</p>
      <section className="bg-white border border-slate-200 rounded-carte overflow-hidden">
        <div className="entete-carte px-4 py-3 font-semibold text-iip-texte inline-flex items-center gap-2 w-full"><IconDevices size={16} /> Mes appareils reconnus ({app?.appareils?.length || 0} sur {app?.max || 3})</div>
        {(app?.appareils || []).map(a => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-t border-slate-100">
            <span className="flex-1">{a.nom}{a.courant ? ' · cet appareil' : ''} <span className="text-second text-slate-500">· vu le {court(a.vu_le || a.cree_le)}</span></span>
            <button type="button" className="bouton" aria-label="Oublier cet appareil" onClick={async () => { await appel('POST', `/appareils/${a.id}/oublier`); charger(); }}><IconTrash size={15} /></button>
          </div>))}
      </section>
      <section className="bg-white border border-slate-200 rounded-carte overflow-hidden">
        <div className="entete-carte px-4 py-3 font-semibold text-iip-texte inline-flex items-center gap-2 w-full"><IconLock size={16} /> Mon mot de passe</div>
        <div className="p-4 text-sm text-slate-600">C’est celui de Lucie (3.5.242) : pour le changer, dans Lucie, le bouclier en haut à droite (Mon compte). Le nouveau vaut ici deux minutes plus tard.</div>
      </section>
    </div>
  );
}

/* LA GRILLE DES PRÉSENCES DE L'ANNÉE (3.5.135, Charles, 6 novembre 2026 : « les enseignants encoderont dans leur espace » ; lot 1).
   Par cours : ses étudiants en lignes, ses séances depuis la rentrée en colonnes. Un clic sur une case ouvre le choix (P, P*, A,
   J + motif, effacer) ; la case part par la porte de la séance, Lucie la juge au relevé (quelques secondes) et un refus se dit.
   Export Excel : la grille telle qu'elle est à l'écran. */
function SuivreLiens({ allerA, retour = null }) {
  const loc = useLocation();
  useEffect(() => {
    const p = loc.pathname;
    if (retour && (p === '/' || p === '/accueil')) { retour(); return; }
    if (p === '/' || p === '/accueil' || p === '/professeurs') return;
    if (p.startsWith('/documentation')) allerA('ecole');
    else if (p.startsWith('/mes-cours')) allerA('notes');
    else if (p.startsWith('/agenda') || p.startsWith('/horaire')) allerA('agenda');
    else import('../lib/dialogue.jsx').then(m => m.informer('Cet écran est dans Lucie, pas dans l’espace enseignant.')).catch(() => {});
  }, [loc.key]);   // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
function TableauDeBord({ allerA, apresEntete = null }) {
  return (
    <div style={{ '--rail': '0px' }} className="-mx-4 md:-mx-8 -mt-4 md:-mt-8">
      <MemoryRouter initialEntries={['/accueil']}>
        <SuivreLiens allerA={allerA} />
        <FournisseurRail valeur={() => {}} panneau={null} echanges={() => {}}>
          <Suspense fallback={<ChargementLucie />}><AccueilLucie apresEntete={apresEntete} /></Suspense>
        </FournisseurRail>
      </MemoryRouter>
    </div>);
}

function MesCoursEspace({ vue, tic, allerA, demande }) {
  // Une seule instance pour Aujourd'hui, Mes notes, Mes présences, Mes unités et À rendre : un cours ouvert reste ouvert.
  return (
    // Pas de rail de Lucie ici : sa gouttière tombe à zéro (`--rail`), la navigation de l'espace en tient lieu.
    <div style={{ '--rail': '0px' }} className="-mx-4 md:-mx-6">
      <FournisseurRail valeur={() => {}} panneau={null} echanges={() => {}}>
        <Suspense fallback={<ChargementLucie />}><MesCoursLucie espace={{ vue, tic, retour: true, allerA, demande }} /></Suspense>
      </FournisseurRail>
    </div>);
}

const TYPES_DATE = {
  examen: ['Examen', 'var(--c-attente, #B45309)'], deliberation: ['Délibération', 'var(--c-principal, #19537E)'],
  conge: ['Congé', 'rgb(var(--gris-400))'], ferme: ['École fermée', 'rgb(var(--gris-500))'], ferie: ['Férié', 'rgb(var(--gris-400))'],
  moment: ['École', 'var(--c-disponible, #2F6FB0)'], formation: ['Formation', 'var(--c-reussi, #3E7D5E)'],
};
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function MesDates({ moi }) {
  const [d, setD] = useState(null);
  const [passees, setPassees] = useState(false);
  const [filtre, setFiltre] = useState('tout');
  let annee = null; try { annee = localStorage.getItem('annee_active'); } catch { /* */ }
  if (!/^\d{4}-\d{4}$/.test(String(annee || ''))) annee = null;
  useEffect(() => {
    fetch(`/api/mes-cours/dates${annee ? `?annee=${encodeURIComponent(annee)}` : ''}`).then(r => (r.ok ? r.json() : { items: [] }))
      .then(setD).catch(() => setD({ items: [] }));
  }, [annee]);
  if (!d) return <ChargementLucie />;
  const auj = moi.aujourdhui;
  const l = (d.items || []).filter(x => (passees || (x.au || x.date) >= auj))
    .filter(x => filtre === 'tout' || (filtre === 'miennes' ? ['examen', 'deliberation'].includes(x.type) : !['examen', 'deliberation'].includes(x.type)));
  const parMois = [];
  for (const x of l) { const k = x.date.slice(0, 7); let g = parMois.find(y => y.k === k); if (!g) parMois.push(g = { k, l: [] }); g.l.push(x); }
  const jourCourt = iso => { const [a, m, j] = iso.split('-').map(Number); return `${['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][new Date(a, m - 1, j).getDay()]} ${j}`; };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="segments">{[['tout', 'Tout'], ['miennes', 'Examens et délibérations'], ['ecole', 'L’école']].map(([k, t]) => (
          <button key={k} type="button" onClick={() => setFiltre(k)} className={filtre === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{t}</button>))}</div>
        <label className="text-second text-slate-600 inline-flex items-center gap-1.5 ml-auto"><input type="checkbox" checked={passees} onChange={e => setPassees(e.target.checked)} /> Montrer les dates passées</label>
      </div>
      {!parMois.length && <p className="text-slate-500">Aucune date à venir{filtre !== 'tout' ? ' dans ce choix' : ''}.</p>}
      {parMois.map(g => (
        <section key={g.k} className="bg-white border border-slate-200 rounded-carte overflow-hidden">
          <div className="entete-carte px-4 py-2 font-semibold text-iip-texte first-letter:uppercase">{MOIS_FR[Number(g.k.slice(5, 7)) - 1]} {g.k.slice(0, 4)}</div>
          {g.l.map((x, i) => { const [lib, c] = TYPES_DATE[x.type] || ['Date', 'rgb(var(--gris-400))'];
            return (
              <div key={i} className={`flex items-start gap-3 px-4 py-2 border-t border-slate-100 ${(x.au || x.date) < auj ? 'opacity-60' : ''}`}>
                <span className="w-24 shrink-0 tabular-nums text-sm"><b>{jourCourt(x.date)}</b>{x.au ? <span className="text-slate-500"> → {court(x.au)}</span> : null}{x.heure ? <span className="block text-second text-slate-500">{String(x.heure).slice(0, 5)}</span> : null}</span>
                <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: c }}>{lib}{x.session ? ` S${x.session}` : ''}</span>
                <span className="flex-1 min-w-0 text-sm">{x.titre}{x.lieu ? <span className="block text-second text-slate-500">{x.lieu}</span> : null}</span>
              </div>); })}
        </section>))}
      <p className="m-0 text-mention text-slate-400">Les examens et les délibérations partent aussi dans l’agenda de votre téléphone (« Dans l’agenda de mon téléphone »).</p>
    </div>);
}

/* LA LIGNE DU TEMPS DE L'ÉCOLE (3.5.182, Charles : « une vision sur l'agenda — timeline — de l'école ; important ; avec les
   journées portes ouvertes, les événements, les inscriptions, les salons… »). L'année en largeur (de la mi-août à la mi-août), une
   rangée par sorte d'événement, chaque événement à sa place et à sa durée ; aujourd'hui en trait rouge ; au survol, le détail.
   Sous la ligne, la liste des événements à venir. Les mêmes données que « Mes dates » (les moments de l'agenda de l'école qui
   concernent les enseignants, les congés, les fériés, mes examens et délibérations). */
const RANGEES_ECOLE = [
  ['Portes ouvertes', m => m.genre === 'Portes ouvertes', 'var(--c-serie_5)'],
  ['Inscriptions', m => m.genre === 'Inscriptions' || m.genre === 'Rentrée', 'var(--c-disponible)'],
  ['Salons', m => m.genre === 'Salon, SIEP', 'var(--c-serie_3)'],
  ['Examens', m => m.type === 'examen' || m.genre === 'Examens', 'var(--c-attente)'],
  ['Délibérations', m => m.type === 'deliberation' || m.genre === 'Délibérations', 'var(--c-principal)'],
  ['Cérémonies', m => m.genre === 'Remise des diplômes' || m.genre === 'Cérémonie', 'var(--c-epreuve, var(--c-serie_4))'],
  ['Formations, réunions', m => m.type === 'formation' || ['Journée de formation', 'Réunion', 'Conseil', 'Qualité', 'Échéance, document'].includes(m.genre), 'var(--c-reussi)'],
  ['Congés', m => ['conge', 'ferme', 'ferie'].includes(m.type), 'rgb(var(--gris-400))'],
  ['Autres', () => true, 'rgb(var(--gris-500))'],
];
function TimelineEcole({ moi, annee }) {
  const [d, setD] = useState(null);
  const [vu, setVu] = useState(null);
  useEffect(() => {
    fetch(`/api/mes-cours/dates${annee ? `?annee=${encodeURIComponent(annee)}` : ''}`).then(r => (r.ok ? r.json() : { items: [] }))
      .then(setD).catch(() => setD({ items: [] }));
  }, [annee]);
  if (!d) return <ChargementLucie />;
  const a0 = Number(String(d.annee || annee || moi.aujourdhui).slice(0, 4));
  const debut = new Date(Date.UTC(a0, 7, 15)), fin = new Date(Date.UTC(a0 + 1, 7, 15));
  const jours = (fin - debut) / 864e5;
  const pos = iso => Math.max(0, Math.min(100, ((new Date(`${String(iso).slice(0, 10)}T00:00:00Z`) - debut) / 864e5 / jours) * 100));
  const rangees = RANGEES_ECOLE.map(([l, f, c]) => ({ l, f, c, items: [] }));
  for (const x of d.items || []) { const r = rangees.find(z => z.f(x)); if (r) r.items.push(x); }
  const visibles = rangees.filter(r => r.items.length);
  const mois = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(a0, 8 + i, 1)));
  const auj = moi.aujourdhui;
  const dateCourte = iso => { const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number); return `${j} ${MOIS_FR[m - 1].slice(0, 4)}.`; };
  const aVenir = (d.items || []).filter(x => (x.au || x.date) >= auj && !['ferie'].includes(x.type)).slice(0, 40);
  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-carte p-4 overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="relative h-6 ml-40 border-b border-slate-200">
            {mois.map(m => <span key={m.toISOString()} className="absolute top-0 text-mention text-slate-500 first-letter:uppercase" style={{ left: `${pos(m.toISOString())}%` }}>{MOIS_FR[m.getUTCMonth()].slice(0, 4)}.</span>)}
          </div>
          {visibles.map(r => (
            <div key={r.l} className="flex items-center border-b border-slate-100 last:border-0">
              <div className="w-40 shrink-0 pr-3 py-2 text-second font-semibold text-iip-texte flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.c }} />{r.l}</div>
              <div className="relative flex-1 h-9">
                {mois.map(m => <span key={m.toISOString()} className="absolute top-0 bottom-0 w-px bg-slate-100" style={{ left: `${pos(m.toISOString())}%` }} />)}
                {auj >= debut.toISOString().slice(0, 10) && auj < fin.toISOString().slice(0, 10) && <span className="absolute top-0 bottom-0 w-0.5 z-10" style={{ left: `${pos(auj)}%`, background: 'var(--c-refuse, #9D4A38)' }} />}
                {r.items.map((x, i) => {
                  const g = pos(x.date), dr = pos(x.au || x.date);
                  return (
                    <button key={i} type="button" onMouseEnter={() => setVu(x)} onMouseLeave={() => setVu(null)} onClick={() => setVu(x)}
                      className="absolute top-1.5 h-6 rounded-md hover:ring-2 hover:ring-offset-1"
                      style={{ left: `${g}%`, width: `max(8px, ${dr - g}%)`, background: r.c, opacity: (x.au || x.date) < auj ? 0.45 : 0.9, '--tw-ring-color': r.c }}
                      aria-label={`${x.titre} — ${dateCourte(x.date)}`} />);
                })}
              </div>
            </div>))}
          {!visibles.length && <p className="text-slate-500 m-0">Rien dans l’agenda de l’école pour cette année.</p>}
        </div>
        <div className="mt-3 min-h-[2.5rem] text-sm">
          {vu ? <><b>{vu.titre}</b> <span className="text-slate-600">· {dateCourte(vu.date)}{vu.au && vu.au !== vu.date ? ` → ${dateCourte(vu.au)}` : ''}{vu.heure ? ` · ${String(vu.heure).slice(0, 5)}` : ''}{vu.lieu ? ` · ${vu.lieu}` : ''}</span></>
            : <span className="text-slate-400">Survolez (ou touchez) un événement pour son détail. Le trait rouge, c’est aujourd’hui.</span>}
        </div>
      </section>
      <section className="bg-white border border-slate-200 rounded-carte overflow-hidden">
        <div className="entete-carte px-4 py-2 font-semibold text-iip-texte">À venir</div>
        {aVenir.map((x, i) => { const r = rangees.find(z => z.f(x));
          return (
            <div key={i} className="flex items-start gap-3 px-4 py-2 border-t border-slate-100 text-sm">
              <span className="w-32 shrink-0 tabular-nums"><b>{dateCourte(x.date)}</b>{x.au && x.au !== x.date ? <span className="text-slate-500"> → {dateCourte(x.au)}</span> : null}</span>
              <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: r?.c || 'rgb(var(--gris-500))' }}>{r?.l || 'École'}</span>
              <span className="flex-1 min-w-0">{x.titre}{x.lieu ? <span className="block text-second text-slate-500">{x.lieu}</span> : null}</span>
            </div>); })}
        {!aVenir.length && <p className="px-4 py-3 m-0 text-slate-500">Rien à venir.</p>}
      </section>
    </div>);
}

/* MON AGENDA : la semaine (avec les journées de l'école), et deux portes — les visites de stage, l'horaire dans le téléphone. */
function MonAgenda({ moi, onPresences }) {
  const [ouvert, setOuvert] = useState(null);
  // L'ANNÉE DE L'ÉCOLE (3.5.140, Charles : « l'agenda de l'année, basé sur ce qu'on a créé ») : l'agenda de l'école de Lucie, en lecture.
  const [vue, setVue] = useState('dates');
  // UNE ANNÉE LISIBLE OU CELLE DU JOUR (3.5.190 : « Invalid time value » — le navigateur gardait une année illisible, « null »).
  let annee = null; try { annee = localStorage.getItem('annee_active'); } catch { /* */ }
  if (!/^\d{4}-\d{4}$/.test(String(annee || ''))) {
    const [a, m, j] = String(moi.aujourdhui || new Date().toISOString()).slice(0, 10).split('-').map(Number);
    const a0 = (m > 8 || (m === 8 && j >= 15)) ? a : a - 1;
    annee = `${a0}-${a0 + 1}`;
  }
  return (
    <div className="space-y-4">
      <h1 className="titre-ecran">Mon agenda</h1>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="segments">{[['dates', 'Mes dates'], ['semaine', 'Ma semaine'], ['deliberations', 'Évaluations et délibérations'], ['annee', 'L’année de l’école'], ['dispos', 'Mes disponibilités']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setVue(k)} className={vue === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{l}</button>))}</div>
        <span className="flex-1" />
        <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => setOuvert('absence')}><IconUserOff size={16} /> Signaler une absence</button>
        <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => setOuvert('visites')}><IconCar size={16} /> Mes visites de stage</button>
        <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => setOuvert('agenda')}><IconCalendarShare size={16} /> Dans l’agenda de mon téléphone</button>
      </div>
      {vue === 'dates' ? <MesDates moi={moi} />
        // MA SEMAINE À L'ÉCHELLE DES HEURES (3.5.150, Charles : « une structure par heures, comme dans l'horaire normal ») : la
        // semaine de Lucie, avec l'agenda de l'école au-dessus de chaque jour ; une séance ouvre ses présences.
        // LES DÉLIBÉRATIONS DE MES UNITÉS (3.5.160, Charles : « ceci doit aller dans agenda ») : le tableau quitte Mes unités.
        : vue === 'deliberations' ? <EvaluationsDeliberations annee={annee || undefined} />
        // MES DISPONIBILITÉS (3.5.224) : l'agenda que le secrétariat tient pour moi ; je propose, il applique.
        : vue === 'dispos' ? <Suspense fallback={<ChargementLucie />}><MesDisponibilitesLucie /></Suspense>
        : vue === 'semaine' ? <Suspense fallback={<ChargementLucie />}><SemaineLucie enLigne avecAgenda onSeance={onPresences} /></Suspense>
        // L'ANNÉE DE L'ÉCOLE, UNE FOIS (3.5.202) : la frise ; la vue semaine par semaine faisait doublon.
        : <TimelineEcole moi={moi} annee={annee} />}
      <Suspense fallback={null}>
        {ouvert === 'visites' && <VisitesStageLucie onFermer={() => setOuvert(null)} />}
        {ouvert === 'absence' && <SignalerAbsenceLucie onFermer={() => setOuvert(null)} />}
        {ouvert === 'agenda' && <AgendaAbonnementLucie onFermer={() => setOuvert(null)} />}
      </Suspense>
    </div>);
}

/* L'ÉCOLE : ce qu'elle envoie (textes à lire, documents), écrire aux étudiants, l'aide. Une face soulignée à la fois. */
function LEcole({ initiale = 'textes' }) {
  const [f, setF] = useState(initiale);
  return (
    <div className="space-y-4">
      <h1 className="titre-ecran">L’école</h1>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {[['textes', 'Textes à lire'], ['documents', 'Mes documents'], ['reunions', 'Mes réunions'], ['voyages', 'Voyages d’études']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setF(k)} className={`onglet-page ${f === k ? 'onglet-page-actif' : ''}`}>{l}</button>))}
      </div>
      {/* MES RÉUNIONS (3.5.224) : celles où je suis convoqué·e, en lecture — ordre du jour, ce qui a été dit et décidé. */}
      {f === 'documents' ? <MesDocuments /> : f === 'voyages' ? <Suspense fallback={<ChargementLucie />}><VoyagesLucie /></Suspense> : f === 'reunions' ? <Suspense fallback={<ChargementLucie />}><MesReunionsLucie /></Suspense> : <TextesEcole />}
    </div>);
}

/* UNE PAGE QUI TOMBE NE BLANCHIT PLUS TOUT L'ESPACE (3.5.185, Charles : « espace enseignant vide, blanc ») : une erreur dans un
   écran de Lucie (une réponse inattendue du relais) n'emporte que cet écran ; le reste de l'espace reste là, et le message le dit. */
class Garde extends Component {
  constructor(p) { super(p); this.state = { erreur: null }; }
  static getDerivedStateFromError(erreur) { return { erreur }; }
  componentDidCatch(e) { console.error('[espace enseignant]', e); }
  componentDidUpdate(prev) { if (prev.cle !== this.props.cle && this.state.erreur) this.setState({ erreur: null }); }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div className="bloc-etat px-4 py-3 text-sm" data-etat="corriger">
        Cette page n’a pas pu s’afficher. Rechargez dans un instant ; si cela persiste, signalez-le à la direction.
        <button type="button" className="bouton ml-3" onClick={() => this.setState({ erreur: null })}>Réessayer</button>
      </div>);
  }
}

/* LE BOUTON DU RAIL : commun aux deux espaces (3.5.184), dans components/RailEspace.jsx. */

/* PROPOSER UNE AMÉLIORATION ET ANNULER MES GESTES (3.5.224, Charles : ce qui manquait à l'espace) : les deux outils de la barre
   du haut de Lucie, au même endroit que la loupe. Les écrans de Lucie, par le relais : même registre des idées, mêmes gestes. */
const CLASSE_OUTIL = 'w-9 h-9 grid place-items-center rounded-carte border border-slate-200 bg-white hover:shadow-pose';
function OutilsEspace({ ecran }) {
  const [idees, setIdees] = useState(false);
  return (<>
    <button type="button" onClick={() => setIdees(true)} aria-label="Proposer une amélioration" title="Proposer une amélioration"
      className={CLASSE_OUTIL} style={{ color: 'var(--menu-icone)' }}><IconBulb size={17} stroke={1.8} /></button>
    <AnnulerGestes classeBouton={CLASSE_OUTIL} taille={17} style={{ color: 'var(--menu-icone)' }} />
    {idees && <Suspense fallback={null}><AmeliorationsLucie ecran={`Espace enseignant — ${ecran}`} onClose={() => setIdees(false)} /></Suspense>}
  </>);
}

/* LA LOUPE (3.5.161, Charles : « il n'y a pas la petite loupe, ni l'aide ») : « Où aller ? » de l'espace — les entrées, mes unités
   et mes cours (un cours ouvre ses notes), mes étudiants (leur fiche), et la question posée au mode d'emploi. ⌘K / Ctrl+K partout. */
const sansAccent = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function RechercheEspace({ faces, onFace, onCours, onAide }) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const [t, setT] = useState(null);
  const [fiche, setFiche] = useState(null);
  const champ = useRef(null);
  useEffect(() => {
    const touche = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOuvert(o => !o); } if (e.key === 'Escape') setOuvert(false); };
    window.addEventListener('keydown', touche); return () => window.removeEventListener('keydown', touche);
  }, []);
  useEffect(() => {
    if (!ouvert) return;
    setQ(''); setI(0); setTimeout(() => champ.current?.focus(), 0);
    if (!t) appel('GET', '/tableau').then(setT).catch(() => setT({ ues: [] }));
  }, [ouvert]);   // eslint-disable-line react-hooks/exhaustive-deps
  const n = sansAccent(q.trim());
  const res = [];
  if (n) {
    for (const f of faces) if (sansAccent(f.l).includes(n)) res.push({ type: 'Aller à', l: f.l, faire: () => onFace(f.k) });
    const vus = new Set();
    for (const u of t?.ues || []) {
      if (sansAccent(`ue ${u.ue_num} ${u.ue_nom}`).includes(n)) res.push({ type: 'Unité', l: `UE ${u.ue_num} — ${u.ue_nom}`, faire: () => onFace('etudiants') });
      for (const c of u.cours || []) {
        if (sansAccent(`${c.code} ${c.nom}`).includes(n)) res.push({ type: 'Cours · notes', l: `${c.code} · ${c.nom}`, faire: () => onCours(c.code) });
        for (const e of c.etudiants || []) {
          if (vus.has(e.id) || !sansAccent(`${e.nom} ${e.prenom}`).includes(n)) continue;
          vus.add(e.id); res.push({ type: 'Étudiant', l: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`, faire: () => setFiche(e.id), reste: true });
        }
      }
    }
    res.splice(12);
    res.push({ type: 'Aide', l: `Chercher « ${q.trim()} » dans le mode d’emploi`, faire: () => onAide(q.trim()) });
  }
  const choisir = r => { if (!r) return; r.faire(); if (!r.reste) setOuvert(false); };
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} aria-label="Rechercher" title="Où aller ? (⌘K)"
        className="w-9 h-9 grid place-items-center rounded-carte border border-slate-200 bg-white hover:shadow-pose" style={{ color: 'var(--menu-icone)' }}><IconSearch size={17} stroke={1.8} /></button>
      {ouvert && (
        <div className="fixed inset-0 z-[80] bg-slate-900/30 backdrop-blur-[2px]" onMouseDown={() => setOuvert(false)}>
          <div className="mx-auto mt-[12vh] w-[min(640px,92vw)] bg-white rounded-fenetre shadow-dessus overflow-hidden" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 border-b border-slate-200">
              <IconSearch size={18} className="text-slate-400" />
              <input ref={champ} value={q} placeholder="Où aller ? — un cours, un étudiant, une question…" data-reponses="non"
                onChange={e => { setQ(e.target.value); setI(0); }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setI(x => Math.min(x + 1, res.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setI(x => Math.max(x - 1, 0)); }
                  if (e.key === 'Enter') choisir(res[i]);
                }}
                className="flex-1 py-3.5 outline-none text-base bg-transparent" />
            </div>
            <ul className="m-0 p-1 list-none max-h-[55vh] overflow-auto">
              {!n && <li className="px-3 py-3 text-sm text-slate-500">Tapez un nom de cours, d’étudiant, une entrée (« présences », « agenda ») ou une question pour l’aide.</li>}
              {res.map((r, k) => (
                <li key={k}><button type="button" onMouseEnter={() => setI(k)} onClick={() => choisir(r)}
                  className={`w-full text-left px-3 py-2 rounded-champ flex items-center gap-3 ${k === i ? 'bg-slate-100' : ''}`}>
                  <span className="text-mention text-slate-500 w-24 shrink-0">{r.type}</span><span className="flex-1 min-w-0 truncate">{r.l}</span></button></li>))}
            </ul>
          </div>
        </div>)}
      {fiche && <FicheEtudiant id={fiche} onFermer={() => setFiche(null)} />}
    </>);
}

/* LES AMÉNAGEMENTS RAISONNABLES DE MES COURS (3.5.223, Charles, 8 novembre 2026 : « il manque les aménagements raisonnables dans
   l'espace prof, non ? »). Ils n'étaient que dans la fiche d'un étudiant, au survol d'une pastille des notes, et dans « À rendre »
   quand un avis est attendu. Ici, cours par cours : les étudiants qui ont un aménagement accordé et leurs MESURES — rien d'autre
   (secret professionnel, décret du 30 juin 2016, art. 5 : ni la pièce, ni la situation, ni la motivation). Une mesure liée à une
   unité ne paraît que sous cette unité. Lu du tableau déposé par Lucie (`tableauDe`). Imprimable pour préparer un examen. */
function MesAmenagements() {
  const [t, setT] = useState(null);
  useEffect(() => { appel('GET', '/tableau').then(setT).catch(() => setT({ pret: false })); }, []);
  if (!t) return <ChargementLucie />;
  const parId = new Map((t.etudiants || []).map(e => [e.id, e]));
  const blocs = [];
  for (const u of [...(t.ues || [])].sort((a, b) => rangBloc(a.ue_niv) - rangBloc(b.ue_niv) || a.ue_num - b.ue_num)) {
    for (const c of u.cours || []) {
      const lignes = (c.etudiants || []).map(x => parId.get(x.id)).filter(Boolean)
        .map(e => ({ e, mesures: (e.amenagements || []).filter(m => (!m.ue_num || Number(m.ue_num) === Number(u.ue_num)) && (!m.ues || m.ues.includes(Number(u.ue_num)))) }))
        .filter(x => x.mesures.length)
        .sort((a, b) => String(a.e.nom).localeCompare(String(b.e.nom), 'fr'));
      if (lignes.length) blocs.push({ u, c, lignes });
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="titre-ecran !mb-0 flex-1">Aménagements raisonnables{t.annee ? <span className="compte">{t.annee}</span> : null}</h1>
        {blocs.length > 0 && <button type="button" className="bouton controle inline-flex items-center gap-1.5 print:hidden" onClick={() => window.print()}><IconPrinter size={16} /> Imprimer</button>}
      </div>
      <p className="text-second text-slate-500">Les mesures accordées par la direction aux étudiants de vos cours. Elles s’appliquent à vos évaluations ; la situation de l’étudiant, elle, reste couverte par le secret professionnel et n’apparaît pas ici. Une question : le ou la référent·e des aménagements raisonnables.</p>
      {!blocs.length && <Encadre etat="neutre" titre="Aucun aménagement">Aucun étudiant de vos cours n’a d’aménagement raisonnable accordé cette année.</Encadre>}
      {blocs.map(({ u, c, lignes }) => (
        <section key={`${u.ue_num}-${c.code}`} className="carte overflow-hidden break-inside-avoid">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-iip-texte">
            {c.nom} <span className="font-normal text-slate-500">· UE {u.ue_num} — {u.ue_nom}{u.section ? ` · ${u.section}` : ''}</span>
          </div>
          <Tableau dense className="!border-0 !rounded-none">
            <TableauEntete><Th>Étudiant</Th><Th>Mesures accordées</Th></TableauEntete>
            <tbody>
              {lignes.map(({ e, mesures }) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap align-top">{String(e.nom || '').toUpperCase()} {e.prenom || ''}</Td>
                  <Td><ul className="m-0 pl-4 list-disc">{mesures.map((m, i) => <li key={i}>{m.libelle}{m.precisions ? ` — ${m.precisions}` : ''}</li>)}</ul></Td>
                </Tr>))}
            </tbody>
          </Tableau>
        </section>))}
    </div>);
}

/* LA STRUCTURE (3.5.138, Charles, 6 novembre 2026 : « c'est la structure que je veux changer » ; « mes notes, mes présences, mes
   étudiants » ; Aujourd'hui garde la frise de Lucie). Les entrées de travail en haut ; l'école et le compte en bas. */
const FACES = [
  { k: 'aujourdhui', l: 'Aujourd’hui', I: IconSun },
  { k: 'notes', l: 'Mes notes', I: IconPencil },
  { k: 'presences', l: 'Mes présences', I: IconUserCheck },
  { k: 'etudiants', l: 'Mes étudiants', I: IconUsers },
  { k: 'ue', l: 'Mes unités', I: IconFileText },
  { k: 'rendre', l: 'À rendre', I: IconChecklist },
  { k: 'examens', l: 'Mes examens', I: IconWriting },
  { k: 'prestations', l: 'Mes prestations', I: IconClockHour4, expert: true },
  { k: 'amenagements', l: 'Aménagements', I: IconAccessible },
  { k: 'tfe', l: 'Mes TFE', I: IconSchool },
  { k: 'stages', l: 'Mes stages', I: IconBriefcase },
  { k: 'agenda', l: 'Mon agenda', I: IconCalendar },
];
const FACES_BAS = [
  { k: 'fiche', l: 'Ma fiche', I: IconId },
  { k: 'candidature', l: 'Ma candidature', I: IconFileCheck },
  { k: 'aide', l: 'Aide', I: IconHelpCircle },
  { k: 'ecole', l: 'L’école', I: IconBuilding },
  { k: 'compte', l: 'Mon compte', I: IconUserCircle },
];
const VUES_LUCIE = new Set(['notes', 'presences', 'ue', 'rendre']);

export default function EspaceEnseignant() {
  const [token, setToken] = useState(lire());
  const [definir, setDefinir] = useState(false);
  const [moi, setMoi] = useState(null);
  const [face, setFace] = useState('aujourdhui');
  // UN SEUL ÉCRAN DE PRÉSENCES (3.5.144, Charles : « les présences se font à plusieurs endroits ») : celui de Mes cours. La frise et
  // la semaine y envoient une demande { action, s, n }.
  const [demande, setDemande] = useState(null);
  const ouvrirSeance = (action, s) => { setDemande({ action, s, n: Date.now() }); setFace(action === 'presences' ? 'presences' : 'notes'); };
  const [tic, setTic] = useState(0);
  const [questionAide, setQuestionAide] = useState('');
  const [lucie, setLucie] = useState(false);   // les écrans de Lucie prêts (compte et année lus par le relais)
  const [seance, setSeance] = useState(null);
  const [erreur, setErreur] = useState(null);
  const entrer = t => { poser(t); setToken(t); setDefinir(false); };
  // Le lien de première visite : il ouvre « choisir mon mot de passe ».
  useEffect(() => {
    const jeton = new URLSearchParams(window.location.search).get('jeton');
    if (!jeton) return;
    window.history.replaceState(null, '', window.location.pathname);
    appel('POST', '/session', { jeton }).then(r => { poser(r.token); setToken(r.token); setDefinir(true); }).catch(e => setErreur(e.message));
  }, []);
  // L'aperçu de la direction (3.5.084) : un lien d'une minute, depuis la fiche du professeur dans Lucie.
  useEffect(() => {
    const jeton = new URLSearchParams(window.location.search).get('apercu');
    if (!jeton) return;
    window.history.replaceState(null, '', window.location.pathname);
    appel('POST', '/apercu', { jeton }).then(r => { poser(r.token); setToken(r.token); setDefinir(false); }).catch(e => setErreur(e.message));
  }, []);
  useEffect(() => {
    if (!token || definir) return;
    appel('GET', '/moi').then(setMoi).catch(e => { if (e.session) setToken(null); else setErreur(e.message); });
  }, [token, definir]);
  useEffect(() => { if (moi) preparerLucie().finally(() => setLucie(true)); }, [moi]);
  // « Mes prestations » ne paraît que pour un expert (3.5.241) : Lucie le sait par ses attributions.
  const [expert, setExpert] = useState(false);
  useEffect(() => { if (lucie) fetch('/api/prestations-experts/moi').then(r => r.json()).then(j => setExpert(!!j?.expert)).catch(() => {}); }, [lucie]);
  // Le trousseau du navigateur ne reste pas accroché au champ d'identifiant de l'entrée (3.5.235).
  useEffect(() => { if (moi && document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }, [!!moi]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!token) return <>{erreur && <div className="bloc-etat px-3 py-2 text-sm m-4" data-etat="corriger">{erreur}</div>}<Entree onEntre={entrer} /></>;
  if (definir) {
    return (
      <div className="min-h-screen grid place-items-center px-4" style={{ background: 'var(--page-fond, #F5F7FA)' }}>
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-carte p-6 space-y-4">
          <div className="flex items-center gap-3"><Logo /><div className="font-semibold text-lg text-iip-texte">Choisissez votre mot de passe</div></div>
          <p className="m-0 text-sm text-slate-600">Il ne sert qu’à cet espace : votre mot de passe de Lucie ne change pas.</p>
          <ChoisirMotDePasse onFait={entrer} />
        </div>
      </div>);
  }
  if (!moi) return erreur ? <p className="p-6 text-slate-500">{erreur}</p> : <ChargementLucie pleine texte="Ouverture de votre espace…" />;
  const quitter = () => { poser(null); setToken(null); setMoi(null); };
  const aller = k => { setFace(k); setSeance(null); setTic(x => x + 1); };
  // Étroit hors d'Aujourd'hui, sauf si on l'a déplié (ou replié) soi-même ; changer d'entrée rend la règle.
  // TOUJOURS ÉTROIT (3.5.180, Charles : « je n'ai plus besoin de la largeur totale ; laisse juste l'icône et l'info-bulle »).
  const etroit = true;
  const chercher = <RechercheEspace faces={[...FACES, ...FACES_BAS]} onFace={aller}
    onCours={code => { setDemande({ action: 'notes', s: { cours_code: code }, n: Date.now() }); setFace('notes'); }}
    onAide={q => { setQuestionAide(q); aller('aide'); }} />;
  const outils = <OutilsEspace ecran={[...FACES, ...FACES_BAS].find(f => f.k === face)?.l || face} />;
  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: 'var(--page-fond, #F5F7FA)' }}>
      {/* Sur téléphone, le logo et le nom au-dessus de la bande d'onglets. */}
      <div className="md:hidden bg-white px-4 pt-3 pb-1 flex items-center gap-3"><Logo /><span className="ml-auto flex items-center gap-2"><BoutonContact />{chercher}{outils}</span></div>
      {/* UN RAIL ÉTROIT QUAND ON TRAVAILLE (3.5.166, Charles : « gagnons de la place ; réduis le menu à un rail étroit une fois
          qu'on a choisi notes, ou autre ») : sur Aujourd'hui, le menu entier ; ailleurs, les icônes seules (le nom au survol),
          et le chevron le déplie. Sur téléphone, la bande d'onglets ne change pas. */}
      <nav aria-label="Espace enseignant" className={`md:z-30 ${etroit ? 'md:w-14' : 'md:w-60'} md:shrink-0 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-3 ${etroit ? 'md:px-1.5 md:py-4' : 'md:p-4'} flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:sticky md:top-0 md:h-screen transition-[width] duration-200`}>
        <div className={`hidden md:flex items-center gap-2.5 pb-4 ${etroit ? 'justify-center' : 'px-2'}`}>
          {etroit ? <LogoLucie hauteur={26} sansTexte className="" /> : <div className="leading-tight"><Logo /><div className="text-second text-slate-500 pl-1">espace enseignant</div></div>}
        </div>
        {/* Contacter / Urgence EN HAUT (3.5.093, Charles : « trop bas, ça doit être en haut ») : sous le logo, avant les faces. */}
        <div className={`hidden md:flex items-center gap-2 pb-3 ${etroit ? 'flex-col' : 'px-2'}`}><BoutonContact compact={etroit} />{chercher}{outils}</div>
        {FACES.filter(f => !f.expert || expert).map(f => <BoutonFace key={f.k} f={f} etroit={etroit} actif={face === f.k && !seance} onClick={() => aller(f.k)} />)}
        <div className="hidden md:block flex-1" />
        {FACES_BAS.map(f => <BoutonFace key={f.k} f={f} etroit={etroit} actif={face === f.k && !seance} onClick={() => aller(f.k)} />)}
        <div className={`md:border-t border-slate-200 md:pt-3 ${etroit ? '' : 'md:px-2'} flex md:flex-col gap-1 shrink-0 ml-auto md:ml-0`}>
          {!etroit && <span className="hidden md:block font-semibold text-sm">{String(moi.nom || '').toUpperCase()} {moi.prenom}</span>}
          <button type="button" className={`text-second text-iip-blue inline-flex items-center gap-1 min-h-11 md:min-h-0 ${etroit ? 'md:justify-center' : ''}`} onClick={quitter}
            title="Se déconnecter"><IconLogout size={15} /><span className={etroit ? 'md:hidden' : ''}> Se déconnecter</span></button>
        </div>
      </nav>
      <main className="flex-1 min-w-0 p-4 md:p-8"><Garde cle={face}>
        {moi.apercu && <div className="bloc-etat px-3 py-2 text-sm mb-4" data-etat="surveiller"><b>Aperçu de la direction</b> — l’espace de {String(moi.nom || '').toUpperCase()} {moi.prenom} tel qu’il le voit.
          Lecture seule : rien ne s’enregistre. Ouvert par {moi.apercu.par}.</div>}
        {/* Les écrans de Lucie restent montés d'une entrée à l'autre (un cours ouvert le reste) ; masqués quand une autre face s'affiche. */}
        {lucie && (
          <div hidden={!VUES_LUCIE.has(face)}>
            <MesCoursEspace vue={face} tic={tic} allerA={k => setFace(k)} demande={demande} />
          </div>)}
        {!lucie && (VUES_LUCIE.has(face) || face === 'aujourdhui' || face === 'fiche') && <ChargementLucie texte="Ouverture de votre espace…" />}
        {/* AUJOURD'HUI = LE TABLEAU DE BORD DE LUCIE, ET LA FRISE DE LA JOURNÉE SOUS LE « BONJOUR » (3.5.144, Charles : « tableau de bord
            doit être fusionné avec aujourd'hui »). */}
        {lucie && face === 'aujourdhui' && <TableauDeBord allerA={k => aller(k)}
          apresEntete={<Suspense fallback={null}><MaJourneeLucie onAgir={ouvrirSeance} onSemaine={() => aller('agenda')} /></Suspense>} />}
        {!seance && (face === 'etudiants' ? <MesUE />
          : face === 'amenagements' ? <MesAmenagements />
          : face === 'agenda' ? <MonAgenda moi={moi} onPresences={s => ouvrirSeance('presences', s)} />
          // L'AIDE INTERACTIVE (3.5.161) : le mode d'emploi illustré de Lucie, celui des enseignants (le serveur filtre par rôle).
          : face === 'aide' ? (lucie ? <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8"><Suspense fallback={<ChargementLucie />}><AideLucie rechercheInitiale={questionAide} /></Suspense></div> : <ChargementLucie />)
          // MA FICHE (3.5.208, Charles : « la fiche prof avec des données, comme dans Lucie ») : la fiche du personnel de Lucie, par
          // le relais — ses données, ses attributions ; « Modifier » envoie une demande que la direction valide. Fermer ramène ici.
          : face === 'fiche' ? (lucie ? <MemoryRouter initialEntries={['/professeurs']}><SuivreLiens allerA={k => aller(k)} retour={() => aller('aujourdhui')} />
              <Suspense fallback={<ChargementLucie />}><MaFicheLucie /></Suspense></MemoryRouter> : <ChargementLucie />)
          // MES TFE (3.5.210) : ses TFE, leur suivi, les fiches de son rôle — l'écran de Lucie, par le relais.
          : face === 'tfe' ? (lucie ? <Suspense fallback={<ChargementLucie />}><MesTfeLucie /></Suspense> : <ChargementLucie />)
          // MES STAGES (3.5.213) : superviseur — ses stages, ses fiches, le lien du maître de stage.
          : face === 'stages' ? (lucie ? <Suspense fallback={<ChargementLucie />}><MesStagesLucie /></Suspense> : <ChargementLucie />)
          // MA CANDIDATURE (3.5.229) : les formulaires 013 et 014, dans la campagne ouverte par la direction.
          // MES EXAMENS (3.5.234) : la page de garde de chaque épreuve, préremplie par Lucie.
          : face === 'examens' ? (lucie ? <Suspense fallback={<ChargementLucie />}><MesExamensLucie /></Suspense> : <ChargementLucie />)
          : face === 'prestations' ? (lucie ? <Suspense fallback={<ChargementLucie />}><MesPrestationsLucie /></Suspense> : <ChargementLucie />)
          : face === 'candidature' ? (lucie ? <Suspense fallback={<ChargementLucie />}><MaCandidatureLucie /></Suspense> : <ChargementLucie />)
          : face === 'ecole' ? <LEcole />
          : face === 'compte' ? <MonCompte moi={moi} onToken={entrer} />
          : null)}
        </Garde>
        <p className="mt-8 text-mention text-slate-400">Ce que vous enregistrez ici part dans Lucie au relevé suivant (quelques secondes).{moi.depose_le ? ` Données de Lucie du ${court(moi.depose_le)} à ${String(moi.depose_le).slice(11, 16)} (UTC).` : ''}</p>
      </main>
    </div>
  );
}

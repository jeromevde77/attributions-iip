import { teinteCours, styleTuileCours } from '../lib/teinteCours.js';
import LogoLucie from '../components/LogoLucie.jsx';
import FenetreEspace from '../components/FenetreEspace.jsx';
import { FriseJournee } from '../components/FriseJournee.jsx';
import QRCode from 'qrcode';
import { lazy, Suspense } from 'react';
import { FournisseurRail } from '../components/ui.jsx';
import { MemoryRouter, useLocation } from 'react-router-dom';
import DatesDeliberation, { useDatesDeliberation, LigneDeliberation } from '../components/DatesDeliberation.jsx';
import { preparerLucie } from './relais.js';
import { couleurBloc, rangBloc } from '../lib/blocs.js';
import TrainUE from '../components/TrainUE.jsx';
const MesCoursLucie = lazy(() => import('../pages/MesCours.jsx'));
const AccueilLucie = lazy(() => import('../pages/Accueil.jsx'));
const MaJourneeLucie = lazy(() => import('../components/MaJournee.jsx'));
const AgendaEcoleLucie = lazy(() => import('../pages/AgendaEcole.jsx'));
const SemaineLucie = lazy(() => import('../components/MonHoraireSemaine.jsx'));
const VisitesStageLucie = lazy(() => import('../components/VisitesStage.jsx'));
const AgendaAbonnementLucie = lazy(() => import('../components/AgendaAbonnement.jsx'));
const MessagesEtudiantsLucie = lazy(() => import('../components/MessagesEtudiants.jsx'));
const AideLucie = lazy(() => import('../pages/Aide.jsx'));
const ListeSurMesureLucie = lazy(() => import('../components/MaListe.jsx').then(m => ({ default: m.ListeSurMesure })));
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconSun, IconUserCheck, IconCalendarWeek, IconUserCircle, IconLogout, IconChevronLeft, IconChevronRight, IconCheck, IconDevices, IconTrash, IconLock, IconMapPin, IconUsers, IconChevronDown, IconBook, IconFileText, IconHelpCircle, IconPhone, IconTable, IconDownload, IconQrcode, IconPencil, IconChecklist, IconCalendar, IconBuilding, IconCar, IconCalendarShare, IconMessages, IconLayoutDashboard, IconSend, IconSearch } from '@tabler/icons-react';

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

const STATUTS = [
  { k: 'present', l: 'P', titre: 'Présent', c: 'var(--c-reussi, #3E7D5E)' },
  { k: 'retard', l: 'P*', titre: 'En retard', c: 'var(--c-disponible, #2F6FB0)' },
  { k: 'absent', l: 'A', titre: 'Absent', c: 'var(--c-refuse, #9D4A38)' },
  { k: 'justifie', l: 'J', titre: 'Absence justifiée', c: 'var(--c-attente, #B45309)' },
];
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
  useEffect(() => { appel('GET', '/appareil').then(r => { if (r.reconnu) setIdent(r.identifiant); }).catch(() => {}); }, []);
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
            <label className="block text-second text-slate-600">Votre mot de passe
              <input className="controle w-full mt-1" type="password" autoComplete="current-password" value={mdp} onChange={e => setMdp(e.target.value)} required /></label>
            <button type="submit" className="bouton bouton-fort controle w-full">Entrer</button>
            <button type="button" className="text-second text-iip-blue underline" onClick={() => { setVue('lien'); setErreur(null); }}>Première visite, ou mot de passe oublié ?</button>
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

// ── LES FACES ──
function CarteSeance({ s, onPresences }) {
  const fait = s.presences && s.presences.attendus && s.presences.prises >= s.presences.attendus;
  return (
    <article className="bg-white border border-slate-200 rounded-carte p-4 flex flex-col gap-2"
      style={s.annule || s.visite ? undefined : { borderLeft: `4px solid ${teinteCours(s.cours_code)}`, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-second text-slate-500">{h(s.heure_debut)}{s.heure_fin ? ` – ${h(s.heure_fin)}` : ''}{s.local ? ` · ${s.local}` : ''}</span>
        {s.annule ? <span className="px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: 'var(--c-refuse, #9D4A38)' }}>annulée</span>
          : s.visite ? <span className="px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: 'var(--c-disponible, #2F6FB0)' }}>visite</span>
          : fait ? <span className="px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: 'var(--c-reussi, #3E7D5E)' }}>présences prises</span> : null}
      </div>
      <h3 className={`m-0 text-base font-semibold ${s.annule ? 'line-through text-slate-400' : ''}`}>{s.cours_nom || s.cours_code}</h3>
      <span className="text-second text-slate-500">{s.ue_num ? `UE ${s.ue_num}` : ''}{s.matiere && !s.visite ? ` · ${s.matiere}` : ''}{s.presences ? ` · ${s.presences.attendus} inscrit(s)` : ''}</span>
      {!s.visite && !s.annule && <div><button type="button" className="bouton bouton-fort controle inline-flex items-center gap-1.5" onClick={() => onPresences(s.id)}><IconUserCheck size={16} /> Prendre les présences</button></div>}
    </article>
  );
}

function MaJournee({ moi, onPresences, onSemaine }) {
  const [jour, setJour] = useState(moi.aujourdhui);
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => { setD(null); appel('GET', `/journee?date=${jour}`).then(setD).catch(e => setErreur(e.message)); }, [jour]);
  const [t, setT] = useState(null);
  useEffect(() => { appel('GET', '/tableau').then(setT).catch(() => setT({ pret: false })); }, []);
  const aFaire = t?.a_faire || [];
  const [lire, setLire] = useState(null);
  const [agJour, setAgJour] = useState([]);
  useEffect(() => { appel('GET', `/agenda?du=${jour}&au=${jour}`).then(setAgJour).catch(() => setAgJour([])); }, [jour]);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titre-ecran">Bonjour {moi.prenom}</h1>
          <p className="m-0 mt-1 text-slate-500 first-letter:uppercase">{jourFr(jour)}{d ? ` · ${d.seances.length ? `${d.seances.length} séance(s)` : 'aucune séance'}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="bouton controle" aria-label="Jour précédent" onClick={() => setJour(decaler(jour, -1))}><IconChevronLeft size={16} /></button>
          {jour !== moi.aujourdhui && <button type="button" className="bouton controle" onClick={() => setJour(moi.aujourdhui)}>Aujourd’hui</button>}
          <button type="button" className="bouton controle" aria-label="Jour suivant" onClick={() => setJour(decaler(jour, 1))}><IconChevronRight size={16} /></button>
          <button type="button" className="bouton controle" onClick={onSemaine}>Toute ma semaine</button>
        </div>
      </header>
      {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
      {agJour.length > 0 && <div className="flex flex-wrap gap-2">{agJour.map((a, i) => <AgendaPastille key={i} a={a} />)}</div>}
      {!d ? <p className="text-slate-500">Chargement…</p> : (
        <>
          {d.seances.length ? <div className="grid gap-4 md:grid-cols-2">{d.seances.map(s => <CarteSeance key={s.id} s={s} onPresences={onPresences} />)}</div>
            : <p className="text-slate-500">Aucune séance ce jour-là dans votre horaire.</p>}
          <section className="bg-white border border-slate-200 rounded-carte overflow-hidden">
            <div className="entete-carte px-4 py-3 font-semibold text-iip-texte">Ce qui m’attend</div>
            {!d.sans_presences.length && !aFaire.length && <p className="m-0 px-4 py-3 text-slate-500">Rien en retard. Bonne journée.</p>}
            {aFaire.map((x, i) => (
              <div key={`f${i}`} role={x.version_id ? 'button' : undefined} tabIndex={x.version_id ? 0 : undefined}
                onClick={x.version_id ? () => setLire(x.version_id) : undefined}
                className={`flex items-center gap-3 px-4 py-3 border-t border-slate-100 ${x.version_id ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                <span className="px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: x.retard ? 'var(--c-refuse, #9D4A38)' : x.type === 'due' ? 'var(--c-attente, #B45309)' : 'var(--c-disponible, #2F6FB0)' }}>
                  {{ tache: 'tâche', texte: 'à lire', message: 'message', rappel: 'rappel', due: 'DUE' }[x.type] || 'à faire'}</span>
                <span className="flex-1 min-w-0">{x.titre}{x.echeance ? ` — pour le ${court(x.echeance)}${x.retard ? ' (en retard)' : ''}` : ''}</span>
                {x.version_id && <IconChevronRight size={16} className="text-slate-400" />}
              </div>))}
            {d.sans_presences.map(s => (
              <button key={s.id} type="button" onClick={() => onPresences(s.id)} className="w-full text-left flex items-center gap-3 px-4 py-3 border-t border-slate-100 bg-white hover:bg-slate-50">
                <span className="px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: 'var(--c-attente, #B45309)' }}>présences</span>
                <span className="flex-1 min-w-0">{s.cours_nom || s.cours_code} — séance du {court(s.date)} à {h(s.heure_debut)}</span>
                <IconChevronRight size={16} className="text-slate-400" />
              </button>))}
          </section>
        </>)}
      {lire && <LireTexte vid={lire} onFermer={() => { setLire(null); appel('GET', '/tableau').then(setT).catch(() => {}); }} />}
    </div>
  );
}

/* MES UE ET MES ÉTUDIANTS (3.5.086, Charles : « les DUE des UE dans lesquelles ils sont, les listes d'étudiants, les fiches
   des étudiants » ; tranché : une fiche PÉDAGOGIQUE). Un seul cadre par unité ; la DUE et la fiche s'ouvrent par-dessus. */
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
      {erreur && <div className="bloc-etat px-3 py-2 text-sm mb-3" data-etat="corriger">{erreur}</div>}
      {!t ? !erreur && <p className="text-slate-500">Chargement…</p> : (
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
  if (!l) return <p className="text-slate-500">Chargement…</p>;
  return (
    <div className="space-y-4">
      
      <p className="m-0 text-slate-600">Les règles du jeu : circulaires, règlements, procédures. Ceux qui ne sont pas encore confirmés vous attendent.</p>
      {!l.length ? <p className="text-slate-500">Aucun texte pour l’instant.</p> : (
        <section className="bg-white border border-slate-200 rounded-carte overflow-hidden">
          {l.map(t => (
            <button key={t.version_id} type="button" onClick={() => setLire(t.version_id)}
              className="w-full text-left flex items-center gap-3 px-4 py-3 border-t border-slate-100 first:border-t-0 hover:bg-slate-50"
              style={{ borderLeft: `4px solid ${t.confirme_le ? 'var(--c-reussi, #3E7D5E)' : 'var(--c-refuse, #9D4A38)'}` }}>
              <span className="flex-1 min-w-0">{t.titre}</span>
              <span className="text-second text-slate-500 whitespace-nowrap">{t.confirme_le ? `confirmé le ${court(t.confirme_le)}` : t.ouvert_le ? 'ouvert, à confirmer' : 'à lire et confirmer'}</span>
              <IconChevronRight size={16} className="text-slate-400" />
            </button>))}
        </section>)}
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
      {erreur && <div className="bloc-etat px-3 py-2 text-sm mb-3" data-etat="corriger">{erreur}</div>}
      {!url ? !erreur && <p className="text-slate-500">Chargement…</p> : (
        <iframe title={d.nom_fichier} src={url} className="w-full border border-slate-200 rounded-champ" style={{ height: '62vh' }} />)}
    </Volet>);
}
function MesDocuments() {
  const [l, setL] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const charger = () => appel('GET', '/documents').then(setL).catch(() => setL([]));
  useEffect(() => { charger(); }, []);
  if (!l) return <p className="text-slate-500">Chargement…</p>;
  return (
    <div className="space-y-4">
      
      <p className="m-0 text-slate-600">Les pièces que l’école vous a envoyées par Lucie — votre contrat, votre fiche d’attributions… —, telles qu’elles sont parties.</p>
      {!l.length ? <p className="text-slate-500">Aucune pièce pour l’instant.</p> : (
        <section className="bg-white border border-slate-200 rounded-carte overflow-hidden">
          {l.map(d => d.sans_copie ? (
            <div key={d.envoi_id} className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 first:border-t-0"
              style={{ borderLeft: '4px solid var(--c-indisponible, #CBD5E1)' }}>
              <span className="flex-1 min-w-0">{d.sujet || d.nom_fichier}<span className="block text-second text-slate-500">envoyé le {court(d.envoye_le)}{d.reference ? ` · réf. ${d.reference}` : ''}</span></span>
              <span className="text-second text-slate-500 text-right">copie non conservée par Lucie<span className="block">à redemander au secrétariat</span></span>
            </div>) : (
            <button key={d.envoi_id} type="button" onClick={() => setOuvert(d)}
              className="w-full text-left flex items-center gap-3 px-4 py-3 border-t border-slate-100 first:border-t-0 hover:bg-slate-50"
              style={{ borderLeft: `4px solid ${d.accuse_le ? 'var(--c-reussi, #3E7D5E)' : 'var(--c-disponible, #2F6FB0)'}` }}>
              <span className="flex-1 min-w-0">{d.sujet || d.nom_fichier}<span className="block text-second text-slate-500">envoyé le {court(d.envoye_le)}{d.reference ? ` · réf. ${d.reference}` : ''}</span></span>
              <span className="text-second text-slate-500 whitespace-nowrap">{d.accuse_le ? `reçu le ${court(d.accuse_le)}` : 'à ouvrir'}</span>
              <IconChevronRight size={16} className="text-slate-400" />
            </button>))}
        </section>)}
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
      {erreur && <p className="text-red-700">{erreur}</p>}
      {!f ? !erreur && <p className="text-slate-500">Chargement…</p> : (
        <div className="space-y-5 text-sm">
          {f.amenagements.length > 0 && (
            <div className="bloc-etat px-3 py-2" data-etat="disponible"><div className="font-semibold mb-1">Aménagements raisonnables accordés</div>
              <ul className="m-0 pl-5">{f.amenagements.map((a, i) => <li key={i}>{a.libelle}{a.precisions ? ` — ${a.precisions}` : ''}{a.ue_num ? ` (UE ${a.ue_num})` : ''}</li>)}</ul></div>)}
          {f.cours.map(c => {
            const p = c.presences; const dus = p.present + p.absent + p.justifie;
            return (
              <section key={c.code} className="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                <div className="font-semibold">{c.nom || c.code} <span className="font-normal text-slate-500">· UE {c.ue_num}{c.groupe ? ` · ${c.groupe}` : ''}</span></div>
                <div className="text-slate-600 mt-1">Présences : {p.present} présent·e · {p.absent} absent·e · {p.justifie} justifiée(s){p.passees ? ` — sur ${p.passees} séance(s) passée(s)${dus < p.passees ? `, ${p.passees - dus} non encodée(s)` : ''}` : ''}</div>
                {c.notes.length > 0 ? (
                  <table className="mt-2 w-full max-w-md text-sm"><tbody>
                    {c.notes.map((n, i) => <tr key={i} className="border-t border-slate-100"><td className="py-1 pr-3">{n.evaluation}</td>
                      <td className="py-1 text-right tabular-nums">{n.mention || (n.points != null ? `${String(n.points).replace('.', ',')} / ${n.sur}` : '—')}</td></tr>)}
                  </tbody></table>) : <div className="text-slate-400 mt-1">Aucune note au carnet.</div>}
              </section>);
          })}
        </div>)}
    </Volet>);
}
function VoirDUE({ ue, onFermer }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => { appel('GET', `/due/${ue}`).then(setD).catch(e => setErreur(e.message)); }, [ue]);
  return (
    <Volet titre={d ? `DUE — UE ${d.ue_num} ${d.ue_nom || ''}` : 'DUE'} sous={d ? (d.statut === 'validee' ? 'version validée par la direction' : 'en préparation — elle se rédige dans Lucie, Mes cours') : ''} onFermer={onFermer}>
      {erreur && <p className="text-red-700">{erreur}</p>}
      {d ? <iframe title="DUE" srcDoc={d.html} sandbox="" className="w-full border-0" style={{ height: '75vh' }} /> : !erreur && <p className="text-slate-500">Chargement…</p>}
    </Volet>);
}
function VoirDP({ ue, onFermer }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => { appel('GET', `/dp/${ue}`).then(setD).catch(e => setErreur(e.message)); }, [ue]);
  return (
    <Volet titre={d ? `Dossier pédagogique — UE ${d.ue_num} ${d.ue_nom || ''}` : 'Dossier pédagogique'} sous="le texte officiel de l’unité" onFermer={onFermer}>
      {erreur && <p className="text-red-700">{erreur}</p>}
      {d ? <iframe title="Dossier pédagogique" srcDoc={d.html} sandbox="" className="w-full border-0" style={{ height: '75vh' }} /> : !erreur && <p className="text-slate-500">Chargement…</p>}
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
  const [due, setDue] = useState(null);
  const [dp, setDp] = useState(null);
  const [liste, setListe] = useState(null);
  useEffect(() => { appel('GET', '/tableau').then(setT).catch(() => setT({ pret: false })); }, []);
  const delibs = useDatesDeliberation(t?.annee || undefined);
  if (!t) return <p className="text-slate-500">Chargement…</p>;
  if (!t.pret || !t.ues?.length) return <p className="text-slate-500">Aucune unité attribuée cette année dans Lucie.</p>;
  return (
    <div className="space-y-5">
      <h1 className="titre-ecran">Mes étudiants{t.annee ? <span className="compte">{t.annee}</span> : null}</h1>
      {[...t.ues].sort((a, b) => rangBloc(a.ue_niv) - rangBloc(b.ue_niv) || a.ue_num - b.ue_num).map(u => (
        <section key={u.ue_num} className="bg-white border border-slate-200 border-l-[3px] rounded-carte overflow-hidden"
          style={{ borderLeftColor: couleurBloc(u.ue_niv) || undefined }}>
          <div className="bg-white px-4 py-3 flex flex-wrap items-center gap-3 border-b border-slate-100">
            <span className="flex-1 min-w-[16rem]">
              <span className="block font-semibold text-iip-texte">UE {u.ue_num} — {u.ue_nom}{u.section ? <span className="font-normal text-slate-500"> · {u.section}</span> : ''}</span>
              <LigneDeliberation seances={delibs} ue={u.ue_num} />
            </span>
            <TrainDeLUE u={u} />
            {u.a_dp && <button type="button" className="bouton controle" onClick={() => setDp(u.ue_num)}>Dossier pédagogique</button>}
            {/* LA DUE EST À L'ESSAI (3.5.133, Charles : « pour DUE tu mets un badge TEST »). */}
            {u.a_due && <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => setDue(u.ue_num)}
              title={u.due_statut === 'validee' ? 'Version validée par la direction' : 'En préparation dans Lucie'}>
              DUE <span className="px-1.5 py-px rounded-pastille text-[10px] font-bold tracking-wide text-white" style={{ background: 'var(--c-attente, #B45309)' }}>TEST</span></button>}
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
      {due && <VoirDUE ue={due} onFermer={() => setDue(null)} />}
      {dp && <VoirDP ue={dp} onFermer={() => setDp(null)} />}
      {liste && <Suspense fallback={null}><ListeSurMesureLucie cours={liste} annee={t.annee || undefined} onFermer={() => setListe(null)} /></Suspense>}
    </div>);
}

/* LE QR PROJETÉ (3.5.136) : signé par l'espace, il change toutes les 15 s ; l'étudiant scanne vers Lucie. Le compteur suit les
   présences que Lucie renvoie (toutes les dix secondes environ). */
function EcranQR({ seanceId, titre, onFermer }) {
  const [e, setE] = useState(null);
  const [erreur, setErreur] = useState(null);
  const toile = useRef(null);
  useEffect(() => {
    let minuterie = null, vivant = true;
    const tourner = () => appel('GET', `/seance/${seanceId}/qr`).then(j => { if (!vivant) return; setE(j); setErreur(null); minuterie = setTimeout(tourner, (j.rotation_s || 15) * 1000); })
      .catch(x => { if (vivant) setErreur(x.message); });
    tourner();
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [seanceId]);
  useEffect(() => { if (e?.url && toile.current) QRCode.toCanvas(toile.current, e.url, { width: 420, margin: 1 }).catch(() => {}); }, [e]);
  return (
    <Volet titre={titre} sous="Présence par QR — les étudiants scannent avec leur téléphone" onFermer={onFermer}>
      {erreur ? <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div> : !e ? <p className="text-slate-500">Chargement…</p> : (
        <div className="flex flex-col items-center gap-4 py-2">
          <canvas ref={toile} className="max-w-full" style={{ width: 'min(420px, 80vw)', height: 'auto' }} />
          <div className="text-5xl font-bold tabular-nums text-iip-texte">{e.compteur.presents} / {e.compteur.attendus}</div>
          <div className="text-sm text-slate-500">{e.fenetre.ouverte ? `Scan ouvert jusqu’à ${e.fenetre.ferme}` : e.fenetre.avant ? `Le scan ouvre à ${e.fenetre.ouvre}` : `Le scan est fermé depuis ${e.fenetre.ferme} : complétez à la main`}</div>
        </div>)}
    </Volet>);
}

function Presences({ seanceId, onRetour, motifs: MOTIFS = [], qr = false }) {
  const [qrOuvert, setQrOuvert] = useState(false);
  const [d, setD] = useState(null);
  const [etats, setEtats] = useState({});
  const [motifs, setMotifs] = useState({});
  const [msg, setMsg] = useState(null);
  const [erreur, setErreur] = useState(null);
  const charger = useCallback(() => appel('GET', `/seance/${seanceId}`).then(x => {
    setD(x);
    setEtats(Object.fromEntries(x.etudiants.map(e => [e.id, cleDe(e)])));
    setMotifs(Object.fromEntries(x.etudiants.filter(e => e.motif).map(e => [e.id, e.motif])));
  }).catch(e => setErreur(e.message)), [seanceId]);
  useEffect(() => { charger(); }, [charger]);
  if (erreur) return <div className="space-y-3"><button type="button" className="bouton controle" onClick={onRetour}><IconChevronLeft size={16} /> Retour</button><div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div></div>;
  if (!d) return <p className="text-slate-500">Chargement…</p>;
  const s = d.seance;
  const avenir = s.date > d.aujourdhui;
  const tous = k => setEtats(Object.fromEntries(d.etudiants.map(e => [e.id, k])));
  const enregistrer = async () => {
    setErreur(null); setMsg(null);
    const manque = d.etudiants.filter(e => etats[e.id] === 'justifie' && !motifs[e.id]);
    if (manque.length) return setErreur('Une absence justifiée demande son motif.');
    try {
      const r = await appel('POST', `/seance/${seanceId}/presences`, { presences: d.etudiants.filter(e => etats[e.id]).map(e => ({
        etudiant_id: e.id, statut: etats[e.id] === 'retard' ? 'present' : etats[e.id], retard: etats[e.id] === 'retard', motif: motifs[e.id] || null })) });
      setMsg(`${r.n} présence(s) enregistrée(s). Lucie les reprend dans les secondes qui viennent.`);
    } catch (e) { setErreur(e.message); }
  };
  const nPris = d.etudiants.filter(e => etats[e.id]).length;
  return (
    <div className="space-y-4">
      <button type="button" className="bouton controle inline-flex items-center gap-1" onClick={onRetour}><IconChevronLeft size={16} /> Ma journée</button>
      <div>
        <h1 className="titre-ecran">Présences</h1>
        <p className="m-0 mt-1 text-slate-500">{s.cours_nom || s.cours_code} · <span className="first-letter:uppercase">{jourFr(s.date)}</span>, {h(s.heure_debut)}{s.local ? ` · ${s.local}` : ''}</p>
      </div>
      {qr && s.date === d.aujourdhui && !s.annule && (
        <button type="button" className="bouton bouton-fort controle inline-flex items-center gap-1.5" onClick={() => setQrOuvert(true)}><IconQrcode size={17} /> Afficher le QR</button>)}
      {qrOuvert && <EcranQR seanceId={seanceId} titre={`${s.cours_nom || s.cours_code} · ${h(s.heure_debut)}`} onFermer={() => { setQrOuvert(false); charger(); }} />}
      {d.dernier_envoi?.erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">Lucie n’a pas repris le dernier envoi : {d.dernier_envoi.erreur}</div>}
      {avenir ? <div className="bloc-etat px-3 py-2 text-sm" data-etat="surveiller">Cette séance n’a pas encore eu lieu : ses présences se prennent le jour même ou après.</div> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="bouton controle" onClick={() => tous('present')}>Tous présents</button>
            <span className="text-second text-slate-500">Un toucher choisit l’état de chaque étudiant · {nPris} sur {d.etudiants.length}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-carte overflow-hidden">
            {d.etudiants.map(e => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-slate-100 first:border-t-0">
                <span className="flex-1 min-w-[10rem]">{String(e.nom || '').toUpperCase()} {e.prenom}{e.groupe ? <span className="text-second text-slate-400"> · {e.groupe}</span> : null}</span>
                <div className="flex gap-1">
                  {STATUTS.map(x => {
                    const actif = etats[e.id] === x.k;
                    return <button key={x.k} type="button" title={x.titre} aria-label={`${x.titre} — ${e.nom} ${e.prenom}`} aria-pressed={actif}
                      onClick={() => setEtats(t => ({ ...t, [e.id]: actif ? null : x.k }))}
                      className="w-12 h-11 rounded-champ font-semibold border"
                      style={actif ? { background: x.c, borderColor: x.c, color: '#fff' } : { background: '#fff', borderColor: '#D8DCE4', color: '#5B6B7C' }}>{x.l}</button>;
                  })}
                </div>
                {etats[e.id] === 'justifie' && (
                  <select className="controle" value={motifs[e.id] || ''} onChange={ev => setMotifs(m => ({ ...m, [e.id]: ev.target.value }))} aria-label="Motif de l’absence">
                    <option value="">— motif —</option>{MOTIFS.map(m => <option key={m.k} value={m.k}>{m.l}</option>)}
                  </select>)}
              </div>))}
          </div>
          {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
          {msg && <div className="bloc-etat px-3 py-2 text-sm" data-etat="reussi">{msg}</div>}
          <div className="flex items-center gap-3">
            <button type="button" className="bouton bouton-fort controle inline-flex items-center gap-1.5" onClick={enregistrer}><IconCheck size={16} /> Enregistrer</button>
            <span className="text-second text-slate-500">P présent · P* en retard · A absent · J absence justifiée</span>
          </div>
        </>)}
    </div>
  );
}

/* L'AGENDA DE L'ÉCOLE DANS L'HORAIRE (3.5.089) : un jour férié, fermé ou de congé est grisé d'un aplat (plus de hachures, 3.5.143 :
   « moche ») ; les moments s'y écrivent. */
const TEINTE_AGENDA = { ferie: '#9D4A38', ferme: '#9D4A38', conge: '#64748B', formation: '#6B46C1', moment: '#2F6FB0' };
const MOT_AGENDA = { ferie: 'Férié', ferme: 'École fermée', conge: 'Congé', formation: 'Formation', moment: '' };
function AgendaPastille({ a }) {
  const c = TEINTE_AGENDA[a.type] || '#2F6FB0';
  return (
    <div className="text-mention rounded-r-champ px-2 py-1" style={{ background: `color-mix(in srgb, ${c} 12%, #fff)`, borderLeft: `3px solid ${c}` }}>
      <b>{MOT_AGENDA[a.type] || a.genre || ''}</b>{(MOT_AGENDA[a.type] || a.genre) && a.libelle ? ' · ' : ''}{a.libelle}
      {a.heure_debut ? ` · ${String(a.heure_debut).slice(0, 5)}${a.heure_fin ? `–${String(a.heure_fin).slice(0, 5)}` : ''}` : ''}{a.lieu ? ` · ${a.lieu}` : ''}
    </div>);
}

/* CONTACTER / URGENCE (3.5.089) : le même bouton que Lucie — vert « Contacter » quand le secrétariat est là, orange « Urgence »
   sinon ; il nomme qui est là et la permanence, et chaque numéro s'appelle d'un toucher. */
function BoutonContact({ compact = false }) {
  const [c, setC] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const charger = () => appel('GET', '/contact').then(setC).catch(() => {});
  useEffect(() => { charger(); const t = setInterval(charger, 120000); return () => clearInterval(t); }, []);
  if (!c) return null;
  const ok = !!c.secretariat_ouvert;
  const Tel = ({ p }) => (p.telephone ? <a className="text-iip-blue underline whitespace-nowrap" href={`tel:${String(p.telephone).replace(/\s+/g, '')}`}>{p.telephone}</a> : <span className="text-slate-400">pas de numéro</span>);
  return (<>
    <button type="button" onClick={() => { charger(); setOuvert(true); }} title={ok ? 'Contacter' : 'Urgence'} className="shrink-0 min-h-11 md:min-h-9 px-3 rounded-champ inline-flex items-center gap-2 text-sm font-semibold text-white"
      style={{ background: ok ? 'var(--c-reussi, #3E7D5E)' : 'var(--c-attente, #B45309)' }}>
      <IconPhone size={16} />{!compact && ` ${ok ? 'Contacter' : 'Urgence'}`}
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

function MonHoraire({ moi, onPresences }) {
  const [ref, setRef] = useState(moi.aujourdhui);
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); appel('GET', `/semaine?date=${ref}`).then(setD).catch(() => setD({ jours: [], seances: [] })); }, [ref]);
  const [ag, setAg] = useState([]);
  useEffect(() => { if (d?.jours?.length) appel('GET', `/agenda?du=${d.jours[0]}&au=${d.jours[6]}`).then(setAg).catch(() => setAg([])); }, [d]);
  const duJour = j => ag.filter(a => a.du <= j && j <= a.au);
  const jours = (d?.jours || []).filter((j, i) => i < 5 || (d?.seances || []).some(s => s.date === j) || duJour(j).some(a => a.type !== 'conge' && a.type !== 'ferme'));
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="titre-ecran">Mon horaire{d?.jours?.[0] ? ` · semaine du ${court(d.jours[0])}` : ''}</h1>
        <div className="flex items-center gap-2">
          <button type="button" className="bouton controle" aria-label="Semaine précédente" onClick={() => setRef(decaler(ref, -7))}><IconChevronLeft size={16} /></button>
          {ref !== moi.aujourdhui && <button type="button" className="bouton controle" onClick={() => setRef(moi.aujourdhui)}>Cette semaine</button>}
          <button type="button" className="bouton controle" aria-label="Semaine suivante" onClick={() => setRef(decaler(ref, 7))}><IconChevronRight size={16} /></button>
        </div>
      </header>
      {/* UN SEUL CADRE (3.5.085, Charles : « trop de cadres… un seul ») : la semaine est un cadre, les jours des colonnes séparées
          par un filet, chaque cours sa couleur (fond pâle, bande plus foncée) — celle de l'horaire de Lucie (teinteCours). */}
      {!d ? <p className="text-slate-500">Chargement…</p> : (
        <div className="bg-white border border-slate-200 rounded-carte overflow-hidden grid divide-y md:divide-y-0 md:divide-x divide-slate-200"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(10rem, 1fr))` }}>
          {jours.map(j => (
            <div key={j} className="p-3 flex flex-col gap-2 md:min-h-[12rem]"
              style={duJour(j).some(a => ['ferie', 'ferme', 'conge'].includes(a.type)) ? { background: '#F7F8FA' } : undefined}>
              <span className={`font-semibold first-letter:uppercase ${j === d.aujourdhui ? 'text-iip-blue' : 'text-iip-texte'}`}>{jourFr(j)}{j === d.aujourdhui ? ' · aujourd’hui' : ''}</span>
              {duJour(j).map((a, i) => <AgendaPastille key={i} a={a} />)}
              {d.seances.filter(s => s.date === j).map(s => (
                <button key={s.id} type="button" disabled={s.visite || s.annule} onClick={() => onPresences(s)}
                  className="text-left rounded-r-champ px-2.5 py-2 flex flex-col gap-0.5"
                  style={s.annule ? { background: '#F4F5F7', borderLeft: '4px solid #C9CED6' } : s.visite ? { background: 'color-mix(in srgb, #F9B619 18%, #fff)', borderLeft: '4px solid #B8860B' } : styleTuileCours(s.cours_code, { filet: false })}>
                  <span className="text-mention text-slate-600">{h(s.heure_debut)}{s.heure_fin ? ` – ${h(s.heure_fin)}` : ''}</span>
                  <span className={`text-sm font-medium ${s.annule ? 'line-through text-slate-400' : 'text-iip-texte'}`}>{s.cours_nom || s.cours_code}</span>
                  {s.local && <span className="text-mention text-slate-600 inline-flex items-center gap-1">{s.visite && <IconMapPin size={12} />}{s.local}</span>}
                </button>))}
              {!d.seances.some(s => s.date === j) && <span className="text-second text-slate-400">—</span>}
            </div>))}
        </div>)}
    </div>
  );
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
        <div className="entete-carte px-4 py-3 font-semibold text-iip-texte inline-flex items-center gap-2 w-full"><IconLock size={16} /> Changer mon mot de passe</div>
        <div className="p-4"><ChoisirMotDePasse avecActuel onFait={onToken} /></div>
      </section>
    </div>
  );
}

/* LA GRILLE DES PRÉSENCES DE L'ANNÉE (3.5.135, Charles, 6 novembre 2026 : « les enseignants encoderont dans leur espace » ; lot 1).
   Par cours : ses étudiants en lignes, ses séances depuis la rentrée en colonnes. Un clic sur une case ouvre le choix (P, P*, A,
   J + motif, effacer) ; la case part par la porte de la séance, Lucie la juge au relevé (quelques secondes) et un refus se dit.
   Export Excel : la grille telle qu'elle est à l'écran. */
const LETTRE = { present: 'P', retard: 'P*', absent: 'A', justifie: 'J' };
function GrillePresences({ moi }) {
  const [d, setD] = useState(null);
  const [code, setCode] = useState(() => { try { return localStorage.getItem('ens.grille.cours') || ''; } catch { return ''; } });
  const [choix, setChoix] = useState(null);      // { s, e, x, y }
  const [motif, setMotif] = useState('');
  const [msg, setMsg] = useState(null);
  const charger = useCallback(c => appel('GET', `/grille${c ? `?cours=${encodeURIComponent(c)}` : ''}`).then(j => {
    setD(j);
    if (!c && j.cours?.length) setCode(j.cours[0].code);
  }).catch(e => setMsg(e.message)), []);
  useEffect(() => { charger(code); try { localStorage.setItem('ens.grille.cours', code); } catch { /* */ } }, [code, charger]);
  useEffect(() => { if (!d?.en_route) return undefined; const t = setTimeout(() => charger(code), 4000); return () => clearTimeout(t); }, [d, code, charger]);
  if (!d) return <p className="text-slate-500">{msg || 'Chargement…'}</p>;
  if (!d.cours?.length) return <p className="text-slate-500">Aucun cours avec des séances à l’horaire cette année.</p>;
  const seances = d.seances || [];
  const etudiants = d.etudiants || [];
  const cle = (s, e) => `${s}|${e}`;
  const pres = new Map((d.presences || []).map(p => [cle(p.seance_id, p.etudiant_id), p]));
  const inscrit = new Set((d.inscrits || []).map(i => cle(i.seance_id, i.etudiant_id)));
  const motifs = moi.motifs || [];
  const libMotif = k => motifs.find(m => m.k === k)?.l || k;
  async function poser(s, e, statut, mot) {
    if (moi.apercu) { setMsg('Aperçu : rien ne s’enregistre.'); setChoix(null); return; }
    const ligne = statut === 'retard' ? { etudiant_id: e, statut: 'present', retard: true }
      : { etudiant_id: e, statut: statut || null, retard: false, motif: statut === 'justifie' ? mot : null };
    try { await appel('POST', `/seance/${s}/presences`, { presences: [ligne] }); setMsg(null); } catch (x) { setMsg(x.message); }
    setChoix(null); setMotif(''); charger(code);
  }
  function exporter() {
    import('xlsx').then(XLSX => {
      const c = d.cours.find(x => x.code === code);
      const tete = ['Nom', 'Prénom', 'Groupe', ...seances.map(s => `${court(s.date)}${s.annule ? ' (annulée)' : ''}`), 'P', 'A', 'J'];
      const lignes = etudiants.map(e => {
        const cases = seances.map(s => { const p = pres.get(cle(s.id, e.id)); return !inscrit.has(cle(s.id, e.id)) ? '—' : LETTRE[cleDe(p)] || ''; });
        return [String(e.nom || '').toUpperCase(), e.prenom, e.groupe || '', ...cases,
          cases.filter(x => x === 'P' || x === 'P*').length, cases.filter(x => x === 'A').length, cases.filter(x => x === 'J').length];
      });
      const ws = XLSX.utils.aoa_to_sheet([[`${c?.nom || code} — présences ${seances[0] ? `du ${court(seances[0].date)} au ${court(seances[seances.length - 1].date)}` : ''}`], [], tete, ...lignes]);
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Présences');
      XLSX.writeFile(wb, `Presences_${code}.xlsx`);
    });
  }
  const passee = s => s.date <= d.aujourdhui;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="titre-ecran">Présences de l’année</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select className="controle" value={code} onChange={e => setCode(e.target.value)} aria-label="Cours">
            {d.cours.map(c => <option key={c.code} value={c.code}>{c.ue_num ? `UE ${c.ue_num} · ` : ''}{c.nom || c.code}</option>)}
          </select>
          <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={exporter} disabled={!etudiants.length}><IconDownload size={16} /> Excel</button>
        </div>
      </header>
      {msg && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{msg}</div>}
      {(d.refus || []).length > 0 && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">Lucie a refusé : {d.refus[0].erreur}</div>}
      {d.en_route > 0 && <p className="m-0 text-second text-slate-500">Envoi vers Lucie en cours…</p>}
      {!seances.length ? <p className="text-slate-500">Aucune séance de ce cours à l’horaire.</p> : (
        <div className="bg-white border border-slate-200 rounded-carte overflow-auto" style={{ maxHeight: '70vh' }}>
          <table className="text-sm border-collapse">
            <thead><tr>
              <th className="sticky left-0 top-0 z-20 bg-white px-3 py-2 text-left border-b border-slate-200 min-w-[13rem]">Étudiant</th>
              {seances.map(s => (
                <th key={s.id} className={`sticky top-0 z-10 bg-white px-1 py-2 border-b border-slate-200 text-center font-semibold whitespace-nowrap ${s.annule ? 'line-through text-slate-400' : ''}`}
                  title={`${court(s.date)} ${h(s.heure_debut)}–${h(s.heure_fin)}${s.local ? ` · ${s.local}` : ''}${s.annule ? ' · annulée' : ''}`}>
                  <span className="text-mention">{court(s.date)}</span></th>))}
              <th className="sticky top-0 z-10 bg-white px-2 py-2 border-b border-slate-200 text-center">P</th>
              <th className="sticky top-0 z-10 bg-white px-2 py-2 border-b border-slate-200 text-center">A</th>
              <th className="sticky top-0 z-10 bg-white px-2 py-2 border-b border-slate-200 text-center">J</th>
            </tr></thead>
            <tbody>{etudiants.map(e => {
              let nP = 0, nA = 0, nJ = 0;
              return (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1 whitespace-nowrap">{String(e.nom || '').toUpperCase()} {e.prenom}{e.groupe ? <span className="text-second text-slate-400"> · {e.groupe}</span> : null}</td>
                  {seances.map(s => {
                    if (!inscrit.has(cle(s.id, e.id))) return <td key={s.id} className="text-center text-slate-300">—</td>;
                    const p = pres.get(cle(s.id, e.id)); const k = cleDe(p); const st = STATUTS.find(x => x.k === k);
                    if (k === 'present' || k === 'retard') nP++; else if (k === 'absent') nA++; else if (k === 'justifie') nJ++;
                    const actif = passee(s) && !s.annule;
                    return (
                      <td key={s.id} className="p-0.5 text-center">
                        <button type="button" disabled={!actif} onClick={ev => setChoix({ s: s.id, e: e.id, nom: `${String(e.nom || '').toUpperCase()} ${e.prenom}`, date: s.date, x: ev.clientX, y: ev.clientY })}
                          className="w-9 h-7 rounded text-xs font-bold disabled:opacity-40"
                          style={st ? { background: st.c, color: '#fff' } : { border: '1px solid #E4E7EC', color: '#94a3b8' }}
                          title={p?.statut === 'justifie' && p.motif ? libMotif(p.motif) : st?.titre || (actif ? 'Non encodé' : s.annule ? 'Séance annulée' : 'Séance à venir')}>
                          {st ? st.l : actif ? '·' : ''}</button>
                      </td>);
                  })}
                  <td className="text-center tabular-nums">{nP}</td><td className="text-center tabular-nums">{nA}</td><td className="text-center tabular-nums">{nJ}</td>
                </tr>);
            })}</tbody>
          </table>
        </div>)}
      <p className="m-0 text-mention text-slate-400">P présent · P* en retard · A absent · J absence justifiée · — pas inscrit à cette séance. Les séances à venir ne s’encodent pas.</p>
      {choix && (
        <Volet titre={choix.nom} sous={`Séance du ${court(choix.date)}`} large="26rem" onFermer={() => { setChoix(null); setMotif(''); }}>
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {STATUTS.filter(x => x.k !== 'justifie').map(x => (
                <button key={x.k} type="button" className="bouton controle font-bold" style={{ background: x.c, color: '#fff', borderColor: x.c }} onClick={() => poser(choix.s, choix.e, x.k)}>{x.l} · {x.titre}</button>))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="controle" value={motif} onChange={e => setMotif(e.target.value)} aria-label="Motif de l’absence justifiée">
                <option value="">Absence justifiée — motif…</option>
                {motifs.map(m => <option key={m.k} value={m.k}>{m.l}</option>)}
              </select>
              <button type="button" className="bouton controle" disabled={!motif} onClick={() => poser(choix.s, choix.e, 'justifie', motif)}>J · Justifiée</button>
            </div>
            <button type="button" className="bouton controle" onClick={() => poser(choix.s, choix.e, null)}>Effacer</button>
          </div>
        </Volet>)}
    </div>);
}

/* MES COURS, TEL QUE DANS LUCIE (3.5.137) : l'écran de Lucie, ses requêtes passant par le relais. Ses entrées de rail remontent
   dans la navigation de l'espace (`surSections`). */
/* LE TABLEAU DE BORD DE LUCIE (3.5.140, Charles : « je veux aussi la page d'accueil, tableau de bord, avec les notifications, les
   messages, etc. ») : la page « Ce qui m'attend » de Lucie elle-même, par le relais. Ses liens vers d'autres écrans de Lucie se
   traduisent en entrées de l'espace (un texte → L'école, un cours → Mes notes) ; un écran qui n'existe pas ici le dit. */
function SuivreLiens({ allerA }) {
  const loc = useLocation();
  useEffect(() => {
    const p = loc.pathname;
    if (p === '/' || p === '/accueil') return;
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
          <Suspense fallback={<p className="text-slate-500 p-4">Chargement…</p>}><AccueilLucie apresEntete={apresEntete} /></Suspense>
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
        <Suspense fallback={<p className="text-slate-500 px-4">Chargement…</p>}><MesCoursLucie espace={{ vue, tic, retour: true, allerA, demande }} /></Suspense>
      </FournisseurRail>
    </div>);
}

/* CE QUI M'ATTEND (sous la frise d'Aujourd'hui) : tâches, textes à lire, messages, DUE, séances sans présences. */
function CeQuiMAttend({ moi, onPresences }) {
  const [d, setD] = useState(null);
  const [t, setT] = useState(null);
  const [lire, setLire] = useState(null);
  useEffect(() => { appel('GET', `/journee?date=${moi.aujourdhui}`).then(setD).catch(() => setD({ sans_presences: [] })); }, [moi.aujourdhui]);
  useEffect(() => { appel('GET', '/tableau').then(setT).catch(() => setT({ pret: false })); }, []);
  const aFaire = t?.a_faire || [];
  const sans = d?.sans_presences || [];
  return (
    <section className="bg-white border border-slate-200 rounded-carte overflow-hidden mx-0">
      <div className="entete-carte px-4 py-3 font-semibold text-iip-texte">Ce qui m’attend</div>
      {d && t && !sans.length && !aFaire.length && <p className="m-0 px-4 py-3 text-slate-500">Rien en retard. Bonne journée.</p>}
      {aFaire.map((x, i) => (
        <div key={`f${i}`} role={x.version_id ? 'button' : undefined} tabIndex={x.version_id ? 0 : undefined}
          onClick={x.version_id ? () => setLire(x.version_id) : undefined}
          className={`flex items-center gap-3 px-4 py-3 border-t border-slate-100 ${x.version_id ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
          <span className="px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: x.retard ? 'var(--c-refuse, #9D4A38)' : x.type === 'due' ? 'var(--c-attente, #B45309)' : 'var(--c-disponible, #2F6FB0)' }}>
            {{ tache: 'tâche', texte: 'à lire', message: 'message', rappel: 'rappel', due: 'DUE' }[x.type] || 'à faire'}</span>
          <span className="flex-1 min-w-0">{x.titre}{x.echeance ? ` — pour le ${court(x.echeance)}${x.retard ? ' (en retard)' : ''}` : ''}</span>
          {x.version_id && <IconChevronRight size={16} className="text-slate-400" />}
        </div>))}
      {sans.map(s => (
        <button key={s.id} type="button" onClick={() => onPresences(s.id)} className="w-full text-left flex items-center gap-3 px-4 py-3 border-t border-slate-100 bg-white hover:bg-slate-50">
          <span className="px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: 'var(--c-attente, #B45309)' }}>présences</span>
          <span className="flex-1 min-w-0">{s.cours_nom || s.cours_code} — séance du {court(s.date)} à {h(s.heure_debut)}</span>
          <IconChevronRight size={16} className="text-slate-400" />
        </button>))}
      {lire && <LireTexte vid={lire} onFermer={() => { setLire(null); appel('GET', '/tableau').then(setT).catch(() => {}); }} />}
    </section>);
}

/* MES DATES (3.5.142, Charles : « un Mon agenda avec les dates des examens, des délibérations, etc., avec l'agenda de l'école »).
   Dans l'ordre du temps, par mois : examens et délibérations de mes cours et unités, congés, fermetures, fériés, grands moments. */
const TYPES_DATE = {
  examen: ['Examen', 'var(--c-attente, #B45309)'], deliberation: ['Délibération', 'var(--c-principal, #19537E)'],
  conge: ['Congé', '#94A3B8'], ferme: ['École fermée', '#64748B'], ferie: ['Férié', '#94A3B8'],
  moment: ['École', 'var(--c-disponible, #2F6FB0)'], formation: ['Formation', 'var(--c-reussi, #3E7D5E)'],
};
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function MesDates({ moi }) {
  const [d, setD] = useState(null);
  const [passees, setPassees] = useState(false);
  const [filtre, setFiltre] = useState('tout');
  let annee = null; try { annee = localStorage.getItem('annee_active'); } catch { /* */ }
  useEffect(() => {
    fetch(`/api/mes-cours/dates${annee ? `?annee=${encodeURIComponent(annee)}` : ''}`).then(r => (r.ok ? r.json() : { items: [] }))
      .then(setD).catch(() => setD({ items: [] }));
  }, [annee]);
  if (!d) return <p className="text-slate-500">Chargement…</p>;
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
          {g.l.map((x, i) => { const [lib, c] = TYPES_DATE[x.type] || ['Date', '#94A3B8'];
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

/* MON AGENDA : la semaine (avec les journées de l'école), et deux portes — les visites de stage, l'horaire dans le téléphone. */
function MonAgenda({ moi, onPresences }) {
  const [ouvert, setOuvert] = useState(null);
  // L'ANNÉE DE L'ÉCOLE (3.5.140, Charles : « l'agenda de l'année, basé sur ce qu'on a créé ») : l'agenda de l'école de Lucie, en lecture.
  const [vue, setVue] = useState('dates');
  let annee = null; try { annee = localStorage.getItem('annee_active'); } catch { /* */ }
  return (
    <div className="space-y-4">
      <h1 className="titre-ecran">Mon agenda</h1>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="segments">{[['dates', 'Mes dates'], ['semaine', 'Ma semaine'], ['deliberations', 'Délibérations'], ['annee', 'L’année de l’école']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setVue(k)} className={vue === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{l}</button>))}</div>
        <span className="flex-1" />
        <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => setOuvert('visites')}><IconCar size={16} /> Mes visites de stage</button>
        <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={() => setOuvert('agenda')}><IconCalendarShare size={16} /> Dans l’agenda de mon téléphone</button>
      </div>
      {vue === 'dates' ? <MesDates moi={moi} />
        // MA SEMAINE À L'ÉCHELLE DES HEURES (3.5.150, Charles : « une structure par heures, comme dans l'horaire normal ») : la
        // semaine de Lucie, avec l'agenda de l'école au-dessus de chaque jour ; une séance ouvre ses présences.
        // LES DÉLIBÉRATIONS DE MES UNITÉS (3.5.160, Charles : « ceci doit aller dans agenda ») : le tableau quitte Mes unités.
        : vue === 'deliberations' ? <DatesDeliberation annee={annee || undefined} />
        : vue === 'semaine' ? <Suspense fallback={<p className="text-slate-500">Chargement…</p>}><SemaineLucie enLigne avecAgenda onSeance={onPresences} /></Suspense>
        : <Suspense fallback={<p className="text-slate-500">Chargement…</p>}>{annee ? <AgendaEcoleLucie annee={annee} simple /> : <p className="text-slate-500">Année inconnue.</p>}</Suspense>}
      <Suspense fallback={null}>
        {ouvert === 'visites' && <VisitesStageLucie onFermer={() => setOuvert(null)} />}
        {ouvert === 'agenda' && <AgendaAbonnementLucie onFermer={() => setOuvert(null)} />}
      </Suspense>
    </div>);
}

/* L'ÉCOLE : ce qu'elle envoie (textes à lire, documents), écrire aux étudiants, l'aide. Une face soulignée à la fois. */
function LEcole() {
  const [f, setF] = useState('textes');
  const [ecrire, setEcrire] = useState(false);
  return (
    <div className="space-y-4">
      <h1 className="titre-ecran">L’école</h1>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {[['textes', 'Textes à lire'], ['documents', 'Mes documents']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setF(k)} className={`onglet-page ${f === k ? 'onglet-page-actif' : ''}`}>{l}</button>))}
        <span className="flex-1" />
        <button type="button" className="bouton controle inline-flex items-center gap-1.5 mb-1" onClick={() => setEcrire(true)}><IconMessages size={16} /> Écrire à mes étudiants</button>
      </div>
      {f === 'documents' ? <MesDocuments /> : <TextesEcole />}
      <Suspense fallback={null}>{ecrire && <MessagesEtudiantsLucie titre="Écrire à mes étudiants" onFermer={() => setEcrire(false)} />}</Suspense>
    </div>);
}

/* LE RAIL DE L'ESPACE, COMME CELUI DE LUCIE (3.5.173, Charles : « je veux savoir où je suis, l'icône en surbrillance, et une
   info-bulle immédiate comme dans Lucie »). L'entrée ouverte : fond du menu actif, icône et texte au principal, filet à gauche.
   Rail étroit : le nom dans la bulle marine de Lucie, au survol, sans délai. */
function BoutonFace({ f, actif, onClick, etroit = false }) {
  return (
    <button type="button" onClick={onClick} aria-current={actif ? 'page' : undefined} aria-label={f.l}
      className={`group relative shrink-0 min-h-11 px-3 rounded-champ inline-flex items-center gap-2.5 text-sm text-left transition-colors ${etroit ? 'md:justify-center md:px-0' : ''} ${actif ? '' : 'hover:bg-slate-50'}`}
      style={actif ? { background: 'var(--menu-actif, #E3ECF5)', color: 'var(--c-principal, #19537E)', fontWeight: 600 } : { color: 'var(--menu-texte, #334155)' }}>
      {actif && <span aria-hidden className="hidden md:block absolute -left-2 top-2 bottom-2 w-[3px] rounded-full" style={{ background: 'var(--c-principal, #19537E)' }} />}
      <f.I size={etroit ? 20 : 18} stroke={actif ? 2.2 : 1.8} /> <span className={etroit ? 'md:hidden' : ''}>{f.l}</span>
      {etroit && <span role="tooltip" className="hidden md:group-hover:block md:group-focus-visible:block pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2.5 z-50 px-2 py-0.5 rounded-champ shadow-flottant text-white font-medium text-xs whitespace-nowrap"
        style={{ background: 'var(--c-principal, #16406A)' }}>{f.l}</span>}
    </button>);
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
        className="w-10 h-10 grid place-items-center rounded-champ border border-slate-200 bg-white text-iip-blue hover:bg-slate-50"><IconSearch size={18} /></button>
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

/* LA STRUCTURE (3.5.138, Charles, 6 novembre 2026 : « c'est la structure que je veux changer » ; « mes notes, mes présences, mes
   étudiants » ; Aujourd'hui garde la frise de Lucie). Les entrées de travail en haut ; l'école et le compte en bas. */
const FACES = [
  { k: 'aujourdhui', l: 'Aujourd’hui', I: IconSun },
  { k: 'notes', l: 'Mes notes', I: IconPencil },
  { k: 'presences', l: 'Mes présences', I: IconUserCheck },
  { k: 'etudiants', l: 'Mes étudiants', I: IconUsers },
  { k: 'ue', l: 'Mes unités', I: IconFileText },
  { k: 'rendre', l: 'À rendre', I: IconChecklist },
  { k: 'agenda', l: 'Mon agenda', I: IconCalendar },
];
const FACES_BAS = [
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
  const [deplie, setDeplie] = useState(null);   // null : la règle ; true / false : le choix de la personne
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
  if (!moi) return <p className="p-6 text-slate-500">{erreur || 'Chargement…'}</p>;
  const quitter = () => { poser(null); setToken(null); setMoi(null); };
  const aller = k => { setFace(k); setSeance(null); setTic(x => x + 1); setDeplie(null); };
  // Étroit hors d'Aujourd'hui, sauf si on l'a déplié (ou replié) soi-même ; changer d'entrée rend la règle.
  const etroit = deplie === null ? face !== 'aujourdhui' : !deplie;
  const chercher = <RechercheEspace faces={[...FACES, ...FACES_BAS]} onFace={aller}
    onCours={code => { setDemande({ action: 'notes', s: { cours_code: code }, n: Date.now() }); setFace('notes'); }}
    onAide={q => { setQuestionAide(q); aller('aide'); }} />;
  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: 'var(--page-fond, #F5F7FA)' }}>
      {/* Sur téléphone, le logo et le nom au-dessus de la bande d'onglets. */}
      <div className="md:hidden bg-white px-4 pt-3 pb-1 flex items-center gap-3"><Logo /><span className="ml-auto flex items-center gap-2"><BoutonContact />{chercher}</span></div>
      {/* UN RAIL ÉTROIT QUAND ON TRAVAILLE (3.5.166, Charles : « gagnons de la place ; réduis le menu à un rail étroit une fois
          qu'on a choisi notes, ou autre ») : sur Aujourd'hui, le menu entier ; ailleurs, les icônes seules (le nom au survol),
          et le chevron le déplie. Sur téléphone, la bande d'onglets ne change pas. */}
      <nav aria-label="Espace enseignant" className={`${etroit ? 'md:w-[4.5rem]' : 'md:w-60'} md:shrink-0 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-3 ${etroit ? 'md:px-2 md:py-4' : 'md:p-4'} flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:sticky md:top-0 md:h-screen transition-[width] duration-200`}>
        <div className={`hidden md:flex items-center gap-2.5 pb-4 ${etroit ? 'justify-center' : 'px-2'}`}>
          {etroit ? <LogoLucie hauteur={26} sansTexte className="" /> : <div className="leading-tight"><Logo /><div className="text-second text-slate-500 pl-1">espace enseignant</div></div>}
        </div>
        {/* Contacter / Urgence EN HAUT (3.5.093, Charles : « trop bas, ça doit être en haut ») : sous le logo, avant les faces. */}
        <div className={`hidden md:flex items-center gap-2 pb-3 ${etroit ? 'flex-col' : 'px-2'}`}><BoutonContact compact={etroit} />{chercher}</div>
        {FACES.map(f => <BoutonFace key={f.k} f={f} etroit={etroit} actif={face === f.k && !seance} onClick={() => aller(f.k)} />)}
        <div className="hidden md:block flex-1" />
        {FACES_BAS.map(f => <BoutonFace key={f.k} f={f} etroit={etroit} actif={face === f.k && !seance} onClick={() => aller(f.k)} />)}
        <button type="button" className="hidden md:inline-flex items-center justify-center min-h-9 rounded-champ text-slate-500 hover:bg-slate-50"
          onClick={() => setDeplie(d => !d)} title={etroit ? 'Déplier le menu' : 'Réduire le menu'} aria-label={etroit ? 'Déplier le menu' : 'Réduire le menu'}>
          {etroit ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
        </button>
        <div className={`md:border-t border-slate-200 md:pt-3 ${etroit ? '' : 'md:px-2'} flex md:flex-col gap-1 shrink-0 ml-auto md:ml-0`}>
          {!etroit && <span className="hidden md:block font-semibold text-sm">{String(moi.nom || '').toUpperCase()} {moi.prenom}</span>}
          <button type="button" className={`text-second text-iip-blue inline-flex items-center gap-1 min-h-11 md:min-h-0 ${etroit ? 'md:justify-center' : ''}`} onClick={quitter}
            title="Se déconnecter"><IconLogout size={15} /><span className={etroit ? 'md:hidden' : ''}> Se déconnecter</span></button>
        </div>
      </nav>
      <main className="flex-1 min-w-0 p-4 md:p-8">
        {moi.apercu && <div className="bloc-etat px-3 py-2 text-sm mb-4" data-etat="surveiller"><b>Aperçu de la direction</b> — l’espace de {String(moi.nom || '').toUpperCase()} {moi.prenom} tel qu’il le voit.
          Lecture seule : rien ne s’enregistre. Ouvert par {moi.apercu.par}.</div>}
        {/* Les écrans de Lucie restent montés d'une entrée à l'autre (un cours ouvert le reste) ; masqués quand une autre face s'affiche. */}
        {lucie && (
          <div hidden={!VUES_LUCIE.has(face)}>
            <MesCoursEspace vue={face} tic={tic} allerA={k => setFace(k)} demande={demande} />
          </div>)}
        {!lucie && (VUES_LUCIE.has(face) || face === 'aujourdhui') && <p className="text-slate-500">Ouverture…</p>}
        {/* AUJOURD'HUI = LE TABLEAU DE BORD DE LUCIE, ET LA FRISE DE LA JOURNÉE SOUS LE « BONJOUR » (3.5.144, Charles : « tableau de bord
            doit être fusionné avec aujourd'hui »). */}
        {lucie && face === 'aujourdhui' && <TableauDeBord allerA={k => aller(k)}
          apresEntete={<Suspense fallback={null}><MaJourneeLucie onAgir={ouvrirSeance} onSemaine={() => aller('agenda')} /></Suspense>} />}
        {!seance && (face === 'etudiants' ? <MesUE />
          : face === 'agenda' ? <MonAgenda moi={moi} onPresences={s => ouvrirSeance('presences', s)} />
          // L'AIDE INTERACTIVE (3.5.161) : le mode d'emploi illustré de Lucie, celui des enseignants (le serveur filtre par rôle).
          : face === 'aide' ? (lucie ? <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8"><Suspense fallback={<p className="text-slate-500">Chargement…</p>}><AideLucie rechercheInitiale={questionAide} /></Suspense></div> : <p className="text-slate-500">Ouverture…</p>)
          : face === 'ecole' ? <LEcole />
          : face === 'compte' ? <MonCompte moi={moi} onToken={entrer} />
          : null)}
        <p className="mt-8 text-mention text-slate-400">Ce que vous enregistrez ici part dans Lucie au relevé suivant (quelques secondes).{moi.depose_le ? ` Données de Lucie du ${court(moi.depose_le)} à ${String(moi.depose_le).slice(11, 16)} (UTC).` : ''}</p>
      </main>
    </div>
  );
}

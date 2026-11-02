import { teinteCours, styleTuileCours } from '../lib/teinteCours.js';
import LogoLucie from '../components/LogoLucie.jsx';
import { useCallback, useEffect, useState } from 'react';
import { IconSun, IconUserCheck, IconCalendarWeek, IconUserCircle, IconLogout, IconChevronLeft, IconChevronRight, IconCheck, IconDevices, IconTrash, IconLock, IconMapPin, IconUsers, IconChevronDown, IconBook, IconFileText, IconHelpCircle, IconPhone } from '@tabler/icons-react';

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
          <h1 className="m-0 text-2xl font-semibold text-iip-texte">Bonjour {moi.prenom}</h1>
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
function Volet({ titre, sous, onFermer, children }) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex justify-end" onClick={onFermer}>
      <div className="h-full w-full max-w-3xl bg-white flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 py-4 text-white" style={{ background: 'var(--c-principal-fonce, #16406A)' }}>
          <div className="flex-1 min-w-0"><div className="font-semibold">{titre}</div>{sous && <div className="text-second opacity-80">{sous}</div>}</div>
          <button type="button" aria-label="Fermer" className="min-h-9 px-2" onClick={onFermer}>✕</button>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>);
}
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
    <Volet titre={t?.titre || 'Texte'} sous={t ? `Version ${t.numero}${t.publiee_le ? ` du ${court(t.publiee_le)}` : ''}` : ''} onFermer={onFermer}>
      {erreur && <div className="bloc-etat px-3 py-2 text-sm mb-3" data-etat="corriger">{erreur}</div>}
      {!t ? !erreur && <p className="text-slate-500">Chargement…</p> : (
        <div className="space-y-4">
          <iframe title={t.titre} srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:15px/1.55 'Segoe UI',Arial,sans-serif;color:#1B2B4B;margin:0;padding:4px}</style>${t.html}`}
            sandbox="" className="w-full border-0" style={{ height: '60vh' }} />
          {t.source_url && <p className="m-0 text-second"><a className="text-iip-blue underline" href={t.source_url} target="_blank" rel="noreferrer">Le texte officiel, en ligne</a></p>}
          {t.confirme_le
            ? <div className="bloc-etat px-3 py-2 text-sm" data-etat="reussi">Vous avez confirmé avoir pris connaissance de ce texte le {court(t.confirme_le)}.</div>
            : <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
                <span className="flex-1 min-w-0 text-second text-slate-600">La direction vous demande d’en prendre connaissance.</span>
                <button type="button" className="bouton bouton-fort controle" disabled={envoi} onClick={confirmer}>Je confirme avoir pris connaissance</button>
              </div>}
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
      <h1 className="m-0 text-2xl font-semibold text-iip-texte">Les textes de l’école</h1>
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
    <Volet titre={d.sujet || d.nom_fichier} sous={`Envoyé le ${court(d.envoye_le)}${d.reference ? ` · réf. ${d.reference}` : ''}`} onFermer={onFermer}>
      {erreur && <div className="bloc-etat px-3 py-2 text-sm mb-3" data-etat="corriger">{erreur}</div>}
      {!url ? !erreur && <p className="text-slate-500">Chargement…</p> : (
        <div className="space-y-4">
          <iframe title={d.nom_fichier} src={url} className="w-full border border-slate-200 rounded-champ" style={{ height: '62vh' }} />
          <div className="flex flex-wrap items-center gap-3">
            <a className="bouton controle" href={url} download={d.nom_fichier} target="_blank" rel="noreferrer">Télécharger</a>
            <span className="flex-1" />
            {etat.accuse_le ? <span className="text-second" style={{ color: 'var(--c-reussi, #3E7D5E)' }}>Réception accusée le {court(etat.accuse_le)}</span>
              : <button type="button" className="bouton bouton-fort controle" onClick={accuser}>J’accuse réception de cette pièce</button>}
          </div>
        </div>)}
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
      <h1 className="m-0 text-2xl font-semibold text-iip-texte">Mes documents</h1>
      <p className="m-0 text-slate-600">Les pièces que l’école vous a envoyées par Lucie — votre contrat, votre fiche d’attributions… —, telles qu’elles sont parties.</p>
      {!l.length ? <p className="text-slate-500">Aucune pièce pour l’instant.</p> : (
        <section className="bg-white border border-slate-200 rounded-carte overflow-hidden">
          {l.map(d => (
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
function Aide() {
  const [g, setG] = useState(null);
  const [ouvert, setOuvert] = useState(0);
  useEffect(() => { appel('GET', '/guide').then(setG).catch(() => setG({ chapitres: [] })); }, []);
  if (!g) return <p className="text-slate-500">Chargement…</p>;
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="m-0 text-2xl font-semibold text-iip-texte">Aide</h1>
      <section className="bg-white border border-slate-200 rounded-carte p-4 space-y-2 text-sm">
        <div className="font-semibold">Cet espace en bref</div>
        <ul className="m-0 pl-5 space-y-1 text-slate-700">
          <li><b>Ma journée</b> : vos séances du jour, et ce qui vous attend (présences à prendre, textes à confirmer, DUE…).</li>
          <li><b>Les présences</b> : un toucher par étudiant — P, P* (retard), A, J (justifié, avec son motif). Elles arrivent dans Lucie en quelques secondes.</li>
          <li><b>Mon horaire</b> : la semaine, l’agenda de l’école (congés, fériés, journées fermées), une couleur par cours.</li>
          <li><b>Mes UE et étudiants</b> : la DUE de chaque unité, vos listes et la fiche de chaque étudiant.</li>
          <li><b>Textes de l’école</b> et <b>Mes documents</b> : ce que l’école vous demande de lire, ce qu’elle vous a envoyé ; on confirme, on accuse réception.</li>
          <li><b>Mon compte</b> : mot de passe et appareils reconnus (trois au plus).</li>
        </ul>
      </section>
      {(g.chapitres || []).length > 0 && <div className="text-second text-slate-500">Le mode d’emploi complet des enseignants{g.version ? ` (Lucie ${g.version})` : ''} :</div>}
      {(g.chapitres || []).map((c, i) => (
        <section key={i} className="bg-white border border-slate-200 rounded-carte overflow-hidden">
          <button type="button" className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50" onClick={() => setOuvert(o => (o === i ? null : i))}>
            {ouvert === i ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}<span className="flex-1 font-semibold text-iip-texte">{c.titre}</span>
          </button>
          {ouvert === i && (
            <div className="px-4 pb-4 space-y-4 text-sm">
              {c.resume && <p className="m-0 text-slate-600">{c.resume}</p>}
              {c.points.map((p, k) => (
                <div key={k} className="border-t border-slate-100 pt-3">
                  <div className="font-semibold">{p.titre}</div>
                  {p.ou && <div className="text-second text-slate-500 mt-0.5">Où : {p.ou}</div>}
                  {p.texte && <p className="m-0 mt-1 text-slate-700">{p.texte}</p>}
                  {p.savoir.length > 0 && <ul className="m-0 mt-1 pl-5 text-slate-600">{p.savoir.map((x, j) => <li key={j}>{x}</li>)}</ul>}
                </div>))}
            </div>)}
        </section>))}
    </div>);
}

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
function MesUE() {
  const [t, setT] = useState(null);
  const [ouvert, setOuvert] = useState({});
  const [fiche, setFiche] = useState(null);
  const [due, setDue] = useState(null);
  useEffect(() => { appel('GET', '/tableau').then(setT).catch(() => setT({ pret: false })); }, []);
  if (!t) return <p className="text-slate-500">Chargement…</p>;
  if (!t.pret || !t.ues?.length) return <p className="text-slate-500">Aucune unité attribuée cette année dans Lucie.</p>;
  return (
    <div className="space-y-5">
      <h1 className="m-0 text-2xl font-semibold text-iip-texte">Mes UE et mes étudiants{t.annee ? ` · ${t.annee}` : ''}</h1>
      {t.ues.map(u => (
        <section key={u.ue_num} className="bg-white border border-slate-200 rounded-carte overflow-hidden">
          <div className="entete-carte px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="flex-1 min-w-0 font-semibold text-iip-texte">UE {u.ue_num} — {u.ue_nom}{u.section ? <span className="font-normal text-slate-500"> · {u.section}</span> : ''}</span>
            {u.a_due && <button type="button" className="bouton controle" onClick={() => setDue(u.ue_num)}>DUE{u.due_statut === 'validee' ? '' : ' (en préparation)'}</button>}
          </div>
          {u.cours.map(c => {
            const k = `${u.ue_num}|${c.code}`;
            return (
              <div key={c.code} className="border-t border-slate-100">
                <button type="button" className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50" onClick={() => setOuvert(o => ({ ...o, [k]: !o[k] }))}>
                  {ouvert[k] ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                  <span className="flex-1 min-w-0">{c.nom || c.code}</span>
                  <span className="text-second text-slate-500">{c.etudiants.length} étudiant(s)</span>
                </button>
                {ouvert[k] && (
                  <ul className="m-0 pl-0 list-none pb-2">
                    {c.etudiants.map(e => (
                      <li key={e.id}><button type="button" className="w-full text-left px-11 py-1.5 text-sm hover:bg-slate-50 flex gap-3" onClick={() => setFiche(e.id)}>
                        <span className="flex-1">{String(e.nom || '').toUpperCase()} {e.prenom}</span>{e.groupe && <span className="text-second text-slate-500">{e.groupe}</span>}</button></li>))}
                  </ul>)}
              </div>);
          })}
        </section>))}
      {fiche && <FicheEtudiant id={fiche} onFermer={() => setFiche(null)} />}
      {due && <VoirDUE ue={due} onFermer={() => setDue(null)} />}
    </div>);
}

function Presences({ seanceId, onRetour, motifs: MOTIFS = [] }) {
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
        <h1 className="m-0 text-2xl font-semibold text-iip-texte">Présences</h1>
        <p className="m-0 mt-1 text-slate-500">{s.cours_nom || s.cours_code} · <span className="first-letter:uppercase">{jourFr(s.date)}</span>, {h(s.heure_debut)}{s.local ? ` · ${s.local}` : ''}</p>
      </div>
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

/* L'AGENDA DE L'ÉCOLE DANS L'HORAIRE (3.5.089) : un jour férié, fermé ou de congé est hachuré ; les moments s'y écrivent. */
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
function BoutonContact() {
  const [c, setC] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const charger = () => appel('GET', '/contact').then(setC).catch(() => {});
  useEffect(() => { charger(); const t = setInterval(charger, 120000); return () => clearInterval(t); }, []);
  if (!c) return null;
  const ok = !!c.secretariat_ouvert;
  const Tel = ({ p }) => (p.telephone ? <a className="text-iip-blue underline whitespace-nowrap" href={`tel:${String(p.telephone).replace(/\s+/g, '')}`}>{p.telephone}</a> : <span className="text-slate-400">pas de numéro</span>);
  return (<>
    <button type="button" onClick={() => { charger(); setOuvert(true); }} className="shrink-0 min-h-11 md:min-h-9 px-3 rounded-champ inline-flex items-center gap-2 text-sm font-semibold text-white"
      style={{ background: ok ? 'var(--c-reussi, #3E7D5E)' : 'var(--c-attente, #B45309)' }}>
      <IconPhone size={16} /> {ok ? 'Contacter' : 'Urgence'}
    </button>
    {ouvert && (
      <Volet titre={ok ? 'Contacter l’école' : 'Urgence'} sous={ok ? 'Le secrétariat est ouvert' : 'Le secrétariat est fermé : la permanence'} onFermer={() => setOuvert(false)}>
        <div className="space-y-5 text-sm">
          {c.presents.length > 0 && <section><div className="font-semibold mb-1">Là maintenant</div>
            <ul className="m-0 pl-0 list-none divide-y divide-slate-100">{c.presents.map((p, i) => <li key={i} className="py-2 flex flex-wrap gap-x-3"><span className="flex-1 min-w-0">{p.nom} <span className="text-slate-500">· {p.role}{p.jusqu ? ` · jusqu’à ${p.jusqu}` : ''}</span></span><Tel p={p} /></li>)}</ul></section>}
          {c.permanences.length > 0 && <section><div className="font-semibold mb-1">La permanence aujourd’hui</div>
            <ul className="m-0 pl-0 list-none divide-y divide-slate-100">{c.permanences.map((p, i) => <li key={i} className="py-2">
              <div className="flex flex-wrap gap-x-3"><span className="flex-1 min-w-0">{p.debut}–{p.fin} · {p.nom}{p.en_cours ? <b className="ml-1" style={{ color: 'var(--c-reussi, #3E7D5E)' }}>en cours</b> : ''}</span><Tel p={p} /></div>
              {p.secours.length > 0 && <div className="text-second text-slate-500 mt-0.5">En secours : {p.secours.map((x, k) => <span key={k}>{k ? ' · ' : ''}{x.nom} <Tel p={x} /></span>)}</div>}</li>)}</ul></section>}
          {!c.presents.length && !c.permanences.length && <p className="m-0 text-slate-500">Personne n’est signalé pour l’instant.</p>}
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
        <h1 className="m-0 text-2xl font-semibold text-iip-texte">Mon horaire{d?.jours?.[0] ? ` · semaine du ${court(d.jours[0])}` : ''}</h1>
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
              style={duJour(j).some(a => ['ferie', 'ferme', 'conge'].includes(a.type)) ? { background: 'repeating-linear-gradient(45deg, transparent 0 8px, rgba(27,43,75,.045) 8px 16px)' } : undefined}>
              <span className={`font-semibold first-letter:uppercase ${j === d.aujourdhui ? 'text-iip-blue' : 'text-iip-texte'}`}>{jourFr(j)}{j === d.aujourdhui ? ' · aujourd’hui' : ''}</span>
              {duJour(j).map((a, i) => <AgendaPastille key={i} a={a} />)}
              {d.seances.filter(s => s.date === j).map(s => (
                <button key={s.id} type="button" disabled={s.visite || s.annule} onClick={() => onPresences(s.id)}
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
    <div className="space-y-5 max-w-2xl">
      <h1 className="m-0 text-2xl font-semibold text-iip-texte">Mon compte</h1>
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

const FACES = [
  { k: 'journee', l: 'Ma journée', I: IconSun },
  { k: 'horaire', l: 'Mon horaire', I: IconCalendarWeek },
  { k: 'ues', l: 'Mes UE et étudiants', I: IconUsers },
  { k: 'textes', l: 'Textes de l’école', I: IconBook },
  { k: 'documents', l: 'Mes documents', I: IconFileText },
  { k: 'aide', l: 'Aide', I: IconHelpCircle },
  { k: 'compte', l: 'Mon compte', I: IconUserCircle },
];

export default function EspaceEnseignant() {
  const [token, setToken] = useState(lire());
  const [definir, setDefinir] = useState(false);
  const [moi, setMoi] = useState(null);
  const [face, setFace] = useState('journee');
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
  const aller = k => { setFace(k); setSeance(null); };
  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: 'var(--page-fond, #F5F7FA)' }}>
      <nav aria-label="Espace enseignant" className="md:w-60 md:shrink-0 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-3 md:p-4 flex md:flex-col gap-1 overflow-x-auto">
        <div className="hidden md:flex items-center gap-2.5 px-2 pb-4"><div className="leading-tight"><Logo /><div className="text-second text-slate-500 pl-1">espace enseignant</div></div></div>
        {FACES.map(f => (
          <button key={f.k} type="button" onClick={() => aller(f.k)} aria-current={face === f.k && !seance ? 'page' : undefined}
            className="shrink-0 min-h-11 px-3 rounded-champ inline-flex items-center gap-2.5 text-sm text-left"
            style={face === f.k ? { background: 'var(--menu-actif, #E3ECF5)', color: 'var(--c-principal-fonce, #16406A)', fontWeight: 600 } : {}}>
            <f.I size={18} /> {f.l}
          </button>))}
        <div className="hidden md:block flex-1" />
        <div className="shrink-0 md:px-2 md:pb-2"><BoutonContact /></div>
        <div className="md:border-t border-slate-200 md:pt-3 md:px-2 flex md:flex-col gap-1 shrink-0 ml-auto md:ml-0">
          <span className="hidden md:block font-semibold text-sm">{String(moi.nom || '').toUpperCase()} {moi.prenom}</span>
          <button type="button" className="text-second text-iip-blue inline-flex items-center gap-1 min-h-11 md:min-h-0" onClick={quitter}><IconLogout size={15} /> Se déconnecter</button>
        </div>
      </nav>
      <main className="flex-1 min-w-0 p-4 md:p-8">
        {moi.apercu && <div className="bloc-etat px-3 py-2 text-sm mb-4" data-etat="surveiller"><b>Aperçu de la direction</b> — l’espace de {String(moi.nom || '').toUpperCase()} {moi.prenom} tel qu’il le voit.
          Lecture seule : rien ne s’enregistre. Ouvert par {moi.apercu.par}.</div>}
        {seance ? <Presences seanceId={seance} motifs={moi.motifs} onRetour={() => setSeance(null)} />
          : face === 'journee' ? <MaJournee moi={moi} onPresences={setSeance} onSemaine={() => aller('horaire')} />
          : face === 'horaire' ? <MonHoraire moi={moi} onPresences={setSeance} />
          : face === 'ues' ? <MesUE />
          : face === 'textes' ? <TextesEcole />
          : face === 'documents' ? <MesDocuments />
          : face === 'aide' ? <Aide />
          : <MonCompte moi={moi} onToken={entrer} />}
        <p className="mt-8 text-mention text-slate-400">Ce que vous enregistrez ici part dans Lucie au relevé suivant (quelques secondes).{moi.depose_le ? ` Données de Lucie du ${court(moi.depose_le)} à ${String(moi.depose_le).slice(11, 16)} (UTC).` : ''}</p>
      </main>
    </div>
  );
}

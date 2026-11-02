import { useCallback, useEffect, useState } from 'react';
import { IconSun, IconUserCheck, IconCalendarWeek, IconUserCircle, IconLogout, IconChevronLeft, IconChevronRight, IconCheck, IconDevices, IconTrash, IconLock, IconMapPin } from '@tabler/icons-react';

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

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M9 5 V25 H27" fill="none" stroke="var(--c-principal, #19537E)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="5" r="2.6" fill="#F9B619" /><circle cx="9" cy="25" r="2.6" fill="#05B7E6" /><circle cx="27" cy="25" r="2.6" fill="#19537E" />
    </svg>
  );
}

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
        <div className="flex items-center gap-3"><Logo /><div><div className="font-semibold text-lg text-iip-texte">Lucie</div><div className="text-second text-slate-500">Espace enseignant · Institut Ilya Prigogine</div></div></div>
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
    <article className="bg-white border border-slate-200 rounded-carte p-4 flex flex-col gap-2">
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
      {!d ? <p className="text-slate-500">Chargement…</p> : (
        <>
          {d.seances.length ? <div className="grid gap-4 md:grid-cols-2">{d.seances.map(s => <CarteSeance key={s.id} s={s} onPresences={onPresences} />)}</div>
            : <p className="text-slate-500">Aucune séance ce jour-là dans votre horaire.</p>}
          <section className="bg-white border border-slate-200 rounded-carte overflow-hidden">
            <div className="entete-carte px-4 py-3 font-semibold text-iip-texte">Ce qui m’attend</div>
            {!d.sans_presences.length && !(moi.attente || []).length && <p className="m-0 px-4 py-3 text-slate-500">Rien en retard. Bonne journée.</p>}
            {d.sans_presences.map(s => (
              <button key={s.id} type="button" onClick={() => onPresences(s.id)} className="w-full text-left flex items-center gap-3 px-4 py-3 border-t border-slate-100 bg-white hover:bg-slate-50">
                <span className="px-2 py-0.5 rounded-pastille text-mention text-white" style={{ background: 'var(--c-attente, #B45309)' }}>présences</span>
                <span className="flex-1 min-w-0">{s.cours_nom || s.cours_code} — séance du {court(s.date)} à {h(s.heure_debut)}</span>
                <IconChevronRight size={16} className="text-slate-400" />
              </button>))}
          </section>
        </>)}
    </div>
  );
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

function MonHoraire({ moi, onPresences }) {
  const [ref, setRef] = useState(moi.aujourdhui);
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); appel('GET', `/semaine?date=${ref}`).then(setD).catch(() => setD({ jours: [], seances: [] })); }, [ref]);
  const jours = (d?.jours || []).filter((j, i) => i < 5 || (d?.seances || []).some(s => s.date === j));
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
      {!d ? <p className="text-slate-500">Chargement…</p> : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(10rem, 1fr))` }}>
          {jours.map(j => (
            <div key={j} className={`bg-white border rounded-carte p-3 flex flex-col gap-2 md:min-h-[12rem] ${j === d.aujourdhui ? 'border-iip-blue' : 'border-slate-200'}`}>
              <span className="font-semibold text-iip-texte first-letter:uppercase">{jourFr(j)}</span>
              {d.seances.filter(s => s.date === j).map(s => (
                <button key={s.id} type="button" disabled={s.visite || s.annule} onClick={() => onPresences(s.id)}
                  className="text-left rounded-champ px-2.5 py-2 flex flex-col gap-0.5"
                  style={{ background: 'var(--page-fond, #F5F7FA)', borderLeft: `4px solid ${s.visite ? '#F9B619' : 'var(--c-principal, #19537E)'}` }}>
                  <span className="text-mention text-slate-500">{h(s.heure_debut)}{s.heure_fin ? ` – ${h(s.heure_fin)}` : ''}</span>
                  <span className={`text-sm font-medium ${s.annule ? 'line-through text-slate-400' : ''}`}>{s.cours_nom || s.cours_code}</span>
                  {s.local && <span className="text-mention text-slate-500 inline-flex items-center gap-1">{s.visite && <IconMapPin size={12} />}{s.local}</span>}
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
        <div className="hidden md:flex items-center gap-2.5 px-2 pb-4"><Logo /><div className="leading-tight"><div className="font-semibold text-iip-texte">Lucie</div><div className="text-second text-slate-500">espace enseignant</div></div></div>
        {FACES.map(f => (
          <button key={f.k} type="button" onClick={() => aller(f.k)} aria-current={face === f.k && !seance ? 'page' : undefined}
            className="shrink-0 min-h-11 px-3 rounded-champ inline-flex items-center gap-2.5 text-sm text-left"
            style={face === f.k ? { background: 'var(--menu-actif, #E3ECF5)', color: 'var(--c-principal-fonce, #16406A)', fontWeight: 600 } : {}}>
            <f.I size={18} /> {f.l}
          </button>))}
        <div className="hidden md:block flex-1" />
        <div className="md:border-t border-slate-200 md:pt-3 md:px-2 flex md:flex-col gap-1 shrink-0 ml-auto md:ml-0">
          <span className="hidden md:block font-semibold text-sm">{String(moi.nom || '').toUpperCase()} {moi.prenom}</span>
          <button type="button" className="text-second text-iip-blue inline-flex items-center gap-1 min-h-11 md:min-h-0" onClick={quitter}><IconLogout size={15} /> Se déconnecter</button>
        </div>
      </nav>
      <main className="flex-1 min-w-0 p-4 md:p-8">
        {seance ? <Presences seanceId={seance} motifs={moi.motifs} onRetour={() => setSeance(null)} />
          : face === 'journee' ? <MaJournee moi={moi} onPresences={setSeance} onSemaine={() => aller('horaire')} />
          : face === 'horaire' ? <MonHoraire moi={moi} onPresences={setSeance} />
          : <MonCompte moi={moi} onToken={entrer} />}
        <p className="mt-8 text-mention text-slate-400">Ce que vous enregistrez ici part dans Lucie au relevé suivant (quelques secondes).{moi.depose_le ? ` Données de Lucie du ${court(moi.depose_le)} à ${String(moi.depose_le).slice(11, 16)} (UTC).` : ''}</p>
      </main>
    </div>
  );
}

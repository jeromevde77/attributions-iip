/**
 * CONFIGURATION → MISE EN SERVICE (3.5.001, Charles, 30 octobre 2026 : « un onglet pour activer ou désactiver des
 * fonctions » ; tranché : trois états, Éteinte · Essai · Allumée). En essai, une fonction ne vaut que pour les étudiants
 * d'essai (espace des étudiants) ou les comptes d'essai (présence par QR) nommés plus bas. Serveur : lib/fonctions.js.
 */
import { useEffect, useState } from 'react';
import { IconPower, IconSchool, IconUserCheck, IconX, IconSearch, IconCertificate } from '@tabler/icons-react';
import { demander } from '../lib/dialogue.jsx';
import { authHeaders } from '../lib/api.js';
import { nomDuCompte } from '../lib/nom.js';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr, PastilleEtat } from './ui.jsx';

const LIBELLES = { eteinte: 'Éteinte', essai: 'Essai', allumee: 'Allumée' };
const COULEUR = { eteinte: 'var(--c-indisponible, #94A3B8)', essai: 'var(--c-attente, #B45309)', allumee: 'var(--c-reussi, #3E7D5E)' };

/* LES ANNÉES PASSÉES DANS LES ESPACES (3.5.027, Charles : « pour tous les résultats antérieurs, toutes les attestations
   de réussite, de VA… dans les espaces des étudiants »). Compter d'abord, puis déposer ; aucun courriel. */
const NATURES_HIST = { hist_reussite: 'attestations de réussite', hist_va: 'attestations de VA', hist_recap: 'documents « toutes les années »' };
/* LA BASCULE DES PROFESSEURS (3.5.212) : la date à partir de laquelle le rôle « professeur » n'entre plus dans Lucie — il
   travaille dans son espace. La coordination et la direction qui enseignent gardent Lucie. Seulement quand l'espace enseignant
   est allumé pour tous. */
function BasculeProfesseurs() {
  const [b, setB] = useState(null);
  const [date, setDate] = useState('');
  const [erreur, setErreur] = useState(null);
  const charger = () => fetch('/api/fonctions/bascule', { headers: authHeaders() }).then(r => r.json()).then(j => { setB(j); setDate(j.bascule?.date || ''); }).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  const poser = async valeur => {
    setErreur(null);
    if (valeur && !(await demander(`À partir du ${valeur.split('-').reverse().join('/')}, les ${b.professeurs} comptes « professeur » n’entreront plus dans Lucie : ils seront renvoyés vers ${b.url}. Confirmer ?`))) return;
    try {
      const r = await fetch('/api/fonctions/bascule', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ date: valeur || null }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'refus du serveur');
      charger();
    } catch (e) { setErreur(e.message); }
  };
  if (!b) return null;
  const fixee = b.bascule?.date;
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte icone={IconSchool} titre="La bascule des professeurs vers leur espace" />
      <div className="px-4 py-3 space-y-3">
        <p className="text-second text-slate-500">À partir de la date choisie, un compte au rôle « professeur » n’entre plus dans Lucie : la connexion le renvoie vers son espace ({b.url}), et une session déjà ouverte s’arrête. La coordination et la direction qui enseignent gardent Lucie. {b.professeurs} compte(s) « professeur » actif(s), dont {b.relies} relié(s) à une fiche du personnel{b.professeurs > b.relies ? ' — les autres n’auront rien dans leur espace tant que le lien n’est pas fait' : ''}.</p>
        {b.espace !== 'allumee' && <p className="bloc-etat px-3 py-2 text-sm" data-etat="surveiller">L’espace enseignant n’est pas allumé pour tous (état : {b.espace}) : la date ne peut pas encore être fixée.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="controle" value={date} onChange={e => setDate(e.target.value)} disabled={b.espace !== 'allumee'} aria-label="Date de la bascule" />
          <button type="button" className="bouton bouton-fort" disabled={!date || date === fixee || b.espace !== 'allumee'} onClick={() => poser(date)}>Fixer la date</button>
          {fixee && <button type="button" className="bouton" onClick={() => poser(null)}>Retirer la date</button>}
          {fixee && <span className="text-second text-slate-500">Fixée au {fixee.split('-').reverse().join('/')}{b.bascule.pose_par ? ` par ${b.bascule.pose_par}` : ''}.</span>}
        </div>
        {erreur && <p className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</p>}
      </div>
    </section>);
}

function Personnes({ titre, icone: Ic, aide, l, nom, onRetirer, chercher, onAjouter, onVider = null }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => chercher(q.trim()).then(setRes).catch(() => setRes([])), 250);
    return () => clearTimeout(t);
  }, [q, chercher]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="intertitre flex items-center gap-2"><Ic size={15} /> {titre} ({l.length})</div>
        {/* VIDER LA LISTE (3.5.553, Charles : « vider la liste des étudiants et garder juste Sophie Huret ») : en un geste, après
            confirmation ; on rajoute ensuite qui l'on veut par la recherche. */}
        {onVider && l.length > 0 && <button type="button" className="bouton bouton-detruire !py-1 text-second"
          onClick={async () => { if (await demander({ titre: `Vider « ${titre} »`, message: `Les ${l.length} personnes sortent de la liste (rien d’autre ne change). Vous pourrez rajouter qui vous voulez par la recherche.`, confirmer: 'Vider la liste', annuler: 'Annuler' })) onVider(); }}>Vider la liste</button>}
      </div>
      <p className="text-second text-slate-500">{aide}</p>
      <div className="flex flex-wrap gap-1.5">
        {l.map(x => (
          <span key={x.id} className="inline-flex items-center gap-1 border border-slate-200 rounded-champ bg-white px-2 py-1 text-second">
            {nom(x)}
            <button type="button" className="text-slate-400 hover:text-red-700" title="Retirer" onClick={() => onRetirer(x.id)}><IconX size={13} /></button>
          </span>))}
        {!l.length && <span className="text-second text-slate-400">Personne pour l’instant.</span>}
      </div>
      <div className="relative max-w-sm">
        <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="controle controle-icone w-full" placeholder="Chercher un nom pour l’ajouter…" value={q} onChange={e => setQ(e.target.value)} />
        {res.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-champ shadow-flottant max-h-64 overflow-auto">
            {res.filter(x => !l.some(y => y.id === x.id)).map(x => (
              <li key={x.id}><button type="button" className="w-full text-left px-3 py-1.5 text-second hover:bg-slate-50"
                onClick={() => { onAjouter(x.id); setQ(''); setRes([]); }}>{nom(x)}</button></li>))}
          </ul>)}
      </div>
    </div>
  );
}

export default function MiseEnService() {
  const [r, setR] = useState(null);
  const [erreur, setErreur] = useState(null);
  const charger = () => fetch('/api/fonctions', { headers: authHeaders() })
    .then(x => (x.ok ? x.json() : x.json().then(j => Promise.reject(new Error(j.error || 'Refusé.'))))).then(setR).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  const regler = async corps => {
    const x = await fetch('/api/fonctions', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(corps) });
    const j = await x.json().catch(() => ({}));
    if (!x.ok) { setErreur(j.error || 'Refusé.'); return; }
    setErreur(null); setR(j);
  };
  if (erreur && !r) return <p className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</p>;
  if (!r) return null;
  const nomEtudiant = e => `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
  const groupe = (famille, titre) => (
    <section className="carte overflow-hidden">
      <EnteteCarte titre={titre} />
      <ul className="divide-y divide-slate-100">
        {r.catalogue.filter(c => c.famille === famille).map(c => {
          const etat = r.etats[c.cle];
          return (
            <li key={c.cle} className="flex flex-wrap items-start gap-3 px-4 py-3" style={{ boxShadow: `inset 4px 0 0 ${COULEUR[etat]}` }}>
              <div className="flex-1 min-w-[14rem]">
                <div className="font-semibold text-iip-texte">{c.titre}</div>
                <div className="text-second text-slate-600">{c.quoi}</div>
              </div>
              <div className="segments shrink-0">
                {Object.entries(LIBELLES).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => regler({ etats: { [c.cle]: k } })}
                    className={`px-3 py-1 text-second ${etat === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>))}
              </div>
            </li>);
        })}
      </ul>
    </section>);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 flex items-start gap-2"><IconPower size={16} className="mt-0.5 shrink-0" />
        <span>Chaque fonction s’allume quand vous le décidez. <b>Éteinte</b> : elle n’existe pour personne. <b>Essai</b> : seulement
        pour les personnes d’essai nommées plus bas — les autres ne voient rien et ne reçoivent aucun courriel. <b>Allumée</b> : pour tous.
        Un étudiant n’entre dans son espace que si au moins une fonction est ouverte pour lui.</span></p>
      {erreur && <p className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</p>}
      {groupe('espace', 'L’espace des étudiants')}
      {groupe('personnel', 'Le personnel')}
      <BasculeProfesseurs />
      <section className="carte px-4 py-3 space-y-5">
        <Personnes titre="Étudiants d’essai" icone={IconSchool} l={r.etudiants} nom={nomEtudiant}
          aide="Ils voient les fonctions en essai de l’espace des étudiants. Un dossier fictif, ou des volontaires."
          chercher={q => fetch(`/api/etudiants?q=${encodeURIComponent(q)}`, { headers: authHeaders() }).then(x => (x.ok ? x.json() : [])).then(l => (Array.isArray(l) ? l : []).slice(0, 8))}
          onAjouter={id => regler({ etudiants_essai: [...r.etudiants_essai, id] })}
          onRetirer={id => regler({ etudiants_essai: r.etudiants_essai.filter(x => x !== id) })}
          onVider={() => regler({ etudiants_essai: [] })} />
        <Personnes titre="Comptes d’essai" icone={IconUserCheck} l={r.comptes} nom={c => nomDuCompte(c.nom_complet, c.email)}
          aide="Ils voient les fonctions en essai du personnel (la présence par QR et le ticket de sortie)."
          chercher={q => fetch('/api/users', { headers: authHeaders() }).then(x => (x.ok ? x.json() : [])).then(l => (Array.isArray(l) ? l : l.users || [])
            .filter(u => `${u.nom_complet || ''} ${u.email || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8))}
          onAjouter={id => regler({ comptes_essai: [...r.comptes_essai, id] })}
          onRetirer={id => regler({ comptes_essai: r.comptes_essai.filter(x => x !== id) })} />
      </section>
      <InvitationLot ajouterEssai={ids => regler({ etudiants_essai: [...new Set([...r.etudiants_essai, ...ids])] })} />
      <QuiConnecte />
    </div>
  );
}

/* INVITER TOUTE UNE SECTION À SON ESPACE (3.5.536) : simulation d'abord (qui sera invité, qui est écarté et pourquoi, qui l'est déjà),
   puis l'envoi. Un étudiant n'est invité que s'il a une adresse d'institut et au moins une fonction de l'espace ouverte pour lui. */
function InvitationLot({ ajouterEssai }) {
  const nomEtudiant = e => `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [deja, setDeja] = useState(false);
  // PAR UNE UE (3.5.537, Charles : « sélectionner les étudiants de l'UE 250 pour un test » ; « qu'ils reçoivent un mail de ma part »).
  const [ue, setUe] = useState('');
  // LES ÉTUDIANTS D'UN PROFESSEUR (3.5.589, Charles : « QUE ceux dont Wael est prof ») : ses groupes, bornés à l'UE si elle est donnée.
  const [prof, setProf] = useState('');
  const [profs, setProfs] = useState([]);
  const [message, setMessage] = useState('');
  // UN ÉTUDIANT PAR SON NOM (3.5.553, Charles : « je dois pouvoir inviter un étudiant par nom, avec le mail d'invitation »).
  const [un, setUn] = useState(null);          // { id, nom }
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return undefined; }
    const t = setTimeout(() => fetch(`/api/etudiants?q=${encodeURIComponent(q.trim())}`, { headers: authHeaders() }).then(x => (x.ok ? x.json() : []))
      .then(l => setRes((Array.isArray(l) ? l : []).slice(0, 8))).catch(() => setRes([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const [msgEssai, setMsgEssai] = useState(null);
  const [sim, setSim] = useState(null);
  const [fait, setFait] = useState(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => { fetch('/api/ref/sections', { headers: authHeaders() }).then(x => x.json()).then(l => Array.isArray(l) && setSections(l)).catch(() => {}); }, []);
  useEffect(() => { fetch('/api/ref/professeurs', { headers: authHeaders() }).then(x => x.json()).then(l => Array.isArray(l) && setProfs(l.slice().sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')))).catch(() => {}); }, []);
  const cible = un ? { ids: [un.id] } : prof ? { prof: Number(prof), ue: ue.trim() ? Number(ue) : null } : ue.trim() ? { ue: Number(ue) } : { section };
  const appel = simulation => fetch('/api/portail-suivi/inviter', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...cible, simulation, deja, message }) }).then(x => x.json());
  const essai = async () => {
    setMsgEssai(null);
    const j = await fetch(`/api/portail-suivi/ue/${Number(ue)}/inscrits`, { headers: authHeaders() }).then(x => x.json()).catch(() => ({}));
    if (!j.ids?.length) { setMsgEssai(`Aucun inscrit à l’UE ${ue} cette année.`); return; }
    if (!(await demander({ titre: 'Étudiants d’essai', confirmer: `Ajouter ${j.ids.length} étudiant(s)`, annuler: 'Annuler',
      message: `Les ${j.ids.length} inscrits de l’UE ${ue} verront les fonctions « à l’essai » de leur espace.` }))) return;
    await ajouterEssai(j.ids); setMsgEssai(`${j.ids.length} étudiant(s) de l’UE ${ue} ajoutés aux étudiants d’essai.`); setSim(null);
  };
  const simuler = async () => { setFait(null); setEnCours(true); try { setSim(await appel(true)); } finally { setEnCours(false); } };
  const envoyer = async () => {
    if (!(await demander({ titre: 'Inviter à l’espace étudiant', confirmer: `Inviter ${sim.a_inviter.length} étudiant(s)`, annuler: 'Annuler',
      message: `Un courriel part à l’adresse d’institut de chacun : l’adresse de l’espace et la marche à suivre.` }))) return;
    setEnCours(true); try { setFait(await appel(false)); setSim(null); } finally { setEnCours(false); }
  };
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte titre="Inviter les étudiants à leur espace" sous="Un courriel à l’adresse d’institut : l’adresse de l’espace et la marche à suivre. Chaque invitation se lit dans la fiche (Suivi)." />
      <div className="px-4 py-3 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            {un ? <span className="inline-flex items-center gap-1 border border-slate-300 rounded-champ bg-white px-2 py-1.5">{un.nom}
              <button type="button" className="text-slate-400 hover:text-red-700" title="Retirer" onClick={() => { setUn(null); setSim(null); setFait(null); }}><IconX size={13} /></button></span>
              : <><IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className="controle controle-icone w-60" placeholder="un étudiant, par son nom…" value={q} onChange={e => setQ(e.target.value)} /></>}
            {!un && res.length > 0 && (
              <ul className="absolute z-10 mt-1 w-72 bg-white border border-slate-200 rounded-champ shadow-flottant max-h-64 overflow-auto">
                {res.map(x => (
                  <li key={x.id}><button type="button" className="w-full text-left px-3 py-1.5 text-second hover:bg-slate-50"
                    onClick={() => { setUn({ id: x.id, nom: nomEtudiant(x) }); setQ(''); setRes([]); setSection(''); setUe(''); setSim(null); setFait(null); }}>{nomEtudiant(x)}</button></li>))}
              </ul>)}
          </div>
          <span className="text-slate-500">ou</span>
          <select className="controle" value={section} onChange={e => { setSection(e.target.value); setUe(''); setProf(''); setUn(null); setSim(null); setFait(null); }}>
            <option value="">— une section —</option>{sections.map(x => <option key={x.code} value={x.code}>{x.libelle || x.code}</option>)}
          </select>
          <span className="text-slate-500">ou l’UE</span>
          <input className="controle w-20" inputMode="numeric" placeholder="n°" value={ue} onChange={e => { setUe(e.target.value.replace(/\D/g, '')); setSection(''); setUn(null); setSim(null); setFait(null); }} />
          <span className="text-slate-500">{ue ? 'dont le professeur est' : 'ou le professeur'}</span>
          <select className="controle max-w-[14rem]" value={prof} onChange={e => { setProf(e.target.value); setSection(''); setUn(null); setSim(null); setFait(null); }} aria-label="Professeur">
            <option value="">— tous —</option>{profs.map(p => <option key={p.id} value={p.id}>{String(p.nom || '').toUpperCase()} {p.prenom || ''}</option>)}
          </select>
          {ue && !prof && <button type="button" className="bouton" onClick={essai}>Ajouter ses inscrits aux étudiants d’essai</button>}
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={deja} onChange={e => { setDeja(e.target.checked); setSim(null); }} /> réinviter aussi ceux déjà invités</label>
          <button type="button" className="bouton" disabled={(!section && !ue && !un && !prof) || enCours} onClick={simuler}>Simuler</button>
          {sim?.a_inviter?.length > 0 && <button type="button" className="bouton bouton-fort" disabled={enCours} onClick={envoyer}>Inviter {sim.a_inviter.length} étudiant(s)</button>}
        </div>
        {msgEssai && <div className="text-slate-600">{msgEssai}</div>}
        <label className="block">
          <span className="text-second text-slate-600">Votre mot, en tête du courriel (facultatif) — il sera signé de votre nom :</span>
          <textarea className="controle w-full !h-auto mt-1" rows={4} value={message} data-reponses="invitation_espace"
            placeholder="Chers étudiants, nous ouvrons votre espace étudiant…" onChange={e => setMessage(e.target.value)} />
        </label>
        {sim && <div className="space-y-1">
          <div><b>{sim.a_inviter.length}</b> à inviter{sim.deja_invites?.length ? ` · ${sim.deja_invites.length} déjà invité(s), laissés de côté` : ''}{sim.ecartes?.length ? ` · ${sim.ecartes.length} écarté(s)` : ''}.</div>
          {sim.ecartes?.length > 0 && <details><summary className="cursor-pointer text-slate-600">Les écartés et pourquoi</summary>
            <ul className="mt-1 text-second text-slate-600">{sim.ecartes.map(e => <li key={e.id}>{e.nom} — {e.raison}</li>)}</ul></details>}
        </div>}
        {fait && <div className="bloc-etat px-3 py-2" data-etat={fait.echecs?.length ? 'surveiller' : 'reussi'}>
          {fait.invites?.length || 0} invitation(s) envoyée(s){fait.echecs?.length ? `, ${fait.echecs.length} en échec (${fait.echecs.map(e => e.nom).join(', ')})` : ''}.</div>}
      </div>
    </section>);
}

/* QUI S'EST CONNECTÉ (3.5.576, Charles : « comment voir facilement qui s'est connecté, et envoyer un mail à ceux qui ne le sont pas ? »).
   Une section, une UE, ou tous les étudiants déjà invités : invitation, première et dernière connexion. « Relancer » renvoie le courriel
   d'invitation (avec un mot) à ceux qui ne se sont jamais connectés. GET /api/portail-suivi/invitations, POST …/inviter (deja). */
function QuiConnecte() {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [ue, setUe] = useState('');
  const [d, setD] = useState(null);
  const [filtre, setFiltre] = useState('tous');
  const [mot, setMot] = useState('');
  const [msg, setMsg] = useState(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => { fetch('/api/ref/sections', { headers: authHeaders() }).then(x => x.json()).then(l => Array.isArray(l) && setSections(l)).catch(() => {}); }, []);
  const charger = () => {
    setD(null); setMsg(null);
    const q = ue.trim() ? `ue=${Number(ue)}` : section ? `section=${encodeURIComponent(section)}` : '';
    fetch(`/api/portail-suivi/invitations?${q}`, { headers: authHeaders() }).then(x => x.json()).then(setD).catch(e => setMsg(e.message));
  };
  useEffect(charger, [section]);   // eslint-disable-line react-hooks/exhaustive-deps
  const date = v => (v ? new Date(`${String(v).replace(' ', 'T')}${String(v).includes('Z') ? '' : 'Z'}`).toLocaleDateString('fr-BE') : '—');
  const lignes = (d?.lignes || []).filter(l => filtre === 'tous' || (filtre === 'jamais' ? l.invite_le && !l.premiere : filtre === 'connectes' ? !!l.premiere : !l.invite_le));
  const aRelancer = (d?.lignes || []).filter(l => l.invite_le && !l.premiere && l.invitable);
  const relancer = async () => {
    if (!(await demander({ titre: 'Relancer les étudiants pas encore connectés', confirmer: `Relancer ${aRelancer.length} étudiant(s)`, annuler: 'Annuler',
      message: `Le courriel d’invitation repart à l’adresse d’institut de ${aRelancer.length} étudiant(s) invité(s) qui ne se sont jamais connectés${mot.trim() ? ', avec ton mot en tête' : ''}.` }))) return;
    setEnCours(true);
    try {
      const j = await fetch('/api/portail-suivi/inviter', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ids: aRelancer.map(l => l.id), deja: true, simulation: false, message: mot }) }).then(x => x.json());
      const n = Array.isArray(j.invites) ? j.invites.length : j.invites;
      setMsg(j.error ? j.error : `${n ?? aRelancer.length} relance(s) envoyée(s)${j.echecs?.length ? `, ${j.echecs.length} échec(s)` : ''}.`); charger();
    } finally { setEnCours(false); }
  };
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte titre="Qui s’est connecté à son espace" sous="Les étudiants d’une section, d’une UE, ou tous ceux déjà invités : l’invitation, la première et la dernière connexion." />
      <div className="px-4 py-3 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select className="controle" value={section} onChange={e => { setUe(''); setSection(e.target.value); }}>
            <option value="">— tous les étudiants invités —</option>{sections.map(x => <option key={x.code} value={x.code}>{x.libelle || x.code}</option>)}
          </select>
          <span className="text-slate-500">ou l’UE</span>
          <input className="controle w-20" inputMode="numeric" value={ue} onChange={e => setUe(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && charger()} />
          <button type="button" className="bouton" onClick={charger}>Afficher</button>
          {d && <span className="ml-auto text-second text-slate-500">{d.lignes.length} étudiant(s) · {d.invites} invité(s) · <b className="text-slate-700">{d.connectes} connecté(s)</b></span>}
        </div>
        {d && <div className="flex flex-wrap items-center gap-2">
          <div className="segments">
            {[['tous', 'Tous'], ['jamais', 'Invités, jamais connectés'], ['connectes', 'Connectés'], ['non', 'Pas encore invités']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFiltre(k)} className={filtre === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>{l}</button>))}
          </div>
        </div>}
        {msg && <p className="m-0 text-second text-slate-600">{msg}</p>}
        {!d ? <p className="m-0 text-second text-slate-400">Lecture…</p> : (
          <div className="border border-slate-100 rounded-champ overflow-hidden max-h-[420px] overflow-y-auto">
            <Tableau dense className="!border-0 !rounded-none">
              <TableauEntete><Th>Étudiant</Th><Th>Section</Th><Th>Invité le</Th><Th align="droite">Invitations</Th><Th>Première connexion</Th><Th>Dernière</Th><Th>État</Th></TableauEntete>
              <tbody>{lignes.map(l => (
                <Tr key={l.id}><Td>{l.nom}</Td><Td>{l.section || '—'}</Td><Td>{date(l.invite_le)}</Td><Td align="droite">{l.invitations || '—'}</Td>
                  <Td>{date(l.premiere)}</Td><Td>{date(l.derniere)}</Td>
                  <Td>{l.premiere ? <PastilleEtat etat="reussi">connecté</PastilleEtat> : l.invite_le ? <PastilleEtat etat="surveiller">jamais connecté</PastilleEtat>
                    : <PastilleEtat etat="neutre">{l.invitable ? 'pas invité' : 'sans adresse d’institut'}</PastilleEtat>}</Td></Tr>))}</tbody>
            </Tableau>
          </div>)}
        {aRelancer.length > 0 && <div className="space-y-2">
          <textarea className="controle w-full" rows={2} placeholder="Un mot en tête de la relance (facultatif)" value={mot} onChange={e => setMot(e.target.value)} data-reponses="Relance de l’invitation à l’espace" />
          <button type="button" className="bouton bouton-fort" disabled={enCours} onClick={relancer}>Relancer les {aRelancer.length} étudiant(s) jamais connecté(s)</button>
        </div>}
      </div>
    </section>);
}

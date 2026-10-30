import { useCallback, useEffect, useState } from 'react';
import { IconCertificate, IconFileText, IconBook, IconSignature, IconCheck, IconLogout, IconLock, IconDevices, IconTrash, IconShieldCheck, IconShieldX, IconKey, IconWorld, IconUserCircle, IconAward, IconUpload, IconPlus, IconAlertTriangle } from '@tabler/icons-react';

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

const Tete = ({ sous, onQuitter }) => (
  <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-lg bg-iip-blue text-white grid place-items-center text-second font-extrabold">IIP</div>
    <div className="leading-tight flex-1 min-w-0">
      <div className="text-sm font-bold text-iip-texte">Institut Ilya Prigogine</div>
      <div className="text-xs text-slate-500 truncate">{sous || 'Mon espace étudiant'}</div>
    </div>
    {onQuitter && <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={onQuitter}><IconLogout size={15} /> Quitter</button>}
  </div>
);

const ETAT_COULEUR = { reussi: 'var(--c-reussi, #3E7D5E)', surveiller: 'var(--c-attente, #B45309)', corriger: 'var(--c-refuse, #9D4A38)' };

/** L'accusé d'une pièce : ouvrir, puis signer par code. */
function Accuse({ type, id, presente, signe, onFait, onErreur }) {
  const [etape, setEtape] = useState(null);   // null | 'code'
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  if (signe) return <span className="inline-flex items-center gap-1 text-second" style={{ color: ETAT_COULEUR.reussi }}><IconCheck size={15} /> Accusé signé le {jourFr(signe)}</span>;
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
  if (!l) return <p className="text-sm text-slate-500">Chargement…</p>;
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
            <div className="text-xs text-slate-500">reconnu le {jourFr(a.cree_le)}{a.vu_le ? ` · dernière visite le ${jourFr(a.vu_le)}` : ''}</div>
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
    <div className="min-h-screen bg-slate-100">
      <Tete sous="Vérification d’une pièce" />
      <div className="max-w-[560px] mx-auto px-4 py-8 space-y-4">
        {!r ? <p className="text-sm text-slate-500">Vérification…</p> : r.trouve ? (
          <div className="bloc-etat px-5 py-4 space-y-3" data-etat="reussi">
            <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconShieldCheck size={22} style={{ color: 'var(--c-reussi, #3E7D5E)' }} /> Pièce authentique</h1>
            <p className="text-sm text-slate-600">L’Institut Ilya Prigogine a bien émis une pièce sous cette référence. Comparez-la au document que vous avez en main :
              une pièce modifiée ne correspond plus.</p>
            <div>
              <Ligne l="Référence" v={r.reference} />
              <Ligne l="Nature" v={r.nature} />
              <Ligne l="Objet" v={r.objet} />
              <Ligne l="Au nom de" v={r.personne} />
              <Ligne l="Émise le" v={jourFr(r.emise_le)} />
              <Ligne l="Par" v={r.etablissement} />
            </div>
          </div>
        ) : (
          <div className="bloc-etat px-5 py-4 space-y-2" data-etat="corriger">
            <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconShieldX size={22} style={{ color: 'var(--c-refuse, #9D4A38)' }} /> Référence inconnue</h1>
            <p className="text-sm text-slate-600">{r.erreur ? 'La vérification n’a pas pu se faire. Réessayez dans un instant.'
              : <>L’Institut Ilya Prigogine n’a émis aucune pièce sous la référence <b>{r.reference || reference}</b>. Vérifiez la saisie ;
                si elle est exacte, ce document n’est pas une pièce de l’Institut. En cas de doute, contactez le secrétariat.</>}</p>
          </div>)}
      </div>
    </div>
  );
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
function MesValorisations({ onErreur }) {
  const [v, setV] = useState(null);
  const [ue, setUe] = useState('');
  const [porte, setPorte] = useState('');
  const [nature, setNature] = useState({});
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);
  const charger = useCallback(() => appel('GET', '/va').then(setV).catch(onErreur), [onErreur]);
  useEffect(() => { charger(); }, [charger]);
  // Tant que Lucie n'a pas relevé (quelques secondes), on regarde à nouveau.
  const attend = v && (!v.pret || v.en_attente.length > 0);
  useEffect(() => { if (!attend) return undefined; const t = setTimeout(charger, 4000); return () => clearTimeout(t); }, [attend, v, charger]);
  if (!v) return <p className="text-sm text-slate-500">Chargement…</p>;
  if (!v.pret) return <p className="text-sm text-slate-500">Préparation de vos unités… quelques secondes.</p>;

  const geste = async (chemin, corps, ok) => {
    setEnCours(true); setMessage(null);
    try { await appel('POST', chemin, corps); ok?.(); await charger(); } catch (e) { onErreur(e); } finally { setEnCours(false); }
  };
  const ouvertes = new Set([...v.etat.map(d => d.ue_num), ...v.en_attente.filter(g => g.type === 'ouvrir').map(g => g.ue_num)]);
  const libres = (v.offre?.unites || []).filter(u => !ouvertes.has(u.ue_num));
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
    ue_nom: (v.offre?.unites || []).find(u => u.ue_num === g.ue_num)?.ue_nom, pieces: [], modifiable: true, frise: [] }))];

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">La <b>VA</b> fait reconnaître des études déjà réussies (un diplôme, des unités) ; la <b>VAE</b>, une
        expérience professionnelle ou personnelle. Une demande par unité, avec ses pièces ; vous complétez tant que le secrétariat ne l’a pas examinée.
        L’admission se demande au secrétariat.</p>
      {v.refus.map(r => (
        <div key={r.id} className="bloc-etat px-3 py-2 text-sm flex gap-2" data-etat="corriger"><IconAlertTriangle size={16} className="flex-none text-slate-400" />
          <span className="flex-1">{r.ue_num ? `UE ${r.ue_num} — ` : ''}{r.nom ? `${r.nom} : ` : ''}{r.erreur}</span></div>))}
      {v.refus.length > 0 && <button type="button" className="text-second text-iip-blue underline" onClick={() => geste('/va/refus-lus')}>J’ai compris</button>}
      {message && <div className="bloc-etat px-3 py-2 text-sm" data-etat="reussi">{message}</div>}

      {demandes.map(d => (
        <section key={d.ue_num} className="bloc-etat px-4 py-3 space-y-2" data-etat={d.attente ? 'neutre' : 'disponible'}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-iip-texte flex-1 min-w-0">UE {d.ue_num} {d.ue_nom || ''}</span>
            <span className="pastille-etat" style={{ background: 'var(--c-disponible, #2F6FB0)', color: '#fff' }}>{PORTE[d.porte] || d.porte}</span>
          </div>
          {d.attente ? <p className="text-xs text-slate-500">Envoyée à l’école : enregistrée dans quelques secondes.</p> : (
            <div className="flex flex-wrap gap-1">
              {d.frise.map(e => (
                <span key={e.cle} className="text-xs px-2 py-0.5 rounded-full border"
                  style={e.refus ? { background: 'var(--c-refuse, #9D4A38)', color: '#fff', borderColor: 'transparent' }
                    : e.fait ? { background: 'var(--c-reussi, #3E7D5E)', color: '#fff', borderColor: 'transparent' } : { color: '#64748b' }}>
                  {e.fait ? '✓ ' : ''}{e.libelle}{e.le && e.fait ? ` · ${jourFr(e.le)}` : ''}</span>))}
            </div>)}
          {d.motif_irrecevabilite && <p className="text-sm text-slate-700">Motif : {d.motif_irrecevabilite}</p>}
          {d.decision && <p className="text-sm text-slate-700">Décision : <b>{d.decision}</b> — la notification est dans vos documents.</p>}
          <div className="space-y-1">
            {d.pieces.map(pc => (
              <div key={pc.id} className="flex flex-wrap items-center gap-2 text-sm">
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
                {natures.map(n => <option key={n.cle} value={n.cle}>{n.label}</option>)}
              </select>
              <label className={`bouton inline-flex items-center gap-1.5 ${!nature[d.ue_num] || enCours ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
                <IconUpload size={15} /> Choisir le fichier
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic,.tif,.tiff,.doc,.docx,.odt,image/*" onChange={ev => ajouter(d.ue_num, ev)} /></label>
              {!d.attente && d.en_ligne && <button type="button" className="text-second text-iip-blue underline ml-auto" disabled={enCours}
                onClick={() => geste('/va/retirer', { ue_num: d.ue_num })}>Retirer cette demande</button>}
            </div>)}
          {enAttente(d.ue_num, 'retirer').length > 0 && <p className="text-xs text-slate-500">Retrait de la demande en cours…</p>}
        </section>))}

      {libres.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-carte p-4 space-y-3">
          <h2 className="titre-carte flex items-center gap-2"><IconPlus size={16} /> Nouvelle demande</h2>
          <select value={ue} onChange={e => setUe(e.target.value)} className="controle w-full min-w-0">
            <option value="">Quelle unité ? (section {v.offre?.section || '—'})</option>
            {libres.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}{u.au_pae ? ' · à mon programme' : ''}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            {['va', 'vae'].map(p => (
              <button key={p} type="button" onClick={() => setPorte(p)} className={`bouton min-w-0 !whitespace-normal !h-auto py-2 leading-tight ${porte === p ? 'bouton-fort' : ''}`}>
                {p === 'va' ? 'VA — des études réussies' : 'VAE — une expérience'}</button>))}
          </div>
          {choisie && (
            <div className="bloc-etat px-3 py-2 text-sm space-y-1" data-etat={choisie.hors_delai ? 'surveiller' : 'disponible'}>
              <div><b>Forfait d’analyse : {eur(choisie.prix)}</b> ({choisie.calcul}). Il est dû dès la demande, quelle que soit la décision :
                l’examen du dossier demande du travail.</div>
              {choisie.echeance && <div>{choisie.hors_delai
                ? <>Le délai est dépassé (avant le {jourFr(choisie.echeance)}, RDE art. 28) : la demande risque d’être irrecevable.</>
                : <>À introduire avant le {jourFr(choisie.echeance)} (RDE art. 28).</>}</div>}
            </div>)}
          <button type="button" className="bouton bouton-fort w-full" disabled={!choisie || !porte || enCours}
            onClick={() => geste('/va/ouvrir', { ue_num: Number(ue), porte }, () => { setUe(''); setPorte(''); })}>
            Introduire la demande{choisie ? ` — ${eur(choisie.prix)}` : ''}</button>
        </section>)}

      {demandes.length > 0 && (
        <button type="button" className="bouton w-full" disabled={enCours || attend}
          onClick={() => geste('/va/terminer', null, () => setMessage('C’est noté : l’accusé de réception part à votre adresse dans la minute.'))}>
          J’ai terminé — recevoir l’accusé de réception</button>)}
    </div>
  );
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
    <form onSubmit={valider} className="bg-white border border-slate-200 rounded-carte p-5 space-y-3">
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
      {mdp2 && !pareil && <p className="text-xs text-red-700">Les deux ne sont pas identiques.</p>}
      <button type="submit" className="bouton bouton-fort w-full" disabled={!pareil || mdp.length < 10 || (avecActuel && !actuel)}>Enregistrer mon mot de passe</button>
    </form>
  );
}

/* Hors du composant : défini dedans, il serait un nouveau composant à chaque frappe, et le champ perdrait le focus. */
const Cadre = ({ horsBe, erreur, children }) => (
  <div className="min-h-screen bg-slate-100">
    <Tete />
    <div className="max-w-[560px] mx-auto px-4 py-8 space-y-4">
      {horsBe && <HorsBelgique texte={horsBe} />}
      {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
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
  const [face, setFace] = useState('resultats');
  const [texte, setTexte] = useState(null);   // règlement ouvert

  const echec = e => {
    if (e.donnees?.hors_belgique) { setHorsBe(e.message); setConnecte(false); setD(null); poser(null); return; }
    setErreur(e.message); if (e.session) { setConnecte(false); setD(null); }
  };
  const charger = useCallback(async () => { try { setD(await appel('GET', '/moi')); setErreur(null); } catch (e) { echec(e); } }, []);

  useEffect(() => {
    const jeton = new URLSearchParams(window.location.search).get('jeton');
    if (jeton) { window.history.replaceState(null, '', '/'); setLien({ jeton }); return; }
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
    try { const j = await appel('POST', '/candidat', { email: ident.trim(), code: codeAcces }); setCodeAcces(''); entrer(j.token); setFace('va'); }
    catch (e) { echec(e); }
  };
  const demanderLien = async ev => {
    ev.preventDefault();
    if (!ident.trim()) return;
    setErreur(null); setHorsBe(null);
    try { const j = await appel('POST', '/lien', { identifiant: ident.trim() }); setMessage(j.message); } catch (e) { echec(e); }
  };
  const quitter = () => {
    poser(null); marquerQuitte(true); setConnecte(false); setD(null); setFace('resultats'); setIdent('');
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
        <div className="bg-white border border-slate-200 rounded-carte p-5 space-y-3">
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
        <div className="bg-white border border-slate-200 rounded-carte p-5 space-y-3">
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
          <form onSubmit={entrerCandidat} className="bg-white border border-slate-200 rounded-carte p-5 space-y-3">
            <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconKey size={18} /> Pas encore d’adresse de l’institut</h1>
            <p className="text-sm text-slate-600">Votre dossier vient d’être ouvert : un <b>code d’accès</b> vous a été envoyé à votre adresse
              privée. Il ouvre votre demande de valorisation et vos documents, jusqu’à ce que vous receviez votre adresse de l’institut.</p>
            <input value={ident} onChange={e => setIdent(e.target.value)} placeholder="Votre adresse privée" autoComplete="email"
              className="controle w-full" autoFocus />
            <input value={codeAcces} onChange={e => setCodeAcces(e.target.value.toUpperCase())} placeholder="Code d’accès : XXXXX-XXXXX" autoComplete="one-time-code"
              className="controle w-full tracking-widest" />
            <button type="submit" className="bouton bouton-fort w-full" disabled={!ident.trim() || codeAcces.replace(/[^A-Z0-9]/g, '').length < 10}>Entrer</button>
            <p className="text-xs text-slate-500">Code perdu ou échu ? Le secrétariat peut vous en envoyer un nouveau.</p>
            <button type="button" className="text-second text-iip-blue underline" onClick={() => { setModeCandidat(false); setErreur(null); }}>J’ai mon adresse de l’institut</button>
          </form>
        ) : !modeLien ? (
          <form onSubmit={seConnecter} className="bg-white border border-slate-200 rounded-carte p-5 space-y-3">
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
          <form onSubmit={demanderLien} className="bg-white border border-slate-200 rounded-carte p-5 space-y-3">
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

  const nom = d ? `${String(d.etudiant.nom || '').toUpperCase()} ${d.etudiant.prenom || ''}` : '';
  const aSigner = d ? d.documents.filter(x => !x.signe_le).length + d.reglements.filter(x => !x.signe_le).length : 0;
  const FACES = d?.candidat ? [['va', 'Valorisation', IconAward], ['documents', 'Mes documents', IconFileText]]
    : [['resultats', 'Mes résultats', IconCertificate], ['documents', 'Mes documents', IconFileText], ['va', 'Valorisation', IconAward], ['reglements', 'Règlements', IconBook], ['compte', 'Mon compte', IconUserCircle]];

  return (
    <div className="min-h-screen bg-slate-100">
      <Tete sous={d ? [nom, d.etudiant.matricule].filter(Boolean).join(' · ') : '…'} onQuitter={quitter} />
      <div className="max-w-[860px] mx-auto px-4 py-6 space-y-4">
        {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
        {aSigner > 0 && <div className="bloc-etat px-3 py-2 text-sm" data-etat="surveiller">{aSigner} pièce(s) attendent votre accusé de réception.</div>}
        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {FACES.map(([k, l, I]) => (
            <button key={k} type="button" onClick={() => setFace(k)} title={l} aria-label={l} className={`onglet-page inline-flex items-center gap-1.5 ${face === k ? 'onglet-page-actif' : ''}`}>
              <I size={15} /> <span className={face === k ? '' : 'hidden sm:inline'}>{l}</span></button>))}
        </div>

        {d && face === 'resultats' && (d.resultats.length ? d.resultats.map(a => (
          <section key={a.annee} className="bg-white border border-slate-200 rounded-carte overflow-hidden">
            <h2 className="titre-carte px-4 py-2.5 border-b border-slate-100">{a.annee.replace('-', ' – ')}</h2>
            <table className="w-full text-sm">
              <tbody>
                {a.ues.map(u => (
                  <tr key={`${u.ue_num}-${u.decision}`} className="border-t border-slate-100 first:border-t-0">
                    <td className="px-4 py-2 tabular-nums text-slate-500 w-16">UE {u.ue_num}</td>
                    <td className="px-2 py-2">{u.ue_nom}</td>
                    <td className="px-2 py-2 whitespace-nowrap"><span className="pastille-etat" style={{ background: ETAT_COULEUR[u.etat], color: '#fff' }}>{u.decision}</span></td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums w-20">{u.note}{typeof u.note === 'number' ? ' /20' : ''}</td>
                  </tr>))}
              </tbody>
            </table>
          </section>))
          : <p className="text-sm text-slate-500">Aucun résultat délibéré pour l’instant. Un résultat paraît ici quand la délibération de l’unité est close.</p>)}
        {d && face === 'resultats' && d.resultats.length > 0 && (
          <p className="text-xs text-slate-500">« NA » : non acquis. Seuls les résultats des délibérations closes paraissent ici ; ce qui fait foi reste la pièce que l’école vous remet.</p>)}

        {d && face === 'documents' && (d.documents.length ? (
          <div className="space-y-2">
            {d.documents.map(doc => (
              <div key={doc.id} className="bloc-etat px-4 py-3 flex flex-wrap items-center gap-3" data-etat={doc.signe_le ? 'reussi' : 'disponible'}>
                <IconFileText size={18} className="text-slate-400 flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-iip-texte break-words">{doc.sujet}</div>
                  <div className="text-xs text-slate-500 break-words">mis à disposition le {jourFr(doc.envoye_le)}{doc.reference ? ` · réf. ${doc.reference}` : ''}
                    {doc.libre && doc.libre_jusqu_au ? ` · téléchargeable librement jusqu’au ${jourFr(doc.libre_jusqu_au)}` : ''}
                    {!doc.libre ? ' · plus de 90 jours : un code est demandé' : ''}</div>
                </div>
                {doc.libre ? <button type="button" className="bouton" onClick={() => ouvrir(doc)}>Ouvrir</button>
                  : <Deverrouiller doc={doc} onOuvrir={ouvrir} onErreur={echec} />}
                <div className="w-full"><Accuse type="envoi" id={doc.id} presente={doc.presente_le} signe={doc.signe_le} onFait={charger} onErreur={echec} /></div>
              </div>))}
          </div>) : <p className="text-sm text-slate-500">Aucun document pour l’instant. Vos attestations et les décisions du Conseil des études paraissent ici dès la clôture de la délibération.</p>)}

        {d && face === 'reglements' && (d.reglements.length ? (
          <div className="space-y-2">
            {d.reglements.map(reg => (
              <div key={reg.cle} className="bloc-etat px-4 py-3 flex flex-wrap items-center gap-3" data-etat={reg.signe_le ? 'reussi' : 'disponible'}>
                <IconBook size={18} className="text-slate-400 flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-iip-texte">{reg.titre}</div>
                  <div className="text-xs text-slate-500">Version {reg.numero} · publiée le {jourFr(reg.publiee_le)}</div>
                </div>
                <button type="button" className="bouton" onClick={() => lireTexte(reg)}>Lire</button>
                <div className="w-full"><Accuse type="reglement" id={reg.version_id} presente={reg.presente_le} signe={reg.signe_le} onFait={charger} onErreur={echec} /></div>
              </div>))}
          </div>) : <p className="text-sm text-slate-500">Aucun règlement à lire pour l’instant.</p>)}

        {d?.candidat && <div className="bloc-etat px-3 py-2 text-sm" data-etat="disponible">Accès par code, jusqu’au {jourFr(d.candidat.jusqu_au)} ou
          jusqu’à votre adresse de l’institut : votre demande de valorisation et vos documents.</div>}
        {face === 'va' && <MesValorisations onErreur={echec} />}
        {face === 'compte' && <div className="space-y-4">
          <ChoisirMotDePasse avecActuel />
          <h2 className="titre-carte flex items-center gap-2"><IconDevices size={16} /> Mes appareils</h2>
          <MesAppareils onErreur={echec} onOublieCourant={quitter} />
        </div>}

        {texte && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-4 overflow-auto" onClick={() => setTexte(null)}>
            <div className="bg-white rounded-carte max-w-[760px] w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
              <div className="flex items-start gap-3">
                <h2 className="titre-carte flex-1">{texte.titre} <span className="text-xs text-slate-400 font-normal">version {texte.numero}</span></h2>
                <button type="button" className="bouton" onClick={() => setTexte(null)}>Fermer</button>
              </div>
              <div className="texte-corpus" dangerouslySetInnerHTML={{ __html: texte.contenu }} />
              {texte.source_url && <a href={texte.source_url} target="_blank" rel="noreferrer" className="text-second text-iip-blue underline">Le texte officiel</a>}
            </div>
          </div>)}
      </div>
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
        <span className="text-xs text-slate-500">{a.vu_le ? `dernière visite le ${jourFr(a.vu_le)}` : `reconnu le ${jourFr(a.cree_le)}`}</span>
      </button>))}
    <button type="button" className="text-second text-iip-blue underline" onClick={onAucun}>Ne rien remplacer — juste cette fois</button>
  </>;
}

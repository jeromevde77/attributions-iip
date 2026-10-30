import { useCallback, useEffect, useState } from 'react';
import { IconCertificate, IconFileText, IconBook, IconSignature, IconCheck, IconLogout, IconLock, IconDevices, IconTrash, IconShieldCheck, IconShieldX } from '@tabler/icons-react';

/**
 * L'ESPACE DE L'ÉTUDIANT (3.1.475, Charles : « un mini espace ultra sécurisé : récupérer ses documents, voir ses
 * notes, signer les accusés de réception »). DEPUIS 3.1.477, DE L'AUTRE CÔTÉ DU MUR : ce fichier est servi par le
 * site des étudiants (etudiants.lucie-iip.be, `vite.portail.config.js`) et ne parle qu'au portail (/api/portail),
 * qui n'a ni la base ni les clés de Lucie. Son propre jeton (sessionStorage, « lucie.espace »).
 * Trois faces : résultats délibérés, documents, règlements. Signer un accusé = avoir ouvert la pièce + un code à
 * six chiffres reçu à l'adresse d'école. Serveur : portail/src/serveur.js.
 */
const CLE = 'lucie.espace';
const lire = () => { try { return sessionStorage.getItem(CLE); } catch { return null; } };
// « Quitter » dans cet onglet : on n'y rentre pas d'office, même si l'appareil est reconnu.
const QUITTE = 'lucie.espace.quitte';
const aQuitte = () => { try { return sessionStorage.getItem(QUITTE) === '1'; } catch { return false; } };
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
      <p className="text-sm text-slate-600">Ces appareils entrent dans votre espace sans lien, pendant {l.jours} jours après leur dernière visite.
        {` ${l.max} au plus`} : au-delà, le lien reçu par courriel vous demande lequel remplacer. Un appareil que vous ne reconnaissez pas ? Oubliez-le.</p>
      {l.appareils.length ? l.appareils.map(a => (
        <div key={a.id} className="bloc-etat px-4 py-3 flex flex-wrap items-center gap-3" data-etat="disponible">
          <IconDevices size={18} className="text-slate-400 flex-none" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-iip-texte">{a.nom || 'Appareil'}{a.courant ? ' — celui-ci' : ''}</div>
            <div className="text-xs text-slate-500">reconnu le {jourFr(a.cree_le)}{a.vu_le ? ` · dernière visite le ${jourFr(a.vu_le)}` : ''}</div>
          </div>
          <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => oublier(a)}><IconTrash size={15} /> Oublier</button>
        </div>)) : <p className="text-sm text-slate-500">Aucun appareil reconnu : vous entrez par le lien reçu à votre adresse de l’institut.</p>}
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

function Espace() {
  const [connecte, setConnecte] = useState(!!lire());
  const [matricule, setMatricule] = useState('');
  // Le lien ouvert : sur cet appareil, le reconnaître ou non ; au 4e, lequel remplacer.
  const [lien, setLien] = useState(null);   // { jeton, appareils? }
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [d, setD] = useState(null);
  const [face, setFace] = useState('resultats');
  const [texte, setTexte] = useState(null);   // règlement ouvert

  const echec = e => { setErreur(e.message); if (e.session) { setConnecte(false); setD(null); } };
  const charger = useCallback(async () => { try { setD(await appel('GET', '/moi')); setErreur(null); } catch (e) { echec(e); } }, []);

  useEffect(() => {
    const jeton = new URLSearchParams(window.location.search).get('jeton');
    if (jeton) { window.history.replaceState(null, '', '/'); setLien({ jeton }); return; }
    if (lire()) { charger(); return; }
    if (aQuitte()) return;
    // UN APPAREIL RECONNU ENTRE DIRECTEMENT.
    appel('POST', '/entrer').then(j => { poser(j.token); setConnecte(true); charger(); }).catch(() => {});
  }, [charger]);

  const ouvrirSession = async (retenir, remplacer = null) => {
    setErreur(null);
    try {
      const j = await appel('POST', '/session', { jeton: lien.jeton, retenir, ...(remplacer ? { remplacer } : {}) });
      poser(j.token); marquerQuitte(false); setLien(null); setConnecte(true); charger();
    } catch (e) {
      if (e.statut === 409 && e.donnees?.choix) setLien(l0 => ({ ...l0, appareils: e.donnees.appareils }));
      else { setLien(null); setConnecte(false); setErreur(e.message); }
    }
  };
  const entrer = () => appel('POST', '/entrer').then(j => { poser(j.token); marquerQuitte(false); setConnecte(true); charger(); })
    .catch(() => setErreur('Cet appareil n’est plus reconnu : demandez un lien.'));

  const demanderLien = async ev => {
    ev.preventDefault();
    if (!matricule.trim()) return;
    setErreur(null);
    try { const j = await appel('POST', '/lien', { identifiant: matricule.trim() }); setMessage(j.message); } catch (e) { setErreur(e.message); }
  };
  const quitter = () => { poser(null); marquerQuitte(true); setConnecte(false); setD(null); };

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

  // LE LIEN VIENT D'ÊTRE OUVERT : sur cet appareil, le reconnaître (le sien) ou juste cette fois (un ordinateur partagé).
  if (lien && !connecte) {
    return (
      <div className="min-h-screen bg-slate-100">
        <Tete />
        <div className="max-w-[560px] mx-auto px-4 py-8 space-y-4">
          {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
          <div className="bg-white border border-slate-200 rounded-carte p-5 space-y-3">
            {!lien.appareils ? <>
              <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconDevices size={18} /> Cet appareil est-il le vôtre ?</h1>
              <p className="text-sm text-slate-600">Reconnu, il entrera directement dans votre espace pendant 90 jours, sans lien par courriel.
                Sur un ordinateur partagé (bibliothèque, salle de cours), choisissez « juste cette fois ».</p>
              <button type="button" className="bouton bouton-fort w-full" onClick={() => ouvrirSession(true)}>Oui — reconnaître cet appareil</button>
              <button type="button" className="bouton w-full" onClick={() => ouvrirSession(false)}>Non — juste cette fois</button>
            </> : <>
              <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconDevices size={18} /> Trois appareils sont déjà reconnus</h1>
              <p className="text-sm text-slate-600">Pour votre sécurité, trois appareils au plus entrent sans lien. Lequel celui-ci remplace-t-il ?</p>
              {lien.appareils.map(a => (
                <button key={a.id} type="button" className="bouton w-full justify-between" onClick={() => ouvrirSession(true, a.id)}>
                  <span>{a.nom || 'Appareil'}</span>
                  <span className="text-xs text-slate-500">{a.vu_le ? `dernière visite le ${jourFr(a.vu_le)}` : `reconnu le ${jourFr(a.cree_le)}`}</span>
                </button>))}
              <button type="button" className="text-second text-iip-blue underline" onClick={() => ouvrirSession(false)}>Ne rien remplacer — juste cette fois</button>
            </>}
          </div>
        </div>
      </div>
    );
  }

  if (!connecte) {
    return (
      <div className="min-h-screen bg-slate-100">
        <Tete />
        <div className="max-w-[560px] mx-auto px-4 py-8 space-y-4">
          {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
          <form onSubmit={demanderLien} className="bg-white border border-slate-200 rounded-carte p-5 space-y-3">
            <h1 className="text-lg font-bold text-iip-texte flex items-center gap-2"><IconLock size={18} /> Mon espace étudiant</h1>
            <p className="text-sm text-slate-600">Vos résultats délibérés, vos documents, vos accusés de réception. Tapez votre adresse
              de l'institut (ou votre matricule) : un lien d'accès, valable 30 minutes et à usage unique, part à votre adresse électronique
              <b> de l'institut</b>. Sur un appareil reconnu, vous entrez ensuite directement.</p>
            <input value={matricule} onChange={e => setMatricule(e.target.value)} placeholder="prenom.nom@… ou matricule" autoComplete="username"
              className="controle w-full" autoFocus />
            <button type="submit" className="bouton bouton-fort w-full" disabled={!matricule.trim()}>Recevoir mon lien</button>
            {message && <p className="text-sm text-slate-700">{message}</p>}
          </form>
          {aQuitte() && <button type="button" className="text-second text-iip-blue underline" onClick={entrer}>Entrer à nouveau sur cet appareil reconnu</button>}
        </div>
      </div>
    );
  }

  const nom = d ? `${String(d.etudiant.nom || '').toUpperCase()} ${d.etudiant.prenom || ''}` : '';
  const aSigner = d ? d.documents.filter(x => !x.signe_le).length + d.reglements.filter(x => !x.signe_le).length : 0;
  const FACES = [['resultats', 'Mes résultats', IconCertificate], ['documents', 'Mes documents', IconFileText], ['reglements', 'Règlements', IconBook], ['appareils', 'Mes appareils', IconDevices]];

  return (
    <div className="min-h-screen bg-slate-100">
      <Tete sous={d ? `${nom} · ${d.etudiant.matricule || ''}` : '…'} onQuitter={quitter} />
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

        {face === 'appareils' && <MesAppareils onErreur={echec} onOublieCourant={quitter} />}

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

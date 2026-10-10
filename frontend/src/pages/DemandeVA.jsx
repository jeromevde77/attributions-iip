import { useCallback, useEffect, useState } from 'react';
import { demander } from '../lib/dialogue.jsx';

/**
 * LA PAGE DES ÉTUDIANTS — DEMANDE DE VALORISATION EN LIGNE (3 octobre 2026).
 *
 * Hors session du personnel : la page a son propre jeton (sessionStorage,
 * « lucie.portail-va »), délivré contre le lien reçu par courriel, et ne
 * parle qu'à /api/portail-va. Trois temps : s'identifier (matricule), demander
 * (unités, VA ou VAE, pièces), recevoir l'accusé. Serveur : routes/portailVA.js.
 */
const CLE = 'lucie.portail-va';
const lire = () => { try { return sessionStorage.getItem(CLE); } catch { return null; } };
const poser = t => { try { t ? sessionStorage.setItem(CLE, t) : sessionStorage.removeItem(CLE); } catch { /* */ } };

async function appel(methode, chemin, corps, fichier) {
  const h = {};
  const t = lire();
  if (t) h.Authorization = `Bearer ${t}`;
  let body;
  if (fichier) body = fichier;
  else if (corps) { h['Content-Type'] = 'application/json'; body = JSON.stringify(corps); }
  const r = await fetch(`/api/portail-va${chemin}`, { method: methode, headers: h, body });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { poser(null); const e = new Error(j.error || 'Session expirée.'); e.session = true; throw e; }
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

const Tete = ({ sous }) => (
  <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-lg bg-iip-blue text-white grid place-items-center text-second font-extrabold">IIP</div>
    <div className="leading-tight">
      <div className="text-sm font-bold text-iip-texte">Institut Ilya Prigogine</div>
      <div className="text-xs text-slate-500">{sous || 'Demande de valorisation des acquis'}</div>
    </div>
  </div>
);

export default function DemandeVA() {
  const [etape, setEtape] = useState(lire() ? 'demande' : 'identifier');
  const [matricule, setMatricule] = useState('');
  const [message, setMessage] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [d, setD] = useState(null);
  const [ajout, setAjout] = useState({ ue: '', porte: 'va' });
  const [nature, setNature] = useState({});
  const [accuse, setAccuse] = useState(null);

  const echec = e => { setErreur(e.message); if (e.session) { setEtape('identifier'); setD(null); } };
  const charger = useCallback(async () => {
    try { setD(await appel('GET', '/moi')); } catch (e) { echec(e); }
  }, []);

  // Le lien du courriel : on l'échange contre une session, puis on l'efface de l'adresse.
  useEffect(() => {
    const jeton = new URLSearchParams(window.location.search).get('jeton');
    if (!jeton) { if (lire()) charger(); return; }
    window.history.replaceState(null, '', '/demande-va');
    (async () => {
      try {
        const j = await appel('POST', '/session', { jeton });
        poser(j.token); setEtape('demande'); setErreur(null); setMessage(null); charger();
      } catch (e) { setEtape('identifier'); setErreur(e.message); }
    })();
  }, [charger]);

  const demanderLien = async ev => {
    ev.preventDefault();
    if (!matricule.trim()) return;
    setOccupe(true); setErreur(null);
    try { const j = await appel('POST', '/lien', { matricule: matricule.trim() }); setMessage(j.message); }
    catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  const ajouter = async () => {
    if (!ajout.ue) return;
    setOccupe(true); setErreur(null);
    try {
      const j = await appel('POST', '/demandes', { ue_num: Number(ajout.ue), porte: ajout.porte });
      if (j.hors_delai) setMessage("Votre demande arrive après la date limite de l'unité : le secrétariat jugera de sa recevabilité.");
      setAjout({ ue: '', porte: 'va' }); await charger();
    } catch (e) { echec(e); } finally { setOccupe(false); }
  };
  const retirer = async x => {
    if (!(await demander(`Retirer la demande pour l'UE ${x.ue_num} et ses pièces ?`))) return;
    try { await appel('DELETE', `/demandes/${x.id}`); await charger(); } catch (e) { echec(e); }
  };
  const deposer = async (x, fichier) => {
    if (!fichier) return;
    const fd = new FormData();
    fd.append('nature', nature[x.id] || 'DIP');
    fd.append('fichier', fichier);
    setOccupe(true); setErreur(null);
    try { await appel('POST', `/demandes/${x.id}/fichiers`, null, fd); await charger(); }
    catch (e) { echec(e); } finally { setOccupe(false); }
  };
  const retirerPiece = async p => {
    try { await appel('DELETE', `/fichiers/${p.id}`); await charger(); } catch (e) { echec(e); }
  };
  const terminer = async () => {
    setOccupe(true); setErreur(null);
    try { setAccuse(await appel('POST', '/terminer')); setMessage(null); setEtape('accuse'); } catch (e) { echec(e); } finally { setOccupe(false); }
  };

  const nom = d ? `${String(d.etudiant.nom || '').toUpperCase()} ${d.etudiant.prenom || ''}` : '';
  const libres = d ? d.unites.filter(u => !d.demandes.some(x => x.ue_num === u.ue_num)) : [];

  return (
    <div className="min-h-screen bg-slate-100">
      <Tete sous={d && etape !== 'identifier' ? `${nom} · ${d.etudiant.matricule || ''} · ${d.etudiant.section || ''} · ${d.annee}` : null} />
      <div className="max-w-[720px] mx-auto px-4 py-6 space-y-4">
        {erreur && <div className="bg-white border border-slate-200 border-l-4 rounded-r-carte px-3 py-2 text-sm" style={{ borderLeftColor: 'var(--c-refuse, #9D4A38)' }}>{erreur}</div>}
        {message && etape !== 'identifier' && <div className="bg-white border border-slate-200 border-l-4 rounded-r-carte px-3 py-2 text-sm" style={{ borderLeftColor: 'var(--c-attente, #E8890C)' }}>{message}</div>}

        {etape === 'identifier' && (
          <form onSubmit={demanderLien} className="bg-white border border-slate-200 rounded-carte p-5 space-y-3">
            <h1 className="text-lg font-bold text-iip-texte">Votre matricule</h1>
            <p className="text-sm text-slate-600">Il figure sur votre confirmation d'inscription. Vous recevrez un lien d'accès, valable 30 minutes,
              à l'adresse électronique de votre dossier.</p>
            <input value={matricule} onChange={e => setMatricule(e.target.value)} placeholder="ex. 26-01847" autoFocus
              className="controle w-full text-base" />
            <button type="submit" disabled={occupe || !matricule.trim()} className="bouton bouton-fort w-full justify-center disabled:opacity-40">
              Recevoir mon lien d'accès</button>
            {message && <div className="border border-slate-200 border-l-4 rounded-r-carte px-3 py-2 text-sm" style={{ borderLeftColor: 'var(--c-disponible, #2F6FB0)' }}>{message}</div>}
            <p className="text-xs text-slate-500">Votre adresse a changé ? Adressez-vous au secrétariat : elle ne se modifie pas ici.
              Les données sont traitées par l'IIP pour l'examen de votre demande (RDE, art. 28 à 30), et à rien d'autre.</p>
          </form>
        )}

        {etape === 'demande' && !d && <p className="text-sm text-slate-500">Chargement…</p>}
        {etape === 'demande' && d && (<>
          <div>
            <h1 className="text-lg font-bold text-iip-texte">Les unités que vous demandez</h1>
            <p className="text-sm text-slate-600">Une demande par unité de votre section. Déposez vos preuves sur chacune :
              diplôme, relevé de notes, attestations, dossier pédagogique, expérience professionnelle. Vous pouvez revenir compléter
              tant que le secrétariat n'a pas examiné l'unité.</p>
          </div>

          {d.demandes.map(x => (
            <div key={x.id} className="bg-white border border-slate-200 rounded-carte p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <b className="text-sm">UE {x.ue_num}</b><span className="text-sm">{x.ue_nom}</span>
                <span className="text-xs font-semibold text-white rounded-full px-2" style={{ background: 'var(--c-disponible, #2F6FB0)' }}>{x.porte === 'vae' ? 'VAE' : 'VA'}</span>
                <span className="ml-auto text-second text-slate-500">{x.modifiable ? `reçue le ${String(x.recue_le || '').split('-').reverse().join('/')}` : `examinée — ${x.etape}`}</span>
              </div>
              {x.pieces.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-second border-t border-dashed border-slate-200 pt-1.5">
                  <span>📄</span><span className="flex-1 min-w-0 truncate">{p.nom}</span>
                  {x.modifiable && p.a_moi && <button type="button" className="text-second underline text-slate-500" onClick={() => retirerPiece(p)}>retirer</button>}
                </div>
              ))}
              {!x.pieces.length && <div className="text-second" style={{ color: 'var(--c-attente, #E8890C)' }}>Aucune pièce : sans preuve, la demande ne peut pas être examinée.</div>}
              {x.modifiable && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <select value={nature[x.id] || 'DIP'} onChange={e => setNature(n => ({ ...n, [x.id]: e.target.value }))} className="controle text-sm">
                    {d.natures.map(n => <option key={n.cle} value={n.cle}>{n.label}</option>)}
                  </select>
                  <label className={`bouton cursor-pointer ${occupe ? 'opacity-40 pointer-events-none' : ''}`}>
                    ＋ Déposer une pièce
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.tif,.tiff,.doc,.docx,.odt"
                      onChange={e => { deposer(x, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  {x.en_ligne && <button type="button" className="ml-auto text-second underline text-slate-500" onClick={() => retirer(x)}>retirer cette demande</button>}
                </div>
              )}
            </div>
          ))}

          <div className="bg-white border border-slate-200 rounded-carte p-3 space-y-2">
            <div className="text-sm font-semibold">Ajouter une unité</div>
            {libres.length ? (
              <div className="flex items-center gap-2 flex-wrap">
                <select value={ajout.ue} onChange={e => setAjout(a => ({ ...a, ue: e.target.value }))} className="controle text-sm flex-1 min-w-[220px]">
                  <option value="">— choisir l'unité —</option>
                  {libres.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}{u.au_pae ? ' (à votre programme)' : ''}</option>)}
                </select>
                <div className="segments">
                  {[['va', 'VA — titre, formation'], ['vae', 'VAE — expérience']].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setAjout(a => ({ ...a, porte: v }))}
                      className={ajout.porte === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{l}</button>
                  ))}
                </div>
                <button type="button" disabled={occupe || !ajout.ue} onClick={ajouter} className="bouton disabled:opacity-40">Ajouter</button>
              </div>
            ) : <p className="text-second text-slate-500">Toutes les unités de votre section ont déjà une demande.</p>}
            <p className="text-xs text-slate-500">VA : acquis d'un titre ou d'une formation. VAE : acquis de l'expérience professionnelle ou personnelle.
              L'épreuve intégrée et certaines unités ne peuvent pas être valorisées ; elles ne sont pas proposées.</p>
          </div>

          {!!d.demandes.length && (
            <button type="button" disabled={occupe} onClick={terminer} className="bouton bouton-fort w-full justify-center disabled:opacity-40">
              J'ai terminé — recevoir l'accusé de réception</button>
          )}
          <p className="text-xs text-slate-500">PDF, image ou document Word · 25 Mo par pièce. La date d'envoi est celle du serveur ; c'est elle qui compte pour le délai.</p>
        </>)}

        {etape === 'accuse' && accuse && (
          <div className="bg-white border border-slate-200 rounded-carte p-5 space-y-3">
            <span className="text-xs font-bold text-white rounded-full px-2.5 py-0.5" style={{ background: 'var(--c-reussi, #3E7D5E)' }}>Demande enregistrée</span>
            <div className="text-xl font-extrabold tracking-wide text-iip-texte">{accuse.reference}</div>
            <p className="text-sm text-slate-600">Enregistrée le <b>{accuse.quand}</b>. Le même accusé vient de partir à votre adresse.</p>
            {accuse.demandes.map(x => (
              <div key={x.id} className="text-sm border border-slate-200 rounded-champ px-2.5 py-1.5"><b>UE {x.ue_num}</b> {x.ue_nom} · {x.porte === 'vae' ? 'VAE' : 'VA'} · {x.pieces.length} pièce(s)</div>
            ))}
            <p className="text-second text-slate-600">La suite se fait à l'école : le secrétariat vérifie que le dossier est complet et dans les délais,
              les chargés de cours rendent leur avis, le Conseil des études décide. La décision vous est notifiée par écrit.</p>
            <button type="button" className="bouton" onClick={() => { setEtape('demande'); charger(); }}>Revenir à ma demande</button>
          </div>
        )}
      </div>
    </div>
  );
}

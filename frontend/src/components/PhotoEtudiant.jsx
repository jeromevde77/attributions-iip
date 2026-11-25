/* (CS) LA PHOTO D'IDENTITÉ DE L'ÉTUDIANT — les écrans de Lucie (3.5.606 ; serveur : backend/src/lib/photoEtudiant.js, routes/photos.js).
   BlocPhoto : la fiche → Identité (voir, valider celle qui attend, déposer, reprendre de la carte eID, sortir la carte d'étudiant).
   PhotosAValider : Étudiants → rail → Photos à valider (secrétariat, direction). Trombinoscope : Mes cours → Ma liste. */
import { useCallback, useEffect, useState } from 'react';
import { IconCamera, IconCheck, IconX, IconId, IconUpload } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { saisir } from '../lib/dialogue.jsx';
import { eidReadAll } from '../lib/eid.js';
import { Fenetre, EnteteCarte, Encadre } from './ui.jsx';

/** Une image servie avec la session (les photos ne sont pas publiques). */
export function ImageAuth({ src, alt = '', className = '', vide = null }) {
  const [url, setUrl] = useState(null);
  const [ko, setKo] = useState(false);
  useEffect(() => {
    let u = null, vivant = true; setKo(false); setUrl(null);
    fetch(src, { headers: authHeaders() }).then(r => (r.ok ? r.blob() : Promise.reject())).then(b => { u = URL.createObjectURL(b); if (vivant) setUrl(u); })
      .catch(() => vivant && setKo(true));
    return () => { vivant = false; if (u) URL.revokeObjectURL(u); };
  }, [src]);
  if (ko) return vide;
  if (!url) return <div className={`${className} bg-slate-100`} />;
  return <img src={url} alt={alt} className={className} />;
}

const lireFichier = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); });

async function decider(pid, accepter) {
  let motif = null;
  if (!accepter) {
    motif = await saisir({ titre: 'Refuser la photo', message: 'Pourquoi ? L’étudiant le lira dans son espace (par exemple : le fond n’est pas blanc, la photo est floue, le visage n’est pas de face).', obligatoire: true, confirmer: 'Refuser' });
    if (!motif) return false;
  }
  const r = await fetch(`/api/photos/${pid}/decision`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ accepter, motif }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Refusé.');
  return true;
}

export function BlocPhoto({ etudId }) {
  const [e, setE] = useState(null);
  const [v, setV] = useState(0);
  const [msg, setMsg] = useState(null);
  const charger = useCallback(() => fetch(`/api/photos/etudiant/${etudId}/etat`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(setE).catch(() => setE(null)), [etudId]);
  useEffect(() => { charger(); }, [charger, v]);
  if (!e) return null;
  const poser = async (data, source) => {
    setMsg(null);
    const r = await fetch(`/api/photos/etudiant/${etudId}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ data, source }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setMsg(j.error || 'Refusé.'); else setV(x => x + 1);
  };
  const eid = async () => {
    const r = await eidReadAll();
    if (!r.ok) { setMsg(r.code === 'UNREACHABLE' ? 'Le lecteur de carte ne répond pas : lancez l’application eID Reader et insérez la carte.' : r.message); return; }
    if (!/^data:image\/(jpeg|png);base64,/.test(String(r.data?.photo || ''))) { setMsg('La carte lue ne porte pas de photo lisible.'); return; }
    poser(r.data.photo, 'eid');
  };
  const carte = async () => {
    const r = await fetch(`/api/photos/etudiant/${etudId}/carte`, { headers: authHeaders() });
    if (!r.ok) { setMsg((await r.json().catch(() => ({}))).error || 'Carte indisponible.'); return; }
    window.open(URL.createObjectURL(await r.blob()), '_blank');
  };
  return (
    <section className="carte overflow-hidden mb-4">
      <EnteteCarte icone={IconCamera} titre="Photo d’identité" sous={e.courante ? `En vigueur depuis le ${String(e.courante.le).slice(0, 10).split('-').reverse().join('/')}${e.courante.source === 'eid' ? ' (carte eID)' : e.courante.source === 'espace' ? ' (déposée par l’étudiant)' : ''}` : 'Pas encore de photo'} />
      <div className="px-4 py-3 flex flex-wrap gap-5 text-sm">
        <div>{e.courante ? <ImageAuth key={v} src={`/api/photos/etudiant/${etudId}`} alt="Photo d’identité" className="w-28 h-36 object-cover rounded-champ border border-slate-200" />
          : <div className="w-28 h-36 rounded-champ border border-dashed border-slate-300 flex items-center justify-center text-slate-400"><IconCamera size={26} /></div>}</div>
        {e.attente && <div className="space-y-2">
          <div className="font-medium">Déposée par l’étudiant le {String(e.attente.depose_le).slice(0, 10).split('-').reverse().join('/')} — à valider</div>
          <ImageAuth src={`/api/photos/fichier/${e.attente.id}`} alt="Photo à valider" className="w-28 h-36 object-cover rounded-champ border border-slate-200" />
          <div className="flex gap-2">
            <button type="button" className="bouton bouton-fort" onClick={async () => { try { if (await decider(e.attente.id, true)) setV(x => x + 1); } catch (x) { setMsg(x.message); } }}><IconCheck size={15} /> Accepter</button>
            <button type="button" className="bouton" onClick={async () => { try { if (await decider(e.attente.id, false)) setV(x => x + 1); } catch (x) { setMsg(x.message); } }}><IconX size={15} /> Refuser</button>
          </div></div>}
        {e.peut_decider && <div className="flex flex-col gap-2 justify-start">
          <label className="bouton cursor-pointer"><IconUpload size={15} /> Déposer une photo
            <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={async x => { const f = x.target.files?.[0]; if (f) poser(await lireFichier(f), 'secretariat'); x.target.value = ''; }} /></label>
          <button type="button" className="bouton" onClick={eid}><IconId size={15} /> Reprendre de la carte eID</button>
          {e.courante && <button type="button" className="bouton" onClick={carte}>Carte d’étudiant (PDF)</button>}
          {/* RETIRER LA PHOTO (3.5.712) : motif demandé ; elle n'est pas effacée, le registre garde qui et quand. */}
          {e.courante && <button type="button" className="bouton bouton-detruire" onClick={async () => {
            const motif = await saisir({ titre: 'Retirer la photo', message: 'Pourquoi ? L’étudiant le lira dans son espace, et pourra en déposer une autre.', obligatoire: true, confirmer: 'Retirer' });
            if (!motif) return;
            const r = await fetch(`/api/photos/etudiant/${etudId}`, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ motif }) });
            if (!r.ok) { setMsg((await r.json().catch(() => ({}))).error || 'Refusé.'); return; }
            setMsg(null); setV(x => x + 1);
          }}><IconX size={15} /> Retirer la photo</button>}
        </div>}
      </div>
      {msg && <div className="px-4 pb-3"><Encadre etat="corriger">{msg}</Encadre></div>}
    </section>);
}

export function PhotosAValider({ onFermer }) {
  const [l, setL] = useState(null);
  const [msg, setMsg] = useState(null);
  const charger = () => fetch('/api/photos/a-valider', { headers: authHeaders() }).then(r => r.json()).then(x => setL(Array.isArray(x) ? x : [])).catch(() => setL([]));
  useEffect(() => { charger(); }, []);
  return (
    <Fenetre icone={IconCamera} titre="Photos d’identité à valider" sous="Déposées par les étudiants depuis leur espace. Acceptée, la photo va sur la fiche ; refusée, l’étudiant lit le motif." large="grande" onFermer={onFermer}>
      {msg && <Encadre etat="corriger">{msg}</Encadre>}
      {l == null ? <div className="text-slate-400 text-sm">Chargement…</div>
        : !l.length ? <p className="text-sm text-slate-500">Aucune photo n’attend.</p>
        : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{l.map(p => (
          <div key={p.id} className="space-y-2 text-sm">
            <ImageAuth src={`/api/photos/fichier/${p.id}`} alt={p.nom} className="w-full aspect-[3/4] object-cover rounded-champ border border-slate-200" />
            <div className="font-medium truncate">{p.nom}</div>
            <div className="text-second text-slate-500">{p.id_ecampus || ''} · {String(p.depose_le).slice(0, 10).split('-').reverse().join('/')}{p.a_deja ? ' · remplace une photo' : ''}</div>
            <div className="flex gap-2">
              <button type="button" className="bouton bouton-fort" onClick={async () => { try { if (await decider(p.id, true)) charger(); } catch (x) { setMsg(x.message); } }}><IconCheck size={15} /> Accepter</button>
              <button type="button" className="bouton" onClick={async () => { try { if (await decider(p.id, false)) charger(); } catch (x) { setMsg(x.message); } }}><IconX size={15} /> Refuser</button>
            </div>
          </div>))}</div>}
    </Fenetre>);
}

export function Trombinoscope({ cours }) {
  const [d, setD] = useState(null);
  useEffect(() => { fetch(`/api/photos/cours/${encodeURIComponent(cours)}`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : { etudiants: [] })).then(setD).catch(() => setD({ etudiants: [] })); }, [cours]);
  if (!d) return <div className="text-slate-400 text-sm">Chargement…</div>;
  if (!d.etudiants.length) return <p className="text-sm text-slate-500">Aucun étudiant dans ce cours.</p>;
  const sans = d.etudiants.filter(e => !e.photo).length;
  return (
    <div className="space-y-2">
      {sans > 0 && <p className="text-second text-slate-500">{sans} étudiant(s) n’ont pas encore de photo validée.</p>}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-3">{d.etudiants.map(e => (
        <figure key={e.id} className="text-center">
          {e.photo ? <ImageAuth src={`/api/photos/cours/${encodeURIComponent(cours)}/etudiant/${e.id}`} alt={e.nom} className="w-full aspect-[3/4] object-cover rounded-champ border border-slate-200" />
            : <div className="w-full aspect-[3/4] rounded-champ border border-dashed border-slate-300 flex items-center justify-center text-slate-300"><IconCamera size={22} /></div>}
          <figcaption className="text-second mt-1 leading-tight">{e.nom}</figcaption>
        </figure>))}</div>
    </div>);
}

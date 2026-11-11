/* MON AMÉNAGEMENT RAISONNABLE (3.5.235, Charles, 8 novembre 2026 : « qu'un étudiant puisse compléter la demande d'aménagement
 * raisonnable, annexe 1, depuis son espace si le délai est ok ; sinon noter : contacter Madame Audrey Perez, et un champ d'envoi de
 * message »). Le délai : au moins 10 jours ouvrables avant l'ouverture de l'unité (AGCF du 5 juillet 2017, art. 4 § 1er ; circulaire
 * 9448). Dans le délai : la demande (cadre A) et sa pièce ; hors délai, ou pour une question : un message à la personne de référence.
 * Le portail note, Lucie juge et écrit (lib/portailAmenagements.js). */
import { useCallback, useEffect, useRef, useState } from 'react';
import ChargementLucie from '../components/ChargementLucie.jsx';
import { IconUpload, IconCheck, IconClock, IconAlertTriangle, IconSend } from '@tabler/icons-react';

const jourFr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const enBase64 = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = ko; r.readAsDataURL(f); });

export default function MonAmenagement({ appel, onErreur }) {
  const [p, setP] = useState(null);
  const [ues, setUes] = useState(new Set());
  const [mesures, setMesures] = useState(new Set());
  const [f, setF] = useState({ autres: '', besoins: '', soins: '', piece_type: '', piece_date: '', piece_auteur: '' });
  const [fichier, setFichier] = useState(null);
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);
  const charger = useCallback(() => appel('GET', '/amenagement').then(setP).catch(onErreur), [appel, onErreur]);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { if (!p?.gestes?.some(g => !g.releve_le)) return undefined; const t = setTimeout(charger, 4000); return () => clearTimeout(t); }, [p, charger]);

  if (!p) return <ChargementLucie />;
  if (!p.pret || !p.ar) return <div className="carte px-4 py-3 text-sm text-slate-600">Vos informations arrivent de l’école : revenez dans quelques minutes.</div>;
  const ar = p.ar;
  const ref = ar.referente?.nom || 'la personne de référence';
  const dansDelai = ar.ues.filter(u => u.dans_delai);
  const enAttente = (p.gestes || []).some(g => !g.releve_le);

  async function deposer() {
    if (fichier && fichier.size > 10 * 1024 * 1024) { onErreur(new Error('Fichier trop lourd (10 Mo au plus).')); return; }
    setEnvoi(true);
    try {
      await appel('POST', '/amenagement', { type: 'demande', ues: [...ues], mesures: [...mesures], ...f, nom: fichier?.name, fichier: fichier ? await enBase64(fichier) : null });
      setFichier(null); if (champ.current) champ.current.value = '';
      charger();
    } catch (e) { onErreur(e); } finally { setEnvoi(false); }
  }
  async function ecrire() {
    if (!message.trim()) return;
    setEnvoi(true);
    try { await appel('POST', '/amenagement', { type: 'message', texte: message }); setMessage(''); charger(); }
    catch (e) { onErreur(e); } finally { setEnvoi(false); }
  }
  const basculer = (set, v) => set(s => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const parMoment = ar.mesures.reduce((m, x) => ((m[x.moment || 'Autres'] ||= []).push(x), m), {});
  const pret = ues.size && (mesures.size || f.autres.trim()) && f.besoins.trim() && f.piece_type && fichier;

  return (
    <div className="space-y-4">
      {/* L'ÉTAT DE SA DEMANDE */}
      {ar.dossier ? (
        <div className="carte px-4 py-3 space-y-2">
          <h2 className="titre-carte m-0">Ma demande d’aménagement raisonnable — {ar.annee}</h2>
          <p className="text-sm text-slate-600 m-0">Introduite le {jourFr(ar.dossier.date_demande)}{ar.dossier.ues?.length ? ` pour les unités ${ar.dossier.ues.join(', ')}` : ''}.
            {' '}{ar.dossier.notifie_le ? `Décision notifiée le ${jourFr(ar.dossier.notifie_le)}.` : 'Elle est à l’examen : la décision motivée du Conseil des études vous sera adressée.'}</p>
          {ar.dossier.mesures?.length > 0 && <ul className="m-0 pl-5 text-sm">{ar.dossier.mesures.map((m, i) => (
            <li key={i}>{m.libelle}{m.precisions ? ` — ${m.precisions}` : ''} : <b>{m.accorde ? 'accordé' : 'non accordé'}</b>{!m.accorde && m.motif_refus ? ` (${m.motif_refus})` : ''}</li>))}</ul>}
        </div>
      ) : dansDelai.length ? (
        <div className="carte px-4 py-3 space-y-4">
          <div>
            <h2 className="titre-carte m-0">Demander un aménagement raisonnable — {ar.annee}</h2>
            <p className="text-sm text-slate-600 m-0 mt-1">La demande se remet au moins <b>10 jours ouvrables avant l’ouverture</b> de l’unité concernée. Elle est examinée par le Conseil des études, qui vous adresse une décision motivée ; {ref} vous accompagne.</p>
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-semibold">1. Les unités concernées</div>
            {ar.ues.map(u => (
              <label key={u.ue_num} className={`flex items-start gap-2 text-sm ${u.dans_delai ? '' : 'text-slate-400'}`}>
                <input type="checkbox" className="mt-1" disabled={!u.dans_delai} checked={ues.has(u.ue_num)} onChange={() => basculer(setUes, u.ue_num)} />
                <span>UE {u.ue_num} — {u.ue_nom}{u.ouverture ? <span className="text-slate-500"> · ouvre le {jourFr(u.ouverture)}{u.dans_delai ? `, demande jusqu’au ${jourFr(u.limite)}` : ' · délai dépassé : écrivez ci-dessous'}</span> : ' · date d’ouverture à venir'}</span>
              </label>))}
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-semibold">2. Les aménagements que vous demandez</div>
            {Object.entries(parMoment).map(([mo, l]) => (
              <div key={mo}><div className="text-second text-slate-500 uppercase tracking-wide mt-1">{mo}</div>
                {l.map(m => <label key={m.code} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={mesures.has(m.code)} onChange={() => basculer(setMesures, m.code)} /><span>{m.libelle}</span></label>)}</div>))}
            <textarea className="controle w-full !h-auto py-2" rows={2} placeholder="Autre aménagement (facultatif)" value={f.autres} onChange={e => setF(x => ({ ...x, autres: e.target.value }))} />
          </div>
          <label className="block text-sm"><div className="font-semibold mb-1">3. Les difficultés qui entravent votre parcours</div>
            <textarea className="controle w-full !h-auto py-2" rows={3} value={f.besoins} onChange={e => setF(x => ({ ...x, besoins: e.target.value }))} /></label>
          <label className="block text-sm"><div className="mb-1">Soins spécifiques nécessaires pendant les cours ou les épreuves (facultatif)</div>
            <textarea className="controle w-full !h-auto py-2" rows={2} value={f.soins} onChange={e => setF(x => ({ ...x, soins: e.target.value }))} /></label>
          <div className="space-y-2 text-sm">
            <div className="font-semibold">4. La pièce à l’appui</div>
            <label className="flex items-start gap-2"><input type="radio" name="piece" className="mt-1" checked={f.piece_type === 'probant'} onChange={() => setF(x => ({ ...x, piece_type: 'probant' }))} />
              <span>Un document probant : attestation d’une administration publique ou décision judiciaire reconnaissant un handicap, une invalidité, une maladie professionnelle ou un accident ayant entraîné une incapacité permanente.</span></label>
            <label className="flex items-start gap-2"><input type="radio" name="piece" className="mt-1" checked={f.piece_type === 'rapport_specialiste'} onChange={() => setF(x => ({ ...x, piece_type: 'rapport_specialiste' }))} />
              <span>Un rapport d’un spécialiste, de moins de cinq ans.</span></label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-slate-600"><div className="mb-1">Date de la pièce</div><input type="date" className="controle" value={f.piece_date} onChange={e => setF(x => ({ ...x, piece_date: e.target.value }))} /></label>
              <label className="text-slate-600"><div className="mb-1">Délivrée par</div><input className="controle w-56" value={f.piece_auteur} onChange={e => setF(x => ({ ...x, piece_auteur: e.target.value }))} /></label>
              <input ref={champ} type="file" className="hidden" accept="application/pdf,image/jpeg,image/png" onChange={e => setFichier(e.target.files?.[0] || null)} />
              <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => champ.current?.click()}><IconUpload size={15} /> {fichier ? fichier.name : 'Joindre la pièce (PDF, photo)'}</button>
            </div>
            <p className="text-second text-slate-500 m-0">Votre pièce n’est lue que par les personnes qui instruisent les aménagements (secret professionnel).</p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-second text-slate-500">En envoyant, vous datez et signez votre demande.</span>
            <button type="button" className="bouton bouton-fort" disabled={!pret || envoi || enAttente} onClick={deposer}>{envoi ? 'Envoi…' : 'Envoyer ma demande'}</button>
          </div>
        </div>
      ) : (
        <div className="carte px-4 py-3 space-y-1">
          <h2 className="titre-carte m-0">Demander un aménagement raisonnable</h2>
          <p className="text-sm text-slate-600 m-0">{ar.ues.length
            ? <>Le délai de la demande en ligne est passé pour toutes vos unités (10 jours ouvrables avant leur ouverture). Une demande reste possible en cas de circonstances exceptionnelles — inscription, diagnostic ou évolution du handicap survenus après ce délai : <b>contactez {ref}</b>, ci-dessous.</>
            : <>Vous n’êtes inscrit·e à aucune unité cette année : <b>contactez {ref}</b>, ci-dessous.</>}</p>
        </div>
      )}

      {/* ÉCRIRE À LA PERSONNE DE RÉFÉRENCE */}
      <div className="carte px-4 py-3 space-y-2">
        <h2 className="titre-carte m-0">Écrire à {ref}</h2>
        <p className="text-sm text-slate-600 m-0">Une question, une demande hors délai, une situation qui change : votre message lui parvient dans Lucie ; elle vous répond dans vos messages.</p>
        <textarea className="controle w-full !h-auto py-2" rows={3} value={message} onChange={e => setMessage(e.target.value)} />
        <div className="flex justify-end"><button type="button" className="bouton inline-flex items-center gap-1.5" disabled={!message.trim() || envoi} onClick={ecrire}><IconSend size={15} /> Envoyer le message</button></div>
      </div>

      {(p.gestes || []).length > 0 && (
        <div className="carte px-4 py-3 space-y-1.5">
          <h2 className="titre-carte m-0">Mes envois</h2>
          {p.gestes.map(g => (
            <div key={g.id} className="flex items-start gap-2 text-sm">
              {!g.releve_le ? <IconClock size={16} className="text-slate-400 mt-0.5" /> : g.erreur ? <IconAlertTriangle size={16} className="mt-0.5" style={{ color: 'var(--c-refuse)' }} /> : <IconCheck size={16} className="mt-0.5" style={{ color: 'var(--c-reussi)' }} />}
              <span>{g.type === 'message' ? 'Message' : 'Demande'} du {jourFr(g.cree_le)} — {!g.releve_le ? 'en cours de transmission…' : g.erreur || g.resultat || 'transmis.'}</span>
            </div>))}
        </div>)}
    </div>);
}

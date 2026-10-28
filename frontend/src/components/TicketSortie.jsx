/**
 * LE TICKET DE SORTIE, CÔTÉ PROFESSEUR (28 octobre 2026). Depuis « Ma journée » :
 * composer deux ou trois questions (des questions proposées d'office), projeter le
 * QR — il change comme celui de la présence —, voir les réponses arriver, fermer.
 * Anonyme par défaut ; nominatif, un QCM qui porte sa bonne réponse se verse dans le
 * carnet de cotes. Serveur : `routes/ticketSortie.js`, métier `lib/ticketSortie.js`.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { IconX, IconMaximize, IconPlus, IconTrash, IconNotebook } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { demander, informer } from '../lib/dialogue.jsx';

const hm = t => String(t || '').slice(0, 5);
async function appel(chemin, options = {}) {
  const r = await fetch(chemin, { ...options, headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

function Barres({ valeurs, etiquettes, bonne = null }) {
  const max = Math.max(1, ...valeurs);
  return (
    <div className="space-y-1">
      {valeurs.map((v, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-40 shrink-0 truncate" title={etiquettes[i]}>{etiquettes[i]}{bonne === i ? ' ✓' : ''}</span>
          <div className="flex-1 h-5 rounded-champ bg-slate-100 overflow-hidden">
            <div className="h-full" style={{ width: `${(v / max) * 100}%`, background: bonne === i ? 'var(--c-reussi)' : 'var(--c-principal, #16406A)' }} />
          </div>
          <span className="w-8 text-right tabular-nums">{v}</span>
        </div>))}
    </div>
  );
}

function Resultats({ r }) {
  if (!r) return null;
  return (
    <div className="space-y-4">
      {r.questions.map((q, i) => (
        <div key={i} className="carte px-4 py-3 space-y-2">
          <div className="font-semibold">{q.texte} <span className="text-second text-slate-500 font-normal">· {q.n} réponse(s)</span></div>
          {q.type === 'echelle' && <>
            <Barres valeurs={q.distribution} etiquettes={['1', '2', '3', '4', '5'].map((k, j) => (j === 0 ? `1 — ${q.bornes?.[0] || ''}` : j === 4 ? `5 — ${q.bornes?.[1] || ''}` : k))} />
            {q.moyenne != null && <div className="text-second text-slate-600">Moyenne : <b>{String(q.moyenne).replace('.', ',')}</b> / 5</div>}
          </>}
          {q.type === 'choix' && <>
            <Barres valeurs={q.distribution} etiquettes={q.options} bonne={q.bonne} />
            {q.reussite != null && <div className="text-second text-slate-600">Bonne réponse : <b>{q.reussite} %</b></div>}
          </>}
          {q.type === 'texte' && (
            q.textes?.length ? <ul className="m-0 pl-4 space-y-1 text-sm">{q.textes.map((t, k) => <li key={k}>{t.texte}{t.nom ? <span className="text-slate-500"> — {t.nom}</span> : null}</li>)}</ul>
              : <div className="text-second text-slate-500">Pas encore de réponse.</div>)}
        </div>))}
    </div>
  );
}

function Composer({ depart, types, max, onProjeter, onAnnuler }) {
  const [qs, setQs] = useState(depart.questions.map(q => ({ ...q, optionsTexte: (q.options || []).join('\n') })));
  const [anonyme, setAnonyme] = useState(depart.anonyme);
  const [erreur, setErreur] = useState(null);
  const maj = (i, x) => setQs(l => l.map((q, k) => (k === i ? { ...q, ...x } : q)));
  const valider = () => {
    const questions = qs.map(q => (q.type === 'choix'
      ? { type: q.type, texte: q.texte, options: String(q.optionsTexte || '').split('\n').map(x => x.trim()).filter(Boolean), bonne: q.bonne === '' || q.bonne == null ? null : Number(q.bonne) }
      : { type: q.type, texte: q.texte, bornes: q.bornes }));
    onProjeter({ questions, anonyme }).catch(e => setErreur(e.message));
  };
  return (
    <div className="w-full max-w-3xl space-y-3 text-left">
      {qs.map((q, i) => (
        <div key={i} className="carte px-4 py-3 space-y-2">
          <div className="flex gap-2 items-center">
            <select className="controle border border-slate-300 rounded-champ bg-white" value={q.type} onChange={e => maj(i, { type: e.target.value })}>
              {Object.entries(types).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input className="controle flex-1 min-w-0 border border-slate-300 rounded-champ bg-white" value={q.texte} maxLength={200}
              onChange={e => maj(i, { texte: e.target.value })} placeholder="La question" />
            <button type="button" className="bouton" title="Retirer" onClick={() => setQs(l => l.filter((_, k) => k !== i))} disabled={qs.length < 2}><IconTrash size={15} /></button>
          </div>
          {q.type === 'choix' && (
            <div className="grid md:grid-cols-[1fr_220px] gap-2">
              <textarea rows={3} className="px-3 py-2 border border-slate-300 rounded-champ bg-white text-sm" data-reponses="non"
                placeholder={'Une réponse possible par ligne\n(2 à 6)'} value={q.optionsTexte || ''} onChange={e => maj(i, { optionsTexte: e.target.value })} />
              <label className="text-second text-slate-600">Bonne réponse (facultatif)
                <select className="controle w-full border border-slate-300 rounded-champ bg-white mt-1" value={q.bonne ?? ''} onChange={e => maj(i, { bonne: e.target.value })}>
                  <option value="">— aucune —</option>
                  {String(q.optionsTexte || '').split('\n').map(x => x.trim()).filter(Boolean).map((o, k) => <option key={k} value={k}>{o}</option>)}
                </select></label>
            </div>)}
        </div>))}
      <div className="flex flex-wrap items-center gap-3">
        {qs.length < max && <button type="button" className="bouton" onClick={() => setQs(l => [...l, { type: 'choix', texte: '', optionsTexte: '', bonne: '' }])}><IconPlus size={15} /> Question</button>}
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={anonyme} onChange={e => setAnonyme(e.target.checked)} />
          Anonyme (recommandé) — décoché, vous voyez les noms et le QCM peut aller au carnet</label>
        <span className="flex-1" />
        <span className="text-sm" style={{ color: 'var(--c-refuse)' }}>{erreur}</span>
        {onAnnuler && <button type="button" className="bouton" onClick={onAnnuler}>Annuler</button>}
        <button type="button" className="bouton bouton-fort" onClick={valider}>Projeter le ticket</button>
      </div>
    </div>
  );
}

export default function TicketSortie({ seance, onFermer }) {
  const base = `/api/mes-cours/ticket/${encodeURIComponent(seance.cours_code)}/${seance.id}`;
  const boite = useRef(null); const toile = useRef(null);
  const [info, setInfo] = useState(null);       // { types, max, defaut, ticket, resultats }
  const [mode, setMode] = useState('charge');   // charge | composer | projeter | resultats
  const [jeton, setJeton] = useState(null);
  const [r, setR] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    appel(base).then(j => { setInfo(j); setR(j.resultats); setMode(!j.ticket ? 'composer' : j.resultats?.ouvert ? 'projeter' : 'resultats'); })
      .catch(e => setErreur(e.message));
  }, [base]);

  // Le QR tourne tant qu'on projette ; les résultats suivent.
  useEffect(() => {
    if (mode !== 'projeter') return undefined;
    let vivant = true, t = null;
    const tourner = async () => {
      try { const j = await appel(`${base}/qr`); if (!vivant) return; setJeton(j.jeton); setR(j.resultats); setErreur(null); t = setTimeout(tourner, (j.rotation_s || 15) * 1000); }
      catch (e) { if (vivant) { setErreur(e.message); setMode('resultats'); } }
    };
    tourner();
    const suivi = setInterval(() => appel(`${base}/resultats`).then(x => vivant && setR(x)).catch(() => {}), 3000);
    return () => { vivant = false; clearTimeout(t); clearInterval(suivi); };
  }, [mode, base]);

  useEffect(() => {
    if (mode !== 'projeter' || !jeton || !toile.current) return;
    const taille = Math.min(window.innerWidth * 0.45, window.innerHeight * 0.6);
    QRCode.toCanvas(toile.current, `${window.location.origin}/presence/${encodeURIComponent(jeton)}`, { width: Math.round(taille), margin: 2, errorCorrectionLevel: 'M' });
  }, [jeton, mode]);

  useEffect(() => {
    const f = e => { if (e.key === 'Escape' && !document.fullscreenElement) onFermer(); };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, [onFermer]);

  const projeter = async ({ questions, anonyme }) => {
    const j = await appel(base, { method: 'PUT', body: JSON.stringify({ questions, anonyme }) });
    setInfo(i => ({ ...i, ticket: { questions, anonyme } })); setR(j.resultats); setMode('projeter');
  };
  const fermer = async () => {
    if (!(await demander({ titre: 'Fermer le ticket ?', message: 'Les étudiants ne pourront plus répondre. Les réponses restent.', confirmer: 'Fermer le ticket' }))) return;
    try { const j = await appel(`${base}/fermer`, { method: 'POST' }); setR(j.resultats); setMode('resultats'); } catch (e) { setErreur(e.message); }
  };
  const versCarnet = async () => {
    try { const j = await appel(`${base}/carnet`, { method: 'POST' }); informer({ titre: 'Versé au carnet', ton: 'reussi', message: `« ${j.intitule} » : ${j.notes} note(s) sur ${j.sur}, dans le carnet de ce cours.` }); }
    catch (e) { informer(`❌ ${e.message}`); }
  };
  const qcmNote = info?.ticket && !info.ticket.anonyme && info.ticket.questions.some(q => q.type === 'choix' && q.bonne != null);

  return createPortal(
    <div ref={boite} className="fixed inset-0 z-[200] bg-white overflow-auto">
      <div className="sticky top-0 bg-white flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-200">
        <div className="mr-auto">
          <div className="text-lg font-bold text-iip-texte">Ticket de sortie · {seance.cours_code}{seance.matiere ? ` · ${seance.matiere}` : ''}</div>
          <div className="text-sm text-slate-500">{hm(seance.heure_debut)}–{hm(seance.heure_fin)}{r ? ` · ${r.reponses} réponse(s) sur ${r.attendus}` : ''}{r?.anonyme === false ? ' · nominatif' : ''}</div>
        </div>
        {mode === 'projeter' && <button type="button" className="bouton" onClick={() => setMode('resultats')}>Voir les résultats</button>}
        {mode === 'resultats' && r?.ouvert && <button type="button" className="bouton" onClick={() => setMode('projeter')}>Projeter le QR</button>}
        {(mode === 'projeter' || mode === 'resultats') && r && !r.reponses && <button type="button" className="bouton" onClick={() => setMode('composer')}>Modifier les questions</button>}
        {qcmNote && mode === 'resultats' && <button type="button" className="bouton" onClick={versCarnet}><IconNotebook size={15} /> Verser le QCM au carnet</button>}
        {r?.ouvert && mode !== 'composer' && <button type="button" className="bouton" onClick={fermer}>Fermer le ticket</button>}
        <button type="button" onClick={() => boite.current?.requestFullscreen?.().catch(() => {})} className="bouton" title="Plein écran"><IconMaximize size={16} /></button>
        <button type="button" onClick={onFermer} className="bouton" title="Fermer (Échap)"><IconX size={16} /></button>
      </div>
      <div className="flex flex-col items-center gap-4 p-6">
        {erreur && <div className="text-base" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}
        {mode === 'charge' && !erreur && <p className="text-slate-400">Chargement…</p>}
        {mode === 'composer' && info && (
          <Composer depart={info.ticket || { questions: info.defaut, anonyme: true }} types={info.types} max={info.max}
            onProjeter={projeter} onAnnuler={info.ticket ? () => setMode(r?.ouvert ? 'projeter' : 'resultats') : null} />)}
        {mode === 'projeter' && <>
          <div className="text-lg text-slate-600">Scannez pour répondre — votre téléphone lié à la présence suffit</div>
          <canvas ref={toile} className={jeton ? '' : 'invisible'} />
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold tabular-nums text-iip-texte">{r?.reponses ?? 0} / {r?.attendus ?? '–'}</span>
            <span className="text-xl text-slate-600">réponses</span>
          </div>
        </>}
        {mode === 'resultats' && <div className="w-full max-w-3xl"><Resultats r={r} />
          {r && !r.ouvert && <p className="text-second text-slate-500 mt-3">Le ticket est fermé : il reste lisible ici, depuis Ma journée.</p>}</div>}
      </div>
    </div>, document.body);
}

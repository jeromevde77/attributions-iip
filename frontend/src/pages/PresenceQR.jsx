import { useEffect, useState } from 'react';

/**
 * LA PRÉSENCE PAR QR CODE, CÔTÉ ÉTUDIANT (28 octobre 2026).
 *
 * Hors session du personnel : l'étudiant n'a pas de compte Lucie. Il arrive
 * ici en scannant le QR projeté (/presence/<jeton>). Son téléphone, une fois
 * appairé, porte un cookie httpOnly que la page ne voit jamais : le serveur
 * le lit. Trois temps la première fois — l'adresse d'école, le code reçu, la
 * présence ; un seul ensuite. Serveur : routes/presenceQr.js.
 */
async function appel(chemin, corps) {
  const r = await fetch(`/api/presence-qr${chemin}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', body: JSON.stringify(corps),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || j.error || `Erreur ${r.status}`), { code: j.erreur });
  return j;
}

const Tete = () => (
  <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-lg bg-iip-blue text-white grid place-items-center text-second font-extrabold">IIP</div>
    <div className="leading-tight">
      <div className="text-sm font-bold text-iip-texte">Institut Ilya Prigogine</div>
      <div className="text-xs text-slate-500">Présence au cours</div>
    </div>
  </div>
);

/* LE QR PROJETÉ PEUT ÊTRE CELUI DU TICKET DE SORTIE (préfixe « x ») : même adresse,
   même téléphone lié, une autre page. */
export default function PresenceQR() {
  const [jeton] = useState(() => decodeURIComponent(window.location.pathname.split('/presence/')[1] || ''));
  return jeton.startsWith('x.') ? <TicketEtudiant jeton={jeton} /> : <PresenceSeance />;
}

/** LE TICKET DE SORTIE, CÔTÉ ÉTUDIANT : deux ou trois questions, une minute. */
function TicketEtudiant({ jeton }) {
  const [etat, setEtat] = useState(null);        // { ticket, cours, questions, anonyme } | { deja, message }
  const [reponses, setReponses] = useState([]);
  const [fini, setFini] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, '', '/presence');
    appel('/ticket/ouvrir', { jeton }).then(j => { if (j.deja) setFini(j.message); else { setEtat(j); setReponses(j.questions.map(() => null)); } })
      .catch(e => setErreur(e.message));
  }, [jeton]);
  const poser = (i, v) => setReponses(r => r.map((x, k) => (k === i ? v : x)));
  const envoyer = async ev => {
    ev.preventDefault(); setOccupe(true); setErreur(null);
    try { const j = await appel('/ticket/repondre', { ticket: etat.ticket, reponses }); setFini(j.message); }
    catch (e) { setErreur(e.message); } finally { setOccupe(false); }
  };
  const vide = reponses.every(v => v === null || v === '');
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-fond, #F6F7F9)' }}>
      <Tete />
      <main className="max-w-md mx-auto px-5 py-6 space-y-4">
        {!etat && !fini && !erreur && <p className="text-slate-500 text-center py-10">Un instant…</p>}
        {fini && (
          <div className="bloc-etat px-4 py-5 text-center" data-etat="reussi">
            <div className="text-4xl mb-2" style={{ color: 'var(--c-reussi)' }}>✓</div>
            <div className="text-base font-semibold text-iip-texte">{fini}</div>
            <div className="text-sm text-slate-500 mt-2">Vous pouvez fermer cette page.</div>
          </div>)}
        {erreur && !etat && (
          <div className="bloc-etat px-4 py-5" data-etat="corriger">
            <div className="text-base font-semibold text-iip-texte">Ticket de sortie</div>
            <div className="text-sm text-slate-600 mt-1">{erreur}</div>
          </div>)}
        {etat && !fini && (
          <form onSubmit={envoyer} className="space-y-5">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Ticket de sortie</div>
              <div className="text-base font-semibold text-iip-texte">{etat.cours}</div>
              <div className="text-sm text-slate-500">{etat.anonyme ? 'Vos réponses sont anonymes pour l’enseignant.' : 'L’enseignant voit vos réponses à votre nom.'}</div>
            </div>
            {etat.questions.map((q, i) => (
              <div key={i} className="space-y-2">
                <div className="text-base font-semibold text-iip-texte">{q.texte}</div>
                {q.type === 'echelle' && (
                  <div>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} type="button" onClick={() => poser(i, n)}
                          className={`h-12 rounded-champ border text-lg font-semibold ${reponses[i] === n ? 'bg-iip-blue text-white border-transparent' : 'bg-white border-slate-300 text-iip-texte'}`}>{n}</button>))}
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1"><span>{q.bornes?.[0]}</span><span>{q.bornes?.[1]}</span></div>
                  </div>)}
                {q.type === 'choix' && (
                  <div className="space-y-1.5">
                    {q.options.map((o, k) => (
                      <button key={k} type="button" onClick={() => poser(i, k)}
                        className={`w-full text-left px-3 py-3 rounded-champ border text-base ${reponses[i] === k ? 'bg-iip-blue text-white border-transparent' : 'bg-white border-slate-300 text-iip-texte'}`}>{o}</button>))}
                  </div>)}
                {q.type === 'texte' && (
                  <textarea rows={3} maxLength={500} value={reponses[i] || ''} onChange={e => poser(i, e.target.value)} data-reponses="non"
                    className="w-full px-3 py-2 rounded-champ border border-slate-300 bg-white text-base" />)}
              </div>))}
            {erreur && <p className="text-sm m-0" style={{ color: 'var(--c-refuse)' }}>{erreur}</p>}
            <button type="submit" disabled={occupe || vide} className="w-full h-12 rounded-champ bg-iip-blue text-white font-semibold disabled:opacity-50">
              {occupe ? 'Envoi…' : 'Envoyer'}</button>
          </form>)}
      </main>
    </div>
  );
}

function PresenceSeance() {
  // Le jeton du QR : on le lit, puis on l'efface de l'adresse — il ne vaut que 30 s.
  const [jeton] = useState(() => decodeURIComponent(window.location.pathname.split('/presence/')[1] || ''));
  const [etape, setEtape] = useState('scan');        // scan | adresse | code | fait | erreur
  const [ticket, setTicket] = useState(null);
  const [seance, setSeance] = useState('');
  const [domaines, setDomaines] = useState([]);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [envoyeA, setEnvoyeA] = useState('');
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, '', '/presence');
    (async () => {
      try {
        const j = await appel('/scan', { jeton });
        if (j.enregistre) { setMessage(j.message); setEtape('fait'); return; }
        setTicket(j.ticket); setSeance(j.seance); setDomaines(j.domaines || []); setEtape('adresse');
      } catch (e) { setErreur(e.message); setEtape('erreur'); }
    })();
  }, [jeton]);

  const envoyerAdresse = async ev => {
    ev.preventDefault();
    setOccupe(true); setErreur(null);
    try { const j = await appel('/code', { ticket, email }); setEnvoyeA(j.envoye_a); setEtape('code'); }
    catch (e) { setErreur(e.message); if (e.code === 'ticket_expire') setEtape('erreur'); }
    finally { setOccupe(false); }
  };
  const envoyerCode = async ev => {
    ev.preventDefault();
    setOccupe(true); setErreur(null);
    try { const j = await appel('/valider', { ticket, email, code }); setMessage(j.message); setEtape('fait'); }
    catch (e) { setErreur(e.message); if (['ticket_expire', 'non_inscrit', 'appareil_autre'].includes(e.code)) setEtape('erreur'); }
    finally { setOccupe(false); }
  };

  const champ = 'w-full h-12 px-3 rounded-champ border border-slate-300 bg-white text-base';
  const bouton = 'w-full h-12 rounded-champ bg-iip-blue text-white font-semibold disabled:opacity-50';
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-fond, #F6F7F9)' }}>
      <Tete />
      <main className="max-w-md mx-auto px-5 py-6 space-y-4">
        {etape === 'scan' && <p className="text-slate-500 text-center py-10">Un instant…</p>}

        {etape === 'fait' && (
          <div className="bloc-etat px-4 py-5 text-center" data-etat="reussi">
            <div className="text-4xl mb-2" style={{ color: 'var(--c-reussi)' }}>✓</div>
            <div className="text-base font-semibold text-iip-texte">{message}</div>
            <div className="text-sm text-slate-500 mt-2">Vous pouvez fermer cette page.</div>
          </div>
        )}

        {etape === 'erreur' && (
          <div className="bloc-etat px-4 py-5" data-etat="corriger">
            <div className="text-base font-semibold text-iip-texte">Présence non enregistrée</div>
            <div className="text-sm text-slate-600 mt-1">{erreur}</div>
          </div>
        )}

        {etape === 'adresse' && (
          <form onSubmit={envoyerAdresse} className="space-y-3">
            <div>
              <div className="text-base font-semibold text-iip-texte">{seance}</div>
              <p className="text-sm text-slate-600 mt-1">
                Première fois sur ce téléphone : indiquez votre adresse d’école. Un code à six chiffres
                vous y sera envoyé. Ensuite, un scan suffira.
              </p>
            </div>
            <input type="email" inputMode="email" autoComplete="email" required value={email}
              onChange={e => setEmail(e.target.value)} className={champ}
              placeholder={domaines.length ? `prenom.nom@${domaines[0]}` : 'Adresse d’école'} />
            {erreur && <p className="text-sm m-0" style={{ color: 'var(--c-refuse)' }}>{erreur}</p>}
            <button type="submit" disabled={occupe || !email.trim()} className={bouton}>
              {occupe ? 'Envoi…' : 'Recevoir mon code'}
            </button>
          </form>
        )}

        {etape === 'code' && (
          <form onSubmit={envoyerCode} className="space-y-3">
            <p className="text-sm text-slate-600 m-0">
              Un code a été envoyé à <b>{envoyeA}</b>. Il est valable 10 minutes.
            </p>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${champ} text-center text-2xl tracking-[0.4em] font-semibold`} placeholder="••••••" />
            {erreur && <p className="text-sm m-0" style={{ color: 'var(--c-refuse)' }}>{erreur}</p>}
            <button type="submit" disabled={occupe || code.length !== 6} className={bouton}>
              {occupe ? 'Vérification…' : 'Valider et enregistrer ma présence'}
            </button>
            <button type="button" disabled={occupe} onClick={() => { setCode(''); setErreur(null); setEtape('adresse'); }}
              className="w-full text-sm text-slate-500 underline">Recevoir un nouveau code</button>
          </form>
        )}

        <p className="text-xs text-slate-400 text-center pt-4">
          Lucie ne garde de ce téléphone qu’un identifiant chiffré et son type (« iPhone · Safari »), jusqu’à la fin de
          l’année académique. Aucune localisation.
        </p>
      </main>
    </div>
  );
}

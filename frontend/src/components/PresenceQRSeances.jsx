/**
 * LA PRÉSENCE PAR QR, CÔTÉ PROFESSEUR (28 octobre 2026).
 *
 * « La chose la plus simple possible pour le prof » (Charles) : il n'a pas à
 * chercher sa séance. Les séances du jour paraissent en tête de Mes cours,
 * celle dont la fenêtre est ouverte d'abord, avec UN bouton. Le bouton ouvre
 * le QR en plein écran, à projeter : il change toutes les 15 s, et le
 * compteur « X / Y présents » se met à jour tout seul.
 *
 * LE PLEIN ÉCRAN N'EST PAS UNE FENÊTRE (`Fenetre`) : c'est ce que voit la
 * classe, sans voile ni cadre, et le navigateur peut le passer en plein écran.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { IconQrcode, IconX, IconMaximize } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

const hm = t => String(t || '').slice(0, 5);

export default function PresenceQRSeances() {
  const [seances, setSeances] = useState([]);
  const [ouverte, setOuverte] = useState(null);
  useEffect(() => {
    let vivant = true;
    const lire = () => fetch('/api/mes-cours/qr/seances-du-jour', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { seances: [] }))
      .then(j => { if (vivant) setSeances(j.seances || []); })
      .catch(() => {});
    lire();
    // La fenêtre s'ouvre et se ferme avec l'heure : on relit chaque minute.
    const id = setInterval(lire, 60e3);
    return () => { vivant = false; clearInterval(id); };
  }, []);
  if (!seances.length) return null;
  return (
    <div className="carte px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <IconQrcode size={18} className="text-iip-blue" />
        <h2 className="titre-carte m-0">Présences du jour</h2>
        <span className="text-second text-slate-500">les étudiants scannent le QR avec leur téléphone</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {seances.map(s => (
          <button key={s.id} type="button" onClick={() => setOuverte(s)}
            className={`bouton text-left ${s.fenetre?.ouverte ? 'bouton-fort' : ''}`} style={{ height: 'auto', paddingBlock: '6px' }}
            title={s.fenetre?.ouverte ? 'Le scan est ouvert maintenant' : `Scan ouvert de ${s.fenetre?.ouvre} à ${s.fenetre?.ferme}`}>
            <span className="font-semibold">Afficher le QR</span>
            <span className="block text-second">{s.cours_code}{s.matiere ? ` · ${s.matiere}` : ''} · {hm(s.heure_debut)}–{hm(s.heure_fin)}
              {s.sous_groupe ? ` · gr. ${s.sous_groupe}` : ''}</span>
          </button>
        ))}
      </div>
      {ouverte && <ProjectionQR seance={ouverte} onFermer={() => setOuverte(null)} />}
    </div>
  );
}

function ProjectionQR({ seance, onFermer }) {
  const toile = useRef(null);
  const boite = useRef(null);
  const [etat, setEtat] = useState(null);       // { jeton, rotation_s, fenetre, compteur }
  const [compteur, setCompteur] = useState(null);
  const [erreur, setErreur] = useState(null);
  const base = `/api/mes-cours/${encodeURIComponent(seance.cours_code)}/qr/${seance.id}`;

  // Le jeton : redemandé à chaque rotation.
  useEffect(() => {
    let vivant = true, minuterie = null;
    const tourner = async () => {
      try {
        const r = await fetch(base, { headers: authHeaders() });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
        if (!vivant) return;
        setEtat(j); setCompteur(j.compteur); setErreur(null);
        minuterie = setTimeout(tourner, (j.rotation_s || 15) * 1000);
      } catch (e) { if (vivant) { setErreur(e.message); minuterie = setTimeout(tourner, 5000); } }
    };
    tourner();
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [base]);

  // Le compteur : toutes les 3 s, plus souvent que le QR.
  useEffect(() => {
    const id = setInterval(() => {
      fetch(`${base}/compteur`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null))
        .then(j => j && setCompteur(j)).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [base]);

  useEffect(() => {
    if (!etat?.jeton || !toile.current) return;
    const taille = Math.min(window.innerWidth * 0.55, window.innerHeight * 0.72);
    QRCode.toCanvas(toile.current, `${window.location.origin}/presence/${encodeURIComponent(etat.jeton)}`,
      { width: Math.round(taille), margin: 2, errorCorrectionLevel: 'M' });
  }, [etat?.jeton]);

  useEffect(() => {
    const f = e => { if (e.key === 'Escape' && !document.fullscreenElement) onFermer(); };
    document.addEventListener('keydown', f);
    return () => document.removeEventListener('keydown', f);
  }, [onFermer]);

  const pleinEcran = () => boite.current?.requestFullscreen?.().catch(() => {});
  const f = etat?.fenetre;
  return createPortal(
    <div ref={boite} className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center gap-4 p-6">
      <div className="absolute top-4 right-4 flex gap-2">
        <button type="button" onClick={pleinEcran} className="bouton" title="Plein écran"><IconMaximize size={16} /> Plein écran</button>
        <button type="button" onClick={onFermer} className="bouton" title="Fermer (Échap)"><IconX size={16} /> Fermer</button>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-iip-texte">{seance.cours_code}{seance.matiere ? ` · ${seance.matiere}` : ''}</div>
        <div className="text-lg text-slate-600">{hm(seance.heure_debut)}–{hm(seance.heure_fin)} · scannez pour noter votre présence</div>
      </div>
      {erreur && <div className="text-lg" style={{ color: 'var(--c-corriger)' }}>{erreur}</div>}
      <canvas ref={toile} className={etat?.jeton ? '' : 'invisible'} />
      <div className="flex items-baseline gap-3">
        <span className="text-5xl font-bold tabular-nums text-iip-texte">{compteur?.presents ?? '–'} / {compteur?.attendus ?? '–'}</span>
        <span className="text-xl text-slate-600">présents</span>
      </div>
      {f && (
        <div className="text-base" style={{ color: f.ouverte ? 'var(--c-reussi)' : 'var(--c-surveiller)' }}>
          {f.ouverte ? `Scan ouvert jusqu’à ${f.ferme}` : f.avant ? `Le scan s’ouvrira à ${f.ouvre}` : `Scan fermé depuis ${f.ferme} — les présences se complètent depuis votre tableau de bord`}
        </div>
      )}
    </div>, document.body);
}

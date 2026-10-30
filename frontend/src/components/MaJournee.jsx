/**
 * MA JOURNÉE — EN TÊTE DE MES COURS (Charles, 28 octobre 2026 : « un aperçu de
 * ses cours du jour sous la forme d'un mini calendrier ; s'il clique dessus, il
 * peut prendre les présences, encoder une note, avoir accès à la liste des
 * étudiants »).
 *
 * La journée à l'échelle du temps : une séance de deux heures est deux fois
 * plus large qu'une d'une heure, et un trait dit « maintenant ». Un clic sur une
 * séance montre ce qu'on peut y faire — le QR, les présences, les notes, la
 * liste. Sur un téléphone, la frise devient une liste : trop étroite, elle ne
 * se lirait plus.
 *
 * LE QR EN PLEIN ÉCRAN N'EST PAS UNE FENÊTRE (`Fenetre`) : c'est ce que voit la
 * classe, sans voile ni cadre, et le navigateur peut le passer en plein écran.
 * Il change toutes les 15 s ; le compteur « X / Y présents » suit tout seul.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import TicketSortie from './TicketSortie.jsx';
import { IconTicket, IconQrcode, IconX, IconMaximize, IconChevronLeft, IconChevronRight, IconCalendarEvent,
  IconUserCheck, IconPencil, IconUsers } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

const hm = t => String(t || '').slice(0, 5);
const min = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const decaler = (jour, n) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const long = jour => new Date(`${jour}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const maintenantMin = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); return Number(p[0].value) * 60 + Number(p[2].value); };

/* Les séances qui se chevauchent prennent chacune leur rang. */
function enRangs(seances) {
  const fins = [];
  return seances.map(s => {
    let r = fins.findIndex(f => f <= min(s.heure_debut));
    if (r < 0) { r = fins.length; fins.push(0); }
    fins[r] = min(s.heure_fin || s.heure_debut) || min(s.heure_debut) + 60;
    return { ...s, rang: r };
  });
}

export default function MaJournee({ onAgir, onSemaine }) {
  const [data, setData] = useState(null);
  const [jour, setJour] = useState(null);           // null : aujourd'hui (le serveur le dit)
  const [choisie, setChoisie] = useState(null);     // id de séance
  const [projetee, setProjetee] = useState(null);
  const [ticket, setTicket] = useState(null);      // le ticket de sortie de la séance
  const [maintenant, setMaintenant] = useState(maintenantMin());

  useEffect(() => {
    let vivant = true;
    const lire = () => fetch(`/api/mes-cours/journee${jour ? `?date=${jour}` : ''}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (!vivant || !j) return;
        setData(j); setMaintenant(maintenantMin());
        // Par défaut, la séance en cours, sinon la prochaine du jour.
        setChoisie(c => (j.seances.some(s => s.id === c) ? c
          : (j.seances.find(s => s.fenetre?.ouverte) || (j.jour === j.aujourdhui
            ? j.seances.find(s => min(s.heure_fin) >= maintenantMin()) : null))?.id ?? null));
      })
      .catch(() => {});
    lire();
    // Les fenêtres s'ouvrent et se ferment avec l'heure : on relit chaque minute.
    const id = setInterval(lire, 60e3);
    return () => { vivant = false; clearInterval(id); };
  }, [jour]);

  if (!data) return null;
  const seances = enRangs(data.seances);
  const estAujourdhui = data.jour === data.aujourdhui;
  const debut = Math.min(8 * 60, ...seances.map(s => min(s.heure_debut))) - 30;
  const fin = Math.max(18 * 60, ...seances.map(s => min(s.heure_fin || s.heure_debut))) + 30;
  const pct = m => `${((m - debut) / (fin - debut)) * 100}%`;
  const heures = []; for (let h = Math.ceil(debut / 60); h * 60 <= fin; h++) heures.push(h);
  const rangs = Math.max(1, ...seances.map(s => s.rang + 1));
  const s = seances.find(x => x.id === choisie) || null;
  const etat = x => (x.annule ? 'indisponible' : x.fenetre?.ouverte ? 'disponible' : 'neutre');

  return (
    <div className="carte px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <IconCalendarEvent size={18} className="text-iip-blue" />
        <h2 className="titre-carte m-0">Ma journée</h2>
        <span className="text-second text-slate-600 first-letter:uppercase">{long(data.jour)}</span>
        {data.essai && (
          <span className="objet-barre objet-barre-etat" style={{ '--e': 'var(--c-attente, #E8890C)' }}
            title="Sur la dev seulement : le QR se projette pour n’importe quelle séance, la date et la fenêtre de scan sont ignorées">mode essai</span>
        )}
        {/* TOUTE LA SEMAINE, D'ICI (3.1.480, Charles : « je ne vois pas où le prof voit son horaire »). */}
        {onSemaine && <button type="button" className="text-second text-iip-blue underline" onClick={onSemaine}>Toute ma semaine</button>}
        <span className="ml-auto segments">
          <button type="button" className="px-2 py-1" title="Jour précédent" onClick={() => setJour(decaler(data.jour, -1))}><IconChevronLeft size={15} /></button>
          <button type="button" className={`px-2.5 py-1 text-second ${estAujourdhui ? 'font-semibold' : ''}`} onClick={() => setJour(null)}>Aujourd’hui</button>
          <button type="button" className="px-2 py-1" title="Jour suivant" onClick={() => setJour(decaler(data.jour, 1))}><IconChevronRight size={15} /></button>
        </span>
      </div>

      {!seances.length && <p className="text-second text-slate-500 m-0">Aucune séance de vos cours dans l’horaire ce jour-là.</p>}

      {/* LA FRISE, sur un écran assez large. */}
      {seances.length > 0 && (
        <div className="hidden sm:block relative" style={{ height: 18 + rangs * 50 }}>
          {heures.map(h => (
            <div key={h} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: pct(h * 60) }}>
              <span className="absolute -top-0.5 left-1 text-mention text-slate-400 tabular-nums">{h} h</span>
            </div>
          ))}
          {estAujourdhui && maintenant > debut && maintenant < fin && (
            <div className="absolute top-0 bottom-0 w-0.5 z-10" style={{ left: pct(maintenant), background: 'var(--c-refuse)' }} title="Maintenant" />
          )}
          {seances.map(x => (
            <button key={x.id} type="button" onClick={() => setChoisie(x.id)} data-etat={etat(x)}
              className={`bloc-etat absolute text-left px-2 py-1 overflow-hidden ${x.id === choisie ? 'ring-2 ring-iip-blue' : ''}`}
              style={{ left: pct(min(x.heure_debut)), width: `calc(${pct(min(x.heure_fin || x.heure_debut) + (x.heure_fin ? 0 : 60))} - ${pct(min(x.heure_debut))} - 3px)`,
                top: 18 + x.rang * 50, height: 46 }}
              title={`${x.cours_code} ${x.cours_nom}${x.matiere ? ` · ${x.matiere}` : ''} — ${hm(x.heure_debut)}–${hm(x.heure_fin)}${x.local ? ` · ${x.local}` : ''}`}>
              <div className={`text-second font-semibold truncate ${x.annule ? 'line-through text-slate-400' : ''}`}>{x.cours_code} · {x.cours_nom || x.matiere}</div>
              <div className="text-mention text-slate-500 truncate">{hm(x.heure_debut)}–{hm(x.heure_fin)}{x.local ? ` · ${x.local}` : ''}{x.sous_groupe ? ` · gr. ${x.sous_groupe}` : ''}</div>
            </button>
          ))}
        </div>
      )}

      {/* LA LISTE, sur un téléphone. */}
      {seances.length > 0 && (
        <div className="sm:hidden space-y-1.5">
          {seances.map(x => (
            <button key={x.id} type="button" onClick={() => setChoisie(x.id)} data-etat={etat(x)}
              className={`bloc-etat w-full text-left px-3 py-2 ${x.id === choisie ? 'ring-2 ring-iip-blue' : ''}`}>
              <div className={`text-sm font-semibold ${x.annule ? 'line-through text-slate-400' : ''}`}>{hm(x.heure_debut)}–{hm(x.heure_fin)} · {x.cours_code} · {x.cours_nom || x.matiere}</div>
              {(x.local || x.sous_groupe) && <div className="text-second text-slate-500">{x.local}{x.sous_groupe ? ` · gr. ${x.sous_groupe}` : ''}</div>}
            </button>
          ))}
        </div>
      )}

      {/* CE QU'ON PEUT FAIRE DE LA SÉANCE CHOISIE. */}
      {s && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-second min-w-0 mr-auto">
            <b>{s.cours_code}</b> {s.cours_nom}{s.matiere ? ` · ${s.matiere}` : ''} · {hm(s.heure_debut)}–{hm(s.heure_fin)}
            {s.annule ? <span className="text-slate-500"> · séance annulée</span>
              : <span className="text-slate-500"> · présences {s.presences.encodees} / {s.presences.attendus}</span>}
          </span>
          {(estAujourdhui || data.essai) && !s.annule && (
            <button type="button" onClick={() => setProjetee(s)} className={`bouton ${s.fenetre?.ouverte ? 'bouton-fort' : ''}`}
              title={s.fenetre?.ouverte ? 'Le scan est ouvert maintenant' : `Scan ouvert de ${s.fenetre?.ouvre} à ${s.fenetre?.ferme}`}>
              <IconQrcode size={16} /> Afficher le QR</button>
          )}
          {!s.annule && (
            <button type="button" className="bouton" onClick={() => onAgir?.('presences', s)}><IconUserCheck size={16} /> Présences</button>
          )}
          {/* LE TICKET DE SORTIE (28 octobre 2026) : deux ou trois questions en fin de séance, par le même QR. */}
          {!s.annule && (
            <button type="button" className="bouton" onClick={() => setTicket(s)} title="Deux ou trois questions en fin de séance, par QR">
              <IconTicket size={16} /> Ticket de sortie</button>
          )}
          <button type="button" className="bouton" onClick={() => onAgir?.('notes', s)}><IconPencil size={16} /> Notes</button>
          <button type="button" className="bouton" onClick={() => onAgir?.('liste', s)}><IconUsers size={16} /> Étudiants</button>
        </div>
      )}
      {projetee && <ProjectionQR seance={projetee} onFermer={() => setProjetee(null)} />}
      {ticket && <TicketSortie seance={ticket} onFermer={() => setTicket(null)} />}
    </div>
  );
}

export function ProjectionQR({ seance, onFermer }) {
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
      {erreur && <div className="text-lg" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}
      <canvas ref={toile} className={etat?.jeton ? '' : 'invisible'} />
      <div className="flex items-baseline gap-3">
        <span className="text-5xl font-bold tabular-nums text-iip-texte">{compteur?.presents ?? '–'} / {compteur?.attendus ?? '–'}</span>
        <span className="text-xl text-slate-600">présents</span>
      </div>
      {etat?.essai && (
        <div className="text-base font-semibold" style={{ color: 'var(--c-attente)' }}>
          Mode essai (dev) : la date et la fenêtre de scan sont ignorées
        </div>
      )}
      {f && !etat?.essai && (
        <div className="text-base" style={{ color: f.ouverte ? 'var(--c-reussi)' : 'var(--c-attente)' }}>
          {f.ouverte ? `Scan ouvert jusqu’à ${f.ferme}` : f.avant ? `Le scan s’ouvrira à ${f.ouvre}` : `Scan fermé depuis ${f.ferme} — les présences se complètent depuis votre tableau de bord`}
        </div>
      )}
    </div>, document.body);
}

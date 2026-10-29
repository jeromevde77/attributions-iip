import { useEffect, useState } from 'react';
import { IconCalendarWeek, IconChevronLeft, IconChevronRight, IconMapPin } from '@tabler/icons-react';
import { Fenetre, Encadre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';

/**
 * MON HORAIRE DE LA SEMAINE (3.1.464, Charles, 29 octobre 2026 : « je veux voir l'horaire »). Mes cours
 * → rail. Les séances de la semaine, lundi → dimanche, À L'ÉCHELLE DU TEMPS : deux heures ont la même
 * hauteur partout. Mêmes séances que Ma journée et les présences (`GET /api/mes-cours/semaine`) — celles
 * qui nomment le professeur. Une séance annulée reste visible, barrée : on la cherchait.
 */
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const min = h => { const [a, b] = String(h || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
const hm = h => String(h || '').slice(0, 5).replace(':', ' h ');
const decaler = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const jjmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);

function Seance({ s, style }) {
  return (
    <div className={`absolute left-1 right-1 rounded-champ border px-2 py-1 overflow-hidden text-left
                     ${s.annule ? 'bg-white border-dashed border-slate-300 text-slate-400 line-through' : 'bg-white border-slate-200'}`}
      style={{ ...style, borderLeft: s.annule ? undefined : '4px solid var(--c-principal)' }}
      title={`${s.cours_nom} — ${hm(s.heure_debut)} à ${hm(s.heure_fin)}${s.local ? ` — ${s.local}` : ''}${s.annule ? ' — annulée' : ''}`}>
      <div className="text-mention tabular-nums text-slate-500">{hm(s.heure_debut)} – {hm(s.heure_fin)}{s.annule && <span className="no-underline"> · annulée</span>}</div>
      <div className="text-second font-semibold text-iip-texte leading-tight">{s.cours_nom || s.cours_code}</div>
      {s.matiere && <div className="text-mention text-slate-500 leading-tight">{s.matiere}{s.sous_groupe ? ` · gr. ${s.sous_groupe}` : ''}</div>}
      {s.local && <div className="text-mention text-slate-500 inline-flex items-center gap-0.5"><IconMapPin size={10} />{s.local}</div>}
    </div>
  );
}

export default function MonHoraireSemaine({ onFermer }) {
  const [date, setDate] = useState(null);       // null : la semaine en cours
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    setErreur(null);
    fetch(`/api/mes-cours/semaine${date ? `?date=${date}` : ''}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture refusée.'); setData(j); })
      .catch(e => setErreur(e.message));
  }, [date]);

  const jours = data?.jours || [];
  const seances = data?.seances || [];
  // Le samedi et le dimanche ne paraissent que s'ils portent une séance.
  const visibles = jours.filter((j, i) => i < 5 || seances.some(s => s.date === j));
  const debut = Math.min(8 * 60, ...seances.map(s => min(s.heure_debut)));
  const fin = Math.max(18 * 60, ...seances.map(s => min(s.heure_fin)));
  const ppm = 0.75;                                   // pixels par minute
  const heures = []; for (let h = Math.ceil(debut / 60); h * 60 <= fin; h++) heures.push(h);

  const barre = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="bouton px-2" onClick={() => setDate(decaler(jours[0] || data?.aujourdhui, -7))} aria-label="Semaine précédente"><IconChevronLeft size={16} /></button>
      <span className="text-sm font-semibold text-iip-texte tabular-nums">
        {jours.length ? `Semaine du ${jjmm(jours[0])} au ${jjmm(jours[6])}` : '…'}</span>
      <button type="button" className="bouton px-2" onClick={() => setDate(decaler(jours[0] || data?.aujourdhui, 7))} aria-label="Semaine suivante"><IconChevronRight size={16} /></button>
      {date && <button type="button" className="text-second text-iip-blue underline" onClick={() => setDate(null)}>cette semaine</button>}
      <span className="ml-auto text-second text-slate-500">{seances.filter(s => !s.annule).length} séance(s)</span>
    </div>
  );

  return (
    <Fenetre icone={IconCalendarWeek} titre="Mon horaire de la semaine" sous="Vos séances dans l’horaire de Lucie" large="grande"
      onFermer={onFermer} pied={<button className="bouton bouton-fort ml-auto" onClick={onFermer}>Fermer</button>}>
      <div className="space-y-3">
        {barre}
        {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
        {data && !data.relie && (
          <Encadre etat="surveiller" titre="Votre compte n’est relié à aucune fiche de professeur">
            Lucie ne peut pas savoir quelles séances sont les vôtres : la direction relie le compte à la fiche (Configuration → Utilisateurs).
          </Encadre>)}
        {data && data.relie && !seances.length && (
          <Encadre etat="neutre" titre="Aucune séance cette semaine">
            Aucune séance de l’horaire ne vous nomme cette semaine. Essayez la semaine suivante, ou demandez au secrétariat de vérifier l’horaire.
          </Encadre>)}

        {seances.length > 0 && (<>
          {/* À L'ÉCHELLE DU TEMPS, sur un écran assez large. */}
          <div className="hidden md:flex">
            <div className="relative flex-none w-10" style={{ height: (fin - debut) * ppm + 28 }}>
              {heures.map(h => (
                <div key={h} className="absolute right-1.5 text-mention text-slate-400 tabular-nums"
                  style={{ top: 28 + (h * 60 - debut) * ppm - 6 }}>{h} h</div>))}
            </div>
            <div className="flex-1 grid gap-1.5 min-w-0" style={{ gridTemplateColumns: `repeat(${visibles.length}, minmax(0, 1fr))` }}>
              {visibles.map(j => {
                const i = jours.indexOf(j);
                const auj = j === data.aujourdhui;
                return (
                  <div key={j} className="min-w-0">
                    <div className={`h-7 text-center text-second font-semibold ${auj ? 'text-iip-blue' : 'text-slate-600'}`}>
                      {JOURS[i]} <span className="font-normal text-slate-400 tabular-nums">{jjmm(j)}</span></div>
                    <div className={`relative rounded-champ border ${auj ? 'border-iip-blue/40' : 'border-slate-200'}`}
                      style={{ height: (fin - debut) * ppm, background: 'rgb(var(--gris-50, 248 250 252))' }}>
                      {heures.map(h => <div key={h} className="absolute left-0 right-0 border-t border-slate-200/70" style={{ top: (h * 60 - debut) * ppm }} />)}
                      {seances.filter(s => s.date === j).map(s => (
                        <Seance key={s.id} s={s} style={{ top: (min(s.heure_debut) - debut) * ppm + 1,
                          height: Math.max(30, (min(s.heure_fin) - min(s.heure_debut)) * ppm - 2) }} />))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sur un téléphone : jour par jour, en liste. */}
          <div className="md:hidden space-y-3">
            {visibles.filter(j => seances.some(s => s.date === j)).map(j => (
              <div key={j}>
                <div className="intertitre mb-1">{JOURS[jours.indexOf(j)]} {jjmm(j)}</div>
                <div className="space-y-1.5">
                  {seances.filter(s => s.date === j).map(s => (
                    <div key={s.id} className="relative" style={{ height: 74 }}><Seance s={s} style={{ top: 0, bottom: 0 }} /></div>))}
                </div>
              </div>))}
          </div>
        </>)}
      </div>
    </Fenetre>
  );
}

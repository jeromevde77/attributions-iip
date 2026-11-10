import { useEffect, useRef, useState } from 'react';
import { IconPlus, IconX } from '@tabler/icons-react';
import { Fenetre, Encadre, PastilleEtat } from './ui.jsx';

/* LA SEMAINE D'UNE PERSONNE, EN VERTICAL (3.5.305, Charles : « si je clique sur une case, je dois avoir l'horaire de la semaine du
   MDP qui apparaît, toute la semaine, avec les heures en vertical ; que je puisse réduire ou ajouter »). Sept colonnes, de 7 h à
   20 h ; chaque journée est un bloc qu'on allonge ou raccourcit en tirant son haut ou son bas (au quart d'heure). Lucie simule à
   chaque geste : le total, les règles, et la compensation dans les semaines calmes si le total change (POST /semaine/:uid/:lundi,
   `retoucherSemaine` de lib/monTemps.js) ; rien n'est écrit avant « Enregistrer ». */
const H0 = 7, H1 = 20, PX = 44;                       // 44 px par heure
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const min = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hh = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const hm = m => { if (m == null) return ''; const s = m < 0 ? '−' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`; };
const duree = j => { if (!j?.debut || !j?.fin) return 0; const p = j.pause_debut && j.pause_fin ? min(j.pause_fin) - min(j.pause_debut) : 0; return min(j.fin) - min(j.debut) - p; };
const jourFr = (l, i) => new Date(new Date(`${l}T12:00:00Z`).getTime() + i * 864e5).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
const y = m => ((m - H0 * 60) / 60) * PX;

export default function SemaineTemps({ api, personne, lundi, onFermer, onFait }) {
  const [jours, setJours] = useState(null);
  const [depart, setDepart] = useState(null);
  const [sim, setSim] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const tire = useRef(null);                          // { i, bord: 'debut' | 'fin', y0, m0 }

  useEffect(() => {
    api(`/annee/${personne.id}`).then(j => {
      const s = (j.semaines || []).find(x => x.lundi === lundi);
      const js = (s?.jours || Array(7).fill(null)).map(x => (x && !x.recup ? { ...x } : null));
      setJours(js); setDepart(JSON.stringify(js));
    }).catch(e => setErreur(e.message));
  }, [personne.id, lundi]); // eslint-disable-line react-hooks/exhaustive-deps

  // La simulation suit chaque geste, une demi-seconde après le dernier.
  useEffect(() => {
    if (!jours || JSON.stringify(jours) === depart) { setSim(null); return undefined; }
    const t = setTimeout(() => {
      api(`/semaine/${personne.id}/${lundi}`, { method: 'POST', body: JSON.stringify({ jours }) }).then(setSim).catch(e => setSim({ erreurs: [e.message] }));
    }, 500);
    return () => clearTimeout(t);
  }, [jours]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const bouger = e => {
      const t = tire.current; if (!t) return;
      const m = Math.round((t.m0 + ((e.clientY - t.y0) / PX) * 60) / 15) * 15;
      setJours(js => js.map((j, i) => {
        if (i !== t.i || !j) return j;
        if (t.bord === 'debut') return { ...j, debut: hh(Math.max(H0 * 60, Math.min(m, min(j.fin) - 60))) };
        return { ...j, fin: hh(Math.min(H1 * 60, Math.max(m, min(j.debut) + 60))) };
      }));
    };
    const lacher = () => { tire.current = null; };
    window.addEventListener('pointermove', bouger); window.addEventListener('pointerup', lacher);
    return () => { window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', lacher); };
  }, []);

  const saisir = (i, bord) => e => { e.preventDefault(); e.stopPropagation(); tire.current = { i, bord, y0: e.clientY, m0: min(jours[i][bord]) }; };
  const ajouter = i => setJours(js => js.map((j, k) => (k === i ? { debut: '08:30', fin: '12:30' } : j)));
  const retirer = i => setJours(js => js.map((j, k) => (k === i ? null : j)));
  const pause = i => setJours(js => js.map((j, k) => {
    if (k !== i || !j) return j;
    if (j.pause_debut) { const { pause_debut, pause_fin, ...r } = j; void pause_debut; void pause_fin; return r; }
    return { ...j, pause_debut: '12:00', pause_fin: '12:30' };
  }));
  const enregistrer = async () => {
    setEnCours(true);
    try { await api(`/semaine/${personne.id}/${lundi}`, { method: 'POST', body: JSON.stringify({ jours, ecrire: true }) }); onFait(); }
    catch (e) { setSim(s => ({ ...(s || {}), erreurs: [e.message, ...((e.bilan?.controles) || []), ...((e.bilan?.erreurs) || [])] })); }
    finally { setEnCours(false); }
  };

  const total = (jours || []).reduce((t, j) => t + duree(j), 0);
  const avant = depart ? JSON.parse(depart).reduce((t, j) => t + duree(j), 0) : 0;
  const change = jours && JSON.stringify(jours) !== depart;
  const bloque = !change || enCours || (sim && ((sim.controles || []).length || (sim.erreurs || []).length));

  return (
    <Fenetre titre={`${personne.nom} — semaine du ${jourFr(lundi, 0)}`} sous={`${hm(total)}${change ? ` (au lieu de ${hm(avant)})` : ''}`} large="grande" onFermer={onFermer}
      pied={<div className="flex items-center gap-2 w-full">
        <span className="text-second text-slate-500 flex-1 min-w-0">Tirez le haut ou le bas d’une journée pour la changer, au quart d’heure. Rien n’est enregistré avant « Enregistrer ».</span>
        <button type="button" className="bouton" onClick={onFermer}>Fermer</button>
        <button type="button" className="bouton bouton-fort" disabled={bloque} onClick={enregistrer}>Enregistrer</button></div>}>
      {erreur ? <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre> : !jours ? <p className="text-sm text-slate-500">Chargement…</p> : (
        <div className="space-y-3">
          <div className="flex select-none">
            <div className="relative w-12 flex-none" style={{ height: (H1 - H0) * PX + 24 }}>
              {Array.from({ length: H1 - H0 + 1 }, (_, k) => (
                <div key={k} className="absolute right-2 text-mention text-slate-400 tabular-nums" style={{ top: 24 + k * PX - 7 }}>{H0 + k} h</div>))}
            </div>
            {jours.map((j, i) => (
              <div key={i} className="flex-1 min-w-0 border-l" style={{ borderColor: 'rgb(var(--gris-200))' }}>
                <div className="h-6 text-center text-second font-semibold text-slate-600">{JOURS[i]} <span className="font-normal text-slate-400">{jourFr(lundi, i)}</span></div>
                <div className="relative" style={{ height: (H1 - H0) * PX }}>
                  {Array.from({ length: H1 - H0 }, (_, k) => <div key={k} className="absolute inset-x-0 border-t" style={{ top: k * PX, borderColor: 'rgb(var(--gris-100))' }} />)}
                  {j ? (
                    <div className="absolute inset-x-1 rounded-md text-white text-mention overflow-hidden"
                      style={{ top: y(min(j.debut)), height: y(min(j.fin)) - y(min(j.debut)), background: 'var(--c-principal)' }}>
                      <div className="absolute inset-x-0 top-0 h-2 cursor-ns-resize" style={{ background: 'rgba(255,255,255,.35)' }} onPointerDown={saisir(i, 'debut')} title="Tirer pour changer le début" />
                      {j.pause_debut && <div className="absolute inset-x-0" style={{ top: y(min(j.pause_debut)) - y(min(j.debut)), height: y(min(j.pause_fin)) - y(min(j.pause_debut)), background: 'rgba(255,255,255,.28)' }} title="Pause" />}
                      <div className="px-1.5 pt-2.5 leading-tight">
                        <div className="tabular-nums font-semibold">{j.debut}–{j.fin}</div>
                        <div className="opacity-80">{hm(duree(j))}</div>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" style={{ background: 'rgba(255,255,255,.35)' }} onPointerDown={saisir(i, 'fin')} title="Tirer pour changer la fin" />
                      <div className="absolute right-0.5 bottom-2.5 flex gap-0.5">
                        <button type="button" className="text-[10px] px-1 rounded bg-white/25 hover:bg-white/40" onClick={() => pause(i)} title={j.pause_debut ? 'Retirer la pause' : 'Ajouter une pause de 30 min à 12 h'}>{j.pause_debut ? '− pause' : '+ pause'}</button>
                        <button type="button" className="px-0.5 rounded bg-white/25 hover:bg-white/40" onClick={() => retirer(i)} aria-label="Retirer cette journée" title="Retirer cette journée"><IconX size={11} /></button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="absolute left-1/2 -translate-x-1/2 text-slate-400 hover:text-iip-blue" style={{ top: y(8 * 60) }}
                      onClick={() => ajouter(i)} aria-label={`Ajouter une journée le ${JOURS[i]}`} title="Ajouter une journée"><IconPlus size={16} /></button>
                  )}
                </div>
              </div>))}
          </div>

          {change && (
            <div className="space-y-1.5 text-second">
              {!sim ? <p className="m-0 text-slate-500">Lucie vérifie…</p> : <>
                {(sim.compensees || []).length > 0 && (
                  <div>Pour garder l’année juste, Lucie compense : {sim.compensees.map(c => `semaine du ${jourFr(c.lundi, 0)} (${hm(c.avant)} → ${hm(c.apres)})`).join(', ')}.</div>)}
                {sim.apres_annee != null && <div><PastilleEtat etat={sim.apres_annee === sim.du ? 'reussi' : 'corriger'}>année : {hm(sim.apres_annee)} {sim.apres_annee === sim.du ? '✓' : `pour ${hm(sim.du)}`}</PastilleEtat></div>}
                {[...(sim.controles || []), ...(sim.erreurs || [])].length > 0 && (
                  <Encadre etat="corriger" titre="À corriger avant d’enregistrer">
                    <ul className="m-0 pl-4">{[...(sim.controles || []), ...(sim.erreurs || [])].map((x, k) => <li key={k}>{x}</li>)}</ul>
                  </Encadre>)}
              </>}
            </div>)}
        </div>)}
    </Fenetre>
  );
}

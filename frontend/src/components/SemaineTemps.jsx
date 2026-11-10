import { useEffect, useRef, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconPlus, IconX } from '@tabler/icons-react';
import { Fenetre, Encadre, PastilleEtat } from './ui.jsx';
import { demander } from '../lib/dialogue.jsx';

/* LA SEMAINE DE L'ÉQUIPE, EN VERTICAL (3.5.305 ; 3.5.306, Charles : « des flèches gauche droite dans l'horaire, et plusieurs MDP l'un
   à côté de l'autre avec des couleurs différentes pour bien voir la semaine »). Sept jours de 7 h à 20 h ; chaque jour se partage
   entre les personnes affichées, chacune dans sa couleur. Une journée s'allonge ou se raccourcit en tirant le haut ou le bas de son
   bloc (au quart d'heure). Lucie simule à chaque geste, personne par personne : les règles et, si le total change, la compensation
   dans les semaines calmes (POST /semaine/:uid/:lundi, `retoucherSemaine` de lib/monTemps.js). « Enregistrer » applique pour chaque
   personne modifiée ; rien n'est écrit avant. */
const H0 = 7, H1 = 20, PX = 44;
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const COULEURS = ['var(--c-serie_1, #5B9BD5)', 'var(--c-serie_3, #F9B619)', 'var(--c-serie_5, #4FB06A)', 'var(--c-serie_4, #A879C9)', 'var(--c-serie_6, #E07AA6)', 'var(--c-serie_2, #3FC1E8)'];
const min = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hh = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const hm = m => { if (m == null) return ''; const s = m < 0 ? '−' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`; };
const duree = j => { if (!j?.debut || !j?.fin) return 0; const p = j.pause_debut && j.pause_fin ? min(j.pause_fin) - min(j.pause_debut) : 0; return min(j.fin) - min(j.debut) - p; };
const plusJours = (s, n) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const jourFr = (l, i) => new Date(`${plusJours(l, i)}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
const y = m => ((m - H0 * 60) / 60) * PX;
const prenomCourt = nom => String(nom || '').split(' ').slice(-1)[0];

export default function SemaineTemps({ api, equipe, personneInitiale, lundiInitial, semaines, onFermer, onFait }) {
  const [lundi, setLundi] = useState(lundiInitial);
  const [ids, setIds] = useState([personneInitiale.id]);
  const [donnees, setDonnees] = useState({});      // uid → { statut, jours, depart, sim }
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const annees = useRef({});                         // uid → semaines de l'année (cache)
  const tire = useRef(null);                         // { uid, i, bord, y0, m0 }
  const couleur = uid => COULEURS[Math.max(0, ids.indexOf(uid)) % COULEURS.length];
  const nom = uid => equipe.find(p => p.id === uid)?.nom || `#${uid}`;

  // Les jours de chaque personne pour la semaine regardée.
  useEffect(() => {
    let vivant = true;
    Promise.all(ids.map(async uid => {
      if (!annees.current[uid]) annees.current[uid] = (await api(`/annee/${uid}`)).semaines || [];
      const s = annees.current[uid].find(x => x.lundi === lundi);
      const jours = (s?.jours || Array(7).fill(null)).map(x => (x && !x.recup ? { ...x } : null));
      return [uid, { statut: s?.statut || null, jours, depart: JSON.stringify(jours), sim: null }];
    })).then(l => { if (vivant) { setDonnees(Object.fromEntries(l)); setErreur(null); } }).catch(e => setErreur(e.message));
    return () => { vivant = false; };
  }, [lundi, ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const modifiees = Object.entries(donnees).filter(([, d]) => JSON.stringify(d.jours) !== d.depart).map(([u]) => Number(u));

  // La simulation suit chaque geste, une demi-seconde après le dernier, pour chaque personne modifiée.
  const empreinte = JSON.stringify(modifiees.map(u => [u, donnees[u]?.jours]));
  useEffect(() => {
    if (!modifiees.length) return undefined;
    const t = setTimeout(() => {
      for (const uid of modifiees) {
        api(`/semaine/${uid}/${lundi}`, { method: 'POST', body: JSON.stringify({ jours: donnees[uid].jours }) })
          .then(r => setDonnees(d => ({ ...d, [uid]: { ...d[uid], sim: r } })))
          .catch(e => setDonnees(d => ({ ...d, [uid]: { ...d[uid], sim: { erreurs: [e.message] } } })));
      }
    }, 500);
    return () => clearTimeout(t);
  }, [empreinte]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const bouger = e => {
      const t = tire.current; if (!t) return;
      const m = Math.round((t.m0 + ((e.clientY - t.y0) / PX) * 60) / 15) * 15;
      setDonnees(d => {
        const p = d[t.uid]; if (!p) return d;
        const jours = p.jours.map((j, i) => {
          if (i !== t.i || !j) return j;
          if (t.bord === 'debut') return { ...j, debut: hh(Math.max(H0 * 60, Math.min(m, min(j.fin) - 60))) };
          return { ...j, fin: hh(Math.min(H1 * 60, Math.max(m, min(j.debut) + 60))) };
        });
        return { ...d, [t.uid]: { ...p, jours, sim: null } };
      });
    };
    const lacher = () => { tire.current = null; };
    window.addEventListener('pointermove', bouger); window.addEventListener('pointerup', lacher);
    return () => { window.removeEventListener('pointermove', bouger); window.removeEventListener('pointerup', lacher); };
  }, []);

  const changerJour = (uid, i, f) => setDonnees(d => ({ ...d, [uid]: { ...d[uid], sim: null, jours: d[uid].jours.map((j, k) => (k === i ? f(j) : j)) } }));
  const saisir = (uid, i, bord) => e => { e.preventDefault(); e.stopPropagation(); tire.current = { uid, i, bord, y0: e.clientY, m0: min(donnees[uid].jours[i][bord]) }; };
  const pause = j => { if (!j) return j; if (j.pause_debut) { const r = { ...j }; delete r.pause_debut; delete r.pause_fin; return r; } return { ...j, pause_debut: '12:00', pause_fin: '12:30' }; };

  const aller = async sens => {
    if (modifiees.length && !(await demander('Des changements ne sont pas enregistrés. Changer de semaine quand même ?'))) return;
    const k = semaines.indexOf(lundi) + sens;
    if (k >= 0 && k < semaines.length) setLundi(semaines[k]);
  };
  const enregistrer = async () => {
    setEnCours(true);
    try {
      for (const uid of modifiees) await api(`/semaine/${uid}/${lundi}`, { method: 'POST', body: JSON.stringify({ jours: donnees[uid].jours, ecrire: true }) });
      for (const uid of modifiees) delete annees.current[uid];
      onFait();
      setIds(x => [...x]);                          // relit la semaine
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const bloque = !modifiees.length || enCours || modifiees.some(u => { const s = donnees[u]?.sim; return !s || (s.controles || []).length || (s.erreurs || []).length; });
  const raisonPied = (() => {
    if (!modifiees.length) return null;
    for (const u of modifiees) {
      const s = donnees[u]?.sim;
      if (!s) return { etat: 'neutre', texte: 'Lucie vérifie…' };
      const r = [...(s.controles || []), ...(s.erreurs || [])];
      if (r.length) return { etat: 'corriger', texte: `${modifiees.length > 1 ? `${nom(u)} : ` : ''}${r[0]}${r.length > 1 ? ` (et ${r.length - 1} autre(s), détail sous la grille)` : ''}` };
    }
    return { etat: 'reussi', texte: 'Tout tient : « Enregistrer » applique.' };
  })();
  const autres = equipe.filter(p => !ids.includes(p.id) && p.genere);
  const k = semaines.indexOf(lundi);

  return (
    <Fenetre titre={`Semaine du ${jourFr(lundi, 0)} au ${jourFr(lundi, 6)}`} sous={ids.map(u => `${nom(u)} ${hm((donnees[u]?.jours || []).reduce((t, j) => t + duree(j), 0))}`).join(' · ')}
      large="ecran" onFermer={onFermer}
      outils={<>
        <button type="button" className="text-white/90 hover:text-white disabled:opacity-40" disabled={k <= 0} onClick={() => aller(-1)} aria-label="Semaine précédente" title="Semaine précédente"><IconChevronLeft size={20} /></button>
        <button type="button" className="text-white/90 hover:text-white disabled:opacity-40" disabled={k >= semaines.length - 1} onClick={() => aller(1)} aria-label="Semaine suivante" title="Semaine suivante"><IconChevronRight size={20} /></button>
      </>}
      pied={<div className="flex items-center gap-2 w-full">
        {/* POURQUOI LE BOUTON EST GRIS SE DIT À CÔTÉ DE LUI (3.5.310, Charles : « je ne sais pas enregistrer » — la raison
            restait sous la grille, hors de vue). */}
        <span className="text-second flex-1 min-w-0" style={{ color: raisonPied?.etat === 'corriger' ? 'var(--c-refuse)' : undefined }}>
          {raisonPied ? raisonPied.texte : 'Tirez le haut ou le bas d’une journée pour la changer, au quart d’heure. Rien n’est enregistré avant « Enregistrer ».'}</span>
        <button type="button" className="bouton" onClick={onFermer}>Fermer</button>
        <button type="button" className="bouton bouton-fort" disabled={bloque} onClick={enregistrer}>Enregistrer{modifiees.length > 1 ? ` (${modifiees.length})` : ''}</button></div>}>
      {/* Les personnes affichées, chacune sa couleur ; « + » en ajoute une à côté. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {ids.map(uid => (
          <span key={uid} className="inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-0.5 text-second text-white" style={{ background: couleur(uid) }}>
            {nom(uid)}{donnees[uid]?.statut && donnees[uid].statut !== 'travail' ? ' (congé)' : ''}
            {ids.length > 1 && <button type="button" className="rounded-full hover:bg-white/25" onClick={() => setIds(x => x.filter(v => v !== uid))} aria-label={`Retirer ${nom(uid)}`}><IconX size={13} /></button>}
          </span>))}
        {autres.length > 0 && (
          <select className="controle !h-8" value="" onChange={e => e.target.value && setIds(x => [...x, Number(e.target.value)])} aria-label="Ajouter une personne">
            <option value="">+ ajouter une personne…</option>
            {autres.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>)}
      </div>
      {erreur && <Encadre etat="corriger" titre="Refusé">{erreur}</Encadre>}
      <div className="flex select-none">
        <div className="relative w-12 flex-none" style={{ height: (H1 - H0) * PX + 24 }}>
          {Array.from({ length: H1 - H0 + 1 }, (_, h) => <div key={h} className="absolute right-2 text-mention text-slate-400 tabular-nums" style={{ top: 24 + h * PX - 7 }}>{H0 + h} h</div>)}
        </div>
        {JOURS.map((jn, i) => (
          <div key={i} className="flex-1 min-w-0 border-l" style={{ borderColor: 'rgb(var(--gris-200))' }}>
            <div className="h-6 text-center text-second font-semibold text-slate-600">{jn} <span className="font-normal text-slate-400">{jourFr(lundi, i)}</span></div>
            <div className="relative flex" style={{ height: (H1 - H0) * PX }}>
              {Array.from({ length: H1 - H0 }, (_, h) => <div key={h} className="absolute inset-x-0 border-t pointer-events-none" style={{ top: h * PX, borderColor: 'rgb(var(--gris-100))' }} />)}
              {ids.map(uid => {
                const d = donnees[uid]; const j = d?.jours?.[i]; const travail = d?.statut === 'travail';
                return (
                  <div key={uid} className="relative flex-1 min-w-0">
                    {j ? (
                      <div className="absolute inset-x-0.5 rounded-md text-white text-mention overflow-hidden"
                        style={{ top: y(min(j.debut)), height: y(min(j.fin)) - y(min(j.debut)), background: couleur(uid) }} title={`${nom(uid)} : ${j.debut}–${j.fin}`}>
                        <div className="absolute inset-x-0 top-0 h-2 cursor-ns-resize" style={{ background: 'rgba(255,255,255,.4)' }} onPointerDown={saisir(uid, i, 'debut')} title="Tirer pour changer le début" />
                        {j.pause_debut && <div className="absolute inset-x-0 pointer-events-none" style={{ top: y(min(j.pause_debut)) - y(min(j.debut)), height: y(min(j.pause_fin)) - y(min(j.pause_debut)), background: 'rgba(255,255,255,.3)' }} />}
                        <div className="px-1 pt-2.5 leading-tight">
                          {ids.length > 1 && <div className="font-semibold truncate">{prenomCourt(nom(uid))}</div>}
                          <div className="tabular-nums">{j.debut}–{j.fin}</div>
                          <div className="opacity-85">{hm(duree(j))}</div>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" style={{ background: 'rgba(255,255,255,.4)' }} onPointerDown={saisir(uid, i, 'fin')} title="Tirer pour changer la fin" />
                        <div className="absolute right-0.5 bottom-2.5 flex gap-0.5">
                          <button type="button" className="text-[10px] px-1 rounded bg-white/25 hover:bg-white/45" onClick={() => changerJour(uid, i, pause)} title={j.pause_debut ? 'Retirer la pause' : 'Ajouter une pause de 30 min à 12 h'}>{j.pause_debut ? '−p' : '+p'}</button>
                          <button type="button" className="px-0.5 rounded bg-white/25 hover:bg-white/45" onClick={() => changerJour(uid, i, () => null)} aria-label="Retirer cette journée" title="Retirer cette journée"><IconX size={11} /></button>
                        </div>
                      </div>
                    ) : travail ? (
                      <button type="button" className="absolute left-1/2 -translate-x-1/2" style={{ top: y(8 * 60), color: couleur(uid) }}
                        onClick={() => changerJour(uid, i, () => ({ debut: '08:30', fin: '12:30' }))} aria-label={`Ajouter une journée pour ${nom(uid)}`} title={`Ajouter une journée pour ${nom(uid)}`}><IconPlus size={15} /></button>
                    ) : null}
                  </div>);
              })}
            </div>
          </div>))}
      </div>

      {modifiees.length > 0 && (
        <div className="space-y-1.5 text-second mt-3">
          {modifiees.map(uid => {
            const s = donnees[uid]?.sim;
            return (
              <div key={uid} className="pl-2 border-l-4" style={{ borderColor: couleur(uid) }}>
                <b>{nom(uid)}</b>{' · '}
                {!s ? <span className="text-slate-500">Lucie vérifie…</span> : <>
                  {(s.compensees || []).length > 0 && <>compensé : {s.compensees.map(c => `semaine du ${jourFr(c.lundi, 0)} (${hm(c.avant)} → ${hm(c.apres)})`).join(', ')} · </>}
                  {s.apres_annee != null && (s.apres_annee === s.du
                    ? <PastilleEtat etat="reussi">année : {hm(s.apres_annee)} ✓</PastilleEtat>
                    : <PastilleEtat etat="surveiller">{s.au_solde < 0 ? `${hm(-s.au_solde)} à replacer plus tard` : `${hm(s.au_solde)} en plus sur l’année`} (au solde)</PastilleEtat>)}
                  {[...(s.controles || []), ...(s.erreurs || [])].length > 0 && (
                    <ul className="m-0 mt-1 pl-4" style={{ color: 'var(--c-refuse)' }}>{[...(s.controles || []), ...(s.erreurs || [])].map((x, n) => <li key={n}>{x}</li>)}</ul>)}
                </>}
              </div>);
          })}
        </div>)}
    </Fenetre>
  );
}

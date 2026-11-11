import { useEffect, useRef, useState } from 'react';
import { IconPlus, IconX } from '@tabler/icons-react';
import { Fenetre, Encadre, PastilleEtat } from './ui.jsx';
import { saisir } from '../lib/dialogue.jsx';
import { ouvrirApercu } from '../lib/apercu.js';

/* LA SEMAINE TYPE D'UNE PERSONNE (3.5.308, Charles : « je ne sais pas proposer un horaire qui se répète » ; tranché : un horaire
   type par personne). La semaine habituelle, dessinée en vertical comme la semaine de l'équipe (7 h → 20 h, journées étirables au
   quart d'heure) ; Lucie contrôle (les heures dues, 8 h par jour, 11 h de repos) et dit combien de semaines à venir la recevront.
   Le générateur de l'année la reprend. Serveur : GET/POST /semaine-type/:uid (lib/monTemps.js). */
const H0 = 7, H1 = 20, PX = 40;
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const min = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hh = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const hm = m => { if (m == null) return ''; const s = m < 0 ? '−' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`; };
const duree = j => { if (!j?.debut || !j?.fin) return 0; const p = j.pause_debut && j.pause_fin ? min(j.pause_fin) - min(j.pause_debut) : 0; return min(j.fin) - min(j.debut) - p; };
const y = m => ((m - H0 * 60) / 60) * PX;

export default function SemaineTypeTemps({ api, personne, onFermer, onFait }) {
  const [jours, setJours] = useState(null);
  const [cible, setCible] = useState(null);
  const [sim, setSim] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [compenser, setCompenser] = useState(false);   // 3.5.334 : proposé quand la semaine type s'écarte des heures dues
  const tire = useRef(null);

  useEffect(() => {
    api(`/semaine-type/${personne.utilisateur_id}`).then(j => { setJours(j.jours.map(x => (x ? { ...x } : null))); setCible(j.cible); }).catch(e => setErreur(e.message));
  }, [personne.utilisateur_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!jours) return undefined;
    const t = setTimeout(() => {
      api(`/semaine-type/${personne.utilisateur_id}`, { method: 'POST', body: JSON.stringify({ jours, compenser }) }).then(setSim).catch(e => setSim({ controles: [e.message] }));
    }, 400);
    return () => clearTimeout(t);
  }, [jours, compenser]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const saisir = (i, bord) => e => { e.preventDefault(); tire.current = { i, bord, y0: e.clientY, m0: min(jours[i][bord]) }; };
  const changer = (i, f) => setJours(js => js.map((j, k) => (k === i ? f(j) : j)));
  // LA PAUSE SE RÉDUIT À 15 MIN (3.5.346, Charles) : 15 → 30 → 45 → 60 ; moins de 30 min passe par l'accord individuel.
  const dureePause = j => { const p = min(j.pause_fin) - min(j.pause_debut); const n = { 15: 30, 30: 45, 45: 60 }[p] || 15; return { ...j, pause_fin: hh(min(j.pause_debut) + n) }; };
  const pause = j => { if (!j) return j; if (j.pause_debut) { const r = { ...j }; delete r.pause_debut; delete r.pause_fin; return r; } return { ...j, pause_debut: '12:00', pause_fin: '12:30' }; };
  const enregistrer = async () => {
    setEnCours(true);
    try { await api(`/semaine-type/${personne.utilisateur_id}`, { method: 'POST', body: JSON.stringify({ jours, ecrire: true, compenser }) }); onFait(); }
    catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  /* LA DÉROGATION MOTIVÉE (3.5.345, Charles : « c'est la demande de la personne ; je dois le valider et sortir un document à
     signer ») : seul le plafond de 8 h (9 h) par jour se lève, jusqu'à 10 h ; un motif ; puis l'accord individuel, à signer. */
  const deroger = async () => {
    const motif = await saisir({ titre: 'Accepter par dérogation', obligatoire: true,
      message: `Écarts : ${(sim.depassements || []).join(' ; ')}. Pourquoi les accepter ? (par exemple : « à la demande de la personne »). Le motif figure sur l’accord individuel à signer.` });
    if (!motif || !String(motif).trim()) return;
    setEnCours(true);
    try {
      const r = await api(`/semaine-type/${personne.utilisateur_id}`, { method: 'POST', body: JSON.stringify({ jours, ecrire: true, compenser, derogation: String(motif).trim() }) });
      if (r?.derogation_id) {
        const d = await api(`/derogation/${r.derogation_id}/document`);
        ouvrirApercu({ html: d.html, titre: d.titre, nomFichier: d.nom_fichier, envoiPossible: false, astuceImpression: 'A4 portrait' });
      }
      onFait();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const total = (jours || []).reduce((t, j) => t + duree(j), 0);
  const ok = sim && !(sim.controles || []).length;
  const ecart = total - (cible || 0);
  // POURQUOI « ENREGISTRER » EST GRIS SE DIT À CÔTÉ DE LUI (3.5.334, Charles : « je ne peux pas sauver »).
  const raison = !sim ? 'Lucie vérifie…' : (sim.controles || []).length ? `${sim.controles[0]}${sim.derogeable ? ' La direction peut l’accepter par dérogation : chaque écart est nommé sur l’accord à signer.' : ''}` : null;

  return (
    <Fenetre titre={`Semaine type — ${personne.nom}`} sous={`${hm(total)} sur ${hm(cible)} dues par semaine`} large="grande" onFermer={onFermer}
      pied={<div className="flex items-center gap-2 w-full">
        <span className="text-second flex-1 min-w-0" style={{ color: raison && sim ? 'var(--c-refuse)' : 'rgb(var(--gris-500))' }}>{raison
          || `Enregistrée, elle s’applique aux ${sim.a_appliquer} semaine(s) de travail à venir restées telles quelles${sim.gardees ? ` ; ${sim.gardees} semaine(s) déjà retouchée(s) gardent leur horaire` : ''}.`}</span>
        <button type="button" className="bouton" onClick={onFermer}>Fermer</button>
        {sim?.derogeable && <button type="button" className="bouton" disabled={enCours} onClick={deroger}
          title="Accepter cette semaine malgré les écarts, avec un motif ; l’accord individuel, qui les nomme un à un, sort pour signature">Accepter par dérogation</button>}
        <button type="button" className="bouton bouton-fort" disabled={!ok || enCours} onClick={enregistrer}>Enregistrer</button></div>}>
      {erreur && <Encadre etat="corriger" titre="Refusé">{erreur}</Encadre>}
      {!jours ? <p className="text-sm text-slate-500">Chargement…</p> : (
        <div className="space-y-3">
          <div className="flex select-none">
            <div className="relative w-12 flex-none" style={{ height: (H1 - H0) * PX + 24 }}>
              {Array.from({ length: H1 - H0 + 1 }, (_, h) => <div key={h} className="absolute right-2 text-mention text-slate-400 tabular-nums" style={{ top: 24 + h * PX - 7 }}>{H0 + h} h</div>)}
            </div>
            {jours.map((j, i) => (
              <div key={i} className="flex-1 min-w-0 border-l" style={{ borderColor: 'rgb(var(--gris-200))' }}>
                <div className="h-6 text-center text-second font-semibold text-slate-600">{JOURS[i]}</div>
                <div className="relative" style={{ height: (H1 - H0) * PX }}>
                  {Array.from({ length: H1 - H0 }, (_, h) => <div key={h} className="absolute inset-x-0 border-t pointer-events-none" style={{ top: h * PX, borderColor: 'rgb(var(--gris-100))' }} />)}
                  {j ? (
                    <div className="absolute inset-x-1 rounded-md text-white text-mention overflow-hidden" style={{ top: y(min(j.debut)), height: y(min(j.fin)) - y(min(j.debut)), background: 'var(--c-principal)' }}>
                      <div className="absolute inset-x-0 top-0 h-2 cursor-ns-resize" style={{ background: 'rgba(255,255,255,.35)' }} onPointerDown={saisir(i, 'debut')} title="Tirer pour changer le début" />
                      {j.pause_debut && <div className="absolute inset-x-0 pointer-events-none" style={{ top: y(min(j.pause_debut)) - y(min(j.debut)), height: y(min(j.pause_fin)) - y(min(j.pause_debut)), background: 'rgba(255,255,255,.28)' }} />}
                      <div className="px-1.5 pt-2.5 leading-tight"><div className="tabular-nums font-semibold">{j.debut}–{j.fin}</div><div className="opacity-80">{hm(duree(j))}</div></div>
                      <div className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" style={{ background: 'rgba(255,255,255,.35)' }} onPointerDown={saisir(i, 'fin')} title="Tirer pour changer la fin" />
                      <div className="absolute right-0.5 bottom-2.5 flex gap-0.5">
                        {j.pause_debut && <button type="button" className="text-[10px] px-1 rounded bg-white/25 hover:bg-white/40 tabular-nums" onClick={() => changer(i, dureePause)}
                          title="Durée de la pause : 15, 30, 45 ou 60 min (moins de 30 min : accord à signer)">{min(j.pause_fin) - min(j.pause_debut)} min</button>}
                        <button type="button" className="text-[10px] px-1 rounded bg-white/25 hover:bg-white/40" onClick={() => changer(i, pause)}>{j.pause_debut ? '− pause' : '+ pause'}</button>
                        <button type="button" className="px-0.5 rounded bg-white/25 hover:bg-white/40" onClick={() => changer(i, () => null)} aria-label="Retirer cette journée"><IconX size={11} /></button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="absolute left-1/2 -translate-x-1/2 text-slate-400 hover:text-iip-blue" style={{ top: y(8 * 60) }} onClick={() => changer(i, () => ({ debut: '08:30', fin: '12:30' }))} aria-label={`Ajouter le ${JOURS[i]}`}><IconPlus size={16} /></button>
                  )}
                </div>
              </div>))}
          </div>
          <div className="text-second flex flex-wrap items-center gap-2">
            <PastilleEtat etat={total === cible ? 'reussi' : 'surveiller'}>{hm(total)} {total === cible ? 'par semaine' : `pour ${hm(cible)} dues`}</PastilleEtat>
            {ecart !== 0 && sim && !(sim.controles || []).length && (<>
              <span className="text-slate-600">{ecart > 0 ? `${hm(ecart)} de plus` : `${hm(-ecart)} de moins`} par semaine
                {sim.a_appliquer ? ` × ${sim.a_appliquer} semaine(s)` : ''} : {sim.au_solde === 0 ? 'l’année tombe juste.'
                  : `${sim.au_solde > 0 ? '+' : '−'}${hm(Math.abs(sim.au_solde))} au solde de l’année.`}</span>
              <label className="inline-flex items-center gap-1.5 w-full">
                <input type="checkbox" checked={compenser} onChange={e => setCompenser(e.target.checked)} />
                Compenser sur les semaines à venir qui ne reçoivent pas la semaine type
                {compenser && <span className="text-slate-500"> — {(sim.compensees || []).length ? `${sim.compensees.length} semaine(s) ajustée(s)` : 'aucune semaine où compenser'}{(sim.restes || []).length ? ` ; ${sim.restes[0]}` : ''}</span>}
              </label>
            </>)}
            {(sim?.controles || []).length > 0 && <ul className="m-0 pl-4 w-full" style={{ color: 'var(--c-refuse)' }}>{sim.controles.map((x, k) => <li key={k}>{x}</li>)}</ul>}
          </div>
        </div>)}
    </Fenetre>
  );
}

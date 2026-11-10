import { useEffect, useRef, useState } from 'react';
import { EnteteCarte, ListeEtats, LigneEtat, Encadre, PastilleEtat } from './ui.jsx';
import { informer, saisir } from '../lib/dialogue.jsx';
import SemaineTemps from './SemaineTemps.jsx';

/* L'ÉQUIPE — L'ÉCRAN DE LA DIRECTION (3.5.304, Charles : « je ne comprends pas Temps de travail » ; « trop d'outils, je ne sais pas
   ce que je dois faire » ; « gérer l'année en entier, avec des moments avec plus d'heures pour certains et moins pour d'autres » ;
   maquette validée docs/maquettes/temps-direction.html). En tête, ce qui attend la direction (demandes, relevés à approuver,
   années à préparer) ; puis l'équipe semaine par semaine, où l'on coche des personnes et glisse sur des semaines pour leur donner
   plus ou moins d'heures — Lucie propose la compensation (POST /plan, lib/monTemps.js `planHeures`), la direction corrige, puis
   enregistre. La direction ou la direction adjointe approuve seule. */
const hm = m => { if (m == null) return ''; const s = m < 0 ? '−' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`; };
const court = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
const moisFr = m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const moisPrecedent = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const HEBDO = 36 * 60;
const FOND = {
  travail: 'color-mix(in srgb, var(--c-principal) 20%, white)', forte: 'color-mix(in srgb, var(--c-attente) 60%, white)',
  legere: 'color-mix(in srgb, var(--c-disponible) 35%, white)', conge: 'color-mix(in srgb, var(--c-reussi) 40%, white)', vide: 'rgb(var(--gris-300))',
};

export default function EquipeTemps({ api, onReleve, onPreparer }) {
  const [eq, setEq] = useState(null);
  const [mods, setMods] = useState([]);
  const [suivi, setSuivi] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [choisis, setChoisis] = useState(new Set());
  const [zone, setZone] = useState(null);        // [i0, i1] des semaines glissées
  const [menu, setMenu] = useState(false);
  const [delta, setDelta] = useState(240);
  const [prop, setProp] = useState(null);        // la proposition de Lucie
  const [exclure, setExclure] = useState({});    // { uid: [lundis] } retirés de la compensation
  const [enCours, setEnCours] = useState(false);
  const glisse = useRef(false);
  const depart = useRef(null);                  // { k, i } : la case où le geste a commencé ; un clic sans glisser ouvre la semaine
  const [semaine, setSemaine] = useState(null); // { k, i } : la fenêtre de la semaine (3.5.305)
  const eqRef = useRef(null);
  const mois = moisPrecedent();

  const charger = () => Promise.all([
    api('/equipe-annee').then(setEq),
    api('/modulations').then(l => setMods((l || []).filter(m => ['proposee', 'controlee'].includes(m.statut)))).catch(() => setMods([])),
    api(`/suivi?mois=${mois}`).then(setSuivi).catch(() => setSuivi([])),
  ]).then(() => setErreur(null)).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fin = () => {
      if (!glisse.current) return;
      glisse.current = false;
      const d = depart.current;
      // UN CLIC, PAS UN GLISSÉ : la semaine de la personne s'ouvre, heures en vertical.
      if (d && !d.bouge) {
        setZone(null); setMenu(false);
        if (eqRef.current?.personnes[d.k]?.semaines[d.i]?.statut === 'travail') setSemaine({ k: d.k, i: d.i });
        else informer({ message: 'Cette semaine est un congé, une fermeture de l’école, ou n’est pas encore préparée : elle ne porte pas d’heures.' });
        return;
      }
      setMenu(true);
    };
    window.addEventListener('pointerup', fin); return () => window.removeEventListener('pointerup', fin);
  }, []);

  eqRef.current = eq;
  if (erreur && !eq) return <Encadre etat="corriger" titre="L’équipe">{erreur}</Encadre>;
  if (!eq) return <p className="text-sm text-slate-500">Chargement…</p>;

  const accepter = async m => { try { await api(`/modulations/${m.id}/valider`, { method: 'POST', body: JSON.stringify({ etape: 'direction' }) }); charger(); } catch (e) { informer({ message: e.message }); } };
  const refuser = async m => {
    const motif = await saisir({ message: `Pourquoi refuser la demande de ${m.nom} ?`, multiligne: true, obligatoire: true });
    if (!motif) return;
    try { await api(`/modulations/${m.id}/refuser`, { method: 'POST', body: JSON.stringify({ motif }) }); charger(); } catch (e) { informer({ message: e.message }); }
  };
  const aApprouver = suivi.filter(p => p.releve.includes('personne') && !p.releve.includes('direction'));
  const sansAnnee = eq.personnes.filter(p => !p.genere);
  const nbAttente = mods.length + (aApprouver.length ? 1 : 0) + (sansAnnee.length ? 1 : 0);

  const bornes = zone ? [Math.min(...zone), Math.max(...zone)] : null;
  const dansZone = (k, i) => bornes && choisis.has(eq.personnes[k].id) && i >= bornes[0] && i <= bornes[1];
  const commencer = (k, i) => { depart.current = { k, i, bouge: false }; glisse.current = true; setZone([i, i]); setMenu(false); setProp(null); };
  const etendre = i => {
    if (!glisse.current) return;
    if (depart.current && i !== depart.current.i && !depart.current.bouge) {
      depart.current.bouge = true;
      const id = eq.personnes[depart.current.k].id;
      if (!choisis.has(id)) setChoisis(c => new Set([...c, id]));   // glisser sur sa ligne coche la personne
    }
    setZone(z => (z ? [z[0], i] : z));
  };
  const cocher = id => setChoisis(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const proposer = async (excl = exclure) => {
    if (!bornes) return;
    setEnCours(true);
    try {
      const j = await api('/plan', { method: 'POST', body: JSON.stringify({ uids: [...choisis], lundis: eq.semaines.slice(bornes[0], bornes[1] + 1), delta, exclure: excl }) });
      setProp(j); setMenu(false);
    } catch (e) { informer({ message: e.message }); } finally { setEnCours(false); }
  };
  const basculerExclu = (uid, l) => {
    const n = { ...exclure, [uid]: (exclure[uid] || []).includes(l) ? exclure[uid].filter(x => x !== l) : [...(exclure[uid] || []), l] };
    setExclure(n); proposer(n);
  };
  const enregistrer = async () => {
    setEnCours(true);
    try {
      await api('/plan', { method: 'POST', body: JSON.stringify({ uids: [...choisis], lundis: eq.semaines.slice(bornes[0], bornes[1] + 1), delta, exclure, ecrire: true }) });
      setProp(null); setZone(null); setExclure({}); await charger();
      informer({ message: 'Le plan est enregistré : les années sont modifiées.' });
    } catch (e) { informer({ message: e.message }); } finally { setEnCours(false); }
  };
  // Les semaines de la proposition, pour les montrer sur la grille avant d'enregistrer.
  const apercu = new Map();
  for (const r of prop?.resultats || []) for (const c of [...(r.chargees || []), ...(r.compensees || [])]) apercu.set(`${r.uid}|${c.lundi}`, c.apres);

  return (
    <div className="space-y-4">
      <section className="carte overflow-hidden">
        <EnteteCarte titre="Ce qui vous attend" sous={nbAttente ? `${nbAttente} chose(s)` : 'rien pour l’instant'} />
        {nbAttente ? (
          <ListeEtats className="!border-0 !rounded-none">
            {mods.map(m => (
              <LigneEtat key={m.id} etat="surveiller" titre={`${m.simple ? 'Demande' : 'Modulation'} de ${m.nom}`}
                sous={`${m.resume}${m.mot ? ` · « ${m.mot} »` : ''} · Lucie a vérifié : l’année garde ses heures et ses 13 semaines de congé`}
                droite={<div className="flex gap-2"><button type="button" className="bouton" onClick={() => refuser(m)}>Refuser</button>
                  <button type="button" className="bouton bouton-fort" onClick={() => accepter(m)}>Accepter</button></div>} />))}
            {aApprouver.length > 0 && (
              <LigneEtat etat="disponible" titre={`Relevés de ${moisFr(mois)} à approuver : ${aApprouver.length}`}
                sous={aApprouver.map(p => `${p.nom} (${p.solde >= 0 ? '+ ' : ''}${hm(p.solde)})`).join(' · ')}
                droite={<button type="button" className="bouton bouton-fort" onClick={() => onReleve(aApprouver[0].id)}>Voir et approuver</button>} />)}
            {sansAnnee.length > 0 && (
              <LigneEtat etat="surveiller" titre={`Année à préparer : ${sansAnnee.map(p => p.nom).join(', ')}`}
                sous="Leurs 52 semaines ne sont pas encore générées." droite={<button type="button" className="bouton" onClick={onPreparer}>Préparer l’année</button>} />)}
          </ListeEtats>
        ) : <p className="text-sm text-slate-500 m-0 px-4 py-3">Aucune demande, aucun relevé à approuver.</p>}
      </section>

      <section className="carte overflow-hidden">
        <EnteteCarte titre="L’équipe, semaine par semaine" sous="Touchez une case pour ouvrir la semaine de la personne. Cochez une ou plusieurs personnes et glissez sur des semaines pour leur donner plus ou moins d’heures." />
        <div className="overflow-x-auto select-none" onPointerLeave={() => { /* on garde la zone */ }}>
          <table className="border-separate" style={{ borderSpacing: 2 }}>
            <thead><tr>
              <th className="w-6" /><th className="text-left text-mention text-slate-500 font-semibold px-2 sticky left-0" style={{ background: 'var(--c-fond_carte, white)' }} />
              {/* Une date toutes les quatre semaines, posée au-dessus SANS élargir sa colonne : toutes les semaines ont la même largeur. */}
              {eq.semaines.map((l, i) => <th key={l} className="relative w-5 h-5 p-0">{i % 4 === 0 && <span className="absolute left-0 bottom-0 text-mention text-slate-400 font-normal whitespace-nowrap">{court(l)}</span>}</th>)}
              <th className="text-mention text-slate-500 font-semibold px-3 text-right">Année</th>
            </tr></thead>
            <tbody>
              {eq.personnes.map((p, k) => {
                const modele = Math.round(HEBDO * (p.fraction || 1));
                return (
                  <tr key={p.id}>
                    <td><input type="checkbox" checked={choisis.has(p.id)} onChange={() => cocher(p.id)} aria-label={`Choisir ${p.nom}`} /></td>
                    <td className="text-sm whitespace-nowrap pr-3 sticky left-0" style={{ background: 'var(--c-fond_carte, white)' }}>{p.nom}</td>
                    {p.semaines.map((s, i) => {
                      const prevu = apercu.get(`${p.id}|${s.lundi}`) ?? s.prevu;
                      const fond = s.statut === 'travail' ? (prevu > modele ? FOND.forte : prevu < modele ? FOND.legere : FOND.travail) : s.statut ? FOND.conge : FOND.vide;
                      const change = apercu.has(`${p.id}|${s.lundi}`);
                      return (
                        <td key={s.lundi} title={`Semaine du ${court(s.lundi)} — ${s.statut === 'travail' ? hm(prevu) : s.statut ? 'congé' : '—'}`}
                          onPointerDown={e => { e.preventDefault(); commencer(k, i); }} onPointerEnter={() => etendre(i)}
                          className="cursor-crosshair">
                          <div className="w-5 h-6 rounded" style={{ background: fond,
                            boxShadow: dansZone(k, i) ? '0 0 0 2px var(--c-attente)' : change ? '0 0 0 2px var(--c-principal)' : undefined }} />
                        </td>);
                    })}
                    <td className="text-second tabular-nums text-right px-3 whitespace-nowrap">{p.genere ? `${hm(p.prevu)} / ${hm(p.du)}` : '—'}</td>
                  </tr>);
              })}
              <tr>
                <td /><td className="text-mention text-slate-500 pr-3 sticky left-0" style={{ background: 'var(--c-fond_carte, white)' }}>présents</td>
                {eq.presents.map((n, i) => <td key={i} className="text-center text-mention tabular-nums" style={{ color: n && n < (eq.presents_min || 1) ? 'var(--c-refuse)' : 'rgb(var(--gris-500))' }}>{n || ''}</td>)}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4 px-4 py-2 text-mention text-slate-500">
          {[['travail', 'semaine normale'], ['forte', 'plus d’heures'], ['legere', 'moins d’heures'], ['conge', 'congé'], ['vide', 'école fermée / non préparé']].map(([k, l]) => (
            <span key={k}><i className="inline-block w-3.5 h-3 rounded-sm align-[-1px] mr-1" style={{ background: FOND[k] }} />{l}</span>))}
        </div>

        {menu && bornes && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t" style={{ borderColor: 'var(--c-filet, rgb(var(--gris-200)))', background: 'color-mix(in srgb, var(--c-attente) 7%, white)' }}>
            <b className="text-sm">{eq.personnes.filter(p => choisis.has(p.id)).map(p => p.nom).join(', ') || 'Cochez une personne'} · du {court(eq.semaines[bornes[0]])} au {court(eq.semaines[bornes[1]])}</b>
            <label className="text-second text-slate-600 inline-flex items-center gap-2">par semaine
              <select className="controle" value={delta} onChange={e => setDelta(Number(e.target.value))}>
                {[120, 240, 360, 480, -120, -240, -360].map(m => <option key={m} value={m}>{m > 0 ? '+ ' : '− '}{Math.abs(m) / 60} h</option>)}
              </select></label>
            <button type="button" className="bouton bouton-fort" disabled={!choisis.size || enCours} onClick={() => { setExclure({}); proposer({}); }}>Proposer</button>
            <button type="button" className="bouton" onClick={() => { setMenu(false); setZone(null); }}>Annuler</button>
          </div>)}

        {prop && (
          <div className="px-4 py-3 border-t space-y-2" style={{ borderColor: 'var(--c-filet, rgb(var(--gris-200)))' }}>
            <div className="text-sm font-semibold">Proposition de Lucie — rien n’est encore enregistré</div>
            {prop.resultats.map(r => (
              <div key={r.uid} className="text-second">
                <b>{r.nom}</b>{' · '}
                {r.erreurs?.length ? <span style={{ color: 'var(--c-refuse)' }}>{r.erreurs.join(' ')}</span> : <>
                  {r.chargees.length} semaine(s) à {hm(r.chargees[0]?.apres)} · compensé sur :{' '}
                  {r.compensees.map(c => (
                    <button key={c.lundi} type="button" className="underline decoration-dotted mx-0.5" title="Retirer cette semaine de la compensation"
                      onClick={() => basculerExclu(r.uid, c.lundi)}>{court(c.lundi)} ({hm(c.apres)})</button>))}
                  {(exclure[r.uid] || []).length > 0 && <span className="text-slate-500"> · écartées : {(exclure[r.uid] || []).map(court).join(', ')}</span>}
                  {' · '}<PastilleEtat etat={r.apres === r.du ? 'reussi' : 'corriger'}>{r.apres === r.du ? `année : ${hm(r.du)} ✓` : `année : ${hm(r.apres)} pour ${hm(r.du)}`}</PastilleEtat>
                  {r.avertissements?.length ? <div className="text-slate-500">{r.avertissements.join(' ')}</div> : null}
                </>}
              </div>))}
            <p className="text-mention text-slate-500 m-0">Lucie compense dans les semaines calmes de chacun, en évitant les grands moments, dans les bornes (45 h au plus, 8 h par jour). Touchez une semaine compensée pour l’écarter : Lucie en prend une autre.</p>
            <div className="flex gap-2">
              <button type="button" className="bouton bouton-fort" disabled={enCours || prop.bloque} onClick={enregistrer}>Enregistrer</button>
              <button type="button" className="bouton" onClick={() => { setProp(null); setZone(null); setExclure({}); }}>Annuler</button>
            </div>
          </div>)}
      </section>
      {semaine && eq.personnes[semaine.k]?.semaines[semaine.i]?.statut === 'travail' && (
        <SemaineTemps api={api} personne={eq.personnes[semaine.k]} lundi={eq.semaines[semaine.i]}
          onFermer={() => setSemaine(null)} onFait={() => { setSemaine(null); charger(); }} />)}
    </div>
  );
}

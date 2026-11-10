import { useEffect, useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { TuileEtat, EnteteCarte, Tableau, TableauEntete, Th, Td, Tr, ListeEtats, LigneEtat, PastilleEtat, Encadre, Fenetre } from './ui.jsx';
import { informer } from '../lib/dialogue.jsx';
import { getUser } from '../lib/api.js';

/* MON TEMPS (3.5.301, Charles : « cette gestion du temps de travail est un peu complexe » ; maquette validée,
   docs/maquettes/mon-temps.html). L'écran du personnel : sa semaine et « j'ai travaillé autrement », son relevé à signer, son
   année en 52 cases où une semaine se touche pour DEMANDER (un congé, une semaine de travail, plus ou moins d'heures), et ses
   demandes. Serveur : GET /api/temps-travail/mon-temps, POST /demande (lib/monTemps.js). `api` : le fetcheur de TempsTravail. */
const hm = m => { if (m == null) return ''; const s = m < 0 ? '−' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const jourFr = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', timeZone: 'UTC' });
const court = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
const long = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const moisFr = m => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const plusJours = (s, n) => new Date(new Date(`${s}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const plusMinutes = (h, n) => { const [a, b] = String(h || '12:00').split(':').map(Number); const t = a * 60 + (b || 0) + n; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const ETAT = { conge: 'congé', ete: 'vacances d’été', recup: 'jour donné', libre: 'libre', hors: '' };

function CeQuiSestPasse({ j }) {
  if (j.ferie) return <PastilleEtat etat="neutre">{j.ferie} — férié</PastilleEtat>;
  if (j.fermeture_ecole) return <PastilleEtat etat="neutre">{j.fermeture_ecole.libelle || 'école fermée'}</PastilleEtat>;
  if (j.etat === 'reel') return <span>travaillé {j.saisie?.debut} → {j.saisie?.fin} · <b>{j.ecart >= 0 ? '+ ' : ''}{hm(j.ecart)}</b>{j.saisie?.note ? <span className="text-slate-500"> ({j.saisie.note})</span> : null}</span>;
  if (j.etat === 'absence') return <PastilleEtat etat="surveiller">{j.saisie?.motif || 'absence'}</PastilleEtat>;
  if (j.etat === 'prevu' && j.jour < new Date().toISOString().slice(0, 10)) return <PastilleEtat etat="reussi">comme prévu</PastilleEtat>;
  return null;
}

export default function MonTemps({ api }) {
  const [d, setD] = useState(null);
  const [lundi, setLundi] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ecart, setEcart] = useState(null);        // { jour, … } : la fenêtre « j'ai travaillé autrement »
  const [choix, setChoix] = useState(null);        // { lundi, statut } : la fenêtre de demande
  const [enCours, setEnCours] = useState(false);
  const charger = l => api(`/mon-temps${l ? `?lundi=${l}` : ''}`).then(j => { setD(j); setLundi(j.semaine.lundi); setErreur(null); }).catch(e => setErreur(e.message));
  useEffect(() => { charger(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (erreur && !d) return <Encadre etat="corriger" titre="Mon temps">{erreur}</Encadre>;
  if (!d) return <p className="text-sm text-slate-500">Chargement…</p>;
  if (!d.genere) return <Encadre etat="neutre" titre="Votre année n’est pas encore préparée">La direction prépare l’année (Préparer l’année → Générer) : vos semaines paraîtront ici.</Encadre>;

  const aSigner = d.releves.find(r => !r.signe_personne);
  const signerMois = async mois => {
    setEnCours(true);
    try { await api(`/signer/${moiId()}`, { method: 'POST', body: JSON.stringify({ objet: 'releve', periode: mois, etape: 'personne' }) }); await charger(lundi); }
    catch (e) { informer({ message: e.message }); } finally { setEnCours(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[180px]"><TuileEtat etat="disponible" valeur={hm(d.semaine.prevu)} libelle={`prévues la semaine du ${court(d.semaine.lundi)}`} /></div>
        <div className="flex-1 min-w-[180px]"><TuileEtat etat={d.solde >= 0 ? 'reussi' : 'surveiller'} valeur={`${d.solde >= 0 ? '+ ' : ''}${hm(d.solde)}`} libelle="solde de l’année" precision={`${hm(d.prevu_annee)} prévues sur ${hm(d.du_annee)}`} /></div>
        <div className="flex-1 min-w-[180px]"><TuileEtat etat="reussi" valeur={d.prochain_conge ? court(d.prochain_conge.du) : '—'} libelle="prochain congé" precision={d.prochain_conge?.libelle || ''} /></div>
        <div className="flex-1 min-w-[180px]"><TuileEtat etat={aSigner ? 'surveiller' : 'reussi'} valeur={aSigner ? moisFr(aSigner.mois) : 'à jour'} libelle={aSigner ? 'relevé à signer' : 'relevés signés'} /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Ma semaine" sous={`du ${jourFr(d.semaine.lundi)} au ${jourFr(plusJours(d.semaine.lundi, 6))}`}>
            <div className="flex gap-1">
              <button type="button" className="bouton !px-2" aria-label="Semaine précédente" onClick={() => charger(plusJours(lundi, -7))}><IconChevronLeft size={15} /></button>
              <button type="button" className="bouton !px-2" aria-label="Semaine suivante" onClick={() => charger(plusJours(lundi, 7))}><IconChevronRight size={15} /></button>
            </div>
          </EnteteCarte>
          <Tableau dense className="!border-0 !rounded-none">
            <TableauEntete><Th>Jour</Th><Th>Prévu</Th><Th align="droite">Heures</Th><Th>Ce qui s’est passé</Th></TableauEntete>
            <tbody>{d.semaine.jours.filter(j => j.prevu || j.etat !== 'libre' || j.saisie).map(j => {
              const verrou = d.semaine.verrous[j.jour.slice(0, 7)];
              return (
                <Tr key={j.jour}>
                  <Td className="whitespace-nowrap capitalize">{jourFr(j.jour)}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{j.plan?.debut ? `${j.plan.debut} → ${j.plan.fin}` : <span className="text-slate-400">{ETAT[j.etat] ?? ''}</span>}</Td>
                  <Td align="droite" className="tabular-nums">{j.prevu ? hm(j.prevu) : ''}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <CeQuiSestPasse j={j} />
                      {!verrou && (j.plan?.debut || j.saisie) && !j.ferie && (
                        <button type="button" className="text-second underline text-iip-blue" onClick={() => setEcart({ ...j })}>
                          {j.saisie ? 'Corriger' : 'J’ai travaillé autrement'}</button>)}
                    </div>
                  </Td>
                </Tr>);
            })}</tbody>
          </Tableau>
          <p className="text-mention text-slate-500 m-0 px-4 py-2">L’horaire prévu fait foi : on n’encode que ce qui a changé. Lucie contrôle seule les règles (8 h par jour, 11 h de repos, pause au-delà de 6 h).</p>
        </section>

        <section className="carte overflow-hidden">
          <EnteteCarte titre="Mon relevé" sous="signé par vous, approuvé par la direction" />
          <ListeEtats className="!border-0 !rounded-none">
            {d.releves.map(r => (
              <LigneEtat key={r.mois} etat={r.signe_direction ? 'reussi' : r.signe_personne ? 'disponible' : 'surveiller'}
                titre={<span className="capitalize">{moisFr(r.mois)}</span>}
                sous={`${hm(r.reel)} prestées · ${hm(r.prevu)} prévues · ${r.ecart >= 0 ? '+ ' : ''}${hm(r.ecart)}`}
                droite={r.signe_personne
                  ? <span className="text-second text-slate-500">{r.signe_direction ? 'approuvé' : 'signé, chez la direction'}</span>
                  : <button type="button" className="bouton bouton-fort" disabled={enCours} onClick={() => signerMois(r.mois)}>Signer</button>} />))}
          </ListeEtats>
        </section>
      </div>

      <section className="carte overflow-hidden">
        <EnteteCarte titre="Mon année, semaine par semaine" sous="touchez une semaine à venir pour demander un changement" />
        <div className="p-4 space-y-3">
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
            {d.annee.map(s => {
              const conge = s.statut && s.statut !== 'travail';
              const fond = s.fermeture === 'totale' ? 'rgb(var(--gris-200))' : conge ? 'color-mix(in srgb, var(--c-reussi) 18%, white)'
                : s.forte ? 'color-mix(in srgb, var(--c-disponible) 22%, white)' : 'color-mix(in srgb, var(--c-principal) 8%, white)';
              const ici = d.semaine.lundi === s.lundi;
              return (
                <button key={s.lundi} type="button" disabled={s.passee || s.fermeture === 'totale'}
                  title={`Semaine du ${long(s.lundi)} — ${conge ? (s.libelle || 'congé') : s.statut === 'travail' ? hm(s.minutes) : '—'}${s.demande ? ' · demande en attente' : ''}`}
                  onClick={() => setChoix({ lundi: s.lundi, statut: s.statut })}
                  className={`h-8 rounded-md text-[10.5px] tabular-nums ${s.passee ? 'opacity-50' : 'hover:brightness-95'}`}
                  style={{ background: fond, color: 'rgb(var(--gris-700))', outline: ici ? '2px solid var(--c-principal)' : undefined, outlineOffset: 1,
                    border: s.demande ? '1px dashed var(--c-attente)' : '1px solid transparent' }}>
                  {court(s.lundi)}</button>);
            })}
          </div>
          <div className="flex flex-wrap gap-4 text-mention text-slate-500">
            <span><i className="inline-block w-3.5 h-3 rounded-sm align-[-1px] mr-1" style={{ background: 'color-mix(in srgb, var(--c-principal) 8%, white)' }} />travail</span>
            <span><i className="inline-block w-3.5 h-3 rounded-sm align-[-1px] mr-1" style={{ background: 'color-mix(in srgb, var(--c-disponible) 22%, white)' }} />semaine forte</span>
            <span><i className="inline-block w-3.5 h-3 rounded-sm align-[-1px] mr-1" style={{ background: 'color-mix(in srgb, var(--c-reussi) 18%, white)' }} />congé</span>
            <span><i className="inline-block w-3.5 h-3 rounded-sm align-[-1px] mr-1" style={{ background: 'rgb(var(--gris-200))' }} />école fermée</span>
            <span><i className="inline-block w-3.5 h-3 rounded-sm align-[-1px] mr-1" style={{ border: '1px dashed var(--c-attente)' }} />demande en attente</span>
          </div>
        </div>
      </section>

      <section className="carte overflow-hidden">
        <EnteteCarte titre="Mes demandes" sous="la direction les accepte ou les refuse ; Lucie recalcule alors l’année" />
        {d.demandes.length ? (
          <ListeEtats className="!border-0 !rounded-none">
            {d.demandes.map(x => (
              <LigneEtat key={x.id} etat={x.statut === 'acceptee' ? 'reussi' : x.statut === 'refusee' ? 'corriger' : x.statut === 'retiree' ? 'neutre' : 'disponible'}
                titre={x.resume} attenue={x.statut === 'retiree'}
                sous={x.statut === 'acceptee' ? `acceptée le ${long(String(x.direction_le).slice(0, 10))}`
                  : x.statut === 'refusee' ? `refusée : ${x.motif_refus || ''}` : x.statut === 'retiree' ? 'retirée'
                  : `envoyée le ${long(String(x.propose_le).slice(0, 10))} · en attente de la direction${x.mot ? ` · « ${x.mot} »` : ''}`}
                droite={['proposee', 'controlee'].includes(x.statut) ? (
                  <button type="button" className="bouton" onClick={async () => {
                    try { await api(`/modulations/${x.id}/refuser`, { method: 'POST', body: JSON.stringify({}) }); await charger(lundi); }
                    catch (e) { informer({ message: e.message }); } }}>Retirer</button>) : null} />))}
          </ListeEtats>
        ) : <p className="text-sm text-slate-500 m-0 px-4 py-3">Aucune demande.</p>}
      </section>

      {ecart && <FenetreEcart j={ecart} absences={d.absences} api={api} onFermer={() => setEcart(null)} onFait={() => { setEcart(null); charger(lundi); }} />}
      {choix && <FenetreDemande s={choix} d={d} api={api} onFermer={() => setChoix(null)} onFait={() => { setChoix(null); charger(lundi); }} />}
    </div>
  );
}

const moiId = () => getUser()?.id ?? '';

/* « J'AI TRAVAILLÉ AUTREMENT » : de, à, la pause, pourquoi — ou une absence. */
function FenetreEcart({ j, absences, api, onFermer, onFait }) {
  const plan = j.plan || {};
  const pause0 = plan.pause_debut && plan.pause_fin ? (([a, b], [c, e]) => (c * 60 + e) - (a * 60 + b))(plan.pause_debut.split(':').map(Number), plan.pause_fin.split(':').map(Number)) : 0;
  const [type, setType] = useState(j.saisie?.type || 'reel');
  const [debut, setDebut] = useState(j.saisie?.debut || plan.debut || '08:00');
  const [fin, setFin] = useState(j.saisie?.fin || plan.fin || '16:00');
  const [pause, setPause] = useState(pause0);
  const [motif, setMotif] = useState(j.saisie?.motif || Object.keys(absences || {})[0] || '');
  const [note, setNote] = useState(j.saisie?.note || '');
  const [erreur, setErreur] = useState(null);
  const envoyer = async corps => {
    try { await api(`/ecart/${moiId()}/${j.jour}`, { method: 'PUT', body: JSON.stringify(corps) }); onFait(); }
    catch (e) { setErreur(e.message); }
  };
  const enregistrer = () => envoyer(type === 'absence' ? { type: 'absence', motif, note }
    : { type: 'reel', debut, fin, note, ...(pause ? { pause_debut: plan.pause_debut || '12:00', pause_fin: plusMinutes(plan.pause_debut || '12:00', Number(pause)) } : {}) });
  return (
    <Fenetre titre={`Le ${jourFr(j.jour)}`} sous={plan.debut ? `prévu ${plan.debut} → ${plan.fin}` : ''} large="petite" onFermer={onFermer}
      pied={<div className="flex items-center gap-2 w-full">
        {j.saisie && <button type="button" className="bouton" onClick={() => envoyer({ type: 'aucun' })}>Revenir au prévu</button>}
        <span className="flex-1" />
        <button type="button" className="bouton" onClick={onFermer}>Annuler</button>
        <button type="button" className="bouton bouton-fort" onClick={enregistrer}>Enregistrer</button></div>}>
      <div className="space-y-3">
        <div className="segments flex w-max">
          <button type="button" onClick={() => setType('reel')} className={type === 'reel' ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>J’ai travaillé</button>
          <button type="button" onClick={() => setType('absence')} className={type === 'absence' ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>J’étais absente / absent</button>
        </div>
        {type === 'reel' ? (
          <div className="flex flex-wrap gap-3 text-second text-slate-600">
            <label className="grid gap-1">De<input type="time" className="controle" value={debut} onChange={e => setDebut(e.target.value)} /></label>
            <label className="grid gap-1">À<input type="time" className="controle" value={fin} onChange={e => setFin(e.target.value)} /></label>
            <label className="grid gap-1">Pause<select className="controle" value={pause} onChange={e => setPause(Number(e.target.value))}>
              {[0, 15, 30, 45, 60].map(m => <option key={m} value={m}>{m ? `${m} min` : 'aucune'}</option>)}</select></label>
          </div>
        ) : (
          <label className="grid gap-1 text-second text-slate-600">Pourquoi<select className="controle" value={motif} onChange={e => setMotif(e.target.value)}>
            {Object.entries(absences || {}).map(([k, v]) => <option key={k} value={k}>{v.libelle}</option>)}</select></label>
        )}
        <label className="grid gap-1 text-second text-slate-600">Un mot (facultatif)<input className="controle" data-reponses="non" value={note} onChange={e => setNote(e.target.value)} placeholder="ex. inscriptions, réunion du soir" /></label>
        {erreur && <Encadre etat="corriger" titre="Refusé">{erreur}</Encadre>}
      </div>
    </Fenetre>
  );
}

/* LA DEMANDE : on choisit ce qu'on voudrait ; pour un congé, la semaine de congé qu'on travaillera en échange (13 semaines,
   toujours). Lucie compose et contrôle ; la direction accepte d'un clic. */
function FenetreDemande({ s, d, api, onFermer, onFait }) {
  const travail = s.statut === 'travail';
  const [type, setType] = useState(travail ? 'conge' : 'travailler');
  const [echange, setEchange] = useState('');
  const [heures, setHeures] = useState('2');
  const [mot, setMot] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const listeEchange = (type === 'conge' ? d.conges_echangeables : d.travail_echangeable).filter(l => l !== s.lundi);
  const envoyer = async () => {
    setEnCours(true); setErreur(null);
    try { await api('/demande', { method: 'POST', body: JSON.stringify({ type, lundi: s.lundi, echange: echange || null, heures, mot }) }); onFait(); }
    catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const types = travail ? [['conge', 'Je voudrais être en congé cette semaine'], ['plus', 'Je voudrais faire plus d’heures cette semaine'], ['moins', 'Je voudrais faire moins d’heures cette semaine']]
    : [['travailler', 'Je voudrais travailler cette semaine (au lieu d’un congé)']];
  return (
    <Fenetre titre={`Semaine du ${long(s.lundi)}`} large="moyenne" onFermer={onFermer}
      pied={<div className="flex items-center gap-2 w-full"><span className="flex-1" />
        <button type="button" className="bouton" onClick={onFermer}>Annuler</button>
        <button type="button" className="bouton bouton-fort" disabled={enCours || ((type === 'conge' || type === 'travailler') && !echange)} onClick={envoyer}>Envoyer la demande</button></div>}>
      <div className="space-y-3 text-sm">
        <div className="grid gap-1.5">
          {types.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><input type="radio" checked={type === k} onChange={() => { setType(k); setEchange(''); }} />{l}</label>))}
        </div>
        {(type === 'conge' || type === 'travailler') && (
          <label className="grid gap-1 text-second text-slate-600">
            {type === 'conge' ? 'En échange, je travaille la semaine de congé du' : 'En échange, je prends en congé la semaine du'}
            <select className="controle" value={echange} onChange={e => setEchange(e.target.value)}>
              <option value="">— choisir —</option>
              {listeEchange.map(l => <option key={l} value={l}>{long(l)}</option>)}
            </select>
            <span className="text-mention text-slate-500">Treize semaines de congé sur l’année, toujours : une semaine prise se rend ailleurs. Une semaine où l’école est fermée ne se travaille pas.</span>
          </label>)}
        {(type === 'plus' || type === 'moins') && (
          <label className="grid gap-1 text-second text-slate-600">Combien d’heures {type === 'plus' ? 'de plus' : 'de moins'} ?
            <input type="number" min="0.5" max="12" step="0.5" className="controle w-28" value={heures} onChange={e => setHeures(e.target.value)} />
            <span className="text-mention text-slate-500">Lucie reporte la différence sur les semaines à venir, pour que l’année garde ses 1 404 heures.</span>
          </label>)}
        <label className="grid gap-1 text-second text-slate-600">Un mot pour la direction (facultatif)
          <input className="controle" data-reponses="non" value={mot} onChange={e => setMot(e.target.value)} /></label>
        {erreur && <Encadre etat="corriger" titre="La demande ne tient pas">{erreur}</Encadre>}
      </div>
    </Fenetre>
  );
}

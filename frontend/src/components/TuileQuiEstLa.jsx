import { useEffect, useState } from 'react';
import { IconLifebuoy, IconChevronRight, IconPhone, IconPlus, IconTrash, IconDoorEnter, IconDoorExit } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';
import { demander, informer } from '../lib/dialogue.jsx';

/**
 * QUI EST LÀ ? (3.1.287, Charles, 11 octobre 2026, d'après l'idée de Jérôme à l'EPFC : « en cas
 * de souci, on clique et on sait de suite qui est là ou qui est de permanence ; si on clique,
 * ça appelle »). La tuile dit en une ligne qui est là maintenant et qui est de permanence ; la
 * fenêtre donne les numéros — un clic appelle (téléphone, ou l'application d'appel de
 * l'ordinateur). Présent = « J'arrive » du jour s'il existe, sinon l'horaire de la semaine.
 */
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
// « Pas ocre… fraise » (Charles) : ce qui empêche de joindre quelqu'un prend le rouge du réglage « à corriger ».
const FRAISE = 'var(--c-refuse)';
const telLien = t => `tel:${String(t || '').replace(/[^\d+]/g, '')}`;

function Appeler({ p }) {
  if (!p.telephone) return <span className="text-mention text-slate-400">pas de numéro affiché</span>;
  return (
    <a href={telLien(p.telephone)} className="bouton bouton-fort inline-flex items-center gap-1.5 whitespace-nowrap" title={`Appeler ${p.nom}`}>
      <IconPhone size={15} /> {p.telephone}
    </a>);
}

export default function TuileQuiEstLa() {
  const [d, setD] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [face, setFace] = useState('maintenant');
  const charger = () => fetch('/api/equipe/maintenant', { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  useEffect(() => { charger(); const t = setInterval(charger, 60000); return () => clearInterval(t); }, []);
  if (!d) return null;

  const permEnCours = d.permanences.filter(p => p.en_cours);
  const resume = d.presents.length
    ? `${d.presents.length} personne${d.presents.length > 1 ? 's' : ''} là maintenant : ${d.presents.slice(0, 3).map(p => p.nom).join(', ')}${d.presents.length > 3 ? '…' : ''}`
    : 'Personne n’est signalé présent pour l’instant';
  const perm = permEnCours.length ? `Permanence : ${permEnCours.map(p => `${p.nom} jusqu’à ${p.fin}${p.secours.length ? ` (secours : ${p.secours.map(x => x.nom).join(', ')})` : ''}`).join(', ')}`
    : d.permanences.length ? `Permanence aujourd’hui : ${d.permanences.map(p => `${p.nom} ${p.debut}-${p.fin}`).join(', ')}` : '';

  return (<>
    <button type="button" onClick={() => { setFace('maintenant'); setOuvert(true); charger(); }} data-etat="disponible"
      className="bloc-etat w-full text-left px-4 py-3 flex items-center gap-3 hover:brightness-[.98]">
      <IconLifebuoy size={22} style={{ color: 'var(--c-disponible)' }} className="flex-none" />
      <span className="min-w-0 flex-1">
        <b className="text-sm">Qui est là ? — en cas de souci</b>
        <span className="block text-second text-slate-500 truncate">{resume}{perm ? ` · ${perm}` : ''}</span>
      </span>
      <IconChevronRight size={16} className="text-slate-400 flex-none" />
    </button>
    {ouvert && <FenetreQuiEstLa d={d} face={face} setFace={setFace} recharger={charger} onFermer={() => setOuvert(false)} />}
  </>);
}

/* LE BOUTON D'URGENCE (12 octobre 2026, Charles : « dans le menu principal, un bouton orange avec
   téléphone d'urgence ; il mène vers les contacts d'urgence et la permanence »). Sur tous les écrans,
   pour tout le monde : la fenêtre « Qui est là ? », ouverte sur « Maintenant ». */
export function BoutonUrgence() {
  const [d, setD] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [face, setFace] = useState('maintenant');
  const charger = () => fetch('/api/equipe/maintenant', { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(setD).catch(() => {});
  return (<>
    <button type="button" onClick={async () => { setFace('maintenant'); await charger(); setOuvert(true); }}
      className="objet-barre objet-barre-etat" style={{ '--e': 'var(--c-attente)' }}
      title="Urgence : qui est là, qui est de permanence, et l’appeler">
      <IconPhone size={16} /> Urgence
    </button>
    {ouvert && d && <FenetreQuiEstLa d={d} face={face} setFace={setFace} recharger={charger} onFermer={() => setOuvert(false)} />}
  </>);
}

function FenetreQuiEstLa({ d, face, setFace, recharger, onFermer }) {
  async function pointer(etat) {
    await fetch('/api/equipe/pointer', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ etat }) });
    recharger();
  }
  return (
    <Fenetre titre="Qui est là ?" sous={`${JOURS[d.jour - 1]} ${d.date.split('-').reverse().join('/')} · ${d.heure}`} large="grande" onFermer={onFermer}
      pied={<>
        <span className="text-second text-slate-500 min-w-0 flex-1">
          {d.moi.etat === 'la' ? `Vous êtes signalé présent depuis ${d.moi.depuis}.` : d.moi.etat === 'parti' ? `Vous êtes signalé parti depuis ${d.moi.depuis}.` : 'Signalez votre présence : elle corrige votre horaire pour aujourd’hui.'}
        </span>
        <button className="bouton" onClick={() => pointer('la')}><IconDoorEnter size={15} className="inline -mt-0.5 mr-1" />J’arrive</button>
        <button className="bouton" onClick={() => pointer('parti')}><IconDoorExit size={15} className="inline -mt-0.5 mr-1" />Je pars</button>
        <button className="bouton bouton-fort" onClick={onFermer}>Fermer</button>
      </>}>
      <div className="flex items-center gap-1 border-b border-slate-200 mb-3">
        {[['maintenant', 'Maintenant'], ['moi', 'Mon horaire et mon numéro'], ...(d.peut_gerer ? [['equipe', 'Horaires de l’équipe'], ['permanences', 'Permanences']] : [])].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFace(k)} className={`onglet-page ${face === k ? 'onglet-page-actif' : ''}`}>{l}</button>))}
      </div>
      {face === 'maintenant' && <Maintenant d={d} />}
      {face === 'moi' && <Moi d={d} recharger={recharger} />}
      {face === 'equipe' && <HorairesEquipe d={d} recharger={recharger} />}
      {face === 'permanences' && <Permanences recharger={recharger} />}
    </Fenetre>);
}

function Maintenant({ d }) {
  return (
    <div className="space-y-4">
      <section>
        <div className="intertitre mb-1.5">De permanence aujourd’hui</div>
        {!d.permanences.length ? <p className="text-sm text-slate-500">Aucune permanence prévue aujourd’hui.</p>
          : <ul className="divide-y divide-slate-100">{d.permanences.map(p => (
              <li key={p.id} className="py-2 flex items-center gap-3">
                <span className="min-w-0 flex-1"><b className="text-sm">{p.nom}</b>
                  <span className="block text-second text-slate-500">{p.debut}–{p.fin}{p.habituelle ? ' · permanence habituelle' : ''}{p.en_cours ? ' · en ce moment' : ''}{p.note ? ` · ${p.note}` : ''}</span>
                  {p.secours.map((x, k) => (
                    <span key={x.id} className="mt-1 flex items-center gap-2 text-second">
                      <span className="text-slate-500">Si pas de réponse — secours {k + 1} :</span> <b>{x.nom}</b>
                      {x.telephone ? <a href={telLien(x.telephone)} className="underline" title={`Appeler ${x.nom}`}><IconPhone size={13} className="inline -mt-0.5" /> {x.telephone}</a>
                        : <span style={{ color: FRAISE }}>pas de numéro affiché</span>}
                    </span>))}</span>
                <Appeler p={p} /></li>))}</ul>}
      </section>
      <section>
        <div className="intertitre mb-1.5">La journée de l’équipe</div>
        {!d.journee?.length ? <p className="text-sm text-slate-500">Personne n’a d’horaire aujourd’hui ni ne s’est signalé.</p>
          : <FriseJournee journee={d.journee} heure={d.heure} />}
      </section>
    </div>);
}

/* LA JOURNÉE EN FRISE (12 octobre 2026, Charles : « graphique horizontal avec ligne verte de dispo sur
   la journée, et la pause de midi »). Une ligne par personne, à l'échelle de l'heure : le vert dit
   quand on peut la trouver, le gris hachuré sa pause, le trait marine l'heure qu'il est. Un « J'arrive »
   hors horaire se dessine aussi ; après « Je pars », le reste de la journée s'éteint. */
const enMin = h => { const [a, b] = String(h || '').split(':').map(Number); return a * 60 + (b || 0); };
function FriseJournee({ journee, heure }) {
  const maintenant = enMin(heure);
  const bornes = journee.flatMap(p => [...p.plages.flatMap(h => [enMin(h.debut), enMin(h.fin)]), ...p.pointages.map(x => enMin(x.heure))]);
  const debut = Math.floor(Math.min(7 * 60, maintenant, ...bornes) / 60) * 60;
  const fin = Math.ceil(Math.max(19 * 60, maintenant, ...bornes) / 60) * 60;
  const pct = m => `${((Math.min(fin, Math.max(debut, m)) - debut) / (fin - debut)) * 100}%`;
  const larg = (a, b) => `${((Math.min(fin, b) - Math.max(debut, a)) / (fin - debut)) * 100}%`;
  const heures = []; for (let h = debut; h <= fin; h += 60) heures.push(h);
  const VERT = 'var(--c-reussi)';
  const HACHURE = 'repeating-linear-gradient(135deg, rgb(var(--gris-300)) 0 3px, transparent 3px 6px)';
  const etat = p => {
    const ici = p.plages.find(h => h.debut <= heure && heure < h.fin);
    const lieu = ici?.lieu === LIEU_AGENDA ? 'selon son agenda — joindre par téléphone' : ici?.lieu;
    const pause = p.plages.find(h => h.pause_debut && h.pause_debut <= heure && heure < h.pause_fin);
    const dernier = p.pointages[p.pointages.length - 1];
    if (p.etat === 'parti') return `parti à ${dernier?.heure}`;
    if (p.etat === 'pause') return `en pause jusqu’à ${pause?.pause_fin}`;
    if (p.etat === 'la') return [dernier?.etat === 'la' ? `arrivé à ${dernier.heure}` : `là jusqu’à ${ici?.fin}`, lieu].filter(Boolean).join(' · ');
    if (p.etat === 'attendu') return `attendu à ${p.plages.find(h => h.debut > heure)?.debut}`;
    return `a fini à ${p.plages[p.plages.length - 1]?.fin}`;
  };
  return (
    <div className="space-y-1">
      {/* L'échelle des heures */}
      <div className="flex items-end gap-3">
        <span className="w-52 flex-none" />
        <div className="relative flex-1 h-4 text-mention text-slate-400 tabular-nums">
          {heures.map(h => <span key={h} className="absolute -translate-x-1/2" style={{ left: pct(h) }}>{h / 60}h</span>)}
        </div>
        <span className="w-36 flex-none" />
      </div>
      {journee.map(p => {
        const parti = p.etat === 'parti' ? enMin(p.pointages[p.pointages.length - 1]?.heure) : null;
        // « J'arrive » hors horaire : du pointage à maintenant (ou au départ).
        const arrivee = p.pointages.find(x => x.etat === 'la');
        const horsHoraire = arrivee && !p.plages.some(h => h.debut <= arrivee.heure && arrivee.heure < h.fin);
        const injoignable = p.plages.some(h => h.lieu === LIEU_AGENDA) && !p.telephone;
        return (
          <div key={p.id} className="flex items-center gap-3 py-1.5 border-t border-slate-100">
            <span className="w-52 flex-none min-w-0">
              <b className="text-sm">{p.nom}</b> <span className="text-second text-slate-500">{p.role}</span>
              <span className="block text-second text-slate-500 truncate" title={etat(p)}>{etat(p)}</span>
              {injoignable && <span className="block text-second" style={{ color: FRAISE }}>aucun numéro affiché : injoignable</span>}
            </span>
            <div className={`relative flex-1 h-5 rounded bg-slate-100 overflow-hidden ${p.etat === 'parti' || p.etat === 'fini' ? 'opacity-60' : ''}`}>
              {heures.slice(1, -1).map(h => <span key={h} className="absolute top-0 bottom-0 w-px bg-white/70" style={{ left: pct(h) }} />)}
              {p.plages.map((h, k) => (
                <span key={k}>
                  <span className="absolute top-1 bottom-1 rounded-sm" style={{ left: pct(enMin(h.debut)), width: larg(enMin(h.debut), enMin(h.fin)), background: VERT }}
                    title={`${h.debut}–${h.fin}${h.lieu ? ` · ${h.lieu}` : ''}`} />
                  {h.pause_debut && h.pause_fin && (
                    <span className="absolute top-0 bottom-0 bg-white" style={{ left: pct(enMin(h.pause_debut)), width: larg(enMin(h.pause_debut), enMin(h.pause_fin)), backgroundImage: HACHURE }}
                      title={`Pause ${h.pause_debut}–${h.pause_fin}`} />)}
                </span>))}
              {horsHoraire && (
                <span className="absolute top-1 bottom-1 rounded-sm" style={{ left: pct(enMin(arrivee.heure)), width: larg(enMin(arrivee.heure), parti ?? maintenant), background: VERT, opacity: 0.6 }}
                  title={`Arrivé à ${arrivee.heure}, hors horaire`} />)}
              {parti != null && (
                <span className="absolute top-0 bottom-0 bg-slate-200/90" style={{ left: pct(parti), right: 0 }} title={`Parti à ${p.pointages[p.pointages.length - 1].heure}`} />)}
              <span className="absolute top-0 bottom-0 w-0.5" style={{ left: pct(maintenant), background: 'var(--c-principal)' }} title={`Il est ${heure}`} />
            </div>
            <span className="w-36 flex-none flex justify-end">
              {p.etat === 'la' ? <Appeler p={p} /> : p.etat === 'pause' ? <span className="text-mention text-slate-500">en pause</span> : null}
            </span>
          </div>);
      })}
      <p className="text-mention text-slate-400 pt-1 flex flex-wrap gap-x-4">
        <span><span className="inline-block w-3 h-2 rounded-sm align-middle mr-1" style={{ background: VERT }} />disponible</span>
        <span><span className="inline-block w-3 h-2 align-middle mr-1" style={{ backgroundImage: HACHURE }} />pause</span>
        <span><span className="inline-block w-0.5 h-3 align-middle mr-1" style={{ background: 'var(--c-principal)' }} />maintenant ({heure})</span>
      </p>
    </div>);
}

/* L'HORAIRE DE L'ÉQUIPE (12 octobre 2026, Charles : « où est-ce que je définis cet horaire pour mon
   équipe ? ») : la direction et le secrétariat règlent l'horaire de chacun. Le numéro, lui, reste
   à chacun — on n'affiche pas le téléphone d'un autre à sa place. */
function HorairesEquipe({ d, recharger }) {
  const [personnes, setPersonnes] = useState([]);
  const [qui, setQui] = useState('');
  const [fait, setFait] = useState(null);   // la personne qu'on vient d'enregistrer : on enchaîne sur la suivante
  useEffect(() => { fetch('/api/equipe/personnes', { headers: authHeaders() }).then(r => r.json()).then(setPersonnes).catch(() => {}); }, []);
  return (
    <div className="space-y-4">
      <label className="text-second block">Personne
        <select className="controle block" value={qui} onChange={e => setQui(e.target.value)}>
          <option value="">— choisir —</option>{personnes.map(p => <option key={p.id} value={p.id}>{p.nom} ({p.role})</option>)}</select></label>
      {fait && !qui && <p className="text-sm" style={{ color: 'var(--c-reussi)' }}>✓ Horaire de {fait} enregistré. Choisissez la personne suivante.</p>}
      {qui ? <Moi key={qui} d={d} recharger={recharger} utilisateur={Number(qui)} aTelephone={!!personnes.find(p => String(p.id) === String(qui))?.a_telephone}
        apresEnregistrement={() => { setFait(personnes.find(p => String(p.id) === String(qui))?.nom || 'cette personne'); setQui(''); }} />
        : !fait && <p className="text-sm text-slate-500">Choisissez une personne pour régler son horaire de la semaine.</p>}
    </div>);
}

/* Les lieux de la maison (Charles, 12 octobre 2026 : « pour le lieu, une liste déroulante »).
   Un lieu déjà enregistré hors de la liste reste affiché, pour ne rien perdre. */
const LIEU_AGENDA = 'Selon l’agenda — joindre par téléphone';   // en réunion dehors : pas de lieu fixe, le téléphone fait foi
const LIEUX = [LIEU_AGENDA, 'Secrétariat', 'Direction', 'Accueil', 'Coordination', 'Bureau', 'Salle des professeurs', 'Télétravail', 'Extérieur'];
const minutes = h => { const [a, b] = String(h || '').split(':').map(Number); return Number.isFinite(a) ? a * 60 + (b || 0) : null; };
const duree = p => {
  const a = minutes(p.debut), b = minutes(p.fin);
  if (a == null || b == null || b <= a) return 0;
  const pa = minutes(p.pause_debut), pb = minutes(p.pause_fin);
  const pause = pa != null && pb != null && pb > pa ? Math.max(0, Math.min(b, pb) - Math.max(a, pa)) : 0;
  return b - a - pause;
};
// La pause de midi proposée (Charles : « de 12 h 00 à 12 h 30 ») quand la plage passe midi.
const avecPauseMidi = p => (p.debut <= '12:00' && p.fin >= '12:30' ? { ...p, pause_debut: '12:00', pause_fin: '12:30' } : p);
const enHeures = m => `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;

function Moi({ d, recharger, utilisateur = null, apresEnregistrement = null, aTelephone = false }) {
  const [plages, setPlages] = useState(null);
  const [tel, setTel] = useState(d.moi.telephone || '');
  useEffect(() => { fetch(`/api/equipe/horaire${utilisateur ? `?utilisateur=${utilisateur}` : ''}`, { headers: authHeaders() }).then(r => r.json()).then(setPlages).catch(() => setPlages([])); }, [utilisateur]);
  if (!plages) return <div className="text-sm text-slate-400">Chargement…</div>;
  const maj = (i, k, v) => setPlages(l => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  async function enregistrer() {
    if (!utilisateur) await fetch('/api/equipe/telephone', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ telephone: tel }) });
    const r = await fetch('/api/equipe/horaire', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ plages, ...(utilisateur ? { utilisateur } : {}) }) });
    const j = await r.json().catch(() => ({}));
    recharger();
    if (r.ok && apresEnregistrement) return apresEnregistrement();
    await informer(r.ok ? `✓ Enregistré : ${j.plages} plage(s) d’horaire.` : `❌ ${j.error || 'Erreur'}`);
  }
  const total = plages.reduce((s, p) => s + duree(p), 0);
  const sansNumero = plages.some(p => p.lieu === LIEU_AGENDA) && !(utilisateur ? aTelephone : tel.trim());
  return (
    <div className="space-y-4">
      {!utilisateur && <label className="block">
        <span className="intertitre block mb-1">Le numéro que j’accepte d’afficher</span>
        <input value={tel} onChange={e => setTel(e.target.value)} placeholder="Ex. : 02 560 29 60 ou GSM de service" className="controle w-72" data-reponses="non" />
        <span className="block text-second text-slate-500 mt-1">Il ne s’affiche que dans « Qui est là ? », quand vous êtes présent ou de permanence. Vide : aucun numéro.</span>
      </label>}
      <div>
        <span className="intertitre block mb-1">{utilisateur ? 'Son horaire de la semaine' : 'Mon horaire de la semaine'}</span>
        <table className="text-sm">
          <tbody>{plages.map((p, i) => (
            <tr key={i}>
              <td className="pr-2 py-1"><select className="controle !h-8" value={p.jour} onChange={e => maj(i, 'jour', Number(e.target.value))}>{JOURS.map((j, k) => <option key={j} value={k + 1}>{j}</option>)}</select></td>
              <td className="pr-2"><input type="time" className="controle !h-8" value={p.debut} onChange={e => maj(i, 'debut', e.target.value)} /></td>
              <td className="pr-2"><input type="time" className="controle !h-8" value={p.fin} onChange={e => maj(i, 'fin', e.target.value)} /></td>
              <td className="pr-2 whitespace-nowrap text-second text-slate-500">pause
                <input type="time" className="controle !h-8 mx-1" value={p.pause_debut || ''} onChange={e => maj(i, 'pause_debut', e.target.value)} />–
                <input type="time" className="controle !h-8 ml-1" value={p.pause_fin || ''} onChange={e => maj(i, 'pause_fin', e.target.value)} /></td>
              <td className="pr-2"><select className="controle !h-8 w-44" value={p.lieu || ''} onChange={e => maj(i, 'lieu', e.target.value)}>
                <option value="">— lieu —</option>
                {p.lieu && !LIEUX.includes(p.lieu) && <option value={p.lieu}>{p.lieu}</option>}
                {LIEUX.map(l => <option key={l} value={l}>{l}</option>)}</select></td>
              <td className="pr-3 text-slate-500 italic whitespace-nowrap tabular-nums">{duree(p) ? enHeures(duree(p)) : 'fin avant début'}</td>
              <td><button type="button" className="text-slate-400 hover:text-red-600" aria-label="Retirer" onClick={() => setPlages(l => l.filter((_, j) => j !== i))}><IconTrash size={15} /></button></td>
            </tr>))}</tbody>
        </table>
        {plages.length > 0 && <p className="text-sm text-slate-500 italic mt-1">Total de la semaine : {enHeures(total)}, pauses déduites</p>}
        {plages.some(p => !p.pause_debut && avecPauseMidi(p).pause_debut) && (
          <button type="button" className="bouton mt-2 mr-2" onClick={() => setPlages(l => l.map(p => (p.pause_debut ? p : avecPauseMidi(p))))}>Ajouter la pause de midi (12 h 00 – 12 h 30) aux plages qui passent midi</button>)}
        {sansNumero && <p className="text-sm mt-1" style={{ color: FRAISE }}>« Selon l’agenda » sans numéro affiché : personne ne pourra {utilisateur ? 'la' : 'vous'} joindre. {utilisateur ? 'Elle doit indiquer son numéro dans « Mon horaire et mon numéro ».' : 'Indiquez un numéro ci-dessus.'}</p>}
        <button type="button" className="bouton mt-2" onClick={() => setPlages(l => { const der = l[l.length - 1]; return [...l, der ? { ...der, jour: der.jour % 7 + 1 } : avecPauseMidi({ jour: 1, debut: '08:00', fin: '16:00', lieu: '' })]; })}><IconPlus size={14} className="inline -mt-0.5 mr-1" />Ajouter une plage</button>
      </div>
      <button className="bouton bouton-fort" onClick={enregistrer}>{apresEnregistrement ? 'Enregistrer et passer à une autre personne' : 'Enregistrer'}</button>
    </div>);
}

/* LES PERMANENCES (12 octobre 2026, Charles) : HABITUELLES, sans date — des jours de la semaine,
   jusqu'à ce qu'on les retire (« je suis de permanence tous les jours de 9 h à 19 h 30 ») —, ou
   DATÉES, pour un remplacement ou une soirée ; une datée l'emporte ce jour-là. Chacune peut porter
   un secours 1 et un secours 2 : « au cas où je ne réponds pas ». */
const JOURS_COURTS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
const nomsJours = js => (js.join(',') === '1,2,3,4,5' ? 'du lundi au vendredi' : js.join(',') === '1,2,3,4,5,6,7' ? 'tous les jours' : js.map(j => JOURS[j - 1].toLowerCase()).join(', '));
const secoursTexte = p => [p.secours1, p.secours2].filter(Boolean).map((n, k) => `secours ${k + 1} : ${n}`).join(' · ');

function ChoixPersonne({ libelle, valeur, personnes, onChange, vide = '—' }) {
  return (
    <label className="text-second flex flex-col gap-0.5">{libelle}
      <select className="controle block" value={valeur} onChange={e => onChange(e.target.value)}>
        <option value="">{vide}</option>{personnes.map(p => <option key={p.id} value={p.id}>{p.nom} ({p.role})</option>)}</select></label>);
}

function Permanences({ recharger }) {
  const [l, setL] = useState(null);
  const [h, setH] = useState(null);
  const [personnes, setPersonnes] = useState([]);
  const [mode, setMode] = useState('habituelle');
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), jours: [1, 2, 3, 4, 5], debut: '09:00', fin: '19:30', utilisateur_id: '', secours1_id: '', secours2_id: '', note: '', repeter: 1 });
  const lire = () => {
    fetch('/api/equipe/permanences', { headers: authHeaders() }).then(r => r.json()).then(setL).catch(() => setL([]));
    fetch('/api/equipe/permanences/habituelles', { headers: authHeaders() }).then(r => r.json()).then(setH).catch(() => setH([]));
  };
  useEffect(() => { lire(); fetch('/api/equipe/personnes', { headers: authHeaders() }).then(r => r.json()).then(setPersonnes).catch(() => {}); }, []);
  const basculerJour = j => setF(x => ({ ...x, jours: x.jours.includes(j) ? x.jours.filter(k => k !== j) : [...x.jours, j].sort() }));
  async function ajouter() {
    const url = mode === 'habituelle' ? '/api/equipe/permanences/habituelles' : '/api/equipe/permanences';
    const r = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { await informer(`❌ ${j.error || 'Erreur'}`); return; }
    setF(x => ({ ...x, utilisateur_id: '', secours1_id: '', secours2_id: '', note: '' }));
    lire(); recharger();
  }
  async function retirer(p, habituelle) {
    const quand = habituelle ? `${nomsJours(p.jours)}` : `le ${p.date.split('-').reverse().join('/')}`;
    if (!(await demander({ titre: 'Retirer cette permanence', message: `${p.nom}, ${quand}, de ${p.debut} à ${p.fin}.`, confirmer: 'Retirer' }))) return;
    await fetch(`/api/equipe/permanences/${habituelle ? 'habituelles/' : ''}${p.id}`, { method: 'DELETE', headers: authHeaders() });
    lire(); recharger();
  }
  const pret = f.utilisateur_id && (mode === 'datee' || f.jours.length);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="segments">
          {[['habituelle', 'Habituelle (sans date)'], ['datee', 'À une date']].map(([k, t]) => (
            <button key={k} type="button" aria-pressed={mode === k} className={mode === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'} onClick={() => setMode(k)}>{t}</button>))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {mode === 'habituelle'
            ? <div className="text-second flex flex-col gap-0.5">Jours
                <div className="flex gap-1">{JOURS_COURTS.map((t, k) => (
                  <button key={t} type="button" aria-pressed={f.jours.includes(k + 1)} onClick={() => basculerJour(k + 1)}
                    className={`controle !px-2 ${f.jours.includes(k + 1) ? 'controle-fort' : ''}`}>{t}</button>))}</div></div>
            : <label className="text-second flex flex-col gap-0.5">Date<input type="date" className="controle block" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>}
          <label className="text-second flex flex-col gap-0.5">De<input type="time" className="controle block" value={f.debut} onChange={e => setF({ ...f, debut: e.target.value })} /></label>
          <label className="text-second flex flex-col gap-0.5">À<input type="time" className="controle block" value={f.fin} onChange={e => setF({ ...f, fin: e.target.value })} /></label>
          {mode === 'datee' && <label className="text-second flex flex-col gap-0.5">Semaines<input type="number" min={1} max={52} className="controle block w-20" value={f.repeter} onChange={e => setF({ ...f, repeter: Number(e.target.value) || 1 })} title="Répéter la même permanence, semaine après semaine" /></label>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <ChoixPersonne libelle="De permanence" valeur={f.utilisateur_id} personnes={personnes} onChange={v => setF({ ...f, utilisateur_id: v })} />
          <ChoixPersonne libelle="Secours 1" valeur={f.secours1_id} personnes={personnes.filter(p => String(p.id) !== String(f.utilisateur_id))} onChange={v => setF({ ...f, secours1_id: v })} vide="— aucun —" />
          <ChoixPersonne libelle="Secours 2" valeur={f.secours2_id} personnes={personnes.filter(p => ![f.utilisateur_id, f.secours1_id].map(String).includes(String(p.id)))} onChange={v => setF({ ...f, secours2_id: v })} vide="— aucun —" />
          <label className="text-second flex flex-col gap-0.5">Note<input className="controle block w-40" value={f.note} placeholder="cours du soir…" onChange={e => setF({ ...f, note: e.target.value })} data-reponses="non" /></label>
          <button className="bouton bouton-fort" disabled={!pret} onClick={ajouter}><IconPlus size={14} className="inline -mt-0.5 mr-1" />Ajouter</button>
        </div>
      </div>

      <section>
        <div className="intertitre mb-1.5">Permanences habituelles</div>
        {!h ? <div className="text-sm text-slate-400">Chargement…</div> : !h.length ? <p className="text-sm text-slate-500">Aucune permanence habituelle.</p>
          : <ul className="divide-y divide-slate-100 text-sm">{h.map(p => (
              <li key={p.id} className="py-1.5 flex items-center gap-3">
                <span className="w-44">{nomsJours(p.jours)}</span>
                <span className="tabular-nums w-28">{p.debut}–{p.fin}</span>
                <span className="flex-1 min-w-0">{p.nom}{secoursTexte(p) ? <span className="text-slate-500"> · {secoursTexte(p)}</span> : null}{p.note ? <span className="text-slate-500"> · {p.note}</span> : null}</span>
                <button type="button" className="text-slate-400 hover:text-red-600" aria-label="Retirer" onClick={() => retirer(p, true)}><IconTrash size={15} /></button>
              </li>))}</ul>}
      </section>

      <section>
        <div className="intertitre mb-1.5">Permanences datées à venir</div>
        {!l ? <div className="text-sm text-slate-400">Chargement…</div> : !l.length ? <p className="text-sm text-slate-500">Aucune permanence datée à venir.</p>
          : <ul className="divide-y divide-slate-100 text-sm">{l.map(p => (
              <li key={p.id} className="py-1.5 flex items-center gap-3">
                <span className="tabular-nums w-24">{p.date.split('-').reverse().join('/')}</span>
                <span className="tabular-nums w-28">{p.debut}–{p.fin}</span>
                <span className="flex-1 min-w-0">{p.nom}{secoursTexte(p) ? <span className="text-slate-500"> · {secoursTexte(p)}</span> : null}{p.note ? <span className="text-slate-500"> · {p.note}</span> : null}</span>
                <button type="button" className="text-slate-400 hover:text-red-600" aria-label="Retirer" onClick={() => retirer(p, false)}><IconTrash size={15} /></button>
              </li>))}</ul>}
      </section>
    </div>);
}

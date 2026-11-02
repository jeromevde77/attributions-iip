/* LA LIGNE DU TEMPS DU SECRÉTARIAT (3.5.057, Charles, 2 novembre 2026 : « un zoom qui passe de l'horaire total à une vue
 * des semaines, puis zoom dans chaque semaine, genre ligne du temps ; supprimer des jours et les reporter ; donner une
 * semaine puis ajouter ailleurs avec un assistant ; les moments chauds et creux ; les grands moments »).
 * Trois zooms : l'ANNÉE (52 semaines, une barre par semaine et par personne, le trait des 36 h), les SEMAINES (huit
 * semaines, une barre par jour), la SEMAINE (l'horaire de chaque jour, de 7 h à 19 h). Au-dessus de chaque zoom : les
 * grands moments et la chaleur des semaines. L'assistant de modulation se tient à droite. Le serveur calcule tout
 * (lib/ligneTemps.js) ; l'écran montre et envoie. */
import { useEffect, useMemo, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconWand, IconX, IconFlame, IconSnowflake, IconFlag, IconCheck, IconSend, IconZoomIn } from '@tabler/icons-react';
import { EnteteCarte, PastilleEtat } from './ui.jsx';
import AgendaLigne, { useAgenda, GrilleAnnee, COL_NOM, HACHURE } from './AgendaLigne.jsx';
import AgendaMois from './AgendaMois.jsx';
import { demander, informer, saisir } from '../lib/dialogue.jsx';

const hm = m => { if (m == null) return ''; const s = m < 0 ? '−' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const court = m => (m ? hm(m).replace(' h ', 'h').replace(/h00$/, 'h') : '');
const plus = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const lundiDe = d => plus(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
const fmt = d => `${d.slice(8)}/${d.slice(5, 7)}`;
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven'];
const min = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const nomCourt = n => String(n || '').split(/\s+/).slice(0, 2).join(' ');
// La chaleur : une information d'état, donc une pastille pleine (ocre pour chaud, bleu pour creux).
const CHALEUR = { chaud: { fond: 'var(--c-attente)', mot: 'tension', Ic: IconFlame }, creux: { fond: 'var(--c-disponible)', mot: 'calme', Ic: IconSnowflake }, normal: { fond: null, mot: 'normale', Ic: null } };
const BARRE_MAX = 45 * 60;   // l'échelle d'une barre de semaine : 45 h, le plafond de l'art. 20bis
const JOUR_MAX = 9 * 60;

export default function LigneTempsTravail({ api, info, onReleve }) {
  const annee = info?.annee;
  const [ag, rechargerAg] = useAgenda(annee);
  const [d, setD] = useState(null);
  const [zoom, setZoom] = useState('annee');
  const [centre, setCentre] = useState(lundiDe(aujourdhui()));
  const [sel, setSel] = useState(null);                       // semaine choisie (année) ou jour choisi (semaines)
  const [focus, setFocus] = useState(null);                   // la personne dont on module l'année
  const [mod, setMod] = useState(null);                       // { recup:[], cibles:{}, exclure:[] } — l'assistant ouvert
  const [plan, setPlan] = useState(null);
  const [mods, setMods] = useState([]);
  const charger = () => {
    api('/ligne').then(x => { setD(x); setFocus(f => f ?? (x.personnes.find(p => p.moi)?.id || x.personnes[0]?.id || null)); }).catch(e => setD({ erreur: e.message }));
    api('/modulations').then(setMods).catch(() => setMods([]));
  };
  useEffect(() => { charger(); }, []);
  // L'assistant recalcule à chaque changement.
  useEffect(() => {
    if (!mod || !focus) { setPlan(null); return; }
    if (!mod.recup.length && !Object.keys(mod.cibles).length && !(mod.prendre || []).length && !(mod.travailler || []).length) { setPlan(null); return; }
    let vivant = true;
    api(`/moduler/${focus}/assistant`, { method: 'POST', body: JSON.stringify(mod) }).then(p => vivant && setPlan(p)).catch(e => vivant && setPlan({ erreur: e.message }));
    return () => { vivant = false; };
  }, [mod, focus]);

  if (!d) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (d.erreur) return <div className="text-sm text-red-700">{d.erreur}</div>;
  if (!d.personnes.length) return <div className="carte px-4 py-3 text-sm text-slate-600">Personne n’est encore désigné. {d.gere ? 'Préparer l’année → 1. Personnes et règles.' : ''}</div>;

  const idx = new Map(d.semaines.map((l, i) => [l, i]));
  const ch = new Map(d.chaleur.map(c => [c.lundi, c]));
  const fp = d.personnes.find(p => p.id === focus);
  const peutModuler = fp && fp.heures && (fp.moi || d.gere) && fp.genere;
  const apercu = new Map((plan?.changees || []).map(c => [c.lundi, c]));
  const ouvrirAssistant = () => { setMod(m => m || { recup: [], cibles: {}, exclure: [], prendre: [], travailler: [] }); };
  const basculerJour = jour => { ouvrirAssistant(); setMod(m => { const x = m || { recup: [], cibles: {}, exclure: [], prendre: [], travailler: [] }; return { ...x, recup: x.recup.includes(jour) ? x.recup.filter(j => j !== jour) : [...x.recup, jour].sort() }; }); };
  const donnerSemaine = l => { ouvrirAssistant(); setMod(m => { const x = m || { recup: [], cibles: {}, exclure: [], prendre: [], travailler: [] }; const js = [0, 1, 2, 3, 4].map(i => plus(l, i)).filter(j => j >= aujourdhui()); const tous = js.every(j => x.recup.includes(j)); return { ...x, recup: tous ? x.recup.filter(j => !js.includes(j)) : [...new Set([...x.recup, ...js])].sort() }; }); };
  const fixerCible = (l, minutes) => { ouvrirAssistant(); setMod(m => { const x = m || { recup: [], cibles: {}, exclure: [], prendre: [], travailler: [] }; const c = { ...x.cibles }; if (minutes == null) delete c[l]; else c[l] = minutes; return { ...x, cibles: c }; }); };
  // ÉCHANGER UNE SEMAINE DE CONGÉ (3.5.058) : on en prend une, on en rend une — l'assistant compte.
  const basculerListe = (cle, l) => { ouvrirAssistant(); setMod(m => { const x = m || { recup: [], cibles: {}, exclure: [], prendre: [], travailler: [] }; const t = x[cle] || []; return { ...x, [cle]: t.includes(l) ? t.filter(y => y !== l) : [...t, l].sort() }; }); };
  const fenetre = zoom === 'semaines' ? 8 : 1;
  const debut = zoom === 'annee' ? d.semaines[0] : centre;
  const avancer = k => setCentre(c => { const n = plus(c, 7 * k * fenetre); return n < d.semaines[0] ? d.semaines[0] : n > d.semaines[51] ? d.semaines[51] : n; });
  const zoomer = (z, l) => { setZoom(z); if (l) setCentre(z === 'semaines' ? (idx.get(l) > 3 ? plus(l, -14) : d.semaines[0]) : l); setSel(null); };
  // La personne voit aussi un refus de moins d'un mois, avec son motif : un refus qu'on ne lit pas n'a pas été dit.
  const ilYaUnMois = plus(aujourdhui(), -30);
  const enAttente = mods.filter(m => ['proposee', 'controlee'].includes(m.statut) || (!d.gere && m.statut === 'refusee' && String(m.refus_le) >= ilYaUnMois));

  return (
    <div className="space-y-3">
      {/* LA BARRE : le zoom, la navigation, la personne, l'assistant — une ligne. */}
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
        <div className="segments flex-none">
          {[['annee', 'Année'], ['mois', 'Mois'], ['semaines', 'Semaines'], ['semaine', 'Semaine']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => zoomer(k, ['annee', 'mois'].includes(k) ? null : centre)} className={zoom === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{l}</button>))}
        </div>
        {!['annee', 'mois'].includes(zoom) && <>
          <button className="bouton controle flex-none px-2" onClick={() => avancer(-1)} aria-label="Avant"><IconChevronLeft size={16} /></button>
          <span className="text-second text-slate-600 whitespace-nowrap">{zoom === 'semaine' ? `Semaine du ${fmt(centre)} au ${fmt(plus(centre, 4))}` : `Du ${fmt(centre)} au ${fmt(plus(centre, 7 * 8 - 3))}`}</span>
          <button className="bouton controle flex-none px-2" onClick={() => avancer(1)} aria-label="Après"><IconChevronRight size={16} /></button>
          <button className="bouton controle flex-none text-second" onClick={() => setCentre(zoom === 'semaine' ? lundiDe(aujourdhui()) : plus(lundiDe(aujourdhui()), -7))}>Aujourd’hui</button>
        </>}
        <div className="flex-1" />
        {d.gere && (
          <select className="controle border border-slate-300 rounded-champ text-sm flex-none" value={focus || ''} onChange={e => { setFocus(Number(e.target.value)); setMod(null); }} aria-label="Personne">
            {d.personnes.map(p => <option key={p.id} value={p.id}>{p.nom}{p.moi ? ' (moi)' : ''}</option>)}
          </select>)}
        {peutModuler && !mod && <button className="bouton bouton-fort controle flex-none inline-flex items-center gap-1.5" onClick={ouvrirAssistant}><IconWand size={15} /> Moduler {fp.moi ? 'mon année' : 'son année'}</button>}
      </div>

      {enAttente.length > 0 && <Propositions mods={enAttente} gere={d.gere} api={api} recharger={charger} />}

      <div className={`grid gap-3 ${mod ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
        <div className="carte overflow-hidden min-w-0">
          {zoom === 'annee' && <VueAnnee d={d} ag={ag} rechargerAg={rechargerAg} annee={annee} apercu={apercu} focus={focus} sel={sel} setSel={setSel} zoomer={zoomer} recharger={charger} />}
          {zoom === 'mois' && <AgendaMois annee={annee} ag={ag} recharger={rechargerAg} onChange={charger} />}
          {zoom === 'semaines' && <VueSemaines d={d} ch={ch} apercu={apercu} focus={focus} debut={debut} mod={mod} sel={sel} setSel={setSel} peutModuler={peutModuler} basculerJour={basculerJour} zoomer={zoomer} />}
          {zoom === 'semaine' && <VueSemaine d={d} ch={ch} apercu={apercu} focus={focus} lundi={centre} mod={mod} peutModuler={peutModuler} basculerJour={basculerJour} />}
          {zoom === 'annee' && sel && <DetailSemaine d={d} l={sel} c={ch.get(sel)} fp={fp} peutModuler={peutModuler} api={api} recharger={charger}
            mod={mod} donnerSemaine={donnerSemaine} fixerCible={fixerCible} basculerListe={basculerListe} zoomer={zoomer} onFermer={() => setSel(null)} />}
          {!['annee', 'mois'].includes(zoom) && <Moments d={d} debut={debut} fin={plus(debut, 7 * fenetre - 1)} />}
        </div>
        {mod && <Assistant fp={fp} mod={mod} setMod={setMod} plan={plan} api={api} gere={d.gere}
          onFermer={() => { setMod(null); setPlan(null); }} onFait={() => { setMod(null); setPlan(null); charger(); }} onReleve={onReleve} />}
      </div>
    </div>
  );
}

/* ── L'ANNÉE : 52 colonnes ── */
/* L'ANNÉE : l'agenda de l'école peint en tête (AgendaLigne), puis une ligne par personne et la ligne « Au travail ». */
function VueAnnee({ d, ag, rechargerAg, annee, apercu, focus, sel, setSel, zoomer, recharger }) {
  const lignes = (
    <>
      {d.personnes.map(p => (
        <GrilleAnnee key={p.id} className={`py-1 border-t ${p.id === focus ? 'bg-[color-mix(in_srgb,var(--c-principal)_4%,transparent)]' : ''}`}>
          <div className="text-second pr-2 self-center truncate" title={p.nom}>{nomCourt(p.nom)}{!p.genere && <span className="text-slate-400"> · à générer</span>}</div>
          {p.semaines.map(s => <BarreSemaine key={s.lundi} p={p} s={s} ap={p.id === focus ? apercu.get(s.lundi) : null} sel={sel === s.lundi} onClick={() => setSel(x => (x === s.lundi ? null : s.lundi))} />)}
          <div className="text-second text-right self-center tabular-nums whitespace-nowrap">{p.heures ? <><b>{court(p.prevu)}</b><div className="text-mention text-slate-500">sur {court(p.du)}</div></> : ''}</div>
        </GrilleAnnee>
      ))}
      <GrilleAnnee className="border-t pt-1">
        <div className="text-second text-slate-600 pr-2">Au travail</div>
        {d.presents.map((n, i) => { const req = d.agenda?.besoin?.[i]?.presents_requis ?? d.presents_min;
          return <div key={i} title={`${n} au travail · ${req} requis`} className={`text-mention text-center tabular-nums ${n < req ? 'font-bold text-[var(--c-refuse)]' : 'text-slate-500'}`}>{n}</div>; })}
        <div className="text-mention text-slate-500 text-right">présents</div>
      </GrilleAnnee>
      <p className="text-mention text-slate-500 pt-1">Touchez une semaine pour la voir en détail ; <button className="underline inline-flex items-center gap-0.5" onClick={() => zoomer('semaines', sel || lundiDe(aujourdhui()))}><IconZoomIn size={12} /> zoomer</button> pour la voir jour par jour. En rouge : moins de présents que les sections actives n’en demandent.</p>
    </>
  );
  return <AgendaLigne annee={annee} ag={ag} recharger={rechargerAg} apres={lignes} selSemaine={sel} onSemaine={l => setSel(x => (x === l ? null : l))} onChange={recharger} />;
}

function BarreSemaine({ p, s, ap, sel, onClick }) {
  const ref = p.reference || 36 * 60;
  const conge = s.statut === 'conge' || s.statut === 'ete';
  const minutes = ap ? ap.apres : s.minutes;
  const h = p.heures ? Math.min(1, (minutes || 0) / BARRE_MAX) : (s.statut === 'travail' ? 0.8 : 0);
  const recup = (ap ? ap.jours.filter(j => j?.recup).length : (s.jours || []).filter(j => j.recup).length);
  const titre = conge ? (s.statut === 'ete' ? 'Vacances d’été' : 'Congé') : !s.statut ? 'Hors année générée' : p.heures ? `${fmt(s.lundi)} · ${hm(minutes)}${ap ? ` (avant : ${hm(ap.avant)})` : ''}${recup ? ` · ${recup} jour(s) donné(s)` : ''}` : `${fmt(s.lundi)} · au travail`;
  return (
    <button type="button" onClick={onClick} title={titre} className={`relative h-12 mx-px rounded-[3px] ${sel ? 'ring-2 ring-[var(--c-principal)]' : ''}`}
      style={{ background: conge ? HACHURE : 'transparent' }}>
      {p.heures && !conge && s.statut && <span className="absolute left-0 right-0 border-t border-dashed" style={{ bottom: `${(ref / BARRE_MAX) * 100}%`, borderColor: 'var(--c-texte_doux, #94A3B8)' }} />}
      {!conge && s.statut && <span className="absolute left-[12%] right-[12%] bottom-0 rounded-t-[2px]"
        style={{ height: `${h * 100}%`, background: ap ? 'var(--c-accent)' : minutes !== ref && p.heures ? 'color-mix(in srgb, var(--c-principal) 100%, black 15%)' : 'var(--c-principal)', opacity: p.heures ? 1 : 0.35,
          outline: ap ? '1px solid var(--c-accent)' : 'none' }} />}
      {recup > 0 && <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-accent)' }} />}
    </button>
  );
}

/* Les grands moments, en bandes posées sur l'année (deux couloirs quand ils se chevauchent). */
/* Une semaine choisie dans l'année : pourquoi elle est en tension ou calme, qui fait combien, et ce qu'on peut y faire. */
function DetailSemaine({ d, l, c, fp, peutModuler, api, recharger, donnerSemaine, fixerCible, basculerListe, zoomer, onFermer }) {
  const [heures, setHeures] = useState('');
  const k = CHALEUR[c?.niveau || 'normal'];
  const s = fp?.semaines.find(x => x.lundi === l);
  const futur = plus(l, 4) >= aujourdhui();
  const forcer = async niveau => { try { await api(`/chaleur/${l}`, { method: 'PUT', body: JSON.stringify({ niveau }) }); recharger(); } catch (e) { informer({ message: e.message }); } };
  const ms = d.moments.filter(m => m.du <= plus(l, 6) && m.au >= l);
  return (
    <div className="border-t px-4 py-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="titre-carte">Semaine du {fmt(l)} au {fmt(plus(l, 4))}</span>
        {c?.conge ? <PastilleEtat etat="indisponible">{c.conge}</PastilleEtat> : <PastilleEtat etat={c?.niveau === 'chaud' ? 'surveiller' : c?.niveau === 'creux' ? 'disponible' : 'neutre'}>{k.mot === 'normale' ? 'semaine normale' : k.mot}{c?.force ? ' (fixée)' : ''}</PastilleEtat>}
        <div className="flex-1" />
        <button className="bouton text-second inline-flex items-center gap-1" onClick={() => zoomer('semaine', l)}><IconZoomIn size={14} /> Voir la semaine</button>
        <button className="bouton px-1.5" onClick={onFermer} aria-label="Fermer"><IconX size={14} /></button>
      </div>
      {!c?.conge && <p className="text-second text-slate-600 m-0">{c?.raisons?.length ? `Pourquoi : ${c.raisons.join(' · ')}.` : 'Lucie ne connaît rien de particulier cette semaine.'}</p>}
      {ms.length > 0 && <p className="text-second m-0"><IconFlag size={13} className="inline -mt-0.5" /> {ms.map(m => m.titre).join(' · ')}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-second">
        {d.personnes.map(p => { const x = p.semaines.find(y => y.lundi === l);
          return <span key={p.id}>{nomCourt(p.nom)} : <b>{x?.statut === 'travail' ? (p.heures ? hm(x.minutes) : 'au travail') : x?.statut === 'ete' ? 'été' : x?.statut === 'conge' ? 'congé' : '—'}</b></span>; })}
      </div>
      {d.gere && !c?.conge && (
        <div className="flex flex-wrap items-center gap-2 text-second">
          <span className="text-slate-600">La direction fixe la période :</span>
          <div className="segments">
            {[['calcul', 'Calcul de Lucie'], ['chaud', 'Tension'], ['normal', 'Normale'], ['creux', 'Calme']].map(([n, t]) => {
              const actif = n === 'calcul' ? !c?.force : c?.force && c.niveau === n;
              return <button key={n} type="button" onClick={() => forcer(n)} className={actif ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{t}</button>; })}
          </div>
        </div>)}
      {peutModuler && s?.statut === 'travail' && futur && (
        <div className="flex flex-wrap items-center gap-2 text-second">
          <span className="text-slate-600">{fp.moi ? 'Mon' : 'Son'} année :</span>
          <button className="bouton" onClick={() => donnerSemaine(l)}>Donner la semaine</button>
          <span className="text-slate-600">ou la mettre à</span>
          <input type="number" min="31" max="45" step="0.5" className="controle border border-slate-300 rounded-champ w-20" placeholder="h" value={heures} onChange={e => setHeures(e.target.value)} />
          <button className="bouton" disabled={!heures} onClick={() => { fixerCible(l, Math.round(Number(heures) * 60)); setHeures(''); }}>heures</button>
          <span className="text-mention text-slate-500">l’assistant remet la différence ailleurs</span>
        </div>)}
      {peutModuler && futur && s && (s.statut === 'travail' || (s.statut && d.agenda?.fermetures?.[d.semaines.indexOf(l)]?.fermeture !== 'totale')) && (
        <div className="flex flex-wrap items-center gap-2 text-second">
          <span className="text-slate-600">Ses congés :</span>
          {s.statut === 'travail'
            ? <button className="bouton" onClick={() => basculerListe('prendre', l)}>Prendre cette semaine en congé</button>
            : <button className="bouton" onClick={() => basculerListe('travailler', l)}>Travailler cette semaine</button>}
          <span className="text-mention text-slate-500">13 semaines de congé toujours : une prise, une rendue ; la direction valide</span>
        </div>)}
    </div>
  );
}

/* ── LES SEMAINES : huit semaines, une barre par jour ouvrable ── */
function VueSemaines({ d, ch, apercu, focus, debut, mod, sel, setSel, peutModuler, basculerJour, zoomer }) {
  const lundis = Array.from({ length: 8 }, (_, k) => plus(debut, 7 * k)).filter(l => d.semaines.includes(l));
  const cols = `${COL_NOM} repeat(${lundis.length * 5}, minmax(0, 1fr))`;
  const recupVoulus = new Set(mod?.recup || []);
  return (
    <div className="px-3 py-3 overflow-x-auto">
      <div className="min-w-[760px] space-y-1">
        <div className="grid" style={{ gridTemplateColumns: `${COL_NOM} repeat(${lundis.length}, minmax(0, 1fr))` }}>
          <div />
          {lundis.map(l => { const c = ch.get(l); const k = CHALEUR[c?.niveau || 'normal'];
            return (
              <button key={l} type="button" onClick={() => zoomer('semaine', l)} title={c?.raisons?.join(', ') || ''}
                className="mx-0.5 px-1.5 py-1 rounded-[4px] text-left text-mention border" style={{ borderColor: 'var(--c-filet)', background: c?.conge ? HACHURE : 'transparent' }}>
                <div className="font-semibold text-iip-texte whitespace-nowrap">{fmt(l)} → {fmt(plus(l, 4))}</div>
                <div className="flex items-center gap-1 whitespace-nowrap">
                  {c?.conge ? <span className="text-slate-500 truncate">{c.conge}</span>
                    : k.fond ? <span className="inline-flex items-center gap-0.5 px-1 rounded text-white" style={{ background: k.fond }}>{k.Ic && <k.Ic size={10} />}{k.mot}</span> : <span className="text-slate-400">normale</span>}
                </div>
              </button>); })}
        </div>
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div />
          {lundis.flatMap(l => JOURS.map((j, i) => { const jour = plus(l, i); const fe = d.feries[jour];
            return <div key={jour} className={`text-mention text-center ${i === 0 ? 'border-l' : ''} ${jour === aujourdhui() ? 'font-bold text-[var(--c-principal)]' : 'text-slate-500'}`} title={`${j} ${fmt(jour)}${fe ? ' · ' + fe : ''}`}>{jour.slice(8)}{fe ? '*' : ''}</div>; }))}
        </div>
        <RangeeMomentsJours d={d} lundis={lundis} cols={cols} />
        {d.personnes.map(p => (
          <div key={p.id} className={`grid border-t py-1 ${p.id === focus ? 'bg-[color-mix(in_srgb,var(--c-principal)_4%,transparent)]' : ''}`} style={{ gridTemplateColumns: cols }}>
            <div className="text-second pr-2 self-center truncate" title={p.nom}>{nomCourt(p.nom)}</div>
            {lundis.flatMap(l => { const s = p.semaines[d.semaines.indexOf(l)]; const ap = p.id === focus ? apercu.get(l) : null;
              return JOURS.map((_, i) => {
                const jour = plus(l, i), c = s?.jours?.[i] || {};
                const conge = s?.statut === 'conge' || s?.statut === 'ete';
                const apj = ap?.jours?.[i];
                const recup = apj ? !!apj.recup : c.recup;
                const minutes = apj ? (apj.recup ? 0 : dureeJ(apj)) : c.minutes;
                const choisi = p.id === focus && recupVoulus.has(jour);
                const cliquable = p.id === focus && peutModuler && s?.statut === 'travail' && jour >= aujourdhui() && (c.present || c.recup);
                const h = p.heures ? Math.min(1, (minutes || 0) / JOUR_MAX) : (c.present ? 0.8 : 0);
                return (
                  <button key={jour} type="button" disabled={!cliquable && !p.heures} onClick={() => (cliquable ? basculerJour(jour) : setSel(jour))}
                    title={conge ? 'Congé' : c.ferie ? `Férié : ${c.ferie}` : recup ? 'Jour donné (récupération)' : p.heures ? `${fmt(jour)} · ${hm(minutes)}${c.plan ? ` (${c.plan.debut}–${c.plan.fin})` : ''}${cliquable ? ' — toucher pour donner ce jour' : ''}` : (c.present ? 'au travail' : '')}
                    className={`relative h-10 mx-px rounded-[3px] ${i === 0 ? 'ml-0.5' : ''} ${choisi ? 'ring-2 ring-[var(--c-accent)]' : ''} ${cliquable ? 'cursor-pointer' : ''}`}
                    style={{ background: conge || c.ferie ? HACHURE : recup ? 'color-mix(in srgb, var(--c-accent) 18%, transparent)' : 'transparent' }}>
                    {!conge && !recup && minutes > 0 && <span className="absolute left-[15%] right-[15%] bottom-0 rounded-t-[2px]"
                      style={{ height: `${h * 100}%`, background: apj ? 'var(--c-accent)' : 'var(--c-principal)', opacity: p.heures ? 1 : 0.35 }} />}
                    {recup && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ background: 'var(--c-accent)' }} />}
                    {c.absence && <span className="absolute inset-x-0 top-0 text-[9px] text-center">A</span>}
                  </button>);
              }); })}
          </div>
        ))}
        <p className="text-mention text-slate-500 pt-1">{peutModuler ? 'Touchez un jour de la ligne surlignée pour le donner (récupération) ; l’assistant remet ses heures ailleurs. ' : ''}Touchez l’en-tête d’une semaine pour la voir heure par heure.</p>
        {sel && sel.length === 10 && sel.split('-').length === 3 && <p className="text-mention text-slate-600">{fmt(sel)}</p>}
      </div>
    </div>
  );
}
const dureeJ = j => { if (!j || j.recup) return 0; const a = min(j.debut), b = min(j.fin); if (a == null || b == null) return 0; const p = j.pause_debut && j.pause_fin ? min(j.pause_fin) - min(j.pause_debut) : 0; return b - a - p; };

function RangeeMomentsJours({ d, lundis, cols }) {
  const jours = lundis.flatMap(l => JOURS.map((_, i) => plus(l, i)));
  const ms = d.moments.filter(m => m.au >= jours[0] && m.du <= jours[jours.length - 1]);
  if (!ms.length) return null;
  // Des couloirs partagés : un moment prend le premier couloir libre (comme dans l'année).
  const couloirs = [];
  const places = ms.map(m => {
    const a = Math.max(0, jours.findIndex(j => j >= m.du)), bRaw = jours.findIndex(j => j > m.au);
    const b = Math.max(a + 1, bRaw < 0 ? jours.length : bRaw);
    let k = couloirs.findIndex(fin => fin <= a); if (k < 0) { k = couloirs.length; couloirs.push(b); } else couloirs[k] = b;
    return { m, a, b, k };
  });
  return (
    <div className="grid gap-y-0.5" style={{ gridTemplateColumns: cols, gridTemplateRows: `repeat(${couloirs.length}, 1.05rem)` }}>
      <div className="text-second text-slate-600 pr-2 self-center" style={{ gridRow: `1 / ${couloirs.length + 1}` }}>Moments</div>
      {places.map(({ m, a, b, k }, i) => (
        <span key={i} className="rounded-[3px] text-mention text-white px-1 truncate leading-[1.05rem] mx-px" title={`${m.titre} · ${fmt(m.du)}${m.au !== m.du ? ` → ${fmt(m.au)}` : ''}`}
          style={{ gridColumn: `${a + 2} / ${b + 2}`, gridRow: k + 1, background: m.type === 'deliberations' ? 'var(--c-texte)' : 'var(--c-principal)' }}>{m.titre}</span>))}
    </div>
  );
}

/* ── LA SEMAINE : l'horaire de chacun, de 7 h à 19 h ── */
const H0 = 7 * 60, H1 = 19 * 60;
function VueSemaine({ d, ch, apercu, focus, lundi, mod, peutModuler, basculerJour }) {
  const k = d.semaines.indexOf(lundi);
  const c = ch.get(lundi);
  const ms = d.moments.filter(m => m.du <= plus(lundi, 6) && m.au >= lundi);
  const pos = m => `${((Math.max(H0, Math.min(H1, m)) - H0) / (H1 - H0)) * 100}%`;
  const recupVoulus = new Set(mod?.recup || []);
  if (k < 0) return <p className="px-4 py-3 text-sm text-slate-500">Semaine hors de l’année.</p>;
  return (
    <div className="px-3 py-3 overflow-x-auto">
      <div className="min-w-[760px] space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-second">
          {c?.conge ? <PastilleEtat etat="indisponible">{c.conge}</PastilleEtat> : <PastilleEtat etat={c?.niveau === 'chaud' ? 'surveiller' : c?.niveau === 'creux' ? 'disponible' : 'neutre'}>{CHALEUR[c?.niveau || 'normal'].mot === 'normale' ? 'semaine normale' : CHALEUR[c?.niveau || 'normal'].mot}</PastilleEtat>}
          {ms.map((m, i) => <span key={i} className="inline-flex items-center gap-1"><IconFlag size={13} /> {m.titre}</span>)}
          {!c?.conge && c?.raisons?.length > 0 && <span className="text-slate-500">· {c.raisons.join(' · ')}</span>}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `${COL_NOM} repeat(5, minmax(0, 1fr)) 5rem` }}>
          <div />
          {JOURS.map((j, i) => { const jour = plus(lundi, i); return <div key={j} className={`text-second text-center ${jour === aujourdhui() ? 'font-bold text-[var(--c-principal)]' : 'text-slate-600'}`}>{j} {fmt(jour)}{d.feries[jour] ? <div className="text-mention text-slate-500">{d.feries[jour]}</div> : null}</div>; })}
          <div className="text-mention text-right text-slate-500 self-end">total</div>
          <div />
          {JOURS.map(j => <div key={j} className="flex justify-between text-[9px] text-slate-400 px-1"><span>7h</span><span>13h</span><span>19h</span></div>)}
          <div />
        </div>
        {d.personnes.map(p => { const s = p.semaines[k]; const ap = p.id === focus ? apercu.get(lundi) : null;
          const conge = s?.statut === 'conge' || s?.statut === 'ete';
          return (
            <div key={p.id} className={`grid border-t py-1.5 ${p.id === focus ? 'bg-[color-mix(in_srgb,var(--c-principal)_4%,transparent)]' : ''}`} style={{ gridTemplateColumns: `${COL_NOM} repeat(5, minmax(0, 1fr)) 5rem` }}>
              <div className="text-second pr-2 self-center truncate">{nomCourt(p.nom)}</div>
              {JOURS.map((_, i) => {
                const jour = plus(lundi, i), cj = s?.jours?.[i] || {}, apj = ap?.jours?.[i];
                const recup = apj ? !!apj.recup : cj.recup;
                const plan = apj && !apj.recup ? apj : cj.plan;
                const cliquable = p.id === focus && peutModuler && s?.statut === 'travail' && jour >= aujourdhui() && (cj.present || cj.recup);
                return (
                  <button key={i} type="button" disabled={!cliquable} onClick={() => basculerJour(jour)}
                    className={`relative h-9 mx-0.5 rounded-[4px] border ${recupVoulus.has(jour) && p.id === focus ? 'ring-2 ring-[var(--c-accent)]' : ''}`}
                    style={{ borderColor: 'var(--c-filet)', background: conge || cj.ferie ? HACHURE : recup ? 'color-mix(in srgb, var(--c-accent) 18%, transparent)' : 'transparent' }}
                    title={cliquable ? 'Toucher pour donner ce jour (ou le reprendre)' : ''}>
                    {conge ? <span className="text-mention text-slate-500">{s.statut === 'ete' ? 'été' : 'congé'}</span>
                      : recup ? <span className="text-mention">donné</span>
                      : plan?.debut ? <>
                        <span className="absolute top-1.5 bottom-1.5 rounded-[3px]" style={{ left: pos(min(plan.debut)), right: `calc(100% - ${pos(min(plan.fin))})`, background: apj ? 'var(--c-accent)' : 'var(--c-principal)' }} />
                        {plan.pause_debut && <span className="absolute top-1.5 bottom-1.5 bg-white/80" style={{ left: pos(min(plan.pause_debut)), right: `calc(100% - ${pos(min(plan.pause_fin))})` }} />}
                        <span className="absolute inset-x-0 -bottom-0.5 text-[9px] text-center text-slate-600 tabular-nums translate-y-full">{plan.debut}–{plan.fin}</span>
                      </>
                      : cj.present ? <span className="absolute inset-1.5 rounded-[3px] opacity-35" style={{ background: 'var(--c-principal)' }} /> : null}
                    {cj.reel && <span className="absolute top-0.5 bottom-0.5 border-2 rounded-[3px]" style={{ left: pos(min(cj.reel.debut)), right: `calc(100% - ${pos(min(cj.reel.fin))})`, borderColor: 'var(--c-attente)' }} title={`Réel : ${cj.reel.debut}–${cj.reel.fin}`} />}
                  </button>);
              })}
              <div className="text-second text-right self-center tabular-nums">{p.heures && !conge ? <b>{court(ap ? ap.apres : s?.minutes)}</b> : ''}</div>
            </div>);
        })}
        <p className="text-mention text-slate-500 pt-3">Barre pleine : l’horaire prévu (la pause en blanc) ; cadre ocre : les heures réelles encodées au relevé.{peutModuler ? ' Touchez un jour de la ligne surlignée pour le donner.' : ''}</p>
      </div>
    </div>
  );
}

/* La liste des grands moments de la vue (toute l'année, ou la fenêtre zoomée). */
function Moments({ d, debut, fin }) {
  const ms = d.moments.filter(m => !debut || (m.au >= debut && m.du <= fin));
  if (!ms.length) return null;
  return (
    <div className="px-4 py-2 border-t text-second flex flex-wrap gap-x-4 gap-y-1">
      <span className="text-slate-500">Grands moments :</span>
      {ms.map((m, i) => <span key={i} className="whitespace-nowrap"><b>{m.titre}</b> <span className="text-slate-500">{fmt(m.du)}{m.au !== m.du ? `→${fmt(m.au)}` : ''}</span></span>)}
    </div>
  );
}

/* ── L'ASSISTANT : ce qu'on change, où les heures vont, envoyer ── */
function Assistant({ fp, mod, setMod, plan, api, gere, onFermer, onFait }) {
  const [envoi, setEnvoi] = useState(false);
  const retirer = jour => setMod(m => ({ ...m, recup: m.recup.filter(j => j !== jour) }));
  const retirerCible = l => setMod(m => { const c = { ...m.cibles }; delete c[l]; return { ...m, cibles: c }; });
  const exclure = l => setMod(m => ({ ...m, exclure: [...new Set([...(m.exclure || []), l])] }));
  const ok = plan && !plan.erreur && !plan.erreurs?.length && !plan.en_defaut && plan.changees?.length;
  const direct = gere && !fp.moi;
  const envoyer = async () => {
    if (!(await demander(direct ? `Appliquer cette modulation à l’année de ${fp.nom} ?` : 'Envoyer cette modulation à la direction adjointe, puis à la direction ?'))) return;
    setEnvoi(true);
    try { const r = await api(`/moduler/${fp.id}`, { method: 'POST', body: JSON.stringify(mod) }); informer({ message: r.statut === 'acceptee' ? 'Modulation appliquée.' : 'Modulation envoyée : elle s’appliquera après l’accord de la direction.' }); onFait(); }
    catch (e) { informer({ message: e.message }); } finally { setEnvoi(false); }
  };
  const recupParSemaine = useMemo(() => { const m = new Map(); for (const j of mod.recup) { const l = lundiDe(j); m.set(l, [...(m.get(l) || []), j]); } return [...m]; }, [mod.recup]);
  return (
    <div className="carte overflow-hidden self-start xl:sticky xl:top-2">
      <EnteteCarte icone={IconWand} titre="Moduler l’année" sous={`${fp.nom} · l’année garde ${hm(plan?.du ?? fp.du)}`}>
        <button className="bouton px-1.5" onClick={onFermer} aria-label="Fermer"><IconX size={14} /></button>
      </EnteteCarte>
      <div className="px-4 py-3 space-y-3 text-sm">
        <div>
          <div className="intertitre">1. Ce que {fp.moi ? 'je change' : 'l’on change'}</div>
          {!mod.recup.length && !Object.keys(mod.cibles).length && !(mod.prendre || []).length && !(mod.travailler || []).length && <p className="text-second text-slate-500 m-0">Rien encore. Zoom <b>Semaines</b> ou <b>Semaine</b> : touchez un jour pour le donner. Zoom <b>Année</b> : touchez une semaine pour la donner ou la charger.</p>}
          {recupParSemaine.map(([l, js]) => (
            <div key={l} className="flex flex-wrap items-center gap-1 py-0.5">
              <span className="text-second text-slate-600">Donné{js.length > 1 ? 's' : ''} :</span>
              {js.map(j => <button key={j} type="button" className="pastille-etat inline-flex items-center gap-0.5" data-etat="disponible" onClick={() => retirer(j)} title="Reprendre ce jour">{JOURS[(new Date(`${j}T00:00:00Z`).getUTCDay() + 6) % 7]} {fmt(j)} <IconX size={10} /></button>)}
            </div>))}
          {[['prendre', 'Congé pris'], ['travailler', 'Congé rendu (au travail)']].map(([k, t]) => (mod[k] || []).length > 0 && (
            <div key={k} className="flex flex-wrap items-center gap-1 py-0.5">
              <span className="text-second text-slate-600">{t} :</span>
              {mod[k].map(l => <button key={l} type="button" className="pastille-etat inline-flex items-center gap-0.5" data-etat="disponible" onClick={() => setMod(m => ({ ...m, [k]: m[k].filter(x => x !== l) }))}>sem. {fmt(l)} <IconX size={10} /></button>)}
            </div>))}
          {Object.entries(mod.cibles).map(([l, m]) => (
            <div key={l} className="flex items-center gap-1 py-0.5 text-second">Semaine du {fmt(l)} à <b>{hm(m)}</b>
              <button className="bouton px-1 py-0" onClick={() => retirerCible(l)} aria-label="Retirer"><IconX size={12} /></button></div>))}
        </div>
        {plan?.erreur && <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{plan.erreur}</div>}
        {plan?.changees && (
          <div>
            <div className="intertitre">2. Où les heures vont</div>
            <div className="divide-y">
              {plan.changees.map(c => (
                <div key={c.lundi} className="flex items-center gap-2 py-1 text-second">
                  <span className="tabular-nums w-11">{fmt(c.lundi)}</span>
                  {c.chaleur !== 'normal' ? <span className="inline-flex items-center px-1 rounded text-white text-mention" style={{ background: CHALEUR[c.chaleur].fond }}>{CHALEUR[c.chaleur].mot}</span> : <span className="w-[3.2rem]" />}
                  <span className="flex-1 tabular-nums text-right">{court(c.avant)} → <b>{court(c.apres)}</b></span>
                  <span className={`tabular-nums w-12 text-right ${c.apres > c.avant ? 'text-[var(--c-reussi)]' : 'text-slate-500'}`}>{c.apres > c.avant ? '+' : ''}{hm(c.apres - c.avant).replace(' h ', 'h')}</span>
                  {c.report ? <button className="bouton px-1 py-0" title="Pas cette semaine : l’assistant cherche ailleurs" onClick={() => exclure(c.lundi)}><IconX size={12} /></button> : <span className="w-[22px]" />}
                  {c.controles.length > 0 && <span className="text-[var(--c-refuse)]" title={c.controles.join(' ')}>!</span>}
                </div>))}
            </div>
            <p className={`text-second m-0 mt-2 ${plan.apres === plan.du ? '' : 'text-[var(--c-refuse)]'}`}>
              {plan.apres === plan.du ? <><IconCheck size={14} className="inline -mt-0.5 text-[var(--c-reussi)]" /> L’année compte toujours {hm(plan.du)}.</> : `L’année compterait ${hm(plan.apres)} pour ${hm(plan.du)}.`}
            </p>
            {(mod.exclure || []).length > 0 && <p className="text-mention text-slate-500 m-0">Semaines écartées : {mod.exclure.map(fmt).join(', ')} · <button className="underline" onClick={() => setMod(m => ({ ...m, exclure: [] }))}>les rendre</button></p>}
          </div>)}
        {plan?.erreurs?.map((e, i) => <div key={i} className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{e}</div>)}
        {plan?.avertissements?.map((e, i) => <div key={`a${i}`} className="bloc-etat px-3 py-2 text-second" data-etat="surveiller">{e}</div>)}
        {plan?.changees?.filter(c => c.controles.length).map(c => <div key={c.lundi} className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{fmt(c.lundi)} : {c.controles.join(' ')}</div>)}
        <p className="text-mention text-slate-500 m-0">Un jour donné est un repos compensatoire. L’assistant remet ses heures dans les semaines à venir — celles en tension d’abord —, sans dépasser 9 h par jour, 2 h de plus que l’horaire de référence, ni 5 h de plus par semaine (art. 20bis).</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={!ok || envoi} onClick={envoyer}>{direct ? <IconCheck size={15} /> : <IconSend size={15} />} {direct ? 'Appliquer' : 'Envoyer à la direction'}</button>
          <button className="bouton" onClick={() => setMod({ recup: [], cibles: {}, exclure: [], prendre: [], travailler: [] })}>Tout effacer</button>
        </div>
      </div>
    </div>
  );
}

/* Les propositions en attente : la direction adjointe contrôle, la direction accepte ; la personne voit où en est la sienne. */
function Propositions({ mods, gere, api, recharger }) {
  const geste = async (m, etape) => { try { await api(`/modulations/${m.id}/valider`, { method: 'POST', body: JSON.stringify({ etape }) }); recharger(); } catch (e) { informer({ message: e.message }); } };
  const refuser = async m => {
    const motif = gere ? await saisir({ message: `Pourquoi refuser la modulation de ${m.nom} ?`, multiligne: true, obligatoire: true }) : (await demander('Retirer ma proposition ?')) && '';
    if (motif == null || motif === false) return;
    try { await api(`/modulations/${m.id}/refuser`, { method: 'POST', body: JSON.stringify({ motif }) }); recharger(); } catch (e) { informer({ message: e.message }); }
  };
  return (
    <div className="bloc-etat px-4 py-2.5 space-y-1.5" data-etat="surveiller">
      <div className="text-sm font-semibold text-iip-texte">{gere ? `${mods.length} modulation(s) à valider` : 'Mes modulations'}</div>
      {mods.map(m => (
        <div key={m.id} className="flex flex-wrap items-center gap-2 text-second">
          <span><b>{gere ? m.nom : 'Proposée'}</b> · {m.resume} · {m.changements.length} semaine(s) · le {String(m.propose_le).slice(8, 10)}/{String(m.propose_le).slice(5, 7)}</span>
          {m.statut === 'refusee' ? <PastilleEtat etat="corriger">refusée par {m.refus_par} : {m.motif_refus}</PastilleEtat>
            : <PastilleEtat etat={m.statut === 'controlee' ? 'disponible' : 'neutre'}>{m.statut === 'controlee' ? `contrôlée par ${m.adjoint_par}` : 'à contrôler'}</PastilleEtat>}
          <span className="flex-1" />
          {m.statut === 'refusee' ? null : <>
          {gere && m.statut === 'proposee' && <button className="bouton text-second" onClick={() => geste(m, 'adjoint')}>Contrôler</button>}
          {gere && m.statut === 'controlee' && <button className="bouton bouton-fort text-second" onClick={() => geste(m, 'direction')}>Accepter</button>}
          <button className="bouton text-second" onClick={() => refuser(m)}>{gere ? 'Refuser' : 'Retirer'}</button></>}
        </div>))}
    </div>
  );
}

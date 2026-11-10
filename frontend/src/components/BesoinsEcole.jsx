import { useEffect, useState } from 'react';
import { EnteteCarte, Encadre, ListeEtats, LigneEtat, PastilleEtat } from './ui.jsx';
import { informer } from '../lib/dialogue.jsx';

/* LES BESOINS DE L'ÉCOLE (3.5.309, Charles : « ce n'est pas un outil avancé : ça intègre l'horaire de l'équipe admin avec celui de
   l'établissement, des étudiants et des examens ; un graphique des besoins, des moments à fort travail ; si examen, même un samedi, il
   faut un MDP du staff admin de 7 h 00 à 21 h 30 »). Le graphique : la charge de chaque semaine (cours, examens, inscriptions, grands
   moments — la chaleur de la ligne du temps) face aux présents de l'équipe, les semaines d'examen marquées. Puis chaque jour d'examen
   et sa couverture, en relais ; un trou se signale, Lucie propose un relais (GET /relais) qui s'applique semaine par semaine
   (POST /semaine/:uid/:lundi). Serveur : lib/besoinsEcole.js. */
const court = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '');
const longJ = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const hm = m => { if (m == null) return ''; const s = m < 0 ? '−' : ''; m = Math.abs(Math.round(m)); return `${s}${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`; };

export default function BesoinsEcole({ api, onChange }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [relais, setRelais] = useState(null);       // { date, proposition, sims }
  const [enCours, setEnCours] = useState(false);
  const charger = () => api('/besoins').then(j => { setD(j); setErreur(null); }).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const proposer = async date => {
    setEnCours(true);
    try {
      const p = await api(`/relais?date=${date}`);
      const sims = await Promise.all((p.semaines || []).map(s => api(`/semaine/${s.uid}/${s.lundi}`, { method: 'POST', body: JSON.stringify({ jours: s.jours, compenser: true }) }).catch(e => ({ erreurs: [e.message] }))));
      setRelais({ date, p, sims });
    } catch (e) { informer({ message: e.message }); } finally { setEnCours(false); }
  };
  const appliquer = async () => {
    setEnCours(true);
    try {
      for (const s of relais.p.semaines) await api(`/semaine/${s.uid}/${s.lundi}`, { method: 'POST', body: JSON.stringify({ jours: s.jours, ecrire: true, compenser: true }) });
      setRelais(null); await charger(); onChange?.();
      informer({ message: 'Le relais est enregistré.' });
    } catch (e) { informer({ message: e.message }); } finally { setEnCours(false); }
  };

  if (erreur && !d) return <Encadre etat="corriger" titre="Les besoins de l’école">{erreur}</Encadre>;
  if (!d) return <p className="text-sm text-slate-500">Chargement…</p>;
  const max = Math.max(1, ...d.semaines.map(s => s.score));
  const maxP = Math.max(1, ...d.semaines.map(s => s.presents));
  const H = 120;
  const avenir = d.jours_examen.filter(j => !j.passe);
  const bloque = !relais || relais.sims.some(s => (s.controles || []).length || (s.erreurs || []).length);

  return (
    <div className="space-y-4">
      <section className="carte overflow-hidden">
        <EnteteCarte titre="La charge de l’école et l’équipe, semaine par semaine"
          sous="Barres : la charge de la semaine (cours, examens, inscriptions, grands moments). Trait : le nombre de personnes présentes. ◆ : une semaine d’examens." />
        <div className="overflow-x-auto px-4 pt-4 pb-2">
          <svg width={d.semaines.length * 18 + 10} height={H + 30} role="img" aria-label="Charge de l’école et présents, par semaine">
            {d.semaines.map((s, k) => {
              const h = (s.score / max) * H;
              const teinte = s.conge ? 'rgb(var(--gris-200))' : s.niveau === 'chaud' ? 'var(--c-attente)' : s.niveau === 'creux' ? 'var(--c-disponible)' : 'color-mix(in srgb, var(--c-principal) 45%, white)';
              return (
                <g key={s.lundi}>
                  <rect x={k * 18 + 4} y={H - h} width={13} height={Math.max(1, h)} rx={2} style={{ fill: teinte }}>
                    <title>{`Semaine du ${court(s.lundi)} : ${s.conge ? 'congé' : s.niveau === 'chaud' ? 'forte charge' : s.niveau === 'creux' ? 'semaine calme' : 'charge ordinaire'} · ${s.presents} présent(s)${s.examens ? ` · ${s.examens} jour(s) d’examen` : ''}`}</title>
                  </rect>
                  {s.examens > 0 && <text x={k * 18 + 10.5} y={H + 12} textAnchor="middle" style={{ fill: 'var(--c-refuse)', fontSize: 10 }}>◆</text>}
                  {k % 4 === 0 && <text x={k * 18 + 4} y={H + 26} style={{ fill: 'rgb(var(--gris-500))', fontSize: 10 }}>{court(s.lundi)}</text>}
                </g>);
            })}
            <polyline fill="none" style={{ stroke: 'var(--c-principal)', strokeWidth: 2 }}
              points={d.semaines.map((s, k) => `${k * 18 + 10.5},${H - (s.presents / maxP) * (H - 10)}`).join(' ')} />
          </svg>
        </div>
        <div className="flex flex-wrap gap-4 px-4 pb-3 text-mention text-slate-500">
          <span><i className="inline-block w-3.5 h-3 rounded-sm align-[-1px] mr-1" style={{ background: 'var(--c-attente)' }} />forte charge</span>
          <span><i className="inline-block w-3.5 h-3 rounded-sm align-[-1px] mr-1" style={{ background: 'color-mix(in srgb, var(--c-principal) 45%, white)' }} />charge ordinaire</span>
          <span><i className="inline-block w-3.5 h-3 rounded-sm align-[-1px] mr-1" style={{ background: 'var(--c-disponible)' }} />semaine calme</span>
          <span><i className="inline-block w-5 h-0.5 align-middle mr-1" style={{ background: 'var(--c-principal)' }} />présents</span>
          <span style={{ color: 'var(--c-refuse)' }}>◆ examens</span>
        </div>
      </section>

      <section className="carte overflow-hidden">
        <EnteteCarte titre="Les jours d’examen"
          sous={`Quelqu’un du secrétariat de ${d.ouverture} à ${d.fermeture}, même un samedi, en relais. ${d.a_couvrir ? `${d.a_couvrir} jour(s) à couvrir.` : 'Tout est couvert.'}`} />
        {avenir.length ? (
          <ListeEtats className="!border-0 !rounded-none">
            {avenir.map(j => (
              <LigneEtat key={j.date} etat={j.couvert ? 'reussi' : 'corriger'}
                titre={<span className="capitalize">{longJ(j.date)}</span>}
                sous={`${j.epreuves.slice(0, 4).join(' · ')}${j.epreuves.length > 4 ? ` · +${j.epreuves.length - 4}` : ''} — ${j.presents.length ? j.presents.map(p => `${p.nom} ${p.debut}–${p.fin}`).join(', ') : 'personne de l’équipe'}`}
                meta={j.couvert ? <PastilleEtat etat="reussi">couvert</PastilleEtat> : <PastilleEtat etat="corriger">{j.trous.map(t => `${t.de}–${t.a}`).join(', ')} sans personne</PastilleEtat>}
                droite={!j.couvert && <button type="button" className="bouton bouton-fort" disabled={enCours} onClick={() => proposer(j.date)}>Proposer un relais</button>} />))}
          </ListeEtats>
        ) : <p className="text-sm text-slate-500 m-0 px-4 py-3">Aucun jour d’examen à venir dans le calendrier des sessions.</p>}

        {relais && (
          <div className="px-4 py-3 border-t space-y-2" style={{ borderColor: 'var(--c-filet, rgb(var(--gris-200)))' }}>
            <div className="text-sm font-semibold">Relais proposé pour le {longJ(relais.date)} — rien n’est encore enregistré</div>
            {relais.p.impossible ? <Encadre etat="corriger" titre="Pas de relais possible">{relais.p.impossible}</Encadre> : relais.p.semaines.map((s, k) => {
              const c = relais.p.changes[k]; const sim = relais.sims[k] || {};
              return (
                <div key={s.uid} className="text-second">
                  <b>{s.nom}</b> : {c.avant ? `${c.avant.debut}–${c.avant.fin} → ` : 'vient ce jour-là, '}<b>{c.apres.debut}–{c.apres.fin}</b> (pause {c.apres.pause_debut}–{c.apres.pause_fin})
                  {s.recupere && <> · récupère le {s.recupere} de la même semaine</>}
                  {sim.au_solde ? <> · <PastilleEtat etat="surveiller">{sim.au_solde < 0 ? `${hm(-sim.au_solde)} à replacer plus tard` : `${hm(sim.au_solde)} en plus sur l’année`}</PastilleEtat></> : null}
                  {(sim.compensees || []).length > 0 && <span className="text-slate-500"> · compensé la semaine du {sim.compensees.map(x => court(x.lundi)).join(', ')}</span>}
                  {[...(sim.controles || []), ...(sim.erreurs || [])].length > 0 && <ul className="m-0 pl-4" style={{ color: 'var(--c-refuse)' }}>{[...(sim.controles || []), ...(sim.erreurs || [])].map((x, n) => <li key={n}>{x}</li>)}</ul>}
                </div>);
            })}
            {!relais.p.couvert && !relais.p.impossible && <p className="m-0 text-second" style={{ color: 'var(--c-refuse)' }}>Même ainsi, il reste : {relais.p.reste.map(t => `${t.de}–${t.a}`).join(', ')}.</p>}
            <p className="m-0 text-mention text-slate-500">Pour retoucher, ouvrez la semaine de la personne dans « L’équipe » (toucher une case).</p>
            <div className="flex gap-2">
              <button type="button" className="bouton bouton-fort" disabled={bloque || enCours || !!relais.p.impossible} onClick={appliquer}>Appliquer le relais</button>
              <button type="button" className="bouton" onClick={() => setRelais(null)}>Annuler</button>
            </div>
          </div>)}
      </section>
    </div>
  );
}

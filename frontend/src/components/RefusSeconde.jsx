/**
 * LES REFUS EN SECONDE SESSION ET LE PAE (3.5.029, Charles, 1er novembre 2026). À la clôture d'une séance de seconde
 * session, Lucie signale chaque refusé dont le PAE porte des unités qui ont l'unité refusée en prérequis (en cascade).
 * Ici, le secrétariat ouvre l'aperçu — unités à retirer, frais, dette, remboursement, texte qui partira — puis
 * « Retirer et prévenir » : retrait par la porte du PAE, remboursement noté dans Finances, message dans l'espace de
 * l'étudiant s'il lui est ouvert, sinon courriel. La coordination lit les dossiers de ses sections. Serveur :
 * lib/refusSeconde.js, routes/refusSeconde.js.
 */
import { useCallback, useEffect, useState } from 'react';
import { IconPlaylistX, IconCheck, IconX } from '@tabler/icons-react';
import { Fenetre, PastilleEtat } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { useDroits } from '../lib/droits.js';
import { saisir, demander } from '../lib/dialogue.jsx';

const jour = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
const euros = n => `${Number(n || 0).toFixed(2).replace('.', ',')} €`;
const STATUT = { a_traiter: ['surveiller', 'à traiter'], traite: ['reussi', 'traité'], sans_suite: ['indisponible', 'sans suite'] };

async function appel(methode, chemin, corps) {
  const r = await fetch(`/api/refus-seconde${chemin}`, { method: methode, headers: { ...authHeaders(), ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

function Apercu({ d, peutAgir, onFait }) {
  const [a, setA] = useState(null);
  const [ues, setUes] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [encours, setEncours] = useState(false);
  useEffect(() => {
    setErreur(null);
    appel('POST', `/${d.id}/apercu`, ues ? { ues } : {}).then(x => { setA(x); if (!ues) setUes(x.suites.map(s => s.ue_num)); })
      .catch(e => setErreur(e.message));
  }, [d.id, ues]);
  if (erreur) return <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>;
  if (!a) return <p className="text-sm text-slate-500">Calcul…</p>;
  const basculer = u => setUes(l => (l.includes(u) ? l.filter(x => x !== u) : [...l, u]));
  const retirer = async () => {
    if (!(await demander(`Retirer ${a.retirees.length} unité(s) du PAE de ${a.etudiant.nom.toUpperCase()} ${a.etudiant.prenom} et le prévenir (${a.canal === 'espace' ? 'message dans son espace' : 'courriel'}) ?`))) return;
    setEncours(true);
    try { await appel('POST', `/${d.id}/traiter`, { ues }); onFait(); } catch (e) { setErreur(e.message); } finally { setEncours(false); }
  };
  return (
    <div className="space-y-3 text-second">
      <div>
        <div className="intertitre">Unités qui ont l’UE {a.refusee.ue_num} en prérequis</div>
        {a.suites.length ? a.suites.map(s => (
          <label key={`${s.annee}-${s.ue_num}`} className="flex items-center gap-2 py-0.5">
            <input type="checkbox" disabled={!peutAgir} checked={ues?.includes(s.ue_num)} onChange={() => basculer(s.ue_num)} />
            <span className="tabular-nums text-slate-500">UE {s.ue_num}</span> {s.ue_nom} <span className="text-slate-400">· {s.annee}</span>
          </label>)) : <p className="text-slate-500 m-0">Plus aucune au programme : le dossier peut se fermer « sans suite ».</p>}
      </div>
      {a.retirees.length > 0 && (
        <div>
          <div className="intertitre">Les frais (hors forfait de VA et hors partie fixe)</div>
          <p className="m-0">Ces unités valent <b>{euros(a.frais.baisse)}</b>
            {a.frais.deduit > 0 && <> — <b>{euros(a.frais.deduit)}</b> déduits de ce que l’étudiant doit encore</>}
            {a.frais.rembourse > 0 && <> — <b>{euros(a.frais.rembourse)}</b> à lui rembourser (noté dans sa fiche → Finances)</>}
            {a.frais.baisse === 0 && <> : rien à rembourser</>}.</p>
        </div>)}
      <div>
        <div className="intertitre">Ce qu’il recevra — {a.canal === 'espace' ? 'message dans son espace' : a.canal === 'courriel' ? `courriel à ${a.adresse}` : 'aucune adresse : à prévenir à la main'}</div>
        <div className="font-semibold text-iip-texte">{a.texte.objet}</div>
        <pre className="whitespace-pre-wrap font-sans text-second text-slate-700 m-0 mt-1 border-l-2 border-slate-200 pl-3">{a.texte.corps}</pre>
      </div>
      {peutAgir && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={encours || !a.retirees.length} onClick={retirer}>
            <IconCheck size={15} /> {encours ? 'En cours…' : 'Retirer et prévenir'}</button>
          <button type="button" className="bouton inline-flex items-center gap-1.5" disabled={encours} onClick={async () => {
            const motif = await saisir({ message: 'Pourquoi ce dossier reste-t-il sans suite ? (trace interne)', multiligne: true, obligatoire: true });
            if (!motif) return;
            try { await appel('POST', `/${d.id}/sans-suite`, { motif }); onFait(); } catch (e) { setErreur(e.message); }
          }}><IconX size={15} /> Sans suite</button>
        </div>)}
    </div>
  );
}

export default function RefusSeconde({ onFermer }) {
  const { passe } = useDroits();
  const peutAgir = passe('admin', 'editeur');
  const [l, setL] = useState(null);
  const [voir, setVoir] = useState('a_traiter');
  const [ouvert, setOuvert] = useState(null);
  const [erreur, setErreur] = useState(null);
  const charger = useCallback(() => appel('GET', '').then(setL).catch(e => setErreur(e.message)), []);
  useEffect(() => { charger(); }, [charger]);
  const liste = (l || []).filter(d => voir === 'tout' || d.statut === voir);
  const n = (l || []).filter(d => d.statut === 'a_traiter').length;
  return (
    <Fenetre icone={IconPlaylistX} titre="Refus en 2e session — unités à retirer du PAE" large="grande" onFermer={onFermer}
      sous="Une unité refusée en seconde session bloque celles qui l’ont en prérequis : on les retire, l’étudiant est prévenu, le remboursement se note.">
      <div className="space-y-4">
        {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
        <div className="segments">
          {[['a_traiter', `À traiter (${n})`], ['tout', 'Tous']].map(([k, t]) => (
            <button key={k} type="button" onClick={() => setVoir(k)}
              className={`px-2.5 py-1 text-second ${voir === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{t}</button>))}
        </div>
        {!l ? <p className="text-sm text-slate-500">Chargement…</p> : !liste.length
          ? <p className="text-sm text-slate-500">{voir === 'a_traiter' ? 'Aucun dossier à traiter.' : 'Aucun dossier.'}</p>
          : liste.map(d => (
            <section key={d.id} className="bloc-etat px-4 py-3 space-y-2" data-etat={STATUT[d.statut]?.[0] || 'neutre'}>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="text-left text-sm font-semibold text-iip-texte flex-1 min-w-0" onClick={() => setOuvert(o => (o === d.id ? null : d.id))}>
                  {d.nom.toUpperCase()} {d.prenom}
                  <span className="font-normal text-slate-500"> · {d.section || '—'} · refusé(e) en 2e session à l’UE {d.ue_num} {d.ue_nom} ({d.annee_scolaire}) · signalé le {jour(d.cree_le)}</span></button>
                <PastilleEtat etat={STATUT[d.statut]?.[0]}>{STATUT[d.statut]?.[1]}</PastilleEtat>
              </div>
              {d.statut === 'a_traiter' && ouvert === d.id && <Apercu d={d} peutAgir={peutAgir} onFait={() => { setOuvert(null); charger(); }} />}
              {d.statut === 'a_traiter' && ouvert !== d.id && (
                <div className="text-second text-slate-600">À retirer : {d.suites.map(s => `UE ${s.ue_num}`).join(', ')} —{' '}
                  <button type="button" className="underline" onClick={() => setOuvert(d.id)}>voir l’aperçu</button></div>)}
              {d.statut === 'traite' && (
                <div className="text-second text-slate-600">Retirées : {(d.retirees || []).map(s => `UE ${s.ue_num}`).join(', ') || '—'} · par {d.traite_par} le {jour(d.traite_le)}
                  {d.remboursement > 0 ? ` · remboursement ${euros(d.remboursement)}` : ''}{d.dette_deduite > 0 ? ` · déduit de la dette ${euros(d.dette_deduite)}` : ''}
                  {d.avis ? ` · prévenu par ${d.avis === 'espace' ? 'son espace' : 'courriel'}` : ' · non prévenu (aucune adresse)'}</div>)}
              {d.statut === 'sans_suite' && <div className="text-second text-slate-600">Sans suite — {d.traite_par}, {jour(d.traite_le)} : « {d.motif_sans_suite} »</div>}
            </section>))}
      </div>
    </Fenetre>
  );
}

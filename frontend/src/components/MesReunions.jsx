import { useEffect, useState } from 'react';
import { IconUsersGroup, IconCalendarEvent } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre, ListeEtats, LigneEtat, Encadre, PastilleEtat, EnteteCarte } from './ui.jsx';

/* MES RÉUNIONS (3.5.224, Charles, 8 novembre 2026 : ce qui manquait à l'espace enseignant). Les réunions où l'on est convoqué ou
   qu'on organise, en LECTURE : date, lieu, ordre du jour, ce qui s'est dit (le confidentiel reste masqué par le serveur), les
   présents et les décisions confiées. Le serveur borne : `clauseReunion` (un professeur ne voit que ses convocations) et
   `reunionVisible` (404 sinon). Monté dans l'espace enseignant par le relais ; utilisable tel quel dans Lucie. */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const auj = () => new Date().toLocaleDateString('sv-SE');
// Avant la séance, la présence n'a pas de sens : `present` vaut 1 par défaut.
const tenue = r => r.statut === 'tenue' || String(r.date_seance || '') < auj();
const STATUT_TACHE = { a_faire: ['surveiller', 'à faire'], en_cours: ['disponible', 'en cours'], fait: ['reussi', 'fait'], abandonne: ['neutre', 'abandonnée'] };

function Seance({ id, onFermer }) {
  const [r, setR] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    fetch(`/api/reunions/${id}`, { headers: authHeaders() })
      .then(async x => { const j = await x.json().catch(() => ({})); if (!x.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
      .then(setR).catch(e => setErreur(e.message));
  }, [id]);
  const lignes = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);
  return (
    <Fenetre icone={IconUsersGroup} titre={r ? r.titre : 'Réunion'} large="grande" onFermer={onFermer}
      sous={r ? `${fr(r.date_seance)}${r.heure_seance ? ` à ${r.heure_seance}` : ''}${r.lieu ? ` · ${r.lieu}` : ''}${r.organisateur_nom ? ` · organisée par ${r.organisateur_nom}` : ''}` : null}
      pied={<button type="button" className="bouton bouton-fort" onClick={onFermer}>Fermer</button>}>
      {erreur && <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>}
      {!erreur && !r && <p className="text-second text-slate-500">Chargement…</p>}
      {r && (
        <div className="space-y-4 text-sm">
          {lignes(r.ordre_du_jour).length > 0 && (
            <section className="carte"><EnteteCarte titre="Ordre du jour" />
              <ol className="m-0 px-8 py-3 space-y-1">{lignes(r.ordre_du_jour).map((l, i) => <li key={i}>{l}</li>)}</ol></section>)}
          {(r.points || []).length > 0 && (
            <section className="carte"><EnteteCarte titre="Points traités" />
              <div className="px-4 py-3 space-y-3">{r.points.map(p => (
                <div key={p.id}><b>{p.intitule || 'Point'}</b>
                  {p.masque ? <p className="m-0 text-slate-500 italic">Notes confidentielles.</p>
                    : p.notes ? <p className="m-0 whitespace-pre-line text-slate-700">{p.notes}</p> : null}</div>))}</div></section>)}
          {r.notes && (
            <section className="carte"><EnteteCarte titre="Ce qui s’est dit" />
              <p className="m-0 px-4 py-3 whitespace-pre-line text-slate-700">{r.notes}</p></section>)}
          {(r.participants || []).length > 0 && (
            <section className="carte"><EnteteCarte titre="Convoqués" />
              <div className="px-4 py-3 flex flex-wrap gap-2">{r.participants.map(p => (
                tenue(r) ? <PastilleEtat key={p.id} etat={p.present ? 'reussi' : p.excuse ? 'surveiller' : 'neutre'}>
                  {p.nom}{p.present ? '' : p.excuse ? ' · excusé' : ' · absent'}</PastilleEtat>
                  : <PastilleEtat key={p.id} etat="neutre">{p.nom}</PastilleEtat>))}</div></section>)}
          {(r.taches || []).length > 0 && (
            <section className="carte"><EnteteCarte titre="Décisions et tâches" />
              <ListeEtats className="!border-0 !rounded-none">{r.taches.map(t => {
                const [etat, mot] = STATUT_TACHE[t.statut] || ['neutre', t.statut];
                return <LigneEtat key={t.id} etat={etat} titre={t.titre || t.intitule || 'Tâche'}
                  sous={[t.responsable_nom, t.echeance ? `pour le ${fr(t.echeance)}` : null].filter(Boolean).join(' · ')}
                  meta={<PastilleEtat etat={etat}>{mot}</PastilleEtat>} />;
              })}</ListeEtats></section>)}
          {!lignes(r.ordre_du_jour).length && !(r.points || []).length && !r.notes && (
            <p className="text-slate-500">L’ordre du jour n’a pas encore été écrit.</p>)}
        </div>)}
    </Fenetre>);
}

export default function MesReunions() {
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ouverte, setOuverte] = useState(null);
  const [passees, setPassees] = useState(false);
  useEffect(() => {
    fetch('/api/reunions', { headers: authHeaders() })
      .then(async x => { const j = await x.json().catch(() => null); if (!x.ok || !Array.isArray(j)) throw new Error(j?.error || 'Lecture impossible.'); return j; })
      .then(setListe).catch(e => setErreur(e.message));
  }, []);
  if (erreur) return <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>;
  if (!liste) return <p className="text-second text-slate-500">Chargement…</p>;
  const jour = auj();
  const avenir = liste.filter(r => String(r.date_seance) >= jour).sort((a, b) => String(a.date_seance).localeCompare(String(b.date_seance)));
  const avant = liste.filter(r => String(r.date_seance) < jour);
  const vues = passees ? [...avenir, ...avant] : avenir;
  return (
    <div className="space-y-3">
      <p className="m-0 text-slate-600 text-sm">Les réunions où vous êtes convoqué·e : l’ordre du jour avant, ce qui a été dit et décidé après.</p>
      {avant.length > 0 && (
        <label className="text-second text-slate-600 inline-flex items-center gap-2">
          <input type="checkbox" checked={passees} onChange={e => setPassees(e.target.checked)} /> Montrer aussi les {avant.length} réunion(s) passée(s)</label>)}
      {!vues.length ? <p className="text-slate-500 text-sm">{liste.length ? 'Aucune réunion à venir.' : 'Aucune réunion cette année.'}</p>
        : <ListeEtats>{vues.map(r => {
            const futur = String(r.date_seance) >= jour;
            return <LigneEtat key={r.id} etat={futur ? 'disponible' : 'neutre'} icone={IconCalendarEvent} titre={r.titre}
              sous={`${fr(r.date_seance)}${r.heure_seance ? ` à ${r.heure_seance}` : ''}${r.lieu ? ` · ${r.lieu}` : ''}${r.organisateur_nom ? ` · ${r.organisateur_nom}` : ''}`}
              meta={futur ? <PastilleEtat etat="disponible">à venir</PastilleEtat> : (r.nb_ouvertes ? <PastilleEtat etat="surveiller">{r.nb_ouvertes} tâche(s) ouverte(s)</PastilleEtat> : null)}
              onClick={() => setOuverte(r.id)} />;
          })}</ListeEtats>}
      {ouverte && <Seance id={ouverte} onFermer={() => setOuverte(null)} />}
    </div>);
}

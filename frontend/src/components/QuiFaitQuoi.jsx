/* QUI FAIT QUOI (3.5.066, Charles, 2 novembre 2026 : « analyse qui fait quoi, ce qui n'est pas fait et la demande de charge…
 * et à qui »). Gestion → Équipe → Qui fait quoi, pour la direction : ce que chacun a fait dans Lucie sur la période, ce qui
 * attend (VA, présences, PAE, séances, échéances, tâches), par personne et par section, avec « Confier » sur chaque ligne —
 * la tâche part par la porte habituelle (ConfierTache). Serveur : routes/quiFaitQuoi.js. Une trace absente n'est pas un
 * travail absent : l'écran le dit. */
import { useEffect, useState } from 'react';
import { IconSend } from '@tabler/icons-react';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr, PastilleEtat } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import ConfierTache from './ConfierTache.jsx';

const fmt = d => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : '');
const ROLES = { admin: 'direction', directeur: 'direction', directeur_adjoint: 'direction adjointe', secretariat: 'secrétariat', coordination: 'coordination', professeur: 'enseignant' };

export default function QuiFaitQuoi({ annee }) {
  const [jours, setJours] = useState(30);
  const [d, setD] = useState(null);
  const [confier, setConfier] = useState(null);
  useEffect(() => {
    setD(null);
    fetch(`/api/qui-fait-quoi?annee=${encodeURIComponent(annee || '')}&jours=${jours}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); setD(j); })
      .catch(e => setD({ erreur: e.message }));
  }, [annee, jours]);
  if (!d) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (d.erreur) return <div className="text-sm text-red-700">{d.erreur}</div>;
  const a = d.attente;
  const Confier = ({ titre, detail }) => (
    <button type="button" className="bouton px-2 py-0.5 text-second inline-flex items-center gap-1" onClick={() => setConfier({ titre, detail })}><IconSend size={13} /> Confier</button>);
  const coordDe = s => d.coordinations.filter(c => c.section === s).map(c => c.nom).join(', ');
  const totalPres = a.presences.reduce((t, x) => t + x.n, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-nowrap items-center gap-2">
        <span className="text-second text-slate-600">Ce qui a été fait ces</span>
        <div className="segments">{[7, 30, 90].map(j => <button key={j} type="button" onClick={() => setJours(j)} className={jours === j ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{j} jours</button>)}</div>
        <span className="text-mention text-slate-500">Une trace absente n’est pas un travail absent : ce qui se fait hors de Lucie ne se voit pas ici.</span>
      </div>

      <div className="carte overflow-hidden">
        <EnteteCarte titre="Ce qui attend" sous="Chaque ligne se confie à quelqu’un : la tâche part dans le suivi d’équipe et paraît à son Accueil." />
        <Tableau dense>
          <TableauEntete><Th>Travail</Th><Th align="droite">Volume</Th><Th>À qui</Th><Th /></TableauEntete>
          <tbody>
            {a.va.filter(x => x.a_valider).map(x => (
              <Tr key={`v${x.section}`}><Td>Valider les VA décidées · <b>{x.section}</b></Td><Td align="droite">{x.a_valider}</Td><Td ton="secondaire">Direction, direction adjointe</Td>
                <Td align="droite"><Confier titre={`Valider les ${x.a_valider} VA décidées — ${x.section}`} detail="Étudiants → Valorisation → Analyser en série, étape « Validation » (par séance : une section, une date)." /></Td></Tr>))}
            {a.va.filter(x => x.a_notifier || x.a_eprom).map(x => (
              <Tr key={`n${x.section}`}><Td>Notifier les VA validées{ x.a_eprom ? ', puis encoder dans eProm' : ''} · <b>{x.section}</b></Td><Td align="droite">{x.a_notifier}{x.a_eprom ? ` + ${x.a_eprom}` : ''}</Td><Td ton="secondaire">Secrétariat</Td>
                <Td align="droite"><Confier titre={`Notifier ${x.a_notifier} VA${x.a_eprom ? ` et encoder ${x.a_eprom} dans eProm` : ''} — ${x.section}`} detail="Étudiants → Valorisation : notification, puis encodage eProm." /></Td></Tr>))}
            {a.pae.map(x => (
              <Tr key={`p${x.section}`}><Td>Revoir les PAE · <b>{x.section}</b></Td><Td align="droite">{x.n}</Td>
                <Td ton="secondaire">{coordDe(x.section) || (x.section === '(section non posée)' ? 'Secrétariat (poser la section)' : <PastilleEtat etat="corriger">aucune coordination</PastilleEtat>)}</Td>
                <Td align="droite"><Confier titre={`Revoir ${x.n} PAE — ${x.section}`} detail="Étudiants → Inscriptions & PAE → revue." /></Td></Tr>))}
            {a.seances.map(x => (
              <Tr key={`s${x.ue_num}-${x.org}-${x.session}`}><Td>Clore la séance de l’UE {x.ue_num}{x.org ? ` (org ${x.org})` : ''} · session {x.session} du {fmt(x.date_seance)} · <b>{x.section}</b></Td><Td align="droite">1</Td>
                <Td ton="secondaire">{coordDe(x.section) || '—'}</Td><Td align="droite"><Confier titre={`Clore la séance de l’UE ${x.ue_num} (${fmt(x.date_seance)})`} detail="Étudiants → Délibération : feuille de la séance, clôture." /></Td></Tr>))}
            {a.echeances.map((x, i) => (
              <Tr key={`e${i}`}><Td>Échéance en retard : {x.libelle}</Td><Td align="droite">{x.n}</Td><Td ton="secondaire">{x.responsable}</Td>
                <Td align="droite"><Confier titre={`${x.libelle} (${x.n} en retard)`} detail={`Depuis le ${fmt(x.premiere)}. Échéancier : cocher ce qui est fait, ou le faire.`} /></Td></Tr>))}
            {a.taches.filter(x => x.en_retard).map((x, i) => (
              <Tr key={`t${i}`}><Td>Tâches en retard</Td><Td align="droite">{x.en_retard}</Td><Td ton="secondaire">{x.responsable}</Td><Td /></Tr>))}
          </tbody>
        </Tableau>
      </div>

      <div className="carte overflow-hidden">
        <EnteteCarte titre={`Présences à encoder : ${totalPres} séance(s) passée(s)`} sous="Chaque enseignant encode les siennes (Mes cours → Présences) ; le secrétariat rattrape par Suivi des présences → Par UE." />
        <Tableau dense>
          <TableauEntete><Th>Enseignant</Th><Th>Section</Th><Th align="droite">Séances sans présence</Th><Th>Depuis</Th><Th /></TableauEntete>
          <tbody>{a.presences.slice(0, 40).map((x, i) => (
            <Tr key={i}><Td>{x.enseignant}</Td><Td ton="secondaire">{x.section || '—'}</Td><Td align="droite">{x.n}</Td><Td ton="secondaire">{fmt(x.premiere)}</Td>
              <Td align="droite"><Confier titre={`Encoder les présences de ${x.n} séance(s) — ${x.enseignant}${x.section ? ` (${x.section})` : ''}`} detail={`Séances passées sans présence depuis le ${fmt(x.premiere)}. Mes cours → Présences.`} /></Td></Tr>))}</tbody>
        </Tableau>
        {a.presences.length > 40 && <p className="px-4 py-2 text-second text-slate-500 m-0">… et {a.presences.length - 40} autre(s) ligne(s).</p>}
      </div>

      <div className="carte overflow-hidden">
        <EnteteCarte titre={`Ce qui a été fait (${d.jours} derniers jours)`} sous="Les gestes que Lucie garde : fiches, PAE, résultats, notes (journal), PAE revus, décisions de VA, tâches et échéances cochées." />
        <Tableau dense>
          <TableauEntete><Th>Personne</Th><Th>Rôle</Th><Th align="droite">Fiches</Th><Th align="droite">PAE</Th><Th align="droite">Résultats</Th><Th align="droite">Notes</Th>
            <Th align="droite">PAE revus</Th><Th align="droite">VA décidées</Th><Th align="droite">Tâches</Th><Th align="droite">Échéances</Th></TableauEntete>
          <tbody>{d.activite.map(x => (
            <Tr key={x.nom}><Td>{x.nom}</Td><Td ton="secondaire">{ROLES[x.role] || x.role || '—'}</Td>
              {['fiche', 'pae', 'resultat', 'note', 'revues', 'va', 'taches', 'echeances'].map(k => <Td key={k} align="droite" className="tabular-nums">{x[k] || ''}</Td>)}</Tr>))}</tbody>
        </Tableau>
      </div>

      {(d.sans_coordination.length > 0) && (
        <div className="bloc-etat px-4 py-2.5 text-sm" data-etat="surveiller">
          <b>Sections sans coordination dans Lucie :</b> {d.sans_coordination.join(', ')}. Leurs PAE, leurs échéances et leurs rappels ne tombent chez personne : la section se pose dans Personnel → fiche → Accès Lucie.
        </div>)}
      {confier && <ConfierTache initial={confier} onClose={() => setConfier(null)} onCree={() => setConfier(null)} />}
    </div>
  );
}

/* LES MOTIVATIONS APRÈS LA DÉLIBÉRATION (3.5.313, Charles, 11 novembre 2026 : « pouvoir revoir depuis l'espace profs les
 * commentaires après la délibération, car parfois il en manque » ; tranché : voir et compléter). Mes cours → un cours →
 * « Motivations » (et donc l'espace enseignant, qui monte Mes cours). Pour chaque étudiant ajourné ou refusé dont la séance
 * est close : ses acquis en échec dans ce cours, la motivation retenue au dossier et sa provenance, ou « manquante » avec un
 * champ pour l'écrire. Un motif déjà au dossier ne se remplace pas ici. Serveur : GET/POST /api/mes-cours/:cours/motivations. */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { Encadre, EnteteCarte, PastilleEtat, Tableau, TableauEntete, Th, Td, Tr } from './ui.jsx';

const PROVENANCE = { conseil: 'écrite par le Conseil', enseignant: 'écrite par un enseignant', propose: 'proposée par Lucie, acceptée',
  reprise: 'reprise d’archives' };
const nomPropre = e => `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim();

function Ecrire({ onPoser }) {
  const [texte, setTexte] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const poser = async () => {
    setEnCours(true); setErreur(null);
    try { await onPoser(texte.trim()); } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  return (
    <div className="space-y-1">
      <textarea value={texte} onChange={ev => setTexte(ev.target.value)} rows={2} data-reponses="motif-echec"
        placeholder="Ce que l’étudiant ne maîtrise pas, au regard de l’acquis"
        className="w-full border rounded-champ px-2 py-1 text-second" />
      <div className="flex items-center gap-2">
        <button type="button" className="bouton bouton-fort" disabled={enCours || texte.trim().length < 5} onClick={poser}>Enregistrer</button>
        {erreur && <span className="text-second" style={{ color: 'var(--c-refuse)' }}>{erreur}</span>}
      </div>
    </div>);
}

export default function MotivationsCours({ coursCode, annee }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const url = `/api/mes-cours/${encodeURIComponent(coursCode)}/motivations`;
  const charger = () => fetch(`${url}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible'); setD(j); setErreur(null); })
    .catch(e => setErreur(e.message));
  useEffect(() => { setD(null); charger(); }, [coursCode, annee]); // eslint-disable-line react-hooks/exhaustive-deps

  const poser = async (etudiant_id, aa_code, motif) => {
    const r = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee, etudiant_id, aa_code, motif }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Enregistrement impossible');
    await charger();
  };

  if (erreur) return <Encadre etat="corriger" titre="Motivations">{erreur}</Encadre>;
  if (!d) return <p className="text-sm text-slate-500">Chargement…</p>;
  const lignes = d.etudiants.flatMap(e => e.acquis.map((a, k) => ({ e, a, premier: k === 0, n: e.acquis.length })));
  return (
    <section className="carte overflow-hidden">
      <EnteteCarte titre="Motivations des échecs, après la délibération"
        sous={d.etudiants.length
          ? (d.manquantes ? `${d.manquantes} motivation(s) manquante(s) : écrivez-les ici, le secrétariat est prévenu.` : 'Toutes les motivations sont au dossier.')
          : 'Aucun étudiant ajourné ou refusé dans ce cours dont la séance est close.'} />
      {lignes.length > 0 && (
        <Tableau className="!border-0 !rounded-none">
          <TableauEntete>
            <Th largeur="w-[22%]">Étudiant</Th><Th largeur="w-[22%]">Acquis</Th><Th align="centre" largeur="w-[8%]">Note</Th><Th>Motivation au dossier</Th>
          </TableauEntete>
          <tbody>
            {lignes.map(({ e, a, premier }) => (
              <Tr key={`${e.id}|${a.aa_code}`}>
                <Td className="align-top">{premier ? <>
                  <div className="font-semibold">{nomPropre(e)}</div>
                  <div className="text-mention text-slate-500">{e.resultat === 'refuse' ? 'refusé' : 'ajourné'} · session {e.session}{e.groupe ? ` · ${e.groupe}` : ''}</div>
                </> : null}</Td>
                <Td className="align-top"><b>{a.aa_code}</b> <span className="text-mention text-slate-500">{a.description}</span></Td>
                <Td align="centre" className="align-top tabular-nums">{a.note ?? '—'}</Td>
                <Td className="align-top">
                  {a.motif ? (<>
                    <div className="whitespace-pre-line text-second">{a.motif}</div>
                    <div className="text-mention text-slate-400">{PROVENANCE[a.source] || 'au dossier'}</div>
                  </>) : (<>
                    <PastilleEtat etat="corriger">manquante</PastilleEtat>
                    <div className="mt-1"><Ecrire onPoser={t => poser(e.id, a.aa_code, t)} /></div>
                  </>)}
                </Td>
              </Tr>))}
          </tbody>
        </Tableau>)}
    </section>
  );
}

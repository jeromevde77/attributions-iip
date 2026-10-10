import { useEffect, useState } from 'react';
import { IconArrowForwardUp } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre, TuileEtat } from './ui.jsx';

/**
 * LES REPORTS DE NOTES D'OFFICE — le rattrapage des PAE déjà composés.
 *
 * Charles, 27 septembre 2026 : « dès qu'un étudiant est en refus, on regarde
 * ses notes. Si dans un cours il a réussi tous les AA, le cours est dispensé
 * pour l'année suivante ; les notes sont placées dans le nouveau cours comme
 * s'il avait eu les mêmes notes. » Le report se pose désormais seul quand le
 * PAE s'enregistre ; cette fenêtre rattrape ceux composés avant, et le
 * rapport ne s'écrit qu'après avoir été vu (simulation d'abord).
 */
export default function ReportsOffice({ annee, onClose }) {
  const [rapport, setRapport] = useState(null);
  const [fait, setFait] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  /* DEUX FACES : ce qui reste à poser, et ce qui est déjà posé (Charles, 27
     septembre 2026 : « je veux savoir les reports déjà portés »). */
  const [face, setFace] = useState('poser');
  const [poses, setPoses] = useState(null);
  const [filtre, setFiltre] = useState('');
  const chargerPoses = () => fetch(`/api/acquis/reports/poses?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
    .then(r => r.json()).then(j => setPoses(j.lignes || [])).catch(() => setPoses([]));
  useEffect(() => { chargerPoses(); }, [annee]);

  async function appeler(simulation) {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/reports/office', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee, simulation }),
      });
      const texte = await rep.text();
      let j; try { j = JSON.parse(texte); } catch { j = { error: `Réponse inattendue du serveur (code ${rep.status}).` }; }
      if (!rep.ok || j.error) { setErreur(j.error); return null; }
      return j;
    } catch (e) { setErreur(e.message); return null; }
    finally { setEnCours(false); }
  }

  useEffect(() => { appeler(true).then(j => j && setRapport(j)); }, [annee]);

  const poser = async () => {
    const j = await appeler(false);
    if (j) { setFait(j); setRapport(null); chargerPoses(); }
  };

  const lignes = rapport?.lignes || [];
  const court = a => String(a || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2');

  return (
    <Fenetre icone={IconArrowForwardUp} titre="Reports de notes" large="grande"
      sous={`Cours dont tous les acquis ont été maîtrisés l'an passé — dispensés en ${annee}, notes reprises`}
      onFermer={onClose}
      pied={
        <>
          <span className="flex-1 min-w-0 text-second text-slate-500">
            {fait ? 'Reports posés. Ils se posent désormais seuls à chaque PAE enregistré.'
              : rapport ? (lignes.length ? 'Rien n’est écrit tant que vous n’avez pas cliqué.' : 'Aucun report à poser.')
              : 'Recherche des cours reportables…'}
          </span>
          {!fait && (
            <button className="bouton bouton-fort" disabled={enCours || !lignes.length} onClick={poser}>
              {enCours ? 'En cours…' : `Poser ${lignes.length} report(s)`}
            </button>
          )}
          <button className="bouton" onClick={onClose}>Fermer</button>
        </>
      }>
      <div className="space-y-3 text-sm">
        <div className="flex gap-1 border-b border-slate-200">
          <button type="button" onClick={() => setFace('poser')} className={`onglet-page ${face === 'poser' ? 'onglet-page-actif' : ''}`}>
            À poser{rapport ? ` (${lignes.length})` : ''}
          </button>
          <button type="button" onClick={() => setFace('poses')} className={`onglet-page ${face === 'poses' ? 'onglet-page-actif' : ''}`}>
            Déjà posés{poses ? ` (${poses.length})` : ''}
          </button>
        </div>
        {face === 'poses' ? <DejaPoses poses={poses} filtre={filtre} setFiltre={setFiltre} court={court} /> : <>
        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
        {fait && (
          <div data-etat="reussi" className="bloc-etat px-3 py-2">
            <b>{fait.lignes.length} cours reporté(s)</b> pour {fait.etudiants} étudiant(s) en {fait.annee}.
          </div>
        )}
        {rapport && (
          <>
            <div className="grid grid-cols-2 gap-2 max-w-md">
              <TuileEtat etat="disponible" valeur={lignes.length} libelle="Cours à reporter" />
              <TuileEtat etat="neutre" valeur={rapport.etudiants} libelle="Étudiants concernés" />
            </div>
            {!!lignes.length && (
              <div className="border border-slate-200 rounded-carte overflow-hidden">
                <table className="w-full text-second">
                  <thead className="tab-entete">
                    <tr className="text-left text-xs text-slate-500">
                      <th className="px-3 py-1.5">Étudiant</th>
                      <th className="px-2 py-1.5">UE</th>
                      <th className="px-2 py-1.5">Cours</th>
                      <th className="px-2 py-1.5">Acquis repris</th>
                      <th className="px-2 py-1.5 text-right">Note</th>
                      <th className="px-3 py-1.5">Depuis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map(l => (
                      <tr key={`${l.etudiant_id}-${l.ue_num}-${l.cours_code}`} className="border-t border-slate-100 bg-white">
                        <td className="px-3 py-1 whitespace-nowrap"><b>{(l.nom || '').toUpperCase()}</b> {l.prenom}
                          {l.section && <span className="text-slate-400"> · {l.section}</span>}</td>
                        <td className="px-2 py-1 tabular-nums">{l.ue_num}</td>
                        <td className="px-2 py-1">{l.cours_code}{l.cours_nom ? <span className="text-slate-500"> — {l.cours_nom}</span> : null}</td>
                        <td className="px-2 py-1 text-slate-500 tabular-nums">
                          {(l.aas || []).map(a => `${a.aa_code} : ${Math.round(a.note)}`).join(' · ')}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums font-semibold">{l.note != null ? `${Math.round(l.note)}/20` : '—'}</td>
                        <td className="px-3 py-1 text-slate-500">{court(l.annee_origine)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        </>}
      </div>
    </Fenetre>
  );
}

function DejaPoses({ poses, filtre, setFiltre, court }) {
  if (poses === null) return <p className="text-slate-400">Chargement…</p>;
  const q = filtre.trim().toLowerCase();
  const vus = poses.filter(l => !q || `${l.nom} ${l.prenom} ${l.section} ${l.ue_num} ${l.ue_nom || ''} ${l.cours_code} ${l.cours_nom || ''}`.toLowerCase().includes(q));
  const etu = new Set(vus.map(l => l.etudiant_id)).size;
  const retires = vus.filter(l => l.statut !== 'accorde').length;
  const date = v => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');
  return (
    <>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="grid grid-cols-2 gap-2 max-w-md flex-1">
          <TuileEtat etat="reussi" valeur={vus.length - retires} libelle="Cours reportés" />
          <TuileEtat etat="neutre" valeur={etu} libelle="Étudiants" />
        </div>
        <input value={filtre} onChange={e => setFiltre(e.target.value)} placeholder="Nom, section, unité ou cours…"
          className="controle w-64 max-w-full border border-slate-300 rounded-champ bg-white text-sm" />
      </div>
      {!vus.length ? <p className="text-slate-400">{poses.length ? 'Aucun report ne correspond.' : 'Aucun report posé pour cette année.'}</p> : (
        <div className="border border-slate-200 rounded-carte overflow-hidden">
          <table className="w-full text-second">
            <thead className="tab-entete">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-3 py-1.5">Étudiant</th>
                <th className="px-2 py-1.5">UE</th>
                <th className="px-2 py-1.5">Cours</th>
                <th className="px-2 py-1.5 text-right">Note</th>
                <th className="px-2 py-1.5">Depuis</th>
                <th className="px-3 py-1.5">Posé</th>
              </tr>
            </thead>
            <tbody>
              {vus.map(l => (
                <tr key={`${l.etudiant_id}-${l.ue_num}-${l.cours_code}`} className={`border-t border-slate-100 bg-white ${l.statut !== 'accorde' ? 'text-slate-400' : ''}`}>
                  <td className="px-3 py-1 whitespace-nowrap"><b>{(l.nom || '').toUpperCase()}</b> {l.prenom}
                    {l.section && <span className="text-slate-400"> · {l.section}</span>}</td>
                  <td className="px-2 py-1 tabular-nums" title={l.ue_nom || ''}>{l.ue_num}</td>
                  <td className="px-2 py-1">{l.cours_code}{l.cours_nom ? <span className="text-slate-500"> — {l.cours_nom}</span> : null}</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">{l.note != null ? `${Math.round(l.note)}/20` : '—'}</td>
                  <td className="px-2 py-1 text-slate-500">{court(l.annee_origine)}</td>
                  <td className="px-3 py-1 text-slate-500 whitespace-nowrap">
                    {date(l.decide_le || l.cree_le)}{l.decide_par ? ` · ${String(l.decide_par).trim()}` : ''}
                    {l.statut !== 'accorde' ? ' · refusé' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

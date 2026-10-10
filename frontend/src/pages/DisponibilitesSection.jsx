import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { informer } from '../lib/dialogue.jsx';

/**
 * LES DISPONIBILITÉS DES ENSEIGNANTS D'UNE SECTION (Charles, 10 octobre 2026 : « fais
 * les disponibilités des profs » — saisies par le secrétariat ou la coordination).
 * Face du laboratoire temporel. Une carte par enseignant de la section (ceux qui y
 * ont une attribution cette année) ; une grille jours × plages de la SECTION,
 * samedi compris, par quadrimestre. Un enseignant sans saisie est disponible
 * partout ; dès qu'une case est cochée, seules les cases cochées comptent — la
 * simulation n'y place rien d'autre.
 * Même table que la fiche de l'enseignant (prof_disponibilite) : une saisie faite
 * ici se voit là, et inversement. Les créneaux d'une AUTRE section (un enseignant
 * qui enseigne ailleurs) sont gardés tels quels à l'enregistrement.
 */
const JOURS = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

export default function DisponibilitesSection({ section, annee, peutEcrire }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [quadri, setQuadri] = useState('Q1');
  const [q, setQ] = useState('');
  const [modifs, setModifs] = useState({});         // prof → Set de « jour|creneau » (quadri courant)
  const [enCours, setEnCours] = useState(null);

  const charger = async () => {
    try {
      const r = await fetch(`/api/etudiants/disponibilites-section?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setD(j); setModifs({}); setErreur(null);
    } catch (e) { setErreur(e.message); }
  };
  useEffect(() => { setD(null); charger(); }, [section, annee]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setModifs({}); }, [quadri]);

  // Les lignes : les horaires distincts des plages de la section ; une case n'existe que si la plage existe ce jour-là.
  const creneauDe = useMemo(() => new Map((d?.creneaux || []).map(c => [`${c.heure_debut}|${c.heure_fin}`, c.id])), [d]);
  const lignes = useMemo(() => [...new Set((d?.plages || []).map(p => `${p.debut}|${p.fin}`))].sort(), [d]);
  const jours = useMemo(() => [...new Set((d?.plages || []).map(p => p.jour))].sort(), [d]);
  const existe = (j, l) => (d?.plages || []).some(p => p.jour === j && `${p.debut}|${p.fin}` === l);
  const saisies = (pid, qd) => new Set((d?.saisies || []).filter(x => x.professeur_id === pid && x.quadrimestre === qd).map(x => `${x.jour}|${x.creneau_id}`));
  const actuel = pid => modifs[pid] || saisies(pid, quadri);
  // Chaque geste part de l'état le plus récent (m), jamais d'une copie d'avant le clic précédent.
  const basculer = (pid, cle) => setModifs(m => { const s = new Set(m[pid] || saisies(pid, quadri)); s.has(cle) ? s.delete(cle) : s.add(cle); return { ...m, [pid]: s }; });
  const tout = (pid, oui) => setModifs(m => {
    const s = new Set([...(m[pid] || saisies(pid, quadri))].filter(c => !lignes.some(l => c.endsWith(`|${creneauDe.get(l)}`))));
    if (oui) for (const j of jours) for (const l of lignes) if (existe(j, l)) s.add(`${j}|${creneauDe.get(l)}`);
    return { ...m, [pid]: s };
  });

  async function enregistrer(p) {
    setEnCours(p.id);
    try {
      const dispos = [...actuel(p.id)].map(c => { const [jour, creneau_id] = c.split('|').map(Number); return { jour, creneau_id, disponible: 1 }; });
      const r = await fetch(`/api/prerequis/disponibilites/${p.id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ quadrimestre: quadri, dispos }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      await charger();
    } catch (e) { await informer(`❌ ${e.message}`); } finally { setEnCours(null); }
  }

  const n = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const profs = (d?.profs || []).filter(p => !q.trim() || n(`${p.nom} ${p.prenom} ${p.cours.join(' ')}`).includes(n(q)));
  const saisis = (d?.profs || []).filter(p => saisies(p.id, quadri).size).length;

  if (erreur) return <div className="text-[12.5px]" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>;
  if (!d) return <div className="text-[13px] text-slate-400">Chargement…</div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="segments flex h-9">
          {['Q1', 'Q2'].map(x => <button key={x} onClick={() => setQuadri(x)} className={`px-3 text-[12.5px] ${quadri === x ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>{x}</button>)}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un enseignant ou un cours…" className="controle w-64" data-reponses="non" />
        <span className="text-[12.5px] text-slate-600"><b>{saisis}</b> enseignant(s) sur {d.profs.length} ont une saisie en {quadri}.</span>
      </div>
      <div className="bloc-etat px-3 py-2 text-[12.5px]" data-etat="neutre">
        Sans saisie, un enseignant est disponible partout. Dès qu’une case est cochée, seules les cases cochées comptent : la simulation ne lui place rien d’autre.
        Les cases suivent les plages de {section} ; ce qui est saisi ici se voit aussi dans sa fiche.
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
        {profs.map(p => {
          const s = actuel(p.id), modifie = !!modifs[p.id];
          const nb = [...s].filter(c => lignes.some(l => c.endsWith(`|${creneauDe.get(l)}`))).length;
          return (
            <div key={p.id} className="carte p-3 space-y-2 bg-white">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <b className="text-[13px] text-[#1B2B4B]">{String(p.nom || '').toUpperCase()} {p.prenom}</b>
                  <div className="text-[11px] text-slate-500 truncate" title={p.cours.join(', ')}>{p.cours.join(' · ')}</div>
                </div>
                <span className="flex-none px-1.5 rounded-[5px] text-[10.5px] font-semibold text-white" style={{ background: nb ? 'var(--c-reussi)' : '#94A3B8' }}>
                  {nb ? `${nb} créneau(x)` : 'disponible partout'}</span>
              </div>
              <table className="w-full text-[11px] border-collapse">
                <thead><tr><th className="text-left font-normal text-slate-400 w-[70px]" />{jours.map(j => <th key={j} className="font-semibold text-slate-500">{JOURS[j]}</th>)}</tr></thead>
                <tbody>
                  {lignes.map(l => (
                    <tr key={l}>
                      <td className="text-slate-500 tabular-nums pr-1">{l.replace('|', '–')}</td>
                      {jours.map(j => {
                        const cle = `${j}|${creneauDe.get(l)}`, ok = existe(j, l), on = s.has(cle);
                        return (
                          <td key={j} className="p-[2px]">
                            {ok ? <button disabled={!peutEcrire} onClick={() => basculer(p.id, cle)}
                              className="w-full h-[22px] rounded-[4px] border text-[10px] font-bold"
                              style={{ background: on ? 'var(--c-reussi)' : '#fff', borderColor: on ? 'var(--c-reussi)' : '#D8DCE4', color: on ? '#fff' : '#CBD5E1' }}
                              title={`${JOURS[j]} ${l.replace('|', '–')} : ${on ? 'disponible' : nb ? 'pas disponible' : 'pas de saisie (disponible partout)'}`}>{on ? '✓' : ''}</button>
                              : <div className="h-[22px]" />}
                          </td>);
                      })}
                    </tr>))}
                </tbody>
              </table>
              {peutEcrire && (
                <div className="flex flex-wrap gap-2">
                  <button className="bouton !h-8" onClick={() => tout(p.id, true)}>Tout cocher</button>
                  <button className="bouton !h-8" onClick={() => tout(p.id, false)} title="Plus aucune saisie : disponible partout">Effacer</button>
                  <span className="flex-1" />
                  <button className="bouton bouton-fort !h-8" disabled={!modifie || enCours === p.id} onClick={() => enregistrer(p)}>
                    {enCours === p.id ? 'Enregistrement…' : 'Enregistrer'}</button>
                </div>)}
            </div>);
        })}
        {!profs.length && <p className="text-[13px] text-slate-500">Aucun enseignant n’a d’attribution dans {section} cette année.</p>}
      </div>
    </div>
  );
}

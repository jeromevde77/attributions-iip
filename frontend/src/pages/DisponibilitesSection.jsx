/**
 * L'AGENDA DES ENSEIGNANTS D'UNE SECTION — face « Les disponibilités » du
 * laboratoire (Charles, 10 octobre 2026 : « vert dispo, rouge pas dispo, orange
 * éventuellement » ; « cela doit couvrir toutes les sections — Berte donne cours
 * dans plusieurs sections »). L'agenda appartient à l'ENSEIGNANT, pas à la
 * section : il se peint sur la BASE de l'école (face « Le planning »), le même
 * dans chaque section et dans sa fiche (planning_contrainte, type « prof »).
 * Tout est vert par défaut ; seuls l'orange et le rouge s'écrivent.
 */
import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { informer } from '../lib/dialogue.jsx';

import AgendaSemaine, { DISPO, LegendeDispo, suivant } from '../components/AgendaSemaine.jsx';

export default function DisponibilitesSection({ section, annee, peutEcrire }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [quadri, setQuadri] = useState('Q1');
  const [q, setQ] = useState('');
  const [modifs, setModifs] = useState({});         // prof → Map « jour|debut » → 0/2 (quadri courant)
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

  const saisies = (pid, qd) => new Map((d?.saisies || []).filter(x => x.professeur_id === pid && x.quadrimestre === qd).map(x => [`${x.jour}|${x.debut}`, Number(x.valeur) || 0]));
  const actuel = pid => modifs[pid] || saisies(pid, quadri);
  // Chaque geste part de l'état le plus récent (m), jamais d'une copie d'avant le clic précédent.
  const changer = (pid, j, c) => setModifs(m => {
    const base = new Map(m[pid] || saisies(pid, quadri)), cle = `${j}|${c.debut}`;
    const v = suivant(base.has(cle) ? base.get(cle) : 1);
    if (v === 1) base.delete(cle); else base.set(cle, v);
    return { ...m, [pid]: base };
  });

  async function enregistrer(p) {
    setEnCours(p.id);
    try {
      const cases = [...actuel(p.id)].map(([c, valeur]) => { const [jour, debut] = c.split('|'); return { jour: Number(jour), debut, valeur }; });
      const r = await fetch(`/api/prerequis/disponibilites/${p.id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ quadrimestre: quadri, cases }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      await charger();
    } catch (e) { await informer(`❌ ${e.message}`); } finally { setEnCours(null); }
  }

  // Les jours où l'école a des blocs : un dimanche vide ne prend pas de place.
  const joursBase = useMemo(() => [...new Set((d?.base || []).map(c => c.jour))].sort(), [d]);
  const n = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const profs = (d?.profs || []).filter(p => !q.trim() || n(`${p.nom} ${p.prenom} ${p.cours.join(' ')}`).includes(n(q)));
  const saisis = (d?.profs || []).filter(p => saisies(p.id, quadri).size).length;

  if (erreur) return <div className="text-second" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>;
  if (!d) return <div className="text-sm text-slate-400">Chargement…</div>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="segments flex h-9">
          {['Q1', 'Q2'].map(x => <button key={x} onClick={() => setQuadri(x)} className={`px-3 text-second ${quadri === x ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>{x}</button>)}
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un enseignant ou un cours…" className="controle w-64" data-reponses="non" />
        <span className="text-second text-slate-600"><b>{saisis}</b> enseignant(s) sur {d.profs.length} ont des contraintes en {quadri}.</span>
        <span className="flex-1" />
        <LegendeDispo />
      </div>
      <div className="bloc-etat px-3 py-2 text-second" data-etat="neutre">
        Cliquez sur une case pour la changer : <b>vert</b> disponible, <b>orange</b> éventuellement (la simulation l’évite tant qu’elle trouve mieux), <b>rouge</b> pas disponible.
        L’agenda est celui de <b>l’enseignant</b>, commun à <b>toutes ses sections</b> et à sa fiche, posé sur les blocs de l’école (face « Le planning »).
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {profs.map(p => {
          const m = actuel(p.id), modifie = !!modifs[p.id];
          const compte = v => [...m.values()].filter(x => x === v).length;
          return (
            <div key={p.id} className="carte p-3 space-y-2 bg-white">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <b className="text-sm text[color:var(--c-principal,_#1B2B4B)]">{String(p.nom || '').toUpperCase()} {p.prenom}</b>
                  <div className="text-xs text-slate-500 truncate" title={p.cours.join(', ')}>{p.cours.join(' · ')}</div>
                  {!!p.autres_sections?.length && <div className="text-xs text-slate-500">aussi en {p.autres_sections.join(', ')}</div>}
                </div>
                {m.size
                  ? <span className="flex-none flex gap-1">{[2, 0].filter(v => compte(v)).map(v => (
                      <span key={v} className="px-1.5 rounded-pastille text-mention font-semibold text-white" style={{ background: DISPO[v].fond }} title={DISPO[v].nom}>{compte(v)}</span>))}</span>
                  : <span className="flex-none px-1.5 rounded-pastille text-mention font-semibold text-white" style={{ background: 'var(--c-reussi)' }}>disponible partout</span>}
              </div>
              <AgendaSemaine compact base={d.base} jours={joursBase} desactive={!peutEcrire} valeur={(j, c) => m.get(`${j}|${c.debut}`) ?? 1} onCase={(j, c) => changer(p.id, j, c)} />
              {peutEcrire && (
                <div className="flex flex-wrap gap-2">
                  <button className="bouton !h-8" disabled={!m.size} onClick={() => setModifs(x => ({ ...x, [p.id]: new Map() }))} title="Tout remettre en vert">Tout vert</button>
                  <span className="flex-1" />
                  <button className="bouton bouton-fort !h-8" disabled={!modifie || enCours === p.id} onClick={() => enregistrer(p)}>
                    {enCours === p.id ? 'Enregistrement…' : 'Enregistrer'}</button>
                </div>)}
            </div>);
        })}
        {!profs.length && <p className="text-sm text-slate-500">Aucun enseignant n’a d’attribution dans {section} cette année.</p>}
      </div>
    </div>
  );
}

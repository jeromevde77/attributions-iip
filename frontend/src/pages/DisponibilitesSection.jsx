/**
 * L'AGENDA DES ENSEIGNANTS D'UNE SECTION (Charles, 10 octobre 2026 : « un mini
 * agenda de semaine — vert dispo, rouge pas dispo, orange éventuellement » ; puis :
 * « cela doit couvrir toutes les sections, sinon tu vas te bloquer — Berte donne
 * cours dans plusieurs sections »). Face du laboratoire temporel.
 * L'agenda appartient à l'ENSEIGNANT, pas à la section : une seule grille, six
 * jours, tranches de deux heures de 8 h à 22 h (table prof_agenda) — la même dans
 * chaque section et dans sa fiche. La simulation lit, pour chaque séance de
 * n'importe quelle section, les tranches qu'elle chevauche et retient la plus
 * restrictive. Tout est vert par défaut ; seuls l'orange et le rouge s'écrivent.
 */
import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { informer } from '../lib/dialogue.jsx';

const JOURS = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
export const AGENDA_HEURES = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
const finDe = h => `${String(Number(h.slice(0, 2)) + 2).padStart(2, '0')}:00`;

export const DISPO = {
  1: { nom: 'disponible', fond: 'var(--c-reussi)', signe: '' },
  2: { nom: 'éventuellement', fond: 'var(--c-attente)', signe: '?' },
  0: { nom: 'pas disponible', fond: 'var(--c-refuse)', signe: '✕' },
};
export const suivant = v => (v === 1 ? 2 : v === 2 ? 0 : 1);

/** La grille : un clic fait tourner la case vert → orange → rouge → vert. */
export function MiniAgenda({ valeur, onCase, desactive, grand }) {
  const h = grand ? 28 : 20;
  return (
    <table className="w-full border-collapse" style={{ fontSize: grand ? 12 : 10.5 }}>
      <thead><tr><th className="w-[46px]" />{[1, 2, 3, 4, 5, 6].map(j => <th key={j} className="font-semibold text-slate-500 pb-0.5">{JOURS[j]}</th>)}</tr></thead>
      <tbody>
        {AGENDA_HEURES.map(hr => (
          <tr key={hr}>
            <td className="text-slate-500 tabular-nums pr-1 whitespace-nowrap" title={`${hr}–${finDe(hr)}`}>{hr.replace(':00', ' h')}</td>
            {[1, 2, 3, 4, 5, 6].map(j => {
              const v = valeur(j, hr), st = DISPO[v];
              return (
                <td key={j} className="p-[1.5px]">
                  <button type="button" disabled={desactive} onClick={() => onCase(j, hr)}
                    className="w-full rounded-[4px] font-bold text-white"
                    style={{ height: h, background: st.fond, opacity: v === 1 ? 0.85 : 1, cursor: desactive ? 'default' : 'pointer' }}
                    title={`${JOURS[j]} ${hr}–${finDe(hr)} : ${st.nom}${desactive ? '' : ' — cliquer pour changer'}`}>{st.signe}</button>
                </td>);
            })}
          </tr>))}
      </tbody>
    </table>
  );
}

export function LegendeDispo() {
  return (
    <span className="inline-flex flex-wrap items-center gap-3 text-[11.5px] text-slate-600">
      {[1, 2, 0].map(v => (
        <span key={v} className="inline-flex items-center gap-1">
          <span className="inline-block w-3.5 h-3.5 rounded-[3px]" style={{ background: DISPO[v].fond }} />{DISPO[v].nom}</span>))}
    </span>
  );
}

export default function DisponibilitesSection({ section, annee, peutEcrire }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [quadri, setQuadri] = useState('Q1');
  const [q, setQ] = useState('');
  const [modifs, setModifs] = useState({});         // prof → Map « jour|heure » → 0/2 (quadri courant)
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

  const saisies = (pid, qd) => new Map((d?.saisies || []).filter(x => x.professeur_id === pid && x.quadrimestre === qd).map(x => [`${x.jour}|${x.heure}`, Number(x.valeur) || 0]));
  const actuel = pid => modifs[pid] || saisies(pid, quadri);
  // Chaque geste part de l'état le plus récent (m), jamais d'une copie d'avant le clic précédent.
  const changer = (pid, j, h) => setModifs(m => {
    const base = new Map(m[pid] || saisies(pid, quadri)), cle = `${j}|${h}`;
    const v = suivant(base.has(cle) ? base.get(cle) : 1);
    if (v === 1) base.delete(cle); else base.set(cle, v);
    return { ...m, [pid]: base };
  });

  async function enregistrer(p) {
    setEnCours(p.id);
    try {
      const cases = [...actuel(p.id)].map(([c, valeur]) => { const [jour, heure] = c.split('|'); return { jour: Number(jour), heure, valeur }; });
      const r = await fetch(`/api/prerequis/disponibilites/${p.id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ quadrimestre: quadri, cases }) });
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
        <span className="text-[12.5px] text-slate-600"><b>{saisis}</b> enseignant(s) sur {d.profs.length} ont des contraintes en {quadri}.</span>
        <span className="flex-1" />
        <LegendeDispo />
      </div>
      <div className="bloc-etat px-3 py-2 text-[12.5px]" data-etat="neutre">
        Cliquez sur une case pour la changer : <b>vert</b> disponible, <b>orange</b> éventuellement (la simulation l’évite tant qu’elle trouve mieux), <b>rouge</b> pas disponible.
        L’agenda est celui de <b>l’enseignant</b>, commun à <b>toutes ses sections</b> et à sa fiche : une séance qui chevauche une tranche rouge n’est placée nulle part.
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {profs.map(p => {
          const m = actuel(p.id), modifie = !!modifs[p.id];
          const compte = v => [...m.values()].filter(x => x === v).length;
          return (
            <div key={p.id} className="carte p-3 space-y-2 bg-white">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <b className="text-[13px] text-[#1B2B4B]">{String(p.nom || '').toUpperCase()} {p.prenom}</b>
                  <div className="text-[11px] text-slate-500 truncate" title={p.cours.join(', ')}>{p.cours.join(' · ')}</div>
                  {!!p.autres_sections?.length && <div className="text-[11px] text-slate-500">aussi en {p.autres_sections.join(', ')}</div>}
                </div>
                {m.size
                  ? <span className="flex-none flex gap-1">{[2, 0].filter(v => compte(v)).map(v => (
                      <span key={v} className="px-1.5 rounded-[5px] text-[10.5px] font-semibold text-white" style={{ background: DISPO[v].fond }} title={DISPO[v].nom}>{compte(v)}</span>))}</span>
                  : <span className="flex-none px-1.5 rounded-[5px] text-[10.5px] font-semibold text-white" style={{ background: 'var(--c-reussi)' }}>disponible partout</span>}
              </div>
              <MiniAgenda desactive={!peutEcrire} valeur={(j, h) => m.get(`${j}|${h}`) ?? 1} onCase={(j, h) => changer(p.id, j, h)} />
              {peutEcrire && (
                <div className="flex flex-wrap gap-2">
                  <button className="bouton !h-8" disabled={!m.size} onClick={() => setModifs(x => ({ ...x, [p.id]: new Map() }))} title="Tout remettre en vert">Tout vert</button>
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

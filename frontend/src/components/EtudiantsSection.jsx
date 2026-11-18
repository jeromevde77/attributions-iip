/* LES ÉTUDIANTS D'UNE SECTION, EN DISQUES (3.5.552 ; sorti en composant en 3.5.562 pour servir aussi le dossier du COPIL, Charles :
   « revois le dossier COPIL avec les nouveaux graphiques et tableaux »). Cinq disques (femmes, primo-inscrits, Bruxelles, hors UE,
   réussite en 1re session) avec l'IIP ou l'ASBL en cercle intérieur, et les inscrits année par année. Données : GET /api/pilotage/lecture
   (passées par `lec` quand l'écran les a déjà) et /api/pilotage/population-ecole (évolution). */
import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { Disque, ComparerA, Partie } from './Disques.jsx';

const n0 = v => Math.round(v || 0).toLocaleString('fr-BE');

export default function EtudiantsSection({ annee, section, lec = null }) {
  const [ref, setRef] = useState('IIP');
  const [d, setD] = useState(lec);
  const [evo, setEvo] = useState(null);
  useEffect(() => { if (lec) { setD(lec); return; }
    fetch(`/api/pilotage/lecture?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)).then(setD).catch(() => setD(null)); }, [annee, lec]);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/pilotage/population-ecole?annee=${encodeURIComponent(annee)}&sle=compris&section=${encodeURIComponent(section)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(j => vivant && setEvo(j?.evolution || [])).catch(() => vivant && setEvo([]));
    return () => { vivant = false; };
  }, [annee, section]);
  const S = d?.sections?.find(x => x.section === section);
  if (!S) return <p className="text-second text-slate-400">Lecture des étudiants…</p>;
  const R = ref === 'ASBL' ? (d.asbl || {}) : (d.iip || {});
  const D = [['Femmes', 'femmes', 'var(--c-principal)'], ['Primo-inscrits', 'primo', '#05B7E6'], ['Domicile à Bruxelles', 'bruxelles', '#19537E'],
    ['Hors UE', 'hors_ue', '#F9B619'], ['Réussite 1re session', 'reussite_s1', 'var(--c-reussi)']];
  const ev = (evo || []).map(a => ({ a: `${String(a.annee).slice(2, 4)}-${String(a.annee).slice(7, 9)}`, n: a.par_section?.[section] })).filter(x => x.n != null).slice(-5);
  const mx = Math.max(1, ...ev.map(x => x.n));
  const cr = S.croissance == null ? '—' : `${S.croissance > 0 ? '+' : ''}${n0(S.croissance)} %`;
  return (
    <Partie titre="Les étudiants" sous={`${n0(S.inscrits)} inscrits au 15/10 · ${cr} sur un an${S.age != null ? ` · âge moyen ${n0(S.age)} ans` : ''}`}
      droite={<ComparerA valeur={ref} onChange={setRef} />}>
      <div className="grid grid-cols-1 lg:[grid-template-columns:1.4fr_1fr]">
        <div className="px-4 py-3 grid gap-2 lg:border-r border-slate-100" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
          {D.map(([nom, k, c]) => <Disque key={k} nom={nom} valeur={S[k]} reference={R[k] ?? null} nomRef={ref} couleur={c} />)}
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="text-mention font-bold uppercase tracking-wider text-slate-500">Inscrits, année par année</div>
          {ev.length ? (
            <div className="flex items-end gap-4 h-[130px] pt-2">
              {ev.map(x => (
                <div key={x.a} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-second font-semibold tabular-nums">{n0(x.n)}</span>
                  <div className="w-full max-w-[44px] rounded-t" style={{ height: Math.round((x.n / mx) * 90), background: '#19537E' }} />
                  <span className="text-mention text-slate-500">{x.a}</span>
                </div>))}
            </div>) : <p className="text-second text-slate-400">Évolution en lecture…</p>}
        </div>
      </div>
      <div className="px-4 pb-3 text-mention text-slate-500">Anneau de couleur : {section} · cercle intérieur : {ref === 'ASBL' ? 'l’ASBL (quand la HELB publie le chiffre)' : 'l’IIP'}.</div>
    </Partie>);
}

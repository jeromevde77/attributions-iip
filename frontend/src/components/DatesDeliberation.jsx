/* LES DATES DES DÉLIBÉRATIONS DE MES UNITÉS (3.5.141, Charles, 6 novembre 2026 : « pour les UE, la liste des dates de délibération
   (date et heure), S1 et S2 »). Lues de `GET /api/mes-cours/deliberations` : une ligne par unité, la 1re et la 2e session côte à
   côte, une ligne par organisation quand l'unité se délibère par organisation. `ue` limite à une unité. */
import { useEffect, useState } from 'react';
import { IconGavel } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { EnteteCarte, Tableau, TableauEntete, Th, Td, Tr } from './ui.jsx';

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const quand = s => {
  if (!s?.date) return <span className="text-slate-400">date à poser</span>;
  const [a, m, j] = s.date.split('-').map(Number);
  const d = new Date(a, m - 1, j);
  return <span className="tabular-nums">{JOURS[d.getDay()]} {String(j).padStart(2, '0')}/{String(m).padStart(2, '0')}/{a}{s.heure ? ` à ${String(s.heure).slice(0, 5)}` : ''}{s.close ? <span className="text-slate-400"> · close</span> : null}</span>;
};

export function useDatesDeliberation(annee = getAnnee()) {
  const [l, setL] = useState(null);
  useEffect(() => {
    fetch(`/api/mes-cours/deliberations?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { seances: [] })).then(j => setL(j.seances || [])).catch(() => setL([]));
  }, [annee]);
  return l;
}

/** Une ligne courte pour une unité : « S1 lun. 12/01/2027 à 14:00 · S2 … ». */
export function LigneDeliberation({ seances, ue }) {
  const l = (seances || []).filter(s => Number(s.ue_num) === Number(ue));
  if (!l.length) return null;
  const s1 = l.filter(s => s.session === 1), s2 = l.filter(s => s.session === 2);
  const org = s => (s.org ? ` (org. ${s.org})` : '');
  return (
    <span className="text-second text-slate-600 inline-flex flex-wrap gap-x-3 gap-y-0.5 items-center">
      <IconGavel size={14} className="text-slate-400" />
      {s1.map((s, i) => <span key={`a${i}`}>S1{org(s)} : {quand(s)}</span>)}
      {s2.length ? s2.map((s, i) => <span key={`b${i}`}>S2{org(s)} : {quand(s)}</span>) : <span>S2 : <span className="text-slate-400">date à poser</span></span>}
    </span>);
}

export default function DatesDeliberation({ annee = getAnnee() }) {
  const l = useDatesDeliberation(annee);
  if (!l || !l.length) return null;
  const ues = [...new Map(l.map(s => [s.ue_num, s.ue_nom])).entries()];
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte icone={IconGavel} titre="Les délibérations de mes unités" sous={`Date et heure de chaque séance, ${annee}`} />
      <Tableau className="!border-0 !rounded-none">
        <TableauEntete><Th>Unité</Th><Th>1re session</Th><Th>2e session</Th></TableauEntete>
        <tbody>{ues.map(([u, nom]) => {
          const s1 = l.filter(s => s.ue_num === u && s.session === 1), s2 = l.filter(s => s.ue_num === u && s.session === 2);
          const cel = arr => (arr.length ? arr.map((s, i) => <div key={i}>{s.org ? <span className="text-slate-500">org. {s.org} · </span> : null}{quand(s)}</div>) : <span className="text-slate-400">date à poser</span>);
          return (
            <Tr key={u} className="align-top">
              <Td><b>UE {u}</b>{nom ? <span className="text-slate-500"> — {nom}</span> : null}</Td>
              <Td>{cel(s1)}</Td>
              <Td>{cel(s2)}</Td>
            </Tr>);
        })}</tbody>
      </Tableau>
    </div>);
}

/* ÉVALUATIONS ET DÉLIBÉRATIONS (3.5.176, complété en 3.5.181, Charles : « date d'évaluation(s), délibérations, visite des copies,
   seconde session… toutes les données liées à l'évaluation »). Une carte par unité, une colonne par session ; dans chacune, dans
   l'ordre du temps : les épreuves (mes cours en gras), la visite des copies, le dernier délai d'encodage des points, la
   délibération, la publication. Lu de `GET /api/mes-cours/evaluations`. */
const jour = d => {
  if (!d) return null;
  const [a, m, j] = String(d).slice(0, 10).split('-').map(Number);
  return `${JOURS[new Date(a, m - 1, j).getDay()]} ${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
};
const hh = h => (h ? ` à ${String(h).slice(0, 5)}` : '');
function Ligne({ libelle, quand: q, detail, fort = false, vide = 'date à poser' }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-mention font-semibold uppercase tracking-wide text-slate-500 w-32 shrink-0 pt-0.5">{libelle}</span>
      <span className={`min-w-0 ${fort ? 'font-semibold text-iip-texte' : ''}`}>
        {q ? <span className="tabular-nums">{q}</span> : <span className="text-slate-400 font-normal">{vide}</span>}
        {detail ? <span className="text-slate-500 font-normal"> · {detail}</span> : null}
      </span>
    </div>);
}
export function EvaluationsDeliberations({ annee = getAnnee() }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch(`/api/mes-cours/evaluations?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { ues: [] })).then(j => setD(j.ues || [])).catch(() => setD([]));
  }, [annee]);
  if (!d) return <p className="text-slate-500">Chargement…</p>;
  if (!d.length) return <p className="text-slate-500">Aucune unité attribuée en {annee}.</p>;
  const session = (u, n) => {
    const eps = u.epreuves?.[n] || [];
    const seances = (u.seances || []).filter(s => s.session === n);
    const nomCours = c => u.cours.find(x => x.cours_code === c);
    const lignesEp = eps.length ? eps : [{ cours_code: null }];
    return (
      <div className="space-y-2">
        <div>
          {lignesEp.map((e, i) => {
            const c = e.cours_code ? nomCours(e.cours_code) : null;
            const qui = e.cours_code ? `${e.cours_code}${c?.cours_nom ? ` ${c.cours_nom}` : ''}` : 'toute l’unité';
            return (
              <div key={`e${i}`}>
                <Ligne libelle={eps.length ? 'Épreuve' : 'Épreuve'} fort={!!c?.mien}
                  quand={e.date ? `${jour(e.date)}${hh(e.heure)}` : null} detail={[eps.length ? qui : null, e.local, e.adresse].filter(Boolean).join(' · ') || null} />
                {(e.visite_date || eps.length > 0) && <Ligne libelle="Visite des copies" quand={e.visite_date ? `${jour(e.visite_date)}${hh(e.visite_heure)}` : null} detail={e.visite_local || null} />}
              </div>);
          })}
        </div>
        {(seances.length ? seances : [null]).map((s, i) => (
          <div key={`s${i}`} className={seances.length > 1 ? 'border-t border-slate-100 pt-1' : ''}>
            {s?.org ? <div className="text-second text-slate-500">Organisation {s.org}</div> : null}
            <Ligne libelle="Encodage des points" quand={s?.delai_encodage ? `jusqu’au ${jour(s.delai_encodage)}` : null} vide="suit la date de délibération" />
            <Ligne libelle="Délibération" fort quand={s?.date ? `${jour(s.date)}${hh(s.heure)}` : null} detail={s?.close ? 'close' : null} />
            {(s?.visite_date || s?.visite_mention) && <Ligne libelle="Visite des copies" quand={s.visite_date ? `${jour(s.visite_date)}${hh(s.visite_heure)}` : null} detail={[s.visite_local, s.visite_mention].filter(Boolean).join(' · ') || null} />}
            {s?.publie_le && <Ligne libelle="Publication" quand={jour(s.publie_le)} />}
            {n === 1 && s?.session2_date && <Ligne libelle="2e session prévue" quand={`${jour(s.session2_date)}${hh(s.session2_heure)}`} detail={[s.session2_local, s.session2_adresse].filter(Boolean).join(' · ') || null} />}
          </div>))}
      </div>);
  };
  return (
    <div className="space-y-3">
      {d.map(u => (
        <section key={u.ue_num} className="carte overflow-hidden">
          <EnteteCarte icone={IconGavel} titre={`UE ${u.ue_num}${u.ue_nom ? ` — ${u.ue_nom}` : ''}`}
            sous={u.cours.length ? u.cours.map(c => `${c.cours_code}${c.mien ? ' (le mien)' : ''}`).join(' · ') : null} />
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 text-sm">
            <div><div className="intertitre mb-1">1re session</div>{session(u, 1)}</div>
            <div><div className="intertitre mb-1">2e session</div>{session(u, 2)}</div>
          </div>
        </section>))}
    </div>);
}

/**
 * LES INDICATEURS D'UN COURS, POUR L'ENSEIGNANT (Charles, 8 octobre 2026 : « des
 * indicateurs pour les profs : le diagramme avec étendue, moyenne, médiane, écart
 * type… nombre de réussites, nombre d'échecs »).
 *
 * Calculés ICI, sur les notes de la feuille — celles qu'on vient de taper
 * comptent avant même d'être enregistrées : l'enseignant voit la forme de son
 * groupe pendant qu'il corrige. Une case vide n'est pas évaluée ; PP, NP et CM
 * n'ont pas de valeur chiffrée : elles se comptent à part, jamais comme zéro.
 *
 * Indicatifs : la note qui fait foi est celle de l'encodage officiel, et la
 * réussite d'une unité se décide acquis par acquis, sans compensation.
 */
import { useMemo, useState } from 'react';

const MENTIONS = ['PP', 'NP', 'CM'];
const v1 = n => (n == null || !Number.isFinite(n) ? '—' : (Math.round(n * 10) / 10).toString().replace('.', ','));
const pct = (k, n) => (n ? `${Math.round((k / n) * 100)} %` : '—');

function statistiques(valeurs) {
  const v = valeurs.filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { n: 0 };
  const q = p => { const i = (n - 1) * p; const b = Math.floor(i); return v[b] + (v[Math.min(b + 1, n - 1)] - v[b]) * (i - b); };
  const moyenne = v.reduce((a, b) => a + b, 0) / n;
  const ecart = Math.sqrt(v.reduce((a, b) => a + (b - moyenne) ** 2, 0) / n);
  const freq = new Map(); v.forEach(x => { const k = Math.round(x); freq.set(k, (freq.get(k) || 0) + 1); });
  const mode = [...freq].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  return { n, min: v[0], max: v[n - 1], q1: q(0.25), mediane: q(0.5), q3: q(0.75), moyenne, ecart, mode,
    reussites: v.filter(x => Math.round(x) >= 10).length, echecs: v.filter(x => Math.round(x) < 10).length,
    limite: v.filter(x => Math.round(x) >= 8 && Math.round(x) <= 9).length,
    histo: Array.from({ length: 21 }, (_, k) => v.filter(x => Math.round(x) === k).length) };
}

/** L'histogramme 0 → 20, la boîte (Q1–Q3, médiane), l'étendue et la moyenne. */
function Diagramme({ s }) {
  const L = 640, H = 170, g = 28, d = 10, bas = 120;
  const x = k => g + (k / 20) * (L - g - d);
  const largeur = (L - g - d) / 21 - 3;
  const maxH = Math.max(1, ...s.histo);
  const h = c => (c / maxH) * 90;
  return (
    <svg viewBox={`0 0 ${L} ${H}`} className="w-full max-w-[44rem]" role="img"
      aria-label={`Distribution : moyenne ${v1(s.moyenne)}, médiane ${v1(s.mediane)}, de ${v1(s.min)} à ${v1(s.max)}`}>
      {/* le seuil de réussite */}
      <line x1={x(9.5)} x2={x(9.5)} y1={20} y2={bas} style={{ stroke: 'var(--c-texte)' }} strokeDasharray="3 3" strokeWidth="1" opacity="0.5" />
      <text x={x(9.5) + 4} y={28} fontSize="10" style={{ fill: 'var(--c-texte)' }} opacity="0.7">seuil 10</text>
      {s.histo.map((c, k) => c > 0 && (
        <g key={k}>
          <rect x={x(k) - largeur / 2} y={bas - h(c)} width={largeur} height={h(c)} rx="2"
            style={{ fill: k >= 10 ? 'var(--c-reussi)' : 'var(--c-refuse)' }} opacity="0.85" />
          <text x={x(k)} y={bas - h(c) - 3} fontSize="9" textAnchor="middle" style={{ fill: 'var(--c-texte)' }}>{c}</text>
        </g>))}
      <line x1={g} x2={L - d} y1={bas} y2={bas} style={{ stroke: '#CBD5E1' }} />
      {[0, 5, 10, 15, 20].map(k => <text key={k} x={x(k)} y={bas + 12} fontSize="10" textAnchor="middle" style={{ fill: '#64748B' }}>{k}</text>)}
      {/* l'étendue et la boîte */}
      <line x1={x(s.min)} x2={x(s.max)} y1={bas + 30} y2={bas + 30} style={{ stroke: 'var(--c-principal, #16406A)' }} strokeWidth="1.5" />
      {[s.min, s.max].map((m, i) => <line key={i} x1={x(m)} x2={x(m)} y1={bas + 24} y2={bas + 36} style={{ stroke: 'var(--c-principal, #16406A)' }} strokeWidth="1.5" />)}
      <rect x={x(s.q1)} y={bas + 22} width={Math.max(2, x(s.q3) - x(s.q1))} height="16" rx="2"
        style={{ fill: 'var(--c-disponible)', stroke: 'var(--c-principal, #16406A)' }} fillOpacity="0.25" />
      <line x1={x(s.mediane)} x2={x(s.mediane)} y1={bas + 20} y2={bas + 40} style={{ stroke: 'var(--c-principal, #16406A)' }} strokeWidth="2.5" />
      <circle cx={x(s.moyenne)} cy={bas + 30} r="4" style={{ fill: 'var(--c-surveiller, #B45309)' }} />
    </svg>
  );
}

export default function IndicateursNotes({ etudiants, cols, nomCol, valeurDe, noteCours, groupesDispo = [], groupesDe = () => [], tous = etudiants }) {
  const choix = [...(cols.length > 1 ? [['__cours', 'Note du cours (moyenne pondérée des acquis)']] : []), ...cols.map((k, i) => [k, nomCol(k, i)])];
  const [col, setCol] = useState(choix[0]?.[0]);
  const lire = (e, k) => {
    if (k === '__cours') { const c = noteCours(e.id); return { note: c.note ?? null, mention: c.note == null && c.mentions ? 'mention' : null }; }
    const t = String(valeurDe(e.id, k) ?? '').trim().toUpperCase();
    if (!t) return { note: null, mention: null };
    if (MENTIONS.includes(t)) return { note: null, mention: t };
    const n = Number(t.replace(',', '.'));
    return { note: Number.isFinite(n) ? n : null, mention: null };
  };
  const calc = liste => {
    const lus = liste.map(e => lire(e, col));
    const s = statistiques(lus.map(x => x.note).filter(x => x != null));
    const mentions = Object.fromEntries(MENTIONS.map(m => [m, lus.filter(x => x.mention === m).length]));
    return { ...s, total: liste.length, manquantes: lus.filter(x => x.note == null && !x.mention).length, mentions };
  };
  const s = useMemo(() => calc(etudiants), [etudiants, col, valeurDe]);   // eslint-disable-line react-hooks/exhaustive-deps
  const parGroupe = useMemo(() => groupesDispo.map(g => [g, calc(tous.filter(e => groupesDe(e).includes(g)))]), [groupesDispo, tous, col, valeurDe]);   // eslint-disable-line react-hooks/exhaustive-deps

  const Tuile = ({ valeur, libelle, precision, etat = 'neutre' }) => (
    <div className="bloc-etat px-3 py-2 min-w-[7.5rem]" data-etat={etat}>
      <div className="text-[17px] font-bold tabular-nums">{valeur}</div>
      <div className="text-[11px] text-slate-600">{libelle}</div>
      {precision && <div className="text-[11px] text-slate-400">{precision}</div>}
    </div>);

  return (
    <div className="carte p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[15px] font-medium text-iip-blue">Indicateurs du cours</div>
        <select value={col} onChange={e => setCol(e.target.value)} className="controle ml-auto">
          {choix.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {!s.n ? <p className="text-[13px] text-slate-500">Aucune note chiffrée pour l’instant{s.total ? ` (${s.total} étudiant(s))` : ''}.</p> : (<>
        <div className="flex flex-wrap gap-2">
          <Tuile valeur={`${s.n} / ${s.total}`} libelle="notes chiffrées" precision={s.manquantes ? `${s.manquantes} à encoder` : 'complet'} etat={s.manquantes ? 'surveiller' : 'reussi'} />
          <Tuile valeur={v1(s.moyenne)} libelle="moyenne" precision={`écart type ${v1(s.ecart)}`} />
          <Tuile valeur={v1(s.mediane)} libelle="médiane" precision={`Q1 ${v1(s.q1)} · Q3 ${v1(s.q3)}`} />
          <Tuile valeur={`${v1(s.min)} → ${v1(s.max)}`} libelle="étendue" precision={`mode ${s.mode ?? '—'}`} />
          <Tuile valeur={s.reussites} libelle="réussites (≥ 10)" precision={pct(s.reussites, s.n)} etat="reussi" />
          <Tuile valeur={s.echecs} libelle="échecs (< 10)" precision={pct(s.echecs, s.n)} etat={s.echecs ? 'corriger' : 'neutre'} />
          <Tuile valeur={s.limite} libelle="à 8 ou 9" precision="juste sous le seuil" etat={s.limite ? 'surveiller' : 'neutre'} />
          {MENTIONS.some(m => s.mentions[m]) && <Tuile valeur={MENTIONS.map(m => s.mentions[m]).reduce((a, b) => a + b, 0)} libelle="mentions"
            precision={MENTIONS.filter(m => s.mentions[m]).map(m => `${m} ${s.mentions[m]}`).join(' · ')} />}
        </div>
        <Diagramme s={s} />
        <p className="text-[11px] text-slate-500 -mt-2">Barres : nombre d’étudiants par note (vert à partir de 10). Dessous : l’étendue (du plus bas au plus haut),
          la boîte du quart au trois-quarts des notes, la <b>médiane</b> en trait épais, la <b>moyenne</b> en point ocre.
          Indicatif : la réussite de l’unité se décide acquis par acquis, sans compensation.</p>
        {parGroupe.length > 1 && (
          <table className="text-[13px] tabular-nums">
            <thead className="tab-entete"><tr>{['Groupe', 'Notes', 'Moyenne', 'Médiane', 'Écart type', 'Réussites', 'Échecs'].map((t, i) =>
              <th key={t} className={`px-2 py-1.5 ${i ? 'text-right' : 'text-left'}`}>{t}</th>)}</tr></thead>
            <tbody>{parGroupe.map(([g, x]) => (
              <tr key={g} className="border-b border-slate-100"><td className="px-2 py-1">{g}</td>
                <td className="px-2 text-right">{x.n} / {x.total}</td><td className="px-2 text-right">{v1(x.moyenne)}</td>
                <td className="px-2 text-right">{v1(x.mediane)}</td><td className="px-2 text-right">{v1(x.ecart)}</td>
                <td className="px-2 text-right">{x.n ? `${x.reussites} (${pct(x.reussites, x.n)})` : '—'}</td>
                <td className="px-2 text-right">{x.n ? x.echecs : '—'}</td></tr>))}</tbody>
          </table>)}
      </>)}
    </div>
  );
}

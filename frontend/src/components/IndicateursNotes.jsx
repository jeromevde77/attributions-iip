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
import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';

const MENTIONS = ['PP', 'NP', 'CM'];
const SENS_MENTION = { PP: 'pas présenté', NP: 'note de présence', CM: 'certificat médical' };
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
      <line x1={g} x2={L - d} y1={bas} y2={bas} style={{ stroke: 'var(--g-grille)' }} />
      {[0, 5, 10, 15, 20].map(k => <text key={k} x={x(k)} y={bas + 12} fontSize="10" textAnchor="middle" style={{ fill: '#64748B' }}>{k}</text>)}
      {/* l'étendue et la boîte */}
      <line x1={x(s.min)} x2={x(s.max)} y1={bas + 30} y2={bas + 30} style={{ stroke: 'var(--c-principal, #16406A)' }} strokeWidth="1.5" />
      {[s.min, s.max].map((m, i) => <line key={i} x1={x(m)} x2={x(m)} y1={bas + 24} y2={bas + 36} style={{ stroke: 'var(--c-principal, #16406A)' }} strokeWidth="1.5" />)}
      <rect x={x(s.q1)} y={bas + 22} width={Math.max(2, x(s.q3) - x(s.q1))} height="16" rx="2"
        style={{ fill: 'var(--c-disponible)', stroke: 'var(--c-principal, #16406A)' }} fillOpacity="0.25" />
      <line x1={x(s.mediane)} x2={x(s.mediane)} y1={bas + 20} y2={bas + 40} style={{ stroke: 'var(--c-principal, #16406A)' }} strokeWidth="2.5" />
      <circle cx={x(s.moyenne)} cy={bas + 30} r="4" style={{ fill: 'var(--c-attente, #B45309)' }} />
    </svg>
  );
}

export default function IndicateursNotes({ etudiants, cols, nomCol, valeurDe, noteCours, groupesDispo = [], groupesDe = () => [], tous = etudiants,
                                          coursCode = null, annee = null, ueNum = null }) {
  const choix = [...(cols.length > 1 ? [['__cours', 'Note du cours (moyenne pondérée des acquis)']] : []), ...cols.map((k, i) => [k, nomCol(k, i)]),
    ...(coursCode ? [['__ue', `Note de l’unité${ueNum ? ` (UE ${ueNum})` : ''} — tous les inscrits`]] : [])];
  const [col, setCol] = useState(choix[0]?.[0]);
  /* L'UNITÉ (8 octobre 2026) : la note d'unité calculée par la délibération, sur
     l'encodage officiel, pour tous les inscrits — anonyme ; et chaque cours. */
  const [ue, setUe] = useState(null);
  useEffect(() => {
    if (col !== '__ue' || !coursCode) return;
    setUe(null);
    fetch(`/api/mes-cours/${encodeURIComponent(coursCode)}/stats-ue?annee=${encodeURIComponent(annee || '')}`, { headers: authHeaders() })
      .then(r => r.json()).then(j => setUe(j.error ? { erreur: j.error } : j)).catch(e => setUe({ erreur: e.message }));
  }, [col, coursCode, annee]);
  const lire = (e, k) => {
    if (k === '__cours') {
      const c = noteCours(e.id);
      // La mention d'un étudiant pour le cours : la première portée sur l'un de ses acquis.
      const m = cols.map(a => String(valeurDe(e.id, a) ?? '').trim().toUpperCase()).find(t => MENTIONS.includes(t)) || null;
      return { note: c.note ?? null, mention: c.note == null ? m : null, mentionAA: m };
    }
    const t = String(valeurDe(e.id, k) ?? '').trim().toUpperCase();
    if (!t) return { note: null, mention: null };
    if (MENTIONS.includes(t)) return { note: null, mention: t };
    const n = Number(t.replace(',', '.'));
    return { note: Number.isFinite(n) ? n : null, mention: null };
  };
  const calc = liste => {
    const lus = liste.map(e => lire(e, col));
    const s = statistiques(lus.map(x => x.note).filter(x => x != null));
    // LES MENTIONS COMPTÉES UNE À UNE (Charles, 8 octobre 2026 : « le nombre de PP,
    // NP, CM ») — sur la note du cours, l'étudiant qui en porte une sur un acquis.
    const mentions = Object.fromEntries(MENTIONS.map(m => [m, lus.filter(x => (x.mentionAA ?? x.mention) === m).length]));
    return { ...s, total: liste.length, manquantes: lus.filter(x => x.note == null && !x.mention).length, mentions };
  };
  const s = useMemo(() => {
    if (col !== '__ue') return calc(etudiants);
    if (!ue || ue.erreur) return { n: 0, total: ue?.inscrits || 0, manquantes: 0, mentions: {} };
    return { ...statistiques(ue.notes), total: ue.inscrits, manquantes: ue.sans_note, mentions: ue.mentions || {}, ajournes: ue.ajournes };
  }, [etudiants, col, valeurDe, ue]);   // eslint-disable-line react-hooks/exhaustive-deps
  const parGroupe = useMemo(() => (col === '__ue' ? [] : groupesDispo).map(g => [g, calc(tous.filter(e => groupesDe(e).includes(g)))]), [groupesDispo, tous, col, valeurDe]);   // eslint-disable-line react-hooks/exhaustive-deps

  const Tuile = ({ valeur, libelle, precision, etat = 'neutre' }) => (
    <div className="bloc-etat px-3 py-2 min-w-[7.5rem]" data-etat={etat}>
      <div className="text-lg font-bold tabular-nums">{valeur}</div>
      <div className="text-xs text-slate-600">{libelle}</div>
      {precision && <div className="text-xs text-slate-400">{precision}</div>}
    </div>);

  return (
    <div className="carte p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-base font-medium text-iip-blue">Indicateurs du cours</div>
        <select value={col} onChange={e => setCol(e.target.value)} className="controle ml-auto">
          {choix.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {col === '__ue' && !ue && <p className="text-sm text-slate-500">Calcul des notes d’unité…</p>}
      {col === '__ue' && ue?.erreur && <p className="text-sm text-slate-500">{ue.erreur}</p>}
      {col === '__ue' && ue && !ue.erreur && <p className="text-second text-slate-500 -mt-2">Notes d’unité calculées comme en délibération, sur l’encodage officiel
        ({ue.session === 2 ? 'seconde' : 'première'} session), pour les {ue.inscrits} inscrits — sans les noms : les autres cours ne se lisent pas étudiant par étudiant.</p>}
      {(col !== '__ue' || (ue && !ue.erreur)) && (!s.n ? (<>
        <p className="text-sm text-slate-500">Aucune note chiffrée pour l’instant{s.total ? ` (${s.total} étudiant(s))` : ''}.</p>
        {MENTIONS.some(m => s.mentions?.[m]) && (
          <div className="flex flex-wrap gap-2">
            {MENTIONS.map(m => <Tuile key={m} valeur={s.mentions?.[m] || 0} libelle={m} precision={SENS_MENTION[m]} etat={s.mentions?.[m] ? 'surveiller' : 'neutre'} />)}
          </div>)}
      </>) : (<>
        <div className="flex flex-wrap gap-2">
          <Tuile valeur={`${s.n} / ${s.total}`} libelle="notes chiffrées" precision={s.manquantes ? `${s.manquantes} à encoder` : 'complet'} etat={s.manquantes ? 'surveiller' : 'reussi'} />
          <Tuile valeur={v1(s.moyenne)} libelle="moyenne" precision={`écart type ${v1(s.ecart)}`} />
          <Tuile valeur={v1(s.mediane)} libelle="médiane" precision={`Q1 ${v1(s.q1)} · Q3 ${v1(s.q3)}`} />
          <Tuile valeur={`${v1(s.min)} → ${v1(s.max)}`} libelle="étendue" precision={`mode ${s.mode ?? '—'}`} />
          <Tuile valeur={s.reussites} libelle="réussites (≥ 10)" precision={pct(s.reussites, s.n)} etat="reussi" />
          <Tuile valeur={s.echecs} libelle="échecs (< 10)" precision={pct(s.echecs, s.n)} etat={s.echecs ? 'corriger' : 'neutre'} />
          <Tuile valeur={s.limite} libelle="à 8 ou 9" precision="juste sous le seuil" etat={s.limite ? 'surveiller' : 'neutre'} />
          {col === '__ue' && <Tuile valeur={s.ajournes ?? 0} libelle="acquis en défaut" precision="ajournés malgré la moyenne, ou en échec" etat={s.ajournes ? 'surveiller' : 'neutre'} />}
          {MENTIONS.map(m => (
            <Tuile key={m} valeur={s.mentions?.[m] || 0} libelle={m} precision={SENS_MENTION[m]}
              etat={s.mentions?.[m] ? 'surveiller' : 'neutre'} />))}
        </div>
        <Diagramme s={s} />
        <p className="text-xs text-slate-500 -mt-2">Barres : nombre d’étudiants par note (vert à partir de 10). Dessous : l’étendue (du plus bas au plus haut),
          la boîte du quart au trois-quarts des notes, la <b>médiane</b> en trait épais, la <b>moyenne</b> en point ocre.
          Indicatif : la réussite de l’unité se décide acquis par acquis, sans compensation.</p>
        {col === '__ue' && ue?.cours?.length > 0 && (
          <table className="text-sm tabular-nums">
            <thead className="tab-entete"><tr>{['Cours de l’unité', 'Notes', 'Moyenne', 'Réussites', ...MENTIONS].map((t, i) =>
              <th key={t} className={`px-2 py-1.5 ${i ? 'text-right' : 'text-left'}`}>{t}</th>)}</tr></thead>
            <tbody>{ue.cours.map(c => (
              <tr key={c.cours_code} className={`border-b border-slate-100 ${c.ce_cours ? 'font-semibold' : ''}`}>
                <td className="px-2 py-1">{c.cours_code} — {c.cours_nom}{c.ce_cours ? ' (ce cours)' : ''}</td>
                <td className="px-2 text-right">{c.n}</td><td className="px-2 text-right">{v1(c.moyenne)}</td>
                <td className="px-2 text-right">{c.reussites} ({pct(c.reussites, c.n)})</td>
                {MENTIONS.map(m => <td key={m} className="px-2 text-right">{c.mentions?.[m] || ''}</td>)}</tr>))}</tbody>
          </table>)}
        {parGroupe.length > 1 && (
          <table className="text-sm tabular-nums">
            <thead className="tab-entete"><tr>{['Groupe', 'Notes', 'Moyenne', 'Médiane', 'Écart type', 'Réussites', 'Échecs', ...MENTIONS].map((t, i) =>
              <th key={t} className={`px-2 py-1.5 ${i ? 'text-right' : 'text-left'}`}>{t}</th>)}</tr></thead>
            <tbody>{parGroupe.map(([g, x]) => (
              <tr key={g} className="border-b border-slate-100"><td className="px-2 py-1">{g}</td>
                <td className="px-2 text-right">{x.n} / {x.total}</td><td className="px-2 text-right">{v1(x.moyenne)}</td>
                <td className="px-2 text-right">{v1(x.mediane)}</td><td className="px-2 text-right">{v1(x.ecart)}</td>
                <td className="px-2 text-right">{x.n ? `${x.reussites} (${pct(x.reussites, x.n)})` : '—'}</td>
                <td className="px-2 text-right">{x.n ? x.echecs : '—'}</td>
                {MENTIONS.map(m => <td key={m} className="px-2 text-right">{x.mentions?.[m] || ''}</td>)}</tr>))}</tbody>
          </table>)}
      </>))}
    </div>
  );
}

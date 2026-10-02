import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { couleurBloc, rangBloc } from '../lib/blocs.js';

/**
 * LE PARCOURS EN PETITES TUILES, AVEC SES FLÈCHES (Charles, 2 octobre 2026 :
 * « sans flèches on va être perdu — sois plus malin »). Maquette v3 validée.
 *
 * Tout le parcours tient dans la colonne de la revue : une tuile par UE, son
 * seul numéro, une colonne par bloc (l'épreuve intégrée à part). Toutes les
 * flèches de prérequis sont là, en deux intensités : PLEINES ET BLEUES quand
 * elles touchent le PAE de l'année (ce qui ouvre une UE du programme, ce
 * qu'elle ouvre ensuite), FINES ET GRISES pour le reste. Au survol, la chaîne
 * de l'unité visée se met en relief et une étiquette la nomme.
 *
 * Les données sont celles du schéma de la fiche (GET /capitalisation) : un
 * même calcul, deux dessins.
 */
const L = 46, H = 24, PAS_Y = 34, PAS_X = 104, MARGE = 12, HAUT = 30;

export default function ParcoursCompact({ etudId, annee, programme = new Set(), dispenses = new Set(),
                                          onNoeud = null, version = 0 }) {
  const [data, setData] = useState(null);
  const [survol, setSurvol] = useState(null);
  useEffect(() => {
    let vivant = true;
    setData(null);
    fetch(`/api/etudiants/${etudId}/capitalisation?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(j => { if (vivant) setData(j); }).catch(() => {});
    return () => { vivant = false; };
  }, [etudId, annee, version]);

  const plan = useMemo(() => {
    const nodes = data?.nodes || [];
    if (!nodes.length) return null;
    // Une colonne par bloc, l'épreuve intégrée en dernier.
    const blocs = [...new Set(nodes.filter(n => !n.epreuve_integree).map(n => String(n.ue_niv || '—').toUpperCase()))]
      .sort((a, b) => rangBloc(a) - rangBloc(b));
    const cols = [...blocs.map(b => ({ cle: b, label: b })), ...(nodes.some(n => n.epreuve_integree) ? [{ cle: 'EI', label: 'Épreuve' }] : [])];
    const pos = {};
    let hMax = 0;
    cols.forEach((c, i) => {
      const dans = nodes.filter(n => (n.epreuve_integree ? 'EI' : String(n.ue_niv || '—').toUpperCase()) === c.cle)
        .sort((a, b) => (a.couche - b.couche) || (a.ordre - b.ordre) || (a.ue_num - b.ue_num));
      dans.forEach((n, k) => { pos[n.ue_num] = { x: MARGE + i * PAS_X, y: HAUT + k * PAS_Y, n }; });
      hMax = Math.max(hMax, HAUT + dans.length * PAS_Y);
    });
    const edges = (data.edges || []).filter(e => pos[e.from] && pos[e.to]);
    return { cols, pos, edges, largeur: MARGE * 2 + (cols.length - 1) * PAS_X + L, hauteur: hMax + 6 };
  }, [data]);

  if (!data) return <p className="text-[12px] text-slate-400">Chargement du parcours…</p>;
  if (!plan) return <p className="text-[12px] text-slate-500">Aucun schéma pour ce cursus.</p>;

  // LA CHAÎNE DE L'UNITÉ SURVOLÉE : ses prérequis (en remontant) et ce qu'elle ouvre.
  const amont = new Set(), aval = new Set();
  if (survol != null) {
    const pile = [survol];
    while (pile.length) { const u = pile.pop(); for (const e of plan.edges) if (e.to === u && !amont.has(e.from)) { amont.add(e.from); pile.push(e.from); } }
    for (const e of plan.edges) if (e.from === survol) aval.add(e.to);
  }
  const dansChaine = u => survol != null && (u === survol || amont.has(u) || aval.has(u));
  const auPAE = u => programme.has(u);

  const etatTuile = n => {
    if (n.epreuve_integree && !['acquise'].includes(n.statut)) return { fond: '#fff', bord: '#C9A227', texte: '#8a6d16' };
    if (n.statut === 'acquise') return n.reussite?.faveur
      ? { fond: 'var(--c-faveur, #6B46C1)', bord: 'var(--c-faveur, #6B46C1)', texte: '#fff' }
      : { fond: 'var(--c-reussi, #3E7D5E)', bord: 'var(--c-reussi, #3E7D5E)', texte: '#fff' };
    if (auPAE(n.ue_num)) return { fond: '#fff', bord: 'var(--c-disponible, #2F6FB0)', texte: 'var(--c-disponible, #2F6FB0)' };
    if (n.statut === 'en_attente') return { fond: '#fff', bord: 'var(--c-refuse, #9D4A38)', texte: 'var(--c-refuse, #9D4A38)' };
    if (n.statut === 'accessible' || n.statut === 'sous_reserve') return { fond: '#fff', bord: '#94A3B8', texte: '#475569' };
    return { fond: '#fff', bord: '#CBD5E1', texte: '#94A3B8' };
  };

  const fleche = e => {
    const a = plan.pos[e.from], b = plan.pos[e.to];
    const fort = auPAE(e.from) || auPAE(e.to);
    const relief = survol != null && dansChaine(e.from) && dansChaine(e.to);
    const memeCol = a.x === b.x;
    const x1 = a.x + L, y1 = a.y + H / 2, y2 = b.y + H / 2;
    const x2 = memeCol ? b.x + L + 2 : b.x - 3;
    const d = memeCol
      ? `M${x1},${y1} C${x1 + 18},${y1} ${x2 + 18},${y2} ${x2},${y2}`
      : `M${x1},${y1} C${x1 + 26},${y1} ${x2 - 26},${y2} ${x2},${y2}`;
    const couleur = relief ? '#16406A' : fort ? '#2F6FB0' : '#CBD5E1';
    return <path key={`${e.from}-${e.to}`} d={d} fill="none" stroke={couleur}
      strokeWidth={relief ? 2 : fort ? 1.5 : 1} strokeDasharray={e.type === 'interne' ? '4 3' : undefined}
      opacity={survol != null && !relief ? 0.35 : 1}
      markerEnd={`url(#pc-${relief ? 'r' : fort ? 'f' : 'g'})`} />;
  };

  const nSurvol = survol != null ? plan.pos[survol]?.n : null;
  const etiquette = nSurvol ? [
    `${nSurvol.ue_num} ${nSurvol.ue_nom || ''}`.trim(),
    nSurvol.reussite?.va ? "VA" : nSurvol.reussite?.note != null ? `${Math.round(nSurvol.reussite.note)}/20` : null,
    amont.size ? `ouverte par ${[...plan.edges.filter(e => e.to === survol).map(e => e.from)].join(', ')}` : 'sans prérequis',
    aval.size ? `ouvre ${[...aval].join(', ')}` : null,
  ].filter(Boolean).join(' · ') : null;

  return (
    <div>
      <svg viewBox={`0 0 ${plan.largeur} ${plan.hauteur}`} width="100%" role="img" aria-label="Schéma du parcours"
        style={{ maxHeight: '70vh' }}>
        <defs>
          {[['f', '#2F6FB0'], ['g', '#CBD5E1'], ['r', '#16406A']].map(([k, c]) => (
            <marker key={k} id={`pc-${k}`} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill={c} />
            </marker>
          ))}
        </defs>
        {plan.cols.map((c, i) => (
          <g key={c.cle}>
            <text x={MARGE + i * PAS_X + L / 2} y={11} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#64748b" letterSpacing=".5">{c.label.toUpperCase()}</text>
            <rect x={MARGE + i * PAS_X - 4} y={16} width={L + 8} height={3} rx={1.5}
              style={{ fill: c.cle === 'EI' ? '#C9A227' : (couleurBloc(c.cle) || '#CBD5E1') }} />
          </g>
        ))}
        {plan.edges.filter(e => !(auPAE(e.from) || auPAE(e.to))).map(fleche)}
        {plan.edges.filter(e => auPAE(e.from) || auPAE(e.to)).map(fleche)}
        {Object.values(plan.pos).map(({ x, y, n }) => {
          const t = etatTuile(n);
          const relief = dansChaine(n.ue_num);
          return (
            <g key={n.ue_num} onMouseEnter={() => setSurvol(n.ue_num)} onMouseLeave={() => setSurvol(null)}
              onClick={onNoeud ? () => onNoeud(n.ue_num) : undefined} style={{ cursor: onNoeud ? 'pointer' : 'default' }}
              opacity={survol != null && !relief ? 0.45 : 1}>
              <title>{`${n.ue_num} ${n.ue_nom || ''}`}</title>
              <rect x={x} y={y} width={L} height={H} rx={5}
                style={{ fill: t.fond, stroke: relief && n.ue_num === survol ? '#16406A' : t.bord }}
                strokeWidth={n.ue_num === survol ? 2.2 : 1.6} />
              <text x={x + L / 2} y={y + 16} textAnchor="middle" fontSize="11.5" fontWeight="700" style={{ fill: t.texte }}>{n.ue_num}</text>
              {dispenses.has(n.ue_num) && <circle cx={x + L - 5} cy={y + 5} r={2.6} fill="#475569" />}
            </g>
          );
        })}
      </svg>
      <div className="min-h-[20px] mt-1 text-[11.5px] text-iip-texte">{etiquette || <span className="text-slate-400">Survolez une unité pour voir sa chaîne de prérequis.</span>}</div>
      <div className="text-[10.5px] text-slate-500 leading-[1.9] mt-1">
        <Leg fond="var(--c-reussi, #3E7D5E)" bord="var(--c-reussi, #3E7D5E)" /> réussie ·
        <Leg bord="var(--c-disponible, #2F6FB0)" /> au PAE ·
        <Leg bord="var(--c-disponible, #2F6FB0)" point /> avec report ou VA ·
        <Leg bord="#94A3B8" /> accessible ·
        <Leg bord="#CBD5E1" /> pas encore ·
        <Leg bord="var(--c-refuse, #9D4A38)" /> ajournée ·
        <Leg bord="#C9A227" /> épreuve<br />
        Flèche bleue pleine : elle touche le PAE de l'année · grise : le reste du parcours · pointillés : prérequis recommandé.
      </div>
    </div>
  );
}

function Leg({ fond = '#fff', bord, point = false }) {
  return (
    <span className="relative inline-block align-[-2px] mx-1" style={{ width: 20, height: 12, borderRadius: 3, background: fond, border: `1.5px solid ${bord}` }}>
      {point && <span className="absolute right-[2px] top-[2px] w-[4px] h-[4px] rounded-full bg-slate-600" />}
    </span>
  );
}

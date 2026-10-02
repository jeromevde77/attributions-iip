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
// Petites, et à LEUR taille (2 octobre 2026 : « icônes trop grandes, on ne voit
// pas d'un coup ») : le dessin ne s'étire plus à la largeur de la colonne.
const L = 44, H = 23, PAS_Y = 29, PAS_X = 96, PAS_SOUS = 76, MARGE = 8, HAUT = 28;

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
    const cleDe = n => (n.epreuve_integree ? 'EI' : String(n.ue_niv || '—').toUpperCase());
    const tousEdges = data.edges || [];
    // DEUX COLONNES QUAND UNE UE DÉPEND D'UNE AUTRE DU MÊME BLOC (Charles,
    // 2 octobre 2026 : « sinon pas lisible ») — la flèche ne remonte plus dans
    // sa propre colonne, elle avance d'une sous-colonne.
    let x = MARGE;
    cols.forEach(c => {
      const dans = nodes.filter(n => cleDe(n) === c.cle)
        .sort((a, b) => (a.couche - b.couche) || (a.ordre - b.ordre) || (a.ue_num - b.ue_num));
      const ici = new Set(dans.map(n => n.ue_num));
      const prof = {};
      const profondeur = (u, vus = new Set()) => {
        if (prof[u] != null) return prof[u];
        if (vus.has(u)) return 0;
        vus.add(u);
        const amont = tousEdges.filter(e => e.to === u && ici.has(e.from) && e.from !== u);
        prof[u] = amont.length ? 1 + Math.max(...amont.map(e => profondeur(e.from, vus))) : 0;
        return prof[u];
      };
      dans.forEach(n => profondeur(n.ue_num));
      const nSous = Math.max(1, ...dans.map(n => prof[n.ue_num] + 1));
      const rang = new Array(nSous).fill(0);
      dans.forEach(n => {
        const k = prof[n.ue_num];
        pos[n.ue_num] = { x: x + k * PAS_SOUS, y: HAUT + rang[k] * PAS_Y, n };
        rang[k] += 1;
      });
      c.x = x; c.w = (nSous - 1) * PAS_SOUS + L;
      hMax = Math.max(hMax, HAUT + Math.max(...rang) * PAS_Y);
      x += c.w + (PAS_X - L);
    });
    const edges = tousEdges.filter(e => pos[e.from] && pos[e.to]);
    return { cols, pos, edges, largeur: x - (PAS_X - L) + MARGE, hauteur: hMax + 6 };
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

  /* LE MODÈLE DE LA TUILE (Charles, 2 octobre 2026) : un liseré gauche qui
     porte l'état, coins droits de ce côté et arrondis de l'autre. Réussie,
     faveur et UE de l'année sont PLEINES, liseré plus foncé, texte blanc ; le
     reste est blanc (gris pâle pour ce qui n'est pas atteint) sous un filet fin. */
  const fonce = c => `color-mix(in srgb, ${c} 62%, #000)`;
  const plein = c => ({ fond: c, bord: c, lisere: fonce(c), texte: '#fff' });
  const etatTuile = n => {
    if (n.epreuve_integree && !['acquise'].includes(n.statut)) return { fond: '#fff', bord: '#D8DCE4', lisere: '#C9A227', texte: '#16406A' };
    if (n.statut === 'acquise') return plein(n.reussite?.faveur ? 'var(--c-faveur, #6B46C1)' : 'var(--c-reussi, #3E7D5E)');
    if (auPAE(n.ue_num)) return plein('var(--c-disponible, #2F6FB0)');
    if (n.statut === 'en_attente') return { fond: '#fff', bord: '#D8DCE4', lisere: 'var(--c-refuse, #9D4A38)', texte: '#16406A' };
    if (n.statut === 'accessible' || n.statut === 'sous_reserve') return { fond: '#fff', bord: '#D8DCE4', lisere: '#94A3B8', texte: '#475569' };
    return { fond: '#F4F5F7', bord: '#D8DCE4', lisere: '#C3C9D3', texte: '#8C95A5' };
  };
  const R = 5, LIS = 4;
  const forme = (x, y) => `M${x},${y} h${L - R} a${R},${R} 0 0 1 ${R},${R} v${H - 2 * R} a${R},${R} 0 0 1 -${R},${R} h-${L - R} z`;

  const fleche = e => {
    const a = plan.pos[e.from], b = plan.pos[e.to];
    const fort = auPAE(e.from) || auPAE(e.to);
    const relief = survol != null && dansChaine(e.from) && dansChaine(e.to);
    const memeCol = a.x === b.x;
    const x1 = a.x + L, y1 = a.y + H / 2, y2 = b.y + H / 2;
    const x2 = memeCol ? b.x + L + 2 : b.x - 3;
    const d = memeCol
      ? `M${x1},${y1} C${x1 + 12},${y1} ${x2 + 12},${y2} ${x2},${y2}`
      : `M${x1},${y1} C${x1 + 18},${y1} ${x2 - 18},${y2} ${x2},${y2}`;
    const couleur = relief ? '#16406A' : fort ? '#2F6FB0' : '#CBD5E1';
    return <path key={`${e.from}-${e.to}`} d={d} fill="none" stroke={couleur}
      strokeWidth={relief ? 1.6 : fort ? 1.1 : 0.7} strokeDasharray={e.type === 'interne' ? '4 3' : undefined}
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
      <svg viewBox={`0 0 ${plan.largeur} ${plan.hauteur}`} width={plan.largeur} height={plan.hauteur}
        role="img" aria-label="Schéma du parcours" style={{ maxWidth: '100%', height: 'auto' }}>
        <defs>
          {[['f', '#2F6FB0'], ['g', '#CBD5E1'], ['r', '#16406A']].map(([k, c]) => (
            <marker key={k} id={`pc-${k}`} markerWidth="5" markerHeight="5" refX="4.5" refY="2.25" orient="auto">
              <path d="M0,0 L0,4.5 L4.5,2.25 z" fill={c} />
            </marker>
          ))}
        </defs>
        {plan.cols.map((c, i) => (
          <g key={c.cle}>
            <text x={c.x + c.w / 2} y={11} textAnchor="middle" fontSize="10" fontWeight="700" fill="#64748b" letterSpacing=".4">{c.label.toUpperCase()}</text>
            <rect x={c.x - 3} y={16} width={c.w + 6} height={3} rx={1.2}
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
              <path d={forme(x, y)}
                style={{ fill: t.fond, stroke: n.ue_num === survol ? '#16406A' : t.bord }}
                strokeWidth={n.ue_num === survol ? 1.8 : 1} />
              <rect x={x} y={y} width={LIS} height={H} style={{ fill: t.lisere }} />
              <text x={x + (L + LIS) / 2} y={y + 15.5} textAnchor="middle" fontSize="12" fontWeight="700" style={{ fill: t.texte }}>{n.ue_num}</text>
              {/* Repères : refusée une fois (rouge, haut gauche), déterminante
                  (marine, haut droit), report ou VA (gris, bas droit). */}
              {n.refusee && <circle cx={x} cy={y} r={3.6} fill="#C0392B" stroke="#fff" strokeWidth={1} />}
              {n.determinante && <circle cx={x + L} cy={y} r={3.6} fill="#16406A" stroke="#fff" strokeWidth={1} />}
              {dispenses.has(n.ue_num) && <circle cx={x + L - 5} cy={y + H - 5} r={2.5} fill={auPAE(n.ue_num) ? '#fff' : '#475569'} />}
            </g>
          );
        })}
      </svg>
      <div className="min-h-[20px] mt-1 text-[12px] text-iip-texte">{etiquette || <span className="text-slate-400">Survolez une unité pour voir sa chaîne de prérequis.</span>}</div>
      <div className="text-[11px] text-slate-500 leading-[1.9] mt-1">
        <Leg fond="var(--c-reussi, #3E7D5E)" lisere="color-mix(in srgb, var(--c-reussi, #3E7D5E) 62%, #000)" /> réussie ·
        <Leg fond="var(--c-faveur, #6B46C1)" lisere="color-mix(in srgb, var(--c-faveur, #6B46C1) 62%, #000)" /> faveur ·
        <Leg fond="var(--c-disponible, #2F6FB0)" lisere="color-mix(in srgb, var(--c-disponible, #2F6FB0) 62%, #000)" /> au PAE ·
        <Leg fond="var(--c-disponible, #2F6FB0)" lisere="color-mix(in srgb, var(--c-disponible, #2F6FB0) 62%, #000)" point /> avec report ou VA ·
        <Leg lisere="#94A3B8" /> accessible ·
        <Leg fond="#F4F5F7" lisere="#C3C9D3" /> pas encore ·
        <Leg lisere="var(--c-refuse, #9D4A38)" /> ajournée ·
        <Leg lisere="#C9A227" /> épreuve ·
        <Rep c="#C0392B" g /> refusée une fois ·
        <Rep c="#16406A" /> déterminante<br />
        Flèche bleue pleine : elle touche le PAE de l'année · grise : le reste du parcours · pointillés : prérequis recommandé.
      </div>
    </div>
  );
}

function Leg({ fond = '#fff', lisere, point = false }) {
  return (
    <span className="relative inline-block align-[-2px] mx-1" style={{ width: 20, height: 12, borderRadius: '0 3px 3px 0', background: fond,
      border: '1px solid #D8DCE4', borderLeft: `3px solid ${lisere}` }}>
      {point && <span className="absolute right-[2px] bottom-[2px] w-[4px] h-[4px] rounded-full bg-white" />}
    </span>
  );
}

function Rep({ c, g = false }) {
  return (
    <span className="relative inline-block align-[-2px] mx-1" style={{ width: 20, height: 12, borderRadius: 3, border: '1.5px solid #94A3B8', background: '#fff' }}>
      <span className="absolute w-[7px] h-[7px] rounded-full" style={{ background: c, top: -4, [g ? 'left' : 'right']: -4, border: '1px solid #fff' }} />
    </span>
  );
}

import { useMemo, useRef, useState } from 'react';

/**
 * Schéma de capitalisation — arbre des UE et de leurs prérequis.
 *
 * Deux usages :
 *  - mode="etudiant"  : colore chaque UE selon la situation de l'étudiant
 *  - mode="structure" : montre la structure de la section, avec possibilité
 *                       de déplacer une UE d'une année d'études à l'autre
 *
 * Les colonnes sont les années d'études (BA1, BA2, BA3…), fournies par le
 * backend ; la profondeur dans le graphe ordonne les lignes d'une colonne.
 */

export const COULEURS_CAP = {
  acquise:      { fill: '#D1FAE5', stroke: '#10B981', text: '#065F46', label: 'Acquise' },
  accessible:   { fill: '#DBEAFE', stroke: '#2563EB', text: '#1E3A8A', label: 'Accessible' },
  sous_reserve: { fill: '#E0F2FE', stroke: '#0EA5E9', text: '#075985', label: 'Sous réserve' },
  bloquee:      { fill: '#F1F5F9', stroke: '#CBD5E1', text: '#94A3B8', label: 'Pas encore accessible' },
  structure:    { fill: '#F8FAFC', stroke: '#1B2B4B', text: '#1B2B4B', label: 'Unité d\u2019enseignement' },
};

// L'épreuve intégrée est l'aboutissement du cursus : liseré doré, quelle que
// soit la situation de l'étudiant (la couleur de fond continue d'indiquer
// l'état : acquise, accessible, bloquée…).
export const OR = { fill: '#FBF3DC', stroke: '#C9A84C', text: '#7A5C12', label: 'Épreuve intégrée' };

export default function SchemaCapitalisation({
  data, mode = 'etudiant', onNiveau = null, replie = false, titre = 'Schéma de capitalisation',
  onLien = null, onSupprimerLien = null,
}) {
  const [ouvert, setOuvert] = useState(!replie);
  const [selection, setSelection] = useState(null);   // UE cliquée (mode structure)
  const [drag, setDrag] = useState(null);            // { ue_num, dx, dy, cible }
  const [modeLien, setModeLien] = useState(false);   // tirer des liens de prérequis
  const [lien, setLien] = useState(null);            // { depuis, x, y, cible }
  const [natureLien, setNatureLien] = useState('legal');   // legal | interne
  const svgRef = useRef(null);

  const layout = useMemo(() => {
    if (!data?.nodes?.length) return null;
    // Boîtes RESSERRÉES une seconde fois : à 96×32 elles restaient trop
    // grandes et la légende du bas se faisait manger. Le numéro d'UE reste
    // parfaitement lisible à cette taille, c'est lui qu'on cherche du regard.
    // PIED réserve la bande de la légende, qui était recouverte.
    const L = 78, H = 26, GX = 38, GY = 6, PAD = 5, TETE = 18, PIED = 22;
    const couches = {};
    for (const n of data.nodes) (couches[n.couche] = couches[n.couche] || []).push(n);
    const nums = Object.keys(couches).map(Number).sort((a, b) => a - b);
    const pos = {};
    const colonnesX = {};
    let hauteurMax = 0;
    nums.forEach((cn, ci) => {
      const x = PAD + ci * (L + GX);
      colonnesX[cn] = x;
      couches[cn].forEach((n, ri) => { pos[n.ue_num] = { x, y: PAD + TETE + ri * (H + GY) }; });
      hauteurMax = Math.max(hauteurMax, couches[cn].length);
    });
    // Un titre par année d'études, centré sur ses sous-colonnes
    const groupes = (data.groupes && data.groupes.length)
      ? data.groupes
      : nums.map(cn => ({
          label: (data.colonnes || []).find(c0 => c0.index === cn)?.label
                 || couches[cn][0]?.ue_niv || '—',
          debut: cn, fin: cn,
        }));
    const entetes = groupes
      .filter(g => colonnesX[g.debut] !== undefined)
      .map(g => {
        const xd = colonnesX[g.debut];
        const xf = colonnesX[g.fin] !== undefined ? colonnesX[g.fin] : xd;
        return {
          ...g, x: xd,
          largeur: (xf - xd) + L,
          centre: xd + ((xf - xd) + L) / 2,
          sousTitre: g.sous_titre || null,
        };
      });

    return {
      pos, L, H, TETE, PAD, entetes, groupes, colonnesX,
      largeur: PAD * 2 + nums.length * (L + GX) - GX,
      // PIED : la légende s'affiche SOUS le schéma et se faisait recouvrir.
      hauteur: PAD * 2 + TETE + PIED + hauteurMax * (H + GY) - GY,
    };
  }, [data]);

  if (!data) return <div className="py-4 text-[12px] text-slate-400">Chargement du schéma…</div>;
  if (!data.nodes?.length) return (
    <div className="text-center py-6 text-slate-400 text-sm border-2 border-dashed rounded-xl">
      Aucune UE au référentiel pour ce périmètre.
    </div>
  );

  const deplacable = mode === 'structure' && !!onNiveau && !modeLien;

  // Colonne visée par une abscisse : chaque colonne occupe sa largeur plus la
  // moitié des gouttières qui l'entourent.
  // Le dépôt vise une ANNÉE D'ÉTUDES, pas une sous-colonne : à l'intérieur
  // d'une année, la sous-colonne est déduite des prérequis, pas choisie.
  function colonneA(x) {
    if (!layout) return null;
    let meilleure = null, distance = Infinity;
    for (const e0 of layout.entetes) {
      const d = Math.abs(x - e0.centre);
      if (d < distance) { distance = d; meilleure = e0; }
    }
    return meilleure;
  }

  // ── Tirage d'un lien de prérequis ──
  // On tire DEPUIS l'UE prérequise VERS celle qu'elle conditionne, dans le sens
  // de lecture des flèches.
  function svgXY(e) {
    const r0 = svgRef.current?.getBoundingClientRect();
    return r0 ? { x: e.clientX - r0.left, y: e.clientY - r0.top } : { x: 0, y: 0 };
  }

  function lienDown(e, n) {
    e.preventDefault(); e.stopPropagation();
    const p = svgXY(e);
    setLien({ depuis: n.ue_num, x: p.x, y: p.y, cible: null });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function lienMove(e) {
    if (!lien) return;
    const p = svgXY(e);
    // L'UE survolée devient la cible
    let cible = null;
    for (const n of data.nodes) {
      const q = layout.pos[n.ue_num];
      if (!q) continue;
      if (p.x >= q.x && p.x <= q.x + layout.L && p.y >= q.y && p.y <= q.y + layout.H) {
        cible = n.ue_num; break;
      }
    }
    setLien(l => l && ({ ...l, x: p.x, y: p.y, cible }));
  }

  function lienUp() {
    if (!lien) return;
    const { depuis, cible } = lien;
    setLien(null);
    if (!cible || cible === depuis) return;
    onLien && onLien(depuis, cible, natureLien);
  }

  function pointerDown(e, n) {
    if (!deplacable) return;
    e.preventDefault();
    const r0 = svgRef.current?.getBoundingClientRect();
    setDrag({
      ue_num: n.ue_num, couche: n.couche, niveau: (n.ue_niv || '').toUpperCase(),
      ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, bouge: false,
      rect: r0, cible: null,
    });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function pointerMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.ox, dy = e.clientY - drag.oy;
    const bouge = drag.bouge || Math.abs(dx) > 4 || Math.abs(dy) > 4;
    const p = layout.pos[drag.ue_num];
    const xSvg = (p?.x ?? 0) + layout.L / 2 + dx;
    setDrag(d => d && ({ ...d, dx, dy, bouge, cible: bouge ? colonneA(xSvg) : null }));
  }

  function pointerUp() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.bouge) {                       // simple clic : sélection
      setSelection(s => (s === d.ue_num ? null : d.ue_num));
      return;
    }
    if (!d.cible || d.cible.sousTitre) return;   // épreuve intégrée : pas de dépôt
    if (d.cible.label === d.niveau) return;      // même année : rien à changer
    onNiveau(d.ue_num, d.cible.label);
  }

  const compte = s => data.nodes.filter(n => n.statut === s).length;
  const niveauxPossibles = [...new Set([
    ...(data.colonnes || []).map(c0 => c0.label).filter(l => /^BA\d+$/.test(l)),
    'BA1', 'BA2', 'BA3',
  ])].sort();

  return (
    <div className="mb-4 border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => setOuvert(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition">
        <span className="text-[12px] font-semibold text-iip-blue">
          {titre}
          <span className="ml-2 font-normal text-slate-500">
            {mode === 'etudiant'
              ? `${compte('acquise')} acquise(s) · ${compte('accessible') + compte('sous_reserve')} accessible(s) · ${compte('bloquee')} à venir`
              : `${data.nodes.length} UE · ${data.edges.length} lien(s) de prérequis`}
          </span>
        </span>
        <span className="text-[11px] text-slate-400">{ouvert ? 'Masquer' : 'Afficher'}</span>
      </button>

      {ouvert && layout && (
        <>
          {/* Le schéma tient ENTIER dans son cadre : un ascenseur interne
              piégeait la molette et empêchait la page de défiler. Le SVG se
              met à l'échelle par son viewBox. */}
          {/* La hauteur SUIT le schéma : un plafond fixe l'écrasait et le
              faisait déborder sur la légende. Le SVG garde ses proportions et
              la zone s'adapte, sans ascenseur. */}
          <div className="bg-white">
            <svg ref={svgRef}
              viewBox={`0 0 ${layout.largeur} ${layout.hauteur}`}
              preserveAspectRatio="xMidYMid meet"
              onPointerMove={e => { pointerMove(e); lienMove(e); }}
              onPointerUp={e => { pointerUp(e); lienUp(e); }}
              onPointerLeave={e => { pointerUp(e); lienUp(e); }}
              /* L'echelle est PLAFONNEE a 1:1 (maxWidth = largeur du viewBox).
                 Sans ce plafond le SVG s'etirait a toute la largeur du cadre et
                 agrandissait tout le schema d'un facteur 2 a 3 : les fontSize
                 du SVG s'affichaient bien plus gros que le texte de la fenetre.
                 Une unite de viewBox = un pixel, donc fontSize="10" = 10 px. */
              style={{
                width: '100%',
                maxWidth: layout.largeur,
                height: 'auto',
                display: 'block',
                touchAction: deplacable ? 'none' : 'auto',
              }}>
              <defs>
                <marker id="fl-cap" markerWidth="7" markerHeight="7" refX="6" refY="2.5"
                  orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,5 L6,2.5 z" fill="#94A3B8" />
                </marker>
              </defs>

              {drag?.cible && drag.bouge && !drag.cible.sousTitre
                && drag.cible.label !== drag.niveau && (
                <rect x={drag.cible.x - 8} y={layout.PAD} rx="8"
                  width={drag.cible.largeur + 16} height={layout.hauteur - layout.PAD * 2}
                  fill="#00AACC" opacity="0.08" stroke="#00AACC" strokeWidth="1.2"
                  strokeDasharray="5 4" />
              )}

              {layout.entetes.map((e0, gi) => (
                <g key={'h' + e0.debut}>
                  {gi > 0 && (
                    <line x1={e0.x - 26} y1={layout.PAD} x2={e0.x - 26} y2={layout.hauteur - layout.PAD}
                      stroke="#E2E8F0" strokeWidth="1" />
                  )}
                  <text x={e0.centre} y={layout.PAD + (e0.sousTitre ? 8 : 12)}
                    textAnchor="middle" fontSize="10" fontWeight="700"
                    fill={e0.sousTitre ? '#C9A84C' : '#94A3B8'} letterSpacing="0.6">
                    {e0.label}
                  </text>
                  {e0.sousTitre && (
                    <text x={e0.centre} y={layout.PAD + 18}
                      textAnchor="middle" fontSize="7.5" fontWeight="600"
                      fill="#C9A84C" letterSpacing="0.4">
                      {e0.sousTitre.toUpperCase()}
                    </text>
                  )}
                </g>
              ))}

              {data.edges.map((eg, i) => {
                const a = layout.pos[eg.from], b = layout.pos[eg.to];
                if (!a || !b) return null;
                const x1 = a.x + layout.L, y1 = a.y + layout.H / 2;
                const x2 = b.x - 7,        y2 = b.y + layout.H / 2;
                const dx = Math.max(24, (x2 - x1) / 2);
                const enArriere = x2 < x1;   // prérequis placé après : incohérence
                const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;

                // Trois lectures dans un seul trait : gris au sein d'une même
                // année, bleu d'une année à l'autre, pointillé quand le
                // prérequis relève d'une règle interne et non du dossier
                // pédagogique. L'ambre reste réservé aux incohérences.
                const nDe = n => (data.nodes.find(x => x.ue_num === n)?.niveau || '').toUpperCase();
                const memeAnnee = nDe(eg.from) && nDe(eg.from) === nDe(eg.to);
                const interne = eg.type === 'interne';
                const couleur = enArriere ? '#F59E0B' : memeAnnee ? '#94A3B8' : '#3B82F6';
                const titre = (interne ? 'Prérequis interne — ' : 'Prérequis du dossier pédagogique — ')
                  + `l'UE ${eg.from} conditionne l'UE ${eg.to}`
                  + (memeAnnee ? ' (même année)' : '')
                  + (eg.motif ? ` · ${eg.motif}` : '');

                return (
                  <g key={i}>
                    <path d={d} fill="none" stroke={couleur}
                      strokeWidth={enArriere ? 1.8 : interne ? 1.6 : 1.4}
                      strokeDasharray={interne ? '5 4' : undefined}
                      markerEnd="url(#fl-cap)">
                      <title>{titre}</title>
                    </path>
                    {modeLien && onSupprimerLien && (
                      <path d={d} fill="none" stroke="transparent" strokeWidth="12"
                        style={{ cursor: 'pointer' }}
                        onClick={() => onSupprimerLien(eg.from, eg.to)}>
                        <title>{`UE ${eg.from} conditionne l\u2019UE ${eg.to} — cliquer pour supprimer ce lien`}</title>
                      </path>
                    )}
                  </g>
                );
              })}

              {lien && (() => {
                const a = layout.pos[lien.depuis];
                if (!a) return null;
                return (
                  <path d={`M${a.x + layout.L},${a.y + layout.H / 2} L${lien.x},${lien.y}`}
                    fill="none" stroke={lien.cible ? '#00AACC' : '#94A3B8'}
                    strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#fl-cap)" />
                );
              })()}

              {data.nodes.map(n => {
                const p = layout.pos[n.ue_num];
                if (!p) return null;
                const base = COULEURS_CAP[n.statut] || COULEURS_CAP.bloquee;
                const ei = !!n.epreuve_integree;
                const co = ei
                  ? { fill: mode === 'structure' ? OR.fill : base.fill, stroke: OR.stroke, text: ei && mode === 'structure' ? OR.text : base.text }
                  : base;
                // Le libellé est coupé plus court : les boîtes ont rétréci et
                // le texte débordait sur la voisine.
                const nom = (n.ue_nom || '').length > 17
                  ? (n.ue_nom || '').slice(0, 16) + '…' : (n.ue_nom || '');
                const actif = selection === n.ue_num;
                const enDeplacement = drag?.bouge && drag.ue_num === n.ue_num;
                return (
                  <g key={n.ue_num}
                    onPointerDown={e => pointerDown(e, n)}
                    transform={enDeplacement ? `translate(${drag.dx},${drag.dy})` : undefined}
                    opacity={enDeplacement ? 0.85 : 1}
                    style={{ cursor: deplacable ? (enDeplacement ? 'grabbing' : 'grab') : 'default' }}>
                    <title>{`UE ${n.ue_num} — ${n.ue_nom || ''}${n.ue_niv ? ' · ' + n.ue_niv : ''}${
                      n.prerequis?.length ? '\nPrérequis : ' + n.prerequis.join(', ') : ''}${
                      n.prereq_manquants?.length ? '\nManquants : ' + n.prereq_manquants.join(', ') : ''}`}</title>
                    <rect x={p.x} y={p.y} width={layout.L} height={layout.H} rx="7"
                      fill={co.fill} stroke={actif ? '#00AACC' : co.stroke}
                      strokeWidth={actif ? 2.5 : (ei ? 2.2 : (n.inscrite ? 2 : 1.2))}
                      strokeDasharray={n.statut === 'sous_reserve' ? '4 3' : undefined} />
                    {/* UE DÉTERMINANTE : elle pèse double dans la mention du
                        diplôme. La pastille est CENTRÉE sur l'angle supérieur
                        droit, à cheval sur le bord — elle déborde autant
                        qu'elle mord dedans. */}
                    {n.determinante && (
                      <g>
                        {/* Proportionnée aux boîtes resserrées : à r=9 sur une
                            boîte de 26 de haut, la pastille la mangeait. */}
                        <circle cx={p.x + layout.L} cy={p.y} r={6.5}
                          fill="#047857" stroke="#fff" strokeWidth={1.2} />
                        <text x={p.x + layout.L} y={p.y + 2.5} textAnchor="middle"
                          fontSize={8} fontWeight="700" fill="#fff">D</text>
                      </g>
                    )}
                    {ei && (
                      <text x={p.x + layout.L - 5} y={p.y + layout.H - 5} textAnchor="end"
                        fontSize="8" fill={OR.stroke}>★</text>
                    )}
                    <text x={p.x + 6} y={p.y + 12} fontSize="10" fontWeight="700" fill={co.text}>
                      {n.ue_num}
                    </text>
                    <text x={p.x + 6} y={p.y + 22} fontSize="7" fill={co.text} opacity="0.85">
                      {nom}
                    </text>
                    {/* La pastille de l'UE inscrite, replacée pour les boîtes
                        resserrées. Elle se décale quand la pastille « D »
                        occupe déjà l'angle. */}
                    {n.inscrite && (
                      <circle cx={p.x + layout.L - (n.determinante ? 15 : 6)}
                        cy={p.y + 6} r="2.6" fill={co.stroke} />
                    )}
                    {modeLien && onLien && (
                      <circle cx={p.x + layout.L} cy={p.y + layout.H / 2} r="5.5"
                        fill={lien?.cible === n.ue_num ? '#00AACC' : '#FFFFFF'}
                        stroke="#00AACC" strokeWidth="1.6"
                        style={{ cursor: 'crosshair' }}
                        onPointerDown={e => lienDown(e, n)}>
                        <title>Tirer depuis cette UE vers celle qu'elle conditionne</title>
                      </circle>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {mode === 'structure' && onLien && (
            <div className="px-3 py-2 border-t border-slate-200 bg-white flex items-center gap-3 flex-wrap">
              <button onClick={() => { setModeLien(m => !m); setSelection(null); }}
                className={`text-[12px] px-3 py-1.5 rounded-lg border font-medium transition ${modeLien
                  ? 'bg-iip-turquoise text-white border-iip-turquoise'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                {modeLien ? 'Terminer les liens' : 'Modifier les prérequis'}
              </button>

              {modeLien && (
                <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                  {[['legal', 'Dossier pédagogique'], ['interne', 'Règle interne']].map(([v, l]) => (
                    <button key={v} onClick={() => setNatureLien(v)}
                      title={v === 'interne'
                        ? "Fondé sur des motifs pédagogiques : avertit l'étudiant sans lui interdire l'UE"
                        : "Imposé par le dossier pédagogique : bloque tant qu'il n'est pas acquis"}
                      className={`px-2.5 py-1 text-[11.5px] ${natureLien === v
                        ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              )}
              <span className="text-[11px] text-slate-500 flex-1">
                {modeLien
                  ? "Tirez depuis la pastille droite d'une UE vers celle qu'elle conditionne. Cliquez un trait pour le supprimer."
                  : "Trait gris : même année. Bleu : d'une année à l'autre. Pointillé : règle interne, qui avertit sans interdire."}
              </span>
            </div>
          )}

          {mode === 'structure' && onNiveau && !modeLien && (
            <div className="px-3 py-2 border-t border-slate-200 bg-white">
              {selection ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] text-slate-600">
                    UE <b className="text-iip-blue">{selection}</b> — placer en&nbsp;:
                  </span>
                  {niveauxPossibles.map(v => (
                    <button key={v}
                      onClick={() => { onNiveau(selection, v); setSelection(null); }}
                      className="text-[11.5px] px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-iip-blue hover:text-white hover:border-iip-blue transition">
                      {v}
                    </button>
                  ))}
                  <button onClick={() => { onNiveau(selection, ''); setSelection(null); }}
                    className="text-[11.5px] px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                    Valeur du référentiel
                  </button>
                  <button onClick={() => setSelection(null)}
                    className="text-[11.5px] px-2 py-1 text-slate-400">Annuler</button>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">
                  Glissez une UE vers une autre colonne pour changer son année d'études,
                  ou cliquez-la pour choisir dans une liste. Les prérequis, eux, viennent du
                  dossier pédagogique et ne bougent pas. Une flèche ambre signale un prérequis
                  placé après l'UE qui en dépend.
                </div>
              )}
            </div>
          )}

          {mode === 'etudiant' && (
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-slate-50 border-t border-slate-200 text-[10.5px] text-slate-500">
              {['acquise', 'accessible', 'sous_reserve', 'bloquee'].map(k => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm border"
                    style={{ background: COULEURS_CAP[k].fill, borderColor: COULEURS_CAP[k].stroke }} />
                  {COULEURS_CAP[k].label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-slate-500" /> inscrite cette année
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm border-2" style={{ borderColor: OR.stroke }} />
                épreuve intégrée
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import { IconGift } from '@tabler/icons-react';
import { teintes } from '../lib/etats.js';

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

/*
 * LES COULEURS DU SCHÉMA SONT CELLES DE LUCIE, ET PAS D'AUTRES — celles du
 * bloc d'état (lib/etats.js, étude du 25 septembre 2026) : liseré gauche qui
 * porte l'état, fond pâle de la même teinte, contour fin.
 *   · VERT — acquise ; VIOLET et cadeau — acquise par faveur ;
 *   · BLEU — disponible (sous réserve : même bleu, trait pointillé — une
 *     nuance ne mérite pas une teinte, elle mérite un détail) ;
 *   · OCRE — ajournée, en attente de la seconde session : un geste est attendu ;
 *   · GRIS — encore indisponible ;
 *   · DORÉ — l'épreuve intégrée, et elle seule (règle du dépôt).
 */
const CAP_ETAT = {
  acquise: 'reussi', faveur: 'faveur', accessible: 'disponible', sous_reserve: 'disponible',
  en_attente: 'surveiller', bloquee: 'indisponible',
};
const LIBELLE_CAP = {
  acquise: 'Réussie', faveur: 'Réussie par faveur', accessible: 'Disponible',
  sous_reserve: 'Disponible sous réserve', en_attente: 'Ajournée, en attente',
  bloquee: 'Encore indisponible',
};
function couleursCap(statut) {
  if (statut === 'structure') return { fond: '#F8FAFC', bord: '#1B2B4B', rail: null, texte: '#1B2B4B' };
  return teintes(CAP_ETAT[statut] || 'indisponible');
}
export const COULEURS_CAP = Object.fromEntries(Object.keys(LIBELLE_CAP)
  .map(k => [k, { ...couleursCap(k), label: LIBELLE_CAP[k] }]));

/** Une case à gauche droite (le liseré), à droite arrondie. */
function boite(x, y, w, h, r) {
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r}`
    + ` Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}

/** Le cadeau de la faveur, tracé dans le SVG (dessin de @tabler/icons, 24×24). */
function Cadeau({ x, y, taille = 8 }) {
  const k = taille / 24;
  return (
    <g transform={`translate(${x},${y}) scale(${k})`} fill="none" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--c-faveur)' }}>
      <path d="M4 8h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
    </g>
  );
}

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
  // Zoom RÉGLABLE. La taille de BASE vaut 1,25 fois l'échelle 1:1 : à 1:1 le
  // schéma était lisible mais menu. C'est cette taille-là qui s'affiche
  // « 100 % », le facteur restant interne pour que la commande reste simple.
  const BASE = 1.25;
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef(null);

  const layout = useMemo(() => {
    if (!data?.nodes?.length) return null;
    // Boîtes RESSERRÉES une seconde fois : à 96×32 elles restaient trop
    // grandes et la légende du bas se faisait manger. Le numéro d'UE reste
    // parfaitement lisible à cette taille, c'est lui qu'on cherche du regard.
    // PIED réserve la bande de la légende, qui était recouverte.
    // TETE passe de 18 à 28 : le sous-titre « ÉPREUVE INTÉGRÉE » est tracé
    // à PAD + 18, exactement là où commençait la première tuile — il se
    // superposait donc à elle.
    const L = 78, H = 26, GX = 38, GY = 6, PAD = 5, TETE = 28, PIED = 22;
    const couches = {};
    for (const n of data.nodes) (couches[n.couche] = couches[n.couche] || []).push(n);
    let nums = Object.keys(couches).map(Number).sort((a, b) => a - b);
    /* L'ÉPREUVE INTÉGRÉE SOUS LE DERNIER BLOC (Charles, 25 septembre 2026 :
       « pour gagner de la place en largeur, l'EI doit être en BA3, mais en
       dessous de toutes les UE de BA3 »). Sa colonne propre disparaît ; ses
       unités descendent au pied de la dernière colonne, sous leur intitulé. */
    const groupeEI = (data.groupes || []).find(g => g.sous_titre);
    const colEI = groupeEI ? groupeEI.debut : null;
    let sousEI = [];
    const autres = nums.filter(cn => cn !== colEI);
    if (colEI != null && couches[colEI] && autres.length) {
      sousEI = couches[colEI];
      delete couches[colEI];
      nums = autres;
    }
    const colPied = nums[nums.length - 1];
    const ECART_EI = 16;   // la place de l'intitulé « Épreuve intégrée »
    const MARGE_D = 22;
    const pos = {};
    const colonnesX = {};
    let bas = 0, piedEI = null;
    nums.forEach((cn, ci) => {
      const x = PAD + ci * (L + GX);
      colonnesX[cn] = x;
      couches[cn].forEach((n, ri) => { pos[n.ue_num] = { x, y: PAD + TETE + ri * (H + GY) }; });
      let yFin = PAD + TETE + couches[cn].length * (H + GY) - GY;
      if (cn === colPied && sousEI.length) {
        piedEI = { x, y: yFin + ECART_EI - 4 };
        sousEI.forEach((n, ri) => {
          pos[n.ue_num] = { x, y: yFin + ECART_EI + ri * (H + GY), pied: true };
        });
        yFin += ECART_EI + sousEI.length * (H + GY);
      }
      bas = Math.max(bas, yFin);
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
      .filter(g => colonnesX[g.debut] !== undefined && !(sousEI.length && g.sous_titre))
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
      pos, L, H, TETE, PAD, entetes, groupes, colonnesX, piedEI,
      // MARGE_D : les flèches d'une même colonne contournent par la droite —
      // sans cette marge, celles de la dernière colonne sortaient du cadre.
      largeur: PAD * 2 + nums.length * (L + GX) - GX + MARGE_D,
      // PIED : la légende s'affiche SOUS le schéma et se faisait recouvrir.
      hauteur: bas + PAD + PIED,
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
  // Les coordonnées d'un pointeur sont en PIXELS ÉCRAN ; le reste du composant
  // raisonne en unités de viewBox. Sans cette division, tirer un lien visait à
  // côté dès que le SVG n'était pas affiché à l'échelle 1:1 — au zoom, comme
  // dans une fenêtre plus étroite que le schéma.
  function svgXY(e) {
    const r0 = svgRef.current?.getBoundingClientRect();
    if (!r0 || !layout) return { x: 0, y: 0 };
    const k = r0.width ? layout.largeur / r0.width : 1;
    return { x: (e.clientX - r0.left) * k, y: (e.clientY - r0.top) * k };
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
    // Même conversion que svgXY : le déplacement est mesuré à l'écran, la
    // colonne visée se cherche en unités de viewBox.
    const k = drag.rect?.width ? layout.largeur / drag.rect.width : 1;
    const xSvg = (p?.x ?? 0) + layout.L / 2 + dx * k;
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
              ? `${compte('acquise')} réussie(s) · ${compte('accessible') + compte('sous_reserve')} disponible(s)`
                + (compte('en_attente') ? ` · ${compte('en_attente')} en attente` : '')
                + ` · ${compte('bloquee')} encore indisponible(s)`
              : `${data.nodes.length} UE · ${data.edges.length} lien(s) de prérequis`}
          </span>
        </span>
        <span className="text-[11px] text-slate-400">{ouvert ? 'Masquer' : 'Afficher'}</span>
      </button>

      {/* Le ZOOM est une commande à part : le bandeau replie/déplie le schéma,
          et un bouton dans un bouton n'est pas cliquable. */}
      {ouvert && layout && (
        <div className="flex items-center justify-end gap-1 px-3 py-1.5
                        border-b border-slate-100 bg-white">
          <span className="text-[11px] text-slate-400 mr-1">Taille</span>
          <button type="button" onClick={() => setZoom(z => Math.max(0.8, Math.round((z - 0.25) * 100) / 100))}
            disabled={zoom <= 0.8}
            className="w-6 h-6 rounded border border-slate-200 text-slate-600
                       text-[13px] leading-none disabled:opacity-40"
            title="Réduire">−</button>
          <button type="button" onClick={() => setZoom(1)}
            className="px-2 h-6 rounded border border-slate-200 text-slate-600
                       text-[11px] tabular-nums"
            title="Revenir à la taille normale">{Math.round(zoom * 100)} %</button>
          <button type="button" onClick={() => setZoom(z => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
            disabled={zoom >= 3}
            className="w-6 h-6 rounded border border-slate-200 text-slate-600
                       text-[13px] leading-none disabled:opacity-40"
            title="Agrandir">+</button>
        </div>
      )}

      {ouvert && layout && (
        <>
          {/* Le schéma tient ENTIER dans son cadre : un ascenseur interne
              piégeait la molette et empêchait la page de défiler. Le SVG se
              met à l'échelle par son viewBox. */}
          {/* La hauteur SUIT le schéma : un plafond fixe l'écrasait et le
              faisait déborder sur la légende. Le SVG garde ses proportions et
              la zone s'adapte, sans ascenseur. */}
          {/* overflow-x SEULEMENT : un ascenseur vertical interne piégeait la
              molette et empêchait la page de défiler. Le défilement horizontal,
              lui, ne capture pas la molette verticale. */}
          <div className="bg-white" style={{ overflowX: 'auto' }}>
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
                // 1 unité de viewBox = `zoom` pixels : à 100 % le fontSize="10"
                // du SVG s'affiche en 10 px, cohérent avec le texte du cadre,
                // et la police grandit avec le zoom sans rien déformer.
                width: layout.largeur * zoom * BASE,
                height: 'auto',
                display: 'block',
                // Une UE qu'on glisse ne se fait plus rogner au bord du cadre.
                overflow: 'visible',
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

              {layout.piedEI && (
                <text x={layout.piedEI.x} y={layout.piedEI.y} fontSize="6.6" fontWeight="700"
                  fill="#8A6D1F" letterSpacing="0.3">ÉPREUVE INTÉGRÉE</text>
              )}

              {data.edges.map((eg, i) => {
                const a = layout.pos[eg.from], b = layout.pos[eg.to];
                if (!a || !b) return null;
                const x1 = a.x + layout.L, y1 = a.y + layout.H / 2;
                const y2 = b.y + layout.H / 2;
                // MÊME COLONNE — l'épreuve intégrée sous le dernier bloc, ou deux
                // UE d'une même sous-colonne : la flèche contourne par la droite.
                const memeColonne = a.x === b.x;
                const x2 = memeColonne ? b.x + layout.L + 5 : b.x - 7;
                const dx = Math.max(24, (x2 - x1) / 2);
                const enArriere = !memeColonne && x2 < x1;   // prérequis placé après : incohérence
                const d = memeColonne
                  ? `M${x1},${y1} C${x1 + 20},${y1} ${x2 + 20},${y2} ${x2},${y2}`
                  : `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;

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
                // Une acquise PAR FAVEUR prend le violet : c'est un octroi, il
                // doit se voir de loin (Charles, 25 septembre 2026).
                const statut = n.statut === 'acquise' && n.reussite?.faveur ? 'faveur' : n.statut;
                const base = couleursCap(statut);
                const ei = !!n.epreuve_integree;
                const co = ei && mode === 'structure'
                  ? { fond: OR.fill, bord: OR.stroke, rail: OR.stroke, texte: OR.text }
                  : ei ? { ...base, rail: OR.stroke } : base;
                // Le libellé est coupé plus court : les boîtes ont rétréci et
                // le texte débordait sur la voisine.
                // Sur une UE acquise, l'année occupe la fin de la seconde ligne :
                // le nom s'y raccourcit d'autant, rien ne se chevauche.
                const aNote = n.statut === 'acquise' && !!n.reussite;
                const max = aNote ? 11 : 17;
                const nom = (n.ue_nom || '').length > max
                  ? (n.ue_nom || '').slice(0, max - 1) + '…' : (n.ue_nom || '');
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
                    <path d={boite(p.x, p.y, layout.L, layout.H, 6)}
                      style={{ fill: co.fond, stroke: actif ? '#00AACC' : co.bord }}
                      strokeWidth={actif ? 2.2 : 1}
                      strokeDasharray={n.statut === 'sous_reserve' ? '4 3' : undefined} />
                    {co.rail && (
                      <rect x={p.x} y={p.y} width="3.5" height={layout.H} style={{ fill: co.rail }} />
                    )}
                    {/* AU PROGRAMME DE L'ANNÉE : un cadre marine, comme dans la
                        maquette du parcours — la pastille ronde se perdait. */}
                    {n.inscrite && !actif && (
                      <path d={boite(p.x - 1.2, p.y - 1.2, layout.L + 2.4, layout.H + 2.4, 7)}
                        fill="none" stroke="#1B2B4B" strokeWidth="1.3" />
                    )}
                    {/* UE DÉTERMINANTE : elle pèse double dans la mention du
                        diplôme. La pastille est CENTRÉE sur l'angle supérieur
                        droit, à cheval sur le bord — elle déborde autant
                        qu'elle mord dedans. */}
                    {n.determinante && (
                      <g>
                        {/* Proportionnée aux boîtes resserrées : à r=9 sur une
                            boîte de 26 de haut, la pastille la mangeait. */}
                        <circle cx={p.x + layout.L} cy={p.y} r={6.5}
                          fill="#1B2B4B" stroke="#fff" strokeWidth={1.2} />
                        <text x={p.x + layout.L} y={p.y + 2.5} textAnchor="middle"
                          fontSize={8} fontWeight="700" fill="#fff">D</text>
                      </g>
                    )}
                    {ei && (
                      <text x={p.x + layout.L - 5} y={p.y + layout.H - 5} textAnchor="end"
                        fontSize="8" fill={OR.stroke}>★</text>
                    )}
                    <text x={p.x + 7} y={p.y + 12} fontSize="10" fontWeight="700" style={{ fill: co.texte }}>
                      {n.ue_num}
                    </text>
                    {statut === 'faveur' && (
                      <Cadeau x={p.x + 8 + String(n.ue_num).length * 6.2} y={p.y + 4.2} taille={8.5} />
                    )}
                    {/* LA NOTE DANS UN CERCLE, sur la ligne du numéro ; L'ANNÉE EN
                        ITALIQUE, au bout de la ligne du nom — deux lignes, deux
                        places : rien ne se chevauche. Le cercle recule quand la
                        pastille « D » tient l'angle. */}
                    {aNote && (
                      <g>
                        <circle cx={p.x + layout.L - (n.determinante ? 15 : 8)} cy={p.y + 9} r="5.6"
                          fill="#FFFFFF" strokeWidth="1" style={{ stroke: base.rail }} />
                        <text x={p.x + layout.L - (n.determinante ? 15 : 8)} y={p.y + 11.4}
                          textAnchor="middle" fontSize={n.reussite.va ? 5 : 6.5} fontWeight="700" fill="#1B2B4B">
                          {n.reussite.va ? 'VA' : n.reussite.note != null
                            ? String(Math.round(n.reussite.note)) : '✓'}
                        </text>
                        <text x={p.x + layout.L - 4} y={p.y + 22} textAnchor="end"
                          fontSize="6.2" fontStyle="italic" fill="#7A879E">
                          {String(n.reussite.annee || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2')}
                        </text>
                      </g>
                    )}
                    <text x={p.x + 7} y={p.y + 22} fontSize="7" style={{ fill: co.texte }} opacity="0.85">
                      {nom}
                    </text>
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
                <div className="segments">
                  {[['legal', 'Dossier pédagogique'], ['interne', 'Règle interne']].map(([v, l]) => (
                    <button key={v} onClick={() => setNatureLien(v)}
                      title={v === 'interne'
                        ? "Fondé sur des motifs pédagogiques : avertit l'étudiant sans lui interdire l'UE"
                        : "Imposé par le dossier pédagogique : bloque tant qu'il n'est pas acquis"}
                      className={`px-2.5 py-1 text-[12px] ${natureLien === v
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
                      className="text-[12px] px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-iip-blue hover:text-white hover:border-iip-blue transition">
                      {v}
                    </button>
                  ))}
                  <button onClick={() => { onNiveau(selection, ''); setSelection(null); }}
                    className="text-[12px] px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                    Valeur du référentiel
                  </button>
                  <button onClick={() => setSelection(null)}
                    className="text-[12px] px-2 py-1 text-slate-400">Annuler</button>
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
            <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
              {['acquise', 'faveur', 'accessible', 'sous_reserve', 'en_attente', 'bloquee'].map(k => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="inline-block w-3.5 h-3 rounded-r-sm"
                    style={{ background: COULEURS_CAP[k].fond,
                      border: `1px ${k === 'sous_reserve' ? 'dashed' : 'solid'} ${COULEURS_CAP[k].bord}`,
                      borderLeft: `3px solid ${COULEURS_CAP[k].rail}` }} />
                  {COULEURS_CAP[k].label}
                  {k === 'faveur' && <IconGift size={12} stroke={2} style={{ color: 'var(--c-faveur)' }} />}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3.5 h-3 rounded-sm border-[1.5px] border-[#1B2B4B]" /> au programme cette année
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3.5 h-3 rounded-r-sm border border-slate-200"
                  style={{ borderLeft: `3px solid ${OR.stroke}` }} />
                épreuve intégrée ★
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

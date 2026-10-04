/**
 * LES FLÈCHES NE PASSENT JAMAIS DERRIÈRE UNE CASE (3.1.34, Charles, 4 octobre
 * 2026 : « une impression des schémas de capitalisation sans que les lignes ne
 * passent derrière les cases… tu sais appliquer cela partout ? »).
 *
 * Une flèche était une courbe tirée droit de sa case de départ à sa case
 * d'arrivée : dès qu'elle sautait une colonne, elle traversait les cases de
 * celle-ci. Elle circule désormais dans les COULOIRS : elle sort par la droite,
 * longe la gouttière, traverse dans l'ALLÉE libre entre deux rangées la plus
 * proche, longe la gouttière d'arrivée et entre par la gauche — des angles
 * droits aux coins arrondis. Deux flèches dans un même couloir prennent chacune
 * leur VOIE, décalée de quelques points.
 *
 * Une seule fonction pour tous les schémas de prérequis de Lucie — à l'écran
 * comme à l'impression : deux tracés finiraient par diverger.
 *
 * @param {object} p
 * @param {Object<string,{x:number,y:number}>} p.boites  position de chaque case (coin haut gauche)
 * @param {Array<{from, to}>} p.edges
 * @param {number} p.L  largeur d'une case   @param {number} p.H  hauteur
 * @param {number} [p.pas]     écart entre deux voies d'un même couloir
 * @param {number} [p.rayon]   arrondi des angles
 * @param {number} [p.entree]  longueur du dernier segment (la pointe s'y pose)
 * @returns {Map<string, string>}  `${from}-${to}` → attribut d d'un <path>
 */
export function routerFleches({ boites, edges, L, H, pas = 3, rayon = 3, entree = 7, marge = 2 }) {
  const ids = Object.keys(boites);
  const xs = [...new Set(ids.map(k => boites[k].x))].sort((a, b) => a - b);
  const col = x => xs.indexOf(x);
  const parCol = xs.map(x => ids.filter(k => boites[k].x === x).map(k => boites[k].y).sort((a, b) => a - b));
  const yMin = Math.min(...ids.map(k => boites[k].y)), yMax = Math.max(...ids.map(k => boites[k].y)) + H;
  const gutterDefaut = xs.length > 1 ? Math.min(...xs.slice(1).map((x, i) => x - xs[i] - L)) : 24;
  // Gouttière g : entre la colonne g et la colonne g+1 (g = -1 : à gauche de tout).
  const gouttiere = g => {
    const gauche = g < 0 ? xs[0] - gutterDefaut : xs[g] + L;
    const droite = g + 1 < xs.length ? xs[g + 1] : xs[xs.length - 1] + L + gutterDefaut;
    return { gauche, droite, centre: (gauche + droite) / 2 };
  };
  // Une allée libre de toutes les colonnes [c1..c2], au plus près des deux extrémités.
  const allee = (c1, c2, y1, y2) => {
    /* PAS DE DÉTOUR INUTILE (Charles, 4 octobre 2026 : « pourquoi des S
       inutiles ? »). La hauteur de la case de DÉPART ou d'ARRIVÉE est le
       premier choix : la colonne sautée est souvent presque vide, et la flèche
       file alors tout droit, avec un seul virage. Une allée ne sert que si
       aucune des deux n'est libre. */
    const cands = new Set([y1, y2, yMin - 5, yMax + 5]);
    for (let c = c1; c <= c2; c++) {
      const ys = parCol[c];
      for (let i = 0; i + 1 < ys.length; i++) cands.add((ys[i] + H + ys[i + 1]) / 2);
    }
    // Les allées des colonnes voisines aussi : elles sont souvent libres partout.
    for (const ys of parCol) for (let i = 0; i + 1 < ys.length; i++) cands.add((ys[i] + H + ys[i + 1]) / 2);
    const libre = y => {
      for (let c = c1; c <= c2; c++) for (const by of parCol[c]) if (y > by - marge && y < by + H + marge) return false;
      return true;
    };
    let mieux = null, cout = Infinity;
    for (const y of cands) if (libre(y)) {
      // Le coût : la longueur verticale, plus un virage de trop si l'on ne
      // passe ni à la hauteur du départ ni à celle de l'arrivée.
      const k = Math.abs(y - y1) + Math.abs(y - y2) + (y === y1 || y === y2 ? 0 : 40) + (y === y1 ? 0 : 1);
      if (k < cout) { cout = k; mieux = y; }
    }
    return mieux ?? yMax + 5;
  };

  // 1. Le trajet de chaque flèche, en couloirs (sans les voies).
  const trajets = [];
  for (const e of edges) {
    const a = boites[e.from], b = boites[e.to];
    if (!a || !b) continue;
    const ca = col(a.x), cb = col(b.x);
    const y1 = a.y + H / 2, y2 = b.y + H / 2;
    const t = { cle: `${e.from}-${e.to}`, x1: a.x + L, y1, y2, segs: [] };
    if (ca === cb) {
      // Même colonne : on contourne par la gouttière de droite, et l'on entre par la droite.
      t.gIn = ca; t.x2 = b.x + L + 2; t.retour = true;
    } else if (cb === ca + 1) {
      t.gIn = ca; t.x2 = b.x - 1;
    } else {
      const gOut = ca, gIn = cb - 1;
      const [c1, c2] = cb > ca ? [ca + 1, cb - 1] : [cb, ca];
      t.gOut = gOut; t.gIn = gIn; t.x2 = b.x - 1;
      t.allee = allee(c1, c2, y1, y2);
    }
    trajets.push(t);
  }

  // 2. Les voies : dans un même couloir, deux segments qui se chevauchent ne
  //    prennent pas la même ligne. 0, +pas, −pas, +2 pas…
  const decalage = k => (k % 2 ? 1 : -1) * Math.ceil(k / 2) * pas;
  const voies = segments => {
    const parCouloir = new Map();
    for (const s of segments) (parCouloir.get(s.couloir) || parCouloir.set(s.couloir, []).get(s.couloir)).push(s);
    for (const liste of parCouloir.values()) {
      liste.sort((p, q) => p.de - q.de);
      const fins = [];
      for (const s of liste) {
        let k = fins.findIndex(f => f < s.de - 1);
        if (k < 0) { k = fins.length; fins.push(s.a); } else fins[k] = s.a;
        s.voie = decalage(k);
      }
    }
  };
  const verticaux = [], horizontaux = [];
  for (const t of trajets) {
    if (t.allee == null) {
      t.vIn = { couloir: `g${t.gIn}`, de: Math.min(t.y1, t.y2), a: Math.max(t.y1, t.y2) };
      verticaux.push(t.vIn);
    } else {
      t.vOut = { couloir: `g${t.gOut}`, de: Math.min(t.y1, t.allee), a: Math.max(t.y1, t.allee) };
      t.vIn = { couloir: `g${t.gIn}`, de: Math.min(t.allee, t.y2), a: Math.max(t.allee, t.y2) };
      const gxo = gouttiere(t.gOut).centre, gxi = gouttiere(t.gIn).centre;
      t.h = { couloir: `a${Math.round(t.allee)}`, de: Math.min(gxo, gxi), a: Math.max(gxo, gxi) };
      verticaux.push(t.vOut, t.vIn); horizontaux.push(t.h);
    }
  }
  voies(verticaux); voies(horizontaux);

  // 3. Les points, puis le tracé aux angles arrondis.
  const res = new Map();
  for (const t of trajets) {
    const pts = [[t.x1, t.y1]];
    if (t.allee == null) {
      const gx = gouttiere(t.gIn).centre + t.vIn.voie;
      pts.push([gx, t.y1], [gx, t.y2], [t.x2, t.y2]);
    } else {
      const gxo = gouttiere(t.gOut).centre + t.vOut.voie;
      const gxi = gouttiere(t.gIn).centre + t.vIn.voie;
      const ya = t.allee + t.h.voie;
      pts.push([gxo, t.y1], [gxo, ya], [gxi, ya], [gxi, t.y2], [t.x2, t.y2]);
    }
    res.set(t.cle, tracer(pts, rayon));
  }
  return res;
}

/** Une ligne brisée aux angles arrondis (les points alignés sont fusionnés). */
function tracer(pts, r) {
  const p = pts.filter((q, i) => i === 0 || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]);
  const net = p.filter((q, i) => i === 0 || i === p.length - 1
    || !((p[i - 1][0] === q[0] && q[0] === p[i + 1][0]) || (p[i - 1][1] === q[1] && q[1] === p[i + 1][1])));
  let d = `M${net[0][0]},${net[0][1]}`;
  for (let i = 1; i < net.length; i++) {
    const [x, y] = net[i];
    if (i === net.length - 1) { d += ` L${x},${y}`; break; }
    const [px, py] = net[i - 1], [nx, ny] = net[i + 1];
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y);
    const k = Math.min(r, l1 / 2, l2 / 2);
    const ax = x - ((x - px) / (l1 || 1)) * k, ay = y - ((y - py) / (l1 || 1)) * k;
    const bx = x + ((nx - x) / (l2 || 1)) * k, by = y + ((ny - y) / (l2 || 1)) * k;
    d += ` L${ax},${ay} Q${x},${y} ${bx},${by}`;
  }
  return d;
}

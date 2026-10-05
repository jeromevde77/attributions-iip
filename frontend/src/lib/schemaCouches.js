/**
 * LE SCHÉMA EN COUCHES (3.1.48, Charles, 5 octobre 2026 : « le tracé des
 * schémas, à reprendre avec une autre méthode : oui »).
 *
 * Les couloirs à angles droits (3.1.34) ont été retirés : « quasi
 * incompréhensible ». La faute n'était pas dans le dessin des flèches mais
 * dans ce qu'on leur laissait : des cases empilées dans l'ordre du serveur, et
 * aucune place prévue pour passer. On fait donc ce que font les schémas en
 * couches :
 *
 *  1. UNE FLÈCHE QUI SAUTE UNE COLONNE Y RÉSERVE SA PLACE — un point de
 *     passage rangé parmi les cases, qui écarte celles-ci : elle traverse la
 *     colonne dans un vide, jamais derrière une case.
 *  2. MÊME BUT, MÊME LIGNE : les flèches qui mènent à une même UE partagent
 *     leurs points de passage — elles se rejoignent et entrent ensemble.
 *  3. L'ORDRE DES CASES se calcule pour croiser le moins possible : chaque case
 *     se range à la hauteur moyenne de ses voisines, colonne après colonne,
 *     dans un sens puis dans l'autre, et l'on garde l'ordre qui croise le moins.
 *  4. Les courbes restent celles d'origine — horizontales au départ et à
 *     l'arrivée —, d'une case à un point de passage, puis au suivant.
 *
 * Fonction pure : elle ne connaît ni React ni l'écran.
 *
 * @param {object} p
 * @param {Array<Array<string|number>>} p.colonnes  ids des cases, colonne par colonne (gauche → droite)
 * @param {Array<{from, to}>} p.edges
 * @param {Set} [p.fixes]  cases dont la place ne bouge pas (l'épreuve intégrée au pied)
 * @returns {{ ordre: Array<Array<{id, passage?:boolean, vers?}>>, chemins: Map }}
 *   ordre : chaque colonne, cases et points de passage mêlés, dans l'ordre retenu
 *   chemins : `${from}-${to}` → [{col, passage id}] — les colonnes traversées
 */
export function ordonnerCouches({ colonnes, edges, fixes = new Set() }) {
  const colDe = new Map();
  colonnes.forEach((c, i) => c.forEach(id => colDe.set(String(id), i)));
  // Les sommets de chaque couche : des cases, puis des points de passage.
  const couches = colonnes.map(c => c.map(id => ({ id: String(id) })));
  const passages = new Map();   // `${vers}@${col}` → sommet
  const liens = [];             // arêtes entre couches voisines : [a, b]
  const chemins = new Map();
  const passage = (vers, col) => {
    const k = `${vers}@${col}`;
    if (!passages.has(k)) { const s = { id: `p:${k}`, passage: true, vers }; passages.set(k, s); couches[col].push(s); }
    return passages.get(k).id;
  };
  const vus = new Set();
  for (const e of edges) {
    const de = String(e.from), vers = String(e.to);
    const ca = colDe.get(de), cb = colDe.get(vers);
    if (ca == null || cb == null || cb <= ca) continue;   // même colonne ou en arrière : tracé à part
    const via = [];
    let prec = de;
    for (let c = ca + 1; c < cb; c++) {
      const p = passage(vers, c);
      via.push({ col: c, id: p });
      const k = `${prec}>${p}`;
      if (!vus.has(k)) { vus.add(k); liens.push([prec, p]); }
      prec = p;
    }
    const k = `${prec}>${vers}`;
    if (!vus.has(k)) { vus.add(k); liens.push([prec, vers]); }
    chemins.set(`${e.from}-${e.to}`, via);
  }

  const gauche = new Map(), droite = new Map();
  for (const [a, b] of liens) {
    (gauche.get(b) || gauche.set(b, []).get(b)).push(a);
    (droite.get(a) || droite.set(a, []).get(a)).push(b);
  }
  const rang = new Map();
  const numeroter = () => couches.forEach(c => c.forEach((s, i) => rang.set(s.id, i)));
  numeroter();

  const croisements = () => {
    let n = 0;
    for (let c = 0; c + 1 < couches.length; c++) {
      const ls = [];
      for (const s of couches[c]) for (const t of droite.get(s.id) || []) ls.push([rang.get(s.id), rang.get(t)]);
      for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++)
        if ((ls[i][0] - ls[j][0]) * (ls[i][1] - ls[j][1]) < 0) n++;
    }
    return n;
  };
  const ranger = (c, voisins) => {
    const libres = couches[c].filter(s => !fixes.has(s.id));
    const bloques = couches[c].filter(s => fixes.has(s.id));
    const bary = s => {
      const v = voisins.get(s.id) || [];
      return v.length ? v.reduce((t, x) => t + rang.get(x), 0) / v.length : rang.get(s.id);
    };
    const b = new Map(libres.map(s => [s.id, bary(s)]));
    libres.sort((x, y) => (b.get(x.id) - b.get(y.id)) || (rang.get(x.id) - rang.get(y.id)));
    couches[c] = [...libres, ...bloques];
    couches[c].forEach((s, i) => rang.set(s.id, i));
  };

  let meilleur = couches.map(c => [...c]), score = croisements();
  for (let tour = 0; tour < 12 && score > 0; tour++) {
    if (tour % 2 === 0) for (let c = 1; c < couches.length; c++) ranger(c, gauche);
    else for (let c = couches.length - 2; c >= 0; c--) ranger(c, droite);
    const s = croisements();
    if (s < score) { score = s; meilleur = couches.map(c => [...c]); }
  }
  return { ordre: meilleur, chemins, croisements: score, gauche, droite };
}

/**
 * LA HAUTEUR DE CHAQUE CASE : à la hauteur de ses voisines, pour que les
 * flèches restent presque droites — sans changer l'ordre retenu ni faire se
 * chevaucher deux cases. Chaque colonne cherche la position la plus proche de
 * ce que ses voisines demandent (régression monotone : les écarts minimaux sont
 * des contraintes, pas des souhaits), dans un sens puis dans l'autre.
 *
 * @param {object} p
 * @param {Array<Array<{id}>>} p.ordre
 * @param {Map} p.gauche  @param {Map} p.droite  voisins de chaque sommet
 * @param {(s) => number} p.taille   hauteur d'un sommet
 * @param {(a, b) => number} p.ecart  espace minimal entre deux sommets consécutifs
 * @param {number} p.haut   ordonnée du haut des colonnes
 * @returns {Map<string, number>}  id → ordonnée du HAUT du sommet
 */
export function placerCouches({ ordre, gauche, droite, taille, ecart, haut, tours = 10 }) {
  const centre = new Map();
  for (const col of ordre) {
    let y = haut;
    col.forEach((s, i) => { if (i) y += ecart(col[i - 1], s); centre.set(s.id, y + taille(s) / 2); y += taille(s); });
  }
  const placer = (col, voisins) => {
    if (!col.length) return;
    // Décalage cumulé : c_i - o_i doit croître.
    const o = [0];
    for (let i = 1; i < col.length; i++)
      o.push(o[i - 1] + taille(col[i - 1]) / 2 + ecart(col[i - 1], col[i]) + taille(col[i]) / 2);
    const voulu = col.map((s, i) => {
      const v = voisins.flatMap(m => m.get(s.id) || []).filter(x => centre.has(x));
      const c = v.length ? v.reduce((t, x) => t + centre.get(x), 0) / v.length : centre.get(s.id);
      return c - o[i];
    });
    // Régression monotone (paquets fusionnés tant qu'ils se contredisent).
    const paquets = [];
    voulu.forEach(v => {
      paquets.push({ somme: v, n: 1 });
      while (paquets.length > 1) {
        const a = paquets[paquets.length - 2], b = paquets[paquets.length - 1];
        if (a.somme / a.n <= b.somme / b.n) break;
        a.somme += b.somme; a.n += b.n; paquets.pop();
      }
    });
    const z = paquets.flatMap(q => Array(q.n).fill(q.somme / q.n));
    const zMin = haut + taille(col[0]) / 2;
    col.forEach((s, i) => centre.set(s.id, Math.max(z[i], zMin) + o[i]));
  };
  for (let t = 0; t < tours; t++) {
    if (t % 2 === 0) for (let c = 1; c < ordre.length; c++) placer(ordre[c], [gauche]);
    else for (let c = ordre.length - 2; c >= 0; c--) placer(ordre[c], [droite]);
  }
  for (let c = 0; c < ordre.length; c++) placer(ordre[c], [gauche, droite]);
  // Tout remonte d'un même cran si plus aucune case ne touche le haut.
  const hauts = new Map();
  let min = Infinity;
  for (const col of ordre) for (const s of col) { const y = centre.get(s.id) - taille(s) / 2; hauts.set(s.id, y); min = Math.min(min, y); }
  for (const [k, y] of hauts) hauts.set(k, y - (min - haut));
  return hauts;
}

/**
 * UN SEUL CHANGEMENT DE HAUTEUR PAR FLÈCHE (Charles, 5 octobre 2026 : « éviter
 * les multiples changements ; un gauche-droite maximum »). Les places réservées
 * d'une même flèche se plaçaient chacune à la hauteur de ses voisines : la
 * flèche ondulait à chaque colonne. Toutes les places qui mènent à une même
 * case prennent UNE hauteur — celle de la case d'arrivée si la voie est libre
 * dans chaque colonne traversée, sinon celle d'une case de départ, sinon la
 * moyenne. La flèche file alors droit, et ne tourne qu'une fois.
 *
 * @param {object} p  ordre, hauts (id → haut), taille(s), chemins (de placerCouches/ordonnerCouches)
 * @param {number} [p.marge]  espace libre à garder autour de la voie
 */
export function redresserPassages({ ordre, hauts, taille, chemins, marge = 3 }) {
  const centre = id => {
    const s = ordre.flat().find(x => x.id === id);
    return s ? hauts.get(id) + taille(s) / 2 : null;
  };
  const colDe = new Map();
  ordre.forEach((col, c) => col.forEach(s => colDe.set(s.id, c)));
  const groupes = new Map();          // case d'arrivée → ses places
  for (const col of ordre) for (const s of col) if (s.passage) {
    (groupes.get(s.vers) || groupes.set(s.vers, []).get(s.vers)).push(s);
  }
  const sources = new Map();          // case d'arrivée → cases de départ qui passent par des places
  for (const [cle, via] of chemins) if (via.length) {
    const [de, vers] = cle.split('-');
    (sources.get(vers) || sources.set(vers, new Set()).get(vers)).add(de);
  }
  for (const [vers, places] of groupes) {
    const ids = new Set(places.map(p => p.id));
    const libre = y => places.every(p => ordre[colDe.get(p.id)].every(o => {
      if (ids.has(o.id)) return true;
      const h0 = hauts.get(o.id), h1 = h0 + taille(o);
      const t = taille(p) / 2 + marge;
      return y + t <= h0 || y - t >= h1;
    }));
    const moyenne = places.reduce((t, p) => t + hauts.get(p.id) + taille(p) / 2, 0) / places.length;
    const candidats = [centre(vers), ...[...(sources.get(vers) || [])].map(centre), moyenne].filter(y => y != null);
    const y = candidats.find(libre);
    if (y == null) continue;
    for (const p of places) hauts.set(p.id, y - taille(p) / 2);
  }
  return hauts;
}

/** Une courbe d'origine — horizontale au départ et à l'arrivée — à travers des points. */
export function courbeParPoints(pts) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    if (y1 === y2) { d += ` L${x2},${y2}`; continue; }
    const dx = Math.max(10, (x2 - x1) / 2);
    d += ` C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }
  return d;
}

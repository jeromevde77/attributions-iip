/**
 * LE CROISEMENT REMPLIT LES CRITÈRES DE LA DUE (3.5.265, Charles, 9 novembre 2026 : « ce qui est décidé à l'étape d'avant doit
 * être appliqué après ; quand les liens entre AA et points de programme sont faits, ils sont placés dans les critères
 * d'évaluation en DUE ; le critère devient le point de programme ; chaque point de programme est une ligne » ; tranché : toujours
 * à jour, une ligne sous chaque acquis, le point tel quel mais modifiable, ce qui existe est gardé et l'on ajoute ce qui manque).
 *
 * `contenu.croisement` = { cours: { point: [acquis] } } ; `contenu.grille_criteres` = { cle: [ligne] }, cle = cours (évaluation
 * par activité) ou `__ue__` (évaluation globale). Une ligne née d'une croix garde son origine (`src_point`, `src_cours`) : on
 * peut reformuler le critère sans qu'elle renaisse en double. Une croix retirée : sa ligne part si rien n'y a été écrit, sinon
 * elle reste, marquée `plus_croisee`. Fonction pure : le serveur l'applique à la lecture et à l'enregistrement de la DUE.
 */
const norm = t => String(t || '').replace(/\s+/g, ' ').trim();

export function synchroniserGrille(contenu, { cours = [], unique = false, ordreAcquis = [] } = {}) {
  const croisement = contenu?.croisement || {};
  const avant = JSON.stringify(contenu?.grille_criteres || {});
  const grille = JSON.parse(avant);
  // Ce que veulent les croix : par table, dans l'ordre des cours puis des points.
  const voulu = {};
  for (const co of (cours.length ? cours : Object.keys(croisement))) {
    const cle = unique ? '__ue__' : co;
    voulu[cle] ||= new Map();
    for (const [ptBrut, aas] of Object.entries(croisement[co] || {})) {
      const pt = norm(ptBrut);
      if (!pt) continue;
      for (const aa of aas || []) { const k = `${aa}|${pt}`; if (!voulu[cle].has(k)) voulu[cle].set(k, { aa, pt, co }); }
    }
  }
  const rang = Object.fromEntries(ordreAcquis.map((a, i) => [a, i]));
  let ajoutees = 0;
  for (const [cle, veut] of Object.entries(voulu)) {
    let lignes = Array.isArray(grille[cle]) ? grille[cle] : [];
    if (!veut.size && !lignes.some(l => l?.src_point)) continue;
    const vus = new Set();
    // 1. Reconnaître les lignes existantes : par leur origine, sinon par leur texte (une ligne posée à la main sur ce point).
    for (const l of lignes) {
      if (!l || typeof l !== 'object') continue;
      const k = l.src_point ? `${l.aa_code}|${l.src_point}` : `${l.aa_code}|${norm(l.point)}`;
      if (veut.has(k) && !vus.has(k)) {
        const v = veut.get(k);
        l.src_point = v.pt; l.src_cours = v.co; delete l.plus_croisee; vus.add(k);
      } else if (l.src_point) l.plus_croisee = true;
    }
    // 2. Une croix retirée : sa ligne part si personne n'y a rien écrit.
    lignes = lignes.filter(l => !(l?.plus_croisee && !String(l.indicateur || '').trim() && norm(l.point) === l.src_point));
    // 3. Les croix sans ligne en reçoivent une, sous les lignes du même acquis.
    for (const [k, v] of veut) {
      if (vus.has(k)) continue;
      const dernier = lignes.map(l => l?.aa_code).lastIndexOf(v.aa);
      lignes.splice(dernier >= 0 ? dernier + 1 : lignes.length, 0, { aa_code: v.aa, point: v.pt, indicateur: '', src_point: v.pt, src_cours: v.co });
      ajoutees += 1;
    }
    // 4. Rangées dans l'ordre des acquis de l'unité (stable).
    grille[cle] = lignes.map((l, i) => ({ l, i }))
      .sort((a, b) => (rang[a.l?.aa_code] ?? 999) - (rang[b.l?.aa_code] ?? 999) || a.i - b.i).map(x => x.l);
  }
  const apres = JSON.stringify(grille);
  return { grille, change: apres !== avant, ajoutees };
}

/** Le bilan pour l'écran : lignes reprises du croisement, critères encore sans indicateur, lignes dont la croix a été retirée. */
export function bilanGrille(grille) {
  const l = Object.values(grille || {}).flat().filter(x => x && typeof x === 'object');
  const reprises = l.filter(x => x.src_point && !x.plus_croisee);
  return { reprises: reprises.length, a_rediger: reprises.filter(x => !String(x.indicateur || '').trim()).length,
    plus_croisees: l.filter(x => x.plus_croisee).length };
}

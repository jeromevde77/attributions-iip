/* LE RELEVÉ DES BLOCAGES DU SERVEUR (3.5.700, Charles, 24 novembre 2026 : « certaines pages sont terriblement lentes — il faut
   optimiser »). Lucie tourne sur un seul fil : un calcul de sept secondes fait attendre chaque clic de chacun pendant sept secondes.
   Mesuré le 24 novembre : sept secondes figées toutes les deux minutes environ. Ce module dit QUI bloque :
   - `travail(nom, fn)` nomme ce qui tourne (dépôt vers le portail, rappels de l'heure, calcul des coûts…) et en garde la durée ;
   - une sonde (toutes les 200 ms) voit le retard du fil ; au-delà de 500 ms, elle note quand, combien et ce qui tournait.
   Lu par GET /api/diagnostic/lenteurs (direction). Rien n'est écrit en base : la mémoire du processus suffit. */

const pile = [];                       // les travaux en cours, du plus ancien au plus récent
const durees = new Map();              // nom → { n, total, max, dernier, le }
const blocages = [];                   // [{ le, ms, pendant }]
let dernierNom = null;                 // le dernier travail terminé (un blocage peut être vu juste après)

function noter(nom, ms) {
  const d = durees.get(nom) || { n: 0, total: 0, max: 0, dernier: 0, le: null };
  d.n++; d.total += ms; d.max = Math.max(d.max, ms); d.dernier = ms; d.le = new Date().toISOString();
  durees.set(nom, d);
  dernierNom = { nom, ms, fin: Date.now() };
}

/** Exécute `fn` (synchrone ou non) sous un nom ; mesure sa durée. */
export async function travail(nom, fn) {
  const t = Date.now(); pile.push(nom);
  try { return await fn(); }
  finally { const i = pile.lastIndexOf(nom); if (i >= 0) pile.splice(i, 1); noter(nom, Date.now() - t); }
}
/** La même chose pour un calcul synchrone (sans promesse). */
export function travailSync(nom, fn) {
  const t = Date.now(); pile.push(nom);
  try { return fn(); }
  finally { const i = pile.lastIndexOf(nom); if (i >= 0) pile.splice(i, 1); noter(nom, Date.now() - t); }
}

let sondeLancee = false;
export function lancerSonde() {
  if (sondeLancee) return; sondeLancee = true;
  let attendu = Date.now() + 200;
  setInterval(() => {
    const maintenant = Date.now(); const retard = maintenant - attendu; attendu = maintenant + 200;
    if (retard < 500) return;
    // Ce qui tournait : la pile au moment du réveil, sinon le dernier travail terminé dans la fenêtre du blocage.
    const pendant = pile.length ? [...pile]
      : (dernierNom && maintenant - dernierNom.fin < retard + 400 ? [`${dernierNom.nom} (${dernierNom.ms} ms)`] : ['(non nommé : une requête)']);
    blocages.push({ le: new Date(maintenant - retard).toISOString(), ms: retard, pendant });
    if (blocages.length > 200) blocages.splice(0, blocages.length - 200);
  }, 200).unref?.();
}

export function etatCharge() {
  return {
    blocages: [...blocages].reverse(),
    travaux: [...durees.entries()].map(([nom, d]) => ({ nom, fois: d.n, moyenne_ms: Math.round(d.total / d.n), max_ms: d.max, dernier_ms: d.dernier, dernier_le: d.le }))
      .sort((a, b) => b.max_ms - a.max_ms),
  };
}

/* LES REQUÊTES LENTES : un intergiciel note toute requête de plus de 800 ms (chemin sans paramètres de requête, durée). */
const requetes = new Map();
export function mesurerRequetes(req, res, next) {
  const t = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t;
    if (ms < 800) return;
    const cle = `${req.method} ${String(req.originalUrl || req.url).split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:n')}`;
    const d = requetes.get(cle) || { n: 0, max: 0, total: 0, le: null };
    d.n++; d.max = Math.max(d.max, ms); d.total += ms; d.le = new Date().toISOString();
    requetes.set(cle, d);
  });
  next();
}
export const requetesLentes = () => [...requetes.entries()].map(([cle, d]) => ({ requete: cle, fois: d.n, max_ms: d.max, moyenne_ms: Math.round(d.total / d.n), dernier_le: d.le }))
  .sort((a, b) => b.max_ms - a.max_ms);

/* LE FINANCEMENT D'UN CURSUS SELON LE DÉCRET, À CÔTÉ DE CELUI DES COMPTES (3.5.512, Charles, 17 novembre 2026 : « d'après la
   comptable, à la HELB un étudiant vaut un étudiant : on sait combien la HELB donne par étudiant. Mais cela s'éloigne de la réalité :
   un étudiant TIM est financé via les UCE (MUCE) avec le facteur 1,5 » ; tranché : chaque cursus avec sa pondération, lissé comme le
   décret). Décret du 9 septembre 1996, art. 17 : l'allocation d'une année civile C se calcule sur la moyenne des étudiants comptés des
   trois années académiques (C−4)-(C−3), (C−3)-(C−2), (C−2)-(C−1). Financement = cette moyenne × MUCE × pondération du groupe du cursus.
   La pondération de chaque cursus se règle à l'écran (direction) : seule celle de TIM (1,5, paramédical) est connue avec certitude ;
   un cursus sans pondération n'est pas calculé. */
import db from '../db/index.js';
import { PARAM_HELB } from './rapportIipHelb.js';

const CLE = 'ponderations_cursus';
const DEFAUT = { 'Technologue en imagerie médicale': 1.5 };

export function ponderationsCursus() {
  try {
    const v = db.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(CLE)?.valeur;
    if (v) { const o = JSON.parse(v); if (o && typeof o === 'object') return o; }
  } catch { /* table absente ou valeur illisible : le défaut */ }
  return { ...DEFAUT };
}
export function poserPonderations(o) {
  const net = {};
  for (const [k, v] of Object.entries(o || {})) {
    const n = Number(String(v).replace(',', '.'));
    if (typeof k === 'string' && k.length < 120 && v !== '' && v != null && Number.isFinite(n) && n > 0 && n <= 5) net[k] = Math.round(n * 1000) / 1000;
  }
  db.prepare('INSERT INTO lucie_config (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(CLE, JSON.stringify(net));
  return net;
}

/** Le financement selon le décret pour l'année civile C. `serie` : { '2023-2024': étudiants comptés }. `existe(acad)` dit si le
 *  cursus fonctionnait déjà cette année-là (sinon une année absente compte zéro : le cursus n'existait pas). Rend null si une année
 *  nécessaire manque alors que le cursus existait — on ne devine pas. */
export function financementDecret(serie, C, pond, existe = () => true, P = PARAM_HELB) {
  if (!pond || !serie) return null;
  const n = Math.max(1, Math.round(P.lissage || 3));
  let s = 0;
  const annees = [];
  for (let k = 2; k < 2 + n; k++) {
    const a = `${C - k}-${C - k + 1}`;
    const v = serie[a];
    if (v == null) { if (existe(a)) return null; annees.push([a, 0]); continue; }
    s += v; annees.push([a, v]);
  }
  const moyenne = s / n;
  return { montant: Math.round(moyenne * P.muce * pond), moyenne: Math.round(moyenne * 100) / 100, annees, muce: P.muce, ponderation: pond };
}

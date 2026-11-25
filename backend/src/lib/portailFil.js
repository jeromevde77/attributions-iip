/* LE PORTAIL DANS UN SECOND FIL (3.5.704, Charles, 25 novembre 2026 : « second fil pour les dépôts »). Lucie tourne sur un seul fil :
   le relevé et les dépôts vers les espaces des étudiants et des enseignants (toutes les dix secondes, et en entier toutes les deux
   minutes) le figeaient une à deux secondes chaque fois — chaque clic de chacun attendait. Ils tournent désormais dans un second fil
   (worker_threads), avec sa propre connexion à la base (WAL : ses lectures ne bloquent personne ; ses écritures sont courtes).
   CÔTÉ LUCIE : `demarrerFilPortail()` lance le fil ; `versLeFil(nom, args)` lui demande un geste (déposer bientôt, ouvrir l'aperçu
   d'un espace, rendre son relevé de charge) et attend sa réponse. Si le fil ne démarre pas, ou meurt, Lucie reprend le portail
   elle-même (`planifierPortail`, comme avant) : jamais d'espace qui cesse d'être nourri. */
import { Worker } from 'node:worker_threads';

let fil = null;
let numero = 0;
const attentes = new Map();
let essais = 0;
let repli = null;     // la fonction qui reprend le portail dans Lucie si le fil ne tient pas

export const filActif = () => !!fil;

export function versLeFil(nom, args = [], delai = 60_000) {
  if (!fil) return Promise.reject(new Error('Le fil du portail ne tourne pas.'));
  const id = ++numero;
  return new Promise((ok, ko) => {
    const t = setTimeout(() => { attentes.delete(id); ko(new Error('Le fil du portail ne répond pas.')); }, delai);
    attentes.set(id, { ok, ko, t });
    fil.postMessage({ id, nom, args });
  });
}

export function demarrerFilPortail(planifierDansLucie) {
  repli = planifierDansLucie;
  try {
    fil = new Worker(new URL('./portailFilTravail.js', import.meta.url), { env: process.env });
  } catch (e) {
    console.error('[portail] le second fil ne démarre pas, Lucie reprend le portail :', e.message);
    fil = null; repli?.(); return false;
  }
  fil.on('message', m => {
    const a = attentes.get(m?.id); if (!a) return;
    attentes.delete(m.id); clearTimeout(a.t);
    if (m.erreur) a.ko(new Error(m.erreur)); else a.ok(m.valeur);
  });
  fil.on('error', e => console.error('[portail] second fil :', e.message));
  fil.on('exit', code => {
    fil = null;
    for (const [, a] of attentes) { clearTimeout(a.t); a.ko(new Error('Le fil du portail s’est arrêté.')); }
    attentes.clear();
    // Relancé jusqu'à trois fois ; au-delà, Lucie reprend le portail elle-même.
    if (++essais <= 3) { console.error(`[portail] second fil arrêté (${code}) : relance dans 30 s`); setTimeout(() => demarrerFilPortail(repli), 30_000).unref?.(); }
    else { console.error('[portail] second fil arrêté trois fois : Lucie reprend le portail'); repli?.(); }
  });
  console.log('[portail] relevé et dépôts dans un second fil');
  return true;
}

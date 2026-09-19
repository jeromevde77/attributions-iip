// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Qui est en train de demander ? (contexte de requête)
//
// « JE VEUX DES TRACES. »
//
// Toute pièce sortie de Lucie doit pouvoir dire qui l'a produite et quand. La
// façon évidente — passer l'utilisateur en paramètre — aurait demandé de
// modifier les quarante et une pièces et tous leurs appels ; on en aurait
// oublié la moitié, et ce sont justement celles-là qui sortiraient sans trace.
// C'est la leçon des trente-trois routes d'attribution dont une seule filtrait
// par section : une règle qui n'est juste que si l'on y pense est une règle
// fausse.
//
// `AsyncLocalStorage` porte donc l'utilisateur pour toute la durée d'une
// requête, à travers les appels de fonctions et les `await`, sans qu'aucune
// signature ne change. Le pied de page le lit et écrit la mention ; une pièce
// nouvelle l'obtient sans que personne ait à y penser — le défaut est correct.
//
// Ce n'est PAS un mécanisme d'autorisation : on ne décide jamais d'un droit
// d'après ce contexte. Les droits se contrôlent sur la porte, avec `req.user`,
// là où ils se lisent.
// ─────────────────────────────────────────────────────────────────────────────

import { AsyncLocalStorage } from 'node:async_hooks';

const stockage = new AsyncLocalStorage();

/**
 * Middleware : ouvre le contexte pour toute la durée de la requête.
 *
 * ON GARDE LA REQUÊTE, PAS L'UTILISATEUR. Ce middleware s'exécute AVANT
 * l'authentification — celle-ci a lieu route par route, plus loin —, si bien
 * que `req.user` n'existe pas encore à cet instant. Copier sa valeur ici
 * aurait figé un `null` pour toute la requête, et toutes les pièces seraient
 * sorties sans nom, sans que rien ne le signale. On conserve donc l'objet
 * `req` lui-même : `authRequired` y écrira `user`, et on le lit au moment où
 * la mention se fabrique.
 */
export function porterContexte(req, res, next) {
  stockage.run({ req, at: new Date() }, () => next());
}

/** L'utilisateur de la requête en cours, ou null hors requête (tâches, tests). */
export function utilisateurCourant() {
  return stockage.getStore()?.req?.user || null;
}

/**
 * LA MENTION DE PRODUCTION, TELLE QU'ELLE S'IMPRIME.
 *
 * « Produit par Charles Sohet le 19/09/2026 à 11:42 ». Elle nomme la personne
 * connectée — pas un service, pas « le système » : c'est quelqu'un qui a
 * cliqué, et c'est ce quelqu'un qui répond de la pièce.
 *
 * Hors requête (une tâche planifiée, un test), on ne fabrique pas un nom : la
 * mention se réduit à la date, ce qui est vrai, plutôt que d'attribuer la
 * pièce à personne en particulier.
 */
export function mentionProduction() {
  const store = stockage.getStore();
  const quand = store?.at || new Date();
  const d = String(quand.getDate()).padStart(2, '0');
  const mo = String(quand.getMonth() + 1).padStart(2, '0');
  const h = String(quand.getHours()).padStart(2, '0');
  const mi = String(quand.getMinutes()).padStart(2, '0');
  const horo = `le ${d}/${mo}/${quand.getFullYear()} à ${h}:${mi}`;
  const u = store?.req?.user;
  const qui = u?.nom || u?.email || null;
  return qui ? `Produit par ${qui} ${horo}` : `Produit ${horo}`;
}

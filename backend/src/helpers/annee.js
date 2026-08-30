// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Année de travail
//
// L'année sur laquelle porte une requête est celle que l'utilisateur a choisie
// dans l'en-tête de Lucie, transmise par l'en-tête HTTP X-Annee. Le repli sur
// annee_scolaire.active ne sert qu'aux appels qui ne la portent pas — tâches
// planifiées, scripts, anciens clients.
//
// Faire cohabiter les deux sources sans hiérarchie provoquait des écarts
// permanents : l'écran annonçait 2026-2027 pendant que le serveur travaillait
// sur 2025-2026.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';

export function anneeActiveEnBase() {
  return db.prepare('SELECT code FROM annee_scolaire WHERE active = 1 LIMIT 1').get()?.code || null;
}

/**
 * @param {object} req  requête Express — req.annee est posé par le middleware
 * @returns {string|null} l'année de travail
 */
export function anneeDeTravail(req) {
  return req?.annee || anneeActiveEnBase();
}

export default anneeDeTravail;

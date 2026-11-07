/**
 * LES EFFECTIFS DE L'ANNÉE — UNE SOURCE, QUATRE CHIFFRES (3.5.196, Charles, 7 novembre 2026 : « 901 dans Gestion, 899 dans
 * Étudiants, cela ne va pas ! Il faut deux règles : le compte au 15/10 — la référence de l'année, qui reste fixe —, la règle au
 * 1er dixième et au 5e dixième ; puis les étudiants encore en parcours, ceux qui sont encore dans l'établissement »).
 * Tranché : le 15/10 se GÈLE seul à partir de 2027-2028 (cette année il est reconstruit, indicatif) ; au 1/10 et au 5/10, on
 * ne compte QUE les réguliers ; « en parcours » = non archivé, non sorti, et au moins une UE de l'année encore ouverte (à suivre,
 * ou ajournée en attente de la seconde session) — celui dont toutes les UE sont retirées, réussies ou refusées n'y est plus.
 *
 * Gestion (Population) et la liste des étudiants lisent CE fichier : deux écrans, un chiffre.
 */
import db from '../db/index.js';
import { presencesDeLUE, uesAvecHoraire } from './regularite.js';

const PREMIERE_ANNEE_GELEE = '2027-2028';
const cleGel = annee => `effectif_15_10|${annee}`;
const jour = () => new Date().toISOString().slice(0, 10);

/** Les étudiants encore en parcours : ids. */
export function idsEnParcours(annee) {
  return db.prepare(`SELECT DISTINCT i.etudiant_id AS id FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND COALESCE(e.actif, 1) = 1 AND COALESCE(e.sortie_statut, '') NOT IN ('archive', 'sorti')
      AND (i.resultat IS NULL OR i.resultat = '' OR i.resultat = 'ajourne')`).all(annee).map(x => x.id);
}

/** Les inscrits au 15/10 : reconstruits (inscription datée au plus tard le 15/10, non archivé). */
function reconstruire15Oct(annee) {
  const date = `${String(annee).slice(0, 4)}-10-15`;
  const l = db.prepare(`SELECT DISTINCT i.etudiant_id AS id FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND COALESCE(e.sortie_statut, '') <> 'archive'
      AND COALESCE(NULLIF(i.date_inscription, ''), substr(i.cree_le, 1, 10), ?) <= ?`).all(annee, date, date);
  return { total: l.length, date };
}

/** Le 15/10 de l'année : gelé s'il l'a été, sinon reconstruit (indicatif). */
export function au15Octobre(annee) {
  const g = db.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(cleGel(annee));
  if (g) { try { return { ...JSON.parse(g.valeur), fige: true }; } catch { /* */ } }
  return { ...reconstruire15Oct(annee), fige: false, indicatif: true };
}

/** Le gel du 15/10, posé une fois, dès le 15/10 passé, à partir de 2027-2028. Appelé au démarrage et chaque heure. */
export function gelerSiTemps(annee) {
  if (!annee || annee < PREMIERE_ANNEE_GELEE) return null;
  const date = `${String(annee).slice(0, 4)}-10-15`;
  if (jour() < date) return null;
  if (db.prepare('SELECT 1 FROM lucie_config WHERE cle = ?').get(cleGel(annee))) return null;
  const v = { ...reconstruire15Oct(annee), gele_le: new Date().toISOString() };
  db.prepare('INSERT OR IGNORE INTO lucie_config (cle, valeur) VALUES (?, ?)').run(cleGel(annee), JSON.stringify(v));
  return v;
}

/** Les réguliers au 1/10 et au 5/10 : étudiants réguliers (R) dans au moins une UE dont le jalon est passé, chacun une fois. */
let cacheReg = { cle: null, le: 0, v: null };
export function reguliers(annee) {
  if (cacheReg.cle === annee && Date.now() - cacheReg.le < 10 * 60 * 1000) return cacheReg.v;
  const r10 = new Set(), r50 = new Set();
  let ues = 0, atteintes10 = 0, atteintes50 = 0;
  for (const u of uesAvecHoraire(annee)) {
    let x; try { x = presencesDeLUE(u.ue_num, annee); } catch { continue; }
    ues++;
    const a10 = x.jalons[10] && x.jalons[10] <= jour(), a50 = x.jalons[50] && x.jalons[50] <= jour();
    if (a10) atteintes10++; if (a50) atteintes50++;
    for (const l of x.g.lignes) {
      if (a10 && l.regularite['10']?.valeur === 'R') r10.add(l.etudiant.id);
      if (a50 && l.regularite['50']?.valeur === 'R') r50.add(l.etudiant.id);
    }
  }
  const v = { au10: { total: r10.size, ues_atteintes: atteintes10, ues }, au50: { total: r50.size, ues_atteintes: atteintes50, ues } };
  cacheReg = { cle: annee, le: Date.now(), v };
  return v;
}

/** Les quatre chiffres, et l'écart avec les inscrits non archivés (ce que Gestion comptait). */
export function effectifsAnnee(annee, { avecReguliers = true } = {}) {
  const parcours = idsEnParcours(annee).length;
  const inscrits = db.prepare(`SELECT COUNT(DISTINCT i.etudiant_id) n FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND COALESCE(e.sortie_statut, '') <> 'archive'`).get(annee).n;
  const sortis = db.prepare(`SELECT COUNT(DISTINCT i.etudiant_id) n FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND e.sortie_statut = 'sorti'`).get(annee).n;
  return { annee, au_15_10: au15Octobre(annee), ...(avecReguliers ? reguliers(annee) : {}), en_parcours: parcours, inscrits, sortis };
}

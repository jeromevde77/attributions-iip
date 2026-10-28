/**
 * LE CARNET DE COTES DU PROFESSEUR (Charles, 28 octobre 2026 : « rendre Lucie
 * intéressante pour les profs : gagner du temps, encoder des notes — des tests
 * par exemple »).
 *
 * Mes cours ne connaissait que la NOTE PAR ACQUIS qu'on propose au Conseil ; les
 * tests, interrogations et travaux qui y mènent vivaient dans l'Excel de chacun.
 * Le carnet les accueille : une évaluation par colonne (intitulé, date, sur
 * combien, poids), des points par étudiant — décimales admises, comme sur une
 * copie.
 *
 * DEUX USAGES, ET LE PROFESSEUR CHOISIT ÉVALUATION PAR ÉVALUATION (la question
 * n'est pas tranchée : on ne force ni l'un ni l'autre).
 *   - rattachée à un ou plusieurs ACQUIS : Lucie calcule une PROPOSITION de note
 *     par acquis, que le professeur reprend d'un clic dans sa feuille de notes ;
 *   - sans rattachement : elle reste un repère personnel.
 * RIEN NE S'ÉCRIT D'OFFICE dans la feuille : la reprise remplit les cases, le
 * professeur relit, justifie ce qui est sous 10 et enregistre — la porte reste
 * `POST /mes-cours/:cours/notes`, avec ses contrôles.
 *
 * Le calcul suit le modèle de la maison : une moyenne pondérée (poids de
 * l'évaluation × poids du lien à l'acquis), ramenée sur 20 ; une évaluation non
 * passée (vide, ou PP · NP · CM) SORT DU DÉNOMINATEUR — elle ne vaut pas zéro ; la
 * proposition s'arrondit à l'unité, comme la feuille l'exige.
 */
import db from '../db/index.js';

export const MENTIONS_CARNET = { PP: 'pas présenté', NP: 'note de présence', CM: 'certificat médical' };

export function migrerCarnet(base = db) {
  base.exec(`
    CREATE TABLE IF NOT EXISTS carnet_evaluation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      annee_scolaire TEXT NOT NULL,
      cours_code TEXT NOT NULL,
      ue_num INTEGER,
      intitule TEXT NOT NULL,
      date TEXT,
      sur REAL NOT NULL DEFAULT 20,
      poids REAL NOT NULL DEFAULT 1,
      session INTEGER NOT NULL DEFAULT 1,
      ordre INTEGER NOT NULL DEFAULT 0,
      cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')),
      modifie_par TEXT, modifie_le TEXT);
    CREATE INDEX IF NOT EXISTS idx_carnet_eval ON carnet_evaluation(annee_scolaire, cours_code);
    CREATE TABLE IF NOT EXISTS carnet_evaluation_aa (
      evaluation_id INTEGER NOT NULL REFERENCES carnet_evaluation(id) ON DELETE CASCADE,
      aa_code TEXT NOT NULL,
      poids REAL NOT NULL DEFAULT 1,
      PRIMARY KEY (evaluation_id, aa_code));
    CREATE TABLE IF NOT EXISTS carnet_note (
      evaluation_id INTEGER NOT NULL REFERENCES carnet_evaluation(id) ON DELETE CASCADE,
      etudiant_id INTEGER NOT NULL,
      points REAL,
      mention TEXT,
      saisi_par TEXT, saisi_le TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (evaluation_id, etudiant_id));
  `);
}

/** Une saisie de cellule : « 12,5 », « 12.5 », « PP », vide. Rend { points, mention } ou { erreur }. */
export function lireValeur(brut, sur) {
  const s = String(brut ?? '').trim().toUpperCase();
  if (!s) return { points: null, mention: null };
  if (MENTIONS_CARNET[s]) return { points: null, mention: s };
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(s)) return { erreur: `« ${brut} » n’est ni des points ni une mention (PP, NP, CM).` };
  const n = Number(s.replace(',', '.'));
  if (n > sur) return { erreur: `${String(n).replace('.', ',')} dépasse le maximum (${String(sur).replace('.', ',')}).` };
  return { points: n, mention: null };
}

/**
 * LA PROPOSITION PAR ACQUIS — fonction pure.
 * `evaluations` : [{ id, sur, poids, session, aa: [{ aa_code, poids }] }]
 * `notes`       : Map evaluation_id → Map etudiant_id → { points, mention }
 * `acquis`      : les codes d'acquis du cours ([] : le cours se note en entier, clé '').
 * Rend Map etudiant_id → { [aa_code]: { note, sur20, nb } } pour la session demandée,
 * et `moyenne` (toutes évaluations, pondérées, une décimale) — repère du carnet.
 */
export function propositions({ evaluations, notes, acquis, etudiants, session = 1 }) {
  const evs = evaluations.filter(e => (e.session || 1) === session);
  const cles = acquis.length ? acquis : [''];
  const sortie = new Map();
  for (const etu of etudiants) {
    const par = {};
    for (const aa of cles) {
      let num = 0, den = 0, nb = 0;
      for (const e of evs) {
        const lien = aa ? (e.aa || []).find(x => x.aa_code === aa) : { poids: 1 };
        if (!lien) continue;
        const n = notes.get(e.id)?.get(etu);
        if (n?.points == null || !(e.sur > 0)) continue;
        const w = (Number(e.poids) || 0) * (Number(lien.poids) || 0);
        if (!(w > 0)) continue;
        num += (n.points / e.sur) * 20 * w; den += w; nb++;
      }
      if (den > 0) {
        const sur20 = num / den;
        // Arrondi à l'unité, comme la feuille (9,5 → 10 : la règle de la maison).
        par[aa] = { note: Math.min(20, Math.max(0, Math.round(sur20 + 1e-9))), sur20: Math.round(sur20 * 10) / 10, nb };
      }
    }
    let num = 0, den = 0;
    for (const e of evs) {
      const n = notes.get(e.id)?.get(etu);
      if (n?.points == null || !(e.sur > 0) || !(Number(e.poids) > 0)) continue;
      num += (n.points / e.sur) * 20 * Number(e.poids); den += Number(e.poids);
    }
    sortie.set(etu, { aa: par, moyenne: den > 0 ? Math.round((num / den) * 10) / 10 : null });
  }
  return sortie;
}

/** Les évaluations d'un cours, avec leurs acquis. */
export function evaluationsDuCours(coursCode, annee) {
  const evs = db.prepare(`SELECT * FROM carnet_evaluation WHERE annee_scolaire = ? AND cours_code = ?
    ORDER BY session, COALESCE(date, '9999'), ordre, id`).all(annee, coursCode);
  const liens = db.prepare('SELECT aa_code, poids FROM carnet_evaluation_aa WHERE evaluation_id = ? ORDER BY aa_code');
  return evs.map(e => ({ ...e, aa: liens.all(e.id) }));
}

/** Les notes du carnet : Map evaluation_id → Map etudiant_id → { points, mention }. */
export function notesDuCarnet(evaluations) {
  const m = new Map(evaluations.map(e => [e.id, new Map()]));
  if (!evaluations.length) return m;
  const ids = evaluations.map(e => e.id);
  for (const n of db.prepare(`SELECT evaluation_id, etudiant_id, points, mention FROM carnet_note
      WHERE evaluation_id IN (${ids.map(() => '?').join(',')})`).all(...ids)) {
    m.get(n.evaluation_id).set(n.etudiant_id, { points: n.points, mention: n.mention });
  }
  return m;
}

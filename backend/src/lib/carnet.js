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
    -- UNE NOTE PAR ACQUIS (3.5.078, Charles : « l'écrit et l'oral de l'épreuve intégrée sont obtenus par les AA liés » ;
    -- tranché : le carnet tel qu'il existe, une note par acquis). Une évaluation « par acquis » se note acquis par acquis ;
    -- sa note d'ensemble (carnet_note) en est la moyenne pondérée par le poids de chaque lien, recalculée à chaque saisie.
    CREATE TABLE IF NOT EXISTS carnet_note_aa (
      evaluation_id INTEGER NOT NULL REFERENCES carnet_evaluation(id) ON DELETE CASCADE,
      etudiant_id INTEGER NOT NULL,
      aa_code TEXT NOT NULL,
      points REAL,
      mention TEXT,
      saisi_par TEXT, saisi_le TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (evaluation_id, etudiant_id, aa_code));
  `);
  try { base.exec('ALTER TABLE carnet_evaluation ADD COLUMN par_acquis INTEGER NOT NULL DEFAULT 0'); } catch { /* déjà là */ }
  /* LE PLAN D'ÉVALUATION (3.5.189, Charles : « un outil Gérer mon évaluation qui, sur base de la DUE, permet de paramétrer les
     évaluations — évaluation continue, si cela s'additionne, si chaque évaluation a un poids » ; tranché : au choix du
     professeur, il propose la note par acquis, réglé par les titulaires, il part de la DUE et la nourrit). Un plan par cours,
     année et session ; chaque évaluation porte sa NATURE (les modalités de la DUE) et son RÔLE (continu ou examen). */
  base.exec(`CREATE TABLE IF NOT EXISTS carnet_plan (
      annee_scolaire TEXT NOT NULL, cours_code TEXT NOT NULL, session INTEGER NOT NULL DEFAULT 1,
      mode TEXT NOT NULL DEFAULT 'pondere', part_continue REAL NOT NULL DEFAULT 40,
      maj_par TEXT, maj_le TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (annee_scolaire, cours_code, session))`);
  try { base.exec('ALTER TABLE carnet_evaluation ADD COLUMN nature TEXT'); } catch { /* déjà là */ }
  try { base.exec('ALTER TABLE carnet_evaluation ADD COLUMN role TEXT'); } catch { /* déjà là */ }
}

export const MODES_PLAN = {
  pondere: 'Moyenne pondérée — chaque évaluation a son poids',
  somme: 'Addition des points — tout se rapporte au total des maximums',
  continu_examen: 'Évaluation continue + examen — une part pour chacun',
};
// Les natures sont celles des modalités de la DUE (EPREUVES de pages/DUE.jsx) : une seule liste.
export const NATURES = { ecrit: 'Écrit', oral: 'Oral', pratique: 'Pratique', travail: 'Travail individuel', travail_groupe: 'Travail de groupe', continue: 'Év. continue' };

/** Le plan d'un cours pour une session (défaut : moyenne pondérée). */
export function planDuCours(coursCode, annee, session = 1) {
  const p = db.prepare('SELECT * FROM carnet_plan WHERE annee_scolaire = ? AND cours_code = ? AND session = ?').get(annee, coursCode, session);
  return p ? { mode: MODES_PLAN[p.mode] ? p.mode : 'pondere', part_continue: Number(p.part_continue) || 0, maj_par: p.maj_par, maj_le: p.maj_le, regle: true }
    : { mode: 'pondere', part_continue: 40, regle: false };
}

/** Les notes par acquis : Map evaluation_id → Map etudiant_id → { [aa_code]: { points, mention } }. */
export function notesParAcquis(evaluations) {
  const m = new Map();
  const ids = evaluations.filter(e => e.par_acquis).map(e => e.id);
  if (!ids.length) return m;
  for (const n of db.prepare(`SELECT evaluation_id, etudiant_id, aa_code, points, mention FROM carnet_note_aa
      WHERE evaluation_id IN (${ids.map(() => '?').join(',')})`).all(...ids)) {
    if (!m.has(n.evaluation_id)) m.set(n.evaluation_id, new Map());
    const e = m.get(n.evaluation_id);
    if (!e.has(n.etudiant_id)) e.set(n.etudiant_id, {});
    e.get(n.etudiant_id)[n.aa_code] = { points: n.points, mention: n.mention };
  }
  return m;
}

/** La note d'ensemble d'une évaluation par acquis : la moyenne de ses acquis notés, pondérée par le poids des liens,
 *  dans l'échelle de l'évaluation. Sans aucun point, la première mention (PP, NP, CM) ; rien du tout : null. */
export function noteDEnsemble(ev, parAA) {
  let num = 0, den = 0, mention = null;
  for (const l of ev.aa || []) {
    const n = parAA?.[l.aa_code];
    if (n?.points != null) { const w = Number(l.poids) || 0; num += n.points * w; den += w; }
    else if (n?.mention && !mention) mention = n.mention;
  }
  if (den > 0) return { points: Math.round((num / den) * 100) / 100, mention: null };
  return mention ? { points: null, mention } : null;
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
export function propositions({ evaluations, notes, acquis, etudiants, session = 1, notesAA = new Map(), plan = null }) {
  const mode = plan?.mode || 'pondere';
  const pc = Math.min(100, Math.max(0, Number(plan?.part_continue ?? 40))) / 100;
  const evs = evaluations.filter(e => (e.session || 1) === session);
  const cles = acquis.length ? acquis : [''];
  const sortie = new Map();
  for (const etu of etudiants) {
    const par = {};
    for (const aa of cles) {
      // Trois façons de compter (le plan) : pondérée (poids de l'évaluation × poids du lien), addition (points sur total des
      // maximums, au poids du lien), continu + examen (deux moyennes pondérées, mêlées selon la part du continu).
      const acc = { t: [0, 0], c: [0, 0], x: [0, 0] }; let nb = 0;
      for (const e of evs) {
        const lien = aa ? (e.aa || []).find(x => x.aa_code === aa) : { poids: 1 };
        if (!lien) continue;
        // Une évaluation par acquis donne À CHAQUE ACQUIS sa propre note ; les autres, la même note à tous.
        const n = e.par_acquis && aa ? notesAA.get(e.id)?.get(etu)?.[aa] : notes.get(e.id)?.get(etu);
        if (n?.points == null || !(e.sur > 0)) continue;
        const wl = Number(lien.poids) || 0;
        if (mode === 'somme') {
          if (!(wl > 0)) continue;
          acc.t[0] += n.points * wl; acc.t[1] += e.sur * wl; nb++; continue;
        }
        const w = (Number(e.poids) || 0) * wl;
        if (!(w > 0)) continue;
        const k = mode === 'continu_examen' ? (e.role === 'continue' || e.nature === 'continue' ? 'c' : 'x') : 't';
        acc[k][0] += (n.points / e.sur) * 20 * w; acc[k][1] += w; nb++;
      }
      let sur20 = null;
      if (mode === 'somme') sur20 = acc.t[1] > 0 ? (acc.t[0] / acc.t[1]) * 20 : null;
      else if (mode === 'continu_examen') {
        const c = acc.c[1] > 0 ? acc.c[0] / acc.c[1] : null, x = acc.x[1] > 0 ? acc.x[0] / acc.x[1] : null;
        sur20 = c != null && x != null ? c * pc + x * (1 - pc) : (c ?? x);
      } else sur20 = acc.t[1] > 0 ? acc.t[0] / acc.t[1] : null;
      if (sur20 != null) {
        // Arrondi à l'unité, comme la feuille (9,5 → 10 : la règle de la maison).
        par[aa] = { note: Math.min(20, Math.max(0, Math.round(sur20 + 1e-9))), sur20: Math.round(sur20 * 10) / 10, nb };
      }
    }
    // La moyenne du carnet suit le même plan (toutes les évaluations, sans les liens).
    const m = { t: [0, 0], c: [0, 0], x: [0, 0] };
    for (const e of evs) {
      const n = notes.get(e.id)?.get(etu);
      if (n?.points == null || !(e.sur > 0)) continue;
      if (mode === 'somme') { m.t[0] += n.points; m.t[1] += e.sur; continue; }
      if (!(Number(e.poids) > 0)) continue;
      const k = mode === 'continu_examen' ? (e.role === 'continue' || e.nature === 'continue' ? 'c' : 'x') : 't';
      m[k][0] += (n.points / e.sur) * 20 * Number(e.poids); m[k][1] += Number(e.poids);
    }
    let moy = null;
    if (mode === 'somme') moy = m.t[1] > 0 ? (m.t[0] / m.t[1]) * 20 : null;
    else if (mode === 'continu_examen') {
      const c = m.c[1] > 0 ? m.c[0] / m.c[1] : null, x = m.x[1] > 0 ? m.x[0] / m.x[1] : null;
      moy = c != null && x != null ? c * pc + x * (1 - pc) : (c ?? x);
    } else moy = m.t[1] > 0 ? m.t[0] / m.t[1] : null;
    sortie.set(etu, { aa: par, moyenne: moy != null ? Math.round(moy * 10) / 10 : null });
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

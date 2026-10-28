/**
 * LA RÉGULARITÉ AU PREMIER ET AU CINQUIÈME DIXIÈME (Charles, 28 octobre 2026 :
 * « une colonne pour la régularité ; présent de manière régulière (60 %) : R sur
 * fond vert, sinon IR ; en cliquant, on inverse le badge »).
 *
 * C'est une INDICATION POUR LA VÉRIFICATION, pas une décision : la vérificatrice
 * constate la régularité aux jalons de l'UE, et la direction apprécie les motifs
 * (RGE du supérieur de promotion sociale, art. 6 § 3). D'où :
 *   - le calcul : présences + absences justifiées ≥ 60 % des heures DUES ET
 *     ENCODÉES des séances tenues jusqu'au jalon inclus (les activités dispensées
 *     sortent du compte, comme dans la grille) ; une séance non encodée ne pèse
 *     ni pour ni contre, elle est signalée ;
 *   - les jalons : 1/10 et 5/10 de l'écart entre la première et la dernière
 *     séance de l'UE, séance la plus proche — la méthode de la grille ;
 *   - l'inversion : un clic, sans motif (Charles : « si je change, cela doit être
 *     léger »). Lucie garde discrètement qui a inversé et quand ; revenir au calcul
 *     efface la marque.
 */
import db from '../db/index.js';
import { grilleUE } from './grillePresence.js';
import { jalonDesSeances } from './datesReelles.js';
import { minutesDe } from './cep.js';

export const SEUIL_REGULARITE = 0.6;
export const JALONS = { 10: '1er dixième', 50: '5e dixième' };

export function migrerRegularite(base = db) {
  base.exec(`CREATE TABLE IF NOT EXISTS regularite_marque (
    annee_scolaire TEXT NOT NULL, ue_num INTEGER NOT NULL, etudiant_id INTEGER NOT NULL,
    jalon INTEGER NOT NULL, valeur TEXT NOT NULL CHECK (valeur IN ('R','IR')),
    par TEXT, le TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (annee_scolaire, ue_num, etudiant_id, jalon))`);
}

/** Les jalons de l'UE, dans l'horaire réel : { 10: 'AAAA-MM-JJ', 50: … } (null sans séance). */
export function jalonsDeLUE(seances) {
  const dates = seances.filter(s => !s.annule).map(s => s.date);
  return { 10: jalonDesSeances(dates, 10), 50: jalonDesSeances(dates, 50) };
}

/**
 * Le calcul d'une ligne de grille à un jalon : { taux, du, compte, non_encodees, calcule }.
 * `g` : la grille (donneesGrille) ; `ligne` : une de ses lignes.
 */
export function regulariteAuJalon(g, ligne, jalon, aujourdhui = new Date().toISOString().slice(0, 10)) {
  if (!jalon) return { taux: null, calcule: null, du: 0, compte: 0, non_encodees: 0 };
  let du = 0, compte = 0, non = 0;
  g.seances.forEach((s, i) => {
    if (s.annule || s.date > jalon || s.date > aujourdhui) return;
    const c = ligne.cases[i];
    if (!c || c.statut === 'dispense' || c.statut === 'non_concerne') return;
    if (!c.statut) { non++; return; }
    const m = minutesDe(s);
    du += m;
    if (c.statut === 'present' || c.statut === 'justifie') compte += m;
  });
  const taux = du ? compte / du : null;
  return { taux, du, compte, non_encodees: non, calcule: taux == null ? null : (taux >= SEUIL_REGULARITE ? 'R' : 'IR') };
}

/** La grille de l'UE, enrichie de la régularité à chaque jalon (calcul + marque manuelle). */
export function presencesDeLUE(ueNum, annee) {
  const { g, opts } = grilleUE(Number(ueNum), annee);
  const jalons = jalonsDeLUE(g.seances);
  const marques = new Map(db.prepare('SELECT etudiant_id, jalon, valeur, par, le FROM regularite_marque WHERE annee_scolaire = ? AND ue_num = ?')
    .all(annee, Number(ueNum)).map(m => [`${m.etudiant_id}|${m.jalon}`, m]));
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const lignes = g.lignes.map(l => {
    const regularite = {};
    for (const j of Object.keys(JALONS)) {
      const r = regulariteAuJalon(g, l, jalons[j], aujourdhui);
      const m = marques.get(`${l.etudiant.id}|${j}`);
      const atteint = !!jalons[j] && jalons[j] <= aujourdhui;
      regularite[j] = { ...r, taux: r.taux == null ? null : Math.round(r.taux * 1000) / 10, atteint,
        valeur: m?.valeur || r.calcule, marque: m ? { par: m.par, le: m.le } : null };
    }
    return { ...l, regularite };
  });
  return { g: { ...g, lignes }, opts, jalons, seuil: SEUIL_REGULARITE };
}

/** Inverser le badge : la valeur voulue ; égale au calcul, la marque s'efface. */
export function marquerRegularite(ueNum, annee, etudiantId, jalon, valeur, par) {
  if (!JALONS[jalon]) return { erreur: 'Jalon inconnu (10 ou 50).' };
  if (!['R', 'IR'].includes(valeur)) return { erreur: 'R ou IR.' };
  const x = presencesDeLUE(ueNum, annee);
  const l = x.g.lignes.find(y => y.etudiant.id === Number(etudiantId));
  if (!l) return { erreur: 'Cet étudiant n’est pas inscrit à cette UE.' };
  const calcule = l.regularite[jalon].calcule;
  if (valeur === calcule) {
    db.prepare('DELETE FROM regularite_marque WHERE annee_scolaire = ? AND ue_num = ? AND etudiant_id = ? AND jalon = ?').run(annee, Number(ueNum), Number(etudiantId), Number(jalon));
  } else {
    db.prepare(`INSERT INTO regularite_marque (annee_scolaire, ue_num, etudiant_id, jalon, valeur, par) VALUES (?,?,?,?,?,?)
      ON CONFLICT (annee_scolaire, ue_num, etudiant_id, jalon) DO UPDATE SET valeur = excluded.valeur, par = excluded.par, le = datetime('now')`)
      .run(annee, Number(ueNum), Number(etudiantId), Number(jalon), valeur, par);
  }
  return { ok: true, valeur, calcule, marque: valeur !== calcule };
}

/** Les UE de l'année qui ont des séances à l'horaire, avec leur nom et leurs inscrits. */
export function uesAvecHoraire(annee) {
  return db.prepare(`SELECT x.ue AS ue_num,
      (SELECT MIN(u.ue_nom) FROM ue u WHERE u.ue_num = x.ue AND u.annee_scolaire = ?) AS ue_nom,
      (SELECT GROUP_CONCAT(DISTINCT u.section) FROM ue u WHERE u.ue_num = x.ue AND u.annee_scolaire = ?) AS sections,
      (SELECT COUNT(DISTINCT i.etudiant_id) FROM etudiant_inscription i WHERE i.ue_num = x.ue AND i.annee_scolaire = ?) AS inscrits,
      x.n AS seances
    FROM (SELECT COALESCE(s.ue_num, c.ue_num) AS ue, COUNT(*) n FROM horaire_seance s
      LEFT JOIN cours c ON c.cours_code = s.cours_code AND c.annee_scolaire = s.annee_scolaire
      WHERE s.annee_scolaire = ? AND COALESCE(s.annule, 0) = 0 AND COALESCE(s.ue_num, c.ue_num) IS NOT NULL GROUP BY 1) x
    ORDER BY x.ue`).all(annee, annee, annee, annee);
}

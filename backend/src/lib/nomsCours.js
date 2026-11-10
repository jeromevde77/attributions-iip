/**
 * LE NOM D'UN COURS SE CORRIGE DEPUIS L'ÉTAPE 0 DE L'UNITÉ (3.5.297, Charles, 10 novembre 2026 : « il faut pouvoir proposer aussi
 * le nom du cours ; cela changera le référentiel en dur SI la direction valide ; sinon, cela reste pour l'année en cours »).
 *
 * Proposé par la coordination : le nom vaut tout de suite pour l'ANNÉE de travail (la ligne `cours` de l'année), et la demande
 * part au registre ; acceptée, il vaut pour l'année et les SUIVANTES. Corrigé par la direction : année et suivantes d'emblée.
 *
 * Le programme du dossier pédagogique se découpe par les intitulés des cours : le titre du cours y est renommé avec lui, ligne
 * de titre par ligne de titre (une ligne qui ne porte que l'ancien nom, numérotation et « # » permis), jamais dans le texte courant.
 */
import db from '../db/index.js';

const echapper = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renomme le titre du cours dans un texte de dossier : seulement les lignes qui ne portent que lui. */
export function renommerDansDossier(texte, ancien, nouveau) {
  if (!texte || !ancien || ancien === nouveau) return texte;
  const re = new RegExp(`^(\\s*(?:#{1,6}\\s*)?(?:[\\d.]+\\s*[-–.)]?\\s*)?)${echapper(ancien.trim())}(\\s*[:.]?\\s*)$`, 'gmi');
  return String(texte).replace(re, (_, avant, apres) => `${avant}${nouveau}${apres}`);
}

/** Applique le nom : `annee` seule, ou `annee` et les suivantes. Rend le nombre de lignes de cours touchées. */
export function appliquerNomCours(code, nouveau, annee, { suivantes = false } = {}) {
  const lignes = db.prepare(`SELECT cours_code, annee_scolaire, ue_num, cours_nom FROM cours
    WHERE cours_code = ? AND ${suivantes ? 'annee_scolaire >= ?' : 'annee_scolaire = ?'}`).all(code, annee);
  const majCours = db.prepare('UPDATE cours SET cours_nom = ? WHERE cours_code = ? AND annee_scolaire = ?');
  const lireUE = db.prepare('SELECT ue_dp FROM ue WHERE ue_num = ? AND annee_scolaire = ?');
  const majUE = db.prepare(`UPDATE ue SET ue_dp = ?, ue_dp_origine = COALESCE(ue_dp_origine, ?) WHERE ue_num = ? AND annee_scolaire = ?`);
  let n = 0;
  db.transaction(() => {
    for (const l of lignes) {
      if (l.cours_nom === nouveau) continue;
      majCours.run(nouveau, l.cours_code, l.annee_scolaire); n++;
      const u = lireUE.get(l.ue_num, l.annee_scolaire);
      if (u?.ue_dp) {
        const t = renommerDansDossier(u.ue_dp, l.cours_nom || '', nouveau);
        if (t !== u.ue_dp) majUE.run(t, u.ue_dp, l.ue_num, l.annee_scolaire);
      }
    }
  })();
  return n;
}

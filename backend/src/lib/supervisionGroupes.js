/* QUI SUPERVISE UN GROUPE DU TRONC COMMUN (3.5.109, Charles, 4 novembre 2026 : « cocher dans les attributions quel groupe est
 * sous la supervision de quelle coordination pour le TC » ; tranché : une étiquette et des rappels, posée par la direction et le
 * secrétariat sur le groupe de la répartition et les attributions liées ; les rappels vont à cette coordination EN PLUS de
 * celle de la section). `attribution.coordination_section` porte la section dont la coordination supervise la ligne ; vide =
 * rien de plus que la section de la ligne. Ni droit d'accès, ni comptage : une étiquette, et ceux qu'elle prévient. */
import db from '../db/index.js';

let pret = false;
export function migrerSupervision() {
  if (pret) return;
  try { db.exec('ALTER TABLE attribution ADD COLUMN coordination_section TEXT'); } catch { /* déjà là */ }
  pret = true;
}

/** Les sections dont la coordination supervise au moins une ligne qui répond aux critères (null = critère ignoré). */
export function sectionsSupervisant({ annee, ueNum = null, org = null, coursCodes = null, profId = null }) {
  migrerSupervision();
  const w = ['annee_scolaire = ?', "COALESCE(coordination_section, '') <> ''"], p = [annee];
  if (ueNum != null) { w.push('ue_num = ?'); p.push(ueNum); }
  if (org) { w.push('COALESCE(num_organisation, 1) = ?'); p.push(org); }
  if (profId != null) { w.push('professeur_id = ?'); p.push(profId); }
  if (coursCodes) {
    if (!coursCodes.length) return [];
    w.push(`code_cours IN (${coursCodes.map(() => '?').join(',')})`); p.push(...coursCodes);
  }
  return db.prepare(`SELECT DISTINCT coordination_section s FROM attribution WHERE ${w.join(' AND ')}`).all(...p).map(x => x.s);
}

/** Poser la supervision : la direction et le secrétariat, personne d'autre (une coordination ne s'attribue pas un groupe). */
export const peutPoserSupervision = user => ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'].includes(user?.role);

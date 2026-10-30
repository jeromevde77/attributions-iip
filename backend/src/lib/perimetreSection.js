// ─────────────────────────────────────────────────────────────────────────────
// QUI EST BORNÉ À SES SECTIONS (3.1.481, Charles, 30 octobre 2026, en aperçu comme Natacha Boulengier,
// coordination : « elle voit des choses du TIM »). La direction, le secrétariat, l'administrateur et l'éditeur
// voient toute l'école ; les autres, leurs sections (`utilisateur_section`, ou « toutes » si le compte le dit).
// Une ÉCHÉANCE appartient à la section de l'unité dont elle vient (`source_type = 'organisation_ue'`) ; une
// échéance qui ne vient d'aucune unité (une obligation de l'école) n'a pas de section et reste visible de tous.
// ─────────────────────────────────────────────────────────────────────────────
import { getUserSections } from '../middleware/auth.js';

const VOIT_TOUT = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];

/** null = toute l'école ; sinon la liste de ses sections (éventuellement vide). */
export function sectionsRestreintes(user) {
  if (!user || VOIT_TOUT.includes(user.role)) return null;
  const s = getUserSections(user);
  return Array.isArray(s) ? s : null;
}

/** L'expression SQL de la section d'une échéance `alias`. */
// À défaut de l'organisation (supprimée depuis), la section se lit dans l'intitulé que le moteur a écrit :
// « UE 246 — TIM » (services/echeancier.js).
export const sectionEcheanceSql = (alias = 'e') => `COALESCE((SELECT o.section FROM organisation_ue o
  WHERE ${alias}.source_type = 'organisation_ue' AND o.id = ${alias}.source_id),
  (SELECT o.section FROM deliberation_seance s JOIN organisation_ue o ON o.ue_num = s.ue_num AND o.annee_scolaire = s.annee_scolaire
     AND (s.num_organisation = 0 OR o.num_organisation = s.num_organisation)
   WHERE ${alias}.source_type = 'deliberation_seance' AND s.id = ${alias}.source_id ORDER BY o.num_organisation LIMIT 1),
  CASE WHEN ${alias}.source_type = 'organisation_ue' AND ${alias}.libelle_override LIKE 'UE % — %'
    THEN substr(${alias}.libelle_override, instr(${alias}.libelle_override, ' — ') + 3) END)`;

/** Clause « cette échéance est dans mon périmètre » ({ sql: ' AND …', p }) — vide pour qui voit tout. */
export function clauseEcheance(user, alias = 'e') {
  const secs = sectionsRestreintes(user);
  if (!secs) return { sql: '', p: [] };
  const expr = sectionEcheanceSql(alias);
  return secs.length
    ? { sql: ` AND (${expr} IS NULL OR ${expr} IN (${secs.map(() => '?').join(',')}))`, p: secs }
    : { sql: ` AND ${expr} IS NULL`, p: [] };
}

/** Une notification portant une section est-elle pour cet utilisateur ? */
export function notificationVisible(user, section) {
  const secs = sectionsRestreintes(user);
  return !secs || !section || secs.includes(section);
}

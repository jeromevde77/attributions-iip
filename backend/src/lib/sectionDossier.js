// ─────────────────────────────────────────────────────────────────────────────
// Lucie — La section d'un dossier : celle de l'étudiant, ou celle de l'unité
//
// (Charles, 30 septembre 2026, orthoptie.) Le tronc commun d'Optométrie est
// suivi par les étudiants de deux sections, dans une seule organisation : les
// UE y sont déclarées en Optométrie, mais un orthoptiste reste un orthoptiste.
// Beaucoup d'endroits prenaient la section de l'UE — l'attestation d'un
// orthoptiste aurait dit « Optométrie ».
//
// LA RÈGLE, UNE FOIS : la section d'un dossier est celle de l'ÉTUDIANT quand
// l'unité lui est rattachée (ue_section) ou qu'elle est « hors cursus » ;
// sinon, celle de l'unité. C'est le mécanisme du hors cursus (2.11.1),
// étendu aux unités rattachées.
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';

export function sectionDuDossier(etudId, ueNum, annee) {
  const ue = db.prepare(`SELECT section, COALESCE(hors_cursus, 0) AS hc FROM ue WHERE ue_num = ?
      ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1`).get(Number(ueNum), annee) || {};
  if (!etudId) return ue.section || null;
  const rat = db.prepare('SELECT section_rattachement s FROM etudiant WHERE id = ?').get(Number(etudId))?.s || null;
  if (!rat || rat === ue.section) return ue.section || rat || null;
  if (ue.hc) return rat;
  try {
    const lie = db.prepare('SELECT 1 FROM ue_section WHERE ue_num = ? AND section_code = ? AND (annee_scolaire = ? OR ? IS NULL) LIMIT 1')
      .get(Number(ueNum), rat, annee || null, annee || null);
    if (lie) return rat;
  } catch { /* table absente */ }
  return ue.section || null;
}

/**
 * QUI SONT LES ÉTUDIANTS D'UN COURS, POUR UN PROFESSEUR.
 *
 * Sortis de `routes/mesCours.js` (28 octobre 2026) pour que Mes cours et la
 * prise de présence par QR lisent la MÊME liste : deux copies de cette règle
 * finiraient par ne plus nommer les mêmes étudiants.
 */
import db from '../db/index.js';

// Les lignes d'attribution du professeur pour l'année : cours, organisation,
// lettre de groupe — c'est à ce titre qu'il voit et propose.
export function attributionsDe(profId, annee) {
  return db.prepare(`
    SELECT DISTINCT a.code_cours, a.ue_num,
           COALESCE(a.num_organisation, 1) AS org, a.code AS groupe,
           COALESCE(a.activite_id, 0) AS activite_id,
           (SELECT t.libelle FROM activite_type t WHERE t.id = a.activite_id) AS activite_libelle,
           (SELECT c.cours_nom FROM cours c WHERE c.cours_code = a.code_cours
             ORDER BY (c.annee_scolaire = ?) DESC LIMIT 1) AS cours_nom,
           (SELECT x.ue_nom FROM ue x WHERE x.ue_num = a.ue_num AND x.ue_nom IS NOT NULL
             ORDER BY x.annee_scolaire DESC LIMIT 1) AS ue_nom,
           a.section,
           -- Le bloc de l'unité DANS la section de l'attribution : un même
           -- numéro vit sous plusieurs sections (l'UE 95).
           (SELECT x.ue_niv FROM ue x WHERE x.ue_num = a.ue_num AND x.ue_niv IS NOT NULL
             AND (a.section IS NULL OR x.section = a.section)
             ORDER BY (x.annee_scolaire = ?) DESC, x.annee_scolaire DESC LIMIT 1) AS ue_niv
    FROM attribution a
    WHERE a.professeur_id = ? AND a.annee_scolaire = ? AND a.code_cours IS NOT NULL
      -- Les activités retirées du carnet de cotes (Répartition des étudiants) :
      -- de l'EPT, des périodes de correction… ne font pas un carnet.
      AND NOT EXISTS (SELECT 1 FROM carnet_exclusion x WHERE x.annee_scolaire = a.annee_scolaire
            AND x.cours_code = a.code_cours AND x.activite_id = COALESCE(a.activite_id, 0))
    ORDER BY a.ue_num, a.code_cours, org, groupe
  `).all(annee, annee, profId, annee);
}

/* Les étudiants du professeur pour UN cours : ceux de ses groupes quand la
 * répartition du cours existe, tous les inscrits de l'unité sinon. */
export function etudiantsDuCours(profId, coursCode, annee) {
  const miennes = attributionsDe(profId, annee).filter(a => a.code_cours === coursCode);
  if (!miennes.length) return null;   // pas son cours
  const ueNum = miennes[0].ue_num;

  /* PAR ACTIVITÉ. Un professeur porte une ou plusieurs lignes d'attribution
   * — « labo, groupe 3 », « théorie » — et chacune désigne ses étudiants :
   * ceux que la répartition a placés dans CE groupe de CETTE activité ; et
   * si l'activité n'est pas répartie (la théorie, suivie par tous), tous les
   * inscrits de l'unité. On réunit, sans doublon. */
  const repartis = db.prepare(`
    SELECT g.etudiant_id, g.num_organisation, g.groupe_code, COALESCE(g.activite_id, 0) AS activite_id,
           e.nom, e.prenom, e.id_ecampus, e.email_ecole
    FROM etudiant_cours_groupe g JOIN etudiant e ON e.id = g.etudiant_id
    WHERE g.annee_scolaire = ? AND g.cours_code = ? AND e.actif = 1
    ORDER BY e.nom, e.prenom
  `).all(annee, coursCode);
  const inscrits = () => db.prepare(`
    SELECT e.id, e.nom, e.prenom, e.id_ecampus, e.email_ecole
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ? AND e.actif = 1
    ORDER BY e.nom, e.prenom
  `).all(annee, ueNum);

  const parId = new Map();
  let repartition = false;
  for (const a of miennes) {
    const deLActivite = repartis.filter(x => x.activite_id === a.activite_id);
    const prefixe = a.activite_libelle ? `${a.activite_libelle} · ` : '';
    let lot;
    if (deLActivite.length) {
      repartition = true;
      lot = deLActivite
        .filter(x => (x.num_organisation ?? 1) === a.org && String(x.groupe_code || '') === String(a.groupe || ''))
        .map(x => ({ id: x.etudiant_id, nom: x.nom, prenom: x.prenom, id_ecampus: x.id_ecampus, email_ecole: x.email_ecole,
          groupe: `${prefixe}Org ${x.num_organisation ?? 1}${x.groupe_code ? ` · Gr. ${x.groupe_code}` : ''}` }));
    } else {
      lot = inscrits().map(x => ({ ...x, groupe: a.activite_libelle ? `${a.activite_libelle} · tous` : '' }));
    }
    for (const e of lot) {
      const deja = parId.get(e.id);
      if (!deja) parId.set(e.id, e);
      else if (e.groupe && !deja.groupe.split(' + ').includes(e.groupe)) {
        deja.groupe = deja.groupe ? `${deja.groupe} + ${e.groupe}` : e.groupe;
      }
    }
  }
  const etudiants = [...parId.values()].sort((x, y) =>
    `${x.nom} ${x.prenom}`.localeCompare(`${y.nom} ${y.prenom}`, 'fr'));
  return { miennes, ueNum, etudiants, repartition };
}

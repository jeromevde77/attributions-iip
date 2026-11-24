/**
 * COMPLÉTER L'AUTONOMIE D'UNE UE (Charles, 24 novembre 2026 : « dans les attributions AeSI 2026-2027, l'autonomie
 * attribuée est inférieure à ce que le dossier pédagogique prévoit » — UE 333 : 34 périodes d'autonomie pour 136
 * périodes de cours, soit 25 %, quand les lignes n'en portent que 10 à 19 %). Tranché : « un outil Compléter
 * l'autonomie, par UE ; Lucie propose pour chaque ligne l'autonomie au prorata de ses périodes, montre l'avant et
 * l'après ligne par ligne, et n'écrit qu'après confirmation. Les lignes en congé restent à 0. »
 *
 * LE TAUX VIENT DU DOSSIER : autonomie de l'UE (`cours.ue_autonomie` de l'année — la même valeur sur chaque cours ; le
 * MAX non vide —, à défaut `ue.ue_aut`) ÷ périodes de cours du dossier (Σ `cours.cours_per`, hors activités Z). Chaque
 * ligne de l'UE et de l'année, hors congé, hors Z, hors encadrement (EPT, codes 91-99), avec des périodes : proposé =
 * arrondi(périodes × taux). ON COMPLÈTE, ON NE RETIRE JAMAIS : une ligne déjà au proposé ou au-delà n'est pas touchée.
 *
 * L'ARRONDI EST À LA PÉRIODE ENTIÈRE par défaut : la grille accepte une décimale, mais la charge, les contrats et le
 * document 2 se comptent en périodes ; `arrondi: 0.5` donne le demi. La fonction ne décide d'aucun droit : la route
 * lui passe le périmètre (`sections`, null = toutes).
 */
import db from '../db/index.js';

const CODES_ENCADREMENT = ['91', '92', '93', '94', '95', '96', '97', '98', '99'];

/** L'autonomie et les périodes de cours du dossier pédagogique d'une UE, pour une année. */
export function dossierAutonomie(ueNum, annee) {
  const cours = db.prepare(`SELECT cours_code, cours_per, ct_pp, ue_autonomie FROM cours
    WHERE ue_num = ? AND annee_scolaire = ?`).all(ueNum, annee);
  const horsZ = cours.filter(c => String(c.ct_pp || '').toUpperCase() !== 'Z');
  const periodes = horsZ.reduce((t, c) => t + (Number(c.cours_per) || 0), 0);
  let autonomie = cours.reduce((m, c) => Math.max(m, Number(c.ue_autonomie) || 0), 0);
  if (!autonomie) {
    autonomie = Number(db.prepare('SELECT MAX(ue_aut) a FROM ue WHERE ue_num = ? AND annee_scolaire = ?')
      .get(ueNum, annee)?.a) || 0;
  }
  return { autonomie, periodes, coursZ: new Set(cours.filter(c => !horsZ.includes(c)).map(c => c.cours_code)) };
}

const arrondir = (v, pas) => Math.round(v / pas) * pas;

/**
 * La proposition, ligne par ligne. Rend { erreur } quand il n'y a rien à compléter.
 * @param {{ annee, ueNum, section?, sections?: string[]|null, arrondi?: number }} o
 */
export function proposerAutonomie({ annee, ueNum, section = null, sections = null, arrondi = 1 }) {
  const pas = Number(arrondi) === 0.5 ? 0.5 : 1;
  const d = dossierAutonomie(ueNum, annee);
  if (!d.autonomie) return { erreur: `L'UE ${ueNum} ne prévoit pas d'autonomie au dossier pédagogique : rien à compléter.` };
  if (!d.periodes) return { erreur: `L'UE ${ueNum} n'a pas de périodes de cours au dossier pédagogique pour ${annee} : le taux ne se calcule pas.` };
  const taux = d.autonomie / d.periodes;

  const conds = ['a.ue_num = ?', 'a.annee_scolaire = ?'];
  const params = [ueNum, annee];
  if (section) { conds.push('a.section = ?'); params.push(section); }
  if (sections) {
    if (!sections.length) return { erreur: 'Aucune section dans votre périmètre.' };
    conds.push(`a.section IN (${sections.map(() => '?').join(',')})`); params.push(...sections);
  }
  let colConge = true;
  try { db.prepare('SELECT en_conge FROM attribution LIMIT 0').all(); } catch { colConge = false; }
  const lignes = db.prepare(`SELECT a.id, a.section, a.code_cours, a.code, a.num_organisation, a.type_cours,
      a.coordination_encadrement, a.periodes_attribuees, a.autonomie_attribuee,
      ${colConge ? 'a.en_conge' : '0 AS en_conge'},
      CASE WHEN p.id IS NULL THEN NULL ELSE UPPER(p.nom) || ' ' || p.prenom END AS professeur
    FROM attribution a LEFT JOIN professeur p ON p.id = a.professeur_id
    WHERE ${conds.join(' AND ')}
    ORDER BY COALESCE(a.num_organisation, 1), a.code_cours, a.code, a.id`).all(...params);

  const sortie = [];
  let totalAvant = 0, totalApres = 0;
  for (const l of lignes) {
    const per = Number(l.periodes_attribuees) || 0;
    const avant = Number(l.autonomie_attribuee) || 0;
    let raison = null;
    if (Number(l.en_conge) === 1) raison = 'en congé';
    else if (String(l.type_cours || '').toUpperCase() === 'Z' || d.coursZ.has(l.code_cours)) raison = 'activité Z';
    else if (CODES_ENCADREMENT.includes(String(l.coordination_encadrement || ''))) raison = 'encadrement';
    else if (per <= 0) raison = 'sans périodes';
    const propose = raison ? null : arrondir(per * taux, pas);
    if (!raison && avant >= propose) raison = 'déjà complète';
    const apres = raison ? avant : propose;
    totalAvant += avant; totalApres += apres;
    sortie.push({ id: l.id, section: l.section, code_cours: l.code_cours, groupe: l.code || null,
      organisation: Number(l.num_organisation) || 1, professeur: l.professeur, periodes: per,
      avant, apres, propose, change: !raison, raison });
  }
  const r2 = x => Math.round(x * 100) / 100;
  return {
    ue_num: Number(ueNum), annee, taux: r2(taux), autonomie_dossier: d.autonomie, periodes_dossier: d.periodes,
    arrondi: pas, lignes: sortie, a_changer: sortie.filter(l => l.change).length,
    total_avant: r2(totalAvant), total_apres: r2(totalApres),
  };
}

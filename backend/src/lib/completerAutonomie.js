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
 * voir plus bas la règle, qui est celle du contrôle des attributions depuis 3.5.679 (elle peut aussi RETIRER).
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
 * LA RÈGLE EST CELLE DU CONTRÔLE DES ATTRIBUTIONS (3.5.679, Charles, UE 334 : « je ne comprends pas » — l'outil
 * proposait 25 % de chaque ligne, le contrôle disait « autonomie trop élevée »). Deux calculs pour une même grandeur
 * donnaient deux chiffres ; l'outil vise désormais EXACTEMENT ce que vérifie `analyseAutonomieUE`, organisation par
 * organisation :
 *  - tous les cours dédoublés ×N (périodes de cours ouvertes = N × périodes du dossier, N ≥ 2) : autonomie = ue_aut × N ;
 *  - sinon : entre ue_aut et ue_aut + 20 % des périodes ajoutées par les dédoublements ; une autonomie déjà dans
 *    l'intervalle ne bouge pas, en dessous elle monte au minimum, au-dessus elle descend au maximum.
 * La cible se répartit ensuite sur les lignes au prorata de leurs périodes (plus forts restes : la somme tombe juste).
 * Une organisation déjà juste garde sa répartition. Seules les lignes IIP comptent, comme dans le contrôle.
 * @param {{ annee, ueNum, section?, sections?: string[]|null, arrondi?: number }} o
 */
export function proposerAutonomie({ annee, ueNum, section = null, sections = null, arrondi = 1, bornes = null }) {
  const pas = Number(arrondi) === 0.5 ? 0.5 : 1;
  const d = dossierAutonomie(ueNum, annee);
  const ueRow = db.prepare('SELECT MAX(ue_aut) aut, MAX(ue_per_cours) per FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ueNum, annee) || {};
  const ueAut = Number(ueRow.aut) || d.autonomie;
  const perDP = Number(ueRow.per) || d.periodes;
  if (!ueAut) return { erreur: `L'UE ${ueNum} ne prévoit pas d'autonomie au dossier pédagogique : rien à compléter.` };
  if (!perDP) return { erreur: `L'UE ${ueNum} n'a pas de périodes de cours au dossier pédagogique pour ${annee} : la règle ne se calcule pas.` };

  const conds = ['a.ue_num = ?', 'a.annee_scolaire = ?'];
  const params = [ueNum, annee];
  if (section) { conds.push('a.section = ?'); params.push(section); }
  if (sections) {
    if (!sections.length) return { erreur: 'Aucune section dans votre périmètre.' };
    conds.push(`a.section IN (${sections.map(() => '?').join(',')})`); params.push(...sections);
  }
  let colConge = true;
  try { db.prepare('SELECT en_conge FROM attribution LIMIT 0').all(); } catch { colConge = false; }
  const lignes = db.prepare(`SELECT a.id, a.section, a.code_cours, a.code, a.num_organisation, a.type_cours, a.contrat_mdp,
      a.coordination_encadrement, a.periodes_attribuees, a.autonomie_attribuee,
      ${colConge ? 'a.en_conge' : '0 AS en_conge'},
      CASE WHEN p.id IS NULL THEN NULL ELSE UPPER(p.nom) || ' ' || p.prenom END AS professeur
    FROM attribution a LEFT JOIN professeur p ON p.id = a.professeur_id
    WHERE ${conds.join(' AND ')}
    ORDER BY COALESCE(NULLIF(a.num_organisation, 0), 1), a.code_cours, a.code, a.id`).all(...params);

  const r2 = x => Math.round(x * 100) / 100;
  const sortie = lignes.map(l => {
    const per = Number(l.periodes_attribuees) || 0;
    const avant = Number(l.autonomie_attribuee) || 0;
    let raison = null;
    if (Number(l.en_conge) === 1) raison = 'en congé';
    else if (String(l.contrat_mdp || 'IIP') !== 'IIP') raison = 'hors IIP';
    else if (String(l.type_cours || '').toUpperCase() === 'Z' || d.coursZ.has(l.code_cours)) raison = 'activité Z';
    else if (CODES_ENCADREMENT.includes(String(l.coordination_encadrement || ''))) raison = 'encadrement';
    else if (per <= 0) raison = 'sans périodes';
    return { id: l.id, section: l.section, code_cours: l.code_cours, groupe: l.code || null,
      organisation: Number(l.num_organisation) || 1, professeur: l.professeur, periodes: per,
      avant, apres: avant, propose: null, change: false, raison, _ok: !raison };
  });

  // Organisation par organisation (et section), la règle du contrôle.
  const groupes = new Map();
  for (const l of sortie) { const k = `${l.section}|${l.organisation}`; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(l); }
  const organisations = [];
  for (const [k, ls] of groupes) {
    const eligibles = ls.filter(l => l._ok);
    const perOuv = eligibles.reduce((t, l) => t + l.periodes, 0);
    const autTot = ls.filter(l => String(l.raison) !== 'en congé' && l.raison !== 'hors IIP').reduce((t, l) => t + l.avant, 0);
    if (!eligibles.length) continue;
    /* LES BORNES (3.5.680, Charles : « autant de fois qu'il y a de multiples de TOUS les cours, au maximum autant de fois
       qu'il y a de multiples du plus grand », par organisation) : celles du contrôle, passées par la route ; à défaut, le
       même calcul ici, cours par cours. Une autonomie dans les bornes ne bouge pas. */
    let min, max;
    const b = bornes ? bornes(k.split('|')[0], Number(k.split('|')[1])) : null;
    if (b) { min = b.min; max = b.max; }
    else {
      const parCours = {};
      for (const l of eligibles) parCours[l.code_cours] = (parCours[l.code_cours] || 0) + l.periodes;
      const dpDe = c => Number(db.prepare('SELECT cours_per FROM cours WHERE cours_code = ? AND annee_scolaire = ?').get(c, annee)?.cours_per) || 0;
      const mults = Object.entries(parCours).map(([c, p]) => { const dp = dpDe(c); return dp ? Math.max(1, Math.floor(p / dp + 1e-9)) : 1; });
      min = ueAut * Math.max(1, Math.min(...mults)); max = ueAut * Math.max(1, ...mults);
    }
    const N = min === max ? min / ueAut : null;
    const cible = autTot < min ? min : autTot > max ? max : autTot;
    organisations.push({ cle: k, organisation: Number(k.split('|')[1]), multiple: N, minimum: min, maximum: max,
      cible, avant: r2(autTot) });
    if (Math.abs(cible - autTot) < 1e-9) { eligibles.forEach(l => { l.raison = 'organisation déjà juste'; }); continue; }
    // Plus forts restes : chaque ligne reçoit sa part de la cible, au pas choisi, et la somme tombe juste.
    const unites = Math.round(cible / pas);
    const parts = eligibles.map(l => { const exact = (l.periodes / perOuv) * unites; return { l, base: Math.floor(exact), reste: exact - Math.floor(exact) }; });
    let manque = unites - parts.reduce((t, x) => t + x.base, 0);
    parts.sort((a, b) => b.reste - a.reste).forEach(x => { if (manque > 0) { x.base += 1; manque -= 1; } });
    for (const x of parts) {
      const v = r2(x.base * pas);
      x.l.propose = v;
      if (Math.abs(v - x.l.avant) < 1e-9) x.l.raison = 'déjà juste';
      else { x.l.apres = v; x.l.change = true; }
    }
  }
  sortie.forEach(l => { delete l._ok; });
  const totalAvant = sortie.reduce((t, l) => t + l.avant, 0), totalApres = sortie.reduce((t, l) => t + l.apres, 0);
  return {
    ue_num: Number(ueNum), annee, taux: r2(ueAut / perDP), autonomie_dossier: ueAut, periodes_dossier: perDP,
    arrondi: pas, organisations, lignes: sortie, a_changer: sortie.filter(l => l.change).length,
    total_avant: r2(totalAvant), total_apres: r2(totalApres),
  };
}

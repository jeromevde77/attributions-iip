// ─────────────────────────────────────────────────────────────────────────────
// LES GROUPES COMMUNS — des « briques » pour que les groupes de tous les cours
// d'un bloc s'emboîtent (Charles, 9 octobre 2026 : « dans l'UE 250 j'ai des TP
// par groupes de 4, un autre cours de 6, et dans la 252 des groupes de 8 : je
// dois trouver des groupes communs pour mes horaires »).
//
// Une cohorte = une section et un BLOC (BA1, BA2, BA3). On la coupe en B
// briques, B étant le plus petit multiple commun des découpages (8, 6, 4, 12
// → 24). Chaque groupe d'une activité est un assemblage FIXE de briques : avec
// 24 briques et 8 groupes, le groupe 1 réunit les briques 1-3, le groupe 2 les
// briques 4-6… Un étudiant n'a qu'UNE brique : tous ses groupes s'en déduisent,
// et l'horaire sait exactement qui est dans chaque groupe de chaque cours.
//
// Les quadrimestres : deux groupes ne se gênent que dans le même quadrimestre ;
// le découpage se règle par activité (Q1, Q2 ou l'année), les briques restent
// les mêmes toute l'année — on garde ses camarades.
//
// Rien ne s'écrit dans la répartition sans simulation (`appliquer` avec
// `simulation: true`), et l'écriture passe par la même table que l'écran de
// répartition (etudiant_cours_groupe) : listes, Mes cours et horaires la lisent.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';
import { dispensesDeLUE } from './dispenses.js';
import { uesDuBloc, orgsDuBloc } from './placement.js';

export function migrerGroupesCommuns(base = db) {
  base.exec(`CREATE TABLE IF NOT EXISTS groupe_commun_reglage (
    annee_scolaire TEXT NOT NULL, section TEXT NOT NULL, bloc TEXT NOT NULL,
    cours_code TEXT NOT NULL, activite_id INTEGER NOT NULL DEFAULT 0,
    nb_groupes INTEGER, quadri TEXT, inclus INTEGER, maj_par TEXT, maj_le TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (annee_scolaire, section, bloc, cours_code, activite_id));
  CREATE TABLE IF NOT EXISTS groupe_commun_brique (
    annee_scolaire TEXT NOT NULL, section TEXT NOT NULL, bloc TEXT NOT NULL,
    etudiant_id INTEGER NOT NULL, brique INTEGER NOT NULL, maj_par TEXT, maj_le TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (annee_scolaire, section, bloc, etudiant_id));`);
  const cols = base.prepare('PRAGMA table_info(groupe_commun_reglage)').all().map(c => c.name);
  if (!cols.includes('inclus')) base.exec('ALTER TABLE groupe_commun_reglage ADD COLUMN inclus INTEGER');
  if (!cols.includes('ordre')) base.exec('ALTER TABLE groupe_commun_reglage ADD COLUMN ordre TEXT');
}

const pgcd = (a, b) => (b ? pgcd(b, a % b) : a);
export const ppcm = l => l.filter(n => n > 1).reduce((a, b) => a / pgcd(a, b) * b, 1);

/** Les groupes d'une activité selon les attributions, dans l'ordre (organisation, nom). */
function groupesAttribution(ueNum, annee, coursCode, act) {
  const m = new Map();
  for (const a of db.prepare(`SELECT COALESCE(num_organisation, 1) org, code FROM attribution
      WHERE ue_num = ? AND annee_scolaire = ? AND code_cours = ? AND COALESCE(activite_id, 0) = ?`).all(ueNum, annee, coursCode, act)) {
    const k = `${a.org}|${a.code || ''}`;
    if (!m.has(k)) m.set(k, { num_organisation: a.org, groupe: a.code || null });
  }
  return [...m.values()].sort((x, y) => x.num_organisation - y.num_organisation
    || String(x.groupe || '').localeCompare(String(y.groupe || ''), 'fr', { numeric: true }));
}

/**
 * LE VERRE NOURRIT LES GROUPES (Charles, 10 octobre 2026 : « relie les données »).
 * Quand une UE n'a pas d'attributions pour l'année — 2027-2028, où l'horaire et
 * les groupes viennent avant les attributions —, ses activités, leurs groupes et
 * leurs périodes viennent du verre (la grille d'organisation). En 2026-2027, les
 * attributions restent la source, comme convenu.
 */
/** Les organisations d'une UE dans la section (au moins la première). */
export function organisationsDe(section, ueNum, annee) {
  try {
    const l = db.prepare(`SELECT COALESCE(num_organisation, 1) n FROM organisation_ue WHERE annee_scolaire = ? AND section = ? AND ue_num = ? ORDER BY 1`).all(annee, section, ueNum).map(x => x.n);
    return l.length ? [...new Set(l)] : [1];
  } catch { return [1]; }
}
/** Le verre d'une UE — celui d'une organisation donnée ; vide, il reprend celui de la première (même UE, même contenu). */
export function activitesDeLaGrille(section, ueNum, annee, org = null) {
  try {
    const premier = () => db.prepare(`SELECT id FROM organisation_ue WHERE annee_scolaire = ? AND section = ? AND ue_num = ? ORDER BY num_organisation LIMIT 1`).get(annee, section, ueNum);
    let o = org ? db.prepare(`SELECT id FROM organisation_ue WHERE annee_scolaire = ? AND section = ? AND ue_num = ? AND COALESCE(num_organisation, 1) = ?`).get(annee, section, ueNum, org) : premier();
    if (o && org && !db.prepare('SELECT 1 FROM grille_cours gc JOIN grille_activite ga ON ga.grille_cours_id = gc.id WHERE gc.organisation_id = ? AND ga.periodes > 0 LIMIT 1').get(o.id)) o = premier();
    if (!o) return [];
    return db.prepare(`SELECT gc.cours_code AS code_cours, COALESCE(ga.activite_id, 0) AS activite_id, MAX(t.libelle) AS libelle,
        MAX(c.cours_nom) AS cours_nom, MAX(COALESCE(c.is_stage, 0)) AS stage, MAX(COALESCE(ga.groupes, 1)) AS groupes, SUM(ga.periodes) AS periodes
      FROM grille_activite ga JOIN grille_cours gc ON gc.id = ga.grille_cours_id
      LEFT JOIN activite_type t ON t.id = ga.activite_id
      LEFT JOIN cours c ON c.cours_code = gc.cours_code AND c.annee_scolaire = ?
      WHERE gc.organisation_id = ? AND ga.periodes > 0
      GROUP BY gc.cours_code, COALESCE(ga.activite_id, 0) ORDER BY gc.cours_code`).all(annee, o.id);
  } catch { return []; }
}
export const groupesDeLaGrille = n => Array.from({ length: Math.max(1, n) }, (_, i) => ({ num_organisation: 1, groupe: n > 1 ? String.fromCharCode(65 + i) : null }));

/** Tout ce que l'écran montre d'une cohorte. */
export function cohorte(section, bloc, annee) {
  // Le bloc d'une UE est celui que la SECTION lui donne cette année (schéma de capitalisation).
  const duBloc = uesDuBloc(section, bloc, annee);
  const ues = duBloc.length ? db.prepare(`SELECT u.ue_num, MAX(u.ue_nom) ue_nom FROM ue u
      WHERE u.annee_scolaire = ? AND u.ue_num IN (${duBloc.map(() => "?").join(",")})
      GROUP BY u.ue_num ORDER BY u.ue_num`).all(annee, ...duBloc) : [];
  const reglages = new Map(db.prepare(`SELECT * FROM groupe_commun_reglage WHERE annee_scolaire = ? AND section = ? AND bloc = ?`)
    .all(annee, section, bloc).map(r => [`${r.cours_code}#${r.activite_id}`, r]));
  const activites = [];
  for (const u of ues) {
    const acts = db.prepare(`SELECT a.code_cours, COALESCE(a.activite_id, 0) activite_id, MAX(t.libelle) libelle,
        MAX(c.cours_nom) cours_nom, MAX(COALESCE(c.is_stage, 0)) stage, GROUP_CONCAT(DISTINCT a.quadrimestre_attribue) quadris
      FROM attribution a LEFT JOIN activite_type t ON t.id = a.activite_id
      LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
      WHERE a.ue_num = ? AND a.annee_scolaire = ? AND a.code_cours IS NOT NULL
      GROUP BY a.code_cours, COALESCE(a.activite_id, 0) ORDER BY a.code_cours`).all(u.ue_num, annee);
    // Sans attribution, le verre fait foi.
    const depuisGrille = !acts.length;
    const sources = depuisGrille ? activitesDeLaGrille(section, u.ue_num, annee).map(a => ({ ...a, quadris: '' })) : acts;
    for (const a of sources) {
      const groupes = depuisGrille ? groupesDeLaGrille(a.groupes) : groupesAttribution(u.ue_num, annee, a.code_cours, a.activite_id);
      if (groupes.length < 2) continue;           // une activité sans groupes réunit tout le monde
      const r = reglages.get(`${a.code_cours}#${a.activite_id}`);
      const q = String(a.quadris || '');
      const quadriAttr = /Q1/.test(q) && !/Q2/.test(q) ? 'Q1' : /Q2/.test(q) && !/Q1/.test(q) ? 'Q2' : 'AN';
      /* L'ORDRE DES GROUPES FAIT LES LIENS (Charles, 9 octobre 2026 : « lier
         certains en glissant ») : le groupe placé en position k couvre les
         briques de la position k. Aligner 252.2 C sous 250.1 B, c'est leur
         donner les mêmes étudiants. Un ordre enregistré qui ne correspond plus
         aux attributions (groupe ajouté ou retiré) est complété, jamais perdu. */
      const cle = g => `${g.num_organisation}|${g.groupe || ''}`;
      let ordre = []; try { ordre = JSON.parse(r?.ordre || '[]'); } catch { ordre = []; }
      const parCle = new Map(groupes.map(g => [cle(g), g]));
      const ranges = [...ordre.filter(k => parCle.has(k)).map(k => parCle.get(k)), ...groupes.filter(g => !ordre.includes(cle(g)))];
      activites.push({ ue_num: u.ue_num, ue_nom: u.ue_nom, cours_code: a.code_cours, cours_nom: a.cours_nom,
        activite_id: a.activite_id, activite: a.libelle || null, groupes: ranges,
        // CETTE ANNÉE, LES ATTRIBUTIONS COMMANDENT : autant de groupes qu'attribués.
        nb_groupes: groupes.length, quadri: r?.quadri || quadriAttr,
        /* LES BRIQUES SONT POUR LES TP (Charles, 9 octobre 2026 : « le stage ne
           compte pas, c'est pour les TP ») : travaux pratiques et laboratoires
           d'office ; stage, séminaires, évaluations hors d'office. Une case
           l'inverse, activité par activité. */
        inclus: r?.inclus != null ? !!r.inclus : (!a.stage && /\(TP\)|\bTP\b|travaux pratiques|laboratoire/i.test(a.libelle || '')) });
    }
  }
  const nums = ues.map(u => u.ue_num);
  // Une UE dont seules certaines organisations vivent dans cette classe n'y amène que leurs étudiants.
  const restreint = orgsDuBloc(section, bloc, annee);
  const etudiants = nums.length ? db.prepare(`SELECT e.id, e.nom, e.prenom, MIN(i.num_organisation) num_organisation,
      GROUP_CONCAT(DISTINCT i.ue_num || ':' || COALESCE(i.num_organisation, 1)) ues
    FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num IN (${nums.map(() => '?').join(',')}) AND COALESCE(e.actif, 1) = 1
    GROUP BY e.id ORDER BY e.nom, e.prenom`).all(annee, ...nums)
    .map(e => ({ ...e, ues: [...new Set(String(e.ues || '').split(',').map(x => x.split(':').map(Number))
      .filter(([u, o]) => !restreint.get(u) || restreint.get(u).includes(o)).map(([u]) => u))] }))
    .filter(e => e.ues.length) : [];
  const dispenses = {};
  for (const n of nums) for (const [id, d] of dispensesDeLUE(n, annee)) {
    const o = (dispenses[id] ||= {});
    for (const a of activites.filter(x => x.ue_num === n)) if (d.ue || d.cours.has(a.cours_code)) o[a.cours_code] = d.ue || d.cours.get(a.cours_code);
  }
  const briques = Object.fromEntries(db.prepare(`SELECT etudiant_id, brique FROM groupe_commun_brique
    WHERE annee_scolaire = ? AND section = ? AND bloc = ?`).all(annee, section, bloc).map(x => [x.etudiant_id, x.brique]));
  // Les organisations de chaque UE qui se donnent DANS cette classe (null = toutes).
  const orgsIci = Object.fromEntries([...restreint].filter(([, v]) => v));
  return { section, bloc, annee, ues, activites, etudiants, dispenses, briques, orgs_ici: orgsIci,
    nb_briques: ppcm(activites.filter(a => a.inclus).map(a => a.nb_groupes)) };
}

/**
 * PROPOSER LES BRIQUES : tailles égales, et chaque brique reçoit le même
 * mélange de profils (qui suit quelles UE) et d'organisations, pour que chaque
 * cours ait des groupes de même taille.
 */
export function proposerBriques(c, B) {
  /* L'ÉQUILIBRE SE FAIT UE PAR UE : un tour de rôle par profil laissait des
     groupes de 8 à côté de groupes de 18 en 250.1. Chaque étudiant va dans la
     brique où SES unités sont le moins remplies (puis la moins pleine), les
     profils rares d'abord — ce sont eux qui déséquilibrent. */
  const freq = new Map();
  for (const e of c.etudiants) for (const u of e.ues) freq.set(u, (freq.get(u) || 0) + 1);
  const rarete = e => Math.min(...e.ues.map(u => freq.get(u) || 0));
  const ordre = [...c.etudiants].sort((x, y) => rarete(x) - rarete(y) || y.ues.length - x.ues.length
    || String(x.nom).localeCompare(String(y.nom)));
  const parUE = Array.from({ length: B + 1 }, () => new Map());
  const total = Array(B + 1).fill(0);
  const out = {};
  for (const e of ordre) {
    let best = 1, cout = Infinity;
    for (let b = 1; b <= B; b++) {
      let k = 0;
      for (const u of e.ues) k += (parUE[b].get(u) || 0) * 1000 / (freq.get(u) || 1);
      k += total[b] * 0.01;
      if (k < cout) { cout = k; best = b; }
    }
    out[e.id] = best; total[best]++;
    for (const u of e.ues) parUE[best].set(u, (parUE[best].get(u) || 0) + 1);
  }
  return out;
}

/** Le groupe (0-based) d'une brique pour une activité découpée en `nb` groupes. */
export const groupeDeBrique = (brique, B, nb) => Math.floor((brique - 1) / (B / nb));

/**
 * REMPLIR LES GROUPES depuis les briques. Une activité dont le découpage ne
 * divise pas le nombre de briques, ou dont les attributions n'ont pas autant de
 * groupes, est nommée et laissée telle quelle.
 */
export function appliquerBriques(c, { simulation = true, par = null } = {}) {
  const B = c.nb_briques;
  const rapport = { activites: [], ecarts: [], a_poser: 0, a_changer: 0, inchanges: 0 };
  const lire = db.prepare(`SELECT num_organisation, groupe_code FROM etudiant_cours_groupe
    WHERE etudiant_id = ? AND annee_scolaire = ? AND cours_code = ? AND activite_id = ?`);
  const poser = db.prepare(`INSERT INTO etudiant_cours_groupe
      (etudiant_id, annee_scolaire, cours_code, activite_id, num_organisation, groupe_code, maj_le, maj_par)
    VALUES (?,?,?,?,?,?,datetime('now'),?)
    ON CONFLICT(etudiant_id, annee_scolaire, cours_code, activite_id) DO UPDATE SET
      num_organisation = excluded.num_organisation, groupe_code = excluded.groupe_code,
      maj_le = datetime('now'), maj_par = excluded.maj_par`);
  const ecrire = [];
  for (const a of c.activites) {
    const libelle = `${a.cours_code}${a.activite ? ` · ${a.activite}` : ''}`;
    if (a.nb_groupes < 2 || !a.inclus) continue;
    if (B % a.nb_groupes) { rapport.ecarts.push(`${libelle} : ${a.nb_groupes} groupes ne tombent pas juste sur ${B} briques`); continue; }
    if (a.groupes.length !== a.nb_groupes) {
      rapport.ecarts.push(`${libelle} : ${a.nb_groupes} groupes voulus, ${a.groupes.length} dans les attributions — à aligner d'abord`);
      continue;
    }
    const effectifs = a.groupes.map(() => 0);
    for (const e of c.etudiants) {
      if (!e.ues.includes(a.ue_num) || c.dispenses[e.id]?.[a.cours_code]) continue;
      const b = c.briques[e.id];
      if (!b) continue;
      const g = a.groupes[groupeDeBrique(b, B, a.nb_groupes)];
      effectifs[groupeDeBrique(b, B, a.nb_groupes)]++;
      const avant = lire.get(e.id, c.annee, a.cours_code, a.activite_id);
      if (avant && avant.num_organisation === g.num_organisation && (avant.groupe_code || null) === (g.groupe || null)) { rapport.inchanges++; continue; }
      if (avant) rapport.a_changer++; else rapport.a_poser++;
      ecrire.push([e.id, c.annee, a.cours_code, a.activite_id, g.num_organisation, g.groupe, par]);
    }
    rapport.activites.push({ libelle, groupes: a.groupes.map((g, i) => ({ nom: g.groupe || `Org ${g.num_organisation}`, effectif: effectifs[i] })) });
  }
  if (!simulation && ecrire.length) db.transaction(() => { for (const x of ecrire) poser.run(...x); })();
  return rapport;
}

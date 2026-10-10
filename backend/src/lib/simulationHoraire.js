// ─────────────────────────────────────────────────────────────────────────────
// LA SIMULATION DE PLANIFICATION ANNUELLE D'UN BLOC (Charles, 9 octobre 2026 :
// « qu'il fasse une simulation de planification ; ça doit rentrer dans
// l'horaire disponible ; attention aux congés ; planification annuelle, somme
// des heures ; les cours théoriques sont par bloc »).
//
// Les données sont celles de Lucie, rien n'est supposé :
//   · les SEMAINES DE COURS du calendrier de l'année (annee_calendrier, type
//     « cours ») — les vacances et les sessions d'examens n'en font pas partie —,
//     moins les jours fériés ;
//   · les PLAGES de la section (horaire_plage) : pour TIM, 15 h 30 – 17 h 30 et
//     17 h 30 – 19 h 30 en semaine, le samedi de 8 h à 16 h par tranches de 2 h ;
//   · les PÉRIODES ATTRIBUÉES de chaque groupe (attribution) — une période vaut
//     50 minutes — et son enseignant ;
//   · les BRIQUES des groupes communs : un groupe de TP n'occupe que ses
//     briques ; la théorie et toute activité hors briques occupent tout le bloc.
//
// Trois règles : une brique n'est jamais à deux endroits à la fois ; un
// enseignant non plus — y compris avec les séances déjà posées ailleurs
// (horaire_seance, toutes sections) ; et chaque activité tient dans son
// quadrimestre. Les séances d'un groupe s'étalent régulièrement sur ses
// semaines. Ce qui ne trouve pas de place est NOMMÉ, avec la raison.
//
// RIEN NE S'ÉCRIT : la simulation se lit, se discute, se refait.
// ─────────────────────────────────────────────────────────────────────────────

import db from '../db/index.js';
import { joursFeries } from '../routes/horaire.js';
import { cohorte, groupeDeBrique, activitesDeLaGrille } from './groupesCommuns.js';
import { envelopperDocument } from './document.js';

export const MINUTES_PERIODE = 50;
const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function migrerPlages(base = db) {
  base.exec(`CREATE TABLE IF NOT EXISTS horaire_plage (
    section TEXT NOT NULL, jour INTEGER NOT NULL, debut TEXT NOT NULL, fin TEXT NOT NULL,
    PRIMARY KEY (section, jour, debut));
  CREATE TABLE IF NOT EXISTS plan_creneau (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    annee_scolaire TEXT NOT NULL, section TEXT NOT NULL, bloc TEXT NOT NULL,
    cle TEXT NOT NULL, cours_code TEXT NOT NULL, activite_id INTEGER NOT NULL DEFAULT 0, groupe TEXT,
    jour INTEGER NOT NULL, debut TEXT NOT NULL, fin TEXT NOT NULL, local TEXT,
    semaines TEXT NOT NULL DEFAULT '[]',
    verrouille INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'simulation',
    maj_par TEXT, maj_le TEXT DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS idx_plan_creneau ON plan_creneau(annee_scolaire, section, bloc);
  CREATE TABLE IF NOT EXISTS horaire_regle (
    section TEXT NOT NULL, cle TEXT NOT NULL, valeur TEXT, maj_par TEXT, maj_le TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (section, cle));
  CREATE TABLE IF NOT EXISTS horaire_local_activite (
    annee_scolaire TEXT NOT NULL, section TEXT NOT NULL, bloc TEXT NOT NULL,
    cours_code TEXT NOT NULL, activite_id INTEGER NOT NULL DEFAULT 0,
    locaux TEXT NOT NULL DEFAULT '[]', maj_par TEXT, maj_le TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (annee_scolaire, section, bloc, cours_code, activite_id))`);
  // Les plages de TIM, données par Charles le 9 octobre 2026.
  if (!base.prepare("SELECT 1 FROM horaire_plage WHERE section = 'TIM'").get()) {
    const ins = base.prepare('INSERT INTO horaire_plage (section, jour, debut, fin) VALUES (?,?,?,?)');
    for (let j = 1; j <= 5; j++) { ins.run('TIM', j, '15:30', '17:30'); ins.run('TIM', j, '17:30', '19:30'); }
    for (const [d, f] of [['08:00', '10:00'], ['10:00', '12:00'], ['12:00', '14:00'], ['14:00', '16:00']]) ins.run('TIM', 6, d, f);
  }
  synchroniserCreneaux(base);
}
/*
 * LES PRIORITÉS DE LA SECTION (Charles, 9 octobre 2026 : « répartir 5 jours sur
 * 6 ; grouper ; mais cela doit faire partie de ce que l'on encode comme
 * priorité »). Des RÉGLAGES, pas des constantes : une section les règle à
 * l'écran, à côté de ses plages.
 *   · jours_max — au plus N jours de présence par semaine pour un étudiant ;
 *   · regrouper — à créneau égal, placer un cours un jour où ses étudiants
 *     viennent déjà, plutôt que de les faire venir un jour de plus.
 */
export const REGLES_DEFAUT = { jours_max: 5, regrouper: true };
export function reglesDe(section) {
  const r = { ...REGLES_DEFAUT };
  for (const x of db.prepare('SELECT cle, valeur FROM horaire_regle WHERE section = ?').all(section)) {
    if (x.cle === 'jours_max') r.jours_max = Math.max(1, Math.min(7, Number(x.valeur) || REGLES_DEFAUT.jours_max));
    if (x.cle === 'regrouper') r.regrouper = x.valeur === '1';
  }
  return r;
}
export function ecrireRegles(section, regles, par = null) {
  const ins = db.prepare(`INSERT INTO horaire_regle (section, cle, valeur, maj_par, maj_le) VALUES (?,?,?,?, datetime('now'))
    ON CONFLICT(section, cle) DO UPDATE SET valeur = excluded.valeur, maj_par = excluded.maj_par, maj_le = excluded.maj_le`);
  db.transaction(() => {
    if (regles.jours_max != null) ins.run(section, 'jours_max', String(Math.max(1, Math.min(7, Number(regles.jours_max) || 5))), par);
    if (regles.regrouper != null) ins.run(section, 'regrouper', regles.regrouper ? '1' : '0', par);
  })();
}
/*
 * LES DISPONIBILITÉS DES ENSEIGNANTS (Charles, 10 octobre 2026 : « fais les
 * disponibilités des profs » ; saisies par le secrétariat ou la coordination).
 * La table existait (prof_disponibilite : enseignant × quadrimestre × jour ×
 * créneau), avec cinq créneaux génériques qui ne collaient pas aux plages des
 * sections. Les créneaux SUIVENT désormais les plages : chaque plage de section
 * a son créneau (même début, même fin). Un enseignant sans aucune saisie pour un
 * quadrimestre est disponible partout ; dès qu'il en a une, seuls ses créneaux
 * cochés comptent.
 */
export function synchroniserCreneaux(base = db) {
  try {
    const existe = new Set(base.prepare('SELECT heure_debut || \'|\' || heure_fin AS k FROM creneau').all().map(x => x.k));
    const ins = base.prepare('INSERT INTO creneau (heure_debut, heure_fin, ordre, label) VALUES (?,?,?,?)');
    for (const p of base.prepare('SELECT DISTINCT debut, fin FROM horaire_plage ORDER BY debut, fin').all()) {
      if (existe.has(`${p.debut}|${p.fin}`)) continue;
      ins.run(p.debut, p.fin, Number(p.debut.replace(':', '')), `${p.debut}–${p.fin}`);
    }
  } catch { /* table creneau absente */ }
}
/** Les disponibilités saisies : prof → quadrimestre → Set(« jour|début »). */
export function disponibilites(profIds = null) {
  const m = new Map();
  try {
    const rows = db.prepare(`SELECT pd.professeur_id, pd.quadrimestre, pd.jour, c.heure_debut FROM prof_disponibilite pd JOIN creneau c ON c.id = pd.creneau_id
      WHERE pd.disponible = 1${profIds ? ` AND pd.professeur_id IN (${profIds.map(() => '?').join(',') || 'NULL'})` : ''}`).all(...(profIds || []));
    for (const r of rows) {
      if (!m.has(r.professeur_id)) m.set(r.professeur_id, new Map());
      const q = m.get(r.professeur_id);
      if (!q.has(r.quadrimestre)) q.set(r.quadrimestre, new Set());
      q.get(r.quadrimestre).add(`${r.jour}|${r.heure_debut}`);
    }
  } catch { /* */ }
  return m;
}
export const plagesDe = section => db.prepare('SELECT jour, debut, fin FROM horaire_plage WHERE section = ? ORDER BY jour, debut').all(section);
export function ecrirePlages(section, plages) {
  db.transaction(() => {
    db.prepare('DELETE FROM horaire_plage WHERE section = ?').run(section);
    const ins = db.prepare('INSERT OR IGNORE INTO horaire_plage (section, jour, debut, fin) VALUES (?,?,?,?)');
    for (const p of plages) if (p.jour >= 1 && p.jour <= 7 && /^\d\d:\d\d$/.test(p.debut) && /^\d\d:\d\d$/.test(p.fin) && p.debut < p.fin) ins.run(section, p.jour, p.debut, p.fin);
  })();
  synchroniserCreneaux();
}
/*
 * LES LOCAUX (Charles, 9 octobre 2026 : « fais les locaux »). Le référentiel
 * des locaux (table local, clé = le NOM) dit ce qui existe ; ce qu'il ne dit
 * pas, c'est OÙ se donne une activité. D'où, par activité d'un bloc, la liste
 * des locaux POSSIBLES, dans l'ordre de préférence. Sans liste : la théorie et
 * les activités de tout le bloc prennent une classe ou un auditoire assez
 * grand ; un TP n'a pas de local d'office — un labo ne se devine pas — et la
 * simulation le dit « local à désigner ».
 */
export function locauxDuReferentiel() {
  try { return db.prepare('SELECT nom, type, places FROM local ORDER BY nom').all(); } catch { return []; }
}
export function locauxActivites(section, bloc, annee) {
  const m = new Map();
  for (const r of db.prepare(`SELECT cours_code, activite_id, locaux FROM horaire_local_activite
      WHERE annee_scolaire = ? AND section = ? AND bloc = ?`).all(annee, section, bloc)) {
    let l = []; try { l = JSON.parse(r.locaux || '[]'); } catch { l = []; }
    m.set(`${r.cours_code}#${r.activite_id}`, Array.isArray(l) ? l : []);
  }
  return m;
}
export function ecrireLocaux(section, bloc, annee, liste, par = null) {
  const connus = new Set(locauxDuReferentiel().map(l => l.nom));
  const ins = db.prepare(`INSERT INTO horaire_local_activite (annee_scolaire, section, bloc, cours_code, activite_id, locaux, maj_par, maj_le)
    VALUES (?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(annee_scolaire, section, bloc, cours_code, activite_id) DO UPDATE SET locaux = excluded.locaux, maj_par = excluded.maj_par, maj_le = excluded.maj_le`);
  db.transaction(() => {
    for (const x of liste) {
      if (!x?.cours_code) continue;
      // Un local inconnu du référentiel ne s'enregistre pas : on choisit, on ne tape pas.
      const l = [...new Set((Array.isArray(x.locaux) ? x.locaux : []).map(String).filter(n => connus.has(n)))];
      ins.run(annee, section, bloc, String(x.cours_code), Number(x.activite_id) || 0, JSON.stringify(l), par);
    }
  })();
}

/** Comparaison lexicographique de deux scores. */
const plusGrand = (x, y) => { const i = x.findIndex((v, j) => v !== y[j]); return i >= 0 && x[i] > y[i]; };
const minutes = (d, f) => { const [a, b] = d.split(':').map(Number); const [c, e] = f.split(':').map(Number); return (c * 60 + e) - (a * 60 + b); };
const iso = d => d.toISOString().slice(0, 10);

/** Les créneaux de l'année : [{ date, semaine, quadri, debut, fin, minutes }]. */
function creneaux(section, annee) {
  const plages = plagesDe(section);
  const [a1, a2] = String(annee).split('-').map(Number);
  const feries = new Set([...joursFeries(a1), ...joursFeries(a2)].map(([d]) => d));
  /* LES VACANCES AUSSI, MARQUÉES « congé » (Charles, 10 octobre 2026 : « faites
     sauter les congés, je veux donner cours ! ») : une UE peut choisir d'y avoir
     cours. Une semaine de congé porte le numéro de la semaine de cours qui la
     précède, plus un demi — elle se range entre les deux. */
  const toutes = db.prepare(`SELECT date_debut, date_fin, type FROM annee_calendrier WHERE annee_scolaire = ? AND type IN ('cours', 'vacances') ORDER BY date_debut`).all(annee);
  const semaines = toutes.filter(x => x.type === 'cours');
  const finQ1 = db.prepare(`SELECT MAX(date_fin) f FROM annee_calendrier WHERE annee_scolaire = ? AND type = 'ev1'`).get(annee)?.f || `${a2}-01-31`;
  const out = [];
  let k = 0;
  toutes.forEach(s => {
    const conge = s.type !== 'cours';
    if (!conge) k++;
    const num = conge ? k + 0.5 : k;
    // La semaine de cours s'arrête au vendredi dans le calendrier ; le samedi
    // de la même semaine en fait partie quand la section y donne cours.
    const fin = new Date(`${s.date_debut}T12:00:00Z`); fin.setUTCDate(fin.getUTCDate() + 6);
    for (let d = new Date(`${s.date_debut}T12:00:00Z`); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = iso(d), j = d.getUTCDay() || 7;
      if (feries.has(date)) continue;
      for (const p of plages.filter(x => x.jour === j)) out.push({ date, semaine: num, conge, jour: j, quadri: date <= finQ1 ? 'Q1' : 'Q2', debut: p.debut, fin: p.fin, minutes: minutes(p.debut, p.fin) });
    }
  });
  return { out, nbSemaines: semaines.length, plages };
}

/** Les séances à placer : la théorie (tout le bloc) et chaque groupe de chaque activité. */
function demandes(c, annee) {
  const B = c.nb_briques;
  const toutes = Array.from({ length: Math.max(1, B) }, (_, i) => i + 1);
  const brAct = new Map(c.activites.map(a => [`${a.cours_code}#${a.activite_id}`, a]));
  const lignes = c.ues.length ? db.prepare(`SELECT a.ue_num, a.code_cours, COALESCE(a.activite_id, 0) act, COALESCE(a.num_organisation, 1) org, a.code,
      SUM(COALESCE(a.periodes_attribuees, 0)) periodes, MIN(a.professeur_id) professeur_id, MAX(t.libelle) libelle,
      GROUP_CONCAT(DISTINCT a.quadrimestre_attribue) quadris, MAX(COALESCE(c.is_stage, 0)) stage, MAX(c.cours_nom) cours_nom,
      MAX(p.nom) prof_nom, MAX(p.prenom) prof_prenom
    FROM attribution a LEFT JOIN activite_type t ON t.id = a.activite_id
    LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
    LEFT JOIN professeur p ON p.id = a.professeur_id
    WHERE a.annee_scolaire = ? AND a.ue_num IN (${c.ues.map(() => '?').join(',')}) AND a.code_cours IS NOT NULL
      AND COALESCE(a.periodes_attribuees, 0) > 0 AND COALESCE(a.type_cours, '') <> 'Z'
    GROUP BY a.ue_num, a.code_cours, COALESCE(a.activite_id, 0), COALESCE(a.num_organisation, 1), a.code`).all(annee, ...c.ues.map(u => u.ue_num)) : [];
  // UNE UE SANS ATTRIBUTION SE LIT DANS SON VERRE : un groupe par bloc du verre, A, B, C…
  const attribuees = new Set(lignes.map(l => l.ue_num));
  for (const u of c.ues) {
    if (attribuees.has(u.ue_num)) continue;
    for (const a of activitesDeLaGrille(c.section, u.ue_num, annee)) {
      const g = Math.max(1, Number(a.groupes) || 1);
      for (let i = 0; i < g; i++) lignes.push({ ue_num: u.ue_num, code_cours: a.code_cours, act: a.activite_id, org: 1, code: g > 1 ? String.fromCharCode(65 + i) : null,
        periodes: (Number(a.periodes) || 0) / g, professeur_id: null, libelle: a.libelle, quadris: '', stage: a.stage, cours_nom: a.cours_nom, prof_nom: null, prof_prenom: null, verre: true });
    }
  }
  const out = [];
  for (const l of lignes) {
    if (l.stage) continue;                                    // le stage ne se planifie pas ici
    if (/[ée]valuation/i.test(l.libelle || '')) continue;     // les évaluations vont aux sessions d'examens
    const a = brAct.get(`${l.code_cours}#${l.act}`);
    let briques = toutes, groupe = l.code || 'Tous';
    if (a && a.inclus && B % a.nb_groupes === 0) {
      const i = a.groupes.findIndex(g => g.num_organisation === l.org && (g.groupe || null) === (l.code || null));
      if (i >= 0) { const larg = B / a.nb_groupes; briques = toutes.slice(i * larg, (i + 1) * larg); }
    }
    const q = String(a?.quadri || l.quadris || '');
    const quadri = q === 'Q1' || (/Q1/.test(q) && !/Q2/.test(q)) ? 'Q1' : q === 'Q2' || (/Q2/.test(q) && !/Q1/.test(q)) ? 'Q2' : 'AN';
    out.push({ cle: `${l.code_cours}#${l.act}#${l.org}#${l.code || ''}`, ue_num: l.ue_num, cours_code: l.code_cours, cours_nom: l.cours_nom,
      activite_id: l.act, tp: !!(a && a.inclus),
      activite: l.libelle || null, groupe, briques, tout_le_bloc: briques.length === toutes.length,
      professeur_id: l.professeur_id || null, professeur: l.prof_nom ? `${String(l.prof_nom).toUpperCase()} ${l.prof_prenom || ''}`.trim() : l.verre ? 'à attribuer' : null, source: l.verre ? 'verre' : 'attributions',
      periodes: l.periodes, minutes: l.periodes * MINUTES_PERIODE, quadri });
  }
  /* LE LABORATOIRE TEMPOREL NOURRIT LA SIMULATION (Charles, 10 octobre 2026 :
     « réunis tout dans le labo et relie les données »). Chaque demande reçoit
     la fenêtre de son UE (Dates des UE) et, si l'activité a ses propres dates
     dans la grille d'organisation (les couches), celles-là ; et le droit — ou
     non — d'avoir cours pendant les congés. Les attributions restent, en
     2026-2027, la source des groupes et des périodes. */
  const orgs = new Map();
  try {
    for (const o of db.prepare(`SELECT * FROM organisation_ue WHERE annee_scolaire = ? AND section = ? ORDER BY num_organisation`).all(annee, c.section)) {
      if (!orgs.has(o.ue_num)) orgs.set(o.ue_num, o);
    }
  } catch { /* table absente */ }
  const datesAct = new Map();
  try {
    for (const x of db.prepare(`SELECT o.ue_num, gc.cours_code, ga.activite_id, ga.date_debut, ga.date_fin
        FROM grille_activite ga JOIN grille_cours gc ON gc.id = ga.grille_cours_id JOIN organisation_ue o ON o.id = gc.organisation_id
        WHERE o.annee_scolaire = ? AND o.section = ? AND ga.date_debut IS NOT NULL`).all(annee, c.section)) {
      datesAct.set(`${x.ue_num}#${x.cours_code}#${x.activite_id}`, { de: x.date_debut, fin: x.date_fin || x.date_debut });
    }
  } catch { /* colonnes absentes */ }
  for (const d of out) {
    const o = orgs.get(d.ue_num), a = datesAct.get(`${d.ue_num}#${d.cours_code}#${d.activite_id}`);
    d.fenetre = a ? { de: a.de, fin: a.fin, source: 'activite' }
      : o?.date_debut && o?.date_fin ? { de: o.date_debut, fin: o.date_fin, source: 'ue' } : null;
    d.conges = !!o?.cours_pendant_conges;
  }
  return out;
}

/** Les stages BLOQUANTS du bloc : leurs semaines n'ont aucun cours. */
function stagesBloquants(c, annee) {
  if (!c.ues.length) return [];
  try {
    return db.prepare(`SELECT o.ue_num, o.date_debut AS de, o.date_fin AS fin FROM organisation_ue o
      WHERE o.annee_scolaire = ? AND o.section = ? AND COALESCE(o.stage_bloquant, 0) = 1 AND o.date_debut IS NOT NULL AND o.date_fin IS NOT NULL
        AND o.ue_num IN (${c.ues.map(() => '?').join(',')})`).all(annee, c.section, ...c.ues.map(u => u.ue_num));
  } catch { return []; }
}

/** La simulation. Rend la capacité, les séances placées et ce qui reste. */
/*
 * LE PLAN ENREGISTRÉ (lot 1 du planificateur, Charles, 10 octobre 2026 : « par
 * section entière, en créneaux fixes »). Une ligne de `plan_creneau` est un
 * créneau fixe d'un groupe : jour, plage, local, et la liste de ses semaines.
 * La simulation PROPOSE, on ADOPTE, on RETOUCHE ; une ligne retouchée à la main
 * est VERROUILLÉE et la simulation suivante place le reste autour.
 *   · mode « plan » (défaut) : tout le plan enregistré est posé tel quel, la
 *     simulation ne propose que ce qui n'y est pas encore ;
 *   · mode « recalcul » : seules les lignes verrouillées restent, tout le
 *     reste est proposé à nouveau.
 * Un conflit dans une ligne enregistrée (deux groupes, un enseignant, un local
 * au même moment) se NOMME sur la séance, il ne s'empêche pas.
 */
export function lignesDuPlan(section, bloc, annee) {
  return db.prepare(`SELECT * FROM plan_creneau WHERE annee_scolaire = ? AND section = ? AND bloc = ? ORDER BY verrouille DESC, id`)
    .all(annee, section, bloc).map(l => { let w = []; try { w = JSON.parse(l.semaines || '[]'); } catch { w = []; } return { ...l, semaines: w }; });
}

export function simuler(section, bloc, annee, { mode = 'plan' } = {}) {
  const c = cohorte(section, bloc, annee);
  const { out: slots, nbSemaines, plages } = creneaux(section, annee);
  const dem = demandes(c, annee);
  const stages = stagesBloquants(c, annee);
  const bloque = date => stages.some(x => date >= x.de && date <= x.fin);
  // Occupations : brique et enseignant, par créneau (date + début).
  const k = s => `${s.date}|${s.debut}`;
  const occB = new Map(), occP = new Map(), occL = new Map();
  const marquer = (m, cle, v) => { if (!m.has(cle)) m.set(cle, new Set()); m.get(cle).add(v); };
  // Les séances déjà posées ailleurs (toutes sections) occupent leurs enseignants.
  let posees = [];
  try {
    // UNE ALTERNATIVE, PAS UN COMPLÉMENT (Charles, 9 octobre 2026 : « Lucie doit
    // pouvoir proposer une alternative ») : l'horaire actuel de CETTE classe ne
    // contraint pas la proposition — c'est lui qu'on compare. Celui des autres
    // classes, oui : ses enseignants y sont occupés.
    posees = db.prepare(`SELECT date, heure_debut, heure_fin, professeur_id, local_texte FROM horaire_seance
      WHERE annee_scolaire = ? AND (professeur_id IS NOT NULL OR local_texte IS NOT NULL) AND COALESCE(annule, 0) = 0
        AND NOT (section = ? AND bloc = ?) AND COALESCE(source, '') <> 'simulation'`).all(annee, section, bloc);
  } catch { posees = []; }
  for (const h of posees) {
    for (const s of slots) if (s.date === h.date && s.debut < (h.heure_fin || '') && s.fin > (h.heure_debut || '')) {
      if (h.professeur_id) marquer(occP, k(s), h.professeur_id);
      // Le local d'une autre classe est pris — sauf le distanciel, qui n'en occupe aucun.
      if (h.local_texte && !/distanciel|à distance|en ligne/i.test(h.local_texte)) marquer(occL, k(s), h.local_texte);
    }
  }
  // L'enseignant doit être DISPONIBLE (saisie du secrétariat) — sans saisie pour ce quadrimestre, il l'est partout.
  const dispos = disponibilites();
  const dispoProf = (s, d) => {
    if (!d.professeur_id) return true;
    const q = dispos.get(d.professeur_id); if (!q) return true;
    const set = q.get(s.quadri) || q.get('AN'); if (!set) return true;
    return set.has(`${s.jour}|${s.debut}`);
  };
  const libreSansJours = (s, d) => !(d.briques.some(b => occB.get(k(s))?.has(b)) || (d.professeur_id && occP.get(k(s))?.has(d.professeur_id))) && dispoProf(s, d);
  // Les jours de présence de chaque brique, semaine par semaine.
  const regles = reglesDe(section);
  const joursB = new Map();
  const jours = (s, b) => joursB.get(`${s.semaine}|${b}`);
  const dansLesJours = (s, d) => d.briques.every(b => { const j = jours(s, b); return !j || j.has(s.jour) || j.size < regles.jours_max; });
  const libre = (s, d) => libreSansJours(s, d) && dansLesJours(s, d);
  // Regroupé : tous les étudiants du groupe viennent déjà ce jour-là.
  const regroupe = (s, d) => d.briques.every(b => jours(s, b)?.has(s.jour));
  const salleLibre = (s, l) => !l || !occL.get(k(s))?.has(l);
  // LES LOCAUX POSSIBLES de chaque demande, et son effectif.
  const referentiel = locauxDuReferentiel();
  const parNom = new Map(referentiel.map(l => [l.nom, l]));
  const reglesLocaux = locauxActivites(section, bloc, annee);
  const nbGroupes = new Map();
  for (const d of dem) { const a = `${d.cours_code}#${d.activite_id}`; nbGroupes.set(a, (nbGroupes.get(a) || 0) + 1); }
  for (const d of dem) {
    const inscrits = c.etudiants.filter(e => e.ues.includes(d.ue_num)).length;
    d.effectif = d.tp && c.nb_briques ? Math.ceil(inscrits * d.briques.length / c.nb_briques)
      : Math.ceil(inscrits / (nbGroupes.get(`${d.cours_code}#${d.activite_id}`) || 1));
    const choisis = (reglesLocaux.get(`${d.cours_code}#${d.activite_id}`) || []).filter(n => parNom.has(n));
    if (choisis.length) { d.locaux = choisis; d.local_origine = 'choisi'; }
    else if (!d.tp) {
      d.locaux = referentiel.filter(l => /auditoire|classe/i.test(l.type || '') && (l.places || 0) >= d.effectif)
        .sort((x, y) => x.places - y.places).map(l => l.nom);
      d.local_origine = d.locaux.length ? 'auto' : 'aucun';
    } else { d.locaux = []; d.local_origine = 'a_designer'; }
  }
  const poser = (s, d, l) => {
    if (l) marquer(occL, k(s), l);
    d.briques.forEach(b => marquer(joursB, `${s.semaine}|${b}`, s.jour));
    if (!occB.has(k(s))) occB.set(k(s), new Set()); d.briques.forEach(b => occB.get(k(s)).add(b));
    if (d.professeur_id) { if (!occP.has(k(s))) occP.set(k(s), new Set()); occP.get(k(s)).add(d.professeur_id); }
  };
  // LA RÉGULARITÉ D'ABORD (Charles, 9 octobre 2026 : « pour les étudiants et
  // les profs, la régularité est importante »). Chaque demande reçoit UN
  // CRÉNEAU FIXE — un jour, une plage — qu'elle garde semaine après semaine
  // jusqu'à épuiser ses périodes ; un férié décale la fin d'une semaine. Quand
  // un créneau ne suffit pas (plus d'une séance par semaine), un second créneau
  // fixe s'ajoute. Seul ce qui ne trouve aucun créneau régulier se place au
  // mieux, et se dit « irrégulier ».
  // Le plus contraint d'abord : tout le bloc (théorie), puis les groupes les plus longs.
  const ordre = [...dem].sort((x, y) => (y.tout_le_bloc - x.tout_le_bloc) || (y.minutes - x.minutes));
  const seances = [], restes = [], fixes = new Map();
  const ajouter = (s, d, regulier, local, etat = 'propose', extra = {}) => {
    poser(s, d, local); seances.push({ ...s, cle: d.cle, cours_code: d.cours_code, cours_nom: d.cours_nom, activite_id: d.activite_id, activite: d.activite, groupe: d.groupe,
      professeur: d.professeur, briques: d.briques, tout_le_bloc: d.tout_le_bloc, regulier, local: local || null, etat, ...extra });
  };
  // LE PLAN ENREGISTRÉ D'ABORD : ses lignes se posent telles quelles — les
  // verrouillées toujours, les autres en mode « plan » seulement.
  const parCle = new Map(dem.map(d => [d.cle, d]));
  const dejaPlace = new Map(), orphelines = [];
  for (const d of dem) fixes.set(d.cle, []);
  for (const l of lignesDuPlan(section, bloc, annee).filter(x => x.verrouille || mode === 'plan')) {
    const d = parCle.get(l.cle);
    if (!d) { orphelines.push({ id: l.id, cours_code: l.cours_code, groupe: l.groupe, raison: 'plus d’attribution pour ce groupe' }); continue; }
    const etat = l.verrouille ? 'verrouille' : 'plan';
    const posees = [];
    for (const w of l.semaines) {
      const s = slots.find(x => x.semaine === w && x.jour === l.jour && x.debut === l.debut);
      if (!s) continue;                                   // un férié tombé depuis : la séance n'existe plus ce jour-là
      const conflits = [];
      if (d.briques.some(b => occB.get(k(s))?.has(b))) conflits.push('étudiants');
      if (d.professeur_id && occP.get(k(s))?.has(d.professeur_id)) conflits.push('enseignant');
      if (l.local && occL.get(k(s))?.has(l.local)) conflits.push('local');
      if (!dispoProf(s, d)) conflits.push('enseignant indisponible');
      ajouter(s, d, true, l.local, etat, { plan_id: l.id, conflits });
      posees.push(s);
    }
    dejaPlace.set(d.cle, (dejaPlace.get(d.cle) || 0) + posees.length);
    if (posees.length) fixes.get(d.cle).push({ type: `${l.jour}|${l.debut}`, plan_id: l.id, etat, local: l.local || null, jour: l.jour, jour_nom: JOURS[l.jour],
      debut: l.debut, fin: l.fin, de: posees[0].semaine, a: posees[posees.length - 1].semaine, seances: posees.length, trous: 0,
      conflits: [...new Set(seances.filter(x => x.plan_id === l.id).flatMap(x => x.conflits))] });
  }
  for (const d of ordre) {
    const possibles = slots.filter(s => (d.quadri === 'AN' || s.quadri === d.quadri)
      && (!s.conge || d.conges)
      && (!d.fenetre || (s.date >= d.fenetre.de && s.date <= d.fenetre.fin))
      && !bloque(s.date));
    const semaines = [...new Set(possibles.map(s => s.semaine))];
    const duree = possibles[0]?.minutes || 120;
    const besoin = Math.ceil(d.minutes / duree);
    let place = Math.min(besoin, dejaPlace.get(d.cle) || 0);
    if (place >= besoin) continue;
    if (!semaines.length) { restes.push({ ...d, manque: besoin, raison: d.fenetre ? 'aucune semaine de cours dans sa période (dates de l’UE ou de l’activité, stage bloquant)' : 'aucune semaine de cours dans son quadrimestre' }); continue; }
    // Les créneaux types (jour + début) et leurs occurrences, semaine par semaine.
    const types = new Map();
    for (const s of possibles) {
      const t = `${s.jour}|${s.debut}`;
      if (!types.has(t)) types.set(t, []);
      types.get(t).push(s);
    }
    while (place < besoin) {
      // Pour chaque créneau type : les occurrences libres, prises dans l'ordre,
      // jusqu'au besoin. Un TROU (semaine où le créneau existe mais est occupé)
      // casse la régularité ; un férié non (le créneau n'existe pas ce jour-là).
      // LE MÊME LOCAL CHAQUE SEMAINE : un créneau fixe est un couple
      // (créneau, local) ; à égalité, le local préféré — le premier de la liste.
      let meilleur = null;
      const salles = d.local_origine === 'a_designer' ? [null] : d.locaux;
      for (const [t, occ] of types) {
        if ([...fixes.get(d.cle)].some(f => f.type === t)) continue;
        for (const [rang, l] of salles.entries()) {
          const reste = besoin - place, choisies = [];
          let trous = 0;
          for (const s of occ) {
            if (choisies.length >= reste) break;
            if (libre(s, d) && salleLibre(s, l)) choisies.push(s);
            else if (choisies.length) trous++;
          }
          if (!choisies.length) continue;
          // Score : couvrir le plus, avec le moins de trous, regroupé si la section le veut, finir le plus tôt, le local préféré.
          const score = [choisies.length, -trous, regles.regrouper ? choisies.filter(x => regroupe(x, d)).length : 0,
            -choisies[choisies.length - 1].semaine, -rang];
          if (!meilleur || plusGrand(score, meilleur.score)) meilleur = { t, l, choisies, trous, score };
        }
      }
      // Un créneau qui ne porterait qu'une poignée de séances n'est pas un créneau fixe.
      if (!meilleur || (meilleur.choisies.length < Math.min(3, besoin - place) && fixes.get(d.cle).length)) break;
      const [s0] = meilleur.choisies, sN = meilleur.choisies[meilleur.choisies.length - 1];
      meilleur.choisies.forEach(s => ajouter(s, d, true, meilleur.l));
      place += meilleur.choisies.length;
      fixes.get(d.cle).push({ type: meilleur.t, etat: 'propose', local: meilleur.l || null, jour: s0.jour, jour_nom: JOURS[s0.jour], debut: s0.debut, fin: s0.fin,
        de: s0.semaine, a: sN.semaine, seances: meilleur.choisies.length, trous: meilleur.trous });
    }
    // Ce qui reste : au mieux, n'importe quel créneau libre — signalé irrégulier.
    let irreguliers = 0;
    for (const s of possibles) {
      if (place >= besoin) break;
      if (!libre(s, d)) continue;
      const l = d.local_origine === 'a_designer' ? null : d.locaux.find(x => salleLibre(s, x));
      if (l === undefined) continue;
      ajouter(s, d, false, l); place++; irreguliers++;
    }
    if (irreguliers) fixes.get(d.cle).irreguliers = irreguliers;
    if (place < besoin) {
      const conflitProf = d.professeur_id && possibles.some(s => !d.briques.some(b => occB.get(k(s))?.has(b)) && occP.get(k(s))?.has(d.professeur_id));
      const indispo = d.professeur_id && possibles.some(s => !d.briques.some(b => occB.get(k(s))?.has(b)) && !dispoProf(s, d));
      const sansSalle = d.local_origine !== 'a_designer' && possibles.some(s => libre(s, d));
      const parJours = possibles.some(s => libreSansJours(s, d) && !dansLesJours(s, d));
      restes.push({ ...d, place, manque: besoin - place,
        raison: parJours && !possibles.some(s => libre(s, d)) ? `ses étudiants ont déjà leurs ${regles.jours_max} jours de présence les semaines où le créneau serait libre`
          : d.local_origine === 'aucun' ? `aucune classe ni auditoire de ${d.effectif} places au référentiel des locaux`
          : sansSalle ? 'ses locaux possibles sont tous occupés quand étudiants et enseignant sont libres'
          : conflitProf ? 'l’enseignant est déjà occupé sur les créneaux où ses étudiants sont libres'
          : indispo ? `${d.professeur || 'l’enseignant'} n’est pas disponible sur les créneaux où ses étudiants sont libres`
          : 'plus de créneau libre pour ces étudiants dans le quadrimestre' });
    }
  }
  // LES JOURS DE PRÉSENCE, brique par brique : le plus et la moyenne par semaine de cours.
  const presence = Array.from({ length: Math.max(1, c.nb_briques) }, (_, i) => {
    const n = [...new Set(slots.map(x => x.semaine))].map(w => joursB.get(`${w}|${i + 1}`)?.size || 0).filter(Boolean);
    return { brique: i + 1, max: n.length ? Math.max(...n) : 0, moyenne: n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length * 10) / 10 : 0 };
  });
  // La capacité, brique par brique : heures disponibles et heures demandées.
  const dispo = slots.filter(s => !s.conge && !bloque(s.date)).reduce((t, s) => t + s.minutes, 0);
  const demandeParBrique = Array.from({ length: Math.max(1, c.nb_briques) }, (_, i) => dem.filter(d => d.briques.includes(i + 1)).reduce((t, d) => t + d.minutes, 0));
  // LES SEMAINES (leur lundi) et L'HORAIRE ACTUEL de la classe, pour comparer.
  const semainesListe = db.prepare(`SELECT date_debut FROM annee_calendrier WHERE annee_scolaire = ? AND type = 'cours' ORDER BY date_debut`).all(annee)
    .map((x, i) => ({ num: i + 1, lundi: x.date_debut }));
  let actuel = { seances: 0, heures: 0, premiere: null, derniere: null };
  try {
    const a = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(minutes), 0) m, MIN(date) d, MAX(date) f FROM horaire_seance
      WHERE annee_scolaire = ? AND section = ? AND bloc = ? AND COALESCE(annule, 0) = 0 AND COALESCE(source, '') <> 'simulation'`).get(annee, section, bloc);
    actuel = { seances: a.n, heures: Math.round(a.m / 60), premiere: a.d, derniere: a.f };
  } catch { /* table absente */ }
  const heuresDemandeesBloc = Math.round(dem.reduce((t, d) => t + d.minutes, 0) / 60);
  return {
    section, bloc, annee, mode, regles, presence, nb_briques: c.nb_briques, orphelines,
    // Ce que la simulation a lu du laboratoire : on le dit, pour qu'on sache d'où vient une contrainte.
    liens: { ues_datees: new Set(dem.filter(d => d.fenetre?.source === 'ue').map(d => d.ue_num)).size,
      activites_datees: new Set(dem.filter(d => d.fenetre?.source === 'activite').map(d => `${d.cours_code}#${d.activite_id}`)).size,
      ues_conges: new Set(dem.filter(d => d.conges).map(d => d.ue_num)).size, stages_bloquants: stages },
    /* TOUTE L'ANNÉE, PAS SEULEMENT LES SEMAINES DE COURS (Charles, 10 octobre 2026 :
       « il faut placer les stages, les examens, etc. ») : le calendrier entier
       pour la ligne du temps, et les UE de stage du bloc avec leurs dates — celles
       de Dates des UE (organisation_ue), la seule source de ces dates. */
    calendrier: db.prepare(`SELECT date_debut, date_fin, type, label FROM annee_calendrier WHERE annee_scolaire = ? ORDER BY date_debut`).all(annee),
    stages: c.ues.length ? db.prepare(`SELECT o.id, o.ue_num, o.num_organisation, o.date_debut, o.date_fin,
        (SELECT ue_nom FROM ue WHERE ue_num = o.ue_num AND annee_scolaire = o.annee_scolaire LIMIT 1) ue_nom
      FROM organisation_ue o
      WHERE o.annee_scolaire = ? AND o.section = ? AND o.ue_num IN (${c.ues.map(() => '?').join(',')})
        AND EXISTS (SELECT 1 FROM cours c WHERE c.ue_num = o.ue_num AND c.annee_scolaire = o.annee_scolaire AND COALESCE(c.is_stage, 0) = 1)
      ORDER BY o.ue_num, o.num_organisation`).all(annee, section, ...c.ues.map(u => u.ue_num)) : [],
    plan: { lignes: db.prepare('SELECT COUNT(*) n, COALESCE(SUM(verrouille), 0) v FROM plan_creneau WHERE annee_scolaire = ? AND section = ? AND bloc = ?').get(annee, section, bloc) },
    // Pour la vue « un étudiant » : sa brique dit ses séances.
    // Et, pour les activités hors briques (séminaires…), son groupe dans la répartition.
    etudiants: (() => {
      const g = new Map();
      try {
        for (const x of db.prepare(`SELECT etudiant_id, cours_code, COALESCE(activite_id, 0) act, groupe_code FROM etudiant_cours_groupe WHERE annee_scolaire = ?`).all(annee)) {
          if (!g.has(x.etudiant_id)) g.set(x.etudiant_id, {});
          g.get(x.etudiant_id)[`${x.cours_code}#${x.act}`] = x.groupe_code;
        }
      } catch { /* table absente */ }
      return c.etudiants.map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom, brique: c.briques[e.id] || null, groupes: g.get(e.id) || {} }));
    })(), nb_semaines: nbSemaines, semaines: semainesListe, actuel, heures_attribuees: heuresDemandeesBloc, plages: plages.map(p => ({ ...p, jour_nom: JOURS[p.jour] })),
    creneaux: slots.length, heures_disponibles: Math.round(dispo / 60),
    heures_demandees_max: Math.round(Math.max(...demandeParBrique) / 60), heures_demandees_min: Math.round(Math.min(...demandeParBrique) / 60),
    nb_demandes: dem.length, nb_seances: seances.length,
    activites: dem.map(d => ({ cle: d.cle, cours_code: d.cours_code, activite: d.activite, groupe: d.groupe, professeur: d.professeur,
      periodes: d.periodes, quadri: d.quadri, tout_le_bloc: d.tout_le_bloc,
      besoin: Math.ceil(d.minutes / (slots[0]?.minutes || 120)), place: seances.filter(s => s.cle === d.cle).length,
      creneaux_fixes: (fixes.get(d.cle) || []).map(({ type, ...f }) => f), irreguliers: fixes.get(d.cle)?.irreguliers || 0,
      activite_id: d.activite_id, briques: d.briques, effectif: d.effectif, locaux: d.locaux, local_origine: d.local_origine })),
    referentiel_locaux: referentiel,
    restes, seances: seances.sort((x, y) => (x.date + x.debut).localeCompare(y.date + y.debut)),
  };
}


/**
 * ADOPTER LA PROPOSITION. Ce que l'écran montre (même mode) s'enregistre : une
 * ligne par série — même groupe, même jour, même plage, même local. On adopte
 * tout, ou les seules activités cochées (`cles`). Les lignes VERROUILLÉES ne
 * sont jamais touchées ; les autres lignes des activités adoptées sont
 * remplacées. Rien ne s'écrit sans le compte rendu d'abord (`simulation`).
 */
export function adopterProposition(section, bloc, annee, { mode = 'plan', cles = null, simulation = true, par = null } = {}) {
  const sim = simuler(section, bloc, annee, { mode });
  const vise = x => !cles || cles.includes(x.cle);
  const series = new Map();
  for (const x of sim.seances.filter(y => y.etat === 'propose' && vise(y))) {
    const k = `${x.cle}|${x.jour}|${x.debut}|${x.local || ''}`;
    if (!series.has(k)) series.set(k, { x, semaines: [] });
    series.get(k).semaines.push(x.semaine);
  }
  // En mode « plan », le plan enregistré est déjà posé : on n'ajoute que ce qui manque.
  // En mode « recalcul », la proposition remplace les lignes non verrouillées.
  const anciennes = mode === 'recalcul' ? lignesDuPlan(section, bloc, annee).filter(l => !l.verrouille && vise(l)) : [];
  const rapport = { a_ecrire: series.size, seances: [...series.values()].reduce((t, v) => t + v.semaines.length, 0),
    remplacees: anciennes.length, verrouillees: sim.plan.lignes.v, restes: sim.restes.length };
  if (simulation) return rapport;
  const ins = db.prepare(`INSERT INTO plan_creneau (annee_scolaire, section, bloc, cle, cours_code, activite_id, groupe, jour, debut, fin, local, semaines, verrouille, source, maj_par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 0, 'simulation', ?)`);
  db.transaction(() => {
    const del = db.prepare('DELETE FROM plan_creneau WHERE id = ? AND verrouille = 0');
    for (const l of anciennes) del.run(l.id);
    for (const { x, semaines } of series.values())
      ins.run(annee, section, bloc, x.cle, x.cours_code, x.activite_id || 0, x.groupe || null, x.jour, x.debut, x.fin, x.local || null,
        JSON.stringify(semaines.sort((p, q) => p - q)), par);
  })();
  return rapport;
}

/**
 * RETOUCHER UNE LIGNE DU PLAN : un autre jour, une autre plage, un autre local.
 * Les SEMAINES restent les mêmes. Une ligne retouchée est verrouillée — c'est
 * une décision prise à la main, la simulation ne la défera pas.
 */
export function retoucherLigne(id, { jour, debut, fin, local, verrouille }, par = null) {
  const l = db.prepare('SELECT * FROM plan_creneau WHERE id = ?').get(id);
  if (!l) throw Object.assign(new Error('Ligne du plan introuvable'), { status: 404 });
  const champs = {};
  if (jour != null) champs.jour = Number(jour);
  if (debut) champs.debut = String(debut);
  if (fin) champs.fin = String(fin);
  if (local !== undefined) champs.local = local || null;
  if (debut && !fin) {
    const p = db.prepare('SELECT fin FROM horaire_plage WHERE section = ? AND jour = ? AND debut = ?').get(l.section, champs.jour ?? l.jour, debut);
    if (p) champs.fin = p.fin;
  }
  const retouche = Object.keys(champs).length > 0;
  champs.verrouille = verrouille != null ? (verrouille ? 1 : 0) : retouche ? 1 : l.verrouille;
  if (retouche) champs.source = 'main';
  const sets = Object.keys(champs).map(c => `${c} = @${c}`).join(', ');
  db.prepare(`UPDATE plan_creneau SET ${sets}, maj_par = @par, maj_le = datetime('now') WHERE id = @id`).run({ ...champs, par, id });
  return db.prepare('SELECT * FROM plan_creneau WHERE id = ?').get(id);
}

export function retirerLigne(id) {
  return db.prepare('DELETE FROM plan_creneau WHERE id = ?').run(id).changes;
}

/**
 * L'HORAIRE D'UN GROUPE OU D'UN ÉTUDIANT, À IMPRIMER (Charles, 9 octobre 2026 :
 * « sortir l'horaire d'un groupe, d'un étudiant »). Deux parties : la SEMAINE
 * TYPE — les créneaux fixes, avec leurs semaines —, puis la LISTE DES SÉANCES
 * de l'année, date par date. Un étudiant appartient à une brique : ses séances
 * sont la théorie du bloc et les groupes qui contiennent sa brique.
 *
 * C'est une PROPOSITION de la simulation, et la pièce le dit en tête : elle ne
 * vaut pas horaire officiel tant que le plan n'est pas adopté. Sur papier, la
 * charte : tuiles blanches, liseré marine — les couleurs d'écran ne s'impriment
 * pas.
 */
/**
 * À QUI S'ADRESSE UNE SÉANCE. Trois cas : tout le bloc (la théorie) ; un groupe
 * de TP rangé en briques (la brique de l'étudiant le dit) ; un groupe HORS
 * briques — un séminaire en deux groupes — que seule la répartition nominative
 * connaît. Pour une brique sans étudiant nommé, ces derniers restent tous
 * montrés : on ne sait pas lequel la brique suivra.
 */
export const multiGroupe = x => x.tout_le_bloc && x.groupe && x.groupe !== 'Tous' && x.groupe !== 'Ts';
export function pourQui(x, b, e = null) {
  if (b == null && !e) return true;
  if (multiGroupe(x)) {
    const g = e?.groupes?.[`${x.cours_code}#${x.activite_id}`];
    return g ? g === x.groupe : true;
  }
  return x.tout_le_bloc || (x.briques || []).includes(b);
}

export function documentHoraire(section, bloc, annee, { brique = null, etudiantId = null } = {}) {
  const sim = simuler(section, bloc, annee);
  let b = brique ? Number(brique) : null, qui = brique ? `Groupe d’étudiants — brique ${brique}` : 'Tout le bloc', e = null;
  if (etudiantId) {
    e = sim.etudiants.find(x => x.id === Number(etudiantId));
    if (!e) throw Object.assign(new Error('Étudiant inconnu dans ce bloc'), { status: 404 });
    if (!e.brique) throw Object.assign(new Error('Cet étudiant n’est rangé dans aucune brique : remplissez d’abord les groupes communs.'), { status: 409 });
    b = e.brique; qui = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''} — brique ${e.brique}`;
  }
  const pour = x => pourQui(x, b, e);
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const lundiDe = n => sim.semaines[n - 1]?.lundi;
  const dm = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  const plus = (iso, j) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + j); return d.toISOString().slice(0, 10); };
  const grp = g => (g && g !== 'Tous' && g !== 'Ts' ? ` <span class="gr">${esc(g)}</span>` : '');
  // 1. LA SEMAINE TYPE.
  const acts = sim.activites.filter(pour);
  const plages = [...new Set(sim.plages.map(p => `${p.debut}-${p.fin}`))].sort();
  const jours = [...new Set(sim.plages.map(p => p.jour))].sort();
  const cellule = (j, h) => acts.flatMap(a => (a.creneaux_fixes || []).filter(f => f.jour === j && `${f.debut}-${f.fin}` === h).map(f => {
    const de = lundiDe(f.de), a2 = lundiDe(f.a);
    const aConfirmer = (b != null || e) && multiGroupe(a) && !e?.groupes?.[`${a.cours_code}#${a.activite_id}`];
    return `<div class="tu${aConfirmer ? ' conf' : ''}"><b>${esc(a.cours_code)}</b>${grp(a.groupe)}${aConfirmer ? ' <span class="cf">groupe à confirmer</span>' : ''} <span class="nm">${esc(String(a.activite || '').replace(/\s*\((TP|TH)\)\s*$/i, ''))}</span>
      <div class="pt">${f.local ? `${esc(f.local)} · ` : ''}${de ? `${dm(de)} → ${dm(plus(a2, f.jour - 1))}` : ''} · ${f.seances} séance${f.seances > 1 ? 's' : ''}</div></div>`;
  })).join('');
  const semaineType = `<table class="st"><thead><tr><th class="pl">Plage</th>${jours.map(j => `<th>${JOURS[j]}</th>`).join('')}</tr></thead><tbody>
    ${plages.map(h => `<tr><td class="pl">${h.replace('-', '<br>')}</td>${jours.map(j => `<td>${cellule(j, h)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  // 2. LA LISTE DES SÉANCES.
  const seances = sim.seances.filter(pour);
  const heures = Math.round(seances.reduce((t, x) => t + x.minutes, 0) / 60);
  const lignes = seances.map(x => `<tr><td class="n">${x.semaine}</td><td class="n">${JOURS[x.jour].slice(0, 3)}. ${dm(x.date)}</td><td class="n">${x.debut}–${x.fin}</td>
    <td class="c"><b>${esc(x.cours_code)}</b> ${esc(x.cours_nom || '')}<span class="ac"> — ${esc(x.activite || '')}</span></td><td class="n">${x.tout_le_bloc ? 'bloc' : esc(x.groupe)}</td>
    <td class="n">${esc(x.local || '')}</td><td class="n">${esc(x.professeur || '')}</td></tr>`).join('');
  const liste = `<table class="li"><thead><tr><th>Sem.</th><th>Date</th><th>Heure</th><th>Cours — activité</th><th>Groupe</th><th>Local</th><th>Enseignant</th></tr>
    <tr class="tot"><td colspan="7">${seances.length} séance(s) · ${heures} h</td></tr></thead><tbody>${lignes}</tbody></table>`;
  const html = envelopperDocument({
    titre: `Horaire proposé — ${section} ${bloc} — ${qui}`,
    orientation: 'paysage',
    entete: { titre: 'Horaire proposé', sous: `${section} · ${bloc} · ${annee} — ${qui}`, compact: true },
    styles: `.avert { font-size: 8.5pt; color: #8a4b08; border-left: 1mm solid #B45309; padding: 1.2mm 2.5mm; margin: 0 0 3mm; }
      table { border-collapse: collapse; width: 100%; font-size: 8pt; color: #16253D; }
      th { text-align: left; background: #EAF0F7; color: #16406A; font-weight: 600; padding: 1.2mm 1.5mm; border-bottom: 0.3mm solid #D8DCE4; }
      td { padding: 1mm 1.5mm; border-bottom: 0.2mm solid #E4E8EF; vertical-align: top; }
      table.st { table-layout: fixed; } table.st td, table.st th { border-left: 0.2mm solid #E4E8EF; }
      table.st .pl { width: 15mm; font-weight: 600; white-space: nowrap; }
      .tu { border: 0.3mm solid #D8DCE4; border-left: 1mm solid #16406A; border-radius: 0 1.5mm 1.5mm 0; padding: 0.5mm 1.2mm; margin: 0 0 0.7mm; break-inside: avoid; font-size: 7.5pt; line-height: 1.2; }
      .tu .nm { color: #55657E; font-size: 6.5pt; } .tu.conf { border-style: dashed; } .tu .cf { color: #B45309; font-size: 6.5pt; font-weight: 600; } .tu .pt { color: #55657E; font-size: 6.5pt; }
      table.st tr { break-inside: avoid; } table.st td { padding: 0.8mm 1mm; }
      table.li { font-size: 7pt; } table.li td { padding: 0.5mm 1.2mm; } table.li td.n { white-space: nowrap; }
      table.li td.c { overflow: hidden; } table.li .ac { color: #55657E; }
      .gr { display: inline-block; min-width: 3.4mm; padding: 0 0.8mm; border: 0.3mm solid #16406A; border-radius: 1mm; font-size: 6.5pt; font-weight: 700; text-align: center; }
      h2 { font-size: 10pt; color: #16406A; margin: 4mm 0 1.5mm; }
      .saut { break-before: page; }
      tr.tot td { font-weight: 600; background: #F4F6FA; }
      table.li tr { break-inside: avoid; }`,
    html: `<div class="avert">Proposition calculée par Lucie (simulation de l’année) : elle ne remplace pas l’horaire officiel tant qu’elle n’est pas adoptée.</div>
      <h2>La semaine type — ${acts.length} activité(s)</h2>${semaineType}
      <div class="saut"></div><h2>Les séances de l’année</h2>${liste}`,
  });
  const nomF = `Horaire_${section}_${bloc}_${b != null ? `brique${b}` : 'bloc'}_${annee}`.replace(/[^A-Za-z0-9_-]+/g, '_');
  return { html, nom: nomF };
}

/**
 * POSER LA SIMULATION DANS L'HORAIRE (Charles, 9 octobre 2026). Les séances
 * deviennent de vraies séances (horaire_seance, source « simulation »), que
 * l'Horaire de la semaine montre, déplace et recopie. Poser à nouveau remplace
 * les séances simulées du bloc — JAMAIS une séance retouchée à la main
 * (modifie_lucie = 1). Un groupe de TP porte ses briques (« B4-6 ») : deux TP
 * en parallèle sur des briques différentes ne sont pas un conflit de classe.
 */
export function poserSimulation(section, bloc, annee, { simulation = true, par = null } = {}) {
  const sim = simuler(section, bloc, annee);
  const classe = `${section} ${bloc}`;
  const anciennes = db.prepare(`SELECT COUNT(*) n FROM horaire_seance WHERE annee_scolaire = ? AND section = ? AND bloc = ?
    AND source = 'simulation' AND COALESCE(modifie_lucie, 0) = 0`).get(annee, section, bloc).n;
  const gardees = db.prepare(`SELECT COUNT(*) n FROM horaire_seance WHERE annee_scolaire = ? AND section = ? AND bloc = ?
    AND source = 'simulation' AND COALESCE(modifie_lucie, 0) = 1`).get(annee, section, bloc).n;
  const rapport = { a_poser: sim.seances.length, remplacees: anciennes, gardees, restes: sim.restes.length };
  if (simulation) return rapport;
  const groupeId = db.prepare('SELECT id FROM groupe WHERE annee_scolaire = ? AND code_cours = ? AND nom = ? LIMIT 1');
  const profId = new Map();
  const ins = db.prepare(`INSERT INTO horaire_seance (annee_scolaire, classe, section, bloc, date, heure_debut, heure_fin, minutes,
      cours_code, ue_num, matiere, professeur_id, groupe_id, sous_groupe, local_texte, source, modifie_lucie, cree_par, cree_le)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'simulation', 0, ?, datetime('now'))`);
  db.transaction(() => {
    db.prepare(`DELETE FROM horaire_seance WHERE annee_scolaire = ? AND section = ? AND bloc = ?
      AND source = 'simulation' AND COALESCE(modifie_lucie, 0) = 0`).run(annee, section, bloc);
    for (const x of sim.seances) {
      const [, , , code] = x.cle.split('#');
      if (!profId.has(x.cle)) {
        const a = db.prepare(`SELECT professeur_id, ue_num FROM attribution WHERE annee_scolaire = ? AND code_cours = ?
          AND COALESCE(activite_id, 0) = ? AND COALESCE(code, '') = ? LIMIT 1`).get(annee, x.cours_code, Number(x.cle.split('#')[1]), code || '');
        profId.set(x.cle, a || {});
      }
      const a = profId.get(x.cle);
      const g = code ? groupeId.get(annee, x.cours_code, code)?.id || null : null;
      const sg = x.tout_le_bloc ? null : `B${Math.min(...x.briques)}-${Math.max(...x.briques)}`;
      ins.run(annee, classe, section, bloc, x.date, x.debut, x.fin, x.minutes, x.cours_code, a.ue_num || null,
        `${x.activite || ''}${code && code !== 'Ts' ? ` · groupe ${code}` : ''}`.trim() || null, a.professeur_id || null, g, sg, x.local || null, par);
    }
  })();
  return { ...rapport, ok: true };
}

/**
 * VERSER LE PLAN DANS L'HORAIRE (lot 3 du laboratoire, Charles, 10 octobre 2026 :
 * « chaque étape jusqu'à l'horaire »). Les séances du plan ENREGISTRÉ (lignes
 * adoptées et verrouillées — jamais une simple proposition) deviennent des séances
 * de l'Horaire de la semaine (source « plan »), à partir d'une date. Reverser
 * remplace les séances « plan » non retouchées ; une séance retouchée à la main
 * (modifie_lucie = 1) n'est jamais touchée. Si un horaire IMPORTÉ (Hyperplanning)
 * existe déjà pour la classe sur la période, on ne le remplace que sur demande —
 * et les séances remplacées sont mises à l'abri (horaire_seance_remplacee), d'où
 * elles se rétablissent. Rien ne s'écrit sans le compte rendu d'abord.
 */
export function verserPlan(section, bloc, annee, { depuis = null, remplacer = false, simulation = true, par = null } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS horaire_seance_remplacee AS SELECT * FROM horaire_seance WHERE 0`);
  try { db.exec('ALTER TABLE horaire_seance_remplacee ADD COLUMN remplacee_le TEXT'); } catch { /* déjà là */ }
  try { db.exec('ALTER TABLE horaire_seance_remplacee ADD COLUMN remplacee_par TEXT'); } catch { /* déjà là */ }
  const sim = simuler(section, bloc, annee, { mode: 'plan' });
  const d0 = depuis || '0000-00-00';
  const aPoser = sim.seances.filter(x => (x.etat === 'plan' || x.etat === 'verrouille') && x.date >= d0);
  const nonPlan = sim.seances.filter(x => x.etat === 'propose').length;
  const filtre = `annee_scolaire = ? AND section = ? AND bloc = ? AND date >= ? AND COALESCE(modifie_lucie, 0) = 0`;
  const anciennes = db.prepare(`SELECT COUNT(*) n FROM horaire_seance WHERE ${filtre} AND source = 'plan'`).get(annee, section, bloc, d0).n;
  const importees = db.prepare(`SELECT COUNT(*) n FROM horaire_seance WHERE ${filtre} AND COALESCE(source, '') NOT IN ('plan', 'simulation')`).get(annee, section, bloc, d0).n;
  const gardees = db.prepare(`SELECT COUNT(*) n FROM horaire_seance WHERE annee_scolaire = ? AND section = ? AND bloc = ? AND date >= ? AND COALESCE(modifie_lucie, 0) = 1`).get(annee, section, bloc, d0).n;
  const rapport = { a_poser: aPoser.length, propositions_non_adoptees: nonPlan, remplacees_plan: anciennes, importees, gardees, depuis: d0 === '0000-00-00' ? null : d0 };
  if (simulation) return rapport;
  if (importees && !remplacer) throw Object.assign(new Error(`${importees} séance(s) importées existent pour ${section} ${bloc} sur la période : choisissez de les remplacer, ou une date de début plus tardive.`), { status: 409 });
  const classe = `${section} ${bloc}`;
  const groupeId = db.prepare('SELECT id FROM groupe WHERE annee_scolaire = ? AND code_cours = ? AND nom = ? LIMIT 1');
  const prof = new Map();
  const ins = db.prepare(`INSERT INTO horaire_seance (annee_scolaire, classe, section, bloc, date, heure_debut, heure_fin, minutes,
      cours_code, ue_num, matiere, professeur_id, groupe_id, sous_groupe, local_texte, source, modifie_lucie, cree_par, cree_le)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'plan', 0, ?, datetime('now'))`);
  db.transaction(() => {
    if (importees) {
      db.prepare(`INSERT INTO horaire_seance_remplacee SELECT *, datetime('now'), ? FROM horaire_seance WHERE ${filtre} AND COALESCE(source, '') NOT IN ('plan', 'simulation')`).run(par, annee, section, bloc, d0);
      db.prepare(`DELETE FROM horaire_seance WHERE ${filtre} AND COALESCE(source, '') NOT IN ('plan', 'simulation')`).run(annee, section, bloc, d0);
    }
    db.prepare(`DELETE FROM horaire_seance WHERE ${filtre} AND source = 'plan'`).run(annee, section, bloc, d0);
    for (const x of aPoser) {
      const [, act, , code] = x.cle.split('#');
      if (!prof.has(x.cle)) {
        const a = db.prepare(`SELECT professeur_id, ue_num FROM attribution WHERE annee_scolaire = ? AND code_cours = ?
          AND COALESCE(activite_id, 0) = ? AND COALESCE(code, '') = ? LIMIT 1`).get(annee, x.cours_code, Number(act), code || '');
        prof.set(x.cle, a || { ue_num: Number(String(x.cours_code).split('.')[0]) || null });
      }
      const a = prof.get(x.cle);
      const g = code ? groupeId.get(annee, x.cours_code, code)?.id || null : null;
      const sg = x.tout_le_bloc ? null : `B${Math.min(...x.briques)}-${Math.max(...x.briques)}`;
      ins.run(annee, classe, section, bloc, x.date, x.debut, x.fin, x.minutes, x.cours_code, a.ue_num || null,
        `${x.activite || ''}${code && code !== 'Ts' ? ` · groupe ${code}` : ''}`.trim() || null, a.professeur_id || null, g, sg, x.local || null, par);
    }
  })();
  return { ...rapport, ok: true };
}

/** Rétablir les séances importées qu'un versement du plan avait remplacées. */
export function retablirImportees(section, bloc, annee) {
  let n = 0;
  try {
    const cols = db.prepare('PRAGMA table_info(horaire_seance)').all().map(c => c.name).filter(c => c !== 'id');
    db.transaction(() => {
      const lignes = db.prepare('SELECT * FROM horaire_seance_remplacee WHERE annee_scolaire = ? AND section = ? AND bloc = ?').all(annee, section, bloc);
      // Les séances « plan » non retouchées de la période remplacée cèdent la place.
      const premiere = lignes.reduce((m, l) => (!m || l.date < m ? l.date : m), null);
      if (premiere) db.prepare(`DELETE FROM horaire_seance WHERE annee_scolaire = ? AND section = ? AND bloc = ? AND source = 'plan' AND COALESCE(modifie_lucie, 0) = 0 AND date >= ?`).run(annee, section, bloc, premiere);
      for (const l of lignes) {
        db.prepare(`INSERT INTO horaire_seance (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(c => l[c]));
        n++;
      }
      db.prepare('DELETE FROM horaire_seance_remplacee WHERE annee_scolaire = ? AND section = ? AND bloc = ?').run(annee, section, bloc);
    })();
  } catch (e) { throw Object.assign(new Error(`Rétablissement impossible : ${e.message}`), { status: 500 }); }
  return { retablies: n };
}


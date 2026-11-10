/**
 * LES PASSAGES D'UN EXAMEN (3.5.284, Charles, 10 novembre 2026 : « pour les dates d'examens, il peut y avoir plusieurs groupes et
 * donc plusieurs dates ; un même cours peut être coupé en parties, avec des listes d'étudiants » ; tranché : un examen a des
 * PASSAGES — partie, date, heure, local — chacun avec SA liste ; un étudiant y est placé par groupe de la répartition (ou
 * organisation), par tranche alphabétique, ou à la main ; une partie n'est qu'un moment d'examen, les notes restent par acquis ;
 * posés par le secrétariat, la direction et la coordination de la section ; lus par les listes à émarger, l'agenda du professeur,
 * l'agenda de l'école et l'espace de l'étudiant).
 *
 * Une épreuve = (année, session, UE, cours) — la ligne du calendrier des sessions (`epreuve_session1` / `deliberation_session2`).
 * Sans passage, elle reste ce qu'elle était : UNE date pour tous ses étudiants. Avec des passages, ce sont eux qui font foi, et la
 * ligne du calendrier porte le PREMIER (date, heure, local) pour les écrans qui ne lisent qu'une date.
 *
 * Les étudiants d'une épreuve : la règle des listes d'examens — inscrits de l'unité en 1re session, ajournés qui représentent CE
 * cours en 2e (`aRepresenterParCours`).
 */
import db from '../db/index.js';

let pret = false;
export function migrerPassages() {
  if (pret) return;
  db.exec(`CREATE TABLE IF NOT EXISTS epreuve_passage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    annee_scolaire TEXT NOT NULL,
    session INTEGER NOT NULL,
    ue_num INTEGER NOT NULL,
    cours_code TEXT NOT NULL DEFAULT '',
    rang INTEGER NOT NULL DEFAULT 1,
    partie TEXT,
    date TEXT,
    heure TEXT,
    local TEXT,
    adresse TEXT,
    mode TEXT NOT NULL DEFAULT 'tous',      -- tous | groupes | alpha | main
    groupes TEXT,                            -- JSON : codes de groupe de la répartition, et « org:N » pour une organisation
    alpha_de TEXT, alpha_a TEXT,
    maj_par TEXT, maj_le TEXT DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_passage_epreuve ON epreuve_passage (annee_scolaire, session, ue_num, cours_code)');
  db.exec(`CREATE TABLE IF NOT EXISTS epreuve_passage_etudiant (
    passage_id INTEGER NOT NULL, etudiant_id INTEGER NOT NULL, PRIMARY KEY (passage_id, etudiant_id))`);
  pret = true;
}

const sans = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

/** Les étudiants de l'épreuve (la règle des listes d'examens). */
export async function etudiantsDeLEpreuve(annee, session, ue, cours) {
  // Les dispensés (valorisation, report de notes) ne passent pas l'épreuve (3.5.296, `sansDispenses`).
  const { sansDispenses } = await import('./cep.js');
  return sansDispenses(await etudiantsBruts(annee, session, ue, cours), annee, ue, cours || '');
}
async function etudiantsBruts(annee, session, ue, cours) {
  if (Number(session) === 2) {
    const { aRepresenterParCours } = await import('../routes/acquis.js');
    let par = {}; try { par = aRepresenterParCours(Number(ue), annee, 1) || {}; } catch { par = {}; }
    const l = cours ? (par[cours] || []) : [...new Map(Object.values(par).flat().map(x => [x.id, x])).values()];
    const ids = l.map(x => x.id);
    if (!ids.length) return [];
    return db.prepare(`SELECT id, nom, prenom, id_ecampus FROM etudiant WHERE id IN (${ids.map(() => '?').join(',')})
      ORDER BY nom COLLATE NOCASE, prenom COLLATE NOCASE`).all(...ids);
  }
  return db.prepare(`SELECT e.id, e.nom, e.prenom, e.id_ecampus FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ? AND COALESCE(i.statut, '') NOT IN ('abandon', 'desinscrit')
    ORDER BY e.nom COLLATE NOCASE, e.prenom COLLATE NOCASE`).all(annee, Number(ue));
}

/** Les groupes de la répartition pour ce cours, et les organisations de l'unité — ce qu'on peut choisir pour un passage. */
export function choixDeGroupes(annee, ue, cours) {
  let groupes = [];
  try {
    groupes = db.prepare(`SELECT groupe_code code, COUNT(DISTINCT etudiant_id) n FROM etudiant_cours_groupe
      WHERE annee_scolaire = ? AND ${cours ? 'cours_code = ?' : "cours_code IN (SELECT cours_code FROM cours WHERE ue_num = ? AND annee_scolaire = ?)"}
        AND groupe_code IS NOT NULL AND groupe_code <> '' GROUP BY groupe_code ORDER BY groupe_code`)
      .all(...(cours ? [annee, cours] : [annee, Number(ue), annee]));
  } catch { groupes = []; }
  let organisations = [];
  try {
    organisations = db.prepare(`SELECT num_organisation n, COUNT(*) etudiants FROM etudiant_inscription
      WHERE annee_scolaire = ? AND ue_num = ? AND COALESCE(num_organisation, 0) > 0 GROUP BY num_organisation ORDER BY num_organisation`)
      .all(annee, Number(ue));
  } catch { organisations = []; }
  return { groupes, organisations };
}

export function passagesDe(annee, session, ue, cours = '') {
  migrerPassages();
  return db.prepare(`SELECT * FROM epreuve_passage WHERE annee_scolaire = ? AND session = ? AND ue_num = ? AND cours_code = ?
    ORDER BY date, heure, rang, id`).all(annee, Number(session) === 2 ? 2 : 1, Number(ue), String(cours || ''))
    .map(p => ({ ...p, groupes: (() => { try { return JSON.parse(p.groupes || '[]'); } catch { return []; } })(),
      etudiants_main: p.mode === 'main' ? db.prepare('SELECT etudiant_id FROM epreuve_passage_etudiant WHERE passage_id = ?').all(p.id).map(x => x.etudiant_id) : [] }));
}

/** Qui va dans quel passage : { passages: [{ ...p, etudiants }], non_places, doubles }. */
export async function repartir(annee, session, ue, cours = '') {
  return placer(await etudiantsDeLEpreuve(annee, session, ue, cours), annee, session, ue, cours);
}
/** Le même calcul, à partir des étudiants de l'épreuve déjà lus (les listes d'examens les ont). */
export function placer(tous, annee, session, ue, cours = '') {
  const ps = passagesDe(annee, session, ue, cours);
  if (!ps.length) return { passages: [], etudiants: tous, non_places: [], doubles: [] };
  const grp = new Map();
  try {
    for (const g of db.prepare(`SELECT etudiant_id, groupe_code FROM etudiant_cours_groupe WHERE annee_scolaire = ? AND
        ${cours ? 'cours_code = ?' : "cours_code IN (SELECT cours_code FROM cours WHERE ue_num = ? AND annee_scolaire = ?)"}`)
      .all(...(cours ? [annee, cours] : [annee, Number(ue), annee]))) {
      if (!grp.has(g.etudiant_id)) grp.set(g.etudiant_id, new Set());
      if (g.groupe_code) grp.get(g.etudiant_id).add(String(g.groupe_code));
    }
  } catch { /* pas de répartition */ }
  const org = new Map();
  try { for (const o of db.prepare('SELECT etudiant_id, num_organisation n FROM etudiant_inscription WHERE annee_scolaire = ? AND ue_num = ?').all(annee, Number(ue))) org.set(o.etudiant_id, Number(o.n) || 0); } catch { /* */ }
  const dans = (p, e) => {
    if (p.mode === 'tous') return true;
    if (p.mode === 'main') return p.etudiants_main.includes(e.id);
    if (p.mode === 'alpha') {
      const n = sans(e.nom), de = sans(p.alpha_de) || 'A', a = sans(p.alpha_a) || 'Z';
      return n.slice(0, de.length) >= de && n.slice(0, a.length) <= a;
    }
    if (p.mode === 'groupes') {
      return (p.groupes || []).some(g => (String(g).startsWith('org:') ? org.get(e.id) === Number(String(g).slice(4)) : grp.get(e.id)?.has(String(g))));
    }
    return false;
  };
  const passages = ps.map(p => ({ ...p, etudiants: tous.filter(e => dans(p, e)) }));
  const compte = new Map();
  for (const p of passages) for (const e of p.etudiants) compte.set(e.id, (compte.get(e.id) || 0) + 1);
  // Un étudiant dans deux passages d'une MÊME partie est un doublon ; dans deux parties différentes, c'est normal (écrit + oral).
  const doubles = [];
  const parPartie = new Map();
  for (const p of passages) { const k = String(p.partie || '').trim().toLowerCase(); if (!parPartie.has(k)) parPartie.set(k, []); parPartie.get(k).push(p); }
  for (const l of parPartie.values()) {
    const vu = new Map();
    for (const p of l) for (const e of p.etudiants) { if (vu.has(e.id)) doubles.push({ ...e, partie: p.partie || '' }); else vu.set(e.id, p.id); }
  }
  // Non placé : absent d'au moins une partie.
  const non_places = [];
  for (const l of parPartie.values()) {
    const places = new Set(l.flatMap(p => p.etudiants.map(e => e.id)));
    for (const e of tous) if (!places.has(e.id)) non_places.push({ ...e, partie: l[0].partie || '' });
  }
  return { passages, etudiants: tous, non_places, doubles };
}

const CHAMPS = ['partie', 'date', 'heure', 'local', 'adresse', 'alpha_de', 'alpha_a'];
/** Enregistrer TOUS les passages d'une épreuve (ils remplacent les précédents) ; puis la ligne du calendrier porte le premier. */
export function enregistrer(annee, session, ue, cours, passages, par) {
  migrerPassages();
  const ses = Number(session) === 2 ? 2 : 1;
  const l = Array.isArray(passages) ? passages : [];
  for (const [i, p] of l.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ''))) return { erreur: `Passage ${i + 1} : la date est obligatoire.` };
    if (!['tous', 'groupes', 'alpha', 'main'].includes(p.mode || 'tous')) return { erreur: `Passage ${i + 1} : mode inconnu.` };
    if (p.mode === 'groupes' && !(p.groupes || []).length) return { erreur: `Passage ${i + 1} : choisissez au moins un groupe.` };
    if (p.mode === 'alpha' && !sans(p.alpha_de) && !sans(p.alpha_a)) return { erreur: `Passage ${i + 1} : indiquez la tranche (de … à …).` };
  }
  db.transaction(() => {
    const anciens = db.prepare('SELECT id FROM epreuve_passage WHERE annee_scolaire = ? AND session = ? AND ue_num = ? AND cours_code = ?').all(annee, ses, Number(ue), String(cours || ''));
    for (const a of anciens) db.prepare('DELETE FROM epreuve_passage_etudiant WHERE passage_id = ?').run(a.id);
    db.prepare('DELETE FROM epreuve_passage WHERE annee_scolaire = ? AND session = ? AND ue_num = ? AND cours_code = ?').run(annee, ses, Number(ue), String(cours || ''));
    l.forEach((p, i) => {
      const v = Object.fromEntries(CHAMPS.map(c => [c, p[c] === undefined || p[c] === '' ? null : String(p[c]).trim().slice(0, 200)]));
      const id = db.prepare(`INSERT INTO epreuve_passage (annee_scolaire, session, ue_num, cours_code, rang, partie, date, heure, local, adresse, mode, groupes, alpha_de, alpha_a, maj_par)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(annee, ses, Number(ue), String(cours || ''), i + 1, v.partie, v.date, v.heure, v.local, v.adresse,
        p.mode || 'tous', JSON.stringify((p.groupes || []).map(String)), v.alpha_de, v.alpha_a, par || null).lastInsertRowid;
      if (p.mode === 'main') for (const e of new Set((p.etudiants || []).map(Number).filter(Boolean))) db.prepare('INSERT INTO epreuve_passage_etudiant (passage_id, etudiant_id) VALUES (?, ?)').run(id, e);
    });
    // LA LIGNE DU CALENDRIER PORTE LE PREMIER PASSAGE : les écrans qui ne lisent qu'une date montrent la première.
    if (l.length) {
      const premier = [...l].sort((a, b) => `${a.date}${a.heure || ''}`.localeCompare(`${b.date}${b.heure || ''}`))[0];
      const t = ses === 2 ? 'deliberation_session2' : 'epreuve_session1', k = ses === 2 ? 's2' : 's1';
      db.prepare(`INSERT INTO ${t} (ue_num, annee_scolaire, cours_code, ${k}_date, ${k}_heure, ${k}_local) VALUES (?,?,?,?,?,?)
        ON CONFLICT(ue_num, annee_scolaire, cours_code) DO UPDATE SET ${k}_date = excluded.${k}_date, ${k}_heure = excluded.${k}_heure, ${k}_local = excluded.${k}_local`)
        .run(Number(ue), annee, String(cours || ''), premier.date, premier.heure || null, premier.local || null);
    }
  })();
  return { passages: l.length };
}

/** Tous les passages d'une année, pour les lecteurs (agendas, espace de l'étudiant) : une ligne par passage. */
export function tousLesPassages(annee) {
  migrerPassages();
  try { return db.prepare('SELECT * FROM epreuve_passage WHERE annee_scolaire = ? AND date IS NOT NULL ORDER BY date, heure').all(annee); } catch { return []; }
}
/** Les épreuves (clé « session|ue|cours ») qui ont des passages — leurs lecteurs remplacent alors la date unique. */
export function epreuvesAPassages(annee) {
  return new Set(tousLesPassages(annee).map(p => `${p.session}|${p.ue_num}|${p.cours_code || ''}`));
}

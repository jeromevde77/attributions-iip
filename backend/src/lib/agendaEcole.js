// ─────────────────────────────────────────────────────────────────────────────
// Lucie — L'AGENDA DE L'ÉCOLE (3.5.058)
//
// Charles, 2 novembre 2026 : « les congés, plus simple de ne pas les encoder par dates mais dans la ligne du temps de
// l'année ; j'encode pour l'établissement, puis chaque section est différente ; en fonction de ça on sait quand on a
// besoin de personnel » ; « on doit centraliser la gestion de l'agenda de l'école » ; « à Noël tout le monde a congé ; en
// été cinq semaines jusqu'au 15 août, tout est fermé — dates FWB ; on est en partie fermé à Toussaint, Carnaval et
// Pâques ; les fériés légaux sont fermés, le mardi gras, le 2 novembre… » ; « compté comme presté, mais je veux une
// trace : c'est un geste de l'école » ; « je veux peindre les moments chauds et placer les choses importantes depuis la
// ligne du temps, et un bouton pour saisir en manuel avec un mini calendrier ».
// Tranché : un seul agenda, lu partout ; la direction peint l'établissement, la coordination ses sections ; le calendrier
// d'une section se déduit de l'horaire et se force ; le besoin de personnel guide congés et chaleur ; hors Noël et été,
// chacun choisit ses semaines de congé, la direction valide.
//
// QUATRE COUCHES, UNE LIGNE DU TEMPS :
//   · les COURS : `annee_calendrier` (cours, vacances, ev1, ev2, stage) — la table que lisent déjà l'horaire, la
//     simulation, l'échéancier, le congé-éducation : on la peint, on ne la double pas ;
//   · la FERMETURE de l'école, semaine par semaine (`agenda_semaine` : totale | partielle) — 52 semaines, été compris ;
//   · les JOURS FERMÉS isolés (`agenda_jour_ferme` : mardi gras, 2 novembre…), qui s'ajoutent aux fériés légaux dans
//     `joursFeries()` (routes/horaire.js) et donc partout ; chacun garde qui l'a posé et quand ;
//   · les SECTIONS : actives quand l'horaire leur donne des séances, ou forcées (`agenda_section`).
// Chaque geste entre au journal (`agenda_journal`, en ajout seul).
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { getUserSections } from '../middleware/auth.js';

const d2s = d => d.toISOString().slice(0, 10);
const s2d = s => new Date(`${s}T00:00:00Z`);
export const plus = (s, n) => d2s(new Date(s2d(s).getTime() + n * 86400000));
export const lundiDe = s => plus(s, -((s2d(s).getUTCDay() + 6) % 7));
const err = (m, status = 409) => Object.assign(new Error(m), { status });
const essai = (f, d) => { try { return f(); } catch { return d; } };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const PEINT_ETABLISSEMENT = ['admin', 'directeur', 'directeur_adjoint'];
export const TYPES_COURS = { cours: 'Cours', vacances: 'Vacances', ev1: 'Évaluations (1)', ev2: 'Évaluations (2)', stage: 'Stage' };

export function migrerAgenda(base = db) {
  base.exec(`
    CREATE TABLE IF NOT EXISTS agenda_semaine (
      annee TEXT NOT NULL, lundi TEXT NOT NULL, fermeture TEXT NOT NULL,      -- totale | partielle
      libelle TEXT, par TEXT, le TEXT DEFAULT (datetime('now')), PRIMARY KEY (annee, lundi));
    CREATE TABLE IF NOT EXISTS agenda_jour_ferme (
      annee TEXT NOT NULL, date TEXT NOT NULL, libelle TEXT NOT NULL,
      par TEXT, le TEXT DEFAULT (datetime('now')), PRIMARY KEY (annee, date));
    CREATE TABLE IF NOT EXISTS agenda_section (
      annee TEXT NOT NULL, section TEXT NOT NULL, lundi TEXT NOT NULL, etat TEXT NOT NULL,   -- active | inactive
      par TEXT, le TEXT DEFAULT (datetime('now')), PRIMARY KEY (annee, section, lundi));
    CREATE TABLE IF NOT EXISTS agenda_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT, annee TEXT, objet TEXT NOT NULL, cle TEXT, avant TEXT, apres TEXT,
      par TEXT, le TEXT DEFAULT (datetime('now')));
  `);
}
const journal = (annee, objet, cle, avant, apres, par) => db.prepare('INSERT INTO agenda_journal (annee, objet, cle, avant, apres, par) VALUES (?,?,?,?,?,?)')
  .run(annee, objet, cle, avant == null ? null : String(avant), apres == null ? null : String(apres), par);

/** Les 52 semaines de l'année : du lundi de la semaine du 1er septembre. */
export function debutDAnnee(a1) { const d = `${a1}-08-15`; const w = (s2d(d).getUTCDay() + 6) % 7; return w === 0 ? d : plus(d, 7 - w); }
export function semaines52(annee) {
  const a1 = Number(String(annee).split('-')[0]);
  const l0 = debutDAnnee(a1);  // le premier lundi à partir du 15 août (3.5.063)
  return Array.from({ length: 52 }, (_, i) => plus(l0, 7 * i));
}
const anneeDeDate = d => { const y = Number(d.slice(0, 4)); return d >= debutDAnnee(y) ? `${y}-${y + 1}` : `${y - 1}-${y}`; };

// ── Lectures ──
export function fermetures(annee) {
  return new Map(essai(() => db.prepare('SELECT lundi, fermeture, libelle, par, le FROM agenda_semaine WHERE annee = ?').all(annee), []).map(r => [r.lundi, r]));
}
/** Les jours fermés de l'école d'une année CIVILE (pour joursFeries). */
export function joursFermesCivils(an) {
  return essai(() => db.prepare("SELECT date, libelle FROM agenda_jour_ferme WHERE date LIKE ?").all(`${an}-%`), []);
}
export function joursFermes(annee) {
  return essai(() => db.prepare('SELECT date, libelle, par, le FROM agenda_jour_ferme WHERE annee = ? ORDER BY date').all(annee), []);
}

/** Les séances de chaque section, semaine par semaine (annulées exclues quand la colonne existe). */
function seancesParSection(annee, semaines) {
  const fin = plus(semaines[51], 6);
  const cols = essai(() => db.prepare('PRAGMA table_info(horaire_seance)').all().map(c => c.name), []);
  const annule = cols.includes('annule') ? 'AND COALESCE(annule, 0) = 0' : '';
  const lignes = essai(() => db.prepare(`SELECT section, date, COUNT(*) AS n FROM horaire_seance
    WHERE date >= ? AND date <= ? AND section IS NOT NULL AND section <> '' ${annule} GROUP BY section, date`).all(semaines[0], fin), []);
  const out = new Map();
  for (const r of lignes) {
    const l = lundiDe(String(r.date).slice(0, 10));
    if (!out.has(r.section)) out.set(r.section, new Map());
    const m = out.get(r.section); m.set(l, (m.get(l) || 0) + r.n);
  }
  return out;
}

/** L'agenda complet de l'année, tel que la ligne du temps le dessine. */
export function agenda(annee, { user = null, presentsMin = 2 } = {}) {
  const semaines = semaines52(annee);
  const cal = essai(() => db.prepare('SELECT id, date_debut, type, label FROM annee_calendrier WHERE annee_scolaire = ?').all(annee), []);
  const coursDe = new Map(cal.map(c => [lundiDe(c.date_debut), c]));
  const ferm = fermetures(annee);
  const seances = seancesParSection(annee, semaines);
  const forces = essai(() => db.prepare('SELECT section, lundi, etat, par, le FROM agenda_section WHERE annee = ?').all(annee), []);
  const forceDe = new Map(forces.map(f => [`${f.section}|${f.lundi}`, f]));
  const toutes = new Set([...seances.keys(), ...forces.map(f => f.section),
    ...essai(() => db.prepare("SELECT DISTINCT section FROM groupe WHERE annee_scolaire = ? AND section IS NOT NULL AND section <> ''").all(annee).map(x => x.section), [])]);
  const sections = [...toutes].sort().map(section => ({
    section,
    semaines: semaines.map(l => {
      const n = seances.get(section)?.get(l) || 0, f = forceDe.get(`${section}|${l}`);
      return { lundi: l, seances: n, deduit: n > 0, force: f ? f.etat : null, actif: f ? f.etat === 'active' : n > 0 };
    }),
  }));
  const besoin = semaines.map((l, i) => {
    const actives = sections.filter(s => s.semaines[i].actif).length;
    const nSeances = sections.reduce((t, s) => t + s.semaines[i].seances, 0);
    const f = ferm.get(l)?.fermeture;
    return { lundi: l, sections_actives: actives, seances: nSeances, presents_requis: f === 'totale' ? 0 : actives ? presentsMin : 1 };
  });
  const perim = user ? sectionsPeintes(user, sections.map(s => s.section)) : [];
  return {
    annee, semaines, types_cours: TYPES_COURS,
    cours: semaines.map(l => { const c = coursDe.get(l); return c ? { id: c.id, type: c.type, label: c.label } : null; }),
    fermetures: semaines.map(l => { const f = ferm.get(l); return f ? { fermeture: f.fermeture, libelle: f.libelle, par: f.par, le: f.le } : null; }),
    jours_fermes: joursFermes(annee), sections, besoin,
    peut: { etablissement: !!user && PEINT_ETABLISSEMENT.includes(user.role), sections: perim },
  };
}

/** Les sections qu'une personne peut forcer : toutes pour la direction, les siennes pour la coordination. */
export function sectionsPeintes(user, toutes) {
  if (PEINT_ETABLISSEMENT.includes(user.role)) return toutes;
  if (user.role !== 'coordination') return [];
  const mes = getUserSections(user);   // la règle du périmètre, écrite une fois (null = toutes)
  return mes == null ? toutes : toutes.filter(s => mes.includes(s));
}

// ── Écritures ──
const verifierLundis = (annee, lundis) => {
  const s = new Set(semaines52(annee));
  const out = [...new Set((lundis || []).map(x => lundiDe(String(x))))];
  if (!out.length) throw err('Aucune semaine choisie.', 400);
  for (const l of out) if (!s.has(l)) throw err(`La semaine du ${l} n’est pas dans l’année ${annee}.`, 400);
  return out;
};

/** Fermeture de l'école : totale, partielle, ou rien (ouverte). */
export function peindreFermeture(annee, lundis, fermeture, libelle, par) {
  const l = verifierLundis(annee, lundis);
  if (fermeture && !['totale', 'partielle'].includes(fermeture)) throw err('Fermeture inconnue.', 400);
  const avant = fermetures(annee);
  db.transaction(() => {
    for (const x of l) {
      const a = avant.get(x);
      if (!fermeture) { if (a) { db.prepare('DELETE FROM agenda_semaine WHERE annee = ? AND lundi = ?').run(annee, x); journal(annee, 'fermeture', x, `${a.fermeture} ${a.libelle || ''}`, null, par); } continue; }
      db.prepare(`INSERT INTO agenda_semaine (annee, lundi, fermeture, libelle, par) VALUES (?,?,?,?,?)
        ON CONFLICT(annee, lundi) DO UPDATE SET fermeture = excluded.fermeture, libelle = excluded.libelle, par = excluded.par, le = datetime('now')`)
        .run(annee, x, fermeture, String(libelle || '').trim() || (fermeture === 'totale' ? 'Fermeture' : 'Fermeture partielle'), par);
      journal(annee, 'fermeture', x, a ? `${a.fermeture} ${a.libelle || ''}` : null, `${fermeture} ${libelle || ''}`, par);
    }
  })();
}

/** Le type d'une semaine de cours (le calendrier de Planification). Les semaines hors du calendrier ne se créent pas ici. */
export function peindreCours(annee, lundis, type, label, par) {
  const l = verifierLundis(annee, lundis);
  if (!TYPES_COURS[type]) throw err('Type de semaine inconnu.', 400);
  const rows = essai(() => db.prepare('SELECT id, date_debut, type, label FROM annee_calendrier WHERE annee_scolaire = ?').all(annee), []);
  const parLundi = new Map(rows.map(r => [lundiDe(r.date_debut), r]));
  const hors = l.filter(x => !parLundi.has(x));
  if (hors.length === l.length) throw err('Ces semaines sont hors du calendrier des cours de l’année (Planification).', 409);
  db.transaction(() => {
    for (const x of l) {
      const r = parLundi.get(x); if (!r) continue;
      db.prepare('UPDATE annee_calendrier SET type = ?, label = ? WHERE id = ?').run(type, label === undefined ? r.label : (String(label || '').trim() || null), r.id);
      journal(annee, 'cours', x, `${r.type} ${r.label || ''}`, `${type} ${label || ''}`, par);
    }
  })();
  return { ignores: hors };
}

export function poserJourFerme(annee, date, libelle, par) {
  if (!DATE.test(String(date))) throw err('Date à écrire.', 400);
  if (anneeDeDate(date) !== annee) throw err(`Le ${date} n’est pas dans l’année ${annee}.`, 400);
  const lib = String(libelle || '').trim(); if (!lib) throw err('Nommez le jour (mardi gras, 2 novembre…).', 400);
  const a = db.prepare('SELECT libelle FROM agenda_jour_ferme WHERE annee = ? AND date = ?').get(annee, date);
  db.prepare(`INSERT INTO agenda_jour_ferme (annee, date, libelle, par) VALUES (?,?,?,?)
    ON CONFLICT(annee, date) DO UPDATE SET libelle = excluded.libelle, par = excluded.par, le = datetime('now')`).run(annee, date, lib, par);
  journal(annee, 'jour_ferme', date, a?.libelle ?? null, lib, par);
}
export function retirerJourFerme(annee, date, par) {
  const a = db.prepare('SELECT libelle FROM agenda_jour_ferme WHERE annee = ? AND date = ?').get(annee, date);
  if (!a) throw err('Jour introuvable.', 404);
  db.prepare('DELETE FROM agenda_jour_ferme WHERE annee = ? AND date = ?').run(annee, date);
  journal(annee, 'jour_ferme', date, a.libelle, null, par);
}

/** Forcer une section active ou inactive (null : revenir à ce que dit l'horaire). */
export function forcerSection(annee, section, lundis, etat, user, par) {
  const l = verifierLundis(annee, lundis);
  if (!sectionsPeintes(user, [section]).includes(section)) throw err('Cette section n’est pas dans votre périmètre.', 403);
  if (etat && !['active', 'inactive'].includes(etat)) throw err('État inconnu.', 400);
  db.transaction(() => {
    for (const x of l) {
      if (!etat) db.prepare('DELETE FROM agenda_section WHERE annee = ? AND section = ? AND lundi = ?').run(annee, section, x);
      else db.prepare(`INSERT INTO agenda_section (annee, section, lundi, etat, par) VALUES (?,?,?,?,?)
        ON CONFLICT(annee, section, lundi) DO UPDATE SET etat = excluded.etat, par = excluded.par, le = datetime('now')`).run(annee, section, x, etat, par);
      journal(annee, 'section', `${section}|${x}`, null, etat || 'calcul', par);
    }
  })();
}

export function journalAgenda(annee, limite = 100) {
  return essai(() => db.prepare('SELECT * FROM agenda_journal WHERE annee = ? ORDER BY id DESC LIMIT ?').all(annee, limite), []);
}

/* LA REPRISE DES CONGÉS DU MODULE (3.5.055-3.5.056 : `tt_conge`, des périodes datées). Une fois, si l'agenda de l'année est
   vide : une semaine dont les cinq jours tombent dans une période devient fermée — TOTALE pour Noël et l'été (juillet,
   août), PARTIELLE pour le reste (Toussaint, Carnaval, Pâques). */
export function reprendreCongesModule(annee) {
  if (essai(() => db.prepare('SELECT 1 FROM agenda_semaine WHERE annee = ? LIMIT 1').get(annee), null)) return 0;
  const periodes = essai(() => db.prepare('SELECT du, au, libelle FROM tt_conge WHERE annee = ?').all(annee), []);
  if (!periodes.length) return 0;
  let n = 0;
  db.transaction(() => {
    for (const l of semaines52(annee)) {
      const p = periodes.find(x => x.du <= l && x.au >= plus(l, 4)); if (!p) continue;
      const m = Number(l.slice(5, 7));
      const totale = /no[eë]l/i.test(p.libelle || '') || /[ée]t[ée]/i.test(p.libelle || '') || m === 7 || m === 8;
      db.prepare('INSERT OR IGNORE INTO agenda_semaine (annee, lundi, fermeture, libelle, par) VALUES (?,?,?,?,?)')
        .run(annee, l, totale ? 'totale' : 'partielle', p.libelle || 'Congé', 'reprise des congés du temps de travail');
      n++;
    }
  })();
  return n;
}

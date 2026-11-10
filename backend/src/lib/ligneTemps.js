// ─────────────────────────────────────────────────────────────────────────────
// Lucie — LA LIGNE DU TEMPS DU SECRÉTARIAT (3.5.057)
//
// Charles, 2 novembre 2026 : « simplifier et revoir Temps de travail : un ordre chronologique logique ; décider de semaines
// avec plus d'heures, d'autres sans ; un zoom de l'horaire total à la semaine, puis dans chaque semaine, comme une ligne du
// temps ; supprimer des jours et les reporter, donner une semaine puis ajouter ailleurs avec un assistant ; analyser les
// moments chauds et creux de l'année ; placer les grands moments : remise des diplômes, inscriptions, examens… ».
// Tranché le même jour (choix recommandés) : une ligne du temps à zoom ; l'assistant propose de reporter sur les périodes
// CHAUDES ; les moments chauds et creux sont CALCULÉS puis corrigeables par la direction ; la personne PROPOSE, la direction
// adjointe contrôle et la direction accepte (la direction peut aussi moduler directement).
//
// TROIS CHOSES ICI, le reste vit dans lib/tempsTravail.js (règles, générateur, relevé) :
//   · les GRANDS MOMENTS : ceux de l'établissement (`evenement_etablissement`, la table de la rentrée — une seule porte),
//     et ceux que Lucie connaît déjà (séances de délibération) ;
//   · la CHALEUR de chaque semaine : un score tiré de l'activité de l'an dernier à la même semaine (dossiers touchés, pièces
//     envoyées, demandes de VA) et de ce que l'année annonce (délibérations, ouvertures d'UE, échéances du secrétariat,
//     grands moments) ; un quart des semaines de travail en « chaud », un quart en « creux » ; la direction force une semaine ;
//   · la MODULATION : on donne un jour ou une semaine (récupération), on charge une semaine ; l'assistant remet la
//     différence ailleurs dans les bornes de l'art. 20bis (loi du 16 mars 1971) — 2 h d'écart par jour, 5 h par semaine,
//     9 h par jour, 45 h par semaine — et l'année garde ses 1 404 h par temps plein. UN JOUR DONNÉ EST UN REPOS
//     COMPENSATOIRE : il ne compte pas dans l'écart de 2 h du jour ni dans les 5 h de la semaine (lecture à confirmer).
// ─────────────────────────────────────────────────────────────────────────────
import db from '../db/index.js';
import { agenda, fermetures, stagesParSemaine } from './agendaEcole.js';
import {
  REGLES, reglage, semainesDeLAnnee, semainesDeConge, feriesDe, anneeDe, dureeJour, controleJour, modeleSemaine, verrouille,
  plusJours, hm, JOURS,
} from './tempsTravail.js';

const s2d = s => new Date(`${s}T00:00:00Z`);
const lundiDe = s => plusJours(s, -((s2d(s).getUTCDay() + 6) % 7));
const hhmm = x => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
const min = h => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const err = (m, status = 409) => Object.assign(new Error(m), { status });
const essai = (f, d) => { try { return f(); } catch { return d; } };

export function migrerLigneTemps(base = db) {
  base.exec(`
    CREATE TABLE IF NOT EXISTS tt_chaleur (
      annee TEXT NOT NULL, lundi TEXT NOT NULL, niveau TEXT NOT NULL,      -- chaud | creux | normal (forcé par la direction)
      par TEXT, le TEXT DEFAULT (datetime('now')), PRIMARY KEY (annee, lundi));
    CREATE TABLE IF NOT EXISTS tt_modulation (
      id INTEGER PRIMARY KEY AUTOINCREMENT, utilisateur_id INTEGER NOT NULL, annee TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'proposee',                            -- proposee | controlee | acceptee | refusee | retiree
      resume TEXT, changements_json TEXT NOT NULL, avant_json TEXT NOT NULL,
      propose_par TEXT, propose_par_id INTEGER, propose_le TEXT DEFAULT (datetime('now')),
      adjoint_par TEXT, adjoint_le TEXT, direction_par TEXT, direction_le TEXT,
      refus_par TEXT, refus_le TEXT, motif_refus TEXT);
    CREATE INDEX IF NOT EXISTS idx_tt_modulation ON tt_modulation(annee, utilisateur_id, statut);
  `);
  // 3.5.301 : une DEMANDE de « Mon temps » (un congé, une semaine de travail, plus ou moins d'heures) — la direction l'accepte
  // d'un clic, sans contrôle préalable de la direction adjointe ; et le mot de la personne.
  for (const c of ['simple INTEGER NOT NULL DEFAULT 0', 'mot TEXT']) { try { base.exec(`ALTER TABLE tt_modulation ADD COLUMN ${c}`); } catch { /* déjà là */ } }
}

// ── Les éléments de l'agenda : grands moments, réunions, échéances ──
/* LE CLASSEMENT (3.5.062, Charles, d'après sa « Timeline Santé 2025-2026 » : documents, Collège, Coord, horaires, rentrée,
   JPO, SIEP, remise des diplômes… ; tranché : domaine + nature ; les réunions qui reviennent en séries, « en fonction des
   rôles »). Le TYPE dit la sorte (examens, réunion, échéance…), la NATURE s'en déduit (elle donne la couleur), le DOMAINE
   (administratif, pédagogique, ASBL, HE) se choisit, et POUR dit quels rôles l'élément concerne — vide : tout le monde. */
export const TYPES_MOMENT = {
  inscriptions: 'Inscriptions', examens: 'Examens', deliberations: 'Délibérations', diplomes: 'Remise des diplômes',
  rentree: 'Rentrée', jpo: 'Portes ouvertes', ceremonie: 'Cérémonie', audit_qualite: 'Qualité',
  reunion: 'Réunion', echeance: 'Échéance, document', conseil: 'Conseil', horaires: 'Horaires', salon: 'Salon, SIEP', formation: 'Journée de formation', autre: 'Autre',
};
export const NATURES = { evenement: 'Événement', echeance: 'Échéance', reunion: 'Réunion', conseil: 'Conseil', horaires: 'Horaires' };
export const NATURE_DU_TYPE = { inscriptions: 'evenement', examens: 'evenement', diplomes: 'evenement', rentree: 'evenement', jpo: 'evenement',
  ceremonie: 'evenement', salon: 'evenement', formation: 'evenement', audit_qualite: 'echeance', autre: 'evenement', deliberations: 'conseil',
  reunion: 'reunion', echeance: 'echeance', conseil: 'conseil', horaires: 'horaires' };
export const DOMAINES = { administratif: 'Administratif', pedagogique: 'Pédagogique', asbl: 'ASBL', he: 'HE' };
export const POUR = { direction: 'Direction', secretariat: 'Secrétariat', coordination: 'Coordination', professeur: 'Enseignants' };
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const groupeDuRole = r => (DIRECTION.includes(r) ? 'direction' : r);
/** Un élément « pour » des rôles : la direction voit tout ; les autres, ce qui est pour tous ou pour leur rôle. */
export function voit(user, pour) {
  if (!user || DIRECTION.includes(user.role)) return true;
  const l = String(pour || '').split(',').filter(Boolean);
  return !l.length || l.includes(groupeDuRole(user.role));
}
const pourPropre = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map(x => String(x).trim()).filter(x => POUR[x]))].join(',') || null;
// Ce qu'un moment pèse dans la chaleur de sa semaine.
// Les délibérations comptent déjà par leurs séances (SOURCES) : pas deux fois. Les réunions ne réchauffent pas une semaine.
const POIDS_MOMENT = { inscriptions: 3, examens: 2, diplomes: 2, rentree: 3, jpo: 1, ceremonie: 1, echeance: 1, salon: 1 };

function bornes(annee) {
  const s = semainesDeLAnnee(annee);
  return { du: s[0], au: plusJours(s[51], 6) };
}

let migre = false;
function migrerElements() {
  if (migre) return; migre = true;
  essai(() => {
    const cols = db.prepare('PRAGMA table_info(evenement_etablissement)').all().map(c => c.name);
    for (const [c, t] of [['domaine', 'TEXT'], ['pour', 'TEXT'], ['serie_id', 'INTEGER']]) if (!cols.includes(c)) db.exec(`ALTER TABLE evenement_etablissement ADD COLUMN ${c} ${t}`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS agenda_serie (
        id INTEGER PRIMARY KEY AUTOINCREMENT, annee TEXT NOT NULL, titre TEXT NOT NULL, type TEXT NOT NULL, domaine TEXT, pour TEXT,
        regle TEXT NOT NULL,                                  -- semaine | quinzaine | mois
        jour INTEGER NOT NULL,                                -- 0 lundi … 4 vendredi (5, 6 le week-end)
        rang INTEGER,                                         -- pour « mois » : 1…4, ou -1 le dernier
        du TEXT NOT NULL, au TEXT NOT NULL, heure_debut TEXT, heure_fin TEXT, sauf_fermetures INTEGER NOT NULL DEFAULT 1,
        par TEXT, le TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS agenda_serie_exception (
        serie_id INTEGER NOT NULL, date TEXT NOT NULL, nouvelle_date TEXT, par TEXT, le TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (serie_id, date));
    `);
  }, null);
}

/** Les dates d'une série, fermetures et jours fermés sautés si demandé, exceptions appliquées. */
export function datesDeSerie(sr, { fermees = new Set(), feries = new Map() } = {}) {
  const out = [];
  const exc = new Map(essai(() => db.prepare('SELECT date, nouvelle_date FROM agenda_serie_exception WHERE serie_id = ?').all(sr.id), []).map(e => [e.date, e.nouvelle_date]));
  const d0 = plusJours(lundiDe(sr.du), Number(sr.jour));
  for (let d = d0, k = 0; d <= sr.au; d = plusJours(d, 7), k++) {
    if (d < sr.du) continue;
    if (sr.regle === 'quinzaine' && k % 2) continue;
    if (sr.regle === 'mois') {
      const m = d.slice(0, 7), n = Math.floor((Number(d.slice(8)) - 1) / 7) + 1;
      const dernier = plusJours(d, 7).slice(0, 7) !== m;
      if (!(Number(sr.rang) === n || (Number(sr.rang) === -1 && dernier))) continue;
    }
    if (sr.sauf_fermetures && (fermees.has(lundiDe(d)) || feries.has(d))) continue;
    if (exc.has(d)) { const n = exc.get(d); if (n) out.push({ date: n, deplace: d }); continue; }
    out.push({ date: d });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Les éléments de l'année vus par `user` : ceux de l'établissement, les dates des séries, les délibérations (lues). */
export function moments(annee, { user = null } = {}) {
  migrerElements();
  const { du, au } = bornes(annee);
  const out = essai(() => db.prepare(`SELECT id, type, titre, date_debut AS du, COALESCE(date_fin, date_debut) AS au, heure_debut, heure_fin, lieu, description, domaine, pour
    FROM evenement_etablissement WHERE (annee_scolaire = ? OR (annee_scolaire IS NULL AND date_debut BETWEEN ? AND ?)) ORDER BY date_debut`)
    .all(annee, du, au), []).filter(m => voit(user, m.pour))
    .map(m => ({ ...m, source: 'etablissement', libelle_type: TYPES_MOMENT[m.type] || m.type, nature: NATURE_DU_TYPE[m.type] || 'evenement' }));
  const series = essai(() => db.prepare('SELECT * FROM agenda_serie WHERE annee = ? ORDER BY id').all(annee), []).filter(sr => voit(user, sr.pour));
  if (series.length) {
    const fermees = new Set(essai(() => db.prepare("SELECT lundi FROM agenda_semaine WHERE annee = ? AND fermeture = 'totale'").all(annee).map(x => x.lundi), []));
    const feries = feriesDe(annee);
    for (const sr of series) for (const o of datesDeSerie(sr, { fermees, feries }))
      out.push({ id: null, serie_id: sr.id, type: sr.type, titre: sr.titre, du: o.date, au: o.date, deplace: o.deplace || null, heure_debut: sr.heure_debut, heure_fin: sr.heure_fin,
        domaine: sr.domaine, pour: sr.pour, source: 'serie', libelle_type: TYPES_MOMENT[sr.type] || sr.type, nature: NATURE_DU_TYPE[sr.type] || 'reunion' });
  }
  const delib = essai(() => db.prepare(`SELECT date_seance AS d FROM deliberation_seance WHERE date_seance BETWEEN ? AND ? ORDER BY date_seance`).all(du, au), []);
  const parSemaine = new Map();
  for (const { d } of delib) { const l = lundiDe(String(d).slice(0, 10)); const x = parSemaine.get(l) || []; x.push(String(d).slice(0, 10)); parSemaine.set(l, x); }
  for (const [, ds] of parSemaine) out.push({ id: null, type: 'deliberations', libelle_type: TYPES_MOMENT.deliberations, source: 'deliberation', nature: 'conseil', domaine: 'pedagogique',
    titre: ds.length > 1 ? `Délibérations (${ds.length} séances)` : 'Délibération', du: ds[0], au: ds[ds.length - 1], dates: ds });
  return out.sort((a, b) => a.du.localeCompare(b.du));
}

export function ecrireMoment(annee, v, par) {
  migrerElements();
  const type = TYPES_MOMENT[v.type] && v.type !== 'deliberations' ? v.type : null;
  if (!type) throw err('Type de moment inconnu (les délibérations se lisent des séances).', 400);
  const titre = String(v.titre || '').trim() || TYPES_MOMENT[type];
  const du = String(v.du || ''), au = String(v.au || v.du || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(du) || !/^\d{4}-\d{2}-\d{2}$/.test(au)) throw err('Dates à écrire.', 400);
  if (au < du) throw err('La fin précède le début.', 400);
  const domaine = DOMAINES[v.domaine] ? v.domaine : null, pour = pourPropre(v.pour);
  const h = x => (/^\d{1,2}:\d{2}$/.test(String(x || '')) ? x : null);
  if (v.id) {
    const r = db.prepare('UPDATE evenement_etablissement SET type = ?, titre = ?, date_debut = ?, date_fin = ?, annee_scolaire = ?, domaine = ?, pour = ?, heure_debut = ?, heure_fin = ? WHERE id = ?')
      .run(type, titre, du, au === du ? null : au, annee, domaine, pour, h(v.heure_debut), h(v.heure_fin), Number(v.id));
    if (!r.changes) throw err('Moment introuvable.', 404);
    return Number(v.id);
  }
  return Number(db.prepare('INSERT INTO evenement_etablissement (type, titre, date_debut, date_fin, annee_scolaire, cree_par, domaine, pour, heure_debut, heure_fin) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(type, titre, du, au === du ? null : au, annee, par, domaine, pour, h(v.heure_debut), h(v.heure_fin)).lastInsertRowid);
}
export function retirerMoment(id) {
  if (!db.prepare('DELETE FROM evenement_etablissement WHERE id = ?').run(Number(id)).changes) throw err('Moment introuvable.', 404);
}

/** Une série : « chaque lundi », « un jeudi sur deux », « le 2e mardi du mois »… */
export function ecrireSerie(annee, v, par) {
  migrerElements();
  const type = TYPES_MOMENT[v.type] && v.type !== 'deliberations' ? v.type : null;
  if (!type) throw err('Type inconnu.', 400);
  if (!['semaine', 'quinzaine', 'mois'].includes(v.regle)) throw err('Répétition inconnue.', 400);
  const jour = Number(v.jour); if (!(jour >= 0 && jour <= 6)) throw err('Jour de la semaine à choisir.', 400);
  const rang = v.regle === 'mois' ? Number(v.rang) : null;
  if (v.regle === 'mois' && ![1, 2, 3, 4, -1].includes(rang)) throw err('Le rang dans le mois : 1er, 2e, 3e, 4e ou dernier.', 400);
  const { du: d0, au: a0 } = bornes(annee);
  const du = String(v.du || d0), au = String(v.au || a0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(du) || !/^\d{4}-\d{2}-\d{2}$/.test(au) || au < du) throw err('Dates de la série à corriger.', 400);
  const titre = String(v.titre || '').trim(); if (!titre) throw err('Nommez la série (Collège, Coordination…).', 400);
  const h = x => (/^\d{1,2}:\d{2}$/.test(String(x || '')) ? x : null);
  return Number(db.prepare(`INSERT INTO agenda_serie (annee, titre, type, domaine, pour, regle, jour, rang, du, au, heure_debut, heure_fin, sauf_fermetures, par)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(annee, titre, type, DOMAINES[v.domaine] ? v.domaine : null, pourPropre(v.pour), v.regle, jour, rang, du, au,
    h(v.heure_debut), h(v.heure_fin), v.sauf_fermetures === false ? 0 : 1, par).lastInsertRowid);
}
export function retirerSerie(id) {
  migrerElements();
  db.prepare('DELETE FROM agenda_serie_exception WHERE serie_id = ?').run(Number(id));
  if (!db.prepare('DELETE FROM agenda_serie WHERE id = ?').run(Number(id)).changes) throw err('Série introuvable.', 404);
}
/** Une date de la série : l'annuler (nouvelle = null) ou la déplacer. */
export function exceptionSerie(id, date, nouvelle, par) {
  migrerElements();
  if (!db.prepare('SELECT 1 FROM agenda_serie WHERE id = ?').get(Number(id))) throw err('Série introuvable.', 404);
  if (nouvelle && !/^\d{4}-\d{2}-\d{2}$/.test(nouvelle)) throw err('Nouvelle date à écrire.', 400);
  db.prepare(`INSERT INTO agenda_serie_exception (serie_id, date, nouvelle_date, par) VALUES (?,?,?,?)
    ON CONFLICT(serie_id, date) DO UPDATE SET nouvelle_date = excluded.nouvelle_date, par = excluded.par, le = datetime('now')`).run(Number(id), date, nouvelle || null, par);
}

// ── La chaleur des semaines ──
/* Chaque source compte, semaine par semaine. Celles « de l'an dernier » se lisent à la même semaine de l'année précédente
   (l'année du module court du lundi de la semaine du 1er septembre) — et sur l'année en cours pour les semaines passées,
   la plus forte des deux : l'histoire de Lucie est courte. Les dossiers se comptent en (étudiant, jour) touchés : un import
   de 20 000 notes ne fait pas une semaine chaude. Le score est logarithmique, pour qu'un pic n'écrase pas le reste. */
const SOURCES = [
  { cle: 'dossiers', libelle: 'dossiers d’étudiants touchés', poids: 3, histoire: true,
    sql: `SELECT substr(le, 1, 10) AS d, COUNT(DISTINCT COALESCE(etudiant_id, 0) || '|' || substr(le, 1, 10)) AS n FROM journal_modification WHERE le >= ? AND le < ? GROUP BY substr(le, 1, 10)` },
  { cle: 'envois', libelle: 'pièces envoyées', poids: 1, histoire: true,
    sql: `SELECT substr(envoye_le, 1, 10) AS d, COUNT(*) AS n FROM envoi_mail WHERE envoye_le >= ? AND envoye_le < ? GROUP BY substr(envoye_le, 1, 10)` },
  { cle: 'va', libelle: 'demandes de VA reçues', poids: 2, histoire: true,
    sql: `SELECT substr(cree_le, 1, 10) AS d, COUNT(*) AS n FROM etudiant_valorisation WHERE cree_le >= ? AND cree_le < ? GROUP BY substr(cree_le, 1, 10)` },
  { cle: 'ouvertures', libelle: 'unités qui s’ouvrent', poids: 2,
    sql: `SELECT date_debut AS d, COUNT(*) AS n FROM organisation_ue WHERE date_debut >= ? AND date_debut < ? GROUP BY date_debut` },
  { cle: 'deliberations', libelle: 'séances de délibération', poids: 2,
    sql: `SELECT date_seance AS d, COUNT(*) AS n FROM deliberation_seance WHERE date_seance >= ? AND date_seance < ? GROUP BY date_seance` },
  { cle: 'seances', libelle: 'séances de cours à l’horaire', poids: 2,
    sql: `SELECT date AS d, COUNT(*) AS n FROM horaire_seance WHERE date >= ? AND date < ? AND COALESCE(annule, 0) = 0 GROUP BY date` },
  { cle: 'echeances', libelle: 'échéances du secrétariat', poids: 1,
    sql: `SELECT date_due AS d, COUNT(*) AS n FROM echeance WHERE date_due >= ? AND date_due < ? AND responsable_role = 'secretariat' GROUP BY date_due` },
];

function compterParSemaine(sql, semaines) {
  const out = new Array(semaines.length).fill(0);
  const fin = plusJours(semaines[semaines.length - 1], 7);
  const lignes = essai(() => db.prepare(sql).all(semaines[0], fin), []);
  const index = new Map(semaines.map((l, i) => [l, i]));
  for (const r of lignes) { const i = index.get(lundiDe(String(r.d).slice(0, 10))); if (i != null) out[i] += Number(r.n) || 0; }
  return out;
}

export function chaleur(annee) {
  const semaines = semainesDeLAnnee(annee);
  const [a1] = String(annee).split('-').map(Number);
  const avant = semainesDeLAnnee(`${a1 - 1}-${a1}`);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const comptes = {};
  for (const s of SOURCES) {
    const cette = compterParSemaine(s.sql, semaines);
    if (!s.histoire) { comptes[s.cle] = cette; continue; }
    const prec = compterParSemaine(s.sql, avant);
    comptes[s.cle] = semaines.map((l, i) => (l < aujourdhui ? Math.max(cette[i], prec[i]) : prec[i]));
  }
  // Les grands moments pèsent sur leurs semaines.
  const ms = moments(annee);
  const parMoment = semaines.map(() => []);
  for (const m of ms) {
    semaines.forEach((l, i) => { if (m.du <= plusJours(l, 6) && m.au >= l && POIDS_MOMENT[m.type]) parMoment[i].push(m); });
  }
  // Les stages : leur préparation (les deux semaines avant chaque début) et leur suivi (étudiants en stage).
  const SOURCES_STAGE = [{ cle: 'stages_prep', libelle: 'stages à préparer (conventions, pièces)', poids: 2 }, { cle: 'stages_en', libelle: 'étudiants en stage', poids: 1 }];
  const st = essai(() => stagesParSemaine(annee, semaines), semaines.map(() => ({ prepares: 0, debuts: 0, etudiants: 0 })));
  comptes.stages_prep = st.map(x => x.prepares + x.debuts); comptes.stages_en = st.map(x => x.etudiants);
  const TOUTES = [...SOURCES, ...SOURCES_STAGE];
  const maxi = Object.fromEntries(TOUTES.map(s => [s.cle, Math.max(0, ...comptes[s.cle])]));
  const conges = semainesDeConge(annee);
  const brut = semaines.map((l, i) => {
    let score = 0; const raisons = [];
    for (const s of TOUTES) {
      const n = comptes[s.cle][i]; if (!n) continue;
      score += s.poids * Math.log1p(n) / Math.log1p(maxi[s.cle] || 1);
      raisons.push(`${n} ${s.libelle}${s.histoire ? ' (l’an dernier)' : ''}`);
    }
    for (const m of parMoment[i]) { score += POIDS_MOMENT[m.type]; raisons.push(m.titre); }
    return { lundi: l, score, raisons, conge: conges.get(l) || null };
  });
  const top = Math.max(0, ...brut.map(b => b.score));
  for (const b of brut) b.score = top ? Math.round((100 * b.score) / top) : 0;
  /* UN QUART EN CHAUD, UN QUART EN CREUX, pas davantage. Chaudes : les plus hauts scores (non nuls). Creuses : les plus bas,
     et, à score égal — souvent zéro, l'histoire de Lucie étant courte —, les plus éloignées d'une semaine chaude : on ne
     peint pas en bleu la moitié de l'année parce qu'on n'en sait rien. */
  const travail = brut.filter(b => !b.conge);
  const n = Math.max(1, Math.round(travail.length / 4));
  const chaudes = new Set(top ? [...travail].filter(b => b.score > 0).sort((x, y) => y.score - x.score).slice(0, n).map(b => b.lundi) : []);
  const loin = l => (chaudes.size ? Math.min(...[...chaudes].map(c => Math.abs(s2d(c) - s2d(l)))) : 0);
  const creuses = new Set(top ? travail.filter(b => !chaudes.has(b.lundi)).sort((x, y) => x.score - y.score || loin(y.lundi) - loin(x.lundi)).slice(0, n).map(b => b.lundi) : []);
  const forces = new Map(essai(() => db.prepare('SELECT lundi, niveau, par, le FROM tt_chaleur WHERE annee = ?').all(annee), []).map(f => [f.lundi, f]));
  return brut.map(b => {
    const niveau = chaudes.has(b.lundi) ? 'chaud' : creuses.has(b.lundi) ? 'creux' : 'normal';
    const f = forces.get(b.lundi);
    return { ...b, calcule: niveau, niveau: f ? f.niveau : niveau, force: f ? { par: f.par, le: f.le } : null };
  });
}

export function forcerChaleur(annee, lundi, niveau, par) {
  lundi = lundiDe(lundi);
  if (niveau == null || niveau === 'calcul') { db.prepare('DELETE FROM tt_chaleur WHERE annee = ? AND lundi = ?').run(annee, lundi); return; }
  if (!['chaud', 'creux', 'normal'].includes(niveau)) throw err('Niveau inconnu.', 400);
  db.prepare(`INSERT INTO tt_chaleur (annee, lundi, niveau, par) VALUES (?,?,?,?)
    ON CONFLICT(annee, lundi) DO UPDATE SET niveau = excluded.niveau, par = excluded.par, le = datetime('now')`).run(annee, lundi, niveau, par);
}

// ── La modulation ──
const personne = uid => db.prepare('SELECT * FROM tt_personne WHERE utilisateur_id = ?').get(uid);
const estRecup = j => !!(j && j.recup);
const duree = j => (estRecup(j) ? 0 : dureeJour(j));
const total = jours => (jours || []).reduce((s, j) => s + duree(j), 0);

/** Contrôle d'une semaine modulée (règles de l'horaire annualisé, art. 20bis), les jours donnés en récupération à part. */
export function controleModule(jours, { fraction = 1, modele }) {
  const out = [];
  jours.forEach((j, i) => { if (j && !estRecup(j)) for (const e of controleJour(j, { long: true })) out.push(`${JOURS[i]} : ${e}`); });
  for (let i = 0; i < 6; i++) {
    const a = jours[i], b = jours[i + 1];
    if (a && b && !estRecup(a) && !estRecup(b) && (24 * 60 - min(a.fin) + min(b.debut)) < REGLES.repos)
      out.push(`${JOURS[i]} → ${JOURS[i + 1]} : moins de 11 h de repos entre deux journées.`);
  }
  const t = total(jours);
  if (t > REGLES.semaineMaxFlex) out.push(`${hm(t)} : 45 h par semaine au plus.`);
  // L'écart de la semaine se mesure sur les jours travaillés : un jour de récupération sort de la référence.
  const ref = Math.round(REGLES.hebdo * fraction) - jours.reduce((s, j, i) => s + (estRecup(j) ? dureeJour(modele[i]) : 0), 0);
  if (Math.abs(t - ref) > REGLES.ecartSemaine) out.push(`${hm(t)} : au plus 5 h d’écart avec les ${hm(ref)} de référence de la semaine.`);
  jours.forEach((j, i) => {
    if (!j || estRecup(j) || !modele[i]) return;
    if (Math.abs(dureeJour(j) - dureeJour(modele[i])) > REGLES.ecartJour) out.push(`${JOURS[i]} : au plus 2 h d’écart avec l’horaire de référence (${hm(dureeJour(modele[i]))}).`);
  });
  return out;
}

/** Ce qu'un jour peut encore recevoir (positif) ou rendre (négatif), dans les bornes. */
function marge(j, ref, sens) {
  if (!j || estRecup(j) || !ref) return 0;
  const d = dureeJour(j), r = dureeJour(ref);
  return sens > 0 ? Math.max(0, Math.min(r + REGLES.ecartJour, REGLES.jourMaxLong) - d) : Math.max(0, d - Math.max(r - REGLES.ecartJour, 0));
}
/** Allonge (ou raccourcit) les jours d'une semaine de `delta` minutes, en décalant la fin, proportionnellement aux marges. */
function decaler(jours, modele, delta) {
  const sens = Math.sign(delta); if (!sens) return jours;
  const out = jours.map(j => (j ? { ...j } : null));
  let reste = Math.abs(delta);
  for (let tour = 0; tour < 4 && reste > 0; tour++) {
    const m = out.map((j, i) => marge(j, modele[i], sens));
    const somme = m.reduce((a, b) => a + b, 0); if (!somme) break;
    const voulu = reste;
    out.forEach((j, i) => {
      if (!m[i] || reste <= 0) return;
      const k = Math.min(m[i], reste, Math.max(1, Math.round((voulu * m[i]) / somme)));
      j.fin = hhmm(min(j.fin) + sens * k); reste -= k;
    });
  }
  return out;
}
/** Ce que la semaine peut encore recevoir ou rendre en tout. */
function margeSemaine(jours, modele, fraction, sens) {
  const t = total(jours);
  const ref = Math.round(REGLES.hebdo * fraction) - jours.reduce((s, j, i) => s + (estRecup(j) ? dureeJour(modele[i]) : 0), 0);
  const parJours = jours.reduce((s, j, i) => s + marge(j, modele[i], sens), 0);
  return sens > 0 ? Math.max(0, Math.min(parJours, ref + REGLES.ecartSemaine - t, REGLES.semaineMaxFlex - t))
    : Math.max(0, Math.min(parJours, t - (ref - REGLES.ecartSemaine)));
}

/**
 * L'ASSISTANT. Part de l'année enregistrée et des changements voulus :
 *   recup  : [dates] — jours donnés (repos compensatoire) ; une semaine donnée = ses cinq jours ;
 *   cibles : { lundi: minutes } — une semaine chargée ou allégée à la main ;
 *   exclure: [lundis] — semaines où l'assistant ne doit rien remettre ;
 *   rendre : [dates] — un jour donné qu'on reprend (il revient à son horaire de référence).
 * Il remet la différence dans les semaines de travail à venir, non signées, les CHAUDES d'abord quand il faut ajouter des
 * heures (les CREUSES d'abord quand il faut en retirer), puis les plus proches. Il ne fait qu'une proposition.
 */
export function assistant(uid, annee, v = {}) {
  const p = personne(uid); if (!p) throw err('Personne non désignée.', 404);
  const R = reglage(annee);
  // Échanger une semaine de congé contre une semaine de travail ne module pas les heures : l'horaire variable n'est exigé
  // que pour donner des jours ou charger, alléger une semaine (3.5.301).
  const moduleHeures = (v.recup || []).length || (v.rendre || []).length || Object.keys(v.cibles || {}).length;
  if (moduleHeures && !R.rt_variable) throw err('Faire plus ou moins d’heures une semaine suppose l’horaire variable inscrit au règlement de travail : la direction le règle dans Préparer l’année → Personnes et règles.');
  const sem = anneeDe(uid, annee);
  if (!sem.length) throw err('L’année n’est pas encore générée.', 404);
  const fraction = Number(p.fraction) || 1;
  const modele = modeleSemaine('annualise', fraction);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const parLundi = new Map(sem.map(s => [s.lundi, { ...s, jours: s.jours.map(j => (j ? { ...j } : null)) }]));
  const touchees = new Set();
  const refus = [];
  const libre = l => { const s = parLundi.get(l); return s && s.statut === 'travail' && !verrouille(uid, l) && !verrouille(uid, plusJours(l, 6)); };

  for (const d of v.recup || []) {
    const l = lundiDe(d), i = (s2d(d).getUTCDay() + 6) % 7, s = parLundi.get(l);
    if (!s || s.statut !== 'travail') { refus.push(`${d} : pas une semaine de travail.`); continue; }
    if (!libre(l)) { refus.push(`${d} : ce mois est signé par la direction.`); continue; }
    if (d < aujourdhui) { refus.push(`${d} : un jour passé ne se donne plus (il s’encode au relevé).`); continue; }
    if (!s.jours[i] || estRecup(s.jours[i])) continue;
    s.jours[i] = { recup: true, avant: `${s.jours[i].debut}–${s.jours[i].fin}` }; touchees.add(l);
  }
  for (const d of v.rendre || []) {
    const l = lundiDe(d), i = (s2d(d).getUTCDay() + 6) % 7, s = parLundi.get(l);
    if (s && estRecup(s.jours[i]) && libre(l)) { s.jours[i] = { ...modele[i] }; touchees.add(l); }
  }
  for (const [l0, m] of Object.entries(v.cibles || {})) {
    const l = lundiDe(l0), s = parLundi.get(l);
    if (!s || !libre(l)) { refus.push(`Semaine du ${l} : ni de travail ni modifiable.`); continue; }
    const voulu = Math.round(Number(m)), t = total(s.jours);
    const sens = Math.sign(voulu - t); if (!sens) continue;
    const possible = margeSemaine(s.jours, modele, fraction, sens);
    s.jours = decaler(s.jours, modele, sens * Math.min(possible, Math.abs(voulu - t)));
    if (possible < Math.abs(voulu - t)) refus.push(`Semaine du ${l} : ${hm(t + sens * possible)} au plus près des ${hm(voulu)} voulues (bornes de l’art. 20bis).`);
    touchees.add(l);
  }

  /* ÉCHANGER UNE SEMAINE DE CONGÉ (3.5.058, « au choix de chacun » hors Noël et été) : prendre une semaine de travail en
     congé, rendre une semaine de congé au travail — autant de l'une que de l'autre, 13 semaines de congé toujours. Une
     semaine de fermeture TOTALE ne se travaille pas. */
  const prendre = [...new Set((v.prendre || []).map(lundiDe))], travailler = [...new Set((v.travailler || []).map(lundiDe))];
  const ferm = fermetures(annee);
  const signe = l => verrouille(uid, l) || verrouille(uid, plusJours(l, 6));
  for (const l of prendre) {
    const s = parLundi.get(l);
    if (!s || s.statut !== 'travail') { refus.push(`Semaine du ${l} : pas une semaine de travail.`); continue; }
    if (signe(l) || l < lundiDe(aujourdhui)) { refus.push(`Semaine du ${l} : passée ou signée.`); continue; }
    s.statut = 'conge'; s.jours = Array(7).fill(null); touchees.add(l);
  }
  for (const l of travailler) {
    const s = parLundi.get(l);
    if (!s || s.statut === 'travail') { refus.push(`Semaine du ${l} : pas une semaine de congé.`); continue; }
    if (ferm.get(l)?.fermeture === 'totale') { refus.push(`Semaine du ${l} : l’école est fermée (${ferm.get(l).libelle || 'fermeture totale'}).`); continue; }
    if (signe(l) || l < lundiDe(aujourdhui)) { refus.push(`Semaine du ${l} : passée ou signée.`); continue; }
    s.statut = 'travail'; s.jours = modele.map(j => (j ? { ...j } : null)); touchees.add(l);
  }
  if (prendre.length !== travailler.length) refus.push(`Treize semaines de congé, toujours : ${prendre.length} semaine(s) prise(s) en congé pour ${travailler.length} rendue(s) au travail.`);
  // Le besoin de personnel : une semaine prise en congé ne doit pas laisser moins de monde que les sections n'en demandent.
  const avertissements = [];
  if (prendre.length) {
    const ag = agenda(annee, { presentsMin: R.presents_min });
    for (const l of prendre) {
      const k = ag.semaines.indexOf(l); if (k < 0) continue;
      const autres = db.prepare("SELECT COUNT(*) n FROM tt_semaine s JOIN tt_personne p ON p.utilisateur_id = s.utilisateur_id AND p.actif = 1 WHERE s.lundi = ? AND s.statut = 'travail' AND s.utilisateur_id <> ?").get(l, uid).n;
      const b = ag.besoin[k];
      if (autres < b.presents_requis) avertissements.push(`Semaine du ${l} : ${autres} présent(s) pour ${b.presents_requis} requis (${b.sections_actives} section(s) active(s)).`);
    }
  }

  const du = Math.round(REGLES.hebdo * fraction) * (52 - REGLES.congesAnnuels);
  const avantTotal = sem.reduce((s, x) => s + total(x.jours), 0);
  let aPlacer = du - [...parLundi.values()].reduce((s, x) => s + total(x.jours), 0);
  // Le report : chaud d'abord pour ajouter, creux d'abord pour retirer ; puis la plus proche des semaines changées.
  const ch = new Map(chaleur(annee).map(c => [c.lundi, c]));
  const rang = { chaud: 0, normal: 1, creux: 2 };
  const pivots = [...touchees];
  const proche = l => (pivots.length ? Math.min(...pivots.map(x => Math.abs(s2d(x) - s2d(l)))) : 0);
  const exclues = new Set((v.exclure || []).map(lundiDe));
  const reports = [];
  const sens = Math.sign(aPlacer);
  if (sens) {
    const candidates = [...parLundi.values()]
      .filter(s => libre(s.lundi) && s.lundi >= lundiDe(aujourdhui) && !touchees.has(s.lundi) && !exclues.has(s.lundi))
      .sort((a, b) => {
        const ra = rang[ch.get(a.lundi)?.niveau || 'normal'], rb = rang[ch.get(b.lundi)?.niveau || 'normal'];
        const sa = ch.get(a.lundi)?.score || 0, sb = ch.get(b.lundi)?.score || 0;
        return (sens > 0 ? ra - rb : rb - ra) || (sens > 0 ? sb - sa : sa - sb) || proche(a.lundi) - proche(b.lundi);
      });
    for (const s of candidates) {
      if (!aPlacer) break;
      const k = Math.min(margeSemaine(s.jours, modele, fraction, sens), Math.abs(aPlacer));
      if (k < 15 && Math.abs(aPlacer) >= 15) continue;   // pas de miettes : un quart d'heure au moins par semaine
      if (!k) continue;
      const t0 = total(s.jours);
      s.jours = decaler(s.jours, modele, sens * k);
      const fait = total(s.jours) - t0;
      if (!fait) continue;
      aPlacer -= fait; reports.push(s.lundi);
    }
  }
  const avant = new Map(sem.map(s => [s.lundi, s]));
  const changees = [...new Set([...touchees, ...reports])].sort().map(l => {
    const s = parLundi.get(l), a = avant.get(l);
    return { lundi: l, avant: total(a.jours), apres: total(s.jours), jours: s.jours, report: reports.includes(l),
      statut: s.statut, statut_avant: a.statut,
      chaleur: ch.get(l)?.niveau || 'normal', score: ch.get(l)?.score || 0, controles: s.statut === 'travail' ? controleModule(s.jours, { fraction, modele }) : [] };
  });
  const apresTotal = [...parLundi.values()].reduce((s, x) => s + total(x.jours), 0);
  const erreurs = [...refus];
  if (apresTotal !== du) erreurs.push(`L’année compterait ${hm(apresTotal)} pour ${hm(du)} dues : ${hm(Math.abs(du - apresTotal))} ${du > apresTotal ? 'restent à placer' : 'sont en trop'} — retirez une exclusion, ou chargez une autre semaine.`);
  return { du, avant: avantTotal, apres: apresTotal, changees, erreurs, avertissements, en_defaut: changees.filter(c => c.controles.length).length };
}

const nomDe = uid => essai(() => db.prepare('SELECT nom_complet, email FROM utilisateur WHERE id = ?').get(uid), null);

/** Enregistrer : la direction applique ; la personne dépose une proposition (contrôle de l'adjoint, accord de la direction). */
export function proposer(uid, annee, v, user, nomUser) {
  const plan = assistant(uid, annee, v);
  if (plan.erreurs.length || plan.en_defaut) throw Object.assign(err('La modulation ne tient pas encore : rien n’est enregistré.'), { bilan: plan });
  if (!plan.changees.length) throw err('Rien ne change.', 400);
  const avant = Object.fromEntries(anneeDe(uid, annee).filter(s => plan.changees.some(c => c.lundi === s.lundi)).map(s => [s.lundi, { statut: s.statut, jours: s.jours }]));
  const changements = plan.changees.map(c => ({ lundi: c.lundi, jours: c.jours, avant: c.avant, apres: c.apres, statut: c.statut, statut_avant: c.statut_avant }));
  const resume = String(v.resume || '').trim() || resumer(plan);
  const gereDirect = ['admin', 'directeur', 'directeur_adjoint'].includes(user.role) && user.id !== uid;
  const id = Number(db.prepare(`INSERT INTO tt_modulation (utilisateur_id, annee, statut, resume, changements_json, avant_json, propose_par, propose_par_id, simple, mot)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(uid, annee, 'proposee', resume, JSON.stringify(changements), JSON.stringify(avant), nomUser, user.id,
      v.simple ? 1 : 0, String(v.mot || '').trim().slice(0, 500) || null).lastInsertRowid);
  if (gereDirect) {
    db.prepare("UPDATE tt_modulation SET adjoint_par = ?, adjoint_le = datetime('now') WHERE id = ?").run(nomUser, id);
    if (['admin', 'directeur'].includes(user.role)) return valider(id, 'direction', user, nomUser);
  }
  return lireModulation(id);
}

function resumer(plan) {
  const recup = plan.changees.flatMap(c => c.jours.map((j, i) => (estRecup(j) ? plusJours(c.lundi, i) : null)).filter(Boolean));
  const parts = [];
  if (recup.length) parts.push(`${recup.length} jour(s) donné(s)`);
  const chargees = plan.changees.filter(c => !c.report && c.apres > c.avant).length;
  if (chargees) parts.push(`${chargees} semaine(s) chargée(s)`);
  const pris = plan.changees.filter(c => c.statut !== 'travail' && c.statut_avant === 'travail').length;
  if (pris) parts.push(`${pris} semaine(s) de congé échangée(s)`);
  const rep = plan.changees.filter(c => c.report);
  if (rep.length) parts.push(`report sur ${rep.length} semaine(s)`);
  return parts.join(', ') || 'Modulation';
}

export function lireModulation(id) {
  const m = db.prepare('SELECT * FROM tt_modulation WHERE id = ?').get(id);
  if (!m) throw err('Modulation introuvable.', 404);
  const u = nomDe(m.utilisateur_id);
  return { ...m, nom: u?.nom_complet || u?.email || `#${m.utilisateur_id}`, changements: JSON.parse(m.changements_json), changements_json: undefined, avant_json: undefined };
}

export function modulations(annee, uid = null) {
  const l = db.prepare(`SELECT id FROM tt_modulation WHERE annee = ? ${uid ? 'AND utilisateur_id = ?' : ''} ORDER BY id DESC`).all(...(uid ? [annee, uid] : [annee]));
  return l.map(x => lireModulation(x.id));
}

/** Contrôle (direction adjointe) puis accord (direction) ; l'accord applique, si rien n'a bougé entre-temps. */
export function valider(id, etape, user, nomUser) {
  const m = db.prepare('SELECT * FROM tt_modulation WHERE id = ?').get(id);
  if (!m) throw err('Modulation introuvable.', 404);
  if (!['proposee', 'controlee'].includes(m.statut)) throw err('Cette modulation est déjà traitée.');
  if (m.utilisateur_id === user.id) throw err('On ne valide pas sa propre modulation.', 403);
  if (etape === 'adjoint') {
    if (!['directeur_adjoint', 'admin', 'directeur'].includes(user.role)) throw err('Réservé à la direction adjointe.', 403);
    if (m.adjoint_le) throw err('Déjà contrôlée.');
    db.prepare("UPDATE tt_modulation SET statut = 'controlee', adjoint_par = ?, adjoint_le = datetime('now') WHERE id = ?").run(nomUser, id);
    return lireModulation(id);
  }
  if (etape !== 'direction') throw err('Étape inconnue.', 400);
  if (!['directeur', 'admin'].includes(user.role)) throw err('Réservé à la direction.', 403);
  if (!m.adjoint_le && !m.simple) throw err('La direction adjointe contrôle d’abord.');
  const avant = JSON.parse(m.avant_json), ch = JSON.parse(m.changements_json);
  const actuel = new Map(anneeDe(m.utilisateur_id, m.annee).map(s => [s.lundi, { statut: s.statut, jours: s.jours }]));
  // Les propositions d'avant 3.5.058 gardaient les seuls jours.
  for (const k of Object.keys(avant)) if (Array.isArray(avant[k])) avant[k] = { statut: actuel.get(k)?.statut, jours: avant[k] };
  for (const c of ch) {
    if (JSON.stringify(actuel.get(c.lundi)) !== JSON.stringify(avant[c.lundi])) throw err(`La semaine du ${c.lundi} a changé depuis la proposition : à refaire.`);
    if (verrouille(m.utilisateur_id, c.lundi) || verrouille(m.utilisateur_id, plusJours(c.lundi, 6))) throw err(`La semaine du ${c.lundi} est dans un mois signé.`);
  }
  const up = db.prepare("UPDATE tt_semaine SET statut = COALESCE(?, statut), jours_json = ?, genere_par = ?, genere_le = datetime('now') WHERE utilisateur_id = ? AND lundi = ?");
  db.transaction(() => {
    for (const c of ch) up.run(c.statut || null, JSON.stringify(c.jours), `${nomUser} (modulation)`, m.utilisateur_id, c.lundi);
    // Une année dont les HEURES sont modulées suit les règles de l'horaire annualisé ; un simple échange de semaines de congé, non.
    if (ch.some(c => (c.statut || null) === (c.statut_avant || null)))
      db.prepare("UPDATE tt_personne SET formule = 'annualise', maj_par = ?, maj_le = datetime('now') WHERE utilisateur_id = ?").run(nomUser, m.utilisateur_id);
    db.prepare("UPDATE tt_modulation SET statut = 'acceptee', direction_par = ?, direction_le = datetime('now') WHERE id = ?").run(nomUser, id);
  })();
  return lireModulation(id);
}

export function refuser(id, motif, user, nomUser) {
  const m = db.prepare('SELECT * FROM tt_modulation WHERE id = ?').get(id);
  if (!m) throw err('Modulation introuvable.', 404);
  if (!['proposee', 'controlee'].includes(m.statut)) throw err('Cette modulation est déjà traitée.');
  if (m.utilisateur_id === user.id) {
    db.prepare("UPDATE tt_modulation SET statut = 'retiree', refus_par = ?, refus_le = datetime('now') WHERE id = ?").run(nomUser, id);
    return lireModulation(id);
  }
  if (!String(motif || '').trim()) throw err('Un refus se motive.', 400);
  db.prepare("UPDATE tt_modulation SET statut = 'refusee', refus_par = ?, refus_le = datetime('now'), motif_refus = ? WHERE id = ?").run(nomUser, String(motif).trim(), id);
  return lireModulation(id);
}

// ── La ligne du temps : tout ce que l'écran dessine, en un appel ──
export function ligne(annee, { voirHeures, moi, user = null }) {
  const semaines = semainesDeLAnnee(annee);
  const conges = semainesDeConge(annee);
  const feries = feriesDe(annee);
  const gens = db.prepare(`SELECT p.utilisateur_id AS id, p.fraction, p.formule, u.nom_complet AS nom, u.email FROM tt_personne p
    JOIN utilisateur u ON u.id = p.utilisateur_id WHERE p.actif = 1 ORDER BY u.nom_complet`).all();
  const personnes = gens.map(g => {
    const heures = voirHeures || g.id === moi;
    const sem = new Map(anneeDe(g.id, annee).map(s => [s.lundi, s]));
    const ecarts = essai(() => db.prepare('SELECT * FROM tt_ecart WHERE utilisateur_id = ? AND jour >= ? AND jour <= ?').all(g.id, semaines[0], plusJours(semaines[51], 6)), []);
    const ec = new Map(ecarts.map(e => [e.jour, e]));
    const lignes = semaines.map(l => {
      const s = sem.get(l);
      const jours = Array.from({ length: 7 }, (_, i) => {
        const d = plusJours(l, i), j = s?.statut === 'travail' ? s.jours[i] : null, e = ec.get(d);
        const c = { statut: s?.statut || null, recup: estRecup(j), present: !!(j && !estRecup(j)) && e?.type !== 'absence', absence: e?.type === 'absence', ferie: feries.get(d) || null };
        if (heures) Object.assign(c, { plan: j && !estRecup(j) ? { debut: j.debut, fin: j.fin, pause_debut: j.pause_debut || null, pause_fin: j.pause_fin || null } : null,
          minutes: duree(j), reel: e?.type === 'reel' ? { debut: e.debut, fin: e.fin } : null });
        return c;
      });
      return heures ? { lundi: l, statut: s?.statut || null, minutes: s ? total(s.jours) : 0, jours } : { lundi: l, statut: s?.statut || null, jours };
    });
    const du = Math.round(REGLES.hebdo * g.fraction) * (52 - REGLES.congesAnnuels);
    const out = { id: g.id, nom: g.nom, email: g.email, formule: g.formule, fraction: g.fraction, genere: sem.size > 0, heures, semaines: lignes, moi: g.id === moi };
    if (heures) Object.assign(out, { du, prevu: lignes.reduce((t, x) => t + x.minutes, 0), reference: Math.round(REGLES.hebdo * g.fraction) });
    return out;
  });
  const presents = semaines.map((l, k) => personnes.filter(p => p.semaines[k].statut === 'travail').length);
  const ag = agenda(annee, { presentsMin: reglage(annee).presents_min });
  return {
    semaines, conges: Object.fromEntries(conges), feries: Object.fromEntries([...feries].filter(([d]) => d >= semaines[0] && d <= plusJours(semaines[51], 6))),
    chaleur: chaleur(annee), moments: moments(annee, { user }), types_moment: TYPES_MOMENT, personnes, presents,
    presents_min: reglage(annee).presents_min, rt_variable: reglage(annee).rt_variable,
    agenda: { cours: ag.cours, fermetures: ag.fermetures, jours_fermes: ag.jours_fermes, besoin: ag.besoin, sections: ag.sections.map(x => ({ section: x.section, actives: x.semaines.map(y => (y.actif ? 1 : 0)) })) },
  };
}

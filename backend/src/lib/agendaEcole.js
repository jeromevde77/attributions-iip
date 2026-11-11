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
import { tousLesPassages } from './passages.js';
import { getUserSections } from '../middleware/auth.js';

/* UNE DATE ILLISIBLE NE FAIT PLUS TOMBER L'AGENDA (3.5.193, « Invalid time value » partout : l'UE 90 portait « 23/08/2026 »).
   jj/mm/aaaa est lu ; ce qui reste illisible rend null au lieu de lever. */
const iso = s => { const t = String(s ?? '').trim(); const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : t.slice(0, 10); };
const d2s = d => (Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10));
const s2d = s => new Date(`${iso(s)}T00:00:00Z`);
export const plus = (s, n) => d2s(new Date(s2d(s).getTime() + n * 86400000));
export const lundiDe = s => { const d = s2d(s); return Number.isNaN(d.getTime()) ? null : plus(iso(s), -((d.getUTCDay() + 6) % 7)); };
const err = (m, status = 409) => Object.assign(new Error(m), { status });
const essai = (f, d) => { try { return f(); } catch { return d; } };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const PEINT_ETABLISSEMENT = ['admin', 'directeur', 'directeur_adjoint'];
export const TYPES_COURS = { cours: 'Cours', vacances: 'Vacances', ev1: 'Évaluations (1)', ev2: 'Évaluations (2)', stage: 'Stage' };

export function migrerAgenda(base = db) {
  // Les dates d'organisation écrites jj/mm/aaaa remises au format de Lucie (3.5.193).
  for (const c of ['date_debut', 'date_fin']) {
    try {
      base.exec(`UPDATE organisation_ue SET ${c} = substr(${c}, 7, 4) || '-' || substr(${c}, 4, 2) || '-' || substr(${c}, 1, 2)
        WHERE ${c} GLOB '[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9]'`);
    } catch { /* table absente */ }
  }
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
/* L'ANNÉE DU TEMPS DE TRAVAIL (3.5.335, Charles, 11 novembre 2026 : « c'est quasi toujours la semaine qui COMPREND le 01/09 ; si le
   01/09 tombe un lundi, c'est le lundi qui précède » ; et l'horaire annualisé commence UNE SEMAINE AVANT : 2026-2027 = du lundi 24/08/2026
   au dimanche 22/08/2027, récupérations comprises). La rentrée R = le lundi de la semaine du 1er septembre (le lundi d'avant si le 1er
   septembre est un lundi) ; l'année commence à R − 7 jours. Remplace « le premier lundi à partir du 15 août » (3.5.063). */
export function debutDAnnee(a1) {
  const d = `${a1}-09-01`; const w = (s2d(d).getUTCDay() + 6) % 7;   // 0 = lundi
  const rentree = w === 0 ? plus(d, -7) : plus(d, -w);
  return plus(rentree, -7);
}
export function semaines52(annee) {
  const a1 = Number(String(annee).split('-')[0]);
  const l0 = debutDAnnee(a1);  // une semaine avant la rentrée (3.5.335)
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

/* LES STAGES (3.5.065, Charles : « et stages ? »). Par semaine : les étudiants en stage (table `stage`, hors annulés), ceux
   dont le stage COMMENCE (la préparation — autorisation, convention, pièces des art. 51 et 55 — se fait les deux semaines
   d'avant), et les périodes des UE de stage (un cours `is_stage`) d'après les dates de leurs organisations, pour les sections
   dont les stages ne sont pas encore encodés un à un (AESI). */
export function stagesParSemaine(annee, semaines = semaines52(annee)) {
  const fin = plus(semaines[semaines.length - 1], 6);
  const st = essai(() => db.prepare(`SELECT section, date_debut AS du, COALESCE(date_fin, date_debut) AS au FROM stage
    WHERE date_debut IS NOT NULL AND date_debut <= ? AND COALESCE(date_fin, date_debut) >= ? AND COALESCE(statut, '') NOT IN ('annule', 'abandonne')`).all(fin, semaines[0]), []);
  const ues = essai(() => db.prepare(`SELECT o.ue_num, o.section, o.num_organisation AS org, o.date_debut AS du, o.date_fin AS au FROM organisation_ue o
    WHERE o.annee_scolaire = ? AND o.date_debut IS NOT NULL AND o.date_fin IS NOT NULL
      AND EXISTS (SELECT 1 FROM cours c WHERE c.ue_num = o.ue_num AND COALESCE(c.is_stage, 0) = 1)`).all(annee), []);
  const avecStages = new Set(st.map(x => x.section));
  return semaines.map(l => {
    const d = plus(l, 6);
    const en = st.filter(x => x.du <= d && x.au >= l);
    const debuts = st.filter(x => x.du >= l && x.du <= d).length;
    const prepares = st.filter(x => x.du > d && x.du <= plus(d, 14)).length;
    const periodes = ues.filter(u => u.du <= d && u.au >= l && !avecStages.has(u.section)).map(u => `${u.section} · UE ${u.ue_num}${u.org > 1 ? ` (org ${u.org})` : ''}`);
    const sections = [...new Set(en.map(x => x.section || '—'))];
    return { lundi: l, etudiants: en.length, debuts, prepares, sections, periodes };
  });
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
  const stages = stagesParSemaine(annee, semaines);
  return {
    annee, semaines, types_cours: TYPES_COURS,
    cours: semaines.map(l => { const c = coursDe.get(l); return c ? { id: c.id, type: c.type, label: c.label } : null; }),
    fermetures: semaines.map(l => { const f = ferm.get(l); return f ? { fermeture: f.fermeture, libelle: f.libelle, par: f.par, le: f.le } : null; }),
    jours_fermes: joursFermes(annee), sections, besoin, stages, desaccords: desaccords(annee), ...unitesEtSessions(annee, semaines),
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
      /* UNE ÉCOLE FERMÉE N'A PAS COURS (3.5.148, Charles : l'agenda, une seule porte). Une fermeture totale passe la semaine en
         « vacances » dans le calendrier des cours, d'office : les deux ne se contredisent plus. */
      if (fermeture === 'totale') {
        const c = essai(() => db.prepare('SELECT id, date_debut, type, label FROM annee_calendrier WHERE annee_scolaire = ?').all(annee), [])
          .find(r => lundiDe(r.date_debut) === x);
        if (c && c.type !== 'vacances') {
          db.prepare('UPDATE annee_calendrier SET type = ?, label = ? WHERE id = ?').run('vacances', String(libelle || '').trim() || c.label || 'Fermeture', c.id);
          journal(annee, 'cours', x, `${c.type} ${c.label || ''}`, `vacances ${libelle || ''}`, par);
        }
      }
    }
  })();
}

/** LES DÉSACCORDS ENTRE LA FERMETURE ET LES COURS (3.5.148) : une semaine fermée en entier qui a cours, une semaine « vacances »
 *  où l'école est ouverte. `aligner` les règle (simulation d'abord) : la fermeture fait foi. */
export function desaccords(annee) {
  const ferm = fermetures(annee);
  const cal = essai(() => db.prepare('SELECT id, date_debut, type, label FROM annee_calendrier WHERE annee_scolaire = ? ORDER BY date_debut').all(annee), []);
  // L'AGENDA EST-IL PEINT ? (3.5.225, circulaire 9760 : le calendrier des cours de 2026-2027 gardait l'ancienne graine — automne
  // au 2/11, carnaval au 15/2, Pâques au 29/3, « Pentecôte » le 17/5.) Quand la direction a peint au moins cinq semaines de
  // fermeture, une semaine « vacances » qu'aucune fermeture ne porte est un désaccord, où qu'elle tombe ; avant, seulement si une
  // fermeture était à une ou deux semaines (un congé décalé).
  const peint = ferm.size >= 5;
  const out = [];
  for (const c of cal) {
    const l = lundiDe(c.date_debut), f = ferm.get(l);
    if (f?.fermeture === 'totale' && c.type !== 'vacances') out.push({ id: c.id, lundi: l, avant: c.type, apres: 'vacances', label: f.libelle || c.label || 'Fermeture', raison: `école fermée (${f.libelle || 'fermeture'}) mais semaine de ${TYPES_COURS[c.type] || c.type}` });
    // Un congé scolaire où l'école reste EN PARTIE ouverte (carnaval, printemps) : les cours s'arrêtent d'ordinaire ; proposé, à cocher.
    else if (f?.fermeture === 'partielle' && c.type === 'cours') out.push({ id: c.id, lundi: l, avant: c.type, apres: 'vacances', label: f.libelle || 'Congé', partielle: true, raison: `congé (${f.libelle || 'fermeture partielle'}), école en partie ouverte, mais semaine de cours` });
    else if (c.type === 'vacances' && !f && (peint || [-14, -7, 7, 14].some(n => ferm.has(plus(l, n))))) out.push({ id: c.id, lundi: l, avant: 'vacances', apres: 'cours', label: null, raison: `« ${c.label || 'vacances'} » alors que l’école est ouverte` });
  }
  return out;
}
/** `ids` : les semaines retenues (l'écran les coche) ; absent = toutes. */
export function aligner(annee, par, ecrire = false, ids = null) {
  const garde = Array.isArray(ids) ? new Set(ids.map(Number)) : null;
  const l = desaccords(annee).filter(x => !garde || garde.has(x.id));
  if (!ecrire) return { changements: l };
  db.transaction(() => {
    for (const x of l) {
      db.prepare('UPDATE annee_calendrier SET type = ?, label = ? WHERE id = ?').run(x.apres, x.label, x.id);
      journal(annee, 'cours', x.lundi, x.avant, `${x.apres} ${x.label || ''}`, par);
    }
  })();
  return { changements: l, ecrit: true };
}

/** LES UNITÉS ET LES SESSIONS DANS L'AGENDA (3.5.148) : par semaine, les ouvertures et fermetures d'unités, les épreuves et les
 *  délibérations — lues de leurs tables (`organisation_ue`, `epreuve_session1`, `deliberation_session2`, `deliberation_seance`). */
export function unitesEtSessions(annee, semaines) {
  const idx = d => semaines.indexOf(lundiDe(d));
  const jm = d => `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}`;
  const unites = semaines.map(l => ({ lundi: l, ouvertures: [], fermetures: [], items: [] }));
  const sessions = semaines.map(l => ({ lundi: l, epreuves: [], deliberations: [], items: [] }));
  const nomUE = n => essai(() => db.prepare('SELECT MAX(ue_nom) n FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(n, annee)?.n || '', '');
  for (const o of essai(() => db.prepare('SELECT id, ue_num, num_organisation org, date_debut du, date_fin au FROM organisation_ue WHERE annee_scolaire = ?').all(annee), [])) {
    const nom = `UE ${o.ue_num}${o.org > 1 ? ` (org. ${o.org})` : ''}`;
    const item = { id: o.id, ue_num: o.ue_num, ue_nom: nomUE(o.ue_num), org: o.org, du: o.du, au: o.au };
    const a = o.du ? idx(o.du) : -1, b = o.au ? idx(o.au) : -1;
    if (a >= 0) { unites[a].ouvertures.push(nom); unites[a].items.push({ ...item, quoi: 'ouvre' }); }
    if (b >= 0) { unites[b].fermetures.push(nom); unites[b].items.push({ ...item, quoi: 'ferme' }); }
  }
  for (const [t, k, n] of [['epreuve_session1', 's1', 1], ['deliberation_session2', 's2', 2]]) {
    // PLUSIEURS PASSAGES (3.5.284) : chaque passage d'un examen paraît à sa semaine ; la date unique cède la place.
    const aP = essai(() => tousLesPassages(annee), []).filter(p => p.session === n);
    const avecP = new Set(aP.map(p => `${p.ue_num}|${p.cours_code || ''}`));
    for (const p of aP) {
      const i = idx(String(p.date).slice(0, 10)); if (i < 0) continue;
      sessions[i].epreuves.push(`S${n} ${p.cours_code || `UE ${p.ue_num}`}${p.partie ? ` ${p.partie}` : ''} — ${jm(p.date)}${p.heure ? ` ${String(p.heure).slice(0, 5)}` : ''}`);
      sessions[i].items.push({ quoi: 'epreuve', session: n, ue_num: p.ue_num, ue_nom: nomUE(p.ue_num), cours_code: p.cours_code || '', date: String(p.date).slice(0, 10), heure: p.heure || '', local: p.local || '', partie: p.partie || '', passage: true });
    }
    for (const e of essai(() => db.prepare(`SELECT ue_num, cours_code, ${k}_date d, ${k}_heure h, ${k}_local l FROM ${t} WHERE annee_scolaire = ? AND ${k}_date IS NOT NULL AND ${k}_date <> ''`).all(annee), [])) {
      if (avecP.has(`${e.ue_num}|${e.cours_code || ''}`)) continue;
      const i = idx(String(e.d).slice(0, 10)); if (i < 0) continue;
      sessions[i].epreuves.push(`S${n} ${e.cours_code || `UE ${e.ue_num}`} — ${jm(e.d)}${e.h ? ` ${String(e.h).slice(0, 5)}` : ''}`);
      sessions[i].items.push({ quoi: 'epreuve', session: n, ue_num: e.ue_num, ue_nom: nomUE(e.ue_num), cours_code: e.cours_code || '', date: String(e.d).slice(0, 10), heure: e.h || '', local: e.l || '' });
    }
  }
  for (const d of essai(() => db.prepare(`SELECT ue_num, COALESCE(session, 1) s, COALESCE(num_organisation, 0) org, date_seance d, heure_seance h, COALESCE(cloturee, 0) close FROM deliberation_seance
      WHERE annee_scolaire = ? AND date_seance IS NOT NULL AND date_seance <> ''`).all(annee), [])) {
    const i = idx(String(d.d).slice(0, 10)); if (i < 0) continue;
    sessions[i].deliberations.push(`S${d.s} UE ${d.ue_num}${d.org ? ` (org. ${d.org})` : ''} — ${jm(d.d)}${d.h ? ` ${String(d.h).slice(0, 5)}` : ''}`);
    sessions[i].items.push({ quoi: 'deliberation', session: d.s, ue_num: d.ue_num, ue_nom: nomUE(d.ue_num), org: d.org, date: String(d.d).slice(0, 10), heure: d.h || '', close: !!d.close });
  }
  return { unites, sessions };
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

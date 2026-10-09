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
import { cohorte, groupeDeBrique } from './groupesCommuns.js';

export const MINUTES_PERIODE = 50;
const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export function migrerPlages(base = db) {
  base.exec(`CREATE TABLE IF NOT EXISTS horaire_plage (
    section TEXT NOT NULL, jour INTEGER NOT NULL, debut TEXT NOT NULL, fin TEXT NOT NULL,
    PRIMARY KEY (section, jour, debut))`);
  // Les plages de TIM, données par Charles le 9 octobre 2026.
  if (!base.prepare("SELECT 1 FROM horaire_plage WHERE section = 'TIM'").get()) {
    const ins = base.prepare('INSERT INTO horaire_plage (section, jour, debut, fin) VALUES (?,?,?,?)');
    for (let j = 1; j <= 5; j++) { ins.run('TIM', j, '15:30', '17:30'); ins.run('TIM', j, '17:30', '19:30'); }
    for (const [d, f] of [['08:00', '10:00'], ['10:00', '12:00'], ['12:00', '14:00'], ['14:00', '16:00']]) ins.run('TIM', 6, d, f);
  }
}
export const plagesDe = section => db.prepare('SELECT jour, debut, fin FROM horaire_plage WHERE section = ? ORDER BY jour, debut').all(section);
export function ecrirePlages(section, plages) {
  db.transaction(() => {
    db.prepare('DELETE FROM horaire_plage WHERE section = ?').run(section);
    const ins = db.prepare('INSERT OR IGNORE INTO horaire_plage (section, jour, debut, fin) VALUES (?,?,?,?)');
    for (const p of plages) if (p.jour >= 1 && p.jour <= 7 && /^\d\d:\d\d$/.test(p.debut) && /^\d\d:\d\d$/.test(p.fin) && p.debut < p.fin) ins.run(section, p.jour, p.debut, p.fin);
  })();
}
const minutes = (d, f) => { const [a, b] = d.split(':').map(Number); const [c, e] = f.split(':').map(Number); return (c * 60 + e) - (a * 60 + b); };
const iso = d => d.toISOString().slice(0, 10);

/** Les créneaux de l'année : [{ date, semaine, quadri, debut, fin, minutes }]. */
function creneaux(section, annee) {
  const plages = plagesDe(section);
  const [a1, a2] = String(annee).split('-').map(Number);
  const feries = new Set([...joursFeries(a1), ...joursFeries(a2)].map(([d]) => d));
  const semaines = db.prepare(`SELECT date_debut, date_fin FROM annee_calendrier WHERE annee_scolaire = ? AND type = 'cours' ORDER BY date_debut`).all(annee);
  const finQ1 = db.prepare(`SELECT MAX(date_fin) f FROM annee_calendrier WHERE annee_scolaire = ? AND type = 'ev1'`).get(annee)?.f || `${a2}-01-31`;
  const out = [];
  semaines.forEach((s, k) => {
    // La semaine de cours s'arrête au vendredi dans le calendrier ; le samedi
    // de la même semaine en fait partie quand la section y donne cours.
    const fin = new Date(`${s.date_debut}T12:00:00Z`); fin.setUTCDate(fin.getUTCDate() + 6);
    for (let d = new Date(`${s.date_debut}T12:00:00Z`); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = iso(d), j = d.getUTCDay() || 7;
      if (feries.has(date)) continue;
      for (const p of plages.filter(x => x.jour === j)) out.push({ date, semaine: k + 1, jour: j, quadri: date <= finQ1 ? 'Q1' : 'Q2', debut: p.debut, fin: p.fin, minutes: minutes(p.debut, p.fin) });
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
      activite: l.libelle || null, groupe, briques, tout_le_bloc: briques.length === toutes.length,
      professeur_id: l.professeur_id || null, professeur: l.prof_nom ? `${String(l.prof_nom).toUpperCase()} ${l.prof_prenom || ''}`.trim() : null,
      periodes: l.periodes, minutes: l.periodes * MINUTES_PERIODE, quadri });
  }
  return out;
}

/** La simulation. Rend la capacité, les séances placées et ce qui reste. */
export function simuler(section, bloc, annee) {
  const c = cohorte(section, bloc, annee);
  const { out: slots, nbSemaines, plages } = creneaux(section, annee);
  const dem = demandes(c, annee);
  // Occupations : brique et enseignant, par créneau (date + début).
  const k = s => `${s.date}|${s.debut}`;
  const occB = new Map(), occP = new Map();
  // Les séances déjà posées ailleurs (toutes sections) occupent leurs enseignants.
  let posees = [];
  try {
    posees = db.prepare(`SELECT date, heure_debut, heure_fin, professeur_id FROM horaire_seance
      WHERE annee_scolaire = ? AND professeur_id IS NOT NULL AND COALESCE(annule, 0) = 0`).all(annee);
  } catch { posees = []; }
  for (const h of posees) {
    for (const s of slots) if (s.date === h.date && s.debut < (h.heure_fin || '') && s.fin > (h.heure_debut || '')) {
      if (!occP.has(k(s))) occP.set(k(s), new Set()); occP.get(k(s)).add(h.professeur_id);
    }
  }
  const libre = (s, d) => !(d.briques.some(b => occB.get(k(s))?.has(b)) || (d.professeur_id && occP.get(k(s))?.has(d.professeur_id)));
  const poser = (s, d) => {
    if (!occB.has(k(s))) occB.set(k(s), new Set()); d.briques.forEach(b => occB.get(k(s)).add(b));
    if (d.professeur_id) { if (!occP.has(k(s))) occP.set(k(s), new Set()); occP.get(k(s)).add(d.professeur_id); }
  };
  // Le plus contraint d'abord : tout le bloc (théorie), puis les groupes les plus longs.
  const ordre = [...dem].sort((x, y) => (y.tout_le_bloc - x.tout_le_bloc) || (y.minutes - x.minutes));
  const seances = [], restes = [];
  for (const d of ordre) {
    const possibles = slots.filter(s => d.quadri === 'AN' || s.quadri === d.quadri);
    const semaines = [...new Set(possibles.map(s => s.semaine))];
    const duree = possibles[0]?.minutes || 120;
    let besoin = Math.ceil(d.minutes / duree), place = 0;
    if (!semaines.length) { restes.push({ ...d, manque: besoin, raison: 'aucune semaine de cours dans son quadrimestre' }); continue; }
    // Étaler : viser une séance toutes les `pas` semaines, puis combler.
    const pas = Math.max(1, semaines.length / besoin);
    const essayer = (sem) => {
      const s = possibles.find(x => x.semaine === sem && libre(x, d));
      if (!s) return false;
      poser(s, d); seances.push({ ...s, cle: d.cle, cours_code: d.cours_code, activite: d.activite, groupe: d.groupe,
        professeur: d.professeur, briques: d.briques, tout_le_bloc: d.tout_le_bloc }); place++; return true;
    };
    for (let i = 0; i < besoin; i++) {
      const cible = Math.min(semaines.length - 1, Math.floor(i * pas));
      let ok = false;
      for (let delta = 0; delta < semaines.length && !ok; delta++) {
        for (const sgn of delta ? [1, -1] : [1]) {
          const j = cible + sgn * delta;
          if (j >= 0 && j < semaines.length && essayer(semaines[j])) { ok = true; break; }
        }
      }
      if (!ok) break;
    }
    if (place < besoin) {
      const conflitProf = d.professeur_id && possibles.some(s => !d.briques.some(b => occB.get(k(s))?.has(b)) && occP.get(k(s))?.has(d.professeur_id));
      restes.push({ ...d, place, manque: besoin - place,
        raison: conflitProf ? 'l’enseignant est déjà occupé sur les créneaux où ses étudiants sont libres' : 'plus de créneau libre pour ces étudiants dans le quadrimestre' });
    }
  }
  // La capacité, brique par brique : heures disponibles et heures demandées.
  const dispo = slots.reduce((t, s) => t + s.minutes, 0);
  const demandeParBrique = Array.from({ length: Math.max(1, c.nb_briques) }, (_, i) => dem.filter(d => d.briques.includes(i + 1)).reduce((t, d) => t + d.minutes, 0));
  return {
    section, bloc, annee, nb_semaines: nbSemaines, plages: plages.map(p => ({ ...p, jour_nom: JOURS[p.jour] })),
    creneaux: slots.length, heures_disponibles: Math.round(dispo / 60),
    heures_demandees_max: Math.round(Math.max(...demandeParBrique) / 60), heures_demandees_min: Math.round(Math.min(...demandeParBrique) / 60),
    nb_demandes: dem.length, nb_seances: seances.length,
    activites: dem.map(d => ({ cle: d.cle, cours_code: d.cours_code, activite: d.activite, groupe: d.groupe, professeur: d.professeur,
      periodes: d.periodes, quadri: d.quadri, tout_le_bloc: d.tout_le_bloc,
      besoin: Math.ceil(d.minutes / (slots[0]?.minutes || 120)), place: seances.filter(s => s.cle === d.cle).length })),
    restes, seances: seances.sort((x, y) => (x.date + x.debut).localeCompare(y.date + y.debut)),
  };
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
      cours_code, ue_num, matiere, professeur_id, groupe_id, sous_groupe, source, modifie_lucie, cree_par, cree_le)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'simulation', 0, ?, datetime('now'))`);
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
        `${x.activite || ''}${code && code !== 'Ts' ? ` · groupe ${code}` : ''}`.trim() || null, a.professeur_id || null, g, sg, par);
    }
  })();
  return { ...rapport, ok: true };
}

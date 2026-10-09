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
    PRIMARY KEY (section, jour, debut));
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
}
export const plagesDe = section => db.prepare('SELECT jour, debut, fin FROM horaire_plage WHERE section = ? ORDER BY jour, debut').all(section);
export function ecrirePlages(section, plages) {
  db.transaction(() => {
    db.prepare('DELETE FROM horaire_plage WHERE section = ?').run(section);
    const ins = db.prepare('INSERT OR IGNORE INTO horaire_plage (section, jour, debut, fin) VALUES (?,?,?,?)');
    for (const p of plages) if (p.jour >= 1 && p.jour <= 7 && /^\d\d:\d\d$/.test(p.debut) && /^\d\d:\d\d$/.test(p.fin) && p.debut < p.fin) ins.run(section, p.jour, p.debut, p.fin);
  })();
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
      activite_id: l.act, tp: !!(a && a.inclus),
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
  const libre = (s, d) => !(d.briques.some(b => occB.get(k(s))?.has(b)) || (d.professeur_id && occP.get(k(s))?.has(d.professeur_id)));
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
  const ajouter = (s, d, regulier, local) => {
    poser(s, d, local); seances.push({ ...s, cle: d.cle, cours_code: d.cours_code, cours_nom: d.cours_nom, activite: d.activite, groupe: d.groupe,
      professeur: d.professeur, briques: d.briques, tout_le_bloc: d.tout_le_bloc, regulier, local: local || null });
  };
  for (const d of ordre) {
    const possibles = slots.filter(s => d.quadri === 'AN' || s.quadri === d.quadri);
    const semaines = [...new Set(possibles.map(s => s.semaine))];
    const duree = possibles[0]?.minutes || 120;
    const besoin = Math.ceil(d.minutes / duree);
    let place = 0;
    fixes.set(d.cle, []);
    if (!semaines.length) { restes.push({ ...d, manque: besoin, raison: 'aucune semaine de cours dans son quadrimestre' }); continue; }
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
          // Score : couvrir le plus, avec le moins de trous, finir le plus tôt, le local préféré.
          const score = [choisies.length, -trous, -choisies[choisies.length - 1].semaine, -rang];
          if (!meilleur || plusGrand(score, meilleur.score)) meilleur = { t, l, choisies, trous, score };
        }
      }
      // Un créneau qui ne porterait qu'une poignée de séances n'est pas un créneau fixe.
      if (!meilleur || (meilleur.choisies.length < Math.min(3, besoin - place) && fixes.get(d.cle).length)) break;
      const [s0] = meilleur.choisies, sN = meilleur.choisies[meilleur.choisies.length - 1];
      meilleur.choisies.forEach(s => ajouter(s, d, true, meilleur.l));
      place += meilleur.choisies.length;
      fixes.get(d.cle).push({ type: meilleur.t, local: meilleur.l || null, jour: s0.jour, jour_nom: JOURS[s0.jour], debut: s0.debut, fin: s0.fin,
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
      const sansSalle = d.local_origine !== 'a_designer' && possibles.some(s => libre(s, d));
      restes.push({ ...d, place, manque: besoin - place,
        raison: d.local_origine === 'aucun' ? `aucune classe ni auditoire de ${d.effectif} places au référentiel des locaux`
          : sansSalle ? 'ses locaux possibles sont tous occupés quand étudiants et enseignant sont libres'
          : conflitProf ? 'l’enseignant est déjà occupé sur les créneaux où ses étudiants sont libres' : 'plus de créneau libre pour ces étudiants dans le quadrimestre' });
    }
  }
  // La capacité, brique par brique : heures disponibles et heures demandées.
  const dispo = slots.reduce((t, s) => t + s.minutes, 0);
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
    section, bloc, annee, nb_semaines: nbSemaines, semaines: semainesListe, actuel, heures_attribuees: heuresDemandeesBloc, plages: plages.map(p => ({ ...p, jour_nom: JOURS[p.jour] })),
    creneaux: slots.length, heures_disponibles: Math.round(dispo / 60),
    heures_demandees_max: Math.round(Math.max(...demandeParBrique) / 60), heures_demandees_min: Math.round(Math.min(...demandeParBrique) / 60),
    nb_demandes: dem.length, nb_seances: seances.length,
    activites: dem.map(d => ({ cle: d.cle, cours_code: d.cours_code, activite: d.activite, groupe: d.groupe, professeur: d.professeur,
      periodes: d.periodes, quadri: d.quadri, tout_le_bloc: d.tout_le_bloc,
      besoin: Math.ceil(d.minutes / (slots[0]?.minutes || 120)), place: seances.filter(s => s.cle === d.cle).length,
      creneaux_fixes: (fixes.get(d.cle) || []).map(({ type, ...f }) => f), irreguliers: fixes.get(d.cle)?.irreguliers || 0,
      activite_id: d.activite_id, effectif: d.effectif, locaux: d.locaux, local_origine: d.local_origine })),
    referentiel_locaux: referentiel,
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

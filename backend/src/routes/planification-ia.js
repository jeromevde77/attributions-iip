/**
 * planification-ia.js — Moteur de génération IA pour la grille horaire
 * Génère un brouillon de planification basé sur :
 * - Les prérequis UE (ordre topologique)
 * - Les quadrimestres des UE (Q1/Q2/Q1Q2)
 * - Les paramètres (dates Q1/Q2, valeurs EV1/EV2/VC)
 * - Le pattern d'alternance de chaque groupe
 * - Les disponibilités des profs (avertissements uniquement)
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { getParam, getParamNum } from './parametres.js';

const r = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(s) { return s ? new Date(s + 'T12:00:00') : null; }

function semainesDansIntervalle(semaines, debut, fin) {
  if (!debut || !fin) return semaines;
  return semaines.filter(s => {
    const d = parseDate(s.date_debut);
    return d >= debut && d <= fin;
  });
}

// Tri topologique des UE (Kahn's algorithm)
function trierParPrerequis(ueNums, prerequisMap) {
  // prerequisMap = { ue_num: [prerequis_num, ...] }
  const inDegree = {};
  const graph = {}; // ue → liste des UE qui en dépendent
  for (const u of ueNums) { inDegree[u] = 0; graph[u] = []; }
  for (const [ue, pres] of Object.entries(prerequisMap)) {
    if (!ueNums.includes(Number(ue))) continue;
    for (const p of pres) {
      if (!ueNums.includes(p)) continue;
      inDegree[ue] = (inDegree[ue] || 0) + 1;
      if (!graph[p]) graph[p] = [];
      graph[p].push(Number(ue));
    }
  }
  const queue = ueNums.filter(u => !inDegree[u]);
  const result = [];
  while (queue.length) {
    const u = queue.shift();
    result.push(u);
    for (const dep of (graph[u] || [])) {
      inDegree[dep]--;
      if (inDegree[dep] === 0) queue.push(dep);
    }
  }
  // Ajouter les UE non résolues (cycles éventuels) à la fin
  for (const u of ueNums) if (!result.includes(u)) result.push(u);
  return result;
}

// Filtrer les semaines selon le pattern
function appliquerPattern(semaines, pattern, offset) {
  if (pattern === 'toutes') return semaines;
  return semaines.filter((_, i) => {
    const idx = i + (offset || 0);
    if (pattern === 'paires')   return idx % 2 === 0;
    if (pattern === 'impaires') return idx % 2 === 1;
    return true;
  });
}

// Distribuer des heures uniformément sur des semaines
function distribuerHeures(semaines, hTotal, hParSemaine) {
  // hParSemaine = heures par créneau (ex. 2h = 1 bloc)
  // On répartit le plus uniformément possible
  const result = {};
  if (!semaines.length || hTotal <= 0) return result;
  let restant = hTotal;
  const h = Math.min(hParSemaine, hTotal);
  for (const sem of semaines) {
    if (restant <= 0) break;
    const pose = Math.min(h, restant);
    result[sem.id] = pose;
    restant -= pose;
  }
  return result;
}

// ─── Route principale : générer un brouillon ─────────────────────────────────
// POST /planification-ia/generer
// body: { section, annee_scolaire, mode: 'preview'|'apply', preserverManuel: bool }
r.post('/generer', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { section, annee_scolaire, mode = 'preview', preserverManuel = true } = req.body;
  if (!section || !annee_scolaire) return res.status(400).json({ error: 'section et annee_scolaire requis' });

  // ── 1. Lire les paramètres ────────────────────────────────────────────────
  const q1Debut = parseDate(getParam('planning.q1_debut', `${annee_scolaire.slice(0,4)}-09-01`));
  const q1Fin   = parseDate(getParam('planning.q1_fin',   `${Number(annee_scolaire.slice(0,4))+1}-01-31`));
  const q2Debut = parseDate(getParam('planning.q2_debut', `${Number(annee_scolaire.slice(0,4))+1}-02-01`));
  const q2Fin   = parseDate(getParam('planning.q2_fin',   `${Number(annee_scolaire.slice(0,4))+1}-06-30`));
  const ev1H    = getParamNum('planning.ev1_heures', 2);
  const ev2H    = getParamNum('planning.ev2_heures', 0);
  const vcH     = getParamNum('planning.vc_heures',  1);
  const minSemEV = getParamNum('planning.min_semaines_ev1_ev2', 1);

  // ── 2. Charger les semaines du calendrier ─────────────────────────────────
  const toutesLesSeamines = db.prepare(
    'SELECT * FROM annee_calendrier WHERE annee_scolaire = ? ORDER BY semaine_num'
  ).all(annee_scolaire);

  const semainesCours = toutesLesSeamines.filter(s => s.type === 'cours');
  const semainesQ1    = semainesDansIntervalle(semainesCours, q1Debut, q1Fin);
  const semainesQ2    = semainesDansIntervalle(semainesCours, q2Debut, q2Fin);

  // Semaine EV1 = dernière semaine Q1, VC = juste après, EV2 = dernière semaine Q2
  const dernSemQ1 = [...toutesLesSeamines].filter(s => {
    const d = parseDate(s.date_debut);
    return d >= q1Debut && d <= q1Fin;
  }).slice(-1)[0];
  const dernSemQ2 = [...toutesLesSeamines].filter(s => {
    const d = parseDate(s.date_debut);
    return d >= q2Debut && d <= q2Fin;
  }).slice(-1)[0];

  // Semaine VC = 1ère semaine non-vacances après EV1
  const idxEV1 = dernSemQ1 ? toutesLesSeamines.findIndex(s => s.id === dernSemQ1.id) : -1;
  const semVC = idxEV1 >= 0
    ? toutesLesSeamines.slice(idxEV1 + 1).find(s => s.type !== 'vacances' && s.type !== 'ferie')
    : null;

  // Semaine EV2 = dernière semaine cours Q2 (pas la toute dernière si on veut garder de l'espace)
  const semEV2 = dernSemQ2;

  // ── 3. Charger les groupes de la section ─────────────────────────────────
  const groupes = db.prepare(`
    SELECT g.*, u.ue_quad, u.is_epreuve_integree, u.ue_nom
    FROM groupe g
    LEFT JOIN ue u ON u.ue_num = g.ue_num AND u.annee_scolaire = g.annee_scolaire
    WHERE g.annee_scolaire = ? AND g.section = ?
    ORDER BY g.ue_num, g.nom
  `).all(annee_scolaire, section);

  if (!groupes.length) return res.status(404).json({ error: `Aucun groupe trouvé pour ${section} ${annee_scolaire}` });

  // ── 4. Charger les prérequis et trier les UE ──────────────────────────────
  const prereqRows = db.prepare(`
    SELECT ue_num, prerequis_num FROM ue_prerequis
    WHERE (section = ? OR section IS NULL) AND (annee_scolaire = ? OR annee_scolaire IS NULL)
  `).all(section, annee_scolaire);

  const prerequisMap = {}; // ue_num → [prerequis_nums]
  for (const { ue_num, prerequis_num } of prereqRows) {
    if (!prerequisMap[ue_num]) prerequisMap[ue_num] = [];
    prerequisMap[ue_num].push(prerequis_num);
  }

  const ueNums = [...new Set(groupes.map(g => g.ue_num))];
  const ueOrdre = trierParPrerequis(ueNums, prerequisMap);

  // ── 5. Charger les cellules manuelles existantes ──────────────────────────
  const groupeIds = groupes.map(g => g.id);
  const cellulesExistantes = {};
  if (groupeIds.length) {
    const rows = db.prepare(`
      SELECT groupe_id, semaine_id, valeur, manuel
      FROM planification
      WHERE groupe_id IN (${groupeIds.map(() => '?').join(',')})
    `).all(...groupeIds);
    for (const r of rows) {
      cellulesExistantes[`${r.groupe_id}_${r.semaine_id}`] = { valeur: r.valeur, manuel: r.manuel };
    }
  }

  // ── 6. Calculer la dernière semaine utilisée par UE (pour prérequis) ──────
  // Après avoir posé toutes les UE, on connaît leur "fin"
  const finUE = {}; // ue_num → semaine_num max utilisée
  const proposition = {}; // groupe_id → { semaine_id: valeur }
  const alertes = [];

  // Trier les groupes par ordre topologique des UE
  const groupesOrdonnes = [];
  for (const ueNum of ueOrdre) {
    for (const g of groupes.filter(g => g.ue_num === ueNum)) {
      groupesOrdonnes.push(g);
    }
  }

  // ── 7. Générer la planification pour chaque groupe ────────────────────────
  for (const groupe of groupesOrdonnes) {
    proposition[groupe.id] = {};

    // Ne pas écraser les cellules manuelles si preserverManuel
    const cellulesFixees = new Set();
    if (preserverManuel) {
      for (const [key, cell] of Object.entries(cellulesExistantes)) {
        if (key.startsWith(`${groupe.id}_`) && cell.manuel) {
          const semaineId = Number(key.split('_')[1]);
          proposition[groupe.id][semaineId] = cell.valeur;
          cellulesFixees.add(semaineId);
        }
      }
    }

    // Déterminer les semaines disponibles selon le quadrimestre de l'UE
    const quad = groupe.ue_quad || 'Q1Q2';
    let semainesDispos;
    if (quad === 'Q1')      semainesDispos = [...semainesQ1];
    else if (quad === 'Q2') semainesDispos = [...semainesQ2];
    else                    semainesDispos = [...semainesCours]; // annuel ou non défini

    // Vérifier les prérequis : ne pas commencer avant que les UE prérequises soient terminées
    const pres = prerequisMap[groupe.ue_num] || [];
    let debutMin = 0; // semaine_num minimum
    for (const preNum of pres) {
      const finPre = finUE[preNum];
      if (finPre && finPre > debutMin) debutMin = finPre;
    }
    if (debutMin > 0) {
      semainesDispos = semainesDispos.filter(s => s.semaine_num > debutMin);
      if (!semainesDispos.length) {
        alertes.push({
          groupe_id: groupe.id,
          ue_num: groupe.ue_num,
          msg: `UE${groupe.ue_num} ${groupe.ue_nom || ''} : aucune semaine disponible après les prérequis (fin sem. ${debutMin}). Vérifiez les prérequis ou les quadrimestres.`
        });
      }
    }

    // Appliquer le pattern d'alternance
    semainesDispos = appliquerPattern(semainesDispos, groupe.pattern || 'toutes', groupe.pattern_offset || 0);

    // Exclure les semaines déjà fixées manuellement
    semainesDispos = semainesDispos.filter(s => !cellulesFixees.has(s.id));

    // Calculer les heures déjà fixées manuellement
    let hDejaFixees = 0;
    for (const semaineId of cellulesFixees) {
      const val = proposition[groupe.id][semaineId];
      const up = String(val || '').toUpperCase();
      if (up === 'EV1') hDejaFixees += ev1H;
      else if (up === 'VC') hDejaFixees += vcH;
      else if (up !== 'EV2') hDejaFixees += parseFloat(val) || 0;
    }

    const hRestante = Math.max(0, (groupe.heures_attribuees || 0) - hDejaFixees);

    // Distribuer les heures restantes (2h par semaine par défaut)
    const hParSemaine = 2;
    const distribution = distribuerHeures(semainesDispos, hRestante, hParSemaine);
    for (const [semaineId, h] of Object.entries(distribution)) {
      proposition[groupe.id][Number(semaineId)] = h;
    }

    // Poser EV1 si l'UE est en Q1 ou annuelle et que dernSemQ1 existe
    if (dernSemQ1 && (quad === 'Q1' || quad === 'Q1Q2' || !quad) && !cellulesFixees.has(dernSemQ1.id)) {
      proposition[groupe.id][dernSemQ1.id] = 'EV1';
    }

    // Poser VC
    if (semVC && (quad === 'Q1' || quad === 'Q1Q2' || !quad) && !cellulesFixees.has(semVC.id)) {
      proposition[groupe.id][semVC.id] = 'VC';
    }

    // Poser EV2
    if (semEV2 && (quad !== 'Q1') && !cellulesFixees.has(semEV2.id)) {
      proposition[groupe.id][semEV2.id] = 'EV2';
    }

    // Mettre à jour la fin de cette UE pour les prérequis suivants
    const semainesUtilisees = Object.keys(proposition[groupe.id]).map(Number);
    if (semainesUtilisees.length) {
      const maxSemId = Math.max(...semainesUtilisees);
      const sem = toutesLesSeamines.find(s => s.id === maxSemId);
      if (sem) {
        finUE[groupe.ue_num] = Math.max(finUE[groupe.ue_num] || 0, sem.semaine_num);
      }
    }
  }

  // ── 8. Appliquer ou retourner en preview ──────────────────────────────────
  if (mode === 'apply') {
    const upsert = db.transaction(() => {
      for (const [groupeIdStr, cellules] of Object.entries(proposition)) {
        const groupeId = Number(groupeIdStr);
        // Supprimer les cellules non-manuelles existantes pour ce groupe
        if (!preserverManuel) {
          db.prepare('DELETE FROM planification WHERE groupe_id = ?').run(groupeId);
        } else {
          db.prepare('DELETE FROM planification WHERE groupe_id = ? AND (manuel = 0 OR manuel IS NULL)').run(groupeId);
        }
        // Insérer les nouvelles cellules
        for (const [semaineIdStr, valeur] of Object.entries(cellules)) {
          const semaineId = Number(semaineIdStr);
          if (!valeur && valeur !== 0) continue;
          db.prepare(`INSERT OR REPLACE INTO planification (groupe_id, semaine_id, valeur, manuel)
            VALUES (?,?,?,0)`).run(groupeId, semaineId, String(valeur));
        }
      }
    });
    upsert();

    res.json({
      ok: true,
      groupes_traites: groupesOrdonnes.length,
      alertes,
      message: `${groupesOrdonnes.length} groupe(s) planifiés pour ${section} ${annee_scolaire}`
    });
  } else {
    // Preview : retourner la proposition sans écrire
    res.json({
      ok: true,
      proposition, // { groupe_id: { semaine_id: valeur } }
      alertes,
      meta: {
        groupes_traites: groupesOrdonnes.length,
        ue_ordre: ueOrdre,
        sem_ev1: dernSemQ1?.id,
        sem_vc:  semVC?.id,
        sem_ev2: semEV2?.id,
      }
    });
  }
});

export default r;

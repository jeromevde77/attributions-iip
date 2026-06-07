/**
 * planification.js — Routes pour la grille horaire annuelle
 * Gestion : calendrier, groupes, planification (heures × semaine)
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// ─── CALENDRIER DES SESSIONS (calcul rétroactif) ──────────────────────────────
// Calcule, en partant du dernier jour de travail admin, les dates jalons des
// sessions et surtout la DERNIÈRE date de cours possible.
function param(cle, def) {
  const row = db.prepare('SELECT valeur FROM parametre WHERE cle = ?').get(cle);
  return row ? row.valeur : def;
}
function addJoursCalendrier(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function addJoursOuvrables(date, n) {
  // n peut être négatif (rétroactif). Compte les jours lun-ven.
  const d = new Date(date);
  const step = n < 0 ? -1 : 1;
  let reste = Math.abs(n);
  while (reste > 0) {
    d.setDate(d.getDate() + step);
    const jour = d.getDay(); // 0=dim, 6=sam
    if (jour !== 0 && jour !== 6) reste--;
  }
  return d;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }

// GET /planification/calendrier-sessions
// Retourne la chaîne de dates rétroactives + dernière date de cours possible
r.get('/calendrier-sessions', authRequired, (req, res) => {
  const dernierAdmin = req.query.dernier_jour || param('session.dernier_jour_admin', '');
  if (!dernierAdmin) {
    return res.json({ defini: false, message: 'Dernier jour admin non défini dans les paramètres.' });
  }
  const N = (cle, def) => parseInt(param(cle, def), 10);

  // Remontée depuis le dernier jour admin
  let cur = new Date(dernierAdmin);
  // 1. − jours ouvrables recours
  const debutRecours = addJoursOuvrables(cur, -N('session.recours_jours_ouvr', 5));
  // 2. − jours cal entre délib S2 et recours
  let d = addJoursCalendrier(debutRecours, -N('session.delib2_recours_cal', 3));
  // 3. − durée délib S2
  const delibEV2 = addJoursCalendrier(d, -N('session.delib2_duree_cal', 1));
  // 4. − corrections → EV2
  const ev2 = addJoursCalendrier(delibEV2, -N('session.corrections_ev2_cal', 3));
  // 5. − jours cal entre VC1 et EV2 → VC EV1
  const vcEV1 = addJoursCalendrier(ev2, -N('session.vc1_ev2_cal', 10));
  // 6. − jours cal entre délib EV1 et VC EV1 → délib EV1
  const delibEV1 = addJoursCalendrier(vcEV1, -N('session.delib1_vc1_cal', 3));
  // 7. − jours cal entre EV1 et délib EV1 → EV1
  const ev1 = addJoursCalendrier(delibEV1, -N('session.ev1_delib1_cal', 5));
  // 8. − 1 semaine entre dernier cours et EV1 → dernier cours
  const dernierCours = addJoursCalendrier(ev1, -N('session.cours_ev1_cal', 7));

  res.json({
    defini: true,
    dernier_jour_admin: dernierAdmin,
    debut_recours:    isoDate(debutRecours),
    delib_ev2:        isoDate(delibEV2),
    ev2:              isoDate(ev2),
    vc_ev1:           isoDate(vcEV1),
    delib_ev1:        isoDate(delibEV1),
    ev1:              isoDate(ev1),
    dernier_cours:    isoDate(dernierCours),
    delais: {
      recours_jours_ouvr:  N('session.recours_jours_ouvr', 5),
      delib2_recours_cal:  N('session.delib2_recours_cal', 3),
      delib2_duree_cal:    N('session.delib2_duree_cal', 1),
      corrections_ev2_cal: N('session.corrections_ev2_cal', 3),
      vc1_ev2_cal:         N('session.vc1_ev2_cal', 10),
      delib1_vc1_cal:      N('session.delib1_vc1_cal', 3),
      ev1_delib1_cal:      N('session.ev1_delib1_cal', 5),
      cours_ev1_cal:       N('session.cours_ev1_cal', 7),
    },
  });
});

// GET /planification/calendrier?annee=2025-2026
r.get('/calendrier', authRequired, (req, res) => {
  const annee = req.query.annee || db.prepare("SELECT code FROM annee_scolaire WHERE active=1").get()?.code || '2025-2026';
  const rows = db.prepare('SELECT * FROM annee_calendrier WHERE annee_scolaire = ? ORDER BY semaine_num').all(annee);
  res.json(rows);
});

// PATCH /planification/calendrier/:id — modifier type/label d'une semaine
r.patch('/calendrier/:id', authRequired, roleRequired('admin'), (req, res) => {
  const { type, label } = req.body;
  const allowed = ['cours', 'ev1', 'ev2', 'vacances', 'stage', 'ferie'];
  if (type && !allowed.includes(type)) return res.status(400).json({ error: 'Type invalide' });
  const sem = db.prepare('SELECT id FROM annee_calendrier WHERE id = ?').get(req.params.id);
  if (!sem) return res.status(404).json({ error: 'Semaine introuvable' });
  if (type !== undefined) db.prepare("UPDATE annee_calendrier SET type = ? WHERE id = ?").run(type, sem.id);
  if (label !== undefined) db.prepare("UPDATE annee_calendrier SET label = ? WHERE id = ?").run(label || null, sem.id);
  res.json({ ok: true });
});

// POST /planification/calendrier/bulk — modifier plusieurs semaines d'un coup (ex. vacances)
r.post('/calendrier/bulk', authRequired, roleRequired('admin'), (req, res) => {
  const { ids, type, label } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids requis' });
  const update = db.transaction(() => {
    for (const id of ids) {
      if (type !== undefined) db.prepare("UPDATE annee_calendrier SET type = ? WHERE id = ?").run(type, id);
      if (label !== undefined) db.prepare("UPDATE annee_calendrier SET label = ? WHERE id = ?").run(label || null, id);
    }
  });
  update();
  res.json({ ok: true, updated: ids.length });
});

// ─── GROUPES ──────────────────────────────────────────────────────────────────

// GET /planification/groupes?annee=&section=&ue_num=
r.get('/groupes', authRequired, (req, res) => {
  const { annee, section, ue_num } = req.query;
  let sql = `
    SELECT g.*, p.nom AS prof_nom, p.prenom AS prof_prenom,
           u.ue_nom
    FROM groupe g
    LEFT JOIN professeur p ON p.id = g.professeur_id
    LEFT JOIN ue u ON u.ue_num = g.ue_num AND u.annee_scolaire = g.annee_scolaire
    WHERE 1=1`;
  const params = [];
  if (annee)   { sql += ' AND g.annee_scolaire = ?'; params.push(annee); }
  if (section) { sql += ' AND g.section = ?';        params.push(section); }
  if (ue_num)  { sql += ' AND g.ue_num = ?';         params.push(ue_num); }
  sql += ' ORDER BY g.section, g.ue_num, g.nom';
  res.json(db.prepare(sql).all(...params));
});

// POST /planification/groupes
r.post('/groupes', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee_scolaire, ue_num, section, nom, nb_etudiants, professeur_id, heures_attribuees, notes } = req.body;
  if (!annee_scolaire || !ue_num || !nom) return res.status(400).json({ error: 'annee_scolaire, ue_num, nom requis' });
  const info = db.prepare(`
    INSERT INTO groupe (annee_scolaire, ue_num, section, nom, nb_etudiants, professeur_id, heures_attribuees, notes)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(annee_scolaire, ue_num, section || null, nom, nb_etudiants || 0, professeur_id || null, heures_attribuees || 0, notes || null);
  res.json({ id: info.lastInsertRowid });
});

// PATCH /planification/groupes/:id
r.patch('/groupes/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const g = db.prepare('SELECT id FROM groupe WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Groupe introuvable' });
  const fields = ['nom', 'nb_etudiants', 'professeur_id', 'heures_attribuees', 'notes', 'section'];
  const updates = [];
  const vals = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); vals.push(req.body[f]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'Rien à modifier' });
  updates.push("modifie_le = datetime('now')");
  vals.push(g.id);
  db.prepare(`UPDATE groupe SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

// DELETE /planification/groupes/:id
r.delete('/groupes/:id', authRequired, roleRequired('admin'), (req, res) => {
  const g = db.prepare('SELECT id FROM groupe WHERE id = ?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Groupe introuvable' });
  db.prepare('DELETE FROM groupe WHERE id = ?').run(g.id);
  res.json({ ok: true });
});

// ─── PLANIFICATION ────────────────────────────────────────────────────────────

// GET /planification/grille?annee=2025-2026&section=AESI
// Retourne : { semaines: [...], groupes: [...], cellules: { groupeId_semaineId: heures } }
r.get('/grille', authRequired, (req, res) => {
  const { annee, section } = req.query;
  const anneeVal = annee || db.prepare("SELECT code FROM annee_scolaire WHERE active=1").get()?.code || '2025-2026';

  const semaines = db.prepare('SELECT * FROM annee_calendrier WHERE annee_scolaire = ? ORDER BY semaine_num').all(anneeVal);

  let sqlG = `
    SELECT g.*, p.nom AS prof_nom, p.prenom AS prof_prenom,
           u.ue_nom, u.ue_niv, COALESCE(u.ue_quad, g.ue_quad) AS ue_quad,
           at.libelle AS activite_nom,
           c.cours_nom
    FROM groupe g
    LEFT JOIN professeur p ON p.id = g.professeur_id
    LEFT JOIN ue u ON u.ue_num = g.ue_num AND u.annee_scolaire = g.annee_scolaire
    LEFT JOIN activite_type at ON at.id = g.activite_id
    LEFT JOIN cours c ON c.cours_code = g.code_cours AND c.annee_scolaire = g.annee_scolaire
    WHERE g.annee_scolaire = ?`;
  const paramsG = [anneeVal];
  if (section) { sqlG += ' AND g.section = ?'; paramsG.push(section); }
  sqlG += ` ORDER BY g.section,
    CAST(TRIM(COALESCE(u.ue_niv,''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') AS INTEGER),
    COALESCE(u.ue_niv, 'ZZZ'),
    CASE REPLACE(UPPER(COALESCE(u.ue_quad, g.ue_quad, 'Q1/Q2')),' ','') WHEN 'Q1' THEN 1 WHEN 'Q2' THEN 3 ELSE 2 END,
    g.ue_num, g.nom`;
  const groupes = db.prepare(sqlG).all(...paramsG);

  // Récupérer toutes les cellules planifiées pour ces groupes
  const groupeIds = groupes.map(g => g.id);
  let cellules = {};
  if (groupeIds.length > 0) {
    const rows = db.prepare(`
      SELECT p.groupe_id, p.semaine_id, p.valeur
      FROM planification p
      WHERE p.groupe_id IN (${groupeIds.map(() => '?').join(',')})
    `).all(...groupeIds);
    for (const row of rows) {
      cellules[`${row.groupe_id}_${row.semaine_id}`] = row.valeur;
    }
  }

  // Calculs synthèse par groupe
  const ch = getCellHeures();
  function pv(v) { const up = String(v||'').toUpperCase().trim(); return ch[up] !== undefined ? ch[up] : (parseFloat(v)||0); }
  for (const g of groupes) {
    const hPlanif = Object.entries(cellules)
      .filter(([k]) => k.startsWith(`${g.id}_`))
      .reduce((s, [, v]) => s + pv(v), 0);
    g.heures_planifiees = Math.round(hPlanif * 100) / 100;
    g.heures_restantes  = Math.round((g.heures_attribuees - hPlanif) * 100) / 100;
    g.pep_total = Math.round(hPlanif * g.nb_etudiants * 1.2 * 100) / 100;
  }

  res.json({ semaines, groupes, cellules });
});

// Valeurs spéciales — lues depuis la table parametre avec fallback
import { getParamNum } from './parametres.js';

function getCellHeures() {
  return {
    EV1: getParamNum('planning.ev1_heures', 2),
    EV2: getParamNum('planning.ev2_heures', 0),
    VC:  getParamNum('planning.vc_heures',  1),
  };
}
function parseValeur(v) {
  if (!v || v === '' || v === '0') return 0;
  const up = String(v).toUpperCase().trim();
  const ch = getCellHeures();
  if (ch[up] !== undefined) return ch[up];
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function normaliseValeur(v) {
  if (v === null || v === undefined || v === '' || v === 0 || v === '0') return null;
  const up = String(v).toUpperCase().trim();
  const ch = getCellHeures();
  if (ch[up] !== undefined) return up;
  const n = parseFloat(v);
  if (isNaN(n) || n === 0) return null;
  return String(n);
}

// PUT /planification/cellule
r.put('/cellule', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { groupe_id, semaine_id, heures } = req.body;
  if (groupe_id == null || semaine_id == null) return res.status(400).json({ error: 'groupe_id et semaine_id requis' });
  const val = normaliseValeur(heures);
  if (!val) {
    db.prepare('DELETE FROM planification WHERE groupe_id = ? AND semaine_id = ?').run(groupe_id, semaine_id);
  } else {
    db.prepare(`INSERT INTO planification (groupe_id, semaine_id, valeur) VALUES (?,?,?)
      ON CONFLICT(groupe_id, semaine_id) DO UPDATE SET valeur = excluded.valeur`).run(groupe_id, semaine_id, val);
  }
  res.json({ ok: true });
});

// PUT /planification/cellules-bulk
r.put('/cellules-bulk', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { cellules } = req.body;
  if (!Array.isArray(cellules)) return res.status(400).json({ error: 'cellules doit être un tableau' });
  const upsert = db.transaction(() => {
    for (const { groupe_id, semaine_id, heures } of cellules) {
      const val = normaliseValeur(heures);
      if (!val) {
        db.prepare('DELETE FROM planification WHERE groupe_id = ? AND semaine_id = ?').run(groupe_id, semaine_id);
      } else {
        db.prepare(`INSERT INTO planification (groupe_id, semaine_id, valeur) VALUES (?,?,?)
          ON CONFLICT(groupe_id, semaine_id) DO UPDATE SET valeur = excluded.valeur`).run(groupe_id, semaine_id, val);
      }
    }
  });
  upsert();
  res.json({ ok: true });
});

// GET /planification/synthese?annee=
// Synthèse globale : PEP par section, heures planifiées vs attribuées, projection dotation
r.get('/synthese', authRequired, (req, res) => {
  const annee = req.query.annee || db.prepare("SELECT code FROM annee_scolaire WHERE active=1").get()?.code || '2025-2026';

  const sections = db.prepare(`
    SELECT g.section,
           SUM(g.heures_attribuees)                        AS heures_attribuees,
           COALESCE(SUM(p_sum.h), 0)                       AS heures_planifiees,
           COALESCE(SUM(p_sum.h * g.nb_etudiants * 1.2), 0) AS pep_total
    FROM groupe g
    LEFT JOIN (
      SELECT groupe_id, SUM(heures) AS h FROM planification GROUP BY groupe_id
    ) p_sum ON p_sum.groupe_id = g.id
    WHERE g.annee_scolaire = ?
    GROUP BY g.section
    ORDER BY g.section
  `).all(annee);

  res.json({ annee, sections });
});

// ─── IMPORT DEPUIS LES ATTRIBUTIONS ──────────────────────────────────────────

// GET /planification/lignes-ue?annee=&section=&ue= — lignes du planificateur
// construites DIRECTEMENT depuis les attributions (source de vérité, toujours synchrone).
// Une ligne = une attribution IIP avec des périodes (hors EPT/Z).
r.get('/lignes-ue', authRequired, (req, res) => {
  const { annee, section, ue } = req.query;
  if (!annee || !ue) return res.status(400).json({ error: 'annee et ue requis' });

  let sql = `
    SELECT a.id, a.code_cours, a.code AS groupe_code, a.num_groupe,
           a.type_cours, a.periodes_attribuees, a.autonomie_attribuee,
           a.activite_id, at.libelle AS activite_nom,
           COALESCE(c.cours_nom, a.coordination_encadrement) AS cours_nom,
           p.nom AS prof_nom, p.prenom AS prof_prenom,
           a.coordination_encadrement
    FROM attribution a
    LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire AND c.section = a.section
    LEFT JOIN professeur p ON p.id = a.professeur_id
    LEFT JOIN activite_type at ON at.id = a.activite_id
    WHERE a.annee_scolaire = ? AND a.ue_num = ? AND a.contrat_mdp = 'IIP'
      AND (a.coordination_encadrement IS NULL OR a.coordination_encadrement NOT IN ('91','92','93','94','95','96','97','98','99'))
      AND (a.type_cours IS NULL OR a.type_cours != 'Z')`;
  const params = [annee, ue];
  if (section) { sql += ' AND a.section = ?'; params.push(section); }
  sql += ' ORDER BY a.code_cours, a.num_groupe, a.id';

  const rows = db.prepare(sql).all(...params);

  // Heures réelles étudiant du cours (pour info) : periodes / 1.2 ≈ heures contact
  const lignes = rows.map(r => {
    const per = r.periodes_attribuees || 0;
    return {
      attribution_id: r.id,
      code_cours: r.code_cours,
      cours_nom: r.cours_nom || r.code_cours,
      groupe: r.groupe_code || (r.num_groupe ? `G${r.num_groupe}` : 'A'),
      activite: r.activite_nom || r.cours_nom || 'Cours',
      type_cours: r.type_cours,
      periodes: per,
      heures: Math.round((per / 1.2) * 10) / 10,  // périodes prof → heures (×50min)
      autonomie: r.autonomie_attribuee || 0,
      prof: r.prof_nom ? `${r.prof_prenom || ''} ${r.prof_nom}`.trim() : null,
    };
  });

  res.json({ ue_num: Number(ue), lignes });
});

// GET /planification/import-preview?annee=  — aperçu sans écriture
r.get('/import-preview', authRequired, (req, res) => {
  const annee = req.query.annee || db.prepare("SELECT code FROM annee_scolaire WHERE active=1").get()?.code || '2026-2027';
  console.log('[import-preview] annee=', annee, 'query=', req.query);
  const rows = _buildImportGroupes(annee);
  console.log('[import-preview] groupes construits=', rows.length);
  const existants = db.prepare('SELECT COUNT(*) AS n FROM groupe WHERE annee_scolaire = ?').get(annee).n;
  res.json({ annee, existants, groupes: rows });
});

// POST /planification/import-from-attributions — crée les groupes depuis les attributions
r.post('/import-from-attributions', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee, mode = 'skip' } = req.body; // mode: 'skip' = ne pas écraser | 'replace' = tout remplacer
  const anneeVal = annee || db.prepare("SELECT code FROM annee_scolaire WHERE active=1").get()?.code || '2025-2026';

  if (mode === 'replace') {
    db.prepare('DELETE FROM groupe WHERE annee_scolaire = ?').run(anneeVal);
  }

  const groupes = _buildImportGroupes(anneeVal);
  let created = 0, skipped = 0;

  const insert = db.transaction(() => {
    for (const g of groupes) {
      // En mode skip : ne pas écraser un groupe existant (même ue_num + section + nom + code_cours + activite_id)
      if (mode === 'skip') {
        const exists = db.prepare(`
          SELECT id FROM groupe 
          WHERE annee_scolaire=? AND ue_num=? AND section=? AND nom=?
          AND (code_cours IS ? OR code_cours = ?)
          AND (activite_id IS ? OR activite_id = ?)
        `).get(anneeVal, g.ue_num, g.section, g.nom, g.code_cours, g.code_cours, g.activite_id, g.activite_id);
        if (exists) { skipped++; continue; }
      }
      db.prepare(`
        INSERT INTO groupe (annee_scolaire, ue_num, section, nom, nb_etudiants, professeur_id, heures_attribuees, notes, activite_id, code_cours, ue_quad)
        VALUES (?,?,?,?,0,?,?,?,?,?,?)
      `).run(anneeVal, g.ue_num, g.section, g.nom, g.professeur_id, g.heures_attribuees, g.notes, g.activite_id, g.code_cours, g.ue_quad);
      created++;
    }
  });
  insert();

  res.json({ ok: true, created, skipped, total: groupes.length });
});

// Helper : construit la liste des groupes à importer depuis les attributions
function _buildImportGroupes(annee) {
  const attrs = db.prepare(`
    SELECT a.ue_num, a.section, a.num_groupe, a.code, a.code_cours, a.professeur_id,
           a.periodes_attribuees, a.autonomie_attribuee,
           a.activite_id, a.quadrimestre_attribue,
           at.libelle AS activite_nom,
           p.nom AS prof_nom, p.prenom AS prof_prenom,
           u.ue_nom, u.ue_quad
    FROM attribution a
    LEFT JOIN professeur p ON p.id = a.professeur_id
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    LEFT JOIN activite_type at ON at.id = a.activite_id
    WHERE a.annee_scolaire = ?
      AND COALESCE(a.periodes_attribuees, 0) + COALESCE(a.autonomie_attribuee, 0) > 0
    ORDER BY a.section, a.ue_num, a.num_groupe, a.activite_id, a.professeur_id
  `).all(annee);
  console.log('[_buildImportGroupes] annee=', annee, 'attrs=', attrs.length);

  // Regrouper par (ue_num, section, num_groupe, activite_id, code)
  // Si activite_id renseigné → ligne distincte par activité
  // Sinon → regroupement classique par UE/groupe
  const map = new Map();
  for (const a of attrs) {
    const nomGroupe = _numToLettre(a.num_groupe ?? 1);
    // Clé : UE + section + groupe + activité (si renseignée) + code cours
    // Si activite_id renseigné → ligne distincte par activité
    // Sinon → ligne distincte par attribution (id), pour préserver la granularité
    // Clé : UE + section + groupe étudiant + cours + activité
    const activiteKey = a.activite_id ? `act${a.activite_id}` : 'noact';
    const codeCoursKey = a.code_cours || a.code || '';
    const key = `${a.ue_num}__${a.section || ''}__${nomGroupe}__${codeCoursKey}__${activiteKey}`;

    if (!map.has(key)) {
      map.set(key, {
        ue_num:          a.ue_num,
        ue_nom:          a.ue_nom || `UE ${a.ue_num}`,
        section:         a.section,
        nom:             nomGroupe,
        heures_attribuees: 0,
        professeur_id:   null,
        activite_id:     a.activite_id || null,
        activite_nom:    a.activite_nom || null,
        code_cours:      a.code_cours || a.code || null,
        ue_quad:         a.ue_quad || a.quadrimestre_attribue || null,
        profs:           [],
        notes:           null,
      });
    }
    const g = map.get(key);
    const periodes = (a.periodes_attribuees || 0) + (a.autonomie_attribuee || 0);
    g.heures_attribuees += periodes * 50 / 60;
    if (a.professeur_id && !g.profs.includes(a.professeur_id)) {
      g.profs.push(a.professeur_id);
      if (!g.professeur_id) g.professeur_id = a.professeur_id;
    }
  }

  const result = [];
  for (const g of map.values()) {
    g.heures_attribuees = Math.round(g.heures_attribuees * 100) / 100;
    if (g.profs.length > 1) {
      g.notes = `${g.profs.length} profs`;
      g.professeur_id = null;
    }
    delete g.profs;
    result.push(g);
  }

  return result.sort((a, b) =>
    (a.section || '').localeCompare(b.section || '') ||
    a.ue_num - b.ue_num ||
    a.nom.localeCompare(b.nom) ||
    (a.activite_nom || '').localeCompare(b.activite_nom || '')
  );
}

function _numToLettre(n) {
  // 1→A, 2→B, 3→C…  au-delà de 26 : AA, AB…
  if (n <= 26) return String.fromCharCode(64 + n);
  return String.fromCharCode(64 + Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26));
}

export default r;

// POST /planification/reset — réinitialiser la planification d'une section
r.post('/reset', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { annee_scolaire, section, mode } = req.body;
  if (!annee_scolaire || !section) return res.status(400).json({ error: 'annee_scolaire et section requis' });

  const ids = db.prepare('SELECT id FROM groupe WHERE annee_scolaire = ? AND section = ?')
    .all(annee_scolaire, section).map(r => r.id);

  if (!ids.length) return res.json({ ok: true, message: 'Aucun groupe à réinitialiser', cellules: 0, groupes: 0 });

  const ph = ids.map(() => '?').join(',');
  const tx = db.transaction(() => {
    const c = db.prepare(`DELETE FROM planification WHERE groupe_id IN (${ph})`).run(...ids);
    let g = { changes: 0 };
    if (mode === 'tout') {
      g = db.prepare(`DELETE FROM groupe WHERE id IN (${ph})`).run(...ids);
    }
    return { cellules: c.changes, groupes: g.changes };
  });
  const result = tx();
  res.json({ ok: true, ...result });
});

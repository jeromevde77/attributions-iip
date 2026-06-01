/**
 * planification.js — Routes pour la grille horaire annuelle
 * Gestion : calendrier, groupes, planification (heures × semaine)
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

// ─── CALENDRIER ───────────────────────────────────────────────────────────────

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
    SELECT g.*, p.nom AS prof_nom, p.prenom AS prof_prenom, u.ue_nom
    FROM groupe g
    LEFT JOIN professeur p ON p.id = g.professeur_id
    LEFT JOIN ue u ON u.ue_num = g.ue_num AND u.annee_scolaire = g.annee_scolaire
    WHERE g.annee_scolaire = ?`;
  const paramsG = [anneeVal];
  if (section) { sqlG += ' AND g.section = ?'; paramsG.push(section); }
  sqlG += ' ORDER BY g.section, g.ue_num, g.nom';
  const groupes = db.prepare(sqlG).all(...paramsG);

  // Récupérer toutes les cellules planifiées pour ces groupes
  const groupeIds = groupes.map(g => g.id);
  let cellules = {};
  if (groupeIds.length > 0) {
    const rows = db.prepare(`
      SELECT p.groupe_id, p.semaine_id, COALESCE(p.valeur, CAST(p.heures AS TEXT)) AS valeur
      FROM planification p
      WHERE p.groupe_id IN (${groupeIds.map(() => '?').join(',')})
    `).all(...groupeIds);
    for (const row of rows) {
      cellules[`${row.groupe_id}_${row.semaine_id}`] = row.valeur;
    }
  }

  // Calculs synthèse par groupe
  const CELL_H = { EV1: 2, EV2: 0, VC: 1 };
  function pv(v) { const up = String(v||'').toUpperCase().trim(); return CELL_H[up] !== undefined ? CELL_H[up] : (parseFloat(v)||0); }
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

// Valeurs spéciales et heures réelles
const CELL_HEURES = { EV1: 2, EV2: 0, VC: 1 };
function parseValeur(v) {
  if (!v || v === '' || v === '0') return 0;
  const up = String(v).toUpperCase().trim();
  if (CELL_HEURES[up] !== undefined) return CELL_HEURES[up];
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function normaliseValeur(v) {
  if (v === null || v === undefined || v === '' || v === 0 || v === '0') return null;
  const up = String(v).toUpperCase().trim();
  if (CELL_HEURES[up] !== undefined) return up;
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
      // En mode skip : ne pas écraser un groupe existant (même ue_num + section + nom)
      if (mode === 'skip') {
        const exists = db.prepare('SELECT id FROM groupe WHERE annee_scolaire=? AND ue_num=? AND section=? AND nom=?')
          .get(anneeVal, g.ue_num, g.section, g.nom);
        if (exists) { skipped++; continue; }
      }
      db.prepare(`
        INSERT INTO groupe (annee_scolaire, ue_num, section, nom, nb_etudiants, professeur_id, heures_attribuees, notes)
        VALUES (?,?,?,?,0,?,?,?)
      `).run(anneeVal, g.ue_num, g.section, g.nom, g.professeur_id, g.heures_attribuees, g.notes);
      created++;
    }
  });
  insert();

  res.json({ ok: true, created, skipped, total: groupes.length });
});

// Helper : construit la liste des groupes à importer depuis les attributions
function _buildImportGroupes(annee) {
  const attrs = db.prepare(`
    SELECT a.ue_num, a.section, a.num_groupe, a.professeur_id,
           a.periodes_attribuees, a.autonomie_attribuee,
           p.nom AS prof_nom, p.prenom AS prof_prenom,
           u.ue_nom
    FROM attribution a
    LEFT JOIN professeur p ON p.id = a.professeur_id
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    WHERE a.annee_scolaire = ?
      AND COALESCE(a.periodes_attribuees, 0) + COALESCE(a.autonomie_attribuee, 0) > 0
    ORDER BY a.section, a.ue_num, a.num_groupe, a.professeur_id
  `).all(annee);
  console.log('[_buildImportGroupes] annee=', annee, 'attrs=', attrs.length);

  // Regrouper par (ue_num, section, num_groupe)
  const map = new Map();
  for (const a of attrs) {
    const nomGroupe = _numToLettre(a.num_groupe ?? 1);
    const key = `${a.ue_num}__${a.section || ''}__${nomGroupe}`;

    if (!map.has(key)) {
      map.set(key, {
        ue_num: a.ue_num,
        ue_nom: a.ue_nom || `UE ${a.ue_num}`,
        section: a.section,
        nom: nomGroupe,
        heures_attribuees: 0,
        professeur_id: null,   // premier prof trouvé
        profs: [],             // tous les profs du groupe
        notes: null,
      });
    }
    const g = map.get(key);
    // Somme des heures (charge_en_heures = périodes × 50/60, arrondi)
    // On recalcule précisément : total_periodes × 50 / 60
    const periodes = (a.periodes_attribuees || 0) + (a.autonomie_attribuee || 0);
    g.heures_attribuees += periodes * 50 / 60;
    if (a.professeur_id && !g.profs.includes(a.professeur_id)) {
      g.profs.push(a.professeur_id);
      if (!g.professeur_id) g.professeur_id = a.professeur_id; // 1er prof
    }
  }

  // Finaliser : arrondir heures, noter si multi-profs
  const result = [];
  for (const g of map.values()) {
    g.heures_attribuees = Math.round(g.heures_attribuees * 100) / 100;
    if (g.profs.length > 1) {
      g.notes = `${g.profs.length} profs (th. + ex.)`;
      g.professeur_id = null; // ambiguïté → pas de prof principal
    }
    delete g.profs;
    result.push(g);
  }

  return result.sort((a, b) =>
    (a.section || '').localeCompare(b.section || '') ||
    a.ue_num - b.ue_num ||
    a.nom.localeCompare(b.nom)
  );
}

function _numToLettre(n) {
  // 1→A, 2→B, 3→C…  au-delà de 26 : AA, AB…
  if (n <= 26) return String.fromCharCode(64 + n);
  return String.fromCharCode(64 + Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26));
}

export default r;

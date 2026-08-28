// ─────────────────────────────────────────────────────────────────────────────
// Lucie V3++ — Échéancier (Fondation A)
//
// Deux niveaux distincts :
//  · /types  → le RÉFÉRENTIEL des échéances (base légale) : administrateur seul
//  · /       → les INSTANCES de l'année : consultables par tous, marquables
//               « fait » par le responsable ou un administrateur, avec trace.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { anneeActive, instancier, recalculerStatuts, genererRappels }
  from '../services/echeancier.js';

const r = Router();

const SELECT_BASE = `
  SELECT e.id, e.annee_scolaire, e.date_due, e.libelle_override, e.statut,
         e.fait_par, e.fait_le, e.commentaire, e.source_type, e.source_id,
         e.genere_auto, e.responsable_user_id, e.responsable_role,
         t.code, t.libelle, t.description, t.zone, t.categorie,
         t.base_legale, t.lien_interne, t.rappels_defaut,
         u.nom AS responsable_nom
    FROM echeance e
    JOIN echeance_type t ON t.id = e.type_id
    LEFT JOIN utilisateur u ON u.id = e.responsable_user_id
`;

// ── GET /echeancier ─────────────────────────────────────────────────────────
// Filtres : annee, zone, statut, responsable, mien=1, depuis, jusqu_a
r.get('/', authRequired, (req, res) => {
  const annee = req.query.annee || anneeActive(db);
  const { zone, statut, responsable, mien, depuis, jusqu_a } = req.query;

  let sql = SELECT_BASE + ' WHERE e.annee_scolaire = ?';
  const p = [annee];

  if (zone)   { sql += ' AND t.zone = ?';   p.push(zone); }
  if (statut) { sql += ' AND e.statut = ?'; p.push(statut); }
  if (responsable) {
    sql += ' AND (e.responsable_role = ? OR u.nom = ?)';
    p.push(responsable, responsable);
  }
  if (mien === '1') {
    sql += ' AND (e.responsable_user_id = ? OR e.responsable_role = ?)';
    p.push(req.user.id, req.user.role);
  }
  if (depuis)  { sql += ' AND e.date_due >= ?'; p.push(depuis); }
  if (jusqu_a) { sql += ' AND e.date_due <= ?'; p.push(jusqu_a); }

  sql += ' ORDER BY e.date_due, t.zone, t.libelle';

  const lignes = db.prepare(sql).all(...p);

  // Compteurs (sur l'année entière, indépendants des filtres)
  const c = db.prepare(`
    SELECT
      SUM(CASE WHEN statut='en_retard' THEN 1 ELSE 0 END)                        AS en_retard,
      SUM(CASE WHEN statut='a_faire' AND date_due <= date('now','+7 days') THEN 1 ELSE 0 END) AS semaine,
      SUM(CASE WHEN statut='a_faire' AND date_due <= date('now','+30 days') THEN 1 ELSE 0 END) AS mois,
      SUM(CASE WHEN statut='fait' THEN 1 ELSE 0 END)                             AS faites,
      COUNT(*)                                                                   AS total
    FROM echeance WHERE annee_scolaire = ?
  `).get(annee);

  const zones = db.prepare(`
    SELECT t.zone, COUNT(*) n,
           SUM(CASE WHEN e.statut='en_retard' THEN 1 ELSE 0 END) retard
      FROM echeance e JOIN echeance_type t ON t.id = e.type_id
     WHERE e.annee_scolaire = ? GROUP BY t.zone
  `).all(annee);

  const responsables = db.prepare(`
    SELECT COALESCE(u.nom, e.responsable_role) AS nom, COUNT(*) n,
           SUM(CASE WHEN e.statut='en_retard' THEN 1 ELSE 0 END) retard
      FROM echeance e LEFT JOIN utilisateur u ON u.id = e.responsable_user_id
     WHERE e.annee_scolaire = ? AND COALESCE(u.nom, e.responsable_role) IS NOT NULL
     GROUP BY nom ORDER BY n DESC
  `).all(annee);

  res.json({ annee, compteurs: c, zones, responsables, lignes });
});

// ── PATCH /echeancier/:id ───────────────────────────────────────────────────
// Marquer fait / à faire / sans objet, ou ajuster date et responsable.
r.patch('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const ech = db.prepare('SELECT * FROM echeance WHERE id = ?').get(id);
  if (!ech) return res.status(404).json({ error: 'échéance introuvable' });

  const estResponsable =
    ech.responsable_user_id === req.user.id ||
    (ech.responsable_role && ech.responsable_role === req.user.role);
  const estAdmin = req.user.role === 'admin';
  if (!estResponsable && !estAdmin && req.user.role !== 'editeur') {
    return res.status(403).json({ error: 'seul le responsable ou un administrateur peut modifier cette échéance' });
  }

  const { statut, commentaire, date_due, responsable_user_id } = req.body;
  const champs = [], vals = [];

  if (statut) {
    if (!['a_faire', 'fait', 'annule', 'sans_objet', 'en_retard'].includes(statut)) {
      return res.status(400).json({ error: 'statut invalide' });
    }
    champs.push('statut = ?'); vals.push(statut);
    if (statut === 'fait') {
      champs.push('fait_par = ?', "fait_le = datetime('now')");
      vals.push(req.user.nom || req.user.email || `#${req.user.id}`);
    } else {
      champs.push('fait_par = NULL', 'fait_le = NULL');
    }
  }
  if (commentaire !== undefined) { champs.push('commentaire = ?'); vals.push(commentaire || null); }
  if (date_due) { champs.push('date_due = ?'); vals.push(date_due); }
  if (responsable_user_id !== undefined) {
    champs.push('responsable_user_id = ?'); vals.push(responsable_user_id || null);
  }
  if (!champs.length) return res.status(400).json({ error: 'rien à modifier' });

  vals.push(id);
  db.prepare(`UPDATE echeance SET ${champs.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare(SELECT_BASE + ' WHERE e.id = ?').get(id));
});

// ── POST /echeancier ────────────────────────────────────────────────────────
// Échéance ponctuelle ajoutée à la main (type 'manuelle' ou type existant).
r.post('/', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { type_id, code, annee_scolaire, date_due, libelle, responsable_role,
          responsable_user_id, commentaire } = req.body;
  if (!date_due) return res.status(400).json({ error: 'date_due requise' });

  let tid = type_id;
  if (!tid && code) {
    tid = db.prepare('SELECT id FROM echeance_type WHERE code = ?').get(code)?.id;
  }
  if (!tid) return res.status(400).json({ error: 'type d\'échéance requis' });

  const annee = annee_scolaire || anneeActive(db);
  try {
    const info = db.prepare(`
      INSERT INTO echeance (type_id, annee_scolaire, date_due, libelle_override,
                            responsable_role, responsable_user_id, commentaire,
                            statut, genere_auto)
      VALUES (?,?,?,?,?,?,?, 'a_faire', 0)
    `).run(tid, annee, date_due, libelle || null, responsable_role || null,
           responsable_user_id || null, commentaire || null);
    res.json(db.prepare(SELECT_BASE + ' WHERE e.id = ?').get(Number(info.lastInsertRowid)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'cette échéance existe déjà' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /echeancier/:id ──────────────────────────────────────────────────
r.delete('/:id', authRequired, roleRequired('admin'), (req, res) => {
  const ech = db.prepare('SELECT genere_auto FROM echeance WHERE id = ?').get(Number(req.params.id));
  if (!ech) return res.status(404).json({ error: 'échéance introuvable' });
  db.prepare('DELETE FROM echeance WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true, avertissement: ech.genere_auto
    ? "Échéance générée automatiquement : elle sera recréée à la prochaine instanciation. Préférez le statut « sans objet »."
    : null });
});

// ── POST /echeancier/instancier ─────────────────────────────────────────────
r.post('/instancier', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee || anneeActive(db);
  try {
    const stats = instancier(db, annee);
    const statuts = recalculerStatuts(db);
    const rappels = genererRappels(db);
    res.json({ ok: true, annee, ...stats, ...statuts, ...rappels });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ RÉFÉRENTIEL DES TYPES — administrateur seul ═══════════════════════════

r.get('/types', authRequired, (req, res) => {
  const types = db.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM echeance e WHERE e.type_id = t.id) AS nb_instances
      FROM echeance_type t ORDER BY t.zone, t.libelle
  `).all();
  res.json(types);
});

r.post('/types', authRequired, roleRequired('admin'), (req, res) => {
  const { code, libelle, description, zone, categorie, regle_date,
          responsable_defaut, rappels_defaut, base_legale, lien_interne } = req.body;
  if (!code || !libelle || !regle_date) {
    return res.status(400).json({ error: 'code, libelle et regle_date requis' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO echeance_type (code, libelle, description, zone, categorie,
        regle_date, responsable_defaut, rappels_defaut, base_legale, lien_interne)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(code, libelle, description || null, zone || null, categorie || null,
           regle_date, responsable_defaut || null, rappels_defaut || '[30,7,1]',
           base_legale || null, lien_interne || null);
    res.json(db.prepare('SELECT * FROM echeance_type WHERE id = ?').get(Number(info.lastInsertRowid)));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'ce code existe déjà' });
    }
    res.status(500).json({ error: e.message });
  }
});

r.patch('/types/:id', authRequired, roleRequired('admin'), (req, res) => {
  const id = Number(req.params.id);
  const permis = ['libelle', 'description', 'zone', 'categorie', 'regle_date',
                  'responsable_defaut', 'rappels_defaut', 'base_legale',
                  'lien_interne', 'filtre_source', 'actif'];
  const champs = [], vals = [];
  for (const k of permis) {
    if (req.body[k] !== undefined) { champs.push(`${k} = ?`); vals.push(req.body[k]); }
  }
  if (!champs.length) return res.status(400).json({ error: 'rien à modifier' });
  vals.push(id);
  db.prepare(`UPDATE echeance_type SET ${champs.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM echeance_type WHERE id = ?').get(id));
});

export default r;

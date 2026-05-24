import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';

const r = Router();

r.get('/sections', authRequired, (req, res) => {
  const allowed = getUserSections(req.user);
  let rows = db.prepare('SELECT * FROM section ORDER BY code').all();
  if (allowed !== null) rows = rows.filter(s => allowed.includes(s.code));
  res.json(rows);
});

r.get('/ue', authRequired, (req, res) => {
  const { section, annee } = req.query;
  const anneeVal = annee || '2025-2026';
  let sql = 'SELECT * FROM ue WHERE annee_scolaire = ?';
  const params = [anneeVal];
  if (section) { sql += ' AND section = ?'; params.push(section); }
  sql += ' ORDER BY ue_num';
  res.json(db.prepare(sql).all(...params));
});

r.get('/ue/:num', authRequired, (req, res) => {
  const anneeVal = req.query.annee || '2025-2026';
  const ue = db.prepare('SELECT * FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(req.params.num, anneeVal);
  if (!ue) return res.status(404).json({ error: 'UE introuvable' });
  const cours = db.prepare('SELECT * FROM cours WHERE ue_num = ? AND annee_scolaire = ?').all(req.params.num, anneeVal);
  res.json({ ...ue, cours });
});

r.get('/cours', authRequired, (req, res) => {
  const { ue_num, section, annee } = req.query;
  const anneeVal = annee || '2025-2026';
  let sql = 'SELECT * FROM cours WHERE annee_scolaire = ?';
  const params = [anneeVal];
  if (ue_num)  { sql += ' AND ue_num = ?'; params.push(ue_num); }
  if (section) { sql += ' AND section = ?'; params.push(section); }
  sql += ' ORDER BY cours_code';
  res.json(db.prepare(sql).all(...params));
});

// ─── Structure complète (Section → UE → Cours) pour le module Référentiels ───
r.get('/structure', authRequired, (req, res) => {
  const annee = req.query.annee || '2025-2026';
  const ues = db.prepare('SELECT * FROM ue WHERE annee_scolaire = ? ORDER BY section, ue_num').all(annee);
  const cours = db.prepare('SELECT * FROM cours WHERE annee_scolaire = ? ORDER BY cours_code').all(annee);
  // Compter les attributions par UE et par cours (pour bloquer les suppressions)
  const attrParUe = db.prepare('SELECT ue_num, COUNT(*) AS n FROM attribution WHERE annee_scolaire = ? GROUP BY ue_num').all(annee);
  const attrParCours = db.prepare('SELECT code_cours, COUNT(*) AS n FROM attribution WHERE annee_scolaire = ? GROUP BY code_cours').all(annee);
  const ueAttrMap = Object.fromEntries(attrParUe.map(r => [r.ue_num, r.n]));
  const coursAttrMap = Object.fromEntries(attrParCours.map(r => [r.code_cours, r.n]));

  const coursParUe = {};
  for (const c of cours) {
    (coursParUe[c.ue_num] ||= []).push({ ...c, nb_attributions: coursAttrMap[c.cours_code] || 0 });
  }
  // Grouper par section
  const sections = {};
  for (const ue of ues) {
    const sec = ue.section || '(sans section)';
    (sections[sec] ||= []).push({
      ...ue,
      nb_attributions: ueAttrMap[ue.ue_num] || 0,
      cours: coursParUe[ue.ue_num] || []
    });
  }
  res.json(Object.entries(sections).map(([section, ues]) => ({ section, ues })));
});

// ─── CRUD UE ───
r.post('/ue', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || '2025-2026';
  const { ue_num, ue_nom, section, ue_niv, ue_niveau, ue_quad, ue_per_cours, ue_aut,
          ue_code_fwb, et_ref, ue_tc, ue_det, ue_per_etudiants, ue_tot_prf, ects, ue_prerequise } = req.body;
  if (!ue_num || !ue_nom) return res.status(400).json({ error: 'Numéro et nom d\'UE requis' });
  const exists = db.prepare('SELECT 1 FROM ue WHERE ue_num = ? AND annee_scolaire = ?').get(ue_num, annee);
  if (exists) return res.status(409).json({ error: `L'UE ${ue_num} existe déjà pour ${annee}` });
  db.prepare(`
    INSERT INTO ue (ue_num, annee_scolaire, ue_nom, section, ue_niv, ue_niveau, ue_quad,
      ue_per_cours, ue_aut, ue_code_fwb, et_ref, ue_tc, ue_det, ue_per_etudiants, ue_tot_prf, ects, ue_prerequise)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(ue_num, annee, ue_nom, section || null, ue_niv || null, ue_niveau || null,
         ue_quad || null, ue_per_cours || null, ue_aut || null, ue_code_fwb || null, et_ref || null,
         ue_tc || null, ue_det || null, ue_per_etudiants || null, ue_tot_prf || null, ects || null, ue_prerequise || null);
  res.status(201).json({ ok: true });
});

r.patch('/ue/:num', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || req.query.annee || '2025-2026';
  const allowed = ['ue_nom','section','ue_niv','ue_niveau','ue_quad','ue_per_cours','ue_aut',
                   'ue_code_fwb','et_ref','ects','ue_tc','ue_det','ue_per_etudiants','ue_tot_prf','ue_prerequise'];
  const updates = []; const params = { num: req.params.num, annee };
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  const result = db.prepare(`UPDATE ue SET ${updates.join(', ')} WHERE ue_num = @num AND annee_scolaire = @annee`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'UE introuvable' });
  res.json({ ok: true });
});

r.delete('/ue/:num', authRequired, roleRequired('admin'), (req, res) => {
  const annee = req.query.annee || '2025-2026';
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE ue_num = ? AND annee_scolaire = ?').get(req.params.num, annee).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) sur cette UE. Supprimez-les d'abord.` });
  db.prepare('DELETE FROM cours WHERE ue_num = ? AND annee_scolaire = ?').run(req.params.num, annee);
  db.prepare('DELETE FROM ue WHERE ue_num = ? AND annee_scolaire = ?').run(req.params.num, annee);
  res.json({ ok: true });
});

// ─── CRUD Cours ───
r.post('/cours', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || '2025-2026';
  const { cours_code, cours_nom, ue_num, section, ct_pp, cours_per, quadrimestre_cours, ue_niveau,
          cours_num, cours_total, ue_autonomie, ue_per_total, enc_cours, heures } = req.body;
  if (!cours_code || !cours_nom) return res.status(400).json({ error: 'Code et nom de cours requis' });
  const exists = db.prepare('SELECT 1 FROM cours WHERE cours_code = ? AND annee_scolaire = ?').get(cours_code, annee);
  if (exists) return res.status(409).json({ error: `Le cours ${cours_code} existe déjà pour ${annee}` });
  db.prepare(`
    INSERT INTO cours (cours_code, annee_scolaire, cours_nom, ue_num, section, ct_pp, cours_per,
      quadrimestre_cours, ue_niveau, cours_num, cours_total, ue_autonomie, ue_per_total, enc_cours, heures)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(cours_code, annee, cours_nom, ue_num || null, section || null, ct_pp || null,
         cours_per || null, quadrimestre_cours || null, ue_niveau || null,
         cours_num || null, cours_total || null, ue_autonomie || null, ue_per_total || null,
         enc_cours || null, heures || null);
  res.status(201).json({ ok: true });
});

r.patch('/cours/:code', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const annee = req.body.annee_scolaire || req.query.annee || '2025-2026';
  const allowed = ['cours_nom','ue_num','section','ct_pp','cours_per','quadrimestre_cours','ue_niveau',
                   'cours_num','cours_total','ue_autonomie','ue_per_total','enc_cours','heures'];
  const updates = []; const params = { code: req.params.code, annee };
  for (const k of allowed) if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  const result = db.prepare(`UPDATE cours SET ${updates.join(', ')} WHERE cours_code = @code AND annee_scolaire = @annee`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Cours introuvable' });
  res.json({ ok: true });
});

r.delete('/cours/:code', authRequired, roleRequired('admin'), (req, res) => {
  const annee = req.query.annee || '2025-2026';
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE code_cours = ? AND annee_scolaire = ?').get(req.params.code, annee).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) sur ce cours. Supprimez-les d'abord.` });
  db.prepare('DELETE FROM cours WHERE cours_code = ? AND annee_scolaire = ?').run(req.params.code, annee);
  res.json({ ok: true });
});

// ─── CRUD Section ───
r.post('/sections', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { code, libelle } = req.body;
  if (!code) return res.status(400).json({ error: 'Code de section requis' });
  const exists = db.prepare('SELECT 1 FROM section WHERE code = ?').get(code);
  if (exists) return res.status(409).json({ error: 'Cette section existe déjà' });
  db.prepare('INSERT INTO section (code, libelle) VALUES (?, ?)').run(code, libelle || code);
  res.status(201).json({ ok: true });
});

r.patch('/sections/:code', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const result = db.prepare('UPDATE section SET libelle = ? WHERE code = ?').run(req.body.libelle, req.params.code);
  if (result.changes === 0) return res.status(404).json({ error: 'Section introuvable' });
  res.json({ ok: true });
});

r.delete('/sections/:code', authRequired, roleRequired('admin'), (req, res) => {
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE section = ?').get(req.params.code).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) dans cette section.` });
  db.prepare('DELETE FROM section WHERE code = ?').run(req.params.code);
  res.json({ ok: true });
});

/**
 * Pour la création en masse d'attributions :
 * retourne pour une section, toutes les UE avec leurs cours et le statut
 * "déjà couvert" (= au moins une attribution existe pour ce cours dans cette section).
 */
r.get('/sections/:section/ue-cours', authRequired, (req, res) => {
  const { section } = req.params;
  const annee = req.query.annee || '2025-2026';
  const ues = db.prepare(`
    SELECT DISTINCT u.ue_num, u.ue_nom, u.ue_niv AS bloc
    FROM cours c
    LEFT JOIN ue u ON u.ue_num = c.ue_num AND u.annee_scolaire = c.annee_scolaire
    WHERE c.section = ? AND c.annee_scolaire = ?
    ORDER BY u.ue_niv, u.ue_num
  `).all(section, annee);

  const cours = db.prepare(`
    SELECT c.cours_code, c.cours_nom, c.ue_num, c.ct_pp AS type_cours,
           c.quadrimestre_cours, c.cours_per,
           (SELECT COUNT(*) FROM attribution a
            WHERE a.section = ? AND a.code_cours = c.cours_code AND a.annee_scolaire = ?) AS nb_attributions
    FROM cours c
    WHERE c.section = ? AND c.annee_scolaire = ?
    ORDER BY c.cours_code
  `).all(section, annee, section, annee);

  // Grouper les cours par UE
  const byUE = {};
  for (const c of cours) {
    if (!byUE[c.ue_num]) byUE[c.ue_num] = [];
    byUE[c.ue_num].push(c);
  }
  for (const u of ues) {
    u.cours = byUE[u.ue_num] || [];
    u.cours_total = u.cours.length;
    u.cours_couverts = u.cours.filter(c => c.nb_attributions > 0).length;
    u.cours_manquants = u.cours_total - u.cours_couverts;
  }
  res.json(ues);
});

r.get('/professeurs', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM v_professeur_total ORDER BY nom, prenom').all());
});

r.get('/professeurs/:id', authRequired, (req, res) => {
  const p = db.prepare('SELECT * FROM v_professeur_total WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Professeur introuvable' });
  const attrs = db.prepare(`
    SELECT * FROM v_attribution_complete
    WHERE professeur_id = ? ORDER BY section, ue_num
  `).all(req.params.id);
  res.json({ ...p, attributions: attrs });
});

// Créer un nouveau professeur
r.post('/professeurs', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { nom, prenom, adresse_mail, mail_prive, statut, adresse_rue, code_postal,
          commune, capaes, anciennete_25_26_po } = req.body;
  if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom requis' });
  try {
    const result = db.prepare(`
      INSERT INTO professeur (nom, prenom, adresse_mail, mail_prive, statut,
        adresse_rue, code_postal, commune, capaes, anciennete_25_26_po)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(nom.trim(), prenom.trim(), adresse_mail||null, mail_prive||null,
           statut||null, adresse_rue||null, code_postal||null, commune||null,
           capaes||null, anciennete_25_26_po||0);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ce professeur existe déjà' });
    throw e;
  }
});

// Modifier un professeur
r.patch('/professeurs/:id', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const allowed = ['nom','prenom','adresse_mail','mail_prive','statut',
                   'adresse_rue','code_postal','commune','capaes','anciennete_25_26_po'];
  const updates = [];
  const params = { id: req.params.id };
  for (const k of allowed) {
    if (k in req.body) { updates.push(`${k} = @${k}`); params[k] = req.body[k]; }
  }
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
  const result = db.prepare(`UPDATE professeur SET ${updates.join(', ')} WHERE id = @id`).run(params);
  if (result.changes === 0) return res.status(404).json({ error: 'Professeur introuvable' });
  res.json({ ok: true });
});

// Supprimer un professeur (seulement si aucune attribution active)
r.delete('/professeurs/:id', authRequired, roleRequired('admin'), (req, res) => {
  const nb = db.prepare('SELECT COUNT(*) AS n FROM attribution WHERE professeur_id = ?').get(req.params.id).n;
  if (nb > 0) return res.status(409).json({ error: `Impossible : ${nb} attribution(s) référencent ce professeur` });
  const result = db.prepare('DELETE FROM professeur WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Professeur introuvable' });
  res.json({ ok: true });
});

r.get('/locaux', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM local ORDER BY nom').all());
});

r.get('/parametres', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM parametre_financier').all());
});

r.get('/types-encadrement', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM type_encadrement').all());
});

r.get('/activites', authRequired, (req, res) => {
  res.json(db.prepare('SELECT * FROM activite_type ORDER BY ordre, libelle').all());
});

export default r;

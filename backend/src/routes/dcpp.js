/**
 * dcpp.js — Routes du module Développement des Compétences Professionnelles (DCPP)
 * Toutes les routes nécessitent authRequired.
 * Seul un admin peut accéder au DCPP d'un autre professeur.
 * Un professeur (rôle editeur/coordination) ne voit que son propre profil (via professeur_id sur le token).
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';

const r = Router();
r.use(authRequired);

// ── Helper : vérifie que l'utilisateur courant a le droit d'accéder au profId demandé
function checkAccess(req, res, profId) {
  const u = req.user;
  if (u.role === 'admin' || u.role === 'editeur' || u.role === 'coordination') return true;
  // Rôle consultation ou prof self-service : seulement son propre profil
  if (u.professeur_id && Number(u.professeur_id) === Number(profId)) return true;
  res.status(403).json({ error: 'Accès refusé' });
  return false;
}

// ── GET /api/dcpp/referentiel — critères + libellés complets
r.get('/referentiel', (req, res) => {
  const axes    = db.prepare('SELECT * FROM dc_axe ORDER BY id').all();
  const themes  = db.prepare('SELECT * FROM dc_theme ORDER BY id').all();
  const criteres = db.prepare('SELECT * FROM dc_critere ORDER BY ordre').all();
  const libelles = db.prepare('SELECT * FROM dc_critere_libelle').all();
  res.json({ axes, themes, criteres, libelles });
});

// ── GET /api/dcpp/prof/:profId/seances — liste des séances d'un professeur
r.get('/prof/:profId/seances', (req, res) => {
  const profId = Number(req.params.profId);
  if (!checkAccess(req, res, profId)) return;
  const { annee } = req.query;
  let sql = 'SELECT * FROM dc_seance WHERE professeur_id = ?';
  const args = [profId];
  if (annee) { sql += ' AND annee_scolaire = ?'; args.push(annee); }
  sql += ' ORDER BY date_seance DESC, created_at DESC';
  res.json(db.prepare(sql).all(...args));
});

// ── POST /api/dcpp/prof/:profId/seances — créer une séance
r.post('/prof/:profId/seances', (req, res) => {
  const profId = Number(req.params.profId);
  if (!checkAccess(req, res, profId)) return;
  const { dispositif, annee_scolaire, date_seance, ue_num, cours_nom, type_cours,
          observateur_id, rencontre_num, notes } = req.body;
  if (!dispositif || !annee_scolaire) return res.status(400).json({ error: 'dispositif et annee_scolaire requis' });
  const row = db.prepare(`
    INSERT INTO dc_seance (professeur_id, dispositif, annee_scolaire, date_seance, ue_num, cours_nom,
      type_cours, observateur_id, rencontre_num, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(profId, dispositif, annee_scolaire, date_seance || null, ue_num || null,
         cours_nom || null, type_cours || null, observateur_id || null,
         rencontre_num || 1, notes || null);
  res.json({ id: row.lastInsertRowid });
});

// ── GET /api/dcpp/seances/:id — détail d'une séance avec ses réponses
r.get('/seances/:id', (req, res) => {
  const seance = db.prepare('SELECT * FROM dc_seance WHERE id = ?').get(req.params.id);
  if (!seance) return res.status(404).json({ error: 'Séance introuvable' });
  if (!checkAccess(req, res, seance.professeur_id)) return;
  const reponses = db.prepare('SELECT * FROM dc_reponse WHERE seance_id = ?').all(seance.id);
  res.json({ ...seance, reponses });
});

// ── PATCH /api/dcpp/seances/:id — mettre à jour une séance
r.patch('/seances/:id', (req, res) => {
  const seance = db.prepare('SELECT * FROM dc_seance WHERE id = ?').get(req.params.id);
  if (!seance) return res.status(404).json({ error: 'Séance introuvable' });
  if (!checkAccess(req, res, seance.professeur_id)) return;
  const allowed = ['date_seance','ue_num','cours_nom','type_cours','statut','rencontre_num','notes','observateur_id'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (fields.length === 0) return res.status(400).json({ error: 'Aucun champ valide' });
  const set = fields.map(f => `${f} = ?`).join(', ');
  db.prepare(`UPDATE dc_seance SET ${set} WHERE id = ?`).run(...fields.map(f => req.body[f]), seance.id);
  res.json({ ok: true });
});

// ── DELETE /api/dcpp/seances/:id
r.delete('/seances/:id', (req, res) => {
  const seance = db.prepare('SELECT * FROM dc_seance WHERE id = ?').get(req.params.id);
  if (!seance) return res.status(404).json({ error: 'Séance introuvable' });
  if (!checkAccess(req, res, seance.professeur_id)) return;
  db.prepare('DELETE FROM dc_seance WHERE id = ?').run(seance.id);
  res.json({ ok: true });
});

// ── PUT /api/dcpp/seances/:id/reponses — sauvegarder toutes les réponses d'une séance (upsert)
r.put('/seances/:id/reponses', (req, res) => {
  const seance = db.prepare('SELECT * FROM dc_seance WHERE id = ?').get(req.params.id);
  if (!seance) return res.status(404).json({ error: 'Séance introuvable' });
  if (!checkAccess(req, res, seance.professeur_id)) return;
  const { reponses } = req.body; // array of { critere_id, reponse_txt?, score_avant?, score_apres? }
  if (!Array.isArray(reponses)) return res.status(400).json({ error: 'reponses doit être un tableau' });
  const upsert = db.prepare(`
    INSERT INTO dc_reponse (seance_id, critere_id, reponse_txt, score_avant, score_apres)
    VALUES (?,?,?,?,?)
    ON CONFLICT(seance_id, critere_id) DO UPDATE SET
      reponse_txt = excluded.reponse_txt,
      score_avant = excluded.score_avant,
      score_apres = excluded.score_apres
  `);
  const tx = db.transaction(() => {
    for (const rp of reponses) {
      upsert.run(seance.id, rp.critere_id,
        rp.reponse_txt ?? null, rp.score_avant ?? null, rp.score_apres ?? null);
    }
  });
  tx();
  res.json({ ok: true });
});

// ── GET /api/dcpp/prof/:profId/objectifs
r.get('/prof/:profId/objectifs', (req, res) => {
  const profId = Number(req.params.profId);
  if (!checkAccess(req, res, profId)) return;
  const { annee } = req.query;
  let sql = 'SELECT * FROM dc_objectif WHERE professeur_id = ?';
  const args = [profId];
  if (annee) { sql += ' AND annee_scolaire = ?'; args.push(annee); }
  sql += ' ORDER BY annee_scolaire DESC, numero ASC';
  const rows = db.prepare(sql).all(...args);
  // Désérialiser indicateurs JSON
  res.json(rows.map(o => ({ ...o, indicateurs: o.indicateurs ? JSON.parse(o.indicateurs) : [] })));
});

// ── POST /api/dcpp/prof/:profId/objectifs
r.post('/prof/:profId/objectifs', (req, res) => {
  const profId = Number(req.params.profId);
  if (!checkAccess(req, res, profId)) return;
  const { annee_scolaire, numero, critere_id, libelle, indicateurs, echeance } = req.body;
  if (!annee_scolaire || !numero || !libelle) return res.status(400).json({ error: 'annee_scolaire, numero et libelle requis' });
  // Vérifier max 4
  const count = db.prepare('SELECT COUNT(*) as n FROM dc_objectif WHERE professeur_id=? AND annee_scolaire=?').get(profId, annee_scolaire);
  if (count.n >= 4) return res.status(400).json({ error: 'Maximum 4 objectifs par année' });
  const row = db.prepare(`
    INSERT INTO dc_objectif (professeur_id, annee_scolaire, numero, critere_id, libelle, indicateurs, echeance)
    VALUES (?,?,?,?,?,?,?)
  `).run(profId, annee_scolaire, numero, critere_id || null, libelle,
         indicateurs ? JSON.stringify(indicateurs) : null, echeance || null);
  res.json({ id: row.lastInsertRowid });
});

// ── PATCH /api/dcpp/objectifs/:id
r.patch('/objectifs/:id', (req, res) => {
  const obj = db.prepare('SELECT * FROM dc_objectif WHERE id = ?').get(req.params.id);
  if (!obj) return res.status(404).json({ error: 'Objectif introuvable' });
  if (!checkAccess(req, res, obj.professeur_id)) return;
  const allowed = ['libelle','indicateurs','echeance','statut','note_suivi','note_cloture','date_entretien','critere_id'];
  const fields = Object.keys(req.body).filter(k => allowed.includes(k));
  if (fields.length === 0) return res.status(400).json({ error: 'Aucun champ valide' });
  const values = fields.map(f => f === 'indicateurs' ? JSON.stringify(req.body[f]) : req.body[f]);
  const set = fields.map(f => `${f} = ?`).join(', ');
  db.prepare(`UPDATE dc_objectif SET ${set} WHERE id = ?`).run(...values, obj.id);
  res.json({ ok: true });
});

// ── DELETE /api/dcpp/objectifs/:id
r.delete('/objectifs/:id', (req, res) => {
  const obj = db.prepare('SELECT * FROM dc_objectif WHERE id = ?').get(req.params.id);
  if (!obj) return res.status(404).json({ error: 'Objectif introuvable' });
  if (!checkAccess(req, res, obj.professeur_id)) return;
  db.prepare('DELETE FROM dc_objectif WHERE id = ?').run(obj.id);
  res.json({ ok: true });
});

// ── GET /api/dcpp/prof/:profId/tableau-de-bord — données agrégées
r.get('/prof/:profId/tableau-de-bord', (req, res) => {
  const profId = Number(req.params.profId);
  if (!checkAccess(req, res, profId)) return;
  const { annee } = req.query;

  const seances = db.prepare(`
    SELECT dispositif, statut, COUNT(*) as n
    FROM dc_seance WHERE professeur_id = ? ${annee ? 'AND annee_scolaire = ?' : ''}
    GROUP BY dispositif, statut
  `).all(...(annee ? [profId, annee] : [profId]));

  const objectifs = db.prepare(`
    SELECT statut, COUNT(*) as n
    FROM dc_objectif WHERE professeur_id = ? ${annee ? 'AND annee_scolaire = ?' : ''}
    GROUP BY statut
  `).all(...(annee ? [profId, annee] : [profId]));

  // Dernière séance par dispositif
  const dernieres = db.prepare(`
    SELECT dispositif, MAX(date_seance) as derniere_date
    FROM dc_seance WHERE professeur_id = ? ${annee ? 'AND annee_scolaire = ?' : ''}
    GROUP BY dispositif
  `).all(...(annee ? [profId, annee] : [profId]));

  res.json({ seances, objectifs, dernieres });
});

export default r;

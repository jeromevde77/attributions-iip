import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

const r = Router();

const MOTIFS_FIN = ['fin_cdd','demission','licenciement','retraite','mutation','autre'];
const ETAPES_DISCIPLINAIRE = ['ouverture','convocation','audition','decision','appel','cloture'];

// ── GET /api/dossiers-rh/:profId ──────────────────────────────────────────────
r.get('/:profId', authRequired, roleRequired('admin'), (req, res) => {
  const dossiers = db.prepare(`
    SELECT d.*, u.nom_complet as createur_nom
    FROM dossier_rh d
    LEFT JOIN utilisateur u ON u.email = d.cree_par
    WHERE d.professeur_id = ?
    ORDER BY d.date_ouverture DESC
  `).all(req.params.profId);

  for (const d of dossiers) {
    d.etapes = db.prepare(`
      SELECT * FROM dossier_rh_etape WHERE dossier_id = ? ORDER BY date_etape, cree_le
    `).all(d.id);
  }
  res.json(dossiers);
});

// ── POST /api/dossiers-rh/:profId ─────────────────────────────────────────────
r.post('/:profId', authRequired, roleRequired('admin'), (req, res) => {
  const { type, motif, notes, date_ouverture } = req.body || {};
  if (!['fin_contrat','disciplinaire'].includes(type))
    return res.status(400).json({ error: 'Type invalide' });

  const result = db.prepare(`
    INSERT INTO dossier_rh (professeur_id, type, motif, notes, date_ouverture, cree_par)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.params.profId, type, motif || null, notes || null,
      date_ouverture || new Date().toISOString().split('T')[0],
      req.user?.email || null);

  // Si fin de contrat → marquer le prof comme inactif (statut EXP)
  if (type === 'fin_contrat') {
    db.prepare("UPDATE professeur SET statut = 'EXP' WHERE id = ?").run(req.params.profId);
  }

  res.status(201).json({ id: result.lastInsertRowid });
});

// ── PATCH /api/dossiers-rh/dossier/:id ───────────────────────────────────────
r.patch('/dossier/:id', authRequired, roleRequired('admin'), (req, res) => {
  const { motif, notes, statut, date_cloture } = req.body || {};
  const d = db.prepare('SELECT * FROM dossier_rh WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dossier introuvable' });

  db.prepare(`
    UPDATE dossier_rh SET
      motif = COALESCE(?, motif),
      notes = COALESCE(?, notes),
      statut = COALESCE(?, statut),
      date_cloture = COALESCE(?, date_cloture),
      modifie_le = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(motif ?? null, notes ?? null, statut ?? null, date_cloture ?? null, req.params.id);

  res.json({ ok: true });
});

// ── DELETE /api/dossiers-rh/dossier/:id ──────────────────────────────────────
r.delete('/dossier/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM dossier_rh WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── POST /api/dossiers-rh/dossier/:id/etapes ─────────────────────────────────
r.post('/dossier/:id/etapes', authRequired, roleRequired('admin'), (req, res) => {
  const { type_etape, date_etape, auteur, notes, document_url } = req.body || {};
  if (!type_etape) return res.status(400).json({ error: 'type_etape requis' });

  const result = db.prepare(`
    INSERT INTO dossier_rh_etape (dossier_id, type_etape, date_etape, auteur, notes, document_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.params.id, type_etape,
      date_etape || new Date().toISOString().split('T')[0],
      auteur || null, notes || null, document_url || null);

  // Si étape = clôture → fermer le dossier
  if (type_etape === 'cloture') {
    db.prepare("UPDATE dossier_rh SET statut = 'clos', date_cloture = ? WHERE id = ?")
      .run(date_etape || new Date().toISOString().split('T')[0], req.params.id);
  }

  res.status(201).json({ id: result.lastInsertRowid });
});

// ── PATCH /api/dossiers-rh/etape/:id ─────────────────────────────────────────
r.patch('/etape/:id', authRequired, roleRequired('admin'), (req, res) => {
  const { date_etape, auteur, notes, document_url } = req.body || {};
  db.prepare(`
    UPDATE dossier_rh_etape SET
      date_etape   = COALESCE(?, date_etape),
      auteur       = COALESCE(?, auteur),
      notes        = COALESCE(?, notes),
      document_url = COALESCE(?, document_url)
    WHERE id = ?
  `).run(date_etape ?? null, auteur ?? null, notes ?? null, document_url ?? null, req.params.id);
  res.json({ ok: true });
});

// ── DELETE /api/dossiers-rh/etape/:id ────────────────────────────────────────
r.delete('/etape/:id', authRequired, roleRequired('admin'), (req, res) => {
  db.prepare('DELETE FROM dossier_rh_etape WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default r;

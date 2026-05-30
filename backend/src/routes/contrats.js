import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { genererContrat } from '../services/contrat_fill.js';

const r = Router();

// ── Génération d'un contrat ────────────────────────────────────────────────
r.post('/generer', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  const { prof_id, date_contrat, representant } = req.body;
  if (!prof_id) return res.status(400).json({ error: 'prof_id requis' });

  const prof = db.prepare('SELECT * FROM professeur WHERE id = ?').get(prof_id);
  if (!prof) return res.status(404).json({ error: 'Professeur introuvable' });

  try {
    const docx = await genererContrat({
      prof_nom:    prof.nom    || '',
      prof_prenom: prof.prenom || '',
      date_contrat: date_contrat || new Date().toISOString().split('T')[0],
      representant: representant || 'Charles Sohet, Directeur a.i.',
    });

    const filename = `Contrat_${prof.nom}_${prof.prenom}_${date_contrat || 'draft'}.docx`
      .replace(/[^a-zA-Z0-9_.-]/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docx);
  } catch (err) {
    console.error('[contrats] génération :', err);
    res.status(500).json({ error: err.message });
  }
});

export default r;

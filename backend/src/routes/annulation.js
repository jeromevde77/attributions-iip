// Lucie — l'« Annuler » général (3.1.270) : voir lib/annulation.js.
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { gestes, annulerGeste, PROFONDEUR } from '../lib/annulation.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];

/** Mes 10 derniers gestes — ou, pour la direction, ceux de l'équipe. */
r.get('/gestes', authRequired, (req, res) => {
  const direction = DIRECTION.includes(req.user?.role);
  const equipe = direction && req.query.equipe === '1';
  res.json({ profondeur: PROFONDEUR, direction, gestes: gestes({ parId: req.user?.id, equipe }) });
});

r.post('/gestes/:id', authRequired, (req, res) => {
  try {
    res.json(annulerGeste(Number(req.params.id), { user: req.user, direction: DIRECTION.includes(req.user?.role), motif: req.body?.motif }));
  } catch (e) {
    if (!e.statut) console.error('[annulation]', e);
    res.status(e.statut || 500).json({ error: e.statut ? e.message : `Annulation impossible : ${e.message}` });
  }
});

export default r;

// Lucie — LA DÉSINSCRIPTION (3.5.392) : aperçu, demande, confirmation, refus. Secrétariat et direction (admin, éditeur).
import { Router } from 'express';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { apercu, demander, confirmer, refuser, desinscriptionsDe } from '../lib/desinscription.js';

const r = Router();
const garde = [authRequired, roleRequired('admin', 'editeur')];
const qui = req => req.user?.nom || req.user?.email || 'Secrétariat';
const repondre = (res, x) => (x?.erreur ? res.status(x.code || 400).json({ error: x.erreur }) : res.json(x));
const annee = req => String(req.query.annee || req.body?.annee || anneeDeTravail(req) || '');
const ues = v => (Array.isArray(v) && v.length ? v.map(Number).filter(Boolean) : null);

r.get('/etudiant/:id', ...garde, (req, res) => repondre(res, { demandes: desinscriptionsDe(req.params.id) }));
r.post('/etudiant/:id/apercu', ...garde, (req, res) => {
  try { repondre(res, apercu(req.params.id, annee(req), { ues: ues(req.body?.ues), date: req.body?.date || null })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
r.post('/etudiant/:id/demande', ...garde, (req, res) => {
  try { repondre(res, demander(req.params.id, annee(req), { ues: ues(req.body?.ues), motif: req.body?.motif, date: req.body?.date || null, source: 'ecole', par: qui(req) })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
r.post('/:id/confirmer', ...garde, (req, res) => {
  try { repondre(res, confirmer(req.params.id, qui(req))); } catch (e) { res.status(500).json({ error: e.message }); }
});
r.post('/:id/refuser', ...garde, (req, res) => repondre(res, refuser(req.params.id, qui(req), req.body?.motif)));

export default r;

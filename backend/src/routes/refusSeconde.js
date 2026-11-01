/** Les refus en seconde session et le PAE (3.5.029) : la liste, l'aperçu, « Retirer et prévenir », « Sans suite ». */
import { Router } from 'express';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { liste, apercu, traiter, sansSuite, remboursementsAFaire } from '../lib/refusSeconde.js';

const r = Router();
const AGIT = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];
const LIT = [...AGIT, 'coordination'];
const lit = (req, res, next) => (LIT.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Réservé au secrétariat, à la coordination et à la direction.' }));
const agit = (req, res, next) => (AGIT.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Le secrétariat et la direction retirent et préviennent.' }));
const sectionsDe = req => (req.user?.role === 'coordination' ? (getUserSections(req.user) || []) : null);
const nom = req => req.user?.nom_complet || req.user?.email || 'Lucie';

r.get('/', authRequired, lit, (req, res) => res.json(liste(sectionsDe(req))));
r.get('/etudiant/:id/remboursements', authRequired, lit, (req, res) => res.json(remboursementsAFaire(req.params.id)));
r.post('/:id/apercu', authRequired, lit, (req, res) => {
  const a = apercu(req.params.id, Array.isArray(req.body?.ues) ? req.body.ues : null);
  if (a.erreur) return res.status(a.code || 400).json({ error: a.erreur });
  const s = sectionsDe(req);
  if (s && !s.includes(liste(null).find(x => x.id === Number(req.params.id))?.section)) return res.status(404).json({ error: 'Dossier introuvable.' });
  res.json(a);
});
r.post('/:id/traiter', authRequired, agit, async (req, res) => {
  try {
    const t = await traiter(req.params.id, req.user, nom(req), Array.isArray(req.body?.ues) ? req.body.ues : null);
    if (t.erreur) return res.status(t.code || 400).json({ error: t.erreur });
    res.json(t);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.post('/:id/sans-suite', authRequired, agit, (req, res) => {
  const t = sansSuite(req.params.id, nom(req), req.body?.motif);
  if (t.erreur) return res.status(t.code || 400).json({ error: t.erreur });
  res.json(t);
});
export default r;

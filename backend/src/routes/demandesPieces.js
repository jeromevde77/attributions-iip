/* (CS) Les demandes de pièces des étudiants (3.5.645) : la liste et le traitement, secrétariat et direction. */
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import * as D from '../lib/demandesPieces.js';

const r = Router();
const admin = (req, res, next) => (D.ADMIN.includes(String(req.user?.role)) ? next() : res.status(403).json({ error: 'Réservé au secrétariat et à la direction.' }));
const qui = req => req.user?.nom || req.user?.email || '?';
r.get('/', authRequired, admin, (req, res) => res.json(D.demandes({ statut: req.query.statut || null })));
r.put('/:id', authRequired, admin, (req, res) => {
  const x = D.traiter(req.params.id, { statut: req.body?.statut, reponse: req.body?.reponse }, qui(req));
  if (x.erreur) return res.status(400).json({ error: x.erreur });
  import('../lib/portailSync.js').then(m => m.deposerBientot?.(x.etudiant_id)).catch(() => {});
  res.json({ ok: true });
});
export default r;

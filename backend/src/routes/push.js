/* (CS) LES NOTIFICATIONS SUR LE TÉLÉPHONE — LES PORTES (3.5.767). Mon compte → « Notifications sur ce téléphone » : la clé
   publique de Lucie, s'abonner, se désabonner, ses appareils, un essai (vers ses seuls téléphones). Chacun pour lui-même. */
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { clesVapid } from '../lib/pushWeb.js';
import { abonner, desabonner, abonnementsDe, pousserAuCompte } from '../lib/pushNotifs.js';

const r = Router();
r.get('/cle', authRequired, (req, res) => res.json({ cle: clesVapid().public }));
r.get('/appareils', authRequired, (req, res) => res.json(abonnementsDe(req.user.id)));
r.post('/abonner', authRequired, (req, res) => {
  try { abonner(req.user.id, req.body?.abonnement, req.body?.appareil || req.headers['user-agent']); res.json({ ok: true }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
r.post('/desabonner', authRequired, (req, res) => res.json({ ok: true, retires: desabonner(req.user.id, req.body?.endpoint) }));
r.post('/essai', authRequired, async (req, res) => {
  const n = await pousserAuCompte(req.user.id, { titre: 'Lucie', corps: 'Les notifications arrivent bien sur ce téléphone.', lien: '/', tag: 'essai' });
  res.json({ ok: n > 0, telephones: n });
});
export default r;

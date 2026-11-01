/** Configuration → Fonctions (3.5.001) : lire et régler l'état de chaque fonction ; savoir ce qui vaut pour moi. */
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { reglagesFonctions, reglerFonctions, fonctionPour, CATALOGUE } from '../lib/fonctions.js';
import { deposerBientot } from '../lib/portailSync.js';
import { deposerHistorique } from '../lib/depotHistorique.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const direction = (req, res, next) => (DIRECTION.includes(req.user?.role) ? next()
  : res.status(403).json({ error: 'Réservé à la direction.' }));

// Ce qui vaut pour le compte connecté (l'écran cache ce qui est éteint pour lui).
r.get('/moi', authRequired, (req, res) => {
  res.json(Object.fromEntries(CATALOGUE.filter(c => c.famille === 'personnel').map(c => [c.cle, fonctionPour(c.cle, { userId: req.user.id })])));
});
r.get('/', authRequired, direction, (req, res) => res.json(reglagesFonctions()));
r.put('/', authRequired, direction, (req, res) => {
  const n = reglerFonctions(req.body || {});
  deposerBientot();   // l'espace suit dans les dix secondes
  res.json(n);
});
// LES ANNÉES PASSÉES DANS LES ESPACES (3.5.027) : compter d'abord, puis déposer. Aucun courriel.
r.get('/historique', authRequired, direction, (req, res) => {
  try { res.json(deposerHistorique({ ecrire: false })); } catch (e) { res.status(500).json({ error: e.message }); }
});
r.post('/historique', authRequired, direction, (req, res) => {
  try {
    const b = deposerHistorique({ ecrire: true, par: `${req.user?.nom_complet || 'Direction'} (années passées)` });
    deposerBientot();
    res.json(b);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
export default r;

/** Configuration → Fonctions (3.5.001) : lire et régler l'état de chaque fonction ; savoir ce qui vaut pour moi. */
import { Router } from 'express';
import { lireBascule, ecrireBascule, URL_ESPACE } from '../lib/bascule.js';
import { authRequired } from '../middleware/auth.js';
import { litLaConfiguration } from '../middleware/permissions.js';
import { reglagesFonctions, reglerFonctions, fonctionPour, CATALOGUE } from '../lib/fonctions.js';
import { deposerBientot, portailActif } from '../lib/portailSync.js';
import db from '../db/index.js';
import { deposerHistorique } from '../lib/depotHistorique.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
// La lecture de la configuration (3.5.030) voit la Mise en service sans la changer.
const direction = (req, res, next) => (DIRECTION.includes(req.user?.role) || (req.method === 'GET' && litLaConfiguration(req.user)) ? next()
  : res.status(403).json({ error: 'Réservé à la direction.' }));

// Ce qui vaut pour le compte connecté (l'écran cache ce qui est éteint pour lui).
r.get('/moi', authRequired, (req, res) => {
  const f = Object.fromEntries(CATALOGUE.filter(c => c.famille === 'personnel').map(c => [c.cle, fonctionPour(c.cle, { userId: req.user.id })]));
  /* LE PONT VERS L'ESPACE ENSEIGNANT (3.5.078, Charles : « s'il détecte que c'est un prof, qu'il le redirige vers son espace
     et explique ») : l'adresse n'est donnée que si l'espace lui est ouvert, que son compte est relié à une fiche de
     professeur et que le portail est installé — sinon, rien ne s'affiche. */
  const relie = !!db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(req.user.id)?.professeur_id;
  if (f['enseignant.espace'] && relie && portailActif()) {
    f.espace_enseignant_url = (process.env.ENSEIGNANTS_URL_PUBLIQUE || 'https://enseignants.lucie-iip.be').replace(/\/$/, '');
    // La date de la bascule (3.5.212), pour que la fenêtre d'annonce la dise (3.5.247).
    f.bascule_le = lireBascule()?.date || null;
  }
  res.json(f);
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
// LA BASCULE DES PROFESSEURS (3.5.212) : la date à partir de laquelle le rôle « professeur » n'entre plus dans Lucie.
r.get('/bascule', authRequired, direction, (req, res) => {
  const etat = reglagesFonctions().etats?.['enseignant.espace'] || 'eteinte';
  const n = db.prepare(`SELECT COUNT(*) n FROM utilisateur WHERE role = 'professeur' AND COALESCE(actif, 1) = 1`).get().n;
  const relies = db.prepare(`SELECT COUNT(*) n FROM utilisateur WHERE role = 'professeur' AND COALESCE(actif, 1) = 1 AND professeur_id IS NOT NULL`).get().n;
  res.json({ bascule: lireBascule(), espace: etat, url: URL_ESPACE(), professeurs: n, relies });
});
r.put('/bascule', authRequired, direction, (req, res) => {
  const date = req.body?.date || null;
  if (date && (reglagesFonctions().etats?.['enseignant.espace'] || 'eteinte') !== 'allumee') {
    return res.status(409).json({ error: 'L’espace enseignant doit d’abord être allumé pour tous (Mise en service → « L’espace enseignant ») : sinon des professeurs perdraient toute porte.' });
  }
  try { res.json({ bascule: ecrireBascule(date, req.user?.nom || req.user?.email || null) }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
export default r;

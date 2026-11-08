// Les prestations mensuelles des experts (3.5.241) — métier : lib/prestationsExperts.js.
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { estExpert, moisDeLExpert, declarer, decider, tableauDuMois, declarationDe, MOIS, anneeCivile, delaiDuMois } from '../lib/prestationsExperts.js';

const r = Router();
const GERENT = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];
const profDuCompte = id => db.prepare('SELECT professeur_id FROM utilisateur WHERE id = ?').get(id)?.professeur_id || null;
const auteur = u => u?.nom_complet || u?.nom || u?.email || null;
const moisDeLAnnee = () => [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];
const moisCourant = () => Number(new Date().toISOString().slice(5, 7));
const faute = (res, e) => res.status(e.status || 500).json({ error: e.message });

// L'expert : ses mois, et celui qu'il ouvre.
r.get('/moi', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const profId = profDuCompte(req.user.id);
  if (!profId) return res.json({ annee, relie: false, expert: false });
  if (!estExpert(profId, annee)) return res.json({ annee, relie: true, expert: false });
  const mois = Number(req.query.mois) || moisCourant();
  res.json({ annee, relie: true, expert: true,
    mois_liste: moisDeLAnnee().map(m => ({ mois: m, libelle: `${MOIS[m]} ${anneeCivile(annee, m)}`, delai: delaiDuMois(annee, m), statut: declarationDe(profId, annee, m)?.statut || null })),
    ...moisDeLExpert(profId, annee, mois) });
});
r.post('/moi', authRequired, (req, res) => {
  const profId = profDuCompte(req.user.id);
  if (!profId) return res.status(403).json({ error: 'Votre compte n’est relié à aucune fiche d’enseignant.' });
  try { res.json({ ok: true, declaration: declarer(profId, anneeDeTravail(req), req.body?.mois, req.body || {}, auteur(req.user)) }); }
  catch (e) { faute(res, e); }
});

// Le secrétariat : les experts du mois, et la décision.
r.get('/', authRequired, (req, res) => {
  if (!GERENT.includes(req.user?.role)) return res.status(403).json({ error: 'Réservé au secrétariat et à la direction.' });
  const annee = anneeDeTravail(req);
  const mois = Number(req.query.mois) || moisCourant();
  res.json({ annee, mois, libelle: `${MOIS[mois]} ${anneeCivile(annee, mois)}`, delai: delaiDuMois(annee, mois),
    mois_liste: moisDeLAnnee().map(m => ({ mois: m, libelle: `${MOIS[m]} ${anneeCivile(annee, m)}` })), experts: tableauDuMois(annee, mois) });
});
r.post('/:id/decider', authRequired, (req, res) => {
  if (!GERENT.includes(req.user?.role)) return res.status(403).json({ error: 'Réservé au secrétariat et à la direction.' });
  try { res.json(decider(req.params.id, { valider: !!req.body?.valider, mot: req.body?.mot }, auteur(req.user))); }
  catch (e) { faute(res, e); }
});

export default r;

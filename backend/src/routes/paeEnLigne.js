/**
 * LE PAE EN LIGNE, CÔTÉ ÉCOLE (3.1.515) : la fenêtre (direction) et les propositions des étudiants (coordination,
 * secrétariat, direction — le geste « composer le PAE », sur leur périmètre). Le métier : lib/paeEnLigne.js.
 */
import { Router } from 'express';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { gesteRequis } from '../lib/gestes.js';
import { sectionPropre } from './etudiants.js';
import { reglagePAE, reglerPAE, propositions, reprendre, traiter, migrerPaeEnLigne } from '../lib/paeEnLigne.js';
import { nomEcranDuCompte } from '../lib/nom.js';
import db from '../db/index.js';
import { deposerBientot } from '../lib/portailSync.js';

const r = Router();
const qui = req => nomEcranDuCompte(req.user?.nom, req.user?.email) || req.user?.email || '?';

r.get('/reglage', authRequired, (req, res) => res.json(reglagePAE()));
// La fenêtre se règle par la direction seule.
r.put('/reglage', authRequired, roleRequired('admin'), (req, res) => {
  const x = reglerPAE(req.body || {});
  res.status(x.erreur ? 400 : 200).json(x.erreur ? { error: x.erreur } : x);
});

r.get('/propositions', authRequired, gesteRequis('etudiants.pae_composer'), (req, res) => {
  const annee = String(req.query.annee || reglagePAE().annee || '');
  if (!annee) return res.json({ annee: null, propositions: [] });
  res.json({ annee, propositions: propositions(annee, getUserSections(req.user), sectionPropre) });
});

/* Le périmètre se pose sur chaque porte : une proposition hors de ses sections n'existe pas (404). */
function permise(req, res) {
  migrerPaeEnLigne();
  const p = db.prepare('SELECT etudiant_id FROM pae_proposition WHERE id = ?').get(Number(req.params.id));
  const s = getUserSections(req.user);
  if (!p || (s && !s.includes(sectionPropre(p.etudiant_id)))) { res.status(404).json({ error: 'Proposition introuvable.' }); return false; }
  return true;
}
r.post('/propositions/:id/reprendre', authRequired, gesteRequis('etudiants.pae_composer'), (req, res) => {
  if (!permise(req, res)) return;
  const x = reprendre(req.params.id, qui(req));
  if (!x.erreur) deposerBientot();   // l'étudiant le voit dans les secondes qui suivent
  res.status(x.erreur ? x.code || 400 : 200).json(x.erreur ? { error: x.erreur, refus: x.refus } : x);
});
r.post('/propositions/:id/traiter', authRequired, gesteRequis('etudiants.pae_composer'), (req, res) => {
  if (!permise(req, res)) return;
  const x = traiter(req.params.id, String(req.body?.statut || ''), req.body?.message, qui(req));
  if (!x.erreur) deposerBientot();
  res.status(x.erreur ? x.code || 400 : 200).json(x.erreur ? { error: x.erreur } : x);
});

export default r;

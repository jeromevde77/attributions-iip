/** (CS)
 * LES INVITATIONS TEAMS (3.5.667) — /api/teams. Réglage : la direction. Inviter : la direction et le secrétariat, quand la
 * fonction « teams.invitations » est ouverte pour leur compte (Configuration → Accès → Mise en service). Simulation d'abord.
 */
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { litLaConfiguration } from '../middleware/permissions.js';
import { fonctionPour } from '../lib/fonctions.js';
import { lireReglage, ecrireReglage, pretAInviter, inviter, annuler, etat, tester, migrerTeams } from '../lib/invitationsTeams.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const INVITENT = [...DIRECTION, 'secretariat', 'editeur'];
const qui = req => req.user?.nom || req.user?.email || `compte ${req.user?.id}`;
const repondre = (res, e) => res.status(e.status || 500).json({ error: e.message || 'Erreur.' });

const direction = (req, res, next) => (DIRECTION.includes(req.user?.role) || (req.method === 'GET' && litLaConfiguration(req.user)) ? next()
  : res.status(403).json({ error: 'Réservé à la direction.' }));
const invite = (req, res, next) => {
  if (!INVITENT.includes(req.user?.role)) return res.status(403).json({ error: 'Réservé à la direction et au secrétariat.' });
  if (!fonctionPour('teams.invitations', { userId: req.user.id })) {
    return res.status(403).json({ error: 'Les invitations Teams ne sont pas ouvertes (Configuration → Accès → Mise en service).' });
  }
  next();
};

try { migrerTeams(); } catch (e) { console.error('[migration] teams_invitation :', e.message); }

// Ce que l'écran doit savoir pour griser le bouton et dire pourquoi.
r.get('/disponible', authRequired, (req, res) => {
  // Pas de droit, pas de bouton : `autorise` faux cache le bouton ; `pret` faux le grise, avec la raison.
  if (!INVITENT.includes(req.user?.role)) return res.json({ autorise: false, pret: false });
  if (!fonctionPour('teams.invitations', { userId: req.user.id })) {
    return res.json({ autorise: true, pret: false, ouverte: false, raison: 'Les invitations Teams ne sont pas ouvertes (Configuration → Accès → Mise en service).' });
  }
  res.json({ autorise: true, ouverte: true, ...pretAInviter() });
});

r.get('/reglage', authRequired, direction, (req, res) => res.json({ ...lireReglage(), ...pretAInviter(),
  fonction: fonctionPour('teams.invitations', { userId: req.user.id }) }));
r.put('/reglage', authRequired, direction, (req, res) => {
  try { res.json(ecrireReglage(req.body || {})); } catch (e) { repondre(res, e); }
});
r.post('/tester', authRequired, direction, async (req, res) => {
  try { res.json(await tester()); } catch (e) { repondre(res, e); }
});

// Ce qui a déjà été invité pour une année (et ce qui est à revoir : date changée, date disparue).
r.get('/etat', authRequired, invite, (req, res) => {
  const annee = String(req.query.annee || '');
  if (!/^\d{4}-\d{4}$/.test(annee)) return res.status(400).json({ error: 'Année attendue (AAAA-AAAA).' });
  res.json(etat(annee));
});

/* Inviter. Corps : { type: 'deliberation', id } ou { type: 'examen', annee, session, ue_num, cours_code } ou
   { type: 'examen', passage_id } ; `ecrire: true` pour créer ou mettre à jour — sinon simulation. */
r.post('/inviter', authRequired, invite, async (req, res) => {
  const b = req.body || {};
  try { res.json(await inviter(b, { simulation: b.ecrire !== true, par: qui(req) })); } catch (e) { repondre(res, e); }
});

// Annuler la réunion d'une date (disparue de Lucie, ou sur demande).
r.post('/annuler', authRequired, invite, async (req, res) => {
  const { cle, motif } = req.body || {};
  if (!cle) return res.status(400).json({ error: 'Clé de la date attendue.' });
  try { res.json(await annuler(String(cle), { par: qui(req), motif })); } catch (e) { repondre(res, e); }
});

export default r;

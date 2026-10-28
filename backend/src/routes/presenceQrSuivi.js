/**
 * LE SUIVI DE LA PRÉSENCE PAR QR, CÔTÉ SECRÉTARIAT (lot 4, 28 octobre 2026).
 *
 * Les téléphones liés, le journal, les deux gestes du secrétariat — désactiver
 * un téléphone, autoriser un nouveau téléphone au-delà de la limite de la
 * semaine —, et les réglages. Direction et secrétariat (« éditeur ») lisent et
 * agissent ; les réglages se changent à la direction. Tout geste se motive et
 * s'écrit au journal en ajout seul, au nom de la personne connectée.
 */
import { Router } from 'express';
import { authRequired, roleRequired } from '../middleware/auth.js';
import {
  suiviAppareils, journalSuivi, revoquerAppareil, autoriserAppareil, reglagesPresenceQr,
  ecrireReglagesPresenceQr, BORNES_REGLAGES, TYPES_JOURNAL, REGLAGES_DEFAUT, secretDisponible,
} from '../lib/presenceQr.js';

const r = Router();
const qui = req => req.user?.nom_complet || req.user?.nom || req.user?.email || 'inconnu';
const EDITEUR = roleRequired('admin', 'editeur');

r.get('/appareils', authRequired, EDITEUR, (req, res) => {
  try { res.json({ appareils: suiviAppareils({ q: req.query.q, tous: req.query.tous === '1' }) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/appareils/:id/desactiver', authRequired, EDITEUR, (req, res) => {
  const x = revoquerAppareil(req.params.id, qui(req), req.body?.motif);
  if (x.erreur) return res.status(x.erreur === 'introuvable' ? 404 : 400).json({ error: x.message });
  res.json(x);
});

r.post('/etudiants/:id/autoriser', authRequired, EDITEUR, (req, res) => {
  const x = autoriserAppareil(req.params.id, qui(req), req.body?.motif);
  if (x.erreur) return res.status(x.erreur === 'introuvable' ? 404 : 400).json({ error: x.message });
  res.json(x);
});

r.get('/journal', authRequired, EDITEUR, (req, res) => {
  try {
    res.json({ types: TYPES_JOURNAL,
      journal: journalSuivi({ etudiant_id: req.query.etudiant, type: req.query.type, limite: req.query.limite }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/reglages', authRequired, EDITEUR, (req, res) => {
  res.json({ reglages: reglagesPresenceQr(), defauts: REGLAGES_DEFAUT, bornes: BORNES_REGLAGES, secret: secretDisponible() });
});

r.put('/reglages', authRequired, roleRequired('admin'), (req, res) => {
  const x = ecrireReglagesPresenceQr(req.body || {});
  if (x.erreur) return res.status(400).json({ error: x.message });
  res.json(x);
});

export default r;

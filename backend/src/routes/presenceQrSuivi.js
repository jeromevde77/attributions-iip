/**
 * LE SUIVI DE LA PRÉSENCE PAR QR, CÔTÉ SECRÉTARIAT (lot 4, 28 octobre 2026).
 *
 * Les téléphones liés, le journal, les deux gestes du secrétariat — désactiver
 * un téléphone, autoriser un nouveau téléphone au-delà de la limite de la
 * semaine —, et les réglages. Direction et secrétariat (« éditeur ») lisent et
 * agissent ; les réglages se changent à la direction. Tout geste se motive et
 * s'écrit au journal en ajout seul, au nom de la personne connectée.
 *
 * LA COORDINATION LIT, SUR SES SECTIONS (Charles, 28 octobre 2026) : les
 * absences au-delà du seuil, le texte de l'avis, les téléphones et le journal
 * des étudiants de son périmètre. Les gestes — désactiver, autoriser, envoyer
 * l'avis — restent au secrétariat et à la direction.
 */
import { Router } from 'express';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import {
  suiviAppareils, journalSuivi, revoquerAppareil, autoriserAppareil, reglagesPresenceQr,
  ecrireReglagesPresenceQr, BORNES_REGLAGES, TYPES_JOURNAL, REGLAGES_DEFAUT, secretDisponible,
} from '../lib/presenceQr.js';
import { alertesAbsences, avisAbsence, envoyerAvisAbsence } from '../lib/alertesAbsences.js';
import { sectionPropre } from './etudiants.js';
import { envoyerEmail } from '../services/mailer.js';
import { anneeDeTravail } from '../helpers/annee.js';

const r = Router();
const qui = req => req.user?.nom_complet || req.user?.nom || req.user?.email || 'inconnu';
const EDITEUR = roleRequired('admin', 'editeur');
const LECTEUR = roleRequired('admin', 'editeur', 'coordination');
/* Le périmètre d'une coordination : la section de l'ÉTUDIANT (rattachement, ou
   déduction de Lucie), jamais celle de ses UE — la règle de la fiche. null = tous. */
const permisDe = req => {
  const perim = getUserSections(req.user);
  if (!perim) return null;
  return id => { const s = id ? sectionPropre(id) : null; return !!s && perim.includes(s); };
};

r.get('/appareils', authRequired, LECTEUR, (req, res) => {
  try {
    const permis = permisDe(req);
    res.json({ appareils: suiviAppareils({ q: req.query.q, tous: req.query.tous === '1' })
      .filter(a => !permis || permis(a.etudiant_id)) });
  }
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

r.get('/journal', authRequired, LECTEUR, (req, res) => {
  try {
    const permis = permisDe(req);
    res.json({ types: TYPES_JOURNAL,
      journal: journalSuivi({ etudiant_id: req.query.etudiant, type: req.query.type, limite: req.query.limite })
        .filter(j => !permis || permis(j.etudiant_id)) });
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

/* LES ABSENCES AU-DELÀ DU SEUIL, et l'avis à l'étudiant : on lit le texte
   (`/alertes/avis`, GET), puis on l'envoie (POST). Jamais d'envoi automatique. */
r.get('/alertes', authRequired, LECTEUR, (req, res) => {
  try { res.json(alertesAbsences(String(req.query.annee || anneeDeTravail(req)), { permis: permisDe(req) })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/alertes/avis', authRequired, LECTEUR, (req, res) => {
  const permis = permisDe(req);
  if (permis && !permis(Number(req.query.etudiant))) return res.status(404).json({ error: 'Étudiant introuvable.' });
  const a = avisAbsence(req.query.etudiant, req.query.ue, String(req.query.annee || anneeDeTravail(req)));
  if (a.erreur) return res.status(a.erreur === 'introuvable' ? 404 : 400).json({ error: a.message });
  res.json({ to: a.to, subject: a.subject, text: a.text, mention_manquante: a.mention_manquante });
});

r.post('/alertes/avis', authRequired, EDITEUR, async (req, res) => {
  try {
    const a = await envoyerAvisAbsence(req.body?.etudiant, req.body?.ue, String(req.body?.annee || anneeDeTravail(req)), qui(req), envoyerEmail);
    if (a.erreur) return res.status(a.erreur === 'introuvable' ? 404 : 400).json({ error: a.message });
    res.json(a);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default r;

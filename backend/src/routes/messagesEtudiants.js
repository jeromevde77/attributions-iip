/**
 * LES MESSAGES AUX ÉTUDIANTS, CÔTÉ ÉCOLE (3.1.516). Le métier et les droits : lib/messagesEtudiants.js.
 * Secrétariat et direction : à tous ; coordination : ses sections ; enseignants : les inscrits de leurs UE.
 * Chacun lit ses messages et les réponses qu'ils reçoivent ; la direction lit tout.
 */
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { nomEcranDuCompte } from '../lib/nom.js';
import { deposerBientot } from '../lib/portailSync.js';
import { migrerMessages, peutEcrire, perimetre, resoudre, resume, envoyer, envoyes, detail, messageVisible,
  marquerReponsesLues, repondre, retirer } from '../lib/messagesEtudiants.js';

const r = Router();
const qui = req => nomEcranDuCompte(req.user?.nom, req.user?.email) || req.user?.email || '?';
const garde = (req, res) => { if (peutEcrire(req.user)) return true; res.status(403).json({ error: 'Réservé à la direction, au secrétariat, aux coordinations et aux enseignants.' }); return false; };

r.get('/cibles', authRequired, (req, res) => {
  if (!garde(req, res)) return;
  const annee = anneeDeTravail(req);
  const p = perimetre(req.user, annee);
  res.json({ annee, sections: p.sections, ues: p.ues, tous: !p.etudiants });
});
/** Chercher un étudiant à qui écrire, dans son périmètre. */
r.get('/etudiants', authRequired, (req, res) => {
  if (!garde(req, res)) return;
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json([]);
  const p = perimetre(req.user, anneeDeTravail(req));
  const l = db.prepare(`SELECT id, nom, prenom, id_ecampus FROM etudiant WHERE COALESCE(actif, 1) = 1 AND COALESCE(sortie_statut, '') <> 'archive'
    AND (lower(nom) LIKE ? OR lower(prenom) LIKE ? OR id_ecampus LIKE ?) ORDER BY nom, prenom LIMIT 40`).all(`%${q}%`, `%${q}%`, `%${q}%`)
    .filter(e => !p.etudiants || p.etudiants.has(e.id)).slice(0, 20);
  res.json(l.map(e => ({ id: e.id, nom: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(), matricule: e.id_ecampus })));
});
r.post('/apercu', authRequired, (req, res) => {
  if (!garde(req, res)) return;
  const d = resoudre(req.body?.critere, req.user, anneeDeTravail(req));
  res.json({ destinataires: d, nb: d.filter(x => x.espace).length, sans_espace: d.filter(x => !x.espace).length, resume: resume(req.body?.critere || {}) });
});
r.post('/', authRequired, (req, res) => {
  if (!garde(req, res)) return;
  const x = envoyer(req.body || {}, req.user, qui(req), anneeDeTravail(req));
  if (!x.erreur) deposerBientot();
  res.status(x.erreur ? 400 : 200).json(x.erreur ? { error: x.erreur } : x);
});
r.get('/', authRequired, (req, res) => { if (!garde(req, res)) return; res.json(envoyes(req.user)); });

const visible = (req, res) => {
  migrerMessages();
  const m = db.prepare('SELECT * FROM message_etudiant WHERE id = ?').get(Number(req.params.id));
  if (!messageVisible(m, req.user)) { res.status(404).json({ error: 'Message introuvable.' }); return null; }
  return m;
};
r.get('/:id', authRequired, (req, res) => {
  const m = visible(req, res); if (!m) return;
  const d = detail(m.id);
  if (m.auteur_id === req.user?.id) marquerReponsesLues(m.id);   // l'auteur a lu les réponses
  res.json(d);
});
r.post('/:id/repondre', authRequired, (req, res) => {
  const m = visible(req, res); if (!m) return;
  const x = repondre(m.id, req.body?.etudiant_id, req.body?.corps, qui(req));
  if (!x.erreur) deposerBientot();
  res.status(x.erreur ? 400 : 200).json(x.erreur ? { error: x.erreur } : x);
});
r.post('/:id/retirer', authRequired, (req, res) => {
  const m = visible(req, res); if (!m) return;
  const x = retirer(m.id, qui(req));
  if (!x.erreur) deposerBientot();
  res.status(x.erreur ? 409 : 200).json(x.erreur ? { error: x.erreur } : x);
});

export default r;
